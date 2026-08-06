# Buildanta Solutions — Complete Website Handoff

> One-file product, content, motion, visual, and engineering reference for the current Buildanta website.

## 1. Current status

| Item | Current value |
|---|---|
| Project | Buildanta Solutions interactive website |
| Status | Source documented; start the Vite server for browser preview |
| Local preview | Default `http://127.0.0.1:5173/`; use `4175` only when that port is explicitly passed |
| Framework | Vite + vanilla JavaScript |
| Motion | GSAP + ScrollTrigger + Lenis |
| 3D | Three.js |
| Main source | `index.html` + `src/` |
| Main stylesheet | `src/styles/main.css` |
| Shareable WE SCALE build | `standalone/Buildanta-WE-SCALE.html` |
| Standalone build command | `npm run build:we-scale` |

This document describes the current source and the approved experience, not every experiment still present in the project. Hidden laptop portal, consult-film, editor, capsule, tunnel, iris, and older WE CONSULT editorial layers are legacy implementation material and are not part of the active final scene. Where the main site and the focused WE SCALE standalone currently behave differently, that difference is stated explicitly.

Current page metadata:

- Title: `Buildanta Solutions — We build the systems businesses run on.`
- Description: `Buildanta Solutions — engineering studio. Field IoT to boardroom dashboards. Five deployed systems, one engineering standard.`

The Vite configuration normally starts on port `5173`. Port `4175` was used for previous explicit preview runs, but it should not be presented as live unless the server has been started and verified.

## 2. Brand foundation

- Brand: **BUILDANTA SOLUTIONS**
- System designation: `SYS.BLD-01`
- Positioning: **We build the systems businesses run on.**
- Operational since: **2019**
- Location: `IN · 19.07°N 72.87°E`
- Voice: precise, engineering-led, cinematic, confident, practical, and grounded in real operating systems.
- Language: concise English headlines with natural Hinglish explanatory copy.

Primary brand introduction:

> Field ke sensors se lekar boardroom ke dashboards tak — hum wo infrastructure banate hain jispe rozana ka kaam chalta hai. Paanch deployed systems, ek engineering standard.

## 3. Complete visitor journey

The current experience has three connected phases:

1. A pinned, reversible cinematic intro.
2. An automatic Franklin access gate.
3. The main long-form Buildanta website.

Canonical approved forward-scroll order:

1. **ACT 01 — Your idea**
2. **ACT 02 — We code**
3. **ACT 03 — We market**
4. **ACT 04 — WE SCALE**
5. Orbiting notes become paper birds one by one.
6. Each landed bird becomes part of a growing plant inside the globe.
7. The final untouched Franklin note zooms toward the camera.
8. The hand and globe disappear before the final-note burn takes over.
9. The note burns inward from its edges with restrained orange fire.
10. The Franklin access protocol appears automatically.
11. The gate dissolves into the main opening hero.
12. Main page sections: Hero → Proof Metrics → Systems → Modules → Infrastructure → Operational Sequence → Contact → Footer.

The sequence must also work in reverse. Reverse scrolling reconstructs the final note, then the globe/hand/plant/birds, and continues back through the earlier acts instead of leaving the viewport stuck in an end state.

### Current main-site integration gap

The renderer contains the full final-note focus and burn, and the focused WE SCALE standalone exposes it. The main `index.html` integration currently starts the Franklin gate at global intro progress `>.958`, which maps to only about WE SCALE local progress `.882`. The burn starts around local `.915`. Therefore, on the main site the fixed gate can cover/freeze the scene before the burn is visibly completed. Moving the main gate trigger until after the burn/exit and then verifying forward and reverse scroll is still required for the canonical order above to be true end to end.

Persistent intro chrome:

- `BUILDANTA SOLUTIONS`
- `An engineering studio`
- `Skip intro`
- Sound control states: `Tap for sound`, `Sound`, `Sound off`
- Scroll hint: `Scroll`
- Act counter: `01 / 04` through `04 / 04`

## 4. Cinematic intro acts

### ACT 01 — Your idea

**Headline:** Your idea

**Copy:**

> Aap problem laate ho. Hum sawaal poochte hain — jab tak asli wajah saamne na aa jaye.

**Theme:** Ember.

**Intent:** Begin with the user's raw problem or idea. The scene should feel spacious and curious, giving the visitor time to understand that Buildanta starts with diagnosis rather than decoration.

