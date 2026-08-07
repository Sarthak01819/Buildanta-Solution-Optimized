import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { INTRO, BRAND } from "../config.js";
import { splitChars } from "./splitText.js";
import { createSound } from "./sound.js";
import { createCorridor } from "../gl/Corridor.js";
import { createConsultHand } from "../gl/ConsultHand.js";
import { mountBlackholeBeat } from "../gl/blackhole/index.js";
import { buildObjects, projectObjects } from "./introObjects.js";
import { SERVICES } from "./services.js";
import { createProjector } from "../gl/projector/index.js";

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

  const consultZero = root.querySelector(".consult-zero");
  const consultHandCanvas = root.querySelector(".consult-zero__hand-canvas");
  const consultHand = !reduced && consultHandCanvas
    ? createConsultHand(consultHandCanvas)
    : null;

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
    palette[t] = {
      paper: cs.getPropertyValue("--paper").trim(),
      accent: cs.getPropertyValue("--brass").trim(),
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
    corridor.orb.setFade(orbFade);
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

      ideaFx.style.setProperty("--drop-x", `${(48.6 + dropT * 1.4 - curve * 1.6).toFixed(3)}vw`);
      ideaFx.style.setProperty("--drop-y", `${(37.5 + dropT * 26.5).toFixed(3)}vh`);
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
      const paths = [
        { start: [48.5, 64], control: [narrow ? 34 : 32, 29], target: [baseX, baseY] },
        { start: [50.0, 64], control: [narrow ? 70 : 72, 31], target: [baseX, baseY] },
        { start: [51.5, 64], control: [narrow ? 76 : 79, 47], target: [baseX, baseY] },
      ];

      paths.forEach((path, i) => {
        const start = 0.095 + i * 0.010;
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
      const lensTake = smoothstep((p - 0.686) / 0.030);   // .686 → .716 : the approach
      /* The act does NOT fade while the camera is coming forward — it held
         the machine's own opacity, so the thing travelling toward you
         disappeared before it arrived. It clears only once the lens owns the
         frame, and by then the screen is already black. */
      const marketOut = 1 - smoothstep((p - 0.716) / 0.008);
      const marketOpacity = marketIn * marketOut;
      const local = Math.max(0, Math.min(1, (p - 0.48) / 0.24));
      const zoomT = smoothstep((local - 0.08) / 0.38);
      const heroReveal = smoothstep((p - 0.472) / 0.028);
      const copyOpacity = heroReveal * (1 - smoothstep((local - 0.12) / 0.16));
      const filmIn = smoothstep((local - 0.24) / 0.09);
      const filmOut = 1 - smoothstep((local - 0.90) / 0.07);
      /* SETTLE AND HOLD (Yash MCQ): the strip is not linear in scroll. A
         detent curve spends most of its time parked with a plate in the gate
         and crosses the gap between plates quickly — a projector's rhythm. */
      const filmRaw = smoothstep((local - 0.27) / 0.58);   // reel owns .27–.85
      const slots = Math.max(filmCards.length - 1, 1);
      const pos = filmRaw * slots;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const detent = frac < 0.34 ? 0 : frac > 0.72 ? 1 : smoothstep((frac - 0.34) / 0.38);
      const filmTravel = (idx + detent) / slots;
      const humanIn = smoothstep((filmTravel - 0.72) / 0.12);
      const humanPush = smoothstep((filmTravel - 0.72) / 0.28);
      /* Longer capture runway: reel insertion ke baad camera ek frame mein
         jump nahi karta; scroll user ko lens tunnel ke andar travel karata hai. */
      /* The capture beat (camera swallows the reel into WE SCALE) used to
         start at .68 and drag the strip BACKWARDS while plates were still
         queuing — the last three never reached the gate. It now waits until
         the reel has finished. */
      const cameraCapture = smoothstep((local - 0.90) / 0.10);
      const cameraDepth = smoothstep((cameraCapture - 0.18) / 0.72);
      const cameraFlash = Math.sin(cameraCapture * Math.PI);
      const cameraRecoil = Math.sin(cameraCapture * Math.PI * 2) * (1 - cameraCapture);
      /* Spools/crank follow the FILM, not their own clock — they used to turn
         on a separate curve, so the machine looked disconnected from the reel
         it was supposedly pulling (Yash, 7 Aug). `pos` is the exact card
         position, so the projector parks when a plate parks. */
      /* The reels turn by the film that passes them. Raised from 0.62 to 1.45
         turns per plate so the movement actually reads at this size — the
         wheels are the thing Yash points at, and half a turn per beat is a
         nudge, not a machine running. */
      const cameraSpin = pos * 1.45 + cameraCapture * 2.25;
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
      const roomOut = 1 - smoothstep((p - 0.716) / 0.008);
      const lampStrike = smoothstep((local - 0.19) / 0.06);   // projector arrives AFTER the opening
      marketExperience.style.setProperty("--market-room",
        (roomIn * roomOut * (0.5 + 0.5 * lampStrike)).toFixed(3));
      marketExperience.style.setProperty("--market-lamp",
        (lampStrike * filmIn * filmOut).toFixed(3));

      /* black is fully up by .706 and HOLDS to .722 — a real beat of nothing,
         which is what makes the sphere land. The sphere is the consult world's
         own clip-circle opening (see --zero-reveal below). */
      const sphere = smoothstep((p - 0.730) / 0.062);      // .730 → .792
      /* the layer exists to turn the lens's near-black into TRUE black, so it
         arrives behind the glass, not instead of it */
      root.style.setProperty("--blackout", smoothstep((p - 0.706) / 0.012).toFixed(3));
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
      /* The strip clears BEFORE the lens dominates, not in step with it. On
         the same curve the plates were still 35% visible when the glass had
         the frame, and they ghosted through it like a double exposure. */
      const filmVis = filmIn * filmOut * marketOpacity
        * (1 - smoothstep((p - 0.688) / 0.014));
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
      const humanVis = filmIn * marketOpacity;
      marketExperience.style.setProperty("--market-human-opacity",
        (humanVis > 0.004 ? humanVis : (marketOpacity > 0.02 ? 0.004 : 0)).toFixed(3));
      marketExperience.style.setProperty("--market-human-drive", filmTravel.toFixed(3));
      marketExperience.style.setProperty("--market-human-exit", humanPush.toFixed(3));
      marketExperience.style.setProperty("--market-camera-capture", cameraCapture.toFixed(3));
      marketExperience.style.setProperty("--market-camera-depth", cameraDepth.toFixed(3));
      marketExperience.style.setProperty("--market-camera-flash", Math.max(0, cameraFlash).toFixed(3));
      marketExperience.style.setProperty("--market-camera-recoil", cameraRecoil.toFixed(3));
      marketExperience.style.setProperty("--market-camera-spin", cameraSpin.toFixed(3));
      marketExperience.style.setProperty("--market-camera-crank", `${cameraCrank.toFixed(2)}deg`);
      marketExperience.style.setProperty("--market-camera-shutter-angle", `${(filmTravel * 240 + cameraCapture * 540).toFixed(1)}deg`);
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
      /* the sphere: the world's own clip-circle, opening AFTER the black beat */
      const consultReveal = smoothstep((p - 0.730) / 0.062);
      const consultOut = 1 - smoothstep((p - 0.992) / 0.008);
      /* fully painted behind the black before the circle opens, so the circle
         is the ONLY reveal — a world that also fades in reads as a dissolve,
         not as something you entered */
      const consultOpacity = smoothstep((p - 0.714) / 0.012) * consultOut;
      const consultLocal = Math.max(0, Math.min(1, (p - 0.704) / 0.288));
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
      const handCopy = handIn * (1 - smoothstep((consultLocal - 0.64) / 0.14));
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
      /* Order (Yash, 17:04): intact note arrives fullscreen → background
         swaps to stars BEHIND it (.905–.935) → the burn plays over the
         stars (.94+). Never stars before the note, never burn before stars. */
      /* Swap hidden behind the fullscreen note (Yash MCQ 17:24): by .915 the
         note covers the frame; the world and backdrop dissolve to stars
         entirely BEHIND it — the visitor only discovers space when the burn
         opens holes. */
      const starIn = smoothstep((consultLocal - 0.915) / 0.015);
      consultZero.style.setProperty("--star-in", starIn.toFixed(3));
      /* Note-focus: the bill's canvas must ride ABOVE the fading stage, or
         the stage's half-faded cream veils the note during the swap. */
      consultZero.classList.toggle("note-focus", consultLocal > 0.913);
      if (portalOn && portalState === "off") {
        const skyLive = starIn > 0.01;
        if (skyLive && portalWrap.style.opacity) {
          portalWrap.style.transition = "";
          portalWrap.style.opacity = "";
        }
        portalWrap.classList.toggle("bg", skyLive);
        portalWrap.classList.toggle("gone", !skyLive);
        if (skyLive) mountPortalModule();                // no-op after entering
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
      consultHand?.setProgress(consultLocal, consultOpacity);
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
  const consultStretch = reduced ? 0 : 1.4;
  /* WE MARKET needs room: ten plates each get a readable beat (Yash, 7 Aug).
     Given as EXTRA viewport-heights on that act's own slice of the timeline,
     so every other act keeps exactly the pacing it already had. */
  const marketStretch = reduced ? 0 : 3.0;   // ~0.42vh of scroll per plate
  const MARKET_P0 = 0.425, MARKET_P1 = 0.696;
  /* Black-hole beat ka apna scroll span, burn ke poora hone ke BAAD —
     intro ka saara purana ganit introScrollLength par hi chalta hai,
     isliye acts/consult ki pacing ko ye chhoota tak nahi. */
  const beatStretch = beatEnabled ? 1.0 : 0;
  const consultTimelineStart = 0.704;
  /* Piecewise timeline: each row is [pFrom, pTo, extra-vh]. The base cost of a
     p-span is span * baseScrollLength; a stretch simply adds vh to that row. */
  const SEGMENTS = [
    [0, MARKET_P0, 0],
    [MARKET_P0, MARKET_P1, marketStretch],
    [MARKET_P1, consultTimelineStart, 0],
    [consultTimelineStart, 1, consultStretch],
  ].map(([p0, p1, extra]) => ({ p0, p1, vh: (p1 - p0) * baseScrollLength + extra }));
  const introScrollLength = SEGMENTS.reduce((a, seg) => a + seg.vh, 0);
  const totalScrollLength = introScrollLength + beatStretch;
  const introRawEnd = introScrollLength / totalScrollLength;
  const mapScrollProgress = (raw) => {
    let v = Math.min(raw / introRawEnd, 1) * introScrollLength;   // vh travelled
    for (const seg of SEGMENTS) {
      if (v <= seg.vh || seg === SEGMENTS[SEGMENTS.length - 1]) {
        return seg.p0 + Math.min(v / seg.vh, 1) * (seg.p1 - seg.p0);
      }
      v -= seg.vh;
    }
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
          starfieldUrl: "/assets/starfield.jpg",
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

  /* Deewar burn ke aakhri embers par hi aati hai — mint tail kabhi nangi
     nahi dikhti; 900ms ka CSS fade "instant but smooth" deta hai. */
  const wallRaw = introRawEnd - 0.0105;
  const applyRaw = (raw) => {
    beatLocal = beatUnlocked ? Math.min(mapBeatLocal(raw), FINALE_BEAT) : 0;
    if (portalOn) {
      if (portalState === "off" && raw >= wallRaw && raw < 0.999 &&
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
    projector?.render(time);
    consultHand?.render(time);
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
  const WA_NUMBER = "";   // ⚠️ Yash's WhatsApp number still needed — falls back to email
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
    if (mail) mail.href = `mailto:hello@buildanta.com?subject=${encodeURIComponent(sv.word + " — Buildanta")}`;
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
    blackholeBeat?.resize();
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
      if (target <= seg.p1 || seg === SEGMENTS[SEGMENTS.length - 1]) {
        v += ((target - seg.p0) / (seg.p1 - seg.p0)) * seg.vh;
        break;
      }
      v += seg.vh;
    }
    return Math.max(0, Math.min(1, (v / introScrollLength) * introRawEnd));
  };

  return {
    corridor, sound, st,
    rawForP,
    get wallRaw() { return wallRaw; },
    get introRawEnd() { return introRawEnd; },
    get progress() { return progress; },
    destroy() {
      gsap.ticker.remove(tick);
      removeEventListener("resize", onResize);
      st.kill();
      removeEventListener("bh:enter", onBhEnter);
      teardownPortalModule();
      window.__lenis?.start();
      corridor.dispose();
      projector?.dispose();
      consultHand?.dispose();
      blackholeBeat?.dispose();
      sound.stopAmbient(0.4);
    },
  };
}
