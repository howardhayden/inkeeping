# ADR 0005: No application telemetry

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

Workspace content can contain restricted descriptive records, source evidence, incidents, staff notes, configuration, and identifiers. Continuous client analytics or remote error reporting would create a new collection purpose, processor, data flow, access surface, and retention obligation. The application can be operated with synthetic external health checks and controlled release testing instead.

## Decision

Production includes no application analytics, cookies, session replay, error beacon, remote font/script/style, background upload, remote import, or URL-following request. The CSP commits `connect-src 'none'`; `wrangler.jsonc` disables Worker observability. Operations monitor only public static availability/status/headers and run synthetic browser performance tests outside real work sessions.

Cloudflare account-level DNS, TLS, HTTP, security, analytics, or logging behavior is governed separately. The service owner must inspect and disclose those settings and must not describe this ADR as eliminating all infrastructure metadata.

## Consequences

- Maintainers cannot remotely inspect browser errors or workspace usage.
- Defect reports use minimal synthetic reproduction and operator-supplied environment information.
- Performance baselines are controlled release evidence rather than production RUM.
- Adding any remote application path requires a superseding ADR, necessity/proportionality analysis, data map, consent/legal basis as applicable, processor terms, security controls, retention/deletion, access, incident response, UI disclosure, and tests.

## Verification

- Production contract tests enforce the static configuration and restrictive response policy.
- Build/release review inspects the browser request graph for only same-origin static assets.
- Dependency and bundle review rejects unexpected third-party runtime assets or telemetry.
- Operations monitoring never includes workspace names, filenames, counts, digests, record content, or incident notes.
