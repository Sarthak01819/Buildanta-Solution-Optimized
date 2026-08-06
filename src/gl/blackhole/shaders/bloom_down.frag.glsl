#version 300 es
// Dual-Kawase downsample: 5 bilinear taps per pass.
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;   // 1 / source size

void main() {
  vec2 o = uTexel;
  vec3 c = texture(uTex, vUv).rgb * 4.0;
  c += texture(uTex, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture(uTex, vUv + vec2( o.x, -o.y)).rgb;
  c += texture(uTex, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture(uTex, vUv + vec2( o.x,  o.y)).rgb;
  outColor = vec4(c / 8.0, 1.0);
}
