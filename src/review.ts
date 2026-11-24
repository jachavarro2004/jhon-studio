/**
 * src/review.ts — look at a composed video the way the render will, in a headless Chrome
 * (src/cdp.ts), shot by shot at each shot's final state:
 *
 *   checkFit   compose's check that the text fits its frame: every element compose marks
 *              data-fit stays inside its card (data-frame) and inside the picture less its
 *              margins, above the subtitles; each one that does not is named with its shot
 *   review     `jhon-studio video review`: each shot's final state as review/<shot>.png and all
 *              of them on one contact sheet, review.png, with each shot's start and end
 *
 * The page is served from the video folder alone (a loopback HTTP server on a free port, so
 * its modules and fonts load as they do in the render) and Chrome runs in that folder, never in
 * the project's or the caller's. A shot's final state is REVIEW_BEFORE_END seconds before its
 * end: everything has landed, and the cut or the band that leaves it has not started.
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { Browser, PageError, type Page } from "./cdp.ts";
import { HYPERFRAMES, chromeNoSandbox, chromePath, type Config } from "./config.ts";
import { StudioError, writeIfChanged, type Video } from "./video.ts";

/** Seconds before a shot's end its final state is taken: its exit (a cut's 0.3 s, a band's 0.28 s) has not begun. */
export const REVIEW_BEFORE_END = 0.35;
/** The picture less its margins, above the subtitles: where every line of text must stay (as timeline.js's fit). */
const SAFE = { left: 48, top: 32, right: 1872, bottom: 930 };

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".opus": "audio/ogg", ".txt": "text/plain; charset=utf-8",
};

/** The composition's plan of a shot (src/compose.ts). */
interface PlanShot { id: string; kind: string; start: number; end: number }
interface Plan { shots: PlanShot[]; introId: string; introEnd: number; total: number }

/** A shot's times, as the review prints them. */
export interface ShotTimes { id: string; kind: string; start: number; end: number; at: number }

/** Serves the video folder (and `extra` pages by path) on 127.0.0.1; a path that leaves the folder is refused. */
async function serve(dir: string, extra: Record<string, string> = {}): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (path in extra) { res.writeHead(200, { "content-type": TYPES[".html"]! }); res.end(extra[path]); return; }
    const file = resolve(dir, "." + path);
    const rel = relative(dir, file);
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server };
}

/** The video's composition, for a check or a review: its plan, from index.html. */
function planOf(video: Video): Plan {
  const html = join(video.dir, "index.html");
  if (!existsSync(html)) throw new StudioError(`${html} does not exist: run \`jhon-studio video compose\` (or video make) first`);
  const m = readFileSync(html, "utf8").match(/window\.__plan = (.*);/);
  if (!m) throw new StudioError(`${html} is not a composition of jhon-studio's: compose it again`);
  return JSON.parse(m[1]!) as Plan;
}

/** Each shot's start and end, and the moment of its final state. */
export function shotTimes(plan: Plan): ShotTimes[] {
  return plan.shots.map((s) => {
    const end = s.id === plan.introId ? plan.introEnd : s.end;
    return { id: s.id, kind: s.kind, start: s.start, end, at: Math.round((end - REVIEW_BEFORE_END) * 1000) / 1000 };
  });
}

/** The DOM element a shot draws into: the intro is #s1, every other shot its id. */
const shotRoot = (plan: Plan, id: string) => (id === plan.introId ? "s1" : id);

/**
 * Opens the composition in Chrome (in the video folder), waits for its fonts and every buildReady
 * promise (the text fit, the seal), and gives a seek: the clips on screen at `t` shown and the
 * others hidden (as HyperFrames does), the timeline at `t`, and every hf-seek listener done.
 */
