/* D-065: removing the two archived statue/CTA screens must not alter the
 * source hands, circle, copy or retained closing-note sequence. */
const fs = require('fs'), path = require('path');
const { decode } = require('./png.cjs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots-zero-stage', 'removed-growth-sections');
const OLD = path.join(ROOT, 'shots-zero-stage', 'background-softness');
const baseline = JSON.parse(fs.readFileSync(path.join(OLD, 'report.json'), 'utf8'));
const SITE = process.env.SITE_URL || 'http://127.0.0.1:5173/';
const CLASS_ONLY = process.argv.includes('--class-only');
const REPORT_FILE = path.join(OUT, CLASS_ONLY ? 'class-sweep.json' : 'report.json');
const BOUNDARY = .768 + .848 * .224;
const REMOVED = '.consult-film__shot--think,.consult-film__copy--hours,.consult-film__final-scene';
const removedAsset = /\/consult-shot-(?:think|cta)(?:-wide)?\.webp(?:[?#]|$)/;

async function seek(page, target, source = false) {
  await page.waitForFunction(() => !document.querySelector('.preload'), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const y = await page.evaluate(({ target, source }) => {
      const { intro, lenis } = window.__buildanta;
      const raw = source ? intro.rawForZeroStage(target) : intro.rawForP(target);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      window.__archiveStableSince = 0;
      lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);
      return y;
    }, { target, source });
    try {
      await page.waitForFunction(({ target, source, y }) => {
        const api = window.__zeroMirrorStageBridge;
        const canvas = document.querySelector('.consult-zero__hand-canvas');
        const expected = matchMedia('(prefers-reduced-motion: reduce)').matches ? .95 : target;
        const okay = Math.abs(scrollY - y) <= 2 && canvas.width > 100 &&
          (!source || api.state.opacity > .99 && Math.abs(api.state.progress - expected) < .0025);
        if (!okay) { window.__archiveStableSince = 0; return false; }
        if (!window.__archiveStableSince) window.__archiveStableSince = performance.now();
        return performance.now() - window.__archiveStableSince >= 250;
      }, { target, source, y }, { timeout: 5000 });
      return;
    } catch (error) { if (attempt === 3) throw error; }
  }
}
async function observe(page) {
  return page.evaluate((selector) => {
    const api = window.__zeroMirrorStageBridge, title = document.querySelector('.consult-meet__title');
    const bounds = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
    const styles = {};
    for (const selector of ['strong', 'strong em', 'p', 'p em']) {
      const el = title.querySelector(selector), css = getComputedStyle(el);
      styles[selector] = { color: css.color, font: css.fontFamily, fontSize: parseFloat(css.fontSize), fontStyle: css.fontStyle, letterSpacing: css.letterSpacing, textAlign: css.textAlign, shadow: css.textShadow, bounds: bounds(el) };
    }
    api.scene.updateMatrixWorld(true);
    const hands = {}, bones = {};
    for (const name of ['GreenHand', 'HumanHand']) {
      const hand = api.scene.getObjectByName(name); hands[name] = hand?.matrixWorld.toArray();
      hand?.traverse((mesh) => mesh.skeleton?.bones.forEach((bone) => { bones[`${name}/${bone.name}`] = bone.matrixWorld.toArray(); }));
    }
    const root = document.querySelector('.consult-zero'), css = getComputedStyle(root);
    return { progress: api.state.progress, time: api.state.time, opacity: api.state.opacity,
      landscape: api.state.landscape, camera: [...api.camera.matrixWorld.elements, ...api.camera.projectionMatrix.elements], hands, bones,
      title: { styles, opacity: Number(getComputedStyle(title).opacity), count: document.querySelectorAll('.consult-meet__title').length },
      filmLive: document.querySelector('#intro').classList.contains('film-live'), removedElements: document.querySelectorAll(selector).length,
      removedCopy: /stop\s*wasting\s*growth\s*hours|book\s*a\s*growth\s*call/i.test(document.body.textContent),
      filmEverLive: window.__archiveFilmEverLive, noteFocus: root.classList.contains('note-focus'),
      sourceLive: root.classList.contains('source-live'), starOpacity: css.getPropertyValue('--zero-stars'),
      rootOpacity: Number(css.opacity), canvas: bounds(document.querySelector('.consult-zero__hand-canvas')),
      errors: api.state.loadErrors };
  }, REMOVED);
}
function maxDelta(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  const keys = Object.keys(a || {});
  return keys.length === Object.keys(b || {}).length ? Math.max(0, ...keys.map((key) => maxDelta(a[key], b[key]))) : Infinity;
}
function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { changedPercent: 100, mean: 255 };
  let changed = 0, sum = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = (y * a.w + x) * a.bpp, j = (y * b.w + x) * b.bpp;
    const values = [0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[j + c]));
    if (Math.max(...values) > 10) changed++;
    sum += values.reduce((a, b) => a + b, 0) / 3;
  }
  return { changedPercent: changed / (a.w * a.h) * 100, mean: sum / (a.w * a.h) };
}
function luminance(image) {
  let sum = 0, nonBlack = 0;
  for (let i = 0; i < image.data.length; i += image.bpp) {
    const l = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
    sum += l; if (l > 25) nonBlack++;
  }
  return { mean: sum / (image.w * image.h), nonBlackPercent: nonBlack / (image.w * image.h) * 100 };
}
async function shot(page, name) {
  const bytes = await page.screenshot({ scale: 'css' }), file = path.join(OUT, name);
  fs.writeFileSync(file, bytes); return { file, image: decode(bytes) };
}
async function normalizeSource(page, progress) {
  // Removing two viewport heights changes the document's fractional scroll
  // rounding. Retain the live-scroll sample, then compare the old exact
  // authored driver value separately; no runtime source module is modified.
  await page.evaluate(async (p) => {
    const api = window.__zeroMirrorStageBridge;
    window.__archiveOriginalUpdate = api.update;
    api.update = (input) => window.__archiveOriginalUpdate({ ...input, progress: p });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, progress);
}
async function restoreSource(page) {
  await page.evaluate(async () => {
    window.__zeroMirrorStageBridge.update = window.__archiveOriginalUpdate;
    delete window.__archiveOriginalUpdate;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
const smooth = (v) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), boundary: BOUNDARY, runs: [] };
  const save = () => fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  try {
    for (const config of [{ name: 'desktop', width: 1535, height: 790, dpr: 1.25 }, { name: 'phone', width: 390, height: 844, dpr: 2 }, { name: 'reduced', width: 1200, height: 590, dpr: 1, reduced: true }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr,
        isMobile: config.name === 'phone', hasTouch: config.name === 'phone', reducedMotion: config.reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), run = { config, samples: [], transition: [], checks: [], errors: [], externalErrors: [], requests: [], failedRequests: [] };
      report.runs.push(run); const check = (name, pass) => run.checks.push({ name, pass });
      page.on('request', (r) => { if (removedAsset.test(r.url())) run.requests.push(r.url()); });
      page.on('requestfailed', (r) => run.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
      page.on('pageerror', (e) => run.errors.push(e.message));
      page.on('console', (m) => { if (m.type() !== 'error') return; const url = m.location().url || ''; (/^https?:/.test(url) && new URL(url).origin !== new URL(SITE).origin ? run.externalErrors : run.errors).push(`${m.text()} @ ${url}`); });
      await page.addInitScript(() => {
        window.__archiveFilmEverLive = false;
        new MutationObserver(() => { if (document.querySelector('#intro.film-live')) window.__archiveFilmEverLive = true; }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      });
      try {
        await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction('window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready', null, { timeout: 60000 });
        await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important;opacity:0!important}' });
        await page.evaluate(async () => { window.__bbPinTime = 300000; await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]); });
        await page.mouse.move(config.width / 2, config.height / 2);
        if (CLASS_ONLY) {
          for (const [target, source] of [[.99, true], [.951476, false], [.959, false], [.965, false], [.98, false], [.99, true]]) {
            await seek(page, target, source);
            run.samples.push({ target, source, state: await observe(page) });
          }
          check('intro-root film-live class never activates in either scroll direction', run.samples.every((s) => !s.state.filmLive && !s.state.filmEverLive));
          check('removed portions and copy stay absent in either direction', run.samples.every((s) => !s.state.removedElements && !s.state.removedCopy));
          check('removed image assets are never requested', !run.requests.length);
          save(); console.log(`[archive] ${config.name} intro-root class sweep completed`);
          continue;
        }
        const frames = new Map();
        for (const source of config.reduced ? [.99] : [.99, .3]) {
          await seek(page, source, true); const state = await observe(page), frame = await shot(page, `${config.name}-source-${Math.round(source * 1000)}.png`);
          const old = baseline.runs.find((r) => r.config.name === config.name)?.samples.find((s) => s.source === source)?.state;
          const sample = { source, state, file: frame.file };
          if (old) {
            sample.liveSceneDelta = { camera: maxDelta(state.camera, old.camera), hands: maxDelta(state.hands, old.hands), bones: maxDelta(state.bones, old.bones) };
            sample.sameTitleStyles = JSON.stringify(state.title.styles) === JSON.stringify(old.title.styles);
            const baselineImage = decode(fs.readFileSync(path.join(OLD, `${config.name}-source-${Math.round(source * 1000)}.png`)));
            sample.livePixels = diff(frame.image, baselineImage);
            sample.scrollQuantizationDelta = state.progress - old.progress;
            await normalizeSource(page, old.progress);
            try {
              const normalized = await observe(page);
              const diagnostic = await shot(page, `${config.name}-source-${Math.round(source * 1000)}-exact-driver-diagnostic.png`);
              sample.normalized = { progress: normalized.progress, baselineProgress: old.progress, file: diagnostic.file,
                pixels: diff(diagnostic.image, baselineImage),
                sceneDelta: { camera: maxDelta(normalized.camera, old.camera), hands: maxDelta(normalized.hands, old.hands), bones: maxDelta(normalized.bones, old.bones) } };
            } finally { await restoreSource(page); }
          }
          frames.set(source, frame.image); run.samples.push(sample); save(); console.log(`[archive] ${config.name} source ${source}: ${frame.file}`);
        }
        run.mapping = await page.evaluate((boundary) => {
          const intro = window.__buildanta.intro, span = intro.st.end - intro.st.start, epsilon = .00001;
          const start = intro.rawForP(boundary), after = 2 * intro.rawForP(boundary + epsilon) - intro.rawForP(boundary + 2 * epsilon);
          return { holdPixels: (after - start) * span, fadePixels: (intro.rawForP(boundary) - intro.rawForP(.945)) * span, pinViewportHeights: span / innerHeight };
        }, BOUNDARY);
        for (const p of [.945, (.945 + BOUNDARY) / 2, BOUNDARY, .965, .976, .98]) {
          await seek(page, p); const state = await observe(page), frame = await shot(page, `${config.name}-timeline-${Math.round(p * 1000000)}.png`);
          const actualP = await page.evaluate((boundary) => {
            const intro = window.__buildanta.intro, span = intro.st.end - intro.st.start;
            const yFor = (p) => intro.st.start + intro.rawForP(p) * span;
            const by = yFor(boundary), reference = scrollY < by ? .945 : .98;
            return boundary + (scrollY - by) / (yFor(reference) - by) * (reference - boundary);
          }, BOUNDARY);
          run.transition.push({ p, actualP, expectedOpacity: 1 - smooth((actualP - .945) / (BOUNDARY - .945)), state, file: frame.file, luminance: luminance(frame.image) });
          save(); console.log(`[archive] ${config.name} timeline ${p}: ${frame.file}`);
        }
        const all = [...run.samples, ...run.transition];
        check('both complete removed portions and their copy are absent', all.every((s) => !s.state.removedElements && !s.state.removedCopy));
        check('no film-live activation occurs throughout forward scrolling', all.every((s) => !s.state.filmLive && !s.state.filmEverLive));
        check('removed statue and CTA image assets are never requested', !run.requests.length);
        check('former film boundary has no extra scroll hold', Math.abs(run.mapping.holdPixels) < .01);
        check('source fade is short rather than a two-screen dwell', run.mapping.fadePixels > 0 && run.mapping.fadePixels < config.height * .25);
        check('source opacity exactly follows the smooth fade at the browser-resolved scroll pixels', run.transition.every((s) => Math.abs(s.state.opacity - s.expectedOpacity) < .00001) && run.transition[1].state.opacity > .45 && run.transition[1].state.opacity < .55);
        check('title and source remain absent after the boundary through note and burn', run.transition.filter((s) => s.actualP >= BOUNDARY).every((s) => s.state.opacity < .001 && s.state.title.opacity < .001));
        check('following note and burn render a nonempty visible scene', run.transition.filter((s) => s.p >= .965).every((s) => s.luminance.nonBlackPercent > 3 && s.state.canvas.width >= config.width));
        check('note-focus class arrives for the fullscreen note/burn', run.transition.filter((s) => s.p >= .976).every((s) => s.state.noteFocus));
        if (config.reduced) check('reduced motion remains a static source garden', run.samples[0].state.progress === .95 && run.samples[0].state.time === 0);
        else {
          check('entry and fist bump images are pixel-identical at the exact prior source driver value', run.samples.every((s) => s.normalized.progress === s.normalized.baselineProgress && s.normalized.pixels.changedPercent === 0 && s.normalized.pixels.mean === 0));
          check('camera and all 48 hand bones remain unchanged at the exact source driver value', run.samples.every((s) => Object.values(s.normalized.sceneDelta).every((n) => n < 1e-6) && Object.keys(s.state.bones).length === 48));
          check('WE SCALE styling and background softness remain unchanged', run.samples.every((s) => s.sameTitleStyles && s.state.landscape.ready && s.state.landscape.blurRadiusCssPx === (config.name === 'phone' ? 2.25 : 3)));
        }
        await seek(page, .99, true); const reverse = await shot(page, `${config.name}-source-990-return.png`); run.reverse = { pixels: diff(reverse.image, frames.get(.99)), state: await observe(page) };
        check('reverse scroll restores the exact source composition without archived sections', run.reverse.pixels.changedPercent === 0 && run.reverse.pixels.mean === 0 && !run.reverse.state.filmEverLive && !run.reverse.state.removedElements);
        check('source assets load with no errors', all.every((s) => !s.state.errors?.length));
        save();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ viewport: r.config.name, ...c })));
  const errors = report.runs.flatMap((r) => r.errors);
  console.log(JSON.stringify({ report: REPORT_FILE, checks: report.runs.reduce((n, r) => n + r.checks.length, 0), failures, errors }, null, 2));
  if (failures.length || errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
