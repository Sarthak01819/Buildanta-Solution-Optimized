import * as THREE from 'three'
import * as K from '../constants.js'
import { cardTexture } from '../placeholder.js'
import { PostChain } from './post/index.js'
import { VideoPool } from './video.js'

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

// The wrapping grid.
//
// A flat field of cards at z = 0 that the camera pans across in X/Y, wrapping
// forever via modulo-GRID cell recycling. There is no sphere: the reference
// page's "world" reads spherical because of a barrel post pass (Phase 3) and a
// decorative wireframe globe behind the cards.
//
// ---------------------------------------------------------------------------
// One deliberate deviation, and why
//
// The reference sets `camera.scale = clamp(1920/w, 0.3, 2) + 0.35`. A perspective
// camera's own scale does NOT change projection — probed in three r169, NDC is
// byte-identical at scale 1 / 1.683 / 2.35 / 0.65; it only moves view-space z,
// which changes fog and clipping. So their value must reach the projection by
// another route we could not observe.
//
// We fold it into fov instead: fov = 2·atan(canvasH · scale / 2 / 1500). That
// reproduces both things we actually measured —
//   * 12-14 of 121 cells visible at 1440x820 (this gives 13.2), and
//   * drag reading as 1.25/scale CSS px per pointer px
// — while keeping the camera at z = 1500 so the measured fog (near 1500,
// far 2200) still lands where it should. Documented so it is a decision, not
// a drift.
// ---------------------------------------------------------------------------

export class WorldGrid {
  // renderer / composer: inject the host's when embedding in a site that owns
  // them (the kit's one-renderer rule). Omitted, the scene owns its own and
  // runs standalone.
  constructor({ canvas, items, renderer = null, composer = null, encode = true }) {
    this.items = items
    this.canvas = canvas
    this.hostComposer = composer
    this.encode = encode
    this.ownsRenderer = !renderer
    this.dragging = false
    this.itemOpen = false
    this.openTarget = null
    this.dragMoved = false
    this.time = 0

    this.renderer = renderer || new THREE.WebGLRenderer({
      canvas,
      // Antialiasing moved onto the composer's render target in Phase 3. With a
      // post chain, the multisampled default framebuffer resolves nothing but
      // one full-screen triangle: paid for, and no geometry gets it.
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    })
    if (this.ownsRenderer) {
      this.renderer.setPixelRatio(1) // src: measured — the reference runs pixelRatio 1
      this.renderer.setClearColor(0x000000, 1)
    }

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(K.FOG_COLOR, K.FOG_NEAR, K.FOG_FAR)
    // The background is a scene background, NOT a clear colour, and that is
    // load-bearing. Measured through a passthrough shader: with
    // setClearColor(0x050505) the composer's target holds the sRGB value
    // (code 128 for a 0x808080 probe) while the cards next to it hold linear —
    // two colour spaces in one buffer, which the single encode downstream then
    // lifts the background of and not the cards. three resolves the raw clear
    // against the SCREEN's output colour space even while a target is bound;
    // handing it a pre-converted linear value does not help, because it
    // converts that too. scene.background goes through the target-aware path
    // and lands at code 55 — exactly linear.
    this.scene.background = new THREE.Color(K.BG)

    this.camera = new THREE.PerspectiveCamera(45, 1, K.CAMERA_NEAR, K.CAMERA_FAR)
    this.camera.position.set(K.START, K.START, K.CAMERA_Z)

    // src: Round 4 — touch runs different physics, measured under a real mobile
    // user agent. Shipping the desktop numbers on a phone makes the drag feel
    // sluggish and over-damped.
    this.touch = K.isTouch()
    this.dragMultiplier = this.touch ? K.TOUCH.dragMultiplier : K.DRAG_MULTIPLIER
    this.frictionLambda = this.touch ? K.TOUCH_FRICTION_LAMBDA : K.DRAG_FRICTION_LAMBDA

    this.dragPos = new THREE.Vector2(K.START, K.START)
    this.prevDragPos = this.dragPos.clone()
    this.dragVel = new THREE.Vector2()
    this.pointerWorld = new THREE.Vector2()
    this.mouseNorm = new THREE.Vector2()
    this.smoothMouse = new THREE.Vector2()
    this.smoothMouse2 = new THREE.Vector2()

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this.buildGlobe()
    this.buildCells()

    this.visible = []
    this.scaleFactor = 1
    this.videos = new VideoPool()
  }

  // ------------------------------------------------------------ build

