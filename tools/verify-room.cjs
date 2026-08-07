// Finale verification: the Endurance beside the black hole, the flight in,
// and the contact room as the site's last surface.
//
// Two things this harness learned the hard way, both encoded below:
//  · <main> is display:none behind html.bh-final, so a probe that skips the
//    journey measures a zero-sized section. Ride the intro for real.
//  · the finale is the PORTAL's screen, not the Gargantua beat — the beat has
//    already handed over by then, so the gate is `.intro__portalwrap.on`.
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5297/';
const OUT = path.join(__dirname, '..', 'shots-journey');
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};

const STOPS = [0.60, 0.815, 0.90, 0.96, 1.0];

async function rideToFinale(page) {
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  for (const f of STOPS) {
    await page.evaluate((ff) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + (intro.st.end - intro.st.start) * ff;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else scrollTo(0, y);
    }, f);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(6000);   // ship model + portal settle
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ReadPixels|GPU stall/i.test(m.text())) errs.push('console: ' + m.text());
  });

  await page.goto(URL, { waitUntil: 'load' });
  if (!/^buildanta solutions/i.test(await page.title())) throw new Error('WRONG SERVER on ' + URL);
  await rideToFinale(page);
  await page.screenshot({ path: path.join(OUT, 'finale-1-orbit.png') });

  const orbit = await page.evaluate(() => {
    const ship = document.querySelector('.finale-ship');
    const cta = document.querySelector('.finale-cta');
    const cr = cta ? cta.getBoundingClientRect() : null;
    return {
      shipVisible: ship ? ship.style.opacity === '1' && ship.width > 100 : false,
      shipPx: ship ? [ship.width, ship.height] : null,
      ctaIn: cta ? cta.classList.contains('finale-cta--in') : false,
      ctaOnScreen: cr ? (cr.top < innerHeight && cr.bottom > 0 && cr.width > 40) : false,
      portalLive: document.querySelector('.intro__portalwrap')?.classList.contains('on'),
    };
  });
  ok('finale-ship', orbit.shipVisible && orbit.portalLive,
    `ship canvas ${orbit.shipPx?.join('x')} over a live portal`);
  // Prove clickability by hit-test rather than by Playwright's click: its
  // actionability check scrolls first, and any scroll here rewinds the pinned
  // finale underneath us. The hit-test is the honest question — is the
  // control the topmost thing at its own centre?
  const hit = await page.evaluate(() => {
    const cta = document.querySelector('.finale-cta');
    const b = cta.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { isTop: top === cta, top: top ? (top.className || top.tagName).toString().slice(0, 40) : 'none' };
  });
  ok('finale-cta', orbit.ctaIn && orbit.ctaOnScreen && hit.isTop,
    `Contact control up, on screen, topmost at its centre (${hit.top})`);

  // the flight in
  await page.$eval('.finale-cta', (el) => el.click());
  await page.waitForTimeout(4200);
  await page.screenshot({ path: path.join(OUT, 'finale-2-approach.png') });
  const readFlight = () => page.evaluate(() => ({
    flash: parseFloat(document.querySelector('.finale-flash').style.opacity || '0'),
    inside: document.documentElement.classList.contains('finale-inside'),
  }));
  // ~4s in: pure approach. The bloom starts at flight 0.58, which a 10s
  // smootherstep does not reach until ~6s — no light here is CORRECT.
  const approach = await readFlight();
  await page.waitForTimeout(3200);
  const bloomPeak = await readFlight();     // ~7.4s: the airlock swell
  ok('flight-bloom',
    approach.flash < 0.02 && !approach.inside && bloomPeak.flash > 0.25,
    `approach clean (${approach.flash.toFixed(2)}) → airlock swells to ${bloomPeak.flash.toFixed(2)}`);

  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, 'finale-3-room.png') });
  const room = await page.evaluate(() => {
    const sec = document.getElementById('contact');
    const mail = sec.querySelector('.contact__mail');
    const bh = sec.querySelector('.room__bh');
    const mr = mail.getBoundingClientRect();
    let engine = null, topOverGlass = '';
    if (bh) {
      const g = bh.getContext('webgl2');
      const px = new Uint8Array(4 * 32 * 32);
      g.readPixels(Math.round(bh.width * 0.06), Math.round(bh.height * 0.6), 32, 32, g.RGBA, g.UNSIGNED_BYTE, px);
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < px.length; i += 4) { a += px[i]; b += px[i + 1]; c += px[i + 2]; }
      const n = px.length / 4;
      engine = [a / n, b / n, c / n];
      const br = bh.getBoundingClientRect();
      const el = document.elementFromPoint(br.left + br.width * 0.12, br.top + br.height * 0.25);
      topOverGlass = el ? (el.className || el.tagName).toString() : '';
    }
    return {
      inside: document.documentElement.classList.contains('finale-inside'),
      mailVisible: mr.width > 40 && mr.top < innerHeight && mr.bottom > 0,
      mailHref: mail.getAttribute('href'),
      bhMounted: !!bh, engine, topOverGlass,
      flash: parseFloat(document.querySelector('.finale-flash').style.opacity || '0'),
    };
  });
  ok('arrived', room.inside && room.mailVisible && /^mailto:/.test(room.mailHref || ''),
    `inside, email visible (${room.mailHref}), bloom cleared to ${room.flash.toFixed(2)}`);
  ok('window-blackhole', room.bhMounted, room.bhMounted ? 'mounted behind the glass' : 'missing');
  if (room.engine) {
    const lum = (room.engine[0] + room.engine[1] + room.engine[2]) / 3;
    const cast = Math.abs(room.engine[0] - room.engine[2]);
    ok('window-black', lum < 8 && cast < 3 && !/breath|bloom|lights/.test(room.topOverGlass),
      `engine sky lum ${lum.toFixed(1)} cast ${cast.toFixed(1)} | topmost over glass: ${room.topOverGlass}`);
  }

  // drawer
  await page.$eval('[data-room-open]', (el) => el.click());
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => {
    const el = document.querySelector('[data-room-drawer]');
    return { open: el.getBoundingClientRect().left < innerWidth - 40,
             focused: document.activeElement === el.querySelector('input') };
  });
  ok('drawer', d.open && d.focused, `opens=${d.open}, input focused=${d.focused}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const closed = await page.evaluate(() =>
    !document.getElementById('contact').classList.contains('room--drawer'));
  ok('drawer-escape', closed, 'Esc closes the drawer, not the room');

  // leaving: wheel-up flies back out
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -220); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => ({
    inside: document.documentElement.classList.contains('finale-inside'),
    opacity: parseFloat(document.getElementById('contact').style.opacity || '0'),
  }));
  ok('exit', !out.inside && out.opacity < 0.5,
    `scroll-up leaves the room (opacity ${out.opacity.toFixed(2)})`);

  // phone: same journey, fresh context — resizing mid-session leaves phantom
  // layout behind and measures the wrong thing
  await page.close();
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  mob.on('pageerror', (e) => errs.push('mobile pageerror: ' + e.message));
  await mob.goto(URL, { waitUntil: 'load' });
  await rideToFinale(mob);
  await mob.$eval('.finale-cta', (el) => el.click()).catch(() => {});
  await mob.waitForTimeout(12000);
  await mob.screenshot({ path: path.join(OUT, 'finale-4-mobile.png') });
  const m = await mob.evaluate(() => {
    const sec = document.getElementById('contact');
    const ui = sec.querySelector('.room__ui').getBoundingClientRect();
    const bh = sec.querySelector('.room__bh');
    const r = bh ? bh.getBoundingClientRect() : null;
    return {
      inside: document.documentElement.classList.contains('finale-inside'),
      uiInside: ui.left >= -1 && ui.right <= innerWidth + 1,
      uiBox: [Math.round(ui.left), Math.round(ui.right)], vw: innerWidth,
      glassOnScreen: r ? (r.right > 20 && r.left < innerWidth - 20 && r.width > 60) : false,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  ok('portrait', m.inside && m.uiInside && !m.overflow && m.glassOnScreen,
    `inside=${m.inside}, copy x ${m.uiBox[0]}–${m.uiBox[1]} in ${m.vw}px, glass framed=${m.glassOnScreen}`);

  ok('console-clean', errs.length === 0, errs.slice(0, 3).join(' | ') || 'no errors');

  const fails = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ABORT', e.message); process.exit(2); });
