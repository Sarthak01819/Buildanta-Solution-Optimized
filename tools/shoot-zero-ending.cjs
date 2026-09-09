/* Screenshot the PRODUCTION fist-bump ending (ZeroMirror stage bridge,
 * stage-local 0.95 -> 1.0) for before/after comparison by eye.
 *
 *   node tools/shoot-zero-ending.cjs --tag before
 *
 * Output: shots-zero-ending/<tag>/
 *   desktop-<stop>.png   1535x790 @1.25  stops 0.95 0.965 0.98 0.99 1.0
 *   contact-<stop>.png   1535x790 @2     stops 0.99 1.0, clipped around the
 *                        projected state.fistBump.contactPoint (falls back to
 *                        the central 55% x 60% of the viewport)
 *   phone-<stop>.png     390x844 @2      stops 0.99 1.0
 *   manifest.json        bridge state observed at every capture
 *
 * Deterministic: time is pinned (window.__bbPinTime), the pointer is centred
 * so parallax is neutral, and every stop is a pure function of scroll
 * position. No baseline comparison lives here; judge the PNGs.
 * Exits non-zero if the bridge never becomes ready, state.loadErrors is
 * non-empty, a stop does not land, or the page throws. */
const fs = require("fs");
const path = require("path");
/* Captures judge the canvas; a downloadable font must not stall them. */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  "npm/node_modules/@playwright/cli/node_modules/playwright"))); }

const URL = process.env.SITE_URL || "http://127.0.0.1:5303/";
const tagIndex = process.argv.indexOf("--tag");
const TAG = tagIndex >= 0 && process.argv[tagIndex + 1] ? process.argv[tagIndex + 1] : "shots";
const OUT = path.join(__dirname, "..", "shots-zero-ending", TAG);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DESKTOP = { width: 1535, height: 790 };
const PHONE = { width: 390, height: 844 };
const DESKTOP_STOPS = [0.95, 0.965, 0.98, 0.99, 1];
const CLOSE_STOPS = [0.99, 1];
const CLIP_FRACTION = { x: 0.55, y: 0.60 };
const SETTLE_MS = 700;

const label = (stop) => (stop === 1 ? "1.0" : String(stop));

async function settle(page) {
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

/* Scroll so the ZeroMirror stage sits at stage-local `target`, then confirm
 * the bridge actually reports that progress. */
async function go(page, target) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate((progress) => {
      const { intro, lenis } = window.__buildanta;
      const raw = intro.rawForZeroStage(progress);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else scrollTo(0, y);
    }, target);
    await settle(page);
    const landed = await page.evaluate((progress) => {
      const api = window.__zeroMirrorStageBridge;
      const canvas = document.querySelector(".consult-zero__hand-canvas");
      return Boolean(api && canvas && canvas.width > 100 &&
        Math.abs(api.state.progress - progress) <= 0.0025 && api.state.opacity > 0.99 &&
        Number(getComputedStyle(canvas).opacity) > 0.99 && !document.querySelector(".preload"));
    }, target);
    if (landed) return;
  }
  const observed = await page.evaluate(() => {
    const api = window.__zeroMirrorStageBridge;
    return api ? { progress: api.state.progress, opacity: api.state.opacity } : null;
  });
  throw new Error(`stop ${target} did not land: ${JSON.stringify(observed)}`);
}

async function observe(page) {
  return page.evaluate(() => {
    const api = window.__zeroMirrorStageBridge;
    const fistBump = api.state.fistBump || null;
    let contactScreen = null;
    if (api.camera && fistBump?.contactPoint) {
      const point = api.camera.position.clone().fromArray(fistBump.contactPoint).project(api.camera);
      contactScreen = { x: (point.x * 0.5 + 0.5) * innerWidth, y: (0.5 - point.y * 0.5) * innerHeight };
    }
    return {
      progress: api.state.progress,
      bridgeProgress: api.state.bridgeProgress,
      opacity: api.state.opacity,
      bridgeReady: api.state.bridgeReady,
      loadErrors: api.state.loadErrors,
      fistBump,
      contactScreen,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    };
  });
}

function clipAround(center, viewport) {
  const width = Math.round(viewport.width * CLIP_FRACTION.x);
  const height = Math.round(viewport.height * CLIP_FRACTION.y);
  const x = Math.round(Math.min(Math.max(center.x - width / 2, 0), viewport.width - width));
  const y = Math.round(Math.min(Math.max(center.y - height / 2, 0), viewport.height - height));
  return { x, y, width, height };
}

async function session(browser, name, viewport, ratio) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: ratio,
    isMobile: name === "phone", hasTouch: name === "phone", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  const externalErrors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url || "";
    const external = /^https?:/.test(location) && new globalThis.URL(location).origin !== new globalThis.URL(URL).origin;
    (external ? externalErrors : errors).push(`console: ${message.text()} @ ${location || "unknown"}`);
  });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  try {
    await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready",
      null, { timeout: 90000 });
  } catch (error) {
    throw new Error(`[${name}] ZeroMirror bridge never became ready on ${URL}: ${error.message}`);
  }
  await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
  await page.evaluate(() => { window.__bbPinTime = 300000; });
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  return { context, page, errors, externalErrors };
}

function save(file, bytes) {
  fs.writeFileSync(file, bytes);
  console.log(`saved ${file}`);
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ["--use-angle=swiftshader"] });
  const manifest = { tag: TAG, url: URL, generatedAt: new Date().toISOString(), captures: [] };
  const problems = [];
  const warnings = [];

  async function capture(name, viewport, ratio, stops, mode) {
    console.log(`[zero-ending] ${name} ${viewport.width}x${viewport.height} @${ratio}`);
    const { context, page, errors, externalErrors } = await session(browser, name, viewport, ratio);
    try {
      for (const stop of stops) {
        await go(page, stop);
        const state = await observe(page);
        if (state.loadErrors?.length) {
          problems.push(`[${name} ${label(stop)}] loadErrors: ${JSON.stringify(state.loadErrors)}`);
        }
        const file = path.join(OUT, `${mode}-${label(stop)}.png`);
        let clip = null;
        if (mode === "contact") {
          const center = state.contactScreen || { x: viewport.width / 2, y: viewport.height / 2 };
          clip = clipAround(center, viewport);
          if (!state.contactScreen) warnings.push(`[contact ${label(stop)}] no projected contact point; used the viewport centre`);
        }
        save(file, await page.screenshot(clip ? { clip } : {}));
        manifest.captures.push({ mode, stop, file, clip, ...state });
      }
    } finally {
      await context.close();
    }
    problems.push(...errors.map((entry) => `[${name}] ${entry}`));
    warnings.push(...externalErrors.map((entry) => `[${name}] external: ${entry}`));
  }

  try {
    await capture("desktop", DESKTOP, 1.25, DESKTOP_STOPS, "desktop");
    await capture("contact", DESKTOP, 2, CLOSE_STOPS, "contact");
    await capture("phone", PHONE, 2, CLOSE_STOPS, "phone");
  } finally {
    await browser.close();
  }
  manifest.problems = problems;
  manifest.warnings = warnings;
  save(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  warnings.forEach((entry) => console.warn(`warning: ${entry}`));
  if (problems.length) {
    console.error("FAILED:\n" + problems.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`CLEAN - ${manifest.captures.length} captures in ${OUT}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
