/**
 * THE ENTRANCE — warm the site up before it is ever seen.
 *
 * Yash's observation, and it is the right one: unseen.co shows a loader, and
 * only then does the site appear. We never had that, and it costs us twice.
 *
 *  1. SHADERS COMPILE ON FIRST DRAW, not when they are built. Measured by
 *     scrubbing ACT 01: a program was still linking at p=0.02, mid-scroll,
 *     inside the opening. Every one of those is a hitch landing on the
 *     visitor. three's own docs and issue #9887 say the same: force the
 *     compile up front or take the jank later.
 *  2. THE QUALITY SYSTEM JUDGES THE MACHINE DURING BOOT. It samples frame rate
 *     for the first 5 seconds and steps resolution down if it looks slow —
 *     but the first 5 seconds ARE the boot work. A fast machine can be branded
 *     slow by its own loading. Behind a loader it measures a warm scene.
 *
 * Decisions, from Yash (8 Aug):
 *   branded loader with a real progress count  ·  warm everything EXCEPT the
 *   finale (heaviest, and it comes last)  ·  quality measures AFTER the reveal.
 *
 * REVISED after he saw it: the loader is now ALWAYS shown and always held for
 * a minimum of two seconds. "Even if the loader updates in less than one
 * second, at least it should take two seconds to properly load so that the
 * interaction is smooth, not sudden." That supersedes the original
 * show-only-when-needed rule — on a fast machine the work finishes in a couple
 * of hundred milliseconds and a loader that flashes past reads as a fault.
 *
 * ⚠️ It reveals on a TIMER as well as on completion. A warm-up that hangs —
 * a texture that never decodes, a context that never comes back — must never
 * be able to trap someone on a loading screen. Late and running beats perfect
 * and stuck.
 */

const REVEAL_CAP_MS = 12000;    // readiness-first, still bounded on failed networks
/* ⚠️ A MINIMUM, NOT A DELAY FOR ITS OWN SAKE. Yash: "even if the loader
   updates in less than one second, at least it should take two seconds to
   properly load so that the interaction is smooth, not sudden." On a fast
   machine the warm-up finishes in a couple of hundred milliseconds, and a
   loader that flashes past reads as a glitch rather than as an entrance. The
   site is READY well before this elapses; the time buys composure, not work.
   This supersedes the earlier "only show it when needed" — he saw both and
   chose the deliberate entrance. */
const MIN_VISIBLE_MS = 2000;

export function createPreloader({ onReveal } = {}) {
  const el = document.createElement('div');
  el.className = 'preload';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML =
    '<div class="preload__in">' +
    '<div class="preload__mark">BUILDANTA <b>SOLUTIONS</b></div>' +
    '<div class="preload__bar"><i></i></div>' +
    '<div class="preload__pct">0</div>' +
    '<div class="preload__phase">Loading scene assets</div>' +
    '</div>';

  const bar = el.querySelector('.preload__bar i');
  const pct = el.querySelector('.preload__pct');
  const phase = el.querySelector('.preload__phase');
  let revealReason = null;

  let shown = false, done = false, progress = 0, work = 0;
  const t0 = performance.now();

  /* Mounted immediately — it is the entrance now, not a fallback. */
  document.body.appendChild(el);
  shown = true;
  requestAnimationFrame(() => el.classList.add('preload--on'));

  /* The bar fills on the CLOCK as well as on real progress, whichever is
     further along, and never goes backwards. Without this a fast machine
     shows 0 then 100 with nothing between, which looks broken; with it the
     fill is always smooth and still honest — it can never claim to be further
     ahead than the work actually is at the end. */
  let raf = 0;
  const drive = () => {
    const byClock = (performance.now() - t0) / MIN_VISIBLE_MS;
    progress = Math.max(progress, Math.min(byClock, work));
    paint();
    if (!done) raf = requestAnimationFrame(drive);
  };

  const paint = () => {
    const shownPct = Math.round(progress * 100);
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(3)})`;
    if (pct) pct.textContent = String(shownPct);
  };

  const api = {
    /** 0..1 — how far the real WORK has got. The bar is driven from this and
     *  from the clock together, so it fills smoothly either way. */
    set(p) {
      work = Math.max(work, Math.min(1, p));
    },
    phase(label) { if (!done) phase.textContent = label; },
    /** Reveal the site. Safe to call twice; the second call does nothing. */
    reveal(reason = 'ready') {
      if (done) return;
      /* Hold until the minimum has elapsed. The work may well be finished —
         that is the normal case on a fast machine — but the entrance is not. */
      const left = MIN_VISIBLE_MS - (performance.now() - t0);
      if (left > 0) { setTimeout(() => api.reveal(reason), left); return; }
      done = true;
      revealReason = reason;
      cancelAnimationFrame(raf);
      if (reason === 'ready') { work = 1; progress = 1; }
      phase.textContent = reason === 'ready' ? 'Ready'
        : reason === 'partial' ? 'Some assets are unavailable' : 'Finishing in the background';
      paint();
      const finish = () => {
        el.remove();
        onReveal?.(Math.round(performance.now() - t0));
      };
      if (!shown) { finish(); return; }
      el.classList.add('preload--gone');
      /* matches the CSS transition; also fires if the transition never does */
      setTimeout(finish, 520);
    },
    get revealed() { return done; },
    get state() { return { revealed: done, reason: revealReason, progress }; },
  };

  drive();
  /* The hard stop. Nothing may keep a visitor on a loading screen. */
  setTimeout(() => api.reveal('timeout'), REVEAL_CAP_MS);

  return api;
}

/**
 * Warm one three.js scene: link its programs and upload its textures now,
 * rather than on the frame it is first drawn.
 *
 * compile() only walks VISIBLE objects, and these scenes toggle much of
 * themselves on by scroll progress — so everything is forced visible for the
 * traversal and restored exactly as it was. Nothing renders in between, so the
 * temporary state can never reach the screen.
 *
 * Every step is individually guarded: a scene that cannot be warmed must still
 * load the site. The warm-up is an optimisation, never a gate.
 */
export function warmScene(renderer, scene, camera) {
  if (!renderer || !scene || !camera) return;
  const hidden = [];
  try {
    scene.traverse((o) => { if (o.visible === false) { hidden.push(o); o.visible = true; } });
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) {
          const tex = mat[k];
          if (tex && tex.image) { try { renderer.initTexture(tex); } catch { /* ignore */ } }
        }
      }
    });
    renderer.compile(scene, camera);
  } catch (e) {
    console.info('[preload] scene warm-up skipped:', e?.message || e);
  } finally {
    for (const o of hidden) o.visible = false;
  }
}
