/**
 * THE MARKET CAMERA IN 3D — Agents 3 & 4 of the rebuild brief (19 Aug).
 *
 * Replaces the graded PNG + six CSS overlay spans with the procedural GLB
 * (tools/camera-match/build_camera.py). The overlays had to go, not as
 * cleanup but by necessity: fixed percentage anchors cannot follow a
 * rotating object.
 *
 * ── THE DROP-IN CONTRACT ──
 * The canvas replaces the <img> INSIDE .market-pusher, same box, same aspect
 * (785:1511). The camera is framed so that at yaw 0 the render is
 * pixel-equivalent to the reference PNG: the model is mm at 1mm = 1px with
 * origin at the lens centre, and the frustum is locked to the PNG frame
 * (model x -341.5..+443.5, y +467..-1044). Consequences, both load-bearing:
 *   - every existing .market-pusher transform (push, capture, recoil) keeps
 *     working unchanged, because the canvas behaves exactly like the PNG did;
 *   - the push pivot `transform-origin: 43.5% 31%` IS the lens centre at
 *     yaw 0 — the handoff contract at x=0.684 holds by construction, and
 *     project('lens') exists to assert it at runtime.
 *
 * Perspective, not ortho: D=5500mm with a matched fov differs from the PNG by
 * <1% at yaw 0 but lets the TRAVEL-AND-TURN read as a machine swinging round.
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, AmbientLight, DirectionalLight,
  Color, Vector3, SRGBColorSpace, ACESFilmicToneMapping,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { wantsAA } from "./msaa.js";

const MODEL = "/assets/market-camera.glb";
const FRAME = { left: -341.5, right: 443.5, top: 467, bottom: -1044 };
const DIST = 5500;

export function mountMarketCamera(host, { reduced = false } = {}) {
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
  const cx = (FRAME.left + FRAME.right) / 2;    // +51
  const cy = (FRAME.top + FRAME.bottom) / 2;    // -288.5
  const frameH = FRAME.top - FRAME.bottom;      // 1511
  const camera = new PerspectiveCamera(
    2 * Math.atan(frameH / 2 / DIST) * 180 / Math.PI, 785 / 1511, 100, 30000);
  camera.position.set(cx, cy, DIST);
  camera.lookAt(cx, cy, 0);

  /* The projector's rig in spirit — but DIRECTIONAL, not point: at mm scale
     (light-to-subject ~1000 units) physically-decayed point lights attenuate
     to black, which is exactly how the first render came out. Directionals
     carry no distance term. */
  scene.add(new AmbientLight(0x9fb4ff, 0.55));
  const rimA = new DirectionalLight(0xa98bff, 2.6);   // cool, behind-left
  rimA.position.set(-900, 650, 350);
  const rimB = new DirectionalLight(0xffd8a0, 1.5);   // warm kick, right
  rimB.position.set(500, 260, 700);
  const key = new DirectionalLight(0xcfd6ff, 1.9);    // soft front key
  key.position.set(150, -80, 1400);
  scene.add(rimA, rimB, key);

  const rig = new Group();       // yaw happens here, about the lens axis x=0
  scene.add(rig);

  const nodes = {};
  let ready = false;
  let raf = 0;
  const state = { yaw: 0, opacity: 1, spin: 0, crank: 0, drift: 0, visible: false };

  new GLTFLoader().load(MODEL, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
        o.material.color = new Color(0x303040);      // the brief's treatment
        o.material.metalness = 0.7;
        o.material.roughness = 0.42;
        o.material.envMapIntensity = 0.35;
      }
    });
    /* The lens is the destination of the push — the PNG painted it as deep
       dark rings and without that identity the fly-in reads as diving into a
       blank panel. Dark glass: near-black, tight highlights. */
    const lensObj = model.getObjectByName("lens");
    if (lensObj) lensObj.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.color = new Color(0x16161f);
        o.material.metalness = 0.85;
        o.material.roughness = 0.22;
      }
    });
    for (const n of ["camera_body", "reel_a", "reel_b", "lens", "crank", "head", "tripod"])
      nodes[n] = model.getObjectByName(n);
    rig.add(model);
    ready = true;
    render(0);
  }, undefined, (e) => console.warn("[marketCamera]", e?.message || e));

  function resize() {
    const w = host.clientWidth || 300;
    const h = Math.round(w * 1511 / 785);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(devicePixelRatio || 1, coarse ? 1 : 1.5);
    renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  resize();
  addEventListener("resize", resize);

  function render(tMs) {
    if (!ready) return;
    const t = tMs / 1000;
    rig.rotation.y = state.yaw
      + (reduced ? 0 : state.drift * Math.sin(t * 0.5) * 0.035);
    rig.position.y = reduced ? 0 : state.drift * Math.sin(t * 0.7) * 6;
    if (nodes.reel_a) nodes.reel_a.rotation.z = state.spin * Math.PI * 2;
    if (nodes.reel_b) nodes.reel_b.rotation.z = -state.spin * Math.PI * 2 * 1.08;
    if (nodes.crank) nodes.crank.rotation.z = state.crank;
    canvas.style.opacity = state.opacity.toFixed(3);
    renderer.render(scene, camera);
  }

  /* Driven from the ONE site ticker via setState; renders only when the act
     is live, and idle drift needs continuous frames only during ENTER. */
  function setState(next, tMs = 0) {
    Object.assign(state, next);
    if (!state.visible) { canvas.style.opacity = "0"; return; }
    render(tMs);
  }

  /** A named node's position in CANVAS FRACTIONS (0..1). The anchors that can
      follow a rotating object — reel/lens screen positions come from here. */
  const v = new Vector3();
  function project(name) {
    const n = nodes[name];
    if (!n) return null;
    n.getWorldPosition(v);
    v.project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  return {
    setState, project, resize, canvas,
    get ready() { return ready; },
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      renderer.dispose();
      canvas.remove();
    },
  };
}
