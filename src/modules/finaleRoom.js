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

const FLIGHT_SECONDS = 14;   // Yash's call: a real voyage
const ARRIVE_AT = 0.90;      // travel at which the white-out is triggered
const ARRIVE_MS = 1100;      // and how long the whole swap takes — Yash: quick

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function createFinaleRoom({ blackholeHost, roomSection, reduced = false, lite = false }) {
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
  let arriveT0 = 0;          // wall-clock start of the white-out beat
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
    /* THE ARRIVAL. The white-out runs on its OWN short clock, not on flight
       progress: the flight curve decelerates hard into the dock, so anything
       keyed to its last stretch of travel stretches over five or six seconds
       — which is exactly why this felt slow. Here it is a fixed 1.1s beat,
       kicked once the approach is essentially complete.

       Order is the whole trick: the room reaches full opacity BEHIND the
       white while it is at peak. If the white cleared first you would watch
       the room fade up, which is a dissolve — the thing this replaces. */
    let white = 0;
    let roomFade = 0;
    if (reduced) {
      white = 0;
      roomFade = flight > 0.86 ? 1 : 0;
    } else {
      if (flight >= ARRIVE_AT && arriveT0 === 0) arriveT0 = performance.now();
      if (flight < ARRIVE_AT - 0.02) arriveT0 = 0;      // flying back out
      if (arriveT0) {
        const a = Math.min(1, (performance.now() - arriveT0) / ARRIVE_MS);
        white = a < 0.42 ? a / 0.42 : 1 - (a - 0.42) / 0.58;
        roomFade = a >= 0.38 ? 1 : 0;                   // swaps under the white
      }
    }
    flash.style.opacity = white.toFixed(3);
    roomSection.style.opacity = roomFade.toFixed(3);
    roomSection.style.transform = "";
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

  return {
    /** kept for the caller; the portal observer is what actually drives this */
    setBeat() {},
    setCursor(nx, ny) { ship?.setCursor(nx, ny); },
    tick(dt) {
      cta.classList.toggle("finale-cta--in", beatLive && flight <= 0.02);
      if (tweening) {
        const k = Math.min(1, (performance.now() - tweenT0) / tweenDur);
        /* The ONE curve for the whole flight. `flight` is travel and the
           camera consumes it linearly, so this shape is exactly what the eye
           sees. Smootherstep was wrong here: over 14 seconds its slow start
           left roughly five seconds where nothing visibly happened, and the
           whole approach read as sluggish before it read as anything. This
           departs promptly (a short ease-in only to avoid a jerk) and then
           decelerates long into the dock. */
        const s = (1 - Math.pow(1 - k, 1.8)) * smoothstep(0, 0.06, k);
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
      const beatCanvas = blackholeHost.querySelector("canvas:not(.finale-ship)");
      if (beatCanvas && ship && flight > 0.0005) {
        const s2 = ship.backgroundShift();
        // the CANVAS slides, not its host: moving the host would drag its own
        // black backing with it and expose the page behind at the edges
        /* Scale gives the drift somewhere to go without showing the canvas
           edge; the fade is the honest half of it — you are turning away from
           the hole, so it leaves. Together they read as "that landmark is
           behind me now" instead of "the backdrop is nailed to my screen". */
        const zoom = 1 + 0.5 * smoothstep(0, 0.12, flight);
        beatCanvas.style.transform =
          `translate3d(${s2.x.toFixed(1)}px, ${s2.y.toFixed(1)}px, 0) scale(${zoom.toFixed(3)})`;
        beatCanvas.style.opacity = (1 - smoothstep(0.18, 0.62, flight)).toFixed(3);
        bgShifted = true;
      } else if (bgShifted && beatCanvas) {
        beatCanvas.style.transform = "";
        beatCanvas.style.opacity = "";
        bgShifted = false;
      }
    },
    state() { return { beatLive, flight, ship: ship?.state?.() ?? null }; },
    dispose() {
      beatWatch.disconnect();
      removeEventListener("wheel", onWheel);
      removeEventListener("keydown", onKey);
      ship?.dispose();
      cta.remove();
      flash.remove();
    },
  };
}
