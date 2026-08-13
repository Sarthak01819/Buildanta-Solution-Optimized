import { drawPlaceholder } from './placeholder.js'

// The crawlable, keyboard-navigable index. It renders first, it renders without
// WebGL, and it stays in the document when the scene is live.
//
// The reference page ships zero anchors — all 58 of its projects exist only
// inside an inline script. This is the part we do better, and it costs nothing
// because the markup has to exist anyway as the tier-0 fallback.

export function mountDomGrid(root, items) {
  const frag = document.createDocumentFragment()

  items.forEach((item) => {
    const [w, h] = item.image_size

    const a = document.createElement('a')
    a.className = 'card'
    a.href = item.link

    const media = document.createElement('img')
    media.className = 'card__media'
    media.width = w
    media.height = h
    media.alt = `${item.title} — ${item.type} placeholder, ${w}×${h}`
    media.loading = 'lazy'
    media.decoding = 'async'
    media.style.aspectRatio = `${w} / ${h}`
    // A video slot's `file` is an .mp4 — handing that to an <img> renders a
    // broken-image glyph and the alt text, which is what the index was showing
    // for all 15 video items. Stills only here; the scene plays the video.
    //
    // Test the item's TYPE, not its file extension. The extension test passed
    // on the dev server and broke in the single-file build, where the inliner
    // rewrites `/video/placeholder-01.mp4` to `data:video/mp4;base64,...` — a
    // URI with no extension to match, so the guard read "image" and handed an
    // MP4 to an <img>. Two cards showed the broken glyph in the published
    // preview while every check against the dev server stayed green. `type` is
    // authored in the manifest and survives any URL rewriting.
    const isVideo = item.type === 'video' || /\.(mp4|webm|mov)(\?|#|$)/i.test(item.file || '')
      || /^data:video\//i.test(item.file || '')
    const isImage = item.file && !isVideo
    media.src = isImage ? item.file : drawPlaceholder(item).toDataURL('image/png')

    const title = document.createElement('h2')
    title.className = 'card__title'
    title.textContent = item.title

    const meta = document.createElement('p')
    meta.className = 'card__meta'
    meta.textContent = item.show_caption
      ? `${item.author} — ${item.caption}`
      : item.author

    a.append(media, title, meta)
    frag.append(a)
  })

  root.append(frag)
  return items.length
}
