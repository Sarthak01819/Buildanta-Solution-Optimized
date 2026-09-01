/* ── THE MEET v4 — real 3D hands, scroll-scrubbed handshake (D-044) ──────
   Yash, 31 Aug: "make it a real 3D model, idle like the reference when the
   cursor rests, end with the handshake." Built end-to-end tonight:

   MODEL  meet-handshake.glb — two MakeHuman(MPFB)-generated arms (CC0
          output), rigify rigs collapsed to DEF bones, choreography traced
          from Yash's Veo clip (approach → clasp f112 → two pumps → settle,
          150f @24fps; authored in scratchpad/choreo-build.py, iterated
          v1–v6 against renders), human skin Cycles-baked into the GLB.
   LOOK   green hand: MeshMatcapMaterial + our fitted spearmint matcap
          (h3d-gen-matcap.py, ~5/255 from the reference's own render — the
          reference technique, our texture). Human hand: unlit baked skin.
          The consult renderer is unlit/no-tonemap, so both land as authored.
   SCRUB  the reference's exact pattern: paused clipAction per animation,
          action.time = duration * f(progress), mixer.update(dt) EVERY frame
          (a paused mixer still re-stamps bones each update — which is what
          makes the post-mixer idle sway safe to layer on top).
   IDLE   the reference's decompiled finger micro-sway, 1:1: amp 7e-4 rad ×
          {1, .6, .35} per segment, freq 0.5Hz × (1 + finger×.05), phase
          finger×1.3 + segment×0.4, local X, weight eased in/out at 3 s⁻¹
          gated on |Δprogress| > 1e-5 — alive at rest, gone while scrubbing.
   DRIFT  group drift is a pure function of scroll + pointer parallax
          (their camera trick, applied to the subject so the act's shared
          camera never moves).

   ⚠️ Frame pose = f(progress); sway/motes = f(time) only, and the reverse
   rig pins time via __bbPinTime, so suites stay deterministic. */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  AnimationMixer,
  LoopOnce,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import HANDSHAKE_URL from "../assets/meet-handshake.glb?url";
import MATCAP_URL from "../assets/meet-matcap-lacquer.png?url";
import SKIN_MATCAP_URL from "../assets/meet-skin-matcap.png?url";
import NEUTRAL_MATCAP_URL from "../assets/meet-neutral-matcap.png?url";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* Blender-world → act-world: the shot was authored 1.35m wide; the act's
   camera (fov 32, z 12.5) sees ~12.75 units — scale ≈ 9, recentred so the
   grip lands just above screen centre. */
/* CLOSEUP (Yash's 5 reference frames, 1 Sep): the hands must FILL the frame —
   at the old scale the grip was a thumbnail and no finger detail could read.
   Hand length 0.185m authored; at 24x that is ~40% of the visible width, which
   is what his frames show. CENTER_LIFT re-solved so the grip stays centred:
   act_y = 24 * 1.05 + CL.y = 0.4. */
const SCALE = 24.0;
const CENTER_LIFT = new Vector3(0, -24.8, 0.2);
/* the clasp point (grip world in the authored shot, mapped through the
   transform above) — spark, core and ring all live here */
const CP = new Vector3(0.0, 0.40, 0.2);

/* the reference's idle-sway constants, decompiled 1:1 */
const SWAY_FINGERS = ["f_index", "f_middle", "f_ring", "f_pinky", "thumb"];
const SWAY_AMP = 7e-4;
const SWAY_SEG = [1.0, 0.6, 0.35];

