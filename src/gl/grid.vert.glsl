// Infrastructure grid — wave displacement + an expanding scan ring.

uniform float uTime;
uniform float uScanR;   // scan ring ka current radius
uniform float uScroll;

varying float vFade;
varying float vScan;

void main() {
  vec3 p = position;
  float d = length(p.xz);

  // do overlapping waves — ek radial (centre se bahar), ek linear
  p.y += sin(d * 0.42 - uTime * 1.1) * 0.55 * exp(-d * 0.045);
  p.y += sin(p.x * 0.28 + uTime * 0.55) * 0.16;
  p.y += cos(p.z * 0.31 - uTime * 0.42) * 0.12;

  // scroll grid ko neeche dhakelta hai — camera ke upar uthne ka ehsaas
  p.y -= uScroll * 1.6;

  // scan ring: jaha bhi ring pahunchti hai, line jal uthti hai
  vScan = exp(-abs(d - uScanR) * 1.35);

  // horizon fade — bina iske grid ka kinaara dikh jaata hai
  vFade = 1.0 - smoothstep(9.0, 29.0, d);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
