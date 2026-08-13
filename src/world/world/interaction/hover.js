import { Hands } from '../cursor.js'
import * as THREE from 'three'

// What the pointer is over, what that looks like, and what the cursor says.
//
// ---------------------------------------------------------------------------
// Where the raycast goes, and why nowhere else
//
// Last in step(), after updateProximity() — and it has to refresh matrices
// itself. Two independent reasons, both true of three r169:
//
//   1. updateProximity() writes mesh.position.z every frame (measured law:
//      -0.15 per unit of 2D distance, already ~-210 at the corner of the
//      visible set). Picking before it runs tests last frame's depths.
//   2. Mesh.raycast reads this.matrixWorld and never refreshes it, and
//      matrixWorld is only recomposed inside renderer.render(). At the measured
//      hard-flick speed of 1875 u/s that is 31 world units of staleness — enough
//      to pick the neighbouring card near an edge.
//
// The camera is a separate trap: it is NOT a child of the scene, so
// scene.updateMatrixWorld() never reaches it, while Raycaster.setFromCamera
// reads camera.matrixWorld raw. updateCamera() has just written position and
// quaternion through the parallax pivot sandwich, so both matrices are
// refreshed here, next to the call that depends on them.
//
// This is also the reference's own order (Round 2 Task A): updateRaycaster runs
// last in its onRaf.
//
// ---------------------------------------------------------------------------
// What hover adds, and what it deliberately does not
//
// The proximity push plus the MEASURED fog already carry the tonal read. Camera
// z 1500, fog near 1500 / far 2200: a card pushed back 220 units sits at
// smoothstep(1500, 2200, 1720) = 0.234, i.e. 23% of the way to the background,
// while the card under the pointer is at 0%. There is already a spotlight, and
// it is measured.
//
// Round 3 went further and measured that the reference has NO hover animation
// at all: scale flat at 0.99999 across a 3.2s hover, opacity flat at 1, no
// hover uniform on the material, renderOrder unchanged. Hover sets one boolean.
// The card that appears to light up is scene fog reacting to the parallax
// z-drift — which happens identically with nothing hovered, and is what fooled
// the capture too, for four samplers.
//
// So this module does exactly one visible thing: the cursor. The marquee and
// the hover caption we had shipped were both inventions, and the caption was in
// the wrong place entirely — measured, it belongs to the OPEN state.
//
// It also does not use the item's accent colour: that is measured to be the
// scanline tint on open, and spending it on hover spends the one measured
// colour signal on the wrong event.

export class Hover {
  constructor({ world, root = document.documentElement, mountRoot = document.body }) {
    this.world = world
    this.root = root
    // Separate from `root`, which is documentElement and carries the state
    // classes. This is where the surface element is ATTACHED.
    this.mountRoot = mountRoot
    this.raycaster = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()
    this.cell = null
    this.enabled = true
    this.pointerInside = false

    // The canvas is pointer-events:none, so it can never be the element a
    // cursor is read from. This surface is what the pointer actually hits over
    // the field, and it is where touch-action lives.
    this.surface = document.createElement('div')
    this.surface.className = 'world-surface'
    this.surface.dataset.cursor = 'grab'
    // The reference carries three hand meshes for this. Same three states,
    // drawn and applied as real cursors — see cursor.js for why not meshes.
    // The hands go on the world's ROOT, not on the surface.
    //
    // The surface is pointer-events:none while a card is open — that is what
    // gates the drag — so the element under the pointer changes the moment you
    // open something, and a cursor set only on the surface disappears exactly
    // then. Measured across a grid of 112 points: hand everywhere while
    // browsing, plain arrow everywhere with a card open. On the root it holds
    // in both states, and controls override it with a pointer.
    this.hands = new Hands({ surface: this.mountRoot })
    // Into the world's own root, not the document body.
    //
    // Embedded, body is the HOST page's — the Buildanta site relocates its own
    // #contact there in finale mode, and its `body * { cursor: none !important }`
    // reaches anything living there. The surface is the element that carries the
    // drag hands, so left on body it sat outside every rule scoped to the world
    // and the cursor never appeared inside it. Defaults to body, so standalone
    // is unchanged.
    this.mountRoot.append(this.surface)

    this.bind()
  }

  bind() {
    this.onMove = (e) => {
      // Only the field counts. Without this the raycast runs for a pointer over
      // the nav, the footer or the open panel, so `cell` is set behind a control
      // and OpenCard commits on the same press that activates it. Never
      // observed in the wild — no card happened to be under a control in two
      // attempts — but nothing guarded it either.
      this.pointerInside = !e.target || e.target === this.surface
      this.ndc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1)
      )
    }
    this.onLeave = () => {
      this.pointerInside = false
      this.select(null)
    }
    this.onDown = (e) => {
      if (e.target && e.target !== this.surface) return
      // Only the primary button starts a drag. A right-click, a middle-click,
      // or a Cmd-Tab away mid-press would otherwise latch the grabbing cursor
      // permanently and page-wide, with no event left to clear it.
      if (e.button !== 0) return
      this.dragging = true
      this.surface.dataset.cursor = 'grabbing'
      this.hands?.set('grabbing')
    }
    this.onUp = () => {
      this.dragging = false
      this.surface.dataset.cursor = this.cell ? 'pointer' : 'grab'
      this.hands?.set(this.cell ? 'pointer' : 'grab')
    }
    // Focus is the keyboard's hover, and it already ships: the DOM index is 58
    // focusable anchors with the title and meta permanently beside each card.
    // The right move is to get out of the way rather than synthesise a fake
    // hover into the scene — a stale caption over the revealed list is the bug
    // this prevents.
    this.onFocusIn = () => this.select(null)

    addEventListener('pointermove', this.onMove)
    addEventListener('pointerdown', this.onDown)
    addEventListener('pointerup', this.onUp)
    addEventListener('pointercancel', this.onUp)
    addEventListener('blur', this.onUp)
    document.addEventListener('pointerleave', this.onLeave)
    document.querySelector('.world-grid')?.addEventListener('focusin', this.onFocusIn)
  }

  select(cell) {
    if (cell === this.cell) return

    this.cell = cell

    if (!this.dragging) {
      this.surface.dataset.cursor = cell ? 'pointer' : 'grab'
      this.hands?.set(cell ? 'pointer' : 'grab')
    }
  }

  update() {
    if (!this.enabled || !this.pointerInside) return

    const w = this.world
    // See the note above: neither matrix is fresh at this point in the frame.
    w.camera.updateMatrixWorld()
    w.scene.updateMatrixWorld(true)

    this.raycaster.setFromCamera(this.ndc, w.camera)
    const meshes = w.visible.map((c) => c.mesh)
    const hits = this.raycaster.intersectObjects(meshes, false)
    if (!hits.length) return this.select(null)

    const hit = hits[0].object
    this.select(w.visible.find((c) => c.mesh === hit) || null)
  }

  setEnabled(on) {
    this.enabled = on
    if (!on) this.select(null)
  }

  dispose() {
    removeEventListener('pointermove', this.onMove)
    removeEventListener('pointerdown', this.onDown)
    removeEventListener('pointerup', this.onUp)
    removeEventListener('pointercancel', this.onUp)
    removeEventListener('blur', this.onUp)
    document.removeEventListener('pointerleave', this.onLeave)
    document.querySelector('.world-grid')?.removeEventListener('focusin', this.onFocusIn)
    this.hands?.dispose()
    this.hands = null
    this.select(null)
    this.surface.remove()
  }
}