### ACT 02 — We code

**Headline:** We code

**Copy:**

> Ra.One x Matrix Code — Micro-matter voxel assembly, live binary streams, dual-layer atmosphere, aur scroll-driven core fly-through.

**Theme:** Terminal.

**Active visual language:** A technical code-build world with binary/data energy, voxel-like assembly, and camera depth. The movement is controlled by scroll and remains reversible.

### ACT 03 — We market

**Eyebrow:** `GROWTH MARKETING STUDIO · SEO / PAID / SALES`

**Headline:** We market

**Core copy:**

> We connect search strategy, paid acquisition, persuasive creative, and sales systems to turn demand into predictable revenue.

**Scroll hint:** `SCROLL INTO THIS SIGNAL CORE ↓`

**Theme:** Indigo.

The active film/data cards are:

| No. | Label | Discipline | Proof |
|---|---|---|---|
| 01 | SEARCH | SEO authority | `+420% organic traffic` |
| 02 | DEMAND | Paid acquisition | `$14M+ ad spend` |
| 03 | REVENUE | Sales systems | `3.8× conversion rate` |
| 04 | CONVERSION | CRO & creative | `+185% ROAS uplift` |
| 05 | RETENTION | Lifecycle growth | `92% net retention` |
| 06 | CREATIVE | Brand momentum | `8.5M impressions/mo` |
| 07 | INTELLIGENCE | Growth analytics | `100% data precision` |

The camera prop bridges this act into the WE SCALE world. The transition should feel like continuous camera travel, not a hard scene swap.

The active bridge camera currently carries a small `WE CONSULT` label. This is part of the ACT 03 camera prop; it is not the ACT 04 heading. The old WE CONSULT editorial scene and portal remain hidden, while the final active heading is WE SCALE.

### ACT 04 — WE SCALE

**Active heading:**

> WE  
> SCALE.

**Theme:** Mint / forest green.

**HUD copy:**

- `BUILDANTA / GROWTH SYSTEMS`
- `SCROLL TO ADVANCE`

**Capital ticker:**

- CAPITAL STRATEGY
- ACQUISITION
- CONVERSION
- RETENTION
- REVENUE INTELLIGENCE

#### Composition

- A bright mint-green world fills the viewport.
- A realistic green hand rises from below the frame.
- The hand stays slightly smaller and lower so the fingertips do not collide visually with the globe.
- A rotating hollow wireframe Earth floats **above** the fingertips, never behind the hand.
- The globe has a darker green atmospheric fume around it.
- Notes orbit the globe with genuine depth, changing scale and opacity as they pass in front of or behind it.
- The plant, butterflies, fireflies, roots, and branches live inside the globe rather than on a separate ball or ground card.

#### Active note → bird → plant choreography

1. All seven notes arrive and establish a readable orbit first.
2. The orbit continues; the notes do not all become birds immediately.
3. One selected note folds into a paper bird near the globe.
4. That bird flies to and lands inside the globe.
5. Only after landing does it transform into a plant element.
6. The next note repeats the sequence while the remaining notes continue orbiting normally.
7. Six notes complete the one-by-one transformation.
8. The plant grows leaf by leaf with branches and visible roots anchored directly to the inner bottom surface of the globe.
9. Butterflies and fireflies add small organic movement without overpowering the plant.
10. One final Franklin note remains untouched for the closing transition.

#### Final-note closing transition

The following sequence is implemented in the ConsultHand renderer and is fully inspectable in the focused WE SCALE standalone. It is also the approved main-site behavior, but the current main-site Franklin gate timing interrupts it early as noted in the integration gap above.

1. The last note stops participating in the orbit and moves toward the camera.
2. Before it dominates the screen, the green hand, globe, plant, atmospheric fume, and remaining supporting elements fade completely.
3. The Franklin portrait remains the original printed face; it must not smile, morph, blink, or change expression.
4. Burning starts only from the actively eroding paper edges.
5. Fire is a thin, irregular **orange** perimeter with a warm amber core—not large white/yellow cartoon ribbons.
6. The burn eats inward from the sides in a controlled way.
7. Embers and a few charred paper fragments peel away from the moving burn edge.
8. There is no rectangular shadow card, polygon backdrop, or dark panel behind the note.
9. The note must remain visible long enough for the burn to read clearly; it must not vanish early.
10. The sequence is reversible and reconstructs cleanly when the visitor scrolls back.

