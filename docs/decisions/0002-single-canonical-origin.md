# ADR 0002: Single canonical origin

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

IndexedDB is scoped to the exact origin. Apex, `www`, preview, `workers.dev`, Sites, HTTP, HTTPS, and explicit-port variants therefore create separate local stores. Serving the application at multiple hostnames would make identical-looking workspaces diverge and complicate retention, recovery, support, and decommissioning.

## Decision

Production chooses one operator-approved `CANONICAL_ORIGIN`: an HTTPS origin without credentials, port, path, query, or fragment. `VITE_SITE_URL` must equal it during every production/CI build. Only its host serves the application. Other web variants redirect to it and are not usable workbench origins.

Moving origins is an explicit data migration. Operators export a verified plaintext workspace backup at the old origin, open it at the new origin, create a new named workspace, save, reopen, and compare. The old origin remains available until migration acceptance.

## Consequences

- DNS aliases and Cloudflare redirects do not move IndexedDB.
- Deployment rollback should restore the same origin, not create an alternate live hostname.
- Temporary preview/checkpoint origins use synthetic data only.
- Domain cutover and decommissioning must inventory every origin and browser profile.
- The backup crossing the origin boundary is plaintext and requires approved encrypted storage and transfer controls.

## Verification

- `app/site-metadata.ts` and `tests/production-contracts.test.mjs` enforce the configured-origin shape.
- `scripts/cloudflare-deploy.sh production` invokes `validate-cloudflare-build.mjs --production-origin`, which refuses the reserved `.example`, `.invalid`, `.test`, and `.localhost` namespaces plus Sites `.chatgpt.site` and Worker-preview `.workers.dev` canonical hosts.
- Built canonical, Open Graph, robots, and sitemap values are inspected before deployment.
- Live checks verify one canonical host and one controlled redirect from other web variants.
- The migration procedure is exercised with a synthetic backup before production cutover.
