// Thin WebGL2 helpers. No framework — a fullscreen raymarch needs none.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  // HDR render targets: RGBA16F is renderable under either extension.
  const floatOK =
    gl.getExtension('EXT_color_buffer_float') ||
    gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');

  return { gl, hdr: !!floatOK };
}

/* D-109: compile/link are only STARTED here. Asking for their status right
   away made the page wait for the driver (~0.45 s for the black hole's five
   programs, during the loader). `settlePrograms` waits for them without
   blocking, then runs the same checks — so a failure still throws from
   createBlackhole, exactly as before. */
export function compileProgram(gl, vertSrc, fragSrc, label) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const p = gl.createProgram();
  const vs = make(gl.VERTEX_SHADER, vertSrc);
  const fs = make(gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  // Cache uniform locations on first use.
  const locs = {};
  return {
    prog: p,
    check() {
      for (const s of [vs, fs]) {
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          throw new Error(`[${label}] shader compile failed:\n${gl.getShaderInfoLog(s)}`);
        }
      }
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(`[${label}] link failed: ${gl.getProgramInfoLog(p)}`);
      }
    },
    use() { gl.useProgram(p); },
    loc(name) {
      if (!(name in locs)) locs[name] = gl.getUniformLocation(p, name);
      return locs[name];
    },
  };
}

/** Waits (polling, never blocking) until every program has finished
 *  compiling, then checks each; throws like compileProgram used to. */
export async function settlePrograms(gl, programs) {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  if (ext) {
    const started = performance.now();
    while (programs.some((q) => !gl.getProgramParameter(q.prog, ext.COMPLETION_STATUS_KHR))) {
      if (gl.isContextLost() || performance.now() - started > 10000) break;
      await new Promise((r) => setTimeout(r, 16));
    }
  }
  programs.forEach((q) => q.check());
}

// One HDR render target. Created once per size — resizing goes through the
// pool below, never per-frame (that exact pattern once leaked a GPU dry).
export function makeTarget(gl, w, h, hdr) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (hdr) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

export function disposeTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.tex);
}

export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
