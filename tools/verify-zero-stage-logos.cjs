/* Logo replacement contract: artwork deliberately changes, while cylinder
 * geometry, orbit/depth and reversible scrolling retain the existing motion. */
const fs = require("fs");
const path = require("path");
const { decode } = require("./png.cjs");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright"))); }
const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const OUT = path.join(__dirname, "..", "shots-zero-stage", "logos");
const BASELINE = path.join(__dirname, "..", "shots-zero-stage", "coins", "after", "report.json");
const EXPECTED = ["Claude Code", "Gemini", "ChatGPT", "Cursor", "Facebook", "Instagram", "Higgsfield", "Grok"];
const SIDE_COLORS = [15331053, 15330798, 15724267, 15723242, 15265006, 15591913, 15657965, 15396588];
const STOPS = [.22, .30, .38];
const ORIGINAL_SPIN_PHASES = (() => {
  let state = (0x5a17e1 ^ 0x0c01cafe) >>> 0;
  return Array.from({ length: 8 }, () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296 * Math.PI * 2;
  });
})();

async function seek(page, target) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((p) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + intro.rawForZeroStage(p) * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
    }, target);
    try {
      await page.waitForFunction((p) => {
        const { intro } = window.__buildanta;
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        const state = window.__zeroMirrorStageBridge.state;
        const y = intro.st.start + intro.rawForZeroStage(p) * (intro.st.end - intro.st.start);
        return Math.abs(scrollY - y) <= 2 && canvas.width > 100 && Math.abs(state.progress - p) < .0025 &&
          state.opacity > .99 && Number(getComputedStyle(canvas).opacity) > .99 &&
          Number(getComputedStyle(canvas.parentElement).opacity) > .99;
      }, target, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.evaluate((p) => {
        const { intro } = window.__buildanta;
        const y = intro.st.start + intro.rawForZeroStage(p) * (intro.st.end - intro.st.start);
        return Math.abs(scrollY - y) <= 2 && document.querySelector(".consult-zero__hand-canvas").width > 100;
      }, target)) return;
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error(`Unstable logo frame ${target}`);
}

async function observe(page) {
  return page.evaluate(() => {
    const api = window.__zeroMirrorStageBridge;
    const coins = [];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const hull = (points) => {
      points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const lower = [], upper = [];
      for (const p of points) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
      for (const p of [...points].reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    };
    api.scene.updateMatrixWorld(true);
    api.scene.traverse((mesh) => {
      if (!/^ZeroStageCoin\d+$/.test(mesh.name)) return;
      const materials = mesh.material;
      const face = materials[1], texture = face?.map, image = texture?.image;
      const textureState = { name: texture?.userData?.logoName, width: image?.width || 0, height: image?.height || 0,
        canvasTexture: Boolean(texture?.isCanvasTexture), sameBackFace: materials[2]?.map === texture,
        artworkPixels: 0, opaquePixels: 0, hash: null, error: null };
      try {
        const context = image?.getContext?.("2d");
        if (context) {
          const { data } = context.getImageData(0, 0, image.width, image.height);
          let hash = 2166136261;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 32 && Math.min(data[i], data[i + 1], data[i + 2]) < 230) textureState.artworkPixels++;
            if (data[i + 3] > 240) textureState.opaquePixels++;
            for (let c = 0; c < 4; c++) hash = Math.imul(hash ^ data[i + c], 16777619);
          }
          textureState.hash = (hash >>> 0).toString(16);
        }
      } catch (error) { textureState.error = error.message; }
      const position = mesh.geometry.attributes.position, point = api.camera.position.clone(), points = [];
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(api.camera);
        points.push([(point.x * .5 + .5) * innerWidth, (point.y * .5 + .5) * innerHeight]);
      }
      coins.push({ name: mesh.name, logoName: mesh.userData.logoName, visible: mesh.visible && mesh.parent.visible,
        opacity: face.opacity, texture: textureState, polygon: hull(points), geometry: mesh.geometry.parameters,
        depthTest: materials.every((m) => m.depthTest), depthWrite: materials.every((m) => m.depthWrite),
        sideColor: materials[0].color.getHex(), renderOrder: mesh.renderOrder,
        position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray(), spinPhase: mesh.userData.spinPhase });
    });
    coins.sort((a, b) => Number(a.name.match(/\d+$/)[0]) - Number(b.name.match(/\d+$/)[0]));
    return { progress: api.state.progress, ready: api.state.bridgeReady, assetErrors: api.state.loadErrors,
      legacyMounted: Boolean(window.__buildanta.meetRoot), coins };
  });
}

