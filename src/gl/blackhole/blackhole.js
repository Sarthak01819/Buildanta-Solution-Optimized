// The render engine: owns the GL context, programs, and render targets, and
// draws one complete frame (scene → bloom pyramid → grade) on demand.
// Everything time-dependent takes an explicit clock so renderAt(ms) is exact.

import { CONFIG, SHADER_V } from './config.js';
import { createGL, compileProgram, settlePrograms, makeTarget, disposeTarget, drawFullscreen } from './gl.js';
import { createUniformCache } from './uniformCache.js';

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
  const uniforms = createUniformCache(gl);

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
  await settlePrograms(gl, [pScene, pPre, pDown, pUp, pComp]);   // D-109

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
    uniforms.uniform1i(loc, unit);
  }

  // ---- one full frame -----------------------------------------------------
  // state: { tSec, yawRad, pitchRad, breath (0..1), cursorBoost (0..1),
  //          reduced (bool) }
  function render(state) {
    const C = CONFIG;
    // Optional per-call grade. Two consumers now share this engine: the intro
    // beat (full frame — CONFIG's values ARE the tuned look) and the contact
    // room's window (a small pane, where dust and grain read as dirt and the
    // deepest bloom mips wash the whole field). Absent → CONFIG, unchanged.
    const G = state.grade || {};
    const hazeGain = G.hazeGain ?? C.stars.hazeGain;
    const wideBoost = G.wideBoost ?? C.bloom.wideBoost;
    const bloomStrength = G.bloomStrength ?? C.bloom.strength;
    const grain = G.grain ?? C.post.grain;
    const breathDisk = 1 + (state.breath - 0.5) * 2 * C.breathing.diskDepth;
    const breathBloom = 1 + (state.breath - 0.5) * 2 * C.breathing.bloomDepth;
    const boost = 1 + state.cursorBoost * C.cursor.boost;

    // 1 — scene (HDR)
    bindTarget(T.scene);
    pScene.use();
    uniforms.uniform2f(pScene.loc('uRes'), W, H);
    uniforms.uniform1f(pScene.loc('uTime'), state.tSec);
    uniforms.uniform1i(pScene.loc('uSteps'), C.quality.steps);
    uniforms.uniform1f(pScene.loc('uCamDist'),
      (C.camera.dist + (state.distOffset || 0)) * (state.distMul || 1));
    uniforms.uniform1f(pScene.loc('uFovY'), C.camera.fovYDeg * D2R);
    uniforms.uniform1f(pScene.loc('uFrameY'), C.camera.frameY || 0);
    uniforms.uniform1f(pScene.loc('uPitch'), C.camera.pitchDeg * D2R + state.pitchRad);
    uniforms.uniform1f(pScene.loc('uYaw'), C.camera.yawDeg * D2R + state.yawRad);
    uniforms.uniform1f(pScene.loc('uRoll'), C.camera.rollDeg * D2R);
    uniforms.uniform1f(pScene.loc('uDiskRIn'), C.disk.rIn);
    uniforms.uniform1f(pScene.loc('uDiskROut'), C.disk.rOut);
    uniforms.uniform1f(pScene.loc('uDiskGain'), C.disk.gain * breathDisk);
    uniforms.uniform1f(pScene.loc('uHotRim'), C.disk.hotRim);
    uniforms.uniform1f(pScene.loc('uOmega0'), C.disk.omega0);
    uniforms.uniform1f(pScene.loc('uShearPeriod'), C.disk.shearPeriod);
    uniforms.uniform1f(pScene.loc('uDoppler'), C.disk.doppler);
    uniforms.uniform1f(pScene.loc('uTurbContrast'), C.disk.turbContrast);
    uniforms.uniform1f(pScene.loc('uAlphaGain'), C.disk.alphaGain);
    uniforms.uniform3fv(pScene.loc('uColHot'), C.colors.hot);
    uniforms.uniform3fv(pScene.loc('uColMid'), C.colors.mid);
    uniforms.uniform3fv(pScene.loc('uColOuter'), C.colors.outer);
    uniforms.uniform3fv(pScene.loc('uColRim'), C.colors.rim);
    uniforms.uniform1f(pScene.loc('uRingGain'), C.ring.gain * boost);
    uniforms.uniform1f(pScene.loc('uRingWidth'), C.ring.width);
    uniforms.uniform1f(pScene.loc('uStarDensity'), C.stars.density);
    uniforms.uniform1f(pScene.loc('uStarGain'), C.stars.gain);
    uniforms.uniform1f(pScene.loc('uTwinkle'), state.reduced ? 0 : C.stars.twinkle);
    uniforms.uniform1f(pScene.loc('uHazeGain'), hazeGain);
    drawFullscreen(gl);

    // 2 — bloom prefilter into mip 0
    bindTarget(T.mips[0]);
    pPre.use();
    bindTex(0, T.scene.tex, pPre.loc('uTex'));
    uniforms.uniform1f(pPre.loc('uThreshold'), CONFIG.bloom.threshold);
    uniforms.uniform1f(pPre.loc('uKnee'), CONFIG.bloom.knee);
    drawFullscreen(gl);

    // 3 — downsample chain
    for (let i = 1; i < T.mips.length; i++) {
      bindTarget(T.mips[i]);
      pDown.use();
      bindTex(0, T.mips[i - 1].tex, pDown.loc('uTex'));
      uniforms.uniform2f(pDown.loc('uTexel'), 1 / T.mips[i - 1].w, 1 / T.mips[i - 1].h);
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
      uniforms.uniform2f(pUp.loc('uTexel'), 1 / T.ups[i].w, 1 / T.ups[i].h);
      uniforms.uniform1f(pUp.loc('uAddWeight'), 1.0);
      uniforms.uniform1f(pUp.loc('uTexWeight'), (i === N - 2) ? wideBoost : 1.0);
      drawFullscreen(gl);
    }

    // 5 — grade to canvas
    bindTarget(null);
    pComp.use();
    bindTex(0, T.scene.tex, pComp.loc('uScene'));
    bindTex(1, T.ups[0].tex, pComp.loc('uBloom'));
    uniforms.uniform1f(pComp.loc('uBloomStrength'), bloomStrength * breathBloom * boost);
    const lean = state.lean || { x: 0, y: 0 };
    uniforms.uniform2f(pComp.loc('uLean'), lean.x, lean.y);
    uniforms.uniform1f(pComp.loc('uPulse'), (state.pulse || 0) * CONFIG.cursorLight.pulseGain);
    uniforms.uniform1f(pComp.loc('uExposure'), CONFIG.post.exposure * (state.exposureMul ?? 1));
    uniforms.uniform1f(pComp.loc('uVignette'), CONFIG.post.vignette);
    uniforms.uniform1f(pComp.loc('uGrain'), grain);
    uniforms.uniform1f(pComp.loc('uTime'), state.tSec);
    uniforms.uniform2f(pComp.loc('uRes'), W, H);
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
