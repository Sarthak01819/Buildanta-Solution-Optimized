/* Node-only GL command/state verification. No browser, GPU, or source writes.
 * Compares the optimized engine with the untouched sibling source at every
 * draw, including mutable CONFIG colors, settings, grades and resize.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const ORIGINAL = process.env.ORIGINAL_SITE || path.resolve(ROOT, '../buildanta-site');
const read = (file, original = false) => fs.readFileSync(path.join(original ? ORIGINAL : ROOT, file), 'utf8');
const strip = source => source.replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let))/g, '');
const load = (file, symbol, context = {}, original = false) => vm.runInNewContext(
  `${strip(read(file, original))}\n${symbol}`, context);
const createUniformCache = load('src/gl/blackhole/uniformCache.js', 'createUniformCache');

function unitChecks() {
  const calls = [];
  const gl = Object.fromEntries(['uniform1f', 'uniform1i', 'uniform2f', 'uniform3fv']
    .map(method => [method, (...args) => calls.push([method, ...args])]));
  const cache = createUniformCache(gl);
  const scalar = {}, integer = {}, dimensions = {}, color = {}, otherProgram = {};
  cache.uniform1f(scalar, 0); cache.uniform1f(scalar, 0); cache.uniform1f(scalar, 1);
  cache.uniform1i(integer, 0); cache.uniform1i(integer, 0); cache.uniform1i(integer, 1);
  cache.uniform2f(dimensions, 800, 600); cache.uniform2f(dimensions, 800, 600);
  cache.uniform2f(dimensions, 1280, 720); cache.uniform2f(dimensions, 800, 600);
  const vector = new Float32Array([1, 0.5, 0.25]);
  cache.uniform3fv(color, vector); cache.uniform3fv(color, vector);
  vector[1] = 0.75; cache.uniform3fv(color, vector);
  cache.uniform3fv(color, [1, 0.75, 0.25]);
  cache.uniform1f(otherProgram, 1);
  cache.uniform1f(null, 4); cache.uniform1i(null, 1);
  cache.uniform2f(null, 1, 2); cache.uniform3fv(null, vector);
  assert.equal(calls.length, 10);
  return { emittedCalls: calls.length, mutableVectorDetected: true, locationsIndependent: true };
}

async function engineFixture(original) {
  const CONFIG = load('src/gl/blackhole/config.js', 'CONFIG');
  const values = new Map(), draws = [], sizes = [], boundTextures = new Map();
  let program, target, viewport, activeUnit = 0, targetId = 0, uniformCalls = 0;
  const gl = {
    FRAMEBUFFER: 1, TEXTURE0: 100, TEXTURE_2D: 2,
    bindFramebuffer(_kind, fb) { target = fb; },
    viewport(...args) { viewport = args; },
    activeTexture(unit) { activeUnit = unit - this.TEXTURE0; },
    bindTexture(_kind, texture) { boundTextures.set(activeUnit, texture); },
    finish() {},
  };
  for (const method of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3fv']) {
    gl[method] = (location, ...args) => {
      uniformCalls++;
      values.set(location, method === 'uniform3fv' ? Array.from(args[0])
        : method === 'uniform2f' ? args : args[0]);
    };
  }
  const context = {
    CONFIG, SHADER_V: 17, createUniformCache,
    createGL: () => ({ gl, hdr: true }),
    compileProgram(_gl, _vertex, _fragment, label) {
      const locations = new Map();
      return {
        use() { program = label; },
        loc(name) {
          if (!locations.has(name)) locations.set(name, { label, name });
          return locations.get(name);
        },
      };
    },
    makeTarget(_gl, w, h) {
      const id = ++targetId;
      sizes.push([w, h]);
      return { w, h, fb: id, tex: id };
    },
    disposeTarget() {},
    drawFullscreen() {
      const current = Object.fromEntries([...values]
        .filter(([location]) => location.label === program)
        .map(([location, value]) => [location.name, value]));
      draws.push(JSON.stringify({ program, target, viewport, current,
        textures: [...boundTextures] }));
    },
  };
  const create = load('src/gl/blackhole/blackhole.js', 'createBlackhole', context, original);
  const engine = await create({}, { shaders: {} });
  const state = { tSec: 21, breath: 0.5, cursorBoost: 0, yawRad: 0, pitchRad: 0, reduced: false };
  engine.size(800, 600);
  engine.render(state); engine.render(state);
  state.tSec += 0.016; state.breath = 0.61; engine.render(state);
  CONFIG.camera.fovYDeg += 0.5;
  CONFIG.post.exposure *= 1.25;
  CONFIG.quality.steps += 1;
  CONFIG.colors.hot[1] = 0.81; // mutate the same array reference
  CONFIG.colors.mid = new Float32Array(CONFIG.colors.mid);
  engine.render(state);
  CONFIG.colors.mid[2] += 0.125; // mutate the same typed-array reference
  state.grade = { grain: 0, hazeGain: 0, wideBoost: 0.6, bloomStrength: 1.15 };
  state.lean = { x: 0.12, y: -0.24 }; state.pulse = 0.4;
  engine.render(state);
  state.lean.x = -0.12;
  engine.size(1280, 720); engine.render(state);
  engine.size(800, 600); delete state.grade; state.reduced = true; engine.render(state);
  return { draws, sizes, uniformCalls };
}

(async () => {
  const unit = unitChecks();
  const before = await engineFixture(true), after = await engineFixture(false);
  assert.deepEqual(after.draws, before.draws, 'Effective GL state differs at a draw');
  assert.deepEqual(after.sizes, before.sizes, 'Render target sizing changed');
  assert.ok(after.uniformCalls < before.uniformCalls, 'Unchanged uniforms were not eliminated');
  console.log(JSON.stringify({ passed: true, unit, drawsCompared: after.draws.length,
    uniformCallsBefore: before.uniformCalls, uniformCallsAfter: after.uniformCalls,
    mutableConfigGradeAndResizePreserved: true }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
