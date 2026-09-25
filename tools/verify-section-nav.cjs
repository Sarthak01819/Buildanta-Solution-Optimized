/* verify-section-nav — the "BZ" section navbar, its back-scroll lock, and the
 * exits it has to live beside (the portal wall, the Contact ship, the
 * Projects world).
 *
 *   npm run dev -- --port 5303 --strictPort
 *   SITE_URL=http://127.0.0.1:5303/ node tools/verify-section-nav.cjs --tag <name>
 *   optional: --only 1,2,9b   run a subset (each case sets up its own preconditions)
 *
 * Output: shots-section-nav/<tag>/  PNGs + report.json (every case PASS/FAIL,
 * each check with its measured value, warnings, notes, and the page/console
 * errors of every session). Exit 1 if any case FAILs, 2 if the run could not
 * start (server down, WRONG SERVER).
 *
 * REAL INPUT, on purpose. The lock is an input-level feature, so it is attacked
 * with page.mouse.wheel, keyboard PageUp / Home / ArrowUp / Shift+Space, CDP
 * touch scroll gestures, a held mouse button on the hole, mouse clicks and
 * touchscreen taps at hit-tested centres. A programmatic scrollTo would sail
 * past the lock and prove nothing. Programmatic moves (goRaw, __sectionNav.go)
 * only SET UP a position, and only forward of the current floor: seek() jumps
 * to the owning section first whenever it has to go back.
 *
 * Desktop 1535x790 @1, one session, in order:
 *   1  boot       ruler visible top-centre after the preloader, #progress gone,
 *                 state().sections ids/labels/raws = contract (+-1e-6 against
 *                 intro.rawForP(.543/.738) and intro.wallRaw), activeId s1
 *   2  back-lock  mid s2 and mid s3: 8 hard wheel-ups, PageUp x5, Home,
 *                 ArrowUp x10, Shift+Space x3 never leave the section
 *                 (>= start - 1 px); wheel-down still moves forward
 *   3  hover nav  .is-hover-nav, 5 buttons -100..0 BZ in order, one .is-active
 *   4  jump back  click -100 BZ from s3: overlay seen, .is-loading, lands raw 0
 *                 on s1, overlay node removed
 *   5  bill burn  TAP & HOLD shown (no .is-off) at rawForBillTransition(.8)
 *                 over the .bg portal wrap
 *   6  wall       go('s4'): portal .on, TAP & HOLD shown; 5 wheel-ups do not
 *                 dismiss the portal
 *   7  ENTER      a real mouse hold arms the door; .bh-portal is a circle
 *                 (width === height, radius 50%) right after arming, after
 *                 focus(), and with :focus-visible forced through CDP
 *   8  ride       ENTER -> s5 with Contact + Projects in; 5 wheel-ups stay on s5
 *   9  ship       Contact -> html.finale-inside: "<- Leave the Ship" top centre,
 *                 ruler hidden, 6 wheel-ups keep flight > .95; Leave the Ship
 *                 flies out (flight 0, CTAs back, ruler back)
 *   9b ship-esc   Esc still leaves the ship
 *   10 world      Projects -> is-in-world: ruler hidden, #world-exit shown;
 *                 clicking it returns and the ruler comes back
 *   11 re-arm     go('s2') then go('s4'): the wall is live again and a real
 *                 press winds the hole (the door re-arms after a navbar jump)
 *   12 theme      .bz-ink over the meadow (rawForZeroStage .5 / .99), absent at
 *                 raw 0 and at the wall
 * Fresh desktop session:
 *   13 skip       [data-skip] -> overlay -> lands on s4 and the wall engages
 * Phone 390x844 @2 (isMobile, hasTouch):
 *   14 phone nav  .bz-mtl count "100 BZ" (unsigned, like the reference); tap ->
 *                 .bz-mtl-menu.is-open with 5 button.bz-mtl-menu__item (unsigned);
 *                 tap "25 BZ" -> s4 and the count reads "25 BZ"
 *   15 touch lock mid s2: a forward touch drag moves (control), three hard
 *                 drag-downs do not leave s2
 * E1-E3          page errors / console errors per session (any -> FAIL)
 *
 * Judge the PNGs; the pane cannot paint WebGL here (use this on :5303).
 */
