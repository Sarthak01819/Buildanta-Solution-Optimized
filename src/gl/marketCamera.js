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
  Color, Vector3, SRGBColorSpace, ACESFilmicToneMapping,
  PMREMGenerator, CanvasTexture, RepeatWrapping, MeshPhysicalMaterial,
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
  renderer.toneMappingExposure = 1.1;

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

  /* Directional, not point: at mm scale physically-decayed point lights
     attenuate to black. Levels sit LOWER than the pre-environment rig —
     the PMREM adds its own fill, and stacking both blew the body out. */
  scene.add(new AmbientLight(0x9fb4ff, 0.28));
  const rimA = new DirectionalLight(0xa98bff, 2.2);   // cool, behind-left
  rimA.position.set(-900, 650, 350);
  const rimB = new DirectionalLight(0xffd8a0, 1.25);  // warm kick, right
  rimB.position.set(500, 260, 700);
  const key = new DirectionalLight(0xcfd6ff, 1.45);   // soft front key
  key.position.set(150, -80, 1400);
  scene.add(rimA, rimB, key);

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
    /* Base treatment for anything not claimed below (head etc.): painted
       housing metal. Grain repeats HIGH (8x): at rest it is a whisper, and
       the 13x push magnifies it into fine sandblasted metal instead of
       stucco — the texture is chosen for its most-magnified moment. */
    const grain = grainTex(512, 55, false);
    grain.repeat.set(8, 8);
    const brushed = grainTex(512, 96, true);
    brushed.repeat.set(4, 4);
    model.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
        o.material.color = new Color(0x32323f);
        o.material.metalness = 0.55;
        o.material.roughness = 0.5;
        o.material.roughnessMap = grain;
        o.material.bumpMap = grain;
        o.material.bumpScale = 0.22;
        o.material.envMapIntensity = 0.7;
      }
    });
    /* The moving metal: spools and crank in brushed steel, brighter and
       more reflective than the housing so the motion catches light. */
    for (const name of ["reel_a", "reel_b", "crank"]) {
      const part = model.getObjectByName(name);
      if (part) part.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          o.material.color = new Color(0x4a4a58);
          o.material.metalness = 0.95;
          o.material.roughness = 0.3;
          o.material.roughnessMap = brushed;
          o.material.bumpMap = brushed;
          o.material.bumpScale = 0.12;
          o.material.envMapIntensity = 1.0;
        }
      });
    }
    const tripodObj = model.getObjectByName("tripod");
    if (tripodObj) tripodObj.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.color = new Color(0x26262f);
        o.material.metalness = 0.8;
        o.material.roughness = 0.44;
        o.material.envMapIntensity = 0.55;
      }
    });
    /* The lens is the destination of the push. Two materials, split by
       mesh name (the GLB parents the glass as a child "l_glass"): the
       SURROUND is bright machined metal — in the reference every ring is
       silver and only the element is dark — and the glass itself is
       near-black clearcoat with one bright environment ring. */
    const lensObj = model.getObjectByName("lens");
    if (lensObj) lensObj.traverse((o) => {
      if (o.isMesh && o.material) {
        if (/glass/i.test(o.name)) {
          o.material = new MeshPhysicalMaterial({
            color: 0x08080e, metalness: 0.45, roughness: 0.08,
            clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 0.75,
          });
        } else {
          o.material = o.material.clone();
          o.material.color = new Color(0x585866);
          o.material.metalness = 0.95;
          o.material.roughness = 0.26;
          o.material.roughnessMap = brushed;
          o.material.bumpMap = brushed;
          o.material.bumpScale = 0.15;
          o.material.envMapIntensity = 1.05;
        }
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
