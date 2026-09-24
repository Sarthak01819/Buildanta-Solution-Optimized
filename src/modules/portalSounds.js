/**
 * The TAP & HOLD wall's sound (D-093, 24 Sep 2026) — three client-supplied
 * pieces (originals in art-source/audio/), cut and softened for their jobs:
 *
 *  · portal-horizon.mp3  "Event Horizon" 0:05–0:35, seam cross-faded into a
 *    30 s loop. Rises as the hole shows through the burning bill, holds at the
 *    wall, leaves on ENTER (the finale score takes over there).
 *  (The hold's own "Collapse Tension" sound was removed at the client's
 *  request, 24 Sep.)
 *  · portal-bloom.mp3    "Portal Bloom" first 6 s, 3 s tail fade — once, on
 *    ENTER (the module's bh:enter event).
 */
import { createMeter } from "./audioMeter.js";
const HORIZON_VOLUME = 0.20;
const BLOOM_VOLUME = 0.40;

export function createPortalSounds({ getAmbience }) {
  let ctx = null, master = null, meter = null;
  const buffers = {};
  let horizon = null, quietSince = 0;
  const load = (name, url) => fetch(url).then((r) => r.arrayBuffer()).then((raw) => { buffers[name] = raw; }).catch(() => {});
  const loading = Promise.all([
    load("horizon", "/assets/portal-horizon.mp3"),
    load("bloom", "/assets/portal-bloom.mp3"),
  ]);

  const voice = (name, loop) => {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffers[name];
    src.loop = loop;
    g.gain.value = 0;
    src.connect(g).connect(master);
    src.start(0);
    return { src, g };
  };

  if (import.meta.env?.DEV) {
    window.__portalSounds = {
      get horizon() { return horizon ? +horizon.g.gain.value.toFixed(3) : 0; },
    };
  }
  addEventListener("bh:enter", () => {
    if (!ctx || !(buffers.bloom instanceof AudioBuffer)) return;
    const v = voice("bloom", false);
    v.g.gain.value = BLOOM_VOLUME;
  });

  return {
    async unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      meter = createMeter(ctx);
      master.connect(meter.node);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
      await loading;
      for (const k of Object.keys(buffers)) {
        try { buffers[k] = await ctx.decodeAudioData(buffers[k]); } catch { delete buffers[k]; }
      }
    },
    level() { return meter ? meter.level() : 0; },
    /** per frame */
    update(muted) {
      if (!ctx || !(buffers.horizon instanceof AudioBuffer)) return;
      master.gain.value = muted ? 0 : 1;
      const now = ctx.currentTime;
      // the horizon: ambience from the intro
      const target = getAmbience() * HORIZON_VOLUME;
      if (target > 0 && !horizon) horizon = voice("horizon", true);
      if (horizon) {
        horizon.g.gain.setTargetAtTime(target, now, target > horizon.g.gain.value ? 1.0 : 0.6);
        if (target === 0) {
          if (!quietSince) quietSince = performance.now();
          else if (performance.now() - quietSince > 3500) { try { horizon.src.stop(); } catch { /* */ } horizon = null; quietSince = 0; }
        } else quietSince = 0;
      }
    },
  };
}
