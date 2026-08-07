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
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BufferAttribute,
  BufferGeometry, CatmullRomCurve3, Color, DirectionalLight, Group,
  PerspectiveCamera, Points, PointsMaterial, PointLight, Scene, Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const OMEGA = 0.14;                 // rad/s ≈ 37 px/s at the module ring
// The standalone's pose, verbatim (its config.js: dist 30, lookOffset
// [-1.55, 0.1, 0]). Yash: the entry ANGLE was wrong — the site had pushed the
// ship far to the right of frame and started 46 units out, so the flight
// began off-axis and distant. This is the framing the reference flies from.
/* Resting framing: Yash wants the Endurance parked small in the BOTTOM-RIGHT
   corner. Derived, not guessed — the ship sits at the world origin, so its
   screen position is the angle between the view axis and the origin:
     x offset = atan(-LOOK[0] / dist) / (hFov/2) * 0.5
     y offset = atan( LOOK[1] / dist) / (vFov/2) * 0.5
   and its radius scales as 1/dist. Solving for ~82% / ~76% of the frame at
   ~7% of the width gives these. The flight still departs from here, so the
   rail's opening waypoints will want re-checking after any change. */
/* Turned so the DOCKING PORT faces the camera. The port sits on the hub's
   spin axis (local +Y); tilting the ship back toward the viewer aims that
   axis at us, so the last stretch of the flight is a straight run into the
   airlock instead of a curve around to find it. Yash: "we do not have to
   curve while entering it". */
/* Inverted, per Yash's pick from the four rendered variants (B): the ship is
   turned over so the hub's spine points up and toward the viewer with the
   ring below it. This is the RESTING orientation — it is how the Endurance
   sits before anything happens, not something the flight does to it. */
const POSE = { tiltX: 1.52, tiltZ: 0.30, dist: 81 };
/* Pose overrides via the query string, so orientation can be compared side by
   side without an edit-and-reload for each variant: ?tiltX=&tiltY=&tiltZ=&dist= */
