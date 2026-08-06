import { build } from "vite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outDir = path.join(root, ".we-scale-single-tmp");
const finalDir = path.join(root, "standalone");
const finalFile = path.join(finalDir, "Buildanta-WE-SCALE.html");

await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    target: "es2020",
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(root, "we-scale.html"),
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});

let html = await readFile(path.join(outDir, "we-scale.html"), "utf8");

const jsTag = /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/;
const cssTag = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/;

const inlineGeneratedAsset = async (pattern, wrap) => {
  const match = html.match(pattern);
  if (!match) throw new Error(`WE SCALE export: generated asset missing for ${pattern}`);
  const assetPath = path.join(outDir, match[1].replace(/^\//, ""));
  const body = await readFile(assetPath, "utf8");
  html = html.replace(match[0], () => wrap(body));
};

await inlineGeneratedAsset(cssTag, (css) => `<style>\n${css}\n</style>`);
await inlineGeneratedAsset(jsTag, (js) => `<script type="module">\n${js}\n</script>`);

const pngDataUri = async (relativePath) => {
  const bytes = await readFile(path.join(root, "public", relativePath.replace(/^\//, "")));
  return `data:image/png;base64,${bytes.toString("base64")}`;
};

const runtimeAssets = [
  "/assets/consult-plant-atlas-v3.png",
  "/assets/consult-ecology-atlas-v1.png",
  "/assets/consult-hand-v2.png",
  "/assets/consult-paper-bird-v1.png",
];

for (const assetUrl of runtimeAssets) {
  const dataUri = await pngDataUri(assetUrl);
  html = html.split(assetUrl).join(dataUri);
}

// The live site uses a remote Franklin photograph. The share file embeds the
// normal, non-smiling local Franklin macro so the dollar sequence works even
// when the recipient opens the HTML offline.
const remoteDollar = "https://images.unsplash.com/photo-1636115734305-aac2f83cd8d4?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
const embeddedDollar = await pngDataUri("/assets/entry-franklin-macro.png");
html = html.split(remoteDollar).join(embeddedDollar);

const unresolved = [
  ["/assets/", "local asset path"],
  ["images.unsplash.com", "remote dollar image"],
  ["src=\"/", "absolute script source"],
  ["href=\"/", "absolute stylesheet source"],
].filter(([needle]) => html.includes(needle));

if (unresolved.length) {
  throw new Error(
    `WE SCALE export is not self-contained:\n${unresolved.map(([, label]) => `  - ${label}`).join("\n")}`,
  );
}

await mkdir(finalDir, { recursive: true });
await writeFile(finalFile, html, "utf8");
await rm(outDir, { recursive: true, force: true });

const sizeMb = (Buffer.byteLength(html, "utf8") / 1024 / 1024).toFixed(2);
console.log(`✓ standalone/${path.basename(finalFile)} — ${sizeMb} MB, self-contained`);
