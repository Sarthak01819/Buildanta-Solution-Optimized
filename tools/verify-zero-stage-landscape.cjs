/* Before/after contract for a background-only replacement. Later scene pixels
 * may change intentionally; hand/camera state, logos, and entry pixels may not. */
const fs = require("fs"), path = require("path");
const { decode } = require("./png.cjs");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright"))); }
const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const STATE_ONLY = process.argv.includes("--state-only-before");
const BEFORE = process.argv.includes("--before") || STATE_ONLY;
const ROOT = path.join(__dirname, "..", "shots-zero-stage", "landscape");
const OUT = path.join(ROOT, BEFORE ? "before" : "after");
const EXPECTED = ["Claude Code", "Gemini", "ChatGPT", "Cursor", "Facebook", "Instagram", "Higgsfield", "Grok"];
const STOPS = [{ name: "source-300", source: .30 }, { name: "source-600", source: .60 },
  { name: "source-800", source: .80 }, { name: "source-990", source: .99 }, { name: "circle", logical: .758 }];

async function seek(page, stop) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((s) => {
      const { intro, lenis } = window.__buildanta;
      const raw = s.source === undefined ? intro.rawForP(s.logical) : intro.rawForZeroStage(s.source);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
    }, stop);
    try {
      await page.waitForFunction((s) => {
        const { intro } = window.__buildanta, canvas = document.querySelector(".consult-zero__hand-canvas");
        const raw = s.source === undefined ? intro.rawForP(s.logical) : intro.rawForZeroStage(s.source);
        const state = window.__zeroMirrorStageBridge.state;
        return Math.abs(scrollY - intro.st.start - raw * (intro.st.end - intro.st.start)) <= 2 && canvas.width > 100 &&
          Number(getComputedStyle(canvas).opacity) > .99 && state.opacity > .99 &&
          (s.source === undefined ? Math.abs(intro.progress - s.logical) < .0025 : Math.abs(state.progress - s.source) < .0025);
      }, stop, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.evaluate((s) => {
        const { intro } = window.__buildanta;
        const raw = s.source === undefined ? intro.rawForP(s.logical) : intro.rawForZeroStage(s.source);
        return Math.abs(scrollY - intro.st.start - raw * (intro.st.end - intro.st.start)) <= 2 &&
          document.querySelector(".consult-zero__hand-canvas").width > 100;
      }, stop)) return;
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error(`Unstable landscape frame ${stop.name}`);
}

