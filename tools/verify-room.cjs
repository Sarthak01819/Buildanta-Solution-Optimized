// Contact-room verification. Rides the intro to the end (main is display:none
// behind html.bh-final until then — a probe that skips the journey measures a
// zero-sized section), then checks the room the way a visitor meets it.
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }

const URL = process.env.SITE_URL || 'http://127.0.0.1:5297/';
const OUT = path.join(__dirname, '..', 'shots-journey');
const results = [];
const ok = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

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
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  // ride the intro to its end, then let the gate dissolve
  await page.evaluate(() => {
    const { intro, lenis } = window.__buildanta;
    const y = intro.st.end;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo(0, y);
  });
  await page.waitForTimeout(4000);

  // FINALE MODE (Yash, 6 Aug) hides the whole blue site — `html.bh-final`
  // puts #top (the <main>) at display:none, so the contact room ships inside
  // hidden markup. Lift it HERE ONLY, so this harness exercises the room the
  // way a visitor would once the site is restored. Nothing in src/ changes.
  const finaleMode = await page.evaluate(() => {
    const on = document.documentElement.classList.contains('bh-final');
    if (on) document.documentElement.classList.remove('bh-final');
    return on;
  });
  if (finaleMode) console.log('NOTE  finale mode is ON — room un-hidden for this test only');
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__buildanta.ScrollTrigger.refresh()).catch(() => {});
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const el = document.getElementById('contact');
    const y = el.getBoundingClientRect().top + scrollY;
    const { lenis } = window.__buildanta;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo(0, y);
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, 'room-1-desktop.png') });

  const s = await page.evaluate(() => {
    const sec = document.getElementById('contact');
    const bh = sec.querySelector('.room__bh');
    const mail = sec.querySelector('.contact__mail');
    const plate = sec.querySelector('.room__plate');
    const bloom = sec.querySelector('.room__bloom');
    const r = sec.getBoundingClientRect();
    let engine = null, topOverGlass = '';
    if (bh) {
      const g = bh.getContext('webgl2');
      const px = new Uint8Array(4 * 32 * 32);
      g.readPixels(Math.round(bh.width * 0.06), Math.round(bh.height * 0.6), 32, 32, g.RGBA, g.UNSIGNED_BYTE, px);
      let a = 0, b2 = 0, c = 0;
      for (let i = 0; i < px.length; i += 4) { a += px[i]; b2 += px[i + 1]; c += px[i + 2]; }
      const n = px.length / 4;
      engine = [a / n, b2 / n, c / n];
      const br = bh.getBoundingClientRect();
      const el = document.elementFromPoint(br.left + br.width * 0.12, br.top + br.height * 0.25);
      topOverGlass = el ? (el.className || el.tagName).toString() : '';
    }
    const mr = mail.getBoundingClientRect();
    return {
      sectionH: Math.round(r.height),
      bhMounted: !!bh, bhPx: bh ? [bh.width, bh.height] : null,
      engine, topOverGlass,
      mailText: mail.textContent.trim(), mailHref: mail.getAttribute('href'),
      mailVisible: mr.width > 40 && mr.top < innerHeight && mr.bottom > 0,
      plateVsBloomSameStage: getComputedStyle(plate).transform === getComputedStyle(bloom).transform,
    };
  });

  ok('room-mounted', s.sectionH > 400 && s.mailVisible,
    `section ${s.sectionH}px, email "${s.mailText}" visible`);
  ok('room-mail-link', /^mailto:/.test(s.mailHref || ''), s.mailHref);
  ok('window-blackhole', s.bhMounted && s.bhPx[0] > 100,
    s.bhMounted ? `canvas ${s.bhPx.join('x')}` : 'not mounted');
  if (s.engine) {
    const lum = (s.engine[0] + s.engine[1] + s.engine[2]) / 3;
    const cast = Math.abs(s.engine[0] - s.engine[2]);
    ok('window-black', lum < 8 && cast < 3 && !/breath|bloom|lights/.test(s.topOverGlass),
      `sky lum ${lum.toFixed(1)} cast ${cast.toFixed(1)} | topmost: ${s.topOverGlass || 'grain/vignette'}`);
  }

  // drawer
  await page.click('[data-room-open]');
  await page.waitForTimeout(600);
  const d = await page.evaluate(() => {
    const el = document.querySelector('[data-room-drawer]');
    return { open: el.getBoundingClientRect().left < innerWidth - 40,
             focused: document.activeElement === el.querySelector('input') };
  });
  ok('drawer', d.open && d.focused, `opens=${d.open} input-focused=${d.focused}`);
  await page.screenshot({ path: path.join(OUT, 'room-2-drawer.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const esc = await page.evaluate(() => {
    const el = document.querySelector('[data-room-drawer]');
    const sec = document.getElementById('contact');
    return {
      offscreen: el.getBoundingClientRect().left >= innerWidth - 40,
      hasClass: sec.classList.contains('room--drawer'),
      active: document.activeElement.tagName,
      left: Math.round(el.getBoundingClientRect().left),
      vw: innerWidth,
    };
  });
  // Assert the STATE, not a pixel: the slide is a 0.34s transition and its
  // mid-flight offset is not evidence of anything.
  ok('drawer-escape', !esc.hasClass && esc.left > esc.vw * 0.65,
    `class removed=${!esc.hasClass}, sliding out at ${esc.left}/${esc.vw}, focus→${esc.active}`);

  // portrait: plate must scale/pan so the glass stays framed, copy on a panel.
  // Re-scroll after the resize — the section moves, and measuring before that
  // reports the copy "outside the viewport" when it is merely off-screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const el = document.getElementById('contact');
    const y = el.getBoundingClientRect().top + scrollY;
    const { lenis } = window.__buildanta;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo(0, y);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'room-3-mobile.png') });
  // Park the pointer: [data-magnetic] pulls the email toward the cursor, so a
  // stale desktop pointer position reads as "copy off-screen" on a phone —
  // where there is no pointer at all.
  await page.mouse.move(195, 700);
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const sec = document.getElementById('contact');
    const bh = sec.querySelector('.room__bh');
    const mail = sec.querySelector('.contact__mail');
    const r = bh ? bh.getBoundingClientRect() : null;
    const mr = sec.querySelector('.room__ui').getBoundingClientRect();
    return {
      glassOnScreen: r ? (r.right > 20 && r.left < innerWidth - 20 && r.width > 60) : false,
      mailBox: [Math.round(mr.left), Math.round(mr.right), Math.round(mr.top)],
      vw: innerWidth, vh: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      uiTransform: getComputedStyle(sec.querySelector('.room__ui')).transform,
      secTransform: getComputedStyle(sec).transform,
      mainTransform: getComputedStyle(document.querySelector('main')).transform,
      mailVisible: mr.width > 40 && mr.left >= -1 && mr.right <= innerWidth + 1,
    };
  });
  ok('portrait', m.glassOnScreen && m.mailVisible && !m.overflow,
    `glass framed=${m.glassOnScreen}, copy column x ${m.mailBox[0]}–${m.mailBox[1]} in ${m.vw}px, ` +
    `h-overflow=${m.overflow} | ui:${m.uiTransform} sec:${m.secTransform} main:${m.mainTransform}`);

  ok('console-clean', errs.length === 0, errs.slice(0, 3).join(' | ') || 'no errors');

  const fails = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ABORT', e.message); process.exit(2); });
