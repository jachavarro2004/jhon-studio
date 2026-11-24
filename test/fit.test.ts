/**
 * Text fits its frame (T7): the presentation's text (the intro's name and tagline, headlines,
 * card titles and lines, list rows, figures, the close's pitch) wraps and shrinks within limits
 * instead of running off the picture on one line, and compose measures every shot in a headless
 * Chrome, failing on text that still overflows, naming the shot and the element. The page is
 * measured here with the studio's own DevTools client (skipped without a chrome-headless-shell).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Browser } from "../src/cdp.ts";
import { HOST_CHROME, SAMPLE_VIDEO, cli, cliAsync, sampleCopy } from "./helpers.ts";

const CHROME = HOST_CHROME;
const NO_CHROME = !CHROME || !existsSync(CHROME) ? "no chrome-headless-shell: set JHON_STUDIO_CHROME or run npx --yes hyperframes@0.9.58 browser ensure" : false;
const withChrome = { ...process.env, JHON_STUDIO_CHROME: CHROME };

/** The picture less its margins, above the subtitles: where every line of text must stay. */
const SAFE = { left: 48, top: 32, right: 1872, bottom: 930 };

/** The sample with some of its shots' text replaced (each shot's spoken line kept, so its narration still matches). */
function withText(t: { after: (fn: () => void) => void }, edit: (shots: Record<string, any>) => void) {
  const { project, video } = sampleCopy(t);
  const file = join(video, "script.json");
  const s = JSON.parse(readFileSync(file, "utf8"));
  edit(Object.fromEntries(s.shots.map((x: { id: string }) => [x.id, x])));
  writeFileSync(file, JSON.stringify(s, null, 2));
  return { project, video, at: ["--project", project, "--video", SAMPLE_VIDEO] };
}

/** Each selector's font size and the box its text takes (its content, not its element), in the composed page once it is laid out. */
async function layout(video: string, selectors: string[]) {
  const b = await Browser.launch(CHROME);
  try {
    const page = await b.page(1920, 1080, 1);
    await page.goto(pathToFileURL(join(video, "index.html")).href);
    await page.eval("Promise.all(Object.values((window.__hf && window.__hf.buildReady) || {}))");
    return await page.eval<Record<string, { size: number; left: number; top: number; right: number; bottom: number; rows: number }>>(`(() => {
      const out = {};
      for (const sel of ${JSON.stringify(selectors)}) {
        const el = document.querySelector(sel);
        const r = document.createRange();
        r.selectNodeContents(el);
        const box = r.getBoundingClientRect();
        const size = parseFloat(getComputedStyle(el).fontSize);
        const tops = [...r.getClientRects()].filter((x) => x.width > 0).map((x) => x.top).sort((a, b) => a - b);
        const rows = tops.filter((y, i) => i === 0 || y - tops[i - 1] > size / 2).length;
        out[sel] = { size, left: box.left, top: box.top, right: box.right, bottom: box.bottom, rows };
      }
      return out;
    })()`);
  } finally {
    await b.close();
  }
}

test("the sample's text keeps its sizes: nothing shrinks that already fits, and compose says every shot was measured", { skip: NO_CHROME }, async (t) => {
  const { project, video } = sampleCopy(t);
  const r = await cliAsync(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO], { env: withChrome });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\ntext fit: every shot fits its frame \(measured in headless Chrome\)\n$/);
  const l = await layout(video, ["#problem-l1", "#problem-l2", "#stock-card .card-title", "#plan-r0 .lk", "#close-l1"]);
  assert.equal(l["#problem-l1"]!.size, 116, "a headline at its full size");
  assert.equal(l["#problem-l2"]!.size, 116);
  assert.equal(l["#stock-card .card-title"]!.size, 108, "a card title at its full size");
  assert.equal(l["#plan-r0 .lk"]!.size, 78, "a list row at its full size");
  for (const [sel, x] of Object.entries(l)) assert.equal(x.rows, 1, `${sel} stays on one row`);
});

