import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import * as K from '../../constants.js'

// The trail. This is the effect that makes a drag feel physical rather than
// instant, and it is the only part of the grade that moves with the pointer.
//
// Forked from three's AfterimagePass rather than used directly, for two reasons:
//   1. The stock shader gates at 0.1; the reference measures 0.05 (Round 1 Task 4).
//   2. Its render targets carry a depth buffer this pass never reads.
//
// ---------------------------------------------------------------------------
// Colour space. The chain runs LINEAR end to end and encodes once, in screenfx.
// The reference ran display-referred throughout (outputColorSpace 3000), so its
// two constants are display-space values and both need converting or the trail
// behaves differently from the thing we measured:
//
//   * the gate is a COLOUR threshold, so it converts with the sRGB transfer
//     itself: 0.05 display -> 0.00394 linear.
//   * damp is a RATIO, and a ratio has no exact image under a piecewise curve.
//     It converts with the sRGB curve's exponent: (a*v)^2.4 = a^2.4 * v^2.4, so
//     a display multiplier `a` becomes `a^2.4` in linear.
//
// Those are two different transforms on purpose, applied to two different kinds
// of quantity. Using one for both is wrong in one direction or the other.
// ---------------------------------------------------------------------------

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

export const SRGB_EXPONENT = 2.4

// src: Round 1 Task 4 — params.trailVelocity / params.trailDrag
export const TRAIL_VELOCITY = 0.03
export const TRAIL_CEILING = 0.7
// src: Round 1 Task 4 — when_gt(texelOld, 0.05), display space
export const TRAIL_GATE_DISPLAY = 0.05
export const TRAIL_GATE_LINEAR = srgbToLinear(TRAIL_GATE_DISPLAY)
// src: Round 1 Task 4 — smoothDragVelocity += 0.05 * (|v| - smooth)
export const TRAIL_SMOOTH_LAMBDA = K.lambdaFromLerp(0.05)

// Below this the trail contributes less than one 8-bit code and the pass is
// skipped entirely — one full-screen blit saved on every idle frame.
const SKIP_BELOW = 1 / 512

const TrailShader = {
  uniforms: {
    u_damp: { value: 0 },
    u_gate: { value: TRAIL_GATE_LINEAR },
    tOld: { value: null },
    tNew: { value: null }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float u_damp;
    uniform float u_gate;
    uniform sampler2D tOld;
    uniform sampler2D tNew;
    varying vec2 vUv;

    vec4 when_gt(vec4 x, float y) { return max(sign(x - y), 0.0); }

    void main() {
      vec4 texelOld = texture2D(tOld, vUv);
      vec4 texelNew = texture2D(tNew, vUv);
      texelOld *= u_damp * when_gt(texelOld, u_gate);
      gl_FragColor = max(texelNew, texelOld);
    }`
}

// damp as the reference computes it, in display space, from a PER-FRAME speed.
export function trailDampDisplay(perFrameSpeed) {
  const d = perFrameSpeed * TRAIL_VELOCITY
  if (!Number.isFinite(d)) return 0
  return Math.min(TRAIL_CEILING, Math.max(0, d))
}

export class TrailPass extends Pass {
  constructor() {
    super()

    this.uniforms = THREE.UniformsUtils.clone(TrailShader.uniforms)
    this.smooth = new THREE.Vector2()
    this.dampDisplay = 0
    this.dampEffective = 0

    const opts = {
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false
    }
    // Sized properly by setSize before the first render — three's own pass
    // seeds these from window.innerWidth, which is only ever right by accident.
    this.textureComp = new THREE.WebGLRenderTarget(1, 1, opts)
    this.textureOld = new THREE.WebGLRenderTarget(1, 1, opts)

    this.compMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: TrailShader.vertexShader,
      fragmentShader: TrailShader.fragmentShader
    })
    this.compQuad = new FullScreenQuad(this.compMaterial)

    this.copyMaterial = new THREE.MeshBasicMaterial()
    this.copyQuad = new FullScreenQuad(this.copyMaterial)

    this.enabled = false
  }

  // dragVel arrives in world units per SECOND (grid.js works on a clock).
  // The reference's coefficients were authored against units per FRAME, so the
  // conversion happens here, once, and nowhere else.
  update(dt, dragVel) {
    // dt can legitimately be 0 — a repeated rAF timestamp, or renderAt() called
    // twice on the same millisecond — and a non-finite dragVel would poison the
    // smoother permanently, because NaN * 0 is NaN even where the gate is 0.
    if (!(dt > 0)) return
    const vx = Number.isFinite(dragVel.x) ? Math.abs(dragVel.x) : 0
    const vy = Number.isFinite(dragVel.y) ? Math.abs(dragVel.y) : 0

    const perFrameX = vx / K.REF_FPS
    const perFrameY = vy / K.REF_FPS

    this.smooth.x = K.damp(this.smooth.x, perFrameX, TRAIL_SMOOTH_LAMBDA, dt)
    this.smooth.y = K.damp(this.smooth.y, perFrameY, TRAIL_SMOOTH_LAMBDA, dt)

    this.dampDisplay = trailDampDisplay(this.smooth.x + this.smooth.y)

    // Display ratio -> linear ratio, then onto the clock. The shader multiplies
    // the history once per RENDERED frame, so a raw per-frame ratio would make
    // the trail twice as long at 120 Hz as at 60 Hz.
    const linear = Math.pow(this.dampDisplay, SRGB_EXPONENT)
    const eff = Math.pow(linear, dt * K.REF_FPS)

    // Snapped rather than left to decay into denormals: an exponential never
    // reaches zero, and a uniform sitting at 9e-56 forever is a landmine for
    // anything that later tests it for equality.
    this.dampEffective = Number.isFinite(eff) && eff > SKIP_BELOW ? eff : 0
    this.uniforms.u_damp.value = this.dampEffective
    // A pass the governor retired has already disposed its targets; letting
    // the damp law switch it back on would render from freed memory.
    this.enabled = !this.retired && this.dampEffective > 0
  }

  reset() {
    this.smooth.set(0, 0)
    this.dampDisplay = 0
    this.dampEffective = 0
    this.uniforms.u_damp.value = 0
    this.enabled = false
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tOld.value = this.textureOld.texture
    this.uniforms.tNew.value = readBuffer.texture

    renderer.setRenderTarget(this.textureComp)
    this.compQuad.render(renderer)

    this.copyQuad.material.map = this.textureComp.texture

    if (this.renderToScreen) {
      renderer.setRenderTarget(null)
    } else {
      renderer.setRenderTarget(writeBuffer)
      if (this.clear) renderer.clear()
    }
    this.copyQuad.render(renderer)

    const temp = this.textureOld
    this.textureOld = this.textureComp
    this.textureComp = temp
  }

  setSize(width, height) {
    // RenderTarget.setSize disposes before it reallocates when the dimensions
    // actually change (three/src/core/RenderTarget.js), so this does not leak.
    this.textureComp.setSize(width, height)
    this.textureOld.setSize(width, height)
  }

  dispose() {
    this.textureComp.dispose()
    this.textureOld.dispose()
    this.compMaterial.dispose()
    this.copyMaterial.dispose()
    this.compQuad.dispose()
    this.copyQuad.dispose()
  }
}
