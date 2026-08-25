# CONTEXT.md — Buildanta Solutions flagship site

> **Read this first.** It is the merge record, the architecture map, and the
> verified state of this folder as of **2026-08-21**.
>
> Hard rules live in [`CLAUDE.md`](CLAUDE.md). The decision log (D-001…D-040)
> lives in [`ARCHITECTURE.md`](ARCHITECTURE.md). This file tells you what is
> actually here, what actually runs, and what is actually broken.

---

## 0. TL;DR

| | |
|---|---|
| **What** | Scroll-driven cinematic WebGL site for Buildanta Solutions |
| **Stack** | Vite 7 · Three.js 0.180 · GSAP 3.13 (ScrollTrigger only) · Lenis 1.3 |
| **This folder** | The single canonical project — merged 2026-08-21 from two sibling folders |
| **Source files** | 310 (excluding `node_modules/`, `dist/`) + this file |
| **Build** | ✅ green — `npm run build` → `dist/`, 140 files |
| **Runtime** | ✅ green — 0 console errors, 0 failed requests, 9 live canvases |
| **Known red** | 3 pre-existing issues — see §9. None caused by the merge. |

---

## 1. The merge — what happened and how it was verified

### 1.1 Inputs

Two sibling folders sat beside this one, both timestamped `20260821-1438`:

| Folder | Files | Size | What it actually was |
|---|---:|---:|---|
| `buildanta-site-20260821-1438/buildanta-site` | **310** | 66 MB | The **complete** project |
| `buildanta-site-source-20260821-1438/buildanta-site` | **160** | 20 MB | A **code-only stripped export** of the same project |

The `-source-` name is misleading — it is **not** the authoritative source. It is
a strict subset with `public/`, `src/assets/` and `art-source/` removed.

### 1.2 The verification that decided the merge

Every file in both trees was MD5-hashed and compared:

```
A files: 310   B files: 160
Files only in B (that A lacks) ............ 0
Files only in A .......................... 150
Shared files whose contents differ ......... 0
```

**B is a byte-identical strict subset of A.** There were **zero conflicts** and
**zero merge decisions to make** — the union of the two folders is exactly A.
The merged tree was then re-hashed and diffed against A: identical, 310/310.
Every one of B's 160 files is present and byte-identical here.

The 150 files unique to A are all assets:

| Directory | Files | What |
|---|---:|---|
| `public/world/art/` | 58 | World grid media (15 `.mp4`, 43 `.jpg`) |
| `public/assets/` + subdirs | 34 | Consult stills, reel plates, Draco decoder, room, endurance GLBs, `finale-score.mp3` |
| `src/assets/intro/` | 41 | 4 act stills + `code-build.mp4` + 36 prop WebPs |
| `art-source/` | 14 | Working masters incl. the projector glTF |
| `src/assets/` | 1 | `market-camera.glb` (3.8 MB) |
| `public/` root | 2 | Graded camera PNG, consult background |

### 1.3 Proof the merge direction was right

Running the project's own verifier in each tree:

| Tree | `npm run verify:props` |
|---|---|
| Stripped copy (B) | ❌ 9+ **missing asset** errors + 1 tagline error |
| Complete copy (A) | ❌ 1 tagline error only |
| **This merged folder** | ❌ **1 tagline error only** — identical to A |

The merge eliminated every asset failure and introduced nothing. The single
remaining failure is a pre-existing stale assertion (§9.1).

### 1.4 Provenance note

Neither original folder is a git repo, so **there is no history to preserve** —
nothing was lost by copying. Both originals were left untouched as a fallback.

---

## 2. Hard rules (from `CLAUDE.md` — do not violate)

1. **The approved design is FROZEN** (vault rule UX4). No redesigns or
   "leveling up" of approved visuals. Ambiguity resolves toward preserving
   what Yash approved.
2. **Never move a scroll act's beat boundaries without asking Yash.** A silent
   ACT 03 retime ate the WE SCALE act *twice* — and its own tests passed both
   times. See §5.4.
3. **Element ids must be page-scoped.** No generic ids (`#canvas`, `#overlay`)
   in shared scope — the world's `#gl` collided with the site's during the port.
4. **`content/` is GENERATED — never hand-edit.** It comes from the CMS.
5. **`src/world/` is a PORT, not a fork.** Fix bugs upstream in
   `~/claude code/unseen-world` (137-check suite), then re-port.
6. **Never copy files in from `~/claude code/buildanta-site-world`** — that copy
   has no shared history and several files are older.
7. **`public/world/art/` is committed on purpose.** Do not add `public/art/`.

---

## 3. Quick start

