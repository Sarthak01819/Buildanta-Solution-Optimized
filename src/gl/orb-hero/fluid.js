import * as THREE from 'three';
import {
  fluidVert,
  advectFrag,
  curlFrag,
  vorticityFrag,
  divergenceFrag,
  clearFrag,
  pressureFrag,
  gradientSubtractFrag,
  splatFrag,
} from './shaders/fluid.glsl.js';
import { DoubleTarget } from './targets.js';
import { pointer } from './pointer.js';

/**
 * 128×128 fluid solver, 2 pressure iterations.
 *
 * The pressure iterations are separate CPU-driven passes on purpose — see
 * fluid.glsl.js. Force is injected in NORMALISED screen units (delta ÷ the
 * short side), so the same gesture produces the same field on a phone and on a
 * 5K display, and forceClamp stays meaningful as a guard against the one huge
 * delta you get after a tab switch.
 */
export class FluidSim {
  constructor(renderer, fullscreen, params) {
    this.renderer = renderer;
    this.fs = fullscreen;
    this.params = params;
    const size = params.size;
    this.size = size;

    const gl = renderer.getContext();
    const linearFloat =
      !!gl.getExtension('EXT_color_buffer_float') && !!gl.getExtension('OES_texture_float_linear');

    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: linearFloat ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: linearFloat ? THREE.LinearFilter : THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };

    this.velocity = new DoubleTarget(size, size, opts);
    this.pressure = new DoubleTarget(size, size, opts);
    this.divergence = new THREE.WebGLRenderTarget(size, size, opts);
    this.curl = new THREE.WebGLRenderTarget(size, size, opts);

    const texel = { value: new THREE.Vector2(1 / size, 1 / size) };
    this.texel = texel;

    const make = (fragmentShader, uniforms) =>
      new THREE.ShaderMaterial({
        vertexShader: fluidVert,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: { uTexelSize: texel, ...uniforms },
      });

    this.mAdvect = make(advectFrag, {
      uVelocity: { value: null },
      uSource: { value: null },
      uDt: { value: 0.016 },
      uDissipation: { value: params.dissipation },
    });
    this.mCurl = make(curlFrag, { uVelocity: { value: null } });
    this.mVorticity = make(vorticityFrag, {
      uVelocity: { value: null },
      uCurl: { value: null },
      uCurlStrength: { value: params.curlStrength },
      uDt: { value: 0.016 },
    });
    this.mDivergence = make(divergenceFrag, { uVelocity: { value: null } });
    this.mClear = make(clearFrag, {
      uTexture: { value: null },
      uClearValue: { value: params.pressure },
    });
    this.mPressure = make(pressureFrag, {
      uPressure: { value: null },
      uDivergence: { value: null },
    });
    this.mGradient = make(gradientSubtractFrag, {
      uPressure: { value: null },
      uVelocity: { value: null },
    });
    this.mSplat = make(splatFrag, {
      uTarget: { value: null },
      uPoint: { value: new THREE.Vector2(0.5, 0.5) },
      uForce: { value: new THREE.Vector2() },
      // The measured 0.1 is in the same "÷100" convention the classic solver
      // uses; at face value it would splat a third of the screen.
      uRadius: { value: params.mouseRadius / 100 },
      uAspect: { value: 1 },
    });

