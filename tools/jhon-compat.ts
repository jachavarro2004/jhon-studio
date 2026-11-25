#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarning
/**
 * tools/jhon-compat.ts — what .github/workflows/jhon.yml checks of the studio against a real jhon
 * (README, "Releases"):
 *
 *   versions < tags        the jhon versions to test, a job matrix {include: [{role, jhon}]}: the
 *                          minimum, the >= bound of src/version.ts's REQUIRES_JHON (read here, at
 *                          run time), and the latest, jhon's newest stable release in that range,
 *                          or its newest release of any kind while no stable one is. stdin: jhon's
 *                          release tags, one a line (vX.Y.Z or vX.Y.Z-rc.N; anything else is
 *                          passed over)
 *   integration <answer.json> <studio-dir> [<requires_jhon>]
 *                          `jhon-studio integration --json` of the studio unpacked in studio-dir
 *                          has every field jhon reads, with src/version.ts's values (requires_jhon
 *                          the one given, for a copy that changed it), its plugin and skill inside
 *                          studio-dir
 *   doctor <jhon-version> <doctor.txt> <answer.json> <studio-doctor.json>
 *                          `jhon doctor`'s jhon-studio section is the requires line jhon met, then
 *                          each check of `jhon-studio doctor --json` as jhon shows it (ok, or warn
 *                          with its fix), and nothing else
 *   off <jhon-version> <doctor.txt> <answer.json>
 *                          that section is jhon's one note for a studio that needs a newer jhon
 *
 * Exit 0 with one line on stdout when it holds, 1 with why on stderr when not, 2 on a usage error.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { CONTRACT, REQUIRES_JHON, VERSION } from "../src/version.ts";

const USAGE = `usage: tools/jhon-compat.ts versions < tags
       tools/jhon-compat.ts integration <answer.json> <studio-dir> [<requires_jhon>]
       tools/jhon-compat.ts doctor <jhon-version> <doctor.txt> <answer.json> <studio-doctor.json>
       tools/jhon-compat.ts off <jhon-version> <doctor.txt> <answer.json>
`;

class Failed extends Error {}

/** A release version, X.Y.Z or X.Y.Z-rc.N with no leading zero (jhon's and the studio's tags). */
const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;

/** v's precedence key: major, minor, patch, then its rc number (a stable release after every rc). */
function key(v: string): number[] {
  const m = RELEASE.exec(v);
  if (!m) throw new Failed(`${v} is not X.Y.Z or X.Y.Z-rc.N`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])];
}

/** SemVer precedence of two release versions. */
function compare(a: string, b: string): number {
  const x = key(a), y = key(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  return 0;
}

/** Whether v is in range, jhon's syntax: comparators (>=, >, <=, <, =) on full versions, spaces AND. */
function holds(range: string, v: string): boolean {
  return range.trim().split(/\s+/).every((term) => {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(term)!;
    const c = compare(v, m[2]!);
    switch (m[1] ?? "=") {
      case ">=": return c >= 0;
      case ">": return c > 0;
      case "<=": return c <= 0;
      case "<": return c < 0;
      default: return c === 0;
    }
  });
}

/** The jhon to install as the minimum: range's one >= bound. */
function minimum(range: string): string {
  const bounds = range.includes("||") ? [] : range.trim().split(/\s+/).filter((t) => t.startsWith(">="));
  if (bounds.length !== 1 || !RELEASE.test(bounds[0]!.slice(2))) {
    throw new Failed(`requires_jhon "${range}" in src/version.ts has no single >= bound on an X.Y.Z or X.Y.Z-rc.N version to install`);
  }
  return bounds[0]!.slice(2);
}

function versions(tags: string): string {
  const all = [...new Set(tags.split("\n").filter((t) => t.startsWith("v") && RELEASE.test(t.slice(1))).map((t) => t.slice(1)))];
  const min = minimum(REQUIRES_JHON);
  if (!all.includes(min)) throw new Failed(`the minimum jhon ${min} (requires_jhon "${REQUIRES_JHON}" in src/version.ts) is no published jhon release`);
  const fit = all.filter((v) => holds(REQUIRES_JHON, v)).sort(compare);
  const stable = fit.filter((v) => !v.includes("-"));
  const latest = (stable.length ? stable : fit).at(-1)!;
  return JSON.stringify({ include: [{ role: "minimum", jhon: min }, { role: "latest", jhon: latest }] });
}

/** A JSON file, read. */
function json(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Failed(`${file}: not JSON (${(e as Error).message})`);
  }
}

