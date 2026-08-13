import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { BRAND, PRODUCTS, CAPABILITIES, INFRA, PROCESS, STATS } from "./config.js";
import { createScene } from "./gl/Scene.js";
import { idleGate } from "./gl/visible.js";
import { mountDiag } from "./modules/diag.js";
import { createPreloader } from "./modules/preloader.js";
import { splitAll } from "./modules/splitText.js";
import { initScramble } from "./modules/scramble.js";
import { createIntro } from "./modules/intro.js";
import { mountContactRoom, BH_SHADERS } from "./gl/endurance/index.js";
import { createFinaleRoom } from "./modules/finaleRoom.js";
import { createEntryGate } from "./modules/entryGate.js";
import { initCursor, initMagnetic, countUp } from "./modules/interactions.js";
import "lenis/dist/lenis.css";
import { createWorldFall } from "./modules/worldFall.js";
import { createWorld } from "./world/world-app.js";
import { injectWorldMarkup } from "./world/world-markup.js";

gsap.registerPlugin(ScrollTrigger);

/* FINALE MODE: the black hole ends the experience — the blue site below is
   hidden (kept intact in markup). Set to false to restore the full site;
   the contact room then simply stays an in-flow section at the end of it. */
/* Switchable at load as well as in source: `?finale=0` boots the ordinary
   blue site with the Endurance as a section of it, `?finale=1` forces the
   black-hole finale. Without a parameter the constant below decides. Mode has
   to be chosen at boot — the finale relocates #contact into <body>, so it
   cannot be undone by toggling a class afterwards. */
const FINALE_DEFAULT = true;
const FINALE = (() => {
  const q = new URLSearchParams(location.search).get("finale");
  return q === null ? FINALE_DEFAULT : q !== "0";
})();
if (FINALE) document.documentElement.classList.add("bh-final");

/* ── ALWAYS OPEN AT THE TOP ────────────────────────────────────────────────
   Browsers restore the previous scroll position on reload. On a scroll-driven
   film that means a refresh drops you into the middle of an act, and then the
   timeline corrects toward it — which is the lurch Yash sees on every refresh,
   and why a reload "stays on the same page" instead of starting over.
   Turning restoration off is not enough on its own: Chrome can still apply a
   restore after this script runs, so the position is forced again on load and
   on pageshow (which is what fires when coming back via the bfcache). */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const toTop = () => window.scrollTo(0, 0);
toTop();
addEventListener("load", toTop);
addEventListener("pageshow", toTop);

