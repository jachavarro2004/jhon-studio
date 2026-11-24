/**
 * src/render.ts — render a composed video to MP4 with the HyperFrames CLI, once per language.
 *
 * Only a script its owner approved, as it is now, is rendered (`jhon-studio video script
 * --approve` stores the script's hash; an edit after it needs a new approval). The CLI is pinned (src/config.ts HYPERFRAMES) and run with npx from the
 * home folder, so the project gets no package.json or node_modules; telemetry and update checks
 * are off. `--no-browser-gpu` draws WebGL in software, which makes renders reproducible; crf 32
 * keeps a few minutes under 20 MB. The narration's language is the composition as it is (its
 * captions where a shot asks for them): renders/<video>.mp4; each subtitle language swaps in its
 * captions.<lang>.json: renders/<video>.<lang>.mp4, in the video folder.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HYPERFRAMES } from "./config.ts";
import { approval, type Script } from "./script.ts";
import { StudioError, type Video } from "./video.ts";

export interface RenderJob { lang: string; out: string; args: string[]; env: Record<string, string>; cwd: string }

/** Refuses a script not approved as it is now. */
export function needApproval(video: Video, script: Script): void {
  const a = approval(script);
  if (a === "changed") throw new StudioError("the script changed after its approval: run jhon-studio video script --approve");
  if (a === "legacy") throw new StudioError("this script's approval predates its hash: run jhon-studio video script --approve");
  if (a !== "approved") throw new StudioError(`the script is not approved: read ${video.script}, then run \`jhon-studio video script --approve --project ${video.project} --video ${video.id}\``);
}

/** A render's file: the narration's language plain, a subtitle language with its code. */
export const renderFile = (video: Video, lang: string, narration = "en") => join(video.dir, "renders", lang === narration ? `${video.id}.mp4` : `${video.id}.${lang}.mp4`);

/**
 * The render commands for the languages asked, after checking the script is approved and composed.
 * `noSandbox` (the project's capture.chrome_no_sandbox) tells HyperFrames to start its Chrome
 * without the sandbox (HYPERFRAMES_CHROME_SANDBOX=0) instead of trying it first.
 */
export function renderJobs(video: Video, script: Script, langs: string[], narration = "en", opts: { noSandbox?: boolean } = {}): RenderJob[] {
  needApproval(video, script);
  const html = join(video.dir, "index.html");
  if (!existsSync(html)) throw new StudioError(`${html} does not exist: run \`jhon-studio video compose\` first`);
  return langs.map((lang) => {
    const out = renderFile(video, lang, narration);
    const vars = lang === narration ? [] : ["--variables-file", join(video.dir, `captions.${lang}.json`), "--strict-variables"];
    if (vars.length && !existsSync(vars[1]!)) throw new StudioError(`${vars[1]} does not exist: add ${lang} to subtitles in .jhon/studio.yaml and compose again`);
    return {
      lang, out,
      args: ["--yes", HYPERFRAMES, "render", "--quality", "looks", "--crf", "32", "--no-browser-gpu", ...vars, "-o", out],
      env: { HYPERFRAMES_PLUGIN_CWD: video.dir, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_SKIP_SKILLS: "1", ...(opts.noSandbox ? { HYPERFRAMES_CHROME_SANDBOX: "0" } : {}) },
      cwd: homedir(),
    };
  });
}

/** A job as the shell line that runs it. */
export const commandLine = (j: RenderJob) => [...Object.entries(j.env).map(([k, v]) => `${k}=${shq(v)}`), "npx", ...j.args.map(shq)].join(" ");
const shq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** Runs each job in turn, in the foreground; stops at the first that fails. */
export function runJobs(jobs: RenderJob[], env: NodeJS.ProcessEnv = process.env): void {
  for (const j of jobs) {
    mkdirSync(join(j.out, ".."), { recursive: true });
    const r = spawnSync("npx", j.args, { cwd: j.cwd, env: { ...env, ...j.env }, stdio: "inherit" });
    if (r.error) throw new StudioError(`npx: ${r.error.message} (run \`jhon-studio doctor\`)`);
    if (r.status !== 0) throw new StudioError(`the ${j.lang} render failed (exit ${r.status})`);
  }
}
