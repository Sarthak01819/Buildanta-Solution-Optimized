/**
 * FINALE MODE, part two — the black hole is no longer the last thing.
 *
 * The Endurance orbits beside Gargantua once the beat has settled; a Contact
 * control flies you into it, and the ship's sitting module becomes the site's
 * final surface. Scrolling up flies you back out, like everything else in
 * this intro.
 *
 * The room's markup is the SAME `#contact` section the normal site uses — in
 * finale mode this module relocates that node to <body> and switches it to a
 * fixed overlay. One markup, one stylesheet, two presentations: nothing to
 * keep in sync, and turning finale mode off leaves an ordinary contact page.
 *
 * Flight constants are the measured ones from ~/claude code/endurance:
 * a 10s flight whose TRAVEL (not scrollTop) eases in and out, and a bloom
 * that peaks on the crossfade's midpoint so the two scenes are never both
 * legible — that is what turns a dissolve into an arrival.
 */
import { createShip } from "../gl/endurance/ship.js";
import { mountFinaleGargantua } from "../gl/endurance/finaleGargantua.js";

const FLIGHT_SECONDS = 10;

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function createFinaleRoom({ portalWrap, roomSection, shaders, reduced = false, lite = false }) {
  if (!portalWrap || !roomSection) return null;

  /* Gargantua ends the film. The nebula portal keeps its place earlier in the
     journey; once it has settled, this stage rises over it and the Endurance
     is beside the hole. Own layer, own engine — see finaleGargantua.js. */
  const stage = document.createElement("div");
  stage.className = "finale-stage";
  stage.setAttribute("aria-hidden", "true");
  document.body.appendChild(stage);
  let garg = null;

  // Relocate the room out of the hidden <main> and make it a fixed overlay.
  document.body.appendChild(roomSection);
  roomSection.classList.add("room--finale");
  roomSection.setAttribute("aria-hidden", "true");

  const cta = document.createElement("button");
  cta.type = "button";
  cta.className = "finale-cta";
  cta.textContent = "Contact us";
  document.body.appendChild(cta);

  const flash = document.createElement("div");
  flash.className = "finale-flash";
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);

  const ship = reduced ? null : createShip(stage, { reducedMotion: reduced, lite });

  /* What holds the screen at the end of this flow is the PORTAL — its own
     `on` class is the honest signal that the finale has arrived. The
     black-hole beat has already handed over by then, so gating on
     `beat.local` shows nothing (measured: beat local stays 0 while the
     portal is what the visitor is looking at). */
  let portalLive = false;
  let flight = 0;            // 0 = outside, 1 = fully inside the room
  let stageIn = 0;           // 0 = portal owns the screen, 1 = Gargantua does
  let t = 21;                // scene clock (s) — starts on a handsome frame

  function ensureGargantua() {
    if (garg || ensureGargantua.started || reduced) return;
    ensureGargantua.started = true;
    mountFinaleGargantua(stage, { shaders, reducedMotion: reduced, lite })
      .then((g) => { garg = g; })
      .catch(() => {});
  }
  let tweenFrom = 0, tweenTo = 0, tweenT0 = 0, tweenDur = 0, tweening = false;

  function startFlight(to, seconds) {
    tweenFrom = flight;
    tweenTo = to;
    tweenDur = Math.max(0.001, seconds) * 1000;
    tweenT0 = performance.now();
    tweening = true;
  }

  cta.addEventListener("click", () => {
    ship?.load();
    if (reduced) { applyFlight(1); return; }   // no cinematic for reduced motion
    startFlight(1, FLIGHT_SECONDS);
  });

  /* Getting out. While the room owns the screen the page must not scroll —
     the intro is pinned behind it, and a stray scroll would rewind the black
     hole underneath the room. So wheel-up drives the flight backwards
     instead, and only releases once we are outside again. */
  const onWheel = (e) => {
    if (flight <= 0.0001) return;
    e.preventDefault();
    if (e.deltaY < 0) {                       // scrolling up = leave
      tweening = false;
      applyFlight(flight + e.deltaY * 0.0016);
    }
  };
  addEventListener("wheel", onWheel, { passive: false });

  const onKey = (e) => {
    if (flight > 0.0001 && e.key === "Escape" &&
        !roomSection.classList.contains("room--drawer")) {
      startFlight(0, 2.4);
    }
  };
  addEventListener("keydown", onKey);

  // Touch: a downward drag inside the room means "take me back out"
  let touchY = null;
  addEventListener("touchstart", (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (flight <= 0.0001 || touchY === null) return;
    const y = e.touches[0]?.clientY ?? touchY;
    const dy = y - touchY;
    touchY = y;
    if (dy > 0) { tweening = false; applyFlight(flight - dy * 0.0022); }
  }, { passive: true });

  function applyFlight(v) {
    flight = Math.min(1, Math.max(0, v));
    ship?.setFlyIn(flight);

    // Bloom carries the handover: a long swell, peaking on the crossfade's
    // midpoint, then a shorter clear.
    const rise = smoothstep(0.58, 0.855, flight);
    const fall = 1 - smoothstep(0.855, 0.995, flight);
    flash.style.opacity = (Math.min(rise, fall) * 0.97).toFixed(3);

    const roomFade = reduced ? (flight > 0.5 ? 1 : 0) : smoothstep(0.74, 0.97, flight);
    roomSection.style.opacity = roomFade.toFixed(3);
    roomSection.style.transform = `scale(${(1.055 - 0.055 * roomFade).toFixed(4)})`;
    roomSection.style.pointerEvents = roomFade > 0.85 ? "" : "none";
    roomSection.setAttribute("aria-hidden", roomFade > 0.5 ? "false" : "true");
    roomSection.classList.toggle("room--live", roomFade > 0.002);

    // the black hole and the ship dim out as the room takes the frame
    const outside = 1 - roomFade;
    stage.style.opacity = (stageIn * outside).toFixed(3);
    cta.classList.toggle("finale-cta--gone", flight > 0.02);
    document.documentElement.classList.toggle("finale-inside", roomFade > 0.85);
  }

  function syncPortal() {
    const live = portalWrap.classList.contains("on") &&
                 !portalWrap.classList.contains("gone");
    if (live === portalLive) return;
    portalLive = live;
    if (live) { ship?.load(); ensureGargantua(); }
    if (ship) ship.canvas.style.opacity = live && ship.ready ? "1" : "0";
    // scrolling back up out of the finale must also put us outside the room
    if (!live && flight > 0) { tweening = false; applyFlight(0); }
  }
  const portalWatch = new MutationObserver(syncPortal);
  portalWatch.observe(portalWrap, { attributes: true, attributeFilter: ["class"] });
  syncPortal();

  return {
    /** kept for the caller; the portal observer is what actually drives this */
    setBeat() {},
    setCursor(nx, ny) { ship?.setCursor(nx, ny); garg?.setCursor(nx, ny); },
    tick(dt) {
      t += dt;
      /* The stage rises once the portal has fully settled (its own `hint`
         state is the honest cue that it is done talking), and only while we
         are not already flying. 1.8s is long enough to read as an opening,
         short enough not to feel like a wait. */
      const wantStage = portalLive && portalWrap.classList.contains("hint");
      const target = wantStage ? 1 : 0;
      if (stageIn !== target) {
        stageIn = target > stageIn
          ? Math.min(1, stageIn + dt / 1.8)
          : Math.max(0, stageIn - dt / 0.9);
        applyFlight(flight);            // re-applies stage opacity
      }
      if (stageIn > 0.002 && garg && !garg.retired) garg.draw(t, 0);
      cta.classList.toggle("finale-cta--in", stageIn > 0.85 && flight <= 0.02);

      if (tweening) {
        const k = Math.min(1, (performance.now() - tweenT0) / tweenDur);
        // TRAVEL eases, not the raw parameter: the camera rail already
        // front-loads its own curve, and easing both multiplies into a lurch
        const s = k * k * k * (k * (k * 6 - 15) + 10);
        applyFlight(tweenFrom + (tweenTo - tweenFrom) * s);
        if (k >= 1) tweening = false;
      }
      // The model arrives asynchronously; keep visibility in sync every frame
      // rather than only on the portal's class change, or a ship that loads
      // after the finale opens never appears.
      if (ship) {
        const want = portalLive && ship.ready ? "1" : "0";
        if (ship.canvas.style.opacity !== want) ship.canvas.style.opacity = want;
      }
      ship?.tick(dt);
    },
    state() { return { portalLive, stageIn, flight, ship: ship?.state?.() ?? null }; },
    dispose() {
      portalWatch.disconnect();
      garg?.dispose();
      stage.remove();
      removeEventListener("wheel", onWheel);
      removeEventListener("keydown", onKey);
      ship?.dispose();
      cta.remove();
      flash.remove();
    },
  };
}
