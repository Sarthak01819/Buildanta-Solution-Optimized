#version 300 es
/* The scene pass: bends camera rays through a Schwarzschild field, accumulates
 * accretion-disk emission at every disk-plane crossing, and lands escaped rays
 * on a procedural starfield. Outputs HDR — bloom and grade run downstream.
 *
 * Units: Schwarzschild radius rs = 1. Photon sphere at r = 1.5.
 * Disk lies in the y = 0 plane.
 *
 * The integrator loop is bounded by a UNIFORM on purpose: constant-bound loops
 * unroll and can freeze a fresh tab for tens of seconds while Metal compiles.
 */
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform int   uSteps;

uniform float uCamDist;
uniform float uFovY;      // radians
uniform float uFrameY;    // vertical framing shift, in fractions of the half-fov
uniform float uPitch;     // radians (base + parallax, summed on CPU)
uniform float uYaw;       // radians
uniform float uRoll;      // radians

uniform float uDiskRIn;
uniform float uDiskROut;
uniform float uDiskGain;  // breathing already applied on CPU
uniform float uHotRim;
uniform float uOmega0;
uniform float uShearPeriod;
uniform float uDoppler;
uniform float uTurbContrast;
uniform float uAlphaGain;

uniform vec3 uColHot;
uniform vec3 uColMid;
uniform vec3 uColOuter;
uniform vec3 uColRim;

uniform float uRingGain;  // cursor boost already applied on CPU
uniform float uRingWidth;

uniform float uStarDensity;
uniform float uStarGain;
uniform float uTwinkle;
uniform float uHazeGain;

/* ------------------------------------------------ hash / noise / fbm ---- */

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0, 0, 0)), hash13(i + vec3(1, 0, 0)), u.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {       // fixed 4 octaves: tiny, safe to unroll
    s += a * vnoise(p);
    p = p * 2.13 + vec3(7.7);
    a *= 0.5;
  }
  return s;
}

/* ---------------------------------------------------------- the disk ---- */

/* Turbulent surface density at (r, phi), advected by Keplerian shear.
 * Two half-period-offset phases crossfade so the shear never winds up into
 * infinite stripes — the churn is endless and seam-free. */
float diskField(float r, float phi, float t) {
  float u = log(r);                       // constant feature scale across radii
  float omega = uOmega0 * pow(r, -1.5);

  float halfP = uShearPeriod * 0.5;
  float t1 = mod(t, uShearPeriod);
  float t2 = mod(t + halfP, uShearPeriod);
  // Each phase's weight must hit ZERO at the moment its own clock wraps.
  float wA = 1.0 - abs(t1 / uShearPeriod * 2.0 - 1.0);

  float f = 0.0;
  for (int k = 0; k < 2; k++) {           // two phases, fixed tiny loop
    float tk = ((k == 0) ? t1 : t2) - halfP;
    float w = phi + omega * tk;
    vec2 cs = vec2(cos(w), sin(w));
    // Streaks: thin radially, long along the flow.
    float streak = fbm(vec3(u * 9.5, cs * 2.6));
    // Granules: chunkier detail that dominates the outer disk.
    float gran = fbm(vec3(u * 3.8, cs * 7.5) + 13.1);
    float field = streak * 0.60 + gran * 0.40 + 0.5 * streak * gran;
    f += field * ((k == 0) ? wA : 1.0 - wA);
  }
  return f;
}

