import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function fetchRoot() {
  const html = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("https://lab.example/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the finished product metadata", async () => {
  const response = await fetchRoot();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>IN KEEPING — Library systems continuity<\/title>/);
  assert.match(html, /IN KEEPING/);
  assert.match(html, /browser-local workbench/i);
  assert.match(html, /og:image/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Starter Project/);
});

test("sets restrictive response headers", async () => {
  const response = await fetchRoot();
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /font-src 'self' data:/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("origin-agent-cluster"), "?1");
  assert.equal(response.headers.get("x-dns-prefetch-control"), "off");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.match(csp, /script-src-attr 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
});
