// test/fixtures/sample-screens.mjs — draw the sample project's two screens (a fictional app,
// examples/sample-project) with ffmpeg and the studio's own fonts:
//
//   node test/fixtures/sample-screens.mjs
//
// writes examples/sample-project/screens/pantry.png and week.png (1600x900). The rectangles the
// sample's script marks (examples/sample-project/.jhon/studio/tour/script.json) are the panels
// drawn here: keep the two in step.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "examples", "sample-project", "screens");
const FONT = { ui: join(ROOT, "fonts", "space-grotesk-medium.woff"), display: join(ROOT, "fonts", "fraunces.woff") };
const C = { page: "0x141a19", panel: "0x1b2422", rule: "0x2a3533", fill: "0x1f4a40", accent: "0x7fd1b9", ink: "0xeef4f1", soft: "0xc9d4cf", faint: "0x8a9893" };

const box = (x, y, w, h, c) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${c}:t=fill`;
const text = (x, y, s, size, c, font = "ui") => `drawtext=fontfile=${FONT[font]}:text='${s}':fontcolor=${c}:fontsize=${size}:x=${x}:y=${y}`;
const header = (title) => [box(0, 0, 1600, 96, C.panel), text(48, 24, "Larder", 44, C.accent, "display"), text(230, 34, title, 32, C.ink), box(0, 96, 1600, 2, C.rule)];

function draw(name, layers) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${C.page}:s=1600x900`, "-frames:v", "1", "-vf", layers.join(","), join(OUT, name)]);
  console.log(join(OUT, name));
}

// The pantry: what is in stock (left), what to use soon (right), and the week's plan button.
const items = [["Rice", "2 kg"], ["Chickpeas", "3 cans"], ["Spinach", "1 bag"], ["Eggs", "6"], ["Tomatoes", "5"], ["Onions", "4"]];
draw("pantry.png", [
  ...header("Pantry"), text(1380, 36, "6 items", 28, C.faint),
  box(48, 136, 920, 716, C.panel), text(80, 164, "IN STOCK", 26, C.accent),
  ...items.flatMap(([n, q], i) => [text(80, 226 + i * 100, n, 40, C.ink), text(640, 230 + i * 100, q, 36, C.soft), box(80, 296 + i * 100, 856, 2, C.rule)]),
  box(1008, 136, 544, 420, C.fill), text(1040, 164, "USE SOON", 26, C.accent),
  ...[["Spinach", "2 days"], ["Tomatoes", "4 days"], ["Eggs", "6 days"]].flatMap(([n, d], i) => [text(1040, 236 + i * 90, n, 38, C.ink), text(1340, 240 + i * 90, d, 32, C.soft)]),
  box(1008, 596, 544, 110, C.accent), text(1070, 628, "Plan this week", 40, C.page),
]);

// The week: seven dinners (Tuesday's uses the spinach first), and the short shopping list.
const days = [["MON", "Chickpea", "curry"], ["TUE", "Spinach", "omelette"], ["WED", "Tomato", "rice"], ["THU", "Egg fried", "rice"], ["FRI", "Onion", "soup"], ["SAT", "Chickpea", "salad"], ["SUN", "Leftovers", ""]];
draw("week.png", [
  ...header("This week"),
  ...days.flatMap(([d, a, b], i) => {
    const x = 48 + i * 220;
    return [box(x, 136, 208, 484, C.panel), text(x + 22, 162, d, 26, C.accent), text(x + 22, 230, a, 30, C.ink), ...(b ? [text(x + 22, 272, b, 30, C.ink)] : [])];
  }),
  box(48, 660, 1528, 190, C.fill), text(80, 688, "SHOPPING LIST", 26, C.accent),
  text(80, 748, "Lentils · Lemons · Yogurt", 44, C.ink), text(1400, 756, "3 items", 32, C.soft),
]);
