/**
 * Should this renderer ask the driver for multisampling?
 *
 * ── WHY THIS EXISTS ──
 * Measured on a 430x932@3 iPhone viewport, with every context the site keeps
 * alive at once:
 *
 *     intro__gl        860x1864   MSAA 4x   ~36.7 MB
 *     bh-canvas       1864x1864   no AA     ~26.5 MB
 *     anon             645x1398   no AA     ~ 6.9 MB
 *     finale-ship       300x150   MSAA 4x   ~ 1.0 MB
 *     ...
 *     7 contexts, drawing buffers alone     ~71 MB
 *
 * That 71 MB sits ON TOP of ~70 MB of textures, before the JS heap and decoded
 * images. Yash's iPhone recorded a genuine kill — terminated while visible at
 * 56% scroll, no context-loss event, which is the signature of the OS reclaiming
 * the tab rather than the page failing.
 *
 * MSAA is the cheapest thing to give up. It quadruples the colour buffer to
 * smooth edges that a 3x display is already resolving below the eye's ability
 * to see them. On intro__gl alone it is the difference between 36.7 MB and
 * ~13.8 MB.
 *
 * Desktop keeps it, in full, always — Yash's rule is full quality there and
 * "a crash beats any quality rule" only on phones. Gated on a coarse pointer,
 * so a mouse never reaches this path.
 *
 * ⚠️ Read at renderer construction, which is the only time WebGL will honour
 * it: context attributes are immutable once the context exists. Changing the
 * pointer type later (devtools emulation) needs a reload, not a resize.
 */
export const wantsAA = () => !(
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
);
