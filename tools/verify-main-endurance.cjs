// The Endurance as a section of the MAIN site (FINALE off).
//
// Runs against the ordinary blue site: scroll to #contact, the Endurance is
// there over space with a Contact control; the flight plays; the room resolves
// in place around you. The finale path has its own harness (verify-room.cjs).
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

// `?finale=0` boots the ordinary blue site — the mode is chosen at boot, so a
// class toggle after load cannot get us here (the finale has already moved
// #contact into <body> by then).
const URL = (process.env.SITE_URL || 'http://127.0.0.1:5297/').replace(/\/?$/, '/') + '?finale=0';
const OUT = path.join(__dirname, '..', 'shots-journey');
const results = [];
const ok = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };

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
  await page.waitForFunction('window.__buildanta', null, { timeout: 30000 });

  const isFinale = await page.evaluate(() =>
    document.documentElement.classList.contains('bh-final'));
  ok('main-site-mode', !isFinale, 'booted with the blue site, not the finale');
  await page.waitForTimeout(600);

  // scroll to the contact section like a visitor
  await page.evaluate(() => {
    const el = document.getElementById('contact');
    const y = el.getBoundingClientRect().top + scrollY;
    const { lenis } = window.__buildanta;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
  });
  await page.waitForTimeout(6000);          // ship model + first frames
  await page.screenshot({ path: path.join(OUT, 'main-1-endurance.png') });

  const at = await page.evaluate(() => {
    const sec = document.getElementById('contact');
    const shipHost = sec.querySelector('[data-room-ship]');
    const canvas = shipHost?.querySelector('canvas');
    const cta = document.querySelector('.finale-cta');
    const r = sec.getBoundingClientRect();
    return {
      inFlow: sec.parentElement.tagName,                 // must still be in <main>
      sectionOnScreen: r.top < innerHeight && r.bottom > 0,
      shipHost: !!shipHost,
      shipCanvas: canvas ? [canvas.width, canvas.height] : null,
      shipVisible: canvas ? canvas.style.opacity === '1' : false,
      ctaIn: cta ? cta.classList.contains('finale-cta--in') : false,
      roomIn: sec.style.getPropertyValue('--room-in'),
    };
  });
  ok('section-in-place', at.inFlow === 'MAIN' && at.sectionOnScreen,
    `#contact is still inside <${at.inFlow.toLowerCase()}> and on screen`);
  ok('endurance-present', at.shipHost && at.shipVisible && at.shipCanvas?.[0] > 100,
    at.shipCanvas ? `ship canvas ${at.shipCanvas.join('x')} in the section` : 'no ship');
  ok('cta-live', at.ctaIn, 'Contact control appears when the section is on screen');
  ok('room-waits', parseFloat(at.roomIn || '1') < 0.2,
    `room content held back at --room-in ${at.roomIn || '(unset)'}`);

  // the flight
  await page.$eval('.finale-cta', (el) => el.click());
  let peakFlash = 0;
  for (let i = 0; i < 34; i++) {
    const s = await page.evaluate(() => ({
      flash: parseFloat(document.querySelector('.finale-flash').style.opacity || '0'),
      roomIn: parseFloat(document.getElementById('contact').style.getPropertyValue('--room-in') || '0'),
    }));
    peakFlash = Math.max(peakFlash, s.flash);
    if (i === 8) await page.screenshot({ path: path.join(OUT, 'main-2-flight.png') });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(OUT, 'main-3-room.png') });

  const after = await page.evaluate(() => {
    const sec = document.getElementById('contact');
    const mail = sec.querySelector('.contact__mail');
    const mr = mail.getBoundingClientRect();
    return {
      roomIn: parseFloat(sec.style.getPropertyValue('--room-in') || '0'),
      mailVisible: mr.width > 40 && mr.top < innerHeight && mr.bottom > 0,
      mailHref: mail.getAttribute('href'),
      windowBH: !!sec.querySelector('.room__bh'),
      inFlow: sec.parentElement.tagName,
    };
  });
  ok('flight-plays', peakFlash > 0.25, `airlock bloom peaked at ${peakFlash.toFixed(2)}`);
  ok('room-arrives', after.roomIn > 0.9 && after.mailVisible && /^mailto:/.test(after.mailHref || ''),
    `room resolved in place (--room-in ${after.roomIn.toFixed(2)}), email ${after.mailHref}`);
  ok('window-blackhole', after.windowBH, after.windowBH ? 'live behind the glass' : 'missing');
  ok('still-in-flow', after.inFlow === 'MAIN', 'the section never left the document');

  // the drawer still works here
  await page.$eval('[data-room-open]', (el) => el.click());
  await page.waitForTimeout(700);
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('[data-room-drawer]');
    return { open: d.getBoundingClientRect().left < innerWidth - 40,
             focused: document.activeElement === d.querySelector('input') };
  });
  ok('drawer', drawer.open && drawer.focused, `opens=${drawer.open} input focused=${drawer.focused}`);

  ok('console-clean', errs.length === 0, errs.slice(0, 3).join(' | ') || 'no errors');

  const fails = results.filter((r) => !r.p).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ABORT', e.message); process.exit(2); });
