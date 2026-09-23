/**
 * The hero particles' texture sound (D-082, 23 Sep 2026).
 *
 * "Softer Texture Particles" (client-supplied, 30 s) plays ON TOP of the
 * -100 BZ score, only while the cursor is stirring the hero's particle orb —
 * from the first frame until the orb hands off to We code (p .200 → .245).
 * It fades in when the cursor moves, rises with cursor speed (never more than
 * MAX_BOOST above the base), and fades out ~0.5 s after the cursor stops;
 * then it PAUSES, so the next stir resumes where it left off.
 *
 * Tweak the level here: BASE_VOLUME (client: "8 % for now, I'll edit it").
 */
const SRC = "/assets/hero-particles.mp3";
const BASE_VOLUME = 0.08;     // while the cursor moves
const MAX_BOOST = 0.5;        // speed can raise it by at most +50 % (→ 12 %)
const SPEED_FULL = 2.5;       // px/ms of cursor speed that earns the full boost
const STILL_MS = 500;         // no movement for this long = stopped

export function createHeroParticleSound() {
  const audio = new Audio(SRC);
  audio.loop = true;
  audio.preload = "auto";
  let ctx = null, gain = null;
  let lastMove = -1e9, lastX = 0, lastY = 0, lastT = 0, speed = 0;
  let quietSince = 0;

  addEventListener("pointermove", (e) => {
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    const v = Math.hypot(e.clientX - lastX, e.clientY - lastY) / dt;
    if (lastT) speed = speed * 0.8 + Math.min(v, 10) * 0.2;   // smoothed px/ms
    lastX = e.clientX; lastY = e.clientY; lastT = now; lastMove = now;
  }, { passive: true });

  if (import.meta.env?.DEV) {
    window.__heroParticles = { audio, get gain() { return gain ? gain.gain.value : 0; } };
  }

  return {
    /** inside the loader's ENTER click (the gesture audio needs) */
    unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
    },
    /**
     * Per frame. presence 0..1 = how much of the particle orb is on screen;
     * muted = the bottom-left Sound button.
     */
    update(presence, muted) {
      if (!ctx) return;
      const now = performance.now();
      const moving = now - lastMove < STILL_MS;
      if (!moving) speed *= 0.9;
      const boost = 1 + MAX_BOOST * Math.min(1, speed / SPEED_FULL);
      const target = moving && !muted ? BASE_VOLUME * boost * presence : 0;
      // quick in, gentle out
      gain.gain.setTargetAtTime(target, ctx.currentTime, target > gain.gain.value ? 0.1 : 0.25);
      if (target > 0) {
        quietSince = 0;
        if (audio.paused) audio.play().catch(() => {});
      } else if (!audio.paused) {
        if (!quietSince) quietSince = now;
        else if (now - quietSince > 1500) audio.pause();   // faded: hold the place
      }
    },
  };
}
