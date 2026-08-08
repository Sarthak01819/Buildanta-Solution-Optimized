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

/* hue is the variable; everything else is held */
export const PEACHES = [
  { key: '1', name: 'Rose',   hue: 8,  paper: '#f5aea3', brass: '#ba3a2c', p3: [0.961, 0.682, 0.639] },
  { key: '2', name: 'Pink',   hue: 12, paper: '#f4b8a9', brass: '#ba432c', p3: [0.957, 0.722, 0.663] },
  { key: '3', name: 'Peach',  hue: 18, paper: '#f2bda6', brass: '#ba4f2c', p3: [0.949, 0.741, 0.651] },
  { key: '4', name: 'Warm',   hue: 30, paper: '#eec7a0', brass: '#ba562c', p3: [0.933, 0.780, 0.627] },
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
    orbHero?.setGround?.({ paper: PEACHES[i].paper, ember: PEACHES[i].brass });
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
