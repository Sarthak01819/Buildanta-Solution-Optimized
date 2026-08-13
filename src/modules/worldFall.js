/**
 * PROJECTS — fall into the black hole, arrive in the world.
 *
 * Yash's decision: the world lives INSIDE Gargantua. Clicking Projects flies
 * the visitor in; the black hole is the doorway, not the room, so once through
 * there is nothing but black and the work. Scrolling up / Back flies out again.
 *
 * The performance answer falls out of the placement. The site already runs the
 * black hole and the Endurance; the world is a third WebGL scene, and the
 * honest options were one-at-a-time (a rebuild stall), a shared renderer (a
 * large rework — the world owns its own), or both alive (double memory, which
 * is what this site's crash recorder exists because of).
 *
 * The fall settles it. The descent ends in darkness, which is real cover: the
 * world is built and its shaders compiled while nothing is legible, and only
 * one scene is ever alive. The reveal waits on the world REPORTING ready rather
 * than on a timer — if the compile ever outlasts the fall, the dark holds
 * rather than showing a half-built scene to save a couple of hundred ms.
 *
 * The beat's own 0.75–1.00 is a "swallow" that blooms to WHITE — that is the
 * intro's exit, a different beat. This drives 0→1 for the approach (its camera
 * goes 2.6× distance to 1×) and carries the last stretch to black with a veil
 * of its own, so their shader plumbing is untouched.
 */

const FALL_MS = 5400;        // Yash: a real voyage, not a transition
const VEIL_FROM = 0.82;      // late: the DIVE does the work now, and a veil
                             // over the middle of it would hide the one thing
                             // the visitor is meant to see — going through.

/* Where the fall STARTS on the beat's own scrub.
   Not 0. At 0 the hole is a distant point, and the finale already has one
   settled and large on screen — so clicking Projects cut from a big black hole
   to a tiny one. The beat's emergence completes at p=0.22 (distMul reaches 1x),
   so starting just past it means the first frame of the fall already matches
   what the visitor is looking at. */
