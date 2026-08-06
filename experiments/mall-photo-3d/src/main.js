import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "./style.css";

gsap.registerPlugin(ScrollTrigger);

const experience = document.querySelector("#experience");
const canvas = document.querySelector("#scene");
const fallbackPhoto = document.querySelector(".fallback-photo");
const scrollTrack = document.querySelector("#scroll-track");
const progressFill = document.querySelector("#progress-fill");
const progressNumber = document.querySelector("#progress-number");
const scrollCue = document.querySelector("#scroll-cue");
const lightField = document.querySelector(".light-field");
const chapterIndex = document.querySelector("#chapter-index");
const chapterName = document.querySelector("#chapter-name");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

const state = {
  targetProgress: 0,
  progress: 0,
  pointerTargetX: 0,
  pointerTargetY: 0,
  pointerX: 0,
  pointerY: 0,
  lastTime: performance.now(),
  chapter: 0,
};

const chapterNames = ["Establish", "Assemble", "Traverse", "Arrive"];
const cameraFrames = [
  { p: 0.00, pos: [ 0.00, 0.04, 8.40 ], aim: [ 0.00, 0.03, 0 ] },
  { p: 0.20, pos: [-0.08, 0.05, 8.05 ], aim: [-0.08, 0.04, 0 ] },
  { p: 0.62, pos: [-0.48, 0.08, 6.85 ], aim: [-0.47, 0.06, 0 ] },
  { p: 1.00, pos: [-0.92, 0.10, 5.65 ], aim: [-0.90, 0.07, 0 ] },
];
const photoFrames = [
  { p: 0.00, pos: [ 0.000,  0.000, 0 ], rot: [ 0.0000, -0.0040,  0.0000 ], scale: 1.000 },
  { p: 0.30, pos: [ 0.085,  0.032, 0 ], rot: [-0.0018, -0.0070,  0.0011 ], scale: 1.008 },
  { p: 0.66, pos: [-0.018, -0.012, 0 ], rot: [ 0.0010,  0.0085, -0.0008 ], scale: 1.017 },
  { p: 1.00, pos: [-0.135, -0.052, 0 ], rot: [-0.0012,  0.0130, -0.0017 ], scale: 1.026 },
];

const framePosition = new THREE.Vector3();
const frameAim = new THREE.Vector3();
const clockAim = new THREE.Vector3();
const photoPosition = new THREE.Vector3();
const photoRotation = new THREE.Vector3();
let renderer;
let scene;
let camera;
let photoRig;
let photoMesh;
let photoMaterial;
let dust;
let dustMaterial;
let constructionBlocks;
let constructionMaterial;
let constructionData = [];
let builderRig;
let builderBodyMaterial;
let builderOutlineMaterial;
let builderDetailMaterial;
let builderMaterials = [];
let builderParts;
let scrollTrigger;
let smoothScroll;
let rafId = 0;
let photoBaseScale = 1;
const constructionDummy = new THREE.Object3D();
const constructionPosition = new THREE.Vector3();
const constructionSource = new THREE.Vector3();
const constructionTarget = new THREE.Vector3();
const activePlacement = new THREE.Vector3();
const handGuide = new THREE.Vector3();
let hasActivePlacement = false;
const pointA = new THREE.Vector2();
const pointB = new THREE.Vector2();
const pointC = new THREE.Vector2();

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function damp(current, target, speed, delta) {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}

function sampleCameraFrame(progress) {
  let index = 0;
  while (index < cameraFrames.length - 2 && progress > cameraFrames[index + 1].p) {
    index += 1;
  }

  const from = cameraFrames[index];
  const to = cameraFrames[index + 1];
  const span = Math.max(0.0001, to.p - from.p);
  const raw = clamp01((progress - from.p) / span);
  const eased = raw * raw * (3 - 2 * raw);

  framePosition.set(
    THREE.MathUtils.lerp(from.pos[0], to.pos[0], eased),
    THREE.MathUtils.lerp(from.pos[1], to.pos[1], eased),
    THREE.MathUtils.lerp(from.pos[2], to.pos[2], eased),
  );
  frameAim.set(
    THREE.MathUtils.lerp(from.aim[0], to.aim[0], eased),
    THREE.MathUtils.lerp(from.aim[1], to.aim[1], eased),
    THREE.MathUtils.lerp(from.aim[2], to.aim[2], eased),
  );
}

function samplePhotoFrame(progress) {
  let index = 0;
  while (index < photoFrames.length - 2 && progress > photoFrames[index + 1].p) {
    index += 1;
  }

  const from = photoFrames[index];
  const to = photoFrames[index + 1];
  const span = Math.max(0.0001, to.p - from.p);
  const raw = clamp01((progress - from.p) / span);
  const eased = raw * raw * (3 - 2 * raw);

  photoPosition.set(
    THREE.MathUtils.lerp(from.pos[0], to.pos[0], eased),
    THREE.MathUtils.lerp(from.pos[1], to.pos[1], eased),
    THREE.MathUtils.lerp(from.pos[2], to.pos[2], eased),
  );
  photoRotation.set(
    THREE.MathUtils.lerp(from.rot[0], to.rot[0], eased),
    THREE.MathUtils.lerp(from.rot[1], to.rot[1], eased),
    THREE.MathUtils.lerp(from.rot[2], to.rot[2], eased),
  );

  return THREE.MathUtils.lerp(from.scale, to.scale, eased);
}

function makePhotoMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 },
      uDepth: { value: 0 },
      uProgress: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      uniform float uTime;
      uniform float uDepth;
      uniform float uProgress;

      float softCircle(vec2 uv, vec2 center, vec2 scale, float falloff) {
        vec2 q = (uv - center) * scale;
        return exp(-dot(q, q) * falloff);
      }

      void main() {
        vUv = uv;
        vec3 pos = position;

        float billboard = 1.0 - smoothstep(0.355, 0.415, uv.x);
        float floorNear = smoothstep(0.36, 0.58, uv.x)
          * (1.0 - smoothstep(0.20, 0.58, uv.y));
        float rightRail = smoothstep(0.48, 0.70, uv.x)
          * (1.0 - smoothstep(0.16, 0.48, uv.y));
        float ceilingNear = smoothstep(0.72, 0.92, uv.y);
        float corridor = softCircle(uv, vec2(0.43, 0.51), vec2(1.45, 1.0), 10.0);

        float depth =
            billboard * 0.115
          + rightRail * 0.060
          + floorNear * 0.028
          + ceilingNear * 0.018
          - corridor * 0.032;

        float ambientDrift = sin(uTime * 0.16 + uv.x * 2.8) * 0.0018
          * smoothstep(0.25, 1.0, uProgress);

        pos.z += depth * uDepth + ambientDrift;
        vDepth = clamp(depth * 6.0 + 0.42, 0.0, 1.0);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      uniform sampler2D uMap;
      uniform float uProgress;

      float hash21(vec2 value) {
        value = fract(value * vec2(123.34, 456.21));
        value += dot(value, value + 45.32);
        return fract(value.x * value.y);
      }

      float capsuleMask(vec2 point, vec2 start, vec2 end, float radius) {
        vec2 segment = end - start;
        vec2 relative = point - start;
        float along = clamp(
          dot(relative, segment) / max(0.00001, dot(segment, segment)),
          0.0,
          1.0
        );
        float distanceToSegment = length(relative - segment * along);
        return 1.0 - smoothstep(radius, radius + 0.012, distanceToSegment);
      }

      void main() {
        vec4 source = texture2D(uMap, vUv);
        vec3 colour = source.rgb;
        float sourceLuma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));

        colour = (colour - 0.5) * 1.045 + 0.5;
        float localExposure = mix(0.91, 0.985, smoothstep(0.0, 0.75, uProgress));
        colour *= localExposure;

        float corridorLight = exp(-dot(
          (vUv - vec2(0.43, 0.51)) * vec2(1.25, 0.86),
          (vUv - vec2(0.43, 0.51)) * vec2(1.25, 0.86)
        ) * 10.0);
        colour += corridorLight * uProgress * 0.026;
        colour += (vDepth - 0.5) * 0.009 * uProgress;

        vec2 headShape = (vUv - vec2(0.205, 0.665)) / vec2(0.036, 0.048);
        float photographedFigure = 1.0 - smoothstep(0.84, 1.13, length(headShape));
        photographedFigure = max(
          photographedFigure,
          capsuleMask(vUv, vec2(0.205, 0.595), vec2(0.205, 0.405), 0.073)
        );
        photographedFigure = max(
          photographedFigure,
          capsuleMask(vUv, vec2(0.180, 0.565), vec2(0.057, 0.550), 0.029)
        );
        photographedFigure = max(
          photographedFigure,
          capsuleMask(vUv, vec2(0.230, 0.565), vec2(0.327, 0.515), 0.029)
        );
        photographedFigure = max(
          photographedFigure,
          capsuleMask(vUv, vec2(0.190, 0.415), vec2(0.180, 0.215), 0.033)
        );
        photographedFigure = max(
          photographedFigure,
          capsuleMask(vUv, vec2(0.220, 0.415), vec2(0.220, 0.215), 0.033)
        );

        float figureDarkness = 1.0 - smoothstep(0.18, 0.62, sourceLuma);
        float figureTakeover = smoothstep(0.040, 0.115, uProgress);
        float cleanBillboard = mix(
          0.19,
          0.48,
          smoothstep(0.19, 0.70, vUv.y)
        );
        colour = mix(
          colour,
          vec3(cleanBillboard),
          photographedFigure
            * mix(0.78, 1.0, figureDarkness)
            * figureTakeover
            * 0.985
        );

        float cityBand = smoothstep(0.270, 0.282, vUv.x)
          * (1.0 - smoothstep(0.350, 0.365, vUv.x))
          * smoothstep(0.182, 0.202, vUv.y)
          * (1.0 - smoothstep(0.312, 0.328, vUv.y));
        float darkStructure = 1.0 - smoothstep(0.085, 0.315, sourceLuma);
        vec2 blockCell = floor(vUv * vec2(68.0, 54.0));
        float buildOrder = 0.350
          + clamp((vUv.y - 0.205) / 0.105, 0.0, 1.0) * 0.50
          + hash21(blockCell) * 0.035;
        float photographedReveal = smoothstep(buildOrder, buildOrder + 0.055, uProgress);
        float conceal = cityBand
          * darkStructure
          * (1.0 - photographedReveal)
          * 0.74;
        float vacantTone = mix(
          0.19,
          0.36,
          smoothstep(0.19, 0.31, vUv.y)
        );
        colour = mix(colour, vec3(vacantTone), conceal);

        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
  });
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDust() {
  const count = window.innerWidth < 700 ? 44 : 68;
  const random = seededRandom(71027);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 13.5;
    positions[i * 3 + 1] = (random() - 0.5) * 7.2;
    positions[i * 3 + 2] = 0.3 + random() * 7.1;
    phases[i] = random() * Math.PI * 2;
    scales[i] = 0.6 + random() * 1.1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

  dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.65) },
      uOpacity: { value: 0.105 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aScale;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vec3 pos = position;
        pos.x += sin(uTime * 0.12 + aPhase) * 0.032;
        pos.y += cos(uTime * 0.10 + aPhase * 0.73) * 0.024;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = clamp(
          aScale * uPixelRatio * (12.0 / max(1.0, -mvPosition.z)),
          0.7,
          3.8
        );
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;

      void main() {
        float radius = distance(gl_PointCoord, vec2(0.5));
        float alpha = (1.0 - smoothstep(0.18, 0.5, radius)) * uOpacity;
        gl_FragColor = vec4(vec3(0.92), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, dustMaterial);
}

function makeConstruction() {
  const random = seededRandom(19471);
  constructionData = [];

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column;
      const trip = row * 2 + Math.floor(column / 2);
      constructionData.push({
        targetUv: new THREE.Vector2(
          0.282 + column * 0.0165,
          0.205 + row * 0.0205,
        ),
        sourceUv: new THREE.Vector2(
          0.125 + (index % 4) * 0.0140 + (random() - 0.5) * 0.002,
          0.205 + Math.floor(index / 4) * 0.0080 + (random() - 0.5) * 0.002,
        ),
        trip,
        start: 0.350 + trip * 0.0500,
        duration: 0.0450,
        rotation: new THREE.Vector3(
          (random() - 0.5) * 0.28,
          (random() - 0.5) * 0.34,
          (random() - 0.5) * 0.24,
        ),
        shade: 0.085 + random() * 0.12,
      });
    }
  }

  constructionData = constructionData.map((block) => ({
    ...block,
    sourceUv: new THREE.Vector2(
      block.sourceUv.x,
      block.sourceUv.y,
    ),
    sourceLift: 0.056 + (random() - 0.5) * 0.010,
  }));

  const geometry = new THREE.BoxGeometry(0.122, 0.105, 0.090);
  constructionMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.12,
    roughness: 0.42,
    clearcoat: 0.22,
    clearcoatRoughness: 0.38,
    flatShading: true,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  constructionBlocks = new THREE.InstancedMesh(
    geometry,
    constructionMaterial,
    constructionData.length,
  );

  constructionBlocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  constructionBlocks.frustumCulled = false;
  constructionBlocks.renderOrder = 3;

  constructionData.forEach((block, index) => {
    constructionBlocks.setColorAt(index, new THREE.Color(block.shade, block.shade, block.shade));
  });
  if (constructionBlocks.instanceColor) constructionBlocks.instanceColor.needsUpdate = true;

  constructionBlocks.name = "hand-built-skyline";
  photoRig.add(constructionBlocks);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x111111, 1.35);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
  keyLight.position.set(-2.5, 3.8, 5.5);
  scene.add(hemisphere, keyLight);

  makeBuilder();
  updateConstruction(0, photoBaseScale, 0);
}

