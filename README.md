# Buildanta Solutions

Production-ready studio website with a scroll-driven cinematic intro.

The intro keeps the approved four taglines exactly as written:

1. `Your idea`
2. `We code`
3. `We market`
4. `We consult`

Each act has a full-screen cinematic world, restrained camera motion, and an
act-specific colour treatment. `We code` is a native WebGL transformation:
the incoming splash energises its base, a crisp grid draws, then graphite and
glass modules fly in, rotate, dock, and connect into a luminous fabrication
machine with a left tool arm, central engine, right tower, and upper gantry.
The completed system remains intact through its macro/pullback shot before the
next-act crossfade. Its photo remains the reduced-motion fallback. Floating
props are currently disabled. Every motion is reversible from scroll progress.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

## Build and verify

```bash
npm run verify:props
npm run build
npm run build:single
```

- `dist/` is the production website for static hosting.
- `standalone/buildanta-intro.html` is the one-file version. It runs offline
  with system-font fallbacks; online it loads the intended Google web fonts.
- `verify:props` checks all prop files and the CSS/config/motion wiring.

## Intro assets

```text
src/assets/intro/
├── idea.webp
├── code.webp
├── market.webp
├── consult.webp
└── props/
    ├── idea/       9 transparent WebP props
    ├── code/       9 transparent WebP props
    ├── market/     9 transparent WebP props
    └── consult/    9 transparent WebP props
```

All 36 props remain available for future use, but rendering is disabled through
`INTRO.objects.enabled` in `src/config.js`. The original generated prop sheets are kept in
`source-assets/prop-sheets/`, and `scripts/extract-intro-props.py` reproduces
the transparent cutouts.

## Main files

- `src/config.js` — taglines, active props, scene themes, products, and contact content.
- `src/modules/intro.js` — scroll-driven intro orchestration.
- `src/modules/introObjects.js` — 3D projection and continuous prop motion.
- `src/styles/objects.css` — rendered prop catalogue plus the legacy CSS-material fallback.
- `src/styles/main.css` — intro/site layout, themes, responsive rules, and readability scrims.
- `src/gl/Corridor.js` — Three.js camera corridor and scene planes.
- `src/gl/CodeBuild.js` — native Act-02 modular fabrication-machine construction.
- `src/modules/sound.js` — optional Web Audio ambience and interaction cues.

## Customisation

Change active props in `INTRO.steps[].objs` inside `src/config.js`. Keep a
maximum of five per act. Every rendered prop kind already has matching CSS and
motion data.

Replace the placeholder email, phone, social links, and product copy in
`src/config.js` before a public launch.

## Browser behaviour

Sound requires a click, tap, or keypress because browsers do not allow
autoplay audio before user interaction. The toggle always reflects the real
audio state.

The intro respects `prefers-reduced-motion`. It has been checked at desktop
and mobile sizes with no horizontal overflow and no console errors.
