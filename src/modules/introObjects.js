/**
 * PROPS — 3D DEPTH, DOM LOOK
 *
 * Har prop ka ek asli 3D point corridor mein hai. Har frame us point ko
 * camera se project karke DOM element wahan rakh dete hain, aur doori se
 * scale + opacity nikalte hain. Nateeja: props sach mein paas aate hain,
 * bade hote hain aur guzar jaate hain.
 *
 * Kyun DOM, jab depth 3D se aa rahi hai: production props transparent
 * rendered cutouts hain, aur purana 20-material CSS catalogue fallback ke
 * liye ab bhi `styles/objects.css` mein hai. Three.js mein dono ko dobara
 * banana extra meshes/shaders aur doosra material pipeline maangta.
 * Projection se depth ka poora faayda milta hai aur DOM child par image
 * quality + CSS lighting control dono bachte hain.
 *
 * DO TRANSFORM CHANNEL, pehle ki tarah:
 *   .obj      → projection (position + perspective scale)
 *   .obj > i  → idle drift, apne phase par
 * Ek hi element par dono karne se ek doosre ka transform mit jaata hai.
 */

/**
 * Corridor ke cross-section mein props kahan baithte hain.
 * x/y percent hain (0–100), jise HALF_W = 11 aur HALF_H = 7 ke zariye
 * -11…11 aur 7…-7 world units par map karte hain. Ye live corridor aur
 * camera frustum ke andar measured safe cross-section hai.
 *
 *   r     → DOM size, vmin (perspective scale iske upar lagta hai)
 *   zPush → station se kitna AAGE (camera -z ki taraf jaati hai, isliye
 *           prop ka z = stationZ - zPush hota hai). Bada zPush = prop
 *           station ke baad tak zinda rehta hai.
 *
 * Range 12–22 jaan-boojhkar hai. Ek act ki khidki mein camera stationZ+16
 * se stationZ-16 tak chalti hai, to prop ki doori (zPush + 16) se
 * (zPush - 16) tak jaati hai. 12–22 mein har prop ka poora arc — fog se
 * nikalna, paas aana, guzar jaana — usi act ke andar poora ho jaata hai.
 * Pehla slot jaan-boojhkar 22 use karta hai; is measured upper bound par
 * bhi prop act ke andar apna arc poora karta hai.
 */
const LAYOUT = [
  { x: 5, y: 34, r: 9.0, zPush: 22 },
  { x: 95, y: 24, r: 6.0, zPush: 15 },
  { x: 78, y: 53, r: 11.0, zPush: 20 },
  { x: 22, y: 63, r: 5.0, zPush: 12 },
  { x: 51, y: 79, r: 4.0, zPush: 18 },
];

/* Cross-section ki chaudai. Perspective ki wajah se paas aate hue har prop
   screen ke CENTRE ki taraf khisakta hai — aur headline wahi baithti hai.
   Isliye upar wale do props sabse bahar (x 5 / 95) hain: wo kinaare se
   guzarte hain, headline ko cross nahi karte. Naapa hua: pehle x 14/86 par
   dono duck ho rahe the (opacity 0.26 par gir jaate the). */
/* Corridor 40×26 ka hai. Props ko uske andar rakhna hai par frustum ke andar
   bhi — distance 22 par visible area ~43×24 hota hai, isliye ±11 / ±7 par
   props kinaare ke paas rehte hain aur headline se door. */
const HALF_W = 11;
const HALF_H = 7;
const REF_DIST = 26;     // is doori par scale = 1
const MAX_SCALE = 2.4;   // isse aage prop headline dhak leta hai

/* Fog ke saath match karti hui fade — planes bhi isi range mein aate-jaate
   hain, isliye props unse alag nahi lagte. */
const FAR_IN = 70, FAR_FULL = 46;    // door se aate hue
const NEAR_OUT = 5, NEAR_FULL = 11;  // paas se guzarte hue

