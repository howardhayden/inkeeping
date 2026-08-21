import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const rootConfiguration = JSON.parse(
  await readFile(new URL("wrangler.jsonc", projectRoot), "utf8"),
);
const sitesConfiguration = JSON.parse(
  await readFile(new URL("dist/server/wrangler.json", projectRoot), "utf8"),
);
const index = await readFile(new URL("dist/client/index.html", projectRoot), "utf8");
const headers = await readFile(new URL("dist/client/_headers", projectRoot), "utf8");
const clientFiles = await readdir(new URL("dist/client/", projectRoot), { recursive: true });
const productionOriginRequired = process.argv.includes("--production-origin");

assert.equal(rootConfiguration.name, "in-keeping");
assert.equal(rootConfiguration.main, undefined, "production must not have a Worker entry point");
assert.equal(rootConfiguration.compatibility_date, "2026-08-20");
assert.equal(rootConfiguration.workers_dev, false, "production must not expose a workers.dev origin");
assert.equal(rootConfiguration.preview_urls, false, "production must not expose preview aliases");
assert.equal(rootConfiguration.routes, undefined, "the reviewed Custom Domain remains dashboard-managed");
assert.deepEqual(rootConfiguration.assets, {
  directory: "./dist/client",
  html_handling: "auto-trailing-slash",
  not_found_handling: "404-page",
});
assert.deepEqual(rootConfiguration.observability, { enabled: false });

assert.equal(sitesConfiguration.main, "index.js");
assert.equal(sitesConfiguration.no_bundle, true);
assert.equal(sitesConfiguration.compatibility_date, rootConfiguration.compatibility_date);
assert.equal(sitesConfiguration.observability?.enabled, false);
assert.equal(sitesConfiguration.assets?.directory, "../client");

assert.match(index, /<title>IN KEEPING — Library systems continuity<\/title>/);
assert.doesNotMatch(index, /__SITE_ORIGIN__|NEXT_|vinext|react-server-dom/i);
const canonicalMatch = index.match(/<link rel="canonical" href="([^"]+)"/);
assert.ok(canonicalMatch, "the production document must declare a canonical origin");
const canonicalOrigin = new URL(canonicalMatch[1]);
assert.equal(canonicalOrigin.href, `${canonicalOrigin.origin}/`, "the canonical URL must be an origin root");
if (productionOriginRequired) {
  const hostname = canonicalOrigin.hostname.toLowerCase();
  const reservedSuffix = [".example", ".invalid", ".test", ".localhost"].find((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
  assert.equal(reservedSuffix, undefined, "rebuild with the final public VITE_SITE_URL before production deployment");
  assert.equal(hostname.endsWith(".chatgpt.site"), false, "a Cloudflare production deployment must use its final canonical domain, not the Sites checkpoint origin");
  assert.equal(hostname.endsWith(".workers.dev"), false, "a Cloudflare production deployment must use its final custom domain, not a workers.dev origin");
}
assert.match(headers, /script-src 'self'/);
assert.doesNotMatch(headers, /unsafe-inline/);
assert.match(headers, /connect-src 'none'/);
assert.equal(clientFiles.some((path) => path.endsWith(".map")), false, "production static assets must not publish source maps");

await Promise.all([
  access(new URL("dist/server/index.js", projectRoot)),
  access(new URL("dist/client/404.html", projectRoot)),
  access(new URL("dist/client/favicon.svg", projectRoot)),
  access(new URL("dist/.openai/hosting.json", projectRoot)),
]);

process.stdout.write("Cloudflare static-asset artifact validated.\n");
