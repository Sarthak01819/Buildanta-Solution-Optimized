/* Narrow regression for the reference title styling and masked edge blur. */
const fs = require('fs'), path = require('path');
const { decode } = require('./png.cjs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots-zero-stage', 'design');
const SITE = process.env.SITE_URL || 'http://127.0.0.1:5173/';
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots-zero-stage', 'title', 'report.json'), 'utf8'));
const stops = [.30, .82, .99];

async function seek(page, source, film) {
  await page.waitForFunction(() => !document.querySelector('.preload'), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const y = await page.evaluate(({ source, film }) => {
      const { intro, lenis } = window.__buildanta;
      let raw;
      if (film !== undefined) {
        const p = .768 + .848 * .224, e = .00001;
        const a = intro.rawForP(p), b = 2 * intro.rawForP(p + e) - intro.rawForP(p + 2 * e);
        raw = a + (b - a) * film;
      } else raw = intro.rawForZeroStage(source);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      window.__designStableSince = 0;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
      return y;
    }, { source, film });
    try {
      await page.waitForFunction(({ y, source, film }) => {
        const s = window.__zeroMirrorStageBridge.state, canvas = document.querySelector('.consult-zero__hand-canvas');
        const expected = matchMedia('(prefers-reduced-motion: reduce)').matches ? .95 : source;
        const okay = Math.abs(scrollY - y) <= 2 && (film !== undefined ? s.opacity < .001 : canvas.width > 100 && s.opacity > .99 && Math.abs(s.progress - expected) < .0025);
        if (!okay) { window.__designStableSince = 0; return false; }
        if (!window.__designStableSince) window.__designStableSince = performance.now();
        return performance.now() - window.__designStableSince >= 250;
      }, { y, source, film }, { timeout: 5000 });
      return;
    } catch (error) { if (attempt === 3) throw error; }
  }
}

async function observe(page) {
  return page.evaluate(() => {
    const alpha = (el) => {
      let result = 1;
      if (!el) return 0;
      for (; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return 0;
        result *= Number(style.opacity);
      }
      return result;
    };
    const bounds = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
    };
    const title = document.querySelector('.consult-meet__title'), blur = document.querySelector('.consult-meet__edgeblur');
    const api = window.__zeroMirrorStageBridge, styles = {};
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
    const hidden = Object.fromEntries(['.consult-meet__target', '.consult-meet__veil', '.consult-zero__hud'].map((s) => [s, alpha(document.querySelector(s))]));
    return { progress: api.state.progress, time: api.state.time, stageOpacity: api.state.opacity,
      title: { opacity: alpha(title), count: document.querySelectorAll('.consult-meet__title').length, originalParent: title.parentElement.classList.contains('consult-meet'), text: title.textContent.replace(/\s+/g, ' ').trim(), bounds: bounds(title), styles },
      blur: { opacity: alpha(blur), filter: getComputedStyle(blur).backdropFilter, mask: getComputedStyle(blur).maskImage, pointerEvents: getComputedStyle(blur).pointerEvents }, hidden,
      legacy: Boolean(window.__buildanta.meetRoot), errors: api.state.loadErrors,
      camera: [...api.camera.matrixWorld.elements, ...api.camera.projectionMatrix.elements], hands, bones };
  });
}

