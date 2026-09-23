/**
 * TAP & HOLD — the affordance that rides the hole (D-077, Yash 10 Sep 2026:
 * "a tap-and-hold button in that black area; wherever the circle moves, the
 * button also moves with it").
 *
 * This is a SHOW-ONLY layer over the sealed black-hole-portal module:
 *   · pointer-events: none — the module keeps receiving the pointerdown /
 *     hold exactly as before (the visitor taps and holds ON the button and
 *     the module winds the hole down; nothing here intercepts anything);
 *   · every frame it reads `window.__bhp.state()` (the module's public debug
 *     / state hook) and puts its centre where the module puts the hole —
 *     `( x / dpr , (size - y) / dpr )` in CSS pixels, the very expression
 *     the module uses to place its own ENTER button — so it follows the
 *     pointer AND the idle drift without knowing about either;
 *   · the centre is clamped 84 px from the viewport edges, the module's own
 *     ENTER clamp, so when the door opens it opens exactly where this was;
 *   · shown in idle / winding / collapsing / blast; hidden in armed and
 *     entering (the module's real ENTER button takes over) and back when
 *     the hole re-grows (Esc / wheel-back → blast → idle);
 *   · while holding, the ring fills with the collapse progress `c` (0..1)
 *     and the label brightens; released early, the ring empties as `c`
 *     returns — it is a pure function of the module's state, never of time.
 *
 *   · D-078: it also rides the hole while the bill still burns (the wrap is
 *     `.bg`, the sky behind the paper), so the visitor sees the instruction
 *     before the wall. The module is `locked` then, so a hold does nothing
 *     until the wall; CSS fades it with the sky plate (--bill-sky).
 *
 * Reduced motion: no pulse, no fades (CSS); the ring is still direct state.
 * Element ids: none — class-scoped under .intro__portalwrap (page rule).
 */

const EDGE = 84;                 // = the module's ENTER clamp (portal.open())
const SHOWN = new Set(["idle", "winding", "collapsing", "blast"]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createPortalHoldButton(portalWrap, { reduced = false } = {}) {
  if (!portalWrap) return { destroy() {} };

  const el = document.createElement("div");
  el.className = "bh-hold is-off" + (reduced ? " bh-hold--reduced" : "");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<svg class="bh-hold__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<circle class="bh-hold__track" cx="50" cy="50" r="47" pathLength="1"/>' +
      '<circle class="bh-hold__fill" cx="50" cy="50" r="47" pathLength="1"/>' +
    "</svg>" +
    '<span class="bh-hold__label">TAP &amp; HOLD</span>';
  portalWrap.appendChild(el);
  const fill = el.querySelector(".bh-hold__fill");

  let raf = 0;
  let dead = false;
  let lastX = NaN, lastY = NaN, lastC = -1, lastOff = true, lastHold = false;

  const setOff = (off) => {
    if (off === lastOff) return;
    lastOff = off;
    el.classList.toggle("is-off", off);
  };
  const setHold = (hold) => {
    if (hold === lastHold) return;
    lastHold = hold;
    el.classList.toggle("is-hold", hold);
  };
  const setProgress = (c) => {
    if (Math.abs(c - lastC) < 0.002 && c !== 0 && c !== 1) return;
    lastC = c;
    const s = c.toFixed(3);
    fill.style.strokeDashoffset = (1 - c).toFixed(3);   // pathLength=1 ring
    // a zero-length dash still paints its round cap as a dot at 12 o'clock
    fill.style.opacity = c > 0 ? "1" : "0";
    el.style.setProperty("--bh-hold-c", s);
    el.dataset.c = s;                                    // suite-readable
  };

  function frame() {
    raf = 0;
    if (dead) return;
    const bhp = window.__bhp;
    const live = (portalWrap.classList.contains("on") || portalWrap.classList.contains("bg"))
      && bhp && bhp.ready === true && typeof bhp.state === "function";
    if (!live) { setOff(true); setHold(false); schedule(); return; }

    const s = bhp.state();
    const dpr = s.dpr || 1;
    // hole centre in CSS px — the module's own expression for its ENTER door
    const hx = s.x / dpr;
    const hy = (s.size - s.y) / dpr;
    const cx = clamp(hx, EDGE, innerWidth - EDGE);
    const cy = clamp(hy, EDGE, innerHeight - EDGE);
    if (cx !== lastX || cy !== lastY) {
      lastX = cx; lastY = cy;
      // the wrap is pinned to the viewport; measure anyway so the centre is
      // right even if the pin ever lands the wrap off (0,0). Reading a rect
      // with a clean layout is free; the write below is compositor-only.
      const r = portalWrap.getBoundingClientRect();
      el.style.transform = "translate3d(" + (cx - r.left).toFixed(2) + "px,"
        + (cy - r.top).toFixed(2) + "px,0) translate(-50%,-50%)";
    }

    const shown = SHOWN.has(s.phase);
    setOff(!shown);
    setHold(shown && (s.down === true || s.phase === "winding" || s.phase === "collapsing"));
    setProgress(shown ? clamp(s.c || 0, 0, 1) : 0);
    schedule();
  }
  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
  schedule();

  return {
    el,
    destroy() {
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.remove();
    },
  };
}
