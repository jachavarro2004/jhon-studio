/**
 * src/make.ts — `jhon-studio video make`: a video's remaining steps in order, capture → narrate →
 * compose → render, stopping at the first that needs the user (exit 3): no script yet (write it
 * from the brief), or a script not approved as it is now (the owner reads and approves it; it is
 * composed first, so it can be previewed). Every step is cached or skips what is done: capture
 * and compose rewrite only what changed, narrate speaks only new lines, and a render newer than
 * everything it is made of is not made again.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { capture } from "./capture.ts";
import { compose } from "./compose.ts";
import { chromeNoSandbox, screensDir, type Config } from "./config.ts";
import { narrate, narrationDir } from "./narrate.ts";
import { commandLine, needApproval, renderJobs, runJobs } from "./render.ts";
import { checkFit, fitLine } from "./review.ts";
import { loadScript, validateScript } from "./script.ts";
import { StudioError, type Video } from "./video.ts";

/** Make stopped before a step that needs the user. */
export class WaitError extends StudioError {
  constructor(message: string) {
    super(message, 3);
  }
}

const mtime = (f: string) => statSync(f).mtimeMs;
const filesIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).map((n) => join(dir, n)).filter((f) => statSync(f).isFile()) : []);

/** Whether a render is newer than everything it is made of. */
function upToDate(out: string, inputs: string[]): boolean {
  if (!existsSync(out)) return false;
  const t = mtime(out);
  return inputs.filter((f) => existsSync(f)).every((f) => mtime(f) <= t);
}

export async function make(video: Video, config: Config, say: (line: string) => void, opts: { dryRun?: boolean } = {}): Promise<void> {
  // capture
  if (!config.captures) say(`capture: nothing to capture (screens is the folder ${config.screens})`);
  else {
    const r = await capture(video, config);
    for (const m of r.made) say(`capture: ${m}`);
    if (r.failed.length) throw new StudioError(`video make stopped at capture:\n  ${r.failed.join("\n  ")}`, r.needChrome && r.failed.every((f) => f.includes("no Chrome")) ? 2 : 1);
  }

  // the script
  if (!existsSync(video.script)) {
    throw new WaitError(`video make stopped before the script: write ${video.script} from ${join(video.dir, "brief.md")} (jhon-studio video script prints the shot model), check it with jhon-studio video script --check, then the owner approves it with jhon-studio video script --approve`);
  }
  const script = loadScript(video.script);
  const errs = validateScript(script, { languages: config.languages, narration: config.narration });
  if (errs.length) throw new StudioError(`${video.script} is not valid:\n  ${errs.join("\n  ")}`);

  // narrate, compose
  const spoken = narrate(video, script, config);
  say(`narrate: ${new Set(Object.values(spoken).map((v) => v.key)).size} lines, in narration/`);
  const c = compose(video, script, config);
  say(`compose: ${c.total} s, ${c.shots} shots -> index.html`);
  say(`compose: ${fitLine(await checkFit(video, config))}`);

  // render
  try {
    needApproval(video, script);
  } catch (e) {
    throw new WaitError(`video make stopped before the render: ${(e as Error).message}`);
  }
  const shared = [join(video.dir, "index.html"), ...filesIn(narrationDir(video.dir)), ...filesIn(screensDir(config, video.project, video.dir)), ...filesIn(join(video.dir, "assets")).filter((f) => /\/mark\.\w+$/.test(f))];
  const jobs = renderJobs(video, script, config.languages, config.narration, { noSandbox: chromeNoSandbox(config) }).filter((j) => {
    const fresh = upToDate(j.out, [...shared, join(video.dir, `captions.${j.lang}.json`)]);
    if (fresh) say(`render: ${relative(video.dir, j.out)} is up to date`);
    return !fresh;
  });
  if (opts.dryRun) { for (const j of jobs) say(`render: ${commandLine(j)}`); return; }
  for (const j of jobs) {
    runJobs([j]);
    say(`render: ${relative(video.dir, j.out)}`);
  }
}
