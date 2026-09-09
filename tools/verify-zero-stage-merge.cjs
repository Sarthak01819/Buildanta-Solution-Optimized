/* Focused visual regression for the ZeroMirror -> Buildanta fist-bump seam.
 *
 * The failure this protects against is not a generic frame-to-frame flash:
 * two separately rendered hand scenes can be individually deterministic and
 * still cross-fade as two green hands, two human hands, and a rectangular
 * full-frame plate.  This verifier therefore inspects the composited pixels
 * through the complete .95-1 adapter, including its ownership switches,
 * and every logical .001 from .788 through .802 in both directions.
 *
 * Usage:
 *   node tools/verify-zero-stage-merge.cjs
 *   node tools/verify-zero-stage-merge.cjs --image="path/to/evidence.png"
 */
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
const HANDOFF_ONLY = process.argv.includes("--handoff-only");
const OUT = path.join(__dirname, "..", "shots-zero-stage", HANDOFF_ONLY ? "merge-handoff" : "merge-regression");
const VIEWPORT = { width: 1535, height: 790 };
const LOGICAL_POINTS = HANDOFF_ONLY
  ? [0.788, 0.789, 0.795, 0.802]
  : Array.from({ length: 15 }, (_, index) => (788 + index) / 1000);
const BRIDGE_POINTS = HANDOFF_ONLY
  ? [0.95, 0.97, 0.979, 0.99, 0.9958, 0.9962, 1]
  : [...new Set([
  ...Array.from({ length: 26 }, (_, index) => (950 + index * 2) / 1000),
  0.977, 0.9775, 0.9785, 0.979, 0.9795,
  0.995, 0.9955, 0.9958, 0.9962, 0.9965, 0.997,
])].sort((a, b) => a - b);
const JOURNEY_POINTS = [
  ...BRIDGE_POINTS.map((value) => ({ kind: "zero", value })),
  ...LOGICAL_POINTS.slice(1).map((value) => ({ kind: "logical", value })),
];
const CELL = 4;
const REVERSE_DIFF_LIMIT = 0.75;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHsv(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 1e-6) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max ? delta / max : 0, value: max };
}

function isGreenHandPixel(red, green, blue) {
  const hsv = rgbToHsv(red, green, blue);
  const excess = green - (red + blue) * 0.5;
  return green >= 104 &&
    hsv.hue >= 72 && hsv.hue <= 164 &&
    hsv.saturation >= 0.17 &&
    excess >= 13 && green >= red * 1.075 && green >= blue * 1.045;
}

function isHumanHandPixel(red, green, blue) {
  const hsv = rgbToHsv(red, green, blue);
  const cb = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
  const cr = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
  return red >= 112 && green >= 78 && blue >= 52 &&
    red >= green * 1.025 && red - blue >= 10 &&
    hsv.hue <= 52 && hsv.saturation >= 0.055 && hsv.saturation <= 0.58 &&
    cb >= 76 && cb <= 128 && cr >= 132 && cr <= 177;
}

function makeCellMask(image, predicate, bounds) {
  const gridWidth = Math.ceil(image.w / CELL);
  const gridHeight = Math.ceil(image.h / CELL);
  const counts = new Uint16Array(gridWidth * gridHeight);
  const x0 = Math.floor(image.w * bounds.x0);
  const y0 = Math.floor(image.h * bounds.y0);
  const x1 = Math.ceil(image.w * bounds.x1);
  const y1 = Math.ceil(image.h * bounds.y1);
  for (let y = y0; y < y1; y += 1) {
    const row = y * image.w * image.bpp;
    const gy = Math.floor(y / CELL);
    for (let x = x0; x < x1; x += 1) {
      const offset = row + x * image.bpp;
      if (predicate(image.data[offset], image.data[offset + 1], image.data[offset + 2])) {
        counts[gy * gridWidth + Math.floor(x / CELL)] += 1;
      }
    }
  }

  const seed = new Uint8Array(counts.length);
  for (let gy = 0; gy < gridHeight; gy += 1) {
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const cellPixels = Math.min(CELL, image.w - gx * CELL) *
        Math.min(CELL, image.h - gy * CELL);
      const index = gy * gridWidth + gx;
      if (counts[index] >= Math.max(2, Math.ceil(cellPixels * 0.18))) seed[index] = 1;
    }
  }

  /* One-cell closing joins the translucent gaps inside a palm without
     merging hands that are separated by the large gap shown in the defect. */
  const dilated = new Uint8Array(seed.length);
  for (let gy = 0; gy < gridHeight; gy += 1) {
    for (let gx = 0; gx < gridWidth; gx += 1) {
      let live = false;
      for (let dy = -1; dy <= 1 && !live; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight &&
              seed[ny * gridWidth + nx]) {
            live = true;
            break;
          }
        }
      }
      if (live) dilated[gy * gridWidth + gx] = 1;
    }
  }
  return { mask: dilated, counts, gridWidth, gridHeight };
}

