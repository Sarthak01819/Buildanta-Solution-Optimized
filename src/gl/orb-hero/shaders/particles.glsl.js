import { SIMPLEX3D } from './common.glsl.js';

/**
 * Layer 2 render — instanced camera-facing quads reading position from the FBO
 * via per-instance aFboUv, with aRandom and aScale for size variation and for
 * picking the highlight.
 *
 * The sparkle is one line: 2% of particles at pure white, plus modest bloom.
 * That is the entire effect — no separate glint system, no sprite sheet.
 */

export const particlesVert = /* glsl */ `
precision highp float;

attribute vec2 aFboUv;
attribute float aRandom;
attribute float aScale;

uniform sampler2D tPosition;
uniform float uParticleSize;
uniform vec2 uScaleRange;
uniform vec3 uSunPosition;

varying vec2 vUv;
varying float vRandom;
varying float vRadial;
varying float vViewDist;
varying float vSunDist;
varying vec3 vWorld;

void main() {
  vec3 sim = texture2D(tPosition, aFboUv).xyz;

  float size = uParticleSize * mix(uScaleRange.x, uScaleRange.y, aScale);

  vec4 mv = modelViewMatrix * vec4(sim, 1.0);
  // Camera-facing: offset in VIEW space, so the quad never needs a billboard
  // matrix and never twists at the frame edge.
  mv.xy += position.xy * size;

  vec3 world = (modelMatrix * vec4(sim, 1.0)).xyz;

  vUv = uv;
  vRandom = aRandom;
  vRadial = length(sim);
  vViewDist = -mv.z;
  vSunDist = distance(world, uSunPosition);
  vWorld = world;

  gl_Position = projectionMatrix * mv;
}
`;

