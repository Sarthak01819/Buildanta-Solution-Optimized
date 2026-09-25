/**
 * The BZ navbar's page transition (D-103, 25 Sep 2026) — after the ZettaJoule
 * entry the client supplied, in white with the Buildanta logo:
 *
 *   COVER   the screen is cut into 4 horizontal bands of vertical slats; the
 *           slats grow (scaleX 0 → 1) band by band, alternating direction,
 *           until they are one white panel. (ZettaJoule only shows the reveal;
 *           this is that reveal played backwards, by the client's choice.)
 *   LOGO    the round Buildanta mark pops in at the centre, then slides left
 *           as "Buildanta Solutions" unmasks beside it. The navbar jump runs
 *           under the panel meanwhile.
 *   REVEAL  the lock-up slides down out of its mask, then the slats shrink
 *           band by band — the destination shows through the widening gaps.
 *
 * Same contract as the ruler's old overlay: showPageTransition() resolves
 * with { hide() } once the screen is covered; hide() resolves when gone.
 */
const BANDS = 4;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.65, 0, .35, 1)";

let current = null;

function slatCount() { return innerWidth < 768 ? 9 : 16; }

/** Play every slat's animation; direction per band alternates, bands stagger. */
function runSlats(slats, from, to) {
  const n = slats[0].length;
  const anims = [];
  slats.forEach((row, b) => {
    row.forEach((el, i) => {
      const order = b % 2 === 0 ? n - 1 - i : i;          // bands 1, 3 from the right
      anims.push(el.animate(
        [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }],
        { duration: 420, delay: b * 70 + order * 22, easing: EASE, fill: "forwards" },
      ).finished);
    });
  });
  return Promise.all(anims);
}

export function showPageTransition() {
  if (current) return current.hiding ? current.hiding.then(showPageTransition) : current.shown;

  const root = document.createElement("div");
  root.className = "bz-pt";
  root.setAttribute("aria-hidden", "true");
  const n = slatCount();
  const slats = [];
  for (let b = 0; b < BANDS; b++) {
    const band = document.createElement("div");
    band.className = "bz-pt__band";
    const row = [];
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "bz-pt__slat";
      s.style.transform = "scaleX(0)";
      band.append(s);
      row.push(s);
    }
    root.append(band);
    slats.push(row);
  }
  const lock = document.createElement("div");
  lock.className = "bz-pt__lock";
  lock.innerHTML =
    '<div class="bz-pt__mask"><div class="bz-pt__inner">' +
      '<img class="bz-pt__mark" src="/assets/brand/buildanta-logo.webp" alt="" draggable="false">' +
      '<span class="bz-pt__word"><span>Buildanta Solutions</span></span>' +
    "</div></div>";
  root.append(lock);
  document.body.append(root);

  const inner = lock.querySelector(".bz-pt__inner");
  const mark = lock.querySelector(".bz-pt__mark");
  const word = lock.querySelector(".bz-pt__word");
  const still = reducedMotion();
  // hidden until the panel is whole: mark at scale 0, the words fully masked
  const wordW = word.scrollWidth;
  if (!still) { mark.style.transform = "scale(0)"; word.style.width = "0px"; }

  const entry = { shown: null, hiding: null };
  let logoIn = Promise.resolve();

  entry.shown = (async () => {
    if (still) { slats.flat().forEach((s) => { s.style.transform = "scaleX(1)"; }); }
    else await runSlats(slats, 0, 1);
    return handle;
  })();

  // the lock-up: mark pops, then slides left as the words unmask
  let branded = false;
  const brand = () => {
    if (branded) return logoIn;
    branded = true;
    logoIn = still ? Promise.resolve() : (async () => {
      await mark.animate([{ transform: "scale(0)" }, { transform: "scale(1.08)", offset: 0.7 }, { transform: "scale(1)" }],
        { duration: 380, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "both" }).finished;
      await word.animate([{ width: "0px" }, { width: `${wordW}px` }],
        { duration: 620, easing: EASE, fill: "forwards" }).finished;
    })();
    return logoIn;
  };

  const handle = {
    /* D-107: called once the jump's heavy first frames are over. The seek
       (scroll + ScrollTrigger + the destination's first renders) stalls the
       page for up to ~0.8 s; started together, the logo stuttered through it.
       Under the whole white panel the stall is invisible. */
    brand,
    hide() {
      if (!entry.hiding) {
        entry.hiding = (async () => {
          await entry.shown;
          await brand();
          if (!still) {
            await new Promise((r) => setTimeout(r, 260));     // a beat of hold, as in the reference
            await inner.animate([{ transform: "translateY(0)" }, { transform: "translateY(110%)" }],
              { duration: 380, easing: "cubic-bezier(.55,0,.75,.2)", fill: "forwards" }).finished;
            await runSlats(slats, 1, 0);
          }
          root.remove();
          if (current === entry) current = null;
        })();
      }
      return entry.hiding;
    },
  };
  current = entry;
  return entry.shown;
}
