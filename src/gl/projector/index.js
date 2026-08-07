/**
 * ACT 03 — the projector, for real.
 *
 * A CC0 8mm filmstrip projector (Poly Haven, public domain) loaded as GLTF and
 * rigged to OUR film: the feed and take-up spools rotate by the exact distance
 * the strip travels, so when a plate parks in the gate the machine parks too.
 * Yash's sketch: the machine hangs high and behind, its cone falls forward onto
 * the strip in the lower third, and the plate in the light glows.
 *
 * Look: dark silhouette + glowing lens (his choice) — so the model is lit by
 * almost nothing except its own lamp.
 *
 * Everything about the light is DERIVED FROM THE MODEL, not hand-placed.
 * The first build hand-typed a lens position and a beam angle; on screen the
 * glow floated in mid-air below the machine and the cone pointed the wrong way
 * (the body was tilted lens-UP). Now the lens axis comes out of the geometry
 * and the machine is aimed by quaternion, so the light can never drift off the
 * thing that is supposed to be emitting it.
 *
 * Contract:
 *   const p = await createProjector(canvas);
 *   p.setFilm(pos)      // pos = continuous card position, from intro.js
 *   p.setPresence(a)    // 0..1, fades the whole machine with the act
 *   p.render(seconds)   // called from the ONE site ticker
 *   p.resize() / p.dispose()
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, AmbientLight, PointLight,
  Mesh, MeshBasicMaterial, SphereGeometry, ConeGeometry, CircleGeometry,
  ShaderMaterial, AdditiveBlending, Color, DoubleSide, MathUtils, Box3, Matrix4,
  Vector3, Quaternion,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL = "/assets/projector/filmstrip_projector_8mm_1k.gltf";

/* Where the lamp throws: down and toward the viewer, onto the strip in the
   lower third. The machine is rotated to match this — not the other way.
   Kept off vertical: aimed near-straight-down the body has to tip onto its
   nose, which reads as a machine that has fallen over rather than one hung
   and angled at the screen. */
const AIM = new Vector3(0.015, -0.78, 0.63).normalize();
const BEAM_RADIUS = 0.60;  // narrower now that it stops short of the film
/* The beam fades out JUST ABOVE the film, not on it. The canvas has to sit
   above the strip so the corner reel is visible at all (the strip's own black
   backing covers everything behind it, and there is only ~99px of clear
   viewport below it — nowhere near enough for the reel). With the canvas on
   top, a cone that reached the plates washed a bright blob across the two
   nearest the gate, which is precisely the failure M8 is about. The plate in
   the gate is lit by its own light pool, not by this cone — the cone is
   atmosphere, and atmosphere stops at the film. */
const BEAM_STOP_Y = 0.30;

/* ── the take-up reel, bottom-left (Yash, 7 Aug) ──
   The film that has been shown has to GO somewhere. It winds onto a spool in
   the corner, and that spool is the machine's own take-up part cloned and
   scaled up — same geometry, same material, genuinely the same equipment. */
/* Measured, not eyeballed: at this camera 1 world unit ≈ 219 screen px on a
   1440×900 frame. The centre is set so a FULL roll's top lands on the film's
   own line (648px) and its bottom still clears the viewport (885 < 900), and
   the hub is deliberately fat so an EMPTY spool's top is not so far below the
   film that the run-in reads as the strip falling off a shelf. */
const REEL_POS = new Vector3(-2.04, -0.85, 0.30);
const REEL_HUB_R = 0.21;   // the hollow core                   (≈ 46px)
const REEL_FULL_R = 0.55;  // the whole reel wound on        (≈ 120px)

