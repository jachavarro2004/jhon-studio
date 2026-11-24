/**
 * src/config.ts — a project's studio settings, and where the studio and its tools live.
 *
 * A project's settings are .jhon/studio.yaml (src/yaml.ts's subset) over defaults guessed from
 * the project itself: the name and tagline from its README's H1 and first sentence, the url from
 * its git remote (only when the project is the repository's root), a neutral ink palette, the
 * name's initial in a square as the mark, the flat 2D intro, Kokoro's af_heart voice, English and
 * Spanish, and the first screens folder that exists.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.ts";

/** The studio's own folder (engine/, templates/, fonts/, vendor/, voice/). */
export const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The HyperFrames CLI the studio renders with, run through npx. */
export const HYPERFRAMES = "hyperframes@0.9.58";

/** Kokoro's voice for the narration, when the project names none. */
export const DEFAULT_VOICE = "af_heart";
/** The palette when the project sets none: neutral ink, no brand's hue. */
export const DEFAULT_PALETTE: Palette = { accent: "#d2d6dc", accent_fill: "#373b41", ink: "#eef0f2", page: "#18191c" };
export const LANGUAGES = ["en", "es"] as const;
/** Where a project's screens are looked for, in order; the first is the default when none exists. */
const SCREEN_DIRS = ["docs/screens", "docs/assets", "screens", "assets"];

export interface Palette { accent: string; accent_fill: string; ink: string; page: string }
export type Mark = { glyph: string } | { path: string };
export interface Config {
  name: string;
  tagline: string;
  url: string;
  palette: Palette;
  mark: Mark;
  intro: "flat" | "seal";
  voice: string;
  languages: string[];
  screens: string;
}

export class ConfigError extends Error {}

/** The config file of a project. */
export const configFile = (project: string) => join(project, ".jhon", "studio.yaml");

// ---- Guessing from the project

/** Markdown inline markup dropped: images, links (their text kept), emphasis, code, HTML tags. */
function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|\*|`)/g, "")
    .replace(/(^|\W)_{1,2}([^_]+?)_{1,2}(?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** The README's H1 and the first sentence of its first paragraph of prose. */
export function readmeFacts(project: string): { name: string; tagline: string } {
  const file = ["README.md", "readme.md", "Readme.md", "README"].map((f) => join(project, f)).find((f) => existsSync(f));
  if (!file) return { name: "", tagline: "" };
  const lines = readFileSync(file, "utf8").replace(/\r\n?/g, "\n").split("\n");
  let name = "", i = 0;
  for (; i < lines.length; i++) {
    const h = lines[i]!.match(/^#\s+(.+?)\s*#*\s*$/);
    if (h) { name = plain(h[1]!); i++; break; }
    if (i + 1 < lines.length && /^=+\s*$/.test(lines[i + 1]!) && lines[i]!.trim()) { name = plain(lines[i]!); i += 2; break; }
  }
  if (!name) i = 0;
  let para: string[] = [], fence = false;
  for (; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (l.startsWith("```")) { fence = !fence; continue; }
    if (fence) continue;
    if (l === "") { if (para.length) break; continue; }
    if (/^(#|>|<|\||[-*+] |\d+\. |!\[|\[!\[|---|===)/.test(l)) { if (para.length) break; continue; }
    const text = plain(l);
    if (!text) { if (para.length) break; continue; }
    para.push(text);
  }
  const prose = para.join(" ");
  const m = prose.match(/^.*?[.!?](?=\s|$)/);
  return { name, tagline: (m ? m[0] : prose).trim() };
}

