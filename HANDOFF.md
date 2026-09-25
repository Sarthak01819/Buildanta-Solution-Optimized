# Buildanta Site — Intern Handoff

**Live site:** https://buildanta-site.pages.dev
**Handoff date:** 3 Sep 2026. This zip is the complete project: site source, full git
history, the 3D hand-animation pipeline, and the original source assets.

---

## 1. First run (any OS)

Install **Node.js 20+** (nodejs.org). Then, in this folder:

```bash
npm run dev
```

Open http://localhost:5173 (or whatever port it prints). `node_modules/` is already
included in this zip, so this should work offline. If anything complains, run
`npm install` once and retry.

Scroll the whole page — the project is one long scroll-driven film. The part most
actively developed recently is the **WE SCALE act** near the end: two arms
(green = AI, human) fly in open-handed, curl into fists, and bump over a meadow.

## 2. The map

| Path | What it is |
|---|---|
| `src/gl/consultMeet.js` | THE file for the fist-bump beat: hand loading, materials, choreography drive, parallax meadow layers, petals |
| `src/modules/intro.js` | Scroll timeline for the whole page. `consultStretch` (~line 1659) sets how much scroll the WE SCALE act takes |
| `src/styles/main.css` | `.consult-meet__*` rules: centred title, dreamy veil + sun rays, 4-edge blur frame |
| `src/modules/mirrBillBurn.js` + `src/modules/billPortal.js` | The bill beat after the fist bump (D-076): `mirrBillBurn.js` drives the vendored bill scene as a pure function of scroll (phases arrival / portal / settle / burn); `billPortal.js` is the round medallion at the start — our two fists baked as a still, graded to the reference's green, fading out as Franklin appears |
| `src/gl/lensBlurPass.js` | The reference's lens for that beat: radial Kawase blur + black vignette + saturation, written premultiplied into the alpha canvas |
| `src/modules/portalHoldButton.js` | The `TAP & HOLD` button that rides the portal's hole (D-077): show-only (`pointer-events: none`), placed every frame from the sealed module's `window.__bhp.state()`; the ring fills with the module's collapse progress. Created in `intro.js` `engagePortal()`, destroyed at teardown / ride |
| `src/modules/sectionNav.js` | The BZ section navbar's brain (D-078): the five sections (-100 → 0 BZ), the back-scroll LOCK (wheel via Lenis `virtualScroll`, keys, touch, a scroll backstop; sticky floor lowered only by a navbar jump), the white-overlay jump, ruler theme/visibility. Sections themselves are defined in `intro.js` (`SECTIONS` / `sectionRaws()` / `goToSection()`) |
| `src/modules/scrollRuler.js` + `src/styles/scroll-ruler.css` | The ruler UI — a port of the Zero reference's scroll ruler (desktop ticks + hover labels; phone bars + counter + menu; the white jump overlay). DM Mono, `bz-` classes, no ids |
| `tools/verify-section-nav.cjs` | Suite for D-078: sections, back-lock (wheel/keys/touch), hover nav, jumps, TAP & HOLD in the burn, ENTER circle, ride, Leave the Ship, world, re-arm, ink theme, skip, phone |
| `tools/shoot-portal-hold.cjs` | Frames of that button at rest, following the pointer, mid-hold and armed (`--tag <name>`, `SITE_URL`); writes `shots-portal-hold/<name>/` with a `manifest.json` of hole-vs-button error per frame |
| `tools/shoot-bill-transition.cjs` | Captures the bill beat at fixed scroll stops (`--tag <name>`, `SITE_URL`); writes `shots-bill-transition/<name>/` with a `manifest.json` of measured state |
| `src/assets/meet-*` | Everything the beat loads: `meet-fistbump.glb` (the animated hands), meadow/sky/cloud layers, matcaps, skin texture |
| `ARCHITECTURE.md` | **Read this.** Living map + decision log D-001…D-054. Every "why is it like this?" is answered there or the answer is "not recorded" |
| `dashboard.html` | The same map rendered as a page — open it in a browser |
| `tools/` | Verification + deploy scripts (below) |
| `pipeline/` | The 3D hand pipeline (below) |

## 3. Verify before you ship — the house rule

Nothing ships on "it should work". Two suites exist; run both after any change to
the act, and look at the screenshots they produce:

