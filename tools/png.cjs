/* Minimal PNG reader for verification: 8-bit RGB/RGBA, non-interlaced —
   which is exactly what Playwright's screenshots are. Exists so a claim like
   "the plate under the lamp is the brightest one" can be a measurement of the
   composited page rather than an opinion about it. */
const zlib = require('zlib');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const tag = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9];
      if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error(`unsupported PNG ${depth}/${type}`);
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (tag === 'IDAT') idat.push(data);
    else if (tag === 'IEND') break;
    off += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/** mean perceptual luminance (0..255) over a rectangle */
function meanLum(img, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(img.w, Math.round(x1)); y1 = Math.min(img.h, Math.round(y1));
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * img.w * img.bpp;
    for (let x = x0; x < x1; x++) {
      const i = row + x * img.bpp;
      sum += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      n++;
    }
  }
  return n ? sum / n : 0;
}

module.exports = { decode, meanLum };
