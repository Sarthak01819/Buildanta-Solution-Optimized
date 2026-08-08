/**
 * `?diag=1` — makes the visitor's own machine report what it is really doing.
 *
 * Why this exists: four rounds were spent guessing why the site looks peach on
 * one screen and grey on another. Screenshots read oversaturated (macOS tags
 * them Display P3), camera photos read washed out, and a headless browser has
 * neither a GPU nor a wide-gamut buffer, so nothing here could settle it.
 *
 * Measured from Yash's photo of the MacBook Air: the ground reads 4.6%
 * saturation where this machine renders 56%. The neutral references in the
 * same photo — browser chrome 3.3%, bezel 6.5% — came out neutral, so the
 * camera was NOT stripping colour. The colour really is missing on that
 * screen, and a gamut difference is far too small to explain it.
 *
 * So: print the numbers as TEXT, large. Text survives any camera, any screen
 * and any colour pipeline — which is exactly what every image in this
 * investigation failed to do. One photo of this panel answers, for that
 * specific machine: what colour was asked for, what the browser resolved it
 * to, whether the live orb is running or the still image is, and which gamut
 * the canvas got.
 *
 * Deliberately plain DOM on a flat dark ground: no canvas, no blend mode, no
 * filter. Nothing here may be subject to the thing being measured.
 */

const row = (k, v, big = false) =>
  `<div style="display:flex;gap:14px;align-items:baseline;padding:7px 0;border-bottom:1px solid #333">
     <span style="flex:0 0 190px;color:#888;font-size:13px">${k}</span>
     <span style="color:#fff;font-size:${big ? 25 : 16}px;font-weight:${big ? 700 : 400};word-break:break-all">${v}</span>
   </div>`;

export function mountDiag() {
  if (new URLSearchParams(location.search).get('diag') !== '1') return;

  const read = () => {
    const intro = document.querySelector('#intro');
    const cs = intro ? getComputedStyle(intro) : null;
    const asked = cs ? cs.getPropertyValue('--paper').trim() : '(no #intro)';

    /* What the browser actually PAINTS. getComputedStyle just echoes the
       color() string back, which only proves it parsed — it says nothing
       about the numbers that reach the panel. Painting the colour into a 2D
       canvas and reading the pixel back gives the real values, and doing it
       twice (once in plain sRGB, once wide) shows whether this machine
       distinguishes the two gamuts at all. If both come back identical, the
       whole wide-gamut path is doing nothing here and the cause is elsewhere. */
    const swatch = (css, space) => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const ctx = c.getContext('2d', space ? { colorSpace: space } : undefined);
        if (!ctx) return '(no 2d ctx)';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      } catch (e) { return 'FAILED: ' + (e?.message || e); }
    };
    const resolved = swatch(asked);
    const plain = swatch('#fac1b2');

    /* is the live orb running, or did it fall back to the still image? */
    const orbCanvas = document.querySelector('.intro__orbHero');
    let orb = 'no canvas — STILL IMAGE', buf = '(n/a)';
    if (orbCanvas) {
      const gl = orbCanvas.getContext('webgl2') || orbCanvas.getContext('webgl');
      if (gl) {
        orb = orbCanvas.width > 1 ? `live, ${orbCanvas.width}x${orbCanvas.height}` : 'live but asleep';
        buf = gl.drawingBufferColorSpace || 'srgb (default)';
        if (!(gl instanceof WebGL2RenderingContext)) orb += ' — WebGL1 ONLY';
        else if (!gl.getExtension('EXT_color_buffer_float')) orb += ' — NO FLOAT TARGETS';
      } else orb = 'canvas present, NO CONTEXT';
    }

    return { asked, resolved, plain, orb, buf };
  };

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#111;color:#fff;overflow:auto;' +
    'padding:26px 22px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;';
  document.body.appendChild(panel);

  /* Real frame rate, on the real machine. This is the one number no harness
     here can produce: a headless browser draws with the processor, where a
     scene that runs at 60fps on a real GPU measures 1.5 — so every frame-rate
     figure I could generate would be fiction (vault V11). Reported as text so
     a photo of it is evidence.
     Worst-frame matters more than the average: 60fps with one 300ms stall in
     it is exactly what "laggy" means, and an average hides it completely. */
  let fps = 0, worst = 0, frames = 0, mark = performance.now(), last = mark;
  (function tick() {
    const now = performance.now();
    const dt = now - last; last = now;
    if (frames > 5 && dt > worst) worst = dt;    // ignore the first frames, which include boot
    frames++;
    if (now - mark >= 1000) { fps = Math.round((frames * 1000) / (now - mark)); frames = 0; mark = now; }
    requestAnimationFrame(tick);
  })();

  const paint = () => {
    const d = read();
    panel.innerHTML =
      `<div style="font-size:12px;letter-spacing:.18em;color:#888;margin-bottom:4px">BUILDANTA · DIAGNOSTIC</div>
       <div style="font-size:15px;color:#bbb;margin-bottom:20px">Scroll the site first, then come back here so the numbers reflect real use. Photograph this screen and send it &mdash; the words carry the answer, not the colours.</div>` +
      row('Frames per second', fps ? String(fps) : 'measuring…', true) +
      row('Worst frame', worst ? Math.round(worst) + ' ms' + (worst > 100 ? '   <-- a visible stall' : '') : '—', true) +
      row('Colour asked for', d.asked) +
      row('Wide-gamut paints', d.resolved, true) +
      row('Plain hex paints', d.plain, true) +
      row('Orb', d.orb) +
      row('Canvas gamut', d.buf) +
      row('Screen is wide-gamut', matchMedia('(color-gamut: p3)').matches ? 'YES — p3' : 'no — srgb only', true) +
      row('color() supported', CSS.supports('color', 'color(display-p3 1 1 1)') ? 'yes' : 'NO') +
      row('Pixel ratio', String(devicePixelRatio)) +
      row('Screen', `${screen.width}x${screen.height}`) +
      row('Browser', navigator.userAgent.slice(0, 72)) +
      `<div style="margin-top:22px;display:flex;gap:0;height:78px;border:1px solid #444">
         <div style="flex:1;background:#fac1b2"></div>
         <div style="flex:1;background:color(display-p3 0.981 0.756 0.699)"></div>
         <div style="flex:1;background:#ba3f2c"></div>
         <div style="flex:1;background:color(display-p3 0.729 0.247 0.173)"></div>
       </div>
       <div style="font-size:13px;color:#888;margin-top:7px">
         Four patches: plain / wide-gamut / plain / wide-gamut. If patches 1 and 2 look
         identical to you, this screen is not showing wide-gamut colour.
       </div>`;
  };

  paint();
  setInterval(paint, 1000);   // live, so the numbers settle while he watches
}
