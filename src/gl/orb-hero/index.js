/**
 * ORB HERO — drop-in module for buildanta-site (Act 01 opening orb).
 *
 * This is the orb engine trimmed to exactly what the flagship needs and
 * reshaped to that codebase's conventions. It replaces `src/gl/Orb.js` in the
 * Act 01 slot.
 *
 * API deliberately mirrors createCorridor/createScene so it drops into the
 * existing wiring with no new patterns:
 *
 *   const hero = createOrbHero(canvas, { paper, accent, ... });
 *   if (!hero.ok) { …fall back to the old createOrb… }
 *   gsap.ticker.add((t) => hero.render(t));      // site owns the clock
 *   hero.setProgress(act01Progress);             // 0 → 1 across Act 01
 *   hero.setPointer(px, py);
 *   hero.resize();
 *   hero.dispose();
 *
 * FOUR THINGS IT DOES NOT DO, on purpose:
 *  1. It does not start its own rAF loop. The site drives every renderer from
 *     gsap.ticker; a second loop would double-schedule and fight Lenis.
 *  2. It does not touch the corridor's scene, camera or framebuffer. It owns
 *     its own canvas and context — the corridor sets autoClear = false because
 *     CodeBuild and MarketGrowth paint second passes onto its framebuffer, and
 *     an EffectComposer in there would erase them.
 *  3. It does not read scroll. The caller passes Act 01's own progress, so the
 *     orb stays in lockstep with the glass drop and the Act 02 hand-off.
 *  4. It does not assume it can run. `ok` is false when WebGL2 or float render
 *     targets are unavailable, so the caller keeps the old 46k-particle orb as
 *     the fallback rather than showing an empty hero.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

import { LANDING, LANDING_MOTION, QUALITY } from './params.js';
import { FullscreenPass, sceneTargetOptions } from './targets.js';
import { GradientLayer } from './gradient.js';
import { ParticleSystem } from './particles.js';
import { GlassShell } from './shell.js';
import { FluidSim } from './fluid.js';
import { fsVert, compositeFrag } from './shaders/post.glsl.js';
import { Quality } from './quality.js';
import { pointer } from './pointer.js';
import { easeInOutQuad, clamp01 } from './curves.js';

/**
 * Buildanta re-skin of the measured Blue Yard palette.
 *
 * Every slot keeps its measured ROLE — the parity work established what each
 * colour does (axis endpoint, rim, core dust, escaping glint); only the hues
 * move. Defaults are the site's own tokens so the hero cannot drift from the
 * brand:
 *   paper  #F2E6D7  the site's Act 01 ground — ALSO the gradient's top stop, so
 *                   the hero's upper edge already IS the site background and the
 *                   hand-off to the corridor has nothing to blend.
 *   amber  #FFA629  --amber
 *   ember  #BD6741  Act 01 "warm ember" from PROJECT-CONTEXT
 *   warm   #FF9A5C  the old orb's own orbWarm — visual continuity
 *   cool   #F6E2CF  the old orb's orbCool
 *   cyan   #4AE0F5  Scene.js's cyan. The escaping glints need a colour
 *                   COMPLEMENTARY to a warm field or the trail is invisible on
 *                   amber; this is the site's existing cool token, so the one
 *                   deliberately "wrong" colour in the scene is still ours.
 */
/* PINK, chosen 8 Aug from the live picker (hue 12). The whole family is
   derived from that one hue so the orb and the ground cannot drift apart:
   paper is the ground and the gradient's top stop, ember the frame's bottom,
   warm/cool/amber the dust, rim and glow. Leaving these on the old orange
   while the ground went pink was what made the orb read as a separate
   colour scheme — the dust has to be lit by the same light as the room. */
export const BUILDANTA_HERO = {
  paper: '#FAC1B2',   // hsl(12, 88%, 84%)
  amber: '#FF7029',   // hsl(20, 100%, 58%)
  ember: '#BA3F2C',   // hsl(8, 62%, 45%)
  warm: '#FF825C',    // hsl(14, 100%, 68%)
  cool: '#F7DBCF',    // hsl(18, 70%, 89%)
  cyan: '#4AE0F5',
};

