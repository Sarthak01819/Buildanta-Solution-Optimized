import { gsap } from "gsap";

const SELECTOR = "[data-entry-gate]";

function setPageInert(root, value) {
  [...document.body.children].forEach((node) => {
    if (node === root || node.tagName === "SCRIPT" || node.tagName === "NOSCRIPT") return;
    if (value) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  });
}

/**
 * Full-screen Franklin portrait gate.
 *
 * The gate is still armed by the end of the scroll-driven WE CONSULT shot,
 * but entry is automatic: the original engraving settles without changing
 * Franklin's face, then the overlay dissolves over the hero.
 */
export function createEntryGate({ lenis, ScrollTrigger, intro, onComplete, reduced = false } = {}) {
  const root = document.querySelector(SELECTOR);
  if (!root) return null;

  const macro = root.querySelector(".entry-gate__macro");
  const macroImage = root.querySelector(".entry-gate__macro-base");
  const tone = root.querySelector(".entry-gate__tone");
  const scan = root.querySelector(".entry-gate__scan");
  const axis = root.querySelector(".entry-gate__axis");
  const top = root.querySelector(".entry-gate__top");
  const foot = root.querySelector(".entry-gate__foot");
  const status = root.querySelector("[data-entry-status]");
  const focusTarget = document.querySelector(".hero");
  const diagnosticChrome = [top, foot].filter(Boolean);
  const opticalChrome = [tone, scan, axis].filter(Boolean);

  let active = false;
  let entering = false;
  let completed = false;
  let dismissed = false;
  let revealTimeline = null;
  let dissolveTimeline = null;
  let heroPrepared = false;
  let heroStarted = false;
  let landedHeroY = 0;
  let reverseBridgeArmed = false;
  let restored = false;
  let gateListenersAttached = false;

  /* D-106: the engraving (1.3 MB) is only fetched when this gate can show —
     it did ship as a high-priority preload for every visitor while only the
     reduced-motion path ever uses the gate. index.html carries it as
     data-src; reduced motion loads it up front (decoded while hidden, as
     before), everyone else only if the gate is ever shown. */
  const loadMacro = () => {
    if (!macroImage || macroImage.getAttribute("src")) return;
    macroImage.src = macroImage.dataset.src;
    macroImage.decode?.().catch(() => {});
  };
  if (reduced) loadMacro();
  gsap.set(root, { opacity: 0, visibility: "visible", pointerEvents: "none" });

  // The pin spacer leaves roughly one viewport between ScrollTrigger's end
  // and the literal hero position. Bridge only that release gap on the first
  // upward gesture; normal scrubbed reverse motion resumes immediately.
  const bridgeReverseRelease = (state = {}) => {
    if (!completed || !intro?.st || !landedHeroY) return;
    const current = Number(state.scroll ?? lenis?.scroll ?? window.scrollY);
    const direction = Number(state.direction ?? 0);

    if (direction > 0 && current >= landedHeroY - 2) {
      reverseBridgeArmed = true;
      return;
    }

    const insideReleaseGap = current > intro.st.end + 2 && current <= landedHeroY + 8;
    if (!reverseBridgeArmed || direction >= 0 || !insideReleaseGap) return;

    reverseBridgeArmed = false;
    restoreForReverse();
  };
  const removeReverseBridge = lenis?.on?.("scroll", bridgeReverseRelease);

  const prepareHero = () => {
    if (heroPrepared) return;
    heroPrepared = true;

    // Reposition under a fully opaque Franklin layer so the dissolve lands on
    // the real hero without exposing the released WE CONSULT pin spacer.
    document.documentElement.classList.remove("entry-pending");
    lenis?.resize?.();
    ScrollTrigger?.refresh();
    const heroY = focusTarget
      ? focusTarget.getBoundingClientRect().top + window.scrollY
      : (intro?.st?.end ?? window.scrollY);
    landedHeroY = heroY;
    if (lenis) lenis.scrollTo(heroY, { immediate: true, force: true });
    else window.scrollTo(0, heroY);
    ScrollTrigger?.update();
    if (active || entering) document.documentElement.classList.add("entry-pending");
  };

  const startHero = () => {
    if (heroStarted) return;
    heroStarted = true;
    prepareHero();
    onComplete?.();
  };

  const restoreForReverse = () => {
    if (!completed || active || entering || restored || !intro?.st) return false;

    completed = false;
    active = true;
    restored = true;
    dismissed = false;
    heroPrepared = false;
    revealTimeline?.kill();
    dissolveTimeline?.kill();
    revealTimeline = null;
    dissolveTimeline = null;

    loadMacro();
    root.classList.add("is-active");
    root.classList.remove("is-entering");
    root.setAttribute("aria-hidden", "false");
    root.removeAttribute("aria-busy");
    if (status) status.textContent = "Franklin frame restored — scroll up for WE SCALE or down for the hero";
    document.documentElement.classList.add("entry-pending");
    setPageInert(root, true);
    lenis?.stop();
    focusTarget?.blur?.();

    gsap.set(root, { visibility: "visible", pointerEvents: "auto" });
    gsap.set(macro, { opacity: 1, scale: reduced ? 1 : 1.075 });
    gsap.set(tone, { opacity: reduced ? 1 : 0.72 });
    gsap.set(scan, { opacity: reduced ? 0.12 : 0.14 });
    gsap.set(axis, { opacity: reduced ? 0.22 : 0.3 });
    gsap.set(diagnosticChrome, { opacity: 0, y: 0 });

    const moveBehindPortrait = () => {
      document.documentElement.classList.remove("entry-pending");
      if (lenis) lenis.scrollTo(intro.st.end + 1, { immediate: true, force: true });
      else window.scrollTo(0, intro.st.end + 1);
      ScrollTrigger?.update();
      document.documentElement.classList.add("entry-pending");
      requestAnimationFrame(() => root.focus({ preventScroll: true }));
    };

    revealTimeline = gsap.timeline();
    revealTimeline
      .to(root, {
        autoAlpha: 1,
        duration: reduced ? 0.01 : 0.34,
        ease: "power2.inOut",
      }, 0)
      .to(macro, {
        scale: reduced ? 1 : 1.045,
        duration: reduced ? 0.01 : 0.54,
        ease: "power2.out",
      }, 0)
      .to(tone, {
        opacity: 1,
        duration: reduced ? 0.01 : 0.38,
        ease: "power1.out",
      }, 0.04)
      .to(scan, {
        opacity: reduced ? 0.12 : 0.2,
        duration: reduced ? 0.01 : 0.34,
        ease: "power1.out",
      }, 0.04)
      .to(axis, {
        opacity: reduced ? 0.22 : 0.42,
        duration: reduced ? 0.01 : 0.34,
        ease: "power1.out",
      }, 0.04)
      .to(diagnosticChrome, {
        opacity: 1,
        duration: reduced ? 0.01 : 0.38,
        stagger: reduced ? 0 : 0.06,
        ease: "power2.out",
      }, 0.08)
      .call(moveBehindPortrait, [], reduced ? 0.01 : 0.36);
    return true;
  };

  const removeGateInputListeners = () => {
    if (!gateListenersAttached) return;
    gateListenersAttached = false;
    root.removeEventListener("wheel", releaseOnReverseWheel);
    root.removeEventListener("touchstart", rememberTouch);
    root.removeEventListener("touchmove", releaseOnReverseTouch);
    root.removeEventListener("keydown", handleGateKeydown);
  };

  const finish = () => {
    prepareHero();
    startHero();
    active = false;
    entering = false;
    completed = true;
    restored = false;
    root.classList.remove("is-active", "is-entering");
    root.setAttribute("aria-hidden", "true");
    root.removeAttribute("aria-busy");
    setPageInert(root, false);
    document.documentElement.classList.remove("entry-pending");
    root.style.pointerEvents = "none";
    root.blur();
    reverseBridgeArmed = true;
    requestAnimationFrame(() => {
      lenis?.resize?.();
      lenis?.start();
    });

    focusTarget?.setAttribute("tabindex", "-1");
    focusTarget?.focus({ preventScroll: true });
  };

  const enter = () => {
    if (!active || entering || completed) return false;
    entering = true;
    restored = false;
    revealTimeline?.kill();
    revealTimeline = null;
    root.classList.add("is-entering");
    root.setAttribute("aria-busy", "true");
    if (status) status.textContent = "Opening Buildanta";

    // Move the page while the portrait is still opaque, then use one quiet
    // optical dissolve. No portal, flash, or full-screen camera lunge remains.
    prepareHero();
    dissolveTimeline?.kill();
    dissolveTimeline = gsap.timeline({ onComplete: finish });

    if (reduced) {
      dissolveTimeline
        .call(startHero, [], 0)
        .to(root, {
          autoAlpha: 0,
          duration: 0.18,
          ease: "none",
        }, 0);
      return true;
    }

    dissolveTimeline
      .to(diagnosticChrome, {
        autoAlpha: 0,
        duration: 0.24,
        ease: "power2.out",
      }, 0)
      .to(opticalChrome, {
        opacity: 0,
        duration: 0.42,
        ease: "power1.out",
      }, 0.04)
      .to(macro, {
        scale: 1.075,
        duration: 1.08,
        ease: "power2.inOut",
      }, 0)
      .call(startHero, [], 0.34)
      .to(root, {
        autoAlpha: 0,
        duration: 0.82,
        ease: "power2.inOut",
      }, 0.26);
    return true;
  };

  const show = () => {
    if (active || entering || completed || dismissed) return false;
    active = true;
    restored = false;
    revealTimeline?.kill();
    dissolveTimeline?.kill();
    document.documentElement.classList.add("entry-pending");
    root.classList.add("is-active");
    root.classList.remove("is-entering");
    root.setAttribute("aria-hidden", "false");
    root.removeAttribute("aria-busy");
    if (status) status.textContent = "Franklin portrait verification in progress";
    setPageInert(root, true);
    lenis?.stop();

    gsap.set(macro, { scale: reduced ? 1 : 0.99, opacity: 1 });
    gsap.set(opticalChrome, { opacity: 0 });
    gsap.set(diagnosticChrome, { opacity: 0, y: 0 });
    gsap.set(root, {
      autoAlpha: 1,
      pointerEvents: "auto",
      clipPath: "none",
    });

    const portraitHold = reduced ? 0.08 : 1.63;
    revealTimeline = gsap.timeline();
    revealTimeline
      .to(tone, {
        opacity: 1,
        duration: reduced ? 0.01 : 0.58,
        ease: "power2.inOut",
      }, 0)
      .to(scan, {
        opacity: reduced ? 0.12 : 0.2,
        duration: reduced ? 0.01 : 0.44,
        ease: "power1.out",
      }, reduced ? 0 : 0.08)
      .to(axis, {
        opacity: reduced ? 0.22 : 0.42,
        duration: reduced ? 0.01 : 0.46,
        ease: "power1.out",
      }, reduced ? 0 : 0.08)
      .to(macro, {
        scale: reduced ? 1 : 1.045,
        duration: reduced ? 0.01 : 1.18,
        ease: "power3.out",
      }, 0)
      .to(diagnosticChrome, {
        opacity: 1,
        duration: reduced ? 0.01 : 0.78,
        stagger: reduced ? 0 : 0.08,
        ease: "power2.out",
      }, reduced ? 0 : 0.14)
      .call(enter, [], portraitHold);

    requestAnimationFrame(() => root.focus({ preventScroll: true }));
    return true;
  };

  const hide = ({ rewind = true } = {}) => {
    if (!active || entering || completed) return false;
    active = false;
    restored = false;
    dismissed = true;
    revealTimeline?.kill();
    revealTimeline = null;

    root.classList.remove("is-active");
    root.setAttribute("aria-hidden", "true");
    root.removeAttribute("aria-busy");
    if (status) status.textContent = "Portrait entry cancelled";
    root.blur();
    dissolveTimeline?.kill();
    dissolveTimeline = gsap.timeline({
      onComplete: () => {
        gsap.set(root, { autoAlpha: 0, pointerEvents: "none" });
        setPageInert(root, false);
        document.documentElement.classList.remove("entry-pending");
        lenis?.resize?.();
        lenis?.start();

        if (rewind && intro?.st) {
          const releaseY = intro.st.start + (intro.st.end - intro.st.start) * 0.935;
          requestAnimationFrame(() => {
            lenis?.scrollTo(releaseY, {
              duration: reduced ? 0.01 : 0.72,
              force: true,
            });
          });
        }
      },
    });
    dissolveTimeline
      .to(diagnosticChrome, {
        autoAlpha: 0,
        duration: reduced ? 0.01 : 0.16,
        ease: "power1.out",
      }, 0)
      .to(macro, {
        scale: reduced ? 1 : 0.995,
        duration: reduced ? 0.01 : 0.22,
        ease: "power2.in",
      }, 0)
      .set(root, { autoAlpha: 0, pointerEvents: "none" }, reduced ? 0.01 : 0.22);
    return true;
  };

  let touchY = 0;
  function releaseOnReverseWheel(event) {
    if (event.deltaY < -1) hide();
    else if (restored && event.deltaY > 1) enter();
  }
  function rememberTouch(event) {
    touchY = event.touches[0]?.clientY ?? 0;
  }
  function releaseOnReverseTouch(event) {
    const nextY = event.touches[0]?.clientY ?? touchY;
    const delta = nextY - touchY;
    if (delta > 8) hide();
    else if (restored && delta < -8) enter();
    touchY = nextY;
  }
  function handleGateKeydown(event) {
    if (!active) return;
    if (!entering && (
      event.key === "ArrowUp" ||
      event.key === "PageUp" ||
      event.key === "Home" ||
      (event.key === " " && event.shiftKey)
    )) {
      hide();
      return;
    }
    if (restored && !entering && (
      event.key === "ArrowDown" ||
      event.key === "PageDown" ||
      event.key === "End" ||
      (event.key === " " && !event.shiftKey)
    )) {
      enter();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      root.focus({ preventScroll: true });
    }
  }

  root.addEventListener("wheel", releaseOnReverseWheel, { passive: true });
  root.addEventListener("touchstart", rememberTouch, { passive: true });
  root.addEventListener("touchmove", releaseOnReverseTouch, { passive: true });
  root.addEventListener("keydown", handleGateKeydown);
  gateListenersAttached = true;

  return {
    show,
    hide,
    rearm() {
      if (active || entering || restored) return false;
      completed = false;
      dismissed = false;
      heroPrepared = false;
      landedHeroY = 0;
      reverseBridgeArmed = false;
      root.classList.remove("is-active", "is-entering");
      root.setAttribute("aria-hidden", "true");
      root.removeAttribute("aria-busy");
      gsap.set(root, { autoAlpha: 0, pointerEvents: "none" });
      return true;
    },
    enter,
    get active() { return active; },
    get entering() { return entering; },
    get completed() { return completed; },
    get restored() { return restored; },
    get dismissed() { return dismissed; },
    destroy() {
      revealTimeline?.kill();
      dissolveTimeline?.kill();
      if (typeof removeReverseBridge === "function") removeReverseBridge();
      removeGateInputListeners();
      setPageInert(root, false);
      document.documentElement.classList.remove("entry-pending");
      lenis?.start();
      root.remove();
    },
  };
}
