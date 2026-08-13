// The degradation ladder.
//
// ---------------------------------------------------------------------------
// Gate on the window's COVERAGE, never on a sample count
//
// A "wait for N samples" floor makes the governor structurally blind at exactly
// the frame rates it exists for: 20 samples inside a 1500ms window needs 13.3
// fps just to start deciding, so the device that most needs demoting is the one
// it never demotes. The window is wall-clock, and it decides as soon as the
// samples it has SPAN enough of it.
//
// Trimmed mean, not raw: one 200ms hitch (a texture upload, a GC) should not
// move the tier, and one lucky fast frame should not undo a demotion.
//
// ---------------------------------------------------------------------------
// It does not own teardown
//
// Tier 0 IS the Lite state, and main.js already owns mount/unmount for the Lite
// toggle. A second teardown path is how a leak survives — and a governor tearing
// the scene down behind main.js's back leaves the Lite button describing a state
// that is no longer true, so its next press is a silent no-op. The governor
// calls back into main.js and lets it stay the single owner.

export const WINDOW_MS = 1500
export const COVERAGE = 0.6      // decide once samples span 60% of the window
export const TRIM = 0.2          // drop the fastest and slowest fifth
export const GRACE_MS = 900      // after mount or a tier change, measure nothing

// TUNE: thresholds are judgement, not measurement. Demote below, promote above,
// with a deliberate gap so a device sitting on a boundary cannot oscillate.
export const DEMOTE_BELOW = [0, 24, 34, 46] // fps under which tier N drops
export const PROMOTE_ABOVE = [0, 38, 50, 58] // fps over which tier N-1 climbs

export class Governor {
  constructor({ getWorld, onTierZero, onTier, root = document.documentElement }) {
    this.getWorld = getWorld
    this.onTierZero = onTierZero
    this.onTier = onTier
    this.root = root

    this.tier = 3
    this.samples = []
    this.pinned = false
    this.suspendedUntil = 0
    this.status = document.getElementById('world-status')

    const touch = matchMedia('(pointer: coarse)').matches
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    this.ceiling = reduced ? 0 : touch ? 1 : 3
    if (this.ceiling < this.tier) this.setTier(this.ceiling)
  }

  // The rig pins the ladder: a governor that demotes mid-suite nulls the world
  // under every later assertion and turns a real failure into a TypeError.
  pin(on = true) { this.pinned = on }

  sample(now, dt) {
    if (this.pinned || this.tier === 0) return
    // Grace excludes the samples, not merely the decision — measuring the
    // frames a mount or a tier change just disturbed is measuring the
    // disturbance.
    if (now < this.suspendedUntil) return

    this.samples.push([now, dt])
    const cutoff = now - WINDOW_MS
    while (this.samples.length && this.samples[0][0] < cutoff) this.samples.shift()

    const span = this.samples.length
      ? now - this.samples[0][0]
      : 0
    if (span < WINDOW_MS * COVERAGE) return

    this.decide(this.trimmedFps())
  }

  trimmedFps() {
    const dts = this.samples.map((s) => s[1]).sort((a, b) => a - b)
    const cut = Math.floor(dts.length * TRIM)
    const core = dts.slice(cut, dts.length - cut || undefined)
    const mean = core.reduce((a, b) => a + b, 0) / core.length
    return mean > 0 ? 1 / mean : 0
  }

  decide(fps) {
    const t = this.tier
    if (fps < DEMOTE_BELOW[t]) this.setTier(t - 1)
    else if (t < this.ceiling && fps > PROMOTE_ABOVE[t + 1]) this.setTier(t + 1)
  }

  setTier(next) {
    next = Math.max(0, Math.min(this.ceiling, next))
    if (next === this.tier) return
    this.tier = next
    this.samples.length = 0
    this.suspendedUntil = performance.now() + GRACE_MS
    this.apply()
    this.onTier?.(next)
  }

  apply() {
    const w = this.getWorld?.()
    if (this.tier === 0) {
      // main.js owns teardown; tier 0 is the Lite state under another name.
      this.announce('Simplified view — showing the full index instead.')
      this.onTierZero?.()
      return
    }
    if (!w || !w.post) return
    const p = w.post

    // Ordered by cost-per-unit-of-look-lost. MSAA is the most GPU for the least
    // visible difference on a field of axis-aligned cards, so it goes first.
    const samples = this.tier >= 3 ? 4 : 0
    for (const rt of [p.composer.renderTarget1, p.composer.renderTarget2]) {
      if (rt.samples !== samples) {
        rt.samples = samples
        rt.dispose() // freed, then reallocated at the new sample count
      }
    }

    // Below tier 2 the trail is disposed, not merely disabled: a disabled pass
    // still owns two viewport-sized HalfFloat targets.
    if (this.tier < 2 && !p.trail.retired) {
      p.trail.reset()
      p.trail.dispose()
      p.trail.retired = true
    }
    if (this.tier < 2) p.warp.enabled = false
  }

  announce(text) {
    if (this.status) this.status.textContent = text
  }

  reset() {
    this.samples.length = 0
    this.suspendedUntil = performance.now() + GRACE_MS
  }
}
