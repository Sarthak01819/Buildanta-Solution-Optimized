/**
 * Stamps PNGs as sRGB — losslessly.
 *
 * Why: 13 of the site's 30 image assets carry NO colour profile. An untagged
 * image does not tell the device what its numbers mean, so every device gets
 * to guess: this Mac assumes sRGB and shows what we intended, another machine
 * may assume its own display space and render the same file duller or shifted.
 * That is the likeliest reason Yash sees the site "dulling" elsewhere.
 *
 * How: inserts a 1-byte `sRGB` chunk (plus the `gAMA`/`cHRM` values the PNG
 * spec says should accompany it for readers that predate sRGB) directly into
 * the file, before IDAT. It does NOT re-encode — every pixel byte is copied
 * through untouched, so there is no possibility of a quality change. Running
 * it twice is safe; already-tagged files are skipped.
 *
 * Usage: node tools/tag-srgb.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', 'public');
const DRY = process.argv.includes('--dry');

const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};

/* sRGB, rendering intent 0 (perceptual) */
const SRGB = chunk('sRGB', Buffer.from([0]));
/* gamma 1/2.2 * 100000, as the spec prescribes alongside sRGB */
const gama = Buffer.alloc(4); gama.writeUInt32BE(45455);
const GAMA = chunk('gAMA', gama);
/* the sRGB primaries, in the spec's 100000x fixed point */
const chrmVals = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
const chrm = Buffer.alloc(32);
chrmVals.forEach((v, i) => chrm.writeUInt32BE(v, i * 4));
const CHRM = chunk('cHRM', chrm);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.png$/i.test(e.name)) out.push(f);
  }
  return out;
};

let tagged = 0, skipped = 0;
for (const file of walk(ROOT)) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) { skipped++; continue; }

  /* find where the header ends and whether it is already described */
  let off = 8, idatAt = -1, has = false;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'sRGB' || type === 'iCCP') has = true;
    if (type === 'IDAT') { idatAt = off; break; }
    off += 12 + len;
  }
  if (has || idatAt < 0) { skipped++; continue; }

  const out = Buffer.concat([buf.subarray(0, idatAt), SRGB, GAMA, CHRM, buf.subarray(idatAt)]);
  /* the pixel payload must be byte-identical — this only inserts headers */
  if (!out.subarray(out.length - buf.subarray(idatAt).length).equals(buf.subarray(idatAt)))
    throw new Error('refusing to write: pixel data changed in ' + file);

  if (!DRY) fs.writeFileSync(file, out);
  tagged++;
  console.log(`  ${DRY ? 'would tag' : 'tagged'}  ${path.relative(ROOT, file)}  (+${out.length - buf.length} bytes)`);
}
console.log(`\n${tagged} PNG${tagged === 1 ? '' : 's'} ${DRY ? 'would be ' : ''}tagged sRGB, ${skipped} already described or not PNG`);
