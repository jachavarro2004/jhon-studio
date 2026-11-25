/**
 * README parity (presentation-identity S12): every Jhon repo's README has the same skeleton and
 * media GitHub actually renders. Banner, the repo's own line (L12: not the agent's tagline),
 * badges, a "See it" block (the sample film made by jhon-studio as a GitHub user-attachments
 * video behind an inline preview, the review contact sheet), what it is, install, use, how it
 * works (a diagram), docs, support, license. Never a relative <video> tag: GitHub does not play
 * it. The films are uploaded by hand; the MP4s are never committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.ts";

const README = readFileSync(join(ROOT, "README.md"), "utf8");
const ATTACHMENT = /https:\/\/github\.com\/user-attachments\/assets\/[0-9A-Za-z-]+/;
const PREVIEW = "docs/assets/sample-preview.webp";
const SHEET = "docs/assets/sample-review.png";

/** The text of a `## <title>` section, up to the next `## ` heading. */
function section(title: string): string {
  const at = README.indexOf(`\n## ${title}\n`);
  assert.ok(at > 0, `## ${title}`);
  const next = README.indexOf("\n## ", at + 1);
  return README.slice(at, next < 0 ? README.length : next);
}

test("README follows the shared skeleton: banner, its own line, badges, See it, What it is, Install, Use, How it works, Docs, Support, License", () => {
  const order = [
    '<img src="docs/assets/brand/jhon-banner.gif" alt="Jhon"',
    '<h1 align="center">jhon-studio — presentation videos for any project</h1>',
    'alt="License: Apache-2.0"',
    'alt="CI"',
    'alt="GitHub Sponsors"',
    'alt="Stars"',
    "\n## See it\n",
    "\n## What it is\n",
    "\n## Install\n",
    "\n## Use\n",
    "\n## How it works\n",
    "\n## Docs\n",
    "\n## Support jhon-studio\n",
    "\n## License\n",
  ];
  const at = order.map((s) => README.indexOf(s));
  order.forEach((s, i) => assert.ok(at[i]! >= 0, `README has ${JSON.stringify(s)}`));
  for (let i = 1; i < at.length; i++) assert.ok(at[i]! > at[i - 1]!, `${JSON.stringify(order[i])} comes after ${JSON.stringify(order[i - 1])}`);
  assert.ok(README.startsWith('<p align="center">\n  <img src="docs/assets/brand/jhon-banner.gif"'), "the banner opens the README");
  assert.doesNotMatch(README, /An agent framework for Claude Code and pi/, "jhon-studio says its own line, not the agent's tagline (L12)");
  assert.doesNotMatch(README, /^## The Jhon family/m, "no family section (S8)");
  assert.equal(README.indexOf("\n## ", at.at(-1)! + 1), -1, "nothing after ## License but its own subsections");
});

test("See it: the sample film behind an inline preview, Spanish subtitles folded, the review sheet; no <video> tag", () => {
  const s = section("See it");
  const preview = s.match(new RegExp(`<a href="(${ATTACHMENT.source})"><img src="${PREVIEW.replace(/\./g, "\\.")}" alt="[^"]+"`));
  assert.ok(preview, "the preview links to the English film's user-attachments URL");
  const details = s.match(/<details>\n<summary>With Spanish subtitles<\/summary>\n\n(\S+)\n\n<\/details>/);
  assert.ok(details, "a <details> 'With Spanish subtitles' holding one URL on its own line (GitHub plays it)");
  assert.match(details![1]!, new RegExp(`^${ATTACHMENT.source}$`));
  assert.notEqual(details![1], preview![1], "the Spanish film is its own upload");
  assert.ok(s.includes(`<img src="${SHEET}" alt="`), "the review contact sheet");
  // `<video>` in code (a fenced block or a code span) is text, the video's id; outside code it is a tag.
  const prose = README.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  assert.doesNotMatch(prose, /<video\b|<\/video>|<source\b/i, "GitHub does not play a <video> tag");
  for (const [file, max] of [[PREVIEW, 2.5e6], [SHEET, 600e3]] as const) {
    assert.ok(existsSync(join(ROOT, file)), file);
    assert.ok(statSync(join(ROOT, file)).size < max, `${file} is under ${max} bytes`);
  }
  const all = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n");
  assert.deepEqual(all.filter((f) => /\.(mp4|webm|mov)$/i.test(f)), [], "no film is committed: they are uploaded to GitHub");
});

test("How it works is a diagram GitHub renders (a mermaid block or an SVG in the repository)", () => {
  const s = section("How it works");
  const mermaid = /```mermaid\n[\s\S]+?\n```/.test(s);
  const svg = [...s.matchAll(/(?:!\[[^\]]*\]\(|<img src=")([^)"]+\.svg)/g)].map((m) => m[1]!);
  assert.ok(mermaid || svg.length > 0, "a diagram");
  for (const f of svg) assert.ok(existsSync(join(ROOT, f)), f);
});

// EXPECTED RED until the owner uploads the two films and the placeholders are replaced:
// it keeps the README from merging with STUDIO-SAMPLE-EN or STUDIO-SAMPLE-ES in it.
test("See it carries the uploaded films' user-attachments URLs, not placeholders", () => {
  assert.doesNotMatch(README, /STUDIO-SAMPLE-(EN|ES)/, "replace the placeholder film URLs with the uploaded ones");
});
