/**
 * OPENING ORB — intro ka pehla frame
 *
 * Ek bada sphere jo neeche se crop hota hua uthta hai: soft-shaded body, aur
 * uske upar hazaaron chamakte particles jo rim ke paas ghane hote hain aur
 * bahar halo banate hain. Dheere drift karta hai, dheere ghoomta hai, aur
 * pointer ke saath halka jhukta hai.
 *
 * DO DRAW CALL, ek nahi:
 *   1. body  — smooth mesh, radial shading + fresnel rim glow
 *   2. shell — Points, additive, noise se shimmer
 * Sirf particles se sphere "body" nahi lagta, khokhla lagta hai; sirf mesh se
 * wo chamak nahi aati. Dono ek saath hi ye look banate hain.
 *
 * Ye corridor ke usi scene aur usi renderer mein jaata hai — alag canvas
 * lagane ka matlab hota do WebGL context aur do render pass har frame.
 *
 * Act 01 ki image bhi ek glowing sphere hai; ye orb jaan-boojhkar uska hi
 * 3D purvaj hai, taaki scroll shuru karte hi ek hi cheez lagti rahe.
 */

import {
  BufferGeometry, BufferAttribute, Points, ShaderMaterial, Mesh,
  SphereGeometry, Group, Color, AdditiveBlending, Vector3, Vector2,
} from "three";

const COUNT = 46000;      // naapa hua: 20k par speckle pattern ginti mein aa jaata hai
const RADIUS = 10;

/* Ek chhota hash-based value noise. Simplex import karne ki zaroorat nahi —
   yahan noise ka kaam sirf "kaunsa particle is waqt jal raha hai" tay karna
   hai, uske liye ye kaafi hai aur sasta hai. */
