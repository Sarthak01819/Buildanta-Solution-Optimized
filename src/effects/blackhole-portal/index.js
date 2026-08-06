/**
 * Black-hole portal — ported from ~/claude code/black-hole-bg (sealed module,
 * git v3). GLSL and the 18-MCQ-locked gesture chain are copied VERBATIM; do
 * not redesign here. Class shape per the integration brief:
 *
 *   const p = new BlackholePortal(wrapEl, { portalLabel, onArm, onReturn });
 *   p.init();      // creates the canvas (never in markup), starts the loop
 *   p.destroy();   // the react reference's cleanup, line for line
 *
 * Gesture chain: move = follow · hold = spin-up → torn-blob collapse →
 * hold past full = magnetic ring button (armed; content inert; release keeps
 * the door) · click/Enter = supernova + cancelable `bh:enter` · scroll while
 * armed = re-grow with 480px rubber-band threshold · Esc returns.
 *
 * Guards that look strippable and are NOT (each is a shipped, fixed bug):
 * min/max clamps in the pull (fp16 NaN) · spin attenuated by pull · masks
 * gated on collapse activity · press snaps the intro fade · gesture timers on
 * the SIM clock · IO flag seeded true synchronously · reveal on proof-of-paint
 * · both touch gates on the magnet · strand watchdog on setInterval ·
 * inert/aria bookkeeping restored on every exit path.
 */

const VS = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define PI 3.14159265359

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_mass;
uniform float u_time;
uniform float u_spin;
uniform float u_radial;
uniform float u_swirl;
uniform float u_dark;
uniform float u_aberr;
uniform float u_ring;
uniform float u_collapse;
uniform float u_flash;
uniform float u_calm;
uniform float u_cZoom;
uniform float u_cTurns;
uniform float u_stretch;
uniform float u_fibers;
uniform float u_ripple;
uniform float u_torn;
uniform float u_arm;

vec2 swirl(vec2 uv, vec2 center, float amount) {
  vec2 d = uv - center;
  float a = amount * PI;
  float c = cos(a), s = sin(a);
  return center + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}

vec2 lensed(vec2 uv, vec2 center, vec2 n, float pull, float radial) {
  vec2 p = uv - n * pull * radial;
  float spinAmt = u_spin * clamp(pull * 3.0, 0.0, 1.0);
  return swirl(p, center, pull * u_swirl + spinAmt);
}

