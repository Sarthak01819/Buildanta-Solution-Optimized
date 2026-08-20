/**
 * THE MARKET CAMERA IN 3D — Agents 3 & 4 of the rebuild brief (19 Aug).
 *
 * Replaces the graded PNG + six CSS overlay spans with the procedural GLB
 * (tools/camera-match/build_camera.py).
 *
 * ── THE DROP-IN CONTRACT, SECOND FORM (19 Aug, 21:22) ──
 * The canvas no longer lives inside .market-pusher being CSS-transformed —
 * that architecture pixelated the push: a transform-scaled layer is
 * rasterised ONCE and stretched, so scale(13) blew a ~950px raster across
 * a 2880px screen (Yash's screenshot). The canvas now covers the whole act
 * and the FRUSTUM moves instead: intro.js composes the same affine the CSS
 * chain used to apply (entry travel, lens-centering push, 13x scale about
 * the 43.5%/31% pivot) into a target FRAME RECT in viewport px, and
 * setViewOffset maps the 785x1511 model frame onto exactly that rect.
 * Optical zoom, native resolution at every scale — sharp at 1x and at 13x.
 *
 * .market-pusher still exists as an EMPTY LAYOUT BOX: its untransformed
 * rect (width min(40vw,70vh), centred, aspect 785:1511) IS the frame rect
 * at rest, so the handoff contract at x=.684 still holds by construction.
 * The recoil wobble (was CSS rotateY/rotateX under perspective) is now a
 * model-space rotation about the lens, which is what it always depicted.
 *
 * Perspective, not ortho: D=5500mm with a matched fov differs from the PNG
 * frame by <1% at yaw 0 but lets the TRAVEL-AND-TURN read as a machine
 * swinging round.
 *
 * ── MATERIALS (Yash, 21:22: "make the camera look more real") ──
 * A RoomEnvironment PMREM gives the metals something to reflect — flat
 * fill light on untextured PBR is what made it read as a toy. On top:
 * procedural grain/brushed-metal roughness+bump maps (seeded LCG, no
 * assets, deterministic), per-part materials, and a clearcoat lens.
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, AmbientLight, DirectionalLight,
  PointLight, HemisphereLight, Color, Vector3, SRGBColorSpace, ACESFilmicToneMapping,
  PMREMGenerator, CanvasTexture, MeshStandardMaterial, MeshBasicMaterial,
  Mesh, SphereGeometry, BackSide, DoubleSide, PCFSoftShadowMap,
  CatmullRomCurve3, BufferGeometry, BufferAttribute, ShaderMaterial, Raycaster, Vector2,
} from "three";
import { SERVICES } from "../modules/services.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { wantsAA } from "./msaa.js";

/* ⚠️ IMPORTED, not a public/ path (20 Aug 08:30). Cloudflare Pages serves
   /assets/* with `cache-control: immutable, max-age=31536000`, so a FIXED
   model filename is cached by the browser for a YEAR and never revalidated:
   every geometry rebuild shipped invisibly while the (hashed) JS updated
   around it — Yash saw the original plain box lit by the new rig for a full
   day. Importing through Vite fingerprints the file, so a changed model is
   a changed URL. NEVER move this back to public/. */
import MODEL from "../assets/market-camera.glb?url";
const FRAME = { left: -341.5, right: 443.5, top: 467, bottom: -1044 };
const FRAME_W = 785, FRAME_H = 1511;
const DIST = 5500;

/* Deterministic procedural texture: fine metal grain, optionally smeared
   horizontally into a brushed finish. Grayscale — used as roughnessMap
   (green channel) and bumpMap at once. Seeded LCG so every visit renders
   the identical machine. */
/* THE ENVIRONMENT IS THE ACT'S OWN SKY, not a photo studio.
   RoomEnvironment ships emissive light PANELS; on a near-mirror dome they
   reflect as hard-edged bright squares — measured L229/L179 on our render
   where the reference's element never exceeds L57 and has no hotspot at
   all. A violet-sky / amber-ground gradient gives metal something to
   reflect, in the act's palette, with no rectangles in it. */