```bash
npm install
npm run dev
```

⚠️ **Port disagreement — know this before you debug.** Four sources give three
different answers:

| Source | Port |
|---|---|
| `vite.config.js:4`, `README.md`, `.claude/launch.json` (`buildanta`) | **5173** ← what actually runs |
| `CLAUDE.md:3`, `ARCHITECTURE.md:12`, `tools/lan-proxy.py:7` | 5280 (stale) |
| `.claude/launch.json` (`buildanta-review`) | 5303 `--strictPort` |
| `tools/verify-*.cjs` | 5303, except `verify-room` / `verify-main-endurance` → 5297 |

Vite silently walks *up* the port range when one is taken, so a preview aimed at
5173 can show another session's build. Use the `buildanta-review` entry
(`--strictPort`) when you need certainty.

**Useful URL flags:** `?finale=0` boots the ordinary blue site · `?finale=1`
forces the finale · `?diag=1` mounts the diagnostics overlay.

---

## 4. Pages — only one is in the build

`vite.config.js` has **no `rollupOptions.input`**, so Vite uses its default
single entry, `index.html`. The other three root pages are **orphaned from
`npm run build`** — they work in dev, but never reach `dist/`.

| Page | What it is | Entry script | In `dist/`? |
|---|---|---|---|
| `index.html` (28 KB) | **The real site.** Scroll film, black hole, Endurance, world host | `/src/main.js` | ✅ yes |
| `dashboard.html` (71 KB) | Generated static report — architecture map + decision log D-001…D-040 | inline filter only | ❌ no |
| `we-scale.html` (1.8 KB) | Standalone WE SCALE share page | `/src/we-scale-standalone.js` | ❌ no — built by `build:we-scale` |
| `acceptance.html` (1.1 KB) | Dev-only camera-grading harness at 785×1511, `?yaw=` | inline module | ❌ no (says so itself) |

⚠️ `dashboard.html` carries a "generated — never edit by hand" banner, but its
generator (`gen-dashboard.mjs`) lives **outside this repo**. There is no local
way to regenerate it.

---

## 5. The animation system

This is the part that must not be broken. Everything is driven from **one**
pinned, scrubbed ScrollTrigger; there are no stray rAF loops.

### 5.1 Boot order (`src/main.js`)

Module eval, before anything runs:

1. `gsap.registerPlugin(ScrollTrigger)` — the **only** plugin registered anywhere
2. `FINALE_DEFAULT = true`; the `?finale` mode is decided **at boot only**
   (finale relocates `#contact` into `<body>`)
3. `history.scrollRestoration = "manual"`
4. `ScrollTrigger.clearScrollMemory("manual")` — **must** come after
   `registerPlugin`. `ScrollTrigger.config({scrollRestoration})` silently
   ignores the value: it looks right and does nothing (`main.js:49-69`).
5. `wireWorld()` IIFE runs **before** `boot()`
6. `boot()`

`boot()` then runs: `hydrate()` → `initReveals()` → `initGL()` → `initScroll()` →
cursor/magnetic/HUD → contact room → finale room → progress bar →
`fonts.ready → ScrollTrigger.refresh()` → **preloader** → `createIntro()` →
warm-up → `createEntryGate()`.

- The preloader is created **before** the intro so it covers the screen while
  scenes build. It gates *visibility*, not logic: 2000 ms minimum, 4200 ms hard
  cap. Nothing can trap the visitor.
- **Phones skip `intro.warm()` entirely** (`matchMedia("(pointer: coarse)")`) —
  warming crashed them.
- `liveIntro` is a module-scope bridge because `window.__buildanta` is DEV-only
  and stripped from the build; without it `getBeat()` was always null in
  production and the world fall hard-cut.

### 5.2 Lenis (`src/main.js:177-205`)

```js
new Lenis({ lerp: 0.075, wheelMultiplier: 1, smoothWheel: true, autoRaf: false })
lenis.on("scroll", () => ScrollTrigger.update())
gsap.ticker.add((time) => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)
```

`autoRaf: false` is deliberate — **GSAP drives the clock; never run two rAF
loops.** There is no `ScrollTrigger.scrollerProxy`: Lenis drives native scroll,
so ScrollTrigger reads `window` normally. Exposed as `window.__lenis` because
the skip button, service sheet, portal and entry gate all need `stop()`/`start()`.

### 5.3 The one pinned trigger (`src/modules/intro.js:1793-1804`)

