/**
 * Intro ka background — animated contour field (topographic lines).
 *
 * Kyun ye: consulting/analytical kaam mein contour aur isoline charts
 * ki bhasha pehle se hai. Ye geometric hai par organic bhi — paper par
 * dheere-dheere badalta hua data-map jaisa lagta hai. Koi sci-fi nahi.
 *
 * Technique: ek 3D value-noise field ko grid par sample karo, phir
 * marching squares se kuch threshold levels ke contours nikaalo.
 * Time teesra axis hai, isliye lines morph karti hain — slide nahi.
 *
 * 2D canvas jaan-boojhkar: hairlines chahiye, aur inka count itna kam
 * hai ki WebGL ka setup cost faayde se zyada hota.
 */

/* ── marching squares lookup ──
   corner bits: a=TL(8) b=TR(4) c=BR(2) d=BL(1)
   edge ids:    0=top 1=right 2=bottom 3=left */
const TABLE = [
  [], [[3, 2]], [[2, 1]], [[3, 1]],
  [[0, 1]], [[0, 3], [2, 1]], [[0, 2]], [[3, 0]],
  [[3, 0]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]],
  [[3, 1]], [[2, 1]], [[3, 2]], [],
];

function hash(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);

  const c000 = hash(xi, yi, zi),     c100 = hash(xi + 1, yi, zi);
  const c010 = hash(xi, yi + 1, zi), c110 = hash(xi + 1, yi + 1, zi);
  const c001 = hash(xi, yi, zi + 1), c101 = hash(xi + 1, yi, zi + 1);
  const c011 = hash(xi, yi + 1, zi + 1), c111 = hash(xi + 1, yi + 1, zi + 1);

  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** "#16150f" ya "rgb(22,21,15)" → "22, 21, 15" */