export const particlesFrag = /* glsl */ `
precision highp float;

uniform vec3 uBaseColor;
uniform vec3 uBaseColor2;
uniform vec3 uEdgeColor1;
uniform vec3 uEdgeColor2;
uniform vec2 uEdgeColorStop;
uniform vec3 uBloomColor1;
uniform vec3 uBloomColor2;
uniform vec3 uShadowColor;
uniform vec3 uHighlightColor;
uniform float uShadowIntensity;
uniform float uSunDistanceColorStop;
uniform vec2 uDistanceFadeNearFar;
uniform float uRandomHighlightSelect;
uniform float uHighlightIntensity;
uniform float uCloudsFadeIntensity;

/* The core needs its OWN colour term, not just more particles.
   The body colour is a radial ramp — deep ember at the centre, hot rim colours
   further out — so collapsing particles inward moved them DOWN that ramp and
   the denser the core got, the darker it read. This lifts the collapsed core
   toward a hot colour ABOVE 1.0, so the bloom threshold catches it and the
   core actually glows instead of just thickening. */
uniform float uFormMix;
uniform vec3 uCoreColor;
uniform float uCoreIntensity;
uniform float uFlash;
uniform vec3 uCloudNoiseScale;
uniform float uCloudNoiseSpeed;
uniform vec2 uCloudsSmoothstep;
uniform float uDotSolid;   // how much of each dot is solid before the rim fades
uniform float uOpacity;
uniform float uTime;

varying vec2 vUv;
varying float vRandom;
varying float vRadial;
varying float vViewDist;
varying float vSunDist;
varying vec3 vWorld;

${SIMPLEX3D}

void main() {
  // Soft round sprite. At 1–3px on screen this is what stops the cloud reading
  // as a grid of squares.
  float d = length(vUv - 0.5) * 2.0;
  float alpha = smoothstep(1.0, uDotSolid, d);
  if (alpha <= 0.001) discard;

  vec3 col = mix(uBaseColor, uBaseColor2, vRandom);

  // Radial ramp: deep red at the core, hot rim colours as the cloud reaches
  // and passes the shell (stops measured in world units: 1.93 → 2.89).
  float edge = smoothstep(uEdgeColorStop.x, uEdgeColorStop.y, vRadial);
  col = mix(col, mix(uEdgeColor1, uEdgeColor2, vRandom), edge);
  col = mix(col, mix(uBloomColor1, uBloomColor2, vRandom), edge * 0.35);

  // Shade the far side of the sun.
  float shade = smoothstep(uSunDistanceColorStop * 0.55, uSunDistanceColorStop, vSunDist);
  col = mix(col, uShadowColor, shade * uShadowIntensity);

  // The cloud field the shell also uses — computed analytically here rather
  // than read from a prepass texture. Same noise, same params, one less target.
  float clouds = snoise(vWorld * uCloudNoiseScale * 0.35 + uTime * uCloudNoiseSpeed * 0.1) * 0.5 + 0.5;
  clouds = smoothstep(uCloudsSmoothstep.x, uCloudsSmoothstep.y, clouds);
  alpha *= mix(1.0, clouds, clamp(uCloudsFadeIntensity * 0.25, 0.0, 1.0));

  // THE sparkle: the top 2% go pure white, ABOVE 1.0 so the bloom threshold can
  // separate them from a cream page, and let bloom do the rest.
  float highlight = step(uRandomHighlightSelect, vRandom);
  col = mix(col, uHighlightColor * uHighlightIntensity, highlight);
  alpha = mix(alpha, min(alpha * 2.4, 1.0), highlight);

  // Core glow — only while the idea is formed, strongest at the centre.
  /* Tight ramp on purpose. A wide one (0.25→1.15) whited out a disc ~200px
     across with no structure in it — that is clipping, not brightness. Pulled
     to 0.10→0.62 so only the true core saturates and the falloff keeps its
     amber, which is what makes it read as a light SOURCE rather than a hole
     cut in the picture. */
  float coreness = 1.0 - smoothstep(0.1, 0.62, vRadial);
  col = mix(col, uCoreColor * uCoreIntensity, coreness * uFormMix);
  alpha = mix(alpha, min(alpha * 1.6, 1.0), coreness * uFormMix);

  /* Contact flare — deliberately NOT gated on uFormMix.
     The drop lands at p≈0.070 but the core does not exist until the form phase
     starts at p≈0.083, so anything multiplied by uFormMix is multiplied by zero
     at exactly the moment of impact. Raising uCoreIntensity alone measured a
     3.3x jump and changed nothing on screen. coreness is no help either -- it
     is scaled for the COLLAPSED core, and at contact the cloud is still a full
     sphere. So the flare lifts the whole cloud briefly instead: the orb flashes
     as one body when the drop hits it. */
  col += uCoreColor * uFlash * 0.55;

  // Cull the far half so the cloud has depth instead of a flat silhouette.
  alpha *= 1.0 - smoothstep(uDistanceFadeNearFar.x, uDistanceFadeNearFar.y, vViewDist);

  gl_FragColor = vec4(col, alpha * uOpacity);
}
`;

/* ── Flare particles ──────────────────────────────────────────────────────── */
/* The sparser system that escapes the shell. Its bloom colour is cyan against
   a coral field — that single complementary choice is the only reason the
   cursor trail is visible at all on a warm page. */

export const flaresFrag = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform vec3 uBloomColor;
uniform vec2 uCenterFade;
uniform float uOpacity;

varying vec2 vUv;
varying float vRandom;
varying float vRadial;
varying float vViewDist;
varying float vSunDist;
varying vec3 vWorld;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float alpha = pow(core, 2.2);
  if (alpha <= 0.002) discard;

  // Only visible once they are OUTSIDE the shell — 3.0 → 3.3.
  alpha *= smoothstep(uCenterFade.x, uCenterFade.y, vRadial);

  vec3 col = mix(uColor, uBloomColor, pow(core, 3.0));

  gl_FragColor = vec4(col, alpha * uOpacity);
}
`;
