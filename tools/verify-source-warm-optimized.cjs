/* Node-only checks of the actual source-stage warm() implementation.
 * No browser/GPU, production writes, or duplicated implementation of warm().
 * Run: node tools/verify-source-warm-optimized.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../src/gl/zeroMirrorStage.js'), 'utf8');
const start = source.indexOf('  let warmPromise = null;');
const end = source.indexOf('\n  const api = {', start);
assert.ok(start >= 0 && end > start, 'Could not locate the production warm() closure');
const productionWarm = source.slice(start, end);

function fixture(options = {}) {
  const levels = options.levels ?? 3;
  const calls = [], allocations = [], compilations = [], uploads = [];
  const makeTarget = name => Object.freeze({ name, width: 390, height: 844 });
  const stageTarget = makeTarget('stage');
  const lensTargets = ['lens0', 'lens1', 'lens2'].map(makeTarget);
  const resolvedTarget = makeTarget('resolved');
  const priorTarget = options.offscreen ? makeTarget('live-offscreen') : null;
  const logicalViewport = [1.25, 2.25, 390.5, 844.5];
  const logicalScissor = [3.25, 4.25, 250.5, 600.5];
  const targetViewport = [0, 0, 780, 1688];
  const targetScissor = [10, 20, 760, 1600];
  const priorTest = options.scissorTest ?? true;
  let boundTarget = priorTarget, activeFace = 2, activeMip = 1;
  let actualViewport = [...(priorTarget ? targetViewport : logicalViewport)];
  let actualScissor = [...(priorTarget ? targetScissor : logicalScissor)];
  let actualTest = priorTest, pendingRestore = false, yields = 0, vectorCount = 0;
  class Vector4 {
    constructor() { vectorCount++; }
    copy(values) { this.values = [...values]; return this; }
  }
  const makeScene = name => ({
    name, objects: [{ visible: false }, { visible: true }],
    traverse(callback) { this.objects.forEach(callback); },
  });
  const scenes = Object.fromEntries(['scene', 'backgroundScene', 'foregroundScene',
    'lensScene', 'lensCompositeScene', 'compositeScene'].map(name => [name, makeScene(name)]));
  const originalMaterial = { name: 'live-lens-material' };
  const lensQuad = { material: originalMaterial };
  function assertRestored() {
    assert.equal(boundTarget, priorTarget, 'Framebuffer was not rebound');
    assert.equal(activeFace, 2, 'Active cube face changed');
    assert.equal(activeMip, 1, 'Active mip level changed');
    assert.deepEqual(actualViewport, priorTarget ? targetViewport : logicalViewport);
    assert.deepEqual(actualScissor, priorTarget ? targetScissor : logicalScissor);
    assert.equal(actualTest, priorTest, 'Scissor test changed');
    pendingRestore = false;
  }
  const renderer = {
    getRenderTarget: () => priorTarget,
    getActiveCubeFace: () => 2,
    getActiveMipmapLevel: () => 1,
    getScissorTest: () => priorTest,
    getViewport: vector => vector.copy(logicalViewport),
    getScissor: vector => vector.copy(logicalScissor),
    initTexture(texture) { uploads.push(texture); calls.push('texture'); },
    initRenderTarget(target) {
      allocations.push(target); calls.push('target'); pendingRestore = true;
      // Three's allocation changes the real binding, not getRenderTarget().
      boundTarget = null;
      if (options.failAllocation) throw new Error('allocation failure');
    },
    setRenderTarget(target, face, mip) {
      boundTarget = target; activeFace = face; activeMip = mip;
      actualViewport = [...(target ? targetViewport : logicalViewport.map(Math.floor))];
      actualScissor = [...(target ? targetScissor : logicalScissor.map(Math.floor))];
      actualTest = priorTest;
    },
    setViewport(vector) {
      assert.equal(priorTarget, null, 'Logical/DPR viewport applied to physical target');
      actualViewport = [...vector.values];
    },
    setScissor(vector) {
      assert.equal(priorTarget, null, 'Logical/DPR scissor applied to physical target');
      actualScissor = [...vector.values];
    },
    setScissorTest(value) { actualTest = value; },
    compileAsync(scene) {
      assert.ok(scene.objects.every(object => object.visible), 'Hidden material not compiled');
      compilations.push(scene); calls.push('compile');
      return Promise.resolve();
    },
  };
  if (options.missingAPI) delete renderer.initRenderTarget;
  const context = {
    renderer, stageTarget, lensTargets, resolvedTarget, state: { lensIterations: levels },
    Vector4, disposed: options.disposed ?? false, api: { ready: Promise.resolve() },
    ownedTextures: [{ name: 'original-a' }, { name: 'original-b' }], ...scenes,
    camera: {}, backgroundCamera: {}, lensQuad,
    lensDownMaterial: { name: 'down' }, lensUpMaterial: { name: 'up' },
    setTimeout(callback, delay) {
      assert.equal(delay, 0);
      if (pendingRestore) assertRestored(); // Restoration must precede every yield.
      yields++;
      if (options.disposeAfterFirstTarget && allocations.length === 1) context.disposed = true;
      if (options.changeViewportBetweenTargets && !priorTarget && allocations.length) {
        logicalViewport[0] += 0.125;
        logicalScissor[0] += 0.125;
        actualViewport = [...logicalViewport]; actualScissor = [...logicalScissor];
      }
      return setImmediate(callback);
    },
  };
  const warm = vm.runInNewContext(`${productionWarm}\nwarm`, context);
  return {
    warm, allocations, compilations, uploads, calls, assertRestored,
    expectedTargets: [stageTarget, ...lensTargets.slice(0, levels), resolvedTarget],
    get yields() { return yields; }, get vectorCount() { return vectorCount; },
    assertCompilationRestored() {
      assert.equal(lensQuad.material, originalMaterial);
      Object.values(scenes).forEach(scene => assert.deepEqual(
        scene.objects.map(object => object.visible), [false, true]));
    },
  };
}

(async () => {
  let cases = 0;
  for (const levels of [2, 3]) for (const offscreen of [false, true]) {
    for (const scissorTest of [false, true]) for (const failAllocation of [false, true]) {
      const test = fixture({ levels, offscreen, scissorTest, failAllocation });
      const first = test.warm();
      assert.equal(test.warm(), first, 'Concurrent warm-up is not memoized');
      if (failAllocation) {
        await assert.rejects(first, /allocation failure/);
        assert.equal(test.allocations.length, 1);
        assert.equal(test.compilations.length, 0);
      } else {
        await first;
        assert.deepEqual(test.allocations, test.expectedTargets, 'Changed target selection/order');
        assert.equal(test.compilations.length, 7);
        assert.equal(test.yields, 2 + levels + 2 + 7, 'Targets must be allocated in separate tasks');
        assert.deepEqual(test.calls, [
          ...Array(2).fill('texture'), ...Array(levels + 2).fill('target'), ...Array(7).fill('compile'),
        ]);
        test.assertCompilationRestored();
      }
      assert.equal(test.vectorCount, 2, 'Warm-up should use two private scratch vectors');
      assert.equal(test.warm(), first, 'Settled warm-up is not memoized');
      test.assertRestored();
      cases++;
    }
  }
  const missing = fixture({ missingAPI: true });
  await missing.warm();
  assert.equal(missing.allocations.length, 0);
  assert.equal(missing.compilations.length, 7);
  const disposed = fixture({ disposed: true });
  await disposed.warm();
  assert.equal(disposed.calls.length, 0);
  const midDispose = fixture({ disposeAfterFirstTarget: true });
  await midDispose.warm();
  assert.equal(midDispose.allocations.length, 1);
  assert.equal(midDispose.compilations.length, 0);
  midDispose.assertRestored();
  const interleaved = fixture({ changeViewportBetweenTargets: true });
  await interleaved.warm();
  interleaved.assertRestored();
  console.log(JSON.stringify({ passed: true, cases: cases + 4,
    checks: ['existing targets only', 'memoization', 'separate allocation tasks',
      'null/offscreen target, cube face and mip restoration', 'custom viewport/scissor state',
      'restoration before yield and on failure', 'live viewport changes between yields',
      'missing API', 'disposal', 'compilation visibility/material restoration'],
    scope: 'Production warm() with a controlled renderer; no browser or GPU assertion.',
  }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
