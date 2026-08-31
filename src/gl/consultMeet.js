/* ── THE MEET v2 — solid hands (WE SCALE beat, D-042) ────────────────────
   v1's particle AI hand was rejected by Yash (31 Aug, "should be a proper
   hand") and by the craft skeptic ("flat dot-stencil"). v2: two REAL meshes
   built in Blender from the same capsule skeletons (skin modifier + subsurf,
   tools: scratchpad/build-hands.py), shaded with a PROCEDURAL spearmint
   matcap — the reference's material technique (matcap IS the lighting; no
   scene lights), zero borrowed assets.

   Beat contract (consultLocal, all pure scroll — reverse replays exactly):
   .10–.24  the flip hand rises in (fist, middle finger up), copy names the
            target (.30–.44, DOM)
   .42–.52  crossfade flip → open reaching hand
   .50–.64  the human photo hand enters low-right (opaque fast — no ghost
            double-exposure over the statue: skeptic minor)
   .52–.80  approach; a faint volumetric beam charges the space between the
            fingertips (the dead-centre fix)
   .775–.85 contact: white-hot core + burst + tight ring AT the fingertips,
            and the act's own neon serif title re-lights (intro.js)
   .83–.855 the beat bows out; Franklin strip (.849+) and burn untouched.

   ⚠️ uTime feeds only idle shimmer/flicker; the reverse rig pins the clock
   via __bbPinTime (see intro.js render call). */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshMatcapMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import REACH_URL from "../assets/meet-hand-reach.glb?url";
import FLIP_URL from "../assets/meet-hand-flip.glb?url";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ── PROCEDURAL SPEARMINT MATCAP ──
   The reference's green hand recipe, rebuilt in the act's own palette:
   pale-mint key upper-left, spearmint body, deep green shadow, cyan
   backlight rim at grazing angles. 256px is plenty — matcaps are looked up
   by normal, not by texel density. */
