/* ══ LENS BLUR PASS — the mirror's screen-space radial dual-Kawase blur ═════
   plus its foreground grade (radialPull black vignette + saturation), for the
   bill-transition canvas (D-076).

   The three blur shaders are COPIES of the ones already ported in
   src/gl/zeroMirrorStage.js (createLensDownMaterial / createLensUpMaterial /
   createLensCompositeMaterial, lines ~776-868). They are copied, not shared:
   the zero stage is frozen and must not gain a dependency on a module that
   exists for a different beat. If a kernel bug is ever found, fix it in both.

   Reference (scratchpad spec §5.4 / §5.5, main.pretty.js l.33866-34040 and
   l.28192): 3 down passes (half, quarter, eighth; 2 on coarse pointers), up
   passes back to half, then a composite that mixes sharp/blurred by distance
   from the screen centre — smoothstep(0.3, 0.6, |(uv-.5)*(aspect,1)|). The
   blur radius is fixed by the pyramid; nothing ramps it. The fgPass then
   overlays the radialPull vignette (corner alphas TL .03 TC 0 TR .03 / BL 1
   BC .35 BR 1, Gaussian clear hole sigma .25) and applies saturation 1.08,
   then encodes sRGB.

   Alpha: the scene is rendered into a transparent-black target, so the target
   holds PREMULTIPLIED linear colour. The composite un-premultiplies for the
   grade and the sRGB encode, lays the vignette over as black-with-alpha, and
   writes premultiplied sRGB straight into the alpha:true canvas (NoBlending),
   which is what the browser expects. That is what keeps note edges free of a
   dark fringe over the stars behind the canvas. */

import {
  Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial,
  WebGLRenderTarget, Vector2, LinearFilter, NoBlending, DataTexture,
  RGBAFormat, UnsignedByteType, LinearSRGBColorSpace, ClampToEdgeWrapping,
} from "three";

