/* ── THE MEET — AI and human hands come together (WE SCALE beat) ─────────
   Replaces the funded-world story (globe + palm + plant) per Yash's 6 MCQs,
   31 Aug 2026 (D-042): our own assets, particle AI hand, pure scroll, spark
   reveals WE SCALE, quick named-target finger beat. The Franklin burn that
   follows is untouched.

   Mechanics studied from the zero.university reference (local mirror), all
   REBUILT: their green hand is a matcap mesh scrubbed through a baked clip —
   ours is a particle field whose targets are sampled from an analytic
   capsule skeleton, so the flip→reach morph needs no rig and stays a pure
   function of scroll. Their contact ripple/screen ring mechanic inspired the
   spark; their petal quads inspired the motes.

   ⚠️ EVERYTHING VISUAL IS A PURE FUNCTION OF `progress` — uTime feeds only
   sub-pixel idle shimmer and the spark's flicker, per the reverse-scroll law
   (verify-reverse). No state latches: scrolling back replays in reverse.

   PARTICLE↔POSE CORRESPONDENCE: each particle is (limb, u, v, w) — a spot on
   the skeleton, not a point in space. Both poses evaluate the SAME spot, so
   the morph moves every particle along its own limb coherently instead of a
   soup of crossfading dots. */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/* deterministic per-index hash — Math.random would break rebuild-identical
   sampling between sessions (and any golden frames taken of this beat) */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ── THE SKELETONS ──
   A pose is 16 capsules in the hand's LOCAL frame: +x is the reach
   direction, the INDEX FINGERTIP is at the origin (so placing the group
   places the tip — the thing the whole beat aims). Units are world units of
   the consult scene (camera z 12.5, fov 32 → ~7.2 units of visible height).

   Limb list is IDENTICAL in both poses — only endpoints/radii differ:
   0 forearm  1 palm  2-3 thumb  4-6 index  7-9 middle  10-12 ring
   13-15 pinky. */
const POSE_REACH = [
  { a: [-3.8, -0.75], b: [-2.45, -0.42], r0: 0.30, r1: 0.26 }, // forearm
  { a: [-2.10, -0.32], b: [-1.42, -0.10], r0: 0.31, r1: 0.26 }, // palm
  { a: [-1.85, -0.45], b: [-1.50, -0.72], r0: 0.11, r1: 0.095 }, // thumb 1
  { a: [-1.50, -0.72], b: [-1.15, -0.88], r0: 0.09, r1: 0.07 },  // thumb 2
  { a: [-1.30, -0.02], b: [-0.85, 0.06], r0: 0.10, r1: 0.09 },   // index 1 (rises)
  { a: [-0.85, 0.06], b: [-0.42, 0.06], r0: 0.085, r1: 0.075 },  // index 2
  { a: [-0.42, 0.06], b: [0.0, 0.0], r0: 0.072, r1: 0.05 },      // index 3 → tip at origin
  { a: [-1.36, -0.18], b: [-0.90, -0.20], r0: 0.10, r1: 0.088 }, // middle 1
  { a: [-0.90, -0.20], b: [-0.52, -0.30], r0: 0.084, r1: 0.074 }, // middle 2
  { a: [-0.52, -0.30], b: [-0.30, -0.44], r0: 0.07, r1: 0.055 },  // middle 3
  { a: [-1.42, -0.34], b: [-1.02, -0.44], r0: 0.095, r1: 0.082 }, // ring 1
  { a: [-1.02, -0.44], b: [-0.74, -0.58], r0: 0.078, r1: 0.068 }, // ring 2
  { a: [-0.74, -0.58], b: [-0.60, -0.72], r0: 0.064, r1: 0.05 },  // ring 3
  { a: [-1.48, -0.50], b: [-1.18, -0.62], r0: 0.08, r1: 0.068 },  // pinky 1
  { a: [-1.18, -0.62], b: [-1.00, -0.74], r0: 0.064, r1: 0.055 }, // pinky 2
  { a: [-1.00, -0.74], b: [-0.90, -0.85], r0: 0.052, r1: 0.042 }, // pinky 3
];
/* The flip: a compact fist with ONLY the middle finger straight up — the
   silhouette must read at a glance: one block, one spike. Fingers curl back
   INTO the fist (tips tucked against the palm block), the forearm goes
   near-vertical. Same 16 limbs as the reach so every particle has a home. */
