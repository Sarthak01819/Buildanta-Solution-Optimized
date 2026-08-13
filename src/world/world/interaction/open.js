import * as K from '../../constants.js'
import { stepLambda } from './step.js'

// Opening a card, and stepping between projects while open.
//
// ---------------------------------------------------------------------------
// What round 3 corrected, measured at 165 fps on a genuinely visible tab
//
//   * The open state is NORMALISED, not scaled. Every card lands on mesh scale
//     exactly 1.0 and z exactly 300 whatever its 0.6-0.9 base.
//   * The card does not move. The CAMERA travels to it.
//   * Open and close are OPPOSITE curves: open front-loaded (50% at 146ms),
//     close back-loaded (0.94 at 314ms, 0.44 at 558ms, done at 1297ms).
//
// Round 4: a CLICK opens; a press longer than the click window does not.
//
// ---------------------------------------------------------------------------
// One owner for mesh.scale and mesh.position.z
//
// updateProximity writes z on every visible card every frame but NEVER writes
// scale. So a card handed back at scale 1.0 has no second writer to bring it
// home. Stepping therefore moves the outgoing card into `retiring`, where it
// stays owned and written here until it lands EXACTLY on its authored values.
// `retiring` and `cell` are disjoint by construction — take() splices the
// incoming cell out of the list first — so no cell is ever written twice in a
// frame, and none is ever written by nobody.

export class OpenCard {
  constructor({ world, hover, scanlines, details, now = () => performance.now() }) {
    this.world = world
    this.hover = hover
    this.scanlines = scanlines
    this.details = details
    this.now = now

    this.cell = null
    this.open = false
    this.amount = 0
    this.pressCell = null
    this.retiring = []
    this.lambda = K.OPEN_LAMBDA

    this.bind()
  }

  bind() {
    // The gesture is measured HERE, not read off the world's drag state:
    // world.dragMoved is only reset by world.pointerDown, so any other caller
    // reads a stale value from the last drag.
    this.onMove = (e) => { this.px = e.clientX; this.py = e.clientY }
    this.onDown = (e) => {
      if (e.button !== 0) return
      // The pointer must be on the field, not on a control sitting over it.
      // e.target is absent only for a direct programmatic call (the rig does
      // this); every real or dispatched event carries one.
      if (e.target && this.hover.surface && e.target !== this.hover.surface) return
      if (this.open) return
      const cell = this.hover.cell
      if (!cell) return
      this.pressCell = cell
      this.pressedAt = this.now()
      this.downX = this.px = e.clientX ?? 0
      this.downY = this.py = e.clientY ?? 0
      this.take(cell)
    }
    this.onUp = () => {
      const cell = this.pressCell
      this.pressCell = null
      if (!cell || this.open) return
      // src: Round 4 — a click opens, a long press does not.
      const travelled = Math.hypot(this.px - this.downX, this.py - this.downY)
      const held = this.now() - this.pressedAt
      if (travelled > K.DRAG_DEAD_ZONE || held > K.CLICK_MAX_MS) this.retire()
      else this.commit()
    }
    this.onKey = (e) => {
      if (!this.open) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // preventDefault via optional call: this handler is also driven directly
      // by the verification rig with a plain object.
      if (e.key === 'Escape') { e.preventDefault?.(); this.close() }
      else if (e.key === 'ArrowRight') { e.preventDefault?.(); this.steps?.next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault?.(); this.steps?.prev() }
    }

    addEventListener('pointermove', this.onMove)
    addEventListener('pointerdown', this.onDown)
    addEventListener('pointerup', this.onUp)
    addEventListener('pointercancel', this.onUp)
    addEventListener('blur', this.onUp)
    addEventListener('keydown', this.onKey)
  }

  // The only function that changes ownership.
  take(cell) {
    if (cell === this.cell) return
    // Reviving a card that is still shrinking keeps its current amount rather
    // than snapping it to its authored scale and regrowing — that snap is the
    // half-scale pop rapid stepping would otherwise show.
    const revived = this.retiring.findIndex((r) => r.cell === cell)
    let amount = 0
    if (revived !== -1) {
      amount = this.retiring[revived].amount
      this.retiring.splice(revived, 1)
    }
    if (this.cell) this.retire()
    this.cell = cell
    cell.owned = true
    this.baseScale = cell.baseScale
    this.amount = amount
  }

  // Hand the current card to the retiring list — still owned, still written.
  retire() {
    if (!this.cell) return
    this.retiring.push({ cell: this.cell, baseScale: this.baseScale, amount: this.amount })
    this.cell = null
    this.amount = 0
  }

