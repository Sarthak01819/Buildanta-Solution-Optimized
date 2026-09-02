let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const URL = 'http://127.0.0.1:5303/';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__buildanta && window.__buildanta.meetBg && window.__buildanta.meetRoot', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
  const rep = await page.evaluate(() => {
    const bg = window.__buildanta.meetBg;
    return bg.children.map((pl) => {
      const m = pl.material, img = m.map && m.map.image;
      return {
        pos: [pl.position.x, pl.position.y, pl.position.z].map((v) => +v.toFixed(1)),
        opacity: +m.opacity.toFixed(2),
        mapLoaded: !!img,
        imgSize: img ? [img.width, img.height] : null,
        srcTail: m.map && m.map.source && m.map.source.data && m.map.source.data.src
          ? m.map.source.data.src.slice(-30) : null,
      };
    });
  });
  console.log(JSON.stringify(rep, null, 1));
  console.log(logs.filter((l) => /error|warn|webp|land/i.test(l)).slice(0, 8).join('\n') || '(no relevant logs)');
  await browser.close();
})();
