// The render engine: owns the GL context, programs, and render targets, and
// draws one complete frame (scene → bloom pyramid → grade) on demand.
// Everything time-dependent takes an explicit clock so renderAt(ms) is exact.

import { CONFIG, SHADER_V } from './config.js';
import { createGL, compileProgram, makeTarget, disposeTarget, drawFullscreen } from './gl.js';

const D2R = Math.PI / 180;

async function fetchShader(name) {
  const res = await fetch(`src/shaders/${name}.glsl?v=${SHADER_V}`);
  if (!res.ok) throw new Error(`shader fetch failed: ${name}`);
  return res.text();
}

export async function createBlackhole(canvas, opts = {}) {
  const ctx = createGL(canvas);
  if (!ctx) return null;
  const { gl, hdr } = ctx;

  // Shaders can be injected (bundlers: import with ?raw and pass strings);
  // standalone pages keep the fetch path.
  const S = opts.shaders;
  const [vert, sceneF, preF, downF, upF, compF] = S
    ? [S.vert, S.scene, S.prefilter, S.down, S.up, S.composite]
    : await Promise.all([
        'fullscreen.vert', 'scene.frag', 'bloom_prefilter.frag',
        'bloom_down.frag', 'bloom_up.frag', 'composite.frag',
      ].map(fetchShader));

  const pScene = compileProgram(gl, vert, sceneF, 'scene');
  const pPre = compileProgram(gl, vert, preF, 'prefilter');
  const pDown = compileProgram(gl, vert, downF, 'down');
  const pUp = compileProgram(gl, vert, upF, 'up');
  const pComp = compileProgram(gl, vert, compF, 'composite');

  // ---- render targets -----------------------------------------------------
  // Allocated here and ONLY here. Callers resize through size(), which is
  // debounced upstream — a bloom chain that reallocates per frame leaks the
  // GPU dry in seconds (learned the hard way).
  let T = { scene: null, mips: [], ups: [] };
  let W = 0, H = 0;

  function size(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    disposeTarget(gl, T.scene);
    T.mips.forEach((t) => disposeTarget(gl, t));
    T.ups.forEach((t) => disposeTarget(gl, t));
    T = { scene: makeTarget(gl, w, h, hdr), mips: [], ups: [] };
    let mw = w >> 1, mh = h >> 1;
    while (mw >= 8 && mh >= 8 && T.mips.length < 7) {
      T.mips.push(makeTarget(gl, mw, mh, hdr));
      T.ups.push(makeTarget(gl, mw, mh, hdr));
      mw >>= 1; mh >>= 1;
    }
    canvas.width = w;
    canvas.height = h;
  }

  function bindTarget(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.viewport(0, 0, t ? t.w : W, t ? t.h : H);
  }

  function bindTex(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  // ---- one full frame -----------------------------------------------------
  // state: { tSec, yawRad, pitchRad, breath (0..1), cursorBoost (0..1),
  //          reduced (bool) }
  function render(state) {
    const C = CONFIG;
    const breathDisk = 1 + (state.breath - 0.5) * 2 * C.breathing.diskDepth;
    const breathBloom = 1 + (state.breath - 0.5) * 2 * C.breathing.bloomDepth;
    const boost = 1 + state.cursorBoost * C.cursor.boost;

    // 1 — scene (HDR)
    bindTarget(T.scene);
    pScene.use();
    gl.uniform2f(pScene.loc('uRes'), W, H);
    gl.uniform1f(pScene.loc('uTime'), state.tSec);
    gl.uniform1i(pScene.loc('uSteps'), C.quality.steps);
    gl.uniform1f(pScene.loc('uCamDist'),
      (C.camera.dist + (state.distOffset || 0)) * (state.distMul || 1));
    gl.uniform1f(pScene.loc('uFovY'), C.camera.fovYDeg * D2R);
    gl.uniform1f(pScene.loc('uFrameY'), C.camera.frameY || 0);
    gl.uniform1f(pScene.loc('uPitch'), C.camera.pitchDeg * D2R + state.pitchRad);
    gl.uniform1f(pScene.loc('uYaw'), C.camera.yawDeg * D2R + state.yawRad);
    gl.uniform1f(pScene.loc('uRoll'), C.camera.rollDeg * D2R);
    gl.uniform1f(pScene.loc('uDiskRIn'), C.disk.rIn);
    gl.uniform1f(pScene.loc('uDiskROut'), C.disk.rOut);
    gl.uniform1f(pScene.loc('uDiskGain'), C.disk.gain * breathDisk);
    gl.uniform1f(pScene.loc('uHotRim'), C.disk.hotRim);
    gl.uniform1f(pScene.loc('uOmega0'), C.disk.omega0);
    gl.uniform1f(pScene.loc('uShearPeriod'), C.disk.shearPeriod);
    gl.uniform1f(pScene.loc('uDoppler'), C.disk.doppler);
    gl.uniform1f(pScene.loc('uTurbContrast'), C.disk.turbContrast);
    gl.uniform1f(pScene.loc('uAlphaGain'), C.disk.alphaGain);
    gl.uniform3fv(pScene.loc('uColHot'), C.colors.hot);
    gl.uniform3fv(pScene.loc('uColMid'), C.colors.mid);
    gl.uniform3fv(pScene.loc('uColOuter'), C.colors.outer);
    gl.uniform3fv(pScene.loc('uColRim'), C.colors.rim);
    gl.uniform1f(pScene.loc('uRingGain'), C.ring.gain * boost);
    gl.uniform1f(pScene.loc('uRingWidth'), C.ring.width);
    gl.uniform1f(pScene.loc('uStarDensity'), C.stars.density);
    gl.uniform1f(pScene.loc('uStarGain'), C.stars.gain);
    gl.uniform1f(pScene.loc('uTwinkle'), state.reduced ? 0 : C.stars.twinkle);
    gl.uniform1f(pScene.loc('uHazeGain'), C.stars.hazeGain);
    drawFullscreen(gl);

    // 2 — bloom prefilter into mip 0
    bindTarget(T.mips[0]);
    pPre.use();
    bindTex(0, T.scene.tex, pPre.loc('uTex'));
    gl.uniform1f(pPre.loc('uThreshold'), CONFIG.bloom.threshold);
    gl.uniform1f(pPre.loc('uKnee'), CONFIG.bloom.knee);
    drawFullscreen(gl);

    // 3 — downsample chain
    for (let i = 1; i < T.mips.length; i++) {
      bindTarget(T.mips[i]);
      pDown.use();
      bindTex(0, T.mips[i - 1].tex, pDown.loc('uTex'));
      gl.uniform2f(pDown.loc('uTexel'), 1 / T.mips[i - 1].w, 1 / T.mips[i - 1].h);
      drawFullscreen(gl);
    }

    // 4 — upsample chain (deepest first; wideBoost weights the film halo)
    const N = T.mips.length;
    for (let i = N - 2; i >= 0; i--) {
      const srcTex = (i === N - 2) ? T.mips[N - 1].tex : T.ups[i + 1].tex;
      bindTarget(T.ups[i]);
      pUp.use();
      bindTex(0, srcTex, pUp.loc('uTex'));
      bindTex(1, T.mips[i].tex, pUp.loc('uAdd'));
      gl.uniform2f(pUp.loc('uTexel'), 1 / T.ups[i].w, 1 / T.ups[i].h);
      gl.uniform1f(pUp.loc('uAddWeight'), 1.0);
      gl.uniform1f(pUp.loc('uTexWeight'), (i === N - 2) ? CONFIG.bloom.wideBoost : 1.0);
      drawFullscreen(gl);
    }

    // 5 — grade to canvas
    bindTarget(null);
    pComp.use();
    bindTex(0, T.scene.tex, pComp.loc('uScene'));
    bindTex(1, T.ups[0].tex, pComp.loc('uBloom'));
    gl.uniform1f(pComp.loc('uBloomStrength'), CONFIG.bloom.strength * breathBloom * boost);
    const lean = state.lean || { x: 0, y: 0 };
    gl.uniform2f(pComp.loc('uLean'), lean.x, lean.y);
    gl.uniform1f(pComp.loc('uPulse'), (state.pulse || 0) * CONFIG.cursorLight.pulseGain);
    gl.uniform1f(pComp.loc('uExposure'), CONFIG.post.exposure * (state.exposureMul ?? 1));
    gl.uniform1f(pComp.loc('uVignette'), CONFIG.post.vignette);
    gl.uniform1f(pComp.loc('uGrain'), CONFIG.post.grain);
    gl.uniform1f(pComp.loc('uTime'), state.tSec);
    gl.uniform2f(pComp.loc('uRes'), W, H);
    drawFullscreen(gl);
  }

  return {
    gl,
    size,
    render,
    finish: () => gl.finish(),
    get width() { return W; },
    get height() { return H; },
  };
}
