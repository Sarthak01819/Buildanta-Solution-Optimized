// One-off: screenshot the consult beat around the fist-bump swap.
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';
const OUT = path.join(__dirname, '..', 'shots-fistbump');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  const fp = await page.evaluate(async () => {
    try { return (await (await fetch('/src/gl/ConsultHand.js')).text()).includes('setWorldCut'); }
    catch (e) { return false; }
  });
  if (!fp) throw new Error('WRONG BUILD on ' + URL);
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
  // consultLocal cl -> global p = 0.768 + cl * 0.224
  const stops = [
    ['b1-handsin', 0.8016],  // cl 0.15 approach
    ['b2-mid', 0.8688],      // cl 0.45 mid flight
    ['b2g-reach', 0.872],   // cl 0.464 both open hands near
    ['b3-contact', 0.908],   // cl 0.625 bump + spark
    ['b3b-spark', 0.9147], // cl 0.655 spark peak
    ['b4-hold', 0.936],      // cl 0.75 recoil/settle
    ['b5-exit', 0.9698],     // cl 0.90 beat fade
  ];
  for (const [name, pTarget] of stops) {
    const raw = await page.evaluate(`window.__buildanta.intro.rawForP(${pTarget})`);
    await goRaw(raw);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  }
  if (errs.length) { console.log('ERRORS:\n' + errs.join('\n')); process.exit(1); }
  console.log('CLEAN — no page errors');
  await browser.close();
})();
