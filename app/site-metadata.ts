const FALLBACK_SITE_ORIGIN =
  "https://library-access-continuity-lab.snytzbswmb.chatgpt.site";

export function resolveSiteOrigin(
  configuredOrigin?: string,
): URL {
  if (!configuredOrigin) return new URL(FALLBACK_SITE_ORIGIN);

  const candidate = new URL(configuredOrigin);
  if (
    candidate.protocol !== "https:" ||
    candidate.username ||
    candidate.password ||
    candidate.port ||
    candidate.pathname !== "/" ||
    candidate.search ||
    candidate.hash
  ) {
    throw new Error(
      "VITE_SITE_URL must be an HTTPS origin without credentials, a port, path, query, or fragment.",
    );
  }
  return candidate;
}
