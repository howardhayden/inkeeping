# Product scope

## Thesis

Library continuity work often falls between systems: a vendor outage, metadata migration, renewal decision, inaccessible interface, malformed finding aid, preservation risk, or staff handoff creates a period in which the authoritative platform cannot by itself provide a complete operational record. IN KEEPING supplies a bounded local workbench for that interval.

The application is designed for legitimate work. It is not a game, role-play environment, demonstration dashboard, autonomous decision maker, or substitute for professional judgment. Sample data is synthetic and opt-in; the initial workspace is empty.

## Name

“IN KEEPING” names a relationship rather than an invented category. It joins custodial keeping, continuity, and fitness to institutional context. It is not an acronym and does not imply a standard, certification, or authority the software does not have. The name follows a restrained principle: use ordinary language with more than one relevant meaning, avoid novelty for its own sake, and let the work establish the identity.

## Intended operators

- Systems and Web Services Librarians coordinating discovery, access, authentication, integrations, incidents, and change evidence.
- Collections and Electronic Resources staff reviewing selection, funds, entitlement, license, renewal, access, and post-cancellation obligations.
- Discovery and Technical Services staff inspecting source metadata, normalized output, identifiers, formats, routing, and batch handoff.
- Preservation/Conservation staff recording conditions, actions, fixity references, priorities, and continuity requirements.
- Special Collections, Archives, and Rare Materials staff defining schemas, hierarchies, restrictions, provenance, processing, and description exchange.
- Data Services staff documenting dataset custody, management plans, rights, checksums, media types, retention, and transfer.
- Managers, accessibility coordinators, security reviewers, records officers, and project reviewers evaluating boundaries and evidence.

## Workflow coverage

| Domain | Supported operational record | Typical decision or handoff | Explicit boundary |
| --- | --- | --- | --- |
| Collections | Collection policy; collection fund | Scope, audience, exclusions, allocation, review cycle | Not acquisitions accounting or approval authority |
| Electronic Resources | Resource entitlement; license obligation | Coverage, authentication, renewal, perpetual access, accessibility, ILL/TDM terms | Not an ERM, contract repository, or license interpretation |
| Discovery | Discovery profile; link routing | Indexing scope, suppression, facets, resolver/proxy routes | Does not publish indexes, resolve links, or query vendors |
| Preservation/Conservation | Condition assessment; preservation action | Condition, treatment, priority, checksum/media evidence, review | Not a preservation repository or conservation record of authority |
| Technical Services | Acquisition order; metadata job | Order/handoff context, batch ownership, mapping, completion evidence | Not an ILS order module or batch executor |
| Special Collections/Archives | Accession; processing plan; custom archival schemas | Custody, restrictions, extent, hierarchy, description, exchange | Not an archival management system or finding-aid publisher |
| Data Services | Dataset custody; data management plan | Stewardship, rights, formats, fixity, retention, access planning | Not a repository, data-transfer service, or policy approval |
| Rare Books/Manuscripts | Copy provenance; conservation treatment | Copy-specific evidence, chain notes, material condition, treatment | Not authority over title, appraisal, ownership, or custody |

## Supported tasks

1. Review a bounded exchange file without mutating the active working state.
2. See each catalog record's original input evidence and normalized output as two complete, defined record blocks.
3. Record an explicit `admit-unverified`, `reject`, or `withdraw` disposition bound to the reviewed source, canonical payload, parser profile, and entity scope; apply only `admit-unverified` catalog or archival records as one revision after destination revalidation.
4. Correct normalized catalog access/display state without altering retained source evidence.
5. Define and version a custom archival schema using explicit data types, cardinalities, definitions, vocabularies, and mapping cues.
6. Create typed archival and cross-department operating records.
7. Record incidents, evidence, notes, ownership, state, and required next action.
8. Change configuration or restore retained state by creating a new revision.
9. Save, reopen, duplicate, rename, recover, or delete named browser-local workspaces.
10. Produce diagnostic Technical Reports, plaintext workspace backups, unsigned continuity receipts, signed-witness requests, recovery-transition reviews, and interoperability evidence records with explicit limits; produce ordinary lossless packages, receiving-system crosswalks, operational Markdown, service exports, and Public Notices only through the named-save, signed-continuity, evidence, integrity, and final activation gates.

## Non-goals

IN KEEPING does not:

- authenticate users, authorize roles, encrypt local data, or enforce institutional handling labels;
- sync, collaborate, merge simultaneous edits, send notifications, or create a cloud backup;
- execute imports against Alma, FOLIO, Sierra, WorldShare, ArchivesSpace, AtoM, Preservica, DSpace, Islandora, or another service;
- crawl, resolve, proxy, authenticate, or validate the future behavior of a URL;
- validate every output against an external schema or installed vendor version during ordinary use;
- authenticate an evidence-disposition claim, convert structural validity or a local operator decision into a verified/trusted/authoritative status, or implement the institution's external corroboration process;
- provide legal, licensing, records-retention, privacy, preservation, or accessibility approval;
- prove truth, authorship, custody, identity, completeness, authority, trusted time, intent, or nonrepudiation; or
- infer unknown metadata in place of reviewable source evidence.

