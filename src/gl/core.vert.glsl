// Core wireframe — noise breathing + scanline glitch bands.

uniform float uTime;
uniform float uMorph;    // 0..1, scroll se
uniform float uGlitch;   // 0..1, scroll velocity se
uniform vec2  uMouse;

varying float vN;
varying float vRim;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  vec3 p = position;
  vec3 n = normalize(p);

  // saans lena — surface noise normal ke saath bahar-andar
  float k = noise(p * 1.25 + uTime * 0.28);
  p += n * (k - 0.5) * (0.32 + uMorph * 0.75);

  // glitch: horizontal bands jo side mein slip karte hain
  float band = step(0.62, fract(p.y * 2.6 + uTime * 1.7));
  p.x += band * uGlitch * 0.42;
  p.z += band * uGlitch * 0.18;

  vN = k;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);

  // rim: kinaare pe brightness, silhouette ubhaarne ke liye
  vRim = 1.0 - abs(normalize(mv.xyz).z);

  gl_Position = projectionMatrix * mv;
}