export const LENS_FOCAL_RADIUS = 0.3;
export const LENS_FALLOFF = 0.3;
export const LENS_SATURATION = 1.08;

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/* copy of zeroMirrorStage.js createLensDownMaterial (5 taps / 8) */
function createDownMaterial() {
  return new ShaderMaterial({
    name: "BillLensDownMaterial",
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D tDiffuse;
      uniform vec2 uHalfPixel;
      varying vec2 vUv;
      void main() {
        vec4 sum = texture2D(tDiffuse, vUv) * 4.0;
        sum += texture2D(tDiffuse, vUv - uHalfPixel);
        sum += texture2D(tDiffuse, vUv + uHalfPixel);
        sum += texture2D(tDiffuse, vUv + vec2(uHalfPixel.x, -uHalfPixel.y));
        sum += texture2D(tDiffuse, vUv - vec2(uHalfPixel.x, -uHalfPixel.y));
        gl_FragColor = sum / 8.0;
      }
    `,
    uniforms: {
      tDiffuse: { value: null },
      uHalfPixel: { value: new Vector2(0.5, 0.5) },
    },
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/* copy of zeroMirrorStage.js createLensUpMaterial (8 taps / 12) */
function createUpMaterial() {
  return new ShaderMaterial({
    name: "BillLensUpMaterial",
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D tDiffuse;
      uniform vec2 uHalfPixel;
      varying vec2 vUv;
      void main() {
        vec4 sum = vec4(0.0);
        sum += texture2D(tDiffuse, vUv + vec2(-uHalfPixel.x * 2.0, 0.0));
        sum += texture2D(tDiffuse, vUv + vec2( uHalfPixel.x * 2.0, 0.0));
        sum += texture2D(tDiffuse, vUv + vec2(0.0, -uHalfPixel.y * 2.0));
        sum += texture2D(tDiffuse, vUv + vec2(0.0,  uHalfPixel.y * 2.0));
        sum += texture2D(tDiffuse, vUv + vec2(-uHalfPixel.x, -uHalfPixel.y)) * 2.0;
        sum += texture2D(tDiffuse, vUv + vec2( uHalfPixel.x, -uHalfPixel.y)) * 2.0;
        sum += texture2D(tDiffuse, vUv + vec2(-uHalfPixel.x,  uHalfPixel.y)) * 2.0;
        sum += texture2D(tDiffuse, vUv + vec2( uHalfPixel.x,  uHalfPixel.y)) * 2.0;
        gl_FragColor = sum / 12.0;
      }
    `,
    uniforms: {
      tDiffuse: { value: null },
      uHalfPixel: { value: new Vector2(0.5, 0.5) },
    },
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/* the mirror's lens composite (zeroMirrorStage.js createLensCompositeMaterial)
   fused with its fgPass grade; see the header for the alpha conventions */
function createCompositeMaterial(vignetteTexture) {
  return new ShaderMaterial({
    name: "BillLensCompositeMaterial",
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D tOriginal;
      uniform sampler2D tBlurred;
      uniform sampler2D tVignette;
      uniform vec2 uResolution;
      uniform float uFocalRadius;
      uniform float uFalloff;
      uniform float uVignette;
      uniform float uSaturation;
      varying vec2 vUv;

      vec3 linearToSRGB(vec3 color) {
        color = clamp(color, 0.0, 1.0);
        return mix(
          1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
          color * 12.92,
          vec3(lessThan(color, vec3(0.0031308)))
        );
      }

      void main() {
        float aspect = uResolution.x / uResolution.y;
        vec2 delta = (vUv - vec2(0.5)) * vec2(aspect, 1.0);
        float blend = smoothstep(uFocalRadius, uFocalRadius + uFalloff, length(delta));
        vec4 scene = mix(texture2D(tOriginal, vUv), texture2D(tBlurred, vUv), blend);

        /* un-premultiply for the grade */
        float alpha = scene.a;
        vec3 rgb = alpha > 1e-5 ? scene.rgb / alpha : vec3(0.0);
        float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
        rgb = clamp(mix(vec3(luma), rgb, uSaturation), 0.0, 1.0);

        /* radialPull: black with alpha v laid OVER the scene, so the stars
           behind the canvas darken exactly as the chalkboard does */
        float v = texture2D(tVignette, vUv).a * uVignette;
        vec3 over = rgb * alpha * (1.0 - v);
        float outAlpha = v + alpha * (1.0 - v);
        vec3 straight = outAlpha > 1e-5 ? over / outAlpha : vec3(0.0);
        gl_FragColor = vec4(linearToSRGB(straight) * outAlpha, outAlpha);
      }
    `,
    uniforms: {
      tOriginal: { value: null },
      tBlurred: { value: null },
      tVignette: { value: vignetteTexture },
      uResolution: { value: new Vector2(1, 1) },
      uFocalRadius: { value: LENS_FOCAL_RADIUS },
      uFalloff: { value: LENS_FALLOFF },
      uVignette: { value: 1 },
      uSaturation: { value: LENS_SATURATION },
    },
    blending: NoBlending,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/* Port of the mirror's radialPull generator `pg()` (main.pretty.js l.28192):
   corner alphas interpolated with a quadratic across x and linearly top to
   bottom, with an optional Gaussian clear hole. Generated once, 256x144.
   Rows are written bottom-up (GL order) so no flipY is needed. */
export function createRadialPullTexture({
  topLeft = 0.03, topCenter = 0, topRight = 0.03,
  botLeft = 1, botCenter = 0.35, botRight = 1,
  centerAlpha = 0, centerSigma = 0.25, width = 256, height = 144,
} = {}) {
  const data = new Uint8Array(width * height * 4);
  const hasHole = centerAlpha !== null;
  const p = hasHole ? 1 / (2 * centerSigma * centerSigma) : 0;
  for (let row = 0; row < height; row += 1) {
    const m = 1 - row / (height - 1);      // 0 at the top, 1 at the bottom
    const h = m - 0.5;
    for (let col = 0; col < width; col += 1) {
      const g = col / (width - 1);
      const wl = 2 * g * g - 3 * g + 1;
      const wc = -4 * g * g + 4 * g;
      const wr = 2 * g * g - g;
      const top = topLeft * wl + topCenter * wc + topRight * wr;
      let x = top + (botLeft * wl + botCenter * wc + botRight * wr - top) * m;
      if (hasHole) {
        const e = g - 0.5;
        const t = Math.exp(-(e * e + h * h) * p);
        x += (centerAlpha - x) * t;
      }
      x = x < 0 ? 0 : x > 1 ? 1 : x;
      const i = (row * width + col) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.round(x * 255);
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * createLensBlurPass(renderer, { levels })
 *   resize(width, height, pixelRatio)   — CSS size; targets are DPR-scaled
 *   render(scene, camera, { vignette })  — renders `scene` through the pass
 *                                          into the CURRENT render target
 *                                          (null = the canvas)
 *   iterations                           — pyramid levels in use
 *   dispose()
 */
export function createLensBlurPass(renderer, { levels = 3 } = {}) {
  const iterations = Math.max(1, Math.min(3, levels | 0));
  const makeTarget = (name, depthBuffer) => {
    const target = new WebGLRenderTarget(1, 1, { depthBuffer, stencilBuffer: false });
    target.texture.name = name;
    target.texture.colorSpace = LinearSRGBColorSpace;
    target.texture.generateMipmaps = false;
    target.texture.minFilter = LinearFilter;
    target.texture.magFilter = LinearFilter;
    return target;
  };
  const sceneTarget = makeTarget("BillLensSceneTarget", true);
  const lensTargets = [0, 1, 2].map((index) => makeTarget(`BillLensTarget${index + 1}`, false));

  const quadScene = new Scene();
  quadScene.name = "BillLensQuadScene";
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeometry = new PlaneGeometry(2, 2);
  const downMaterial = createDownMaterial();
  const upMaterial = createUpMaterial();
  const vignetteTexture = createRadialPullTexture();
  const compositeMaterial = createCompositeMaterial(vignetteTexture);
  const quad = new Mesh(quadGeometry, downMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let disposed = false;

  function resize(width, height, pixelRatio = 1) {
    if (disposed) return;
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));
    sceneTarget.setSize(targetWidth, targetHeight);
    let lensWidth = targetWidth;
    let lensHeight = targetHeight;
    lensTargets.forEach((target) => {
      lensWidth = Math.max(1, Math.floor(lensWidth / 2));
      lensHeight = Math.max(1, Math.floor(lensHeight / 2));
      target.setSize(lensWidth, lensHeight);
    });
    compositeMaterial.uniforms.uResolution.value.set(targetWidth, targetHeight);
  }

  function render(scene, camera, { vignette = 1 } = {}) {
    if (disposed) return;
    const outputTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;

    renderer.autoClear = true;
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);

    let inputTarget = sceneTarget;
    quad.material = downMaterial;
    for (let index = 0; index < iterations; index += 1) {
      const target = lensTargets[index];
      downMaterial.uniforms.tDiffuse.value = inputTarget.texture;
      downMaterial.uniforms.uHalfPixel.value.set(0.5 / inputTarget.width, 0.5 / inputTarget.height);
      renderer.setRenderTarget(target);
      renderer.render(quadScene, quadCamera);
      inputTarget = target;
    }
    quad.material = upMaterial;
    for (let index = iterations - 1; index > 0; index -= 1) {
      inputTarget = lensTargets[index];
      const target = lensTargets[index - 1];
      upMaterial.uniforms.tDiffuse.value = inputTarget.texture;
      upMaterial.uniforms.uHalfPixel.value.set(0.5 / inputTarget.width, 0.5 / inputTarget.height);
      renderer.setRenderTarget(target);
      renderer.render(quadScene, quadCamera);
    }

    quad.material = compositeMaterial;
    compositeMaterial.uniforms.tOriginal.value = sceneTarget.texture;
    compositeMaterial.uniforms.tBlurred.value = lensTargets[0].texture;
    compositeMaterial.uniforms.uVignette.value = vignette;
    renderer.setRenderTarget(outputTarget);
    renderer.render(quadScene, quadCamera);
    renderer.autoClear = previousAutoClear;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    sceneTarget.dispose();
    lensTargets.forEach((target) => target.dispose());
    quadGeometry.dispose();
    downMaterial.dispose();
    upMaterial.dispose();
    compositeMaterial.dispose();
    vignetteTexture.dispose();
  }

  return {
    resize,
    render,
    dispose,
    get iterations() { return iterations; },
    focalRadius: LENS_FOCAL_RADIUS,
    falloff: LENS_FALLOFF,
    saturation: LENS_SATURATION,
  };
}

export default createLensBlurPass;
