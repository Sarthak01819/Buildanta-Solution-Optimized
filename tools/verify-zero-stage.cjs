/* Deterministic visual + interaction contract for the ZeroMirror Stage 1 port.
   It captures the authored checkpoints, the bridge seam, reverse travel,
   orientation changes, reduced motion and the gesture-gated audio state. */
const fs = require("fs");
const path = require("path");
const { decode } = require("./png.cjs");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(
    process.env.APPDATA,
    "npm/node_modules/@playwright/cli/node_modules/playwright",
  )));
}

const URL = process.env.SITE_URL || "http://127.0.0.1:5173/";
const OUT = path.join(__dirname, "..", "shots-zero-stage");
const STOPS = [0.04, 0.11, 0.17, 0.22, 0.30, 0.38, 0.44, 0.53, 0.59, 0.72, 0.95, 0.96, 0.97, 0.98, 0.99, 1];
const MOBILE_STOPS = [0.04, 0.17, 0.30, 0.44, 0.59, 0.72, 0.95, 0.96, 0.97, 0.98, 0.99, 1];
const LANDSCAPE_STOPS = [0.17, 0.30, 0.59, 0.95, 0.97, 0.99, 1];
const REVERSE_STOPS = [0.11, 0.30, 0.59, 0.95, 0.975];
const SEAM_POINTS = [
  { name: "zero-local-1", kind: "zero", value: 1 },
  { name: "logical-0790", kind: "logical", value: 0.790 },
  { name: "logical-0795", kind: "logical", value: 0.795 },
  { name: "logical-0802", kind: "logical", value: 0.802 },
];
const FINE_SEAM_POINTS = Array.from({ length: 15 }, (_, index) => (788 + index) / 1000);
const POINTER_PROGRESS = [0.30, 0.72];
const POINTER_POSITIONS = [
  { name: "north-west", x: 0.08, y: 0.08 },
  { name: "north-east", x: 0.92, y: 0.08 },
  { name: "south-east", x: 0.92, y: 0.92 },
  { name: "south-west", x: 0.08, y: 0.92 },
];
const PROGRESS_TOLERANCE = 0.0025;
const REVERSE_DIFF_LIMIT = 0.75;
const SEAM_DIFF_LIMIT = 0.75;
const POINTER_CHANGED_MIN = 0.005;
const POINTER_CHANGED_MAX = 65;
const POINTER_MEAN_DELTA_MAX = 16;
const POINTER_RETURN_DIFF_LIMIT = 0.75;
const SEAM_LUMINANCE_STEP_LIMIT = 20;
const SEAM_CHANGED_LIMIT = 35;
const SEAM_MEAN_DELTA_LIMIT = 12;
const SEAM_HAND_CHANGED_LIMIT = 45;
const SEAM_HAND_MEAN_DELTA_LIMIT = 16;

function frameDiff(a, b) {
  if (a.w !== b.w || a.h !== b.h || a.bpp !== b.bpp) return 100;
  let changed = 0;
  let compared = 0;
  for (let index = 0; index < a.data.length; index += a.bpp) {
    const delta = Math.max(
      Math.abs(a.data[index] - b.data[index]),
      Math.abs(a.data[index + 1] - b.data[index + 1]),
      Math.abs(a.data[index + 2] - b.data[index + 2]),
    );
    if (delta > 10) changed += 1;
    compared += 1;
  }
  return changed / compared * 100;
}

function frameDelta(a, b, bounds = null) {
  if (a.w !== b.w || a.h !== b.h || a.bpp !== b.bpp) {
    return { changed: 100, mean: 255, max: 255 };
  }
  const x0 = Math.max(0, Math.floor((bounds?.x0 ?? 0) * a.w));
  const y0 = Math.max(0, Math.floor((bounds?.y0 ?? 0) * a.h));
  const x1 = Math.min(a.w, Math.ceil((bounds?.x1 ?? 1) * a.w));
  const y1 = Math.min(a.h, Math.ceil((bounds?.y1 ?? 1) * a.h));
  let changed = 0;
  let sum = 0;
  let max = 0;
  let compared = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * a.w * a.bpp;
    for (let x = x0; x < x1; x += 1) {
      const index = row + x * a.bpp;
      const red = Math.abs(a.data[index] - b.data[index]);
      const green = Math.abs(a.data[index + 1] - b.data[index + 1]);
      const blue = Math.abs(a.data[index + 2] - b.data[index + 2]);
      const peak = Math.max(red, green, blue);
      if (peak > 10) changed += 1;
      sum += (red + green + blue) / 3;
      max = Math.max(max, peak);
      compared += 1;
    }
  }
  return {
    changed: Number((changed / compared * 100).toFixed(3)),
    mean: Number((sum / compared).toFixed(3)),
    max,
  };
}

