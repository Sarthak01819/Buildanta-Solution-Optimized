/**
 * BlackholeGateBeat — the entry beat between the WE SCALE final-note burn and
 * the main-site hero. The burned note's last ember becomes a black hole: it
 * grows to own the viewport, holds (gas churning in real time), then its glow
 * blooms out and the site emerges from the light.
 *
 * Contract (matches the ConsultHand conventions from the site handoff):
 *   const beat = await createBlackholeGateBeat(container, {
 *     shaders,          // REQUIRED under Vite: the six ?raw-imported strings
 *     reducedMotion,    // boolean — true → single still frame, no animation
 *     dprCap = 1.5,     // renderer device-pixel-ratio cap
 *   });
 *   beat.setProgress(p) // 0..1, scroll-driven, fully reversible
 *   beat.tick(dt)       // call from the ONE site ticker (GSAP) — drives churn
 *   beat.resize()       // debounced by the caller or call directly
 *   beat.dispose()      // frees GL resources (call on pagehide)
 *
 * Progress map (reversible, eased inside):
 *   0.00–0.35  emergence — a point of light dilates into the lensed hole
 *   0.35–0.75  presence  — full frame, cinematic drift + live churn
 *   0.75–1.00  swallow   — exposure blooms to white; site fades in on top
 *
 * Hybrid motion per the approved decision: scroll owns entry/camera/exit,
 * while the accretion disk churns on its own clock even when scroll stops.
 */
import { createBlackhole } from './blackhole.js';
import { CONFIG } from './config.js';

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const smooth = (t) => t * t * (3 - 2 * t);

