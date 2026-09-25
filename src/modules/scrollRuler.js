/**
 * SCROLL RULER — the section ruler + section nav that sits top-centre over
 * the scroll story, and the white curtain a section jump hides behind.
 *
 * A PORT of the Zero reference ruler (why.zero.university, supplied as
 * zeromirror.zip): the desktop ruler is its `lv` class, the phone timeline
 * its `pv` class, the curtain its `.stage-nav-overlay`. Markup, maths and
 * every visual value are the reference's; ours are only the `bz-` class names
 * (no element ids — page rule), the font (DM Mono, already loaded by the
 * page), and the keyboard / screen-reader wiring the reference lacked.
 * Change the look against the reference, not by eye.
 *
 *   createScrollRuler({ segments, navItems, parent?, mobileQuery? }) → {
 *     el                       root currently mounted (changes on a variant swap)
 *     update(progress, force)  0..1 over the summed scrollVh; no-op if unchanged
 *     setActiveSegment(id)     thick underline (desktop) / lit bar (phone menu)
 *     setNavEnabled(bool)      hover / focus / tap nav allowed. Starts DISABLED,
 *                              as in the reference — the timeline turns it on
 *     onStageClick(fn)         fn(id) → Promise; while pending the button spins,
 *                              every button is disabled and the nav stays open
 *     setTheme("light"|"ink")  white ink / dark ink for light backgrounds
 *     setVisible(bool)         .6 s fade; hidden = inert, then visibility:hidden
 *     dispose()
 *   }
 *   (the jump curtain moved to pageTransition.js, D-103)
 *
 * Desktop vs phone follows matchMedia(mobileQuery) and is REBUILT when it
 * flips — the two are different DOM, not a CSS swap — re-applying the last
 * progress / active id / nav state / theme / visibility / click handler.
 *
 * Cost: no rAF of its own — update() rides the site's single ticker. Only
 * transforms are written (track translateX, minor-tick scaleY, phone-bar
 * scaleX) and each is cached, so an unchanged value is never re-written.
 * Nothing here touches the DOM until createScrollRuler / showNavOverlay run.
 */

// The reference's constants, same values, named.
const VH_PER_TICK = 10;   // rv — scroll-vh per minor tick
const TICK_GAP = 12;      // iv — px between ticks
const RULER_W = 300;      // av — must match .bz-ruler width
const MINOR_H = 9;        // ov — resting minor line (px)
const PEAK_H = 18;        // sv — minor line under the indicator / major line
const BZ_START = 100;     // uv — phone counter at the first section
const BZ_STEP = 25;       // dv — counter drop per section
const FILL_Q = 128;       // fv — phone fill quantisation (steps per bar)

const mk = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0); // also maps NaN → 0

// Mouse clicks focus a button in Chrome; only a KEYBOARD focus may hold the
// hover nav open, or it would stick open after the pointer leaves.
const keyboardFocus = (t) => {
  try { return t.matches(":focus-visible"); } catch { return true; }
};

/* ═════════════ desktop — reference `lv` ═════════════ */