function imageStats(image) {
  let sum = 0;
  let sumSquare = 0;
  let min = 255;
  let max = 0;
  let count = 0;
  for (let index = 0; index < image.data.length; index += image.bpp) {
    const value = 0.2126 * image.data[index] +
      0.7152 * image.data[index + 1] +
      0.0722 * image.data[index + 2];
    sum += value;
    sumSquare += value * value;
    min = Math.min(min, value);
    max = Math.max(max, value);
    count += 1;
  }
  const mean = sum / count;
  return {
    mean: Number(mean.toFixed(2)),
    deviation: Number(Math.sqrt(Math.max(0, sumSquare / count - mean * mean)).toFixed(2)),
    range: Number((max - min).toFixed(2)),
  };
}

function check(run, name, pass, details = undefined) {
  run.assertions.push({ name, pass: Boolean(pass), ...(details === undefined ? {} : { details }) });
}

function audioAuditBootstrap({ rejectFirstWhooshUnlock }) {
  const audit = {
    events: [],
    gestures: [],
    tracks: [],
    currentGesture: null,
    rejectedWhooshUnlock: false,
  };
  let nextId = 1;

  for (const type of ["pointerdown", "touchstart", "click", "keydown"]) {
    addEventListener(type, (event) => {
      const gesture = {
        type,
        trusted: event.isTrusted,
        key: event.key || null,
        userActivation: Boolean(navigator.userActivation?.isActive),
      };
      audit.gestures.push(gesture);
      audit.currentGesture = gesture;
      setTimeout(() => {
        if (audit.currentGesture === gesture) audit.currentGesture = null;
      }, 0);
    }, true);
  }

  class AuditAudio {
    constructor(src) {
      this.id = nextId++;
      this.src = String(src || "");
      this.currentTime = 0;
      this.loop = false;
      this.preload = "";
      this.volume = 1;
      this.paused = true;
      audit.tracks.push(this);
    }

    play() {
      const gesture = audit.currentGesture ? { ...audit.currentGesture } : null;
      const event = {
        type: "play",
        id: this.id,
        src: this.src,
        volume: this.volume,
        loop: this.loop,
        gesture,
        result: "resolved",
      };
      const reject = rejectFirstWhooshUnlock &&
        !audit.rejectedWhooshUnlock &&
        this.src.includes("fx_whoosh") &&
        this.volume === 0;
      if (reject) {
        audit.rejectedWhooshUnlock = true;
        event.result = "rejected";
        this.paused = true;
        audit.events.push(event);
        return Promise.reject(new DOMException("Synthetic unlock denial", "NotAllowedError"));
      }
      this.paused = false;
      audit.events.push(event);
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
      audit.events.push({
        type: "pause",
        id: this.id,
        src: this.src,
        volume: this.volume,
        gesture: audit.currentGesture ? { ...audit.currentGesture } : null,
      });
    }

    removeAttribute(name) {
      if (name === "src") this.src = "";
    }

    load() {}
  }

  audit.snapshot = () => ({
    rejectedWhooshUnlock: audit.rejectedWhooshUnlock,
    gestures: audit.gestures.map((entry) => ({ ...entry })),
    events: audit.events.map((entry) => ({ ...entry })),
    tracks: audit.tracks.map((track) => ({
      id: track.id,
      src: track.src,
      currentTime: track.currentTime,
      loop: track.loop,
      preload: track.preload,
      volume: track.volume,
      paused: track.paused,
    })),
  });
  window.__zeroStageAudioAudit = audit;
  window.Audio = AuditAudio;
}

async function scrollRaw(page, raw) {
  await page.evaluate((target) => {
    const { intro, lenis } = window.__buildanta;
    const y = intro.st.start + (intro.st.end - intro.st.start) * target;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo(0, y);
  }, raw);
  await page.waitForTimeout(420);
}

async function goZero(page, progress) {
  const raw = await page.evaluate((target) => window.__buildanta.intro.rawForZeroStage(target), progress);
  await scrollRaw(page, raw);
}

async function goLogical(page, progress) {
  const raw = await page.evaluate((target) => window.__buildanta.intro.rawForP(target), progress);
  await scrollRaw(page, raw);
}

