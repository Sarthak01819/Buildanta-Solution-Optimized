/* D-076 contract for the bill transition: the reference's portal reveal.
 *
 *   node tools/verify-scroll-bill-transition.cjs            (all cases)
 *   SCROLL_BILL_CASE=desktop,phone node tools/verify-scroll-bill-transition.cjs
 *   BUILDANTA_TEST_URL=http://127.0.0.1:5303/ ...
 *
 * b = burnLocal (intro.rawForBillTransition addresses it); t = the mirror's
 * stage-local progress = .4 * (b - .03) / .97. Everything asserted here is a
 * pure function of b: idle frames are frozen, reverse restores the same frame,
 * forward replay restores it again. Pacing has a LOWER bound too, so the
 * reference match cannot be silently shortened.
 *
 * r2 additions: the fists inside the medallion are graded to the reference
 * hand's monochrome tone (measured on the F1 capture: lit mean within ±10 of
 * #a0977a, shadow within ±12 of #797a6b, G >= R, mask never empty); the lens
 * is the reference's through F5 and the approved fov 50 from the hero burn;
 * the sky plate hides the star wrap until the hero burns; a forward/reverse
 * capture pair at the settle stop (b .212) is pixel-equal.
 *
 * 10 Sep 2026 (client's call, D-076): the "WE scale." copy lockup is REMOVED
 * from the bill beat. The suite now asserts its absence — no element, no
 * --bill-copy var on #intro, no `copy` key in intro.billTransition — at the
 * stops where it used to arrive, hold and leave. Nothing else changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const { decode } = require('./png.cjs');
const { portalTone, ellipseFromNdc, fromHex, REFERENCE } = require('./portal-tone.cjs');

const origin = process.env.BUILDANTA_TEST_URL || 'http://127.0.0.1:5173/';
const selectedCases = process.env.SCROLL_BILL_CASE?.split(',');
const out = path.join(__dirname, '../shots-zero-stage/scroll-bill');
fs.mkdirSync(out, { recursive: true });

const ARRIVAL_END = .03, SWAP = [.030, .036], PORTAL_END = .166;
// the stops where the retired copy arrived / held / left — now checked for absence
const NO_COPY_STOPS = [.151, .18, .212, .782], SETTLE_STOP = .212, BURN_START = .285;
const PORTAL_FADE_T = .056, CULL = .4;
const tFor = b => Math.max(0, Math.min(1, (b - ARRIVAL_END) / (1 - ARRIVAL_END))) * CULL;
const portalFor = b => Math.max(0, Math.min(1, 1 - tFor(b) / PORTAL_FADE_T));
const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
// the concealed swap beneath the opaque note: intro.js zeroStageOpacity
const handsFor = b => 1 - smooth((b - SWAP[0]) / (SWAP[1] - SWAP[0]));
const HEIGHT_FRACTION = { desktop: 1.0885, phone: .8013 };
const TONE = { lit: '#a2a382', shadow: '#807f75', range: [.10, .50] };   // billPortal.js PORTAL_TONE_*
const BURN_FOV = 50;                                                      // mirrBillBurn.js BURN_FOV
// the sky plate: 0 -> 1 over hero burn 0 -> .1 (intro.js --bill-sky)
const skyFor = heroBurn => smooth(heroBurn / .1);
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
  await page.evaluate(() => { window.__bbPinTime = 300000; });
  // the site's cursor reticle is not part of the render under test
  await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important;opacity:0!important}' });
  await page.mouse.move(mobile ? 195 : 600, mobile ? 422 : 350);
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
  // Reduced motion turns every CSS change into a 0.01 ms transition, which
  // still needs a rendering opportunity to land; wait for the canvas's
  // computed opacity to catch up with the inline value the tick wrote.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.intro__burning-franklin');
    return !canvas || Math.abs(Number(getComputedStyle(canvas).opacity) - Number(canvas.style.opacity || 0)) < 1e-6;
  }, null, { timeout: 5000 }).catch(() => {});
}

const state = page => page.evaluate(() => {
  const { intro, lenis } = window.__buildanta;
  const canvas = document.querySelector('.intro__burning-franklin');
  const portal = document.querySelector('.intro__portalwrap');
  const consult = document.querySelector('.consult-zero');
  const titleEl = document.querySelector('.consult-meet__title');
  const root = document.getElementById('intro');
  return {
    plateOpacity: portal.classList.contains('bg') ? Number(getComputedStyle(portal, '::after').opacity) : null,
    plateColor: portal.classList.contains('bg') ? getComputedStyle(portal, '::after').backgroundColor : null,
    // the retired copy lockup (10 Sep 2026): every trace must be gone
    copyTrace: {
      elements: document.querySelectorAll('.intro__bill-copy, .intro__bill-copy-lockup, .intro__bill-copy-serif, .intro__bill-copy-script, .intro__bill-copy-lines').length,
      inlineVar: root ? root.style.getPropertyValue('--bill-copy') : null,
      computedVar: root ? getComputedStyle(root).getPropertyValue('--bill-copy') : null,
      stateKey: 'copy' in intro.billTransition,
      // the text itself, anywhere in the document (the sub-lines stay with the contact title on purpose)
      lockupText: [...document.querySelectorAll('body *')].some(el => el.children.length === 0 && /^\s*WE\s*scale\.?\s*$/i.test(el.textContent)),
    },
    ...intro.billTransition,
    timeline: intro.progress,
    raw: intro.st.progress,
    canvasOpacity: Number(getComputedStyle(canvas).opacity),
    canvasInlineOpacity: canvas.style.opacity,
    handsOpacity: window.__zeroMirrorStageBridge.state.opacity,
    starOpacity: Number(consult.style.getPropertyValue('--star-in')),
    titleOpacity: titleEl ? Number(getComputedStyle(titleEl).opacity) : null,
    portal: portal.classList.contains('on'),
    portalBackground: portal.classList.contains('bg'),
    entryGateActive: window.__buildanta.entryGate?.active ?? false,
    entryGateCompleted: window.__buildanta.entryGate?.completed ?? false,
    scrollStopped: lenis.isStopped,
    scrollLocked: lenis.isLocked,
    viewport: { width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio, 2) },
  };
});

/* the copy lockup was removed on 10 Sep 2026 (client's call): no element, no
   CSS var, no state key, no "WE scale." text anywhere */