/** The project's git remote as a web url, when the project is its repository's root; else "". */
export function remoteUrl(project: string): string {
  const git = (...args: string[]) => execFileSync("git", ["-C", project, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    if (realpathSync(git("rev-parse", "--show-toplevel")) !== realpathSync(project)) return "";
    const remotes = git("remote").split("\n").filter(Boolean);
    if (!remotes.length) return "";
    const url = git("remote", "get-url", remotes.includes("origin") ? "origin" : remotes[0]!);
    const scp = url.match(/^[^@/]+@([^:/]+):(.+)$/);
    const web = scp ? `https://${scp[1]}/${scp[2]}` : url.replace(/^(ssh|git):\/\/(?:[^@/]+@)?/, "https://");
    return web.replace(/\.git$/, "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** The first letter or digit of a name, as the default mark. */
const initial = (name: string) => ([...name].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "?").toUpperCase();

/** The defaults for a project, guessed from its README, its remote and its folders. */
export function guessConfig(project: string): Config {
  const facts = readmeFacts(project);
  const name = facts.name || basename(resolve(project));
  return {
    name,
    tagline: facts.tagline,
    url: remoteUrl(project),
    palette: { ...DEFAULT_PALETTE },
    mark: { glyph: initial(name) },
    intro: "flat",
    voice: DEFAULT_VOICE,
    languages: [...LANGUAGES],
    screens: SCREEN_DIRS.find((d) => existsSync(join(project, d)) && statSync(join(project, d)).isDirectory()) ?? SCREEN_DIRS[0]!,
  };
}

// ---- Reading .jhon/studio.yaml

const KEYS = ["name", "tagline", "url", "palette", "mark", "intro", "voice", "languages", "screens"];
const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The project's settings: its studio.yaml over the guessed defaults, checked. */
export function loadConfig(project: string): Config {
  const c = guessConfig(project);
  const file = configFile(project);
  if (!existsSync(file)) return c;
  let doc: Record<string, unknown>;
  try {
    doc = parseYaml(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ConfigError(`.jhon/studio.yaml: ${(e as Error).message}`);
  }
  const bad = (msg: string): never => { throw new ConfigError(`.jhon/studio.yaml: ${msg}`); };
  const str = (k: string, v: unknown) => (typeof v === "string" ? v : v === null ? "" : bad(`${k}: a string`));
  for (const k of Object.keys(doc)) if (!KEYS.includes(k)) bad(`unknown key "${k}" (known: ${KEYS.join(", ")})`);
  if ("name" in doc && doc.name !== null) c.name = str("name", doc.name) || c.name;
  if ("tagline" in doc) c.tagline = str("tagline", doc.tagline);
  if ("url" in doc) c.url = str("url", doc.url);
  if ("voice" in doc && doc.voice !== null) c.voice = str("voice", doc.voice);
  if ("screens" in doc && doc.screens !== null) c.screens = str("screens", doc.screens);
  if ("palette" in doc && doc.palette !== null) {
    if (!isMap(doc.palette)) bad("palette: a mapping of accent, accent_fill, ink, page");
    for (const [k, v] of Object.entries(doc.palette as Record<string, unknown>)) {
      if (!(k in DEFAULT_PALETTE)) bad(`unknown key "palette.${k}" (known: ${Object.keys(DEFAULT_PALETTE).join(", ")})`);
      if (typeof v !== "string" || !HEX.test(v)) bad(`palette.${k}: ${JSON.stringify(v)} is not a #rrggbb colour (quote it: "#1a2b3c")`);
      c.palette[k as keyof Palette] = (v as string).toLowerCase();
    }
  }
  if ("mark" in doc && doc.mark !== null) {
    const m = doc.mark;
    if (!isMap(m)) bad("mark: a mapping with glyph or path");
    const keys = Object.keys(m as object);
    if (keys.length !== 1 || !["glyph", "path"].includes(keys[0]!)) bad("mark: one of glyph or path");
    const v = (m as Record<string, unknown>)[keys[0]!];
    if (typeof v !== "string" || !v) bad(`mark.${keys[0]}: a string`);
    if (keys[0] === "glyph" && [...(v as string)].length !== 1) bad(`mark.glyph: one character, got ${JSON.stringify(v)}`);
    c.mark = keys[0] === "glyph" ? { glyph: v as string } : { path: v as string };
  }
  if ("intro" in doc && doc.intro !== null) {
    if (doc.intro !== "flat" && doc.intro !== "seal") bad(`intro: flat or seal, got ${JSON.stringify(doc.intro)}`);
    c.intro = doc.intro as "flat" | "seal";
  }
  if (c.intro === "seal" && !("glyph" in c.mark)) bad("intro: seal needs a glyph mark (mark: glyph: X); a logo opens with the flat intro");
  if ("languages" in doc && doc.languages !== null) {
    const l = doc.languages;
    if (!Array.isArray(l) || !l.length || l.some((x) => !(LANGUAGES as readonly unknown[]).includes(x))) bad(`languages: a list of ${LANGUAGES.join(", ")}, got ${JSON.stringify(l)}`);
    c.languages = [...new Set(l as string[])];
  }
  return c;
}

// ---- Colours

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** `a` mixed toward `b` by `t` (0: a, 1: b). */
export const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i]! - v) * t));

/**
 * Every colour the template paints with, from the four a project sets: the text tones between
 * ink and page, the accent's ink, the frames and the dark stage under the shots.
 */
export function derivePalette(p: Palette): Record<string, string> {
  const black = "#000000", white = "#ffffff";
  return {
    page: p.page,
    ink: p.ink,
    soft: mix(p.ink, p.page, 0.12),
    faint: mix(p.ink, p.page, 0.42),
    line: mix(p.ink, p.page, 0.72),
    accent: p.accent,
    "accent-fill": p.accent_fill,
    "accent-ink": mix(p.accent, white, 0.22),
    frame: mix(p.page, black, 0.3),
    "frame-soft": mix(p.accent, p.page, 0.5),
    space: mix(p.page, black, 0.62),
    stage: mix(p.page, black, 0.5),
    card: mix(p.page, black, 0.18),
    wall: mix(p.page, black, 0.25),
  };
}

// ---- Tools

/** Kokoro's folder (venv/ and model/): $JHON_STUDIO_KOKORO, $JHON_MEDIA_KOKORO, ~/.cache/jhon-studio/kokoro (or the old ~/.cache/jhon-media/kokoro when only it exists). */
export function kokoroDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (env.JHON_STUDIO_KOKORO) return env.JHON_STUDIO_KOKORO;
  if (env.JHON_MEDIA_KOKORO) return env.JHON_MEDIA_KOKORO;
  const fresh = join(home, ".cache", "jhon-studio", "kokoro"), old = join(home, ".cache", "jhon-media", "kokoro");
  return !existsSync(fresh) && existsSync(old) ? old : fresh;
}

/** chrome-headless-shell: $JHON_STUDIO_CHROME, $JHON_MEDIA_CHROME, else the newest the HyperFrames CLI keeps; "" when there is none. */
export function chromePath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (env.JHON_STUDIO_CHROME) return env.JHON_STUDIO_CHROME;
  if (env.JHON_MEDIA_CHROME) return env.JHON_MEDIA_CHROME;
  const root = join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (!existsSync(root)) return "";
  for (const v of readdirSync(root).sort().reverse()) {
    const dir = join(root, v);
    if (!statSync(dir).isDirectory()) continue;
    for (const sub of readdirSync(dir).sort()) {
      const bin = join(dir, sub, "chrome-headless-shell");
      if (sub.startsWith("chrome-headless-shell") && existsSync(bin)) return bin;
    }
  }
  return "";
}
