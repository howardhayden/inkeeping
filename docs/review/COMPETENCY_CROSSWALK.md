# Professional competency crosswalk

## Purpose

This crosswalk identifies professional competencies that can be evaluated directly from the IN KEEPING repository and a controlled walkthrough. It is suitable as a portfolio index for Systems Librarian and Web Services Librarian applications and for adjacent library technology, metadata, collections, preservation, archives, data, and rare-materials roles.

It does not claim employment experience, institutional authority, certification, standards conformance, or successful performance in a particular organization. A repository artifact demonstrates design and implementation evidence only to the extent a reviewer inspects the code, tests the candidate, and discusses the stated limitations. Candidate-specific test results belong in [Validation report](../VALIDATION_REPORT.md) and [Review evidence matrix](REVIEW_EVIDENCE_MATRIX.md).

## How to evaluate the portfolio evidence

A reviewer can ask the applicant to:

1. identify the operational problem and defend the non-goals in [Product scope](../PRODUCT_SCOPE.md);
2. trace one untrusted record through parser bounds, quarantine, Original/New comparison, apply-time revalidation, revision, save, report, and export;
3. reproduce one hostile-import test and one storage fault-injection test;
4. explain a lossy crosswalk separately from a lossless native package;
5. show how the static Cloudflare/GitHub topology minimizes data flow while preserving platform-account responsibilities;
6. navigate a keyboard/accessibility test and state why source contracts do not equal conformance;
7. explain why SHA-256 supports mismatch detection but not identity, custody, or nonrepudiation;
8. map one service-area record to its authoritative external system and handoff; and
9. identify what must be institutionally approved before non-synthetic use.

The strongest evidence is the ability to connect a requirement, implementation, negative/boundary test, residual risk, operating procedure, and honest non-claim.

## Systems Librarian and Web Services Librarian core

