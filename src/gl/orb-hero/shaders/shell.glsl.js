import { SIMPLEX3D } from './common.glsl.js';

/**
 * Layer 3 — the glass shell.
 *
 * The non-obvious trick, and the reason the rim reads as a soap-bubble skin
 * rather than a lit ball: TWO independent Fresnel terms with DIFFERENT
 * falloffs. 1.51 drives colour, 1.98 drives opacity — so the rim brightens and
 * the body thins at different rates. One shared Fresnel gives you a shiny
 * marble every time.
 *
 * Base opacity is 0.95, not 1.0. The clouds are a smoothstep window (0.36→0.92)
 * over an animated 3D noise field, which is what carves the internal blobs.
 */

export const shellVert = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const shellFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uOpacity;
uniform float uShininess;

uniform float uColorFresnelAmount;
uniform float uColorFresnelOffset;
uniform float uColorFresnelFalloff;
uniform float uOpacityFresnelAmount;
uniform float uOpacityFresnelOffset;
uniform float uOpacityFresnelFalloff;

uniform vec2 uCloudsSmoothstep;
uniform vec3 uCloudNoiseScale;
uniform float uCloudNoiseSpeed;

uniform vec3 uAmbientColor;
uniform vec3 uFresnelColor;
uniform vec3 uCloudsColor;

uniform vec3 uLight1Color;
uniform vec3 uLight1Position;
uniform float uLight1Intensity;
uniform float uLight1Specular;
uniform vec3 uLight2Color;
uniform vec3 uLight2Position;
uniform float uLight2Intensity;
uniform float uLight2Specular;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorld;

${SIMPLEX3D}

/* Returns diffuse in .rgb and the specular scalar in .a, kept apart on purpose:
   folding them together and multiplying the base by (1 + L1 + L2) drives a
   #FFA077 body to ~3.0 linear, which clips to white and drags the bloom with
   it. Diffuse tints, specular adds. */
vec4 lightContribution(
  vec3 N, vec3 V, vec3 lightPos, vec3 lightColor, float intensity, float specular
) {
  vec3 L = normalize(lightPos - vWorld);
  float diff = max(dot(N, L), 0.0) * intensity;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), uShininess) * specular;
  return vec4(lightColor * diff, spec);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);

  float facing = 1.0 - abs(dot(N, V));

  float colorFresnel =
    uColorFresnelOffset + uColorFresnelAmount * pow(facing, uColorFresnelFalloff);
  float opacityFresnel =
    uOpacityFresnelOffset + uOpacityFresnelAmount * pow(facing, uOpacityFresnelFalloff);

  // Internal cloud blobs.
  float n = snoise(vWorld * uCloudNoiseScale * 0.35 + uTime * uCloudNoiseSpeed * 0.1) * 0.5 + 0.5;
  float clouds = smoothstep(uCloudsSmoothstep.x, uCloudsSmoothstep.y, n);

  vec3 base = mix(uAmbientColor, uCloudsColor, clouds);

  vec4 l1 = lightContribution(N, V, uLight1Position, uLight1Color, uLight1Intensity, uLight1Specular);
  vec4 l2 = lightContribution(N, V, uLight2Position, uLight2Color, uLight2Intensity, uLight2Specular);

  // Ambient floor + tinted diffuse, energy kept in range; specular rides on top.
  vec3 lit = base * (0.34 + 0.66 * clamp(l1.rgb + l2.rgb, 0.0, 1.0));
  lit += uLight1Color * l1.a + uLight2Color * l2.a;

  vec3 col = mix(lit, uFresnelColor, clamp(colorFresnel, 0.0, 1.0));

  float alpha = uOpacity * clamp(opacityFresnel, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;
