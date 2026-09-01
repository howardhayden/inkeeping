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
| Web Crypto | SHA-256 digests, P-256 witness-signature verification, and random workspace IDs | Canonical state/source bytes and operator-supplied signed continuity material | None |
| IndexedDB v3 | Named manifests, immutable manifest-bound generations, and separate local continuity anchors | Explicit save/create/baseline operations | Origin-scoped browser profile storage |
| Browser file activation | Local open/download through Blob object URLs | Explicitly generated export/report/backup | Destination selected or handled by browser/OS |

## Components

| Module | Responsibility |
| --- | --- |
| `app/continuity-lab.tsx` | Task navigation, lists, accessible record blocks, editors, import review, reports, and named-workspace controls |
| `app/lab-core.ts` | Workspace model, catalog parsers, findings, incidents, revisions, rollback, state digests, audit hashing, and Markdown records |
| `app/json-safety.ts` | Raw JSON duplicate-member and Unicode-scalar quarantine before semantic parsing |
| `app/xml-safety.ts` | Allocation-bounded pre-DOM structural scan; declaration/DTD/PI and depth/element limits |
| `app/archival-schemas.ts` | Ten record types, sixteen field kinds, schema/hierarchy validation, EAD and management-software crosswalks |
| `app/service-register.ts` | Eight service areas, sixteen register definitions, validation, JSON, and long-form CSV |
| `app/record-formats.ts` | Ten catalog serializers and explicit formatting rules |
| `app/public-url.ts` | Shared public-HTTPS policy without network resolution |
| `app/continuity-anchor.ts` | Exact local continuity checkpoints, consecutive-history extension, and unsigned diagnostic exact-state receipts |
| `app/external-continuity.ts` | P-256 signed witness DTOs, bounded chain topology, pinned trust-policy terminals, key status, and exact-checkpoint verification |
| `app/evidence-authority.ts` | Exact source/review/scope bindings, durable warning manifests, and explicit non-authoritative evidence dispositions |
| `app/spreadsheet-safety.ts` | Shared Unicode-aware formula-risk classification and reversible text protection for tabular outputs |
| `app/interoperability-evidence.ts` | Strict receiver-profile/package/diff/run evidence chain and conservatively derived assessment statuses |
| `app/output-freshness.ts` | Click-time named-save lease, exact reopened-snapshot rendering, repeated artifact/state checks, and single-use activation |
| `app/lab-storage.ts` | IndexedDB manifests/generations/anchors, tokens, migration, quota, recovery, deletion, cross-tab signals, and final readonly activation fence |
| `app/workspace-backups.ts` | Exact v2 backup envelope, v1 compatibility review, payload digest, and bounded workspace-payload recovery |
| `app/recovery-transition.ts` | Exact non-activating backup/continuity review record that refuses inherited authority and requires a new lineage |
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
quarantine: catalog Original/New or archival review
    ↓
explicit admit-unverified / reject / withdraw disposition
    ↓
unchanged-review + provenance + destination revalidation
    ↓
unverified evidence register + linked event
    ↓
one new revision only for admit-unverified
```

Review does not mutate workspace state. A successful catalog or archival review is bound in memory to that exact review instance and every decision field. Consumption requires a complete disposition with claimed origin, custody note, role claim, rationale, policy reference, and explicitly untrusted browser time. Apply accepts only that unchanged object; a clone, mutation, or coherently substituted review is rejected and the file must be reviewed again. Apply also rechecks record shape, findings, destination IDs/identifiers, hierarchy, and complete-set invariants. Every valid explicit decision receives one linked application outcome. Reject, withdraw, destination conflict, and capacity failure preserve `not-applied`; success preserves `applied` plus the exact resulting revision ID/state digest. Source kind, reason, outcome, and disposition must agree. There is deliberately no local verified, trusted, or authoritative status. Every claim may be fabricated together, so structural success and operator disposition do not establish truth, custody, or completeness.

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
verify manifest-bound save base
    ↓
verify and extend local anchor when present
    ↓
single manifest/generation/anchor transaction
    ↓
recheck optimistic token, recovery generation, and anchor
```

