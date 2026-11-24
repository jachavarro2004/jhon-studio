/**
 * `jhon-studio video compose` on the sample project (a fictional one), with fixture narration
 * (test/fixtures/sample-narration: each line's seconds, no Kokoro): it writes index.html and
 * captions.es.json in the video folder, painted with the project's own name, palette and mark,
 * and nothing of anyone else's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { key } from "../src/narrate.ts";
import { lines } from "../src/script.ts";
import { CORE_REPO, CORE_SEAL, FIXTURE_NARRATION, ROOT, ROSE_HEX, ROSE_RGB, SAMPLE, SAMPLE_VIDEO, cli, sampleCopy } from "./helpers.ts";

const script = () => JSON.parse(readFileSync(join(SAMPLE, ".jhon", "studio", SAMPLE_VIDEO, "script.json"), "utf8"));
const planOf = (html: string) => JSON.parse(html.match(/window\.__plan = (.*);/)![1]!);

test("the fixture narration covers every line of the sample's script, and nothing else", () => {
  const s = script();
  const want = lines(s).map((l) => `${key(l.text, "af_heart")}.json`).sort();
  assert.deepEqual(readdirSync(FIXTURE_NARRATION).sort(), want);
  for (const l of lines(s)) {
    const meta = JSON.parse(readFileSync(join(FIXTURE_NARRATION, `${key(l.text, "af_heart")}.json`), "utf8"));
    assert.equal(meta.text, l.text);
    assert.ok(meta.seconds > 0.5 && meta.seconds < 15, `${l.id}: ${meta.seconds} s`);
  }
});

test("compose writes index.html and captions.es.json with the project's name, palette and mark, and nothing of the core's", (t) => {
  const { project, video } = sampleCopy(t);
  const r = cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\d+(\.\d+)? s, 8 shots/);
  const html = readFileSync(join(video, "index.html"), "utf8");
  const es = JSON.parse(readFileSync(join(video, "captions.es.json"), "utf8"));

  assert.ok(html.includes("Larder"), "the project's name");
  for (const hex of ["#7fd1b9", "#1f4a40", "#eef4f1", "#141a19"]) assert.ok(html.includes(hex), `the project's palette: ${hex}`);
  assert.ok(html.includes('src="assets/mark.svg"'), "the project's logo as its mark");
  assert.equal(readFileSync(join(video, "assets", "mark.svg"), "utf8"), readFileSync(join(project, "assets", "logo.svg"), "utf8"));
  assert.match(html, /<div class="close-url kick" id="close-url"[^>]*><div class="close-install">brew install larder<\/div>example\.com\/larder<\/div>/, "the project's url on the close, under its install line");

  for (const word of [/jhon/i, /\bLDD\b/]) assert.doesNotMatch(html, word);
  for (const s of [CORE_REPO, CORE_SEAL, ...ROSE_HEX, ...ROSE_RGB]) {
    assert.ok(!html.toLowerCase().includes(s), `index.html carries "${s}"`);
    assert.ok(!JSON.stringify(es).toLowerCase().includes(s), `captions.es.json carries "${s}"`);
  }

  const s = script();
  assert.deepEqual(Object.keys(es), s.shots.map((x: { id: string }) => `c_${x.id}`), "one Spanish subtitle per shot, in order");
  for (const x of s.shots) {
    assert.equal(es[`c_${x.id}`], x.es.replace(/`/g, ""), `${x.id}: captions.es.json is not the script's`);
    assert.ok(html.includes(`data-var-text="c_${x.id}"`), `${x.id}: no subtitle clip shows c_${x.id}`);
  }
  for (const l of lines(s)) assert.ok(html.includes(`src="assets/narration/${key(l.text, "af_heart")}.opus"`), `${l.id}: its narration clip`);
});

test("the composition runs on the studio's motion engine alone, the flat 2D intro by default, and its proofs hold their screens", (t) => {
  const { project, video } = sampleCopy(t);
  assert.equal(cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]).code, 0);
  const html = readFileSync(join(video, "index.html"), "utf8");
  const motion = readFileSync(join(ROOT, "engine", "motion.js"), "utf8");
  const timeline = readFileSync(join(ROOT, "templates", "presentation", "timeline.js"), "utf8");
  const at = html.indexOf(motion);
  assert.ok(at > 0, "engine/motion.js is inlined as it is");
  assert.ok(html.indexOf(timeline) > at, "the timeline is inlined after the engine it uses");
  assert.doesNotMatch(html, /gsap/i);
  assert.doesNotMatch(html, /importmap|import \* as THREE/, "the flat intro loads no 3D");
  assert.match(html, /id="s1-mark"/, "the intro stamps the project's mark");

  const plan = planOf(html);
  assert.equal(plan.intro, "flat");
  for (const p of plan.shots.filter((x: { kind: string }) => x.kind === "proof")) {
    const ts = p.marks.map((m: [string, number]) => m[1]);
    for (let i = 0; i < ts.length; i++) {
      assert.ok(ts[i] >= p.start && ts[i] < p.end - 0.5, `${p.id}: mark ${i} at ${ts[i]} s is outside ${p.start}-${p.end} s`);
      if (i) assert.ok(ts[i] > ts[i - 1] + 0.15, `${p.id}: mark ${i} does not follow mark ${i - 1}`);
    }
  }
  const srcs = [...html.matchAll(/src="(assets\/screens\/[^"]+)"/g)].map((m) => m[1]!);
  assert.equal(srcs.length, 2, "the sample's two screens");
  for (const src of srcs) assert.ok(existsSync(join(video, src)), `${src} does not load from the video folder`);
  assert.equal(readlinkSync(join(video, "assets", "screens")), "../../../../screens", "the project's screens linked relatively: the project can move");
  for (const f of ["fraunces.woff", "space-grotesk-regular.woff", "firacode-medium.woff"]) assert.ok(existsSync(join(video, "assets", "fonts", f)), f);
});

test("a glyph mark with `intro: seal` brings the 3D seal, stamped with that glyph in the project's palette", (t) => {
  const { project, video } = sampleCopy(t);
  const yaml = join(project, ".jhon", "studio.yaml");
  writeFileSync(yaml, readFileSync(yaml, "utf8").replace(/mark:\n  path: .*\n/, "mark:\n  glyph: L\n") + "intro: seal\n");
  const r = cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 0, r.stderr);
  const html = readFileSync(join(video, "index.html"), "utf8");
  const plan = planOf(html);
  assert.equal(plan.intro, "seal");
  assert.deepEqual(plan.seal.glyph, "L");
  assert.equal(plan.seal.accent, "#7fd1b9");
  assert.ok(html.includes(readFileSync(join(ROOT, "templates", "presentation", "stage.js"), "utf8")), "stage.js inlined");
  assert.match(html, /"three": "\.\/vendor\/three-0\.187\.0\/module\/three\.module\.js"/);
  assert.ok(existsSync(join(video, "vendor", "three-0.187.0", "module", "three.module.js")), "three.js loads from the video folder");
  assert.match(html, /<div class="seal-face mark-face" id="close-seal-face">L<\/div>/);
  for (const s of [CORE_SEAL, ...ROSE_HEX]) assert.ok(!html.toLowerCase().includes(s), `index.html carries "${s}"`);
});

test("compose refuses without the narration of every line, and names the step that makes it", (t) => {
  const { project, video } = sampleCopy(t);
  const first = readdirSync(join(video, "narration"))[0]!;
  rmSync(join(video, "narration", first));
  const r = cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no narration for shot "[a-z0-9-]+": run `jhon-studio video narrate/);
  assert.ok(!existsSync(join(video, "index.html")), "nothing written");
});

test("compose refuses an invalid script, listing its problems", (t) => {
  const { project, video } = sampleCopy(t);
  const s = script();
  s.shots[1].kind = "slide";
  writeFileSync(join(video, "script.json"), JSON.stringify(s, null, 2));
  const r = cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /script\.json is not valid:\n  .*kind "slide"/);
  assert.ok(!existsSync(join(video, "index.html")));
});

test("compose copies the studio's fonts (and their licence) into the video folder, replacing a link an older compose made", (t) => {
  const { project, video } = sampleCopy(t);
  const fonts = join(video, "assets", "fonts");
  mkdirSync(join(video, "assets"), { recursive: true });
  symlinkSync(join(ROOT, "fonts"), fonts);
  const r = cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 0, r.stderr);
  const st = lstatSync(fonts);
  assert.ok(st.isDirectory() && !st.isSymbolicLink(), "a folder of its own, not a link to the studio");
  assert.deepEqual(readdirSync(fonts).sort(), readdirSync(join(ROOT, "fonts")).sort());
  for (const f of readdirSync(fonts)) assert.ok(readFileSync(join(fonts, f)).equals(readFileSync(join(ROOT, "fonts", f))), f);
  assert.ok(readdirSync(fonts).includes("OFL.txt"), "the licence travels with the fonts");

  // A copy left alone is not rewritten (what depends on it stays up to date).
  const before = statSync(join(fonts, "fraunces.woff")).mtimeMs;
  assert.equal(cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO]).code, 0);
  assert.equal(statSync(join(fonts, "fraunces.woff")).mtimeMs, before);

  // The video folder holds what the page loads: moved elsewhere, its fonts still resolve.
  const html = readFileSync(join(video, "index.html"), "utf8");
  const used = [...html.matchAll(/assets\/fonts\/([\w.-]+\.woff2?)/g)].map((m) => m[1]!);
  assert.ok(used.length >= 3, "the page loads its fonts from assets/fonts");
  for (const f of used) assert.ok(existsSync(join(fonts, f)), f);
});
