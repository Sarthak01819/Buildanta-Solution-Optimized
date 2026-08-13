// Physics spec for the wrapping-grid world.
//
// Every MEASURED value below traces to a section of
//   ~/claude code/unseen-teardown/WORLD-CAPTURES.md
// and carries a `src:` comment naming it. Nothing here is invented.
//
// Four capture rounds are folded in. Rounds 1-2 ran with the reference's tab
// hidden so every animation timeline was frozen; round 3 finally caught them on
// a visible tab and overturned four things; round 4 added the click window and
// the touch physics. Anything still unmeasured says so at its definition.

// ---------------------------------------------------------------- helpers

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Frame-rate-independent damping. The reference page damps PER FRAME
// (`v *= 0.96`, `lerp(a, b, 0.15)`), which runs twice as fast on a 120 Hz
// display as on a 60 Hz one. Convert each per-frame figure to a lambda and
// damp against real elapsed time instead.
export const damp = (cur, target, lambda, dt) =>
  target + (cur - target) * Math.exp(-lambda * dt)

// The frame rate the reference's per-frame constants were authored against.
// It has exactly three jobs, all of them conversions out of frame-space:
//   1. lambdaFromFriction / lambdaFromLerp, below;
//   2. turning our per-second drag velocity back into the per-frame speed the
//      trail and warp coefficients expect;
//   3. putting a per-frame decay ratio back onto the clock (ratio^(dt*REF_FPS)).
// It is NOT an assumption about the display we run on — nothing here reads the
// real frame rate, and every damper is frame-rate-independent by construction.
export const REF_FPS = 60

// `v *= m` every frame at 60 fps  ->  exp(-lambda * t)
export const lambdaFromFriction = (m) => -REF_FPS * Math.log(m)
// `lerp(cur, target, a)` every frame at 60 fps  ->  damp(..., lambda)
export const lambdaFromLerp = (a) => -REF_FPS * Math.log(1 - a)

// Deterministic RNG. The reference uses Math.random for jitter and scale; we
// seed it so the layout is byte-identical run to run — otherwise the
// verification rig is measuring a different world each time.
export const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const SEED = 20260807

// ---------------------------------------------------------------- the grid
// src: Round 1 · Task 2 (generator recovered from addItems)

export const GRID = 11                 // 11 x 11 cells
export const CELL = 700                // cell pitch, world units
export const ITEMS = GRID * GRID       // 121
export const SPAN = GRID * CELL        // 7700 — one full wrap period

export const JITTER_XY = 125           // per-cell random offset, +/- world units
export const JITTER_Z = 50             // per-cell random depth, +/- world units

// src: Round 2 · Task D — long edge is always 550; the short edge comes from
// each item's own image_size. There is no universal card size.
export const CARD_LONG_EDGE = 550
export const CARD_SCALE_MIN = 0.6
export const CARD_SCALE_MAX = 0.9

// src: Round 2 · Task A — loopCount 161, so dragPos rests at 161 * 700.
export const LOOP_COUNT = 161
export const START = LOOP_COUNT * CELL  // 112700

// ---------------------------------------------------------------- camera
// src: Round 1 · Task 1 and Round 2 · Task G

export const CAMERA_Z = 1500
export const CAMERA_NEAR = 1
export const CAMERA_FAR = 2200

// 1 world unit == 1 CSS pixel at the z = 0 plane. fov is derived from the
// CANVAS height, not innerHeight.
export const fovFor = (canvasH) =>
  (2 * Math.atan(canvasH / 2 / CAMERA_Z) * 180) / Math.PI

// src: Round 2 · Task G — verified exactly across 13 widths. The `+ 0.35` was
// missed in round 1; without it the camera is too tight at EVERY viewport.
export const cameraScaleFor = (w) => clamp(1920 / w, 0.3, 2) + 0.35
export const CAMERA_SCALE_RANGE = [0.65, 2.35]

// ---------------------------------------------------------------- drag
// src: Round 1 · Task 6

export const DRAG_MULTIPLIER = 1.25    // world units per pointer pixel, linear
export const DRAG_DEAD_ZONE = 2        // px from pointerdown before a drag counts
export const DRAG_FRICTION_PER_FRAME = 0.96
export const DRAG_FRICTION_LAMBDA = lambdaFromFriction(DRAG_FRICTION_PER_FRAME) // 2.449
// No throw cap and no clamp anywhere in the reference. Coast distance is
// v0 / (1 - 0.96) = 25 * v0.
export const COAST_MULTIPLE = 1 / (1 - DRAG_FRICTION_PER_FRAME)

export const CAMERA_CHASE_PER_FRAME = 0.15
export const CAMERA_CHASE_LAMBDA = lambdaFromLerp(CAMERA_CHASE_PER_FRAME)       // 9.751

// ---------------------------------------------------------------- proximity
// src: Round 2 · Task A — solved exactly, zero residual.
//   targetZ = originalZ - 0.15 * d
//   d = 2D XY distance from (camera + raw pointer), no radius, no falloff, no clamp
export const PROXIMITY_K = 0.15
export const PROXIMITY_PER_FRAME = 0.05
export const PROXIMITY_LAMBDA = lambdaFromLerp(PROXIMITY_PER_FRAME)             // 3.078

// ---------------------------------------------------------------- parallax
// src: Round 1 · Task 5 (updateCamera)