function connectedComponents(cellMask, image, kind) {
  const { mask, counts, gridWidth, gridHeight } = cellMask;
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    let stackLength = 0;
    stack[stackLength++] = seed;
    seen[seed] = 1;
    let cells = 0;
    let qualifyingPixels = 0;
    let minX = gridWidth;
    let minY = gridHeight;
    let maxX = 0;
    let maxY = 0;
    let weightedX = 0;
    let weightedY = 0;
    while (stackLength) {
      const index = stack[--stackLength];
      const x = index % gridWidth;
      const y = Math.floor(index / gridWidth);
      cells += 1;
      qualifyingPixels += counts[index];
      weightedX += x;
      weightedY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
          const neighbor = ny * gridWidth + nx;
          if (mask[neighbor] && !seen[neighbor]) {
            seen[neighbor] = 1;
            stack[stackLength++] = neighbor;
          }
        }
      }
    }
    const width = (maxX - minX + 1) * CELL / image.w;
    const height = (maxY - minY + 1) * CELL / image.h;
    const area = cells * CELL * CELL / (image.w * image.h);
    const rawArea = qualifyingPixels / (image.w * image.h);
    const occupancy = cells / ((maxX - minX + 1) * (maxY - minY + 1));
    const component = {
      kind,
      area: Number(area.toFixed(5)),
      rawArea: Number(rawArea.toFixed(5)),
      occupancy: Number(occupancy.toFixed(3)),
      x: Number(((weightedX / cells) * CELL / image.w).toFixed(3)),
      y: Number(((weightedY / cells) * CELL / image.h).toFixed(3)),
      bounds: {
        x0: Number((minX * CELL / image.w).toFixed(3)),
        y0: Number((minY * CELL / image.h).toFixed(3)),
        x1: Number((Math.min(image.w, (maxX + 1) * CELL) / image.w).toFixed(3)),
        y1: Number((Math.min(image.h, (maxY + 1) * CELL) / image.h).toFixed(3)),
      },
      width: Number(width.toFixed(3)),
      height: Number(height.toFixed(3)),
    };
    /* At this viewport a real hand contributes thousands of chroma-qualified
       pixels.  The stronger raw-area floor deliberately rejects isolated
       garden/tree colour patches and petals; those were the main source of
       false "hands" in the evidence frame. */
    /* These are intentionally foreground-sized floors. At 1535x790 the two
       hands in the reported defect occupy 2.22%/1.41% (green) and
       3.79%/3.05% (human) of all pixels. Garden/tree fragments measured at
       <=.71% green and <=2.01% skin-like pixels, so they stay out. */
    const rawAreaFloor = kind === "green" ? 0.0075 : 0.025;
    const common = rawArea >= rawAreaFloor && width >= 0.025 && height >= 0.03 &&
      occupancy >= 0.065 && !(width >= 0.40 && width / Math.max(height, 1e-4) >= 3.2);
    /* At the endpoint the foreground arm reaches the right/bottom edges.
       Skin-coloured meadow pixels can connect to its wrist and enlarge the
       bounding box beyond .60, even though one palm is clearly visible.
       Accept that extension only for a large lower-right, edge-anchored arm;
       ordinary garden components still need the original compact bounds. */
    const edgeAnchoredArm = component.bounds.x1 >= 0.995 &&
      component.x >= 0.68 && component.y >= 0.60 && rawArea >= 0.035;
    component.meaningful = kind === "green"
      ? common && component.y <= 0.73 && width <= 0.56 && height <= 0.58
      : common && component.y >= 0.20 && (width <= 0.60 || edgeAnchoredArm) && height <= 0.58;
    components.push(component);
  }
  return components
    .filter((component) => component.area >= 0.00005)
    .sort((a, b) => b.rawArea - a.rawArea);
}