export function createConsultMeet(scene, _opts = {}) {
  const group = new Group();
  group.renderOrder = 6;
  scene.add(group);

  const matcapTexture = new TextureLoader().load(MATCAP_URL);
  matcapTexture.colorSpace = SRGBColorSpace;
  matcapTexture.generateMipmaps = false;
  matcapTexture.minFilter = LinearFilter;
  const skinMatcapTexture = new TextureLoader().load(SKIN_MATCAP_URL);
  skinMatcapTexture.colorSpace = SRGBColorSpace;
  skinMatcapTexture.generateMipmaps = false;
  skinMatcapTexture.minFilter = LinearFilter;
  /* neutral bright form-shading matcap — multiplies the baked skin texture
     so the human arm keeps 3D form while staying unlit (model-matcap.py) */
  const neutralMatcapTexture = new TextureLoader().load(NEUTRAL_MATCAP_URL);
  neutralMatcapTexture.colorSpace = SRGBColorSpace;
  neutralMatcapTexture.generateMipmaps = false;
  neutralMatcapTexture.minFilter = LinearFilter;

  const rigGroup = new Group();
  rigGroup.scale.setScalar(SCALE);
  rigGroup.position.copy(CENTER_LIFT);
  group.add(rigGroup);

  let mixer = null;
  let actions = [];
  let clipDuration = 1;
  const swayBones = [];   // { bone, finger, seg, baseQuat-free (post-mixer) }
  const tmpQ = new Quaternion();
  const AXIS_X = new Vector3(1, 0, 0);

  /* ── THE SEVERED-END FADE ──
     The arms are cut at the upper arm, and on the act's black ground that cut
     reads as a cut. Blender's exporter kept a stale second colour layer, so
     the fade is authored HERE instead: distance of each bind-space vertex from
     its own hand bone, smoothstepped to black over the last third of the arm.
     Bind space is pose-independent, so one pass at load covers every frame. */
  function fadeStub(mesh) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = new Vector3().subVectors(bb.max, bb.min);
    /* the arm's long axis; project every vertex onto it */
    const ax = size.x >= size.y && size.x >= size.z ? 0
      : (size.y >= size.z ? 1 : 2);
    const comp = ["x", "y", "z"][ax];
    const lo = bb.min[comp], hi = bb.max[comp], span = hi - lo || 1;
    const t = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      t[i] = (pos.getComponent(i, ax) - lo) / span;
    }
    /* WHICH end is the cut? The severed end is a flat disc — its vertices
       bunch into a razor-thin slab. The hand end spreads along the axis
       (fingers). Measure each end's axial thickness and pick the flatter. */
    const band = (near1) => {
      let n = 0, mn = 1, mx = 0;
      for (let i = 0; i < pos.count; i += 1) {
        const d = near1 ? 1 - t[i] : t[i];
        if (d < 0.06) { n += 1; mn = Math.min(mn, t[i]); mx = Math.max(mx, t[i]); }
      }
      return n > 8 ? mx - mn : 1;
    };
    const cutAtHigh = band(true) < band(false);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const d = cutAtHigh ? t[i] : 1 - t[i];        // 1 at the cut
      const k = 1 - smooth((d - 0.50) / 0.34);      // fade to black well before the cut
      col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
    }
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  }

  /* The detailed arms are 70k verts each with baked 2K maps — Draco takes the
     geometry from 34MB to 2.8MB. The decoder is a fixed vendor file, so
     public/draco/ is correct here (nothing to cache-bust: D-030 applies to
     assets that CHANGE). */
  const gltfLoader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  gltfLoader.setDRACOLoader(draco);
  gltfLoader.load(HANDSHAKE_URL, (gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        fadeStub(o);
        if (o.name.includes("Green")) {
          o.material = new MeshMatcapMaterial({
            matcap: matcapTexture,
            toneMapped: false,
            /* COLOR_0 "Shade" fades the severed forearm end into the act's
               black so the cut never reads as a cut (stub-fade.py) */
            vertexColors: !!o.geometry.getAttribute("color"),
          });
        } else {
          /* photoreal path: the GLB carries a baked skin texture now
             (albedo x warm AO, model-build/model-fix.py) — show it unlit,
             same contract as the matcaps. Falls back to the skin matcap
             if a build ever ships without the bake. */
          const bakedMap = o.material && o.material.map ? o.material.map : null;
          if (bakedMap) {
            bakedMap.colorSpace = SRGBColorSpace;
            o.material = new MeshMatcapMaterial({
              matcap: neutralMatcapTexture,
              map: bakedMap,
              toneMapped: false,
              /* COLOR_0 "Shade": fades the severed-arm stub into shadow so
                 the cut never reads as a cut (model-fix3.py) */
              vertexColors: !!o.geometry.getAttribute("color"),
            });
          } else {
            o.material = new MeshMatcapMaterial({
              matcap: skinMatcapTexture,
              toneMapped: false,
            });
          }
        }
      }
      if (o.isBone) {
        const m = o.name.match(/DEF-(f_index|f_middle|f_ring|f_pinky|thumb)\.(\d\d)\./);
        if (m) {
          swayBones.push({
            bone: o,
            finger: SWAY_FINGERS.indexOf(m[1]),
            seg: parseInt(m[2], 10) - 1,
          });
        }
      }
    });
    rigGroup.add(root);
    mixer = new AnimationMixer(root);
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      a.setLoop(LoopOnce);
      a.clampWhenFinished = true;
      a.play();
      a.paused = true;
      actions.push(a);
      clipDuration = Math.max(clipDuration, clip.duration);
    }
  });

  /* ── ambient motes (unchanged act atmosphere) ── */
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

  /* ── spark + white-hot core + ring at the clasp ── */
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

  /* ── THE DRIVE ──
     beat window .10–.825 of consultLocal; the shot's frames 6→150 map
     linearly across it, so the grip (f112) lands at cl ≈ .634 — where the
     spark and the title (intro.js) fire. */
  const START = 0.10, END = 0.825;
  let lastProgress = -1;
  let lastTime = 0;
  let swayWeight = 1;
  let px = 0, py = 0;

  function update(progress, time, visibility, pointerX = 0, pointerY = 0) {
    const p = clamp01(progress);
    const beatFade = 1 - smooth((p - 0.83) / 0.025);
    const on = visibility * beatFade;
    group.visible = on > 0.002;
    if (!group.visible) { lastProgress = p; lastTime = time; return; }

    const dt = Math.max(0, Math.min(0.05, time - lastTime));
    const t = clamp01((p - START) / (END - START));

    if (mixer) {
      const at = clipDuration * (0.04 + 0.96 * t);
      for (const a of actions) a.time = Math.min(at, a.getClip().duration - 1e-4);
      mixer.update(0);   // paused mixer still re-stamps every bone
      /* the reference's idle sway, layered post-mixer: alive at rest,
         eased out while the scrub is actually moving */
      const moving = Math.abs(p - lastProgress) > 1e-5;
      swayWeight = MathUtils.clamp(swayWeight + (moving ? -1 : 1) * dt * 3, 0, 1);
      if (swayWeight > 0.001) {
        for (const s of swayBones) {
          const amp = SWAY_AMP * SWAY_SEG[Math.min(s.seg, 2)] * swayWeight;
          const freq = 0.5 * (1 + s.finger * 0.05);
          const ang = amp * Math.sin(Math.PI * 2 * freq * time + s.finger * 1.3 + s.seg * 0.4);
          tmpQ.setFromAxisAngle(AXIS_X, ang);
          s.bone.quaternion.multiply(tmpQ);
        }
      }
    }

    /* drift (pure scroll) + pointer parallax — the subject leans, the
       act's shared camera never moves */
    px += (pointerX - px) * 0.05;
    py += (pointerY - py) * 0.05;
    rigGroup.rotation.y = Math.sin(t * Math.PI) * 0.02 + px * 0.020;
    rigGroup.rotation.x = -py * 0.014;
    rigGroup.position.x = CENTER_LIFT.x + Math.sin(t * Math.PI * 0.8) * 0.30;
    group.traverse((o) => { if (o.isMesh || o.isPoints) o.visible = true; });

    const handsIn = smooth((p - 0.08) / 0.05);
    rigGroup.visible = handsIn > 0.01;

    const sparkT = smooth((p - 0.625) / 0.06);
    moteMaterial.uniforms.uTime.value = time;
    moteMaterial.uniforms.uOpacity.value = on * smooth((p - 0.06) / 0.1);
    sparkMaterial.uniforms.uSpark.value = sparkT;
    sparkMaterial.uniforms.uTime.value = time;
    sparkMaterial.uniforms.uOpacity.value = on;
    coreMaterial.uniforms.uOpacity.value = on * Math.sin(clamp01(sparkT) * Math.PI) * 0.9;
    core.scale.setScalar(1.1 + sparkT * 2.4);
    ringMaterial.uniforms.uSpark.value = sparkT;
    ringMaterial.uniforms.uOpacity.value = on;

    lastProgress = p;
    lastTime = time;
  }

  function resize(pxh) {
    moteMaterial.uniforms.uPx.value = pxh;
    sparkMaterial.uniforms.uPx.value = pxh;
  }

  function dispose() {
    matcapTexture.dispose();
    moteGeometry.dispose();
    moteMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    coreMaterial.dispose();
    core.geometry.dispose();
    ringMaterial.dispose();
    ring.geometry.dispose();
    rigGroup.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material?.map) o.material.map.dispose();
      o.material?.dispose?.();
    });
  }

  return { update, resize, dispose };
}