function noCopy(snapshot, label) {
  const t = snapshot.copyTrace;
  assert.equal(t.elements, 0, `${label}: the retired .intro__bill-copy element must be absent: ${t.elements} found`);
  assert.equal(t.inlineVar, '', `${label}: --bill-copy must no longer be written on #intro: "${t.inlineVar}"`);
  assert.equal(t.computedVar.trim(), '', `${label}: --bill-copy must not resolve on #intro: "${t.computedVar}"`);
  assert.equal(t.stateKey, false, `${label}: intro.billTransition must carry no copy state`);
  assert.equal(t.lockupText, false, `${label}: no "WE scale." lockup text may exist in the document`);
}

function freeScroll(snapshot) {
  assert.equal(snapshot.mode, 'scroll');
  assert.equal(snapshot.scrollStopped, false, 'the bill transition must not stop scrolling');
  assert.equal(snapshot.scrollLocked, false, 'the bill transition must not lock scrolling');
  assert.equal(snapshot.active, undefined, 'the retired autoplay state must be absent');
  assert.equal(snapshot.elapsed, undefined, 'the retired elapsed clock must be absent');
}

function sourceMapping(snapshot) {
  const expected = tFor(snapshot.scene.progress);
  assert.ok(Math.abs(snapshot.scene.sourceProgress - expected) < 1e-10,
    `scroll progress must map to the mirror's stage progress: b=${snapshot.scene.progress} t=${snapshot.scene.sourceProgress} expected=${expected}`);
  assert.deepEqual(snapshot.scene.mapping.arrivalEnd, ARRIVAL_END);
  assert.deepEqual(snapshot.scene.mapping.cull, CULL);
}

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ±${tolerance}, got ${actual}`);
}

/* pixel difference between two same-size captures, percent of pixels whose
   largest channel delta exceeds 10 */
function changedPercent(a, b) {
  assert.equal(a.w, b.w); assert.equal(a.h, b.h);
  let changed = 0;
  for (let i = 0; i < a.data.length; i += a.bpp) {
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 10) changed++;
  }
  return 100 * changed / (a.w * a.h);
}

/* The grade inside the medallion, measured on the capture exactly as the
   reference hand was measured (tools/portal-tone.cjs): lit = lum > 135,
   shadow = 95..135, inside the circle's projected ellipse. */
function gradedFists(bytes, snapshot, label) {
  const img = decode(bytes);
  const bounds = snapshot.scene.portalBounds;
  assert.ok(bounds && bounds.space === 'ndc', `${label}: the scene must expose the medallion's projected ellipse`);
  const ellipse = ellipseFromNdc(bounds, img.w, img.h);
  const tone = portalTone(img, { ellipse });
  const floor = Math.max(500, tone.area * .004);
  assert.ok(tone.lit.n >= floor, `${label}: the medallion must show lit fist pixels (r1 regression: empty circle): lit n=${tone.lit.n} of area ${tone.area}`);
  assert.ok(tone.shadow.n >= floor, `${label}: the medallion must show shadowed fist pixels: shadow n=${tone.shadow.n} of area ${tone.area}`);
  const check = (set, target, tolerance, name) => {
    const t = fromHex(target);
    set.mean.forEach((v, i) => assert.ok(Math.abs(v - t[i]) <= tolerance,
      `${label} ${name}: channel ${'RGB'[i]} ${v.toFixed(1)} must be within ±${tolerance} of ${t[i]} (${target}); measured ${set.hex}`));
    assert.ok(set.mean[1] >= set.mean[0], `${label} ${name}: G must be >= R (the green lean): ${set.hex}`);
  };
  check(tone.lit, REFERENCE.lit, REFERENCE.litTolerance, 'lit fists');
  check(tone.shadow, REFERENCE.shadow, REFERENCE.shadowTolerance, 'shadowed fists');
  return tone;
}

