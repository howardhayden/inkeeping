# Institutional review dossier

## Document control

| Field | Value |
| --- | --- |
| Project | IN KEEPING — library systems continuity workbench |
| Dossier status | Draft for review preparation |
| Prepared | 2026-08-20 |
| Intended review context | University at Albany / SUNY institutional technology, library, privacy, security, records, accessibility, and research-governance review as applicable |
| Repository release | Must be completed with an immutable commit and release tag before submission |
| System owner | To be assigned by the deploying institution |
| Data owner(s) | To be assigned for each approved workflow |
| Decision authority | To be identified through the institution's current official process |

This dossier is a repository-prepared review aid. It is not a University at Albany or SUNY submission form, approval, endorsement, institutional review board determination, security certification, accessibility conformance report, procurement acceptance, legal opinion, or records-schedule authorization. Names of institutions and review functions identify the intended review context only.

Before any formal submission, the project owner must locate and use the then-current official UAlbany/SUNY forms, portals, policies, offices, and review sequence. If evaluation could be research involving people or identifiable private information, the investigator must obtain the institution's required determination before recruitment or data collection. This repository does not decide whether an activity is human-subjects research.

## Decision requested

At this stage, the narrow requested decision should be:

> Authorize a time-bounded, synthetic-data-only institutional evaluation of the identified release candidate, subject to the controls and stop conditions in this dossier, so designated reviewers can decide whether a separately governed production use is appropriate.

The requested decision does **not** authorize:

- production use with library, patron, employee, donor, vendor-confidential, licensed, restricted, regulated, export-controlled, or unpublished collection data;
- use as an ILS, ERM, archival management system, preservation repository, identity service, proxy, system of record, or evidence-signing service;
- publication of a generated Public Notice;
- transfer of a workspace or report to an unapproved destination;
- collection of evaluation participants' personal information, recordings, or performance data; or
- a claim of standards certification, product interoperability, accessibility conformance, or institutional approval.

A later production decision must identify the exact commit, canonical origin, approved purposes, operator population, allowed data classifications, records schedule, support owner, external controls, accepted residual risks, and exit procedure.

## Purpose and problem statement

Library continuity work frequently occurs between authoritative systems: during an outage, migration, renewal decision, metadata remediation, preservation action, access incident, or handoff. IN KEEPING provides a bounded browser-local workbench for that interval. Its supported purpose is to review exchange files, compare source evidence with normalized records, define archival schemas, maintain cross-department operating records, document incidents and reversible changes, and produce controlled handoff artifacts.

The complete scope and exclusions are governed by [Product scope](../PRODUCT_SCOPE.md). In particular, the application does not authenticate people, enforce institutional authorization, encrypt local content, synchronize workspaces, call vendor APIs, resolve imported URLs, or replace the authoritative platform and professional decision process.

## Proposed evaluation scope

The initial evaluation should cover only:

1. a release candidate built from an immutable reviewed commit;
2. a temporary nonproduction origin or an isolated local build;
3. repository-provided or reviewer-created synthetic fixtures;
4. managed test devices and browser profiles with no live workspace remnants;
5. the task and evidence protocol in [Evaluation protocol](EVALUATION_PROTOCOL.md); and
6. deletion of browser-local evaluation workspaces and controlled disposition of evaluation artifacts when the review closes.

The evaluation should answer whether the implementation and operating model are suitable for further institutional review, not whether a parser-accepted record is bibliographically true or whether one export is compatible with every local/vendor profile.

## Intended operators and workflow fit

The workbench exposes typed operating records across eight areas. These are planning, reconciliation, review, and handoff aids; none becomes authoritative merely by being entered.

