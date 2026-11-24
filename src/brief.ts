/**
 * src/brief.ts — a video's brief: what the script is written from, drafted from the project's
 * own text by extraction alone (no model, no network).
 *
 *   readme            the project's README
 *   ldd:<change>      a change's proposal.md, design.md and tasks.md, in openspec/changes/<change>/
 *                     or ldd/changes/<change>/
 *   release:<tag>     the tag's CHANGELOG section, else the subjects of git log <previous tag>..<tag>
 *   <file>            any Markdown or text file in the project
 *
 * Written to .jhon/studio/<video>/brief.md: the project (name, tagline, url, languages), what it
 * is, who it is for, the facts to show (sentences with numbers, features, decisions) and the
 * screens there are. The same source always gives the same brief; a person or an agent reads it,
 * corrects it and writes script.json from it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { plain, type Config } from "./config.ts";
import { imageSize } from "./compose.ts";
import { StudioError, studioDir } from "./video.ts";

// ---- Markdown, read for its prose: sections of paragraphs and list items.

interface Item { text: string; done?: boolean }
export interface Section { level: number; title: string; paras: string[]; items: Item[]; sub: Section[] }

/** Markdown as a flat list of sections (the text before the first heading is a section of level 0). */
export function sections(md: string): Section[] {
  const out: Section[] = [{ level: 0, title: "", paras: [], items: [], sub: [] }];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [], item: Item | null = null, fence = false, comment = false;
  const cur = () => out.at(-1)!;
  const flush = () => {
    if (para.length) { const p = plain(para.join(" ")); if (p) cur().paras.push(p); }
    if (item) { item.text = plain(item.text); if (item.text) cur().items.push(item); }
    para = []; item = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!, l = raw.trim();
    if (/^(```|~~~)/.test(l)) { flush(); fence = !fence; continue; }
    if (fence) continue;
    if (comment || l.startsWith("<!--")) { comment = !l.includes("-->"); flush(); continue; }
    const h = l.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    const setext = !h && l && i + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[i + 1]!.trim()) && !para.length && !item;
    if (h || setext) {
      flush();
      out.push({ level: h ? h[1]!.length : lines[i + 1]!.trim()[0] === "=" ? 1 : 2, title: plain(h ? h[2]! : l), paras: [], items: [], sub: [] });
      if (setext) i++;
      continue;
    }
    if (l === "") { flush(); continue; }
    if (/^(\||>|<|!\[|\[!\[|---|\*\*\*|___)/.test(l)) { flush(); continue; }
    const li = l.match(/^(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (li) {
      flush();
      item = { text: li[2]!, ...(li[1] !== undefined ? { done: li[1] !== " " } : {}) };
      continue;
    }
    if (item && /^\s/.test(raw)) { item.text += " " + l; continue; }
    if (item) flush();
    para.push(l);
  }
  flush();
  // Each section's subsections: the sections after it, deeper, until one at its level or above.
  out.forEach((s, k) => {
    for (let j = k + 1; j < out.length && out[j]!.level > s.level; j++) s.sub.push(out[j]!);
  });
  return out;
}

/** A paragraph's sentences. */
const sentences = (p: string) => p.split(/(?<=[.!?])\s+(?=["“(\p{Lu}\p{N}])/u).map((s) => s.trim()).filter(Boolean);
/** A sentence or item with a figure in it (a version or a date alone does not count). */
const hasNumber = (s: string) => /\d/.test(s.replace(/\bv?\d+(\.\d+){2,}\b|\b\d{4}-\d{2}-\d{2}\b/g, ""));
const FEATURES = /feature|what it does|what changes|highlights|capabilit|why use/i;
const WHO = /\bwho\b|audience|for whom|users?\b|use cases?/i;
const uniq = (xs: string[]) => [...new Set(xs)];

/** The first section matching a title, its subsections' prose included. */
const find = (secs: Section[], re: RegExp) => secs.find((s) => s.level > 0 && re.test(s.title));
const prose = (s: Section | undefined) => (s ? [...s.paras, ...s.sub.flatMap((x) => x.paras)] : []);
const items = (s: Section | undefined) => (s ? [...s.items, ...s.sub.flatMap((x) => x.items)].map((i) => i.text) : []);
/** The document's first paragraph, under its title or before it. */
const firstPara = (secs: Section[]) => secs.find((s) => s.level <= 1 && s.paras.length)?.paras[0] ?? secs.find((s) => s.paras.length)?.paras[0] ?? "";
const title = (secs: Section[]) => secs.find((s) => s.level === 1)?.title ?? "";
/** Who it is for: a section about it, else the sentences of the text that say "for" or "who". */
function whoFor(secs: Section[], text: string[]): string {
  const s = find(secs, WHO);
  if (s) { const p = prose(s)[0] ?? items(s).join("; "); if (p) return p; }
  return text.flatMap(sentences).filter((x) => /\bfor\s+\p{L}|\bwho\b/iu.test(x)).join(" ");
}
/** Features: the list under a features-like heading, else the document's first list. */
function features(secs: Section[]): string[] {
  const s = find(secs, FEATURES);
  const fromSection = items(s);
  if (fromSection.length) return fromSection;
  return secs.find((x) => x.items.length)?.items.map((i) => i.text) ?? [];
}
const numbers = (texts: string[]) => uniq(texts.flatMap((t) => (t.includes(". ") ? sentences(t) : [t])).filter(hasNumber));

// ---- Sources

export interface Brief {
  id: string;
  source: string;
  what: string;
  who: string;
  numbers: string[];
  features: string[];
  decisions: string[];
}

const README = ["README.md", "readme.md", "Readme.md", "README"];
const SOURCES = "a brief's source is readme, ldd:<change>, release:<tag> or a file";

/** The video id a source makes when none is named. */
export function defaultId(src: string): string {
  const id = src === "readme" ? "tour"
    : src.startsWith("ldd:") ? src.slice(4)
    : src.startsWith("release:") ? `release-${src.slice(8)}`
    : basename(src, extname(src));
  return id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "video";
}

/** Reads a source into a brief (nothing is written). */
export function readSource(project: string, config: Config, src: string): Omit<Brief, "id"> {
  if (src === "readme") {
    const f = README.find((n) => existsSync(join(project, n)));
    if (!f) throw new StudioError(`no README in ${project} (${SOURCES})`);
    const secs = sections(readFileSync(join(project, f), "utf8"));
    const what = firstPara(secs);
    const feats = features(secs);
    return { source: `readme (${f})`, what, who: whoFor(secs, [what]), numbers: numbers([...secs.flatMap((s) => s.paras), ...feats]), features: feats, decisions: [] };
  }
  if (src.startsWith("ldd:")) {
    const change = src.slice(4);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(change)) throw new StudioError(`ldd:${change}: a change is a folder name`, 2);
    const FILES = ["proposal.md", "design.md", "tasks.md"];
    const dir = ["openspec", "ldd"].map((root) => join(root, "changes", change)).find((d) => FILES.some((f) => existsSync(join(project, d, f))));
    if (!dir) throw new StudioError(`no change "${change}": neither openspec/changes/${change}/ nor ldd/changes/${change}/ has a proposal.md, design.md or tasks.md`);
    const read = (f: string) => (existsSync(join(project, dir, f)) ? sections(readFileSync(join(project, dir, f), "utf8")) : []);
    const [proposal, design, tasks] = FILES.map(read) as [Section[], Section[], Section[]];
    const why = prose(find(proposal, /^why/i));
    const changes = items(find(proposal, /what changes|changes|scope/i));
    const what = [title(proposal) || change, why.join(" ") || firstPara(proposal)].filter(Boolean).join(": ");
    const all = tasks.flatMap((s) => s.items).filter((i) => i.done !== undefined);
    const done = all.filter((i) => i.done).length;
    const designDecisions = find(design, /decision/i);
    const decisions = designDecisions ? designDecisions.sub.map((s) => s.title).concat(designDecisions.items.map((i) => i.text)) : design.filter((s) => s.level >= 2 && !/^(context|goals|non-goals|risks|open questions|migration)/i.test(s.title)).map((s) => s.title);
    return {
      source: `ldd:${change} (${dir}/: ${FILES.filter((f) => existsSync(join(project, dir, f))).join(", ")})`,
      what, who: whoFor(proposal, why),
      numbers: [...(all.length ? [`${done} of ${all.length} tasks done`] : []), ...numbers([...why, ...changes])],
      features: changes.length ? changes : features(proposal),
      decisions,
    };
  }
  if (src.startsWith("release:")) return release(project, config, src.slice(8));
  const file = isAbsolute(src) ? src : resolve(project, src);
  if (!existsSync(file) || !statSync(file).isFile()) throw new StudioError(`no such file: ${file} (${SOURCES})`);
  const secs = sections(readFileSync(file, "utf8"));
  const head = title(secs), para = firstPara(secs);
  const feats = features(secs);
  const rel = relative(project, file);
  return {
    source: rel.startsWith("..") ? file : rel,
    what: [head, para].filter(Boolean).join(": "),
    who: whoFor(secs, [para]), numbers: numbers([...secs.flatMap((s) => s.paras), ...feats]), features: feats, decisions: [],
  };
}

const vless = (s: string) => s.replace(/^v(?=\d)/, "");

/** A release: its CHANGELOG section, else its git log since the tag before it. */
function release(project: string, config: Config, tag: string): Omit<Brief, "id"> {
  if (!tag) throw new StudioError("release:<tag>: name the tag", 2);
  const log = ["CHANGELOG.md", "CHANGES.md", "HISTORY.md", "changelog.md"].find((f) => existsSync(join(project, f)));
  if (log) {
    const secs = sections(readFileSync(join(project, log), "utf8"));
    const s = secs.find((x) => x.level > 0 && vless((x.title.match(/^\[?([^\]\s(]+)/)?.[1] ?? "")) === vless(tag));
    if (s) {
      const groups = s.sub.filter((x) => x.items.length);
      const feats = groups.length ? groups.flatMap((g) => g.items.map((i) => `${g.title}: ${i.text}`)) : s.items.map((i) => i.text);
      const counts = groups.length ? groups.map((g) => `${g.items.length} ${g.title.toLowerCase()}`).join(", ") : `${feats.length} change${feats.length === 1 ? "" : "s"}`;
      return {
        source: `release:${tag} (${log}, ${s.title})`,
        what: `${config.name} ${tag}: ${counts}.${s.paras.length ? " " + s.paras.join(" ") : ""}`,
        who: "",
        numbers: uniq([counts, ...numbers([...s.paras, ...feats])]),
        features: feats, decisions: [],
      };
    }
  }
  const git = (...args: string[]) => execFileSync("git", ["-C", project, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`);
  } catch {
    throw new StudioError(`no release "${tag}": no CHANGELOG section for it and no such git tag`);
  }
  let prev = "";
  try { prev = git("describe", "--tags", "--abbrev=0", `${tag}^`); } catch { /* the first tag */ }
  const subjects = git("log", "--no-merges", "--reverse", "--format=%s", prev ? `${prev}..${tag}` : tag).split("\n").filter(Boolean);
  const count = `${subjects.length} commit${subjects.length === 1 ? "" : "s"}${prev ? ` since ${prev}` : ""}`;
  return {
    source: `release:${tag} (git log ${prev ? `${prev}..${tag}` : tag})`,
    what: `${config.name} ${tag}: ${count}.`,
    who: "",
    numbers: uniq([count, ...numbers(subjects)]),
    features: subjects, decisions: [],
  };
}

// ---- The brief's text

/** The screens a script may show: the files in the screens folder, or what capture makes. */
export function screenLines(config: Config, project: string, videoDir: string): string[] {
  if (config.captures) {
    return config.captures.map((c) => {
      const made = join(videoDir, "screens", c.name);
      const size = existsSync(made) ? `${sizeOf(made)}, ` : "";
      const from = c.kind === "file" ? c.file : c.kind === "web" ? `web: ${c.url}` : `cli: ${c.command.join(" ")}`;
      return `${c.name} (${size}${from}${existsSync(made) ? "" : "; run jhon-studio video capture"})`;
    });
  }
  const dir = resolve(project, config.screens);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter((f) => /\.(png|svg)$/i.test(f)).sort().map((f) => `${f} (${sizeOf(join(dir, f))}, ${join(config.screens, f)})`);
}
function sizeOf(file: string): string {
  try { const [w, h] = imageSize(file); return `${w}x${h}`; } catch { return "size unknown"; }
}

export function briefText(config: Config, b: Brief, screens: string[]): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const facts = [
    b.numbers.length ? `Numbers:\n${list(b.numbers)}` : "",
    b.features.length ? `Features:\n${list(b.features)}` : "",
    b.decisions.length ? `Decisions:\n${list(b.decisions)}` : "",
  ].filter(Boolean).join("\n\n") || "None found in the source: add the figures and features worth showing.";
  return `# Brief: ${config.name} (${b.id})

Source: ${b.source}. Drafted by \`jhon-studio video brief\` from the source's text alone: read
it, correct it, then write script.json (\`jhon-studio video script\` prints the shot model).

## The project

- Name: ${config.name}
- Tagline: ${config.tagline || "(none: set tagline in .jhon/studio.yaml)"}
- URL: ${config.url || "(none: set url in .jhon/studio.yaml)"}
- Narration: ${config.narration}; subtitles: ${config.subtitles.join(", ") || "none"}

## What it is

${b.what || "Not stated in the source."}

## Who it is for

${b.who || "Not stated in the source: say who it is for."}

## Facts to show

${facts}

## Screens

${screens.length ? list(screens) : `None yet: put PNG or SVG screens in ${config.captures ? "the list under screens:" : config.screens + "/"} (.jhon/studio.yaml screens: may list files, web pages and commands for \`jhon-studio video capture\`).`}
`;
}

/** Writes .jhon/studio/<id>/brief.md from a source; returns its path. */
export function writeBrief(project: string, config: Config, src: string, id?: string): string {
  const b = { ...readSource(project, config, src), id: id ?? defaultId(src) };
  const dir = join(studioDir(project), b.id);
  const text = briefText(config, b, screenLines(config, project, dir));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "brief.md");
  writeFileSync(file, text);
  return file;
}