const POSE_FLIP = [
  { a: [-1.50, -2.30], b: [-1.32, -1.15], r0: 0.32, r1: 0.29 }, // forearm (raised)
  { a: [-1.42, -0.95], b: [-1.10, -0.35], r0: 0.42, r1: 0.38 }, // palm — the fist block
  { a: [-1.00, -0.72], b: [-1.15, -0.55], r0: 0.12, r1: 0.10 }, // thumb hugs the fist
  { a: [-1.15, -0.55], b: [-1.28, -0.48], r0: 0.095, r1: 0.075 },
  { a: [-0.95, -0.42], b: [-0.85, -0.60], r0: 0.10, r1: 0.09 }, // index curled
  { a: [-0.85, -0.60], b: [-0.95, -0.78], r0: 0.085, r1: 0.075 },
  { a: [-0.95, -0.78], b: [-1.10, -0.82], r0: 0.07, r1: 0.055 },
  { a: [-1.18, -0.30], b: [-1.16, 0.15], r0: 0.105, r1: 0.092 }, // MIDDLE — straight up
  { a: [-1.16, 0.15], b: [-1.14, 0.60], r0: 0.088, r1: 0.078 },
  { a: [-1.14, 0.60], b: [-1.13, 0.95], r0: 0.085, r1: 0.06 },
  { a: [-1.40, -0.38], b: [-1.50, -0.58], r0: 0.09, r1: 0.08 },  // ring curled
  { a: [-1.50, -0.58], b: [-1.44, -0.76], r0: 0.078, r1: 0.068 },
  { a: [-1.44, -0.76], b: [-1.30, -0.80], r0: 0.062, r1: 0.05 },
  { a: [-1.60, -0.45], b: [-1.68, -0.62], r0: 0.075, r1: 0.065 }, // pinky curled
  { a: [-1.68, -0.62], b: [-1.62, -0.76], r0: 0.06, r1: 0.052 },
  { a: [-1.62, -0.76], b: [-1.52, -0.80], r0: 0.05, r1: 0.04 },
];

/* evaluate one skeleton spot: limb l, axial u (0..1), radial angle v,
   radial depth w (0..1, biased to the shell so the hand reads as a SURFACE
   of light, not a solid blob) */
function spot(pose, l, u, v, w) {
  const c = pose[l];
  const x = MathUtils.lerp(c.a[0], c.b[0], u);
  const y = MathUtils.lerp(c.a[1], c.b[1], u);
  const r = MathUtils.lerp(c.r0, c.r1, u) * w;
  return [x + Math.cos(v) * r * 0.35, y + Math.sin(v) * r, Math.cos(v) * r * 0.9];
}

