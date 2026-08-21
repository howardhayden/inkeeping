import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/server",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    lib: {
      entry: "worker/sites-adapter.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
  },
});
