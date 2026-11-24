/**
 * The repository is generic: no file but LICENSE, CHANGELOG.md and README.md names the core's
 * repository, carries its seal glyph or paints with its rose palette.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CORE_REPO, CORE_SEAL, ROOT, ROSE_HEX, ROSE_RGB } from "./helpers.ts";

const ALLOWED = new Set(["LICENSE", "CHANGELOG.md", "README.md"]);
const BINARY = /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|mp4|opus|wav|onnx|bin)$/i;

/** The files the repository would commit: git's view (tracked and not ignored), else a walk without .git, node_modules and odd/. */
function files(): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\0").filter(Boolean);
  } catch {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if ([".git", "node_modules", "odd"].includes(n)) return [];
      return statSync(p).isDirectory() ? walk(p) : [relative(ROOT, p)];
    });
    return walk(ROOT);
  }
}

test("no file outside LICENSE, CHANGELOG and README carries the core's repository name, seal glyph or rose palette", () => {
  const all = files();
  assert.ok(all.includes("engine/motion.js") && all.includes("test/hygiene.test.ts"), "the walk sees the repository");
  const found: string[] = [];
  for (const f of all) {
    if (ALLOWED.has(f) || BINARY.test(f)) continue;
    let text: string;
    try { text = readFileSync(join(ROOT, f), "utf8").toLowerCase(); } catch { continue; }
    for (const s of [CORE_REPO, CORE_SEAL, ...ROSE_HEX, ...ROSE_RGB]) if (text.includes(s)) found.push(`${f}: ${JSON.stringify(s)}`);
  }
  assert.deepEqual(found, []);
});
