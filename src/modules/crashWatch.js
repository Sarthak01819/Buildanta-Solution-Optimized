/**
 * CRASH WATCH — the site records its own death on a phone.
 *
 * Yash's phone crashes after WE MARKET. I cannot open his phone, and headless
 * has no real memory limit so it cannot reproduce it: a full phone-viewport
 * run at DPR 3 held only 2.47 Mpx and lost nothing. Every route I control is
 * blind, which is exactly the situation that cost most of today when I guessed
 * instead of measuring.
 *
 * So the page writes the evidence down BEFORE it dies. A browser that kills a
 * tab for memory does not run any more of our JavaScript — but localStorage
 * written a moment earlier survives, and is there on the next load.
 *
 * WHAT IT CATCHES, and why each one matters:
 *
 *   webglcontextlost   The prime suspect. Mobile browsers reclaim WebGL
 *                      contexts under pressure, and losing one mid-scene takes
 *                      the tab with it. This site runs SIX contexts, and the
 *                      crash lands exactly where a seventh becomes active.
 *                      Recorded with the canvas name and scroll position, so
 *                      the report says WHICH scene and WHERE.
 *   memory growth      Chrome-family only (performance.memory). A steady climb
 *                      to a ceiling is a leak; a sudden spike is one scene.
 *   the last position  Written continuously, so even a kill with no event at
 *                      all still leaves "he got to 63% and vanished".
 *
 * ⚠️ Writes SYNCHRONOUSLY on the context-lost event. That handler may be the
 * last code this page ever runs — there is no time for a debounce, a rAF, or
 * a queue. It is a few hundred bytes, once, at the only moment it matters.
 *
 * ⚠️ Obeys vault M12: the per-frame path reads NOTHING from the DOM. Scroll
 * comes from a passive listener into a plain variable; a getBoundingClientRect
 * or scrollY read per frame would make this the cause of the next problem.
 *
 * REMOVE once the crash is understood: delete this file and its call in main.js.
 */

const KEY = 'buildanta-crash';