  buildGlobe() {
    // src: Round 1 Task 3 — real geometry, not a shader grid.
    const sphere = new THREE.SphereGeometry(1, K.GLOBE_SEGMENTS[0], K.GLOBE_SEGMENTS[1])
    const edges = new THREE.EdgesGeometry(sphere, K.GLOBE_EDGE_THRESHOLD)
    sphere.dispose()
    this.globe = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: K.GLOBE_COLOR, fog: true })
    )
    this.globe.scale.setScalar(K.GLOBE_RADIUS)
    this.scene.add(this.globe)
  }

  buildCells() {
    const rand = K.mulberry32(K.SEED)
    this.cells = []

    for (let row = 0; row < K.GRID; row++) {
      for (let col = 0; col < K.GRID; col++) {
        const item = this.items[(row * K.GRID + col) % this.items.length]
        const [iw, ih] = item.image_size
        const long = Math.max(iw, ih)

        // src: Round 2 Task D — long edge always 550, short edge from the
        // item's own aspect. 1x1 segments: zero vertex curvature anywhere.
        const geometry = new THREE.PlaneGeometry(
          (iw / long) * K.CARD_LONG_EDGE,
          (ih / long) * K.CARD_LONG_EDGE,
          1,
          1
        )
        const material = new THREE.MeshBasicMaterial({
          // Real art if content/world.json names a file, placeholder until then.
          map: cardTexture(item, (real) => {
            material.map?.dispose()
            material.map = real
            material.needsUpdate = true
          }),
          transparent: true,
          depthTest: false,
          depthWrite: true,
          fog: true
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.renderOrder = 1

        const jitter = {
          x: Math.round((rand() * 2 - 1) * K.JITTER_XY),
          y: Math.round((rand() * 2 - 1) * K.JITTER_XY),
          z: Math.round((rand() * 2 - 1) * K.JITTER_Z)
        }
        const s = K.CARD_SCALE_MIN + rand() * (K.CARD_SCALE_MAX - K.CARD_SCALE_MIN)

        mesh.position.set(jitter.x, jitter.y, jitter.z)
        mesh.scale.set(s, s, 1)

        const group = new THREE.Group()
        group.add(mesh)
        this.group.add(group)

        // The authored scale is ground truth: anything that scales a card must
        // restore from this, never from whatever the card happens to be at.
        this.cells.push({ group, mesh, col, row, jitter, item, baseScale: s })
      }
    }
  }

  // ------------------------------------------------------------ layout

  setSize(width, height) {
    this.width = width
    this.height = height
    this.scaleFactor = K.cameraScaleFor(width)

    // See the deviation note at the top of this file.
    const visibleHeight = height * this.scaleFactor
    this.camera.fov = (2 * Math.atan(visibleHeight / 2 / K.CAMERA_Z) * 180) / Math.PI
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)

    // The chain is built on the first sizing rather than in the constructor, so
    // its targets are never allocated at a size they then have to throw away.
    if (!this.post) {
      this.post = new PostChain({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        width,
        height,
        composer: this.hostComposer,
        encode: this.encode,
        world: this
      })
    } else {
      this.post.setSize(width, height)
    }
  }

  // ------------------------------------------------------------ input

  pointerDown(x, y) {
    this.dragMoved = false
    // src: Round 1 Task 6 — the reference's own handler opens with
    // `if (itemOpen || ...) return`. Gating in the caller instead leaves every
    // other entry point (a test, a synthetic drive, a future control) able to
    // drag a world that is supposed to be held still.
    if (this.itemOpen) return
    this.dragging = true
    this.recentring = false   // a drag beats an in-flight recentre
    this.originX = x
    this.originY = y
    this.lastX = x
    this.lastY = y
  }

  pointerMove(x, y) {
    // Pointer position in world units, measured from the centre of the canvas.
    this.mouseNorm.set(
      (x / this.width) * 2 - 1,
      -((y / this.height) * 2 - 1)
    )
    this.pointerWorld.set(
      (x - this.width / 2) * this.scaleFactor,
      (this.height / 2 - y) * this.scaleFactor
    )

    if (!this.dragging || this.itemOpen) return

    // src: Round 1 Task 6. Their dead zone is `||`, which kills a perfectly
    // axis-aligned drag outright — a horizontal swipe on a touchscreen would do
    // nothing. That is a defect, not a feel, so ours is `&&`: the drag counts
    // once movement on EITHER axis clears 2px.
    const movedX = Math.abs(this.originX - x)
    const movedY = Math.abs(this.originY - y)
    if (movedX < K.DRAG_DEAD_ZONE && movedY < K.DRAG_DEAD_ZONE) return

    this.dragMoved = true
    this.dragPos.x += (this.lastX - x) * this.dragMultiplier
    this.dragPos.y -= (this.lastY - y) * this.dragMultiplier
    this.lastX = x
    this.lastY = y
  }

  pointerUp() {
    this.dragging = false
  }

  // Test hook: drag by an exact pixel delta without synthesising events.
  dragBy(dx, dy) {
    this.dragPos.x -= dx * this.dragMultiplier
    this.dragPos.y += dy * this.dragMultiplier
  }

  // ------------------------------------------------------------ per-frame

  updateCamera(dt) {
    if (this.dragging) {
      // Only when dt is real. A repeated rAF timestamp, or renderAt() called
      // twice on the same millisecond, makes this 0/0 -> NaN or x/0 -> Infinity,
      // and a non-finite velocity poisons every downstream damper permanently
      // (NaN * 0 is NaN, so even a zeroed gate cannot clear it).
      if (dt > 0) {
        this.dragVel.set(
          (this.dragPos.x - this.prevDragPos.x) / dt,
          (this.dragPos.y - this.prevDragPos.y) / dt
        )
      }
    } else {
      // Exact integral of v(t) = v0·exp(-lambda·t) over the step, not v*dt.
      // Damping the velocity frame-rate-independently is only half the job:
      // Euler-integrating the position still makes total coast distance depend
      // on frame rate (750 units at 60fps vs 741 at 144fps, measured). The
      // closed form gives v0/lambda at every frame rate.
      //
      // Footnote: the reference's own discrete sum lands on 25*v0_perFrame,
      // about 2% further than the exact integral of the same velocity curve.
      // Theirs is the approximation; we keep the curve and fix the integration.
      const decay = Math.exp(-this.frictionLambda * dt)
      const travel = (1 - decay) / this.frictionLambda
      this.dragPos.x += this.dragVel.x * travel
      this.dragPos.y += this.dragVel.y * travel
      // No throw cap and no clamp — measured, and deliberate.
      this.dragVel.multiplyScalar(decay)
    }
    this.prevDragPos.copy(this.dragPos)

    const cam = this.camera
    // src: Round 3 — while a card is open the CAMERA travels to it; the card
    // never moves. Measured at grid origin + the card's own local offset, to
    // the pixel. The open lambda is slower than the drag chase, so the flight
    // reads as a move rather than a snap.
    const tx = this.openTarget ? this.openTarget.x : this.dragPos.x
    const ty = this.openTarget ? this.openTarget.y : this.dragPos.y
    // Stepping sets its own lambda: a seam step is far longer than a one-cell
    // hop, and an exponential launches at lambda * distance.
    const chase = this.openTarget
      ? (this.openLambda || K.OPEN_LAMBDA)
      : K.CAMERA_CHASE_LAMBDA
    cam.position.x = K.damp(cam.position.x, tx, chase, dt)
    cam.position.y = K.damp(cam.position.y, ty, chase, dt)
    cam.position.z = K.CAMERA_Z

    // src: Round 1 Task 5 — the roll term is the difference between two
    // differently-lagged mouse smoothers, which is what makes the camera lean
    // into a swing instead of snapping.
    this.smoothMouse.x = K.damp(this.smoothMouse.x, this.mouseNorm.x, K.SMOOTH_MOUSE_LAMBDA, dt)
    this.smoothMouse.y = K.damp(this.smoothMouse.y, this.mouseNorm.y, K.SMOOTH_MOUSE_LAMBDA, dt)
    this.smoothMouse2.x = K.damp(this.smoothMouse2.x, this.mouseNorm.x, K.SMOOTH_MOUSE2_LAMBDA, dt)
    this.smoothMouse2.y = K.damp(this.smoothMouse2.y, this.mouseNorm.y, K.SMOOTH_MOUSE2_LAMBDA, dt)

    // Pivot sandwich: step back, rotate, step forward — so the parallax orbits
    // a point in front of the camera rather than rotating in place.
    const pivot = K.CAMERA_Z_OFFSET * K.MOUSE_MULT
    cam.quaternion.identity()
    cam.translateZ(-pivot)
    _euler.set(
      this.smoothMouse.y * K.MOUSE_ANGLE_Y * K.MOUSE_MULT,
      -this.smoothMouse.x * K.MOUSE_ANGLE_X * K.MOUSE_MULT,
      0,
      'XYZ'
    )
    cam.quaternion.multiply(_quat.setFromEuler(_euler))
    _euler.set(0, 0, -K.ROLL * (this.smoothMouse.x - this.smoothMouse2.x) * K.MOUSE_MULT, 'XYZ')
    cam.quaternion.multiply(_quat.setFromEuler(_euler))
    cam.translateZ(pivot)
  }

  updatePositions() {
    // Infinite wrap: place every column and row at the copy nearest the camera.
    // Closed form of the reference's modulo-11 band recycling.
    const cx = this.camera.position.x
    const cy = this.camera.position.y
    for (const c of this.cells) {
      const bx = c.col * K.CELL
      const by = c.row * K.CELL
      c.group.position.x = bx + Math.round((cx - bx) / K.SPAN) * K.SPAN
      c.group.position.y = by + Math.round((cy - by) / K.SPAN) * K.SPAN
    }
  }

  checkVisibility() {
    // Margin is the true worst-case card half-extent, not a generous guess —
    // jitter is already carried in the position being compared, so counting it
    // again here would over-report what is on screen.
    const margin = (K.CARD_LONG_EDGE * K.CARD_SCALE_MAX) / 2
    const halfW = (this.width * this.scaleFactor) / 2 + margin
    const halfH = (this.height * this.scaleFactor) / 2 + margin
    const cx = this.camera.position.x
    const cy = this.camera.position.y
    this.visible.length = 0
    for (const c of this.cells) {
      const vis =
        Math.abs(c.group.position.x + c.jitter.x - cx) < halfW &&
        Math.abs(c.group.position.y + c.jitter.y - cy) < halfH
      c.mesh.visible = vis
      if (vis) this.visible.push(c)
    }
  }

  updateProximity(dt) {
    // src: Round 2 Task A, solved with zero residual.
    // No radius, no falloff, no cutoff, no clamp — a pure linear ramp measured
    // in 2D from (camera + raw pointer).
    const ox = this.camera.position.x + this.pointerWorld.x
    const oy = this.camera.position.y + this.pointerWorld.y
    for (const c of this.visible) {
      // An adopted card has exactly one writer, and it is not this one.
      if (c.owned) continue
      const dx = c.group.position.x + c.jitter.x - ox
      const dy = c.group.position.y + c.jitter.y - oy
      const target = c.jitter.z - K.PROXIMITY_K * Math.hypot(dx, dy)
      c.mesh.position.z = K.damp(c.mesh.position.z, target, K.PROXIMITY_LAMBDA, dt)
    }
  }

  updateGlobe(dt) {
    this.globe.position.set(this.camera.position.x, this.camera.position.y, K.GLOBE_Z)
    this.globe.rotation.y += K.GLOBE_SPIN_RAD_PER_S * dt
  }

  // Same call order as the reference's onRaf.
  // Back to where the world started.
  //
  // The grid wraps forever, so after a long drag there is no landmark and no
  // way to find the beginning again — this is the only "back" the browsing
  // state can meaningfully offer.
  //
  // It cancels the throw first. Leaving velocity on means friction keeps
  // integrating during the glide and the world drifts past the origin it was
  // asked to return to.
  recentre() {
    this.dragVel.set(0, 0)
    this.recentring = true
  }

  step(dt) {
    // Frame-rate independent, like every other easing here: a per-frame lerp
    // would arrive at a different place on a 120Hz screen than on a 60Hz one.
    if (this.recentring) {
      const k = 1 - Math.exp(-6 * dt)
      this.dragPos.x += (K.START - this.dragPos.x) * k
      this.dragPos.y += (K.START - this.dragPos.y) * k
      if (Math.hypot(K.START - this.dragPos.x, K.START - this.dragPos.y) < 0.5) {
        this.dragPos.set(K.START, K.START)
        this.recentring = false
      }
    }
    this.time += dt
    this.updateCamera(dt)
    this.updatePositions()
    this.updateGlobe(dt)
    this.checkVisibility()
    this.videos.update(this.visible, this.camera)
    this.updateProximity(dt)
    // Interaction runs here, not from the rAF loop, so the rig's deterministic
    // renderAt() path exercises exactly the same order.
    this.onAfterStep?.(dt)
    // Last, so the trail and the warp read this frame's velocity, not the
    // previous one.
    this.post?.update(dt, this.dragVel, this.itemOpen)
  }

  render(dt = 0) {
    if (this.post) this.post.render(dt)
    else this.renderer.render(this.scene, this.camera)
  }

  // Deterministic frame for the verification rig. Automated Chrome throttles
  // rAF, so without an explicit clock every screenshot is a coin flip.
  renderAt(ms) {
    const dt = Math.max(0, ms / 1000 - this.time)
    this.step(dt)
    this.render(dt)
  }

  // M9 — pay the shader compile while the canvas is still hidden, not on the
  // frame the viewer is looking at. Compiling through the composer is what
  // matters: renderer.compile(scene, camera) would build a program variant for
  // the direct path that the composer then never uses, doubling cold-tab cost.
  warmup() {
    this.render(1 / K.REF_FPS)
  }

  dispose() {
    for (const c of this.cells) {
      c.mesh.geometry.dispose()
      c.mesh.material.map?.dispose()
      c.mesh.material.dispose()
    }
    this.videos.dispose()
    this.globe.geometry.dispose()
    this.globe.material.dispose()
    // Before the renderer: renderer.dispose() frees no render targets.
    this.post?.dispose()
    this.post = null
    // Never dispose a renderer we were handed — it belongs to the host.
    if (this.ownsRenderer) this.renderer.dispose()
  }
}
