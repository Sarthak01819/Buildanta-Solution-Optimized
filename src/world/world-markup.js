// The markup the world needs, as a string, for hosts that do not have it.
//
// Standalone this lives in index.html and this module is never used. The
// Buildanta site has no such markup — it has a black hole and an Endurance —
// so it injects this into whatever container it wants the world to occupy.
//
// Kept in ONE place deliberately. The alternative is the site hand-writing its
// own copy of these six elements, which drifts the moment either side changes
// an id, and the failure mode is a silent null from querySelector rather than
// anything that looks like a mistake.
//
// What each element is for, since none of it is decoration:
//   #world-status  the scene can retire itself on a weak device; a silent swap
//                  to a 58-item list has to be announced to a screen reader
//   #index-close   the way out of the index, which must exist in the MARKUP so
//                  it is there even when the scene never mounts
//   #work          the crawlable index — 58 real anchors, rendered first, and
//                  the whole page when WebGL is unavailable or reduced-motion
//   #world-gl      the canvas. NOT #gl — the Buildanta site has its own, and
//                  two stylesheets matching both canvases meant the world hid
//                  the site scene. An id that lives in someone else page has
//                  to be namespaced.
//   #recentre      back to the origin of a grid that wraps forever
//
// The nav is optional: the host usually has its own. Pass includeNav only if
// the world is meant to supply Index/Projects links itself.
export function worldMarkup({ includeNav = false } = {}) {
  return `
    ${includeNav ? `
    <nav class="world-nav" aria-label="Work">
      <a class="js-index" href="#work">Index</a>
      <a class="js-index" href="#work">Projects</a>
    </nav>` : ''}
    <p id="world-status" class="sr" role="status" aria-live="polite"></p>
    <button id="index-close" type="button" hidden>← Back to the world</button>
    <section id="work" class="world-grid" aria-label="All work"></section>
    <button id="recentre" type="button">← Back to start</button>
    <canvas id="world-gl" aria-hidden="true"></canvas>
  `
}

// Inject and hand back the container, so a host can do this in one line.
export function injectWorldMarkup(container, opts) {
  container.innerHTML = worldMarkup(opts)
  return container
}
