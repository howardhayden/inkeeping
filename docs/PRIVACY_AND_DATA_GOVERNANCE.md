# Privacy and data governance

## Scope

IN KEEPING is a browser-local workbench, not a privacy-management system, records repository, identity provider, or institutional system of record. This document identifies data flows and operational responsibilities. It does not determine a lawful basis, records schedule, data classification, accessibility accommodation, research-review obligation, or contractual role for an institution. Those determinations remain with the deploying institution.

## Data-flow statement

Application code receives workspace data only through operator input, selected local files, the Sample data action, or an explicitly opened browser-local workspace/backup. The working copy is processed in browser memory. Named workspaces are stored in origin-scoped IndexedDB after an explicit create/save action. Exports are created as browser Blob downloads or opened static HTML documents after an explicit operator action.

Application code contains no analytics, telemetry, cookies, background upload, vendor API, URL fetch, or remote font path. The production Content Security Policy sets `connect-src 'none'`. These implementation facts are covered by source/configuration tests, but a live-site network observation remains a deployment validation task.

Serving the application still requires ordinary requests for HTML, CSS, JavaScript, fonts, icons, and other static assets. Cloudflare and upstream DNS/TLS/network providers can process request IP address, time, hostname, user agent, TLS and cache information, and similar HTTP metadata according to their account configuration and terms. `wrangler.jsonc` disables application-configured observability; that is not proof that every Cloudflare account-level log or analytics feature is disabled. The institution must review the actual Cloudflare account.

## Data inventory

| Data class | Examples | Where it can exist | Default application disclosure |
| --- | --- | --- | --- |
| Import source | MARCXML, MODS, Dublin Core, EAD, RIS, BibTeX, CSV/TSV, schema packages | Selected file, browser memory during review; normalized source evidence if applied | None to application server; visible to the local operator |
| Catalog record | Titles, names, identifiers, URLs, holdings/access state, descriptive metadata | Working copy, revisions, IndexedDB, backups, catalog exports, Technical Report | Excluded from Public Notice |
| Archival record/schema | Collection descriptions, accession/authority data, names, rights, locations, digital-object fields, custom schema definitions | Working copy, revisions, IndexedDB, backups, archival exports, Technical Report | Excluded from Public Notice |
| Service register | Vendor/system names, owners by role, configurations, renewal/access/preservation workflow fields, sensitivity label | Working copy, revisions, IndexedDB, backups, service exports, Technical Report | Full records excluded from Public Notice |
| Incident record | Service, severity/state, owner role, evidence, notes, next action, optional catalog link | Working copy, IndexedDB, backups, operational documents, Technical Report | Public Notice receives only a fixed nonsynthetic open-incident service-category projection |
| Configuration | Resolver/proxy/pickup/member values and related operational settings | Working copy, revisions, IndexedDB, backups, Technical Report | Excluded from Public Notice |
| Integrity metadata | Source SHA-256, revision/state/payload digests, linked audit events, local UUIDs, save tokens | Working copy, IndexedDB, backups, Technical Report | Excluded from Public Notice |
| Evidence disposition claims | Claimed origin, custody note, actor-role claim, rationale, policy reference, untrusted browser time, exact source/review/scope digests | Working copy, revisions/audit, IndexedDB, backups, Technical Report | Excluded from Public Notice; never authenticated by the application |
| Continuity metadata | Local workspace/lineage checkpoint, anchor digests, exact unsigned receipt | Anchor in IndexedDB; receipt in browser/OS download destinations | Excluded from ordinary content exports and workspace backup; not identity, custody, or trusted time |
| Operator-entered workspace metadata | Workspace name; text entered into records, evidence, notes, and schemas | Memory, IndexedDB, backups, selected exports | Depends on selected export; excluded from Public Notice unless represented by the fixed service-category projection |
| Sample data | Synthetic catalog/service/archive/incident examples created only by the Sample data action | Same locations as a working copy if the operator saves/exports it | Public Notice generation is blocked while any synthetic incident is present, including a resolved one |
| Platform request metadata | IP address and ordinary DNS/TLS/HTTP/cache metadata | Cloudflare and network/platform systems | Outside application workspace storage and governed by platform/account policy |

The application does not inspect operator text for personal, confidential, regulated, export-controlled, or privileged information. A field's `restricted` sensitivity label is metadata for workflow; it does not encrypt or access-control that field.

## Storage and confidentiality

### Working memory

Startup is blank. The current session is held in browser memory until the operator creates a named workspace, explicitly saves, opens another copy, or closes the page. Memory-local operation is not an anonymity guarantee: browser extensions, endpoint tooling, screenshots, crash collection, swap, and a compromised device are outside the application boundary.

### IndexedDB

