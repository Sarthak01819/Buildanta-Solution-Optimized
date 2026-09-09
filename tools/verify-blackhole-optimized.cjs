/* Bounded iris + actual Gargantua/Endurance verification.
 * Original 5173 is immutable. Only this optimized copy receives artifacts.
 * --baseline records original; the default compares optimized 5174 afterward.
 * Test-only HTTP response exports expose existing rendering functions at exact
 * clocks. Production files, shaders, dimensions, and quality remain untouched.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { decode } = require('./png.cjs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'))); }
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const ROOT = path.resolve(__dirname, '..');
const ORIGINAL = path.resolve(ROOT, '../buildanta-site');
const OUT = path.join(ROOT, 'shots-zero-stage/blackhole-optimized');
const BASELINE = process.argv.includes('--baseline');
const MODE = BASELINE ? 'before' : 'after';
const IRIS_ONLY = process.argv.includes('--iris-only');
const SITE = process.env.SITE_URL || (BASELINE ? 'http://127.0.0.1:5173/' : 'http://127.0.0.1:5174/');
const VIEWPORT = { width: 1200, height: 700 };
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

function manifest(root) {
  const files = {};
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:glsl|glb|ktx2|png|webp)$/i.test(file)) files[path.relative(root, file).replaceAll('\\', '/')] = sha(fs.readFileSync(file));
    }
  };
  for (const dir of ['src/gl/blackhole/shaders', 'src/assets/zero-stage', 'public/assets/endurance']) visit(path.join(root, dir));
  files['src/gl/blackhole/config.js'] = sha(fs.readFileSync(path.join(root, 'src/gl/blackhole/config.js')));
  const ship = fs.readFileSync(path.join(root, 'src/gl/endurance/ship.js'), 'utf8');
  files['ship-motion-constants'] = sha(ship.slice(ship.indexOf('const OMEGA'), ship.indexOf('export function createShip')).replaceAll('\r\n', '\n'));
  return files;
}

function instrument() {
  const streams = new Map();
  Math.random = () => {
    const key = (new Error().stack.split('\n')[2] || 'fallback').replace(/https?:\/\/[^/]+/g, '').replace(/:\d+:\d+/g, '').trim();
    let value = streams.get(key);
    if (value === undefined) {
      value = 2166136261;
      for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619) >>> 0;
    }
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    streams.set(key, value);
    return value / 4294967296;
  };
  window.__bhProbe = { contexts: [], pinUniformTime: false };
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const pausedCallbacks = new Map();
  let freezeRaf = false;
  window.requestAnimationFrame = callback => {
    const id = nativeRaf(time => {
      if (freezeRaf) { pausedCallbacks.set(id, callback); return; }
      callback(time);
    });
    return id;
  };
  const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
  window.cancelAnimationFrame = id => { pausedCallbacks.delete(id); nativeCancelRaf(id); };
  window.__bhProbe.freezeRaf = () => { freezeRaf = true; };
  window.__bhProbe.resumeRaf = () => {
    freezeRaf = false;
    const callbacks = [...pausedCallbacks.values()];
    pausedCallbacks.clear();
    callbacks.forEach(callback => window.requestAnimationFrame(callback));
  };
  const seen = new WeakSet();
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const gl = original.call(this, type, ...args);
    if (!gl || !/^webgl2?$|^experimental-webgl$/.test(type) || seen.has(gl)) return gl;
    seen.add(gl);
    const record = { canvas: this, id: window.__bhProbe.contexts.length,
      draws: 0, presents: 0, uniformLookups: 0, uniforms: 0, textureBinds: 0,
      uniform1fCalls: 0, uniform1iCalls: 0, uniform2fCalls: 0, uniform3fvCalls: 0, uniformMatrix4fvCalls: 0,
      framebufferBinds: 0, programUses: 0, attributePointers: 0, lastUniforms: {}, boundFramebuffer: null };
    window.__bhProbe.contexts.push(record);
    const uniformNames = new WeakMap();
    for (const [method, counter] of [['getUniformLocation', 'uniformLookups'], ['bindTexture', 'textureBinds'],
      ['bindFramebuffer', 'framebufferBinds'], ['useProgram', 'programUses'], ['vertexAttribPointer', 'attributePointers'],
      ['drawArrays', 'draws'], ['drawElements', 'draws'], ['drawArraysInstanced', 'draws'], ['drawElementsInstanced', 'draws']]) {
      if (typeof gl[method] !== 'function') continue;
      const fn = gl[method];
      gl[method] = function(...values) {
        record[counter]++;
        if (method === 'bindFramebuffer') record.boundFramebuffer = values[1];
        if (method.startsWith('draw') && record.boundFramebuffer === null) record.presents++;
        const result = fn.apply(this, values);
        if (method === 'getUniformLocation' && result) uniformNames.set(result, values[1]);
        return result;
      };
    }
    for (const method of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3fv', 'uniformMatrix4fv']) {
      const fn = gl[method];
      gl[method] = function(location, ...values) {
        record.uniforms++;
        record[`${method}Calls`]++;
        const name = uniformNames.get(location) || '';
        if (method === 'uniform1f' && window.__bhProbe.pinUniformTime && /^(?:[ui]_?)?time$/i.test(name)) values[0] = 300;
        if (/^(?:uTime|uSteps|uRes|uCamDist|uFovY|uDiskGain|uBloomStrength|uExposure)$/.test(name)) record.lastUniforms[name] = values;
        return fn.call(this, location, ...values);
      };
    }
    return gl;
  };
}

async function fixtures(page) {
  await page.route('**/src/gl/blackhole/BlackholeGateBeat.js*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    const anchor = 'let progress = 0;';
    assert.ok(body.includes(anchor), 'beat fixture anchor retained');
    body = body.replace(anchor, `${anchor}\nwindow.__bhProbe.renderBeatAt = (p, seconds) => engine.render(stateAt(p, seconds));`);
    await route.fulfill({ response, body });
  });
  await page.route('**/src/gl/endurance/ship.js*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    const pattern = /return\s*\{\s*canvas,\s*load,/;
    assert.ok(pattern.test(body), 'ship fixture API anchor retained');
    body = body.replace(pattern, `return window.__bhProbe.ship = {\ncanvas, load,\nrenderAt(seconds) { t = seconds; spin = OMEGA * seconds; hoverEased = 0; cursor.has = false; this.tick(0); },`);
    await route.fulfill({ response, body });
  });
}

