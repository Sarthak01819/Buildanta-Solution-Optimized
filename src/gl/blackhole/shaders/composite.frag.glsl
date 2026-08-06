#version 300 es
// Final grade: scene + bloom → exposure → ACES filmic → vignette, grain,
// dither → sRGB. This is the only pass that writes to the canvas.
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;  // breathing + cursor boost applied on CPU
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uLean;    // cursor light-lean: direction * strength (screen space)
uniform float uPulse;  // click flare, 1 → 0

// Stephen Hill's ACES fit.
vec3 aces(vec3 x) {
  const mat3 IN = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);
  x = IN * x;
  vec3 a = x * (x + 0.0245786) - 0.000090537;
  vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;

  // The light leans toward the cursor: bright content on the cursor's side of
  // the hole lifts, the far side dips. Masked by luminance so space stays
  // black; the click flare pulses the same mask.
  float leanAmt = length(uLean);
  float hdrLum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mask = smoothstep(0.010, 0.18, hdrLum);
  if (leanAmt > 0.0005) {
    vec2 fromC = vUv - 0.5;
    fromC.x *= uRes.x / uRes.y;
    float side = dot(normalize(fromC + 1e-5), uLean / leanAmt);
    c *= 1.0 + side * leanAmt * mask;
  }
  c *= 1.0 + uPulse * mask;

  c = max(c * uExposure - 0.010, 0.0);  // pin space to true black
  c = aces(c);
  c *= vec3(1.035, 0.990, 0.950);   // the plate's warm peach grade

  // Gentle corner falloff, like the reference plate.
  vec2 q = vUv * (1.0 - vUv);
  float vig = pow(q.x * q.y * 15.0, 0.28);
  c *= mix(1.0, clamp(vig, 0.0, 1.0), uVignette);

  // Fine animated grain + 1-bit dither: kills banding in the wide halo.
  // Gated by luminance — grain on pure black would lift space to grey
  // (tiny linear values decode to whole sRGB codes).
  float g = hash21(vUv * uRes + fract(uTime * 13.7) * 101.0) - 0.5;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += g * uGrain * smoothstep(0.0, 0.16, lum);
  c += (hash21(vUv * uRes + 0.5 + fract(uTime * 7.3) * 57.0) - 0.5) / 255.0;

  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  outColor = vec4(c, 1.0);
}
