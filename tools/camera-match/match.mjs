/**
 * AGENT 2 — MATCHER. One iteration of the loop:
 *   node tools/camera-match/match.mjs <model.glb>
 *
 * Renders an orthographic front elevation (785x1511, bbox framed onto the
 * reference content box), measures it against the reference, parses the GLB
 * for topology and node gates, and emits a defect list with signed errors.
 *
 * Exit 0 = all gates pass. Exit 1 = defects (list printed). Exit 2 = broken.
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const GLB = process.argv[2];
if (!GLB || !fs.existsSync(GLB)) { console.error("usage: match.mjs <model.glb>"); process.exit(2); }

/* ── the authority: reference measurements from the project brief ── */
const REF = {
  png: path.join(REPO, "public/market-cinema-camera-graded.png"),
  W: 785, H: 1511,
  features: {
    lens:  { x: 341.5, y: 467,   r: null,  tol: 4 },
    reel_a:{ x: 157.5, y: 147.5, r: 135.5, tol: 6, rTol: 5 },
    reel_b:{ x: 517,   y: 147.5, r: 135.5, tol: 6, rTol: 5 },
    knob_l:{ x: 72.2,  y: 474.5, r: 33.4,  tol: 8 },
    knob_r:{ x: 596.6, y: 474.5, r: 33.4,  tol: 8 },
    crank: { x: 600.5, y: 637.6, r: null,  tol: 8 },
  },
  iouGate: 0.95, triMin: 15000, triMax: 25000, quadGate: 0.80,
  nodes: ["camera_body", "reel_a", "reel_b", "lens", "crank", "head", "tripod"],
};

/* ── GLB parsing: JSON chunk + accessors, no dependencies ── */
function parseGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  let binStart = 20 + jsonLen;
  let bin = null;
  if (binStart < buf.length) {
    const chunkLen = buf.readUInt32LE(binStart);
    bin = buf.slice(binStart + 8, binStart + 8 + chunkLen);
  }
  return { json, bin };
}
function accessorData({ json, bin }, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
               5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const T = CT[a.componentType];
  return new T(bin.buffer, bin.byteOffset + off, a.count * N);
}

function topology(glb) {
  const { json } = glb;
  let tris = 0, quadTris = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const idx = prim.indices !== undefined ? accessorData(glb, prim.indices) : null;
      const pos = accessorData(glb, prim.attributes.POSITION);
      const nTri = idx ? idx.length / 3 : pos.length / 9;
      tris += nTri;
      if (!idx) continue;
      /* quad estimate: tris pairing across a shared edge with near-coplanar
         normals were quads before triangulation */
      const edge = new Map(); const tri = [];
      for (let t = 0; t < nTri; t++) {
        const a = idx[t*3], b = idx[t*3+1], c = idx[t*3+2];
        tri.push([a, b, c]);
        for (const [u, v] of [[a,b],[b,c],[c,a]]) {
          const k = u < v ? u + "_" + v : v + "_" + u;
          if (!edge.has(k)) edge.set(k, []);
          edge.get(k).push(t);
        }
      }
      const nrm = (t) => {
        const [a, b, c] = tri[t];
        const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2];
        const ux=pos[b*3]-ax,uy=pos[b*3+1]-ay,uz=pos[b*3+2]-az;
        const vx=pos[c*3]-ax,vy=pos[c*3+1]-ay,vz=pos[c*3+2]-az;
        const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
        const l=Math.hypot(x,y,z)||1; return [x/l,y/l,z/l];
      };
      const paired = new Set();
      for (const ts of edge.values()) {
        if (ts.length !== 2) continue;
        const [p, r] = ts;
        if (paired.has(p) || paired.has(r)) continue;
        const n1 = nrm(p), n2 = nrm(r);
        if (n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2] > 0.985) {
          paired.add(p); paired.add(r); quadTris += 2;
        }
      }
    }
  }
  return { tris, quadRatio: tris ? quadTris / tris : 0 };
}

function nodeGate(glb) {
  const { json } = glb;
  const names = new Set((json.nodes || []).map((n) => n.name));
  const missing = REF.nodes.filter((n) => !names.has(n));
  /* origin-on-axis: the named node's mesh centroid, in local space, should sit
     near the node origin in the plane perpendicular to its spin axis. We test
     distance of local centroid from origin vs part radius (advisory). */
  const report = {};
  for (const name of ["reel_a", "reel_b", "crank"]) {
    const node = (json.nodes || []).find((n) => n.name === name);
    if (!node || node.mesh === undefined) { report[name] = "no mesh"; continue; }
    const prim = json.meshes[node.mesh].primitives[0];
    const pos = accessorData(glb, prim.attributes.POSITION);
    let cx = 0, cy = 0, cz = 0; const n = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i+1]; cz += pos[i+2]; }
    cx /= n; cy /= n; cz /= n;
    let r = 0;
    for (let i = 0; i < pos.length; i += 3)
      r = Math.max(r, Math.hypot(pos[i]-cx, pos[i+1]-cy, pos[i+2]-cz));
    const d = Math.hypot(cx, cy, cz);
    report[name] = { centroidDist: +d.toFixed(4), partRadius: +r.toFixed(4),
      onAxis: d < r * 0.15 };
  }
  return { missing, axes: report };
}

