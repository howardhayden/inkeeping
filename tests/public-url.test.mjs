import assert from "node:assert/strict";
import test from "node:test";
import { reviewPublicHttpsUrl } from "../app/public-url.ts";

test("public URL policy permits only routable credential-free HTTPS targets", () => {
  assert.equal(reviewPublicHttpsUrl("https://example.org/record/1").ok, true);
  const rejected = [
    ["http://example.org/", /Only HTTPS/],
    ["https://user:pass@example.org/", /Credentials/],
    ["https://localhost../x", /trailing dots/],
    ["https://foo.local../x", /trailing dots/],
    ["https://127.0.0.1../x", /trailing dots/],
    ["https://10.0.0.1/", /IPv4/],
    ["https://100.64.0.1/", /IPv4/],
    ["https://169.254.1.1/", /IPv4/],
    ["https://203.0.113.1/", /IPv4/],
    ["https://[::1]/", /IPv6/],
    ["https://[fe80::1]/", /IPv6/],
    ["https://[fc00::1]/", /IPv6/],
    ["https://[::ffff:127.0.0.1]/", /IPv6/],
    ["https://[2001:db8::1]/", /IPv6/],
    ["https://[2001:0000::1]/", /IPv6/],
    ["https://[::7f00:1]/", /IPv6/],
    ["https://[100::1]/", /IPv6/],
    ["https://[3fff::1]/", /IPv6/],
    ["https://[4000::1]/", /IPv6/],
    ["https://[f000::1]/", /IPv6/],
    ["https://example.org/?api_key=secret", /contain a secret/],
  ];
  for (const [url, expected] of rejected) {
    const result = reviewPublicHttpsUrl(url);
    assert.equal(result.ok, false, url);
    if (!result.ok) assert.match(result.reason, expected, url);
  }
});
