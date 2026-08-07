import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { BRAND, PRODUCTS, CAPABILITIES, INFRA, PROCESS, STATS } from "./config.js";
import { createScene } from "./gl/Scene.js";
import { splitAll } from "./modules/splitText.js";
import { initScramble } from "./modules/scramble.js";
import { createIntro } from "./modules/intro.js";
import { mountContactRoom, BH_SHADERS } from "./gl/endurance/index.js";
import { createFinaleRoom } from "./modules/finaleRoom.js";
import { createEntryGate } from "./modules/entryGate.js";
import { initCursor, initMagnetic, countUp } from "./modules/interactions.js";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

/* FINALE MODE: the black hole ends the experience — the blue site below is
   hidden (kept intact in markup). Set to false to restore the full site;
   the contact room then simply stays an in-flow section at the end of it. */
const FINALE = true;
if (FINALE) document.documentElement.classList.add("bh-final");

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ══════════════════════════════════════════════════
   1. config → DOM
   ══════════════════════════════════════════════════ */
function hydrate() {
  const full = `${BRAND.name} ${BRAND.suffix}`;
  $$("[data-brand]").forEach((e) => (e.textContent = full));
  $$("[data-designation]").forEach((e) => (e.textContent = BRAND.designation));
  $$("[data-tagline]").forEach((e) => (e.textContent = BRAND.tagline));
  $$("[data-intro]").forEach((e) => (e.textContent = BRAND.intro));
  $$("[data-since]").forEach((e) => (e.textContent = BRAND.since));
  $$("[data-email]").forEach((e) => (e.textContent = BRAND.email));
  $$("[data-location]").forEach((e) => (e.textContent = BRAND.location));
  $$("[data-phone]").forEach((e) => (e.textContent = BRAND.phone));
  $$("[data-year]").forEach((e) => (e.textContent = new Date().getFullYear()));
  $$("[data-email-link]").forEach((e) => (e.href = `mailto:${BRAND.email}`));
  $$("[data-general-mail]").forEach((e) => {
    e.href = `mailto:${BRAND.email}?subject=${encodeURIComponent("General — Buildanta")}`;
  });
  $$("[data-room-form]").forEach((e) => (e.dataset.mailto = BRAND.email));
  document.title = `${full} — ${BRAND.tagline}`;

  $("[data-products]").innerHTML = PRODUCTS.map(
    (p, i) => `
    <article class="product">
      <div>
        <div class="product__id">${p.id}</div>
        <div class="product__idx">UNIT ${String(i + 1).padStart(2, "0")}/${String(PRODUCTS.length).padStart(2, "0")}</div>
      </div>
      <div>
        <h3 class="product__name" data-scramble>${p.name}</h3>
        <p class="product__kicker">${p.kicker}</p>
      </div>
      <div class="product__body">
        <p class="product__blurb">${p.blurb}</p>
        <ul class="product__pts">${p.points.map((t) => `<li>${t}</li>`).join("")}</ul>
      </div>
      <div class="product__side">
        <span class="product__status" data-status="${p.status}">${p.status}</span>
        <span class="product__uptime">UPTIME ${p.uptime}%</span>
        <span class="product__bar" data-bar="${p.uptime}"><i></i></span>
        <span class="product__stack">${p.stack.join(" · ")}</span>
      </div>
    </article>`
  ).join("");

  $("[data-capabilities]").innerHTML = CAPABILITIES.map(
    (c) => `
    <article class="cap" data-reveal>
      <div class="cap__code">${c.code}</div>
      <h3 class="cap__t">${c.title}</h3>
      <p class="cap__b">${c.body}</p>
      <div class="cap__tags">${c.tags.map((t) => `<span>${t}</span>`).join("")}</div>
    </article>`
  ).join("");

  $("[data-infra]").innerHTML = INFRA.map(
    (l) => `
    <div class="infra__row" data-reveal>
      <div class="infra__l">${l.layer}</div>
      <div class="infra__d">${l.detail}</div>
      <div class="infra__m">${l.metric}</div>
    </div>`
  ).join("");

  $("[data-process]").innerHTML = PROCESS.map(
    (s) => `<li data-reveal><h3>${s.step}</h3><p>${s.body}</p></li>`
  ).join("");

  $("[data-stats]").innerHTML = STATS.map(
    (s) => `
    <div class="stat">
      <div class="stat__v" data-count="${s.value}" data-suffix="${s.suffix || ""}" data-decimals="${s.decimals || 0}">0</div>
      <div class="stat__l">${s.label}</div>
    </div>`
  ).join("");

  $("[data-socials]").innerHTML = BRAND.socials
    .map((s) => `<a href="${s.href}">${s.label}</a>`)
    .join("");
}

