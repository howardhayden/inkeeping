# Data management and ethics plan

## Status and authority

This document is a proposed control framework for institutional review. It does not assign a data classification, legal basis, records schedule, research determination, donor-rights interpretation, license interpretation, publication authority, accessibility approval, or ethical clearance. Those decisions must be made through the current official institutional process by the accountable office or data owner.

The initial evaluation is synthetic-data-only. Production, personal, confidential, restricted, regulated, export-controlled, vendor-confidential, donor-restricted, culturally sensitive, unpublished, or security-relevant content is prohibited until specifically approved.

## Data-management objectives

IN KEEPING should be governed so that:

1. each use has a named library purpose and authoritative source;
2. only the minimum necessary fields enter the workspace;
3. untrusted files remain quarantined until professional review and an explicit `admit-unverified`, `reject`, or `withdraw` disposition, and applied/restored content remains unverified afterward;
4. browser-local/plaintext storage is treated as a material confidentiality boundary;
5. original evidence, normalized output, transformations, and known loss remain inspectable;
6. public communication receives only an allowlisted projection and still requires human approval;
7. technical caps are never substituted for institutional retention decisions;
8. correction, export, recovery, deletion, and decommissioning have accountable owners; and
9. review/evaluation does not become unapproved research or employee monitoring.

## Roles

| Role | Required decision or action |
| --- | --- |
| Institutional system owner | Authorize the service purpose, budget, support, release, and decommissioning path |
| Library workflow/data owner | Identify authoritative systems, minimum fields, semantics, access group, handoff, reconciliation method, and external evidence-corroboration record |
| Records officer | Assign record series/schedules, legal-hold precedence, disposition authority, and evidence retention |
| Privacy office/data protection function | Assess personal data, notices, lawful purpose/basis, rights requests, processors, transfers, and incident obligations |
| Information security | Approve endpoint/browser, platform accounts, import testing, incident handling, and accepted security risks |
| Accessibility authority | Approve evaluation method and any conformance statement; disposition barriers |
| Research/IRB or other designated office | Determine whether an evaluation/research activity requires review, approval, or another official process |
| Communications/service owner | Approve each Public Notice and its timing, accuracy, accessibility, and category-level disclosure |
| Operator | Minimize entries, review Original/New blocks, complete evidence dispositions without claiming authority, avoid secrets, save/export deliberately, protect outputs, and report anomalies |
| Recipient | Apply classification, access, retention, and disposal rules to plaintext exports/reports/backups |

The application does not authenticate or authorize these roles. A role label in a record, audit event, or evidence disposition is a claim and cannot establish identity or authority. The `atBrowser` value attached to an evidence disposition is explicitly `browser-clock-untrusted`, not institutional time.

## Data inventory

The authoritative field and capacity definitions are in [Data model](../DATA_MODEL.md). This management inventory explains why and where values may exist.

