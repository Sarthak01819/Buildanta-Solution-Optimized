/* Evaluate the real timing construction and forward/inverse scroll mappers.
 * Usage: node tools/verify-reference-scroll-pacing.cjs [reference checkout]
 * The frozen baseline below was captured from this checkout BEFORE retiming
 * on 6 Sep 2026. Distances are viewport heights, independent of screen size.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const currentRoot = path.resolve(__dirname, '..');
const referenceRoot = path.resolve(process.argv[2] || process.env.BUILDANTA_REFERENCE_DIR
  || 'C:/Users/sarth/Desktop/Buildanta site/buildanta-site');
const BASELINE = {
  normal: [
    [0, .425, 1.87], [.425, .628, 5.1932], [.628, .684, 3.2264],
    [.684, .768, 3.9696], [.768, .788, .31353066037735877],
    [.788, .788, 4.15], [.788, .945, 2.461215683962263], [.945, 1, 1.892],
  ],
  reduced: [
    [0, .425, 1.02], [.425, .628, .4872], [.628, .684, .1344],
    [.684, .768, .2016], [.768, .788, .048],
    [.788, .788, 0], [.788, .945, .3768], [.945, 1, 1.032],
  ],
};

function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}vh, got ${actual}vh`);
}

function arrowBlock(source, name) {
  const match = source.match(new RegExp(`^  const ${name} = [\\s\\S]*?^  };`, 'm'));
  assert.ok(match, `Actual source must expose ${name}`);
  return match[0];
}

function loadTiming(checkout, reduced, zeroMirror = true) {
  const source = fs.readFileSync(path.join(checkout, 'src/modules/intro.js'), 'utf8');
  const config = fs.readFileSync(path.join(checkout, 'src/config.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/export const/g, 'const');
  const INTRO = vm.runInNewContext(`${config}\nINTRO`, {
    ideaImg: null, codeImg: null, marketImg: null,
  });
  const start = source.indexOf('  const perAct =');
  const end = source.indexOf('  let beatUnlocked =', start);
  assert.ok(start >= 0 && end > start, 'Actual timing block must be identifiable');
  // These authored boundaries live beside their visual consumers, outside the
  // timing block. Read their declarations instead of assuming their values.
  const boundaries = ['ZERO_STAGE_P', 'BURN_START_P'].map(name =>
    source.match(new RegExp(`^  const ${name} = [^;]+;`, 'm'))?.[0] || '').join('\n');
  const zeroInverse = source.includes('  const rawForZeroStage =')
    ? arrowBlock(source, 'rawForZeroStage') : '';
  return vm.runInNewContext(`${boundaries}\n${source.slice(start, end)}
    ${arrowBlock(source, 'rawForP')}
    ${zeroInverse}
    ({ SEGMENTS, introScrollLength, totalScrollLength, introRawEnd,
       rawForP, mapScrollProgress, mapBeatLocal,
       rawForZeroStage: typeof rawForZeroStage === 'undefined' ? null : rawForZeroStage })`,
  { INTRO, n: INTRO.steps.length, reduced, beatEnabled: !reduced,
    USE_ZERO_MIRROR: zeroMirror }, { timeout: 1000 });
}

const distance = (model, from, to) =>
  (model.rawForP(to) - model.rawForP(from)) * model.totalScrollLength;

// Integrate captured numeric rows as an independent baseline oracle. Holds
// belong to later p values; exactly p=.788 addresses the start of the hold.
function baselinePosition(rows, p) {
  return rows.reduce((sum, [from, to, vh]) => sum + (from === to
    ? (p > from ? vh : 0)
    : Math.max(0, Math.min(1, (p - from) / (to - from))) * vh), 0);
}

function checkMappers(model, label) {
  const samples = Array.from({ length: 201 }, (_, i) => i / 200);
  for (const p of [...samples, ...samples.toReversed()]) {
    close(model.mapScrollProgress(model.rawForP(p)), p, `${label} p round-trip ${p}`);
  }
  let elapsed = 0;
  for (const segment of model.SEGMENTS) {
    assert.ok(segment.vh >= 0, `${label} has a negative scroll segment`);
    if (segment.p0 === segment.p1 && segment.vh > 0) {
      for (const local of [0, .25, .5, .75, 1, .75, .5, .25, 0]) {
        close(model.mapScrollProgress((elapsed + local * segment.vh) / model.totalScrollLength),
          segment.p0, `${label} hold stays at its authored p`);
      }
    }
    elapsed += segment.vh;
  }
  for (const local of [0, .2, .7, 1, .7, .2, 0]) {
    const raw = model.introRawEnd + local * (1 - model.introRawEnd);
    close(model.mapBeatLocal(raw), model.introRawEnd === 1 ? 0 : local,
      `${label} blackhole mapper ${local}`);
  }
}

const reference = loadTiming(referenceRoot, false);
const current = loadTiming(currentRoot, false);
const prefix = [0, .240, .425, .628, .684, .738];
for (let i = 1; i < prefix.length; i++) {
  const from = prefix[i - 1], to = prefix[i];
  for (const target of [from + (to - from) / 2, to]) {
    close(distance(current, from, target), distance(reference, from, target),
      `Reference pacing ${from}→${target}`);
  }
}
for (const p of [.738, .753, .768, .778, .788, .8, .865, .92, .945, .9725, 1]) {
  close(distance(current, .738, p),
    baselinePosition(BASELINE.normal, p) - baselinePosition(BASELINE.normal, .738),
    `Protected hand/iris/bill pacing .738→${p}`);
}
const hold = current.SEGMENTS.find(segment => segment.hold === 'zeroStage');
assert.ok(hold, 'The source hand hold must remain present');
close(hold.vh, 4.15, 'Source hand hold');
for (const [from, to, expected] of [
  [0, .08, 1.731244946091644], [.08, .95, 4.15], [.95, 1, 2.461215683962263],
]) {
  close((current.rawForZeroStage(to) - current.rawForZeroStage(from)) * current.totalScrollLength,
    expected, `Source hand progress ${from}→${to}`);
}
close(distance(current, .945, 1), 1.892, 'Dollar transition');
close(current.totalScrollLength - current.introScrollLength, 1.28334375, 'Blackhole distance');
close(current.totalScrollLength - current.introScrollLength,
  reference.totalScrollLength - reference.introScrollLength, 'Reference blackhole distance');
checkMappers(current, 'Normal');

const reduced = loadTiming(currentRoot, true);
for (const p of Array.from({ length: 1001 }, (_, i) => i / 1000)) {
  close(distance(reduced, 0, p), baselinePosition(BASELINE.reduced, p),
    `Reduced motion remains unchanged at ${p}`);
}
close(reduced.totalScrollLength, 3.3, 'Reduced total');
close(reduced.SEGMENTS.find(segment => segment.hold === 'zeroStage').vh, 0, 'Reduced hold');
checkMappers(reduced, 'Reduced');
// The optional legacy rendering mode must also retain finite, reversible math.
checkMappers(loadTiming(currentRoot, false, false), 'Legacy');
console.log(`PASS: reference prefix and blackhole; protected iris, WE SCALE and dollar; reduced motion; forward/reverse mappers. Total ${current.totalScrollLength.toFixed(9)}vh / reduced ${reduced.totalScrollLength}vh.`);
