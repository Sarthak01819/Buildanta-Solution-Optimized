// Proves the three moving things are LOCKED to each other and to the scroll:
//   the film strip, the two spools, and the shutter.
// Not "they both move" — the RATIOS between them must be constant, because
// that is what synced means. Any drift shows up as a varying ratio.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const P0 = 0.560, P1 = 0.672;   // the reel's own span, where all three should be locked
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:5290/', { waitUntil: 'load' });
  await p.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await p.evaluate(() => new Promise(r => setTimeout(r, 1600)));
  const read = async (q) => {
    await p.evaluate((v) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + (intro.st.end - intro.st.start) * intro.rawForP(v);
      lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);
    }, q);
    await p.evaluate(() => new Promise(r => setTimeout(r, 300)));
    return p.evaluate(() => {
      const me = document.querySelector('.market-experience');
      const plate = document.querySelector('.market-frame--plate').getBoundingClientRect();
      return {
        strip: plate.left + plate.width / 2,                              // px
        spool: +me.style.getPropertyValue('--market-camera-spin') || 0,   // turns
        shutter: parseFloat(me.style.getPropertyValue('--market-camera-shutter-angle')) || 0,
      };
    });
  };
  const rows = [];
  for (let i = 0; i <= 16; i++) rows.push(await read(P0 + (i / 16) * (P1 - P0)));
  console.log('  Δstrip(px)   Δspool(turns)   Δshutter(deg)   spool/strip   shutter/spool');
  const r1 = [], r2 = [];
  for (let i = 1; i < rows.length; i++) {
    const ds = rows[i - 1].strip - rows[i].strip;         // strip travels left
    const dp = rows[i].spool - rows[i - 1].spool;
    const dh = rows[i].shutter - rows[i - 1].shutter;
    if (ds < 4) continue;                                  // skip stationary samples
    const a = dp / ds * 1000, c = dh / dp;
    r1.push(a); r2.push(c);
    console.log(`${ds.toFixed(1).padStart(10)}  ${dp.toFixed(4).padStart(13)}  ${dh.toFixed(1).padStart(14)}  ${a.toFixed(4).padStart(12)}  ${c.toFixed(1).padStart(14)}`);
  }
  const spread = (a) => ((Math.max(...a) - Math.min(...a)) / (a.reduce((x, y) => x + y, 0) / a.length) * 100);
  console.log(`\nspool per 1000px of strip : ${(r1.reduce((a,b)=>a+b,0)/r1.length).toFixed(4)} turns   spread ${spread(r1).toFixed(2)}%`);
  console.log(`shutter per spool turn    : ${(r2.reduce((a,b)=>a+b,0)/r2.length).toFixed(1)} deg      spread ${spread(r2).toFixed(2)}%`);
  const locked = spread(r1) < 1 && spread(r2) < 1;
  console.log(locked ? '\nLOCKED — all three move on one ratio' : '\nDRIFTING — the ratios are not constant');
  console.log(errs.length ? 'ERRORS: ' + errs.slice(0,3).join(' | ') : 'no page errors');
  await b.close();
})();
