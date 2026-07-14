import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  build: {
    // Emit dist/.vite/manifest.json so scripts/bundle-report.mjs can compute the
    // first-paint JS closure per window route (#356 — main window vs a detached
    // canvas window, #84).
    //
    // Deliberately NO `rollupOptions.output.manualChunks`: chunking only decides
    // which FILE a module lands in — a module statically reachable from the entry is
    // still fetched, parsed and executed before the first render whatever chunk it
    // sits in. The only lever that removes work from the first-paint path is a
    // dynamic `import()` (React.lazy), which is what the app uses (routes, panels,
    // modals, the xterm WebGL addon, mermaid #254). Rollup already hoists modules
    // shared by ≥2 async chunks into a shared chunk on its own.
    manifest: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`.
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
