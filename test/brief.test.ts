/**
 * `jhon-studio video brief <src>` (src/brief.ts): a brief from the project's README, a change's
 * proposal (openspec/ or ldd/), a release's notes (its CHANGELOG section, else its git log) or any
 * file, written to .jhon/studio/<video>/brief.md by text extraction alone (no model).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, sampleCopy, scratch } from "./helpers.ts";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd, stdio: "pipe" });

/** A project folder with a README and the files given. */
function project(t: { after: (fn: () => void) => void }, files: Record<string, string>): string {
  const dir = join(scratch(t), "tidy");
  for (const [f, text] of Object.entries({ "README.md": "# Tidy\n\nTidy keeps your notes in plain text. It is for people who write every day.\n", ...files })) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}

test("brief readme: the sample's name, tagline, url, what it is, its features and its screens, in .jhon/studio/tour/brief.md", (t) => {
  const { project: dir } = sampleCopy(t);
  const r = cli(["video", "brief", "readme", "--project", dir]);
  assert.equal(r.code, 0, r.stderr);
  const file = join(dir, ".jhon", "studio", "tour", "brief.md");
  assert.equal(r.stdout, `wrote ${file}\n`);
  const brief = readFileSync(file, "utf8");
  for (const line of [
    "# Brief: Larder (tour)",
    "Source: readme (README.md).",
    "- Name: Larder",
    "- Tagline: Cook from what you already have.",
    "- URL: https://example.com/larder",
    "- Narration: en; subtitles: es",
    "Larder plans a week of dinners from what is already in your pantry.",
    "- Keeps the pantry: every item, its amount, and what to use soon.",
    "- Plans seven dinners that use what is about to spoil first.",
    "- Writes a shopping list of only what is missing.",
    "- pantry.png (1600x900, screens/pantry.png)",
    "- week.png (1600x900, screens/week.png)",
  ]) assert.ok(brief.includes(line), `the brief has ${JSON.stringify(line)}:\n${brief}`);
  assert.equal(cli(["video", "brief", "readme", "--project", dir]).code, 0);
  assert.equal(readFileSync(file, "utf8"), brief, "the same source gives the same brief");
});