/* ?diag=1 — the machine reports its own colour state. See modules/diag.js. */
addEventListener("DOMContentLoaded", () => { try { mountDiag(); } catch (e) { console.warn("[diag]", e); } });

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

  /* ── SMOOTHNESS REBUILD, step 1 ──
     This canvas belongs to the blue main site, which finale mode hides for the
     ENTIRE visit (`html.bh-final #gl { display: none }`). Building its scene
     anyway cost a whole WebGL2 context — one of seven — plus its scene graph,
     geometries, shaders and two window listeners, none of which any visitor
     can ever see. Gating the render (below) stopped the per-frame waste; this
     stops the context existing at all.
     Every caller already uses `scene?.`, so returning null is the supported
     path, not a new one. Restoring the blue site restores this with it. */
  if (FINALE) {
    console.info("[gl] blue-site scene not built — finale mode hides it");
    return null;
  }

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

  /* Finale mode hides the whole blue main site, this canvas with it — but the
     scene kept rendering anyway: measured 201 draw calls a second, at every
     scroll position, into a display:none element, for the entire visit. The
     gate skips the render and drops the 1.3 Mpx buffer while it is hidden, and
     restores both the moment the blue site is switched back on. */
  const glGate = idleGate(canvas, () => scene.resize());

  // ek hi ticker — Lenis, ScrollTrigger aur WebGL sab isi par
  gsap.ticker.add((time) => { if (glGate.awake()) scene.render(time); });

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
  {
    const lite = (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                 (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    if (FINALE && roomSection) {
      /* Riding the portal lands on the site's own Gargantua beat — that is the
         black hole the visitor ends on, so that is where the Endurance orbits
         and where Contact flies them in from. */
      finale = createFinaleRoom({
        blackholeHost: $(".intro__blackhole"),
        roomSection, shaders: BH_SHADERS, reduced: REDUCED, lite,
      });
    } else if (roomSection) {
      /* MAIN SITE. The contact section carries the Endurance itself: the ship
         renders on a layer inside the section, Contact flies you in, and the
         room resolves around you in place. Same module, same flight — only the
         host and the "are we on screen?" test differ. */
      const shipHost = $("[data-room-ship]", roomSection);
      let onScreen = false;
      new IntersectionObserver((es) => { for (const e of es) onScreen = e.isIntersecting; },
        { threshold: 0.35 }).observe(roomSection);
      finale = createFinaleRoom({
        blackholeHost: shipHost,
        roomSection, shaders: BH_SHADERS, isLive: () => onScreen,
        overlay: false, reduced: REDUCED, lite,
      });
    }
    if (finale) {
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

  /* THE ENTRANCE. Created BEFORE the intro so it is already covering the
     screen while the scenes build — the whole point is that none of the
     warm-up is ever seen. See modules/preloader.js. */
  const preload = createPreloader({
    onReveal: (ms) => console.info(`[preload] revealed after ${ms}ms`),
  });

  const intro = createIntro({ onProgress: onIntroProgress });

  /* Warm every shader behind the entrance, then reveal. Guarded and capped:
     the preloader reveals on its own timer regardless, so a warm-up that
     hangs can never trap anyone on a loading screen. */
  /* ⚠️ NOT ON PHONES. The warm-up renders every scene at eight progress stops
     to force its shaders to compile — which also forces every render target in
     the site to allocate AT BOOT. Measured at 430x932@3, his exact screen:
     25.7 MB of GPU textures inside the first second, with seven WebGL contexts
     created alongside it, without the visitor scrolling anywhere.

     His crash record says the tab was KILLED at 3 seconds, at 0% scroll, with
     no context-loss event — iOS terminating the process outright. I built that
     spike. Before the entrance existed these scenes allocated lazily as you
     reached them; I turned a cost spread across the whole journey into one
     moment, on the device least able to absorb it.

     Desktop keeps the warm-up, because there it prevents real mid-scroll
     shader hitches at no risk. On a phone the trade is a compile hitch versus
     a dead tab — which is Yash's own rule: a crash beats any quality rule. */
  const coarse = matchMedia("(pointer: coarse)").matches;
  Promise.resolve()
    .then(() => (coarse ? null : intro.warm?.((p) => preload.set(p * 0.96))))
    .catch((e) => console.info("[preload] warm-up skipped:", e?.message || e))
    .finally(() => { preload.set(1); preload.reveal(); });
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

/* ── PROJECTS: fall into the black hole, arrive in the world ───────────────
   Deliberately the LAST thing wired and entirely additive: nothing above is
   modified, so if this whole block is deleted the site is exactly what it was.
   That is the point of proving it in a copy first. */
(function wireWorld() {
  const host = document.getElementById("world-host");
  if (!host) return;

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let worldApi = null;

  const exitBtn = document.createElement("button");
  exitBtn.id = "world-exit";
  exitBtn.type = "button";
  exitBtn.textContent = "← Leave the world";
  document.body.appendChild(exitBtn);

  const fall = createWorldFall({
    reducedMotion: REDUCED,
    // The scene the visitor is already looking at — not a second one.
    // An overlay covered the finale, which is why the Endurance vanished the
    // moment you clicked. Falling through the real scene means it simply stays
    // where it is and drifts out of frame as the camera passes it.
    // Via the site's own global, not a closure variable: wireWorld runs BEFORE
    // boot(), so `intro` does not exist yet here — it is only assigned to
    // window.__buildanta at the end of boot. Read at click time, by which point
    // it does.
    getBeat: () => window.__buildanta?.intro?.blackholeBeat || null,
    onMountWorld: () => {
      host.hidden = false;
      // Injected rather than written into index.html: the world owns the shape
      // of its own markup, and a hand-copied duplicate here would drift the
      // moment either side renamed an id — with a silent null as the symptom.
      injectWorldMarkup(host);
      worldApi = createWorld({ host, mountRoot: host });
      worldApi.setPaused(true);   // stays frozen until the veil lifts
      return worldApi;
    },
    onUnmountWorld: () => {
      worldApi?.dispose?.();
      worldApi = null;
      host.hidden = true;
      host.innerHTML = "";
    }
  });

  /* Delegated, not bound per element.
     The finale builds its Projects control when the black hole settles, long
     after this runs — a querySelectorAll at boot finds nothing and the button
     ends up inert, which looks exactly like a broken feature. Listening on the
     document covers every entry point, whenever it appears. */
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.(".js-world-enter");
    if (!t) return;
    e.preventDefault();
    fall.enter();
  });
  exitBtn.addEventListener("click", () => fall.exit());
  addEventListener("keydown", (e) => {
    // Escape belongs to the world first — it closes an open card there. Only
    // when nothing inside is open does it mean "leave".
    if (e.key !== "Escape") return;
    if (document.documentElement.classList.contains("world-open")) return;
    if (document.documentElement.classList.contains("world-project")) return;
    fall.exit();
  });

  window.__worldFall = fall;
})();

boot();
