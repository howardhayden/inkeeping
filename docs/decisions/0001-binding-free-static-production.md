# ADR 0001: Binding-free static production

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

The application performs parsing, validation, hashing, persistence, reporting, and export in the browser. It does not require application compute or data storage at the hosting layer. Adding a Worker entry point or data binding would enlarge the attack surface, create a new processor of library data, and make privacy/operations claims depend on server behavior.

ChatGPT Sites checkpointing separately requires an adapter with a fetch entry point. That requirement must not redefine the public GitHub/Cloudflare topology.

## Decision

Production uses root `wrangler.jsonc` with only `assets.directory: ./dist/client`, routing policy, and disabled Worker observability. It has no `main` and no binding. Cloudflare serves versioned static assets and the committed `_headers` policy.

`worker/sites-adapter.ts`, `vite.sites.config.ts`, `dist/server/index.js`, `dist/server/wrangler.json`, and `.openai/hosting.json` are checkpoint-only artifacts. They are built and tested, but never selected as production configuration.

## Consequences

- There is no application server database, authentication layer, remote workspace recovery, API, scheduled task, or runtime secret.
- Static-origin availability affects acquisition of the client but cannot inspect or remotely erase browser workspaces.
- A future server feature or binding requires a superseding ADR, data flow, access control, privacy/security assessment, retention/deletion plan, incident runbook, and revised deployment.
- Cloudflare still processes ordinary DNS/TLS/HTTP metadata according to account/platform settings; “binding-free” does not mean no infrastructure processor exists.

## Verification

- `tests/production-contracts.test.mjs` rejects `main`, known bindings, or enabled observability.
- `scripts/validate-cloudflare-build.mjs` distinguishes root production from the generated checkpoint configuration.
- `npm run deploy:dry-run` uses root `wrangler.jsonc`.
- Live verification checks a static-only request graph and response policy.
