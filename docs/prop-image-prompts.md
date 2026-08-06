# Prop image prompts — ChatGPT ke liye

Chaar prompts, ek per tagline. Har prompt ek sheet deta hai jisme 9 alag props
hote hain — main unhe kaat ke, transparent bana ke, intro ke drift engine par
laga dunga.

**Wapas laate waqt bas itna batana: kaunsi image kis act ki hai.**

---

## Pehle do baatein

**Style jaan-boojhkar 3D studio-render hai, photo nahi.** Scene images abstract
glass renders hain — unpar photographic props collage jaise lagte. Isliye har
prompt mein "high-end 3D product render" aur us act ka palette diya hai.

**Background flat magenta hai, transparent nahi.** Image models transparent PNG
theek se nahi dete; magenta cut karna clean hota hai.

**Do cheezein generate karte waqt hi check kar lena:**

- **Keycaps ke characters** sabse zyada risk hain — models `{` `;` `/` aksar
  bigaad dete hain. Letters ghour se dekhna; galat aaye to sirf **us ek prop**
  ko dobara generate karwana, poori sheet nahi.
- Props chipke hue ya crop hue aayein to bolna:
  *"same prompt, but only 4 objects, much larger, far apart"* — cutting tabhi
  saaf hoti hai.

**Movement ki chinta mat karna.** Wo code mein pehle se bana hai (drift +
pointer parallax). Images ko sirf **still props** hona chahiye.

---

## 01 · Your idea

```text
A 3x3 grid of 9 separate objects on a completely flat solid magenta #FF00FF
background. Each object fully isolated with generous empty space around it,
none touching or overlapping, none cropped by the edges.

Objects: a crumpled paper ball, a folded paper plane, a wooden pencil, a
single curled sticky note, a torn notebook page corner, a glass marble, a
small brass compass, a spark of light, a coffee cup seen from above.

Style: high-end 3D product render, soft studio lighting from upper left,
subtle warm rim light, shallow depth of field off. Warm cream and terracotta
palette — ivory #f2e6d7, burnt orange #bd6741, warm white highlights.
Matte and glass materials, gentle soft shadows on the objects themselves
but NO shadow cast onto the background.

No text, no labels, no watermark, no drop shadows on the backdrop.
Square image, maximum resolution.
```

---

## 02 · We code

```text
A 3x3 grid of 9 separate objects on a completely flat solid magenta #FF00FF
background. Each object fully isolated with generous empty space around it,
none touching or overlapping, none cropped by the edges.

Objects: a single mechanical keyboard keycap showing the character {, another
keycap showing ;, another keycap showing /, a floating text cursor bar, a
small silicon chip with gold pins, a coiled cable connector, a tiny floating
terminal window panel, a git branch shape made of glowing tubes, a stack of
three translucent glass cards.

Style: high-end 3D product render, dark studio, lit by electric blue light
seams from below and behind. Deep navy #06142d and electric blue #6dc9ff
palette, clear glass and brushed dark metal, crisp specular highlights.
NO shadow cast onto the background.

Keycap characters must be crisp, correct and centred — only those single
symbols, no other text anywhere, no labels, no watermark.
Square image, maximum resolution.
```

---

## 03 · We market

```text
A 3x3 grid of 9 separate objects on a completely flat solid magenta #FF00FF
background. Each object fully isolated with generous empty space around it,
none touching or overlapping, none cropped by the edges.

Objects: a small floating bar chart of 4 bars, a rising line graph with a
glowing node at its peak, a single pie chart segment, a rounded square
customer avatar card showing a simple faceless portrait silhouette, a heart
reaction bubble, a speech bubble, a price tag, a smartphone floating at a
slight angle showing a blank chart, a paper shopping bag.

Style: high-end 3D product render, soft studio lighting, warm backlight glow
from the right. Plum #3b172d and warm coral #ffab79 palette with polished
gold accents and pearl highlights. Glossy and pearlescent materials.
NO shadow cast onto the background.

No text, no numbers on the charts, no labels, no watermark.
Square image, maximum resolution.
```

---

## 04 · We consult

```text
A 3x3 grid of 9 separate objects on a completely flat solid magenta #FF00FF
background. Each object fully isolated with generous empty space around it,
none touching or overlapping, none cropped by the edges.

Objects: a clipboard with a blank sheet, a fountain pen, a pair of thin
spectacles, a folded document, a chess knight piece, a small brass compass,
a stacked pair of smooth river stones, a coffee cup on a saucer, a magnifying
glass.

Style: high-end 3D product render, dark studio, warm light raking from behind
the objects. Deep forest green #173126 and antique gold #d8b46c palette,
polished brass, clear glass and smooth matte stone. Calm and premium.
NO shadow cast onto the background.

No text, no labels, no watermark.
Square image, maximum resolution.
```

---

## Reference — har act ka palette

Ye wahi rang hain jo `src/styles/main.css` ke `#intro.t-*` blocks mein hain,
aur har act ki scene image se sample kiye gaye hain. Props inhi ke andar
rahenge to screen par ek hi jagah ka lagenge.

| act | tagline | paper | accent |
|---|---|---|---|
| 01 | Your idea | `#f2e6d7` warm cream | `#bd6741` terracotta |
| 02 | We code | `#06142d` deep navy | `#6dc9ff` electric blue |
| 03 | We market | `#3b172d` plum | `#ffab79` warm coral |
| 04 | We consult | `#173126` deep green | `#d8b46c` antique gold |
