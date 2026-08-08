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
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.dprCap);
    if (this.forceHq) return dpr;
    return Math.min(dpr, QUALITY.dprLadder[this.tier]);
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
