# User-supplied landscape layers

Received 2026-09-05. These files are byte-exact copies; the originals and the
previous garden atlas / legacy meadow remain intact.

| Local file | Supplied file | Canvas |
| --- | --- | --- |
| sky.png | C:/Users/sarth/Downloads/blue sky.png | 1672 × 941, RGBA PNG |
| clouds.png | C:/Users/sarth/Downloads/clouds.png | 1672 × 941, RGBA PNG |
| land.png | C:/Users/sarth/Downloads/land.png | 1448 × 1086, RGBA PNG |
| reference.png | C:/Users/sarth/Downloads/“Where the.png | Reference only: JPEG bytes despite its filename, raw 736 × 1308 with EXIF orientation 8; displayed 1308 × 736 |

Only the three RGBA layers are loaded by the runtime. All layers use one 16:9
artboard; land keeps its own aspect ratio. The shader stretches the sky's
verified opaque interior (top-origin x .25–.75, y 0–.40) behind the registered
clouds and land, avoiding the hard cut edge of the sky image. Its soft alpha
choke suppresses low-opacity key-color fringes in
the provided cutouts without modifying the source images. No new scenery,
extra particles, or generated content is introduced.
