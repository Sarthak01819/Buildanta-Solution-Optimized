/* Lightweight checks of the actual preparation code with scene stubs.
 * No WebGL contexts or large assets: safe alongside visual comparisons.
 * SITE_URL defaults to the optimized development server on port 5174.
 */
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const intro = fs.readFileSync(path.join(root, 'src/modules/intro.js'), 'utf8');
const sourceStage = fs.readFileSync(path.join(root, 'src/gl/zeroMirrorStage.js'), 'utf8');
const start = main.indexOf('  const preload = createPreloader({');
const end = main.indexOf('  entryGate = createEntryGate({', start);
if (start < 0 || end < 0) throw new Error('Preparation block markers changed');
const preparation = main.slice(start, end);
const warmStart = intro.indexOf('    async warm(onProgress');
const warmEnd = intro.indexOf('\n    get wallRaw()', warmStart);
if (warmStart < 0 || warmEnd < 0) throw new Error('Warm method markers changed');
const warmMember = intro.slice(warmStart, warmEnd);
const sourceWarmStart = sourceStage.indexOf('  let warmPromise = null;');
const sourceWarmEnd = sourceStage.indexOf('\n  const api = {', sourceWarmStart);
if (sourceWarmStart < 0 || sourceWarmEnd < 0) throw new Error('Source warm markers changed');
const sourceWarm = sourceStage.slice(sourceWarmStart, sourceWarmEnd);
const base = process.env.SITE_URL || 'http://127.0.0.1:5174/';
const cases = ['normal', 'missing-camera', 'missing-atlas', 'warm-failure', 'slow-camera', 'slow-atlas'];

function htmlFor(mode) {
  return `<!doctype html><html><body style="height:5000px"><script type="module">
    import { createPreloader } from '/src/modules/preloader.js';
    import { observeAssetReadiness, prepareUpcomingAssets } from '/src/modules/assetReadiness.js';
    const checks = window.__preparationChecks = { events: [], mode: ${JSON.stringify(mode)}, startedAt: performance.now() };
    const lenis = {
      stopped: false,
      stop() { this.stopped = true; checks.events.push('stop'); },
      start() { this.stopped = false; checks.events.push('start'); },
    };
    const startupAssets = observeAssetReadiness();
    let liveIntro;
    const onIntroProgress = () => {};
    function createIntro() {
      return {
        assetsReady: Promise.resolve(),
        async warmSource() {
          checks.events.push('warmSource');
          if (checks.mode === 'warm-failure') throw new Error('injected shader failure');
        },
        async warm(report, budget, shouldContinue) {
          if (shouldContinue()) { checks.events.push('warm'); report(1); }
        },
      };
    }
    ${preparation}
    checks.snapshot = () => ({
      ...window.__buildantaPreparation.state,
      stopped: lenis.stopped,
      overlay: Boolean(document.querySelector('.preload')),
      phase: document.querySelector('.preload__phase')?.textContent,
      percent: document.querySelector('.preload__pct')?.textContent,
      elapsedMs: Math.round(performance.now() - checks.startedAt),
      events: [...checks.events],
      scrollY,
    });
    checks.testWarmCancellation = async () => {
      const calls = [];
      const restorations = [];
      const lastRaw = 0.62;
      const applyRaw = (value) => restorations.push(value);
      const corridor = { setProgress: (p) => calls.push(['corridor', p]), render() {} };
      const orbHero = { ok: true, setActProgress: (p) => calls.push(['orb', p]), setCoreFlash() {}, render() {} };
      const consultHand = { setProgress: (p) => calls.push(['hand', p]), render() {} };
      const projector = null, USE_ZERO_MIRROR = true, reduced = false;
      const warm = ({ ${warmMember} }).warm;
      const realRAF = window.requestAnimationFrame;
      let nextFrame, continuing = true;
      window.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
      try {
        const pending = warm(() => {}, 2600, () => continuing);
        const before = calls.length;
        continuing = false;
        nextFrame(performance.now());
        await pending;
        return { callsAfterCancellation: calls.slice(before), restorations };
      } finally { window.requestAnimationFrame = realRAF; }
    };
    checks.testSourceWarmRestoration = async () => {
      const objects = Array.from({ length: 6 }, (_, index) => ({ visible: index % 2 === 0 }));
      const sceneFor = (object) => ({ traverse: (visit) => visit(object) });
      const [scene, backgroundScene, foregroundScene, lensScene, lensCompositeScene, compositeScene] = objects.map(sceneFor);
      const camera = {}, backgroundCamera = {};
      const lensDownMaterial = {}, lensUpMaterial = {}, originalMaterial = {};
      const lensQuad = { material: originalMaterial };
      const api = { ready: Promise.resolve() }, ownedTextures = new Set([{}, {}]);
      const disposed = false;
      const before = objects.map((object) => object.visible);
      let compiled = 0, uploaded = 0;
      const violations = [];
      const renderer = {
        initTexture() { uploaded++; },
        compileAsync() {
          compiled++;
          return Promise.resolve().then(() => {
            if (objects.some((object, index) => object.visible !== before[index])) violations.push('Visibility leaked across await');
            if (lensQuad.material !== originalMaterial) violations.push('Lens material leaked across await');
          });
        },
      };
      ${sourceWarm}
      await warm();
      return { compiled, uploaded, violations };
    };
  </script></body></html>`;
}

