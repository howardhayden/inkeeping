# IN KEEPING

IN KEEPING is an operational, browser-local workbench for library systems continuity. It gives librarians one bounded place to quarantine exchange files, compare source evidence with normalized records, define archival schemas, maintain cross-department operating registers, record incidents, make reversible changes, and prepare handoff documents when an authoritative platform is incomplete, unavailable, or changing.

It is not a game, simulation, ILS, ERM, archival management system, preservation repository, identity provider, proxy, or institutional system of record. It does not call vendor APIs or fetch imported URLs. The public deployment is a Cloudflare static-asset origin; workspace processing and persistence occur in the browser.

The name describes the work rather than a product category. “In keeping” joins custodial responsibility, continuity, and fitness to context without turning the project into an acronym. The legacy storage namespace remains stable so earlier browser-local work is not stranded by the name.

## Operating model

Startup is blank. **Sample data** is available only from Import and is never loaded implicitly. A working copy begins in memory. The operator creates a named workspace before IndexedDB persistence begins, and every later save is explicit.

```text
untrusted file → bounded parser → quarantine review → explicit evidence disposition
                                                             ↓ admit-unverified only
                              destination revalidation → unverified-evidence revision
                                                             ↓
                              named saved workspace → click-time output verification
```

Every successful catalog, archival, or workspace-backup review requires an explicit `admit-unverified`, `reject`, or `withdraw` disposition. The decision binds the selected source, structural review and canonical payload digest, parser profile, entity scope, and the operator's claimed origin/custody, role, rationale, policy reference, and browser-clock time. A separate content-bound application record says whether that exact decision was applied or not applied, why, and—when applied—which revision ID and state digest resulted. Reject, withdraw, destination conflict, and capacity refusal therefore remain in the workspace instead of disappearing merely because no content revision was created. These decisions deliberately have no local “verified,” “trusted,” or “authoritative” state. `admit-unverified` is the only disposition that can apply an import or replace the working session with a reviewed backup. A withdrawal cannot launder retained active content; historical decisions remain reportable even after their scoped content is removed.

The interface uses the restrained design language of hah.dev: Jost, paper and ink, hairline structure, numbered navigation, monospace structural cues, green accepted state, and red blocking or destructive state. Jost is self-hosted under the included [SIL Open Font License](public/fonts/OFL.txt).

## Implemented surface

- Catalog import: MARCXML, MARC mnemonic, OAI Dublin Core XML, MODS XML, IN KEEPING JSON, CSL-JSON, Schema.org JSON-LD, RIS, strict bounded BibTeX, CSV, and TSV.
- Catalog output: IN KEEPING JSON, OAI Dublin Core XML batch, MODS XML, CSL-JSON, Schema.org JSON-LD, RIS, BibTeX, CSV, TSV, and MARC mnemonic.
- Archival records: versioned custom schemas for description, accession, authority, agent, repository, digital object, rights, event, subject, and location records using 16 explicit field kinds.
- Archival exchange: EAD 4.0, EAD3, EAD 2002, AtoM description CSV, an ArchivesSpace archival-object crosswalk CSV, DCTAP, and a lossless schema package.
- Operating registers: 16 typed records across Collections, Electronic Resources, Discovery, Preservation/Conservation, Technical Services, Special Collections/Archives, Data Services, and Rare Books/Manuscripts.
- State: 20 retained revisions, 5,000 linked audit events, 500 incidents, 50 named local workspaces, optimistic multi-tab concurrency, a current and one prior internally validated, manifest-digest-bound generation, and explicit recovery.
- Documents: system inventory, configuration register, incident ticket, vendor escalation, change request, postmortem, rollback runbook, access-control matrix, continuity checklist, Technical Report HTML, Public Notice HTML, and a full workspace backup.

Catalog review and the Technical Report preserve two complete catalog blocks: **Original input** (bounded reconstructed source evidence) and **New output** (the canonical catalog record). Archive and service sections instead label **Entered active values** and **Canonical active record** because those models do not retain a separate per-record original-source version. The Technical Report renders the active workspace state and revision/audit indexes; it is not a complete historical record and does not establish authenticity, custody, or evidentiary completeness.

Imported or restored content remains diagnostic-only for ordinary outward artifacts pending an independently governed process that corroborates its source and scope outside the application. IN KEEPING does not convert that external decision into a local trusted status. The output barrier follows unverified evidence into the active revision; removing the scoped entities ends the active barrier without deleting the historical decision, while withdrawal alone never releases retained content. Locally entered archive and service records have no source-level authority binding and are conservatively blocked from ordinary outward families.

For an ordinary outward action, the interface requires `continuity-corroborated` for the exact named saved generation: an independently retained current receipt must be compared, then supplied again to both click-time storage reads. Save, rename, and reload clear that process-local proof, and every new saved generation requires a freshly retained and compared receipt. The interface renders from the reopened snapshot and rechecks it immediately before opening or downloading the file. A Technical Report, plaintext workspace backup, and continuity-checkpoint receipt remain explicit diagnostic, recovery, or comparison artifacts; that availability is not an authority decision and does not bypass their stated handling limits.

## Security and privacy boundary

