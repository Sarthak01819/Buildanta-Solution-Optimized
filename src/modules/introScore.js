/**
 * The -100 BZ score (D-079, 23 Sep 2026).
 *
 * "Mystery" (free, no-copyright track supplied by the client), cut to its
 * 00:00–01:23 and looped for as long as the visitor is inside -100 BZ. Every
 * cycle rises in over 3 s and dips out over its last 4 s, so the loop point is
 * a breath, not a seam. Leaving the section fades it out over 2 s and stops;
 * coming back (navbar) starts again from 00:00.
 *
 * Browsers only allow sound after a gesture, so `unlock()` is called from the
 * loader's ENTER click; until then setActive() only records intent.
 * Web Audio, not <audio>: the fades are scheduled on the audio clock, sample
 * accurate, and never drift against the loop.
 */
const SRC = "/assets/intro-score.mp3";   // already trimmed to 83 s
const VOLUME = 0.10;   // client, 24 Sep: 10 %
const DUCK_VOLUME = 0.08;   // under the We code globe sound (D-085)
const FADE_IN = 3;
const FADE_OUT = 4;
const LEAVE = 2;

export function createIntroScore() {
  let ctx = null, master = null, buffer = null;
  let active = false;          // is the visitor inside -100 BZ?
  let muted = false;
  let analyser = null, levels = null, duck = null, ducked = false;
  let playing = false;
  let cycle = null;            // { src, gain } of the running pass
  let nextTimer = 0;
  const loading = fetch(SRC)
    .then((r) => r.arrayBuffer())
    .catch(() => null);

  function startCycle(at) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.connect(gain).connect(master);
    const len = buffer.duration;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(VOLUME, at + FADE_IN);
    gain.gain.setValueAtTime(VOLUME, at + len - FADE_OUT);
    gain.gain.linearRampToValueAtTime(0.0001, at + len);
    src.start(at);
    src.stop(at + len);
    cycle = { src, gain };
    // queue the next pass a little before this one ends, on the audio clock
    nextTimer = setTimeout(() => { if (playing) startCycle(at + len); },
      Math.max(0, (at + len - ctx.currentTime - 1) * 1000));
  }

  function play() {
    if (playing || !ctx || !buffer) return;
    playing = true;
    startCycle(ctx.currentTime + 0.05);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearTimeout(nextTimer);
    const c = cycle;
    cycle = null;
    if (!c) return;
    const now = ctx.currentTime;
    c.gain.gain.cancelScheduledValues(now);
    c.gain.gain.setValueAtTime(c.gain.gain.value, now);
    c.gain.gain.linearRampToValueAtTime(0.0001, now + LEAVE);
    try { c.src.stop(now + LEAVE + 0.05); } catch { /* already stopped */ }
  }

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    /** Call inside a user gesture (the loader's ENTER). */
    async unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : 1;
      // the Sound button's EQ bars read this (D-081)
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      levels = new Uint8Array(analyser.frequencyBinCount);
      // D-085: the We code globe ducks the score to 20 % (of 55 %)
      duck = ctx.createGain();
      master.connect(duck).connect(analyser);
      analyser.connect(ctx.destination);
      const raw = await loading;
      if (!raw) return;
      try { buffer = await ctx.decodeAudioData(raw); } catch { return; }
      if (active) play();
    },
    /** the bottom-left Sound button (D-081); a short ramp, never a click */
    setMuted(on) {
      muted = !!on;
      if (!master) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(muted ? 0.0001 : 1, now + 0.4);
    },
    get muted() { return muted; },
    /** D-085: while We code's globe plays the score sits at DUCK_VOLUME (1.5 s ease) */
    setDuck(on) {
      if (on === ducked || !duck) return;
      ducked = on;
      const now = ctx.currentTime;
      duck.gain.cancelScheduledValues(now);
      duck.gain.setValueAtTime(duck.gain.value, now);
      // client, 24 Sep: 8 % during We code (never a boost over the base)
      duck.gain.linearRampToValueAtTime(on ? Math.min(1, DUCK_VOLUME / VOLUME) : 1, now + 1.5);
    },
    get muted() { return muted; },
    /** 0..1 loudness of what is actually heard (after mute / fades) */
    level() {
      if (!analyser || ctx.state !== "running") return 0;
      analyser.getByteTimeDomainData(levels);
      let sum = 0;
      for (let i = 0; i < levels.length; i++) { const v = (levels[i] - 128) / 128; sum += v * v; }
      // sqrt of RMS: quiet passages still move the bars, peaks don't pin them
      return Math.min(1, Math.sqrt(Math.sqrt(sum / levels.length)) * 1.6);
    },
    /** true while the visitor is inside -100 BZ; cheap to call every frame */
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) play(); else stop();
    },
  };
}