Before a normal save opens its write transaction, the application re-reads and internally validates the manifest-bound active generation and the prior generation that rotation would delete. If a local continuity anchor exists, the saved base must match its checkpoint and the new audit ledger must contain the complete old ledger as an exact prefix; the next checkpoint is prepared for the immediately following generation. A reset ledger that merely names the old terminal hash cannot advance the same anchor. Ledger rollover uses a new workspace ID/lineage and separately accepted baseline. A recovery save additionally requires the active generation to remain invalid without a digest disagreement and requires the submitted workspace to match the internally validated fallback byte for byte. Anchored lineages cannot be repaired in place from an older generation. The transaction rechecks the optimistic token, selected recovery generation, and current anchor before writing the generation, manifest, and advanced anchor atomically. A rejected check leaves the stored generations and anchor in place.

On open, the active generation must match both its stored payload digest and the digest bound by its manifest, then pass complete snapshot and audit validation. The manifest timestamp must match the stored generation timestamp; manifest and generation byte counts must match the validated serialization; and the manifest name and domain counts must match the validated payload. A present anchor is separately validated and must match the generation, exact payload digest, audit genesis/terminal hashes, terminal state digest, event count, workspace ID, and lineage ID. Disagreement is reported as continuity failure and blocks ordinary outward artifacts; local equality alone yields only `continuity-verified-local`, which also remains blocked. An unsigned receipt may be compared diagnostically but cannot release output. A disagreement between the active bytes and manifest stops the operation; the application does not conceal that disagreement by opening a fallback. If the active generation is missing or fails structural validation without a digest disagreement, the prior generation may open only when the manifest also binds that generation's digest and the complete payload passes the same internal validation. It opens as an unsaved recovery copy. Opening never rewrites or deletes either stored generation.

An operator may explicitly accept an unanchored current generation as a baseline only after supplying bounded acceptance fields and acknowledging that continuity is not authenticity. This freezes the accepted bytes; it does not show they were true or complete. The local anchor is separate from the workspace payload but remains in the same origin, device, and attacker domain. Replacing the workspace while that anchor remains unchanged fails. Replacing every browser-local store can still produce a coherent local result. An unsigned receipt downloaded after the exact saved checkpoint may expose that co-replacement only when it remains unchanged outside the compromised domain, but the application cannot establish that independence. Manifest, generations, and anchor are read in one IndexedDB snapshot when a receipt is made. Receipts remain diagnostic and never unlock ordinary output.

For ordinary output, the operator supplies a P-256 signed witness set and a continuity trust policy, then separately enters the exact current policy SHA-256 obtained outside those files. The policy file cannot authorize itself. Verification reconstructs a single sequence-1-rooted chain, rejects duplicate, gap, fork, disconnected, cross-origin, truncated, conflicting-terminal, unknown-key, revoked-key, and bad-signature states, and requires the policy terminal and signed terminal to bind the complete current local checkpoint. Only `trusted-match` supplies an activation identity. That internal status describes correspondence under the exact selected policy; policy custody, signer authority, baseline truth/completeness, and trusted time remain external. Save, rename, and reload clear this process-local proof, so a later saved generation requires a new signed terminal and current pinned policy.

Invalid manifests, orphan generations, and unreferenced generations enter a separate bounded inspection path. The operator selects a generation, the application recomputes its payload digest and validates the complete workspace, and reconstruction creates a new UUID workspace after explicit confirmation. The quarantined source bytes remain unchanged for diagnosis or a later institutionally governed deletion.

IndexedDB is scoped to the exact scheme/host/port. Moving from the temporary Sites origin to the Hover/Cloudflare canonical domain is therefore a data migration, not a transparent DNS change. Apex and `www` are also different stores; only one may serve the workbench.

## State model

A workspace contains an active revision, retained revisions, incidents, an evidence-disposition register, linked evidence-application outcomes, and an audit ledger. A revision contains catalog records, configuration, archival schemas/records, and service-register records. Evidence decisions bind exact source metadata, parser profile, canonical reviewed payload, entity scope, and an explicit operator disposition; application outcomes bind whether/why it applied and the resulting revision ID/state digest where applicable. They never express verified authority. Incident notes are operational append-only entries within the workspace; changes to state/owner/next action update the incident and add a state-bound audit event.

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

Verification detects mismatched event hashes, broken links, sequence errors, revision digests, and a latest event that does not bind current state. A matching local continuity anchor additionally detects a regenerated saved payload while that separate checkpoint remains unchanged. A signed witness sequence under an exactly pinned policy can bind that checkpoint outside the browser-local hash graph, but it does not make the underlying audit events signed or establish source truth, completeness, policy custody, signer authority, or trusted time. An actor who controls every browser-local store can still replace local state; whether that replacement can obtain a valid signature under the institution's current pinned policy is an external governance question.

