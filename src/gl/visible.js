/**
 * Stops WebGL scenes from costing anything while nobody can see them.
 *
 * Measured on 8 Aug, sampling draw calls per canvas at four scroll positions:
 *
 *   #gl                        201 draws/sec at EVERY position — into a canvas
 *                              that `display:none` hides for the whole site
 *                              (finale mode hides the blue main site).
 *                              1.3 Mpx of buffer, rendered forever, for nothing
 *   intro__gl                   67 draws/sec while sitting at opacity 0
 *   room__bh                   750 draws/sec at every position
 *   orbHero / hand-canvas /     1.3 Mpx each, held while drawing nothing
 *   one unnamed canvas
 *
 * 8.84 Mpx — 6.8 screens' worth — is alive at once, and most of it is never
 * looked at. That is why the site is smooth on this Mac and not on a laptop:
 * the cost tracks how many scenes EXIST, not how many are being watched.
 *
 * Asleep, a scene skips its render (the per-frame cost) and drops its drawing
 * buffer to 1x1 (the memory). Both reverse the instant it is wanted. Nothing
 * is disposed, so no context has to be rebuilt and no scene can fail to
 * return — the worst case is one frame drawn at the old size.
 *
 * Three things keep this cheap and safe:
 *   - an IntersectionObserver handles the scrolled-away case for free
 *   - the visibility check runs on a TIMER, never inside the render loop.
 *     It was per-frame at first, for instant wake — and that cost far more
 *     than it saved: checkVisibility() forces a style recalculation, so it
 *     landed between intro.js's per-frame CSS writes and the paint. Textbook
 *     layout thrash, measured at 1.0 forced read per frame through ACT 01,
 *     and it made the opening judder on scroll with no cursor involved.
 *     Wake is now up to 100ms late, which nobody can see; the judder,
 *     everybody could
 *   - sleep waits 500ms. Without that lag, a scene sitting exactly on an
 *     opacity threshold would reallocate its buffer every frame, which costs
 *     far more than the render it saves
 */

const HIDE_AFTER = 500;   // ms hidden before the buffer is released
const POLL = 100;         // ms between checks, while awake

/** display:none, visibility:hidden, or opacity:0 — on the canvas or any ancestor. */
function styleVisible(c) {
  if (c.checkVisibility) {
    return c.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    });
  }
  /* older engines: offsetParent catches display:none (except under fixed) */
  if (c.offsetParent === null && getComputedStyle(c).position !== "fixed") return false;
  return getComputedStyle(c).opacity !== "0";
}

/**
 * Gate a scene's render on whether it can be seen.
 *
 *   const gate = idleGate(canvas, () => scene.resize());
 *   ticker.add(t => { if (gate.awake()) scene.render(t); });
 *
 * The resize callback runs when the scene wakes, so it can rebuild its render
 * targets at the real size — a scene that reads canvas.width would otherwise
 * come back projecting into a 1x1 frame.
 */
export function idleGate(canvas, onWake) {
  let onScreen = true;                 // set by the observer below
  let seen = true;                     // last polled answer
  let hiddenSince = -1;
  let asleep = false;
  let saved = null;

  /* scrolled out of view — free, event-driven, no per-frame cost */
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(
      (entries) => { for (const e of entries) onScreen = e.isIntersecting; },
      { rootMargin: "10%" },
    ).observe(canvas);
  }

  /* ⚠️ THE VISIBILITY POLL LIVES ON A TIMER, NOT IN THE RENDER LOOP.
     checkVisibility() forces a synchronous style recalculation. Called from
     awake() it landed inside the frame, immediately after intro.js writes
     dozens of CSS custom properties — write-then-read in one frame is textbook
     layout thrash. The first version did it EVERY FRAME while asleep, for
     instant wake; measured at 1.0 forced read per frame right through ACT 01's
     core formation, which is precisely the judder Yash reported on scroll with
     no cursor near the orb. It was smooth before this gate existed.

     A timer runs it outside the frame instead, so the render path does no
     style work whatever. The cost is up to POLL ms of wake latency, which for
     a scene arriving from off screen nobody can perceive — and a stutter in
     the opening, which everybody can, is not worth trading for it. */
  const poll = () => { seen = onScreen && styleVisible(canvas); };
  poll();
  setInterval(poll, POLL);

  return {
    awake() {
      const now = performance.now();
      /* `seen` is refreshed by a TIMER, never here — see the note on the poll
         below. This function does no style work at all. */

      if (seen) {
        hiddenSince = -1;
        if (asleep) {                                   // wake: instant
          asleep = false;
          if (saved) { canvas.width = saved.w; canvas.height = saved.h; saved = null; }
          onWake?.();
        }
        return true;
      }

      if (hiddenSince < 0) hiddenSince = now;
      if (!asleep && now - hiddenSince >= HIDE_AFTER) { // sleep: only once settled
        asleep = true;
        if (canvas.width > 1 || canvas.height > 1) {
          saved = { w: canvas.width, h: canvas.height };
          canvas.width = 1; canvas.height = 1;
        }
      }
      return false;
    },
    get sleeping() { return asleep; },
  };
}