| Area | Implemented records and tasks | Review question | System-of-record boundary |
| --- | --- | --- | --- |
| Collections | Collection policy; collection fund | Can scope, audience, exclusions, allocation, and review context be made inspectable? | No acquisitions accounting or selection authority |
| Electronic Resources | Resource entitlement; license obligation | Can coverage, authentication, renewal, perpetual access, accessibility, ILL, and TDM obligations be handed off without copying credentials? | No ERM, contract repository, or legal interpretation |
| Discovery | Discovery profile; link routing | Can mappings, facets, suppression, resolver/proxy routes, and known-item evidence be reviewed together? | No indexing, resolution, proxying, or vendor query execution |
| Preservation / Conservation | Condition assessment; preservation action | Can condition, treatment, fixity references, storage context, and review dates be recorded coherently? | No preservation repository, preservation plan approval, or conservation record of authority |
| Technical Services | Acquisition order; metadata job | Can order/reconciliation context and a versioned transformation/rollback reference be handed off? | No ILS order module, invoice system, or batch executor |
| Special Collections / Archives | Accession; processing plan; ten custom archival record types | Can custody, restrictions, hierarchy, description, and exchange boundaries be reviewed? | No archival management system, donor agreement repository, or finding-aid publisher |
| Data Services | Dataset custody; data management plan | Can stewardship, rights, formats, fixity, retention, storage, and access planning be documented? | No repository, transfer service, research-compliance determination, or DMP approval |
| Rare Books / Manuscripts | Copy provenance; conservation treatment | Can copy-specific evidence, marks, material condition, and treatment context be separated from general description? | No title authority, appraisal, ownership, custody, or treatment authorization |

The implemented definitions and validations are in [`app/service-register.ts`](../../app/service-register.ts). Archival record types, field kinds, schema versioning, hierarchy, and exchange mappings are in [`app/archival-schemas.ts`](../../app/archival-schemas.ts). The role-oriented evidentiary crosswalk is [Competency crosswalk](COMPETENCY_CROSSWALK.md).

## Architecture and data flow

Production is designed as a binding-free Cloudflare static-asset origin. Workspace processing occurs in the browser. The architecture decision is recorded in [ADR 0001](../decisions/0001-binding-free-static-production.md) and the implementation topology in [Architecture](../ARCHITECTURE.md).

```text
reviewed Git commit
        ↓
locked CI build and release gate
        ↓
Cloudflare static HTML, CSS, JavaScript, fonts, and headers
        ↓
managed operator browser
        ↓
in-memory working copy
        ↓ explicit create/save
origin-scoped plaintext IndexedDB
        ↓ explicit export
operator-selected plaintext file destination
```

The untrusted-import path is deliberately separate:

```text
selected local file
        ↓
byte, MIME/extension, UTF-8, allocation, and grammar checks
        ↓
exact typed reconstruction and complete validation
        ↓
quarantine: Original input / New output
        ↓ explicit Apply and destination revalidation
new immutable workspace revision
```

The application has no workspace-content server endpoint. The production Content Security Policy sets `connect-src 'none'`; source code is designed without application telemetry, cookies, remote imports, remote fonts, URL fetching, or background uploads. Cloudflare and upstream network services can still process ordinary DNS/TLS/HTTP request metadata under the actual account configuration. The relevant decisions are [ADR 0005](../decisions/0005-no-application-telemetry.md), [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md), and [Threat model](../THREAT_MODEL.md).

## Data inventory and classification boundary

Potential workspace content includes catalog and archival description, names and identifiers, service/vendor context, license obligations, access and preservation status, incidents, operator notes, URLs, configuration, source evidence, revisions, and integrity metadata. Some of those values may be public; others may be internal, confidential, restricted, personally identifiable, culturally sensitive, donor-restricted, contract-protected, or security-relevant.

The application does not infer or enforce institutional classification. A `sensitivity` value is a record attribute, not access control. Named workspaces, Technical Reports, exports, and backups are plaintext. IndexedDB confidentiality depends on the browser profile, endpoint, and operating-system controls. SHA-256 values are integrity checks, not encryption or authentication.

The initial evaluation therefore uses synthetic content only. Conditions for later data use are in [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md) and [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md).

## Security and integrity assessment

### Hostile-import boundary

Imports are untrusted until explicit apply. Implemented controls include:

