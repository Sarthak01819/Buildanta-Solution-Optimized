/**
 * The loader's word assembly (D-102, 25 Sep 2026) — after the ARIO entry
 * reference the client supplied: the letters of the hero title start
 * scattered to the screen's edges and travel, one after another, along
 * L-shaped paths (across, then down/up) until they lock into the word; then
 * the pink panel wipes down from the top and the word is simply the site's
 * hero title, already there.
 *
 * The hand-off is exact because nothing is guessed: every letter is a copy of
 * a real `.intro__titleMark .char`, measured for rect, font and colour, and
 * lands on that rect. Re-measured when fonts land and on resize.
 * Paced like the reference (~3.2 s from the moment the letters first show,
 * ASSEMBLY_MS), on the compositor (D-107); the loader shows ENTER only once
 * `complete` AND loading has finished.
 */
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ASSEMBLY_MS = 3200;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // in-out cubic

export function createLoaderAssembly(host) {
  const layer = document.createElement("div");
  layer.className = "preload__letters";
  layer.setAttribute("aria-hidden", "true");
  host.append(layer);

  /* D-107: the letters run as Web Animations on the COMPOSITOR, on the clock.
     They used to be moved from JS every frame and held to the load %, and the
     loader is exactly when the main thread is blocked (shader warm-up: long
     tasks up to ~1.9 s), so they froze and jumped. ENTER still waits for 100 %. */
  let letters = null;      // [{ el, anim }]
  let shownAt = 0;         // when the assembly started (kept across re-measures)

  // the L path, sampled: leg 1 across (first 55 %), leg 2 down/up (last 55 %)
  const STEPS = 24;
  function pathFrames(dx0, dy0) {
    const f = [];
    for (let s = 0; s <= STEPS; s++) {
      const k = s / STEPS;
      const dx = dx0 * (1 - ease(clamp01(k / 0.55)));
      const dy = dy0 * (1 - ease(clamp01((k - 0.45) / 0.55)));
      f.push({ transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)` });
    }
    return f;
  }

  function measure() {
    const chars = [...document.querySelectorAll("#intro .intro__titleMark .char")]
      .filter((c) => c.textContent.trim());
    if (!chars.length) return false;
    const vw = innerWidth, vh = innerHeight;
    letters?.forEach((L) => L.anim?.cancel());
    layer.textContent = "";
    if (!shownAt) shownAt = performance.now();
    const elapsed = performance.now() - shownAt;
    const still = reduced();
    const n = chars.length;
    // deterministic scatter around the edges — neighbours in the word never
    // start next to each other (a stride through the ring)
    const stride = n % 7 === 0 ? 5 : 7;
    let bottom = 0;
    letters = chars.map((c, i) => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      const el = document.createElement("span");
      el.className = "preload__letter";
      el.textContent = c.textContent;
      Object.assign(el.style, {
        left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle, letterSpacing: cs.letterSpacing, color: cs.color,
        lineHeight: `${r.height}px`,
      });
      layer.append(el);
      bottom = Math.max(bottom, r.bottom);
      const slot = (i * stride) % n;
      const a = (slot / n) * Math.PI * 2 - Math.PI * 0.75;
      const sx = vw / 2 + Math.cos(a) * vw * 0.46 - r.width / 2;
      const sy = vh / 2 + Math.sin(a) * vh * 0.42 - r.height / 2;
      const margin = 12;
      const start = {
        x: Math.min(vw - r.width - margin, Math.max(margin, sx)),
        y: Math.min(vh - r.height - margin, Math.max(margin, sy)),
      };
      // left-to-right, overlapping windows, like the reference
      const t0 = 0.06 + (i / Math.max(1, n - 1)) * 0.5;
      if (still) return { el, anim: null };
      const anim = el.animate(pathFrames(start.x - r.left, start.y - r.top), {
        duration: 0.4 * ASSEMBLY_MS, delay: t0 * ASSEMBLY_MS, fill: "both",
      });
      anim.currentTime = elapsed;   // a re-measure continues, never restarts
      return { el, anim };
    });
    host.style.setProperty("--title-bottom", `${Math.round(bottom)}px`);
    return true;
  }

  // Cheap per frame: only builds the letters once the title exists.
  function update() {
    if (!letters) measure();
  }

  const remeasure = () => { letters = null; measure(); };
  document.fonts?.ready.then(remeasure);
  addEventListener("resize", remeasure, { passive: true });

  return {
    update,
    /** every letter has landed */
    get complete() {
      return !letters || letters.every((L) => !L.anim || L.anim.playState === "finished");
    },
    dispose() { removeEventListener("resize", remeasure); letters?.forEach((L) => L.anim?.cancel()); layer.remove(); },
  };
}
