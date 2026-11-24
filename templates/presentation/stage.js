      // The intro's stage for `intro: seal`: the project's glyph on a seal as a real block, stamped
      // onto a dark wall under a warm key light from the left and a key in the accent from the
      // right, a pool of the accent on the wall beside it; ink in the accent's fill spreads around
      // it and motes in the accent settle. Drawn only while the intro is on screen (until the band
      // has covered it). Its glyph and colours are window.__plan.seal (src/compose.ts). Inlined
      // into index.html by src/compose.ts, only for that intro.
      import * as THREE from "three";

      const S = window.__plan.seal;
      const W = 1920, H = 1080, END = window.__plan.introEnd + 0.3, IMPACT = 1.05;
      /** A colour of the palette as a CSS rgba() with alpha `a`. */
      const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
      const GLYPH_FONT = '700 620px "Fraunces", "Noto Sans CJK JP", "Noto Sans", sans-serif';
      const canvas = document.getElementById("stage");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;

      const SPACE = new THREE.Color(S.space);
      const scene = new THREE.Scene();
      scene.background = SPACE;
      const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 60);

      // ---- Light: a warm key from the upper left (it casts the seal's shadow), a low fill in the accent.
      const hemi = new THREE.HemisphereLight(new THREE.Color(S.page), SPACE, 0);
      scene.add(hemi);
      const key = new THREE.SpotLight(0xfff0e6, 0, 40, 0.5, 0.75, 1.4);
      key.position.set(-4.5, 4.6, 13.5);
      key.target.position.set(-1.6, -0.3, 0);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0004;
      key.shadow.radius = 3;
      scene.add(key, key.target);
      const fill = new THREE.PointLight(new THREE.Color(S.accent), 0, 16, 1.3);
      fill.position.set(0.6, -1.2, 2.6);
      scene.add(fill);
      // The accent's key: from the upper right onto the seal's face and its right edge.
      const accentKey = new THREE.SpotLight(new THREE.Color(S.accent), 0, 40, 0.3, 0.8, 1.2);
      accentKey.position.set(5.5, 4.0, 9.0);
      accentKey.target.position.set(-2.6, 0, 0.4);
      scene.add(accentKey, accentKey.target);

      // ---- The wall: a matte dark surface the seal is stamped on.
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(46, 26), new THREE.MeshStandardMaterial({ color: new THREE.Color(S.wall), roughness: 0.96, metalness: 0 }));
      wall.receiveShadow = true;
      scene.add(wall);

      // ---- The ink: a square-ish stain spreading from the impact, its edge broken by value noise.
      const inkMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uR: { value: 0 }, uA: { value: 0 }, uColor: { value: new THREE.Color(S.accentFill) }, uAccent: { value: new THREE.Color(S.accent) } },
        vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uR, uA; uniform vec3 uColor, uAccent; varying vec2 vP;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec2 a = abs(vP);
            float d = pow(pow(a.x, 5.0) + pow(a.y, 5.0), 0.2);           // a rounded square
            float edge = uR + (n(vP * 3.1) - 0.5) * 0.5 + (n(vP * 9.0) - 0.5) * 0.16;
            float body = 1.0 - smoothstep(edge - 0.05, edge + 0.03, d);
            float rim = smoothstep(edge - 0.35, edge, d) * body;            // ink pools at its edge
            float grain = 0.82 + 0.18 * n(vP * 24.0);
            float alpha = uA * body * (0.62 + 0.35 * rim) * grain;
            vec3 col = mix(uColor * 1.55, uAccent * 0.5, rim * 0.6);
            gl_FragColor = vec4(col, alpha);
          }`,
      });
      const inkPlane = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), inkMat);
      inkPlane.position.set(-2.6, 0, 0.004);
      inkPlane.receiveShadow = false;
      scene.add(inkPlane);

      // ---- The seal: the accent's fill, the glyph in the accent's ink on its face.
      const SIZE = 3, DEPTH = 0.7;
      const sealGroup = new THREE.Group();
      sealGroup.position.set(-2.6, 0, DEPTH / 2);
      scene.add(sealGroup);
      let faceMat, sideMat, block;

      // ---- Ink motes: thrown off the seal's edges at the impact, drag-slowed, sinking, fading.
      const N = 170;
      let seed = 0x5eed1;
      const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const origin = new Float32Array(N * 3), vel = new Float32Array(N * 3), size = new Float32Array(N), shade = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const side = Math.floor(rnd() * 4), u = rnd() * 2 - 1, half = SIZE / 2;
        const nx = side === 0 ? 1 : side === 1 ? -1 : 0, ny = side === 2 ? 1 : side === 3 ? -1 : 0;
        const px = nx ? nx * half : u * half, py = ny ? ny * half : u * half;
        origin.set([-2.6 + px, py, 0.05 + rnd() * 0.5], i * 3);
        const sp = 0.9 + rnd() * 2.6;
        const tx = ny ? (rnd() - 0.5) * 0.9 : 0, ty = nx ? (rnd() - 0.5) * 0.9 : 0;
        vel.set([(nx + tx) * sp, (ny + ty) * sp, 0.3 + rnd() * 1.4], i * 3);
        size[i] = 0.03 + rnd() * rnd() * 0.08;
        shade[i] = rnd();
      }
      const motesGeo = new THREE.BufferGeometry();
      motesGeo.setAttribute("position", new THREE.BufferAttribute(origin, 3));
      motesGeo.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
      motesGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      motesGeo.setAttribute("aShade", new THREE.BufferAttribute(shade, 1));
      const motesMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTau: { value: -1 }, uA: { value: new THREE.Color(S.accent) }, uB: { value: new THREE.Color(S.accentInk) } },
        vertexShader: `
          uniform float uTau; attribute vec3 aVel; attribute float aSize; attribute float aShade;
          varying float vA; varying float vS;
          void main(){
            float t = max(uTau, 0.0);
            float k = 2.4;
            vec3 p = position + aVel * (1.0 - exp(-k * t)) / k + vec3(0.0, -0.045 * t * t, 0.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * 1080.0 / -mv.z * 1.9;
            vA = uTau < 0.0 ? 0.0 : smoothstep(0.0, 0.08, t) * exp(-t * (0.22 + 0.25 * aShade));
            vS = aShade;
          }`,
        fragmentShader: `
          uniform vec3 uA, uB; varying float vA; varying float vS;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.15, d) * vA;
            vec3 c = mix(uA, uB, vS);
            gl_FragColor = vec4(c, a * 0.95);
          }`,
      });
      const motes = new THREE.Points(motesGeo, motesMat);
      motes.frustumCulled = false;
      scene.add(motes);

      // ---- Time -> state, a pure function of t.
      const clamp01 = (x) => Math.min(1, Math.max(0, x));
      const ez = (n) => motion.ease(n);
      const o3 = ez("power3.out"), i2 = ez("power2.in"), o2 = ez("power2.out"), sio = ez("sine.inOut");
      const ramp = (t, a, b, f) => f(clamp01((t - a) / (b - a)));

      function renderAt(t) {
        if (t > END) return; // shot 2 covers the canvas from here on
        // Camera: a slow push in on the seal (the DOM wordmark pushes on the same curve).
        const p = ramp(t, 0, 7.7, sio);
        camera.position.set(THREE.MathUtils.lerp(0.7, 0.1, p), THREE.MathUtils.lerp(0.25, 0.05, p), THREE.MathUtils.lerp(15.6, 13.4, p));
        camera.lookAt(THREE.MathUtils.lerp(0.2, -0.15, p), 0, 0);

        // Lights come up out of the dark.
        const up = ramp(t, 0.0, 1.1, o3);
        key.intensity = 260 * up;
        hemi.intensity = 0.35 * up;
        fill.intensity = 30 * ramp(t, 0.6, 2.2, o3);
        accentKey.intensity = 120 * ramp(t, 0.4, 1.6, o3);

        // The seal: appears lifted (nearer the camera, so larger, its shadow loose), then drops
        // in nine frames and stamps; a short squash on impact.
        const show = ramp(t, 0.3, 0.7, o2);
        faceMat.opacity = sideMat.opacity = show;
        // Lifted only a little, so its loose shadow stays close to it before the stamp.
        const hover = THREE.MathUtils.lerp(2.1, 1.9, clamp01((t - 0.3) / 0.45));
        const drop = ramp(t, 0.75, IMPACT, i2);
        sealGroup.position.z = DEPTH / 2 + THREE.MathUtils.lerp(hover, 0, drop);
        const sq = t < IMPACT ? 0 : Math.exp(-(t - IMPACT) * 11) * Math.cos((t - IMPACT) * 18);
        sealGroup.scale.set(1 + 0.035 * sq, 1 + 0.035 * sq, 1 - 0.14 * sq);
        sealGroup.rotation.set(THREE.MathUtils.lerp(-0.05, 0, drop), THREE.MathUtils.lerp(0.14, 0.06, drop), 0);

        // The ink spreads from the impact and settles.
        const tau = t - IMPACT;
        inkMat.uniforms.uR.value = tau < 0 ? 0 : 1.55 + 0.95 * (1 - Math.exp(-tau * 3.2));
        inkMat.uniforms.uA.value = tau < 0 ? 0 : clamp01(tau * 8);
        motesMat.uniforms.uTau.value = tau;

        renderer.render(scene, camera);
      }

      function faceTexture() {
        const c = document.createElement("canvas");
        c.width = c.height = 1024;
        const g = c.getContext("2d");
        g.fillStyle = S.accentFill;
        g.fillRect(0, 0, 1024, 1024);
        // Pressed ink, smooth (a rectangular mottling reads blocky up close): the ink a
        // little denser toward the edges, a soft lighter bloom where the stamp pressed hardest,
        // and fine round grain (seeded), all well under the glyph's contrast.
        const edge = g.createRadialGradient(512, 512, 180, 512, 512, 760);
        edge.addColorStop(0, rgba(S.accentInk, 0.07));
        edge.addColorStop(1, "rgba(0,0,0,0.22)");
        g.fillStyle = edge;
        g.fillRect(0, 0, 1024, 1024);
        let s = 0x1234;
        const r = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        for (let i = 0; i < 1400; i++) {
          g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : rgba(S.accentInk, 0.035);
          g.beginPath();
          g.arc(r() * 1024, r() * 1024, 0.8 + r() * 2.2, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = rgba(S.accent, 0.6);
        g.lineWidth = 6;
        g.strokeRect(3, 3, 1018, 1018);
        g.fillStyle = S.accentInk;
        g.font = GLYPH_FONT;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(S.glyph, 512, 540);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        return tex;
      }

      // The glyph alone (accent on black) as the face's emissive map: the glyph reads lit, the fill does not glow.
      function glyphTexture() {
        const c = document.createElement("canvas");
        c.width = c.height = 1024;
        const g = c.getContext("2d");
        g.fillStyle = "#000";
        g.fillRect(0, 0, 1024, 1024);
        g.fillStyle = S.accent;
        g.font = GLYPH_FONT;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(S.glyph, 512, 540);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }

      async function build() {
        await document.fonts.load(GLYPH_FONT, S.glyph);
        const tex = faceTexture();
        faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: glyphTexture(), emissiveIntensity: 0.5, transparent: true });
        sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(S.accentFill), roughness: 0.6, metalness: 0, transparent: true });
        block = new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, DEPTH), [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
        block.castShadow = true;
        sealGroup.add(block);
        await renderer.compileAsync(scene, camera);
        renderAt(0);
      }

      window.__hf = window.__hf || {};
      window.__hf.buildReady = window.__hf.buildReady || {};
      const ready = build();
      window.__hf.buildReady["stage"] = ready;
      window.addEventListener("hf-seek", (e) => {
        e.detail.waitUntil(ready.then(() => renderAt(e.detail.time)));
      });
