let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const URL = 'http://127.0.0.1:5303/';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__buildanta && window.__buildanta.meetBg', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  const raw = await page.evaluate(`window.__buildanta.intro.rawForP(0.908)`);
  await page.evaluate((f) => {
    const { intro, lenis } = window.__buildanta;
    const y = intro.st.start + (intro.st.end - intro.st.start) * f;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, raw);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));
  // isolate: hide every sibling of bgGroup across the whole scene except bg planes
  await page.evaluate(() => {
    const bg = window.__buildanta.meetBg;
    let scene = bg;
    while (scene.parent) scene = scene.parent;
    const keep = new Set();
    bg.traverse((o) => keep.add(o));
    let g = bg;
    while (g) { keep.add(g); g = g.parent; }
    scene.traverse((o) => {
      if (!keep.has(o) && (o.isMesh || o.isPoints || o.isLine)) o.visible = false;
    });
    bg.traverse((o) => { if (o.material) o.material.opacity = 1; });
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  await page.screenshot({ path: 'shots-fistbump/isolate-bg.png' });
  console.log('isolated shot done');
  await browser.close();
})();