| Data category | Typical content | Purpose | Application locations | External locations after explicit action | Principal concern |
| --- | --- | --- | --- | --- | --- |
| Import source | MARC, MODS, DC, EAD, RIS, BibTeX, CSV/TSV, JSON, schema packages | Review and transformation | Selected file; browser memory during review; bounded reconstructed source evidence after apply | Original source remains wherever selected from | Malformed/hostile input; copyright/license; embedded personal/restricted description |
| Evidence dispositions | Bound source/review/scope digests; `admit-unverified`, `reject`, or `withdraw`; claimed origin/custody path; custody note; actor-role claim; rationale; policy/ticket reference; browser-clock time | Preserve the exact local decision made about structurally reviewed evidence | Memory, workspace, IndexedDB, backup, Technical Report | Approved evidence/change/records system when separately recorded | Claims can be false, identify staff or sensitive systems, expose ticket context, and be mistaken for authority |
| Catalog metadata | Titles, names, dates, identifiers, links, subjects, rights/license, holdings/access state | Metadata continuity and handoff | Memory, revisions, IndexedDB, backup, Technical Report | Catalog exports and receiving systems | Personal names, suppressed holdings, rights errors, semantically incorrect crosswalk |
| Archival schema/records | Description, accession, authority, agent, repository, digital object, rights, event, subject, location; custom definitions/mappings | Arrangement/description continuity and schema development | Memory, revisions, IndexedDB, backup, Technical Report | EAD/CSV/DCTAP/schema package; receiving systems | Donor restrictions, living persons, sensitive collections, location/security, publication status |
| Service records | Collections, ER, discovery, preservation, technical services, archives, data services, rare materials | Operational reconciliation and handoff | Memory, revisions, IndexedDB, backup, Technical Report | Service JSON/CSV | Contract, pricing/fund, system configuration, sensitive locations, responsibilities |
| Incidents | Service category, severity/state, evidence, notes, owner role, next action, optional catalog link | Operational continuity and response | Memory, IndexedDB, backup, documents, Technical Report | Selected documents; fixed Public Notice projection | Security details, people, vendor-confidential material, premature disclosure |
| Configuration | Resolver/proxy/pickup/member values | Reproducible local operating context | Memory, revisions, IndexedDB, backup, Technical Report | Selected operational documents | Internal routing/context; accidental secret entry despite URL guardrails |
| Integrity and continuity metadata | File/revision/state/event/payload/decision digests, IDs, save tokens, local continuity checkpoint and receipt | Detect defined mismatch and connect revisions/events/claims | Memory; workspace and IndexedDB stores; backup and Technical Report except that the separate continuity checkpoint is excluded from the workspace backup | Separately retained continuity receipt; selected reports | Misinterpretation as authenticity, identity, authority, trusted time, custody, or completeness proof |
| Workspace metadata | Name, created/updated times | Local identification and recovery | Memory, IndexedDB, backup, Technical Report | Backup/report filenames/content | Names can reveal project/collection/incident context |
| Generated staff files | Technical Report, backup, catalog/archive/service exports, operational Markdown | Handoff, recovery, review | Browser Blob until activation | Downloads, filesystems, synchronization/backup, recipients, receiving systems | Plaintext duplication, oversharing, retention sprawl |
| Public projection | Nonsynthetic open-incident service categories and general status/help content | Draft public service notice | Generated in memory | Download/open/publication destination chosen by operator | Category-level disclosure, accuracy, timing, accessibility |
| Evaluation evidence | Fixture IDs/digests, steps, pass/fail, environment, defects | Acceptance and reproducibility | Prefer approved external evidence repository | Issue/change/review system | Employee/participant data, recordings, security details, excessive retention |
| Platform metadata | IP address, time, hostname, user agent, TLS/cache/security events | Static delivery and platform security | Not in workspace | Cloudflare, DNS/network, GitHub build/deploy systems | Processor terms, logging/retention, administrative access, cross-border processing |

## Classification method

Before approving a workflow, the data owner must map every intended category to the institution's current classification scheme. The application must not create a substitute classification. At minimum record:

```text
Workflow and purpose:
Authoritative source/system:
Data owner:
Fields/categories admitted:
Fields/categories prohibited:
Institutional classification:
Personal/special-category data determination:
Contract/license/donor restriction:
Security or location sensitivity:
Cultural/community protocol:
Approved operators and recipients:
Endpoint/browser profile:
Approved local/download storage:
Retention/hold/disposal authority:
Public Notice permitted: yes/no and approval route:
```

A service record's `public`, `internal`, or `restricted` value is metadata for the workflow. It does not encrypt a field, hide it from another person using the browser profile, or enforce a recipient's access.

## Data minimization and prohibited content

Operators should use role or unit names instead of individuals unless identity is necessary and approved. Store a stable reference to an authoritative ticket, agreement, repository, or record rather than copying its full sensitive content when the external reference is sufficient.

Do not enter:

