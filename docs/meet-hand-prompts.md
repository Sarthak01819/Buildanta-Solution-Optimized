# THE MEET — final asset prompts (D-042)

The human hand in the meet beat currently reuses `consult-hand-v2.png`
(rotated) as a placeholder. Generate the real one with any image model
(Gemini/Codex/Omni), drop it in `public/assets/`, and swap the texture in
`src/gl/ConsultHand.js` where `createConsultMeet` is handed `handTexture`.

## 1. Photoreal reaching hand (the human side)

> A photorealistic human right hand and bare forearm of a man in his early
> 30s, warm medium-tan skin with fine knuckle creases, subtle veins and
> natural short nails, reaching diagonally from the lower-right corner
> toward the upper left with the index finger extended in the near-touch
> gesture of a classical fresco, other fingers relaxed and gently curled.
> The arm floats in a completely empty pure black studio void. Composition:
> the extended fingertip ends just short of frame centre, medium close-up,
> shallow depth of field keeping the fingertip tack sharp. Style: shot on a
> Sony A7R IV, 85mm at f/4, one warm soft cinematic key light from the
> upper left wrapping the skin, faint cool rim along the forearm's lower
> edge, luxury fragrance-campaign photography. THE BACKGROUND MUST BE
> SOLID PURE BLACK. Aspect 4:5.

Then remove the background (or keep black + we key it) and export webp.

## Notes

- The AI hand needs NO asset — it is sampled from an analytic skeleton in
  `src/gl/consultMeet.js` (POSE_REACH / POSE_FLIP capsule tables).
- Once the key `GOOGLE_AI_API_KEY` exists on this Mac, Claude can generate
  this via the banana skill directly.
