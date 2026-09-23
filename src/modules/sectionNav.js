/**
 * THE BZ SECTIONS — the navbar's brain (D-078, 23 Sep 2026).
 *
 * Five sections on the one pinned film (-100 … 0 BZ, defined by the intro,
 * which only READS its timeline to place them). This module:
 *   · drives the ruler (scrollRuler.js, the Zero reference port) from the
 *     film's raw scroll every frame on the site's single GSAP ticker;
 *   · LOCKS BACK-SCROLL: once a visitor is inside a section they cannot
 *     scroll above its start — wheel (through Lenis' virtualScroll hook, so
 *     a big flick lands exactly ON the start instead of bouncing), keyboard,
 *     touch, and a scroll-position backstop for anything else (scrollbar
 *     drag, iOS momentum). The floor is STICKY: it only rises as the visitor
 *     moves forward, and only a navbar jump lowers it. Forward is free;
 *   · runs a navbar jump under the reference's white overlay: fade in, let
 *     the intro put the door in the right state and move the scroll, wait
 *     for the destination to draw, fade out.
 * The ruler steps aside inside the Projects world and the ship, where the
 * top centre belongs to "← Leave the world" / "← Leave the Ship".
 */
import { createScrollRuler, showNavOverlay } from "./scrollRuler.js";

/* The reference spaces minor ticks every 10 of ITS scroll units; one native
   viewport-height of ours is ~35 of those (the pacing D-076 measured), so
   feeding the ruler mirror-scaled lengths keeps the reference's tick rhythm. */
const MIRROR_VH_PER_VH = 35;
/* The wall → ride-end span is under one viewport of scroll, which at true
   scale put the -25 BZ and 0 BZ marks ~36px apart and their labels on top of
   each other. Each section gets at least this much RULER (8 tick spacings);
   the ruler is then driven piecewise, so scroll itself is never rescaled. */
const MIN_SECTION = 80;
const BACK_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

