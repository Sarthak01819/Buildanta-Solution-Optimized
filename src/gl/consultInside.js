/**
 * WHAT LIVES INSIDE THE WE SCALE GLOBE — three candidates, one scaffold.
 *
 * ── THE CONSTRAINT I MISSED FIRST TIME ──
 * The site spec, ACT 04 step 6: "Each landed bird becomes part of a growing
 * plant inside the globe." The object is not decoration — it is the PAYOFF of
 * a mechanic. Money notes orbit, become paper birds, land, and each landing
 * builds the thing. The message is: your revenue becomes what grows.
 *
 * My first attempt (consultNetwork.js) ignored that: notes flew in and joined
 * an abstract graph they had no relationship to, so it conveyed nothing — which
 * is exactly what Yash said. Every candidate here is BUILT BY THE ARRIVALS:
 * piece N appears when note N lands, in the order they land.
 *
 * All three are line-work, because the globe is line-work and the old plant was
 * a photograph pasted into a diagram. They differ in MEANING and SILHOUETTE,
 * which is the actual choice:
 *
 *   city   — each note becomes a tower. "We build the systems businesses run
 *            on." Revenue becomes infrastructure.
 *   tree   — each note becomes a branch. Keeps the approved growth metaphor,
 *            drawn in light instead of modelled. Revenue compounds.
 *   engine — each note becomes a ring that starts turning. Revenue becomes a
 *            system that runs.
 *
 * Motion is both, per Yash: growth follows scroll and reverses with it, and
 * what has already been built keeps breathing on its own clock.
 */
import {
  Group, BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial,
  AdditiveBlending,
} from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

const R = 2.75;      // inside the globe's 3.27 shell
const PIECES = 18;   // city/tree/engine: one per arrival

/* Each form returns segments: [{ ax,ay,az, bx,by,bz, piece }] where `piece` is
   which arrival owns that line, so growth is one shared code path. */

function cityForm() {
  const rand = rng(4711);
  const segs = [];
  for (let i = 0; i < PIECES; i++) {
    // towers on rings, tallest toward the middle — a skyline, not a grid
    const ring = i < 6 ? 0 : i < 13 ? 1 : 2;
    const idxInRing = i - (ring === 0 ? 0 : ring === 1 ? 6 : 13);
    const perRing = ring === 0 ? 6 : ring === 1 ? 7 : 5;
    const a = (idxInRing / perRing) * Math.PI * 2 + ring * 0.6;
    const rad = [0.55, 1.35, 2.05][ring];
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const w = 0.16 + rand() * 0.10;
    const h = (1.9 - ring * 0.42) * (0.55 + rand() * 0.75);
    const y0 = -R * 0.72;
    // four verticals + a cap: a tower reads with five lines
    const c = [[-w, -w], [w, -w], [w, w], [-w, w]];
    c.forEach(([dx, dz]) => segs.push({
      ax: x + dx, ay: y0, az: z + dz, bx: x + dx, by: y0 + h, bz: z + dz, piece: i,
    }));
    for (let k = 0; k < 4; k++) {
      const [dx, dz] = c[k], [ex, ez] = c[(k + 1) % 4];
      segs.push({ ax: x + dx, ay: y0 + h, az: z + dz, bx: x + ex, by: y0 + h, bz: z + ez, piece: i });
    }
  }
  return segs;
}

function treeForm() {
  const rand = rng(9012);
  const segs = [];
  const y0 = -R * 0.80;
  // trunk is arrival 0, then branches split — each arrival adds one generation
  const open = [{ x: 0, y: y0, z: 0, dx: 0, dy: 1, dz: 0, len: 0.95, gen: 0 }];
  let piece = 0;
  while (open.length && piece < PIECES) {
    const n = open.shift();
    const bx = n.x + n.dx * n.len, by = n.y + n.dy * n.len, bz = n.z + n.dz * n.len;
    segs.push({ ax: n.x, ay: n.y, az: n.z, bx, by, bz, piece });
    if (n.gen < 4) {
      for (let k = 0; k < 2; k++) {
        const sp = 0.55 + rand() * 0.35;
        const th = rand() * Math.PI * 2;
        open.push({
          x: bx, y: by, z: bz,
          dx: n.dx * 0.55 + Math.cos(th) * sp,
          dy: Math.max(0.35, n.dy * 0.88),
          dz: n.dz * 0.55 + Math.sin(th) * sp,
          len: n.len * 0.74, gen: n.gen + 1,
        });
      }
    }
    piece++;
  }
  return segs;
}

function engineForm() {
  const rand = rng(3355);
  const segs = [];
  for (let i = 0; i < PIECES; i++) {
    /* concentric rings on tilted planes — each arrival lays one down, and they
       counter-rotate, so the whole thing reads as machinery under power */
    const rad = 0.45 + (i / PIECES) * 2.05;
    const tilt = (rand() - 0.5) * 1.15;
    const yaw = rand() * Math.PI;
    const y = (rand() - 0.5) * 1.5;
    const N = 26;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const pt = (a) => {
        let px = Math.cos(a) * rad, pz = Math.sin(a) * rad, py = 0;
        const cy = Math.cos(tilt), sy = Math.sin(tilt);
        [py, pz] = [py * cy - pz * sy, py * sy + pz * cy];
        const cw = Math.cos(yaw), sw = Math.sin(yaw);
        [px, pz] = [px * cw - pz * sw, px * sw + pz * cw];
        return [px, py + y, pz];
      };
      const [ax, ay, az] = pt(a0), [bx, by, bz] = pt(a1);
      segs.push({ ax, ay, az, bx, by, bz, piece: i });
    }
  }
  return segs;
}


