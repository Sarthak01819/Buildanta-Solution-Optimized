# FULL PROJECT CONTEXT & TECHNICAL SPECIFICATIONS
**Buildanta Solutions x AFTERIMAGE — 3D Cinematic Interactive Experience**

---

## 1. Project Overview & Vision

**Buildanta Solutions / AFTERIMAGE** is a state-of-the-art, 3D WebGL interactive landing page engineered with scroll-driven storytelling, 60+ FPS matrix caching, custom shaders, and editorial typography.

The site is structured into a seamless **4-Act scroll progression**:
1. **Act 01: "Your idea"** — Concept inception, liquid glass drop, and 3D glass corridor.
2. **Act 02: "We code"** — **Ra.One x Matrix 3D Binary Voxel Earth & Core Engine**.
3. **Act 03: "We market"** — **AFTERIMAGE 3D Growth Marketing Engine**.
4. **Act 04: "We consult"** — Connected growth systems, product roster, and booking CTA.

---

## 2. Complete 4-Act Architecture

### Act 01: "Your Idea" (Progress `0.000` -> `0.244`)
- **Visual Theme**: Warm Ember / Amber Gold (`#ffab79`, `#bd6741`).
- **Elements**:
  - Liquid glass teardrop (`.intro__ideaDrop`) falling along bezier arcs.
  - Interactive 3D glass corridor (`src/gl/Corridor.js`) with glass frame lines and soft paper fog.
  - Drifting station plane with subtle 3D parallax.
  - Amber/gold liquid droplets (`.intro__catchDrop`) embarking on the transition journey toward Act 02.

---

### Act 02: "We Code" — Ra.One x Matrix Voxel Earth (`src/gl/CodeBuild.js`) (Progress `0.244` -> `0.480`)
- **Visual Theme**: Deep Terminal / Matrix Green (`#000000` background, `#00ff66` neon emissive).
- **Core Features**:
  - **3D Micro-Cube Earth Voxel Grid**: Spaced micro-cubes (`InstancedMesh`) forming the continental landmasses with high contrast (`emissiveIntensity: 1.35`).
  - **Live Binary Matrix Streams**: 2048x2048 HD binary code texture (`0` & `1` waterfall animation) mapped with 16x anisotropic filtering.
  - **Quantum Core Engine Room**: Inner core sphere (`SphereGeometry(3.8)`), wireframe shell (`SphereGeometry(4.2)`), outer BlueYard atmosphere shell (`SphereGeometry(16.2)`), Saturn holographic orbit rings, and 700 revolving satellite data particles.
  - **Liquid Droplet Collision & Big Bang Explosion Boom**:
    - 3 amber gold droplets fly along curved paths and **collide violently at a single focal point** on the base at `progress = 0.264`.
    - Collision impact triggers a white-hot **Big Bang Supernova Boom** (`.intro__bigBang`), igniting the block-by-block micro-matter Voxel Globe assembly!
  - **Pre-Collision Hidden State**: Act 02 3D scene elements remain **100% invisible** (`p < 0.258`) so the globe does not peek in the background during Act 01.
  - **Scroll-Driven Camera Fly-Through**: Cubic `power2.inOut` camera landing easing (`Z = 52.0` -> `Z = 0.2`).
  - **60+ FPS Matrix Caching**: Instance matrices are calculated only during the assembly window (`0.264 <= p <= 0.395`). When assembled, rotation occurs in GPU space at locked 60 FPS.

---

### Act 03: "We Market" — AFTERIMAGE 3D Growth Marketing Engine (`src/gl/MarketGrowth.js`) (Progress `0.480` -> `0.720`)
- **Visual Theme**: Dark Space Palette (`#030712` near-black, `#fcfaf7` warm ivory, `#00f0ff` electric blue, `#a855f7` ultraviolet, `#ff4d4d` coral red).
- **Core Features**:
  - **Dark Space Environment**: Perspective floor grid (`LineSegments`), 800-particle starfield, and dynamic point light rig.
  - **Central Orbit Portal Zoom**: Scrolling into Act 03 zooms camera into the central orbit portal, dissolving the planet surface to reveal a glowing wireframe internal tunnel (`CylinderGeometry`).
  - **Curved 7-Panel 3D Film Camera Reel (~860px / 140vw Travel)**:
    - 3D curved camera reel glides horizontally across the viewport featuring top & bottom film sprocket perforations (`CanvasTexture`).
    - 7 Capability Panels:
      1. **SEO Authority** (`+420% Organic Traffic`)
      2. **Paid Acquisition** (`$14M+ Ad Spend Managed`)
      3. **Sales Systems** (`3.8x Conversion Rate`)
      4. **CRO & Creative** (`+185% ROAS Uplift`)
      5. **Lifecycle Growth** (`92% Net Revenue Retention`)
      6. **Brand Momentum** (`8.5M Impressions/mo`)
      7. **Growth Analytics** (`100% Data Precision`)
  - **Film-Inspired Case-Study Cards**: 3D depth-rotated cards for **PulsePay** (+340% ARR), **Northline** ($8.2M Revenue), **Relay CRM** (4.2x Pipeline), and **Morrow** (Viral Flywheel).