Named workspaces are plaintext objects in IndexedDB under the exact production origin. Confidentiality relies on the browser profile, operating-system account, disk/device controls, and institutional endpoint policy. The application does not apply field-level or database encryption. Browser eviction, profile deletion, private-browsing behavior, storage clearing, and device loss are external lifecycle events.

The application internally validates saved state and binds local generations to manifest digests. An explicitly accepted local continuity anchor is stored separately from the workspace payload and advances atomically on verified saves. Both remain in the same origin/device/attacker domain. SHA-256, checkpoint status, workspace identifiers, and optimistic tokens are not encryption or authentication and do not establish authorship, custody, authority, truth, trusted time, or completeness.

### Downloads

Catalog/archive/service exports, operational Markdown, Technical Reports, Public Notices, workspace backups, and continuity receipts are plaintext. Workspace backup v2 requires the literal marker `plaintext-json-not-encrypted`; a missing or contrary marker rejects review. The marker provides notice only. Legacy version-1 backup envelopes remain reviewable without the marker for workspace-payload recovery.

A workspace backup includes the bounded workspace payload and its evidence-disposition claims but excludes IndexedDB manifests/generations/tokens, the separate local anchor, and downloaded receipts. A continuity receipt is an unsigned exact-state comparison object. It is not a signature, trusted timestamp, identity/custody record, or proof that its storage is independent. After every anchored save, the prior receipt is stale for the new checkpoint.

After download, the file is governed by browser/OS destination behavior, filesystem permissions, endpoint backup/synchronization, email or collaboration systems, recipient actions, and the institution's retention and disposal procedures. Deleting a browser-local workspace cannot delete or recall downloaded copies.

### Origin changes

IndexedDB is scoped by scheme, hostname, and port. Moving from a preview host to the canonical Hover/Cloudflare domain, or switching between apex and `www`, creates a different storage boundary. Migration requires an explicit, internally validated workspace backup and an admit-unverified Open disposition on the destination origin. The destination receives neither the old local anchor nor its lineage identity; it begins unanchored and requires a separately documented baseline decision. Preserve the old backup and exact receipt as transition evidence. Validation does not establish authenticity or completeness, and DNS changes do not move IndexedDB.

## Collection and purpose limitation

The software is designed for continuity work: examining exchange files, developing schemas, maintaining bounded cross-department registers, recording incidents and changes, and producing handoff/recovery artifacts. Deployment approval should name the specific institutional purposes and authorized operator groups.

Operators should collect the minimum necessary content:

- use roles or units instead of individual names when a person is not required;
- do not place passwords, API keys, session tokens, private keys, authentication cookies, or vendor credentials in any field;
- link to an institutionally governed ticket or repository rather than copying sensitive evidence when a reference is sufficient;
- omit patron, donor, student, employee, health, financial, or disciplinary data unless the institution has explicitly approved this browser-local plaintext workflow;
- use Sample data for demonstration and training when live data is unnecessary;
- use the Public Notice only for approved public service categories, and review it before publication; and
- use the Technical Report only with recipients authorized for all operational content it includes.

Imported URLs with credentials or secret-like query names are rejected, but this is a guardrail, not a secrets scanner.

## Roles and responsibilities

| Role | Responsibility |
| --- | --- |
| Deploying institution | Approve purpose, data classes, records schedule, legal basis, platform terms, canonical origin, incident process, and acceptable-use boundary. |
| System owner | Maintain repository, dependency and release controls; review threat/risk changes; verify live response policy and Cloudflare account settings. |
| Records/privacy/security reviewers | Classify intended content, approve retention/export handling, evaluate platform metadata, and define breach/escalation requirements. |
| Library workflow owner | Define authoritative systems, crosswalk limitations, review expectations, naming/schema governance, and handoff procedure. |
| Operator | Review catalog Original/New blocks and archive/service active-value views; record only necessary unauthenticated evidence claims; distinguish unverified admission from authority; save/baseline/export deliberately; protect backups/receipts; report anomalies. |
| Recipient | Handle plaintext outputs under the classification and retention rules communicated by the institution. |

The application does not authenticate these roles. UI role labels and the audit value `Local operator` do not establish identity or authority.

## Retention, deletion, and recovery

Application capacity limits are operational bounds, not a retention schedule:

- 20 revision bodies;
- 5,000 linked audit events;
- 500 incidents and 500 notes per incident;
- 50 named local workspaces;
- active and one prior manifest-bound generation per normal saved workspace.

The institution must decide how long to retain source files, workspaces, reports, exports, and quarantine evidence. Rotation of an old revision body does not authorize disposal. Conversely, a retained hash is not a recoverable copy of the removed content.