```js
ScrollTrigger.create({
  trigger: root, start: "top top",
  end: () => "+=" + Math.round(innerHeight * totalScrollLength),
  pin: true, pinSpacing: true, scrub: true, anticipatePin: 1,
  invalidateOnRefresh: true,
  onUpdate: (self) => applyRaw(self.progress),
  onRefresh: (self) => applyRaw(self.progress),
});
```

This is the **only** pin and the **only** scrub on the site. Every other
ScrollTrigger (8 of them) is a non-pinned, `once: true` reveal or a
`start:0 / end:"max"` readout.

### 5.4 ⚠️ Beat boundaries — the fragile part

The master timeline maps scroll to a normalised progress `p` through **segments**.
`stretch` adds viewport-heights to a segment **without moving any `p` value**.

```
perAct = 1.1 (reduced-motion: 0.6);  baseScrollLength = 4.4vh
SEGMENTS = [
  [0,        0.425,   0    ],  // 1.870vh
  [0.425,    0.684,   3.0  ],  // 4.140vh   MARKET
  [0.684,    0.768,   1.4  ],  // 1.770vh   HANDOVER
  [0.768,    FILM_P,  1.19 ],  // 2.026vh   CONSULT
  [FILM_P,   FILM_P,  2.0  ],  // 2.000vh   ← HOLD, p FROZEN
  [FILM_P,   1,       0.21 ],  // 0.395vh
]
FILM_P ≈ 0.95795   introScrollLength ≈ 12.20vh   totalScrollLength ≈ 13.20vh
introRawEnd = beatRawStart ≈ 0.92424
```

> From `intro.js:1525-1529`, verbatim in spirit: the beat boundaries — **0.684
> approach, 0.726 enter/blackout, 0.768 sphere** — stay exactly where they are.
> `stretch` is the safe lever. *Moving those p values is what silently ate WE
> SCALE twice in one evening.*

Use `intro.rawForP(target)` (`intro.js:1931-1950`) — the inverse mapper exists so
tests never hardcode raw scroll values.

**Two windows that must stay equal:** `--hole` (`intro.js:837`) and
`consultReveal` (`intro.js:1284`) are the *same circle* seen from the market side
and the consult side, both `smoothstep((p - 0.744) / 0.044)`. Moving one without
the other opens a hole onto a still-clipped world.

**Order matters:** the shutter must finish opening **before** the blackout rises
(.726–.738), or the mechanism opens invisibly behind black.

### 5.5 Act map

Act text is generated from `INTRO.steps` (`src/config.js:114-181`, n = 4).
Station peaks = `[0.125, 0.375, 0.625, 0.875]`.

#### ACT 01 — "Your idea" (`t-ember`) · p 0 → ~0.244
Renderer: **orb-hero GPGPU** (`src/gl/orb-hero/`) on `.intro__gl`.
- Orb act progress `p / 0.244`; orb fades `1 - smoothstep((p-0.2)/0.045)`
- Idea drop falls `0.018 → 0.082`; impact + core flash ~`0.070`
- Three catch droplets start `0.140 + i*0.010`, **all converge and collide at p = 0.264**
- **BIG BANG** in `0.258/0.018`, out `0.276/0.045`, scale `0.1 + bangIn*2.8`

#### ACT 02 — "We code" (`t-terminal`) · p ~0.244 → ~0.505
Renderer: **`src/gl/CodeBuild.js`**, drawn as a second transparent pass on the
corridor framebuffer.
- enter `0.258→0.272` · **globalBuild `0.264 → 0.380`** · cubesOut `0.395→0.435`
  · exit `0.495→0.520`
- `lerpedProgress += (p - lerped) * 0.18` smoothing
- Corridor renders only while `progress < 0.505`
- Text reveal is special-cased for `i === 1` (`assemblyReveal`)

#### ACT 03 — "Attention into *measurable* growth" (`t-indigo`) · p 0.425 → 0.752
**The `.step` text for this act is force-hidden** (`intro.js:1443-1446`) — Act 03
is entirely DOM + the 3D camera. Renderers: **`marketCamera.js`** (GLB cine
camera) + **`projector/`** + the DOM film strip.

| Beat | Window |
|---|---|
| act in | `(p-0.425)/0.070` |
| house lights down | `(p-0.392)/0.052` |
| hero copy | `(p-0.472)/0.028` |
| camera mounts | `p > 0.40`; fades in `(p-0.543)/0.010` |
| camera yaw unwind | `(p-0.545)/0.055` → done .600 |
| camera drive-in | `(p-0.545)/0.075`, cubic ease-out → lands **.620** |
| film emerge | `.584 → .646` |
| spools spin up | `(p-0.626)/0.030` |
| film transport | `.628 → .706`, with a **detent** curve |
| **APPROACH** | `.684 → .716` |
| **HOLD** | `.716 → .726` |
| iris/shutter opens | `.710 → .732` |
| **ENTER** | `.726 → .752` |
| blackout | full by **.738** |
| act out | `1 - (p-0.752)/0.008` |
| **SPHERE / `--hole`** | **`.744 → .788`** |
| camera scale | `1 + approach*3.2 + enter*8.8` → 1× → 4.2× → **13×** |
| spool : shutter | `SPOOL_TURNS_PER_PLATE = 1.45`, locked **1:1** |

