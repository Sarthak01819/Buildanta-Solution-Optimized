import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { INTRO, BRAND } from "../config.js";
import { splitChars } from "./splitText.js";
import { createSound } from "./sound.js";
import { createMusic } from "./music.js";
import { createZeroStageAudio } from "./zeroStageAudio.js";
import { createCorridor } from "../gl/Corridor.js";
import { mountOrbHero } from "../gl/orb-hero/index.js";
import { createConsultHand } from "../gl/ConsultHand.js";
import { USE_ZERO_MIRROR } from "../gl/consultAnimationMode.js";
import { mountBlackholeBeat } from "../gl/blackhole/index.js";
import { buildObjects, projectObjects } from "./introObjects.js";
import { SERVICES } from "./services.js";
import { createProjector } from "../gl/projector/index.js";
import { mountMarketCamera } from "../gl/marketCamera.js";

/**
 * SCROLL-DRIVEN INTRO
 *
 * Ye ab ad nahi hai — timeline khud nahi chalti. `#intro` page ka pehla
 * section hai jise ScrollTrigger pin karke rakhta hai; scroll ek hi cheez
 * chalata hai, camera ki corridor mein position. Poora reversible hai:
 * upar scroll karo to acts ulte chalte hain.
 *
 * Isliye yahan se teen cheezein poori tarah nikal gayi hain:
 *   · `tl.play()` / auto-advance — progress sirf scroll se aata hai
 *   · ENTER button aur paper wipe columns — site intro ke neeche se aati hai
 *   · oncePerSession / sessionStorage — intro page ka hissa hai, ek
 *     "dekh liya" wali cheez nahi. Scroll up karne par wapas aata hai.
 *
 * Progress ka poora ganit `peaks` par tika hai: act i ka station theek
 * p = (i + 0.5) / n par hai. Text uske aas-paas ki khidki mein dikhta hai.
 */
