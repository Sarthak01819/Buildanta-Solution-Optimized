/**
 * Compile a scene's shaders WITHOUT blocking the page (D-109).
 *
 * three links a program the first time a material is drawn, and the first
 * use then waits for the driver synchronously — measured at ~3.9 s of the
 * loader's blocked time (`getUniforms`), mostly the orb's simulation passes.
 * `renderer.compileAsync` starts the same compiles and polls
 * KHR_parallel_shader_compile instead of waiting.
 *
 * The trick that keeps this generic: for the length of `drawFrame`, every
 * `renderer.render(scene, camera)` becomes `renderer.compileAsync(scene,
 * camera)`. The module runs its NORMAL frame, so every pass is compiled with
 * the render target it really uses (three keys programs on it — compile
 * against the wrong target and the real frame compiles again). Nothing is
 * drawn.
 *
 * ⚠️ The frame's CPU side still runs. A ping-pong target (read/write swap)
 * is swapped without being written, so callers with ping-pong state run
 * `drawFrame` an EVEN number of times (see orb-hero) to land back where they
 * started.
 */
/**
 * Send every texture a scene uses to the GPU ahead of its first frame, one
 * per task, decoding each image off the main thread first (D-109). The first
 * draw otherwise decodes + uploads them all at once — the hitch that landed
 * inside the BZ page transition. Desktop only: on a phone this raises the
 * memory peak, and phones have crashed on memory before (see intro.js).
 */
export async function uploadTextures(renderer, scene) {
  if (matchMedia("(pointer: coarse)").matches || typeof renderer?.initTexture !== "function") return;
  const seen = new Set();
  const collect = (v) => { if (v?.isTexture && !seen.has(v)) seen.add(v); };
  scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      Object.values(m).forEach(collect);
      if (m.uniforms) Object.values(m.uniforms).forEach((u) => collect(u?.value));
    }
  });
  for (const tex of seen) {
    try {
      if (typeof tex.image?.decode === "function") await tex.image.decode().catch(() => {});
      renderer.initTexture(tex);
    } catch { /* uploaded on first draw instead, as before */ }
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function prepareFrame(renderer, drawFrame, times = 1) {
  if (typeof renderer?.compileAsync !== "function") return Promise.resolve();
  const jobs = [];
  const render = renderer.render;
  renderer.render = (scene, camera) => {
    try { jobs.push(renderer.compileAsync(scene, camera)); } catch { /* drawn normally later */ }
  };
  try {
    for (let i = 0; i < times; i++) drawFrame();
  } catch (e) {
    console.info("[prepare] frame skipped:", e?.message || e);
  } finally {
    renderer.render = render;
  }
  /* D-116: capped. On a context the phone budget has switched off, three's
     readiness poll never completes — never let that hold a scene back. */
  return Promise.race([
    Promise.all(jobs),
    new Promise((r) => setTimeout(r, 6000)),
  ]).then(() => {}, () => {});
}
