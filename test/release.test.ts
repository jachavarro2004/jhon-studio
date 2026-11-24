/**
 * Versioned, signed releases (T15). src/version.ts is the one source of the version, the jhon it
 * needs and the release's signer; README's install lines, its required-jhon text and its
 * integration example, the CHANGELOG's section and the release workflow follow it (no hand copy
 * may drift). tools/pack.sh builds the release tarball, byte for byte the same from the same
 * files, holding exactly what runs the studio; tools/notes.sh prints a version's CHANGELOG
 * section, the release's notes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, scratch } from "./helpers.ts";
import { CONTRACT, REPOSITORY, REQUIRES_JHON, SCHEMA, SIGNER_IDENTITY, SIGNER_ISSUER, VERSION } from "../src/version.ts";

const README = readFileSync(join(ROOT, "README.md"), "utf8");
const CHANGELOG = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
const WORKFLOW = join(ROOT, ".github", "workflows", "release.yml");
const SKILL = readFileSync(join(ROOT, "plugin", "claude-code", "skills", "video", "SKILL.md"), "utf8");
const TARBALL = `jhon-studio-${VERSION}.tar.gz`;

/** What the release tarball holds: these folders and files, as the repository has them. */
const PACKED = ["bin", "src", "engine", "templates", "vendor", "voice", "fonts", "plugin", "LICENSE", "README.md", "CHANGELOG.md"];
const NEVER_PACKED = /^(test|examples|odd|docs|tools|\.github|node_modules)\/|^\.private-names$|^\.gitignore$/;

const run = (cmd: string, args: string[], cwd = ROOT) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** The install lines README must carry, built from the constants alone. */
function installBlock(): string {
  return [
    "```sh",
    `V=${VERSION}`,
    `R=https://github.com/${REPOSITORY}/releases/download/v$V`,
    "T=jhon-studio-$V.tar.gz",
    'cd "$(mktemp -d)"',
    'curl -fsSLO "$R/$T" -O "$R/$T.sha256" -O "$R/$T.sigstore.json"',
    'sha256sum -c "$T.sha256"',
    'cosign verify-blob --bundle "$T.sigstore.json" \\',
    `  --certificate-identity "https://github.com/${REPOSITORY}/.github/workflows/release.yml@refs/tags/v$V" \\`,
    `  --certificate-oidc-issuer ${SIGNER_ISSUER} "$T"`,
    "mkdir -p ~/.local/share/jhon-studio/$V ~/.local/bin",
    'tar -xzf "$T" -C ~/.local/share/jhon-studio/$V',
    "ln -sfn ~/.local/share/jhon-studio/$V/bin/jhon-studio ~/.local/bin/jhon-studio",
    "jhon-studio doctor",
    "```",
  ].join("\n");
}

// ---- the constants ----

test("the signer: the release workflow of this repository at a tag vX.Y.Z or vX.Y.Z-rc.N, through GitHub's OIDC", () => {
  assert.equal(REPOSITORY, "jachavarro2004/jhon-studio");
  assert.equal(SIGNER_ISSUER, "https://token.actions.githubusercontent.com");
  const id = new RegExp(SIGNER_IDENTITY);
  const at = (tag: string, repo = REPOSITORY, file = "release.yml") => `https://github.com/${repo}/.github/workflows/${file}@refs/tags/${tag}`;
  for (const tag of [`v${VERSION}`, "v0.1.0", "v0.1.0-rc.1", "v1.20.3-rc.12"]) assert.ok(id.test(at(tag)), tag);
  for (const bad of [at("v0.1"), at("v0.1.0-beta.1"), at("v01.0.0"), at("v0.1.0", "someone/jhon-studio"), at("v0.1.0", REPOSITORY, "ci.yml"), at("v0.1.0").replace("refs/tags", "refs/heads")]) {
    assert.ok(!id.test(bad), bad);
  }
});

// ---- README ----

test("README installs the release VERSION names: download, sha256, the cosign bundle, a folder per version, the link", () => {
  assert.ok(README.includes(installBlock()), `README's install block is not:\n${installBlock()}`);
  const install = README.slice(README.indexOf("## Install"), README.indexOf("\n## ", README.indexOf("## Install") + 1));
  assert.ok(install.includes(installBlock()), "the block is in ## Install");
  assert.doesNotMatch(install, /git clone/, "a release, not a clone, is the install");
});

test("README's `git clone` is the development install only", () => {
  const dev = README.indexOf("## Development");
  assert.ok(dev > 0, "a Development section");
  const clones = [...README.matchAll(/git clone/g)].map((m) => m.index!);
  assert.ok(clones.length > 0, "the development install is a clone");
  const next = README.indexOf("\n## ", dev + 1);
  for (const at of clones) assert.ok(at > dev && (next < 0 || at < next), "git clone only under ## Development");
});