- foreign-file ceiling of 5 MiB and a 32 MiB ceiling available only to a strictly versioned, correctly named native catalog packet;
- fatal UTF-8 and control-boundary checks;
- bounded JSON traversal, exact DTO reconstruction, unknown/prototype-key rejection, and explicit cardinalities;
- an allocation-bounded pre-DOM XML scan, DTD/entity/processing-instruction rejection, exact official namespaces, and exact supported XML structures;
- rejection of oversized arrays rather than silent truncation;
- explicit RIS and MARC mnemonic line grammar with no ignored malformed lines;
- bounded BibTeX parsing with nested-brace support and rejection of directives, macros, and concatenation;
- public, credential-free HTTPS syntax validation without making a request;
- formula-leading cell neutralization for spreadsheet-oriented output; and
- nonmutating review followed by apply-time source, shape, findings, destination, hierarchy, and complete-set revalidation.

The governing decision is [ADR 0004](../decisions/0004-fail-closed-import-quarantine.md). Principal code is in [`app/lab-core.ts`](../../app/lab-core.ts), [`app/xml-safety.ts`](../../app/xml-safety.ts), [`app/archival-schemas.ts`](../../app/archival-schemas.ts), and [`app/public-url.ts`](../../app/public-url.ts). Automated cases are enumerated in [Testing](../TESTING.md); an execution claim must be tied to the exact candidate through [Validation report](../VALIDATION_REPORT.md).

### Local persistence and recovery

Explicitly named workspaces use IndexedDB manifests plus an active and prior immutable generation. A manifest binds the digest of each retained generation. Active bytes that disagree with the manifest stop open rather than silently falling back. A verified bound prior generation opens as an unsaved recovery copy. Invalid manifests and orphan generations remain quarantined; a selected candidate is reverified and reconstructed under a new UUID and name, leaving source bytes unchanged.

This is bounded operational recovery, not backup, preservation, authentication, or evidence custody. The design is in [ADR 0003](../decisions/0003-manifest-bound-two-generation-storage.md), implementation in [`app/lab-storage.ts`](../../app/lab-storage.ts), and fault-injection evidence in [`tests/lab-storage.test.mjs`](../../tests/lab-storage.test.mjs).

### Audit limits

Revision, state, payload, and linked-event digests can detect defined internal mismatches. They do not prove identity, authorization, authorship, intent, source custody, trusted time, completeness after a valid tail truncation, or nonrepudiation. A person with write access can construct a new internally consistent chain. If signed or externally anchored evidence is required, it must be provided by an approved external records/signature process.

### Static-host and supply-chain boundary

Root [`wrangler.jsonc`](../../wrangler.jsonc) defines static assets with no `main` entry or application data binding and disables configured Worker observability. Source-controlled response policy is in [`security-headers.ts`](../../security-headers.ts) and [`public/_headers`](../../public/_headers). GitHub workflows install the lockfile, run the release gate, conduct dependency review and CodeQL analysis, and retain a build/SBOM artifact for a bounded period; see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml).

These repository controls do not establish the configuration of GitHub organization permissions, the Cloudflare account, the Hover registrar, managed endpoints, or live DNS and response behavior. Those are external acceptance items.

## Privacy assessment

The application's default architecture minimizes transmission: records remain in memory or operator-initiated local storage/files. That does not make the workspace anonymous or suitable for unrestricted data. Browser extensions, endpoint management, crash capture, swap, screenshots, local backups, synchronization folders, downloaded-file destinations, and platform HTTP metadata remain outside application enforcement.

The Public Notice is constructed from a new allowlisted projection of nonsynthetic open-incident service categories. It does not receive workspace name, raw incident evidence/notes, catalog/archive/service records, configuration, hashes, or staff-role values; open Sample data incidents block generation. This minimizes technical exposure but does not authorize publication. Each notice requires communications, privacy, accessibility, and service-owner review.

The Technical Report is a complete staff record and may contain the most sensitive value represented in the workspace. Its static, script-free form does not lower that classification.

