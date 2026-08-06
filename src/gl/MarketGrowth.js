import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  PointLight,
  Quaternion,
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

/* 7 MARKETING CAPABILITY PANELS DATA FROM SCREENSHOTS */
const PANELS = [
  { id: "01", category: "ORGANIC", title: "SEO authority", metric: "84% ORGANIC", bg: "gradient-blue" },
  { id: "02", category: "DEMAND", title: "Paid acquisition", metric: "4.6x ROAS", bg: "gradient-coral" },
  { id: "03", category: "REVENUE", title: "Sales systems", metric: "+38% CLOSE RATE", bg: "gradient-violet" },
  { id: "04", category: "CONVERSION", title: "CRO & creative", metric: "+185% ROAS UPLIFT", bg: "gradient-indigo" },
  { id: "05", category: "RETENTION", title: "Lifecycle growth", metric: "92% NET RETENTION", bg: "gradient-cyan" },
  { id: "06", category: "VIRAL", title: "Brand momentum", metric: "8.5M IMPRESSIONS", bg: "gradient-magenta" },
  { id: "07", category: "TELEMETRY", title: "Growth analytics", metric: "100% DATA PRECISION", bg: "gradient-dark" },
];

/* DRAW FILM PERFORATIONS ON TOP & BOTTOM EDGES */
function drawFilmPerforations(ctx, width, height) {
  ctx.fillStyle = "#070614";
  ctx.fillRect(0, 0, width, 48);
  ctx.fillRect(0, height - 48, width, 48);

  ctx.fillStyle = "#e2e8f0";
  const holeWidth = 26;
  const holeHeight = 20;
  const gap = 46;
  for (let x = 24; x < width - 24; x += gap) {
    ctx.fillRect(x, 14, holeWidth, holeHeight);
    ctx.fillRect(x, height - 34, holeWidth, holeHeight);
  }
}

/* DYNAMIC HD CANVAS TEXTURE GENERATOR FOR FILM CAMERA REEL PANELS */
function createPanelTexture(panel) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");

  // Panel background gradients matching screenshot
  let bgGrad;
  if (panel.bg === "gradient-coral") {
    bgGrad = ctx.createRadialGradient(512, 320, 50, 512, 320, 500);
    bgGrad.addColorStop(0, "#ff5555");
    bgGrad.addColorStop(0.5, "#d93856");
    bgGrad.addColorStop(1, "#400818");
  } else if (panel.bg === "gradient-violet") {
    bgGrad = ctx.createRadialGradient(512, 320, 50, 512, 320, 500);
    bgGrad.addColorStop(0, "#3b82f6");
    bgGrad.addColorStop(0.5, "#1e1b4b");
    bgGrad.addColorStop(1, "#09041a");
  } else if (panel.bg === "gradient-cyan") {
    bgGrad = ctx.createRadialGradient(512, 320, 50, 512, 320, 500);
    bgGrad.addColorStop(0, "#06b6d4");
    bgGrad.addColorStop(0.6, "#0f172a");
    bgGrad.addColorStop(1, "#040814");
  } else {
    bgGrad = ctx.createRadialGradient(300, 200, 30, 512, 320, 550);
    bgGrad.addColorStop(0, "#2563eb");
    bgGrad.addColorStop(0.6, "#0f172a");
    bgGrad.addColorStop(1, "#030511");
  }

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 640);

  // Outer glowing border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 1008, 624);

  // Draw film perforations
  drawFilmPerforations(ctx, 1024, 640);

  // Top Category Tag (DM Mono)
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.font = "500 32px 'DM Mono', monospace";
  ctx.fillText(`0${panel.id}  ·  ${panel.category}`, 65, 100);

  // Main Title (Italic Instrument Serif matching screenshot)
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 18;
  ctx.font = "italic 76px 'Instrument Serif', Georgia, serif";
  ctx.fillText(panel.title, 65, 260);

  // Metric readout (DM Mono at bottom)
  ctx.fillStyle = "#00f0ff";
  ctx.shadowBlur = 0;
  ctx.font = "bold 44px 'DM Mono', monospace";
  ctx.fillText(panel.metric, 65, 545);

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