class DesktopRuler {
  constructor(parent, segments, navItems, state) {
    // Ticks start at the first LABELLED segment; each labelled start is a
    // major tick, the span inside every segment is split into minor ticks
    // (one per VH_PER_TICK of scroll), except after the END marker.
    const total = segments.reduce((s, x) => s + x.scrollVh, 0) || 1;
    const ticks = [];
    let at = 0;
    let started = false;
    for (const seg of segments) {
      if (seg.label) started = true;
      if (started) {
        ticks.push(seg.label
          ? { type: "major", label: seg.label, progress: at / total }
          : { type: "minor", progress: at / total });
        if (seg.label !== "END") {
          const n = Math.max(Math.round(seg.scrollVh / VH_PER_TICK) - 1, 0);
          for (let k = 1; k <= n; k++) {
            ticks.push({ type: "minor", progress: (at + (seg.scrollVh * k) / (n + 1)) / total });
          }
        }
      }
      at += seg.scrollVh;
    }

    this._span = Math.max(ticks.length - 1, 0) * TICK_GAP;
    this._center = RULER_W / 2;

    const root = (this.el = mk("div", "bz-ruler"));
    root.setAttribute("role", "navigation");
    root.setAttribute("aria-label", "Sections");

    const track = (this._track = mk("div", "bz-ruler__track"));
    track.setAttribute("aria-hidden", "true");
    track.style.width = `${this._span + TICK_GAP}px`;
    this._minor = [];
    for (const t of ticks) {
      const tick = mk("div", `bz-ruler__tick bz-ruler__tick--${t.type}`);
      tick.style.left = `${t.progress * this._span - TICK_GAP / 2}px`;
      const line = mk("span", "bz-ruler__line");
      tick.appendChild(line);
      if (t.type === "major" && t.label) {
        const label = mk("span", "bz-ruler__label");
        label.textContent = t.label;
        tick.appendChild(label);
      }
      if (t.type === "minor") this._minor.push({ line, progress: t.progress, h: MINOR_H, atBase: true });
      track.appendChild(tick);
    }

    // Bump radius = 3 average minor spacings (the reference sums the
    // consecutive gaps; that sum telescopes to last − first).
    let gap = 0.1;
    const m = this._minor;
    if (m.length > 1) gap = (m[m.length - 1].progress - m[0].progress) / (m.length - 1);
    this._radius = gap * 3;
    this._invRadius = 1 / this._radius;
    root.appendChild(track);

    const indicator = mk("div", "bz-ruler__indicator");
    indicator.setAttribute("aria-hidden", "true");
    root.appendChild(indicator);

    const nav = mk("div", "bz-ruler__nav");
    this._buttons = new Map();
    for (const { id, label, navigable } of navItems) {
      const isStatic = navigable === false;
      const btn = mk("button", "bz-ruler__nav-btn");
      if (isStatic) {
        btn.classList.add("is-static");
        btn.setAttribute("aria-disabled", "true");
      }
      btn.type = "button";
      btn.dataset.segment = id;
      btn.setAttribute("aria-label", isStatic ? `Section ${label}` : `Go to section ${label}`);
      const text = mk("span", "bz-ruler__nav-label");
      text.textContent = label;
      const underline = mk("span", "bz-ruler__nav-line");
      const spinner = mk("span", "bz-ruler__nav-spinner");
      spinner.setAttribute("aria-hidden", "true");
      btn.append(text, underline, spinner);
      if (!isStatic) btn.addEventListener("click", () => this._navClick(id, btn));
      nav.appendChild(btn);
      this._buttons.set(id, btn);
    }
    root.appendChild(nav);

    this._navEnabled = false;
    this._hovering = false;
    this._focused = false;
    this._busy = false;
    this._activeId = null;
    this._onClick = null;
    this._disposed = false;
    this._syncTabStops();

    this._onEnter = () => { this._hovering = true; this._applyHover(); };
    this._onLeave = () => { this._hovering = false; this._applyHover(); };
    this._onFocusIn = (e) => { this._focused = keyboardFocus(e.target); this._applyHover(); };
    this._onFocusOut = (e) => {
      if (root.contains(e.relatedTarget)) return; // moving between buttons
      this._focused = false;
      this._applyHover();
    };
    root.addEventListener("pointerenter", this._onEnter);
    root.addEventListener("pointerleave", this._onLeave);
    root.addEventListener("focusin", this._onFocusIn);
    root.addEventListener("focusout", this._onFocusOut);

    // Theme + visibility land BEFORE mounting so a rebuild never flashes.
    this.setTheme(state.theme);
    this.setVisible(state.visible);
    parent.appendChild(root);
    this._last = -1;
    this.update(0);
  }

  // Invisible buttons must not be tab stops while the nav cannot open.
  _syncTabStops() {
    for (const btn of this._buttons.values()) {
      btn.tabIndex = this._navEnabled && !btn.classList.contains("is-static") ? 0 : -1;
    }
  }

  _applyHover() {
    const open = this._busy || (this._navEnabled && (this._hovering || this._focused));
    this.el.classList.toggle("is-hover-nav", open);
  }

  setNavEnabled(on) {
    this._navEnabled = !!on;
    if (!this._navEnabled) { this._hovering = false; this._focused = false; }
    this._syncTabStops();
    this._applyHover();
  }

