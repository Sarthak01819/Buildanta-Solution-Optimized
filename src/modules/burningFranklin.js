import { DefaultLoadingManager } from "three";
import { createConsultHand } from "../vendor/burning-franklin/src/gl/ConsultHand.js";
import billUrl from "../vendor/burning-franklin/assets/bill-franklin.jpg";
import handUrl from "../vendor/burning-franklin/assets/consult-hand-v2.png";
import plantUrl from "../vendor/burning-franklin/assets/consult-plant-atlas-v3.png";
import ecologyUrl from "../vendor/burning-franklin/assets/consult-ecology-atlas-v1.png";
import birdUrl from "../vendor/burning-franklin/assets/consult-paper-bird-v1.png";

const SOURCE_START = 0.84;
const SOURCE_END = 1;
const TEXTURE_URLS = [billUrl, handUrl, plantUrl, ecologyUrl, birdUrl];
const clamp01 = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * The supplied renderer uses Three's default manager and exposes no loading
 * promise. Its progress callback runs after TextureLoader has assigned the
 * image and called the renderer's own onLoad callback. Observe only these five
 * bundled URLs, preserving the site's callbacks and restoring them afterward.
 */
function observeTextures(onReady, onFailure) {
  const manager = DefaultLoadingManager;
  const pending = new Set(TEXTURE_URLS.map((url) => manager.resolveURL(url)));
  const previousProgress = manager.onProgress;
  const previousError = manager.onError;

  function release() {
    if (manager.onProgress === onProgress) manager.onProgress = previousProgress;
    if (manager.onError === onError) manager.onError = previousError;
  }

  function onProgress(url, loaded, total) {
    try {
      previousProgress?.call(this, url, loaded, total);
    } finally {
      if (pending.delete(url) && pending.size === 0) {
        release();
        onReady();
      }
    }
  }

  function onError(url) {
    try {
      previousError?.call(this, url);
    } finally {
      if (pending.has(url)) {
        release();
        onFailure(new Error(`Burning Franklin texture failed to load: ${url}`));
      }
    }
  }

  manager.onProgress = onProgress;
  manager.onError = onError;
  return release;
}

/**
 * Runs the supplied standalone's exact 0.84 -> 1.0 window. The parent owns
 * progress, opacity, resize events, and the only animation ticker; time is in
 * seconds. `ready` waits for all five source textures, not unrelated site work.
 */
export function createBurningFranklin(canvas) {
  if (!canvas) return null;

  let disposed = false;
  let renderer;
  let resolveReady;
  let rejectReady;
  const state = {
    progress: 0,
    sourceProgress: SOURCE_START,
    opacity: 0,
    source: "burningfranklin",
    ready: false,
  };
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Preserve rejection for the caller while avoiding an unhandled-rejection
  // window if a lazy parent attaches its handler after construction.
  ready.catch(() => {});
  canvas.style.opacity = "0";
  const releaseObserver = observeTextures(() => {
    if (disposed) return;
    state.ready = true;
    resolveReady();
  }, rejectReady);

  try {
    renderer = createConsultHand(canvas);
    renderer.setWorldCut(true);
    renderer.setProgress(SOURCE_START, 0);
  } catch (error) {
    releaseObserver();
    renderer?.dispose();
    rejectReady(error);
    throw error;
  }

  return {
    ready,
    get state() { return { ...state }; },
    setProgress(progress, opacity = 1) {
      if (disposed) return;
      state.progress = clamp01(progress);
      state.sourceProgress = SOURCE_START + (SOURCE_END - SOURCE_START) * state.progress;
      state.opacity = clamp01(opacity);
      renderer.setProgress(state.sourceProgress, state.opacity);
      if (!state.ready || state.opacity < 0.002) canvas.style.opacity = "0";
    },
    render(seconds = 0) {
      if (disposed || !state.ready || state.opacity < 0.002) return;
      renderer.render(seconds);
    },
    resize() {
      if (!disposed) renderer.resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      state.ready = false;
      state.opacity = 0;
      canvas.style.opacity = "0";
      releaseObserver();
      rejectReady(new DOMException("Burning Franklin was disposed before loading completed.", "AbortError"));
      renderer.dispose();
    },
  };
}
