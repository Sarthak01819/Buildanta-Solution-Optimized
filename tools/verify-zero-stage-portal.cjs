/* Camera-to-source aperture contract. Decorative layers are temporarily
 * hidden only for a diagnostic screenshot: unchanged center pixels prove
 * that the circle shows the actual source render, not an opaque disc. */
const fs = require("fs");
const path = require("path");
const { decode } = require("./png.cjs");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright"))); }
const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const OUT = path.join(__dirname, "..", "shots-zero-stage", "portal");
const STOPS = [
  { name: "preopening", logical: .734 },
  { name: "early", logical: .748 }, { name: "mid", logical: .758 },
  { name: "late", logical: .770 }, { name: "full", logical: .788 },
  { name: "source-300", source: .30 },
  { name: "source-950", source: .95 },
];

async function seek(page, target) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((stop) => {
      const { intro, lenis } = window.__buildanta;
      const raw = stop.source === undefined ? intro.rawForP(stop.logical) : intro.rawForZeroStage(stop.source);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
    }, target);
    try {
      await page.waitForFunction((stop) => {
        const { intro } = window.__buildanta;
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        const raw = stop.source === undefined ? intro.rawForP(stop.logical) : intro.rawForZeroStage(stop.source);
        const y = intro.st.start + raw * (intro.st.end - intro.st.start);
        const source = window.__zeroMirrorStageBridge.state;
        const requestedSource = matchMedia("(prefers-reduced-motion: reduce)").matches ? .95 : stop.source;
        return Math.abs(scrollY - y) <= 2 && canvas.width > 100 && source.opacity > .99 &&
          (stop.name === "preopening" || Number(getComputedStyle(canvas).opacity) > .99) &&
          (stop.source === undefined ? Math.abs(intro.progress - stop.logical) < .0025 : Math.abs(source.progress - requestedSource) < .0025);
      }, target, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.evaluate((stop) => {
        const { intro } = window.__buildanta;
        const raw = stop.source === undefined ? intro.rawForP(stop.logical) : intro.rawForZeroStage(stop.source);
        return Math.abs(scrollY - intro.st.start - raw * (intro.st.end - intro.st.start)) <= 2 &&
          document.querySelector(".consult-zero__hand-canvas").width > 100;
      }, target)) return;
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error(`Unstable portal frame ${target.name}`);
}

async function observe(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".consult-zero");
    const style = getComputedStyle(root);
    const clipPath = style.clipPath;
    const match = clipPath.match(/^circle\(([\d.]+)px at ([\d.]+)(px|%) ([\d.]+)(px|%)\)$/);
    const circle = match ? { radius: Number(match[1]),
      x: Number(match[2]) * (match[3] === "%" ? innerWidth / 100 : 1),
      y: Number(match[4]) * (match[5] === "%" ? innerHeight / 100 : 1) } : null;
    const canvas = document.querySelector(".consult-zero__hand-canvas");
    const box = canvas.getBoundingClientRect();
    return { clipPath, circle, reveal: Number(style.getPropertyValue("--zero-reveal")),
      rootOpacity: Number(style.opacity), sourceProgress: window.__zeroMirrorStageBridge.state.progress,
      sourceReady: window.__zeroMirrorStageBridge.state.bridgeReady,
      pointer: [window.__zeroMirrorStageBridge.state.pointerX, window.__zeroMirrorStageBridge.state.pointerY],
      time: window.__zeroMirrorStageBridge.state.time,
      assetErrors: window.__zeroMirrorStageBridge.state.loadErrors,
      legacyMounted: Boolean(window.__buildanta.meetRoot),
      sourceCanvasCount: document.querySelectorAll(".consult-zero__hand-canvas").length,
      canvas: { width: box.width, height: box.height },
      feather: { display: getComputedStyle(document.querySelector(".consult-zero__portal-feather")).display },
    };
  });
}

function difference(a, b, disk = null) {
  let count = 0, changed = 0, total = 0, brightness = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (disk && Math.hypot(x - disk.x, y - disk.y) > disk.radius) continue;
    const i = (y * a.w + x) * a.bpp;
    const d = [0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]));
    if (Math.max(...d) > 10) changed++;
    total += (d[0] + d[1] + d[2]) / 3;
    brightness += (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3; count++;
  }
  return { count, changed: 100 * changed / count, mean: total / count, brightness: brightness / count };
}