if (typeof location !== "undefined") {
  const q = new URLSearchParams(location.search);
  for (const key of ["tiltX", "tiltZ", "dist"]) {
    if (q.has(key)) POSE[key] = parseFloat(q.get(key));
  }
  POSE.tiltY = q.has("tiltY") ? parseFloat(q.get("tiltY")) : 0;
}
const LOOK = [-20.5, 8.85, 0];
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
  const innerGlow = new PointLight(new Color(1.0, 0.76, 0.46), 0, 6, 2);
  innerGlow.position.set(0, 0, -0.25);
  airlock.add(innerGlow);
  const leaves = [];

  /* Motion parallax — what makes YOU the one travelling.
     With nothing in frame but a distant hole and the ship, a growing
     silhouette reads as the ship coming at you: there is no near reference to
     move past. These motes sit STILL in world space along the flight
     corridor, so the camera sweeps through them and they stream out past the
     frame edges. Static points, moving camera — the parallax is real. */
  const MOTES = 900;
  const motePos = new Float32Array(MOTES * 3);
  const motes = new Points(
    new BufferGeometry().setAttribute("position", new BufferAttribute(motePos, 3)),
    new PointsMaterial({
      color: new Color(0.82, 0.86, 1.0), size: 0.08, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending,
    }));
  motes.frustumCulled = false;
  scene.add(motes);
  let motesPlaced = false;

  /** Scatter the motes through a tube joining the orbit framing to the dock. */
  function placeMotes(from, to) {
    const along = to.clone().sub(from);
    const len = along.length() || 1;
    const dir = along.clone().divideScalar(len);
    const side = new Vector3(0, 1, 0).cross(dir).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    const up = dir.clone().cross(side).normalize();
    for (let i = 0; i < MOTES; i++) {
      // biased toward the corridor's centre so the streaming reads as depth
      const t = Math.random();
      const r = (2.5 + 9 * Math.random() ** 1.6);
      const a = Math.random() * Math.PI * 2;
      const p = from.clone()
        .addScaledVector(dir, t * len * 1.06 - len * 0.03)
        .addScaledVector(side, Math.cos(a) * r)
        .addScaledVector(up, Math.sin(a) * r);
      motePos[i * 3] = p.x; motePos[i * 3 + 1] = p.y; motePos[i * 3 + 2] = p.z;
    }
    motes.geometry.attributes.position.needsUpdate = true;
  }

  let ready = false;
  let emissives = [];
  /* The black hole lives on ANOTHER canvas (the site's own beat), so it does
     not share this camera. Left alone it stays nailed to the screen while the
     flight turns and travels — which is exactly why the approach read as "the
     ship comes to me": the one far reference in frame never moved. We publish
     the camera's turn each frame and the caller shifts that canvas to match. */
  const bgShift = { x: 0, y: 0 };
  let lastYaw = null, lastPitch = null, turnYaw = 0, turnPitch = 0;
  /* What the flight camera is looking at, in the black-hole engine's own
     terms. The engine takes yaw/pitch/distance rather than a matrix, so this
     is the handshake that lets the hole be rendered from where we actually
     are — instead of sitting still on a separate canvas while we travel. */
  const view = { yaw: 0, pitch: 0, distMul: 1 };
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
      spinGroup.add(gltf.scene);
      ready = true;   // visibility is the owner's call, not the loader's
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

      /* Motes fill the corridor between the orbit framing and the dock the
         first time a flight begins, then fade in only while travelling —
         they are a cue for motion, so they have no business being visible
         while the ship simply hangs there. */

      motes.material.opacity = 0.9 * smoothstep(0.02, 0.16, flyIn) *
                                     (1 - smoothstep(0.86, 0.97, flyIn));

      // Airlock: leaves retract, then the interior light escapes
      // The port "opens": interior light grows on final approach and washes
      // the hull around the dock just before the hold.
      const iris = smoothstep(IRIS_FROM, 0.93, flyIn);
      innerGlow.intensity = iris * 14;

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
        POSE.tiltX + bank[0] * damp,
        (POSE.tiltY || 0) + bank[1] * damp,
        POSE.tiltZ);
      spinGroup.rotation.y = spin;
      shipParent.updateMatrixWorld(true);

      const fit = Math.min(Math.max(1.45 / camera.aspect, 1), 1.9);
      /* ── COPIED VERBATIM from the standalone module (~/claude code/endurance,
         src-three/main.js). Yash: "make it exactly like that: the movement and
         all". Every constant below is that file's, not a re-derivation — the
         waypoints, the pow(0.62) rail easing, the dock on the hub's fore port,
         the roll, the target lerp. The only site-specific part is the starting
         framing, which stays the finale's own (hole centre, ship beside it). */
      const orbitEye = new Vector3(parallax[0] * damp, parallax[1] * damp, POSE.dist * fit);
      const orbitLook = new Vector3(LOOK[0] / fit, LOOK[1], LOOK[2]);

      if (flyIn <= 0.02) {
        camera.up.set(0, 1, 0);
        camera.position.copy(orbitEye);
        camera.lookAt(orbitLook);
      } else {
        // Dock at the hub spine's fore port — an on-axis point, so the ship's
        // spin rolls it in place instead of sweeping it away from the camera
        const dock = spinGroup.localToWorld(new Vector3(0, 1.62, 0));
        const axis = new Vector3(0, 1, 0).applyQuaternion(shipParent.quaternion).normalize();
        // Ring sweep stays on screen for most of the flight; the close-in to
        // the featureless spine happens late, under the dock flash
        const lat = new Vector3(1, 0, 0).applyQuaternion(shipParent.quaternion);
        /* The reference's waypoints were absolute, and tuned for its start at
           dist 30. Now that the resting framing parks the ship in the corner
           at dist 81, those points sit almost on top of the ship — the flight
           would jump most of the way in on its first stride. So they are
           expressed as FRACTIONS of the reference's own start distance and
           scaled to ours: identical curve shape, just begun from further out.
           The last two stay dock-relative, because they are the approach to
           the port and belong in ship units, not camera ones. */
        /* Curve early, then dead straight in. The last three points all sit
           ON the port's own axis, so once the camera lines up it runs at the
           airlock in a straight line — a CatmullRom through collinear points
           IS a straight segment. The lateral offsets that used to be here are
           exactly what made the entry swing sideways. */
        const k = POSE.dist / 30;
        const curve = new CatmullRomCurve3([
          orbitEye,
          /* Curve OUT before closing, so the ship is seen from changing
             angles rather than growing on a straight line. Expressed off the
             port's own axis rather than in world space, so it follows the
             ship's orientation: with a world-space point, changing the
             resting pose could swing this waypoint inside the hull. */
          dock.clone().addScaledVector(axis, 22 * k)
            .addScaledVector(lat, -9.5 * k)
            .add(new Vector3(0, 3.4 * k, 0)),
          dock.clone().addScaledVector(axis, 15),
          dock.clone().addScaledVector(axis, 6),
          dock.clone().addScaledVector(axis, 1.25),
        ]);
        // Gentle departure (smoothstep) then a LONG deceleration into the dock:
        // pow < 1 spends most of the travel early and crawls the last stretch,
        // so arrival reads as slowing down, not as a jump cut.
        const e = Math.pow(smoothstep(0.02, 0.88, flyIn), 0.62);
        const eye = curve.getPoint(e);
        /* THE TELEPORT, and its cause. The reference lerped the look target
           from the SHIP'S CENTRE to the dock, which was harmless there
           because its resting camera already looked almost at the ship. Ours
           rests looking far off it — that is what parks the Endurance in the
           corner — so starting the lerp at the ship's centre re-aimed the
           camera on the first frame of the flight and the ship snapped to
           the middle of frame. It read as the ship teleporting in.

           The aim now starts exactly where it rests and eases across, so the
           Endurance drifts out of the corner as you close on it, and is
           centred by the docking approach. No frame ever jumps. */
        const target = new Vector3()
          .lerpVectors(orbitLook, shipParent.position, smoothstep(0, 0.45, e))
          .lerp(dock, smoothstep(0.45, 0.85, e));
        const roll = 0.35 * smoothstep(0.55, 1, e);
        camera.up.set(Math.sin(roll), Math.cos(roll), 0);
        camera.position.copy(eye);
        camera.lookAt(target);
      }
      camera.updateProjectionMatrix();

      /* How far the camera has TURNED since the orbit framing, in screen
         pixels. A distant object subtends the same angle wherever you stand,
         so rotation — not translation — is what sweeps it across frame; that
         is the honest parallax for something effectively at infinity, and it
         is the cue that was missing.

         Two things this needs to survive:
         · the arc turns through more than 180°, so the raw yaw wraps and the
           background would teleport. Accumulate the per-frame delta instead
           of differencing absolute angles.
         · at full gain the hole leaves frame within a second and the rest of
           the flight has no landmark at all. GAIN keeps it drifting across
           and out over several seconds, which is what reads as travel. */
      {
        const f = new Vector3();
        camera.getWorldDirection(f);
        const yaw = Math.atan2(f.x, f.z);
        const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
        if (flyIn <= 0.001 || lastYaw === null) {
          lastYaw = yaw; lastPitch = pitch; turnYaw = 0; turnPitch = 0;
        } else {
          let d = yaw - lastYaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          turnYaw += d;
          turnPitch += pitch - lastPitch;
          lastYaw = yaw; lastPitch = pitch;
        }
        const vFov = (camera.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
        /* Capped well inside the canvas's own margin: the beat canvas is only
           viewport-sized, so every pixel of drift reveals its edge. Scaling it
           1.5x during the flight buys 0.25 screens of margin, and the cap sits
           under that. The drift does not need to be physically complete — it
           needs to be SEEN, and ~0.2 screens over a few seconds plainly is. */
        const GAIN = 0.42;
        const capX = w * 0.2, capY = h * 0.2;
        bgShift.x = Math.max(-capX, Math.min(capX, -(turnYaw / hFov) * w * GAIN));
        bgShift.y = Math.max(-capY, Math.min(capY, (turnPitch / vFov) * h * GAIN));

        /* The same turn, handed to the black-hole engine. Its camera orbits a
           fixed centre, so our travel maps to its yaw/pitch; distance grows a
           little as we leave, which is what pulls the hole away behind us. */
        view.yaw = turnYaw * 0.85;
        view.pitch = Math.max(-0.5, Math.min(0.5, turnPitch * 0.7));
        view.distMul = 1 + 0.55 * smoothstep(0, 0.9, flyIn);
      }

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
    /** Pixels the far background must move so it tracks the camera's turn. */
    backgroundShift() { return bgShift; },
    /** The flight camera expressed for the black-hole engine. */
    skyView() { return view; },
    state() {
      return { ready, spin, hover: hoverEased, flyIn, bgShift: { ...bgShift },
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
