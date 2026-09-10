/* ══ BILL PORTAL — the mirror's stage-3 portrait medallion (D-076) ═════════
   The dark-green textured circle that sits over Franklin at the start of the
   bill beat (reference F1..F3). Geometry, uv squeeze, scale, offset and the
   opacity law are the mirror's, read from main.pretty.js l.37662-37685 and
   l.37837 (scratchpad spec §4):

     geo = CircleGeometry(0.06, 64); uv.v = (v - 0.5) * 1.2 + 0.5
     scale (0.88, 1.05, 1)                       -> ellipse rx .0528, ry .063
     position = hero.position + (-0.022, 0, 0.01) -> screen centre, .01 in front
     rotation = hero.rotation (copied every frame)
     opacity  = 1 - hv(t, 0, 0.056); depthTest/depthWrite on, DoubleSide

   What is INSIDE the circle is the client's decision 1: our own two fists at
   the approved contact hold, baked once by the zero stage (bakePortalStill),
   composited over the leather the mirror uses as the medallion's backdrop.
   The leather comes from the vendored leather-money-shreds atlas — the same
   file dresses the notes — so no new asset ships. The texture patch the
   circle shows is a 0.1056 x 0.105 world-unit square; at the mirror's camera
   (z .19) and fov it spans `stillHeightFraction(fov)` of the viewport height,
   centred, which is exactly how the still is framed when baked.

   Pure function of scroll: opacity and pose are set by the host every frame;
   the still is content-fixed (bridge 1.0, neutral pointer). */

import {
  CircleGeometry, Mesh, ShaderMaterial, DoubleSide, DataTexture, RGBAFormat,
  UnsignedByteType, LinearSRGBColorSpace, LinearFilter, LinearMipmapLinearFilter,
  ClampToEdgeWrapping, Vector2, Vector3, Vector4,
} from "three";

/* the circle is gone at this stage-local progress (mirror: hv(t, 0, .056)) */
export const PORTAL_FADE_END = 0.056;

/* ── The grade inside the circle (D-076 r2, Yash 10 Sep: "both fist bump
   hands ... in super green color", i.e. the reference hand's treatment).
   The reference still is a monochrome pale-green hand: its lit palm and
   fingers average #a0977a and its shadowed wrist #797a6b (measured on the
   mirror's F1, f-07053.png, over lum > 135 / 95..135). Our still keeps its
   production colours (the green matcap, the skin) so it stays 1:1 with the
   live fists under the dissolve; the grade exists ONLY in this material:
   un-premultiply, take luma, remap through a two-tone ramp in linear space,
   re-premultiply, composite over the leather. The tones are set so the
   MEASURED means on a capture land on the reference's (lit within ±10 per
   channel of #a0977a with G ≥ R — the "super green" lean Yash reads into it
   — shadow within ±12 of #797a6b): the lens blur at the frame's edges and
   the leather under the fists' anti-aliased rims pull both bands down by
   6-10 per channel, so each tone sits that much above its target. The ramp
   maps linear luma .10 → shadow, .50 → lit (the matcap body and the skin
   both sit above .5, the rims and creases below .3), so the fists keep
   their shading while every hue goes. */
