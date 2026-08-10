/**
 * CRASH WATCH — the site records its own death on a phone.
 *
 * ⚠️ NOT MOUNTED. Yash confirmed the phone crash fixed on 10 Aug 2026, so the
 * mount was removed from main.js — this file is kept because Vite does not
 * bundle an unimported module (it costs the shipped site nothing) and because
 * it is the only instrument that ever produced honest evidence from a device I
 * cannot open. RE-ARM by restoring two lines in main.js: the import, and
 * `try { window.__crash = mountCrashWatch(); } catch (e) {}` placed FIRST,
 * before anything can die. Reads/writes localStorage key `buildanta-crash`.
 *
 * ⚠️ It shows a large red panel to whoever loads the site next, so it must
 * never be left mounted on a build a client or prospect might open.
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

  /* ── READ THE LAST SESSION, ONCE, THEN START CLEAN ──
     Kept deliberately dumb after two failed attempts at something cleverer.
     The earlier version shuffled the record between two keys and I could not
     keep straight which one the panel was reading — it captured the data
     perfectly and then showed nothing, twice, which is worse than not
     recording at all.
     Now: read the single key into memory, wipe it, and everything from here
     writes a fresh record for THIS session. `prev` is a plain snapshot that
     nothing can overwrite because it is no longer in storage.
     A verdict of 'running' means the last session never got to say goodbye —
     no pagehide, no context-lost event — which is exactly what an iOS memory
     kill looks like from the inside: the process simply stops. */
  const prev = (() => {
    let r = null;
    try { r = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { r = null; }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    return r;
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
    /* ⚠️ MARK IT RUNNING. The panel used to appear only when a `verdict` had
       been written — and a verdict was only written by webglcontextlost or
       pagehide. But an iOS memory kill runs NEITHER: the tab process is
       terminated outright with no JavaScript at all. So the one failure I most
       need to see was the one case that left no verdict and showed no panel,
       which is exactly what Yash hit. A session that is alive says so on every
       sample; if the next load finds "running", the tab was killed. */
    write({ verdict: 'running', peakHeapMb: peakMb || null, canvasMpx: +mpx.toFixed(2) });
  };
  let sampler = setInterval(sample, 3000);
  sample();

  const leaving = () => {
    /* ⚠️ STOP SAMPLING FIRST. The 3s sampler writes verdict:'running', so a
       tick landing after this handler would re-mark a perfectly clean exit as
       a kill — and the next load would cry wolf. Measured exactly that. */
    clearInterval(sampler);
    sampler = null;
    const v = read().verdict;
    /* keep a real crash verdict; otherwise this was an ordinary exit */
    write({ verdict: (v && v !== 'running') ? v : 'left normally' });
  };
  addEventListener('pagehide', leaving);

  /* ⚠️ pagehide ALONE OVER-REPORTS ON iOS. Yash's first crash record said the
     tab was killed 3 seconds in at 0% scroll — before the site had done
     anything worth blaming. iOS Safari does not fire pagehide dependably when
     the reload button is tapped or when a backgrounded tab is later purged, so
     an ordinary reload was being filed as a kill and pointed the whole
     investigation at the entrance, which turned out to be innocent.

     visibilitychange->hidden DOES fire in those cases, and always precedes a
     real background kill, so treating it as a clean exit costs nothing: a tab
     that is terminated while VISIBLE — the actual failure — still leaves
     'running' behind and still raises the panel. */
  /* ⚠️ ON `document`, NOT window. visibilitychange is dispatched at the Document
     and only reaches window by bubbling — which real browsers do, but it made
     the listener depend on a detail that is easy to lose and impossible to see
     failing. Registered at the target it is actually fired on. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { leaving(); return; }
    /* ⚠️ AND RESUME ON RETURN. leaving() stops the sampler, so without this the
       recorder would go permanently deaf the first time Yash switched apps —
       every later crash would read as 'left normally'. Restart it and mark the
       session live again, so the window after he comes back is watched too. */
    if (!sampler) { sampler = setInterval(sample, 3000); sample(); }
  });

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
        ['what happened', prev.verdict === 'running'
          ? 'KILLED — tab terminated with no warning' : prev.verdict],
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