  setActiveSegment(id) {
    if (this._activeId === id) return;
    this._activeId = id;
    for (const [key, btn] of this._buttons) {
      const on = key === id;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
  }

  onStageClick(fn) {
    this._onClick = typeof fn === "function" ? fn : null;
  }

  setTheme(theme) {
    this.el.classList.toggle("bz-ink", theme === "ink");
  }

  setVisible(visible) {
    this.el.classList.toggle("is-hidden", !visible);
    this.el.inert = !visible;
    if (!visible) { this._hovering = false; this._focused = false; this._applyHover(); }
  }

  // The navEnabled guard is new: the reference relied on pointer-events to
  // keep clicks out of a closed nav, and a keyboard Enter bypasses that.
  async _navClick(id, btn) {
    if (this._busy || !this._navEnabled || id === this._activeId || !this._onClick) return;
    this._busy = true;
    btn.classList.add("is-loading");
    this._applyHover();
    for (const b of this._buttons.values()) b.disabled = true;
    try {
      await this._onClick(id);
    } finally {
      if (!this._disposed) {
        btn.classList.remove("is-loading");
        for (const b of this._buttons.values()) b.disabled = false;
        this._busy = false;
        this._applyHover();
      }
    }
  }

  update(progress, force = false) {
    if (!force && Math.abs(progress - this._last) < 1e-5) return;
    this._last = progress;
    this._track.style.transform = `translateX(${this._center - progress * this._span}px)`;

    // Minor ticks swell from MINOR_H to PEAK_H as the indicator nears them —
    // a smoothstep bump, a pure function of progress (no transition).
    const radius = this._radius;
    const inv = this._invRadius;
    const rise = PEAK_H - MINOR_H;
    for (const t of this._minor) {
      const d = Math.abs(t.progress - progress);
      if (d >= radius) {
        if (!t.atBase) {
          t.line.style.transform = "scaleY(1)";
          t.h = MINOR_H;
          t.atBase = true;
        }
        continue;
      }
      t.atBase = false;
      const x = d * inv;
      const s = x * x * (3 - 2 * x);
      const h = Math.round((PEAK_H - rise * s) * 10) / 10;
      if (h !== t.h) {
        t.line.style.transform = `scaleY(${h / MINOR_H})`;
        t.h = h;
      }
    }
  }

  dispose() {
    this._disposed = true;
    const root = this.el;
    root.removeEventListener("pointerenter", this._onEnter);
    root.removeEventListener("pointerleave", this._onLeave);
    root.removeEventListener("focusin", this._onFocusIn);
    root.removeEventListener("focusout", this._onFocusOut);
    root.remove();
    this._onClick = null;
  }
}

/* ═════════════ phone — reference `pv` ═════════════ */

class PhoneTimeline {
  constructor(parent, segments, navItems, state) {
    // One bar per gap between labelled section starts; the counter falls
    // BZ_STEP per section, interpolated across the bar being filled.
    const total = segments.reduce((s, x) => s + x.scrollVh, 0) || 1;
    const starts = [];
    let at = 0;
    for (const seg of segments) {
      if (seg.label) starts.push(at / total);
      at += seg.scrollVh;
    }
    this._starts = starts;
    this._nBars = Math.max(starts.length - 1, 0);

    const root = (this.el = mk("div", "bz-mtl"));
    root.setAttribute("role", "navigation");
    root.setAttribute("aria-label", "Sections");

    // The reference tapped a bare aria-hidden div; a real button makes the
    // same tap target reachable by keyboard and announced as a disclosure.
    const toggle = (this._toggle = mk("button", "bz-mtl__toggle"));
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Sections menu");
    toggle.setAttribute("aria-expanded", "false");

    const bars = mk("span", "bz-mtl__bars");
    bars.setAttribute("aria-hidden", "true");
    this._fills = [];
    for (let i = 0; i < this._nBars; i++) {
      const bar = mk("span", "bz-mtl__bar");
      const fill = mk("span", "bz-mtl__fill");
      bar.appendChild(fill);
      bars.appendChild(bar);
      this._fills.push({ el: fill, q: 0 });
    }
    toggle.appendChild(bars);

    this._count = mk("span", "bz-mtl__count");
    this._count.setAttribute("aria-hidden", "true");
    this._count.textContent = `${BZ_START} BZ`;
    this._lastBz = BZ_START;
    toggle.appendChild(this._count);
    root.appendChild(toggle);

    this._navEnabled = false;
    this._busy = false;
    this._open = false;
    this._activeId = null;
    this._onClick = null;
    this._disposed = false;
    this._outside = null;
    this._onKey = null;
    this._armTimer = 0;

    // Menu lives on <body> (it is fixed, and must not inherit a transformed
    // parent); inert while closed so Tab never lands in an invisible menu.
    const menu = (this._menu = mk("div", "bz-mtl-menu"));
    menu.inert = true;
    this._items = new Map();
    for (const { id, label } of navItems) {
      const item = mk("button", "bz-mtl-menu__item");
      item.type = "button";
      item.dataset.segment = id;
      item.setAttribute("aria-label", `Go to section ${label}`);
      const text = mk("span", "bz-mtl-menu__label");
      text.textContent = String(label).replace(/^-/, "");
      const spinner = mk("span", "bz-mtl-menu__spinner");
      spinner.setAttribute("aria-hidden", "true");
      item.append(text, spinner);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this._navClick(id, item);
      });
      menu.appendChild(item);
      this._items.set(id, item);
    }
    document.body.appendChild(menu);

