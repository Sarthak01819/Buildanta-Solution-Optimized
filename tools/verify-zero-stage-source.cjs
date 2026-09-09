/* Current source-only animation contract. The prior merge tests remain
 * historical; this checks the original scene and its two-source-hand ending.
 * SITE_URL may target an immutable local verification snapshot.
 */
const fs = require("fs");
const path = require("path");
const { decode } = require("./png.cjs");
/* These captures judge the canvas, with all source copy/UI removed. An
 * unrelated downloadable font must not stall WebGL evidence collection. */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  "npm/node_modules/@playwright/cli/node_modules/playwright"))); }
const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const OUT = path.join(__dirname, "..", "shots-zero-stage", "source-ending");
const STOPS = [0.95, 0.965, 0.975, 0.99, 1];
const VISUAL_ONLY = process.argv.includes("--visual-only");
const SCOPE = VISUAL_ONLY ? "visual-and-accessibility-no-first-click-audio" : "full-source-contract";

function delta(a, b) {
  let changed = 0;
  let total = 0;
  for (let index = 0; index < a.data.length; index += a.bpp) {
    const r = Math.abs(a.data[index] - b.data[index]);
    const g = Math.abs(a.data[index + 1] - b.data[index + 1]);
    const blue = Math.abs(a.data[index + 2] - b.data[index + 2]);
    if (Math.max(r, g, blue) > 10) changed += 1;
    total += (r + g + blue) / 3;
  }
  return { changed: Number((100 * changed / (a.w * a.h)).toFixed(3)),
    mean: Number((total / (a.w * a.h)).toFixed(3)) };
}

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
    try {
      await page.waitForFunction((requested) => {
        const expected = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.95 : requested;
        const source = window.__zeroMirrorStageBridge;
        const intro = window.__buildanta?.intro;
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        const root = document.querySelector(".consult-zero");
        const expectedY = intro ? intro.st.start + intro.rawForZeroStage(requested) * (intro.st.end - intro.st.start) : -1;
        return source && canvas && root && Math.abs(scrollY - expectedY) <= 2 && canvas.width > 100 &&
          Math.abs(source.state.progress - expected) <= 0.0025 &&
          source.state.opacity > 0.99 && Number(getComputedStyle(canvas).opacity) > 0.99 &&
          Number(getComputedStyle(canvas.parentElement).opacity) > 0.99 &&
          Number(getComputedStyle(root).opacity) > 0.99 && !document.querySelector(".preload");
      }, target, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const stable = await page.evaluate((requested) => {
        const intro = window.__buildanta.intro;
        const expectedY = intro.st.start + intro.rawForZeroStage(requested) * (intro.st.end - intro.st.start);
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        return Math.abs(scrollY - expectedY) <= 2 && canvas.width > 100 &&
          Number(getComputedStyle(canvas).opacity) > 0.99;
      }, target);
      if (stable) return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error(`Stage ${target} did not retain its visible scroll position`);
}

async function state(page) {
  return page.evaluate(() => {
    const api = window.__zeroMirrorStageBridge;
    const visible = (object) => {
      for (let current = object; current; current = current.parent) if (!current.visible) return false;
      return Boolean(object);
    };
    const root = document.querySelector(".consult-zero");
    const canvas = document.querySelector(".consult-zero__hand-canvas");
    const box = canvas.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const clipPath = getComputedStyle(root).clipPath;
    let clipCoverage = { kind: clipPath, coversViewport: clipPath === "none" };
    const circle = clipPath.match(/^circle\(\s*([-\d.]+)(px|%)\s+at\s+([-\d.]+)(px|%)\s+([-\d.]+)(px|%)\s*\)$/);
    if (circle) {
      const radius = Number(circle[1]) * (circle[2] === "%"
        ? Math.hypot(rootBox.width, rootBox.height) / Math.SQRT2 / 100 : 1);
      const center = {
        x: rootBox.x + Number(circle[3]) * (circle[4] === "%" ? rootBox.width / 100 : 1),
        y: rootBox.y + Number(circle[5]) * (circle[6] === "%" ? rootBox.height / 100 : 1),
      };
      const requiredRadius = Math.max(...[[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]]
        .map(([x, y]) => Math.hypot(x - center.x, y - center.y)));
      clipCoverage = { kind: "circle", radius, center, requiredRadius,
        coversViewport: Number.isFinite(radius) && radius + 0.5 >= requiredRadius };
    }
    let meshContact = null;
    let poseProjection = null;
    const hands = api.state.fistBump?.hands;
    const project = (position) => {
      const point = api.camera.position.clone().fromArray(position).project(api.camera);
      return { x: (point.x * 0.5 + 0.5) * innerWidth, y: (0.5 - point.y * 0.5) * innerHeight };
    };
    if (hands?.length === 2) {
      const green = project(hands.find((hand) => hand.name === "green").wrist);
      const human = project(hands.find((hand) => hand.name === "human").wrist);
      const dx = human.x - green.x;
      const dy = human.y - green.y;
      const length = Math.hypot(dx, dy);
      poseProjection = { greenWrist: green, humanWrist: human,
        axis: { x: dx / length, y: dy / length }, length,
        angleDegrees: Math.atan2(dy, dx) * 180 / Math.PI };
    }
    if (api.state.fistBump?.curl >= 0.999 && poseProjection?.length > 1) {
      const contact = project(api.state.fistBump.contactPoint);
      const axis = poseProjection.axis;
      const bandPixels = Math.min(innerHeight * 0.025, poseProjection.length * 0.2);
      const edges = ["GreenHand", "HumanHand"].map((name) => {
        const alongAxis = [];
        api.scene.getObjectByName(name)?.traverse((mesh) => {
          if (!mesh.isSkinnedMesh) return;
          mesh.updateMatrixWorld(true);
          mesh.skeleton.update();
          const joints = new Set(mesh.skeleton.bones.flatMap((bone, index) =>
            /f_(index|middle)[._]?01/i.test(bone.name) ? [index] : []));
          const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
          const vertex = api.camera.position.clone();
          for (let index = 0; index < position.count; index += 1) {
            let weight = 0;
            for (let component = 0; component < 4; component += 1) {
              if (joints.has(skinIndex.getComponent(index, component))) weight += skinWeight.getComponent(index, component);
            }
            if (weight <= 0.25) continue;
            mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld).project(api.camera);
            const dx = (vertex.x * 0.5 + 0.5) * innerWidth - contact.x;
            const dy = (0.5 - vertex.y * 0.5) * innerHeight - contact.y;
            const perpendicular = -dx * axis.y + dy * axis.x;
            if (Math.abs(perpendicular) <= bandPixels) alongAxis.push(dx * axis.x + dy * axis.y);
          }
        });
        return { count: alongAxis.length, min: Math.min(...alongAxis), max: Math.max(...alongAxis) };
      });
      meshContact = { axis, contact, bandPixels, edges, gapPixels: edges[1].min - edges[0].max };
    }
    return {
      progress: api.state.progress,
      opacity: api.state.opacity,
      bridgeReady: api.state.bridgeReady,
      assetErrors: api.state.loadErrors,
      fistBump: api.state.fistBump,
      poseProjection,
      meshContact,
      sourceGreenVisible: visible(api.scene.getObjectByName("GreenHand")),
      sourceHumanVisible: visible(api.scene.getObjectByName("HumanHand")),
      legacyMounted: Boolean(window.__buildanta.meetRoot),
      clipPath,
      clipCoverage,
      canvas: { x: box.x, y: box.y, width: box.width, height: box.height },
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      pointer: { x: api.state.pointerX, y: api.state.pointerY },
      time: api.state.time,
    };
  });
}