const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p){
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

export function createOrb(opts = {}) {
  const group = new Group();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Rang jaan-boojhkar phake hain. Pehle warm `#ff9a5c` tha aur orb ek thos
     santre jaisa dikhta tha — reference par wo ek narm, roshni se bhara grah
     hai, saturated gend nahi. Warm ko halka aur cool ko lagbhag safed rakhna
     zaroori hai. */
  const colWarm = new Color(opts.warm ?? "#f9a884");
  const colCool = new Color(opts.cool ?? "#fdf3e8");

  const shared = {
    uTime: { value: 0 },
    uFade: { value: 1 },          // progress se — 1 = poora dikhta hai
    uWarm: { value: colWarm },
    uCool: { value: colCool },
    uRadius: { value: RADIUS },
  };

  /* ── 1. body ──
     Fresnel se rim par roshni, aur ek off-centre "sun" se ek taraf gehra.
     Lambert light nahi lagaya: ye object roshni ka source lagna chahiye,
     roshni se roshan hui cheez nahi. */
  const bodyMat = new ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uWarm; uniform vec3 uCool; uniform float uFade;
      varying vec3 vN; varying vec3 vView;
      void main(){
        float rim = 1.0 - clamp(dot(vN, vView), 0.0, 1.0);
        // sun upar-baayein — isse sphere ka volume padha jaata hai
        float sun = clamp(dot(vN, normalize(vec3(-0.45, 0.75, 0.5))), 0.0, 1.0);
        // pow 0.85 (1.6 nahi): isse roshni ka hissa BADA ho jaata hai aur
        // orb thos santre ki jagah narm grah lagta hai
        vec3 col = mix(uWarm, uCool, pow(sun, 0.85) * 0.92);
        // kinaare par halki chamak, par rim ko poora safed nahi karte —
        // warna sphere ek ring jaisa dikhne lagta hai
        col += uCool * pow(rim, 3.2) * 0.45;
        float a = (0.9 - pow(rim, 5.0) * 0.42) * uFade;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const body = new Mesh(new SphereGeometry(RADIUS, 96, 72), bodyMat);
  group.add(body);

  /* ── 2. particle shell ──
     Har point sphere par ek fixed direction rakhta hai; shimmer noise se
     aata hai, position se nahi. Isliye particles "rengte" nahi — wo jalte
     aur bujhte hain, jaisa blueyard par hota hai. */
  const dirs = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    // Marsaglia — uniform on sphere. Naive (theta, phi) lene par poles par
    // particles ikattha ho jaate hain aur do saaf dhabbe ban jaate hain.
    let x, y, s;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; s = x * x + y * y; } while (s >= 1);
    const f = 2 * Math.sqrt(1 - s);
    dirs[i * 3] = x * f;
    dirs[i * 3 + 1] = y * f;
    dirs[i * 3 + 2] = 1 - 2 * s;
    seeds[i] = Math.random();
  }
  const shellGeo = new BufferGeometry();
  // `position` ka hona zaroori hai warna three frustum-cull ke liye
  // boundingSphere nahi bana paata; asli jagah shader mein banti hai
  shellGeo.setAttribute("position", new BufferAttribute(dirs, 3));
  shellGeo.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  shellGeo.boundingSphere = null;

  const shellMat = new ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    blending: AdditiveBlending,
    uniforms: { ...shared, uPixel: { value: 1 } },
    vertexShader: NOISE_GLSL + /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform float uRadius; uniform float uFade;
      uniform float uPixel;
      varying float vGlow;
      void main(){
        vec3 dir = normalize(position);

        /* Do noise field: ek dheema (kaunsa ilaaka jal raha hai) aur ek tez
           (aankh-jhapakne wali chamak). Ek hi field se pattern bahut
           regular lagta hai. */
        float slow = vnoise(dir * 2.4 + vec3(0.0, 0.0, uTime * 0.055));
        float fast = vnoise(dir * 7.0 + vec3(uTime * 0.22, 0.0, 0.0));

        // Halo: kuch particles surface se BAHAR nikal jaate hain. pow se
        // sirf sabse tez wale nikalte hain, isliye halo patla rehta hai.
        float lift = pow(slow, 4.0) * 2.6 + pow(fast, 6.0) * 1.4;
        float r = uRadius * (1.0 + 0.004 * fast) + lift;

        vec4 mv = modelViewMatrix * vec4(dir * r, 1.0);
        gl_Position = projectionMatrix * mv;

        /* Rim par ghana: normal aur view ka dot chhota hone par brightness
           badhti hai. Yahi wo chamakti kinaari banata hai. */
        vec3 n = normalize(normalMatrix * dir);
        float rim = 1.0 - clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0);

        /* burn = kaunsa particle is waqt jal raha hai.
           Pehle ye DO smoothstep ka GUNA tha — dono ko saath tez hona padta
           tha, isliye bahut kam particles jalte the aur speckles sirf rim par
           dikhte the. Ab dono ka mishran ek hi threshold se guzarta hai, to
           poore face par shimmer aata hai (jaisa reference par hai). */
        float mixed = slow * 0.62 + fast * 0.38;
        float burn = smoothstep(0.40, 0.80, mixed);
        // base 0.55 (0.35 nahi) — face wale particles bhi padhne chahiye,
        // rim ka boost uske upar hai
        vGlow = burn * (0.55 + rim * 1.15) * uFade;

        // -mv.z = doori; size attenuation manually, kyunki custom shader hai
        gl_PointSize = uPixel * (0.7 + aSeed * 1.9) * (26.0 / max(1.0, -mv.z));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCool; uniform vec3 uWarm;
      varying float vGlow;
      void main(){
        // gol, soft-edged dot. Square points turant "computer graphics" lagte hain.
        vec2 d = gl_PointCoord - 0.5;
        float m = 1.0 - smoothstep(0.18, 0.5, length(d));
        if (m <= 0.001 || vGlow <= 0.001) discard;
        /* Particles ka rang lagbhag SAFED hai (0.6 nahi, 0.92).
           Additive blending sirf tab dikhti hai jab particle apne peeche ke
           pixel se zyada bright ho — orb ka body pehle se bright peach hai,
           to warm-ish particles face par poori tarah ghul jaate the aur
           speckles sirf gehre rim par dikhte the. */
        gl_FragColor = vec4(mix(uWarm, uCool, 0.92), m * vGlow);
      }`,
  });
  const shell = new Points(shellGeo, shellMat);
  shell.frustumCulled = false;
  group.add(shell);

  /* ── placement ──
     Wordmark ke centre se halka neeche: sphere ab BUILDANTA SOLUTIONS ke
     peeche rehta hai, neeche alag object ki tarah nahi. DOM wordmark canvas
     se upar paint hota hai, isliye roshni letters ko frame karti hai. */
  const home = new Vector3(opts.x ?? 0, opts.y ?? -1.6, opts.z ?? -20);
  group.position.copy(home);

  const ptr = new Vector2(0, 0);      // lerped
  const ptrTarget = new Vector2(0, 0);

  return {
    group,
    /** pointer -1…1 mein */
    setPointer(x, y) { ptrTarget.set(x, y); },
    /** 0…1 — intro ke shuru mein 1, phir corridor ko jagah de deta hai */
    setFade(v) {
      const f = Math.max(0, Math.min(1, v));
      shared.uFade.value = f;
      group.visible = f > 0.002;
    },
    setColours(warmHex, coolHex) {
      colWarm.set(warmHex); colCool.set(coolHex);
    },
    setPixelRatio(r) { shellMat.uniforms.uPixel.value = r; },
    render(time) {
      shared.uTime.value = reduced ? 4.2 : time;
      ptr.x += (ptrTarget.x - ptr.x) * 0.045;
      ptr.y += (ptrTarget.y - ptr.y) * 0.045;

      // dheema drift + pointer ka halka dhakka
      const t = reduced ? 0 : time;
      group.position.set(
        home.x + Math.sin(t * 0.07) * 1.5 + ptr.x * 2.6,
        home.y + Math.cos(t * 0.05) * 1.1 + ptr.y * -1.4,
        home.z
      );
      // ghoomna: particles ka pattern surface par sthir hai, isliye ghumaav
      // hi batata hai ki ye ek thos sphere hai
      if (!reduced) {
        group.rotation.y = t * 0.032;
        group.rotation.z = Math.sin(t * 0.04) * 0.06;
      }
    },
    dispose() {
      body.geometry.dispose(); bodyMat.dispose();
      shellGeo.dispose(); shellMat.dispose();
    },
  };
}
