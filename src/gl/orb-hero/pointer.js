import * as THREE from 'three';

/**
 * ONE normalised pointer. Mouse and touch feed the same vector — touch is the
 * same code path, not a fallback. Every consumer lerps at its own speed:
 * parallax slow, fluid immediate.
 *
 * glNormalized: 0..1, y-flipped (GL origin bottom-left).
 * glScreenSpace: CSS pixels, y-flipped.
 */
class Pointer {
  constructor() {
    this.glNormalized = new THREE.Vector2(0.5, 0.5);
    this.glScreenSpace = new THREE.Vector2(0, 0);
    this.previous = new THREE.Vector2(0, 0);
    this.delta = new THREE.Vector2(0, 0);
    this.active = false;
    this.hasMoved = false;
    this._bound = false;
    this._seg = new THREE.Vector2(0, 0);
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    const move = (x, y) => {
      this.previous.copy(this.glScreenSpace);
      this.glScreenSpace.set(x, window.innerHeight - y);
      this.glNormalized.set(x / window.innerWidth, 1 - y / window.innerHeight);
      // ACCUMULATE across the frame, never overwrite. mousemove fires far more
      // often than rAF — a 120Hz mouse delivers a frame's motion as several
      // small segments — so assigning here hands the fluid only the LAST slice
      // and silently divides the force by however many events arrived. It also
      // makes any harness that fires one event per frame read several times
      // stronger than a real browser, which is exactly how this shipped
      // "verified" and invisible. Zeroed once per frame in endFrame().
      this._seg.subVectors(this.glScreenSpace, this.previous);
      this.delta.add(this._seg);
      this.active = true;
      this.hasMoved = true;
    };

    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), { passive: true });
    window.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0];
        if (!t) return;
        // Seed both ends so the first touchmove doesn't inject a huge delta
        // from wherever the pointer last was.
        this.glScreenSpace.set(t.clientX, window.innerHeight - t.clientY);
        this.previous.copy(this.glScreenSpace);
        move(t.clientX, t.clientY);
      },
      { passive: true }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      },
      { passive: true }
    );
    // resetOnTouchEnds — lifting a finger returns the field to rest instead of
    // leaving a phantom force parked at the last touch point.
    const end = () => {
      this.active = false;
      this.delta.set(0, 0);
    };
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
  }

  /** Consume this frame's motion. Call once per frame, after the sim reads it. */
  endFrame() {
    this.delta.multiplyScalar(0);
  }
}

export const pointer = new Pointer();
