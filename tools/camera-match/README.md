# camera-match — Agent 2 of the market-act 3D rebuild

One iteration: `node tools/camera-match/match.mjs <model.glb>`
Renders ortho front elevation (785x1511, bbox onto 18,18-767,1493), gates per
the project brief, writes `.iter/report.json` with signed errors for Agent 1.

Gate loop rule: max 6 iterations, then stop and hand back — past six the
failure is structural.

⚠️ Measurements are DIFFERENTIAL (candidate vs reference through the same
detector). The selftest proved absolute detection is biased 13-69px by body
alpha inside the windows — differential cancels it. The brief's anchors remain
documented intent; the gates compare like with like.

Quad ratio is estimated from coplanar tri pairs (glTF is triangles by spec);
authoritative only in the DCC source.
