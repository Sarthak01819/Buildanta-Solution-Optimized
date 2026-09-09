/* Geometry-only responsive verification. No render settings or scene timing
 * are overridden. SITE_URL can point at the untouched copy for comparison. */
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const { chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright"));
const URL = process.env.SITE_URL || "http://127.0.0.1:5174/";
const OUT = process.env.AUDIT_OUT || path.join(__dirname, "../shots-optimized/responsive", process.env.AUDIT_LABEL || "optimized");
const configs = [
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "tablet-portrait", width: 768, height: 1024, touch: true },
  { name: "tablet-landscape", width: 1024, height: 768, touch: true },
  { name: "desktop", width: 1440, height: 900, touch: false },
].filter(config => !process.env.AUDIT_CONFIGS || process.env.AUDIT_CONFIGS.split(",").includes(config.name));
const report = { url: URL, runs: [], failures: [] };
function check(name, value) { if (!value) report.failures.push(name); }
async function seek(page, value, source = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const y = await page.evaluate(({ value, source }) => {
      const { intro, lenis } = window.__buildanta;
      const raw = source ? intro.rawForZeroStage(value) : intro.rawForP(value);
      const y = intro.st.start + raw * (intro.st.end - intro.st.start);
      lenis.scrollTo(y, { immediate: true, force: true });
      return y;
    }, { value, source });
    try {
      await page.waitForFunction(({ value, source, y }) => Math.abs(scrollY - y) < 2 && Math.abs((source
        ? window.__zeroMirrorStageBridge.state.progress : window.__buildanta.intro.progress) - value) < .003,
      { value, source, y }, { timeout: 4000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
async function observe(page, selectors) {
  return page.evaluate(selectors => {
    const visible = el => {
      let opacity = 1;
      for (let node = el; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        if (css.display === "none" || css.visibility === "hidden") return false;
        opacity *= Number(css.opacity);
      }
      return opacity > .01;
    };
    return { width: innerWidth, height: innerHeight, pageOverflow: document.documentElement.scrollWidth - innerWidth,
      elements: selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(el => {
        const box = el.getBoundingClientRect(), css = getComputedStyle(el);
        return { selector, text: el.textContent.replace(/\s+/g, " ").trim(), visible: visible(el),
          x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
          font: css.fontFamily, color: css.color,
          inside: box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 };
      })) };
  }, selectors);
}
async function capture(page, run, name, selectors) {
  const sample = { name, ...await observe(page, selectors) };
  run.samples.push(sample);
  const expected = name.endsWith("rotated") ? [run.height, run.width] : [run.width, run.height];
  check(`${run.name}/${name}: requested viewport preserved`, sample.width === expected[0] && sample.height === expected[1]);
  check(`${run.name}/${name}: no horizontal page overflow`, sample.pageOverflow <= 1);
  for (const el of sample.elements.filter(el => el.visible)) check(`${run.name}/${name}: ${el.selector} fits`, el.inside);
  await page.screenshot({ path: path.join(OUT, `${run.name}-${name}.png`) });
  return sample;
}
async function compareDesktop(browser) {
  const { decode } = require("./png.cjs");
  const pairs = [];
  for (const [name, url] of [["original", process.env.ORIGINAL_URL || "http://127.0.0.1:5173/"], ["optimized", URL]]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && !document.querySelector(".preload"), null, { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      const opening = await observe(page, [".intro__titleMark", ".intro__titleKicker", ".intro__skip", ".intro__count"]);
      // Both pages use the existing regression-test clock contract. Scroll
      // boundaries, effects, framebuffer dimensions and shader settings stay real.
      await page.evaluate(() => { window.__bbPinTime = 300000; });
      await seek(page, .99, true);
      await page.waitForTimeout(200);
      const scale = await observe(page, [".consult-meet__title", ".consult-meet__title strong", ".consult-meet__title p"]);
      const scene = await page.evaluate(() => {
        const api = window.__zeroMirrorStageBridge;
        api.scene.updateMatrixWorld(true);
        const hands = {};
        for (const name of ["GreenHand", "HumanHand"]) {
          const hand = api.scene.getObjectByName(name);
          hands[name] = hand?.matrixWorld.toArray();
          hand?.traverse(mesh => mesh.skeleton?.bones.forEach(bone => { hands[`${name}/${bone.name}`] = bone.matrixWorld.toArray(); }));
        }
        const canvas = document.querySelector(".consult-zero__hand-canvas");
        return { camera: [...api.camera.matrixWorld.elements, ...api.camera.projectionMatrix.elements], hands,
          framebuffer: [canvas.width, canvas.height] };
      });
      const bytes = await page.screenshot({ path: path.join(OUT, `desktop-source-${name}.png`) });
      pairs.push({ opening, scale, scene, pixels: decode(bytes) });
    } finally { await page.close(); }
  }
  const [original, optimized] = pairs;
  const delta = (a, b) => {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
    const keys = Object.keys(a || {});
    return keys.length === Object.keys(b || {}).length ? Math.max(0, ...keys.map(key => delta(a[key], b[key]))) : Infinity;
  };
  let pixelsChanged = 0;
  for (let i = 0; i < original.pixels.data.length; i += original.pixels.bpp) {
    if ([0, 1, 2].some(channel => Math.abs(original.pixels.data[i + channel] - optimized.pixels.data[i + channel]) > 10)) pixelsChanged++;
  }
  report.desktopComparison = {
    openingIdentical: JSON.stringify(original.opening) === JSON.stringify(optimized.opening),
    scaleTypographyIdentical: JSON.stringify(original.scale) === JSON.stringify(optimized.scale),
    sceneDelta: delta(original.scene, optimized.scene),
    changedPixelPercent: 100 * pixelsChanged / (original.pixels.w * original.pixels.h),
  };
  check("desktop opening typography and geometry unchanged", report.desktopComparison.openingIdentical);
  check("desktop WE SCALE typography and geometry unchanged", report.desktopComparison.scaleTypographyIdentical);
  check("desktop source camera, hands and framebuffer unchanged", report.desktopComparison.sceneDelta < 1e-6);
  check("desktop source screenshot unchanged", report.desktopComparison.changedPixelPercent <= .75);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  try {
    for (const config of configs) {
      const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, isMobile: config.touch, hasTouch: config.touch });
      const run = { name: config.name, width: config.width, height: config.height, samples: [], errors: [] }; report.runs.push(run);
      page.on("pageerror", error => run.errors.push(error.message));
      page.on("crash", () => run.errors.push("browser renderer crashed"));
      try {
        await page.goto(URL);
        await page.waitForFunction(() => window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && !document.querySelector(".preload"), null, { timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        await capture(page, run, "opening", [".intro__titleMark", ".intro__titleKicker", ".intro__mark", ".intro__skip", ".intro__count"]);
        await seek(page, .125);
        await capture(page, run, "idea", [".step--idea .step__t", ".step--idea .step__s"]);
        await seek(page, .355);
        await capture(page, run, "code", [".step--code .step__t", ".step--code .step__s"]);
        await seek(page, .99, true);
        const scale = await capture(page, run, "we-scale", [".consult-meet__title", ".consult-meet__title strong", ".consult-meet__title p"]);
        check(`${run.name}: WE SCALE remains visible`, scale.elements.every(el => el.visible));
        check(`${run.name}: Instrument Serif preserved`, scale.elements.find(el => el.selector.endsWith("strong"))?.font.includes("Instrument Serif"));
        if (config.touch) {
          await page.setViewportSize({ width: config.height, height: config.width });
          await page.waitForTimeout(350);
          await seek(page, .99, true);
          await capture(page, run, "we-scale-rotated", [".consult-meet__title", ".consult-meet__title strong", ".consult-meet__title p"]);
          await page.setViewportSize({ width: config.width, height: config.height });
          await page.waitForTimeout(350);
          await seek(page, .99, true);
        }
        await seek(page, 1);
        await page.waitForFunction(() => document.querySelector(".intro__portalwrap.on"), null, { timeout: 30000 });
        await page.waitForFunction(() => window.__bhp?.state?.().phase === "idle", null, { timeout: 15000 });
        await page.mouse.move(config.width - 30, config.height - 100);
        await page.mouse.down();
        await page.waitForSelector(".bh-portal", { timeout: 12000 });
        await page.mouse.up();
        const portal = await capture(page, run, "portal-armed", [".bh-portal", ".bh-credit"]);
        check(`${run.name}: ENTER has a usable touch target`, portal.elements.find(el => el.selector === ".bh-portal")?.width >= 44);
        check(`${run.name}: ENTER receives keyboard focus`, await page.evaluate(() => document.activeElement?.matches(".bh-portal")));
        if (config.touch) {
          await page.setViewportSize({ width: config.height, height: config.width });
          await page.waitForTimeout(300);
          const rotated = await capture(page, run, "portal-rotated", [".bh-portal", ".bh-credit"]);
          check(`${run.name}: ENTER survives orientation`, rotated.elements.some(el => el.selector === ".bh-portal" && el.visible && el.inside));
          await page.setViewportSize({ width: config.width, height: config.height });
          await page.waitForTimeout(300);
        }
        check(`${run.name}: no runtime errors`, run.errors.length === 0);
        console.log(`${config.name}: responsive snapshots complete`);
      } catch (error) {
        if (!page.isClosed()) console.log(JSON.stringify(await page.evaluate(() => ({ progress: window.__buildanta?.intro?.progress,
          sourceProgress: window.__zeroMirrorStageBridge?.state.progress, viewport: [innerWidth, innerHeight],
          burnReady: window.__buildanta?.intro?.billTransition.ready, portal: window.__bhp?.state?.() })).catch(() => ({ unavailable: true }))));
        throw error;
      } finally {
        await page.close();
        fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
      }
    }
    if (process.env.AUDIT_COMPARE_DESKTOP) await compareDesktop(browser);
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
  console.log(JSON.stringify({ output: OUT, failures: report.failures }));
  if (!process.env.AUDIT_ALLOW_FAILURES) assert.deepEqual(report.failures, []);
})().catch(error => { console.error(error); process.exitCode = 1; });
