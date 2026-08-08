/**
 * The 128×128 fluid solver. Mouse is coupled through this, never wired directly
 * to the particles — that is the whole difference between "physical" and
 * "gimmick". Two pressure iterations is cheap and enough.
 *
 * The pressure iterations run as SEPARATE CPU-driven passes, never as a GLSL
 * loop. A loop bound by a constant unrolls into a Metal compile that can freeze
 * a cold tab for tens of seconds while the author's warm tab looks fine.
 */

export const fluidVert = /* glsl */ `
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 uTexelSize;

void main() {
  vUv = uv;
  vL = uv - vec2(uTexelSize.x, 0.0);
  vR = uv + vec2(uTexelSize.x, 0.0);
  vT = uv + vec2(0.0, uTexelSize.y);
  vB = uv - vec2(0.0, uTexelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const advectFrag = /* glsl */ `
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexelSize;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + uDissipation * uDt;
  gl_FragColor = result / decay;
}
`;

export const curlFrag = /* glsl */ `
precision highp float;
uniform sampler2D uVelocity;
varying vec2 vL, vR, vT, vB, vUv;

void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}
`;

export const vorticityFrag = /* glsl */ `
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
varying vec2 vL, vR, vT, vB, vUv;

void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;

  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;

  vec2 vel = texture2D(uVelocity, vUv).xy;
  vel += force * uDt;
  vel = min(max(vel, -1000.0), 1000.0);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

export const divergenceFrag = /* glsl */ `
precision highp float;
uniform sampler2D uVelocity;
varying vec2 vL, vR, vT, vB, vUv;

void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;

  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }

  gl_FragColor = vec4(0.5 * ((R - L) + (T - B)), 0.0, 0.0, 1.0);
}
`;

export const clearFrag = /* glsl */ `
precision highp float;
uniform sampler2D uTexture;
uniform float uClearValue;
varying vec2 vUv;

void main() {
  gl_FragColor = uClearValue * texture2D(uTexture, vUv);
}
`;

export const pressureFrag = /* glsl */ `
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
varying vec2 vL, vR, vT, vB, vUv;

void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const gradientSubtractFrag = /* glsl */ `
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
varying vec2 vL, vR, vT, vB, vUv;

void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

/* The pointer impulse. No discrete splat API on the reference either — a
   continuous force injected along the frame's pointer delta. */
export const splatFrag = /* glsl */ `
precision highp float;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec2 uForce;
uniform float uRadius;
uniform float uAspect;
varying vec2 vUv;

void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * vec3(uForce, 0.0);
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;
