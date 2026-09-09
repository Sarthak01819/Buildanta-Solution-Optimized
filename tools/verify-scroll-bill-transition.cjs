const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const origin = process.env.BUILDANTA_TEST_URL || 'http://127.0.0.1:5173/';
const selectedCases = process.env.SCROLL_BILL_CASE?.split(',');
const out = path.join(__dirname, '../shots-zero-stage/scroll-bill');
fs.mkdirSync(out, { recursive: true });
const ARRIVAL_END = .04, COVER_END = .075, COVER_MIDDLE = .0575;
const atlasPattern = '**/src/vendor/mirrbillburn/assets/leather-money-shreds.ktx2*';
const atlasFetch = request => request.resourceType() === 'fetch'
  && new URL(request.url()).pathname.endsWith('/mirrbillburn/assets/leather-money-shreds.ktx2');

async function openPage(browser, { mobile = false, reducedMotion = 'no-preference', intercept } = {}) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 700 },
    isMobile: mobile, hasTouch: mobile, reducedMotion,
  });
  const errors = [], oldRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/src/vendor/burning-franklin/')) oldRequests.push(request.url());
  });
  if (intercept) await page.route(atlasPattern, intercept);
  await page.goto(origin, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__buildanta?.intro
    && window.__zeroMirrorStageBridge?.state.ready
    && !document.querySelector('.preload'), null, { timeout: 60000 });
  // main.js restores startup scroll at load/pageshow. Seek after it settles.
  await page.waitForTimeout(300);
  return { page, errors, oldRequests };
}

