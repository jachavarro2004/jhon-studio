/**
 * A project's studio settings (src/config.ts): .jhon/studio.yaml over defaults guessed from the
 * project itself (its README's H1 and first sentence, its git remote, a neutral ink palette, its
 * name's initial as the mark), and where the tools live (env names, with the old ones as fallbacks).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DEFAULT_PALETTE, DEFAULT_VOICE, chromePath, derivePalette, guessConfig, kokoroDir, loadConfig } from "../src/config.ts";
import { scratch } from "./helpers.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "init.defaultBranch=main", ...args], { cwd, stdio: "pipe" });

test("defaults: name and tagline from the README's H1 and first sentence, url from the git remote, a neutral palette, the initial as the mark", (t) => {
  const dir = join(scratch(t), "tidy");
  mkdirSync(dir);
  writeFileSync(join(dir, "README.md"), "# Tidy *Notes*\n\n[![ci](https://example.com/badge.svg)](https://example.com/ci)\n\nTidy Notes keeps your notes in `plain text`. It syncs them too.\n\n## Install\n");
  git(dir, "init", "-q");
  git(dir, "remote", "add", "origin", "git@github.com:example/tidy-notes.git");
  const c = loadConfig(dir);
  assert.deepEqual(c, {
    name: "Tidy Notes",
    tagline: "Tidy Notes keeps your notes in plain text.",
    url: "https://github.com/example/tidy-notes",
    palette: DEFAULT_PALETTE,
    mark: { glyph: "T" },
    intro: "flat",
    voice: "af_heart",
    languages: ["en", "es"],
    screens: "docs/screens",
  });
  assert.equal(DEFAULT_VOICE, "af_heart");
  // Neutral ink: every default colour is a grey (its channels within 24 of each other), so no hue of anyone's brand.
  for (const [k, hex] of Object.entries(DEFAULT_PALETTE)) {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(...ch) - Math.min(...ch) <= 24, `${k} ${hex} is not a neutral grey`);
  }
});

test("without a README or a repository of its own: the folder's name, no tagline, no url; screens default to a folder that exists", (t) => {
  const outer = scratch(t);
  git(outer, "init", "-q");
  git(outer, "remote", "add", "origin", "https://example.com/outer.git");
  const dir = join(outer, "plain-project");
  mkdirSync(join(dir, "docs", "assets"), { recursive: true });
  const c = guessConfig(dir);
  assert.equal(c.name, "plain-project");
  assert.equal(c.tagline, "");
  assert.equal(c.url, "", "a subfolder of another repository does not take that repository's remote");
  assert.deepEqual(c.mark, { glyph: "P" });
  assert.equal(c.screens, "docs/assets");
  assert.equal(basename(dir), "plain-project");
});

test("studio.yaml overrides the defaults; a partial palette keeps the default for the rest", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "README.md"), "# Guessed\n\nGuessed tagline.\n");
  mkdirSync(join(dir, ".jhon"));
  writeFileSync(join(dir, ".jhon", "studio.yaml"), [
    "name: Larder",
    'url: "https://example.com/larder"',
    "palette:",
    '  accent: "#7fd1b9"',
    "mark:",
    "  path: assets/logo.svg",
    "languages: [en]",
    "screens: screens",
    "voice: bf_emma",
    "",
  ].join("\n"));
  const c = loadConfig(dir);
  assert.equal(c.name, "Larder");
  assert.equal(c.tagline, "Guessed tagline.");
  assert.equal(c.url, "https://example.com/larder");
  assert.deepEqual(c.palette, { ...DEFAULT_PALETTE, accent: "#7fd1b9" });
  assert.deepEqual(c.mark, { path: "assets/logo.svg" });
  assert.deepEqual(c.languages, ["en"]);
  assert.equal(c.screens, "screens");
  assert.equal(c.voice, "bf_emma");
});

test("studio.yaml is checked: unknown keys, bad colours, a mark with both or neither, a seal intro without a glyph", (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, ".jhon"));
  const bad: [string, RegExp][] = [
    ["nmae: x\n", /unknown key "nmae"/],
    ['palette:\n  accent: "rose"\n', /palette\.accent: "rose" is not a #rrggbb colour/],
    ['palette:\n  glow: "#ffffff"\n', /unknown key "palette\.glow"/],
    ["mark:\n  glyph: A\n  path: a.svg\n", /mark: one of glyph or path/],
    ["mark:\n  glyph: AB\n", /mark\.glyph: one character/],
    ["intro: seal\nmark:\n  path: a.svg\n", /intro: seal needs a glyph mark/],
    ["intro: spin\n", /intro: flat or seal/],
    ["languages: [en, fr]\n", /languages: .*en, es/],
  ];
  for (const [yaml, re] of bad) {
    writeFileSync(join(dir, ".jhon", "studio.yaml"), yaml);
    assert.throws(() => loadConfig(dir), re, yaml);
  }
});

test("derivePalette gives the template every colour it paints with, from the four the project sets", () => {
  const p = derivePalette({ accent: "#7fd1b9", accent_fill: "#1f4a40", ink: "#eef4f1", page: "#141a19" });
  for (const k of ["page", "ink", "soft", "faint", "line", "accent", "accent-fill", "accent-ink", "frame", "frame-soft", "space", "stage", "card", "wall"]) {
    assert.match(p[k] ?? "", /^#[0-9a-f]{6}$/, k);
  }
  assert.equal(p.accent, "#7fd1b9");
  assert.equal(p["accent-fill"], "#1f4a40");
});

test("tool locations: JHON_STUDIO_* first, the old JHON_MEDIA_* names as fallbacks, then ~/.cache/jhon-studio", (t) => {
  const home = scratch(t);
  assert.equal(kokoroDir({ JHON_STUDIO_KOKORO: "/new", JHON_MEDIA_KOKORO: "/old" }, home), "/new");
  assert.equal(kokoroDir({ JHON_MEDIA_KOKORO: "/old" }, home), "/old");
  assert.equal(kokoroDir({}, home), join(home, ".cache", "jhon-studio", "kokoro"));
  mkdirSync(join(home, ".cache", "jhon-media", "kokoro"), { recursive: true });
  assert.equal(kokoroDir({}, home), join(home, ".cache", "jhon-media", "kokoro"), "an existing old cache is used when the new one is absent");
  assert.equal(chromePath({ JHON_STUDIO_CHROME: "/new/chrome", JHON_MEDIA_CHROME: "/old/chrome" }, home), "/new/chrome");
  assert.equal(chromePath({ JHON_MEDIA_CHROME: "/old/chrome" }, home), "/old/chrome");
  assert.equal(chromePath({}, home), "");
  const bin = join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell", "linux-152.0.7977.30", "chrome-headless-shell-linux64");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "chrome-headless-shell"), "");
  assert.equal(chromePath({}, home), join(bin, "chrome-headless-shell"));
});