const fs = require('fs');
const path = require('path');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';   // as the other tools: shots hang without it
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA || '',
  'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const argOf = (name) => {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : null;
  return v && !v.startsWith('--') ? v : null;
};
const TAG = argOf('--tag') || 'run';
const ONLY = argOf('--only') ? new Set(argOf('--only').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const OUT = path.join(__dirname, '..', 'shots-section-nav', TAG);

const DESKTOP = { width: 1535, height: 790 };
const PHONE = { width: 390, height: 844 };
const IDS = ['s1', 's2', 's3', 's4', 's5'];
const LABELS = ['-100 BZ', '-75 BZ', '-50 BZ', '-25 BZ', '0 BZ'];
const PHONE_LABELS = ['100 BZ', '75 BZ', '50 BZ', '25 BZ', '0 BZ'];
const SHIP_EXIT_TEXT = '\u2190 Leave the Ship';
const DESKTOP_CASES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9b', '10', '11', '12'];
/* Gargantua under swiftshader can take >30 s to capture. Every case asserts
   DOM/state BEFORE its screenshots, and a screenshot that times out is a
   WARNING (recorded on the case), never a FAIL. */
const SHOT_TIMEOUT = 90000;
/* Waits inside the Gargantua-backed scenes (ride, ship, world): the flights
   are wall-clock timed, but swiftshader starves the main thread there (r1:
   one state read ~38 s), so these bound a hang, not the product's speed —
   measured durations go in the detail and slow ones become WARNINGS. */
const HEAVY_WAIT = 90000;
const PHONE_CASES = ['14', '15'];

const norm = (s) => String(s == null ? '' : s).replace(/[\u2212\u2012\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const fmt = (v, d = 5) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : String(v));
const want = (id) => !ONLY || ONLY.has(id);

/* ── in-page helpers (init script: defined before any site script runs) ── */
function pageHelpers() {
  const norm = (s) => String(s == null ? '' : s).replace(/[\u2212\u2012\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  const vis = (el) => {
    if (!el) return { exists: false, shown: false, hidden: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let op = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity) || 0;
    const cv = el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
    const sized = r.width > 0 && r.height > 0;
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    return {
      exists: true,
      shown: cv && cs.display !== 'none' && cs.visibility !== 'hidden' && op > 0.5 && sized && onScreen,
      hidden: !cv || cs.display === 'none' || cs.visibility === 'hidden' || op < 0.05 || !sized || !onScreen,
      opacity: Math.round(op * 1000) / 1000, display: cs.display, visibility: cs.visibility,
      rect: [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10),
    };
  };
  const intro = () => window.__buildanta && window.__buildanta.intro;
  const rawNow = () => { const i = intro(); return (window.scrollY - i.st.start) / (i.st.end - i.st.start); };
  const pxRaw = () => { const i = intro(); return 1 / (i.st.end - i.st.start); };
  const snap = () => {
    const i = intro();
    const hook = window.__sectionNav;
    const nav = hook && typeof hook.state === 'function' ? JSON.parse(JSON.stringify(hook.state())) : null;
    const ruler = document.querySelector('.bz-ruler');
    const wrap = document.querySelector('.intro__portalwrap');
    const hold = document.querySelector('.intro__portalwrap .bh-hold');
    const bhp = window.__bhp && window.__bhp.ready === true && typeof window.__bhp.state === 'function' ? window.__bhp.state() : null;
    const ctas = [...document.querySelectorAll('.finale-cta')];
    const html = document.documentElement.classList;
    const holdOp = hold ? parseFloat(getComputedStyle(hold).opacity) : 0;
    return {
      raw: i ? rawNow() : null, pxRaw: i ? pxRaw() : null, y: window.scrollY,
      nav,
      ruler: vis(ruler),
      ink: ruler ? ruler.classList.contains('bz-ink') : null,
      hoverNav: ruler ? ruler.classList.contains('is-hover-nav') : null,
      portalOn: Boolean(wrap && wrap.classList.contains('on')),
      portalBg: Boolean(wrap && wrap.classList.contains('bg')),
      hold: hold ? { off: hold.classList.contains('is-off'), opacity: Math.round(holdOp * 1000) / 1000 } : null,
      holdShown: Boolean(hold) && !hold.classList.contains('is-off') && holdOp > 0.95,
      bhpReady: Boolean(bhp), phase: bhp ? bhp.phase : null,
      door: Boolean(document.querySelector('.bh-portal')),
      ctasIn: ctas.length >= 2 && ctas.every((c) => c.classList.contains('finale-cta--in')),
      finaleInside: html.contains('finale-inside'), inWorld: html.contains('is-in-world'),
      flight: window.__finale ? window.__finale.state().flight : null,
      worldFall: window.__worldFall ? window.__worldFall.state : null,
      overlay: Boolean(document.querySelector('.bz-pt')),
    };
  };
  /* Records every .bz-pt (added, how long it lived, what it looked
     like) and every element that gains .is-loading. A MutationObserver, so a
     600 ms overlay cannot slip between two polls. */
  const watch = {
    installed: false, log: [], els: [], loading: [],
    arm() {
      this.log = []; this.els = []; this.loading = [];
      if (this.installed) return;
      this.installed = true;
      const self = this;
      const tracked = new WeakSet();
      const track = (el) => {
        if (tracked.has(el)) return;
        tracked.add(el);
        const cs = getComputedStyle(el);
        const rec = { t0: performance.now(), t1: null, bg: cs.backgroundColor, position: cs.position,
          text: norm(el.textContent).slice(0, 40), nodes: el.querySelectorAll('*').length,
          spinner: Boolean(el.querySelector('[class*="spin"]')), peakOpacity: 0 };
        self.log.push(rec); self.els.push(el);
        const f = () => {
          if (!el.isConnected) { rec.t1 = performance.now(); return; }
          rec.peakOpacity = Math.max(rec.peakOpacity, parseFloat(getComputedStyle(el).opacity) || 0);
          requestAnimationFrame(f);
        };
        f();
      };
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'childList') {
            for (const n of m.addedNodes) {
              if (n.nodeType !== 1) continue;
              if (n.matches('.bz-pt')) track(n);
              else n.querySelectorAll('.bz-pt').forEach(track);
            }
          } else if (m.target.classList) {
            if (m.target.classList.contains('bz-nav-overlay')) track(m.target);
            if (m.target.classList.contains('is-loading')) {
              self.loading.push({ t: performance.now(), cls: String(m.target.className), text: norm(m.target.textContent) });
            }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    },
    result() {
      // removed since its last rAF sample: close it now, or a read taken
      // right after the jump settles reports a live overlay with no end
      this.log.forEach((r, i) => { if (r.t1 == null && !this.els[i].isConnected) r.t1 = performance.now(); });
      return {
        log: this.log.map((r) => ({ ...r, ms: r.t1 == null ? null : Math.round(r.t1 - r.t0), peakOpacity: Math.round(r.peakOpacity * 1000) / 1000 })),
        loading: this.loading.slice(0, 6),
        present: Boolean(document.querySelector('.bz-pt')),
      };
    },
  };
  /* lowest / highest raw seen on every frame while a gesture runs — catches a
     lock that lets the film scroll up and then snaps it back */
  let minRun = null;
  const minStart = () => {
    const w = minRun = { min: Infinity, max: -Infinity, run: true };
    const f = () => {
      if (!w.run) return;
      const r = rawNow();
      if (r < w.min) w.min = r;
      if (r > w.max) w.max = r;
      requestAnimationFrame(f);
    };
    f();
  };
  const minStop = () => {
    if (!minRun) return { min: null, max: null };
    minRun.run = false;
    const r = rawNow();
    return { min: Math.min(minRun.min, r), max: Math.max(minRun.max, r) };
  };
  /* Where an element's opacity is HEADING: a running CSS opacity transition's
     last keyframe. Lets a slow-clock read tell "fading the right way" from
     "stuck at the wrong value". */
  const fade = (el) => {
    if (!el) return null;
    const now = parseFloat(getComputedStyle(el).opacity);
    const running = (el.getAnimations ? el.getAnimations() : [])
      .filter((a) => a.transitionProperty === 'opacity' && a.playState === 'running');
    let target = now;
    for (const a of running) {
      const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
      const last = kf[kf.length - 1];
      if (last && last.opacity != null) target = parseFloat(last.opacity);
    }
    return { now: Math.round(now * 1000) / 1000, target,
      running: running.map((a) => { const t = a.effect.getTiming(); return { at: Math.round(a.currentTime), dur: t.duration, delay: t.delay }; }) };
  };
  window.__snavT = { norm, vis, fade, rawNow, pxRaw, snap, watch, minStart, minStop };
}

/* ── node-side helpers ─────────────────────────────────────────────────── */
const sleep = (page, ms) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);
const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const snap = (page) => page.evaluate(() => window.__snavT.snap());
const until = (page, fn, timeout, arg = null) => page.waitForFunction(fn, arg, { timeout, polling: 50 })
  .then(() => true, (e) => { if (/timeout/i.test(e.message)) return false; throw e; });
/* For the Gargantua-backed scenes: wait up to `timeout`, then ask the page
   ONCE more and assert on that answer. Under swiftshader the page's own
   polling there can starve past any bound (r2: a 60 s wait timed out, the
   very next read showed the right state), so a timeout is reported as
   slowness (inTime false -> the case warns), never as the product's answer. */
async function settle(page, fn, timeout) {
  const t0 = Date.now();
  const inTime = await until(page, fn, timeout);
  const ok = inTime || Boolean(await page.evaluate(fn));
  return { ok, inTime, s: (Date.now() - t0) / 1000 };
}
const slowNote = (r, label, expectS) => (r.ok && (!r.inTime || r.s > expectS)
  ? `${label} settled after ${r.s.toFixed(1)} s${r.inTime ? '' : ' (the in-page wait timed out; the state read after it was correct)'} - swiftshader, expected ~${expectS} s`
  : null);

const withTimeout = (p, ms, label) => {
  let timer;
  return Promise.race([p, new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} did not finish in ${ms} ms`)), ms);
  })]).finally(() => clearTimeout(timer));
};

const goRaw = (page, f) => page.evaluate((raw) => {
  const { intro, lenis } = window.__buildanta;
  const y = intro.st.start + (intro.st.end - intro.st.start) * raw;
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}, f);

const billReady = (page, timeout = 60000) => page.waitForFunction(() => {
  const b = window.__buildanta.intro.billTransition;
  return !b || b.ready || b.failed;
}, null, { timeout });

const expected = (page) => page.evaluate(() => {
  const i = window.__buildanta.intro;
  return { s1: 0, s2: i.rawForP(0.543), s3: i.rawForP(0.738), s4: i.wallRaw,
    introRawEnd: i.introRawEnd, pxRaw: 1 / (i.st.end - i.st.start) };
});

const armWatch = (page) => page.evaluate(() => window.__snavT.watch.arm());
const watchResult = (page) => page.evaluate(() => window.__snavT.watch.result());
const waitIdle = (page, timeout = 15000) => until(page, () => {
  const s = window.__sectionNav && window.__sectionNav.state();
  return Boolean(s) && !s.busy && !document.querySelector('.bz-pt');
}, timeout);
const wallLive = (page, timeout = 20000) => until(page, () => {
  const s = window.__snavT.snap();
  return s.portalOn && s.bhpReady && s.holdShown;
}, timeout);

/* The dev hook — the same path as a click. */
async function go(page, id, timeout = 45000) {
  await page.evaluate(({ id, timeout }) => {
    if (!window.__sectionNav || typeof window.__sectionNav.go !== 'function') throw new Error('window.__sectionNav.go missing');
    return Promise.race([
      Promise.resolve(window.__sectionNav.go(id)),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`__sectionNav.go('${id}') did not settle in ${timeout} ms`)), timeout)),
    ]).then(() => true);
  }, { id, timeout });
  if (!(await waitIdle(page, 15000))) throw new Error(`go('${id}'): still busy / overlay still up 15 s after the promise settled`);
}

/* Put the film at `raw`. Programmatic, so it only ever moves FORWARD of the
   floor: if the target is above the current section, jump to the section that
   owns it first (the lock is right to refuse the scroll). */
async function seek(page, raw, c) {
  const s = await snap(page);
  if (s.nav && typeof s.nav.floorRaw === 'number' && raw < s.nav.floorRaw - s.pxRaw) {
    const owners = (s.nav.sections || []).filter((x) => x.id !== 's5' && typeof x.raw === 'number' && x.raw <= raw + 1e-9);
    const owner = owners[owners.length - 1];
    if (owner) {
      c && c.note(`seek ${fmt(raw)} is above floor ${fmt(s.nav.floorRaw)} -> go('${owner.id}') first`);
      await go(page, owner.id);
    }
  }
  await goRaw(page, raw);
  await sleep(page, 900);
  const after = await snap(page);
  if (c && Math.abs(after.raw - raw) > 2 * after.pxRaw) {
    c.warn(`seek(${fmt(raw)}) settled at ${fmt(after.raw)} (${((after.raw - raw) / after.pxRaw).toFixed(1)} px off)`);
  }
  return after;
}

/* Real wheel over the canvas (away from the top-centre ruler). */
async function wheel(page, n, dy) {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height * 0.62, { steps: 2 });
  const before = await snap(page);
  await page.evaluate(() => window.__snavT.minStart());
  for (let k = 0; k < n; k++) { await page.mouse.wheel(0, dy); await sleep(page, 70); }
  await sleep(page, 1200);
  const m = await page.evaluate(() => window.__snavT.minStop());
  return { before, after: await snap(page), min: m.min, max: m.max };
}

/* Chrome only scrolls the page from PageUp/PageDown/arrows/Home/End once the
   document has been clicked (measured: before any click those keys did
   nothing, only Space scrolled) - a real visitor has always clicked by then.
   Click a spot that is not a control, and prove the click changed nothing
   (no service sheet, no jump, scroll not stopped); otherwise undo and try
   the next spot. Returns the point used. */
async function keyFocus(page) {
  const vp = page.viewportSize();
  const spots = [[24, vp.height * 0.5], [vp.width - 24, vp.height * 0.5], [vp.width * 0.5, vp.height - 24], [24, vp.height - 24]];
  for (const [x, y] of spots) {
    const before = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      const ctl = el && el.closest('a, button, input, select, textarea, label, [role="button"], [tabindex], [data-service], .service-sheet, .bz-ruler, .bz-mtl');
      return { ok: Boolean(el) && !ctl, y: window.scrollY, hit: el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : 'none' };
    }, [x, y]);
    if (!before.ok) continue;
    await page.mouse.click(x, y);
    await sleep(page, 500);
    const after = await page.evaluate(() => ({ y: window.scrollY, stopped: Boolean(window.__buildanta.lenis && window.__buildanta.lenis.isStopped),
      sheet: Boolean(document.querySelector('.service-sheet.on')), overlay: Boolean(document.querySelector('.bz-pt')) }));
    if (Math.abs(after.y - before.y) <= 1 && !after.stopped && !after.sheet && !after.overlay) return { x, y, hit: before.hit };
    if (after.sheet) { await page.keyboard.press('Escape'); await sleep(page, 400); }
    await page.evaluate((yy) => window.__buildanta.lenis.scrollTo(yy, { immediate: true, force: true }), before.y);
    await sleep(page, 500);
  }
  throw new Error('no inert spot to click for keyboard focus');
}

/* Until scrollY holds still for 3 samples 300 ms apart (cap 10 s): a key's
   scroll, and the backstop's correction, must land before we measure. */
async function waitStill(page) {
  /* ...AND until the intro has processed it (intro.raw agrees with scrollY):
     r4 read scrollY at the very top while state().activeId still said s3,
     i.e. before the scroll handlers - and the lock's backstop, which runs in
     the same Lenis emit - had run on this starved clock. */
  let last = null, same = 0;
  for (const t0 = Date.now(); Date.now() - t0 < 20000 && same < 3;) {
    const r = await page.evaluate(() => ({ y: Math.round(window.scrollY),
      synced: Math.abs(window.__buildanta.intro.raw - window.__snavT.rawNow()) < 2 * window.__snavT.pxRaw() }));
    same = r.synced && r.y === last ? same + 1 : 0;
    last = r.y;
    await sleep(page, 300);
  }
}

/* Real keys on <body> (a focused button would eat Space / Enter). */
async function keys(page, key, n) {
  await page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); });
  const before = await snap(page);
  await page.evaluate(() => window.__snavT.minStart());
  for (let k = 0; k < n; k++) { await page.keyboard.press(key); await sleep(page, 120); }
  await sleep(page, 1200);
  await waitStill(page);
  const m = await page.evaluate(() => window.__snavT.minStop());
  return { before, after: await snap(page), min: m.min, max: m.max };
}

function lockCheck(c, label, r, floor, tol) {
  const px = (v) => ((v - floor) / tol).toFixed(1);
  c.check(`${label}: stays at/after the section start`, r.after.raw >= floor - tol,
    `settled ${px(r.after.raw)} px from the start (was ${px(r.before.raw)}), lowest ${px(r.min)} px, activeId ${r.after.nav && r.after.nav.activeId}`);
  if (r.min < floor - 2 * tol && r.after.raw >= floor - tol) {
    c.warn(`${label}: went ${(-(r.min - floor) / tol).toFixed(1)} px above the section start mid-gesture, then snapped back`);
  }
}

/* Click / tap an element at its hit-tested centre with real input — never
   Playwright's element click, whose actionability scroll would rewind the
   pinned film underneath us (verify-room learned this). */
async function clickReal(page, selector, { text = null, touch = false } = {}) {
  const info = await page.evaluate(({ selector, text }) => {
    const T = window.__snavT;
    let els = [...document.querySelectorAll(selector)];
    if (text != null) els = els.filter((e) => T.norm(e.textContent) === text);
    const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || els[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const name = (n) => {
      if (!n) return 'none';
      const cls = n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className;
      return ((n.id ? '#' + n.id : '') + (cls ? '.' + String(cls).trim().split(/\s+/).join('.') : n.tagName)).slice(0, 80);
    };
    return { x, y, w: r.width, h: r.height, isTop: Boolean(hit) && (hit === el || el.contains(hit)), top: name(hit) };
  }, { selector, text });
  if (!info) throw new Error(`no element ${selector}${text != null ? ` with text "${text}"` : ''}`);
  if (!(info.w > 0 && info.h > 0)) throw new Error(`${selector} has no size (${info.w}x${info.h})`);
  if (touch) await page.touchscreen.tap(info.x, info.y);
  else {
    await page.mouse.move(info.x, info.y, { steps: 5 });
    await page.mouse.down();
    await sleep(page, 40);
    await page.mouse.up();
  }
  return info;
}

async function hoverRuler(page) {
  const at = await page.evaluate(() => {
    const el = document.querySelector('.bz-ruler');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  });
  if (!at) throw new Error('.bz-ruler is not in the DOM');
  await page.mouse.move(at[0], at[1], { steps: 6 });
  const hover = await until(page, () => {
    const r = document.querySelector('.bz-ruler');
    return Boolean(r) && r.classList.contains('is-hover-nav');
  }, 3000);
  await sleep(page, 450);   // let the reveal finish
  return { hover, at };
}

/* Wait for an element to finish showing ('in': painted at opacity >= .99) or
   hiding ('out'), then check. Under swiftshader the Gargantua frames take
   seconds and CSS transitions only advance per frame, so a still-running
   transition toward the RIGHT value passes with a warning (with the
   transition's clock in the detail); a wrong value or no transition fails. */
async function settleVis(page, sel, dir, timeout = 20000) {
  const inTime = await until(page, ({ sel, dir }) => {
    const v = window.__snavT.vis(document.querySelector(sel));
    return dir === 'in' ? v.shown && v.opacity >= 0.99 : v.hidden;
  }, timeout, { sel, dir });
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return { vis: window.__snavT.vis(el), fade: window.__snavT.fade(el) };
  }, sel);
  // the read after the wait is the answer (r2: a starved 20 s wait missed a
  // ruler that the very next read found fully hidden)
  const ok = inTime || (dir === 'in' ? info.vis.shown && info.vis.opacity >= 0.99 : info.vis.hidden);
  const f = info.fade;
  let fading = false;
  if (!ok && f && f.running.length > 0) {
    fading = dir === 'in'
      ? f.target >= 0.99 && info.vis.visibility !== 'hidden' && info.vis.display !== 'none'
      : f.target <= 0.05;
  }
  return { ok, fading, ...info };
}
function visCheck(c, label, r) {
  c.check(label, r.ok || r.fading, `${JSON.stringify(r.vis)}; opacity transition ${JSON.stringify(r.fade)}`);
  if (!r.ok && r.fading) {
    c.warn(`${label}: still mid-transition after the wait (opacity ${r.fade.now} -> ${r.fade.target}, `
      + `${JSON.stringify(r.fade.running)}); the animation clock is starved under swiftshader, the target is right`);
  }
}

function overlayChecks(c, w, label) {
  (c.data.overlays = c.data.overlays || []).push({ label, ...w });
  const o = w.log[0];
  c.check(`${label}: .bz-pt appeared`, Boolean(o),
    o ? `lived ${o.ms} ms, bg ${o.bg}, peak opacity ${o.peakOpacity}, text "${o.text}", spinner ${o.spinner}` : 'never seen');
  if (!o) return;
  if (!/^rgba?\(255, 255, 255/.test(o.bg)) c.warn(`${label}: overlay background ${o.bg} (contract: white)`);
  if (!/B/.test(o.text)) c.warn(`${label}: overlay text "${o.text}" carries no "B" mark in the DOM text`);
  if (o.ms != null && (o.ms < 1000 || o.ms > 20000)) c.warn(`${label}: overlay lived ${o.ms} ms (expected 0.6 s in + jump + 0.6 s out, 1.8-5.5 s headless, <= 20 s)`);
  if (w.log.length > 1) c.warn(`${label}: ${w.log.length} overlays for one jump`);
  if (o.peakOpacity < 0.9) {
    c.warn(`${label}: the curtain never painted opaque (peak computed opacity ${o.peakOpacity} over ${o.ms} ms) - `
      + 'its fade is timed by setTimeout, so on a starved frame clock the jump can run before the white is up');
  }
}

const holdInfo = (s) => `portal ${s.portalOn ? 'on' : 'off'}${s.portalBg ? '+bg' : ''}, module ${s.bhpReady ? s.phase : 'not ready'}, `
  + `hold ${s.hold ? `${s.hold.off ? 'is-off' : 'shown'} op ${s.hold.opacity}` : 'absent'}, activeId ${s.nav && s.nav.activeId}, raw ${fmt(s.raw)}`;

/* The hole drifts until the first pointermove; put the pointer mid-screen,
   let the hole arrive, and read where it is (the module's own expression). */
async function holeCentre(page) {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width * 0.5, vp.height * 0.56, { steps: 6 });
  await sleep(page, 700);
  return page.evaluate(() => {
    const s = window.__bhp.state();
    return { x: s.x / s.dpr, y: (s.size - s.y) / s.dpr, phase: s.phase };
  });
}

const measureDoor = (page) => page.evaluate(() => {
  const el = document.querySelector('.bh-portal');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  const cssW = parseFloat(cs.width), cssH = parseFloat(cs.height);
  const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => cs[k]);
  const resolve = (v) => {
    const first = String(v).split(' ')[0];
    return first.endsWith('%') ? (parseFloat(first) / 100) * Math.min(w, h) : parseFloat(first);
  };
  const radii = corners.map(resolve);
  const r = el.getBoundingClientRect();
  return {
    w, h, cssW, cssH, rect: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
    radius: cs.borderRadius, corners, radii: radii.map((v) => Math.round(v * 10) / 10),
    outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
    focused: document.activeElement === el, focusVisible: el.matches(':focus-visible'),
    circle: w > 0 && w === h && Math.abs(cssW - cssH) <= 0.5 && radii.every((v) => v >= Math.min(w, h) / 2 - 0.5),
  };
});
const fmtDoor = (m) => (m ? `${m.w}x${m.h} (css ${m.cssW}x${m.cssH}), border-radius ${m.radius} [${m.corners.join(' ')}] = ${m.radii.join('/')} px, `
  + `outline ${m.outline}, focused ${m.focused}, :focus-visible ${m.focusVisible}` : 'no .bh-portal');

/* ── preconditions (so a failed earlier case does not cascade) ─────────── */
async function leaveShipAndWorld(page, c) {
  let s = await snap(page);
  if (s.inWorld) {
    c.note('precondition: leaving the world first');
    await clickReal(page, '#world-exit');
    await until(page, () => window.__worldFall && window.__worldFall.state === 'out', HEAVY_WAIT);
  }
  s = await snap(page);
  if (s.flight > 0.001) {
    c.note('precondition: leaving the ship first (Esc)');
    await page.keyboard.press('Escape');
    await until(page, () => window.__finale.state().flight < 0.001, HEAVY_WAIT);
  }
}

async function ensureWall(page, c) {
  await leaveShipAndWorld(page, c);
  let s = await snap(page);
  if (s.portalOn && s.bhpReady && (s.holdShown || s.phase === 'armed') && s.nav && s.nav.activeId === 's4') return s;
  c.note(`precondition: go('s4') (was ${s.nav && s.nav.activeId}, ${holdInfo(s)})`);
  await go(page, 's4');
  await billReady(page);
  if (!(await wallLive(page, 20000))) throw new Error(`precondition failed: the wall did not engage (${holdInfo(await snap(page))})`);
  return snap(page);
}

async function ensureArmed(page, c) {
  let s = await snap(page);
  if (s.phase === 'armed' && s.door) return;
  await ensureWall(page, c);
  s = await snap(page);
  if (s.phase !== 'armed') {
    await page.evaluate(() => { window.__bhp.press(); window.__bhp.step(175); });
    c.note('precondition: armed through __bhp.press() + step(175) (the verify-portal path)');
  }
  s = await snap(page);
  if (s.phase !== 'armed' || !s.door) throw new Error(`precondition failed: could not arm the door (${holdInfo(s)})`);
}

async function ensureFinale(page, c) {
  await leaveShipAndWorld(page, c);
  let s = await snap(page);
  if (s.nav && s.nav.activeId === 's5' && s.ctasIn) return;
  await ensureArmed(page, c);
  await clickReal(page, '.bh-portal');
  const ride = await settle(page, () => {
    const st = window.__sectionNav.state();
    const ctas = [...document.querySelectorAll('.finale-cta')];
    return st.activeId === 's5' && ctas.length >= 2 && ctas.every((x) => x.classList.contains('finale-cta--in'));
  }, HEAVY_WAIT);
  s = await snap(page);
  if (!ride.ok) throw new Error(`precondition failed: ENTER did not reach s5 with the CTAs in (activeId ${s.nav && s.nav.activeId}, ctasIn ${s.ctasIn})`);
  c.note(`precondition: rode ENTER to s5 (${ride.s.toFixed(1)} s)`);
  await sleep(page, 600);
}

/* ── report + case runner ──────────────────────────────────────────────── */
const report = { tag: TAG, url: URL, startedAt: new Date().toISOString(), finishedAt: null,
  viewports: { desktop: { ...DESKTOP, dpr: 1 }, phone: { ...PHONE, dpr: 2 } },
  expected: {}, cases: [], errors: {}, summary: null };
function writeReport() {
  const fail = report.cases.filter((c) => c.status === 'FAIL').length;
  report.summary = { total: report.cases.length, pass: report.cases.length - fail, fail,
    withWarnings: report.cases.filter((c) => c.warnings.length).map((c) => c.id) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
}

async function shot(page, c, name, clipSel) {
  const file = path.join(OUT, `${name}.png`);
  try {
    let clip;
    if (clipSel) {
      const r = await page.evaluate((sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return [b.left, b.top, b.width, b.height];
      }, clipSel);
      if (r && r[2] > 0 && r[3] > 0) {
        const vp = page.viewportSize(), pad = 28;
        const x = Math.max(0, r[0] - pad), y = Math.max(0, r[1] - pad);
        clip = { x, y, width: Math.max(1, Math.min(vp.width - x, r[2] + 2 * pad)), height: Math.max(1, Math.min(vp.height - y, r[3] + 2 * pad)) };
      }
    }
    await page.screenshot({ path: file, timeout: SHOT_TIMEOUT, ...(clip ? { clip } : {}) });
    c.shots.push(path.basename(file));
  } catch (e) {
    c.warnings.push(`screenshot ${name} failed: ${String(e.message).split('\n')[0]}`);
  }
}

async function runCase(sess, id, name, fn) {
  if (!id.startsWith('E') && !want(id)) return;
  const c = { id, name, session: sess.name, status: 'FAIL', detail: '', checks: [], warnings: [], notes: [], shots: [], data: {}, ms: 0 };
  const t0 = Date.now();
  const ctx = {
    check: (label, ok, info = '') => { c.checks.push({ label, ok: Boolean(ok), info: String(info) }); return Boolean(ok); },
    warn: (m) => c.warnings.push(m),
    note: (m) => c.notes.push(m),
    data: c.data,
    shot: (n, clipSel) => shot(sess.page, c, n, clipSel),
  };
  try { await fn(ctx); }
  catch (e) { c.checks.push({ label: 'exception', ok: false, info: String((e && e.message) || e).split('\n')[0] }); }
  c.ms = Date.now() - t0;
  c.status = c.checks.length && c.checks.every((k) => k.ok) ? 'PASS' : 'FAIL';
  c.detail = c.checks.map((k) => `${k.ok ? 'ok' : 'FAIL'} ${k.label}${k.info ? ` [${k.info}]` : ''}`).join(' | ') || 'no checks ran';
  report.cases.push(c);
  console.log(`${c.status}  ${id}. ${name}  (${(c.ms / 1000).toFixed(1)} s)`);
  for (const k of c.checks) console.log(`      ${k.ok ? 'ok  ' : 'FAIL'} ${k.label}${k.info ? ` -- ${k.info}` : ''}`);
  for (const n of c.notes) console.log(`      note ${n}`);
  for (const w of c.warnings) console.log(`      WARN ${w}`);
  writeReport();
}

function bootFail(name, ids, e) {
  const msg = `session "${name}" did not boot: ${String((e && e.message) || e).split('\n')[0]}`;
  for (const id of ids.filter(want)) {
    report.cases.push({ id, name: 'not run', session: name, status: 'FAIL', detail: msg, checks: [{ label: 'boot', ok: false, info: msg }],
      warnings: [], notes: [], shots: [], data: {}, ms: 0 });
  }
  console.log(`FAIL  ${msg}`);
  writeReport();
}

async function openSession(browser, name, opts) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...opts });
  await context.addInitScript(pageHelpers);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const sess = { name, context, page, errors };
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
    const title = await page.title();
    if (!/^buildanta solutions/i.test(title)) throw new Error(`WRONG SERVER at ${URL} (title "${title}")`);
  } catch (e) {
    await context.close().catch(() => {});
    e.fatal = true;
    throw e;
  }
  try {
    await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
    await page.addStyleTag({ content: '#cursor,#cursor-ring{display:none!important;opacity:0!important}' });
    await page.waitForFunction(() => window.__buildantaPreparation && window.__buildantaPreparation.state.revealed, null, { timeout: 60000 });
    await sleep(page, 1200);
    sess.S = await expected(page);   // the intro's own positions for this viewport
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
  return sess;
}

async function closeSession(sess, errorCaseId) {
  await runCase(sess, errorCaseId, `no page / console errors (${sess.name} session)`, async (c) => {
    c.check('page + console errors', sess.errors.length === 0,
      sess.errors.length ? `${sess.errors.length}: ${sess.errors.slice(0, 3).join(' || ')}` : 'none');
  });
  report.errors[sess.name] = sess.errors;
  writeReport();
  await sess.context.close().catch(() => {});
}

/* ══ desktop: cases 1–12 ══════════════════════════════════════════════════ */
async function desktopSession(browser) {
  let sess;
  try { sess = await openSession(browser, 'desktop', { viewport: DESKTOP, deviceScaleFactor: 1 }); }
  catch (e) { if (e.fatal) throw e; bootFail('desktop', DESKTOP_CASES, e); return; }
  const { page } = sess;
  const S = sess.S;
  report.expected.desktop = S;
  const tol = S.pxRaw;                  // one pixel of scroll, in raw
  const s2mid = (S.s2 + S.s3) / 2;
  const s3mid = (S.s3 + S.s4) / 2;

  try {
    await runCase(sess, '1', 'boot: ruler after the preloader, #progress gone, sections contract', async (c) => {
      await until(page, () => window.__snavT.vis(document.querySelector('.bz-ruler')).shown, 8000);
      const info = await page.evaluate(() => {
        const T = window.__snavT;
        const i = window.__buildanta.intro;
        const hook = window.__sectionNav;
        const ruler = document.querySelector('.bz-ruler');
        return {
          hook: Boolean(hook) && typeof hook.state === 'function' && typeof hook.go === 'function',
          state: hook && typeof hook.state === 'function' ? JSON.parse(JSON.stringify(hook.state())) : null,
          ruler: T.vis(ruler), position: ruler ? getComputedStyle(ruler).position : null,
          ink: ruler ? ruler.classList.contains('bz-ink') : null,
          progress: Boolean(document.getElementById('progress')),
          expected: [0, i.rawForP(0.543), i.rawForP(0.738), i.wallRaw],
          raw: T.rawNow(), W: innerWidth,
          preload: window.__buildantaPreparation ? window.__buildantaPreparation.state : null,
        };
      });
      c.data.state = info.state;
      c.data.preload = info.preload;
      c.check('window.__sectionNav has state() + go()', info.hook);
      c.check('.bz-ruler visible after the preloader', info.ruler.shown, JSON.stringify(info.ruler));
      const r = info.ruler.rect;
      if (r) {
        const cx = r[0] + r[2] / 2;
        c.check('ruler is fixed at the top centre', info.position === 'fixed' && Math.abs(cx - info.W / 2) <= 40 && r[1] < 120,
          `position ${info.position}, centre x ${cx.toFixed(1)} of ${info.W}, top ${r[1]}`);
      }
      c.check('#progress no longer exists', !info.progress);
      const secs = (info.state && info.state.sections) || [];
      c.check('sections are s1..s5', secs.length === 5 && secs.every((x, k) => x.id === IDS[k]), secs.map((x) => x.id).join(','));
      c.check('labels -100 / -75 / -50 / -25 / 0 BZ', secs.length === 5 && secs.every((x, k) => norm(x.label) === LABELS[k]),
        secs.map((x) => JSON.stringify(x.label)).join(' '));
      if (secs.some((x) => x.label !== norm(x.label))) c.warn('labels use a non-ASCII minus or extra whitespace (compared normalised)');
      const diffs = info.expected.map((e, k) => (secs[k] && typeof secs[k].raw === 'number' ? Math.abs(secs[k].raw - e) : Infinity));
      c.check('s1..s4 raws = 0, rawForP(.543), rawForP(.738), wallRaw (+-1e-6)', diffs.every((d) => d <= 1e-6),
        info.expected.map((e, k) => `${IDS[k]} ${secs[k] ? fmt(secs[k].raw, 6) : '-'} vs ${fmt(e, 6)}`).join(', '));
      c.data.s5raw = secs[4] ? secs[4].raw : undefined;
      c.check('activeId s1 at the top', info.state && info.state.activeId === 's1', `activeId ${info.state && info.state.activeId}, raw ${fmt(info.raw)}`);
      c.check('state().visible true', info.state && info.state.visible === true, `visible ${info.state && info.state.visible}`);
      if (info.ink) c.warn('ruler already carries .bz-ink at raw 0');
      await c.shot('01-boot');
      await c.shot('01-boot-ruler', '.bz-ruler');
    });

    await runCase(sess, '2', 'back-scroll lock: wheel + keyboard hold the floor, forward stays free', async (c) => {
      let s = await seek(page, s2mid, c);
      c.check('mid s2 -> activeId s2, floorRaw = s2 start',
        s.nav && s.nav.activeId === 's2' && Math.abs(s.nav.floorRaw - S.s2) <= 1e-6,
        `raw ${fmt(s.raw)}, activeId ${s.nav && s.nav.activeId}, floorRaw ${fmt(s.nav && s.nav.floorRaw)} vs ${fmt(S.s2)}`);
      lockCheck(c, 'wheel-up 8 x 1200 at s2', await wheel(page, 8, -1200), S.s2, tol);

      s = await seek(page, s3mid, c);
      c.check('mid s3 -> activeId s3, floorRaw = s3 start',
        s.nav && s.nav.activeId === 's3' && Math.abs(s.nav.floorRaw - S.s3) <= 1e-6,
        `raw ${fmt(s.raw)}, activeId ${s.nav && s.nav.activeId}, floorRaw ${fmt(s.nav && s.nav.floorRaw)} vs ${fmt(S.s3)}`);
      lockCheck(c, 'wheel-up 8 x 1200 at s3', await wheel(page, 8, -1200), S.s3, tol);
      /* Each key run starts 300 px INSIDE the section, not on its start: from
         there a PageUp / Home overshoots the floor, so both the "at the floor"
         guard and the scroll backstop behind it are exercised. The control
         first proves keys move this page at all (r2 measured 0 px for every
         key before a click: that run's key PASSes proved nothing). */
      await goRaw(page, S.s3 + 300 * tol);
      await sleep(page, 700);
      const kf = await keyFocus(page);
      c.note(`keyboard focus by a click at ${kf.x.toFixed(0)},${kf.y.toFixed(0)} on ${kf.hit}`);
      const ctl = await keys(page, 'PageDown', 1);
      const ctlPx = (ctl.after.raw - ctl.before.raw) / tol;
      c.check('control: PageDown moves the film forward', ctlPx > 100, `${ctlPx.toFixed(0)} px forward`);
      for (const [label, key, n] of [['PageUp x5', 'PageUp', 5], ['Home', 'Home', 1],
        ['ArrowUp x10', 'ArrowUp', 10], ['Shift+Space x3', 'Shift+Space', 3]]) {
        await goRaw(page, S.s3 + 300 * tol);
        await sleep(page, 700);
        await waitStill(page);
        lockCheck(c, `${label} from 300 px inside s3`, await keys(page, key, n), S.s3, tol);
      }
      const f = await wheel(page, 4, 400);
      const moved = (f.after.raw - f.before.raw) / tol;
      c.check('wheel-down 4 x 400 still moves forward', moved > 5,
        `${moved.toFixed(0)} px forward, activeId ${f.after.nav && f.after.nav.activeId}`);
    });

    await runCase(sess, '3', 'hover nav: 5 BZ buttons revealed, current one active', async (c) => {
      const s = await snap(page);
      if (!(s.nav && s.nav.activeId === 's3')) await seek(page, s3mid, c);
      const h = await hoverRuler(page);
      c.check('hovering .bz-ruler adds .is-hover-nav', h.hover, `pointer at ${h.at.map((v) => v.toFixed(0)).join(',')}`);
      // the reveal is a .25 s fade; on this clock it can take seconds (r2)
      await until(page, () => {
        const btns = [...document.querySelectorAll('.bz-ruler__nav-btn')];
        return btns.length === 5 && btns.every((x) => window.__snavT.vis(x).shown);
      }, 8000);
      const b = await page.evaluate(() => {
        const T = window.__snavT;
        const btns = [...document.querySelectorAll('.bz-ruler__nav-btn')];
        const nav = document.querySelector('.bz-ruler__nav');
        return {
          tags: btns.map((x) => x.tagName), labels: btns.map((x) => T.norm(x.textContent)),
          vis: btns.map((x) => T.vis(x)), inRuler: btns.every((x) => Boolean(x.closest('.bz-ruler'))),
          fades: [nav, ...btns].map((x) => T.fade(x)).filter((f) => f && f.running.length),
          active: btns.filter((x) => x.classList.contains('is-active')).map((x) => T.norm(x.textContent)),
          activeId: window.__sectionNav.state().activeId,
        };
      });
      c.data.navButtons = b;
      c.check('5 <button class="bz-ruler__nav-btn">', b.tags.length === 5 && b.tags.every((t) => t === 'BUTTON'), `${b.tags.length}: ${b.tags.join(',')}`);
      c.check('labels in order', same(b.labels, LABELS), b.labels.join(' / '));
      const allShown = b.vis.length === 5 && b.vis.every((v) => v.shown);
      const fadingIn = b.fades.length > 0 && b.fades.every((f) => f.target >= 0.99);
      c.check('all 5 revealed (visible)', allShown || fadingIn,
        `${b.vis.map((v) => `${v.shown ? 'shown' : 'NOT shown'} op ${v.opacity}`).join(' | ')}; running fades ${JSON.stringify(b.fades)}`);
      if (!allShown && fadingIn) c.warn('nav buttons still mid-fade after 8 s (starved animation clock), heading to opacity 1');
      if (!b.inRuler) c.warn('nav buttons live outside the .bz-ruler root');
      const wantLabel = LABELS[IDS.indexOf(b.activeId)];
      c.check('exactly one .is-active, = current section (s3, -50 BZ)',
        b.active.length === 1 && b.active[0] === wantLabel && b.activeId === 's3',
        `active [${b.active.join(', ')}], activeId ${b.activeId}`);
      await c.shot('03-hover-nav');
      await c.shot('03-hover-nav-ruler', '.bz-ruler');
    });

    await runCase(sess, '4', 'jump back: -100 BZ from s3 through the overlay', async (c) => {
      let s = await snap(page);
      if (!(s.nav && s.nav.activeId === 's3')) s = await seek(page, s3mid, c);
      c.data.from = { raw: s.raw, activeId: s.nav && s.nav.activeId };
      await hoverRuler(page);
      await armWatch(page);
      const click = await clickReal(page, '.bz-ruler__nav-btn', { text: '-100 BZ' });
      c.check('-100 BZ is topmost at its centre', click.isTop, click.top);
      const started = await until(page, () => window.__snavT.watch.log.length > 0
        || (window.__sectionNav && window.__sectionNav.state().busy === true), 3000);
      if (!started) c.warn('neither an overlay nor busy within 3 s of the click');
      const idle = await waitIdle(page, 20000);
      await sleep(page, 300);
      const w = await watchResult(page);
      s = await snap(page);
      c.data.overlay = w;
      overlayChecks(c, w, 'jump');
      c.check('the clicked button carried .is-loading', w.loading.some((x) => x.text === '-100 BZ'),
        w.loading.map((x) => `${x.text} (${x.cls})`).join('; ') || 'none');
      c.check('lands at raw 0', Math.abs(s.raw) <= 2 * tol, `raw ${fmt(s.raw)} (${(s.raw / tol).toFixed(1)} px)`);
      c.check('activeId s1, floorRaw 0', s.nav && s.nav.activeId === 's1' && Math.abs(s.nav.floorRaw) <= 1e-6,
        `activeId ${s.nav && s.nav.activeId}, floorRaw ${fmt(s.nav && s.nav.floorRaw)}`);
      c.check('overlay node removed, not busy', idle && !w.present && w.log.every((x) => x.t1 != null),
        `idle ${idle}, present ${w.present}, busy ${s.nav && s.nav.busy}`);
      await c.shot('04-after-jump-s1');
    });

    await runCase(sess, '5', 'bill burn: TAP & HOLD shown over the .bg portal', async (c) => {
      const target = await page.evaluate(() => window.__buildanta.intro.rawForBillTransition(0.8));
      c.data.target = target;
      await seek(page, target, c);
      await billReady(page);
      await sleep(page, 300);
      await goRaw(page, target);
      await until(page, () => {
        const h = document.querySelector('.intro__portalwrap .bh-hold');
        return Boolean(h) && !h.classList.contains('is-off') && parseFloat(getComputedStyle(h).opacity) > 0.5;
      }, 8000);
      await sleep(page, 600);
      const s = await snap(page);
      c.check('portal wrap is .bg (the sky behind the burning bill), not .on', s.portalBg && !s.portalOn, holdInfo(s));
      c.check('.bh-hold exists inside .intro__portalwrap', Boolean(s.hold), holdInfo(s));
      c.check('.bh-hold has no .is-off and is painted', Boolean(s.hold) && !s.hold.off && s.hold.opacity > 0.5,
        s.hold ? `is-off ${s.hold.off}, opacity ${s.hold.opacity}` : 'absent');
      await c.shot('05-bill-burn-hold');
    });

    await runCase(sess, '6', "wall via the navbar: go('s4'), wheel-up does not dismiss it", async (c) => {
      await armWatch(page);
      await go(page, 's4');
      overlayChecks(c, await watchResult(page), "go('s4')");
      await billReady(page);
      const engaged = await wallLive(page, 20000);
      let s = await snap(page);
      c.check('portal .on, module ready, TAP & HOLD shown', engaged, holdInfo(s));
      c.check('activeId s4, floorRaw = wallRaw', s.nav && s.nav.activeId === 's4' && Math.abs(s.nav.floorRaw - S.s4) <= 1e-6,
        `activeId ${s.nav && s.nav.activeId}, floorRaw ${fmt(s.nav && s.nav.floorRaw)} vs ${fmt(S.s4)}`);
      c.check('raw at the wall', s.raw >= S.s4 - tol && s.raw <= S.s4 + 0.01, `raw ${fmt(s.raw)}, wallRaw ${fmt(S.s4)}`);
      await sleep(page, 1200);    // the portal canvas fades in over the CSS sky
      await c.shot('06-wall');
      const r = await wheel(page, 5, -1200);
      s = r.after;
      c.check('5 wheel-ups: portal still .on, not dismissed', s.portalOn && s.bhpReady && s.holdShown, holdInfo(s));
      c.check('5 wheel-ups: still s4 at the wall', s.nav && s.nav.activeId === 's4' && s.raw >= S.s4 - tol,
        `activeId ${s.nav && s.nav.activeId}, raw ${fmt(s.raw)} (${((s.raw - S.s4) / tol).toFixed(1)} px from the wall), lowest ${fmt(r.min)}`);
    });

    await runCase(sess, '7', 'ENTER is a circle: after a real hold, after focus, with :focus-visible', async (c) => {
      await ensureWall(page, c);
      const hole = await holeCentre(page);
      await page.mouse.move(hole.x, hole.y, { steps: 2 });
      await page.mouse.down();
      const t0 = Date.now();
      const armed = await until(page, () => window.__bhp && window.__bhp.state().phase === 'armed', 15000);
      const holdMs = Date.now() - t0;
      if (!armed) {
        const ph = await page.evaluate(() => {
          const b = window.__bhp;
          if (!b) return 'no module';
          if (!b.state().down) b.press();
          for (let k = 0; k < 400 && b.state().phase !== 'armed'; k++) b.step(1);
          return b.state().phase;
        });
        c.note(`real hold did not arm; stepped the module while held -> ${ph} (so the circle can still be measured)`);
      }
      await page.mouse.up();
      c.check('a real mouse hold on the hole arms the door', armed,
        `${armed ? holdMs + ' ms' : 'not armed in 15 s'}, hole at ${hole.x.toFixed(0)},${hole.y.toFixed(0)} (${hole.phase})`);
      await twoFrames(page);
      await sleep(page, 250);
      const phase = await page.evaluate(() => window.__bhp && window.__bhp.state().phase);
      c.check('release keeps the door (phase armed)', phase === 'armed', `phase ${phase}`);
      const m1 = await measureDoor(page);
      c.data.armed = m1;
      c.check('ENTER is a circle right after arming', m1 && m1.circle, fmtDoor(m1));
      if (m1 && m1.radius !== '50%') c.warn(`border-radius computes to "${m1.radius}", contract says 50%`);
      await c.shot('07-enter-armed');

      await page.evaluate(() => { const el = document.querySelector('.bh-portal'); if (el) { el.blur(); el.focus(); } });
      await twoFrames(page);
      const m2 = await measureDoor(page);
      c.data.focused = m2;
      c.check('ENTER is a circle after focus()', m2 && m2.focused && m2.circle, fmtDoor(m2));
      await c.shot('07-enter-focused');

      /* The bug was a leaked `button:focus-visible { border-radius: 2px }`.
         Programmatic focus after a mouse interaction does not match
         :focus-visible, so force it the way DevTools' element-state panel does. */
      let cdp = null;
      try {
        cdp = await page.context().newCDPSession(page);
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.bh-portal' });
        if (!nodeId) throw new Error('.bh-portal not found through CDP');
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
        await twoFrames(page);
        const m3 = await measureDoor(page);
        c.data.focusVisible = m3;
        c.check('ENTER is a circle with :focus-visible forced', m3 && m3.circle, fmtDoor(m3));
        await c.shot('07-enter-focus-visible');
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      } catch (e) {
        c.warn(`could not force :focus-visible through CDP: ${String(e.message).split('\n')[0]}`);
      } finally {
        if (cdp) await cdp.detach().catch(() => {});
      }
    });

    await runCase(sess, '8', 'ride: ENTER lands on s5, wheel-up stays there', async (c) => {
      await ensureArmed(page, c);
      const click = await clickReal(page, '.bh-portal');
      c.check('ENTER is topmost at its centre', click.isTop, click.top);
      /* ~3.3 s of wall clock on real hardware; under swiftshader the
         Gargantua starves the page (r1: one state read ~38 s; r2: a 60 s
         wait timed out with the right state one read later). */
      const ride = await settle(page, () => {
        const st = window.__sectionNav.state();
        const ctas = [...document.querySelectorAll('.finale-cta')];
        return st.activeId === 's5' && ctas.length >= 2 && ctas.every((x) => x.classList.contains('finale-cta--in'));
      }, HEAVY_WAIT);
      let s = await snap(page);
      c.check('ride ends on s5 with Contact + Projects in', ride.ok,
        `${ride.s.toFixed(1)} s, activeId ${s.nav && s.nav.activeId}, ctasIn ${s.ctasIn}, raw ${fmt(s.raw)}`);
      const slow = slowNote(ride, 'the ride', 15);
      if (slow) c.warn(slow);
      const s5 = s.nav && s.nav.sections && s.nav.sections[4];
      c.data.s5 = { raw: s.raw, floorRaw: s.nav && s.nav.floorRaw, sectionRaw: s5 && s5.raw };
      await sleep(page, 800);
      const r = await wheel(page, 5, -1200);
      s = r.after;
      c.check('5 wheel-ups: still s5, CTAs still in', s.nav && s.nav.activeId === 's5' && s.ctasIn,
        `activeId ${s.nav && s.nav.activeId}, ctasIn ${s.ctasIn}`);
      c.check('5 wheel-ups: the film did not rewind', s.raw >= r.before.raw - tol,
        `raw ${fmt(r.before.raw)} -> ${fmt(s.raw)}, lowest ${fmt(r.min)}`);
      if (s5 && typeof s5.raw === 'number' && s.raw < s5.raw - tol) c.warn(`raw ${fmt(s.raw)} sits above s5's own start ${fmt(s5.raw)}`);
      await c.shot('08-finale');
    });

    const flyIn = () => settle(page, () => document.documentElement.classList.contains('finale-inside'), HEAVY_WAIT);
    const flownOut = () => settle(page, () => Boolean(window.__finale) && window.__finale.state().flight < 0.001, HEAVY_WAIT);

    await runCase(sess, '9', 'ship: Leave the Ship replaces wheel-up as the way out', async (c) => {
      await ensureFinale(page, c);
      const click = await clickReal(page, '.finale-cta:not(.finale-cta--world)');
      c.check('Contact us is topmost at its centre', click.isTop, click.top);
      const fin = await flyIn();
      c.check('flies into the Endurance (html.finale-inside)', fin.ok, `${fin.s.toFixed(1)} s, flight ${fmt((await snap(page)).flight, 3)}`);
      const slowIn = slowNote(fin, 'the flight in', 25);
      if (slowIn) c.warn(slowIn);

      visCheck(c, '.finale-ship-exit shown at opacity 1', await settleVis(page, '.finale-ship-exit', 'in'));
      const ex = await page.evaluate(() => {
        const b = document.querySelector('.finale-ship-exit');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { tag: b.tagName, text: b.textContent.trim(), cx: r.left + r.width / 2, top: r.top, W: innerWidth,
          isTop: Boolean(hit) && (hit === b || b.contains(hit)) };
      });
      c.data.shipExit = ex;
      c.check('it is a <button> with text exactly "← Leave the Ship"', ex && ex.tag === 'BUTTON' && ex.text === SHIP_EXIT_TEXT,
        ex ? `${ex.tag} ${JSON.stringify(ex.text)}` : 'absent');
      c.check('it sits at the top centre and is topmost', ex && Math.abs(ex.cx - ex.W / 2) <= 40 && ex.top <= 100 && ex.isTop,
        ex ? `centre x ${ex.cx.toFixed(1)} of ${ex.W}, top ${ex.top.toFixed(1)}, topmost ${ex.isTop}` : 'absent');
      let s = await snap(page);
      const hid = await settle(page, () => window.__sectionNav.state().visible === false, 20000);
      c.check('state().visible false inside the ship', hid.ok, `after ${hid.s.toFixed(1)} s`);
      visCheck(c, 'ruler not painted inside the ship', await settleVis(page, '.bz-ruler', 'out'));

      const r = await wheel(page, 6, -600);
      c.check('6 wheel-ups do NOT fly out (flight > 0.95)', r.after.flight > 0.95 && r.after.finaleInside,
        `flight ${fmt(r.before.flight, 3)} -> ${fmt(r.after.flight, 3)}, inside ${r.after.finaleInside}`);

      const click2 = await clickReal(page, '.finale-ship-exit');
      const fout = await flownOut();
      c.check('Leave the Ship flies back out (flight -> 0)', fout.ok,
        `${fout.s.toFixed(1)} s, click ${click2.isTop ? 'topmost' : 'landed on ' + click2.top}`);
      const slowOut = slowNote(fout, 'the flight out', 2.4 + 5);
      if (slowOut) c.warn(slowOut);
      const back = await settle(page, () => window.__snavT.snap().ctasIn, 20000);
      s = await snap(page);
      c.check('Contact + Projects back in', back.ok, `ctasIn ${s.ctasIn}, flight ${fmt(s.flight, 4)}`);
      const shw = await settle(page, () => window.__sectionNav.state().visible === true, 20000);
      c.check('state().visible true again', shw.ok, `after ${shw.s.toFixed(1)} s`);
      visCheck(c, 'ruler painted again', await settleVis(page, '.bz-ruler', 'in'));
      const gone = await settleVis(page, '.finale-ship-exit', 'out', 5000);
      if (!gone.ok && !gone.fading) c.warn(`.finale-ship-exit still painted outside the ship: ${JSON.stringify(gone.vis)}`);
      await c.shot('09-back-out');
      /* The inside frame is the heavy capture: fly back in and shoot it LAST,
         so a capture timeout (a warning) can never mask an assertion. Case 9b
         starts from inside and leaves with Esc. */
      await clickReal(page, '.finale-cta:not(.finale-cta--world)');
      if ((await flyIn()).ok) {
        await settleVis(page, '.finale-ship-exit', 'in');
        await c.shot('09-inside-ship');
      }
    });

    await runCase(sess, '9b', 'ship: Esc still leaves', async (c) => {
      let s = await snap(page);
      if (!s.finaleInside) {
        await ensureFinale(page, c);
        await clickReal(page, '.finale-cta:not(.finale-cta--world)');
      } else c.note('starts inside the ship (case 9 flew back in for its screenshot)');
      const fin = await flyIn();
      c.check('inside the Endurance', fin.ok, `${fin.s.toFixed(1)} s, flight ${fmt((await snap(page)).flight, 3)}`);
      await page.keyboard.press('Escape');
      const fout = await flownOut();
      c.check('Esc flies back out (flight -> 0)', fout.ok, `${fout.s.toFixed(1)} s`);
      const slowOut = slowNote(fout, 'the flight out', 2.4 + 5);
      if (slowOut) c.warn(slowOut);
      const back = await settle(page, () => window.__snavT.snap().ctasIn, 20000);
      s = await snap(page);
      c.check('Contact + Projects back in, state().visible true', back.ok && s.nav && s.nav.visible === true,
        `ctasIn ${s.ctasIn}, visible ${s.nav && s.nav.visible}`);
      visCheck(c, 'ruler painted again', await settleVis(page, '.bz-ruler', 'in'));
    });

    await runCase(sess, '10', 'world: ruler hidden inside, #world-exit brings it back', async (c) => {
      await ensureFinale(page, c);
      const click = await clickReal(page, '.finale-cta--world');
      c.check('Projects is topmost at its centre', click.isTop, click.top);
      const fall = await settle(page, () => document.documentElement.classList.contains('is-in-world'), 2 * HEAVY_WAIT);
      c.check('falls into the world (html.is-in-world)', fall.ok, `${fall.s.toFixed(1)} s`);
      const slowFall = slowNote(fall, 'the fall', 5.4 + 12);
      if (slowFall) c.warn(slowFall);
      let s = await snap(page);
      const hidW = await settle(page, () => window.__sectionNav.state().visible === false, 20000);
      c.check('state().visible false in the world', hidW.ok, `after ${hidW.s.toFixed(1)} s`);
      visCheck(c, 'ruler not painted in the world', await settleVis(page, '.bz-ruler', 'out'));
      visCheck(c, '#world-exit shown at opacity 1', await settleVis(page, '#world-exit', 'in'));
      const click2 = await clickReal(page, '#world-exit');
      c.check('#world-exit is topmost at its centre', click2.isTop, click2.top);
      const rise = await settle(page, () => !document.documentElement.classList.contains('is-in-world')
        && Boolean(window.__worldFall) && window.__worldFall.state === 'out', HEAVY_WAIT);
      c.check('returns from the world', rise.ok, `${rise.s.toFixed(1)} s, fall state ${(await snap(page)).worldFall}`);
      const slowRise = slowNote(rise, 'the way out', 0.4 + 4.6 + 2);
      if (slowRise) c.warn(slowRise);
      // `visible` is recomputed on the next GSAP tick after the fall reports
      // 'out' - wait for it rather than reading the same instant (r2 race)
      const vis = await settle(page, () => window.__sectionNav.state().visible === true, 20000);
      s = await snap(page);
      c.check('state().visible true again', vis.ok, `visible ${s.nav && s.nav.visible} after ${vis.s.toFixed(1)} s`);
      visCheck(c, 'ruler painted again', await settleVis(page, '.bz-ruler', 'in'));
      if (!s.ctasIn) c.warn('Contact / Projects not back in after leaving the world');
      await c.shot('10-back-from-world');
    });

    await runCase(sess, '11', "re-arm: go('s2') then go('s4') and the wall works again", async (c) => {
      await leaveShipAndWorld(page, c);
      await armWatch(page);
      await go(page, 's2');
      overlayChecks(c, await watchResult(page), "go('s2')");
      let s = await snap(page);
      c.check('lands on s2', s.nav && s.nav.activeId === 's2' && Math.abs(s.raw - S.s2) <= 2 * tol,
        `activeId ${s.nav && s.nav.activeId}, raw ${fmt(s.raw)} vs ${fmt(S.s2)}`);
      await go(page, 's4');
      await billReady(page);
      const engaged = await wallLive(page, 20000);
      s = await snap(page);
      c.check('wall engaged again: portal .on, TAP & HOLD shown', engaged, holdInfo(s));
      c.check('activeId s4, module idle', s.nav && s.nav.activeId === 's4' && s.phase === 'idle', holdInfo(s));
      await sleep(page, 1200);
      await c.shot('11-rearmed-wall');
      if (engaged) {
        const hole = await holeCentre(page);
        await page.mouse.move(hole.x, hole.y, { steps: 2 });
        await page.mouse.down();
        const wound = await until(page, () => {
          const st = window.__bhp && window.__bhp.state();
          return Boolean(st) && st.down && (st.phase === 'winding' || st.phase === 'collapsing');
        }, 4000);
        const hs = await page.evaluate(() => { const st = window.__bhp && window.__bhp.state(); return st && { phase: st.phase, c: st.c, down: st.down }; });
        await page.mouse.up();
        await until(page, () => window.__bhp && window.__bhp.state().phase === 'idle', 6000);
        c.check('a real press winds the hole (the door is not locked)', wound, JSON.stringify(hs));
      }
    });

    await runCase(sess, '12', 'theme: .bz-ink over the meadow only', async (c) => {
      const z = await page.evaluate(() => ({ a: window.__buildanta.intro.rawForZeroStage(0.5), b: window.__buildanta.intro.rawForZeroStage(0.99) }));
      c.data.zeroStage = z;
      for (const [tag, raw] of [['0.50', z.a], ['0.99', z.b]]) {
        await leaveShipAndWorld(page, c);
        await seek(page, raw, c);
        await sleep(page, 600);
        const t = await snap(page);
        c.check(`.bz-ink at rawForZeroStage(${tag})`, t.ink === true,
          `raw ${fmt(t.raw)} vs ${fmt(raw)}, activeId ${t.nav && t.nav.activeId}, theme ${JSON.stringify(t.nav && t.nav.theme)}`);
        await c.shot(`12-ink-zero-${tag}`);
        await c.shot(`12-ink-zero-${tag}-ruler`, '.bz-ruler');
      }
      await go(page, 's1');
      await sleep(page, 800);
      let t = await snap(page);
      c.check('no .bz-ink at raw 0', t.ink === false && Math.abs(t.raw) <= 2 * tol,
        `ink ${t.ink}, raw ${fmt(t.raw)}, theme ${JSON.stringify(t.nav && t.nav.theme)}`);
      await c.shot('12-plain-raw0-ruler', '.bz-ruler');
      await go(page, 's4');
      await billReady(page);
      await wallLive(page, 20000);
      await sleep(page, 800);
      t = await snap(page);
      c.check('no .bz-ink at the wall', t.ink === false && t.portalOn,
        `ink ${t.ink}, ${holdInfo(t)}, theme ${JSON.stringify(t.nav && t.nav.theme)}`);
      await c.shot('12-plain-wall-ruler', '.bz-ruler');
    });
  } finally {
    await closeSession(sess, 'E1');
  }
}

/* ══ fresh desktop: case 13 ═══════════════════════════════════════════════ */
async function skipSession(browser) {
  let sess;
  try { sess = await openSession(browser, 'skip', { viewport: DESKTOP, deviceScaleFactor: 1 }); }
  catch (e) { if (e.fatal) throw e; bootFail('skip', ['13'], e); return; }
  const { page } = sess;
  const S = sess.S;
  const tol = S.pxRaw;
  try {
    await runCase(sess, '13', 'Skip intro jumps to s4 through the overlay', async (c) => {
      await armWatch(page);
      const click = await clickReal(page, '[data-skip]');
      c.check('Skip intro is topmost at its centre', click.isTop, click.top);
      const t0 = Date.now();
      const landed = await until(page, () => {
        const s = window.__sectionNav && window.__sectionNav.state();
        return Boolean(s) && s.activeId === 's4' && !s.busy && !document.querySelector('.bz-pt');
      }, 60000);
      const w = await watchResult(page);
      c.data.overlay = w;
      overlayChecks(c, w, 'skip');
      let s = await snap(page);
      c.check('ends on s4 at the wall', landed && s.raw >= S.s4 - tol && s.raw <= S.s4 + 0.01,
        `${((Date.now() - t0) / 1000).toFixed(1)} s, activeId ${s.nav && s.nav.activeId}, raw ${fmt(s.raw)} vs wallRaw ${fmt(S.s4)}`);
      await billReady(page);
      const engaged = await wallLive(page, 20000);
      s = await snap(page);
      c.check('the wall engages (portal .on, TAP & HOLD shown)', engaged, holdInfo(s));
      await sleep(page, 1200);
      await c.shot('13-skip-landed');
    });
  } finally {
    await closeSession(sess, 'E2');
  }
}

/* ══ phone: cases 14–15 ═══════════════════════════════════════════════════ */
async function phoneSession(browser) {
  let sess;
  try { sess = await openSession(browser, 'phone', { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); }
  catch (e) { if (e.fatal) throw e; bootFail('phone', PHONE_CASES, e); return; }
  const { page } = sess;
  const S = sess.S;
  report.expected.phone = S;
  const tol = S.pxRaw;
  const s2mid = (S.s2 + S.s3) / 2;
  try {
    await runCase(sess, '14', 'phone: .bz-mtl count + menu, "25 BZ" lands on s4', async (c) => {
      await until(page, () => window.__snavT.vis(document.querySelector('.bz-mtl')).shown, 8000);
      const m = await page.evaluate(() => {
        const T = window.__snavT;
        const cnt = document.querySelector('.bz-mtl__count');
        return { mtl: T.vis(document.querySelector('.bz-mtl')), count: cnt ? cnt.textContent : null,
          rulerNav: [...document.querySelectorAll('.bz-ruler__nav-btn')].some((b) => T.vis(b).shown),
          activeId: window.__sectionNav && window.__sectionNav.state().activeId };
      });
      c.check('.bz-mtl visible', m.mtl.shown, JSON.stringify(m.mtl));
      c.check('.bz-mtl__count reads "100 BZ" (unsigned)', norm(m.count) === '100 BZ', `${JSON.stringify(m.count)}, activeId ${m.activeId}`);
      if (m.rulerNav) c.warn('desktop .bz-ruler__nav-btn buttons are painted on the phone');
      await c.shot('14-phone-closed');

      const tap = await clickReal(page, '.bz-mtl__count', { touch: true });
      if (!tap.isTop) c.warn(`the count is covered at its centre by ${tap.top}`);
      const open = await until(page, () => Boolean(document.querySelector('.bz-mtl-menu.is-open')), 3000);
      c.check('tap opens .bz-mtl-menu.is-open', open);
      // the menu fades in over .18 s; on this clock that can take seconds (r1)
      await until(page, () => {
        const its = [...document.querySelectorAll('.bz-mtl-menu.is-open button.bz-mtl-menu__item')];
        return its.length === 5 && its.every((i) => window.__snavT.vis(i).shown);
      }, 8000);
      const items = await page.evaluate(() => {
        const T = window.__snavT;
        const its = [...document.querySelectorAll('.bz-mtl-menu.is-open button.bz-mtl-menu__item')];
        return { labels: its.map((i) => T.norm(i.textContent)), vis: its.map((i) => T.vis(i)),
          menuFade: T.fade(document.querySelector('.bz-mtl-menu')) };
      });
      c.data.menu = items;
      c.check('5 button.bz-mtl-menu__item, unsigned labels', same(items.labels, PHONE_LABELS), items.labels.join(' / '));
      const allShown = items.vis.length === 5 && items.vis.every((v) => v.shown);
      c.check('all 5 items visible', allShown || (items.menuFade && items.menuFade.running.length > 0 && items.menuFade.target >= 0.99),
        `${items.vis.map((v) => `${v.shown ? 'shown' : 'NOT shown'} op ${v.opacity} @${v.rect.join(',')}`).join(' | ')}; menu fade ${JSON.stringify(items.menuFade)}`);
      if (!allShown) c.warn('menu items still mid-fade after 8 s (starved animation clock), target opacity is 1');
      await c.shot('14-phone-open');

      await armWatch(page);
      const pick = await clickReal(page, 'button.bz-mtl-menu__item', { text: '25 BZ', touch: true });
      c.check('"25 BZ" is topmost at its centre', pick.isTop, pick.top);
      const t0 = Date.now();
      const landed = await until(page, () => {
        const s = window.__sectionNav && window.__sectionNav.state();
        return Boolean(s) && s.activeId === 's4' && !s.busy && !document.querySelector('.bz-pt');
      }, 60000);
      const w = await watchResult(page);
      overlayChecks(c, w, 'phone jump');
      const s = await snap(page);
      c.check('lands on s4 (the wall)', landed && s.raw >= S.s4 - tol && s.raw <= S.s4 + 0.01,
        `${((Date.now() - t0) / 1000).toFixed(1)} s, activeId ${s.nav && s.nav.activeId}, raw ${fmt(s.raw)} vs wallRaw ${fmt(S.s4)}`);
      const after = await page.evaluate(() => ({ open: Boolean(document.querySelector('.bz-mtl-menu.is-open')),
        count: (document.querySelector('.bz-mtl__count') || {}).textContent }));
      if (after.open) c.warn('menu still open after the jump');
      c.check('.bz-mtl__count reads "25 BZ" on s4 (unsigned)', norm(after.count) === '25 BZ', JSON.stringify(after.count));
      await billReady(page);
      await wallLive(page, 20000);
      await sleep(page, 1200);
      await c.shot('14-phone-s4');
    });

    await runCase(sess, '15', 'phone: touch drags cannot scroll above the section', async (c) => {
      const s = await seek(page, s2mid, c);
      c.check('mid s2 -> activeId s2', s.nav && s.nav.activeId === 's2', `activeId ${s.nav && s.nav.activeId}, raw ${fmt(s.raw)}`);
      /* Raw touch events through the browser's input pipeline (touchstart /
         touchmove / touchend -> native touch scrolling), because Lenis leaves
         touch native here. NOT Input.synthesizeScrollGesture: measured in r1
         and a probe, it moved this page 0 px while a dispatched drag moved it. */
      const cdp = await page.context().newCDPSession(page);
      const x = Math.round(PHONE.width / 2);
      const drag = async (y0, y1, steps = 16) => {
        const tp = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: Math.round(y) }] });
        await withTimeout((async () => {
          await tp('touchStart', y0);
          for (let k = 1; k <= steps; k++) { await tp('touchMove', y0 + ((y1 - y0) * k) / steps); await sleep(page, 16); }
          await tp('touchEnd');
        })(), 30000, 'touch drag');
      };
      try {
        const b0 = await snap(page);
        await drag(620, 320);                      // finger up = film forward
        await sleep(page, 1000);
        const b1 = await snap(page);
        const fwd = (b1.raw - b0.raw) / tol;
        c.check('control: a forward touch drag scrolls the film', fwd > 5, `${fwd.toFixed(0)} px forward for a 300 px drag`);
        /* Start 150 px inside s2 so each drag-down overshoots the start:
           exercises the touchmove guard AND the scroll backstop behind it. */
        await goRaw(page, S.s2 + 150 * tol);
        await sleep(page, 800);
        const b2 = await snap(page);
        await page.evaluate(() => window.__snavT.minStart());
        for (let k = 0; k < 3; k++) { await drag(200, 760); await sleep(page, 250); }
        await sleep(page, 1200);
        const mm = await page.evaluate(() => window.__snavT.minStop());
        lockCheck(c, 'touch drag-down 3 x 560 px from 150 px inside s2', { before: b2, after: await snap(page), min: mm.min }, S.s2, tol);
      } finally {
        await cdp.detach().catch(() => {});
      }
    });
  } finally {
    await closeSession(sess, 'E3');
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    // instant native key scrolling: on this starved clock Chrome's animated
    // PageDown landed after the measuring window (r3). Lenis owns the wheel.
    args: ['--use-angle=swiftshader', '--disable-smooth-scrolling'] });
  try {
    if (DESKTOP_CASES.some(want)) await desktopSession(browser);
    if (want('13')) await skipSession(browser);
    if (PHONE_CASES.some(want)) await phoneSession(browser);
  } finally {
    await browser.close().catch(() => {});
  }
  report.finishedAt = new Date().toISOString();
  writeReport();
  const fails = report.cases.filter((c) => c.status === 'FAIL');
  console.log('\n  case  result  warn  name');
  for (const c of report.cases) {
    console.log(`  ${c.id.padEnd(4)}  ${c.status.padEnd(6)}  ${String(c.warnings.length).padStart(4)}  ${c.name}`);
  }
  console.log(`\n${report.cases.length - fails.length}/${report.cases.length} cases passed -> ${path.join(OUT, 'report.json')}`);
  if (fails.length) console.log(`FAILED: ${fails.map((c) => c.id).join(', ')}`);
  process.exitCode = fails.length ? 1 : 0;
})().catch((e) => {
  console.error('ABORT', e);
  try { report.aborted = String((e && e.message) || e); report.finishedAt = new Date().toISOString(); writeReport(); } catch { /* best effort */ }
  process.exit(2);
});