/* ══════════════════════════════════════════════════
   2. smooth scroll
   ══════════════════════════════════════════════════ */
function initScroll(onVelocity) {
  const lenis = new Lenis({
    lerp: 0.075,
    wheelMultiplier: 1,
    smoothWheel: true,
    autoRaf: false, // GSAP drives it — do RAF loops kabhi mat chalao
  });

  lenis.on("scroll", (e) => {
    ScrollTrigger.update();
    onVelocity?.(e.velocity);
  });

  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const t = a.getAttribute("href");
      if (t.length < 2) return;
      const el = $(t);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -10, duration: 1.4 });
    });
  });

  return lenis;
}

/* ══════════════════════════════════════════════════
   3. reveals
   ══════════════════════════════════════════════════ */
function initReveals() {
  const splits = splitAll();

  // CSS ne kuch hide nahi kiya — gsap.set inline se initial state deta hai.
  // Isliye JS fail ho to content phir bhi padha ja sakta hai.
  splits.forEach((chars) => gsap.set(chars, { yPercent: 115, opacity: 0 }));
  gsap.set("[data-reveal]", { y: 20, opacity: 0 });

  const heroChars = [];
  $$(".hero [data-split]").forEach((el) => heroChars.push(...splits.get(el)));

  const intro = gsap.timeline({ paused: true });
  intro
    .to(".hero [data-reveal]", { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.07 }, 0)
    .to(heroChars, { yPercent: 0, opacity: 1, duration: 1.1, ease: "expo.out", stagger: 0.016 }, 0.05);

  splits.forEach((chars, el) => {
    if (el.closest(".hero")) return;
    gsap.to(chars, {
      yPercent: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: 0.018,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  $$("[data-reveal]").forEach((el) => {
    if (el.closest(".hero")) return;
    gsap.to(el, {
      y: 0, opacity: 1, duration: 0.9, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 92%", once: true },
    });
  });

  initScramble(ScrollTrigger);

  // stat counters + top rule
  $$("[data-count]").forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: "top 94%", once: true,
      onEnter: () => {
        el.closest(".stat")?.classList.add("on");
        countUp(el, parseFloat(el.dataset.count), {
          decimals: parseInt(el.dataset.decimals, 10) || 0,
          suffix: el.dataset.suffix || "",
        });
      },
    });
  });

  // uptime bars
  $$("[data-bar]").forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: "top 95%", once: true,
      onEnter: () => { el.querySelector("i").style.width = el.dataset.bar + "%"; },
    });
  });

  return intro;
}

/* ══════════════════════════════════════════════════
   4. WebGL
   ══════════════════════════════════════════════════ */
function initGL() {
  const canvas = $("#gl");
  let scene;
  try {
    scene = createScene(canvas, { cyan: "#4ae0f5", amber: "#ffa629" });
  } catch (err) {
    console.warn("[gl] disabled:", err.message);
    canvas.style.display = "none";
    return null;
  }

  addEventListener("resize", () => scene.resize(), { passive: true });
  addEventListener("pointermove", (e) => scene.setPointer(e.clientX, e.clientY), { passive: true });

  // ek hi ticker — Lenis, ScrollTrigger aur WebGL sab isi par
  gsap.ticker.add((time) => scene.render(time));

  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (self) => {
      scene.scroll = self.progress;
      scene.morph = self.progress;
    },
  });

  return scene;
}

