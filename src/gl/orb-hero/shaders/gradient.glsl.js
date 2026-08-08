import { SIMPLEX3D } from './common.glsl.js';

/**
 * Layer 1 — the background gradient quad.
 *
 * 70% of the mood for near-zero cost, and the layer that survives if everything
 * else fails. Three independent noise octaves, each with its own scale and 2D
 * offset, one shared uSpeed.
 *
 * MEASURED: colours, brightnesses, uScale1/2, uOffset1/2, uSpeed.
 * INFERRED: that the octaves warp a vertical colour AXIS rather than selecting
 * colours outright. The reference's measured composite is unambiguous about the
 * axis — cream at the top (#FADFB9), coral at the bottom (#FF9C8D) — and no
 * plain noise-select reproduces that reliably. Structure is ours; every
 * magnitude in it is theirs.
 *
 * FITTED, and the single most important thing on this layer: the axis is a
 * COMPRESSED band, not a full 0→1 sweep. Back-solving the measured corners in
 * linear space gives a colour-1 fraction of ≈0.20 at top-middle and ≈0.66 at
 * bottom-middle. The pure endpoint colours (#FAF4C9, #FF5050) never appear
 * anywhere on the reference's landing frame. Ship the naive full sweep and the
 * top goes acid-cream and the bottom goes pillar-box red — measured Δ up to 63
 * codes per channel, which is a different picture, not a tuning difference.
 */

export const gradientVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const gradientFrag = /* glsl */ `
precision highp float;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform float uColor1Brightness;
uniform float uColor2Brightness;
uniform float uColor3Brightness;
uniform vec2 uOffset1;
uniform vec2 uOffset2;
uniform vec2 uOffset3;
uniform float uScale1;
uniform float uScale2;
uniform float uScale3;
uniform float uSpeed;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAxisBottom;   // colour1 fraction at the bottom of frame
uniform float uAxisTop;      // colour1 fraction at the top of frame
uniform float uAxisWarp;     // how hard the octaves bend the axis
uniform float uMidAmount;
uniform float uMidCenter;
uniform float uMidWidth;
uniform float uFourthAmount;

varying vec2 vUv;

${SIMPLEX3D}

void main() {
  // Aspect-correct the sample space so the shapes stay shaped on any window.
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = uTime * uSpeed;

  float n1 = snoise(vec3((p + uOffset1) * uScale1, t)) * 0.5 + 0.5;
  float n2 = snoise(vec3((p + uOffset2) * uScale2, t * 0.83 + 11.0)) * 0.5 + 0.5;
  float n3 = snoise(vec3((p + uOffset3) * uScale3, t * 1.21 + 27.0)) * 0.5 + 0.5;

  // The axis runs bottom→top, warped by the two large octaves so the boundary
  // marbles instead of banding.
  float ramp = vUv.y + ((n1 - 0.5) * 2.1 + (n2 - 0.5)) * uAxisWarp;
  ramp = clamp(ramp, 0.0, 1.0);

  // Remapped into the COMPRESSED band the reference actually occupies.
  float mixA = mix(uAxisBottom, uAxisTop, ramp);

  vec3 col = mix(uColor3 * uColor3Brightness, uColor1 * uColor1Brightness, mixA);

  // Colour 2 is a mid-band tint, not a third stop of the axis — a full stop
  // pushes red down at the bottom corners, which the measurement says it must.
  float mid = uMidAmount * exp(-pow((mixA - uMidCenter) / max(uMidWidth, 0.001), 2.0));
  col = mix(col, uColor2 * uColor2Brightness, mid);

  // Fourth colour rides the fine octave — on landing it holds colour3, so this
  // is a no-op there and a real fourth stop for the sections that use it.
  col = mix(col, uColor4, smoothstep(0.72, 1.0, n3) * uFourthAmount);

  gl_FragColor = vec4(col, 1.0);
}
`;
