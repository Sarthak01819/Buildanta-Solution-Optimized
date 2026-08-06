import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: true, allowedHosts: [".trycloudflare.com"] },
  // The dependencies used here already ship ESM. Skipping discovery keeps
  // local previews deterministic in restricted desktop workspaces and avoids
  // an unnecessary esbuild pre-bundle before the first page load.
  optimizeDeps: { noDiscovery: true, include: [] },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        // keep three out of the main chunk so first paint isn't blocked by it
        manualChunks: { three: ["three"], gsap: ["gsap"] },
      },
    },
  },
});
