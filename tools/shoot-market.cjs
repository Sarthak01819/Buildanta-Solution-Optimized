// Shoot ACT 03 (We market) end to end so the frames can be LOOKED AT, not
// just measured. Walks the act's own local timeline via intro.rawForP, so it
// never hardcodes a scroll position. Fails loudly on any page error.
// Usage: node tools/shoot-market.cjs
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';
const OUT = path.join(__dirname, '..', 'shots-market');
const P0 = 0.425, P1 = 0.696;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  if (!/^buildanta solutions/i.test(await page.title())) throw new Error('WRONG SERVER');
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

  const goP = async (p) => {
    await page.evaluate((pp) => {
      const { intro, lenis } = window.__buildanta;
      const raw = intro.rawForP(pp);
      const y = intro.st.start + (intro.st.end - intro.st.start) * raw;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    }, p);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 650)));
  };

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const locals = [];
  for (let i = 0; i <= 20; i++) locals.push(i / 20);

  for (const L of locals) {
    const p = P0 + L * (P1 - P0);
    await goP(p);
    const name = `L${String(Math.round(L * 100)).padStart(3, '0')}`;
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  }

  // LEVEL + NO-OVERLAP, checked across the whole reel, not at one lucky stop
  let bad = 0;
  for (const L of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) {
    await goP(P0 + L * (P1 - P0));
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.market-frame')]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.right > -200 && r.left < innerWidth + 200);
      /* level = the plate CENTRES sit on one horizontal line. Comparing
         `top` instead measures the depth scale, not the tilt. */
      let tilt = 0, over = 0, worst = 0;
      const midY = (r) => r.top + r.height / 2;
      for (let i = 1; i < cards.length; i++) {
        tilt = Math.max(tilt, Math.abs(midY(cards[i]) - midY(cards[i - 1])));
        const gap = cards[i].left - cards[i - 1].right;
        if (gap < 0) { over++; worst = Math.min(worst, gap); }
      }
      return { tilt: Math.round(tilt), over, worst: Math.round(worst), n: cards.length };
    });
    const ok = m.tilt <= 2 && m.over === 0;
    if (!ok) bad++;
    console.log(`L${Math.round(L * 100)}  tilt=${m.tilt}px  overlaps=${m.over}${m.over ? ` (worst ${m.worst}px)` : ''}  visible=${m.n}  ${ok ? 'OK' : 'FAIL'}`);
  }
  console.log(bad ? `\n${bad} position(s) FAILED` : '\nlevel + no overlap at every position');

  // does every hero word FIT its plate? ("SOFTWARE" was being cut off)
  const fit = await page.evaluate(() => [...document.querySelectorAll('.market-frame--plate')].map((p) => {
    const w = p.querySelector('.plate__word');
    const cs = getComputedStyle(p);
    const inner = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const r = document.createRange(); r.selectNodeContents(w);
    return { word: w.textContent.trim(), need: Math.ceil(r.getBoundingClientRect().width), have: Math.floor(inner) };
  }));
  const tooWide = fit.filter((f) => f.need > f.have);
  console.log('\nword fit: ' + fit.map((f) => `${f.word} ${f.need}/${f.have}`).join('  '));
  console.log(tooWide.length ? `CLIPPED: ${tooWide.map((f) => f.word).join(', ')}` : 'every word fits its plate');

  /* Is the plate in the beam ACTUALLY the brightest, and is there visible
     light in the air between the lamp and the film? Measured off the
     composited page — the veil variable being set proves nothing about what
     a person sees. */
  const { decode, meanLum } = require('./png.cjs');
  /* Only PARKED beats count. The detent holds a plate in the gate for most of
     each beat; sampling at arbitrary scroll depths catches the hand-off
     between two plates, where "which one is lit" is legitimately ambiguous
     and a failure means nothing. */
  /* Every service must get its own beat in the gate — that is the whole
     promise of the reel. Track each plate's CLOSEST approach to the gate
     across a fine sweep, so a plate that never parks cannot hide. */
  const closest = new Map();
  for (let i = 0; i <= 90; i++) {
    const L = 0.20 + (i / 90) * 0.80;
    await goP(P0 + L * (P1 - P0));
    const rows = await page.evaluate(() => {
      const g = innerWidth / 2;
      const live = document.querySelector('#intro')?.classList.contains('market-live');
      return [...document.querySelectorAll('.market-frame--plate')].map((el) => {
        const r = el.getBoundingClientRect();
        return { word: el.querySelector('.plate__word')?.textContent.trim(), off: Math.abs(r.left + r.width / 2 - g), live };
      });
    });
    for (const r of rows) {
      if (!r.live) continue;
      const cur = closest.get(r.word);
      if (!cur || r.off < cur.off) closest.set(r.word, { off: r.off, L });
    }
  }
  const never = [...closest.entries()].filter(([, v]) => v.off > 12);
  console.log('\nclosest approach to the gate, per plate:');
  console.log([...closest.entries()].map(([w, v]) => `${w} ${Math.round(v.off)}px`).join('  '));
  console.log(never.length ? `NEVER PARKS: ${never.map(([w]) => w).join(', ')}` : 'every plate parks in the gate');
  const beats = [...closest.entries()].filter(([, v]) => v.off <= 12).map(([word, v]) => ({ word, L: v.L }));

  let dim = 0;
  for (const { L } of beats) {
    await goP(P0 + L * (P1 - P0));
    const geo = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.market-frame--plate')].map((c) => {
        const r = c.getBoundingClientRect();
        return { word: c.querySelector('.plate__word')?.textContent.trim(), lit: c.dataset.lit, cx: r.left + r.width / 2, r: { l: r.left, t: r.top, w: r.width, h: r.height } };
      }).filter((c) => c.r.l > -50 && c.r.l + c.r.w < innerWidth + 50);
      const strip = document.querySelector('.market-film').getBoundingClientRect();
      return { cards, gate: innerWidth / 2, stripTop: strip.top, vw: innerWidth };
    });
    const img = decode(await page.screenshot());
    const lit = geo.cards.find((c) => c.lit === '1');
    const rest = geo.cards.filter((c) => c.lit !== '1');
    const lum = (c) => meanLum(img, c.r.l + c.r.w * 0.08, c.r.t + c.r.h * 0.08, c.r.l + c.r.w * 0.92, c.r.t + c.r.h * 0.92);
    // light in the air: a band just above the strip, under the lamp vs far left
    const bandT = geo.stripTop - 90, bandB = geo.stripTop - 20;
    const air = meanLum(img, geo.gate - 110, bandT, geo.gate + 110, bandB);
    const dark = meanLum(img, 40, bandT, 260, bandB);
    const litL = lit ? lum(lit) : NaN;
    const restL = rest.length ? rest.map(lum) : [];
    const maxRest = restL.length ? Math.max(...restL) : 0;
    const wins = lit && litL > maxRest * 1.25;
    if (!wins) dim++;
    console.log(`L${Math.round(L * 100)}  lit=${lit ? lit.word : '—'} ${litL.toFixed(1)}  brightest other ${maxRest.toFixed(1)}  ` +
      `${wins ? 'LIT PLATE WINS' : 'NOT DISTINCT'}  |  beam air ${air.toFixed(1)} vs room ${dark.toFixed(1)} ` +
      `${air > dark + 3 ? 'VISIBLE' : 'INVISIBLE'}`);
  }
  console.log(dim ? `${dim} parked beat(s) where the lamp does not pick a winner` : 'every parked plate is the brightest thing on the strip');

  // what the act thinks its own state is, at mid-reel
  await goP(P0 + 0.5 * (P1 - P0));
  const probe = await page.evaluate(() => {
    const el = document.querySelector('.market-experience');
    const s = el ? el.style : null;
    const g = (k) => (s ? s.getPropertyValue(k) : '');
    const canv = document.querySelector('.market-projector');
    const strip = document.querySelector('.market-film');
    const sr = strip ? strip.getBoundingClientRect() : null;
    const cards = [...document.querySelectorAll('.market-frame')].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), veil: c.style.getPropertyValue('--veil') };
    });
    return {
      vars: ['--market-opacity', '--market-film-x', '--market-film-opacity', '--market-lamp', '--market-room', '--market-scene-opacity'].reduce((a, k) => (a[k] = g(k), a), {}),
      projector: canv ? { op: canv.style.opacity, w: canv.clientWidth, h: canv.clientHeight, r: canv.getBoundingClientRect() } : null,
      strip: sr ? { top: Math.round(sr.top), h: Math.round(sr.height) } : null,
      cards,
      vw: innerWidth, vh: innerHeight,
    };
  });
  console.log(JSON.stringify(probe, null, 2));

  await browser.close();
  if (errs.length) { console.log('\nERRORS:\n' + errs.join('\n')); process.exit(1); }
  console.log('\nno console/page errors');
})();
