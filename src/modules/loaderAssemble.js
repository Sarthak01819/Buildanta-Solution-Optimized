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
 * ASSEMBLY_MS) but never ahead of the real loading progress; the loader shows
 * ENTER only once `complete`.
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

  let letters = null;      // [{ el, target:{x,y}, start:{x,y}, t0, t1 }]
  let lastP = 0;
  let shownAt = 0;         // first frame the letters were on screen
  let a = 0;               // assembly progress actually drawn

  function measure() {
    const chars = [...document.querySelectorAll("#intro .intro__titleMark .char")]
      .filter((c) => c.textContent.trim());
    if (!chars.length) return false;
    const vw = innerWidth, vh = innerHeight;
    layer.textContent = "";
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
      return { el, target: { x: r.left, y: r.top }, start, t0, t1: t0 + 0.4 };
    });
    host.style.setProperty("--title-bottom", `${Math.round(bottom)}px`);
    update(lastP, true);
    return true;
  }

  function update(p, force = false) {
    lastP = p;
    if (!letters && !measure()) return;
    if (!force && !letters) return;
    if (!shownAt) shownAt = performance.now();
    const still = reduced();
    a = still ? 1 : Math.min((performance.now() - shownAt) / ASSEMBLY_MS, p);
    for (const L of letters) {
      const k = clamp01((a - L.t0) / (L.t1 - L.t0));
      // leg 1 across (first 55 %), leg 2 down/up (last 55 %) — an L, not a diagonal
      const kx = ease(clamp01(k / 0.55));
      const ky = ease(clamp01((k - 0.45) / 0.55));
      const dx = (L.start.x - L.target.x) * (1 - kx);
      const dy = (L.start.y - L.target.y) * (1 - ky);
      L.el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }
  }

  const remeasure = () => { letters = null; measure(); };
  document.fonts?.ready.then(remeasure);
  addEventListener("resize", remeasure, { passive: true });

  return {
    update,
    /** every letter has landed */
    get complete() { return !letters || a >= 0.97; },
    dispose() { removeEventListener("resize", remeasure); layer.remove(); },
  };
}
