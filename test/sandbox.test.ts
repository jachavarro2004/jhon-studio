/**
 * Chrome inside a sandbox (T9): Chrome's own sandbox needs user namespaces, which a sandbox such
 * as Jhon's does not allow, and Chrome then dies with "No usable sandbox!". The opt-in setting
 * `capture: chrome_no_sandbox: true` in .jhon/studio.yaml (or JHON_STUDIO_CHROME_NO_SANDBOX=1,
 * which overrides it either way) starts every Chrome the studio starts without it, and hands the
 * same choice to the HyperFrames render; that failure names the setting as its fix; and doctor
 * starts Chrome for real instead of checking its file. Fake Chromes (shell scripts that log their
 * arguments) stand in for the real one; the real one runs inside bwrap where the machine has both.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromeNoSandbox, loadConfig } from "../src/config.ts";
import { doctor } from "../src/doctor.ts";
import { HOST_CHROME, SAMPLE_VIDEO, cli, cliAsync, sampleCopy, scratch } from "./helpers.ts";

const SANDBOX_DEATH = "[1124/163021.768376:FATAL:content/browser/zygote_host/zygote_host_impl_linux.cc:129] No usable sandbox! If you want to live dangerously and need an immediate workaround, you can try using --no-sandbox.";

/**
 * A fake Chrome that logs each run's arguments to `log`: with --no-sandbox it answers doctor's
 * --dump-dom (and exits 7 for anything else: it speaks no DevTools); without, it dies as Chrome
 * does in a sandbox that allows it none.
 */
function fakeChrome(dir: string): { chrome: string; log: string; runs: () => string[] } {
  const chrome = join(dir, "chrome-headless-shell"), log = join(dir, "chrome.log");
  writeFileSync(chrome, [
    "#!/bin/sh",
    `echo "$*" >> ${JSON.stringify(log)}`,
    'case " $* " in',
    '  *" --no-sandbox "*) case " $* " in *" --dump-dom "*) echo "<html><head></head><body></body></html>"; exit 0;; esac; echo "fake chrome: no DevTools here" >&2; exit 7;;',
    "esac",
    `echo ${JSON.stringify(SANDBOX_DEATH)} >&2`,
    "exit 133",
    "",
  ].join("\n"));
  chmodSync(chrome, 0o755);
  return { chrome, log, runs: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []) };
}

const FIX = /capture\.chrome_no_sandbox: true.*JHON_STUDIO_CHROME_NO_SANDBOX=1/;

test("capture.chrome_no_sandbox in studio.yaml: false by default, true opts in; JHON_STUDIO_CHROME_NO_SANDBOX overrides it either way", (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, ".jhon"));
  const yaml = (s: string) => { writeFileSync(join(dir, ".jhon", "studio.yaml"), s); return loadConfig(dir); };
  assert.equal(yaml("name: x\n").chromeNoSandbox, false);
  const on = yaml("capture:\n  chrome_no_sandbox: true\n");
  assert.equal(on.chromeNoSandbox, true);
  assert.equal(chromeNoSandbox(on, {}), true);
  assert.equal(chromeNoSandbox(on, { JHON_STUDIO_CHROME_NO_SANDBOX: "0" }), false, "the environment turns it off");
  const off = yaml("capture:\n  chrome_no_sandbox: false\n");
  assert.equal(chromeNoSandbox(off, {}), false);
  assert.equal(chromeNoSandbox(off, { JHON_STUDIO_CHROME_NO_SANDBOX: "1" }), true, "the environment turns it on");
  assert.equal(chromeNoSandbox(null, { JHON_STUDIO_CHROME_NO_SANDBOX: "true" }), true, "with no project settings at all");
  assert.equal(chromeNoSandbox(null, {}), false);
  for (const [bad, re] of [
    ["capture:\n  chrome_no_sandbox: yes please\n", /capture\.chrome_no_sandbox: true or false/],
    ["capture:\n  sandbox: false\n", /unknown key "capture\.sandbox" \(known: chrome_no_sandbox\)/],
    ["capture: true\n", /capture: a mapping/],
  ] as const) {
    writeFileSync(join(dir, ".jhon", "studio.yaml"), bad);
    assert.throws(() => loadConfig(dir), re, bad);
  }
});

test("capture: Chrome dying with \"No usable sandbox\" names the setting that fixes it (exit 1)", (t) => {
  const { project, video } = sampleCopy(t);
  const fake = fakeChrome(scratch(t));
  writeFileSync(join(project, ".jhon", "studio.yaml"), readFileSync(join(project, ".jhon", "studio.yaml"), "utf8").replace("screens: screens\n", "screens:\n  - web:\n      url: web/index.html\n      name: home\n"));
  const r = cli(["video", "capture", "--project", project, "--video", SAMPLE_VIDEO], { env: { ...process.env, JHON_STUDIO_CHROME: fake.chrome } });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /^jhon-studio: screens\[0\] \(home\.png\): Chrome could not start its sandbox \("No usable sandbox!"\)/);
  assert.match(r.stderr, FIX);
  assert.equal(fake.runs().length, 1);
  assert.doesNotMatch(fake.runs()[0]!, /--no-sandbox/, "the sandbox stays on unless the project opts out");
  assert.ok(!existsSync(join(video, "screens", "home.png")));
});

