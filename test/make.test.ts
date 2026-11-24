/**
 * `jhon-studio video make` (src/make.ts): the remaining steps in order (capture, narrate,
 * compose, render), stopping at the first that needs the user (exit 3): no script yet, or a
 * script not approved as it is now. Renders already up to date are not made again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_VIDEO, cli, sampleCopy } from "./helpers.ts";

test("make runs capture, narrate and compose, then stops before the render until the owner approves the script", (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  const r = cli(["video", "make", ...at, "--dry-run"]);
  assert.equal(r.code, 3, r.stderr);
  assert.match(r.stdout, /^capture: nothing to capture \(screens is the folder screens\)\nnarrate: 7 lines, in narration\/\ncompose: \d+(\.\d+)? s, 8 shots -> index\.html\ncompose: text fit: not measured: no Chrome \(none found; run npx --yes hyperframes@0\.9\.58 browser ensure, or set JHON_STUDIO_CHROME\)\n$/);
  assert.equal(r.stderr, `jhon-studio: video make stopped before the render: the script is not approved: read ${join(video, "script.json")}, then run \`jhon-studio video script --approve --project ${project} --video tour\`\n`);
  assert.ok(existsSync(join(video, "index.html")), "composed, so the owner can preview it");

  assert.equal(cli(["video", "script", "--approve", ...at]).code, 0);
  const ok = cli(["video", "make", ...at, "--dry-run"]);
  assert.equal(ok.code, 0, ok.stderr);
  const renders = ok.stdout.split("\n").filter((l) => l.startsWith("render: "));
  assert.equal(renders.length, 2);
  assert.match(renders[0]!, /^render: .*npx --yes hyperframes@0\.9\.58 render .*-o \S*renders\/tour\.mp4$/);
  assert.match(renders[1]!, /^render: .*captions\.es\.json .*-o \S*renders\/tour\.es\.mp4$/);
  assert.ok(!existsSync(join(video, "renders")), "a dry run renders nothing");

  const file = join(video, "script.json");
  writeFileSync(file, readFileSync(file, "utf8").replace("Cocina con lo que ya tienes.", "Cocina con lo que tienes."));
  const changed = cli(["video", "make", ...at, "--dry-run"]);
  assert.equal(changed.code, 3);
  assert.equal(changed.stderr, "jhon-studio: video make stopped before the render: the script changed after its approval: run jhon-studio video script --approve\n");
});

test("make with a brief and no script stops before the script and says how to write it", (t) => {
  const { project } = sampleCopy(t);
  assert.equal(cli(["video", "brief", "readme", "--project", project, "--video", "launch"]).code, 0);
  const r = cli(["video", "make", "--project", project, "--video", "launch"]);
  assert.equal(r.code, 3);
  assert.equal(r.stdout, "capture: nothing to capture (screens is the folder screens)\n");
  const dir = join(project, ".jhon", "studio", "launch");
  assert.equal(r.stderr, `jhon-studio: video make stopped before the script: write ${join(dir, "script.json")} from ${join(dir, "brief.md")} (jhon-studio video script prints the shot model), check it with jhon-studio video script --check, then the owner approves it with jhon-studio video script --approve\n`);
});

test("make stops on an invalid script with its problems (exit 1), and skips a render already up to date", (t) => {
  const { project, video } = sampleCopy(t);
  const at = ["--project", project, "--video", SAMPLE_VIDEO];
  const file = join(video, "script.json");
  const good = readFileSync(file, "utf8");
  writeFileSync(file, good.replace('"kind": "numbers"', '"kind": "figures"'));
  const bad = cli(["video", "make", ...at]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /script\.json is not valid:\n  month: kind "figures"/);

  writeFileSync(file, good);
  assert.equal(cli(["video", "script", "--approve", ...at]).code, 0);
  assert.equal(cli(["video", "make", ...at, "--dry-run"]).code, 0);
  mkdirSync(join(video, "renders"));
  const mp4 = join(video, "renders", "tour.mp4");
  writeFileSync(mp4, "");
  const later = new Date(Date.now() + 60_000);
  utimesSync(mp4, later, later);
  const r = cli(["video", "make", ...at, "--dry-run"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\nrender: renders\/tour\.mp4 is up to date\nrender: .*-o \S*renders\/tour\.es\.mp4\n$/);
  const before = new Date(Date.now() - 3_600_000);
  utimesSync(mp4, before, before);
  assert.match(cli(["video", "make", ...at, "--dry-run"]).stdout, /\nrender: .*-o \S*renders\/tour\.mp4\n/, "older than what it is made of: made again");
});