- passwords, passphrases, API keys, OAuth tokens, session cookies, private keys, recovery codes, proxy credentials, database strings, or vendor admin links containing secrets;
- full payment-card, bank, payroll, government identifier, health, disciplinary, immigration, or similarly high-risk personal data;
- patron circulation/search/use histories unless a separately approved use explicitly requires them;
- full license or donor-agreement text when an identifier and approved authoritative location suffice;
- exploit details, security architecture, precise vulnerable routes, or incident indicators beyond the minimum approved continuity need;
- unpublished collection locations, valuations, access codes, or physical-security details without explicit approval;
- culturally sensitive, Indigenous/community-restricted, sacred, funerary, or other content governed by community protocols without the required consultation and authority; or
- real records in Sample data or an evaluation fixture.

The public-HTTPS validator rejects credentials, private/reserved literal targets, local names, and secret-like query keys without performing a request; see [`app/public-url.ts`](../../app/public-url.ts). This is a syntactic guardrail, not a secret scanner, data-loss prevention system, or proof that a destination is safe.

## Ethical handling by workflow

### Catalog and discovery

Structural validity and `admit-unverified` are not descriptive truth. Names, subjects, classifications, suppression, holdings, availability, and access routes can stigmatize people or communities, expose restricted material, or deny access when wrong. A qualified reviewer must compare Original input, New output, local policy, and the authoritative source. Correction in IN KEEPING does not correct the ILS, repository, authority file, discovery index, or vendor knowledge base.

### Electronic resources and collections

License fields are operational notes, not legal advice or authoritative contract text. Pricing, fund, entitlement, cancellation, authorized-user, accessibility, ILL, and TDM details can be confidential or time-sensitive. The contract/ERM/finance record remains authoritative; owners must resolve conflicts there. No authentication credential belongs in a resource route or license URI.

### Archives, special collections, and manuscripts

Archival description can contain information about living people, donors, third parties, marginalized communities, medical/legal events, abuse, or restricted locations. Publication state is not consent or rights clearance. Schema flexibility must not be used to evade descriptive standards, donor restrictions, privacy review, Traditional Knowledge/community labels or protocols, or takedown/restriction processes. Hierarchical correctness does not establish ownership, provenance, custody, or ethical authority to describe/publish.

### Rare books and conservation

Copy provenance and marks may concern identifiable owners or contested custody. Condition/treatment records can carry valuation, location, hazard, material, or security information. The workbench does not authorize treatment, appraisal, ownership statements, handling, deaccession, or access. A conservator/curator and authoritative collection record remain controlling.

### Preservation and data services

A checksum field is a reference, not evidence that a complete fixity policy, storage replication, format validation, restore test, preservation event, or chain of custody occurred. A data management plan record does not establish consent, ownership, funder compliance, repository deposit approval, retention authority, or lawful sharing. Those facts require external evidence and owner approval.

### Incidents and public communication

Incident notes should contain the minimum operational evidence. Use an approved incident/ticket system for secrets, forensic details, identifiable reports, communications history, and authoritative response records. The Public Notice renderer receives only an allowlisted category projection, but a category can still reveal a sensitive outage, investigation, or dependency. Every actual notice requires accuracy, necessity, audience, timing, accessibility, and communications/privacy review.

## Import and transformation ethics

Files remain untrusted after review and Apply. The [fail-closed import decision](../decisions/0004-fail-closed-import-quarantine.md) and implementation in [`app/lab-core.ts`](../../app/lab-core.ts), [`app/xml-safety.ts`](../../app/xml-safety.ts), [`app/archival-schemas.ts`](../../app/archival-schemas.ts), and [`app/evidence-authority.ts`](../../app/evidence-authority.ts) reduce technical ambiguity and bind the exact decision to its source, structural review, parser profile, canonical payload, and entity scope. They do not establish consent, rights, authenticity, custody, authority, accuracy, representativeness, completeness, chronology, or freedom from harmful language.

Every successful catalog, archival, or workspace-backup review requires a complete no-default disposition. `admit-unverified` is the only decision that may apply an import or open a backup. `reject` and `withdraw` do not admit the candidate. None of these decisions is a verified or trusted status; claimed origin/custody, actor role, rationale, policy reference, and browser time remain unauthenticated assertions. A validly structured fabricated source and matching fabricated decision can remain internally consistent.