/* ══════════════════════════════════════════════════
   5. HUD telemetry
   ══════════════════════════════════════════════════ */
function initHUD() {
  const fpsEl = $("[data-hud-fps]");
  const scrollEl = $("[data-hud-scroll]");
  const xEl = $("[data-hud-x]");
  const yEl = $("[data-hud-y]");

  let frames = 0, last = performance.now();
  gsap.ticker.add(() => {
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      fpsEl.textContent = String(Math.round((frames * 1000) / (now - last))).padStart(2, "0");
      frames = 0; last = now;
    }
  });

  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (self) => {
      scrollEl.textContent = String(Math.round(self.progress * 100)).padStart(3, "0");
    },
  });

  addEventListener("pointermove", (e) => {
    xEl.textContent = ((e.clientX / innerWidth) * 180 - 90).toFixed(1);
    yEl.textContent = ((e.clientY / innerHeight) * 180 - 90).toFixed(1);
  }, { passive: true });
}

/* ══════════════════════════════════════════════════
   6. boot
   ══════════════════════════════════════════════════ */
function boot() {
  hydrate();                        // DOM pehle...
  const heroIntro = initReveals();  // ...tabhi split/scramble usko dhoondh payenge
  const scene = initGL();

  // scroll velocity → core glitch burst
  const lenis = initScroll((v) => scene?.kick(Math.min(0.9, Math.abs(v) * 0.02)));
  // Scroll ab kabhi band nahi hota — intro khud scroll se chalta hai.
  // Skip button ko Lenis chahiye, isliye ye handle global rakhte hain.
  window.__lenis = lenis;

  initCursor();
  initMagnetic();
  initHUD();

  /* Contact room. Its black hole is the SAME engine as the intro's exit beat,
     so it only draws while the section is on screen — two full raymarches at
     once would be paid for by every visitor, and only one is ever visible. */
  // declared here, not beside the gate below: onIntroProgress reads it and
  // the finale mounts above that point
  let finale = null;
  const roomSection = $("[data-room]");
  const room = roomSection
    ? mountContactRoom(roomSection, { reducedMotion: REDUCED })
    : null;
  if (room) {
    addEventListener("pointermove", (e) => {
      room.setCursor((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
    gsap.ticker.add((_t, dt) => room.tick(Math.min(dt / 1000, 0.05)));
    addEventListener("pagehide", () => room.dispose(), { once: true });
  }

  /* FINALE MODE: the black hole is not the last thing any more. The Endurance
     orbits beside it, a Contact control flies you in, and this same room
     becomes the site's final surface. Only in finale mode — with the blue
     site restored, the room stays an ordinary section at the end of it. */
  if (FINALE && roomSection) {
    const lite = (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                 (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    /* Riding the portal lands on the site's own Gargantua beat — that is the
       black hole the visitor ends on, so that is where the Endurance orbits
       and where Contact flies them in from. */
    finale = createFinaleRoom({
      blackholeHost: $(".intro__blackhole"),
      roomSection, shaders: BH_SHADERS, reduced: REDUCED, lite,
    });
    if (finale) {
      // the room is fixed-position now; it is always "on screen" for the
      // window engine, which the flight fades in and out with the section
      room?.setVisible(true);
      addEventListener("pointermove", (e) => {
        finale.setCursor((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
      }, { passive: true });
      gsap.ticker.add((_t, dt) => finale.tick(Math.min(dt / 1000, 0.05)));
      addEventListener("pagehide", () => finale.dispose(), { once: true });
    }
  }

  const progress = $("#progress");
  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (self) => { progress.style.width = self.progress * 100 + "%"; },
  });

  // fonts load hone ke baad refresh — warna trigger positions galat baithte hain
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  /* `load` par ek aur refresh. `fonts.ready` kaafi nahi hai: agar us waqt
     koi font pending na ho to wo turant resolve ho jaata hai — stylesheet
     apply hone se bhi pehle. `load` hi wo pehla event hai jo saari
     stylesheets ke baad aata hai, aur intro ka pin measurement usi par
     nirbhar hai. */
  if (document.readyState !== "complete") {
    addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
  }

  /**
   * Intro ab khatam nahi hota — wo scroll ke saath aata-jaata hai. Isliye
   * "reveal" ki jagah site ka chrome intro ke progress se fade hota hai.
   *
   * Nav intro ke dauraan chhupa rehta hai: uska cyan-on-dark look intro ke
   * warm/light palettes se ladta hai, aur intro ka apna top bar pehle se
   * brand dikha raha hota hai. Aakhri 14% mein aata hai, taaki jab tak
   * pin chhoote nav apni jagah par ho.
   */
  const nav = $(".nav");
  let heroPlayed = false;
  let entryGate = null;
  let entryGateReady = false;

  function playHero() {
    if (heroPlayed) return;
    heroPlayed = true;
    scene?.kick(0.9);
    heroIntro.play();
  }

  const ssStep = (x) => {
    const t = Math.min(Math.max(x, 0), 1);
    return t * t * (3 - 2 * t);
  };

  function onIntroProgress(p, handoff, beat) {
    /* `handoff` intro.js se aata hai — dono taraf ek hi curve hona zaroori
       hai, warna cross-fade ke beech mein dono chrome dikhte ya dono gayab.

       Ek hi custom property likhte hain, chhe elements ki inline opacity
       nahi: har atmosphere layer ki apni target opacity hai (.scan 0.35,
       .blueprint 0.5) aur unhe seedha `k` set karne par wo apni asli
       value se zyada gehri ho jaati thi. CSS mein multiply hota hai. */
    const beatOn = Boolean(beat?.enabled);
    // Finale: the Endurance and its Contact control ride the beat's own
    // progress, so they appear exactly when the hole has settled.
    if (finale && beatOn) finale.setBeat(beat.local);
    /* Black-hole beat ke saath site ka chrome uski white-out se hi nikalta
       hai — pehle nahi, warna nav black hole ke upar tairta dikhta. */
    const siteIn = beatOn ? handoff * ssStep((beat.local - 0.84) / 0.13) : handoff;
    document.documentElement.style.setProperty("--site-in", siteIn.toFixed(3));
    /* #progress cyan bar consult-zero-live hatte hi wapas aa jaata tha —
       black hole ke upar ek stripe. Beat ke dauraan use bhi rokna hai. */
    document.documentElement.classList.toggle(
      "beat-live",
      beatOn && beat.local > 0.001 && beat.local < 0.96
    );
    if (nav) nav.style.pointerEvents = siteIn > 0.5 ? "" : "none";
    if (beatOn) {
      /* Franklin gate REMOVED from the main flow (Yash, 6 Aug 16:18 MCQ):
         the Gargantua's white-out lands straight on the hero. The gate still
         exists for the reduced-motion path below. */
      if (beat.local >= 0.97 && entryGateReady) playHero();
    } else {
      // Reduced-motion (beat disabled) — purana behaviour, jaisa tha waisa.
      if (p < 0.94) entryGate?.rearm();
      if (p > 0.958 && entryGate && !entryGate.completed) entryGate.show();
      if (p > 0.985 && entryGateReady && (!entryGate || entryGate.completed)) playHero();
    }
  }

  const intro = createIntro({ onProgress: onIntroProgress });
  entryGate = createEntryGate({
    lenis,
    ScrollTrigger,
    intro,
    reduced: REDUCED,
    onComplete: playHero,
  });
  entryGateReady = true;
  // End-state reload: the gate is out of the main flow — land on the hero.
  if (intro?.progress > 0.998) playHero();

  // dev handle — console se sequence tune karne ke liye.
  // Build mein ye block poora strip ho jaata hai.
  if (import.meta.env.DEV) {
    window.__buildanta = { intro, entryGate, scene, lenis, heroIntro, ScrollTrigger, gsap };
  }
}

boot();
