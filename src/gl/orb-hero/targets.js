import * as THREE from 'three';

/** A fullscreen quad runner. One geometry, one scene, one camera, reused by
 *  every pass in the app — so a resize can never leave a stale quad behind. */
export class FullscreenPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(this.geometry, null);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }

  render(material, target = null, clear = true) {
    this.mesh.material = material;
    const prevTarget = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = clear;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = prevAutoClear;
    this.renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.geometry.dispose();
  }
}

/**
 * Ping-pong pair. Everything that iterates (sim, fluid) owns one of these.
 *
 * setSize disposes before allocating — the discipline that keeps five resizes
 * at 80 creates / 80 deletes instead of a leak that kills the GPU in seconds.
 */
export class DoubleTarget {
  constructor(width, height, options) {
    this.options = options;
    this.width = width;
    this.height = height;
    this.a = new THREE.WebGLRenderTarget(width, height, options);
    this.b = new THREE.WebGLRenderTarget(width, height, options);
  }

  get read() {
    return this.a;
  }

  get write() {
    return this.b;
  }

  swap() {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.a.setSize(width, height);
    this.b.setSize(width, height);
  }

  dispose() {
    this.a.dispose();
    this.b.dispose();
  }
}

/** Float support, decided once. Position data needs the precision; half-float
 *  positions visibly quantise at a 3-unit radius. */
export function floatTargetOptions(renderer) {
  const gl = renderer.getContext();
  const canRenderFloat = !!gl.getExtension('EXT_color_buffer_float');
  return {
    type: canRenderFloat ? THREE.FloatType : THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  };
}

/** Colour targets for the scene renders and the post chain. HalfFloat so the
 *  2%-white particles keep headroom above 1.0 for bloom to find. */
export function sceneTargetOptions() {
  return {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
  };
}
