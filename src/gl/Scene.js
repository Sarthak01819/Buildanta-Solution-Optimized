import {
  Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, BufferAttribute,
  ShaderMaterial, LineSegments, Points, Group, Color, Vector2,
  AdditiveBlending, IcosahedronGeometry, WireframeGeometry,
} from "three";

// `?raw` native Vite hai — koi glsl plugin nahi chahiye
import gridVert from "./grid.vert.glsl?raw";
import gridFrag from "./grid.frag.glsl?raw";
import coreVert from "./core.vert.glsl?raw";
import coreFrag from "./core.frag.glsl?raw";

/* ── grid floor: har line ko subdivide karna zaroori hai,
      warna 2 endpoints wali line vertex shader mein bend nahi ho sakti ── */
function buildGrid(half = 26, lines = 46, seg = 44) {
  const verts = [];
  const step = (half * 2) / (lines - 1);
  const sStep = (half * 2) / seg;

  for (let i = 0; i < lines; i++) {
    const c = -half + i * step;
    for (let s = 0; s < seg; s++) {
      const a = -half + s * sStep, b = a + sStep;
      verts.push(a, 0, c, b, 0, c);   // X ke saath
      verts.push(c, 0, a, c, 0, b);   // Z ke saath
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(verts), 3));
  return g;
}

export function createScene(canvas, opts = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 2.6, 11);
  camera.lookAt(0, 0.6, 0);

  const cyan = new Color(opts.cyan ?? "#4ae0f5");
  const amber = new Color(opts.amber ?? "#ffa629");

  const shared = {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uCyan: { value: cyan },
    uAmber: { value: amber },
  };

  /* ── grid ── */
  const gridU = { ...shared, uScanR: { value: 0 } };
  const gridMat = new ShaderMaterial({
    vertexShader: gridVert, fragmentShader: gridFrag, uniforms: gridU,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const grid = new LineSegments(buildGrid(), gridMat);
  grid.position.y = -2.4;
  scene.add(grid);

  /* ── core ── */
  const ico = new IcosahedronGeometry(2.05, 3);
  const coreU = {
    ...shared,
    uMorph: { value: 0 },
    uGlitch: { value: 0 },
    uMouse: { value: new Vector2(0, 0) },
  };
  const coreMat = new ShaderMaterial({
    vertexShader: coreVert, fragmentShader: coreFrag, uniforms: coreU,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });

  const coreGroup = new Group();
  coreGroup.add(new LineSegments(new WireframeGeometry(ico), coreMat));

  // vertices par nodes — wireframe ko "system" jaisa feel dete hain
  const nodeMat = new ShaderMaterial({
    uniforms: coreU,
    vertexShader: coreVert.replace(
      "gl_Position = projectionMatrix * mv;",
      "gl_Position = projectionMatrix * mv;\n  gl_PointSize = 2.0 + vRim * 3.0;"
    ),
    fragmentShader: coreFrag,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  coreGroup.add(new Points(ico, nodeMat));
  coreGroup.position.y = 0.5;
  scene.add(coreGroup);

  /* ── state ── */
  const mouse = new Vector2(0, 0), mouseS = new Vector2(0, 0);
  let dpr = 1, lastW = 0, lastH = 0;
  let scanR = 0, glitch = 0, glitchTarget = 0;

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < 760 ? 14 : 11;
    camera.updateProjectionMatrix();
  }

  function setPointer(px, py) {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    mouse.set(px / w - 0.5, py / h - 0.5);
  }

  function render(elapsed) {
    const cw = canvas.clientWidth || innerWidth;
    const ch = canvas.clientHeight || innerHeight;
    if (cw > 0 && (lastW !== cw || lastH !== ch)) { lastW = cw; lastH = ch; resize(); }

    const t = reduced ? 0 : elapsed;
    shared.uTime.value = t;

    // scan ring baar-baar bahar ki taraf jaati hai
    scanR = (t * 3.4) % 34;
    gridU.uScanR.value = scanR;

    // glitch decay — scroll velocity spike deti hai, phir ye girta hai
    glitch += (glitchTarget - glitch) * 0.09;
    glitchTarget *= 0.9;
    coreU.uGlitch.value = reduced ? 0 : glitch;

    // core rotation + cursor parallax
    mouseS.lerp(mouse, 0.06);
    coreU.uMouse.value.copy(mouseS);
    if (!reduced) {
      coreGroup.rotation.y = t * 0.16 + mouseS.x * 0.5;
      coreGroup.rotation.x = Math.sin(t * 0.1) * 0.14 + mouseS.y * 0.35;
    }

    // camera scroll ke saath peeche aur upar
    camera.position.y = 2.6 + shared.uScroll.value * 2.2 + mouseS.y * -0.5;
    camera.position.x = mouseS.x * 0.9;
    camera.lookAt(0, 0.6 - shared.uScroll.value * 0.8, 0);

    renderer.render(scene, camera);
  }

  resize();

  return {
    resize, setPointer, render,
    set scroll(v) { shared.uScroll.value = v; },
    set morph(v) { coreU.uMorph.value = v; },
    /** scroll velocity spike → glitch burst */
    kick(v) { glitchTarget = Math.min(1, glitchTarget + v); },
    dispose() {
      grid.geometry.dispose(); ico.dispose();
      gridMat.dispose(); coreMat.dispose(); nodeMat.dispose(); renderer.dispose();
    },
  };
}
