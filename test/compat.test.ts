/**
 * The studio against the jhon it says it runs with (S6, T8d): .github/workflows/jhon.yml installs
 * the minimum jhon (the >= bound of src/version.ts's REQUIRES_JHON, read at run time) and the
 * latest from their signed releases, and checks jhon's view of this checkout's packed studio with
 * tools/jhon-compat.ts: `versions` picks the two, `integration` holds `integration --json` to what
 * jhon reads, `doctor` holds jhon doctor's jhon-studio section to the studio's own answers, and
 * `off` holds it to the one off note of a studio that needs a newer jhon.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, ROOT, scratch } from "./helpers.ts";
import { CONTRACT, REQUIRES_JHON, VERSION } from "../src/version.ts";

const WORKFLOW = join(ROOT, ".github", "workflows", "jhon.yml");
const TOOL = join(ROOT, "tools", "jhon-compat.ts");
const MIN = REQUIRES_JHON.replace(/^>=/, "");

const compat = (args: string[], input = "", tool = TOOL) => {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", tool, ...args], { input, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};
const matrix = (minimum: string, latest: string) => `${JSON.stringify({ include: [{ role: "minimum", jhon: minimum }, { role: "latest", jhon: latest }] })}\n`;

// ---- the workflow ----

test("jhon.yml reads the minimum jhon from src/version.ts at run time: no hand copy of the range or a jhon version", () => {
  const w = readFileSync(WORKFLOW, "utf8");
  assert.match(w, /tools\/jhon-compat\.ts versions < /, "the versions job asks tools/jhon-compat.ts");
  assert.match(readFileSync(TOOL, "utf8"), /^import \{[^}]*\bREQUIRES_JHON\b[^}]*\} from "\.\.\/src\/version\.ts";$/m, "which imports src/version.ts");
  assert.ok(!w.includes(REQUIRES_JHON) && !w.includes(MIN), "no copy of requires_jhon");
  const literals = w.split("\n").map((l) => l.replace(/#.*$/, "")).flatMap((l) => l.match(/\d+\.\d+\.\d+(?:-rc\.\d+)?/g) ?? []);
  assert.ok(literals.length > 0, "the incompatible copy's range");
  assert.deepEqual([...new Set(literals)], ["99.0.0"], "no version but the incompatible copy's");
  assert.match(w, /matrix: \$\{\{ fromJSON\(needs\.versions\.outputs\.matrix\) \}\}/, "the cells are the picked versions");
  assert.match(w, /JHON_VERSION="\$JHON" sh/, "jhon's installer, at the cell's version");
});

test("the picked minimum follows src/version.ts: a copy whose requires_jhon is >=0.6.0 picks jhon 0.6.0", (t) => {
  const s = scratch(t);
  mkdirSync(join(s, "tools"));
  mkdirSync(join(s, "src"));
  copyFileSync(TOOL, join(s, "tools", "jhon-compat.ts"));
  const source = readFileSync(join(ROOT, "src", "version.ts"), "utf8");
  const changed = source.replace(`export const REQUIRES_JHON = "${REQUIRES_JHON}";`, 'export const REQUIRES_JHON = ">=0.6.0";');
  assert.notEqual(changed, source);
  writeFileSync(join(s, "src", "version.ts"), changed);
  const r = compat(["versions"], "v0.6.1-rc.1\nv0.6.0\nv0.5.0\n", join(s, "tools", "jhon-compat.ts"));
  assert.equal(r.stderr, "");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, matrix("0.6.0", "0.6.0"));
});

test("jhon.yml pins every action to a commit, reads contents only, and runs on pushes, pull requests and weekly", () => {
  const w = readFileSync(WORKFLOW, "utf8");
  const uses = w.match(/uses: \S+.*/g) ?? [];
  assert.ok(uses.length >= 5, "checkout, setup-node and cosign's installer");
  for (const u of uses) assert.match(u, /^uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${u}: pinned to a commit, its tag in a comment`);
  assert.match(w, /^permissions:\n  contents: read\n\n/m, "the workflow reads contents");
  assert.doesNotMatch(w, /: write\b|secrets\./, "no write permission, no secret");
  assert.match(w, /^on:\n  push:\n  pull_request:\n  schedule:\n    - cron: "[^"]+"\n  workflow_dispatch:\n\n/m);
  assert.match(w, /persist-credentials: false/);
  assert.match(w, /GH_TOKEN: \$\{\{ github\.token \}\}/, "the releases are read with the workflow's token");
  for (const step of ["tools/pack.sh", "jhon settings set integrations.studio true", "jhon doctor", "tools/jhon-compat.ts integration", 'compat="$PWD/tools/jhon-compat.ts"', '"$compat" doctor "$JHON"', '"$compat" off "$JHON"', ">=99.0.0", "signature verified (cosign)"]) {
    assert.ok(w.includes(step), step);
  }
});

// ---- versions ----

test("versions: no stable jhon at or above the minimum yet, so the latest is the newest pre-release", () => {
  const r = compat(["versions"], `v${MIN}\nv0.4.0\nv0.3.7\n`);
  assert.equal(r.stderr, "");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, matrix(MIN, MIN));
});

test("versions: the latest is the newest stable once one meets the minimum; rc numbers compare as numbers", () => {
  const r = compat(["versions"], "v9.0.0-rc.10\nv9.0.0-rc.9\n");
  assert.equal(r.code, 1, "the minimum is not published");
  assert.equal(compat(["versions"], `v0.6.0-rc.1\nv0.5.1\nv0.5.0\nv${MIN}\n`).stdout, matrix(MIN, "0.5.1"));
  assert.equal(compat(["versions"], `v0.5.0-rc.10\nv0.5.0-rc.9\nv${MIN}\nv0.4.9\n`).stdout, matrix(MIN, "0.5.0-rc.10"));
});

test("versions: tags that are not vX.Y.Z or vX.Y.Z-rc.N, and blank lines, are not releases", () => {
  const r = compat(["versions"], `\nv${MIN}\nv0.6\n0.7.0\nv01.0.0\nv1.0.0-beta.1\nv1.0.0 \nnightly\n`);
  assert.equal(r.stderr, "");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, matrix(MIN, MIN));
});

test("versions: a minimum that is no published release is an error, nothing on stdout", () => {
  const r = compat(["versions"], "v0.4.0\n");
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, `jhon-compat: the minimum jhon ${MIN} (requires_jhon "${REQUIRES_JHON}" in src/version.ts) is no published jhon release\n`);
});

test("usage: no subcommand, an unknown one or missing arguments exit 2", () => {
  for (const args of [[], ["what"], ["versions", "extra"], ["integration", "a.json"], ["doctor", "1.0.0", "a", "b"], ["off", "1.0.0"]]) {
    const r = compat(args);
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^usage: tools\/jhon-compat\.ts versions < tags\n/);
  }
});

// ---- integration ----

function answerOf(t: { after: (fn: () => void) => void }, edit: (j: Record<string, unknown>) => void = () => {}) {
  const r = spawnSync(BIN, ["integration", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  edit(j);
  const f = join(scratch(t), "answer.json");
  writeFileSync(f, JSON.stringify(j));
  return f;
}

test("integration: the studio's own answer has every field jhon reads, with src/version.ts's values", (t) => {
  const r = compat(["integration", answerOf(t), ROOT]);
  assert.equal(r.stderr, "");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `jhon-studio integration --json: version ${VERSION}, requires_jhon ${REQUIRES_JHON}, contract ${CONTRACT}, plugin_dir and skill in ${realpathSync(ROOT)}\n`);
});

test("integration: a missing field, another value, or a plugin or skill outside the studio fails, naming it", (t) => {
  const cases: [(j: Record<string, unknown>) => void, string][] = [
    [(j) => { delete j.contract; }, "contract is not a string"],
    [(j) => { j.requires_jhon = ">=99.0.0"; }, `requires_jhon is ">=99.0.0", not "${REQUIRES_JHON}"`],
    [(j) => { j.version = "0.0.1"; }, `version is "0.0.1", not "${VERSION}"`],
    [(j) => { j.plugin_dir = "/tmp"; }, `plugin_dir is "/tmp", not "${join(realpathSync(ROOT), "plugin", "claude-code")}"`],
    [(j) => { j.skill = join(ROOT, "README.md"); }, `skill ${join(ROOT, "README.md")} is not a file under plugin_dir`],
  ];
  for (const [edit, why] of cases) {
    const r = compat(["integration", answerOf(t, edit), ROOT]);
    assert.equal(r.code, 1, why);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, `jhon-compat: integration --json: ${why}\n`);
  }
  const off = compat(["integration", answerOf(t, (j) => { j.requires_jhon = ">=99.0.0"; }), ROOT, ">=99.0.0"]);
  assert.equal(off.code, 0, "the range the copy was given");
});

// ---- jhon doctor's jhon-studio section ----

const CHECKS = { ok: false, checks: [
  { id: "node", ok: true, detail: "node 24.1.0", fix: "" },
  { id: "kokoro", ok: false, detail: "missing /h/k/venv/bin/python", fix: "uv venv" },
] };
const FIT = `  ok    jhon-studio ${VERSION} requires jhon ${REQUIRES_JHON}; this is jhon ${MIN}`;
const OFF = `  warn  jhon-studio ${VERSION} requires jhon >=99.0.0, and this is jhon ${MIN}: jhon-studio is off for this run; update jhon (jhon update), or install a jhon-studio version that supports jhon ${MIN}`;
const doctorOut = (section: string[]) => ["", "contracts", "  ok    valid", "", "versions", `  ok    jhon-studio 0.1.0 (tested with 0.1.0)`, "", "jhon-studio", ...section, "", "healthy", ""].join("\n");

function files(t: { after: (fn: () => void) => void }, section: string[], answer: Record<string, unknown>) {
  const s = scratch(t);
  writeFileSync(join(s, "doctor.txt"), doctorOut(section));
  writeFileSync(join(s, "answer.json"), JSON.stringify(answer));
  writeFileSync(join(s, "checks.json"), JSON.stringify(CHECKS));
  return [join(s, "doctor.txt"), join(s, "answer.json"), join(s, "checks.json")];
}
const ANSWER = { version: VERSION, requires_jhon: REQUIRES_JHON, contract: CONTRACT };

test("doctor: the section is the requires line jhon met, then each of the studio's checks as jhon shows them", (t) => {
  const section = [FIT, "  ok    node: node 24.1.0", "  warn  kokoro: missing /h/k/venv/bin/python — fix: uv venv"];
  const r = compat(["doctor", MIN, ...files(t, section, ANSWER)]);
  assert.equal(r.stderr, "");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `jhon doctor: jhon-studio ${VERSION} requires jhon ${REQUIRES_JHON}, met by jhon ${MIN}; its 2 checks shown as the studio gives them\n`);
});

test("doctor: an off note, a FAIL, a check missing or changed, or no section fails with what was expected", (t) => {
  for (const section of [
    [OFF],
    [FIT, "  ok    node: node 24.1.0"],
    [FIT, "  ok    node: node 24.1.0", "  ok    kokoro: missing /h/k/venv/bin/python"],
    [FIT, "  ok    node: node 24.1.0", "  warn  kokoro: missing /h/k/venv/bin/python — fix: uv venv", "  FAIL  something"],
  ]) {
    const r = compat(["doctor", MIN, ...files(t, section, ANSWER)]);
    assert.equal(r.code, 1, section.join("|"));
    assert.equal(r.stdout, "");
    assert.ok(r.stderr.startsWith("jhon-compat: jhon doctor's jhon-studio section is not what jhon reads from the studio\n"), r.stderr);
    assert.ok(r.stderr.includes(`expected:\n${FIT}\n`), r.stderr);
  }
  const [doctor, answer, checks] = files(t, [], ANSWER);
  writeFileSync(doctor, "\ncontracts\n  ok    valid\n\nhealthy\n");
  const none = compat(["doctor", MIN, doctor!, answer!, checks!]);
  assert.equal(none.code, 1);
  assert.equal(none.stderr, "jhon-compat: jhon doctor has no jhon-studio section (is integrations.studio on?)\n");
});

test("off: the section is jhon's one off note for a studio that needs a newer jhon, and nothing else", (t) => {
  const answer = { ...ANSWER, requires_jhon: ">=99.0.0" };
  const r = compat(["off", MIN, ...files(t, [OFF], answer).slice(0, 2)]);
  assert.equal(r.stderr, "");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `jhon doctor: jhon-studio ${VERSION} (requires jhon >=99.0.0) is off for jhon ${MIN}, with the note\n`);
  for (const section of [[FIT], [OFF, "  ok    node: node 24.1.0"], []]) {
    const bad = compat(["off", MIN, ...files(t, section, answer).slice(0, 2)]);
    assert.equal(bad.code, 1, section.join("|"));
    assert.ok(bad.stderr.startsWith("jhon-compat: jhon doctor's jhon-studio section is not the off note\n"), bad.stderr);
  }
});
