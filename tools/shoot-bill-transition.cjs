/* Screenshot the bill transition (D-076: the reference's portal reveal over
 * the fist bump) at burnLocal stops for judging by eye.
 *
 *   node tools/shoot-bill-transition.cjs --tag impl-r1
 *   SITE_URL=http://127.0.0.1:5303/ node tools/shoot-bill-transition.cjs
 *
 * Output: shots-bill-transition/<tag>/
 *   desktop-<stop>.png   1535x790 @1.25  12 evenly spaced burnLocal stops from
 *                        0 to SETTLE_END (.285, where the existing burn begins)
 *   phone-<stop>.png     390x844 @2      4 stops
 *   manifest.json        intro.billTransition state at every capture, plus
 *                        (r2) the measured grade of the fists inside the
 *                        medallion wherever the circle is opaque (tone: lit /
 *                        shadow means over the projected ellipse, next to the
 *                        reference's own numbers from the mirror's F1) and the
 *                        orange-ember sample count at every stop
 *
 * Deterministic: time is pinned (window.__bbPinTime), the pointer is centred,
 * and every stop is a pure function of scroll position addressed through
 * intro.rawForBillTransition(local). Waits for intro.billTransition.ready and
 * for the portal's baked still (warns, does not fail, if the still never
 * lands). Exits non-zero if the scene never becomes ready, a stop does not
 * land, or the page throws. Judge the PNGs. */
const fs = require("fs");
const path = require("path");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  "npm/node_modules/@playwright/cli/node_modules/playwright"))); }

const { decode } = require("./png.cjs");
const { portalTone, emberSamples, ellipseFromNdc, channelDelta, REFERENCE } = require("./portal-tone.cjs");

const URL = process.env.SITE_URL || "http://127.0.0.1:5303/";
const MIRROR_F1 = process.env.MIRROR_F1 || path.join(process.env.LOCALAPPDATA || "",
  "Temp/claude/C--Users-sarth-Desktop-buildanta-site-handoff-buildanta-site-optimized/25fe4b97-cf9d-4d57-b906-5ad370d884b8/scratchpad/mirror-frames/f-07053.png");
const tagIndex = process.argv.indexOf("--tag");
const TAG = tagIndex >= 0 && process.argv[tagIndex + 1] ? process.argv[tagIndex + 1] : "shots";
const OUT = path.join(__dirname, "..", "shots-bill-transition", TAG);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DESKTOP = { width: 1535, height: 790 };
const PHONE = { width: 390, height: 844 };
const SETTLE_END = 0.285;   // mirrBillBurn SETTLE_END (hero burnStart) — the existing burn starts here
const DESKTOP_STOPS = Array.from({ length: 12 }, (_, i) => Number((i / 11 * SETTLE_END).toFixed(4)));
const PHONE_STOPS = [0.015, 0.03, 0.105, SETTLE_END];
const SETTLE_MS = 500;

const label = (stop) => stop.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");

async function settle(page) {
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function go(page, target) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((local) => {
      const { intro, lenis } = window.__buildanta;
      const raw = intro.rawForBillTransition(local);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else scrollTo(0, y);
    }, target);
    if (attempt === 0) {
      await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready
        || window.__buildanta.intro.billTransition.failed, null, { timeout: 60000 });
    }
    await settle(page);
    const landed = await page.evaluate((local) => {
      const bill = window.__buildanta.intro.billTransition;
      return Boolean(bill.ready && bill.scene && Math.abs(bill.scene.progress - local) <= 0.0025
        && !document.querySelector(".preload"));
    }, target);
    if (landed) return;
  }
  const observed = await page.evaluate(() => {
    const bill = window.__buildanta.intro.billTransition;
    return { ready: bill.ready, failed: bill.failed, progress: bill.scene?.progress };
  });
  throw new Error(`stop ${target} did not land: ${JSON.stringify(observed)}`);
}

