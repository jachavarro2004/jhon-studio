/**
 * src/compose.ts — write a video's HyperFrames composition from its script.
 *
 * Reads the video's script.json (src/script.ts), its narration cache (narration/<key>.json, each
 * line's seconds; src/narrate.ts makes it) and the project's settings (src/config.ts: name,
 * tagline, url, palette, mark, intro, screens), and writes in the video folder:
 *   index.html          every shot as a timed clip with a stable id, the narration clips, the
 *                       subtitle clips, the plan of times, and the scripts it runs, inlined
 *                       (engine/motion.js, the studio's motion engine; templates/presentation/
 *                       timeline.js, the one timeline on it and the grain; stage.js, the 3D seal,
 *                       only with `intro: seal`)
 *   captions.es.json    the Spanish subtitles, one per line, as composition variables
 *   assets/             links to the studio's fonts, the project's screens and the narration;
 *                       the project's logo as assets/mark.<ext>; vendor/ (three.js) for the seal
 * Every time is computed here from the lines' real lengths: a shot lasts its lead-in, its line
 * and a tail (a proof is held at least PROOF_MIN seconds and its line plus PROOF_TAIL); a mark
 * or a body line lands where its phrase falls in the line (by its share of the line's
 * characters, which is close for Kokoro's even pace).
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { STUDIO, derivePalette, screensDir, type Config } from "./config.ts";
import { key, narrationDir } from "./narrate.ts";
import { said, spoken, validateScript, type Phrase, type Script, type Shot } from "./script.ts";
import { StudioError, writeIfChanged, type Video } from "./video.ts";

const TEMPLATE = join(STUDIO, "templates", "presentation");
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- Timing (seconds)
const HALF = 0.28; // a band seam: the band crosses the cut from HALF before to HALF after
const LEAD_CUT = 0.35, LEAD_BAND = 0.7;
const INTRO = 8.0, INTRO_VO = 1.4;
const TIMING = { TAIL: 0.55, PROOF_TAIL: 1.3, PROOF_MIN: 4.8, CLOSE_TAIL: 2.4 };

// ---- Proof framing: the screen at the end of its push fits this box, above the subtitle band.
const BOX = { w: 1700, h: 790, cx: 960, cy: 462 };
const LOGO_EXT = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);

/** A screen's size in pixels: a PNG's header, an SVG's viewBox (or width and height), else 1280x720. */
export function imageSize(file: string): [number, number] {
  const b = readFileSync(file);
  if (b.length > 24 && b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (file.endsWith(".svg")) {
    const head = b.toString("utf8", 0, 4096);
    const vb = head.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
    if (vb) return [Number(vb[1]), Number(vb[2])];
    const w = head.match(/<svg[^>]*\swidth="([\d.]+)/), h = head.match(/<svg[^>]*\sheight="([\d.]+)/);
    if (w && h) return [Number(w[1]), Number(h[1])];
    return [1280, 720];
  }
  throw new StudioError(`${file}: a screen is a PNG or an SVG`);
}

/** Markup: *emphasis* in the accent's italic, `code` in the mono face; split into word spans for a waterfall. */
function words(text: string, id: string): string {
  const out: { w: string; em: boolean; code: boolean }[] = [];
  let em = false, code = false, buf = "";
  const flush = () => {
    for (const w of buf.split(" ").filter(Boolean)) out.push({ w, em, code });
    buf = "";
  };
  for (const ch of text) {
    if (ch === "*") { flush(); em = !em; } else if (ch === "`") { flush(); code = !code; } else if (ch === " ") { flush(); } else buf += ch;
  }
  flush();
  return out.map((x, i) => `<span class="w${x.em ? " em" : ""}${x.code ? " code" : ""}" id="${id}-w${i}">${esc(x.w)}</span>`).join(" ");
}
/** Inline markup without word spans. */
const inline = (text: string) => esc(text).replace(/`([^`]+)`/g, '<span class="code">$1</span>').replace(/\*([^*]+)\*/g, "<em>$1</em>");
const plain = (text: string) => text.replace(/[`*]/g, "");