Browser-local deletion removes the selected IndexedDB manifest, generations, and local continuity anchor through an explicit confirmed action. It does not erase source files, exports, downloaded backups/receipts, browser/OS backups, screenshots, platform request logs, or recipient copies. Data-removal requests therefore require a search of all institutionally governed destinations, not only IN KEEPING.

Corrupt or orphaned local entries are quarantined. An internally consistent recovery candidate is reconstructed into a new UUID workspace after explicit selection, digest and complete-snapshot validation, naming, and confirmation. This does not authenticate the candidate or prove it complete. The original bytes remain unchanged. Their eventual deletion must follow the institution's evidence and retention decision.

## Public and staff documents

Ordinary outward UI artifacts require a clean named generation with an exact signed witness terminal under the current trust-policy digest obtained through a separately governed channel. They are blocked by pending drafts, an in-flight operation, quarantine/storage-epoch changes, active admitted-unverified evidence, and unattributed catalog, archive, or service content. Unsigned receipts remain diagnostic. The UI reopens the generation, renders an immutable `File` from that snapshot, re-digests its bytes, and performs the final exact manifest/generation/anchor check plus synchronous browser activation request inside one readonly IndexedDB transaction. The storage layer accepts only that file and its disposition. This prevents a later writer from committing before the request returns; it does not prove browser/OS save or open completion, prevent later mutation, provide continuing freshness, authenticate content, or approve a recipient/publication. Technical Reports and current-session recovery backups are explicit diagnostic exceptions.

### Technical Report

The Technical Report is a bounded diagnostic active-state notebook HTML file. It can include catalog **Original input** and **New output** blocks; archive/service **Entered active values** and **Canonical active record** blocks; evidence dispositions and their potentially sensitive custody/role/policy claims; current findings; incidents; schemas; configuration; revision/audit indexes; safeguards; and continuity/saved-copy limitations. It may intentionally describe an unsaved, stale, unanchored, or evidence-unverified open session. Treat it at the highest classification represented by any included value. It is static, script-free, remote-resource-free, and plaintext.

### Public Notice

The Public Notice is produced by a separate fixed projection. It may include nonsynthetic open-incident service categories and general assistance/status content. It does not receive workspace name, raw evidence, notes, catalog/archive/service records, configuration, hashes, or staff-role values. Any synthetic incident prevents generation, regardless of whether it is open or resolved.

This technical minimization does not constitute publication approval. A librarian/communications/privacy owner must verify that even category-level disclosure is appropriate, accurate, accessible, timely, and consistent with institutional policy.

## Individual rights and institutional obligations

IN KEEPING can display, export, correct through new revisions, and delete its browser-local copies. Those functions may assist institutional response work, but they do not implement a privacy-rights workflow, legal hold, consent management, discovery search, automated redaction, classification enforcement, or verified erasure across systems.

If records can concern identifiable people, the institution must document:

- the applicable law, policy, contract, or research-review determination;
- the lawful purpose and minimum fields;
- notice, access, correction, restriction, objection, deletion, and appeal procedures where applicable;
- authoritative-source reconciliation so a correction in IN KEEPING is not mistaken for correction in the system of record;
- retention and legal-hold precedence;
- incident/breach assessment and notification routes; and
- cross-border/vendor processing implications for static-host request metadata and any external system used to share downloads.

## Platform and vendor review checklist

The following evidence is external to this repository and must be collected before production acceptance:

- Cloudflare account analytics/log settings, retention, access roles, data location/terms, incident contacts, and subprocessor review;
- GitHub organization access, branch protection, Actions retention, dependency update policy, and secret scanning;
- Hover registrar MFA, recovery, transfer lock, DNS delegation, and authorized contacts;
- canonical apex/`www` decision and redirect behavior;
- device/browser baseline, profile separation, disk encryption, patching, extension policy, remote support, and backup behavior;
- approved download destinations and prohibited synchronization locations;
- institutional data classification and records schedule mapped to each intended workflow; and
- live verification that the deployed application sends no workspace-data request and that defined response headers are present.

Absence of this evidence is a deployment-governance gap, not an application-parser defect.

## Governance review triggers

Privacy and data-governance review must be repeated before any change that adds:

- an API, analytics, telemetry, error reporting, remote font, service worker, web socket, or external resource;
- authentication, collaboration, cloud sync, remote storage, sharing, or a server-side report path;
- automated URL resolution or vendor-system connection;
- new personal-data fields or a broader Public Notice projection;
- encryption with institution-managed keys;
- a new hosting provider, canonical origin, or cross-origin frame; or
- a new data class, research use, patron workflow, or records-retention purpose.

The review result must update this document, [`THREAT_MODEL.md`](THREAT_MODEL.md), [`RISK_REGISTER.md`](RISK_REGISTER.md), and [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md).
