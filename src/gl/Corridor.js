/**
 * INTRO KA 3D CORRIDOR
 *
 * Camera ek lambe corridor mein -Z ki taraf aage badhti hai. Dono taraf
 * kaanch ke frames guzarte hain, aur beech-beech mein chaar "stations" par
 * act ki image ek plane ki tarah khadi hai. Scroll camera ko aage-peeche
 * chalata hai — koi timeline nahi, sirf ek position.
 *
 * Kyun corridor: side-scroll ka ehsaas isse sabse strong aata hai. Particle
 * field mein cheezein sirf sarakti hain; yahan wo sach mein paas se nikalti
 * hain, isliye depth mehsoos hoti hai.
 *
 * FOG poora kaam karta hai. Har act ke apne paper rang ka fog hai, isliye
 * frames door ja kar usi rang mein ghul jaate hain — na koi hard cut, na
 * koi khaali kinaara. Act badalte waqt fog ka rang lerp hota hai, aur wahi
 * "ek jagah se doosri jagah" ka transition hai.
 *
 * Site ka apna WebGL (gl/Scene.js) alag hai. Ye uska hissa nahi kiya kyunki
 * dono ka camera, fog aur blending bilkul alag hai — ek scene mein dono
 * rakhne ka matlab hota har frame uniforms swap karna.
 */

import {
  Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, BufferAttribute,
  LineBasicMaterial, LineSegments, Mesh, PlaneGeometry, MeshBasicMaterial,
  Color, Fog, TextureLoader, Vector3, Group, SRGBColorSpace,
} from "three";
import { createOrb } from "./Orb.js";
import { createCodeBuild } from "./CodeBuild.js";
import { createMarketGrowth } from "./MarketGrowth.js";
import { wantsAA } from "./msaa.js";

const SEG = 32;           // do stations ke beech ki doori, world units
const START_Z = 6;        // camera ka shuruaati z
const TRAVEL = 128;       // poora safar; p=1 par camera aakhri station se aage
const FRAME_GAP = 4.4;    // kaanch ke frames kitni-kitni doori par

/**
 * Corridor ka naap — aur ye naap ek visual bug ka fix hai, decoration nahi.
 *
 * Pehle frames 15×9 the. Visible height distance d par 2·d·tan(29°) = 1.108·d
 * hoti hai, to 9 oonche frame d < 8 tak hi bahar rehte the — matlab paas ke
 * saare frames screen ke andar aate the aur image ke upar ek RECTANGULAR
 * PINJRA bana dete the, sub-headline ke aar-paar.
 *
 * 26 oonche frames ke saath wo hisaab badal jaata hai: d < 26/1.108 ≈ 23.5
 * tak frame ke kinaare frustum se BAHAR hote hain. Isliye paas ke frames
 * dikhte hi nahi, aur sirf door wale — jo fog mein dhundhle hain — tunnel
 * ka ehsaas dete hain. Depth milti hai, pinjra nahi.
 */
const FRAME_W = 40, FRAME_H = 26;

/**
 * Station plane ka naap. ahead = 15 par visible area 16.6×29.5 hota hai
 * (aspect 16:9 par), isliye 36×24 usse poora dhak leta hai — warna plane ke
 * kinaaron se corridor jhaankta hai. Image crop hoti hai, jo full-bleed
 * mein theek hai.
 */
const PLANE_W = 36, PLANE_H = 24;

/**
 * Station plane camera ke station point se itna AAGE hota hai.
 *
 * Pehle plane theek station par tha — matlab peak par camera usi z par
 * pahunch jaati thi aur plane se guzar rahi hoti thi (opacity sirf 0.4).
 * Act ka sabse ahem lamha hi sabse phaka lamha ban gaya tha.
 *
 * 15 kyun: plane 17.3 unit oonchi hai aur FOV 58° hai, to visible height
 * = 2·d·tan(29°) = 1.108·d. d = 17.3 / 1.108 ≈ 15.6 par plane theek frame
 * bhar deta hai. 15 par wo bilkul kinaare tak aa jaata hai.
 */
const PLANE_AHEAD = 15;

/** smoothstep — kinaare par derivative 0, isliye fade mein koi kink nahi */
const smooth = (t) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/**
 * Act i ka station theek p = (i + 0.5) / n par aata hai.
 * Isse peaks barabar bat jaate hain — z se ulta nikalne par wo tedhe padte
 * the aur pehla act doosre se chhota lagta tha.
 */
export function stationProgress(n) {
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}

/** ek rectangle outline ke line-segment vertices */
function pushRect(v, w, h, z) {
  const x = w / 2, y = h / 2;
  const c = [[-x, -y], [x, -y], [x, y], [-x, y]];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    v.push(a[0], a[1], z, b[0], b[1], z);
  }
}

