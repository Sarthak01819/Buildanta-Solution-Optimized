/**
 * THE GROWING NETWORK — what lives inside the WE SCALE globe.
 *
 * Replaces the 2.5D photographic plant. That plant was alpha-cutout planes of
 * a photograph in a scene that has NO lights and draws everything else as flat
 * emissive line-work: a photo pasted into a diagram, which is why no amount of
 * better plant modelling fixed it (a MORE realistic plant looks MORE wrong).
 *
 * What a network says that a seedling does not: the act's own ticker reads
 * ACQUISITION → CONVERSION → RETENTION → REVENUE INTELLIGENCE → CAPITAL
 * STRATEGY. That is a system compounding, and scaling IS connections
 * compounding — so the object and the words finally agree.
 *
 * Two styles, both built here so Yash can judge them in the real act:
 *   'line'  — emissive line-work, the globe's own language (recommended)
 *   'solid' — lit spheres and tubes; adds lights, which touch NOTHING else
 *             because every other material in this scene is MeshBasic.
 *
 * Motion is both, per his answer: growth follows scroll and is fully
 * reversible, while what has already grown keeps breathing on its own clock.
 */
import {
  Group, BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry,
  CylinderGeometry, PointLight, Color, AdditiveBlending,
} from 'three';

/* Deterministic pseudo-random: the same network every load, so a screenshot
   comparison is honest and a regression is visible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NODES = 34;
const R = 2.80;          // stays inside the globe's 3.27 shell

/**
 * Build the node set as a GROWING graph: every node after the first attaches
 * to an earlier one, so the thing is connected at every moment of its growth
 * rather than appearing as scattered dust that later wires up.
 */
