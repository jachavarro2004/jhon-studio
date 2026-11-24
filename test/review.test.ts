/**
 * `jhon-studio video review` (T8): each shot's final state (REVIEW_BEFORE_END seconds before its
 * end, before the cut or band that leaves it) captured from the composition in a headless Chrome
 * that runs in the video folder, as review/<shot>.png and one contact sheet, review.png, with a
 * table of each shot's start and end; for the agent and the owner to look at before the approval.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOST_CHROME, ROOT, SAMPLE_VIDEO, cli, cliAsync, sampleCopy, scratch } from "./helpers.ts";

const CHROME = HOST_CHROME;
const NO_CHROME = !CHROME || !existsSync(CHROME) ? "no chrome-headless-shell: set JHON_STUDIO_CHROME or run npx --yes hyperframes@0.9.58 browser ensure" : false;
const planOf = (html: string) => JSON.parse(html.match(/window\.__plan = (.*);/)![1]!);
const pngSize = (file: string) => { const b = readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("video review: each shot's final state on one contact sheet in the video folder, and each shot's start and end; Chrome runs in the video folder", { skip: NO_CHROME }, async (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  assert.equal(cli(["video", "compose", ...at], { env: { ...process.env, JHON_STUDIO_CHROME: "/nonexistent" } }).code, 0);
  // A Chrome that notes the folder it was started in, then is the real one.
  const dir = scratch(t), log = join(dir, "cwd.log"), chrome = join(dir, "chrome");
  writeFileSync(chrome, `#!/bin/sh\npwd >> ${JSON.stringify(log)}\nexec ${JSON.stringify(CHROME)} "$@"\n`);
  chmodSync(chrome, 0o755);
  const r = await cliAsync(["video", "review", ...at], { env: { ...process.env, JHON_STUDIO_CHROME: chrome }, cwd: ROOT });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [video], "Chrome ran in the video folder, not the caller's");

  const plan = planOf(readFileSync(join(video, "index.html"), "utf8"));
  const lines = r.stdout.split("\n");
  assert.match(lines[0]!, /^shot\s+kind\s+start\s+end\s+frame at$/);
  plan.shots.forEach((s: { id: string; kind: string; start: number; end: number }, i: number) => {
    const cells = lines[i + 1]!.trim().split(/\s+/);
    assert.deepEqual(cells, [s.id, s.kind, s.start.toFixed(2), s.end.toFixed(2), (s.end - 0.35).toFixed(2)], `the row of ${s.id}`);
  });
  assert.equal(lines.length, plan.shots.length + 4, "the table, a blank line, the summary and the final newline");
  assert.equal(lines.at(-2), `wrote ${join(video, "review.png")} (8 shots, each 0.35 s before its end; one frame each in ${join(video, "review")}/)`);

  assert.deepEqual(pngSize(join(video, "review.png")), [3 * 640 + 4 * 24, 3 * (360 + 44) + 4 * 24], "three tiles to a row");
  const frames = plan.shots.map((s: { id: string }) => readFileSync(join(video, "review", `${s.id}.png`)));
  for (const f of frames) assert.deepEqual([f.readUInt32BE(16), f.readUInt32BE(20)], [1920, 1080]);
  assert.equal(new Set(frames.map((f: Buffer) => f.toString("base64"))).size, frames.length, "each shot looks like itself");
});

test("video review refuses without a composition, or with one older than the script, and names the step to run", (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  const none = cli(["video", "review", ...at]);
  assert.equal(none.code, 1);
  assert.equal(none.stderr, `jhon-studio: ${join(video, "index.html")} does not exist: run \`jhon-studio video compose\` (or video make) first\n`);
  assert.equal(cli(["video", "compose", ...at]).code, 0);
  const later = new Date(Date.now() + 60_000);
  utimesSync(join(video, "script.json"), later, later);
  const stale = cli(["video", "review", ...at]);
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /index\.html is older than .*script\.json: run `jhon-studio video compose` \(or video make\) first/);
  assert.ok(!existsSync(join(video, "review.png")));
});

test("video review without a Chrome says how to get one (exit 2)", (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  assert.equal(cli(["video", "compose", ...at]).code, 0);
  const r = cli(["video", "review", ...at], { env: { ...process.env, JHON_STUDIO_CHROME: "/nonexistent/chrome-headless-shell" } });
  assert.equal(r.code, 2);
  assert.equal(r.stderr, "jhon-studio: video review needs a Chrome: no Chrome (/nonexistent/chrome-headless-shell does not exist; run npx --yes hyperframes@0.9.58 browser ensure, or set JHON_STUDIO_CHROME)\n");
  assert.ok(!existsSync(join(video, "review.png")));
});

test("the help names video review, and the skill reviews the sheet before it asks for the approval", () => {
  const top = cli(["--help"]);
  assert.match(top.stdout, /^  video review +.*contact sheet/m);
  const h = cli(["video", "review", "--help"]);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /^Usage: jhon-studio video review \[--project <dir>\] \[--video <id>\]\n/);
  assert.match(h.stdout, /review\.png/);
  const skill = readFileSync(join(ROOT, "plugin", "claude-code", "skills", "video", "SKILL.md"), "utf8");
  const make = skill.indexOf("jhon-studio video make"), rev = skill.indexOf("jhon-studio video review", make), approve = skill.indexOf("jhon-studio video script --approve", rev);
  assert.ok(make >= 0 && rev > make && approve > rev, "make, then review, then the approval");
  assert.match(skill, /review\.png/);
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(readme, /jhon-studio video review/);
});
