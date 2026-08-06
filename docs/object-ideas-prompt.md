# ChatGPT prompt — intro objects ke ideas

Neeche wala poora block copy karke ChatGPT mein paste karo. Jo JSON wapas
aaye, wo mujhe de dena — main usse seedha `introObjects.js` + `main.css`
mein convert kar dunga (schema jaan-boojhkar wahi hai jo code padhta hai).

---

You are a senior motion designer working on a premium studio website's
opening title sequence. I need object/particle concepts, specified precisely
enough to implement without further design decisions.

## Context

A 20-second cinematic intro plays before the site. It has four acts. Each act
is one full-screen photographic image with a headline centred near the top,
and a few small decorative objects floating around that headline.

The four acts, their taglines, and the image behind each:

| # | Tagline | Image | Palette |
|---|---|---|---|
| 01 | **Your idea** | A luminous translucent pearl-like sphere glowing from within, warm light, soft bokeh spheres drifting around it | warm cream paper `#f2e6d7`, terracotta accent `#bd6741` |
| 02 | **We code** | Stacked transparent glass cubes lit by electric blue light seams, dark studio | deep navy `#06142d`, electric blue accent `#6dc9ff` |
| 03 | **We market** | A gold ring standing on rippling concentric orbits, with pearls travelling along those orbits | plum `#3b172d`, warm coral accent `#ffab79` |
| 04 | **We consult** | Two large glass forms — a ring and a sail — on a stone podium, lit from behind | deep green `#173126`, gold accent `#d8b46c` |

The objects must feel like they belong **inside that photograph** — same
material language, same light. They are glass, light, pearl, vapour, metal.
They are never icons, symbols, logos, or illustrations of concepts.

## What I need

**At least 20 distinct object concepts.** Spread them across the four acts —
at minimum 4 concepts per act, plus some marked `any` that work everywhere.
Each concept must be different in *material or behaviour*, not just size.

## Hard constraints — a concept that breaks any of these is unusable

1. **Pure CSS on a single square element.** No images, no SVG, no external
   assets, no JS-drawn canvas. You may use: `border-radius`, `background`
   (any gradients), `border`, `box-shadow` (incl. `inset`), `filter`,
   `backdrop-filter`, `opacity`, and one optional `::before` **and** one
   optional `::after` layer.
2. **The element is always a square** whose side is `var(--d)`. Use `--d`
   inside `calc()` for any size-relative value so objects scale correctly.
3. **Only these colour tokens exist**, and they change per act:
   - `var(--brass)` — the accent colour. Your main colour source.
   - `var(--paper)` — the act's background colour.
   - `var(--rule)` — a hairline colour.
   - The idiom used in this codebase is
     `color-mix(in srgb, var(--brass) 40%, transparent)`.
4. **Never use `var(--ink)` for a highlight or fill.** `--ink` is the text
   colour: it is *dark brown* on act 01 and *near-white* on acts 02–04. We
   already shipped this mistake once — the objects rendered as glowing
   spheres on the dark acts and as muddy grey blobs on the light one.
   For highlights use literal white at low alpha, e.g.
   `rgba(255,255,255,0.5)`. It reads correctly on both light and dark grounds.
5. **Every concept must work on a light ground and a dark ground.** State
   this explicitly per concept.
6. **Motion is a slow continuous drift, not a keyframe animation.** Each
   object's offset is computed every frame as:
   ```
   dx = sin(time * speedX + phaseX) * amplitude + pointerX * depth
   dy = cos(time * speedY + phaseY) * amplitude * 0.8 + pointerY * depth
   rotation = sin(time * 0.11 + phaseX) * spin
   ```
   So describe motion only as **amplitude / speed / spin** multipliers.
   Do not write `@keyframes`, and do not propose motion that needs a path,
   a timeline, or collision between objects.
7. **No bounce.** No `back.out`, no `elastic`, no overshoot, no springiness,
   no pulsing scale, no blinking. This look was rejected once as amateurish.
   Motion is slow, confident and almost subliminal.
8. **Restraint.** Maximum 5 objects on screen at a time. Each object is
   small — between `4vmin` and `16vmin`. They must never compete with the
   headline; they live at the edges of the frame.

## Output format

Return **only** a JSON array, no prose before or after. One object per
concept, exactly this shape:

```json
[
  {
    "id": "kebab-case-unique-id",
    "label": "Short human name",
    "forAct": "idea | code | market | consult | any",
    "rationale": "One sentence: why this material belongs with that image.",
    "worksOnLight": true,
    "worksOnDark": true,
    "css": {
      "borderRadius": "50%",
      "background": "radial-gradient(...)",
      "border": "1px solid color-mix(in srgb, var(--brass) 46%, transparent)",
      "boxShadow": "0 0 calc(var(--d) * 0.5) color-mix(...)",
      "filter": null,
      "before": null,
      "after": null
    },
    "motion": {
      "amp": 1.0,
      "spin": 0,
      "speedBias": 1.0,
      "note": "One sentence on how it should feel moving."
    },
    "size": { "minVmin": 5, "maxVmin": 14, "preferredCount": 4 }
  }
]
```

Field rules:

- `css.*` — real CSS declaration values, ready to paste. Use `null` when the
  concept does not need that property. `before` / `after` when present are
  objects of CSS declarations for that pseudo-element (they are positioned
  `absolute; inset: 0` for you).
- `motion.amp` — drift amplitude multiplier, `0.5` (barely moves) to `1.3`
  (most buoyant). `motion.spin` — degrees of tilt, `0` to `8`; anything above
  8 reads as spinning and is rejected.
- `motion.speedBias` — `0.7` slower than baseline, `1.3` faster. Heavy or
  metallic things should be slower than light or vaporous ones.
- Prefer concepts that differ in **material** — polished metal, frosted
  glass, clear glass, pearl, vapour, caustic light, dust mote, soap film,
  ember — rather than in shape alone.

Give me at least 20.
