/* Narrow entry-logo regression. --baseline preserves before-fix evidence;
 * --quick captures desktop .30 first, without the longer diagnostic sweep. */
const fs = require("fs");
const path = require("path");
const { decode } = require("./png.cjs");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright"))); }
const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const BASELINE = process.argv.includes("--baseline");
const QUICK = process.argv.includes("--quick");
const OUT = path.join(__dirname, "..", "shots-zero-stage", "coins", BASELINE ? "before" : "after");
const STOPS = QUICK ? [0.30] : [0.15, 0.22, 0.30, 0.38, 0.43];

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
          Number(getComputedStyle(canvas.parentElement).opacity) > .99 && !document.querySelector(".preload");
      }, target, { timeout: 5000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.evaluate((p) => {
        const { intro } = window.__buildanta;
        const y = intro.st.start + intro.rawForZeroStage(p) * (intro.st.end - intro.st.start);
        return Math.abs(scrollY - y) <= 2 && document.querySelector(".consult-zero__hand-canvas").width > 100;
      }, target)) return;
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error(`Unstable source frame ${target}`);
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
    const area = (p) => Math.abs(p.reduce((sum, a, i) => {
      const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - a[1] * b[0];
    }, 0)) / 2;
    const clip = (subject, boundary) => {
      let result = subject;
      for (let j = 0; j < boundary.length && result.length; j++) {
        const a = boundary[j], b = boundary[(j + 1) % boundary.length];
        const input = result; result = [];
        for (let i = 0; i < input.length; i++) {
          const p = input[i], q = input[(i + 1) % input.length];
          const dp = cross(a, b, p), dq = cross(a, b, q);
          if (dp >= 0) result.push(p);
          if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        }
      }
      return result;
    };
    api.scene.updateMatrixWorld(true);
    api.scene.traverse((mesh) => {
      if (!/^ZeroStageCoin\d+$/.test(mesh.name)) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const opacity = Math.max(...materials.map((m) => m.opacity));
      if (!mesh.visible || !mesh.parent.visible || opacity < .05) return;
      const position = mesh.geometry.attributes.position, point = api.camera.position.clone(), points = [];
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(api.camera);
        points.push([(point.x * .5 + .5) * innerWidth, (point.y * .5 + .5) * innerHeight]);
      }
      const polygon = hull(points);
      coins.push({ name: mesh.name, opacity, area: area(polygon), polygon,
        depthTest: materials.every((m) => m.depthTest), depthWrite: materials.every((m) => m.depthWrite) });
    });
    const overlaps = [];
    for (let a = 0; a < coins.length; a++) for (let b = a + 1; b < coins.length; b++) {
      const intersection = area(clip(coins[a].polygon, coins[b].polygon));
      if (intersection > .1) overlaps.push({ names: [coins[a].name, coins[b].name], pixels: intersection,
        fraction: intersection / Math.min(coins[a].area, coins[b].area) });
    }
    return { progress: api.state.progress, assetErrors: api.state.loadErrors, coins, overlaps };
  });
}

function difference(a, b) {
  let changed = 0;
  for (let i = 0; i < a.data.length; i += a.bpp) {
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]))) > 10) changed++;
  }
  return 100 * changed / (a.w * a.h);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=swiftshader"] });
  const report = { mode: BASELINE ? "before" : "after", generatedAt: new Date().toISOString(), runs: [] };
  const save = () => fs.writeFileSync(path.join(OUT, QUICK ? "report-quick.json" : "report.json"), JSON.stringify(report, null, 2));
  try {
    for (const config of [{ name: "desktop", width: 1072, height: 692, dpr: 1.25 }, ...(!QUICK ? [{ name: "phone", width: 390, height: 844, dpr: 2 }] : [])]) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === "phone", hasTouch: config.name === "phone" });
      const page = await context.newPage();
      const run = { config, samples: [], dense: [], reverse: [], errors: [], externalErrors: [], assertions: [] };
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
        for (const p of STOPS) {
          await seek(page, p);
          const capture = path.join(OUT, `${config.name}-p${Math.round(p * 1000)}.png`);
          const bytes = await page.screenshot({ scale: "css" }); fs.writeFileSync(capture, bytes);
          forwards.set(p, decode(bytes));
          run.samples.push({ requested: p, capture, ...await observe(page) }); save();
          console.log(`[coins] ${config.name} p=${p}: ${capture}`);
        }
        if (!QUICK) {
          for (const p of [.10, .11, .12, .13, .14, .16, .18, .20, .24, .26, .28, .32, .34, .36, .40, .42, .44, .45, .46, .47, .48, .49]) { await seek(page, p); run.dense.push({ requested: p, ...await observe(page) }); }
          for (const p of [...STOPS].reverse()) {
            await seek(page, p);
            const bytes = await page.screenshot({ scale: "css" });
            run.reverse.push({ progress: p, changed: difference(forwards.get(p), decode(bytes)) });
          }
          run.assertions.push({ name: "reverse scroll reproduces logo placement", pass: run.reverse.every((s) => s.changed <= .75) });
          run.assertions.push({ name: "source assets load at every requested sample", pass: [...run.samples, ...run.dense].every((s) => !s.assetErrors?.length && Math.abs(s.progress - s.requested) < .0025) });
        }
        run.assertions.push({ name: "visible logo faces and rims participate in scene depth", pass: run.samples.some((s) => s.coins.length > 0) && [...run.samples, ...run.dense].every((s) => s.coins.every((c) => c.depthTest && c.depthWrite)) });
        save();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ report: path.join(OUT, QUICK ? "report-quick.json" : "report.json"), runs: report.runs.map((r) => ({ config: r.config, assertions: r.assertions, errors: r.errors, maxOverlap: Math.max(0, ...[...r.samples, ...r.dense].flatMap((s) => s.overlaps.map((o) => o.fraction))) })) }, null, 2));
  if (report.runs.some((r) => r.errors.length || r.assertions.some((a) => !a.pass))) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
