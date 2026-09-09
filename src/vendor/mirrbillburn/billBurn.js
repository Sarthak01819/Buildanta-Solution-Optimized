/* ══ BILL BURN — extracted from zeromirror/mirror ══════════════════════════
   The $100-note burn from the mirror's stage3, lifted out on its own.

   The mirror ships only a minified bundle (assets/main-B9-HtP-f.js, no
   sourcemap), so this is a RECONSTRUCTION, not a copied file. What is exact
   and what was rebuilt is listed in README.md — read it before trusting a
   number here. Every constant below was read out of the bundle; the control
   flow around them was rewritten by hand.

   Recovered verbatim: both shaders, every uniform default, the 10 bill specs,
   the atlas tile rect, the plane geometry, and the burn/drift drive.        */

import {
  Mesh, PlaneGeometry, ShaderMaterial, Color, Vector2, Vector3, DoubleSide,
  Points, BufferGeometry, Float32BufferAttribute, PointsMaterial,
  AdditiveBlending, Group,
} from "three";

import burnVert from "./shaders/burn.vert.glsl?raw";
import burnFrag from "./shaders/burn.frag.glsl?raw";

/* The atlas is 2048 square, and the note occupies a 574x1284 portrait cell.
   The mirror samples it with uTexRotate=1, which swaps the axes in the
   shader — that is why a portrait cell dresses a landscape plane. */
const ATLAS = 2048;
const BILL_TILE = {
  offset: [1474 / ATLAS, 1 - 1284 / ATLAS],
  scale: [574 / ATLAS, 1284 / ATLAS],
};

/* Ten notes. Index 0 is the hero — the one held in frame; the other nine are
   the drift behind it. burnStart/burnEnd are in units of the burn phase, and
   several run past 1.0 on purpose so those notes never finish burning before
   the beat ends. */
export const BILL_SPECS = [
  { position: [0.022, 0, 0], rotation: [0, 0, 0], scale: 1, burnStart: 0.30, burnEnd: 1.50 },
  { position: [0.2, 0.05, -0.3], rotation: [15, -25, 35], scale: 0.8, burnStart: 0.15, burnEnd: 0.90 },
  { position: [-0.2, -0.15, -0.15], rotation: [-20, 45, -60], scale: 0.9, burnStart: 0.25, burnEnd: 1.25 },
  { position: [0.1, 0.1, 0.15], rotation: [25, -45, -40], scale: 1, burnStart: 0.10, burnEnd: 1.30 },
  { position: [0.05, -0.07, 0.6], rotation: [-15, 20, 30], scale: 0.85, burnStart: 0.20, burnEnd: 1.50 },
  { position: [-0.05, 0.3, -0.3], rotation: [-15, 20, 30], scale: 0.85, burnStart: 0.20, burnEnd: 1.50 },
  { position: [0.4, -0.2, -0.1], rotation: [30, -40, 20], scale: 0.75, burnStart: 0.35, burnEnd: 1.20 },
  { position: [-0.35, 0.25, -0.15], rotation: [-25, 35, -45], scale: 0.7, burnStart: 0.40, burnEnd: 1.30 },
  { position: [0.15, -0.3, -0.2], rotation: [40, -20, 55], scale: 0.65, burnStart: 0.45, burnEnd: 1.40 },
  { position: [-0.25, 0.15, -0.25], rotation: [-35, 50, -30], scale: 0.72, burnStart: 0.38, burnEnd: 1.25 },
];

/* The burn occupies the first 35% of the host stage; the notes are culled at
   40%. Kept as named constants because the mirror hard-codes them inline. */
export const BURN_PHASE = 0.35;
export const BILL_CULL = 0.40;

const DEG = Math.PI / 180;
const CAM_FROM = new Vector3(0, 0, 0.19);
const CAM_TO = new Vector3(0, 0, 2);
const ROT_FROM = { x: 0, y: 0, z: 0 };
const ROT_TO = { x: 0, y: 0, z: 90 };

/* the bundle's clamped inverse-lerp, used for every ramp in this beat */
const iv = (x, a, b) => (b === a ? (x >= b ? 1 : 0) : Math.min(Math.max((x - a) / (b - a), 0), 1));

/* Uniform defaults are the mirror's, exactly. uEmberColor and uEmberTip are
   deliberately greater than 1 — the shader multiplies them by a flicker term
   and relies on the overdrive to bloom. */
