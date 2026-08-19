# Buildanta Solutions site (family) — living map

> Truth file (vault rule W3). `dashboard.html` is generated from this — never edit it by hand.
> Regenerate: `node ~/.claude/skills/build-standards/tools/gen-dashboard.mjs "~/claude code/buildanta-site"`

_Updated: 2026-08-14_

## Map

```mermaid
flowchart TD
  SITE["Flagship scroll film<br/>Vite, dev 5280 (LAN)"] --> ACTS["Acts 01…N<br/>WebGL + DOM scroll sequence"]
  ACTS -.->|"carved out, port back via PORT-BACK.md"| WESCALE["WE SCALE / ACT 04<br/>~/we-scale, 5341"]
  SITE --> WORLD["World-in-the-black-hole<br/>src/world/ — PORTED 13 Aug"]
  WORLD -.->|"upstream: fix bugs THERE"| UW["unseen-world, 5331<br/>137-check suite"]
  SITE -.->|"COPY — historical, do not merge from"| OLD["~/buildanta-site-world, 5290"]
  SITE --> ENDUR["Endurance contact room<br/>src/gl/endurance/ — ported 6 Aug"]
  ENDUR -.->|"sandbox, stages 1+2 shipped"| ESB["~/claude code/endurance, 5291"]
  CMS["buildanta-cms<br/>Supabase + admin 5300"] -->|"build-content.cjs"| CONTENT["content/world.json<br/>content/site.json"]
  CONTENT --> WORLD
  CONTENT --> REEL["services reel<br/>src/modules/services.js"]
```

- **The family pattern:** heavy act work happens in carved-out repos with their own verify suites, then ports back deliberately — never edited live in the flagship.
- Content comes from **buildanta-cms**, not from files here. `content/` is generated — see *Changing the words* below.
- The world is **ported, not forked**: its source of truth is `~/claude code/unseen-world`. Fix bugs there first.
- **Traps live in `CLAUDE.md`** — design freeze (UX4), no beat retiming without asking, page-scoped ids, never hand-edit `content/`, never copy files in from the old 5290 copy.

## Changing the words

Nothing here is edited by hand. The loop is:

1. Edit in the admin — `cd ~/claude code/buildanta-cms/admin && npm run dev` → **localhost:5300**
   (Supabase must be up: `supabase start` in `buildanta-cms`. First account created becomes owner.)
