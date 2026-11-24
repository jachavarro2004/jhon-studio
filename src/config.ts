/**
 * src/config.ts — a project's studio settings, and where the studio and its tools live.
 *
 * A project's settings are .jhon/studio.yaml (src/yaml.ts's subset) over defaults guessed from
 * the project itself: the name and tagline from its README's H1 and first sentence, the url from
 * its git remote (only when the project is the repository's root), a neutral ink palette, the
 * name's initial in a square as the mark, the flat 2D intro, English narration (Kokoro's af_heart)
 * with Spanish subtitles, and the first screens folder that exists. `screens` may instead list
 * what `jhon-studio video capture` makes: files copied, web pages captured, commands run.
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

/** Kokoro's voice for each narration language, when the project names none (both in voices-v1.0.bin). */
export const DEFAULT_VOICES: Record<Lang, string> = { en: "af_heart", es: "ef_dora" };
/** The English narration's voice. */
export const DEFAULT_VOICE = DEFAULT_VOICES.en;
/** The palette when the project sets none: neutral ink, no brand's hue. */
export const DEFAULT_PALETTE: Palette = { accent: "#d2d6dc", accent_fill: "#373b41", ink: "#eef0f2", page: "#18191c" };
export const LANGUAGES = ["en", "es"] as const;
export type Lang = (typeof LANGUAGES)[number];
/** Where a project's screens are looked for, in order; the first is the default when none exists. */
const SCREEN_DIRS = ["docs/screens", "docs/assets", "screens", "assets"];

export interface Palette { accent: string; accent_fill: string; ink: string; page: string }
export type Mark = { glyph: string } | { path: string };
/** A web page's step before its capture. */
export type Step = { click: string } | { fill: [string, string] } | { wait: number | string } | { goto: string } | { scroll: number | string };
/** One screen `video capture` makes, as the file `name` in the video's screens/. */
export type Capture =
  | { kind: "file"; name: string; file: string }
  | { kind: "web"; name: string; url: string; viewport: [number, number]; scale: number; steps: Step[] }
  | { kind: "cli"; name: string; command: string[]; cols: number; timeout: number };
export interface Config {
  name: string;
  tagline: string;
  url: string;
  palette: Palette;
  mark: Mark;
  intro: "flat" | "seal";
  /** Kokoro's voice for the narration. */
  voice: string;
  /** The language the lines are spoken in. */
  narration: Lang;
  /** The languages the lines are subtitled in (never the narration's). */
  subtitles: Lang[];
  /** The renders: the narration's language (its captions where a shot asks), then one per subtitle language. */
  languages: Lang[];
  /** The folder a proof's src is in; "" when `captures` lists the screens (then: the video's screens/). */
  screens: string;
  /** What `video capture` makes, when studio.yaml lists screens; else null. */
  captures: Capture[] | null;
}

export class ConfigError extends Error {}

/** The config file of a project. */
export const configFile = (project: string) => join(project, ".jhon", "studio.yaml");

// ---- Guessing from the project

/** Markdown inline markup dropped: images, links (their text kept), emphasis, code, HTML tags. */
export function plain(md: string): string {
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
    narration: "en",
    subtitles: ["es"],
    languages: ["en", "es"],
    screens: SCREEN_DIRS.find((d) => existsSync(join(project, d)) && statSync(join(project, d)).isDirectory()) ?? SCREEN_DIRS[0]!,
    captures: null,
  };
}

/** The folder a video's proofs read their screens from: the project's screens folder, or the video's screens/ when studio.yaml lists what capture makes. */
export const screensDir = (c: Config, project: string, videoDir: string) => (c.captures ? join(videoDir, "screens") : resolve(project, c.screens));

// ---- Reading .jhon/studio.yaml

const KEYS = ["name", "tagline", "url", "palette", "mark", "intro", "voice", "narration", "subtitles", "languages", "screens"];
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
  if ("screens" in doc && doc.screens !== null) {
    if (Array.isArray(doc.screens)) { c.captures = captures(doc.screens, bad); c.screens = ""; }
    else c.screens = str("screens", doc.screens);
  }
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
  const isLang = (x: unknown): x is Lang => (LANGUAGES as readonly unknown[]).includes(x);
  if ("narration" in doc && doc.narration !== null) {
    if (!isLang(doc.narration)) bad(`narration: ${LANGUAGES.join(" or ")}, got ${JSON.stringify(doc.narration)}`);
    c.narration = doc.narration as Lang;
  }
  const others = LANGUAGES.filter((l) => l !== c.narration);
  c.subtitles = others;
  if ("languages" in doc && doc.languages !== null) {
    if (("subtitles" in doc && doc.subtitles !== null) || ("narration" in doc && doc.narration !== null)) bad("languages: the older spelling of narration and subtitles; use those alone");
    const l = doc.languages;
    if (!Array.isArray(l) || !l.length || l.some((x) => !isLang(x))) bad(`languages: a list of ${LANGUAGES.join(", ")}, got ${JSON.stringify(l)}`);
    c.subtitles = others.filter((o) => (l as unknown[]).includes(o));
  }
  if ("subtitles" in doc && doc.subtitles !== null) {
    const l = doc.subtitles;
    if (!Array.isArray(l) || l.some((x) => !isLang(x) || x === c.narration)) bad(`subtitles: the languages besides the narration's (${c.narration}), from ${LANGUAGES.join(", ")}; got ${JSON.stringify(l)}`);
    c.subtitles = [...new Set(l as Lang[])];
  }
  c.languages = [c.narration, ...c.subtitles];
  c.voice = "voice" in doc && doc.voice !== null ? str("voice", doc.voice) : DEFAULT_VOICES[c.narration];
  return c;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SCREEN_EXT = /\.(png|svg)$/i;
