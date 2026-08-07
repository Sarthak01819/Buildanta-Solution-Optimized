/**
 * The Endurance, orbiting beside Gargantua in the finale.
 *
 * A transparent three.js layer over the black-hole canvas: the hole keeps
 * rendering underneath, the ship is lit as if by its accretion disk. Ported
 * from ~/claude code/endurance (SPEC.md there is canonical); the motion
 * constants are the measured ones — ring spin is calibrated in ON-SCREEN
 * px/s, not radians, or a "moving" ship reads as a photograph.
 *
 * Model: devPilot's CC-BY Endurance, Draco-compressed. Loaded lazily on the
 * caller's word — 4.1MB must never be part of first paint.
 */
import {
  ACESFilmicToneMapping, AmbientLight, Box3, CatmullRomCurve3, Color,
  DirectionalLight, Group, PerspectiveCamera, PointLight, Scene, Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const OMEGA = 0.14;                 // rad/s ≈ 37 px/s at the module ring
const POSE = { tiltX: -0.80, tiltZ: 0.45, dist: 46 };
const PARALLAX = [0.55, 0.34];
const BANK = { maxYaw: 0.16, maxPitch: 0.10, easeIn: 2.4, easeOut: 0.9 };
const HOVER = { radiusFactor: 1.18, spinBoost: 1.6, easeIn: 3.0, easeOut: 0.8 };
const HOLD_AT = 0.86;     // travel at which the camera reaches the hatch
const HOLD_GAP = 0.85;    // how far in front of the hatch it stops
const IRIS_FROM = 0.62;   // the leaves start parting on final approach

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function createShip(host, { reducedMotion = false, lite = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "finale-ship";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;" +
    "pointer-events:none;opacity:0;transition:opacity .6s ease;";
  host.appendChild(canvas);

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    canvas.remove();
    return null;
  }
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, 0.1, 400);

  // Warm-but-white key from the hole's side; a fully warm key creams the hull
  const key = new DirectionalLight(new Color(1.0, 0.84, 0.64), 3.6);
  key.position.set(-9, 1.8, 4);
  const fill = new DirectionalLight(new Color(0.35, 0.45, 0.68), 0.85);
  fill.position.set(7, -3, -6);
  scene.add(key, key.target, fill, new AmbientLight(new Color(0.45, 0.5, 0.62), 0.34));

  const shipParent = new Group();
  const spinGroup = new Group();
  shipParent.add(spinGroup);
  scene.add(shipParent);

  /* The airlock. Built as geometry on the hub's fore port so it reads as a
     door opening, not as a lens effect: a ring collar, six iris leaves that
     retract, and a warm light that only escapes once they part. */
  const AIRLOCK_Y = 1.62;           // the dock point, ON the spin axis
  const airlock = new Group();
  airlock.position.set(0, AIRLOCK_Y, 0);
  airlock.rotation.x = -Math.PI / 2;          // face along +Y
  spinGroup.add(airlock);

  /* LIGHT ONLY, for now. A hand-built iris was tried twice here and read as
     a wedge fan, then as a washer: a hatch seen head-on at half a metre needs
     real modelled depth, exactly like the ship itself did. Until that asset
     exists this is the interior light escaping the port as it opens — which
     is what the bloom and the hold are already selling. The mount point and
     the `iris` ramp below stay, so dropping a modelled hatch in is a
     parent-and-animate, not a rewrite. */
  const innerGlow = new PointLight(new Color(1.0, 0.76, 0.46), 0, 2.2, 2);
  innerGlow.position.set(0, 0, -0.25);
  airlock.add(innerGlow);
  const leaves = [];

  let ready = false;
  let emissives = [];
  const doors = [];            // the model's own airlock leaves
  let portDoors = [];          // the ones on the port we dock at
  let portLocal = null;        // that port's position, in ship-local space
  const cursor = { has: false, x: 0, y: 0 };
  let hoverEased = 0, spin = 0, t = 0, flyIn = 0;
  const parallax = [0, 0], bank = [0, 0];
  const metrics = { centerPx: [0, 0], radiusPx: 1 };
  let size = [0, 0];

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("/assets/draco/");
  loader.setDRACOLoader(draco);

  function load() {
    if (ready || load.started) return;
    load.started = true;
    const url = lite ? "/assets/endurance/endurance-hifi-lite.glb"
                     : "/assets/endurance/endurance-hifi.glb";
    loader.load(url, (gltf) => {
      const seen = new Set();
      gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.material || seen.has(o.material.uuid)) return;
        seen.add(o.material.uuid);
        const m = o.material;
        // Any emissive material is a "window" — the model's own naming is
        // not ours to rely on
        if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) {
          m.userData.baseEm = m.emissiveIntensity || 1;
          emissives.push(m);
        }
      });
      /* The model ships its own airlock: seven `Doors` objects and modelled
         `DockingHub_Port` geometry (devPilot even names a `RollingShuttle`
         material). Animating the artist's doors beats hand-building an iris —
         two attempts at that read as a wedge fan and a washer. Node
         translations are all zero (Sketchfab bakes transforms into the
         vertices), so positions come from geometry bounding boxes. */
      const localOf = (o) => {
        o.geometry.computeBoundingBox();
        const c = o.geometry.boundingBox.getCenter(new Vector3());
        return o.localToWorld(c.clone());        // world == ship-local here
      };
      const ports = [];
      gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const n = `${o.name} ${o.parent?.name || ""}`;
        if (/^Doors|Doors\./.test(n)) {
          const c = localOf(o);
          doors.push({ mesh: o, home: o.position.clone(), centre: c });
        } else if (/DockingHub_Port/.test(n)) {
          ports.push({ mesh: o, centre: localOf(o) });
        }
      });
      // the port the flight aims at: the one furthest along the spin axis
      if (ports.length) {
        ports.sort((a, b) => b.centre.y - a.centre.y);
        portLocal = ports[0].centre.clone();
        airlock.position.copy(portLocal);
      }
      // doors that belong to THAT port travel with it
      const near = doors.filter((d) => d.centre.distanceTo(portLocal ?? new Vector3()) < 3.2);
      portDoors = near.length ? near : doors;

      spinGroup.add(gltf.scene);
      ready = true;   // visibility is the owner's call, not the loader's
      if (typeof window !== "undefined") {
        window.__ship = {
          doors: portDoors.length, allDoors: doors.length,
          port: portLocal ? portLocal.toArray().map((v) => +v.toFixed(2)) : null,
          doorPos: () => portDoors.map((d) => +d.mesh.position.length().toFixed(3)),
        };
      }
    }, undefined, () => { canvas.remove(); });
  }

  function resize(w, h, dpr) {
    if (w === size[0] && h === size[1]) return;
    size = [w, h];
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    canvas,
    load,
    get ready() { return ready; },
    setCursor(nx, ny) { cursor.has = nx !== null; if (nx !== null) { cursor.x = nx; cursor.y = ny; } },
    /** 0 = orbiting beside the hole, 1 = docked at the hub's fore port */
    setFlyIn(v) { flyIn = Math.min(1, Math.max(0, v)); },
    tick(dt) {
      if (!ready) return;
      const w = host.clientWidth || innerWidth;
      const h = host.clientHeight || innerHeight;
      resize(w, h, Math.min(devicePixelRatio || 1, lite ? 1 : 1.5));
      if (!reducedMotion) t += dt;

      // hover: cursor inside the ship's projected disc
      let hoverTarget = 0;
      if (cursor.has && flyIn < 0.2) {
        const cx = (cursor.x * 0.5 + 0.5) * w;
        const cy = (cursor.y * 0.5 + 0.5) * h;
        if (Math.hypot(cx - metrics.centerPx[0], cy - metrics.centerPx[1]) <
            metrics.radiusPx * HOVER.radiusFactor) hoverTarget = 1;
      }
      hoverEased = ease(hoverEased, hoverTarget,
        hoverTarget > hoverEased ? HOVER.easeIn : HOVER.easeOut, dt);
      /* The ring eases to a halt as you close — the ship matching you for
         docking — so the frame is settled before the room takes over. */
      const spinHold = 1 - smoothstep(0.25, HOLD_AT, flyIn);
      if (!reducedMotion) {
        spin += OMEGA * (1 + hoverEased * (HOVER.spinBoost - 1)) * spinHold * dt;
      }

      // Airlock: leaves retract, then the interior light escapes
      /* The airlock opens: the model's own door leaves retract outward from
         the port's centre, and the interior light escapes behind them. */
      const iris = smoothstep(IRIS_FROM, 0.93, flyIn);
      for (const d of portDoors) {
        const dir = d.centre.clone().sub(portLocal || d.centre);
        if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
        dir.normalize();
        d.mesh.position.copy(d.home).addScaledVector(dir, iris * 0.62);
      }
      innerGlow.intensity = iris * 3.2;

      // rails take over on approach — drift/parallax/bank fade out
      const damp = 1 - smoothstep(0, 0.30, flyIn);
      const px = cursor.has ? cursor.x * PARALLAX[0] : 0;
      const py = cursor.has ? -cursor.y * PARALLAX[1] : 0;
      parallax[0] = ease(parallax[0], px, 3.2, dt);
      parallax[1] = ease(parallax[1], py, 3.2, dt);
      const rate = cursor.has ? BANK.easeIn : BANK.easeOut;
      bank[0] = ease(bank[0], cursor.has ? cursor.y * BANK.maxPitch : 0, rate, dt);
      bank[1] = ease(bank[1], cursor.has ? cursor.x * BANK.maxYaw : 0, rate, dt);

      shipParent.rotation.set(
        POSE.tiltX + bank[0] * damp, bank[1] * damp, POSE.tiltZ);
      spinGroup.rotation.y = spin;
      shipParent.updateMatrixWorld(true);

      const fit = Math.min(Math.max(1.45 / camera.aspect, 1), 1.9);
      // Beside the hole, not on it: Gargantua owns the centre, so the eye
      // and its look target are pushed far apart on X to throw the ship out
      // to the right of frame.
      const orbitEye = new Vector3(parallax[0] * damp - 2.6, parallax[1] * damp + 1.4, POSE.dist * fit);
      const orbitLook = new Vector3(-10.8 / fit, 1.7, 0);

      if (flyIn <= 0.001) {
        camera.up.set(0, 1, 0);
        camera.position.copy(orbitEye);
        camera.lookAt(orbitLook);
      } else {
        /* The dock is ON the spin axis (the hub's fore port) so the ring's
           rotation rolls it in place instead of sweeping it out of frame.
           The path ARCS around to meet it from the black hole's side: a
           straight line from the orbit framing drills through a module and
           the camera ends up inside dark hull — that was the roughness Yash
           saw. Waypoints are built in the ship's own frame so they follow
           its tilt. */
        /* Dock at the MODEL'S OWN port (found at load), not a guessed point —
           the doors and the interior light live there. The approach runs
           along the port's own outward normal, i.e. from the hub through it. */
        const dockLocal = portLocal || new Vector3(0, AIRLOCK_Y, 0);
        const dock = spinGroup.localToWorld(dockLocal.clone());
        const outward = dockLocal.clone();
        if (outward.lengthSq() < 1e-6) outward.set(0, 1, 0);
        outward.normalize();
        const axis = outward.clone().applyQuaternion(shipParent.quaternion).normalize();
        // any two vectors perpendicular to the approach, for the arc's width
        const lat = new Vector3(0, 1, 0).cross(axis).normalize();
        if (lat.lengthSq() < 1e-6) lat.set(1, 0, 0);
        const up = axis.clone().cross(lat).normalize();

        const path = new CatmullRomCurve3([
          orbitEye,
          // swing wide and rise, keeping the whole ship in shot
          dock.clone().addScaledVector(axis, 15).addScaledVector(lat, 12).addScaledVector(up, 3),
          // come round to the lit side, ship filling the frame
          dock.clone().addScaledVector(axis, 8).addScaledVector(lat, 3.5).addScaledVector(up, 1.2),
          // line up on the hatch
          dock.clone().addScaledVector(axis, 3.2),
          // the hold position, a beat in front of the open airlock
          dock.clone().addScaledVector(axis, HOLD_GAP),
        ]);
        path.curveType = "catmullrom";
        path.tension = 0.4;

        // travel is already shaped by the caller — consume it linearly, and
        // spend the last stretch holding rather than moving
        const e = Math.min(1, flyIn / HOLD_AT);
        const eye = path.getPoint(e);
        const target = new Vector3().lerpVectors(orbitLook, dock, smoothstep(0.10, 0.62, e));
        const roll = 0.30 * smoothstep(0.55, 1, e);
        camera.up.set(Math.sin(roll), Math.cos(roll), 0);
        camera.position.copy(eye);
        camera.lookAt(target);
      }
      camera.updateProjectionMatrix();

      // Window emissive must sit BELOW the ACES knee or the rows clip to
      // white pinpricks and the hover lift becomes invisible
      for (const m of emissives) {
        m.emissiveIntensity = m.userData.baseEm * (0.28 + 0.6 * hoverEased);
      }
      key.intensity = 3.6 * (1 + 0.22 * hoverEased);

      // screen metrics for the hover test
      const c = new Vector3();
      shipParent.getWorldPosition(c);
      const proj = c.clone().project(camera);
      metrics.centerPx = [(proj.x * 0.5 + 0.5) * w, (1 - (proj.y * 0.5 + 0.5)) * h];
      let r = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const p = new Vector3(4.6 * Math.cos(a), 0, 4.6 * Math.sin(a));
        spinGroup.localToWorld(p).project(camera);
        const pp = [(p.x * 0.5 + 0.5) * w, (1 - (p.y * 0.5 + 0.5)) * h];
        r = Math.max(r, Math.hypot(pp[0] - metrics.centerPx[0], pp[1] - metrics.centerPx[1]));
      }
      metrics.radiusPx = r;

      renderer.render(scene, camera);
    },
    state() {
      return { ready, spin, hover: hoverEased, flyIn,
               centerPx: [...metrics.centerPx], radiusPx: metrics.radiusPx,
               pxPerSec: OMEGA * metrics.radiusPx };
    },
    dispose() {
      renderer.dispose();
      draco.dispose?.();
      canvas.remove();
    },
  };
}