test("brief readme: numbers become facts, a 'who' section or sentence says who it is for, --video names the folder", (t) => {
  const dir = project(t, {
    "README.md": "# Tidy\n\nTidy keeps your notes in plain text. It cuts search time by 40% on a 10,000-note vault.\n\n## Features\n\n- Plain text, always\n- Search in 30 ms\n\n## Who it is for\n\nWriters and researchers with a lot of notes.\n",
  });
  const r = cli(["video", "brief", "readme", "--project", dir, "--video", "launch"]);
  assert.equal(r.code, 0, r.stderr);
  const brief = readFileSync(join(dir, ".jhon", "studio", "launch", "brief.md"), "utf8");
  assert.match(brief, /## Who it is for\n\nWriters and researchers with a lot of notes\.\n/);
  assert.match(brief, /Numbers:\n- It cuts search time by 40% on a 10,000-note vault\.\n- Search in 30 ms\n/);
  assert.match(brief, /Features:\n- Plain text, always\n- Search in 30 ms\n/);
  assert.match(brief, /## Screens\n\nNone yet:/, "no screens folder: the brief says so");
  const plain = project(t, {});
  assert.equal(cli(["video", "brief", "readme", "--project", plain]).code, 0);
  assert.match(readFileSync(join(plain, ".jhon", "studio", "tour", "brief.md"), "utf8"), /## Who it is for\n\nIt is for people who write every day\.\n/);
});

test("brief ldd:<change>: the proposal's why and what changes, the design's decisions, the tasks done, from openspec/ or ldd/", (t) => {
  const dir = project(t, {
    "openspec/changes/add-export/proposal.md": "# Add export\n\n## Why\n\nNotes are stuck in Tidy. Export frees them.\n\n## What Changes\n\n- Export a note to Markdown\n- Export a folder to a zip\n",
    "openspec/changes/add-export/design.md": "# Design\n\n## Decisions\n\n### Zip with no compression\n\nFaster.\n",
    "openspec/changes/add-export/tasks.md": "## 1. Export\n\n- [x] 1.1 Markdown\n- [x] 1.2 Zip\n- [ ] 1.3 Docs\n",
    "ldd/changes/sync/proposal.md": "# Sync\n\n## Why\n\nTwo laptops.\n",
  });
  const r = cli(["video", "brief", "ldd:add-export", "--project", dir]);
  assert.equal(r.code, 0, r.stderr);
  const brief = readFileSync(join(dir, ".jhon", "studio", "add-export", "brief.md"), "utf8");
  assert.match(brief, /^# Brief: Tidy \(add-export\)\n/);
  assert.match(brief, /Source: ldd:add-export \(openspec\/changes\/add-export\/: proposal\.md, design\.md, tasks\.md\)\./);
  assert.match(brief, /## What it is\n\nAdd export: Notes are stuck in Tidy\. Export frees them\.\n/);
  assert.match(brief, /Numbers:\n- 2 of 3 tasks done\n/);
  assert.match(brief, /Features:\n- Export a note to Markdown\n- Export a folder to a zip\n/);
  assert.match(brief, /Decisions:\n- Zip with no compression\n/);
  assert.equal(cli(["video", "brief", "ldd:sync", "--project", dir]).code, 0);
  assert.match(readFileSync(join(dir, ".jhon", "studio", "sync", "brief.md"), "utf8"), /ldd\/changes\/sync\/: proposal\.md/);
  const none = cli(["video", "brief", "ldd:missing", "--project", dir]);
  assert.equal(none.code, 1);
  assert.equal(none.stderr, `jhon-studio: no change "missing": neither openspec/changes/missing/ nor ldd/changes/missing/ has a proposal.md, design.md or tasks.md\n`);
});

test("brief release:<tag>: its CHANGELOG section, else the subjects of git log <previous tag>..<tag>", (t) => {
  const dir = project(t, {
    "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- Next thing\n\n## [1.2.0] - 2026-01-02\n\n### Added\n\n- Export to Markdown\n- 3 new themes\n\n### Fixed\n\n- Search on empty vaults\n\n## [1.1.0]\n\n- Old\n",
  });
  const r = cli(["video", "brief", "release:v1.2.0", "--project", dir]);
  assert.equal(r.code, 0, r.stderr);
  const brief = readFileSync(join(dir, ".jhon", "studio", "release-v1.2.0", "brief.md"), "utf8");
  assert.match(brief, /Source: release:v1\.2\.0 \(CHANGELOG\.md, \[1\.2\.0\] - 2026-01-02\)\./);
  assert.match(brief, /## What it is\n\nTidy v1\.2\.0: 2 added, 1 fixed\.\n/);
  assert.match(brief, /Features:\n- Added: Export to Markdown\n- Added: 3 new themes\n- Fixed: Search on empty vaults\n/);
  assert.match(brief, /Numbers:\n- 2 added, 1 fixed\n- Added: 3 new themes\n/);

  const repo = project(t, {});
  git(repo, "init", "-q");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "First version");
  git(repo, "tag", "v1.0.0");
  for (const m of ["Add export", "Fix search"]) {
    writeFileSync(join(repo, "notes.txt"), m);
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", m);
  }
  git(repo, "tag", "v1.1.0");
  const g = cli(["video", "brief", "release:v1.1.0", "--project", repo]);
  assert.equal(g.code, 0, g.stderr);
  const gb = readFileSync(join(repo, ".jhon", "studio", "release-v1.1.0", "brief.md"), "utf8");
  assert.match(gb, /Source: release:v1\.1\.0 \(git log v1\.0\.0\.\.v1\.1\.0\)\./);
  assert.match(gb, /Numbers:\n- 2 commits since v1\.0\.0\n/);
  assert.match(gb, /Features:\n- Add export\n- Fix search\n/);
  const none = cli(["video", "brief", "release:v9", "--project", repo]);
  assert.equal(none.code, 1);
  assert.equal(none.stderr, `jhon-studio: no release "v9": no CHANGELOG section for it and no such git tag\n`);
});

test("brief <file>: any Markdown or text file in the project; a missing source is refused and nothing is written", (t) => {
  const dir = project(t, { "docs/pitch.md": "# The pitch\n\nTidy turns 3 folders of notes into one.\n\n- Fast\n- Plain\n" });
  const r = cli(["video", "brief", "docs/pitch.md", "--project", dir]);
  assert.equal(r.code, 0, r.stderr);
  const brief = readFileSync(join(dir, ".jhon", "studio", "pitch", "brief.md"), "utf8");
  assert.match(brief, /Source: docs\/pitch\.md\./);
  assert.match(brief, /## What it is\n\nThe pitch: Tidy turns 3 folders of notes into one\.\n/);
  assert.match(brief, /Numbers:\n- Tidy turns 3 folders of notes into one\.\n/);
  assert.match(brief, /Features:\n- Fast\n- Plain\n/);
  const missing = cli(["video", "brief", "docs/none.md", "--project", dir]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /^jhon-studio: no such file: .*docs\/none\.md \(a brief's source is readme, ldd:<change>, release:<tag> or a file\)\n$/);
  assert.ok(!existsSync(join(dir, ".jhon", "studio", "none")));
  const usage = cli(["video", "brief", "--project", dir]);
  assert.equal(usage.code, 2);
  assert.match(usage.stderr, /video brief: which source\? readme, ldd:<change>, release:<tag> or a file/);
});