/** The fields jhon reads from `<binary> integration --json` (its integrations.Answer). */
const JHON_READS = ["version", "plugin_dir", "skill", "requires_jhon", "contract"] as const;

function integration(file: string, dir: string, requires = REQUIRES_JHON): string {
  const a = json(file);
  const bad = (why: string) => new Failed(`integration --json: ${why}`);
  for (const f of JHON_READS) if (typeof a[f] !== "string" || a[f] === "") throw bad(`${f} is not a string`);
  for (const [f, want] of [["version", VERSION], ["requires_jhon", requires], ["contract", CONTRACT]] as const) {
    if (a[f] !== want) throw bad(`${f} is ${JSON.stringify(a[f])}, not ${JSON.stringify(want)}`);
  }
  const root = realpathSync(dir);
  const plugin = join(root, "plugin", "claude-code");
  if (a.plugin_dir !== plugin) throw bad(`plugin_dir is ${JSON.stringify(a.plugin_dir)}, not ${JSON.stringify(plugin)}`);
  if (!existsSync(join(plugin, ".claude-plugin", "plugin.json"))) throw bad(`plugin_dir ${plugin} holds no .claude-plugin/plugin.json`);
  const skill = a.skill as string;
  if (!skill.startsWith(plugin + sep) || !existsSync(skill) || !statSync(skill).isFile()) throw bad(`skill ${skill} is not a file under plugin_dir`);
  return `jhon-studio integration --json: version ${a.version}, requires_jhon ${a.requires_jhon}, contract ${a.contract}, plugin_dir and skill in ${root}`;
}

/** jhon doctor's jhon-studio section: the lines under its heading, up to the blank line. */
function section(file: string): string[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.indexOf("jhon-studio");
  if (at < 0) throw new Failed("jhon doctor has no jhon-studio section (is integrations.studio on?)");
  const end = lines.indexOf("", at + 1);
  return lines.slice(at + 1, end < 0 ? lines.length : end);
}

function same(got: string[], want: string[], what: string): void {
  if (got.length === want.length && got.every((l, i) => l === want[i])) return;
  throw new Failed(`jhon doctor's jhon-studio section is not ${what}\nexpected:\n${want.join("\n")}\ngot:\n${got.join("\n")}`);
}

interface Check { id: string; ok: boolean; detail: string; fix: string }

function doctor(jhon: string, doctorFile: string, answerFile: string, checksFile: string): string {
  const a = json(answerFile);
  const r = json(checksFile) as { checks?: Check[] };
  if (!Array.isArray(r.checks)) throw new Failed(`${checksFile}: not jhon-studio doctor --json's {ok, checks: [{id, ok, detail, fix}]}`);
  const want = [
    `  ok    jhon-studio ${a.version} requires jhon ${a.requires_jhon}; this is jhon ${jhon}`,
    ...r.checks.map((c) => (c.ok ? `  ok    ${c.id}: ${c.detail}` : `  warn  ${c.id}: ${c.detail} — fix: ${c.fix}`)),
  ];
  same(section(doctorFile), want, "what jhon reads from the studio");
  return `jhon doctor: jhon-studio ${a.version} requires jhon ${a.requires_jhon}, met by jhon ${jhon}; its ${r.checks.length} checks shown as the studio gives them`;
}

function off(jhon: string, doctorFile: string, answerFile: string): string {
  const a = json(answerFile);
  same(section(doctorFile), [
    `  warn  jhon-studio ${a.version} requires jhon ${a.requires_jhon}, and this is jhon ${jhon}: jhon-studio is off for this run; update jhon (jhon update), or install a jhon-studio version that supports jhon ${jhon}`,
  ], "the off note");
  return `jhon doctor: jhon-studio ${a.version} (requires jhon ${a.requires_jhon}) is off for jhon ${jhon}, with the note`;
}

function main(argv: string[]): number {
  const [cmd, ...args] = argv;
  const n = args.length;
  let run: (() => string) | undefined;
  if (cmd === "versions" && n === 0) run = () => versions(readFileSync(0, "utf8"));
  else if (cmd === "integration" && (n === 2 || n === 3)) run = () => integration(args[0]!, args[1]!, args[2]);
  else if (cmd === "doctor" && n === 4) run = () => doctor(args[0]!, args[1]!, args[2]!, args[3]!);
  else if (cmd === "off" && n === 3) run = () => off(args[0]!, args[1]!, args[2]!);
  if (!run) {
    process.stderr.write(USAGE);
    return 2;
  }
  try {
    process.stdout.write(`${run()}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof Failed)) throw e;
    process.stderr.write(`jhon-compat: ${e.message}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
