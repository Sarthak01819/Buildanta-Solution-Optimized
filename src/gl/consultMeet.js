/* ── THE MEET v3 — the Veo handshake as a GPU flipbook (D-043) ───────────
   Yash's 12 MCQs (31 Aug): his Veo footage (green hand + human hand meeting
   in a HANDSHAKE) replaces the built hands; hands are MATTED off the red
   curtain offline (scratchpad/matte2.py — keys + hole-fill + component
   cleanup + de-spill + spearmint grade + watermark inpaint) and composited
   STANDALONE over the act's black void (a curtain shader can come later);
   pure scroll drive; crossfade between adjacent frames so slow scrolls
   never step; both handshake pumps included; spark + WE SCALE title fire at
   the clasp; finger beat retired (his call); small frame set for phones.

   ENGINE (research round wf_1fb21696-f7b): 96 unique frames (the 120 PNG
   export carried 24 pulldown duplicates) as WebP-with-alpha, fetched as
   blobs up front (~3.3MB desktop / ~1.1MB phone), decoded to GPU textures
   through a skeleton-set + LRU ring so VRAM stays bounded (~28 textures
   resident ≈ 84MB desktop, ~12MB phone) — scrubbing samples a texture pair
   by INDEX: zero per-frame decode on the scroll path, both directions.

   ⚠️ PURE SCROLL: the frame pair and mix are functions of progress alone.
   Texture AVAILABILITY is the only async part — a missing neighbour shows
   the nearest loaded frame crisp (no mix), and any settled stop has its
   exact pair resident well inside the reverse-rig's 460ms settle. uTime
   feeds only the motes and the spark flicker. */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* fingerprinted frame URLs — the D-030 immutable-cache law: everything
   goes through Vite, never fixed names in public/ */
const globDesktop = import.meta.glob("../assets/meet-frames/d/*.webp", {
  eager: true, query: "?url", import: "default",
});
const globMobile = import.meta.glob("../assets/meet-frames/m/*.webp", {
  eager: true, query: "?url", import: "default",
});
const urlList = (glob) => Object.keys(glob).sort().map((k) => glob[k]);

const FRAME_COUNT = 96;
/* footage beats in unique-frame indices (research frame map, 120→96 space):
   0-6 empty lead, green enters ~7, human ~15, grip closed ~72, pumps 79-94,
   settle 95 */
const FIRST_VISIBLE = 6;
const RING_MAX = 28;          // LRU cap beyond the skeleton set
const SKELETON_STEP = 8;      // always-resident spine so any jump shows NOW

