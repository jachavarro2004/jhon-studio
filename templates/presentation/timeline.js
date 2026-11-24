      // The presentation's one timeline, on the studio's motion engine (engine/motion.js), built
      // from window.__plan (src/compose.ts: every time in absolute seconds, from the lines' real
      // lengths), and the film grain. Inlined into index.html by src/compose.ts. Everything
      // visible is a function of timeline time.
      (function () {
        const P = window.__plan;
        const tl = motion.timeline();
        const E = "expo.out", P3 = "power3.out", P4o = "power4.out", P4i = "power4.in";
        const ink = (sel, at, dur) => tl.fromTo(sel, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: dur, ease: "power2.out", immediateRender: true }, at);
        const q = (sel) => motion.toArray(sel);

        // Waterfall entry (cut-the-curve §6): words whip up from below, binary opacity, gaps shrinking x0.84.
        function waterfall(sel, at, base) {
          const ws = q(sel);
          let gap = 0.06, t = at;
          ws.forEach((w) => {
            const heavy = w.textContent.length > 5;
            motion.set(w, { opacity: 0 });
            tl.set(w, { opacity: 1 }, t);
            tl.fromTo(w, { y: heavy ? base + 24 : base }, { y: 0, duration: heavy ? 0.2 : 0.15, ease: P4o, immediateRender: false }, t);
            t += gap; gap *= 0.84;
          });
          return t;
        }
        // A stamp ("ink and stamp"): binary in, from 1.12x down to rest, its hard shadow landing.
        function stamp(sel, at) {
          motion.set(sel, { opacity: 0 });
          tl.set(sel, { opacity: 1 }, at);
          tl.fromTo(sel, { scale: 1.12, boxShadow: "0px 0px 0 #000" }, { scale: 1, boxShadow: "5px 5px 0 #000", duration: 0.3, ease: P3, immediateRender: false }, at);
        }
        // A row stamps in: binary, from a little below, landing.
        function rowIn(sel, at) {
          motion.set(sel, { opacity: 0 });
          tl.set(sel, { opacity: 1 }, at);
          tl.fromTo(sel, { y: 40 }, { y: 0, duration: 0.3, ease: P4o, immediateRender: false }, at);
        }
        // Cut the curve (left): exit power4.in over 230 px, the fade dying at the cut; entry power4.out from 0.35.
        function cutLeft(out, inn, at) {
          tl.fromTo(out, { x: 0 }, { x: -230, duration: 0.3, ease: P4i, immediateRender: false }, at - 0.3);
          tl.fromTo(out, { opacity: 1 }, { opacity: 0, duration: 0.2, ease: "none", immediateRender: false }, at - 0.22);
          tl.fromTo(inn, { x: 230, opacity: 0.35 }, { x: 0, opacity: 1, duration: 0.36, ease: P4o, immediateRender: false }, at);
        }
        // The band sweeps right to left: left of it the old shot, behind its trailing edge the new one.
        function band(b, at, outRv, innRv) {
          tl.fromTo(b, { x: 1920 }, { x: -1100, duration: 0.56, ease: "power2.inOut" }, at);
          tl.fromTo(innRv, { clipPath: "inset(0px 0px 0px 3020px)" }, { clipPath: "inset(0px 0px 0px 0px)", duration: 0.56, ease: "power2.inOut", immediateRender: false }, at);
          if (outRv) tl.fromTo(outRv, { clipPath: "inset(0px 0px 0px 0px)" }, { clipPath: "inset(0px 3020px 0px 0px)", duration: 0.56, ease: "power2.inOut", immediateRender: false }, at);
        }

        // ---------------- The intro: the mark lands at 1.05 s (the flat stamp here, or the 3D seal in stage.js) ----------------
        const IE = P.introEnd, IMPACT = 1.05;
        if (P.intro !== "seal") {
          // The flat intro: the light comes up, the mark drops from a little above and stamps, its
          // shadow landing and a ring in the accent spreading from its edge.
          tl.fromTo("#s1-pool", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 1.6, ease: "power2.out" }, 0);
          tl.fromTo("#s1-mark-face, #s1-mark-shadow", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0.3);
          tl.fromTo("#s1-mark-face", { scale: 1.35 }, { scale: 1, duration: IMPACT - 0.75, ease: "power2.in" }, 0.75);
          tl.fromTo("#s1-mark-face", { scale: 0.965 }, { scale: 1, duration: 0.25, ease: P3, immediateRender: false }, IMPACT);
          tl.fromTo("#s1-mark-shadow", { x: -18, y: -18 }, { x: 0, y: 0, duration: IMPACT - 0.75, ease: "power2.in" }, 0.75);
          motion.set("#s1-ring", { opacity: 0 });
          tl.fromTo("#s1-ring", { opacity: 0.85, scale: 1 }, { opacity: 0, scale: 1.55, duration: 0.9, ease: "power2.out", immediateRender: false }, IMPACT);
        }
        ink("#s1-name", 1.08, 0.55);
        ink("#s1-kick", 1.3, 0.45);
        tl.fromTo("#s1-tag1", { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: E }, 1.96);
        tl.fromTo("#s1-tag2", { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: E }, 3.24);
        tl.fromTo("#s1-cam", { scale: 1 }, { scale: 1.045, duration: IE - 0.3, ease: "sine.inOut" }, 0);
        tl.fromTo("#s1-cam", { x: 0 }, { x: -230, duration: 0.5, ease: "power2.in", immediateRender: false }, IE - 0.25);
        tl.fromTo("#bg-in", { clipPath: "inset(0px 0px 0px 3020px)" }, { clipPath: "inset(0px 0px 0px 0px)", duration: 0.56, ease: "power2.inOut" }, IE - 0.28);
        // The light pool drifts with the current all through the film (parallax under the cuts).
        tl.fromTo("#pool", { x: 160 }, { x: -320, duration: P.total - IE, ease: "none" }, IE);

        // ---------------- Shots ----------------
        for (const s of P.shots) {
          const id = s.id, len = s.end - s.start;
          if (s.kind === "head") {
            tl.fromTo(`#${id}-cam`, { scale: 1 }, { scale: 1.04, duration: len, ease: "none" }, s.start);
            motion.set(`#${id}-kick`, { opacity: 0 });
            tl.set(`#${id}-kick`, { opacity: 1 }, s.start + 0.3);
            ink(`#${id}-kick`, s.start + 0.3, 0.35);
            if (s.lead) tl.fromTo(`#${id}-lead`, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: E }, s.vo);
            s.lines.forEach(([sel, at]) => waterfall(sel, at, 70));
          } else if (s.kind === "card" || s.kind === "list" || s.kind === "numbers") {
            const c = `#${id}-card`;
            tl.fromTo(c, { rotationY: -5, transformPerspective: 2200 }, { rotationY: -1.5, duration: len, ease: "sine.out" }, s.start);
            tl.fromTo(`#${id}-cam .card-face, #${id}-cam .card-shadow`, { scale: 1 }, { scale: 1.035, duration: len, ease: "none" }, s.start);
            const k0 = s.start + (s.seam === "band" ? 0.4 : 0.12);
            motion.set(`#${id}-kick`, { opacity: 0 });
            tl.set(`#${id}-kick`, { opacity: 1 }, k0);
            ink(`#${id}-kick`, k0, 0.3);
            if (s.kind === "card") {
              waterfall(`#${id}-cam .card-title .w`, s.title, 60);
              s.body.forEach(([sel, at]) => { motion.set(sel, { clipPath: "inset(0% 100% 0% 0%)" }); ink(sel, at, 0.55); });
            } else {
              s.rows.forEach(([sel, at]) => rowIn(sel, at));
            }
          } else if (s.kind === "proof") {
            // Held, square-on; the camera pushes in toward the first marks and ends with the whole screen in frame.
            tl.fromTo(`#${id}-scr`, { scale: 0.93, transformOrigin: s.origin }, { scale: 1, duration: len, ease: "sine.inOut" }, s.start);
            if (s.pan) tl.fromTo(`#${id}-sheet`, { y: 0 }, { y: s.pan[0], duration: 0.9, ease: "power3.inOut", immediateRender: false }, s.pan[1]);
            s.marks.forEach(([sel, at], k) => {
              stamp(sel, at);
              if (k > 0) tl.to(s.marks[k - 1][0], { opacity: 0, duration: 0.14, ease: "none" }, at);
            });
          } else if (s.kind === "close") {
            tl.fromTo(`#${id}-cam`, { scale: 1 }, { scale: 1.035, duration: len, ease: "none" }, s.start);
            tl.fromTo(`#${id}-seal-face`, { opacity: 0, scale: 1.35 }, { opacity: 1, scale: 1, duration: 0.3, ease: P3 }, s.vo - 0.1);
            tl.fromTo(`#${id}-seal-shadow`, { opacity: 0, x: -9, y: -9 }, { opacity: 1, x: 0, y: 0, duration: 0.3, ease: P3 }, s.vo - 0.06);
            tl.fromTo(`#${id}-l1`, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: E }, s.vo + 0.56);
            tl.fromTo(`#${id}-l2`, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: E }, s.vo + 1.84);
            motion.set(`#${id}-url`, { opacity: 0 });
            tl.set(`#${id}-url`, { opacity: 1 }, s.vo + s.sec + 0.2);
            ink(`#${id}-url`, s.vo + s.sec + 0.2, 0.5);
          }
        }

        // ---------------- Seams ----------------
        for (const m of P.seams) if (m.kind === "cut") cutLeft(`#${m.out}-cam`, `#${m.inn}-cam`, m.at);
        for (const b of P.bands) {
          const first = b.out === P.introId;
          if (!first) tl.fromTo(`#${b.out}-cam`, { x: 0 }, { x: -230, duration: 0.5, ease: "power2.in", immediateRender: false }, b.at + 0.03);
          band(b.band, b.at, first ? null : `#${b.out}-rv`, `#${b.inn}-rv`);
        }

        // ---------------- Subtitles ----------------
        for (const [sel, at, end] of P.caps) {
          tl.fromTo(sel, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: P3 }, at);
          tl.fromTo(sel, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power1.in", immediateRender: false }, end - 0.3);
        }

        motion.register(tl); // window.__timelines["main"], the timeline HyperFrames seeks
      })();

      // Film grain: six fixed noise frames (a seeded PRNG), each held two video frames (15 a second,
      // as film grain reads; the encoder spends half the bits it would on a new noise every frame).
      (function () {
        const c = document.getElementById("grain"), g = c.getContext("2d");
        let s = 0x2545f491;
        const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const frames = [];
        for (let f = 0; f < 6; f++) {
          const img = g.createImageData(640, 360);
          for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 34; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
          frames.push(img);
        }
        const draw = (t) => g.putImageData(frames[Math.floor(t * 15 + 1e-6) % 6], 0, 0);
        draw(0);
        window.addEventListener("hf-seek", (e) => draw(e.detail.time));
      })();

      // Text fit: an element compose marks data-fit-min (src/compose.ts fitAttrs) shrinks from its
      // size, in steps of 3%, down to that many px, until its text takes at most data-fit-rows rows
      // and stays inside its own box and its frame (the closest data-frame, a card, less its
      // padding; else the picture less its margins, above the subtitles); the elements of one
      // data-fit-group share one scale. Below the smallest size the text wraps (a kicker or a
      // figure, on one line, overflows: compose's check reports it). It runs once the fonts are
      // loaded, as a buildReady promise, so HyperFrames seeks no frame before the text is fitted.
      (function () {
        const SAFE = { left: 48, top: 32, right: 1872, bottom: 930 };
        const root = document.getElementById("root");
        function rows(el, size) {
          const r = document.createRange();
          r.selectNodeContents(el);
          const tops = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0).map((x) => x.top).sort((a, b) => a - b);
          let n = tops.length ? 1 : 0;
          for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > size * 0.5) n++;
          return { n, box: r.getBoundingClientRect() };
        }
        function frameOf(el) {
          const f = el.parentElement && el.parentElement.closest("[data-frame]");
          if (!f) return SAFE;
          const b = f.getBoundingClientRect(), cs = getComputedStyle(f);
          return { left: b.left + parseFloat(cs.paddingLeft), top: b.top, right: b.right - parseFloat(cs.paddingRight), bottom: b.bottom };
        }
        function fits(el) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          const { n, box } = rows(el, size), f = frameOf(el);
          return n <= Number(el.dataset.fitRows || 1) && el.scrollWidth <= el.clientWidth + 1
            && box.left >= f.left - 1 && box.right <= f.right + 1 && box.bottom <= f.bottom + 1;
        }
        function fit() {
          root.classList.add("fitting");
          const groups = new Map();
          for (const el of root.querySelectorAll("[data-fit-min]")) {
            const g = el.dataset.fitGroup || el.id;
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(el);
          }
          for (const els of groups.values()) {
            if (els.every(fits)) continue;
            const max = els.map((el) => parseFloat(getComputedStyle(el).fontSize)), min = els.map((el) => Number(el.dataset.fitMin));
            for (let k = 0.97; ; k *= 0.97) {
              els.forEach((el, i) => { el.style.fontSize = `${Math.max(min[i], Math.round(max[i] * k * 2) / 2)}px`; });
              if (els.every(fits) || els.every((el, i) => max[i] * k <= min[i])) break;
            }
          }
          root.classList.remove("fitting");
        }
        window.__hf = window.__hf || {};
        window.__hf.buildReady = window.__hf.buildReady || {};
        window.__hf.buildReady["fit"] = Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready).then(fit);
      })();
