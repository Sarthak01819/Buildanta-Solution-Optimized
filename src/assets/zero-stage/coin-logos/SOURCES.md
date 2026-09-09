# Coin logo artwork

These local symbol-only SVGs replace the eight baked-in coin logos. The
original `shards-petals-coins.ktx2` is retained unchanged for the source scene
and petals. No remote logo service is required by the running website.

| Slot | Brand | Artwork source |
| --- | --- | --- |
| 1 | Claude Code | Orange symbol from [official Code docs logo](https://mintcdn.com/claude-code/c5r9_6tjPMzFdDDT/logo/light.svg), linked from [Code documentation](https://code.claude.com/docs/en/overview). This is the docs' Claude mark, not a recreated pixel mascot. |
| 2 | Gemini | [SVGL Gemini sparkle](https://svgl.app/library/gemini.svg) |
| 3 | ChatGPT / OpenAI | [SVGL OpenAI knot](https://svgl.app/library/openai.svg) |
| 4 | Cursor | [SVGL light-theme Cursor symbol](https://svgl.app/library/cursor_light.svg) |
| 5 | Facebook | [SVGL Facebook icon](https://svgl.app/library/facebook-icon.svg) |
| 6 | Instagram | [SVGL Instagram icon](https://svgl.app/library/instagram-icon.svg) |
| 7 | Higgsfield | Exact `hf-logo__glyph` SVG path from the [official Higgsfield homepage](https://higgsfield.ai/), rendered dark for the white coin. |
| 8 | Grok | [SVGL light-theme Grok symbol](https://svgl.app/library/grok-light.svg) |

Retrieved 2026-09-05. Names and marks belong to their respective owners; their
appearance does not imply a partnership or endorsement.

`src/gl/coinLogos.js` controls slot order and artwork size. At load time, each
SVG is drawn once onto a 512×512 white coin-face canvas and uploaded as a
mipmapped texture. Both faces use the same artwork. Cylinder geometry, side
colors, depth behavior, seeded spins and scroll timing stay unchanged.
