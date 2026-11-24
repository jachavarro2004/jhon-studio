/**
 * src/capture.ts — make a video's screens from what studio.yaml lists under `screens`, into the
 * video's screens/ (a proof's src is a name there):
 *
 *   file   a PNG or SVG of the project, copied
 *   cli    a command run as an argv list (never a shell line) in the project, with a timeout and
 *          colour forced on, its output drawn as a terminal in the project's palette (SVG)
 *   web    a page loaded in a headless Chrome (src/cdp.ts), its steps run, captured as a PNG at
 *          its viewport; without a Chrome these say how to get one and capture exits 2, after
 *          making every other screen
 *
 * A screen whose bytes did not change is not written again, so a render stays up to date.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseAnsi, terminalSvg } from "./ansi.ts";
import { Browser, PageError } from "./cdp.ts";
import { imageSize } from "./compose.ts";
import { HYPERFRAMES, chromePath, type Capture, type Config } from "./config.ts";
import { StudioError, writeIfChanged, type Video } from "./video.ts";

/** What a capture run made, and what failed (by screen); `needChrome` when web screens had no Chrome. */
export interface CaptureReport { made: string[]; failed: string[]; needChrome: boolean }

const size = (file: string) => { const [w, h] = imageSize(file); return `${w}x${h}`; };

/** A command's display: its words, quoted when they would not read as one. */
const shown = (argv: string[]) => argv.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : JSON.stringify(a))).join(" ");

/** Runs a command screen; returns its output (stdout and stderr, in order). */
function run(c: Extract<Capture, { kind: "cli" }>, project: string): string {
  const scratch = mkdtempSync(join(tmpdir(), "jhon-studio-cli-"));
  try {
    const file = join(scratch, "out");
    const fd = openSync(file, "w");
    const env = { ...process.env, FORCE_COLOR: "3", CLICOLOR_FORCE: "1", COLORTERM: "truecolor", TERM: "xterm-256color", COLUMNS: String(c.cols), LINES: "50" };
    delete env.NO_COLOR;
    let r;
    try {
      r = spawnSync(c.command[0]!, c.command.slice(1), { cwd: project, env, stdio: ["ignore", fd, fd], timeout: c.timeout * 1000, killSignal: "SIGKILL", shell: false });
    } finally {
      closeSync(fd);
    }
    const out = readFileSync(file, "utf8");
    if (r.error && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT") throw new StudioError(`${shown(c.command)} did not end within ${c.timeout} s`);
    if (r.error) throw new StudioError(`${shown(c.command)} did not run: ${r.error.message}`);
    if (r.signal) throw new StudioError(`${shown(c.command)} was killed (${r.signal})`);
    if (r.status !== 0) {
      const tail = out.replace(/\x1b\[[0-9;:?]*[@-~]/g, "").trim().split("\n").slice(-5).map((l) => `  ${l}`).join("\n");
      throw new StudioError(`${shown(c.command)} exited ${r.status}${tail ? `:\n${tail}` : ""}`);
    }
    return out;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A web screen's address: http(s) and file as they are; a path in the project as a file address. */
const address = (url: string, project: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : pathToFileURL(isAbsolute(url) ? url : resolve(project, url)).href);

/** Makes every screen studio.yaml lists; reports each line made and each failure. */
export async function capture(video: Video, config: Config, env: NodeJS.ProcessEnv = process.env): Promise<CaptureReport> {
  const report: CaptureReport = { made: [], failed: [], needChrome: false };
  if (!config.captures) return report;
  const dir = join(video.dir, "screens");
  mkdirSync(dir, { recursive: true });
  const fail = (i: number, c: Capture, msg: string) => report.failed.push(`screens[${i}] (${c.name}): ${msg}`);
  const web: [number, Extract<Capture, { kind: "web" }>][] = [];
  config.captures.forEach((c, i) => {
    const out = join(dir, c.name);
    try {
      if (c.kind === "file") {
        const src = resolve(video.project, c.file);
        if (!existsSync(src)) throw new StudioError(`${src} does not exist`);
        writeIfChanged(out, readFileSync(src));
        report.made.push(`copied ${relative(video.project, src)} -> ${c.name} (${size(out)})`);
      } else if (c.kind === "cli") {
        const rows = parseAnsi(run(c, video.project), c.cols);
        const t = terminalSvg(shown(c.command), rows, c.cols, config.palette);
        writeIfChanged(out, t.svg);
        report.made.push(`ran ${shown(c.command)} -> ${c.name} (${c.cols}x${t.rows}, ${t.width}x${t.height})`);
      } else web.push([i, c]);
    } catch (e) {
      if (!(e instanceof StudioError)) throw e;
      fail(i, c, e.message);
    }
  });
  if (!web.length) return report;

  const chrome = chromePath(env);
  if (!chrome || !existsSync(chrome)) {
    const why = chrome ? `${chrome} does not exist` : "none found";
    for (const [i, c] of web) fail(i, c, `no Chrome to capture web pages with (${why}): run npx --yes ${HYPERFRAMES} browser ensure, or set JHON_STUDIO_CHROME to a Chrome or chrome-headless-shell`);
    report.needChrome = true;
    return report;
  }
  let browser: Browser | null = null;
  const done = new Set<number>();
  try {
    browser = await Browser.launch(chrome);
    for (const [i, c] of web) {
      const url = address(c.url, video.project);
      try {
        const page = await browser.page(c.viewport[0], c.viewport[1], c.scale);
        await page.goto(url);
        for (const s of c.steps) await page.step(s);
        writeIfChanged(join(dir, c.name), await page.png());
        report.made.push(`captured ${c.url} -> ${c.name} (${size(join(dir, c.name))})`);
        done.add(i);
      } catch (e) {
        if (!(e instanceof PageError)) throw e;
        fail(i, c, e.message);
        done.add(i);
      }
    }
  } catch (e) {
    if (!(e instanceof PageError)) throw e;
    for (const [i, c] of web) if (!done.has(i)) fail(i, c, e.message);
  } finally {
    await browser?.close();
  }
  return report;
}
