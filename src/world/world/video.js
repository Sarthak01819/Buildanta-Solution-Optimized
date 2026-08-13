import * as THREE from 'three'

// Video cards, on a fixed number of lanes.
//
// 15 of the 58 items are video. Decoding 15 streams at once is the single
// easiest way to make this page unusable on the phones we actually target, and
// it is wasted work regardless — only ~13 cells are on screen at all, and most
// of those are at the edge of the frame. So a small pool of lanes follows the
// centre of the view, and everything else keeps its placeholder still.
//
// Lanes are REUSED, never recreated. A <video> element per card would leak
// decoders on every wrap, and the wrap runs forever by design.

// TUNE: 4 lanes. Chosen, not measured — the reference's own concurrency was
// never observable (all its video textures were dormant behind a frozen rAF).
// Four covers the centre of a 1440x820 frame with one spare; raise it only with
// a frame-time measurement on a real budget device, never on a MacBook.
export const LANES = 4

export class VideoPool {
  constructor({ lanes = LANES } = {}) {
    this.lanes = Array.from({ length: lanes }, () => ({
      el: null,
      texture: null,
      cell: null
    }))
    this.enabled = true
    // Instrumentation, not decoration: the pool's whole purpose is that it
    // NEVER creates more than `lanes` elements. Counting them is the only way
    // to assert that — `lanes.filter(...).length <= lanes.length` is true of any
    // fixed-length array and proves nothing.
    this.created = 0
  }

  makeElement() {
    this.created++
    const el = document.createElement('video')
    // All four are required for autoplay to be allowed at all — muted and
    // playsInline especially, or iOS refuses and the card sits on its first
    // frame with no error anywhere.
    el.muted = true
    el.defaultMuted = true
    el.loop = true
    el.playsInline = true
    el.preload = 'auto'
    el.setAttribute('muted', '')
    el.setAttribute('playsinline', '')
    return el
  }

  // Called after checkVisibility, with the cells currently on screen.
  update(visible, camera) {
    if (!this.enabled) return

    const wanted = visible
      .filter((c) => c.item.type === 'video' && c.item.file)
      .map((c) => ({
        c,
        d: Math.hypot(
          c.group.position.x + c.jitter.x - camera.position.x,
          c.group.position.y + c.jitter.y - camera.position.y
        )
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lanes.length)
      .map((o) => o.c)

    // Release lanes whose card left the shortlist.
    for (const lane of this.lanes) {
      if (lane.cell && !wanted.includes(lane.cell)) this.release(lane)
    }

    // Fill free lanes with unassigned cards.
    for (const cell of wanted) {
      if (this.lanes.some((l) => l.cell === cell)) continue
      const lane = this.lanes.find((l) => !l.cell)
      if (!lane) break
      this.assign(lane, cell)
    }
  }

  assign(lane, cell) {
    if (!lane.el) lane.el = this.makeElement()
    lane.cell = cell
    // Every assignment gets a generation. release() calls pause(), which makes
    // any still-pending play() reject with AbortError — so the catch below
    // fires for a lane that has since been released AND possibly reassigned to
    // another card. Without this it would revert the NEW card to its still and
    // log a false "autoplay refused".
    const generation = (lane.generation = (lane.generation || 0) + 1)
    lane.el.src = cell.item.file

    const tex = new THREE.VideoTexture(lane.el)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    lane.texture = tex

    cell.placeholderMap = cell.mesh.material.map
    cell.mesh.material.map = tex
    cell.mesh.material.needsUpdate = true

    // Autoplay can still be refused (a policy, a low-power mode). Falling back
    // to the still is correct and silent-ish; throwing is not.
    lane.el.play().catch(() => {
      if (lane.generation !== generation) return // superseded, not refused
      console.warn(`[world] autoplay refused for ${cell.item.file}, keeping the still`)
      this.release(lane)
    })
  }

  release(lane) {
    const cell = lane.cell
    if (cell) {
      // Back to the placeholder that was already built for this card — never
      // dispose it, it is the thing we return to on every wrap.
      cell.mesh.material.map = cell.placeholderMap
      cell.mesh.material.needsUpdate = true
    }
    lane.cell = null
    lane.texture?.dispose()
    lane.texture = null
    if (lane.el) {
      lane.el.pause()
      // Detach the source or the decoder stays alive behind a paused element.
      lane.el.removeAttribute('src')
      lane.el.load()
    }
  }

  setEnabled(on) {
    this.enabled = on
    if (!on) for (const lane of this.lanes) this.release(lane)
  }

  get playing() {
    return this.lanes.filter((l) => l.cell).length
  }

  dispose() {
    for (const lane of this.lanes) {
      this.release(lane)
      lane.el = null
    }
  }
}
