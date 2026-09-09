/* Repeatable Node-only lifecycle checks: actual production functions and
 * Three.js math, with GPU/network/DOM stubs. Original sibling is read-only.
 * Browser pixel comparisons remain a separate test.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const THREE = require('three');
const ROOT = path.resolve(__dirname, '..');
const ORIGINAL = process.env.ORIGINAL_SITE || path.resolve(ROOT, '../buildanta-site');
const read = (file, original = false) => fs.readFileSync(path.join(original ? ORIGINAL : ROOT, file), 'utf8');
const strip = source => source.replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let))/g, '')
  .replaceAll('import.meta.env?.DEV', 'false');
const load = (file, symbol, context, original = false) => vm.runInNewContext(
  `${strip(read(file, original))}\n${symbol}`, context);
const equal = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

function element() {
  const classes = new Set();
  const style = new Proxy({ opacity: '1', setProperty() {} }, {
    set(target, key, value) {
      target[key] = key === 'opacity' && value !== '' ? String(Number(value)) : value;
      return true;
    },
  });
  return { style, listeners: {}, clientWidth: 800, clientHeight: 600,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value), toggle(value, on) { if (on) classes.add(value); else classes.delete(value); } },
    setAttribute() {}, addEventListener(name, callback) { this.listeners[name] = callback; },
    appendChild() {}, remove() {}, checkVisibility() { return style.opacity !== '0'; } };
}

function sceneEnvironment() {
  const draws = [], states = [], sizes = [], host = element(), canvas = element(), html = element();
  canvas.checkVisibility = () => canvas.style.opacity !== '0' && host.style.opacity !== '0';
  class Renderer {
    setClearColor() {} setClearAlpha() {} clear() {} clearDepth() {} dispose() {}
    setPixelRatio(ratio) { this.ratio = ratio; }
    setSize(w, h) { sizes.push([w, h, this.ratio]); }
    render() { draws.push(1); }
  }
  class Loader { setDRACOLoader() {} load(_url, done) { done({ scene: new THREE.Group() }); } }
  class Draco { setDecoderPath() {} dispose() {} }
  const env = { ...THREE, console, document: { createElement: () => canvas, documentElement: html },
    window: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 },
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }),
    getComputedStyle: el => el.style, wantsAA: () => true,
    WebGLRenderer: Renderer, GLTFLoader: Loader, DRACOLoader: Draco,
    createOrb: () => ({ group: new THREE.Group(), setPointer() {}, setPixelRatio() {}, render() {}, dispose() {} }),
    CONFIG: { breathing: { period: 110 } },
    createBlackhole: async () => ({ size(w, h) { sizes.push([w, h]); }, render(state) { states.push(state); } }),
  };
  return { env, host, canvas, html, draws, states, sizes };
}

async function sceneChecks() {
  const results = [];
  for (const [file, symbol, isShip] of [
    ['src/gl/Corridor.js', 'createCorridor', false],
    ['src/gl/endurance/ship.js', 'createShip', true],
  ]) {
    const before = sceneEnvironment(), after = sceneEnvironment();
    const a = load(file, symbol, before.env, true)(isShip ? before.host : before.canvas);
    const b = load(file, symbol, after.env)(isShip ? after.host : after.canvas);
    if (isShip) { a.load(); b.load(); }
    before.canvas.style.opacity = after.canvas.style.opacity = '0';
    for (let i = 0; i < 6; i++) {
      if (isShip) { a.tick(0.016); b.tick(0.016); }
      else { a.setProgress(0.95); b.setProgress(0.95); a.render(i * 0.016); b.render(i * 0.016); }
    }
    assert.equal(before.draws.length, 6); assert.equal(after.draws.length, 0);
    const state = api => isShip ? api.state() : api.camera.matrixWorld.toArray();
    equal(state(a), state(b));
    before.canvas.style.opacity = after.canvas.style.opacity = '0.000001';
    if (isShip) { a.tick(0.016); b.tick(0.016); } else { a.render(0.12); b.render(0.12); }
    assert.equal(after.draws.length, 1); equal(state(a), state(b)); equal(before.sizes, after.sizes);
    results.push({ symbol, hiddenDrawsBefore: 6, hiddenDrawsAfter: 0, stateAndSizeIdentical: true });
  }
  const before = sceneEnvironment(), after = sceneEnvironment();
  const file = 'src/gl/blackhole/BlackholeGateBeat.js';
  const a = await load(file, 'createBlackholeGateBeat', before.env, true)(before.host);
  const b = await load(file, 'createBlackholeGateBeat', after.env)(after.host);
  a.setProgress(0.25); b.setProgress(0.25); a.tick(0.016); b.tick(0.016);
  before.canvas.style.opacity = after.canvas.style.opacity = '0'; a.tick(0.02); b.tick(0.02);
  before.canvas.style.opacity = after.canvas.style.opacity = '0.000001'; a.tick(0.03); b.tick(0.03);
  a.tick(0.04); b.advance(0.04);
  after.html.classList.add('is-in-world'); a.tick(0.05); b.tick(0.05);
  after.html.classList.remove('is-in-world'); a.tick(0); b.tick(0);
  assert.equal(after.states.length, 3); equal(before.states.at(-1), after.states.at(-1));
  equal(before.sizes, after.sizes);
  results.push({ symbol: 'createBlackholeGateBeat', drawsBefore: before.states.length,
    drawsAfter: after.states.length, finalStateIdentical: true });
  return results;
}

async function finaleFixture(original) {
  let now = 0;
  const body = [], globals = {}, host = element(), room = element(), beatCanvas = element();
  host.classList.add('solid'); host.querySelector = () => beatCanvas;
  const ship = { canvas: element(), ready: true, load() {}, setFlyIn() {}, setCursor() {}, tick() {},
    skyView: () => ({}), backgroundShift: () => ({ x: 0, y: 0 }), state: () => ({}) };
  const skyTimes = [], sky = { retired: false, draw(t) { skyTimes.push(t); }, setVisible() {}, dispose() {} };
  const env = { console, document: { body: { appendChild(el) { body.push(el); } },
    documentElement: element(), createElement: element }, performance: { now: () => now },
    MutationObserver: class { observe() {} }, addEventListener(name, callback) { globals[name] = callback; },
    createShip: () => ship, mountFlightSky: async () => sky };
  const api = load('src/modules/finaleRoom.js', 'createFinaleRoom', env, original)(
    { blackholeHost: host, roomSection: room, shaders: {} });
  await Promise.resolve(); body[1].listeners.click(); now = 14000;
  api.tick(0.016); api.tick(0.02); assert.equal(host.style.opacity, '0');
  globals.wheel({ deltaY: -125, preventDefault() {} }); api.tick(0.03);
  return { hiddenDraws: skyTimes.length - 1, revealTime: skyTimes.at(-1) };
}

async function projectChecks() {
  let now = 0, advance = 0, tick = 0;
  const queue = [], intervals = [], timers = [], html = element();
  const beat = { canvas: { parentElement: element() }, setDive() {}, setProgress() {},
    advance() { advance++; }, tick() { tick++; } };
  const env = { document: { body: { appendChild() {} }, documentElement: html, createElement: element },
    window: { __worldReady: true }, performance: { now: () => now },
    requestAnimationFrame(callback) { queue.push(callback); return queue.length; }, cancelAnimationFrame() {},
    setInterval(callback) { intervals.push(callback); return intervals.length; }, clearInterval() {},
    setTimeout(callback) { timers.push(callback); return timers.length; } };
  const fall = load('src/modules/worldFall.js', 'createWorldFall', env)(
    { getBeat: () => beat, onMountWorld: () => ({ setPaused() {} }) });
  await fall.enter(); intervals[0](); now = 100; queue.shift()(now);
  now = 5400; queue.shift()(now); assert.equal(fall.state, 'in');
  assert.equal(advance, 2); assert.equal(tick, 0); queue.shift()(now);
  fall.exit(); timers.at(-1)(); assert.equal(html.classList.contains('is-in-world'), false);
  now = 10000; queue.shift()(now); assert.equal(tick, 0);
  return { extraGpuTicks: tick, clockAdvances: advance, reverseUncoveredBeforeRender: true };
}

function propFixture(original) {
  let layouts = 0, projections = 0, point = { x: 120, y: 80, dist: 26 };
  const host = { style: { opacity: '1', visibility: '' }, querySelector: () => null };
  const group = { host, layer: { getBoundingClientRect() { layouts++; return { left: 12, top: 34 }; } },
    items: [{ el: { style: {}, offsetWidth: 8 }, inner: { style: {} }, shown: false,
      wx: 1, wy: 2, wz: 3, sx: 0.19, sy: 0.14, px: 1, py: 2, amp: 10, spin: 0.3 }] };
  const corridor = { project() { projections++; return point; } };
  const project = load('src/modules/introObjects.js', 'projectObjects',
    { document: { documentElement: { clientWidth: 800 } } }, original);
  project([group], corridor, 1); layouts = projections = 0;
  host.style.opacity = '0'; host.style.visibility = 'hidden';
  for (let i = 2; i <= 5; i++) project([group], corridor, i);
  const hiddenWork = { layouts, projections };
  host.style.opacity = '0.000001'; host.style.visibility = '';
  project([group], corridor, 9);
  const reentry = JSON.stringify(group.items[0]);
  host.style.opacity = '0'; point = null; project([group], corridor, 10);
  host.style.opacity = '1'; project([group], corridor, 11);
  return { hiddenWork, reentry, behindCamera: JSON.stringify(group.items[0]) };
}

function marketFixture(original) {
  const source = read('src/gl/marketCamera.js', original);
  const start = source.indexOf('  function render(tMs) {');
  const end = source.indexOf('  /* Driven from the ONE site ticker', start);
  assert.ok(start >= 0 && end > start);
  const rig = new THREE.Group(), ribbonGroup = new THREE.Group();
  const nodes = Object.fromEntries(['reel_a', 'reel_b', 'crank', 'iris_blades', 'iris_tunnel']
    .map(name => [name, new THREE.Group()]));
  const mat = () => ({ uniforms: Object.fromEntries(['uEmerge', 'uVel', 'uTime', 'uPos', 'uAlpha', 'uOpen']
    .map(name => [name, { value: 0 }])) });
  const state = { rect: { w: 785, x: 0, y: 0 }, yaw: 0.2, recoil: 0.1, drift: 0.3,
    spin: 0.4, spinB: 0.5, filmEmerge: 0.8, filmVel: 2, filmPos: 1.4, filmAlpha: 0.8,
    crank: 0.2, irisOpen: 0.6, opacity: 0 };
  let draws = 0;
  const canvas = element(), camera = new THREE.PerspectiveCamera(), ribbonMat = mat(), backMat = mat();
  const env = { ready: true, reduced: false, state, rig, nodes, ribbonMat, backMat, ribbonGroup,
    ribbonBack: {}, ribbon: {}, bladeSh: mat(), glassMat: {}, camera, canvas,
    FRAME_W: 785, FRAME_H: 1511, originX: 0, originY: 0, cssW: 800, cssH: 600,
    document: { hidden: false }, scene: {}, renderer: { render() { draws++; } } };
  const render = vm.runInNewContext(source.slice(start, end) + '\nrender', env);
  render(1000); render(2000); const hiddenDraws = draws;
  state.opacity = 0.001; render(9000);
  return { hiddenDraws, reentryDraws: draws - hiddenDraws,
    reentryState: JSON.stringify({ rig: rig.position.toArray(), rotation: rig.rotation.toArray(),
      view: camera.view, ribbon: ribbonMat.uniforms, back: backMat.uniforms, opacity: canvas.style.opacity }) };
}

(async () => {
  const scenes = await sceneChecks();
  const finaleBefore = await finaleFixture(true), finaleAfter = await finaleFixture(false);
  assert.equal(finaleBefore.hiddenDraws, 2); assert.equal(finaleAfter.hiddenDraws, 0);
  assert.equal(finaleBefore.revealTime, finaleAfter.revealTime);
  const projects = await projectChecks();
  const propsBefore = propFixture(true), propsAfter = propFixture(false);
  assert.equal(propsAfter.hiddenWork.layouts, 0); assert.equal(propsAfter.hiddenWork.projections, 0);
  assert.equal(propsBefore.reentry, propsAfter.reentry); assert.equal(propsBefore.behindCamera, propsAfter.behindCamera);
  const marketBefore = marketFixture(true), marketAfter = marketFixture(false);
  assert.equal(marketBefore.hiddenDraws, 2); assert.equal(marketAfter.hiddenDraws, 0);
  assert.equal(marketAfter.reentryDraws, 1); assert.equal(marketBefore.reentryState, marketAfter.reentryState);
  console.log(JSON.stringify({ passed: true, scenes, finale: finaleAfter, projects,
    props: { hiddenWork: propsAfter.hiddenWork, reentryIdentical: true },
    market: { hiddenDraws: marketAfter.hiddenDraws, reentryIdentical: true } }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