## 5. Franklin access protocol

The access layer is automatic. There is no clickable ENTER capsule anywhere in the active website.

**Top labels:**

- `BUILDANTA / ACCESS PROTOCOL`
- `FRANKLIN SIGNAL · VERIFIED`

**Screen-reader status:**

- `Portrait verification ready`

**Footer labels:**

- `PRIVATE OPERATING SYSTEM`
- `AUTO ENTRY / ARMED`

**Behavior:**

- Shows the original Franklin portrait.
- Holds the portrait for approximately `1.63s` in normal motion.
- Hero playback begins about `.34s` into the following dissolve, approximately `1.97s` after the gate appears.
- The full overlay finishes after approximately `2.71s` (`1.63s` hold + `1.08s` dissolve).
- In reduced motion, the hold is approximately `.08s` and the fade approximately `.18s`.
- Automatically dissolves into the main hero.
- No button, capsule, tunnel, iris, or flash.
- Reverse scrolling restores the gate and reconnects it to the WE SCALE ending.
- Current main-site trigger: global intro `>.958`, or about WE SCALE local `.882`; this is too early for the full burn and should be moved after the final exit.

Runtime accessibility messages:

- `Franklin portrait verification in progress`
- `Opening Buildanta`
- `Franklin frame restored — scroll up for WE SCALE or down for the hero`
- `Portrait entry cancelled`

On mobile, the secondary top label and first footer label are hidden to preserve space.

## 6. Persistent interface

### Navigation

- `BUILDANTA SOLUTIONS`
- `SYS.BLD-01`
- Systems
- Modules
- Infra
- Sequence

Status label:

- `ALL SYSTEMS NOMINAL`

### Global telemetry

- LAT/LON
- NODE `SYS.BLD-01`
- RENDER FPS
- DEPTH `%`

A site progress bar tracks movement through the page.

### Cursor note

The source still contains a custom cursor system for fine-pointer desktop devices, while the stylesheet force-hides the native cursor. This behavior must be rechecked before final deployment because earlier design direction requested that the unwanted cursor treatment be removed.

## 7. Main opening hero

**Kicker:**

> Engineering Studio — Operational since 2019

**Headline:**

> We build the  
> systems businesses  
> run on.

**Body copy:**

> Field ke sensors se lekar boardroom ke dashboards tak — hum wo infrastructure banate hain jispe rozana ka kaam chalta hai. Paanch deployed systems, ek engineering standard.

**System metadata:**

| Label | Value |
|---|---|
| UNITS DEPLOYED | `05` |
| FLEET UPTIME | `99.9%` |
| STACK | `IOT → CLOUD → UI` |
| SECTOR | `IN · 19.07°N 72.87°E` |

**Primary CTA:** `Access systems`

## 8. Proof metrics

| Metric | Label |
|---:|---|
| 5 | SYSTEMS DEPLOYED |
| 40+ | RELEASES SHIPPED |
| 99.9% | FLEET UPTIME |
| 6Y | OPERATIONAL |

Metrics count upward when they enter the viewport. The current count animation is approximately `1.9s`.

## 9. Section 01 — Deployed Systems

**Kicker:** `01 / Deployed Systems`

**Heading:**

> Five units.  
> One standard.

**Introduction:**

> Har unit field ki problem se shuru hua — client brief se nahi. Isi liye ye asli haalat mein chalte hain: kharaab network, sasta hardware, aur woh log jinke paas manual padhne ka time nahi hai.

### DHANDO

- ID: `BLD-01`
- Unit index: `UNIT 01/05`
- Category: BUSINESS OPERATIONS
- Status: ONLINE
- Uptime label: `UPTIME 99.94%`
- Copy: Chhote aur medium vyapaar ke liye inventory, billing aur party ledger — ek hi jagah. Jo register pehle haath se likha jaata tha, wahi ab real-time sync ke saath.
- Modules: INVENTORY · GST BILLING · PARTY LEDGER
- Stack: React · Node · Postgres

### TAP

- ID: `BLD-02`
- Unit index: `UNIT 02/05`
- Category: PAYMENTS LAYER
- Status: ONLINE
- Uptime label: `UPTIME 99.98%`
- Copy: Collect-first payments — QR, links aur reconciliation ek hi flow mein. Merchant ko sirf ek tap chahiye, baaki system sambhaal leta hai.
- Modules: UPI / QR · AUTO RECON · SETTLEMENTS
- Stack: Node · Redis · Webhooks