function gradEnv() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0.00, "#9b99a6");   // violet-cool sky
  lg.addColorStop(0.42, "#4a4658");
  lg.addColorStop(0.58, "#403a48");
  lg.addColorStop(1.00, "#9a8163");   // amber ground bounce
  g.fillStyle = lg;
  g.fillRect(0, 0, 256, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ⚠️ Delivered as a SCENE, not via fromEquirectangular. Measured 20 Aug:
   pmrem.fromEquirectangular() on a CanvasTexture produced a dead (black)
   environment — envMapIntensity 12 rendered identically to 3, which is how
   it was caught. fromScene() is the path that actually works (it is what
   RoomEnvironment uses), so the gradient is painted on the inside of a
   sphere and baked from there. */
function gradEnvScene() {
  const sc = new Scene();
  const sky = new Mesh(
    /* ⚠️ radius must sit inside fromScene's cube camera, whose far plane
       DEFAULTS TO 100 — a 500-unit sky rendered as pure black, which is why
       envMapIntensity 12 and an HDR multiplier both changed nothing. The
       scene here is in mm, but the environment scene is its own space. */
    new SphereGeometry(40, 32, 16),
    /* colour is an HDR MULTIPLIER, not a tint: a plain LDR gradient (max
       1.0) carries a fraction of RoomEnvironment's energy, whose emissive
       panels sit far above 1 — that is why swapping environments crushed
       the render even at envMapIntensity 12. */
    new MeshBasicMaterial({ map: gradEnv(), side: BackSide, color: new Color(9, 9, 9) })
  );
  sc.add(sky);
  return sc;
}

/* ── MICRO-DETAIL LIVES IN THE SHADER, NOT IN A TEXTURE ──────────────────
   Measured (20 Aug): the GLB's UV texel density spans 86x WITHIN one mesh
   and 11.5x across parts, and at rest the body packed 27.6 texels into
   each screen pixel — so the mip chain delivered 0.26% of the authored
   grain amplitude. Every canvas map we shipped was, in practice, invisible;
   that is why the machine kept reading as untextured CG no matter what the
   maps said.
   Object-space value noise fixes both problems at once: identical texel
   scale on every part regardless of UVs, and each octave fades itself out
   as soon as its wavelength approaches one pixel (fwidth), so it neither
   aliases at rest nor smears at 13x. Wavelengths/weights come from the
   reference's own measured spectrum (1.8 / 5.5 / 16 mm at 0.71 : 1.00 :
   0.68), and the 6:1 vertical stretch matches its striation anisotropy —
   ours ran horizontally, inverted 90 degrees. */
const GRAIN_COMMON = `
  varying vec3 vObjPos; uniform float uGrain;
  float h31(vec3 p){ p = fract(p*0.3183099 + vec3(0.11,0.27,0.43)); p *= 17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z); }
  float oct(vec3 p, float lam, float fw){
    float a = 1.0 - smoothstep(0.40, 1.00, fw/lam);
    return a <= 0.0 ? 0.0 : (vnoise(p/lam) - 0.5) * a; }`;

/* ⚠️ ANCHOR IS LOAD-BEARING: this must run after <roughnessmap_fragment>
   (roughnessFactor must exist) and before <lights_physical_fragment>
   (which copies diffuseColor away). <normal_fragment_maps> is the only
   include in three's meshphysical fragment that satisfies both — injecting
   at the obvious-looking <lights_fragment_begin> silently does nothing. */
const GRAIN_BODY = `
  float fw = max(length(fwidth(vObjPos)), 1e-4);         // mm per pixel
  vec3  pB = vec3(vObjPos.x, vObjPos.y/3.0, vObjPos.z);  // vertical striation
  /* Weighted toward the FINE octaves. The reference's spectrum was measured
     on a 1px/mm plate; taken literally its coarse bands (5.5 and 16mm) turn
     into zebra striping at our 1.74px/mm — cast metal, not weathered wood.
     The fine bands carry the "machined" read; the coarse ones only need to
     break up uniformity. */
  float g = oct(pB, 0.45, fw)*0.55
          + oct(pB, 1.80, fw)*0.50
          + oct(pB, 5.50, fw)*0.30
          + oct(vObjPos, 16.0, fw)*0.14;
  g *= uGrain * 1.05;
  roughnessFactor = clamp(roughnessFactor + g*0.20, 0.10, 0.90);
  diffuseColor.rgb *= (1.0 + g*0.12);
  /* Signed curvature per MILLIMETRE (so it is zoom-invariant): cavities go
     dark, chamfers get a polished lip. This is the reference's actual
     structure — its reel web sits at a third of its rim's luminance, a
     ratio no exposure change can produce. */
  float cv = ( dot(dFdx(normal), normalize(dFdx(-vViewPosition)))
             + dot(dFdy(normal), normalize(dFdy(-vViewPosition))) ) / fw;
  float cav  = smoothstep(0.0, -0.35, cv);
  float edge = smoothstep(0.0,  0.35, cv);
  diffuseColor.rgb *= mix(1.0, 0.34, cav);
  diffuseColor.rgb += vec3(0.052, 0.049, 0.066) * edge;
  roughnessFactor = clamp(roughnessFactor - edge*0.20 + cav*0.16, 0.08, 0.95);`;

/* Same SOURCE for every part, grain amount carried by a uniform: three keys
   its program cache on the source string, so one compile serves the whole
   machine. Baking the constant in would recompile per part and bring back
   the shader-compile stall. */
function attachSurface(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uGrain = { value: material.userData.grain ?? 1.0 };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vObjPos = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>" + GRAIN_COMMON)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>" + GRAIN_BODY);
  };
}

/* The reference is emphatically NOT uniformly grainy — measured high-pass
   energy runs 21.4 on a reel web, 14.8 on a body panel, 2.61 on a leg tube
   and 1.09 on the lens barrel: cast/blasted panels against turned stock. */
const GRAIN = { camera_body: 1.00, reel_a: 1.35, reel_b: 1.35,
                head: 0.45, crank: 0.45, lens: 0.12, tripod: 0.20 };

/* ═══ THE FILM RIBBON (brief, 20 Aug 14:03) ═══════════════════════════════
   One continuous curved surface carrying all nine plates, threaded between
   the reels and dipping below the body. Replaces the DOM strip, whose
   individually-tilted flat cards on a straight sprocket band could never
   read as film — the sprockets staying straight while the cards tilted was
   the tell. Reference (shader.se): the RAIL IS STATIC — the curve is built
   once and never animates; only the content slides along it (uPos).

   Model frame = the camera's: origin at lens centre, mm, X right, Y up,
   Z toward viewer. Parented to the RIG, so the film rides the machine
   through the drive-in and stays threaded through its reels. */
const RIBBON = {
  /* THE PATH — derived from a study of shader.se's own source (20 Aug), not
     guessed. Their reel is a CatmullRomCurve3, closed=false, curveType
     'chordal', and the study reproduced our measured screen centreline from
     it to within 0.5% of slope. Our route follows Yash's brief rather than
     copying theirs: theirs bulges nearest at MID-span, his wants the nearest
     pass at the END of the journey — "starts from the back & right side of
     the camera... near the end of the right side of the screen... then it
     comes in forward".
     Generated as a WIDENING SPIRAL about the machine's right side. The
     radius never drops below ~1210mm (about 4.7x the ribbon width): tighter
     than that and the band pinches and self-intersects at the turn, which is
     what the study's own first two attempts did before it rebuilt them. */
  POINTS: [
    /* ⚠️ MONOTONIC IN X — the path must never double back across the frame.
       The studied spiral swung far behind the machine, and its deep tail
       projected back INTO frame as a second, dimmer pass: the two sections
       met near the left edge with a dark sliver between them, which reads
       as a tear in the film. (Not a hole — a raycast hit the mesh there;
       that is how it was told apart.) One pass only, entering off-frame
       right and leaving off-frame left. */
    [ 3400,   690, -1600],   // collinear guard for the feed tangent
    [ 2600,   420,  -900],   // FEED — off-frame right, behind the machine
    [ 1900,   150,  -200],   // coming round and forward
    [ 1350,   -60,   380],   // crosses the lens plane
    [  700,  -230,   780],   // forward, right of centre
    [  100,  -330,   930],   // near pass — the hero plate
    /* THE LEVEL RUN (Yash, 22:37): "end on the left side in HORIZONTAL
       fashion." Y AND Z both fixed — under perspective a level line that
       changes depth still slopes on screen. */
    [ -800,  -345,   940],
    [-1900,  -345,   940],
    [-3200,  -345,   940],
    /* ⚠️ COLLINEAR GUARD. Catmull-Rom extrapolates its end tangent, and the
       last segment was hooking back — the hook projected into frame as a
       separate, brighter sliver of film with a dark break before it, which
       is the "tear" the audit saw near the left edge. A final point on the
       same straight line pins the tail flat. */
    [-4500,  -345,   940],   // TAKE-UP — off the left edge, dead straight
  ],
  WIDTH: 260,             // mm
  SEGS: 260,              // longer path than the bow — keep the near pass smooth
  PITCH_MM: 470,          // plate pitch along the arc
  PLATE_MM: 420,          // plate width along the arc
  /* Roll about the tangent, 0deg = square to the render camera, keyed on
     normalised arc length. Measured on shader.se: 0deg at its near pass,
     28-42deg at its visible ends — the ribbon rolls face-AWAY as it recedes.
     Ours runs deeper, so the tail goes further edge-on. */
  /* Rolls face-away in the deep tail, then squares up and STAYS square for
     the whole level run — a band that keeps twisting cannot read as
     horizontal no matter how level its path is. */
  /* ⚠️ KEEP THE ROLL SHALLOW. At 66deg the band, combined with the path's
     own turn, passed through GRAZING at two stations — the strip collapsed
     to a sub-pixel sliver there and read as a tear across the film (the
     mesh was still present: a raycast hit it, which is how it was told
     apart from a hole). 34deg is enough to sell film coming off a spool
     without ever presenting the band edge-on. */
  TWIST_KEYS: [[0, 34], [0.26, 26], [0.42, 16], [0.56, 6],
               [0.66, 0], [1, 0]],
};

