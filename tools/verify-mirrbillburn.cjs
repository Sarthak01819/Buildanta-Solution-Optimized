const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  const out = path.join(__dirname, '../shots-zero-stage/mirrbillburn');
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const mobile of [false, true]) {
      const label = mobile ? 'phone' : 'desktop';
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 700 }, isMobile: mobile, hasTouch: mobile });
      const errors = [], oldRequests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (r.url().includes('/src/vendor/burning-franklin/')) oldRequests.push(r.url()); });
      await page.goto('http://127.0.0.1:5173/');
      await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && !document.querySelector('.preload'), null, { timeout: 60000 });
      const seek = (value, source = false) => page.evaluate(({ value, source }) => {
        const { intro, lenis } = window.__buildanta;
        const raw = source ? intro.rawForZeroStage(value) : intro.rawForP(value);
        lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
      }, { value, source });
      await seek(.991, true);
      await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.ready, null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.__buildanta.intro.burningFranklin.active), false);
      assert.equal(await page.evaluate(() => document.querySelector('.intro__burning-franklin').style.opacity), '0');
      await seek(.9451);
      await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.active);
      await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.elapsed > 1.2);
      const state = await page.evaluate(() => window.__buildanta.intro.burningFranklin);
      assert.equal(state.scene.source, 'mirrbillburn');
      assert.equal(state.scene.noteCount, 10);
      assert.equal(state.scene.visibleNotes, 10);
      assert.ok(Math.abs(state.scene.sourceProgress - .4 * state.elapsed / state.duration) < .0001);
      await page.screenshot({ path: path.join(out, `${label}-transition.png`) });
      await page.mouse.wheel(0, 3000);
      assert.equal(await page.evaluate(() => window.__buildanta.intro.burningFranklin.active), true);
      await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.elapsed > 5.5, null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.__zeroMirrorStageBridge.state.opacity), 0);
      await page.screenshot({ path: path.join(out, `${label}-burn.png`) });
      await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.elapsed === 11 && !window.__buildanta.intro.burningFranklin.active, null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => document.querySelector('.intro__burning-franklin').style.opacity), '0');
      assert.ok(await page.evaluate(() => document.querySelector('.intro__portalwrap').classList.contains('on')));
      await page.screenshot({ path: path.join(out, `${label}-next.png`) });
      await page.mouse.wheel(0, -200);
      await seek(.98, true);
      await page.waitForFunction(() => !window.__buildanta.intro.burningFranklin.played);
      await seek(.9451);
      await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.active);
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(() => !window.__buildanta.intro.burningFranklin.active);
      assert.deepEqual(oldRequests, []);
      assert.deepEqual(errors, []);
      console.log(`${label}: mirrbillburn atlas/10 notes, full playback, portal, reverse PASS; old renderer not loaded`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