### MUNSI

- ID: `BLD-03`
- Unit index: `UNIT 03/05`
- Category: LEDGER ENGINE
- Status: ONLINE
- Uptime label: `UPTIME 99.91%`
- Copy: Aapka digital munshi. Entries, khata-bahi aur filing-ready statements — bina accountant ke bhi books saaf rehti hain.
- Modules: DOUBLE ENTRY · RECONCILE · EXPORTS
- Stack: Postgres · Python · Pandas

### WATER LEVEL

- ID: `BLD-04`
- Unit index: `UNIT 04/05`
- Category: IOT TELEMETRY
- Status: ONLINE
- Uptime label: `UPTIME 99.87%`
- Copy: Tank aur borewell ke liye ultrasonic level sensing, live dashboard aur threshold alerts. Motor kab chalana hai — ab andaza nahi, data.
- Modules: ULTRASONIC · LIVE FEED · DRY-RUN ALERT
- Stack: ESP32 · MQTT · TimescaleDB

### ZIMMEDARI

- ID: `BLD-05`
- Unit index: `UNIT 05/05`
- Category: ACCOUNTABILITY
- Status: BETA
- Uptime label: `UPTIME 99.40%`
- Copy: Task aur compliance tracking jisme har kaam ka ek naam hota hai. Assign karo, deadline lagao, aur audit trail apne aap ban jaata hai.
- Modules: OWNERSHIP · ESCALATION · AUDIT TRAIL
- Stack: React · Node · S3

## 10. Section 02 — Core Modules

**Kicker:** `02 / Core Modules`

**Heading:**

> Sensor to  
> dashboard.

| Module | Description | Tags |
|---|---|---|
| MOD.01 — PRODUCT ENGINEERING | Discovery se deployment tak. Web, mobile aur backend — ek team, ek codebase standard. | React · Node · Postgres · React Native |
| MOD.02 — IOT & EMBEDDED | Sensor firmware, gateway, ingestion pipeline aur dashboard. Hardware se pixel tak poora stack. | ESP32 · MQTT · Time-series · OTA |
| MOD.03 — CLOUD & INFRA | CI/CD, observability aur cost-aware infra. Deploy boring hona chahiye — hum usse boring rakhte hain. | Docker · CI/CD · Grafana · Backups |
| MOD.04 — INTERFACE SYSTEMS | Design systems jo scale karte hain. Accessible, fast, aur har product mein consistent. | Design systems · Motion · a11y · Tokens |

## 11. Section 03 — Infrastructure

**Kicker:** `03 / Infrastructure`

**Heading:** `Request path.`

**Introduction:**

> Ek request device se data tak kaise pahunchti hai. Har layer alag se monitor hoti hai, aur har layer ka apna budget hai.

| Layer | Description | Budget / signal |
|---|---|---:|
| EDGE | CDN · TLS termination · WAF | `12ms` |
| APPLICATION | Containerised services · autoscale | `40ms` |
| DATA | Postgres · Timescale · object store | `8ms` |
| DEVICE | ESP32 fleet · MQTT · OTA channel | `2.1k` |

## 12. Section 04 — Operational Sequence

**Kicker:** `04 / Operational Sequence`

**Heading:**

> Four steps.  
> No surprises.

| Step | Description |
|---|---|
| DISCOVER | Problem ko field mein jaakar samajhna. Assumptions likhit mein, guesses nahi. |
| DESIGN | Flows, states aur edge cases pehle. Pixel baad mein. |
| BUILD | Do-hafte ke cycles, har cycle mein kuch chalta hua deliver. |
| OPERATE | Launch end nahi hai. Monitoring, iteration aur support chalti rehti hai. |

## 13. Section 05 — Establish Link

**Kicker:** `05 / Establish Link`

**Heading:** `Kuch banana hai?`

**Contact copy:**

> Ek line likh do — kya problem solve karni hai. Hum 48 ghante mein reply karte hain, aur pehli call par hi bata dete hain ki ye humse banega ya nahi.

**Email:** `hello@buildanta.com`

The email, phone number, and social links must be confirmed before production launch; current values include placeholders.

## 14. Footer

