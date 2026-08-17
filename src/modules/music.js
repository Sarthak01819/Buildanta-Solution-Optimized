/**
 * THE FINALE SCORE.
 *
 * Yash's brief (17 Aug, 6 MCQs):
 *   - plays in the FINALE ONLY, nowhere else on the journey
 *   - starts on the ENTER click, rising from low to full with the ride
 *   - loops seamlessly and continuously — you should never hear it restart
 *   - follows the journey: swells falling into Projects, muffles inside the
 *     world, warms again in the Endurance
 *
 * ── WHY WEB AUDIO AND NOT <audio loop> ──
 * <audio loop> gaps at the wrap in every browser — a few milliseconds of
 * silence that reads as a stutter every 28 seconds, which is exactly the seam
 * Yash asked to be inaudible. An AudioBufferSourceNode with loop=true wraps
 * sample-accurately, with no gap at all. The file itself was cut to a whole
 * number of bars at its own 94 BPM and crossfaded tail-over-head (loop join
 * measured +0.96 where 1.00 is perfect), so the music meets itself in tune AND
 * in time.
 *
 * ── WHY ENTER IS THE PERFECT TRIGGER (Yash's idea, better than mine) ──
 * Browsers refuse to start audio without a user gesture. ENTER is a real click
 * AND the dramatic peak of the site, so the unlock and the moment the music
 * should arrive are the same event. No "click for sound" prompt, no ambush,
 * no compromise.
 *
 * Nothing is fetched until ENTER: a visitor who never enters pays nothing.
 */

const SRC = "/assets/finale-score.mp3";

export function createMusic() {
  let ctx = null;
  let master = null;      // overall level — the swell rides here
  let tone = null;        // lowpass — "muffled inside the world"
  let src = null;
  let buffer = null;
  let loading = null;
  let muted = false;
  let started = false;

  const now = () => (ctx ? ctx.currentTime : 0);

  /* Ramp helper: every change is a ramp, never a jump. A jump in gain is an
     audible click; a jump in filter frequency is a zip. */
  const ramp = (param, value, seconds) => {
    if (!ctx) return;
    param.cancelScheduledValues(now());
    param.setValueAtTime(param.value, now());
    param.linearRampToValueAtTime(value, now() + seconds);
  };

  async function load() {
    if (buffer) return buffer;
    if (!loading) {
      loading = fetch(SRC)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((decoded) => { buffer = decoded; return decoded; });
    }
    return loading;
  }

  /** Called at ENTER. Starts silent and rises — the ride does the swelling. */
  async function enter() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      /* Safari can still hand back a suspended context even inside a click;
         resume() inside the same gesture is the documented remedy. */
      if (ctx.state === "suspended") await ctx.resume();

      master = ctx.createGain();
      master.gain.value = 0.0001;          // silence, but not zero — ramps from
      tone = ctx.createBiquadFilter();     // 0 behave badly on some devices
      tone.type = "lowpass";
      tone.frequency.value = 20000;        // wide open by default
      master.connect(tone);
      tone.connect(ctx.destination);

      const buf = await load();
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;                     // sample-accurate, gapless
      src.connect(master);
      src.start(0);

      /* The rise: 6 seconds, matching the ride into the hole. Quiet arrival,
         not a cut. */
      ramp(master.gain, muted ? 0.0001 : 0.62, 6.0);
    } catch (e) {
      console.info("[music] unavailable:", e?.message || e);
    }
  }

  /**
   * The journey drives this. Called whenever the site's state changes.
   * @param state "finale" | "falling" | "world" | "endurance"
   */
  function setScene(state) {
    if (!ctx || muted) return;
    if (state === "falling") {
      ramp(master.gain, 0.78, 1.2);        // swell as you fall in
      ramp(tone.frequency, 20000, 1.2);
    } else if (state === "world") {
      ramp(master.gain, 0.34, 1.6);        // distant, behind a wall
      ramp(tone.frequency, 700, 1.6);      // muffled
    } else if (state === "endurance") {
      ramp(master.gain, 0.58, 2.0);        // warm, close, human
      ramp(tone.frequency, 4200, 2.0);
    } else {
      ramp(master.gain, 0.62, 1.6);        // the finale, holding
      ramp(tone.frequency, 20000, 1.6);
    }
  }

  function setMuted(v) {
    muted = !!v;
    if (!ctx) return;
    ramp(master.gain, muted ? 0.0001 : 0.62, 0.35);
  }

  return {
    enter,
    setScene,
    setMuted,
    get muted() { return muted; },
    get started() { return started; },
  };
}