/** har material ka mizaaj — kitna tairta hai (amp), kitna tilt (spin°) */
const MOOD = {
  /* Image props — all 36 stay registered so per-act swaps remain cheap. */
  /* 01 · Your idea */
  "idea-paper-ball": { amp: 0.90, spin: 0.38 },
  "idea-paper-plane": { amp: 0.95, spin: 0.55 },
  "idea-pencil": { amp: 0.72, spin: 0.68 },
  "idea-sticky-note": { amp: 0.92, spin: 0.44 },
  "idea-notebook-corner": { amp: 0.88, spin: 0.40 },
  "idea-glass-marble": { amp: 0.55, spin: 0.22 },
  "idea-brass-compass": { amp: 0.40, spin: 0.20 },
  "idea-light-spark": { amp: 1.02, spin: 0.16 },
  "idea-coffee-cup": { amp: 0.32, spin: 0.16 },
  /* 02 · We code */
  "code-keycap-brace": { amp: 0.42, spin: 0.20 },
  "code-keycap-semicolon": { amp: 0.40, spin: 0.18 },
  "code-keycap-slash": { amp: 0.42, spin: 0.22 },
  "code-cursor-bar": { amp: 0.76, spin: 0.30 },
  "code-silicon-chip": { amp: 0.32, spin: 0.16 },
  "code-cable-connector": { amp: 0.55, spin: 0.65 },
  "code-terminal-panel": { amp: 0.62, spin: 0.24 },
  "code-git-branch": { amp: 0.67, spin: 0.38 },
  "code-glass-card-stack": { amp: 0.70, spin: 0.32 },
  /* 03 · We market */
  "market-bar-chart": { amp: 0.45, spin: 0.24 },
  "market-line-graph": { amp: 0.58, spin: 0.32 },
  "market-pie-segment": { amp: 0.45, spin: 0.28 },
  "market-avatar-card": { amp: 0.82, spin: 0.40 },
  "market-heart-reaction": { amp: 1.00, spin: 0.50 },
  "market-speech-bubble": { amp: 0.96, spin: 0.46 },
  "market-price-tag": { amp: 0.88, spin: 0.55 },
  "market-smartphone-chart": { amp: 0.48, spin: 0.20 },
  "market-shopping-bag": { amp: 0.70, spin: 0.36 },
  /* 04 · We consult */
  "consult-clipboard": { amp: 0.45, spin: 0.22 },
  "consult-fountain-pen": { amp: 0.55, spin: 0.67 },
  "consult-spectacles": { amp: 0.46, spin: 0.62 },
  "consult-folded-document": { amp: 0.82, spin: 0.42 },
  "consult-chess-knight": { amp: 0.30, spin: 0.18 },
  "consult-brass-compass": { amp: 0.38, spin: 0.20 },
  "consult-river-stones": { amp: 0.28, spin: 0.14 },
  "consult-coffee-cup": { amp: 0.32, spin: 0.16 },
  "consult-magnifying-glass": { amp: 0.45, spin: 0.52 },

  /* Existing CSS-material catalogue retained as a fallback. */
  /* 01 · Your idea */
  "luminous-pearl": { amp: 0.80, spin: 0.25 },
  "frosted-amber-orb": { amp: 0.65, spin: 0.40 },
  "warm-soap-film": { amp: 1.00, spin: 0.70 },
  "ember-glass-pebble": { amp: 0.55, spin: 0.80 },
  "caustic-vapour-halo": { amp: 1.15, spin: 0.30 },
  /* 02 · We code */
  "seam-glass-cube": { amp: 0.55, spin: 0.45 },
  "frosted-glass-slab": { amp: 0.45, spin: 0.35 },
  "electric-pearl-bead": { amp: 0.85, spin: 0.20 },
  "blue-caustic-prism": { amp: 0.70, spin: 0.90 },
  "seam-vapour-cell": { amp: 1.10, spin: 0.40 },
  /* 03 · We market */
  "polished-gold-ring": { amp: 0.50, spin: 0.50 },
  "orbit-pearl": { amp: 1.05, spin: 0.25 },
  "copper-soap-film": { amp: 0.90, spin: 0.75 },
  "gilded-dust-mote": { amp: 1.20, spin: 0.15 },
  "caustic-orbit-node": { amp: 0.75, spin: 0.35 },
  /* 04 · We consult */
  "clear-glass-ring": { amp: 0.55, spin: 0.45 },
  "backlit-glass-sail": { amp: 0.60, spin: 0.65 },
  "stone-podium-pebble": { amp: 0.35, spin: 0.30 },
  "forest-vapour-drop": { amp: 1.10, spin: 0.35 },
  "brushed-brass-disc": { amp: 0.50, spin: 0.55 },
};
const FALLBACK_MOOD = { amp: 1.0, spin: 0 };