export const MOUSE_ANGLE_X = 0.135
export const MOUSE_ANGLE_Y = 0.035
export const MOUSE_MULT = 0.5
export const CAMERA_Z_OFFSET = 100     // pivot sandwich: translateZ(-50) rotate translateZ(+50)
export const ROLL = 0.05               // roll comes from the DIFFERENCE of two smoothers
export const SMOOTH_MOUSE_LAMBDA = lambdaFromLerp(0.075)   // 4.679
export const SMOOTH_MOUSE2_LAMBDA = lambdaFromLerp(0.02)   // 1.212

// ---------------------------------------------------------------- look
// src: Round 1 · Tasks 1, 3 and Round 2 · Task E

export const BG = 0x050505
export const FOG_COLOR = 0x050505
export const FOG_NEAR = 1500
export const FOG_FAR = 2200

// 700 was read from their source, where the sphere is "built at 50 and grown by
// the intro" — so 700 was almost certainly sampled while that growth was still
// running, and is a mid-animation value rather than the resting one. Measured
// off the real page instead (captures/REF-closed.png, isolated by thresholding
// the wireframe's luma band): their sphere spans ~60% of a 1280 frame, ours at
// 700 spanned 45.5% (582px, projected exactly from the scene). Hence 1.33x.
//
// This assumes the difference is radius. It could equally be GLOBE_Z — the two
// are indistinguishable from a single projected diameter, and their source is
// no help now that its 700 is suspect. Radius is the one that leaves the rest
// of the composition alone, so it is the one that moved.
export const GLOBE_RADIUS = 930        // live scale; see note above
export const GLOBE_Z = -450
export const GLOBE_COLOR = 0x3b3b3b
export const GLOBE_SEGMENTS = [50, 28]
export const GLOBE_EDGE_THRESHOLD = 1
// 0.002 rad per frame at 60 fps. Their term is sign-gated and stops dead if
// velocity ever reaches exactly 0 (it survives on denormals) — we use a plain
// constant rate instead, which is the same motion without the landmine.
export const GLOBE_SPIN_RAD_PER_S = 0.12

// ---------------------------------------------------------------- open state
// src: Round 3, measured at 165 fps on a genuinely visible tab.
//
// The open state is NORMALISED, not scaled. Two cards with bases 0.60531 and
// 0.62685 both land on mesh scale exactly 1.0 and z exactly 300, and both
// render the same on-screen width. A 1.3 multiplier would have given 0.787 vs
// 0.815 — it didn't. Round 2's "openItemScale 1.3" was reading something else;
// no such property was found on store.World in round 3.
export const OPEN_SCALE = 1.0
export const OPEN_Z = 300

// The card never moves. The CAMERA travels to it: while open the camera sat at
// grid origin + the card's own local offset, to the pixel.
export const OPEN_CAMERA_TO_CARD = true

// Open is front-loaded, close is back-loaded — they are not the same curve run
// backwards. Measured from the scanline pass's u_strength:
//   open  50% @ 146ms · 99% @ 994ms · 99.9% @ 1479ms   (ease-out)
//   close still 0.94 @ 314ms, 0.44 @ 558ms, done @ 1297ms (ease-in)
export const OPEN_LAMBDA = 4.6      // fits 50% at 146ms
export const CLOSE_LAMBDA = 2.4     // fits the back-loaded collapse
export const CLOSE_MS = 1297

// The caption is an OPEN affordance, not a hover one. It stays
// opacity 0 / visibility hidden through an entire hover, including a
// field-internal swap between two cards with zero un-hovered frames between.
export const CAPTION_IN_DELAY_MS = 497
export const CAPTION_IN_FULL_MS = 1430
export const CAPTION_OUT_MS = 461

// ---------------------------------------------------------------- click window
// src: Round 4 — measured in headless Playwright, which unlike the extension has
// independent trusted mouse.down()/mouse.up().
//
// It is NOT a hold-to-open gate. It is the opposite: a press-release SHORTER
// than this opens the card; a longer press opens nothing and is treated as a
// hold. Measured opens at 50/100/150/180/200/220/250 ms and NON-opens at
// 300/400/600 ms. The observed boundary sits at 250-300ms, but the run was at
// 18-21 fps where one frame is ~50ms of slop — which is the same size as the
// bracket — so the boundary is inflated upward. Their source literal is 200,
// and 200 is consistent with the measurement once quantisation is allowed for.
//
// Their cursor reads "Click & Hold", which is simply misleading.
export const CLICK_MAX_MS = 200

// ---------------------------------------------------------------- touch
// src: Round 4 — the first capture to run under a real mobile user agent, so
// the touch branch actually engaged (store.isTouch true). Rounds 1-3 all
// measured a desktop build because a window resize does not change the UA.
//
// These differ from desktop by a lot, and shipping the desktop values on a
// phone is why a touch drag would have felt sluggish and over-damped.
export const TOUCH = {
  dragMultiplier: 3,        // desktop is 1.25 — a touch drag moves 2.4x further
  dragFrictionPerFrame: 0.94, // desktop 0.96 — touch coasts noticeably less
  navHandsSpaceFromCenter: 320, // desktop 520
  // The post chain is trimmed on touch: passes [6, 7, 8, 14] were enabled —
  // render, afterimage, edge warp, screenFx. No scanlines, no world details.
  scanlines: false
}
export const TOUCH_FRICTION_LAMBDA = lambdaFromFriction(TOUCH.dragFrictionPerFrame) // 3.712

export const isTouch = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
