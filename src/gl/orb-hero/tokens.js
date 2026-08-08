import * as THREE from 'three';

/**
 * ONE colour file. Tokens are authored sRGB (params.js); the transfer function
 * is applied exactly once, here, at upload. SPEC carried caveat #1: their
 * Theatre state stores sRGB while the live GL uniforms read back linear, so
 * #DB1010 becomes #B50101 on the GPU. Pick a space, convert once, explicitly.
 */

const cache = new Map();

function channel(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** '#RRGGBB' (sRGB) → THREE.Vector3 in LINEAR working space. */
export function linear(hex) {
  if (cache.has(hex)) return cache.get(hex).clone();
  const n = parseInt(hex.slice(1), 16);
  const v = new THREE.Vector3(
    channel(((n >> 16) & 255) / 255),
    channel(((n >> 8) & 255) / 255),
    channel((n & 255) / 255)
  );
  cache.set(hex, v);
  return v.clone();
}

/** Same, as a THREE.Color (for lights / material colours). */
export function linearColor(hex) {
  const v = linear(hex);
  return new THREE.Color().setRGB(v.x, v.y, v.z, THREE.LinearSRGBColorSpace);
}

/** Write an sRGB hex into an existing linear Vector3 uniform, in place. */
export function setLinear(target, hex) {
  const v = linear(hex);
  target.set(v.x, v.y, v.z);
  return target;
}
