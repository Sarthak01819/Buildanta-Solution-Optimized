/* Contact sheet: our bill-transition entry (D-076) next to the zero.university
 * mirror's F1..F5, for Yash to judge.
 *
 *   node tools/shoot-bill-portal.cjs --tag r1
 *   SITE_URL=http://127.0.0.1:5303/ MIRROR_FRAMES=<dir with f-07053.png ...> node tools/shoot-bill-portal.cjs
 *
 * Output: shots-bill-portal/<tag>/
 *   desktop-f{1..5}.png   1535x790 @1.25 (the mirror capture size) at
 *                         burnLocal .03 / .066 / .105 / .141 / .20
 *   phone-f{1..5}.png     390x844 @2, same stops
 *   sheet.png             mirror F1..F5 (top row, when MIRROR_FRAMES resolves)
 *                         over ours (desktop, then phone)
 *   manifest.json
 * Judge the PNGs; the pane cannot paint WebGL here. */
const fs = require("fs");
const path = require("path");
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  "npm/node_modules/@playwright/cli/node_modules/playwright"))); }

const URL = process.env.SITE_URL || "http://127.0.0.1:5303/";
const tagIndex = process.argv.indexOf("--tag");
const TAG = tagIndex >= 0 && process.argv[tagIndex + 1] ? process.argv[tagIndex + 1] : "shots";
const OUT = path.join(__dirname, "..", "shots-bill-portal", TAG);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const MIRROR_DIR = process.env.MIRROR_FRAMES
  || path.join(process.env.LOCALAPPDATA || "", "Temp/claude/C--Users-sarth-Desktop-buildanta-site-handoff-buildanta-site-optimized/25fe4b97-cf9d-4d57-b906-5ad370d884b8/scratchpad/mirror-frames");
const MIRROR_FRAMES = ["f-07053.png", "f-07194.png", "f-07335.png", "f-07473.png", "f-07611.png"];
const STOPS = [[0.03, "f1"], [0.066, "f2"], [0.105, "f3"], [0.141, "f4"], [0.20, "f5"]];
const DESKTOP = { width: 1535, height: 790 };
const PHONE = { width: 390, height: 844 };

async function settle(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function go(page, target) {
  await page.waitForFunction(() => !document.querySelector(".preload"), null, { timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((local) => {
      const { intro, lenis } = window.__buildanta;
      const raw = intro.rawForBillTransition(local);
      lenis.scrollTo(intro.st.start + raw * (intro.st.end - intro.st.start), { immediate: true, force: true });
    }, target);
    if (attempt === 0) {
      await page.waitForFunction(() => window.__buildanta.intro.billTransition.ready
        || window.__buildanta.intro.billTransition.failed, null, { timeout: 60000 });
    }
    await settle(page);
    const landed = await page.evaluate((local) => {
      const bill = window.__buildanta.intro.billTransition;
      return Boolean(bill.ready && bill.scene && Math.abs(bill.scene.progress - local) <= 0.0025);
    }, target);
    if (landed) return;
  }
  throw new Error(`stop ${target} did not land`);
}

async function session(browser, name, viewport, ratio) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: ratio,
    isMobile: name === "phone", hasTouch: name === "phone", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction("window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready",
    null, { timeout: 90000 });
  await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
  await page.evaluate(() => { window.__bbPinTime = 300000; });
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  return { context, page, errors };
}

const toUrl = (p) => "file:///" + path.resolve(p).replace(/\\/g, "/").replace(/^\/+/, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function sheet(browser, rows, file) {
  const cell = 380;
  const rowsHtml = rows.map((row) => `<h2>${esc(row.title)}</h2><div class="grid">${row.items.map((item) => (
    `<figure><img src="${toUrl(item.file)}"><figcaption>${esc(item.label)}</figcaption></figure>`
  )).join("")}</div>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#101214;color:#eee;font:14px/1.35 system-ui,Segoe UI,sans-serif;padding:18px}
    h2{font-size:16px;margin:14px 0 8px;font-weight:600;color:#cfd6dd}
    .grid{display:grid;grid-template-columns:repeat(5,${cell}px);gap:10px;align-items:start}
    figure{margin:0;background:#1b1e22;border-radius:6px;overflow:hidden}
    img{display:block;width:${cell}px;height:auto}
    figcaption{padding:6px 8px;font-size:12px;color:#dfe3e8}
  </style><body><h1 style="font-size:18px;margin:0 0 6px">Bill transition entry — mirror F1..F5 vs ours (D-076)</h1>${rowsHtml}</body>`;
  const tmp = file.replace(/\.png$/, ".html");
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage({ viewport: { width: 5 * (cell + 10) + 40, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(toUrl(tmp), { waitUntil: "load" });
  await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => null))));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  fs.unlinkSync(tmp);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ["--use-angle=swiftshader"] });
  const manifest = { tag: TAG, url: URL, generatedAt: new Date().toISOString(), captures: [], problems: [], warnings: [] };
  const rows = [];

  const mirror = MIRROR_FRAMES.map((name) => path.join(MIRROR_DIR, name));
  if (mirror.every((file) => fs.existsSync(file))) {
    rows.push({ title: "zero.university mirror (1535x790 @1.25)", items: mirror.map((file, i) => ({ label: `F${i + 1} ${path.basename(file)}`, file })) });
  } else {
    manifest.warnings.push(`mirror frames not found under ${MIRROR_DIR}; sheet has our rows only`);
  }

  async function capture(name, viewport, ratio) {
    console.log(`[bill-portal] ${name} ${viewport.width}x${viewport.height} @${ratio}`);
    const { context, page, errors } = await session(browser, name, viewport, ratio);
    const items = [];
    try {
      await go(page, 0);
      try {
        await page.waitForFunction(() => window.__buildanta.intro.billTransition.portalStillBaked, null, { timeout: 20000 });
      } catch { manifest.warnings.push(`[${name}] the portal still never baked; frames show leather only`); }
      for (const [stop, label] of STOPS) {
        await go(page, stop);
        const file = path.join(OUT, `${name}-${label}.png`);
        fs.writeFileSync(file, await page.screenshot());
        const state = await page.evaluate(() => {
          const bill = window.__buildanta.intro.billTransition;
          return { progress: bill.scene.progress, t: bill.scene.sourceProgress, phase: bill.scene.phase,
            portal: bill.scene.portal, copy: bill.copy, cameraRoll: bill.scene.cameraRoll, cameraZ: bill.scene.cameraPosition[2] };
        });
        manifest.captures.push({ mode: name, stop, label, file, ...state });
        items.push({ label: `${label.toUpperCase()} b ${stop} (t ${state.t.toFixed(3)}, portal ${state.portal.opacity.toFixed(2)}, copy ${state.copy.toFixed(2)})`, file });
        console.log(`saved ${file}`);
      }
    } finally { await context.close(); }
    manifest.problems.push(...errors.map((entry) => `[${name}] ${entry}`));
    rows.push({ title: `ours — ${name} ${viewport.width}x${viewport.height} @${ratio}`, items });
  }

  try {
    await capture("desktop", DESKTOP, 1.25);
    await capture("phone", PHONE, 2);
    await sheet(browser, rows, path.join(OUT, "sheet.png"));
    console.log(`saved ${path.join(OUT, "sheet.png")}`);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  manifest.warnings.forEach((entry) => console.warn(`warning: ${entry}`));
  if (manifest.problems.length) { console.error("FAILED:\n" + manifest.problems.join("\n")); process.exitCode = 1; return; }
  console.log(`CLEAN - ${manifest.captures.length} captures + sheet in ${OUT}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
