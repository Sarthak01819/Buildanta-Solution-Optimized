import { build } from "vite";
import { readFile, writeFile, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const experimentRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(experimentRoot, "../..");
const workspaceRoot = path.resolve(projectRoot, "..");
const temporaryOutput = path.join(experimentRoot, ".build-tmp");
const finalFile = path.join(workspaceRoot, "outputs", "buildanta-animated-mall-photo.html");
const sourcePhoto = path.join(experimentRoot, "photo.jpg");

function emittedPath(reference) {
  return path.join(temporaryOutput, reference.replace(/^\.?\//, ""));
}

try {
  await build({
    root: experimentRoot,
    configFile: false,
    base: "./",
    publicDir: false,
    logLevel: "warn",
    build: {
      target: "es2020",
      outDir: temporaryOutput,
      emptyOutDir: true,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      sourcemap: false,
      rollupOptions: {
        input: path.join(experimentRoot, "index.html"),
        output: {
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },
  });

  let html = await readFile(path.join(temporaryOutput, "index.html"), "utf8");
  const scriptTag = /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i;
  const styleTag = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i;

  const scriptMatch = html.match(scriptTag);
  const styleMatch = html.match(styleTag);
  if (!scriptMatch || !styleMatch) {
    throw new Error("Standalone build could not locate Vite's emitted JavaScript or CSS.");
  }

  const javascript = await readFile(emittedPath(scriptMatch[1]), "utf8");
  const stylesheet = await readFile(emittedPath(styleMatch[1]), "utf8");
  const safeJavascript = javascript.replace(/<\/script/gi, "<\\/script");

  html = html.replace(styleMatch[0], () => "<style>\n" + stylesheet + "\n</style>");
  html = html.replace(
    scriptMatch[0],
    () => "<script type=\"module\">\n" + safeJavascript + "\n</script>",
  );

  const failures = [];
  const inlineModules = html.match(/<script\s+type="module">/gi) || [];
  const styleBlocks = html.match(/<style(?:\s[^>]*)?>/gi) || [];

  if (inlineModules.length !== 1) failures.push("expected exactly one inline module script");
  if (styleBlocks.length < 1) failures.push("expected at least one inline style block");
  if (/<script[^>]+\ssrc=/i.test(html)) failures.push("external script source remains");
  if (/<link[^>]+rel="stylesheet"/i.test(html)) failures.push("external stylesheet remains");
  if (/\/?assets\//i.test(html)) failures.push("local assets path remains");
  if (/(?:src|href)="https?:\/\//i.test(html)) failures.push("remote media or link URL remains");
  if (!/data:image\/jpeg;base64,/i.test(html)) failures.push("embedded JPEG is missing");
  if (/images\.unsplash\.com/i.test(html)) failures.push("original Unsplash URL remains");

  const unsafeSources = [...html.matchAll(/(?:src|poster)="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((value) => !value.startsWith("data:"));
  if (unsafeSources.length) failures.push("non-data media source remains: " + unsafeSources.join(", "));

  if (/url\(\s*['"]?(?:https?:|\/?assets\/|\.\.?\/)/i.test(stylesheet)) {
    failures.push("external or local CSS URL remains");
  }

  const [photoInfo] = await Promise.all([stat(sourcePhoto)]);
  const outputBytes = Buffer.byteLength(html, "utf8");
  if (outputBytes <= photoInfo.size) failures.push("output is unexpectedly smaller than the source JPEG");

  if (failures.length) {
    throw new Error("Standalone validation failed:\n- " + failures.join("\n- "));
  }

  await writeFile(finalFile, html, "utf8");
  console.log(
    "✓ " + path.relative(workspaceRoot, finalFile)
    + " — " + Math.round(outputBytes / 1024) + " KB, self-contained",
  );
} finally {
  await rm(temporaryOutput, { recursive: true, force: true });
}