async function observe(page) {
  return page.evaluate(() => {
    const api = window.__zeroMirrorStageBridge;
    api.scene.updateMatrixWorld(true);
    const bones = {}, hands = {}, logos = [], textures = [], seen = new Set();
    for (const name of ["GreenHand", "HumanHand"]) {
      const hand = api.scene.getObjectByName(name);
      hands[name] = hand?.matrixWorld.toArray();
      hand?.traverse((object) => {
        if (object.isBone) bones[`${name}/${object.name}`] = object.matrixWorld.toArray();
        // GLTF armatures are siblings of these meshes, not mesh descendants.
        // Read each mesh's actual skin skeleton, including both hand rigs.
        object.skeleton?.bones.forEach((bone) => { bones[`${name}/${bone.name}`] = bone.matrixWorld.toArray(); });
      });
    }
    const inspectTexture = (texture, key) => {
      if (!texture?.isTexture || seen.has(texture.uuid)) return;
      seen.add(texture.uuid);
      const image = texture.image || texture.source?.data;
      const source = image?.currentSrc || image?.src || "";
      if (/landscape/i.test(`${key} ${texture.name} ${source}`)) textures.push({ key, name: texture.name, source,
        width: image?.naturalWidth || image?.width || 0, height: image?.naturalHeight || image?.height || 0,
        complete: image?.complete === undefined ? true : image.complete, colorSpace: texture.colorSpace });
    };
    api.scene.traverse((object) => {
      if (/^ZeroStageCoin\d+$/.test(object.name)) logos.push({ name: object.name, logoName: object.userData.logoName,
        textureName: object.material[1]?.map?.userData?.logoName });
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        for (const [key, uniform] of Object.entries(material.uniforms || {})) inspectTexture(uniform?.value, key);
        inspectTexture(material.map, object.name);
      }
    });
    // The fullscreen background is rendered in its own internal scene.
    // Its load manifest records the decoded images used by those uniforms.
    for (const layer of api.state.landscape?.layers || []) {
      if (!textures.some((texture) => texture.source === layer.source)) textures.push({ ...layer,
        complete: api.state.landscape.ready === true });
    }
    logos.sort((a, b) => Number(a.name.match(/\d+$/)[0]) - Number(b.name.match(/\d+$/)[0]));
    const root = document.querySelector(".consult-zero"), style = getComputedStyle(root);
    const match = style.clipPath.match(/^circle\(([\d.]+)px at ([\d.]+)(px|%) ([\d.]+)(px|%)\)$/);
    const circle = match ? { radius: Number(match[1]), x: Number(match[2]) * (match[3] === "%" ? innerWidth / 100 : 1),
      y: Number(match[4]) * (match[5] === "%" ? innerHeight / 100 : 1) } : null;
    const canvas = document.querySelector(".consult-zero__hand-canvas").getBoundingClientRect();
    return { progress: api.state.progress, ready: api.state.bridgeReady, assetErrors: api.state.loadErrors,
      camera: [...api.camera.matrixWorld.elements, ...api.camera.projectionMatrix.elements], hands, bones, logos,
      textures, clipPath: style.clipPath, circle, legacyMounted: Boolean(window.__buildanta.meetRoot),
      pointer: { x: api.state.pointerX, y: api.state.pointerY,
        targetX: api.state.pointerTargetX, targetY: api.state.pointerTargetY,
        backgroundX: api.state.backgroundPointerX, backgroundY: api.state.backgroundPointerY },
      canvas: { width: canvas.width, height: canvas.height }, landscape: api.state.landscape || null };
  });
}

