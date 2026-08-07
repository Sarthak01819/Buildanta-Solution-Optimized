/**
 * Site adapter for the contact room — mirrors gl/blackhole/index.js:
 * the shaders are bundled here via ?raw and handed to the engine, so the
 * built site never fetches a .glsl at runtime.
 */
import vert from "../blackhole/shaders/fullscreen.vert.glsl?raw";
import scene from "../blackhole/shaders/scene.frag.glsl?raw";
import prefilter from "../blackhole/shaders/bloom_prefilter.frag.glsl?raw";
import down from "../blackhole/shaders/bloom_down.frag.glsl?raw";
import up from "../blackhole/shaders/bloom_up.frag.glsl?raw";
import composite from "../blackhole/shaders/composite.frag.glsl?raw";
import { createContactRoom } from "./contactRoom.js";

/** The six engine shaders as strings — one place, two consumers. */
export const BH_SHADERS = { vert, scene, prefilter, down, up, composite };

export function mountContactRoom(section, { reducedMotion = false } = {}) {
  return createContactRoom(section, { shaders: BH_SHADERS, reducedMotion });
}
