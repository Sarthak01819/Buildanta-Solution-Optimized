const fs = require('fs'), path = require('path');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'));
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  const errors = [], textures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().includes('bill-franklin')) textures.push({ url: r.url(), status: r.status() }); });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && !document.querySelector('.preload'), null, { timeout: 60000 });
    await page.evaluate(() => { window.__bbPinTime = 300000; });
    const out = path.join(__dirname, '../shots-zero-stage/franklin');
    fs.mkdirSync(out, { recursive: true });
    for (const p of [.965, .98]) {
      await page.evaluate(p => {
        const { intro, lenis } = window.__buildanta;
        const y = intro.st.start + intro.rawForP(p) * (intro.st.end - intro.st.start);
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
      }, p);
      await page.waitForFunction(p => Math.abs(window.__buildanta.intro.progress - p) < .0005, p);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.join(out, `${p}.png`), scale: 'css' });
    }
    if (!textures.some(t => t.status === 200) || errors.length) throw Error(JSON.stringify({ textures, errors }));
    console.log(JSON.stringify({ localTextureLoaded: true, frames: ['note arrival', 'active burn'], errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
