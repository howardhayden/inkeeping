# Review evidence matrix

## Purpose and use

This matrix translates repository evidence into questions an institutional reviewer can decide. It supplements the engineering [requirements traceability matrix](../TRACEABILITY_MATRIX.md); it does not replace an official institutional checklist or approval record.

Evidence classes are:

- **A — automated:** an executable assertion covers the stated behavior.
- **I — inspection:** the behavior is visible in source/configuration, but automation is incomplete or not the appropriate method.
- **M — manual:** browser, assistive-technology, visual, workflow, or document inspection is required.
- **E — external:** the evidence belongs to the live platform, receiving software, institutional policy/process, or account configuration.
- **G — governance:** an authorized institutional decision is required; software evidence cannot supply it.

Status terms are deliberately narrow:

- **Recorded pass; rerun required** means [Validation report](../VALIDATION_REPORT.md) records a pass against its identified modified working tree. It does not establish the state of a later candidate.
- **Implemented; manual evidence pending** means source provides the mechanism, but the release claim depends on unrecorded human evidence.
- **External evidence pending** means no repository artifact can close the item.
- **Decision required** means an accountable institution must accept, reject, or condition the use.

Every automated row must be rerun against the immutable proposed release with `npm run release:check`. A reviewer should reject a status copied from this matrix without the commit, UTC time, environment, log, and artifact identity.

## Governance and scope

