const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const origin = process.env.BUILDANTA_TEST_URL || 'http://127.0.0.1:5173/';
const selectedCase = process.env.BURN_EDGE_CASE;
const vendorTexture = request => request.resourceType() === 'image'
  && request.url().includes('/src/vendor/burning-franklin/assets/');

async function openPage(browser, { reducedMotion = 'no-preference', intercept } = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, reducedMotion });
  if (reducedMotion === 'reduce') await page.addInitScript(() => {
    window.__edgeScrolls = [];
    const original = window.scrollTo;
    window.scrollTo = function (...args) {
      window.__edgeScrolls.push({ args, time: performance.now(), stack: new Error().stack.split('\n').slice(1, 5) });
      if (window.__edgeScrolls.length > 12) window.__edgeScrolls.shift();
      return original.apply(this, args);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (intercept) await page.route('**/src/vendor/burning-franklin/assets/**', intercept);
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__buildanta?.intro
    && window.__zeroMirrorStageBridge?.state.ready
    && !document.querySelector('.preload'), null, { timeout: 60000 });
  // main.js restores scroll to the top at load/pageshow; seek only once that
  // startup work and the corresponding ScrollTrigger refresh have settled.
  await page.waitForTimeout(300);
  return { page, errors };
}

const seek = (page, value, source = false) => page.evaluate(({ value, source }) => {
  const { intro, lenis } = window.__buildanta;
  const raw = source ? intro.rawForZeroStage(value) : intro.rawForP(value);
  lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
}, { value, source });

const state = page => page.evaluate(() => ({
  ...window.__buildanta.intro.burningFranklin,
  timeline: window.__buildanta.intro.progress,
  raw: window.__buildanta.intro.st.progress,
  wallRaw: window.__buildanta.intro.wallRaw,
  canvasOpacity: document.querySelector('.intro__burning-franklin').style.opacity,
  portal: document.querySelector('.intro__portalwrap').classList.contains('on'),
  scrolls: window.__edgeScrolls,
}));

(async () => {
  const failures = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader'],
  });
  try {
    let aborted = 0;
    if (!selectedCase || selectedCase === 'missing') {
      const { page, errors } = await openPage(browser, {
        intercept: route => {
          if (vendorTexture(route.request()) && /\/bill-franklin\.jpg(?:\?|$)/.test(route.request().url())) {
            aborted++;
            return route.abort('failed');
          }
          return route.continue();
        },
      });
      try {
        await seek(page, .98, true);
        await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.failed, null, { timeout: 30000 });
        await page.waitForTimeout(600);
        const failed = await state(page);
        assert.equal(aborted, 1, 'the renderer bill texture must be the failed request');
        assert.equal(failed.failed, true);
        assert.equal(failed.played, true, 'rewinding below the burn must preserve the failure bypass');
        assert.equal(failed.active, false);
        assert.equal(failed.canvasOpacity, '0');
        await seek(page, 1);
        await page.waitForFunction(() => document.querySelector('.intro__portalwrap').classList.contains('on'), null, { timeout: 15000 });
        const next = await state(page);
        assert.equal(next.failed, true);
        assert.equal(next.active, false);
        assert.equal(next.portal, true);
        assert.deepEqual(errors, []);
        console.log('PASS missing bill texture: failure persists below burn start; next portal remains reachable.');
      } catch (error) {
        console.error('FAIL missing bill texture:', error.message, JSON.stringify(await state(page)));
        failures.push(error);
      } finally { await page.close(); }
    }

    let delayed = 0;
    if (!selectedCase || selectedCase === 'delayed') {
      const { page, errors } = await openPage(browser, {
        intercept: async route => {
          if (vendorTexture(route.request())) {
            delayed++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          await route.continue();
        },
      });
      try {
        await seek(page, 1);
        await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.scene
          && !window.__buildanta.intro.burningFranklin.ready, null, { timeout: 15000 });
        const pending = await state(page);
        assert.equal(pending.active, false);
        assert.equal(pending.portal, false, 'next portal must wait for the pending animation');
        assert.equal(pending.canvasOpacity, '0');
        await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.ready
          && window.__buildanta.intro.burningFranklin.active
          && window.__buildanta.intro.burningFranklin.elapsed > .2, null, { timeout: 30000 });
        const playing = await state(page);
        assert.equal(delayed, 5, 'all five source textures should be delayed');
        assert.equal(playing.failed, false);
        assert.ok(playing.timeline < 1, 'the direct jump must return to the automatic burn timeline');
        assert.ok(playing.scene.progress > 0 && playing.scene.progress < 1);
        assert.deepEqual(errors, []);
        console.log('PASS delayed textures: direct timeline-end jump waits, then starts automatic playback.');
      } catch (error) {
        console.error('FAIL delayed textures:', error.message, JSON.stringify(await state(page)));
        failures.push(error);
      } finally { await page.close(); }
    }

    if (!selectedCase || selectedCase === 'reduced') {
      const { page, errors } = await openPage(browser, { reducedMotion: 'reduce' });
      try {
        await seek(page, .9451);
        await page.waitForFunction(() => window.__buildanta.intro.burningFranklin.ready, null, { timeout: 30000 });
        await page.waitForTimeout(1000);
        const start = await state(page);
        assert.equal(start.active, false);
        assert.equal(start.elapsed, 0);
        assert.equal(start.failed, false);
        await seek(page, .98);
        await page.waitForFunction(() => Math.abs(window.__buildanta.intro.progress - .98) < .0005);
        await page.waitForTimeout(600);
        const scrubbed = await state(page);
        assert.equal(scrubbed.active, false);
        assert.equal(scrubbed.elapsed, 0);
        assert.ok(scrubbed.scene.progress > start.scene.progress + .5, 'manual scrolling must advance the burn');
        assert.ok(Math.abs(scrubbed.scene.sourceProgress - (.84 + (1 - .84) * scrubbed.scene.progress)) < .00001);
        assert.ok(Math.abs(scrubbed.timeline - .98) < .0005, 'the timeline must stay where the visitor placed it');
        assert.deepEqual(errors, []);
        console.log('PASS reduced motion: no automatic playback; manual timeline advances and stays put.');
      } catch (error) {
        console.error('FAIL reduced motion:', error.message, JSON.stringify(await state(page)));
        failures.push(error);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  if (failures.length) throw new AggregateError(failures, `${failures.length} Burning Franklin edge case(s) failed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
