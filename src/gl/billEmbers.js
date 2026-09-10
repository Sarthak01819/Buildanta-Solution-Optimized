/* ══ BILL EMBERS — the mirror's stage-3 ember points (D-076 r2) ════════════
   The warm dots drifting around the notes in the reference's F4/F5. The
   vendored reconstruction (src/vendor/mirrbillburn/billBurn.js, verbatim)
   stands in with a plain PointsMaterial — square 0.006-unit yellow points in
   a 1.4 x 1.0 x 1.2 box — which reads as nothing at the reference lens (0
   orange dots at F4, 9 sample pixels at F5 against the mirror's 96). The
   mirror's own ember shader is in its bundle (main.pretty.js l.37502-37547,
   `Nx`/`Px`/`Fx`, built by `iS` at l.38236): 150 points in a 0.8 x 0.6 x 0.9
   box, per-point size 5..12 px (times pixel ratio, over depth), a soft
   radial alpha, orange mixed per seed between (1,.3,.05) and (1,.5,.08),
   additive, depthWrite off, a slow per-seed drift on uTime, and a depth fade
   smoothstep(3,.5,d) * smoothstep(.05,.2,d). This is that shader, hosted
   here so the vendor file stays verbatim; the host feeds it the vendored
   opacity law (min(hv(t,0,.05), 1-hv(t,.2,.35)), visible while t < .35) and
   the scroll-derived animation time, so every frame is f(scroll). */

import {
  BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, AdditiveBlending,
} from "three";

export const EMBER_COUNT = 150;
export const EMBER_BOX = Object.freeze([0.8, 0.6, 0.9]);
/* The mirror's aSize is 5..12; measured on its F5 the dots come through the
   blur ~24 px wide at their half-maximum (ours at 5..12 came through at
   ~10-14 px and dim), so the size doubles here — the same soft dot, the
   reference's footprint. */
export const EMBER_SIZE = Object.freeze([7, 15]);
/* Host deviation from the port, documented: at our lens-blur strength the
   mirror's own colours came through at R ~130-180 (the reference's dot cores
   reach 239,146,60 on F5), so the colour is overdriven by this gain before
   the alpha — enough for the dots to survive the blur at the frame's edges
   without clamping to yellow at its centre. */
export const EMBER_GAIN = 1.25;
/* the vendored/mirror ember opacity law, in stage-local t */
export const EMBER_FADE_IN_END = 0.05;
export const EMBER_FADE_OUT = Object.freeze([0.2, 0.35]);
export const EMBER_CULL = 0.35;

const iv = (x, a, b) => (b === a ? (x >= b ? 1 : 0) : Math.min(Math.max((x - a) / (b - a), 0), 1));

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec3 pos = position;
    float t = uTime + aSeed * 20.0;
    pos.x += sin(t * 0.5 + aSeed * 6.283) * 0.08;
    pos.y += sin(t * 0.7 + aSeed * 4.1) * 0.06;
    pos.z += sin(t * 0.3 + aSeed * 3.7) * 0.06;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
    float depth = -mvPos.z;
    vAlpha = smoothstep(3.0, 0.5, depth) * smoothstep(0.05, 0.2, depth) * uOpacity;
    vSeed = aSeed;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uGain;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
    vec3 col = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.5, 0.08), vSeed) * uGain;
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * createBillEmbers({ count, random, pixelRatio })
 *   random        — the host's frozen generator; draws x, y, z, size, seed per
 *                   ember in the mirror's own order
 *   points        — add to the bill group (world units shared with the notes)
 *   setProgress(t, time) — t = stage-local progress (0..BILL_CULL), time = the
 *                   scroll-derived animation clock (seconds)
 *   setPixelRatio(ratio)
 *   state         — { count, opacity, visible, size, box }
 *   dispose()
 */
export function createBillEmbers({ count = EMBER_COUNT, random = Math.random, pixelRatio = 1 } = {}) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3 + 0] = (random() - 0.5) * EMBER_BOX[0];
    positions[i * 3 + 1] = (random() - 0.5) * EMBER_BOX[1];
    positions[i * 3 + 2] = (random() - 0.5) * EMBER_BOX[2];
    sizes[i] = EMBER_SIZE[0] + random() * (EMBER_SIZE[1] - EMBER_SIZE[0]);
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    name: "BillEmberMaterial",
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uGain: { value: EMBER_GAIN },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.name = "BillEmbers";
  points.frustumCulled = false;
  points.visible = false;
  const state = { count, opacity: 0, visible: false, size: [...EMBER_SIZE], box: [...EMBER_BOX], gain: EMBER_GAIN };

  function setProgress(t, time = 0) {
    const p = Math.min(Math.max(Number(t) || 0, 0), 1);
    state.opacity = Math.min(iv(p, 0, EMBER_FADE_IN_END), 1 - iv(p, EMBER_FADE_OUT[0], EMBER_FADE_OUT[1]));
    state.visible = p < EMBER_CULL && state.opacity > 0;
    material.uniforms.uOpacity.value = state.opacity;
    material.uniforms.uTime.value = Number(time) || 0;
    points.visible = state.visible;
  }

  function setPixelRatio(ratio) {
    material.uniforms.uPixelRatio.value = Math.max(0.5, Number(ratio) || 1);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return {
    points,
    material,
    setProgress,
    setPixelRatio,
    dispose,
    get state() {
      return { ...state, size: [...state.size], box: [...state.box] };
    },
  };
}

export default createBillEmbers;