function maxDelta(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  const keys = Object.keys(a || {});
  return keys.length === Object.keys(b || {}).length ? Math.max(0, ...keys.map((k) => maxDelta(a[k], b[k]))) : Infinity;
}
function pixelDiff(a, b, region = () => true) {
  if (a.w !== b.w || a.h !== b.h) return { changedPercent: 100, mean: 255 };
  let changed = 0, sum = 0, count = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (!region(x / a.w, y / a.h)) continue;
    const i = (y * a.w + x) * a.bpp, j = (y * b.w + x) * b.bpp;
    const delta = [0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[j + c]));
    if (Math.max(...delta) > 10) changed++;
    sum += delta.reduce((s, v) => s + v, 0) / 3; count++;
  }
  return { changedPercent: 100 * changed / count, mean: sum / count };
}
const center = (x, y) => x >= .4 && x <= .6 && y >= .36 && y <= .62;
const edges = (x) => x <= .12 || x >= .88;
async function shot(page, name) {
  const bytes = await page.screenshot({ scale: 'css' });
  const file = path.join(OUT, name); fs.writeFileSync(file, bytes); return { file, pixels: decode(bytes) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), runs: [] };
  const save = () => fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  try {
    for (const config of [{ name: 'desktop', width: 1535, height: 790, dpr: 1.25 }, { name: 'phone', width: 390, height: 844, dpr: 2 }, { name: 'reduced', width: 1200, height: 590, dpr: 1, reduced: true }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === 'phone', hasTouch: config.name === 'phone', reducedMotion: config.reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), run = { config, samples: [], checks: [], errors: [], externalErrors: [] }; report.runs.push(run);
      const check = (name, pass) => run.checks.push({ name, pass });
      page.on('pageerror', (e) => run.errors.push(e.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const url = message.location().url || '';
        const external = /^https?:/.test(url) && new URL(url).origin !== new URL(SITE).origin;
        (external ? run.externalErrors : run.errors).push(`${message.text()} @ ${url}`);
      });
      try {
        await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction('window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready', null, { timeout: 60000 });
        await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important;opacity:0!important}' });
        await page.evaluate(async () => { window.__bbPinTime = 300000; await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]); });
        await page.mouse.move(config.width / 2, config.height / 2);
        const images = new Map();
        for (const source of config.reduced ? [.99] : stops) {
          await seek(page, source);
          const state = await observe(page), frame = await shot(page, `${config.name}-source-${Math.round(source * 1000)}.png`);
          images.set(source, frame.pixels);
          const old = baseline.runs.find((r) => r.config.name === config.name)?.samples.find((s) => s.source === source)?.state;
          run.samples.push({ source, state, file: frame.file, sceneDelta: old ? { camera: maxDelta(state.camera, old.camera), hands: maxDelta(state.hands, old.hands), bones: maxDelta(state.bones, old.bones) } : null });
          save(); console.log(`[design] ${config.name} ${source}: ${frame.file}`);
        }
        const late = run.samples.filter((s) => s.source >= .82), inside = (b) => b.x >= -1 && b.y >= -1 && b.right <= config.width + 1 && b.bottom <= config.height + 1 && b.width > 0;
        // textContent does not insert whitespace at <br>; compare the exact
        // words/punctuation independently of that DOM-versus-rendered spacing.
        check('one original title with unchanged copy', run.samples.every(({ state: s }) => s.title.count === 1 && s.title.originalParent && s.title.text.replace(/\s/g, '') === 'WESCALE.AIexecutes.Humansdirect.Together,youscale.'));
        check('reference colors, italic mint, centered tracked tagline', late.every(({ state: { title: { styles: s } } }) => s.strong.color === 'rgb(242, 255, 247)' && s['strong em'].color === 'rgb(84, 240, 165)' && s['strong em'].fontStyle === 'italic' && s.p.color === 'rgba(210, 240, 222, 0.85)' && s['p em'].color === 'rgb(169, 255, 211)' && s.p.textAlign === 'center' && Math.abs(parseFloat(s.p.letterSpacing) / s.p.fontSize - .14) < .002));
        check('late title fits and masked blur is visible', late.every(({ state: s }) => s.title.opacity > .99 && inside(s.title.bounds) && Object.values(s.title.styles).every((v) => inside(v.bounds)) && s.blur.opacity > .99 && s.blur.filter === 'blur(30px)' && s.blur.mask.includes('48%') && s.blur.pointerEvents === 'none'));
        check('old HUD, veil and target remain hidden, no legacy scene', run.samples.every(({ state: s }) => !s.legacy && !s.errors?.length && Object.values(s.hidden).every((n) => n < .001)));
        if (config.reduced) {
          check('reduced motion remains a static source garden with title and blur', run.samples[0].state.progress === .95 && run.samples[0].state.time === 0);
        } else {
          check('entry and logos have neither new blur nor premature title', run.samples[0].state.blur.opacity < .001 && run.samples[0].state.title.opacity < .001);
          check('camera and both hand skeletons are unchanged', run.samples.every((s) => s.sceneDelta && Object.values(s.sceneDelta).every((n) => n < 1e-6) && Object.keys(s.state.bones).length === 48));
          const previous = decode(fs.readFileSync(path.join(ROOT, 'shots-zero-stage', 'title-color', `${config.name}-source-990.png`)));
          // D-064 intentionally softens background pixels inside this broad
          // center rectangle. Neutralize only that new filter for comparison
          // to the old sharp-background baseline, then restore it immediately.
          const backgroundRadius = await page.evaluate(() => window.__zeroMirrorStageBridge.state.landscape?.blurRadiusCssPx || 0);
          let baselineFrame = images.get(.99);
          if (backgroundRadius > 0) {
            await page.evaluate(async () => {
              window.__zeroMirrorStageBridge.state.landscape.blurRadiusCssPx = 0;
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            });
            baselineFrame = (await shot(page, `${config.name}-sharp-background-baseline-diagnostic.png`)).pixels;
            await page.evaluate(async (radius) => {
              window.__zeroMirrorStageBridge.state.landscape.blurRadiusCssPx = radius;
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }, backgroundRadius);
          }
          run.baselineCenter = pixelDiff(baselineFrame, previous, center);
          check('center contact matches baseline with new background softness neutralized', run.baselineCenter.changedPercent < .1 && run.baselineCenter.mean < .2);
          const earlyOld = decode(fs.readFileSync(path.join(ROOT, 'shots-zero-stage', 'landscape', 'after', `${config.name}-source-300.png`)));
          run.entryPixels = pixelDiff(images.get(.3), earlyOld);
          check('early source image remains unchanged', run.entryPixels.changedPercent < .1);
          await page.evaluate(() => { document.querySelector('.consult-meet__edgeblur').style.setProperty('visibility', 'hidden', 'important'); });
          const unblurred = await shot(page, `${config.name}-source-990-unblurred-diagnostic.png`);
          await page.evaluate(() => { document.querySelector('.consult-meet__edgeblur').style.removeProperty('visibility'); });
          run.blurPixels = { center: pixelDiff(images.get(.99), unblurred.pixels, center), edges: pixelDiff(images.get(.99), unblurred.pixels, edges) };
          check('blur changes screen edges but preserves sharp center', run.blurPixels.center.changedPercent < .1 && run.blurPixels.edges.changedPercent > 1 && run.blurPixels.edges.mean > 2);
          await seek(page, .3); await seek(page, .99);
          const reverse = await shot(page, `${config.name}-source-990-return.png`);
          run.reverse = { pixels: pixelDiff(images.get(.99), reverse.pixels), state: await observe(page) };
          check('return scrolling restores exact title and blur composition', run.reverse.pixels.changedPercent < .1 && run.reverse.state.title.opacity > .99 && run.reverse.state.blur.opacity > .99);
          await seek(page, .99, .14); run.epilogue = await observe(page);
          check('title and edge blur exit with source scene', run.epilogue.stageOpacity < .001 && run.epilogue.title.opacity < .001 && run.epilogue.blur.opacity < .001);
        }
        save();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ viewport: r.config.name, ...c })));
  console.log(JSON.stringify({ report: path.join(OUT, 'report.json'), checks: report.runs.reduce((n, r) => n + r.checks.length, 0), failures, errors: report.runs.flatMap((r) => r.errors) }, null, 2));
  if (failures.length || report.runs.some((r) => r.errors.length)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