- BUILDANTA SOLUTIONS
- We build the systems businesses run on.
- LINKEDIN
- GITHUB
- X
- `IN · 19.07°N 72.87°E`
- `+91 00000 00000` — placeholder
- `© [current year] — SYS.BLD-01`

## 15. Motion and scroll system

### Core behavior

- Lenis provides smooth scrolling with a current lerp of approximately `.075`.
- GSAP ScrollTrigger pins and drives the cinematic intro.
- The intro has four configured acts at `1.1` viewport heights each.
- The WE SCALE sequence adds approximately `1.4` viewport heights.
- Total pinned journey is approximately `5.8` viewport heights.
- WE SCALE begins around global intro progress `.704`.
- Its local progress is derived from approximately `(progress - .704) / .288`.
- All major transitions are scroll-linked and must remain reversible.

### Main timeline milestones

| Main intro progress | Active event |
|---:|---|
| `.000` | Initial BUILDANTA title and procedural orb |
| `.012–.100` | Orb fades while corridor frames establish depth |
| `.125` | ACT 01 / YOUR IDEA peak |
| `.095–.321` | Droplets transfer toward the code world and resolve in an impact/supernova beat |
| `.240–.520` | ACT 02 text, voxel Earth assembly, binary core/rings, particles, and camera fly-through |
| `.425–.732` | ACT 03 editorial reveal, signal core, film strip, cinema camera, reels, and lens capture |
| `.674+` | Bright exposure begins the mint-world transition |
| `.704–.780` | WE SCALE circle-clipped reveal |
| `>.958` | Franklin gate starts automatically |
| `>.985` | Main-site hero handoff is allowed after gate completion |

### WE SCALE local milestones

| WE SCALE local progress | Active event |
|---:|---|
| `.000–.045` | Lens/Earth reveal |
| `.170–.320` | Hand and globe world enter and settle |
| `.383–.410` | Roots and plant funding begin |
| `.388 + i × .09` | Six sequential note/bird/leaf funding beats |
| `.500–.860` | Fireflies and ecological detail |
| `.865–.905` | Supporting hand/globe world fades |
| `.870–.940` | Final Franklin note owns camera focus |
| `.915–.980` | Reversible edge-burn transition |
| `.978–1.000` | Final exit and gate handoff |

### Motion principles

1. Use eased interpolation even when scroll input is abrupt.
2. Avoid hard opacity cuts between the camera, globe, plant, note, gate, and hero.
3. Preserve spatial continuity: objects should enter and leave through camera depth.
4. Keep note transformations sequential and legible.
5. Never show completed plant growth before a corresponding bird has landed.
6. Hide the globe/hand fully before the final note owns the viewport.
7. Keep burn effects attached to the changing note edge.
8. Reverse scrolling must restore every state in the opposite order.

## 16. Responsive behavior

- Desktop is the cinematic reference composition.
- Cap renderer device-pixel ratio; the WE SCALE renderer currently caps DPR at approximately `1.2`.
- On smaller screens, prioritize the hand/globe relationship and headline readability over decorative notes.
- Keep the globe above the fingers without clipping its upper edge.
- Keep the hand lower and slightly reduced in size so it does not fight the Earth.
- Reduce simultaneous particles and peripheral notes before reducing the core hand/globe quality.
- Preserve a usable main page after the pinned intro on touch devices.
- Respect `prefers-reduced-motion`; nonessential cursor and decorative motion should be removed or simplified.

Current breakpoint map:

| Maximum width | Current adaptation |
|---:|---|
| `980px` | Product grid collapses |
| `820px` | Main navigation links hide |
| `780px` | Operational process layout collapses |
| `760px` | WE SCALE copy/ticker layout adjusts |
| `720px` | HUD hides; market camera/film travel is shortened |
| `700px` | Infrastructure layout collapses |
| `640px` | Intro typography/layout adapts |
| `560px` | Secondary navigation detail labels hide |

Wide and narrow cameras use different WE SCALE anchors/scales at an aspect-ratio threshold of approximately `1.15`.

Reduced-motion behavior:

- Shortens the intro to approximately `0.6 × 4` viewport heights.
- Disables native CodeBuild and ConsultHand WebGL sequences.
- Replaces native CodeBuild with `code.webp`.
- Makes `market.webp` available as the corridor fallback while the active DOM market editorial layer can still run.
- Removes custom cursor, optional object effects, and nonessential CSS transitions/animations.

