/* Contact frames of the TAP & HOLD button riding the portal's hole (D-077),
 * for Yash to judge.
 *
 *   node tools/shoot-portal-hold.cjs --tag r1
 *   SITE_URL=http://127.0.0.1:5303/ node tools/shoot-portal-hold.cjs --tag r1
 *
 * Output: shots-portal-hold/<tag>/
 *   desktop-rest.png        1535x790 @1.25 — at the wall, nobody has touched
 *                           anything: the hole drifts, the button sits in it
 *   desktop-follow-ul.png   pointer moved to the upper-left, hole + button there
 *   desktop-follow-lr.png   pointer moved to the lower-right
 *   desktop-hold-mid.png    pointer held on the button, ring half full (c ≈ .5)
 *   desktop-armed.png       full hold: the module's ENTER door, hold button gone
 *   phone-rest.png          390x844 @2 at rest
 *   phone-hold-mid.png      390x844 @2 mid-hold
 *   manifest.json           per frame: hole centre vs button centre (px), phase, c
 * The module is paused for each capture so the hole and the button are
 * measured and shot on the same frame. Judge the PNGs; the pane cannot paint
 * WebGL here. */
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
const OUT = path.join(__dirname, "..", "shots-portal-hold", TAG);
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DESKTOP = { width: 1535, height: 790 };
const PHONE = { width: 390, height: 844 };

const sleep = (page, ms) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);
const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function session(browser, name, viewport, ratio) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: ratio,
    isMobile: name === "phone", hasTouch: name === "phone", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  if (!/^buildanta solutions/i.test(await page.title())) throw new Error("WRONG SERVER");
  await page.waitForFunction("window.__buildanta && window.__buildanta.intro", null, { timeout: 30000 });
  await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
  await sleep(page, 1200);
  return { context, page, errors };
}

const goRaw = (page, f) => page.evaluate((raw) => {
  const { intro, lenis } = window.__buildanta;
  const y = intro.st.start + (intro.st.end - intro.st.start) * raw;
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}, f);

/* Reach the wall WITHOUT moving the pointer, so the hole is in its natural
   drifting state (the module drifts until the first pointermove). */
async function toWall(page) {
  const WALL = await page.evaluate("window.__buildanta.intro.wallRaw");
  await goRaw(page, WALL - 0.02);
  await page.waitForFunction(() => {
    const b = window.__buildanta.intro.billTransition;
    return !b || b.ready || b.failed;
  }, null, { timeout: 60000 });
  await sleep(page, 300);
  await goRaw(page, WALL + 0.004);
  await page.waitForFunction('document.querySelector(".intro__portalwrap")?.classList.contains("on")', null, { timeout: 5000 });
  await page.waitForFunction("window.__bhp && window.__bhp.ready === true", null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.querySelector(".intro__portalwrap .bh-hold");
    return el && !el.classList.contains("is-off") && parseFloat(getComputedStyle(el).opacity) > 0.95;
  }, null, { timeout: 4000 });
  await sleep(page, 1600);   // the canvas fades in over the CSS sky (1.5 s)
}

const observe = (page) => page.evaluate(() => {
  const s = window.__bhp.state();
  const el = document.querySelector(".intro__portalwrap .bh-hold");
  const r = el ? el.getBoundingClientRect() : null;
  const door = document.querySelector(".bh-portal");
  const d = door ? door.getBoundingClientRect() : null;
  const hole = [s.x / s.dpr, (s.size - s.y) / s.dpr];
  const btn = r ? [r.left + r.width / 2, r.top + r.height / 2] : null;
  return {
    phase: s.phase, c: s.c, down: s.down, holdT: s.holdT, moved: s.moved,
    hole, button: btn, holdVisible: Boolean(el) && !el.classList.contains("is-off") && parseFloat(getComputedStyle(el).opacity) > 0.5,
    holdOpacity: el ? parseFloat(getComputedStyle(el).opacity) : null,
    ring: el ? parseFloat(el.dataset.c || "0") : null,
    holding: Boolean(el && el.classList.contains("is-hold")),
    door: d ? [d.left + d.width / 2, d.top + d.height / 2] : null,
    followErr: btn ? Math.hypot(btn[0] - hole[0], btn[1] - hole[1]) : null,
  };
});

/* Freeze the module on the current frame, let the button catch up (its own
   rAF reads the module's state), capture, then let the module run again. */
