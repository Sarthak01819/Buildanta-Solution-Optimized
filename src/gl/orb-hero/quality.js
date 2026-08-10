import { QUALITY } from './params.js';

/**
 * Adaptive quality. Measures real framerate after load and steps ONE shared
 * pixel ratio down a ladder — applied to renderer AND composer together, or the
 * two disagree and you render at one size and present at another.
 *
 * Deliberately NOT copied from the reference: their GPU-name blacklist
 * (`renderer string contains "Intel" and "Plus"`). It misfires on Arc, and
 * WEBGL_debug_renderer_info is increasingly restricted. The FPS sampler
 * measures the thing we actually care about.
 */
export class Quality {
  constructor(onChange) {
    this.onChange = onChange;
    this.forceHq = new URLSearchParams(location.search).has('forcehq');
    this.frames = 0;
    this.checks = 0;
    this.samples = [];
    this.tier = QUALITY.dprLadder.length - 1; // start optimistic
    this.timer = null;
    this.lastMark = performance.now();
    this.settled = false;
  }

  /** Ceiling on real device pixels. Read LIVE (never captured once at boot) and
   *  clamped: caps worst-case fragment cost at 4×, not 9×. */
  get pixelRatio() {
    /* ── PHONES RENDER AT 1x, DESKTOP IS UNTOUCHED ──
       Measured on a 390x844 iPhone viewport: the canvas is 390x844, but the
       post chain was running at 1.5x on top of it — two 585x1266 buffers alone
       are 11.3 MB, inside an orb costing 29.1 MB of the phone's 42.5 MB total.
       At 1x those two become 5.0 MB and every bloom mip shrinks with them.

       Yash's instruction, when told the site crashes on his phone: "a crash
       beats any quality rule" on phones, desktop full quality. This is that
       rule, applied to the single largest allocation left. It is gated on a
       coarse pointer, so a mouse never reaches it.

       ⚠️ Deliberately NOT dprCap: this caps the LADDER too, so the adaptive
       system cannot walk back up to 1.5 a few seconds after load and undo it. */
    const coarse = typeof matchMedia === 'function'
      && matchMedia('(pointer: coarse)').matches;
    const cap = coarse ? 1 : QUALITY.dprCap;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    if (this.forceHq) return dpr;
    return Math.min(dpr, QUALITY.dprLadder[this.tier], cap);
  }

  start() {
    if (this.forceHq) {
      this.settled = true;
      return;
    }
    this.timer = setInterval(() => this._tick(), QUALITY.checkIntervalMs);
  }

  frame() {
    this.frames++;
  }

  _tick() {
    const now = performance.now();
    const elapsed = now - this.lastMark;
    const frames = this.frames;
    this.frames = 0;
    this.lastMark = now;

    // A backgrounded tab hands you 0 fps and would permanently downgrade a
    // perfectly capable machine. Skip the window entirely, don't score it.
    if (document.visibilityState !== 'visible') return;
    if (elapsed <= 0) return;

    this.samples.push((frames * 1000) / elapsed);
    this.checks++;

    if (this.checks >= QUALITY.decideAfterChecks) this._decide();
    if (this.checks >= QUALITY.totalCheckLimit) this.stop();
  }

  _decide() {
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    // gpuTier = how many thresholds the measured average clears.
    const gpuTier = QUALITY.fpsThresholds.filter((t) => t <= avg).length; // 0..4
    const tier = gpuTier >= 4 ? 2 : gpuTier >= 2 ? 1 : 0;
    this.settled = true;
    if (tier !== this.tier) {
      this.tier = tier;
      this.onChange?.(this.pixelRatio, { avg, gpuTier });
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.settled = true;
  }
}
