/**
 * The reel's landing sound (D-088, 24 Sep 2026).
 *
 * "reelscrollaudio" (client-supplied), cut to 00:05.538–00:06.5 (leading
 * silence trimmed), plays each
 * time a plate LANDS in the camera reel's gate — SEO, AEO … IoT — scrolling
 * forwards or back. A new landing cuts the last one dead and restarts — no
 * fades anywhere (client, 24 Sep).
 * Silent before SEO arrives and after IoT lands.
 */
import { createMeter } from "./audioMeter.js";
/* WAV, not MP3: an MP3 decode carries encoder priming (tens of ms of
   silence up front) and the cut is trimmed to the first transient (5.538 s, measured onset),
   so the sound starts on the very frame the plate arrives. */
const SRC = "/assets/reel-tick.wav";
const VOLUME = 0.10;   // client, 24 Sep: 10 %
/* D-089: fast scroll fast-forwards the clip, tape-style (pitch rises with it),
   live while it plays. Lenis velocity is px per frame: a calm wheel/trackpad
   scroll stays under CALM_V (1×); FAST_V and above plays at MAX_RATE. */
const CALM_V = 25;
const FAST_V = 110;
const MAX_RATE = 2;

export function createReelTickSound() {
  let ctx = null, master = null, buffer = null, current = null, meter = null;
  let last;                            // last plate that played
  let rate = 1;
  let lastPos, lastT = 0, posRate = 0;   // plates per second (D-096)
  const loading = fetch(SRC).then((r) => r.arrayBuffer()).catch(() => null);

  function fire() {
    if (!buffer) return;
    // hard cut, no fade (client, 24 Sep): the new hit owns the frame
    if (current) try { current.src.stop(0); } catch { /* ended */ }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    g.gain.value = VOLUME;
    src.connect(g).connect(master);
    src.start(0);                      // now — no scheduling offset
    current = { src, g };
  }

  return {
    async unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: "interactive" });
      master = ctx.createGain();
      meter = createMeter(ctx);
      master.connect(meter.node);
      const raw = await loading;
      if (raw) try { buffer = await ctx.decodeAudioData(raw); } catch { /* none */ }
    },
    level() { return meter ? meter.level() : 0; },
    /** per frame: the plate parked in the gate (intro.reelLanded) + mute */
    update(landed, muted, velocity = 0, pos, slots = 8) {
      if (!ctx) return;
      /* D-096: PREDICT the landing. The plate and the sound ride the same
         scroll number, but what reaches the ear is late by the device's output
         latency (+ this frame). So project the plate position that far ahead
         from its current speed and use the landing rule there: the hit is
         started early by exactly the delay it will suffer, and lands on the
         frame the plate does. */
      const nowMs = performance.now();
      if (pos !== undefined && lastPos !== undefined) {
        const dt = Math.max(1, nowMs - lastT) / 1000;
        posRate = posRate * 0.6 + ((pos - lastPos) / dt) * 0.4;
      } else posRate = 0;
      lastPos = pos; lastT = nowMs;
      if (pos !== undefined) {
        const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + 1 / 60;
        const ahead = Math.min(slots, Math.max(0, pos + posRate * lat));
        const idx = Math.floor(ahead), frac = ahead - idx;
        const predicted = frac < 0.36 ? idx : frac >= 0.50 ? Math.min(slots, idx + 1) : null;
        // the prediction may only fire EARLIER than the real rule, never differ
        // in which plate: accept it when it names the next plate in the travel
        if (predicted !== null && predicted !== last) landed = predicted;
      }
      master.gain.value = muted ? 0 : 1;
      const k = Math.min(1, Math.max(0, (Math.abs(velocity) - CALM_V) / (FAST_V - CALM_V)));
      rate = 1 + (MAX_RATE - 1) * k;
      if (current) current.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.03);
      if (landed === undefined) { last = undefined; return; }   // outside the reel
      if (landed === null || landed === last) return;           // sliding / same plate
      last = landed;
      fire();
    },
  };
}