export function createBurnMaterial(texture = null, {
  direction = "out2in", aspect = 1,
  emberColor = [4, 0.75, 0.05], emberTip = [6, 1.5, 0.25], charColor = [0.02, 0.01, 0.01],
  seed = Math.random(), burnDelay = Math.random() * 0.5, burnSpeed = 1 + Math.random() * 1.5,
  texOffset = [0, 0], texScale = [1, 1], texRotate = 0,
} = {}) {
  return new ShaderMaterial({
    vertexShader: burnVert,
    fragmentShader: burnFrag,
    uniforms: {
      uTexture: { value: texture },
      uBurnProgress: { value: 0 },
      uBurnScale: { value: 4 },
      uEmberWidth: { value: 0.025 },
      uCharWidth: { value: 0.18 },
      uBurnDirection: { value: +(direction === "out2in") },
      uAspect: { value: aspect },
      uEmberColor: { value: new Color(...emberColor) },
      uEmberTip: { value: new Color(...emberTip) },
      uCharColor: { value: new Color(...charColor) },
      uSeed: { value: seed },
      uBurnDelay: { value: burnDelay },
      uBurnSpeed: { value: burnSpeed },
      uTime: { value: 0 },
      uWaveAmp: { value: 0.008 },
      uWaveFreq: { value: 8 },
      uTexOffset: { value: new Vector2(...texOffset) },
      uTexScale: { value: new Vector2(...texScale) },
      uTexRotate: { value: texRotate },
    },
    transparent: true, side: DoubleSide, depthWrite: true, depthTest: true,
  });
}

export function createBillBurn(atlasTexture, { withEmbers = true } = {}) {
  const group = new Group();
  const geometry = new PlaneGeometry(0.345, 0.15, 16, 8);
  const meshes = [];
  const materials = [];

  BILL_SPECS.forEach((spec, i) => {
    const material = createBurnMaterial(atlasTexture, {
      direction: "out2in", aspect: 2.3, seed: i * 0.33,
      burnDelay: 0, burnSpeed: 1,
      texOffset: BILL_TILE.offset, texScale: BILL_TILE.scale, texRotate: 1,
    });
    /* the hero note holds still; the drift behind it ripples */
    material.uniforms.uWaveAmp.value = i === 0 ? 0 : 0.015;

    const mesh = new Mesh(geometry, material);
    mesh.position.set(...spec.position);
    mesh.rotation.set(spec.rotation[0] * DEG, spec.rotation[1] * DEG, spec.rotation[2] * DEG);
    mesh.scale.setScalar(spec.scale);
    /* the drift walks each note well outside the bounding sphere three caches
       from its first pose, so culling has to be off or notes vanish mid-burn */
    mesh.frustumCulled = false;
    mesh.userData.initRot = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
    mesh.userData.rotSeed = Math.random();
    group.add(mesh);
    meshes.push(mesh);
    materials.push(material);
  });

  let emberPoints = null;
  let emberMaterial = null;
  if (withEmbers) {
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 1.4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1.0;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    emberMaterial = new PointsMaterial({
      color: new Color(4, 0.9, 0.18), size: 0.006, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending,
    });
    emberPoints = new Points(g, emberMaterial);
    emberPoints.frustumCulled = false;
    group.add(emberPoints);
  }

  /* progress: 0..1 across the host stage. time: seconds, ONLY for the ember
     flicker and the ripple — nothing structural reads it, so scrubbing
     backwards reproduces a pose exactly. */
  function setProgress(progress, time = 0) {
    const p = Math.min(Math.max(progress, 0), 1);
    const r = Math.min(p / BURN_PHASE, 1);
    const visible = p < BILL_CULL;

    meshes.forEach((mesh, i) => {
      mesh.visible = visible;
      const spec = BILL_SPECS[i];
      const burn = iv(r, spec.burnStart, spec.burnEnd);
      const m = materials[i];
      m.uniforms.uBurnProgress.value = burn;
      m.uniforms.uTime.value = time;
      if (i === 0) m.uniforms.uWaveAmp.value = iv(r, 0.2, 0.4) * 0.015;

      const seed = mesh.userData.rotSeed;
      const init = mesh.userData.initRot;
      mesh.position.z = spec.position[2] + r * (0.3 + seed * 0.7);
      const amp = r * 1.5;
      mesh.rotation.set(
        init.x + Math.sin(seed * 6.283 + r * 3) * amp,
        init.y + Math.cos(seed * 4.1 + r * 2.5) * amp,
        init.z + Math.sin(seed * 3.7 + r * 4) * amp * 0.5,
      );
    });

    if (emberMaterial) {
      emberMaterial.opacity = Math.min(iv(p, 0, 0.05), 1 - iv(p, 0.2, 0.35));
      emberPoints.visible = p < BURN_PHASE;
    }
    return { burnPhase: r, visible };
  }

  /* the mirror dollies the camera out and rolls it 90 degrees across the burn */
  function applyCamera(camera, progress) {
    const r = Math.min(Math.min(Math.max(progress, 0), 1) / BURN_PHASE, 1);
    camera.position.lerpVectors(CAM_FROM, CAM_TO, r);
    camera.rotation.set(
      (ROT_FROM.x + (ROT_TO.x - ROT_FROM.x) * r) * DEG,
      (ROT_FROM.y + (ROT_TO.y - ROT_FROM.y) * r) * DEG,
      (ROT_FROM.z + (ROT_TO.z - ROT_FROM.z) * r) * DEG,
    );
  }

  function dispose() {
    materials.forEach((m) => m.dispose());
    geometry.dispose();
    if (emberPoints) {
      emberPoints.geometry.dispose();
      emberMaterial.dispose();
    }
  }

  return { group, meshes, materials, emberPoints, setProgress, applyCamera, dispose };
}
