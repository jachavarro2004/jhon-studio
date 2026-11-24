/** Shared test helpers: the repository's paths, scratch folders and running the CLI as a user does. */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BIN = join(ROOT, "bin", "jhon-studio");
export const SAMPLE = join(ROOT, "examples", "sample-project");
export const SAMPLE_VIDEO = "tour";
export const FIXTURE_NARRATION = join(ROOT, "test", "fixtures", "sample-narration");

/** A fresh scratch folder in the system temp directory, removed when the test ends. */
export function scratch(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "jhon-studio-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A copy of the sample project with the fixture narration in its video's cache (no Kokoro). */
export function sampleCopy(t: { after: (fn: () => void) => void }): { project: string; video: string } {
  const project = join(scratch(t), "sample-project");
  cpSync(SAMPLE, project, { recursive: true });
  const video = join(project, ".jhon", "studio", SAMPLE_VIDEO);
  mkdirSync(join(video, "narration"), { recursive: true });
  for (const f of readdirSync(FIXTURE_NARRATION)) cpSync(join(FIXTURE_NARRATION, f), join(video, "narration", f));
  return { project, video };
}

/**
 * What no generic file may carry: the core's repository name, its seal glyph and its rose palette.
 * Built from parts here, so this file does not carry them either (the hygiene test reads it too).
 */
export const CORE_REPO = ["jhon", "agent"].join("-");
export const CORE_SEAL = String.fromCodePoint(0x529b);
export const ROSE_HEX = ["8cbb7e", "f34335", "2d5c2f", "1e0e9e", "6c3c2d", "09d8b9", "7444f4", "2776b7"].map((s) => [...s].reverse().join(""));
/** The rose accent and fill as CSS rgb() channels ("r, g, b"), as the old styles wrote them. */
export const ROSE_RGB = ROSE_HEX.slice(0, 2).map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", "));

export interface Run { code: number | null; stdout: string; stderr: string }

/** Runs bin/jhon-studio with Node's type stripping, as its shebang does. */
export function cli(args: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Run {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", BIN, ...args], {
    encoding: "utf8",
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Runs bin/jhon-studio without blocking this process (a server the test runs keeps answering). */
export function cliAsync(args: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<Run> {
  return new Promise((ok, no) => {
    const p = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", BIN, ...args], { cwd: opts.cwd ?? ROOT, env: opts.env ?? process.env });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", no);
    p.on("close", (code) => ok({ code, stdout, stderr }));
  });
}