test("capture: with capture.chrome_no_sandbox (or the environment) every Chrome starts without its sandbox", (t) => {
  const { project } = sampleCopy(t);
  const yaml = join(project, ".jhon", "studio.yaml");
  const web = readFileSync(yaml, "utf8").replace("screens: screens\n", "screens:\n  - web:\n      url: web/index.html\n      name: home\n");
  for (const [setting, env] of [["capture:\n  chrome_no_sandbox: true\n", {}], ["", { JHON_STUDIO_CHROME_NO_SANDBOX: "1" }]] as const) {
    const fake = fakeChrome(scratch(t));
    writeFileSync(yaml, web + setting);
    const r = cli(["video", "capture", "--project", project, "--video", SAMPLE_VIDEO], { env: { ...process.env, ...env, JHON_STUDIO_CHROME: fake.chrome } });
    assert.equal(r.code, 1, "the fake speaks no DevTools");
    assert.doesNotMatch(r.stderr, /No usable sandbox/);
    assert.match(r.stderr, /fake chrome: no DevTools here/);
    assert.match(fake.runs()[0]!, /(^| )--no-sandbox --disable-setuid-sandbox --no-zygote( |$)/, JSON.stringify(setting || env));
  }
});

test("compose's text-fit check and video review: Chrome dying with \"No usable sandbox\" names the same fix; opted in, they start it without", (t) => {
  const { project } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  const fake = fakeChrome(scratch(t));
  const env = { ...process.env, JHON_STUDIO_CHROME: fake.chrome };
  const compose = cli(["video", "compose", ...at], { env });
  assert.equal(compose.code, 1);
  assert.match(compose.stderr, /^jhon-studio: Chrome could not start its sandbox \("No usable sandbox!"\)/);
  assert.match(compose.stderr, FIX);
  const review = cli(["video", "review", ...at], { env });
  assert.equal(review.code, 1);
  assert.match(review.stderr, FIX);
  const optedIn = cli(["video", "review", ...at], { env: { ...env, JHON_STUDIO_CHROME_NO_SANDBOX: "1" } });
  assert.doesNotMatch(optedIn.stderr, /No usable sandbox/);
  assert.deepEqual(fake.runs().map((r) => r.includes("--no-sandbox --disable-setuid-sandbox --no-zygote")), [false, false, true]);
});

test("render: with capture.chrome_no_sandbox the HyperFrames render is told to start its Chrome without the sandbox", (t) => {
  const { project } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  assert.equal(cli(["video", "script", "--approve", ...at]).code, 0);
  assert.equal(cli(["video", "compose", ...at]).code, 0);
  const plain = cli(["video", "render", ...at, "--dry-run"]);
  assert.equal(plain.code, 0, plain.stderr);
  assert.doesNotMatch(plain.stdout, /HYPERFRAMES_CHROME_SANDBOX/, "left to HyperFrames by default");
  const yaml = join(project, ".jhon", "studio.yaml");
  writeFileSync(yaml, readFileSync(yaml, "utf8") + "capture:\n  chrome_no_sandbox: true\n");
  const off = cli(["video", "render", ...at, "--dry-run"]);
  assert.equal(off.code, 0, off.stderr);
  const lines = off.stdout.trim().split("\n");
  assert.equal(lines.length, 2);
  for (const l of lines) assert.match(l, /^HYPERFRAMES_PLUGIN_CWD=\S+ .*HYPERFRAMES_CHROME_SANDBOX=0 npx --yes hyperframes@0\.9\.58 render /);
});

