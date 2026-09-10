/* Compare the untouched original (5173) with the optimized copy (5174).
 * --baseline records only the original; --compare consumes that saved baseline.
 * The original tree is always read-only. All evidence belongs to this copy.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { decode } = require('./png.cjs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const COPY = path.resolve(__dirname, '..');
const ORIGINAL = path.resolve(COPY, '../buildanta-site');
const OUT = path.join(COPY, 'shots-zero-stage', 'quality-optimized');
const ORIGINAL_URL = process.env.ORIGINAL_URL || 'http://127.0.0.1:5173/';
const COPY_URL = process.env.OPTIMIZED_URL || 'http://127.0.0.1:5174/';
const BASELINE_ONLY = process.argv.includes('--baseline');
const REPORT_ONLY = process.argv.includes('--report-only');
const RESUME = process.argv.includes('--resume') || REPORT_ONLY;
const STOPS = [{ name: 'coins', kind: 'zero', progress: .3 },
  { name: 'hands', kind: 'zero', progress: .9 },
  { name: 'bill', kind: 'bill', progress: .5 }];
const CONFIGS = [{ name: 'desktop', width: 1200, height: 700, dpr: 1 },
  { name: 'phone', width: 390, height: 844, dpr: 2 }];
const save = (name, value) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function assetManifest(root) {
  const manifest = {};
  const visit = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:avif|webp|png|jpe?g|gif|svg|ico|ktx2?|basis|glb|gltf|bin|fbx|obj|hdr|exr|mp3|mp4|webm|ogg|wav|woff2?|ttf|otf|wasm|glsl|vert|frag)$/i.test(entry.name)) {
        const bytes = fs.readFileSync(file);
        manifest[path.relative(root, file).replaceAll('\\', '/')] = { bytes: bytes.length, sha256: sha(bytes) };
      }
    }
  };
  visit(path.join(root, 'public'));
  visit(path.join(root, 'src'));
  return manifest;
}

function timingContract(root) {
  const intro = fs.readFileSync(path.join(root, 'src/modules/intro.js'), 'utf8');
  const start = intro.indexOf('  const baseScrollLength');
  const end = intro.indexOf('  let zeroStageLocal', start);
  assert.ok(start >= 0 && end > start, 'scroll pacing block must remain discoverable');
  return {
    scrollPacingSha256: sha(intro.slice(start, end).replaceAll('\r\n', '\n')),
    configSha256: sha(fs.readFileSync(path.join(root, 'src/config.js'))),
    billWrapperSha256: sha(fs.readFileSync(path.join(root, 'src/modules/mirrBillBurn.js'))),
  };
}

function instrument() {
  const nativeRandom = Math.random;
  const streams = new Map();
  // Independent seeded streams per caller file/function survive the removal
  // of unrelated allocations. Three UUIDs remain unique within their stream.
  Math.random = () => {
    const caller = new Error().stack.split('\n')[2] || 'fallback';
    const key = caller.replace(/https?:\/\/[^/]+/g, '').replace(/:\d+:\d+/g, '').trim();
    let value = streams.get(key);
    if (value === undefined) {
      value = 2166136261;
      for (let index = 0; index < key.length; index++) value = Math.imul(value ^ key.charCodeAt(index), 16777619) >>> 0;
    }
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    streams.set(key, value);
    return value / 4294967296;
  };
  window.__quality = { contexts: [], pinShaderTime: false, nativeRandom };
  const records = new WeakMap();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const gl = getContext.call(this, type, ...args);
    if (!gl || !/^webgl2?$|^experimental-webgl$/.test(type) || records.has(gl)) return gl;
    const record = { canvas: this, type, programsCreated: 0, programsDeleted: 0, shadersCompiled: 0,
      contextLost: false, attributes: gl.getContextAttributes() };
    records.set(gl, record);
    window.__quality.contexts.push(record);
    this.addEventListener('webglcontextlost', () => { record.contextLost = true; });
    for (const [method, counter] of [['createProgram', 'programsCreated'], ['deleteProgram', 'programsDeleted'], ['compileShader', 'shadersCompiled']]) {
      const original = gl[method];
      gl[method] = function(...values) { record[counter]++; return original.apply(this, values); };
    }
    const locations = new WeakMap();
    const getUniformLocation = gl.getUniformLocation;
    gl.getUniformLocation = function(program, name) {
      const location = getUniformLocation.call(this, program, name);
      if (location) locations.set(location, name);
      return location;
    };
    const uniform1f = gl.uniform1f;
    gl.uniform1f = function(location, value) {
      // The authored bill clock already derives from progress and is preserved.
      if (window.__quality.pinShaderTime && /^(?:[ui]_?)?time$/i.test(locations.get(location) || '')
        && !this.canvas.classList.contains('intro__burning-franklin')) value = 300;
      return uniform1f.call(this, location, value);
    };
    return gl;
  };
}

async function observe(page) {
  return page.evaluate(() => {
    const source = window.__zeroMirrorStageBridge;
    const { intro } = window.__buildanta;
    const contexts = window.__quality.contexts.map(({ canvas, ...record }) => ({
      ...record, canvas: canvas.className || canvas.id || '(unnamed)',
      width: canvas.width, height: canvas.height,
    }));
    const meshes = [];
    source.scene.traverse(mesh => {
      if (!mesh.isMesh || !/ZeroStageCoin|GreenHand|HumanHand/.test(mesh.name)) return;
      meshes.push({ name: mesh.name, visible: mesh.visible, position: mesh.position.toArray(),
        quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
        vertices: mesh.geometry.attributes.position?.count ?? 0,
        indices: mesh.geometry.index?.count ?? 0 });
    });
    const sourceCanvas = document.querySelector('.consult-zero__hand-canvas');
    const sourceRect = sourceCanvas.getBoundingClientRect();
    return {
      time: performance.now(), contexts,
      contextCount: contexts.length,
      programsCreated: contexts.reduce((sum, context) => sum + context.programsCreated, 0),
      programsLive: contexts.reduce((sum, context) => sum + context.programsCreated - context.programsDeleted, 0),
      source: { progress: source.state.progress, opacity: source.state.opacity,
        ready: source.state.ready, bridgeReady: source.state.bridgeReady,
        time: source.state.time, pointerX: source.state.pointerX, pointerY: source.state.pointerY,
        loadErrors: source.state.loadErrors, fistBump: source.state.fistBump,
        camera: { position: source.camera.position.toArray(), quaternion: source.camera.quaternion.toArray(),
          aspect: source.camera.aspect, fov: source.camera.fov }, meshes,
        canvas: { width: sourceCanvas.width, height: sourceCanvas.height,
          cssWidth: sourceRect.width, cssHeight: sourceRect.height } },
      bill: intro.billTransition,
      portal: window.__bhp?.state?.() ?? null,
      scroll: { total: intro.st.end - intro.st.start, stopped: window.__buildanta.lenis.isStopped,
        zero: [0, .3, .9, 1].map(progress => intro.rawForZeroStage(progress) * (intro.st.end - intro.st.start)),
        bill: [0, .03, .166, .5, 1].map(progress => intro.rawForBillTransition(progress) * (intro.st.end - intro.st.start)),
        timeline: [0, .24, .425, .628, .684, .768, .945, 1].map(progress => intro.rawForP(progress) * (intro.st.end - intro.st.start)) },
      resourceTiming: performance.getEntriesByType('resource').map(entry => ({
        url: entry.name.replace(location.origin, ''), initiatorType: entry.initiatorType,
        duration: entry.duration, transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
      })),
    };
  });
}

async function seek(page, stop) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(async ({ progress, kind }) => {
      const { intro, lenis } = window.__buildanta;
      const raw = kind === 'bill' ? intro.rawForBillTransition(progress) : intro.rawForZeroStage(progress);
      lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, stop);
    try {
      await page.waitForFunction(({ progress, kind }) => {
        const intro = window.__buildanta.intro;
        const observed = kind === 'bill' ? intro.billTransition.scene : window.__zeroMirrorStageBridge.state;
        return observed?.ready && Math.abs(observed.progress - progress) < .0025 && !document.querySelector('.preload');
      }, stop, { timeout: 15000 });
      await page.waitForTimeout(300);
      return;
    } catch (error) { if (attempt === 2) throw error; }
  }
}

async function capture(browser, mode, url, config, options = {}) {
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.dpr, isMobile: config.name === 'phone', hasTouch: config.name === 'phone' });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const run = { config, url, requests: [], failedRequests: [], errors: [], stages: [] };
  const serverOrigin = new URL(url).origin;
  page.on('request', request => run.requests.push({ url: request.url().replace(serverOrigin, ''), type: request.resourceType() }));
  page.on('requestfailed', request => run.failedRequests.push({ url: request.url().replace(serverOrigin, ''), error: request.failure()?.errorText }));
  page.on('pageerror', error => run.errors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready
      && !document.querySelector('.preload'), null, { timeout: 90000 });
    await page.waitForTimeout(350);
    run.boot = await observe(page);
    run.bootRequestCount = run.requests.length;
    await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important;opacity:0!important}' });
    await page.evaluate(() => { window.__bbPinTime = 300000; window.__quality.pinShaderTime = true; });
    await page.mouse.move(config.width / 2, config.height / 2);
    for (const stop of options.stops || STOPS) {
      await seek(page, stop);
      if (options.pinPortal && stop.kind === 'bill') {
        await page.waitForFunction(() => window.__bhp?.ready && window.__bhp.renderAt, null, { timeout: 30000 });
        await page.evaluate(() => {
          const portal = window.__bhp;
          portal.pause();
          portal.renderAt(0, { mx: innerWidth / 2, my: innerHeight / 2, collapse: 0, flash: 0, arm: 0 });
          // Its approved portal also eases mass on the CPU. Let that existing
          // diagnostic stepper settle before freezing the clock and pointer.
          portal.step(1200);
          portal.pause();
          portal.renderAt(300000, { mx: innerWidth / 2, my: innerHeight / 2, collapse: 0, flash: 0, arm: 0 });
        });
      }
      const state = await observe(page);
      const prefix = `${mode}-${config.name}-${stop.name}`;
      const full = path.join(OUT, `${prefix}-page.png`);
      await page.screenshot({ path: full, scale: 'css', animations: 'disabled' });
      const selector = stop.kind === 'bill' ? '.intro__burning-franklin' : '.consult-zero__hand-canvas';
      const isolation = await page.addStyleTag({ content: `body{background:#000!important}body *{visibility:hidden!important}${selector}{visibility:visible!important}` });
      const canvas = path.join(OUT, `${prefix}-canvas.png`);
      await page.screenshot({ path: canvas, scale: 'css', animations: 'disabled' });
      await isolation.evaluate(element => element.remove());
      run.stages.push({ ...stop, state, full, canvas });
      save(`${mode}-${config.name}.json`, run);
      console.log(`[quality] ${mode} ${config.name} ${stop.name}: ${state.contextCount} contexts, ${state.programsLive} live programs`);
    }
    run.final = await observe(page);
    save(`${mode}-${config.name}.json`, run);
    return run;
  } finally { await context.close(); }
}

function difference(beforeFile, afterFile) {
  const before = decode(fs.readFileSync(beforeFile)), after = decode(fs.readFileSync(afterFile));
  assert.equal(before.w, after.w); assert.equal(before.h, after.h);
  let changed = 0, nonzero = 0, total = 0, max = 0;
  for (let pixel = 0; pixel < before.w * before.h; pixel++) {
    let pixelMax = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(before.data[pixel * before.bpp + channel] - after.data[pixel * after.bpp + channel]);
      total += delta; pixelMax = Math.max(pixelMax, delta); max = Math.max(max, delta);
    }
    if (pixelMax > 10) changed++;
    if (pixelMax > 0) nonzero++;
  }
  return { exact: nonzero === 0, nonzeroPixels: nonzero,
    changedOver10Percent: 100 * changed / (before.w * before.h), meanChannelDelta: total / (before.w * before.h * 3), maxChannelDelta: max };
}

function compareRuns(before, after) {
  const failures = [];
  const check = (name, pass, details) => { if (!pass) failures.push({ name, details }); };
  const stages = before.stages.map((original, index) => {
    const optimized = after.stages[index];
    const canvasDifference = difference(original.canvas, optimized.canvas);
    const pageDifference = difference(original.full, optimized.full);
    check(`${original.name}: source canvas resolution preserved`, JSON.stringify(original.state.source.canvas) === JSON.stringify(optimized.state.source.canvas));
    check(`${original.name}: scroll mapping preserved`, JSON.stringify(original.state.scroll) === JSON.stringify(optimized.state.scroll));
    check(`${original.name}: source camera and mesh geometry preserved`,
      JSON.stringify(original.state.source.camera) === JSON.stringify(optimized.state.source.camera)
      && JSON.stringify(original.state.source.meshes) === JSON.stringify(optimized.state.source.meshes));
    if (original.kind === 'bill') check('bill: exact deterministic pose and uniforms preserved',
      JSON.stringify(original.state.bill.scene) === JSON.stringify(optimized.state.bill.scene));
    check(`${original.name}: isolated rendered pixels preserved`, canvasDifference.changedOver10Percent <= .05 && canvasDifference.meanChannelDelta <= .1, canvasDifference);
    check(`${original.name}: source assets ready without errors`, optimized.state.source.ready && !optimized.state.source.loadErrors?.length);
    return { name: original.name, canvasDifference, pageDifference };
  });
  const legacyRequests = after.requests.filter(request => request.type !== 'script'
    && /(?:\/assets\/consult-(?:plant-atlas-v3|ecology-atlas-v1|hand-v2|paper-bird-v1)\.png|\/burning-franklin\/)/i.test(request.url));
  // meet-fistbump.glb remains required by zeroMirrorStage's approved fist pose.
  check('unused legacy textures are not requested', legacyRequests.length === 0, legacyRequests);
  check('no page errors', after.errors.length === 0, after.errors);
  check('no lost WebGL contexts', after.final.contexts.every(context => !context.contextLost));
  const removedLegacyImages = before.requests.filter(request => request.type !== 'script'
    && /(?:\/assets\/consult-(?:plant-atlas-v3|ecology-atlas-v1|hand-v2|paper-bird-v1)\.png|\/burning-franklin\/)/i.test(request.url))
    .map(request => ({ url: request.url, encodedBodySize: before.final.resourceTiming.find(entry => entry.url === request.url)?.encodedBodySize ?? null }));
  return { config: after.config, stages, failures, legacyRequests,
    removedLegacyImages,
    removedLegacyImageBytes: removedLegacyImages.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
    boot: { original: { contexts: before.boot.contextCount, programs: before.boot.programsLive, requests: before.bootRequestCount },
      optimized: { contexts: after.boot.contextCount, programs: after.boot.programsLive, requests: after.bootRequestCount } },
    final: { original: { contexts: before.final.contextCount, programs: before.final.programsLive, requests: before.requests.length },
      optimized: { contexts: after.final.contextCount, programs: after.final.programsLive, requests: after.requests.length } } };
}

async function verifyLoader(browser, delayAsset = false) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  await context.addInitScript(() => {
    window.__qualityLoaderSamples = [];
    let previous = '';
    new MutationObserver(() => {
      const loader = document.querySelector('.preload');
      if (!loader) return;
      const phase = loader.querySelector('.preload__phase')?.textContent;
      const percent = Number(loader.querySelector('.preload__pct')?.textContent);
      const leaving = loader.classList.contains('preload--gone');
      const signature = `${phase}|${percent}|${leaving}`;
      if (signature === previous) return;
      previous = signature;
      window.__qualityLoaderSamples.push({ time: performance.now(), phase, percent, leaving,
        preparation: window.__buildantaPreparation?.state ?? null });
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const page = await context.newPage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let heldRequests = 0;
  if (delayAsset) await page.route('**/src/assets/zero-stage/fancy_hand_2.glb', async route => {
    heldRequests++;
    await gate;
    try { await route.continue(); } catch { /* context teardown cancels this diagnostic request */ }
  });
  try {
    await page.goto(COPY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__buildantaPreparation?.state.revealed
      && !document.querySelector('.preload'), null, { timeout: 60000 });
    const result = await page.evaluate(() => ({ samples: window.__qualityLoaderSamples,
      final: window.__buildantaPreparation.state, scrollStopped: window.__buildanta.lenis.isStopped }));
    result.delayedAsset = delayAsset;
    result.heldRequests = heldRequests;
    result.assertions = [
      { name: 'loader reports actual asset phase', pass: result.samples.some(sample => sample.phase === 'Loading scene assets') },
      { name: 'progress stays monotonic and within bounds', pass: result.samples.every((sample, index) => sample.percent >= 0 && sample.percent <= 100
        && (!index || sample.percent >= result.samples[index - 1].percent)) },
      { name: 'scroll becomes available after reveal', pass: result.scrollStopped === false },
      { name: 'ready is shown only after pending tracked assets complete', pass: result.samples.filter(sample => sample.phase === 'Ready')
        .every(sample => sample.percent === 100 && sample.preparation?.pending === 0) },
    ];
    if (delayAsset) {
      result.assertions.push({ name: 'held asset uses honest bounded timeout', pass: heldRequests > 0 && result.final.reason === 'timeout'
        && result.samples.some(sample => sample.phase === 'Finishing in the background')
        && !result.samples.some(sample => sample.phase === 'Ready') });
    } else {
      result.assertions.push({ name: 'successful readiness includes shader preparation', pass: result.final.reason === 'timeout'
        || result.samples.some(sample => sample.phase === 'Preparing animation shaders') });
    }
    return result;
  } finally { release(); await context.close(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = REPORT_ONLY ? null : await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader'] });
  if (process.argv.includes('--portal-only')) {
    try {
      const runs = [];
      for (const config of CONFIGS) {
        const before = await capture(browser, 'portal-original', ORIGINAL_URL, config, { stops: [STOPS[2]], pinPortal: true });
        const after = await capture(browser, 'portal-optimized', COPY_URL, config, { stops: [STOPS[2]], pinPortal: true });
        const pageDifference = difference(before.stages[0].full, after.stages[0].full);
        const canvasDifference = difference(before.stages[0].canvas, after.stages[0].canvas);
        runs.push({ config, pageDifference, canvasDifference,
          originalPortal: before.stages[0].state.portal, optimizedPortal: after.stages[0].state.portal,
          originalCapture: before.stages[0].full, optimizedCapture: after.stages[0].full });
        save('portal-report.json', { complete: false, runs });
      }
      const result = runs.every(run => run.pageDifference.exact && run.canvasDifference.exact) ? 'passed' : 'failed';
      save('portal-report.json', { complete: true, result, captureContract: 'Existing __bhp pause/step/renderAt diagnostics: settled mass, centered pointer, 300-second clock.', runs });
      console.log(JSON.stringify({ result, report: path.join(OUT, 'portal-report.json'), runs }, null, 2));
      if (result !== 'passed') process.exitCode = 1;
    } finally { await browser.close(); }
    return;
  }
  if (process.argv.includes('--loader-only')) {
    try {
      const runs = [await verifyLoader(browser), await verifyLoader(browser, true)];
      const result = runs.some(run => run.assertions.some(check => !check.pass)) ? 'failed' : 'passed';
      save('loader-report.json', { result, runs });
      console.log(JSON.stringify({ result, report: path.join(OUT, 'loader-report.json'), runs }, null, 2));
      if (result !== 'passed') process.exitCode = 1;
    } finally { await browser.close(); }
    return;
  }
  const mode = BASELINE_ONLY ? 'original' : 'optimized';
  const report = { mode, generatedAt: new Date().toISOString(), renderer: 'Chrome ANGLE SwiftShader; no general FPS claim',
    captureContract: 'Identical viewport/DPR, independent seeded random streams, pointer centered, source __bbPinTime=300000, non-bill shader time uniforms=300; full page diagnostics and isolated original canvases.', runs: [] };
  try {
    if (BASELINE_ONLY) {
      save('original-assets.json', assetManifest(ORIGINAL));
      save('original-timing.json', timingContract(ORIGINAL));
    }
    for (const config of CONFIGS) {
      const savedFile = path.join(OUT, `${mode}-${config.name}.json`);
      const saved = RESUME && fs.existsSync(savedFile) ? JSON.parse(fs.readFileSync(savedFile, 'utf8')) : null;
      if (REPORT_ONLY) assert.ok(saved?.final && saved.stages.length === STOPS.length, 'report-only requires completed captures');
      const run = saved?.final && saved.stages.length === STOPS.length ? saved
        : await capture(browser, mode, BASELINE_ONLY ? ORIGINAL_URL : COPY_URL, config);
      report.runs.push(BASELINE_ONLY ? run : compareRuns(JSON.parse(fs.readFileSync(path.join(OUT, `original-${config.name}.json`), 'utf8')), run));
      save(`${mode}-report.json`, report);
    }
    if (!BASELINE_ONLY) {
      const originals = JSON.parse(fs.readFileSync(path.join(OUT, 'original-assets.json'), 'utf8'));
      const optimized = assetManifest(COPY);
      const originalTiming = JSON.parse(fs.readFileSync(path.join(OUT, 'original-timing.json'), 'utf8'));
      const optimizedTiming = timingContract(COPY);
      report.assets = { count: Object.keys(originals).length,
        bytes: Object.values(originals).reduce((sum, file) => sum + file.bytes, 0),
        changes: Object.keys(originals).filter(file => JSON.stringify(originals[file]) !== JSON.stringify(optimized[file])),
        added: Object.keys(optimized).filter(file => !originals[file]) };
      report.timing = { original: originalTiming, optimized: optimizedTiming,
        exact: JSON.stringify(originalTiming) === JSON.stringify(optimizedTiming) };
      const portalReport = path.join(OUT, 'portal-report.json');
      if (fs.existsSync(portalReport)) {
        const portal = JSON.parse(fs.readFileSync(portalReport, 'utf8'));
        report.pinnedPortal = { result: portal.result, report: portalReport,
          note: 'The earlier full-page bill diagnostics contain autonomous portal drift. This separate pair pins the existing portal clock, pointer, and settled mass.',
          comparisons: portal.runs.map(run => ({ device: run.config.name, pageDifference: run.pageDifference })) };
      }
      const loaderReport = path.join(OUT, 'loader-report.json');
      if (fs.existsSync(loaderReport)) {
        const loader = JSON.parse(fs.readFileSync(loaderReport, 'utf8'));
        report.loader = { result: loader.result, report: loaderReport };
      }
      report.result = report.assets.changes.length || !report.timing.exact || report.runs.some(run => run.failures.length) ? 'failed' : 'passed';
      if (report.pinnedPortal?.result === 'failed' || report.loader?.result === 'failed') report.result = 'failed';
      save('optimized-assets.json', optimized);
      save('optimized-report.json', report);
      console.log(JSON.stringify({ result: report.result, assets: report.assets, timing: report.timing, runs: report.runs }, null, 2));
      if (report.result !== 'passed') process.exitCode = 1;
    } else console.log(`[quality] Original baseline complete: ${path.join(OUT, 'original-report.json')}`);
  } finally { await browser?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