function depthAtUv(u, v) {
  const billboard = 1 - THREE.MathUtils.smoothstep(u, 0.355, 0.415);
  const floorNear = THREE.MathUtils.smoothstep(u, 0.36, 0.58)
    * (1 - THREE.MathUtils.smoothstep(v, 0.20, 0.58));
  const rightRail = THREE.MathUtils.smoothstep(u, 0.48, 0.70)
    * (1 - THREE.MathUtils.smoothstep(v, 0.16, 0.48));
  const ceilingNear = THREE.MathUtils.smoothstep(v, 0.72, 0.92);
  const qx = (u - 0.43) * 1.45;
  const qy = v - 0.51;
  const corridor = Math.exp(-(qx * qx + qy * qy) * 10);

  return (
    billboard * 0.115
    + rightRail * 0.060
    + floorNear * 0.028
    + ceilingNear * 0.018
    - corridor * 0.032
  );
}

function makeLimb(width) {
  const group = new THREE.Group();
  const outline = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.42, 1),
    builderOutlineMaterial,
  );
  const body = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 1),
    builderBodyMaterial,
  );
  body.position.z = 0.003;
  outline.renderOrder = 5;
  body.renderOrder = 6;
  group.add(outline, body);
  return group;
}

function makeJoint(radius) {
  const group = new THREE.Group();
  const outline = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.32, 20),
    builderOutlineMaterial,
  );
  const body = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    builderBodyMaterial,
  );
  body.position.z = 0.003;
  outline.renderOrder = 5;
  body.renderOrder = 6;
  group.add(outline, body);
  return group;
}

