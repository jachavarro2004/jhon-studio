/**
 * src/reference.ts — what `jhon-studio video script` prints with no option: the shot model as a
 * short reference, with one example of each kind (a valid script in the project's narration
 * language), the screens a proof may show and the video's brief, so a person or an agent (Claude
 * Code or pi, through /jhon:video) can write script.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import type { Script } from "./script.ts";

/** A line in both languages; a phrase is picked from the spoken one. */
type Two = { en: string; es: string };

/** One shot of each kind for a fictional notes app; phrases given in both languages. */
function example(n: "en" | "es"): Script {
  const p = (x: Two) => x[n];
  const line = (x: Two) => ({ en: x.en, es: x.es });
  return {
    approved: false,
    say: { CLI: "C L I" },
    shots: [
      { id: "intro", kind: "intro", ...line({ en: "Tidy. Your notes, in plain text.", es: "Tidy. Tus notas, en texto plano." }) },
      {
        id: "problem", kind: "head", chapter: n === "en" ? "The problem" : "El problema",
        lines: [[n === "en" ? "Notes get *lost*" : "Las notas se *pierden*", p({ en: "Notes get lost", es: "Las notas" })]],
        ...line({ en: "Notes get lost in apps that keep them to themselves.", es: "Las notas se pierden en apps que se las guardan." }),
      },
      {
        id: "claim", kind: "card", kicker: n === "en" ? "The idea" : "La idea", title: [n === "en" ? "Plain text, *always.*" : "Texto plano, *siempre.*"],
        body: [[n === "en" ? "Every note is a file you own." : "Cada nota es un archivo tuyo.", p({ en: "a file you own", es: "un archivo" })]],
        ...line({ en: "Tidy keeps every note as a file you own.", es: "Tidy guarda cada nota como un archivo tuyo." }),
      },
      {
        id: "how", kind: "list", kicker: n === "en" ? "How" : "Cómo",
        rows: [
          [n === "en" ? "Write" : "Escribe", n === "en" ? "in any editor" : "en cualquier editor", p({ en: "write", es: "Escribe" })],
          [n === "en" ? "Find" : "Encuentra", n === "en" ? "in 30 ms" : "en 30 ms", p({ en: "find", es: "encuentra" })],
        ],
        ...line({ en: "You write in any editor, and find any note in thirty milliseconds.", es: "Escribe en cualquier editor y encuentra cualquier nota en treinta milisegundos." }),
      },
      {
        id: "search", kind: "proof", src: "search.png",
        marks: [{ at: p({ en: "the search box", es: "la búsqueda" }), r: [40, 120, 900, 80] }, { at: p({ en: "its results", es: "los resultados" }), r: [40, 220, 900, 520] }],
        ...line({ en: "Type in the search box, and its results come at once.", es: "Escribe en la búsqueda y los resultados llegan al instante." }),
      },
      {
        id: "numbers", kind: "numbers", kicker: n === "en" ? "In use" : "En uso",
        figures: [["10,000", n === "en" ? "notes in one vault" : "notas en un archivo", p({ en: "ten thousand", es: "diez mil" })]],
        ...line({ en: "One writer keeps ten thousand notes in it.", es: "Una escritora guarda en él diez mil notas." }),
      },
      { id: "close", kind: "close", install: "npm install -g tidy", ...line({ en: "Tidy. Your notes, in plain text.", es: "Tidy. Tus notas, en texto plano." }) },
    ],
  } as unknown as Script;
}

const KINDS_TABLE = `  intro    the mark and name; tags (one or two lines; default: the tagline), kicker, wordmark
  head     a headline: chapter, lead, lines: one or two [text, phrase]
  card     a claim: kicker, title (lines), body: [text, phrase], size (the title's largest px)
  list     kicker (or chapter), rows: [left, right, phrase]
  numbers  kicker, figures: [figure, label, phrase]
  proof    a screen held close: src, crop [x, y, w, h], marks: { at, r: [x, y, w, h], delay }, pan: { by, at }
  close    the mark again; lines (default: the tagline), install (a command shown above the url)`;

/** The reference: the model, an example, the screens, the brief (or how to draft one). */
export function reference(config: Config, scriptFile: string, screens: string[], briefFile: string | null): string {
  const n = config.narration;
  const subs = config.subtitles;
  const brief = briefFile && existsSync(briefFile) ? readFileSync(briefFile, "utf8") : null;
  return `script.json: the shots of ${scriptFile}. Write it from the brief (below); the owner reads it and
approves it before the render.

Narration: ${n} (each shot's "${n}" is spoken; its phrases time what lands). Subtitles: ${subs.join(", ") || "none"}.

Rules:
- The first shot is the intro, the last the close; 6 to 10 shots make a 40 to 90 second video.
- Each shot: an id (lowercase letters, digits, dashes), a kind, and its line in ${[n, ...subs].join(" and ")}: one or
  two sentences, said in about 3 to 8 seconds.
- A phrase (a line's, a row's, a figure's, a mark's "at") is words of the spoken ${n} line; a proof's
  marks follow that line in order (only the first may be a number of seconds).
- A proof's src is one of the screens below; r and crop are [x, y, width, height] in its pixels.
- Text may carry *emphasis* and \`code\`. "say" spells words as they are heard (whole words).
- Spanish is neutral, in the tú form; a subtitle holds at most 168 characters.
- Only what the brief or the project shows: no invented figures.
- Text wraps and shrinks to fit its frame, within limits; keep headlines, titles, rows and
  kickers short: compose fails on text that still overflows, naming the shot and the element.

Kinds:
${KINDS_TABLE}

Example (one shot of each kind):
\`\`\`json
${JSON.stringify(example(n), null, 2)}
\`\`\`

Screens (a proof's src):
${screens.length ? screens.map((s) => `- ${s}`).join("\n") : "- none yet (see the brief's Screens)"}

When it is written: jhon-studio video script --check; jhon-studio video make (a preview);
jhon-studio video review (review.png, each shot's final state, to look at and show); the owner
reads it and approves it (jhon-studio video script --approve); then jhon-studio video make.

${brief ? `The brief (${briefFile}):\n\n${brief}` : "No brief yet: jhon-studio video brief readme (or ldd:<change>, release:<tag>, a file).\n"}`;
}

/** The brief file of a video folder. */
export const briefFile = (dir: string) => join(dir, "brief.md");
