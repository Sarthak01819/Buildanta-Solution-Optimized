import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  PointLight,
  QuadraticBezierCurve3,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoother = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const range = (start, end, value) => smoother((value - start) / (end - start));

function power2InOut(t) {
  t = clamp01(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/* ULTRA-HD HIGH-CONTRAST 2048x2048 MATRIX BINARY (0,1) TEXTURE GENERATOR */
function createBinaryCanvasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d");

  // Deep pitch black background for extreme contrast
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 2048, 2048);

  // Vivid neon border
  ctx.strokeStyle = "#00ff66";
  ctx.lineWidth = 36;
  ctx.strokeRect(18, 18, 2012, 2012);

  ctx.fillStyle = "#a7f3d0";
  ctx.shadowColor = "#00ff66";
  ctx.shadowBlur = 42;
  ctx.font = "bold 150px monospace";

  const cols = 8;
  const rows = 8;
  const cellW = 2048 / cols;
  const cellH = 2048 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const char = Math.random() < 0.5 ? "0" : "1";
      ctx.fillText(char, c * cellW + 65, r * cellH + 165);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.anisotropy = 16;
  return texture;
}

function isLandmass(lat, lon) {
  if (lat > 15 && lat < 70 && lon > -160 && lon < -50) return true;
  if (lat > -55 && lat < 12 && lon > -85 && lon < -35) return true;
  if (lat > 5 && lat < 75 && lon > -10 && lon < 140) return true;
  if (lat > -35 && lat < 37 && lon > -18 && lon < 52) return true;
  if (lat > -42 && lat < -10 && lon > 110 && lon < 155) return true;
  if (lat < -65) return true;
  return Math.sin(lat * 0.25) * Math.cos(lon * 0.25) > 0.45;
}

function generateEarthVoxels() {
  const voxels = [];
  const radius = 14.5;
  const latSteps = 34;
  const lonSteps = 68;

  for (let i = 0; i <= latSteps; i++) {
    const lat = -90 + (i / latSteps) * 180;
    const phi = (90 - lat) * (Math.PI / 180);
    const currentLonSteps = Math.max(8, Math.round(lonSteps * Math.sin(phi)));

    for (let j = 0; j < currentLonSteps; j++) {
      const lon = -180 + (j / currentLonSteps) * 360;
      const theta = (lon + 180) * (Math.PI / 180);
      const isLand = isLandmass(lat, lon);
      const r = isLand ? radius + 0.6 : radius;

      const x = -r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      const normalizedY = (y + radius) / (radius * 2);
      const normalizedLon = j / currentLonSteps;
      const seed = Math.abs(Math.sin(i * 12.9898 + j * 78.233)) % 1;
      const order = normalizedY * 0.65 + normalizedLon * 0.20 + seed * 0.15;

      // Assembly timing: starts exactly upon star collision impact at progress 0.264
      const startT = 0.264 + order * 0.116;
      const endT = Math.min(0.395, startT + 0.024);

      const side = x < 0 ? -1 : 1;
      const originX = x + side * (12.0 + seed * 18.0);
      const originY = y - (14.0 + seed * 10.0);
      const originZ = z + (seed - 0.5) * 30.0;

      voxels.push({
        x, y, z,
        originX, originY, originZ,
        startT, endT,
        isLand,
      });
    }
  }
  return voxels;
}

function createArc(lat1, lon1, lat2, lon2, colorHex) {
  const r = 14.8;
  const phi1 = (90 - lat1) * (Math.PI / 180);
  const theta1 = (lon1 + 180) * (Math.PI / 180);
  const p1 = new Vector3(-r * Math.sin(phi1) * Math.cos(theta1), r * Math.cos(phi1), r * Math.sin(phi1) * Math.sin(theta1));

  const phi2 = (90 - lat2) * (Math.PI / 180);
  const theta2 = (lon2 + 180) * (Math.PI / 180);
  const p2 = new Vector3(-r * Math.sin(phi2) * Math.cos(theta2), r * Math.cos(phi2), r * Math.sin(phi2) * Math.sin(theta2));

  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  mid.normalize().multiplyScalar(r * 1.45);

  const curve = new QuadraticBezierCurve3(p1, mid, p2);
  const points = curve.getPoints(40);
  const geom = new BufferGeometry().setFromPoints(points);

  const mat = new LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.75,
    linewidth: 2,
  });

  return new Line(geom, mat);
}

