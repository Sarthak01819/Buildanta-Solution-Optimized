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

const URL = process.env.SITE_URL || 'http://127.0.0.1:5290/';

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

  // 1 — hit the wall
  await goRaw(0.84);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await goRaw(0.856);
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

  // 3 — ENTER → supernova → beat ride → hero
  await page.click('.bh-portal');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));
  await page.screenshot({ path: 'shots-journey/portal/3-supernova.png' });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 4200)));
  const landed = await page.evaluate(() => {
    const { intro } = window.__buildanta;
    return { y: Math.round(scrollY), end: Math.round(intro.st.end), siteIn: getComputedStyle(document.documentElement).getPropertyValue('--site-in').trim() };
  });
  if (landed.y < landed.end - 8) throw new Error('ride did not land at pin end: ' + JSON.stringify(landed));
  console.log('3. ENTER rode the beat to the hero ✓', JSON.stringify(landed));
  await page.screenshot({ path: 'shots-journey/portal/4-hero.png' });

  // 4 — reverse to consult, re-engage, Esc returns
  await goRaw(0.75);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
  const wrapOff = await page.evaluate(() => !document.querySelector('.intro__portalwrap').classList.contains('on'));
  if (!wrapOff) throw new Error('portal wrap still on back in consult world');
  await goRaw(0.856);
  await page.waitForFunction('window.__bhp && window.__bhp.ready === true', null, { timeout: 15000 });
  await page.evaluate(() => { window.__bhp.press(); window.__bhp.step(175); });
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1600)));
  const after = await page.evaluate(() => ({
    on: document.querySelector('.intro__portalwrap').classList.contains('on'),
    btn: Boolean(document.querySelector('.bh-portal')),
  }));
  if (after.on || after.btn) throw new Error('Esc did not fully return: ' + JSON.stringify(after));
  console.log('4. re-arm cycle + Esc return ✓');

  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : '5. console silent ✓');
  if (errs.length) process.exit(1);
  await browser.close();
  console.log('PORTAL ACCEPTANCE: ALL GREEN');
})().catch((e) => { console.error(e); process.exit(1); });