function skin(t) {
  return {
    background: {
      ...LANDING.background,
      color1: t.ember, // bottom of frame
      color2: t.amber, // mid-band tint
      color3: t.paper, // top of frame == the site's own ground
      color4: t.paper,
      /*
       * DELIBERATELY off the parity value (0.30 → 0.05).
       *
       * Blue Yard's axis never reaches its endpoint colour — the fitted 0.30
       * keeps ~30% of colour1 alive even at the top of frame, which is what
       * their measured corners demand. Here the top of frame has a different
       * job: it butts directly against the site's own --paper ground, so any
       * residue reads as a seam. Measured at 0.30 the hero's top edge came out
       * #EBC8B0 against a #F2E6D7 page — a 39-code gap in blue, plainly visible.
       * At 0.05 the gradient lands on the site colour and the hand-off has
       * nothing to blend.
       */
      axisTop: 0.05,
    },
    shell: {
      ...LANDING.shell,
      ambientColor: t.warm,
      fresnelColor: t.cool,
      cloudsColor: t.ember,
      light1: { ...LANDING.shell.light1, color: t.amber },
      light2: { ...LANDING.shell.light2, color: t.ember },
    },
    particles: {
      ...LANDING.particles,
      baseColor: t.ember,
      baseColor2: t.warm,
      edgeColor1: t.warm,
      edgeColor2: t.amber,
      bloomColor1: t.cool,
      bloomColor2: t.amber,
      shadowColor: t.ember,
      /* Hot pale amber, pushed above 1.0 so the bloom threshold (1.0) picks it
         up. Below 1.0 it would be a pale patch, not a light source. */
      coreColor: '#FFE2B4',
      coreIntensity: 3.1,
    },
    flares: { ...LANDING.flares, color: t.warm, bloomColor: t.cyan },
  };
}

