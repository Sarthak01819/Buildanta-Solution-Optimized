import * as K from '../../constants.js'

// Prev / next between projects while a card is open.
//
// ---------------------------------------------------------------------------
// "The next project" is the next CELL
//
// 58 projects live in 121 cells, and buildCells assigns
// `items[(row * 11 + col) % 58]` — so a cell's flat index IS its item index
// mod 58. The cell at flat index i+1 therefore always carries the next project,
// and in the wrapping field it sits one pitch (700 units) to the right.
//
// Verified against the real layout: **120 of 121 cells** have the next project
// on the very next cell. Only one seam case exists, because 121 is not a
// multiple of 58 and five cells are left over.
//
// So "next" is a small consistent hop rightward, not a flight — which is why
// this needs no separate curve. It reuses the measured open curve.
//
// ---------------------------------------------------------------------------
// The handover, and why the outgoing card is not simply released
//
// updateProximity writes mesh.position.z on every visible card but NEVER writes
// scale. A card released at scale 1.0 therefore has no second writer to bring it
// home and would stay oversized for the rest of the session. So the outgoing
// card moves into `retiring` — still owned, still written here — until it lands
// exactly on its authored scale and jitter.z, and only then is ownership dropped.

// The seam step is long. An exponential launches at lambda * distance, so
// reusing the open lambda over it would fling the camera at a speed nothing else
// in the build ever shows. Beyond a nominal one-cell step the clock stretches.
export const STEP_NOMINAL = Math.hypot(K.CELL + 2 * K.JITTER_XY, K.CELL + 2 * K.JITTER_XY)

export const stepLambda = (distance) =>
  distance <= STEP_NOMINAL
    ? K.OPEN_LAMBDA
    : Math.max(K.OPEN_LAMBDA / 2, K.OPEN_LAMBDA * Math.sqrt(STEP_NOMINAL / distance))

export class ProjectSteps {
  constructor({ world, open }) {
    this.world = world
    this.open = open
  }

  get itemCount() {
    return this.world.items.length
  }

  // The cell carrying project `index`, nearest to the camera.
  cellFor(index) {
    const cam = this.world.camera.position
    let best = null
    let bestD = Infinity
    for (const c of this.world.cells) {
      if (this.world.items.indexOf(c.item) !== index) continue
      const d = Math.hypot(
        c.group.position.x + c.jitter.x - cam.x,
        c.group.position.y + c.jitter.y - cam.y
      )
      if (d < bestD) { bestD = d; best = c }
    }
    return best
  }

  step(dir) {
    const o = this.open
    if (!o.open || !o.cell) return false

    const n = this.itemCount
    const from = this.world.items.indexOf(o.cell.item)
    if (from < 0) return false

    // Wrap in both directions. Never a hardcoded 58 — a longer manifest than the
    // grid would otherwise dead-end here.
    let next = null
    for (let hop = 1; hop <= n && !next; hop++) {
      const idx = (((from + dir * hop) % n) + n) % n
      next = this.cellFor(idx)
    }
    if (!next || next === o.cell) return false

    o.switchTo(next)
    return true
  }

  next() { return this.step(1) }
  prev() { return this.step(-1) }
}