/** A tagline as one or two lines (its first sentence, then the rest), the last word in the accent when it carries no markup. */
export function taglineLines(tagline: string): string[] {
  const sentences = (tagline.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return [];
  const out = sentences.length > 1 ? [sentences[0]!, sentences.slice(1).join(" ")] : [sentences[0]!];
  if (!out.some((l) => l.includes("*"))) out[out.length - 1] = out.at(-1)!.replace(/(\S+)$/, "*$1*");
  return out;
}

/** A font size that fits `chars` characters of the display serif in `width` px, between `min` and `max`. */
const fit = (chars: number, width: number, max: number, min: number) => Math.max(min, Math.min(max, Math.floor(width / (0.56 * Math.max(chars, 1)))));

export interface Composed { total: number; shots: number; list: string; files: string[] }

/** Composes the video; writes nothing unless every input is there. */
export function compose(video: Video, script: Script, config: Config): Composed {
  const N = config.narration;
  const errs = validateScript(script, { languages: config.languages, narration: N });
  if (errs.length) throw new StudioError(`${video.script} is not valid:\n  ${errs.join("\n  ")}`);
  const DIR = narrationDir(video.dir);
  const T = { ...TIMING, ...(script.timing ?? {}) };
  const screens = screensDir(config, video.project, video.dir);
  const palette = derivePalette(config.palette);
  const mark = "glyph" in config.mark ? { glyph: config.mark.glyph } : { file: resolve(video.project, config.mark.path) };
  let markSrc = "";
  if ("file" in mark) {
    const ext = extname(mark.file!).toLowerCase();
    if (!LOGO_EXT.has(ext)) throw new StudioError(`mark.path: ${mark.file} is not an SVG, PNG, JPEG or WebP image`);
    if (!existsSync(mark.file!)) throw new StudioError(`mark.path: ${mark.file} does not exist`);
    markSrc = `assets/mark${ext}`;
  }
  /** The mark's face: the glyph, or the logo. */
  const markInner = (cls = "") => (markSrc ? `<img class="mark-logo${cls}" src="${markSrc}" alt="" />` : esc((mark as { glyph: string }).glyph));
  const markCls = markSrc ? " logo" : "";

  const voice = (s: Shot) => {
    const f = join(DIR, `${key(spoken(said(s, N), script.say), config.voice, N)}.json`);
    if (!existsSync(f)) throw new StudioError(`no narration for shot "${s.id}": run \`jhon-studio video narrate --project ${video.project} --video ${video.id}\` first`);
    return JSON.parse(readFileSync(f, "utf8")) as { seconds: number };
  };

  // ---- The plan
  const plan: Record<string, unknown> & { shots: Record<string, unknown>[]; seams: { kind: string; at: number; out: string; inn: string }[]; caps: unknown[] } = { shots: [], seams: [], caps: [] };
  let now = 0;
  const timed = script.shots.map((s, i) => {
    const v = voice(s);
    const seam = i === 0 ? "none" : i === 1 || s.chapter || s.kind === "close" ? "band" : "cut";
    const start = now;
    const lead = seam === "band" ? LEAD_BAND : LEAD_CUT;
    let len: number, vo: number;
    if (s.kind === "intro") { len = INTRO; vo = INTRO_VO; }
    else if (s.kind === "proof") { len = lead + Math.max(v.seconds + T.PROOF_TAIL, T.PROOF_MIN); vo = start + lead; }
    else if (s.kind === "close") { len = lead + v.seconds + T.CLOSE_TAIL; vo = start + lead; }
    else { len = lead + v.seconds + T.TAIL; vo = start + lead; }
    now = start + len;
    return { s, i, seam, start, end: now, vo, sec: v.seconds, key: key(spoken(said(s, N), script.say), config.voice, N), clipStart: 0, clipEnd: 0, track: 0 };
  });
  const TOTAL = r3(now);
  timed.forEach((x, i) => {
    const next = timed[i + 1];
    x.clipStart = x.seam === "band" ? x.start - HALF : x.start;
    x.clipEnd = next && next.seam === "band" ? x.end + HALF : x.end;
    x.track = 3 + (i % 2);
  });
  type Timed = (typeof timed)[number];

  /** When a phrase of the line is said. */
  function at(x: Timed, phrase: Phrase, delay = 0) {
    if (typeof phrase === "number") return r3(x.vo + phrase + delay);
    const line = said(x.s, N);
    const i = line.indexOf(phrase);
    if (i < 0) throw new StudioError(`${x.s.id}: "${phrase}" is not in its line`);
    return r3(x.vo + (x.sec * i) / line.length + delay);
  }

  const tags = script.shots[0]!.tags ?? taglineLines(config.tagline);
  const pitch = (script.shots.at(-1)!.lines as string[] | undefined) ?? taglineLines(config.tagline);

  // ---- Markup per shot
  function shotHtml(x: Timed): string {
    const { s } = x;
    const id = s.id;
    const open = `<div id="${id}" class="clip shot" data-start="${r3(x.clipStart)}" data-duration="${r3(x.clipEnd - x.clipStart)}" data-track-index="${x.track}" data-track-kind="graphics"><div class="rv" id="${id}-rv"><div class="cam" id="${id}-cam">`;
    const close = `</div></div></div>`;
    const p: Record<string, unknown> = { id, kind: s.kind, seam: x.seam, start: r3(x.start), end: r3(x.end), vo: r3(x.vo), sec: x.sec };
    const kick = (text: string) => `<div class="kick card-kick" id="${id}-kick"><span class="kick-mark mark-face${markCls}">${markInner()}</span>${esc(text)}</div>`;
    let body = "";
    if (s.kind === "head") {
      const ls = s.lines as [string, string][];
      body = `<div class="head-text"><div class="kick" id="${id}-kick">${esc(s.chapter ?? "")}</div>`
        + (s.lead ? `<div class="mask"><div class="head-lead" id="${id}-lead">${inline(s.lead)}</div></div>` : "")
        + ls.map(([t], k) => `<div class="hl${k ? " hl2" : ""}" id="${id}-l${k + 1}">${words(t, `${id}-l${k + 1}`)}</div>`).join("")
        + `</div>`;
      p.lead = !!s.lead;
      p.lines = ls.map(([, ph], k) => [`#${id}-l${k + 1} .w`, at(x, ph)]);
    } else if (s.kind === "card") {
      const size = s.size ?? 108;
      const bodyLines = s.body ?? [];
      body = `<div class="card-pos"><div class="card" id="${id}-card"><div class="card-shadow"></div><div class="card-face">`
        + kick(s.kicker!)
        + `<div class="card-title" style="font-size: ${size}px">${s.title!.map((t, k) => `<div class="tl">${words(t, `${id}-t${k}`)}</div>`).join("")}</div>`
        + (bodyLines.length ? `<div class="card-body">${bodyLines.map(([t], k) => `<span class="ink-line" id="${id}-b${k}">${inline(t)}</span>`).join("")}</div>` : "")
        + `</div></div></div>`;
      p.title = r3(x.vo); p.body = bodyLines.map(([, ph], k) => [`#${id}-b${k}`, at(x, ph)]);
    } else if (s.kind === "list") {
      body = `<div class="card-pos"><div class="card" id="${id}-card"><div class="card-shadow"></div><div class="card-face">`
        + kick(s.kicker ?? s.chapter!) + `<div class="list">`
        + s.rows!.map(([k, v], r) => `<div class="lrow" id="${id}-r${r}"><span class="lk">${inline(k)}</span><span class="la">→</span><span class="lv">${inline(v)}</span></div>`).join("")
        + `</div></div></div></div>`;
      p.rows = s.rows!.map(([, , ph], r) => [`#${id}-r${r}`, at(x, ph)]);
    } else if (s.kind === "numbers") {
      body = `<div class="card-pos"><div class="card" id="${id}-card"><div class="card-shadow"></div><div class="card-face">`
        + kick(s.kicker!) + `<div class="figs">`
        + s.figures!.map(([n, label], k) => `<div class="fig" id="${id}-f${k}"><div class="fig-n">${esc(n)}</div><div class="fig-l">${esc(label)}</div></div>`).join("")
        + `</div></div></div></div>`;
      p.rows = s.figures!.map(([, , ph], k) => [`#${id}-f${k}`, at(x, ph)]);
    } else if (s.kind === "proof") {
      const file = join(screens, s.src!);
      if (!existsSync(file)) throw new StudioError(`${id}: its screen ${s.src} is not in ${screens}`);
      const [W, H] = imageSize(file);
      const [cx, cy, cw, ch] = s.crop ?? [0, 0, W, H];
      const k = Math.min(BOX.w / cw, BOX.h / ch);
      const w = cw * k, h = ch * k, left = BOX.cx - w / 2, top = BOX.cy - h / 2;
      const marks = s.marks!.map((m, j) => {
        const [mx, my, mw, mh] = m.r;
        return { id: `${id}-m${j}`, t: at(x, m.at, m.delay ?? 0), box: [(mx - cx) * k, (my - cy) * k, mw * k, mh * k] };
      });
      // The push heads for the first marks: its origin is their centre, in the screen's pixels.
      const focus = marks.slice(0, 2).map((m) => [m.box[0]! + m.box[2]! / 2, m.box[1]! + m.box[3]! / 2]);
      const fx = focus.reduce((a, f) => a + f[0]!, 0) / focus.length, fy = focus.reduce((a, f) => a + f[1]!, 0) / focus.length;
      body = `<div class="lit"></div><div class="screen${s.src!.endsWith(".svg") ? " diagram" : ""}" id="${id}-scr" data-layout-allow-overflow style="left: ${r3(left)}px; top: ${r3(top)}px; width: ${r3(w)}px; height: ${r3(h)}px">`
        + `<div class="sheet" id="${id}-sheet"><img src="assets/screens/${esc(s.src)}" alt="" style="left: ${r3(-cx * k)}px; top: ${r3(-cy * k)}px; width: ${r3(W * k)}px; height: ${r3(H * k)}px" />`
        + marks.map((m) => `<div class="mark" id="${m.id}" style="left: ${r3(m.box[0]!)}px; top: ${r3(m.box[1]!)}px; width: ${r3(m.box[2]!)}px; height: ${r3(m.box[3]!)}px"></div>`).join("")
        + `</div></div>`;
      p.marks = marks.map((m) => [`#${m.id}`, m.t]);
      p.origin = `${r3(fx)}px ${r3(fy)}px`;
      if (s.pan) p.pan = [r3(-s.pan.by * k), at(x, s.pan.at)];
    } else if (s.kind === "close") {
      const size = fit(Math.max(0, ...pitch.map((l) => plain(l).length)) * 0.9, 1560, 112, 56);
      body = `<div class="close-text"><div class="close-seal"><div class="seal-shadow" id="${id}-seal-shadow"></div><div class="seal-face mark-face${markCls}" id="${id}-seal-face">${markInner()}</div></div>`
        + pitch.map((l, k) => `<div class="mask" data-layout-allow-overflow><span class="pitch${k ? " pitch2" : ""}" id="${id}-l${k + 1}" style="font-size: ${size}px">${inline(l)}</span></div>`).join("")
        + `<div class="close-url kick" id="${id}-url">${s.install ? `<div class="close-install">${esc(s.install)}</div>` : ""}${esc(config.url.replace(/^https?:\/\//, ""))}</div></div>`;
    }
    plan.shots.push(p);
    if (s.kind === "intro") return "";
    return open + body + close;
  }

  const shotsHtml = timed.map(shotHtml).filter(Boolean).join("\n      ");
  for (const x of timed) if (x.seam !== "none") plan.seams.push({ kind: x.seam, at: r3(x.start), out: timed[x.i - 1]!.s.id, inn: x.s.id });
  const bands = plan.seams.filter((m) => m.kind === "band");
  const bandsHtml = bands.map((m, k) => `<div id="band${k}" class="band clip" data-start="${r3(m.at - HALF - 0.02)}" data-duration="${r3(2 * HALF + 0.1)}" data-track-index="5" data-track-kind="graphics"><div class="band-in" id="band${k}-in"></div></div>`).join("\n      ");
  plan.bands = bands.map((m, k) => ({ band: `#band${k}-in`, at: r3(m.at - HALF), out: m.out, inn: m.inn }));

  // ---- Narration and subtitles (one per shot; a shot repeating another's line plays the same file)
  const subtitleLangs = config.subtitles;
  const vars: { id: string; type: string; label: string; default: string }[] = [], subs: Record<string, Record<string, string>> = {}, caps: string[] = [], audio: string[] = [];
  for (const l of subtitleLangs) subs[l] = {};
  for (const x of timed) {
    const v = `c_${x.s.id}`;
    const en = x.s.capEn ? said(x.s, N).replace(/`/g, "") : "";
    vars.push({ id: v, type: "string", label: `Subtitle: ${x.s.id} (${r3(x.vo)} s)`, default: en });
    for (const l of subtitleLangs) subs[l]![v] = String((x.s as unknown as Record<string, string>)[l]).replace(/`/g, ""); // subtitles are plain text
    const capEnd = r3(x.vo + x.sec + 0.35);
    caps.push(`<div id="cap-${x.s.id}" class="cap clip" data-start="${r3(x.vo)}" data-duration="${r3(capEnd - x.vo)}" data-track-index="6"><span class="cap-text" id="cap-${x.s.id}-text" data-var-text="${v}">${esc(en)}</span></div>`);
    plan.caps.push([`#cap-${x.s.id}-text`, r3(x.vo), capEnd]);
    audio.push(`<audio id="vo-${x.s.id}" class="clip" src="assets/narration/${x.key}.opus" data-start="${r3(x.vo)}" data-duration="${x.sec}" data-track-index="7" data-volume="1"></audio>`);
  }
  plan.total = TOTAL;
  plan.introEnd = INTRO;
  plan.introId = script.shots[0]!.id;
  plan.intro = config.intro;
  const seal = config.intro === "seal";
  if (seal) {
    plan.seal = {
      glyph: (mark as { glyph: string }).glyph,
      accent: palette.accent, accentFill: palette["accent-fill"], accentInk: palette["accent-ink"],
      space: palette.space, wall: palette.wall, page: palette.page,
    };
  }

  // ---- The page
  const intro = script.shots[0]!;
  const wordmark = intro.wordmark ? inline(intro.wordmark) : esc(config.name);
  const nameSize = fit(plain(intro.wordmark ?? config.name).length, seal ? 800 : 940, 300, 96);
  const introText = (intro.kicker ? `<div id="s1-kick" class="kick">${esc(intro.kicker)}</div>` : "")
    + `<div class="mask" data-layout-allow-overflow><span id="s1-name" style="font-size: ${nameSize}px">${wordmark}</span></div>`
    + tags.map((t, k) => `<div class="mask" data-layout-allow-overflow><span class="tag" id="s1-tag${k + 1}">${inline(t)}</span></div>`).join("");
  const introHtml = seal
    ? `<div id="s1" class="clip intro-seal" data-start="0" data-duration="${r3(INTRO + HALF)}" data-track-index="1" data-track-kind="graphics">
        <div id="s1-cam">${introText}</div>
      </div>`
    : `<div id="s1" class="clip intro-flat" data-start="0" data-duration="${r3(INTRO + HALF)}" data-track-index="1" data-track-kind="graphics">
        <div class="intro-pool" id="s1-pool"></div>
        <div id="s1-cam">
          <div class="intro-mark" id="s1-mark"><div class="intro-ring" id="s1-ring"></div><div class="intro-mark-shadow" id="s1-mark-shadow"></div><div class="intro-mark-face mark-face${markCls}" id="s1-mark-face">${markInner()}</div></div>
          <div class="intro-text">${introText}</div>
        </div>
      </div>`;

  const vars_css = `:root { ${Object.entries(palette).map(([k, v]) => `--${k}: ${v};`).join(" ")} }`;
  const css = `      /* The project's palette (its studio settings, every tone derived from four colours). */\n      ${vars_css}\n` + readFileSync(join(TEMPLATE, "style.css"), "utf8");
  const motionJs = readFileSync(join(STUDIO, "engine", "motion.js"), "utf8");
  const timelineJs = readFileSync(join(TEMPLATE, "timeline.js"), "utf8");
  const stageJs = seal ? readFileSync(join(TEMPLATE, "stage.js"), "utf8") : "";
  const shotList = timed.map((x) => `  ${x.s.id.padEnd(9)} ${x.s.kind.padEnd(7)} ${r3(x.start).toFixed(2).padStart(6)}-${r3(x.end).toFixed(2).padStart(6)} s  vo ${r3(x.vo).toFixed(2)} (${x.sec} s)${x.seam === "band" ? "  [band]" : ""}`).join("\n");

  const html = `<!doctype html>
<!--
  ${esc(config.name).replace(/--/g, "- -")}: ${esc(video.id)}. GENERATED from script.json and the narration cache: edit those, then compose again.
  ${TOTAL} s at 1920x1080, 30 fps. Shots (start-end, where the line starts, its length):
${shotList}
-->
<html lang="${N}" data-composition-variables='${JSON.stringify(vars).replace(/'/g, "&#39;")}'>
  <head>
    <meta charset="utf-8" />
    <style>
${css}
    </style>${seal ? `
    <script type="importmap">
      { "imports": { "three": "./vendor/three-0.187.0/module/three.module.js", "three/addons/": "./vendor/three-0.187.0/examples/jsm/" } }
    </script>` : ""}
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080" data-fps="30">
      ${seal ? `<canvas id="stage" width="1920" height="1080" data-layout-ignore></canvas>` : ""}

      ${introHtml}

      <div id="bg" class="clip" data-start="${r3(INTRO - HALF)}" data-duration="${r3(TOTAL - INTRO + HALF)}" data-track-index="2" data-track-kind="graphics">
        <div class="stagebg" id="bg-in"><div class="pool" id="pool"></div></div>
      </div>

      ${shotsHtml}

      ${bandsHtml}

      <div id="vig" data-layout-ignore></div>
      <canvas id="grain" width="640" height="360" data-layout-ignore></canvas>

      <div id="captions" data-track-kind="captions">
        ${caps.join("\n        ")}
      </div>

      ${audio.join("\n      ")}
    </div>

    <script>
      window.__plan = ${JSON.stringify(plan)};
    </script>
    <script>
${motionJs}
    </script>
    <script>
${timelineJs}
    </script>${seal ? `
    <script type="module">
${stageJs}
    </script>` : ""}
  </body>
</html>
`;

  // ---- Write: the links the page loads through, the logo, the page and its subtitles.
  const assets = join(video.dir, "assets");
  mkdirSync(assets, { recursive: true });
  link(join(STUDIO, "fonts"), join(assets, "fonts"));
  link("../narration", join(assets, "narration"));
  if (existsSync(screens)) link(screens, join(assets, "screens"), video.project);
  if (seal) link(join(STUDIO, "vendor"), join(video.dir, "vendor"));
  if (markSrc) writeIfChanged(join(video.dir, markSrc), readFileSync((mark as { file: string }).file));
  const files = [join(video.dir, "index.html")];
  writeIfChanged(files[0]!, html);
  for (const l of subtitleLangs) {
    const f = join(video.dir, `captions.${l}.json`);
    writeIfChanged(f, JSON.stringify(subs[l], null, 2) + "\n");
    files.push(f);
  }
  return { total: TOTAL, shots: timed.length, list: shotList, files };
}

/**
 * A symbolic link at `path` to `target`, made or corrected; never over a real file or folder.
 * A target inside `within` (the project) is linked relatively, so the project can move.
 */
function link(target: string, path: string, within?: string) {
  if (within && isAbsolute(target) && !relative(within, target).startsWith("..")) target = relative(dirname(path), target) || ".";
  let st;
  try { st = lstatSync(path); } catch { st = null; }
  if (st && !st.isSymbolicLink()) throw new StudioError(`${path} exists and is not a link; move it away so compose can link it to ${target}`);
  if (st && readlinkSync(path) === target) return;
  if (st) unlinkSync(path);
  symlinkSync(target, path);
}
