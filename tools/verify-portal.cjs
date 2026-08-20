// Portal-wall acceptance (adapted from black-hole-bg/tools/probe-v3):
//  1. reaching the wall engages the portal (lenis stopped, starfield on)
//  2. hold → collapse → ARMED: real button, focused; release keeps the door
//  3. click ENTER → bh:enter intercepted → the Gargantua beat auto-rides
//     → gate → hero (scroll lands at pin end)
//  4. re-arm cycle + Esc return path → back into the consult world
//  5. console stays silent throughout
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
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

  // 1 — hit the wall (position asked of the page, never hardcoded)
  const WALL = await page.evaluate('window.__buildanta.intro.wallRaw');
  await goRaw(WALL - 0.02);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await goRaw(WALL + 0.004);
  await page.waitForFunction('document.querySelector(".intro__portalwrap")?.classList.contains("on")', null, { timeout: 5000 });
  await page.waitForFunction('window.__bhp && window.__bhp.ready === true', null, { timeout: 15000 });
  console.log('1. wall engaged, portal module live ✓');
  fs.mkdirSync('shots-journey/portal', { recursive: true });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
  await page.screenshot({ path: 'shots-journey/portal/1-wall.png' });

  // 2 — hold to ARMED
  await page.evaluate(() => { window.__bhp.press(); window.__bhp.step(175); });
  const phase = await page.evaluate(() => window.__bhp.state().phase);
  if (phase !== 'armed') throw new Error('not armed after full hold, phase=' + phase);
  const focused = await page.evaluate(() => document.activeElement?.className === 'bh-portal');
  if (!focused) throw new Error('portal button not focused');
  console.log('2. armed: door open, button focused ✓');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  await page.screenshot({ path: 'shots-journey/portal/2-armed.png' });

  // 3 — ENTER → supernova → the ride SETTLES on the living hole (finale)
  await page.click('.bh-portal');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));
  await page.screenshot({ path: 'shots-journey/portal/3-supernova.png' });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 4000)));
  const landed = await page.evaluate(() => {
    const beatCanvas = document.querySelector('.intro__blackhole canvas');
    return {
      y: Math.round(scrollY),
      beatOpacity: beatCanvas ? beatCanvas.style.opacity : null,
      siteHidden: getComputedStyle(document.querySelector('#top')).display === 'none',
      siteIn: getComputedStyle(document.documentElement).getPropertyValue('--site-in').trim(),
    };
  });
  if (!(parseFloat(landed.beatOpacity) >= 0.999)) throw new Error('living hole not visible: ' + JSON.stringify(landed));
  if (!landed.siteHidden) throw new Error('blue site not hidden: ' + JSON.stringify(landed));
  const y1 = landed.y;
  await page.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
  const y2 = await page.evaluate(() => Math.round(scrollY));
  if (Math.abs(y2 - y1) > 4) throw new Error('finale did not hold: ' + y1 + ' -> ' + y2);
  console.log('3. ENTER settles on the LIVING hole; blue site hidden; holds ✓', JSON.stringify(landed));
  await page.screenshot({ path: 'shots-journey/portal/4-finale.png' });

  // 4 — the door is ONE-WAY (Yash MCQ): scrolling back replays the journey
  //     but never rebuilds the portal, and coming forward again passes
  //     straight through into the black hole (no dead end).
  await goRaw(WALL - 0.11);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));
  const back = await page.evaluate(() => ({
    beat: document.querySelector('.intro__blackhole canvas')?.style.opacity,
    door: Boolean(document.querySelector('.bh-portal')),
    module: Boolean(window.__bhp),
  }));
  if (parseFloat(back.beat) > 0.01) throw new Error('Gargantua still up after scroll-back: ' + JSON.stringify(back));
  if (back.door) throw new Error('door rebuilt after entering (must be one-way)');
  console.log('4a. scroll-back replays the journey, no door rebuilt ✓', JSON.stringify(back));

  await goRaw(WALL + 0.06);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
  const through = await page.evaluate(() => ({
    beat: document.querySelector('.intro__blackhole canvas')?.style.opacity,
    door: Boolean(document.querySelector('.bh-portal')),
  }));
  if (!(parseFloat(through.beat) > 0.9)) throw new Error('forward pass did not reach the hole: ' + JSON.stringify(through));
  if (through.door) throw new Error('door reappeared on the second pass');
  console.log('4b. second pass goes straight through to the hole ✓', JSON.stringify(through));

  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : '5. console silent ✓');
  if (errs.length) process.exit(1);
  await browser.close();
  console.log('PORTAL ACCEPTANCE: ALL GREEN');
})().catch((e) => { console.error(e); process.exit(1); });