| Competency | Repository evidence | Demonstrable outcome | Boundary a reviewer should probe |
| --- | --- | --- | --- |
| Service architecture | [Architecture](../ARCHITECTURE.md), [ADR 0001](../decisions/0001-binding-free-static-production.md), [`wrangler.jsonc`](../../wrangler.jsonc) | Explain and verify a React/Vite browser application delivered as binding-free Cloudflare static assets | Static delivery still has Cloudflare/DNS metadata, availability, account, and supply-chain dependencies |
| Systems analysis and scope control | [Product scope](../PRODUCT_SCOPE.md), [Data model](../DATA_MODEL.md), architecture decisions | Translate continuity needs into explicit supported tasks, invariants, capacities, and non-goals | A well-modeled workbench is not an ILS, ERM, repository, proxy, identity provider, or system of record |
| Type-safe application engineering | TypeScript modules under [`app/`](../../app), three [`tsconfig`](../../tsconfig.json) surfaces | Trace exact domain types, validators, transformations, UI state, static adapter, and tooling checks | Compile-time types do not validate hostile runtime bytes; exact runtime reconstruction is still required |
| Browser-local persistence | [`app/lab-storage.ts`](../../app/lab-storage.ts), [`app/continuity-anchor.ts`](../../app/continuity-anchor.ts), [ADR 0003](../decisions/0003-manifest-bound-two-generation-storage.md), [ADR 0006](../decisions/0006-continuity-anchors-and-evidence-boundaries.md), storage tests | Explain atomic manifest/generation/continuity-anchor transactions, optimistic tokens, digest binding, explicit baseline acceptance, exact-state receipts, bounded inspection, and non-destructive reconstruction | IndexedDB and its local anchor are plaintext, origin-scoped, evictable, and rewritable together; only an independently retained receipt can expose coherent replacement of every local store |
| Data integrity design | Revision/audit code in [`app/lab-core.ts`](../../app/lab-core.ts), [`app/continuity-anchor.ts`](../../app/continuity-anchor.ts), [`app/workspace-backups.ts`](../../app/workspace-backups.ts), [Threat model](../THREAT_MODEL.md) | Distinguish revision, state, event, payload, file, and continuity-checkpoint digests; verify exact successor and mismatch behavior | Hashes and unsigned receipts do not authenticate operators, establish trusted time, prove original truth, or provide custody/nonrepudiation |
| Defensive import engineering | [`app/xml-safety.ts`](../../app/xml-safety.ts), [`app/json-safety.ts`](../../app/json-safety.ts), import/disposition paths in [`app/lab-core.ts`](../../app/lab-core.ts), [ADR 0004](../decisions/0004-fail-closed-import-quarantine.md), [ADR 0006](../decisions/0006-continuity-anchors-and-evidence-boundaries.md) | Demonstrate fail-closed XML/JSON/RIS/MARC/BibTeX/tabular parsing, raw JSON member/scalar checks, exact bounds, identity cardinality, explicit evidence disposition, and no silent reduction | Structural acceptance and `admit-unverified` are not semantic accuracy, source authority, authenticity, or safety of a manually opened URL; admitted imports remain diagnostic-only |
| Interoperability and metadata transformation | [`app/record-formats.ts`](../../app/record-formats.ts), [`app/archival-schemas.ts`](../../app/archival-schemas.ts), catalog/archive tests | Compare normalized records and supported exchange profiles; preserve a lossless package alongside crosswalk outputs | Internal round trip is not vendor certification or proof against local product profiles |
| Discovery/access configuration | Configuration and findings in [`app/lab-core.ts`](../../app/lab-core.ts), discovery definitions in [`app/service-register.ts`](../../app/service-register.ts) | Model resolver/proxy, discovery profile, suppression, mapping, index, route, and known-item verification context | The application validates URL syntax but does not resolve, proxy, index, query, or authenticate |
| Incident, change, and continuity practice | Incident/revision/document functions in [`app/lab-core.ts`](../../app/lab-core.ts), [Operations](../OPERATIONS.md) | Demonstrate incident state/notes, reversible configuration changes, rollback context, escalation/postmortem/runbook outputs | UI audit entries are not the authoritative service desk or authenticated change record |
| Accessible interaction engineering | [`app/continuity-lab.tsx`](../../app/continuity-lab.tsx), [`app/globals.css`](../../app/globals.css), [Accessibility](../ACCESSIBILITY.md), interface tests | Show native semantics, labels, live status/error, draft guards, pagination, focus, reflow, and complete evidence blocks | Manual keyboard/browser/AT/contrast evidence is pending until performed; no conformance claim |
| Privacy by architecture | [ADR 0005](../decisions/0005-no-application-telemetry.md), [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md), response policy | Explain why no app API/telemetry/remote resource path and `connect-src 'none'` reduce disclosure | Endpoint/browser/download risk and Cloudflare account-level metadata remain; local does not mean anonymous or encrypted |
| Secure static hosting | [`security-headers.ts`](../../security-headers.ts), [`public/_headers`](../../public/_headers), [`tests/production-contracts.test.mjs`](../../tests/production-contracts.test.mjs) | Inspect CSP, isolation/cache headers, real-404 contract, canonical-origin validation, and absence of bindings | Live headers, redirects, DNS, TLS, mail, and account settings require deployment evidence |
| CI/CD and release assurance | [`package.json`](../../package.json), [CI workflow](../../.github/workflows/ci.yml), [CodeQL](../../.github/workflows/codeql.yml), [Release and maintenance](../RELEASE_AND_MAINTENANCE.md) | Run locked install, lint/typecheck/build/tests/audit/artifact validation/Wrangler dry run; retain SBOM and exact artifact | A green pipeline is not live acceptance; branch/account controls and manual evidence remain external |
| Reliability and recovery | [Performance and reliability](../PERFORMANCE_AND_RELIABILITY.md), storage/report/import bounds, [Evaluation protocol](EVALUATION_PROTOCOL.md) | Test exact capacity edges, pagination, failure preservation, origin migration, recovery, rollback, and exit | Capacity is not performance on every device or a retention schedule; maximum-device baselines are manual |
| Documentation and governance | [`docs/`](../), decisions, traceability, validation, risk, review dossier | Connect code behavior to architecture decisions, risks, evidence classes, operating controls, and review conditions | Documentation cannot confer approval or compensate for a mismatch between source, artifact, and live platform |
| Product naming and interface restraint | [`README.md`](../../README.md), [Product scope](../PRODUCT_SCOPE.md), UI/CSS | Explain a descriptive non-acronym name, blank initial state, explicit Sample data, task-focused copy, and minimal visual hierarchy | Design coherence does not replace usability/accessibility evidence or institutional branding review |

