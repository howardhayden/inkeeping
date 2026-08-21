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

1. Review a bounded exchange file without mutating trusted workspace state.
2. See the original input and normalized output as two complete, defined record blocks.
3. Apply accepted catalog or archival records as one revision after destination revalidation.
4. Correct normalized catalog access/display state without altering retained source evidence.
5. Define and version a custom archival schema using explicit data types, cardinalities, definitions, vocabularies, and mapping cues.
6. Create typed archival and cross-department operating records.
7. Record incidents, evidence, notes, ownership, state, and required next action.
8. Change configuration or restore retained state by creating a new revision.
9. Save, reopen, duplicate, rename, recover, or delete named browser-local workspaces.
10. Export lossless packages, receiving-system crosswalks, operational Markdown, a complete staff Technical Report, a fixed-projection Public Notice, or a full workspace backup.

## Non-goals

IN KEEPING does not:

- authenticate users, authorize roles, encrypt local data, or enforce institutional handling labels;
- sync, collaborate, merge simultaneous edits, send notifications, or create a cloud backup;
- execute imports against Alma, FOLIO, Sierra, WorldShare, ArchivesSpace, AtoM, Preservica, DSpace, Islandora, or another service;
- crawl, resolve, proxy, authenticate, or validate the future behavior of a URL;
- validate every output against an external schema or installed vendor version during ordinary use;
- provide legal, licensing, records-retention, privacy, preservation, or accessibility approval;
- prove authorship, custody, identity, trusted time, intent, or nonrepudiation; or
- infer unknown metadata in place of reviewable source evidence.

## Product principles

### Evidence before confidence

The interface shows input and output records, not a short model-generated assurance. Every normalization remains inspectable. Claims in documentation distinguish implementation, automated verification, manual verification, and external/vendor acceptance.

### Refuse hidden loss

Input over cardinality, malformed tagged lines, namespace-confused XML, unsupported BibTeX macros, invalid types, or unknown exact-envelope fields fail closed. Crosswalk limitations are named. Loss is not converted into apparent success by slicing or skipping.

### Operator action is the state boundary

Opening the application creates only a blank working copy. Imports require review and apply. Persistence requires a named-workspace create/save. Downloads require an explicit control. Public Notice generation uses an explicit fixed projection.

### Reversibility over silent mutation

Catalog corrections, configuration, archival data, service registers, rollback, and recovery produce revisions. IndexedDB saves rotate verified generations. Deletion is explicit and does not pretend to recall exported files.

### Minimal interface, complete documentation

The work surface avoids permanent privacy/security slogans and status clutter. The Technical Report and engineering documentation carry the detailed security, privacy, integrity, and operating boundaries.

## Success criteria

A release is successful when:

- a librarian can complete each supported task without sample content, source-code knowledge, or hidden state;
- invalid or hostile data cannot enter a revision through a documented import path;
- a receiving-system handoff preserves the lossless source package and records every transformation boundary;
- a saved workspace can be verified, a manifest-bound prior generation can open as an unsaved recovery copy, and a verified quarantined generation can be reconstructed under a new workspace ID without altering the source bytes;
- the Public Notice cannot contain private record/evidence fields;
- the production origin contains no application server or data binding;
- automated release gates are green and residual manual/external evidence is not overstated; and
- documentation permits another qualified maintainer to build, deploy, verify, operate, migrate, and retire the service.

## Terms

| Term | Meaning |
| --- | --- |
| Working copy | Current in-memory workspace, whether or not associated with a named saved workspace |
| Named workspace | Manifest plus current/prior immutable generations stored in IndexedDB on one origin |
| Trusted state | State that has passed exact validation and entered a revision or verified generation |
| Quarantine | Parsed review state that cannot mutate a workspace until explicit apply and revalidation |
| Source evidence | Bounded reconstructed elements and full source-file digest; not a byte-for-byte embedded file |
| Revision | Immutable snapshot of catalog, configuration, archival, and service-register state |
| Audit event | Linked event record with action/outcome and, for current events, complete non-audit state digest |
| Workspace backup | Plaintext JSON recovery envelope containing the complete validated workspace |
| Post-run notebook HTML | Deterministic static HTML report styled after a Jupyter output document; not executable `.ipynb` content |
| Public projection | New allowlisted public object constructed from incident categories, not a redacted private object |
