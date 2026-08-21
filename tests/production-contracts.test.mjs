import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveSiteOrigin } from "../app/site-metadata.ts";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const viteConfig = await readFile(
  new URL("../vite.config.ts", import.meta.url),
  "utf8",
);
const sitesViteConfig = await readFile(
  new URL("../vite.sites.config.ts", import.meta.url),
  "utf8",
);
const adapter = await readFile(
  new URL("../worker/sites-adapter.ts", import.meta.url),
  "utf8",
);
const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const headers = await readFile(
  new URL("../security-headers.ts", import.meta.url),
  "utf8",
);
const deployScript = await readFile(
  new URL("../scripts/cloudflare-deploy.sh", import.meta.url),
  "utf8",
);
const artifactValidator = await readFile(
  new URL("../scripts/validate-cloudflare-build.mjs", import.meta.url),
  "utf8",
);

test("production package excludes unused server persistence and checks every TypeScript surface", () => {
  assert.equal(packageJson.version, "1.0.0");
  assert.equal(packageJson.dependencies["drizzle-orm"], undefined);
  assert.equal(packageJson.devDependencies["drizzle-kit"], undefined);
  assert.match(packageJson.scripts.typecheck, /typecheck:app/);
  assert.match(packageJson.scripts.typecheck, /typecheck:worker/);
  assert.match(packageJson.scripts.typecheck, /typecheck:tools/);
  assert.match(packageJson.scripts["release:check"], /deploy:dry-run/);
});

test("Cloudflare production is static, current, binding-free, and silent", () => {
  assert.equal(wrangler.compatibility_date, "2026-08-20");
  assert.equal(wrangler.main, undefined);
  assert.equal(wrangler.workers_dev, false);
  assert.equal(wrangler.preview_urls, false);
  assert.equal(wrangler.routes, undefined);
  assert.equal(wrangler.assets.directory, "./dist/client");
  assert.equal(wrangler.assets.not_found_handling, "404-page");
  assert.deepEqual(wrangler.observability, { enabled: false });
  assert.doesNotMatch(JSON.stringify(wrangler), /d1_databases|r2_buckets|kv_namespaces|durable_objects/);
  assert.doesNotMatch(adapter, /console\.|fetch\([^r]|D1Database|IMAGES|image-optimization/);
  assert.match(adapter, /satisfies ExportedHandler<SitesEnvironment>/);
  assert.match(viteConfig, /outDir: "dist\/client"/);
  assert.match(viteConfig, /sourcemap: false/);
  assert.match(sitesViteConfig, /sourcemap: false/);
});

test("site origin configuration accepts only a canonical HTTPS origin", () => {
  assert.equal(resolveSiteOrigin("https://inkeep.ing").href, "https://inkeep.ing/");
  for (const invalid of [
    "http://inkeep.ing",
    "https://user@inkeep.ing",
    "https://inkeep.ing:8443",
    "https://inkeep.ing/path",
    "https://inkeep.ing/?query=yes",
    "https://inkeep.ing/#fragment",
  ]) {
    assert.throws(() => resolveSiteOrigin(invalid), /must be an HTTPS origin/);
  }
});

test("production deployment refuses placeholder and checkpoint canonical origins", () => {
  assert.match(deployScript, /--production-origin/);
  assert.match(deployScript, /WRANGLER_HIDE_BANNER=true/);
  assert.match(deployScript, /DO_NOT_TRACK=1/);
  assert.match(deployScript, /SITES_ENV_READY/);
  assert.match(deployScript, /sites-env\.sh/);
  assert.match(deployScript, /unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy/);
  assert.equal((deployScript.match(/--autoconfig=false/g) ?? []).length, 2);
  assert.match(artifactValidator, /\.example/);
  assert.match(artifactValidator, /\.chatgpt\.site/);
  assert.match(artifactValidator, /\.workers\.dev/);
  assert.match(artifactValidator, /final public VITE_SITE_URL/);
});

test("response policy isolates script attributes and avoids unverified HSTS preload claims", () => {
  assert.match(headers, /script-src-attr 'none'/);
  assert.match(headers, /Origin-Agent-Cluster/);
  assert.match(headers, /X-DNS-Prefetch-Control/);
  assert.match(headers, /max-age=31536000/);
  assert.doesNotMatch(headers, /preload|includeSubDomains/);
});