export const PORTAL_TONE_LIT = "#a2a382";
export const PORTAL_TONE_SHADOW = "#807f75";
export const PORTAL_TONE_RANGE = Object.freeze([0.10, 0.50]);
/* sRGB hex -> linear working-space triplet (the shader works in linear) */
export function toneToLinear(hex) {
  const value = parseInt(String(hex).replace("#", ""), 16);
  return [16, 8, 0].map((shift) => {
    const channel = ((value >> shift) & 255) / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
}
export const PORTAL_OFFSET = Object.freeze([-0.022, 0, 0.01]);
export const PORTAL_RADIUS = 0.06;
export const PORTAL_SCALE = Object.freeze([0.88, 1.05, 1]);
const UV_SQUEEZE = 1.2;
/* world-unit size of the square the texture covers on the circle:
   width = 2r * .88, height = 2r / 1.2 * 1.05 */
export const PORTAL_PATCH = Object.freeze({
  width: 2 * PORTAL_RADIUS * PORTAL_SCALE[0],
  height: 2 * PORTAL_RADIUS / UV_SQUEEZE * PORTAL_SCALE[1],
});
/* camera-to-circle distance at t = 0: camera z .19, circle z .01 */
const PORTAL_DISTANCE_AT_START = 0.19 - PORTAL_OFFSET[2];

/* Leather patch inside the vendored atlas, measured on the decoded 2048x2048
   buffer (scratchpad/leather-measure.cjs): raw rows 252..764, columns
   1474..1986 — a 512 px tile directly under the bill tile (which starts at
   raw row 764). Inset 2 px so the repeat never bleeds a neighbour. Texture v
   runs with the raw rows (KTX2 flipY false), so no flip is applied. */
const ATLAS = 2048;
export const LEATHER_RECT = Object.freeze([
  (1474 + 2) / ATLAS, (252 + 2) / ATLAS, (512 - 4) / ATLAS, (512 - 4) / ATLAS,
]);
/* the mirror's 640-px still tiles the 256-px leather ~2.5x across */
export const LEATHER_REPEAT = 2.5;
/* soften the still's border where the uv squeeze clamps it: v runs -.1..1.1
   across the circle, so the top/bottom 10 % would streak the still's edge
   rows without a feather; u runs exactly 0..1, so the sides need only a
   hairline (a wide side feather faded the forearms into the leather over
   ~60 px and dragged the medallion's measured shadow tone down — D-076 r2) */
const STILL_FEATHER = Object.freeze([0.012, 0.06]);

/* Fraction of the viewport height the still covers at t = 0 for a given
   vertical fov: 1.088 at fov 30 (desktop), 0.801 at fov 40 (phone). */
export function stillHeightFraction(fovDegrees) {
  const halfHeight = PORTAL_DISTANCE_AT_START * Math.tan(fovDegrees * Math.PI / 360);
  return PORTAL_PATCH.height / (2 * halfHeight);
}

const hv = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));