async function snapshot(page, file) {
  const bytes = await page.screenshot({ scale: "css" });
  fs.writeFileSync(file, bytes);
  return decode(bytes);
}

async function session(browser, label, viewport, ratio, reduced = false, url = URL) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: ratio,
    isMobile: label.startsWith("phone"), hasTouch: label.startsWith("phone"),
    reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  const run = { label, viewport, ratio, samples: [], reverse: [], assertions: [], skippedChecks: [], errors: [], externalResourceErrors: [], failedRequests: [] };
  page.on("pageerror", (error) => run.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url || "";
    const external = /^https?:/.test(location) && new globalThis.URL(location).origin !== new globalThis.URL(URL).origin;
    (external ? run.externalResourceErrors : run.errors).push(`${message.text()} @ ${location || "unknown"}`);
  });
  page.on("requestfailed", (request) => run.failedRequests.push({
    url: request.url(), error: request.failure()?.errorText, type: request.resourceType(),
  }));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready",
    null, { timeout: 60000 });
  await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
  await page.evaluate(() => { window.__bbPinTime = 300000; });
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  return { context, page, run };
}

async function ending(browser, label, viewport, ratio) {
  console.log(`[source] ${label} ending`);
  const { context, page, run } = await session(browser, label, viewport, ratio);
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const forwards = new Map();
  try {
    for (const progress of STOPS) {
      await go(page, progress);
      const observed = await state(page);
      const file = path.join(dir, `p${Math.round(progress * 1000)}-forward.png`);
      forwards.set(progress, await snapshot(page, file));
      run.samples.push({ requested: progress, ...observed, capture: file });
      console.log(`[source] ${label} p=${progress} capture=${file}`);
    }
    run.assertions.push({ name: "default ending covers the full viewport after the circle reveal with no legacy meet",
      pass: run.samples.every((sample) => sample.clipCoverage.coversViewport && !sample.legacyMounted &&
        Math.abs(sample.canvas.x) <= 1 && Math.abs(sample.canvas.y) <= 1 &&
        Math.abs(sample.canvas.width - viewport.width) <= 1 && Math.abs(sample.canvas.height - viewport.height) <= 1),
      details: run.samples.map(({ requested, clipPath, clipCoverage }) => ({ progress: requested, clipPath, ...clipCoverage })) });
    run.assertions.push({ name: "both original source hands remain visible throughout the ending",
      pass: run.samples.every((sample) => sample.bridgeReady && sample.opacity > 0.99 &&
        sample.sourceGreenVisible && sample.sourceHumanVisible && !sample.assetErrors?.length &&
        Math.abs(sample.progress - sample.requested) <= 0.0025) });
    const closed = run.samples.find((sample) => sample.requested === 0.975);
    const contact = run.samples.find((sample) => sample.requested === 0.99);
    const knuckles = contact.fistBump?.hands?.map((hand) => hand.knuckle) || [];
    const separation = knuckles.length === 2 ? Math.hypot(...knuckles[0].map((value, index) => value - knuckles[1][index])) : null;
    run.assertions.push({ name: "both source rigs curl and meet at the authored contact",
      pass: closed.fistBump?.curl >= 0.999 && knuckles.length === 2 && separation <= 0.012,
      details: { closed: closed.fistBump, contact: contact.fistBump, separation } });
    const closedSamples = run.samples.filter((sample) => sample.requested >= 0.975);
    run.assertions.push({ name: "closed fists approach diagonally with the green wrist above-left of the human wrist",
      pass: closedSamples.every(({ poseProjection: pose }) => pose &&
        pose.greenWrist.x < pose.humanWrist.x && pose.greenWrist.y < pose.humanWrist.y &&
        pose.angleDegrees >= 15 && pose.angleDegrees <= 75),
      details: closedSamples.map(({ requested, poseProjection }) => ({ progress: requested, ...poseProjection })) });
    run.assertions.push({ name: "the actual skinned knuckle surfaces visibly meet at contact and endpoint",
      pass: run.samples.filter((sample) => sample.requested >= 0.99).every((sample) =>
        sample.meshContact?.edges.every((edge) => edge.count > 0) &&
        sample.meshContact.gapPixels <= 3 && sample.meshContact.gapPixels >= -6),
      details: run.samples.filter((sample) => sample.requested >= 0.99)
        .map(({ requested, meshContact }) => ({ progress: requested, ...meshContact })) });
    for (const progress of [...STOPS].reverse()) {
      await go(page, progress);
      const file = path.join(dir, `p${Math.round(progress * 1000)}-reverse.png`);
      const difference = delta(forwards.get(progress), await snapshot(page, file));
      run.reverse.push({ progress, difference });
    }
    run.assertions.push({ name: "reverse scroll reproduces every ending frame",
      pass: run.reverse.every((entry) => entry.difference.changed <= 0.75), details: run.reverse });
    if (VISUAL_ONLY) {
      run.skippedChecks.push({ name: "audio silently arms on the first trusted click",
        reason: "Explicit --visual-only scope: first-click audio is not assessed by this pose verification." });
    } else {
      const before = await page.evaluate(() => window.__zeroStageAudioDebug?.state);
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await page.waitForTimeout(1000);
      const after = await page.evaluate(() => window.__zeroStageAudioDebug?.state);
      run.assertions.push({ name: "audio silently arms on the first trusted click",
        pass: before?.armed === false && after?.armed === true &&
          Object.values(after?.channels || {}).every((channel) => channel.unlocked),
        details: { beforeArmed: before?.armed, afterArmed: after?.armed, channels: after?.channels } });
    }
  } finally { await context.close(); }
  return run;
}