#### ACT 04 — "We consult" / WE SCALE (`t-forest`) · p 0.768 → ~0.992
Renderer: **`ConsultHand.js`** (+ `consultNetwork.js`, `consultInside.js`).
Local clock `consultLocal = clamp((p - 0.768) / 0.224)`.
- handBg, intro in/out, hand in/press/out, four updates at `.20/.36/.52/.68`
- dollarFocus `.70/.16` · **dollarBurn** `(p-0.935)/0.055` — the Franklin note
  curls, scorches, burns to embers · dollarMorph · exit
- plant / root / stem at `.388 / .40 / .41`

#### EPILOGUE FILM — a zero-`p` hold inside Act 04
`FILM_P ≈ 0.95795`, `filmStretch = 2.0`. For **two full viewport-heights the
progress `p` stands still** while `filmLocal` runs 0→1. Eight film stops
(`s1…s8`) plus idea + CTA.

⚠️ Two writers target the same `--film-*` custom properties. The later write at
`intro.js:1396-1438` wins; the original writer at `:1373-1393` still computes
zeros every frame. Same element + later write = this one wins.

#### ACT 05 (implicit) — the PORTAL wall + Gargantua beat
- Portal engages at raw `≈ 0.9137`, 1500 ms cooldown; module is **lazy-imported**
- ENTER → `ridePortal()`: `music.enter()`, then
  `lenis.scrollTo(rideRaw, { duration: 3.0, force: true, lock: true, easing: t => t })`
  — **linear on purpose**; teardown at 1120 ms
- Beat map: `0.00–0.35` emergence · `0.35–0.75` presence · `0.75–1.00` swallow
- **`FINALE_BEAT = 0.58`** hard-caps `beatLocal`, so the swallow never runs.
  **The site ends on the living black hole.** Because `--site-in` needs
  `beat.local > 0.84`, the blue main site below is **unreachable in default
  finale mode — by design.**

### 5.6 Named effects

| Effect | What it does | Where |
|---|---|---|
| scramble | terminal-decode of `[data-scramble]` | `scramble.js` |
| splitText | per-char waves, **word-wrapped so words never break** (D-010) | `splitText.js` |
| orb hero | GPGPU particle orb: arrival → collapse → shell opens → re-forms | `gl/orb-hero/` |
| code build | native WebGL grid/glass/light assembly | `gl/CodeBuild.js` |
| corridor | 3D tunnel of glass frames, fog lerped between act palettes | `gl/Corridor.js` |
| market camera | GLB two-reel cine camera, 9-blade iris, 13× push | `gl/marketCamera.js` |
| projector | real 3D projector model, lazily mounted | `gl/projector/` ⚠️ §9.2 |
| film reel | 9 service plates, detent transport, DOM caption swap | `intro.js` |
| blackout → sphere | true black .726–.738, then green clip-circle blooms .744–.788 | `intro.js` |
| consult hand | mint globe, palm, plant funded by six money-origami notes | `gl/ConsultHand.js` |
| blackhole portal | starfield wall, cursor-hole, hold-to-collapse ENTER door | `effects/blackhole-portal/` |
| Gargantua beat | lensed black hole, live churn, never swallows | `gl/blackhole/` |
| endurance | ship orbiting Gargantua, **14 s flight** into the sitting module | `modules/finaleRoom.js`, `gl/endurance/` |
| world fall | camera dives through the horizon into the Projects world | `modules/worldFall.js` |
| cursor | two-layer lerped cursor (0.18 s dot, 0.55 s ring), magnetic 34%/18% | `interactions.js` |

### 5.7 Audio

- **`sound.js` is a disabled stub.** `createSound()` returns an inert object with
  the full original API; the real synth (`createSoundRetired`) is unexported dead
  code. Removed by Yash's call, 15 Aug 2026 (D-020). `sound.step()` and the eq
  bars run against zeros.