async function state(page) {
  return page.evaluate(() => {
    const getContext = record => {
      const canvas = record.canvas;
      const { canvas: unused, boundFramebuffer: ignored, ...counts } = record;
      const rect = canvas.getBoundingClientRect();
      return { ...counts, role: canvas.className || canvas.id || canvas.parentElement?.className || '(unnamed)',
        width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height,
        opacity: getComputedStyle(canvas).opacity, display: getComputedStyle(canvas).display };
    };
    const intro = window.__buildanta.intro;
    return {
      raw: intro.st.progress, progress: intro.progress, source: {
        progress: window.__zeroMirrorStageBridge.state.progress, opacity: window.__zeroMirrorStageBridge.state.opacity,
        time: window.__zeroMirrorStageBridge.state.time, errors: window.__zeroMirrorStageBridge.state.loadErrors,
      }, contexts: window.__bhProbe.contexts.map(getContext),
      finale: window.__finale?.state(),
      controls: [...document.querySelectorAll('.finale-cta')].map(control => ({ text: control.textContent,
        visible: control.classList.contains('finale-cta--in'), rect: control.getBoundingClientRect().toJSON() })),
      iris: { clip: getComputedStyle(document.querySelector('.consult-zero')).clipPath },
      blackhole: { solid: document.querySelector('.intro__blackhole').classList.contains('solid'),
        opacity: getComputedStyle(document.querySelector('.intro__blackhole')).opacity },
    };
  });
}

