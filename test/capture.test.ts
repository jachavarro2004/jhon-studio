/**
 * `jhon-studio video capture` (src/capture.ts): the screens studio.yaml lists, made into the
 * video's screens/: files copied, commands run (an argv list, in the project, with a timeout)
 * and drawn as a terminal in the project's palette, web pages captured with a headless Chrome
 * (served here by node:http; skipped when no chrome-headless-shell is found).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { parseAnsiLine } from "../src/ansi.ts";
import { HOST_CHROME, SAMPLE_VIDEO, cli, cliAsync, sampleCopy } from "./helpers.ts";

/** The sample with its studio.yaml's screens replaced by a list. */
function withScreens(t: { after: (fn: () => void) => void }, list: string) {
  const { project, video } = sampleCopy(t);
  const yaml = join(project, ".jhon", "studio.yaml");
  writeFileSync(yaml, readFileSync(yaml, "utf8").replace("screens: screens\n", `screens:\n${list}`));
  return { project, video, at: ["--project", project, "--video", SAMPLE_VIDEO] };
}

/** A PNG's size and the RGB of one pixel (8-bit RGB or RGBA, not interlaced). */
function png(file: string, x = 0, y = 0) {
  const b = readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], type = b[25];
  assert.equal(depth, 8);
  const bpp = type === 6 ? 4 : type === 2 ? 3 : assert.fail(`colour type ${type}`);
  const idat: Buffer[] = [];
  for (let at = 8; at < b.length;) {
    const len = b.readUInt32BE(at), kind = b.toString("ascii", at + 4, at + 8);
    if (kind === "IDAT") idat.push(b.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp;
  let prev = Buffer.alloc(stride), row = Buffer.alloc(stride);
  for (let r = 0; r <= y; r++) {
    const f = raw[r * (stride + 1)]!, src = raw.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1));
    row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0, up = prev[i]!, c = i >= bpp ? prev[i - bpp]! : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]!;
      row[i] = (src[i]! + pred) & 255;
    }
    prev = row;
  }
  return { w, h, rgb: [row[x * bpp]!, row[x * bpp + 1]!, row[x * bpp + 2]!] };
}

test("file screens are copied into the video's screens/, and compose shows them from there", (t) => {
  const { project, video, at } = withScreens(t, "  - file: screens/pantry.png\n  - file: screens/week.png\n");
  const r = cli(["video", "capture", ...at]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "copied screens/pantry.png -> pantry.png (1600x900)\ncopied screens/week.png -> week.png (1600x900)\n");
  for (const f of ["pantry.png", "week.png"]) assert.deepEqual(readFileSync(join(video, "screens", f)), readFileSync(join(project, "screens", f)));
  const c = cli(["video", "compose", ...at]);
  assert.equal(c.code, 0, c.stderr);
  assert.ok(existsSync(join(video, "assets", "screens", "pantry.png")), "the proof loads the captured screen");
  assert.equal(readlinkSync(join(video, "assets", "screens")), "../screens", "linked inside the video folder");
});

test("a missing file is refused by name; the other screens are still made", (t) => {
  const { video, at } = withScreens(t, "  - file: screens/gone.png\n  - file: screens/week.png\n");
  const r = cli(["video", "capture", ...at]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^jhon-studio: screens\[0\] \(gone\.png\): .*screens\/gone\.png does not exist\n$/);
  assert.ok(existsSync(join(video, "screens", "week.png")));
});

