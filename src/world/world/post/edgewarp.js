import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import * as K from '../../constants.js'

// The drag-linked barrel. This is the pass that makes a FLAT grid read as a
// sphere — without it the rebuild is a flat grid with a wobble.
//
// Two things happen, in this order:
//   1. (vUv - 0.5) / u_scale + 0.5  — zoom the SAMPLING of a viewport-sized
//      target. Because the source is exactly viewport-sized with no overscan
//      (measured: every world RT is 1495x816, Round 1 Task 4), sampling a wider
//      area means the frame edges creep INWARD rather than revealing fresh
//      pixels. That is what the reference does, and it is why no oversized
//      render target is needed anywhere in this chain.
//   2. the barrel itself, r' = r * (1 + strength * r^2).
//
// The measured form is polar (atan/sqrt). Cartesian st * (1 + s * dot(st, st))
// is the same function — |st'| = |st| * (1 + s|st|^2) with direction preserved —
// for two ops instead of three transcendentals per fragment.

// src: Round 2 Task A — edgeWarpParams.strength
export const WARP_STRENGTH_MAX = 0.6
// src: Round 1 Task 4 — u_scale reaches ~1.2 during a drag
export const WARP_SCALE_MAX = 1.2

// src: Round 3 — u_scale is exactly 1 + u_strength/3, verified at three points
// (0.0513 -> 1.0171, 0.3213 -> 1.1071, 0.6 -> 1.2).
export const WARP_SCALE_RATIO = 3

const WarpShader = {
  uniforms: {
    tDiffuse: { value: null },
    u_strength: { value: 0 },
    u_scale: { value: 1 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float u_strength;
    uniform float u_scale;
    varying vec2 vUv;

    void main() {
      vec2 st = (vUv - 0.5) / u_scale;
      st *= 1.0 + u_strength * dot(st, st);
      vec2 uv = st + 0.5;

      // Anything the warp pushes outside the frame reads black, not a clamped
      // smear. A clamp here is what produces the rainbow band down the sides
      // that looks like a driver bug once the CA pass samples it.
      vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
      gl_FragColor = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)) * inside.x * inside.y;
    }`
}

export class EdgeWarpPass extends ShaderPass {
  constructor() {
    super(WarpShader)
    this.ramp = 0
    // Off at rest costs nothing and is exactly what was measured
    // (u_strength 0, u_scale 1 => the pass is an identity blit).
    this.enabled = false
  }

  // Driven by the OPEN state, not by drag.
  //
  // Round 1 inferred a drag ramp from "0 at rest, params.strength 0.6". Round 3
  // measured the only clean 0 -> 0.6 ramp directly: dragVelocity was [0, 0] on
  // all 891 sampled frames, and the trigger was a card opening. It then held at
  // 0.6 for four seconds and released on close. A drag-driven warp was our
  // inference, and it was wrong.
  //
  // Their approach is an asymptotic per-frame lerp (0.5942 @ 1018ms, 0.5991 @
  // 1418ms) and therefore frame-rate dependent. Ours damps on the clock, which
  // is the same shape without the 60-vs-165Hz difference.
  update(dt, open) {
    if (!(dt > 0)) return

    const lambda = open ? K.OPEN_LAMBDA : K.CLOSE_LAMBDA
    let ramp = K.damp(this.ramp, open ? 1 : 0, lambda, dt)
    if (!open && ramp <= 0.001) ramp = 0

    this.ramp = ramp
    this.uniforms.u_strength.value = ramp * WARP_STRENGTH_MAX
    this.uniforms.u_scale.value = 1 + (ramp * WARP_STRENGTH_MAX) / WARP_SCALE_RATIO
    this.enabled = ramp > 0
  }

  reset() {
    this.ramp = 0
    this.uniforms.u_strength.value = 0
    this.uniforms.u_scale.value = 1
    this.enabled = false
  }
}
