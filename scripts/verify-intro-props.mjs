import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const acts = {
  idea: [
    "idea-paper-ball",
    "idea-paper-plane",
    "idea-pencil",
    "idea-sticky-note",
    "idea-notebook-corner",
    "idea-glass-marble",
    "idea-brass-compass",
    "idea-light-spark",
    "idea-coffee-cup",
  ],
  code: [
    "code-keycap-brace",
    "code-keycap-semicolon",
    "code-keycap-slash",
    "code-cursor-bar",
    "code-silicon-chip",
    "code-cable-connector",
    "code-terminal-panel",
    "code-git-branch",
    "code-glass-card-stack",
  ],
  market: [
    "market-bar-chart",
    "market-line-graph",
    "market-pie-segment",
    "market-avatar-card",
    "market-heart-reaction",
    "market-speech-bubble",
    "market-price-tag",
    "market-smartphone-chart",
    "market-shopping-bag",
  ],
  consult: [
    "consult-clipboard",
    "consult-fountain-pen",
    "consult-spectacles",
    "consult-folded-document",
    "consult-chess-knight",
    "consult-brass-compass",
    "consult-river-stones",
    "consult-coffee-cup",
    "consult-magnifying-glass",
  ],
};

const expected = Object.values(acts).flat();
const css = await readFile(path.join(root, "src/styles/objects.css"), "utf8");
const motion = await readFile(path.join(root, "src/modules/introObjects.js"), "utf8");
const config = await readFile(path.join(root, "src/config.js"), "utf8");

const failures = [];
let totalBytes = 0;

for (const [act, kinds] of Object.entries(acts)) {
  for (const kind of kinds) {
    const rel = `src/assets/intro/props/${act}/${kind}.webp`;
    const absolute = path.join(root, rel);
    try {
      await access(absolute);
      const info = await stat(absolute);
      if (info.size < 128) failures.push(`${rel}: file is unexpectedly small`);
      totalBytes += info.size;
    } catch {
      failures.push(`${rel}: missing`);
    }

    if (!css.includes(`.obj--${kind} > i`)) {
      failures.push(`${kind}: CSS class is missing`);
    }
    if (!css.includes(`props/${act}/${kind}.webp`)) {
      failures.push(`${kind}: CSS asset URL is missing`);
    }
    if (!motion.includes(`"${kind}": { amp:`)) {
      failures.push(`${kind}: MOOD entry is missing`);
    }
  }
}

const configured = [...config.matchAll(/\{\s*kind:\s*"([^"]+)",\s*count:\s*(\d+)\s*\}/g)]
  .filter(([, kind]) => expected.includes(kind))
  .flatMap(([, kind, count]) => Array(Number(count)).fill(kind));

if (configured.length !== 20) {
  failures.push(`config: expected 20 configured image props, found ${configured.length}`);
}

for (const prefix of Object.keys(acts)) {
  const count = configured.filter((kind) => kind.startsWith(`${prefix}-`)).length;
  if (count !== 5) failures.push(`config: ${prefix} should retain 5 prop choices, found ${count}`);
}

for (const label of ["Your idea", "We code", "We market", "We consult"]) {
  if (!config.includes(`label: "${label}"`)) failures.push(`config: tagline changed or missing: ${label}`);
}

if (failures.length) {
  console.error("Intro prop verification failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${expected.length} image props wired; ${configured.length} configured; rendering disabled; ` +
    `${(totalBytes / 1024).toFixed(0)} KB source assets`
  );
}
