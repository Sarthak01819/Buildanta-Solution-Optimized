import * as THREE from 'three';
import { gradientVert, gradientFrag } from './shaders/gradient.glsl.js';
import { linear } from './tokens.js';

/** Layer 1 — the background gradient quad. Owns its own material so two
 *  sections can hold two palettes and be crossfaded without touching uniforms
 *  mid-frame. */
export class GradientLayer {
  constructor(params) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: gradientVert,
      fragmentShader: gradientFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uColor1: { value: linear(params.color1) },
        uColor2: { value: linear(params.color2) },
        uColor3: { value: linear(params.color3) },
        uColor4: { value: linear(params.color4) },
        uColor1Brightness: { value: params.color1Brightness },
        uColor2Brightness: { value: params.color2Brightness },
        uColor3Brightness: { value: params.color3Brightness },
        uOffset1: { value: new THREE.Vector2(...params.offset1) },
        uOffset2: { value: new THREE.Vector2(...params.offset2) },
        uOffset3: { value: new THREE.Vector2(...params.offset3) },
        uScale1: { value: params.scale1 },
        uScale2: { value: params.scale2 },
        uScale3: { value: params.scale3 },
        uSpeed: { value: params.speed },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uAxisBottom: { value: params.axisBottom },
        uAxisTop: { value: params.axisTop },
        uAxisWarp: { value: params.axisWarp },
        uMidAmount: { value: params.midAmount },
        uMidCenter: { value: params.midCenter },
        uMidWidth: { value: params.midWidth },
        uFourthAmount: { value: params.fourthAmount },
      },
    });
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }

  /**
   * Re-colour the ground without rebuilding anything.
   *
   * The gradient IS the page background — its top stop is deliberately the
   * site's own --paper, so the hero's upper edge and the HTML behind it are
   * one colour. That makes this the single lever that controls how deep the
   * opening reads, and it has to move at the same instant the CSS token does
   * or the two halves of the same surface disagree.
   *
   * Only the keys passed are touched, so a caller can deepen the ground
   * without disturbing the mid-band tint or the ember at the bottom.
   */
  setColors({ color1, color2, color3, color4 } = {}) {
    const u = this.material.uniforms;
    if (color1) u.uColor1.value = linear(color1);
    if (color2) u.uColor2.value = linear(color2);
    if (color3) u.uColor3.value = linear(color3);
    if (color4) u.uColor4.value = linear(color4);
  }

  setSize(width, height) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  dispose() {
    this.material.dispose();
  }
}
