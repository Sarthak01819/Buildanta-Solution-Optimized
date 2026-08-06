# Buildanta Solutions — Current Handoff

This file is the source of truth for continuing the project in Claude, Codex,
or another coding session.

## Current result

The real project is a Vite site with a scroll-driven Three.js intro:

```text
BUILDANTA SOLUTIONS
→ 01 Your idea
→ 02 We code
→ 03 We market
→ 04 We consult
→ main website
```

Do not rename or rewrite those four taglines. The intro is controlled by page
scroll, not by a timed autoplay sequence. It is fully reversible.

Three acts use photographic backgrounds; `We code` is a native WebGL scene.
Floating props are currently
disabled with `INTRO.objects.enabled = false` in `src/config.js`. The full prop
catalogue is retained so it can be restored later without regenerating assets.
The opening particle sphere is centred behind the `BUILDANTA SOLUTIONS`
wordmark; the DOM title intentionally renders above the WebGL canvas.
On the opening-to-Act-01 transition, a progress-driven luminous drop falls
from that sphere into the photographed `Your idea` sphere. The impact leaves a
soft reversible ripple and sparkle field, while the first station plane drifts
subtly so the sphere feels alive. This effect is disabled for reduced motion.
The impact also emits six small splash droplets. Three become a transition
bridge into Act 02, follow separate curved paths, and land on visible glass
energy points at the bottom-centre base of the `We code` structure. The
reference video is not embedded or displayed. `src/gl/CodeBuild.js` recreates
its rhythm natively with a radial electric grid, three synchronized impact
rings, and a 24-module asymmetric fabrication machine. Its graphite plinth,
central glass engine, long left cantilever arm, detached right power tower,
load-bearing struts, upper gantry, control housing, and glass cap arrive in five
waves; each follows a curved approach, quaternion alignment, short magnetic
socket close, and one reversible seam activation. Two glass bearings, inset
procedural circuit plates, and principal bus seams make the locked modules read
as a working machine rather than an abstract stack. The completed structure
remains intact through the restrained camera macro/pullback and exits only with
the next-act crossfade. The droplets
target the native scene's projected base instead of hardcoded desktop/mobile
coordinates. Every state comes directly from scroll progress, so reverse
scrolling reverses the complete construction. `code.webp` remains only the
reduced-motion fallback.

## Working commands

```bash
npm install
npm run dev
npm run verify:props
npm run build
npm run build:single
```

Deliverables:

- `dist/` — deployable static website
- `standalone/buildanta-intro.html` — current one-file HTML; it runs offline
  with system-font fallbacks

Never send `standalone/buildanta-standalone.html`; it is a historical file.

## Available props

All saved lists live in `src/config.js`, but none are currently rendered.

### 01 — Your idea

- `idea-paper-plane`
- `idea-paper-ball`
- `idea-pencil`
- `idea-glass-marble`
- `idea-light-spark`

### 02 — We code

- `code-silicon-chip`
- `code-keycap-brace`
- `code-terminal-panel`
- `code-git-branch`
- `code-glass-card-stack`

### 03 — We market

- `market-bar-chart`
- `market-line-graph`
- `market-avatar-card`
- `market-heart-reaction`
- `market-smartphone-chart`

### 04 — We consult

- `consult-clipboard`
- `consult-fountain-pen`
- `consult-spectacles`
- `consult-chess-knight`
- `consult-magnifying-glass`

There are 36 extracted props in total—nine per act—under
`src/assets/intro/props/`. Inactive props are intentionally kept so a developer
can swap selections without generating new art.

## Prop pipeline

```text
source-assets/prop-sheets/*.png
        ↓ scripts/extract-intro-props.py
src/assets/intro/props/<act>/*.webp
        ↓ Vite imports in src/styles/objects.css
transparent animated props in the intro
```

The extraction script removes the magenta key background, repairs edge colour,
keeps transparent holes, adds safe margins, and exports optimized alpha WebP.
Pinned Python dependencies are in `scripts/requirements-intro-props.txt`.

Run `npm run verify:props` after any prop change. It checks:

- all 36 WebP files exist;
- all CSS classes and motion entries exist;
- the 20 active objects are valid;
- the four approved taglines have not changed.

## Motion architecture

`src/modules/introObjects.js` owns the placement and motion.

- `.obj` receives 3D projection, screen position, perspective scale, and opacity.
- `.obj > i` receives the slow drift and rotation.
- Do not combine both transforms on one element.
- Keep a maximum of five objects per act.
- Keep motion restrained: no bounce, elastic easing, pulsing, or blinking.

On narrow screens, projected X positions are compressed toward the viewport
centre. This is intentional and keeps all five props visible without removing
their depth or vertical motion.

## Visual rules

- Props must feel physically present in each photograph.
- Use matching glass, pearl, paper, metal, caustic light, and soft shadow.
- Do not replace them with flat icons or emoji.
- Preserve the four act palettes already defined in `src/styles/main.css`.
- Keep headline space clear.
- The footer has a local gradient scrim for legibility; do not remove it
  without testing all four acts.

## Sound

`src/modules/sound.js` generates the ambience and cues with Web Audio. The
configured volume is `INTRO.sound.volume = 0.55`.

Browser autoplay rules require a click, tap, or keypress before sound can
start. Do not attempt to bypass this, and do not remove the sound toggle.

## Important file map

```text
src/
├── config.js                    content, themes, active props
├── main.js                      application orchestrator
├── assets/intro/                scene photos and 36 alpha props
├── gl/CodeBuild.js              native Act-02 fabrication machine
├── gl/Corridor.js               intro camera, fog, planes
├── modules/intro.js             scroll/progress orchestration
├── modules/introObjects.js      depth projection and prop motion
├── modules/sound.js             Web Audio ambience and cues
├── styles/main.css              layout, themes, responsive rules
└── styles/objects.css           rendered and legacy prop catalogue

scripts/
├── build-single.mjs             self-contained HTML builder
├── extract-intro-props.py       reproducible sheet extraction
├── requirements-intro-props.txt
└── verify-intro-props.mjs       asset/wiring validator
```

## Verified state

- 36 image props wired, rendering disabled
- optimized prop payload: about 518 KB
- desktop checked at 1440×900 and 1280×720
- mobile checked at 390×844
- all five props visible in every mobile act
- no horizontal overflow
- continuous motion confirmed
- reverse scrolling confirmed
- opening title and small controls remain readable
- production and standalone builds pass
- browser console clean

## Still needs real business content

Before public launch, replace these placeholders in `src/config.js`:

- company email and phone;
- social URLs;
- final product descriptions and feature points;
- optional OG image and favicon;
- contact-form backend if required.