function twistAt(t) {
  const k = RIBBON.TWIST_KEYS;
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const f = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return (k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f) * Math.PI / 180;
    }
  }
  return k[k.length - 1][1] * Math.PI / 180;
}

function buildRibbonGeometry() {
  /* ⚠️ CHORDAL, not uniform. shader.se uses chordal too, and on spacing this
     uneven the uniform variant overshoots — the band bulges past its own
     control points and folds at the turn. */
  const curve = new CatmullRomCurve3(
    RIBBON.POINTS.map(([x, y, z]) => new Vector3(x, y, z)), false, "chordal");
  const arcMM = curve.getLength();
  /* THE GATE is where a plate parks to be read: the point NEAREST the viewer,
     found by sampling — on an asymmetric path that is no longer the midpoint,
     and hard-coding 0.5 would park the plate half a curve away from the spot
     the eye is drawn to. */
  let gate = 0.5, bestZ = -1e9;
  const probe = new Vector3();
  for (let i = 0; i <= 400; i++) {
    curve.getPointAt(i / 400, probe);
    if (probe.z > bestZ) { bestZ = probe.z; gate = i / 400; }
  }
  const N = RIBBON.SEGS;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const uv = new Float32Array((N + 1) * 2 * 2);
  const idx = [];
  const side = new Vector3(), rolled = new Vector3(), P = new Vector3(), T = new Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    curve.getPointAt(t, P);            // arc-length parameterised: even plate pitch
    curve.getTangentAt(t, T);
    /* ⚠️ PARALLEL TRANSPORT, not world-up. Deriving the width axis from
       world-up flips it wherever the tangent turns vertical, and this path
       swings through nearly 200deg — the band would tear at the turn. Each
       step instead carries the PREVIOUS width axis forward, re-orthogonalised
       against the new tangent (a rotation-minimising frame), then takes its
       keyframed roll on top. */
    if (i === 0) {
      side.set(0, 1, 0).addScaledVector(T, -T.dot(new Vector3(0, 1, 0))).normalize();
    } else {
      side.addScaledVector(T, -side.dot(T)).normalize();
    }
    rolled.copy(side).applyAxisAngle(T, twistAt(t));
    const w = RIBBON.WIDTH / 2;
    pos.set([P.x - rolled.x * w, P.y - rolled.y * w, P.z - rolled.z * w,
             P.x + rolled.x * w, P.y + rolled.y * w, P.z + rolled.z * w], i * 6);
    uv.set([t, 0, t, 1], i * 4);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return { geo, arcMM, gate, curve };
}

/* All nine plates in ONE 3x3 atlas: the shader picks the cell, so a single
   draw call carries the whole reel and mipping is uniform. ART ONLY — the
   captions stay DOM (crisp, selectable, readable by assistive tech), the
   way the reference renders its titles as HTML above the canvas. */
function buildRibbonAtlas(renderer, onReady) {
  const CW = 1024, CH = 576;
  const c = document.createElement("canvas");
  c.width = CW * 3; c.height = CH * 3;
  const g = c.getContext("2d");
  g.fillStyle = "#0a0714"; g.fillRect(0, 0, c.width, c.height);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  let done = 0;
  SERVICES.forEach((svc, k) => {
    const img = new Image();
    img.onload = () => {
      const cx = (k % 3) * CW, cy = ((k / 3) | 0) * CH;
      const sc = Math.max(CW / img.width, CH / img.height);   // cover-fit
      g.save();
      g.beginPath(); g.rect(cx, cy, CW, CH); g.clip();
      g.drawImage(img, cx + (CW - img.width * sc) / 2, cy + (CH - img.height * sc) / 2,
                  img.width * sc, img.height * sc);
      g.restore();
      g.strokeStyle = "rgba(10,8,16,0.9)"; g.lineWidth = 10;
      g.strokeRect(cx + 5, cy + 5, CW - 10, CH - 10);
      tex.needsUpdate = true;
      if (++done === SERVICES.length) onReady?.();
    };
    img.onerror = () => { if (++done === SERVICES.length) onReady?.(); };
    img.src = "/assets/reel/" + svc.art;
  });
  return tex;
}

