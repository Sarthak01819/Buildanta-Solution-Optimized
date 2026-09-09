/* Restore only the existing WE SCALE payoff copy. The scene underneath,
 * early circle, suppressed HUD/veils, and epilogue lifecycle stay intact. */
const fs = require("fs"), path = require("path");
const { decode } = require("./png.cjs");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright"))); }
const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const OUT = path.join(__dirname, "..", "shots-zero-stage", "title");
const BASELINE = path.join(__dirname, "..", "shots-zero-stage", "landscape", "after", "report.json");
const STOPS = [{ name: "source-300", source: .30 }, { name: "source-700", source: .70 },
  { name: "source-800", source: .80 }, { name: "source-820", source: .82 },
  { name: "source-990", source: .99 }, { name: "circle", logical: .758 }];

async function seek(page, stop) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const y = await page.evaluate((s) => {
      const { intro, lenis } = window.__buildanta;
      let raw;
      if (s.film !== undefined) {
        const p = .768 + .848 * .224, epsilon = .00001;
        const start = intro.rawForP(p);
        const end = 2 * intro.rawForP(p + epsilon) - intro.rawForP(p + 2 * epsilon);
        raw = start + (end - start) * s.film;
      } else raw = s.source === undefined ? intro.rawForP(s.logical) : intro.rawForZeroStage(s.source);
      const position = intro.st.start + raw * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(position, { immediate: true, force: true }); else scrollTo(0, position);
      return position;
    }, stop);
    try {
      await page.waitForFunction(({ s, y }) => {
        const api = window.__zeroMirrorStageBridge, intro = window.__buildanta.intro;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (Math.abs(scrollY - y) > 2) return false;
        if (s.film !== undefined) return Math.abs(intro.progress - (.768 + .848 * .224)) < .0025;
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        return canvas.width > 100 && api.state.opacity > .99 && Number(getComputedStyle(canvas).opacity) > .99 &&
          (s.source === undefined ? Math.abs(intro.progress - s.logical) < .0025 : Math.abs(api.state.progress - (reduced ? .95 : s.source)) < .0025);
      }, { s: stop, y }, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.evaluate((targetY) => Math.abs(scrollY - targetY) <= 2, y)) return;
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error(`Unstable title frame ${stop.name}`);
}

async function observe(page) {
  return page.evaluate(() => {
    const opacity = (element) => {
      if (!element) return 0;
      let value = 1;
      for (let el = element; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return 0;
        value *= Number(style.opacity);
      }
      return value;
    };
    const api = window.__zeroMirrorStageBridge, title = document.querySelector(".consult-meet__title");
    const strong = title.querySelector("strong"), paragraph = title.querySelector("p");
    const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
    const normalize = (text) => text.replace(/\s+/g, " ").trim();
    // Edge blur is intentionally restored by D-063 and has its own masked
    // center/edge checks in verify-zero-stage-design.cjs.
    const hidden = Object.fromEntries([".consult-meet__target", ".consult-meet__veil", ".consult-zero__hud"].map((selector) => [selector, opacity(document.querySelector(selector))]));
    api.scene.updateMatrixWorld(true);
    const hands = {}, bones = {};
    for (const name of ["GreenHand", "HumanHand"]) {
      const hand = api.scene.getObjectByName(name); hands[name] = hand?.matrixWorld.toArray();
      hand?.traverse((mesh) => mesh.skeleton?.bones.forEach((bone) => { bones[`${name}/${bone.name}`] = bone.matrixWorld.toArray(); }));
    }
    return { progress: api.state.progress, stageOpacity: api.state.opacity, time: api.state.time,
      title: { count: document.querySelectorAll(".consult-meet__title").length, opacity: opacity(title),
        titleText: normalize(strong.textContent), bodyText: normalize(paragraph.innerText || paragraph.textContent),
        existingParent: title.parentElement.classList.contains("consult-meet"), box: rect(title), headingBox: rect(strong), bodyBox: rect(paragraph),
        headingFontSize: parseFloat(getComputedStyle(strong).fontSize), headingFont: getComputedStyle(strong).fontFamily,
        fontReady: document.fonts.check(`${getComputedStyle(strong).fontSize} "Instrument Serif"`),
        pointerEvents: getComputedStyle(title).pointerEvents }, hidden,
      camera: [...api.camera.matrixWorld.elements, ...api.camera.projectionMatrix.elements], hands, bones,
      legacyMounted: Boolean(window.__buildanta.meetRoot), assetErrors: api.state.loadErrors };
  });
}

