# Reel plates v2 — Buildanta's actual services

**9 themes × 2 variants = 18 images, one batch.** These replace the marketing-
only art on the film reel in ACT 03. The reel now shows what the company does:
marketing, software and hardware.

**Why new art:** the current plates were generated for marketing disciplines
(funnels, comets, prisms). Four of the nine services — website, software, CRM,
IoT — have no matching image, and the whole set should feel like one company.

**Locked (Yash, 7 Aug):** cinematic abstract · clean plates, NO text · portrait
3:4 · 2 variants per theme · indigo–magenta grade · the site prints a huge word
(SEO / ADS / IoT…) over the top-left and copy along the bottom.

---

## Paste everything below into Codex in ONE message

Generate all 18 images in this run. Name each output exactly as given
(`01-seo-A`, `01-seo-B`, `02-aeo-A`, …). Every image obeys the SHARED DNA; the
numbered prompts only add the subject.

### SHARED DNA — every image

- Portrait 3:4, 2048×2732 px, cinematic render quality, ultra sharp.
- One film: near-black indigo ground (#0a0616), electric magenta-violet energy
  (#c05cff → #ff7ad9 highlights), cool blue-white for structure. Restrained —
  most of the frame is dark.
- Abstract 3D/energy art. NO people, NO faces, NO hands, NO logos, NO real
  product or brand shapes, NO literal screens or phone mockups.
- **ABSOLUTELY NO text, letters, numbers or UI of any kind.**
- **Composition is a hard requirement:** the site prints a very large word
  across the **upper-left third** and two lines of copy across the **lower
  third**. Both zones must stay dark and quiet — no bright detail, no busy
  texture there. Put the subject in the **centre-right**, roughly the middle
  band of the frame.
- Depth of field, soft volumetric glow, a little grain. Premium, engineered,
  calm — not neon gaming, not clip-art.

### 01 · SEO — being found in search
- **01-seo-A** — A vertical shaft of pale light descending through dozens of
  translucent stacked planes in dark space; the topmost plane ignites magenta.
- **01-seo-B** — A dark terrain of low ridges seen from above with one glowing
  path threading cleanly from the far edge to a bright well at centre-right.

### 02 · AEO — being the answer AI gives
- **02-aeo-A** — A luminous knot of woven light strands at centre-right, with
  several thin filaments converging into it from off-frame, as if many
  questions resolve into one answer.
- **02-aeo-B** — A soft glowing orb suspended in dark space, its surface made
  of countless tiny light-points, radiating three or four calm concentric
  answer-rings outward.

### 03 · ADS — paid attention
- **03-ads-A** — A funnel of streaming light particles: a wide diffuse cloud
  compressing into a single hot magenta stream that strikes a small bright core.
- **03-ads-B** — Rows of dark glass gates receding into perspective, one gate
  mid-frame blazing as a torrent of light passes through it.

### 04 · SOCIAL — living in the feed
- **04-social-A** — A dense cluster of small glowing nodes connected by fine
  light threads, pulsing outward in waves from a bright centre-right core.
- **04-social-B** — A long ribbon of light folding back on itself repeatedly
  like an endless scroll, each fold catching a magenta highlight.

### 05 · CONTENT — publishing what people search for
- **05-content-A** — A single beam striking a floating crystal prism and
  fanning into ribbons of magenta-violet light that curl away like pages.
- **05-content-B** — Layered translucent sheets stacked in depth, each edge
  lit, the topmost sheet dissolving into drifting particles of light.

### 06 · WEBSITE — the site itself
- **06-website-A** — A tall lattice of thin glowing lines assembling into a
  clean rectangular structure in dark space, still half-built at the edges.
- **06-website-B** — A polished dark glass slab standing upright on a
  reflective floor, edge-lit magenta, with a soft light passing over it.

### 07 · SOFTWARE — custom systems
- **07-software-A** — Interlocking translucent geometric blocks assembling
  mid-air into one larger form, seams glowing where they meet.
- **07-software-B** — A deep vertical shaft of stacked luminous layers seen at
  an angle, data-like light travelling between the layers.

### 08 · CRM — every customer in one place
- **08-crm-A** — Many separate light streams curving in from all sides and
  merging into a single calm bright column at centre-right.
- **08-crm-B** — A spiral of evenly spaced glowing markers winding inward to a
  soft core, each marker a point of light on the same thread.

### 09 · IoT — machines online
- **09-iot-A** — A grid of small distant light-points across a dark plane,
  each sending a thin thread of light upward to one bright hub above them.
- **09-iot-B** — A single sensor-like beacon on a dark surface emitting
  concentric rings of magenta light that fade toward the horizon.

---

## Judging checklist

1. **Quiet zones?** Upper-left third and lower third dark enough for white text.
2. **Clean plate?** Zero letters, numbers, logos.
3. **One film?** Same grade and darkness across all 18.
4. **Reads as the service?** A stranger could guess it with the word beside it.
5. **Premium?** No neon-casino, no clutter, no stock-art feel.

## After generation

Drop the winners into `public/assets/reel/` as `<slug>.jpg` (e.g. `seo.jpg`,
`aeo.jpg`, `ads.jpg`, `social.jpg`, `content.jpg`, `website.jpg`,
`software.jpg`, `crm.jpg`, `iot.jpg`) and update the `art` field in
`src/modules/services.js`. Nothing else needs touching.