/* ── THE ARMILLARY SPHERE ──
   Decided after research, per Yash: no notes, no birds, a self-contained
   object. An armillary is the classical instrument for modelling a system you
   cannot see whole — Ptolemy's tool, the Renaissance navigator's tool. Beside
   a stoic emperor, inside a wireframe earth, on a fingertip, it argues: we
   model the system and we navigate it. It needs no caption, it is never still,
   and its rings rhyme with the accretion rings of the black hole that takes
   the frame moments later.

   Built from the REAL ring set of the instrument rather than random ellipses —
   that guesswork is exactly why the earlier "engine" read as a tangle. */
function armillaryForm() {
  const segs = [];
  const N = 84;                       // segments per ring: smooth at any size
  let piece = 0;

  /* A ring is a circle rotated by (tiltX, yawY) and lifted to `lift`.
     Small circles (tropics, polar circles) are narrower and offset in y, as on
     the instrument. */
  const ring = (radius, tiltX, yawY, lift) => {
    const pt = (a) => {
      let x = Math.cos(a) * radius, z = Math.sin(a) * radius, y = 0;
      const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      const cy = Math.cos(yawY), sy = Math.sin(yawY);
      [x, z] = [x * cy - z * sy, x * sy + z * cy];
      return [x, y + lift, z];
    };
    for (let k = 0; k < N; k++) {
      const [ax, ay, az] = pt((k / N) * Math.PI * 2);
      const [bx, by, bz] = pt(((k + 1) / N) * Math.PI * 2);
      segs.push({ ax, ay, az, bx, by, bz, piece });
    }
    piece++;
  };

  const E = 2.30;                     // the equatorial ring's radius
  const OB = 23.4 * Math.PI / 180;    // the obliquity of the ecliptic — real

  ring(E, 0, 0, 0);                              // equator
  ring(E, OB, 0.35, 0);                          // ecliptic, properly oblique
  ring(E, Math.PI / 2, 0, 0);                    // meridian
  ring(E, Math.PI / 2, Math.PI / 2, 0);          // solstitial colure
  ring(E * 0.917, 0, 0, E * 0.397);              // tropic of cancer
  ring(E * 0.917, 0, 0, -E * 0.397);             // tropic of capricorn
  ring(E * 0.397, 0, 0, E * 0.917);              // arctic circle
  ring(E * 0.397, 0, 0, -E * 0.917);             // antarctic circle

  // the polar axis, the thing every armillary turns on
  segs.push({ ax: 0, ay: -E * 1.16, az: 0, bx: 0, by: E * 1.16, bz: 0, piece });
  piece++;

  return segs;
}

export function createConsultInside({ form = 'city' } = {}) {
  const segs = form === 'armillary' ? armillaryForm()
    : form === 'tree' ? treeForm()
    : form === 'engine' ? engineForm() : cityForm();
  const root = new Group();
  const pieceCount = Math.max(1, segs.reduce((m, x) => Math.max(m, x.piece), 0) + 1);

  const pos = new Float32Array(segs.length * 6);
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(pos, 3));
  const mat = new LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, blending: AdditiveBlending,
  });
  const lines = new LineSegments(geom, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 4;
  root.add(lines);

  function update(grow, time, fade = 1) {
    const g = grow < 0 ? 0 : grow > 1 ? 1 : grow;
    root.visible = g > 0.001 && fade > 0.001;
    if (!root.visible) return;

    let w = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      // this piece's own arrival window — pieces land in order, like the notes
      const birth = s.piece / pieceCount;
      const k = ease((g - birth) / (1 / pieceCount + 0.06));
      // each line DRAWS itself from its start point: built, never blinked on
      const bx = s.ax + (s.bx - s.ax) * k;
      const by = s.ay + (s.by - s.ay) * k;
      const bz = s.az + (s.bz - s.az) * k;
      pos[w++] = s.ax; pos[w++] = s.ay; pos[w++] = s.az;
      pos[w++] = bx; pos[w++] = by; pos[w++] = bz;
    }
    geom.attributes.position.needsUpdate = true;

    // breathing: a slow live shimmer, and the engine keeps turning
    mat.opacity = (0.80 + 0.14 * Math.sin(time * 0.85)) * fade;
    if (form === 'armillary') {
      /* it turns on its axis, forever, and nods a few degrees as it breathes —
         an instrument under power, not a spinning ornament */
      root.rotation.y = time * 0.19;
      root.rotation.z = Math.sin(time * 0.23) * 0.075;
      root.rotation.x = 0.14 + Math.sin(time * 0.17) * 0.05;
    } else if (form === 'engine') root.rotation.y = time * 0.16;
    else root.rotation.y = Math.sin(time * 0.13) * 0.10;
  }

  function dispose() { geom.dispose(); mat.dispose(); }
  return { root, update, dispose };
}