vec4 diskEmission(vec3 pos, vec3 rayDir, float t) {
  float r = length(pos.xz);
  float phi = atan(pos.z, pos.x);

  // Radial envelope: crisp hot inner edge, long feathered outer rim.
  float inEdge = smoothstep(uDiskRIn, uDiskRIn * 1.14, r);
  float outEdge = 1.0 - smoothstep(uDiskROut * 0.62, uDiskROut, r);
  float envelope = inEdge * outEdge;

  // Inside the inner edge the gas is plunging: a smooth white-hot sheet, not a
  // hard cutoff — this is the blazing slash the film shows in front of the
  // shadow, and it feathers the lensed inner images too.
  if (r < uDiskRIn && r > 1.55) {
    float plunge = uHotRim * exp(-(uDiskRIn - r) * 3.2);
    float fade = smoothstep(1.55, 2.05, r);
    float e = plunge * fade * 0.5;
    return vec4(uColHot * e * uDiskGain, clamp(e * 0.35, 0.0, 1.0));
  }
  if (envelope <= 0.0001) return vec4(0.0);

  float f = diskField(r, phi, t);
  // Ember sparkle: the field's own peaks flare as hard bright specks —
  // advected with the flow for free, so the glitter churns with the gas.
  float spark = pow(max(f - 0.55, 0.0) * 2.2, 3.0);
  f = pow(max(f, 0.0), uTurbContrast);

  // Emission falls with radius; a white-hot sheet hugs the inner edge.
  float radial = pow(uDiskRIn / r, 2.9);
  float hot = uHotRim * exp(-(r - uDiskRIn) * 2.6);
  float e = (f * (0.55 + radial * 1.45) + hot * (0.35 + 0.65 * f)) * envelope;

  // Doppler beaming: the side flowing toward the camera runs brighter.
  vec3 tangent = normalize(vec3(-pos.z, 0.0, pos.x));
  float dop = dot(tangent, -rayDir);
  e *= 1.0 + uDoppler * dop;
  e *= 1.0 + 1.6 * spark;
  // The far wings burn low and coppery — brightness belongs to the core.
  e *= mix(1.0, 0.26, smoothstep(3.6, 10.0, r));

  // Temperature ramp: white core → gold → copper → rust.
  float tc = clamp((r - uDiskRIn) / (uDiskROut - uDiskRIn), 0.0, 1.0);
  tc = pow(tc, 0.62);
  vec3 col =
    (tc < 0.30) ? mix(uColHot,   uColMid,  tc / 0.30)
  : (tc < 0.68) ? mix(uColMid,   uColOuter,(tc - 0.30) / 0.38)
                : mix(uColOuter, uColRim,  (tc - 0.68) / 0.32);
  // Hotter where denser; slight extra white toward doppler side.
  col = mix(col, uColHot, clamp(hot * 0.5 + uDoppler * dop * 0.18, 0.0, 1.0) * inEdge * 0.6);

  float alpha = clamp(e * uAlphaGain, 0.0, 1.0) * envelope;
  return vec4(col * e * uDiskGain, alpha);
}

/* ---------------------------------------------------------- starfield ---- */

vec3 stars(vec3 d, float t) {
  vec3 col = vec3(0.0);
  // Two shells of grid-hashed point stars; lensing of d comes free upstream.
  for (int s = 0; s < 2; s++) {           // fixed tiny loop
    float scale = (s == 0) ? 210.0 : 90.0;
    vec3 cell = floor(d * scale);
    vec3 h = hash33(cell);
    if (h.x > uStarDensity) {
      vec3 center = (cell + 0.5 + (h - 0.5) * 0.7) / scale;
      float dist = length(d - normalize(center));
      float size = (s == 0) ? 0.0009 : 0.0016;
      float i = min(exp(-dist * dist / (size * size)), 1.0);
      float mag = pow(h.y, 3.0) * ((s == 0) ? 0.65 : 1.0);
      float tw = 1.0 - uTwinkle * 0.6 * (0.5 + 0.5 * sin(t * (1.6 + h.z * 3.4) + h.z * 41.0));
      vec3 tint = mix(vec3(1.00, 0.93, 0.82), vec3(0.82, 0.90, 1.00), h.z);
      col += tint * i * mag * tw;
    }
  }
  // Faint warm dust haze hugging the disk plane in the far field.
  col += uColOuter * uHazeGain * exp(-abs(d.y) * 7.0);
  return col * uStarGain;
}