- **`music.js` is the only real audio.** `/assets/finale-score.mp3` — nothing is
  fetched until ENTER. Web Audio `AudioBufferSourceNode` with `loop = true`
  (not `<audio loop>`, which gaps at the wrap) → gain → lowpass.
  Triggered by `music.enter()` inside `ridePortal()`: the ENTER click is both the
  required user gesture *and* the dramatic beat. Scenes: `falling` 0.78/20 kHz ·
  `world` 0.34/700 Hz (muffled) · `endurance` 0.58/4.2 kHz · `finale` 0.62/20 kHz.

---

## 6. Assets — full wiring map

**141 distinct asset references were extracted from code and resolved.**
139 resolve, 1 is a comment false-positive, **1 is genuinely missing** (§9.2).

| Directory | Files | Purpose |
|---|---:|---|
| `public/world/art/` | 58 | World grid media — `placeholder-01..15.mp4`, `16..58.jpg`. Driven by `content/world.json`. Complete, no gaps. |
| `public/assets/` | 18 | Consult stills + GL textures, `starfield.jpg` / `-1k.jpg`, `entry-franklin-macro.png`, `cash-bundle-premium.webp`, `finale-score.mp3` |
| `public/assets/reel/` | 9 | Act-03 service plates. Numbered 01, 03–10 — **the `02-` gap is intentional**; nothing requests it. |
| `public/assets/draco/` | 3 | Draco decoder trio for the Endurance GLB |
| `public/assets/room/` | 2 | Finale contact-room backplate (+ mobile) |
| `public/assets/endurance/` | 2 | `endurance-hifi.glb` + `-lite.glb` LOD pair |
| `src/assets/` | 1 | **`market-camera.glb`** (3,819,000 B) |
| `src/assets/intro/` | 5 | 4 act stills + `code-build.mp4` |
| `src/assets/intro/props/{idea,code,market,consult}/` | 36 | 9 props per act |
| `art-source/` | 14 | Working masters (incl. `projector/`) — **dev-only, never shipped** |
| `source-assets/prop-sheets/` | 4 | The 3×3 chroma sheets the 36 props were cut from |

### Why `market-camera.glb` lives in `src/`, not `public/`

`marketCamera.js:46-52` **explicitly forbids** moving it. Cloudflare Pages serves
`/assets/*` immutable for a year, so a fixed filename would cache stale for a
full day. It is imported as a fingerprinted Vite asset:

```js
import MODEL from "../assets/market-camera.glb?url";
```

⚠️ Do not confuse it with `tools/camera-match/camera.glb` (1,019,320 B) — that is
the pose-matching rig's model, a different file.

### Dynamically constructed paths (all verified sound)

| Pattern | Target | Status |
|---|---|---|
| `"/assets/reel/" + svc.art` | `public/assets/reel/` | ✅ all 9 resolve |
| `draco.setDecoderPath("/assets/draco/")` | 3 files appended at runtime | ✅ |
| `media.src = item.file` | `public/world/art/` | ✅ all 58 resolve 1:1 |
| `` `src/assets/intro/props/${act}/${kind}.webp` `` | 4 acts × 9 kinds | ✅ all 36 resolve |
| `handURL(name)` → `canvas.toDataURL()` | — | procedural, not a file |

Fonts are loaded from the Google Fonts CDN (`index.html:14`) — there are no local
font files, so there is nothing to lose. No favicon is referenced or present.

---

## 7. Build, scripts and tooling

### npm scripts

| Script | Does | Status |
|---|---|---|
| `dev` | `vite --configLoader runner` | ✅ |
| `build` | `vite build` → `dist/` from `index.html` only; `three` + `gsap` split into own chunks | ✅ 9.5 s, 140 files |
| `preview` | serves `dist/` | ✅ |
| `build:single` | inlines everything → `standalone/buildanta-intro.html` | ❌ **fails** — §9.3 |
| `build:we-scale` | inlines `we-scale.html` → `standalone/Buildanta-WE-SCALE.html` | ✅ 7.28 MB |
| `verify:props` | reads-only, checks all 36 props + CSS/motion/config wiring | ❌ **1 stale check** — §9.1 |

`--configLoader runner` makes Vite load the config through its module runner
instead of a bundled temp file — deterministic in restricted desktop workspaces,
same rationale as `optimizeDeps.noDiscovery`.

⚠️ **`build:we-scale` output drifts.** Re-running it produced a 7,629,900-byte
file where the committed one is 7,613,973 bytes. The committed artifact is
checked into the tree (`standalone/` is *not* gitignored) and can silently fall
behind its sources. It is also **visually different from production by design** —
the builder swaps the live remote Unsplash Franklin photo for the local
`entry-franklin-macro.png` so the dollar sequence works offline.

### `tools/` — ⚠️ effectively unrunnable on this machine