2. Press **Publish** in the admin. That writes one immutable snapshot.
3. Build it into this site:
   `SUPABASE_SERVICE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \`
   `node tools/build-content.cjs --out "$HOME/claude code/buildanta-site" --art world/art`
   (run from `buildanta-cms`. The `--art world/art` is required — without it the media
   lands in `public/art/`, which nothing here reads.)
4. Commit `content/` and `public/world/art/`. Both are tracked on purpose.

If the CMS has never been published, the services reel falls back to the hardcoded
array in `src/modules/services.js` and the site looks exactly as it always did. The
world does not have a fallback: `content/world.json` is committed, so a fresh clone works.

## Progress

- ✅ Perf + colour audit, all 4 stages shipped 8 Aug — GPU 8.84 → 3.93 Mpx; the 287ms stall was 19 shaders compiling mid-scroll, fixed
- ✅ WE SCALE (ACT 04) carved out and rebuilt — 33/33 headless checks
- ✅ **World PORTED into this repo (13 Aug, `d5a032c`)** — 26/26 embedded checks; canvas count back to the pre-port baseline of 7
- ✅ Endurance contact module built — Contact = fly into the ship; 12 MCQs settled
- ✅ CMS BUILT and wired — 58 projects, 12 with real copy, 9 services + 5 headings; this site reads its output
- ✅ **Endurance contact module — already IN this repo** (`src/gl/endurance/`, ported 6 Aug across `c25506b`/`2df6082`/`9c4a069` with Yash's own MCQ rounds). The "waiting to be ported" note carried in this file was stale; verified 13 Aug by flying into the ship and reaching the room.
- 🔴 The contact form still composes a **mailto:** — Yash owes the real send method + the phone/WhatsApp number
- ⏳ 46 of the 58 projects still carry placeholder names and art
- ⏳ WE SCALE port-back per PORT-BACK.md
- 🔴 Pre-existing portal bug — Yash's open item, not being chased silently
- 🔴 Endurance: form-send method + phone/WhatsApp number owed by Yash

## Decisions

### D-001 — The approved design is frozen (vault UX4)
- **Date:** 2026-08-10
- **Decision:** Once Yash approves a design it is FROZEN; rebuilds/migrations are not licence to redraw it; ambiguous scope resolves toward preserving.
- **Why:** A "leveled-up" rebuild silently redrew approved UI once; that class of loss is now banned by rule.
- **Alternatives:** Trust each session's judgment — rejected, that's how it happened.
- **Decided by:** Yash
- **Source:** Vault rule UX4 (2026-08-10)

### D-002 — Projects lives AT the black hole and falls you into the world
- **Date:** 2026-08 (approx)
- **Decision:** The Projects entry sits beside Contact at the black hole; entering it drops the visitor into the explorable world.
- **Why:** One gravity-well moment carries both destinations — the site's signature move stays singular.
- **Alternatives:** Separate Projects page/nav — rejected as ordinary.
- **Decided by:** Yash
- **Source:** Seeded 2026-08-11 from the world build

### D-003 — Contact = fly INTO the Endurance ship
- **Date:** 2026-08 (approx)
- **Decision:** The contact experience is the Interstellar-style ship beside the black hole; flying in reveals the form.
- **Why:** Contact should be a scene, not a form field — consistent with the film language of the site.
- **Alternatives:** Standard contact section — rejected.
- **Decided by:** Yash (12 MCQs)
- **Source:** Seeded 2026-08-11 from the Endurance module build

### D-004 — CMS: Supabase + team logins + whole site + both previews
- **Date:** 2026-08-11
- **Decision:** The CMS covers the WHOLE site (not just the world), runs on Supabase with team logins, and supports build-time AND live preview; uploads auto-fit because card geometry comes from `image_size`, not the file.
- **Why:** The team must edit content without Claude in the loop, and previews must match both publish paths.
- **Alternatives:** World-only CMS; file-based editing — rejected in the 9-decision MCQ round.
- **Decided by:** Yash (9 MCQs)
- **Source:** CMS decision round, 11 Aug 2026

### D-005 — Acts get carved out, worked in isolation, and ported back
- **Date:** 2026-08 (approx)
- **Decision:** Heavy act rework happens in a dedicated repo (e.g. we-scale) with its own verify suite and a written PORT-BACK.md path.
- **Why:** Two agents once overwrote each other six times editing the flagship concurrently; isolation plus a deliberate port-back ended that.
- **Alternatives:** Work acts live in the flagship — rejected after the collision.
- **Decided by:** Yash + Claude (logged)
- **Source:** Seeded 2026-08-11 from the WE SCALE carve-out

### D-006 — Beat boundaries never move without asking
- **Date:** 2026-08 (approx)
- **Decision:** No retiming of any scroll act's beat boundaries without Yash's explicit yes.
- **Why:** An ACT 03 retime silently ate the WE SCALE act twice — and its own tests passed both times.
- **Alternatives:** Rely on tests to catch it — proven insufficient, twice.
- **Decided by:** Yash
- **Source:** Seeded 2026-08-11 from the ACT 03 incident

### D-007 — The services reel reads from the CMS, with the hardcoded array as fallback
- **Date:** 2026-08-13
- **Decision:** `src/modules/services.js` merges `content/site.json` over its hardcoded array per-plate; the array stays as the fallback and as the readable definition of the shape.
- **Why:** Otherwise the CMS's Site content screen controls nothing on the real site. Per-plate merge, not all-or-nothing, so a service the CMS has not been given yet keeps its copy instead of vanishing from the reel — the failure that would be noticed last and hurt most.
- **Alternatives:** Leave services hardcoded (rejected — makes the admin pointless here); replace the array entirely (rejected — a missing build would blank the reel).
- **Decided by:** Yash (MCQ, 13 Aug)
- **Source:** World port, 13 Aug 2026

### D-008 — The world's media is committed, not generated on clone
- **Date:** 2026-08-13
- **Decision:** `public/world/art/` (3.7 MB, 58 files) and `content/` are tracked in git.
- **Why:** Another session opening this repo gets a working world with no build step. Yash weighed that against repo size and chose "just works on open".
- **Alternatives:** Gitignore them and require `build-content.cjs` before first run — rejected; the cost lands on whoever opens the repo cold, which is exactly when they can least diagnose it.
- **Decided by:** Yash (MCQ, 13 Aug)
- **Source:** World port, 13 Aug 2026

### D-009 — The world is ported by hand, never by copying files
- **Date:** 2026-08-13
- **Decision:** Changes come across as applied hunks onto this tree's current files, never by `cp` from `~/claude code/buildanta-site-world`.
- **Why:** That copy has no shared git history with this repo, so git cannot three-way merge it. Three of its files are OLDER than ours — copying `main.js` wholesale re-added the crash recorder removed in `dd983a4`, and an over-long slice of its tail duplicated `boot()`, booting the whole site twice and doubling four canvases. Both were caught only by measuring against the pre-port tree.
- **Alternatives:** `cp -R` the copy over this repo — rejected, it silently reverts work.
- **Decided by:** Claude (logged; the hazard is recorded in CLAUDE.md)
- **Source:** World port, 13 Aug 2026

### D-010 — Split headings wrap by word, not by character
- **Date:** 2026-08-13
- **Decision:** `splitText.js` groups each word's character spans in a `.word` wrapper carrying `white-space: nowrap`.
- **Why:** Every character is its own `inline-block`, and a line may break between any two of them — so the contact heading rendered "GOT SOMETHI / NG TO BUILD?" on every laptop-width screen. `word-break` could not fix it: the browser was not breaking the word, it was breaking between two boxes.
- **Composition held at TWO lines** (Yash, same day): the wrapper alone pushed the contact heading to 3 lines at 1024–1440px, so `.contact__title` went from `6.6vw` to `5.7vw`. The line box is ~44.7% of the viewport and "GOT SOMETHING" needs 7.72x the font size in width; measured at eight widths from 820 to 1920, the exact fit is **5.76vw at every one of them**, so one coefficient covers the band with ~1% slack. The 104px cap is unchanged — it engages at 1825px, where the column is 816px against the 803px needed.
- **Verified:** all 11 split headings measured at five widths before and after. Contact: 2 lines with a broken word → 2 lines with none. The other ten: unchanged at every width.
- **Alternatives:** leave it at 3 lines (rejected by Yash); leave the break (rejected, it is the flagship's contact headline).
- **Decided by:** Claude found and fixed the break; Yash chose to keep the two-line composition
- **Source:** Found while verifying the Endurance port request, 13 Aug 2026

### D-011 — WE SCALE goes black (supersedes the mint look AND the carve-out's)
- **Date:** 2026-08-14
- **Decision:** WE SCALE's ground is reference-black (measured off buildanta-solutions.vercel.app: #000 corners, green-tinted near-black atmosphere), globe+hand move LEFT, title top-centre in glowing green, the six ambient money notes / birds / feed orbs are retired (hero burn note stays), ticker + HUD go dark.
- **Why:** Yash wanted the act to match his black reference; 6 MCQs settled text position, black depth, green treatment, type colour, bills, and the strip.
- **Alternatives:** White type like the reference (rejected — glowing green); keeping the bills on black (rejected — only globe+hand remain).
- **Decided by:** Yash
- **Source:** MCQs, 14 Aug 2026 · commit 34d2f1b
- **⚠️ Consequence:** the `we-scale` carve-out repo (port 5341) still wears the MINT look — its PORT-BACK.md must not be run as-is now; the flagship is ahead of it.

### D-012 — The thinker statue joins the black WE SCALE
- **Date:** 2026-08-14
- **Decision:** consult-shot-profile.webp (dormant since the mint world hid the consult film) mounts full-bleed on the right half, facing the globe; faithful bronze grade; title stays top-centre; full statue on phones too; no caption line; fades with the act's own reveal.
- **Why:** Yash pasted the statue from an older vercel deployment of this same site asking why it was removed — the asset never left the repo, only the film that showed it. 8 MCQs settled placement, size, title, grade, entrance, phones, copy, and shot.
- **Alternatives:** Desktop-only statue (my advice, rejected — full on phones); green-graded or mono (rejected — faithful bronze); caption line (rejected).
- **Decided by:** Yash
- **Source:** 8 MCQs in batches of two, 14 Aug 2026 · deployed same day

### D-013 — The old WE CONSULT film returns inside the black act
- **Date:** 2026-08-14
- **Decision:** The timeline holds at consultLocal .848 while ~3 screens of raw scroll play the revived film: desk + laptop-globe under ghost CONSULT → "Stop wasting growth hours." with live streaks → "BOOK A GROWTH CALL ↗" closing card (not a link). No stats, no steps. Fully reversible; full film on phones; silent.
- **Why:** Yash asked for the old deployment's consult part added after the act without replacing anything; 15 MCQs + his two screenshots fixed the cut and the text verbatim.
- **Alternatives:** After the burn (rejected — sacred chain stays last); crossfade (rejected for through-the-darkness); stats row and steps ladder (dropped).
- **Decided by:** Yash
- **Source:** 15 MCQs in batches of 4, 14 Aug 2026 · deployed same day
- **⚠️ Trap for later:** the ORIGINAL film writer was never deleted — it computes zeros and writes them onto `.consult-zero` every frame. The epilogue's writer must stay AFTER it and on the SAME element or it is silently shadowed. `--film-earth-turn` takes degrees.

### D-014 — The desk page leaves the film
- **Date:** 2026-08-14 18:31
- **Decision:** The desk/laptop-globe page (establish shot, ghost CONSULT, laptop portal) is removed from the epilogue film. Two beats remain — "Stop wasting growth hours." and the BOOK A GROWTH CALL card — over two screens (filmStretch 3.0→2.0, same dwell per beat).
- **Why:** Yash sent a screenshot of the page and said "remove this page and integrate the rest."
- **Decided by:** Yash
- **Note:** the page's DOM stays dormant; restoring it = re-adding its film-live rules + s1/dolly variable writes (see d6335b1 for what they were).

### D-015 — Post-film handover is notes-only
- **Date:** 2026-08-15
- **Decision:** After the BOOK A GROWTH CALL card, the hand, globe and plant do not return — only the flying dollars over the unchanged ground, into the burn. Reverse below the film restores the full world.
- **Why:** Yash: "after book a growth call remove the hands and plant thing and dont remove the flying dollar and background must be the same also."
- **Decided by:** Yash
- **Mechanics:** ConsultHand.setWorldCut(on) at filmLocal ≥ .90 (swap always under opaque film blackness, both directions); flag participates in the per-frame visibility expression or it would last one frame.

### D-016 — The ad-strip note
- **Date:** 2026-08-15
- **Decision:** Post-film the hero note arrives pinned as a diagonal fullscreen strip (rotation.z 0.21, scale 0.95 — whole bill visible as a band, ends cropped), no float; supporting notes stay dark; burn→galaxy unchanged on top of the tilt.
- **Why:** Yash's reference screenshot: "tilted… like an advertisement strip shifted diagonally… dont float the dollar… remain the same transition."
- **Decided by:** Yash
- **⚠️ Discovered en route:** port 5290 serves the stale buildanta-site-world copy — verify-journey ran green against the WRONG BUILD for two days. Suite now defaults to 5303 and fingerprints the build (setWorldCut) before trusting the page. Vault V8.

### D-017 — The burn loses its debris
- **Date:** 2026-08-15
- **Decision:** The focusBurnFragments system (five bill-textured shards that ignite, break away and drift) is retired behind its single visibility gate. The note chars and embers in place; fire, embers, scorch and the galaxy handover untouched.
- **Why:** Yash circled every shard on his mid-burn screenshot: "remove this cutting notes part and the note in only be burn dont ruin this transion."
- **Decided by:** Yash
- **Restore:** re-instate the original gate expression preserved in the comment at the site of the change.

### D-018 — The strip travels and answers the pointer
- **Date:** 2026-08-15
- **Decision:** The ad-strip note slides along its own diagonal across the beat (±0.5 world units, ~75% always on screen), settling as the burn ignites. Hover: lean toward cursor + 0.06 lift + 1.8% scale, eased, fading to zero at burn start. No material effects. Phones: travel only, no hover (no pointermove).
- **Why:** Yash: "move diagonally but not disappear fully… put some hover effects… not overmake up the effects."
- **Decided by:** Yash

### D-019 — Clean black film frame
- **Date:** 2026-08-15
- **Decision:** The lens-bridge's green furniture (three ring borders, one dashed/turning; the conic aperture wheel with green glow) is display:none under film-live. The frame keeps only neutral elements: dark vignette, the shot's baked beams, the copy's white rules.
- **Why:** Yash's arrowed screenshot: "remove this green shades from the frame this should be clean screen as the theme."
- **Decided by:** Yash
- **Note:** rawForP cannot address inside the film HOLD (p is pinned at FILM_P) — verify film beats by page-% jump on a fresh page.

### D-020 — Sound removed
- **Date:** 2026-08-15
- **Decision:** createSound returns an inert full-API stub (no AudioContext ever constructed); .intro__sound hidden. Real implementation retained unexported (createSoundRetired) for cheap restoration.
- **Why:** Yash: "first remove the sound in this."
- **Decided by:** Yash

### D-021 — The fall travels on production; the ring gets pixels
- **Date:** 2026-08-15
- **Decision:** (1) Projects fall reads the beat through a module-scope bridge (liveIntro) instead of the dev-gated window.__buildanta — the LIVE site was hard-cutting into the world because getBeat() was null in every build. (2) The finale beat has a 1.5× resolution FLOOR on desktop (was min(dpr,cap), which renders 1× on dpr-1 monitors and aliases the photon ring); phones keep the 1024 cap.
- **Why:** Yash's two reports from production: "it just snaps inside" and the hole's visible quality.
- **Verified:** production-parity (static dist) with the real wall→hold→ENTER→ride→Projects gesture; in-page rAF log shows the 5.4s voyage; beat canvas 2160×1350 at dpr-1.
- **⚠️ Traps:** anything read from window.__buildanta is dev-only — prod paths must never depend on it. Headless rAF fired 3×/8.4s — sample inside the page on its own rAF or measure nothing. A stray 300×150 canvas also lives in .intro__blackhole (harmless, unexplained — check if ever hunting leaks).

### D-022 — The shadow is a true void
- **Date:** 2026-08-15
- **Decision:** Three fixes so the event horizon renders dead black: (1) dither moved below the gamma encode (in linear space ±0.5/255 becomes 15/255 on black); (2) the photon ring gated to escaped rays only (captured rays share minR≈1.5 and were glowing); (3) scene alpha carries a HOLDOUT MATTE (0 inside the horizon) and the composite suppresses bloom by it, feathered 1px.
- **Why:** Yash: "it should be black, man" — on the finale and through the Endurance window.
- **Measured:** interior median 5.0/255 with 52% inter-frame flicker → **0.0, max 0, 0% flicker**. Deep space 0.0. Disk/ring/lensing unchanged; Endurance suites 11/11 and 13/13.
- **⚠️ Trap:** the dither trap is generic — ANY ±1/255 nudge must live in display space, never linear. And sample the interior from a luminance profile, not a guessed box: my first two readings measured the rim's bloom skirt.

### D-023 — The market camera is a 3D model
- **Date:** 2026-08-19
- **Decision:** PNG + six overlay spans retired; procedural GLB (build_camera.py, 6-iteration matcher loop, IoU 0.739 accepted) rendered by marketCamera.js inside the same .market-pusher box. Drop-in contract: render frame locked to the model's mm=px coordinate system, so at yaw 0 the canvas is pixel-equivalent to the PNG — all existing push transforms unchanged, 43.5%/31% pivot still the lens. Entry x .425–.560 (profile fade-in, travel+turn, reels spin-up as a factor on cameraSpin). approach at .684 untouched.
- **Open:** plate transport curve (reel_a→apex→reel_b); anchors already published as --market-reel-* projections.
- **⚠️ Traps:** bpy transform_apply acts on ALL selected objects — helpers must deselect first (the body silently doubled its depth and swallowed the lens; silhouette matchers cannot see interior occlusion — the build now audits part depth vs the lens plane). mm-scale point lights decay to black — use directionals. Port 5290 = stale copy (V8), shoot-market retargeted.