## Cross-functional library workflows

### Collections

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Collection policy modeling | `collection-policy` definition in [`app/service-register.ts`](../../app/service-register.ts) | Represent scope, audiences, selection roles, review cycle, and exclusions with typed definitions | No collection-development approval or policy authority |
| Fund context and stewardship | `collection-fund` definition and service validation/export tests | Relate fiscal-year/fund identifiers, allocation, commitment, currency, and stewardship note for reconciliation | No ledger, encumbrance, invoice, procurement, or finance control |
| Evidence-based review | Original/New comparison and revision model | Preserve source evidence while documenting a reversible local decision | Normalized metadata and local notes remain secondary to authoritative sources |

### Electronic Resources

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Entitlement lifecycle | `resource-entitlement` definition | Model provider/platform, coverage, access model, authentication, renewal, perpetual access, and COUNTER availability | No entitlement activation, COUNTER retrieval, authentication, or access verification |
| License obligation handoff | `license-obligation` definition | Surface authorized-user, accessibility, ILL, TDM, expiration, and post-cancellation context | No contract repository or legal interpretation; sensitive terms require governed handling |
| Access incident coordination | Incidents, vendor escalation, configuration and route records in [`app/lab-core.ts`](../../app/lab-core.ts) | Connect service state, evidence, owner role, next action, and escalation context | No notification, ticket synchronization, or vendor API |

### Discovery

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Metadata mapping and normalization | Catalog parsers/serializers and source evidence in [`app/lab-core.ts`](../../app/lab-core.ts) / [`app/record-formats.ts`](../../app/record-formats.ts) | Compare mapping results across MARC, MODS, Dublin Core, CSL, JSON-LD, RIS, BibTeX, CSV/TSV | No external schema certification or guarantee of discovery behavior |
| Index and suppression governance | `discovery-profile` definition | Record source, mapping version, facets, suppression rule, and last reindex context | Does not build or publish an index |
| Link-resolution review | `link-routing` and public-URL policy | Record resolver target, knowledge base, proxy rule ID, known item, expected route, and verification time | Syntax check does not make a request or prove access |

### Preservation / Conservation

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Condition assessment | `condition-assessment` definition | Model object ID, material, rating, hazards, housing, assessment, and next review | No authority to assess, handle, value, restrict, or treat an object |
| Preservation event context | `preservation-action` definition and checksum/media validators | Record action type, role, note, date, before/after fixity references, and storage context | Checksum entry is not repository custody, successful fixity policy, or authenticity proof |
| Reversible technical change | Revisions, rollback, audit/state digests | Explain before/after state and bounded recovery | Application rollback does not roll back receiving systems or physical treatment |

### Technical Services

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Acquisitions handoff | `acquisition-order` definition | Record order/vendor/fund/date/status/invoice-reference context | No procurement, accounting, payment, or ILS order transaction |
| Batch metadata operations | `metadata-job` definition, cross-format tests | Name source/target, mapping version, authorities, count, last run, and rollback reference | Does not execute a batch, call an authority service, or prove a receiving update |
| Quality-control design | Findings, quarantine, exact validators, boundary/negative tests | Treat malformed and over-limit input as blocking evidence rather than silently cleaning it | Professional semantic review and source-system reconciliation remain required |

### Special Collections and Archives

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Accession and processing context | `accession` and `processing-plan` service definitions | Model custody basis, agreement status, restrictions, extent, priority, arrangement, standard, effort, and born-digital context | No deed, rights, ownership, accession authority, or official processing record |
| Custom schema engineering | Ten record types, sixteen field kinds, profiles, mappings, validators in [`app/archival-schemas.ts`](../../app/archival-schemas.ts) | Define versioned required/repeatable typed fields, vocabularies, definitions, and mappings | Schema flexibility does not establish compliance with DACS/EAD/RiC or local governance |
| Hierarchical description | Archive set validation and hierarchy tests | Enforce parent existence, same-schema relationships, acyclicity, and a 32-level component boundary | Valid hierarchy does not establish archival arrangement, provenance, or publication authority |
| Archival interchange | EAD 4.0/EAD3/EAD 2002, AtoM CSV, ArchivesSpace crosswalk, DCTAP, lossless package | Explain lossless/native retention versus explicit receiving-system crosswalks | Representative vendor/local-profile testing and expert semantic acceptance remain external |