Known reduced-motion cursor issue: the JavaScript custom cursor is disabled, but a late global CSS rule still forces `cursor: none !important`. On some reduced-motion desktop setups this may leave no visible cursor at all. Treat this as an open accessibility fix and verification item.

## 17. Performance constraints

- Do not create new textures, geometries, materials, or large arrays inside the render loop.
- Reuse Three.js objects and materials.
- Keep DPR capped.
- Avoid unnecessary full-screen blur and filter stacks.
- Keep particles restrained and reuse pooled elements where possible.
- Pause or simplify work when scenes are no longer visible.
- Maintain smooth forward and reverse interpolation.
- Test both production build and local preview; development smoothness alone is not enough.

Current implementation safeguards:

- A single GSAP ticker drives Lenis, ScrollTrigger, the corridor, and ConsultHand; the main page does not run duplicate RAF loops.
- Corridor caps DPR at `2`, the post-intro Scene caps it at `1.75`, and ConsultHand caps it at `1.2`.
- CodeBuild uses instanced voxel geometry and updates matrices only after a meaningful progress delta.
- Money-birds are instanced.
- The reversible CPU burn mask is `256 × 112` and only recomputes after a burn-progress delta of roughly `.0025`.
- Active burn resources include an orange edge shader, 32 pooled embers, and paper fragments.
- Renderer failures hide the canvas without making the written page content unusable.
- ScrollTrigger refreshes after font readiness and again on window load.
- Production output splits Three.js and GSAP into dedicated chunks.

## 18. Key source map

| File | Responsibility |
|---|---|
| `index.html` | Full page markup and scene layers |
| `src/config.js` | Brand, products, capabilities, infrastructure, process, and metric content |
| `src/main.js` | Content hydration, global animation setup, Lenis, ScrollTrigger, telemetry, and page handoff |
| `src/modules/intro.js` | Pinned four-act scroll timeline and scene coordination |
| `src/modules/entryGate.js` | Automatic Franklin gate and reverse-scroll bridge |
| `src/modules/interactions.js` | Pointer/cursor and interface interactions |
| `src/modules/sound.js` | Intro sound state and controls |
| `src/modules/splitText.js` | Accessible per-character heading preparation |
| `src/modules/scramble.js` | Product/heading text scramble animation while preserving accessible labels |
| `src/modules/introObjects.js` | Optional prop system; imported but inactive because `INTRO.objects.enabled` is false |
| `src/gl/Corridor.js` | Intro camera corridor and native-scene orchestration |
| `src/gl/Orb.js` | Initial procedural orb and ACT 01 transfer effects |
| `src/gl/CodeBuild.js` | ACT 02 voxel Earth, binary core, rings, particles, and camera flight |
| `src/gl/ConsultHand.js` | WE SCALE hand, globe, notes, birds, plant, atmospheric life, zoom, and burn sequence |
| `src/gl/Scene.js` | Lightweight post-intro shader grid/core scene |
| `src/gl/MarketGrowth.js` | Bundled dormant experiment; not instantiated in the current intro |
| `src/styles/main.css` | Main layout and active final visual overrides |
| `src/styles/objects.css` | Optional prop asset definitions; current config creates no prop nodes |
| `public/assets/consult-hand-v2.png` | Active realistic green-hand texture |
| `we-scale.html` | Standalone WE SCALE source shell |
| `src/we-scale-standalone.js` | Standalone WE SCALE boot logic |
| `src/styles/we-scale-standalone.css` | Standalone WE SCALE styles |
| `scripts/build-we-scale-standalone.mjs` | Bundles the focused shareable single HTML file |
| `scripts/build-single.mjs` | Historical full-site exporter; currently incompatible with all live public-asset references |
| `standalone/Buildanta-WE-SCALE.html` | Current single-file WE SCALE deliverable; scene assets embedded, Google Fonts external |
| `standalone/buildanta-intro.html` | Stale historical full-site export; do not share as the current site |
| `package.json` | Dependencies and dev/build/export scripts |
| `vite.config.js` | Host, default port, build target, and production chunking |

### Active runtime asset manifest