function mergeTouchingGreenParts(components) {
  const remaining = components.map((component) => ({ ...component, parts: [component] }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let a = 0; a < remaining.length; a += 1) {
      for (let b = a + 1; b < remaining.length; b += 1) {
        const first = remaining[a];
        const second = remaining[b];
        const gapX = Math.max(0,
          Math.max(first.bounds.x0, second.bounds.x0) -
          Math.min(first.bounds.x1, second.bounds.x1));
        const gapY = Math.max(0,
          Math.max(first.bounds.y0, second.bounds.y0) -
          Math.min(first.bounds.y1, second.bounds.y1));
        if (gapX > 0.018 || gapY > 0.018) continue;
        const rawArea = first.rawArea + second.rawArea;
        remaining.splice(b, 1);
        remaining[a] = {
          kind: "green",
          area: Number((first.area + second.area).toFixed(5)),
          rawArea: Number(rawArea.toFixed(5)),
          occupancy: Number(Math.max(first.occupancy, second.occupancy).toFixed(3)),
          x: Number(((first.x * first.rawArea + second.x * second.rawArea) / rawArea).toFixed(3)),
          y: Number(((first.y * first.rawArea + second.y * second.rawArea) / rawArea).toFixed(3)),
          bounds: {
            x0: Math.min(first.bounds.x0, second.bounds.x0),
            y0: Math.min(first.bounds.y0, second.bounds.y0),
            x1: Math.max(first.bounds.x1, second.bounds.x1),
            y1: Math.max(first.bounds.y1, second.bounds.y1),
          },
          width: Number((Math.max(first.bounds.x1, second.bounds.x1) -
            Math.min(first.bounds.x0, second.bounds.x0)).toFixed(3)),
          height: Number((Math.max(first.bounds.y1, second.bounds.y1) -
            Math.min(first.bounds.y0, second.bounds.y0)).toFixed(3)),
          meaningful: true,
          parts: [...first.parts, ...second.parts],
        };
        changed = true;
        break outer;
      }
    }
  }
  return remaining;
}

function stripMean(image, vertical, coordinate, side, position) {
  const SPAN = 4;
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  for (let offset = 1; offset <= SPAN; offset += 1) {
    const x = vertical ? coordinate + side * offset : position;
    const y = vertical ? position : coordinate + side * offset;
    const index = (y * image.w + x) * image.bpp;
    red += image.data[index];
    green += image.data[index + 1];
    blue += image.data[index + 2];
    samples += 1;
  }
  return [red / samples, green / samples, blue / samples];
}