async function capture(page, file) {
  const bytes = await page.screenshot({ scale: "css" });
  fs.writeFileSync(file, bytes); return decode(bytes);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  const report = { generatedAt: new Date().toISOString(), runs: [] };
  const save = () => fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  try {
    for (const config of [{ name: "desktop", width: 1072, height: 692, dpr: 1.25 }, { name: "phone", width: 390, height: 844, dpr: 2 }]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === "phone", hasTouch: config.name === "phone" });
      const page = await context.newPage();
      const run = { config, samples: [], reverse: [], assertions: [], errors: [], externalErrors: [] };
      report.runs.push(run);
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
        await page.evaluate(() => { window.__bbPinTime = 300000; });
        await page.mouse.move(config.width / 2, config.height / 2);
        const forwards = new Map();
        for (const stop of STOPS) {
          await seek(page, stop);
          const state = await observe(page);
          const file = path.join(OUT, `${config.name}-${stop.name}.png`);
          const frame = await capture(page, file); forwards.set(stop.name, frame);
          const sample = { ...stop, ...state, capture: file };
          if (stop.logical !== undefined && stop.name !== "preopening") {
            const diagnostic = await page.addStyleTag({ content:
              "#intro .consult-zero{clip-path:none!important}.market-blackout,.consult-zero__light-frame,.consult-zero__portal-feather{visibility:hidden!important}" });
            const reference = await capture(page, path.join(OUT, `${config.name}-${stop.name}-unmasked.png`));
            await diagnostic.evaluate((element) => element.remove());
            sample.center = state.circle ? difference(frame, reference, { ...state.circle, radius: Math.min(80, state.circle.radius * .35) }) : null;
          } else if (stop.name === "source-300") {
            // The approved logo replacement changes artwork, not the portal.
            // Compare against its current orbit capture instead of old logos.
            const previous = path.join(__dirname, "..", "shots-zero-stage", "logos", `${config.name}-p300.png`);
            sample.unchangedSource = fs.existsSync(previous) ? difference(frame, decode(fs.readFileSync(previous))) : null;
          }
          run.samples.push(sample); save(); console.log(`[portal] ${config.name} ${stop.name}: ${file}`);
        }
        const opening = run.samples.filter((s) => s.logical !== undefined && s.name !== "preopening");
        const preopening = run.samples.find((s) => s.name === "preopening");
        run.assertions.push({ name: "the source remains concealed before the camera aperture opens", pass: preopening.circle?.radius === 0 && preopening.reveal === 0 });
        run.assertions.push({ name: "the camera opens a growing circle onto one source canvas", pass: opening.every((s, i) => s.circle && s.circle.radius > 0 && (!i || s.circle.radius > opening[i - 1].circle.radius) && s.sourceReady && !s.legacyMounted && s.sourceCanvasCount === 1 && !s.assetErrors?.length) });
        run.assertions.push({ name: "the circle center is the unchanged source render, not a dark disc", pass: opening.every((s) => s.center?.count > 100 && s.center.changed <= .75 && s.center.mean <= 1 && s.center.brightness > 20) });
        run.assertions.push({ name: "the fully opened circle covers every viewport corner through the garden", pass: [opening.at(-1), run.samples.at(-1)].every((full) => Boolean(full.circle) && [[0, 0], [config.width, 0], [0, config.height], [config.width, config.height]].every(([x, y]) => Math.hypot(x - full.circle.x, y - full.circle.y) <= full.circle.radius + 1)) });
        run.assertions.push({ name: "the subsequent hand and logos remain visually unchanged", pass: run.samples.find((s) => s.name === "source-300").unchangedSource?.changed <= .75 });
        for (const stop of [...STOPS].reverse()) {
          await seek(page, stop);
          const reverse = await capture(page, path.join(OUT, `${config.name}-${stop.name}-reverse.png`));
          run.reverse.push({ name: stop.name, ...difference(forwards.get(stop.name), reverse) });
        }
        run.assertions.push({ name: "reverse scroll restores every portal frame", pass: run.reverse.every((s) => s.changed <= .75) });
        save();
      } finally { await context.close(); }
    }
    const context = await browser.newContext({ viewport: { width: 1200, height: 590 }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready", null, { timeout: 60000 });
      await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
      await seek(page, { name: "reduced", source: .99 });
      const before = await capture(page, path.join(OUT, "reduced-before.png"));
      await page.mouse.move(50, 50);
      await page.evaluate(() => { window.__bbPinTime = 305000; });
      await page.waitForTimeout(150);
      const after = await capture(page, path.join(OUT, "reduced-after.png"));
      const state = await observe(page);
      const delta = difference(before, after);
      report.runs.push({ config: { name: "reduced" }, samples: [{ state, delta }], assertions: [{
        name: "reduced motion has a fully open, static source garden", pass: state.reveal === 1 && state.sourceProgress === .95 && state.time === 0 && state.pointer.every((v) => v === 0) && delta.changed <= .05,
      }], errors: [] });
    } finally { await context.close(); save(); }
  } finally { await browser.close(); save(); }
  const failures = report.runs.flatMap((r) => r.assertions.filter((a) => !a.pass).map((a) => ({ viewport: r.config.name, ...a })));
  console.log(JSON.stringify({ report: path.join(OUT, "report.json"), failures, errors: report.runs.flatMap((r) => r.errors) }, null, 2));
  if (failures.length || report.runs.some((r) => r.errors.length)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
