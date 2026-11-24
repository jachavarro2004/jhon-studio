/**
 * src/script.ts — a video's script: script.json in its folder (.jhon/studio/<video>/).
 *
 *   { "approved": false,                  `jhon-studio video script --approve` sets { "sha256": ... }
 *                                         (a legacy `true` reads as not approved: it predates the hash)
 *     "say": { "CLI": "C L I" },          how words are spoken (whole words; backticks are always dropped)
 *     "timing": { "TAIL": 0.55 },         optional: TAIL, PROOF_TAIL, PROOF_MIN, CLOSE_TAIL in seconds
 *     "shots": [ ... ] }
 *
 * Every shot has an `id` (lowercase letters, digits, dashes), a `kind`, and its line in each
 * language, `en` and `es`: the narration's language (studio.yaml `narration`, English by default)
 * is spoken (through `say`) and times what lands, the others are its subtitles; `chapter` opens it
 * under the band; `capEn` also shows the spoken line as a caption. By kind:
 *   intro    the project's mark and name; `tags` (one or two lines; default: the tagline), `kicker`
 *   head     a headline: `lead` (optional), `lines`: one or two [text, phrase said when it lands]
 *   card     a claim: `kicker`, `title` (lines), `body`: [text, phrase], `size` (the title's largest px:
 *            it shrinks to fit)
 *   list     `kicker` (or `chapter`), `rows`: [left, right, phrase]
 *   numbers  `kicker`, `figures`: [figure, label, phrase]
 *   proof    a screen held close: `src` (in the project's screens folder), `crop` [x, y, w, h]
 *            (default: all of it), `marks`: [{ at: phrase or seconds (first only), r: [x, y, w, h],
 *            delay }], `pan`: { by: px, at }
 *   close    the mark again; `lines` (default: the tagline), `install` (a command shown above the url)
 * Text may carry *emphasis* (the accent's italic) and `code` (the mono face).
 *
 * The approval is the script's own hash: `approved: { sha256 }` of the script without that field
 * (scriptHash), so any change after the approval needs a new one before the render.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const KINDS = ["intro", "head", "card", "list", "numbers", "proof", "close"] as const;
export type Kind = (typeof KINDS)[number];
export type Phrase = string | number;
export interface Mark { at: Phrase; r: [number, number, number, number]; delay?: number }
export interface Shot {
  id: string; kind: Kind; en: string; es: string; chapter?: string; capEn?: boolean;
  kicker?: string; tags?: string[]; wordmark?: string;
  lead?: string; lines?: (string | [string, string])[];
  title?: string[]; body?: [string, string][]; size?: number;
  rows?: [string, string, string][]; figures?: [string, string, string][];
  src?: string; crop?: [number, number, number, number]; marks?: Mark[]; pan?: { by: number; at: Phrase };
  install?: string;
}
export interface Script { approved?: boolean | { sha256: string }; say?: Record<string, string>; timing?: Record<string, number>; shots: Shot[] }

/** Ids the composition itself uses. */
const RESERVED = new Set(["s1", "bg", "bg-in", "pool", "stage", "grain", "vig", "captions", "root"]);
/** Voseo verb forms and the pronoun: the Spanish subtitles use the tú form. */
const VOSEO = /(?<![\p{L}])(vos|tenés|podés|querés|sabés|sentís|hacé|mirá|decí|vení|andá|fijate|contá|usá|probá|elegí|escribí)(?![\p{L}])/giu;
const MAX_SUBTITLE = 168;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How a line is said: backticks dropped, then each `say` entry replaced as a whole word. */
export function spoken(text: string, say: Record<string, string> | undefined): string {
  let s = text.replace(/`/g, "");
  for (const [from, to] of Object.entries(say ?? {})) {
    const pre = /^[\p{L}\p{N}_]/u.test(from) ? "(?<![\\p{L}\\p{N}_])" : "";
    const post = /[\p{L}\p{N}_]$/u.test(from) ? "(?![\\p{L}\\p{N}_])" : "";
    s = s.replace(new RegExp(pre + esc(from) + post, "gu"), to);
  }
  return s;
}

/** A shot's line in a language. */
export const said = (s: Shot, lang = "en"): string => (s as unknown as Record<string, string>)[lang] ?? "";

/** The distinct spoken lines in the narration's language, by the first shot that says each (the close may say the intro's line again). */
export function lines(script: Script, lang = "en"): { id: string; text: string }[] {
  const seen = new Map<string, string>();
  for (const s of script.shots) {
    const t = spoken(said(s, lang), script.say);
    if (!seen.has(t)) seen.set(t, s.id);
  }
  return [...seen].map(([text, id]) => ({ id, text }));
}

/** The script's hash, the approval's proof: SHA-256 of its JSON without the approved field. */
export function scriptHash(script: Script): string {
  const { approved: _, ...rest } = script;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

/**
 * Whether the script is approved as it is now, changed after its approval, never approved, or
 * approved the old way (`approved: true`, before approvals were the script's hash: not an
 * approval of the script as it is now).
 */
export function approval(script: Script): "approved" | "changed" | "none" | "legacy" {
  const a = script.approved;
  if (a === true) return "legacy";
  if (!a || typeof a !== "object" || typeof a.sha256 !== "string") return "none";
  return a.sha256 === scriptHash(script) ? "approved" : "changed";
}

/** Reads script.json. */
export function loadScript(file: string): Script {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: not valid JSON (${(e as Error).message})`);
  }
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRect = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(isNum);

