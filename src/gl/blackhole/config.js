// Every tunable in the build lives here, grouped by graphical unit (see SPEC.md).
// Tonal matching against ref/*.jpg edits THESE numbers, never shader literals.

// Bump on every shader edit so any non-dev-server host busts its cache too.
export const SHADER_V = 17;

export const CONFIG = {
  camera: {
    dist: 47.0,       // camera distance from the hole, in Schwarzschild radii
    fovYDeg: 21.0,    // vertical field of view at 16:9 (see aspect note in blackhole.js)
    pitchDeg: 5.2,    // camera height above the disk plane (video is near edge-on)
    rollDeg: -2.4,    // slight film tilt: left end of the disk dips in frame
    yawDeg: 0.0,
    frameY: 0.03,
    // Autonomous cinematic wander (deg / period-s / phase). Two incommensurate
    // sines per axis — the drift never visibly repeats. Chosen 5 Aug: Yash
    // revised the earlier no-drift call after seeing the static framing.
    drift: {
      yaw:   [[2.20, 29, 0.0], [1.30, 71, 1.7]],
      pitch: [[0.90, 41, 0.8], [0.55, 97, 2.4]],
      dist:  [2.2, 61, 0.5],
    },  // raises the system in frame (screen-space, fraction of half-fov)
  },

  parallax: {
    maxYawDeg: 3.6,   // mouse lean, full-right — deepened in the cursor pass
    maxPitchDeg: 2.1, // mouse lean, full-down — deepened in the cursor pass
    ease: 3.2,        // spring rate (1/s): higher = snappier follow
  },

  disk: {
    rIn: 2.6,         // inner edge (just outside the ISCO look in the video)
    rOut: 18.5,       // outer feathered rim
    gain: 2.15,       // overall emission strength (HDR, pre-bloom)
    hotRim: 0.62,     // extra white-hot emission hugging the inner edge
    omega0: 1.30,     // rad/s at r=1 — calibrated in SCREEN px/s: inner ~28px/s, wings ~12px/s
    shearPeriod: 5.0, // short crossfade: fast gas boils and reforms, never ghost-doubles
    doppler: 0.38,    // approaching-side brightness boost (video: left side hotter)
    turbContrast: 2.7,// pow() on the turbulence field — higher = stringier
    alphaGain: 1.25,  // how opaque the disk sheet reads where it is dense
  },

  // Warm-gold ramp measured off the reference frames (inner → outer).
  colors: {
    hot:    [1.00, 0.980, 0.945], // white-hot core / inner rim
    mid:    [1.00, 0.640, 0.260], // gold
    outer:  [0.93, 0.440, 0.140], // copper
    rim:    [0.55, 0.240, 0.085], // rust at the feathered edge
  },

  ring: {
    gain: 0.5,        // photon-ring line brightness (additive, HDR)
    width: 0.065,      // falloff width around the photon sphere (in rs)
  },

  stars: {
    density: 0.9975,  // hash threshold — higher = fewer stars
    gain: 0.55,
    twinkle: 0.75,    // 0..1 shimmer amplitude — 'sparkle up' (5 Aug motion pass)
    hazeGain: 0.012,  // faint warm dust haze hugging the disk plane, far field
  },

  bloom: {
    threshold: 0.88,  // HDR luminance where glow begins
    knee: 0.65,       // soft-knee width below the threshold
    strength: 1.22,   // final mix of the bloom chain over the scene
    wideBoost: 0.80,  // extra weight on the deepest (widest) mips — the film halo
  },

  post: {
    exposure: 1.60,
    vignette: 0.30,
    grain: 0.011,
  },

  breathing: {
    period: 110,      // seconds per full swell-and-settle
    diskDepth: 0.13,  // ±13% on disk gain
    bloomDepth: 0.08, // ±8% on bloom strength
  },

  cursor: {
    boost: 0.07,      // max +7% on ring + bloom when the cursor nears the hole
    ease: 2.5,
  },

  // The cursor pass (10 MCQs, 5 Aug evening): light leans toward the cursor.
  cursorLight: {
    gain: 0.55,       // side-brightness swing at full lean — 'clearly noticeable'
    ease: 0.8,        // heavy drift: the light swings slowly, like mass
    lingerMs: 5000,   // hole keeps 'looking' at the last spot this long
    reachInner: 0.25, // full strength inside this centre distance (0..~1)
    reachOuter: 1.15, // fades toward this distance, floor below
    reachFloor: 0.55, // never fully dead at the page edge
    pulseGain: 0.45,  // click flare strength on the lights
    pulseDecay: 2.8,  // 1/s exponential decay (~0.9s visible)
  },

  halo: {
    ease: 9.0,        // halo follows almost-glued, slight silk lag
  },

  // Comet orbs: the cursor sheds soft round particles that gravity pulls into
  // the hole. Redrawn from scratch every frame — marks CANNOT persist (the
  // old accumulate-and-fade canvas left permanent 8-bit ghosts).
  trail: {
    dprCap: 1.5,      // trail canvas resolution cap — it is glow, not text
    spacing: 13,      // px of cursor travel per orb shed
    maxParts: 240,
    sizeMin: 4.5,     // orb core radius, css px
    sizeMax: 9.5,
    life: 20.0,       // pure safety net — orbs must ONLY die at the mouth
    gravity: 46000,   // pull strength — orbs visibly fall in within ~1–2.5s
    swirl: 0.45,      // tangential kick fraction: orbs spiral in, not beeline
    drag: 0.985,      // per-frame velocity damping
    captureFrac: 0.15,// hole mouth radius as fraction of min(w,h)
  },

  quality: {
    steps: 170,       // geodesic integrator steps (uniform-bounded loop — never a compile-time constant)
    maxInternalWidth: 2304, // render-target cap; canvas upscales via CSS beyond this
    watchdogMs: 19,   // sustained frame cost that triggers a one-notch scale drop
    scaleLadder: [1.0, 0.85, 0.72, 0.6],
  },
};
