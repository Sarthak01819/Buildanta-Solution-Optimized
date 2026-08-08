import { SIMPLEX3D, CURL } from './common.glsl.js';

/**
 * Layer 2 — the GPGPU integrators. 256×256 RGBA-float position + velocity
 * targets, ping-ponged (uTexelSize 0.0039 → 65,536 particles).
 *
 * The velocity pass is curl-of-simplex; the position pass runs TWO independent
 * decay/lerp pairs, selected per particle, which is what blends "snap back to
 * the sphere" against "wander freely". Those four numbers are the difference
 * between suspended dust and a fog bank.
 */

export const simVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* ── Velocity ─────────────────────────────────────────────────────────────── */
export const velocityFrag = /* glsl */ `
precision highp float;

uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform float uTime;
uniform float uCurlSize;
uniform float uCurlStrength;
uniform float uCurlNoiseSpeed;
uniform float uCurlNoisePersistence;
uniform float uFriction;
uniform vec3 uNoiseTranslation;

varying vec2 vUv;

${SIMPLEX3D}
${CURL}

void main() {
  vec3 pos = texture2D(tPosition, vUv).xyz;
  vec3 prevVel = texture2D(tVelocity, vUv).xyz;

  // uCurlNoiseSpeed is fast (3.66) — it advances the FIELD, not the particle.
  // The particle's actual travel is throttled by decay/lerp downstream.
  float t = uTime * uCurlNoiseSpeed * 0.1;
  vec3 np = pos * uCurlSize + uNoiseTranslation + vec3(0.0, 0.0, t);

  vec3 curl = curlNoise(np);
  curl += curlNoise(np * 2.13 + 13.7) * uCurlNoisePersistence;

  vec3 target = curl * uCurlStrength;

  // uFriction = 0 on landing → the field IS the velocity, with no memory.
  // Above 0 the cloud starts carrying momentum between frames.
  vec3 vel = mix(target, prevVel, uFriction);

  gl_FragColor = vec4(vel, 1.0);
}
`;

/* ── Position ─────────────────────────────────────────────────────────────── */
export const positionFrag = /* glsl */ `
precision highp float;

uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform sampler2D tHome;    // xyz = rest direction, w = per-particle random
uniform sampler2D tFluid;   // rg = screen-space fluid velocity

uniform float uTime;
uniform float uDelta;       // normalised delta (dt × 60), clamped
uniform float uRadius;
uniform float uDecay;
uniform float uDecay2;
uniform float uLerpSpeed;
uniform float uLerpSpeed2;
uniform float uFluidStrength;
uniform vec2 uFrequency;
uniform vec2 uAmplitude;
uniform float uShapeThreshold;
uniform float uSetup;

/* "Your idea" — the shell opens and the dust REORGANISES into a form.
   uFormMix blends the resting sphere toward that form; uFormVariant picks
   which form. Branching on a uniform is uniform across the whole draw, so it
   costs nothing per particle. */
uniform float uFormMix;
uniform float uFormVariant;

uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec3 uOrbOffset;

varying vec2 vUv;

${SIMPLEX3D}

void main() {
  vec4 home = texture2D(tHome, vUv);
  vec3 rest = home.xyz;
  float rnd = home.w;

  vec3 pos = texture2D(tPosition, vUv).xyz;
  vec3 vel = texture2D(tVelocity, vUv).xyz;

  // ── The target shape ────────────────────────────────────────────────────
  // Two high-frequency octaves modulate the rest radius, so the cloud reads as
  // organically lumpy rather than as a perfect ball. uShapeThreshold splits the
  // population: the lower fraction lives INSIDE as suspended dust, the rest
  // hugs the shell. (Split is INFERRED; the 0.25 is measured.)
  vec3 dir = normalize(rest);
  float s1 = snoise(dir * uFrequency.x + uTime * 0.07) * uAmplitude.x;
  float s2 = snoise(dir * uFrequency.y - uTime * 0.05) * uAmplitude.y;

  float interior = step(rnd, uShapeThreshold);
  float shellRadius = uRadius * (1.0 + s1 + s2);
  float innerRadius = uRadius * mix(0.35, 0.94, fract(rnd * 37.13));
  float targetRadius = mix(shellRadius, innerRadius, interior);

  vec3 target = dir * targetRadius;

  /* ── the idea forms ──────────────────────────────────────────────────────
     Variant A — the orb ITSELF becomes the idea: roughly half the cloud
     collapses into a dense hot core while the rest expands into a loose halo,
     so the same object reads as having opened up rather than been swapped.

     Variant B — a NEW object in the same material: the cloud re-forms into a
     teardrop/seed, tapered at the top. Chosen deliberately to rhyme with the
     falling glass drop that Act 01 already animates into this very spot. */
  if (uFormMix > 0.0) {
    vec3 idea;
    if (uFormVariant < 0.5) {
      /* Denser: 62% of the cloud (was 45%) falls into a core packed at 0.11
         of the radius (was 0.16). Both moved together — more particles into a
         smaller volume is what "denser" actually means; raising only the count
         just makes a bigger fuzzy ball. */
      float core = step(rnd, 0.62);
      idea = dir * mix(uRadius * 1.34, uRadius * 0.11, core);
    } else {
      float y01 = dir.y * 0.5 + 0.5;
      float taper = pow(max(1.0 - y01, 0.0), 0.55);
      idea = vec3(dir.x * taper, dir.y * 1.28, dir.z * taper) * uRadius * 0.88;
    }
    target = mix(target, idea, uFormMix);
  }

  // ── Fluid coupling ──────────────────────────────────────────────────────
  // Project to screen to read the 128² velocity field. Coupled at only 0.1 —
  // physical-feeling interaction, never a gimmick.
  vec4 clip = uProjectionMatrix * uViewMatrix * vec4(pos + uOrbOffset, 1.0);
  vec2 screenUv = (clip.xy / max(clip.w, 0.0001)) * 0.5 + 0.5;
  vec2 fluid = texture2D(tFluid, clamp(screenUv, 0.0, 1.0)).xy;

  // ── Dual decay / lerp ───────────────────────────────────────────────────
  float sel = fract(rnd * 91.7);
  float decay = mix(uDecay, uDecay2, sel);
  float lerpSpeed = mix(uLerpSpeed, uLerpSpeed2, sel);

  pos += vel * decay * uDelta;
  pos.xy += fluid * uFluidStrength * uDelta;
  pos = mix(pos, target, clamp(lerpSpeed * uDelta, 0.0, 1.0));

  // First frame: park everything exactly on the target so there is no visible
  // "settle" at boot.
  pos = mix(pos, target, uSetup);

  gl_FragColor = vec4(pos, 1.0);
}
`;