```bash
node tools/shoot-fistbump.cjs     # screenshots of every beat of the fist bump
node tools/verify-journey.cjs     # full-page scroll journey, checks for page errors
node tools/verify-reverse.cjs     # scroll DOWN then UP — forward/reverse must be pixel-identical
node tools/verify-scroll-bill-transition.cjs   # the bill beat (D-076): pacing, medallion fists + tone, portal fade, lens, sky plate, no copy, exact reverse — 6 cases
node tools/shoot-bill-transition.cjs --tag <name>  # PNGs of the bill beat at every stop — look at them, then compare against shots-bill-transition/impl-r5 (the approved capture)
node tools/verify-portal.cjs      # the portal wall (D-077; now runs on Windows — system Chrome + swiftshader): TAP & HOLD rides the hole (≤ 3 px), ring = collapse progress, hold → armed → ENTER ride. Step 4a (Gargantua after scroll-back) is a KNOWN pre-existing red — see ARCHITECTURE D-077
node tools/shoot-portal-hold.cjs --tag <name>      # PNGs of the TAP & HOLD button: rest / follow / mid-hold / armed, desktop + phone — look at them
node tools/verify-section-nav.cjs --tag <name>     # the BZ navbar (D-078): back-lock, jumps, wall re-arm, ENTER circle, Leave the Ship, phone — shots-section-nav/<name>/
```

They need the dev server running on **port 5303**:
`npm run dev -- --port 5303 --strictPort`

⚠️ These scripts use Playwright. On this Mac it was borrowed from a sibling
project; on a fresh machine run `npm i -D playwright && npx playwright install chromium`
once, and the `require` fallback in each tool's first lines will pick it up
(or edit those lines to just `require('playwright')`).

**Golden rule from this project's history (D-044):** the scroll timeline is
scrubbed, so everything in the act must be a pure function of scroll position —
never of wall-clock time. That's what `verify-reverse` enforces. If it goes red,
your change is time-dependent somewhere.

## 4. Deploying

```bash
sh tools/deploy-preview.sh
```

First run will open a browser asking you to log into Cloudflare — **ask Yash to
log in / grant access** (it deploys to his `buildanta-site` Pages project).
After deploy, the script prints the live URL. The habit here: verify the deploy
really shipped by comparing hashes (see D-entries mentioning "sha match") —
`curl -s https://buildanta-site.pages.dev/?cb=$(date +%s) | shasum -a 256`
must equal `shasum -a 256 dist/index.html`.

## 5. The hand pipeline (`pipeline/hands/`)

The hands in the site are **not hand-edited GLB files** — they are built by
scripts from the rigged models in `pipeline/hands/assets/models/` (extracted
from `pipeline/source-assets/zeromirror.zip`, which Yash holds the rights to).

Install once: **Blender 4.2+** (blender.org — the project used 5.2) and
**ffmpeg** (only needed for preview videos).
Make sure `blender` runs from a terminal:
- macOS: `brew install --cask blender ffmpeg` or add `/Applications/Blender.app/Contents/MacOS` to PATH
- Windows: install Blender, then use the full path to `blender.exe` (or add to PATH)
- Linux: `sudo snap install blender --classic && sudo apt install ffmpeg`

Build chain (order matters):

```bash
blender -b --python pipeline/hands/build_new.py    # choreography -> out/newhands_site.blend + preview PNGs
blender -b --python pipeline/hands/gap.py          # MEASURE the fist gap (see below)
blender -b --python pipeline/hands/finalize.py     # vertex colours + export -> out/newhands.glb
cp pipeline/hands/out/newhands.glb src/assets/meet-fistbump.glb
npm run build                                       # then run the three verify tools
```

Knobs you'll actually touch, all in `build_new.py`:
- `OVERLAP` — gap between the fists at contact. **Measured law: gap ≈ 2×OVERLAP + 0.003.**
  Current 0.003 → ~10mm gap. History: 0.007 read too wide, −0.004 made fingers
  merge. Always re-run `gap.py` after changing it; don't eyeball.
- `TRAVEL` — the approach path (frame, distance) pairs. Scale these inversely if
  you change the site's `SCALE` in consultMeet.js, or hands leave the frame.
- `FIST_P / REACH_P` — per-finger joint angles (index→pinky). These encode real
  hand biomechanics (sources in D-048); the fist is deliberately asymmetric.
- `cascade()` — finger timing: thumb leads, digits arrive 1 frame apart,
  overshoot 12% and settle. Don't flatten this; lockstep fingers is what makes
  CG hands look fake (that lesson cost a full day, see D-048/D-049).

- `TH_FIST_G / TH_FIST_H` — the closed-fist thumb as ABSOLUTE per-rig euler
  triples for `DEF-thumb.01/.02/.03.L` (CMC, MCP, IP), keyed by `_set3()`.
  Re-derive them with `pipeline/hands/thumb_solve.py` (numeric solver with a
  face-intersection census); keep IP ≤ 15° and no .02/.03 twist — that is the
  client's "straight thumb" (D-075). Never scale these; the 0.94 human scale
  applies to the fingers only.

Diagnostics in the same folder: `prove.py` (pose a rig in isolation and render it
large — ALWAYS do this before judging a hand in the tiny site frame; see D-049's
"judging hands from a blurred corner" lesson), `hier.py`, `holes.py`.

## 6. Things that will bite you if you don't know them

1. **Never move the act's beat boundaries** (the p-ranges in intro.js) without
   Yash's explicit yes. Lengthening the act is done via `consultStretch` only.
