/**
 * FINALE MODE, part two — the black hole is no longer the last thing.
 *
 * The Endurance orbits beside Gargantua once the beat has settled; a Contact
 * control flies you into it, and the ship's sitting module becomes the site's
 * final surface. "← Leave the Ship" (or Esc) flies you back out (D-078).
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

/* At :5291 the visitor scrubs this; with progress linear, duration sets the
   pace. The corner framing starts ~2.7x further out than the reference did,
   so the same 8s would cover that extra ground as a rush — 11s keeps the
   apparent speed close to the reference's while still arriving promptly. */
const FLIGHT_SECONDS = 14;   // Yash: a longer voyage from the corner

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * @param {object} o
 * @param {HTMLElement} o.blackholeHost  layer the ship + sky render into
 * @param {HTMLElement} o.roomSection    the #contact section
 * @param {() => boolean} [o.isLive]     "is the Endurance on screen?" — the
 *   finale asks the intro's beat, the main site asks an observer. Injecting it
 *   is what lets one module serve both without knowing about either.
 * @param {boolean} [o.overlay]  true = fixed full-screen (finale), false = the
 *   room is an ordinary in-flow section and only the flight overlays.
 */
export function createFinaleRoom({ blackholeHost, roomSection, shaders, isLive,
                                   overlay = true, reduced = false, lite = false,
                                   onScene = null }) {
  if (!blackholeHost || !roomSection) return null;

  /* The portal is the DOOR, not the destination: holding it open rides you
     through to the site own Gargantua beat, which is when `.intro__blackhole`
     goes `solid` with its canvas live. That is the black hole the visitor
     ends on, so that is what the Endurance orbits beside — no second engine,
     no second raymarch. (An earlier read of "the beat never becomes visible"
     came from a probe that scrolled to the end without ever riding through.) */

  /* Finale: the room is pulled out of the hidden <main> and becomes a fixed
     overlay. Main site: it stays exactly where it is in the document, an
     ordinary section you can scroll to, and only the flight overlays it. */
  if (overlay) {
    document.body.appendChild(roomSection);
    roomSection.classList.add("room--finale");
    roomSection.setAttribute("aria-hidden", "true");
  }

  const cta = document.createElement("button");
  cta.type = "button";
  cta.className = "finale-cta";
  cta.textContent = "Contact us";
  document.body.appendChild(cta);

  /* Projects sits BESIDE Contact, at the black hole.
     Two things you can do once Gargantua is in front of you: fly into the ship
     (Contact) or fall into the hole (Projects). It rides the same visibility as
     the Contact control, so both arrive when the finale settles and neither
     exists before it. */
  const worldCta = document.createElement("button");
  worldCta.type = "button";
  worldCta.className = "finale-cta finale-cta--world js-world-enter";
  worldCta.textContent = "Projects";
  document.body.appendChild(worldCta);

  const flash = document.createElement("div");
  flash.className = "finale-flash";
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);

  /* The way back out of the ship, twin of the world's "← Leave the world"
     (D-078): same spot, same look, and the same destination — back outside at
     the black hole with Contact and Projects. It is the ONLY way out besides
     Esc now; the old wheel-up / drag-down exit was retired on request. */
  const shipExit = document.createElement("button");
  shipExit.type = "button";
  shipExit.className = "finale-ship-exit";
  shipExit.textContent = "← Leave the Ship";
  document.body.appendChild(shipExit);

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

  /* While the room owns the screen the page must not scroll — the intro is
     pinned behind it, and a stray scroll would rewind the black hole
     underneath the room. Leaving is the button's job (or Esc), not the
     wheel's: wheel-up / drag-down used to fly you out, retired with D-078. */
  const onWheel = (e) => {
    if (flight <= 0.0001) return;
    e.preventDefault();
  };
  addEventListener("wheel", onWheel, { passive: false });

  /* 2.4 s read as a rewind, not a voyage back out; 7.6 s per the client
     (23 Sep 2026), slower than the world's 4.6 s rise. */
  const LEAVE_SECONDS = 7.6;
  const leave = () => { if (flight > 0.0001) startFlight(0, LEAVE_SECONDS); };
  shipExit.addEventListener("click", leave);
  const onKey = (e) => {
    if (e.key === "Escape" && !roomSection.classList.contains("room--drawer")) leave();
  };
  addEventListener("keydown", onKey);

  function applyFlight(v) {
    const was = flight;
    flight = Math.min(1, Math.max(0, v));
    ship?.setFlyIn(flight);

    /* The score warms as you fly into the Endurance and cools on the way out
       (Yash: "it follows the journey"). Only on the crossings, so this costs
       nothing on the frames in between. */
    if (was <= 0.5 && flight > 0.5) onScene?.("endurance");
    else if (was > 0.5 && flight <= 0.5) onScene?.("finale");

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
    if (overlay) {
      roomSection.style.opacity = roomFade.toFixed(3);
      roomSection.style.transform = `scale(${(1.055 - 0.055 * roomFade).toFixed(4)})`;
    } else {
      /* In-flow: the section itself never moves or hides — it is part of the
         page. Its CONTENT arrives instead, so the visitor sees the Endurance
         over space, flies in, and the room resolves around them in place. */
      roomSection.style.setProperty("--room-in", roomFade.toFixed(3));
    }
    roomSection.style.setProperty("--room-zoom", "1");
    roomSection.style.setProperty("--ui-in", "1");
    roomSection.style.pointerEvents = roomFade > 0.85 ? "" : "none";
    roomSection.setAttribute("aria-hidden", roomFade > 0.5 ? "false" : "true");
    roomSection.classList.toggle("room--live", roomFade > 0.002);

    // the black hole and the ship dim out as the room takes the frame
    const outside = 1 - roomFade;
    blackholeHost.style.opacity = outside.toFixed(3);
    blackholeHost.style.pointerEvents = "none";
    cta.classList.toggle("finale-cta--gone", flight > 0.02);
    worldCta.classList.toggle("finale-cta--gone", flight > 0.02);
    document.documentElement.classList.toggle("finale-inside", roomFade > 0.85);
    // any part of the voyage: the BZ ruler steps aside for it (D-078)
    document.documentElement.classList.toggle("finale-flight", flight > 0.0005);
  }

  function syncBeat() {
    const live = isLive ? isLive() : blackholeHost.classList.contains("solid");
    if (live === beatLive) return;
    beatLive = live;
    /* Both of these are guarded and idempotent, and both were previously left
       until the Contact CLICK — where they landed on the same frame as the
       flight animation and made it lag. The ship is a 4.1MB DRACO-compressed
       model (fetch, decode, GPU upload) and the sky is an entire WebGL scene
       with its own shader compile. Starting them the moment the room goes
       live gives them the whole approach to finish in, so the click only has
       to animate. Same principle as the entrance: never do setup work on the
       frame the visitor is expecting motion. */
    if (live) { ship?.load(); ensureSky(); }
    // rewinding back out of the finale must also put us outside the room
    if (!live && flight > 0) { tweening = false; applyFlight(0); }
    if (!live) { cta.classList.remove("finale-cta--in"); worldCta.classList.remove("finale-cta--in"); }
  }
  const beatWatch = new MutationObserver(syncBeat);
  beatWatch.observe(blackholeHost, { attributes: true, attributeFilter: ["class"] });
  syncBeat();
  /* Establish the outside state once. The CSS default is `--room-in: 1`, so a
     page whose JS never runs still shows an ordinary, readable contact
     section — never-hide-content. It is this call that hides it for the
     flight, which means the hiding can only happen when the flight can
     actually deliver it. */
  applyFlight(0);

  const api = {
    /** kept for the caller; the portal observer is what actually drives this */
    setBeat() {},
    setCursor(nx, ny) { ship?.setCursor(nx, ny); },
    tick(dt) {
      /* When the caller injects `isLive` (the main site asking "is the contact
         section on screen?") there is no class mutation to react to, so it is
         polled here. The finale keeps its observer: polling it universally
         made that path flaky, because the intro's own class flickers. */
      if (isLive) syncBeat();
      const ctaOn = beatLive && flight <= 0.02;
      cta.classList.toggle("finale-cta--in", ctaOn);
      worldCta.classList.toggle("finale-cta--in", ctaOn);
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
        /* Linear scrub, with a short ease-in only: Yash wants the first
           second to feel like leaving from rest. Everything after that is
           the reference's own rail shaping, untouched. */
        const s = k * smoothstep(0, 0.10, k);
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
        // The flight clock continues inside the room, but its fully covered
        // sky needs no second raymarch. Preserve every nonzero host fade.
        const outsideVisible = !document.documentElement.classList.contains("is-in-world")
          && (blackholeHost.checkVisibility
            ? blackholeHost.checkVisibility({ opacityProperty: true, visibilityProperty: true })
            : getComputedStyle(blackholeHost).opacity !== "0");
        if (outsideVisible) sky.draw(t, ship.skyView());
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
      shipExit.remove();
      flash.remove();
    },
  };

  // dev handle — the finale's framing is tuned by measuring, not by eye
  if (import.meta.env?.DEV) window.__finale = api;
  return api;
}