test("README carries no hand copy of the version, the jhon it needs, the contract or the schema that differs from src/version.ts", () => {
  // The compatibility table keeps a row per release: an older release's row keeps its own values.
  const current = README.split("\n").filter((l) => !/^\| \d+\.\d+\.\d+\S* \|/.test(l) || l.startsWith(`| ${VERSION} |`)).join("\n");
  assert.ok(README.includes(`\n| ${VERSION} | \`${REQUIRES_JHON}\` | \`${CONTRACT}\` |\n`), "the compatibility row of this release");
  const versions = [...current.matchAll(/\bV=(\S+)|jhon-studio-(\d[^\s/"`]*?)\.tar\.gz|"version": "([^"]+)"|jhon-studio\/(\d+\.\d+\.\d+[^/\s]*)\/|\b(?:release|version),? (\d+\.\d+\.\d+(?:-rc\.\d+)?)\b/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
  assert.ok(versions.length >= 4, `README names the version: ${versions}`);
  for (const v of versions) assert.equal(v, VERSION);
  const ranges = [...current.matchAll(/(?:>=|<=|>|<)\s*\d+\.\d+\.\d+[0-9A-Za-z.+-]*/g)].map((m) => m[0]);
  assert.ok(ranges.length >= 2, "README says what jhon it needs");
  for (const r of ranges) assert.equal(r, REQUIRES_JHON);
  for (const c of README.match(/jhon\.integration\/v\d+/g) ?? []) assert.equal(c, CONTRACT);
  for (const s of README.match(/jhon-studio\.integration\/v\d+/g) ?? []) assert.equal(s, SCHEMA);
  assert.ok(README.includes(CONTRACT) && README.includes(SCHEMA));
});

test("README's integration --json example has the real fields, in order, and the constants' values", () => {
  const block = [...README.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]!).find((b) => b.includes("plugin_dir"));
  assert.ok(block, "an example with plugin_dir");
  const j = JSON.parse(block!);
  assert.deepEqual(Object.keys(j), ["schema", "version", "requires_jhon", "contract", "plugin_dir", "skill"]);
  assert.deepEqual([j.schema, j.version, j.requires_jhon, j.contract], [SCHEMA, VERSION, REQUIRES_JHON, CONTRACT]);
});

test("README has a Releases section: versions, the signature check, compatibility with jhon", () => {
  const at = README.indexOf("\n## Releases\n");
  assert.ok(at > 0, "## Releases");
  const s = README.slice(at, README.indexOf("\n## ", at + 1));
  for (const want of ["CHANGELOG.md", "-rc.", "sha256", "cosign verify-blob", SIGNER_ISSUER, REQUIRES_JHON, "requires_jhon", CONTRACT]) {
    assert.ok(s.includes(want), `Releases names ${want}`);
  }
});

test("the video skill carries no copy of the version, the range or an install line", () => {
  assert.doesNotMatch(SKILL, /(?:>=|<=)\s*\d+\.\d+/);
  assert.doesNotMatch(SKILL, /jhon-studio-\d|git clone|releases\/download/);
});

// ---- CHANGELOG and the release notes ----

test("CHANGELOG has a section for VERSION, and tools/notes.sh prints it alone", () => {
  assert.match(CHANGELOG, new RegExp(`^## \\[${VERSION.replace(/\./g, "\\.")}\\]`, "m"));
  const r = run(join(ROOT, "tools", "notes.sh"), [VERSION]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.match(r.stdout, /^### Added\n/m);
  assert.doesNotMatch(r.stdout, /^## /m, "up to the next version's heading");
  const start = CHANGELOG.indexOf(`## [${VERSION}]`);
  const body = CHANGELOG.slice(CHANGELOG.indexOf("\n", start) + 1, (CHANGELOG.indexOf("\n## ", start + 1) + 1 || CHANGELOG.length + 1) - 1);
  assert.equal(r.stdout.trim(), body.trim());
});

test("tools/notes.sh refuses a version CHANGELOG has no section for, and no version", () => {
  const r = run(join(ROOT, "tools", "notes.sh"), ["9.9.9"]);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "notes.sh: CHANGELOG.md has no section ## [9.9.9]\n");
  const u = run(join(ROOT, "tools", "notes.sh"), []);
  assert.equal(u.code, 2);
  assert.equal(u.stdout, "");
  assert.match(u.stderr, /^usage: tools\/notes\.sh <version>\n$/);
});

// ---- the tarball ----

/** The repository's files under PACKED (tracked, or new and not ignored), that exist, sorted as bytes. */
function intended(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...PACKED], { cwd: ROOT, encoding: "utf8" });
  return [...new Set(out.split("\0").filter(Boolean))].filter((f) => existsSync(join(ROOT, f))).sort((a, b) => (Buffer.from(a) < Buffer.from(b) ? -1 : a === b ? 0 : 1));
}

function pack(t: { after: (fn: () => void) => void }) {
  const out = join(scratch(t), "dist");
  const r = run(join(ROOT, "tools", "pack.sh"), [out]);
  return { out, ...r };
}

test("tools/pack.sh writes jhon-studio-<VERSION>.tar.gz and its .sha256, and prints the tarball's path", (t) => {
  const p = pack(t);
  assert.equal(p.code, 0, p.stderr);
  assert.equal(p.stderr, "");
  const tarball = join(realpathSync(p.out), TARBALL);
  assert.equal(p.stdout, `${tarball}\n`);
  assert.equal(readFileSync(`${tarball}.sha256`, "utf8"), `${sha256(tarball)}  ${TARBALL}\n`, "the sha256sum -c format");
  assert.equal(run("sha256sum", ["-c", `${TARBALL}.sha256`], p.out).code, 0);
});

test("the tarball holds exactly the studio's files: bin, src, engine, templates, vendor, voice, fonts, plugin, LICENSE, README, CHANGELOG", (t) => {
  const p = pack(t);
  assert.equal(p.code, 0, p.stderr);
  const list = run("tar", ["-tzf", join(p.out, TARBALL)]).stdout.split("\n").filter(Boolean);
  assert.deepEqual(list, intended());
  for (const must of ["bin/jhon-studio", "src/cli.ts", "src/version.ts", "engine/motion.js", "templates/presentation/style.css", "voice/kokoro.py", "fonts/OFL.txt", "plugin/claude-code/.claude-plugin/plugin.json", "plugin/claude-code/skills/video/SKILL.md", "LICENSE", "README.md", "CHANGELOG.md"]) {
    assert.ok(list.includes(must), must);
  }
  assert.deepEqual(list.filter((f) => NEVER_PACKED.test(f) || !PACKED.some((r) => f === r || f.startsWith(`${r}/`))), []);
  const long = run("tar", ["-tvzf", join(p.out, TARBALL)]).stdout.split("\n").filter(Boolean);
  for (const l of long) assert.match(l, /^\S+ 0\/0 /, `owned by 0:0: ${l}`);
  assert.match(long.find((l) => l.endsWith(" bin/jhon-studio"))!, /^-rwxr-xr-x /, "the entry stays executable");
});

test("the same files pack to the same bytes", (t) => {
  const a = pack(t), b = pack(t);
  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.code, 0, b.stderr);
  assert.equal(sha256(join(a.out, TARBALL)), sha256(join(b.out, TARBALL)));
});

test("the unpacked tarball runs: --version is VERSION, integration --json names its own folder", (t) => {
  const p = pack(t);
  assert.equal(p.code, 0, p.stderr);
  const dir = join(scratch(t), VERSION);
  mkdirSync(dir);
  assert.equal(run("tar", ["-xzf", join(p.out, TARBALL), "-C", dir]).code, 0);
  const bin = join(dir, "bin", "jhon-studio");
  const v = run(bin, ["--version"], dir);
  assert.equal(v.code, 0, v.stderr);
  assert.equal(v.stdout, `${VERSION}\n`);
  const j = JSON.parse(run(bin, ["integration", "--json"], dir).stdout);
  assert.equal(j.plugin_dir, join(realpathSync(dir), "plugin", "claude-code"));
  assert.ok(existsSync(j.skill));
  assert.deepEqual([j.schema, j.version, j.requires_jhon, j.contract], [SCHEMA, VERSION, REQUIRES_JHON, CONTRACT]);
});

test("tools/pack.sh with no output folder is a usage error", () => {
  const r = run(join(ROOT, "tools", "pack.sh"), []);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "usage: tools/pack.sh <out-dir>\n");
});

// ---- the release workflow ----

test("release.yml: tags vX.Y.Z and vX.Y.Z-rc.N only, in this repository alone", () => {
  const w = readFileSync(WORKFLOW, "utf8");
  assert.match(w, /^on:\n  push:\n    tags:\n      - "v\*\.\*\.\*"\n\n/m, "a tag push is its only trigger");
  assert.doesNotMatch(w, /branches:|pull_request|workflow_dispatch/);
  assert.ok(w.includes(String.raw`grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.(0|[1-9][0-9]*))?$'`), "the tag's exact form is checked");
  const jobs = w.slice(w.indexOf("\njobs:\n")).split(/\n  (?=[a-z]+:\n)/).slice(1);
  assert.deepEqual(jobs.map((j) => j.slice(0, j.indexOf(":"))), ["tag", "build", "publish"]);
  for (const j of jobs) assert.ok(j.includes(`if: github.repository == '${REPOSITORY}'`), `${j.slice(0, 10)}: this repository only`);
  assert.match(w, /^permissions: \{\}$/m, "no permission unless a job asks");
});

test("release.yml runs the tests, refuses a tag that differs from VERSION, packs, signs and verifies with the constants' signer, publishes rc tags as pre-releases", () => {
  const w = readFileSync(WORKFLOW, "utf8");
  assert.ok(w.includes("node --experimental-strip-types --no-warnings --test test/*.test.ts"), "the test suite");
  assert.ok(w.includes("bin/jhon-studio --version"), "VERSION read from the source");
  assert.match(w, /differs from src\/version\.ts/);
  assert.ok(w.includes("tools/pack.sh") && w.includes("tools/notes.sh"));
  assert.ok(w.includes(`  SIGNER_ISSUER: ${SIGNER_ISSUER}\n`));
  assert.ok(w.includes(`  SIGNER_IDENTITY: ${SIGNER_IDENTITY}\n`), "the signer is src/version.ts's");
  assert.match(w, /id-token: write/);
  assert.match(w, /cosign sign-blob --yes --bundle "\$f\.sigstore\.json" "\$f"/);
  assert.match(w, /cosign verify-blob --bundle "\$f\.sigstore\.json"/);
  assert.match(w, /--prerelease --latest=false/);
  for (const ext of ["tar.gz", "tar.gz.sha256", "tar.gz.sigstore.json"]) assert.ok(w.includes(ext), ext);
  for (const uses of w.match(/uses: \S+/g) ?? []) assert.match(uses, /@[0-9a-f]{40}$/, `${uses}: pinned to a commit`);
});

// S4/T15 (verify B1, B2): every studio path a user copies is inside a version's folder; no clone-only update line.
test("every ~/.local/share/jhon-studio path a user copies is inside a version's folder (README, SECURITY)", () => {
  for (const file of ["README.md", "SECURITY.md"]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.doesNotMatch(text, /git -C ~\/\.local\/share\/jhon-studio/, `${file}: a release install is no clone`);
    const dev = text.indexOf("## Development");
    for (const m of text.matchAll(/~\/\.local\/share\/jhon-studio(\/[^\s"'`)]*)?/g)) {
      if (!m[1] || (dev > 0 && m.index! > dev)) continue;
      assert.match(m[1], /^\/(\$V|<version>|\d+\.\d+\.\d+(-rc\.\d+)?)(\/|$)/, `${file}: ${m[0]}`);
    }
  }
});

// S4/T15 (verify check 4): README's install block, run against a local copy of the release, installs VERSION
// and asks cosign for exactly the constants' signer.
test("README's install block installs VERSION from the release's assets and verifies the release workflow's signature", (t) => {
  const p = pack(t);
  assert.equal(p.code, 0, p.stderr);
  const s = realpathSync(scratch(t));
  const rel = join(s, "release", `v${VERSION}`);
  mkdirSync(rel, { recursive: true });
  for (const f of [TARBALL, `${TARBALL}.sha256`]) copyFileSync(join(p.out, f), join(rel, f));
  writeFileSync(join(rel, `${TARBALL}.sigstore.json`), "{}\n");
  const stub = join(s, "stub");
  mkdirSync(stub);
  writeFileSync(join(stub, "cosign"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(s, "cosign.args")}"\n`, { mode: 0o755 });
  const home = join(s, "home");
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  const block = installBlock().split("\n").slice(1, -1).filter((l) => l !== "jhon-studio doctor")
    .map((l) => (l.startsWith("R=") ? `R=file://${join(s, "release")}/v$V` : l)).join("\n");
  const r = spawnSync("bash", ["-euo", "pipefail", "-c", `${block}\njhon-studio --version`], {
    encoding: "utf8", env: { PATH: `${join(home, ".local", "bin")}:${stub}:${process.env.PATH}`, HOME: home, TMPDIR: s },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split("\n").at(-1), VERSION);
  const args = readFileSync(join(s, "cosign.args"), "utf8").trim().split("\n");
  assert.deepEqual(args, ["verify-blob", "--bundle", `${TARBALL}.sigstore.json`, "--certificate-identity",
    `https://github.com/${REPOSITORY}/.github/workflows/release.yml@refs/tags/v${VERSION}`, "--certificate-oidc-issuer", SIGNER_ISSUER, TARBALL]);
  assert.ok(new RegExp(SIGNER_IDENTITY).test(args[4]!), "README's identity is one the workflow's pattern accepts");
  assert.equal(realpathSync(join(home, ".local", "bin", "jhon-studio")), join(home, ".local", "share", "jhon-studio", VERSION, "bin", "jhon-studio"));
});