const RIBBON_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const RIBBON_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uAtlas;
  uniform float uPos;      // plate index at the apex (0..8)
  uniform float uAlpha;    // the act's --market-film-opacity envelope
  uniform float uArcMM;    // total arc length, mm
  uniform float uPitch;    // plate pitch as arc fraction
  uniform float uPlateW;   // plate width as arc fraction
  uniform float uGate;     // arc fraction of the reading position
  uniform float uWidth;    // ribbon width in mm, for the perforation SDF

  void main() {
    if (uAlpha < 0.004) discard;
    /* ⚠️ FILM COORDINATES, NOT RAIL COORDINATES (Yash, 23:45: "the black and
       white border is stuck in one place — I want it to flow with the reel
       content"). The perforations were fract(vUv.x * uArcMM / 46) — a
       function of position ON THE RAIL, and the rail is deliberately static,
       so the holes stayed nailed to the screen while the pictures slid past
       them. Everything printed on the stock — plates AND perforations — must
       ride the SAME film position, so rel is computed first here and the
       holes are cut in millimetres ALONG THE FILM.
       THE SLIDE IS RIGHT-TO-LEFT: uv.x 0 is the feed (deep, right), 1 is the
       take-up (left). Adding uPos walked a plate BACK toward the feed; negated,
       plates run feed -> take-up, the way film does. */
    float rel = uPos - (vUv.x - uGate) / uPitch;   // film position, in plates
    float filmMM = rel * uPitch * uArcMM;          // ... and in millimetres
    /* REAL PERFORATIONS (Yash, 21 Aug 00:00: "the border looks so
       cartoonish — make it look real"). Two things made it read as a
       cartoon: fat saturated amber rails down both edges, which the
       reference does not have at all (its film edge is plain black stock),
       and hard-cornered rectangles punched at 46mm. Film perforations are
       ROUNDED rectangles, small against the stock, with generous black
       between them. Measured as a signed distance in millimetres so the
       corner radius is real geometry, not a texture. */
    float cellMM = fract(filmMM / 62.0) * 62.0 - 31.0;      // mm along the film
    float bandC = (vUv.y < 0.5) ? 0.098 : 0.902;
    float acrossMM = (vUv.y - bandC) * uWidth;              // mm across the film
    vec2 q = abs(vec2(cellMM, acrossMM)) - vec2(13.0, 7.4) + vec2(2.4);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 2.4;
    bool hole = sd < 0.0;

    /* ⚠️ THE PERFORATIONS ARE LIT, NOT CUT (measured 20 Aug, Yash's
       reference). Discarding them punched through to the act's near-black
       room, so the sprocket row measured p50 5 against a page background of
       4 — invisible. In the reference the holes are the BRIGHTEST thing on
       the film (the lamp behind the gate), and that black-base/white-hole
       contrast is what makes a strip read as film at a glance. They still
       curve and twist, because they are still this surface. */
    vec3 col = vec3(0.021, 0.019, 0.029);           // film base — near-black stock
    float k = floor(rel + 0.5);
    float x = rel - k;                               // -.5..+.5 within a pitch
    float ph = 0.5 * (uPlateW / uPitch);
    if (k >= 0.0 && k <= 8.0 && abs(x) < ph && vUv.y > 0.17 && vUv.y < 0.83) {
      float vv = (vUv.y - 0.17) / 0.66;
      vec2 auv;
      /* the plate's own u flips with the travel direction, or every frame
         renders mirrored */
      auv.x = (mod(k, 3.0) + (0.5 - x / ph * 0.5)) / 3.0;
      auv.y = 1.0 - (floor(k / 3.0) + (1.0 - vv)) / 3.0;
      /* ⚠️ A CURVE, NOT A GAIN — the artwork has no midtones to amplify.
         MEASURED on the source jpgs: median code 6-8 with 67-77% of pixels
         below 16 (dark fractal art on black), against a reference built
         from bright screenshots. A linear gain big enough to lift that
         median blows the few highlights the art does have; a gamma lift
         raises the midtones and leaves the top alone. This is the honest
         ceiling for THIS art — the real fix is brighter plates (the
         replacement brief is already in docs/codex-reel-prompts-v2.md). */
      vec3 art = texture2D(uAtlas, auv).rgb;
      col = pow(max(art, vec3(0.0)), vec3(0.52)) * 1.06 + vec3(0.02);
    }
    /* ⚠️ NO AMBER RAILS. They were invented to "draw the curve", and they
       are the single loudest cartoon tell — the reference's stock is black
       to its edge. All that survives is a whisper of edge sheen, barely
       above the base, so the strip still separates from a black room. */
    float edge = smoothstep(0.030, 0.008, vUv.y) + smoothstep(0.970, 0.992, vUv.y);
    col = mix(col, vec3(0.075, 0.066, 0.088), clamp(edge, 0.0, 1.0));

    if (hole) {
      /* not flat white: the lamp behind the gate falls off across the
         opening, and the punched edge catches a little less light */
      float soft = smoothstep(0.0, -2.2, sd);
      col = mix(vec3(0.63, 0.635, 0.68), vec3(0.90, 0.905, 0.94), soft);
    }

    /* Falloff GENTLED: at x0.14 the wings measured p50 2-3 against a page
       background of 4 — the receding plates were literally darker than
       empty screen. The reference's whole strip stays readable; its ends
       merely recede. */
    float d = clamp(abs(vUv.x - uGate) / max(uGate, 1.0 - uGate), 0.0, 1.0);
    float fall = mix(1.20, 0.58, smoothstep(0.12, 0.95, d));
    col *= fall;

    /* GRAIN. The stock measured flat to +/-3 of 255 along the whole rail —
       real film is never that clean, and a dead-flat plate reads as a
       graphic rather than a photograph. Keyed to film millimetres so it
       travels WITH the film instead of crawling across the screen. */
    float gn = fract(sin(dot(vec2(filmMM, acrossMM), vec2(12.9898, 78.233))) * 43758.5453);
    col *= 0.955 + 0.09 * gn;

    /* ⚠️ THE PERFORATIONS ARE HOLES, NOT PAINT (Yash, 21 Aug 01:00: "there
       are no white boxes on the border in the reference — those squares are
       transparent"). He is right: film perforations are absences. They were
       lit because, cut against a near-black room, an empty hole simply
       vanished — but painting them is what made the border read as graphic
       design. They are DISCARDED now, so whatever lies behind the film shows
       through: the room, the machine's body, a tripod leg.
       The one thing that is NOT absent is the punched edge. A cut edge in
       real stock catches light, and that thin bright lip is what keeps a
       perforation legible against a dark background instead of disappearing
       into it — so the film reads as perforated even where nothing bright
       sits behind it. */
    float lip = smoothstep(1.7, 0.0, abs(sd));
    if (!hole) {
      float idx = floor(filmMM / 62.0);
      float jitter = 0.92 + 0.08 * fract(sin(idx * 12.9898) * 43758.5453);
      /* the lip keeps its brightness further into the dim end than the rest
         of the film does — measured at only 2.3x the room's luminance out
         there, which is the sole thing making a perforation legible where
         nothing bright sits behind it */
      col += vec3(0.135, 0.138, 0.152) * lip * clamp(fall, 0.74, 1.0) * jitter;
    }
    if (hole) discard;                 // the perforation is an absence
    gl_FragColor = vec4(col, uAlpha);
  }`;

export function mountMarketCamera(host, { reduced = false, onReady = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "market-camera3d";
  host.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: wantsAA(), powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  /* The room the metal reflects. Blurred (sigma .35) so reflections read as
     sheen and panel gradients, not as furniture from another site. */
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(gradEnvScene(), 0.02).texture;

  const cx = (FRAME.left + FRAME.right) / 2;    // +51
  const cy = (FRAME.top + FRAME.bottom) / 2;    // -288.5
  const camera = new PerspectiveCamera(
    2 * Math.atan(FRAME_H / 2 / DIST) * 180 / Math.PI, FRAME_W / FRAME_H, 100, 30000);
  camera.position.set(cx, cy, DIST);
  camera.lookAt(cx, cy, 0);

  /* THREE-POINT RIG (spec 20 Aug §3). No light is white; no light is
     neutral — the act is lit violet and amber and the camera sits INSIDE
     that lighting. Ambient at 0.10 only lifts shadows off pure black; the
     old 0.28 + white-ish key is what rendered the body light and lavender. */
  /* MEASURED against the reference (20 Aug 08:45). Luminance histograms of
     art-source/market-cinema-camera-front.png vs our render:
         reference  p05 11 · median 56 · p99 208 · range 137 · blue-bias 3
         ours       p05 40 · median 75 · p99 171 · range 111 · blue-bias 23
     Our shadows never got dark and our highlights never got bright — a
     compressed, uniformly violet range, which IS the "CG look". Yash's
     "no detail hidden" is won by EDGE CONTRAST (the reference's chamfer
     highlights), not by lifting everything: the 08:17 lift made it worse.
     Fill light drops back hard so cavities can go dark again. */
  scene.add(new AmbientLight(0x9fb8ff, 0.04));
  const hemi = new HemisphereLight(0x9fb8ff, 0x2a2436, 0.10);
  scene.add(hemi);
  const modelCentre = new Vector3(51, -288, 0);
  // KEY: violet, upper-left-front (elev 35deg, azimuth -40deg), shadowed
  const key = new DirectionalLight(0xa98bff, 8.4);   // crisp speculars on the chamfers
  key.position.set(-1157, 1263, 1379);
  key.castShadow = true;
  /* Measured: a 3000mm frustum over 2048 texels is 1.46mm/texel and
     bias -0.0005 across a 6800mm near/far span pushes depth 3.4mm — every
     cavity that matters here is 5-40mm, so nothing resolved. Tightened to
     the machine's actual bounds; normalBias replaces most of the constant
     bias so thin parts stop self-shadowing. */
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 1.2;
  key.shadow.mapSize.set(2048, 2048);
  /* ⚠️ The frustum must COVER the machine or the parts outside it sample
     off the shadow map and render as fully shadowed — an 820mm half-extent
     could not contain a machine that is 1511mm tall (model y +467..-1044),
     which crushed the whole render to near-black. Half-extent 1150mm with
     near/far bracketing the light's ~2200mm standoff. */
  key.shadow.camera.left = key.shadow.camera.bottom = -1150;
  key.shadow.camera.right = key.shadow.camera.top = 1150;
  key.shadow.camera.near = 900;
  key.shadow.camera.far = 3800;
  key.target.position.copy(modelCentre);
  // FILL: warm amber point, lower-right, about half the key. decay 0 —
  // physically-decayed point lights attenuate to black at mm scale.
  const fill = new PointLight(0xffd8a0, 2.4, 0, 0);
  fill.position.set(650, -550, 1100);            // frontal: it reads the lower-right
                                                 // face without flattening it
  // RIM: pale lavender from behind-above (azimuth 155deg) — the light that
  // separates the silhouette from the black backdrop.
  const rim = new DirectionalLight(0xc7bfe0, 4.4);
  rim.position.set(659, 900, -1413);
  rim.target.position.copy(modelCentre);
  scene.add(key, key.target, fill, rim, rim.target);

  const rig = new Group();       // yaw + recoil happen here, about the lens
  scene.add(rig);

  /* THE RIBBON — built once; the curve NEVER animates. Child of the rig so
     the film stays threaded through the machine's reels during the drive-in. */
  const { geo: ribbonGeo, arcMM, gate, curve: ribbonCurve } = buildRibbonGeometry();
  const ribbonMat = new ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    uniforms: {
      uAtlas: { value: null },
      uPos: { value: 0 },
      uAlpha: { value: 0 },
      uArcMM: { value: arcMM },
      uPitch: { value: RIBBON.PITCH_MM / arcMM },
      uPlateW: { value: RIBBON.PLATE_MM / arcMM },
      uGate: { value: gate },
      uWidth: { value: RIBBON.WIDTH },
    },
    transparent: true,
    side: DoubleSide,       // the twist shows the back near the spools
  });
  ribbonMat.uniforms.uAtlas.value = buildRibbonAtlas(renderer);
  const ribbon = new Mesh(ribbonGeo, ribbonMat);
  ribbon.name = "film_ribbon";
  ribbon.frustumCulled = false;   // the rect-driven frustum would misjudge it
  rig.add(ribbon);

  const nodes = {};
  let glassMat = null;
  let bladeSh = null;      // compiled blade shader, for the aperture uniform
  let ready = false;
  /* the lens flange's front rim, in the lens node's local space — measured
     from the geometry at load, used to project the VISUAL lens circle */
  let rimR = 118, rimZ = 150;
  const state = {
    yaw: 0, opacity: 1, spin: 0, crank: 0, drift: 0, visible: false,
    recoil: 0, rect: null, irisOpen: 0,
    spinB: null,            // take-up reel: accelerates as it fills
    filmPos: 0,             // plate index at the apex (0..8)
    filmAlpha: 0,           // the strip's opacity envelope
  };

  new GLTFLoader().load(MODEL, (gltf) => {
    const model = gltf.scene;
    /* ⚠️ THE CREASE ANGLE IS THE CHAMFER'S LIFE OR DEATH (20 Aug 08:55).
       The GLB ships faceted normals, so this pass decides what gets smoothed.
       At 40deg it also welded every 2-segment chamfer (facets ~22deg apart)
       into its neighbouring flat face — which inflated each reel web into a
       cushion and turned the hub into a faceted star. The reference keeps
       FLAT faces meeting at a thin crisp chamfer line.
       18deg separates the two populations cleanly:
         64-segment cylinders  5.6deg/facet  -> still smooth
         2-segment chamfers   ~22deg/facet   -> stay sharp
         box corners           90deg         -> sharp
       Never raise this above ~20 without re-checking the reels. */
    model.traverse((o) => {
      if (o.isMesh) o.geometry = toCreasedNormals(o.geometry, (18 * Math.PI) / 180);
    });
    /* MATERIAL PASS (spec 20 Aug §2). One base treatment for the whole
       machine: #303040 at metalness .78, roughness VARIED 0.30-0.55 by a
       procedural map so no face is uniformly one value, envMapIntensity
       0.5. Primitives on the cam_wear slot (reel rims, knob ridges, crank
       grip, leg collars — split by the GLB's material slots) get edge wear:
       lifted toward #4A4A62, slightly tighter roughness. No clearcoat, no
       emissive — nothing on this object glows. Roughness maps stay high-
       repeat: chosen for the 13x push, a whisper at rest. */
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (!o.material || !o.material.isMeshStandardMaterial) return;
      const wear = /wear/i.test(o.material.name || "");
      o.material = o.material.clone();
      /* Base pulled DARKER and less blue (3E3E52 -> 2B2B33, bias 20 -> 8):
         the reference's body sits at median 56 and its blue bias is 3. The
         legibility comes back through env reflections + chamfer speculars,
         not through a light base. */
      o.material.color = new Color(wear ? 0x5c5c64 : 0x3b3b40);
      o.material.metalness = wear ? 0.85 : 0.78;
      o.material.roughness = wear ? 0.24 : 0.34;      // the shader varies it
      /* env is OMNIDIRECTIONAL — it lights shadow sides as much as lit
         ones, so pushing it for highlights also lifted the darks (p05 30 vs
         the reference's 11). Highlights come from the DIRECTIONAL key/rim
         instead: they leave the shadow side alone, which is what widens the
         range rather than shifting it. */
      /* ⚠️ envMap MUST be assigned explicitly. In three r180 a
         MeshStandardMaterial whose envMap is null has its envMapIntensity
         uniform overwritten every frame by scene.environmentIntensity
         (default 1.0) — so this knob did nothing at any value, which is why
         12 and 3 rendered identically during the bisect. 1.15 reproduces
         what the scene default was silently doing, plus a little. */
      o.material.envMap = scene.environment;
      o.material.envMapIntensity = 1.15;
      attachSurface(o.material);
    });
    /* THE ELEMENT (spec §1): dark charcoal glass, NOT a mirror — metalness
       0, base #0A0A12, roughness 0.18 at the apex rising to 0.45 at the
       rim. The radial ramp is a view-normal mix injected into the standard
       shader: the apex faces the viewer (n.v -> 1 -> 0.18), the rim grazes
       (n.v -> 0 -> 0.45). It must read as DEPTH, not reflection. */
    /* THE IRIS (Yash, 10:46). Three surfaces, keyed by mesh name:
       blades — violet toward amber across each plate with a bright leading
       edge; tunnel — the hole behind the pupil, as dark as the scene allows;
       glass — the cover, below. */
    const iris = model.getObjectByName("iris_blades");
    if (iris) iris.traverse((o) => {
      if (!o.isMesh) return;
      /* LOW metalness on purpose. At 0.62 the blades were mirrors: every one
         of them reflected the same violet sky and the iris rendered as one
         flat saturated disc, with the pinwheel gradient invisible underneath.
         Blades are anodised metal — mostly diffuse, with a sheen. */
      const m = new MeshStandardMaterial({
        color: 0x6b5a86, metalness: 0.18, roughness: 0.38, envMapIntensity: 0.45,
      });
      m.envMap = scene.environment;
      /* The gradient runs across each blade in OBJECT space, so it does not
         swim when the machine turns: violet at the rim of the iris falling to
         warm amber toward the pupil, with the leading edge catching a line.
         The blades are the one place the act's two lights meet on a single
         surface, which is what makes them read as an optic. */
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uOpen = { value: 0 };
        bladeSh = sh;
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vIrisPos;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n vIrisPos = position;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vIrisPos;\nuniform float uOpen;")
          .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
             /* THE APERTURE OPENS HERE. Everything inside the pupil radius
                is discarded, so the plates are eaten from the inside out
                exactly as a retracting iris looks — and past full open the
                blade field is gone entirely, leaving the bore empty for the
                page beneath to show through. 9mm shut, 70mm past the blade
                rim (63mm) so the last sliver clears. */
             {
               /* NINE-SIDED, not circular: a physical iris opens as a
                  polygon whose sides are the blades' own edges, and it
                  turns with them. A round discard read as a machined ring
                  rather than a mechanism. */
               float aa = atan(vIrisPos.y, vIrisPos.x) - uOpen * 0.55;
               float wedge = mod(aa + 3.14159265, 0.69813170) - 0.34906585;
               float poly = 1.0 / max(cos(wedge), 0.30);
               if (length(vIrisPos.xy) < mix(9.0, 70.0, uOpen) * poly) discard;
             }
             /* ⚠️ .xy, NOT .xz. Blender is Z-up and the exporter maps
                (x,y,z) -> (x, z, -y), so the iris plane that was XZ in the
                build script is XY in the GLB. Using .xz measured across the
                blade THICKNESS and produced a near-constant gradient — the
                iris rendered as one flat disc and I nearly blamed the
                material for it. */
             /* ⚠️ .xy, NOT .xz. Blender is Z-up and the exporter maps
                (x,y,z) -> (x, z, -y), so the iris plane that was XZ in the
                build script is XY in the GLB. Measuring across the blade
                THICKNESS produced a near-constant gradient and the iris
                rendered as one flat disc.

                THE BLADES ARE SHADED FROM THEIR OWN ARCS, not from a radial
                sawtooth: for each pixel we find the TOPMOST blade that
                actually covers it — blade k covers p when p lies outside
                that blade's circular bite — and shade from that blade's
                edge. The boundaries are then the real arcs the geometry
                cuts, so the iris spirals the way a physical one does
                instead of splitting into straight pie wedges. The
                constants mirror the build script exactly (9 blades, bite
                r43 centred 34mm out, 40deg pitch, 12deg phase). */
             vec2 q = vIrisPos.xy;
             float rr = clamp(length(q) / 63.0, 0.0, 1.0);
             /* The visible plate at any pixel is the TOPMOST blade that
                covers it — blade k covers p when p lies outside k's bite.
                (Ownership by angular wedge was tried and is wrong: it
                flattens the whole iris, because the arc distance then has
                no relationship to which plate the eye actually sees.)
                ⚠️ These five constants are DUPLICATED from
                build_camera.py (IRIS_R 63, ARC_R 78, ARC_D 69, 40deg pitch,
                12deg phase). Changing one copy alone decouples the lit arcs
                from the real edges. */
             /* A real iris overlaps CYCLICALLY — each plate laps the next
                and the last laps the first — so there is no global top blade,
                and every global rule fails a different way: a strict z-order
                lets one plate own everything outside its own bite; an angular
                wedge flattens the arcs into a radial star; nearest-edge draws
                EVERY arc across the face and yields a lattice rosette.
                The cycle resolves LOCALLY: starting from the plate whose
                sector you stand in and walking backwards, the first plate
                that covers you is the one you see. That leaves exactly nine
                arc-bounded faces, each showing a single leading edge. */
             float phi = atan(q.y, q.x);
             float k0 = floor(mod((phi - 0.20943951) / 0.69813170, 9.0));
             float dvis = 0.0;
             float kvis = 0.0;
             bool  got = false;
             for (int i = 0; i < 9; i++) {
               float k = mod(k0 - float(i) + 9.0, 9.0);
               float ak = k * 0.69813170 + 0.20943951;
               vec2  ck = vec2(cos(ak), sin(ak)) * 69.0;
               float fk = length(q - ck) - 78.0;
               if (!got && fk > 0.0) { dvis = fk; kvis = k; got = true; }
             }
             /* distance past this blade's leading edge: 0 on the edge itself */
             float t = clamp(dvis / 30.0, 0.0, 1.0);
             float sweep = mix(1.18, 0.62, t);
             /* Each plate takes its own share of the key: a 9-step ramp round
                the stack, so the aperture reads as a pinwheel of metal rather
                than nine identical wedges. */
             sweep *= 0.74 + 0.42 * fract(kvis / 9.0 + 0.62);
             /* Yash's one deviation from the reference: violet inside. The
                warm core still shows near the pupil, so the two act lights
                meet on this one surface. */
             vec3 amber  = vec3(0.66, 0.47, 0.27);
             vec3 violet = vec3(0.38, 0.31, 0.58);
             diffuseColor.rgb *= mix(amber, violet, smoothstep(0.04, 0.78, rr)) * 1.5 * sweep;
             /* the struck leading edge: a fine bright line where one plate
                laps over the next */
             /* the struck edge stays a whisper: at full strength every arc
                drew across the whole face and the iris read as a lattice,
                because an arc that a real blade would hide was still lit */
             float lead = 1.0 - smoothstep(0.0, 0.05, t);
             diffuseColor.rgb += vec3(0.045, 0.041, 0.056) * lead;
             roughnessFactor = clamp(roughnessFactor - lead * 0.18 - (1.0 - rr) * 0.10, 0.06, 0.9);`);
      };
      o.material = m;
      o.castShadow = false;          // blades shadowing each other is noise
      o.receiveShadow = false;
    });
    const tunnel = model.getObjectByName("lens")?.getObjectByName?.("iris_tunnel");
    const lensObj = model.getObjectByName("lens");
    if (lensObj) lensObj.traverse((o) => {
      if (o.isMesh && /tunnel/i.test(o.name)) {
        /* ⚠️ METALNESS 1 IS THE TRICK, not a typo. At metalness 0 a
           near-black dielectric still keeps F0 = 0.04, and this scene's
           environment is an HDR multiplier — 4% of it is a visible violet
           sheen, so the "hole" measured about as bright as the blades. For a
           METAL, F0 IS the colour, so one near-black value kills the
           environment reflection and the key's specular together. */
        const mt = new MeshStandardMaterial({
          color: 0x0a0812, metalness: 1.0, roughness: 0.85,
          envMapIntensity: 0.02, side: DoubleSide,
        });
        mt.envMap = scene.environment;   // without this, 0.02 is overwritten by 1.0
        o.material = mt;
        o.castShadow = false; o.receiveShadow = false;
        return;
      }
      if (o.isMesh && /glass/i.test(o.name)) {
        /* env pulled DOWN and the apex roughened (0.18 -> 0.26): with the
           sharp environment the old values reflected RoomEnvironment's
           lamps as three hard dots — a chrome ball. The reference's element
           is matte with ONE broad soft highlight. */
        /* The COVER, not a marble: transparent enough that the blades read
           through it, with the environment's bright band sweeping across it
           as the specular crescent the reference shows. */
        const m = new MeshStandardMaterial({
          color: 0x171320, metalness: 0.05, roughness: 0.05,
          envMapIntensity: 3.2, transparent: true, opacity: 0.17,
          depthWrite: false,
        });
        glassMat = m;   // the cover fades as the shutter opens (see render)
        m.envMap = scene.environment;      // same null-envMap trap as above
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
             { float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
               roughnessFactor = mix(0.62, 0.30, ndv); }`);
        };
        o.material = m;
      }
    });
    for (const n of ["camera_body", "reel_a", "reel_b", "lens", "crank", "head", "tripod",
                     "iris_blades", "iris_tunnel"])
      nodes[n] = model.getObjectByName(n);
    /* set BEFORE anything renders: onBeforeCompile reads userData.grain when
       the program is first built, so assigning after a frame has drawn
       would be ignored */
    for (const [n, k] of Object.entries(GRAIN)) {
      nodes[n]?.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const wear = /wear/i.test(o.material.name || "");
        o.material.userData.grain = k * (wear ? 0.5 : 1.0);
      });
    }
    /* measure the flange rim from the geometry, never assume: widest x and
       nearest-to-viewer z across the lens meshes, in lens-local space */
    if (nodes.lens) {
      let mx = 0, mz = 0;
      nodes.lens.traverse((o) => {
        if (o.isMesh) {
          o.geometry.computeBoundingBox();
          mx = Math.max(mx, o.geometry.boundingBox.max.x);
          mz = Math.max(mz, o.geometry.boundingBox.max.z);
        }
      });
      if (mx) { rimR = mx; rimZ = mz; }
    }
    rig.add(model);
    ready = true;
    render(0);
    /* The site's handler is SCROLL-driven: if the page sits still while the
       GLB loads (a programmatic jump, a slow network), every ready-gated
       write upstream (lens centre, reel anchors) stays stale until the next
       scroll. Hand control back once so the caller can re-apply its state. */
    if (onReady) onReady();
  }, undefined, (e) => console.warn("[marketCamera]", e?.message || e));

  /* Canvas covers the act; the frame rect does the moving. dpr 2 on fine
     pointers — the raster is never CSS-magnified any more, so every pixel
     rendered is a pixel shown. Coarse stays at 1 (phone budget). */
  let cssW = 1, cssH = 1, originX = 0, originY = 0;
  function resize() {
    cssW = host.clientWidth || innerWidth;
    cssH = host.clientHeight || innerHeight;
    /* dpr 2 on PHONES TOO (skeptic finding, 19 Aug): the old coarse cap
       of 1 stretched a 390px buffer over a dpr-3 panel and re-created the
       very pixelation this rebuild removes. 2 is the budget compromise:
       ~15MB of buffers, half the blur gone, and the act renders only while
       live. */
    const dpr = Math.min(devicePixelRatio || 1, 2);
    renderer.setSize(Math.round(cssW * dpr), Math.round(cssH * dpr), false);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const r = canvas.getBoundingClientRect();
    originX = r.left; originY = r.top;
  }
  resize();
  addEventListener("resize", resize);

  function render(tMs) {
    if (!ready || !state.rect) return;
    const t = tMs / 1000;
    rig.rotation.y = state.yaw
      + state.recoil * -3 * Math.PI / 180
      + (reduced ? 0 : state.drift * Math.sin(t * 0.5) * 0.035);
    rig.rotation.x = state.recoil * 1.4 * Math.PI / 180;
    rig.position.y = reduced ? 0 : state.drift * Math.sin(t * 0.7) * 6;
    if (nodes.reel_a) nodes.reel_a.rotation.z = state.spin * Math.PI * 2;
    /* the take-up reel gets its own integral when supplied (it accelerates
       as it fills while the feed reel slows as it empties) */
    if (nodes.reel_b) nodes.reel_b.rotation.z =
      -(state.spinB ?? state.spin * 1.08) * Math.PI * 2;
    ribbonMat.uniforms.uPos.value = state.filmPos;
    ribbonMat.uniforms.uAlpha.value = state.filmAlpha;
    ribbon.visible = state.filmAlpha > 0.003;
    if (nodes.crank) nodes.crank.rotation.z = state.crank;
    /* THE SHUTTER OPENS (Yash, 12:07): radial scale slides the blades out
       under the bore lip — the pupil grows as 9mm x s while the plates
       disappear behind the solid ring stack — and a sweep of rotation makes
       them SPIRAL open the way a physical aperture does. The blade shader is
       object-space, so the pinwheel rides the scale for free. The throat
       scales with them: through the fully-open aperture you see its dark
       interior, which is the black the reveal circle blooms in. */
    if (nodes.iris_blades) {
      /* ⚠️ THE HOLE GROWS — THE BLADES DO NOT. Scaling the assembly (the
         first attempt: s up to 7.4) pushed the plates out past the barrel
         and over the body until they covered 94% of the viewport: a
         fullscreen violet pinwheel, i.e. exactly the "purplish blue circle"
         the client rejected, reproduced larger. A physical iris opens by
         retracting behind the barrel, so the plates keep their size and
         position and the shader DISCARDS everything inside the growing
         pupil. The camera stays a camera; only the opening changes. */
      nodes.iris_blades.scale.set(1, 1, 1);
      nodes.iris_blades.rotation.z = state.irisOpen * 0.55;
      if (bladeSh) bladeSh.uniforms.uOpen.value = state.irisOpen;
      /* The throat BOWS OUT as the shutter opens. While the pupil is small
         it supplies the depth read; once the blades part, the pupil must be
         genuinely EMPTY canvas — transparent pixels — so the page layers
         beneath (the blackout, and the green reveal circle blooming in it at
         .744) show THROUGH the aperture. Scaling the throat with the blades
         would put its dark shell across the whole opening and the circle
         would bloom behind an opaque wall. */
      /* ⚠️ FADE, not a boolean. `visible = irisOpen < 0.30` snapped the
         throat off in a single frame at p=.718, in full light: measured, a
         black ring around the pupil jumped from luminance 11 to 49 in one
         0.001 step while the blades stayed at full brightness around it.
         Ramping its opacity over .22-.34 of the opening dissolves it
         instead. transparent + depthWrite false so it never punches a hole
         in what is behind it while fading. */
      if (nodes.iris_tunnel) {
        const t = 1 - Math.max(0, Math.min(1, (state.irisOpen - 0.22) / 0.12));
        nodes.iris_tunnel.visible = t > 0.004;
        nodes.iris_tunnel.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          o.material.transparent = true;
          o.material.depthWrite = false;
          o.material.opacity = t;
        });
      }
      if (glassMat) glassMat.opacity = 0.17 * (1 - state.irisOpen);
    }
    /* Map the model frame onto the target rect: render the sub-window of
       the notional 785x1511 view that the canvas overlaps. All zoom is
       projection — no raster is ever stretched. */
    const k = state.rect.w / FRAME_W;
    camera.setViewOffset(FRAME_W, FRAME_H,
      (originX - state.rect.x) / k, (originY - state.rect.y) / k,
      cssW / k, cssH / k);
    canvas.style.opacity = state.opacity.toFixed(3);
    renderer.render(scene, camera);
  }

  /* Driven from the ONE site ticker via setState; renders only when the act
     is live. */
  function setState(next, tMs = 0) {
    Object.assign(state, next);
    if (!state.visible) { canvas.style.opacity = "0"; return; }
    render(tMs);
  }

  /** A named node's position in CANVAS FRACTIONS (0..1) — the canvas is the
      whole act now, so these are act/viewport fractions. */
  /** The lens's VISUAL circle on screen: 8 points on the flange's front
      rim, projected and averaged. This is NOT project('lens') — under
      perspective an off-axis circle's apparent centre shifts from its axis
      point (measured: 17/30px at p=.730), which is exactly the misalignment
      Yash flagged between the iris overlay and the barrel. Returns viewport
      px {x, y, r}. */
  const rv = new Vector3();
  function projectLensCircle() {
    if (!nodes.lens) return null;
    let sx = 0, sy = 0, minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rv.set(Math.cos(a) * rimR, Math.sin(a) * rimR, rimZ);
      nodes.lens.localToWorld(rv);
      rv.project(camera);
      const px = ((rv.x + 1) / 2) * cssW + originX;
      const py = ((1 - rv.y) / 2) * cssH + originY;
      sx += px; sy += py;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    }
    return { x: sx / 8, y: sy / 8, r: (maxX - minX) / 2 };
  }

  /** Where the APERTURE actually lands on screen, in viewport px.
      ⚠️ NOT the same as project('lens'): the lens NODE's origin is at model
      z 0, but the blades sit 232mm in FRONT of it, and under perspective a
      point 232mm nearer the eye projects to a different screen position —
      measured ~46px apart at the push. Centring the node put the node in
      the middle and left the visible opening high and left of the green
      circle, which is precisely what the client asked to be aligned. */
  const pv = new Vector3();
  function projectPupil() {
    pv.set(0, 0, 232);
    rig.localToWorld(pv);
    pv.project(camera);
    return { x: ((pv.x + 1) / 2) * cssW + originX, y: ((1 - pv.y) / 2) * cssH + originY };
  }

  const v = new Vector3();
  function project(name) {
    const n = nodes[name];
    if (!n) return null;
    n.getWorldPosition(v);
    v.project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  /* ── RAYCAST: the ribbon is clickable, same contract as the DOM strip ──
     A hit resolves to a plate index and the caller opens the SAME service
     sheet the DOM handler opens — Escape, backdrop, focus and the Lenis
     lock all stay in one place. setFromCamera respects setViewOffset, so
     NDC against the canvas is correct even while the frame rect moves. */
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  function plateAt(clientX, clientY) {
    if (!ribbon.visible || state.filmAlpha < 0.35) return -1;
    ndc.set((clientX - originX) / cssW * 2 - 1, -((clientY - originY) / cssH) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(ribbon, false)[0];
    if (!hit || !hit.uv) return -1;
    if (hit.uv.y < 0.17 || hit.uv.y > 0.83) return -1;      // sprocket bands
    const pitch = RIBBON.PITCH_MM / arcMM;
    const rel = state.filmPos - (hit.uv.x - gate) / pitch;   // same flip as the shader
    const k = Math.round(rel);
    const ph = 0.5 * (RIBBON.PLATE_MM / RIBBON.PITCH_MM);
    if (k < 0 || k > 8 || Math.abs(rel - k) > ph) return -1;
    return k;
  }

  /** Any model-frame point -> viewport px (for the DOM caption's anchor). */
  const mp = new Vector3();
  function projectModelPoint(x, y, z) {
    mp.set(x, y, z);
    rig.localToWorld(mp);
    mp.project(camera);
    return { x: ((mp.x + 1) / 2) * cssW + originX, y: ((1 - mp.y) / 2) * cssH + originY };
  }

  /** The reading gate's own screen position — the caption hangs under it. */
  const gv = new Vector3();
  function projectGate() {
    ribbonCurve.getPointAt(gate, gv);
    /* ABOVE the parked plate, like the reference's title. The gate now sits
       far forward and low (the strip crosses the FOREGROUND), so hanging the
       caption below it projected to y=978 on a 960px viewport — off-screen. */
    gv.y += 330;
    rig.localToWorld(gv);
    gv.project(camera);
    return { x: ((gv.x + 1) / 2) * cssW + originX, y: ((1 - gv.y) / 2) * cssH + originY };
  }

  return {
    setState, project, projectLensCircle, projectPupil, projectModelPoint,
    projectGate, plateAt, resize, canvas,
    get ready() { return ready; },
    dispose() {
      removeEventListener("resize", resize);
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