/**
 * ACT 03 — AFTERIMAGE 3D GROWTH MARKETING ENGINE
 */
export function createMarketGrowth({ accent = "#00f0ff" } = {}) {
  const scene = new Scene();
  scene.fog = new FogExp2(0x060418, 0.005);

  const camera = new PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(0, 2, 58);

  const tmpCamLook = new Vector3();

  // Space Lighting Array
  const ambientLight = new AmbientLight(0x1e1b4b, 3.5);
  scene.add(ambientLight);

  const blueLight = new PointLight(0x3b82f6, 9.0, 140);
  blueLight.position.set(-25, 15, 20);
  scene.add(blueLight);

  const coralLight = new PointLight(0xff5555, 10.0, 140);
  coralLight.position.set(25, -10, 20);
  scene.add(coralLight);

  // 1. LEFT VIBRANT BLUE PLANET (From Screenshot 2 & 3)
  const leftPlanetGeom = new SphereGeometry(5.2, 32, 32);
  const leftPlanetMat = new MeshStandardMaterial({
    color: 0x2563eb,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.8,
  });
  const leftPlanetMesh = new Mesh(leftPlanetGeom, leftPlanetMat);
  leftPlanetMesh.position.set(-22, 6, -14);
  scene.add(leftPlanetMesh);

  // 2. RIGHT LARGE CORAL RED / MAGENTA PLANET (From Screenshot 3)
  const rightPlanetGeom = new SphereGeometry(9.5, 32, 32);
  const rightPlanetMat = new MeshStandardMaterial({
    color: 0xff4d4d,
    emissive: 0x991b1b,
    emissiveIntensity: 0.65,
    roughness: 0.3,
    metalness: 0.7,
  });
  const rightPlanetMesh = new Mesh(rightPlanetGeom, rightPlanetMat);
  rightPlanetMesh.position.set(24, 2, -18);
  scene.add(rightPlanetMesh);

  // 3. CONCENTRIC RADAR TARGET RETICLE (From Screenshot 2 & 3)
  const reticleGroup = new Group();
  reticleGroup.position.set(0, 0, -12);
  scene.add(reticleGroup);

  const reticleVerts = [];
  const reticleRings = [6, 12, 18, 24, 30, 38];
  reticleRings.forEach((r) => {
    const segs = 64;
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      reticleVerts.push(Math.cos(a1) * r, Math.sin(a1) * r, 0);
      reticleVerts.push(Math.cos(a2) * r, Math.sin(a2) * r, 0);
    }
  });
  // Radial spokes
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    reticleVerts.push(0, 0, 0, Math.cos(a) * 42, Math.sin(a) * 42, 0);
  }
  const reticleGeom = new BufferGeometry();
  reticleGeom.setAttribute("position", new BufferAttribute(new Float32Array(reticleVerts), 3));
  const reticleMat = new LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22 });
  const reticleLines = new LineSegments(reticleGeom, reticleMat);
  reticleGroup.add(reticleLines);

  // 4. SATURN HOLOGRAPHIC ORBIT RING
  const saturnRingGeom = new RingGeometry(16, 26, 64);
  const saturnRingMat = new MeshBasicMaterial({ color: 0x38bdf8, side: DoubleSide, transparent: true, opacity: 0.25 });
  const saturnRingMesh = new Mesh(saturnRingGeom, saturnRingMat);
  saturnRingMesh.rotation.x = Math.PI / 2.2;
  scene.add(saturnRingMesh);

  // 5. 3D PARTICLE STARFIELD (800 Particles)
  let particleCount = 800;
  const particleGeom = new BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);
  for (let p = 0; p < particleCount * 3; p += 3) {
    const r = 8 + Math.random() * 42;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.PI * Math.random();
    particlePos[p] = r * Math.sin(phi) * Math.cos(theta);
    particlePos[p + 1] = r * Math.sin(phi) * Math.sin(theta);
    particlePos[p + 2] = r * Math.cos(phi);
  }
  particleGeom.setAttribute("position", new BufferAttribute(particlePos, 3));
  const particleMat = new PointsMaterial({ color: 0x38bdf8, size: 0.35, transparent: true, opacity: 0.75, blending: AdditiveBlending });
  const particleSystem = new Points(particleGeom, particleMat);
  scene.add(particleSystem);

  // 6. 3D TILTED FILM CAMERA REEL (Tilted perspective matching Screenshot 1)
  const reelGroup = new Group();
  reelGroup.rotation.z = -0.26; // ~-15deg tilt matching screenshot 1
  reelGroup.rotation.x = 0.28;  // 3D perspective tilt
  scene.add(reelGroup);

  const panelMeshes = [];
  const panelGeom = new BoxGeometry(12.5, 7.8, 0.4);

  PANELS.forEach((panel, index) => {
    const texture = createPanelTexture(panel);
    const panelMat = new MeshStandardMaterial({
      map: texture,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.18,
      side: DoubleSide,
    });
    const panelMesh = new Mesh(panelGeom, panelMat);

    // Position along continuous film strip line
    const x = (index - 3) * 13.8;
    panelMesh.position.set(x, 0, 0);
    reelGroup.add(panelMesh);
    panelMeshes.push(panelMesh);
  });

  // Pointer Parallax variables
  let pX = 0, pY = 0, pTx = 0, pTy = 0;
  const onMove = (e) => {
    pTx = (e.clientX / innerWidth - 0.5) * 2;
    pTy = (e.clientY / innerHeight - 0.5) * 2;
  };
  addEventListener("pointermove", onMove, { passive: true });

  let lerpedProgress = 0;
  let lastFrameTime = performance.now();
  let slowFrameCount = 0;

  function setCamera(p) {
    // Act 03 progress window: 0.480 -> 0.720
    const enter = range(0.480, 0.510, p);
    const reelTravel = range(0.510, 0.690, p);
    const exit = range(0.690, 0.720, p);

    pX += (pTx - pX) * 0.05;
    pY += (pTy - pY) * 0.05;

    // Zoom camera & glide film reel horizontally across viewport (~860px)
    const z = 58.0 - enter * 32.0 + exit * 44.0;
    const y = 2.0 - enter * 1.5 + pY * -0.6;
    const x = (reelTravel - 0.5) * 56.0 + pX * 0.8;

    camera.position.set(x, y, z);
    tmpCamLook.set(x * 0.5, 0, 0);
    camera.lookAt(tmpCamLook);

    // Horizontal film reel glide (~860px travel)
    reelGroup.position.x = -x * 0.75;

    // Planets rotation & pulse
    leftPlanetMesh.rotation.y = p * Math.PI * 2.0;
    rightPlanetMesh.rotation.y = -p * Math.PI * 1.5;
    reticleGroup.rotation.z = p * Math.PI * 0.5;
  }

  function resize(width, height) {
    camera.aspect = Math.max(0.35, width / Math.max(1, height));
    camera.updateProjectionMatrix();
  }

  function update(progress, time = 0) {
    const now = performance.now();
    const frameDuration = now - lastFrameTime;
    lastFrameTime = now;
    if (frameDuration > 18.5) {
      slowFrameCount++;
      if (slowFrameCount > 30 && particleGeom.drawRange.count > 400) {
        particleGeom.setDrawRange(0, 400);
      }
    }

    lerpedProgress += (progress - lerpedProgress) * 0.16;
    const p = lerpedProgress;

    const enter = range(0.475, 0.495, p);
    const exit = 1 - range(0.705, 0.730, p);
    const sceneAlpha = enter * exit;
    scene.visible = sceneAlpha > 0.001;
    setCamera(p);
    if (!scene.visible) return;

    saturnRingMesh.rotation.z += 0.002;
    particleSystem.rotation.y += 0.001;
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
      removeEventListener("pointermove", onMove);
      leftPlanetGeom.dispose();
      leftPlanetMat.dispose();
      rightPlanetGeom.dispose();
      rightPlanetMat.dispose();
      reticleGeom.dispose();
      reticleMat.dispose();
      saturnRingGeom.dispose();
      saturnRingMat.dispose();
      particleGeom.dispose();
      particleMat.dispose();
      panelGeom.dispose();
    },
  };
}
