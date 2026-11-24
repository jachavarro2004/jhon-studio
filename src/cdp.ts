/**
 * src/cdp.ts — a headless Chrome driven over the Chrome DevTools Protocol, with Node's own
 * WebSocket: no npm dependency and no browser download. It runs the chrome-headless-shell the
 * HyperFrames CLI keeps (or $JHON_STUDIO_CHROME) with a throwaway profile, opens one page at a
 * viewport, runs a screen's steps on it and captures it as a PNG.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Step } from "./config.ts";

/** Seconds a page, a selector or one protocol call may take. */
const TIMEOUT = 30;

export class PageError extends Error {}

/** What Chrome takes to start without its own sandbox (as HyperFrames and Puppeteer do). */
export const NO_SANDBOX_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--no-zygote"];
/** How Chrome says its sandbox cannot start (no user namespaces: inside another sandbox, or as root). */
const SANDBOX_FAILURE = /No usable sandbox|Running as root without --no-sandbox|Failed to move to new namespace/;
/** The fix for that failure: the setting (or its environment override) that opts out of Chrome's sandbox. */
export const NO_SANDBOX_FIX = "set capture.chrome_no_sandbox: true in the project's .jhon/studio.yaml (or JHON_STUDIO_CHROME_NO_SANDBOX=1) to start Chrome without its own sandbox, inside a sandbox that allows it none (such as Jhon's)";

/**
 * Chrome's last words before it died, as a reason: its sandbox failure named with the fix, else
 * the last line it wrote (or "" when it wrote none).
 */
export function chromeDeath(stderr: string): string {
  const m = stderr.match(SANDBOX_FAILURE);
  if (m) return `Chrome could not start its sandbox ("${m[0] === "No usable sandbox" ? "No usable sandbox!" : m[0]}"): ${NO_SANDBOX_FIX}`;
  return stderr.trim().split("\n").filter((l) => !/^\[[\d/.]+:(WARNING|INFO|VERBOSE)/.test(l)).at(-1) ?? "";
}

/** How the studio starts Chrome: `noSandbox` (src/config.ts chromeNoSandbox), and the folder it runs in. */
export interface LaunchOptions { noSandbox?: boolean; cwd?: string }

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
function within<T>(p: Promise<T>, s: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, no) => { timer = setTimeout(() => no(new PageError(`${what} took more than ${s} s`)), s * 1000); })]).finally(() => clearTimeout(timer));
}

/** A browser: one Chrome process and its protocol connection. */
export class Browser {
  private ws!: WebSocket;
  private proc!: ChildProcess;
  private profile = "";
  private next = 0;
  private calls = new Map<number, { ok: (v: any) => void; no: (e: Error) => void; method: string }>();
  private waiters: { method: string; session?: string; ok: (v: any) => void }[] = [];