function scanStraightEdges(image, vertical) {
  const axisLength = vertical ? image.w : image.h;
  const sampleLength = vertical ? image.h : image.w;
  const candidates = [];
  /* Ignore browser/page perimeter lines. A leaked render plate produces an
     interior L-edge; viewport chrome and canvas borders do not qualify. */
  for (let coordinate = Math.floor(axisLength * 0.09);
    coordinate < Math.ceil(axisLength * 0.91); coordinate += 2) {
    let positive = 0;
    let negative = 0;
    let alignedMagnitude = 0;
    let sampleCount = 0;
    const signed = [];
    for (let position = Math.floor(sampleLength * 0.05);
      position < Math.ceil(sampleLength * 0.95); position += 3) {
      const before = stripMean(image, vertical, coordinate, -1, position);
      const after = stripMean(image, vertical, coordinate, 1, position);
      const beforeLum = 0.2126 * before[0] + 0.7152 * before[1] + 0.0722 * before[2];
      const afterLum = 0.2126 * after[0] + 0.7152 * after[1] + 0.0722 * after[2];
      const delta = afterLum - beforeLum;
      signed.push(delta);
      if (delta >= 4.5) positive += 1;
      if (delta <= -4.5) negative += 1;
      sampleCount += 1;
    }
    const sign = positive >= negative ? 1 : -1;
    for (const delta of signed) {
      if (delta * sign >= 4.5) alignedMagnitude += Math.abs(delta);
    }
    const aligned = Math.max(positive, negative);
    /* A rectangle boundary continues along one coordinate. Scattered high
       contrast on a pillar and a separate lake horizon is not an L-edge;
       require a sustained run instead of adding unrelated fragments. */
    let longestRun = 0;
    let runStart = 0;
    let lastGap = -2;
    for (let index = 0; index < signed.length; index += 1) {
      if (signed[index] * sign < 4.5) {
        if (lastGap >= runStart) runStart = lastGap + 1;
        lastGap = index;
      }
      longestRun = Math.max(longestRun, index - runStart + 1);
    }
    candidates.push({
      axis: vertical ? "vertical" : "horizontal",
      at: Number((coordinate / axisLength).toFixed(3)),
      coverage: Number((aligned / sampleCount).toFixed(3)),
      magnitude: Number((aligned ? alignedMagnitude / aligned : 0).toFixed(2)),
      score: Number((alignedMagnitude / sampleCount).toFixed(2)),
      continuousCoverage: Number((longestRun / sampleCount).toFixed(3)),
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 6);
}

function analyzeImage(image) {
  const green = connectedComponents(
    makeCellMask(image, isGreenHandPixel, { x0: 0, y0: 0, x1: 1, y1: 0.78 }),
    image,
    "green",
  );
  const human = connectedComponents(
    makeCellMask(image, isHumanHandPixel, { x0: 0, y0: 0.15, x1: 1, y1: 1 }),
    image,
    "human",
  );
  const greenHands = mergeTouchingGreenParts(green.filter((component) => component.meaningful));
  const humanHands = human.filter((component) => component.meaningful);
  const verticalEdges = scanStraightEdges(image, true);
  const horizontalEdges = scanStraightEdges(image, false);
  const isPlateEdge = (edge) => edge.coverage >= 0.34 && edge.score >= 2.2 &&
    edge.continuousCoverage >= (edge.axis === "vertical" ? 0.12 : 0.20);
  const verticalPlateEdge = verticalEdges.find(isPlateEdge);
  const horizontalPlateEdge = horizontalEdges.find(isPlateEdge);
  return {
    greenHands,
    humanHands,
    topGreenComponents: green.slice(0, 8),
    topHumanComponents: human.slice(0, 8),
    straightEdges: { vertical: verticalEdges, horizontal: horizontalEdges },
    rectangularPlate: Boolean(verticalPlateEdge && horizontalPlateEdge),
    plateEdges: { vertical: verticalPlateEdge || null, horizontal: horizontalPlateEdge || null },
  };
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

async function goLogical(page, progress) {
  const raw = await page.evaluate((target) => window.__buildanta.intro.rawForP(target), progress);
  await scrollRaw(page, raw);
}

async function goZero(page, progress) {
  const raw = await page.evaluate((target) => window.__buildanta.intro.rawForZeroStage(target), progress);
  await scrollRaw(page, raw);
}

async function analyzeEvidenceFile(file) {
  const absolute = path.resolve(file);
  const analysis = analyzeImage(decode(fs.readFileSync(absolute)));
  console.log(JSON.stringify({ image: absolute, analysis }, null, 2));
  return analysis;
}

function frameDifference(a, b) {
  let changed = 0;
  let delta = 0;
  for (let index = 0; index < a.data.length; index += a.bpp) {
    const red = Math.abs(a.data[index] - b.data[index]);
    const green = Math.abs(a.data[index + 1] - b.data[index + 1]);
    const blue = Math.abs(a.data[index + 2] - b.data[index + 2]);
    if (Math.max(red, green, blue) > 10) changed += 1;
    delta += (red + green + blue) / 3;
  }
  return {
    changed: Number((changed / (a.w * a.h) * 100).toFixed(3)),
    mean: Number((delta / (a.w * a.h)).toFixed(3)),
  };
}

async function inspectOwnership(page) {
  return page.evaluate(() => {
    const source = window.__zeroMirrorStageBridge;
    const destination = window.__buildanta.meetRoot;
    const visible = (object) => {
      for (let current = object; current; current = current.parent) {
        if (!current.visible) return false;
      }
      return Boolean(object);
    };
    const sourceVisible = (materialName) => {
      let found = false;
      if (source.state.opacity <= 0.002) return false;
      source.scene.traverse((object) => {
        const material = object.material;
        if (material?.name !== materialName || !visible(object)) return;
        const opacity = material.uniforms?.uOpacity?.value ?? material.opacity ?? 1;
        if (opacity > 0.001) found = true;
      });
      return found;
    };
    const owners = {
      green: {
        source: sourceVisible("ZeroStageGreenHandMaterial"),
        destination: visible(destination?.getObjectByName("Hand_Green")),
      },
      human: {
        source: sourceVisible("ZeroStageHumanHandMaterial"),
        destination: visible(destination?.getObjectByName("Hand_Human")),
      },
    };
    return {
      logicalProgress: window.__buildanta.intro.progress,
      progress: source.state.progress,
      bridgeProgress: source.state.bridgeProgress,
      opacity: source.state.opacity,
      owners,
    };
  });
}

async function verifyLive() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("[merge] Starting browser");
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const runtimeErrors = [];
  const requestFailures = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`${message.text()} @ ${message.location().url || "unknown"}`);
  });
  page.on("requestfailed", (request) => requestFailures.push({
    url: request.url(),
    resourceType: request.resourceType(),
    error: request.failure()?.errorText || "unknown",
  }));
  const samples = [];
  const forwardImages = new Map();
  try {
    console.log("[merge] Loading page");
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("[merge] Waiting for hand assets");
    await page.waitForFunction(
      "window.__buildanta?.intro && window.__zeroMirrorStageBridge?.state.ready",
      null,
      { timeout: 60000 },
    );
    await page.addStyleTag({ content: "#cursor,#cursor-ring{display:none!important;opacity:0!important}" });
    await page.evaluate(() => { window.__bbPinTime = 300000; });
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (const direction of ["forward", "reverse"]) {
      console.log(`[merge] Capturing ${direction} bridge and exit`);
      if (direction === "reverse") await goLogical(page, 0.81);
      const points = direction === "forward" ? JOURNEY_POINTS : [...JOURNEY_POINTS].reverse();
      let previous = null;
      for (const point of points) {
      if (point.kind === "zero") await goZero(page, point.value);
      else await goLogical(page, point.value);
      const buffer = await page.screenshot();
      const key = `${point.kind}-${String(Math.round(point.value * 10000)).padStart(5, "0")}`;
      const filename = path.join(
        OUT,
        `${key}-${direction}.png`,
      );
      fs.writeFileSync(filename, buffer);
      const image = decode(buffer);
      const analysis = analyzeImage(image);
      const state = await inspectOwnership(page);
      if (direction === "forward") forwardImages.set(key, image);
      samples.push({
        direction,
        kind: point.kind,
        progress: point.value,
        state,
        capture: filename,
        reverseDifference: direction === "reverse" ? frameDifference(forwardImages.get(key), image) : null,
        adjacentDifference: previous ? frameDifference(previous, image) : null,
        greenHands: analysis.greenHands,
        humanHands: analysis.humanHands,
        rectangularPlate: analysis.rectangularPlate,
        plateEdges: analysis.plateEdges,
        straightEdges: analysis.straightEdges,
      });
      previous = image;
      }
    }
  } catch (error) {
    if (runtimeErrors.length) console.error("[merge] Runtime errors:", runtimeErrors);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  writeReport(samples, runtimeErrors, forwardImages, requestFailures);
}