/* ------------------------------------------------------------- march ---- */

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;

  // 16:9 is the reference framing. Wider: widen view. Taller: keep the hole
  // in frame by scaling on the vertical (the portrait-crop lesson).
  float fovScale = tan(uFovY * 0.5);
  vec2 ndc = uv * vec2(aspect * fovScale, fovScale);
  ndc.y += uFrameY * fovScale;

  // Camera basis from yaw/pitch/roll around the origin.
  float cy = cos(uYaw), sy = sin(uYaw);
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 camPos = uCamDist * vec3(sy * cp, sp, -cy * cp);
  vec3 fwd = normalize(-camPos);
  vec3 right0 = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up0 = cross(right0, fwd);
  float cr = cos(uRoll), sr = sin(uRoll);
  vec3 right = right0 * cr + up0 * sr;
  vec3 up = -right0 * sr + up0 * cr;

  vec3 dir = normalize(fwd + ndc.x * right + ndc.y * up);

  vec3 p = camPos;
  vec3 v = dir;
  float h2 = dot(cross(p, v), cross(p, v));   // conserved angular term

  vec3 acc = vec3(0.0);
  float alphaAcc = 0.0;
  float minR = 1e9;
  bool captured = false;
  float crossings = 0.0;

  float farR2 = (uCamDist + 24.0) * (uCamDist + 24.0);
  vec3 prev = p;

  for (int i = 0; i < 400; i++) {
    if (i >= uSteps) break;               // uniform bound: no unroll freeze

    float r = length(p);
    minR = min(minR, r);

    if (r < 1.02) { captured = true; break; }
    if (dot(p, p) > farR2 && dot(p, v) > 0.0) break;

    float dt = clamp(0.075 * r, 0.030, 1.70);

    // Binet-equation photon bending: a = -1.5 h² p / r⁵.
    vec3 a = -1.5 * h2 * p / pow(max(r * r, 0.25), 2.5);
    v += a * dt;
    prev = p;
    p += v * dt;

    // Disk-plane crossing between prev and p?
    if (prev.y * p.y < 0.0) {
      float s = prev.y / (prev.y - p.y);
      vec3 hit = mix(prev, p, s);
      float hr = length(hit.xz);
      if (hr > uDiskRIn * 0.92 && hr < uDiskROut) {
        vec4 d = diskEmission(hit, normalize(v), uTime);
        // Wrapped images (second crossing onward) and the far-side sheet run
        // slightly dimmer, as in the plate — the slash stays the brightest
        // thing in frame.
        float w = (crossings < 0.5) ? 1.0 : 0.85;
        w *= mix(1.0, 0.82, smoothstep(0.0, 2.0, hit.z));
        acc += d.rgb * w * (1.0 - alphaAcc);
        alphaAcc += d.a * (1.0 - alphaAcc);
        crossings += 1.0;
        if (alphaAcc > 0.985) break;
      }
    }
  }

  vec3 col = acc;
  // Star light only for rays that truly escaped. A near-critical ray that
  // exhausts its steps while still orbiting close to the hole is bound —
  // painting stars on it would speckle the shadow's rim.
  bool escaped = !captured && dot(p, p) > 16.0;
  if (escaped && alphaAcc < 0.985) {
    col += stars(normalize(v), uTime) * (1.0 - alphaAcc);
  }

  /* The photon ring: a razor-thin brilliant line where rays graze r = 1.5.
     ⚠️ ESCAPED RAYS ONLY. minR is the closest approach, and a ray that dives
     THROUGH the photon sphere into the hole also has a minR near 1.5 — so this
     term was painting ring light onto captured rays, i.e. glow inside the
     shadow, from light that by definition never escaped. Measured on the live
     finale: the horizon interior sat at ~10/255 instead of black, which is
     what Yash saw ("it should be black, man"). Gating on `captured` costs the
     ring nothing — the ring IS the escaping grazers — and lets the shadow be
     the true void the plate has. */
  if (!captured) {
    float ring = exp(-pow(abs(minR - 1.5) / uRingWidth, 1.6));
    col += uColHot * ring * uRingGain * (1.0 - alphaAcc * 0.55);
  }

  /* ⚠️ ALPHA IS THE SHADOW HOLDOUT MATTE, not opacity.
     The composite needs to know where the event horizon is so it can keep
     bloom off it — a black hole that glows from the inside is the one thing
     the shadow must never do. 0 inside the horizon, 1 everywhere else; the
     bloom chain reads .rgb only, so nothing else is affected. */
  outColor = vec4(col, captured ? 0.0 : 1.0);
}
