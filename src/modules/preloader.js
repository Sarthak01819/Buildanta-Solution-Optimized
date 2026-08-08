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
 *   finale (heaviest, and it comes last)  ·  cap the wait at ~3s and finish
 *   the rest in the background  ·  quality measures AFTER the reveal  ·  show
 *   the loader only when preparation actually takes a moment, so a returning
 *   visitor with a warm cache walks straight in.
 *
 * ⚠️ It reveals on a TIMER as well as on completion. A warm-up that hangs —
 * a texture that never decodes, a context that never comes back — must never
 * be able to trap someone on a loading screen. Late and running beats perfect
 * and stuck.
 */

const REVEAL_CAP_MS = 3000;     // Yash: cap the wait at ~3s
const SHOW_AFTER_MS = 450;      // below this, do not flash a loader at all

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
    '</div>';

  const bar = el.querySelector('.preload__bar i');
  const pct = el.querySelector('.preload__pct');

  let shown = false, done = false, progress = 0;
  const t0 = performance.now();

  /* Only mount the overlay if preparation is actually taking time. A loader
     that flashes for 200ms is worse than no loader. */
  const showTimer = setTimeout(() => {
    if (done) return;
    shown = true;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('preload--on'));
  }, SHOW_AFTER_MS);

  const paint = () => {
    const shownPct = Math.round(progress * 100);
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(3)})`;
    if (pct) pct.textContent = String(shownPct);
  };

  const api = {
    /** 0..1 — never goes backwards, so the bar cannot stutter. */
    set(p) {
      progress = Math.max(progress, Math.min(1, p));
      paint();
    },
    /** Reveal the site. Safe to call twice; the second call does nothing. */
    reveal() {
      if (done) return;
      done = true;
      clearTimeout(showTimer);
      api.set(1);
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
  };

  /* The hard stop. Nothing may keep a visitor on a loading screen. */
  setTimeout(() => api.reveal(), REVEAL_CAP_MS);

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