export function createConsultMeet(scene, _opts = {}) {
  const group = new Group();
  group.renderOrder = 6;
  scene.add(group);

  /* the clasp's screen anchor — spark/core/ring live where the grip closes
     (measured on frame 90: centre ≈ (0.512, 0.463) of the footage frame) */
  const CP = new Vector3(0.16, 0.27, 0.25);

  const coarse = typeof matchMedia === "function"
    && matchMedia("(pointer: coarse)").matches;
  const urls = urlList(coarse ? globMobile : globDesktop);

  /* ── loader: blobs up front, textures through skeleton + LRU ring ── */
  const blobs = new Array(FRAME_COUNT).fill(null);
  const textures = new Array(FRAME_COUNT).fill(null);
  const decoding = new Set();
  const ringOrder = [];       // LRU of non-skeleton indices
  const isSkeleton = (i) => i % SKELETON_STEP === 0 || i === FRAME_COUNT - 1;

  const fetchAll = async () => {
    await Promise.all(urls.map(async (u, i) => {
      try {
        const r = await fetch(u);
        blobs[i] = await r.blob();
      } catch (_) { /* a missing frame degrades to nearest-loaded */ }
    }));
    for (let i = 0; i < FRAME_COUNT; i += 1) if (isSkeleton(i)) ensure(i);
  };

  function ensure(i) {
    if (i < 0 || i >= FRAME_COUNT) return null;
    if (textures[i]) {
      if (!isSkeleton(i)) {
        const at = ringOrder.indexOf(i);
        if (at !== -1) ringOrder.splice(at, 1);
        ringOrder.push(i);
      }
      return textures[i];
    }
    if (!blobs[i] || decoding.has(i)) return null;
    decoding.add(i);
    createImageBitmap(blobs[i], { imageOrientation: "flipY" }).then((bmp) => {
      const t = new Texture(bmp);
      t.flipY = false;
      t.colorSpace = SRGBColorSpace;
      t.minFilter = LinearFilter;
      t.magFilter = LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      textures[i] = t;
      decoding.delete(i);
      if (!isSkeleton(i)) {
        ringOrder.push(i);
        while (ringOrder.length > RING_MAX) {
          const evict = ringOrder.shift();
          const old = textures[evict];
          textures[evict] = null;
          old.image?.close?.();
          old.dispose();
        }
      }
    }).catch(() => decoding.delete(i));
    return null;
  }

  const nearestLoaded = (i) => {
    for (let d = 0; d < FRAME_COUNT; d += 1) {
      if (textures[i - d]) return i - d;
      if (textures[i + d]) return i + d;
    }
    return -1;
  };

  fetchAll();

  /* ── the hands plane ── */
  const PLANE_W = 12.9;
  const PLANE_H = PLANE_W * (648 / 1152);
  /* 1×1 transparent placeholder so the M9 precompile pass and the warm
     loop can draw this material before any footage has decoded */
  const dummy = new Texture(
    Object.assign(document.createElement("canvas"), { width: 2, height: 2 }),
  );
  dummy.needsUpdate = true;
  const handsMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTexA: { value: dummy },
      uTexB: { value: dummy },
      uMix: { value: 0 },
      uOpacity: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexA;
      uniform sampler2D uTexB;
      uniform float uMix;
      uniform float uOpacity;
      uniform float uFlash;
      varying vec2 vUv;
      void main() {
        vec4 a = texture2D(uTexA, vUv);
        vec4 b = texture2D(uTexB, vUv);
        vec4 c = mix(a, b, uMix);
        /* the clasp flash lifts the hands, masked by their own alpha */
        c.rgb *= 1.0 + uFlash * 0.35;
        gl_FragColor = vec4(c.rgb, c.a * uOpacity);
      }
    `,
  });
  const hands = new Mesh(new PlaneGeometry(PLANE_W, PLANE_H), handsMaterial);
  hands.position.set(0, 0.15, 0.2);
  hands.renderOrder = 6;
  hands.frustumCulled = false;
  group.add(hands);

  /* ── ambient motes (kept from v2) ── */
  const MN = 240;
  const motePos = new Float32Array(MN * 3);
  const moteSeed = new Float32Array(MN);
  for (let i = 0; i < MN; i += 1) {
    motePos[i * 3] = (hash(i * 13 + 3) - 0.5) * 13.0;
    motePos[i * 3 + 1] = (hash(i * 13 + 4) - 0.5) * 7.5;
    motePos[i * 3 + 2] = -1.5 - hash(i * 13 + 5) * 3.0;
    moteSeed[i] = hash(i * 13 + 6);
  }
  const moteGeometry = new BufferGeometry();
  moteGeometry.setAttribute("position", new Float32BufferAttribute(motePos, 3));
  moteGeometry.setAttribute("aSeed", new Float32BufferAttribute(moteSeed, 1));
  const moteMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPx;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * (0.1 + aSeed * 0.12) + aSeed * 40.0) * 0.5;
        p.y += sin(uTime * (0.07 + aSeed * 0.1) + aSeed * 60.0) * 0.35;
        vA = 0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * 0.5 + aSeed * 80.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 + aSeed * 2.2) * (uPx / 900.0) * (12.5 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float m = smoothstep(0.5, 0.1, length(q));
        gl_FragColor = vec4(vec3(0.35, 0.85, 0.55), m * vA * uOpacity * 0.5);
      }
    `,
  });
  const motes = new Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  group.add(motes);

  /* ── spark burst + white-hot core + ring at the clasp (kept from v2,
     re-anchored to CP) ── */
  const SN = 260;
  const sparkDir = new Float32Array(SN * 3);
  const sparkSeed = new Float32Array(SN);
  for (let i = 0; i < SN; i += 1) {
    const a = hash(i * 17 + 2) * Math.PI * 2;
    const b = (hash(i * 17 + 3) - 0.5) * Math.PI * 0.8;
    sparkDir[i * 3] = Math.cos(a) * Math.cos(b);
    sparkDir[i * 3 + 1] = Math.sin(a) * Math.cos(b) * 0.85;
    sparkDir[i * 3 + 2] = Math.sin(b) * 0.5;
    sparkSeed[i] = hash(i * 17 + 4);
  }
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(SN * 3), 3));
  sparkGeometry.setAttribute("aDir", new Float32BufferAttribute(sparkDir, 3));
  sparkGeometry.setAttribute("aSeed", new Float32BufferAttribute(sparkSeed, 1));
  const sparkMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uSpark: { value: 0 }, uTime: { value: 0 },
      uOpacity: { value: 0 }, uPx: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aDir;
      attribute float aSeed;
      uniform float uSpark;
      uniform float uTime;
      uniform float uPx;
      varying float vLife;
      void main() {
        float t = clamp(uSpark * (0.7 + aSeed * 0.6), 0.0, 1.0);
        float r = t * (1.0 + aSeed * 1.9);
        vec3 p = aDir * r;
        p.y -= t * t * 0.5 * aSeed;
        vLife = (1.0 - t) * step(0.001, uSpark);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.9 + aSeed * 1.7) * (1.0 + vLife) * (uPx / 900.0) * (12.5 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vLife;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float m = smoothstep(0.5, 0.06, length(q));
        vec3 col = mix(vec3(0.25, 0.9, 0.55), vec3(0.95, 1.0, 0.9), vLife);
        gl_FragColor = vec4(col, m * vLife * uOpacity);
      }
    `,
  });
  const spark = new Points(sparkGeometry, sparkMaterial);
  spark.frustumCulled = false;
  spark.position.copy(CP);
  group.add(spark);

  const coreMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float core = pow(max(0.0, 1.0 - d), 2.2);
        vec3 col = mix(vec3(0.5, 1.0, 0.75), vec3(1.0), core);
        gl_FragColor = vec4(col, core * uOpacity);
      }
    `,
  });
  const core = new Mesh(new PlaneGeometry(1.7, 1.7), coreMaterial);
  core.position.copy(CP);
  core.renderOrder = 8;
  core.frustumCulled = false;
  group.add(core);

  const ringMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uSpark: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uSpark;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float radius = uSpark * 0.92;
        float band = 1.0 - smoothstep(0.0, 0.07 + uSpark * 0.09, abs(d - radius));
        float fade = (1.0 - smoothstep(0.55, 1.0, uSpark)) * step(0.001, uSpark);
        vec3 col = mix(vec3(0.95, 1.0, 0.92), vec3(0.2, 0.85, 0.5), uSpark);
        gl_FragColor = vec4(col, band * fade * uOpacity * 0.8);
      }
    `,
  });
  const ring = new Mesh(new PlaneGeometry(3.6, 3.6), ringMaterial);
  ring.position.copy(CP);
  ring.renderOrder = 7;
  ring.frustumCulled = false;
  group.add(ring);

  /* ── THE DRIVE — footage window .10–.825 of consultLocal ──
     The grip closes at unique frame ~72 → consultLocal ≈ .64, which is
     where the spark and the title (intro.js) fire; the two pumps ride
     .66–.81; the settle pins; beatFade hands off to the Franklin. */
  const START = 0.10, END = 0.825;
  function update(progress, time, visibility) {
    const p = clamp01(progress);
    const beatFade = 1 - smooth((p - 0.83) / 0.025);
    const on = visibility * beatFade;
    group.visible = on > 0.002;
    if (!group.visible) return;

    const t = clamp01((p - START) / (END - START));
    const fPos = FIRST_VISIBLE + (FRAME_COUNT - 1 - FIRST_VISIBLE) * t;
    const A = Math.floor(fPos);
    const B = Math.min(A + 1, FRAME_COUNT - 1);
    const frac = fPos - A;
    /* prefetch a window around the scroll position (direction-blind is
       fine: the ring holds both sides of the current pair) */
    for (let d = 1; d <= 5; d += 1) { ensure(A + d); ensure(A - d); }
    let texA = ensure(A);
    let texB = ensure(B);
    let mix = frac;
    if (!texA || !texB) {
      const n = nearestLoaded(Math.round(fPos));
      const fallback = n >= 0 ? textures[n] : dummy;
      texA = texA || fallback;
      texB = texB || texA;
      if (!textures[A] || !textures[B]) mix = texA === texB ? 0 : mix;
    }
    const sparkT = smooth((p - 0.625) / 0.06);
    handsMaterial.uniforms.uTexA.value = texA;
    handsMaterial.uniforms.uTexB.value = texB;
    handsMaterial.uniforms.uMix.value = mix;
    handsMaterial.uniforms.uOpacity.value = on * smooth((p - 0.08) / 0.05);
    handsMaterial.uniforms.uFlash.value = Math.sin(clamp01(sparkT) * Math.PI) * 0.8;

    moteMaterial.uniforms.uTime.value = time;
    moteMaterial.uniforms.uOpacity.value = on * smooth((p - 0.06) / 0.1);

    sparkMaterial.uniforms.uSpark.value = sparkT;
    sparkMaterial.uniforms.uTime.value = time;
    sparkMaterial.uniforms.uOpacity.value = on;
    coreMaterial.uniforms.uOpacity.value = on * Math.sin(clamp01(sparkT) * Math.PI);
    core.scale.setScalar(0.5 + sparkT * 1.15);
    ringMaterial.uniforms.uSpark.value = sparkT;
    ringMaterial.uniforms.uOpacity.value = on;
  }

  function resize(px) {
    moteMaterial.uniforms.uPx.value = px;
    sparkMaterial.uniforms.uPx.value = px;
  }

  function dispose() {
    for (const t of textures) {
      if (t) { t.image?.close?.(); t.dispose(); }
    }
    dummy.dispose();
    handsMaterial.dispose();
    hands.geometry.dispose();
    moteGeometry.dispose();
    moteMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    coreMaterial.dispose();
    core.geometry.dispose();
    ringMaterial.dispose();
    ring.geometry.dispose();
  }

  return { update, resize, dispose };
}