function delta(a, b, disk = null) {
  let changed = 0, sum = 0, count = 0, edgeCount = 0, blackEdge = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (disk && Math.hypot(x - disk.x, y - disk.y) > disk.radius) continue;
    const i = (y * a.w + x) * a.bpp;
    const d = [0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]));
    if (Math.max(...d) > 10) changed++; sum += (d[0] + d[1] + d[2]) / 3; count++;
    if (x < 10 || y < 10 || x >= a.w - 10 || y >= a.h - 10) {
      edgeCount++; if (Math.max(a.data[i], a.data[i + 1], a.data[i + 2]) < 5) blackEdge++;
    }
  }
  return { changed: 100 * changed / count, mean: sum / count, blackEdgePercent: 100 * blackEdge / Math.max(1, edgeCount) };
}
function numericDelta(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length ? Math.max(0, ...a.map((v, i) => Math.abs(v - b[i]))) : Infinity;
  const keys = Object.keys(a || {});
  return keys.length === Object.keys(b || {}).length ? Math.max(0, ...keys.map((key) => numericDelta(a[key], b[key]))) : Infinity;
}
async function capture(page, file) { const bytes = await page.screenshot({ scale: "css" }); fs.writeFileSync(file, bytes); return decode(bytes); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const baseline = BEFORE ? null : JSON.parse(fs.readFileSync(path.join(ROOT, "before", "report.json"), "utf8"));
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  const report = STATE_ONLY ? JSON.parse(fs.readFileSync(path.join(OUT, "report.json"), "utf8"))
    : { mode: BEFORE ? "before" : "after", generatedAt: new Date().toISOString(), runs: [] };
  const save = () => fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  try {
    for (const config of [{ name: "desktop", width: 1535, height: 790, dpr: 1.25 }, { name: "phone", width: 390, height: 844, dpr: 2 }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === "phone", hasTouch: config.name === "phone" });
      const page = await context.newPage();
      const run = STATE_ONLY ? report.runs.find((r) => r.config.name === config.name)
        : { config, samples: [], reverse: [], assertions: [], errors: [], externalErrors: [], landscapeRequests: [] };
      if (!STATE_ONLY) report.runs.push(run);
      page.on("pageerror", (error) => run.errors.push(error.message));
      page.on("response", (response) => {
        if (/\/landscape\//i.test(response.url())) (run.landscapeRequests ||= []).push({ url: response.url(), status: response.status() });
      });
      page.on("requestfailed", (request) => {
        if (/\/landscape\//i.test(request.url())) run.errors.push(`${request.failure()?.errorText} @ ${request.url()}`);
      });
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const location = message.location().url || "";
        const external = /^https?:/.test(location) && new globalThis.URL(location).origin !== new globalThis.URL(URL).origin;
        (external ? run.externalErrors : run.errors).push(`${message.text()} @ ${location}`);
      });
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready", null, { timeout: 60000 });
        await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
        await page.evaluate(() => { window.__bbPinTime = 300000; });
        await page.mouse.move(config.width / 2, config.height / 2);
        const frames = new Map();
        for (const stop of STOPS) {
          await seek(page, stop);
          const state = await observe(page), file = path.join(OUT, `${config.name}-${stop.name}.png`);
          if (STATE_ONLY) {
            run.samples.find((s) => s.name === stop.name).state = state; save();
            console.log(`[landscape] before skeletons ${config.name} ${stop.name}: ${Object.keys(state.bones).length}`);
            continue;
          }
          const frame = await capture(page, file); frames.set(stop.name, frame);
          const sample = { ...stop, state, capture: file, blackEdgePercent: delta(frame, frame).blackEdgePercent };
          if (stop.name === "circle") {
            const diagnostic = await page.addStyleTag({ content: "#intro .consult-zero{clip-path:none!important}.market-blackout,.consult-zero__light-frame,.consult-zero__portal-feather{visibility:hidden!important}" });
            const reference = await capture(page, path.join(OUT, `${config.name}-circle-unmasked.png`));
            await diagnostic.evaluate((element) => element.remove());
            sample.center = state.circle ? delta(frame, reference, { ...state.circle, radius: Math.min(80, state.circle.radius * .35) }) : null;
          }
          if (baseline) {
            const original = baseline.runs.find((r) => r.config.name === config.name)?.samples.find((s) => s.name === stop.name);
            sample.comparison = { camera: numericDelta(state.camera, original?.state.camera),
              hands: numericDelta(state.hands, original?.state.hands), bones: numericDelta(state.bones, original?.state.bones),
              pixels: original ? delta(frame, decode(fs.readFileSync(original.capture))) : null };
          }
          run.samples.push(sample); save(); console.log(`[landscape] ${report.mode} ${config.name} ${stop.name}: ${file}`);
        }
        if (!BEFORE) {
          for (const stop of [...STOPS].reverse()) { await seek(page, stop); const file = path.join(OUT, `${config.name}-${stop.name}-reverse.png`); run.reverse.push({ name: stop.name, ...delta(frames.get(stop.name), await capture(page, file)) }); }
          run.assertions.push({ name: "background replacement preserves camera and both hand skeletons", pass: run.samples.every((s) => Object.keys(s.state.bones).length > 20 && s.comparison.camera < 1e-6 && s.comparison.hands < 1e-6 && s.comparison.bones < 1e-6) });
          run.assertions.push({ name: "cyan entry and transparent circle pixels remain unchanged", pass: run.samples.filter((s) => s.name === "source-300" || s.name === "circle").every((s) => s.comparison.pixels.changed <= .75) && run.samples.find((s) => s.name === "circle").center?.changed <= .75 });
          run.assertions.push({ name: "new landscape textures are decoded and ready", pass: run.samples.every((s) => s.state.landscape?.ready === true && s.state.textures.length >= 3 && s.state.textures.every((t) => t.complete && t.width > 0 && t.height > 0)) && run.landscapeRequests.every((r) => r.status >= 200 && r.status < 400) });
          run.assertions.push({ name: "landscape covers viewport edges without black gaps", pass: run.samples.filter((s) => s.source >= .60).every((s) => s.blackEdgePercent < 1 && Math.abs(s.state.canvas.width - config.width) <= 1 && Math.abs(s.state.canvas.height - config.height) <= 1) });
          run.assertions.push({ name: "all eight logos and the single source scene remain intact", pass: run.samples.every((s) => s.state.ready && !s.state.assetErrors?.length && !s.state.legacyMounted && s.state.logos.length === 8 && s.state.logos.every((l, i) => l.logoName === EXPECTED[i] && l.textureName === EXPECTED[i])) });
          run.assertions.push({ name: "reverse scroll reproduces the composited landscape", pass: run.reverse.every((s) => s.changed <= .75) }); save();
          await seek(page, { name: "pointer", source: .80 });
          run.pointerExtremes = [];
          const centerState = await observe(page);
          for (const corner of [{ name: "top-left", x: 1, y: 1 }, { name: "bottom-right", x: config.width - 1, y: config.height - 1 }]) {
            await page.mouse.move(corner.x, corner.y);
            // Advance the test clock in real render steps so the original
            // damped pointer implementation runs; directly setting state
            // would not test the visitor's input or the camera/background lag.
            await page.evaluate(async () => {
              for (let i = 0; i < 40; i++) {
                window.__bbPinTime += 50;
                await new Promise(requestAnimationFrame);
              }
            });
            const state = await observe(page), file = path.join(OUT, `${config.name}-pointer-${corner.name}.png`);
            const image = await capture(page, file);
            const change = delta(image, frames.get("source-800"));
            const cameraOffset = Math.hypot(...[12, 13, 14].map((i) => state.camera[i] - centerState.camera[i]));
            const finite = [...state.camera, ...Object.values(state.hands).flat(), ...Object.values(state.bones).flat(), ...Object.values(state.pointer)].every(Number.isFinite);
            run.pointerExtremes.push({ corner, capture: file, pointer: state.pointer, finite, cameraOffset, ...change });
            save(); console.log(`[landscape] pointer ${config.name} ${corner.name}: ${file}`);
          }
          await page.mouse.move(config.width / 2, config.height / 2);
          await page.evaluate(() => { window.__bbPinTime = 300000; });
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const resetState = await observe(page);
          const reset = await capture(page, path.join(OUT, `${config.name}-pointer-reset.png`));
          run.pointerReset = { pointer: resetState.pointer, ...delta(reset, frames.get("source-800")) };
          run.assertions.push({ name: "pointer extremes produce bounded parallax without invalid state or black gaps", pass: run.pointerExtremes.every((s) => s.finite && s.blackEdgePercent < 1 && s.changed > .05 && s.cameraOffset > .01 && s.cameraOffset < .27 && Math.abs(s.pointer.backgroundX) > .9 && Math.abs(s.pointer.backgroundY) > .9 && Math.abs(s.pointer.backgroundX) <= 1 && Math.abs(s.pointer.backgroundY) <= 1) });
          run.assertions.push({ name: "returning the pointer to center restores the pinned landscape", pass: run.pointerReset.changed <= .75 && Object.values(run.pointerReset.pointer).every((v) => Math.abs(v) < 1e-6) }); save();
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.assertions.filter((a) => !a.pass).map((a) => ({ viewport: r.config.name, ...a })));
  console.log(JSON.stringify({ report: path.join(OUT, "report.json"), failures, errors: report.runs.flatMap((r) => r.errors) }, null, 2));
  if (failures.length || report.runs.some((r) => r.errors.length)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
