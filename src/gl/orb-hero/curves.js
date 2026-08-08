/**
 * Dependency-free curves.
 *
 * Split out of ease.js so the hero module can be lifted into another codebase
 * without dragging GSAP + CustomEase along with it — ease.js registers a GSAP
 * plugin at import time, which is the right thing for this repo's DOM layer and
 * an unwanted side effect anywhere else.
 */

/** easeInOutQuad — the landing hero curve. Reproduced every measured sample
 *  within 0.004 over the reference's ~1,700px window (SPEC Pass 2). */
export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
