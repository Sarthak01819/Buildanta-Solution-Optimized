// Portal-wall acceptance (adapted from black-hole-bg/tools/probe-v3):
//  1. reaching the wall engages the portal (lenis stopped, starfield on)
//  1b. TAP & HOLD (D-077): the button exists and is visible at the wall,
//      rides the hole (two far-apart pointer targets, centre within 3 px of
//      the module's own hole centre), fills its ring with the collapse
//      progress while the pointer is held, empties it again on release
//  2. hold → collapse → ARMED: real button, focused; release keeps the door;
//     the TAP & HOLD button hides while the door is open
//  3. click ENTER → bh:enter intercepted → the Gargantua beat auto-rides
//     → gate → hero (scroll lands at pin end)
//  4. re-arm cycle + Esc return path → back into the consult world
//  5. console stays silent throughout
//
//   SITE_URL=http://127.0.0.1:5303/ node tools/verify-portal.cjs
const fs = require('fs');
const path = require('path');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';   // as the other tools: the armed-state shot hangs without it
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.APPDATA,
  'npm/node_modules/@playwright/cli/node_modules/playwright'))); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FOLLOW_TOL = 3;   // px — button centre vs the module's hole centre

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  if (!/^buildanta solutions/i.test(await page.title())) throw new Error('WRONG SERVER');
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));

  const goRaw = (f) => page.evaluate((raw) => {
    const { intro, lenis } = window.__buildanta;
    const y = intro.st.start + (intro.st.end - intro.st.start) * raw;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, f);
  const sleep = (ms) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);
  const twoFrames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // 1 — hit the wall (position asked of the page, never hardcoded). The wall
  //     only engages once the bill beat's assets have settled (ready|failed).
  const WALL = await page.evaluate('window.__buildanta.intro.wallRaw');
  await goRaw(WALL - 0.02);
  await page.waitForFunction(() => {
    const b = window.__buildanta.intro.billTransition;
    return !b || b.ready || b.failed;
  }, null, { timeout: 60000 });
  await sleep(300);
  await goRaw(WALL + 0.004);
  await page.waitForFunction('document.querySelector(".intro__portalwrap")?.classList.contains("on")', null, { timeout: 5000 });
  await page.waitForFunction('window.__bhp && window.__bhp.ready === true', null, { timeout: 15000 });
  console.log('1. wall engaged, portal module live ✓');
  fs.mkdirSync('shots-journey/portal', { recursive: true });
  await sleep(1200);
  await page.screenshot({ path: 'shots-journey/portal/1-wall.png' });

  // 1b — TAP & HOLD exists and is visible at the wall
  await page.waitForFunction(() => {
    const el = document.querySelector('.intro__portalwrap .bh-hold');
    return el && !el.classList.contains('is-off') && parseFloat(getComputedStyle(el).opacity) > 0.95;
  }, null, { timeout: 3000 });
  const holdInfo = await page.evaluate(() => {
    const el = document.querySelector('.intro__portalwrap .bh-hold');
    const cs = getComputedStyle(el);
    return { label: el.querySelector('.bh-hold__label').textContent.trim(), pe: cs.pointerEvents,
      aria: el.getAttribute('aria-hidden'), ring: Boolean(el.querySelector('.bh-hold__fill')) };
  });
  if (holdInfo.label !== 'TAP & HOLD') throw new Error('hold label wrong: ' + JSON.stringify(holdInfo));
  if (holdInfo.pe !== 'none') throw new Error('hold button must be pointer-events none: ' + JSON.stringify(holdInfo));
  if (holdInfo.aria !== 'true' || !holdInfo.ring) throw new Error('hold button shape wrong: ' + JSON.stringify(holdInfo));
  if (await page.$('.bh-hint')) throw new Error('the old HOLD whisper is still in the DOM');
  console.log('1b. TAP & HOLD visible at the wall ✓', JSON.stringify(holdInfo));

  // 1c — it RIDES the hole: two far-apart pointer targets, both inside the
  //      module's 84 px ENTER clamp. The module is paused while we read so
  //      the hole and the button are compared on the same frame.
  const readFollow = () => page.evaluate(() => {
    const s = window.__bhp.state();
    const r = document.querySelector('.intro__portalwrap .bh-hold').getBoundingClientRect();
    const hx = s.x / s.dpr, hy = (s.size - s.y) / s.dpr;
    const bx = r.left + r.width / 2, by = r.top + r.height / 2;
    return { hx, hy, bx, by, err: Math.hypot(bx - hx, by - hy), phase: s.phase };
  });
  const follows = [];
  for (const [mx, my] of [[200, 160], [1080, 560]]) {
    await page.mouse.move(mx, my, { steps: 4 });
    await page.evaluate(() => { window.__bhp.pause(); window.__bhp.step(40); });
    await twoFrames();
    const f = await readFollow();
    await page.evaluate(() => window.__bhp.resume());
    follows.push({ target: [mx, my], ...f });
    if (f.err > FOLLOW_TOL) throw new Error('hold button does not ride the hole: ' + JSON.stringify(follows));
  }
  const apart = Math.hypot(follows[1].bx - follows[0].bx, follows[1].by - follows[0].by);
  if (apart < 400) throw new Error('the hole did not move between the two targets: ' + JSON.stringify(follows));
  const followErr = Math.max(...follows.map((f) => f.err));
  console.log(`1c. rides the hole: max centre error ${followErr.toFixed(2)} px over ${apart.toFixed(0)} px of travel ✓`,
    JSON.stringify(follows.map((f) => ({ target: f.target, hole: [f.hx.toFixed(1), f.hy.toFixed(1)], btn: [f.bx.toFixed(1), f.by.toFixed(1)] }))));

  // 1d — press ON the button: the module winds, the ring fills with c
  const centre = await readFollow();
  await page.mouse.move(centre.bx, centre.by);
  await page.mouse.down();
  await page.evaluate(() => { window.__bhp.pause(); window.__bhp.step(60); });
  await twoFrames();
  const held = await page.evaluate(() => {
    const s = window.__bhp.state();
    const el = document.querySelector('.intro__portalwrap .bh-hold');
    return { phase: s.phase, down: s.down, c: s.c, holdT: s.holdT,
      ring: 1 - parseFloat(el.querySelector('.bh-hold__fill').style.strokeDashoffset),
      dataC: parseFloat(el.dataset.c), hold: el.classList.contains('is-hold'), off: el.classList.contains('is-off') };
  });
  await page.evaluate(() => window.__bhp.resume());
  if (!(held.phase === 'winding' || held.phase === 'collapsing')) throw new Error('hold did not wind: ' + JSON.stringify(held));
  if (!held.down || !held.hold || held.off) throw new Error('hold state not shown: ' + JSON.stringify(held));
  if (Math.abs(held.ring - held.c) > 0.03 || Math.abs(held.dataC - held.c) > 0.03) throw new Error('ring does not reflect c: ' + JSON.stringify(held));
  console.log(`1d. holding: phase ${held.phase}, c ${held.c.toFixed(3)}, ring ${held.ring.toFixed(3)} ✓`);

  // hold a little longer so the ring is visibly partial, then let go early
  await page.evaluate(() => { window.__bhp.pause(); window.__bhp.step(30); });
  await twoFrames();
  const mid = await page.evaluate(() => ({ c: window.__bhp.state().c, phase: window.__bhp.state().phase,
    ring: parseFloat(document.querySelector('.intro__portalwrap .bh-hold').dataset.c) }));
  await page.evaluate(() => window.__bhp.resume());
  if (!(mid.c > 0.05 && mid.c < 0.95) || Math.abs(mid.ring - mid.c) > 0.03) throw new Error('mid-hold ring wrong: ' + JSON.stringify(mid));
  await page.mouse.up();
  await page.waitForFunction(() => window.__bhp.state().phase === 'idle' && !window.__bhp.state().down, null, { timeout: 4000 });
  await twoFrames();
  const released = await page.evaluate(() => {
    const s = window.__bhp.state();
    const el = document.querySelector('.intro__portalwrap .bh-hold');
    return { phase: s.phase, c: s.c, ring: parseFloat(el.dataset.c), hold: el.classList.contains('is-hold'),
      off: el.classList.contains('is-off') };
  });
  if (released.ring !== 0 || released.hold || released.off) throw new Error('release did not empty the ring: ' + JSON.stringify(released));
  console.log(`1e. released at c ${mid.c.toFixed(2)} → idle, ring empty, button still shown ✓`);

  // 2 — hold to ARMED (the TAP & HOLD button yields to the real door)
  await page.evaluate(() => { window.__bhp.press(); window.__bhp.step(175); });
  const phase = await page.evaluate(() => window.__bhp.state().phase);
  if (phase !== 'armed') throw new Error('not armed after full hold, phase=' + phase);
  const focused = await page.evaluate(() => document.activeElement?.className === 'bh-portal');
  if (!focused) throw new Error('portal button not focused');
  await page.waitForFunction(() => {
    const el = document.querySelector('.intro__portalwrap .bh-hold');
    return el && el.classList.contains('is-off') && parseFloat(getComputedStyle(el).opacity) < 0.05;
  }, null, { timeout: 2000 });
  const doorAt = await page.evaluate(() => {
    const d = document.querySelector('.bh-portal').getBoundingClientRect();
    const h = document.querySelector('.intro__portalwrap .bh-hold').getBoundingClientRect();
    return { door: [d.left + d.width / 2, d.top + d.height / 2], hold: [h.left + h.width / 2, h.top + h.height / 2] };
  });
  const doorErr = Math.hypot(doorAt.door[0] - doorAt.hold[0], doorAt.door[1] - doorAt.hold[1]);
  if (doorErr > FOLLOW_TOL) throw new Error('ENTER opened away from where TAP & HOLD was: ' + JSON.stringify(doorAt));
  console.log(`2. armed: door open where the hold button was (${doorErr.toFixed(2)} px), hold button hidden, ENTER focused ✓`);
  await sleep(400);
  await page.screenshot({ path: 'shots-journey/portal/2-armed.png' });

  // 3 — ENTER → supernova → the ride SETTLES on the living hole (finale)
  await page.click('.bh-portal');
  await sleep(700);
  await page.screenshot({ path: 'shots-journey/portal/3-supernova.png' });
  await sleep(4000);
  const landed = await page.evaluate(() => {
    const beatCanvas = document.querySelector('.intro__blackhole canvas');
    return {
      y: Math.round(scrollY),
      beatOpacity: beatCanvas ? beatCanvas.style.opacity : null,
      siteHidden: getComputedStyle(document.querySelector('#top')).display === 'none',
      siteIn: getComputedStyle(document.documentElement).getPropertyValue('--site-in').trim(),
      hold: Boolean(document.querySelector('.bh-hold')),
    };
  });
  if (!(parseFloat(landed.beatOpacity) >= 0.999)) throw new Error('living hole not visible: ' + JSON.stringify(landed));
  if (!landed.siteHidden) throw new Error('blue site not hidden: ' + JSON.stringify(landed));
  if (landed.hold) throw new Error('TAP & HOLD survived the ride teardown: ' + JSON.stringify(landed));
  const y1 = landed.y;
  await sleep(3000);
  const y2 = await page.evaluate(() => Math.round(scrollY));
  if (Math.abs(y2 - y1) > 4) throw new Error('finale did not hold: ' + y1 + ' -> ' + y2);
  console.log('3. ENTER settles on the LIVING hole; blue site hidden; holds ✓', JSON.stringify(landed));
  await page.screenshot({ path: 'shots-journey/portal/4-finale.png' });

  // 4 — the door is ONE-WAY (Yash MCQ): scrolling back replays the journey
  //     but never rebuilds the portal, and coming forward again passes
  //     straight through into the black hole (no dead end).
  await goRaw(WALL - 0.11);
  await sleep(900);
  const back = await page.evaluate(() => ({
    beat: document.querySelector('.intro__blackhole canvas')?.style.opacity,
    door: Boolean(document.querySelector('.bh-portal')),
    hold: Boolean(document.querySelector('.bh-hold')),
    module: Boolean(window.__bhp),
  }));
  if (parseFloat(back.beat) > 0.01) throw new Error('Gargantua still up after scroll-back: ' + JSON.stringify(back));
  if (back.door) throw new Error('door rebuilt after entering (must be one-way)');
  if (back.hold) throw new Error('TAP & HOLD rebuilt after entering (must be one-way)');
  console.log('4a. scroll-back replays the journey, no door rebuilt ✓', JSON.stringify(back));

  await goRaw(WALL + 0.06);
  await sleep(1200);
  const through = await page.evaluate(() => ({
    beat: document.querySelector('.intro__blackhole canvas')?.style.opacity,
    door: Boolean(document.querySelector('.bh-portal')),
    hold: Boolean(document.querySelector('.bh-hold')),
  }));
  if (!(parseFloat(through.beat) > 0.9)) throw new Error('forward pass did not reach the hole: ' + JSON.stringify(through));
  if (through.door || through.hold) throw new Error('door/hold reappeared on the second pass');
  console.log('4b. second pass goes straight through to the hole ✓', JSON.stringify(through));

  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : '5. console silent ✓');
  if (errs.length) process.exit(1);
  await browser.close();
  console.log(`PORTAL ACCEPTANCE: ALL GREEN (follow error ${followErr.toFixed(2)} px, door offset ${doorErr.toFixed(2)} px)`);
})().catch((e) => { console.error(e); process.exit(1); });
