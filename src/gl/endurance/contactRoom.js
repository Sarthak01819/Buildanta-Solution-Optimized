/**
 * Contact room — the Endurance's sitting module, with the real black hole
 * outside its window.
 *
 * Anatomy (ported from ~/claude code/endurance, SPEC.md there is canonical):
 *   plate (photographic, 2 seats + table + hexagonal window)
 *   → live black hole clipped to the window's measured pane polygon
 *   → warm light spill on the room's surfaces (breathes with the disk)
 *   → grain + vignette
 *   → the editorial layer, which is REAL DOM: headline, email, pills, drawer.
 *
 * never-hide-content: the copy and every link are plain DOM that render with
 * or without WebGL. If the engine never mounts, the room is still a working
 * contact page — the plate is a background, nothing more.
 *
 * Do-not-regress (learned the hard way, full notes in the module's SPEC):
 *  · plate + pane share ONE aspect-locked stage, or the hole slides off the
 *    glass at other aspects (a `cover` background recrops, a polygon doesn't)
 *  · parallax depth belongs on the canvas INSIDE the clipped element
 *  · nothing may paint over the glass — the spill sits BELOW the bh canvas
 *  · portrait can't show a cover-sized window at all: it scales and pans
 */
import { mountWindowBlackhole } from "./windowBlackhole.js";

// Visible pane of the plate, measured by flood-filling its dark glass
// (luminance ≤ 30) — the boundary already excludes where the table and the
// right-hand chair occlude it, so the sky never draws over furniture.
export const PANE = [
  [87.1, 18.8], [88.61, 21.76], [89.29, 24.63], [89.96, 27.59], [90.59, 30.46],
  [91.32, 33.43], [91.94, 36.3], [92.62, 39.26], [93.24, 42.13], [93.71, 45.09],
  [93.14, 47.96], [92.25, 50.93], [86.06, 53.8], [84.86, 56.76], [84.18, 59.63],
  [83.61, 62.59], [54.93, 59.63], [54, 56.76], [53.32, 53.8], [52.64, 50.93],
  [52.02, 47.96], [51.96, 45.09], [52.64, 42.13], [53.21, 39.26], [53.84, 36.3],
  [54.41, 33.43], [55.09, 30.46], [56.34, 27.59], [70.51, 24.63], [80.51, 21.76],
];

// Ceiling downlights on the plate, as percentages of the stage box
const LIGHTS = [
  { x: 58.5, y: 12.0, d: 0 }, { x: 64.5, y: 10.4, d: 1.3 },
  { x: 71.0, y: 8.8, d: 0.6 }, { x: 78.0, y: 7.4, d: 2.1 },
  { x: 85.5, y: 6.2, d: 1.7 }, { x: 92.5, y: 5.4, d: 0.9 },
];

const PARALLAX = 12;
const STARS_DEPTH = 0.35;   // the far field shifts LESS than the near frame

export function createContactRoom(section, opts = {}) {
  const { shaders, reducedMotion = false } = opts;
  if (!section) return null;

  const stage = section.querySelector("[data-room-stage]");
  const breath = section.querySelector("[data-room-breath]");
  const lightsHost = section.querySelector("[data-room-lights]");
  const drawer = section.querySelector("[data-room-drawer]");
  const openBtn = section.querySelector("[data-room-open]");
  const closeBtn = section.querySelector("[data-room-close]");
  const form = section.querySelector("[data-room-form]");
  if (!stage) return null;

  for (const l of LIGHTS) {
    const d = document.createElement("span");
    d.className = "room__light";
    d.style.left = `${l.x}%`;
    d.style.top = `${l.y}%`;
    d.style.animationDelay = `${l.d}s`;
    lightsHost?.appendChild(d);
  }

  const openDrawer = () => {
    section.classList.add("room--drawer");
    drawer?.setAttribute("aria-hidden", "false");
    // after layout settles — focusing an element the browser still considers
    // off-screen (mid-transform) silently lands on <body>
    requestAnimationFrame(() => drawer?.querySelector("input")?.focus());
  };
  const closeDrawer = () => {
    section.classList.remove("room--drawer");
    drawer?.setAttribute("aria-hidden", "true");
    openBtn?.focus();
  };
  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  // document, not the section: focus can leave the drawer (browser chrome,
  // a click on the plate) and Escape must still close it.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && section.classList.contains("room--drawer")) closeDrawer();
  });
  // Clicking back into the room closes it too — Escape alone leaves phone
  // users with no way out, and the drawer covers the copy there.
  section.addEventListener("pointerdown", (e) => {
    if (!section.classList.contains("room--drawer")) return;
    if (drawer && !drawer.contains(e.target)) closeDrawer();
  });

  // v1 send: compose a mail. TODO(yash): swap for WhatsApp deep-link or a
  // backend once he picks the method — one function, nothing else changes.
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = `Naam: ${f.get("name")}\nContact: ${f.get("reach")}\n\n${f.get("msg")}`;
    location.href =
      `mailto:${form.dataset.mailto}?subject=${encodeURIComponent("Website inquiry — Buildanta")}` +
      `&body=${encodeURIComponent(body)}`;
  });

  const cursor = { x: 0, y: 0 };
  let bh = null, bhPending = false, visible = false, t = 21;

  function ensureBH() {
    if (bh || bhPending || reducedMotion || !shaders) return;
    bhPending = true;
    mountWindowBlackhole(stage, { points: PANE, shaders, reducedMotion })
      .then((mounted) => { bh = mounted; })
      .catch(() => {});
  }

  /* On-screen detection is the room's own job, via IntersectionObserver.
     A ScrollTrigger created while the section is display:none measures 0/0
     and may never toggle afterwards — the site hides <main> behind
     `html.bh-final` until the finale is dismissed, so that is the normal
     boot order here, not an edge case. */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      visible = e.isIntersecting;
      if (visible) ensureBH();
    }
  }, { rootMargin: "10% 0px" });
  io.observe(section);

  return {
    /** Manual override; the observer normally handles this. */
    setVisible(v) {
      visible = v;
      if (v) ensureBH();
    },
    setCursor(nx, ny) { cursor.x = nx; cursor.y = ny; },
    tick(dt) {
      if (!visible) return;
      t += dt;
      let spill = 0;
      if (bh && !bh.retired) spill = bh.draw(t, 0);
      if (breath) {
        if (spill) {
          breath.classList.add("room__breath--live");
          breath.style.opacity = (0.52 + 0.55 * spill).toFixed(3);
        }
      }
      if (reducedMotion) return;
      const tr = (d) =>
        `translate(${(-cursor.x * PARALLAX * d).toFixed(1)}px, ` +
        `${(-cursor.y * PARALLAX * 0.6 * d).toFixed(1)}px)`;
      for (const el of stage.querySelectorAll("[data-depth]")) {
        el.style.transform = tr(parseFloat(el.dataset.depth || "1"));
      }
    },
    dispose() { io.disconnect(); bh?.dispose(); },
  };
}