function writeReport(samples, runtimeErrors, forwardImages, requestFailures = [], reanalyzedFrom = null) {

  /* Exactly one is intentional. "At most one" would let a blank/hidden
     canvas pass, which is just the same broken hand-off with both copies
     removed. The visitor must see one continuous green and one continuous
     human participant throughout the join. */
  const invalidGreen = samples.filter((sample) => sample.greenHands.length !== 1);
  /* The source companion fades before the destination enters. During that
     deliberate travel the colour segmentation can find zero palms; after
     the completed adapter it must find exactly one. Real render ownership
     is checked independently so background colours cannot conceal overlap. */
  const invalidHuman = samples.filter((sample) => (
    sample.kind === "zero" && sample.progress < 0.996
      ? sample.humanHands.length > 1
      : sample.humanHands.length !== 1
  ));
  const invalidOwners = samples.filter((sample) => {
    const { green, human } = sample.state.owners;
    return Number(green.source) + Number(green.destination) !== 1 ||
      Number(human.source) + Number(human.destination) > 1 ||
      (sample.progress >= 0.98 && sample.kind === "zero" && !human.destination);
  });
  const invalidReverse = samples.filter((sample) => sample.reverseDifference?.changed > REVERSE_DIFF_LIMIT);
  const handoffPairs = [
    ["zero-09958", "zero-09962"],
    ["zero-10000", "logical-07890"],
  ].map(([before, after]) => ({
    before,
    after,
    delta: frameDifference(forwardImages.get(before), forwardImages.get(after)),
  }));
  const discontinuousHandoffs = handoffPairs.filter(({ delta }) => delta.changed > 35 || delta.mean > 12);
  const rectangularPlate = samples.filter((sample) => sample.rectangularPlate);
  const assertions = [
    {
      name: "complete bridge and exit contain exactly one visible green hand in both directions",
      pass: invalidGreen.length === 0,
      failures: invalidGreen.map((sample) => ({
        progress: sample.progress,
        kind: sample.kind,
        direction: sample.direction,
        components: sample.greenHands,
      })),
    },
    {
      name: "complete bridge and exit contain no duplicate human hand and exactly one after entry",
      pass: invalidHuman.length === 0,
      failures: invalidHuman.map((sample) => ({
        progress: sample.progress,
        kind: sample.kind,
        direction: sample.direction,
        components: sample.humanHands,
      })),
    },
    {
      name: "complete bridge and exit contain no rectangular full-frame overlay edge",
      pass: rectangularPlate.length === 0,
      failures: rectangularPlate.map((sample) => ({
        progress: sample.progress,
        kind: sample.kind,
        direction: sample.direction,
        edges: sample.plateEdges,
      })),
    },
    {
      name: "source and destination hand rendering have exclusive ownership throughout the bridge",
      pass: invalidOwners.length === 0,
      failures: invalidOwners.map(({ kind, progress, direction, state }) => ({ kind, progress, direction, state })),
    },
    {
      name: "bridge and exit frames are deterministic when traversed in reverse",
      pass: invalidReverse.length === 0,
      failures: invalidReverse.map(({ kind, progress, reverseDifference }) => ({ kind, progress, ...reverseDifference })),
    },
    {
      name: "green ownership switch and scene exit preserve frame continuity",
      pass: discontinuousHandoffs.length === 0,
      failures: discontinuousHandoffs,
    },
  ];
  const report = {
    result: runtimeErrors.length || assertions.some((assertion) => !assertion.pass)
      ? "failed"
      : "passed",
    url: URL,
    generatedAt: new Date().toISOString(),
    reanalyzedFrom,
    viewport: VIEWPORT,
    range: [LOGICAL_POINTS[0], LOGICAL_POINTS.at(-1)],
    bridgeRange: [BRIDGE_POINTS[0], BRIDGE_POINTS.at(-1)],
    bridgePoints: BRIDGE_POINTS,
    handoffPairs,
    midpointCapture: path.join(OUT, "logical-07950-forward.png"),
    runtimeErrors,
    requestFailures,
    assertions,
    samples,
  };
  const reportPath = path.join(OUT, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    result: report.result,
    report: reportPath,
    midpointCapture: report.midpointCapture,
    failures: assertions.filter((assertion) => !assertion.pass).map((assertion) => ({
      name: assertion.name,
      samples: assertion.failures.length,
    })),
    runtimeErrors,
  }, null, 2));
  if (report.result !== "passed") process.exitCode = 1;
}

