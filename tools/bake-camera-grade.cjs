/**
 * Bakes the camera's colour grade INTO the PNG, so the page needs no runtime
 * `filter` on it at all.
 *
 * Why: the machine is scaled to 13x during the handover. A CSS `filter` on a
 * scaled element forces Chrome to re-rasterise it at the new size, and at 13x
 * that is a 7500x14000 raster through a five-stage filter chain. Measured on a
 * reverse scrub: removing the filter took the act from 10 frames over 33ms
 * down to 3. Same failure mode as vault rule M2 — it just gets triggered by
 * SCALE rather than by animating the filter itself.
 *
 * Reproduces the exact CSS chain that was on the element:
 *   sepia(.72) hue-rotate(214deg) saturate(1.5) brightness(.82) contrast(1.06)
 * using the matrices from the Filter Effects spec, applied in that order.
 *
 * Usage: node tools/bake-camera-grade.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { decode } = require('./png.cjs');

const SRC = path.join(__dirname, '..', 'art-source', 'market-cinema-camera-front.png');
const OUT = path.join(__dirname, '..', 'public', 'market-cinema-camera-graded.png');

const mul = (a, b) => {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
};
const sepia = (A) => {
  const s = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  const i = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return s.map((v, k) => i[k] * (1 - A) + v * A);
};
const saturate = (S) => [
  0.213 + 0.787 * S, 0.715 - 0.715 * S, 0.072 - 0.072 * S,
  0.213 - 0.213 * S, 0.715 + 0.285 * S, 0.072 - 0.072 * S,
  0.213 - 0.213 * S, 0.715 - 0.715 * S, 0.072 + 0.928 * S,
];
const hueRotate = (deg) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
};

/* filters compose left-to-right, so the LAST one applied is the outermost */
const M = mul(saturate(1.5), mul(hueRotate(214), sepia(0.72)));
const BRIGHT = 0.82, CONTRAST = 1.06;

const img = decode(fs.readFileSync(SRC));
if (img.bpp !== 4) throw new Error('expected RGBA');
const px = Buffer.from(img.data);
for (let i = 0; i < px.length; i += 4) {
  if (px[i + 3] === 0) continue;                    // leave fully transparent pixels alone
  const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
  let nr = M[0] * r + M[1] * g + M[2] * b;
  let ng = M[3] * r + M[4] * g + M[5] * b;
  let nb = M[6] * r + M[7] * g + M[8] * b;
  const f = (v) => {
    v *= BRIGHT;                                     // brightness
    v = v * CONTRAST + (0.5 - 0.5 * CONTRAST);       // contrast
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  px[i] = f(nr); px[i + 1] = f(ng); px[i + 2] = f(nb);
}

/* encode: 8-bit RGBA, no interlace, filter type 0 on every scanline */
const stride = img.w * 4;
const raw = Buffer.alloc((stride + 1) * img.h);
for (let y = 0; y < img.h; y++) {
  raw[y * (stride + 1)] = 0;
  px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
fs.writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
const before = fs.statSync(SRC).size, after = fs.statSync(OUT).size;
console.log(`baked ${img.w}x${img.h}  ${(before/1024).toFixed(0)}KB -> ${(after/1024).toFixed(0)}KB`);