## Outward-artifact freshness sequence

```text
operator requests artifact
    ↓
require named, clean, non-recovery session
    ↓
reopen and validate exact saved generation
    ↓
verify signed witness chain + exact separately obtained policy digest
    ↓
render from reopened saved snapshot
    ↓
construct immutable file + repeat state/artifact/external checks
    ↓
readonly manifest/generation/anchor fence + synchronous activation
```

Catalog batch and per-record exports, archive exports, service exports, operational documents, and Public Notices use this authoritative lease. Storage failure, recovery fallback, identity disagreement, token drift, state mismatch, anything short of a signed-chain `trusted-match` under the exact current separately obtained policy digest, or active unverified/unattributed evidence stops before activation. An unsigned local receipt remains diagnostic. React state alone is insufficient. The Technical Report is intentionally diagnostic: it renders the open session while the UI supplies a live `current`, `stale`, `unsaved-changes`, or `not-saved` classification. Current-session and conflict-recovery backups are also explicit preservation paths rather than authoritative derivatives.

The lease is single-use. After the repeated checks, `activateAgainstLocalWorkspace` accepts only the exact digest-bound `File` and its open/download disposition, then opens one readonly IndexedDB transaction across the manifest, generation, and anchor stores. Exact token, generation, payload, complete workspace, and complete anchor comparisons precede the synchronous browser activation request while that snapshot remains held. Earlier writes are visible and later writes to those stores queue until the request returns. The fence does not prove that the browser or operating system saved/opened the file, prevent a later commit, give the file a continuing freshness signal, or establish institutional approval, evidence truth, or policy custody.

## Reports

The Technical Report is a 15-cell static staff-facing view of the active workspace state. It includes document control; straight-line software/data diagrams; inventory; interoperability boundary; current findings; complete catalog **Original input** and **New output** blocks; archive/service **Entered active values** and **Canonical active record** blocks; incidents; schemas; formatting tables; configuration; evidence dispositions; revision and audit indexes; safeguards; and production limits. Archive and service records have no separate per-record original-source version in the data model. Retained historical revision bodies are available in a workspace backup rather than fully rendered in this report. An 8 MiB workspace-input boundary and 32 MiB generated-output boundary prevent unbounded single-document rendering.

The Public Notice is a four-cell static public record constructed only from nonsynthetic open-incident service categories. It cannot see raw evidence, notes, identifiers, workspace name, records, configuration, hashes, or staff role values. Any synthetic incident in the workspace blocks generation, including a resolved one.

Both HTML files embed Jost and CSS, carry `default-src 'none'` plus `script-src 'none'` and `connect-src 'none'`, make no runtime request, and use ordered-list diagrams with a single path and no crossing lines.

## Response and cache architecture

The production CSP is `script-src 'self'`, `style-src 'self'`, and `connect-src 'none'`; no inline application script or style is required. Frame/object/media/form/worker/manifest paths are denied. The static root and HTML use `no-cache`; content-hashed JS/CSS and fonts use one-year immutable caching. `404-page` preserves real not-found responses instead of sending the application shell for unknown paths.

HSTS is one year without `includeSubDomains` or preload. Those broader commitments require separate domain-wide review. Observability is disabled in `wrangler.jsonc`; Cloudflare account-level request analytics/logs still require platform configuration and disclosure.

## Failure behavior

- Parser, namespace, MIME, UTF-8, shape, cardinality, URL, date, hierarchy, and semantic failures stay in quarantine.
- Unsupported but common BibTeX constructs are rejected with an operator-facing reason rather than partially parsed.
- Malformed RIS/MARC mnemonic lines reject the file; they are not skipped.
- Rejected mutation preserves the active revision and saved generation.
- Missing, malformed, local-only, invalid-signature, unknown/revoked-key, gap/fork/truncation, policy-pin, origin, terminal, or checkpoint-mismatch continuity state blocks ordinary outward artifacts and cannot be repaired by an unsigned receipt or silent in-place re-anchoring.
- Active admitted-unverified evidence, unattributed archive/service content, and evidence-record/application tampering block ordinary outward artifacts; historical non-reaching decisions remain reportable without permanently latching unrelated content. Diagnostic reports and plaintext backups remain available for review.
- Ordinary output fails before activation when saved-state inspection fails, the saved/session/external-continuity fingerprint changes during construction, the artifact snapshot mutates, or the final readonly activation fence does not match exactly.
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
