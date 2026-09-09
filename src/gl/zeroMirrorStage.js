/* ── ZeroMirror stage-one bridge ──────────────────────────────────────────
   This module is intentionally self-contained. It reuses an owner-supplied
   WebGLRenderer, but owns its scenes, camera, animation mixers, materials,
   textures and geometry. The parent timeline only needs to call update() and
   render().

   Progress contract
   -----------------
   0.00 .. 0.95  -> ZeroMirror stage-one source progress 0.00 .. 0.95
   0.95 .. 1.00  -> frozen source frame 0.95 plus bridgeProgress 0.00 .. 1.00

   ZeroMirror's original coin pops, camera interpolation and petal simulation
   integrate wall-clock time. Here those motions are sampled from progress so
   a given scroll position produces the same frame in either direction.

   The bridge also carries a small scroll-driven camera push-in (ENDING_ZOOM)
   that rides the wrists' approach and holds through contact. */
import {
  AnimationMixer,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LoopOnce,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  NormalBlending,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

import FANCY_HAND_URL from "../assets/zero-stage/fancy_hand_2.glb?url";
import HUMAN_HAND_URL from "../assets/zero-stage/human_hand_1.glb?url";
import CAMERA_URL from "../assets/zero-stage/camera_1.glb?url";
import MATCAP_URL from "../assets/zero-stage/matcap-hand.webp?url";
import HUMAN_HANDS_ATLAS_URL from "../assets/zero-stage/human_hands.ktx2?url";
import SPC_ATLAS_URL from "../assets/zero-stage/shards-petals-coins.ktx2?url";
import GARDEN_ATLAS_URL from "../assets/zero-stage/garden-godrays.ktx2?url";
import LANDSCAPE_SKY_URL from "../assets/zero-stage/landscape/sky.png?url";
import LANDSCAPE_CLOUDS_URL from "../assets/zero-stage/landscape/clouds.png?url";
import LANDSCAPE_LAND_URL from "../assets/zero-stage/landscape/land.png?url";
import MEET_FISTBUMP_URL from "../assets/meet-fistbump.glb?url";
import { COIN_LOGOS, createCoinLogoTexture } from "./coinLogos.js";

export const ZERO_STAGE_BRIDGE_START = 0.95;
export const ZERO_STAGE_SOURCE_END = 0.95;

const BASIS_PATH = "/zero-stage/basis/";
const DRACO_PATH = "/draco/";
const PETAL_COUNT = 450;
const TAU = Math.PI * 2;
const CAMERA_RIG_FOCAL_DISTANCE = 1;
const CAMERA_RIG_MAX_OFFSET = 0.18;
const CAMERA_RIG_SMOOTH_TC = 0.12;
const BACKGROUND_PARALLAX_SMOOTH_TC = 1 / 6;
const SOURCE_VIRTUAL_DURATION = 13.128956;
const SOURCE_BRIDGE_CLIP_PROGRESS = 0.7 * ((ZERO_STAGE_SOURCE_END - 0.01) / 0.99);
/* Only the anatomical closing pose is borrowed. Both visible meshes, their
   arm transforms, camera, skin treatment and garden belong to ZeroMirror.
   Each source hand borrows the pose of ITS OWN rig in meet-fistbump.glb
   (green <- Hand_Green, human <- Hand_Human), sampled at this one clip
   progress. The two rigs share DEF-*.L bone names but not bone placement:
   human_hand_1's DEF bones sit 25-65 mm off its own skin, so transplanting
   the green rig's quaternions onto the human pivoted its thumb around the
   wrong points and hooked it into a claw (9 Sep 2026). The pipeline solves
   the human fist on the human rig, and production loads the byte-identical
   asset, so the Hand_Human pose is the right one for the production human
   once it is carried into that rig's bone frame (see solveDonorFrame). The
   borrowed pose is the complete closing-bone transform (position, rotation,
   scale), never the rotation alone (see setFistBonePose). */
const SOURCE_FIST_DONOR_PROGRESS = 0.75;
const SOURCE_FIST_DIAGONAL_ANGLE = MathUtils.degToRad(35);
/* Fist frame rotation (client request, 9 Sep 2026: "Rotate about 45 degree"
   with two arcs drawn over the contact screenshot, green fist clockwise on
   screen, human fist counter-clockwise). The sketch is ambiguous in 3D, so
   three candidate rotations exist. Each is a pure rotation of the desired
   knuckle frame built in prepareSourceFistBump (see rotateFistFrame), applied
   in the order roll -> spin -> tip, in degrees:
     ROLL  about the finger/forearm axis (desiredY). Positive turns the thumb
           side of BOTH fists toward the camera, negative away from it.
     SPIN  in the camera plane (about camera forward). Positive is as drawn:
           green clockwise on screen, human counter-clockwise.
     TIP   about the across-the-knuckles axis (desiredX). Positive brings the
           knuckles toward the camera, negative away.
   Six candidates were rendered through the preview override below into
   shots-zero-ending/rotation-candidates/ (sheet.png). On 9 Sep 2026 the
   client chose candidate 3 (3-roll45-toward.png): ROLL 45, spin 0, tip 0,
   i.e. each fist rolled 45 degrees about its own forearm/finger axis so both
   thumbs face the camera, lying across the fingers as in the photo
   reference. That choice ships here; the query override stays a preview
   aid (a production URL without a query renders exactly these constants).
   Contact axis, knuckle re-solve, wrist targets, settle, diagonal and
   ENDING_ZOOM are untouched by these. */
const FIST_FRAME_ROLL_DEG = 45;
const FIST_FRAME_SPIN_DEG = 0;
const FIST_FRAME_TIP_DEG = 0;
/* Preview-only override: ?fistRoll=45 / ?fistSpin=45 / ?fistTip=-45
   (degrees), read ONCE at module load from the URL query in the browser,
   the same way consultAnimationMode.js reads ?consultAnimation=legacy. A
   missing or non-numeric param falls back to the constant, so production
   URLs render the constants above. Nothing else here reads the query. */
const FIST_FRAME_PREVIEW = (() => {
  const query = typeof location === "undefined" ? null : new URLSearchParams(location.search);
  const read = (name, fallback) => {
    const value = query ? Number.parseFloat(query.get(name)) : NaN;
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    roll: MathUtils.degToRad(read("fistRoll", FIST_FRAME_ROLL_DEG)),
    spin: MathUtils.degToRad(read("fistSpin", FIST_FRAME_SPIN_DEG)),
    tip: MathUtils.degToRad(read("fistTip", FIST_FRAME_TIP_DEG)),
  };
})();
/* Ending push-in (client request, 9 Sep 2026: the fist bump "a bit zoomed
   in"). The camera's vertical FOV tightens by this fraction, so the fists
   read ~11-12% larger at contact (30 -> 27 deg desktop, 40 -> 36 deg phone).
   It ramps over the same bridge window as the wrists' approach in
   applySourceFistBump (0.12 .. 0.80) and then holds at full strength through
   contact and the WE SCALE title. Contact point, diagonal, wrist targets and
   beat boundaries are untouched; only the lens changes, on desktop and phone
   alike. Pure function of scroll.
   Taste knob (review, 9 Sep 2026): 0.12 (~14% larger) read as "modestly"
   rather than "a bit" closer and left the human thumb ~30 px from the phone
   frame edge, so it ships at 0.10. Anything in 0.08 .. 0.15 is safe with this
   ramp; move only this constant, never the ramp window below. */
const ENDING_ZOOM = 0.10;
const ENDING_ZOOM_RAMP_START = 0.12;
const ENDING_ZOOM_RAMP_END = 0.80;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const inverseLerp = (value, start, end) => clamp01((value - start) / (end - start));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function collectBoneMap(scope) {
  const bones = new Map();
  scope?.traverse((object) => {
    if (object.isBone && object.name && !bones.has(object.name)) {
      bones.set(object.name, object);
    }
  });
  return bones;
}

/* Turns one hand's desired knuckle frame by FIST_FRAME_PREVIEW (see the
   FIST_FRAME_*_DEG constants). `desiredX` (pinky -> index, the thumb side)
   and `desiredY` (wrist -> knuckles, along the contact diagonal) are rotated
   in place; the caller recomputes desiredZ. Every step is a pure rotation
   about a single axis, so the frame stays orthonormal. The sign of each step
   is resolved geometrically per hand, never hard-coded, so one positive value
   reads the same on both fists: roll turns the thumb side toward the viewer,
   spin turns the fist the way the client drew (green clockwise on screen,
   human counter-clockwise), tip brings the knuckles toward the viewer.
   `clockwiseOnScreen` is true for the green hand. */
function rotateFistFrame(desiredX, desiredY, right, up, forward, clockwiseOnScreen) {
  const { roll, spin, tip } = FIST_FRAME_PREVIEW;
  if (!roll && !spin && !tip) return;
  const toward = forward.clone().negate();
  const turned = (vector, axis, angle) => (
    vector.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle))
  );
  if (roll) {
    // Which way about the finger axis carries the thumb side toward the camera?
    const sign = turned(desiredX, desiredY, Math.abs(roll)).dot(toward)
      >= turned(desiredX, desiredY, -Math.abs(roll)).dot(toward) ? 1 : -1;
    desiredX.copy(turned(desiredX, desiredY, sign * roll)).normalize();
  }
  if (spin) {
    // A clockwise turn on screen takes `up` toward `right`; the human fist
    // turns the opposite way, as drawn.
    const clockwise = turned(up, forward, Math.abs(spin)).dot(right) > 0 ? 1 : -1;
    const angle = (clockwiseOnScreen ? clockwise : -clockwise) * spin;
    desiredX.copy(turned(desiredX, forward, angle)).normalize();
    desiredY.copy(turned(desiredY, forward, angle)).normalize();
  }
  if (tip) {
    // Which way about the knuckle axis brings the knuckles toward the camera?
    const sign = turned(desiredY, desiredX, Math.abs(tip)).dot(toward)
      >= turned(desiredY, desiredX, -Math.abs(tip)).dot(toward) ? 1 : -1;
    desiredY.copy(turned(desiredY, desiredX, sign * tip)).normalize();
  }
  // Re-orthogonalise against drift from the successive rotations.
  desiredX.addScaledVector(desiredY, -desiredX.dot(desiredY)).normalize();
}

/* Donor rigs share one GLB, and three's GLTFLoader keeps node names unique
   per file: the second armature's bones load as `DEF-thumb03L_1`. So the
   donor is keyed by the canonical (dedupe-suffix stripped) bone name, which is
   what the single-rig source GLBs use. Rigify DEF names end in ".L", never in
   a digit, so the strip cannot eat a real bone name. */
function collectDonorBoneMap(scope) {
  const bones = new Map();
  scope?.traverse((object) => {
    if (!object.isBone || !object.name) return;
    const name = object.name.replace(/_[0-9]+$/, "");
    if (!bones.has(name)) bones.set(name, object);
  });
  return bones;
}

/* The two donor rigs do not share bone frames with each other, and only one
   of them shares frames with the production hands. The pipeline builds
   Hand_Human by turning the green armature 180 degrees about its Z axis
   (every Hand_Human bone rest is the matching Hand_Green rest conjugated by
   that half-turn: x and y negated, z kept), whereas production's human rig
   keeps the green-identical bone rests and mirrors the whole hand with a
   scale(-1) on the rig node. A donor quaternion is therefore carried into the
   target bone frame by conjugation with the half-turn that maps the donor's
   bone rests onto the target's. Applied raw, Hand_Human's negated flexion
   opened the production human fist into a claw (9 Sep 2026). The half-turn
   is measured from the rest poses, never assumed: the candidate with the
   smallest rest mismatch wins, and identity wins for a donor that already
   shares frames with its target (green <- Hand_Green). Only the closing
   bones are scored: the root DEF-upper_arm is placed by the rig transform
   (production mirrors it with the scale(-1)), so it is a half-turn off by
   design and never borrowed. */
const DONOR_FRAME_CANDIDATES = [
  { label: "identity", turn: new Quaternion(0, 0, 0, 1) },
  { label: "half-turn X", turn: new Quaternion(1, 0, 0, 0) },
  { label: "half-turn Y", turn: new Quaternion(0, 1, 0, 0) },
  { label: "half-turn Z", turn: new Quaternion(0, 0, 1, 0) },
];

function conjugateQuaternion(quaternion, turn) {
  return turn.clone().multiply(quaternion).multiply(turn.clone().invert());
}

function solveDonorFrame(donorRest, targetRest, includeBone) {
  let best = { ...DONOR_FRAME_CANDIDATES[0], error: Infinity, bones: 0 };
  DONOR_FRAME_CANDIDATES.forEach((candidate) => {
    let error = 0;
    let bones = 0;
    targetRest.forEach((rest, name) => {
      const donor = donorRest.get(name);
      if (!donor || !includeBone(name)) return;
      const carried = conjugateQuaternion(donor.quaternion, candidate.turn);
      error += 2 * Math.acos(Math.min(1, Math.abs(carried.dot(rest.quaternion))));
      bones += 1;
    });
    if (bones > 0 && error / bones < best.error) {
      best = { ...candidate, error: error / bones, bones };
    }
  });
  return best;
}