async function open(video: Video, config: Config, env: NodeJS.ProcessEnv, extra: Record<string, string> = {}) {
  const chrome = chromePath(env);
  if (!chrome || !existsSync(chrome)) return { why: `no Chrome (${chrome ? `${chrome} does not exist` : "none found"}; run npx --yes ${HYPERFRAMES} browser ensure, or set JHON_STUDIO_CHROME)` } as const;
  const { base, server } = await serve(video.dir, extra);
  let browser: Browser | null = null;
  try {
    browser = await Browser.launch(chrome, { noSandbox: chromeNoSandbox(config, env), cwd: video.dir });
    const page = await browser.page(1920, 1080, 1);
    await page.goto(`${base}/index.html`);
    await page.eval("Promise.all(Object.values((window.__hf && window.__hf.buildReady) || {})).then(() => true)");
    const seek = (t: number) => page.eval(`(async (t) => {
      for (const el of document.querySelectorAll("#root [data-start]")) {
        const s = Number(el.dataset.start), d = Number(el.dataset.duration);
        el.style.visibility = t >= s && t < s + d ? "" : "hidden";
      }
      window.__timelines.main.seek(t);
      const waits = [];
      window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: t, waitUntil: (p) => waits.push(p) } }));
      await Promise.all(waits);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      return true;
    })(${t})`);
    const close = async () => { await browser?.close(); await new Promise((ok) => server.close(ok)); };
    return { page, base, seek, close } as const;
  } catch (e) {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
    if (e instanceof PageError) throw new StudioError(e.message);
    throw e;
  }
}

/** What the fit check found: measured, each overflow (by shot) as a line; or not measured, and why. */
export type FitReport = { measured: true; problems: string[]; shots: number } | { measured: false; why: string };

/**
 * Measures every shot's text at its final state: each data-fit element's text inside its card and
 * inside the picture less its margins, above the subtitles (a pixel's tolerance).
 */
export async function checkFit(video: Video, config: Config, env: NodeJS.ProcessEnv = process.env): Promise<FitReport> {
  const plan = planOf(video);
  const o = await open(video, config, env);
  if ("why" in o) return { measured: false, why: o.why };
  const problems: string[] = [];
  const bad = new Set<string>();
  try {
    for (const s of shotTimes(plan)) {
      await o.seek(s.at);
      const found = await o.page.eval<string[]>(`((root, SAFE) => {
        const out = [];
        const sides = [["right", "right edge"], ["left", "left edge"], ["bottom", "bottom"], ["top", "top"]];
        for (const el of document.getElementById(root).querySelectorAll("[data-fit]")) {
          const r = document.createRange();
          r.selectNodeContents(el);
          const rects = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
          if (!rects.length) continue;
          const box = { left: Math.min(...rects.map((x) => x.left)), top: Math.min(...rects.map((x) => x.top)), right: Math.max(...rects.map((x) => x.right)), bottom: Math.max(...rects.map((x) => x.bottom)) };
          const card = el.parentElement.closest("[data-frame]");
          const frames = card ? [[card.dataset.frame, card.getBoundingClientRect()], ["the frame", SAFE]] : [["the frame", SAFE]];
          let worst = null;
          for (const [name, f] of frames) {
            for (const [side, word] of sides) {
              const by = side === "right" || side === "bottom" ? box[side] - f[side] : f[side] - box[side];
              if (by > 1 && (!worst || by > worst.by)) worst = { by: Math.ceil(by), where: name + "'s " + word };
            }
            if (worst) break;
          }
          if (worst) out.push(el.dataset.fit + " (#" + el.id + ") runs " + worst.by + " px past " + worst.where);
        }
        return out;
      })(${JSON.stringify(shotRoot(plan, s.id))}, ${JSON.stringify(SAFE)})`);
      for (const f of found) { problems.push(`${s.id}: ${f}`); bad.add(s.id); }
    }
  } finally {
    await o.close();
  }
  return { measured: true, problems, shots: bad.size };
}

/** The fit check's result as compose's line, or its failure. */
export function fitLine(r: FitReport): string {
  if (!r.measured) return `text fit: not measured: ${r.why}`;
  if (!r.problems.length) return "text fit: every shot fits its frame (measured in headless Chrome)";
  throw new StudioError(`the text does not fit its frame in ${r.shots} shot${r.shots === 1 ? "" : "s"} (index.html is written, to preview it):\n  ${r.problems.join("\n  ")}\nshorten that text (or split it across shots), then compose again`);
}