const SETTLED = 0.25;
const DISSOLVE_MS = 520;     // covers any framing difference between the two
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createWorldFall({ getBeat, onMountWorld, onUnmountWorld, reducedMotion = false }) {
  /* Drives the scene the visitor is ALREADY looking at.
   *
   * The first version painted its own black hole on a layer above everything,
   * which is why the Endurance vanished the instant you clicked: an overlay
   * covers the whole finale, ship included. It did not fly away, it was hidden
   * — and on the way back the overlay popped off, which is why the reverse read
   * as a cut rather than as travel.
   *
   * So nothing is overlaid and nothing is replaced. The fall takes the
   * finale's own beat, switches its dive on, and moves the camera through the
   * horizon. The Endurance simply stays where it is in that same scene and
   * drifts out of frame as the camera passes it, which is what leaving
   * something behind actually looks like.
   *
   * The dive is switched OFF again on the way out, because the intro drives
   * this same beat by scroll and must never dive.
   */
  let beat = null;
  let veil = document.createElement("div");
  veil.className = "world-fall__veil";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);

  let raf = 0;
  let from0 = SETTLED;        // where the scene was when the fall began
  let state = "out";          // out | falling | in | rising
  let worldApi = null;
  let worldReady = false;

  const setVeil = (a) => { veil.style.opacity = String(a); };

  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  // Fade the fall's own canvas up while keeping it painted, so the handover
  // from the finale's black hole to this one is a dissolve and not a cut.
  function dissolveIn() {
    // Fade the HOST, not the canvas.
    //
    // The beat writes canvas.style.opacity itself on every setProgress
    // (syncOpacity), so a fade applied to the canvas is overwritten on the next
    // frame — measured: the first 190ms of the journey moved 140/255, a hard
    // cut, while the dissolve appeared to be running. The host is ours and
    // nothing else touches it.
    const c = beat?.canvas?.parentElement;
    if (!c) return Promise.resolve();
    c.style.opacity = "0";
    c.style.transition = `opacity ${DISSOLVE_MS}ms ease`;
    return new Promise((done) => {
      requestAnimationFrame(() => {
        c.style.opacity = "1";
        // Keep painting through the dissolve — an unticked beat fades in a
        // canvas that was never drawn, which is a fade to black.
        const t0 = performance.now();
        let prev = t0;
        const hold = (now) => {
          const dt = Math.min((now - prev) / 1000, 0.1); prev = now;
          beat?.tick?.(dt);
          if (now - t0 < DISSOLVE_MS) { raf = requestAnimationFrame(hold); return; }
          c.style.transition = "";
          done();
        };
        raf = requestAnimationFrame(hold);
      });
    });
  }

  // Build the world as the fall STARTS, not when it ends. Its own warmup()
  // compiles before the first visible frame, so the stall lands inside the
  // darkness instead of after it.
  function beginBuild() {
    if (worldApi) { worldReady = true; return; }
    worldReady = false;
    worldApi = onMountWorld();
    // The world sets this once mounted and warmed.
    const poll = setInterval(() => {
      if (window.__worldReady === true) { worldReady = true; clearInterval(poll); }
    }, 50);
    // Never wait forever on a device that will not finish.
    setTimeout(() => { clearInterval(poll); worldReady = true; }, 12000);
  }

  function run(from, to, ms, onDone) {
    stop();
    const t0 = performance.now();
    let prev = t0;
    const step = (now) => {
      const p = clamp01((now - t0) / ms);
      const e = smooth(p);
      const v = from + (to - from) * e;
      beat?.setProgress?.(v);
      // tick() IS the render.
      //
      // setProgress only stores the value and syncs canvas opacity; the beat
      // draws from tick(dt), which it expects the site's single ticker to call
      // ("call from the ONE site ticker" — its own header says so). Driving
      // setProgress alone gave a canvas at full size and full opacity that had
      // simply never been painted: the whole fall played out black, with no
      // error anywhere, which is the worst way for this to fail.
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      beat?.tick?.(dt);
      // Black takes over the back half of the approach.
      setVeil(clamp01((v - VEIL_FROM) / (1 - VEIL_FROM)));
      if (p < 1) { raf = requestAnimationFrame(step); return; }
      onDone?.();
    };
    raf = requestAnimationFrame(step);
  }

  async function enter() {
    if (state === "falling" || state === "in") return;
    beat = getBeat();
    // No beat means no finale on screen — there is nothing to fall through, so
    // go straight in rather than play a journey against a page that has none.
    if (!beat) { state = "falling"; beginBuild(); arrive(); return; }

    state = "falling";
    document.documentElement.classList.add("is-falling");

    // Start from wherever the scene ALREADY is. No dissolve, no second canvas,
    // no swap — the first frame of the fall is the frame that was on screen.
    from0 = typeof beat.progress === "number" ? beat.progress : SETTLED;
    beat.setDive?.(true);
    beginBuild();

    if (reducedMotion) { arrive(); return; }

    run(from0, 1, FALL_MS, () => {
      // Hold the dark until the world says it is ready. This is the whole
      // point of building during the fall, and the one place a timer would be
      // wrong: a slow device would get a half-built scene revealed on schedule.
      const waitForWorld = () => {
        if (worldReady) { arrive(); return; }
        raf = requestAnimationFrame(waitForWorld);
      };
      waitForWorld();
    });
  }

  function arrive() {
    stop();
    setVeil(1);
    state = "in";
    document.documentElement.classList.remove("is-falling");
    document.documentElement.classList.add("is-in-world");
    // The beat is the SITE'S — never disposed here. It is left inside the
    // horizon, hidden behind the world, and rewound on the way out.
    worldApi?.setPaused?.(false);
    // Lift the veil onto the world, not onto the black hole.
    requestAnimationFrame(() => {
      veil.style.transition = "opacity 620ms ease";
      setVeil(0);
      setTimeout(() => { veil.style.transition = ""; }, 700);
    });
  }

  function exit() {
    if (state === "out" || state === "rising") return;
    state = "rising";
    // Veil first, then reverse the approach underneath it, so the world is
    // never seen shrinking — it was never a thing in space, it was the room.
    veil.style.transition = "opacity 380ms ease";
    setVeil(1);
    setTimeout(() => {
      veil.style.transition = "";
      document.documentElement.classList.remove("is-in-world");
      worldApi?.setPaused?.(true);
      if (reducedMotion) { finishExit(); return; }
      // Rise back out through the same scene, to exactly where it started —
      // the Endurance is still sitting there waiting.
      run(1, from0, FALL_MS * 0.85, finishExit);
    }, 400);
  }

  function finishExit() {
    stop();
    state = "out";
    setVeil(0);
    // Hand the beat back exactly as it was found: scroll drives it again, and
    // the intro must never dive.
    beat?.setDive?.(false);
    beat?.setProgress?.(from0);
    beat?.tick?.(0.016);
    beat = null;
    onUnmountWorld?.();
    worldApi = null;
    worldReady = false;
  }

  return {
    enter,
    exit,
    get state() { return state; },
    dispose() { stop(); beat?.setDive?.(false); beat = null; veil.remove(); veil = null; }
  };
}
