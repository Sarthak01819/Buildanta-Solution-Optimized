/**
 * The bill-burn crackle (D-091, 24 Sep 2026) — the Zero reference's own
 * `fx_money-burn.mp3`, taken from zeromirror.zip and played the way its bill
 * stage plays it: one looping instance per burning note, each at
 * 5 % × 4·o·(1−o) of that note's burn progress o (silent as it catches and as
 * it finishes, loudest mid-burn), started when o > .001 and stopped at .95.
 * Pure function of scroll, like the burn itself, so reverse scroll re-lights it.
 * WAV so the 1.4 s loop has no MP3 priming gap at the seam.
 */
const SRC = "/assets/money-burn.wav";
const VOLUME = 0.05;   // the reference's own per-note level

export function createMoneyBurnSound() {
  let ctx = null, master = null, buffer = null;
  const voices = [];   // per note: { src, g } or null
  const loading = fetch(SRC).then((r) => r.arrayBuffer()).catch(() => null);

  function stopVoice(i) {
    const v = voices[i];
    if (!v) return;
    v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);   // the reference's .25 s fade-out
    try { v.src.stop(ctx.currentTime + 0.3); } catch { /* ended */ }
    voices[i] = null;
  }

  return {
    async unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
      const raw = await loading;
      if (raw) try { buffer = await ctx.decodeAudioData(raw); } catch { /* none */ }
    },
    /** per frame: intro.billBurnLevels() and the Sound button */
    update(levels, muted) {
      if (!ctx || !buffer) return;
      master.gain.value = muted ? 0 : 1;
      const n = Math.max(levels.length, voices.length);
      for (let i = 0; i < n; i++) {
        const o = levels[i] ?? 0;
        const burning = o > 0.001 && o < 0.95;
        if (!burning) { stopVoice(i); continue; }
        if (!voices[i]) {
          const src = ctx.createBufferSource();
          const g = ctx.createGain();
          src.buffer = buffer;
          src.loop = true;
          g.gain.value = 0;
          src.connect(g).connect(master);
          src.start(0, Math.random() * buffer.duration);   // notes don't crackle in unison
          voices[i] = { src, g };
        }
        voices[i].g.gain.setTargetAtTime(VOLUME * 4 * o * (1 - o), ctx.currentTime, 0.05);
      }
    },
  };
}
