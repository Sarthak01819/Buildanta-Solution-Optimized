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
 *   - waking is checked EVERY frame, so a scene that fades back in is drawing
 *     on the first frame it is visible. A throttled check would show up to
 *     100ms of stale frame at the start of every fade-in — the one place where
 *     this optimisation could be seen. It is affordable precisely because a
 *     sleeping scene is not rendering: the check replaces work, it doesn't add
 *     to it. While awake the check throttles, since going to sleep 100ms late
 *     costs nothing
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
  let polledAt = -1e9;
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

  return {
    awake() {
      const now = performance.now();
      /* asleep: check every frame so a fade-in is never a frame late.
         awake: throttle — being slow to notice a scene has gone costs nothing */
      if (asleep || hiddenSince >= 0 || now - polledAt >= POLL) {
        polledAt = now;
        seen = onScreen && styleVisible(canvas);
      }

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