async function seek(page, value, before = false) {
  await page.evaluate(async ({ value, before }) => {
    const { intro, lenis } = window.__buildanta;
    const raw = before ? intro.rawForZeroStage(value) : intro.rawForBillTransition(value);
    lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
    // The hand bridge applies its opacity in the shared render tick. Waiting
    // for actual frames avoids reading its previous frame on software WebGL.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { value, before });
  await page.waitForTimeout(180);
}

const state = page => page.evaluate(() => {
  const { intro, lenis } = window.__buildanta;
  const canvas = document.querySelector('.intro__burning-franklin');
  const portal = document.querySelector('.intro__portalwrap');
  const consult = document.querySelector('.consult-zero');
  return {
    ...intro.billTransition,
    timeline: intro.progress,
    raw: intro.st.progress,
    canvasOpacity: Number(getComputedStyle(canvas).opacity),
    canvasInlineOpacity: canvas.style.opacity,
    handsOpacity: window.__zeroMirrorStageBridge.state.opacity,
    starOpacity: Number(consult.style.getPropertyValue('--star-in')),
    portal: portal.classList.contains('on'),
    portalBackground: portal.classList.contains('bg'),
    entryGateActive: window.__buildanta.entryGate?.active ?? false,
    scrollStopped: lenis.isStopped,
    scrollLocked: lenis.isLocked,
  };
});

function freeScroll(snapshot) {
  assert.equal(snapshot.mode, 'scroll');
  assert.equal(snapshot.scrollStopped, false, 'the bill transition must not stop scrolling');
  assert.equal(snapshot.scrollLocked, false, 'the bill transition must not lock scrolling');
  assert.equal(snapshot.active, undefined, 'the retired autoplay state must be absent');
  assert.equal(snapshot.elapsed, undefined, 'the retired elapsed clock must be absent');
}

function sourceMapping(snapshot) {
  const expected = .4 * Math.max(0, (snapshot.scene.progress - COVER_END) / (1 - COVER_END));
  assert.ok(Math.abs(snapshot.scene.sourceProgress - expected) < 1e-10, 'scroll progress must map to source burn progress');
}

function fullCover(snapshot) {
  const scene = snapshot.scene, bounds = scene.coverBounds;
  assert.equal(scene.phase, 'cover');
  assert.equal(scene.sourceProgress, 0, 'the fullscreen cover must remain unburned');
  assert.equal(scene.opacity, 1);
  assert.equal(snapshot.canvasOpacity, 1);
  assert.equal(scene.poseBlend, 0);
  assert.equal(scene.visibleNotes, 1, 'one intact hero note must form the cover');
  assert.equal(bounds.space, 'ndc');
  assert.equal(bounds.coversViewport, true);
  assert.ok(bounds.left <= -1 && bounds.right >= 1 && bounds.bottom <= -1 && bounds.top >= 1,
    `hero note must cover every viewport corner: ${JSON.stringify(bounds)}`);
  assert.equal(scene.notePoses[0].burnProgress, 0);
  assert.equal(scene.notePoses[0].waveAmplitude, 0);
  freeScroll(snapshot);
}

async function verifyMain(browser, label, options) {
  const reduced = options.reducedMotion === 'reduce';
  const { page, errors, oldRequests } = await openPage(browser, options);
  try {
    await seek(page, .991, true);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready, null, { timeout: 30000 });
    const before = await state(page);
    assert.equal(before.failed, false);
    assert.equal(before.scene.source, 'mirrbillburn');
    assert.equal(before.scene.noteCount, 10);
    assert.equal(before.canvasOpacity, 0);
    assert.equal(before.handsOpacity, 1);
    freeScroll(before);
    await page.screenshot({ path: path.join(out, `${label}-before.png`) });

    const pacing = await page.evaluate(({ arrivalEnd, coverEnd, reduced }) => {
      const { intro } = window.__buildanta;
      const distance = (a, b) => (intro.rawForBillTransition(b) - intro.rawForBillTransition(a))
        * (intro.st.end - intro.st.start);
      const total = distance(0, 1), previousTotal = total + (reduced ? .3 : .95) * innerHeight;
      return { height: innerHeight, total, previousTotal,
        stationary: distance(arrivalEnd, coverEnd), previousStationary: previousTotal * .12 };
    }, { arrivalEnd: ARRIVAL_END, coverEnd: COVER_END, reduced });
    assert.ok(pacing.total <= pacing.height * (reduced ? 1.2 : 2.1) + 1,
      `bill transition must stay within its scroll budget: ${JSON.stringify(pacing)}`);
    assert.ok(pacing.stationary <= pacing.height * .08 + 1,
      `opaque stationary hold must be brief: ${JSON.stringify(pacing)}`);
    console.log(`${label} pacing: total ${pacing.previousTotal.toFixed(1)}→${pacing.total.toFixed(1)}px; opaque hold ${pacing.previousStationary.toFixed(1)}→${pacing.stationary.toFixed(1)}px.`);

    let cover;
    for (const local of [.042, COVER_MIDDLE, .072]) {
      await seek(page, local);
      const covered = await state(page);
      fullCover(covered);
      assert.ok(Math.abs(covered.handsOpacity + covered.starOpacity - 1) < .001,
        `the star backdrop must replace the hands beneath the cover: local=${local}, hands=${covered.handsOpacity}, stars=${covered.starOpacity}`);
      if (local === .042) assert.equal(covered.handsOpacity, 1, 'hands must stay visible until the cover is opaque');
      if (local === COVER_MIDDLE) {
        assert.ok(covered.handsOpacity > 0 && covered.handsOpacity < 1, 'scene swap must occur beneath the intact cover');
        cover = covered;
        await page.screenshot({ path: path.join(out, `${label}-cover.png`) });
      }
      if (local === .072) assert.equal(covered.handsOpacity, 0, 'hands must be hidden before the note burns');
    }

    await seek(page, COVER_MIDDLE);
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.scene.poseBlend > .1,
      null, { timeout: 10000 });
    const responsive = await state(page);
    assert.ok(responsive.scene.sourceProgress > 0, 'a modest wheel movement after cover must advance the animation');
    assert.ok(responsive.scene.poseBlend > .1, 'the bill must visibly move within one modest wheel gesture');
    freeScroll(responsive);
    sourceMapping(responsive);
    await page.screenshot({ path: path.join(out, `${label}-after-120px.png`) });

    await seek(page, .5);
    const burning = await state(page);
    assert.equal(burning.scene.phase, 'burn');
    assert.equal(burning.handsOpacity, 0);
    assert.equal(burning.starOpacity, 1, 'the star backdrop must be revealed through burned openings');
    if (!reduced) assert.equal(burning.portalBackground, true, 'the next scene must be present beneath burned openings');
    assert.ok(burning.scene.sourceProgress > 0);
    sourceMapping(burning);
    freeScroll(burning);
    await page.screenshot({ path: path.join(out, `${label}-burn.png`) });
    await page.waitForTimeout(1000);
    const idle = await state(page);
    assert.deepEqual(idle.scene, burning.scene, 'all bill transforms and shader clocks must remain frozen while idle');
    assert.equal(idle.raw, burning.raw, 'idle must not advance scroll');

    await seek(page, COVER_MIDDLE);
    const reversed = await state(page);
    fullCover(reversed);
    assert.deepEqual(reversed.scene, cover.scene, 'reverse scroll must restore precisely the same bill frame');
    assert.equal(reversed.handsOpacity, cover.handsOpacity);
    await page.screenshot({ path: path.join(out, `${label}-reverse.png`) });

    await seek(page, .5);
    assert.deepEqual((await state(page)).scene, burning.scene, 'forward replay must restore precisely the same burn frame');
    await page.mouse.wheel(0, 180);
    await page.waitForFunction(start => window.__buildanta.intro.billTransition.scene.progress > start + .01,
      burning.scene.progress, { timeout: 10000 });
    await page.waitForTimeout(300);
    const wheelForward = await state(page);
    freeScroll(wheelForward);
    sourceMapping(wheelForward);
    await page.mouse.wheel(0, -180);
    await page.waitForFunction(start => window.__buildanta.intro.billTransition.scene.progress < start - .01,
      wheelForward.scene.progress, { timeout: 10000 });
    freeScroll(await state(page));

    await seek(page, 1);
    if (!reduced) await page.waitForFunction(() => document.querySelector('.intro__portalwrap').classList.contains('on'), null, { timeout: 15000 });
    const next = await state(page);
    if (reduced) assert.equal(next.entryGateActive, true, 'reduced motion must reach its existing entry gate');
    else assert.ok(next.scene.progress > .999);
    assert.ok(next.canvasOpacity < .001);
    assert.equal(next.portal, !reduced);
    await page.screenshot({ path: path.join(out, `${label}-${reduced ? 'entry' : 'portal'}.png`) });
    assert.deepEqual(errors, []);
    assert.deepEqual(oldRequests, []);
    console.log(`PASS ${label}: opaque fullscreen cover, concealed scene swap, frozen idle, exact reverse, wheel control, ${reduced ? 'existing entry gate' : 'portal'}.`);
  } catch (error) {
    const snapshot = await state(page);
    console.error(`FAIL ${label}:`, JSON.stringify({ ...snapshot, scene: {
      progress: snapshot.scene?.progress, phase: snapshot.scene?.phase,
      opacity: snapshot.scene?.opacity, ready: snapshot.scene?.ready,
    } }));
    await page.screenshot({ path: path.join(out, `${label}-failure.png`) });
    throw error;
  } finally { await page.close(); }
}

