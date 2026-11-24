// SPDX-License-Identifier: Apache-2.0
// The studio's motion engine (engine/motion.js).
//
// A small deterministic animation layer for HyperFrames compositions: timelines of tweens on
// absolute positions, seeked frame by frame. render(t) is a pure function of t: every start is
// resolved while the timeline is built, and no clock, timer or state between frames is read, so
// any seek order gives the same DOM. For each property of each element the latest-started
// segment wins and holds its end value; before any has started the property keeps its base
// (what motion.set or an immediate fromTo rendered while building, else its inline value).
//
//   const tl = motion.timeline();
//   tl.fromTo("#a", { x: 230, opacity: 0.35 }, { x: 0, opacity: 1, duration: 0.36, ease: "power4.out" }, 2);
//   tl.to("#a", { opacity: 0, duration: 0.2, ease: "none" }, 5);
//   tl.set("#b", { opacity: 1 }, 3);
//   motion.register(tl);       // window.__timelines["main"], the timeline HyperFrames seeks
//
// The eases keep the formulas the approved film was first made with (their record:
// test/ease-reference.json), so it moves as it was approved.
(function (root) {
  "use strict";

  // ---- Eases
  const powIn = (n) => (p) => Math.pow(p, n);
  const powOut = (n) => (p) => 1 - Math.pow(1 - p, n);
  const powInOut = (n) => (p) => (p < 0.5 ? Math.pow(2 * p, n) / 2 : 1 - Math.pow(2 * (1 - p), n) / 2);
  // expo: 2^(10(p-1)) blended with p^6(1-p), so that it starts at exactly 0.
  const expoIn = (p) => Math.pow(2, 10 * (p - 1)) * p + p * p * p * p * p * p * (1 - p);
  const sineIn = (p) => (p === 1 ? 1 : 1 - Math.cos(p * (Math.PI / 2)));
  const EASES = {
    none: (p) => p,
    "expo.out": (p) => 1 - expoIn(1 - p),
    "power1.in": powIn(2),
    "power2.in": powIn(3), "power2.out": powOut(3), "power2.inOut": powInOut(3),
    "power3.out": powOut(4), "power3.inOut": powInOut(4),
    "power4.in": powIn(5), "power4.out": powOut(5),
    "sine.inOut": (p) => (p < 0.5 ? sineIn(2 * p) / 2 : 1 - sineIn(2 * (1 - p)) / 2),
    "sine.out": (p) => 1 - sineIn(1 - p),
  };
  function ease(name) {
    const f = EASES[name];
    if (!f) throw new Error(`motion: unknown ease "${name}" (known: ${Object.keys(EASES).join(", ")})`);
    return f;
  }

  // ---- Properties. Numbers are written rounded to 4 decimals, -0 as 0.
  const NUM = { opacity: 1, x: 0, y: 0, yPercent: 0, scale: 1, rotationY: 0, transformPerspective: 0 };
  const STR = { transformOrigin: "transformOrigin", clipPath: "clipPath", boxShadow: "boxShadow" };
  const KEYS = new Set(["duration", "ease", "immediateRender"]);
  const fmt = (v) => String(Math.round(v * 1e4) / 1e4 || 0);
  const round7 = (v) => Math.round(v * 1e7) / 1e7 || 0;
  // A string of numbers (clip-path inset(), box-shadow): numbers interpolate, the rest is kept; hex colours are not numbers.
  const TOKEN = /#[0-9a-fA-F]+|-?\d*\.?\d+(?:e[-+]?\d+)?/g;
  const nums = (s) => (s.match(TOKEN) || []).filter((m) => m[0] !== "#").map(Number);
  function lerpString(a, b, r) {
    const na = nums(a), nb = nums(b);
    const shape = (s) => s.replace(TOKEN, (m) => (m[0] === "#" ? m : "N"));
    if (na.length !== nb.length || shape(a) !== shape(b)) throw new Error(`motion: cannot tween "${a}" to "${b}"`);
    let i = 0;
    return b.replace(TOKEN, (m) => {
      if (m[0] === "#") return m;
      const k = i++;
      return fmt(na[k] + (nb[k] - na[k]) * r);
    });
  }
  function check(p) {
    if (!(p in NUM) && !(p in STR)) throw new Error(`motion: unsupported property "${p}"`);
  }

  function toArray(sel) {
    if (typeof sel === "string") return Array.from(root.document.querySelectorAll(sel));
    if (sel && typeof sel.length === "number" && !sel.style) return Array.from(sel).flatMap(toArray);
    return sel ? [sel] : [];
  }

  // ---- Element state: per property, its base and its segments; the inline values it had before.
  const elements = new Map();
  function stateOf(el) {
    let s = elements.get(el);
    if (!s) elements.set(el, (s = { el, props: new Map(), inline: {} }));
    return s;
  }
  function track(s, p) {
    check(p);
    let tr = s.props.get(p);
    if (!tr) {
      const css = p in STR ? STR[p] : p === "opacity" ? "opacity" : "transform";
      if (!(css in s.inline)) s.inline[css] = s.el.style[css] || "";
      s.props.set(p, (tr = { base: undefined, segs: [] }));
    }
    return tr;
  }
  function segValue(g, t) {
    if (g.dur === 0 || t >= g.start + g.dur) return g.to;
    if (g.from === g.to) return g.from;
    const r = g.ease((t - g.start) / g.dur);
    return typeof g.to === "number" ? g.from + (g.to - g.from) * r : g.p in STR && g.p !== "transformOrigin" ? lerpString(g.from, g.to, r) : r > 0 ? g.to : g.from;
  }
  function valueAt(tr, t) {
    let best;
    for (const g of tr.segs) if (g.start <= t && (!best || g.start >= best.start)) best = g;
    return best ? segValue(best, t) : tr.base;
  }
  // The value a `to` starts from: the track at that time, else the element's computed style, else the property's rest value.
  function resolve(el, tr, p, t) {
    const v = valueAt(tr, t);
    if (v !== undefined) return v;
    const cs = root.getComputedStyle ? root.getComputedStyle(el) : null;
    if (p in STR) return (cs && cs[STR[p]]) || "";
    if (p === "opacity" && cs && cs.opacity !== "") return Number(cs.opacity);
    return NUM[p];
  }

  // ---- Writing one element's styles at time t (one composed transform string, fixed order).
  function write(s, t) {
    const v = {};
    for (const [p, tr] of s.props) v[p] = valueAt(tr, t);
    const st = s.el.style;
    if ("opacity" in s.inline) st.opacity = v.opacity === undefined ? s.inline.opacity : fmt(v.opacity);
    for (const p in STR) if (STR[p] in s.inline) st[STR[p]] = v[p] === undefined ? s.inline[STR[p]] : String(v[p]);
    if ("transform" in s.inline) {
      const parts = [];
      if (v.transformPerspective !== undefined) parts.push(`perspective(${fmt(v.transformPerspective)}px)`);
      if (v.yPercent !== undefined) parts.push(`translate(0%, ${fmt(v.yPercent)}%)`);
      if (v.x !== undefined || v.y !== undefined) parts.push(`translate(${fmt(v.x || 0)}px, ${fmt(v.y || 0)}px)`);
      if (v.rotationY !== undefined) parts.push(`rotateY(${fmt(v.rotationY)}deg)`);
      if (v.scale !== undefined) parts.push(`scale(${fmt(v.scale)})`);
      st.transform = parts.length ? parts.join(" ") : s.inline.transform;
    }
  }
  // Sets the base of the properties given (motion.set, an immediate fromTo) and renders it at once.
  function writeBase(s, vars) {
    for (const p in vars) if (!KEYS.has(p)) s.props.get(p).base = vars[p];
    write(s, -Infinity);
  }

  function set(sel, vars) {
    for (const el of toArray(sel)) {
      const s = stateOf(el);
      for (const p in vars) if (!KEYS.has(p)) track(s, p);
      writeBase(s, vars);
    }
  }

  function timeline() {
    const mine = new Set();
    let end = 0;
    function add(sel, from, to, at, immediate) {
      const start = round7(at), dur = round7(to.duration || 0);
      const ez = dur > 0 ? ease(to.ease) : null;
      end = Math.max(end, start + dur);
      for (const el of toArray(sel)) {
        const s = stateOf(el);
        mine.add(s);
        const props = [...new Set([...Object.keys(from || {}), ...Object.keys(to)])].filter((p) => !KEYS.has(p));
        const segs = props.map((p) => {
          const tr = track(s, p);
          const a = from && p in from ? from[p] : resolve(el, tr, p, start);
          return [tr, { p, start, dur, ease: ez, from: a, to: p in to ? to[p] : a }];
        });
        for (const [tr, g] of segs) tr.segs.push(g);
        if (immediate) writeBase(s, from);
      }
      return api;
    }
    const api = {
      fromTo: (sel, from, to, at) => add(sel, from, to, at, to.immediateRender !== false),
      to: (sel, to, at) => add(sel, null, to, at, false),
      set: (sel, vars, at) => add(sel, null, { ...vars, duration: 0 }, at, false),
      duration: () => end,
      render(t) {
        t = round7(t); // the playhead on the same 1e-7 grid as the starts, so a frame on a tween's boundary or a rounding tie lands the same way every time
        for (const s of mine) write(s, t);
        return api;
      },
    };
    return api;
  }

  // HyperFrames 0.9.58 seeks a registered timeline: pause(), then totalTime(t, suppressEvents) or
  // seek(t); it reads duration() and time(). Every call renders the shim's time.
  function register(tl, id = "main") {
    let time = 0, paused = true;
    const go = (t) => (t === undefined ? time : ((time = Math.max(0, Number(t) || 0)), tl.render(time), h));
    const h = {
      pause: () => ((paused = true), tl.render(time), h),
      play: () => ((paused = false), tl.render(time), h),
      paused: (v) => (v === undefined ? paused : ((paused = !!v), tl.render(time), h)),
      time: go,
      totalTime: go,
      seek: (t) => go(t),
      duration: () => tl.duration(),
    };
    root.__timelines = root.__timelines || {};
    root.__timelines[id] = h;
    return h;
  }

  const motion = { timeline, set, ease, register, toArray };
  root.motion = motion;
})(typeof window !== "undefined" ? window : globalThis);
