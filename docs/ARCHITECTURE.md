# Architecture

## Decision summary

IN KEEPING is a static React application built by Vite and deployed through Cloudflare Workers Static Assets. The public `wrangler.jsonc` has no `main` entry and no compute or data binding. React, parsing, hashing, IndexedDB persistence, exports, and report rendering execute in the operator’s browser.

`dist/server/index.js` is a separate, minimal static-asset adapter generated only because ChatGPT Sites checkpoints require a fetch entry point. It is not the GitHub/Cloudflare production topology.

## System context

```text
┌──────────────────────┐
│ GitHub protected main│
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Cloudflare build     │
│ npm ci + release gate│
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Static asset origin  │
│ HTML / CSS / JS/font │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Operator browser     │
│ memory + IndexedDB   │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Explicit local files │
│ imports and exports  │
└──────────────────────┘
```

The only network request required by the application is acquisition of its static origin assets. Application code contains no `fetch` path for workspace content or imported URLs. Cloudflare remains a separate infrastructure processor of ordinary TLS/HTTP/DNS metadata.

## Runtime containers

| Container | Responsibility | Data received | Persistence |
| --- | --- | --- | --- |
| Cloudflare Static Assets | Serve versioned HTML, CSS, JS, fonts, social card, response headers, robots, sitemap, and 404 | HTTP request metadata; no application request body/API | Platform logs/analytics according to account settings; no app workspace store |
| React application | Navigation, editors, comparisons, import review, incidents, reports, operator status | Operator input and selected local files | In-memory working copy |
| Web Crypto | SHA-256 digests and random workspace IDs | Canonical serialized state or source bytes | None |
| IndexedDB v2 | Named manifests and immutable verified generations | Explicit save/create operations | Origin-scoped browser profile storage |
| Browser file activation | Local open/download through Blob object URLs | Explicitly generated export/report/backup | Destination selected or handled by browser/OS |

## Components

| Module | Responsibility |
| --- | --- |
| `app/continuity-lab.tsx` | Task navigation, lists, accessible record blocks, editors, import review, reports, and named-workspace controls |
| `app/lab-core.ts` | Workspace model, catalog parsers, findings, incidents, revisions, rollback, state digests, audit hashing, and Markdown records |
| `app/xml-safety.ts` | Allocation-bounded pre-DOM structural scan; declaration/DTD/PI and depth/element limits |
| `app/archival-schemas.ts` | Ten record types, sixteen field kinds, schema/hierarchy validation, EAD and management-software crosswalks |
| `app/service-register.ts` | Eight service areas, sixteen register definitions, validation, JSON, and long-form CSV |
| `app/record-formats.ts` | Ten catalog serializers and explicit formatting rules |
| `app/public-url.ts` | Shared public-HTTPS policy without network resolution |
| `app/lab-storage.ts` | IndexedDB manifests/generations, tokens, migration, quota, recovery, deletion, and cross-tab change signals |
| `app/workspace-backups.ts` | Exact v2 backup envelope, v1 compatibility review, payload digest, and full-state recovery |
| `app/report-documents.ts` | Deterministic Technical Report and fixed-projection Public Notice HTML |
| `security-headers.ts` / `public/_headers` | Shared checkpoint policy and production static response policy |
| `worker/sites-adapter.ts` | Checkpoint-only static asset pass-through with the same security headers |
| `scripts/*` | Bounded install/build, artifact packaging, static-config validation, and explicit deploy commands |

## Import sequence

```text
select file
    ↓
extension + MIME + byte limit
    ↓
fatal UTF-8 + control boundary
    ↓
format-specific structural preflight
    ↓
exact typed reconstruction
    ↓
complete validation and findings
    ↓
quarantine: Original input / New output
    ↓
operator Apply
    ↓
provenance + destination revalidation
    ↓
one new revision and linked event
```

Review does not mutate workspace state. Apply does not trust the earlier review object: it rechecks source binding, exact record shape, findings, destination IDs/identifiers, hierarchy, and complete-set invariants. Failure returns an operation notice and leaves the prior revision unchanged.

## Save and recovery sequence

```text
explicit Save
    ↓
complete snapshot + audit validation
    ↓
25 MiB serialization and quota preflight
    ↓
SHA-256 payload digest
    ↓
optimistic token comparison
    ↓
single manifest/generation transaction
    ↓
current generation + one prior generation
```

On open, the active generation must match both its stored payload digest and the digest bound by its manifest, then pass complete snapshot and audit validation. A disagreement between the active bytes and manifest stops the operation; the application does not conceal that disagreement by opening a fallback. If the active generation is missing or fails structural validation without a digest disagreement, the prior generation may open only when the manifest also binds that generation's digest and the complete payload verifies. It opens as an unsaved recovery copy. Opening never rewrites or deletes either stored generation.