2. The approved design is FROZEN. Rebuild ≠ redesign. Ambiguity resolves toward
   preserving what's live.
3. glTF exports split vertices at UV seams — if you re-import a hand GLB into
   Blender, `remove_doubles` first or subdivision cracks it open (D-049).
4. The human arm's texture is a **baked lightmap** — it must stay on an UNLIT
   material (`MeshBasicMaterial`). Putting it on a lit/matcap material
   double-shades it into mud (D-050).
5. The green hand's whole look is one image: `src/assets/meet-matcap-hand.webp`.
   Change the look by swapping that image, not by adding lights.
6. Screenshot tools + suites are the eyes here. The pane you're working in can
   lie (stale WebGL frames); the tools' PNGs on disk are the truth.
7. `paper-tear` atlas in src/assets is currently UNUSED (removed in D-053, full
   restore recipe in D-052) — don't delete it without asking.
8. Production (`src/gl/zeroMirrorStage.js`) borrows each hand's fist pose from
   its OWN rig in `meet-fistbump.glb` (green ← Hand_Green, human ← Hand_Human).
   Never copy the green pose onto the human: `human_hand_1.glb`'s bones sit
   25–65 mm off its skin and the transplant turns the thumb into a claw (D-075).
9. The fist contact frame has `FIST_FRAME_ROLL_DEG / SPIN / TIP` constants
   (roll 45 is the client's pick) plus a preview-only URL override
   `?fistRoll=&fistSpin=&fistTip=` for rendering alternatives. Capture the
   ending for judging with `node tools/shoot-zero-ending.cjs --tag <name>`
   (needs the 5303 server; writes `shots-zero-ending/<name>/`, ignored).
10. The bill beat (D-076) once carried a `WE scale.` copy lockup (serif + script,
    bottom-left, WindSong from Google Fonts). Yash had it REMOVED at the 10 Sep 2026
    approval — the `.intro__bill-copy` block, its CSS, the `--bill-copy` driver in
    `intro.js` and the font link are all gone on purpose. Don't re-add it; if it is
    ever wanted back, it is restored from the git history of D-076
    (`git log -S intro__bill-copy`), not rebuilt.
11. The portal renderer `src/effects/blackhole-portal/index.js` is SEALED (a
    port of black-hole-bg). The `TAP & HOLD` button (D-077) is a separate
    show-only layer that reads the module's public `window.__bhp.state()`
    every frame; it never intercepts the press (`pointer-events: none`). If the
    button ever stops following the hole, the module's state contract changed
    (`x`, `y`, `size`, `dpr`, `phase`, `c`, `down`) — fix the reader, not the module.
    The old 4 s `HOLD` whisper is gone on purpose; don't re-add it.
12. **Back-scroll is LOCKED per section (D-078).** Once past a section's start
    (-100 / -75 / -50 / -25 / 0 BZ) the visitor cannot scroll above it; only
    the BZ navbar goes back. So there is no "scroll back out of the wall" any
    more (the old wheel-up / Esc dismissal was removed) and no wheel-up exit
    from the ship ("← Leave the Ship" or Esc). The section positions only
    READ the timeline (`rawForP(.543)`, `rawForP(.738)`, the wall, the ride
    end) — if a beat ever moves (with Yash's yes), check they still land on
    the frames picked on 23 Sep: camera entering / black before the circle.
13. A navbar jump back past the wall RE-ARMS the door (`resetDoor()` in
    intro.js): `enteredOnce` is reset, `solid` comes off the black hole (the
    finale's Contact / Projects leave with it) and the score fades out
    (`music.leave()`); it rises again at the next ENTER. Jumping to 0 BZ
    enters without the door (`enterWithoutDoor()`), under the white overlay.
14. `tools/scope-world-css.cjs` now scopes the world's `a:focus-visible,
    button:focus-visible` rule too. Unscoped, its `border-radius: 2px` squared
    the portal's ENTER circle (and every other site button's focus ring).
    Re-run the tool after any world CSS re-port.
15. **The wall's ENTER button is OFF by a switch (D-104).** `PORTAL_ENTER_BUTTON`
    in `src/config.js`: false = a completed hold enters on its own; true = the
    original ENTER door is back. Nothing was deleted.


## 7. Open items Yash hasn't resolved yet

- "double/dollar wheel animation" and "WE SCALE at top right" — asked twice,
  still undecoded; waiting on a reference from Yash (see D-052 notes).
- The reference site's Greek columns + pond + god-rays: assets exist in
  `pipeline/source-assets/zeromirror.zip` (`garden-godrays.ktx2` already decoded
  once — recipe in D-052) but Yash hasn't asked for them yet.

## 8. Git

Full history is included (`.git/`, 50+ decision entries). A private GitHub
remote `1710yashraj-builder/buildanta-site` was pushed at handoff time as the
safety copy. Work on branches, keep commits small, and keep updating
ARCHITECTURE.md's decision log — same turn as the change, not later.