const COUNTERS = ['draws', 'presents', 'uniformLookups', 'uniforms', 'uniform1fCalls', 'uniform1iCalls', 'uniform2fCalls', 'uniform3fvCalls', 'uniformMatrix4fvCalls', 'textureBinds', 'framebufferBinds', 'programUses', 'attributePointers'];
async function measure(page) {
  const before = await state(page);
  const elapsed = await page.evaluate(async () => {
    const start = performance.now();
    for (let frame = 0; frame < 2; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
    return performance.now() - start;
  });
  const after = await state(page);
  return { observerFrames: 2, wallTimeMs: elapsed, contexts: after.contexts.map(context => {
    const initial = before.contexts.find(entry => entry.id === context.id) || {};
    return { id: context.id, role: context.role, width: context.width, height: context.height,
      ...Object.fromEntries(COUNTERS.map(key => [key, context[key] - (initial[key] || 0)])) };
  }) };
}

async function seek(page, value, kind) {
  await page.evaluate(async ({ value, kind }) => {
    const { intro, lenis, gsap } = window.__buildanta;
    window.__bhProbe.resumeRaf();
    gsap.ticker.wake();
    const raw = kind === 'iris' ? intro.rawForP(value)
      : kind === 'bill' ? intro.rawForBillTransition(value)
        : intro.introRawEnd + value * (1 - intro.introRawEnd);
    lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { value, kind });
  await page.waitForTimeout(250);
}

function difference(aFile, bFile) {
  const a = decode(fs.readFileSync(aFile)), b = decode(fs.readFileSync(bFile));
  assert.equal(a.w, b.w); assert.equal(a.h, b.h);
  let changed = 0, over10 = 0, sum = 0;
  for (let pixel = 0; pixel < a.w * a.h; pixel++) {
    let max = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a.data[pixel * a.bpp + channel] - b.data[pixel * b.bpp + channel]);
      max = Math.max(max, delta); sum += delta;
    }
    if (max) changed++;
    if (max > 10) over10++;
  }
  return { exact: changed === 0, changedPixels: changed, changedOver10Percent: 100 * over10 / (a.w * a.h), meanChannelDelta: sum / (3 * a.w * a.h) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { mode: MODE, site: SITE, viewport: VIEWPORT, dpr: 1,
    scope: 'Original rendering lifecycle at 5173 versus optimized copy at 5174. Bounded iris comparison; settled Gargantua browser check limited by SwiftShader readiness timeout. No FPS claim.',
    samples: [], errors: [], fixtures: 'HTTP response diagnostics only; original beat stateAt/engine.render and original ship.tick at exact clock/rotation, with shared ticker paused for captures.' };
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await fixtures(page);
    await page.goto(SITE, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && !document.querySelector('.preload'), null, { timeout: 90000 });
    await page.waitForTimeout(350);
    await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important}' });
    await page.evaluate(() => { window.__bbPinTime = 300000; window.__bhProbe.pinUniformTime = true; });
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await seek(page, .758, 'iris');
    const irisWork = await measure(page);
    await page.evaluate(() => { window.__buildanta.gsap.ticker.sleep(); window.__bhProbe.freezeRaf(); });
    const irisCapture = path.join(OUT, `${MODE}-iris.png`);
    await page.screenshot({ path: irisCapture, scale: 'css', animations: 'disabled', timeout: 90000 });
    report.samples.push({ name: 'iris', work: irisWork, state: await state(page), capture: irisCapture });
    save(`${MODE}-report.json`, report);
    console.log(`[blackhole] ${MODE} iris captured`);

    if (!IRIS_ONLY) {
    await seek(page, 1, 'bill');
    await page.waitForFunction(() => document.querySelector('.intro__portalwrap').classList.contains('on'), null, { timeout: 30000 });
    await page.evaluate(() => dispatchEvent(new Event('bh:enter')));
    await page.waitForFunction(() => window.__finale?.state().ship?.ready
      && document.querySelector('.intro__blackhole').classList.contains('solid')
      && !window.__buildanta.lenis.isLocked, null, { timeout: 60000 });
    await page.waitForTimeout(700);
    for (const sample of [{ name: 'settled', progress: .58, clock: 41, shipClock: 5 }]) {
      await seek(page, sample.progress, 'beat');
      const work = await measure(page);
      await page.evaluate(({ progress, clock, shipClock }) => {
        window.__buildanta.gsap.ticker.sleep();
        window.__bhProbe.freezeRaf();
        window.__bhProbe.pinUniformTime = false;
        window.__bhProbe.renderBeatAt(progress, clock);
        window.__bhProbe.ship.renderAt(shipClock);
      }, sample);
      const capture = path.join(OUT, `${MODE}-${sample.name}.png`);
      await page.screenshot({ path: capture, scale: 'css', animations: 'disabled', timeout: 90000 });
      report.samples.push({ ...sample, work, state: await state(page), capture });
      save(`${MODE}-report.json`, report);
      console.log(`[blackhole] ${MODE} ${sample.name} captured`);
    }
    }
    if (IRIS_ONLY) report.limitations = ['Settled Gargantua/ship browser parity not established: the original interactive ride failed its 60-second ship-ready/unlocked wait under SwiftShader. Earlier incomplete emergence/presence files are excluded. This run intentionally tests only the saved original iris versus optimized iris.'];
    report.manifest = manifest(BASELINE ? ORIGINAL : ROOT);
    report.complete = true;
    if (!BASELINE) {
      const before = JSON.parse(fs.readFileSync(path.join(OUT, 'before-report.json'), 'utf8'));
      report.comparisons = report.samples.map((sample, index) => {
        const original = before.samples[index];
        const relevant = snapshot => snapshot.contexts.filter(context => /intro__blackhole|finale-ship|consult-zero__hand-canvas/.test(context.role))
          .map(({ role, width, height, cssWidth, cssHeight }) => ({ role, width, height, cssWidth, cssHeight }));
        return { name: sample.name, difference: difference(original.capture, sample.capture),
          dimensionsIdentical: JSON.stringify(relevant(original.state)) === JSON.stringify(relevant(sample.state)),
          beforeWork: original.work, afterWork: sample.work,
          beforeShip: original.state.finale?.ship, afterShip: sample.state.finale?.ship };
      });
      const originalManifest = before.manifest || manifest(ORIGINAL);
      report.assetChanges = Object.keys(originalManifest).filter(file => originalManifest[file] !== report.manifest[file]);
      report.assetManifestCount = Object.keys(originalManifest).length;
      report.result = report.errors.length || report.assetChanges.length || report.comparisons.some(sample => !sample.dimensionsIdentical
        || sample.difference.changedOver10Percent > .05 || sample.difference.meanChannelDelta > .1) ? 'failed' : 'passed';
    }
    save(`${MODE}-report.json`, report);
    console.log(JSON.stringify({ complete: true, result: report.result || 'baseline saved', report: path.join(OUT, `${MODE}-report.json`), errors: report.errors,
      comparisons: report.comparisons?.map(({ name, difference, dimensionsIdentical }) => ({ name, difference, dimensionsIdentical })) }, null, 2));
    if (report.result === 'failed') process.exitCode = 1;
  } catch (error) {
    report.failure = error.message;
    report.complete = false;
    save(`${MODE}-report.json`, report);
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
