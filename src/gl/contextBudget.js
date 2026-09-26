/**
 * WEBGL CONTEXT BUDGET — phones & tablets only (D-116, 26 Sep 2026).
 *
 * Chromium on Android (Chrome, Brave, …) allows only 8 live WebGL contexts
 * per page (16 on desktop). Creating a 9th silently kills the one that has
 * gone longest without drawing — the "broken canvas" (white + x_x icon) the
 * client filmed on an Infinix GT 10 Pro. This site creates 9 at boot, the
 * TAP & HOLD portal adds a 10th and Projects adds 2 more, so on a phone the
 * victim was whichever scene was idle — the 0 BZ black hole, the ship.
 * Evicted contexts only come back when the garbage collector happens to
 * free another one, i.e. at random, seconds later.
 *
 * This module keeps the count under the limit ITSELF, deterministically:
 *   · the three.js scenes that belong to one part of the film are switched
 *     OFF (WEBGL_lose_context.loseContext — frees the slot at once) while the
 *     visitor is elsewhere, and back ON (restoreContext) just before they are
 *     needed. three.js rebuilds a restored context on its own (it re-uploads
 *     and recompiles on the next render), and draws nothing while lost.
 *   · the raw-WebGL black holes (Gargantua beat, TAP & HOLD portal, contact
 *     room window, flight sky) are never touched — they cannot rebuild.
 *   · before any NEW context is created at a full budget, an idle scene is
 *     switched off first, so Chromium never has to pick a victim.
 *
 * Which scene draws where was MEASURED (p = intro progress, s = BZ section):
 *   corridor  intro__gl          p 0–.45        s0
 *   orb       intro__orbHero     p 0–.23        s0
 *   camera    market-camera3d    p .55–.73      s1
 *   hands     …__hand-canvas     p .70–.93      s1 end, s2 (+ bill-portal still)
 *   bill      …__burning-franklin p .70, .95–1  s1 end, s2 end, wall
 *   ship      finale-ship        after the ride s4
 * Each is kept alive one section either side, so it is back before it shows.
 *
 * Desktop is untouched unless the URL has ?ctxbudget (for testing with
 * Chrome's --max-active-webgl-contexts=8, which reproduces a phone exactly).
 */
const ON = typeof window !== "undefined" && (
  matchMedia("(pointer: coarse)").matches || /[?&]ctxbudget\b/.test(location.search));

const HARD_LIMIT = 8;   // Chromium Android
const TARGET = 7;       // one spare slot for probes / the next scene

/* section index -> is this scene needed (with one section of margin) */
const MANAGED = [
  { key: "corridor", match: "intro__gl",                 need: (s) => s <= 1 },
  { key: "orb",      match: "intro__orbHero",            need: (s) => s === 0 },
  { key: "camera",   match: "market-camera3d",           need: (s) => s <= 2 },
  { key: "hands",    match: "consult-zero__hand-canvas", need: (s) => s >= 1 && s <= 3 },
  { key: "bill",     match: "intro__burning-franklin",   need: (s) => s >= 1 && s <= 3 },
  { key: "ship",     match: "finale-ship",               need: (s) => s >= 3 },
];

const entries = [];      // { canvas, gl, ext, name, spec, off, since }
let getSection = () => 0;
let installed = false;

const nameOf = (c) =>
  String((typeof c.className === "string" && c.className) || c.parentElement?.className || "")
    .split(" ")[0];
const live = () => entries.filter((e) => !e.gl.isContextLost()).length;

function switchOff(e) {
  if (e.off || !e.ext || e.gl.isContextLost()) return false;
  try { e.ext.loseContext(); e.off = true; e.since = performance.now(); return true; }
  catch { return false; }
}
function switchOn(e) {
  if (!e.off || !e.ext) return;
  try { e.ext.restoreContext(); } catch { /* not restorable: leave it */ }
  e.off = false;
  e.since = performance.now();
}

/** Switch off the idle managed scene(s) until `room` slots are free. */
function makeRoom(room, section) {
  const idle = entries
    .filter((e) => e.spec && !e.off && !e.gl.isContextLost() && !e.spec.need(section))
    // never kill a scene in the same tick it was created or restored
    .filter((e) => performance.now() - e.since > 400)
    .sort((a, b) => a.since - b.since);
  for (const e of idle) {
    if (live() + room <= HARD_LIMIT) break;
    switchOff(e);
  }
}

function reconcile() {
  const s = getSection();
  /* Canvases that have LEFT the page still hold a slot until the garbage
     collector runs: the Projects world's WebGL probe (world-app.js creates
     one per mount and never releases it) and the world's own canvas after
     "Leave the world". Release them for good once detached for a moment. */
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.canvas.isConnected) { e.detachedAt = 0; continue; }
    e.detachedAt ||= performance.now();
    if (performance.now() - e.detachedAt > 1500) {
      if (!e.gl.isContextLost()) { try { e.ext?.loseContext(); } catch { /* ignore */ } }
      entries.splice(i, 1);
    }
  }
  // off first, so turning something on never overshoots
  for (const e of entries) {
    if (e.spec && !e.spec.need(s) && performance.now() - e.since > 400) switchOff(e);
  }
  for (const e of entries) {
    if (e.spec && e.off && e.spec.need(s) && live() < TARGET) switchOn(e);
  }
}

export function installContextBudget() {
  if (!ON || installed) return;
  installed = true;
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const isGL = /webgl/i.test(String(type));
    const known = isGL && entries.some((e) => e.canvas === this);
    // a NEW context at a full budget: free a slot BEFORE Chromium picks a victim
    if (isGL && !known && live() >= HARD_LIMIT - 1) makeRoom(2, getSection());
    const gl = orig.call(this, type, ...rest);
    if (gl && isGL && !known) {
      const name = nameOf(this);
      const spec = MANAGED.find((m) => name === m.match) || null;
      let ext = null;
      try { ext = gl.getExtension("WEBGL_lose_context"); } catch { /* none */ }
      entries.push({ canvas: this, gl, ext, name, spec, off: false, since: performance.now() });
    }
    return gl;
  };
  setInterval(reconcile, 250);
}

/** Called once the intro exists: where in the film the visitor is. */
export function attachContextBudget(sectionFn) {
  if (!ON) return;
  getSection = () => { try { return sectionFn() ?? 0; } catch { return 0; } };
  if (import.meta.env?.DEV) {
    window.__ctxBudget = {
      state: () => entries.map((e) => `${e.name || "anon"}${e.spec ? "" : "*"} ${e.off ? "OFF" : e.gl.isContextLost() ? "LOST" : "on"}`),
      section: () => getSection(),
    };
  }
}

// installed at import time: this module is imported FIRST by main.js
installContextBudget();