function buildGraph() {
  const rand = rng(20260817);
  const nodes = [];
  const edges = [];

  for (let i = 0; i < NODES; i++) {
    /* Grow from the fingertip upward: early nodes low and central, later ones
       higher and wider. The visitor sees it rise out of the hand. */
    const t = i / (NODES - 1);
    const spread = 0.30 + 0.70 * t;
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const rr = R * spread * Math.cbrt(rand());
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    nodes.push({
      x: rr * s * Math.cos(phi),
      y: -R * 0.75 + (R * 1.55) * t + (rand() - 0.5) * 0.55,
      z: rr * s * Math.sin(phi),
      birth: t,                    // 0..1 — when it appears during growth
      phase: rand() * Math.PI * 2, // its own breathing offset
    });

    if (i > 0) {
      // attach to the nearest EARLIER node — a network that grew, not a mesh
      let best = 0, bestD = Infinity;
      for (let j = 0; j < i; j++) {
        const n = nodes[j];
        const d = (n.x - nodes[i].x) ** 2 + (n.y - nodes[i].y) ** 2 + (n.z - nodes[i].z) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      edges.push({ a: best, b: i, birth: t });
      // one extra cross-link now and then: real networks are not trees
      if (i > 3 && rand() < 0.34) {
        const other = Math.floor(rand() * (i - 1));
        if (other !== best) edges.push({ a: other, b: i, birth: t + 0.02 });
      }
    }
  }
  return { nodes, edges };
}

export function createConsultNetwork({ style = 'line' } = {}) {
  const root = new Group();
  const { nodes, edges } = buildGraph();
  const solid = style === 'solid';

  /* ── EDGES ──
     One LineSegments for the whole graph in line mode: two vertices per edge,
     and growth is written into the vertex positions (the child end travels out
     from its parent), so a connection REACHES rather than blinks on. */
  const edgePos = new Float32Array(edges.length * 6);
  const edgeGeom = new BufferGeometry();
  edgeGeom.setAttribute('position', new BufferAttribute(edgePos, 3));
  const edgeMat = new LineBasicMaterial({
    color: 0xbaffe4,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const edgeLines = new LineSegments(edgeGeom, edgeMat);
  edgeLines.frustumCulled = false;
  edgeLines.renderOrder = 3;

  /* solid mode draws each edge as a thin tube instead */
  const tubes = [];
  const tubeMat = solid
    ? new MeshStandardMaterial({
      color: 0x9dffd2, emissive: 0x2fe392, emissiveIntensity: 2.2,
      roughness: 0.45, metalness: 0.15, transparent: true, opacity: 0,
    })
    : null;
  if (solid) {
    const tubeGeom = new CylinderGeometry(0.028, 0.028, 1, 6, 1, true);
    edges.forEach(() => {
      const m = new Mesh(tubeGeom, tubeMat);
      m.renderOrder = 3;
      root.add(m);
      tubes.push(m);
    });
  } else {
    root.add(edgeLines);
  }

  /* ── NODES ── */
  const nodeMeshes = [];
  const nodeGeom = new SphereGeometry(1, solid ? 16 : 8, solid ? 12 : 6);
  const nodeMat = solid
    ? new MeshStandardMaterial({
      color: 0xf2fffa, emissive: 0x6dffb8, emissiveIntensity: 2.4,
      roughness: 0.30, metalness: 0.35, transparent: true, opacity: 0,
    })
    : new MeshBasicMaterial({
      color: 0xf2fffa, transparent: true, opacity: 0,
      depthWrite: false, blending: AdditiveBlending,
    });
  nodes.forEach(() => {
    const m = new Mesh(nodeGeom, nodeMat);
    m.renderOrder = 4;
    root.add(m);
    nodeMeshes.push(m);
  });

  /* Solid mode needs light. Safe to add: every other material in this scene
     is MeshBasic and ignores lights entirely, so nothing else can change. */
  const lights = [];
  if (solid) {
    const key = new PointLight(0xd8ffe9, 26, 14);
    key.position.set(2.4, 2.6, 3.0);
    const rim = new PointLight(0x2fe392, 34, 14);
    rim.position.set(-2.6, -0.6, -2.2);
    lights.push(key, rim);
    lights.forEach((l) => root.add(l));
  }

  const tmpA = { x: 0, y: 0, z: 0 };

  /**
   * @param grow  0..1 scroll-driven growth — fully reversible
   * @param time  seconds, for the breathing that never stops
   * @param fade  0..1 master visibility (the act's own fades)
   */
  function update(grow, time, fade = 1) {
    const g = grow < 0 ? 0 : grow > 1 ? 1 : grow;
    const vis = g > 0.001 && fade > 0.001;
    root.visible = vis;
    if (!vis) return;

    // nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const m = nodeMeshes[i];
      // born? a short ease so it swells in rather than popping
      const born = (g - n.birth) / 0.09;
      const b = born <= 0 ? 0 : born >= 1 ? 1 : born * born * (3 - 2 * born);
      if (b <= 0.001) { m.visible = false; continue; }
      m.visible = true;
      // breathing: a slow drift plus a brightness pulse, each on its own phase
      const br = 0.5 + 0.5 * Math.sin(time * 0.9 + n.phase);
      const dx = Math.sin(time * 0.42 + n.phase) * 0.045;
      const dy = Math.cos(time * 0.37 + n.phase * 1.3) * 0.045;
      m.position.set(n.x + dx, n.y + dy, n.z);
      const s = (0.082 + 0.038 * br) * b;
      m.scale.setScalar(s);
      tmpA.x = i; // (kept: per-node work stays in this loop)
    }
    nodeMat.opacity = (solid ? 1 : 0.95) * fade;
    if (solid) nodeMat.emissiveIntensity = 1.3 + 0.5 * Math.sin(time * 1.1);

    // edges — the child end travels out from the parent as it is born
    if (solid) {
      for (let e = 0; e < edges.length; e++) {
        const ed = edges[e];
        const A = nodeMeshes[ed.a].position;
        const B = nodeMeshes[ed.b].position;
        const t = (g - ed.birth) / 0.12;
        const k = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        const mesh = tubes[e];
        if (k <= 0.01) { mesh.visible = false; continue; }
        mesh.visible = true;
        const ex = A.x + (B.x - A.x) * k;
        const ey = A.y + (B.y - A.y) * k;
        const ez = A.z + (B.z - A.z) * k;
        mesh.position.set((A.x + ex) / 2, (A.y + ey) / 2, (A.z + ez) / 2);
        const len = Math.hypot(ex - A.x, ey - A.y, ez - A.z) || 0.0001;
        mesh.scale.set(1, len, 1);
        mesh.lookAt(ex, ey, ez);
        mesh.rotateX(Math.PI / 2);
      }
      tubeMat.opacity = 0.9 * fade;
    } else {
      let w = 0;
      for (let e = 0; e < edges.length; e++) {
        const ed = edges[e];
        const A = nodeMeshes[ed.a].position;
        const B = nodeMeshes[ed.b].position;
        const t = (g - ed.birth) / 0.12;
        const k = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        edgePos[w++] = A.x; edgePos[w++] = A.y; edgePos[w++] = A.z;
        edgePos[w++] = A.x + (B.x - A.x) * k;
        edgePos[w++] = A.y + (B.y - A.y) * k;
        edgePos[w++] = A.z + (B.z - A.z) * k;
      }
      edgeGeom.attributes.position.needsUpdate = true;
      // the whole web breathes together, gently
      edgeMat.opacity = (0.82 + 0.12 * Math.sin(time * 0.8)) * fade;
    }
  }

  function dispose() {
    nodeGeom.dispose();
    nodeMat.dispose();
    edgeGeom.dispose();
    edgeMat.dispose();
    if (tubeMat) tubeMat.dispose();
    tubes.forEach((t) => t.geometry.dispose());
  }

  return { root, update, dispose };
}
