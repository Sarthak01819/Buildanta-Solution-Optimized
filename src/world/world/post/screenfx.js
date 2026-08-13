import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// The always-on grade, and the last pass before the screen: chromatic
// aberration, vignette, the single colour encode, then grain.
//
// None of this is drag-linked. Only the trail and the warp move with the
// pointer (Round 1 Task 4) — do not "improve" that.
//
// ---------------------------------------------------------------------------
// Why their full grade does not smear corner cards into rainbows
//
// The net radial CA is u_bendAmount * u_maxDistort = -0.15 * 0.4 = -0.06, and
// the barrel term is CUBIC: cc * dot(cc, cc) * amt. So the displacement is
//   offset = |cc| * |cc|^2 * 0.06
// At 1440x820 with cc measured in uv:
//   centre        |cc| = 0      -> 0.0 px
//   half radius   |cc| = 0.25   -> 0.06 * 0.015625 * 0.25 = 0.000234 uv = 0.34 px
//   frame corner  |cc| = 0.707  -> 0.06 * 0.5 * 0.707    = 0.0212 uv  = 30.5 px
// ...and that corner figure is the FULL-strength t = 1 case; the loop's largest
// t is 4/5, and each tap is weighted, so the visible fringe is a few pixels at
// the extreme corner and invisible over most of the frame. It was never a
// grade-strength problem, which is why dialling the grade down (as our kit's
// WorldOrb did) was solving the wrong thing.
//
// The sign matters as much as the curve: negative pulls each tap INWARD, so no
// tap can ever leave the texture and no clamped edge band can form.
// ---------------------------------------------------------------------------
//
// Colour: standalone, this pass performs the chain's ONE encode (u_encode 1).
// Embedded in a host that already encodes, construct it with { encode: false }
// and it stays linear. Everything upstream is linear either way.
// three applies its automatic sRGB encode through the
// <colorspace_fragment> chunk, which built-in materials carry in their own
// shader source and a custom ShaderMaterial does not — so nothing else in this
// chain encodes, and adding an OutputPass after this would double-encode and
// render the whole world milky.
//
// Grain is added AFTER the encode, in display space, because that is where the
// reference added it — their pipeline had no encode at all. Adding 0.07 in
// linear instead would be roughly four times stronger over a #050505 field.

export const MAX_DISTORT = 0.4 // src: Round 1 Task 4
export const BEND_AMOUNT = -0.15 // src: Round 1 Task 4
export const VIGNETTE_STRENGTH = 0.05 // src: Round 1 Task 4 — an EXPONENT
export const GRAIN_AMOUNT = 0.07 // src: Round 1 Task 4
export const CA_ITERATIONS = 5 // src: Round 1 Task 4

// u_time is wrapped before upload so a long-lived tab cannot degenerate the
// hash into visible blocks once float precision runs out.
export const TIME_WRAP = 1000

const ScreenFxShader = {
  uniforms: {
    tDiffuse: { value: null },
    u_time: { value: 0 },
    u_maxDistort: { value: MAX_DISTORT },
    u_bendAmount: { value: BEND_AMOUNT },
    u_vignetteStrength: { value: VIGNETTE_STRENGTH },
    u_grain: { value: GRAIN_AMOUNT },
    u_noiseOnly: { value: 0 },
    // 1 when this pass performs the chain's single sRGB encode, 0 when a host
    // composer already encodes downstream. Getting this wrong in either
    // direction is visible immediately: milky if two encodes, crushed if none.
    u_encode: { value: 1 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float u_time;
    uniform float u_maxDistort;
    uniform float u_bendAmount;
    uniform float u_vignetteStrength;
    uniform float u_grain;
    uniform float u_noiseOnly;
    uniform float u_encode;
    varying vec2 vUv;

    vec2 barrelDistortion(vec2 coord, float amt) {
      vec2 cc = coord - 0.5;
      return coord + cc * dot(cc, cc) * amt;
    }

    float sat(float t) { return clamp(t, 0.0, 1.0); }
    float linterp(float t) { return sat(1.0 - abs(2.0 * t - 1.0)); }
    float remap(float t, float a, float b) { return sat((t - a) / (b - a)); }

    vec3 spectrum_offset(float t) {
      float lo = step(t, 0.5);
      float hi = 1.0 - lo;
      float w = linterp(remap(t, 1.0 / 6.0, 5.0 / 6.0));
      vec3 ret = vec3(lo, 1.0, hi) * vec3(1.0 - w, w, 1.0 - w);
      return pow(ret, vec3(1.0 / 2.2));
    }

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 linearToSRGB(vec3 c) {
      c = max(c, vec3(0.0));
      return mix(c * 12.92,
                 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
                 step(vec3(0.0031308), c));
    }

    void main() {
      // Accumulate the spectrum. Dividing by the summed weights is what keeps
      // this neutral: for a constant source c, sumcol = c * sum(w), so
      // sumcol / sumw == c exactly, per channel. A flat white frame stays white
      // and a flat grey stays grey — a ramp that does not normalise is the most
      // likely way this pass ships with a tint nobody can find.
      vec3 sumcol = vec3(0.0);
      vec3 sumw = vec3(0.0);
      for (int i = 0; i < ${CA_ITERATIONS}; i++) {
        float t = float(i) / float(${CA_ITERATIONS});
        vec3 w = spectrum_offset(t);
        sumw += w;
        sumcol += w * texture2D(tDiffuse,
          barrelDistortion(vUv, u_bendAmount * u_maxDistort * t)).rgb;
      }
      vec3 col = sumcol / sumw;

      // Strength is an exponent, so 0.05 is very soft: at the frame corner
      // uv2.x * uv2.y * 20 is near 0 and pow(x, 0.05) still returns ~0.8.
      vec2 uv2 = vUv * (1.0 - vUv.yx);
      float vig = pow(max(uv2.x * uv2.y * 20.0, 0.0), u_vignetteStrength);
      col = mix(vec3(0.0), col, vig);

      vec3 srgb = mix(col, linearToSRGB(col), u_encode);

      // Screen-space hash, no texture, animated from the raw clock. Positive
      // offset only, exactly as measured — it is what lifts the blacks.
      float g = hash12(gl_FragCoord.xy + u_time);
      srgb += vec3(g * u_grain);

      gl_FragColor = vec4(mix(srgb, vec3(g), u_noiseOnly), 1.0);
    }`
}

export class ScreenFxPass extends ShaderPass {
  // encode: false when a host composer owns the colour encode.
  constructor({ encode = true } = {}) {
    super(ScreenFxShader)
    this.uniforms.u_encode.value = encode ? 1 : 0
    this.time = 0
    this.enabled = true
  }

  update(dt) {
    if (!(dt > 0)) return
    this.time = (this.time + dt) % TIME_WRAP
    this.uniforms.u_time.value = this.time
  }

  reset() {
    this.time = 0
    this.uniforms.u_time.value = 0
  }
}
