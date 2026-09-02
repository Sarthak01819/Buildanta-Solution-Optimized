// One-off probe: interrogate the fist-bump scene graph at the contact stop.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
const URL = process.env.SITE_URL || 'http://127.0.0.1:5303/';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__buildanta && window.__buildanta.intro', null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  const raw = await page.evaluate(`window.__buildanta.intro.rawForP(0.908)`);
  await page.evaluate((f) => {
    const { intro, lenis } = window.__buildanta;
    const y = intro.st.start + (intro.st.end - intro.st.start) * f;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, raw);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));
  const report = await page.evaluate(() => {
    const root = window.__buildanta.meetRoot;
    if (!root) return { error: 'meetRoot not set — GLB may not have loaded' };
    const out = { nodes: [] };
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      const rec = { name: o.name, type: o.type, visible: o.visible };
      if (o.isMesh || o.isSkinnedMesh) {
        const p = o.getWorldPosition(new (o.position.constructor)());
        rec.world = [p.x, p.y, p.z].map((v) => +v.toFixed(2));
        rec.mat = o.material && o.material.type;
        rec.vertexColors = o.material && o.material.vertexColors;
        if (o.geometry) {
          o.geometry.computeBoundingSphere();
          rec.radius = +o.geometry.boundingSphere.radius.toFixed(3);
        }
      }
      if (rec.type !== 'Bone') out.nodes.push(rec);
    });
    let g = root.parent;
    out.parents = [];
    while (g) { out.parents.push({ name: g.name || g.type, visible: g.visible, scale: +g.scale.x.toFixed(2), pos: [g.position.x, g.position.y, g.position.z].map(v => +v.toFixed(2)) }); g = g.parent; }
    return out;
  });
  console.log(JSON.stringify(report, null, 1));
  console.log('--- console messages containing warn/error/THREE:');
  console.log(logs.filter((l) => /warn|error|THREE/i.test(l)).slice(0, 15).join('\n') || '(none)');
  await browser.close();
})();