| Script | Needs |
|---|---|
| `bake-camera-grade.cjs`, `png.cjs`, `tag-srgb.cjs`, `scope-world-css.cjs` | node only ✅ |
| `verify-journey / portal / reverse / sync / room / main-endurance`, `shoot-market`, `visual-baseline` | node + **Playwright** + a running dev server |
| `camera-match/build_camera.py` | **Blender** (`bpy`) |
| `camera-match/match.mjs` | node + Playwright + `python3` + `lsof`/`xargs` (POSIX only) |
| `deploy-preview.sh`, `publish.sh`, `tunnel-keeper.sh` | sh + wrangler / python3 |
| `lan-proxy.py` | python3 |

**Playwright is not in `package.json` at all.** All eight verify scripts fall
back to a hardcoded absolute path from a sibling repo:

```js
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/buildanta/claude code/buildanta-showcase/node_modules/playwright')); }
```

On this Windows checkout there is no local Playwright and no `/Users/buildanta/`,
so **every verify tool throws**. Two further portability bugs:
`verify-reverse.cjs:7` requires its own sibling by absolute path where every
other file uses `require('./png.cjs')`; `match.mjs` shells out to `lsof`.

### Three copies of the same inliner

`scripts/build-single.mjs`, `scripts/build-we-scale-standalone.mjs` and
`experiments/mall-photo-3d/build.mjs` are three hand-maintained copies of the
same "inline everything into one HTML" logic, with three slightly different
self-containment guard lists.

---

## 8. Content, and the `src/world/` port

### `content/` — generated elsewhere, committed here

- **`content/site.json`** — flat object, 14 namespaced keys: 9 `service.*`
  + 5 `section.*`. Imported at **build time** by `src/modules/services.js`,
  merged per-plate over a hardcoded `FALLBACK` array (D-007). If the CMS has
  never published, the reel falls back and the site looks unchanged.
  ⚠️ The five `section.*` keys are read by **nothing**.
- **`content/world.json`** — array of 58 items. Imported by
  `src/world/world-app.js`, which remaps `/art/… → /world/art/…` so the world's
  media cannot collide with the site's. **No fallback** — this file is committed
  so a fresh clone works (D-008).

Both are `import`ed, never `fetch`ed. Their generator, `build-content.cjs`, lives
in the CMS project — **nothing in this repo can regenerate them.** That is
precisely why hand-editing is dangerous: it works until the next publish.

### `src/world/` — a port with two entry points

- **`world-app.js` is the real module** — exports the `createWorld({ host,
  mountRoot })` factory. The whole point of the port was converting a top-level
  script that assumed it *was* the page into something parameterised by host.
- **`main.js` (11 lines) is the standalone entry and is dormant here** — nothing
  references it. It exists so the port stays byte-compatible with upstream,
  where the 137-check suite runs against it.
- Mounted from `src/main.js:594-601` inside `createWorldFall`'s `onMountWorld`:
  unhide host → `injectWorldMarkup(host)` → `createWorld(...)` → `setPaused(true)`
  until the veil lifts. Host is `<div id="world-host" hidden>` (`index.html:363`).
- `world-markup.js` supplies the six required elements as a string. `#world-gl`
  is **not** `#gl` — two stylesheets matching both canvases meant the world hid
  the site's scene. That incident is the origin of the page-scoped-ids rule.
- `project-page.js` answers `#/work/<slug>` **hash** routes (not paths) so the
  single-file preview survives being opened from disk, and picks `<video>` vs
  `<img>` by `item.type`, **not** by extension, because the inliner rewrites
  extensions away.

⚠️ **`style.scoped.css` is generated** from `style.css` by
`tools/scope-world-css.cjs`, which rewrites exactly four global rules to
`.world-host`. **Only the scoped file is ever imported.** The generator is
manual and wired into **no npm script and no CI**, so editing `style.css` alone
silently does nothing.

### Dev-only directories

`docs/` (4 image-generation prompt packs, not developer docs) ·
`experiments/mall-photo-3d/` (self-contained side experiment; its build writes
**outside the repo** to `../../outputs/`) · `source-assets/` (prop sheet inputs to
`scripts/extract-intro-props.py`, needs Python + `Pillow==12.2.0`) ·
`art-source/` (raw masters). None are shipped — only `public/` is copied to `dist/`.

---

## 9. Known-red — verified, all pre-existing

**None of these were caused by the merge.** Each was confirmed present in the
complete original before the merge.

### 9.1 🔴 `verify:props` fails on a stale assertion

```
config: tagline changed or missing: We market
```

