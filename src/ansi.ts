/**
 * src/ansi.ts — a command's output (text painted with ANSI SGR escapes) drawn as a terminal, in
 * SVG, in the project's palette.
 *
 * Each row is read into runs of one style on a grid of cells (wide glyphs take two cells, marks
 * none); any escape other than SGR (cursor moves, erases, OSC links) is dropped, a carriage return
 * starts the row again (a progress line keeps its last state) and a row longer than the terminal
 * wraps. The SVG places every ASCII character on its own cell, so the mono face lines the columns
 * up as the terminal did, and carries that face inside it (an <img> loads nothing else).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STUDIO, derivePalette, mix, type Palette } from "./config.ts";

export interface Style { fg?: string; bg?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean; inverse?: boolean }
export interface Run { col: number; text: string; cells: number; style: Style }

/** The 16 ANSI colours: a soft dark-terminal set that sits on any dark page. */
const BASIC = ["#1e2127", "#e06c75", "#98c379", "#d19a66", "#61afef", "#c678dd", "#56b6c2", "#abb2bf"];
const BRIGHT = ["#5c6370", "#ef8a92", "#b5e08f", "#e5c07b", "#7cc4ff", "#de96f0", "#7fd8e2", "#ffffff"];

const hex2 = (v: number) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0");
const rgb = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** xterm's 256-colour table. */
function xterm256(i: number): string {
  if (i < 8) return BASIC[i]!;
  if (i < 16) return BRIGHT[i - 8]!;
  if (i < 232) {
    const k = i - 16, step = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return rgb(step(Math.floor(k / 36)), step(Math.floor(k / 6) % 6), step(k % 6));
  }
  const g = 8 + (i - 232) * 10;
  return rgb(g, g, g);
}

/** Cells a grapheme takes: 0 for marks and joiners, 2 for wide East Asian and emoji, else 1. */
export function cellsOf(g: string): number {
  const cp = g.codePointAt(0) ?? 0;
  if (/^\p{M}+$/u.test(g) || cp === 0x200d || cp === 0xfe0f) return 0;
  if (/\p{Extended_Pictographic}/u.test(g) && (g.includes("️") || cp >= 0x1f000)) return 2;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

/** One SGR parameter list applied to a style. */
function sgr(style: Style, params: number[]): Style {
  let s: Style = { ...style };
  if (!params.length) params = [0];
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    if (p === 0) s = {};
    else if (p === 1) s.bold = true;
    else if (p === 2) s.dim = true;
    else if (p === 3) s.italic = true;
    else if (p === 4) s.underline = true;
    else if (p === 7) s.inverse = true;
    else if (p === 22) { delete s.bold; delete s.dim; }
    else if (p === 23) delete s.italic;
    else if (p === 24) delete s.underline;
    else if (p === 27) delete s.inverse;
    else if (p >= 30 && p <= 37) s.fg = BASIC[p - 30];
    else if (p >= 90 && p <= 97) s.fg = BRIGHT[p - 90];
    else if (p >= 40 && p <= 47) s.bg = BASIC[p - 40];
    else if (p >= 100 && p <= 107) s.bg = BRIGHT[p - 100];
    else if (p === 39) delete s.fg;
    else if (p === 49) delete s.bg;
    else if (p === 38 || p === 48) {
      const k = p === 38 ? "fg" : "bg";
      if (params[i + 1] === 2) { s[k] = rgb(params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0); i += 4; }
      else if (params[i + 1] === 5) { s[k] = xterm256(params[i + 2] ?? 0); i += 2; }
    }
  }
  return s;
}

