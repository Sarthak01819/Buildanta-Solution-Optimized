/**
 * Every measured number from the teardown, in one place.
 * Source: blueyard-teardown/SPEC.md — Pass 1 NUMBERS unless noted.
 *
 * Colour rule (SPEC carried caveat #1): everything here is AUTHORED sRGB.
 * Conversion to linear happens exactly once, at upload, in tokens.js.
 * Never mix the two — that caveat cost them #DB1010 reading back as #B50101.
 *
 * Tags:
 *   MEASURED  — read off live uniforms / Theatre state. Trust it.
 *   INFERRED  — not directly measurable; derived or reasoned. Tune at parity.
 */

export const LANDING = {
  /* ── Camera ────────────────────────────────────────────────────────────── */
  camera: {
    position: [0, 3.1, 16.6], // MEASURED
    /*
     * FITTED from a reference screenshot of blueyard.com at scrollTop 0 — fov
     * was never measurable and the first guess of 50° was ~3× too wide, which
     * rendered the orb as a small ball floating in frame instead of a planet
     * rising from the bottom edge.
     *
     * Two constraints come straight off that frame, both independent of fov:
     *   · the orb's TOP edge sits on the viewport's vertical midline
     *   · its radius is ≈0.63 of viewport height
     * The first fixes the ratio centreOffsetY / radius ≈ 1.0. With the measured
     * view-space centre at y −3.1, that forces a world radius of ≈3.1 (see
     * shell.radius). The second then gives the half-height at 16.6 units:
     *   3.05 / halfHeight = 1.26 half-heights  →  halfHeight = 2.421
     *   tan(fov/2) = 2.421 / 16.6 = 0.14584    →  fov = 16.6°
     * ≈ an 80mm lens on 35mm — a long lens, which is precisely what makes the
     * orb read as planet-scale rather than as an object on a desk.
     */
    fov: 16.6,
    near: 0.1,
    far: 100,
    pivotStrength: 0, // MEASURED — landing camera does NOT pivot with the pointer.
  },

  /* ── Layer 1: background gradient quad (program 13) ────────────────────── */
  background: {
    color1: '#FF5050',
    color2: '#D2AE41',
    color3: '#FAF4C9',
    color4: '#FAF4C9', // INFERRED — uColor4 unmeasured on landing; holds colour3.
    color1Brightness: 1,
    color2Brightness: 1,
    color3Brightness: 1,
    scale1: 1.88,
    scale2: 1.44,
    scale3: 1.0, // INFERRED — only scale1/scale2 were recovered.
    offset1: [-3.66, -0.4],
    offset2: [-0.51, -0.27],
    offset3: [0.0, 0.0], // INFERRED
    speed: 0.1,
    // FITTED to the measured composite corners (see gradient.glsl.js header)
    // by tools/tune-gradient.mjs, at a 0-code noise floor.
    // These five carry the tonal match; the colours alone do not.
    //
    // Scored on the TOP three corners only: mean |Δ| 3.7 codes/channel, worst 11.
    // The bottom three are not background — at the real framing the orb spans
    // almost the entire bottom edge, so bl/bm/br sample the ORB. An earlier fit
    // scored them too and hit "mean 6.9" by tuning the gradient to imitate an
    // orb that was itself 3× too small. Both errors hid each other.
    // The warp is NEGATIVE because our simplex field runs opposite in phase to
    // theirs at the measured offsets — same spread magnitude (≈0.17 in colour-1
    // fraction), opposite sign. An interior optimum, not a range edge: −0.47
    // through −0.70 all score within 0.4 of each other.
    axisBottom: 0.75, // colour1 fraction at the bottom of frame
    axisTop: 0.3, // …and at the top
    axisWarp: -0.62,
    midAmount: 0.12,
    midCenter: 0.58,
    midWidth: 0.3,
    fourthAmount: 0.0, // colour4 == colour3 on landing, so this is a no-op
  },

  /* ── Layer 2: particles ────────────────────────────────────────────────── */
  particles: {
    count: 256, // 256×256 = 65,536 (uTexelSize 0.0039)
    radius: 2.95,
    // velocity integrate (program 9)
    curlSize: 0.28,
    curlStrength: 0.087,
    curlNoiseSpeed: 3.66,
    curlNoisePersistence: 0.167,
    frequency: [7.58, 9.64],
    amplitude: [0.135, 0.121],
    shapeThreshold: 0.25,
    friction: 0,
    noiseTranslation: [105.12, 104.02, 97.26],
    // position integrate (program 10) — two independent decay/lerp pairs:
    // "snap back to the sphere" vs "wander freely", selected per particle.
    decay: 0.374,
    decay2: 0.396,
    lerpSpeed: 0.204,
    lerpSpeed2: 0.384,
    fluidStrength: 0.8, // measured 0.1 — see the coupled-trio note under `fluid`
    roughness: 0.65,
    detail: 0.5,
    // render (program 12, 43 uniforms)
    particleSize: 0.35,
    /* How much of each dot is SOLID before its edge starts fading, 0..1.
       Each particle is drawn as smoothstep(1.0, uDotSolid, d), so the original
       0.25 left only the inner quarter solid and the outer 75% a gradient —
       every dot was mostly blur, which is what Yash meant by "the dots are not
       sharp points". 0.6 gives each one a real body with a thin antialiased
       rim, so the loose particles read as discs of light rather than smudges.

       ⚠️ CHOSEN BY EYE, ON HIS MONITOR — and that is the honest reason it is
       0.6. Measured, 0.62 scored 30.80 against the original's 30.95 at the
       blown-up state, i.e. the metric said the ORIGINAL was fractionally
       crisper. It was wrong: it is dominated by the film grain, not by dot
       edges. Do not "correct" this back on the strength of that number.

       Ceiling worth knowing: the grain overlay sits above all of this with its
       own fixed texture, so past a point the dots cannot look sharper than the
       grain over them. If a higher value ever stops helping, that is why, and
       the next lever is the grain rather than this. */
    dotSolid: 0.6,
    // The unit uParticleSize is expressed in was never measurable — only the
    // RESULT was: the 4× zooms resolve the speckle into discrete 1–3 px
    // sprites. Derivation: at the reference framing (812px tall, fov 50, orb at
    // ~16.6) the frame spans 15.48 world units → 52.5 px per unit. A 2px sprite
    // is 0.038 units; 0.35 × mean scale 0.85 = 0.2975, so the unit is 0.128.
    // Taken at face value the quads are 20px wide and 65k of them stack into a
    // solid white ball — which is exactly what the first render did.
    sizeUnit: 0.128,
    scaleRange: [0.5, 1.2],
    baseColor: '#DB1414',
    baseColor2: '#FF7A3D',
    edgeColor1: '#FC8163',
    edgeColor2: '#FFB77A',
    edgeColorStop: [1.93, 2.89],
    bloomColor1: '#F0A39B',
    bloomColor2: '#F3B296',
    shadowColor: '#631255',
    shadowIntensity: 0.63,
    cloudsFadeIntensity: 2.8,
    sunDistanceColorStop: 9.93,
    distanceFadeNearFar: [18.18, 19.53],
    randomHighlightSelect: 0.98, // top 2% of particles → pure white
    highlightColor: '#FFFFFF',
    // The highlight has to sit ABOVE the bloom threshold while the cream
    // background sits below it, or the threshold either eats the whole page or
    // misses the sparkle entirely. Pure white is exactly 1.0, so it needs
    // headroom — half-float targets carry it fine. INFERRED.
    highlightIntensity: 2.6,
  },

  /* ── Flare particles (program 15) — the cyan cursor smear ──────────────── */
  flares: {
    count: 96, // 96×96 = 9,216
    particleSize: 0.3,
    sizeUnit: 0.22, // glints read a little larger than dust
    scaleRange: [0.5, 1.2],
    centerFade: [3, 3.3],
    color: '#DB1414',
    bloomColor: '#8AEDF0', // complementary to a warm field — why the trail is visible
    opacity: 1,
  },

  /* ── Layer 3: glass shell (program 14) ─────────────────────────────────── */
  shell: {
    // 1,984 triangles = SphereGeometry(r, 32, 32) → 32 × 31 × 2. MEASURED count.
    segments: 32,
    /*
     * FITTED, and it outranks the teardown's own reading here.
     *
     * The SPEC infers "particle radius 2.95 > shell radius", so this was 2.85.
     * But the reference frame at scrollTop 0 pins the orb's top edge to the
     * viewport midline, which forces centreOffsetY ≈ radius, and the measured
     * centre offset is 3.1. A 2.85 shell cannot produce that framing at any fov.
     *
     * The dissolving edge survives anyway: the dust's TARGET radius is 2.95, but
     * curl excursions carry particles out to a measured 3.61 (tools/diag), so
     * they still visibly leave a 3.05 shell. "Target radius" and "how far the
     * cloud actually reaches" are different numbers, and only the first was
     * measured off their uniforms.
     */
    radius: 3.05,
    opacity: 0.95,
    shininess: 74,
    colorFresnelAmount: 3.4,
    colorFresnelOffset: 0.05,
    colorFresnelFalloff: 1.51,
    opacityFresnelAmount: 1.37,
    opacityFresnelOffset: 0.025,
    opacityFresnelFalloff: 1.98,
    cloudsSmoothstep: [0.36, 0.92],
    cloudNoiseScale: [2.5, 2.5, 2.5],
    cloudNoiseSpeed: 0.42,
    ambientColor: '#FFA077',
    fresnelColor: '#F5E5E2',
    cloudsColor: '#DB1010',
    light1: { color: '#E7B56B', position: [-12, 16, 53], intensity: 0.95, specular: 0.19 },
    light2: { color: '#B82E51', position: [18, -6.7, 22], intensity: 0.92, specular: 0.68 },
  },

  /* ── Fluid sim (landing override) ──────────────────────────────────────── */
  /*
   * ⚠️ force / mouseRadius / particles.fluidStrength are a COUPLED TRIO and are
   * deliberately NOT their measured numbers. Their three constants only mean
   * something inside their own unit conventions — how the pointer delta is
   * normalised before injection, and how the radius enters the splat's exp() —
   * and neither convention was recoverable. Carrying the digits across into a
   * different unit system is cargo-culting, not parity: it shipped an effect
   * that measured "alive" and was invisible in Chrome.
   *
   * What IS specified is behaviour — "hover x=120 vs x=950 moved the smear
   * across the frame" — so these are fitted to that, by eye, against
   * tools/fluid-real.mjs. Measured originals for the record: force 5,
   * mouseRadius 0.1, fluidStrength 0.1.
   */
  fluid: {
    size: 128, // uTexelSize 0.0078 = 1/128
    iterations: 2,
    mouseRadius: 0.35, // measured 0.1 — see note above
    force: 20, // measured 5 — see note above
    forceClamp: 20,
    curlStrength: 0.368,
    dissipation: 0.035,
    viscosity: 0.484,
    pressure: 0.988,
  },

  /* ── Post FX (landing) ─────────────────────────────────────────────────── */
  post: {
    bloomEnabled: true,
    bloomStrength: 0.33,
    bloomRadius: 0,
    // INFERRED, and load-bearing: the landing background is cream at ~0.95
    // linear luminance. Any threshold below 1.0 blooms the entire page instead
    // of the sparkles, which is what "the whole thing went white" looks like.
    bloomThreshold: 1.0,
    grainEnabled: true,
    grainStrength: 0.1454, // live value (Theatre authored 0.23 on the override)
    chromaticAberration: 0.0025, // INFERRED — flag was on, magnitude unmeasured.
    vignetteEnabled: false,
    vignetteStrength: 0.602,
    vignetteInner: 0.08,
    vignetteOuter: 0.21,
    maxDistort: 0.449,
    bendAmount: -0.0779,
  },

  /* ── Sun & shadow ──────────────────────────────────────────────────────── */
  sun: {
    position: [4.2, 5.8, 6],
    fill: [-10, 1.2, -0.2],
    shadowIntensity: 0.63,
    shadowTint1: '#2D0527',
    shadowTint2: '#5D2B12',
  },
};

