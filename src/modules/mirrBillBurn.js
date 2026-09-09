import { Scene, PerspectiveCamera, WebGLRenderer, SRGBColorSpace, Quaternion, Vector3 } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { createBillBurn, BURN_PHASE, BILL_CULL } from "../vendor/mirrbillburn/billBurn.js";
import atlasUrl from "../vendor/mirrbillburn/assets/leather-money-shreds.ktx2?url";

const clamp01 = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const smoothstep = (start, end, value) => {
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};
const HERO_WIDTH = 0.345;
const HERO_HEIGHT = 0.15;
const COVER_MARGIN = 1.2;
const ARRIVAL_END = 0.04;
const COVER_END = 0.075;
const POSE_BLEND_END = 0.23;
const SCROLL_TIME_SECONDS = 12;
const HERO_CENTER = new Vector3(0.022, 0, 0);
const FLAT_ROTATION = new Quaternion();

/**
 * Hosts the supplied mirrbillburn scene without its scroll controls or ticker.
 * Parent progress first brings in one intact, viewport-covering source note.
 * After a brief cover at 0.075, progress maps to source 0..BILL_CULL (0.4), including the entire
 * burn and excluding the standalone's empty tail. All animation time comes
 * from that progress, so a stationary scroll position produces a frozen frame.
 * `ready` resolves after the atlas is decoded, uploaded, and the shaders compile;
 * load failures and disposal during loading reject it.
 */
export function createMirrBillBurn(canvas) {
  if (!canvas) return null;

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.01, 100);
  // Both decoder files hash-match the supplied public/vendor/basis files.
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(`${import.meta.env.BASE_URL}zero-stage/basis/`)
    .detectSupport(renderer);
  const atlasRequest = new AbortController();

  let disposed = false;
  let loaderReleased = false;
  let burn = null;
  let atlas = null;
  const coverPosition = new Vector3();
  const projectedCorner = new Vector3();
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
    poseBlend: 0,
    supportingNoteScale: 0,
    coverDistance: 0,
    coverMargin: COVER_MARGIN,
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

  function apply() {
    if (!burn) return;
    burn.setProgress(state.sourceProgress, state.animationTime);
    burn.applyCamera(camera, state.sourceProgress);

    // A plane covers the viewport when both projected dimensions exceed it.
    // Taking the smaller fitting distance crops the long dimension, like
    // object-fit: cover. Overscan also keeps the atlas border offscreen.
    const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
    state.coverDistance = Math.min(
      HERO_HEIGHT / (2 * tanHalfFov),
      HERO_WIDTH / (2 * tanHalfFov * camera.aspect),
    ) / COVER_MARGIN;
    coverPosition.set(HERO_CENTER.x, HERO_CENTER.y, state.coverDistance);
    camera.position.lerp(coverPosition, 1 - state.poseBlend);
    camera.quaternion.slerp(FLAT_ROTATION, 1 - state.poseBlend);
    // Very wide viewports can require a cover distance below the source near
    // plane. Keep the intact note in front of it even at extreme aspect ratios.
    const near = Math.min(0.01, state.coverDistance * 0.1);
    if (camera.near !== near) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }

    const hero = burn.meshes[0];
    hero.position.lerp(HERO_CENTER, 1 - state.poseBlend);
    hero.quaternion.slerp(FLAT_ROTATION, 1 - state.poseBlend);
    hero.material.uniforms.uWaveAmp.value *= state.poseBlend;
    burn.meshes.forEach((mesh, index) => {
      if (index === 0) return;
      mesh.scale.setScalar(mesh.userData.sourceScale * state.supportingNoteScale);
      mesh.visible = mesh.visible && state.supportingNoteScale > 0;
    });
    camera.updateMatrixWorld();
    burn.group.updateMatrixWorld(true);
  }

  function getCoverBounds() {
    if (!burn) return null;
    const hero = burn.meshes[0];
    const corners = heroCorners.map(([x, y]) => {
      projectedCorner.set(x, y, 0).applyMatrix4(hero.matrixWorld).project(camera);
      return { x: projectedCorner.x, y: projectedCorner.y };
    });
    const left = Math.min(...corners.map((corner) => corner.x));
    const right = Math.max(...corners.map((corner) => corner.x));
    const bottom = Math.min(...corners.map((corner) => corner.y));
    const top = Math.max(...corners.map((corner) => corner.y));
    return {
      // The viewport is [-1, 1] on each axis. These are the actual hero plane's
      // projected corners; they exclude shader waves after the cover phase.
      space: "ndc",
      left, right, bottom, top, corners,
      coversViewport: state.poseBlend === 0 && hero.visible
        && left <= -1 && right >= 1 && bottom <= -1 && top >= 1,
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    state.viewport = { width: w, height: h };
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    apply();
  }
  resize();

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
      burn = createBillBurn(atlas, { withEmbers: true });
      burn.meshes.forEach((mesh) => {
        mesh.userData.sourceScale = mesh.scale.x;
      });
      scene.add(burn.group);
      apply();
      renderer.initTexture(atlas);
      renderer.compile(scene, camera);
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
        renderer.dispose();
        rejectReady(error);
      }
    } finally {
      releaseLoader();
    }
  }
  void loadAtlas();

  return {
    ready,
    get state() {
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
        coverBounds: getCoverBounds(),
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
    setProgress(progress, opacity = 1) {
      if (disposed) return;
      state.progress = clamp01(progress);
      state.sourceProgress = clamp01((state.progress - COVER_END) / (1 - COVER_END)) * BILL_CULL;
      state.animationTime = state.sourceProgress / BILL_CULL * SCROLL_TIME_SECONDS;
      state.poseBlend = smoothstep(COVER_END, POSE_BLEND_END, state.progress);
      state.supportingNoteScale = state.poseBlend;
      state.phase = state.progress === 0 ? "hidden"
        : state.progress < ARRIVAL_END ? "arrival"
          : state.progress <= COVER_END ? "cover"
            : state.progress < POSE_BLEND_END ? "recede"
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
      renderer.render(scene, camera);
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
      renderer.dispose();
    },
  };
}