    this._onTap = (e) => {
      if (this._open) { this._close(); return; }
      if (!this._navEnabled) return;
      this._openMenu();
      if (e.detail === 0) this._focusItem(); // keyboard activation
    };
    toggle.addEventListener("click", this._onTap);

    this.setNavEnabled(false);
    this.setTheme(state.theme);
    this.setVisible(state.visible);
    parent.appendChild(root);
    this._last = -1;
    this.update(0);
  }

  setNavEnabled(on) {
    this._navEnabled = !!on;
    this._toggle.setAttribute("aria-disabled", String(!this._navEnabled));
    if (!this._navEnabled && this._open && !this._busy) this._close();
  }

  setActiveSegment(id) {
    if (this._activeId === id) return;
    this._activeId = id;
    for (const [key, item] of this._items) {
      const on = key === id;
      item.classList.toggle("is-active", on);
      if (on) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
  }

  onStageClick(fn) {
    this._onClick = typeof fn === "function" ? fn : null;
  }

  setTheme(theme) {
    const ink = theme === "ink";
    this.el.classList.toggle("bz-ink", ink);
    this._menu.classList.toggle("bz-ink", ink);
  }

  setVisible(visible) {
    if (!visible) this._close(true);
    this.el.classList.toggle("is-hidden", !visible);
    this.el.inert = !visible;
  }

  _focusItem() {
    const item = this._items.get(this._activeId) || this._menu.querySelector("button:not(:disabled)");
    if (item) item.focus({ preventScroll: true });
  }

  _openMenu() {
    if (this._open) return;
    this._open = true;
    // Right-aligned under the timeline, as the reference measures it. The
    // viewport width comes from clientWidth, not innerWidth: a fixed box's
    // `right` excludes the scrollbar, innerWidth includes it.
    const r = this.el.getBoundingClientRect();
    this._menu.style.top = `${Math.round(r.bottom + 10)}px`;
    this._menu.style.right = `${Math.round(document.documentElement.clientWidth - r.right)}px`;
    this._menu.inert = false;
    this._menu.classList.add("is-open");
    this._toggle.setAttribute("aria-expanded", "true");
    this._arm();
  }

  _close(force = false) {
    if (!this._open || (this._busy && !force)) return;
    this._open = false;
    if (this._menu.contains(document.activeElement)) this._toggle.focus({ preventScroll: true });
    this._menu.classList.remove("is-open");
    this._menu.inert = true;
    this._toggle.setAttribute("aria-expanded", "false");
    this._disarm();
  }

  // Outside-tap close is armed a tick late so the opening tap cannot close it.
  _arm() {
    if (this._outside) return;
    this._outside = (e) => {
      if (!this.el.contains(e.target) && !this._menu.contains(e.target)) this._close();
    };
    this._onKey = (e) => { if (e.key === "Escape") this._close(); };
    this._armTimer = setTimeout(() => {
      this._armTimer = 0;
      if (this._outside) document.addEventListener("click", this._outside);
    }, 0);
    document.addEventListener("keydown", this._onKey);
  }

  _disarm() {
    if (this._armTimer) { clearTimeout(this._armTimer); this._armTimer = 0; }
    if (this._outside) { document.removeEventListener("click", this._outside); this._outside = null; }
    if (this._onKey) { document.removeEventListener("keydown", this._onKey); this._onKey = null; }
  }

  async _navClick(id, item) {
    if (this._busy) return;
    if (id === this._activeId) { this._close(); return; }
    if (!this._onClick) return;
    this._busy = true;
    item.classList.add("is-loading");
    for (const b of this._items.values()) b.disabled = true;
    try {
      await this._onClick(id);
    } finally {
      if (!this._disposed) {
        item.classList.remove("is-loading");
        for (const b of this._items.values()) b.disabled = false;
        this._busy = false;
        this._close(true);
      }
    }
  }

  update(progress, force = false) {
    if (!force && Math.abs(progress - this._last) < 1e-5) return;
    this._last = progress;
    const starts = this._starts;
    const n = this._nBars;
    if (n === 0) return;
    let bz;
    if (progress <= starts[0]) {
      bz = BZ_START;
      this._setFills(-1, 0);
    } else if (progress >= starts[n]) {
      bz = 0;
      this._setFills(n, 0);
    } else {
      let i = 0;
      while (i < n - 1 && progress >= starts[i + 1]) i++;
      const t = (progress - starts[i]) / (starts[i + 1] - starts[i] || 1);
      bz = BZ_START - (i + t) * BZ_STEP;
      this._setFills(i, t);
    }
    const shown = Math.round(bz);
    if (shown !== this._lastBz) {
      this._lastBz = shown;
      this._count.textContent = `${shown} BZ`;
    }
  }

  // Bars before `bar` full, after it empty, `bar` itself at `t`.
  _setFills(bar, t) {
    for (let i = 0; i < this._nBars; i++) {
      const q = i < bar ? FILL_Q : i > bar ? 0 : Math.round(t * FILL_Q);
      const f = this._fills[i];
      if (f.q !== q) {
        f.q = q;
        f.el.style.transform = `scaleX(${q / FILL_Q})`;
      }
    }
  }

  dispose() {
    this._disposed = true;
    this._disarm();
    this._toggle.removeEventListener("click", this._onTap);
    this.el.remove();
    this._menu.remove();
    this._onClick = null;
  }
}