const smooth = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/**
 * `objs` do shakal mein aa sakta hai:
 *   { kind, count }        — ek hi material
 *   [{ kind, count }, …]   — mila-jula (ek hero + kuch halke)
 */
function kindList(objs, max) {
  const spec = Array.isArray(objs) ? objs : objs ? [objs] : [];
  const out = [];
  for (const s of spec) {
    for (let i = 0; i < (s.count ?? 0) && out.length < max; i++) out.push(s.kind);
  }
  return out;
}

/**
 * Ek act ke props banao.
 *
 * @param host  jis .step ke andar layer jayegi
 * @param cls   layer ki class
 * @param spec  { kind, count } ya [{ kind, count }, …]
 * @param opts  { drift, space3d: { stationZ } }
 */
export function buildObjects(host, cls, spec, opts = {}) {
  const kinds = kindList(spec, LAYOUT.length);
  if (!host || !kinds.length) return null;

  const drift = opts.drift ?? 14;
  const stationZ = opts.space3d?.stationZ ?? 0;

  const layer = document.createElement("div");
  layer.className = cls;
  layer.setAttribute("aria-hidden", "true");

  const items = kinds.map((kind, i) => {
    const p = LAYOUT[i];
    const mood = MOOD[kind] || FALLBACK_MOOD;
    const el = document.createElement("span");
    el.className = `obj obj--${kind}`;
    el.style.setProperty("--r", `${p.r}vmin`);
    el.appendChild(document.createElement("i"));
    layer.appendChild(el);

    return {
      el,
      inner: el.firstChild,
      // corridor mein iska asli point
      wx: (p.x / 100 - 0.5) * 2 * HALF_W,
      wy: -(p.y / 100 - 0.5) * 2 * HALF_H,
      wz: stationZ - p.zPush,
      amp: drift * mood.amp,
      spin: mood.spin,
      // Har prop ka apna phase aur raftaar — warna paanchon ek saath ek hi
      // taraf jhoolte hain aur turant fake lagta hai.
      sx: 0.19 + i * 0.041,
      sy: 0.14 + i * 0.033,
      px: i * 1.7,
      py: i * 2.3,
      shown: false,
    };
  });

  host.appendChild(layer);
  return { layer, els: [...layer.children], items, host };
}

/**
 * Har frame: project karo, rakho, scale karo.
 *
 * Headline ke upar aane par prop ki opacity gira dete hain (`duck`). Ise
 * poori tarah rokna 3D mein mumkin nahi — camera chalti hai to koi bhi
 * point kabhi text ke saamne aa sakta hai. Isliye takkar rokne ki jagah
 * usse **naram** kar dete hain: prop peeche se guzarta hua lagta hai aur
 * text padha jaata rehta hai.
 */