test("a command screen: its argv run in the project, never through a shell, drawn as a terminal in the project's palette", (t) => {
  const { video, at } = withScreens(t, [
    "  - cli:",
    "      command: [node, bin/larder.mjs, plan, --week]",
    "      name: plan",
    "      cols: 72",
    "  - cli:",
    `      command: [${JSON.stringify(process.execPath)}, -e, "console.log(JSON.stringify([process.argv[1], process.cwd()]))", "a;b $(echo x) > out"]`,
    "      name: argv",
    "      cols: 200",
    "",
  ].join("\n"));
  const r = cli(["video", "capture", ...at]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^ran node bin\/larder\.mjs plan --week -> plan\.svg \(72x11, \d+x\d+\)\n/);
  const svg = readFileSync(join(video, "screens", "plan.svg"), "utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="(\d+)" height="(\d+)" viewBox="0 0 \1 \2">/);
  assert.match(svg, /@font-face \{ font-family: "Studio Mono"; src: url\("data:font\/woff;base64,/, "the mono face travels inside the SVG");
  assert.ok(svg.includes(">$ node bin/larder.mjs plan --week<"), "the command, as a prompt");
  assert.ok(svg.includes(">Larder<") && svg.includes(">Shopping list:<"), "its output");
  assert.ok(svg.includes('fill="#7fd1b9"'), "truecolor SGR (and the project's accent)");
  assert.ok(svg.includes('fill="#141a19"') || svg.includes("#0e1211"), "the project's page behind it");
  const argv = readFileSync(join(video, "screens", "argv.svg"), "utf8");
  assert.ok(argv.includes("a;b $(echo x) &gt; out"), "the argument reached the program as it was written");
  assert.ok(argv.includes(join(video, "..", "..", "..")), "run in the project");
  assert.ok(!existsSync(join(video, "..", "..", "..", "out")), "no shell redirected anything");
  assert.equal(cli(["video", "capture", ...at]).code, 0);
  assert.equal(readFileSync(join(video, "screens", "plan.svg"), "utf8"), svg, "the same output draws the same SVG");
});

test("a command that fails or outlives its timeout is refused, with its exit and its last lines", (t) => {
  const { at } = withScreens(t, [
    "  - cli:",
    `      command: [${JSON.stringify(process.execPath)}, -e, "console.error('boom'); process.exit(3)"]`,
    "      name: fails",
    "  - cli:",
    `      command: [${JSON.stringify(process.execPath)}, -e, "setTimeout(() => {}, 20000)"]`,
    "      name: slow",
    "      timeout: 1",
    "",
  ].join("\n"));
  const r = cli(["video", "capture", ...at]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /screens\[0\] \(fails\.svg\): .* exited 3:\n  boom\n/);
  assert.match(r.stderr, /screens\[1\] \(slow\.svg\): .* did not end within 1 s/);
});

test("parseAnsiLine: SGR styles in runs; other escapes dropped; wide glyphs take two cells", () => {
  const runs = parseAnsiLine("a\x1b[1;31mbc\x1b[0m\x1b[2K\x1b]8;;http://x\x07d\x1b]8;;\x07日");
  assert.deepEqual(runs.map((r) => [r.col, r.text, r.cells, r.style]), [
    [0, "a", 1, {}],
    [1, "bc", 2, { bold: true, fg: "#e06c75" }],
    [3, "d日", 3, {}],
  ]);
  assert.equal(parseAnsiLine("\x1b[38;5;196mx\x1b[48;2;1;2;3my")[1]!.style.bg, "#010203");
});

const CHROME = HOST_CHROME;
const NO_CHROME = !CHROME || !existsSync(CHROME) ? "no chrome-headless-shell: set JHON_STUDIO_CHROME or run npx --yes hyperframes@0.9.58 browser ensure" : false;

test("a web screen: the page loaded, its steps run (fill, click, wait, scroll, goto), then captured at its viewport", { skip: NO_CHROME }, async (t) => {
  const pages: Record<string, string> = {
    "/": `<!doctype html><body style="margin:0;height:3000px;background:#ff0000"><input id="q"><button id="go" onclick="setTimeout(() => { document.body.style.background = document.getElementById('q').value; const d = document.createElement('p'); d.className = 'done'; document.body.append(d); }, 150)">go</button></body>`,
    "/two": `<!doctype html><body style="margin:0;background:#0000ff"></body>`,
  };
  const server = createServer((req, res) => { res.writeHead(pages[req.url!] ? 200 : 404, { "content-type": "text/html" }); res.end(pages[req.url!] ?? ""); });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { video, at } = withScreens(t, [
    "  - web:",
    `      url: ${base}/`,
    "      name: home",
    "      viewport: [320, 200]",
    "      steps:",
    '        - fill: ["#q", "#00ff00"]',
    '        - click: "#go"',
    '        - wait: ".done"',
    "        - scroll: 40",
    "  - web:",
    `      url: ${base}/`,
    "      name: two",
    "      viewport: [200, 100]",
    "      scale: 2",
    "      steps:",
    "        - goto: /two",
    "        - wait: 50",
    "",
  ].join("\n"));
  const r = await cliAsync(["video", "capture", ...at], { env: { ...process.env, JHON_STUDIO_CHROME: CHROME } });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `captured ${base}/ -> home.png (320x200)\ncaptured ${base}/ -> two.png (400x200)\n`);
  const home = png(join(video, "screens", "home.png"), 300, 190);
  assert.deepEqual([home.w, home.h], [320, 200]);
  assert.deepEqual(home.rgb, [0, 255, 0], "filled, clicked and waited for: the page turned green");
  const two = png(join(video, "screens", "two.png"), 10, 10);
  assert.deepEqual([two.w, two.h, ...two.rgb], [400, 200, 0, 0, 255], "goto the second page, at twice the pixels");
});

test("a web screen whose page does not load is refused by name", { skip: NO_CHROME }, async (t) => {
  // A port nothing listens on: one the system just handed out, closed again.
  const probe = createServer();
  await new Promise<void>((ok) => probe.listen(0, "127.0.0.1", ok));
  const port = (probe.address() as { port: number }).port;
  await new Promise((ok) => probe.close(ok));
  const { at } = withScreens(t, `  - web:\n      url: http://127.0.0.1:${port}/\n      name: gone\n`);
  const r = await cliAsync(["video", "capture", ...at], { env: { ...process.env, JHON_STUDIO_CHROME: CHROME } });
  assert.equal(r.code, 1);
  assert.equal(r.stderr, `jhon-studio: screens[0] (gone.png): http://127.0.0.1:${port}/ did not load (net::ERR_CONNECTION_REFUSED): is it running?\n`);
});

test("without a Chrome, web screens say how to get one and exit 2; files and commands are still made", (t) => {
  const { video, at } = withScreens(t, "  - file: screens/week.png\n  - web:\n      url: http://127.0.0.1:9/\n      name: home\n");
  const r = cli(["video", "capture", ...at], { env: { ...process.env, JHON_STUDIO_CHROME: "/nonexistent/chrome-headless-shell" } });
  assert.equal(r.code, 2);
  assert.equal(r.stdout, "copied screens/week.png -> week.png (1600x900)\n");
  assert.equal(r.stderr, "jhon-studio: screens[1] (home.png): no Chrome to capture web pages with (/nonexistent/chrome-headless-shell does not exist): run npx --yes hyperframes@0.9.58 browser ensure, or set JHON_STUDIO_CHROME to a Chrome or chrome-headless-shell\n");
  assert.ok(existsSync(join(video, "screens", "week.png")));
  assert.ok(!existsSync(join(video, "screens", "home.png")));
});

test("with screens a folder there is nothing to capture: capture says so and changes nothing", (t) => {
  const { video } = sampleCopy(t);
  const r = cli(["video", "capture", "--project", join(video, "..", "..", ".."), "--video", SAMPLE_VIDEO]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "nothing to capture: screens in .jhon/studio.yaml is the folder screens; list files, web pages or commands there to capture them\n");
  assert.ok(!existsSync(join(video, "screens")));
});
