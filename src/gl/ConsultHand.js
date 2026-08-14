import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { wantsAA } from "./msaa.js";

/* ── HAND SCENE RENDER RESOLUTION ──
   Measured on a 430x932@3 iPhone viewport: at 1.2x this scene's post chain
   holds four buffers of ~6 MB plus a 3.5 MB target — ~27 MB, the second largest
   block on the site after the CodeBuild texture. Cost scales with the SQUARE of
   this number, so 1.2 -> 1.0 removes ~31% of all of them.

   Applied on a coarse pointer only, so a mouse never reaches it and desktop
   keeps the full 1.2. Called live from resize() as well as at build, so an
   orientation change or a phone-to-desktop devtools switch re-reads it rather
   than staying on whatever was true at boot. */
function handPixelRatio() {
  const coarse = typeof matchMedia === "function"
    && matchMedia("(pointer: coarse)").matches;
  return Math.min(devicePixelRatio, coarse ? 1 : 1.2);
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function globePoint(longitude, latitude, radius = 3.27) {
  const lon = MathUtils.degToRad(longitude);
  const lat = MathUtils.degToRad(latitude);
  const latitudeRadius = Math.cos(lat) * radius;
  return [
    latitudeRadius * Math.sin(lon),
    Math.sin(lat) * radius,
    latitudeRadius * Math.cos(lon),
  ];
}

function makeContinent(points, material) {
  const vertices = points.flatMap(([longitude, latitude]) => globePoint(longitude, latitude));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return { line: new Line(geometry, material), geometry };
}

const PLANT_ATLAS_SIZE = 1254;
const PLANT_ATLAS_GRID = 3;
const PLANT_ATLAS_PAD = 2 / PLANT_ATLAS_SIZE;

function makeAtlasPlane(tile, width, height, segmentsX, segmentsY, bow, anchorX, anchorY) {
  const geometry = new PlaneGeometry(width, height, segmentsX, segmentsY);
  geometry.translate((0.5 - anchorX) * width, (0.5 - anchorY) * height, 0);
  const column = tile % PLANT_ATLAS_GRID;
  const row = Math.floor(tile / PLANT_ATLAS_GRID);
  const cell = 1 / PLANT_ATLAS_GRID;
  const uMin = column * cell + PLANT_ATLAS_PAD;
  const uMax = (column + 1) * cell - PLANT_ATLAS_PAD;
  const vMin = 1 - (row + 1) * cell + PLANT_ATLAS_PAD;
  const vMax = 1 - row * cell - PLANT_ATLAS_PAD;
  const uv = geometry.getAttribute("uv");
  const position = geometry.getAttribute("position");
  for (let index = 0; index < uv.count; index += 1) {
    const localU = uv.getX(index);
    const localV = uv.getY(index);
    uv.setXY(
      index,
      MathUtils.lerp(uMin, uMax, localU),
      MathUtils.lerp(vMin, vMax, localV),
    );
    position.setZ(
      index,
      position.getZ(index)
        + Math.sin(localU * Math.PI) * Math.sin(localV * Math.PI) * bow,
    );
  }
  uv.needsUpdate = true;
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return { geometry, vMin, vMax };
}

function makeAtlasWing(tile, side) {
  const width = 0.34;
  const height = 0.38;
  const geometry = new PlaneGeometry(width, height, 3, 3);
  // Each half pivots at the butterfly thorax so the photographic wings fold
  // in actual 3D instead of swapping between visibly misaligned atlas frames.
  geometry.translate(side < 0 ? -width * 0.5 : width * 0.5, 0, 0);
  const column = tile % PLANT_ATLAS_GRID;
  const row = Math.floor(tile / PLANT_ATLAS_GRID);
  const cell = 1 / PLANT_ATLAS_GRID;
  const cellUMin = column * cell + PLANT_ATLAS_PAD;
  const cellUMax = (column + 1) * cell - PLANT_ATLAS_PAD;
  const cellUMid = (cellUMin + cellUMax) * 0.5;
  const uMin = side < 0 ? cellUMin : cellUMid;
  const uMax = side < 0 ? cellUMid : cellUMax;
  const vMin = 1 - (row + 1) * cell + PLANT_ATLAS_PAD;
  const vMax = 1 - row * cell - PLANT_ATLAS_PAD;
  const uv = geometry.getAttribute("uv");
  const position = geometry.getAttribute("position");
  for (let index = 0; index < uv.count; index += 1) {
    const localU = uv.getX(index);
    const localV = uv.getY(index);
    uv.setXY(index, MathUtils.lerp(uMin, uMax, localU), MathUtils.lerp(vMin, vMax, localV));
    position.setZ(
      index,
      position.getZ(index)
        + Math.sin(localU * Math.PI) * Math.sin(localV * Math.PI) * 0.018,
    );
  }
  uv.needsUpdate = true;
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

function makeMoneyBirdWing(side) {
  const sign = side < 0 ? 1 : -1;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -0.30, 0, 0.015,
    0.18, 0, 0.02,
    -0.12, sign * 0.78, 0,
  ], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([
    0.08, 0.18,
    0.88, 0.38,
    0.30, 0.96,
  ], 2));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeMoneyBirdBody() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -0.62, -0.10, 0,
    0.42, -0.12, 0.028,
    0.72, 0, 0.01,
    0.35, 0.14, 0.028,
    -0.62, 0.12, 0,
  ], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([
    0.02, 0.18,
    0.72, 0.10,
    0.98, 0.50,
    0.70, 0.90,
    0.02, 0.82,
  ], 2));
  geometry.setIndex([0, 1, 4, 1, 3, 4, 1, 2, 3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeBurnFragmentGeometry(points, width = 1.82, height = 0.78) {
  const centerU = points.reduce((sum, [u]) => sum + u, 0) / points.length;
  const centerV = points.reduce((sum, [, v]) => sum + v, 0) / points.length;
  const positions = [0, 0, 0];
  const uvs = [centerU, centerV];
  points.forEach(([u, v]) => {
    positions.push((u - centerU) * width, (v - centerV) * height, 0);
    uvs.push(u, v);
  });
  const indices = [];
  for (let index = 0; index < points.length; index += 1) {
    indices.push(0, index + 1, ((index + 1) % points.length) + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return {
    geometry,
    center: new Vector3((centerU - 0.5) * width, (centerV - 0.5) * height, 0),
  };
}

export function createConsultHand(canvas) {
  if (!canvas) return null;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: wantsAA(),
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(handPixelRatio());
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 12.5);

  /* Hollow data globe: sparse latitude/longitude mesh plus simplified
     continent outlines. It stays lightweight and reads as a graph rather
     than a solid decorative planet. */
  const globe = new Group();
  globe.renderOrder = 3;
  scene.add(globe);
  const globeGridMaterial = new MeshBasicMaterial({
    color: 0x006b43,
    wireframe: true,
    side: DoubleSide,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  // A missing 90° longitude sector makes the globe read as a broken/open
  // shell, leaving a clear intake for the incoming notes.
  const globeGridGeometry = new SphereGeometry(3.24, 32, 20, Math.PI * 0.98, Math.PI * 1.5);
  const globeGrid = new Mesh(globeGridGeometry, globeGridMaterial);
  globe.add(globeGrid);

  /* A complete, lower-contrast inner shell is visible only during the lens
     dive. It prevents the Earth interior from reading as an empty mint disc,
     then fades before the broken outer globe settles above the hand. */
  const globeInteriorGridMaterial = new MeshBasicMaterial({
    color: 0x087a50,
    wireframe: true,
    side: DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const globeInteriorGridGeometry = new SphereGeometry(3.16, 28, 18);
  const globeInteriorGrid = new Mesh(globeInteriorGridGeometry, globeInteriorGridMaterial);
  globe.add(globeInteriorGrid);

  const globeAccentMaterial = new MeshBasicMaterial({
    color: 0x54f0a5,
    wireframe: true,
    side: DoubleSide,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const globeAccentGeometry = new SphereGeometry(3.29, 16, 10, Math.PI * 0.98, Math.PI * 1.5);
  globe.add(new Mesh(globeAccentGeometry, globeAccentMaterial));

  const continentMaterial = new LineBasicMaterial({
    color: 0x004f32,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const continentShapes = [
    [[-168, 72], [-140, 67], [-124, 50], [-100, 48], [-82, 25], [-96, 16], [-111, 23], [-126, 34], [-145, 56], [-168, 72]],
    [[-81, 12], [-66, 7], [-50, -5], [-40, -23], [-55, -55], [-72, -38], [-79, -10], [-81, 12]],
    [[-17, 37], [15, 35], [34, 30], [51, 12], [42, -15], [25, -35], [5, -32], [-15, 7], [-17, 37]],
    [[-10, 36], [-5, 58], [22, 70], [50, 58], [80, 72], [122, 55], [148, 45], [132, 20], [104, 5], [78, 8], [54, 24], [30, 35], [-10, 36]],
    [[112, -10], [154, -11], [153, -39], [129, -44], [113, -26], [112, -10]],
    [[-52, 82], [-18, 74], [-42, 60], [-62, 70], [-52, 82]],
  ];
  const continentGeometries = [];
  continentShapes.forEach((shape) => {
    const continent = makeContinent(shape, continentMaterial);
    continentGeometries.push(continent.geometry);
    globe.add(continent.line);
  });

  const orbitMaterial = new MeshBasicMaterial({
    color: 0x0b8a5d,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const orbitGeometry = new TorusGeometry(3.48, 0.018, 6, 112);
  const globeOrbit = new Mesh(orbitGeometry, orbitMaterial);
  globeOrbit.rotation.set(1.08, 0.1, -0.18);
  globe.add(globeOrbit);

  /* One lightweight procedural shell creates slow vapor wisps only around the
     silhouette. It renders below the wire mesh, keeping the globe structure
     crisp while the atmosphere breathes outside it. */
  const globeFumeGeometry = new SphereGeometry(3.48, 32, 22);
  const globeFumeMaterial = new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec3 animated = position;
        float largeWave = sin(position.y * 2.25 + position.x * 0.72 + uTime * 0.31) * 0.055;
        float smallWave = sin(position.x * 3.2 - position.z * 2.45 - uTime * 0.24) * 0.034;
        animated += normal * (largeWave + smallWave);
        vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
        vLocalPosition = animated;
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;

      float hashNoise(vec3 point) {
        point = fract(point * 0.3183099 + vec3(0.11, 0.17, 0.13));
        point *= 17.0;
        return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
      }

      float valueNoise(vec3 point) {
        vec3 cell = floor(point);
        vec3 fraction = fract(point);
        fraction = fraction * fraction * (3.0 - 2.0 * fraction);
        float n000 = hashNoise(cell + vec3(0.0, 0.0, 0.0));
        float n100 = hashNoise(cell + vec3(1.0, 0.0, 0.0));
        float n010 = hashNoise(cell + vec3(0.0, 1.0, 0.0));
        float n110 = hashNoise(cell + vec3(1.0, 1.0, 0.0));
        float n001 = hashNoise(cell + vec3(0.0, 0.0, 1.0));
        float n101 = hashNoise(cell + vec3(1.0, 0.0, 1.0));
        float n011 = hashNoise(cell + vec3(0.0, 1.0, 1.0));
        float n111 = hashNoise(cell + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, fraction.x);
        float nx10 = mix(n010, n110, fraction.x);
        float nx01 = mix(n001, n101, fraction.x);
        float nx11 = mix(n011, n111, fraction.x);
        return mix(mix(nx00, nx10, fraction.y), mix(nx01, nx11, fraction.y), fraction.z);
      }

      float smokeNoise(vec3 point) {
        float result = 0.0;
        float amplitude = 0.56;
        result += valueNoise(point) * amplitude;
        point = point * 2.03 + vec3(3.1, 1.7, 2.4);
        amplitude *= 0.5;
        result += valueNoise(point) * amplitude;
        point = point * 2.01 + vec3(1.3, 4.2, 2.8);
        amplitude *= 0.5;
        result += valueNoise(point) * amplitude;
        return result;
      }

      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDirection))), 1.55);
        vec3 drift = vLocalPosition * 0.92
          + vec3(uTime * 0.085, -uTime * 0.045, uTime * 0.064);
        float smoke = smokeNoise(drift);
        float strand = sin(vLocalPosition.y * 3.1 - vLocalPosition.x * 1.2 + uTime * 0.38) * 0.08;
        float wisps = smoothstep(0.37, 0.77, smoke + strand);
        float silhouette = smoothstep(0.10, 0.76, rim);
        float brokenEdge = smoothstep(0.24, 0.82, smokeNoise(drift * 1.37 + 5.2));
        float alpha = uOpacity * silhouette * wisps * (0.52 + brokenEdge * 0.48);
        vec3 deepGreen = vec3(0.008, 0.22, 0.12);
        vec3 mintGlow = vec3(0.10, 0.62, 0.32);
        vec3 color = mix(deepGreen, mintGlow, clamp(smoke * 0.78, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const globeFume = new Mesh(globeFumeGeometry, globeFumeMaterial);
  globeFume.renderOrder = -2;
  globeFume.scale.set(1.025, 1.045, 1.015);
  globe.add(globeFume);

  /* Photographic 2.5D plant: one alpha atlas, baked per-tile UVs and lightly
     bowed planes. Its root crown lands directly on the wire globe floor—there
     is deliberately no secondary sphere or mound inside the globe. */
  const plant = new Group();
  const plantBaseScale = 0.96;
  plant.position.set(0, -2.40, 0.16);
  plant.renderOrder = 3;
  globe.add(plant);

  let plantAtlasReady = false;
  const plantAtlasTexture = new TextureLoader().load(
    "/assets/consult-plant-atlas-v3.png",
    () => { plantAtlasReady = true; },
  );
  plantAtlasTexture.colorSpace = SRGBColorSpace;
  plantAtlasTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const plantAtlasMaterial = new MeshBasicMaterial({
    map: plantAtlasTexture,
    transparent: true,
    opacity: 0,
    alphaTest: 0.02,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const plantAtlasGeometries = [];

  /* A second hand-matched atlas turns the living world into a layered ecology.
     Structural cutouts stay opaque + alpha-tested so their photographic edges
     write clean depth against both the inner core and the wire shell. */
  let ecologyAtlasReady = false;
  const ecologyAtlasTexture = new TextureLoader().load(
    "/assets/consult-ecology-atlas-v1.png",
    () => { ecologyAtlasReady = true; },
  );
  ecologyAtlasTexture.colorSpace = SRGBColorSpace;
  ecologyAtlasTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const ecologyCutoutMaterial = new MeshBasicMaterial({
    map: ecologyAtlasTexture,
    transparent: true,
    opacity: 1,
    alphaTest: 0.075,
    alphaToCoverage: true,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const ecologyButterflyMaterial = new MeshBasicMaterial({
    map: ecologyAtlasTexture,
    transparent: true,
    opacity: 1,
    alphaTest: 0.065,
    alphaToCoverage: true,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const ecologyAtlasGeometries = [];

  const rootFrontAtlas = makeAtlasPlane(0, 1.78, 1.78, 5, 4, 0.06, 0.5, 0.48);
  const rootBackAtlas = makeAtlasPlane(8, 1.52, 1.52, 5, 4, 0.045, 0.5, 0.46);
  ecologyAtlasGeometries.push(rootFrontAtlas.geometry, rootBackAtlas.geometry);
  const plantRoot = new Mesh(rootFrontAtlas.geometry, ecologyCutoutMaterial);
  plantRoot.position.set(-0.02, -0.075, 0.66);
  plantRoot.renderOrder = 4;
  plantRoot.scale.setScalar(0.001);
  plant.add(plantRoot);
  const plantRootBack = new Mesh(rootBackAtlas.geometry, ecologyCutoutMaterial);
  plantRootBack.position.set(0.035, -0.015, 0.53);
  plantRootBack.rotation.set(0.03, -0.22, -0.06);
  plantRootBack.renderOrder = 4;
  plantRootBack.scale.setScalar(0.001);
  plant.add(plantRootBack);

  const stemAtlas = makeAtlasPlane(1, 2.35, 2.35, 2, 8, 0.035, 0.5, 0.04);
  plantAtlasGeometries.push(stemAtlas.geometry);
  const plantStem = new Mesh(stemAtlas.geometry, plantAtlasMaterial);
  plantStem.position.set(0, 0, 0.18);
  plantStem.renderOrder = 5;
  plantStem.visible = false;
  plant.add(plantStem);
  const plantStemPosition = stemAtlas.geometry.getAttribute("position");
  const plantStemUv = stemAtlas.geometry.getAttribute("uv");
  const plantStemBaseY = new Float32Array(plantStemPosition.count);
  const plantStemBaseV = new Float32Array(plantStemUv.count);
  const plantStemVRange = stemAtlas.vMax - stemAtlas.vMin;
  for (let index = 0; index < plantStemPosition.count; index += 1) {
    plantStemBaseY[index] = plantStemPosition.getY(index);
    plantStemBaseV[index] = (plantStemUv.getY(index) - stemAtlas.vMin) / plantStemVRange;
  }

  const budAtlas = makeAtlasPlane(2, 0.74, 0.74, 3, 3, 0.07, 0.52, 0.07);
  plantAtlasGeometries.push(budAtlas.geometry);
  const plantBud = new Mesh(budAtlas.geometry, plantAtlasMaterial);
  plantBud.position.set(0.015, 2.12, 0.2);
  plantBud.renderOrder = 6;
  plantBud.scale.setScalar(0.001);
  plantBud.visible = false;
  plant.add(plantBud);

  const leafSpecs = [
    { tile: 3, at: [-0.03, 0.50, 0.24], anchor: [0.70, 0.06], open: [0.10, -0.22, 0.06], size: 1.20, side: -1 },
    { tile: 4, at: [0.02, 0.82, 0.10], anchor: [0.32, 0.06], open: [-0.11, 0.23, -0.05], size: 1.22, side: 1 },
    { tile: 5, at: [-0.01, 1.16, 0.22], anchor: [0.92, 0.28], open: [-0.13, -0.20, 0.10], size: 1.15, side: -1 },
    { tile: 6, at: [0.02, 1.48, 0.08], anchor: [0.10, 0.48], open: [0.12, 0.21, -0.08], size: 1.08, side: 1 },
    { tile: 7, at: [0.02, 1.78, 0.20], anchor: [0.68, 0.08], open: [0.10, -0.18, 0.07], size: 0.98, side: -1 },
    { tile: 8, at: [0.04, 2.02, 0.11], anchor: [0.34, 0.07], open: [-0.09, 0.18, -0.05], size: 0.90, side: 1 },
  ];
  const plantLeaves = leafSpecs.map((spec, index) => {
    const atlas = makeAtlasPlane(
      spec.tile,
      1,
      1,
      4,
      3,
      0.075 + index * 0.004,
      spec.anchor[0],
      spec.anchor[1],
    );
    plantAtlasGeometries.push(atlas.geometry);
    const pivot = new Group();
    pivot.position.set(...spec.at);
    pivot.renderOrder = 3;
    pivot.visible = false;
    const leaf = new Mesh(atlas.geometry, plantAtlasMaterial);
    leaf.renderOrder = 6;
    leaf.scale.setScalar(0.001);
    pivot.add(leaf);
    plant.add(pivot);
    return { pivot, leaf, ...spec };
  });

  const ecologyBranchSpecs = [
    { tile: 1, at: [-0.03, 0.50, 0.19], anchor: [0.50, 0.08], open: [0.03, -0.18, -0.46], size: 0.84, start: 0.478 },
    { tile: 2, at: [0.02, 0.94, 0.14], anchor: [0.77, 0.08], open: [-0.03, 0.16, 0.22], size: 0.86, start: 0.658 },
    { tile: 3, at: [-0.01, 1.36, 0.20], anchor: [0.38, 0.08], open: [0.05, -0.12, -0.24], size: 0.74, start: 0.748 },
  ];
  const ecologyBranches = ecologyBranchSpecs.map((spec, index) => {
    const atlas = makeAtlasPlane(
      spec.tile,
      1,
      1,
      4,
      4,
      0.045 + index * 0.008,
      spec.anchor[0],
      spec.anchor[1],
    );
    ecologyAtlasGeometries.push(atlas.geometry);
    const pivot = new Group();
    pivot.position.set(...spec.at);
    pivot.renderOrder = 3;
    pivot.visible = false;
    const branch = new Mesh(atlas.geometry, ecologyCutoutMaterial);
    branch.renderOrder = 5;
    branch.scale.setScalar(0.001);
    pivot.add(branch);
    plant.add(pivot);
    return { pivot, branch, ...spec };
  });

  /* Butterflies live in globe space rather than plant space: their flight has
     real parallax, while two atlas half-wings hinge around a stable thorax. */
  const ecologyAir = new Group();
  ecologyAir.renderOrder = 3;
  globe.add(ecologyAir);
  const butterflyLeftWingGeometry = makeAtlasWing(4, -1);
  const butterflyRightWingGeometry = makeAtlasWing(4, 1);
  ecologyAtlasGeometries.push(butterflyLeftWingGeometry, butterflyRightWingGeometry);
  const butterflyBodyGeometry = new SphereGeometry(0.038, 8, 6);
  const butterflyBodyMaterial = new MeshBasicMaterial({
    color: 0x1d6334,
    depthTest: true,
    depthWrite: true,
  });
  const butterflySpecs = [
    {
      start: new Vector3(-1.10, -0.08, 0.55),
      control: new Vector3(-1.42, 0.82, 0.92),
      end: new Vector3(-0.46, 1.43, 0.74),
      travel: [0.580, 0.720], life: [0.555, 0.770], size: 0.78, phase: 0.4, frequency: 8.8,
    },
    {
      start: new Vector3(1.12, 0.12, 0.38),
      control: new Vector3(1.43, 1.25, 0.68),
      end: new Vector3(0.52, 2.00, 0.56),
      travel: [0.610, 0.755], life: [0.585, 0.790], size: 0.67, phase: 2.3, frequency: 9.6,
    },
    {
      start: new Vector3(-0.22, -0.28, 0.82),
      control: new Vector3(0.22, 1.28, 1.16),
      end: new Vector3(0.06, 2.52, 0.72),
      travel: [0.640, 0.790], life: [0.615, 0.810], size: 0.58, phase: 4.1, frequency: 8.2,
    },
  ];
  const butterflies = butterflySpecs.map((spec) => {
    const rig = new Group();
    rig.renderOrder = 3;
    rig.visible = false;
    const leftWing = new Mesh(butterflyLeftWingGeometry, ecologyButterflyMaterial);
    const rightWing = new Mesh(butterflyRightWingGeometry, ecologyButterflyMaterial);
    leftWing.renderOrder = 7;
    rightWing.renderOrder = 7;
    const body = new Mesh(butterflyBodyGeometry, butterflyBodyMaterial);
    body.position.z = 0.018;
    body.scale.set(0.52, 1.45, 0.46);
    body.renderOrder = 7;
    rig.add(leftWing, rightWing, body);
    ecologyAir.add(rig);
    return { rig, leftWing, rightWing, ...spec };
  });

  // Twelve deterministic shader fireflies remain a single draw call. Only two
  // uniforms change in render; all drift/flicker is evaluated on the GPU.
  const fireflyCount = 12;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflyPhases = new Float32Array(fireflyCount);
  const fireflySpeeds = new Float32Array(fireflyCount);
  const fireflyAmplitudes = new Float32Array(fireflyCount);
  const fireflySizes = new Float32Array(fireflyCount);
  const fireflyTints = new Float32Array(fireflyCount);
  for (let index = 0; index < fireflyCount; index += 1) {
    const angle = index * 2.399963;
    const radius = 0.42 + (index % 4) * 0.22;
    fireflyPositions[index * 3] = Math.cos(angle) * radius;
    fireflyPositions[index * 3 + 1] = -0.06 + ((index * 0.47) % 2.42);
    fireflyPositions[index * 3 + 2] = -0.34 + ((index * 0.37) % 1.18);
    fireflyPhases[index] = angle + (index % 3) * 0.61;
    fireflySpeeds[index] = 0.74 + (index % 5) * 0.11;
    fireflyAmplitudes[index] = 0.025 + (index % 4) * 0.014;
    fireflySizes[index] = 2.0 + (index % 4) * 0.62;
    fireflyTints[index] = index % 2;
  }
  const fireflyGeometry = new BufferGeometry();
  fireflyGeometry.setAttribute("position", new Float32BufferAttribute(fireflyPositions, 3));
  fireflyGeometry.setAttribute("aPhase", new Float32BufferAttribute(fireflyPhases, 1));
  fireflyGeometry.setAttribute("aSpeed", new Float32BufferAttribute(fireflySpeeds, 1));
  fireflyGeometry.setAttribute("aAmplitude", new Float32BufferAttribute(fireflyAmplitudes, 1));
  fireflyGeometry.setAttribute("aSize", new Float32BufferAttribute(fireflySizes, 1));
  fireflyGeometry.setAttribute("aTint", new Float32BufferAttribute(fireflyTints, 1));
  const fireflyMaterial = new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uLife: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aAmplitude;
      attribute float aSize;
      attribute float aTint;
      uniform float uTime;
      uniform float uLife;
      uniform float uPixelRatio;
      varying float vIntensity;
      varying float vTint;
      void main() {
        vec3 animated = position;
        animated.x += sin(uTime * (0.34 + aSpeed * 0.08) + aPhase) * aAmplitude;
        animated.y += sin(uTime * (0.47 + aSpeed * 0.07) + aPhase * 1.71) * aAmplitude * 0.72;
        animated.z += cos(uTime * (0.29 + aSpeed * 0.06) + aPhase * 0.83) * aAmplitude * 0.58;
        float flicker = 0.67
          + 0.20 * sin(uTime * (0.9 + aSpeed * 0.3) + aPhase)
          + 0.13 * sin(uTime * 0.41 + aPhase * 2.1);
        vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
        vIntensity = max(0.0, flicker) * uLife;
        vTint = aTint;
        gl_PointSize = clamp(aSize * uPixelRatio * flicker * uLife, 0.0, 7.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vIntensity;
      varying float vTint;
      void main() {
        float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
        float halo = smoothstep(0.5, 0.04, distanceFromCenter);
        float core = smoothstep(0.22, 0.0, distanceFromCenter);
        vec3 lime = vec3(0.79, 1.0, 0.46);
        vec3 mint = vec3(0.45, 1.0, 0.75);
        vec3 color = mix(lime, mint, vTint) * (0.78 + core * 0.62);
        gl_FragColor = vec4(color, (halo * 0.46 + core * 0.54) * vIntensity);
      }
    `,
  });
  const fireflies = new Points(fireflyGeometry, fireflyMaterial);
  fireflies.renderOrder = 8;
  fireflies.frustumCulled = false;
  fireflies.visible = false;
  ecologyAir.add(fireflies);

  // Six small nutrient cores bridge each supporting note into the exact stem
  // node that wakes its matching leaf. Geometry and materials never allocate
  // in render(); only transforms and opacity change.
  const feedOrbGeometry = new SphereGeometry(0.13, 8, 6);
  const feedTargets = leafSpecs.map((spec) => new Vector3(...spec.at));
  const feedRootLocal = new Vector3(0, -0.04, 0.62);
  const feedOrbs = feedTargets.map((target, index) => {
    const material = new MeshBasicMaterial({
      color: index % 2 ? 0xbaff85 : 0x66ff9b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const orb = new Mesh(feedOrbGeometry, material);
    orb.position.copy(target);
    orb.scale.setScalar(0.001);
    plant.add(orb);
    return { orb, material, target };
  });

  const handRig = new Group();
  handRig.renderOrder = 2;
  handRig.visible = false;
  scene.add(handRig);

  let handTextureReady = false;
  const handTexture = new TextureLoader().load("/assets/consult-hand-v2.png", () => {
    handTextureReady = true;
    handRig.visible = true;
  });
  handTexture.colorSpace = SRGBColorSpace;
  const handMaterial = new MeshBasicMaterial({
    map: handTexture,
    transparent: true,
    alphaTest: 0.015,
    depthWrite: false,
  });
  const handPlane = new Mesh(new PlaneGeometry(5.15, 7.72), handMaterial);
  handPlane.position.y = -0.15;
  handRig.add(handPlane);

  const billGeometry = new PlaneGeometry(1.82, 0.78, 5, 2);
  const billTexture = new TextureLoader().load(
    "https://images.unsplash.com/photo-1636115734305-aac2f83cd8d4?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  );
  billTexture.colorSpace = SRGBColorSpace;
  // Crop away the photographed gray surround and retain the banknote only.
  billTexture.repeat.set(0.965, 0.62);
  billTexture.offset.set(0.018, 0.19);
  const billMaterials = [];
  let focusBurnMaterial = null;
  const bills = Array.from({ length: 7 }, (_, index) => {
    // Keep the hero note on the proven basic material. Its burn is a separate
    // additive layer, so the Franklin note cannot disappear with the effect.
    const material = index === -1
      ? new ShaderMaterial({
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        uniforms: {
          uMap: { value: billTexture },
          uOpacity: { value: 0 },
          uBurn: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform float uOpacity;
          uniform float uBurn;
          uniform float uTime;
          varying vec2 vUv;

          float hash21(vec2 point) {
            return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float valueNoise(vec2 point) {
            vec2 cell = floor(point);
            vec2 fraction = fract(point);
            fraction = fraction * fraction * (3.0 - 2.0 * fraction);
            float a = hash21(cell);
            float b = hash21(cell + vec2(1.0, 0.0));
            float c = hash21(cell + vec2(0.0, 1.0));
            float d = hash21(cell + vec2(1.0, 1.0));
            return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
          }

          void main() {
            vec2 mapUv = vUv * vec2(0.965, 0.62) + vec2(0.018, 0.19);
            vec4 texel = texture2D(uMap, mapUv);
            float paperEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
            float grain = valueNoise(vUv * 18.0) * 0.060
              + valueNoise(vUv * 47.0 + 3.7) * 0.025;
            float burnField = paperEdge + grain;
            float threshold = uBurn * 0.45;
            float fireDistance = burnField - threshold;
            if (uBurn > 0.001 && fireDistance < 0.0) discard;

            float burnOn = smoothstep(0.001, 0.04, uBurn);
            float ember = (1.0 - smoothstep(0.0, 0.045, fireDistance)) * burnOn;
            float charBand = (1.0 - smoothstep(0.0, 0.105, fireDistance)) * burnOn;
            float flicker = 0.84 + 0.16 * sin(uTime * 11.0 + vUv.x * 31.0 + vUv.y * 23.0);
            vec3 charred = mix(vec3(0.018, 0.004, 0.001), vec3(0.34, 0.045, 0.003), ember);
            vec3 color = mix(texel.rgb, charred, charBand * 0.94);
            color += vec3(1.0, 0.16, 0.008) * pow(ember, 2.35) * 1.55 * flicker;
            gl_FragColor = vec4(color, texel.a * uOpacity);
          }
        `,
      })
      : new MeshBasicMaterial({
        map: billTexture,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        depthWrite: false,
      });
    if (index === 6) focusBurnMaterial = material;
    billMaterials.push(material);
    const bill = new Mesh(billGeometry, material);
    // The hero Franklin note must remain above the funded world throughout
    // its existing .70 → .855 focus move.
    bill.renderOrder = index === 6 ? 20 : 4;
    bill.userData = {
      angle: (index / 7) * Math.PI * 2 + 0.35,
      radius: 2.35 + (index % 3) * 0.36,
      deposit: index < 6,
    };
    scene.add(bill);
    return bill;
  });

  // A deterministic CPU alpha-mask keeps the original MeshBasicMaterial and
  // eats the paper from its perimeter inward. This is reversible, cheap at
  // 256x112, and cannot make the hero note vanish before the burn phase.
  const focusBurnMaskCanvas = document.createElement("canvas");
  focusBurnMaskCanvas.width = 256;
  focusBurnMaskCanvas.height = 112;
  const focusBurnMaskContext = focusBurnMaskCanvas.getContext("2d");
  const focusBurnMaskImage = focusBurnMaskContext.createImageData(
    focusBurnMaskCanvas.width,
    focusBurnMaskCanvas.height,
  );
  const focusBurnMaskTexture = new CanvasTexture(focusBurnMaskCanvas);
  focusBurnMaskTexture.generateMipmaps = false;
  let lastFocusBurnMask = -1;
  const updateFocusBurnMask = (amount) => {
    if (Math.abs(amount - lastFocusBurnMask) < 0.0025) return;
    lastFocusBurnMask = amount;
    const width = focusBurnMaskCanvas.width;
    const height = focusBurnMaskCanvas.height;
    const pixels = focusBurnMaskImage.data;
    const threshold = amount * 0.56;
    for (let y = 0; y < height; y += 1) {
      const v = (y + 0.5) / height;
      for (let x = 0; x < width; x += 1) {
        const u = (x + 0.5) / width;
        const edge = Math.min(u, 1 - u, v, 1 - v);
        const ripple = Math.sin(u * 49 + v * 23) * 0.045
          + Math.sin(v * 71 - u * 17) * 0.028
          + Math.sin((u + v) * 127 + 0.7) * 0.012;
        const field = edge + ripple;
        const feather = 0.014;
        const raw = amount < 0.001
          ? 1
          : clamp01((field - threshold + feather) / (feather * 2));
        const alpha = smooth(raw);
        const offset = (y * width + x) * 4;
        const channel = Math.round(alpha * 255);
        pixels[offset] = channel;
        pixels[offset + 1] = channel;
        pixels[offset + 2] = channel;
        pixels[offset + 3] = 255;
      }
    }
    focusBurnMaskContext.putImageData(focusBurnMaskImage, 0, 0);
    focusBurnMaskTexture.needsUpdate = true;
  };
  updateFocusBurnMask(0);
  focusBurnMaterial.alphaMap = focusBurnMaskTexture;
  focusBurnMaterial.alphaTest = 0.012;
  focusBurnMaterial.needsUpdate = true;

  const focusBurnOverlayMaterial = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: {
      uBurn: { value: 0 },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uBurn;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float paperEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float ripple = sin(vUv.x * 49.0 + vUv.y * 23.0) * 0.045
          + sin(vUv.y * 71.0 - vUv.x * 17.0) * 0.028
          + sin((vUv.x + vUv.y) * 127.0 + 0.7) * 0.012;
        float burnFront = uBurn * 0.56;
        float signedEdge = paperEdge + ripple - burnFront;
        float edgeDistance = abs(signedEdge);
        float emberHalo = 1.0 - smoothstep(0.010, 0.027, edgeDistance);
        float moltenEdge = 1.0 - smoothstep(0.002, 0.009, edgeDistance);
        float whiteCore = 1.0 - smoothstep(0.0, 0.0035, edgeDistance);
        // Flame licks are generated from the exact same signed burn field as
        // the alpha mask. They therefore stay attached to the moving paper
        // edge instead of floating over Franklin as separate sprites.
        float sideDistance = min(vUv.x, 1.0 - vUv.x);
        float capDistance = min(vUv.y, 1.0 - vUv.y);
        float useSideAxis = 1.0 - step(capDistance, sideDistance);
        float tangent = mix(vUv.x, vUv.y, useSideAxis);
        float primaryLick = 0.5 + 0.5 * sin(tangent * 92.0 - uTime * 5.4 + uBurn * 13.0);
        float secondaryLick = 0.5 + 0.5 * sin(tangent * 157.0 + uTime * 7.2 - uBurn * 9.0);
        float lickShape = max(pow(primaryLick, 4.0), pow(secondaryLick, 6.0) * 0.82);
        float burnedDistance = max(-signedEdge, 0.0);
        float burnedSide = 1.0 - smoothstep(-0.004, 0.002, signedEdge);
        float flameReach = mix(0.008, 0.040, lickShape);
        float flameBody = (1.0 - smoothstep(flameReach * 0.44, flameReach, burnedDistance))
          * burnedSide
          * smoothstep(0.46, 0.78, lickShape);
        float flameCore = (1.0 - smoothstep(0.0, flameReach * 0.36, burnedDistance))
          * flameBody;
        float burnOn = smoothstep(0.01, 0.08, uBurn)
          * (1.0 - smoothstep(0.92, 1.0, uBurn));
        float flicker = 0.90 + 0.10 * sin(uTime * 12.0 + vUv.x * 37.0 + vUv.y * 29.0);
        vec3 color = vec3(1.0, 0.11, 0.004) * emberHalo * 0.88;
        color += vec3(1.0, 0.30, 0.010) * moltenEdge * 1.24;
        color += vec3(1.0, 0.52, 0.045) * whiteCore * 1.32;
        color += vec3(1.0, 0.18, 0.004) * flameBody * 0.78;
        color += vec3(1.0, 0.42, 0.018) * flameCore * 0.96;
        float alpha = max(
          max(emberHalo * 0.52, max(moltenEdge * 0.88, whiteCore)),
          max(flameBody * 0.62, flameCore * 0.82)
        );
        gl_FragColor = vec4(color * flicker, alpha * burnOn * uOpacity);
      }
    `,
  });
  const focusBurnOverlay = new Mesh(billGeometry, focusBurnOverlayMaterial);
  focusBurnOverlay.position.z = 0.015;
  focusBurnOverlay.renderOrder = 21;
  focusBurnOverlay.frustumCulled = false;
  bills[6].add(focusBurnOverlay);
  billMaterials.push(focusBurnOverlayMaterial);

  const focusBurnEmberCount = 32;
  const focusBurnEmberGeometry = new BufferGeometry();
  const focusBurnEmberPositions = new Float32Array(focusBurnEmberCount * 3);
  const focusBurnEmberBase = [];
  const burnHash = (value) => Math.abs(Math.sin(value * 12.9898) * 43758.5453) % 1;
  for (let index = 0; index < focusBurnEmberCount; index += 1) {
    const angle = burnHash(index + 1.7) * Math.PI * 2;
    const edgeBias = 0.72 + burnHash(index + 17.2) * 0.28;
    const x = Math.cos(angle) * 0.88 * edgeBias;
    const y = Math.sin(angle) * 0.36 * edgeBias;
    const speed = 0.55 + burnHash(index + 31.4) * 0.95;
    focusBurnEmberBase.push({ x, y, angle, speed });
    focusBurnEmberPositions[index * 3] = x;
    focusBurnEmberPositions[index * 3 + 1] = y;
    focusBurnEmberPositions[index * 3 + 2] = 0.035;
  }
  focusBurnEmberGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(focusBurnEmberPositions, 3),
  );
  const focusBurnEmberMaterial = new PointsMaterial({
    color: 0xff8a12,
    transparent: true,
    opacity: 0,
    size: 0.014,
    sizeAttenuation: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const focusBurnEmbers = new Points(focusBurnEmberGeometry, focusBurnEmberMaterial);
  focusBurnEmbers.renderOrder = 22;
  focusBurnEmbers.frustumCulled = false;
  bills[6].add(focusBurnEmbers);

  // Once the perimeter ignites, the hero note hands off to independently
  // curling paper pieces. Each piece keeps the original Franklin crop, then
  // exposes a black char lip, a white-hot inner edge and a soft orange halo.
  const focusBurnFragmentSpecs = [
    {
      points: [[0.005, 0.82], [0.10, 0.75], [0.19, 0.91], [0.17, 0.995], [0.005, 0.995]],
      drift: [-0.52, 0.44, 0.26], rotation: [0.30, 0.50, 0.55], delay: 0.00,
    },
    {
      points: [[0.34, 0.94], [0.47, 0.88], [0.58, 0.96], [0.60, 0.995], [0.34, 0.995]],
      drift: [-0.08, 0.58, 0.30], rotation: [-0.42, -0.20, 0.24], delay: 0.04,
    },
    {
      points: [[0.82, 0.92], [0.90, 0.75], [0.995, 0.80], [0.995, 0.995], [0.86, 0.995]],
      drift: [0.62, 0.50, 0.34], rotation: [-0.32, -0.52, -0.64], delay: 0.08,
    },
    {
      points: [[0.92, 0.38], [0.995, 0.31], [0.995, 0.66], [0.91, 0.62], [0.86, 0.49]],
      drift: [0.75, 0.05, 0.38], rotation: [0.42, -0.48, 0.54], delay: 0.12,
    },
    {
      points: [[0.81, 0.04], [0.995, 0.005], [0.995, 0.26], [0.89, 0.29], [0.78, 0.18]],
      drift: [0.64, -0.44, 0.36], rotation: [0.52, -0.40, 0.66], delay: 0.16,
    },
    {
      points: [[0.39, 0.005], [0.63, 0.005], [0.60, 0.12], [0.48, 0.17], [0.36, 0.10]],
      drift: [0.06, -0.58, 0.30], rotation: [0.64, 0.16, -0.18], delay: 0.20,
    },
    {
      points: [[0.005, 0.005], [0.22, 0.03], [0.18, 0.21], [0.09, 0.28], [0.005, 0.20]],
      drift: [-0.65, -0.38, 0.40], rotation: [0.48, 0.42, -0.58], delay: 0.24,
    },
    {
      points: [[0.005, 0.34], [0.12, 0.30], [0.17, 0.48], [0.09, 0.65], [0.005, 0.62]],
      drift: [-0.72, 0.05, 0.35], rotation: [-0.26, 0.58, 0.72], delay: 0.28,
    },
  ];
  const focusBurnFragmentMaterials = [];
  const focusBurnFragments = focusBurnFragmentSpecs.map((spec, index) => {
    const { geometry, center } = makeBurnFragmentGeometry(spec.points);
    const group = new Group();
    group.position.copy(center);
    group.position.z = 0.024 + index * 0.001;
    group.visible = false;

    const outerGlowMaterial = new MeshBasicMaterial({
      color: 0xff3b05,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const hotRimMaterial = new MeshBasicMaterial({
      color: 0xffd633,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const charMaterial = new MeshBasicMaterial({
      color: 0x120704,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const paperMaterial = new MeshBasicMaterial({
      map: billTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    const outerGlow = new Mesh(geometry, outerGlowMaterial);
    outerGlow.scale.setScalar(1.12);
    outerGlow.position.z = -0.020;
    outerGlow.renderOrder = 23;
    const hotRim = new Mesh(geometry, hotRimMaterial);
    hotRim.scale.setScalar(1.065);
    hotRim.position.z = -0.012;
    hotRim.renderOrder = 24;
    const charLip = new Mesh(geometry, charMaterial);
    charLip.scale.setScalar(1.026);
    charLip.position.z = -0.004;
    charLip.renderOrder = 25;
    const paper = new Mesh(geometry, paperMaterial);
    paper.scale.setScalar(1);
    paper.position.z = 0.008;
    paper.renderOrder = 26;
    // Filled glow copies created the large translucent triangles seen in the
    // failed pass. Only the mapped paper shard renders; the real fire line is
    // the thin perimeter shader on the parent note.
    outerGlow.visible = false;
    hotRim.visible = false;
    charLip.visible = false;
    [outerGlow, hotRim, charLip, paper].forEach((mesh) => {
      mesh.frustumCulled = false;
      group.add(mesh);
    });
    bills[6].add(group);
    focusBurnFragmentMaterials.push(
      outerGlowMaterial,
      hotRimMaterial,
      charMaterial,
      paperMaterial,
    );
    return {
      ...spec,
      geometry,
      center,
      group,
      outerGlowMaterial,
      hotRimMaterial,
      charMaterial,
      paperMaterial,
    };
  });

  const focusBurnFlameGeometry = new PlaneGeometry(0.17, 0.34, 1, 3);
  focusBurnFlameGeometry.translate(0, 0.17, 0);
  const focusBurnFlameMaterial = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float vertical = clamp(vUv.y, 0.0, 1.0);
        float sway = sin(vertical * 10.0 - uTime * 8.5) * (0.08 + vertical * 0.14)
          + sin(vertical * 21.0 + uTime * 5.2) * 0.035;
        float width = mix(0.46, 0.035, pow(vertical, 0.72));
        float distanceToCore = abs((vUv.x - 0.5) + sway);
        float body = 1.0 - smoothstep(width * 0.68, width, distanceToCore);
        body *= smoothstep(0.0, 0.09, vertical) * (1.0 - smoothstep(0.88, 1.0, vertical));
        float inner = 1.0 - smoothstep(width * 0.22, width * 0.56, distanceToCore);
        vec3 orange = vec3(1.0, 0.10, 0.002);
        vec3 yellow = vec3(1.0, 0.78, 0.08);
        vec3 hot = vec3(1.0, 0.98, 0.66);
        vec3 color = mix(orange, yellow, vertical * 0.58 + inner * 0.42);
        color = mix(color, hot, inner * (1.0 - vertical) * 0.82);
        float flicker = 0.78 + 0.22 * sin(uTime * 14.0 + vertical * 37.0);
        gl_FragColor = vec4(color * (1.15 + inner), body * flicker * uOpacity);
      }
    `,
  });
  focusBurnFragments.forEach((fragment, index) => {
    const flameTongue = new Mesh(focusBurnFlameGeometry, focusBurnFlameMaterial);
    flameTongue.position.set(fragment.flame, 0.08 + (index % 3) * 0.035, 0.055);
    flameTongue.rotation.z = (index % 2 ? 0.28 : -0.20) + fragment.rotation[2] * 0.12;
    flameTongue.scale.set(0.75 + (index % 3) * 0.18, 0.72 + (index % 4) * 0.15, 1);
    flameTongue.renderOrder = 27;
    flameTongue.frustumCulled = false;
    flameTongue.visible = false;
    fragment.group.add(flameTongue);
    fragment.flameTongue = flameTongue;
  });

  const focusBurnBackdropMaterial = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;

      float hash21(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      float smokeNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 fraction = fract(point);
        fraction = fraction * fraction * (3.0 - 2.0 * fraction);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float d = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
      }

      void main() {
        vec2 flow = vUv * vec2(4.2, 2.8);
        float smoke = smokeNoise(flow + vec2(uTime * 0.045, -uTime * 0.028));
        smoke += smokeNoise(flow * 2.15 + vec2(-uTime * 0.034, uTime * 0.052)) * 0.48;
        smoke += smokeNoise(flow * 4.1 + 6.3) * 0.20;
        smoke /= 1.68;
        float vignette = smoothstep(0.78, 0.22, distance(vUv, vec2(0.5)));
        float grain = hash21(gl_FragCoord.xy + floor(uTime * 18.0)) - 0.5;
        vec3 soot = vec3(0.005, 0.018, 0.012);
        vec3 deepGreen = vec3(0.018, 0.095, 0.060);
        vec3 color = mix(soot, deepGreen, smoke * 0.78 + vignette * 0.12);
        color += grain * 0.026;
        gl_FragColor = vec4(color, uOpacity * (0.90 + smoke * 0.10));
      }
    `,
  });
  const focusBurnBackdrop = new Mesh(billGeometry, focusBurnBackdropMaterial);
  focusBurnBackdrop.position.z = -0.055;
  focusBurnBackdrop.scale.set(1.48, 2.35, 1);
  focusBurnBackdrop.renderOrder = 19;
  focusBurnBackdrop.frustumCulled = false;
  bills[6].add(focusBurnBackdrop);

  /* Six supporting notes now complete their funding journey as money-origami
     birds. Three shared instanced pieces give every bird real 3D wing hinges;
     one photographic instanced cutout supplies the clean perched silhouette.
     All motion remains a pure function of scroll progress, so reverse scroll
     reconstructs every fold, flap, landing and sprout without callbacks. */
  const moneyBirdCount = 6;
  const moneyBirdLeftGeometry = makeMoneyBirdWing(-1);
  const moneyBirdRightGeometry = makeMoneyBirdWing(1);
  const moneyBirdBodyGeometry = makeMoneyBirdBody();
  const moneyBirdFlightMaterial = new MeshBasicMaterial({
    map: billTexture,
    transparent: true,
    opacity: 1,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const moneyBirdLeftWings = new InstancedMesh(
    moneyBirdLeftGeometry,
    moneyBirdFlightMaterial,
    moneyBirdCount,
  );
  const moneyBirdRightWings = new InstancedMesh(
    moneyBirdRightGeometry,
    moneyBirdFlightMaterial,
    moneyBirdCount,
  );
  const moneyBirdBodies = new InstancedMesh(
    moneyBirdBodyGeometry,
    moneyBirdFlightMaterial,
    moneyBirdCount,
  );
  const moneyBirdFlightMeshes = [moneyBirdLeftWings, moneyBirdRightWings, moneyBirdBodies];
  moneyBirdFlightMeshes.forEach((mesh) => {
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    scene.add(mesh);
  });

  let moneyBirdTextureReady = false;
  const moneyBirdTexture = new TextureLoader().load(
    "/assets/consult-paper-bird-v1.png",
    () => { moneyBirdTextureReady = true; },
  );
  moneyBirdTexture.colorSpace = SRGBColorSpace;
  moneyBirdTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const moneyBirdPerchGeometry = new PlaneGeometry(1.25, 1, 4, 3);
  const moneyBirdPerchPositions = moneyBirdPerchGeometry.getAttribute("position");
  const moneyBirdPerchUvs = moneyBirdPerchGeometry.getAttribute("uv");
  for (let index = 0; index < moneyBirdPerchPositions.count; index += 1) {
    const u = moneyBirdPerchUvs.getX(index);
    const v = moneyBirdPerchUvs.getY(index);
    moneyBirdPerchPositions.setZ(
      index,
      Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.045,
    );
  }
  moneyBirdPerchPositions.needsUpdate = true;
  moneyBirdPerchGeometry.computeVertexNormals();
  moneyBirdPerchGeometry.computeBoundingSphere();
  const moneyBirdPerchMaterial = new MeshBasicMaterial({
    map: moneyBirdTexture,
    transparent: true,
    opacity: 1,
    alphaTest: 0.055,
    alphaToCoverage: true,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const perchedMoneyBirds = new InstancedMesh(
    moneyBirdPerchGeometry,
    moneyBirdPerchMaterial,
    moneyBirdCount,
  );
  perchedMoneyBirds.renderOrder = 5;
  perchedMoneyBirds.frustumCulled = false;
  perchedMoneyBirds.visible = false;
  scene.add(perchedMoneyBirds);

  /* ── BLACK REDESIGN (Yash, 14 Aug 2026): the ambient money story retires ──
     His call, MCQ'd: on the black ground only the glowing globe and hand
     remain — the six orbiting notes, their fold-into-bird flights, the perched
     birds, and the nutrient orbs they fed into the stem all go.

     DETACHED from the scene graph rather than hidden: render() rewrites
     .visible on every one of these each frame, and the warm-up traversal flips
     hidden objects visible while it compiles shaders, so a visibility flag
     survives neither. A detached node keeps updating its matrices harmlessly
     and renders nothing; restoring the story is scene.add() again.

     ⚠️ bills[6] — the hero note that flies in and BURNS into the finale — is
     deliberately NOT detached. Only the six with userData.deposit go. */
  bills.forEach((bill) => { if (bill.userData.deposit) scene.remove(bill); });
  moneyBirdFlightMeshes.forEach((mesh) => scene.remove(mesh));
  scene.remove(perchedMoneyBirds);
  feedOrbs.forEach((feed) => plant.remove(feed.orb));

  const moneyBirdRig = new Object3D();
  const moneyBirdLeftPose = new Object3D();
  const moneyBirdRightPose = new Object3D();
  const moneyBirdBodyPose = new Object3D();
  moneyBirdRig.add(moneyBirdLeftPose, moneyBirdRightPose, moneyBirdBodyPose);
  const perchedMoneyBirdPose = new Object3D();
  const moneyBirdLandingLocal = [
    new Vector3(-0.36, -0.04, 0.64),
    new Vector3(0.32, -0.01, 0.58),
    new Vector3(-0.18, 0.10, 0.75),
    new Vector3(0.18, 0.13, 0.69),
    new Vector3(-0.07, 0.23, 0.81),
    new Vector3(0.07, 0.27, 0.76),
  ];
  const moneyBirdLandingWorld = moneyBirdLandingLocal.map(() => new Vector3());
  const moneyBirdSproutWorld = moneyBirdLandingLocal.map(() => new Vector3());
  const hiddenMoneyBirdPose = new Object3D();
  hiddenMoneyBirdPose.scale.setScalar(0);
  hiddenMoneyBirdPose.updateMatrix();
  for (let index = 0; index < moneyBirdCount; index += 1) {
    moneyBirdLeftWings.setMatrixAt(index, hiddenMoneyBirdPose.matrix);
    moneyBirdRightWings.setMatrixAt(index, hiddenMoneyBirdPose.matrix);
    moneyBirdBodies.setMatrixAt(index, hiddenMoneyBirdPose.matrix);
    perchedMoneyBirds.setMatrixAt(index, hiddenMoneyBirdPose.matrix);
  }
  moneyBirdFlightMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  perchedMoneyBirds.instanceMatrix.needsUpdate = true;

  let progress = 0;
  let visibility = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;

  const onPointer = (event) => {
    pointerTargetX = (event.clientX / innerWidth) * 2 - 1;
    pointerTargetY = (event.clientY / innerHeight) * 2 - 1;
  };
  addEventListener("pointermove", onPointer, { passive: true });

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(handPixelRatio());
    fireflyMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setProgress(value, opacity = 1) {
    progress = clamp01(value);
    visibility = clamp01(opacity);
  }

  /* The hand belongs to the last act, but its drawing buffer was resident from
     the first frame of the site — 1.3 Mpx at DPR 1, four times that on a
     retina laptop, held through every act before it. Rendering already stops
     below; this releases the surface too, and resize() rebuilds it the frame
     the hand is wanted. */
  let bufferReleased = false;

  function render(time = 0) {
    if (visibility < 0.002) {
      canvas.style.opacity = "0";
      if (!bufferReleased) { bufferReleased = true; canvas.width = 1; canvas.height = 1; }
      return;
    }
    if (bufferReleased) { bufferReleased = false; resize(); }
    pointerX += (pointerTargetX - pointerX) * 0.04;
    pointerY += (pointerTargetY - pointerY) * 0.04;

    const enter = smooth((progress - 0.17) / 0.15);
    // WE SCALE opens inside the real 3D globe. The hand follows later as
    // this same globe dollies out and settles above the palm.
    const globeReveal = smooth(progress / 0.045);
    const exit = smooth((progress - 0.978) / 0.022);
    const dollarFocus = smooth((progress - 0.87) / 0.045);
    /* Burn AFTER arrival (Yash, 6 Aug 17:04): the note finishes its zoom at
       .94 (dollarFocus) — burning from .915 meant it arrived pre-torn (the
       old gate used to hide this window). */
    const dollarBurn = smooth((progress - 0.935) / 0.055);
    const dollarMorph = smooth((progress - 0.978) / 0.02);
    // One continuous Earth shot: the camera crosses its green shell first,
    // travels through the wireframe interior, then dollies out to reveal the
    // same globe settling above the palm.
    const globeIn = smooth(progress / 0.30);
    const globeOut = smooth((progress - 0.94) / 0.045);
    // As the hero Franklin note becomes the frame, retire the entire funded
    // world together—hand, globe, plant, butterflies, fireflies and fume.
    // Six notes fund the plant one-by-one through .86. Only after that full
    // story does the untouched Franklin focus note retire the world.
    /* Quick clean exit finishing at .905 — the instant before the growing
       note's face reaches the hand's screen region. Holding any later parks
       a half-faded hand ON the note (depth can't save a fading sprite). */
    const fundedWorldFade = 1 - smooth((progress - 0.885) / 0.02);
    globe.visible = fundedWorldFade > 0.002;
    handRig.visible = handTextureReady && fundedWorldFade > 0.002;
    focusBurnBackdropMaterial.uniforms.uTime.value = time;
    focusBurnBackdropMaterial.uniforms.uOpacity.value = 0;
    focusBurnBackdrop.visible = false;

    const wide = camera.aspect > 1.15;
    /* ── BLACK REDESIGN (Yash, 14 Aug 2026): globe + hand live on the LEFT ──
       Mirrored X only — Y, Z, camera and every beat timing untouched. The
       title moved to top-centre (CSS), so the left half is theirs now. The
       plant is a child of the globe and the money-bird orbit follows
       globe.position, so nothing else needs retargeting. */
    const handAnchorX = wide ? -2.0 : -0.35;
    const handAnchorY = wide ? -2.05 : -1.72;
    const globeAnchorX = wide ? -2.25 : -0.72;
    /* Narrow screens: the title now lives at the top (CSS), and at Y 1.58 the
       globe sat straight under it — measured overlap on a 583px pane. 0.95
       drops the globe into the mid-frame; the wide anchor is untouched. */
    const globeAnchorY = wide ? 1.82 : 0.95;
    const globeAnchorZ = wide ? 0.52 : 0.42;
    globe.position.x = MathUtils.lerp(0, globeAnchorX, globeIn);
    globe.position.y = MathUtils.lerp(0, globeAnchorY, globeIn);
    globe.position.z = MathUtils.lerp(10.7, globeAnchorZ, globeIn);
    globe.rotation.x = -0.16;
    // Keep the broken quarter readable from camera while retaining a slow
    // breathing rotation rather than letting the opening spin to the back.
    globe.rotation.y = -0.72 + Math.sin(time * 0.22) * 0.1 + progress * 0.45 + pointerX * 0.035;
    globe.rotation.z = 0.08 + Math.sin(time * 0.18) * 0.025;
    // Retain 30% of the globe spin so the plant feels physically rooted, but
    // counter-rotate enough to keep the unfolding leaves readable.
    plant.rotation.y = 0.3 - globe.rotation.y * 0.7;
    plant.rotation.z = Math.sin(time * 0.41 + 0.8) * 0.008;
    const finalGlobeScale = wide ? 0.42 : 0.36;
    const openingGlobeScale = wide ? 1.72 : 1.48;
    const globeScale = MathUtils.lerp(openingGlobeScale, finalGlobeScale, globeIn) * MathUtils.lerp(1, 0.9, globeOut);
    globe.scale.setScalar(globeScale);
    globeGridMaterial.opacity = 0.34 * globeReveal * fundedWorldFade;
    globeInteriorGridMaterial.opacity = 0.2 * globeReveal * (1 - globeIn) * fundedWorldFade;
    globeAccentMaterial.opacity = 0.16 * globeReveal * fundedWorldFade;
    continentMaterial.opacity = 0.82 * globeReveal * fundedWorldFade;
    orbitMaterial.opacity = 0.3 * globeReveal * fundedWorldFade;
    const fumeReveal = smooth((progress - 0.28) / 0.18);
    globeFumeMaterial.uniforms.uTime.value = time;
    globeFumeMaterial.uniforms.uOpacity.value = 0.22
      * fumeReveal
      * fundedWorldFade
      * visibility;

    let fundingConversion = 0;
    for (let index = 0; index < leafSpecs.length; index += 1) {
      fundingConversion += smooth((progress - (0.388 + index * 0.09)) / 0.022);
    }
    fundingConversion /= leafSpecs.length;
    const coreFoundation = smooth((progress - 0.41) / 0.15);
    const coreReveal = coreFoundation * MathUtils.lerp(0.16, 1, fundingConversion);
    const wireQuiet = MathUtils.lerp(1, 0.74, coreReveal);
    globeGridMaterial.opacity *= wireQuiet;
    globeAccentMaterial.opacity *= MathUtils.lerp(1, 0.68, coreReveal);
    continentMaterial.opacity *= MathUtils.lerp(1, 0.8, coreReveal);
    // All notes establish the orbit first. Supporting notes then fund the
    // plant one-by-one while every untouched note keeps circling the globe.
    plant.visible = plantAtlasReady && progress > 0.383 && fundedWorldFade > 0.002;
    // The root atlas bottom lands at roughly -3.20, just inside the 3.24-radius
    // wire globe, so the plant grows straight from its inner bottom surface.
    plant.position.y = -2.40;
    plant.scale.setScalar(plantBaseScale);
    plantAtlasMaterial.opacity = fundedWorldFade;
    const rootFrontGrow = smooth((progress - 0.388) / 0.065);
    const rootBackGrow = smooth((progress - 0.40) / 0.075);
    const rootFrontLife = rootFrontGrow * fundedWorldFade;
    const rootBackLife = rootBackGrow * fundedWorldFade;
    plantRoot.visible = ecologyAtlasReady && rootFrontLife > 0.002;
    plantRoot.scale.set(
      Math.max(0.001, rootFrontLife * (1 + Math.sin(rootFrontGrow * Math.PI) * 0.025)),
      Math.max(0.001, rootFrontLife * 0.88),
      Math.max(0.001, rootFrontLife),
    );
    plantRootBack.visible = ecologyAtlasReady && rootBackLife > 0.002;
    plantRootBack.scale.set(
      Math.max(0.001, rootBackLife * 0.94),
      Math.max(0.001, rootBackLife * 0.82),
      Math.max(0.001, rootBackLife),
    );

    const stemGrow = smooth((progress - 0.41) / 0.15);
    plantStem.visible = stemGrow > 0.002;
    for (let index = 0; index < plantStemPosition.count; index += 1) {
      plantStemPosition.setY(index, plantStemBaseY[index] * stemGrow);
      plantStemUv.setY(
        index,
        stemAtlas.vMin + plantStemBaseV[index] * plantStemVRange * stemGrow,
      );
    }
    plantStemPosition.needsUpdate = true;
    plantStemUv.needsUpdate = true;

    ecologyBranches.forEach((entry, index) => {
      const branchGrow = smooth((progress - entry.start) / 0.095);
      const branchLife = branchGrow * fundedWorldFade;
      const branchSettle = branchLife * (1 + Math.sin(branchGrow * Math.PI) * 0.025);
      entry.pivot.visible = ecologyAtlasReady && branchLife > 0.002;
      entry.pivot.rotation.set(
        MathUtils.lerp(-0.12, entry.open[0], branchGrow)
          + Math.sin(time * 0.35 + index) * 0.003 * branchGrow * fundedWorldFade,
        MathUtils.lerp(index % 2 ? 0.42 : -0.42, entry.open[1], branchGrow),
        MathUtils.lerp(entry.open[2] * 0.28, entry.open[2], branchGrow)
          + Math.sin(time * 0.4 + index * 0.8) * 0.004 * branchGrow * fundedWorldFade,
      );
      entry.branch.scale.set(
        Math.max(0.001, entry.size * MathUtils.lerp(0.16, 1, branchGrow) * fundedWorldFade),
        Math.max(0.001, entry.size * branchSettle),
        Math.max(0.001, fundedWorldFade),
      );
    });

    const budGrow = smooth((progress - 0.838) / 0.022);
    plantBud.visible = budGrow > 0.002;
    plantBud.scale.setScalar(Math.max(0.001, budGrow));
    plantBud.rotation.y = Math.sin(time * 0.46) * 0.012 * budGrow;
    plantLeaves.forEach((entry, index) => {
      const convert = smooth((progress - (0.388 + index * 0.09)) / 0.022);
      entry.pivot.visible = convert > 0.002;
      const unfurl = convert * (1 + Math.sin(convert * Math.PI) * 0.028);
      entry.pivot.rotation.set(
        MathUtils.lerp(-0.28, entry.open[0], convert)
          + Math.sin(time * 0.55 + index) * 0.006 * convert,
        MathUtils.lerp(entry.side * 1.18, entry.open[1], convert)
          + Math.sin(time * 0.48 + index * 0.7) * 0.008 * convert,
        MathUtils.lerp(entry.side * -0.12, entry.open[2], convert)
          + Math.sin(time * 0.62 + index) * 0.01 * convert,
      );
      entry.leaf.scale.setScalar(Math.max(0.001, entry.size * unfurl));

      const pulse = Math.sin(convert * Math.PI);
      const feed = feedOrbs[index];
      feed.orb.visible = pulse > 0.002;
      feed.orb.position.set(
        MathUtils.lerp(feedRootLocal.x, feed.target.x, convert)
          + Math.sin(time * 1.3 + index) * 0.025 * pulse,
        MathUtils.lerp(feedRootLocal.y, feed.target.y + 0.12, convert),
        MathUtils.lerp(feedRootLocal.z, feed.target.z, convert)
          + Math.cos(time * 1.1 + index) * 0.02 * pulse,
      );
      feed.orb.scale.setScalar(Math.max(0.001, (0.55 + pulse * 0.9) * pulse));
      feed.material.opacity = 0.92 * pulse * fundedWorldFade;
    });

    ecologyAir.visible = ecologyAtlasReady;
    butterflies.forEach((entry, index) => {
      const travel = smooth(
        (progress - entry.travel[0]) / (entry.travel[1] - entry.travel[0]),
      );
      const lifeIn = smooth((progress - entry.life[0]) / 0.05);
      const lifeOut = 1 - smooth((progress - entry.life[1]) / 0.055);
      const life = lifeIn * lifeOut * fundedWorldFade;
      const inverse = 1 - travel;
      const hoverX = Math.sin(time * (0.46 + index * 0.025) + entry.phase) * 0.025 * life;
      const hoverY = Math.sin(time * (0.62 + index * 0.021) + entry.phase * 1.7) * 0.035 * life;
      const hoverZ = Math.cos(time * (0.39 + index * 0.017) + entry.phase) * 0.018 * life;
      entry.rig.position.set(
        inverse * inverse * entry.start.x
          + 2 * inverse * travel * entry.control.x
          + travel * travel * entry.end.x
          + hoverX,
        inverse * inverse * entry.start.y
          + 2 * inverse * travel * entry.control.y
          + travel * travel * entry.end.y
          + hoverY,
        inverse * inverse * entry.start.z
          + 2 * inverse * travel * entry.control.z
          + travel * travel * entry.end.z
          + hoverZ,
      );
      const tangentX = 2 * inverse * (entry.control.x - entry.start.x)
        + 2 * travel * (entry.end.x - entry.control.x);
      const tangentY = 2 * inverse * (entry.control.y - entry.start.y)
        + 2 * travel * (entry.end.y - entry.control.y);
      entry.rig.rotation.set(
        0.08 + Math.sin(time * 0.52 + entry.phase) * 0.045 * life,
        Math.sin(time * 0.44 + entry.phase) * 0.08 * life,
        -Math.atan2(tangentX, tangentY)
          + Math.sin(time * 0.75 + entry.phase) * 0.035 * life,
      );
      const flap = 0.5 + 0.5 * Math.sin(time * entry.frequency + entry.phase);
      const wingFold = 0.16 + flap * 0.82;
      entry.leftWing.rotation.y = -wingFold;
      entry.rightWing.rotation.y = wingFold;
      entry.rig.visible = ecologyAtlasReady && life > 0.002;
      entry.rig.scale.setScalar(Math.max(0.001, entry.size * life));
    });

    const fireflyLife = smooth((progress - 0.50) / 0.085)
      * (1 - smooth((progress - 0.79) / 0.07))
      * fundedWorldFade;
    fireflyMaterial.uniforms.uTime.value = time;
    fireflyMaterial.uniforms.uLife.value = fireflyLife;
    fireflies.visible = ecologyAtlasReady && fireflyLife > 0.002;

    // Every supporting note enters through the same visible root mound. Its
    // nutrient core then travels upward to the matching atlas leaf.
    globe.updateMatrixWorld(true);
    for (let index = 0; index < moneyBirdCount; index += 1) {
      moneyBirdLandingWorld[index]
        .copy(moneyBirdLandingLocal[index])
        .applyMatrix4(plant.matrixWorld);
      moneyBirdSproutWorld[index]
        .copy(feedTargets[index])
        .applyMatrix4(plant.matrixWorld);
    }

    handRig.position.set(handAnchorX, handAnchorY, 0.24);
    handRig.rotation.set(0.015, 0, -0.055);
    handRig.scale.setScalar((wide ? 0.73 : 0.57) * MathUtils.lerp(0.96, 1, enter));
    handMaterial.opacity = enter * fundedWorldFade;

    bills.forEach((bill, index) => {
      const data = bill.userData;
      const isFocusDollar = index === bills.length - 1;
      const cycleStart = 0.32 + index * 0.09;
      const billIn = smooth((progress - (0.17 + index * 0.012)) / 0.05);
      const idleOrbit = Math.sin(time * (0.31 + index * 0.015) + index) * 0.08;
      const ambientOrbit = time * (0.18 + (index % 3) * 0.012);
      const angle = data.angle
        + idleOrbit
        + ambientOrbit
        + progress * 2.2;
      const orbitX = globe.position.x + Math.cos(angle) * data.radius;
      const orbitY = globe.position.y + Math.sin(angle) * data.radius * 0.68;
      const orbitZ = 0.7 + Math.sin(angle * 1.55) * 1.05;
      const birdFold = data.deposit
        ? smooth((progress - cycleStart) / 0.024)
        : 0;
      const deposit = data.deposit
        ? smooth((progress - (cycleStart + 0.018)) / 0.037)
        : 0;
      const birdLand = data.deposit
        ? smooth((progress - (cycleStart + 0.055)) / 0.013)
        : 0;
      const convert = data.deposit
        ? smooth((progress - (cycleStart + 0.068)) / 0.022)
        : 0;
      const supportingFade = isFocusDollar ? 1 : fundedWorldFade;
      const feedTarget = data.deposit ? moneyBirdLandingWorld[index] : globe.position;
      const baseX = MathUtils.lerp(orbitX, feedTarget.x, deposit);
      const baseY = MathUtils.lerp(orbitY, feedTarget.y, deposit);
      const baseZ = MathUtils.lerp(orbitZ, feedTarget.z, deposit);

      if (data.deposit) {
        const flightArc = Math.sin(deposit * Math.PI) * (1 - birdLand);
        const flightOut = 1 - smooth(birdLand / 0.72);
        const flightLife = birdFold * flightOut * fundedWorldFade * (1 - exit);
        const birdX = baseX + Math.sin(index * 1.73 + 0.4) * 0.14 * flightArc;
        const birdY = baseY + flightArc * (0.48 + (index % 3) * 0.07);
        const birdZ = baseZ + Math.cos(index * 1.31) * 0.18 * flightArc;
        const heading = Math.atan2(feedTarget.y - orbitY, feedTarget.x - orbitX);
        const flap = 0.5 + 0.5 * Math.sin(time * (9.2 + index * 0.28) + index * 1.41);
        const wingFold = (0.20 + flap * 0.92) * (1 - birdLand * 0.88);
        moneyBirdRig.position.set(birdX, birdY, birdZ);
        moneyBirdRig.rotation.set(
          0.08 + Math.sin(time * 0.72 + index) * 0.045 * flightLife,
          -0.08 + Math.cos(time * 0.58 + index * 0.9) * 0.07 * flightLife,
          heading + Math.sin(deposit * Math.PI) * (index % 2 ? -0.12 : 0.12),
        );
        const flightScale = MathUtils.lerp(0.24, 0.48, birdFold) * flightLife;
        moneyBirdRig.scale.setScalar(flightScale);
        moneyBirdLeftPose.rotation.set(-wingFold, 0.08, -0.035);
        moneyBirdRightPose.rotation.set(wingFold, -0.08, 0.035);
        moneyBirdBodyPose.rotation.x = Math.sin(time * 0.86 + index) * 0.025 * flightLife;
        moneyBirdRig.updateMatrixWorld(true);
        moneyBirdLeftWings.setMatrixAt(index, moneyBirdLeftPose.matrixWorld);
        moneyBirdRightWings.setMatrixAt(index, moneyBirdRightPose.matrixWorld);
        moneyBirdBodies.setMatrixAt(index, moneyBirdBodyPose.matrixWorld);

        const perchReveal = smooth((birdLand - 0.70) / 0.30);
        const perchLife = perchReveal * (1 - convert) * fundedWorldFade * (1 - exit);
        const perchTravel = convert * 0.18;
        perchedMoneyBirdPose.position.set(
          MathUtils.lerp(feedTarget.x, moneyBirdSproutWorld[index].x, perchTravel),
          MathUtils.lerp(feedTarget.y, moneyBirdSproutWorld[index].y, perchTravel)
            + Math.sin(time * 1.55 + index * 0.8) * 0.012 * perchLife,
          MathUtils.lerp(feedTarget.z, moneyBirdSproutWorld[index].z, perchTravel),
        );
        perchedMoneyBirdPose.rotation.set(
          0.02,
          -0.10 + (index % 3) * 0.045,
          -0.11 + (index - 2.5) * 0.035,
        );
        const perchScale = 0.42 * perchLife * (1 + Math.sin(birdLand * Math.PI) * 0.08);
        perchedMoneyBirdPose.scale.setScalar(perchScale);
        perchedMoneyBirdPose.updateMatrix();
        perchedMoneyBirds.setMatrixAt(index, perchedMoneyBirdPose.matrix);
      }

      // Deposit notes enter through the open quarter and collapse toward the
      // core. Remaining notes keep a slow, lightweight orbital float.
      bill.position.set(
        MathUtils.lerp(baseX, 0, isFocusDollar ? dollarFocus : 0),
        MathUtils.lerp(baseY, 0, isFocusDollar ? dollarFocus : 0),
        MathUtils.lerp(baseZ, 11.15, isFocusDollar ? dollarFocus : 0),
      );
      const baseRotationX = Math.sin(angle * 1.7) * 0.32 + deposit * 0.18;
      const baseRotationY = Math.cos(angle) * 0.48 + deposit * 1.1;
      const baseRotationZ = -angle * 0.16
        + Math.sin(time * 1.35 + index) * 0.08 * (1 - deposit);
      const foldedX = MathUtils.lerp(baseRotationX, 0.08, birdFold);
      const foldedY = MathUtils.lerp(baseRotationY, Math.PI * 0.5, birdFold);
      const foldedZ = MathUtils.lerp(baseRotationZ, 0, birdFold);
      bill.rotation.x = MathUtils.lerp(foldedX, 0, isFocusDollar ? dollarFocus : 0);
      bill.rotation.y = MathUtils.lerp(foldedY, 0, isFocusDollar ? dollarFocus : 0);
      bill.rotation.z = MathUtils.lerp(foldedZ, 0, isFocusDollar ? dollarFocus : 0);
      const billScale = MathUtils.lerp(0.12, 0.64, billIn)
        * MathUtils.lerp(1, 0.78, deposit)
        * (1 - exit * 0.9);
      if (isFocusDollar) {
        bill.scale.setScalar(MathUtils.lerp(billScale, 1.72, dollarFocus));
      } else {
        bill.scale.set(
          billScale * MathUtils.lerp(1, 0.32, birdFold),
          billScale * MathUtils.lerp(1, 0.12, birdFold),
          billScale,
        );
      }
      /* BLACK REDESIGN: with the six ambient notes retired, the hero note
         orbiting from ~24% of the act read as one leftover floater on the
         black (seen on the first screenshot). It now stays unborn until just
         before its focus flight (.87): fading in .85→.88, it reads as the
         note LEAVING the glowing system on its way to the burn, not as
         furniture that was always there. Position/rotation are untouched —
         the orbit maths still runs, only opacity gates the entrance. */
      const heroArrival = isFocusDollar
        ? smooth((progress - 0.85) / 0.03)
        : 1;
      const billOpacity = billIn
        * (1 - birdFold)
        * (1 - exit)
        * supportingFade
        * heroArrival
        * (isFocusDollar ? 1 - dollarMorph : 1);
      if (isFocusDollar) {
        /* While focused, the note is the nearest thing in the shot — but the
           hand/globe wrote depth earlier and won where they overlap. The old
           timing never overlapped them; the new world-exit does. */
        bill.material.depthTest = dollarFocus <= 0.03;
        const curl = smooth((dollarBurn - 0.035) / 0.24)
          * (1 - smooth((dollarBurn - 0.46) / 0.28));
        bill.rotation.x += curl * 0.12;
        bill.rotation.y += Math.sin(dollarBurn * Math.PI) * 0.075;
        bill.rotation.z += Math.sin(dollarBurn * Math.PI * 1.2) * 0.022;
        bill.scale.y *= 1 - curl * 0.055;
        const scorch = smooth((dollarBurn - 0.38) / 0.62);
        bill.material.color.setRGB(
          MathUtils.lerp(1, 0.30, scorch),
          MathUtils.lerp(1, 0.13, scorch),
          MathUtils.lerp(1, 0.055, scorch),
        );
        // The mask itself removes the paper. Never crossfade the whole note:
        // the surviving centre must remain solid while its perimeter burns.
        bill.material.opacity = billOpacity;
        updateFocusBurnMask(dollarBurn);
        focusBurnOverlayMaterial.uniforms.uBurn.value = dollarBurn;
        focusBurnOverlayMaterial.uniforms.uOpacity.value = billOpacity
          * (1 - smooth((dollarBurn - 0.78) / 0.22));
        focusBurnOverlayMaterial.uniforms.uTime.value = time;
        const fragmentReveal = smooth((dollarBurn - 0.38) / 0.12);
        focusBurnFlameMaterial.uniforms.uTime.value = time;
        focusBurnFlameMaterial.uniforms.uOpacity.value = 0;
        focusBurnFragments.forEach((fragment, fragmentIndex) => {
          const stagger = fragment.delay;
          const ignite = smooth((dollarBurn - (0.36 + stagger * 0.18)) / 0.16);
          const breakAway = smooth((dollarBurn - (0.42 + stagger * 0.22)) / 0.42);
          const ash = smooth((dollarBurn - (0.78 + stagger * 0.12)) / 0.22);
          const driftPower = breakAway * breakAway * 0.58;
          const flutter = Math.sin(time * (2.2 + fragmentIndex * 0.12) + fragmentIndex * 1.71)
            * 0.035
            * breakAway
            * (1 - ash);
          fragment.group.visible = fragmentReveal > 0.02 && ignite > 0.02 && ash < 0.985;
          fragment.group.position.set(
            fragment.center.x + fragment.drift[0] * driftPower + flutter,
            fragment.center.y + fragment.drift[1] * driftPower
              + Math.sin(time * 1.7 + fragmentIndex) * 0.018 * breakAway,
            0.024 + fragmentIndex * 0.001 + fragment.drift[2] * driftPower,
          );
          fragment.group.rotation.set(
            fragment.rotation[0] * breakAway,
            fragment.rotation[1] * breakAway,
            fragment.rotation[2] * breakAway + flutter * 1.8,
          );
          const fragmentScale = MathUtils.lerp(0.58, 0.94, ignite)
            * MathUtils.lerp(1, 0.66 + (fragmentIndex % 3) * 0.035, breakAway)
            * MathUtils.lerp(1, 0.66, ash);
          fragment.group.scale.set(
            fragmentScale,
            fragmentScale * MathUtils.lerp(1, 0.78, breakAway),
            fragmentScale,
          );

          const localScorch = smooth((ignite - 0.24) / 0.76);
          fragment.paperMaterial.color.setRGB(
            MathUtils.lerp(1, 0.21, localScorch),
            MathUtils.lerp(1, 0.075, localScorch),
            MathUtils.lerp(1, 0.025, localScorch),
          );
          fragment.paperMaterial.opacity = billOpacity
            * (1 - smooth((ash - 0.82) / 0.18));
          fragment.charMaterial.opacity = 0;
          fragment.outerGlowMaterial.opacity = 0;
          fragment.hotRimMaterial.opacity = 0;
          fragment.flameTongue.visible = false;
        });
        const emberLife = Math.sin(dollarBurn * Math.PI);
        focusBurnEmbers.visible = emberLife > 0.002;
        focusBurnEmberMaterial.opacity = emberLife * billOpacity * 0.58;
        const emberPosition = focusBurnEmberGeometry.getAttribute("position");
        focusBurnEmberBase.forEach((ember, emberIndex) => {
          const travel = dollarBurn * (0.16 + ember.speed * 0.22);
          const flutter = Math.sin(time * (3.8 + ember.speed) + emberIndex * 1.37)
            * 0.018
            * emberLife;
          emberPosition.setXYZ(
            emberIndex,
            ember.x + Math.cos(ember.angle) * travel + flutter,
            ember.y + Math.sin(ember.angle) * travel + dollarBurn * ember.speed * 0.08,
            0.035 + emberLife * 0.018,
          );
        });
        emberPosition.needsUpdate = true;
      } else {
        bill.material.color.setRGB(
          MathUtils.lerp(1, 0.78, birdFold),
          1,
          MathUtils.lerp(1, 0.82, birdFold),
        );
        bill.material.opacity = billOpacity;
      }
    });
    moneyBirdFlightMeshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = progress > 0.32 && progress < 0.87 && fundedWorldFade > 0.002;
    });
    perchedMoneyBirds.instanceMatrix.needsUpdate = true;
    perchedMoneyBirds.visible = moneyBirdTextureReady
      && progress > 0.38
      && progress < 0.87
      && fundedWorldFade > 0.002;

    canvas.style.opacity = String(visibility * (1 - exit));
    renderer.render(scene, camera);
  }

  resize();

  /* Vault M9 — three links a shader program on the frame its material first
     DRAWS, not when it is created. Measured across the journey: 10 programs
     link on this canvas at the handover into WE SCALE and 9 more just after,
     which is the 287ms frame at the exact moment the visitor is being carried
     into the last act. Linking them here costs page-load time, where 34
     programs already link and nothing is moving yet.
     compile() only walks VISIBLE objects and half of this scene is toggled on
     by progress, so everything is forced visible for the traversal and put
     back exactly as it was — nothing renders in between, so the temporary
     state can never reach the screen. */
  {
    const wasHidden = [];
    scene.traverse((o) => { if (o.visible === false) { wasHidden.push(o); o.visible = true; } });
    try {
      renderer.compile(scene, camera);
    } catch (e) {
      /* a precompile failure must never cost us the scene — it only means the
         old first-draw cost comes back */
      console.info("[consult-hand] precompile skipped:", e?.message || e);
    }
    for (const o of wasHidden) o.visible = false;
  }

  return {
    setProgress,
    render,
    resize,
    dispose() {
      removeEventListener("pointermove", onPointer);
      renderer.dispose();
      globeGridGeometry.dispose();
      globeGridMaterial.dispose();
      globeInteriorGridGeometry.dispose();
      globeInteriorGridMaterial.dispose();
      globeAccentGeometry.dispose();
      globeAccentMaterial.dispose();
      continentGeometries.forEach((geometry) => geometry.dispose());
      continentMaterial.dispose();
      orbitGeometry.dispose();
      orbitMaterial.dispose();
      globeFumeGeometry.dispose();
      globeFumeMaterial.dispose();
      plantAtlasTexture.dispose();
      plantAtlasMaterial.dispose();
      plantAtlasGeometries.forEach((geometry) => geometry.dispose());
      ecologyAtlasTexture.dispose();
      ecologyCutoutMaterial.dispose();
      ecologyButterflyMaterial.dispose();
      ecologyAtlasGeometries.forEach((geometry) => geometry.dispose());
      butterflyBodyGeometry.dispose();
      butterflyBodyMaterial.dispose();
      fireflyGeometry.dispose();
      fireflyMaterial.dispose();
      feedOrbGeometry.dispose();
      feedOrbs.forEach(({ material }) => material.dispose());
      handTexture.dispose();
      handMaterial.dispose();
      handPlane.geometry.dispose();
      billGeometry.dispose();
      billTexture.dispose();
      focusBurnMaskTexture.dispose();
      focusBurnEmberGeometry.dispose();
      focusBurnEmberMaterial.dispose();
      focusBurnFragments.forEach(({ geometry }) => geometry.dispose());
      focusBurnFragmentMaterials.forEach((material) => material.dispose());
      focusBurnFlameGeometry.dispose();
      focusBurnFlameMaterial.dispose();
      focusBurnBackdropMaterial.dispose();
      billMaterials.forEach((material) => {
        material.dispose();
      });
      moneyBirdLeftGeometry.dispose();
      moneyBirdRightGeometry.dispose();
      moneyBirdBodyGeometry.dispose();
      moneyBirdFlightMaterial.dispose();
      moneyBirdTexture.dispose();
      moneyBirdPerchGeometry.dispose();
      moneyBirdPerchMaterial.dispose();
    },
  };
}
