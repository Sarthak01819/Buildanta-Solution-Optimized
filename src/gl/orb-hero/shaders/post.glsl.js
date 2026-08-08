import { SIMPLEX3D, HASH } from './common.glsl.js';

export const fsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The section→section wipe. Both scenes render simultaneously and dissolve
 * through a two-octave noise mask with a soft band, while UVs warp a few
 * percent. It is a shader crossfade, NOT a camera move.
 *
 * MEASURED: both octave scales, the offsets, uCrossfadeSize 0.4075,
 * uUvDistortion 0.0415, and — critically — the ~10× RATIO between the octaves.
 * INFERRED: uNoiseUnit, the absolute pixel→noise-space unit. The ratio is what
 * carries the look; the unit only sets how big "large" is, and is tuned at
 * parity.
 */
export const transitionFrag = /* glsl */ `
precision highp float;

uniform sampler2D tFromScene;
uniform sampler2D tToScene;
uniform float uProgress;
uniform vec2 uNoise1Scale;
uniform vec2 uNoise1Offset;
uniform vec2 uNoise2Scale;
uniform float uCrossfadeSize;
uniform float uCrossfadeNoise;
uniform float uUvDistortion;
uniform float uNoiseUnit;
uniform vec2 uResolution;

varying vec2 vUv;

${SIMPLEX3D}

void main() {
  vec2 px = vUv * uResolution * uNoiseUnit;

  float n1 = snoise(vec3(px * uNoise1Scale + uNoise1Offset, 0.0)) * 0.5 + 0.5;
  float n2 = snoise(vec3(px * uNoise2Scale, 5.0)) * 0.5 + 0.5;

  float mask = n1 + (n2 - 0.5) * uCrossfadeNoise * 4.0;

  // A few percent of UV warp, strongest right at the moving edge.
  float edgeProximity = 1.0 - clamp(abs(uProgress - mask) / max(uCrossfadeSize, 0.001), 0.0, 1.0);
  vec2 warp = vec2(n1 - 0.5, n2 - 0.5) * uUvDistortion * edgeProximity;

  vec4 from = texture2D(tFromScene, clamp(vUv + warp, 0.0, 1.0));
  vec4 to = texture2D(tToScene, clamp(vUv - warp, 0.0, 1.0));

  float half_ = uCrossfadeSize * 0.5;
  float mix_ = smoothstep(mask - half_, mask + half_, uProgress);

  gl_FragColor = mix(from, to, mix_);
}
`;

/**
 * Final composite: barrel/bend → chromatic aberration → vignette → sRGB encode
 * → film grain.
 *
 * ORDER MATTERS. The encode happens HERE, in the last pass, specifically so the
 * grain lands on perceptual values. Added in linear space instead, ±0.073 near
 * black is a huge sRGB swing and the picture reads as sandpaper rather than
 * film. That also means this pass replaces OutputPass — running both would
 * double-encode.
 *
 * The grain is genuinely per-pixel and is what stops flat gradient areas from
 * banding. It is a different thing from the particle speckle, which is 1–3px
 * sprites; both are needed and neither substitutes for the other.
 */
export const compositeFrag = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2 uResolution;
uniform float uChromaticAberration;
uniform float uNoiseStrength;
uniform float uNoiseEnabled;
uniform float uVignetteEnabled;
uniform float uVignetteStrength;
uniform float uVignetteInner;
uniform float uVignetteOuter;
uniform float uMaxDistort;
uniform float uBendAmount;

varying vec2 vUv;

${HASH}

vec2 bend(vec2 uv) {
  vec2 cc = uv - 0.5;
  float d2 = dot(cc, cc);
  return 0.5 + cc * (1.0 + uBendAmount * d2 * (1.0 + uMaxDistort));
}

vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = bend(vUv);
  vec2 cc = uv - 0.5;
  float r = length(cc);

  // Radial chromatic aberration — zero at the centre, strongest at the corners.
  vec2 off = cc * uChromaticAberration * r;
  vec3 col;
  col.r = texture2D(tDiffuse, clamp(uv + off, 0.0, 1.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, clamp(uv - off, 0.0, 1.0)).b;

  // Off on landing, authored for the sections that use it.
  float vig = 1.0 - smoothstep(uVignetteInner, uVignetteOuter + 1.0, r) * uVignetteStrength;
  col = mix(col, col * vig, uVignetteEnabled);

  col = linearToSRGB(col);

  float grain = hash12(vUv * uResolution + fract(uTime) * 1371.0) - 0.5;
  col += grain * uNoiseStrength * uNoiseEnabled;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
