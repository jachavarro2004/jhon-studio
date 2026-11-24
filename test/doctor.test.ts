/**
 * `jhon-studio doctor` (src/doctor.ts): node, ffmpeg, Kokoro, the HyperFrames CLI and Chrome, each
 * with the line that fixes it; `--json` for Jhon's own doctor. Run with a fake PATH and HOME, so
 * no real tool is found unless the test puts it there.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, scratch } from "./helpers.ts";

const IDS = ["node", "ffmpeg", "kokoro", "hyperframes", "chrome"];

function fakeEnv(t: { after: (fn: () => void) => void }) {
  const root = scratch(t);
  const bin = join(root, "bin"), home = join(root, "home");
  mkdirSync(bin);
  mkdirSync(home);
  return { root, bin, home, env: { PATH: bin, HOME: home } as NodeJS.ProcessEnv };
}
const exe = (file: string) => { writeFileSync(file, "#!/bin/sh\nexit 0\n"); chmodSync(file, 0o755); };

test("doctor --json: one check per dependency, each with ok, detail and fix; nothing found on an empty PATH", (t) => {
  const { env } = fakeEnv(t);
  const r = cli(["doctor", "--json"], { env });
  assert.equal(r.code, 1, "a failing check fails the doctor");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ["ok", "checks"]);
  assert.equal(out.ok, false);
  assert.deepEqual(out.checks.map((c: { id: string }) => c.id), IDS);
  for (const c of out.checks) {
    assert.deepEqual(Object.keys(c), ["id", "ok", "detail", "fix"], c.id);
    assert.equal(typeof c.ok, "boolean");
    assert.equal(typeof c.detail, "string");
    assert.ok(c.detail.length > 0, `${c.id}: detail`);
    if (c.ok) assert.equal(c.fix, "", `${c.id}: a passing check has no fix`);
    else assert.ok(c.fix.length > 0, `${c.id}: a failing check says how to fix it`);
  }
  const by = Object.fromEntries(out.checks.map((c: { id: string }) => [c.id, c]));
  assert.equal(by.node.ok, true, `node ${process.versions.node} is 22 or newer`);
  for (const id of ["ffmpeg", "kokoro", "hyperframes", "chrome"]) assert.equal(by[id].ok, false, id);
  assert.match(by.hyperframes.fix, /npx --yes hyperframes@0\.9\.58/);
  assert.match(by.chrome.fix, /npx --yes hyperframes@0\.9\.58 browser ensure/);
  assert.match(by.kokoro.fix, /kokoro-onnx/);
  assert.match(by.ffmpeg.fix, /ffmpeg/);
});

test("doctor finds each tool where it lives: ffmpeg and npx on PATH, the CLI in npx's cache, Kokoro and Chrome under the env names", (t) => {
  const { root, bin, home, env } = fakeEnv(t);
  exe(join(bin, "ffmpeg"));
  exe(join(bin, "npx"));
  const pkg = join(home, ".npm", "_npx", "abc123", "node_modules", "hyperframes");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "hyperframes", version: "0.9.58" }));
  const kokoro = join(root, "kokoro");
  mkdirSync(join(kokoro, "venv", "bin"), { recursive: true });
  mkdirSync(join(kokoro, "model"));
  for (const f of ["venv/bin/python", "model/kokoro-v1.0.onnx", "model/voices-v1.0.bin"]) writeFileSync(join(kokoro, f), "");
  const chrome = join(root, "chrome-headless-shell");
  exe(chrome);
  const r = cli(["doctor", "--json"], { env: { ...env, JHON_STUDIO_KOKORO: kokoro, JHON_MEDIA_CHROME: chrome } });
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { id: string; detail: string }) => `${c.id}: ${c.detail}`), []);
  assert.equal(out.ok, true);
  assert.equal(r.code, 0);
});

test("doctor without --json: a line per check, and the fix under each failure", (t) => {
  const { env } = fakeEnv(t);
  const r = cli(["doctor"], { env });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /^ok   node /m);
  assert.match(r.stdout, /^FAIL ffmpeg: .*\n     fix: .*ffmpeg/m);
  assert.match(r.stdout, /^FAIL chrome: .*\n     fix: npx --yes hyperframes@0\.9\.58 browser ensure/m);
});