const same = (a: Style, b: Style) => (["fg", "bg", "bold", "dim", "italic", "underline", "inverse"] as const).every((k) => a[k] === b[k]);
const segmenter = new Intl.Segmenter();
/** CSI (ESC [ … final), OSC (ESC ] … BEL or ST), APC, DCS and PM, and the other two-byte escapes. */
const ESCAPE = /\x1b\[([0-9;:?]*)([@-~])|\x1b[\]_P^][\s\S]*?(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** One painted row into runs of one style. */
export function parseAnsiLine(line: string, start: Style = {}): Run[] {
  const runs: Run[] = [];
  let style = start, col = 0;
  const push = (text: string) => {
    for (const { segment } of segmenter.segment(text)) {
      if (segment === "\t") { push(" ".repeat(8 - (col % 8))); continue; }
      if (/^[\x00-\x1f\x7f]$/.test(segment)) continue;
      const cells = cellsOf(segment);
      const last = runs.at(-1);
      if (last && same(last.style, style) && last.col + last.cells === col) { last.text += segment; last.cells += cells; }
      else runs.push({ col, text: segment, cells, style: { ...style } });
      col += cells;
    }
  };
  let at = 0;
  ESCAPE.lastIndex = 0;
  for (let m = ESCAPE.exec(line); m; m = ESCAPE.exec(line)) {
    if (m.index > at) push(line.slice(at, m.index));
    if (m[2] === "m") style = sgr(style, (m[1] ?? "").split(/[;:]/).filter((x) => x !== "").map(Number));
    at = ESCAPE.lastIndex;
  }
  if (at < line.length) push(line.slice(at));
  return runs;
}

/** The style a row ends with, so the next row starts in it (a terminal keeps SGR across lines). */
function endStyle(line: string, start: Style): Style {
  let s = start;
  for (const m of line.matchAll(/\x1b\[([0-9;:]*)m/g)) s = sgr(s, (m[1] ?? "").split(/[;:]/).filter((x) => x !== "").map(Number));
  return s;
}

/** A row cut into rows of at most `cols` cells. */
function wrap(runs: Run[], cols: number): Run[][] {
  const rows: Run[][] = [[]];
  for (const r of runs) {
    let abs = r.col;
    for (const { segment } of segmenter.segment(r.text)) {
      const w = cellsOf(segment);
      const row = Math.floor(abs / cols), col = abs - row * cols;
      while (rows.length <= row) rows.push([]);
      const last = rows[row]!.at(-1);
      if (last && last.style === r.style && last.col + last.cells === col) { last.text += segment; last.cells += w; }
      else rows[row]!.push({ col, text: segment, cells: w, style: r.style });
      abs += w;
    }
  }
  return rows;
}

/** A command's whole output as rows of runs: carriage returns honoured, rows wrapped at `cols`, trailing blank rows dropped. */
export function parseAnsi(output: string, cols: number): Run[][] {
  const rows: Run[][] = [];
  let style: Style = {};
  for (const raw of output.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.includes("\r") ? raw.slice(raw.lastIndexOf("\r") + 1) || raw.split("\r").filter(Boolean).at(-1) || "" : raw;
    rows.push(...wrap(parseAnsiLine(line, style), cols));
    style = endStyle(raw, style);
  }
  while (rows.length && !rows.at(-1)!.some((r) => r.text.trim())) rows.pop();
  return rows;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (v: number) => String(Math.round(v * 100) / 100);

export interface Terminal { svg: string; width: number; height: number; rows: number }

/**
 * Rows drawn as a terminal window in the palette: a title bar with the command as a prompt, the
 * page behind the text, the ink as the default colour, the accent on the prompt.
 */
export function terminalSvg(command: string, rows: Run[][], cols: number, palette: Palette): Terminal {
  const P = derivePalette(palette);
  const FONT = 24, CW = FONT * 0.6, CH = Math.round(FONT * 1.5), PAD = 36, BAR = 64;
  const width = Math.round(PAD * 2 + cols * CW), height = Math.round(BAR + PAD * 2 + Math.max(rows.length, 1) * CH);
  const fg = P.ink!, bg = P.page!;
  const backs: string[] = [], texts: string[] = [];
  rows.forEach((runs, r) => {
    const top = BAR + PAD + r * CH, base = top + CH * 0.72;
    for (const run of runs) {
      let f = run.style.fg ?? fg, b = run.style.bg;
      if (run.style.inverse) { const t = f; f = b ?? bg; b = t; }
      if (run.style.dim) f = mix(f, b ?? bg, 0.45);
      const left = PAD + run.col * CW;
      if (b) backs.push(`<rect x="${n(left)}" y="${n(top)}" width="${n(run.cells * CW)}" height="${CH}" fill="${b}"/>`);
      const attrs = `fill="${f}"${run.style.bold ? ' font-weight="700"' : ""}${run.style.italic ? ' font-style="italic"' : ""}${run.style.underline ? ' text-decoration="underline"' : ""}`;
      let col = run.col, pending = "", xs: string[] = [];
      const flush = () => {
        if (pending.trim()) texts.push(`<text x="${xs.join(" ")}" y="${n(base)}" ${attrs}>${esc(pending)}</text>`);
        pending = ""; xs = [];
      };
      for (const { segment } of segmenter.segment(run.text)) {
        const w = cellsOf(segment);
        if (/^[\x20-\x7e]$/.test(segment)) { pending += segment; xs.push(n(PAD + col * CW)); }
        else {
          flush();
          if (w > 0 && segment.trim()) texts.push(`<text x="${n(PAD + col * CW + (w * CW) / 2)}" y="${n(base)}" text-anchor="middle" ${attrs}>${esc(segment)}</text>`);
        }
        col += w;
      }
      flush();
    }
  });
  const font = readFileSync(join(STUDIO, "fonts", "firacode-medium.woff")).toString("base64");
  const prompt = `$ ${command}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<style>@font-face { font-family: "Studio Mono"; src: url("data:font/woff;base64,${font}") format("woff"); } text { font-family: "Studio Mono", "DejaVu Sans Mono", monospace; font-size: ${FONT}px; white-space: pre; }</style>`
    + `<rect width="${width}" height="${height}" fill="${bg}"/>`
    + `<rect width="${width}" height="${BAR}" fill="${P.card}"/><rect y="${BAR - 2}" width="${width}" height="2" fill="${P.line}"/>`
    + `<text x="${PAD}" y="${n(BAR * 0.64)}" fill="${P.accent}">${esc(prompt)}</text>`
    + `<g xml:space="preserve">${backs.join("")}${texts.join("")}</g></svg>\n`;
  return { svg, width, height, rows: rows.length };
}