test("long text wraps and shrinks within its frame instead of running off the picture", { skip: NO_CHROME }, async (t) => {
  const { video, at } = withText(t, (s) => {
    s.problem.lines[0] = ["what is *for dinner* tonight, tomorrow and every night after that", "what is for dinner"];
    s.stock.title = ["It starts with *what you already have in the pantry and the fridge.*"];
    s.stock.body = [["Every item in the house, with its amount and the day it was bought.", "every item"]];
    s.plan.rows[0] = ["Plan", "seven dinners from what is already in the pantry", "plans seven"];
    s.month.figures[0] = ["30,000,000%", "less food thrown away", "30% less"];
    s.close.lines = ["Cook from what you already have, every single night of the week.", "Larder plans it, shops for it, and keeps the waste down."];
  });
  const r = await cliAsync(["video", "compose", ...at], { env: withChrome });
  assert.equal(r.code, 0, r.stderr);
  const sels = ["#problem-l1", "#problem-l2", "#stock-card .card-title", "#stock-b0", "#plan-r0", "#month-f0 .fig-n", "#close-l1", "#close-l2"];
  const l = await layout(video, sels);
  for (const sel of sels) {
    const x = l[sel]!;
    assert.ok(x.left >= SAFE.left && x.right <= SAFE.right && x.top >= SAFE.top && x.bottom <= SAFE.bottom, `${sel} leaves the frame: ${JSON.stringify(x)}`);
  }
  assert.ok(l["#problem-l1"]!.size < 116 && l["#problem-l1"]!.size >= 72, `the headline shrank within its limits: ${l["#problem-l1"]!.size}px`);
  assert.equal(l["#problem-l2"]!.size, l["#problem-l1"]!.size, "a headline's two lines keep one size");
  assert.ok(l["#stock-card .card-title"]!.size < 108 && l["#stock-card .card-title"]!.size >= 64, `the card title shrank within its limits: ${l["#stock-card .card-title"]!.size}px`);
  assert.ok(l["#stock-card .card-title"]!.right <= (1920 + 1460) / 2, "the title stays on its card");
  assert.ok(l["#month-f0 .fig-n"]!.size < 200, "a long figure shrinks");
});

test("text that cannot fit even at its smallest size fails compose, naming the shot and the element; make stops there", { skip: NO_CHROME }, async (t) => {
  const { video, at } = withText(t, (s) => {
    s.problem.lines[0] = [Array.from({ length: 12 }, () => "what is for dinner and what is about to spoil").join(" "), "what is for dinner"];
    s.stock.kicker = "Your pantry, your fridge, your freezer, your cupboards and every shelf in the house";
  });
  const r = await cliAsync(["video", "compose", ...at], { env: withChrome });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^jhon-studio: the text does not fit its frame in 2 shots \(index\.html is written, to preview it\):\n/);
  assert.match(r.stderr, /\n  problem: the headline's line 1 \(#problem-l1\) runs \d+ px past the frame's bottom\n/);
  assert.match(r.stderr, /\n  stock: the kicker \(#stock-kick\) runs \d+ px past the card's right edge\n/);
  assert.match(r.stderr, /\nshorten that text \(or split it across shots\), then compose again\n$/);
  assert.ok(existsSync(join(video, "index.html")), "written, so the overflow can be seen");
  const m = await cliAsync(["video", "make", ...at, "--dry-run"], { env: withChrome });
  assert.equal(m.code, 1);
  assert.match(m.stderr, /the text does not fit its frame in 2 shots/);
});

test("without a Chrome, compose still writes the composition and says the text was not measured, with the fix", (t) => {
  const { project, video } = sampleCopy(t);
  const r = cli(["video", "compose", "--project", project, "--video", SAMPLE_VIDEO], { env: { ...process.env, JHON_STUDIO_CHROME: "/nonexistent/chrome-headless-shell" } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\ntext fit: not measured: no Chrome \(\/nonexistent\/chrome-headless-shell does not exist; run npx --yes hyperframes@0\.9\.58 browser ensure, or set JHON_STUDIO_CHROME\)\n$/);
  assert.ok(existsSync(join(video, "index.html")));
});
