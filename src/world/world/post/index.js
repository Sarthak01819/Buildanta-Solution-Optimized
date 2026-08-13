import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { TrailPass } from './afterimage.js'
import { EdgeWarpPass } from './edgewarp.js'
import { ScanlinePass } from './scanlines.js'
import { isTouch as THREE_TOUCH } from '../../constants.js'
import { ScreenFxPass } from './screenfx.js'

// The chain, in the measured order (Round 1 Task 4):
//   render -> afterimage -> edge warp -> scanlines -> screenFx (to screen)
//
// Antialiasing lives on the composer's target, not the canvas. Once every
// world pixel goes through a RenderPass into an offscreen target, a
// multisampled DEFAULT framebuffer resolves nothing but one full-screen
// triangle — the renderer pays for MSAA and the geometry gets none of it.
export const SAMPLES = 4

export class PostChain {
  // composer: pass the host's when embedding in a site that already owns one —
  // the kit's one-renderer rule. encode: false when that host encodes.
  constructor({ renderer, scene, camera, width, height, composer = null, encode = true, world = null }) {
    this.world = world
    this.renderer = renderer
    this.ownsComposer = !composer

    if (composer) {
      this.composer = composer
    } else {
      const target = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        samples: SAMPLES
      })
      this.composer = new EffectComposer(renderer, target)
    }

    this.renderPass = new RenderPass(scene, camera)
    this.trail = new TrailPass()
    this.warp = new EdgeWarpPass()
    this.scanlines = new ScanlinePass()
    // src: Round 4 — the chain is trimmed on touch: only passes 6, 7, 8 and 14
    // were enabled under a real mobile UA. No scanlines, no world details.
    this.scanlinesAllowed = !THREE_TOUCH()
    this.fx = new ScreenFxPass({ encode })
    this.fx.renderToScreen = this.ownsComposer

    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.trail)
    // scanlines BEFORE warp, deliberately. The scanline pass masks itself out
    // of the open card using a rect projected from that card's geometry. Run
    // after the warp, that rect is stale: the barrel has already pushed the
    // card's pixels outward, so a ring of card sits outside the mask and gets
    // striped — a bright banded frame around the one photograph being looked
    // at, which the reference does not have. Masking first and warping the
    // result moves the card and its clean area together.
    this.composer.addPass(this.scanlines)
    this.composer.addPass(this.warp)
    this.composer.addPass(this.fx)

    // AfterimagePass-style passes seed their targets from window.innerWidth in
    // three's own implementation; ours seed at 1x1 and depend on this call.
    this.setSize(width, height)
  }

  update(dt, dragVel, open = false) {
    this.trail.update(dt, dragVel)
    // The warp is open-driven, not drag-driven — see edgewarp.js.
    this.warp.update(dt, open)
    if (this.scanlinesAllowed) {
      this.scanlines.updateMask(this.world)
      this.scanlines.update(dt)
    }
    else this.scanlines.enabled = false
    this.fx.update(dt)
  }

  render(dt) {
    // A host composer is driven by the host; rendering it here would run the
    // whole site's chain twice per frame.
    if (this.ownsComposer) this.composer.render(dt)
  }

  reset() {
    this.trail.reset()
    this.warp.reset()
    this.scanlines.reset()
    this.fx.reset()
  }

  setSize(width, height) {
    // Propagates to both composer buffers and to every pass; each target's
    // setSize disposes before it reallocates, so repeated resizes do not leak.
    this.composer.setSize(width, height)
  }

  dispose() {
    // renderer.dispose() frees no render targets and forces no context loss, so
    // every allocating member has to be named. A missed one strands four
    // viewport-sized HalfFloat targets per mount/unmount cycle — and the Lite
    // toggle makes that cycle a thing users actually do.
    this.trail.dispose()
    this.warp.dispose?.()
    this.scanlines.dispose?.()
    this.fx.dispose?.()
    this.renderPass.dispose?.()
    // Only tear down a composer we created. Disposing the host's would take
    // the rest of the site's post chain with it.
    if (this.ownsComposer) {
      this.composer.renderTarget1.dispose()
      this.composer.renderTarget2.dispose()
      this.composer.dispose?.()
    } else {
      for (const p of [this.renderPass, this.trail, this.warp, this.scanlines, this.fx]) {
        const i = this.composer.passes.indexOf(p)
        if (i !== -1) this.composer.passes.splice(i, 1)
      }
    }
  }
}
