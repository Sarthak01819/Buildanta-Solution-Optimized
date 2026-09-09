const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  const out = path.join(__dirname, '../shots-zero-stage/no-burning-dollar');
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 700 }, isMobile: mobile, hasTouch: mobile });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5173/');
      await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && !document.querySelector('.preload'), null, { timeout: 60000 });
      const seek = async (value, source = false) => {
        await page.evaluate(({ value, source }) => {
          const { intro, lenis } = window.__buildanta;
          const raw = source ? intro.rawForZeroStage(value) : intro.rawForP(value);
          lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
        }, { value, source });
        await page.waitForTimeout(300);
      };
      await seek(.991, true);
      const contactP = await page.evaluate(() => window.__buildanta.intro.progress);
      await page.waitForTimeout(1000);
      assert.ok(await page.evaluate(p => Math.abs(window.__buildanta.intro.progress - p) < .0002, contactP), 'contact must not auto-scroll');
      assert.equal(await page.evaluate(() => 'franklinPlayback' in window.__buildanta.intro), false);
      assert.ok(await page.evaluate(() => parseFloat(document.querySelector('.consult-zero__hand-canvas').style.opacity) > .9));
      await page.screenshot({ path: path.join(out, `${mobile ? 'phone' : 'desktop'}-hands.png`) });
      // Every former bill/burn location now maps to the same end boundary.
      assert.ok(await page.evaluate(() => {
        const i = window.__buildanta.intro;
        return [.958, .965, .98, .992].every(p => Math.abs(i.rawForP(p) - i.introRawEnd) < 1e-8);
      }));
      await seek(.98);
      await page.waitForFunction(() => document.querySelector('.consult-zero__hand-canvas').style.opacity === '0');
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.consult-zero__wealth-proof, .consult-zero__opening-copy, .consult-zero__statue')].every(el => getComputedStyle(el).display === 'none')));
      assert.equal(await page.evaluate(() => document.querySelector('.consult-zero').classList.contains('note-focus')), false);
      await page.screenshot({ path: path.join(out, `${mobile ? 'phone' : 'desktop'}-after.png`) });
      await seek(.98, true);
      await page.waitForFunction(() => parseFloat(document.querySelector('.consult-zero__hand-canvas').style.opacity) > .9);
      assert.deepEqual(errors, []);
      console.log(`${mobile ? 'phone' : 'desktop'}: hands preserved, no autoplay, burn span removed, canvas hidden after hands, reverse PASS`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