Imported or restored content is diagnostic-only for ordinary outward artifacts while it remains unverified. The institution must reconcile the exact bound source and entity scope in its authoritative process outside IN KEEPING. The application does not convert that external action into a self-issued trusted state. Withdrawal cannot rehabilitate content already retained in a revision: the affected content remains blocked until a governed revision removes or supersedes it, and the external record preserves the reason and disposition.

The two-block Original input / New output record is an ethical as well as technical control: it preserves reviewability and prevents a short system-generated assurance from replacing evidence. Operators must record known crosswalk loss and retain the authoritative source/lossless package. Automated normalization must not be represented as neutral judgment.

No imported URL is fetched. Reviewers must not manually open a source-provided URL merely because the syntax validator accepted it. Use institutionally approved link-review procedures.

## Storage, encryption, and transfer

### Browser memory and IndexedDB

The working copy begins in memory. Creating/saving a named workspace writes plaintext to origin-scoped IndexedDB. Confidentiality depends on managed browser profiles, operating-system accounts, endpoint encryption, patching, extension policy, screen/remote-support controls, backups, and physical security. Browser storage can be evicted or deleted and is not preservation storage.

### Files

Backups, reports, exports, and continuity receipts are plaintext. Workspace backup v2 includes the literal marker `plaintext-json-not-encrypted`; see [`app/workspace-backups.ts`](../../app/workspace-backups.ts). The marker is disclosure, not protection. Opening a reviewed backup also requires a new outer `admit-unverified` disposition bound to that backup file and reviewed workspace; it does not corroborate evidence dispositions nested inside the workspace. If approved data requires encryption at rest or in transfer, use an institutionally managed destination/container and key process outside the application. Do not invent an ad hoc password-encrypted archive or transmit passwords alongside files.

A workspace backup excludes the separately stored local continuity checkpoint. An unsigned continuity receipt is comparison metadata and cannot restore or authorize the workspace. A recovery-transition review can bind the exact reviewed envelope/raw/payload/audit and supplied continuity material, but remains `source-reviewed-not-activated`, inherits neither continuity nor authority, and requires a new destination lineage. It does not prove clean-device conditions, attachment recovery, or destination persistence. Perform and retain those operational observations separately.

### Origin migration

IndexedDB follows exact scheme/hostname/port. Moving between preview, apex, `www`, or another domain does not move data. Migration uses an explicitly downloaded plaintext backup that has passed internal review, an outer unverified Open disposition, and a deliberate create/save/reopen at the destination. Internal review is not authenticity or custody verification. The backup and any separately retained continuity receipt must travel only through an approved encrypted and access-controlled route. [ADR 0002](../decisions/0002-single-canonical-origin.md) governs this boundary.

### Recipient controls

Before download or transfer, record the file's classification, purpose, recipient role, approved location, retention, and required deletion. Technical Report and backup inherit the highest classification of any included value. Static/script-free HTML is safer to open but is not less sensitive. For ordinary outward files, the interface requires exact signed checkpoint correspondence under a separately obtained current policy digest, renders an immutable file from the reopened saved generation, and runs the final exact saved-state check plus synchronous browser activation request inside one readonly transaction. This does not prove browser/OS completion, post-activation currency, publication, custody, semantic, or recipient authority. Technical Reports, plaintext backups, unsigned receipts, witness requests, and recovery reviews remain bounded diagnostic/recovery/comparison artifacts with separate handling decisions.

## Retention and disposition

Application limits—20 revision bodies, 5,000 audit events, 500 incidents, active/prior saved generations, and other format caps—are engineering bounds, not record series or retention periods. Rotation can remove content needed under a schedule; retained content can outlive a legitimate purpose. The institution must decide both.

Complete this schedule before non-synthetic use:

| Record/artifact | Authoritative copy/location | Trigger | Retention | Hold precedence | Disposition method/authority | Evidence retained |
| --- | --- | --- | --- | --- | --- | --- |
| Selected import source |  |  |  |  |  |  |
| Evidence disposition and external corroboration record |  |  |  |  |  |  |
| Browser-local workspace |  |  |  |  |  |  |
| Quarantined manifest/generation |  |  |  |  |  |  |
| Workspace backup |  |  |  |  |  |  |
| Local continuity checkpoint / separately retained receipt |  |  |  |  |  |  |
| Catalog/archive/service export |  |  |  |  |  |  |
| Technical Report |  |  |  |  |  |  |
| Public Notice source/approved copy |  |  |  |  |  |  |
| Incident/change/postmortem document |  |  |  |  |  |  |
| Evaluation/release evidence and SBOM |  |  |  |  |  |  |
| Platform HTTP/security logs |  |  |  |  |  |  |

Local workspace deletion removes the selected manifest and generations under the current origin. It does not erase the in-memory working copy, source files, downloads, filesystem/cloud backups, screenshots, receiving systems, recipient copies, other origins/profiles, or platform metadata. Rights requests, legal holds, and authorized disposal must inventory all governed copies.

Corrupt/orphaned storage is retained in quarantine until an authorized disposition. Reconstruction copies a verified candidate into a new workspace and deliberately leaves source bytes unchanged. Do not delete source evidence merely because reconstruction succeeded.

## Accuracy, correction, and accountability

IN KEEPING uses immutable revisions for catalog, configuration, archive, and service state. A correction creates a new revision; it does not silently edit a retained revision or reconcile the authoritative source. Operators must identify who owns the source correction and confirm completion in that system.

An evidence disposition is also a local record, not proof of the claim it contains. `reject` and `withdraw` must remain visible under the applicable schedule. A withdrawal cannot be interpreted as validation of retained content or as permission to export it; removal or supersession requires a governed revision and reconciliation in the authoritative system.

Linked SHA-256 events and state/revision/payload digests detect defined internal inconsistencies. They do not authenticate the operator, prove lawful authority, provide a trusted timestamp, demonstrate complete history after valid truncation, or prevent a writer from recomputing a consistent chain. Never use the chain as the sole forensic, evidentiary, or nonrepudiation record. Use an approved external ticket, records, signature, or timestamping system when those qualities are required.

## Human-subjects and evaluation data

The synthetic functional protocol can often be executed as software quality assurance, but this document makes no determination. Questions requiring official review include whether the activity:

- systematically studies people or their task performance;
- collects identifiable opinions, accessibility/disability information, recordings, biometrics, screen content, employment performance, or demographics;
- recruits students, employees, patrons, donors, community members, or other participants;
- combines results for publication or generalizable conclusions;
- offers incentives or involves a power relationship;
- uses identifiable private records; or
- reuses evaluation data for a new purpose.

Use the current official UAlbany/SUNY process and obtain the required determination before recruitment or collection. If approved, use the approved consent/information process, accommodations, withdrawal mechanism, data-access plan, retention, de-identification limits, adverse-event route, and dissemination restrictions.

For ordinary internal defect testing, prefer role-coded evaluator IDs, pass/fail/blocked/not-run results, environment versions, fixture IDs, and issue references. Do not record names, audio/video, keystrokes, facial images, disability details, or individual performance unless the approved protocol specifically requires them. Managers must not repurpose accessibility/usability results for employee performance evaluation without separate authority and notice.

## Accessibility, inclusion, and community care

Accessibility is a release condition, not an optional feature or a proxy for one evaluator's experience. Follow [Accessibility](../ACCESSIBILITY.md) and record the required supported browser/assistive-technology matrix. Do not claim WCAG conformance from source contracts, automated tests, or a synthetic walkthrough alone.

Evaluation should include relevant library roles and workflows without asking one participant to represent a disability, community, culture, or professional specialty. Provide accessible materials, compatible environments, breaks, alternative response modes, and a way to report a barrier privately. Community or culturally sensitive descriptive decisions require the relevant consultation and policy; software field flexibility is not consultation.

## Third parties and processors

The public static origin involves Cloudflare and DNS/network infrastructure for ordinary request metadata. GitHub processes repository, pull request, Actions, CodeQL, dependency, artifact, and SBOM information. Hover manages domain registration/DNS delegation as configured. Browsers, operating systems, endpoint tools, approved file storage, receiving products, and collaboration/ticket systems can process data after operator action.