| Asset | Active usage |
|---|---|
| `src/assets/intro/idea.webp` | ACT 01 photo station |
| `src/assets/intro/code.webp` | ACT 02 reduced-motion fallback |
| `src/assets/intro/market.webp` | ACT 03 reduced-motion fallback |
| `public/market-cinema-camera-front.png` | ACT 03 camera bridge |
| `public/assets/consult-hand-v2.png` | WE SCALE green hand |
| `public/assets/consult-plant-atlas-v3.png` | Plant/roots/leaves atlas |
| `public/assets/consult-ecology-atlas-v1.png` | Butterflies/fireflies/ecology atlas |
| `public/assets/consult-paper-bird-v1.png` | Paper-bird atlas |
| `public/assets/entry-franklin-macro.png` | Franklin gate and local standalone note texture |

Approximate active asset sizes:

| Asset | Size |
|---|---:|
| `market-cinema-camera-front.png` | `0.82 MB` |
| `consult-plant-atlas-v3.png` | `0.75 MB` |
| `consult-ecology-atlas-v1.png` | `0.76 MB` |
| `consult-hand-v2.png` | `1.29 MB` |
| `consult-paper-bird-v1.png` | `0.93 MB` |
| `entry-franklin-macro.png` | `1.34 MB` |
| Current `Buildanta-WE-SCALE.html` | `7.26 MB` |

The live main-site ConsultHand renderer currently sources its Franklin/dollar texture from a remote Unsplash image. The WE SCALE standalone builder replaces that remote texture with `entry-franklin-macro.png`, so the generated file does not depend on a remote scene image. Google Fonts remain its only intended visual network dependency.

Google Fonts are still remote. The full site requests DM Mono, JetBrains Mono, Space Grotesk, Inter, and Instrument Serif; the WE SCALE standalone requests DM Mono and Instrument Serif and falls back locally if the network is unavailable.

Some legacy `<img>` elements are hidden by CSS but may still be requested by the browser. Removing stale markup is a future cleanup opportunity, not part of the active visual specification.

The repository README is materially older than the current implementation. It still describes the previous fabrication-machine/tagline setup, so use the active source, browser verification, and this handoff instead of the README for current scene decisions.

### Post-intro WebGL scene

After the cinematic handoff, the main site keeps a lightweight shader grid floor with a wireframe icosahedral core and nodes. Page scroll morphs/lifts the camera, pointer movement adds restrained parallax, and Lenis velocity can trigger a decaying glitch burst. Below roughly `760px`, the camera is pushed farther back. WebGL initialization errors are caught and the canvas is hidden so written content remains usable.

### Accessibility and failure behavior

- The Franklin overlay uses dialog semantics, makes sibling page content inert, traps focus while active, announces state through an `aria-live` region, and restores focus to the hero.
- Up-wheel, upward swipe, Page Up, or Home can cancel/reverse the gate; a restored gate accepts forward input again.
- `noscript` hides the gate and pinned intro and restores the main navigation/site.
- Main written content is not CSS-hidden before JavaScript, so a WebGL failure does not erase the page.
- Scrambled text retains an accessible label.

## 19. Local commands

Run from the project root:

```bash
npm install
npm run dev
```

The default Vite port is `5173`. To recreate the earlier port-4175 preview explicitly, run Vite with a `--port 4175` override and verify it before sharing the URL.

Production verification:

```bash
npm run build
npm run preview
```

Standalone/export commands:

```bash
npm run build:we-scale
```

Historical full-site exporter, currently unverified and not safe to share without repair:

```bash
npm run build:single
```

Outputs and current reliability:

- `npm run build:single` targets `standalone/buildanta-intro.html`, but the existing file is stale and predates the current WE SCALE/Franklin work. The builder also needs repair for current public `/assets/...` references before this output can be treated as a valid up-to-date single-file main site.
- `npm run build:we-scale` → `standalone/Buildanta-WE-SCALE.html` — current focused WE SCALE single-file build with its local runtime images embedded; Google Fonts remain external with fallbacks.

Additional project check:

```bash
npm run verify:props
```

## 20. Shareable WE SCALE file

The standalone experience is generated as:

```text
standalone/Buildanta-WE-SCALE.html
```

It is intended to be shared as one HTML file. JavaScript, CSS, and the local/runtime scene images are embedded; Google Fonts still load over the network and fall back when unavailable. Regenerate it after changes to WE SCALE source, styling, textures, or animation logic:

```bash
npm run build:we-scale
```

The standalone file is a focused WE SCALE deliverable; the complete production website remains the Vite application rooted at `index.html`.

