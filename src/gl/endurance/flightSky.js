/**
 * The black hole, rendered from the FLIGHT camera.
 *
 * The site's own beat draws Gargantua on a fixed full-screen canvas with its
 * own camera, so during a flight it sits still while everything else travels —
 * the single loudest "nothing is moving" tell, and the reason earlier passes
 * needed CSS trickery to nudge it. This instance is driven by the ship
 * camera's own yaw, pitch and distance, so the hole turns and falls behind
 * like a real object because it is being looked at from where you actually are.
 *
 * Same engine as the beat (shaders injected, Vite ?raw). Auto-downgrades on
 * slow hardware, then retires so the caller can fall back to the static
 * backdrop rather than stuttering.
 */
import { createBlackhole } from "../blackhole/blackhole.js";

// The beat's own values assume a full-screen hero; in flight the disk is a
// backdrop behind a lit ship, so dust and grain only muddy it.
const FLIGHT_GRADE = { grain: 0, hazeGain: 0, wideBoost: 0.6, bloomStrength: 1.15 };

export async function mountFlightSky(host, { shaders, reducedMotion = false, lite = false }) {
  if (!shaders) return null;

  const canvas = document.createElement("canvas");
  canvas.className = "finale-sky";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;" +
    "pointer-events:none;opacity:0;z-index:1;";
  host.appendChild(canvas);

  let engine = null;
  try {
    engine = await createBlackhole(canvas, { shaders });
  } catch (e) {
    console.info("[finale] flight sky unavailable:", e?.message || e);
  }
  if (!engine) { canvas.remove(); return null; }

  let scale = reducedMotion ? 0.6 : (lite ? 0.55 : 0.8);
  let lastW = 0, lastH = 0, cost = 0, costN = 0, retired = false;

  function ensureSize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(16, Math.round((host.clientWidth || innerWidth) * dpr * scale));
    const h = Math.max(16, Math.round((host.clientHeight || innerHeight) * dpr * scale));
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; engine.size(w, h); }
  }

  return {
    canvas,
    get retired() { return retired; },
    /**
     * @param {number} tSec   scene clock
     * @param {{yaw:number,pitch:number,distMul:number}} view  from the flight camera
     */
    draw(tSec, view) {
      if (retired) return;
      ensureSize();
      const t0 = performance.now();
      engine.render({
        tSec,
        breath: 0.5 - 0.5 * Math.cos((2 * Math.PI * tSec) / 110),
        cursorBoost: 0,
        // this is the whole point: the hole is seen from where the flight is
        yawRad: view.yaw, pitchRad: view.pitch,
        distMul: view.distMul, distOffset: 0,
        reduced: reducedMotion,
        grade: FLIGHT_GRADE,
      });
      cost += performance.now() - t0; costN++;
      if (costN === 45) {
        const mean = cost / costN;
        if (mean > 24) {
          if (scale > 0.45) { scale = 0.45; lastW = 0; cost = 0; costN = 0; }
          else { retired = true; canvas.remove(); }   // caller falls back
        }
      }
    },
    setVisible(v) { if (!retired) canvas.style.opacity = v ? "1" : "0"; },
    dispose() { canvas.remove(); retired = true; },
  };
}