  /** Starts Chrome and connects to it. */
  static async launch(chrome: string, opts: LaunchOptions = {}): Promise<Browser> {
    const b = new Browser();
    b.profile = mkdtempSync(join(tmpdir(), "jhon-studio-chrome-"));
    b.proc = spawn(chrome, [
      "--headless", ...(opts.noSandbox ? NO_SANDBOX_ARGS : []), "--remote-debugging-port=0", `--user-data-dir=${b.profile}`, "--no-first-run", "--no-default-browser-check",
      "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--disable-extensions", "--disable-background-networking",
      "--disable-component-update", "--disable-sync", "--force-color-profile=srgb", "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"], ...(opts.cwd ? { cwd: opts.cwd } : {}) });
    const url = await within(new Promise<string>((ok, no) => {
      let err = "";
      b.proc.on("error", (e) => no(new PageError(`${chrome} did not start: ${e.message}`)));
      b.proc.on("exit", (code, signal) => {
        const why = chromeDeath(err);
        no(new PageError(why.startsWith("Chrome could not start its sandbox") ? why : `${chrome} exited (${code ?? signal}) before it listened:\n${err.trim().split("\n").slice(-5).join("\n")}`));
      });
      b.proc.stderr!.on("data", (d: Buffer) => {
        err += d.toString();
        const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) ok(m[1]!);
      });
    }), TIMEOUT, "starting Chrome").catch(async (e) => { await b.close(); throw e; });
    b.ws = new WebSocket(url);
    await within(new Promise<void>((ok, no) => {
      b.ws.addEventListener("open", () => ok(), { once: true });
      b.ws.addEventListener("error", () => no(new PageError(`could not connect to Chrome at ${url}`)), { once: true });
    }), TIMEOUT, "connecting to Chrome").catch(async (e) => { await b.close(); throw e; });
    b.ws.addEventListener("message", (ev) => b.receive(JSON.parse(String(ev.data))));
    return b;
  }

  private receive(msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string }; sessionId?: string }) {
    if (msg.id !== undefined) {
      const c = this.calls.get(msg.id);
      if (!c) return;
      this.calls.delete(msg.id);
      if (msg.error) c.no(new PageError(`${c.method}: ${msg.error.message}`));
      else c.ok(msg.result);
      return;
    }
    for (const w of [...this.waiters]) {
      if (w.method === msg.method && (w.session === undefined || w.session === msg.sessionId)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.ok(msg.params);
      }
    }
  }

  /** One protocol call. */
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.next;
    const p = new Promise((ok, no) => this.calls.set(id, { ok, no, method }));
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return within(p, TIMEOUT, method);
  }

  /** The next event of a kind (registered before the call that causes it). */
  event(method: string, sessionId?: string): Promise<any> {
    return new Promise((ok) => this.waiters.push({ method, session: sessionId, ok }));
  }

  /** A new page at a viewport. */
  async page(width: number, height: number, scale: number): Promise<Page> {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(this, sessionId);
    await page.call("Page.enable");
    await page.call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    return page;
  }

  async close(): Promise<void> {
    try { if (this.ws?.readyState === WebSocket.OPEN) { await Promise.race([this.send("Browser.close"), sleep(2000)]).catch(() => {}); this.ws.close(); } } catch { /* closing */ }
    if (this.proc && this.proc.exitCode === null) {
      const gone = new Promise((ok) => this.proc.once("exit", ok));
      this.proc.kill("SIGKILL");
      await Promise.race([gone, sleep(3000)]);
    }
    if (this.profile) rmSync(this.profile, { recursive: true, force: true });
  }
}

/** One page of the browser. */
export class Page {
  private b: Browser;
  private session: string;
  constructor(b: Browser, session: string) {
    this.b = b;
    this.session = session;
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return this.b.send(method, params, this.session);
  }

  /** A JavaScript expression's value in the page (promises awaited). */
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new PageError(r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text);
    return r.result.value as T;
  }

  /** Loads an address and waits for its load event and its fonts. */
  async goto(url: string): Promise<void> {
    const loaded = this.b.event("Page.loadEventFired", this.session);
    const r = await this.call("Page.navigate", { url });
    if (r.errorText) throw new PageError(`${url} did not load (${r.errorText}): is it running?`);
    await within(loaded, TIMEOUT, `loading ${url}`);
    await this.settle();
  }

  /** Waits for the fonts and two frames, so what was just changed is painted. */
  async settle(): Promise<void> {
    await this.eval("document.fonts.ready.then(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))");
  }

  /** Waits until a selector matches. */
  async waitFor(selector: string): Promise<void> {
    const sel = JSON.stringify(selector);
    const end = Date.now() + TIMEOUT * 1000;
    while (!(await this.eval<boolean>(`!!document.querySelector(${sel})`))) {
      if (Date.now() > end) throw new PageError(`nothing matched ${selector} within ${TIMEOUT} s`);
      await sleep(100);
    }
  }

  /** One step of a screen. */
  async step(s: Step): Promise<void> {
    const [op, v] = Object.entries(s)[0]! as [string, unknown];
    if (op === "click") {
      await this.waitFor(v as string);
      const [x, y] = await this.eval<[number, number]>(`(() => { const e = document.querySelector(${JSON.stringify(v)}); e.scrollIntoView({ block: "center", inline: "center" }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await this.call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    } else if (op === "fill") {
      const [sel, text] = v as [string, string];
      await this.waitFor(sel);
      await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: "center" }); e.focus(); if (typeof e.select === "function") e.select(); else document.execCommand("selectAll"); })()`);
      if (text) await this.call("Input.insertText", { text });
      else await this.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    } else if (op === "wait") {
      if (typeof v === "number") await sleep(v);
      else await this.waitFor(v as string);
    } else if (op === "goto") {
      await this.goto(await this.eval<string>(`new URL(${JSON.stringify(v)}, location.href).href`));
    } else if (op === "scroll") {
      if (typeof v === "number") await this.eval(`window.scrollTo(0, ${v})`);
      else { await this.waitFor(v as string); await this.eval(`document.querySelector(${JSON.stringify(v)}).scrollIntoView({ block: "start" })`); }
    }
    await this.settle();
  }

  /** The viewport as PNG bytes. */
  async png(): Promise<Buffer> {
    const { data } = await this.call("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data, "base64");
  }
}