export function mountCrashWatch() {
  let pct = 0, docH = 1;
  const onScroll = () => {
    docH = Math.max(1, document.body.scrollHeight - window.innerHeight);
    pct = Math.round((window.scrollY / docH) * 100);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();

  const started = Date.now();
  const log = [];

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  };
  const write = (extra) => {
    try {
      const prev = read();
      localStorage.setItem(KEY, JSON.stringify({
        ...prev,
        ...extra,
        lastSeenPct: pct,
        secondsAlive: Math.round((Date.now() - started) / 1000),
        screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
        ua: navigator.userAgent.slice(0, 100),
        events: (prev.events || []).concat(log).slice(-25),
      }));
      log.length = 0;
    } catch { /* private mode, or storage full — nothing useful to do */ }
  };

  /* ⚠️ FREEZE IT BEFORE THIS SESSION TOUCHES IT. write() merges into the same
     record, so the new page's own numbers — secondsAlive 0, its fresh canvas
     count — were overwriting the crashed session's within moments of loading,
     and the report showed the survivor's readings under the victim's heading.
     The crashed record is moved aside intact and the live key started clean.
     ⚠️ AND IT MUST RUN BEFORE THE FIRST sample(): the first version sat below
     it and was polluted by the very first write of the new session — which is
     exactly the bug it was written to prevent, one line too late. */
  const prev = (() => {
    const r = read();
    if (r && r.verdict && r.verdict !== 'left normally') {
      try {
        localStorage.setItem(KEY + '-last', JSON.stringify(r));
        localStorage.removeItem(KEY);
      } catch { /* ignore */ }
      return r;
    }
    try { return JSON.parse(localStorage.getItem(KEY + '-last') || 'null'); }
    catch { return null; }
  })();

  /* ── the prime suspect ──────────────────────────────────────────────────
     Every WebGL canvas, including ones created later, gets watched. Patching
     getContext is the only way to catch canvases this module never sees. */
  const seen = new WeakSet();
  const watch = (canvas) => {
    if (!canvas || seen.has(canvas)) return;
    seen.add(canvas);
    const name = canvas.id || canvas.className || 'anon';
    canvas.addEventListener('webglcontextlost', () => {
      /* Synchronous. This may be the last thing that runs. */
      log.push(`LOST ${name} @${pct}% t+${Math.round((Date.now() - started) / 1000)}s`);
      write({ verdict: 'webgl context lost', lostOn: name, lostAtPct: pct });
    });
    canvas.addEventListener('webglcontextrestored', () => {
      log.push(`restored ${name} @${pct}%`);
      write({});
    });
  };

  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && /webgl/i.test(String(type))) watch(this);
    return ctx;
  };
  document.querySelectorAll('canvas').forEach(watch);

  /* ── memory, where the browser will admit to it ─────────────────────── */
  let peakMb = 0;
  const sample = () => {
    const m = performance.memory;
    if (m) {
      const mb = Math.round(m.usedJSHeapSize / 1048576);
      if (mb > peakMb) peakMb = mb;
    }
    /* canvas buffers are the part WE control, and they are not in the heap */
    let mpx = 0;
    for (const c of document.querySelectorAll('canvas')) mpx += (c.width * c.height) / 1e6;
    write({ peakHeapMb: peakMb || null, canvasMpx: +mpx.toFixed(2) });
  };
  setInterval(sample, 3000);
  sample();

  addEventListener('pagehide', () => write({ verdict: read().verdict || 'left normally' }));

  /* ── SURFACE IT ON SCREEN, NOT IN THE CONSOLE ────────────────────────────
     The record lives in the PHONE's storage, which I cannot reach — I can only
     read the Mac's browser. A console.warn is invisible on a phone, so the
     evidence would have been written perfectly and never seen by anyone. It is
     printed as large TEXT instead, so one photo carries the whole answer. Same
     lesson as the colour work: text survives a camera, nothing else does. */
  if (prev && prev.verdict && prev.verdict !== 'left normally') {
    console.warn('[crash-watch] previous session ended badly:', prev);
    const show = () => {
      const box = document.createElement('div');
      box.style.cssText =
        'position:fixed;left:0;right:0;top:0;z-index:100000;background:#1a0f0c;color:#fff;' +
        'font:500 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:14px 16px;' +
        'border-bottom:2px solid #ba3f2c;max-height:60vh;overflow:auto;-webkit-overflow-scrolling:touch';
      const rows = [
        ['what happened', prev.verdict],
        ['which scene', prev.lostOn || '—'],
        ['how far in', (prev.lostAtPct ?? prev.lastSeenPct) + '%'],
        ['seconds alive', prev.secondsAlive],
        ['canvas Mpx', prev.canvasMpx],
        ['peak heap MB', prev.peakHeapMb ?? 'n/a'],
        ['screen', prev.screen],
      ];
      box.innerHTML =
        '<div style="color:#ff9a7d;letter-spacing:.14em;font-size:11px;margin-bottom:8px">' +
        'LAST SESSION ENDED BADLY — PHOTOGRAPH THIS</div>' +
        rows.map(([k, v]) =>
          `<div><span style="color:#a89088;display:inline-block;min-width:118px">${k}</span>${v}</div>`).join('') +
        (prev.events && prev.events.length
          ? '<div style="margin-top:8px;color:#a89088">' + prev.events.slice(-6).join('<br>') + '</div>' : '') +
        '<button style="margin-top:12px;background:#ba3f2c;color:#fff;border:0;border-radius:6px;' +
        'padding:10px 16px;font:inherit;min-height:44px">Dismiss and clear</button>';
      box.querySelector('button').addEventListener('click', () => {
        try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '-last'); } catch { /* ignore */ }
        box.remove();
      });
      document.body.appendChild(box);
    };
    if (document.body) show();
    else addEventListener('DOMContentLoaded', show, { once: true });
  }
  return {
    dump: () => read(),
    last: () => { try { return JSON.parse(localStorage.getItem(KEY + '-last') || 'null'); } catch { return null; } },
    clear: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '-last'); } catch { /* ignore */ } },
  };
}
