/**
 * GRADE SWITCHER — a temporary judging tool, not a feature.
 *
 * Why it exists: we lost two rounds arguing about colour from images. A macOS
 * screenshot of a P3 display is tagged P3, and anything that reads it as plain
 * sRGB shows it MORE saturated than the screen ever was — which is why the
 * screenshot looked peachy while the screen looked washed out. A camera photo
 * fails the other way: it auto-white-balances against room light, subtracting
 * exactly the warmth we are trying to judge.
 *
 * Neither can settle this. Yash's own eyes, on his own screen, in his own
 * room, can. So the three candidate grades ship inside the site and he flips
 * between them live.
 *
 * WHAT IT GRADES: only ACT 01. Measured 8 Aug, the opening ground sits at 90%
 * lightness and the whole frame averages 80% — the top fifth of the range,
 * with nothing darker than the type. That is why a perfectly well-saturated
 * peach still reads as pale cream: colour needs darkness to glow against.
 * Acts 02-04 are already deep (#000, #3b172d, #173126) and are left alone.
 *
 * ⚠️ THE TRAP THIS AVOIDS: `--paper` is set on `#intro` and overridden per act
 * by `#intro.t-terminal` etc. A blanket `#intro { --paper: … }` override would
 * have equal specificity and later source order, so it would win against ALL
 * FOUR acts and repaint the entire journey in ACT 01's colour. The selector
 * below excludes the other three acts explicitly.
 *
 * ⚠️ `--paper` has two owners: this CSS token AND the orb's gradient top stop,
 * which are deliberately the same colour so the hero's upper edge and the page
 * behind it are one surface. They must move together, which is why setGround()
 * is called alongside the class change.
 *
 * REMOVE THIS once a grade is chosen: delete the import + mount in intro.js and
 * this file, then bake the winning values into main.css.
 */

/* Warm, into terracotta — Yash's answer to "which direction does the ground
   go when it deepens". Each step drops lightness while holding the hue family,
   so the site never stops looking like itself.

     paper  top of frame + the HTML ground (the lightness that was the problem)
     ember  bottom of frame — what actually carries the depth
     ink    body/display type, kept dark so contrast survives the deepening */
export const GRADES = [
  { key: '1', name: 'Now', note: 'lightness 90% — what you have today',
    paper: '#f2e6d7', ember: '#bd6741', ink: '#241c17' },
  { key: '2', name: 'Medium', note: 'lightness 70% — richer, still airy',
    paper: '#dcb088', ember: '#a8542f', ink: '#241c17' },
  { key: '3', name: 'Deep', note: 'lightness 60% — terracotta, cinematic',
    paper: '#d18a61', ember: '#8a3f21', ink: '#1d1410' },
];

const STORE = 'buildanta-grade';

export function mountGradeSwitcher(introRoot, { orbHero } = {}) {
  if (!introRoot) return null;

  /* `?grade=off` keeps the grade but hides the control — for looking at a
     chosen depth with nothing in the corner, and for the regression harness,
     whose reference frames predate this UI. `?grade=0|1|2` opens straight on
     one, so a link can carry a specific grade to another device. */
  const q = new URLSearchParams(location.search).get('grade');
  const hidden = q === 'off';

  /* Only the EMBER act. Excluding the other three by name is what keeps this
     from repainting the whole journey — see the note above. */
  const sel = '#intro:not(.t-terminal):not(.t-indigo):not(.t-forest)';
  const style = document.createElement('style');
  style.textContent = GRADES.map((g, i) => `
    html.grade-${i} ${sel} { --paper: ${g.paper}; --brass: ${g.ember}; --ink: ${g.ink}; }`).join('');
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.className = 'grade-ui';
  ui.setAttribute('role', 'group');
  ui.setAttribute('aria-label', 'Colour grade preview');
  ui.innerHTML =
    `<span class="grade-ui__t">GROUND</span>` +
    GRADES.map((g, i) =>
      `<button type="button" data-g="${i}" aria-label="${g.name} — ${g.note}">
         <i style="background:${g.paper}"></i><b>${g.name}</b>
       </button>`).join('');
  if (!hidden) document.body.appendChild(ui);

  let current = -1;
  function apply(i, remember = true) {
    i = Math.max(0, Math.min(GRADES.length - 1, i));
    if (i === current) return;
    current = i;
    const g = GRADES[i];
    GRADES.forEach((_, k) => document.documentElement.classList.toggle(`grade-${k}`, k === i));
    /* the gradient's top stop IS --paper — they are one surface with two
       owners, so they change on the same frame or the seam shows */
    orbHero?.setGround?.({ paper: g.paper, ember: g.ember });
    ui.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', +b.dataset.g === i));
    if (remember) { try { localStorage.setItem(STORE, String(i)); } catch { /* private mode */ } }
  }

  ui.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-g]');
    if (b) apply(+b.dataset.g);
  });

  /* 1 / 2 / 3 on a keyboard; the buttons carry phones and tablets, which is
     why this is not keyboard-only — the bar is a Mac, a PC and an Android. */
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName || '')) return;
    const i = GRADES.findIndex((g) => g.key === e.key);
    if (i >= 0) { e.preventDefault(); apply(i); }
  }, { passive: false });

  let saved = 0;
  if (q !== null && q !== 'off') saved = +q || 0;
  else { try { saved = +(localStorage.getItem(STORE) ?? 0) || 0; } catch { /* private mode */ } }
  apply(saved, false);

  return { apply, el: ui, destroy() { ui.remove(); style.remove(); } };
}
