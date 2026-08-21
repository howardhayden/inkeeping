import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolveSiteOrigin } from "./app/site-metadata.ts";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function releaseDocuments(siteOrigin: URL): Plugin {
  const origin = siteOrigin.origin;
  return {
    name: "in-keeping-release-documents",
    apply: "build",
    transformIndexHtml(html) {
      return html.replaceAll("__SITE_ORIGIN__", origin);
    },
    async closeBundle() {
      const output = resolve(process.cwd(), "dist/client");
      await Promise.all([
        writeFile(
          resolve(output, "robots.txt"),
          `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
        ),
        writeFile(
          resolve(output, "sitemap.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><lastmod>2026-08-20</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url></urlset>\n`,
        ),
      ]);
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const siteOrigin = resolveSiteOrigin(environment.VITE_SITE_URL);
  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    preview: { host: "0.0.0.0" },
    plugins: [react(), releaseDocuments(siteOrigin)],
    build: {
      outDir: "dist/client",
      assetsDir: "assets",
      emptyOutDir: true,
      sourcemap: false,
      target: "es2022",
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: "vendor", test: /node_modules/ }],
          },
        },
      },
    },
  };
});
