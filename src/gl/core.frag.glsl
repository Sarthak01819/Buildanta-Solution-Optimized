precision highp float;

uniform vec3  uCyan;
uniform vec3  uAmber;
uniform float uGlitch;

varying float vN;
varying float vRim;

void main() {
  vec3 col = mix(uCyan * 0.55, uCyan, vN);
  col = mix(col, uAmber, uGlitch * 0.6);       // tez scroll par amber flash
  col += vRim * 0.55;                          // rim light

  float a = 0.22 + vRim * 0.6 + vN * 0.2;
  gl_FragColor = vec4(col, a);
}