function makeBuilderLegacy() {
  builderBodyMaterial = new THREE.MeshBasicMaterial({
    color: 0x111416,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  builderOutlineMaterial = new THREE.MeshBasicMaterial({
    color: 0xd6d8da,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  builderDetailMaterial = new THREE.MeshBasicMaterial({
    color: 0x777d82,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  builderRig = new THREE.Group();
  builderRig.name = "seated-builder";

  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.046, 0.000);
  torsoShape.lineTo(-0.070, 0.120);
  torsoShape.lineTo(-0.052, 0.205);
  torsoShape.lineTo(0.052, 0.205);
  torsoShape.lineTo(0.070, 0.120);
  torsoShape.lineTo(0.046, 0.000);
  torsoShape.closePath();
  const torsoGeometry = new THREE.ShapeGeometry(torsoShape);
  const torsoGroup = new THREE.Group();
  const torsoOutline = new THREE.Mesh(torsoGeometry, builderOutlineMaterial);
  torsoOutline.scale.set(1.10, 1.05, 1);
  const torsoBody = new THREE.Mesh(torsoGeometry, builderBodyMaterial);
  torsoBody.position.z = 0.004;
  torsoOutline.renderOrder = 5;
  torsoBody.renderOrder = 6;
  torsoGroup.add(torsoOutline, torsoBody);

  const headOutline = new THREE.Mesh(
    new THREE.CircleGeometry(0.0325, 28),
    builderOutlineMaterial,
  );
  const head = new THREE.Mesh(
    new THREE.CircleGeometry(0.028, 28),
    builderBodyMaterial,
  );
  headOutline.position.set(0, 0.258, 0.001);
  head.position.set(0, 0.258, 0.005);
  torsoGroup.add(headOutline, head);

  const hardHat = new THREE.Mesh(
    new THREE.CircleGeometry(0.033, 20, 0, Math.PI),
    builderDetailMaterial,
  );
  hardHat.position.set(0, 0.268, 0.007);
  const brim = new THREE.Mesh(
    new THREE.PlaneGeometry(0.076, 0.008),
    builderDetailMaterial,
  );
  brim.position.set(0.006, 0.266, 0.008);
  torsoGroup.add(hardHat, brim);

  const vestPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.076, 0.080),
    builderDetailMaterial,
  );
  vestPanel.position.set(0, 0.125, 0.007);
  torsoGroup.add(vestPanel);

  builderParts = {
    torso: torsoGroup,
    leftUpperArm: makeLimb(0.018),
    leftForearm: makeLimb(0.016),
    rightUpperArm: makeLimb(0.018),
    rightForearm: makeLimb(0.016),
    leftThigh: makeLimb(0.027),
    leftShin: makeLimb(0.024),
    rightThigh: makeLimb(0.027),
    rightShin: makeLimb(0.024),
    leftElbow: makeJoint(0.012),
    rightElbow: makeJoint(0.012),
    leftHand: makeJoint(0.011),
    rightHand: makeJoint(0.011),
    leftKnee: makeJoint(0.014),
    rightKnee: makeJoint(0.014),
    leftFoot: makeJoint(0.015),
    rightFoot: makeJoint(0.015),
    pelvis: makeJoint(0.024),
  };

  Object.values(builderParts).forEach((part) => builderRig.add(part));
  photoRig.add(builderRig);
  setBuilderOpacityLegacy(0);
}

function setBuilderOpacityLegacy(amount) {
  if (!builderRig) return;
  builderRig.visible = amount > 0.001;
  builderBodyMaterial.opacity = amount * 0.97;
  builderOutlineMaterial.opacity = amount * 0.34;
  builderDetailMaterial.opacity = amount * 0.78;
}

function setSegment(segment, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  segment.position.set((start.x + end.x) * 0.5, (start.y + end.y) * 0.5, 0);
  segment.rotation.z = Math.atan2(dy, dx) - Math.PI * 0.5;
  segment.scale.set(1, length, 1);
}

function setJoint(joint, point) {
  joint.position.set(point.x, point.y, 0.006);
}

function rotatePoint(out, x, y, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  out.set(x * cosine - y * sine, x * sine + y * cosine);
  return out;
}

function solveElbow(out, shoulder, hand, upperLength, lowerLength, pole) {
  const dx = hand.x - shoulder.x;
  const dy = hand.y - shoulder.y;
  const rawDistance = Math.max(0.0001, Math.hypot(dx, dy));
  const distance = Math.min(rawDistance, upperLength + lowerLength - 0.001);
  const ux = dx / rawDistance;
  const uy = dy / rawDistance;
  const along = (
    upperLength * upperLength
    - lowerLength * lowerLength
    + distance * distance
  ) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  out.set(
    shoulder.x + ux * along - uy * height * pole,
    shoulder.y + uy * along + ux * height * pole,
  );
  return out;
}

function updateBuilderLegacy(progress, planeScale, depthProgress) {
  if (!builderRig) return;

  const takeover = THREE.MathUtils.smootherstep(progress, 0.040, 0.115);
  const kneel = THREE.MathUtils.smootherstep(progress, 0.105, 0.300);
  const rootU = THREE.MathUtils.lerp(0.205, 0.195, kneel);
  const rootV = THREE.MathUtils.lerp(0.405, 0.285, kneel);
  const lean = THREE.MathUtils.lerp(0, -0.62, kneel);
  const torsoCompression = THREE.MathUtils.lerp(1, 0.72, kneel);

  builderRig.position.set(
    (rootU - 0.5) * 1.5 * planeScale,
    (rootV - 0.5) * planeScale,
    depthAtUv(rootU, rootV) * depthProgress + 0.085,
  );
  builderRig.scale.set(planeScale, planeScale, 1);
  builderParts.torso.rotation.z = lean;
  builderParts.torso.scale.set(1, torsoCompression, 1);
  setBuilderOpacityLegacy(takeover);

  const leftHip = pointA.set(-0.012, 0);
  const rightHip = pointB.set(0.012, 0);
  const leftKnee = new THREE.Vector2(
    THREE.MathUtils.lerp(-0.018, -0.060, kneel),
    THREE.MathUtils.lerp(-0.105, -0.070, kneel),
  );
  const leftFoot = new THREE.Vector2(
    THREE.MathUtils.lerp(-0.032, -0.112, kneel),
    THREE.MathUtils.lerp(-0.190, -0.080, kneel),
  );
  const rightKnee = new THREE.Vector2(
    THREE.MathUtils.lerp(0.018, 0.075, kneel),
    THREE.MathUtils.lerp(-0.105, -0.030, kneel),
  );
  const rightFoot = new THREE.Vector2(
    THREE.MathUtils.lerp(0.032, 0.135, kneel),
    THREE.MathUtils.lerp(-0.190, -0.080, kneel),
  );

  setSegment(builderParts.leftThigh, leftHip, leftKnee);
  setSegment(builderParts.leftShin, leftKnee, leftFoot);
  setSegment(builderParts.rightThigh, rightHip, rightKnee);
  setSegment(builderParts.rightShin, rightKnee, rightFoot);
  setJoint(builderParts.leftKnee, leftKnee);
  setJoint(builderParts.rightKnee, rightKnee);
  setJoint(builderParts.leftFoot, leftFoot);
  setJoint(builderParts.rightFoot, rightFoot);
  setJoint(builderParts.pelvis, new THREE.Vector2(0, 0));

  const leftShoulder = rotatePoint(
    new THREE.Vector2(),
    -0.048,
    0.170 * torsoCompression,
    lean,
  );
  const rightShoulder = rotatePoint(
    new THREE.Vector2(),
    0.048,
    0.170 * torsoCompression,
    lean,
  );
  const standingLeftHand = new THREE.Vector2(-0.222, 0.145);
  const supportHand = new THREE.Vector2(-0.045, -0.070);
  const leftHand = standingLeftHand.clone().lerp(supportHand, kneel);

  const standingRightHand = new THREE.Vector2(0.183, 0.110);
  const restingRightHand = new THREE.Vector2(0.090, -0.035);
  const rightHand = standingRightHand.clone().lerp(restingRightHand, kneel);
  if (hasActivePlacement && planeScale > 0.001) {
    rightHand.set(
      (activePlacement.x - builderRig.position.x) / planeScale,
      (activePlacement.y - builderRig.position.y) / planeScale,
    );
  }

  const leftElbow = solveElbow(
    new THREE.Vector2(),
    leftShoulder,
    leftHand,
    0.112,
    0.105,
    -1,
  );
  const rightElbow = solveElbow(
    new THREE.Vector2(),
    rightShoulder,
    rightHand,
    0.120,
    0.112,
    1,
  );

  setSegment(builderParts.leftUpperArm, leftShoulder, leftElbow);
  setSegment(builderParts.leftForearm, leftElbow, leftHand);
  setSegment(builderParts.rightUpperArm, rightShoulder, rightElbow);
  setSegment(builderParts.rightForearm, rightElbow, rightHand);
  setJoint(builderParts.leftElbow, leftElbow);
  setJoint(builderParts.rightElbow, rightElbow);
  setJoint(builderParts.leftHand, leftHand);
  setJoint(builderParts.rightHand, rightHand);
}

function uvToPlane(u, v, out = new THREE.Vector2()) {
  return out.set((u - 0.5) * 1.5, v - 0.5);
}

function makeBuilderPartMaterial(rect) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: photoMaterial.uniforms.uMap.value },
      uRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform vec4 uRect;
      uniform float uOpacity;

      void main() {
        vec2 sampleUv = mix(uRect.xy, uRect.zw, vUv);
        vec4 source = texture2D(uMap, sampleUv);
        float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
        float silhouette = 1.0 - smoothstep(0.20, 0.59, luma);
        vec2 feather = smoothstep(vec2(0.0), vec2(0.075), vUv)
          * smoothstep(vec2(0.0), vec2(0.075), 1.0 - vUv);
        float edge = feather.x * feather.y;
        vec3 graphite = mix(source.rgb * 0.72, vec3(0.035, 0.040, 0.044), 0.30);
        float alpha = silhouette * edge * uOpacity;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(graphite, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  builderMaterials.push(material);
  return material;
}

function createPhotoPart(name, rect, order, originalStartUv, originalEndUv) {
  const width = (rect[2] - rect[0]) * 1.5;
  const height = rect[3] - rect[1];
  const material = makeBuilderPartMaterial(rect);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  const center = uvToPlane(
    (rect[0] + rect[2]) * 0.5,
    (rect[1] + rect[3]) * 0.5,
  );
  mesh.name = name;
  mesh.position.set(center.x, center.y, order * 0.003);
  mesh.renderOrder = order;
  builderRig.add(mesh);

  const part = { mesh, material, center };
  if (originalStartUv && originalEndUv) {
    part.originalStart = uvToPlane(originalStartUv[0], originalStartUv[1]);
    part.originalEnd = uvToPlane(originalEndUv[0], originalEndUv[1]);
    part.originalMid = part.originalStart.clone().lerp(part.originalEnd, 0.5);
    part.originalOffset = center.clone().sub(part.originalMid);
    part.originalAngle = Math.atan2(
      part.originalEnd.y - part.originalStart.y,
      part.originalEnd.x - part.originalStart.x,
    );
    part.originalLength = part.originalStart.distanceTo(part.originalEnd);
  }
  return part;
}

function setPhotoPart(part, center, rotation = 0, scaleX = 1, scaleY = 1) {
  part.mesh.position.set(center.x, center.y, part.mesh.position.z);
  part.mesh.rotation.z = rotation;
  part.mesh.scale.set(scaleX, scaleY, 1);
}

function setPhotoSegment(part, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const rotation = angle - part.originalAngle;
  const scale = length / part.originalLength;
  const midpoint = start.clone().lerp(end, 0.5);
  const offset = part.originalOffset.clone().multiplyScalar(scale);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  midpoint.x += offset.x * cosine - offset.y * sine;
  midpoint.y += offset.x * sine + offset.y * cosine;
  setPhotoPart(part, midpoint, rotation, scale, scale);
}

function makeBuilder() {
  builderRig = new THREE.Group();
  builderRig.name = "photographic-builder";
  builderMaterials = [];
  photoRig.add(builderRig);

  builderParts = {
    leftLowerLeg: createPhotoPart(
      "left-lower-leg",
      [0.150, 0.205, 0.205, 0.325],
      5,
      [0.180, 0.310],
      [0.180, 0.215],
    ),
    rightLowerLeg: createPhotoPart(
      "right-lower-leg",
      [0.200, 0.205, 0.245, 0.325],
      5,
      [0.220, 0.310],
      [0.220, 0.215],
    ),
    leftUpperLeg: createPhotoPart(
      "left-upper-leg",
      [0.160, 0.300, 0.212, 0.425],
      6,
      [0.190, 0.405],
      [0.180, 0.310],
    ),
    rightUpperLeg: createPhotoPart(
      "right-upper-leg",
      [0.198, 0.300, 0.242, 0.425],
      6,
      [0.220, 0.405],
      [0.220, 0.310],
    ),
    torso: createPhotoPart(
      "suit-torso",
      [0.145, 0.395, 0.265, 0.625],
      7,
    ),
    head: createPhotoPart(
      "photographic-head",
      [0.170, 0.615, 0.240, 0.718],
      8,
    ),
    leftUpperArm: createPhotoPart(
      "left-upper-arm",
      [0.095, 0.525, 0.195, 0.600],
      8,
      [0.180, 0.565],
      [0.110, 0.550],
    ),
    leftForearm: createPhotoPart(
      "left-forearm",
      [0.045, 0.520, 0.128, 0.580],
      9,
      [0.110, 0.550],
      [0.057, 0.550],
    ),
    rightUpperArm: createPhotoPart(
      "right-upper-arm",
      [0.218, 0.520, 0.300, 0.595],
      8,
      [0.230, 0.565],
      [0.280, 0.540],
    ),
    rightForearm: createPhotoPart(
      "right-forearm",
      [0.268, 0.485, 0.350, 0.565],
      9,
      [0.280, 0.540],
      [0.327, 0.515],
    ),
  };

  builderRig.scale.set(photoBaseScale, photoBaseScale, 1);
  setBuilderOpacity(0);
}

function setBuilderOpacity(amount) {
  if (!builderRig) return;
  builderRig.visible = amount > 0.002;
  builderMaterials.forEach((material) => {
    material.uniforms.uOpacity.value = amount;
  });
}

function clampReach(shoulder, target, maximum) {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const distance = Math.hypot(dx, dy);
  if (distance > maximum) {
    target.set(
      shoulder.x + (dx / distance) * maximum,
      shoulder.y + (dy / distance) * maximum,
    );
  }
  return target;
}

function updateBuilder(progress, planeScale, depthProgress) {
  if (!builderRig) return;

  const takeover = THREE.MathUtils.smootherstep(progress, 0.040, 0.115);
  const prepare = THREE.MathUtils.smootherstep(progress, 0.080, 0.165);
  const kneel = THREE.MathUtils.smootherstep(progress, 0.155, 0.305);
  builderRig.position.set(
    0,
    0,
    depthAtUv(0.205, 0.48) * depthProgress + 0.082,
  );
  builderRig.scale.set(planeScale, planeScale, 1);
  setBuilderOpacity(takeover);

  const torsoCenter = uvToPlane(
    THREE.MathUtils.lerp(0.205, 0.205, kneel),
    THREE.MathUtils.lerp(0.510, 0.360, kneel),
  );
  const headCenter = uvToPlane(
    THREE.MathUtils.lerp(0.205, 0.195, kneel),
    THREE.MathUtils.lerp(0.666, 0.435, kneel),
  );
  setPhotoPart(
    builderParts.torso,
    torsoCenter,
    THREE.MathUtils.lerp(0, -0.36, kneel),
    1,
    THREE.MathUtils.lerp(1, 0.82, kneel),
  );
  setPhotoPart(
    builderParts.head,
    headCenter,
    THREE.MathUtils.lerp(0, -0.20, kneel),
  );

  const leftHip = uvToPlane(
    THREE.MathUtils.lerp(0.190, 0.187, kneel),
    THREE.MathUtils.lerp(0.405, 0.285, kneel),
  );
  const leftKnee = uvToPlane(
    THREE.MathUtils.lerp(0.180, 0.155, kneel),
    THREE.MathUtils.lerp(0.310, 0.215, kneel),
  );
  const leftFoot = uvToPlane(
    THREE.MathUtils.lerp(0.180, 0.120, kneel),
    THREE.MathUtils.lerp(0.215, 0.205, kneel),
  );
  const rightHip = uvToPlane(
    THREE.MathUtils.lerp(0.220, 0.203, kneel),
    THREE.MathUtils.lerp(0.405, 0.285, kneel),
  );
  const rightKnee = uvToPlane(
    THREE.MathUtils.lerp(0.220, 0.245, kneel),
    THREE.MathUtils.lerp(0.310, 0.255, kneel),
  );
  const rightFoot = uvToPlane(
    THREE.MathUtils.lerp(0.220, 0.285, kneel),
    THREE.MathUtils.lerp(0.215, 0.205, kneel),
  );
  setPhotoSegment(builderParts.leftUpperLeg, leftHip, leftKnee);
  setPhotoSegment(builderParts.leftLowerLeg, leftKnee, leftFoot);
  setPhotoSegment(builderParts.rightUpperLeg, rightHip, rightKnee);
  setPhotoSegment(builderParts.rightLowerLeg, rightKnee, rightFoot);

  const leftShoulder = uvToPlane(
    THREE.MathUtils.lerp(0.180, 0.180, kneel),
    THREE.MathUtils.lerp(0.565, 0.365, kneel),
  );
  const rightShoulder = uvToPlane(
    THREE.MathUtils.lerp(0.230, 0.210, kneel),
    THREE.MathUtils.lerp(0.565, 0.365, kneel),
  );
  const standingLeftHand = uvToPlane(0.057, 0.550);
  const loweredLeftHand = uvToPlane(0.120, 0.440);
  const supportLeftHand = uvToPlane(0.150, 0.215);
  const leftHand = standingLeftHand
    .clone()
    .lerp(loweredLeftHand, prepare)
    .lerp(supportLeftHand, kneel);
  const leftElbow = solveElbow(
    new THREE.Vector2(),
    leftShoulder,
    leftHand,
    0.112,
    0.105,
    -1,
  );

  const standingRightHand = uvToPlane(0.327, 0.515);
  const loweredRightHand = uvToPlane(0.285, 0.430);
  const restingRightHand = uvToPlane(0.250, 0.235);
  const rightHand = standingRightHand
    .clone()
    .lerp(loweredRightHand, prepare)
    .lerp(restingRightHand, kneel);
  if (hasActivePlacement && planeScale > 0.001) {
    rightHand.set(
      activePlacement.x / planeScale,
      activePlacement.y / planeScale,
    );
  }
  clampReach(rightShoulder, rightHand, 0.220);
  const rightElbow = solveElbow(
    new THREE.Vector2(),
    rightShoulder,
    rightHand,
    0.115,
    0.106,
    1,
  );

  setPhotoSegment(builderParts.leftUpperArm, leftShoulder, leftElbow);
  setPhotoSegment(builderParts.leftForearm, leftElbow, leftHand);
  setPhotoSegment(builderParts.rightUpperArm, rightShoulder, rightElbow);
  setPhotoSegment(builderParts.rightForearm, rightElbow, rightHand);
}

function updateConstruction(progress, planeScale, depthProgress) {
  if (!constructionBlocks) return;

  hasActivePlacement = false;
  activePlacement.set(0, 0, 0);
  let activeCount = 0;
  const pileReveal = THREE.MathUtils.smootherstep(progress, 0.255, 0.330);

  constructionData.forEach((block, index) => {
    const local = (progress - block.start) / block.duration;
    const raw = clamp01(local);

    constructionSource.set(
      (block.sourceUv.x - 0.5) * 1.5 * planeScale,
      (block.sourceUv.y - 0.5) * planeScale,
      depthAtUv(block.sourceUv.x, block.sourceUv.y) * depthProgress + block.sourceLift,
    );
    constructionTarget.set(
      (block.targetUv.x - 0.5) * 1.5 * planeScale,
      (block.targetUv.y - 0.5) * planeScale,
      depthAtUv(block.targetUv.x, block.targetUv.y) * depthProgress + 0.060,
    );

    constructionPosition.copy(constructionSource);

    if (raw >= 0.25 && raw < 0.38) {
      const lift = THREE.MathUtils.smootherstep(raw, 0.25, 0.38);
      constructionPosition.y += lift * 0.030 * planeScale;
    } else if (raw >= 0.38 && raw < 0.68) {
      const carry = THREE.MathUtils.smootherstep(raw, 0.38, 0.68);
      constructionPosition.lerp(constructionTarget, carry);
      constructionPosition.y += 0.030 * planeScale;
    } else if (raw >= 0.68 && raw < 0.84) {
      const lower = THREE.MathUtils.smootherstep(raw, 0.68, 0.84);
      constructionPosition.copy(constructionTarget);
      constructionPosition.y += (1 - lower) * 0.030 * planeScale;
    } else if (raw >= 0.84) {
      constructionPosition.copy(constructionTarget);
    }

    if (local >= 0 && raw < 1) {
      handGuide.copy(constructionPosition);
      if (raw >= 0.90) {
        const retract = THREE.MathUtils.smootherstep(raw, 0.90, 1.0);
        handGuide.copy(constructionTarget).lerp(constructionSource, retract);
        handGuide.y += Math.sin(retract * Math.PI) * 0.020 * planeScale;
      }
      activePlacement.add(handGuide);
      activeCount += 1;
    }

    constructionDummy.position.copy(constructionPosition);
    const align = THREE.MathUtils.smootherstep(raw, 0.25, 0.84);
    constructionDummy.rotation.set(
      block.rotation.x * (1 - align),
      block.rotation.y * (1 - align),
      block.rotation.z * (1 - align),
    );
    const visibleScale = local < 0 ? pileReveal : 1;
    constructionDummy.scale.setScalar(
      Math.max(0.0001, visibleScale * (planeScale / 8.0)),
    );
    constructionDummy.updateMatrix();

    constructionBlocks.setMatrixAt(index, constructionDummy.matrix);
  });

  if (activeCount > 0) {
    activePlacement.multiplyScalar(1 / activeCount);
    hasActivePlacement = true;
  }

  constructionBlocks.instanceMatrix.needsUpdate = true;
}

function resize() {
  if (!renderer || !camera) return;

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.4 : 1.65);

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  if (photoMesh) {
    const establishingDistance = cameraFrames[0].pos[2];
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * establishingDistance;
    const visibleWidth = visibleHeight * camera.aspect;
    photoBaseScale = Math.max(visibleHeight, visibleWidth / 1.5) * 1.13;
    photoMesh.scale.set(photoBaseScale, photoBaseScale, 1);
  }

  if (dustMaterial) dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
}

function setChapter(nextChapter) {
  if (nextChapter === state.chapter) return;
  state.chapter = nextChapter;

  const targets = [chapterIndex, chapterName];
  gsap.killTweensOf(targets);
  gsap.to(targets, {
    y: -4,
    opacity: 0,
    duration: 0.16,
    ease: "power1.in",
    onComplete: () => {
      chapterIndex.textContent = String(nextChapter + 1).padStart(2, "0");
      chapterName.textContent = chapterNames[nextChapter];
      gsap.fromTo(
        targets,
        { y: 5, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.34, ease: "power2.out", overwrite: true },
      );
    },
  });
}

function updateInterface(progress) {
  const percentage = Math.round(progress * 100);
  progressFill.style.transform = "scaleX(" + progress.toFixed(4) + ")";
  progressNumber.textContent = String(percentage).padStart(2, "0");

  const cueOpacity = clamp01(1 - progress / 0.115);
  scrollCue.style.opacity = cueOpacity.toFixed(3);
  scrollCue.style.transform = "translateX(-50%) translateY(" + (progress * 14).toFixed(2) + "px)";

  const nextChapter = progress < 0.235 ? 0 : progress < 0.515 ? 1 : progress < 0.79 ? 2 : 3;
  setChapter(nextChapter);
}

function render(time) {
  const delta = Math.min(0.05, Math.max(0.001, (time - state.lastTime) / 1000));
  state.lastTime = time;

  if (smoothScroll) smoothScroll.raf(time);

  state.progress = damp(state.progress, state.targetProgress, 6.2, delta);
  state.pointerX = damp(state.pointerX, state.pointerTargetX, 4.8, delta);
  state.pointerY = damp(state.pointerY, state.pointerTargetY, 4.8, delta);

  sampleCameraFrame(state.progress);
  const photoScale = samplePhotoFrame(state.progress);

  camera.position.set(
    framePosition.x + state.pointerX * 0.055,
    framePosition.y - state.pointerY * 0.035,
    framePosition.z,
  );
  clockAim.set(
    frameAim.x + state.pointerX * 0.035,
    frameAim.y - state.pointerY * 0.022,
    frameAim.z,
  );
  camera.lookAt(clockAim);

  const ambientX = Math.sin(time * 0.00013) * 0.012;
  const ambientY = Math.cos(time * 0.00011) * 0.008;
  const ambientScale = 1 + Math.sin(time * 0.00009) * 0.0015;
  photoRig.position.set(
    photoPosition.x + ambientX + state.pointerX * 0.018,
    photoPosition.y + ambientY - state.pointerY * 0.012,
    photoPosition.z,
  );
  photoRig.rotation.set(
    photoRotation.x - state.pointerY * 0.0038,
    photoRotation.y + state.pointerX * 0.0055,
    photoRotation.z,
  );
  photoMesh.scale.set(
    photoBaseScale * photoScale * ambientScale,
    photoBaseScale * photoScale * ambientScale,
    1,
  );

  const depthProgress = THREE.MathUtils.smootherstep(state.progress, 0.0, 0.44);
  photoMaterial.uniforms.uDepth.value = depthProgress;
  photoMaterial.uniforms.uProgress.value = state.progress;
  photoMaterial.uniforms.uTime.value = time * 0.001;
  updateConstruction(
    state.progress,
    photoBaseScale * photoScale * ambientScale,
    depthProgress,
  );
  updateBuilder(
    state.progress,
    photoBaseScale * photoScale * ambientScale,
    depthProgress,
  );

  if (dustMaterial) {
    dustMaterial.uniforms.uTime.value = time * 0.001;
    dustMaterial.uniforms.uOpacity.value = 0.085 + depthProgress * 0.025;
    dust.rotation.y = state.pointerX * 0.006;
    dust.position.x = -state.progress * 0.12;
  }

  lightField.style.transform =
    "translate3d("
    + (state.progress * 2.2 + state.pointerX * 0.42).toFixed(3)
    + "%, "
    + (-state.progress * 1.15 + state.pointerY * 0.32).toFixed(3)
    + "%, 0) scale(1.035)";

  updateInterface(state.progress);
  renderer.render(scene, camera);
  rafId = requestAnimationFrame(render);
}

function renderReducedFrame() {
  sampleCameraFrame(0);
  samplePhotoFrame(0);
  camera.position.copy(framePosition);
  camera.lookAt(frameAim);
  photoRig.position.copy(photoPosition);
  photoRig.rotation.set(photoRotation.x, photoRotation.y, photoRotation.z);
  photoMesh.scale.set(photoBaseScale, photoBaseScale, 1);
  photoMaterial.uniforms.uDepth.value = 0;
  photoMaterial.uniforms.uProgress.value = 0;
  renderer.render(scene, camera);
}

function attachInteraction() {
  if (finePointer && !reduceMotion) {
    window.addEventListener("pointermove", (event) => {
      state.pointerTargetX = clamp01(event.clientX / window.innerWidth) * 2 - 1;
      state.pointerTargetY = clamp01(event.clientY / window.innerHeight) * 2 - 1;
      document.documentElement.style.setProperty("--mx", event.clientX + "px");
      document.documentElement.style.setProperty("--my", event.clientY + "px");
    }, { passive: true });

    document.documentElement.addEventListener("pointerleave", () => {
      state.pointerTargetX = 0;
      state.pointerTargetY = 0;
      document.documentElement.style.setProperty("--mx", "50%");
      document.documentElement.style.setProperty("--my", "50%");
    });
  }

  if (!reduceMotion) {
    smoothScroll = new Lenis({
      lerp: 0.075,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.84,
      touchMultiplier: 1.0,
      autoRaf: false,
    });
    smoothScroll.on("scroll", ScrollTrigger.update);

    scrollTrigger = ScrollTrigger.create({
      trigger: scrollTrack,
      start: "top top",
      end: "bottom bottom",
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        state.targetProgress = self.progress;
      },
    });

    ScrollTrigger.refresh();
    state.targetProgress = scrollTrigger.progress;
    state.progress = state.targetProgress;
  }
}

async function initialise() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
  } catch (error) {
    experience.classList.add("has-webgl-error");
    console.warn("WebGL renderer could not be created.", error);
    return;
  }

  renderer.setClearColor(0x080808, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080808);

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  camera.position.set(...cameraFrames[0].pos);

  const texture = await new THREE.TextureLoader().loadAsync(fallbackPhoto.currentSrc || fallbackPhoto.src);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  photoMaterial = makePhotoMaterial(texture);
  const photoGeometry = new THREE.PlaneGeometry(1.5, 1, 120, 80);
  photoMesh = new THREE.Mesh(photoGeometry, photoMaterial);
  photoRig = new THREE.Group();
  photoRig.name = "moving-photograph";
  photoRig.add(photoMesh);
  scene.add(photoRig);

  if (!reduceMotion) {
    makeConstruction();
    dust = makeDust();
    scene.add(dust);
  }

  resize();
  attachInteraction();

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    cancelAnimationFrame(rafId);
    if (smoothScroll) smoothScroll.stop();
    experience.classList.remove("is-ready");
    experience.classList.add("has-webgl-error");
  });

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) renderReducedFrame();
    else ScrollTrigger.refresh();
  }, { passive: true });

  experience.classList.add("is-ready");

  if (reduceMotion) {
    renderReducedFrame();
  } else {
    state.lastTime = performance.now();
    rafId = requestAnimationFrame(render);
  }
}

initialise().catch((error) => {
  experience.classList.add("has-webgl-error");
  console.error("The cinematic scene could not be initialised.", error);
});