async function checkCase(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  const errors = [], requests = [];
  const held = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/__preparation-verification__') {
      return route.fulfill({ contentType: 'text/html', body: htmlFor(mode) });
    }
    const asset = /market-camera\.glb$/.test(url.pathname) ? 'camera'
      : /leather-money-shreds\.ktx2$/.test(url.pathname) ? 'atlas' : null;
    if (!asset || request.resourceType() === 'script') return route.continue();
    requests.push(asset);
    if (mode === `missing-${asset}`) return route.fulfill({ status: 404, body: 'missing' });
    if (mode === `slow-${asset}`) { held.push(route); return; }
    return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(32) });
  });
  try {
    await page.goto(new URL('/__preparation-verification__', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__preparationChecks?.snapshot, null, { timeout: 15000 });
    const initial = await page.evaluate(() => window.__preparationChecks.snapshot());
    await page.waitForFunction(() => window.__buildantaPreparation?.state.revealed, null, { timeout: 15000 });
    const revealed = await page.evaluate(() => window.__preparationChecks.snapshot());
    await page.waitForFunction(() => !document.querySelector('.preload'), null, { timeout: 2000 });
    const finished = await page.evaluate(() => window.__preparationChecks.snapshot());
    const failures = [];
    if (!initial.stopped) failures.push('Lenis was not stopped during preparation');
    if (finished.stopped) failures.push('Lenis remained stopped after reveal');
    if (mode === 'normal') {
      if (revealed.reason !== 'ready' || revealed.progress !== 1) failures.push('Normal readiness did not complete');
      const cancellation = await page.evaluate(() => window.__preparationChecks.testWarmCancellation());
      if (cancellation.callsAfterCancellation.length) failures.push('Warm cancellation rewound scenes after reveal');
      if (cancellation.restorations.some((value) => value !== 0.62)) failures.push('Warm cancellation restored the wrong scroll frame');
      finished.cancellation = cancellation;
      finished.sourceWarm = await page.evaluate(() => window.__preparationChecks.testSourceWarmRestoration());
      if (finished.sourceWarm.compiled !== 7 || finished.sourceWarm.uploaded !== 2 || finished.sourceWarm.violations.length) {
        failures.push('Source warm changed temporary rendering state across an await');
      }
    } else if (mode.startsWith('slow-')) {
      if (revealed.reason !== 'timeout' || revealed.progress >= 1) failures.push('Timeout displayed full readiness');
      const prior = await page.evaluate(() => { scrollTo(0, 800); return window.__preparationChecks.snapshot(); });
      for (const route of held) await route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(32) });
      await page.waitForTimeout(500);
      const late = await page.evaluate(() => window.__preparationChecks.snapshot());
      if (late.events.includes('warmSource') || late.events.includes('warm')) failures.push('Late assets started a visible warm sweep');
      if (late.scrollY !== prior.scrollY) failures.push('Late assets rewound the page');
      finished.late = late;
    } else if (revealed.reason === 'ready' || revealed.progress >= 1 || revealed.percent === '100') {
      failures.push('Failed preparation displayed 100/Ready');
    }
    if (errors.length) failures.push(...errors);
    return { mode, requests, initial, revealed, finished, failures };
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--disable-gpu'] });
  try {
    const results = [];
    for (let index = 0; index < cases.length; index += 2) {
      results.push(...await Promise.all(cases.slice(index, index + 2).map((mode) => checkCase(browser, mode))));
    }
    console.log(JSON.stringify({ scope: 'actual-loader-code-with-scene-stubs-no-WebGL', results }, null, 2));
    if (results.some((result) => result.failures.length)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
