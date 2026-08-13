// The three hands.
//
// src: Round 1 — the reference carries three matcap hand MESHES in its scene
// (grab / grabbing / pointer) rather than a CSS cursor. We do not have its
// GLTFs and will not be lifting them, so these are drawn: a pixel bitmap
// rasterised to a canvas and handed out as a data URL.
//
// Drawn rather than shipped as files for the same reason everything else here
// is: the preview has to survive as ONE self-contained file with zero external
// requests, and a cursor that 404s is worse than no cursor.
//
// Two of the three are real CSS cursors over the world surface, because that is
// what a cursor is for — it must track the pointer with no frame of lag, and a
// DOM element chasing pointermove cannot promise that on a loaded main thread.
// The third (pointer) is also used as the artwork inside the prev/next controls
// in the open state, which is where the reference shows its hands.

// Only the SILHOUETTE is authored — `o` is hand, `.` is nothing. The black
// outline is generated (see outline() below).
//
// Hand-drawing the ink cells as well produced a hand that read as a dark blob
// beside the reference's: at 62px a 16-cell bitmap gives ~4px per cell, so
// every stray ink cell is a heavy 4px slab, and it is very easy to author one
// edge two cells thick without noticing. Deriving it guarantees exactly one
// cell of ink all the way round, which is what the reference has.

// Pointing RIGHT. Traced off the reference at 8x (captures/hand-ref.png):
// a thumb nub on top, the index finger running HORIZONTALLY out to the right as
// the topmost long element, and the folded fingers reading as a stepped comb
// down the right edge of the palm.
const POINTER = [
  '................',
  '................',
  '......oo........',
  '......ooo.......',
  '.....oooo.......',
  '.....ooooooooooo',
  '...ooooooooooooo',
  '..oooooooooo....',
  '..ooooooooooooo.',
  '..oooooooooo....',
  '..ooooooooooooo.',
  '..oooooooooo....',
  '..ooooooooooo...',
  '...oooooooooo...',
  '....oooooooo....',
  '................'
]

// Open hand, fingers up — "you may drag this".
const GRAB = [
  '................',
  '.....o.o.o......',
  '....oo.o.oo.....',
  '....ooooooo.....',
  '..o.ooooooo.....',
  '..oooooooooo....',
  '..oooooooooo....',
  '..oooooooooo....',
  '...ooooooooo....',
  '...oooooooo.....',
  '....oooooo......',
  '................',
  '................',
  '................',
  '................',
  '................'
]

// Closed fist — mid-drag.
const GRABBING = [
  '................',
  '................',
  '................',
  '.....ooooo......',
  '...ooooooooo....',
  '..ooooooooooo...',
  '..ooooooooooo...',
  '..ooooooooooo...',
  '..ooooooooooo...',
  '...ooooooooo....',
  '....ooooooo.....',
  '................',
  '................',
  '................',
  '................',
  '................'
]

// Any empty cell touching a filled one becomes ink. 8-connected, so diagonal
// steps get their corner too and the comb edge does not leak.
function outline(rows) {
  const h = rows.length
  const w = rows[0].length
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x])
  return rows.map((row, y) =>
    [...row].map((ch, x) => {
      if (ch === 'o') return 'o'
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (at(x + dx, y + dy) === 'o') return '#'
      return '.'
    }).join('')
  )
}

const SHAPES = {
  pointer: outline(POINTER),
  grab: outline(GRAB),
  grabbing: outline(GRABBING)
}

// A CSS cursor is capped at 128x128 in every browser that implements the spec,
// and is silently IGNORED past it — no warning, the arrow just stays. 16 * 4 is
// 64, which leaves headroom and still lands on whole pixels.
const SCALE = 4

export function drawHand(name, { scale = SCALE, flip = false } = {}) {
  const rows = SHAPES[name]
  if (!rows) throw new Error(`[cursor] unknown hand: ${name}`)
  const w = rows[0].length
  const h = rows.length
  const c = document.createElement('canvas')
  c.width = w * scale
  c.height = h * scale
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  if (flip) { g.translate(c.width, 0); g.scale(-1, 1) }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      if (ch === '.') continue
      // Ink first, fill on top — drawn as whole scaled blocks so the edges stay
      // hard. Antialiasing here would read as a blurry sticker, not pixel art.
      g.fillStyle = ch === '#' ? '#000' : '#fff'
      g.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  return c
}

export function handURL(name, opts) {
  return drawHand(name, opts).toDataURL('image/png')
}

// Hotspots, in bitmap cells, converted to device px by SCALE. The pointer's is
// the fingertip; the two grab states are centred on the palm.
const HOTSPOT = { pointer: [15, 8], grab: [6, 8], grabbing: [6, 8] }

export class Hands {
  constructor({ surface = document.body } = {}) {
    this.surface = surface
    this.url = {}
    for (const name of Object.keys(SHAPES)) {
      const [hx, hy] = HOTSPOT[name]
      this.url[name] = `url(${handURL(name)}) ${hx * SCALE} ${hy * SCALE}`
    }
    this.set('grab')
  }

  // `auto` is the required final fallback — a cursor value whose list has no
  // valid keyword at the end is invalid and the whole declaration is dropped,
  // which is how you end up with no cursor change at all and nothing in the
  // console to say why.
  set(name) {
    if (this.current === name) return
    this.current = name
    // setProperty with 'important', not style.cursor.
    //
    // Standalone a plain inline write is enough. Embedded it is not: the
    // Buildanta site ships `html, body, body * { cursor: none !important }` in
    // its head — it draws its own cursor — and a stylesheet !important beats a
    // plain inline value, so the hands were set and never shown. Inline PLUS
    // important is the one thing that wins, and it costs nothing standalone.
    this.surface.style.setProperty('cursor', `${this.url[name]}, auto`, 'important')
  }

  dispose() {
    this.surface.style.removeProperty('cursor')
  }
}
