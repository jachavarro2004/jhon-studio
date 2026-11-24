/**
 * The Jhon integration, studio side: `jhon-studio integration --json` tells Jhon where the Claude
 * Code plugin and the video skill live (resolved from the real location of bin/jhon-studio, so a
 * link on PATH works), `--version` prints the version, and the plugin's manifest and skill agree
 * with it. The skill is generic: it names no private project.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { BIN, ROOT, cli, privateWords, scratch } from "./helpers.ts";

const PLUGIN = join(ROOT, "plugin", "claude-code");
const SKILL = join(PLUGIN, "skills", "video", "SKILL.md");
const manifest = () => JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

test("--version prints the version alone, the plugin's version", () => {
  const r = cli(["--version"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.match(r.stdout, /^\S+\n$/);
  const v = r.stdout.trim();
  assert.match(v, VERSION);
  assert.equal(manifest().version, v, "plugin.json carries the same version");
});

test("integration --json: the version, the plugin folder and the skill, absolute; exit 0", () => {
  const r = cli(["integration", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  const root = realpathSync(ROOT);
  assert.deepEqual(JSON.parse(r.stdout), {
    version: cli(["--version"]).stdout.trim(),
    plugin_dir: join(root, "plugin", "claude-code"),
    skill: join(root, "plugin", "claude-code", "skills", "video", "SKILL.md"),
  });
  assert.deepEqual(Object.keys(JSON.parse(r.stdout)), ["version", "plugin_dir", "skill"], "in that order");
});

test("integration --json through a link to bin/jhon-studio on PATH: the paths are the repository's, not the link's", (t) => {
  const dir = scratch(t);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  symlinkSync(BIN, join(bin, "jhon-studio"));
  // Run as a user does: the link by name, found on PATH, from another folder.
  const r = spawnSync("jhon-studio", ["integration", "--json"], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  const root = realpathSync(ROOT);
  assert.equal(j.plugin_dir, join(root, "plugin", "claude-code"));
  assert.equal(j.skill, join(root, "plugin", "claude-code", "skills", "video", "SKILL.md"));
  assert.ok(existsSync(j.skill), "the skill is there");
});

test("integration without --json: the same three, a line each, for a person", () => {
  const r = cli(["integration"]);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(cli(["integration", "--json"]).stdout);
  assert.equal(r.stdout, `version ${j.version}\nplugin_dir ${j.plugin_dir}\nskill ${j.skill}\n`);
});

test("integration takes no other option, and --version no command", () => {
  for (const args of [["integration", "--project", "."], ["integration", "extra"], ["init", "--version"]]) {
    const r = cli(args);
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Usage: jhon-studio/, args.join(" "));
  }
});

test("the Claude Code plugin: plugin.json names jhon-studio, and the video skill is the folder skills/video with its frontmatter", () => {
  const m = manifest();
  assert.equal(m.name, "jhon-studio", "Claude Code calls the skill /jhon-studio:video");
  assert.equal(typeof m.description, "string");
  assert.ok(m.description.length > 20);
  const skill = readFileSync(SKILL, "utf8");
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front, "a YAML frontmatter");
  assert.match(front![1]!, /^name: video$/m);
  assert.match(front![1]!, /^description: \S.{20,}$/m);
});

test("the video skill walks the whole flow, and never approves for the user", () => {
  const s = readFileSync(SKILL, "utf8");
  const steps = ["jhon-studio doctor", ".jhon/studio.yaml", "jhon-studio init", "jhon-studio video brief", "jhon-studio video script", "jhon-studio video script --check", "jhon-studio video make", "jhon-studio video script --approve"];
  let last = -1;
  for (const step of steps) {
    const at = s.indexOf(step, last + 1);
    assert.ok(at > last, `${step} comes next in the skill`);
    last = at;
  }
  assert.match(s, /[Ee]xit 3 means it .*composed a preview/);
  assert.match(s, /\.jhon\/studio\/<id>\/index\.html/, "the preview's path");
  assert.match(s, /NEVER run `jhon-studio video script --approve` yourself/);
  assert.match(s, /npx hyperframes|hyperframes@/, "renders need the network once, for HyperFrames");
});

test("the skill and the plugin name no private project, and no path of this machine", () => {
  for (const f of [SKILL, join(PLUGIN, ".claude-plugin", "plugin.json")]) {
    const text = readFileSync(f, "utf8");
    assert.equal(privateWords(text).length, 0, `${f} names a private project`);
    assert.doesNotMatch(text, /\/home\/|\/Users\/|~\/Projects/, `${f} carries a path of this machine`);
  }
});
