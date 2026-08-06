precision highp float;

uniform vec3 uCyan;
uniform vec3 uAmber;

varying float vFade;
varying float vScan;

void main() {
  vec3 col = mix(uCyan, uAmber, vScan * 0.75);
  float a = vFade * (0.13 + vScan * 0.9);
  if (a < 0.004) discard;          // horizon par blending cost bachao
  gl_FragColor = vec4(col, a);
}