function covered(snapshot, label) {
  const bounds = snapshot.scene.coverBounds;
  assert.equal(bounds.space, 'ndc');
  assert.equal(bounds.test, 'polygon', 'cover must be a point-in-polygon test of the viewport corners');
  assert.equal(bounds.coversViewport, true, `${label}: the note must cover every viewport corner: ${JSON.stringify(bounds)}`);
  assert.equal(snapshot.canvasOpacity, 1, `${label}: the canvas must be opaque`);
  assert.equal(snapshot.scene.opacity, 1);
  freeScroll(snapshot);
}

async function verifyMain(browser, label, options) {
  const reduced = options.reducedMotion === 'reduce';
  const mobile = options.mobile === true;
  const { page, errors, oldRequests } = await openPage(browser, options);
  try {
    await seek(page, .991, true);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready, null, { timeout: 30000 });
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.portalStillBaked, null, { timeout: 30000 });
    await seek(page, .991, true);
    const before = await state(page);
    assert.equal(before.failed, false);
    assert.equal(before.scene.source, 'mirrbillburn');
    assert.equal(before.scene.noteCount, 10);
    assert.equal(before.canvasOpacity, 0);
    assert.equal(before.handsOpacity, 1);
    assert.equal(before.scene.seedSource, 'mulberry32:b111b0a7', 'note and ember randomness must be frozen');
    assert.equal(before.scene.fov, mobile ? 40 : 30, "the lens must be the reference's (30, 40 on phones)");
    assert.equal(before.scene.baseFov, mobile ? 40 : 30);
    assert.equal(before.scene.burnFov, BURN_FOV, 'the burn must resume at the approved lens');
    assert.equal(before.scene.portal.still, 'zero-stage', 'the portal must show the baked fists still');
    assert.deepEqual(before.scene.portal.tone, { lit: TONE.lit, shadow: TONE.shadow, range: TONE.range, mix: 1 },
      "the medallion's grade must be the reference hand's two-tone (billPortal.js PORTAL_TONE_*)");
    assert.equal(before.scene.embers?.count, 150, "the embers must be the mirror's 150-point set");
    near(before.scene.portal.heightFraction, mobile ? HEIGHT_FRACTION.phone : HEIGHT_FRACTION.desktop, .005, 'still height fraction');
    assert.equal(before.scene.portal.stillSize,
      Math.max(256, Math.min(2048, Math.round(before.scene.portal.heightFraction * before.viewport.height * before.viewport.dpr))),
      'the still must be baked at the size it is shown');
    assert.equal(before.scene.lens.focalRadius, .3);
    assert.equal(before.scene.lens.falloff, .3);
    assert.ok(before.scene.lens.iterations >= 2 && before.scene.lens.iterations <= 3);
    freeScroll(before);
    await page.screenshot({ path: path.join(out, `${label}-before.png`) });

    const pacing = await page.evaluate(({ arrivalEnd }) => {
      const { intro } = window.__buildanta;
      const distance = (a, b) => (intro.rawForBillTransition(b) - intro.rawForBillTransition(a))
        * (intro.st.end - intro.st.start);
      return { height: innerHeight, total: distance(0, 1), arrival: distance(0, arrivalEnd) };
    }, { arrivalEnd: ARRIVAL_END });
    const [minVh, maxVh] = reduced ? [1.95, 2.10] : [3.75, 3.90];
    assert.ok(pacing.total >= pacing.height * minVh - 1 && pacing.total <= pacing.height * maxVh + 1,
      `the bill transition must keep the reference's scroll cost (${minVh}..${maxVh} vh): ${JSON.stringify(pacing)}`);
    assert.ok(pacing.arrival <= pacing.height * .13 + 1, `the arrival dissolve must be brief: ${JSON.stringify(pacing)}`);
    console.log(`${label} pacing: total ${(pacing.total / pacing.height).toFixed(3)} vh, arrival ${(pacing.arrival / pacing.height).toFixed(3)} vh.`);

    await seek(page, .015);
    const arriving = await state(page);
    assert.equal(arriving.scene.phase, 'arrival');
    assert.ok(arriving.canvasOpacity > 0 && arriving.canvasOpacity < 1, 'the canvas must be dissolving in');
    assert.equal(arriving.handsOpacity, 1, 'the fists must stay live under the dissolve');
    assert.equal(arriving.scene.sourceProgress, 0, 'the note must already stand at t = 0');
    assert.equal(arriving.scene.portal.opacity, 1);
    freeScroll(arriving);
    await page.screenshot({ path: path.join(out, `${label}-arrival.png`) });

    // A seek lands within one scroll pixel (±.0004 b on desktop, ±.0007 under
    // reduced motion), so F1 is read one thousandth into the window and the
    // swap is held to its law at the b that actually landed.
    await seek(page, SWAP[0] + .001);
    const f1 = await state(page);
    assert.equal(f1.scene.phase, 'portal');
    covered(f1, 'F1');
    near(f1.handsOpacity, handsFor(f1.scene.progress), 1e-3, 'F1 hands');
    assert.ok(f1.handsOpacity > .8, 'hands must still be up when the note first stands opaque');
    near(f1.starOpacity, 1 - f1.handsOpacity, 1e-3, 'F1 stars');
    near(f1.scene.portal.opacity, portalFor(f1.scene.progress), .002, 'F1 portal opacity');
    assert.ok(f1.scene.portal.opacity > .99);
    assert.equal(f1.scene.portal.visible, true);
    assert.equal(f1.scene.notePoses[0].burnProgress, 0);
    assert.equal(f1.scene.notePoses[0].waveAmplitude, 0);
    near(f1.scene.cameraPosition[2], .19, .003, 'F1 camera z');
    near(f1.scene.cameraRoll, 0, .15, 'F1 camera roll');
    assert.equal(f1.scene.fov, mobile ? 40 : 30, 'F1 must be at the reference lens');
    sourceMapping(f1);
    const f1Bytes = await page.screenshot({ path: path.join(out, `${label}-f1.png`) });
    const f1Tone = gradedFists(f1Bytes, f1, 'F1');
    console.log(`${label} F1 medallion fists: lit ${f1Tone.lit.hex} (n ${f1Tone.lit.n}), shadow ${f1Tone.shadow.hex} (n ${f1Tone.shadow.n}); reference ${REFERENCE.lit} / ${REFERENCE.shadow}.`);

    await seek(page, .033);
    const swapping = await state(page);
    covered(swapping, 'swap');
    assert.ok(swapping.handsOpacity > 0 && swapping.handsOpacity < 1, 'the scene swap must happen beneath the opaque note');
    near(swapping.handsOpacity, handsFor(swapping.scene.progress), 1e-3, 'swap hands');
    assert.ok(Math.abs(swapping.handsOpacity + swapping.starOpacity - 1) < .001,
      `the star backdrop must replace the hands beneath the cover: hands=${swapping.handsOpacity}, stars=${swapping.starOpacity}`);

    // one scroll pixel past the window, so a seek that lands a hair short
    // of .036 cannot leave a 5e-4 sliver of the hands
    await seek(page, SWAP[1] + .0005);
    const swapped = await state(page);
    covered(swapped, 'swap end');
    assert.equal(swapped.handsOpacity, 0, 'hands must be hidden before the note uncovers a corner');
    assert.equal(swapped.starOpacity, 1);
    if (!reduced) assert.equal(swapped.portalBackground, true, 'the next scene must be mounted beneath the opaque paper');

    const snapshots = {};
    for (const [b, name] of [[.066, 'f2'], [.105, 'f3'], [.141, 'f4']]) {
      await seek(page, b);
      const shot = await state(page);
      assert.equal(shot.scene.phase, 'portal');
      near(shot.scene.portal.opacity, portalFor(shot.scene.progress), .01, `${name} portal opacity`);
      near(shot.scene.portal.opacity, { f2: .73, f3: .45, f4: .18 }[name], .015, `${name} portal opacity (reference)`);
      assert.equal(shot.scene.portal.visible, true);
      assert.equal(shot.scene.portal.still, 'zero-stage');
      assert.equal(shot.handsOpacity, 0);
      sourceMapping(shot);
      freeScroll(shot);
      snapshots[name] = shot;
      await page.screenshot({ path: path.join(out, `${label}-${name}.png`) });
    }

    await seek(page, PORTAL_END + .001);
    const f5 = await state(page);
    assert.equal(f5.scene.phase, 'settle');
    assert.ok(f5.scene.portal.opacity <= .002, `the circle must be gone at b ${PORTAL_END}: ${f5.scene.portal.opacity}`);
    assert.equal(f5.scene.portal.visible, false);
    near(f5.scene.cameraRoll, 14.4, .3, 'F5 camera roll');
    near(f5.scene.cameraPosition[2], .48, .01, 'F5 camera z');
    near(f5.scene.fov, mobile ? 40 : 30, .05, 'F5 must still be at the reference lens');
    noCopy(f5, 'F5');
    assert.ok(f5.scene.embers.opacity >= .99 && f5.scene.embers.visible, `the embers must be up at F5: ${JSON.stringify(f5.scene.embers)}`);
    if (!reduced) {
      assert.equal(f5.sky, 0, 'the sky stays behind the plate until the hero burns');
      assert.equal(f5.plateOpacity, 1, 'the plate must be opaque before the burn');
    }
    sourceMapping(f5);
    await page.screenshot({ path: path.join(out, `${label}-f5.png`) });

    // the lens eases to the approved burn framing before the hero burns
    await seek(page, BURN_START);
    const lensSettled = await state(page);
    near(lensSettled.scene.fov, BURN_FOV, .05, 'the burn must start at the approved fov 50');
    // a seek lands within one scroll pixel (±.0004 b), which is ±.001 of hero burn
    assert.ok(lensSettled.scene.notePoses[0].burnProgress < .002, `the hero must not have started burning at b .285: ${lensSettled.scene.notePoses[0].burnProgress}`);
    if (!reduced) near(lensSettled.plateOpacity, 1, .002, 'the plate must still cover the sky at the start of the burn');
    await seek(page, .33);
    const igniting = await state(page);
    assert.ok(igniting.scene.notePoses[0].burnProgress > 0, 'the hero must be burning at b .33');
    if (!reduced) {
      near(igniting.sky, skyFor(igniting.scene.notePoses[0].burnProgress), .002, 'sky plate law (smoothstep of hero burn / .1)');
      near(igniting.plateOpacity, 1 - igniting.sky, .002, 'the plate must follow --bill-sky with no transition');
      assert.ok(igniting.plateOpacity > 0 && igniting.plateOpacity < 1, `the sky must be mid-reveal through the burning hero: ${igniting.plateOpacity}`);
    }

    await seek(page, .04);
    assert.equal((await state(page)).titleOpacity, 0, 'the WE SCALE title must be gone under the note');
    // the stops where the retired copy used to arrive (.151 -> .212) and
    // leave (.782): every trace must be absent at each of them
    let settleStop = null, settleBytes = null;
    for (const b of NO_COPY_STOPS) {
      await seek(page, b);
      const shot = await state(page);
      noCopy(shot, `b ${b}`);
      if (b === SETTLE_STOP) {
        settleStop = shot;
        settleBytes = await page.screenshot({ path: path.join(out, `${label}-settle.png`) });
        if (!reduced) assert.equal(shot.plateOpacity, 1, 'the sky must still be covered at the settle stop');
      }
    }

    await seek(page, .5);
    const burning = await state(page);
    assert.equal(burning.scene.phase, 'burn');
    assert.ok(burning.scene.progress > BURN_START);
    assert.ok(burning.scene.notePoses[0].burnProgress > 0, 'the hero note must be burning');
    assert.equal(burning.scene.fov, BURN_FOV, 'the burn must run at the approved fov 50');
    assert.equal(burning.handsOpacity, 0);
    assert.equal(burning.starOpacity, 1, 'the star backdrop must be revealed through burned openings');
    if (!reduced) {
      assert.equal(burning.portalBackground, true, 'the next scene must be present beneath burned openings');
      assert.equal(burning.sky, 1, 'the sky must be fully revealed once the hero burn passes .1');
      assert.equal(burning.plateOpacity, 0, 'the plate must be gone during the burn');
    }
    noCopy(burning, 'burn');
    sourceMapping(burning);
    freeScroll(burning);
    await page.screenshot({ path: path.join(out, `${label}-burn.png`) });
    await page.waitForTimeout(1000);
    const idle = await state(page);
    assert.deepEqual(idle.scene, burning.scene, 'all bill transforms and shader clocks must remain frozen while idle');
    assert.equal(idle.raw, burning.raw, 'idle must not advance scroll');

    await seek(page, .105);
    const reversed = await state(page);
    assert.deepEqual(reversed.scene, snapshots.f3.scene, 'reverse scroll must restore precisely the same portal frame');
    assert.equal(reversed.handsOpacity, snapshots.f3.handsOpacity);
    await page.screenshot({ path: path.join(out, `${label}-reverse.png`) });

    // the settle stop again, arrived at from the burn: pixel-equal to the
    // forward capture (the plate covers the live sky, so the whole frame is
    // f(b) here, not just the notes)
    await seek(page, SETTLE_STOP);
    const settleAgain = await state(page);
    assert.deepEqual(settleAgain.scene, settleStop.scene, 'reverse scroll must restore the same settle frame');
    assert.equal(settleAgain.sky, settleStop.sky);
    noCopy(settleAgain, 'settle (reverse)');
    const settleReverseBytes = await page.screenshot({ path: path.join(out, `${label}-settle-reverse.png`) });
    const settleDrift = changedPercent(decode(settleBytes), decode(settleReverseBytes));
    assert.ok(settleDrift <= .2, `the forward and reverse settle captures must be pixel-equal: ${settleDrift.toFixed(3)} % changed`);
    console.log(`${label} forward/reverse settle captures: ${settleDrift.toFixed(3)} % of pixels differ.`);

    await seek(page, .5);
    assert.deepEqual((await state(page)).scene, burning.scene, 'forward replay must restore precisely the same burn frame');

    await seek(page, SWAP[0]);
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(() => {
      const scene = window.__buildanta.intro.billTransition.scene;
      return scene.sourceProgress > 0 && scene.portal.opacity < .98;
    }, null, { timeout: 10000 });
    const responsive = await state(page);
    assert.ok(responsive.scene.sourceProgress > 0, 'a modest wheel movement after F1 must advance the animation');
    freeScroll(responsive);
    sourceMapping(responsive);
    await page.waitForTimeout(300);
    const settled = await state(page);
    await page.mouse.wheel(0, -180);
    await page.waitForFunction(start => window.__buildanta.intro.billTransition.scene.progress < start - .005,
      settled.scene.progress, { timeout: 10000 });
    freeScroll(await state(page));

    await seek(page, 1);
    if (!reduced) await page.waitForFunction(() => document.querySelector('.intro__portalwrap').classList.contains('on'), null, { timeout: 15000 });
    // The reduced-motion gate shows at p > .9999, parks the page at the top
    // and (existing behaviour) completes on its own about a second later.
    else await page.waitForFunction(() => window.__buildanta.entryGate?.active || window.__buildanta.entryGate?.completed, null, { timeout: 15000 });
    const next = await state(page);
    if (reduced) assert.ok(next.entryGateActive || next.entryGateCompleted, 'reduced motion must reach its existing entry gate');
    else assert.ok(next.scene.progress > .999);
    if (!reduced) assert.ok(next.canvasOpacity < .001);
    assert.equal(next.portal, !reduced);
    await page.screenshot({ path: path.join(out, `${label}-${reduced ? 'entry' : 'portal'}.png`) });
    if (!reduced) assert.equal(next.plateOpacity, null, 'the plate belongs to the background mode only, never to the wall');
    assert.deepEqual(errors, []);
    assert.deepEqual(oldRequests, []);
    console.log(`PASS ${label}: graded fists in the portal, opaque cover through the concealed swap, F2-F5 portal fade, reference lens through F5 then fov 50, sky plate until the burn, no copy lockup, frozen idle, exact reverse (pixels too), wheel control, ${reduced ? 'existing entry gate' : 'portal'}.`);
  } catch (error) {
    const snapshot = await state(page);
    console.error(`FAIL ${label}:`, JSON.stringify({ ...snapshot, scene: {
      progress: snapshot.scene?.progress, phase: snapshot.scene?.phase,
      opacity: snapshot.scene?.opacity, ready: snapshot.scene?.ready, portal: snapshot.scene?.portal,
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
    // Chrome retries a fetch that dies with ERR_FAILED once on its own (also
    // observed on the pre-D-076 code), so count attempts, not exactly one.
    assert.ok(aborted >= 1 && aborted <= 2, `the atlas must have been requested: ${aborted}`);
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
    assert.notEqual(pending.scene.portal.still, 'zero-stage', 'the still cannot be installed before the scene is ready');
    assert.equal(pending.portalStillBaked, false);
    freeScroll(pending);
    releaseAtlas();
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready, null, { timeout: 30000 });
    await page.waitForTimeout(180);
    const ready = await state(page);
    assert.ok(requested >= 1 && requested <= 2, `the atlas must have been requested once (Chrome may duplicate a stalled fetch): ${requested}`);
    assert.ok(Math.abs(ready.scene.progress - .5) < .001, 'late loading must use the current scroll position');
    assert.equal(ready.raw, pending.raw, 'late loading must not move the visitor');
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.scene.portal.still === 'zero-stage',
      null, { timeout: 20000 });
    const stilled = await state(page);
    assert.equal(stilled.raw, pending.raw, 'installing the still must not move the visitor');
    await page.waitForTimeout(1000);
    assert.deepEqual((await state(page)).scene, stilled.scene);
    freeScroll(stilled);
    assert.deepEqual(errors, []);
    console.log('PASS delayed atlas: hands persist while loading; ready frame follows scroll, receives the still, and remains frozen.');
  } finally { releaseAtlas(); await page.close(); }
}

async function verifyStageNotReady(browser) {
  /* Blocking meet-fistbump.glb strands the whole boot (the rig is a load
     dependency of the preloader — pre-existing), so the fallback is exercised
     by withholding the rig's readiness flag: the still cannot bake, the portal
     must draw leather only and the transition must still complete; once the
     flag returns the still installs on the next tick without moving anyone. */
  const { page, errors } = await openPage(browser, {});
  try {
    await page.evaluate(() => { window.__zeroMirrorStageBridge.state.bridgeReady = false; });
    await seek(page, .991, true);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready, null, { timeout: 30000 });
    await seek(page, .066);
    const leather = await state(page);
    assert.equal(leather.portalStillBaked, false, 'no still can be baked without the fist rig');
    assert.equal(leather.scene.portal.still, 'leather-only', 'without the fist rig the portal must draw leather only');
    assert.equal(leather.scene.portal.visible, true);
    near(leather.scene.portal.opacity, portalFor(leather.scene.progress), .01, 'leather-only portal opacity');
    assert.equal(leather.canvasOpacity, 1);
    freeScroll(leather);
    await page.screenshot({ path: path.join(out, 'stage-not-ready-f2.png') });
    await seek(page, 1);
    await page.waitForFunction(() => document.querySelector('.intro__portalwrap').classList.contains('on'), null, { timeout: 15000 });
    assert.equal((await state(page)).portal, true);

    await page.evaluate(() => { window.__zeroMirrorStageBridge.state.bridgeReady = true; });
    await seek(page, .066);
    await page.waitForFunction(() => window.__buildanta.intro.billTransition.scene.portal.still === 'zero-stage', null, { timeout: 20000 });
    const stilled = await state(page);
    assert.equal(stilled.portalStillBaked, true);
    assert.ok(Math.abs(stilled.scene.progress - leather.scene.progress) < 1e-9, 'installing the still must not move the visitor');
    await page.screenshot({ path: path.join(out, 'stage-not-ready-restored-f2.png') });
    assert.deepEqual(errors, []);
    console.log('PASS stage not ready: leather-only portal, transition completes, still installs later in place.');
  } finally { await page.close(); }
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
      ['stage-not-ready', () => verifyStageNotReady(browser)],
    ];
    for (const [label, run] of cases) if (!selectedCases || selectedCases.includes(label)) await run();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
