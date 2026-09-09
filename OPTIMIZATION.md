# Quality-preserving optimization copy

Created 2026-09-06 from `../buildanta-site`. The original project is not an edit target.

## Constraints

- Preserve every active asset, shader, effect, model, animation and existing render resolution.
- Preserve the approved desktop composition, colors, fonts and physical scroll timing.
- Mobile/tablet adjustments may improve layout and control placement, not remove visual content.
- Optimize unused work, loading readiness and scheduling before considering file-format changes.
- Keep original media unchanged unless a conversion can be proved lossless.

## Verification

Compare original/copy asset hashes, scroll maps, deterministic scene frames and responsive viewports. Report measurements and limitations; do not claim universal lag-free operation.

## Implemented in this copy

- Bypass unused legacy hand-scene construction when the active ZeroMirror renderer is selected. Original renderer settings, effects, models and materials remain intact.
- Track real asset readiness in the existing loader, prefetch the upcoming camera and bill atlas, and prepare source textures and all seven shader passes before revealing where possible.
- Prepare the camera earlier without changing its visible entrance or scroll mapping.
- Preserve the loader's existing minimum duration and fade. Partial failures never display 100%/Ready. A nominal 12-second fallback releases scrolling; late preparation does not rewind the visitor's position.
- Keep the touch ENTER control centered across phone/tablet rotation. Desktop pointer-following behavior is unchanged.
- No media conversion, texture downscaling, DPR reduction, shader simplification or animation retiming was performed.

## Verified results — 2026-09-06

- Production build and reference scroll-pacing checks pass. Existing large-chunk build warnings remain.
- All 388 media/model/shader files checked are byte-identical (65,195,447 bytes). Scroll mappings, configuration and bill-wrapper hashes match the original.
- Six deterministic desktop/phone coin, hand and bill foreground captures are pixel-identical. Pinned full-page bill/portal comparisons also have zero differing pixels.
- Five unused legacy image downloads are avoided: 4,106,256 encoded bytes (about 3.92 MiB). Live GPU programs at the bill checkpoint dropped from 77 to 68; WebGL contexts remained at 9. Total development requests changed from 221 to 222, so this is not a request-count reduction claim.
- Responsive checks passed at 390×844, 768×1024, 1024×768 and 1440×900: 26 captures, no horizontal overflow or runtime errors, including rotation and keyboard focus.
- Six preparation/error/cancellation checks passed. Actual-page normal loading and delayed-asset timeout paths also passed.

Verification reports are under `shots-zero-stage/quality-optimized/`: `optimized-report.json`, `portal-report.json` and `loader-report.json`. Additional regression scripts are `tools/verify-quality-optimized.cjs`, `tools/verify-preparation-optimized.cjs` and `tools/verify-responsive-optimized.cjs`.

## Preview and limitations

Original preview: http://127.0.0.1:5173/ (untouched).

Optimized preview: http://127.0.0.1:5174/.

To start the separate preview from this directory:

```powershell
node node_modules/vite/bin/vite.js --configLoader runner --host 127.0.0.1 --port 5174 --strictPort
```

Build with `npm run build`. Keep the explicit preview port to avoid conflicting with the original site's server.

Browser checks used emulated viewports and Chrome ANGLE SwiftShader, not physical phone/tablet GPUs. The actual normal loader run took about 15.18 seconds on that software renderer; a JavaScript timeout cannot preempt synchronous GPU-driver work. The delayed-asset run exited via fallback. This is a verified quality-preserving optimization pass, not a universal FPS, load-time or lag-free guarantee. Test the production build on target devices and real network conditions before deployment.

## Follow-up: circle opening and black-hole performance

The reported slow sections revealed hidden work that the first pass had not removed:

- The corridor continued drawing after its canvas became invisible. It now keeps its camera/state updates but skips hidden GPU submission.
- At timeline 0.738 the opaque blackout (z6) completely covers the market camera's stacking context (z5). The hand circle opens above both (z7). Camera pose/projection updates remain intact for the pupil latch and reverse scroll, but the covered camera no longer draws.
- Hidden intro props skip layout measurements and projection/DOM writes. Their first visible frame still derives from the current camera and clock.
- The resting black hole, flight sky and ship stop drawing when their canvases/ancestors are fully hidden. Every nonzero visible fade still renders. Projects contributes its existing clock advance without issuing a second black-hole render alongside the shared ticker.
- Black-hole uniform uploads are cached per actual GL location and value. Mutable configuration colors, runtime grades, camera state and resizing remain supported; shader arithmetic and all artistic values are unchanged.
- The existing source-hand framebuffer targets are allocated during loader preparation, with one target per task and exact framebuffer/viewport/scissor restoration. No new target, downscale or reduced-quality mode was added.

Repeatable Node checks: `node tools/verify-uniform-cache-optimized.cjs` and `node tools/verify-lifecycle-optimized.cjs`. They pass: 91 effective GPU draw states matched the original across configuration/color/grade/resize changes, with 532 uniform uploads reduced to 153 in that fixture; hidden draws and props' layout reads drop to zero, and clocks/poses/reentry/buffer dimensions remain identical. The reference scroll-pacing check and production build also pass. These operation counts are not hardware FPS measurements.

`node tools/verify-source-warm-optimized.cjs` passes 20 preparation cases, including original target dimensions, memoization, per-task allocation, disposal, allocation errors, custom viewport/scissor state and live state changes between tasks.

Browser follow-up: the circle-opening sample at timeline ~0.758 is pixel-identical to the original (zero changed pixels), with identical canvas dimensions and 21 checked shader/model/config/motion hashes. Normalized observed draw submissions fell from 33 to 11 per source-stage presentation (66.7% fewer): covered camera and corridor draws are gone, while the visible source stage retains all 11 draws. Report: `shots-zero-stage/blackhole-optimized/after-report.json`.

The separate settled Gargantua/ship browser comparison did not complete: the original site's software-rendered portal/ship readiness exceeded the 60-second test timeout. It is not reported as a visual pass. Black-hole effective-uniform/state, lifecycle, reentry and size equivalence are covered by the passing Node tests above; physical-device FPS remains unverified.
