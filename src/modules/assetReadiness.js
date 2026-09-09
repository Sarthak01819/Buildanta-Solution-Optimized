import { DefaultLoadingManager } from "three";
import cameraUrl from "../assets/market-camera.glb?url";
import billAtlasUrl from "../vendor/mirrbillburn/assets/leather-money-shreds.ktx2?url";

// Observe actual loader work from module startup, including nested GLTF/image
// requests. Do not replace callbacks owned by scene loaders or retain assets.
export function observeAssetReadiness(manager = DefaultLoadingManager) {
  const originalStart = manager.itemStart;
  const originalEnd = manager.itemEnd;
  const originalError = manager.itemError;
  let pending = 0, total = 0, completed = 0, failed = 0, released = false;
  const listeners = new Set();
  const report = () => listeners.forEach((listener) => listener({ pending, total, completed, failed }));
  manager.itemStart = function (url) {
    pending++; total++; report();
    return originalStart.call(this, url);
  };
  manager.itemEnd = function (url) {
    pending = Math.max(0, pending - 1); completed++; report();
    return originalEnd.call(this, url);
  };
  manager.itemError = function (url) {
    failed++; report();
    return originalError.call(this, url);
  };
  return {
    subscribe(listener) { listeners.add(listener); report(); return () => listeners.delete(listener); },
    async idle(maxWaitMs = 12000) {
      // Nested decoders can enqueue another resource at the end of a load.
      // Require a short quiet window without blocking the animation thread.
      let quietSince = performance.now();
      const deadline = quietSince + maxWaitMs;
      while (performance.now() - quietSince < 120 || pending) {
        if (released || performance.now() > deadline) return;
        if (pending) quietSince = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 32));
      }
    },
    release() {
      if (released) return;
      released = true;
      manager.itemStart = originalStart;
      manager.itemEnd = originalEnd;
      manager.itemError = originalError;
      listeners.clear();
    },
    get state() { return { pending, total, completed, failed }; },
  };
}

// Fetch the next heavy binary assets without creating extra WebGL contexts or
// allocating their render targets at boot. Same URLs/bytes as the live loaders.
// Leave caching/revalidation to HTTP; no service worker or stale duplicate URLs.
export async function prepareUpcomingAssets() {
  const urls = [cameraUrl, billAtlasUrl];
  const failed = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.arrayBuffer();
    } catch (error) {
      failed.push(url);
      console.info("[preload] upcoming asset will retry on entry:", error?.message || error);
    }
  }
  return { failed };
}
