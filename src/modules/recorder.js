/**
 * TEMPORARY — records the site's own worst frames, so the judder can be
 * measured without Yash having to report anything.
 *
 * Why it exists: frame rate cannot be read remotely. A Chrome tab that is not
 * the one being looked at has requestAnimationFrame suspended outright, so
 * driving his browser returns nothing (tried twice; both attempts hung). And a
 * headless browser has no GPU — its ~720ms software floor swamps everything in
 * ACT 01, which is why hiding the entire orb canvas changed frame time by 1%
 * there. Between them, every measurement route I control is blind to this bug.
 *
 * localStorage is the way through: it survives the tab going idle and CAN be
 * read from a hidden tab. So the page measures itself while he simply uses it,
 * and the numbers are collected afterwards.
 *
 * WHAT IT CAPTURES: the twelve worst frames, each with the scroll position it
 * happened at — because "where" is the whole question. If the worst frames
 * cluster at ACT 01's core formation, it is a stall and the number says how
 * big. If nothing exceeds ~30ms while he can plainly see it juddering, it is
 * not a stall at all and I have been solving the wrong category.
 *
 * ⚠️ Obeys its own rule (vault M12): this runs inside the frame loop, so it
 * reads NOTHING from the DOM. Scroll position is captured by a passive
 * listener into a plain variable; reading window.scrollY here would force a
 * layout every frame and the recorder would become the very thing it is
 * measuring.
 *
 * REMOVE once the cause is found: delete this file and its call in main.js.
 */

const KEY = 'buildanta-frames';
const KEEP = 12;

export function mountRecorder() {
  let y = 0, docH = 1;
  /* passive, event-driven — never read in the frame loop */
  const onScroll = () => {
    y = window.scrollY || 0;
    docH = Math.max(1, document.body.scrollHeight - window.innerHeight);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();

  const worst = [];
  let frames = 0, over33 = 0, over100 = 0, started = performance.now();
  let last = started, n = 0;

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        at: new Date().toISOString(),
        seconds: Math.round((performance.now() - started) / 1000),
        frames,
        fps: Math.round(frames / Math.max(1, (performance.now() - started) / 1000)),
        over33, over100,
        screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
        worst: worst.slice(0, KEEP).map((w) => ({ ms: Math.round(w.ms), pct: +w.pct.toFixed(1) })),
      }));
    } catch { /* private mode — nothing to do */ }
  };

  const tick = () => {
    const now = performance.now();
    const dt = now - last; last = now;
    n++;
    if (n > 10) {                       // skip boot, which is not what he is reporting
      frames++;
      if (dt > 33) over33++;
      if (dt > 100) over100++;
      if (dt > 20 && (worst.length < KEEP || dt > worst[worst.length - 1].ms)) {
        worst.push({ ms: dt, pct: (y / docH) * 100 });
        worst.sort((a, b) => b.ms - a.ms);
        worst.length = Math.min(worst.length, KEEP);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  setInterval(save, 2000);
  addEventListener('pagehide', save);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}