/* ── PNG alpha + luminance helpers (tools/png.cjs is CJS; decode inline) ── */
import zlib from "node:zlib";
function decodePng(file) {
  const b = fs.readFileSync(file);
  let i = 8, w = 0, h = 0, bitDepth = 8, colorType = 6; const idat = [];
  while (i < b.length) {
    const len = b.readUInt32BE(i); const type = b.slice(i + 4, i + 8).toString();
    if (type === "IHDR") { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12);
      bitDepth = b[i + 16]; colorType = b[i + 17]; }
    if (type === "IDAT") idat.push(b.slice(i + 8, i + 8 + len));
    i += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("8-bit only");
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error("RGB/RGBA only"); })();
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch; const out = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, up = prev[x];
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const c = x >= ch ? prev[x - ch] : 0;
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      cur[x] = v & 255;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, ch, data: out };
}
const alphaAt = (img, x, y) => img.ch === 4 ? img.data[(y * img.w + x) * 4 + 3] : 255;

function blobInWindow(img, x0, y0, x1, y1, thresh = 32) {
  let sx = 0, sy = 0, n = 0;
  for (let y = Math.max(0, y0 | 0); y < Math.min(img.h, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(img.w, x1 | 0); x++)
      if (alphaAt(img, x, y) > thresh) { sx += x; sy += y; n++; }
  if (!n) return null;
  return { x: sx / n, y: sy / n, area: n, r: Math.sqrt(n / Math.PI) };
}
function darkDisc(img, x0, y0, x1, y1) {
  // shaded pass: the lens is the darkest disc in its window
  let sx = 0, sy = 0, n = 0;
  const lum = (x, y) => { const i = (y * img.w + x) * img.ch;
    return (img.data[i] + img.data[i+1] + img.data[i+2]) / 3; };
  let min = 255;
  for (let y = y0|0; y < y1; y += 2) for (let x = x0|0; x < x1; x += 2)
    if (alphaAt(img, x, y) > 32) min = Math.min(min, lum(x, y));
  const cut = min + 26;
  for (let y = y0|0; y < y1; y++) for (let x = x0|0; x < x1; x++)
    if (alphaAt(img, x, y) > 32 && lum(x, y) < cut) { sx += x; sy += y; n++; }
  if (!n) return null;
  return { x: sx / n, y: sy / n, r: Math.sqrt(n / Math.PI) };
}

/* ── run ── */
const OUT = path.join(__dirname, ".iter");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5391;

console.log("── AGENT 2 · one iteration ──");
const glb = parseGlb(GLB);
const topo = topology(glb);
const nodes = nodeGate(glb);

// serve the repo (rig needs /node_modules/three) + the model
try { execSync(`lsof -ti:${PORT} -sTCP:LISTEN | xargs kill 2>/dev/null`); } catch {}
fs.copyFileSync(GLB, path.join(OUT, "model.glb"));
const srv = spawn("python3", ["-m", "http.server", String(PORT), "--directory", REPO],
  { stdio: "ignore", detached: true });
await new Promise((r) => setTimeout(r, 1500));

const { chromium } = await import(
  "file:///Users/buildanta/claude code/buildanta-showcase/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ headless: true });
async function renderPass(pass) {
  const page = await (await browser.newContext({
    viewport: { width: REF.W, height: REF.H } })).newPage();
  const url = `http://127.0.0.1:${PORT}/tools/camera-match/rig.html` +
    `?glb=/tools/camera-match/.iter/model.glb&pass=${pass}`;
  await page.goto(url, { timeout: 60000 });
  await page.waitForFunction("window.__rigReady === true || window.__rigError",
    null, { timeout: 60000 });
  const err = await page.evaluate("window.__rigError || null");
  if (err) throw new Error("rig: " + err);
  const file = path.join(OUT, pass + ".png");
  await page.screenshot({ path: file, omitBackground: true });
  await page.context().close();
  return file;
}
const alphaPng = await renderPass("alpha");
const shadedPng = await renderPass("shaded");
await browser.close();
try { process.kill(-srv.pid); } catch {}

const ref = decodePng(REF.png);
const got = decodePng(alphaPng);
const shaded = decodePng(shadedPng);

// silhouette IoU
let inter = 0, uni = 0;
for (let y = 0; y < REF.H; y++) for (let x = 0; x < REF.W; x++) {
  const a = alphaAt(ref, x, y) > 32, b = alphaAt(got, x, y) > 32;
  if (a && b) inter++; if (a || b) uni++;
}
const iou = uni ? inter / uni : 0;

/* ── DIFFERENTIAL feature measurement ──
   The selftest proved a window-centroid detector is BIASED: on the reference
   itself every feature missed its anchor by 13-69px, because the window
   catches body alpha along with the feature. Gating a candidate against the
   brief's anchors with a biased detector would reject a perfect model.
   So: run the IDENTICAL detector on reference and candidate and gate on the
   DIFFERENCE — systematic bias cancels, and the question answered becomes the
   real one: does the candidate put this feature where the reference does? */
const F = REF.features;
const windows = {
  reel_a: (img) => blobInWindow(img, F.reel_a.x - 160, 0, F.reel_a.x + 160, 300),
  reel_b: (img) => blobInWindow(img, F.reel_b.x - 160, 0, F.reel_b.x + 160, 300),
  knob_l: (img) => blobInWindow(img, 0, F.knob_l.y - 60, F.knob_l.x + 45, F.knob_l.y + 60),
  knob_r: (img) => blobInWindow(img, F.knob_r.x - 45, F.knob_r.y - 60, REF.W, F.knob_r.y + 60),
  crank:  (img) => blobInWindow(img, F.crank.x - 40, F.crank.y - 90, REF.W, F.crank.y + 90),
  lens:   (img) => darkDisc(img, F.lens.x - 170, F.lens.y - 170, F.lens.x + 170, F.lens.y + 170),
};
const meas = {}, refMeas = {};
for (const [k, fn] of Object.entries(windows)) {
  refMeas[k] = fn(k === "lens" ? ref : ref);
  meas[k] = fn(k === "lens" ? shaded : got);
}

/* ── gates ── */
const defects = [];
const gate = (ok, label, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(22)} ${detail}`);
  if (!ok) defects.push(`${label}: ${detail}`);
};
gate(iou >= REF.iouGate, "silhouette IoU", `${iou.toFixed(3)} (gate >= ${REF.iouGate})`);
for (const [k, f] of Object.entries(F)) {
  const m = meas[k], r0 = refMeas[k];
  if (!r0) { gate(false, k, "detector found nothing on the REFERENCE — harness fault, not model"); continue; }
  if (!m) { gate(false, k, "feature NOT FOUND in window"); continue; }
  const dx = m.x - r0.x, dy = m.y - r0.y, d = Math.hypot(dx, dy);
  gate(d <= f.tol, `${k} centre`,
    `off by ${d.toFixed(1)}px vs reference-measured (dx ${dx >= 0 ? "+" : ""}${dx.toFixed(1)}, dy ${dy >= 0 ? "+" : ""}${dy.toFixed(1)}; tol ${f.tol})`);
  if (f.r && f.rTol) {
    const dr = m.r - r0.r;
    gate(Math.abs(dr) <= f.rTol, `${k} radius`,
      `${m.r.toFixed(1)} vs ref-measured ${r0.r.toFixed(1)} (err ${dr >= 0 ? "+" : ""}${dr.toFixed(1)}; tol ${f.rTol})`);
  }
}
gate(topo.tris >= REF.triMin && topo.tris <= REF.triMax, "triangle count",
  `${topo.tris} (gate ${REF.triMin}-${REF.triMax})`);
gate(topo.quadRatio >= REF.quadGate, "quad ratio (est.)",
  `${(topo.quadRatio * 100).toFixed(0)}% (gate >= ${REF.quadGate * 100}%) — estimated from coplanar tri pairs; authoritative only in the DCC source`);
gate(nodes.missing.length === 0, "named nodes",
  nodes.missing.length ? "MISSING: " + nodes.missing.join(", ") : "all 7 present");
for (const [n, ax] of Object.entries(nodes.axes)) {
  if (typeof ax === "string") { gate(false, `${n} origin`, ax); continue; }
  gate(ax.onAxis, `${n} origin on axis`,
    `centroid ${ax.centroidDist} from origin, part radius ${ax.partRadius}`);
}

fs.writeFileSync(path.join(OUT, "report.json"),
  JSON.stringify({ iou, meas, refMeas, topo, nodes, defects }, null, 2));
console.log(defects.length
  ? `\n  ${defects.length} defect(s) -> hand back to Agent 1 (.iter/report.json)`
  : "\n  ALL GATES PASS");
process.exit(defects.length ? 1 : 0);
