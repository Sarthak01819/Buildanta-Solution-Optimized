// End-to-end journey verification for the pinned intro + black-hole beat.
// Drives real scroll (Lenis immediate) through forward checkpoints, then
// reverse, screenshotting each stop. Fails on any page error.
// Usage: node tools/verify-journey.cjs   (dev server on :5280)
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

// 5290 = the DEV server: production strips `window.__buildanta`, which this
// harness drives. 5280/the tunnel serve the built site for humans.
const URL = process.env.SITE_URL || 'http://127.0.0.1:5290/';
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
    ['f1-act1', 0.10], ['f2-act2', 0.30], ['f3-act3-reel', 0.55],
    ['f4-consult-world', 0.75], ['f5-burn', 0.965], ['f6-seam', 0.99],
  ].map(([name, p]) => [name, p]);   // p-space; converted per-stop below
  for (const [name, pTarget] of stops) {
    const raw = await page.evaluate(`window.__buildanta.intro.rawForP(${pTarget})`);
    await goRaw(raw);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  }
  // hero settle after gate auto-dissolve
  await page.evaluate(() => new Promise((r) => setTimeout(r, 3200)));
  await page.screenshot({ path: path.join(OUT, 'f11-hero-settled.png') });
  console.log('shot f11-hero-settled');

  // reverse: back into the beat, then into the consult world
  for (const [name, pTarget] of [['r1-beat-back', 0.99], ['r2-consult-back', 0.75], ['r3-act2-back', 0.30]]) {
    const raw = await page.evaluate(`window.__buildanta.intro.rawForP(${pTarget})`);
    await goRaw(raw);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  }

  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exit(1);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
