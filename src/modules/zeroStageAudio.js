import AMBIENT_URL from "../assets/zero-stage/amb_stage1.mp3?url";
import HAND_ENTRY_URL from "../assets/zero-stage/fx_hand-entry.mp3?url";
import WHOOSH_URL from "../assets/zero-stage/fx_whoosh.mp3?url";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const inertAudio = () => ({
  setProgress() {},
  tick() {},
  dispose() {},
  get armed() { return false; },
  get state() {
    return {
      reducedMotion: true,
      armed: false,
      active: false,
      progress: 0,
    };
  },
});

/**
 * Audio companion for the ZeroMirror hand prelude.
 *
 * Every media element is silently primed from a real user activation. A failed
 * play promise does not consume that activation forever: the still-locked
 * element is retried on the next pointer, tap, click or keyboard activation.
 * Likewise, a one-shot is only considered fired after playback has actually
 * started. Visual scroll state remains authoritative and fully reversible;
 * sound itself is never played backwards.
 */
export function createZeroStageAudio() {
  const reducedMotion = typeof matchMedia === "function" && matchMedia(REDUCED_MOTION).matches;
  if (reducedMotion || typeof Audio !== "function") return inertAudio();

  const ambient = new Audio(AMBIENT_URL);
  const handEntry = new Audio(HAND_ENTRY_URL);
  const whoosh = new Audio(WHOOSH_URL);

  const channels = [
    { name: "ambient", track: ambient, level: 0, unlocked: false, pending: null, attempts: 0 },
    { name: "hand-entry", track: handEntry, level: 0.8, unlocked: false, pending: null, attempts: 0 },
    { name: "whoosh", track: whoosh, level: 0.6, unlocked: false, pending: null, attempts: 0 },
  ];

  ambient.loop = true;
  ambient.preload = "auto";
  ambient.volume = 0;
  handEntry.preload = "auto";
  handEntry.volume = 0.8;
  whoosh.preload = "auto";
  whoosh.volume = 0.6;

  const cues = [
    {
      name: "hand-entry",
      track: handEntry,
      level: 0.8,
      threshold: 0.02,
      resetBelow: 0.005,
      expiresAt: 0.24,
      queued: false,
      fired: false,
      pending: false,
      retryOnGesture: false,
      attempts: 0,
      successes: 0,
      cycle: 0,
    },
    {
      name: "whoosh",
      track: whoosh,
      level: 0.6,
      threshold: 0.95,
      resetBelow: 0.90,
      expiresAt: 1.01,
      queued: false,
      fired: false,
      pending: false,
      retryOnGesture: false,
      attempts: 0,
      successes: 0,
      cycle: 0,
    },
  ];

  let armed = false;
  let active = false;
  let progress = 0;
  let previousProgress = 0;
  let ambientLevel = 0;
  let ambientPending = false;
  let ambientRetryOnGesture = false;
  let disposed = false;

  const safeReset = (track) => {
    try { track.pause(); } catch { /* media is optional */ }
    try { track.currentTime = 0; } catch { /* not seekable yet */ }
  };

  const restoreLevel = (channel) => {
    channel.track.volume = channel.name === "ambient" ? clamp01(ambientLevel) : channel.level;
  };

  /* play() is invoked synchronously inside the trusted event handler. The
     eventual pause happens only after its promise resolves, avoiding the
     AbortError produced by play(); pause() in the same task. At volume zero
     this priming is completely inaudible. */
  const unlockChannel = (channel) => {
    if (channel.unlocked) return Promise.resolve(true);
    if (channel.pending) return channel.pending;

    channel.attempts += 1;
    safeReset(channel.track);
    channel.track.volume = 0;

    let playResult;
    try {
      playResult = channel.track.play();
    } catch {
      restoreLevel(channel);
      return Promise.resolve(false);
    }

    channel.pending = Promise.resolve(playResult)
      .then(() => {
        if (disposed) return false;
        safeReset(channel.track);
        channel.unlocked = true;
        restoreLevel(channel);
        return true;
      })
      .catch(() => {
        safeReset(channel.track);
        restoreLevel(channel);
        return false;
      })
      .finally(() => { channel.pending = null; });
    return channel.pending;
  };

  const tryCue = (cue, fromGesture = false) => {
    if (
      disposed || !armed || !cue.queued || cue.fired || cue.pending ||
      document.hidden || (cue.retryOnGesture && !fromGesture)
    ) return;

    cue.pending = true;
    cue.retryOnGesture = false;
    cue.attempts += 1;
    const cycle = cue.cycle;
    safeReset(cue.track);
    cue.track.volume = cue.level;

    let playResult;
    try {
      playResult = cue.track.play();
    } catch {
      cue.pending = false;
      cue.retryOnGesture = true;
      return;
    }

    Promise.resolve(playResult)
      .then(() => {
        if (disposed || cycle !== cue.cycle) return;
        cue.fired = true;
        cue.queued = false;
        cue.successes += 1;
      })
      .catch(() => {
        if (cycle === cue.cycle) cue.retryOnGesture = true;
      })
      .finally(() => { cue.pending = false; });
  };

  const tryQueuedCues = (fromGesture = false) => {
    for (const cue of cues) tryCue(cue, fromGesture);
  };

  const ensureAmbient = (fromGesture = false) => {
    if (
      disposed || !armed || !active || document.hidden || !ambient.paused ||
      ambientPending || (ambientRetryOnGesture && !fromGesture)
    ) return;

    ambientRetryOnGesture = false;
    ambient.volume = clamp01(ambientLevel);
    let playResult;
    try {
      playResult = ambient.play();
    } catch {
      ambientRetryOnGesture = true;
      return;
    }
    ambientPending = true;
    Promise.resolve(playResult)
      .catch(() => { ambientRetryOnGesture = true; })
      .finally(() => { ambientPending = false; });
  };

  const finishArm = () => {
    if (disposed) return;
    armed = channels.every((channel) => channel.unlocked);
    if (!armed) return;

    /* A visitor can wheel into the opening before their first activation. The
       short entry accent is useful only while the hand is still arriving. */
    const entry = cues[0];
    if (!entry.fired && progress >= entry.threshold && progress < entry.expiresAt) {
      entry.queued = true;
    }
    tryQueuedCues(true);
    ensureAmbient(true);
  };

  const isActivationKey = (event) =>
    event.type !== "keydown" || (!event.repeat && (event.key === "Enter" || event.key === " "));

  const armFromGesture = (event) => {
    if (disposed || !event.isTrusted || !isActivationKey(event)) return;

    if (!armed) {
      /* Do not await: every play() call must begin before this trusted event
         returns. Resolved channels become no-ops on later retries. */
      const attempts = channels.map(unlockChannel);
      Promise.all(attempts).then(finishArm);
      return;
    }

    ambientRetryOnGesture = false;
    for (const cue of cues) cue.retryOnGesture = false;
    tryQueuedCues(true);
    ensureAmbient(true);
  };

  const gestureEvents = ["pointerdown", "touchstart", "click", "keydown"];
  for (const type of gestureEvents) {
    addEventListener(type, armFromGesture, type === "touchstart" ? { passive: true } : undefined);
  }

  const onVisibility = () => {
    if (document.hidden) {
      ambient.pause();
      handEntry.pause();
      whoosh.pause();
      return;
    }
    ensureAmbient();
    tryQueuedCues();
  };
  document.addEventListener("visibilitychange", onVisibility);

  function setProgress(value, visible = true) {
    const next = clamp01(value);
    active = Boolean(visible) && next > 0.001;

    for (const cue of cues) {
      const crossedNow = next > previousProgress + 1e-5 &&
        previousProgress < cue.threshold && next >= cue.threshold;
      if (next < cue.resetBelow) {
        if (cue.fired || cue.queued || cue.retryOnGesture || cue.pending) cue.cycle += 1;
        cue.fired = false;
        cue.queued = false;
        cue.retryOnGesture = false;
      }
      if (crossedNow) cue.queued = true;
      /* Expiry only drops a stale cue that was waiting for activation. A
         single fast wheel update that crosses the cue must still sound. */
      if (!cue.fired && !crossedNow && next >= cue.expiresAt) cue.queued = false;
    }

    previousProgress = next;
    progress = next;
    tryQueuedCues();
    ensureAmbient();
  }

  function tick(dt) {
    const target = armed && active && !document.hidden ? 0.55 : 0;
    /* 1.5 s bloom in, 0.45 s tail out. The exponential response remains
       stable when GSAP repeats a frame or the tab briefly drops frames. */
    const timeConstant = target > ambientLevel ? 1.5 : 0.45;
    const blend = 1 - Math.exp(-Math.max(0, dt) / timeConstant);
    ambientLevel += (target - ambientLevel) * blend;
    ambient.volume = Math.max(0, Math.min(0.55, ambientLevel));
    ensureAmbient();
    /* D-092: never while the gesture's silent priming play() is in flight —
       pausing it rejected that play(), the ambient channel stayed locked, and
       with one ENTER click and wheel-only scrolling after it the whole stage
       (ambient + hand-entry + whoosh) never armed. */
    if (target === 0 && ambientLevel < 0.002 && !ambient.paused && !channels[0].pending) ambient.pause();
  }

  const snapshot = () => ({
    reducedMotion: false,
    armed,
    active,
    progress,
    ambient: {
      loop: ambient.loop,
      paused: ambient.paused,
      level: ambientLevel,
      volume: ambient.volume,
      fadeInSeconds: 1.5,
      fadeOutSeconds: 0.45,
      retryOnGesture: ambientRetryOnGesture,
    },
    channels: Object.fromEntries(channels.map((channel) => [channel.name, {
      unlocked: channel.unlocked,
      attempts: channel.attempts,
    }])),
    cues: Object.fromEntries(cues.map((cue) => [cue.name, {
      threshold: cue.threshold,
      resetBelow: cue.resetBelow,
      fired: cue.fired,
      queued: cue.queued,
      pending: cue.pending,
      retryOnGesture: cue.retryOnGesture,
      attempts: cue.attempts,
      successes: cue.successes,
      cycle: cue.cycle,
    }])),
  });

  function dispose() {
    disposed = true;
    for (const type of gestureEvents) removeEventListener(type, armFromGesture);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const { track } of channels) {
      safeReset(track);
      track.removeAttribute("src");
      track.load();
    }
    if (import.meta.env.DEV && window.__zeroStageAudioDebug === api) {
      delete window.__zeroStageAudioDebug;
    }
  }

  const api = {
    setProgress,
    tick,
    dispose,
    get armed() { return armed; },
    get state() { return snapshot(); },
  };

  /* Read-only DEV telemetry gives the visual verifier deterministic facts
     without shipping a production control surface for audio. */
  if (import.meta.env.DEV) window.__zeroStageAudioDebug = api;
  return api;
}
