import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// The console builds into core/web next to the pages the core already serves.
// scene3d.js stays in core/web and keeps importing "three"; the aliases point it at this package's copy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: [
      { find: /^three$/, replacement: here("./node_modules/three/build/three.module.js") },
      { find: /^three\/addons\/(.*)$/, replacement: here("./node_modules/three/examples/jsm/$1") },
    ],
  },
  build: {
    outDir: here("../web"),
    emptyOutDir: false,
    assetsDir: "console-assets",
    rollupOptions: { input: here("./console.html") },
  },
  server: {
    port: 5173,
    fs: { allow: [here("..")] },
    proxy: { "/api": "http://127.0.0.1:8787", "/vendor": "http://127.0.0.1:8787", "/report.js": "http://127.0.0.1:8787" },
  },
});