## Product principles

### Evidence before confidence

The interface shows input and output records, not a short model-generated assurance. Every normalization remains inspectable. A content-bound disposition records an unauthenticated operator claim and never turns `admit-unverified` into a local authority state. Claims in documentation distinguish implementation, automated verification, manual verification, and external/vendor acceptance.

### Refuse hidden loss

Input over cardinality, malformed tagged lines, namespace-confused XML, unsupported BibTeX macros, invalid types, or unknown exact-envelope fields fail closed. Crosswalk limitations are named. Loss is not converted into apparent success by slicing or skipping.

### Operator action is the state boundary

Opening the application creates only a blank working copy. Imports and reviewed backups require a complete explicit disposition with no default; only `admit-unverified` permits Apply or Open. Persistence requires a named-workspace create/save. Ordinary outward downloads require a named clean save, an exact signed witness terminal under a separately obtained current policy digest, and a single-use lease whose final saved-state check and synchronous browser activation request share one readonly IndexedDB transaction. Technical Reports, plaintext backups, unsigned receipts, witness requests, and non-activating recovery reviews remain deliberately available for bounded diagnosis, recovery, and comparison. Public Notice generation uses an explicit fixed projection.

Withdrawal records that an earlier claim should no longer support use; it does not remove or validate the content that claim described. Retained affected content remains diagnostic-only until a governed revision removes or supersedes it. The current product has no local verified/trusted evidence state, so external corroboration cannot be represented as a self-issued authority upgrade.

### Reversibility over silent mutation

Catalog corrections, configuration, archival data, service registers, rollback, and recovery produce revisions. IndexedDB saves rotate internally validated, manifest-digest-bound generations only after validating the exact stored base that rotation would replace. Deletion is explicit and does not pretend to recall exported files.

### Minimal interface, complete documentation

The work surface avoids permanent privacy/security slogans and status clutter. The Technical Report and engineering documentation carry the detailed security, privacy, integrity, and operating boundaries.

## Success criteria

A release is successful when:

- a librarian can complete each supported task without sample content, source-code knowledge, or hidden state;
- structurally invalid or parser-hostile data cannot enter a revision through a documented import path, while structurally valid content remains explicitly unverified and subject to external semantic reconciliation;
- a receiving-system handoff preserves the lossless source package and records every transformation boundary;
- a saved workspace can be checked for internal consistency, a manifest-digest-bound prior generation can open as an unsaved recovery copy, and an internally validated quarantined generation can be reconstructed under a new workspace ID without altering the source bytes;
- the Public Notice cannot contain private record/evidence fields;
- the production origin contains no application server or data binding;
- automated release gates are green and residual manual/external evidence is not overstated; and
- documentation permits another qualified maintainer to build, deploy, verify, operate, migrate, and retire the service.

## Terms

| Term | Meaning |
| --- | --- |
| Working copy | Current in-memory workspace, whether or not associated with a named saved workspace |
| Named workspace | Manifest plus current/prior immutable generations stored in IndexedDB on one origin |
| Internally validated state | State that has passed exact structural and consistency validation and entered a revision or manifest-digest-bound generation; this does not establish authenticity or completeness |
| Quarantine | Parsed review state that cannot mutate a workspace until an explicit `admit-unverified` disposition, apply of the same unchanged successful in-memory review, and destination revalidation |
| Source evidence | Bounded reconstructed elements and full source-file digest; not a byte-for-byte embedded file |
| Evidence disposition | Content-bound local `admit-unverified`, `reject`, or `withdraw` decision over exact source/review/scope fields and unauthenticated operator claims; never a verified, trusted, or authoritative status |
| Revision | Immutable snapshot of catalog, configuration, archival, and service-register state |
| Audit event | Linked event record with action/outcome and, for current events, complete non-audit state digest |
| Workspace backup | Plaintext JSON recovery envelope containing the complete bounded workspace serialization but excluding the separately stored continuity checkpoint; review/Open requires an outer unverified disposition and does not prove nested evidence authenticity or completeness |
| Continuity receipt | Comparison metadata for a separately stored local checkpoint; not a workspace backup, trusted timestamp, signature, or authenticity proof |
| External continuity witness | P-256 signed, exact-checkpoint statement in a verified linear witness set; a match under the separately supplied policy digest proves scoped correspondence only, not evidence truth, completeness, custody, trusted time, signer authority, or institutional approval |
| Recovery-transition review | Exact, non-activating record of a reviewed backup and supplied continuity material; always requires a new destination lineage and does not prove clean-device recovery or persistence |
| Recorded interoperability pass | Internally complete operator evidence for an exact receiver profile, fixture, build, and commit; not named-product certification or institutional acceptance |
| Post-run notebook HTML | Deterministic static HTML report styled after a Jupyter output document; not executable `.ipynb` content |
| Public projection | New allowlisted public object constructed from incident categories, not a redacted private object |