  commit() {
    if (!this.cell || this.open) return
    this.open = true
    this.world.itemOpen = true // measured: itemOpen gates the drag handler
    this.lambda = K.OPEN_LAMBDA
    this.aimAtCell(this.cell)
    this.hover.setEnabled(false)
    this.scanlines?.setItem(this.cell.item, this.cell)
    this.details?.show(this.cell.item)
    // Focus does NOT move into the DOM index: that fires
    // .world-grid:focus-within and un-clips the whole 58-item list as an opaque
    // layer over the scene. The open state has its own controls.
    this.returnFocus = document.activeElement
    document.documentElement.classList.add('world-open')
    this.details?.focusFirst()
  }

  // Step to another card without closing.
  switchTo(cell) {
    if (!this.open || !cell || cell === this.cell) return
    this.take(cell)
    this.aimAtCell(cell)
    this.scanlines?.setItem(cell.item, cell)
    this.details?.show(cell.item)
  }

  // openTarget is ACCUMULATED from the wrapped delta, never re-read from
  // group.position: updatePositions places each cell at the copy nearest the
  // CAMERA, so a held arrow key that outruns the flight would otherwise make a
  // position-derived target jump a whole span.
  aimAtCell(cell) {
    const x = cell.group.position.x + cell.jitter.x
    const y = cell.group.position.y + cell.jitter.y
    const t = this.world.openTarget
    if (!t) {
      this.world.openTarget = { x, y }
      this.lambda = K.OPEN_LAMBDA
      this.world.openLambda = K.OPEN_LAMBDA
      return
    }
    let dx = x - t.x
    let dy = y - t.y
    dx -= Math.round(dx / K.SPAN) * K.SPAN
    dy -= Math.round(dy / K.SPAN) * K.SPAN
    t.x += dx
    t.y += dy
    // Carry dragPos too, or closing after N steps rubber-bands the camera all
    // the way back at the much faster drag-chase lambda.
    this.world.dragPos.x += dx
    this.world.dragPos.y += dy
    this.lambda = stepLambda(Math.hypot(dx, dy))
    this.world.openLambda = this.lambda
  }

  close() {
    if (!this.open) return
    this.open = false
    this.world.itemOpen = false
    this.world.openTarget = null
    this.lambda = K.OPEN_LAMBDA
    this.hover.setEnabled(true)
    this.scanlines?.setItem(null, null)
    this.details?.hide()
    document.documentElement.classList.remove('world-open')
    this.retire()

    const back = this.returnFocus
    this.returnFocus = null
    if (back && back.isConnected && back !== document.body && back.focus) back.focus()
    else if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur()
    }
  }

  update(dt) {
    if (!(dt > 0)) return

    // Retiring cards land exactly, then hand ownership back. Done BEFORE the
    // active card so a revive in the same frame cannot double-write.
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const r = this.retiring[i]
      r.amount = K.damp(r.amount, 0, K.CLOSE_LAMBDA, dt)
      if (r.amount < 0.001) {
        r.cell.mesh.scale.set(r.baseScale, r.baseScale, 1)
        r.cell.mesh.position.z = r.cell.jitter.z
        r.cell.owned = false
        this.retiring.splice(i, 1)
        continue
      }
      this.applyTo(r.cell, r.baseScale, r.amount)
    }

    if (!this.cell) return

    // Not while a press is in flight: a card is taken on pointerdown and
    // `amount` starts at 0, so without this the very next frame reads "settled
    // closed" and the pointerup finds nothing to open.
    if (!this.open && !this.pressCell && this.amount < 0.001) {
      this.cell.mesh.scale.set(this.baseScale, this.baseScale, 1)
      this.cell.mesh.position.z = this.cell.jitter.z
      this.cell.owned = false
      this.cell = null
      this.amount = 0
      return
    }

    this.amount = K.damp(this.amount, this.open ? 1 : 0, this.open ? K.OPEN_LAMBDA : K.CLOSE_LAMBDA, dt)
    this.applyTo(this.cell, this.baseScale, this.amount)
  }

  applyTo(cell, base, amount) {
    const s = base + (K.OPEN_SCALE - base) * amount
    cell.mesh.scale.set(s, s, 1)
    cell.mesh.position.z = cell.jitter.z + (K.OPEN_Z - cell.jitter.z) * amount
  }

  dispose() {
    removeEventListener('pointermove', this.onMove)
    removeEventListener('pointerdown', this.onDown)
    removeEventListener('pointerup', this.onUp)
    removeEventListener('pointercancel', this.onUp)
    removeEventListener('blur', this.onUp)
    removeEventListener('keydown', this.onKey)
    this.close()
    for (const r of this.retiring) {
      r.cell.mesh.scale.set(r.baseScale, r.baseScale, 1)
      r.cell.mesh.position.z = r.cell.jitter.z
      r.cell.owned = false
    }
    this.retiring.length = 0
    if (this.cell) { this.cell.owned = false; this.cell = null }
  }
}