void main() {
  vec2 uv    = gl_FragCoord.xy / u_resolution;
  vec2 mouse = u_mouse / u_resolution;

  vec2  rel = uv - mouse;
  float r   = length(rel);
  float c   = u_collapse;
  float cc0 = max(c, 0.0);
  float act = (u_calm < 0.5) ? smoothstep(0.0, 0.15, cc0) : 0.0;
  float theta = 0.0;
  if (u_calm < 0.5 && abs(c) > 0.0001) {
    float ang = u_cTurns * PI * cc0 * (0.35 + 0.65 * exp(-r * 3.0));
    float ca = cos(ang), sa = sin(ang);
    rel = vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
    theta = atan(rel.y, rel.x);
    float st  = u_stretch * smoothstep(0.02, 0.3, cc0) * (1.0 - smoothstep(0.35, 0.65, cc0));
    float fib = 0.55 + 0.45 * sin(theta * u_fibers + u_time * 0.6);
    float w   = 1.0 - st * smoothstep(0.12, 0.7, r) * fib;
    w -= u_flash * step(c, 0.001) * 0.3 * (0.5 + 0.5 * sin(theta * u_fibers * 0.5 + 1.7));
    rel *= exp(c * u_cZoom * w);
  }
  vec2 p = mouse + rel;

  float liq = u_ripple * max(act, (u_calm < 0.5 ? u_flash * 0.7 : 0.0));
  if (liq > 0.001) {
    p += vec2(
      sin(p.y * 21.0 + u_time * 2.0) + 0.6 * sin(p.y * 47.0 - u_time * 1.3),
      cos(p.x * 19.0 - u_time * 1.7) + 0.6 * sin(p.x * 41.0 + u_time * 1.1)) * (0.011 * liq);
  }

  vec2  d    = p - mouse;
  float dist = max(length(d), 0.0015);
  float pull = min(u_mass / (dist * dist), 6.0);
  vec2  n    = d / dist;

  vec3 col = vec3(
    texture2D(u_image, lensed(p, mouse, n, pull, u_radial * (1.0 + u_aberr))).r,
    texture2D(u_image, lensed(p, mouse, n, pull, u_radial)).g,
    texture2D(u_image, lensed(p, mouse, n, pull, u_radial * (1.0 - u_aberr))).b);

  vec2 ob = max(max(-p, p - 1.0), vec2(0.0));
  float mask = 1.0 - smoothstep(0.0, 0.12, length(ob));
  if (act > 0.001) {
    vec2  q2 = p - vec2(0.5);
    float pa = atan(q2.y, q2.x);
    float tear = 0.5 * sin(pa * 7.0 + u_time * 0.8 + cc0 * 3.0)
               + 0.3 * sin(pa * 13.0 - u_time * 1.1)
               + 0.2 * sin(pa * 23.0 + u_time * 1.9);
    float Redge = 0.74 - u_torn * act * (0.17 + 0.17 * tear);
    float organic = 1.0 - smoothstep(Redge - 0.06, Redge + 0.02, length(q2));
    mask = mix(mask, min(mask, organic), act);
    float th = smoothstep(0.62, 0.95, cc0);
    if (th > 0.001) {
      float sa2 = 0.5 + 0.5 * sin(theta * u_fibers * 0.5 + u_time * 0.4);
      float cut = 0.93 * th;
      mask *= mix(1.0, smoothstep(cut - 0.12, cut, sa2), th);
    }
  }
  col *= mask;

  col -= pull * u_dark;

  float rh   = max(sqrt(u_mass * u_dark), 0.001);
  float band = smoothstep(rh * 0.95, rh * 1.3, dist) * (1.0 - smoothstep(rh * 1.5, rh * 2.4, dist));
  col += band * u_ring * vec3(1.0, 0.84, 0.58);

  if (u_calm > 0.5) col *= 1.0 - max(c, 0.0);

  float cc = max(c, 0.0);
  if (cc > 0.001) {
    float throb = mix(1.8 + 0.5 * sin(u_time * 3.0), 2.0, u_calm);
    col += vec3(1.0, 0.93, 0.80) * exp(-r * r / 0.0006) * cc * throb;
    col += vec3(1.0) * exp(-r * r / 0.00008) * cc * 1.2;
  }

  if (u_arm > 0.001) {
    float RB = 0.05 + 0.004 * sin(u_time * 2.2);
    float qb = (r - RB) * 80.0;
    col += vec3(1.0, 0.88, 0.62) * exp(-qb * qb) * u_arm * (0.8 + 0.25 * sin(u_time * 3.1));
  }

  if (u_flash > 0.001) {
    float R = (1.0 - u_flash) * 1.25;
    float q = (r - R) * 10.0;
    col += vec3(1.0, 0.94, 0.82) *
           (u_flash * u_flash * exp(-r * r / 0.004) * 3.4 + u_flash * exp(-q * q) * 1.7);
  }

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const TUNE = {
  MASS: 400, RADIAL: 0.15, SWIRL: 0.5, DARKEN: 0.25, ABERRATION: 0.03,
  RING: 0.22, FOLLOW: 0.08, MASS_EASE: 0.03, SPIN_UP: 0.03, SPIN_DECAY: 0.015,
  SPIN_MAX: 1.2, DPR_CAP: 2,
  DRIFT_X: 0.6, DRIFT_Y: 0.7, DRIFT_SPAN: 0.3,
  COLLAPSE_DELAY: 0.7, COLLAPSE_RAMP: 1.3, COLLAPSE_ZOOM: 45, COLLAPSE_TURNS: 2.2,
  STRETCH: 1.0, FIBERS: 28, RIPPLE: 1.0, TORN: 1.0,
  BLAST_TIME: 0.7, FLASH_TIME: 0.6, OVERSHOOT: 0.09,
  ARM_TIME: 0.6, BACK_THRESHOLD: 480,
  MAGNET: { STRENGTH: 0.5, REACH: 336, MAX: 38, EASE: 0.22, CHILD: 0.5 },
};

export class BlackholePortal {
  constructor(wrapEl, opts = {}) {
    this.wrap = wrapEl;
    this.opts = opts;
    this.dead = false;
    this._cleanup = null;
  }

  init() {
    if (this._cleanup || this.dead) return;
    const self = this;
    const wrap = this.wrap;
    const opts = this.opts;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = [];   // symmetric window-listener bookkeeping
    const on = (type, fn, o) => { addEventListener(type, fn, o); listeners.push([type, fn, o]); };

    const canvas = document.createElement('canvas');  // created here, NEVER in markup
    canvas.className = 'bh-canvas';
    wrap.appendChild(canvas);

    const dbg = (window.__bhp = { ready: false, err: null });

    let gl = null, U = null, prog = null;
    let raf = 0, rt = 0, io = null;
    const bail = (e) => { dbg.err = String((e && e.message) || e); canvas.remove(); };

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => { if (!self.dead) { try { start(); } catch (e) { bail(e); } } };
    img.onerror = () => { if (!self.dead) bail(new Error('starfield failed to load')); };
    img.src = opts.starfieldUrl || '/assets/starfield.jpg';

    let onLost = null, onRestored = null;
    let portalClose = () => {};
    let clearDevour = () => {};

    function start() {
      const S = { size: 0, css: 0, dpr: 1 };
      const mouse = { tx: 0, ty: 0, x: 0, y: 0, moved: false, down: false };
      let mass = reduced.matches ? TUNE.MASS : 0;
      let spin = 0, time = 0, drawn = false, lost = false;
      const hold = { t: 0, c: 0, c0: 0, bt: 0, flash: 0, phase: 'idle',
                     armT: 0, arm: 0, back: 0, lastW: 0, enterT: 0, goHref: null, returnQuiet: false };

      const toCanvas = (cx, cy) => [cx * S.dpr, S.size - cy * S.dpr];

      const devour = Array.from((opts.devourRoot || document).querySelectorAll('[data-devour]'));
      let devourC = [];
      function measureDevour() {
        if (hold.c !== 0) return;
        devourC = devour.map((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        });
      }
      function applyDevour() {
        if (!devour.length) return;
        const e = hold.c >= 0 ? Math.pow(hold.c, 1.6) : hold.c;
        const cx = mouse.x / S.dpr, cy = (S.size - mouse.y) / S.dpr;
        for (let i = 0; i < devour.length; i++) {
          const el = devour[i], ctr = devourC[i];
          if (!ctr) continue;
          if (e === 0) {
            if (el.style.transform || el.style.opacity) {
              el.style.transform = ''; el.style.opacity = ''; el.style.willChange = '';
            }
            continue;
          }
          if (reduced.matches) {
            el.style.willChange = 'opacity';
            el.style.transform = '';
            el.style.opacity = String(Math.max(1 - Math.max(hold.c, 0), 0));
            continue;
          }
          const g = Math.max(e, 0);
          el.style.willChange = 'transform';
          el.style.transform = 'translate(' + ((cx - ctr.x) * e).toFixed(2) + 'px,'
            + ((cy - ctr.y) * e).toFixed(2) + 'px) rotate(' + ((i % 2 ? -55 : 45) * g).toFixed(2)
            + 'deg) scale(' + Math.max(1 - g * 1.02, 0.001).toFixed(4) + ')';
        }
      }
      clearDevour = () => {
        for (const el of devour) { el.style.transform = ''; el.style.opacity = ''; el.style.willChange = ''; }
      };

      /* ── the portal button (CURSOR-01 magnet, native port) ── */
      const portal = (() => {
        const LABEL = opts.portalLabel || 'ENTER';
        const HREF = opts.portalHref || '#enter';
        const M = TUNE.MAGNET;
        const fineMq = matchMedia('(hover: hover) and (pointer: fine)');
        let btn = null, lab = null, cx = 0, cy = 0;
        let tx = 0, ty = 0, x = 0, y = 0, lx = 0, ly = 0;
        let nearV = 0, restAt = 0, watchdog = 0, ltY = null;
        const covered = [];

        function open() {
          if (btn) return;
          btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bh-portal';
          lab = document.createElement('span');
          lab.className = 'bh-portal__label';
          lab.textContent = LABEL;
          btn.appendChild(lab);
          cx = Math.min(Math.max(mouse.x / S.dpr, 84), innerWidth - 84);
          cy = Math.min(Math.max((S.size - mouse.y) / S.dpr, 84), innerHeight - 84);
          btn.style.left = cx + 'px';
          btn.style.top = cy + 'px';
          btn.style.transform = 'translate(-50%, -50%)';
          btn.addEventListener('click', enter);
          document.body.appendChild(btn);
          btn.focus({ preventScroll: true });
          for (const el of devour) { covered.push([el, el.getAttribute('aria-hidden')]); el.setAttribute('aria-hidden', 'true'); el.inert = true; }
          addEventListener('wheel', onWheelArmed, { passive: false });
          addEventListener('keydown', onKey);
          addEventListener('blur', onLeave);
          document.addEventListener('visibilitychange', onLeave);
          tx = ty = x = y = lx = ly = 0; nearV = 0; ltY = null;
          opts.onArm && opts.onArm();
        }

        function close() {
          if (!btn) return;
          removeEventListener('wheel', onWheelArmed);
          removeEventListener('keydown', onKey);
          removeEventListener('blur', onLeave);
          document.removeEventListener('visibilitychange', onLeave);
          clearInterval(watchdog); watchdog = 0;
          btn.remove(); btn = null; lab = null;
          for (const [el, prev] of covered) {
            el.inert = false;
            if (prev === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', prev);
          }
          covered.length = 0;
        }
        portalClose = close;

        function onWheelArmed(e) {
          if (hold.phase !== 'armed') return;
          e.preventDefault();
          hold.back += Math.abs(e.deltaY);
          hold.lastW = time;
          run();
        }
        function onKey(e) { if (e.key === 'Escape' && hold.phase === 'armed') portalReturn(); }
        function onLeave() { if (document.hidden || !document.hasFocus()) home(true); }

        function setNear(n) {
          if (n === nearV) return;
          if (n !== 0 && Math.abs(n - nearV) < 0.008) return;
          nearV = n;
          if (btn) btn.style.setProperty('--bh-near', n.toFixed(3));
        }

        function point(e) {
          if (!btn) return;
          if (e.pointerType === 'touch') {
            if (e.buttons) {
              if (ltY !== null) { hold.back += Math.abs(e.clientY - ltY) * 2; hold.lastW = time; }
              ltY = e.clientY; run();
            } else ltY = null;
            return;
          }
          if (e.pointerType !== 'mouse') return;
          if (!fineMq.matches || reduced.matches) return;
          const half = 64;
          const gx = Math.max((cx - half) - e.clientX, 0, e.clientX - (cx + half));
          const gy = Math.max((cy - half) - e.clientY, 0, e.clientY - (cy + half));
          const near = Math.max(0, Math.min(1, 1 - Math.hypot(gx, gy) / M.REACH));
          setNear(near);
          const falloff = near * near;
          let ox = (e.clientX - cx) * M.STRENGTH * falloff;
          let oy = (e.clientY - cy) * M.STRENGTH * falloff;
          const mag = Math.hypot(ox, oy);
          if (mag > M.MAX) { ox *= M.MAX / mag; oy *= M.MAX / mag; }
          tx = ox; ty = oy;
          if (ox === 0 && oy === 0) { restAt = performance.now(); armWatchdog(); }
          run();
        }

        function home(immediate) {
          tx = ty = 0; setNear(0); restAt = performance.now();
          if (immediate && btn) {
            x = y = lx = ly = 0;
            btn.style.transform = 'translate(-50%, -50%)';
            if (lab) lab.style.transform = '';
          } else armWatchdog();
        }

        function frame(f) {
          if (!btn || reduced.matches) return;
          const k = ease(M.EASE, f);
          x += (tx - x) * k;
          y += (ty - y) * k;
          lx += (tx * M.CHILD - lx) * k * 0.87;
          ly += (ty * M.CHILD - ly) * k * 0.87;
          btn.style.transform = 'translate(-50%, -50%) translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)';
          if (lab) lab.style.transform = 'translate(' + lx.toFixed(2) + 'px,' + ly.toFixed(2) + 'px)';
        }

        function armWatchdog() {
          if (watchdog) return;
          watchdog = setInterval(() => {
            if (!btn) { clearInterval(watchdog); watchdog = 0; return; }
            if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) { clearInterval(watchdog); watchdog = 0; return; }
            if (tx !== 0 || ty !== 0) return;
            if (performance.now() - restAt < 1300) return;
            home(true);
          }, 250);
        }

        function enter() {
          if (hold.phase !== 'armed') return;
          const ev = new CustomEvent('bh:enter', { detail: { href: HREF }, bubbles: true, cancelable: true });
          const useDefault = window.dispatchEvent(ev);
          home(true);
          if (reduced.matches) {
            if (useDefault) { location.href = HREF; return; }
            portalReturn(true);
            return;
          }
          hold.phase = 'entering'; hold.enterT = 0;
          hold.goHref = useDefault ? HREF : null;
          if (opts.holdOnEnter) close();   // the ring is spent; the sky keeps burning
          run();
        }

        return { open, close, point, frame, get el() { return btn; } };
      })();

      function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }

      function initGL() {
        gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false })
          || canvas.getContext('experimental-webgl', { alpha: false });
        if (!gl) throw new Error('no webgl');

        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);

        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        U = {};
        for (const n of ['u_image', 'u_resolution', 'u_mouse', 'u_mass', 'u_time', 'u_spin',
                         'u_radial', 'u_swirl', 'u_dark', 'u_aberr', 'u_ring',
                         'u_collapse', 'u_flash', 'u_calm', 'u_cZoom', 'u_cTurns',
                         'u_stretch', 'u_fibers', 'u_ripple', 'u_torn', 'u_arm'])
          U[n] = gl.getUniformLocation(prog, n);
        gl.uniform1i(U.u_image, 0);
        gl.uniform1f(U.u_radial, TUNE.RADIAL);
        gl.uniform1f(U.u_swirl, TUNE.SWIRL);
        gl.uniform1f(U.u_dark, TUNE.DARKEN);
        gl.uniform1f(U.u_aberr, TUNE.ABERRATION);
        gl.uniform1f(U.u_ring, TUNE.RING);
        gl.uniform1f(U.u_cZoom, Math.log(TUNE.COLLAPSE_ZOOM));
        gl.uniform1f(U.u_cTurns, TUNE.COLLAPSE_TURNS);
        gl.uniform1f(U.u_stretch, TUNE.STRETCH);
        gl.uniform1f(U.u_fibers, TUNE.FIBERS);
        gl.uniform1f(U.u_ripple, TUNE.RIPPLE);
        gl.uniform1f(U.u_torn, TUNE.TORN);

        resize();
      }

      function resize() {
        S.dpr = Math.min(devicePixelRatio || 1, TUNE.DPR_CAP);
        S.css = Math.max(innerWidth, innerHeight);
        S.size = Math.round(S.css * S.dpr);
        canvas.width = canvas.height = S.size;
        canvas.style.width = canvas.style.height = S.css + 'px';
        gl.viewport(0, 0, S.size, S.size);
        gl.uniform2f(U.u_resolution, S.size, S.size);
      }

      const ease = (k, f) => 1 - Math.pow(1 - k, f);
      function tick(dt) {
        const f = dt * 60;
        time += dt;
        if (!mouse.moved && !reduced.matches) {
          [mouse.tx, mouse.ty] = toCanvas(
            innerWidth * (0.5 + TUNE.DRIFT_SPAN * Math.sin(time * TUNE.DRIFT_X)),
            innerHeight * (0.5 + TUNE.DRIFT_SPAN * Math.sin(time * TUNE.DRIFT_Y)));
        }
        const k = ease(TUNE.FOLLOW, f);
        mouse.x += (mouse.tx - mouse.x) * k;
        mouse.y += (mouse.ty - mouse.y) * k;
        mass += (TUNE.MASS - mass) * ease(TUNE.MASS_EASE, f);
        if (mouse.down) spin = Math.min(spin + TUNE.SPIN_UP * f, TUNE.SPIN_MAX);
        else            spin -= spin * ease(TUNE.SPIN_DECAY, f);

        if (hold.phase === 'armed') {
          hold.arm = 1; hold.flash = 0;
          if (hold.back > 0 && time - hold.lastW > 0.35) {
            hold.back = Math.max(0, hold.back - dt * 900);
          }
          hold.c = 1 - Math.min(hold.back / TUNE.BACK_THRESHOLD, 1) * 0.5;
          if (hold.back >= TUNE.BACK_THRESHOLD) portalReturn();
        } else if (hold.phase === 'entering') {
          hold.enterT += dt;
          hold.c = 1; hold.arm = Math.max(1 - hold.enterT * 2.5, 0);
          hold.flash = Math.min(hold.enterT / 0.18, 1) * 1.25
            * (opts.holdOnEnter                       // peak .18s → dark by .73s
                ? Math.max(1 - (hold.enterT - 0.18) / 0.55, 0)
                : 1);
          if (hold.enterT >= 0.22 && hold.goHref) { const h = hold.goHref; hold.goHref = null; location.href = h; }
          // Host-ride mode: the module's SPA hand-back (re-grow the universe
          // from the button) is exactly the "stars open up again" bug — with
          // holdOnEnter the collapsed state is HELD until the host tears down.
          if (hold.enterT >= 0.6 && !hold.goHref && !opts.holdOnEnter) portalReturn(true);
        } else if (mouse.down) {
          hold.t += dt;
          const raw = Math.min(Math.max((hold.t - TUNE.COLLAPSE_DELAY) / TUNE.COLLAPSE_RAMP, 0), 1);
          hold.c = reduced.matches ? raw : raw * raw * (3 - 2 * raw);
          hold.flash = 0;
          hold.phase = raw > 0 ? 'collapsing' : 'winding';
          if (raw >= 1) {
            hold.armT += dt;
            hold.arm = reduced.matches ? 1 : Math.min(hold.armT / TUNE.ARM_TIME, 1);
            if (hold.arm >= 1) armPortal();
          } else { hold.armT = 0; hold.arm = 0; }
        } else if (hold.phase === 'collapsing' && reduced.matches) {
          hold.phase = 'idle'; hold.t = 0; hold.c = 0; hold.arm = 0;
        } else if (hold.phase === 'collapsing' || hold.phase === 'blast') {
          hold.arm = 0;
          if (hold.phase === 'collapsing') {
            if (hold.c < 0.04) { hold.phase = 'idle'; hold.t = 0; hold.c = 0; }
            else { hold.phase = 'blast'; hold.bt = 0; hold.c0 = hold.c; }
          }
          if (hold.phase === 'blast') {
            hold.bt += dt;
            const q = Math.min(hold.bt / TUNE.BLAST_TIME, 1);
            const back = 1 - Math.pow(1 - q, 3);
            hold.c = hold.c0 * (1 - back) - TUNE.OVERSHOOT * Math.sin(q * Math.PI);
            hold.flash = Math.max(1 - hold.bt / TUNE.FLASH_TIME, 0) * Math.min(hold.c0 * 2.5, 1)
                       * (hold.returnQuiet ? 0.3 : 1);
            if (q >= 1) { hold.phase = 'idle'; hold.t = 0; hold.c = 0; hold.flash = 0; hold.returnQuiet = false; }
          }
        } else if (!mouse.down) { hold.t = 0; hold.phase = 'idle'; hold.arm = 0; hold.armT = 0; }
      }

      function armPortal() {
        if (hold.phase === 'armed') return;
        hold.phase = 'armed'; hold.arm = 1; hold.back = 0; hold.c = 1;
        mouse.down = false; spin = 0;
        portal.open();
      }

      function portalReturn(quiet = true) {
        portal.close();
        hold.arm = 0; hold.back = 0; hold.armT = 0; hold.enterT = 0; hold.goHref = null;
        opts.onReturn && opts.onReturn();
        if (reduced.matches) { hold.phase = 'idle'; hold.t = 0; hold.c = 0; hold.flash = 0; return; }
        hold.phase = 'blast'; hold.bt = 0; hold.c0 = Math.max(hold.c, 0.05); hold.returnQuiet = quiet;
        run();
      }

      function draw() {
        gl.uniform2f(U.u_mouse, mouse.x, mouse.y);
        gl.uniform1f(U.u_mass, mass * 0.00001);
        gl.uniform1f(U.u_time, time);
        gl.uniform1f(U.u_spin, spin);
        gl.uniform1f(U.u_collapse, hold.c);
        gl.uniform1f(U.u_flash, hold.flash);
        gl.uniform1f(U.u_calm, reduced.matches ? 1 : 0);
        gl.uniform1f(U.u_arm, hold.arm);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        applyDevour();
        if (!drawn) { drawn = true; canvas.classList.add('on'); }
      }

      let last = 0, visible = true;
      function frame(now) {
        raf = 0;
        if (!visible || lost || self.dead) return;
        const dt = Math.min((now - (last || now)) / 1000, 0.1);
        last = now;
        tick(dt);
        portal.frame(dt * 60);
        draw();
        if (reduced.matches && !mouse.down && spin < 0.001 && hold.c === 0 && hold.flash === 0 &&
            Math.abs(mouse.tx - mouse.x) < 0.5 && Math.abs(mouse.ty - mouse.y) < 0.5) return;
        raf = requestAnimationFrame(frame);
      }
      const run = () => { if (!raf && visible && !lost && !self.dead) { last = 0; raf = requestAnimationFrame(frame); } };

      io = new IntersectionObserver((es) => {
        visible = es[es.length - 1].isIntersecting;
        if (visible) run();
      });
      io.observe(canvas);

      function setTarget(cx, cy) { [mouse.tx, mouse.ty] = toCanvas(cx, cy); mouse.moved = true; run(); }
      const passive = { passive: true };
      const press = () => {
        // Locked while the portal is only the sky behind the burning note:
        // the hole still follows the cursor, but nothing can be collapsed.
        if (opts.locked && opts.locked()) return;
        if (hold.phase === 'armed' || hold.phase === 'entering') return;
        mouse.down = true; hold.t = 0; hold.bt = 0; hold.armT = 0;
        canvas.style.transition = 'none'; canvas.classList.add('on');
        run();
      };
      on('pointermove', (e) => {
        if (!e.isPrimary) return;
        if (hold.phase === 'armed' || hold.phase === 'entering') { portal.point(e); return; }
        setTarget(e.clientX, e.clientY);
      }, passive);
      on('pointerdown', (e) => {
        if (e.isPrimary && e.button === 0) {
          if (hold.phase === 'armed' || hold.phase === 'entering') return;
          setTarget(e.clientX, e.clientY); press();
        }
      }, passive);
      on('pointerup', () => { mouse.down = false; run(); }, passive);
      on('pointercancel', () => { mouse.down = false; }, passive);
      on('contextmenu', (e) => { if (mouse.down && hold.t > 0.35) e.preventDefault(); });
      on('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(() => { resize(); measureDevour(); draw(); run(); }, 100);
      });

      onLost = (e) => {
        e.preventDefault();
        lost = true; drawn = false;
        canvas.classList.remove('on');
      };
      onRestored = () => {
        lost = false;
        try { initGL(); draw(); run(); } catch (e) { bail(e); }
      };
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);

      initGL();
      [mouse.tx, mouse.ty] = toCanvas(innerWidth / 2, innerHeight / 2);
      mouse.x = mouse.tx; mouse.y = mouse.ty;
      measureDevour();
      draw();
      run();

      Object.assign(dbg, {
        tune: TUNE,
        state: () => ({ tx: mouse.tx, ty: mouse.ty, x: mouse.x, y: mouse.y, moved: mouse.moved,
                        down: mouse.down, mass, spin, time, size: S.size, dpr: S.dpr, drawn, visible,
                        c: hold.c, flash: hold.flash, phase: hold.phase, holdT: hold.t,
                        arm: hold.arm, back: hold.back }),
        press: () => press(),
        release: () => { mouse.down = false; run(); },
        step: (frames) => { for (let i = 0; i < frames; i++) { tick(1 / 60); portal.frame(1); } draw(); },
        renderAt: (ms, o = {}) => {
          time = ms / 1000;
          if (o.collapse !== undefined) hold.c = o.collapse;
          if (o.flash !== undefined) hold.flash = o.flash;
          if (o.arm !== undefined) hold.arm = o.arm;
          if (o.mx !== undefined) {
            [mouse.x, mouse.y] = toCanvas(o.mx, o.my);
            [mouse.tx, mouse.ty] = [mouse.x, mouse.y];
            mouse.moved = true;
          }
          draw();
        },
        pause: () => { if (raf) cancelAnimationFrame(raf); raf = 0; },
        resume: run,
      });
      dbg.ready = true;

      self._cleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        clearTimeout(rt);
        for (const [type, fn, o] of listeners) removeEventListener(type, fn, o);
        io.disconnect();
        img.onload = img.onerror = null;
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        portalClose();
        clearDevour();
        if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
        canvas.remove();
        if (window.__bhp === dbg) delete window.__bhp;
      };
    }

    // If start() never ran (image still loading at destroy), minimal cleanup:
    this._cleanup = this._cleanup || (() => {
      img.onload = img.onerror = null;
      canvas.remove();
      if (window.__bhp === dbg) delete window.__bhp;
    });
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    if (this._cleanup) this._cleanup();
    this._cleanup = null;
  }
}
