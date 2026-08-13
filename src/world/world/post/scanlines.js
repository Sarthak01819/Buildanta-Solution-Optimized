import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// Scanlines, enabled only while a card is open.
//
// src: Round 1 Task 4 — this pass is disabled during normal world browsing and
// showItem() turns it on. Its u_color is set from that card's OWN accent
// colour, which is why every one of the 58 manifest entries carries a unique
// one. It is the only place a card's colour is used as a signal.
//
// Colour space: the chain is linear and encodes once, in screenfx. THREE.Color
// converts an authored sRGB hex into the working (linear) space on set, so the
// tint enters linear and nothing downstream double-handles it.

const ScanShader = {
  uniforms: {
    tDiffuse: { value: null },
    u_time: { value: 0 },
    u_strength: { value: 0 },
    u_color: { value: new THREE.Color(1, 1, 0) },
    // ---------------------------------------------------------------------
    // These four were FITTED, not guessed. The captures give the waveform but
    // never its amplitude, and tuning by eye overshot in both directions —
    // first a purple wash over the whole frame, then an effect so weak it was
    // invisible. So the real page was recaptured (captures/REF-open.png) and
    // three numbers measured off a neighbouring card in its open state:
    //
    //     luma 60      banding 38.7      R:B 3.9      empty field luma 10
    //
    // "banding" is mean row-to-row luma change — what a horizontal band IS —
    // rather than stddev, which a smooth top-to-bottom gradient would also
    // satisfy. tools/bands.cjs measures it; re-run it against REF-open.png
    // before changing any value here. Current fit: 62.2 / 33.2 / 3.53 / 13.5.
    // ---------------------------------------------------------------------

    // How far a surrounding card is pushed toward the open card's accent.
    // The reference's neighbours measure R:B near 4:1, which no amount of
    // striping over a NEUTRAL photograph can reach — driving the stripe harder
    // clips the peaks to white and moves the mean toward grey, AWAY from the
    // target. They are tinted wholesale, so this carries each card's own
    // luminance on the accent and the stripes ride on top.
    u_tint: { value: 0.95 },
    // The floor the gaps between lines fall to. Near zero on purpose: in the
    // reference the gaps are black, not a dimmed photograph, and that hard
    // black-to-bright transition is most of the banding number.
    u_dim: { value: 0 },
    // Where the squared-up wave switches on, and how soft that switch is. Small
    // u_soft is what makes the band edge crisp rather than a gradient; u_edge
    // sets the duty cycle — how much of each period is lit line versus black
    // gap. Both must exist here: the fragment shader declares them, and a
    // uniform declared in GLSL but absent from this object silently reads 0,
    // which collapses the smoothstep to a step at zero and lights every pixel.
    u_peak: { value: 7 },
    u_vig: { value: 0.35 },
    u_edge: { value: 0.1 },
    u_soft: { value: 0.02 },
    // Screen-space rect of the open card, as x0,y0,x1,y1 in uv. The treatment
    // is masked OUT of it: our cards carry real photography, and heavy striping
    // over the one photograph the viewer is looking at muddies it.
    u_cardRect: { value: new THREE.Vector4(0, 0, 0, 0) },
    u_feather: { value: 0.006 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float u_time;
    uniform float u_strength;
    uniform vec3 u_color;
    uniform float u_dim;
    uniform float u_tint;
    uniform float u_peak;
    uniform float u_vig;
    uniform float u_edge;
    uniform float u_soft;
    uniform vec4 u_cardRect;
    uniform float u_feather;
    varying vec2 vUv;

    void main() {
      // +/- 0.001 uv split on R and B, as measured.
      float r = texture2D(tDiffuse, vUv + vec2(0.001, 0.0)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - vec2(0.001, 0.0)).b;
      vec3 col = vec3(r, g, b);

      // The oscillation, kept SEPARATE from the vignette that weights it.
      //
      // The captured expression is c = 1 + 2sin + sin followed by
      // c *= sin(x*3.15)*sin(y*3.0), and transcribing that literally is wrong
      // here: sin(x*3.15) is ~0 at BOTH x=0 and x=1, so scaling the whole of c
      // by it cancels the stripe exactly at the frame edges — which is where
      // every surrounding card sits. The reference bands those edge cards hard,
      // so the vignette cannot be sitting on the DC term.
      //
      // Splitting it fixes the order of operations: the 1.0 is the DC offset
      // that must be dropped so black stays black, and the vignette is a weight
      // on the oscillation only. The near-unison 1000/999 pair is deliberate —
      // their difference beats over the frame and is what gives the reference
      // its wide bands of alternating stripe intensity.
      float osc = 2.0 * sin(u_time * 4.0 + vUv.y * 1000.0)
                + 1.0 * sin(u_time * 4.0 + vUv.y * 999.0);
      // u_vig 0 = uniform banding across the frame, 1 = their full centre bias.
      // Kept as a dial because the bias fights the reference: it multiplies the
      // wave BEFORE the threshold, so a card near a frame edge clears the
      // threshold for a much smaller part of each cycle and ends up faintly
      // striped. unseen's edge cards are among its brightest, so the bias there
      // must be slight at most.
      float vig = mix(1.0, mix(0.55, 1.0, sin(vUv.x * 3.15) * sin(vUv.y * 3.0)), u_vig);

      // Two traps this deliberately avoids, both found against the reference:
      //
      // 1. No DC term. The measured waveform's mean is 1, and adding the accent
      //    at every pixel equally washed the #050505 field between cards out to
      //    a flat colour — [52,32,125] in a frame corner where the reference is
      //    black. Driving off the zero-mean oscillation and SCALING existing
      //    content keeps black black: no content, no effect.
      //
      // 2. The accent never goes negative. A signed multiply subtracts it in
      //    the troughs, which for a warm card rendered the whole frame CYAN —
      //    its complement. The reference has no complement anywhere.
      //
      // Hard-edged, and the gaps go to BLACK.
      //
      // A sine ridden over the photograph is not what the reference does. Under
      // 8x magnification its neighbours are a bright accent line followed by a
      // fully black gap, with the photograph mostly replaced by the pattern —
      // that hard black-to-bright transition is why it measures ~2x our
      // row-to-row banding. A soft sine whose troughs bottom out at a dimmed
      // photo cannot reach that number at any amplitude; pushing amplitude
      // instead clips the peaks to white and drives the mean toward grey.
      //
      // So: square the wave up, and let u_dim be the FLOOR the gaps fall to
      // rather than an overall scale. Near zero, the gaps read black.
      // Signed, so u_edge can set a duty cycle above 50%. Thresholding the
      // POSITIVE HALF of the wave caps the lit fraction at 50% no matter where
      // the edge sits, which is not enough lit line to reach the reference's
      // card brightness.
      float wave = osc / 3.0;                      // -1..1
      float hard = smoothstep(u_edge - u_soft, u_edge + u_soft, wave * vig);

      // Rec.709 luma. Normalised by the accent's OWN luma so the tint is a hue
      // rotation and not a brightness change — an un-normalised duotone on a
      // saturated accent silently costs more than half the luminance, which
      // then has to be won back by brightening somewhere else.
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float clum = max(dot(u_color, vec3(0.2126, 0.7152, 0.0722)), 0.001);
      vec3 duo = u_color * (lum / clum);
      // Weight the tint by luminance so the EMPTY FIELD stays black.
      //
      // Tinting every pixel equally also tints the near-black background and its
      // grain, which lays a flat even colour wash over what should be empty
      // space — the frame reads as "coloured all over" even when the black
      // fraction measures fine, because 5 tinted is still visibly brown where 5
      // neutral reads as black. Below ~6% luminance there is no photograph to
      // tint, only background, so the tint fades out there.
      float tintable = smoothstep(0.02, 0.10, lum);
      vec3 base = mix(col, duo, u_tint * tintable);

      // A MASK, never a gain: mix(u_dim, 1.0, hard) is bounded by 1, so no
      // pixel leaves this pass brighter than it arrived.
      //
      // This is the whole reason the frame was covered in stripes. The previous
      // form multiplied by up to 6.5, and the empty field between cards is not
      // pure black — it is #050505 plus grain. 5 x 6.5 = 32, so every "empty"
      // pixel lit up orange and there was no black left anywhere. The reference
      // measures luma 10 / banding 0.5 in that same empty field: its treatment
      // cannot be amplifying either. Bounded at 1, near-black stays near-black
      // by construction, at any u_amount, on any content.
      // The lit line may go BRIGHTER than the photograph under it — but only
      // where there is a photograph. unseen's banded neighbours mean luma 60
      // against art of roughly ours; at ~45% duty and a ceiling of 1.0 the most
      // that can average is ~45% of the source, which tops out near 30. So its
      // lines are genuinely brighter than the image beneath them.
      //
      // Boosting everywhere is what wrecked the black the first time (a flat
      // 6.5x turned the #050505 field into visible orange). Weighting the boost
      // by the SAME luminance factor as the tint keeps the guarantee: empty
      // space has no content to boost, so its ceiling stays 1.0 and near-black
      // stays near-black, while a lit card gets the full u_peak.
      float peak = mix(1.0, u_peak, tintable);
      float gain = mix(u_dim, peak, hard);
      vec3 lines = base * gain;

      // Feathered rectangular mask: full treatment everywhere, clean inside the
      // open card. The card is axis-aligned (every quaternion is identity) and
      // sits at the centre where the barrel warp is ~0, so a rect holds.
      // The feather sits entirely OUTSIDE the rect, not centred on it. Centred,
      // smoothstep returns 0.5 at the card's own edge, so half the treatment
      // lands ON the card and fades inward over the feather width — at 0.035 uv
      // that is a ~45px band of stripes bleeding across the edge of the very
      // thing being looked at. The reference's card edge is razor sharp under
      // magnification: stripes stop dead at the boundary. So the card is fully
      // clean from its edge inward, and the ramp happens in the space outside.
      vec2 inside = smoothstep(u_cardRect.xy - u_feather, u_cardRect.xy, vUv)
                  * (1.0 - smoothstep(u_cardRect.zw, u_cardRect.zw + u_feather, vUv));
      float clean = inside.x * inside.y;

      gl_FragColor = vec4(mix(col, lines, u_strength * (1.0 - clean)), 1.0);
    }`
}

export class ScanlinePass extends ShaderPass {
  constructor() {
    super(ScanShader)
    this.time = 0
    this.enabled = false
    this.target = 0
  }

  // cell is kept so the mask can follow the open card. It is NOT cleared when
  // strength happens to be 0 — setItem sets the card while the ramp has not
  // started, and a single dt=0 frame in that window would orphan it forever.
  setItem(item, cell = null) {
    if (item) this.uniforms.u_color.value.set(item.color)
    this.card = item ? cell : null
    this.target = item ? 1 : 0
  }

  // Screen-space rect of the open card, in uv. Cheap: two corners projected.
  updateMask(world) {
    const r = this.uniforms.u_cardRect.value
    if (!this.card || !world) { r.set(0, 0, 0, 0); return }
    const p = this.card.mesh.geometry.parameters
    const hw = (p.width * this.card.mesh.scale.x) / 2
    const hh = (p.height * this.card.mesh.scale.y) / 2
    const V = this.card.mesh.position.constructor
    const a = new V(-hw, -hh, 0)
    const b = new V(hw, hh, 0)
    this.card.mesh.localToWorld(a)
    this.card.mesh.localToWorld(b)
    a.project(world.camera)
    b.project(world.camera)
    r.set(
      Math.min(a.x, b.x) * 0.5 + 0.5, Math.min(a.y, b.y) * 0.5 + 0.5,
      Math.max(a.x, b.x) * 0.5 + 0.5, Math.max(a.y, b.y) * 0.5 + 0.5
    )
  }

  update(dt) {
    if (!(dt > 0)) return
    this.time = (this.time + dt) % 1000
    this.uniforms.u_time.value = this.time

    const s = this.uniforms.u_strength.value
    const next = s + (this.target - s) * (1 - Math.exp(-6 * dt))
    this.uniforms.u_strength.value = next < 0.002 && this.target === 0 ? 0 : next
    // Costs nothing when no card is open.
    this.enabled = this.uniforms.u_strength.value > 0
  }

  reset() {
    this.target = 0
    this.uniforms.u_strength.value = 0
    this.enabled = false
  }
}