function numericDelta(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length ? Math.max(0, ...a.map((v, i) => Math.abs(v - b[i]))) : Infinity;
  const keys = Object.keys(a || {});
  return keys.length === Object.keys(b || {}).length ? Math.max(0, ...keys.map((key) => numericDelta(a[key], b[key]))) : Infinity;
}
function imageDelta(a, b) {
  let changed = 0;
  for (let i = 0; i < a.data.length; i += a.bpp) if (Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]))) > 10) changed++;
  return 100 * changed / (a.w * a.h);
}
async function capture(page, file) { const bytes = await page.screenshot({ scale: "css" }); fs.writeFileSync(file, bytes); return decode(bytes); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const report = { generatedAt: new Date().toISOString(), runs: [] };
  const save = () => fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  try {
    for (const config of [{ name: "desktop", width: 1535, height: 790, dpr: 1.25 }, { name: "phone", width: 390, height: 844, dpr: 2 }, { name: "reduced", width: 1200, height: 590, dpr: 1, reduced: true }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr,
        isMobile: config.name === "phone", hasTouch: config.name === "phone", reducedMotion: config.reduced ? "reduce" : "no-preference" });
      const page = await context.newPage(), run = { config, samples: [], reverse: [], assertions: [], errors: [], externalErrors: [] }; report.runs.push(run);
      page.on("pageerror", (error) => run.errors.push(error.message));
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
        await page.evaluate(async () => { window.__bbPinTime = 300000; await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]); });
        await page.mouse.move(config.width / 2, config.height / 2);
        const stops = config.reduced ? [{ name: "still", source: .99 }] : STOPS, frames = new Map();
        for (const stop of stops) {
          await seek(page, stop);
          const state = await observe(page), file = path.join(OUT, `${config.name}-${stop.name}.png`);
          frames.set(stop.name, await capture(page, file));
          const original = baseline.runs.find((r) => r.config.name === config.name)?.samples.find((s) => s.name === stop.name)?.state;
          run.samples.push({ ...stop, state, capture: file, unchangedScene: original ? {
            camera: numericDelta(state.camera, original.camera), hands: numericDelta(state.hands, original.hands), bones: numericDelta(state.bones, original.bones) } : null });
          save(); console.log(`[title] ${config.name} ${stop.name}: ${file}`);
        }
        const inside = (b) => b.x >= -1 && b.y >= -1 && b.right <= config.width + 1 && b.bottom <= config.height + 1 && b.width > 0 && b.height > 0;
        const late = run.samples.filter((s) => config.reduced || s.source >= .82);
        run.assertions.push({ name: "the original payoff title exists exactly once with its original copy", pass: run.samples.every((s) => s.state.title.count === 1 && s.state.title.existingParent && s.state.title.titleText === "WE SCALE." && s.state.title.bodyText === "AI executes. Humans direct. Together, you scale.") });
        run.assertions.push({ name: "late payoff copy is visible and stays inside the viewport", pass: late.every((s) => s.state.title.opacity > .99 && [s.state.title.box, s.state.title.headingBox, s.state.title.bodyBox].every(inside)) });
        run.assertions.push({ name: "legacy target, HUD, and full-screen veil remain suppressed", pass: run.samples.every((s) => Object.values(s.state.hidden).every((value) => value < .001) && !s.state.legacyMounted && !s.state.assetErrors?.length) });
        if (config.reduced) {
          run.assertions.push({ name: "reduced motion keeps the title over the static garden", pass: run.samples[0].state.progress === .95 && run.samples[0].state.time === 0 });
        } else {
          run.assertions.push({ name: "opening, logos and pre-title landscape have no premature copy", pass: run.samples.filter((s) => s.logical || s.source <= .70).every((s) => s.state.title.opacity < .001) });
          const fade = run.samples.find((s) => s.source === .80).state.title.opacity;
          run.assertions.push({ name: "title scroll fade is underway before the full reveal", pass: fade > .1 && fade < .99 });
          run.assertions.push({ name: "camera and both hand skeletons remain unchanged", pass: run.samples.filter((s) => s.unchangedScene).every((s) => s.unchangedScene.camera < 1e-6 && s.unchangedScene.hands < 1e-6 && s.unchangedScene.bones < 1e-6 && Object.keys(s.state.bones).length === 48) });
          run.assertions.push({ name: "payoff placement respects the desktop/mobile layout", pass: late.every((s) => config.name === "phone" ? s.state.title.box.y <= config.height * .12 && s.state.title.headingFontSize <= 52.1 : s.state.title.box.x >= config.width * .62) });
          for (const stop of [...STOPS].reverse()) {
            await seek(page, stop); const state = await observe(page);
            const file = path.join(OUT, `${config.name}-${stop.name}-reverse.png`);
            const pixels = imageDelta(frames.get(stop.name), await capture(page, file));
            const forward = run.samples.find((s) => s.name === stop.name).state.title;
            run.reverse.push({ name: stop.name, pixels, opacityDelta: Math.abs(state.title.opacity - forward.opacity), titleUnchanged: state.title.titleText === forward.titleText && state.title.bodyText === forward.bodyText });
          }
          run.assertions.push({ name: "reverse scroll restores title visibility and composition", pass: run.reverse.every((s) => s.opacityDelta < .001 && s.titleUnchanged && s.pixels <= .75) });
          await seek(page, { name: "epilogue", film: .14 });
          run.epilogue = await observe(page); await capture(page, path.join(OUT, `${config.name}-epilogue.png`));
          run.assertions.push({ name: "the title fades out with its source scene in the epilogue", pass: run.epilogue.title.opacity < .001 && run.epilogue.stageOpacity < .001 });
        }
        save();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.assertions.filter((a) => !a.pass).map((a) => ({ viewport: r.config.name, ...a })));
  console.log(JSON.stringify({ report: path.join(OUT, "report.json"), failures, errors: report.runs.flatMap((r) => r.errors) }, null, 2));
  if (failures.length || report.runs.some((r) => r.errors.length)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