const NAMES: Record<string, string> = { en: "English", es: "Spanish" };

/**
 * Every problem of a script, as "<shot id>: <problem>"; [] when it is valid. `narration` is the
 * spoken language (default en); `languages` the narration's and the subtitles'.
 */
export function validateScript(script: unknown, opts: { languages: string[]; narration?: string }): string[] {
  const errs: string[] = [];
  if (!script || typeof script !== "object" || Array.isArray(script)) return ["the script is a JSON object with its shots"];
  const sc = script as Script;
  const voice = opts.narration ?? "en";
  if ("approved" in sc && typeof sc.approved !== "boolean" && !(sc.approved && typeof sc.approved === "object" && Object.keys(sc.approved).length === 1 && typeof sc.approved.sha256 === "string" && /^[0-9a-f]{64}$/.test(sc.approved.sha256)))
    errs.push('approved: false, or { "sha256": ... } as `jhon-studio video script --approve` writes it (a legacy true reads as not approved)');
  if ("say" in sc && (!sc.say || typeof sc.say !== "object" || Array.isArray(sc.say) || Object.values(sc.say).some((v) => typeof v !== "string")))
    errs.push("say: a map of written words to how they are spoken");
  if ("timing" in sc && (!sc.timing || typeof sc.timing !== "object" || Object.entries(sc.timing).some(([k, v]) => !["TAIL", "PROOF_TAIL", "PROOF_MIN", "CLOSE_TAIL"].includes(k) || !isNum(v) || v < 0)))
    errs.push("timing: seconds for TAIL, PROOF_TAIL, PROOF_MIN, CLOSE_TAIL");
  if (!Array.isArray(sc.shots) || sc.shots.length === 0) return [...errs, "no shots"];

  const ids = new Set<string>();
  sc.shots.forEach((s, i) => {
    const id = s && isStr(s.id) ? s.id : `shot ${i}`;
    const e = (msg: string) => errs.push(`${id}: ${msg}`);
    if (!s || typeof s !== "object") return void errs.push(`shot ${i}: a shot is an object`);
    if (!isStr(s.id) || !/^[a-z][a-z0-9-]*$/.test(s.id)) errs.push(`${JSON.stringify(s.id)}: an id is lowercase letters, digits and dashes, starting with a letter`);
    else if (RESERVED.has(s.id) || /^band\d+$/.test(s.id)) e("the id is reserved by the composition");
    else if (ids.has(s.id)) e("the id is used twice");
    else ids.add(s.id);
    if (!(KINDS as readonly string[]).includes(s.kind)) return void e(`kind "${s.kind}" is not one of ${KINDS.join(", ")}`);
    if (i === 0 && s.kind !== "intro") errs.push("the first shot is the intro");
    if (i > 0 && s.kind === "intro") e("an intro may only open the video");
    if (i === sc.shots.length - 1 && s.kind !== "close") errs.push("the last shot is the close");
    if (i < sc.shots.length - 1 && s.kind === "close") e("a close may only end the video");
    const line = (s as unknown as Record<string, unknown>)[voice];
    if (!isStr(line)) return void e(`${voice}: its narration line`);
    if ("chapter" in s && !isStr(s.chapter)) e("chapter: a string");
    if ("capEn" in s && typeof s.capEn !== "boolean") e("capEn: true or false");
    const voseo = (text: string, what: string) => {
      const vos = [...text.matchAll(VOSEO)].map((m) => `"${m[0]}"`);
      if (vos.length) e(`voseo in the es ${what} (${vos.join(", ")}): use the tú form`);
    };
    if (voice === "es") voseo(line, "line");

    for (const lang of opts.languages.filter((l) => l !== voice)) {
      const sub = (s as unknown as Record<string, unknown>)[lang];
      if (!isStr(sub)) { e(`no ${lang} subtitle`); continue; }
      const text = sub.replace(/`/g, "");
      if (text.trim() === line.replace(/`/g, "").trim()) e(`the ${lang} subtitle repeats the ${NAMES[voice] ?? voice}`);
      if (lang === "es") voseo(text, "subtitle");
      if (text.length > MAX_SUBTITLE) e(`the ${lang} subtitle has ${text.length} characters; two rows hold ${MAX_SUBTITLE}`);
    }

    /** A phrase that times something must be in the spoken line. */
    const said = (what: string, p: unknown) => {
      if (!isStr(p)) { e(`${what}: the phrase it lands on`); return -1; }
      const at = line.indexOf(p);
      if (at < 0) e(`${what}: "${p}" is not in its line`);
      return at;
    };
    const pairs = (field: string, v: unknown, n: number, need: boolean) => {
      if (v === undefined && !need) return [];
      if (!Array.isArray(v) || (need && v.length === 0) || v.some((x) => !Array.isArray(x) || x.length !== n || x.slice(0, n - 1).some((y) => typeof y !== "string"))) {
        e(`${field}: a list of [${n === 2 ? "text, phrase" : "text, text, phrase"}]`);
        return [];
      }
      return v as string[][];
    };
    const strList = (field: string, v: unknown, max: number, need: boolean) => {
      if (v === undefined && !need) return;
      if (!Array.isArray(v) || v.length === 0 || v.length > max || !v.every(isStr)) e(`${field}: a list of lines${max < 9 ? ` (one or ${max === 2 ? "two" : max})` : ""}`);
    };

    switch (s.kind) {
      case "intro":
        strList("tags", s.tags, 2, false);
        if ("kicker" in s && !isStr(s.kicker)) e("kicker: a string");
        if ("wordmark" in s && !isStr(s.wordmark)) e("wordmark: a string");
        break;
      case "head": {
        if ("lead" in s && !isStr(s.lead)) e("lead: a string");
        const ls = s.lines;
        if (!Array.isArray(ls) || ls.length < 1 || ls.length > 2) { e("lines: one or two [text, phrase]"); break; }
        ls.forEach((l, k) => {
          if (!Array.isArray(l) || l.length !== 2 || !isStr(l[0])) return void e(`line ${k}: [text, phrase]`);
          said(`line ${k}`, l[1]);
        });
        break;
      }
      case "card":
        if (!isStr(s.kicker)) e("kicker: a string");
        strList("title", s.title, 9, true);
        pairs("body", s.body, 2, false).forEach((b, k) => said(`body ${k}`, b[1]));
        if ("size" in s && (!isNum(s.size) || s.size < 40 || s.size > 160)) e("size: the title's size in px, 40 to 160");
        break;
      case "list":
        if (!isStr(s.kicker ?? s.chapter)) e("kicker: a string (or a chapter)");
        pairs("rows", s.rows, 3, true).forEach((r, k) => said(`row ${k}`, r[2]));
        break;
      case "numbers":
        if (!isStr(s.kicker)) e("kicker: a string");
        pairs("figures", s.figures, 3, true).forEach((f, k) => said(`figure ${k}`, f[2]));
        break;
      case "proof": {
        if (!isStr(s.src)) e("src: the screen's file in the project's screens folder");
        if ("crop" in s && !isRect(s.crop)) e("crop: [x, y, width, height]");
        if (!Array.isArray(s.marks) || s.marks.length === 0) { e("marks: at least one { at, r }"); break; }
        let last = -1, lastAt: unknown;
        s.marks.forEach((m, k) => {
          if (!m || typeof m !== "object") return void e(`mark ${k}: { at, r }`);
          if (!isRect(m.r)) e(`mark ${k}: r is [x, y, width, height] in the screen's pixels`);
          if ("delay" in m && !isNum(m.delay)) e(`mark ${k}: delay: seconds`);
          if (typeof m.at === "number") {
            if (k > 0) e(`mark ${k}: a time in seconds may only be the first mark`);
            else if (!isNum(m.at) || m.at < 0) e(`mark ${k}: at: seconds from the line's start`);
            return;
          }
          const at = said(`mark ${k}`, m.at);
          if (at >= 0 && last >= 0 && at <= last) e(`mark ${k} ("${m.at}") comes before mark ${k - 1} ("${lastAt}") in its line`);
          if (at >= 0) { last = at; lastAt = m.at; }
        });
        if ("pan" in s) {
          const p = s.pan;
          if (!p || !isNum(p.by)) e("pan: { by: px, at }");
          else if (typeof p.at !== "number") said("pan", p.at);
        }
        break;
      }
      case "close":
        strList("lines", s.lines, 2, false);
        if ("install" in s && !isStr(s.install)) e("install: a string");
        break;
    }
  });
  return errs;
}