export async function createBlackholeGateBeat(container, opts = {}) {
  const dprCap = opts.dprCap ?? 1.5;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;';
  container.appendChild(canvas);

  const engine = await createBlackhole(canvas, { shaders: opts.shaders });
  if (!engine) { canvas.remove(); return null; }   // caller keeps DOM fallback

  let progress = 0;
  let t = 21;                 // scene clock (s) — starts at a handsome moment
  let disposed = false;

  function size() {
    if (disposed) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    /* ⚠️ FLOOR as well as cap on desktop. Math.min(dpr, cap) only ever LOWERS:
       on a devicePixelRatio-1 monitor (Yash's Lenovo) the beat rendered at
       exactly 1x and the photon ring aliased into visible stairs — his
       screenshot of the finale is what a raymarched high-contrast edge looks
       like with zero supersampling. Desktop now renders at 1.5x ALWAYS:
       dpr-1 screens get supersampled, dpr-2 screens keep the same 1.5 they
       already had. Phones keep the 1024 longest-side cap below — their 3x
       glass already resolves the edge, and their budget is memory. */
    const fine = !(typeof matchMedia === 'function'
      && matchMedia('(pointer: coarse)').matches);
    const dpr = fine
      ? dprCap
      : Math.min(window.devicePixelRatio || 1, dprCap);
    let pw = Math.max(Math.round(w * dpr), 16);
    let ph = Math.max(Math.round(h * dpr), 16);

    /* ── PHONES CAP THE LONGEST SIDE ──
       Measured on a 430x932@3 iPhone: this container is 1243x1243 CSS px — a
       square far larger than the screen — so the backing store came out
       1864x1864. That is 3.47 Mpx of half-float, and engine.size() allocates
       the scene target plus up to 7 mip and 7 upsample targets on top of it.

       Both sides are scaled by the SAME factor, so the aspect the shader
       renders is untouched and the lensing cannot stretch — only the pixel
       count changes. 1864 -> 1024 is a 3.3x cut in area across all 15 targets.

       ⚠️ Deliberately NOT a clamp to innerWidth/innerHeight: that would change
       the aspect ratio of a deliberately square container and distort the
       black hole. Uniform scaling is the only safe way to spend fewer pixels
       here. Desktop is untouched. */
    const coarse = typeof matchMedia === 'function'
      && matchMedia('(pointer: coarse)').matches;
    if (coarse) {
      const k = Math.min(1, 1024 / Math.max(pw, ph));
      pw = Math.max(Math.round(pw * k), 16);
      ph = Math.max(Math.round(ph * k), 16);
    }
    engine.size(pw, ph);
  }
  size();

  // Runtime, not construction-time.
  //
  // The fall borrows the intro's OWN beat rather than painting a second black
  // hole on top of it — which is what made the Endurance vanish, since an
  // overlay covers the whole scene. But the intro drives this same beat by
  // scroll and must never dive, so the flag has to be switchable rather than
  // baked in when the beat is built.
  let CONFIG_DIVE = opts.dive === true;

  function stateAt(p, tSec) {
    // Emergence: far + dark → settled framing. Swallow: exposure white-out.
    const emerge = smooth(clamp01(p / 0.22));   // meets the fading flare
    const swallow = smooth(clamp01((p - 0.75) / 0.25));
    const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * tSec) / CONFIG.breathing.period);

    /* DIVE — opt-in, and off for every existing caller.
       The intro's beat settles the camera at distMul 1 by p=0.22 and stays
       there: emergence, then a white swallow. That is an APPROACH. Projects
       needs the visitor to go THROUGH the horizon, so when dive is on, the
       back three-quarters of the scrub keeps closing the distance instead of
       holding it — 1x down to 0.06x, which is inside. The disk blazes as it
       passes, then there is nothing to light, which is the arrival.
       Nothing above this line changed, so the intro beat is untouched. */
    const dive = CONFIG_DIVE ? smooth(clamp01((p - 0.25) / 0.75)) : 0;
    const distMul = (2.6 - 1.6 * emerge) * (1 - 0.94 * dive);

    return {
      tSec,
      yawRad: 0, pitchRad: 0,           // site scroll owns the camera here;
      distOffset: 0,                     // drift via distMul keeps it simple
      distMul,
      exposureMul: (0.05 + 0.95 * emerge) * (1 + 14 * swallow * swallow)
        // Crossing the disk blazes; past it there is nothing left to light.
        * (1 + 6 * dive * (1 - dive) * 4),
      breath,
      cursorBoost: 0,
      lean: { x: 0, y: 0 },
      pulse: 0,
      reduced: false,
    };
  }

  function syncOpacity() {
    // Lives here, not in render(): on reverse, tick() early-returns at p=0 and
    // a render-side opacity update would leave the last frame stuck on top.
    canvas.style.opacity = progress <= 0.0005 ? '0'
      : String(Math.min(progress / 0.04, 1).toFixed(3));
  }

  function render() {
    if (disposed) return;
    // The flight sky/room can hide this canvas, and Projects covers its host.
    // Keep advancing t outside this draw guard so a later reveal preserves
    // the authored gas clock. No visible fraction of a fade is skipped.
    if (document.documentElement.classList.contains('is-in-world')) return;
    if (canvas.checkVisibility
      ? !canvas.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : getComputedStyle(canvas).opacity === '0' || getComputedStyle(container).opacity === '0') return;
    engine.render(stateAt(progress, t));
  }

  if (opts.reducedMotion) {
    // One still, no loop: visible whenever progress > 0, no churn, no drift.
    render();
    return {
      setDive(on) { CONFIG_DIVE = on === true; },
      setProgress(p) { progress = clamp01(p); syncOpacity(); render(); },
      advance() {},
      tick() {},
      resize() { size(); render(); },
      dispose() { disposed = true; canvas.remove(); },
      canvas,
    };
  }

  function advance(dt) {
    if (disposed || progress <= 0) return;
    t += Math.min(dt, 0.1);
  }

  return {
    setDive(on) { CONFIG_DIVE = on === true; },
    setProgress(p) { progress = clamp01(p); syncOpacity(); },
    // Projects preserves its existing clock contribution without submitting
    // a second raymarch; the shared site ticker remains the render driver.
    advance,
    tick(dt) {
      if (disposed || progress <= 0) return;
      advance(dt);                    // churn lives on its own clock
      render();
    },
    resize() { size(); },
    dispose() { disposed = true; canvas.remove(); },
    canvas,
  };
}