class MixPass extends Pass {
  constructor(material) {
    super();
    this.material = material;
    this.fsQuad = new FullScreenQuad(material);
    this.needsSwap = true;
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() {
    this.fsQuad.dispose();
    this.material.dispose();
  }
}

export function createOrbHero(canvas, opts = {}) {
  // 'a' = the orb itself becomes the idea · 'b' = a new object in the same
  // material language. Built separately on purpose so they can be judged
  // against each other rather than blended into a compromise.
  const variant = opts.variant === 'b' ? 'b' : 'a';
  const theme = { ...BUILDANTA_HERO, ...opts };
  const P = skin(theme);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ?probe keeps the drawing buffer readable so a harness can sample pixels in
  // the same task as the draw. Real visitors never pay the bandwidth. Without
  // it every drawImage/readPixels grab returns a black frame and reports a bug
  // that isn't there.
  const probe = typeof location !== 'undefined' && new URLSearchParams(location.search).has('probe');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: probe,
    });
  } catch (err) {
    console.warn('[orb-hero] WebGL unavailable — caller should keep the old orb.', err);
    return { ok: false, render() {}, resize() {}, setProgress() {}, setActProgress() {}, setOpacity() {}, setCoreFlash() {}, setPointer() {}, dispose() {} };
  }

  const gl = renderer.getContext();

  /* ── WIDE GAMUT ──
     The orb's gradient IS the page's ground — its top stop is the site's own
     --paper. CSS now paints that ground in Display P3 on a wide-gamut screen,
     so this canvas has to arrive in the same gamut or one surface splits into
     two visibly different halves.
     Done at the CONTEXT, not through renderer.outputColorSpace, on purpose:
     this scene composites through an EffectComposer, and three's P3 output
     path is known to break with one (mrdoob/three.js#33030). Setting the
     drawing buffer's colour space instead leaves every pass untouched and
     simply tells the compositor to read the finished buffer as P3 — the same
     "same numbers, wider space" move the CSS makes, so the two stay matched
     by construction rather than by tuning.
     Silently ignored where unsupported, which is exactly the sRGB fallback.

     Not gated on a color-gamut media query, for the same reason the CSS is
     not: the two halves must apply the SAME rule or they part company on
     whichever screen the query answers differently. Support is the only test. */
  try {
    if ('drawingBufferColorSpace' in gl) {
      gl.drawingBufferColorSpace = 'display-p3';
    }
  } catch (e) {
    console.info('[orb-hero] wide-gamut output unavailable:', e?.message || e);
  }

  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!isWebGL2 || !gl.getExtension('EXT_color_buffer_float')) {
    // The whole particle system is a float ping-pong; without renderable float
    // targets there is nothing to degrade to. Say so and let the caller fall
    // back rather than shipping a blank hero.
    console.warn('[orb-hero] no float render targets — caller should keep the old orb.');
    renderer.dispose();
    return { ok: false, render() {}, resize() {}, setProgress() {}, setActProgress() {}, setOpacity() {}, setCoreFlash() {}, setPointer() {}, dispose() {} };
  }

  THREE.ColorManagement.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const quality = new Quality((r) => setPixelRatio(r));
  const fs = new FullscreenPass(renderer);

  /* Camera: NO rotation, looking straight down −Z. The whole measured motion is
     expressed in view space and only survives while world = camPos + viewPos.
     Point it anywhere and every number below quietly means something else. */
  const camera = new THREE.PerspectiveCamera(LANDING.camera.fov, 1, LANDING.camera.near, LANDING.camera.far);
  camera.position.set(...LANDING.camera.position);

  const scene = new THREE.Scene();
  const orb = new THREE.Group();
  scene.add(orb);

  const gradient = new GradientLayer(P.background);
  const fluid = new FluidSim(renderer, fs, LANDING.fluid);
  const particles = new ParticleSystem(renderer, fs, {
    size: LANDING.particles.count,
    params: P.particles,
  });
  const flares = new ParticleSystem(renderer, fs, {
    size: LANDING.flares.count,
    params: { ...P.particles, ...P.flares },
    flare: true,
    radius: 3.35,
    shapeThreshold: 0,
    seed: 0x51ee7,
  });
  const shell = new GlassShell(P.shell);
  orb.add(particles.mesh, shell.mesh, flares.mesh);

  const sun = new THREE.Vector3(...LANDING.sun.position);
  particles.setSun(sun);
  flares.setSun(sun);

  const rt = new THREE.WebGLRenderTarget(2, 2, sceneTargetOptions());
  const passMaterial = new THREE.ShaderMaterial({
    vertexShader: fsVert,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tScene;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(tScene, vUv); }
    `,
    depthTest: false,
    depthWrite: false,
    uniforms: { tScene: { value: rt.texture } },
  });

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, sceneTargetOptions()));
  composer.addPass(new MixPass(passMaterial));

  const post = LANDING.post;
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    post.bloomStrength,
    post.bloomRadius,
    post.bloomThreshold
  );
  bloom.enabled = post.bloomEnabled;
  composer.addPass(bloom);

  const composite = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uChromaticAberration: { value: post.chromaticAberration },
      uNoiseStrength: { value: post.grainStrength },
      uNoiseEnabled: { value: post.grainEnabled ? 1 : 0 },
      uVignetteEnabled: { value: post.vignetteEnabled ? 1 : 0 },
      uVignetteStrength: { value: post.vignetteStrength },
      uVignetteInner: { value: post.vignetteInner },
      uVignetteOuter: { value: post.vignetteOuter },
      uMaxDistort: { value: post.maxDistort },
      uBendAmount: { value: post.bendAmount },
    },
    vertexShader: fsVert,
    fragmentShader: compositeFrag,
  });
  // Last pass: it does the linear→sRGB encode itself so the grain lands on
  // perceptual values. Do NOT add an OutputPass — that would double-encode.
  composer.addPass(composite);

  pointer.bind();

  let w = 0;
  let h = 0;
  let progress = 0;
  let time = 0;
  let lastElapsed = null;
  let opacity = 1;
  let idle = false;
  const baseCoreIntensity = P.particles.coreIntensity ?? 2.6;
  let actMode = false;
  let actPath = 0;

  /* Where the orb comes to REST for "Your idea" — centred, a little below the
     axis so the headline sits above it, and closer to camera than the opening
     frame so it reads as having come toward you. View space, same convention
     as LANDING_MOTION. */
  const IDEA_VIEW = [0, -1.15, -12.6];
  const offset = new THREE.Vector3();
  const M = LANDING_MOTION;

  function setPixelRatio(ratio) {
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    applySize(true);
  }

  /* Where the orb sits for the CURRENT progress.
     Called from setActProgress as well as render, because coreScreen() is read
     by the caller in the same tick it sets progress — if the position only
     updated inside render(), the drop got aimed at wherever the orb was on the
     PREVIOUS frame, and refreshed only on scroll events. It landed at 114vh
     against a core at 81vh. */
  function applyOrbPosition() {
    if (actMode) {
      offset.set(
        M.viewStart[0] + (IDEA_VIEW[0] - M.viewStart[0]) * actPath,
        M.viewStart[1] + (IDEA_VIEW[1] - M.viewStart[1]) * actPath,
        M.viewStart[2] + (IDEA_VIEW[2] - M.viewStart[2]) * actPath
      );
    } else {
      offset.set(
        M.viewStart[0] + (M.viewEnd[0] - M.viewStart[0]) * progress,
        M.viewStart[1] + (M.viewEnd[1] - M.viewStart[1]) * progress,
        M.viewStart[2] + (M.viewEnd[2] - M.viewStart[2]) * progress
      );
    }
    offset.add(camera.position);
    orb.position.copy(offset);
  }

  function applySize(force = false) {
    const cw = canvas.clientWidth || innerWidth;
    const ch = canvas.clientHeight || innerHeight;
    if (!force && cw === w && ch === h) return;
    if (cw <= 0 || ch <= 0) return;
    w = cw;
    h = ch;

    // DPR read LIVE and clamped, never captured once at boot.
    const ratio = Math.min(quality.pixelRatio, QUALITY.dprCap);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);

    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));
    rt.setSize(bw, bh);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gradient.setSize(bw, bh);
    composite.uniforms.uResolution.value.set(bw, bh);
    fluid.setAspect(w / h);
  }

  applySize(true);
  quality.start();

  return {
    ok: true,
    variant,
    worldX: () => orb.position.x - camera.position.x,
    __ci: () => +particles.renderMaterial.uniforms.uCoreIntensity.value.toFixed(2),

    /**
     * Where the core lands on screen, in vw / vh.
     *
     * Projected from the live camera, never guessed in CSS — the same
     * discipline intro.js already uses for the Act 02 splash droplets
     * ("Target CSS guess nahi: CodeBuild ke apne camera se projected base
     * aata hai"). Move IDEA_VIEW or the fov and the drop follows on its own.
     */
    coreScreen() {
      camera.updateMatrixWorld();
      const v = orb.position.clone().project(camera);
      return { x: (v.x * 0.5 + 0.5) * 100, y: (1 - (v.y * 0.5 + 0.5)) * 100 };
    },

    /** 0 → 1 across Act 01. The eased curve is the one verified against the
     *  reference; only its anchor changed from a px window to act progress. */
    setProgress(p) {
      progress = easeInOutQuad(clamp01(p));
    },

    /**
     * The Act 01 arc, 0 → 1 across the whole act.
     *
     *   0.00 → 0.34   opening frame, then the orb COLLAPSES toward the core
     *                 (the falling glass drop is already animating into this
     *                 exact spot, so it now has a real thing to land on)
     *   0.34 → 0.70   the shell OPENS and the dust REORGANISES into the form
     *   0.70 → 1.00   holds, so the copy has a stable thing to sit against
     *
     * The measured travel arc still runs underneath on its own curve — this
     * only adds what happens to the orb's SHAPE once it has arrived.
     */
    setActProgress(p) {
      const t = clamp01(p);
      /* The measured Blue Yard arc is NOT used here — see applyOrbPosition.
         That arc was authored to carry the orb up-left and out of frame; it is
         an exit. This act needs it to arrive and stay, so the position comes
         from a single direct path (viewStart → IDEA_VIEW) instead. This value
         is just how far along that path we are. */
      actMode = true;
      actPath = easeInOutQuad(clamp01(t / 0.34));
      applyOrbPosition();

      // Collapse: pull the whole cloud in toward the core.
      const collapse = easeInOutQuad(clamp01((t - 0.12) / 0.22));
      const form = easeInOutQuad(clamp01((t - 0.34) / 0.36));

      for (const sys of [particles, flares]) {
        const u = sys.positionMaterial.uniforms;
        u.uFormMix.value = form;
        // The render side needs it too — that is what lights the core.
        if (sys.renderMaterial.uniforms.uFormMix) {
          sys.renderMaterial.uniforms.uFormMix.value = form;
        }
        u.uFormVariant.value = variant === 'b' ? 1 : 0;
        u.uRadius.value = sys.baseRadius * (1 - 0.42 * collapse);
      }

      /* The shell opening is the whole point of the beat, so it is driven, not
         implied: the body thins toward nothing while the rim stays lit, which
         reads as a skin peeling rather than a sphere fading out. */
      const s = shell.material.uniforms;
      /* The rim goes with it. Previously the colour Fresnel was RAISED as the
         shell opened, which is what left a faint bubble outline hanging around
         the formed core (Yash circled it). Both Fresnel terms now fade to zero
         with `form`, so the shell leaves nothing behind — while staying fully
         intact in the opening frame, where the rim is most of why the orb
         reads as glass. */
      const rimOut = 1 - form;
      s.uOpacity.value = P.shell.opacity * (1 - 0.97 * form);
      s.uColorFresnelAmount.value = P.shell.colorFresnelAmount * rimOut;
      s.uOpacityFresnelAmount.value = P.shell.opacityFresnelAmount * rimOut;
      shell.mesh.visible = form < 0.985;
      s.uCloudsSmoothstep.value.set(
        P.shell.cloudsSmoothstep[0] * (1 - 0.7 * form),
        P.shell.cloudsSmoothstep[1] + 0.5 * form
      );
    },

    /**
     * Wired to Act 01's existing `orbFade`, so the orb's exit stays exactly the
     * choreography that is already there.
     *
     * At zero it does not merely go transparent — it STOPS RENDERING. The orb
     * is on screen for global progress 0 → 0.10; leaving 65k GPGPU particles, a
     * 128² fluid and a bloom chain running for the other 90% of the site would
     * be paying full price for an invisible canvas, on a page that already runs
     * four other WebGL contexts.
     */
    /** Re-grade the ground live so the colour can be chosen on a real screen.
     *  `paper` is both the CSS --paper and this gradient's top two stops — one
     *  surface with two owners — so callers must move them together or the
     *  hero's upper edge stops matching the page behind it. `ember` is the
     *  bottom of frame, which is what carries the warmth under the orb. */
    setGround({ paper, ember, warm, cool, amber } = {}) {
      gradient.setColors({ color1: ember, color2: amber, color3: paper, color4: paper });
      /* The dust follows the ground. Leaving it amber over a pink field reads
         as two colour schemes rather than one object under one light — so the
         orb's own palette moves with the page's. */
      particles.setColors({
        baseColor: ember, baseColor2: warm,
        edgeColor1: warm, edgeColor2: amber,
        bloomColor1: cool, bloomColor2: amber,
      });
      flares.setColors({ bloomColor: cool });
    },

    setOpacity(a) {
      opacity = Math.max(0, Math.min(1, a));
      canvas.style.opacity = opacity.toFixed(3);
      const nowIdle = opacity <= 0.001;
      if (nowIdle !== idle) {
        idle = nowIdle;
        canvas.style.visibility = idle ? 'hidden' : '';
        // Drop the clock so the first frame back does not integrate a huge dt
        // and fling every particle out of the sphere.
        if (!idle) lastElapsed = null;
        /* Not rendering is only half of it: the drawing buffer stays resident
           for the other 90% of the site. At DPR 2 that is a 2880x1800 surface
           held for a canvas nobody can see. Release it here and let applySize
           rebuild it on the way back — the orb is already not drawing, so
           there is no frame to get wrong. */
        if (idle) {
          canvas.width = 1; canvas.height = 1;
        } else {
          applySize(true);
        }
      }
    },

    /**
     * Core brightness. Two independent inputs, both pure functions of scroll
     * computed by the caller — nothing is latched or self-decaying in here.
     * The intro is fully reversible ("reverse scroll par transition bhi reverse
     * hota hai"), and a stateful decay would run forwards while the reader
     * scrolls backwards.
     *
     *   spike  — the sharp hit at contact
     *   gained — the sustained lift the orb keeps afterwards, so it reads as
     *            having ABSORBED the drop rather than just flinched at it
     */
    setCoreFlash(spike = 0, gained = 0) {
      const u = particles.renderMaterial.uniforms;
      if (!u.uCoreIntensity) return;
      // Sustained lift rides the formed core; the spike gets its own
      // form-independent term so it is visible at contact, before the core
      // exists at all.
      u.uCoreIntensity.value = baseCoreIntensity * (1 + gained * 0.45);
      if (u.uFlash) u.uFlash.value = spike;
    },

    setPointer(px, py) {
      // Kept for API symmetry with the old orb. The fluid reads the shared
      // pointer singleton directly (mouse AND touch, one code path), so this is
      // only needed if the caller drives a synthetic pointer.
      pointer.glNormalized.set(px, py);
    },

    resize() {
      applySize(true);
    },

    /** Driven by the site's gsap.ticker, in SECONDS, same as createScene. */
    render(elapsed) {
      if (idle) return; // handed off — see setOpacity
      applySize(false);

      const dt = lastElapsed === null ? 1 / 60 : Math.min(Math.max(elapsed - lastElapsed, 0), 1 / 20);
      lastElapsed = elapsed;
      time += dt;
      const nd = Math.min(dt * 60, 3);

      if (reduced) fluid.enabled = false;
      fluid.update(dt);

      applyOrbPosition();

      const ctx = { camera, fluidTexture: fluid.texture, orbOffset: offset };
      particles.step(time, nd, ctx);
      flares.step(time, nd, ctx);
      shell.update(time);
      gradient.update(time);
      composite.uniforms.uTime.value = time;

      // Gradient first (clears colour), 3D on top with depth cleared.
      fs.render(gradient.material, rt, true);
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(rt);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.autoClear = prevAutoClear;

      composer.render();

      pointer.endFrame();
      quality.frame();
    },

    dispose() {
      quality.stop();
      particles.dispose();
      flares.dispose();
      shell.dispose();
      fluid.dispose();
      gradient.dispose();
      rt.dispose();
      composer.dispose();
      fs.dispose();
      renderer.dispose();
    },
  };
}

/**
 * Mount helper — inserts its own canvas DIRECTLY AFTER the corridor canvas.
 *
 * Deliberately NOT markup in index.html plus a rule in main.css. Keeping the
 * canvas here means porting this back to buildanta-site is one new folder plus
 * a diff in ONE existing file (intro.js), instead of touching index.html and a
 * 4,397-line stylesheet as well. Smaller diff, less to collide with whatever
 * that session is editing at the time.
 *
 * POSITION IS LOAD-BEARING, and the first attempt got it wrong. The intro
 * stacks: `.intro__gl` (corridor) at z-index 0, `.intro__inner` (all the copy
 * and chrome) at z-index 1. Appending this canvas to the end with z-index 1
 * gives it the SAME z as the copy but a LATER DOM position — so it paints over
 * the headline, the act text and the counter, and the hero renders as a
 * beautiful orb with no words on it.
 *
 * The fix is not a bigger number. It is z-index 0 inserted immediately after
 * the corridor canvas: equal z means DOM order decides, so it sits above the
 * corridor and stays below every text layer. Never let a GL layer outrank real
 * copy — the text has to be selectable, legible DOM, not pixels.
 */
export function mountOrbHero(afterCanvas, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'intro__orbHero';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    zIndex: opts.zIndex ?? '0',
    pointerEvents: 'none',
  });
  afterCanvas.after(canvas);

  const hero = createOrbHero(canvas, opts);
  if (!hero.ok) canvas.remove(); // leave no dead layer over the fallback orb
  return hero;
}
