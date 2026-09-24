/**
 * The We code globe sound (D-085, 24 Sep 2026).
 *
 * "We code globe sound" (client-supplied), cut to 00:00–00:30 and looped
 * while the visitor is inside We code — from the title reveal (p .240) to the
 * We market handover (p .425). Its level is the SCROLL POSITION: 4 % at the
 * start rising evenly to 60 % at the end; stop scrolling and it holds, scroll
 * back and it falls. Each 30 s pass dips out over its last 2 s and rises in
 * over its first 2 s. While it plays, the -100 BZ score ducks to 20 %.
 */
import { createMeter } from "./audioMeter.js";
const SRC = "/assets/wecode-globe.mp3";   // already trimmed to 30 s
export const WECODE_P0 = 0.240;
export const WECODE_P1 = 0.425;
const MIN_VOLUME = 0.04;
const MAX_VOLUME = 0.60;   // client, 24 Sep: 60 %
const LOOP_FADE = 2;
const LEAVE = 1.2;

export function createWeCodeSound() {
  let ctx = null, level = null, master = null, buffer = null;
  let playing = false, cycle = null, nextTimer = 0, muted = false, meter = null;
  const loading = fetch(SRC).then((r) => r.arrayBuffer()).catch(() => null);

  function startCycle(at) {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.connect(g).connect(level);
    const len = buffer.duration;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + LOOP_FADE);
    g.gain.setValueAtTime(1, at + len - LOOP_FADE);
    g.gain.linearRampToValueAtTime(0.0001, at + len);
    src.start(at);
    src.stop(at + len);
    cycle = { src, g };
    nextTimer = setTimeout(() => { if (playing) startCycle(at + len); },
      Math.max(0, (at + len - ctx.currentTime - 1) * 1000));
  }
  function play() {
    if (playing || !buffer) return;
    playing = true;
    startCycle(ctx.currentTime + 0.05);
  }
  function stop() {
    if (!playing) return;
    playing = false;
    clearTimeout(nextTimer);
    const c = cycle; cycle = null;
    if (!c) return;
    const now = ctx.currentTime;
    c.g.gain.cancelScheduledValues(now);
    c.g.gain.setValueAtTime(c.g.gain.value, now);
    c.g.gain.linearRampToValueAtTime(0.0001, now + LEAVE);
    try { c.src.stop(now + LEAVE + 0.05); } catch { /* already stopped */ }
  }

  return {
    /** inside the loader's ENTER click */
    async unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      level = ctx.createGain();      // scroll-driven 4 % → 50 %
      master = ctx.createGain();     // the Sound button
      level.gain.value = MIN_VOLUME;
      master.gain.value = muted ? 0 : 1;
      meter = createMeter(ctx);
      level.connect(master).connect(meter.node);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
      const raw = await loading;
      if (!raw) return;
      try { buffer = await ctx.decodeAudioData(raw); } catch { /* no sound */ }
    },
    level() { return meter ? meter.level() : 0; },
    /** per frame: the intro's timeline progress p, and the Sound button */
    update(p, isMuted) {
      const inside = p >= WECODE_P0 && p <= WECODE_P1;
      if (!ctx) return inside;
      if (isMuted !== muted) {
        muted = isMuted;
        master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.12);
      }
      if (inside) {
        const k = (p - WECODE_P0) / (WECODE_P1 - WECODE_P0);
        level.gain.setTargetAtTime(MIN_VOLUME + (MAX_VOLUME - MIN_VOLUME) * k, ctx.currentTime, 0.1);
        play();
      } else stop();
      return inside;
    },
  };
}
