/**
 * Ek self-contained HTML file banata hai — double-click karke chalti hai,
 * koi dev server nahi chahiye.
 *
 * Normal `npm run build` ke saath ye alag isliye hai ki wo production ke
 * liye sahi hai (chunks alag, images alag files) par ek file bhejne ke
 * liye galat. Yahan sab kuch andar chala jaata hai:
 *
 *   · chaaron webp images   → base64 data URI (assetsInlineLimit)
 *   · three + gsap + app JS → ek hi chunk (manualChunks band)
 *   · CSS aur JS            → seedha HTML ke andar inline
 *
 * Google Fonts ka <link> jaan-boojhkar rehne diya: online par asli font
 * aata hai, offline par CSS ka fallback stack (system-ui) chal jaata hai.
 * Fonts ko base64 karne se file do-guni ho jaati hai bina kisi faayde ke.
 *
 *   node scripts/build-single.mjs
 */

import { build } from "vite";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outDir = path.join(root, ".single-tmp");
const finalFile = path.join(root, "standalone", "buildanta-intro.html");

await build({
  root,
  configFile: false,                       // base config ke chunk splits nahi chahiye
  logLevel: "warn",
  build: {
    target: "es2020",
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,   // har asset base64 ho jaye
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,        // ek hi JS file
        manualChunks: undefined,
      },
    },
  },
});

let html = await readFile(path.join(outDir, "index.html"), "utf8");

/* JS aur CSS ko file se uthakar HTML ke andar daal do. Vite crossorigin
   attribute lagata hai — inline script par wo meaningless hai, hata do. */
const jsTag = /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/;
const cssTag = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/;

const inline = async (re, wrap) => {
  const m = html.match(re);
  if (!m) throw new Error(`build-single: ${re} HTML mein mila hi nahi`);
  const body = await readFile(path.join(outDir, m[1].replace(/^\//, "")), "utf8");
  // Replacement ek FUNCTION hai, string nahi — warna minified bundle ke
  // andar ka `$&` special maan liya jaata hai aur JS ke beech mein poora
  // <script src> tag splice ho jaata hai. Naapa hua: teen jagah ghusa tha
  // aur file syntax error ke saath chup-chaap fail ho rahi thi.
  html = html.replace(m[0], () => wrap(body));
};

await inline(cssTag, (css) => `<style>\n${css}\n</style>`);
await inline(jsTag, (js) => `<script type="module">\n${js}\n</script>`);

/* Guard: file tabhi self-contained hai jab koi bhi local asset bacha na ho.
   Ye check isliye hai ki pichli baar file chup-chaap toot gayi thi — HTML
   theek dikhti thi, browser bina console error ke bas kuch render hi nahi
   karta tha. Ab toota hua output likha hi nahi jayega. */
const leftovers = [
  [/<script[^>]*\ssrc="(?!https?:)[^"]+"/g, "script src"],
  [/<link[^>]*\shref="(?!https?:)[^"]+"[^>]*rel="stylesheet"/g, "stylesheet link"],
  [/(?:src|href)="\/assets\//g, "asset path"],
].flatMap(([re, what]) => (html.match(re) || []).map((m) => `${what}: ${m.slice(0, 80)}`));

if (leftovers.length) {
  throw new Error(
    `build-single: file self-contained nahi hai — ye references bache hain:\n  ${leftovers.join("\n  ")}`
  );
}

await writeFile(finalFile, html, "utf8");
await rm(outDir, { recursive: true, force: true });

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log(`✓ ${path.relative(root, finalFile)} — ${kb} KB, self-contained`);