`scripts/verify-intro-props.mjs:100-102` asserts the four approved taglines
`"Your idea" / "We code" / "We market" / "We consult"` are literally present in
`src/config.js`. But Act 03's label was **deliberately rewritten** to:

```js
label: "Attention into <em class='coral-italic'>measurable</em> growth."
```

**The script is stale, not the site.** All 36 props, all CSS wiring and all
motion data pass. Fixing this means updating the verifier's expectation — but
that touches approved copy assertions, so it is left for Yash to confirm.

### 9.2 🔴 The Act-03 projector model is missing from `public/`

`src/gl/projector/index.js:37` requests:

```js
const MODEL = "/assets/projector/filmstrip_projector_8mm_1k.gltf";
```

`public/assets/projector/` **does not exist.** This is live, shipped code —
`intro.js:163` mounts it and drives it at `:873-874, 1824, 1911, 1998, 2056`,
and the string survives into the production bundle.

It **fails soft**: `intro.js:165` catches, logs `[intro] projector unavailable:`
and leaves `projector = null`, so Act 03 renders without the machine rather than
crashing. That is exactly the class of silent breakage that hid the camera bug.

**The model is not lost — it is in the wrong tree.** All five required files sit
in `art-source/projector/`:

```
filmstrip_projector_8mm_1k.gltf
filmstrip_projector_8mm.bin
textures/filmstrip_projector_8mm_{diff,arm,nor_gl}_1k.jpg
```

The `.gltf` declares its `.bin` and textures by relative `uri`, so the folder
must move **as a unit**, preserving `textures/`.

> ⚠️ **Not fixed here on purpose.** Copying these into `public/assets/projector/`
> would make a currently-absent machine appear in Act 03 — a visible change to an
> approved act, which the design freeze (UX4) reserves for Yash. Confirmed absent
> in **both** original folders, so this predates the merge. Ask before enabling.

### 9.3 🔴 `build:single` fails its own guard

The self-containment guard at `build-single.mjs:73-83` throws:

```
build-single: file self-contained nahi hai — ye references bache hain:
  asset path: src="/assets/   × 9
```

Nine `/assets/` references survive inlining — the `public/`-dir reel plates,
which the inliner does not base64. The guard is **working as designed**: a broken
file is never written. But it means `standalone/buildanta-intro.html` **cannot
currently be produced**, even though `README.md` documents it as a deliverable
and `PROJECT-CONTEXT.md` claims a 1580 KB file exists. It does not.

⚠️ Because the script throws *before* its cleanup step, a failed run leaves a
**`.single-tmp/` directory (97 files)** behind. `.gitignore` does not list it.
Delete it after any failed run.

(`build:we-scale` succeeds because it explicitly base64s its four PNGs by string
replacement — the intro builder has no equivalent step.)

### 9.4 Inconsistencies worth knowing

- `.gitignore` lists `dist/` **twice**
- `vite.config.js` still allows `.trycloudflare.com`, and `tools/CURRENT-URL.txt`
  still holds a tunnel URL — but `deploy-preview.sh` documents that quick tunnels
  were abandoned for the permanent `buildanta-site.pages.dev`. Both are stale.
- `standalone/` is half-populated (WE SCALE committed, intro absent)
- `verify-room` / `verify-main-endurance` target port **5297**, which no
  `launch.json` entry defines

### 9.5 Carried-over open items (from `ARCHITECTURE.md`)

- 🔴 The contact form still composes a **`mailto:`** — Yash owes the real send
  method plus the phone/WhatsApp number
- ⏳ 46 of the 58 projects still carry placeholder names and art
- ⏳ WE SCALE port-back per `PORT-BACK.md`
- 🔴 Pre-existing portal bug — Yash's open item

---

## 10. Dead and inert code

Live in the tree, but **does not run**. Do not "fix" these without asking —
several were switched off deliberately.

| What | Status |
|---|---|
| `src/modules/introScenes.js` | **Unreferenced.** Nothing imports it. |
| `src/modules/introBackground.js` | **Unreferenced.** Nothing imports it. |
| `src/gl/MarketGrowth.js` | **Wired but never instantiated** — `Corridor.js:194` needs `opts.marketGrowth`, which `intro.js` never passes. Act 03's scene is `marketCamera.js` + DOM, not this. |
| `src/gl/CodeBuild.js.bak` | Backup file left in the tree |
| `introObjects.js` prop system | **Off** — `INTRO.objects.enabled = false` (`config.js:101`). All 36 props remain available. |
| `sound.js` synth | **Stub** — retired 15 Aug 2026 (D-020) |
| `entryGate.js` | **Removed from the main flow** (`main.js:499-502`); reduced-motion path only |
| `src/world/main.js` | Dormant standalone entry, kept for upstream parity |
| `src/world/style.css` | Imported by nothing — regeneration source only |
| `content/site.json` `section.*` keys | Read by nothing |
| `intro.js:1373-1393` `--film-*` writer | Superseded by the later writer at `:1396-1438` |
| `intro.js:860-863` | ⚠️ **Live bug**, documented in-place: `filmOut` is squared, so the authored .714–.726 fade is not the fade that runs |