export function toRGB(css, fallback = "22, 21, 15") {
  if (!css) return fallback;
  const s = css.trim();
  if (s.startsWith("#")) {
    const hex = s.length === 4
      ? s.slice(1).split("").map((c) => c + c).join("")
      : s.slice(1, 7);
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return fallback;
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  const m = s.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : fallback;
}

export function createIntroBackground(canvas, opts = {}) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let ink = opts.ink ?? "22, 21, 15";
  let brass = opts.brass ?? "138, 110, 59";
  let mode = opts.mode ?? "contour";
  let drops = null;
  let lastT = 0;

  // 13 levels: kinaare halke, beech ke gehre — depth ka ehsaas.
  // Paas-paas rakhe hain taaki contours ghane dikhein, jaise asli isoline map.
  const LEVELS = [
    0.26, 0.31, 0.35, 0.39, 0.43, 0.46, 0.50,
    0.54, 0.57, 0.61, 0.65, 0.69, 0.74,
  ];

  let dpr = 1, w = 0, h = 0;
  let cols = 0, rows = 0, cw = 0, ch = 0;
  let field = null;
  let lastW = -1, lastH = -1;

  function resize() {
    w = canvas.clientWidth || innerWidth;
    h = canvas.clientHeight || innerHeight;
    lastW = w; lastH = h;
    if (w <= 0 || h <= 0) { field = null; return; }   // abhi layout nahi hua
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ~22px cells: itne mein lines hairline rehti hain aur cost kam
    cols = Math.max(12, Math.round(w / 22)) + 1;
    rows = Math.max(10, Math.round(h / 22)) + 1;
    cw = w / (cols - 1);
    ch = h / (rows - 1);
    field = new Float32Array(cols * rows);
  }

  function sampleField(t) {
    // do octaves kaafi hain — teesra sirf noise badhata hai, shakal nahi
    const f1 = 1.35, f2 = 3.1;
    const aspect = cols / rows;
    for (let y = 0; y < rows; y++) {
      const ny = y / (rows - 1);
      for (let x = 0; x < cols; x++) {
        const nx = (x / (cols - 1)) * aspect;
        const v =
          noise3(nx * f1, ny * f1, t) * 0.66 +
          noise3(nx * f2 + 11.3, ny * f2 + 4.7, t * 1.35) * 0.34;
        field[y * cols + x] = v;
      }
    }
  }

  function drawLevel(level, alpha, colour) {
    ctx.beginPath();
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const i = y * cols + x;
        const a = field[i], b = field[i + 1];
        const c = field[i + cols + 1], d = field[i + cols];

        let idx = 0;
        if (a > level) idx |= 8;
        if (b > level) idx |= 4;
        if (c > level) idx |= 2;
        if (d > level) idx |= 1;
        if (idx === 0 || idx === 15) continue;

        const px = x * cw, py = y * ch;
        // har edge par exact crossing point — isse contour smooth aati hai
        const e = [
          [px + cw * ((level - a) / (b - a)), py],
          [px + cw, py + ch * ((level - b) / (c - b))],
          [px + cw * ((level - d) / (c - d)), py + ch],
          [px, py + ch * ((level - a) / (d - a))],
        ];
        for (const [s, t2] of TABLE[idx]) {
          ctx.moveTo(e[s][0], e[s][1]);
          ctx.lineTo(e[t2][0], e[t2][1]);
        }
      }
    }
    ctx.strokeStyle = `rgba(${colour}, ${alpha})`;
    ctx.stroke();
  }

  /* ── 01 · contour: organic isolines ── */
  function drawContour(elapsed) {
    const t = reduced ? 4.2 : elapsed * 0.055;
    sampleField(t);
    const mid0 = (LEVELS.length - 1) / 2;
    LEVELS.forEach((lv, i) => {
      const mid = 1 - Math.abs(i - mid0) / mid0;
      // har chauthi line brass — map par index contour jaisa lagta hai
      drawLevel(lv, 0.09 + mid * 0.19, i % 4 === 2 ? brass : ink);
    });
  }

  /* ── 02 · rain: girti hui code columns ── */
  function initRain() {
    const n = Math.max(10, Math.round(w / 34));
    drops = Array.from({ length: n }, (_, i) => ({
      x: Math.round((i + 0.5) * (w / n)) + 0.5,
      y: Math.random() * h,
      speed: 26 + Math.random() * 58,
      ticks: 4 + ((Math.random() * 5) | 0),
      a: 0.07 + Math.random() * 0.16,
      accent: Math.random() < 0.18,
    }));
  }
  function drawRain(dt) {
    if (!drops || drops.length !== Math.max(10, Math.round(w / 34))) initRain();
    ctx.lineWidth = 1;
    for (const d of drops) {
      if (!reduced) d.y += d.speed * dt;
      if (d.y - d.ticks * 13 > h) { d.y = -Math.random() * 220; d.accent = Math.random() < 0.18; }
      const col = d.accent ? brass : ink;
      for (let k = 0; k < d.ticks; k++) {
        const yy = d.y - k * 13;
        if (yy < -12 || yy > h + 12) continue;
        ctx.strokeStyle = `rgba(${col}, ${d.a * (1 - k / d.ticks)})`;
        ctx.beginPath(); ctx.moveTo(d.x, yy); ctx.lineTo(d.x, yy - 7); ctx.stroke();
      }
    }
  }

  /* ── 03 · grid: chart paper + neeche jaati scan line ── */
  function drawGrid(elapsed) {
    const step = 52;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${ink}, 0.085)`;
    ctx.beginPath();
    for (let x = step; x < w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();

    // har 4th line thodi gehri — asli chart paper jaisa
    ctx.strokeStyle = `rgba(${ink}, 0.16)`;
    ctx.beginPath();
    for (let x = step * 4; x < w; x += step * 4) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = step * 4; y < h; y += step * 4) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();

    const sy = reduced ? h * 0.5 : (((elapsed * 0.13) % 1) * (h + 160)) - 80;
    const g = ctx.createLinearGradient(0, sy - 90, 0, sy);
    g.addColorStop(0, `rgba(${brass}, 0)`);
    g.addColorStop(1, `rgba(${brass}, 0.16)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, sy - 90, w, 90);
    ctx.strokeStyle = `rgba(${brass}, 0.5)`;
    ctx.beginPath(); ctx.moveTo(0, sy + 0.5); ctx.lineTo(w, sy + 0.5); ctx.stroke();
  }

  /* ── 04 · rings: shaant concentric waves ── */
  function drawRings(elapsed) {
    const cx = w * 0.68, cy = h * 0.48;
    const max = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
    const N = 9, period = 9;
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const p = reduced ? (i + 0.5) / N : (elapsed / period + i / N) % 1;
      const r = p * max;
      if (r < 4) continue;
      const a = (1 - p) * 0.3 * Math.min(1, p * 6);   // andar aur bahar dono par fade
      ctx.strokeStyle = i % 3 === 0 ? `rgba(${brass}, ${a})` : `rgba(${ink}, ${a})`;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function render(elapsed) {
    // self-heal: hidden pane / background tab mein page 0x0 par boot ho sakta hai
    // aur tab koi resize event bhi nahi aata. Har frame sasta check.
    const cwNow = canvas.clientWidth || innerWidth;
    const chNow = canvas.clientHeight || innerHeight;
    if (!field || cwNow !== lastW || chNow !== lastH) resize();
    if (!field) return;

    const dt = Math.min(0.05, Math.max(0, elapsed - lastT));
    lastT = elapsed;

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";

    if (mode === "rain") drawRain(dt);
    else if (mode === "grid") drawGrid(elapsed);
    else if (mode === "rings") drawRings(elapsed);
    else drawContour(elapsed);
  }

  resize();
  return {
    render, resize, reduced,
    setMode(m) { if (m !== mode) { mode = m; drops = null; } },
    setColors(inkCss, brassCss) { ink = toRGB(inkCss, ink); brass = toRGB(brassCss, brass); },
  };
}