## Accessibility and usability assessment

The interface and reports are designed toward WCAG 2.2 Level AA, but the repository makes no conformance claim. Implemented source contracts include native controls, labels, landmarks, skip navigation, current/pressed state, live status and alert regions, focus styles, draft-loss guards, bounded/paginated indexes, a searchable archival parent selector, complete Original/New record blocks with definitions, reduced-motion and forced-color rules, and bounded viewport scroll ownership.

Generated report HTML is static and inert, embeds Jost and CSS, uses semantic one-path diagrams without crossing lines, and exposes headings, tables, definitions, and Original/New blocks. The implementation and limitations are documented in [Accessibility](../ACCESSIBILITY.md) and exercised structurally by [`tests/interface-contracts.test.mjs`](../../tests/interface-contracts.test.mjs), [`tests/list-pagination.test.mjs`](../../tests/list-pagination.test.mjs), and [`tests/report-documents.test.mjs`](../../tests/report-documents.test.mjs).

Manual keyboard, zoom/reflow, contrast, reduced-motion, forced-colors, browser, and assistive-technology evidence remains required. Source inspection or a passing unit suite cannot support a conformance statement.

## Interoperability assessment

Catalog review accepts MARCXML, MARC mnemonic, OAI Dublin Core XML, MODS XML, strict native JSON, CSL-JSON, Schema.org JSON-LD, RIS, bounded BibTeX, CSV, and TSV. Catalog output includes the native packet, OAI Dublin Core XML, MODS XML, CSL-JSON, JSON-LD, RIS, BibTeX, CSV, TSV, and MARC mnemonic.

Archival exchange includes EAD 4.0, EAD3, EAD 2002, AtoM description CSV, an ArchivesSpace archival-object crosswalk CSV, DCTAP, and the lossless schema package. Service registers export exact JSON and long-form CSV. Exact formatting and preservation boundaries are described in [Data model](../DATA_MODEL.md), code, tests, and the Technical Report generated by [`app/report-documents.ts`](../../app/report-documents.ts).

Round-trip tests show behavior within the implemented profiles. They are not certification against external schemas or acceptance by every software version/local profile. Production approval requires representative fixtures opened in institution-supported systems, with product/version, import settings, expected values, actual values, losses, warnings, and disposition recorded.

## Evidence status

The repository distinguishes four classes:

- **Automated:** an executable assertion exists and has a separately recorded candidate result.
- **Implementation inspection:** source/configuration contains the control, but automated coverage is absent or partial.
- **Manual:** a human task, browser, visual, accessibility, or workflow review is required.
- **External:** evidence belongs to an institutional account, policy, vendor, live host, or approval system.

The detailed mapping is [Review evidence matrix](REVIEW_EVIDENCE_MATRIX.md). [Validation report](../VALIDATION_REPORT.md) records a fresh-build 139-test pass, dependency audit, and static artifact validation against a specified modified working tree, while explicitly leaving the strict Wrangler dry run, immutable release gate, and external acceptance pending. Changes after that evidence time invalidate affected results. A formal review packet must substitute an immutable commit and attach fresh release, live-host, accessibility, interoperability, recovery, and governance records.

## Principal residual risks

The governing [Risk register](../RISK_REGISTER.md) must be reviewed in full. Review attention should focus on:

1. plaintext exposure through IndexedDB, downloaded files, endpoint compromise, or unapproved synchronization;
2. semantically false but structurally valid metadata and operator error;
3. mismatch between local/vendor profiles despite successful internal round trips;
4. browser storage eviction, origin migration, and absence of remote recovery;
5. mistaken interpretation of hashes as identity or signed custody evidence;
6. incomplete keyboard/assistive-technology/browser evidence;
7. platform, repository, registrar, dependency, and build-chain compromise;
8. capacity limits mistaken for institutional retention policy;
9. category-level disclosure in a Public Notice without publication review; and
10. performance at maximum supported sizes on the institution's minimum device/browser baseline.