---

## 11. Verification log — 2026-08-21

Everything below was executed against **this** folder.

| # | Check | Result |
|---|---|---|
| 1 | MD5 of all 310 + 160 files in both originals | B ⊂ A, byte-identical, **0 conflicts** |
| 2 | Merged tree vs complete original | **310/310 identical** |
| 3 | Every one of B's 160 files present in merge | ✅ all byte-identical |
| 4 | `npm install` | ✅ 17 packages |
| 5 | `npm run build` | ✅ built in 9.47 s → `dist/`, 140 files |
| 6 | `market-camera.glb` in build output | ✅ `dist/assets/market-camera-87beBRBV.glb`, 3,819 kB |
| 7 | Draco trio + `finale-score.mp3` in `dist/` | ✅ present |
| 8 | `npm run verify:props` | ❌ 1 stale check (§9.1) — **identical to original** |
| 9 | Same verifier on stripped copy | ❌ 9+ missing assets — **merge fixed these** |
| 10 | Dev server boot | ✅ Vite 7.3.6 ready in 894 ms |
| 11 | `index.html` runtime | ✅ 141 resources, **0 failed**, **0 console errors** |
| 12 | Live canvases | ✅ 9 (`gl`, `intro__gl`, `intro__orbHero`, `market-camera3d`, `consult-zero__hand-canvas`, `finale-ship`, `bh-canvas`, `room__bh`, +1) |
| 13 | DOM sections | ✅ 12 |
| 14 | Zero-byte / 404 assets | ✅ **none** |
| 15 | `we-scale.html` | ✅ 5184 px scroll, 1 canvas, 0 errors |
| 16 | `dashboard.html` | ✅ loads, 0 errors |
| 17 | `acceptance.html` | ✅ loads, 0 errors |
| 18 | `npm run build:we-scale` | ✅ 7.28 MB self-contained (output restored after test) |
| 19 | `npm run build:single` | ❌ guard failure (§9.3) — pre-existing |
| 20 | 141 code asset references resolved | 139 ✅ · 1 comment false-positive · **1 missing** (§9.2) |
| 21 | Post-test tree re-hash | ✅ **still byte-identical to original — no stray writes** |

**Scroll choreography was deliberately NOT exercised end-to-end.** Driving the
timeline risks nothing, but *re-tuning* it is what ate WE SCALE twice. The acts
were verified structurally — every module loads, every asset resolves, every
canvas mounts, zero errors — not by re-timing them.

---

## 12. Document map — which docs to trust

| File | Trust | Note |
|---|---|---|
| `CLAUDE.md` | ✅ **authoritative** | Hard rules and traps |
| `ARCHITECTURE.md` | ✅ **authoritative** | Living map + D-001…D-040. Generated-from source for `dashboard.html`. |
| **`CONTEXT.md`** (this) | ✅ | Merge record + verified state, 2026-08-21 |
| `HANDOFF.md` | 🟡 | Current handoff, prop pipeline, motion architecture |
| `BUILDANTA_COMPLETE_SITE_HANDOFF.md` | 🟡 | Most complete visitor-journey spec; ACT 04 correctly described as **WE SCALE** |
| `README.md` | 🟡 | Run/build instructions good, but documents `standalone/buildanta-intro.html`, which cannot currently be built (§9.3) |
| `PROJECT-CONTEXT.md` | 🔴 **STALE** | Describes ACT 04 as "We consult / forest+gold" — superseded by **D-011: WE SCALE goes black**. Its Act-02 "Voxel Earth" description and its file map no longer match the code. Its claimed 1580 KB standalone file does not exist. Read `ARCHITECTURE.md` instead. |
| `dashboard.html` | 🟡 | Generated; regenerator lives outside this repo |

---

*Merged and verified 2026-08-21. The two timestamped source folders were left
untouched beside this one as a fallback and can be deleted once this folder is
trusted.*

---

*Adopted into the canonical repo 25 Aug 2026 alongside the designer's
camera/reel swap (see ARCHITECTURE.md D-041). The Act-03 camera/reel sections
above describe the designer's version, which is what is now in-tree.*