async function frozenShot(page, file) {
  await page.evaluate(() => window.__bhp.pause());
  await twoFrames(page);
  const state = await observe(page);
  fs.writeFileSync(file, await page.screenshot({ timeout: 60000 }));
  await page.evaluate(() => window.__bhp.resume());
  console.log(`saved ${file}  phase ${state.phase} c ${state.c.toFixed(3)} hole (${state.hole.map((v) => v.toFixed(1))}) button (${state.button ? state.button.map((v) => v.toFixed(1)) : "-"}) err ${state.followErr === null ? "-" : state.followErr.toFixed(2)} px`);
  return state;
}

/* Hold ON the button until the ring is about half full. Real pointerdown at
   the button's centre (the module winds on the wrap; the button is
   pointer-events none), then the module is stepped one frame at a time so
   the stop is c ≈ .5 whatever the machine's frame rate. */
async function holdToHalf(page) {
  const before = await observe(page);
  await page.mouse.move(before.button[0], before.button[1]);
  await page.mouse.down();
  await page.evaluate(() => {
    window.__bhp.pause();
    for (let i = 0; i < 400 && window.__bhp.state().c < 0.5; i += 1) window.__bhp.step(1);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ["--use-angle=swiftshader"] });
  const manifest = { tag: TAG, url: URL, generatedAt: new Date().toISOString(), captures: [], problems: [] };

  async function capture(name, viewport, ratio, full) {
    console.log(`[portal-hold] ${name} ${viewport.width}x${viewport.height} @${ratio}`);
    const { context, page, errors } = await session(browser, name, viewport, ratio);
    const add = (label, state) => manifest.captures.push({ mode: name, label, file: path.join(OUT, `${name}-${label}.png`), ...state });
    try {
      await toWall(page);
      add("rest", await frozenShot(page, path.join(OUT, `${name}-rest.png`)));
      if (full) {
        const settle = () => page.evaluate(() => { window.__bhp.step(90); });
        await page.mouse.move(viewport.width * 0.22, viewport.height * 0.24, { steps: 6 });
        await settle();
        add("follow-ul", await frozenShot(page, path.join(OUT, `${name}-follow-ul.png`)));
        await page.mouse.move(viewport.width * 0.78, viewport.height * 0.76, { steps: 6 });
        await settle();
        add("follow-lr", await frozenShot(page, path.join(OUT, `${name}-follow-lr.png`)));
      }
      await holdToHalf(page);
      await twoFrames(page);
      const mid = await observe(page);
      fs.writeFileSync(path.join(OUT, `${name}-hold-mid.png`), await page.screenshot({ timeout: 60000 }));
      console.log(`saved ${path.join(OUT, `${name}-hold-mid.png`)}  phase ${mid.phase} c ${mid.c.toFixed(3)} ring ${mid.ring} err ${mid.followErr.toFixed(2)} px`);
      add("hold-mid", mid);
      await page.evaluate(() => window.__bhp.resume());
      await page.mouse.up();
      if (full) {
        await page.waitForFunction(() => window.__bhp.state().phase === "idle", null, { timeout: 4000 });
        await page.evaluate(() => { window.__bhp.press(); window.__bhp.step(175); });
        await page.waitForFunction(() => {
          const el = document.querySelector(".intro__portalwrap .bh-hold");
          return document.querySelector(".bh-portal") && el && parseFloat(getComputedStyle(el).opacity) < 0.02;
        }, null, { timeout: 3000 });
        await sleep(page, 300);
        add("armed", await frozenShot(page, path.join(OUT, `${name}-armed.png`)));
      }
    } finally { await context.close(); }
    manifest.problems.push(...errors.map((entry) => `[${name}] ${entry}`));
  }

  try {
    await capture("desktop", DESKTOP, 1.25, true);
    await capture("phone", PHONE, 2, false);
  } finally { await browser.close(); }

  for (const c of manifest.captures) {
    if (c.label === "armed") {
      if (c.holdVisible) manifest.problems.push(`[${c.mode} armed] hold button still visible`);
      if (!c.door) manifest.problems.push(`[${c.mode} armed] no ENTER door`);
    } else {
      if (!c.holdVisible) manifest.problems.push(`[${c.mode} ${c.label}] hold button not visible`);
      if (c.followErr > 3) manifest.problems.push(`[${c.mode} ${c.label}] button ${c.followErr.toFixed(2)} px off the hole`);
      if (c.label === "hold-mid" && !(c.c > 0.4 && c.c < 0.6 && Math.abs(c.ring - c.c) < 0.03)) manifest.problems.push(`[${c.mode} hold-mid] ring ${c.ring} vs c ${c.c}`);
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (manifest.problems.length) {
    console.error("FAILED:\n" + manifest.problems.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`CLEAN - ${manifest.captures.length} captures in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
