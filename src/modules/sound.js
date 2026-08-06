/**
 * Intro ke sound cues — Web Audio se synthesize hote hain.
 *
 * Koi .mp3/.wav file nahi: standalone build offline chalni chahiye, aur
 * ek chhoti si blip ke liye 40 KB asset bhejna bekaar hai. Oscillator +
 * gain envelope se hi kaam ho jaata hai.
 *
 * Autoplay policy: browser AudioContext ko user gesture tak `suspended`
 * rakhta hai. Isliye default bhale hi "on" ho, awaaz pehle click/keypress
 * ke baad hi aati hai — aur toggle hamesha asli state dikhata hai.
 */
export function createSound({ volume = 0.22, enabled = true } = {}) {
  let ctx = null, master = null, analyser = null, buf = null;
  let on = enabled;
  let running = false;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? volume : 0;
    // analyser tap: eq bars asli output se chalte hain, fake CSS loop se nahi.
    // Iski cost na ke barabar hai aur isse audio testable bhi ho jaata hai.
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    buf = new Uint8Array(analyser.frequencyBinCount);
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }

  /** 0..1 — abhi kitni awaaz nikal rahi hai */
  function level() {
    if (!analyser || !running) return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }

  /** kisi bhi user gesture par call karo */
  async function unlock() {
    init();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { return false; }
    }
    running = ctx.state === "running";
    return running;
  }

  const live = () => running && on && ctx;

  /** pitch-swept blip — sequence ke steps ke liye */
  function blip(freq, { dur = 0.22, type = "sine", gain = 0.5, sweep = 1.35 } = {}) {
    if (!live()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /** band-passed noise burst — "tick" ka texture deta hai */
  function tick({ dur = 0.09, freq = 2400, gain = 0.22 } = {}) {
    if (!live()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.1;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
  }

  // G4 · Bb4 · C5 · Eb5 — minor pentatonic, har step thoda upar
  const NOTES = [392.0, 466.16, 523.25, 622.25];

  /* ══════════════════════════════════════════════════════
     AMBIENT MUSIC
     Static drone nahi — ek chalti hui dhun.

     Teen parat:
       1. Pad — 4 awaazein jo chord se chord glide karti hain
       2. Plucks — A-minor pentatonic ke sur, random gaps par
       3. Space — feedback delay, jisse har sur ki gunj rehti hai

     Chords A-minor mein hain, saare 7ths ke saath — khule aur shaant,
     bina tension ke. Progression 4 chords ka hai par plucks random hain,
     isliye ye kabhi loop jaisi nahi lagti.
     ══════════════════════════════════════════════════════ */

  // Am7 → Fmaj7 → Cmaj7/G → Em7
  const PROG = [
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 261.63, 349.23, 440.00],
    [196.00, 261.63, 329.63, 493.88],
    [164.81, 246.94, 329.63, 392.00],
  ];
  // A minor pentatonic, do octave
  const PENT = [440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

  let pad = null;

  function startAmbient() {
    if (!live() || pad) return;
    const t = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.85, t + 3.5);
    out.connect(master);      // <- ye chhoot gaya tha: poora ambient bus
                              //    destination se juda hi nahi tha

    // ── space: feedback delay ──
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.58;
    const fb = ctx.createGain(); fb.gain.value = 0.4;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass"; damp.frequency.value = 1900;
    const wet = ctx.createGain(); wet.gain.value = 0.42;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);   // feedback loop
    delay.connect(wet); wet.connect(out);

    // ── pad ──
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, t);
    lp.Q.value = 0.6;
    // dheema filter LFO — pad saans leta hua lagta hai
    const lfo = ctx.createOscillator();
    lfo.type = "sine"; lfo.frequency.value = 0.055;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency); lfo.start(t);

    const voices = PROG[0].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "sine" : "triangle";
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 5;
      const g = ctx.createGain();
      g.gain.value = 0.3 / (i * 0.5 + 1);
      o.connect(g); g.connect(lp);
      o.start(t);
      return o;
    });
    lp.connect(out);

    /** ek pluck — chhota sur jo delay ke through gunjta hai */
    function pluck(freq, when, gain) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 2.2);
      o.connect(g);
      g.connect(out);            // dry
      g.connect(delay);          // aur gunj mein bhi
      o.start(when); o.stop(when + 2.4);
    }

    // ── scheduler: chord har 7.5s, pluck har 1.6–3.4s ──
    let chordIx = 0;
    const chordTimer = setInterval(() => {
      if (!pad) return;
      chordIx = (chordIx + 1) % PROG.length;
      const now = ctx.currentTime;
      // glide, jump nahi — isi se ye "tuning" jaisi behti hai
      voices.forEach((o, i) => {
        o.frequency.cancelScheduledValues(now);
        o.frequency.setValueAtTime(o.frequency.value, now);
        o.frequency.exponentialRampToValueAtTime(PROG[chordIx][i], now + 3.2);
      });
    }, 7500);

    let pluckTimer = null;
    const schedulePluck = () => {
      if (!pad) return;
      const f = PENT[(Math.random() * PENT.length) | 0];
      pluck(f, ctx.currentTime + 0.05, 0.06 + Math.random() * 0.05);
      pluckTimer = setTimeout(schedulePluck, 1600 + Math.random() * 1800);
    };
    pluckTimer = setTimeout(schedulePluck, 2200);

    pad = {
      out, voices, lfo, lp,
      baseCut: 700, baseGain: 0.85,
      stopTimers: () => { clearInterval(chordTimer); clearTimeout(pluckTimer); },
    };
  }

  /**
   * Scroll ki raftaar se pad ko kholna/band karna.
   *
   * `x` 0…1 aata hai (0 = ruka hua, 1 = tez scroll). Tez scroll par filter
   * khulta hai aur level chadhta hai; ruk jaane par wapas settle ho jaata hai.
   *
   * Ramp jaan-boojhkar 0.25s ka hai, turant set nahi: setValueAtTime se
   * filter par zipper noise aati hai aur scroll ke har jhatke par click
   * sunai deta hai.
   *
   * Ye khud koi smoothing nahi karta — caller pehle se smoothed value bhejta
   * hai. Do jagah smoothing lagane se lag do guna ho jaata hai.
   */
  function setIntensity(x) {
    if (!pad || !ctx) return;
    const v = Math.max(0, Math.min(1, x || 0));
    const t = ctx.currentTime;
    const cut = pad.baseCut * (1 + v * 2.6);          // 700 → ~2500 Hz
    const gain = pad.baseGain * (0.72 + v * 0.42);    // dheema → thoda tez
    pad.lp.frequency.cancelScheduledValues(t);
    pad.lp.frequency.setTargetAtTime(cut, t, 0.25);
    pad.out.gain.cancelScheduledValues(t);
    pad.out.gain.setTargetAtTime(gain, t, 0.25);
  }

  function stopAmbient(fade = 1.6) {
    if (!pad || !ctx) return;
    const t = ctx.currentTime;
    const p = pad; pad = null;                 // pehle null — scheduler ruk jaaye
    p.stopTimers();
    p.out.gain.cancelScheduledValues(t);
    p.out.gain.setValueAtTime(Math.max(p.out.gain.value, 0.0001), t);
    p.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      p.voices.forEach((o) => { try { o.stop(); } catch {} });
      try { p.lfo.stop(); } catch {}
    }, fade * 1000 + 200);
  }

  return {
    unlock,
    startAmbient,
    stopAmbient,
    setIntensity,
    level,
    get enabled() { return on; },
    get running() { return running; },
    get state() { return ctx ? ctx.state : "none"; },

    setEnabled(v) {
      on = v;
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(v ? volume : 0, ctx.currentTime + 0.12);
      }
      if (!v) stopAmbient(0.5);
      return on;
    },

    /** step change */
    step(i) {
      blip(NOTES[i % NOTES.length], { dur: 0.26, gain: 0.42, type: "triangle" });
      tick({ freq: 3000 + i * 350, gain: 0.16 });
    },

    /** closing beat — thoda khulta hua */
    reveal() {
      blip(311.13, { dur: 0.7, gain: 0.3, type: "sine", sweep: 1.02 });
      setTimeout(() => blip(466.16, { dur: 0.6, gain: 0.24, type: "sine", sweep: 1.02 }), 90);
      setTimeout(() => blip(622.25, { dur: 0.55, gain: 0.18, type: "sine", sweep: 1.02 }), 180);
    },

    /** ENTER — chord + neeche girta hua sweep, "andar jaane" wala ehsaas */
    enter() {
      stopAmbient(1.1);            // pad ko jagah do
      if (!live()) return;
      [261.63, 392.0, 523.25].forEach((f, i) =>
        setTimeout(() => blip(f, { dur: 1.0, gain: 0.26, type: "sine", sweep: 1.01 }), i * 55)
      );
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.85);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.85);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.95);
    },

    /** hover / small UI cue */
    hover() { tick({ dur: 0.05, freq: 5200, gain: 0.07 }); },
  };
}
