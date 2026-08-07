/**
 * Gargantua as the site's last screen — full frame, live, with the Endurance
 * beside it.
 *
 * Why its own instance rather than the intro's black-hole beat: that beat is
 * wired into the pinned intro's state machine (unlock flags, portal wall,
 * white-out handoff) and, in finale mode, it never becomes visible — measured
 * opacity 0 at every scroll position, with the nebula portal holding the
 * screen instead. Reviving it would mean editing a sequence with a lot of
 * hard-won behaviour in it. A self-contained layer that fades in over the
 * portal gets the same picture with none of that risk.
 */
import { createBlackhole } from "../blackhole/blackhole.js";

export async function mountFinaleGargantua(host, { shaders, reducedMotion = false, lite = false }) {
  if (!shaders) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "finale-bh";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
  host.appendChild(canvas);

  let engine = null;
  try {
    engine = await createBlackhole(canvas, { shaders });
  } catch (e) {
    console.info("[finale] Gargantua unavailable:", e?.message || e);
  }
  if (!engine) { canvas.remove(); return null; }

  let scale = reducedMotion ? 0.7 : (lite ? 0.6 : 0.85);
  let lastW = 0, lastH = 0, cost = 0, costN = 0, retired = false;
  const lean = { x: 0, y: 0 };

  function ensureSize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(16, Math.round((host.clientWidth || innerWidth) * dpr * scale));
    const h = Math.max(16, Math.round((host.clientHeight || innerHeight) * dpr * scale));
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; engine.size(w, h); }
  }

  return {
    canvas,
    get retired() { return retired; },
    setCursor(nx, ny) { lean.x = nx; lean.y = ny; },
    /** @returns {number} the disk's breath, for the room's light to follow */
    draw(tSec, cursorBoost = 0) {
      if (retired) return 0;
      ensureSize();
      const t0 = performance.now();
      const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * tSec) / 110);
      engine.render({
        tSec, breath, cursorBoost,
        // full-frame framing: CONFIG's own camera, which is what the hero
        // was tuned against — no distMul here, unlike the room's window
        distMul: 1, distOffset: 0,
        pitchRad: 0, yawRad: 0,
        lean, reduced: reducedMotion,
      });
      cost += performance.now() - t0; costN++;
      if (costN === 45) {
        const mean = cost / costN;
        if (mean > 26) {
          if (scale > 0.5) { scale = 0.5; lastW = 0; cost = 0; costN = 0; }
          else { retired = true; canvas.remove(); }
        }
      }
      return breath;
    },
    dispose() { canvas.remove(); retired = true; },
  };
}
