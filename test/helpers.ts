/**
 * Shared test helpers: the repository's paths, scratch folders and running the CLI as a user does.
 *
 * Every test file imports this module, so it also isolates the run from the machine: HOME and
 * the XDG folders point at a fresh scratch home (removed when the process exits), and no
 * JHON_STUDIO_* or JHON_MEDIA_* variable of the real environment is passed on. A test passes
 * here only if it passes on a machine with no Kokoro, no HyperFrames cache and no Chrome (CI).
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromePath } from "../src/config.ts";

/**
 * The machine's chrome-headless-shell, found before the isolation below, or "": only the web
 * capture tests use it, passed explicitly as JHON_STUDIO_CHROME (they skip without one).
 */
export const HOST_CHROME = chromePath(process.env, homedir());

/** The scratch home every test (and every CLI it runs) sees. */
export const TEST_HOME = mkdtempSync(join(tmpdir(), "jhon-studio-home-"));
process.on("exit", () => rmSync(TEST_HOME, { recursive: true, force: true }));
for (const k of Object.keys(process.env)) if (/^(JHON_STUDIO_|JHON_MEDIA_|XDG_\w+_HOME$)/.test(k)) delete process.env[k];
process.env.HOME = TEST_HOME;
process.env.XDG_CACHE_HOME = join(TEST_HOME, ".cache");
process.env.XDG_CONFIG_HOME = join(TEST_HOME, ".config");
process.env.XDG_DATA_HOME = join(TEST_HOME, ".local", "share");
process.env.XDG_STATE_HOME = join(TEST_HOME, ".local", "state");

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

/**
 * A copy of the sample project with the fixture narration in its video's cache, so narrate
 * finds every line spoken and never runs Kokoro: each fixture's <key>.json (the line's seconds)
 * and an empty <key>.opus beside it (narrate counts a line spoken when both exist; no test plays it).
 */
export function sampleCopy(t: { after: (fn: () => void) => void }): { project: string; video: string } {
  const project = join(scratch(t), "sample-project");
  cpSync(SAMPLE, project, { recursive: true });
  const video = join(project, ".jhon", "studio", SAMPLE_VIDEO);
  mkdirSync(join(video, "narration"), { recursive: true });
  for (const f of readdirSync(FIXTURE_NARRATION)) {
    cpSync(join(FIXTURE_NARRATION, f), join(video, "narration", f));
    if (f.endsWith(".json")) writeFileSync(join(video, "narration", f.replace(/\.json$/, ".opus")), "");
  }
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

/**
 * Words no tracked file may carry: the owner's private projects, as the SHA-256 of their name in
 * lower case, so this file does not name them either (S5).
 */
// The maintainer's private project names are never written into this public
// repository, not even hashed: they come from an untracked file
// (.private-names, one per line; .gitignore keeps it out) or from
// JHON_STUDIO_PRIVATE_NAMES (comma-separated). With neither, nothing is checked.
const PRIVATE_NAMES = new Set(
  [
    ...(existsSync(join(ROOT, ".private-names")) ? readFileSync(join(ROOT, ".private-names"), "utf8").split("\n") : []),
    ...(process.env.JHON_STUDIO_PRIVATE_NAMES ?? "").split(","),
  ].map((w) => w.trim().toLowerCase()).filter(Boolean),
);

/** The words of a text that are a private project's name. */
export const privateWords = (text: string): string[] =>
  [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((w) => PRIVATE_NAMES.has(w));

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