Application code implements no analytics, telemetry, cookies, remote fonts, remote imports, background uploads, or URL-following behavior. Cloudflare may independently process ordinary HTTP request metadata at the static origin; that platform boundary is documented separately. IndexedDB and downloaded workspace backups are plaintext and rely on browser profile, device, filesystem, and institutional controls for confidentiality.

Imports remain untrusted after structural review and explicit application. Controls include fatal UTF-8, byte and cardinality limits, a linear XML pre-scan, exact official XML namespaces, DTD/entity/processing-instruction rejection, exact DTO reconstruction, prototype-key rejection, public-HTTPS validation without requests, formula neutralization, exact successful-review binding, content-bound unverified disposition, apply-time destination revalidation, atomic IndexedDB writes, and state/payload digests. Structural validity and SHA-256 links detect defined mismatch; they are not signatures and do not establish truth, authorship, custody, completeness, authority, trusted time, or nonrepudiation. Workspace backups exclude the separately stored local continuity checkpoint, and a continuity receipt is comparison evidence rather than a workspace backup or authenticity proof.

See [Security](SECURITY.md), [Threat model](docs/THREAT_MODEL.md), and [Privacy and data governance](docs/PRIVACY_AND_DATA_GOVERNANCE.md) before using non-synthetic records.

## Local development

Required runtime: Node.js 22.13 or later. Exact dependencies are locked.

```sh
npm ci
npm run dev
```

Production assurance:

```sh
VITE_SITE_URL=https://inkeep.ing npm run release:check
```

That gate runs lint, all TypeScript surfaces, a static production build, the deterministic unit and contract suite, the complete dependency audit, artifact validation, and a Wrangler dry run. The generated public artifact is `dist/client`; `dist/server` is only the minimal adapter required for ChatGPT Sites checkpointing.

## Production topology

GitHub protects and reviews source; Cloudflare Workers Builds installs the lockfile, runs the release gate, and deploys `dist/client` as Workers Static Assets. There is no application Worker, server database, durable object, queue, KV, R2, D1, service binding, or runtime observability in the public configuration. A Hover-registered domain delegates DNS to Cloudflare and uses one canonical origin because IndexedDB is origin-scoped.

The canonical production origin is [https://inkeep.ing](https://inkeep.ing), built from [`howardhayden/inkeeping`](https://github.com/howardhayden/inkeeping). The public `workers.dev` and version-preview aliases are disabled in source so the workbench has one browser-storage origin. Follow [Deployment](docs/DEPLOYMENT.md) to connect the repository, preserve mail/DNS records, perform the origin-storage cutover, and verify the live response matrix.

## Documentation map

### Product and engineering

- [Product scope](docs/PRODUCT_SCOPE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Import contract](docs/IMPORTS.md)
- [Record and data formatting](docs/DATA_FORMATS.md)
- [Interoperability](docs/INTEROPERABILITY.md)
- [Standards and references](docs/STANDARDS_AND_REFERENCES.md)
- [Sample data](docs/SAMPLE_DATA.md)

### Assurance and governance

- [Security engineering](docs/SECURITY.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Privacy and data governance](docs/PRIVACY_AND_DATA_GOVERNANCE.md)
- [Risk register](docs/RISK_REGISTER.md)
- [Red-team evidence register](docs/RED_TEAM_REGISTER.md)
- [Accessibility](docs/ACCESSIBILITY.md)
- [Testing](docs/TESTING.md)
- [Validation report](docs/VALIDATION_REPORT.md)
- [Traceability matrix](docs/TRACEABILITY_MATRIX.md)

### Deployment and stewardship

- [Deployment](docs/DEPLOYMENT.md)
- [Operations and recovery](docs/OPERATIONS.md)
- [Release and maintenance](docs/RELEASE_AND_MAINTENANCE.md)
- [Performance and reliability](docs/PERFORMANCE_AND_RELIABILITY.md)
- [Architecture decisions](docs/decisions/README.md)

### Review dossier

- [SUNY Albany review dossier](docs/review/SUNY_ALBANY_REVIEW_DOSSIER.md)
- [Review evidence matrix](docs/review/REVIEW_EVIDENCE_MATRIX.md)
- [Evaluation protocol](docs/review/EVALUATION_PROTOCOL.md)
- [Data management and ethics](docs/review/DATA_MANAGEMENT_AND_ETHICS.md)
- [Competency crosswalk](docs/review/COMPETENCY_CROSSWALK.md)

Repository policy is in [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [SUPPORT.md](SUPPORT.md), [CHANGELOG.md](CHANGELOG.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Current licensing is governed by [LICENSING.md](LICENSING.md), [LICENSE](LICENSE), and [LICENSE-MAP.json](LICENSE-MAP.json).

## Licensing

IN KEEPING is **source-available for noncommercial use** under
**PolyForm-Noncommercial-1.0.0**; commercial use requires a separate written license. Separable original documentation and media use **CC-BY-NC-SA-4.0**.
No current source file or function has a permissive commercial-use exception.
See [`LICENSING.md`](LICENSING.md),
[`WORKFLOW-BOUNDARIES.md`](WORKFLOW-BOUNDARIES.md), and
[`LICENSE-MAP.json`](LICENSE-MAP.json) for scope and historical limits.
