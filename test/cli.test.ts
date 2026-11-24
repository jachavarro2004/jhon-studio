/**
 * The CLI (bin/jhon-studio, src/cli.ts): help for every command, `init` (guessed defaults, never
 * overwrites), `video script` (the shot model for whoever writes it, --check, and --approve, the
 * script's hash), `render` refusing a script not approved as it is now, Spanish narration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { key } from "../src/narrate.ts";
import { KINDS, lines, validateScript } from "../src/script.ts";
import { parseYaml } from "../src/yaml.ts";
import { SAMPLE_VIDEO, cli, sampleCopy, scratch } from "./helpers.ts";

const COMMANDS = [[], ["init"], ["doctor"], ["video"], ["video", "narrate"], ["video", "compose"], ["video", "render"], ["video", "script"], ["video", "brief"], ["video", "capture"], ["video", "make"], ["integration"]];

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
  for (const c of ["init", "video brief", "video script", "video capture", "video narrate", "video compose", "video render", "video make", "doctor", "integration", "--version"]) assert.ok(top.includes(c), `the top help names ${c}`);
});

test("an unknown command or flag is a usage error: exit 2, the usage on stderr", () => {
  for (const args of [["film"], ["video", "edit"], ["init", "--force"], [], ["init", "extra"], ["video", "compose", "extra"], ["video", "brief", "readme", "extra"]]) {
    const r = cli(args);
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Usage: jhon-studio/);
  }
});

test("video script, bare: the shot model with one valid example of each kind, the screens and the brief, for an agent to write from", (t) => {
  const { project, video } = sampleCopy(t);
  assert.equal(cli(["video", "brief", "readme", "--project", project]).code, 0);
  const r = cli(["video", "script", "--project", project]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  const o = r.stdout;
  assert.match(o, new RegExp(`^script\\.json: the shots of ${join(video, "script.json").replace(/[.]/g, "\\.")}`));
  assert.match(o, /Narration: en \(each shot's "en" is spoken; its phrases time what lands\)\. Subtitles: es\./);
  for (const k of KINDS) assert.match(o, new RegExp(`^  ${k} `, "m"), `the kinds' table has ${k}`);
  const example = JSON.parse(o.match(/```json\n([\s\S]*?)\n```/)![1]!);
  assert.deepEqual(validateScript(example, { languages: ["en", "es"] }), [], "the example is a valid script");
  assert.deepEqual(new Set(example.shots.map((x: { kind: string }) => x.kind)), new Set(KINDS), "one of each kind");
  assert.match(o, /Screens \(a proof's src\):\n- pantry\.png \(1600x900, screens\/pantry\.png\)\n- week\.png \(1600x900, screens\/week\.png\)\n/);
  assert.ok(o.includes(readFileSync(join(video, "brief.md"), "utf8")), "the brief, as it is");
  assert.match(o, /When it is written: jhon-studio video script --check; the owner reads it and approves it/);
});

test("video script, bare, in Spanish narration and before any brief: the example speaks Spanish, and it says to draft a brief", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "README.md"), "# Tidy\n\nTidy keeps notes.\n");
  mkdirSync(join(dir, ".jhon"));
  writeFileSync(join(dir, ".jhon", "studio.yaml"), "narration: es\n");
  const r = cli(["video", "script", "--project", dir]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Narration: es \(each shot's "es" is spoken; its phrases time what lands\)\. Subtitles: en\./);
  const example = JSON.parse(r.stdout.match(/```json\n([\s\S]*?)\n```/)![1]!);
  assert.deepEqual(validateScript(example, { languages: ["es", "en"], narration: "es" }), []);
  assert.match(r.stdout, /No brief yet: jhon-studio video brief readme \(or ldd:<change>, release:<tag>, a file\)/);
});

test("a video with a brief and no script yet: script --check, narrate and compose say to write it", (t) => {
  const { project, video } = sampleCopy(t);
  assert.equal(cli(["video", "brief", "readme", "--project", project, "--video", "launch"]).code, 0);
  for (const step of ["script --check", "narrate", "compose"]) {
    const r = cli(["video", ...step.split(" "), "--project", project, "--video", "launch"]);
    assert.equal(r.code, 1, step);
    assert.equal(r.stderr, `jhon-studio: no script yet: write ${join(project, ".jhon", "studio", "launch", "script.json")} (jhon-studio video script prints the shot model and the brief)\n`, step);
  }
  const both = cli(["video", "compose", "--project", project]);
  assert.equal(both.code, 2);
  assert.match(both.stderr, /several videos \(launch, tour\): name one with --video/, "a folder with a brief is a video");
  assert.ok(existsSync(join(video, "script.json")));
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
  assert.equal(c.narration, "en");
  assert.deepEqual(c.subtitles, ["es"]);
  assert.ok(!("languages" in c) && !("captures" in c), "only the keys studio.yaml has");
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

test("video script --approve stores the script's hash; then render runs HyperFrames per language", (t) => {
  const { project, video } = sampleCopy(t);
  const before = JSON.parse(readFileSync(join(video, "script.json"), "utf8"));
  const r = cli(["video", "script", "--approve", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /approved .*script\.json \(8 shots, sha256 [0-9a-f]{12}\)/);
  const s = JSON.parse(readFileSync(join(video, "script.json"), "utf8"));
  const { approved: _, ...rest } = before;
  assert.deepEqual(s.approved, { sha256: createHash("sha256").update(JSON.stringify(rest)).digest("hex") });
  assert.deepEqual({ ...s, approved: false }, before, "nothing else changes");
  assert.equal(cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]).code, 0);
  const dry = cli(["video", "render", "--project", project, "--video", SAMPLE_VIDEO, "--lang", "en,es", "--dry-run"]);
  assert.equal(dry.code, 0, dry.stderr);
  const cmds = dry.stdout.trim().split("\n");
  assert.equal(cmds.length, 2);
  assert.match(cmds[0]!, /npx --yes hyperframes@0\.9\.58 render .*--no-browser-gpu .*-o .*renders\/tour\.mp4$/);
  assert.match(cmds[1]!, /--variables-file .*captions\.es\.json --strict-variables .*-o .*renders\/tour\.es\.mp4$/);
  assert.ok(!existsSync(join(video, "renders")), "a dry run renders nothing");
});

test("render refuses a script changed after its approval, until it is approved again", (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  assert.equal(cli(["video", "script", "--approve", ...at]).code, 0);
  assert.equal(cli(["video", "compose", ...at]).code, 0);
  const file = join(video, "script.json");
  const approved = readFileSync(file, "utf8");
  writeFileSync(file, approved.replace("Cocina con lo que ya tienes.", "Cocina con lo que tienes."));
  const r = cli(["video", "render", ...at, "--dry-run"]);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "jhon-studio: the script changed after its approval: run jhon-studio video script --approve\n");
  writeFileSync(file, approved.replace(/\n/g, "\n  "));
  assert.equal(cli(["video", "render", ...at, "--dry-run"]).code, 0, "formatting is not a change");
  writeFileSync(file, approved.replace("Cocina con lo que ya tienes.", "Cocina con lo que tienes."));
  assert.equal(cli(["video", "script", "--approve", ...at]).code, 0);
  assert.equal(cli(["video", "render", ...at, "--dry-run"]).code, 0, "approved again");
});

test("narration: es speaks the Spanish lines with a Spanish voice; the plain render is Spanish and the English one is subtitled", (t) => {
  const { project, video } = sampleCopy(t);
  const yaml = join(project, ".jhon", "studio.yaml");
  writeFileSync(yaml, readFileSync(yaml, "utf8").replace("languages: [en, es]\n", "narration: es\nsubtitles: [en]\n").replace("voice: af_heart\n", ""));
  const s = JSON.parse(readFileSync(join(video, "script.json"), "utf8"));
  const pantry = s.shots.find((x: { id: string }) => x.id === "pantry");
  pantry.marks = [{ at: "lo que hay", r: pantry.marks[0].r }, { at: "usar pronto", r: pantry.marks[1].r }];
  const week = s.shots.find((x: { id: string }) => x.id === "week");
  week.marks = [week.marks[0], { at: "martes", r: week.marks[1].r }, { at: "la lista de compras", r: week.marks[2].r }];
  for (const x of s.shots) for (const k of ["lines", "body", "rows", "figures"]) if (x[k] && x.kind !== "close") x[k] = x[k].map((row: string[]) => [...row.slice(0, -1), x.es.split(/[\s,.:¿?]+/).filter(Boolean)[0]]);
  writeFileSync(join(video, "script.json"), JSON.stringify(s, null, 2));
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  const check = cli(["video", "script", "--check", ...at]);
  assert.equal(check.code, 0, check.stderr);
  const c = cli(["video", "compose", ...at]);
  assert.equal(c.code, 1);
  assert.match(c.stderr, /no narration for shot "intro": run `jhon-studio video narrate/, "the Spanish lines are not the English fixture's");
  // Fixture seconds for the Spanish lines, as narrate would cache them with ef_dora.
  for (const l of lines(s, "es")) writeFileSync(join(video, "narration", `${key(l.text, "ef_dora", "es")}.json`), JSON.stringify({ text: l.text, seconds: 3 }) + "\n");
  const c2 = cli(["video", "compose", ...at]);
  assert.equal(c2.code, 0, c2.stderr);
  const html = readFileSync(join(video, "index.html"), "utf8");
  assert.match(html, /<html lang="es"/);
  const en = JSON.parse(readFileSync(join(video, "captions.en.json"), "utf8"));
  assert.equal(en.c_pantry, pantry.en);
  assert.ok(!existsSync(join(video, "captions.es.json")), "no Spanish subtitles over Spanish narration");
  assert.equal(cli(["video", "script", "--approve", ...at]).code, 0);
  const dry = cli(["video", "render", ...at, "--dry-run"]);
  assert.equal(dry.code, 0, dry.stderr);
  const cmds = dry.stdout.trim().split("\n");
  assert.match(cmds[0]!, /-o \S*renders\/tour\.mp4$/);
  assert.doesNotMatch(cmds[0]!, /variables-file/);
  assert.match(cmds[1]!, /--variables-file \S*captions\.en\.json --strict-variables .*-o \S*renders\/tour\.en\.mp4$/);
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

test("a legacy `approved: true` is valid but not an approval: render and make say to approve it again, and --approve stores the hash", (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  const file = join(video, "script.json");
  const legacy = readFileSync(file, "utf8").replace('"approved": false', '"approved": true');
  writeFileSync(file, legacy);
  const check = cli(["video", "script", "--check", ...at]);
  assert.equal(check.code, 0, check.stderr);
  assert.equal(check.stdout, `ok ${file} (8 shots)\n`);
  assert.equal(cli(["video", "compose", ...at]).code, 0);
  const r = cli(["video", "render", ...at, "--dry-run"]);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "jhon-studio: this script's approval predates its hash: run jhon-studio video script --approve\n");
  const m = cli(["video", "make", ...at, "--dry-run"]);
  assert.equal(m.code, 3);
  assert.equal(m.stderr, "jhon-studio: video make stopped before the render: this script's approval predates its hash: run jhon-studio video script --approve\n");
  assert.equal(readFileSync(file, "utf8"), legacy, "nothing approves it on its own");
  assert.ok(!existsSync(join(video, "renders")));

  const a = cli(["video", "script", "--approve", ...at]);
  assert.equal(a.code, 0, a.stderr);
  assert.match(JSON.parse(readFileSync(file, "utf8")).approved.sha256, /^[0-9a-f]{64}$/);
  assert.equal(cli(["video", "render", ...at, "--dry-run"]).code, 0, "approved by its hash now");
});