    this.enabled = true;
    this.aspect = 1;
    this._force = new THREE.Vector2();
    this._raw = new THREE.Vector2();
    this._pos = new THREE.Vector2(0.5, 0.5);
    this._prevPos = new THREE.Vector2(0.5, 0.5);
    this._seeded = false;
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.mSplat.uniforms.uAspect.value = aspect;
  }

  get texture() {
    return this.velocity.read.texture;
  }

  update(dt) {
    if (!this.enabled) return;
    const p = this.params;
    const clampedDt = Math.min(dt, 1 / 30);

    // ── 1. Pointer impulse ────────────────────────────────────────────────
    /* Four separate things were wrong with the naive version, and they need
       four separate fixes — a single "smoothing" number fixes none of them:

       1. BROKEN TRAIL. One impulse per frame at the cursor's current spot
          means a fast sweep leaves isolated blobs with gaps between them. The
          impulse is now SUB-STEPPED along the path travelled since last frame,
          so it draws a stroke instead of dots.
       2. TWITCHY. The raw pointer drove the field directly, so every micro
          jitter went straight in. The splat now follows a lerped position.
       3. ABRUPT PUSH. Force jumped to full magnitude on frame one. It now
          RISES fast (0.5) and FALLS slow (0.055) — asymmetric on purpose.
       4. DEAD STOP. That same slow fall is the tail: when the cursor stops,
          the injected force decays over ~20 frames instead of vanishing, so
          the dust keeps drifting for a moment. */
    if (pointer.hasMoved) {
      const short = Math.min(window.innerWidth, window.innerHeight) || 1;

      // Seed on first movement, or the first frame injects one huge sweep from
      // wherever the pointer happened to be.
      if (!this._seeded) {
        this._pos.copy(pointer.glNormalized);
        this._prevPos.copy(this._pos);
        this._seeded = true;
      }

      this._raw.copy(pointer.delta).divideScalar(short).multiplyScalar(p.force);
      const len = this._raw.length();
      if (len > p.forceClamp) this._raw.multiplyScalar(p.forceClamp / len);

      const rising = this._raw.lengthSq() > this._force.lengthSq();
      this._force.lerp(this._raw, rising ? 0.5 : 0.055);

      this._prevPos.copy(this._pos);
      this._pos.lerp(pointer.glNormalized, 0.4);

      if (this._force.lengthSq() > 1e-8) {
        const travel = this._pos.distanceTo(this._prevPos);
        // One splat per ~1.2% of screen travelled, capped so a flick off-screen
        // cannot cost 200 passes.
        const steps = Math.min(8, Math.max(1, Math.ceil(travel / 0.012)));
        const u = this.mSplat.uniforms;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          u.uTarget.value = this.velocity.read.texture;
          u.uPoint.value.set(
            this._prevPos.x + (this._pos.x - this._prevPos.x) * t,
            this._prevPos.y + (this._pos.y - this._prevPos.y) * t
          );
          u.uForce.value.copy(this._force).multiplyScalar(1 / steps);
          this.fs.render(this.mSplat, this.velocity.write);
          this.velocity.swap();
        }
      }
    }

    // ── 2. Vorticity confinement ──────────────────────────────────────────
    this.mCurl.uniforms.uVelocity.value = this.velocity.read.texture;
    this.fs.render(this.mCurl, this.curl);

    this.mVorticity.uniforms.uVelocity.value = this.velocity.read.texture;
    this.mVorticity.uniforms.uCurl.value = this.curl.texture;
    this.mVorticity.uniforms.uDt.value = clampedDt;
    this.fs.render(this.mVorticity, this.velocity.write);
    this.velocity.swap();

    // ── 3. Projection ─────────────────────────────────────────────────────
    this.mDivergence.uniforms.uVelocity.value = this.velocity.read.texture;
    this.fs.render(this.mDivergence, this.divergence);

    this.mClear.uniforms.uTexture.value = this.pressure.read.texture;
    this.fs.render(this.mClear, this.pressure.write);
    this.pressure.swap();

    this.mPressure.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < p.iterations; i++) {
      this.mPressure.uniforms.uPressure.value = this.pressure.read.texture;
      this.fs.render(this.mPressure, this.pressure.write);
      this.pressure.swap();
    }

    this.mGradient.uniforms.uPressure.value = this.pressure.read.texture;
    this.mGradient.uniforms.uVelocity.value = this.velocity.read.texture;
    this.fs.render(this.mGradient, this.velocity.write);
    this.velocity.swap();

    // ── 4. Self-advection ─────────────────────────────────────────────────
    this.mAdvect.uniforms.uVelocity.value = this.velocity.read.texture;
    this.mAdvect.uniforms.uSource.value = this.velocity.read.texture;
    this.mAdvect.uniforms.uDt.value = clampedDt * 60 * (1 - p.viscosity * 0.1);
    this.fs.render(this.mAdvect, this.velocity.write);
    this.velocity.swap();
  }

  dispose() {
    this.velocity.dispose();
    this.pressure.dispose();
    this.divergence.dispose();
    this.curl.dispose();
    for (const m of [
      this.mAdvect,
      this.mCurl,
      this.mVorticity,
      this.mDivergence,
      this.mClear,
      this.mPressure,
      this.mGradient,
      this.mSplat,
    ]) {
      m.dispose();
    }
  }
}