async function reduced(browser) {
  const { context, page, run } = await session(browser, "reduced", { width: 1200, height: 590 }, 1, true);
  try {
    await go(page, 0.99);
    const before = await snapshot(page, path.join(OUT, "reduced-before.png"));
    await page.mouse.move(50, 50);
    await page.evaluate(() => { window.__bbPinTime += 5000; });
    await page.waitForTimeout(400);
    const after = await snapshot(page, path.join(OUT, "reduced-after.png"));
    const observed = await state(page);
    const audioAbsent = await page.evaluate(() => !window.__zeroStageAudioDebug);
    run.assertions.push({ name: "reduced motion stays static with no pointer motion or source audio",
      pass: delta(before, after).changed <= 0.05 && observed.progress === 0.95 &&
        observed.time === 0 && observed.pointer.x === 0 && observed.pointer.y === 0 && audioAbsent,
      details: { difference: delta(before, after), state: observed, audioAbsent } });
  } finally { await context.close(); }
  return run;
}

async function legacy(browser) {
  const url = new globalThis.URL(URL);
  url.searchParams.set("consultAnimation", "legacy");
  const { context, page, run } = await session(browser, "legacy", { width: 1200, height: 590 }, 1, false, url.href);
  try {
    await page.evaluate(() => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + intro.rawForP(0.84) * (intro.st.end - intro.st.start);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else scrollTo(0, y);
    });
    await page.waitForFunction("window.__buildanta?.meetRoot", null, { timeout: 60000 });
    await page.waitForTimeout(450);
    await snapshot(page, path.join(OUT, "legacy-backup.png"));
    const observed = await state(page);
    run.assertions.push({ name: "legacy query keeps the old pair available with source hidden",
      pass: observed.legacyMounted && observed.opacity < 0.001, details: observed });
  } finally { await context.close(); }
  return run;
}