### Data Services

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Dataset stewardship | `dataset-custody` definition | Model persistent ID, repository, steward, media type, checksum, access/embargo, and retention rule | No repository deposit, transfer, rights decision, or preservation guarantee |
| Data management planning | `data-management-plan` definition | Record project/funder, storage/backup expectations, formats, retention, and rights basis | No funder/IRB/legal approval or verification of storage/backup controls |
| Safe tabular/data exchange | Versioned CSV/TSV and service long-form CSV code/tests | Preserve lists/newlines/formula-leading text through defined encoding and neutralization | Recipient spreadsheet settings and semantic interpretation require external testing |
| Data governance | [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md), [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md) | Separate technical limits from classification, retention, rights, access, and disposition authority | Repository documentation is not an approved DMP, schedule, or privacy determination |

### Rare Books and Manuscripts

| Competency | Implemented evidence | Professional use demonstrated | Explicit limit |
| --- | --- | --- | --- |
| Copy-specific description | `copy-provenance` definition | Separate shelfmark, imprint, copy note, provenance events, binding, marks, standard, and review date from general bibliographic description | No ownership, authenticity, appraisal, custody, or title authority |
| Treatment documentation context | `conservation-treatment` definition | Model object, treatment proposal/status, materials/methods, responsible role, dates, and documentation reference | No treatment authorization, professional conservation judgment, or official treatment record |
| Sensitive evidence care | [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md) | Identify privacy, donor, cultural, location/security, provenance, and disputed-custody concerns | Software cannot supply community consultation, rights clearance, or ethical authority |

## Metadata and data-format competency evidence

| Domain | Evidence | What can be discussed or demonstrated |
| --- | --- | --- |
| Canonical model | `CatalogRecord`, `DescriptiveMetadata`, provenance and finding types in [`app/lab-core.ts`](../../app/lab-core.ts) | Field cardinality, identifier stability, access/display separation, source-vs-normalized evidence, provenance limits |
| XML | [`app/xml-safety.ts`](../../app/xml-safety.ts), MARCXML/DC/MODS/EAD parsers and tests | Namespace processing, exact supported structures, DTD/entity rejection, allocation/depth bounds, escaping, profile constraints |
| MARC | MARCXML and mnemonic code/tests | Leader/tag/indicator/subfield grammar, singular `001`/`003`, repeatable identifier-field conservation with per-field subfield cardinality, source evidence, conservative mapping, escaping, and malformed-line refusal |
| Dublin Core / MODS | Parsers/serializers and exact-structure tests | Namespace/profile paths, one private Dublin Core identity carrier, agreeing MODS record identities, retention of legitimate repeatable evidence, date/right/license mappings, and unsupported extension handling |
| JSON ecosystems | Native packet, CSL-JSON, Schema.org JSON-LD, backup/schema/service JSON | Exact envelope/versioning and dispatch, raw duplicate-member/Unicode-scalar refusal, exact Schema.org context and graph rules, canonical CSL identity keys/types, DTO reconstruction, and bounded structures |
| Tagged/bibliographic text | RIS and bounded BibTeX parser/serializer tests | Singular RIS identity, repeatable-evidence retention, CR/LF/CRLF comment termination, nested braces, safe grammar, macro/concatenation refusal, injection, and escaping |
| Tabular | Versioned catalog CSV/TSV, archival crosswalk CSV, service long-form CSV | Header/row validation, typed encoding, repeatable values, formula neutralization, newline/delimiter handling, crosswalk loss |
| Archival standards | EAD variants, DCTAP, AtoM, ArchivesSpace cues, RiC mapping fields | Version/profile differences, description hierarchy, singular repository identity carriers with valid EAD3 multipart names, data-type/cardinality documentation, and vendor boundary |
| Web/data identifiers | [`app/public-url.ts`](../../app/public-url.ts), identifier/checksum/media/language/date validators | Syntax and boundary validation without conflating it with resolution, authority, authenticity, or availability |

