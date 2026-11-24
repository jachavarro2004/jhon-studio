/**
 * src/render.ts — render a composed video to MP4 with the HyperFrames CLI, once per language.
 *
 * Only a script its owner approved is rendered (`jhon-studio video script --approve` sets
 * "approved": true). The CLI is pinned (src/config.ts HYPERFRAMES) and run with npx from the
 * home folder, so the project gets no package.json or node_modules; telemetry and update checks
 * are off. `--no-browser-gpu` draws WebGL in software, which makes renders reproducible; crf 32
 * keeps a few minutes under 20 MB. English is the composition as it is (its English captions
 * where a shot asks for them); Spanish swaps in captions.es.json. Output: renders/<video>.mp4
 * and renders/<video>.es.mp4 in the video folder.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HYPERFRAMES } from "./config.ts";
import type { Script } from "./script.ts";
import { StudioError, type Video } from "./video.ts";

export interface RenderJob { lang: string; out: string; args: string[]; env: Record<string, string>; cwd: string }

/** The render commands for the languages asked, after checking the script is approved and composed. */
export function renderJobs(video: Video, script: Script, langs: string[]): RenderJob[] {
  if (script.approved !== true) throw new StudioError(`the script is not approved: read ${video.script}, then run \`jhon-studio video script --approve --project ${video.project} --video ${video.id}\``);
  const html = join(video.dir, "index.html");
  if (!existsSync(html)) throw new StudioError(`${html} does not exist: run \`jhon-studio video compose\` first`);
  return langs.map((lang) => {
    const out = join(video.dir, "renders", lang === "en" ? `${video.id}.mp4` : `${video.id}.${lang}.mp4`);
    const vars = lang === "en" ? [] : ["--variables-file", join(video.dir, `captions.${lang}.json`), "--strict-variables"];
    if (vars.length && !existsSync(vars[1]!)) throw new StudioError(`${vars[1]} does not exist: add ${lang} to languages in .jhon/studio.yaml and compose again`);
    return {
      lang, out,
      args: ["--yes", HYPERFRAMES, "render", "--quality", "looks", "--crf", "32", "--no-browser-gpu", ...vars, "-o", out],
      env: { HYPERFRAMES_PLUGIN_CWD: video.dir, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_SKIP_SKILLS: "1" },
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
