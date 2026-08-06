// End-to-end journey verification for the pinned intro + black-hole beat.
// Drives real scroll (Lenis immediate) through forward checkpoints, then
// reverse, screenshotting each stop. Fails on any page error.
// Usage: node tools/verify-journey.cjs   (dev server on :5280)
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5280/';
const OUT = path.join(__dirname, '..', 'shots-journey');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  if (!/^buildanta solutions/i.test(await page.title())) throw new Error('WRONG SERVER');
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));

  const goRaw = async (raw) => {
    await page.evaluate((f) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + (intro.st.end - intro.st.start) * f;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    }, raw);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));
  };

  fs.mkdirSync(OUT, { recursive: true });
  const stops = [
    ['f1-act1', 0.10], ['f2-act2', 0.32], ['f3-act3', 0.60],
    ['f4-consult-world', 0.72], ['f5-burn', 0.815], ['f6-seam', 0.851],
    ['f7-beat-emerge', 0.895], ['f8-beat-full', 0.935],
    ['f9-beat-whiteout', 0.975], ['f10-end-gate-hero', 1.0],
  ];
  for (const [name, raw] of stops) {
    await goRaw(raw);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  }
  // hero settle after gate auto-dissolve
  await page.evaluate(() => new Promise((r) => setTimeout(r, 3200)));
  await page.screenshot({ path: path.join(OUT, 'f11-hero-settled.png') });
  console.log('shot f11-hero-settled');

  // reverse: back into the beat, then into the consult world
  for (const [name, raw] of [['r1-beat-back', 0.93], ['r2-consult-back', 0.75], ['r3-act2-back', 0.32]]) {
    await goRaw(raw);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  }

  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
