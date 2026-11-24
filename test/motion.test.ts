/**
 * The motion engine (engine/motion.js): its eases are the approved film's,
 * render(t) is a pure function of t, a `to` starts from its property's track, fromTo renders its
 * from-state at once unless told not to, and HyperFrames drives it through its timeline shim.
 *
 *   node --experimental-strip-types --test test/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { ROOT } from "./helpers.ts";

const SRC = readFileSync(join(ROOT, "engine", "motion.js"), "utf8");
const EASES = ["none", "expo.out", "power1.in", "power2.in", "power2.out", "power2.inOut", "power3.out", "power3.inOut", "power4.in", "power4.out", "sine.inOut", "sine.out"];

type El = { id: string; style: Record<string, string> };
/** A page of bare elements (id → element) and the engine loaded into it as a browser loads it: a classic script. */
function page(ids: string[]) {
  const els: Record<string, El> = Object.fromEntries(ids.map((id) => [id, { id, style: {} }]));
  const document = {
    querySelectorAll: (sel: string) => sel.split(",").map((s) => els[s.trim().replace(/^#/, "")]).filter(Boolean),
  };
  const ctx = vm.createContext({ document }) as any;
  ctx.window = ctx;
  vm.runInContext(SRC, ctx, { filename: "motion.js" });
  return { motion: ctx.motion, els, window: ctx };
}
const styles = (els: Record<string, El>) => JSON.stringify(Object.values(els).map((e) => [e.id, { ...e.style }]));

test("each ease is the film's: 1,001 points of every ease it uses, the same float64 values as the reference", (t) => {
  // ease-reference.json was recorded from the eases the film was first made with (its "source"),
  // before this engine replaced them: a SHA-256 of each ease's 1,001 values and every 100th value.
  const ref = JSON.parse(readFileSync(join(ROOT, "test", "ease-reference.json"), "utf8")).eases;
  const { motion } = page([]);
  assert.deepEqual(Object.keys(ref), EASES);
  for (const name of EASES) {
    const f = motion.ease(name), buf = Buffer.alloc(1001 * 8);
    for (let i = 0; i <= 1000; i++) buf.writeDoubleLE(f(i / 1000), i * 8);
    const max = Math.max(...ref[name].every100.map((v: number, k: number) => Math.abs(f(k / 10) - v)));
    t.diagnostic(`${name}: max |error| ${max} at every 100th point`);
    assert.ok(max < 1e-9, `${name}: max error ${max}`);
    assert.equal(createHash("sha256").update(buf).digest("hex"), ref[name].sha256, `${name}: its 1,001 values are not the reference's`);
  }
  assert.throws(() => motion.ease("bounce.out"), /bounce\.out/);
});

test("render(t) is a pure function of t: any seek order gives the same styles", () => {
  const { motion, els } = page(["a", "b"]);
  const tl = motion.timeline();
  tl.fromTo("#a", { x: 0, opacity: 0.35 }, { x: 230, opacity: 1, duration: 2, ease: "power4.out" }, 1);
  tl.fromTo("#a", { scale: 1.12, boxShadow: "0px 0px 0 #000" }, { scale: 1, boxShadow: "5px 5px 0 #000", duration: 3, ease: "power3.out", immediateRender: false }, 2);
  tl.fromTo("#b", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 4, ease: "power2.out" }, 0.5);
  tl.set("#b", { opacity: 0.5 }, 3);
  tl.render(5);
  const at5 = styles(els);
  tl.render(1);
  assert.notEqual(styles(els), at5, "t=1 is another frame");
  tl.render(5);
  assert.equal(styles(els), at5);
  assert.equal(els.a!.style.transform, "translate(230px, 0px) scale(1)");
  assert.equal(els.b!.style.clipPath, "inset(0% 0% 0% 0%)");
  tl.render(2.5);
  assert.equal(els.a!.style.transform, "translate(229.7754px, 0px) scale(1.0579)", "x power4.out at 0.75, scale power3.out at 1/6");
  assert.equal(els.a!.style.boxShadow, "2.5887px 2.5887px 0 #000");
});

test("the playhead is on a 1e-7 grid: a frame on a rounding tie lands as the film's reference build did", () => {
  // The intro's camera at frame 154 (30 fps): 1 + 0.045 × sine.inOut(2/3) is 1.03375 at the exact
  // frame time and a hair under it on the grid; the film was approved at 1.0337.
  const { motion, els } = page(["cam"]);
  const tl = motion.timeline();
  tl.fromTo("#cam", { scale: 1 }, { scale: 1.045, duration: 7.7, ease: "sine.inOut" }, 0);
  tl.render(154 / 30);
  assert.equal(els.cam!.style.transform, "scale(1.0337)");
});

test("a `to` starts from its property's track at its start; the latest-started segment wins and holds its end", () => {
  const { motion, els } = page(["m"]);
  motion.set("#m", { opacity: 0 });
  const tl = motion.timeline();
  tl.set("#m", { opacity: 1 }, 1);
  tl.to("#m", { opacity: 0, duration: 1, ease: "none" }, 2);
  for (const [t, want] of [[0.5, "0"], [1, "1"], [2, "1"], [2.25, "0.75"], [3, "0"], [9, "0"]] as const) {
    tl.render(t);
    assert.equal(els.m!.style.opacity, want, `opacity at ${t} s`);
  }
  assert.equal(tl.duration(), 3);
});

test("fromTo renders its from-state at once; with immediateRender: false the element is untouched until it starts", () => {
  const { motion, els } = page(["now", "later"]);
  els.later!.style.opacity = "0.8";
  const tl = motion.timeline();
  tl.fromTo("#now", { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out" }, 2);
  tl.fromTo("#later", { opacity: 0 }, { opacity: 1, duration: 1, ease: "none", immediateRender: false }, 2);
  assert.equal(els.now!.style.transform, "translate(0%, 110%)", "rendered while the timeline is built");
  assert.equal(els.later!.style.opacity, "0.8");
  tl.render(2.5);
  assert.equal(els.later!.style.opacity, "0.5");
  tl.render(1);
  assert.equal(els.now!.style.transform, "translate(0%, 110%)");
  assert.equal(els.later!.style.opacity, "0.8", "back before its start: its inline value again");
});

test("HyperFrames drives it as window.__timelines.main: pause, then totalTime(t) or seek(t); duration and time read back", () => {
  const { motion, els, window } = page(["c"]);
  const tl = motion.timeline();
  tl.fromTo("#c", { rotationY: -5, transformPerspective: 2200 }, { rotationY: -1.5, duration: 4, ease: "sine.out" }, 0);
  tl.fromTo("#c", { scale: 0.93, transformOrigin: "12px 34px" }, { scale: 1, duration: 4, ease: "sine.inOut" }, 0);
  const h = motion.register(tl);
  assert.equal(window.__timelines.main, h);
  for (const m of ["pause", "play", "paused", "time", "duration", "totalTime", "seek"]) assert.equal(typeof h[m], "function", m);
  h.pause();
  assert.equal(h.paused(), true);
  h.totalTime(4, true);
  assert.equal(els.c!.style.transform, "perspective(2200px) rotateY(-1.5deg) scale(1)");
  assert.equal(els.c!.style.transformOrigin, "12px 34px");
  assert.equal(h.time(), 4);
  h.seek(0);
  assert.equal(els.c!.style.transform, "perspective(2200px) rotateY(-5deg) scale(0.93)");
  assert.equal(h.totalTime(), 0);
  assert.equal(h.duration(), 4);
  h.time(2);
  assert.equal(els.c!.style.transform, "perspective(2200px) rotateY(-2.5251deg) scale(0.965)");
});