| ID | Review question | Repository evidence | Class | Current repository status | Acceptance evidence / criterion | Accountable role |
| --- | --- | --- | --- | --- | --- | --- |
| GOV-01 | Is the requested decision limited to a synthetic-data evaluation rather than production authorization? | [Institutional review dossier](SUNY_ALBANY_REVIEW_DOSSIER.md), [Evaluation protocol](EVALUATION_PROTOCOL.md) | G | Decision required | Signed/recorded evaluation scope, dates, participants by role, test origin/device, prohibited data, and stop authority | Review authority + system owner |
| GOV-02 | Are intended purposes, operator groups, and authoritative systems named for each workflow? | [Product scope](../PRODUCT_SCOPE.md), [`SERVICE_AREAS`](../../app/service-register.ts) | G | Decision required | Approved purpose statement and system-of-record map; uses outside it are prohibited | Library product/data owners |
| GOV-03 | Are non-goals understood and preserved? | [Product scope](../PRODUCT_SCOPE.md), [Architecture](../ARCHITECTURE.md) | I/G | Implemented boundary; decision required | Reviewer confirms the tool will not be treated as an ILS, ERM, repository, identity service, proxy, evidence-signing service, or authority | System owner + workflow owners |
| GOV-04 | Has the institution determined which official review paths apply? | [Dossier document control](SUNY_ALBANY_REVIEW_DOSSIER.md#document-control), [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md) | G/E | External evidence pending | Current official UAlbany/SUNY determinations and record IDs for technology, security, privacy, records, accessibility, research/human-subjects, legal/procurement, and communications as applicable | Institutional review authority |
| GOV-05 | Are residual risks assigned rather than implicitly accepted by developers? | [Risk register](../RISK_REGISTER.md) | G | Decision required | Named owner, acceptance authority, controls, evidence, review/expiry date, and disposition for each applicable high/critical-impact risk | Risk owner + acceptance authority |

## Architecture, privacy, and data management

| ID | Review question | Repository evidence | Class | Current repository status | Acceptance evidence / criterion | Accountable role |
| --- | --- | --- | --- | --- | --- | --- |
| ARC-01 | Is public production a binding-free static origin with no application compute/database? | [`wrangler.jsonc`](../../wrangler.jsonc), [ADR 0001](../decisions/0001-binding-free-static-production.md), [`tests/production-contracts.test.mjs`](../../tests/production-contracts.test.mjs) | A/I/E | Recorded pass; rerun required; live check pending | Root production config has no `main` or binding; deployed request graph and Cloudflare project match reviewed artifact | Platform owner + engineering |
| ARC-02 | Is one exact HTTPS canonical origin used for all workbench traffic and IndexedDB? | [ADR 0002](../decisions/0002-single-canonical-origin.md), [`app/site-metadata.ts`](../../app/site-metadata.ts), deployment tests | A/E | Recorded pass; rerun required; live check pending | Exact origin in build metadata; alternate web hosts redirect and cannot host a second workbench; migration rehearsed | Platform owner |
| NET-01 | Does application code avoid telemetry, remote imports, background uploads, URL following, remote fonts, and workspace-content requests? | [ADR 0005](../decisions/0005-no-application-telemetry.md), [`security-headers.ts`](../../security-headers.ts), [`public/_headers`](../../public/_headers), source modules, production/rendered tests | A/I/M/E | Source/contract evidence recorded; browser capture pending | Fresh bundle review and Network-panel trace show only intended same-origin static assets; CSP includes `connect-src 'none'` | Security + privacy + platform |
| NET-02 | Are Cloudflare request metadata and account-level logs/analytics separately governed? | [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md), [`wrangler.jsonc`](../../wrangler.jsonc) | E/G | External evidence pending | Actual account settings, retention, access, incident contacts, terms/subprocessors, and privacy notice reviewed | Platform owner + privacy |
| DAT-01 | Are workspaces, IndexedDB, exports, Technical Reports, and backups understood to be plaintext? | [`app/workspace-backups.ts`](../../app/workspace-backups.ts), [`tests/workspace-backups.test.mjs`](../../tests/workspace-backups.test.mjs), [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md) | A/I/G | Backup marker recorded pass; institutional handling pending | Approved data classes, managed endpoint/profile, disk/device controls, approved download destinations, and operator training | Data owner + security/privacy |
| DAT-02 | Is content minimized by purpose and are secrets prohibited? | [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md), [`app/public-url.ts`](../../app/public-url.ts), URL tests | A/G | URL guard recorded pass; policy decision required | Field-level collection plan; no passwords, API keys, tokens, cookies, private keys, or unnecessary personal data | Workflow owner + privacy |
| DAT-03 | Are technical capacity limits separated from records retention? | [Data model](../DATA_MODEL.md), [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md), [Operations](../OPERATIONS.md) | I/G | Documented; decision required | Approved schedule for source files, workspaces, revisions, audit events, reports, exports, quarantine, and release evidence; hold precedence named | Records officer + data owner |
| DAT-04 | Does local deletion have an accurately bounded meaning? | [`app/lab-storage.ts`](../../app/lab-storage.ts), storage delete test, [Privacy and data governance](../PRIVACY_AND_DATA_GOVERNANCE.md) | A/I/G | Recorded pass for local store deletion; external copies remain | Disposal procedure inventories browser origins/profiles, downloads, backups, reports, receiving systems, and platform logs | Records/operations |
| DAT-05 | Is evaluation data synthetic and are evaluation artifacts minimized? | [Evaluation protocol](EVALUATION_PROTOCOL.md), [Data management and ethics](DATA_MANAGEMENT_AND_ETHICS.md), explicit-sample test in [`tests/archival-schemas.test.mjs`](../../tests/archival-schemas.test.mjs) | A/G | Explicit sample loading recorded pass; protocol approval pending | Fixture inventory shows synthetic content; no participant recording/identifiable result without required determination | Evaluation lead + privacy/research review |

## Hostile imports and semantic integrity

| ID | Review question | Repository evidence | Class | Current repository status | Acceptance evidence / criterion | Accountable role |
| --- | --- | --- | --- | --- | --- | --- |
| IMP-01 | Are untrusted files bounded before admission and retained in nonmutating quarantine? | [`reviewImport`](../../app/lab-core.ts), [ADR 0004](../decisions/0004-fail-closed-import-quarantine.md), catalog tests | A/I | Recorded pass; rerun required | Empty/size/MIME/UTF-8/control/shape/URL negative fixtures block with zero mutation | Engineering + security |
| IMP-02 | Does XML fail closed on active foreign namespaces, unsupported same-namespace structures, external declarations, and excessive pre-parse depth/allocation? | [`app/xml-safety.ts`](../../app/xml-safety.ts), XML parsers in [`app/lab-core.ts`](../../app/lab-core.ts), catalog/archive tests | A | Recorded pass; rerun required | Exact positive/one-over boundaries and foreign element/attribute fixtures pass on candidate | Engineering + security |
| IMP-03 | Are oversized arrays and record sets rejected rather than silently reduced? | Canonical validators in [`app/lab-core.ts`](../../app/lab-core.ts), archive/service validators, cross-format tests | A | Recorded pass; rerun required | Max and max+1 cases demonstrate full acceptance or full rejection; no slice/skip behavior | Engineering + metadata reviewer |
| IMP-04 | Do RIS and MARC mnemonic reject malformed/ignored lines and over-limit source evidence? | `sourceLines`, `parseRis`, `parseMarcText` in [`app/lab-core.ts`](../../app/lab-core.ts), tagged-line tests | A | Recorded pass; rerun required | Malformed line, separator, termination, leader/subfield, 1,024/overflow fixtures behave exactly as specified | Engineering + cataloging |
| IMP-05 | Does BibTeX use a bounded grammar with nested braces and reject directives, macros, concatenation, duplicates, and overflow? | `parseBibtexSource` in [`app/lab-core.ts`](../../app/lab-core.ts), BibTeX tests | A | Recorded pass; rerun required | Supported nested/quoted/numeric inputs round-trip; all executable/ambiguous/over-limit cases reject | Engineering + metadata reviewer |
| IMP-06 | Is apply a second trust boundary rather than acceptance of a stale/forged review object? | Apply functions in [`app/lab-core.ts`](../../app/lab-core.ts) and [`app/archival-schemas.ts`](../../app/archival-schemas.ts), provenance/conflict tests | A | Recorded pass; rerun required | Apply rechecks source binding, exact shapes, findings, destination conflicts, hierarchy, and full-set invariants; prior revision survives rejection | Engineering + security |
| IMP-07 | Are original evidence and normalized output both available, complete, and accessibly defined? | [`app/continuity-lab.tsx`](../../app/continuity-lab.tsx), [`app/report-documents.ts`](../../app/report-documents.ts), interface/report tests | A/I/M | Structural tests recorded; manual AT/usability evidence pending | Reviewers can locate two labeled blocks, every displayed source element has definition, and output contains all canonical fields without a generated summary substitution | Metadata + accessibility reviewers |
| IMP-08 | Are crosswalk limits distinguished from truth, provenance, and software acceptance? | [Product scope](../PRODUCT_SCOPE.md), [Risk register R-02/R-18](../RISK_REGISTER.md), [Testing](../TESTING.md) | I/M/E | Documented; representative-system evidence pending | Local experts review fixtures against authoritative sources and receiving software; all known loss is recorded | Cataloging/archives/data services owners |

## State, recovery, reports, and public projection

| ID | Review question | Repository evidence | Class | Current repository status | Acceptance evidence / criterion | Accountable role |
| --- | --- | --- | --- | --- | --- | --- |
| STO-01 | Are workspaces created and saved explicitly, with stale-tab overwrite blocked? | [`app/continuity-lab.tsx`](../../app/continuity-lab.tsx), [`app/lab-storage.ts`](../../app/lab-storage.ts), interface/storage tests | A/M | Recorded pass for source/storage contracts; manual workflow pending | Blank startup remains memory-only; named create/save required; stale token blocks overwrite; operator can deliberately duplicate/reopen | Operations + engineering |
| STO-02 | Does the manifest bind active and prior generations, fail closed on active digest disagreement, and avoid unbound fallback? | [ADR 0003](../decisions/0003-manifest-bound-two-generation-storage.md), [`app/lab-storage.ts`](../../app/lab-storage.ts), storage fault-injection tests | A | Recorded pass; rerun required | Candidate passes substituted prior, active mismatch, legacy unbound fallback, and transaction-failure cases | Engineering + security |
| STO-03 | Is corrupt/orphan recovery explicit, verified, newly identified, and non-destructive? | Inspection/reconstruction functions in [`app/lab-storage.ts`](../../app/lab-storage.ts), storage/interface tests | A/M | Recorded pass for logic/source; manual workflow pending | Selected candidate is reverified; reconstruction gets new UUID/name; source bytes remain; deletion is separately governed | Operations + records + engineering |
| STO-04 | Are workspace backups exact, bounded, complete, and plainly marked as unencrypted plaintext? | [`app/workspace-backups.ts`](../../app/workspace-backups.ts), backup tests, interface action-name tests | A/M | Recorded pass; manual browser/file handling pending | Current v2 marker required; altered state/unknown field/version/MIME/size/UTF-8 reject; actual downloaded filename/content reviewed | Operations + privacy |
| AUD-01 | Are revision/audit digests verified without claiming identity, trusted time, custody, or nonrepudiation? | Audit construction in [`app/lab-core.ts`](../../app/lab-core.ts), [Architecture](../ARCHITECTURE.md), [Threat model](../THREAT_MODEL.md), report tests | A/I/G | Integrity behavior recorded; interpretation condition required | Reviewer acknowledges recomputation/truncation/identity limits; external signing/anchoring used if required | Security + records |
| RPT-01 | Is the Technical Report a bounded, inert, complete staff record with Original/New blocks and non-crossing semantic diagrams? | [`app/report-documents.ts`](../../app/report-documents.ts), [`tests/report-documents.test.mjs`](../../tests/report-documents.test.mjs) | A/M/G | Structural tests recorded; content/accessibility handling pending | Candidate report contains no active/remote content; tables/flows/records are usable; file classified at highest included level | Workflow + accessibility + records |
| RPT-02 | Is Public Notice data built from an allowlist rather than redaction of a private object, and are synthetic open incidents blocked? | `makePublicNoticeHtml` in [`app/report-documents.ts`](../../app/report-documents.ts), Public Notice tests | A/G | Recorded pass; publication decision required each time | Tests show internal canary values absent; communications/privacy/accessibility/service owner approves actual category-level notice | Communications + privacy + service owner |

## Accessibility, usability, and performance

| ID | Review question | Repository evidence | Class | Current repository status | Acceptance evidence / criterion | Accountable role |
| --- | --- | --- | --- | --- | --- | --- |
| A11Y-01 | Do core views use labeled native controls, landmarks, visible focus, live errors/status, and named actions? | [`app/continuity-lab.tsx`](../../app/continuity-lab.tsx), [`app/globals.css`](../../app/globals.css), interface contracts | A/I/M | Source contracts recorded; behavior pending | Keyboard and accessibility-tree inspection across the supported matrix finds complete names, logical order, no traps, and perceivable status/errors | Accessibility owner + QA |
| A11Y-02 | Are draft-loss, selection/page, incident-note, and asynchronous import states understandable and safe? | UI state logic in [`app/continuity-lab.tsx`](../../app/continuity-lab.tsx), interface contracts | A/M | Source contracts recorded; task testing pending | Navigation/selection/workspace actions guard drafts; notes do not cross incidents or clear on failed save; repeated file path can be reviewed; statuses announce | Accessibility owner + workflow QA |
| A11Y-03 | Does the interface remain operable within the viewport at reflow/zoom and with bounded large indexes? | [`app/globals.css`](../../app/globals.css), [`app/list-pagination.ts`](../../app/list-pagination.ts), pagination/interface tests | A/M | Pagination/CSS contracts recorded; visual evidence pending | 320 CSS px and 400% zoom tasks remain reachable; correct scroll owner; selected row/page alignment; no clipped required control | Accessibility owner + QA |
| A11Y-04 | Has an assistive-technology/browser matrix been completed without overstating conformance? | [Accessibility manual protocol](../ACCESSIBILITY.md#manual-acceptance-protocol) | M/G | Pending | Named versions, tasks, results, defects, retests, and exceptions reviewed; any conformance statement separately supported | Accessibility authority |
| PERF-01 | Is behavior acceptable on the minimum supported institutional device/browser at representative maximums? | [Performance and reliability](../PERFORMANCE_AND_RELIABILITY.md), size/page caps, exact-boundary tests | A/M | Bounds recorded; performance baseline pending | Predefined import, paging, save/open, backup, report, and recovery budgets met without browser failure or silent loss | QA + operations |

## Interoperability, deployment, and stewardship

| ID | Review question | Repository evidence | Class | Current repository status | Acceptance evidence / criterion | Accountable role |
| --- | --- | --- | --- | --- | --- | --- |
| INT-01 | Do internal round trips preserve the implemented catalog type/field profile? | [`app/record-formats.ts`](../../app/record-formats.ts), catalog tests | A | Recorded pass; rerun required | All 20 normalized types, canonical maxima, supported descriptive fields, escapes, and versioned tabular rules pass on candidate | Metadata engineering |
| INT-02 | Do custom archival schemas, all ten record types and sixteen field kinds, hierarchy, and lossless packages validate? | [`app/archival-schemas.ts`](../../app/archival-schemas.ts), [`tests/archival-schemas.test.mjs`](../../tests/archival-schemas.test.mjs) | A | Recorded pass; rerun required | Exact schema-package and hierarchy boundaries pass; unsupported structures reject | Archives/special collections + engineering |
| INT-03 | Do service records preserve exact typed values without formula execution? | [`app/service-register.ts`](../../app/service-register.ts), [`tests/service-register.test.mjs`](../../tests/service-register.test.mjs) | A | Recorded pass; rerun required | Every area/record/field type validates; JSON/CSV round trip; hostile URL/date/control/number/formula cases reject or neutralize | Service owners + data services |
| INT-04 | Are outputs accepted by institution-supported receiving products and local profiles? | [Testing external validation](../TESTING.md#required-manual-and-external-validation), [Evaluation protocol](EVALUATION_PROTOCOL.md) | E/M | External evidence pending | Product/version/profile matrix records import settings, warnings, complete field comparison, expected losses, and disposition | Cataloging/archives/discovery/data owners |
| REL-01 | Does the immutable candidate pass the complete release gate? | [`package.json`](../../package.json), [Testing](../TESTING.md), [Validation report](../VALIDATION_REPORT.md) | A | Full candidate result pending | `npm ci` and `npm run release:check` succeed on exact commit; logs, artifact digest, SBOM, audit, and dry run retained | Release owner |
| REL-02 | Are CI, dependency review, CodeQL, branch rules, and account permissions effective? | [CI workflow](../../.github/workflows/ci.yml), [CodeQL workflow](../../.github/workflows/codeql.yml), [Dependabot](../../.github/dependabot.yml) | A/I/E | Repository configuration present; organization evidence pending | Protected branch and required checks observed on release PR; least privilege/MFA/recovery/secret scanning reviewed; findings dispositioned | Repository owner + security |
| DEP-01 | Does live Cloudflare/Hover delivery match the reviewed static artifact without DNS/mail regression? | [Deployment](../DEPLOYMENT.md), response policy, release scripts | M/E | External evidence pending | Exact deployment/commit IDs, headers, request graph, redirect/404, certificate, DNS/mail, and rollback result recorded | Platform/DNS owner |
| OPS-01 | Can qualified staff recover, roll back, support, and report vulnerabilities without source-author presence? | [Operations](../OPERATIONS.md), [Release and maintenance](../RELEASE_AND_MAINTENANCE.md), repository [Security policy](../../SECURITY.md), [Support](../../SUPPORT.md) | M/G/E | Procedures present; rehearsal/ownership pending | Named on-call/support and security route; synthetic recovery/rollback drill succeeds; escalation and service objectives accepted | Operations + security |
| EXIT-01 | Can the service be retired without stranding authoritative data or leaving unknown local copies? | Dossier maintenance/exit section, [Operations](../OPERATIONS.md), native packages/backups | M/G/E | Plan documented; institutional plan pending | Approved inventory, migration validation, records disposition, access removal, DNS/host retirement, final evidence retention, and operator notice | System owner + records + platform |

## Candidate evidence cover sheet

Complete this table for the exact candidate presented to reviewers.

| Evidence | Required value |
| --- | --- |
| Full Git commit and tag |  |
| Pull request and independent approvals |  |
| `npm ci` log / UTC / environment |  |
| `npm run release:check` log and result |  |
| Unit/contract totals, failures, retries |  |
| Artifact filename and SHA-256 |  |
| CycloneDX SBOM filename and SHA-256 |  |
| Dependency-review, audit, and CodeQL disposition |  |
| Wrangler dry-run record |  |
| Cloudflare deployment/version ID |  |
| Canonical HTTPS origin |  |
| Live status/header/network capture |  |
| Keyboard/AT/zoom/contrast evidence set |  |
| Receiving-software interoperability matrix |  |
| Recovery and origin-migration rehearsal |  |
| Data classification/retention approvals |  |
| Research/human-subjects determination, if applicable |  |
| Accepted risk IDs, authority, and review dates |  |
| Production decision and conditions |  |

An empty value is an open evidence item, not an implied pass.