function difference(a, b) {
  let count = 0, total = 0;
  for (let i = 0; i < a.data.length; i += a.bpp) {
    const values = [0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]));
    if (Math.max(...values) > 10) count++;
    total += (values[0] + values[1] + values[2]) / 3;
  }
  return { changed: 100 * count / (a.w * a.h), mean: total / (a.w * a.h) };
}

function hullDistance(a, b) {
  if (!a?.length || !b?.length) return Infinity;
  const directed = (from, to) => Math.max(...from.map((p) => Math.min(...to.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
  return Math.max(directed(a, b), directed(b, a));
}

async function contactSheet(page, file) {
  await page.evaluate(() => {
    const overlay = document.createElement("div"); overlay.id = "__logo-test-sheet";
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483647", background: "#e8e8e8",
      display: "grid", gridTemplateColumns: innerWidth > 600 ? "repeat(4,1fr)" : "repeat(2,1fr)",
      gridAutoRows: "1fr", gap: "12px", padding: "18px", boxSizing: "border-box" });
    const coins = [];
    window.__zeroMirrorStageBridge.scene.traverse((mesh) => { if (/^ZeroStageCoin\d+$/.test(mesh.name)) coins.push(mesh); });
    for (const mesh of coins) {
      const item = document.createElement("div");
      Object.assign(item.style, { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", background: "white", minHeight: "0" });
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
      Object.assign(canvas.style, { width: innerWidth > 600 ? "180px" : "132px", height: innerWidth > 600 ? "180px" : "132px", maxHeight: "80%", objectFit: "contain" });
      canvas.getContext("2d").drawImage(mesh.material[1].map.image, 0, 0, 512, 512);
      const label = document.createElement("span"); label.textContent = mesh.userData.logoName;
      Object.assign(label.style, { font: "600 14px sans-serif", color: "#111" });
      item.append(canvas, label); overlay.append(item);
    }
    document.body.append(overlay);
  });
  fs.writeFileSync(file, await page.screenshot({ scale: "css" }));
  await page.evaluate(() => document.getElementById("__logo-test-sheet").remove());
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  const report = { generatedAt: new Date().toISOString(), expected: EXPECTED, geometryBaseline: BASELINE, runs: [] };
  const save = () => fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  try {
    for (const config of [{ name: "desktop", width: 1072, height: 692, dpr: 1.25 }, { name: "phone", width: 390, height: 844, dpr: 2 }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === "phone", hasTouch: config.name === "phone" });
      const page = await context.newPage();
      const run = { config, samples: [], reverse: [], assertions: [], errors: [], externalErrors: [], failedRequests: [] };
      report.runs.push(run);
      page.on("pageerror", (error) => run.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const location = message.location().url || "";
        const external = /^https?:/.test(location) && new globalThis.URL(location).origin !== new globalThis.URL(URL).origin;
        (external ? run.externalErrors : run.errors).push(`${message.text()} @ ${location}`);
      });
      page.on("requestfailed", (request) => run.failedRequests.push({ url: request.url(), error: request.failure()?.errorText,
        local: new globalThis.URL(request.url()).origin === new globalThis.URL(URL).origin }));
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready", null, { timeout: 60000 });
        await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
        await page.evaluate(() => { window.__bbPinTime = 300000; });
        await page.mouse.move(config.width / 2, config.height / 2);
        const forwards = new Map();
        const previous = baseline.runs.find((r) => r.config.name === config.name);
        for (const p of STOPS) {
          await seek(page, p);
          const state = await observe(page);
          const file = path.join(OUT, `${config.name}-p${Math.round(p * 1000)}.png`);
          const bytes = await page.screenshot({ scale: "css" }); fs.writeFileSync(file, bytes); forwards.set(p, decode(bytes));
          const original = previous?.samples.find((s) => s.requested === p);
          const geometryDifferences = state.coins.map((coin) => ({ name: coin.name,
            maxPixels: hullDistance(coin.polygon, original?.coins.find((c) => c.name === coin.name)?.polygon) }));
          run.samples.push({ requested: p, capture: file, ...state, geometryDifferences }); save();
          console.log(`[logos] ${config.name} p=${p}: ${file}`);
        }
        const allCoins = run.samples.flatMap((s) => s.coins);
        run.assertions.push({ name: "all eight confirmed brands occupy the matching original coin slots", pass: run.samples.every((s) => s.coins.length === 8 && s.coins.every((coin, i) => coin.logoName === EXPECTED[i] && coin.texture.name === EXPECTED[i] && coin.visible)) });
        run.assertions.push({ name: "each face has decoded, nonblank, distinct 512px artwork on both sides", pass: allCoins.every((c) => c.texture.canvasTexture && c.texture.sameBackFace && c.texture.width === 512 && c.texture.height === 512 && !c.texture.error && c.texture.artworkPixels > 512 * 512 * .005 && c.texture.opaquePixels > 512 * 512 * .5) && run.samples.every((s) => new Set(s.coins.map((c) => c.texture.hash)).size === 8) });
        run.assertions.push({ name: "original cylinders, rim colors and depth behavior remain intact", pass: allCoins.every((c, i) => c.geometry.radiusTop === .03 && c.geometry.radiusBottom === .03 && c.geometry.height === .005 && c.geometry.radialSegments === 24 && c.depthTest && c.depthWrite && c.renderOrder === 22 && c.sideColor === SIDE_COLORS[i % 8]) });
        run.assertions.push({ name: "original seeded coin phases retain their scroll-driven spin", pass: run.samples.every((s) => s.coins.every((c, i) => Math.abs(c.spinPhase - ORIGINAL_SPIN_PHASES[i]) < 1e-10 && Math.abs(c.rotation[1] - c.spinPhase - 13.128956 * Math.max(s.progress - .01, 0) * 2) < 1e-9)) });
        run.assertions.push({ name: "projected coin geometry matches the pre-logo orbit", pass: run.samples.every((s) => s.geometryDifferences.every((d) => d.maxPixels <= 1.5)), maxPixels: Math.max(...run.samples.flatMap((s) => s.geometryDifferences.map((d) => d.maxPixels))) });
        run.assertions.push({ name: "source assets remain ready without a duplicate legacy scene", pass: run.samples.every((s) => s.ready && !s.legacyMounted && !s.assetErrors?.length && Math.abs(s.progress - s.requested) < .0025) });
        const sheet = path.join(OUT, `${config.name}-textures.png`);
        if (allCoins.every((c) => c.texture.canvasTexture && c.texture.width > 0)) { await contactSheet(page, sheet); run.contactSheet = sheet; console.log(`[logos] texture sheet: ${sheet}`); }
        for (const p of [...STOPS].reverse()) {
          await seek(page, p);
          const bytes = await page.screenshot({ scale: "css" });
          fs.writeFileSync(path.join(OUT, `${config.name}-p${Math.round(p * 1000)}-reverse.png`), bytes);
          run.reverse.push({ progress: p, ...difference(forwards.get(p), decode(bytes)) });
        }
        run.assertions.push({ name: "reverse scrolling reproduces the new artwork and original motion", pass: run.reverse.every((s) => s.changed <= .75) });
        run.assertions.push({ name: "no local logo/source resource requests failed", pass: run.failedRequests.every((r) => !r.local) }); save();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.assertions.filter((a) => !a.pass).map((a) => ({ viewport: r.config.name, ...a })));
  console.log(JSON.stringify({ report: path.join(OUT, "report.json"), failures, errors: report.runs.flatMap((r) => r.errors) }, null, 2));
  if (failures.length || report.runs.some((r) => r.errors.length)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