Before production, review actual:

- contracts/terms, privacy/security documentation, subprocessors, locations/transfers, retention, deletion, incident notification, and audit reports as applicable;
- account administrators, MFA, least privilege, recovery contacts, access logs, API tokens, and service integrations;
- Cloudflare analytics/log/security settings and GitHub Actions/artifact retention;
- registrar lock, recovery, DNSSEC decision, DNS change control, and mail/unrelated records; and
- receiving-system import, backup, logging, support-access, and disposal behavior.

No repository statement can attest to these account-level facts.

## Security/privacy incident response

If restricted content, unintended transmission, public-projection leakage, lost plaintext output, hostile import bypass, storage corruption, account compromise, or unauthorized access is suspected:

1. stop the affected workflow without destroying evidence;
2. avoid reloading an unsaved session until an authorized recovery decision is made;
3. preserve only the minimum evidence in an approved restricted location;
4. notify institutional security/privacy/records/service owners through official channels;
5. do not place sensitive details in a public issue, chat, workspace, or report;
6. record exact release/commit, origin, browser, action, file digest/fixture identifier where safe, and affected destinations;
7. assess Cloudflare/GitHub/Hover/endpoint/receiving-system logs and notifications under approved procedures;
8. use the private route in [`SECURITY.md`](../../SECURITY.md) for a software vulnerability; and
9. correct through a reviewed release, regression evidence, data-owner reconciliation, and required notification/disposal.

The application has no remote kill, recall, account lock, or file deletion capability.

## Sharing, publication, and reuse

Repository source and synthetic fixtures may be shared only under the repository's actual license and notice files. A workspace's metadata may have separate copyright, database right, license, donor, privacy, cultural, or contractual restrictions. Software availability does not confer rights to source records or generated exports.

Do not publish a Technical Report, backup, or continuity receipt. Imported/restored content that is admitted only as unverified remains diagnostic-only in the application pending the institution's external governed corroboration and correction process. A Public Notice is a draft until accepted by the authorized service, communications, privacy, and accessibility owners. Click-time saved-state verification prevents a defined stale-copy failure; it does not approve the notice or any other derivative. Evaluation results must not disclose vulnerability details, internal routes, participant identities, collection restrictions, or confidential vendor terms. Secondary use requires a new purpose and, when applicable, a new institutional determination.

## Maintenance and decommissioning

Review this plan at every release affecting data fields, imports/exports, storage, reporting, networking, hosting, dependencies, access, or operators, and at least annually while in use. Immediate reassessment is required before adding telemetry, APIs, authentication, collaboration, cloud storage, remote reports, encryption/key management, URL resolution, new personal data, or a broader Public Notice projection.

At exit, preserve required source/lockfile/SBOM/release/format evidence, migrate approved records to authoritative destinations, verify counts and semantics, inventory all browser origins/profiles and files, apply authorized dispositions, remove accounts/routes/secrets/access, and document what deletion cannot reach. [Release and maintenance](../RELEASE_AND_MAINTENANCE.md) and [Operations](../OPERATIONS.md) contain the operating procedure.

## Approval worksheet

| Question | Decision / conditions / record ID |
| --- | --- |
| Approved purposes and workflows |  |
| Approved/prohibited data classifications |  |
| Data owners and authoritative systems |  |
| External evidence-corroboration process and record |  |
| Evidence-disposition roles, policy references, and withdrawal procedure |  |
| Minimum field plan |  |
| Operator/recipient roles |  |
| Endpoint/browser/download controls |  |
| Records schedules and legal-hold precedence |  |
| Privacy/legal basis and notices, if applicable |  |
| Research/human-subjects determination, if applicable |  |
| Cultural/community consultation, if applicable |  |
| Cloudflare/GitHub/Hover review |  |
| Accessibility evaluation and open barriers |  |
| Incident/breach route |  |
| Public Notice authority |  |
| Decommissioning owner and trigger |  |
| Review/expiry date |  |

Empty fields mean the use is not yet governed; they are not defaults.