async function observe(page) {
  return page.evaluate(() => {
    const bill = window.__buildanta.intro.billTransition;
    const scene = bill.scene || null;
    const canvas = document.querySelector(".intro__burning-franklin");
    return {
      ready: bill.ready,
      failed: bill.failed,
      // bill copy removed 10 Sep 2026 at the client's request (D-076): any trace is a regression
      copyTrace: document.querySelectorAll(".intro__bill-copy").length + ("copy" in bill ? 1 : 0),
      portalStillBaked: bill.portalStillBaked,
      canvasOpacity: canvas ? Number(getComputedStyle(canvas).opacity) : null,
      handsOpacity: window.__zeroMirrorStageBridge?.state.opacity ?? null,
      starOpacity: Number(document.querySelector(".consult-zero")?.style.getPropertyValue("--star-in")) || 0,
      sky: bill.sky,
      plateOpacity: (() => {
        const wrap = document.querySelector(".intro__portalwrap");
        return wrap && wrap.classList.contains("bg") ? Number(getComputedStyle(wrap, "::after").opacity) : null;
      })(),
      scene: scene && {
        progress: scene.progress, sourceProgress: scene.sourceProgress, phase: scene.phase,
        opacity: scene.opacity, fov: scene.fov, baseFov: scene.baseFov, lensBlend: scene.lensBlend,
        portal: scene.portal, portalBounds: scene.portalBounds, embers: scene.embers, lens: scene.lens,
        cameraPosition: scene.cameraPosition, cameraRoll: scene.cameraRoll,
        coversViewport: scene.coverBounds?.coversViewport ?? null,
        visibleNotes: scene.visibleNotes, heroBurn: scene.notePoses?.[0]?.burnProgress ?? null,
        heroWave: scene.notePoses?.[0]?.waveAmplitude ?? null, seedSource: scene.seedSource,
      },
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    };
  });
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

/* The fists' grade inside the medallion, measured on the capture the way the
   reference was measured (tools/portal-tone.cjs), wherever the circle is
   opaque; the ember predicate everywhere. */
function measure(bytes, state) {
  const img = decode(bytes);
  const result = { emberSamples: emberSamples(img) };
  const portal = state.scene?.portal;
  const bounds = state.scene?.portalBounds;
  // the canvas is at .95 on the .0259 stop (the dissolve ends at .03): a 5 %
  // bleed of the raw live fists, measured anyway so the judge's stop is covered
  if (portal && portal.opacity > .98 && portal.still === "zero-stage" && bounds && state.canvasOpacity >= .9) {
    const ellipse = ellipseFromNdc(bounds, img.w, img.h);
    const tone = portalTone(img, { ellipse });
    result.tone = {
      ellipse, lit: tone.lit, shadow: tone.shadow, area: tone.area,
      litDelta: channelDelta(tone.lit.mean, REFERENCE.lit),
      shadowDelta: channelDelta(tone.shadow.mean, REFERENCE.shadow),
    };
  }
  return result;
}

function describeTone(tone) {
  if (!tone) return "";
  const fmt = (set, target, delta) => set.mean
    ? `${set.hex} (n ${set.n}, vs ${target} ${JSON.stringify(delta)})` : "EMPTY";
  return `lit ${fmt(tone.lit, REFERENCE.lit, tone.litDelta)}; shadow ${fmt(tone.shadow, REFERENCE.shadow, tone.shadowDelta)}`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ["--use-angle=swiftshader"] });
  const manifest = { tag: TAG, url: URL, generatedAt: new Date().toISOString(), captures: [] };
  const problems = [];
  const warnings = [];
  if (fs.existsSync(MIRROR_F1)) {
    const img = decode(fs.readFileSync(MIRROR_F1));
    const tone = portalTone(img, { box: REFERENCE.handBox });
    manifest.reference = { file: MIRROR_F1, box: REFERENCE.handBox, lit: tone.lit, shadow: tone.shadow,
      emberSamples: emberSamples(img), targets: { lit: REFERENCE.lit, shadow: REFERENCE.shadow } };
    console.log(`[bill-transition] reference F1 hand: lit ${tone.lit.hex} (n ${tone.lit.n}), shadow ${tone.shadow.hex} (n ${tone.shadow.n}); targets ${REFERENCE.lit} / ${REFERENCE.shadow}`);
  } else warnings.push(`mirror F1 not found at ${MIRROR_F1}; reference tone not measured`);

  async function capture(name, viewport, ratio, stops) {
    console.log(`[bill-transition] ${name} ${viewport.width}x${viewport.height} @${ratio}`);
    const { context, page, errors, externalErrors } = await session(browser, name, viewport, ratio);
    try {
      // Park before the beat so the burn scene mounts and the still bakes.
      await go(page, 0);
      try {
        await page.waitForFunction(() => window.__buildanta.intro.billTransition.portalStillBaked,
          null, { timeout: 20000 });
      } catch {
        warnings.push(`[${name}] the portal still never baked; frames show leather only`);
      }
      for (const stop of stops) {
        await go(page, stop);
        const state = await observe(page);
        if (state.failed) problems.push(`[${name} ${label(stop)}] bill transition failed to load`);
        const file = path.join(OUT, `${name}-${label(stop)}.png`);
        const bytes = await page.screenshot();
        save(file, bytes);
        const measured = measure(bytes, state);
        if (measured.tone) console.log(`  [${name} ${label(stop)}] medallion fists: ${describeTone(measured.tone)}`);
        console.log(`  [${name} ${label(stop)}] orange ember samples: ${measured.emberSamples}`);
        manifest.captures.push({ mode: name, stop, file, ...state, ...measured });
      }
    } finally {
      await context.close();
    }
    problems.push(...errors.map((entry) => `[${name}] ${entry}`));
    warnings.push(...externalErrors.map((entry) => `[${name}] external: ${entry}`));
  }

  try {
    await capture("desktop", DESKTOP, 1.25, DESKTOP_STOPS);
    await capture("phone", PHONE, 2, PHONE_STOPS);
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
