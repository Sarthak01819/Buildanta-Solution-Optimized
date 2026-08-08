/**
 * `?pick=1` — pick the peach on your own screen, from the live site.
 *
 * Every remote guess at this colour has cost a round trip, because no image
 * survives the journey intact: macOS tags screenshots Display P3 so they read
 * oversaturated, and a camera photo of the MacBook Air reads about a FIFTH of
 * the real saturation (measured twice — 4.6% against 56%, then 14% against
 * 78%). So Yash picks on the real screen and just tells me the name.
 *
 * WHAT VARIES: hue, and only hue — 8° to 30°, rose through to the orange we
 * have now. Lightness and saturation are held near-constant across all four
 * (78-81% / 70-80%), because those two are already settled: 90% lightness was
 * what made the original read as near-white on every honest screen, and 78-80%
 * is what finally made it a colour. This picker answers the one open question
 * — how pink — without reopening the one that is closed.
 *
 * Each variant carries its own --brass, tracked ~4° below its paper, so the
 * ember under the orb stays in the same family as the ground rather than
 * drifting orange while the ground goes rose.
 *
 * ⚠️ ACT 01 ONLY, and by exclusion, not by blanket override: --paper is set on
 * #intro and overridden per act by #intro.t-terminal / .t-indigo / .t-forest.
 * A plain `#intro` rule has EQUAL specificity and later source order, so it
 * would win against all four acts and repaint the whole journey. The selector
 * below names the other three to stay out of them.
 *
 * ⚠️ JS reads --paper-src / --brass-src (always hex) because three.js cannot
 * parse color(); the P3 twin is set alongside for the CSS to paint with. Both
 * move together or the orb's gradient and the page ground stop matching, and
 * they are deliberately the same surface.
 *
 * REMOVE once a variant is chosen: bake the winner into main.css, then delete
 * this file, its import in intro.js, and the .peach-pick CSS block.
 */

/* Hue is the variable; everything else is derived from it.
   Lightness 84% at saturation 88% — Yash chose "brighter, toward 84%". That
   is deliberately back toward the near-white that was the original problem,
   so saturation goes UP as lightness does: at 84% there is much less room for
   colour, and without the extra saturation this would slide straight back
   into the cream that started all of this. */
const hsl = (h, s, l) => {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : [0, c, x];
  return [r + m, g + m, b + m];
};
const hex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  .toString(16).padStart(2, '0')).join('');

/** One hue → the whole family the orb and the ground share. */
function family(h) {
  const paper = hsl(h, 88, 84);          // ground + gradient top
  return {
    paper: hex(paper),
    p3: paper.map((v) => +v.toFixed(3)), // same numbers, wider space
    brass: hex(hsl(Math.max(0, h - 4), 62, 45)),   // ember, just below the ground
    warm:  hex(hsl(h + 2, 100, 68)),
    cool:  hex(hsl(h + 6, 70, 89)),
    amber: hex(hsl(h + 8, 100, 58)),
  };
}

export const PEACHES = [
  { key: '1', name: 'Rose',  ...family(6) },
  { key: '2', name: 'Pink',  ...family(12) },
  { key: '3', name: 'Peach', ...family(19) },
  { key: '4', name: 'Warm',  ...family(30) },
];

const STORE = 'buildanta-peach';

export function mountPeachPicker(introRoot, { orbHero } = {}) {
  if (!introRoot) return null;
  if (new URLSearchParams(location.search).get('pick') === '0') return null;

  /* excludes the other three acts — see the note above */
  const sel = '#intro:not(.t-terminal):not(.t-indigo):not(.t-forest)';
  const style = document.createElement('style');
  style.textContent = PEACHES.map((v, i) => `
    html.peach-${i} ${sel} { --paper-src: ${v.paper}; --brass-src: ${v.brass}; }
    @supports (color: color(display-p3 1 1 1)) {
      html.peach-${i} ${sel} {
        --paper: color(display-p3 ${v.p3.join(' ')});
        --brass: ${v.brass};
      }
    }`).join('');
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.className = 'peach-pick';
  ui.innerHTML =
    `<span class="peach-pick__t">PICK THE PEACH</span>` +
    PEACHES.map((v, i) =>
      `<button type="button" data-v="${i}" aria-label="${v.name}">
         <i style="background:${v.paper}"></i><b>${v.name}</b>
       </button>`).join('');
  document.body.appendChild(ui);

  let current = -1;
  function apply(i, remember = true) {
    i = Math.max(0, Math.min(PEACHES.length - 1, i));
    if (i === current) return;
    current = i;
    PEACHES.forEach((_, k) => document.documentElement.classList.toggle(`peach-${k}`, k === i));
    ui.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === i));
    /* the orb's gradient top stop IS the page ground — one surface, two owners,
       so it has to be told on the same frame or a seam appears across the fold */
    const v = PEACHES[i];
    orbHero?.setGround?.({
      paper: v.paper, ember: v.brass, warm: v.warm, cool: v.cool, amber: v.amber,
    });
    if (remember) { try { localStorage.setItem(STORE, String(i)); } catch { /* private mode */ } }
  }

  ui.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) apply(+b.dataset.v);
  });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName || '')) return;
    const i = PEACHES.findIndex((v) => v.key === e.key);
    if (i >= 0) { e.preventDefault(); apply(i); }
  }, { passive: false });

  const q = new URLSearchParams(location.search).get('pick');
  let start = 2;                                   // Peach — the middle of the range
  if (q && /^[1-4]$/.test(q)) start = +q - 1;
  else { try { const s = localStorage.getItem(STORE); if (s !== null) start = +s; } catch { /* ignore */ } }
  apply(start, false);

  return { apply, el: ui, destroy() { ui.remove(); style.remove(); } };
}
