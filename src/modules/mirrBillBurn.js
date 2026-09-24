import { Scene, PerspectiveCamera, WebGLRenderer, SRGBColorSpace, Vector3 } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { createBillBurn, BILL_SPECS, BURN_PHASE, BILL_CULL } from "../vendor/mirrbillburn/billBurn.js";
import { createLensBlurPass } from "../gl/lensBlurPass.js";
import { createBillEmbers } from "../gl/billEmbers.js";
import { createBillPortal, PORTAL_FADE_END, stillHeightFraction } from "./billPortal.js";
import atlasUrl from "../vendor/mirrbillburn/assets/leather-money-shreds.ktx2?url";

const clamp01 = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const smoothstep = (start, end, value) => {
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};
const hv = (x, a, b) => clamp01((x - a) / (b - a));
const HERO_WIDTH = 0.345;
const HERO_HEIGHT = 0.15;
/* The arrival dissolve: parent progress 0 -> .03 fades the canvas in over
   the frozen fists while the note already stands at its t = 0 pose. Our
   stand-in for the mirror's leather-on-leather hard cut (D-076). */
export const ARRIVAL_END = 0.03;
const SCROLL_TIME_SECONDS = 12;
/* Frozen randomness (the vendored scene rolls Math.random per note and per
   ember at construction; the reference does the same per session). One seed
   makes every reload, every test and every reverse frame identical. */
const SEED = 0xb111b0a7;
const SEED_SOURCE = "mulberry32:b111b0a7";
/* The hero's rotSeed decides its drift speed and the F4 tilt direction; the
   band [.8, .94) keeps "top edge farther, right side nearer" at t .046 and
   the fastest drift toward the camera, which keeps the note covering a phone
   viewport longest during the concealed swap. */
const HERO_SEED_MIN = 0.8;
const HERO_SEED_MAX = 0.94;
/* The approved burn's lens (D-072/D-073 shipped the whole beat at fov 50).
   The reference's F1..F5 run at its own 30 (40 on phones); the lens eases
   from the reference's to the approved one across [PORTAL_END, SETTLE_END]
   (t .056 -> .105, after the circle is gone and before the hero burns), so
   the existing burn resumes at exactly the framing Yash approved (D-076 r2,
   integration judge). */
export const BURN_FOV = 50;
/* Parent progress -> the mirror's stage-local progress t (0 .. BILL_CULL). */
export const tForProgress = (progress) => clamp01((progress - ARRIVAL_END) / (1 - ARRIVAL_END)) * BILL_CULL;
export const progressForT = (t) => ARRIVAL_END + clamp01(t / BILL_CULL) * (1 - ARRIVAL_END);
/* Phase boundaries in parent progress: the circle is gone at t .056; the hero
   note starts burning at r = burnStart (t = .105). */
export const PORTAL_END = progressForT(PORTAL_FADE_END);
export const SETTLE_END = progressForT(BILL_SPECS[0].burnStart * BURN_PHASE);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hosts the supplied mirrbillburn scene without its scroll controls or ticker,
 * entered the way the reference enters its bill stage (D-076, replaces the
 * D-072/D-073 flat cover):
 *
 *   progress 0 -> .03   arrival: the canvas dissolves in; the note stands at
 *                       the vendored path's start (camera z .19, fov 30/40)
 *                       with the portal circle showing the baked fists still
 *                       1:1 over the live fists.
 *   .03 -> .166         portal: the circle fades (1 - hv(t, 0, .056)) and
 *                       Franklin shows through; camera pulls back to z .48,
 *                       rolls to 14.4 deg; embers fade in.
 *   .166 -> .285        settle: pull-back continues; the hero ripples; the
 *                       lens eases 30/40 -> the approved 50 (BURN_FOV).
 *   .285 -> 1           burn (vendored, unchanged, at fov 50), culled at t .4.
 *
 * t = (progress - .03) / .97 * BILL_CULL feeds the vendored setProgress /
 * applyCamera unchanged. Every frame is a pure function of `progress`: the
 * shader clocks derive from it, the seeds are frozen, the still is baked
 * before the beat. A stationary scroll position produces a frozen frame.
 * `ready` resolves after the atlas is decoded, uploaded, and the shaders
 * compile; load failures and disposal during loading reject it.
 */