## Security, privacy, and care competency evidence

| Practice | Concrete evidence | Mature interpretation expected |
| --- | --- | --- |
| Threat modeling | [Threat model](../THREAT_MODEL.md), [Risk register](../RISK_REGISTER.md) | Identify assets, actors, trust boundaries, failure modes, controls, residual risk, external owner, and stop condition |
| Least data flow | Binding-free production, `connect-src 'none'`, no app telemetry decision | Explain minimized transmission while acknowledging Cloudflare request metadata and local plaintext risk |
| Fail closed | Exact reconstruction and negative/boundary fixtures | Prefer whole-file refusal over “best effort” that silently discards evidence |
| Recovery care | Manifest-bound prior, continuity mismatch quarantine, new-UUID reconstruction, source preservation, and backups that exclude local anchors | Recover without concealing corruption, silently re-anchoring restored content, or destroying evidence; separate recovery from authorized disposal |
| Public/private separation | New allowlisted Public Notice projection and canary tests | Build a public object from permitted fields rather than redact a private object; retain human publication review |
| Supply-chain assurance | Lockfile, pinned GitHub actions, dependency review, CodeQL, audit, SBOM | Describe evidence limits: audit/SBOM do not prove absence of malicious packages or account compromise |
| Plain-language non-claims | Reports and docs on hash, storage, accessibility, interoperability, and approval limits | Avoid converting design goals or test presence into certification, provenance, privacy, or readiness claims |
| Responsible evaluation | [Evaluation protocol](EVALUATION_PROTOCOL.md), [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md) | Use synthetic data, minimize evaluator data, seek current institutional determinations, and stop on unapproved exposure |

## Portfolio evidence packet

For an application or interview, a concise evidence packet can include:

1. the [README](../../README.md) and [Product scope](../PRODUCT_SCOPE.md) for purpose and non-goals;
2. [Architecture](../ARCHITECTURE.md) plus the five [architecture decisions](../decisions/README.md);
3. one catalog hostile-import case from [`tests/lab-core.test.mjs`](../../tests/lab-core.test.mjs);
4. one recovery fault-injection case from [`tests/lab-storage.test.mjs`](../../tests/lab-storage.test.mjs);
5. one complete Original/New report artifact generated from synthetic data;
6. an archival schema/package and a receiving-system crosswalk generated from the same synthetic records;
7. a service-register export spanning the target role's workflow;
8. the [Review evidence matrix](REVIEW_EVIDENCE_MATRIX.md) showing open manual/external work;
9. the [Validation report](../VALIDATION_REPORT.md) with its candidate caveats; and
10. a short demonstration of `npm run release:check` on an immutable commit.

Do not include real workspaces, incidents, records, vendor terms, credentials, private vulnerability details, or unapproved screenshots in a portfolio. Synthetic evidence should be labeled as such. If a test, deployment, accessibility review, or vendor validation has not been completed, state that directly.

## Interview discussion prompts

These prompts help a reviewer distinguish implementation depth from feature-list familiarity:

- Why does an unused XML namespace declaration remain acceptable while an applied foreign namespace fails?
- Why is rejecting an over-limit array preferable to truncating it, even when rejection is inconvenient?
- Why are RIS/MARC line parsers and BibTeX grammar bounded separately from file size?
- What does apply-time revalidation protect against after a successful review?
- Why does a manifest bind both saved generations, and why must an active digest mismatch stop rather than fall back?
- Why is a recovery copy newly identified and unsaved, and why are quarantine source bytes retained?
- Why is a fixed Public Notice projection safer than redaction of the full workspace?
- Which output is lossless, which is a crosswalk, and what external evidence is needed before naming software compatibility?
- Why does `connect-src 'none'` not eliminate Cloudflare privacy review?
- What evidence is missing before a WCAG conformance or production-readiness claim?
- How would an origin change be migrated, verified, and rolled back without assuming DNS moves IndexedDB?
- Which institutional decisions cannot be delegated to code?

An adequate answer should cite the relevant implementation/evidence, state the residual risk, and name the external owner—not merely repeat interface copy.