export function createSectionNav({ intro, lenis }) {
  if (!intro?.sections || !intro?.st) return null;
  const html = document.documentElement;
  const ids = intro.sections.map((s) => s.id);

  let floorIndex = 0;       // sticky: rises with the visitor, lowered by jumps
  let busy = false;         // a navbar jump is running
  let revealed = false;     // the preloader has lifted
  let shown = false;        // is the ruler on screen right now

  const raws = () => intro.sectionRaws();
  const floorY = () => Math.floor(intro.yForRaw(raws()[floorIndex]));
  const locked = () => !busy && !intro.portalRiding;
  const scrollNow = () => (lenis ? lenis.scroll : scrollY);

  /* Ruler lengths per section (mirror units, floored at MIN_SECTION) and
     where each starts on the ruler, 0..1. */
  const display = (() => {
    const r = raws();
    const scale = intro.totalScrollLength * MIRROR_VH_PER_VH;
    const lengths = r.map((start, i) =>
      Math.max(MIN_SECTION, ((i + 1 < r.length ? r[i + 1] : 1) - start) * scale));
    const total = lengths.reduce((a, b) => a + b, 0);
    const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0) / total);
    return { lengths, total, starts };
  })();
  // raw scroll → ruler progress, linear inside each section
  function rulerProgress(raw, index) {
    const r = raws();
    const end = index + 1 < r.length ? r[index + 1] : 1;
    const local = Math.min(1, Math.max(0, (raw - r[index]) / Math.max(1e-9, end - r[index])));
    return display.starts[index] + local * display.lengths[index] / display.total;
  }

  const ruler = createScrollRuler({
    segments: intro.sections.map((s, i) => ({ ...s, scrollVh: display.lengths[i] })),
    navItems: intro.sections,
  });
  ruler.onStageClick((id) => go(id));
  ruler.setVisible(false);

  /* ── the back-lock ── */
  if (lenis) {
    lenis.options.virtualScroll = (data) => {
      if (!locked() || data.deltaY >= 0 || data.event.ctrlKey) return true;
      const floor = floorY();
      const target = lenis.targetScroll;
      if (target + data.deltaY >= floor) return true;
      if (target <= floor + 0.5) {
        if (data.event.cancelable) data.event.preventDefault();
        return false;
      }
      data.deltaY = floor - target;          // land exactly on the start
      return true;
    };
  }
  const editable = (el) => el?.closest?.("input, textarea, select, [contenteditable]");
  /* Keys jump far in one go (Home = the top), so they are never left to the
     browser: the step is taken here and stops ON the floor. */
  const onKey = (e) => {
    if (!locked() || editable(e.target)) return;
    const back = BACK_KEYS.has(e.key) || (e.key === " " && e.shiftKey);
    if (!back) return;
    e.preventDefault();
    const step = e.key === "Home" ? Infinity : e.key === "ArrowUp" ? 100 : innerHeight * 0.85;
    const y = Math.max(floorY(), scrollNow() - step);
    if (lenis) lenis.scrollTo(y, { duration: 0.6 });
    else scrollTo({ top: y, behavior: "smooth" });
  };
  addEventListener("keydown", onKey, { capture: true });
  // Touch scrolls natively (Lenis has no syncTouch here): stop a downward
  // drag at the floor before the page moves; the backstop catches momentum.
  let touchY = null;
  const onTouchStart = (e) => { touchY = e.touches[0]?.clientY ?? null; };
  const onTouchMove = (e) => {
    const y = e.touches[0]?.clientY;
    if (touchY === null || y === undefined) return;
    const down = y > touchY;
    touchY = y;
    if (down && locked() && e.cancelable && scrollNow() <= floorY() + 2) e.preventDefault();
  };
  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchmove", onTouchMove, { passive: false });
  const backstop = () => {
    if (!locked()) return;
    const floor = floorY();
    if (scrollNow() < floor - 1) {
      if (lenis) lenis.scrollTo(floor, { immediate: true, force: true });
      else scrollTo(0, floor);
    }
  };
  const offBackstop = lenis
    ? lenis.on("scroll", backstop)
    : (addEventListener("scroll", backstop, { passive: true }),
      () => removeEventListener("scroll", backstop));

  /* ── the jump ── */
  async function go(id) {
    const index = ids.indexOf(id);
    if (busy || index < 0) return;
    busy = true;
    try {
      const overlay = await showNavOverlay();
      try {
        await intro.goToSection(id);
        floorIndex = index;
      } finally {
        await overlay.hide();
      }
    } finally {
      busy = false;
    }
  }

  /* ── per frame ── */
  function tick() {
    const raw = intro.raw;
    const index = intro.sectionIndexAt(raw);
    if (!busy && index > floorIndex) floorIndex = index;
    // at 0 BZ the ruler rests on its mark, like the reference's stage 5
    ruler.update(index === ids.length - 1 ? display.starts[index] : rulerProgress(raw, index));
    ruler.setActiveSegment(ids[index]);
    ruler.setTheme(intro.lightBackdrop ? "ink" : "light");
    const away = html.classList.contains("is-in-world") || html.classList.contains("is-falling")
      || html.classList.contains("finale-flight")
      || (window.__worldFall && window.__worldFall.state !== "out");
    shown = revealed && !away;
    ruler.setVisible(shown);
    ruler.setNavEnabled(!busy && !intro.portalRiding && !away);
  }

  const api = {
    go,
    tick,
    /** the preloader has lifted: bring the ruler in */
    reveal() { revealed = true; },
    state() {
      const r = raws();
      return {
        sections: intro.sections.map((s, i) => ({ ...s, raw: r[i] })),
        activeId: ids[intro.sectionIndexAt(intro.raw)],
        floorRaw: r[floorIndex],
        busy,
        visible: shown,
        theme: intro.lightBackdrop ? "ink" : "light",
      };
    },
    dispose() {
      removeEventListener("keydown", onKey, { capture: true });
      removeEventListener("touchstart", onTouchStart);
      removeEventListener("touchmove", onTouchMove);
      offBackstop();
      if (lenis) lenis.options.virtualScroll = undefined;
      ruler.dispose();
    },
  };
  if (import.meta.env?.DEV) window.__sectionNav = api;
  return api;
}