function makeMatcap() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#04150c";
  g.fillRect(0, 0, 256, 256);
  /* body: key light upper-left */
  const body = g.createRadialGradient(100, 88, 8, 128, 128, 132);
  body.addColorStop(0, "#eafff2");
  body.addColorStop(0.22, "#8df0b4");
  body.addColorStop(0.5, "#2fae6e");
  body.addColorStop(0.8, "#0b5433");
  body.addColorStop(1, "#04371f");
  g.beginPath();
  g.arc(128, 128, 127, 0, Math.PI * 2);
  g.fillStyle = body;
  g.fill();
  /* faint warm-mint bounce lower-right */
  const bounce = g.createRadialGradient(178, 182, 4, 178, 182, 90);
  bounce.addColorStop(0, "rgba(140,255,196,0.30)");
  bounce.addColorStop(1, "rgba(140,255,196,0)");
  g.beginPath();
  g.arc(128, 128, 127, 0, Math.PI * 2);
  g.fillStyle = bounce;
  g.fill();
  /* cyan backlight rim — the grazing-angle ring */
  const rim = g.createRadialGradient(128, 128, 96, 128, 128, 127);
  rim.addColorStop(0, "rgba(64,216,206,0)");
  rim.addColorStop(0.75, "rgba(64,216,206,0.28)");
  rim.addColorStop(1, "rgba(110,240,230,0.62)");
  g.beginPath();
  g.arc(128, 128, 127, 0, Math.PI * 2);
  g.fillStyle = rim;
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createConsultMeet(scene, { handTexture } = {}) {
  const group = new Group();
  group.renderOrder = 6;
  scene.add(group);

  /* contact point — a touch above centre; spark, ring, beam and both
     fingertips all aim at exactly this (skeptic major: v1's FX floated
     ~80–175px off the true meet) */
  const CP = new Vector3(0.1, 0.62, 0.2);

  /* ── THE AI HAND — two solid meshes, crossfaded flip → reach ── */
  const matcapTexture = makeMatcap();
  const flipMaterial = new MeshMatcapMaterial({
    matcap: matcapTexture, transparent: true, opacity: 0,
  });
  const reachMaterial = new MeshMatcapMaterial({
    matcap: matcapTexture, transparent: true, opacity: 0,
  });
  const aiGroup = new Group();
  aiGroup.renderOrder = 6;
  group.add(aiGroup);
  let flipMesh = null, reachMesh = null;
  const loader = new GLTFLoader();
  loader.load(FLIP_URL, (gltf) => {
    flipMesh = gltf.scene;
    flipMesh.traverse((o) => { if (o.isMesh) { o.material = flipMaterial; o.frustumCulled = false; } });
    aiGroup.add(flipMesh);
  });
  loader.load(REACH_URL, (gltf) => {
    reachMesh = gltf.scene;
    reachMesh.traverse((o) => { if (o.isMesh) { o.material = reachMaterial; o.frustumCulled = false; } });
    aiGroup.add(reachMesh);
  });

  /* ── THE HUMAN HAND (photo sprite) ──
     PLACEHOLDER texture (consult-hand-v2.png) until the generated photoreal
     reach lands — docs/meet-hand-prompts.md. The shader GRADES the source's
     lime cast toward the act's spearmint so it stops reading "Hulk glove"
     (craft major): red pulled hard, a touch of desaturation. */
  const humanGroup = new Group();
  const humanPlane = new Mesh(new PlaneGeometry(3.4, 5.1), null);
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
          /* lime -> spearmint: kill the red channel's chartreuse pull,
             lift blue slightly, then ease off saturation */
          vec3 graded = texel.rgb * vec3(0.60, 1.0, 1.04);
          float luma = dot(graded, vec3(0.299, 0.587, 0.114));
          graded = mix(graded, vec3(luma), 0.16);
          /* contact light sweeping down the arm from the fingertip */
          float d = distance(vUv, vec2(0.14, 0.94));
          float ring = 1.0 - smoothstep(0.0, 0.32, abs(d - uSpark * 1.5 + 0.12));
          vec3 lit = graded * (1.0 + ring * uSpark * 0.9);
          lit += vec3(0.55, 1.0, 0.72) * ring * uSpark * 0.35 * texel.a;
          gl_FragColor = vec4(lit, texel.a * uOpacity);
        }
      `,
    });
    humanPlane.material = humanMaterial;
    humanPlane.rotation.z = 0.98;
    humanGroup.add(humanPlane);
  }
  group.add(humanGroup);

  /* ── AMBIENT MOTES ── */
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

  /* ── THE MEET-AXIS BEAM — charges the space between the hands ── */
  const beamMaterial = new ShaderMaterial({
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
        vec2 q = (vUv - 0.5) * vec2(2.0, 2.0);
        float body = 1.0 - smoothstep(0.0, 1.0, length(q * vec2(1.0, 2.6)));
        gl_FragColor = vec4(vec3(0.35, 0.95, 0.62), body * body * uOpacity);
      }
    `,
  });
  const beam = new Mesh(new PlaneGeometry(3.6, 1.1), beamMaterial);
  beam.renderOrder = 5;
  beam.frustumCulled = false;
  group.add(beam);

  /* ── THE SPARK — white-hot core + burst + tight ring, all AT CP ── */
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

  /* white-hot contact core — a soft radial glow exactly at CP */
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

  /* ── THE DRIVE ── */
  function update(progress, time, visibility) {
    const p = clamp01(progress);
    const beatFade = 1 - smooth((p - 0.83) / 0.025);
    const on = visibility * beatFade;
    group.visible = on > 0.002;
    if (!group.visible) return;

    const enter = smooth((p - 0.10) / 0.14);
    const unflip = smooth((p - 0.42) / 0.10);
    const humanIn = smooth((p - 0.50) / 0.14);
    const approach = smooth((p - 0.52) / 0.28);
    const sparkT = smooth((p - 0.775) / 0.075);

    /* solid hand: rises in as the fist, crossfades to the reach */
    const flipLift = 1 - unflip;
    const gapNow = MathUtils.lerp(1.45, 0.30, approach) - sparkT * 0.06;
    aiGroup.position.set(
      CP.x - gapNow + flipLift * 1.15,
      CP.y - MathUtils.lerp(0.95, 0.02, approach) + flipLift * 0.05 - (1 - enter) * 0.5,
      CP.z,
    );
    aiGroup.rotation.z = MathUtils.lerp(-0.18, 0.05, approach) + flipLift * 0.08;
    aiGroup.scale.setScalar(1.28 * (0.94 + enter * 0.06));
    /* idle micro-sway — sub-pixel life at rest, like the reference's
       finger-bone sines */
    aiGroup.rotation.z += Math.sin(time * 0.6) * 0.004;
    const flash = 1 + Math.sin(clamp01(sparkT) * Math.PI) * 0.30;
    flipMaterial.opacity = on * enter * flipLift;
    reachMaterial.opacity = on * enter * unflip;
    flipMaterial.color.setScalar(flash);
    reachMaterial.color.setScalar(flash);
    if (flipMesh) flipMesh.visible = flipMaterial.opacity > 0.005;
    if (reachMesh) reachMesh.visible = reachMaterial.opacity > 0.005;

    if (humanMaterial) {
      humanGroup.scale.setScalar(0.92);
      const hGap = MathUtils.lerp(3.1, 0.30, approach) - sparkT * 0.10;
      humanGroup.position.set(
        CP.x + hGap + 0.15,
        CP.y - MathUtils.lerp(4.4, 1.42, humanIn) + approach * 0.35,
        CP.z - 0.15,
      );
      humanGroup.rotation.z = MathUtils.lerp(-0.35, -0.16, approach);
      humanMaterial.uniforms.uOpacity.value = on * humanIn;
      humanMaterial.uniforms.uSpark.value = sparkT;
      humanMaterial.uniforms.uTime.value = time;
    }

    /* the beam bridges the tips and dies as the spark takes over */
    beam.position.set(CP.x - gapNow * 0.5 - 0.15, CP.y - 0.05, CP.z - 0.05);
    beam.scale.x = (gapNow + 1.6) / 3.6;
    beamMaterial.uniforms.uOpacity.value =
      on * approach * approach * 0.20 * (1 - sparkT * 0.4);
    beam.visible = approach > 0.03;

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
    [flipMesh, reachMesh].forEach((m) => m?.traverse((o) => o.geometry?.dispose?.()));
    flipMaterial.dispose();
    reachMaterial.dispose();
    matcapTexture.dispose();
    moteGeometry.dispose();
    moteMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    coreMaterial.dispose();
    core.geometry.dispose();
    ringMaterial.dispose();
    ring.geometry.dispose();
    beamMaterial.dispose();
    beam.geometry.dispose();
    humanPlane.geometry.dispose();
    humanMaterial?.dispose();
  }

  return { update, resize, dispose };
}