function createPlaceholderStill() {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createPortalMaterial(leatherTexture, stillTexture) {
  return new ShaderMaterial({
    name: "BillPortalMaterial",
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uLeather;
      uniform vec4 uLeatherRect;
      uniform float uLeatherRepeat;
      uniform sampler2D uStill;
      uniform float uStillReady;
      uniform vec2 uFeather;
      uniform float uOpacity;
      uniform vec3 uToneShadow;
      uniform vec3 uToneLit;
      uniform vec2 uToneRange;
      uniform float uToneMix;
      varying vec2 vUv;
      void main() {
        vec2 luv = uLeatherRect.xy + fract(vUv * uLeatherRepeat) * uLeatherRect.zw;
        vec3 leather = texture2D(uLeather, luv).rgb;
        vec4 still = texture2D(uStill, clamp(vUv, 0.0, 1.0)) * uStillReady;
        /* the reference hand's monochrome grade (D-076 r2): un-premultiply,
           luma, two-tone ramp in linear space, re-premultiply */
        vec3 straight = still.a > 1e-5 ? still.rgb / still.a : vec3(0.0);
        float luma = dot(straight, vec3(0.2126, 0.7152, 0.0722));
        vec3 graded = mix(uToneShadow, uToneLit, smoothstep(uToneRange.x, uToneRange.y, luma));
        still.rgb = mix(straight, graded, uToneMix) * still.a;
        vec2 edge = smoothstep(vec2(0.0), uFeather, vUv)
                  * smoothstep(vec2(0.0), uFeather, 1.0 - vUv);
        still *= edge.x * edge.y;
        vec3 rgb = still.rgb + leather * (1.0 - still.a);
        gl_FragColor = vec4(rgb, uOpacity);
        #include <colorspace_fragment>
      }
    `,
    uniforms: {
      uLeather: { value: leatherTexture },
      uLeatherRect: { value: new Vector4(...LEATHER_RECT) },
      uLeatherRepeat: { value: LEATHER_REPEAT },
      uStill: { value: stillTexture },
      uStillReady: { value: 0 },
      uFeather: { value: new Vector2(...STILL_FEATHER) },
      uOpacity: { value: 1 },
      uToneShadow: { value: new Vector3(...toneToLinear(PORTAL_TONE_SHADOW)) },
      uToneLit: { value: new Vector3(...toneToLinear(PORTAL_TONE_LIT)) },
      uToneRange: { value: new Vector2(...PORTAL_TONE_RANGE) },
      uToneMix: { value: 1 },
    },
    transparent: true,
    side: DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
}

/**
 * createBillPortal(leatherAtlas)
 *   mesh                 — add to the bill scene
 *   follow(hero)         — pose from the hero note (position + offset, rotation)
 *   setOpacity(value)    — 0..1; the mesh hides below .002
 *   setStill(bake)       — { data: Uint8Array(size*size*4), size } premultiplied
 *                          linear RGBA8, row 0 = bottom; null clears it
 *   state                — { opacity, visible, still, stillSize, heightFraction,
 *                            tone: { lit, shadow, range, mix } }
 *   dispose()
 */
export function createBillPortal(leatherAtlas) {
  const geometry = new CircleGeometry(PORTAL_RADIUS, 64);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setY(i, (uv.getY(i) - 0.5) * UV_SQUEEZE + 0.5);
  }
  uv.needsUpdate = true;

  const placeholder = createPlaceholderStill();
  let stillTexture = null;
  const material = createPortalMaterial(leatherAtlas, placeholder);
  const mesh = new Mesh(geometry, material);
  mesh.name = "BillPortal";
  mesh.scale.set(...PORTAL_SCALE);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  const offset = new Vector3(...PORTAL_OFFSET);
  const state = {
    opacity: 1,
    visible: true,
    still: "leather-only",
    stillSize: 0,
    heightFraction: stillHeightFraction(30),
    tone: { lit: PORTAL_TONE_LIT, shadow: PORTAL_TONE_SHADOW, range: [...PORTAL_TONE_RANGE], mix: 1 },
  };
  let disposed = false;

  function follow(hero) {
    if (!hero) return;
    mesh.position.copy(hero.position).add(offset);
    mesh.rotation.copy(hero.rotation);
    mesh.visible = state.visible && hero.visible;
    mesh.updateMatrixWorld(true);
  }

  function setOpacity(value) {
    const opacity = Math.max(0, Math.min(1, Number(value) || 0));
    state.opacity = opacity;
    state.visible = opacity > 0.002;
    material.uniforms.uOpacity.value = opacity;
    mesh.visible = state.visible;
  }

  function setStill(bake) {
    if (disposed) return;
    if (stillTexture) {
      stillTexture.dispose();
      stillTexture = null;
    }
    if (!bake || !bake.data || !(bake.size > 0)) {
      material.uniforms.uStill.value = placeholder;
      material.uniforms.uStillReady.value = 0;
      state.still = "leather-only";
      state.stillSize = 0;
      return;
    }
    const texture = new DataTexture(bake.data, bake.size, bake.size, RGBAFormat, UnsignedByteType);
    texture.name = "BillPortalStill";
    texture.colorSpace = LinearSRGBColorSpace;   // bake bytes are linear + premultiplied
    texture.flipY = false;                        // row 0 = v 0 = bottom, as read back
    texture.premultiplyAlpha = false;             // already premultiplied by the bake
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    stillTexture = texture;
    material.uniforms.uStill.value = texture;
    material.uniforms.uStillReady.value = 1;
    state.still = "zero-stage";
    state.stillSize = bake.size;
  }

  function setViewFov(fovDegrees) {
    state.heightFraction = stillHeightFraction(fovDegrees);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    material.dispose();
    placeholder.dispose();
    stillTexture?.dispose();
    stillTexture = null;
  }

  return {
    mesh,
    follow,
    setOpacity,
    setStill,
    setViewFov,
    dispose,
    get state() {
      return { ...state, tone: { ...state.tone, range: [...state.tone.range] } };
    },
  };
}

export default createBillPortal;
