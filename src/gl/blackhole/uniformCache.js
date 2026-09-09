// Each black-hole engine exclusively owns its context and programs. Uniforms
// persist across draws/program switches, so unchanged values need no driver
// call. Compare the current values (including mutable CONFIG colors) rather
// than treating any artistic setting as permanently constant.
export function createUniformCache(gl) {
  const values = new Map();
  const scalar = (method) => (location, value) => {
    if (location === null || values.get(location) === value) return;
    gl[method](location, value);
    values.set(location, value);
  };
  return {
    uniform1f: scalar('uniform1f'),
    uniform1i: scalar('uniform1i'),
    uniform2f(location, x, y) {
      if (location === null) return;
      let previous = values.get(location);
      if (previous && previous[0] === x && previous[1] === y) return;
      gl.uniform2f(location, x, y);
      if (!previous) values.set(location, previous = [x, y]);
      else { previous[0] = x; previous[1] = y; }
    },
    uniform3fv(location, vector) {
      if (location === null) return;
      let previous = values.get(location);
      if (previous && previous[0] === vector[0]
        && previous[1] === vector[1] && previous[2] === vector[2]) return;
      gl.uniform3fv(location, vector);
      if (!previous) values.set(location, previous = Array.from(vector));
      else { previous[0] = vector[0]; previous[1] = vector[1]; previous[2] = vector[2]; }
    },
  };
}