Invalid manifests, orphan generations, and unreferenced generations enter a separate bounded inspection path. The operator selects a generation, the application recomputes its payload digest and validates the complete workspace, and reconstruction creates a new UUID workspace after explicit confirmation. The quarantined source bytes remain unchanged for diagnosis or a later institutionally governed deletion.

IndexedDB is scoped to the exact scheme/host/port. Moving from the temporary Sites origin to the Hover/Cloudflare canonical domain is therefore a data migration, not a transparent DNS change. Apex and `www` are also different stores; only one may serve the workbench.

## State model

A workspace contains an active revision, retained revisions, incidents, and an audit ledger. A revision contains catalog records, configuration, archival schemas/records, and service-register records. Incident notes are operational append-only entries within the workspace; changes to state/owner/next action update the incident and add a state-bound audit event.

Revision content is retained for at most 20 versions. When the cap rotates, the oldest revision body is removed; later audit events retain hashes and actions but cannot reconstruct that body. The limit is a product storage boundary, not a records-retention schedule.

At 5,000 events, event 5,000 remains saveable without a redundant save event. Further state mutations are rejected. The operator exports evidence and creates or duplicates a successor workspace; its first event records the predecessor ledger hash.

## Audit construction

```text
canonical non-audit state
          ↓ SHA-256
current state digest
          ↓
event fields + previous hash
          ↓ SHA-256
current event hash
          ↓
next event previous hash
```

Verification detects mismatched event hashes, broken links, sequence errors, revision digests, and a latest event that does not bind current state. It cannot authenticate the actor, prevent an actor with write access from recomputing a new consistent chain, anchor trusted time, or always reveal valid tail truncation. The Technical Report diagrams and threat model preserve this boundary.

## Reports

The Technical Report is a 14-cell static staff record. It includes document control; straight-line software/data diagrams; inventory; interoperability boundary; all findings; complete catalog/archive/service Original input and New output blocks; incidents; schemas; formatting tables; configuration; revisions; audit; safeguards; and production limits. An 8 MiB workspace-input boundary and 32 MiB generated-output boundary prevent unbounded single-document rendering.

The Public Notice is a four-cell static public record constructed only from nonsynthetic open-incident service categories. It cannot see raw evidence, notes, identifiers, workspace name, records, configuration, hashes, or staff role values. Open Sample data incidents block generation.

Both HTML files embed Jost and CSS, carry `default-src 'none'` plus `script-src 'none'` and `connect-src 'none'`, make no runtime request, and use ordered-list diagrams with a single path and no crossing lines.

## Response and cache architecture

The production CSP is `script-src 'self'`, `style-src 'self'`, and `connect-src 'none'`; no inline application script or style is required. Frame/object/media/form/worker/manifest paths are denied. The static root and HTML use `no-cache`; content-hashed JS/CSS and fonts use one-year immutable caching. `404-page` preserves real not-found responses instead of sending the application shell for unknown paths.

HSTS is one year without `includeSubDomains` or preload. Those broader commitments require separate domain-wide review. Observability is disabled in `wrangler.jsonc`; Cloudflare account-level request analytics/logs still require platform configuration and disclosure.

## Failure behavior

- Parser, namespace, MIME, UTF-8, shape, cardinality, URL, date, hierarchy, and semantic failures stay in quarantine.
- Unsupported but common BibTeX constructs are rejected with an operator-facing reason rather than partially parsed.
- Malformed RIS/MARC mnemonic lines reject the file; they are not skipped.
- Rejected mutation preserves the active revision and saved generation.
- Quota or persistence denial leaves the working copy open and directs the operator to an explicit plaintext backup.
- Token mismatch blocks overwrite and requires reopen or deliberate duplication; edits are never auto-merged.
- A report over its capacity boundary fails before file activation; component exports and backup remain available.
- A blocked popup can be replaced with Download HTML.
- Static-origin outage affects application acquisition but does not remotely erase existing IndexedDB; browser cache behavior and installed asset availability are not promised as offline service.

## Build outputs

| Path | Purpose |
| --- | --- |
| `dist/client` | Deployable Cloudflare static assets |
| `dist/client/_headers` | Static route response policy consumed by Cloudflare |
| `dist/server/index.js` | Sites checkpoint adapter only |
| `dist/server/wrangler.json` | Generated Sites checkpoint configuration only |
| `dist/.openai/hosting.json` | Sites project identity copied at build |
| `wrangler.jsonc` | Source-controlled GitHub/Cloudflare production configuration |
