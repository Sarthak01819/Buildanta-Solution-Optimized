import * as THREE from 'three'

// Labelled placeholder textures, drawn at the item's real pixel size.
// Never a fake photograph — a placeholder that looks like real work is how a
// build gets signed off on art nobody has actually made yet.
//
// When real art arrives, `item.file` gets a URL and this module stops being
// called for that item. Nothing else in the build changes.

const label = (ctx, text, x, y, size, weight, color) => {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px "Neue Montreal", system-ui, sans-serif`
  ctx.fillText(text, x, y)
}

export function drawPlaceholder(item) {
  const [w, h] = item.image_size
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = item.color
  ctx.fillRect(0, 0, w, h)

  // Flat inset frame — no gradient, no shadow (M2).
  const pad = Math.round(Math.min(w, h) * 0.045)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(pad + 0.5, pad + 0.5, w - pad * 2 - 1, h - pad * 2 - 1)

  const unit = Math.max(11, Math.round(Math.min(w, h) * 0.055))
  ctx.textBaseline = 'top'
  label(ctx, item.title, pad * 2, pad * 2, unit, 500, 'rgba(0,0,0,0.78)')
  label(ctx, item.type, pad * 2, pad * 2 + unit * 1.5, unit * 0.8, 400, 'rgba(0,0,0,0.5)')

  ctx.textBaseline = 'alphabetic'
  label(ctx, `${w}×${h}`, pad * 2, h - pad * 2, unit * 0.8, 400, 'rgba(0,0,0,0.5)')

  const tag = 'placeholder'
  ctx.font = `400 ${unit * 0.8}px "Neue Montreal", system-ui, sans-serif`
  const tw = ctx.measureText(tag).width
  label(ctx, tag, w - pad * 2 - tw, h - pad * 2, unit * 0.8, 400, 'rgba(0,0,0,0.5)')

  return canvas
}

// Real art when it exists, placeholder until then — and the swap happens
// without a pop, because the placeholder renders immediately and is replaced
// (and disposed) only once the real file has decoded.
export function cardTexture(item, onReady) {
  const tex = placeholderTexture(item)
  // Video slots keep the still here; VideoPool swaps a live texture in when a
  // lane is free. Handing an .mp4 to TextureLoader just fails noisily.
  if (!item.file || item.type === 'video') return tex

  new THREE.TextureLoader().load(
    item.file,
    (real) => {
      real.colorSpace = THREE.SRGBColorSpace
      real.generateMipmaps = false
      real.minFilter = THREE.LinearFilter
      real.magFilter = THREE.LinearFilter
      real.wrapS = real.wrapT = THREE.ClampToEdgeWrapping
      onReady(real)
    },
    undefined,
    // A missing file must not blank a card: keep the placeholder and say so.
    () => console.warn(`[world] could not load ${item.file}, keeping placeholder`)
  )
  return tex
}

export function placeholderTexture(item) {
  const tex = new THREE.CanvasTexture(drawPlaceholder(item))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}
