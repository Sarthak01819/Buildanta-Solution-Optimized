/* Measurements shared by the bill-transition suite and the shoot tool
 * (D-076 r2): the grade of the fists inside the portrait medallion, and the
 * reference's ember predicate. Pure functions over a tools/png.cjs decode.
 *
 *   portalTone(img, region)  region = { ellipse: { cx, cy, rx, ry } } in px
 *                            or { box: { x0, y0, x1, y1 } }
 *     -> { lit: { n, mean: [r,g,b], hex }, shadow: {...}, area }
 *        lit    = pixels with lum > LIT_MIN (the palm / fist bodies)
 *        shadow = pixels with SHADOW_MIN < lum <= LIT_MIN (wrist, creases)
 *        Everything darker is the leather (lum ~57) or the note's far side.
 *   emberSamples(img)        count of orange-dot sample pixels at a 2-px stride
 *                            (R > 190, 90 < G < 190, B < 90, R - G > 40) — the
 *                            predicate the reference's F5 scores 96 on.
 *   ellipseFromNdc(bounds, width, height)
 *                            the scene's portalBounds (NDC centre + radii) to px
 *
 * The reference numbers, measured the same way on the mirror's F1
 * (f-07053.png, judge's hand box 740..1160 x 220..900): lit #a39e84,
 * shadow #747565; the brief's targets #a0977a / #797a6b. */
const LIT_MIN = 135;
const SHADOW_MIN = 95;
const REFERENCE = Object.freeze({
  lit: "#a0977a", shadow: "#797a6b",
  litTolerance: 10, shadowTolerance: 12,
  /* the judge's hand box on the 1919x988 mirror capture */
  handBox: Object.freeze({ x0: 740, y0: 220, x1: 1160, y1: 900 }),
});

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const fromHex = (value) => [1, 3, 5].map((i) => parseInt(String(value).slice(i, i + 2), 16));

function ellipseFromNdc(bounds, width, height) {
  return {
    cx: (bounds.cx + 1) / 2 * width,
    cy: (1 - bounds.cy) / 2 * height,
    rx: bounds.rx / 2 * width,
    ry: bounds.ry / 2 * height,
  };
}

function portalTone(img, region, { shrink = 0.92 } = {}) {
  const { w, h, bpp, data } = img;
  let x0 = 0, y0 = 0, x1 = w, y1 = h;
  let inside = () => true;
  if (region.ellipse) {
    const { cx, cy } = region.ellipse;
    const rx = region.ellipse.rx * shrink, ry = region.ellipse.ry * shrink;
    x0 = Math.max(0, Math.floor(cx - rx)); x1 = Math.min(w, Math.ceil(cx + rx));
    y0 = Math.max(0, Math.floor(cy - ry)); y1 = Math.min(h, Math.ceil(cy + ry));
    inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  } else if (region.box) {
    ({ x0, y0, x1, y1 } = region.box);
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
  }
  const lit = { n: 0, sum: [0, 0, 0] };
  const shadow = { n: 0, sum: [0, 0, 0] };
  let area = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!inside(x, y)) continue;
      area += 1;
      const i = (y * w + x) * bpp;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = lum(r, g, b);
      const bucket = l > LIT_MIN ? lit : l > SHADOW_MIN ? shadow : null;
      if (!bucket) continue;
      bucket.n += 1;
      bucket.sum[0] += r; bucket.sum[1] += g; bucket.sum[2] += b;
    }
  }
  const finish = ({ n, sum }) => {
    const mean = n ? sum.map((v) => v / n) : null;
    return { n, mean, hex: mean ? hex(mean) : null };
  };
  return { lit: finish(lit), shadow: finish(shadow), area };
}

/* per-channel distance of a measured mean from a target hex */
function channelDelta(mean, target) {
  const t = fromHex(target);
  return mean ? mean.map((v, i) => Math.round(v - t[i])) : null;
}

function emberSamples(img, stride = 2) {
  const { w, h, bpp, data } = img;
  let n = 0;
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = (y * w + x) * bpp;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 190 && g > 90 && g < 190 && b < 90 && r - g > 40) n += 1;
    }
  }
  return n;
}

module.exports = { portalTone, emberSamples, ellipseFromNdc, channelDelta, fromHex, hex, LIT_MIN, SHADOW_MIN, REFERENCE };