test("doctor starts Chrome for real (headless, about:blank); \"No usable sandbox\" fails the check with the setting as its fix", (t) => {
  const root = scratch(t);
  const fake = fakeChrome(root);
  const env = { PATH: "", HOME: root, JHON_STUDIO_CHROME: fake.chrome };
  const r = cli(["doctor", "--json"], { env, cwd: root });
  const chrome = JSON.parse(r.stdout).checks.find((c: { id: string }) => c.id === "chrome");
  assert.equal(chrome.ok, false);
  assert.match(chrome.detail, new RegExp(`^${fake.chrome} did not start: Chrome could not start its sandbox \\("No usable sandbox!"\\)`));
  assert.match(chrome.fix, FIX);
  assert.equal(fake.runs().length, 1, "Chrome was started");
  assert.match(fake.runs()[0]!, /--headless .*--dump-dom about:blank$/);
  assert.match(cli(["doctor"], { env, cwd: root }).stdout, /^FAIL chrome: .*No usable sandbox.*\n     fix: set capture\.chrome_no_sandbox: true/m);

  // Opted in through the environment, or through the studio.yaml of the folder doctor runs in.
  const viaEnv = JSON.parse(cli(["doctor", "--json"], { env: { ...env, JHON_STUDIO_CHROME_NO_SANDBOX: "1" }, cwd: root }).stdout).checks.find((c: { id: string }) => c.id === "chrome");
  assert.deepEqual(viaEnv, { id: "chrome", ok: true, detail: `${fake.chrome} (started without its sandbox: capture.chrome_no_sandbox)`, fix: "" });
  mkdirSync(join(root, ".jhon"));
  writeFileSync(join(root, ".jhon", "studio.yaml"), "capture:\n  chrome_no_sandbox: true\n");
  const viaYaml = JSON.parse(cli(["doctor", "--json"], { env, cwd: root }).stdout).checks.find((c: { id: string }) => c.id === "chrome");
  assert.equal(viaYaml.ok, true, viaYaml.detail);
  assert.match(fake.runs().at(-1)!, /--no-sandbox --disable-setuid-sandbox --no-zygote/);
});

test("doctor: a Chrome that fails another way shows its last line; one that hangs is cut at the timeout", (t) => {
  const root = scratch(t);
  const broken = join(root, "broken"), slow = join(root, "slow");
  writeFileSync(broken, "#!/bin/sh\necho 'error while loading shared libraries: libnss3.so' >&2\nexit 127\n");
  writeFileSync(slow, "#!/bin/sh\nexec sleep 30\n");
  chmodSync(broken, 0o755);
  chmodSync(slow, 0o755);
  const check = (chrome: string) => doctor({ PATH: "", HOME: root, JHON_STUDIO_CHROME: chrome }, process.versions.node, { chromeTimeout: 1 }).checks.find((c) => c.id === "chrome")!;
  const b = check(broken);
  assert.equal(b.ok, false);
  assert.equal(b.detail, `${broken} did not start (exit 127): error while loading shared libraries: libnss3.so`);
  assert.match(b.fix, /npx --yes hyperframes@0\.9\.58 browser ensure/);
  const started = Date.now();
  const s = check(slow);
  assert.ok(Date.now() - started < 10_000, "bounded");
  assert.equal(s.ok, false);
  assert.equal(s.detail, `${slow} did not answer within 1 s`);
});

const BWRAP = spawnSync("bwrap", ["--version"]).status === 0;
const NO_BWRAP = !HOST_CHROME || !existsSync(HOST_CHROME) ? "no chrome-headless-shell" : !BWRAP ? "no bwrap" : false;

test("the real Chrome inside a sandbox that allows it none (bwrap --disable-userns): doctor fails with the fix, and passes opted in", { skip: NO_BWRAP }, async (t) => {
  const root = scratch(t);
  const wrapper = join(root, "chrome-in-bwrap");
  writeFileSync(wrapper, `#!/bin/sh\nexec bwrap --dev-bind / / --unshare-user --disable-userns ${JSON.stringify(HOST_CHROME)} "$@"\n`);
  chmodSync(wrapper, 0o755);
  const env = { ...process.env, JHON_STUDIO_CHROME: wrapper };
  const fails = await cliAsync(["doctor", "--json"], { env, cwd: root });
  const chrome = JSON.parse(fails.stdout).checks.find((c: { id: string }) => c.id === "chrome");
  assert.equal(chrome.ok, false);
  assert.match(chrome.detail, /No usable sandbox/);
  assert.match(chrome.fix, FIX);
  const ok = await cliAsync(["doctor", "--json"], { env: { ...env, JHON_STUDIO_CHROME_NO_SANDBOX: "1" }, cwd: root });
  assert.equal(JSON.parse(ok.stdout).checks.find((c: { id: string }) => c.id === "chrome").ok, true);

  // capture over the DevTools Protocol, in the same sandbox: refused with the fix, then made opted in.
  const { project, video } = sampleCopy(t);
  const yaml = join(project, ".jhon", "studio.yaml");
  writeFileSync(yaml, readFileSync(yaml, "utf8").replace("screens: screens\n", "screens:\n  - web:\n      url: web/index.html\n      name: home\n"));
  const at = ["video", "capture", "--project", project, "--video", SAMPLE_VIDEO];
  const refused = await cliAsync(at, { env });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, FIX);
  writeFileSync(yaml, readFileSync(yaml, "utf8") + "capture:\n  chrome_no_sandbox: true\n");
  const made = await cliAsync(at, { env });
  assert.equal(made.code, 0, made.stderr);
  assert.ok(existsSync(join(video, "screens", "home.png")));
});