/**
 * ACT 02 — HIGH PERFORMANCE 60 FPS ULTRA-HD RA.ONE MATRIX ENGINE
 */
export function createCodeBuild({ accent = "#22c55e" } = {}) {
  const scene = new Scene();
  scene.fog = new FogExp2(0x000000, 0.008);

  const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(0, 4, 52);

  const binaryTexture = createBinaryCanvasTexture();

  // Matrix High-Density Lighting Array
  const ambientLight = new AmbientLight(0x15803d, 2.8);
  scene.add(ambientLight);

  const mainSunLight = new DirectionalLight(0xffffff, 3.5);
  mainSunLight.position.set(25, 15, 30);
  scene.add(mainSunLight);

  const matrixTechLight = new PointLight(0x22c55e, 7.5, 100);
  matrixTechLight.position.set(-20, 10, 20);
  scene.add(matrixTechLight);

  const innerCoreLight = new PointLight(0x4ade80, 11.0, 45);
  innerCoreLight.position.set(0, 0, 0);
  scene.add(innerCoreLight);

  // 3D Matrix Inner Core Mesh
  const coreSphereGeom = new SphereGeometry(3.8, 32, 32);
  const coreSphereMat = new MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x15803d,
    emissiveIntensity: 0.95,
    roughness: 0.1,
    metalness: 0.9,
    side: DoubleSide,
    map: binaryTexture,
    emissiveMap: binaryTexture,
  });
  const coreSphereMesh = new Mesh(coreSphereGeom, coreSphereMat);
  scene.add(coreSphereMesh);

  // Inner Core Matrix Wireframe Grid
  const coreWireGeom = new SphereGeometry(4.2, 24, 24);
  const coreWireMat = new MeshBasicMaterial({
    color: 0x4ade80,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
  });
  const coreWireMesh = new Mesh(coreWireGeom, coreWireMat);
  scene.add(coreWireMesh);

  // Procedural Earth Voxel Map
  const voxelCoords = generateEarthVoxels();
  const totalCubes = voxelCoords.length;
  const cubeSize = 0.68;
  const cubeGeometry = new BoxGeometry(cubeSize, cubeSize, cubeSize);

  const landMaterial = new MeshStandardMaterial({
    color: 0x052e16,
    metalness: 0.95,
    roughness: 0.08,
    emissive: 0x00ff66,
    emissiveIntensity: 1.35,
    side: DoubleSide,
    map: binaryTexture,
    emissiveMap: binaryTexture,
  });

  const landGroup = new Group();
  scene.add(landGroup);

  const landMesh = new InstancedMesh(cubeGeometry, landMaterial, totalCubes);
  landGroup.add(landMesh);

  const dummy = new Object3D();
  let lastAssemblyProgress = -1;
  // Camera state mirrored for the fly-through: cubes directly in the camera's
  // path shrink away instead of becoming a flat green wall across the screen.
  const camWorld = new Vector3(0, 4, 52);
  let camSpin = 0;

  // Matrix 2nd Atmosphere Shell
  const secondGlobeGeom = new SphereGeometry(16.2, 36, 36);
  const secondGlobeMat = new MeshStandardMaterial({
    color: 0x4ade80,
    emissive: 0x15803d,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.18,
    roughness: 0.1,
    metalness: 0.9,
    side: DoubleSide,
  });
  const secondGlobeMesh = new Mesh(secondGlobeGeom, secondGlobeMat);
  landGroup.add(secondGlobeMesh);
  // Yash (6 Aug): the shell's translucent green FILL washed the whole frame
  // greenish near/inside the globe. The structure stays transparent — only
  // the wireframe grid renders. Flip to true to bring the fill back.
  secondGlobeMesh.visible = false;

  const wireframeMat = new MeshBasicMaterial({
    color: 0x22c55e,
    wireframe: true,
    transparent: true,
    opacity: 0.25,
    side: DoubleSide,
  });
  const wireframeGlobeMesh = new Mesh(secondGlobeGeom, wireframeMat);
  landGroup.add(wireframeGlobeMesh);

  // Matrix Green 3D Data Arcs
  const arcsGroup = new Group();
  arcsGroup.add(createArc(35.6, 139.6, 37.7, -122.4, 0x4ade80));
  arcsGroup.add(createArc(40.7, -74.0, 51.5, -0.1, 0x22c55e));
  arcsGroup.add(createArc(51.5, -0.1, -33.8, 151.2, 0x4ade80));
  arcsGroup.add(createArc(50.1, 8.6, 12.9, 77.5, 0x22c55e));
  landGroup.add(arcsGroup);

  // Matrix Saturn Orbit Ring System
  const orbitRingGroup = new Group();
  orbitRingGroup.rotation.x = Math.PI / 3.2;
  orbitRingGroup.rotation.y = Math.PI / 6;
  scene.add(orbitRingGroup);

  const ringGeomInner = new RingGeometry(20.5, 25.5, 128);
  const ringMatInner = new MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x15803d,
    emissiveIntensity: 0.45,
    side: DoubleSide,
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0.9,
    map: binaryTexture,
  });
  const saturnRingMesh = new Mesh(ringGeomInner, ringMatInner);
  saturnRingMesh.rotation.x = Math.PI / 2;
  orbitRingGroup.add(saturnRingMesh);

  const ringGeomOuter = new RingGeometry(26.2, 26.7, 128);
  const ringMatOuter = new MeshBasicMaterial({ color: 0x4ade80, side: DoubleSide, transparent: true, opacity: 0.7 });
  const outerBorderRing = new Mesh(ringGeomOuter, ringMatOuter);
  outerBorderRing.rotation.x = Math.PI / 2;
  orbitRingGroup.add(outerBorderRing);

  // Particle Field
  // Ambient particle cloud REMOVED (Yash, 6 Aug): its sprites read as
  // stray green dots drifting over the matrix world.

  let lerpedProgress = 0;

  function setCamera(p) {
    const rawFly = clamp01((p - 0.244) / (0.450 - 0.244));
    const flyIn = power2InOut(rawFly);
    const exit = range(0.485, 0.520, p);

    // Wider approach (Yash, 6 Aug: "pull the camera wider there"): the dive
    // depth follows flyIn^1.6, so the camera keeps its distance while the
    // Earth assembles and the too-close wall-of-cubes band is crossed fast.
    const dive = Math.pow(flyIn, 1.6);
    const z = 52.0 - dive * 51.8 + exit * 48.0;
    const y = 4.0 - flyIn * 3.5;
    const x = 0;
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);

    landGroup.rotation.y = flyIn * Math.PI * 4.0;
    camWorld.set(x, y, z);
    camSpin = flyIn * Math.PI * 4.0;
  }

  function resize(width, height) {
    camera.aspect = Math.max(0.35, width / Math.max(1, height));
    camera.updateProjectionMatrix();
  }

  function update(progress, time = 0) {
    // Smooth 60 FPS motion dampening
    lerpedProgress += (progress - lerpedProgress) * 0.18;
    const p = lerpedProgress;

    // Act 02 scene only becomes visible right at droplet collision (p = 0.258 - 0.264)
    const enter = range(0.258, 0.272, p);
    const exit = 1 - range(0.495, 0.520, p);
    const sceneAlpha = enter * exit;
    scene.visible = sceneAlpha > 0.001;
    setCamera(p);
    if (!scene.visible) return;

    const globalBuild = range(0.264, 0.380, p);
    // Yash (6 Aug): the green cubic boxes must be REMOVED once we enter the
    // matrix globe. Assembly finishes by .395; the dive crosses the shell
    // right after — every voxel cube fades out by .435 and reverse restores.
    const cubesOut = 1 - range(0.395, 0.435, p);
    landMesh.visible = cubesOut > 0.002;

    // Core sphere, wireframe grid, and rings erupt from 0 upon collision
    coreSphereMesh.scale.setScalar(Math.max(0.001, globalBuild));
    coreWireMesh.scale.setScalar(Math.max(0.001, globalBuild));

    secondGlobeMat.opacity = 0.18 * globalBuild;
    wireframeMat.opacity = 0.25 * globalBuild;
    ringMatInner.opacity = 0.55 * globalBuild;
    ringMatOuter.opacity = 0.70 * globalBuild;

    // HIGH PERFORMANCE 60 FPS MATRIX UPDATES:
    // Only update individual instance matrices during assembly window (0.264 <= p <= 0.395).
    if (landMesh.visible && Math.abs(p - lastAssemblyProgress) > 0.0005) {
      lastAssemblyProgress = p;

      // landGroup spins during the dive — bring cube positions to world space
      // once per update so camera distance is honest.
      const spinCos = Math.cos(camSpin);
      const spinSin = Math.sin(camSpin);

      for (let i = 0; i < totalCubes; i++) {
        const v = voxelCoords[i];
        const flight = range(v.startT, v.endT, p);

        if (flight <= 0.001) {
          dummy.scale.setScalar(0.001);
          dummy.position.set(v.originX, v.originY, v.originZ);
        } else {
          const easeFlight = smoother(flight);
          const curX = v.originX + (v.x - v.originX) * easeFlight;
          const curY = v.originY + (v.y - v.originY) * easeFlight;
          const curZ = v.originZ + (v.z - v.originZ) * easeFlight;

          dummy.position.set(curX, curY, curZ);
          dummy.rotation.set(
            (1 - easeFlight) * Math.PI,
            (1 - easeFlight) * Math.PI * 0.5,
            0
          );
          // Cubes in the camera's path melt away as it nears (and reform after
          // it passes — pure function of p, so reverse scroll rebuilds them).
          // Without this, entering the globe parks a flat green wall onscreen.
          const wx = curX * spinCos + curZ * spinSin;
          const wz = -curX * spinSin + curZ * spinCos;
          const ddx = wx - camWorld.x, ddy = curY - camWorld.y, ddz = wz - camWorld.z;
          const dCam = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
          const att = clamp01((dCam - 1.1) / 3.4);
          const attEase = att * att * (3 - 2 * att);
          // Materialise near the destination: cubes in free flight passed the
          // camera as huge unfocused glyph blobs ("dots" — Yash, 6 Aug).
          const arrive = clamp01((easeFlight - 0.55) / 0.35);
          const arriveEase = arrive * arrive * (3 - 2 * arrive);
          dummy.scale.setScalar(
            (0.1 + easeFlight * 0.9) * Math.max(attEase * cubesOut * arriveEase, 0.001)
          );
        }
        dummy.updateMatrix();
        landMesh.setMatrixAt(i, dummy.matrix);
      }
      landMesh.instanceMatrix.needsUpdate = true;
    }

    // Real-time animation loops (GPU space)
    binaryTexture.offset.y += 0.009;
    wireframeGlobeMesh.rotation.y -= 0.0015;
    coreWireMesh.rotation.y += 0.004;
    coreWireMesh.rotation.x += 0.002;
    orbitRingGroup.rotation.z += 0.002;
  }

  const projectedBase = new Vector3();
  function projectBase() {
    projectedBase.set(0, 0, 0).project(camera);
    return {
      x: (projectedBase.x * 0.5 + 0.5) * 100,
      y: (-projectedBase.y * 0.5 + 0.5) * 100,
    };
  }

  function render(renderer) {
    if (scene.visible) renderer.render(scene, camera);
  }

  resize(16, 9);
  update(0, 0);

  return {
    scene,
    camera,
    resize,
    update,
    render,
    projectBase,
    dispose() {
      binaryTexture.dispose();
      coreSphereGeom.dispose();
      coreSphereMat.dispose();
      coreWireGeom.dispose();
      coreWireMat.dispose();
      cubeGeometry.dispose();
      landMaterial.dispose();
      secondGlobeGeom.dispose();
      secondGlobeMat.dispose();
      wireframeMat.dispose();
      ringGeomInner.dispose();
      ringMatInner.dispose();
      ringGeomOuter.dispose();
      ringMatOuter.dispose();
    },
  };
}