async function verifyMissing(browser) {
  let aborted = 0;
  const { page, errors } = await openPage(browser, { intercept: route => {
    if (atlasFetch(route.request())) { aborted++; return route.abort('failed'); }
    return route.continue();
  } });
  try {
    await seek(page, .5);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.failed, null, { timeout: 30000 });
    const failed = await state(page);
    assert.equal(aborted, 1);
    assert.equal(failed.canvasOpacity, 0);
    freeScroll(failed);
    await seek(page, 1);
    await page.waitForFunction(() => document.querySelector('.intro__portalwrap').classList.contains('on'), null, { timeout: 15000 });
    assert.equal((await state(page)).failed, true);
    assert.deepEqual(errors, []);
    console.log('PASS missing atlas: scroll remains available and the portal remains reachable.');
  } finally { await page.close(); }
}

async function verifyDelayed(browser) {
  let releaseAtlas, requested = 0;
  const gate = new Promise(resolve => { releaseAtlas = resolve; });
  const { page, errors } = await openPage(browser, { intercept: async route => {
    if (atlasFetch(route.request())) { requested++; await gate; }
    await route.continue();
  } });
  try {
    await seek(page, .5);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.scene
      && !window.__buildanta.intro.billTransition.ready, null, { timeout: 15000 });
    const pending = await state(page);
    assert.equal(pending.canvasOpacity, 0);
    assert.equal(pending.handsOpacity, 1);
    assert.equal(pending.scene.progress, 0);
    freeScroll(pending);
    releaseAtlas();
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready, null, { timeout: 30000 });
    await page.waitForTimeout(180);
    const ready = await state(page);
    assert.equal(requested, 1);
    assert.ok(Math.abs(ready.scene.progress - .5) < .001, 'late loading must use the current scroll position');
    assert.equal(ready.raw, pending.raw, 'late loading must not move the visitor');
    await page.waitForTimeout(1000);
    assert.deepEqual((await state(page)).scene, ready.scene);
    freeScroll(ready);
    assert.deepEqual(errors, []);
    console.log('PASS delayed atlas: hands persist while loading; ready frame follows scroll and remains frozen.');
  } finally { releaseAtlas(); await page.close(); }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader'],
  });
  try {
    const cases = [
      ['desktop', () => verifyMain(browser, 'desktop', {})],
      ['phone', () => verifyMain(browser, 'phone', { mobile: true })],
      ['reduced', () => verifyMain(browser, 'reduced', { reducedMotion: 'reduce' })],
      ['missing', () => verifyMissing(browser)],
      ['delayed', () => verifyDelayed(browser)],
    ];
    for (const [label, run] of cases) if (!selectedCases || selectedCases.includes(label)) await run();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