---

### Act 04: "We Consult" (Progress `0.720` -> `1.000`)
- **Visual Theme**: Forest / Gold (`#041c10`, `#d4af37`).
- **Core Features**:
  - Connected growth systems presentation.
  - Deployed systems roster (**Dhando**, **Tap**, etc.).
  - Conversion-focused booking call CTA section.

---

## 3. Typography & Styling System

- **Display Typography**: Google Fonts `Instrument Serif` (`font-family: 'Instrument Serif', Georgia, serif`).
- **Interface & HUD Typography**: Google Fonts `DM Mono` (`font-family: 'DM Mono', monospace`).
- **Color Palette**:
  - Near-Black: `#030712` / `#000000`
  - Warm Ivory: `#fcfaf7`
  - Electric Blue: `#00f0ff`
  - Ultraviolet: `#a855f7`
  - Coral Red: `#ff4d4d`
  - Matrix Green: `#00ff66`
  - Amber Gold: `#ffab79` / `#bd6741`

---

## 4. Performance & Engineering Optimizations

1. **Zero Per-Frame Allocations**: All vectors (`Vector3`), matrices (`Matrix4`), quaternions (`Quaternion`), and color objects are pre-allocated outside update loops to prevent Garbage Collection pauses.
2. **Adaptive Particle Reduction**: Real-time FPS sampling measures frame duration. If frame time exceeds 18.5ms (<55 FPS), particle draw ranges automatically decrease (800 -> 400).
3. **Device Pixel Ratio (DPR) Capping**: `devicePixelRatio` is capped at `1.0–1.25` to protect GPU memory bandwidth.
4. **No Heavy CSS Filters**: Zero full-screen `backdrop-filter: blur()` or `mix-blend-mode` overhead; depth is achieved via WebGL lighting and emissive textures.
5. **Smooth Pointer Parallax**: Pointer movement uses `0.05` dampening to prevent text jitter.
6. **Accessibility**: Full support for `prefers-reduced-motion`.

---

## 5. File Map & Directory Structure

```
buildanta-solutions-final/
├── index.html                    # Main HTML entry point & font declarations
├── PROJECT-CONTEXT.md            # Full project context & specifications
├── package.json                  # Vite build scripts & dependencies
├── src/
│   ├── main.js                   # Application bootstrap & intro initialization
│   ├── config.js                 # Act definitions, branding copy, & product data
│   ├── modules/
│   │   ├── intro.js              # ScrollTrigger timeline & droplet trajectory controller
│   │   └── sound.js              # Ambient Web Audio synthesizer
│   ├── gl/
│   │   ├── Corridor.js           # 3D glass corridor renderer
│   │   ├── CodeBuild.js          # Ra.One x Matrix 3D Binary Voxel Earth & Core Engine
│   │   ├── MarketGrowth.js       # AFTERIMAGE 3D Growth Marketing Engine
│   │   ├── Orb.js                # Opening 3D energy orb renderer
│   │   └── Scene.js              # Background particle renderer
│   └── styles/
│       ├── main.css              # Main visual design & theme variables
│       └── objects.css           # 3D floating object assets styling
├── scripts/
│   └── build-single.mjs          # Single-file HTML bundler script
└── standalone/
    └── buildanta-intro.html      # Self-contained single-file HTML (1580 KB)
```

---

## 6. How to Run & Build

### Running Dev Server
```bash
npx vite --port 5173 --host 127.0.0.1
```
Open `http://127.0.0.1:5173/` in browser.

### Building Production Dist & Single-File Standalone
```bash
npm run build         # Compiles dist/ bundle
npm run build:single  # Bundles standalone/buildanta-intro.html
```
