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
  PointLight, Color, Vector3, SRGBColorSpace, ACESFilmicToneMapping,
  PMREMGenerator, CanvasTexture, RepeatWrapping, MeshStandardMaterial,
  PCFSoftShadowMap,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { wantsAA } from "./msaa.js";

const MODEL = "/assets/market-camera.glb";
const FRAME = { left: -341.5, right: 443.5, top: 467, bottom: -1044 };
const FRAME_W = 785, FRAME_H = 1511;
const DIST = 5500;

/* Deterministic procedural texture: fine metal grain, optionally smeared
   horizontally into a brushed finish. Grayscale — used as roughnessMap
   (green channel) and bumpMap at once. Seeded LCG so every visit renders
   the identical machine. */
/* Roughness map with an EXPLICIT range (spec: 0.30-0.55, never uniform):
   texel values are the roughness itself; material.roughness stays 1.0 so
   the map is authoritative. */
function roughTex(size, lo, hi, brushed) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  let sd = 0x2545f491;
  const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round((lo + rnd() * (hi - lo)) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (brushed) {
    g.globalAlpha = 0.45;
    for (const dx of [1, 2, 4, 9, 17]) { g.drawImage(c, dx, 0); g.drawImage(c, -dx, 0); }
    g.globalAlpha = 1;
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function grainTex(size, amp, brushed) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  let s = 0x9e3779b9;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * amp;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (brushed) {
    g.globalAlpha = 0.45;
    for (const dx of [1, 2, 4, 9, 17]) { g.drawImage(c, dx, 0); g.drawImage(c, -dx, 0); }
    g.globalAlpha = 1;
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

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
  renderer.toneMappingExposure = 0.95;          // spec 20 Aug — 1.1 washed the body out
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  /* The room the metal reflects. Blurred (sigma .35) so reflections read as
     sheen and panel gradients, not as furniture from another site. */
  const pmrem = new PMREMGenerator(renderer);
  /* sigma 0.04 (the three.js reference value): anything higher clips —
     even 0.08 requests 39 samples against the 20-sample ceiling. The
     materials' roughness maps do the blurring; the environment itself can
     stay near-sharp, and the bake gets cheaper too. */
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

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
  scene.add(new AmbientLight(0x9fb8ff, 0.10));
  const modelCentre = new Vector3(51, -288, 0);
  // KEY: violet, upper-left-front (elev 35deg, azimuth -40deg), shadowed
  const key = new DirectionalLight(0xa98bff, 2.4);
  key.position.set(-1157, 1263, 1379);
  key.castShadow = true;
  key.shadow.bias = -0.0005;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -1500;
  key.shadow.camera.right = key.shadow.camera.top = 1500;
  key.shadow.camera.near = 200;
  key.shadow.camera.far = 7000;
  key.target.position.copy(modelCentre);
  // FILL: warm amber point, lower-right, about half the key. decay 0 —
  // physically-decayed point lights attenuate to black at mm scale.
  const fill = new PointLight(0xffd8a0, 1.0, 0, 0);
  fill.position.set(800, -850, 900);
  // RIM: pale lavender from behind-above (azimuth 155deg) — the light that
  // separates the silhouette from the black backdrop.
  const rim = new DirectionalLight(0xc7bfe0, 1.6);
  rim.position.set(659, 900, -1413);
  rim.target.position.copy(modelCentre);
  scene.add(key, key.target, fill, rim, rim.target);

  const rig = new Group();       // yaw + recoil happen here, about the lens
  scene.add(rig);

  const nodes = {};
  let ready = false;
  /* the lens flange's front rim, in the lens node's local space — measured
     from the geometry at load, used to project the VISUAL lens circle */
  let rimR = 118, rimZ = 150;
  const state = {
    yaw: 0, opacity: 1, spin: 0, crank: 0, drift: 0, visible: false,
    recoil: 0, rect: null,
  };

  new GLTFLoader().load(MODEL, (gltf) => {
    const model = gltf.scene;
    /* The GLB ships FACETED normals (bpy default shading), and a faceted
       sphere under an environment map reflects the room as solid blocks —
       Yash's push frame showed the lens dome as a disco ball. Creased
       normals at 40deg: curved surfaces go smooth, box edges stay sharp. */
    model.traverse((o) => {
      if (o.isMesh) o.geometry = toCreasedNormals(o.geometry, (40 * Math.PI) / 180);
    });
    /* MATERIAL PASS (spec 20 Aug §2). One base treatment for the whole
       machine: #303040 at metalness .78, roughness VARIED 0.30-0.55 by a
       procedural map so no face is uniformly one value, envMapIntensity
       0.5. Primitives on the cam_wear slot (reel rims, knob ridges, crank
       grip, leg collars — split by the GLB's material slots) get edge wear:
       lifted toward #4A4A62, slightly tighter roughness. No clearcoat, no
       emissive — nothing on this object glows. Roughness maps stay high-
       repeat: chosen for the 13x push, a whisper at rest. */
    const rough = roughTex(512, 0.30, 0.55, false);
    rough.repeat.set(8, 8);
    const roughWear = roughTex(512, 0.24, 0.40, true);
    roughWear.repeat.set(4, 4);
    const bump = grainTex(512, 55, false);
    bump.repeat.set(8, 8);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (!o.material || !o.material.isMeshStandardMaterial) return;
      const wear = /wear/i.test(o.material.name || "");
      o.material = o.material.clone();
      o.material.color = new Color(wear ? 0x4a4a62 : 0x303040);
      o.material.metalness = wear ? 0.85 : 0.78;
      o.material.roughness = 1.0;                     // the map is authoritative
      o.material.roughnessMap = wear ? roughWear : rough;
      o.material.bumpMap = bump;
      o.material.bumpScale = wear ? 0.08 : 0.18;
      o.material.envMapIntensity = 0.5;
    });
    /* THE ELEMENT (spec §1): dark charcoal glass, NOT a mirror — metalness
       0, base #0A0A12, roughness 0.18 at the apex rising to 0.45 at the
       rim. The radial ramp is a view-normal mix injected into the standard
       shader: the apex faces the viewer (n.v -> 1 -> 0.18), the rim grazes
       (n.v -> 0 -> 0.45). It must read as DEPTH, not reflection. */
    const lensObj = model.getObjectByName("lens");
    if (lensObj) lensObj.traverse((o) => {
      if (o.isMesh && /glass/i.test(o.name)) {
        const m = new MeshStandardMaterial({
          color: 0x0a0a12, metalness: 0.0, roughness: 1.0, envMapIntensity: 0.5,
        });
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
             { float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
               roughnessFactor = mix(0.45, 0.18, ndv); }`);
        };
        o.material = m;
      }
    });
    for (const n of ["camera_body", "reel_a", "reel_b", "lens", "crank", "head", "tripod"])
      nodes[n] = model.getObjectByName(n);
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
    if (nodes.reel_b) nodes.reel_b.rotation.z = -state.spin * Math.PI * 2 * 1.08;
    if (nodes.crank) nodes.crank.rotation.z = state.crank;
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

  const v = new Vector3();
  function project(name) {
    const n = nodes[name];
    if (!n) return null;
    n.getWorldPosition(v);
    v.project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  return {
    setState, project, projectLensCircle, resize, canvas,
    get ready() { return ready; },
    dispose() {
      removeEventListener("resize", resize);
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