export function createMirrBillBurn(canvas) {
  if (!canvas) return null;

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  /* the mirror's lens: fov 30, 40 on widths <= 768 (ck(), main.pretty.js l.47737) */
  const camera = new PerspectiveCamera(30, 1, 0.01, 100);
  const coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const lens = createLensBlurPass(renderer, { levels: coarsePointer ? 2 : 3 });
  // Both decoder files hash-match the supplied public/vendor/basis files.
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(`${import.meta.env.BASE_URL}zero-stage/basis/`)
    .detectSupport(renderer);
  const atlasRequest = new AbortController();

  let disposed = false;
  let loaderReleased = false;
  let burn = null;
  let atlas = null;
  let portal = null;
  let embers = null;
  let pendingStill = null;
  let baseFov = 30;
  const viewCorner = new Vector3();
  const portalPoint = new Vector3();
  const heroCorners = [
    [-HERO_WIDTH / 2, -HERO_HEIGHT / 2],
    [HERO_WIDTH / 2, -HERO_HEIGHT / 2],
    [HERO_WIDTH / 2, HERO_HEIGHT / 2],
    [-HERO_WIDTH / 2, HERO_HEIGHT / 2],
  ];
  let resolveReady;
  let rejectReady;
  const state = {
    source: "mirrbillburn",
    progress: 0,
    sourceProgress: 0,
    phase: "hidden",
    animationTime: 0,
    viewport: { width: 1, height: 1 },
    ready: false,
    opacity: 0,
  };
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // The parent may attach its error handler after this lazy module returns.
  ready.catch(() => {});
  canvas.style.opacity = "0";

  function viewFov(width) {
    return width <= 768 ? 40 : 30;
  }

  /* 0 while the reference lens holds (through F5), 1 from the hero burn on */
  function lensBlendFor(progress) {
    return smoothstep(PORTAL_END, SETTLE_END, progress);
  }

  function apply() {
    if (!burn) return;
    burn.setProgress(state.sourceProgress, state.animationTime);
    embers?.setProgress(state.sourceProgress, state.animationTime);
    burn.applyCamera(camera, state.sourceProgress);
    const fov = baseFov + (BURN_FOV - baseFov) * lensBlendFor(state.progress);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    burn.group.updateMatrixWorld(true);
    if (portal) {
      portal.setOpacity(1 - hv(state.sourceProgress, 0, PORTAL_FADE_END));
      portal.follow(burn.meshes[0]);
    }
  }

  /* The medallion's projected ellipse (NDC centre + radii), so a capture can
     mask the fists inside it. The circle faces the camera at t = 0; later
     the radii are the projected axis extents, still a fair mask. */
  function getPortalBounds() {
    if (!portal || !burn) return null;
    const mesh = portal.mesh;
    const project = (x, y) => {
      portalPoint.set(x, y, 0).applyMatrix4(mesh.matrixWorld).project(camera);
      return { x: portalPoint.x, y: portalPoint.y };
    };
    const centre = project(0, 0);
    const right = project(0.06, 0), left = project(-0.06, 0);
    const top = project(0, 0.06), bottom = project(0, -0.06);
    return {
      space: "ndc",
      cx: centre.x, cy: centre.y,
      rx: Math.abs(right.x - left.x) / 2,
      ry: Math.abs(top.y - bottom.y) / 2,
      visible: portal.state.visible,
    };
  }

  /* Point-in-convex-quad test of the four viewport corners against the hero
     note's projected corners. The note is rolled and tilted from t = 0 on, so
     an axis-aligned bbox would pass a rotated note whose corners leave the
     viewport open; the polygon test does not. */
  function getCoverBounds() {
    if (!burn) return null;
    const hero = burn.meshes[0];
    let allInFront = true;
    const corners = heroCorners.map(([x, y]) => {
      viewCorner.set(x, y, 0).applyMatrix4(hero.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      if (viewCorner.z > -camera.near) allInFront = false;
      viewCorner.applyMatrix4(camera.projectionMatrix);
      return { x: viewCorner.x, y: viewCorner.y };
    });
    const left = Math.min(...corners.map((corner) => corner.x));
    const right = Math.max(...corners.map((corner) => corner.x));
    const bottom = Math.min(...corners.map((corner) => corner.y));
    const top = Math.max(...corners.map((corner) => corner.y));
    const inside = (px, py) => {
      let sign = 0;
      for (let i = 0; i < corners.length; i += 1) {
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
        if (Math.abs(cross) < 1e-12) continue;
        const s = Math.sign(cross);
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
      }
      return true;
    };
    const viewportCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    return {
      // The viewport is [-1, 1] on each axis. These are the actual hero plane's
      // projected corners; they exclude shader waves (uWaveAmp is 0 until t .07).
      space: "ndc",
      test: "polygon",
      left, right, bottom, top, corners,
      coversViewport: hero.visible && allInFront
        && viewportCorners.every(([px, py]) => inside(px, py)),
    };
  }

  function releaseLoader() {
    if (loaderReleased) return;
    loaderReleased = true;
    // init() creates a worker URL asynchronously. Wait for it to settle before
    // disposing, so a late transcoder response cannot recreate leaked resources.
    Promise.resolve(ktx2.transcoderPending)
      .catch(() => {})
      .then(() => ktx2.dispose());
  }

  function releaseScene() {
    if (portal) {
      scene.remove(portal.mesh);
      portal.dispose();
      portal = null;
    }
    if (embers) {
      embers.points.parent?.remove(embers.points);
      embers.dispose();
      embers = null;
    }
    if (burn) {
      scene.remove(burn.group);
      burn.dispose();
      burn = null;
    }
    atlas?.dispose();
    atlas = null;
  }

  function resize(width = window.innerWidth, height = window.innerHeight) {
    if (disposed) return;
    const w = Math.max(1, Number.isFinite(width) ? width : window.innerWidth);
    const h = Math.max(1, Number.isFinite(height) ? height : window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    lens.resize(w, h, pixelRatio);
    state.viewport = { width: w, height: h };
    camera.aspect = w / h;
    baseFov = viewFov(w);
    camera.fov = baseFov;
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
    portal?.setViewFov(baseFov);
    embers?.setPixelRatio(pixelRatio);
    apply();
  }
  resize();

  /* The notes' seeds come first from the frozen stream (so the hero's tilt
     is the one judged against F4); the embers draw after them. */
  function freezeSeeds() {
    const random = mulberry32(SEED);
    burn.meshes.forEach((mesh, index) => {
      const seed = random();
      mesh.userData.rotSeed = index === 0
        ? HERO_SEED_MIN + seed * (HERO_SEED_MAX - HERO_SEED_MIN)
        : seed;
    });
    return random;
  }

  async function loadAtlas() {
    try {
      // Fetch the atlas separately so disposal can cancel only this instance's
      // request. The shared decoder URLs can finish for other site loaders.
      const atlasData = fetch(atlasUrl, { signal: atlasRequest.signal }).then((response) => {
        if (!response.ok) throw new Error(`mirrbillburn atlas failed to load (${response.status}).`);
        return response.arrayBuffer();
      });
      const [buffer] = await Promise.all([atlasData, ktx2.init()]);
      if (disposed) return;
      const texture = await new Promise((resolve, reject) => ktx2.parse(buffer, resolve, reject));
      if (disposed) {
        texture.dispose();
        return;
      }

      atlas = texture;
      atlas.colorSpace = SRGBColorSpace;
      if (renderer.capabilities.getMaxAnisotropy) {
        atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
      /* the vendored PointsMaterial embers are replaced by the mirror's own
         ember shader (src/gl/billEmbers.js) — host side, vendor verbatim */
      burn = createBillBurn(atlas, { withEmbers: false });
      const random = freezeSeeds();
      embers = createBillEmbers({ random, pixelRatio: renderer.getPixelRatio() });
      burn.group.add(embers.points);
      scene.add(burn.group);
      portal = createBillPortal(atlas);
      portal.setViewFov(baseFov);
      if (pendingStill) {
        portal.setStill(pendingStill);
        pendingStill = null;
      }
      scene.add(portal.mesh);
      apply();
      renderer.initTexture(atlas);
      renderer.compile(scene, camera);
      /* one hidden pass so the lens/composite programs link now, not on the
         first visible frame of the beat */
      lens.render(scene, camera);
      state.ready = true;
      canvas.style.opacity = String(state.opacity);
      resolveReady();
    } catch (error) {
      if (!disposed) {
        disposed = true;
        state.ready = false;
        state.opacity = 0;
        canvas.style.opacity = "0";
        atlasRequest.abort();
        releaseScene();
        lens.dispose();
        renderer.dispose();
        rejectReady(error);
      }
    } finally {
      releaseLoader();
    }
  }
  void loadAtlas();

  function stillSizeFor(heightFraction) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(256, Math.min(2048, Math.round(heightFraction * state.viewport.height * pixelRatio)));
  }

  return {
    ready,
    /** D-091: each note's burn progress (0 hidden), cheap enough per frame */
    burnLevels() {
      return burn ? burn.meshes.map((m) => (m.visible ? m.material.uniforms.uBurnProgress.value : 0)) : [];
    },
    get state() {
      const heightFraction = stillHeightFraction(baseFov);
      return {
        ...state,
        viewport: { ...state.viewport },
        geometry: {
          type: "PlaneGeometry",
          width: HERO_WIDTH,
          height: HERO_HEIGHT,
          widthSegments: 16,
          heightSegments: 8,
        },
        fov: camera.fov,
        baseFov,
        burnFov: BURN_FOV,
        lensBlend: lensBlendFor(state.progress),
        mapping: { arrivalEnd: ARRIVAL_END, cull: BILL_CULL, portalEnd: PORTAL_END, settleEnd: SETTLE_END },
        seedSource: SEED_SOURCE,
        lens: { iterations: lens.iterations, focalRadius: lens.focalRadius, falloff: lens.falloff },
        portal: portal ? portal.state : {
          opacity: 1, visible: false, still: pendingStill ? "pending" : "leather-only",
          stillSize: pendingStill?.size ?? 0, heightFraction,
        },
        coverBounds: getCoverBounds(),
        portalBounds: getPortalBounds(),
        embers: embers?.state ?? null,
        noteCount: burn?.meshes.length ?? 0,
        visibleNotes: burn?.meshes.filter((mesh) => mesh.visible).length ?? 0,
        burnPhase: Math.min(state.sourceProgress / BURN_PHASE, 1),
        cameraRoll: camera.rotation.z * 180 / Math.PI,
        cameraPosition: camera.position.toArray(),
        notePoses: burn?.meshes.map((mesh) => ({
          position: mesh.position.toArray(),
          quaternion: mesh.quaternion.toArray(),
          scale: mesh.scale.toArray(),
          visible: mesh.visible,
          burnProgress: mesh.material.uniforms.uBurnProgress.value,
          waveAmplitude: mesh.material.uniforms.uWaveAmp.value,
          shaderTime: mesh.material.uniforms.uTime.value,
        })) ?? [],
      };
    },
    /* What the portal wants baked for the current lens and viewport. */
    get stillRequest() {
      const heightFraction = stillHeightFraction(baseFov);
      return { heightFraction, size: stillSizeFor(heightFraction) };
    },
    /* Install (or clear with null) the fists still. Idempotent; safe before
       the atlas is ready — it is applied when the portal is built. */
    setPortalStill(bake) {
      if (disposed) return;
      if (portal) portal.setStill(bake);
      else pendingStill = bake;
    },
    setProgress(progress, opacity = 1) {
      if (disposed) return;
      state.progress = clamp01(progress);
      state.sourceProgress = tForProgress(state.progress);
      state.animationTime = state.sourceProgress / BILL_CULL * SCROLL_TIME_SECONDS;
      state.phase = state.progress === 0 ? "hidden"
        : state.progress < ARRIVAL_END ? "arrival"
          : state.progress < PORTAL_END ? "portal"
            : state.progress < SETTLE_END ? "settle"
              : state.progress < 1 ? "burn" : "complete";
      state.opacity = clamp01(opacity)
        * smoothstep(0, ARRIVAL_END, state.progress)
        * (1 - smoothstep(0.9, 1, state.progress));
      apply();
      canvas.style.opacity = state.ready ? String(state.opacity) : "0";
    },
    render() {
      if (disposed) return;
      if (!state.ready || state.opacity < 0.002) return;
      apply();
      lens.render(scene, camera);
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      state.ready = false;
      state.opacity = 0;
      canvas.style.opacity = "0";
      atlasRequest.abort();
      rejectReady(new DOMException("mirrbillburn was disposed before loading completed.", "AbortError"));
      releaseLoader();
      releaseScene();
      lens.dispose();
      renderer.dispose();
    },
  };
}
