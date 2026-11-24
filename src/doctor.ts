/**
 * src/doctor.ts — check what the studio needs, each failure with the line that fixes it.
 *
 *   node         22 or newer (the CLI runs TypeScript with Node's type stripping)
 *   ffmpeg       on PATH (narration to Opus)
 *   kokoro       the venv's Python and the model files under the Kokoro folder
 *   hyperframes  npx on PATH and the pinned CLI in npx's cache (doctor never downloads it)
 *   chrome       chrome-headless-shell for the renders
 * Nothing is run or downloaded: each check looks for files, so it is quick and works offline.
 */
import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { HYPERFRAMES, chromePath, kokoroDir } from "./config.ts";

export interface Check { id: string; ok: boolean; detail: string; fix: string }
export interface Report { ok: boolean; checks: Check[] }

/** The executable `cmd` on PATH, or "". */
export function which(cmd: string, path = process.env.PATH ?? ""): string {
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const f = join(dir, cmd);
    try {
      if (statSync(f).isFile()) { accessSync(f, constants.X_OK); return f; }
    } catch { /* not here */ }
  }
  return "";
}

/** The pinned HyperFrames CLI in npx's cache, or "". */
function cachedHyperframes(env: NodeJS.ProcessEnv, home: string): string {
  const version = HYPERFRAMES.split("@")[1]!;
  const root = join(env.npm_config_cache || join(home, ".npm"), "_npx");
  if (!existsSync(root)) return "";
  for (const d of readdirSync(root)) {
    const pkg = join(root, d, "node_modules", "hyperframes", "package.json");
    try {
      if (JSON.parse(readFileSync(pkg, "utf8")).version === version) return join(root, d);
    } catch { /* another package */ }
  }
  return "";
}

export function doctor(env: NodeJS.ProcessEnv = process.env, nodeVersion = process.versions.node): Report {
  const home = env.HOME || homedir();
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, detail: string, fix: string) => checks.push({ id, ok, detail, fix: ok ? "" : fix });

  const major = Number(nodeVersion.split(".")[0]);
  add("node", major >= 22, `node ${nodeVersion}${major >= 22 ? "" : " is older than 22"}`, "install Node 22 or newer (https://nodejs.org)");

  const ffmpeg = which("ffmpeg", env.PATH);
  add("ffmpeg", !!ffmpeg, ffmpeg || "ffmpeg is not on PATH", "install ffmpeg with your package manager (apt install ffmpeg, brew install ffmpeg, pacman -S ffmpeg)");

  const K = kokoroDir(env, home);
  const need = [join(K, "venv", "bin", "python"), join(K, "model", "kokoro-v1.0.onnx"), join(K, "model", "voices-v1.0.bin")];
  const missing = need.filter((f) => !existsSync(f));
  add("kokoro", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : K,
    `K=${K}; uv venv --python 3.12 $K/venv && VIRTUAL_ENV=$K/venv uv pip install kokoro-onnx && mkdir -p $K/model && cd $K/model && curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin`);

  const npx = which("npx", env.PATH);
  const hf = npx ? cachedHyperframes(env, home) : "";
  add("hyperframes", !!hf, !npx ? "npx is not on PATH" : hf ? `${HYPERFRAMES} in ${hf}` : `${HYPERFRAMES} is not in npx's cache`,
    !npx ? `install Node with npm (it brings npx), then: npx --yes ${HYPERFRAMES} --version` : `npx --yes ${HYPERFRAMES} --version`);

  const chrome = chromePath(env, home);
  const chromeOk = !!chrome && existsSync(chrome);
  add("chrome", chromeOk, chromeOk ? chrome : chrome ? `${chrome} does not exist` : "no chrome-headless-shell (JHON_STUDIO_CHROME, or the one the HyperFrames CLI keeps)",
    `npx --yes ${HYPERFRAMES} browser ensure`);

  return { ok: checks.every((c) => c.ok), checks };
}

/** The report for a person: a line per check, the fix under each failure. */
export function formatReport(r: Report): string {
  return r.checks.map((c) => (c.ok ? `ok   ${c.id} ${c.detail}` : `FAIL ${c.id}: ${c.detail}\n     fix: ${c.fix}`)).join("\n") + "\n";
}
