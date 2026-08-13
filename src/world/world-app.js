import './style.scoped.css'

// The CMS build's output, not a copy bundled beside the code.
//
// This imported ./world.json — a snapshot taken the day the world was proven in
// a copy. It kept rendering "Placeholder 24" long after the CMS knew the project
// as Panchratna Jewellers, and nothing said so: the file was there, it parsed,
// it had 58 entries. Two sources of truth where one is silently stale is worse
// than one source that is missing, because missing is loud.
//
// services.js already reads ../../content/site.json from the same build. This is
// the other half.
import rawItems from '../../content/world.json'

// The standalone world serves its media from /art/; the site scopes it under
// /world/art/ so it cannot collide with the site's own assets. Kept as a no-op
// for paths the build already wrote scoped.
const items = rawItems.map((i) => (
  i.file ? { ...i, file: i.file.replace(/^\/art\//, '/world/art/') } : i
))
import { mountDomGrid } from './dom-grid.js'
import { WorldGrid } from './world/grid.js'
import { Hover } from './world/interaction/hover.js'
import { DetailsPanel } from './world/interaction/details.js'
import { ProjectSteps } from './world/interaction/step.js'
import { OpenCard } from './world/interaction/open.js'
import { Governor } from './world/governor.js'
import { ProjectPage, routeOf } from './project-page.js'
import * as K from './constants.js'

// The world, as something that can be mounted into a page it does not own.
//
// It used to be a top-level script that assumed it WAS the page. That is still
// exactly what happens standalone — main.js calls this with the document — but
// the Buildanta site needs to drop the world inside a container of its own,
// next to a black hole and an Endurance, so the assumption had to become an
// argument.
export function createWorld({ host = document, mountRoot = document.body } = {}) {
  const root = document.documentElement
    // Scoped to the host, not to the document.
    //
    // Standalone the world owns the page, so host IS the document and every
    // lookup behaves exactly as before. Embedded in the Buildanta site it must
    // not: that site relocates its own #contact into <body> in finale mode, and
    // two things both reaching for the body is where a subtle breakage comes
    // from. `root` stays documentElement on purpose — the state classes it sets
    // (world-open, world-index, world-project) are read by CSS that has to win
    // over whatever the host page is doing.
    const q = (sel) => host.querySelector(sel)
    const gridEl = q('.world-grid')
    const canvas = q('#world-gl')
    const recentreBtn = q('#recentre')
    const statusEl = q('#world-status')

  // 1 — the DOM index, always, before anything else runs.
  mountDomGrid(gridEl, items)

  // The project pages answer the #/work/<slug> links every item already carried.
  // Built before the scene: they are the site's actual content, and they must
  // work on a device where the scene never mounts at all.
  const projectPage = new ProjectPage({
      items,
      root: mountRoot,
    onClose: () => { route() }
  })

  // One router, one source of truth: the hash. Clicking the open card, the
  // details CTA, an index link, a "next project" link and the browser's own back
  // button all end up here, so there is no second path that can disagree.
  function route() {
    const slug = routeOf()
    if (slug && projectPage.show(slug)) {
      // Nothing to render behind a full-page article. The scene is PAUSED, not
      // torn down — a remount costs a full rebuild and shader compile, which is
      // exactly the stall you would feel on the way back.
      paused = true
      return
    }
    projectPage.hide()
    paused = false
    // Leaving a page mid-scroll leaves the world's pointer maths measured against
    // the wrong origin.
    if (!slug) scrollTo({ top: 0, behavior: 'auto' })
  }
  addEventListener('hashchange', route)

  // 2 — decide whether the scene is allowed to mount at all.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const weakDevice =
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)

  // localStorage throws, not returns null, in a sandboxed frame or with
  // third-party storage blocked — and an uncaught throw here kills the whole page
  // before the scene ever mounts.
  const store = {
    get(k) { try { return localStorage.getItem(k) } catch { return null } },
    set(k, v) { try { localStorage.setItem(k, v) } catch {} }
  }

  const stored = store.get('world-lite')
  let lite = stored === null ? Boolean(weakDevice) : stored === '1'

  const supportsWebGL = (() => {
    try {
      const c = document.createElement('canvas')
      return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return false
    }
  })()

  let world = null
  let hover = null
  let details = null
  let steps = null
  let onIndexOpen
  let indexWatch
  let onIndexFocus
  let onIndexClose
  let onIndexKey
  let onIndexActivate = null
  let opener = null
  let governor = null
  let raf = 0
  let paused = false
  let last = 0

  function setLite(next) {
    lite = next
    store.set('world-lite', lite ? '1' : '0')
  }

  function mount() {
    if (world || lite || reduced || !supportsWebGL) return

    world = new WorldGrid({ canvas, items })
    resize()

    hover = new Hover({ world, mountRoot })
    // root: the world's own mount root, NOT document.body.
    //
    // Embedded, body is the HOST page's. The panel landed there at z-index 46
    // while the world host sits at 520, so the host's canvas painted straight
    // over it — the prev/next hands were rendered every frame, underneath the
    // scene. The DOM said loaded, sized, visible, opacity 1, and the pixels
    // showed nothing, which is why three rounds of checking missed it.
    details = new DetailsPanel({ world, root: mountRoot })
    opener = new OpenCard({ world, hover, details, scanlines: world.post.scanlines })
    steps = new ProjectSteps({ world, open: opener })
    opener.steps = steps
    details.bind(steps, opener)

    // Activating a card in the DOM index opens it in the scene — which is the
    // keyboard's way in, and stops 58 anchors pointing at pages that do not exist.
    onIndexActivate = (e) => {
      const a = e.target.closest?.('.world-grid a.card')
      if (!a || !world) return
      const i = [...host.querySelectorAll('.world-grid a.card')].indexOf(a)
      const item = items[i]
      const cell = item && steps.cellFor(i)
      if (!cell) return
      e.preventDefault()
      hover.select(cell)
      opener.take(cell)
      opener.commit()
    }
    gridEl.addEventListener('click', onIndexActivate)

    // ---------------------------------------------------------------- index view
    //
    // "Index" and "Projects" both pointed at #work, which only un-clipped the
    // list via :focus-within — so it appeared with no exit, no scene behind it,
    // and nothing to click but 58 projects. It is now an explicit state with
    // three ways out: the button, Escape, and picking a project.
    const closeBtn = q('#index-close')
    const setIndex = (on) => {
      root.classList.toggle('world-index', on)
      if (closeBtn) closeBtn.hidden = !on
      if (on) {
        // Do NOT steal focus here. This also runs on focusin from the grid, and
        // yanking focus to the button would fight a keyboard user tabbing through
        // the list — every Tab would bounce them back to the exit.
        if (!gridEl.contains(document.activeElement)) closeBtn?.focus({ preventScroll: true })
      } else {
        // Back to the top, or the scene is behind a page still scrolled to
        // project 40 and the pointer maths is measured against the wrong origin.
        scrollTo({ top: 0, behavior: 'auto' })
      }
    }
    onIndexOpen = (e) => {
      if (!world) return          // no scene mounted: the list IS the page
      e.preventDefault()
      setIndex(true)
      q('#work')?.scrollIntoView({ block: 'start' })
    }
    for (const a of host.querySelectorAll('nav a.js-index'))
      a.addEventListener('click', onIndexOpen)
    // The list can also be revealed WITHOUT the nav, by tabbing into it — the
    // :focus-within rule un-clips it for keyboard users. That path set no state,
    // so the way back stayed hidden and you were stranded exactly as before, just
    // via a different door. One source of truth: however the list becomes
    // visible, the state says so and the exit is there.
    onIndexFocus = () => {
      if (!world) return
      if (root.classList.contains('world-open')) return   // never over an open card
      setIndex(true)
    }
    gridEl.addEventListener('focusin', onIndexFocus)

    // The backstop, and the reason this bug kept coming back.
    //
    // Twice now the list has been reachable by a route that did not set the
    // state, so the exit stayed hidden and there was no way back — first the nav
    // click, then :focus-within. Enumerating routes is a losing game. This
    // watches the OUTCOME instead: if the list is rendered tall enough to be a
    // page, an exit exists, whatever opened it. Clipped it is 1px, so the
    // threshold cannot fire by accident.
    indexWatch = new ResizeObserver(() => {
      if (!world) return
      if (root.classList.contains('world-open')) return
      if (root.classList.contains('world-project')) return
      const tall = gridEl.getBoundingClientRect().height > 400
      if (tall !== root.classList.contains('world-index')) setIndex(tall)
    })
    indexWatch.observe(gridEl)
    onIndexClose = () => setIndex(false)
    closeBtn?.addEventListener('click', onIndexClose)
    onIndexKey = (e) => {
      if (e.key === 'Escape' && root.classList.contains('world-index')) onIndexClose()
    }
    addEventListener('keydown', onIndexKey)
    // Picking a project is also a way out — it opens in the scene, so the list
    // must not stay draped over it.
    gridEl.addEventListener('click', onIndexClose)
    world.onAfterStep = (dt) => {
      hover.update()
      opener.update(dt)
    }

    // Tier 0 IS the Lite state. The governor calls back rather than tearing the
    // scene down behind this module's back — one owner for teardown, and the Lite
    // button never ends up describing a state that stopped being true.
    governor = new Governor({
      getWorld: () => world,
      onTierZero: () => { setLite(true); unmount() },
      onTier: (t) => root.setAttribute('data-tier', String(t))
    })
    root.setAttribute('data-tier', String(governor.tier))

    world.warmup() // M9 — compile before the first visible frame, not during it
    root.classList.add('world-live')

    addEventListener('pointerdown', onDown)
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onUp)
    addEventListener('resize', resize)

    last = performance.now()
    raf = requestAnimationFrame(loop)

    window.__world = world
    window.__hover = hover
    window.__open = opener
    window.__details = details
    window.__steps = steps
    window.__governor = governor
    window.__worldReady = true
    if (statusEl) statusEl.textContent = ''
  }

  function unmount() {
    if (!world) return
    cancelAnimationFrame(raf)
    removeEventListener('pointerdown', onDown)
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerup', onUp)
    removeEventListener('pointercancel', onUp)
    removeEventListener('resize', resize)
    root.classList.remove('world-live')
    root.removeAttribute('data-tier')
    if (onIndexActivate) gridEl.removeEventListener('click', onIndexActivate)
    onIndexActivate = null
    // The index view belongs to the scene. Without a scene there is nothing to go
    // back TO, so the state and its control must not survive the unmount — the
    // list simply becomes the page again, which is the no-JS behaviour too.
    if (onIndexClose) gridEl.removeEventListener('click', onIndexClose)
    for (const a of host.querySelectorAll('nav a.js-index'))
      if (onIndexOpen) a.removeEventListener('click', onIndexOpen)
    if (onIndexKey) removeEventListener('keydown', onIndexKey)
    if (onIndexFocus) gridEl.removeEventListener('focusin', onIndexFocus)
    indexWatch?.disconnect()
    indexWatch = null
    const cb = q('#index-close')
    if (cb && onIndexClose) cb.removeEventListener('click', onIndexClose)
    if (cb) cb.hidden = true
    root.classList.remove('world-index')
    onIndexOpen = onIndexClose = onIndexKey = onIndexFocus = null
    opener?.dispose()
    hover?.dispose()
    details?.dispose()
    world.onAfterStep = null
    world.dispose()
    world = null
    hover = null
    details = null
    steps = null
    opener = null
    governor = null
    window.__world = null
    window.__hover = null
    window.__open = null
    window.__details = null
    window.__steps = null
    window.__governor = null
    window.__worldReady = false
  }

  function resize() {
    world?.setSize(innerWidth, innerHeight)
  }

  // itemOpen gates the drag, exactly as measured.
  const onDown = (e) => { if (!world?.itemOpen) world?.pointerDown(e.clientX, e.clientY) }
  const onMove = (e) => world?.pointerMove(e.clientX, e.clientY)
  const onUp = () => world?.pointerUp()

  function loop(now) {
    raf = requestAnimationFrame(loop)
    // Clamped so a backgrounded tab returning does not teleport the world.
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    // Keep the rAF alive but do no work while a project page is up: `last` still
    // advances, so returning does not hand the world one enormous dt and fling
    // the grid across the screen.
    if (paused) return
    world.step(dt)
    world.render(dt)
    governor?.sample(now, dt)
  }

  // The world wraps forever, so "back" here means back to where you started —
  // after a long drag there is otherwise no way to find the beginning again.
  // Animated rather than snapped: a teleport in an infinite grid gives no sense
  // of having travelled, and the wrap makes it impossible to tell you moved.
  recentreBtn.addEventListener('click', () => {
    if (!world) return
    world.recentre()
  })

  mount()

  // Deep link. Opening #/work/<slug> directly has to land on that page, not on
  // the world with the URL lying about where you are. Runs after mount() and
  // after `paused` is initialised — route() reads it, and reading a `let` before
  // its declaration has executed is a TDZ throw rather than undefined.
  route()

  // Test surface for the headless rig.
  window.__spec = {
    K,
    items,
    itemCount: items.length,
    get world() { return world },
    get mounted() { return Boolean(world) },
    get lite() { return lite },
    get projectPage() { return projectPage },
    get paused() { return paused },
    // The Lite kill switch outlived its button — the governor drives it on a weak
    // device. Exposed so the suite can still exercise mount/unmount without a
    // control to click.
    setLite: (v) => { setLite(v); if (v) unmount(); else mount() }
  }

  return {
    mount, unmount, route,
    get world() { return world },
    get paused() { return paused },
    setPaused: (v) => { paused = v },
    recentre: () => world?.recentre(),
    dispose: () => { unmount(); projectPage.dispose() }
  }
}
