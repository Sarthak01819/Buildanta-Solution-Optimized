// Probe 2: are the animation tracks driving the bones? Compare two stops.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  const go = async (p) => {
    const raw = await page.evaluate(`window.__buildanta.intro.rawForP(${p})`);
    await page.evaluate((f) => {
      const { intro, lenis } = window.__buildanta;
      const y = intro.st.start + (intro.st.end - intro.st.start) * f;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    }, raw);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));
  };
  const sample = () => page.evaluate(() => {
    const root = window.__buildanta.meetRoot;
    if (!root) return { error: 'no meetRoot' };
    root.updateWorldMatrix(true, true);
    const out = { bones: {}, skinned: {} };
    root.traverse((o) => {
      if (o.isBone && (o.name === 'Bone020' || o.name === 'Bone.020' || o.name === 'Bone002' || o.name === 'Bone.002')) {
        const armName = (() => { let g = o; while (g && !/Hand_/.test(g.name)) g = g.parent; return g ? g.name : '?'; })();
        const p = o.getWorldPosition(new o.position.constructor());
        out.bones[armName + '/' + o.name] = [p.x, p.y, p.z].map((v) => +v.toFixed(2));
      }
      if (o.isSkinnedMesh) {
        o.computeBoundingBox();
        const bb = o.boundingBox;
        out.skinned[o.name] = {
          min: [bb.min.x, bb.min.y, bb.min.z].map((v) => +v.toFixed(2)),
          max: [bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(2)),
        };
      }
    });
    return out;
  });
  await go(0.908);
  const anim = await page.evaluate(() => {
    const acts = window.__buildanta.meetActions || [];
    return acts.map((a) => ({ t: +a.time.toFixed(4), dur: +a.getClip().duration.toFixed(4) }));
  });
  console.log('ACTION TIME at cl0.625:', JSON.stringify(anim));
  await go(0.8016);   // cl 0.15 — approach: animated bones should be FAR apart
  console.log('APPROACH cl0.15:', JSON.stringify(await sample()));
  await go(0.908);    // cl 0.625 — contact
  console.log('CONTACT  cl0.625:', JSON.stringify(await sample()));
  await browser.close();
})();