const BEAM_VERT = `
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vPos = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/* A cone of light, faded so it has NO silhouette.
   The first version faded on uv.x — but on a cone uv.x runs around the
   circumference, so the fade peaked on the BACK of the cone and hit zero at
   the seam. That drew two hard vertical edges and the whole thing read as a
   grey wedge lying over the film. The honest fade is optical depth: a view ray
   through the middle of the cone passes through the most light, and at the
   silhouette it passes through none — which is exactly |dot(normal, view)|. */
const BEAM_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;
  uniform vec3  uCam;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vW;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    /* optical depth — kills the silhouette, so the cone has no edge at all */
    float facing = abs(dot(normalize(vN), normalize(uCam - vW)));
    float body = pow(facing, 1.45);

    /* along the cone: hot at the lens, gone before the open mouth so the beam
       never ends on a straight cut across the screen */
    /* gone well before the open mouth — left to fade at 0.99 the cone's far
       end read as a bright disc hanging in mid-air once the film had run out */
    float along = smoothstep(0.0, 0.09, vUv.y) * (1.0 - smoothstep(0.34, 0.82, vUv.y));
    float hot   = 1.0 - smoothstep(0.0, 0.32, vUv.y);   // flare right at the lamp

    /* dust: MOTES, not clouds — and few of them. The first build ran the noise
       at 3.2 across a cone 1.5 units wide, so each "mote" was half the beam:
       those were the grey blobs floating in the room. Cranked to 26 it went
       the other way and snowed. */
    float dust = noise(vPos * 21.0 + vec3(0.0, -uTime * 0.5, uTime * 0.2));
    dust = smoothstep(0.84, 1.0, dust);

    float a = body * along * (0.21 + hot * 0.26 + dust * 0.19) * uIntensity;
    gl_FragColor = vec4(uColor * (0.95 + dust * 0.5 + hot * 0.5), a);
  }
`;

/* The wound film itself: a disc whose radius grows as plates are consumed.
   Banded by radius so you can see it is COILED — a flat dark disc reads as a
   washer, and the whole point is that the roll is visibly thickening. */
const ROLL_VERT = `
  varying vec2 vXY;
  varying vec3 vN;
  void main() {
    vXY = position.xy;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ROLL_FRAG = `
  uniform float uHub;      // hollow core, as a fraction of the coil
  uniform float uTurn;
  uniform float uWraps;    // visible layers — grows as more film winds on
  uniform vec3  uLight;
  varying vec2 vXY;
  varying vec3 vN;

  void main() {
    vec2  q = vXY;
    float r = length(q);
    if (r > 1.0 || r < uHub) discard;      // outside the coil / inside the core
    float ang = atan(q.y, q.x) + uTurn;
    float span = max(1.0 - uHub, 1e-3);
    float t = (r - uHub) / span;           // 0 at the core, 1 at the outer wrap

    /* ── the coil: film wound on itself ──
       Each layer is dark stock with a bright line where the next wrap begins.
       That line is the whole trick: one flat disc is a washer, many visible
       layers is a roll of film. */
    float layer = t * uWraps;
    float f = fract(layer);
    float seam  = 1.0 - smoothstep(0.0, 0.34, min(f, 1.0 - f) * 2.0);
    /* SOLID stock. At 0.11 the layers read as a wireframe spirograph — the
       roll has to be a lump of material with lines in it, not lines alone. */
    /* contrast between wraps, not a uniform grey donut: film stock is dark and
       it is the highlight rolling over each layer that says "many wraps" */
    float stock = 0.24 + 0.22 * (0.5 + 0.5 * cos(f * 6.2831853));
    float shade = stock - seam * 0.19;

    /* ── the outer wrap carries the SPROCKET HOLES ──
       On a real roll you see the film's WIDTH on the outside of the coil, and
       that is the surface the perforations are punched through. The flat face
       shows only layer edges — putting holes across the whole disc would read
       as a doily, not as film. Hole pitch is set in ARC LENGTH, so the
       perforations stay the same physical size however big the roll gets. */
    float rimT = (t - 0.80) / 0.20;
    if (rimT > 0.0) {
      float rowDist = min(abs(rimT - 0.20), abs(rimT - 0.80));
      float row  = 1.0 - smoothstep(0.060, 0.100, rowDist);
      float hx   = abs(fract(ang * r / 0.085) - 0.5) * 2.0;
      float hole = 1.0 - smoothstep(0.38, 0.60, hx);
      /* the outer surface catches the room a little more than the face does */
      shade += 0.16 * smoothstep(0.0, 0.25, rimT) * (1.0 - smoothstep(0.75, 1.0, rimT));
      shade = mix(shade, 0.96, row * hole);
    }

    /* volume: a coil is a cylinder, so light it from one side rather than
       leaving it a flat cut-out */
    float lam = dot(normalize(q + vec2(1e-5)), normalize(vec2(0.55, 0.83)));
    shade *= 0.74 + 0.34 * (0.5 + 0.5 * lam);
    /* the core falls into shadow the way the inside of a roll does */
    shade *= 0.45 + 0.55 * smoothstep(0.0, 0.22, t);

    /* soft silhouette so the coil has no jagged edge at any size */
    float a = smoothstep(0.0, 0.012, 1.0 - r) * smoothstep(0.0, 0.010, r - uHub);
    gl_FragColor = vec4(uLight * shade, a);
  }