const fmt = (x: number) => x.toFixed(2);
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The review's table: each shot's kind, start, end and the moment of its frame. */
export function timesTable(times: ShotTimes[]): string {
  const w = Math.max(4, ...times.map((t) => t.id.length));
  return [`${"shot".padEnd(w)}  kind     start     end   frame at`, ...times.map((t) => `${t.id.padEnd(w)}  ${t.kind.padEnd(7)} ${fmt(t.start).padStart(6)}  ${fmt(t.end).padStart(6)}  ${fmt(t.at).padStart(8)}`)].join("\n");
}

/**
 * `video review`: each shot's final state into review/<shot>.png (1920x1080) and the contact sheet
 * review.png (every frame at a third of its size, three to a row, each under its shot's id, kind,
 * start and end). Needs the composition (compose first) and a Chrome.
 */
export async function review(video: Video, config: Config, env: NodeJS.ProcessEnv = process.env): Promise<{ sheet: string; frames: string[]; times: ShotTimes[] }> {
  const plan = planOf(video);
  const html = join(video.dir, "index.html");
  if (existsSync(video.script) && statSync(video.script).mtimeMs > statSync(html).mtimeMs) {
    throw new StudioError(`${html} is older than ${video.script}: run \`jhon-studio video compose\` (or video make) first, so the review shows the script as it is`);
  }
  const times = shotTimes(plan);
  const COLS = 3, TW = 640, TH = 360, GAP = 24, LABEL = 44;
  const rowsN = Math.ceil(times.length / COLS);
  const sheetW = COLS * TW + (COLS + 1) * GAP, sheetH = rowsN * (TH + LABEL) + (rowsN + 1) * GAP;
  const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: "Mono"; src: url("/assets/fonts/firacode-medium.woff") format("woff"); }
    html, body { margin: 0; background: #101114; }
    .sheet { display: grid; grid-template-columns: repeat(${COLS}, ${TW}px); gap: ${GAP}px; padding: ${GAP}px; }
    .tile img { display: block; width: ${TW}px; height: ${TH}px; }
    .tile div { height: ${LABEL}px; line-height: ${LABEL}px; font: 20px "Mono", monospace; color: #e8e9ec; white-space: nowrap; overflow: hidden; }
    .tile b { color: #ffffff; font-weight: normal; }
    .tile span { color: #9a9ca3; }
  </style></head><body><div class="sheet">${times.map((t) => `<div class="tile"><img src="/review/${encodeURIComponent(t.id)}.png"><div><b>${escHtml(t.id)}</b> <span>${t.kind} ${fmt(t.start)}-${fmt(t.end)} s</span></div></div>`).join("")}</div></body></html>`;
  const o = await open(video, config, env, { "/__review-sheet.html": sheet });
  if ("why" in o) throw new StudioError(`video review needs a Chrome: ${o.why}`, 2);
  const dir = join(video.dir, "review");
  mkdirSync(dir, { recursive: true });
  const frames: string[] = [];
  const out = join(video.dir, "review.png");
  try {
    for (const t of times) {
      await o.seek(t.at);
      const f = join(dir, `${t.id}.png`);
      writeIfChanged(f, await o.page.png());
      frames.push(f);
    }
    const p: Page = o.page;
    await p.call("Emulation.setDeviceMetricsOverride", { width: sheetW, height: sheetH, deviceScaleFactor: 1, mobile: false });
    await p.goto(`${o.base}/__review-sheet.html`);
    await p.eval("Promise.all([...document.images].map((i) => i.decode().catch(() => null))).then(() => true)");
    writeIfChanged(out, await p.png());
  } catch (e) {
    if (e instanceof PageError) throw new StudioError(e.message);
    throw e;
  } finally {
    await o.close();
  }
  return { sheet: out, frames, times };
}