function analyzeExisting() {
  const reportPath = path.join(OUT, "report.json");
  const previous = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const forwardImages = new Map();
  const samples = previous.samples.map((sample) => {
    const image = decode(fs.readFileSync(sample.capture));
    if (sample.direction === "forward") {
      const key = `${sample.kind}-${String(Math.round(sample.progress * 10000)).padStart(5, "0")}`;
      forwardImages.set(key, image);
    }
    const analysis = analyzeImage(image);
    return {
      ...sample,
      greenHands: analysis.greenHands,
      humanHands: analysis.humanHands,
      rectangularPlate: analysis.rectangularPlate,
      plateEdges: analysis.plateEdges,
      straightEdges: analysis.straightEdges,
    };
  });
  /* Reanalysis checks the same captured pixels. Preserve runtime failures
     and original visibility telemetry; it cannot establish a fresh run. */
  writeReport(samples, previous.runtimeErrors, forwardImages,
    previous.requestFailures || [], previous.generatedAt || fs.statSync(reportPath).mtime.toISOString());
}

const imageArgument = process.argv.find((argument) => argument.startsWith("--image="));
if (process.argv.includes("--analyze-existing")) {
  try { analyzeExisting(); } catch (error) { console.error(error); process.exitCode = 1; }
} else if (imageArgument) {
  analyzeEvidenceFile(imageArgument.slice("--image=".length)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  verifyLive().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
