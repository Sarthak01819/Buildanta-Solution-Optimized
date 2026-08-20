// Visual regression harness. Yash's constraint on the performance work is that
// quality, palette, motion and smoothness must not be compromised — so the way
// to honour it is to make "nothing looks different" a MEASUREMENT.
//   node tools/visual-baseline.cjs save     -> capture the reference set
//   node tools/visual-baseline.cjs check    -> compare current against it
// Frames are taken at fixed timeline positions with the scene's own clock, so
// the only thing that can differ between runs is what we changed.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const { decode } = require('./png.cjs');
/* Palette signature: mean and spread per channel. Animation moves pixels
   around the frame but barely moves these; a colour-management or grading
   change moves them a lot. It is the right instrument for Yash's actual
   constraint — "the palette must not be compromised" — on the acts whose
   pixel noise floor is 70%+ and where diffing is therefore blind. */
function palette(img) {
  let r = 0, g = 0, bl = 0, n = 0; const hist = [new Array(32).fill(0), new Array(32).fill(0), new Array(32).fill(0)];
  for (let k = 0; k < img.data.length; k += img.bpp * 2) {
    r += img.data[k]; g += img.data[k+1]; bl += img.data[k+2]; n++;
    hist[0][img.data[k] >> 3]++; hist[1][img.data[k+1] >> 3]++; hist[2][img.data[k+2] >> 3]++;
  }
  return { r: r/n, g: g/n, b: bl/n, hist: hist.map(h => h.map(v => v/n)) };
}
function paletteDelta(a, c) {
  let emd = 0;
  for (let ch = 0; ch < 3; ch++) for (let i = 0; i < 32; i++) emd += Math.abs(a.hist[ch][i] - c.hist[ch][i]);
  return { mean: Math.max(Math.abs(a.r-c.r), Math.abs(a.g-c.g), Math.abs(a.b-c.b)), hist: emd / 3 * 100 };
}
const fs = require('fs'), path = require('path');

const DIR = path.join(__dirname, '..', 'shots-baseline');
const STOPS = [0.04, 0.10, 0.18, 0.26, 0.34, 0.44, 0.52, 0.60, 0.66, 0.70, 0.73, 0.76, 0.82, 0.88, 0.94, 0.99];
const mode = process.argv[2] === 'save' ? 'save' : 'check';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.SITE_URL || 'http://127.0.0.1:5303/', { waitUntil: 'load' });
  await p.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 60000 });
  await p.evaluate(() => new Promise(r => setTimeout(r, 2600)));

  /* The scenes animate on their own clocks, so two captures of the SAME
     unchanged page differ — measured, by up to 74% at the WebGL acts. A
     harness that flags that is worse than no harness. So `save` captures each
     stop TWICE and records the per-stop NOISE FLOOR; `check` only calls a
     frame changed when it exceeds its own noise by a real margin. */
  if (mode === 'save') fs.mkdirSync(DIR, { recursive: true });
  const noiseFile = path.join(DIR, 'noise.json');
  const noise = fs.existsSync(noiseFile) ? JSON.parse(fs.readFileSync(noiseFile, 'utf8')) : {};
  let worst = 0, worstAt = '', fails = 0;
  for (const q of STOPS) {
    await p.evaluate((v) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + (intro.st.end - intro.st.start) * intro.rawForP(v);
      lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);
    }, q);
    await p.evaluate(() => new Promise(r => setTimeout(r, 700)));
    const buf = await p.screenshot();
    const name = `p${String(Math.round(q * 1000)).padStart(4, '0')}.png`;
    const file = path.join(DIR, name);
    if (mode === 'save') {
      fs.writeFileSync(file, buf);
      /* THREE pairs, and keep the WORST. A single pair under-estimates any
         scene whose animation is slower than the gap between two shots — the
         WE SCALE act read 0.96 that way and then drifted to 3.1 on every later
         run, which flagged as a regression when nothing had changed. Proved by
         attribution: reverting the change left the flags identical. A noise
         floor measured once is not a noise floor. */
      const first = decode(buf);
      let px = 0, mean = 0, hist = 0;
      for (let rep = 0; rep < 3; rep++) {
        await p.evaluate(() => new Promise(r => setTimeout(r, 800)));
        const again = decode(await p.screenshot());
        let d2 = 0, m = 0;
        for (let k = 0; k < first.data.length; k += first.bpp) {
          const d = Math.abs(first.data[k] - again.data[k]) + Math.abs(first.data[k+1] - again.data[k+1]) + Math.abs(first.data[k+2] - again.data[k+2]);
          if (d > 12) d2++; m++;
        }
        const pd = paletteDelta(palette(first), palette(again));
        px = Math.max(px, d2 / m * 100); mean = Math.max(mean, pd.mean); hist = Math.max(hist, pd.hist);
      }
      noise[name] = { px: +px.toFixed(2), mean: +mean.toFixed(2), hist: +hist.toFixed(2), pal: palette(first) };
      console.log(`  ${name}  pixel noise ${px.toFixed(2)}%   palette noise: mean ${mean.toFixed(2)}, shape ${hist.toFixed(2)}`);
      continue;
    }
    if (!fs.existsSync(file)) { console.log(`  ${name}  NO BASELINE`); continue; }
    const a = decode(fs.readFileSync(file)), c = decode(buf);
    let diff = 0, n = 0, maxCh = 0;
    for (let k = 0; k < a.data.length; k += a.bpp) {
      const d = Math.abs(a.data[k] - c.data[k]) + Math.abs(a.data[k+1] - c.data[k+1]) + Math.abs(a.data[k+2] - c.data[k+2]);
      if (d > 12) diff++;
      if (d > maxCh) maxCh = d;
      n++;
    }
    const pct = diff / n * 100;
    if (pct > worst) { worst = pct; worstAt = name; }
    /* judged against THIS stop's own noise floor, not a flat number */
    const nf = noise[name] || { px: 0.5, mean: 1, hist: 1 };
    const floor = nf.px;
    const pd = nf.pal ? paletteDelta(nf.pal, palette(c)) : { mean: 0, hist: 0 };
    const palBad = pd.mean > Math.max(nf.mean * 2, nf.mean + 1.5) || pd.hist > Math.max(nf.hist * 2, nf.hist + 2);
    const bad = pct > Math.max(floor * 1.6, floor + 1.5) || palBad;
    if (bad) fails++;
    console.log(`  ${name}  pixels ${pct.toFixed(2)}%/${floor.toFixed(2)}   palette mean ${pd.mean.toFixed(2)}/${nf.mean.toFixed(2)} shape ${pd.hist.toFixed(2)}/${nf.hist.toFixed(2)}   ${bad ? (palBad ? '*** PALETTE CHANGED ***' : '*** CHANGED ***') : 'within noise'}`);
  }
  if (mode === 'save') { fs.writeFileSync(noiseFile, JSON.stringify(noise, null, 1)); console.log(`baseline saved: ${STOPS.length} frames + noise floors`); }
  else console.log(fails ? `\n${fails} frame(s) changed — worst ${worst.toFixed(2)}% at ${worstAt}`
                         : `\nno visual change anywhere (worst ${worst.toFixed(2)}% at ${worstAt})`);
  console.log(errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no page errors');
  await b.close();
})();
