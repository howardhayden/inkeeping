export type PublicUrlReview = { ok: true; url: URL } | { ok: false; reason: string };

export function reviewPublicHttpsUrl(value: string, allowTemplate = false): PublicUrlReview {
  if (typeof value !== "string" || value.length > 2048) return { ok: false, reason: "URL exceeds 2,048 characters." };
  let url: URL;
  try {
    const candidate = allowTemplate ? value.replace(/\{[^{}]{1,80}\}/g, "value") : value;
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "URL is malformed." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only HTTPS URLs are accepted." };
  if (url.username || url.password) return { ok: false, reason: "Credentials must not be embedded in URLs." };

  const rawHost = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // Alternate spellings with terminal DNS dots can bypass hostname policy in
  // some consumers. Canonical public links do not need them, so fail closed.
  if (rawHost.endsWith(".")) return { ok: false, reason: "Hostnames with trailing dots are not accepted." };
  const host = rawHost;
  if (!host
    || host === "localhost"
    || host.endsWith(".localhost")
    || /\.(?:local|internal|test|invalid|onion)$/.test(host)
    || host.endsWith(".home.arpa")) return { ok: false, reason: "Private or local hosts are not accepted." };

  if (isIpv4(host)) {
    if (!isGlobalIpv4(host)) return { ok: false, reason: "Private, reserved, or non-routable IPv4 hosts are not accepted." };
  } else if (host.includes(":")) {
    if (!isGlobalIpv6(host)) return { ok: false, reason: "Private, reserved, or non-routable IPv6 hosts are not accepted." };
  } else if (!host.includes(".")) {
    return { ok: false, reason: "Single-label or local hostnames are not accepted." };
  }

  if ([...url.searchParams.keys()].some((key) => /token|secret|password|passwd|session|credential|signature|api[_-]?key|access[_-]?key/i.test(key))) return { ok: false, reason: "URL appears to contain a secret." };
  return { ok: true, url };
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isGlobalIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isGlobalIpv6(host: string): boolean {
  const words = expandIpv6(host);
  if (!words) return false;
  const [first, second] = words;
  // Accept only the currently allocated global-unicast envelope. This fails
  // closed for deprecated IPv4-compatible addresses and unallocated space.
  if ((first & 0xe000) !== 0x2000) return false;
  if (words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (first === 0 && words.slice(1, 5).every((word) => word === 0) && words[5] === 0xffff) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2001 && second === 0x0000) return false;
  if (first === 0x2001 && [0x0002, 0x0010, 0x0020].includes(second)) return false;
  if (first === 0x0100 && second === 0 && words.slice(2).every((word) => word === 0)) return false;
  if (first === 0x0064 && second === 0xff9b) return false;
  if (first === 0x2002) return false;
  // 3fff::/20 is reserved for documentation (RFC 9637).
  if (first >= 0x3ff0 && first <= 0x3fff) return false;
  return true;
}

function expandIpv6(host: string): number[] | null {
  if (!/^[0-9a-f:]+$/i.test(host) || (host.match(/::/g) ?? []).length > 1) return null;
  const [leftText, rightText] = host.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  if (!host.includes("::") && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (host.includes("::") ? 1 : 0)) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}
