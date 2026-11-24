/**
 * The YAML subset studio.yaml is written in (src/yaml.ts): mappings by indentation, block and
 * flow lists of scalars, block lists of mappings, quoted and plain scalars, comments; anything
 * else is refused by line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYaml, stringifyYaml } from "../src/yaml.ts";

test("nested mappings, block and flow lists, quoted and plain scalars, comments", () => {
  const doc = parseYaml(`---
# a project's studio settings
name: Larder            # the wordmark
tagline: "Cook from what you already have: no waste."
url: https://example.com/larder
palette:
  accent: "#7fd1b9"
  accent_fill: '#1f4a40'
  ink: "#eef4f1"
mark:
  path: assets/logo.svg
languages: [en, "es"]
screens:
  - screens
  - docs/screens
voice: af_heart
fps: 30
ratio: 1.5
approved: true
nothing: null
empty:
quote: 'it''s fine'
escapes: "a\\"b\\tc\\u00e9"
`);
  assert.deepEqual(doc, {
    name: "Larder",
    tagline: "Cook from what you already have: no waste.",
    url: "https://example.com/larder",
    palette: { accent: "#7fd1b9", accent_fill: "#1f4a40", ink: "#eef4f1" },
    mark: { path: "assets/logo.svg" },
    languages: ["en", "es"],
    screens: ["screens", "docs/screens"],
    voice: "af_heart",
    fps: 30,
    ratio: 1.5,
    approved: true,
    nothing: null,
    empty: null,
    quote: "it's fine",
    escapes: "a\"b\tc\u00e9",
  });
});

test("an unquoted value starting with # is a comment, as in YAML; an empty document is an empty mapping", () => {
  assert.deepEqual(parseYaml("accent: #7fd1b9\n"), { accent: null });
  assert.deepEqual(parseYaml("# only a comment\n\n"), {});
});

test("what the subset does not support is refused with its line number", () => {
  const cases: [string, RegExp][] = [
    ["a: 1\n\tb: 2\n", /line 2: tabs/],
    ["a:\n  b: 1\n c: 2\n", /line 3: .*indent/],
    ["a: &x 1\n", /line 1: .*anchors/],
    ["a: |\n  text\n", /line 1: .*block scalars/],
    ["a: {b: 1}\n", /line 1: .*flow mappings/],
    ["a:\n  - - b\n", /line 2: .*nested lists/],
    ["a:\n  - b: 1\n   c: 2\n", /line 3: .*indent/],
    ["a: 1\na: 2\n", /line 2: .*duplicate key "a"/],
    ["just text\n", /line 1: expected "key: value"/],
    ['a: "open\n', /line 1: .*unterminated/],
  ];
  for (const [src, re] of cases) assert.throws(() => parseYaml(src), re, JSON.stringify(src));
});

test("a list of mappings, as studio.yaml's screens are written: each item's keys line up under its first, nested mappings and lists inside", () => {
  const doc = parseYaml(`screens:
  - file: docs/pantry.png
  - web:
      url: http://localhost:5173/week
      viewport: [1600, 900]
      steps:
        - click: "#plan"
        - fill: ["#search", "rice"]
        - wait: 300
      name: week
  -   cli:
        command: [larder, plan, --week]
        name: plan
subtitles:
- es
`);
  assert.deepEqual(doc, {
    screens: [
      { file: "docs/pantry.png" },
      { web: { url: "http://localhost:5173/week", viewport: [1600, 900], steps: [{ click: "#plan" }, { fill: ["#search", "rice"] }, { wait: 300 }], name: "week" } },
      { cli: { command: ["larder", "plan", "--week"], name: "plan" } },
    ],
    subtitles: ["es"],
  });
});

test("stringifyYaml writes what parseYaml reads back, quoting what would not survive plain", () => {
  const value = {
    name: "Larder",
    tagline: "Cook: from what you have # really",
    url: "",
    palette: { accent: "#7fd1b9", page: "#141a19" },
    mark: { glyph: "L" },
    languages: ["en", "es"],
    flag: "true",
    number: "30",
    voice: "af_heart",
  };
  const text = stringifyYaml(value);
  assert.match(text, /accent: "#7fd1b9"/);
  assert.match(text, /languages: \[en, es\]/);
  assert.deepEqual(parseYaml(text), value);
});