async function stageState(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".consult-zero");
    const style = root ? getComputedStyle(root) : null;
    const bridge = window.__zeroMirrorStageBridge?.state;
    return {
      logicalProgress: window.__buildanta?.intro?.progress ?? null,
      progress: style ? Number(style.getPropertyValue("--zero-stage-progress")) : null,
      opacity: style ? Number(style.getPropertyValue("--zero-stage")) : null,
      live: Boolean(root?.classList.contains("zero-stage-live")),
      bridgeReady: Boolean(bridge?.bridgeReady),
      assetErrors: [...(bridge?.loadErrors || [])],
    };
  });
}

async function capture(page, file) {
  const buffer = await page.screenshot();
  fs.writeFileSync(file, buffer);
  return { buffer, image: decode(buffer) };
}

async function preparePage(browser, label, viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: Boolean(options.mobile),
    hasTouch: Boolean(options.mobile),
  });
  const page = await context.newPage();
  const run = {
    label,
    viewport,
    states: [],
    reverse: [],
    seams: [],
    fineSeams: [],
    pointer: [],
    assertions: [],
    errors: [],
    failedAssets: [],
    failedRequests: [],
  };

  await page.addInitScript(audioAuditBootstrap, {
    rejectFirstWhooshUnlock: Boolean(options.rejectFirstWhooshUnlock),
  });
  page.on("pageerror", (error) => run.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      run.errors.push(`console: ${message.text()} @ ${location.url || "unknown"}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) run.failedAssets.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => run.failedRequests.push({
    url: request.url(), resourceType: request.resourceType(), error: request.failure()?.errorText || "unknown",
  }));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    "window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready && window.__zeroStageAudioDebug",
    null,
    { timeout: 60000 },
  );
  await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
  await page.evaluate(() => { window.__bbPinTime = 300000; });
  await page.waitForTimeout(300);
  return { context, page, run };
}

async function verifyAudioUnlock(page, run, pointer) {
  const before = await page.evaluate(() => window.__zeroStageAudioAudit.snapshot());
  await page.evaluate(() => dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await page.waitForTimeout(20);
  const afterSynthetic = await page.evaluate(() => window.__zeroStageAudioAudit.snapshot());
  check(
    run,
    "synthetic events cannot unlock audio",
    afterSynthetic.events.filter((event) => event.type === "play").length ===
      before.events.filter((event) => event.type === "play").length,
  );

  await pointer();
  await page.waitForTimeout(60);
  let audioState = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  if (!audioState.armed) {
    await pointer();
    await page.waitForTimeout(60);
    audioState = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  }
  const audit = await page.evaluate(() => window.__zeroStageAudioAudit.snapshot());
  const trustedSilentPlays = audit.events.filter((event) =>
    event.type === "play" && event.volume === 0 && event.gesture?.trusted,
  );
  const unlockedNames = new Set(trustedSilentPlays.map((event) => {
    if (event.src.includes("amb_stage1")) return "ambient";
    if (event.src.includes("fx_hand-entry")) return "hand-entry";
    if (event.src.includes("fx_whoosh")) return "whoosh";
    return "unknown";
  }));
  check(run, "first trusted gesture silently primes all three tracks",
    ["ambient", "hand-entry", "whoosh"].every((name) => unlockedNames.has(name)),
    { trustedSilentPlays: trustedSilentPlays.length });
  check(run, "audio arms only after every track unlocks", audioState.armed &&
    Object.values(audioState.channels).every((channel) => channel.unlocked), audioState.channels);
  check(run, "rejected unlock is retried", !run.label.startsWith("desktop") ||
    (audit.rejectedWhooshUnlock && audioState.channels.whoosh.attempts >= 2),
    { rejected: audit.rejectedWhooshUnlock, attempts: audioState.channels.whoosh.attempts });

  const audioUrls = [...new Set(audit.tracks.map((track) => track.src).filter(Boolean))];
  const statuses = [];
  for (const audioUrl of audioUrls) {
    const response = await page.request.get(new globalThis.URL(audioUrl, URL).href);
    statuses.push({ url: audioUrl, status: response.status() });
  }
  run.audioAssets = statuses;
  check(run, "all referenced audio assets resolve", statuses.length === 3 &&
    statuses.every((entry) => entry.status < 400), statuses);
}

async function captureZeroSequence(page, run, label, stops) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const forward = new Map();
  const reverseStops = REVERSE_STOPS.filter((progress) => stops.includes(progress));

  for (const progress of stops) {
    await goZero(page, progress);
    const state = await stageState(page);
    run.states.push({ requested: progress, ...state });
    const shot = await capture(page, path.join(dir, `p${String(Math.round(progress * 1000)).padStart(4, "0")}.png`));
    check(run, `${label} p=${progress} resolves requested stage state`,
      Math.abs(state.progress - progress) <= PROGRESS_TOLERANCE,
      { actual: state.progress, tolerance: PROGRESS_TOLERANCE });
    check(run, `${label} p=${progress} assets and bridge are ready`,
      state.bridgeReady && state.assetErrors.length === 0, state);
    if (reverseStops.includes(progress)) forward.set(progress, shot.image);
  }

  /* Keep the cue totals from the first forward traversal. The reverse pass
     intentionally rearms whoosh, so a later return to p=1 is a second valid
     crossing and must not rewrite what "once on first forward" means. */
  run.forwardAudioState = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  const cueBeforeReverse = run.forwardAudioState.cues;
  for (const progress of [...reverseStops].reverse()) {
    await goZero(page, progress);
    const current = decode(await page.screenshot());
    const difference = frameDiff(forward.get(progress), current);
    run.reverse.push({ progress, difference: Number(difference.toFixed(3)), viewport: label });
    check(run, `${label} reverse p=${progress} stays deterministic`,
      difference <= REVERSE_DIFF_LIMIT,
      { difference: Number(difference.toFixed(3)), limit: REVERSE_DIFF_LIMIT });
  }
  const cueAfterReverse = await page.evaluate(() => window.__zeroStageAudioDebug.state.cues);
  check(run, `${label} reverse travel emits no one-shots`,
    cueAfterReverse["hand-entry"].successes === cueBeforeReverse["hand-entry"].successes &&
      cueAfterReverse.whoosh.successes === cueBeforeReverse.whoosh.successes,
    { before: cueBeforeReverse, after: cueAfterReverse });
}

async function advancePinnedFrames(page, seconds) {
  /* __bbPinTime intentionally freezes all animation for repeatable captures.
     Advance that same clock in fixed 50ms quanta so pointer smoothing is both
     exercised and deterministic instead of waiting on irrelevant wall time. */
  const frameCount = Math.max(1, Math.ceil(seconds / 0.05));
  for (let index = 0; index < frameCount; index += 1) {
    await page.evaluate(() => { window.__bbPinTime += 50; });
    await page.waitForTimeout(24);
  }
}

async function verifyPointerParallax(page, run) {
  const dir = path.join(OUT, "desktop-pointer");
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => {
    window.__zeroPointerAudit = [];
    addEventListener("pointermove", (event) => {
      window.__zeroPointerAudit.push({
        x: event.clientX,
        y: event.clientY,
        trusted: event.isTrusted,
      });
    }, { passive: true });
  });

  const viewport = page.viewportSize();
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  for (const progress of POINTER_PROGRESS) {
    await page.evaluate(() => { window.__zeroPointerAudit.length = 0; });
    await goZero(page, progress);
    await page.mouse.move(center.x, center.y, { steps: 8 });
    await advancePinnedFrames(page, 0.9);
    const prefix = `p${String(Math.round(progress * 100)).padStart(2, "0")}`;
    const centered = await capture(page, path.join(dir, `${prefix}-center.png`));
    const samples = [];

    for (const position of POINTER_POSITIONS) {
      const target = {
        x: Math.round(viewport.width * position.x),
        y: Math.round(viewport.height * position.y),
      };
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await advancePinnedFrames(page, 0.9);
      const shot = await capture(page, path.join(dir, `${prefix}-${position.name}.png`));
      samples.push({
        name: position.name,
        target,
        delta: frameDelta(centered.image, shot.image),
      });
    }

    await page.mouse.move(center.x, center.y, { steps: 8 });
    await advancePinnedFrames(page, 1.4);
    const returned = await capture(page, path.join(dir, `${prefix}-center-return.png`));
    const returnDelta = frameDelta(centered.image, returned.image);
    const pointerEvents = await page.evaluate(() => window.__zeroPointerAudit.slice());
    const targetsWereTrusted = [center, ...samples.map((sample) => sample.target)].every((target) =>
      pointerEvents.some((event) => event.trusted &&
        Math.abs(event.x - target.x) <= 1 && Math.abs(event.y - target.y) <= 1));
    run.pointer.push({ progress, samples, returnDelta, trustedEvents: pointerEvents.length });

    check(run, `pointer p=${progress} captures are driven by trusted movement`,
      targetsWereTrusted && pointerEvents.length >= POINTER_POSITIONS.length + 1,
      { trustedEvents: pointerEvents.filter((event) => event.trusted).length });
    check(run, `pointer p=${progress} produces subtle nonzero parallax at every corner`,
      samples.every((sample) => sample.delta.changed >= POINTER_CHANGED_MIN &&
        sample.delta.changed <= POINTER_CHANGED_MAX &&
        sample.delta.mean <= POINTER_MEAN_DELTA_MAX),
      { limits: { minChanged: POINTER_CHANGED_MIN, maxChanged: POINTER_CHANGED_MAX,
        maxMeanDelta: POINTER_MEAN_DELTA_MAX }, samples });
    check(run, `pointer p=${progress} settles back to the centered frame`,
      returnDelta.changed <= POINTER_RETURN_DIFF_LIMIT,
      { limit: POINTER_RETURN_DIFF_LIMIT, delta: returnDelta });
  }
}

async function captureFineSeams(page, run) {
  const dir = path.join(OUT, "desktop-seams-fine");
  fs.mkdirSync(dir, { recursive: true });
  const forward = new Map();
  const forwardEntries = [];
  let previous = null;

  for (const progress of FINE_SEAM_POINTS) {
    /* Logical .788 is a zero-span HOLD with two valid raw addresses. Follow
       the visitor's forward path through the hold EXIT (stage local 1), not
       rawForP(.788), whose inverse necessarily selects the early-hand entry. */
    if (progress === FINE_SEAM_POINTS[0]) await goZero(page, 1);
    else await goLogical(page, progress);
    const state = await stageState(page);
    const shot = await capture(page, path.join(dir, `logical-${String(Math.round(progress * 1000)).padStart(4, "0")}-forward.png`));
    const stats = imageStats(shot.image);
    const adjacent = previous ? {
      whole: frameDelta(previous.image, shot.image),
      handRegion: frameDelta(previous.image, shot.image, { x0: 0, y0: 0, x1: 0.62, y1: 0.72 }),
      luminanceStep: Number(Math.abs(stats.mean - previous.stats.mean).toFixed(3)),
    } : null;
    const entry = { progress, logicalProgress: state.logicalProgress, opacity: state.opacity, stats, adjacent };
    forwardEntries.push(entry);
    forward.set(progress, shot.image);
    previous = { image: shot.image, stats };
  }

  await goLogical(page, 0.81);
  const reverseEntries = [];
  for (const progress of [...FINE_SEAM_POINTS].reverse()) {
    /* End reverse travel on that same hold-exit representation so forward
       and reverse compare the same authored frame at the ambiguous boundary. */
    if (progress === FINE_SEAM_POINTS[0]) await goZero(page, 1);
    else await goLogical(page, progress);
    const shot = await capture(page, path.join(dir, `logical-${String(Math.round(progress * 1000)).padStart(4, "0")}-reverse.png`));
    reverseEntries.push({
      progress,
      difference: Number(frameDiff(forward.get(progress), shot.image).toFixed(3)),
    });
  }
  run.fineSeams = { forward: forwardEntries, reverse: reverseEntries };

  const adjacentEntries = forwardEntries.filter((entry) => entry.adjacent);
  check(run, "fine seam samples every .001 from .788 through .802",
    forwardEntries.length === 15 &&
      forwardEntries.every((entry, index) =>
        Math.abs(entry.progress - (0.788 + index * 0.001)) < 1e-9 &&
        Math.abs(entry.logicalProgress - entry.progress) <= PROGRESS_TOLERANCE),
    { samples: forwardEntries.map((entry) => ({ requested: entry.progress, actual: entry.logicalProgress })) });
  check(run, "fine seam contains no blank frame",
    forwardEntries.every((entry) => entry.stats.deviation >= 3 && entry.stats.range >= 30),
    forwardEntries.map((entry) => ({ progress: entry.progress, ...entry.stats })));
  check(run, "fine seam has no one-frame luminance flash",
    adjacentEntries.every((entry) => entry.adjacent.luminanceStep <= SEAM_LUMINANCE_STEP_LIMIT),
    { limit: SEAM_LUMINANCE_STEP_LIMIT,
      steps: adjacentEntries.map((entry) => ({ progress: entry.progress, delta: entry.adjacent.luminanceStep })) });
  check(run, "fine seam pixel changes stay continuous across the full frame",
    adjacentEntries.every((entry) => entry.adjacent.whole.changed <= SEAM_CHANGED_LIMIT &&
      entry.adjacent.whole.mean <= SEAM_MEAN_DELTA_LIMIT),
    { limits: { changed: SEAM_CHANGED_LIMIT, mean: SEAM_MEAN_DELTA_LIMIT },
      steps: adjacentEntries.map((entry) => ({ progress: entry.progress, ...entry.adjacent.whole })) });
  check(run, "fine seam pixel changes stay continuous through the green-hand region",
    adjacentEntries.every((entry) => entry.adjacent.handRegion.changed <= SEAM_HAND_CHANGED_LIMIT &&
      entry.adjacent.handRegion.mean <= SEAM_HAND_MEAN_DELTA_LIMIT),
    { limits: { changed: SEAM_HAND_CHANGED_LIMIT, mean: SEAM_HAND_MEAN_DELTA_LIMIT },
      steps: adjacentEntries.map((entry) => ({ progress: entry.progress, ...entry.adjacent.handRegion })) });
  check(run, "fine seam remains deterministic in reverse",
    reverseEntries.every((entry) => entry.difference <= SEAM_DIFF_LIMIT),
    { limit: SEAM_DIFF_LIMIT, samples: reverseEntries });
}

async function captureSeams(page, run) {
  const dir = path.join(OUT, "desktop-seams");
  fs.mkdirSync(dir, { recursive: true });
  const forward = new Map();

  for (const point of SEAM_POINTS) {
    if (point.kind === "zero") await goZero(page, point.value);
    else await goLogical(page, point.value);
    const state = await stageState(page);
    const audioState = await page.evaluate(() => window.__zeroStageAudioDebug.state);
    const shot = await capture(page, path.join(dir, `${point.name}-forward.png`));
    forward.set(point.name, shot.image);
    run.seams.push({ direction: "forward", ...point, ...state, audioActive: audioState.active });
    const expectedLogical = point.kind === "logical" ? point.value : 0.788;
    check(run, `${point.name} lands at its logical seam`,
      Math.abs(state.logicalProgress - expectedLogical) <= PROGRESS_TOLERANCE,
      { actual: state.logicalProgress, expected: expectedLogical });
    check(run, `${point.name} audio follows seam visibility`,
      audioState.active === (state.opacity > 0.002),
      { audioActive: audioState.active, visualOpacity: state.opacity });
  }

  await goLogical(page, 0.81);
  for (const point of [...SEAM_POINTS].reverse()) {
    if (point.kind === "zero") await goZero(page, point.value);
    else await goLogical(page, point.value);
    const state = await stageState(page);
    const shot = await capture(page, path.join(dir, `${point.name}-reverse.png`));
    const difference = frameDiff(forward.get(point.name), shot.image);
    run.seams.push({ direction: "reverse", ...point, ...state, difference: Number(difference.toFixed(3)) });
    check(run, `${point.name} is deterministic across the fist-bump seam`,
      difference <= SEAM_DIFF_LIMIT,
      { difference: Number(difference.toFixed(3)), limit: SEAM_DIFF_LIMIT });
  }
}

async function verifyDesktopAudioTimeline(page, run) {
  /* The atomic scene handoff may select the destination at the exact p=1
     scroll address after pixel rounding. Check active ambience on the last
     unambiguous source frame; the seam test separately checks that audio
     follows whichever scene is actually visible at the endpoint. */
  await goZero(page, 0.99);
  await page.waitForTimeout(650);
  const afterForward = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  const firstForward = run.forwardAudioState;
  check(run, "ambient loops while the last source bridge frame remains visible",
    afterForward.active && Math.abs(afterForward.progress - 0.99) <= PROGRESS_TOLERANCE && afterForward.ambient.loop &&
      !afterForward.ambient.paused && afterForward.ambient.level > 0 &&
      afterForward.ambient.volume <= 0.55 && afterForward.ambient.fadeInSeconds === 1.5,
    afterForward.ambient);
  check(run, "entry cue fires exactly once at the first .02 crossing",
    firstForward.cues["hand-entry"].threshold === 0.02 &&
      firstForward.cues["hand-entry"].successes === 1, firstForward.cues["hand-entry"]);
  check(run, "whoosh cue fires exactly once at the first .95 crossing",
    firstForward.cues.whoosh.threshold === 0.95 &&
      firstForward.cues.whoosh.successes === 1, firstForward.cues.whoosh);

  /* Main reverse capture finishes below .90, so the seam's next forward trip
     must fire the whoosh once more. Entry needs the deliberate <.005 reset. */
  await captureSeams(page, run);
  await goZero(page, 0.004);
  await goZero(page, 0.03);
  const afterRearm = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  check(run, "reverse below each hysteresis boundary rearms one-shots exactly once",
    afterRearm.cues["hand-entry"].successes === 2 && afterRearm.cues.whoosh.successes === 2,
    afterRearm.cues);
  /* Dense seam travel deliberately crosses audio hysteresis repeatedly. Run
     it after the one-shot contract above so visual QA cannot perturb audio QA. */
  await captureFineSeams(page, run);
  await goLogical(page, 0.802);
  const beforeFade = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  await page.waitForTimeout(650);
  const afterFade = await page.evaluate(() => window.__zeroStageAudioDebug.state);
  check(run, "ambient fades after scene ownership passes to the fist-bump",
    !afterFade.active && afterFade.ambient.fadeOutSeconds === 0.45 &&
      afterFade.ambient.level < beforeFade.ambient.level &&
      afterFade.ambient.level >= 0,
    { before: beforeFade.ambient, after: afterFade.ambient });
}

async function verifyOrientationResize(page, run) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    dispatchEvent(new Event("orientationchange"));
    window.__buildanta.ScrollTrigger.refresh();
  });
  await page.waitForTimeout(700);
  await captureZeroSequence(page, run, "landscape-844x390-after-resize", LANDSCAPE_STOPS);
  const dimensions = await page.evaluate(() => {
    const canvas = document.querySelector(".consult-zero__hand-canvas");
    const rect = canvas?.getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      cssWidth: rect?.width || 0,
      cssHeight: rect?.height || 0,
      backingWidth: canvas?.width || 0,
      backingHeight: canvas?.height || 0,
    };
  });
  run.orientation = dimensions;
  check(run, "portrait-to-landscape resize fills the 844x390 viewport",
    dimensions.innerWidth === 844 && dimensions.innerHeight === 390 &&
      dimensions.cssWidth >= 840 && dimensions.cssHeight >= 386 &&
      dimensions.backingWidth >= dimensions.cssWidth && dimensions.backingHeight >= dimensions.cssHeight,
    dimensions);
}

async function captureBridgeOwnership(page, run) {
  const dir = path.join(OUT, "desktop-seams-only");
  fs.mkdirSync(dir, { recursive: true });
  const shots = [];
  const states = [];
  for (const [name, progress] of [["bridge-before-owner-switch", 0.9958], ["bridge-after-owner-switch", 0.9962]]) {
    await goZero(page, progress);
    const state = await page.evaluate(() => {
      const source = window.__zeroMirrorStageBridge;
      const visible = (object) => {
        for (let current = object; current; current = current.parent) {
          if (!current.visible) return false;
        }
        return Boolean(object);
      };
      return {
        progress: source.state.progress,
        sourceGreen: source.state.opacity > 0.002 && visible(source.scene.getObjectByName("GreenHand")),
        destinationGreen: visible(window.__buildanta.meetRoot?.getObjectByName("Hand_Green")),
      };
    });
    states.push({ requested: progress, ...state });
    shots.push(await capture(page, path.join(dir, `${name}.png`)));
  }
  const whole = frameDelta(shots[0].image, shots[1].image);
  const handRegion = frameDelta(shots[0].image, shots[1].image,
    { x0: 0, y0: 0, x1: 0.62, y1: 0.72 });
  run.bridgeOwnership = { states, whole, handRegion };
  check(run, "green mesh ownership switches exactly once between matched bridge frames",
    states[0].sourceGreen && !states[0].destinationGreen &&
      !states[1].sourceGreen && states[1].destinationGreen, states);
  check(run, "green ownership switch preserves the full frame and hand region",
    whole.changed <= SEAM_CHANGED_LIMIT && whole.mean <= SEAM_MEAN_DELTA_LIMIT &&
      handRegion.changed <= SEAM_HAND_CHANGED_LIMIT && handRegion.mean <= SEAM_HAND_MEAN_DELTA_LIMIT,
    { whole, handRegion });
}

async function runDesktop(browser, smoke, seamsOnly = false) {
  const session = await preparePage(browser, "desktop-1200x590", { width: 1200, height: 590 }, {
    rejectFirstWhooshUnlock: true,
  });
  const { context, page, run } = session;
  try {
    if (seamsOnly) {
      await page.mouse.move(600, 295);
      await captureBridgeOwnership(page, run);
      await captureFineSeams(page, run);
      return run;
    }
    await verifyAudioUnlock(page, run, () => page.mouse.click(600, 295));
    await page.mouse.move(600, 295);
    await captureZeroSequence(page, run, "desktop-1200x590", smoke ? [0.30, 0.95, 1] : STOPS);
    if (!smoke) {
      await verifyDesktopAudioTimeline(page, run);
      await verifyPointerParallax(page, run);
    }
  } finally {
    await context.close();
  }
  return run;
}

async function runMobile(browser) {
  const session = await preparePage(browser, "mobile-390x844", { width: 390, height: 844 }, { mobile: true });
  const { context, page, run } = session;
  try {
    await verifyAudioUnlock(page, run, () => page.touchscreen.tap(195, 422));
    await captureZeroSequence(page, run, "mobile-390x844", MOBILE_STOPS);
    await verifyOrientationResize(page, run);
  } finally {
    await context.close();
  }
  return run;
}

async function runReducedMotion(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 590 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const run = {
    label: "reduced-motion-1200x590",
    viewport: { width: 1200, height: 590 },
    assertions: [],
    errors: [],
    failedAssets: [],
  };
  await page.addInitScript(audioAuditBootstrap, { rejectFirstWhooshUnlock: false });
  page.on("pageerror", (error) => run.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") run.errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) run.failedAssets.push(`${response.status()} ${response.url()}`);
  });

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction("window.__buildanta?.intro", null, { timeout: 60000 });
    await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
    await page.evaluate(() => { window.__bbPinTime = 300000; });
    await goLogical(page, 0.795);
    const dir = path.join(OUT, run.label);
    fs.mkdirSync(dir, { recursive: true });
    const shot = await capture(page, path.join(dir, "logical-0795.png"));
    const stats = imageStats(shot.image);
    run.stats = stats;
    const audit = await page.evaluate(() => window.__zeroStageAudioAudit.snapshot());
    check(run, "reduced motion creates and plays no ZeroMirror audio", audit.tracks.length === 0 &&
      audit.events.filter((event) => event.type === "play").length === 0, audit);
    check(run, "reduced-motion seam is not a blank frame", stats.deviation >= 3 && stats.range >= 30, stats);
  } finally {
    await context.close();
  }
  return run;
}

(async () => {
  const smoke = process.argv.includes("--smoke");
  const seamsOnly = process.argv.includes("--seams-only");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--use-angle=swiftshader"],
  });
  let desktop;
  let mobile = null;
  let reducedMotion = null;
  try {
    desktop = await runDesktop(browser, smoke, seamsOnly);
    if (!smoke && !seamsOnly) {
      mobile = await runMobile(browser);
      reducedMotion = await runReducedMotion(browser);
    }
  } finally {
    await browser.close();
  }

  const report = {
    url: URL,
    generatedAt: new Date().toISOString(),
    mode: seamsOnly ? "seams-only" : smoke ? "smoke" : "full",
    limits: {
      progressTolerance: PROGRESS_TOLERANCE,
      reverseDiffPercent: REVERSE_DIFF_LIMIT,
      seamDiffPercent: SEAM_DIFF_LIMIT,
    },
    desktop,
    mobile,
    reducedMotion,
  };
  const reportName = seamsOnly ? "report-seams-only.json" : smoke ? "report-smoke.json" : "report.json";
  const reportPath = path.join(OUT, reportName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const runs = [desktop, mobile, reducedMotion].filter(Boolean);
  const failures = runs.flatMap((run) => [
    ...run.errors.map((error) => ({ run: run.label, type: "runtime", error })),
    ...run.failedAssets.map((error) => ({ run: run.label, type: "asset", error })),
    ...run.assertions.filter((assertion) => !assertion.pass)
      .map((assertion) => ({ run: run.label, type: "assertion", ...assertion })),
  ]);
  const assertionCount = runs.reduce((total, run) => total + run.assertions.length, 0);
  const assertionFailures = failures.filter((failure) => failure.type === "assertion").length;
  console.log(JSON.stringify({
    result: failures.length ? "failed" : "passed",
    url: URL,
    report: reportPath,
    assertions: {
      passed: assertionCount - assertionFailures,
      failed: assertionFailures,
      total: assertionCount,
    },
    runtimeErrors: failures.filter((failure) => failure.type === "runtime").length,
    assetErrors: failures.filter((failure) => failure.type === "asset").length,
    captures: {
      desktopStates: desktop.states.length,
      bridgeOwnershipFrames: desktop.bridgeOwnership?.states?.length || 0,
      pointerFrames: desktop.pointer.reduce((total, entry) => total + entry.samples.length + 2, 0),
      fineSeamForward: desktop.fineSeams?.forward?.length || 0,
      fineSeamReverse: desktop.fineSeams?.reverse?.length || 0,
      mobileStates: mobile?.states?.length || 0,
    },
  }, null, 2));
  if (failures.length) {
    console.error("\nZero stage verification failures:");
    console.error(JSON.stringify(failures.map((failure) => ({
      run: failure.run,
      type: failure.type,
      ...(failure.name ? { name: failure.name } : {}),
      ...(failure.error ? { error: failure.error } : {}),
    })), null, 2));
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