export function createCorridor(canvas, opts = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Stations ki ginti acts se aati hai, images se nahi — `scenes: false` par
  // images khaali hoti hain par progress ka ganit waisa hi rehna chahiye.
  const count = opts.stations || opts.images?.length || 4;
  const peaks = stationProgress(count);
  const stationZ = peaks.map((p) => START_Z - p * TRAVEL);

  const renderer = new WebGLRenderer({
    canvas, antialias: wantsAA(), alpha: false, powerPreference: "high-performance",
  });
  // Native CodeBuild isi framebuffer par second transparent pass hai.
  // Manual clear ke bina autoClear us pass se corridor mita deta.
  renderer.autoClear = false;
  const scene = new Scene();
  const camera = new PerspectiveCamera(58, 1, 0.1, 260);

  /* fog aur clear colour hamesha ek jaisa — warna door ka frame fog mein
     ghulta hai par uske peeche ka khaali background alag rang ka dikhta hai
     aur ek saaf horizon line ban jaati hai. */
  /* Fog ki near value hi corridor ke dikhne-na-dikhne ka faisla karti hai.
     Pehle near 14 tha — matlab jo frames frustum mein aate hi hain (d ≈ 23
     se aage) wo pehle se 11% fog kha chuke hote the, aur accent rang 50%
     opacity par navy background mein ghul jaata tha. Nateeja: do stations ke
     beech screen bilkul khaali grey lagti thi.

     near 26 (frames frustum mein aane ke baad se) aur far 140 rakhne par
     mid-distance frames saaf rehte hain aur sirf sabse door wale ghulte
     hain — tunnel ka ehsaas wahin se aata hai. */
  const fogColour = new Color(opts.fog ?? "#f2e6d7");
  scene.fog = new Fog(fogColour, 26, 140);
  renderer.setClearColor(fogColour, 1);

  /* ── kaanch ke frames ──
     Ek hi LineSegments mein saare frames. Geometry static hai, sirf camera
     chalti hai — isliye har frame par kuch rebuild nahi hota. */
  const verts = [];
  const railZ = [];
  const total = TRAVEL + SEG;
  for (let z = START_Z + 4; z > START_Z - total; z -= FRAME_GAP) {
    // Do nested rectangles: bahar wala corridor ka mouth, andar wala kaanch
    // ki moti kinaari ka ehsaas deta hai.
    pushRect(verts, FRAME_W, FRAME_H, z);
    pushRect(verts, FRAME_W - 2.6, FRAME_H - 2, z);
    railZ.push(z);
  }
  // lambe rails — inke bina raftaar ka andaza hi nahi hota, kyunki frames
  // ek jaise hain aur unse gati padhi nahi jaati
  const zA = START_Z + 4, zB = START_Z - total;
  const hx = FRAME_W / 2, hy = FRAME_H / 2;
  for (const [x, y] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy], [-hx + 1.3, 0], [hx - 1.3, 0]]) {
    verts.push(x, y, zA, x, y, zB);
  }

  const frameGeo = new BufferGeometry();
  frameGeo.setAttribute("position", new BufferAttribute(new Float32Array(verts), 3));
  const frameMat = new LineBasicMaterial({
    color: new Color(opts.accent ?? "#bd6741"),
    transparent: true, opacity: 0.78, fog: true,
  });
  const frames = new LineSegments(frameGeo, frameMat);
  scene.add(frames);

  /* ── station planes: har act ki image ──
     Plane camera ki taraf mudi hui hai aur itni badi hai ki station par
     pahunchte waqt poora frame bhar de. */
  const loader = new TextureLoader();
  const planes = new Group();
  scene.add(planes);

  const station = (opts.images || []).flatMap((src, i) => {
    // Native station normal-motion mode mein `null` hai. Index preserve rehna
    // chahiye taaki baaki stations ka progress/position bilkul na badle.
    if (!src) return [];
    const tex = loader.load(src);
    tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0, fog: true, depthWrite: false,
    });
    const mesh = new Mesh(new PlaneGeometry(PLANE_W, PLANE_H), mat);
    const z = stationZ[i] - PLANE_AHEAD;
    mesh.position.set(0, 0, z);
    planes.add(mesh);
    return [{ mesh, mat, z, index: i }];
  });

  /* ── Act 02 native build ──
     Reference video ka koi pixel render nahi hota. Ek transparent second
     Three.js scene same renderer/framebuffer par grid, glass, light aur
     dissolve draw karta hai. Reduced motion par ye banta hi nahi; code.webp
     ordinary station plane ke roop mein rehta hai. */
  const codeBuild = opts.codeBuild
    ? createCodeBuild({ accent: opts.codeAccent ?? "#6dc9ff" })
    : null;

  const marketGrowth = opts.marketGrowth
    ? createMarketGrowth({ accent: "#00f0ff" })
    : null;

  /* ── opening orb ──
     Usi scene mein, isliye ek hi render pass. Ye camera ke saamne baithta hai
     aur scroll shuru hote hi jagah kar deta hai (fade intro.js se aata hai). */
  const orb = createOrb({
    warm: opts.orbWarm ?? "#ff9a5c",
    cool: opts.orbCool ?? "#f6e2cf",
    z: START_Z - 26,
  });
  scene.add(orb.group);

  /* ── pointer se halka look-around ──
     Camera ko poora ghumana nahi hai (motion sickness), bas itna ki scene
     jinda lage. */
  let pTx = 0, pTy = 0, pX = 0, pY = 0;
  const onMove = (e) => {
    pTx = (e.clientX / innerWidth - 0.5) * 2;
    pTy = (e.clientY / innerHeight - 0.5) * 2;
    orb.setPointer(pTx, pTy);
  };
  addEventListener("pointermove", onMove, { passive: true });

  let progress = 0;
  let frameFade = 1;
  let w = 0, h = 0, lastW = -1, lastH = -1;

  function resize() {
    w = canvas.clientWidth || innerWidth;
    h = canvas.clientHeight || innerHeight;
    lastW = w; lastH = h;
    if (w <= 0 || h <= 0) return;
    const pr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    // Custom point shader ko DPR khud lagana padta hai — gl_PointSize
    // device pixels mein hota hai, CSS pixels mein nahi
    orb.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    codeBuild?.resize(w, h);
    marketGrowth?.resize(w, h);
  }

  /** scroll se aata hai, 0…1 */
  function setProgress(p) {
    progress = Math.max(0, Math.min(1, p));
  }

  /**
   * Frames ki opacity — orb ke ulta chalti hai.
   *
   * Ye ek asli artifact ka fix hai: lambe rails poori corridor ki lambai
   * chalte hain, to wo orb se PAAS hote hain aur uske aar-paar kat jaate the
   * (orb ka body depthWrite nahi karta). Shuruaat mein frames chhupa dene se
   * wo artifact khatam ho jaata hai — aur corridor scroll ke saath "banta"
   * hua dikhta hai, jo blueyard wale saaf opening se behtar match karta hai.
   */
  function setFrameFade(v) {
    frameFade = Math.max(0, Math.min(1, v));
    frameMat.opacity = 0.78 * frameFade;
    frames.visible = frameFade > 0.004;
  }

  /** fog + accent ka rang act ke saath badalta hai */
  function setColours(fogHex, accentHex) {
    fogColour.set(fogHex);
    scene.fog.color.copy(fogColour);
    renderer.setClearColor(fogColour, 1);
    frameMat.color.set(accentHex);
  }

  const tmp = new Vector3();
  /**
   * World point → screen px. Props ko 3D depth dene ke liye yahi use hota
   * hai: DOM element ko projected jagah par rakhkar depth se scale karte
   * hain, poora prop 3D mein banane ki zaroorat nahi padti.
   *
   * `null` matlab point camera ke peeche hai — us frame prop chhupa do.
   */
  function project(x, y, z) {
    tmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (tmp.z > -0.2) return null;                    // camera ke peeche/bilkul paas
    const dist = -tmp.z;                              // view space mein -z = saamne
    /* Vector3.applyMatrix4 perspective divide KHUD kar deta hai (andar 1/w se
       multiply hota hai), isliye iske baad tmp pehle se NDC mein hai. Yahan
       dobara /w karne ki koshish mein `tmp.w` undefined milta tha aur poori
       position NaN ho jaati thi — saare props gayab. */
    tmp.applyMatrix4(camera.projectionMatrix);
    return {
      x: (tmp.x * 0.5 + 0.5) * w,
      y: (-tmp.y * 0.5 + 0.5) * h,
      dist,
      // fog ke andar jitna gehra, utna phaka — planes ke saath consistent
      fade: 1 - Math.min(1, Math.max(0, (dist - scene.fog.near) / (scene.fog.far - scene.fog.near))),
    };
  }

  function render(time) {
    /* Self-heal: `resize` event par bharosa kaafi nahi hai. Hidden pane ya
       background tab mein canvas 0×0 par boot ho sakta hai aur tab koi resize
       event bhi nahi aata; aur pin lagne/hatne par element ki size badalti
       hai bina window resize ke. Har frame do sasta property read. */
    const cw = canvas.clientWidth || innerWidth;
    const ch = canvas.clientHeight || innerHeight;
    if (cw !== lastW || ch !== lastH) resize();
    if (!w || !h) return;

    pX += (pTx - pX) * 0.05;
    pY += (pTy - pY) * 0.05;

    // Corridor ka camera seedha rehta hai. Act 02 ka restrained dolly uske
    // native scene camera mein hai, isliye frames/baaki stations wobble nahi.
    const z = START_Z - progress * TRAVEL;
    // Sway sirf itna ki hilna mehsoos ho. Reduced-motion par bilkul seedha.
    const sway = reduced ? 0 : Math.sin(time * 0.21) * 0.28;
    const bob = reduced ? 0 : Math.cos(time * 0.17) * 0.18;
    camera.position.set(sway + pX * 0.9, bob + pY * -0.55, z);
    camera.lookAt(pX * 1.4, pY * -0.8, z - 12);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    /* Plane ki opacity doori se. `ahead` = plane camera se kitna aage hai
       (camera -z ki taraf jaati hai, isliye z - planeZ).

       Peak par ahead = PLANE_AHEAD, aur wahin opacity 1 honi chahiye — act
       ka sabse ahem lamha sabse saaf hona chahiye. Fog isse aur softer kar
       deta hai, isliye alag distance-fade ki zaroorat nahi. */
    station.forEach((s) => {
      const i = s.index;
      const ahead = z - s.z;

      /* Act 01 ki photographed sphere ko zinda mehsoos karane ke liye uska
         poora plane bahut halka drift karta hai. Image full-bleed hai, isliye
         0.22 world-unit motion kinaara nahi kholta; nazar central ball ko hi
         moving object ke roop mein padhti hai. */
      const ideaFocus = i === 0
        ? smooth(1 - Math.abs(progress - peaks[0]) / (0.5 / count))
        : 0;
      const move = reduced ? 0 : ideaFocus;
      s.mesh.position.x = Math.sin(time * 0.14) * 0.22 * move;
      s.mesh.position.y = Math.cos(time * 0.12) * 0.14 * move;
      s.mesh.rotation.z = Math.sin(time * 0.09) * 0.0025 * move;
      s.mesh.scale.setScalar(i === 0 ? 1 + ideaFocus * 0.012 : 1);

      /* Plane door se ek TRANSLUCENT panel ki tarah aata hai aur sirf station
         ke paas poora opaque hota hai.

         Pehle ye 30 units par hi ~100% ho jaata tha — aur usi wajah se poora
         corridor uske peeche chhup jaata tha, do stations ke beech screen par
         sirf khaali fog bachta tha. 42→22 ki ramp se aane wale plane ke AAR-PAAR
         corridor dikhta rehta hai, aur wahi "kaanch ke andar se guzarna" wala
         ehsaas deta hai. */
      const o = smooth((42 - ahead) / 20)     // 42 se 22 tak thos hota hai
              * smooth((ahead - 1) / 7);      // 8 se 1 tak guzarte hue jaata hai
      s.mat.opacity = o;
      s.mesh.visible = o > 0.002;
    });

    orb.render(time);
    codeBuild?.update(progress, time);
    marketGrowth?.update(progress, time);

    // Act 02 & 03 stage dimming
    const codeStage = codeBuild
      ? smooth((progress - 0.245) / 0.035)
        * (1 - smooth((progress - 0.495) / 0.035))
      : 0;
    const marketStage = marketGrowth
      ? smooth((progress - 0.485) / 0.035)
        * (1 - smooth((progress - 0.725) / 0.035))
      : 0;
    const activeStage = Math.max(codeStage, marketStage);
    const visibleFrameOpacity = 0.78 * frameFade * (1 - activeStage);
    frameMat.opacity = visibleFrameOpacity;
    frames.visible = visibleFrameOpacity > 0.004;

    // Camera easing and DOM projections keep updating behind later acts.
    // Skip only GPU submission at exact zero visibility; every nonzero fade
    // still draws at the original resolution with the original scene state.
    if (canvas.checkVisibility
      ? !canvas.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : canvas.style.opacity !== "" && Number(canvas.style.opacity) === 0) return;

    renderer.clear();
    renderer.render(scene, camera);
    if (codeBuild && progress < 0.505) {
      renderer.clearDepth();
      codeBuild.render(renderer);
    }
    if (marketGrowth && progress >= 0.48 && progress < 0.735) {
      renderer.clearDepth();
      marketGrowth.render(renderer);
    }
  }

  resize();
  return {
    render, resize, setProgress, setColours, setFrameFade, project, camera, orb,
    peaks, stationZ, reduced, codeBuild,
    // Exposed so the live Act 01 orb scene can hide the pre-rendered idea plane
    // while it is running (and leave it alone when it is the fallback).
    station,
    codeBase() {
      return codeBuild?.projectBase() ?? null;
    },
    get progress() { return progress; },
    dispose() {
      removeEventListener("pointermove", onMove);
      orb.dispose();
      codeBuild?.dispose();
      frameGeo.dispose(); frameMat.dispose();
      station.forEach((s) => { s.mesh.geometry.dispose(); s.mat.map?.dispose(); s.mat.dispose(); });
      renderer.dispose();
    },
  };
}
