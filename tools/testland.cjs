let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 920, height: 520 } });
  page.on('console', (m) => console.log('console:', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:5303/test-land.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__ready >= 2', null, { timeout: 15000 }).catch(() => console.log('textures may not have loaded'));
  await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));
  await page.screenshot({ path: 'shots-fistbump/test-land.png' });
  console.log('done');
  await browser.close();
})();