/** Second section — computing. Round 1 ships its palette only (no GLB). */
export const COMPUTING = {
  background: {
    color1: '#6936D7',
    color2: '#53ADEE',
    color3: '#FFFFFF',
    color4: '#FFFFFF',
    color1Brightness: 1,
    color2Brightness: 1,
    color3Brightness: 1,
    scale1: 1.62,
    scale2: 1.3,
    scale3: 1.0,
    offset1: [-2.1, 0.35],
    offset2: [0.4, -0.6],
    offset3: [0, 0],
    speed: 0.1,
    // UNVERIFIED — no composite was sampled inside the computing section, so
    // these are the landing shape carried across, not a measurement. Refit when
    // round 2 brings computing.glb and its own reference frames.
    axisBottom: 0.78,
    axisTop: 0.22,
    axisWarp: 0.19,
    midAmount: 0.34,
    midCenter: 0.5,
    midWidth: 0.32,
    fourthAmount: 0.25,
  },
  camera: { position: [0.77, 0, 7.25], fov: 50, near: 0.1, far: 100, pivotStrength: 1 },
};

/* ── Global WebGL / Transition (SPEC Pass 1 + Pass 2) ────────────────────── */
export const TRANSITION = {
  noise1Scale: [0.0167, 0.0306],
  noise1Offset: [0.026, 0.0008],
  noise2Scale: [0.1691, 0.1006],
  crossfadeSize: 0.4075,
  crossfadeNoise: 0.05,
  uvDistortion: 0.0415,
  /* Scroll → uProgress. Viewport-relative, anchored to the INCOMING section's
     top; linear, no easing, no low clamp (negative lets the outgoing scene sit
     fully composited before the mix begins). Saturates at 1.9 so the noise
     threshold clears both ends of its soft band: 1 + 2(0.4075) + 2(0.05). */
  windowVh: 1.1875, // A — scroll ahead of targetTop where progress = 0
  perUnitVh: 0.625, // B — vh of scroll per unit of progress
  clamp: 1.9,
};

/* ── Landing hero motion (SPEC Pass 2) ───────────────────────────────────── */
export const LANDING_MOTION = {
  // easeInOutQuad over a px-FIXED ~1,700px window reproduced every measured
  // sample within 0.004. PROBABLE (single cross-viewport data point).
  windowPx: 1700,
  // View-space start → end of the shell. Camera is at LANDING.camera.position,
  // so start (0,-3.1,-16.6) is world origin. One shared scalar drives all axes.
  viewStart: [0, -3.1, -16.6],
  viewEnd: [-3, 2, -12],
};

/* ── Scroll / adaptive quality ───────────────────────────────────────────── */
export const SCROLL = { lerp: 0.05, anchorOffsetVh: 0.15 };

export const QUALITY = {
  checkIntervalMs: 500,
  totalCheckLimit: 10,
  decideAfterChecks: 5,
  fpsThresholds: [15, 30, 40, 50],
  dprLadder: [1.0, 1.25, 1.5],
  dprCap: 2,
};
