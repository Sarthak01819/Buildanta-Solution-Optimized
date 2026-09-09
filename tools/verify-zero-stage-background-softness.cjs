/* Background-only softness: no changes to source entry, pose, copy, or clock. */
const fs = require('fs'), path = require('path');
const { decode } = require('./png.cjs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'shots-zero-stage', 'background-softness');
const OLD = path.join(ROOT, 'shots-zero-stage', 'design');
const baseline = JSON.parse(fs.readFileSync(path.join(OLD, 'report.json'), 'utf8'));
const SITE = process.env.SITE_URL || 'http://127.0.0.1:5173/';

async function seek(page, p) {
  await page.waitForFunction(() => !document.querySelector('.preload'), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const y = await page.evaluate((p) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + intro.rawForZeroStage(p) * (intro.st.end - intro.st.start);
      window.__softnessStableSince = 0;
      lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);
      return y;
    }, p);
    try {
      await page.waitForFunction(({ p, y }) => {
        const s = window.__zeroMirrorStageBridge.state, canvas = document.querySelector('.consult-zero__hand-canvas');
        if (Math.abs(scrollY - y) > 2 || canvas.width <= 100 || s.opacity <= .99 || Math.abs(s.progress - p) >= .0025) { window.__softnessStableSince = 0; return false; }
        if (!window.__softnessStableSince) window.__softnessStableSince = performance.now();
        return performance.now() - window.__softnessStableSince >= 250;
      }, { p, y }, { timeout: 5000 });
      return;
    } catch (error) { if (attempt === 3) throw error; }
  }
}
async function state(page) {
  return page.evaluate(() => {
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
      hand?.traverse((mesh) => mesh.skeleton?.bones.forEach((b) => { bones[`${name}/${b.name}`] = b.matrixWorld.toArray(); }));
    }
    return { progress: api.state.progress, landscape: api.state.landscape, camera: [...api.camera.matrixWorld.elements, ...api.camera.projectionMatrix.elements], hands, bones, title: { styles, opacity: Number(getComputedStyle(title).opacity), count: document.querySelectorAll('.consult-meet__title').length }, errors: api.state.loadErrors };
  });
}
function delta(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  const keys = Object.keys(a || {});
  return keys.length === Object.keys(b || {}).length ? Math.max(0, ...keys.map((k) => delta(a[k], b[k]))) : Infinity;
}
function compare(a, b, roi = () => true) {
  let count = 0, changed = 0, sum = 0, beforeGradient = 0, afterGradient = 0;
  for (let y = 0; y < a.h - 1; y++) for (let x = 0; x < a.w - 1; x++) {
    if (!roi(x, y, a.w, a.h)) continue;
    let max = 0;
    for (let c = 0; c < 3; c++) {
      const i = (y * a.w + x) * a.bpp + c, j = (y * b.w + x) * b.bpp + c;
      const d = Math.abs(a.data[i] - b.data[j]); sum += d / 3; max = Math.max(max, d);
      afterGradient += (Math.abs(a.data[i] - a.data[i + a.bpp]) + Math.abs(a.data[i] - a.data[i + a.w * a.bpp])) / 6;
      beforeGradient += (Math.abs(b.data[j] - b.data[j + b.bpp]) + Math.abs(b.data[j] - b.data[j + b.w * b.bpp])) / 6;
    }
    if (max > 10) changed++; count++;
  }
  return { changedPercent: 100 * changed / count, mean: sum / count, gradientBefore: beforeGradient / count, gradientAfter: afterGradient / count, gradientRatio: afterGradient / beforeGradient };
}
async function shot(page, name) { const bytes = await page.screenshot({ scale: 'css' }); const file = path.join(OUT, name); fs.writeFileSync(file, bytes); return { file, image: decode(bytes) }; }
const rect = (l, t, r, b) => (x, y) => x >= l && x <= r && y >= t && y <= b;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), runs: [] }, save = () => fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  try {
    for (const config of [{ name: 'desktop', width: 1535, height: 790, dpr: 1.25, expectedRadius: 3, green: [744, 320, 751, 327], human: [805, 384, 819, 390] }, { name: 'phone', width: 390, height: 844, dpr: 2, expectedRadius: 2.25, green: [168, 362, 178, 372], human: [222, 416, 242, 422] }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === 'phone', hasTouch: config.name === 'phone' });
      const page = await context.newPage(), run = { config, samples: [], checks: [], errors: [], externalErrors: [] }; report.runs.push(run);
      const check = (name, pass) => run.checks.push({ name, pass });
      page.on('pageerror', (e) => run.errors.push(e.message));
      page.on('console', (m) => { if (m.type() !== 'error') return; const url = m.location().url || ''; (/^https?:/.test(url) && new URL(url).origin !== new URL(SITE).origin ? run.externalErrors : run.errors).push(`${m.text()} @ ${url}`); });
      try {
        await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction('window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready', null, { timeout: 60000 });
        await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important;opacity:0!important}' });
        await page.evaluate(async () => { window.__bbPinTime = 300000; await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]); });
        await page.mouse.move(config.width / 2, config.height / 2);
        const frames = new Map(); let zeroRadius;
        for (const p of [.99, .3]) {
          await seek(page, p); const observed = await state(page), frame = await shot(page, `${config.name}-source-${Math.round(p * 1000)}.png`);
          const original = baseline.runs.find((r) => r.config.name === config.name).samples.find((s) => s.source === p).state;
          run.samples.push({ source: p, state: observed, file: frame.file, sceneDelta: { camera: delta(observed.camera, original.camera), hands: delta(observed.hands, original.hands), bones: delta(observed.bones, original.bones) }, sameTitleStyles: JSON.stringify(observed.title.styles) === JSON.stringify(original.title.styles) });
          frames.set(p, frame.image); save(); console.log(`[softness] ${config.name} ${p}: ${frame.file}`);
          if (p === .99) {
            await page.evaluate(async () => { window.__zeroMirrorStageBridge.state.landscape.blurRadiusCssPx = 0; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
            zeroRadius = await shot(page, `${config.name}-source-990-zero-radius-diagnostic.png`);
            await page.evaluate(async (radius) => { window.__zeroMirrorStageBridge.state.landscape.blurRadiusCssPx = radius; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, config.expectedRadius);
          }
        }
        const oldEnding = decode(fs.readFileSync(path.join(OLD, `${config.name}-source-990.png`))), oldEntry = decode(fs.readFileSync(path.join(OLD, `${config.name}-source-300.png`)));
        // Below the hands, wholly inside the edge mask's fully clear center.
        run.background = compare(frames.get(.99), oldEnding, (x, y, w, h) => x / w >= .4 && x / w <= .48 && y / h >= .66 && y / h <= .72);
        // Manually inspected opaque finger interiors; translucent forearms are
        // intentionally excluded because they reveal the softened landscape.
        run.opaqueHand = { green: compare(frames.get(.99), oldEnding, rect(...config.green)), human: compare(frames.get(.99), oldEnding, rect(...config.human)) };
        run.entry = compare(frames.get(.3), oldEntry);
        run.zeroRadiusBaseline = compare(zeroRadius.image, oldEnding);
        check('requested background CSS pixel radius is active', run.samples.every((s) => s.state.landscape?.blurRadiusCssPx === config.expectedRadius));
        check('zero-radius diagnostic exactly restores the previous composition', run.zeroRadiusBaseline.changedPercent === 0 && run.zeroRadiusBaseline.mean === 0);
        check('center landscape is softened independently of masked edge blur', run.background.changedPercent > 5 && run.background.mean > 1 && run.background.gradientRatio < .95);
        check('opaque green and human finger interiors stay unchanged', Object.values(run.opaqueHand).every((p) => p.changedPercent === 0 && p.mean < .5));
        check('early hand and logo scene is pixel-identical', run.entry.changedPercent === 0 && run.entry.mean === 0);
        check('camera and all 48 hand bones are unchanged', run.samples.every((s) => Object.values(s.sceneDelta).every((n) => n < 1e-6) && Object.keys(s.state.bones).length === 48));
        check('reference title styling and bounds remain unchanged', run.samples.every((s) => s.sameTitleStyles && s.state.title.count === 1));
        await seek(page, .99); const reverse = await shot(page, `${config.name}-source-990-return.png`); run.reverse = compare(reverse.image, frames.get(.99));
        check('return scrolling is pixel-identical', run.reverse.changedPercent === 0 && run.reverse.mean === 0);
        check('landscape textures remain ready with no source asset errors', run.samples.every((s) => s.state.landscape.ready && !s.state.errors?.length));
        save();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ viewport: r.config.name, ...c })));
  console.log(JSON.stringify({ report: path.join(OUT, 'report.json'), checks: report.runs.reduce((n, r) => n + r.checks.length, 0), failures, errors: report.runs.flatMap((r) => r.errors) }, null, 2));
  if (failures.length || report.runs.some((r) => r.errors.length)) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
