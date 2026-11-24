/**
 * The CLI (bin/jhon-studio, src/cli.ts): help for every command, `init` (guessed defaults, never
 * overwrites), the script's approval (`video script --approve`) and `render` refusing a script
 * nobody approved; the steps that come later answer "not yet".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "../src/yaml.ts";
import { SAMPLE_VIDEO, cli, sampleCopy, scratch } from "./helpers.ts";

const COMMANDS = [[], ["init"], ["doctor"], ["video"], ["video", "narrate"], ["video", "compose"], ["video", "render"], ["video", "script"], ["video", "brief"], ["video", "capture"]];

test("--help for every command: its usage on stdout, exit 0", () => {
  for (const c of COMMANDS) {
    for (const flag of ["--help", "-h"]) {
      const r = cli([...c, flag]);
      assert.equal(r.code, 0, `${c.join(" ")} ${flag}: ${r.stderr}`);
      assert.match(r.stdout, new RegExp(`^Usage: jhon-studio${c.length ? " " + c.join(" ") : ""}\\b`), `${c.join(" ")} ${flag}`);
      assert.equal(r.stderr, "");
    }
  }
  const top = cli(["--help"]).stdout;
  for (const c of ["init", "video narrate", "video compose", "video render", "video script", "doctor"]) assert.ok(top.includes(c), `the top help names ${c}`);
});

test("an unknown command or flag is a usage error: exit 2, the usage on stderr", () => {
  for (const args of [["film"], ["video", "edit"], ["init", "--force"], []]) {
    const r = cli(args);
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Usage: jhon-studio/);
  }
});

test("brief, capture and writing a script come later: they say so and exit 2", () => {
  for (const step of ["brief", "capture", "script"]) {
    const r = cli(["video", step]);
    assert.equal(r.code, 2, step);
    assert.match(r.stderr, new RegExp(`jhon-studio video ${step}: not yet`));
  }
});

test("init writes .jhon/studio.yaml with the guessed defaults, and refuses to overwrite it", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "README.md"), "# Hello World\n\nHello World greets you. Twice.\n");
  const r = cli(["init", "--project", dir]);
  assert.equal(r.code, 0, r.stderr);
  const file = join(dir, ".jhon", "studio.yaml");
  assert.match(r.stdout, /wrote .*\.jhon\/studio\.yaml/);
  const yaml = readFileSync(file, "utf8");
  const c = parseYaml(yaml);
  assert.equal(c.name, "Hello World");
  assert.equal(c.tagline, "Hello World greets you.");
  assert.deepEqual(c.mark, { glyph: "H" });
  assert.deepEqual(c.languages, ["en", "es"]);
  assert.equal(c.voice, "af_heart");
  assert.equal(c.intro, "flat");
  assert.match(c.palette.accent, /^#[0-9a-f]{6}$/);

  writeFileSync(file, "name: Mine\n");
  const again = cli(["init", "--project", dir]);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /\.jhon\/studio\.yaml already exists; edit it, or remove it to start again/);
  assert.equal(readFileSync(file, "utf8"), "name: Mine\n", "left as it was");
});

test("init refuses a project folder that does not exist", (t) => {
  const r = cli(["init", "--project", join(scratch(t), "missing")]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no such project folder/);
});

test("render refuses a script nobody approved, and changes nothing", (t) => {
  const { project, video } = sampleCopy(t);
  assert.equal(cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]).code, 0);
  const before = readFileSync(join(video, "script.json"), "utf8");
  const r = cli(["video", "render", "--project", project, "--video", SAMPLE_VIDEO, "--dry-run"]);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /the script is not approved: read .*script\.json, then run `jhon-studio video script --approve --project \S+ --video tour`/);
  assert.equal(readFileSync(join(video, "script.json"), "utf8"), before);
  assert.ok(!existsSync(join(video, "renders")), "no renders folder");
});

test("video script --approve marks a valid script approved; then render runs HyperFrames per language", (t) => {
  const { project, video } = sampleCopy(t);
  const r = cli(["video", "script", "--approve", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /approved .*script\.json/);
  const s = JSON.parse(readFileSync(join(video, "script.json"), "utf8"));
  assert.equal(s.approved, true);
  assert.equal(cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]).code, 0);
  const dry = cli(["video", "render", "--project", project, "--video", SAMPLE_VIDEO, "--lang", "en,es", "--dry-run"]);
  assert.equal(dry.code, 0, dry.stderr);
  const cmds = dry.stdout.trim().split("\n");
  assert.equal(cmds.length, 2);
  assert.match(cmds[0]!, /npx --yes hyperframes@0\.9\.58 render .*--no-browser-gpu .*-o .*renders\/tour\.mp4$/);
  assert.match(cmds[1]!, /--variables-file .*captions\.es\.json --strict-variables .*-o .*renders\/tour\.es\.mp4$/);
  assert.ok(!existsSync(join(video, "renders")), "a dry run renders nothing");
});

test("video script --approve refuses an invalid script, and render refuses an unknown language", (t) => {
  const { project, video } = sampleCopy(t);
  const s = JSON.parse(readFileSync(join(video, "script.json"), "utf8"));
  delete s.shots[1].es;
  writeFileSync(join(video, "script.json"), JSON.stringify(s, null, 2) + "\n");
  const r = cli(["video", "script", "--approve", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no es subtitle/);
  assert.equal(JSON.parse(readFileSync(join(video, "script.json"), "utf8")).approved, false);
  const l = cli(["video", "render", "--project", project, "--video", SAMPLE_VIDEO, "--lang", "fr", "--dry-run"]);
  assert.equal(l.code, 2);
  assert.match(l.stderr, /--lang: "fr" is not one of en, es/);
});

test("--video may be left out when the project has one video; with none or several it must be named", (t) => {
  const { project } = sampleCopy(t);
  assert.equal(cli(["video", "script", "--check", "--project", project]).code, 0);
  mkdirSync(join(project, ".jhon", "studio", "second"), { recursive: true });
  writeFileSync(join(project, ".jhon", "studio", "second", "script.json"), "{}");
  const r = cli(["video", "script", "--check", "--project", project]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /several videos \(second, tour\): name one with --video/);
  const empty = scratch(t);
  const n = cli(["video", "compose", "--project", empty]);
  assert.equal(n.code, 1);
  assert.match(n.stderr, /no video in .*\.jhon\/studio/);
});