/* ═════════════ public ═════════════ */

export function createScrollRuler({
  segments,
  navItems,
  parent = document.body,
  mobileQuery = "(max-width: 768px)",
} = {}) {
  const segs = Array.isArray(segments) ? segments : [];
  const items = Array.isArray(navItems)
    ? navItems
    : segs.filter((s) => s.label).map(({ id, label }) => ({ id, label }));

  // Everything a variant swap has to carry across.
  const state = {
    progress: 0,
    activeId: null,
    navEnabled: false,
    theme: "light",
    visible: true,
    onClick: null,
  };

  const mql = typeof matchMedia === "function" ? matchMedia(mobileQuery) : null;
  let variant = null;
  let isPhone = false;

  const mount = () => {
    isPhone = !!(mql && mql.matches);
    variant = new (isPhone ? PhoneTimeline : DesktopRuler)(parent, segs, items, state);
    variant.setActiveSegment(state.activeId);
    variant.onStageClick(state.onClick);
    variant.setNavEnabled(state.navEnabled);
    variant.update(state.progress, true);
  };

  const onMediaChange = () => {
    if (!variant || !!mql.matches === isPhone) return;
    variant.dispose();
    mount();
  };

  mount();
  if (mql) {
    if (mql.addEventListener) mql.addEventListener("change", onMediaChange);
    else mql.addListener(onMediaChange); // Safari < 14
  }

  return {
    get el() { return variant ? variant.el : null; },
    update(progress, force = false) {
      state.progress = clamp01(+progress);
      if (variant) variant.update(state.progress, force);
    },
    setActiveSegment(id) {
      state.activeId = id;
      if (variant) variant.setActiveSegment(id);
    },
    setNavEnabled(on) {
      state.navEnabled = !!on;
      if (variant) variant.setNavEnabled(state.navEnabled);
    },
    onStageClick(fn) {
      state.onClick = typeof fn === "function" ? fn : null;
      if (variant) variant.onStageClick(state.onClick);
    },
    setTheme(theme) {
      state.theme = theme === "ink" ? "ink" : "light";
      if (variant) variant.setTheme(state.theme);
    },
    setVisible(visible) {
      state.visible = !!visible;
      if (variant) variant.setVisible(state.visible);
    },
    dispose() {
      if (!variant) return;
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener("change", onMediaChange);
        else mql.removeListener(onMediaChange);
      }
      variant.dispose();
      variant = null;
    },
  };
}
