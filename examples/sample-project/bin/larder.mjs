#!/usr/bin/env node
// Larder's command line (a fictional project): `larder plan --week` prints the week's dinners,
// the spinach first, and the shopping list. jhon-studio's tests capture it as a terminal screen.
const colour = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);
const sgr = (code) => (s) => (colour ? `\x1b[${code}m${s}\x1b[0m` : s);
const accent = sgr("1;38;2;127;209;185"), dim = sgr("2"), warn = sgr("33"), ok = sgr("32"), bold = sgr("1");

const [cmd, ...rest] = process.argv.slice(2);
if (cmd !== "plan" || !rest.includes("--week")) {
  console.log("usage: larder plan --week");
  process.exit(cmd ? 2 : 0);
}
const week = [
  ["MON", "Chickpea curry", "chickpeas, onions"],
  ["TUE", "Spinach omelette", "spinach (2 days left), eggs"],
  ["WED", "Tomato rice", "tomatoes, rice"],
  ["THU", "Egg fried rice", "eggs, rice"],
  ["FRI", "Onion soup", "onions"],
  ["SAT", "Chickpea salad", "chickpeas, tomatoes"],
  ["SUN", "Leftovers", ""],
];
console.log(`${accent("Larder")} ${bold("plan for the week")}  ${dim("6 items in stock")}`);
console.log("");
for (const [day, dish, uses] of week) {
  const used = uses.includes("days left") ? uses.replace(/spinach \(2 days left\)/, warn("spinach (2 days left)")) : uses;
  console.log(`  ${dim(day)}  ${dish.padEnd(18)} ${used ? dim("uses ") + used : ""}`);
}
console.log("");
console.log(`${ok("Shopping list:")} lentils, lemons, yogurt ${dim("(3 items)")}`);
