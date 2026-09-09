import { createZeroMirrorStage } from "./zeroMirrorStage.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/* The source-stage lifecycle extracted from ConsultHand's production branch.
   The caller retains the exact renderer/AA/color-space/DPR configuration; this
   host avoids constructing and compiling the archived globe and money scene. */
export function createZeroSourceHand(canvas, renderer, options, handPixelRatio) {
  const zeroMirrorStage = createZeroMirrorStage(renderer, {
    reducedMotion: options.reducedMotion === true,
  });

  let visibility = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let entryProgress = 0;
  let entryVisibility = 0;
  let bufferReleased = false;
  let disposed = false;

  const onPointer = (event) => {
    pointerTargetX = (event.clientX / innerWidth) * 2 - 1;
    pointerTargetY = (event.clientY / innerHeight) * 2 - 1;
  };
  addEventListener("pointermove", onPointer, { passive: true });

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(handPixelRatio());
    renderer.setSize(width, height, false);
    zeroMirrorStage.resize(width, height);
  }

  function setProgress(_value, opacity = 1, entry = null) {
    visibility = clamp01(opacity);
    entryProgress = clamp01(entry?.progress ?? 0);
    entryVisibility = clamp01(entry?.opacity ?? 0);
  }

  function render(time = 0) {
    if (visibility < 0.002) {
      canvas.style.opacity = "0";
      if (!bufferReleased) { bufferReleased = true; canvas.width = 1; canvas.height = 1; }
      return;
    }
    if (bufferReleased) { bufferReleased = false; resize(); }
    pointerX += (pointerTargetX - pointerX) * 0.04;
    pointerY += (pointerTargetY - pointerY) * 0.04;
    zeroMirrorStage.update({
      progress: entryProgress,
      opacity: entryVisibility,
      pointerX,
      pointerY,
      time,
    });

    canvas.style.opacity = entryVisibility > 0.001 ? String(visibility) : "0";
    if (entryVisibility > 0.001) zeroMirrorStage.render({ clear: true });
  }

  const api = {
    setProgress,
    render,
    resize,
    // This flag affects only the archived scene in ConsultHand.
    setWorldCut() {},
    ready: null,
    async warm() {
      await api.ready;
      if (!disposed) await zeroMirrorStage.warm?.();
      return api;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeEventListener("pointermove", onPointer);
      zeroMirrorStage.dispose();
      renderer.dispose();
    },
  };

  resize();
  api.ready = zeroMirrorStage.ready.then(() => api);
  return api;
}