function findWristBone(bones) {
  /* Three sanitises Blender names differently across loader revisions
     (`DEF-hand.L`, `DEF-handL`, or an underscore form). The green armature is
     already scoped, so the one DEF-hand bone is the unambiguous wrist. */
  return bones.get("DEF-hand.L")
    || bones.get("DEF-handL")
    || [...bones.entries()].find(([name]) => /^DEF[-_]?hand(?:[._-]?L)?$/i.test(name))?.[1]
    || [...bones.entries()].find(([name]) => /^DEF[-_]?hand/i.test(name))?.[1]
    || null;
}

function captureBonePose(bones) {
  const pose = new Map();
  bones.forEach((bone, name) => {
    pose.set(name, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    });
  });
  return pose;
}

function captureTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

function elasticOut(value) {
  const t = clamp01(value);
  if (t === 0 || t === 1) return t;
  // Same curve used by the source ring's 128-entry elastic lookup table.
  return 2 ** (-8 * t) * Math.sin((t - 0.9 / 4) * TAU / 0.9) + 1;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFallbackTexture(r = 255, g = 255, b = 255, a = 255) {
  const texture = new DataTexture(
    new Uint8Array([r, g, b, a]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createHumanHandMaterial(atlas) {
  return new ShaderMaterial({
    name: "ZeroStageHumanHandMaterial",
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <skinning_pars_vertex>

      void main() {
        vUv = uv;
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;

      uniform sampler2D uTextureA;
      uniform sampler2D uTextureB;
      uniform vec2 uTexOffsetA;
      uniform vec2 uTexScaleA;
      uniform vec2 uTexOffsetB;
      uniform vec2 uTexScaleB;
      uniform float uProgress;
      uniform float uOpacity;
      uniform sampler2D uAlphaMap;
      uniform vec2 uAlphaOffset;
      uniform vec2 uAlphaScale;
      varying vec2 vUv;

      void main() {
        vec4 colorA = texture2D(uTextureA, vUv * uTexScaleA + uTexOffsetA);
        vec4 colorB = texture2D(uTextureB, vUv * uTexScaleB + uTexOffsetB);
        vec4 premulA = vec4(colorA.rgb * colorA.a, colorA.a);
        vec4 premulB = vec4(colorB.rgb * colorB.a, colorB.a);
        vec4 blended = mix(premulA, premulB, uProgress);
        float alphaMask = texture2D(
          uAlphaMap,
          vUv * uAlphaScale + uAlphaOffset
        ).r;
        float outAlpha = blended.a * uOpacity * alphaMask;
        vec3 outColor = blended.rgb * uOpacity * alphaMask;
        if (outAlpha < 0.003) discard;
        gl_FragColor = vec4(outColor, outAlpha);
      }
    `,
    uniforms: {
      uTextureA: { value: atlas },
      uTextureB: { value: atlas },
      uTexOffsetA: { value: new Vector2(0, 1) },
      uTexScaleA: { value: new Vector2(0.25, -0.25) },
      uTexOffsetB: { value: new Vector2(0, 1) },
      uTexScaleB: { value: new Vector2(0.25, -0.25) },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uAlphaMap: { value: atlas },
      uAlphaOffset: { value: new Vector2(0.75, 0.25) },
      uAlphaScale: { value: new Vector2(0.25, -0.25) },
    },
    transparent: true,
    premultipliedAlpha: true,
    side: FrontSide,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
  });
}

const GARDEN_ATLAS_WIDTH = 4096;
const GARDEN_ATLAS_HEIGHT = 2661;
const GARDEN_SCALE = 1 / 1751;
const GARDEN_LAYERS = [
  { rect: [2382, 19, 1714, 1714], center: [0.5, 0.555], scale: 2.01, depth: 1 },
  { rect: [0, 2, 1751, 815], center: [0.5, 0], scale: 1.94, depth: 0 },
  { rect: [0, 819, 1751, 531], center: [0.5, 0.23], scale: 1.82, depth: 0.2 },
  { rect: [0, 1354, 1751, 547], center: [0.5, 0.28], scale: 1.75, depth: 0.4 },
  { rect: [2048, 0, 325, 629], center: [0.685, 0.54], scale: 1.03, depth: 0.28 },
  { rect: [1760, 0, 269, 538], center: [0.305, 0.54], scale: 1.1, depth: 0.34 },
].sort((a, b) => b.depth - a.depth);

const GOD_RAY_RECTS = [
  [0, 1918, 1320, 743],
  [1320, 1918, 1320, 743],
  [2642, 1918, 1320, 743],
];

function normalizedGardenRect([x, y, width, height]) {
  return new Vector4(
    x / GARDEN_ATLAS_WIDTH,
    1 - (y + height) / GARDEN_ATLAS_HEIGHT,
    width / GARDEN_ATLAS_WIDTH,
    height / GARDEN_ATLAS_HEIGHT,
  );
}

function coverScale(textureAspect, viewportAspect, target) {
  if (textureAspect > viewportAspect) {
    target.set(viewportAspect / textureAspect, 1);
  } else {
    target.set(1, textureAspect / viewportAspect);
  }
  return target;
}

function createBackgroundMaterial(fallbackTexture) {
  const layerRects = GARDEN_LAYERS.map(({ rect }) => normalizedGardenRect(rect));
  const layerHalfSizes = GARDEN_LAYERS.map(({ rect, scale }) => new Vector2(
    rect[2] * GARDEN_SCALE * scale * 0.5,
    rect[3] * GARDEN_SCALE * scale * 0.5,
  ));
  const layerCenters = GARDEN_LAYERS.map(({ center }) => new Vector2(...center));
  const layerDepths = new Float32Array(GARDEN_LAYERS.map(({ depth }) => depth));

  return new ShaderMaterial({
    name: "ZeroStageBackgroundMaterial",
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      #define NUM_GARDEN_LAYERS 6
      varying vec2 vUv;
      uniform sampler2D uGardenAtlas;
      uniform float uGardenReady;
      uniform sampler2D uLandscapeSky;
      uniform sampler2D uLandscapeClouds;
      uniform sampler2D uLandscapeLand;
      uniform float uLandscapeReady;
      uniform float uLandscapeBlurRadius;
      uniform vec2 uViewportSize;
      uniform float uSourceProgress;
      uniform float uOpacity;
      uniform float uViewportAspect;
      uniform vec2 uParallax;
      uniform float uParallaxAmp;
      uniform vec4 uLayerRect[NUM_GARDEN_LAYERS];
      uniform vec2 uLayerHalfSize[NUM_GARDEN_LAYERS];
      uniform vec2 uLayerCenter[NUM_GARDEN_LAYERS];
      uniform float uLayerDepth[NUM_GARDEN_LAYERS];
      uniform vec4 uGodRayRectA;
      uniform vec4 uGodRayRectB;
      uniform vec2 uGodRayCoverA;
      uniform vec2 uGodRayCoverB;
      uniform float uGodRayBlend;
      uniform float uGodRayOpacity;

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }

      vec3 sourceCyan(vec2 uv) {
        vec2 topDelta = (uv - vec2(0.5, 0.0)) / vec2(0.85, 0.7);
        vec2 bottomDelta = (uv - vec2(0.5, 1.0)) / vec2(0.85, 0.7);
        float topFalloff = saturate(1.0 - length(topDelta));
        float bottomFalloff = saturate(1.0 - length(bottomDelta));
        topFalloff = topFalloff * topFalloff * (3.0 - 2.0 * topFalloff);
        bottomFalloff = bottomFalloff * bottomFalloff * (3.0 - 2.0 * bottomFalloff);
        float glow = min(1.0, topFalloff + bottomFalloff);
        vec3 baseColor = vec3(110.0, 200.0, 230.0) / 255.0;
        vec3 glowColor = vec3(170.0, 235.0, 215.0) / 255.0;
        return mix(baseColor, glowColor, glow);
      }

      vec4 gardenLayer(int index) {
        vec2 halfSize = vec2(
          uLayerHalfSize[index].x / uViewportAspect,
          uLayerHalfSize[index].y
        );
        vec2 shift = uParallax * (uParallaxAmp * uLayerDepth[index]);
        vec2 localUv = (vUv - uLayerCenter[index] - shift) / (2.0 * halfSize) + 0.5;
        if (
          localUv.x < 0.0 || localUv.x > 1.0 ||
          localUv.y < 0.0 || localUv.y > 1.0
        ) return vec4(0.0);
        return texture2D(
          uGardenAtlas,
          uLayerRect[index].xy + localUv * uLayerRect[index].zw
        );
      }

      vec3 originalGardenStack() {
        if (uGardenReady < 0.5) return vec3(1.0);

        vec2 halfSize = vec2(
          uLayerHalfSize[0].x / uViewportAspect,
          uLayerHalfSize[0].y
        );
        vec2 shift = uParallax * (uParallaxAmp * uLayerDepth[0]);
        vec2 localUv = clamp(
          (vUv - uLayerCenter[0] - shift) / (2.0 * halfSize) + 0.5,
          0.0,
          1.0
        );
        vec3 result = texture2D(
          uGardenAtlas,
          uLayerRect[0].xy + localUv * uLayerRect[0].zw
        ).rgb;

        for (int index = 1; index < NUM_GARDEN_LAYERS; index += 1) {
          vec4 layer = gardenLayer(index);
          result = mix(result, layer.rgb, layer.a);
        }

        result = mix(result, vec3(1.0), 0.05);
        float luminance = dot(result, vec3(0.299, 0.587, 0.114));
        float bloom = smoothstep(0.42, 1.0, luminance);
        return result + bloom * bloom * 0.15;
      }

      vec4 landscapeLayer(sampler2D layer, vec2 uv) {
        if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0);
        vec4 sampleColor = texture2D(layer, vec2(uv.x, 1.0 - uv.y));
        // These supplied cutouts retain saturated key colors in faint edge
        // pixels. A soft alpha choke hides that fringe without editing assets.
        sampleColor.a = smoothstep(0.2, 0.85, sampleColor.a);
        return sampleColor;
      }

      vec3 landscapeStack(vec2 screenUv) {
        // Register all layers against ONE 16:9 artboard, then cover/crop that
        // artboard once. Independently covering the 4:3 land breaks its horizon.
        const float artAspect = 1672.0 / 941.0;
        vec2 cover = vec2(min(1.0, uViewportAspect / artAspect),
                          min(1.0, artAspect / uViewportAspect));
        vec2 artUv = (vec2(screenUv.x, 1.0 - screenUv.y) - 0.5) * cover / 1.04 + 0.5;
        vec2 pointer = vec2(uParallax.x, -uParallax.y);
        vec2 farUv = clamp(artUv - pointer * 0.008, 0.0, 1.0);
        // The supplied sky is an irregular cutout, not an opaque backing.
        // Extend its verified opaque interior across the artboard so neither
        // its cut edge nor parallax can expose a hard seam/flat-color patch.
        // Every pixel still comes from the supplied sky, not generated art.
        vec3 color = texture2D(uLandscapeSky, vec2(
          mix(0.25, 0.75, farUv.x), 1.0 - min(0.4, farUv.y * 0.6)
        )).rgb;
        vec2 cloudUv = artUv + vec2(0.0, 0.29) - pointer * 0.008;
        vec4 clouds = landscapeLayer(uLandscapeClouds, cloudUv);
        color = mix(color, clouds.rgb, clouds.a);
        // Width-fit the 1448x1086 land (height 1.333 artboards), with the
        // horizon at ~60% and its transparent bottom safely below the crop.
        vec2 landUv = (artUv - vec2(-0.01, -0.15) - pointer * 0.016)
          / vec2(1.02, 1.02 * artAspect * 1086.0 / 1448.0);
        vec4 land = landscapeLayer(uLandscapeLand, landUv);
        return mix(color, land.rgb, land.a);
      }

      vec3 gardenStack() {
        if (uLandscapeReady < 0.5) return originalGardenStack();
        if (uLandscapeBlurRadius <= 0.0) return landscapeStack(vUv);

        // Gentle background-only softness. Sample the fully composited,
        // opaque landscape so alpha-cut cloud/land edges never bleed black.
        // Radius is in CSS pixels: the same softness at every screen DPR.
        vec2 stepUv = vec2(uLandscapeBlurRadius) / max(uViewportSize, vec2(1.0));
        vec3 color = vec3(0.0);
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            float weight = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
            vec2 uv = clamp(vUv + vec2(float(x), float(y)) * stepUv, 0.0, 1.0);
            color += landscapeStack(uv) * weight;
          }
        }
        return color / 16.0;
      }

      vec3 godRays() {
        if (uGardenReady < 0.5 || uGodRayOpacity < 0.001) return vec3(0.0);
        vec2 uvA = (vUv - 0.5) * uGodRayCoverA + 0.5;
        vec2 uvB = (vUv - 0.5) * uGodRayCoverB + 0.5;
        uvA = uGodRayRectA.xy + uvA * uGodRayRectA.zw;
        uvB = uGodRayRectB.xy + uvB * uGodRayRectB.zw;
        return mix(
          texture2D(uGardenAtlas, uvA).rgb,
          texture2D(uGardenAtlas, uvB).rgb,
          uGodRayBlend
        ) * uGodRayOpacity;
      }

      void main() {
        // The source textures were generated top-to-bottom and uploaded with
        // flipY enabled. Mirroring Y here keeps the analytic replacement in
        // the same convention.
        vec2 sourceUv = vec2(vUv.x, 1.0 - vUv.y);
        float whiteMix = saturate((uSourceProgress - 0.1) / 0.4);
        vec3 color = mix(sourceCyan(sourceUv), vec3(1.0), whiteMix);

        float gardenMix = saturate((uSourceProgress - 0.5) / 0.2);
        if (gardenMix > 0.0) color = mix(color, gardenStack(), gardenMix);
        color += godRays();

        gl_FragColor = vec4(color, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    uniforms: {
      uGardenAtlas: { value: fallbackTexture },
      uGardenReady: { value: 0 },
      uLandscapeSky: { value: fallbackTexture },
      uLandscapeClouds: { value: fallbackTexture },
      uLandscapeLand: { value: fallbackTexture },
      uLandscapeReady: { value: 0 },
      uLandscapeBlurRadius: { value: 3 },
      uViewportSize: { value: new Vector2(1, 1) },
      uSourceProgress: { value: 0 },
      uOpacity: { value: 0 },
      uViewportAspect: { value: 1 },
      uParallax: { value: new Vector2() },
      uParallaxAmp: { value: 0.07 },
      uLayerRect: { value: layerRects },
      uLayerHalfSize: { value: layerHalfSizes },
      uLayerCenter: { value: layerCenters },
      uLayerDepth: { value: layerDepths },
      uGodRayRectA: { value: normalizedGardenRect(GOD_RAY_RECTS[0]) },
      uGodRayRectB: { value: normalizedGardenRect(GOD_RAY_RECTS[1]) },
      uGodRayCoverA: { value: new Vector2(1, 1) },
      uGodRayCoverB: { value: new Vector2(1, 1) },
      uGodRayBlend: { value: 0 },
      uGodRayOpacity: { value: 0 },
    },
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/* ZeroMirror's stage1Foreground1 is a post-scene radial-pull texture. Applying
   the same mask in the background shader left both hands unnaturally dark;
   the reference composites it after the complete 3D pass. Keeping it as a
   separate full-screen layer restores the milky edge haze over hands, coins,
   petals and garden alike. */
function createForegroundMaterial() {
  return new ShaderMaterial({
    name: "ZeroStageForegroundMaterial",
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vUv;
      uniform float uOpacity;
      uniform float uSourceProgress;
      uniform sampler2D uGardenAtlas;
      uniform float uGardenReady;
      uniform vec4 uGodRayRectA;
      uniform vec4 uGodRayRectB;
      uniform vec2 uGodRayCoverA;
      uniform vec2 uGodRayCoverB;
      uniform float uGodRayBlend;
      uniform float uGodRayOpacity;

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }

      float sourceFrostAlpha(vec2 uv) {
        float x = uv.x;
        float y = uv.y;
        float leftWeight = 2.0 * x * x - 3.0 * x + 1.0;
        float centerWeight = -4.0 * x * x + 4.0 * x;
        float rightWeight = 2.0 * x * x - x;
        float top = 0.03 * leftWeight + 0.0 * centerWeight + 0.03 * rightWeight;
        float bottom = 1.0 * leftWeight + 0.35 * centerWeight + 1.0 * rightWeight;
        float alpha = mix(top, bottom, y);
        vec2 centered = uv - 0.5;
        float gaussian = exp(-dot(centered, centered) / (2.0 * 0.25 * 0.25));
        return saturate(mix(alpha, 0.0, gaussian));
      }

      void main() {
        vec2 sourceUv = vec2(vUv.x, 1.0 - vUv.y);
        float frost = sourceFrostAlpha(sourceUv);
        /* The RGB is the reference's exact radial-pull colour. A small white
           lift arrives with the garden, mimicking its bright foreground grade
           without bleaching the cyan hand-entry frames. */
        float gardenLift = smoothstep(0.45, 0.72, uSourceProgress);
        vec3 frostColor = vec3(150.0, 191.0, 174.0) / 255.0;
        frostColor = mix(frostColor, vec3(0.96, 0.99, 0.98), gardenLift * 0.24);

        vec3 rays = vec3(0.0);
        if (uGardenReady > 0.5 && uGodRayOpacity > 0.001) {
          vec2 uvA = (vUv - 0.5) * uGodRayCoverA + 0.5;
          vec2 uvB = (vUv - 0.5) * uGodRayCoverB + 0.5;
          uvA = uGodRayRectA.xy + uvA * uGodRayRectA.zw;
          uvB = uGodRayRectB.xy + uvB * uGodRayRectB.zw;
          rays = mix(
            texture2D(uGardenAtlas, uvA).rgb,
            texture2D(uGardenAtlas, uvB).rgb,
            uGodRayBlend
          ) * uGodRayOpacity;
        }

        float alpha = frost * uOpacity;
        gl_FragColor = vec4(frostColor * alpha + rays * uOpacity, alpha);
      }
    `,
    uniforms: {
      uOpacity: { value: 1 },
      uSourceProgress: { value: 0 },
      uGardenAtlas: { value: null },
      uGardenReady: { value: 0 },
      uGodRayRectA: { value: normalizedGardenRect(GOD_RAY_RECTS[0]) },
      uGodRayRectB: { value: normalizedGardenRect(GOD_RAY_RECTS[1]) },
      uGodRayCoverA: { value: new Vector2(1, 1) },
      uGodRayCoverB: { value: new Vector2(1, 1) },
      uGodRayBlend: { value: 0 },
      uGodRayOpacity: { value: 0 },
    },
    transparent: true,
    premultipliedAlpha: true,
    blending: NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createLensDownMaterial() {
  return new ShaderMaterial({
    name: "ZeroStageLensDownMaterial",
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

function createLensUpMaterial() {
  return new ShaderMaterial({
    name: "ZeroStageLensUpMaterial",
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

function createLensCompositeMaterial(originalTexture) {
  return new ShaderMaterial({
    name: "ZeroStageLensCompositeMaterial",
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D tOriginal;
      uniform sampler2D tBlurred;
      uniform vec2 uResolution;
      uniform float uBlurStrength;
      varying vec2 vUv;
      void main() {
        float aspect = uResolution.x / uResolution.y;
        vec2 delta = (vUv - vec2(0.5)) * vec2(aspect, 1.0);
        float blend = smoothstep(0.3, 0.6, length(delta)) * uBlurStrength;
        gl_FragColor = mix(
          texture2D(tOriginal, vUv),
          texture2D(tBlurred, vUv),
          blend
        );
      }
    `,
    uniforms: {
      tOriginal: { value: originalTexture },
      tBlurred: { value: null },
      uResolution: { value: new Vector2(1, 1) },
      uBlurStrength: { value: 1 },
    },
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

/* The imported stage is rendered opaque, lens-blurred, foreground-graded, and
   only then faded once over Buildanta. This avoids applying entry opacity to
   both the background and every translucent hand pixel. */
function createCompositeMaterial(texture) {
  return new ShaderMaterial({
    name: "ZeroStageCompositeMaterial",
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float uOpacity;
      uniform vec2 uNoiseOffset;
      uniform float uGrade;

      vec3 linearToSRGB(vec3 color) {
        color = clamp(color, 0.0, 1.0);
        return mix(
          1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
          color * 12.92,
          vec3(lessThan(color, vec3(0.0031308)))
        );
      }

      float noise(vec2 point) {
        return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec4 sceneColor = texture2D(uTexture, vUv);
        vec2 noiseUv = gl_FragCoord.xy * 0.00390625 + uNoiseOffset;
        vec3 color = sceneColor.rgb + (noise(noiseUv) - 0.5) * 0.04 * uGrade;
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, 1.0 + 0.08 * uGrade);
        gl_FragColor = vec4(linearToSRGB(color), sceneColor.a * uOpacity);
      }
    `,
    uniforms: {
      uTexture: { value: texture },
      uOpacity: { value: 0 },
      uNoiseOffset: { value: new Vector2() },
      uGrade: { value: 1 },
    },
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

const PETAL_RECTS = [
  [0, 1249, 256, 234],
  [256, 1249, 256, 311],
  [0, 1483, 256, 311],
  [256, 1560, 256, 311],
  [986, 1243, 256, 311],
  [1242, 1243, 256, 311],
  [1498, 1243, 256, 311],
  [1754, 1243, 256, 311],
  [986, 1560, 256, 311],
  [1242, 1560, 256, 311],
  [1498, 1560, 256, 311],
  [1754, 1560, 256, 311],
].map(([x, y, width, height]) => [
  x / 2048,
  1 - (y + height) / 2048,
  width / 2048,
  height / 2048,
]);

const PETAL_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec3 aVelocity;
  attribute float aPhase;
  attribute vec4 aPetalRect;
  attribute float aScale;
  attribute vec2 aRotSpeed;

  uniform float uTime;
  uniform float uSwirlTime;
  uniform vec3 uBounds;
  uniform vec3 uBoundsCenter;
  uniform float uEntry;

  varying vec2 vUv;
  varying vec4 vPetalRect;
  varying float vOpacity;
  varying float vBrightness;
  varying float vSaturation;
  varying float vFresnel;

  vec3 wrapPos(vec3 position, vec3 bounds) {
    return mod(position + bounds, 2.0 * bounds) - bounds;
  }

  void main() {
    vec3 centeredPosition = wrapPos(
      aOffset + aVelocity * uTime - uBoundsCenter,
      uBounds
    );

    float entryStagger = aPhase / 6.28318530718;
    float entryT = clamp((uEntry - entryStagger * 0.3) / 0.7, 0.0, 1.0);
    float entryEase = entryT * entryT * (3.0 - 2.0 * entryT);
    centeredPosition.x += (1.0 - entryEase) * uBounds.x * 3.0;

    float swirlAngle = uSwirlTime * (0.2 + aPhase * 0.1);
    float swirlCos = cos(swirlAngle);
    float swirlSin = sin(swirlAngle);
    centeredPosition.xz = mat2(
      swirlCos,
      -swirlSin,
      swirlSin,
      swirlCos
    ) * centeredPosition.xz;

    centeredPosition.x += sin(
      centeredPosition.y * 8.0 + uTime * 1.3 + aPhase
    ) * 0.02 * entryEase;
    centeredPosition.z += sin(
      centeredPosition.y * 6.0 + uTime * 1.17 + aPhase * 1.7
    ) * 0.02 * entryEase;
    centeredPosition.y += sin(
      centeredPosition.x * 7.0 + uTime * 0.91 + aPhase * 0.5
    ) * 0.01 * entryEase;

    float fadeX = smoothstep(
      0.0,
      0.3,
      (uBounds.x - abs(centeredPosition.x)) / uBounds.x
    );
    float fadeY = smoothstep(
      0.0,
      0.3,
      (uBounds.y - abs(centeredPosition.y)) / uBounds.y
    );
    float fadeZ = smoothstep(
      0.0,
      0.3,
      (uBounds.z - abs(centeredPosition.z)) / uBounds.z
    );
    vOpacity = fadeX * fadeY * fadeZ;

    if (vOpacity < 0.001) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }

    vec3 positionLocal = position * aScale;
    float wave = position.x * 6.0 + uTime * 3.0 + aPhase;
    positionLocal.z += sin(wave) * 0.12 * aScale;

    float angleX = aPhase + uTime * aRotSpeed.x;
    float angleY = aPhase * 1.3 + uTime * aRotSpeed.y;
    float cosX = cos(angleX);
    float sinX = sin(angleX);
    float cosY = cos(angleY);
    float sinY = sin(angleY);
    mat3 rotation = mat3(
      cosY, sinY * sinX, sinY * cosX,
      0.0, cosX, -sinX,
      -sinY, cosY * sinX, cosY * cosX
    );
    positionLocal = rotation * positionLocal;

    float dzdx = cos(wave) * 6.0 * 0.12 * aScale;
    vec3 worldNormal = normalize(rotation * vec3(-dzdx, 0.0, 1.0));
    vec3 worldOffset = centeredPosition + uBoundsCenter;
    vec3 worldPosition = (
      modelMatrix * vec4(positionLocal + worldOffset, 1.0)
    ).xyz;
    vec3 viewDirection = normalize(cameraPosition - worldPosition);
    float fresnel = 1.0 - abs(dot(worldNormal, viewDirection));
    vFresnel = fresnel * fresnel;

    vUv = uv;
    vPetalRect = aPetalRect;
    vBrightness = 0.7 + fract(aPhase * 3.17) * 0.6;
    vSaturation = 0.6 + fract(aPhase * 5.43) * 0.8;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(
      positionLocal + worldOffset,
      1.0
    );
  }
`;

const PETAL_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec4 vPetalRect;
  varying float vOpacity;
  varying float vBrightness;
  varying float vSaturation;
  varying float vFresnel;

  void main() {
    vec2 atlasUv = vPetalRect.xy + vPetalRect.zw * (0.01 + vUv * 0.98);
    vec4 texel = texture2D(uAtlas, atlasUv);
    float outAlpha = texel.a * uOpacity * vOpacity;
    if (outAlpha < 0.005) discard;

    float luminance = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
    vec3 color = mix(vec3(luminance), texel.rgb, vSaturation) * vBrightness;
    float fresnelFactor = 0.65 + 1.15 * vFresnel;
    float baseLuminance = luminance * vBrightness;
    float newLuminance = baseLuminance * fresnelFactor;
    vec3 chroma = color - baseLuminance;
    color = newLuminance + chroma * (
      newLuminance / max(baseLuminance, 0.001)
    );
    gl_FragColor = vec4(color, outAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createPetals(atlas, seed = 0x5a17e1) {
  const baseGeometry = new PlaneGeometry(1, 1, 6, 3);
  const position = baseGeometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    position.setZ(index, (x * x + y * y) * 0.6);
  }
  position.needsUpdate = true;
  baseGeometry.computeVertexNormals();

  const geometry = new InstancedBufferGeometry();
  geometry.index = baseGeometry.index.clone();
  geometry.setAttribute("position", baseGeometry.getAttribute("position").clone());
  geometry.setAttribute("normal", baseGeometry.getAttribute("normal").clone());
  geometry.setAttribute("uv", baseGeometry.getAttribute("uv").clone());
  geometry.instanceCount = PETAL_COUNT;
  baseGeometry.dispose();

  const offsets = new Float32Array(PETAL_COUNT * 3);
  const velocities = new Float32Array(PETAL_COUNT * 3);
  const phases = new Float32Array(PETAL_COUNT);
  const rects = new Float32Array(PETAL_COUNT * 4);
  const scales = new Float32Array(PETAL_COUNT);
  const rotationSpeeds = new Float32Array(PETAL_COUNT * 2);
  const random = mulberry32(seed);

  for (let index = 0; index < PETAL_COUNT; index += 1) {
    offsets[index * 3] = -0.5 + (random() * 2 - 1) * 1.7;
    offsets[index * 3 + 1] = (random() * 2 - 1) * 0.7;
    offsets[index * 3 + 2] = (random() * 2 - 1) * 1.1;

    const speed = 0.07 + random() * (0.18 - 0.07);
    velocities[index * 3] = -speed * 1.732 + (random() - 0.5) * 0.08;
    velocities[index * 3 + 1] = -speed;
    velocities[index * 3 + 2] = (random() - 0.5) * 0.08;
    phases[index] = random() * TAU;

    const rect = PETAL_RECTS[Math.floor(random() * PETAL_RECTS.length)];
    rects.set(rect, index * 4);
    scales[index] = 0.0084 + random() * (0.06 - 0.0084);
    rotationSpeeds[index * 2] = 0.3 + random() * (1.2 - 0.3);
    rotationSpeeds[index * 2 + 1] = 0.3 + random() * (1.2 - 0.3);
  }

  geometry.setAttribute("aOffset", new InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("aVelocity", new InstancedBufferAttribute(velocities, 3));
  geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
  geometry.setAttribute("aPetalRect", new InstancedBufferAttribute(rects, 4));
  geometry.setAttribute("aScale", new InstancedBufferAttribute(scales, 1));
  geometry.setAttribute("aRotSpeed", new InstancedBufferAttribute(rotationSpeeds, 2));

  const material = new ShaderMaterial({
    name: "ZeroStagePetalMaterial",
    vertexShader: PETAL_VERTEX_SHADER,
    fragmentShader: PETAL_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uSwirlTime: { value: 0 },
      uAtlas: { value: atlas },
      uBounds: { value: new Vector3(1.7, 0.7, 1.1) },
      uBoundsCenter: { value: new Vector3(-0.5, 0, 0) },
      uOpacity: { value: 1 },
      uEntry: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = "ZeroStagePetals";
  mesh.frustumCulled = false;
  mesh.renderOrder = 30;

  const group = new Group();
  group.name = "ZeroStagePetalGroup";
  group.visible = false;
  group.add(mesh);
  return { group, mesh, geometry, material };
}

const COIN_SIDE_COLORS = [
  15331053,
  15330798,
  15724267,
  15723242,
  15265006,
  15591913,
  15657965,
  15396588,
];

function createCoinRing(logoImages, ownedTextures, seed = 0x0c01cafe, anisotropy = 1) {
  const group = new Group();
  group.name = "ZeroStageCoinRing";
  group.visible = false;

  const geometry = new CylinderGeometry(0.03, 0.03, 0.005, 24, 1, false);
  const materials = [];
  const coins = [];
  const random = mulberry32(seed);

  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * TAU;
    const logo = COIN_LOGOS[index];
    const logoTexture = createCoinLogoTexture(logoImages[index]?.image, logo, anisotropy);
    ownedTextures.add(logoTexture);
    const sideMaterial = new MeshBasicMaterial({
      color: COIN_SIDE_COLORS[index],
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    });
    const faceMaterial = new MeshBasicMaterial({
      map: logoTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    });
    materials.push(sideMaterial, faceMaterial);

    const mesh = new Mesh(geometry, [sideMaterial, faceMaterial, faceMaterial]);
    mesh.name = `ZeroStageCoin${index + 1}`;
    mesh.visible = false;
    mesh.rotation.z = Math.PI / 2;
    mesh.renderOrder = 22;
    mesh.userData.cosAngle = Math.cos(angle);
    mesh.userData.sinAngle = Math.sin(angle);
    mesh.userData.spinPhase = random() * TAU;
    mesh.userData.logoName = logo.name;
    group.add(mesh);
    coins.push(mesh);
  }

  return { group, geometry, materials, coins };
}

function createFallbackHand(material) {
  const group = new Group();
  group.name = "ZeroStageFallbackHand";
  const palmGeometry = new SphereGeometry(0.18, 18, 12);
  palmGeometry.scale(1.05, 0.8, 0.44);
  const palm = new Mesh(palmGeometry, material);
  palm.position.set(0, -0.02, 0);
  group.add(palm);

  const fingerGeometry = new CylinderGeometry(0.028, 0.038, 0.3, 12);
  for (let index = 0; index < 5; index += 1) {
    const finger = new Mesh(fingerGeometry, material);
    finger.position.set(-0.12 + index * 0.062, 0.18 + Math.sin(index) * 0.025, 0);
    finger.rotation.z = -0.08 + index * 0.035;
    group.add(finger);
  }
  group.rotation.z = -0.35;
  group.position.set(0.12, -0.05, -0.5);
  group.scale.setScalar(0.75);
  return { group, geometries: [palmGeometry, fingerGeometry] };
}

function setupPausedMixer(root, clips, mixers, actions) {
  if (!root || !clips?.length) return null;
  const mixer = new AnimationMixer(root);
  const localActions = clips.map((clip) => {
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    actions.push(action);
    return action;
  });
  mixers.push(mixer);
  return {
    mixer,
    actions: localActions,
    duration: Math.max(...clips.map((clip) => clip.duration || 0), 0),
  };
}

function sampleMixer(setup, progress) {
  if (!setup || setup.duration <= 0) return;
  const time = setup.duration * clamp01(progress);
  setup.actions.forEach((action) => {
    action.time = Math.min(time, Math.max(0, action.getClip().duration - 1e-5));
  });
  setup.mixer.update(0);
}

function disposeObjectResources(object, ownedMaterials, ownedGeometries, ownedTextures) {
  object?.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    if (child.geometry) ownedGeometries.add(child.geometry);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      ownedMaterials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) ownedTextures.add(value);
      });
    });
  });
}

/**
 * Create the ZeroMirror stage-one scene around an existing renderer.
 *
 * @param {import("three").WebGLRenderer} renderer
 * @param {{
 *   onBridgeUpdate?: (state: {
 *     progress:number,
 *     active:boolean,
 *     ready:boolean,
 *     handoffOpacity:number,
 *     referenceOpacity:number,
 *   }) => void,
 *   seed?: number,
 * }} options
 */
export function createZeroMirrorStage(renderer, options = {}) {
  if (!renderer?.isWebGLRenderer) {
    throw new TypeError("createZeroMirrorStage requires an existing WebGLRenderer");
  }

  const scene = new Scene();
  scene.name = "ZeroMirrorStageScene";
  const camera = new PerspectiveCamera(30, 1, 0.1, 30);
  camera.name = "ZeroMirrorStageCamera";
  camera.position.set(0, 0, 3);

  const backgroundScene = new Scene();
  backgroundScene.name = "ZeroMirrorStageBackgroundScene";
  const backgroundCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fallbackTexture = makeFallbackTexture();
  const backgroundMaterial = createBackgroundMaterial(fallbackTexture);
  const backgroundGeometry = new PlaneGeometry(2, 2);
  const backgroundQuad = new Mesh(backgroundGeometry, backgroundMaterial);
  backgroundQuad.frustumCulled = false;
  backgroundScene.add(backgroundQuad);

  const foregroundScene = new Scene();
  foregroundScene.name = "ZeroMirrorStageForegroundScene";
  const foregroundMaterial = createForegroundMaterial();
  const foregroundQuad = new Mesh(backgroundGeometry, foregroundMaterial);
  foregroundQuad.frustumCulled = false;
  foregroundScene.add(foregroundQuad);

  const makeColorTarget = (name, depthBuffer = false) => {
    const target = new WebGLRenderTarget(1, 1, {
      depthBuffer,
      stencilBuffer: false,
    });
    target.texture.name = name;
    target.texture.colorSpace = SRGBColorSpace;
    target.texture.generateMipmaps = false;
    target.texture.minFilter = LinearFilter;
    target.texture.magFilter = LinearFilter;
    return target;
  };
  const stageTarget = makeColorTarget("ZeroMirrorStageSceneTarget", true);
  const lensTargets = [0, 1, 2].map((index) => makeColorTarget(
    `ZeroMirrorStageLensTarget${index + 1}`,
  ));
  const resolvedTarget = makeColorTarget("ZeroMirrorStageResolvedTarget");

  const lensScene = new Scene();
  lensScene.name = "ZeroMirrorStageLensScene";
  const lensDownMaterial = createLensDownMaterial();
  const lensUpMaterial = createLensUpMaterial();
  const lensQuad = new Mesh(backgroundGeometry, lensDownMaterial);
  lensQuad.frustumCulled = false;
  lensScene.add(lensQuad);

  const lensCompositeScene = new Scene();
  lensCompositeScene.name = "ZeroMirrorStageLensCompositeScene";
  const lensCompositeMaterial = createLensCompositeMaterial(stageTarget.texture);
  const lensCompositeQuad = new Mesh(backgroundGeometry, lensCompositeMaterial);
  lensCompositeQuad.frustumCulled = false;
  lensCompositeScene.add(lensCompositeQuad);

  const compositeScene = new Scene();
  compositeScene.name = "ZeroMirrorStageCompositeScene";
  const compositeMaterial = createCompositeMaterial(resolvedTarget.texture);
  const compositeQuad = new Mesh(backgroundGeometry, compositeMaterial);
  compositeQuad.frustumCulled = false;
  compositeScene.add(compositeQuad);

  const root = new Group();
  root.name = "ZeroMirrorStageRoot";
  scene.add(root);

  const ownedMaterials = new Set([
    backgroundMaterial,
    foregroundMaterial,
    lensDownMaterial,
    lensUpMaterial,
    lensCompositeMaterial,
    compositeMaterial,
  ]);
  const ownedGeometries = new Set([backgroundGeometry]);
  const ownedTextures = new Set([fallbackTexture]);
  const mixers = [];
  const actions = [];
  const loadedRoots = [];
  const tempPosition = new Vector3();
  const tempPositionB = new Vector3();
  const tempPositionC = new Vector3();
  const tempQuaternion = new Quaternion();
  const tempRight = new Vector3();
  const tempUp = new Vector3();
  const tempForward = new Vector3();
  const pointerForward = new Vector3();
  const pointerRight = new Vector3();
  const pointerUp = new Vector3();
  const pointerFocalPoint = new Vector3();
  const pointerLookAtMatrix = new Matrix4();
  const rendererSize = new Vector2();
  const savedClearColor = new Color();
  const savedViewport = new Vector4();
  const savedScissor = new Vector4();

  let disposed = false;
  let fancySetup = null;
  let humanSetup = null;
  let cameraSetup = null;
  let meetTargetSetup = null;
  let greenHand = null;
  let greenRig = null;
  let greenWrist = null;
  let humanHand = null;
  let humanRig = null;
  let cameraReference = null;
  let meetTargetRoot = null;
  let meetTargetGreenRig = null;
  let meetTargetHumanRig = null;
  const meetTargetRests = new Map();
  let greenRigRestPose = null;
  let humanRigRestPose = null;
  let greenMaterial = null;
  let humanMaterial = null;
  let fallbackHandMaterial = null;
  let coinRing = null;
  let petals = null;
  let fancyFallback = null;
  let humanAtlas = fallbackTexture;
  let spcAtlas = fallbackTexture;
  let gardenAtlas = fallbackTexture;
  let greenRigNativePose = null;
  let humanRigNativePose = null;
  let sourceFistHands = [];
  const sourceFistCameraPosition = new Vector3();
  const sourceFistCameraQuaternion = new Quaternion();
  const sourceFistContact = new Vector3();

  const state = {
    progress: 0,
    sourceProgress: 0,
    bridgeProgress: 0,
    bridgeActive: false,
    bridgeReady: false,
    endingZoom: 0,
    referenceOpacity: 1,
    handoffOpacity: 0,
    opacity: 0,
    pointerX: 0,
    pointerY: 0,
    pointerTargetX: 0,
    pointerTargetY: 0,
    backgroundPointerX: 0,
    backgroundPointerY: 0,
    time: 0,
    width: 1,
    height: 1,
    mobile: false,
    coarsePointer: false,
    lensIterations: 3,
    ready: false,
    loadErrors: [],
  };
  let lastPointerTime = null;
  let hasNativePointerInput = false;

  const onPointerMove = (event) => {
    if (options.reducedMotion) return;
    const rect = renderer.domElement?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || state.width);
    const height = Math.max(1, rect?.height || state.height);
    const left = rect?.left || 0;
    const top = rect?.top || 0;
    state.pointerTargetX = MathUtils.clamp(
      ((event.clientX - left) / width) * 2 - 1,
      -1,
      1,
    );
    /* Keep the public/down-positive convention used by ConsultHand. It is
       inverted only for the camera's local-up translation below. */
    state.pointerTargetY = MathUtils.clamp(
      ((event.clientY - top) / height) * 2 - 1,
      -1,
      1,
    );
    hasNativePointerInput = true;
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
  }

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_PATH);
  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath(BASIS_PATH);
  ktx2Loader.detectSupport(renderer);
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);
  const textureLoader = new TextureLoader();

  function reportLoadError(label, error) {
    const message = error instanceof Error ? error.message : String(error);
    state.loadErrors.push({ asset: label, message });
    console.warn(`[zero-stage] ${label} unavailable; continuing with fallback`, error);
  }

  function resize(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      renderer.getSize(rendererSize);
      width = rendererSize.x;
      height = rendererSize.y;
    }
    state.width = Math.max(1, width || 1);
    state.height = Math.max(1, height || 1);
    const coarsePointer = typeof matchMedia === "function"
      && matchMedia("(pointer: coarse)").matches;
    state.mobile = state.width <= 768;
    state.coarsePointer = coarsePointer;
    state.lensIterations = coarsePointer ? 2 : 3;
    camera.aspect = state.width / state.height;
    applyCameraFov();
    camera.updateProjectionMatrix();
    backgroundMaterial.uniforms.uViewportAspect.value = camera.aspect;
    backgroundMaterial.uniforms.uViewportSize.value.set(state.width, state.height);
    const landscapeBlurRadius = state.mobile ? 2.25 : 3;
    backgroundMaterial.uniforms.uLandscapeBlurRadius.value = landscapeBlurRadius;
    if (state.landscape) state.landscape.blurRadiusCssPx = landscapeBlurRadius;
    const pixelRatio = Math.max(1, renderer.getPixelRatio?.() || 1);
    const targetWidth = Math.max(1, Math.round(state.width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(state.height * pixelRatio));
    stageTarget.setSize(targetWidth, targetHeight);
    resolvedTarget.setSize(targetWidth, targetHeight);
    let lensWidth = targetWidth;
    let lensHeight = targetHeight;
    lensTargets.forEach((target) => {
      lensWidth = Math.max(1, Math.floor(lensWidth / 2));
      lensHeight = Math.max(1, Math.floor(lensHeight / 2));
      target.setSize(lensWidth, lensHeight);
    });
    lensCompositeMaterial.uniforms.uResolution.value.set(targetWidth, targetHeight);
    updateGodRayFrames(state.sourceProgress);
  }

  function getSourceFov() {
    return state.mobile ? 40 : 30;
  }

  /* Weight of the ending push-in, 0 .. 1. It follows the approach curve of
     applySourceFistBump so the lens tightens exactly while the fists close in,
     and stays at 1 for the held contact. Outside the bridge (the source
     choreography, and the reduced-motion garden still at bridge 0) it is 0,
     so those frames keep the source FOV unchanged. */
  function getEndingZoom() {
    if (!state.bridgeActive) return 0;
    return smooth(inverseLerp(
      state.bridgeProgress, ENDING_ZOOM_RAMP_START, ENDING_ZOOM_RAMP_END,
    ));
  }

  /* The only writer of camera.fov. resize() and applyState() both go through
     it, so a resize between frames can never leave a stale, un-zoomed lens;
     applyState re-applies it every frame anyway. */
  function applyCameraFov() {
    const weight = getEndingZoom();
    state.endingZoom = weight;
    camera.fov = getSourceFov() * (1 - ENDING_ZOOM * weight);
  }

  function updatePointerState(nextTime) {
    let delta = 0;
    if (Number.isFinite(nextTime) && Number.isFinite(lastPointerTime)) {
      delta = MathUtils.clamp(nextTime - lastPointerTime, 0, 0.05);
    }
    if (Number.isFinite(nextTime)) lastPointerTime = nextTime;

    const cameraFollow = delta > 0
      ? 1 - Math.exp(-delta / CAMERA_RIG_SMOOTH_TC)
      : 0;
    const backgroundFollow = delta > 0
      ? 1 - Math.exp(-delta / BACKGROUND_PARALLAX_SMOOTH_TC)
      : 0;

    state.pointerX += (state.pointerTargetX - state.pointerX) * cameraFollow;
    state.pointerY += (state.pointerTargetY - state.pointerY) * cameraFollow;
    state.backgroundPointerX += (
      state.pointerTargetX - state.backgroundPointerX
    ) * backgroundFollow;
    state.backgroundPointerY += (
      state.pointerTargetY - state.backgroundPointerY
    ) * backgroundFollow;

    /* Pinned regression frames use a centred pointer and a frozen time. Snap
       the vanishing epsilon to zero so capture order cannot affect pixels. */
    if (
      delta === 0
      && Math.abs(state.pointerTargetX) < 1e-6
      && Math.abs(state.pointerTargetY) < 1e-6
    ) {
      state.pointerX = 0;
      state.pointerY = 0;
      state.backgroundPointerX = 0;
      state.backgroundPointerY = 0;
    }
  }

  function applyEarlySourceFraming(sourceProgress) {
    if (state.bridgeActive) return;
    const enter = smooth(inverseLerp(sourceProgress, 0.015, 0.055));
    const leave = 1 - smooth(inverseLerp(sourceProgress, 0.22, 0.48));
    const bias = enter * leave;
    if (bias <= 1e-5) return;

    /* The source camera itself is exact; this small view-plane trim accounts
       for the clean Buildanta viewport (the reference had persistent HUD
       gutters). It corrects the first four judged centroids, and is fully gone
       before the garden composition begins. */
    tempForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tempRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    tempUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(tempForward, 0.035 * bias);
    camera.position.addScaledVector(tempRight, 0.065 * bias);
    camera.position.addScaledVector(tempUp, -0.024 * bias);
  }

  function applyPointerCameraRig(weight = 1) {
    const amount = clamp01(weight);
    if (amount <= 1e-6 || Math.abs(state.pointerX) + Math.abs(state.pointerY) < 1e-6) return;
    pointerForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    pointerRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    pointerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    pointerFocalPoint
      .copy(camera.position)
      .addScaledVector(pointerForward, CAMERA_RIG_FOCAL_DISTANCE);
    camera.position.addScaledVector(
      pointerRight,
      state.pointerX * CAMERA_RIG_MAX_OFFSET * amount,
    );
    camera.position.addScaledVector(
      pointerUp,
      -state.pointerY * CAMERA_RIG_MAX_OFFSET * amount,
    );
    pointerLookAtMatrix.lookAt(camera.position, pointerFocalPoint, pointerUp);
    camera.quaternion.setFromRotationMatrix(pointerLookAtMatrix);
  }

  function updateGodRayFrames(sourceProgress) {
    const virtualTime = SOURCE_VIRTUAL_DURATION * Math.max(sourceProgress - 0.01, 0);
    const phase = ((virtualTime * 0.15) % 1) * GOD_RAY_RECTS.length;
    const frame = Math.floor(phase) % GOD_RAY_RECTS.length;
    const blend = smooth(phase - Math.floor(phase));
    const nextFrame = (frame + 1) % GOD_RAY_RECTS.length;
    const rectA = GOD_RAY_RECTS[frame];
    const rectB = GOD_RAY_RECTS[nextFrame];
    backgroundMaterial.uniforms.uGodRayRectA.value.copy(normalizedGardenRect(rectA));
    backgroundMaterial.uniforms.uGodRayRectB.value.copy(normalizedGardenRect(rectB));
    backgroundMaterial.uniforms.uGodRayBlend.value = blend;
    foregroundMaterial.uniforms.uGodRayRectA.value.copy(normalizedGardenRect(rectA));
    foregroundMaterial.uniforms.uGodRayRectB.value.copy(normalizedGardenRect(rectB));
    foregroundMaterial.uniforms.uGodRayBlend.value = blend;
    coverScale(
      rectA[2] / rectA[3],
      state.width / state.height,
      backgroundMaterial.uniforms.uGodRayCoverA.value,
    );
    foregroundMaterial.uniforms.uGodRayCoverA.value.copy(
      backgroundMaterial.uniforms.uGodRayCoverA.value,
    );
    coverScale(
      rectB[2] / rectB[3],
      state.width / state.height,
      backgroundMaterial.uniforms.uGodRayCoverB.value,
    );
    foregroundMaterial.uniforms.uGodRayCoverB.value.copy(
      backgroundMaterial.uniforms.uGodRayCoverB.value,
    );
  }

  function updateHumanBlend(animationProgress) {
    if (!humanMaterial || !humanSetup?.duration) return;
    const frameProgress = [216, 340, 405, 435].map(
      (frame) => frame / 30 / humanSetup.duration,
    );
    let from = 0;
    let to = 0;
    let blend = 0;
    if (animationProgress >= frameProgress[frameProgress.length - 1]) {
      from = frameProgress.length - 1;
      to = from;
    } else if (animationProgress > frameProgress[0]) {
      for (let index = 0; index < frameProgress.length - 1; index += 1) {
        if (
          animationProgress >= frameProgress[index]
          && animationProgress < frameProgress[index + 1]
        ) {
          from = index;
          to = index + 1;
          blend = inverseLerp(
            animationProgress,
            frameProgress[index],
            frameProgress[index + 1],
          );
          break;
        }
      }
    }

    const setTile = (suffix, index) => {
      humanMaterial.uniforms[`uTexOffset${suffix}`].value.set(index * 0.25, 1);
      humanMaterial.uniforms[`uTexScale${suffix}`].value.set(0.25, -0.25);
    };
    setTile("A", from);
    setTile("B", to);
    humanMaterial.uniforms.uProgress.value = blend;
  }

  function updateCoinRing(sourceProgress, opacity) {
    if (!coinRing || !greenHand) return;
    greenHand.updateWorldMatrix(true, false);
    greenHand.getWorldPosition(tempPosition);
    const travel = inverseLerp(sourceProgress, 0.1, 0.45);
    coinRing.group.position.set(
      tempPosition.x + MathUtils.lerp(-0.5, -0.25, travel),
      tempPosition.y + 0.1,
      tempPosition.z + MathUtils.lerp(-0.02, 0, travel),
    );
    const virtualTime = SOURCE_VIRTUAL_DURATION * Math.max(sourceProgress - 0.01, 0);
    /* ZeroMirror advances the ring from wall-clock time and modulates its
       speed with scroll velocity. Our stage must be perfectly reversible, so
       the same authored motion is evaluated from the deterministic virtual
       clock instead. */
    coinRing.group.rotation.x = virtualTime * (Math.PI / 6)
      * (1 + 3 / (18.566668 * 0.7));
    coinRing.group.rotation.z = Math.PI / 2;

    let anyVisible = false;
    coinRing.coins.forEach((coin, index) => {
      const appearAt = 0.1 + index * ((0.15 - 0.1) / 8);
      const disappearAt = 0.4 + index * ((0.45 - 0.4) / 8);
      let fraction = 0;
      if (sourceProgress >= appearAt && sourceProgress < disappearAt) {
        const elapsed = virtualTime
          - SOURCE_VIRTUAL_DURATION * Math.max(appearAt - 0.01, 0);
        fraction = elapsed < 0.45 ? elasticOut(elapsed / 0.45) : 1;
      } else if (sourceProgress >= disappearAt) {
        const elapsed = virtualTime
          - SOURCE_VIRTUAL_DURATION * Math.max(disappearAt - 0.01, 0);
        fraction = elapsed < 0.45 ? 1 - elasticOut(elapsed / 0.45) : 0;
      }
      // A retired/not-yet-entered coin must not sit at the ring centre with
      // its residual 10% scale: eight such coins made a stack on the wrist.
      // Preserve the elastic pop, but never flip a coin through the centre.
      fraction = Math.max(0, fraction);
      coin.visible = fraction > 0.001;
      anyVisible ||= coin.visible;
      const radius = fraction * 0.14;
      coin.position.set(
        coin.userData.cosAngle * radius,
        0,
        coin.userData.sinAngle * radius,
      );
      // Shrink with the orbit radius all the way to zero. A minimum scale
      // leaves overlapping discs as their centres converge during exit.
      coin.scale.setScalar(fraction);
      coin.rotation.y = coin.userData.spinPhase + virtualTime * 2;
      const materials = Array.isArray(coin.material) ? coin.material : [coin.material];
      materials.forEach((material) => {
        material.opacity = opacity;
      });
    });
    coinRing.group.visible = anyVisible && opacity > 0.001;
  }

  function restoreSourceRigTransforms() {
    [[greenRig, greenRigNativePose], [humanRig, humanRigNativePose]].forEach(([rig, pose]) => {
      if (!rig || !pose) return;
      rig.position.copy(pose.position);
      rig.quaternion.copy(pose.quaternion);
      rig.scale.copy(pose.scale);
    });
  }

  function isClosingBone(name) {
    return /f_index|f_middle|f_ring|f_pinky|thumb|^DEF[-_]?hand/i.test(name);
  }

  function setFistBonePose(hand, amount) {
    hand.sourcePose.forEach((sourcePose, name) => {
      const bone = hand.bones.get(name);
      const closingPose = hand.closingPose.get(name);
      if (!bone) return;
      bone.position.copy(sourcePose.position);
      bone.quaternion.copy(sourcePose.quaternion);
      bone.scale.copy(sourcePose.scale);
      if (closingPose) {
        // All four fingers close together. There is never a single extended
        // middle finger during the authored source-to-fist continuation.
        // The whole bone transform travels, not only the rotation: the reach
        // clip's last key stretches the skeleton (thumb and distal phalanges
        // 10-19% shorter, hand bone scaled, thumb base 12-17 mm off its bind),
        // so a fist built from donor rotations on that skeleton had its thumb
        // pad 9-17 mm off the index instead of the pipeline's 2-3 mm
        // (9 Sep 2026). At amount 1 the closing bones equal the donor's f75
        // skeleton exactly; below it the same lerp keeps every frame a pure
        // function of scroll.
        bone.position.lerp(closingPose.position, amount);
        bone.quaternion.slerp(closingPose.quaternion, amount);
        bone.scale.lerp(closingPose.scale, amount);
      }
    });
  }

  function placeWrist(hand, worldPosition) {
    root.updateMatrixWorld(true);
    hand.wrist.getWorldPosition(tempPositionB);
    tempPositionC.copy(worldPosition);
    if (hand.rig.parent) {
      hand.rig.parent.worldToLocal(tempPositionB);
      hand.rig.parent.worldToLocal(tempPositionC);
    }
    hand.rig.position.add(tempPositionC.sub(tempPositionB));
    root.updateMatrixWorld(true);
  }

  function prepareSourceFistBump() {
    if (!greenRig || !humanRig || !fancySetup || !humanSetup || !meetTargetSetup) return;
    restoreSourceRigTransforms();
    sampleMixer(fancySetup, SOURCE_BRIDGE_CLIP_PROGRESS);
    sampleMixer(humanSetup, SOURCE_BRIDGE_CLIP_PROGRESS);
    sampleMixer(cameraSetup, SOURCE_BRIDGE_CLIP_PROGRESS);
    sampleMixer(meetTargetSetup, SOURCE_FIST_DONOR_PROGRESS);
    root.updateMatrixWorld(true);
    // One donor frame, one donor rig per hand: the human's own solved fist,
    // never the green's bone rotations on the human's differently placed
    // bones (see SOURCE_FIST_DONOR_PROGRESS).
    if (!meetTargetHumanRig) {
      console.warn("[zero-stage] meet-fistbump.glb has no Hand_Human rig; the human hand falls back to the green donor pose");
    }
    const donorRigs = {
      green: meetTargetGreenRig,
      human: meetTargetHumanRig || meetTargetGreenRig,
    };
    const donorPoses = Object.fromEntries(Object.entries(donorRigs).map(([name, rig]) => (
      [name, captureBonePose(collectDonorBoneMap(rig))]
    )));
    if (cameraReference) {
      cameraReference.getWorldPosition(sourceFistCameraPosition);
      cameraReference.getWorldQuaternion(sourceFistCameraQuaternion);
    } else {
      sourceFistCameraPosition.set(0, 0, 3);
      sourceFistCameraQuaternion.identity();
    }
    const right = new Vector3(1, 0, 0).applyQuaternion(sourceFistCameraQuaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(sourceFistCameraQuaternion);
    const forward = new Vector3(0, 0, -1).applyQuaternion(sourceFistCameraQuaternion);
    // Reference composition: green approaches from upper-left, human from
    // lower-right. Rotate the entire contact frame in the camera plane, not
    // just the wrists, so the knuckles still meet with a natural arm angle.
    const diagonal = right.clone().multiplyScalar(Math.cos(SOURCE_FIST_DIAGONAL_ANGLE))
      .addScaledVector(up, -Math.sin(SOURCE_FIST_DIAGONAL_ANGLE));
    const diagonalUp = up.clone().multiplyScalar(Math.cos(SOURCE_FIST_DIAGONAL_ANGLE))
      .addScaledVector(right, Math.sin(SOURCE_FIST_DIAGONAL_ANGLE));
    sourceFistHands = [
      { name: "green", rig: greenRig, mesh: greenHand, native: greenRigNativePose, rest: greenRigRestPose, direction: 1 },
      { name: "human", rig: humanRig, mesh: humanHand, native: humanRigNativePose, rest: humanRigRestPose, direction: -1 },
    ].map((hand) => {
      const bones = collectBoneMap(hand.rig);
      const sourcePose = captureBonePose(bones);
      const donorRig = donorRigs[hand.name];
      const donorPose = donorPoses[hand.name];
      const donor = donorRig?.name || null;
      const donorRest = meetTargetRests.get(donorRig) || new Map();
      const frame = solveDonorFrame(donorRest, hand.rest || new Map(), isClosingBone);
      // A donor bone's local position is a vector in its parent's bone frame,
      // so it is carried by the same half-turn as the rotation (a rotation
      // about a principal axis keeps the scale diagonal, which copies as is).
      const carryPosition = (position) => position.clone().applyQuaternion(frame.turn);
      const closingPose = new Map();
      // Rest mismatch after the carry, per closing bone: proof that the two
      // skeletons agree before one's bone positions are written into the other.
      let restPositionMismatch = 0;
      let restScaleMismatch = 0;
      let restBones = 0;
      sourcePose.forEach((_pose, name) => {
        if (!isClosingBone(name) || !donorPose.has(name)) return;
        const pose = donorPose.get(name);
        closingPose.set(name, {
          position: carryPosition(pose.position),
          quaternion: conjugateQuaternion(pose.quaternion, frame.turn),
          scale: pose.scale.clone(),
        });
        const targetRest = hand.rest?.get(name);
        const sourceRest = donorRest.get(name);
        if (targetRest && sourceRest) {
          restPositionMismatch = Math.max(restPositionMismatch,
            carryPosition(sourceRest.position).distanceTo(targetRest.position));
          restScaleMismatch = Math.max(restScaleMismatch,
            sourceRest.scale.clone().sub(targetRest.scale).length());
          restBones += 1;
        }
      });
      if (frame.error > MathUtils.degToRad(3)) {
        console.warn("[zero-stage] " + hand.name + " donor bone frames still differ from " + donor
          + " by " + MathUtils.radToDeg(frame.error).toFixed(1) + " deg after " + frame.label);
      }
      if (restPositionMismatch > 0.0005 || restScaleMismatch > 0.005) {
        console.warn("[zero-stage] " + hand.name + " donor bone rests differ from " + donor
          + " by up to " + (restPositionMismatch * 1000).toFixed(2) + " mm / scale "
          + restScaleMismatch.toFixed(3) + " over " + restBones + " closing bones");
      }
      const wrist = findWristBone(bones);
      const middle = [...bones.entries()].find(([name]) => /f_middle[._]?01/i.test(name))?.[1];
      const index = [...bones.entries()].find(([name]) => /f_index[._]?01/i.test(name))?.[1];
      const pinky = [...bones.entries()].find(([name]) => /f_pinky[._]?01/i.test(name))?.[1];
      return {
        ...hand, bones, sourcePose, closingPose, donor, donorRig, wrist, middle, index, pinky,
        donorFrame: frame.label,
        donorFrameError: MathUtils.radToDeg(frame.error),
        donorRestPositionMismatchMm: restPositionMismatch * 1000,
        donorRestScaleMismatch: restScaleMismatch,
        sourceWrist: wrist?.getWorldPosition(new Vector3()),
        endpointWrist: new Vector3(),
        endpointQuaternion: new Quaternion(),
        contactAxis: diagonal.clone().multiplyScalar(hand.direction),
        contactOffset: new Vector3(),
        knuckleReach: 0,
      };
    });
    if (sourceFistHands.some((hand) => !hand.wrist || !hand.middle || !hand.index || !hand.pinky || hand.closingPose.size < 16)) {
      state.bridgeReady = false;
      console.warn("[zero-stage] source fist bones are incomplete", sourceFistHands.map((hand) => (
        `${hand.name}<-${hand.donor}: ${hand.closingPose.size} closing bones`
      )).join(", "));
      return;
    }
    greenWrist = sourceFistHands[0].wrist;
    const averageDepth = sourceFistHands.reduce((sum, hand) => (
      sum + forward.dot(hand.sourceWrist.clone().sub(sourceFistCameraPosition))
    ), 0) / sourceFistHands.length;
    sourceFistContact.copy(sourceFistCameraPosition).addScaledVector(forward, averageDepth);
    // Slightly above the center, like the reference; keep the source garden
    // and camera untouched while the two wrists settle into this point.
    sourceFistContact.addScaledVector(up, averageDepth * 0.05);
    sourceFistContact.addScaledVector(right, averageDepth * 0.02);

    sourceFistHands.forEach((hand) => {
      setFistBonePose(hand, 1);
      root.updateMatrixWorld(true);
      const wrist = hand.wrist.getWorldPosition(new Vector3());
      const y = hand.middle.getWorldPosition(new Vector3()).sub(wrist).normalize();
      const x = hand.index.getWorldPosition(new Vector3())
        .sub(hand.pinky.getWorldPosition(new Vector3()));
      x.addScaledVector(y, -x.dot(y)).normalize();
      const z = new Vector3().crossVectors(x, y).normalize();
      const currentFrame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
      const desiredY = hand.contactAxis.clone();
      const desiredX = diagonalUp.clone();
      // Client-requested candidate rotation (preview knob; 0 in production).
      rotateFistFrame(desiredX, desiredY, right, up, forward, hand.direction > 0);
      const desiredZ = new Vector3().crossVectors(desiredX, desiredY).normalize();
      const desiredFrame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
        desiredX, desiredY, desiredZ,
      ));
      const turn = desiredFrame.multiply(currentFrame.invert());
      const parentRotation = hand.rig.parent?.getWorldQuaternion(new Quaternion()) || new Quaternion();
      hand.endpointQuaternion.copy(parentRotation).invert().multiply(turn)
        .multiply(parentRotation).multiply(hand.native.quaternion);
      hand.rig.quaternion.copy(hand.endpointQuaternion);
      root.updateMatrixWorld(true);

      // Match the actual index/middle knuckle surface in all three axes. A
      // whole-mesh max-X can select a fingertip at a different height/depth,
      // making the silhouettes look separated even with identical X bounds.
      const posedWrist = hand.wrist.getWorldPosition(new Vector3());
      const knuckleVertices = [];
      hand.mesh.traverse((mesh) => {
        if (!mesh.isSkinnedMesh) return;
        mesh.skeleton.update();
        const vertex = new Vector3();
        const skinIndices = mesh.geometry.attributes.skinIndex;
        const skinWeights = mesh.geometry.attributes.skinWeight;
        const contactBones = new Set(mesh.skeleton.bones.flatMap((bone, index) => (
          /f_(index|middle)[._]?01/i.test(bone.name) ? [index] : []
        )));
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += 1) {
          mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
          let knuckleWeight = 0;
          for (let component = 0; component < 4; component += 1) {
            if (contactBones.has(skinIndices.getComponent(i, component))) {
              knuckleWeight += skinWeights.getComponent(i, component);
            }
          }
          if (knuckleWeight > 0.25) {
            const offset = vertex.clone().sub(posedWrist);
            const reach = offset.dot(hand.contactAxis);
            knuckleVertices.push({ offset, reach });
            hand.knuckleReach = Math.max(hand.knuckleReach, reach);
          }
        }
      });
      const contactPatch = knuckleVertices.filter(({ reach }) => (
        reach >= hand.knuckleReach - 0.003
      ));
      contactPatch.forEach(({ offset }) => hand.contactOffset.add(offset));
      hand.contactOffset.divideScalar(Math.max(1, contactPatch.length));
      // A sub-millimetre compression closes the antialiased edge at contact.
      hand.contactOffset.addScaledVector(hand.contactAxis, -0.0005);
      hand.endpointWrist.copy(sourceFistContact).sub(hand.contactOffset);
    });
    restoreSourceRigTransforms();
    sampleMixer(fancySetup, SOURCE_BRIDGE_CLIP_PROGRESS);
    sampleMixer(humanSetup, SOURCE_BRIDGE_CLIP_PROGRESS);
    root.updateMatrixWorld(true);
    state.bridgeReady = true;
  }

  function applySourceFistBump(progress) {
    if (!state.bridgeReady) return;
    const curl = smooth(inverseLerp(progress, 0.02, 0.44));
    const turn = smooth(inverseLerp(progress, 0.04, 0.64));
    const approach = smooth(inverseLerp(progress, 0.12, 0.80));
    // Contact is held at the endpoint; a tiny recoil settles back into it.
    // Reverse scroll retraces precisely these poses.
    const settle = Math.sin(Math.PI * inverseLerp(progress, 0.84, 1)) * 0.0015;
    sourceFistHands.forEach((hand) => {
      setFistBonePose(hand, curl);
      hand.rig.quaternion.copy(hand.native.quaternion).slerp(hand.endpointQuaternion, turn);
      const wrist = new Vector3().lerpVectors(hand.sourceWrist, hand.endpointWrist, approach)
        .addScaledVector(hand.contactAxis, -settle);
      placeWrist(hand, wrist);
    });
    state.fistBump = {
      progress,
      curl,
      contact: progress >= 0.80 && settle < 0.0005,
      contactPoint: sourceFistContact.toArray(),
      hands: sourceFistHands.map((hand) => ({
        name: hand.name,
        donor: hand.donor,
        donorFrame: hand.donorFrame,
        donorFrameError: hand.donorFrameError,
        donorRestPositionMismatchMm: hand.donorRestPositionMismatchMm,
        donorRestScaleMismatch: hand.donorRestScaleMismatch,
        closingBones: hand.closingPose.size,
        wrist: hand.wrist.getWorldPosition(new Vector3()).toArray(),
        knuckle: hand.wrist.getWorldPosition(new Vector3())
          .add(hand.contactOffset).toArray(),
      })),
    };
  }

  function applyState() {
    const sourceProgress = state.sourceProgress;
    const opacity = state.opacity;
    const bridgeProgress = state.bridgeProgress;
    const handoffOpacity = 0;
    const referenceOpacity = 1;
    state.referenceOpacity = referenceOpacity;
    state.handoffOpacity = handoffOpacity;
    root.visible = opacity > 0.001;
    backgroundQuad.visible = referenceOpacity > 0.001;

    backgroundMaterial.uniforms.uSourceProgress.value = sourceProgress;
    if (state.landscape) {
      backgroundMaterial.uniforms.uLandscapeBlurRadius.value = MathUtils.clamp(
        Number(state.landscape.blurRadiusCssPx) || 0, 0, 6,
      );
    }
    backgroundMaterial.uniforms.uOpacity.value = referenceOpacity;
    backgroundMaterial.uniforms.uParallax.value.set(
      -state.backgroundPointerX,
      state.backgroundPointerY,
    );
    // In the source composer god rays live in the foreground pass, after lens
    // blur, so their shafts stay crisp while the edge scene blooms.
    backgroundMaterial.uniforms.uGodRayOpacity.value = 0;
    foregroundMaterial.uniforms.uSourceProgress.value = sourceProgress;
    // The source entry keeps its original optical treatment. As the supplied
    // landscape replaces the garden, retire the old milky veil/rays/lens so
    // its blue sky and flower detail aren't washed out. Choreography is intact.
    const landscapeMix = backgroundMaterial.uniforms.uLandscapeReady.value
      * inverseLerp(sourceProgress, 0.5, 0.7);
    const bridgeClarity = 1 - landscapeMix;
    lensCompositeMaterial.uniforms.uBlurStrength.value = bridgeClarity;
    foregroundMaterial.uniforms.uOpacity.value = referenceOpacity * bridgeClarity;
    foregroundMaterial.uniforms.uGodRayOpacity.value = (
      inverseLerp(sourceProgress, 0.3, 1) * 12
    ) * bridgeClarity;
    compositeMaterial.uniforms.uOpacity.value = opacity;
    compositeMaterial.uniforms.uGrade.value = 1 - landscapeMix;
    const virtualTime = SOURCE_VIRTUAL_DURATION * Math.max(sourceProgress - 0.01, 0)
      + bridgeProgress * 2.4;
    const noiseFrame = Math.floor(virtualTime * 60);
    compositeMaterial.uniforms.uNoiseOffset.value.set(
      (noiseFrame * 0.7548776662) % 1,
      (noiseFrame * 0.5698402909) % 1,
    );
    updateGodRayFrames(sourceProgress);

    const animationProgress = inverseLerp(sourceProgress, 0.01, 1) * 0.7;
    restoreSourceRigTransforms();
    sampleMixer(fancySetup, animationProgress);
    sampleMixer(humanSetup, animationProgress);
    sampleMixer(cameraSetup, animationProgress);
    if (state.bridgeActive) applySourceFistBump(bridgeProgress);
    else state.fistBump = null;
    root.updateMatrixWorld(true);

    // Source FOV, tightened by the ending push-in while the fists close in.
    applyCameraFov();
    camera.far = 30;
    if (cameraReference) {
      cameraReference.getWorldPosition(tempPosition);
      cameraReference.getWorldQuaternion(tempQuaternion);
      camera.position.copy(tempPosition);
      camera.quaternion.copy(tempQuaternion);

    } else {
      camera.position.set(0, 0, 3);
      camera.quaternion.identity();
    }
    applyEarlySourceFraming(sourceProgress);
    applyPointerCameraRig(options.reducedMotion ? 0 : 1);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    if (greenMaterial) {
      greenMaterial.opacity = 1;
      /* The source HandsModel uses depth testing/writing even though its
         alpha-mapped material is transparent. Both are necessary for folded
         finger triangles to occlude correctly during entry and the bump. */
      greenMaterial.depthTest = true;
      greenMaterial.depthWrite = true;
    }
    if (greenHand) {
      greenHand.visible = true;
    }
    if (fallbackHandMaterial) {
      fallbackHandMaterial.opacity = 1;
      if (fancyFallback?.group) {
        fancyFallback.group.visible = true;
      }
    }
    if (humanMaterial) {
      humanMaterial.uniforms.uOpacity.value = 1;
      humanMaterial.depthTest = true;
      humanMaterial.depthWrite = true;
      updateHumanBlend(animationProgress);
    }
    if (humanHand) humanHand.visible = true;
    if (fancyFallback) {
      fancyFallback.group.visible = !greenHand;
    }
    updateCoinRing(sourceProgress, referenceOpacity);

    if (petals) {
      const petalsVisible = sourceProgress > 0.25
        && referenceOpacity > 0.001;
      petals.group.visible = petalsVisible;
      if (petalsVisible) {
        const entry = inverseLerp(sourceProgress, 0.25, 0.85);
        const petalTime = SOURCE_VIRTUAL_DURATION * Math.max(sourceProgress - 0.25, 0)
          + bridgeProgress * 2.4;
        const entryIntegral = entry < 1
          ? 0.6 * (entry ** 3 - 0.5 * entry ** 4)
          : 0.3 + sourceProgress - 0.85;
        // Source shader clocks integrated analytically from scroll progress.
        petals.material.uniforms.uEntry.value = entry;
        petals.material.uniforms.uTime.value = petalTime;
        petals.material.uniforms.uSwirlTime.value = SOURCE_VIRTUAL_DURATION * entryIntegral
          + bridgeProgress * 2.4;
        petals.material.uniforms.uOpacity.value = referenceOpacity;
        petals.group.position.copy(camera.position);
        tempForward.set(0, 0, -0.7).applyQuaternion(camera.quaternion);
        petals.group.position.add(tempForward);
      }
    }
  }

  function update(nextState = {}) {
    const previousBridgeProgress = state.bridgeProgress;
    if (Number.isFinite(nextState.progress)) state.progress = clamp01(nextState.progress);
    if (Number.isFinite(nextState.opacity)) state.opacity = clamp01(nextState.opacity);
    if (!hasNativePointerInput && Number.isFinite(nextState.pointerX)) {
      state.pointerTargetX = MathUtils.clamp(nextState.pointerX, -1, 1);
    }
    if (!hasNativePointerInput && Number.isFinite(nextState.pointerY)) {
      state.pointerTargetY = MathUtils.clamp(nextState.pointerY, -1, 1);
    }
    if (Number.isFinite(nextState.time)) state.time = nextState.time;
    if (options.reducedMotion) {
      state.time = 0;
      state.pointerTargetX = 0;
      state.pointerTargetY = 0;
      state.pointerX = 0;
      state.pointerY = 0;
      state.backgroundPointerX = 0;
      state.backgroundPointerY = 0;
    }
    updatePointerState(state.time);

    state.sourceProgress = Math.min(
      ZERO_STAGE_SOURCE_END,
      state.progress / ZERO_STAGE_BRIDGE_START * ZERO_STAGE_SOURCE_END,
    );
    state.bridgeProgress = inverseLerp(state.progress, ZERO_STAGE_BRIDGE_START, 1);
    state.bridgeActive = state.progress >= ZERO_STAGE_BRIDGE_START;
    applyState();

    if (
      typeof options.onBridgeUpdate === "function"
      && Math.abs(previousBridgeProgress - state.bridgeProgress) > 1e-5
    ) {
      options.onBridgeUpdate({
        progress: state.bridgeProgress,
        active: state.bridgeActive,
        ready: state.bridgeReady,
        handoffOpacity: state.handoffOpacity,
        referenceOpacity: state.referenceOpacity,
      });
    }
    return api;
  }

  function render(renderOptions = {}) {
    if (disposed || state.opacity <= 0.001) return;
    const clear = renderOptions.clear === true;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousScissorTest = renderer.getScissorTest();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(savedClearColor);
    renderer.getViewport(savedViewport);
    renderer.getScissor(savedScissor);

    /* Source garden and both source hands share this one scene target for
       the entire sequence, including the closing fist bump. */
    renderer.autoClear = false;
    renderer.setRenderTarget(stageTarget);
    // RenderTarget.viewport is already in physical pixels. setViewport takes
    // CSS pixels and applies DPR again, cropping every offscreen pass on
    // scaled displays and producing an inset scene plus a displaced blur.
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(backgroundScene, backgroundCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);

    /* ZeroMirror's exact Kawase-style lens pyramid: three levels on fine
       pointers, two on coarse pointers, followed by an aspect-correct radial
       blend that keeps the centre sharp. */
    let inputTarget = stageTarget;
    lensQuad.material = lensDownMaterial;
    for (let index = 0; index < state.lensIterations; index += 1) {
      const outputTarget = lensTargets[index];
      lensDownMaterial.uniforms.tDiffuse.value = inputTarget.texture;
      lensDownMaterial.uniforms.uHalfPixel.value.set(
        0.5 / inputTarget.width,
        0.5 / inputTarget.height,
      );
      renderer.setRenderTarget(outputTarget);
      renderer.render(lensScene, backgroundCamera);
      inputTarget = outputTarget;
    }
    lensQuad.material = lensUpMaterial;
    for (let index = state.lensIterations - 1; index > 0; index -= 1) {
      inputTarget = lensTargets[index];
      const outputTarget = lensTargets[index - 1];
      lensUpMaterial.uniforms.tDiffuse.value = inputTarget.texture;
      lensUpMaterial.uniforms.uHalfPixel.value.set(
        0.5 / inputTarget.width,
        0.5 / inputTarget.height,
      );
      renderer.setRenderTarget(outputTarget);
      renderer.render(lensScene, backgroundCamera);
    }

    lensCompositeMaterial.uniforms.tBlurred.value = lensTargets[0].texture;
    renderer.setRenderTarget(resolvedTarget);
    renderer.render(lensCompositeScene, backgroundCamera);
    renderer.render(foregroundScene, backgroundCamera);

    /* Composite that resolved shot once at the public stage opacity. */
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(savedViewport);
    renderer.setScissor(savedScissor);
    renderer.setScissorTest(previousScissorTest);
    if (clear) {
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
    } else {
      renderer.clearDepth();
    }
    renderer.render(compositeScene, backgroundCamera);

    renderer.setClearColor(savedClearColor, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    actions.forEach((action) => action.stop());
    mixers.forEach((mixer) => mixer.stopAllAction());
    loadedRoots.forEach((loadedRoot) => {
      disposeObjectResources(loadedRoot, ownedMaterials, ownedGeometries, ownedTextures);
    });
    if (coinRing) {
      ownedGeometries.add(coinRing.geometry);
      coinRing.materials.forEach((material) => ownedMaterials.add(material));
    }
    if (petals) {
      ownedGeometries.add(petals.geometry);
      ownedMaterials.add(petals.material);
    }
    if (fancyFallback) {
      fancyFallback.geometries.forEach((geometry) => ownedGeometries.add(geometry));
    }

    ownedGeometries.forEach((geometry) => geometry?.dispose?.());
    ownedMaterials.forEach((material) => material?.dispose?.());
    ownedTextures.forEach((texture) => texture?.dispose?.());
    stageTarget.dispose();
    lensTargets.forEach((target) => target.dispose());
    resolvedTarget.dispose();
    dracoLoader.dispose();
    ktx2Loader.dispose();
    root.clear();
    backgroundScene.clear();
    foregroundScene.clear();
    lensScene.clear();
    lensCompositeScene.clear();
    compositeScene.clear();

    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", onPointerMove);
      if (window.__buildanta?.zeroMirrorStage === api) {
        delete window.__buildanta.zeroMirrorStage;
      }
      if (window.__zeroMirrorStageBridge === api) {
        delete window.__zeroMirrorStageBridge;
      }
    }
  }

  let warmPromise = null;
  function warm() {
    if (warmPromise) return warmPromise;
    warmPromise = (async () => {
      await api.ready;
      if (disposed) return;
      // Upload the original textures in separate tasks, not a single long
      // scroll-frame burst. No resolution, format, mip or filtering changes.
      for (const texture of ownedTextures) {
        if (disposed) return;
        renderer.initTexture(texture);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      // Compile does not allocate offscreen attachments. Prepare the same
      // targets used by render() so the first iris frame does not pay for
      // their GPU allocation. Keep every existing dimension/format/filter.
      if (typeof renderer.initRenderTarget === "function") {
        const targets = [stageTarget, ...lensTargets.slice(0, state.lensIterations), resolvedTarget];
        const warmViewport = new Vector4();
        const warmScissor = new Vector4();
        for (const target of targets) {
          if (disposed) return;
          const previousTarget = renderer.getRenderTarget();
          const previousFace = renderer.getActiveCubeFace();
          const previousMip = renderer.getActiveMipmapLevel();
          const previousScissorTest = renderer.getScissorTest();
          if (previousTarget === null) {
            renderer.getViewport(warmViewport);
            renderer.getScissor(warmScissor);
          }
          try {
            renderer.initRenderTarget(target);
          } finally {
            // Restore framebuffer, viewport and scissor before yielding to
            // a live frame, including when preparation throws or times out.
            renderer.setRenderTarget(previousTarget, previousFace, previousMip);
            if (previousTarget === null) {
              // Preserve custom logical-pixel rectangles (and DPR rounding)
              // without reapplying them to physical-pixel target viewports.
              renderer.setViewport(warmViewport);
              renderer.setScissor(warmScissor);
              renderer.setScissorTest(previousScissorTest);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      const passes = [
        [scene, camera],
        [backgroundScene, backgroundCamera],
        [foregroundScene, backgroundCamera],
        [lensScene, backgroundCamera, lensDownMaterial],
        [lensScene, backgroundCamera, lensUpMaterial],
        [lensCompositeScene, backgroundCamera],
        [compositeScene, backgroundCamera],
      ];
      for (const [passScene, passCamera, lensMaterial] of passes) {
        if (disposed) return;
        const hidden = [];
        const previousLensMaterial = lensQuad.material;
        let compilation;
        try {
          // compileAsync traverses synchronously then waits for the driver.
          // Restore temporary visibility/materials BEFORE yielding, so even
          // a loader timeout cannot expose a preparation pose to the visitor.
          passScene.traverse((object) => {
            if (!object.visible) { hidden.push(object); object.visible = true; }
          });
          if (lensMaterial) lensQuad.material = lensMaterial;
          compilation = renderer.compileAsync(passScene, passCamera);
        } finally {
          hidden.forEach((object) => { object.visible = false; });
          lensQuad.material = previousLensMaterial;
        }
        await compilation;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();
    return warmPromise;
  }

  const api = {
    scene,
    camera,
    state,
    update,
    render,
    resize,
    dispose,
    ready: null,
    warm,
    setProgress(progress) {
      return update({ progress });
    },
    setPointer(pointerX, pointerY) {
      return update({ pointerX, pointerY });
    },
    /* Verifier access to the fist-bump internals. The donor rigs live in
       meetTargetRoot, which is never attached to the scene, so they cannot
       be found through scene.getObjectByName; this is the only way to compare
       a source hand's closing skeleton with its donor's. Read-only by
       contract: nothing here is part of the render path. */
    get fistBumpHands() {
      return sourceFistHands.map((hand) => ({
        name: hand.name,
        donor: hand.donor,
        donorRig: hand.donorRig,
        rig: hand.rig,
        bones: hand.bones,
        rest: hand.rest,
        sourcePose: hand.sourcePose,
        closingPose: hand.closingPose,
        donorRest: meetTargetRests.get(hand.donorRig) || null,
        donorFrame: hand.donorFrame,
        donorFrameError: hand.donorFrameError,
        donorRestPositionMismatchMm: hand.donorRestPositionMismatchMm,
        donorRestScaleMismatch: hand.donorRestScaleMismatch,
      }));
    },
    get donorRigs() {
      return { green: meetTargetGreenRig, human: meetTargetHumanRig };
    },
    get bridgeProgress() {
      return state.bridgeProgress;
    },
    get sourceProgress() {
      return state.sourceProgress;
    },
    get handoffOpacity() {
      return state.handoffOpacity;
    },
    get referenceOpacity() {
      return state.referenceOpacity;
    },
    get bridgeReady() {
      return state.bridgeReady;
    },
  };

  resize();

  const assetPromises = {
    fancy: gltfLoader.loadAsync(FANCY_HAND_URL),
    human: gltfLoader.loadAsync(HUMAN_HAND_URL),
    camera: gltfLoader.loadAsync(CAMERA_URL),
    meetTarget: gltfLoader.loadAsync(MEET_FISTBUMP_URL),
    matcap: textureLoader.loadAsync(MATCAP_URL),
    humanAtlas: ktx2Loader.loadAsync(HUMAN_HANDS_ATLAS_URL),
    spcAtlas: ktx2Loader.loadAsync(SPC_ATLAS_URL),
    gardenAtlas: ktx2Loader.loadAsync(GARDEN_ATLAS_URL),
    landscapeSky: textureLoader.loadAsync(LANDSCAPE_SKY_URL),
    landscapeClouds: textureLoader.loadAsync(LANDSCAPE_CLOUDS_URL),
    landscapeLand: textureLoader.loadAsync(LANDSCAPE_LAND_URL),
    ...Object.fromEntries(COIN_LOGOS.map((logo, index) => [
      `coinLogo${index}`, textureLoader.loadAsync(logo.url),
    ])),
  };

  api.ready = Promise.all(
    Object.entries(assetPromises).map(async ([label, promise]) => {
      try {
        return [label, await promise];
      } catch (error) {
        reportLoadError(label, error);
        return [label, null];
      }
    }),
  ).then((entries) => {
    const assets = Object.fromEntries(entries);
    const coinLogoImages = COIN_LOGOS.map((_logo, index) => assets[`coinLogo${index}`]);
    const landscapeLayers = [
      ["Sky", assets.landscapeSky, LANDSCAPE_SKY_URL],
      ["Clouds", assets.landscapeClouds, LANDSCAPE_CLOUDS_URL],
      ["Land", assets.landscapeLand, LANDSCAPE_LAND_URL],
    ];
    if (disposed) {
      [assets.fancy, assets.human, assets.camera, assets.meetTarget].forEach((gltf) => {
        gltf?.scene?.traverse((child) => {
          child.geometry?.dispose?.();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material?.dispose?.());
        });
      });
      [assets.matcap, assets.humanAtlas, assets.spcAtlas, assets.gardenAtlas,
        ...landscapeLayers.map(([, texture]) => texture), ...coinLogoImages]
        .forEach((texture) => texture?.dispose?.());
      return api;
    }
    coinLogoImages.forEach((texture) => {
      if (texture) ownedTextures.add(texture);
    });

    if (assets.matcap) {
      assets.matcap.colorSpace = SRGBColorSpace;
      assets.matcap.generateMipmaps = false;
      assets.matcap.minFilter = LinearFilter;
      assets.matcap.needsUpdate = true;
      ownedTextures.add(assets.matcap);
    }
    [assets.humanAtlas, assets.spcAtlas, assets.gardenAtlas].forEach((texture) => {
      if (!texture) return;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      ownedTextures.add(texture);
    });
    humanAtlas = assets.humanAtlas || fallbackTexture;
    spcAtlas = assets.spcAtlas || fallbackTexture;
    gardenAtlas = assets.gardenAtlas || fallbackTexture;

    backgroundMaterial.uniforms.uGardenAtlas.value = gardenAtlas;
    backgroundMaterial.uniforms.uGardenReady.value = assets.gardenAtlas ? 1 : 0;
    foregroundMaterial.uniforms.uGardenAtlas.value = gardenAtlas;
    foregroundMaterial.uniforms.uGardenReady.value = assets.gardenAtlas ? 1 : 0;
    landscapeLayers.forEach(([name, texture]) => {
      if (!texture) return;
      texture.name = `ZeroStageLandscape${name}`;
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      ownedTextures.add(texture);
      backgroundMaterial.uniforms[`uLandscape${name}`].value = texture;
    });
    const landscapeReady = landscapeLayers.every(([, texture]) => Boolean(texture));
    backgroundMaterial.uniforms.uLandscapeReady.value = Number(landscapeReady);
    state.landscape = {
      ready: landscapeReady,
      blurRadiusCssPx: backgroundMaterial.uniforms.uLandscapeBlurRadius.value,
      layers: landscapeLayers.map(([name, texture, source]) => ({
        name, source, width: texture?.image?.width || 0,
        height: texture?.image?.height || 0, colorSpace: texture?.colorSpace || "",
      })),
    };

    if (assets.fancy?.scene) {
      const fancyRoot = assets.fancy.scene;
      loadedRoots.push(fancyRoot);
      root.add(fancyRoot);
      fancySetup = setupPausedMixer(fancyRoot, assets.fancy.animations, mixers, actions);
      greenHand = fancyRoot.getObjectByName("GreenHand") || fancyRoot;
      greenRig = fancyRoot.getObjectByName("GreenHandRig")
        || greenHand.parent
        || fancyRoot;
      greenRigNativePose = captureTransform(greenRig);
      greenRigRestPose = captureBonePose(collectBoneMap(greenRig));

      let sourceNormalMap = null;
      let sourceNormalScale = null;
      greenHand.traverse((child) => {
        if ((!child.isMesh && !child.isSkinnedMesh) || sourceNormalMap) return;
        sourceNormalMap = child.material?.normalMap || null;
        sourceNormalScale = child.material?.normalScale?.clone?.() || null;
      });
      if (sourceNormalMap) ownedTextures.add(sourceNormalMap);

      const alphaMap = humanAtlas.clone();
      alphaMap.wrapS = ClampToEdgeWrapping;
      alphaMap.wrapT = ClampToEdgeWrapping;
      alphaMap.offset.set(0.75, 0.25);
      alphaMap.repeat.set(0.25, -0.25);
      alphaMap.matrixAutoUpdate = true;
      alphaMap.updateMatrix();
      ownedTextures.add(alphaMap);
      greenMaterial = new MeshMatcapMaterial({
        name: "ZeroStageGreenHandMaterial",
        matcap: assets.matcap || null,
        alphaMap,
        normalMap: sourceNormalMap,
        transparent: true,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
        side: FrontSide,
        toneMapped: false,
      });
      if (sourceNormalScale) greenMaterial.normalScale.copy(sourceNormalScale);
      ownedMaterials.add(greenMaterial);
      greenHand.traverse((child) => {
        if (!child.isMesh && !child.isSkinnedMesh) return;
        const previousMaterials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        previousMaterials.forEach((material) => ownedMaterials.add(material));
        child.material = greenMaterial;
        child.frustumCulled = false;
        child.renderOrder = 20;
      });
    } else {
      fallbackHandMaterial = new MeshBasicMaterial({
        color: 0x47ef62,
        transparent: true,
        opacity: state.opacity,
        depthTest: false,
        depthWrite: false,
      });
      ownedMaterials.add(fallbackHandMaterial);
      fancyFallback = createFallbackHand(fallbackHandMaterial);
      root.add(fancyFallback.group);
    }

    if (assets.meetTarget?.scene) {
      meetTargetRoot = assets.meetTarget.scene;
      loadedRoots.push(meetTargetRoot);
      meetTargetSetup = setupPausedMixer(
        meetTargetRoot,
        assets.meetTarget.animations,
        mixers,
        actions,
      );
      // Scope target-bone lookup per armature. The target GLB carries a green
      // and a human rig with the same DEF-* names; each source hand borrows
      // the closing pose of its own rig (see SOURCE_FIST_DONOR_PROGRESS).
      meetTargetGreenRig = meetTargetRoot.getObjectByName("Hand_Green") || null;
      meetTargetHumanRig = meetTargetRoot.getObjectByName("Hand_Human") || null;
      // Bone rests, captured before the donor clip is ever sampled; they
      // decide how each donor pose is carried into its target bone frame.
      [meetTargetGreenRig, meetTargetHumanRig].forEach((rig) => {
        if (rig) meetTargetRests.set(rig, captureBonePose(collectDonorBoneMap(rig)));
      });
    }

    if (assets.human?.scene) {
      const humanRoot = assets.human.scene;
      loadedRoots.push(humanRoot);
      root.add(humanRoot);
      humanSetup = setupPausedMixer(humanRoot, assets.human.animations, mixers, actions);
      humanHand = humanRoot.getObjectByName("HumanHand") || humanRoot;
      humanRig = humanRoot.getObjectByName("HumanHandRig") || humanHand.parent || humanRoot;
      humanRigNativePose = captureTransform(humanRig);
      humanRigRestPose = captureBonePose(collectBoneMap(humanRig));
      humanHand.traverse((child) => {
        if ((!child.isMesh && !child.isSkinnedMesh) || child.geometry?.hasAttribute("normal")) {
          return;
        }
        child.geometry.computeVertexNormals();
      });
      humanMaterial = createHumanHandMaterial(humanAtlas);
      ownedMaterials.add(humanMaterial);
      humanHand.traverse((child) => {
        if (!child.isMesh && !child.isSkinnedMesh) return;
        const previousMaterials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        previousMaterials.forEach((material) => ownedMaterials.add(material));
        child.material = humanMaterial;
        child.frustumCulled = false;
        child.renderOrder = 21;
      });
    }

    if (assets.camera?.scene) {
      const cameraRoot = assets.camera.scene;
      loadedRoots.push(cameraRoot);
      root.add(cameraRoot);
      cameraSetup = setupPausedMixer(cameraRoot, assets.camera.animations, mixers, actions);
      cameraRoot.traverse((child) => {
        if (!cameraReference && child.isPerspectiveCamera) cameraReference = child;
        if (child.isMesh || child.isSkinnedMesh) child.visible = false;
      });
    }

    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 0x5a17e1;
    coinRing = createCoinRing(coinLogoImages, ownedTextures, seed ^ 0x0c01cafe,
      renderer.capabilities.getMaxAnisotropy());
    scene.add(coinRing.group);
    if (assets.spcAtlas) {
      petals = createPetals(spcAtlas, seed);
      scene.add(petals.group);
      ownedMaterials.add(petals.material);
      ownedGeometries.add(petals.geometry);
    }

    prepareSourceFistBump();
    state.ready = true;
    applyState();
    return api;
  });

  if (typeof window !== "undefined") {
    window.__buildanta ||= {};
    window.__buildanta.zeroMirrorStage = api;
    window.__zeroMirrorStageBridge = api;
  }

  return api;
}

export default createZeroMirrorStage;
