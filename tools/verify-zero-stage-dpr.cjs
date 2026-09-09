/* Pixel-ratio regression for the offscreen source/meet compositor.
 * All captures use CSS-pixel dimensions so hand/background geometry can be
 * compared at DPR 1, fractional Windows scaling, and retina scaling.
 * Usage: node tools/verify-zero-stage-dpr.cjs
 */
const fs = require("fs");
const path = require("path");
const { decode } = require("./png.cjs");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  "npm/node_modules/@playwright/cli/node_modules/playwright"))); }

const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const OUT = path.join(__dirname, "..", "shots-zero-stage", "dpr-regression");
const VIEWPORT = { width: 1535, height: 790 };
const RATIOS = [1, 1.25, 1.5, 2];
const SOURCE_ONLY = process.argv.includes("--source-only");
const STOPS = SOURCE_ONLY ? [0.08, 0.30, 0.95] : [0.08, 0.30, 0.95, 1];
/* Raster quality and the source grain vary with physical pixel density.
 * A scaled/inset shot changes most pixels by tens of RGB levels; normal
 * antialiasing changes edges only. Keep both coverage and mean bounded. */
const MAX_CHANGED = 12;
const MAX_MEAN = 4;

function difference(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { changed: 100, mean: 255 };
  let count = 0;
  let sum = 0;
  for (let index = 0; index < a.data.length; index += a.bpp) {
    const r = Math.abs(a.data[index] - b.data[index]);
    const g = Math.abs(a.data[index + 1] - b.data[index + 1]);
    const blue = Math.abs(a.data[index + 2] - b.data[index + 2]);
    if (Math.max(r, g, blue) > 10) count += 1;
    sum += (r + g + blue) / 3;
  }
  return {
    changed: Number((count / (a.w * a.h) * 100).toFixed(3)),
    mean: Number((sum / (a.w * a.h)).toFixed(3)),
  };
}

async function scrollToStop(page, progress) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate((target) => {
    const { intro, lenis } = window.__buildanta;
    const raw = intro.rawForZeroStage(target);
    const y = intro.st.start + (intro.st.end - intro.st.start) * raw;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo(0, y);
    }, progress);
    try {
      await page.waitForFunction((target) => {
        const source = window.__zeroMirrorStageBridge;
        const intro = window.__buildanta?.intro;
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        const root = document.querySelector(".consult-zero");
        const expectedY = intro ? intro.st.start + intro.rawForZeroStage(target) * (intro.st.end - intro.st.start) : -1;
        return source && canvas && root && Math.abs(scrollY - expectedY) <= 2 && canvas.width > 100 &&
          Math.abs(source.state.progress - target) <= 0.0025 &&
          source.state.opacity > 0.99 && Number(getComputedStyle(canvas).opacity) > 0.99 &&
          Number(getComputedStyle(canvas.parentElement).opacity) > 0.99 &&
          Number(getComputedStyle(root).opacity) > 0.99 && !document.querySelector(".preload");
      }, progress, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const stable = await page.evaluate((target) => {
        const intro = window.__buildanta.intro;
        const expectedY = intro.st.start + intro.rawForZeroStage(target) * (intro.st.end - intro.st.start);
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        return Math.abs(scrollY - expectedY) <= 2 && canvas.width > 100 &&
          Number(getComputedStyle(canvas).opacity) > 0.99;
      }, progress);
      if (stable) return;
    } catch (error) {
      if (attempt === 2) throw error;
      // A late font/image resize may refresh ScrollTrigger; seek its new map.
    }
  }
  throw new Error(`Stage ${progress} did not retain its visible scroll position`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--use-angle=swiftshader"],
  });
  const references = new Map();
  const runs = [];
  try {
    for (const ratio of RATIOS) {
      console.log(`[dpr] Capturing deviceScaleFactor ${ratio}`);
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: ratio });
      const page = await context.newPage();
      const run = { ratio, samples: [], errors: [], externalResourceErrors: [], failedRequests: [], assertions: [] };
      runs.push(run);
      page.on("pageerror", (error) => run.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const location = message.location().url || "";
        const external = /^https?:/.test(location) && new globalThis.URL(location).origin !== new globalThis.URL(URL).origin;
        (external ? run.externalResourceErrors : run.errors).push(`${message.text()} @ ${location || "unknown"}`);
      });
      page.on("requestfailed", (request) => run.failedRequests.push({
        url: request.url(), resourceType: request.resourceType(), error: request.failure()?.errorText,
      }));
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready",
          null, { timeout: 60000 });
        await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
        await page.evaluate(() => { window.__bbPinTime = 300000; });
        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
        for (const progress of STOPS) {
          await scrollToStop(page, progress);
          const state = await page.evaluate(() => {
            const canvas = document.querySelector(".consult-zero__hand-canvas");
            const rect = canvas.getBoundingClientRect();
            const source = window.__zeroMirrorStageBridge;
            return {
              devicePixelRatio,
              css: { width: rect.width, height: rect.height },
              backing: { width: canvas.width, height: canvas.height },
              logicalProgress: window.__buildanta.intro.progress,
              progress: source.state.progress,
              opacity: source.state.opacity,
            };
          });
          const buffer = await page.screenshot({ scale: "css" });
          const image = decode(buffer);
          const file = path.join(OUT, `dpr-${ratio}-p${String(Math.round(progress * 1000)).padStart(4, "0")}.png`);
          fs.writeFileSync(file, buffer);
          if (ratio === 1) references.set(progress, image);
          const delta = difference(references.get(progress), image);
          const sample = { progress, state, capture: file, dimensions: { width: image.w, height: image.h }, delta };
          run.samples.push(sample);
          console.log(`[dpr] ${ratio} p=${progress}: changed=${delta.changed}% mean=${delta.mean}`);
          run.assertions.push({
            name: `DPR ${ratio} p=${progress} keeps the CSS viewport and requested source state`,
            pass: state.devicePixelRatio === ratio && image.w === VIEWPORT.width && image.h === VIEWPORT.height &&
              Math.abs(state.progress - progress) <= 0.0025 &&
              Math.abs(state.css.width - VIEWPORT.width) <= 1 && Math.abs(state.css.height - VIEWPORT.height) <= 1,
          });
          if (ratio !== 1) run.assertions.push({
            name: `DPR ${ratio} p=${progress} matches DPR 1 geometry without an inset/duplicate shot`,
            pass: delta.changed <= MAX_CHANGED && delta.mean <= MAX_MEAN,
            details: delta,
          });
        }
      } finally {
        await context.close();
      }
      fs.writeFileSync(path.join(OUT, "report-partial.json"), JSON.stringify({ complete: false, runs }, null, 2));
    }
  } finally {
    await browser.close();
  }
  const failures = runs.flatMap((run) => run.assertions.filter((entry) => !entry.pass));
  const runtimeErrors = runs.flatMap((run) => run.errors);
  const report = {
    result: failures.length || runtimeErrors.length ? "failed" : "passed",
    generatedAt: new Date().toISOString(), mode: SOURCE_ONLY ? "source-only" : "source-and-endpoint", url: URL, viewport: VIEWPORT,
    limits: { changed: MAX_CHANGED, mean: MAX_MEAN }, runs,
  };
  const reportPath = path.join(OUT, SOURCE_ONLY ? "report-source-only.json" : "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, report: reportPath, failures, runtimeErrors,
    externalResourceErrors: runs.flatMap((run) => run.externalResourceErrors) }, null, 2));
  if (report.result !== "passed") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
