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
import { mountFlightSky } from "../gl/endurance/flightSky.js";

/* At :5291 the visitor scrubs this; 8s is about the rate a steady scroll
   covers it, and with progress now linear that is what sets the pace. */
const FLIGHT_SECONDS = 8;

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function createFinaleRoom({ blackholeHost, roomSection, shaders, reduced = false, lite = false }) {
  if (!blackholeHost || !roomSection) return null;

  /* The portal is the DOOR, not the destination: holding it open rides you
     through to the site own Gargantua beat, which is when `.intro__blackhole`
     goes `solid` with its canvas live. That is the black hole the visitor
     ends on, so that is what the Endurance orbits beside — no second engine,
     no second raymarch. (An earlier read of "the beat never becomes visible"
     came from a probe that scrolled to the end without ever riding through.) */

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

  const ship = reduced ? null : createShip(blackholeHost, { reducedMotion: reduced, lite });

  /* What holds the screen at the end of this flow is the PORTAL — its own
     `on` class is the honest signal that the finale has arrived. The
     black-hole beat has already handed over by then, so gating on
     `beat.local` shows nothing (measured: beat local stays 0 while the
     portal is what the visitor is looking at). */
  let beatLive = false;      // has the visitor ridden through to Gargantua?
  let bgShifted = false;     // is the black-hole canvas currently offset?
  let sky = null, skyPending = false, t = 21;   // the flight's own black hole

  function ensureSky() {
    if (sky || skyPending || reduced || !shaders) return;
    skyPending = true;
    mountFlightSky(blackholeHost, { shaders, reducedMotion: reduced, lite })
      .then((s2) => { sky = s2; })
      .catch(() => {});
  }
  let flight = 0;            // 0 = outside, 1 = fully inside the room
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
    ensureSky();
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
    /* The reference's arrival, verbatim (src-three/main.js): an asymmetric
       bloom that swells from 0.58, peaks at 0.855 and clears by 0.995, with
       the room crossfading 0.74 -> 0.97 underneath it. Same numbers, same
       progress space — so the transition is timed exactly as it is there. */
    const rise = smoothstep(0.58, 0.855, flight);
    const fall = 1 - smoothstep(0.855, 0.995, flight);
    flash.style.opacity = (reduced ? 0 : Math.min(rise, fall) * 0.97).toFixed(3);

    const roomFade = reduced ? (flight > 0.8 ? 1 : 0) : smoothstep(0.74, 0.97, flight);
    roomSection.style.opacity = roomFade.toFixed(3);
    roomSection.style.transform = `scale(${(1.055 - 0.055 * roomFade).toFixed(4)})`;
    roomSection.style.setProperty("--room-zoom", "1");
    roomSection.style.setProperty("--ui-in", "1");
    roomSection.style.pointerEvents = roomFade > 0.85 ? "" : "none";
    roomSection.setAttribute("aria-hidden", roomFade > 0.5 ? "false" : "true");
    roomSection.classList.toggle("room--live", roomFade > 0.002);

    // the black hole and the ship dim out as the room takes the frame
    const outside = 1 - roomFade;
    blackholeHost.style.opacity = outside.toFixed(3);
    cta.classList.toggle("finale-cta--gone", flight > 0.02);
    document.documentElement.classList.toggle("finale-inside", roomFade > 0.85);
  }

  function syncBeat() {
    // `solid` is set the moment the ride lands on Gargantua
    const live = blackholeHost.classList.contains("solid");
    if (live === beatLive) return;
    beatLive = live;
    if (live) ship?.load();
    // rewinding back out of the finale must also put us outside the room
    if (!live && flight > 0) { tweening = false; applyFlight(0); }
    if (!live) cta.classList.remove("finale-cta--in");
  }
  const beatWatch = new MutationObserver(syncBeat);
  beatWatch.observe(blackholeHost, { attributes: true, attributeFilter: ["class"] });
  syncBeat();

  const api = {
    /** kept for the caller; the portal observer is what actually drives this */
    setBeat() {},
    setCursor(nx, ny) { ship?.setCursor(nx, ny); },
    tick(dt) {
      cta.classList.toggle("finale-cta--in", beatLive && flight <= 0.02);
      if (tweening) {
        const k = Math.min(1, (performance.now() - tweenT0) / tweenDur);
        /* LINEAR. This is the piece that made the site's flight differ from
           the reference: there, the visitor SCRUBS it, so progress advances at
           a steady rate and the rail's own pow(0.62) easing is the only shape
           in the system. Putting a tween curve on top multiplied two curves
           together and changed the whole motion profile. The auto-flight now
           advances progress at a constant rate — the closest honest stand-in
           for a steady scroll — and every bit of shaping comes from the rail,
           exactly as at :5291. */
        const s = k;
        applyFlight(tweenFrom + (tweenTo - tweenFrom) * s);
        if (k >= 1) tweening = false;
      }
      // The model arrives asynchronously; keep visibility in sync every frame
      // rather than only on the portal's class change, or a ship that loads
      // after the finale opens never appears.
      if (ship) {
        const want = beatLive && ship.ready ? "1" : "0";
        if (ship.canvas.style.opacity !== want) ship.canvas.style.opacity = want;
      }
      ship?.tick(dt);

      /* Move the black hole with the flight. It renders on its own canvas
         with its own camera, so without this it stays pinned while everything
         else travels — the single strongest "nothing is moving" tell. Shifting
         that canvas by the camera's own turn makes the one far landmark in
         frame behave like a far landmark. transform only, so it composites. */
      const beatCanvas = blackholeHost.querySelector("canvas:not(.finale-ship):not(.finale-sky)");
      const flying = flight > 0.0005;

      if (flying && sky && !sky.retired) {
        /* The swap Yash chose: the moment the flight starts, the site's fixed
           black hole hands over to one rendered from the flight camera. Same
           engine, same framing at the handover point, so the change is
           invisible — and from then on the hole moves because it is genuinely
           being viewed from where we are. */
        t += dt;
        sky.draw(t, ship.skyView());
        sky.setVisible(true);
        if (beatCanvas) beatCanvas.style.opacity = "0";
        bgShifted = true;
      } else if (flying && beatCanvas) {
        // no flight sky (weak device, or it retired): fall back to nudging
        // the static canvas rather than leaving it dead still
        const s2 = ship.backgroundShift();
        beatCanvas.style.transform =
          `translate3d(${s2.x.toFixed(1)}px, ${s2.y.toFixed(1)}px, 0) scale(1.5)`;
        beatCanvas.style.opacity = (1 - smoothstep(0.18, 0.62, flight)).toFixed(3);
        bgShifted = true;
      } else if (bgShifted) {
        sky?.setVisible(false);
        if (beatCanvas) {
          beatCanvas.style.transform = "";
          beatCanvas.style.opacity = "";
        }
        bgShifted = false;
      }
    },
    state() { return { beatLive, flight, ship: ship?.state?.() ?? null }; },
    dispose() {
      beatWatch.disconnect();
      removeEventListener("wheel", onWheel);
      removeEventListener("keydown", onKey);
      sky?.dispose();
      ship?.dispose();
      cta.remove();
      flash.remove();
    },
  };

  // dev handle — the finale's framing is tuned by measuring, not by eye
  if (import.meta.env?.DEV) window.__finale = api;
  return api;
}
