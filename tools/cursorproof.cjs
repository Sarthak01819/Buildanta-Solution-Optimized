let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:5303/', { waitUntil: 'load' });
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  const raw = await page.evaluate(`window.__buildanta.intro.rawForP(0.936)`);
  await page.evaluate((f) => {
    const { intro, lenis } = window.__buildanta;
    const y = intro.st.start + (intro.st.end - intro.st.start) * f;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, raw);
  await page.mouse.move(80, 360);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1600)));
  await page.screenshot({ path: 'shots-fistbump/cursor-left.png' });
  await page.mouse.move(1200, 360);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1600)));
  await page.screenshot({ path: 'shots-fistbump/cursor-right.png' });
  console.log('two cursor shots done');
  await browser.close();
})();