`;

export async function createProjector(canvas, opts = {}) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  /* We look UP at the machine, from below and in front — the seat-in-the-
     stalls angle. A level camera looked down onto its top plate, so the thing
     read as a box floating in the dark rather than a projector aimed at you;
     the lens is on the underside of a machine that is throwing light downward,
     so that is the face the audience has to be able to see. */
  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, -0.30, 6.4);
  camera.lookAt(0, 0.62, 0);

  /* almost no ambient: the machine is a silhouette, the lamp does the talking */
  scene.add(new AmbientLight(0x9fb4ff, 0.20));
  const rimA = new PointLight(0xa98bff, 7, 14, 2);   // cool edge from behind-left
  rimA.position.set(-3.0, 2.2, 0.4);
  const rimB = new PointLight(0xffd8a0, 3.2, 10, 2); // warm kick from its own lamp side
  rimB.position.set(1.6, 0.9, 1.6);
  scene.add(rimA, rimB);

  const rig = new Group();
  scene.add(rig);

  let gltf = null;
  try {
    gltf = await new GLTFLoader().loadAsync(MODEL);
  } catch (e) {
    renderer.dispose();
    throw e;
  }

  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && m.isMeshStandardMaterial) {
      m.color = new Color(0x241f30);   // dark body: it reads as shape, not detail
      m.metalness = 0.7;
      m.roughness = 0.42;
      m.envMapIntensity = 0.35;
    }
  });

  /* The model ships with its mains lead modelled straight out of the socket.
     At silhouette scale, hung in mid-air, it reads as an antenna poking out of
     the machine — so the power kit is hidden. Nothing here is load-bearing. */
  for (const junk of ["cable", "cable_curve", "connector", "schuko"]) {
    const o = model.getObjectByName(`filmstrip_projector_8mm_${junk}`);
    if (o) o.visible = false;
  }

  /* the parts that must move with the film */
  const spoolFeed = model.getObjectByName("filmstrip_projector_8mm_spool_feed");
  const spoolTake = model.getObjectByName("filmstrip_projector_8mm_spool_takeup");
  const roller = model.getObjectByName("filmstrip_projector_8mm_feed_roller");
  const focusRing = model.getObjectByName("filmstrip_projector_8mm_focus");

  /* ── where is the lens? ──
     The GLTF has no "lens" node — the barrel is part of the body mesh. But the
     focus ring IS on the barrel, so the horizontal vector from the body's
     centre to the focus ring gives the lens axis. Derived here, while the model
     is still untransformed, so model space == world space. */
  const box = new Box3().setFromObject(model);
  const mid = box.getCenter(new Vector3());
  const span = box.getSize(new Vector3());
  const axisLocal = focusRing
    ? new Vector3(focusRing.position.x - mid.x, 0, focusRing.position.z - mid.z).normalize()
    : new Vector3(0, 0, 1);
  const lensLocal = (focusRing ? focusRing.position.clone() : mid.clone())
    .addScaledVector(axisLocal, span.length() * 0.10);

  /* ── aim the machine, don't pose it by hand ──
     Shortest-arc from the lens axis to AIM plus a guessed roll left the body
     lying over on its side like it had fallen off a shelf. A projector has two
     constraints, not one: the lens points down the beam AND the spools stay on
     top. So build the full basis — lens axis → AIM, model's own up → world up
     with the beam component removed — and there is no roll left to guess. */
  const f = AIM.clone();
  const wUp = new Vector3(0, 1, 0).sub(f.clone().multiplyScalar(f.dot(new Vector3(0, 1, 0)))).normalize();
  const wRight = new Vector3().crossVectors(wUp, f).normalize();
  const lUp = new Vector3(0, 1, 0);                                   // spools sit at local +Y
  const lRight = new Vector3().crossVectors(lUp, axisLocal).normalize();
  const mWorld = new Matrix4().makeBasis(wRight, wUp, f);
  const mLocal = new Matrix4().makeBasis(lRight, lUp, axisLocal);
  model.quaternion.setFromRotationMatrix(mWorld.multiply(mLocal.transpose()));
  model.position.set(0, 0, 0);

  const holder = new Group();
  holder.add(model);
  holder.scale.setScalar(opts.scale ?? 3.1);
  holder.position.set(-0.02, 1.16, -0.35);
  rig.add(holder);
  scene.updateMatrixWorld(true);

  /* recentre the machine on its own bounding box so scale/roll can be retuned
     without the body wandering sideways off the beam */
  const wMid = new Box3().setFromObject(model).getCenter(new Vector3());
  holder.position.x -= wMid.x;
  scene.updateMatrixWorld(true);

  /* the lens, in world space, now that the machine is aimed and placed */
  const lensW = model.localToWorld(lensLocal.clone());
  const lensDir = axisLocal.clone().applyQuaternion(model.getWorldQuaternion(new Quaternion())).normalize();

  /* the lamp itself: a small hot bead sitting IN the lens, not floating near it */
  const lensGlow = new Mesh(
    new SphereGeometry(0.052, 20, 20),
    new MeshBasicMaterial({ color: 0xfff3da, transparent: true, opacity: 0.95 })
  );
  lensGlow.position.copy(lensW);
  rig.add(lensGlow);

  const halo = new Mesh(
    new SphereGeometry(0.115, 20, 20),
    new MeshBasicMaterial({ color: 0xffd9a4, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false })
  );
  halo.position.copy(lensW);
  rig.add(halo);

  const lampLight = new PointLight(0xfff0d2, 2.6, 3.2, 2);
  lampLight.position.copy(lensW).addScaledVector(lensDir, -0.12);
  rig.add(lampLight);

  /* the cone: apex AT the lens, axis along the lens, length measured to reach
     the strip. ConeGeometry runs apex(+Y) → mouth(−Y), so align −Y to the aim. */
  const beamMat = new ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uColor: { value: new Color(0xffeccd) },
      uCam: { value: camera.position.clone() },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  /* length is SOLVED, not typed: however the machine is hung or scaled, the
     cone reaches the film and stops there. */
  const beamLen = Math.max(0.6, (BEAM_STOP_Y - lensW.y) / Math.min(lensDir.y, -0.05));
  const beam = new Mesh(new ConeGeometry(BEAM_RADIUS, beamLen, 64, 28, true), beamMat);
  beam.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), lensDir);
  beam.position.copy(lensW).addScaledVector(lensDir, beamLen * 0.5);
  beam.renderOrder = 2;
  rig.add(beam);

  /* ── the roll in the corner ──
     NO SPOOL. Yash's reference is a length of film wound on ITSELF: a loose
     coil with a hollow core, the wraps visible as layers, sprocket holes
     running through every one of them, and the tail trailing away. The first
     build put the machine's cloned take-up spool here — flanges, spokes, a hub
     — which is a projector part, not a roll of film, and it read as a washer.
     The coil is drawn entirely in the shader now. */
  const reel = new Group();
  reel.position.copy(REEL_POS);
  rig.add(reel);

  const rollMat = new ShaderMaterial({
    vertexShader: ROLL_VERT,
    fragmentShader: ROLL_FRAG,
    uniforms: {
      uHub: { value: REEL_HUB_R / REEL_FULL_R },
      uTurn: { value: 0 },
      uLight: { value: new Color(0xb6aed2) },
      uWraps: { value: 1 },
    },
    side: DoubleSide,
    transparent: true,
  });
  /* A unit disc in the XY plane, scaled to the current roll radius. Scaling
     beats rebuilding geometry every frame, and because the shader works in
     OBJECT space the coil turns with the film for free. */
  const roll = new Mesh(new CircleGeometry(1, 128), rollMat);
  reel.add(roll);

  /* the corner needs its own light or the roll is a black hole next to a lamp */
  const reelLight = new PointLight(0xb9a4ff, 15, 5.0, 2);
  reelLight.position.copy(REEL_POS).add(new Vector3(0.7, 0.9, 1.5));
  rig.add(reelLight);

  const state = { pos: 0, presence: 0, shutter: 0, lastPos: 0, consumed: 0, rollR: REEL_HUB_R };

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    const dpr = Math.min(devicePixelRatio || 1, opts.dprCap ?? 1.6);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    beamMat.uniforms.uCam.value.copy(camera.position);
  }
  resize();

  /* Compile and draw ONCE here, while the canvas is still fully transparent.
     three.js links a program lazily on its first draw call, and the machine's
     first draw would otherwise land on the exact frame the lamp comes up —
     measured as a repeatable 46–66ms hitch at p≈0.539, right as the film
     starts to travel. Paying it during the quiet editorial beat costs nothing
     visible. (Same family as the shader-compile freeze in the vault: the cost
     is real, it is just a question of which frame wears it.) */
  renderer.compile(scene, camera);
  renderer.render(scene, camera);

  return {
    /**
     * pos      = continuous card position (1.0 = one plate advanced)
     * consumed = 0..1, how much of the reel has wound onto the take-up
     */
    setFilm(pos, consumed = 0) {
      /* a real projector's spools turn by the film that passes them, so the
         rotation is the TRAVEL, not a free-running spin */
      const travel = pos - state.lastPos;
      state.lastPos = pos;
      state.pos = pos;
      if (spoolFeed) spoolFeed.rotation.z -= travel * 1.9;
      if (spoolTake) spoolTake.rotation.z -= travel * 1.55;
      if (roller) roller.rotation.z -= travel * 6.4;
      /* shutter: a brief darkening each time a frame is pulled through */
      state.shutter = Math.min(state.shutter + Math.abs(travel) * 5.5, 1);

      /* THE CORNER REEL.
         Film arrives at the top of the roll travelling left, so it wraps over
         the top and down the left side — anticlockwise on screen, which is a
         POSITIVE turn about +Z. Turning it the other way would have the reel
         spitting film out instead of taking it up, and that reads as wrong
         even to someone who could not say why. */
      state.consumed = Math.max(0, Math.min(1, consumed));
      /* Area, not radius, is what accumulates: film has constant thickness, so
         a full reel's area is proportional to how much has wound on. Growing
         the radius linearly makes the roll balloon early and then barely move
         for the whole second half. */
      const a0 = REEL_HUB_R * REEL_HUB_R;
      const a1 = REEL_FULL_R * REEL_FULL_R;
      state.rollR = Math.sqrt(a0 + (a1 - a0) * state.consumed);
      roll.scale.set(state.rollR, state.rollR, 1);
      rollMat.uniforms.uHub.value = REEL_HUB_R / Math.max(state.rollR, 1e-4);
      /* more film on the roll = more visible wraps, not just a bigger disc */
      rollMat.uniforms.uWraps.value = 3 + state.consumed * 6;
      /* the spool turns by the film it swallows, so it stops when the film
         stops — the same contract as the machine's own spools */
      reel.rotation.z += travel * 0.92;
    },
    /**
     * Where the reel is ON SCREEN, in canvas CSS pixels, so the DOM film can
     * curl onto exactly the circle being drawn — rather than onto a second,
     * hand-typed circle that drifts the moment anything is re-tuned.
     */
    reelScreen() {
      const c = reel.position.clone().project(camera);
      const e = reel.position.clone().add(new Vector3(state.rollR, 0, 0)).project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cx = (c.x * 0.5 + 0.5) * w;
      return {
        x: cx,
        y: (0.5 - c.y * 0.5) * h,
        r: Math.abs((e.x * 0.5 + 0.5) * w - cx),
      };
    },
    setPresence(a) {
      state.presence = Math.max(0, Math.min(1, a));
      canvas.style.opacity = state.presence.toFixed(3);
    },
    render(t) {
      if (state.presence <= 0.002) return;
      state.shutter *= 0.86;
      /* lamp flicker: a real bulb never sits perfectly still */
      const flicker = 0.93 + 0.07 * Math.sin(t * 11.3) + 0.035 * Math.sin(t * 27.7);
      const shutterDip = 1 - state.shutter * 0.42;
      const power = flicker * shutterDip * state.presence;
      lampLight.intensity = 2.6 * power;
      lensGlow.material.opacity = 0.95 * power;
      halo.material.opacity = 0.28 * power;
      halo.scale.setScalar(1 + (1 - power) * 0.22);
      beamMat.uniforms.uTime.value = t;
      beamMat.uniforms.uIntensity.value = power;
      renderer.render(scene, camera);
    },
    resize,
    /** exposed so the verifier can prove the light starts at the machine */
    debug() {
      const p = lensW.clone().project(camera);
      return {
        lens: { x: (p.x * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - p.y * 0.5) * canvas.clientHeight },
        aim: lensDir.toArray().map((v) => +v.toFixed(3)),
      };
    },
    dispose() {
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            Object.values(m || {}).forEach((v) => v?.isTexture && v.dispose());
            m?.dispose?.();
          });
        }
      });
      renderer.dispose();
    },
  };
}
