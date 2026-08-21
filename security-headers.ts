export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "media-src 'none'",
  "form-action 'none'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
].join("; ");

export const SECURITY_HEADERS = [
  ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
  ["Referrer-Policy", "no-referrer"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
  ["Origin-Agent-Cluster", "?1"],
  ["X-DNS-Prefetch-Control", "off"],
  ["Strict-Transport-Security", "max-age=31536000"],
  [
    "Permissions-Policy",
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  ],
] as const;
