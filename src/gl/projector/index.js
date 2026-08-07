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
 * almost nothing except its own lamp. That also hides every texture flaw.
 *
 * Contract:
 *   const p = await createProjector(canvas);
 *   p.setFilm(pos, advancing)   // pos = continuous card position, from intro.js
 *   p.setPresence(a)            // 0..1, fades the whole machine with the act
 *   p.render(timeSeconds)       // called from the ONE site ticker
 *   p.resize() / p.dispose()
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, AmbientLight, PointLight,
  SpotLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry,
  ConeGeometry, ShaderMaterial, AdditiveBlending, Color, DoubleSide, MathUtils,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL = "/assets/projector/filmstrip_projector_8mm_1k.gltf";

/* the beam: a cone of light with dust drifting through it */
const BEAM_VERT = `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BEAM_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;
  varying vec2 vUv;
  varying vec3 vPos;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                  mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    return n;
  }

  void main() {
    /* fade along the cone (uv.y runs apex → mouth) and toward the rim */
    /* soft everywhere: a hard edge anywhere makes this read as a grey wedge
       instead of light (measured against Yash's sketch, 7 Aug) */
    float along = smoothstep(0.0, 0.30, vUv.y) * (1.0 - smoothstep(0.62, 1.06, vUv.y));
    float rim   = 1.0 - abs(vUv.x - 0.5) * 2.0;
    rim = pow(clamp(rim, 0.0, 1.0), 2.1);
    /* dust: slow drifting motes inside the light */
    float dust = noise(vPos * 3.2 + vec3(0.0, -uTime * 0.28, uTime * 0.12));
    dust = smoothstep(0.62, 0.96, dust);
    float a = (along * rim * 0.20 + dust * along * rim * 0.42) * uIntensity;
    gl_FragColor = vec4(uColor * (0.85 + dust * 0.6), a);
  }
`;

export async function createProjector(canvas, opts = {}) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0.55, 6.4);
  camera.lookAt(0, 0.35, 0);

  /* almost no ambient: the machine is a silhouette, the lamp does the talking */
  scene.add(new AmbientLight(0x9fb4ff, 0.16));
  const rim = new PointLight(0xa98bff, 6, 14, 2);
  rim.position.set(-3.2, 2.4, 1.6);
  scene.add(rim);

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
      m.color = new Color(0x2a2536);   // dark body: it reads as shape, not detail
      m.metalness = 0.65;
      m.roughness = 0.5;
      m.envMapIntensity = 0.4;
    }
  });

  /* the parts that must move with the film */
  const spoolFeed = model.getObjectByName("filmstrip_projector_8mm_spool_feed");
  const spoolTake = model.getObjectByName("filmstrip_projector_8mm_spool_takeup");
  const roller = model.getObjectByName("filmstrip_projector_8mm_feed_roller");

  /* the model faces +X in its own space; turn it to face the viewer, tilt it
     down toward the strip in the lower third, and hang it high and back */
  model.rotation.set(0, Math.PI * 0.52, 0);
  model.position.set(0, 0, 0);
  const holder = new Group();
  holder.add(model);
  holder.scale.setScalar(2.75);
  holder.position.set(0.04, 0.98, -0.55);
  holder.rotation.set(MathUtils.degToRad(-14), 0, 0);
  rig.add(holder);

  /* the lamp: a hot little sphere at the lens plus a spot that throws forward */
  const lensGlow = new Mesh(
    new SphereGeometry(0.085, 20, 20),
    new MeshBasicMaterial({ color: 0xfff2d6, transparent: true, opacity: 0.95 })
  );
  lensGlow.position.set(0.04, 0.80, 0.10);
  rig.add(lensGlow);

  const lamp = new SpotLight(0xfff0d2, 26, 9, MathUtils.degToRad(20), 0.55, 1.4);
  lamp.position.copy(lensGlow.position);
  lamp.target.position.set(0.04, -1.5, 1.7);
  rig.add(lamp, lamp.target);

  /* volumetric cone from the lens down onto the strip */
  const beamMat = new ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uColor: { value: new Color(0xffeccd) },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const beam = new Mesh(new ConeGeometry(1.5, 3.6, 72, 26, true), beamMat);
  /* cone apex at the lens, mouth at the film strip below and in front */
  beam.position.set(0.04, -0.62, 0.62);
  beam.rotation.set(MathUtils.degToRad(155), 0, 0);
  rig.add(beam);

  const state = { pos: 0, presence: 0, shutter: 0, lastPos: 0 };

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    const dpr = Math.min(devicePixelRatio || 1, opts.dprCap ?? 1.6);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    /** pos = continuous card position (1.0 = one plate advanced) */
    setFilm(pos) {
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
    },
    setPresence(a) {
      state.presence = Math.max(0, Math.min(1, a));
      canvas.style.opacity = state.presence.toFixed(3);
    },
    render(t) {
      if (state.presence <= 0.002) return;
      state.shutter *= 0.86;
      /* lamp flicker: a real bulb never sits perfectly still */
      const flicker = 0.92 + 0.08 * Math.sin(t * 11.3) + 0.04 * Math.sin(t * 27.7);
      const shutterDip = 1 - state.shutter * 0.45;
      const power = flicker * shutterDip * state.presence;
      lamp.intensity = 26 * power;
      lensGlow.material.opacity = 0.95 * power;
      lensGlow.scale.setScalar(1 + (1 - power) * 0.18);
      beamMat.uniforms.uTime.value = t;
      beamMat.uniforms.uIntensity.value = power;
      renderer.render(scene, camera);
    },
    resize,
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