Risk acceptance must name an accountable authority, control owner, review/expiry date, and evidence location. The repository cannot accept institutional risk.

## Conditions before institutional production use

All of the following are release conditions, not optional recommendations:

1. Freeze an immutable commit/tag and complete `npm ci` plus `npm run release:check`; retain logs, exact environment, artifact digest, SBOM, dependency disposition, and Wrangler dry run.
2. Complete independent code/configuration review for import, storage, Public Notice, response policy, build, and recovery changes since the last evidence record.
3. Assign product, library workflow, platform, security, privacy, records, accessibility, communications, and support owners.
4. Approve named purposes, operators, data classifications, prohibited data, retention/hold/disposal rules, download destinations, and incident escalation.
5. Obtain all determinations required under the current official institutional process, including research/human-subjects review when applicable.
6. Select one canonical HTTPS origin; configure GitHub, Cloudflare, Hover/DNS, MFA, least privilege, branch protection, recovery, logging/analytics, retention, and incident contacts.
7. Verify live redirects, real 404 behavior, TLS, DNS/mail continuity, security/cache headers, and a browser request graph containing no workspace-data request.
8. Complete manual keyboard, screen-reader, zoom/reflow, contrast, reduced-motion, forced-colors, and error/status testing in the supported environment matrix.
9. Validate representative catalog, archive, spreadsheet, discovery, preservation, and office/report outputs in the institution-supported software/version/profile matrix.
10. Rehearse named-workspace backup, destination-origin open, explicit create/save/reopen, count/digest comparison, bound-prior recovery, quarantine reconstruction, and governed source disposition using synthetic data.
11. Establish a support model, security reporting route, maintenance cadence, service-level expectations, outage procedure, rollback target, and decommissioning owner.
12. Review every Public Notice before release and classify every Technical Report, backup, and export at the highest included data level.
13. Record accepted residual risks and stop conditions in the institution's authoritative change/risk system.

## Maintenance and exit

The project must remain operable without institutional lock-in to IN KEEPING. The lossless native catalog packet, lossless archive schema package, service JSON, complete plaintext workspace backup, source-controlled code, lockfile, SBOM, documentation, and format fixtures support controlled migration. Crosswalk exports remain secondary to the authoritative source and lossless package.

At decommissioning:

1. freeze the last supported version and canonical origin;
2. notify operators of the exact export, migration, retention, and deletion date;
3. inventory browser profiles/origins, approved downloads, reports, backups, and receiving-system copies;
4. verify required migrations with counts, identifiers, digests, and sampled semantic comparison;
5. preserve source, lockfile, SBOM, release evidence, format readers/fixtures, decisions, and records required by policy;
6. delete browser-local workspaces only under authorized disposal and document limitations of local deletion;
7. remove Cloudflare routes/builds, DNS, GitHub automation/secrets, and account access in an approved sequence without disrupting mail or unrelated services; and
8. publish a support/retirement notice that does not reveal workspace content.

[Operations](../OPERATIONS.md), [Deployment](../DEPLOYMENT.md), and [Release and maintenance](../RELEASE_AND_MAINTENANCE.md) govern the detailed procedures.

## Review record template

| Review function | Reviewer/office | Decision | Conditions or findings | Evidence/record ID | Date / review date |
| --- | --- | --- | --- | --- | --- |
| Library product/workflow |  |  |  |  |  |
| Information security |  |  |  |  |  |
| Privacy/data governance |  |  |  |  |  |
| Records management |  |  |  |  |  |
| Accessibility |  |  |  |  |  |
| Research/human-subjects determination, if applicable |  |  |  |  |  |
| Cloud/platform/DNS |  |  |  |  |  |
| Communications/public notice |  |  |  |  |  |
| Legal/procurement/vendor, if applicable |  |  |  |  |  |
| Final acceptance authority |  |  |  |  |  |

Blank fields are intentional. Repository authors must not pre-populate an institutional decision or reviewer identity.