function savePartial(runs) {
  fs.writeFileSync(path.join(OUT, "report-partial.json"), JSON.stringify({
    complete: false, scope: SCOPE, generatedAt: new Date().toISOString(), url: URL, runs,
  }, null, 2));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  const runs = [];
  try {
    if (process.argv.includes("--reduced-only")) {
      runs.push(await reduced(browser));
      savePartial(runs);
    } else if (process.argv.includes("--legacy-only")) {
      runs.push(await legacy(browser));
      savePartial(runs);
    } else {
      runs.push(await ending(browser, "desktop-1535x790-dpr1.25", { width: 1535, height: 790 }, 1.25));
      savePartial(runs);
      if (!process.argv.includes("--desktop-only")) {
        runs.push(await ending(browser, "phone-390x844-dpr2", { width: 390, height: 844 }, 2));
        savePartial(runs);
        runs.push(await reduced(browser));
        savePartial(runs);
        runs.push(await legacy(browser));
        savePartial(runs);
      }
    }
  } finally { await browser.close(); }
  const failures = runs.flatMap((run) => run.assertions.filter((assertion) => !assertion.pass)
    .map((assertion) => ({ label: run.label, ...assertion })));
  const errors = runs.flatMap((run) => run.errors);
  const report = { result: failures.length || errors.length ? "failed" : "passed",
    scope: SCOPE, generatedAt: new Date().toISOString(), url: URL, runs };
  const file = path.join(OUT, "report.json");
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, scope: SCOPE, report: file, failures, errors }, null, 2));
  if (report.result !== "passed") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