The WE SCALE standalone uses a fixed stage with approximately `720vh` of scroll space. Native scroll is smoothed in its own animation loop at roughly `.085`; the copy enters around `.12–.24` and exits around `.60–.75`. The loop is cancelled and WebGL resources are disposed on `pagehide`.

Standalone-specific accessibility caveats:

- Unlike the main site, it still constructs ConsultHand under `prefers-reduced-motion`; CSS only freezes some conic/ticker motion.
- Its body currently uses `cursor: none` without a replacement cursor.
- These are current behaviors to fix before calling the focused file fully accessible.

## 21. Active versus legacy implementation

The project contains older experiments for iteration history. They should not be revived unless explicitly requested.

### Active

- Camera-led four-act intro
- WE SCALE heading
- Realistic green hand
- Wireframe Earth above the fingertips
- Dark green globe fume
- Seven-note orbit
- Six sequential note → paper bird → plant transformations
- Roots, branches, leaves, butterflies, and fireflies inside the globe
- One final Franklin note zoom
- Orange edge-following burn with restrained embers/fragments
- Automatic Franklin access protocol
- Reversible scroll handoff to the main hero

The full burn is currently exposed reliably by the WE SCALE standalone. In the main site, the gate threshold currently interrupts the renderer before the burn completes; this is an integration issue, not a missing burn implementation.

### Hidden or obsolete

- WE CONSULT as the final on-screen title
- Laptop portal sequence
- Consult film shots
- Editor/web/file scene overlays
- Capsule ENTER button
- Capsule tunnel, iris, or flash
- Smiling or morphing Franklin face
- Separate green ball beneath the plant
- Shadow card or polygon burn backdrop
- Large cartoon flame ribbons
- All notes transforming at the same time
- Globe/hand remaining visible behind the final close-up note

## 22. End-to-end acceptance checklist

### Forward scroll

- [ ] ACT 01, ACT 02, and ACT 03 appear in order.
- [ ] Camera transition into WE SCALE has no hard cut.
- [ ] ACT 04 reads WE SCALE and no legacy WE CONSULT editorial/portal layer appears.
- [ ] Globe rotates above the hand, not behind it.
- [ ] Hand is low/small enough to avoid fingertip collision.
- [ ] All notes establish their orbit before transformation begins.
- [ ] Only one note transforms at a time.
- [ ] Remaining notes keep orbiting while one bird lands.
- [ ] Plant growth follows landing, leaf by leaf.
- [ ] Roots attach directly to the globe's inner bottom surface.
- [ ] Butterflies, fireflies, branches, and darker fume remain subtle.
- [ ] Final note remains visible and zooms toward the camera.
- [ ] Hand and globe disappear before the final burn dominates.
- [ ] Orange burn hugs only the eroding note edge.
- [ ] No shadow card, rectangle, or cartoon ribbons appear.
- [ ] Franklin's printed face never changes.
- [ ] Gate appears automatically and dissolves to the hero.
- [ ] Main-site gate trigger occurs only after the final-note burn/exit; this is **currently not satisfied** because the gate starts around local `.882` and the burn starts around `.915`.
- [ ] Main page remains scrollable after the intro.

### Reverse scroll

- [ ] Hero returns to the Franklin gate cleanly.
- [ ] Burn reverses and reconstructs the note.
- [ ] Hand/globe reappear in the correct depth order.
- [ ] Plant/bird/note states reverse without a stuck frame.
- [ ] Earlier intro acts restore in the correct sequence.

### Technical

- [ ] `npm run build` passes.
- [ ] Local preview returns HTTP 200.
- [ ] No Vite error overlay.
- [ ] No console errors.
- [ ] Desktop and mobile compositions remain readable.
- [ ] DPR remains capped.
- [ ] Native/custom cursor behavior matches the final approved direction.
- [ ] Reduced-motion desktop retains a visible usable cursor.
- [ ] `hello@buildanta.com`, phone, and social links are confirmed before deployment.
- [ ] Standalone WE SCALE file is rebuilt after animation changes.

## 23. Deployment note

An existing production alias has historically been used:

```text
https://buildanta-solutions.vercel.app/
```

Do not assume that alias contains the latest local build. Verify a linked preview first, then promote that verified deployment to production. Avoid creating an unrelated Vercel project when updating the existing alias.

---

**Document rule:** When the implementation and this handoff disagree, treat the active, verified local preview as the immediate truth, then update both the implementation and this document together.
