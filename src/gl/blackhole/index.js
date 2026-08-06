/**
 * Site adapter: bundles the black-hole engine's shaders via Vite ?raw and
 * mounts the WE SCALE exit beat. See BlackholeGateBeat.js for the contract
 * and ~claude code/blackhole/SPEC.md for the engine's do-not-regress list.
 */
import vert from "./shaders/fullscreen.vert.glsl?raw";
import scene from "./shaders/scene.frag.glsl?raw";
import prefilter from "./shaders/bloom_prefilter.frag.glsl?raw";
import down from "./shaders/bloom_down.frag.glsl?raw";
import up from "./shaders/bloom_up.frag.glsl?raw";
import composite from "./shaders/composite.frag.glsl?raw";
import { createBlackholeGateBeat } from "./BlackholeGateBeat.js";

export function mountBlackholeBeat(host, { reducedMotion = false } = {}) {
  return createBlackholeGateBeat(host, {
    shaders: { vert, scene, prefilter, down, up, composite },
    reducedMotion,
    dprCap: 1.5,          // between the site's ConsultHand (1.2) and Scene (1.75)
  });
}