export function createConsultMeet(scene, { handTexture } = {}) {
  const group = new Group();
  group.renderOrder = 6;
  scene.add(group);

  /* contact point in scene space — a touch above centre so the spark and
     the revealed title (DOM, lower third) never fight for the same pixels */
  const CP = new Vector3(0.1, 0.62, 0.2);

  /* ── THE AI HAND (particles) ── */
  const N = 9200;
  const home0 = new Float32Array(N * 3); // reach pose
  const home1 = new Float32Array(N * 3); // flip pose
  const cloud = new Float32Array(N * 3); // pre-assembly scatter
  const seed = new Float32Array(N);
  const edge = new Float32Array(N);
  /* limb pick is area-weighted so the forearm/palm don't starve the fingers */
  const weights = POSE_REACH.map((c) => {
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) + 0.05;
    return len * (c.r0 + c.r1);
  });
  const totalW = weights.reduce((s, x) => s + x, 0);
  for (let i = 0; i < N; i += 1) {
    let pick = hash(i * 3 + 1) * totalW;
    let l = 0;
    while (pick > weights[l] && l < weights.length - 1) { pick -= weights[l]; l += 1; }
    const u = hash(i * 3 + 2);
    const v = hash(i * 3 + 3) * Math.PI * 2;
    /* bias to the shell: sqrt puts most mass near w=1 */
    const w = 0.35 + 0.65 * Math.sqrt(hash(i * 7 + 5));
    const p0 = spot(POSE_REACH, l, u, v, w);
    const p1 = spot(POSE_FLIP, l, u, v, w);
    home0.set(p0, i * 3);
    home1.set(p1, i * 3);
    /* scatter: a loose drifting nebula left of frame, roughly hand-sized x3 */
    cloud[i * 3] = -2.0 + (hash(i * 5 + 11) - 0.5) * 7.5;
    cloud[i * 3 + 1] = (hash(i * 5 + 12) - 0.5) * 6.5;
    cloud[i * 3 + 2] = (hash(i * 5 + 13) - 0.5) * 3.0;
    seed[i] = hash(i * 11 + 7);
    edge[i] = w > 0.86 ? 1 : 0; // shell particles glow brighter — the rim
  }
  const aiGeometry = new BufferGeometry();
  aiGeometry.setAttribute("position", new Float32BufferAttribute(home0.slice(), 3));
  aiGeometry.setAttribute("aHome0", new Float32BufferAttribute(home0, 3));
  aiGeometry.setAttribute("aHome1", new Float32BufferAttribute(home1, 3));
  aiGeometry.setAttribute("aCloud", new Float32BufferAttribute(cloud, 3));
  aiGeometry.setAttribute("aSeed", new Float32BufferAttribute(seed, 1));
  aiGeometry.setAttribute("aEdge", new Float32BufferAttribute(edge, 1));
  const aiMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uAssemble: { value: 0 },  // cloud → hand
      uPose: { value: 1 },      // 1 = flip, 0 = reach (assembles INTO the flip)
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSpark: { value: 0 },     // contact ripple through the hand
      uPx: { value: 1 },        // renderer height in px, for size attenuation
    },
    vertexShader: `
      attribute vec3 aHome0;
      attribute vec3 aHome1;
      attribute vec3 aCloud;
      attribute float aSeed;
      attribute float aEdge;
      uniform float uAssemble;
      uniform float uPose;
      uniform float uTime;
      uniform float uSpark;
      uniform float uPx;
      varying float vGlow;
      varying float vSeed;
      void main() {
        vec3 home = mix(aHome0, aHome1, uPose);
        /* each particle finishes assembling at its own moment — the hand
           condenses leading-edge-first instead of popping */
        float k = smoothstep(aSeed * 0.55, aSeed * 0.55 + 0.45, uAssemble);
        vec3 p = mix(aCloud, home, k);
        /* idle shimmer: sub-pixel, so rest frames stay comparable */
        p += vec3(
          sin(uTime * 0.8 + aSeed * 39.0),
          cos(uTime * 0.66 + aSeed * 51.0),
          sin(uTime * 0.74 + aSeed * 27.0)
        ) * 0.008 * k;
        /* unassembled particles drift on the wind instead of freezing */
        p += vec3(sin(uTime * 0.22 + aSeed * 17.0), cos(uTime * 0.18 + aSeed * 23.0), 0.0)
          * 0.18 * (1.0 - k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        /* the contact ripple sweeps brightness through the hand from the
           fingertip (local origin) backward — the zero mirror runs its ring
           in screen space; ours rides the hand itself */
        float d = length(home);
        float ring = 1.0 - smoothstep(0.0, 0.55, abs(d - uSpark * 4.2 + 0.4));
        vGlow = (aEdge * 0.85 + 0.35) * (1.0 + ring * uSpark * 2.4);
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
        float size = (1.6 + aSeed * 2.6) * (1.0 + aEdge * 0.5);
        gl_PointSize = size * (uPx / 900.0) * (12.5 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vGlow;
      varying float vSeed;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float m = smoothstep(0.5, 0.08, length(q));
        /* mint core → deep green halo, the act's own palette */
        vec3 core = vec3(0.62, 1.0, 0.78);
        vec3 halo = vec3(0.05, 0.55, 0.34);
        vec3 col = mix(halo, core, m * (0.55 + vSeed * 0.45));
        gl_FragColor = vec4(col * vGlow, m * uOpacity * (0.5 + vSeed * 0.5));
      }
    `,
  });
  const aiHand = new Points(aiGeometry, aiMaterial);
  aiHand.frustumCulled = false;
  group.add(aiHand);

  /* ── THE HUMAN HAND (photo sprite) ──
     PLACEHOLDER TEXTURE: the site's own consult-hand-v2.png rotated into a
     reach — swap the texture for the generated photoreal reach (see
     docs/meet-hand-prompts.md) the moment the asset lands. Geometry and
     choreography are final; only the image changes. */
  const humanGroup = new Group();
  const humanPlane = new Mesh(
    new PlaneGeometry(3.4, 5.1),
    null /* material set below if texture provided */,
  );
  let humanMaterial = null;
  if (handTexture) {
    humanMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: handTexture },
        uOpacity: { value: 0 },
        uSpark: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        uniform float uSpark;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D(uMap, vUv);
          /* contact light: a warm-mint wash sweeping DOWN the arm from the
             fingertip (top-left of the rotated sprite) as the spark fires */
          float d = distance(vUv, vec2(0.14, 0.94));
          float ring = 1.0 - smoothstep(0.0, 0.32, abs(d - uSpark * 1.5 + 0.12));
          vec3 lit = texel.rgb * (1.0 + ring * uSpark * 0.9);
          lit += vec3(0.55, 1.0, 0.72) * ring * uSpark * 0.35 * texel.a;
          gl_FragColor = vec4(lit, texel.a * uOpacity);
        }
      `,
    });
    humanPlane.material = humanMaterial;
    /* the source photo is a palm-up hand pointing +y; rotate so the fingers
       reach up-left toward the contact point */
    humanPlane.rotation.z = 0.98;
    humanGroup.add(humanPlane);
  }
  group.add(humanGroup);

  /* ── AMBIENT MOTES — quiet green drift so the void has air in it ── */
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

  /* ── THE SPARK — burst + expanding ring at the contact point ── */
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
      uSpark: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPx: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aDir;
      attribute float aSeed;
      uniform float uSpark;
      uniform float uTime;
      uniform float uPx;
      varying float vLife;
      void main() {
        /* radial flight, per-particle stagger, slight gravity droop late */
        float t = clamp(uSpark * (0.7 + aSeed * 0.6), 0.0, 1.0);
        float r = t * (1.1 + aSeed * 2.1);
        vec3 p = aDir * r;
        p.y -= t * t * 0.5 * aSeed;
        vLife = (1.0 - t) * step(0.001, uSpark);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.4 + aSeed * 2.6) * (1.0 + vLife) * (uPx / 900.0) * (12.5 / -mv.z);
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

  /* expanding contact ring — a single quad, annulus in the fragment */
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
        float radius = uSpark * 0.95;
        float band = 1.0 - smoothstep(0.0, 0.10 + uSpark * 0.12, abs(d - radius));
        float fade = (1.0 - smoothstep(0.55, 1.0, uSpark)) * step(0.001, uSpark);
        vec3 col = mix(vec3(0.95, 1.0, 0.92), vec3(0.2, 0.85, 0.5), uSpark);
        gl_FragColor = vec4(col, band * fade * uOpacity * 0.85);
      }
    `,
  });
  const ring = new Mesh(new PlaneGeometry(5.2, 5.2), ringMaterial);
  ring.position.copy(CP);
  ring.renderOrder = 7;
  ring.frustumCulled = false;
  group.add(ring);

  /* ── THE DRIVE — every window below is consultLocal, pure scroll ── */
  function update(progress, time, visibility) {
    const p = clamp01(progress);
    /* the beat owns the funded-world window and bows out BEFORE the hero
       note's strip arrival (.849) can be smeared by our glow */
    const beatFade = 1 - smooth((p - 0.83) / 0.025);
    const on = visibility * beatFade;
    group.visible = on > 0.002;
    if (!group.visible) return;

    /* windows (tuned against the act's DOM copy: system diagram exits ~.48)
       .08–.30  particles assemble INTO the flip (copy names the target)
       .30–.42  flip holds — the beat
       .42–.52  morph flip → open reach
       .34–.56  human hand slides in from lower right
       .52–.80  both approach the contact point
       .80–.90  contact: spark + ring + ripple, title lands (DOM)          */
    const assemble = smooth((p - 0.08) / 0.22);
    const unflip = smooth((p - 0.42) / 0.10);
    const humanIn = smooth((p - 0.46) / 0.18);
    const approach = smooth((p - 0.52) / 0.28);
    const sparkT = smooth((p - 0.775) / 0.075);

    aiMaterial.uniforms.uAssemble.value = assemble;
    aiMaterial.uniforms.uPose.value = 1 - unflip;
    aiMaterial.uniforms.uTime.value = time;
    aiMaterial.uniforms.uSpark.value = sparkT;
    aiMaterial.uniforms.uOpacity.value = on * smooth((p - 0.05) / 0.08);

    /* AI hand travel: assembles hanging left of centre, approach carries the
       fingertip (local origin) to just-left of CP; the last few px of gap
       close exactly as the spark fires — contact COMPLETES here, unlike the
       reference (their touch never happens; ours is the whole point) */
    /* pre-approach the hand sits CENTRE-LEFT so the flip plays big in the
       frame (the fist block lives ~1.25 units left of the local tip origin);
       the approach then carries the fingertip to the contact point, the last
       few px closing exactly as the spark fires — contact COMPLETES here,
       unlike the reference (their touch never happens; ours is the point) */
    const flipLift = 1 - unflip;
    aiHand.position.set(
      CP.x - MathUtils.lerp(1.45, 0.16, approach) + flipLift * 1.15 - sparkT * 0.14,
      CP.y - MathUtils.lerp(0.95, 0.02, approach) - flipLift * 0.28,
      CP.z,
    );
    aiHand.rotation.z = MathUtils.lerp(-0.18, 0.05, approach) + flipLift * 0.08;
    aiHand.scale.setScalar(1.28);
    group.updateMatrixWorld();

    /* human hand mirrors from the lower right */
    if (humanMaterial) {
      humanGroup.scale.setScalar(0.84); // meet as equals — the sprite is big
      const hGap = MathUtils.lerp(3.1, 0.30, approach) - sparkT * 0.10;
      humanGroup.position.set(
        CP.x + hGap,
        CP.y - MathUtils.lerp(3.4, 1.9, humanIn) + approach * 0.35,
        CP.z - 0.15,
      );
      humanGroup.rotation.z = MathUtils.lerp(-0.35, -0.12, approach);
      humanMaterial.uniforms.uOpacity.value = on * humanIn;
      humanMaterial.uniforms.uSpark.value = sparkT;
      humanMaterial.uniforms.uTime.value = time;
    }

    moteMaterial.uniforms.uTime.value = time;
    moteMaterial.uniforms.uOpacity.value = on * smooth((p - 0.06) / 0.1);

    sparkMaterial.uniforms.uSpark.value = sparkT;
    sparkMaterial.uniforms.uTime.value = time;
    sparkMaterial.uniforms.uOpacity.value = on;
    ringMaterial.uniforms.uSpark.value = sparkT;
    ringMaterial.uniforms.uOpacity.value = on;
  }

  function resize(px) {
    aiMaterial.uniforms.uPx.value = px;
    moteMaterial.uniforms.uPx.value = px;
    sparkMaterial.uniforms.uPx.value = px;
  }

  function dispose() {
    aiGeometry.dispose();
    aiMaterial.dispose();
    moteGeometry.dispose();
    moteMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    ringMaterial.dispose();
    ring.geometry.dispose();
    humanPlane.geometry.dispose();
    humanMaterial?.dispose();
  }

  return { update, resize, dispose };
}