export function createIntro({ onProgress } = {}) {
  const root = document.getElementById("intro");
  if (!root) return null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const steps = INTRO.steps;
  const n = steps.length;

  /* ── static text ── */
  root.querySelector("[data-intro-eyebrow]").textContent = INTRO.eyebrow;
  root.querySelector("[data-intro-total]").textContent = String(n).padStart(2, "0");

  const stage = root.querySelector(".intro__stage");
  const counter = root.querySelector("[data-intro-count]");
  const barFill = root.querySelector(".intro__bar i");
  const hint = root.querySelector("[data-intro-hint]");
  const skipBtn = root.querySelector("[data-skip]");
  const glCanvas = root.querySelector(".intro__gl");
  const ideaFx = root.querySelector(".intro__ideaTransfer");
  const bigBangEl = ideaFx?.querySelector(".intro__bigBang");
  const catchDrops = [...(ideaFx?.querySelectorAll(".intro__catchDrop") || [])];

  /* ── purana painted core hata do ──
     ideaCore / ideaSparkle / ideaRipple pre-rendered artwork ke chamakte core
     ke UPAR baithne ke liye bane the. Ab orb ka apna asli dense core hai, to ye
     teenon uske upar ek DOOSRA nakli core bana dete the.

     catchDrop JAAN-BOOJHKAR bache hain — wo takra kar Act 02 ka Big Bang
     jalaate hain. */
  for (const sel of [".intro__ideaCore", ".intro__ideaSparkle", ".intro__ideaRipple"]) {
    ideaFx?.querySelector(sel)?.style.setProperty("display", "none");
  }
  const topBar = root.querySelector(".intro__top");
  const footBar = root.querySelector(".intro__foot");
  const bar = root.querySelector(".intro__bar");
  const marketExperience = root.querySelector(".market-experience");
  const filmStrip = root.querySelector(".market-film");
  if (filmStrip) {
    /* One plate per service, rendered from services.js — the word a customer
       already uses is the hero; the promise and scope sit under it. */
    filmStrip.innerHTML = SERVICES.map((sv) => `
      <a class="market-frame market-frame--plate" href="#" data-service="${sv.id}"
         aria-label="${sv.word} — ${sv.line.replace(/<br>/g, " ")}"
         style="background-image:url(/assets/reel/${sv.art})">
        <span class="plate__word">${sv.word}</span>
        <strong class="plate__line">${sv.line}</strong>
        <span class="plate__tag">${sv.tag}</span>
      </a>`).join("");
  }
  const filmCards = filmStrip ? [...filmStrip.querySelectorAll(".market-frame")] : [];
  /* The detent parks a plate in the gate only if the strip advances by exactly
     one card pitch per beat — so measure the pitch, never assume it. (Guessing
     it cost a reel where no plate ever landed in the light.) */
  let filmC0 = 0, filmPitch = 0;
  /* the camera's own geometry, measured once per resize: its box, and the
     radius its lens reaches once the machine has finished travelling.
     43.5% / 30.9% / 30.5%-wide come from the artwork itself. */
  let camLensW = 0, camLensH = 0, camLensR = 0;
  const camFrame = { x: 0, y: 0, w: 0, h: 0 };   // pusher layout rect = the frame at rest
  function measureFilm() {
    if (filmCards.length < 2 || !marketExperience) return;
    /* BOTH offsets have to go to zero. The strip's transform reads
       `var(--market-film-capture-x, var(--market-film-x))`, so zeroing only
       the second one leaves the film exactly where it was and the "origin" is
       measured wherever the strip happens to be parked — putting card 0's
       centre at the gate and shifting the entire reel by four plates. It
       survived this long only because the measurement used to run once,
       before capture-x existed; ANY resize would have hit it. */
    const prevX = marketExperience.style.getPropertyValue("--market-film-x");
    const prevC = marketExperience.style.getPropertyValue("--market-film-capture-x");
    const prevT = filmCards.map((c) => c.style.transform);
    marketExperience.style.setProperty("--market-film-x", "0px");
    marketExperience.style.setProperty("--market-film-capture-x", "0px");
    filmCards.forEach((c) => { c.style.transform = "none"; });
    const r0 = filmCards[0].getBoundingClientRect();
    const r1 = filmCards[1].getBoundingClientRect();
    filmC0 = r0.left + r0.width / 2;
    filmPitch = (r1.left + r1.width / 2) - filmC0;
    filmCards.forEach((c, i) => { c.style.transform = prevT[i]; });
    if (prevX) marketExperience.style.setProperty("--market-film-x", prevX);
    else marketExperience.style.removeProperty("--market-film-x");
    if (prevC) marketExperience.style.setProperty("--market-film-capture-x", prevC);
    else marketExperience.style.removeProperty("--market-film-capture-x");
    fitWords();
    const cam = root.querySelector(".market-pusher");
    if (cam) {
      const r = cam.getBoundingClientRect();
      camLensW = r.width; camLensH = r.height;
      camFrame.x = r.left; camFrame.y = r.top; camFrame.w = r.width; camFrame.h = r.height;
      /* radius the lens reaches once the camera has finished travelling */
      camLensR = r.width * 0.305 * 0.5 * 4.2 * 0.72;
    }
  }
  /* The hero word is the whole point of a plate, so it must never be cut off.
     Widths are MEASURED, not estimated from the character count: caps in Space
     Grotesk vary by 35% in width, so "WEBSITE" fits at a size where "SOFTWARE"
     overflows by 29px — which is exactly how the reel shipped reading
     "SOFTWAR". scrollWidth/clientWidth are layout-space, so this is honest
     even when the plate is mid-turn. Runs on mount and on resize only. */
  function fitWords() {
    for (const card of filmCards) {
      const word = card.querySelector(".plate__word");
      if (!word) continue;
      word.style.fontSize = "";
      const have = word.clientWidth;
      const need = word.scrollWidth;
      if (!have || need <= have) continue;
      const base = parseFloat(getComputedStyle(word).fontSize);
      word.style.fontSize = `${(base * (have / need) * 0.985).toFixed(1)}px`;
    }
  }
  /* Measure ONCE, up front, while nothing is moving. Measuring lazily on the
     first live frame put a forced layout — two rects, nine scrollWidth reads
     and nine font-size writes — inside the exact frame the reel starts to
     travel: a repeatable 50ms hitch at the very moment the film begins to
     move, which is precisely where the eye is. Waits for fonts, because a
     word measured in the fallback face is measured wrong. */
  if (filmCards.length) {
    const warm = () => { filmPitch = 0; measureFilm(); };
    if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(warm));
    else requestAnimationFrame(warm);
  }
  /* ── the projector (real 3D, CC0 Poly Haven model) ──
     Yash's sketch: high and behind, cone falling onto the strip below. Mounted
     lazily on first approach so acts 1–2 never pay for it. */
  const projectorCanvas = root.querySelector(".market-projector");
  let projector = null, projectorPending = false;
  function mountProjector() {
    if (projector || projectorPending || reduced || !projectorCanvas) return;
    projectorPending = true;
    createProjector(projectorCanvas, { dprCap: 1.6 })
      .then((p) => { projector = p; projectorPending = false; })
      .catch((e) => { projectorPending = false; console.error("[intro] projector unavailable:", e); });
  }

  const lensTakeEl = root.querySelector(".market-lens-takeover");
  const irisEl = root.querySelector(".market-iris");
  const consultZero = root.querySelector(".consult-zero");
  root.classList.toggle("source-animation", USE_ZERO_MIRROR);
  const lightFrame = root.querySelector(".consult-zero__light-frame");
  const consultHandCanvas = root.querySelector(".consult-zero__hand-canvas");
  const marketPusherEl = root.querySelector(".market-pusher");
  let marketCam3d = null;
  let ribbonCaption = null, ribbonCaptionIdx = -1;
  let filmVel = 0, filmVelLast = 0, filmVelAt = performance.now();
  let filmStillSince = performance.now(); // wall-clock rest detector (31 Aug deadband)
  /* Every speed-driven term in marketCamera clamps at +/-4, the reference's
     VEL_CLAMP in plates/second. But its reel spends 60vh per plate and ours
     about 0.17vh, so our plates/second runs ~10x hotter — measured ~12 at a
     crawl, ~50 at a normal wheel. Every term therefore sat pinned at maximum
     for the whole beat: the speed response was a switch, not a response.
     applyRaw runs twice per frame (ScrollTrigger onUpdate + the ticker, the
     second with raw=0), attenuating those to ~0.43x: 5 / 22 / 45. 0.09 puts a
     normal wheel at ~2, mid-scale in the 0-4 band the coefficients were tuned
     for, and still lets a flick saturate — which is what the clamp is for. */
  /* 0.21, was 0.09. Coupled to the arrival/transport split above: slowing
     the transport 2.375x divides plates/second by the same factor, so the old
     value would have quietly drained the motion blur. 0.09 * 2.375 = 0.21.
     ⚠️ These two changes are ONE change - 0.21 without the stretches would
     over-drive every velocity term straight back into the +/-4 clamp
     saturation the note above exists to record as fixed. */
  const VEL_NORM = 0.21;
  let ribbonPointerOn = false, ribbonHoverAt = 0;
  let lastRaw = 0;                 // last applied scroll raw, for onReady re-application
  const BURN_START_P = 0.945;       // authored hand choreography is complete
  const burnTransition = { mode: "scroll", ready: false, failed: false };
  let burnScene = null, burnPending = false, burnDisposed = false;
  const burnCanvas = USE_ZERO_MIRROR ? document.createElement("canvas") : null;
  if (burnCanvas) {
    burnCanvas.className = "intro__burning-franklin";
    burnCanvas.setAttribute("aria-hidden", "true");
    root.append(burnCanvas);
  }
  function mountBurnScene() {
    if (!burnCanvas || burnScene || burnPending || burnDisposed) return;
    burnPending = true;
    import("./mirrBillBurn.js").then(async ({ createMirrBillBurn }) => {
      if (burnDisposed) return;
      burnScene = createMirrBillBurn(burnCanvas);
      await burnScene.ready;
      if (!burnDisposed) { burnTransition.ready = true; applyRaw(lastRaw); }
    }).catch((error) => {
      if (burnDisposed) return;
      burnTransition.failed = true; // never strand the visitor if an asset fails
      console.error("[intro] supplied mirrbillburn unavailable:", error);
      applyRaw(lastRaw);
    });
  }
  /* D-076: the bill portal's fists still. Baked ONCE by the zero stage (a
     hands-only render at bridge 1.0, pointer neutral) as soon as both the
     bill scene and the fist-bump rig are ready, on a tick past p .70 — well
     before .945, so the one-off readback stall never lands inside the beat.
     Re-baked after a resize (the live fists' screen placement depends on the
     aspect, and the phone/desktop lens switch rides the same path). Until a
     still exists the portal draws leather only and the beat still completes. */
  let portalStillBaked = false;
  let portalStillTimer = 0;
  function bakePortalStill() {
    if (portalStillBaked || !burnScene || !burnTransition.ready || !consultHand?.bridgeReady) return;
    const bake = consultHand.bakePortalStill?.(burnScene.stillRequest);
    if (!bake) return;
    burnScene.setPortalStill(bake);
    portalStillBaked = true;
  }
  /* where the aperture sat when the blackout took it — the reveal circle
     blooms there (see the pupil latch in the market block) */
  const pupilLatch = { x: 0, y: 0, has: false };
  const consultHand = (!reduced || USE_ZERO_MIRROR) && consultHandCanvas
    ? createConsultHand(consultHandCanvas, { reducedMotion: reduced })
    : null;
  const zeroStageAudio = !reduced && USE_ZERO_MIRROR ? createZeroStageAudio() : null;

  /* ── black-hole exit beat ──
     Note ke burn ke BAAD ka scroll span: aakhri ember ek lensed black hole
     mein khulta hai, phir uski roshni se site nikalti hai. Mount async hai;
     jab tak engine taiyaar nahi, beatLocal cache hota rehta hai. */
  const blackholeHost = root.querySelector(".intro__blackhole");
  const beatEnabled = !reduced && Boolean(blackholeHost);
  let blackholeBeat = null;
  let beatLocal = 0;
  if (beatEnabled) {
    mountBlackholeBeat(blackholeHost, { reducedMotion: false })
      .then((b) => { blackholeBeat = b; b?.setProgress(beatLocal); })
      .catch((e) => console.error("[intro] blackhole beat unavailable:", e));
  }

  /* ── theme palettes CSS se padho ──
     Rang CSS mein hi rehne chahiye (wahi single source hai), par fog ko
     lerp karne ke liye JS ko asli hex chahiye. Isliye boot par ek baar
     har theme class laga kar values cache kar lete hain. */
  const THEMES = ["t-ember", "t-terminal", "t-indigo", "t-forest"];
  const palette = {};
  for (const t of THEMES) {
    root.classList.add(t);
    const cs = getComputedStyle(root);
    /* Read the *-src tokens, never --paper/--brass themselves. On a wide-gamut
       screen those now resolve to `color(display-p3 …)`, and three.js's Color
       parser does not understand color() — it would silently give us black.
       The -src pair is always plain hex, defined per act beside the paint
       value it mirrors. Falls back for safety if a theme ever omits it. */
    palette[t] = {
      paper: (cs.getPropertyValue("--paper-src") || cs.getPropertyValue("--paper")).trim(),
      accent: (cs.getPropertyValue("--brass-src") || cs.getPropertyValue("--brass")).trim(),
    };
    root.classList.remove(t);
  }
  let themeOn = null;
  function applyTheme(t) {
    if (t === themeOn) return;                 // har frame class chhedna mehnga hai
    THEMES.forEach((x) => {
      root.classList.remove(x);
      document.documentElement.classList.remove(x);
    });
    if (t) { root.classList.add(t); document.documentElement.classList.add(t); }
    themeOn = t;
  }
  applyTheme(steps[0].theme);

  /* ── 3D corridor ── */
  const nativeCodeStep = steps.find((step) => step.nativeScene === "code-build");
  const corridor = createCorridor(glCanvas, {
    // `scenes: false` par corridor khaali rehta hai (sirf frames) — stations
    // ki ginti phir bhi acts se aati hai, taaki progress ka ganit na toote
    // Normal motion par Act 02 ka static plane nahi banta: uski jagah native
    // resolution-independent WebGL build hai. Reduced motion par photo plane.
    images: INTRO.scenes
      ? steps.map((s) => (!reduced && s.nativeScene ? null : s.image))
      : [],
    stations: n,
    fog: palette[steps[0].theme].paper,
    accent: palette[steps[0].theme].accent,
    codeBuild: Boolean(INTRO.scenes && nativeCodeStep && !reduced),
    codeAccent: nativeCodeStep
      ? palette[nativeCodeStep.theme].accent
      : "#6dc9ff",
  });
  const peaks = corridor.peaks;

  /* ── opening orb (GPGPU) ──
     Corridor ka apna 46k-particle orb ab bhi maujood hai — ye uske UPAR apne
     canvas par baithta hai. Ek hi scene mein daalna mumkin nahi tha: corridor
     `autoClear = false` chalata hai kyunki CodeBuild/MarketGrowth usi
     framebuffer par doosra pass likhte hain, aur is orb ka poora look uske
     apne bloom/grain chain se aata hai — composer wahan daalte hi wo passes
     mit jaate.

     `ok === false` (WebGL2 ya float targets nahi) par ye khud ko mount hi nahi
     karta aur neeche purana orb waisa hi chalta rehta hai. */
  /* Only `paper` comes from CSS — that token is the page's own ground and the
     orb's gradient top stop, one surface, so it must be read from the single
     place that defines it. The rest of the orb's palette (ember, warm, cool,
     amber) stays in BUILDANTA_HERO, derived from the same chosen hue.
     `amber` used to be passed as the CSS --brass, which is the TEXT accent and
     a different job; doing that overrode the orb's glow with the type colour
     and was half of why the dust read as a separate scheme from the ground. */
  const orbHero = mountOrbHero(glCanvas, {
    paper: palette[steps[0].theme].paper,
  });
  /* Live scene chal rahi hai to Act 01 ka pre-rendered bubble plane chhupa do —
     warna do sphere ek saath dikhte hain. */
  if (orbHero.ok && corridor.station?.[0]?.mesh) corridor.station[0].mesh.visible = false;

  /* ── acts ka DOM ──
     Sirf text. Image ab DOM mein nahi hai — wo corridor mein ek 3D plane
     hai, isliye `.step__art` poora hat gaya. */
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  stage.innerHTML = steps
    .map((s) => {
      const label = s.accent
        ? s.label.replace(new RegExp(`(${esc(s.accent)})`, "i"), "<em>$1</em>")
        : s.label;
      return `
      <div class="step step--${s.layout || "idea"}">
        <div class="step__text">
          <span class="step__n">${s.n}</span>
          <h2 class="step__t" data-split-host><span class="step__split">${label}</span></h2>
          <p class="step__s">${s.sub}</p>
        </div>
      </div>`;
    })
    .join("");

  const objectsOn = INTRO.objects?.enabled !== false && !reduced;
  const acts = [...stage.querySelectorAll(".step")].map((el, i) => ({
    el,
    chars: splitChars(el.querySelector(".step__split")),
    num: el.querySelector(".step__n"),
    sub: el.querySelector(".step__s"),
    theme: steps[i].theme,
    objs: objectsOn
      ? buildObjects(el, "step__objs", steps[i].objs, {
          drift: INTRO.objects?.drift,
          parallax: 0,                        // parallax ab camera se aata hai
          space3d: { stationZ: corridor.stationZ[i] },
        })
      : null,
  }));

  /* ── title card — p=0 par wordmark, pehle scroll par uth jaata hai ── */
  const titleEl = root.querySelector(".intro__title");
  const titleKicker = root.querySelector("[data-intro-eyebrow2]");
  const titleSplitHost = root.querySelector("[data-title-split]");
  titleKicker.textContent = INTRO.eyebrow;
  titleSplitHost.textContent = `${BRAND.name} ${BRAND.suffix}`;
  const titleChars = splitChars(titleSplitHost);

  /* ── sound ── */
  const sound = createSound(INTRO.sound);
  /* The finale score. Nothing is fetched until ENTER. */
  const music = createMusic();
  const soundBtn = root.querySelector("[data-sound]");
  const soundLabel = root.querySelector("[data-sound-label]");
  const paintSound = () => {
    const live = sound.enabled && sound.running;
    const armed = sound.enabled && !sound.running;
    soundBtn.setAttribute("aria-pressed", live ? "true" : "false");
    soundBtn.setAttribute("data-armed", armed ? "true" : "false");
    soundLabel.textContent = !sound.enabled ? "Sound off" : live ? "Sound" : "Tap for sound";
  };
  paintSound();

  // Teen haalat hain, do nahi — `enabled` shuru se true hota hai par browser
  // ne audio allow nahi kiya hota.
  soundBtn.addEventListener("click", async () => {
    if (!sound.enabled) { sound.setEnabled(true); await sound.unlock(); sound.startAmbient(); }
    else if (!sound.running) { await sound.unlock(); sound.startAmbient(); }
    else sound.setEnabled(false);
    paintSound();
  });
  /* `wheel` Chrome mein AudioContext unlock karne ke liye valid gesture NAHI
     hai — sirf pointer/touch/key hain. Isliye scroll se sound apne aap chalu
     nahi hoga aur toggle ka rehna zaroori hai. */
  ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
    addEventListener(ev, async () => {
      if (!sound.enabled) return;
      await sound.unlock(); sound.startAmbient(); paintSound();
    }, { once: true, passive: true })
  );

  const eqBars = [...soundBtn.querySelectorAll(".intro__eq i")];

  /* ── initial state ── */
  gsap.set(acts.map((a) => a.el), { autoAlpha: 0 });
  acts.forEach((a) => {
    gsap.set(a.chars, { yPercent: 110, opacity: 0 });
    gsap.set([a.num, a.sub], { y: 14, opacity: 0 });
  });

  /* ══════════════════════════════════════════════
     progress → sab kuch
     ══════════════════════════════════════════════ */

  /** har act ki text khidki: station ke aas-paas, kinaare par fade */
  const HALF = 0.5 / n;                 // ek act ka aadha slot
  const FADE = HALF * 0.42;             // kitne mein fade in/out ho

  const smoothstep = (x) => {
    const t = x < 0 ? 0 : x > 1 ? 1 : x;
    return t * t * (3 - 2 * t);
  };
  const cutWindow = (value, start, end, edge = 0.010) =>
    smoothstep((value - start) / edge) * (1 - smoothstep((value - (end - edge)) / edge));
  const segmentProgress = (value, start, end) =>
    Math.max(0, Math.min(1, (value - start) / (end - start)));
  const bezier = (a, b, c, t) => {
    const u = 1 - t;
    return u * u * a + 2 * u * t * b + t * t * c;
  };

  /** 0 se 1 ke beech, kinaare par smooth */
  const win = (p, centre) => {
    const d = Math.abs(p - centre);
    if (d >= HALF) return 0;
    if (d <= HALF - FADE) return 1;
    const t = (HALF - d) / FADE;
    return t * t * (3 - 2 * t);          // smoothstep
  };

  const lerpHex = (a, b, t) => {
    const h = (s) => { s = s.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
    const A = h(a), B = h(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
  };

  let progress = 0;
  let active = 0;
  let ideaLife = 0;
  /* The authored ZeroMirror prelude parks here while its full 557-key hand
     choreography is scrubbed. The p boundary is shared with the aperture
     handoff and stays frozen; extra reading room is added by the scroll map,
     never by moving this beat. */
  const ZERO_STAGE_P = 0.788;

  function applyProgress(p) {
    progress = p;
    corridor.setProgress(p);
    /* Act 03 camera ke end par purana amber/glass Act 04 corridor bilkul
       disappear ho jata hai. Iske baad direct green consultation world hai. */
    const corridorOut = 1 - smoothstep((p - 0.675) / 0.045);
    /* Lights down for the screening room: the code world dims WITH the room
       instead of being hidden behind it — an opaque curtain over a fully lit
       scene is what made this seam feel like a cut (measured 7 Aug). */
    const houseLights = 1 - smoothstep((p - 0.392) / 0.052);
    glCanvas.style.opacity = Math.min(corridorOut, houseLights).toFixed(3);

    /* fog do padosi acts ke beech lerp hota hai — yahi "ek jagah se doosri
       jagah" ka transition hai, koi cut nahi.

       Par lerp SHARP hai, linear nahi. Linear par cream → navy raaste mein
       muddy GREY se guzarta tha, aur stations ke beech screen mari hui lagti
       thi. Ab rang har act ka apna hold karta hai aur slot ke beech ke 30%
       mein hi badalta hai — corridor hamesha kisi ek act ka rang pehne rehta
       hai, aur badalna ek edit jaisa lagta hai. */
    const slot = p * n - 0.5;                       // -0.5 … n-0.5
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(slot)));
    const i1 = Math.max(0, Math.min(n - 1, i0 + 1));
    const t = Math.max(0, Math.min(1, slot - i0));
    const ts = smoothstep((t - 0.35) / 0.3);
    const pa = palette[steps[i0].theme], pb = palette[steps[i1].theme];
    corridor.setColours(lerpHex(pa.paper, pb.paper, ts), lerpHex(pa.accent, pb.accent, ts));

    // DOM palette (text ka rang) sabse paas wale act se — usme lerp ka
    // matlab nahi, kyunki har act ka text apne hi station par dikhta hai
    const near = t < 0.5 ? i0 : i1;
    applyTheme(steps[near].theme);
    if (near !== active) { active = near; sound.step(near); }

    /* ORB — pehla frame.
       Shuru mein orb hi poora scene hai; scroll shuru hote hi wo jagah kar
       deta hai aur corridor sambhal leta hai. 0.10 tak poora chala jaata
       hai, act 01 ka text 0.06 par aana shuru hota hai — thoda overlap
       jaan-boojhkar hai, warna do alag scene lagte hain. */
    const orbFade = 1 - smoothstep((p - 0.012) / 0.088);
    if (orbHero.ok) {
      /* Naya orb purane ki JAGAH — dono ek saath nahi. Ye Act 01 ke aakhir tak
         rehta hai (pehle 0.10 par gayab ho jaata tha): pehle core mein sikudta
         hai, phir shell khulti hai aur dust dobara form leti hai. Big Bang
         (p ≈ 0.264) se pehle jagah khaali kar deta hai, isliye Act 02 ka beat
         bilkul waisa hi hai. */
      corridor.orb.setFade(0);
      orbHero.setOpacity(1 - smoothstep((p - 0.2) / 0.045));
      orbHero.setActProgress(p / 0.244);
    } else {
      corridor.orb.setFade(orbFade);   // fallback: purana 46k orb
    }
    corridor.setFrameFade(1 - orbFade);      // corridor orb ke jaane par banta hai
    root.style.setProperty("--orb-in", orbFade.toFixed(3));

    /* Opening orb → Your idea.
       Drop scroll ke saath neeche aati hai, Act 01 ke glowing core par merge
       hoti hai, phir ek restrained ripple aur persistent sparkle chhodti hai.
       Saara ganit p se hai: reverse scroll par transition bhi reverse hota hai. */
    if (ideaFx && !reduced) {
      const dropT = smoothstep((p - 0.018) / 0.064);
      const dropIn = smoothstep((p - 0.010) / 0.014);
      const dropOut = 1 - smoothstep((p - 0.070) / 0.020);
      const dropOpacity = dropIn * dropOut;
      const curve = Math.sin(dropT * Math.PI);

      const impactIn = smoothstep((p - 0.072) / 0.022);
      const impactOut = 1 - smoothstep((p - 0.102) / 0.050);
      const impact = impactIn * impactOut;
      ideaLife = smoothstep((p - 0.070) / 0.034) * win(p, peaks[0]);

      /* Core sampark par bhadakta hai, phir pehle se thoda tez rehta hai — orb
         ne boond ko sirf jhela nahi, LE liya. Dono p ka seedha function hain,
         isliye ulta scroll karne par ulte chalte hain. */
      orbHero.setCoreFlash(
        smoothstep((p - 0.070) / 0.010) * (1 - smoothstep((p - 0.080) / 0.055)),
        smoothstep((p - 0.070) / 0.030) * win(p, peaks[0])
      );

      /* Boond ab ASLI core par girti hai. Pehle (50vw, 64vh) par girti thi — wo
         purane pre-rendered artwork ke core ki jagah thi, jahan ab kuch hai hi
         nahi. Naya core apne camera se project hota hai (CodeBuild ke splash
         droplets wali hi discipline), isliye IDEA_VIEW ya fov badle to boond
         apne aap peeche jaati hai. */
      const land = orbHero.ok ? orbHero.coreScreen() : { x: 50.0, y: 64.0 };
      const dx0 = 48.6, dy0 = 37.5;
      ideaFx.style.setProperty("--drop-x", `${(dx0 + dropT * (land.x - dx0) - curve * 1.6).toFixed(3)}vw`);
      ideaFx.style.setProperty("--drop-y", `${(dy0 + dropT * (land.y - dy0)).toFixed(3)}vh`);
      ideaFx.style.setProperty("--drop-o", dropOpacity.toFixed(3));
      ideaFx.style.setProperty("--drop-sx", (0.76 - dropT * 0.14).toFixed(3));
      ideaFx.style.setProperty("--drop-sy", (0.96 + dropT * 0.42).toFixed(3));
      ideaFx.style.setProperty("--impact-o", impact.toFixed(3));
      ideaFx.style.setProperty("--impact-scale", (0.42 + impactIn * 1.34).toFixed(3));
      ideaFx.style.setProperty("--idea-life", (ideaLife * 0.78).toFixed(3));
      ideaFx.style.setProperty("--spark-o", (ideaLife * (0.44 + impact * 0.56)).toFixed(3));



      /* Teen splash droplets native Act 02 base par land karti hain.
         Target CSS guess nahi: CodeBuild ke apne camera se projected base
         aata hai, isliye desktop/mobile dono par boondein geometry ko chhooti
         hain. .244 / .256 / .268 wahi teen WebGL impact-ring beats hain. */
      const narrow = matchMedia("(max-width: 640px)").matches;
      const projectedBase = corridor.codeBase?.();
      const baseX = Number.isFinite(projectedBase?.x) ? projectedBase.x : 50;
      const baseY = Number.isFinite(projectedBase?.y)
        ? projectedBase.y
        : narrow ? 76 : 78;
      /* Teenon boondein ab CORE se nikalti hain, 64vh se nahi — wo purane
         artwork ke core ki jagah thi. Wahi ±1.5vw ka fan, bas asli jagah par. */
      const originX = land.x, originY = land.y;
      const paths = [
        { start: [originX - 1.5, originY], control: [narrow ? 34 : 32, 29], target: [baseX, baseY] },
        { start: [originX, originY], control: [narrow ? 70 : 72, 31], target: [baseX, baseY] },
        { start: [originX + 1.5, originY], control: [narrow ? 76 : 79, 47], target: [baseX, baseY] },
      ];

      paths.forEach((path, i) => {
        /* 0.095 → 0.140: pehle boondein tab nikalti thi jab idea ban hi rahi
           thi. Ab pehle shell khulti hai aur dust form leti hai, PHIR orb use
           aage bhejta hai. 0.264 ka takkar-beat waisa hi hai. */
        const start = 0.140 + i * 0.010;
        const end = 0.264; // All 3 liquid droplets converge & collide at 0.264!
        const travel = smoothstep((p - start) / (end - start));
        const visible =
          smoothstep((p - start) / 0.024) *
          (1 - smoothstep((p - (end - 0.008)) / 0.030));
        const x = bezier(path.start[0], path.control[0], path.target[0], travel);
        const y = bezier(path.start[1], path.control[1], path.target[1], travel);

        const drop = catchDrops[i];
        if (drop) {
          drop.style.setProperty("--x", `${x.toFixed(3)}vw`);
          drop.style.setProperty("--y", `${y.toFixed(3)}vh`);
          drop.style.setProperty("--o", visible.toFixed(3));
          drop.style.setProperty("--s", (0.8 + travel * 0.4).toFixed(3));
        }
      });

      /* BIG BANG SUPERNOVA EXPLOSION BOOM at p = 0.264 impact */
      if (bigBangEl) {
        const bangIn = smoothstep((p - 0.258) / 0.018);
        const bangOut = 1 - smoothstep((p - 0.276) / 0.045);
        const bangOpacity = bangIn * bangOut;
        const bangScale = 0.1 + bangIn * 2.8;

        bigBangEl.style.setProperty("--bang-x", `${baseX.toFixed(3)}vw`);
        bigBangEl.style.setProperty("--bang-y", `${baseY.toFixed(3)}vh`);
        bigBangEl.style.setProperty("--bang-o", bangOpacity.toFixed(3));
        bigBangEl.style.setProperty("--bang-s", bangScale.toFixed(3));
      }

    } else {
      ideaLife = 0;
    }

    /* title card: sirf shuruaat mein */
    const titleOut = Math.min(1, p / 0.055);
    titleEl.style.opacity = String(1 - titleOut);
    titleEl.style.visibility = titleOut >= 1 ? "hidden" : "visible";
    gsap.set(titleChars, { yPercent: -46 * titleOut, opacity: 1 - titleOut });
    gsap.set(titleKicker, { y: -14 * titleOut, opacity: 1 - titleOut });

    /* Act 03 is the full AFTERIMAGE DOM experience: editorial hero first,
       then a camera push into the signal core and a horizontal film reel. */
    if (marketExperience) {
      const marketIn = smoothstep((p - 0.425) / 0.070);
      /* Camera ko pehle lens ke andar genuinely push karte hain. Market
         scene sirf tunnel full-frame hone ke baad dissolve hota hai. */
      /* Camera stays intact outside the expanding Earth portal. Once the
         portal covers the frame, the old market plate can disappear. */
      /* ── THE HANDOVER (Yash, 17:46) ────────────────────────────────
         Through the lens → a real beat of black → a green sphere that grows
         into the world. The act's exit and the lens takeover are the SAME
         curve now, so the machine swallowing the frame is what ends ACT 03,
         and it all happens under the black rather than over the reel. */
      /* ── THE HANDOVER, IN THREE BEATS (Yash, 18:20) ───────────────────
         1. APPROACH  .684→.716  the camera travels toward you. The reel is
            STILL RUNNING behind it — you watch the machine grow against live
            film, which is what makes it read as coming to you rather than the
            scene simply ending.
         2. HOLD      .716→.726  it stops, at rest, filling the frame and
            still plainly a camera. The film clears behind it here. The pause
            is what makes entering feel like a choice rather than a fall.
         3. ENTER     .726→.752  you push into the glass; the lens takes the
            frame and the screen goes black. */
      const approach = smoothstep((p - 0.684) / 0.032);
      const enter = smoothstep((p - 0.726) / 0.026);
      const lensTake = enter;
      /* The act wrapper carries the camera, so it has to live until the black
         is complete — otherwise the machine dissolves mid-journey. */
      const marketOut = 1 - smoothstep((p - 0.752) / 0.008);
      const marketOpacity = marketIn * marketOut;
      const local = Math.max(0, Math.min(1, (p - 0.48) / 0.24));
      const zoomT = smoothstep((local - 0.08) / 0.38);
      const heroReveal = smoothstep((p - 0.472) / 0.028);
      const copyOpacity = heroReveal * (1 - smoothstep((local - 0.12) / 0.16));
      /* The strip appears WITH the machine, not before it: it unspools
         from the feed reel as the machine drives in (Yash, 22:58). Same
         window as the entry translate below — fade and descent are one
         motion. */
      /* ── THE SEQUENCE (Yash, 21 Aug 11:45) ────────────────────────────
         "first only camera will appear ... then on scroll the camera will
         move to the centre ... when the camera reaches the centre THEN the
         reel will come from the back of the camera to the front on parallax
         ... then on scroll the reel will flow."
         So the film waits for the machine to land (travel completes .620)
         and arrives on its own beat instead of fading in mid-drive. */
      /* RETIMED to the frame Yash pointed at (21 Aug 12:04): he sent the
         machine mid-drive, still angled and left of centre, and said the
         reel starts THERE. Measured against project('lens'), that frame is
         p=.584 (lens x .407 against his .404) — so the film sets off while
         the camera is still travelling, and the two arrivals overlap by
         design rather than queueing. */
      const filmEmerge = smoothstep((p - 0.584) / 0.062);   // .584 -> .646
      /* ⚠️ The FADE must start with the MOTION, not after it. Measured: with
         filmIn opening at .586 the ribbon painted ZERO pixels at the exact
         frame Yash pointed to and was not perceptible until ~.590 — 99px of
         scroll after the beat he named. It now opens on the same frame and
         crosses perceptibility within ~2 thousandths, so the reel is there
         when he says it is. */
      const filmIn = smoothstep((p - 0.5835) / 0.010);   // reach VISIBLE, not just non-zero
      /* filmOut used to end the strip at local .90 (p=.696) — before the
         camera had travelled at all, so the reel died and then a machine
         zoomed at an empty screen. The strip now lives through the whole
         approach and clears in the HOLD, on p, not on the act's own local
         clock (which is clamped to 1 by p=0.72 and cannot express this). */
      const filmOut = 1 - smoothstep((p - 0.714) / 0.012);
      /* SETTLE AND HOLD (Yash MCQ): the strip is not linear in scroll. A
         detent curve spends most of its time parked with a plate in the gate
         and crosses the gap between plates quickly — a projector's rhythm. */
      /* travel begins only once the strip has LANDED from the reel
         (.586) — it used to start at local .27, which would now spend half
         the plates while the band is still invisible/airborne. Same end
         (.85 local = p .684), denser detent rhythm. */
      /* the transport starts only once the film has ARRIVED — it used to
         begin at local .44 (p .586), while the machine was still driving in
         and before the reel existed on screen */
      /* the transport picks up while the arrival is still settling — at
         .640 the wave was long dead (5% of peak by .620) and the depth
         travel 98% done by .622, so the act sat still for two hundredths */
      /* ⚠️ TRANSPORT NOW FINISHES WHERE THE ZOOM BEGINS (22 Aug).
         Was /0.078, i.e. .628 -> .706 - which ran PAST the approach at .684,
         so the camera started pushing in while the last two plates were still
         arriving and IoT was zoomed past rather than seen. /0.056 lands the
         ninth plate (IoT) in the gate at exactly .684, the frame the push
         starts on.
         Deliberately done here and NOT by moving `approach` to .706: .684 is
         the head of the documented handover chain (.684 approach, .716 hold,
         .726 enter, .744 sphere, .752 out) and the approach window is only
         0.032 wide - starting it at .706 would end it at .738, past the hold.
         Compressing the transport leaves every protected boundary untouched. */
      const filmRaw = smoothstep((p - 0.628) / 0.056);       // .628 -> .684
      const slots = Math.max(filmCards.length - 1, 1);
      /* ⚠️ posScroll is the RAW scroll position; `pos` below is the DETENTED
         one. Everything printed on the film - the DOM strip, both spools, the
         crank, the shutter, the iris and the 3D ribbon - must ride the same
         number, or the pictures step while the sprockets slide. Previously
         only filmTravel was detented and `pos` stayed linear, so the strip
         and the spools moved smoothly under a stepping ribbon. */
      const posScroll = filmRaw * slots;
      const idx = Math.floor(posScroll);
      const frac = posScroll - idx;
      /* ── THE SNAP OVERSHOOTS (22 Aug) ───────────────────────────────
         The reference lands each step on a SPRING (stiffness 73, damping 12)
         whose signature is a single overshoot of ~3.1% of a slot peaking
         ~516ms in. That overshoot is most of what makes its stepping read as
         mechanical rather than interpolated.
         ⚠️ REPRODUCED AS A PURE FUNCTION OF frac, NOT AS A SPRING. A real
         spring is an integrator: its output depends on how it arrived, so the
         same scroll position would render differently coming down than going
         back up. This act's contract is the opposite — every motion reversible
         from scroll progress, which tools/verify-reverse.cjs exists to assert.
         Verified: peak 0.03103 at frac .752, continuous at both joins,
         d(0)=0, d(1)=1. */
      const OVERSHOOT = 0.031;      // 3.1% of a slot, the reference's own
      const HUMP_PEAK = 0.5787;     // max of sin(pi t)(1-t), makes OVERSHOOT exact
      let detent;
      if (frac < 0.34) detent = 0;
      else if (frac < 0.66) {
        const t = (frac - 0.34) / 0.32;
        detent = 1 - Math.pow(1 - t, 3);                  // cubic-out rise
      } else if (frac < 0.92) {
        const t = (frac - 0.66) / 0.26;                   // the settle
        detent = 1 + (OVERSHOOT / HUMP_PEAK) * Math.sin(Math.PI * t) * (1 - t);
      } else detent = 1;
      const scrollTravel = (idx + detent) / slots;
      /* reduced motion parks the whole transport on plate 4 at the SOURCE, so
         the strip and the spools park with the ribbon instead of travelling
         under it - the old `reduced ? 4` guards sat only on filmPos and the
         caption index and left the rest moving */
      const pos = reduced ? 4 : scrollTravel * slots;
      const filmTravel = pos / slots;
      /* TRANSPORT SPEED in plates/second — the reference drives its arc
         amplitude, its per-plate curvature and its shear from exactly this,
         and its own doc is emphatic that speed changes curvature, scale and
         blur but NEVER rotation. Measured from the driver rather than from
         scroll, so a detent pause reads as a genuine stop. */
      {
        const nowMs = performance.now();
        const dt = Math.min(0.1, Math.max(0.001, (nowMs - filmVelAt) / 1000));
        const posNow = pos;                     // already detented at source
        const raw = (posNow - filmVelLast) / dt;
        /* FIX-FORWARD (25 Aug): dt-based, was 0.25/call. A per-call factor
           decays at whatever rate the caller runs — throttled rAF (headless
           rigs, background tabs) stretched the ~0.4s settle to many seconds,
           and a 120Hz display would halve it. dt*15 ≡ 0.25 at 60Hz, so the
           tuning the designer shipped is preserved at the rate it was
           tuned at. */
        filmVel += (raw - filmVel) * Math.min(1, dt * 15); // smoothed, or it jitters
        /* FIX-FORWARD (25 Aug, part 2): SNAP to exact zero below a deadband.
           The art sampler in the ribbon frag BRANCHES at smearPlates <= 1e-5
           - one exact sample at rest vs a 9-tap walk while moving - so an
           asymptotic filter that never quite reaches zero parks the band
           permanently on the blurred branch, and WHICH branch you rested on
           depended on the approach (verify-reverse .690: fwd held ~0.003 and
           stayed soft, rev hit exact 0 and stayed crisp - proven bit-identical
           once filmVel was pinned equal). 0.02 plates/s pre-NORM is uVel
           0.0042: the 9 taps sit within 0.15mm of the exact sample there, so
           the snap itself cannot pop. Honours the shader's own contract:
           "the approved still frame stays bit-identical" at rest. */
        if (Math.abs(filmVel) < 0.02) filmVel = 0;
        /* FIX-FORWARD (31 Aug): the deadband above still lost a race under
           load — it needs enough TICKS to decay there, and a busy machine
           (or throttled headless rig) can fit too few in a settle window,
           parking the art sampler on its blur branch on one approach only
           (verify-reverse .660 flag, 4.5%, reproduced twice). Wall-clock
           beats tick-count: once the driver has been STILL for 250ms, the
           transport is at rest by definition — snap exactly to zero. */
        if (Math.abs(raw) > 0.02) filmStillSince = nowMs;
        else if (nowMs - filmStillSince > 250) filmVel = 0;
        filmVelLast = posNow;
        filmVelAt = nowMs;
      }
      const humanIn = smoothstep((filmTravel - 0.72) / 0.12);
      const humanPush = smoothstep((filmTravel - 0.72) / 0.28);
      /* Longer capture runway: reel insertion ke baad camera ek frame mein
         jump nahi karta; scroll user ko lens tunnel ke andar travel karata hai. */
      /* The capture beat (camera swallows the reel into WE SCALE) used to
         start at .68 and drag the strip BACKWARDS while plates were still
         queuing — the last three never reached the gate. It now waits until
         the reel has finished. */
      const cameraCapture = enter;
      /* Scale is piecewise so the two beats are separable: the travel brings
         the machine to x4.2 — arrived, filling the frame, still readable as a
         camera — and only the ENTER beat pushes past that into the glass. One
         blended curve cannot express a stop, which is why it read as a single
         lunge. */
      /* THE MACHINE KEEPS TRAVELLING (Yash, 20:39). Capping it at 4.2x fixed
         the sharpness but froze the thing you are supposed to be moving into —
         so the lens grew on its own and read as coming AT you. It carries on
         to 13x; the sharp lens tracks its lens plate exactly, so the whole
         scene scales together and you fly IN. The body going soft as it passes
         is accepted (his call): by then it is a blur at the corners for a
         fraction of a second, which is what happens in a real camera too. */
      const camScale = 1 + approach * 3.2 + enter * 8.8;
      marketExperience.style.setProperty("--market-camera-scale", camScale.toFixed(3));
      /* CENTRE IT. The scale origin is the lens, so the lens stays wherever it
         started — measured at (683, 341) against a viewport centre of
         (720, 450), off by (-37, -109) for the whole approach. These
         translations sit BEFORE the scale in the transform list, so they act
         in screen pixels and are not multiplied by it. */
      /* EXACT, not measured-once (Yash, 12:07: "align the shutter opening
         with that green circle"). The old constants were empirical offsets
         from the PNG era and left the lens ~(26,45)px off the viewport
         centre — but the green reveal circle (--zero-reveal/--hole) lives at
         EXACTLY 50vw/50vh. The push pivot IS the lens by the drop-in
         contract, so steering the pivot to the centre lands the aperture on
         the circle by construction. (Computed here; consumed in the rect
         composition below. The old --market-camera-dx/dy CSS vars fed the
         retired PNG-era transform blocks and are dead.) */
      const lensDX = 0, lensDY = 0;   // superseded — see camDX/camDY below

      /* The takeover TRACKS the camera's own lens plate rather than growing on
         its own schedule — same width fraction (30.5%), same scale, same
         internal lens scale. That lock is what makes it read as one object
         being flown into instead of two things moving independently. */
      const takeR = camLensW * 0.305 * 0.5 * camScale * (0.72 + enter * 0.55);
      root.style.setProperty("--lens-r", takeR.toFixed(1));
      /* AND IT MUST GO AWAY AGAIN. I switched this on when the entry began and
         never switched it off, so the lens sat over the whole rest of the page
         and swallowed WE SCALE entirely — visible at p=0.88, an act and a half
         later. It now fades out under the black that replaces it. */
      /* RETIRED (Yash, 12:07). The CSS takeover + wedge iris were built when
         the lens was a scaled PHOTOGRAPH and could not stay sharp at 13x. The
         model's own nine-blade aperture is native-resolution at any zoom and
         now does the opening itself — two irises on screen was exactly the
         "what is that grey blade thing" confusion. Elements stay in the DOM,
         permanently at opacity 0. */
      const lensTakeOn = 0;
      root.style.setProperty("--lens-take", "0");
      /* ── THE IRIS OPENS AS YOU FALL IN (Yash, 20:54) ──────────────────
         He asked why the lens stops. It never did — the angle advances a
         constant 148deg per step the whole way. What stops is the VISIBLE
         motion: rotation displaces a pixel by radius x angle, and once the
         lens fills the frame you are only seeing its centre, where the radius
         is tiny and the blades converge. Measured, the proportion of pixels
         changing per frame collapses as it grows:
             574px wide  37.5%      1727px  4.6%
             976px       38.5%      2553px  2.1%
         Spinning faster would fix the symptom and break the 1:1 lock with the
         spools. Opening the aperture fixes the cause: radial motion is
         strongest exactly where rotation is weakest — at the centre, which is
         all you can see by then. The rotation is untouched; this is an extra
         motion on top, which is how he asked for it.
         Timed with the blackout so the opening aperture reveals the dark
         rather than the inside of a scaled photograph. */
      /* Opened LATER and slower (Yash, 21:05), so the blades stay on screen
         and turning for most of the descent instead of being pushed past the
         edges while the fall is still running. The aperture itself is built
         further down, where the blade angle is available. */
      /* The aperture opens at the very END now. The blades are what should be
         moving for the descent (his point); the aperture is how it finishes. */
      /* THE SHUTTER OPENS (Yash, 12:07): the nine 3D blades part from
         .730, fully open by .752 — the pupil grows from 9mm to the whole
         bore, centred (by the exact-centring above) on the same screen
         point where the green circle blooms at .744. Through the opening:
         the throat's dark, then the blackout's black, then the circle. */
      /* Order matters: the shutter must finish opening BEFORE the blackout
         rises (.726-.738) or the mechanism opens invisibly behind black —
         the first cut had it at .730 and the whole reveal played in the
         dark. Now: push toward the aperture -> blades spiral open .710-.732
         in full light -> the blackout closes over the OPEN aperture -> the
         green circle blooms in it at .744, dead on the pupil's point. */
      const irisOpen = smoothstep((p - 0.710) / 0.022);
      /* It sits BEHIND the strip while the reel plays, so it can never cover a
         service word — but a machine travelling toward you has to pass the
         film, not stay pinned behind it. It comes forward on the APPROACH. */
      marketExperience.style.setProperty("--market-camera-front", approach.toFixed(3));
      const cameraDepth = smoothstep((cameraCapture - 0.18) / 0.72);
      const cameraFlash = Math.sin(cameraCapture * Math.PI);
      const cameraRecoil = Math.sin(cameraCapture * Math.PI * 2) * (1 - cameraCapture);
      /* ══ ONE DRIVER FOR THE WHOLE MACHINE (Yash, 19:18) ══════════════
         The parts: the two wheels on top are the FEED spool (left, paying film
         out) and the TAKE-UP spool (right, winding it in). The thing turning
         at the centre of the lens is the SHUTTER.

         They were running off TWO DIFFERENT NUMBERS. The spools followed
         `pos` — the film's travel in plate-pitches, which is also what moves
         the strip. The shutter followed `filmTravel`, a different quantity
         entirely: detented AND normalised to 0-1. So the shutter was on a
         different curve from the film it is supposed to be exposing and from
         the wheels feeding it, and nothing could stay in step.

         Everything now comes from `pos` alone: one number, three constants, a
         fixed ratio. The strip, the spools and the shutter cannot drift apart,
         because there is nothing left for them to drift against.

         The ratio is 1:1 — the shutter turns exactly as fast as the spools.
         Not physical: a real shutter turns once per FRAME, hundreds of times
         faster. But at 2:1 against a pattern that repeated every 90deg, the
         lens advanced 428-542deg between samples and 542 mod 90 is 2deg — it
         landed in a near-identical position and read as STOPPED, then jumped.
         The angle was locked the whole time; the ambiguity was in what you
         could see. Rotation you cannot read is not rotation. 1:1 is also the
         easiest lock for a human to verify: the lens and the wheels turn
         together, once each. */
      const SPOOL_TURNS_PER_PLATE = 1.45;
      const SHUTTER_TURNS_PER_PLATE = SPOOL_TURNS_PER_PLATE;
      /* ── AND IT MUST NOT STALL WHILE IT TRAVELS (Yash, 19:59) ─────────
         `pos` stops the moment the film runs out, and the entry term does not
         begin until you are already going into the lens — so between them the
         spools and the shutter froze for the whole approach and hold, which is
         exactly where the machine should look most alive. Measured before this:
         11.60 turns, unchanged, from p=0.686 to p=0.724.
         `handover` is monotonic across the entire journey, so there is no gap
         left for it to stall in. It replaces the old entry-only term rather
         than adding to it — two overlapping drivers would double the rate at
         the end.
         8 turns is derived, not chosen: the spools run at ~2.8 turns per
         screen-height during the reel, and the journey is ~2.9 screens, so 8
         keeps the rate continuous across the join. A different number would
         make the machine visibly change gear the instant the film ends. */
      const handover = Math.max(0, Math.min(1, (p - 0.684) / (0.752 - 0.684)));
      const HANDOVER_TURNS = 8;
      const cameraSpin = pos * SPOOL_TURNS_PER_PLATE + handover * HANDOVER_TURNS;
      const cameraCrank = Math.sin(cameraSpin * Math.PI * 2) * 18;
      // Travel scales with the strip: 10 plates (was 7 originally, briefly
      // 20 during the A/B judging pass).
      if (!filmPitch) measureFilm();
      const gateX = innerWidth * 0.5;             // dead centre: no machine to clear
      const filmX = filmPitch
        ? (gateX - filmC0 - pos * filmPitch) / innerWidth * 100   // → vw, exact
        : 38 - filmTravel * 118;                                   // pre-measure
      const transitionT = smoothstep((p - 0.425) / 0.095);
      const transitionOpacity = Math.sin(transitionT * Math.PI) * marketIn;
      const marketSceneIn = smoothstep((p - 0.455) / 0.055);

      /* LIGHTS DOWN, THEN THE LAMP (Yash MCQ): the code world dims to a dark
         room first; only then does the projector strike and the reel start. */
      const roomIn = smoothstep((p - 0.392) / 0.052);
      const roomOut = 1 - smoothstep((p - 0.752) / 0.008);
      const lampStrike = smoothstep((local - 0.19) / 0.06);   // projector arrives AFTER the opening
      marketExperience.style.setProperty("--market-room",
        (roomIn * roomOut * (0.5 + 0.5 * lampStrike)).toFixed(3));
      marketExperience.style.setProperty("--market-lamp",
        (lampStrike * filmIn * filmOut).toFixed(3));

      /* black is fully up by .706 and HOLDS to .722 — a real beat of nothing,
         which is what makes the sphere land. The sphere is the consult world's
         own clip-circle opening (see --zero-reveal below).
         MOVED .768→.744 (project brief, 19 Aug): the blackout completes at
         .738, so the old start left the screen empty .738→~.780 — a stall,
         not a beat. One beat of black now, then the aperture. ⚠️ This window
         must equal consultReveal's — they are the SAME circle seen from the
         market side and the consult side; moving one without the other opens
         a hole onto a still-clipped world and the stall survives. */
      /* .738, was .744. The blackout completes at .738, so a .744 start left
         six thousandths of pure black between the push finishing and the
         aperture opening - the "one beat of black" this comment used to
         describe, which reads as a stall rather than a beat. The end stays at
         .788 so nothing downstream moves; only the dead gap is removed. */
      const sphere = smoothstep((p - 0.738) / 0.050);      // .738 → .788
      /* The layer turns the lens's near-black into TRUE black. It is full
         BEFORE the aperture opens, so what you pass through into is the dark
         and not the inside of a scaled photograph — it is hidden behind the
         lens until the iris parts, so arriving early costs nothing. */
      root.style.setProperty("--blackout", smoothstep((p - 0.726) / 0.012).toFixed(3));
      root.style.setProperty("--hole", sphere.toFixed(3));

      root.classList.toggle("market-live", marketOpacity > 0.002);
      marketExperience.style.setProperty("--market-opacity", marketOpacity.toFixed(3));
      marketExperience.style.setProperty("--market-zoom", (1 + zoomT * 3.75).toFixed(3));
      marketExperience.style.setProperty("--market-copy", Math.max(0, copyOpacity).toFixed(3));
      /* Never exactly zero while ACT 03 is open. An element at opacity 0 is
         not rasterised at all, so the first non-zero frame had to paint the
         whole 191vw strip in one go — nine plates, their veils and light
         pools, both sprocket bands and the end-fade mask. Measured: a
         repeatable 50–66ms frame at p≈0.539, which is the exact instant the
         film starts to travel and the only place the eye is looking. A floor
         of 0.004 is invisible on this background and moves that raster into
         the quiet editorial beat before it. */
      /* The strip survives the whole APPROACH and clears during the hold —
         it used to fade before the camera had even started moving, so the
         reel died and then a machine zoomed at an empty screen. */
      /* ⚠️ filmOut IS ALREADY (1 - smoothstep((p-.714)/.012)) — multiplying
         by the same expression again squared the envelope, so the authored
         .714-.726 fade was never the fade that ran. Harmless only because
         the 13x machine covers the strip through that window. */
      const filmVis = filmIn * filmOut * marketOpacity;
      marketExperience.style.setProperty("--market-film-opacity",
        (filmVis > 0.004 ? filmVis : (marketOpacity > 0.02 ? 0.004 : 0)).toFixed(3));
      marketExperience.style.setProperty("--market-film-x", `${filmX.toFixed(2)}vw`);
      marketExperience.style.setProperty("--market-film-capture-x", `${(filmX * (1 - cameraCapture)).toFixed(2)}vw`);

      /* the machine: present with the act, turning with the film */
      if (!reduced) {
        if (marketOpacity > 0.02) mountProjector();
        projector?.setPresence(lampStrike * filmIn * filmOut * marketOpacity);
        projector?.setFilm(pos);
      }

      /* CURVE INTO DEPTH + THREAD THROUGH THE MACHINE.
         Each plate is transformed by where it sits on screen, not by its index
         — so the curve travels with the film. Plates far from the gate rotate
         away and darken (no hard cut at the screen edge, ever); the plate at
         the gate is lit and square to camera. Gate sits right of the
         projector body, where the lamp actually points. */
      /* Runs from the moment ACT 03 opens, not from the moment the reel starts
         moving. The strip's own opacity still gates what is SEEN, so this is
         visually free — but it means the nine plates get their first transform
         and their first rasterisation spread across the quiet editorial beat
         instead of all landing on the single frame the film starts to travel.
         That one frame measured 50–63ms, repeatably, at the exact instant the
         eye follows the film. */
      if (filmCards.length && marketOpacity > 0.002) {
        /* Positions are DERIVED, never measured: a getBoundingClientRect per
           card per frame forced ten layouts a frame and was the real source
           of the "not smooth" (p95 frame time 26ms, worst 225ms). Since the
           strip is placed so card `pos` sits in the gate, card i is exactly
           (i - pos) pitches away from it. */
        for (let ci = 0; ci < filmCards.length; ci++) {
          const card = filmCards[ci];
          const d = ((ci - pos) * filmPitch) / innerWidth;   // -1 … +1 from the gate
          const away = Math.min(Math.abs(d) / 0.62, 1); // 0 at gate, 1 far out
          const curve = away * away;
          const rotY = -Math.sign(d) * curve * 38;
          const lit = 1 - Math.min(Math.abs(d) / 0.17, 1);
          /* Depth by scale and turn ONLY — never translateZ. Under the strip's
             perspective a pushed-back plate is dragged toward the vanishing
             point, and off-centre plates drift far enough to slide over their
             neighbours: measured, the CRM plate cut the word "SOFTWARE" in
             half. A rotateY about a plate's own centre plus a scale ≤ 1 can
             only ever shrink its footprint, so plates cannot collide. */
          card.style.transform =
            `perspective(1500px) rotateY(${rotY.toFixed(1)}deg) scale(${(1 - curve * 0.14).toFixed(3)})`;
          /* nearest the gate paints last, so the lit plate is never overlapped */
          card.style.zIndex = String(60 - Math.round(Math.min(Math.abs(d), 1) * 50));
          /* Vault rule M2: never animate `filter` — each change re-rasters the
             element, and ten plates a frame was half the jank. A veil layer's
             opacity gives the same read on the compositor.
             Darkening the others is only half of it: the plates' own artwork
             varies enough in brightness that a dark plate under the lamp still
             measured DIMMER than a bright plate outside it (SEO 20 vs 25).
             So the gate plate also gets light ADDED — which is what the lamp
             is supposed to be doing to it. */
          card.style.setProperty("--veil", (0.80 - lit * 0.74).toFixed(2));
          card.style.setProperty("--lit", (lit * lit * 0.62).toFixed(3));
          /* Two separate falloffs: the depth curve is wide so neighbouring
             plates still read as a strip, while visibility dies hard past
             0.26 of the screen so nothing is ever bright at the edge. */
          const edgeFade = 1 - Math.min(Math.max((Math.abs(d) - 0.26) / 0.13, 0), 1);
          card.style.opacity = ((1 - curve * 0.35) * (0.06 + 0.94 * edgeFade)).toFixed(3);
          card.dataset.lit = lit > 0.6 ? "1" : "0";
        }
      }
      /* Camera remains physically present until the lens has filled the frame.
         The reel can fade, but fading the camera at the same time caused a
         dark gap before ACT 04. */
      /* Never exactly zero while ACT 03 is open — the same trick as the film
         strip, for the same reason (vault M9). The camera is an 860KB PNG with
         a filter chain on it; at opacity 0 it is neither decoded nor
         rasterised, so the first non-zero frame paid for both at once —
         measured 43ms on a cold run at p=0.457. A floor of 0.004 is invisible
         and moves that cost into the quiet editorial beat. */
      const humanVis = filmIn * marketIn * (1 - smoothstep((p - 0.752) / 0.008));
      marketExperience.style.setProperty("--market-human-opacity",
        (humanVis > 0.004 ? humanVis : (marketOpacity > 0.02 ? 0.004 : 0)).toFixed(3));
      marketExperience.style.setProperty("--market-human-drive", filmTravel.toFixed(3));
      marketExperience.style.setProperty("--market-human-exit", humanPush.toFixed(3));
      marketExperience.style.setProperty("--market-camera-capture", cameraCapture.toFixed(3));
      marketExperience.style.setProperty("--market-camera-depth", cameraDepth.toFixed(3));
      marketExperience.style.setProperty("--market-camera-flash", Math.max(0, cameraFlash).toFixed(3));
      marketExperience.style.setProperty("--market-camera-recoil", cameraRecoil.toFixed(3));
      marketExperience.style.setProperty("--market-camera-spin", cameraSpin.toFixed(3));

      /* ── THE 3D CAMERA (rebuild brief, Agents 3+4, entry to x .684) ──
         Lazy-mounted at the act's edge. The entry: fade in at screen left in
         right-facing profile, travel to centre while the yaw unwinds — yaw
         done at .545, translation at .560 with ~2% overshoot, so the machine
         finishes turning just before it lands. Reels spin up .500-.545 as a
         FACTOR on cameraSpin, so the one-driver law (spin follows the film)
         is untouched from .545 on. approach/push begin at .684 exactly —
         the handoff contract state is the rest state of this block. */
      if (!marketCam3d && p > 0.25 && marketPusherEl) {
        marketCam3d = mountMarketCamera(marketExperience, {
          reduced,
          /* the handler is scroll-driven; if the model finishes loading
             while the page sits still (programmatic jump, slow network),
             re-apply the current state once so every ready-gated write
             (lens centre, reel anchors) lands without waiting for the
             user to move (found by the p=.730 skeptic: the iris overlay
             sat on its 50% fallback in every jump-navigation test) */
          onReady: () => applyRaw(lastRaw),
        });
        if (window.__buildanta) window.__buildanta.marketCam3d = marketCam3d;  // dev bridge
        /* the ribbon's caption (DOM, crisp) + the click bridge to the SAME
           service sheet the DOM strip opens — Escape/backdrop/focus/Lenis
           all live in the existing handler, untouched */
        ribbonCaption = document.createElement("div");
        ribbonCaption.className = "market-ribbon-caption";
        ribbonCaption.setAttribute("aria-hidden", "true");
        ribbonCaption.innerHTML =
          '<strong class="rc-word"></strong><span class="rc-line"></span><em class="rc-tag"></em>';
        marketExperience.appendChild(ribbonCaption);
        marketCam3d.canvas.addEventListener("click", (e) => {
          const k = marketCam3d.plateAt(e.clientX, e.clientY);
          if (k >= 0) filmCards[k]?.click();
        });
        marketCam3d.canvas.addEventListener("pointermove", (e) => {
          if (!ribbonPointerOn) return;
          const now = performance.now();
          if (now - ribbonHoverAt < 80) return;
          ribbonHoverAt = now;
          marketCam3d.canvas.style.cursor =
            marketCam3d.plateAt(e.clientX, e.clientY) >= 0 ? "pointer" : "";
        }, { passive: true });
      }
      if (marketCam3d) {
        /* THE ENTRANCE IS A DRIVE-IN, NOT A FADE (Yash, 21:22: "coming in
           visibility so late"). Post-mortem of the fade version: the CSS vars
           carrying the entry travel sat in an overridden .market-pusher block,
           so the machine never moved — it materialised in place, slowly. Now
           the canvas covers the act and the frame rect itself travels: the
           machine starts fully OFF-SCREEN left at full opacity and drives in.
           Timing: the title's copy is gone by ~.547 (copyOpacity's local .28);
           the machine's nose crosses the screen edge ~.553, so they never
           share a frame — Yash's earlier rule ("after the ending of the We
           Market transition") still holds, with no dead air after it. */
        const camIn = smoothstep((p - 0.543) / 0.010);
        const turn = smoothstep((p - 0.545) / 0.055);      // yaw done .600
        /* EASE-OUT, not smoothstep: a smoothstep travel spends its first
           third barely moving, which kept the machine off-screen until ~.58
           and re-created the very complaint being fixed. A machine drives in
           fast and BRAKES: cubic ease-out puts the nose on screen within
           ~.006 of the start. */
        const travelRaw = Math.max(0, Math.min(1, (p - 0.545) / 0.075));
        const travel = 1 - Math.pow(1 - travelRaw, 3);     // lands .620
        const ex = reduced ? 0
          : -72 * (1 - travel)
            + 0.9 * Math.sin(Math.max(0, (travel - 0.75)) / 0.25 * Math.PI);
        const es = reduced ? 1 : 0.86 + 0.14 * travel;
        /* the spools turn when there is film to move: threading first,
           transport second (was .565, before the reel had arrived) */
        const spinUp = smoothstep((p - 0.626) / 0.030);
        const camVis = camIn * (1 - smoothstep((p - 0.752) / 0.008));
        /* The old CSS transform chain, composed here in viewport px:
           translate(dx,dy) then scale about the lens pivot (43.5%, 31%).
           Entry and push never overlap in time (.625 land, .684 push), so
           their translations simply add. marketCamera maps the 785x1511
           frame onto this rect with setViewOffset — optical zoom, so the
           13x push renders SHARP instead of stretching a raster. */
        if (!camFrame.w) measureFilm();
        /* EXACT fractions, not the rounded ones: the lens axis is model
           (0,0) = px (341.5, 467) of the 785x1511 frame, so 341.5/785 and
           467/1511. The rounded 0.31 left the aperture 5px above the green
           circle at the push, because at 13x a 0.1% frame error is real
           pixels. */
        const pivX = camFrame.x + camFrame.w * (341.5 / 785);
        const pivY = camFrame.y + camFrame.h * (467 / 1511);
        const sTot = camScale * es;
        const dX = (innerWidth / 2 - pivX) * approach + (ex * innerWidth) / 100;
        const dY = (innerHeight / 2 - pivY) * approach;
        const rect = {
          x: pivX + dX + sTot * (camFrame.x - pivX),
          y: pivY + dY + sTot * (camFrame.y - pivY),
          w: camFrame.w * sTot,
          h: camFrame.h * sTot,
        };
        /* the tripod mask travels with the frame — 60% -> 78% of ITS height */
        marketExperience.style.setProperty("--cam-mask-y0", (rect.y + rect.h * 0.60).toFixed(0) + "px");
        marketExperience.style.setProperty("--cam-mask-y1", (rect.y + rect.h * 0.78).toFixed(0) + "px");
        /* Reel rates split by fill state (ribbon brief): the feed reel slows
           as it empties, the take-up accelerates as it fills. Closed-form
           INTEGRALS of the rates over `pos`, not rate x pos — a rate applied
           directly would make the wheels jump backwards whenever the rate
           fell. The one-driver law holds: both are functions of pos alone. */
        const ff = pos / 8;
        const spinA3d = (pos * (1 - 0.175 * ff) * SPOOL_TURNS_PER_PLATE
          + handover * HANDOVER_TURNS) * (reduced ? 1 : spinUp);
        const spinB3d = (pos * (0.65 + 0.175 * ff) * SPOOL_TURNS_PER_PLATE
          + handover * HANDOVER_TURNS) * (reduced ? 1 : spinUp);
        marketCam3d.setState({
          visible: marketOpacity > 0.02 && p > 0.52 && p < 0.79,
          // At .738 the z6 blackout is fully opaque over the z5 camera.
          // The source-hand iris opens above it at z7, never through to the
          // camera. Keep camera math for the pupil latch, but skip its GPU
          // work until reverse scroll exposes it again.
          drawVisible: p < 0.738,
          yaw: reduced ? 0 : (1 - turn) * Math.PI / 2,
          opacity: camVis,
          spin: spinA3d,
          spinB: spinB3d,
          /* ⚠️ TURNS, not a wobble (Yash, 08:29: "the handle is moving up and
             down — I want it to rotate clockwise with the scroll").
             cameraCrank is sin(spin)*18deg — an OSCILLATION between -18 and
             +18, which is a bob, not a rotation. The handle is what drives
             the film, so it takes the film's own driver and turns
             continuously. Passed in TURNS, like the reels. */
          crank: spinA3d,
          drift: reduced ? 0 : camIn * (1 - travel),
          recoil: cameraRecoil,
          irisOpen,
          /* DETENTED, like the projector's own rhythm: a plate PARKS at
             the apex and crosses the gap quickly — raw `pos` left the gap
             between plates sitting at the apex most of the time. filmTravel
             is the act's existing detent curve. Reduced motion: strip
             visible and legible, no transport — the middle plate holds. */
          filmEmerge: reduced ? 1 : filmEmerge,
          filmVel: reduced ? 0 : filmVel * VEL_NORM,
          filmPos: pos,                          // reduced handled at source
          filmAlpha: filmVis,
          rect,
        /* uTime source: pinnable, so the reverse rig can compare a forward
           and a backward arrival without the band's live arc phase differing
           between two wall-clock moments (tools/verify-reverse.cjs sets
           __bbPinTime). Real clock otherwise — this feeds uTime only; the
           vel filter's dt stays on performance.now(). */
        }, window.__bbPinTime ?? performance.now());
        /* ── THE DOM CAPTION over the apex plate (ribbon brief): the word,
           line and tag render as crisp HTML that swaps as the frame changes,
           exactly like the reference — only the artwork is texture. */
        if (ribbonCaption) {
          /* DETENTED index, same drive as the ribbon — round(raw pos)
             swapped the caption while the plate was still travelling into
             the gate, so the words led the picture */
          const apexIdx = Math.max(0, Math.min(8, Math.round(pos)));
          if (apexIdx !== ribbonCaptionIdx && filmCards[apexIdx]) {
            const prevIdx = ribbonCaptionIdx;
            ribbonCaptionIdx = apexIdx;
            const card = filmCards[apexIdx];
            ribbonCaption.querySelector(".rc-word").textContent =
              card.querySelector(".plate__word")?.textContent || "";
            ribbonCaption.querySelector(".rc-line").innerHTML =
              card.querySelector(".plate__line")?.innerHTML || "";
            ribbonCaption.querySelector(".rc-tag").textContent =
              card.querySelector(".plate__tag")?.textContent || "";
            /* which way the reel is going, so the new words enter from the
               side the box came from rather than always the same edge */
            ribbonCaption.style.setProperty("--cap-dir", apexIdx > prevIdx ? "1" : "-1");
            ribbonCaption.classList.remove("is-swap");
            void ribbonCaption.offsetWidth;            // restart the fade
            ribbonCaption.classList.add("is-swap");
          }
          /* ── THE CAPTION TRAVELS WITH THE BOX (22 Aug) ────────────────
             Supersedes the old "STATIC, in the upper-left quadrant" rule.
             The words now sit centre-bottom, below the strip's travel, where
             neither the machine nor the bottom edge can swallow them - and
             they DRIFT with the film so they feel attached to the box they
             name. The drift is a half-sine over the crossing window, so it is
             EXACTLY ZERO at both detent rests: the caption is only ever
             off-centre while something is actually moving.
             0.34 / 0.92 are the detent band edges above, not p values, so
             this self-tracks the detent rather than a beat. */
          const CAP_DRIFT_PX = 34;
          let capDx = 0;
          if (!reduced && frac > 0.34 && frac < 0.92) {
            const cross = (frac - 0.34) / 0.58;         // 0..1 across the gap
            capDx = -Math.sin(Math.PI * cross) * CAP_DRIFT_PX;
          }
          ribbonCaption.style.setProperty("--cap-dx", capDx.toFixed(1) + "px");
          /* it was still legible at p=.708, half behind the machine, long
             after the strip it labels had gone under the zoom */
          /* ── THE CAPTION WAITS FOR ITS BOX (22 Aug) ───────────────────
             It used to ride filmVis alone, which completes early in the
             arrival, so the first plate's name was on screen before its box
             had reached the gate. capGate is expressed against filmEmerge -
             a normalised 0..1 ramp, NOT a p value - so 0.82/0.18 mean "the
             last 18% of the arrival" and bind to whatever window filmEmerge
             currently spans. No beat is referenced. */
          /* ⚠️ GATED ON THE TRANSPORT START, NOT ON THE ARRIVAL RAMP.
             This used to read smoothstep((filmEmerge - 0.82) / 0.18), which
             finished at the END of the ribbon's fly-in - but the fly-in runs
             to .646 while the transport begins at .628, so the fade was still
             climbing after the plates had started stepping. Measured: SEO sat
             at 0.31 opacity while SEO was in the gate, and the caption only
             reached full when AEO and then ADS had already taken it - so the
             first plate was the one plate whose name you never actually read.
             Landing the fade on TRANSPORT_P0 means every plate, SEO included,
             is fully legible for the whole time it holds the gate. */
          const capGate = smoothstep((p - (TRANSPORT_P0 - 0.020)) / 0.020);
          ribbonCaption.style.opacity =
            (filmVis * capGate * (1 - approach)
              * (1 - smoothstep((p - 0.688) / 0.014))).toFixed(3);
        }
        /* the canvas takes the pointer ONLY while the reel is interactive —
           outside that window it must stay transparent to events */
        const wantPointer = filmVis > 0.35 && approach < 0.05;
        if (wantPointer !== ribbonPointerOn) {
          ribbonPointerOn = wantPointer;
          marketCam3d.canvas.style.pointerEvents = wantPointer ? "auto" : "none";
          if (!wantPointer) marketCam3d.canvas.style.cursor = "";
        }

        /* THE FILM COMES OFF THE REEL (Yash, 22:58 — correcting 22:22: not
           the camera's reel dropping in, the STRIP arriving from it; the
           reels stay mounted and spinning as before). The band's gate point
           starts AT the feed reel — projected live, so the origin tracks
           the machine while it is still driving in — and descends to its
           track as it fades in, on the same curve as filmIn. The strip's
           rest centre is exactly (50vw, 50vh) by its own layout, so no
           measurement is needed. */
        {
          const e = reduced ? 1 : filmIn;
          let edx = 0, edy = 0;
          if (e < 1 && marketCam3d.ready) {
            const pa = marketCam3d.project("reel_a");
            if (pa) {
              edx = (pa.x - 0.5) * innerWidth * (1 - e);
              edy = (pa.y - 0.5) * innerHeight * (1 - e);
            }
          }
          marketExperience.style.setProperty("--market-film-edx", edx.toFixed(1) + "px");
          marketExperience.style.setProperty("--market-film-edy", edy.toFixed(1) + "px");
        }
        /* the takeover iris follows the lens's VISUAL circle, not the
           viewport centre — perspective shifts an off-axis circle's apparent
           centre, and the two rings visibly disagreed at the push's end */
        if (marketCam3d.ready && approach > 0) {
          const lc = marketCam3d.projectLensCircle();
          /* THE GREEN CIRCLE BLOOMS WHERE THE SHUTTER OPENED (Yash, 12:07:
             "align the shutter opening with that green circle"). Publishing
             the aperture's real screen point and letting the reveal use it
             is exact, and cheaper than steering the whole camera to make a
             perspective offset vanish. Falls back to 50% before the model
             loads. */
          /* LATCHED at the handover, not tracked. The aperture keeps moving
             while the camera pushes (942,434 -> 902,439 across .724-.732),
             and after .752 the machine is gone entirely, so a live value
             would drag the reveal around and then read garbage. The circle
             blooms where the shutter WAS when the black took over. */
          if (p < 0.734) {
            const pupil = marketCam3d.projectPupil?.();
            if (pupil) {
              pupilLatch.x = pupil.x; pupilLatch.y = pupil.y; pupilLatch.has = true;
            }
          }
          if (pupilLatch.has) {
            /* ⚠️ on documentElement, NOT on #intro. .consult-zero is not a
               descendant of #intro, so vars set there never reach it and
               both the clip circle and its feather silently fell back to
               50% — the same scope trap as the lens-centre vars (D-032).
               Measured: clipPath read "circle(269px at 50% 50%)" while the
               shutter had opened 28px away. */
            /* ⚠️ ON THE CONSUMER ITSELF. Measured: with the vars on
               documentElement, getComputedStyle('.consult-zero') reported
               --pupil-x as (none) — that subtree does not inherit them — so
               the clip circle silently kept its 50% fallback while the
               shutter opened 28px away. Third time this scope trap has cost
               a debugging round (D-032, D-034): setting a custom property
               proves nothing about who can SEE it. Set it where it is read.
               The feather is a child of consultZero, so it inherits. */
            const px = pupilLatch.x.toFixed(1) + "px";
            const py = pupilLatch.y.toFixed(1) + "px";
            consultZero?.style.setProperty("--pupil-x", px);
            consultZero?.style.setProperty("--pupil-y", py);
            document.documentElement.style.setProperty("--pupil-x", px);
            document.documentElement.style.setProperty("--pupil-y", py);
            /* ⚠️ THE BLOOM THE VIEWER ACTUALLY SEES is .consult-zero__light-
               frame — a SIBLING of .consult-zero, not a descendant — so
               anchoring the clip circle never moved it, and it kept painting
               at 50% 50%. Its box is inset -12%, i.e. LARGER than the
               viewport and offset from it, so viewport px mean nothing
               inside it: its own rect converts them. Measured once at the
               latch, not per frame (getBoundingClientRect in the scroll
               handler is layout thrash). */
            if (lightFrame) {
              const lf = lightFrame.getBoundingClientRect();
              lightFrame.style.setProperty("--pupil-lf-x", (pupilLatch.x - lf.left).toFixed(1) + "px");
              lightFrame.style.setProperty("--pupil-lf-y", (pupilLatch.y - lf.top).toFixed(1) + "px");
            }
          }
          if (lc) {
            /* on ROOT, not marketExperience: the takeover/iris are NOT its
               descendants (skeptic-measured 19 Aug 23:55 — the vars never
               reached them and the overlay sat at its 50% fallback, dead on
               screen centre, while the lens axis parks at ~(703,420)).
               --lens-r already lives on root for the same reason. */
            root.style.setProperty("--lens-cx", lc.x.toFixed(1) + "px");
            root.style.setProperty("--lens-cy", lc.y.toFixed(1) + "px");
          }
        }
        /* anchors that can follow a rotating object: reel + lens positions in
           canvas fractions, for the plate transport and the push assert */
        if (marketCam3d.ready) {
          const pa = marketCam3d.project("reel_a"), pb = marketCam3d.project("reel_b");
          if (pa) { marketExperience.style.setProperty("--market-reel-ax", pa.x.toFixed(4));
                    marketExperience.style.setProperty("--market-reel-ay", pa.y.toFixed(4)); }
          if (pb) { marketExperience.style.setProperty("--market-reel-bx", pb.x.toFixed(4));
                    marketExperience.style.setProperty("--market-reel-by", pb.y.toFixed(4)); }
        }
      }
      marketExperience.style.setProperty("--market-camera-crank", `${cameraCrank.toFixed(2)}deg`);
      /* same driver as the spools and the strip, same ratio through the
         handover, so the lock never breaks */
      marketExperience.style.setProperty("--market-camera-shutter-angle",
        `${((pos * SHUTTER_TURNS_PER_PLATE + handover * HANDOVER_TURNS) * 360).toFixed(1)}deg`);

      /* ── A REAL APERTURE IS A POLYGON, NOT A CIRCLE (Yash, 21:05) ─────
         He is still seeing the lens stop, and he is right to. Rotation
         displaces a pixel by radius x angle, so at the centre — which is all
         that is left on screen once the lens fills it — the blades converge
         and barely move. A round opening makes it worse: a circle looks
         identical at every rotation, so there is nothing on it that CAN show
         it turning.
         A real iris opening is a polygon whose corners sit far from the
         centre, so they sweep a long way per frame. The rotation becomes
         unmissable exactly where a circle would look dead — and it is what the
         thing actually IS, so nothing has to speed up and the 1:1 lock with
         the spools stays untouched. Both his calls.
         Built here rather than beside irisOpen because it needs the blade
         angle, which is not computed until this point. */
      if (irisEl) {
        const o = irisOpen * 0.80;              // of the element's half-size
        if (o > 0.002) {
          const rot = (pos * SHUTTER_TURNS_PER_PLATE + handover * HANDOVER_TURNS) * Math.PI * 2;
          let pts = "";
          for (let i = 0; i < 6; i++) {         // six blades, six corners
            const a = rot + (i / 6) * Math.PI * 2;
            pts += `, ${(50 + 50 * o * Math.cos(a)).toFixed(2)}% ${(50 + 50 * o * Math.sin(a)).toFixed(2)}%`;
          }
          /* evenodd: the square is the shape and the polygon is a HOLE punched
             through it, so you look through the aperture rather than at a dark
             disc painted over the blades */
          irisEl.style.clipPath = `polygon(${pts.slice(2)})`;
        }
        /* Its own visibility, NOT the lens's. With no clip-path it is a plain
           black square the size of the lens — 3454px of it — so leaving it
           visible while the aperture was shut painted the whole screen black.
           Caught by looking: the measurement said 0.0% changed, which is what
           a solid black frame looks like to a diff. */
        root.style.setProperty("--iris-on", (o > 0.002 ? lensTakeOn : 0).toFixed(3));
      }
      marketExperience.style.setProperty("--market-transition-t", transitionT.toFixed(3));
      marketExperience.style.setProperty("--market-transition-opacity", Math.max(0, transitionOpacity).toFixed(3));
      marketExperience.style.setProperty("--market-transition-y", `${(94 - transitionT * 46).toFixed(2)}vh`);
      marketExperience.style.setProperty("--market-scene-opacity", marketSceneIn.toFixed(3));
    }

    /* Act 04: ZERO-inspired signal glass. Camera ke baad ek hi local scroll
       frost, cracks, shards aur connected system world ko scrub karta hai. */
    if (consultZero) {
      /* Deep lens tunnel complete hote hi green Earth reveal hoti hai.
         Blue title/frame hidden hi rehta hai. */
      /* A bright exposure frame arrives first. Camera disappears under its
         peak, then the green Earth / WE CONSULT world resolves slowly. */
      /* The bright exposure frame is gone. It fired at p=0.674, three beats
         before the reel had finished, and washed the last two service plates
         in white-green — the single thing Yash pointed at. The handover is a
         cut to black now, so there is nothing to bleed over the reel. */
      const lightFrame = 0;
      /* Restore the original lens-aligned opening over the source scene.
         The circle is a clear window, not an opaque disc or a second scene.
         Reduced motion reveals the still directly after the camera beat. */
      const consultReveal = reduced && USE_ZERO_MIRROR
        ? (p >= 0.738 ? 1 : 0)
        : smoothstep((p - 0.738) / 0.050);
      const waitingForBurn = USE_ZERO_MIRROR && p >= BURN_START_P
        && !burnTransition.ready && !burnTransition.failed;
      const consultOut = waitingForBurn ? 1 : 1 - smoothstep((p - 0.992) / 0.008);
      /* Fully paint the source behind the closed iris before it opens, so
         even the first small window shows the scene without a dark veil. */
      const consultOpacity = smoothstep((p - (USE_ZERO_MIRROR ? 0.728 : 0.732)) / 0.010) * consultOut;
      const consultLocal = Math.max(0, Math.min(1, (p - 0.768) / 0.224));
      /* Source-only replacement: circular entry into original choreography,
         then a two-source-hand fist bump in the SAME garden. The old meet's
         scroll space now belongs to this ending, with no second animation.
         Reduced motion shows a still of the source garden instead. */
      const zeroStageLead = reduced ? 0 : smoothstep((p - 0.738) / 0.050);
      const zeroStageProgress = !USE_ZERO_MIRROR ? 0 : reduced
        ? 0.95
        : p < ZERO_STAGE_P
          ? zeroStageLead * 0.08
          : p <= ZERO_STAGE_P
            ? 0.08 + zeroStageLocal * 0.87
            : 0.95 + Math.max(0, Math.min(1, (p - ZERO_STAGE_P) / (0.945 - ZERO_STAGE_P))) * 0.05;
      const burnLocal = waitingForBurn ? 0
        : Math.max(0, Math.min(1, (p - BURN_START_P) / (1 - BURN_START_P)));
      if (USE_ZERO_MIRROR && p > 0.70) { mountBurnScene(); bakePortalStill(); }
      burnScene?.setProgress(burnLocal, p >= BURN_START_P && p < 1 ? 1 : 0);
      /* D-076: the note stands at the reference's t = 0 close-up from the
         first frame; the canvas dissolves in over the fists until b .03
         (the baked fists sit inside the portal circle, 1:1 over the live
         ones), then the underlying stage swaps for the stars beneath the
         opaque paper in a tiny window [.030, .036] — tiny because on phones
         (fov 40) the note stops covering the viewport height at t ~.006. */
      const zeroStageOpacity = USE_ZERO_MIRROR
        ? 1 - smoothstep((burnLocal - 0.030) / 0.006) : 0;
      /* bill copy removed 10 Sep 2026 at the client's request; D-076 */
      /* t = the mirror's stage-local progress, .4 * (b - .03) / .97 — the
         same mapping mirrBillBurn feeds the vendored path; used below for
         the hero-burn law that drives the sky plate. */
      const billT = Math.max(0, Math.min(1, (burnLocal - 0.03) / 0.97)) * 0.4;
      /* D-076 r2: the sky (the star wrap and the black-hole lens inside it)
         stays behind a dark chalkboard-toned plate until the HERO note
         burns, so it is revealed through burned openings as before (Yash,
         6 Aug) and not through the gaps the reference lens opens between
         whole notes from b ~.08 on. Hero burn = iv(r, .30, 1.50) with
         r = t / .35 — the vendored BILL_SPECS[0] / BURN_PHASE numbers,
         cross-checked against the scene's own burnProgress by the suite.
         0 -> 1 over hero burn 0 -> .1 (b .285 -> .386). */
      const heroBurn = Math.max(0, Math.min(1, (Math.min(billT / 0.35, 1) - 0.30) / 1.20));
      const billSky = USE_ZERO_MIRROR ? smoothstep(heroBurn / 0.1) : 1;
      root.style.setProperty("--bill-sky", billSky.toFixed(4));
      /* ── THE MEET's DOM copy + the act title RE-IGNITION (D-042 v2).
         Vars on consultZero so .consult-meet descendants inherit them (the
         D-032/D-034 scope law). The neon serif act title used to burn
         through 60% of the act and SPOILED the spark reveal (skeptic
         major, 31 Aug) — it now exits early (introOut below) and the SAME
         neon re-lights at contact via the max() where --zero-intro is set,
         so the payoff speaks in the act's own voice instead of a second,
         cheaper title. */
      /* finger beat retired with the Veo footage swap (D-043, Yash's call)
         — the target line never shows; DOM kept for an easy revive */
      const meetL1 = 0;
      /* Source title joins the hands only after they enter the landscape;
         it stays beside the diagonal bump, then leaves with the scene. The
         original backup keeps its old clasp timing. Pure scroll sampling
         also restores the same title on reverse; reduced motion is a still. */
      const meetTitle = USE_ZERO_MIRROR
        ? (reduced ? 1 : smoothstep((zeroStageProgress - 0.72) / 0.10)) * zeroStageOpacity
        : smoothstep((consultLocal - 0.63) / 0.04)
          * (1 - smoothstep((consultLocal - 0.838) / 0.022));
      if (consultZero) {
        consultZero.style.setProperty("--meet-l1", meetL1.toFixed(3));
        consultZero.style.setProperty("--meet-title", meetTitle.toFixed(3));
        // Reuse the original masked edge-blur layer only once the landscape
        // arrives. The clear center, hand poses and canvas remain untouched.
        const zeroEdgeBlur = USE_ZERO_MIRROR
          ? smoothstep((zeroStageProgress - 0.5) / 0.2) * zeroStageOpacity : 0;
        consultZero.style.setProperty("--zero-edge-blur", zeroEdgeBlur.toFixed(3));
      }

      // The same palm globe begins around the camera and zooms out into place.
      // Bring its mint world in immediately—there is no separate space scene.
      const handBg = smoothstep(consultLocal / 0.10);
      const introIn = smoothstep((consultLocal - 0.15) / 0.10);
      const introOut = 1 - smoothstep((consultLocal - 0.36) / 0.12);
      const handIn = smoothstep((consultLocal - 0.14) / 0.12);
      const handPress = smoothstep((consultLocal - 0.22) / 0.18);
      const handOut = 1 - smoothstep((consultLocal - 0.39) / 0.15);
      const handPulseLocal = Math.max(0, Math.min(1, (consultLocal - 0.12) / 0.25));
      const handPulse = Math.sin(handPulseLocal * Math.PI);
      /* ── THE SPOILER FIX (D-042 v2, skeptic major): the serif opening
         copy ("WE SCALE.") used to burn until .78 — through the whole meet
         — so the spark's title reveal revealed words already on screen.
         It now exits before the flip copy arrives; the payoff title at
         contact speaks in the same serif voice (.consult-meet__title). */
      const handCopy = handIn * (1 - smoothstep((consultLocal - 0.20) / 0.08));
      const update1 = smoothstep((consultLocal - 0.20) / 0.12);
      const update2 = smoothstep((consultLocal - 0.36) / 0.12);
      const update3 = smoothstep((consultLocal - 0.52) / 0.12);
      const update4 = smoothstep((consultLocal - 0.68) / 0.12);
      const dollarFocus = smoothstep((consultLocal - 0.70) / 0.16);
      const world = smoothstep((consultLocal - 0.14) / 0.62);
      /* Reference-film pacing: every incoming plate is fully established
         before the outgoing plate leaves. This complementary overlap keeps
         the sequence bright and gives the perspective moves room to breathe. */
      const filmDolly = smoothstep(consultLocal / 0.115);
      const filmLens = 1 - smoothstep(consultLocal / 0.070);
      const filmS1 = 1 - smoothstep((consultLocal - 0.145) / 0.035);
      const filmS2 = smoothstep((consultLocal - 0.105) / 0.040) * (1 - smoothstep((consultLocal - 0.245) / 0.045));
      const filmS3 = smoothstep((consultLocal - 0.205) / 0.040) * (1 - smoothstep((consultLocal - 0.370) / 0.045));
      const filmS4 = smoothstep((consultLocal - 0.325) / 0.045) * (1 - smoothstep((consultLocal - 0.515) / 0.045));
      const filmS5 = smoothstep((consultLocal - 0.470) / 0.045) * (1 - smoothstep((consultLocal - 0.625) / 0.045));
      const filmS6 = smoothstep((consultLocal - 0.580) / 0.045) * (1 - smoothstep((consultLocal - 0.755) / 0.045));
      const filmS7 = smoothstep((consultLocal - 0.710) / 0.045) * (1 - smoothstep((consultLocal - 0.880) / 0.045));
      const filmS8 = smoothstep((consultLocal - 0.835) / 0.045);
      const filmIdea = cutWindow(consultLocal, 0.835, 0.935, 0.026);
      const filmCta = smoothstep((consultLocal - 0.905) / 0.040);

      /* Stars behind the whole final-note scene (Yash, 6 Aug MCQ): the mint
         and the dark world yield to the starfield as the last note takes the
         camera; the same wrap later becomes the portal surface — seamless. */
      /* Stars reveal THROUGH the burn (Yash, 6 Aug 16:58 — revises the
         earlier 'whole scene' choice): everything stays original until the
         fire; the backdrops dissolve in sync with the burning edge. */
      // Source mode reveals stars directly as the completed hand scene exits.
      // The old note-driven timing remains confined to legacy preview mode.
      const starIn = USE_ZERO_MIRROR
        ? 1 - zeroStageOpacity : smoothstep((consultLocal - 0.915) / 0.015);
      consultZero.style.setProperty("--star-in", starIn.toFixed(3));
      /* Note-focus: the bill's canvas must ride ABOVE the fading stage, or
         the stage's half-faded cream veils the note during the swap. */
      consultZero.classList.toggle("note-focus", !USE_ZERO_MIRROR && consultLocal > 0.913);
      if (portalOn && portalState === "off") {
        const skyLive = starIn > 0.01;
        if (skyLive && portalWrap.style.opacity) {
          portalWrap.style.transition = "";
          portalWrap.style.opacity = "";
        }
        portalWrap.classList.toggle("bg", skyLive);
        portalWrap.classList.toggle("gone", !skyLive);
        // Prepare the next scene behind the intact fullscreen paper, so its
        // black hole is revealed through the actual burned-away openings.
        if (skyLive && (!USE_ZERO_MIRROR || burnLocal >= 0.03)) mountPortalModule();
        else if (portalModule) teardownPortalModule();   // reversible
      }
      root.classList.toggle("consult-zero-live", consultOpacity > 0.002);
      consultZero.style.setProperty("--zero-opacity", consultOpacity.toFixed(3));
      consultZero.style.setProperty("--zero-reveal", consultReveal.toFixed(3));
      root.style.setProperty("--zero-reveal", consultReveal.toFixed(3));
      root.style.setProperty("--zero-light", lightFrame.toFixed(3));
      consultZero.style.setProperty("--zero-progress", consultLocal.toFixed(3));
      consultZero.style.setProperty("--zero-world", world.toFixed(3));
      consultZero.style.setProperty("--zero-intro", (introIn * introOut).toFixed(3));
      consultZero.style.setProperty("--zero-hand", (handIn * handOut).toFixed(3));
      consultZero.style.setProperty("--zero-hand-press", handPress.toFixed(3));
      consultZero.style.setProperty("--zero-hand-pulse", handPulse.toFixed(3));
      consultZero.style.setProperty("--zero-hand-bg", handBg.toFixed(3));
      consultZero.style.setProperty("--zero-hand-copy", handCopy.toFixed(3));
      consultZero.style.setProperty("--zero-stage", zeroStageOpacity.toFixed(3));
      consultZero.style.setProperty("--zero-stage-progress", zeroStageProgress.toFixed(4));
      /* Keep the imported ZeroMirror scene visually clean while it owns the
         shared canvas. The class is derived from scroll state every frame, so
         reverse travel restores the same layers at the same position. */
      consultZero.classList.toggle(
        "zero-stage-live",
        USE_ZERO_MIRROR && Boolean(consultHand) && zeroStageOpacity > 0.002,
      );
      consultHand?.setProgress(consultLocal, consultOpacity, {
        progress: zeroStageProgress,
        opacity: zeroStageOpacity,
      });
      zeroStageAudio?.setProgress(
        zeroStageProgress,
        consultOpacity > 0.002 && zeroStageOpacity > 0.002,
      );
      consultZero.style.setProperty("--zero-u1", update1.toFixed(3));
      consultZero.style.setProperty("--zero-u2", update2.toFixed(3));
      consultZero.style.setProperty("--zero-u3", update3.toFixed(3));
      consultZero.style.setProperty("--zero-u4", update4.toFixed(3));
      consultZero.style.setProperty("--zero-dollar-focus", dollarFocus.toFixed(3));
      consultZero.style.setProperty("--film-dolly", filmDolly.toFixed(3));
      consultZero.style.setProperty("--film-lens", filmLens.toFixed(3));
      consultZero.style.setProperty("--film-earth-turn", `${(consultLocal * 520).toFixed(2)}deg`);
      consultZero.style.setProperty("--film-s1", filmS1.toFixed(3));
      consultZero.style.setProperty("--film-s2", filmS2.toFixed(3));
      consultZero.style.setProperty("--film-s3", filmS3.toFixed(3));
      consultZero.style.setProperty("--film-s4", filmS4.toFixed(3));
      consultZero.style.setProperty("--film-s5", filmS5.toFixed(3));
      consultZero.style.setProperty("--film-s6", filmS6.toFixed(3));
      consultZero.style.setProperty("--film-s7", filmS7.toFixed(3));
      consultZero.style.setProperty("--film-s8", filmS8.toFixed(3));
      consultZero.style.setProperty("--film-idea", filmIdea.toFixed(3));
      consultZero.style.setProperty("--film-cta", filmCta.toFixed(3));
      consultZero.style.setProperty("--film-t1", segmentProgress(consultLocal, 0.00, 0.180).toFixed(3));
      consultZero.style.setProperty("--film-t2", segmentProgress(consultLocal, 0.105, 0.290).toFixed(3));
      consultZero.style.setProperty("--film-t3", segmentProgress(consultLocal, 0.205, 0.415).toFixed(3));
      consultZero.style.setProperty("--film-t4", segmentProgress(consultLocal, 0.325, 0.560).toFixed(3));
      consultZero.style.setProperty("--film-t5", segmentProgress(consultLocal, 0.470, 0.670).toFixed(3));
      consultZero.style.setProperty("--film-t6", segmentProgress(consultLocal, 0.580, 0.800).toFixed(3));
      consultZero.style.setProperty("--film-t7", segmentProgress(consultLocal, 0.710, 0.925).toFixed(3));
      consultZero.style.setProperty("--film-t8", segmentProgress(consultLocal, 0.835, 1.00).toFixed(3));
      consultZero.style.setProperty("--zero-drift", `${((consultLocal - 0.5) * 5).toFixed(2)}vh`);

      // Preserve the notes-only ending after removing the epilogue. Derive
      // the cut from timeline position, so reverse restores the same state.
      consultHand?.setWorldCut(p >= NOTE_DEPARTURE_P);
    }

    /* har act ka text apni khidki se */
    acts.forEach((a, i) => {
      if (i === 2) {
        if (a.el.style.visibility !== "hidden") gsap.set(a.el, { autoAlpha: 0 });
        return;
      }
      const k = win(p, peaks[i]);

      // Act 02 ka text Act 01 ke end hote hi (p = 0.240) turant reveal hota hai.
      const assemblyReveal = i === 1
        ? smoothstep((p - 0.240) / 0.022)
        : 1;
      const textK = k * assemblyReveal;

      if (textK <= 0.001) {
        if (a.el.style.visibility !== "hidden") gsap.set(a.el, { autoAlpha: 0 });
        return;
      }
      gsap.set(a.el, { autoAlpha: 1 });
      // aage se aata hai, peeche nikalta hai — direction progress se
      // Delayed code reveal peak cross karta hai, isliye uska exit direction
      // actual fade edge tak hold karte hain; warna letters beech mein flip hote.
      const exitEdge = peaks[i] + HALF - FADE;
      const dir = i === 1
        ? (p < exitEdge ? 1 : -1)
        : (p < peaks[i] ? 1 : -1);
      gsap.set(a.chars, {
        yPercent: (1 - textK) * 110 * dir,
        opacity: textK,
      });
      gsap.set([a.num, a.sub], {
        y: (1 - textK) * 14 * dir,
        opacity: textK,
      });
    });

    /* chrome */
    barFill.style.width = (p * 100).toFixed(2) + "%";
    counter.textContent = String(Math.min(n, Math.floor(p * n) + 1)).padStart(2, "0");

    /* HANDOFF — intro ka chrome jaata hai, site ka aata hai.
       Dono EK hi corners mein baithte hain: intro ka top bar aur site ka nav
       dono upar, intro ka foot aur site ka HUD dono neeche. Sirf site ka
       chrome fade-in karne par dono ek saath dikhte the — "BUILDANTA
       SOLUTIONS" do baar, aur "SKIP INTRO" par HUD ka "LAT / LON" chadha
       hua. Isliye ye ek cross-fade hai, do alag fades nahi. */
    const handoff = smoothstep((p - 0.86) / 0.14);
    const marketChromeFade = marketExperience
      ? 1 - Number(marketExperience.style.getPropertyValue("--market-opacity") || 0)
      : 1;
    const introChromeOp = String((1 - handoff) * marketChromeFade);
    topBar.style.opacity = introChromeOp;
    footBar.style.opacity = introChromeOp;
    bar.style.opacity = introChromeOp;
    footBar.style.pointerEvents = handoff > 0.5 ? "none" : "";

    onProgress?.(p, handoff, { enabled: beatEnabled, local: beatLocal });
  }

  /* ── ScrollTrigger: pin + scrub ── */
  const perAct = reduced ? 0.6 : (INTRO.scrollPerAct ?? 1.1);
  const baseScrollLength = perAct * n;
  const scrollDistanceMultiplier = reduced ? 1 : (INTRO.scrollDistanceMultiplier ?? 1);
  // The first source-hand/iris reveal starts here, inside the camera handover.
  // Preserve its physical scroll distance along with all of WE SCALE (D-074).
  const WE_SCALE_SCROLL_START = 0.738;
  /* 1.4 -> 2.1: Yash asked for +50% scroll length on the fist-bump beat
     (3 Sep). This lengthens how far you scroll THROUGH the act; the act's
     p-boundaries are untouched, so no other beat moves. */
  const consultStretch = reduced ? 0 : 2.52;   // +50% then a further +20% (Yash, 3 Sep)
  /* This hold scrubs the original source choreography. The former meet's
     following scroll interval now supplies the new source two-hand ending. */
  const zeroStageStretch = reduced || !USE_ZERO_MIRROR ? 0 : 4.15;
  /* WE MARKET needs room: ten plates each get a readable beat (Yash, 7 Aug).
     Given as EXTRA viewport-heights on that act's own slice of the timeline,
     so every other act keeps exactly the pacing it already had. */
  /* ── ARRIVAL AND TRANSPORT PACE SEPARATELY (22 Aug) ────────────────────
     One stretch across .425 -> .684 gave the whole act a single speed, so
     slowing the reel enough to read each plate also made the camera's
     approach crawl. Split at TRANSPORT_P0 - which is already the transport
     start, not a new beat - so the two halves can be paced apart.
       .425 -> .628  ARRIVAL    5.19vh   (was 6.29vh of the old single row)
       .628 -> .684  TRANSPORT  2.19vh
     With handoverStretch 3.6 the 8-plate transport costs 3.226vh, i.e.
     0.403vh (~323px at 800px) per plate against 0.170vh before - a 2.375x
     slow-down. The reduced ? 0 guards are kept: mapScrollProgress skips
     zero-vh rows, which is how reduced motion collapses the timeline. */
  const arrivalStretch   = reduced ? 0 : 4.3;
  // Match the reference's eight-plate transport cost before its multiplier.
  const transportStretch = reduced ? 0 : 4.5932;
  const MARKET_P0 = 0.425, MARKET_P1 = 0.684;
  const CODE_P0 = 0.240;
  const codeScrollMultiplier = reduced ? 1 : (INTRO.codeScrollMultiplier ?? 1);
  const codeStretch = (MARKET_P0 - CODE_P0) * baseScrollLength * (codeScrollMultiplier - 1);
  /* NOT a new beat: this is the existing transport start (filmRaw below,
     smoothstep((p - 0.628) / 0.078)), reused as a segment boundary so the
     arrival and the transport can carry different amounts of scroll. */
  const TRANSPORT_P0 = 0.628;
  /* THE HANDOVER GETS ITS OWN SCROLL (Yash, 18:20).
     It used to live in the p-slice between the market and the consult, which
     carries NO extra vh — 0.008 * baseScrollLength = 0.035vh, a thirtieth of
     one screen-height for the entire journey from x1 to x12.5. That is why it
     read as a jump rather than a travel: not too few p, too little scroll.
     Its own segment, four times the room, three beats inside it: the camera
     comes forward with the reel still running, it STOPS, then you go in. */
  const HANDOVER_P1 = 0.768;
  /* SHORTENED 3.2 -> 1.4 (Yash, 20:35: "the transition between We market and
     WE SCALE is too long"). Priced out, the handover was costing
       0.084 span * 4.4 base = 0.37vh, plus 3.2 stretch = 3.57vh
     — nearly the whole ten-plate market act (4.14vh) for one transition.
     At 1.4 it costs 1.77vh, half of what it was and still FIFTY TIMES the
     0.035vh it had before it got its own segment, which is what made it read
     as a jump. Travel preserved, patience returned.

     ⚠️ THE BEAT BOUNDARIES ARE UNTOUCHED — 0.684 approach, 0.726 enter/
     blackout, 0.768 sphere all stay exactly where they are, so nothing about
     the choreography changes. This is the SAFE lever: `stretch` is extra
     viewport-heights on the segment, not a p value. Moving those p values is
     what silently ate WE SCALE twice in one evening. */
  const handoverStretch = reduced ? 0 : 3.6;   // carries the reel's last plates
  /* Black-hole beat ka apna scroll span, burn ke poora hone ke BAAD —
     intro ka saara purana ganit introScrollLength par hi chalta hai,
     isliye acts/consult ki pacing ko ye chhoota tak nahi. */
  const beatStretch = beatEnabled ? 1.0 : 0;
  const consultTimelineStart = HANDOVER_P1;
  // Preserve the hand pacing before the dedicated supplied-animation ending.
  const NOTE_DEPARTURE_P = 0.768 + 0.848 * 0.224;
  /* Piecewise timeline: each row is [pFrom, pTo, extra-vh]. The base cost of a
     p-span is span * baseScrollLength; a stretch simply adds vh to that row.
     A row with pFrom === pTo is a HOLD: p stands still while its vh scrolls. */
  /* Split the old consult row at .788 and distribute its existing stretch in
     exact proportion to p-span. That preserves its pixels-per-p before and
     after the new hold; only the named zeroStage row adds distance. */
  const consultPreludeShare = (ZERO_STAGE_P - HANDOVER_P1) / (NOTE_DEPARTURE_P - HANDOVER_P1);
  const handFinishStretch = consultStretch * 0.85 * (1 - consultPreludeShare);
  const cameraHandoverShare = (WE_SCALE_SCROLL_START - MARKET_P1) / (HANDOVER_P1 - MARKET_P1);
  const SEGMENTS = [
    [0, CODE_P0, 0, null],
    [CODE_P0, MARKET_P0, codeStretch, null],
    [MARKET_P0, TRANSPORT_P0, arrivalStretch, null],
    [TRANSPORT_P0, MARKET_P1, transportStretch, null],
    // Split only the scroll budget, not any visual cue: the iris onward keeps
    // its old pixels-per-progress while the preceding camera matches reference.
    [MARKET_P1, WE_SCALE_SCROLL_START, handoverStretch * cameraHandoverShare, null],
    [WE_SCALE_SCROLL_START, HANDOVER_P1, handoverStretch * (1 - cameraHandoverShare), null],
    [HANDOVER_P1, ZERO_STAGE_P, consultStretch * 0.85 * consultPreludeShare, null],
    [ZERO_STAGE_P, ZERO_STAGE_P, zeroStageStretch, "zeroStage"],
    ...(USE_ZERO_MIRROR ? [
      [ZERO_STAGE_P, BURN_START_P, handFinishStretch * (BURN_START_P - ZERO_STAGE_P) / (NOTE_DEPARTURE_P - ZERO_STAGE_P), null],
      /* D-076: the reference's own pacing for its bill stage. Its t 0 -> .4
         (F1 .. bills culled) costs 0.4 * 325 mirror-vh / 35 wheel gain =
         3.714 native vh; our row is 0.055 * 4.4 base + 3.58 = 3.822 vh, of
         which the .97 after the arrival dissolve is 3.707 vh (0.2 % off).
         Reduced motion keeps today's ~0.53 ratio (2.032 vh). The p-boundary
         .945 does NOT move: this is extra vh on the row, never a beat edge.
         verify-reference-scroll-pacing.cjs pins these numbers. */
      [BURN_START_P, 1, reduced ? 1.90 : 3.58, null],
    ] : [
      [ZERO_STAGE_P, NOTE_DEPARTURE_P, handFinishStretch, null],
      [NOTE_DEPARTURE_P, 1, consultStretch * 0.15, null],
    ]),
  ].map(([p0, p1, extra, hold]) => ({
    p0,
    p1,
    hold,
    vh: ((p1 - p0) * baseScrollLength + extra)
      * (p1 <= WE_SCALE_SCROLL_START ? scrollDistanceMultiplier : 1),
  }));
  const introScrollLength = SEGMENTS.reduce((a, seg) => a + seg.vh, 0);
  const beatScrollLength = beatStretch * scrollDistanceMultiplier;
  const totalScrollLength = introScrollLength + beatScrollLength;
  const introRawEnd = introScrollLength / totalScrollLength;
  /* Side-channels from the mapper: progress through each named flat segment.
     They are recomputed from raw on every call, so reverse scroll is the same
     state function as forward scroll rather than an accumulated animation. */
  let zeroStageLocal = 0;
  const mapScrollProgress = (raw) => {
    let v = Math.min(raw / introRawEnd, 1) * introScrollLength;   // vh travelled
    let nextZeroStage = 0;
    for (const seg of SEGMENTS) {
      /* Zero-vh rows (reduced motion sets stretches to 0) would divide 0/0
         below — they occupy no scroll, so they simply don't participate. */
      if (seg.vh <= 0) continue;
      if (v <= seg.vh || seg === SEGMENTS[SEGMENTS.length - 1]) {
        if (seg.p1 === seg.p0) {
          const local = Math.min(v / seg.vh, 1);
          if (seg.hold === "zeroStage") nextZeroStage = local;
          zeroStageLocal = nextZeroStage;
          return seg.p0;
        }
        zeroStageLocal = nextZeroStage;
        return seg.p0 + Math.min(v / seg.vh, 1) * (seg.p1 - seg.p0);
      }
      if (seg.hold === "zeroStage") nextZeroStage = 1;
      v -= seg.vh;
    }
    zeroStageLocal = nextZeroStage;
    return 1;
  };
  /* Gargantua sirf ENTER ke baad (Yash, 6 Aug 16:18 MCQ): pehle ka 0.008
     head-start overlap mint flash dhakta tha, par ab wahi kaam PORTAL ka
     starfield karta hai — beat ka koi bhi ghost darwaze se pehle nahi. */
  const beatRawStart = introRawEnd;
  const mapBeatLocal = (raw) =>
    beatStretch ? Math.max(0, Math.min(1, (raw - beatRawStart) / (1 - beatRawStart))) : 0;
  let beatUnlocked = false;   // flips true at ENTER; false back above the wall
  /* FINALE (Yash, 6 Aug): the site ENDS on the living hole — the beat holds
     at full presence (drift + churn continue) and never swallows to white. */
  const FINALE_BEAT = 0.58;
  /* ── the PORTAL wall (sealed black-hole-bg module) ──
     Burn khatam → scroll ek deewar par rukta hai, starfield + cursor-hole
     aata hai. Hold-to-collapse se ENTER ka darwaza banta hai; enter karne par
     Gargantua beat auto-ride hota hai. Wheel-up (bina arm kiye) wapas consult
     world mein chhod deta hai. LENIS landmine: stop on engage, start on EVERY
     exit path — return, Esc, dismiss, ride, destroy. */
  const portalWrap = root.querySelector(".intro__portalwrap");
  const whiteVeil = root.querySelector(".intro__whiteveil");
  const portalOn = beatEnabled && Boolean(portalWrap);
  let hintTimer = 0;
  const hideHint = () => { portalWrap?.classList.remove("hint"); };
  let portalModule = null;
  let portalState = "off";       // off | active | riding | done
  let portalWheel = null;
  let portalTimers = [];
  let portalCooldownUntil = 0;   // dismissal scroll-back crosses the engage
                                 // zone — without a cooldown it re-engages mid-flight
  let portalMounting = false;
  let enteredOnce = false;   // the door exists once per visit (Yash MCQ)

  /* Mount EARLY and LOCKED (Yash, 6 Aug 20:19 MCQ): the portal becomes the sky
     behind the burning note — holes burned through the paper reveal a sky that
     is already bending — so the wall is not a handoff, just permission to
     touch. `.bg` keeps it at z6 (under the note) and non-interactive. */
  function mountPortalModule() {
    if (!portalOn || portalModule || portalMounting || enteredOnce) return;
    portalMounting = true;
    import("../effects/blackhole-portal/index.js")
      .then(({ BlackholePortal }) => {
        portalMounting = false;
        if (portalState === "done") return;
        portalModule = new BlackholePortal(portalWrap, {
          portalLabel: "ENTER",
          /* ── THE SINGLE BIGGEST GPU ALLOCATION ON THE SITE ──
             Measured on a 390x844 phone viewport: this one texture uploads
             2560x2560x4 = 25 MB of GPU memory, out of 63.5 MB for the entire
             journey. It is 40% of everything, for a starfield on a screen 390
             points wide — and it lands exactly where Yash reports the phone
             crashing, because the portal mounts right after WE MARKET.
             1024x1024 costs 4 MB: a SIXTH of the memory, and still oversampled
             for the screen it is drawn on. Desktop keeps the full 2560.
             Swapped through the module's own option, so the sealed portal code
             is untouched — this is an asset choice, not a redesign. */
          starfieldUrl: matchMedia("(pointer: coarse)").matches
            ? "/assets/starfield-1k.jpg"
            : "/assets/starfield.jpg",
          locked: () => portalState !== "active",   // no collapse until the wall
          holdOnEnter: true,                        // never re-grow the universe
          onReturn: () => dismissPortal(true),
        });
        portalModule.init();
      })
      .catch((e) => { portalMounting = false; console.error("[intro] portal unavailable:", e); });
  }

  function teardownPortalModule() {
    clearTimeout(hintTimer); hintTimer = 0; hideHint();
    if (portalWheel) { removeEventListener("wheel", portalWheel); portalWheel = null; }
    portalTimers.forEach(clearTimeout); portalTimers = [];
    portalModule?.destroy(); portalModule = null;
    portalWrap?.classList.remove("on");
  }

  function engagePortal() {
    if (!portalOn || portalState !== "off" || enteredOnce) return;
    portalState = "active";
    window.__lenis?.stop();
    portalWrap.classList.remove("bg", "gone");   // bg pins z6 + pointer-events
    portalWrap.classList.add("on");
    mountPortalModule();                 // already mounted during the burn
    portalWheel = (e) => {
      if (portalState !== "active") return;
      const phase = window.__bhp?.state?.().phase;
      if (phase === "armed" || phase === "entering") return; // the door owns the wheel
      if (e.deltaY < -12) dismissPortal(true);
    };
    addEventListener("wheel", portalWheel, { passive: true });
    /* Idle whisper: if nobody presses within 4s, a dim HOLD fades in and
       disappears at the first press (Yash: silent whisper after idle). */
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      const phase = window.__bhp?.state?.().phase;
      if (portalState === "active" && (phase === "idle" || phase === "winding" || !phase)) {
        portalWrap.classList.add("hint");
        addEventListener("pointerdown", hideHint, { once: true, passive: true });
      }
    }, 4000);
  }

  function dismissPortal(scrollBack) {
    // Only a LIVE portal can dismiss. During the ride the module's own
    // internal return (0.6s after enter) fires onReturn — honoring it there
    // yanked the scroll backwards mid-flight (measured: landed at raw .90).
    if (portalState !== "active") return;
    portalState = "off";
    portalCooldownUntil = performance.now() + 1500;
    teardownPortalModule();
    window.__lenis?.start();
    if (scrollBack) {
      const y = st.start + (st.end - st.start) * (introRawEnd - 0.06);
      if (window.__lenis) window.__lenis.scrollTo(y, { duration: 0.9, force: true });
      else scrollTo(0, y);
    }
  }

  function ridePortal() {
    if (portalState !== "active") return;
    portalState = "riding";
    beatUnlocked = true;
    enteredOnce = true;
    hideHint();

    /* THE SCORE ARRIVES HERE. ENTER is a genuine user gesture, so the browser
       lets audio start, and it is also the exact dramatic moment the music
       should appear — the two coincide, which is why no "click for sound"
       prompt is needed anywhere on this site. It rises from silence over the
       6s ride rather than cutting in. */
    music.enter();

    /* The hole grows FROM the point you entered (Yash MCQ): offset the beat
       stage toward the door, then ease it home over the ride. The stage is
       black, so the exposed edge reads as deep space. */
    const btn = portalWrap.querySelector(".bh-portal");
    const rect = btn?.getBoundingClientRect();
    const ex = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const ey = rect ? rect.top + rect.height / 2 : innerHeight / 2;
    const clamp12 = (v, span) => Math.max(-0.12, Math.min(0.12, v / span)) * span;
    const dx = clamp12(ex - innerWidth / 2, innerWidth);
    const dy = clamp12(ey - innerHeight / 2, innerHeight);
    if (blackholeHost) {
      blackholeHost.classList.add("solid");
      blackholeHost.style.transition = "none";
      blackholeHost.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      requestAnimationFrame(() => {
        blackholeHost.style.transition = "transform 3000ms linear";
        blackholeHost.style.transform = "translate(0px, 0px)";
      });
    }

    // Steady growth (linear), starting as the supernova flare peaks.
    portalTimers.push(setTimeout(() => {
      window.__lenis?.start();
      const rideRaw = beatRawStart + FINALE_BEAT * (1 - beatRawStart);
      const y = st.start + (st.end - st.start) * rideRaw;
      if (window.__lenis) window.__lenis.scrollTo(y, { duration: 3.0, force: true, lock: true, easing: (t) => t });
      else scrollTo(0, y);
    }, 260));

    /* The held canvas is fully collapsed — pure black + the dying flare, no
       starfield left in it — so it can safely CROSS-FADE into the growing
       Gargantua instead of cutting (Yash 20:46: the flare "paused"). */
    /* Fade the WRAPPER, never the canvas alone: the wrap carries the CSS
       starfield behind the canvas, so fading only the canvas uncovers the
       full undistorted nebula (measured at 600ms — the same "stars open up
       again" leak wearing a new hat). The held canvas is opaque black, so
       fading the group hands straight over to the growing Gargantua. */
    portalTimers.push(setTimeout(() => {
      portalWrap.style.transition = "opacity 700ms ease-out";
      portalWrap.style.opacity = "0";
    }, 320));
    portalTimers.push(setTimeout(() => {
      portalWrap.classList.add("gone");
      portalWrap.style.transition = "";
      portalWrap.style.opacity = "";
      teardownPortalModule();
      portalState = "done";
    }, 1120));
  }

  const onBhEnter = (e) => { e.preventDefault(); ridePortal(); };
  addEventListener("bh:enter", onBhEnter);

  // The next section cannot interrupt the supplied animation's final embers.
  // Native scroll positions round to whole pixels; accept the final pixel on
  // scroll-driven and failed-load paths too.
  const wallRaw = USE_ZERO_MIRROR
    ? introRawEnd - 1 / Math.max(1, Math.round(innerHeight * totalScrollLength))
    : introRawEnd - 0.0105;
  const applyRaw = (raw) => {
    lastRaw = raw;
    beatLocal = beatUnlocked ? Math.min(mapBeatLocal(raw), FINALE_BEAT) : 0;
    if (portalOn) {
      if ((!USE_ZERO_MIRROR || burnTransition.ready || burnTransition.failed)
          && portalState === "off" && raw >= wallRaw && raw < 0.999 &&
          performance.now() > portalCooldownUntil) engagePortal();
      if (raw < wallRaw - 0.02) {
        if (portalState === "done") portalState = "off";
        if (!enteredOnce) beatUnlocked = false;   // after entering the wall is
        else if (blackholeHost) {                 // a pass-through, not a door
          blackholeHost.style.transition = "none";
          blackholeHost.style.transform = "";
        }
      }
    }
    blackholeBeat?.setProgress(beatLocal);
    applyProgress(mapScrollProgress(raw));
  };
  const st = ScrollTrigger.create({
    trigger: root,
    start: "top top",
    end: () => "+=" + Math.round(innerHeight * totalScrollLength),
    pin: true,
    pinSpacing: true,
    scrub: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => applyRaw(self.progress),
    onRefresh: (self) => applyRaw(self.progress),
  });

  /* ── idle hint ──
     Progress badalna hi asli signal hai. `wheel` sunna galat hota: pinned
     section ke andar wheel aata rehta hai par progress phir bhi ruka ho
     sakta hai (jaise end par). */
  let lastP = -1, idleFor = 0;
  const HINT_AFTER = 1.6;

  /* ── ek hi ticker ──
     Corridor render, props ki 3D projection, drift aur eq bars — sab yahin.
     Alag RAF loop = jitter (dekho HANDOFF §5.1). */
  const groups = acts.map((a) => a.objs).filter(Boolean);
  let last = 0;
  const tick = (time) => {
    const dt = Math.min(0.05, Math.max(0, time - last));
    last = time;

    corridor.render(time);
    orbHero?.render(time);            // no-ops once handed off (setOpacity 0)
    projector?.render(time);
    /* pinnable like the market canvas: the meet beat drifts its unassembled
       particles on the wall clock, so the reverse rig pins the clock to make
       fwd/rev comparisons pure state (same __bbPinTime contract). */
    consultHand?.render(window.__bbPinTime ? window.__bbPinTime / 1000 : time);
    burnScene?.render(time);
    zeroStageAudio?.tick(dt);
    blackholeBeat?.tick(dt);          // gas churns on its own clock (hybrid)
    projectObjects(groups, corridor, time);

    /* Act 01 ka core photo ke saath drift karta hai; sparkle usi measured
       amplitude ko follow karti hai taaki dono ek hi object lagein. */
    if (ideaFx && ideaLife > 0.001 && !reduced) {
      ideaFx.style.setProperty("--idea-float-x", `${(Math.sin(time * 0.14) * 6 * ideaLife).toFixed(2)}px`);
      ideaFx.style.setProperty("--idea-float-y", `${(Math.cos(time * 0.12) * 4 * ideaLife).toFixed(2)}px`);
      ideaFx.style.setProperty("--spark-rot", `${(Math.sin(time * 0.09) * 5).toFixed(2)}deg`);
    }

    // sound scroll ki raftaar se
    const v = Math.abs(st.getVelocity?.() ?? 0);
    sound.setIntensity(Math.min(1, v / 2600));

    if (eqBars.length) {
      const lv = sound.level();
      eqBars.forEach((b, i) => {
        const k = 0.55 + 0.45 * Math.sin(performance.now() / (180 + i * 55));
        b.style.height = (3 + lv * 30 * k).toFixed(1) + "px";
      });
    }

    /* ── FIX-FORWARD (25 Aug, designer swap): keep the act's clock alive.
       The vel filter lives inside applyRaw, and applyRaw's call sites are
       all scroll events — the "runs twice per frame (+ the ticker)" note
       above VEL_NORM describes the designer's rig, not this one. At rest
       filmVel FROZE at its last signed value and the canvas held a smeared,
       direction-keyed frame (verify-reverse .620/.660/.690: fwd latched
       +vel, rev latched -vel, ~24% of band pixels apart). Replaying lastRaw
       is idempotent (onReady does the same). While the camera canvas is
       live it replays every tick — the designer's own cadence, which also
       lets uTime breathe the band's arc at rest, exactly like the other
       acts render on this same ticker; the vel term keeps a decaying
       transport settling even once the canvas has faded out. */
    const camOn = marketCam3d && parseFloat(marketCam3d.canvas.style.opacity || "0") > 0.01;
    if (camOn || Math.abs(filmVel) > 0.02) applyRaw(lastRaw);

    // idle hint
    if (Math.abs(progress - lastP) > 0.0004) { idleFor = 0; lastP = progress; }
    else idleFor += dt;
    const wantHint = idleFor > HINT_AFTER && progress < 0.985;
    hint.setAttribute("data-on", wantHint ? "true" : "false");
  };
  gsap.ticker.add(tick);

  /* ── service sheet ──
     Each plate is a door: clicking opens a detail surface for that discipline.
     The copy is a placeholder until the real service pages are written; the
     structure is final so filling it in later is a content job, not a build. */
  const sheet = root.querySelector(".service-sheet");
  let sheetOpen = false, sheetLast = null;
  /* Read from BRAND, never retyped here. This constant sat empty for weeks, so
     the WhatsApp button on every service sheet stayed hidden and email — which
     was itself bouncing — was the only route out of the site. */
  const WA_NUMBER = BRAND.whatsapp || "";
  function openSheet(card) {
    if (!sheet || sheetOpen) return;
    const sv = SERVICES.find((x) => x.id === card.dataset.service);
    if (!sv) return;
    sheetOpen = true;
    sheetLast = card;
    sheet.querySelector("[data-sheet-eyebrow]").textContent = sv.word;
    sheet.querySelector("[data-sheet-title]").innerHTML = sv.line;
    sheet.querySelector("[data-sheet-proof]").textContent = sv.tag;
    sheet.querySelector("[data-sheet-what]").textContent = sv.what;
    sheet.querySelector("[data-sheet-gets]").innerHTML = sv.gets.map((g) => `<li>${g}</li>`).join("");
    sheet.querySelector("[data-sheet-who]").textContent = `For: ${sv.who}`;
    const msg = encodeURIComponent(`Hi Buildanta — I'd like to talk about ${sv.word}.`);
    const wa = sheet.querySelector("[data-sheet-wa]");
    const mail = sheet.querySelector("[data-sheet-mail]");
    if (mail) mail.href = `mailto:${BRAND.email}?subject=${encodeURIComponent(sv.word + " — Buildanta")}`;
    if (wa) {
      if (WA_NUMBER) { wa.href = `https://wa.me/${WA_NUMBER}?text=${msg}`; wa.hidden = false; }
      else wa.hidden = true;          // no number yet: email carries it
    }
    sheet.querySelector("[data-sheet-art]").style.backgroundImage = card.style.backgroundImage;
    sheet.classList.add("on");
    sheet.setAttribute("aria-hidden", "false");
    window.__lenis?.stop();
    sheet.querySelector("[data-sheet-close]")?.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!sheet || !sheetOpen) return;
    sheetOpen = false;
    sheet.classList.remove("on");
    sheet.setAttribute("aria-hidden", "true");
    window.__lenis?.start();
    sheetLast?.focus({ preventScroll: true });
  }
  filmCards.forEach((card) => {
    card.addEventListener("click", (e) => { e.preventDefault(); openSheet(card); });
  });
  sheet?.querySelector("[data-sheet-close]")?.addEventListener("click", closeSheet);
  sheet?.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen) closeSheet(); });

  const onResize = () => {
    filmPitch = 0;                 // re-measure the strip at the new width
    corridor.resize();
    projector?.resize();
    consultHand?.resize();
    burnScene?.resize();
    blackholeBeat?.resize();
    /* D-076: the portal still is framed for the viewport it was baked in */
    clearTimeout(portalStillTimer);
    portalStillTimer = setTimeout(() => {
      portalStillBaked = false;
      if (progress > 0.70) bakePortalStill();
    }, 250);
  };
  addEventListener("resize", onResize, { passive: true });

  /* Skip: intro ke end tak scroll kar do. Ye "band karo" nahi hai — scroll
     position hi sach hai, isliye skip bhi usi ko aage badhata hai. Warna do
     alag states ban jaate hain aur wapas scroll karne par sab tootta hai. */
  skipBtn?.addEventListener("click", () => {
    const y = st.end;
    if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.1 });
    else scrollTo({ top: y, behavior: "smooth" });
  });

  applyProgress(0);

  /* Inverse of mapScrollProgress: where in the pin does timeline p live?
     Tests used to hardcode raw values and broke the moment an act was given
     more room — they ask for this instead. */
  const rawForP = (target) => {
    let v = 0;
    for (const seg of SEGMENTS) {
      /* A named hold spans zero p. Cross its scroll distance for later beats
         without dividing by zero; the Zero stage still uses this mapping. */
      if (seg.p1 === seg.p0) {
        if (target > seg.p0) v += seg.vh;
        continue;
      }
      if (target <= seg.p1 || seg === SEGMENTS[SEGMENTS.length - 1]) {
        v += ((target - seg.p0) / (seg.p1 - seg.p0)) * seg.vh;
        break;
      }
      v += seg.vh;
    }
    return Math.max(0, Math.min(1, (v / introScrollLength) * introRawEnd));
  };

  /* Address a frame inside the Zero stage's zero-span scroll hold. Visual
     regression tests use this instead of guessing raw page percentages. */
  const rawForZeroStage = (target) => {
    const stageLocal = Math.max(0, Math.min(1, target));
    if (stageLocal <= 0.08) {
      /* analytic inverse of smoothstep(lead), matching zeroStageLead above */
      const y = stageLocal / 0.08;
      const lead = 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
      return rawForP(0.738 + lead * 0.050);
    }
    if (stageLocal > 0.95) {
      return rawForP(ZERO_STAGE_P + ((stageLocal - 0.95) / 0.05) * (0.945 - ZERO_STAGE_P));
    }
    const local = (stageLocal - 0.08) / 0.87;
    let v = 0;
    for (const seg of SEGMENTS) {
      if (seg.hold === "zeroStage") {
        v += seg.vh * local;
        break;
      }
      v += seg.vh;
    }
    return Math.max(0, Math.min(1, (v / introScrollLength) * introRawEnd));
  };

  return {
    corridor, sound, music, st,
    assetsReady: consultHand?.ready ?? Promise.resolve(),
    warmSource: () => consultHand?.warm?.(),
    rawForP,
    rawForZeroStage,
    /* The finale's black hole, exposed so Projects can fall through the scene
       the visitor is already looking at instead of overlaying another one.
       A getter, not the value: it is created asynchronously and is still null
       for the first moments after boot. */
    get blackholeBeat() { return blackholeBeat; },

    /**
     * Force every shader in the intro to compile NOW, behind the loader.
     *
     * three links a program the frame its material is first DRAWN, so the
     * compiles land mid-scroll otherwise — one was measured still linking at
     * p=0.02, inside the opening. Rendering each scene here, while the
     * entrance still covers the screen, moves all of that off the visitor's
     * timeline. Nobody sees these frames.
     *
     * Walks a few progress values because the acts swap what is visible as
     * they advance, and a program only compiles once its own material draws.
     * Deliberately EXCLUDES the finale (Yash's call: it is the heaviest and
     * it comes last, so it warms during the journey instead).
     *
     * Every step is guarded — a scene that will not warm must not stop the
     * site from loading. This is an optimisation, never a gate.
     */
    async warm(onProgress, budgetMs = 2600, shouldContinue = () => true) {
      /* ⚠️ THE LOOP LIMITS ITSELF — a timer cannot. The preloader also holds a
         reveal timer, but a setTimeout only fires when the main thread is
         free, and this loop IS what makes it busy: measured revealing after
         11.6s against a 3s cap on a slow machine, because the timer could not
         get a word in. Checking the clock between steps is the only cap that
         actually caps. Whatever is not warmed in the budget simply compiles
         later, exactly as it did before — the site is never worse for it. */
      const started = performance.now();
      const stops = [0.0, 0.08, 0.16, 0.30, 0.50, 0.66, 0.80, 0.92];
      for (let i = 0; i < stops.length; i++) {
        if (!shouldContinue() || performance.now() - started > budgetMs) {
          onProgress?.(1);
          break;
        }
        const p = stops[i];
        try {
          corridor.setProgress(p);
          corridor.render(i * 0.016);
          if (orbHero.ok) { orbHero.setActProgress(Math.min(1, p / 0.244)); orbHero.render(i * 0.016); }
          projector?.render(i * 0.016);
          consultHand?.setProgress?.(p, 1, USE_ZERO_MIRROR
            ? { progress: reduced ? 0.95 : p, opacity: 1 } : null);
          consultHand?.render(i * 0.016);
        } catch (e) {
          console.info("[preload] warm step skipped:", e?.message || e);
        }
        onProgress?.((i + 1) / stops.length);
        /* yield so the browser can paint the loader's progress and, on
           engines that compile asynchronously, get on with it in parallel */
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
      if (!shouldContinue()) {
        // The timeout may already have handed scrolling back to the visitor.
        // Restore THEIR current frame, never the warm-up's last pose or p=0.
        applyRaw(lastRaw);
        return;
      }
      /* ⚠️ PUT EVERY SCENE BACK, NOT JUST THE CORRIDOR.
         The first version reset only corridor, so the orb was left at the
         progress of the LAST warm stop — 0.92, fully formed, hot core — while
         the page sat at the top. Yash saw exactly that on reload: the opening
         frame with an already-formed core, then a snap as the timeline took
         over on the first real frame. Anything driven by progress has to be
         wound back here or the warm-up leaks into the visitor's first view. */
      try {
        corridor.setProgress(0);
        if (orbHero.ok) { orbHero.setActProgress(0); orbHero.setCoreFlash(0, 0); }
        consultHand?.setProgress?.(0, 0);
      } catch (e) {
        console.info("[preload] rewind skipped:", e?.message || e);
      }

      /* SETTLE. Yash's choice for the entrance: the orb should be alive and
         coming to rest as the site appears, not a frozen frame that starts
         moving. The sim has just been driven all over the act, so a few frames
         at the opening shape let the cloud EASE back into it — by the time the
         loader fades, the motion is already underway and there is nothing to
         snap. Cheap: these are frames nobody sees. */
      for (let i = 0; i < 6; i++) {
        /* Budgeted like the warm loop above, and for the same reason: six
           frames is ~36ms on a fast machine but three SECONDS at 2fps, and
           unbudgeted it pushed the reveal to 9.5s against a 4.2s cap. The
           settle is a courtesy — a slow machine should skip it, not wait for
           it. Its own frames count toward the same overall budget. */
        if (!shouldContinue() || performance.now() - started > budgetMs + 400) break;
        try {
          corridor.render(1 + i * 0.016);
          if (orbHero.ok) orbHero.render(1 + i * 0.016);
        } catch { /* a scene that will not settle must not block the reveal */ }
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
    },

    get wallRaw() { return wallRaw; },
    get introRawEnd() { return introRawEnd; },
    get progress() { return progress; },
    rawForBillTransition: (local) => rawForP(BURN_START_P + Math.max(0, Math.min(1, local)) * (1 - BURN_START_P)),
    get billTransition() {
      return {
        ...burnTransition,
        scene: burnScene?.state ?? null,
        sky: Number(root.style.getPropertyValue("--bill-sky")) || 0,
        portalStillBaked,
      };
    },
    destroy() {
      burnDisposed = true;
      clearTimeout(portalStillTimer);
      burnScene?.dispose();
      burnCanvas?.remove();
      gsap.ticker.remove(tick);
      removeEventListener("resize", onResize);
      st.kill();
      removeEventListener("bh:enter", onBhEnter);
      teardownPortalModule();
      window.__lenis?.start();
      corridor.dispose();
      projector?.dispose();
      consultHand?.dispose();
      zeroStageAudio?.dispose();
      blackholeBeat?.dispose();
      sound.stopAmbient(0.4);
    },
  };
}
