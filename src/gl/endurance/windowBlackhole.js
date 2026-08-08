/**
 * The real Gargantua behind the contact room's window.
 *
 * Same engine as the intro's exit beat — shaders are injected as strings by
 * the caller (Vite ?raw), never fetched, so this works in the built bundle.
 *
 * Cheap enough to sit behind a photographic plate because the canvas covers
 * only the pane's BOUNDING BOX (~18% of the viewport's pixels) and the clip
 * polygon is remapped from stage-% into bbox-% so the hole still lands on the
 * glass. Auto-downgrades, then retires, on slow hardware.
 *
 * Ported from ~/claude code/endurance/src-three/window-bh.js — see that
 * project's SPEC.md for the measured constants and the do-not-regress list.
 */
import { createBlackhole } from "../blackhole/blackhole.js";
import { idleGate } from "../visible.js";

export function paneBBox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

export function remapPolygon(points, bb) {
  return points
    .map(([x, y]) =>
      `${(((x - bb.x0) / bb.w) * 100).toFixed(2)}% ${(((y - bb.y0) / bb.h) * 100).toFixed(2)}%`)
    .join(", ");
}

// Window-build deltas vs the hero's config, all deliberate: the hero assumes
// acres of empty black around the hole; here the disk owns ~59% of a small
// pane, so dust and grain read as dirt and the deepest bloom mips wash the
// whole field. Applied per render (CONFIG is shared with the intro beat).
const WINDOW_GRADE = { grain: 0, hazeGain: 0, wideBoost: 0.55, bloomStrength: 1.18 };

export async function mountWindowBlackhole(host, opts = {}) {
  const { points, shaders, reducedMotion = false, budgetMs = 22 } = opts;
  if (!points || !shaders) return null;
  const bb = paneBBox(points);

  const canvas = document.createElement("canvas");
  canvas.className = "room__bh";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    `position:absolute;left:${bb.x0}%;top:${bb.y0}%;width:${bb.w}%;height:${bb.h}%;` +
    `display:block;pointer-events:none;z-index:2;` +
    `clip-path:polygon(${remapPolygon(points, bb)});`;
  host.appendChild(canvas);

  let engine = null;
  try {
    engine = await createBlackhole(canvas, { shaders });
  } catch (e) {
    console.info("[room] window black hole unavailable:", e?.message || e);
  }
  if (!engine) { canvas.remove(); return null; }

  // Angular size ∝ 1/dist. Measured on this plate: 3.0 → 29.4% of the glass,
  // 2.0 → 47.4%, 1.6 → 59.0% (chosen). Re-measure, never eyeball.
  const DIST_MUL = 1.6;
  let scale = reducedMotion ? 0.7 : 0.85;
  let cost = 0, costN = 0, retired = false, lastW = 0, lastH = 0;

  function ensureSize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(16, Math.round(r.width * dpr * scale));
    const h = Math.max(16, Math.round(r.height * dpr * scale));
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; engine.size(w, h); }
    return true;
  }

  /* This hangs in the contact section at the very bottom of the page, but it
     rendered the whole time: measured 847 draw calls a second while the
     visitor was still up in ACT 02. The gate skips the render and releases the
     buffer while the section is off screen; ensureSize rebuilds it on wake,
     which is what clearing lastW/lastH is for. */
  const gate = idleGate(canvas, () => { lastW = 0; lastH = 0; });

  return {
    canvas,
    get retired() { return retired; },
    /** @returns {number} 0..1 — how much warm light the disk is spilling now */
    draw(tSec, cursorBoost = 0) {
      if (retired || !gate.awake() || !ensureSize()) return 0;
      const t0 = performance.now();
      const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * tSec) / 110);
      engine.render({
        tSec, breath, cursorBoost,
        distMul: DIST_MUL, distOffset: 0,
        pitchRad: 0, yawRad: 0,
        reduced: reducedMotion,
        grade: WINDOW_GRADE,
      });
      cost += performance.now() - t0; costN++;
      if (costN === 40) {
        const mean = cost / costN;
        if (mean > budgetMs) {
          if (scale > 0.5) {
            scale = 0.5; lastW = 0; cost = 0; costN = 0;
          } else {
            retired = true;
            canvas.remove();
          }
        }
      }
      return 0.55 + 0.45 * breath;
    },
    dispose() { canvas.remove(); retired = true; },
  };
}