export function projectObjects(groups, corridor, time) {
  // Hidden acts inherit visibility:hidden/opacity:0 from their host. Their
  // projections are absolute functions of the current camera and clock, so
  // resume directly on the first visible frame; no hidden layout reads or
  // per-prop DOM writes are necessary while the iris/finale owns the screen.
  const hidden = (g) => g?.host && (
    g.host.style.visibility === "hidden" || g.host.style.opacity === "0"
  );
  if (!groups.some((g) => g && !hidden(g))) return;
  /* Projection viewport ke coordinates deta hai, par props `.step__objs` ke
     andar baithte hain — jo `.intro__inner` ke padding se shifted hai (naapa:
     1280px par 54px daayein). Isliye layer ka origin ghata dena zaroori hai,
     warna saare props padding ke barabar khisak jaate hain.

     Ek hi rect kaafi hai: chaaron layers bilkul ek hi jagah par hain. */
  const first = groups.find((g) => g && g.layer);
  if (!first) return;
  const org = first.layer.getBoundingClientRect();
  const viewportW = document.documentElement.clientWidth;
  /* World-space composition desktop ke liye ±11 tak jaati hai. Narrow
     portrait viewport mein wahi projection dono side screen se bahar bhej
     deti hai, isliye sirf screen-space x spread ko centre ki taraf compress
     karo. Depth, scale, y aur z arc bilkul waise hi rehte hain. */
  const xCompression = Math.min(1, Math.max(0.34, viewportW / 1100));

  for (const g of groups) {
    if (!g || hidden(g)) continue;

    /* Duck test ke liye ASLI text ka rect chahiye, `.step__text` ka nahi —
       wo `left:0; right:0` hai, to uska box poori chaudai le leta hai (naapa:
       54→1211 of 1280) aur upar wale hisse ka har prop ducked ho jaata tha. */
    let box = null;
    const host = g.host;
    if (host && host.style.visibility !== "hidden") {
      const t = host.querySelector(".step__t");
      const s = host.querySelector(".step__s");
      const rs = [t, s].filter(Boolean).map((e) => e.getBoundingClientRect());
      if (rs.length) {
        box = {
          left: Math.min(...rs.map((r) => r.left)),
          right: Math.max(...rs.map((r) => r.right)),
          top: Math.min(...rs.map((r) => r.top)),
          bottom: Math.max(...rs.map((r) => r.bottom)),
        };
      }
    }

    for (const o of g.items) {
      const pr = corridor.project(o.wx, o.wy, o.wz);
      if (!pr) {
        if (o.shown) { o.el.style.opacity = "0"; o.shown = false; }
        continue;
      }

      const near = smooth((pr.dist - NEAR_OUT) / (NEAR_FULL - NEAR_OUT));
      const far = smooth((FAR_IN - pr.dist) / (FAR_IN - FAR_FULL));
      let a = near * far;

      if (a <= 0.002) {
        if (o.shown) { o.el.style.opacity = "0"; o.shown = false; }
        continue;
      }

      const scale = Math.min(MAX_SCALE, REF_DIST / pr.dist);
      const screenX = viewportW * 0.5 + (pr.x - viewportW * 0.5) * xCompression;

      // headline ke saamne aaya to daba do (viewport coords mein, ghatane se pehle)
      if (box) {
        const half = (o.el.offsetWidth * scale) / 2;
        const hit =
          screenX + half > box.left && screenX - half < box.right &&
          pr.y + half > box.top && pr.y - half < box.bottom;
        if (hit) a *= 0.26;
      }

      const lx = screenX - org.left;
      const ly = pr.y - org.top;
      o.el.style.transform =
        `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      o.el.style.opacity = a.toFixed(3);
      o.shown = true;

      // idle drift — scale ke andar, taaki paas aane par bhi wahi mizaaj rahe
      const dx = Math.sin(time * o.sx + o.px) * o.amp;
      const dy = Math.cos(time * o.sy + o.py) * o.amp * 0.8;
      const rot = o.spin ? Math.sin(time * 0.11 + o.px) * o.spin : 0;
      o.inner.style.transform =
        `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg)`;
    }
  }
}