const STEPS = ["click", "fill", "wait", "goto", "scroll"];

/** studio.yaml's list of screens, checked: each item one of file, web or cli, its name unique. */
function captures(list: unknown[], bad: (msg: string) => never): Capture[] {
  const out: Capture[] = [];
  const named = new Map<string, number>();
  list.forEach((item, i) => {
    const at = `screens[${i}]`;
    if (!isMap(item)) bad(`${at}: a mapping with one of file, web or cli`);
    const m = item as Record<string, unknown>;
    const kinds = Object.keys(m).filter((k) => ["file", "web", "cli"].includes(k));
    if (kinds.length !== 1 || Object.keys(m).some((k) => !["file", "web", "cli", "name"].includes(k)) || ("name" in m && kinds[0] !== "file"))
      bad(`${at}: one of file, web or cli (a file may also have a name), got ${Object.keys(m).join(", ")}`);
    const kind = kinds[0]!;
    const nameOf = (v: unknown, where: string, ext: string) => {
      if (typeof v !== "string" || !NAME.test(v)) bad(`${where}: the screen's name, letters, digits, dots, dashes (a proof's src is <name>${ext})`);
      return (v as string).toLowerCase().endsWith(ext) ? (v as string) : `${v}${ext}`;
    };
    let c: Capture;
    if (kind === "file") {
      if (typeof m.file !== "string" || !m.file) bad(`${at}.file: the screen's path in the project`);
      const file = m.file as string;
      if (!SCREEN_EXT.test(file)) bad(`${at}.file: a PNG or an SVG, got ${JSON.stringify(file)}`);
      const name = "name" in m ? m.name : basename(file);
      if (typeof name !== "string" || !NAME.test(name) || !SCREEN_EXT.test(name)) bad(`${at}.name: a file name ending in .png or .svg`);
      c = { kind: "file", name: name as string, file };
    } else if (kind === "web") {
      const w = m.web;
      if (!isMap(w)) bad(`${at}.web: a mapping of url, name, viewport, scale, steps`);
      const unknown = Object.keys(w as object).filter((k) => !["url", "name", "viewport", "scale", "steps"].includes(k));
      if (unknown.length) bad(`${at}.web: unknown key "${unknown[0]}" (known: url, name, viewport, scale, steps)`);
      const { url, name, viewport = [1600, 900], scale = 1, steps = [] } = w as Record<string, unknown>;
      if (typeof url !== "string" || !url) bad(`${at}.web.url: the page's address (http, https or file)`);
      const vp = viewport as unknown[];
      if (!Array.isArray(vp) || vp.length !== 2 || vp.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 64 || v > 4096)) bad(`${at}.web.viewport: [width, height] in pixels, 64 to 4096`);
      if (typeof scale !== "number" || ![1, 2, 3].includes(scale)) bad(`${at}.web.scale: 1, 2 or 3 (device pixels per CSS pixel)`);
      if (!Array.isArray(steps)) bad(`${at}.web.steps: a list of steps`);
      const checked = (steps as unknown[]).map((s, k) => {
        const where = `${at}.web.steps[${k}]`;
        const keys = isMap(s) ? Object.keys(s) : [];
        if (keys.length !== 1 || !STEPS.includes(keys[0]!)) bad(`${where}: one of ${STEPS.join(", ")} (one per step)`);
        const [op] = keys as [string];
        const v = (s as Record<string, unknown>)[op];
        const sel = typeof v === "string" && v !== "";
        if (op === "click" && !sel) bad(`${where}.click: a CSS selector`);
        if (op === "fill" && (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "string" || !v[0] || typeof v[1] !== "string")) bad(`${where}.fill: [selector, text]`);
        if (op === "wait" && !sel && !(typeof v === "number" && v >= 0 && v <= 60000)) bad(`${where}.wait: milliseconds (up to 60000) or a CSS selector to wait for`);
        if (op === "goto" && !sel) bad(`${where}.goto: an address`);
        if (op === "scroll" && !sel && typeof v !== "number") bad(`${where}.scroll: pixels from the top, or a CSS selector to scroll to`);
        return { [op]: v } as Step;
      });
      c = { kind: "web", name: nameOf(name, `${at}.web.name`, ".png"), url: url as string, viewport: [vp[0], vp[1]] as [number, number], scale: scale as number, steps: checked };
    } else {
      const x = m.cli;
      if (!isMap(x)) bad(`${at}.cli: a mapping of command, name, cols, timeout`);
      const unknown = Object.keys(x as object).filter((k) => !["command", "name", "cols", "timeout"].includes(k));
      if (unknown.length) bad(`${at}.cli: unknown key "${unknown[0]}" (known: command, name, cols, timeout)`);
      const { command, name, cols = 100, timeout = 30 } = x as Record<string, unknown>;
      if (!Array.isArray(command) || !command.length || command.some((a) => typeof a !== "string" && typeof a !== "number") || typeof command[0] !== "string" || !command[0])
        bad(`${at}.cli.command: a list of arguments ([program, arg, ...]); a shell line is never run`);
      if (typeof cols !== "number" || !Number.isInteger(cols) || cols < 20 || cols > 240) bad(`${at}.cli.cols: the terminal's width in columns, 20 to 240`);
      if (typeof timeout !== "number" || timeout <= 0 || timeout > 600) bad(`${at}.cli.timeout: seconds, up to 600`);
      c = { kind: "cli", name: nameOf(name, `${at}.cli.name`, ".svg"), command: (command as unknown[]).map(String), cols: cols as number, timeout: timeout as number };
    }
    const first = named.get(c.name);
    if (first !== undefined) bad(`${at}: the name "${c.name}" is taken by screens[${first}]`);
    named.set(c.name, i);
    out.push(c);
  });
  return out;
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
