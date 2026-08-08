import * as THREE from 'three';
import { simVert, velocityFrag, positionFrag } from './shaders/sim.glsl.js';
import { particlesVert, particlesFrag, flaresFrag } from './shaders/particles.glsl.js';
import { DoubleTarget, floatTargetOptions } from './targets.js';
import { linear } from './tokens.js';

/**
 * Layer 2 — GPGPU particles.
 *
 * Two ping-ponged float targets (position, velocity) advanced entirely on the
 * GPU, drawn as instanced camera-facing quads that read their position from the
 * FBO via a per-instance aFboUv. One class serves both populations: the 65,536
 * main particles and the 9,216 cyan-bloomed flares that escape the shell.
 */
/**
 * Deterministic PRNG (mulberry32). Math.random() here makes every page load a
 * different cloud, which means the orb's bloom lands on different pixels each
 * time — and a parity harness sampling those pixels reads a 28-code noise floor
 * and can no longer tell a real tuning improvement from a reseed. Fixed seed,
 * reproducible screenshots, honest measurements.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ParticleSystem {
  constructor(
    renderer,
    fullscreen,
    { size, params, flare = false, radius, shapeThreshold, seed = 0xb1a2e5 }
  ) {
    this.renderer = renderer;
    this.fs = fullscreen;
    this.size = size;
    this.params = params;
    this.flare = flare;
    this.frame = 0;
    // Authored resting radius — the Act 01 collapse scales from this, so it
    // must survive being overwritten on the uniform every frame.
    this.baseRadius = radius ?? params.radius;

    const opts = floatTargetOptions(renderer);
    this.position = new DoubleTarget(size, size, opts);
    this.velocity = new DoubleTarget(size, size, opts);

    const count = size * size;

    /* ── Home texture: rest direction (xyz) + per-particle random (w) ─────── */
    const home = new Float32Array(count * 4);
    const randoms = new Float32Array(count);
    const scales = new Float32Array(count);
    const fboUv = new Float32Array(count * 2);

    const rng = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      // Uniform on the sphere (inverse-CDF on z — a naive angle pair clumps at
      // the poles, which reads as two bright caps).
      const z = rng() * 2 - 1;
      const t = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      home[i * 4 + 0] = r * Math.cos(t);
      home[i * 4 + 1] = r * Math.sin(t);
      home[i * 4 + 2] = z;
      const rnd = rng();
      home[i * 4 + 3] = rnd;
      randoms[i] = rnd;
      scales[i] = rng();
      fboUv[i * 2 + 0] = ((i % size) + 0.5) / size;
      fboUv[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    }

    this.homeTexture = new THREE.DataTexture(home, size, size, THREE.RGBAFormat, THREE.FloatType);
    this.homeTexture.needsUpdate = true;
    this.homeTexture.minFilter = THREE.NearestFilter;
    this.homeTexture.magFilter = THREE.NearestFilter;

    /* ── Sim materials ────────────────────────────────────────────────────── */
    this.velocityMaterial = new THREE.ShaderMaterial({
      vertexShader: simVert,
      fragmentShader: velocityFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPosition: { value: null },
        tVelocity: { value: null },
        uTime: { value: 0 },
        uCurlSize: { value: params.curlSize },
        uCurlStrength: { value: params.curlStrength * (flare ? 1.8 : 1) },
        uCurlNoiseSpeed: { value: params.curlNoiseSpeed },
        uCurlNoisePersistence: { value: params.curlNoisePersistence },
        uFriction: { value: params.friction },
        uNoiseTranslation: { value: new THREE.Vector3(...params.noiseTranslation) },
      },
    });

    this.positionMaterial = new THREE.ShaderMaterial({
      vertexShader: simVert,
      fragmentShader: positionFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPosition: { value: null },
        tVelocity: { value: null },
        tHome: { value: this.homeTexture },
        tFluid: { value: null },
        uTime: { value: 0 },
        uDelta: { value: 1 },
        uRadius: { value: radius ?? params.radius },
        uDecay: { value: params.decay },
        uDecay2: { value: params.decay2 },
        uLerpSpeed: { value: params.lerpSpeed },
        uLerpSpeed2: { value: params.lerpSpeed2 },
        uFluidStrength: { value: params.fluidStrength },
        uFluidMaxStep: { value: (radius ?? params.radius) * (params.fluidMaxStep ?? 0.05) },
        uFrequency: { value: new THREE.Vector2(...params.frequency) },
        uAmplitude: { value: new THREE.Vector2(...params.amplitude) },
        uShapeThreshold: { value: shapeThreshold ?? params.shapeThreshold },
        uSetup: { value: 1 },
        uFormMix: { value: 0 },
        uFormVariant: { value: 0 },
        uViewMatrix: { value: new THREE.Matrix4() },
        uProjectionMatrix: { value: new THREE.Matrix4() },
        uOrbOffset: { value: new THREE.Vector3() },
      },
    });

    /* ── Render geometry ──────────────────────────────────────────────────── */
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.attributes.position);
    geometry.setAttribute('uv', base.attributes.uv);
    geometry.setAttribute('aFboUv', new THREE.InstancedBufferAttribute(fboUv, 2));
    geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(randoms, 1));
    geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
    geometry.instanceCount = count;
    // The base quad's bounding sphere is 1px wide; without this the whole cloud
    // gets frustum-culled the moment the orb's origin leaves the frame.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    this.geometry = geometry;
    this.baseGeometry = base;

    const commonUniforms = {
      tPosition: { value: null },
      uParticleSize: { value: params.particleSize * (params.sizeUnit ?? 1) },
      uScaleRange: { value: new THREE.Vector2(...params.scaleRange) },
      uSunPosition: { value: new THREE.Vector3() },
      uOpacity: { value: params.opacity ?? 1 },
      uTime: { value: 0 },
    };

    this.renderMaterial = flare
      ? new THREE.ShaderMaterial({
          vertexShader: particlesVert,
          fragmentShader: flaresFrag,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            ...commonUniforms,
            uColor: { value: linear(params.color) },
            uBloomColor: { value: linear(params.bloomColor) },
            uCenterFade: { value: new THREE.Vector2(...params.centerFade) },
          },
        })
      : new THREE.ShaderMaterial({
          vertexShader: particlesVert,
          fragmentShader: particlesFrag,
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending,
          uniforms: {
            ...commonUniforms,
            uBaseColor: { value: linear(params.baseColor) },
            uBaseColor2: { value: linear(params.baseColor2) },
            uEdgeColor1: { value: linear(params.edgeColor1) },
            uEdgeColor2: { value: linear(params.edgeColor2) },
            uEdgeColorStop: { value: new THREE.Vector2(...params.edgeColorStop) },
            uBloomColor1: { value: linear(params.bloomColor1) },
            uBloomColor2: { value: linear(params.bloomColor2) },
            uShadowColor: { value: linear(params.shadowColor) },
            uHighlightColor: { value: linear(params.highlightColor) },
            uShadowIntensity: { value: params.shadowIntensity },
            uSunDistanceColorStop: { value: params.sunDistanceColorStop },
            uDistanceFadeNearFar: { value: new THREE.Vector2(...params.distanceFadeNearFar) },
            uRandomHighlightSelect: { value: params.randomHighlightSelect },
            uHighlightIntensity: { value: params.highlightIntensity },
            uFormMix: { value: 0 },
            uCoreColor: { value: linear(params.coreColor ?? '#FFD9A6') },
            uCoreIntensity: { value: params.coreIntensity ?? 2.6 },
            uFlash: { value: 0 },
            uCloudsFadeIntensity: { value: params.cloudsFadeIntensity },
            uCloudNoiseScale: { value: new THREE.Vector3(2.5, 2.5, 2.5) },
            uCloudNoiseSpeed: { value: 0.42 },
            uCloudsSmoothstep: { value: new THREE.Vector2(0.36, 0.92) },
          },
        });

    this.mesh = new THREE.Mesh(geometry, this.renderMaterial);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = flare ? 2 : 0;
  }

  /** One sim step. dt is already normalised (dt × 60) and clamped by the caller
   *  so a tab-switch spike cannot fling every particle to infinity. */
  step(time, normalisedDelta, { camera, fluidTexture, orbOffset }) {
    const vu = this.velocityMaterial.uniforms;
    vu.uTime.value = time;
    vu.tPosition.value = this.position.read.texture;
    vu.tVelocity.value = this.velocity.read.texture;
    this.fs.render(this.velocityMaterial, this.velocity.write);
    this.velocity.swap();

    const pu = this.positionMaterial.uniforms;
    pu.uTime.value = time;
    pu.uDelta.value = normalisedDelta;
    pu.tPosition.value = this.position.read.texture;
    pu.tVelocity.value = this.velocity.read.texture;
    pu.tFluid.value = fluidTexture;
    pu.uViewMatrix.value.copy(camera.matrixWorldInverse);
    pu.uProjectionMatrix.value.copy(camera.projectionMatrix);
    if (orbOffset) pu.uOrbOffset.value.copy(orbOffset);
    this.fs.render(this.positionMaterial, this.position.write);
    this.position.swap();

    pu.uSetup.value = 0;
    this.frame++;

    this.renderMaterial.uniforms.tPosition.value = this.position.read.texture;
    this.renderMaterial.uniforms.uTime.value = time;
  }

  setSun(vec) {
    this.renderMaterial.uniforms.uSunPosition.value.copy(vec);
  }

  /** Park every particle back on its target. With the fixed seed above, this
   *  makes "reset, advance N steps, capture" byte-reproducible — the property a
   *  parity sweep needs to be worth running at all. */
  reset() {
    this.positionMaterial.uniforms.uSetup.value = 1;
    this.frame = 0;
  }

  /**
   * Re-colour the dust live.
   *
   * Without this the orb keeps its warm amber particles while the ground goes
   * pink, and the two read as separate colour schemes rather than one object
   * lit by one light. Every colour here is already a uniform, so this costs
   * nothing per frame and rebuilds nothing. Only the keys passed are touched.
   */
  setColors(c = {}) {
    const u = this.renderMaterial.uniforms;
    const set = (name, v) => { if (v && u[name]) u[name].value = linear(v); };
    set('uBaseColor', c.baseColor);
    set('uBaseColor2', c.baseColor2);
    set('uEdgeColor1', c.edgeColor1);
    set('uEdgeColor2', c.edgeColor2);
    set('uBloomColor1', c.bloomColor1);
    set('uBloomColor2', c.bloomColor2);
    set('uCoreColor', c.coreColor);
    set('uBloomColor', c.bloomColor);
  }

  dispose() {
    this.position.dispose();
    this.velocity.dispose();
    this.homeTexture.dispose();
    this.geometry.dispose();
    this.baseGeometry.dispose();
    this.velocityMaterial.dispose();
    this.positionMaterial.dispose();
    this.renderMaterial.dispose();
  }
}
