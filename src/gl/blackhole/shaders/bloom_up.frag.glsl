#version 300 es
// Upsample tent filter; each level adds onto the one above (uAdd = previous mip
// chain result, sampled at this level's resolution).
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;    // smaller mip being upsampled
uniform sampler2D uAdd;    // this level's own downsample (carry the chain)
uniform vec2 uTexel;       // 1 / destination size
uniform float uAddWeight;
uniform float uTexWeight;  // >1 on the deepest level = the wide film halo

void main() {
  vec2 o = uTexel;
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture(uTex, vUv + vec2( 0.0, -o.y)).rgb * 2.0;
  c += texture(uTex, vUv + vec2( o.x, -o.y)).rgb;
  c += texture(uTex, vUv + vec2(-o.x,  0.0)).rgb * 2.0;
  c += texture(uTex, vUv).rgb * 4.0;
  c += texture(uTex, vUv + vec2( o.x,  0.0)).rgb * 2.0;
  c += texture(uTex, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture(uTex, vUv + vec2( 0.0,  o.y)).rgb * 2.0;
  c += texture(uTex, vUv + vec2( o.x,  o.y)).rgb;
  c /= 16.0;
  outColor = vec4(c * uTexWeight + texture(uAdd, vUv).rgb * uAddWeight, 1.0);
}
