// The previous Buildanta animation is kept intact and can be previewed without
// restoring files. The ZeroMirror source scene is the production default.
export const USE_ZERO_MIRROR = typeof location === "undefined"
  || new URLSearchParams(location.search).get("consultAnimation") !== "legacy";
