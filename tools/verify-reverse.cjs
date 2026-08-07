// Reverse-scroll reversibility: the SAME scroll position must look the same
// whether you arrived going down or coming back up. Anything that differs is
// state that was set on the way in and never undone.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const { decode } = require('/Users/buildanta/claude code/buildanta-site/tools/png.cjs');
const fs = require('fs');

const STOPS = [0.46, 0.52, 0.58, 0.62, 0.66, 0.69, 0.71, 0.73, 0.75, 0.78, 0.82];

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://127.0.0.1:5290/', { waitUntil: 'load' });
  await p.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await p.evaluate(() => new Promise(r => setTimeout(r, 1600)));

  const go = async (q) => {
    await p.evaluate((v) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + (intro.st.end - intro.st.start) * intro.rawForP(v);
      lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);
    }, q);
    await p.evaluate(() => new Promise(r => setTimeout(r, 460)));
  };
  const shot = async () => decode(await p.screenshot());
  const diff = (a, c) => {
    if (a.w !== c.w || a.h !== c.h) return 100;
    let n = 0, t = 0;
    for (let k = 0; k < a.data.length; k += a.bpp * 4) {
      if (Math.abs(a.data[k] - c.data[k]) > 10 || Math.abs(a.data[k+1] - c.data[k+1]) > 10) n++;
      t++;
    }
    return n / t * 100;
  };

  const fwd = {};
  for (const q of STOPS) { await go(q); fwd[q] = await shot(); }   // walk down
  await go(0.92);                                                   // past the end
  const rev = {};
  for (const q of [...STOPS].reverse()) { await go(q); rev[q] = await shot(); }  // walk back up

  console.log('    p      pixels different (forward vs reverse)');
  let bad = 0;
  for (const q of STOPS) {
    const d = diff(fwd[q], rev[q]);
    const flag = d > 2.5;
    if (flag) { bad++; fs.writeFileSync(`shots-market/REV-${Math.round(q*1000)}-fwd.png`, Buffer.alloc(0)); }
    console.log(`  ${q.toFixed(3)}   ${d.toFixed(2).padStart(6)}%   ${flag ? '*** GLITCH ***' : 'identical'}`);
  }
  console.log(bad ? `\n${bad} position(s) differ on the way back` : '\nreverse scroll is identical to forward everywhere');
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 6).join('\n') : 'no console/page errors');
  await b.close();
})();
