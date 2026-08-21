# IN KEEPING

IN KEEPING is an operational, browser-local workbench for library systems continuity. It gives librarians one bounded place to quarantine exchange files, compare source evidence with normalized records, define archival schemas, maintain cross-department operating registers, record incidents, make reversible changes, and prepare handoff documents when an authoritative platform is incomplete, unavailable, or changing.

It is not a game, simulation, ILS, ERM, archival management system, preservation repository, identity provider, proxy, or institutional system of record. It does not call vendor APIs or fetch imported URLs. The public deployment is a Cloudflare static-asset origin; workspace processing and persistence occur in the browser.

The name describes the work rather than a product category. “In keeping” joins custodial responsibility, continuity, and fitness to context without turning the project into an acronym. The legacy storage namespace remains stable so earlier browser-local work is not stranded by the name.

## Operating model

Startup is blank. **Sample data** is available only from Import and is never loaded implicitly. A working copy begins in memory. The operator creates a named workspace before IndexedDB persistence begins, and every later save is explicit.

```text
untrusted file → bounded parser → quarantine → Original input / New output → explicit apply
                                                                    ↓
                          revision ← catalog + archives + services + incidents
                              ↓                         ↓
                    named browser workspace       explicit export
```

The interface uses the restrained design language of hah.dev: Jost, paper and ink, hairline structure, numbered navigation, monospace structural cues, green accepted state, and red blocking or destructive state. Jost is self-hosted under the included [SIL Open Font License](public/fonts/OFL.txt).

## Implemented surface

- Catalog import: MARCXML, MARC mnemonic, OAI Dublin Core XML, MODS XML, IN KEEPING JSON, CSL-JSON, Schema.org JSON-LD, RIS, strict bounded BibTeX, CSV, and TSV.
- Catalog output: IN KEEPING JSON, OAI Dublin Core XML batch, MODS XML, CSL-JSON, Schema.org JSON-LD, RIS, BibTeX, CSV, TSV, and MARC mnemonic.
- Archival records: versioned custom schemas for description, accession, authority, agent, repository, digital object, rights, event, subject, and location records using 16 explicit field kinds.
- Archival exchange: EAD 4.0, EAD3, EAD 2002, AtoM description CSV, an ArchivesSpace archival-object crosswalk CSV, DCTAP, and a lossless schema package.
- Operating registers: 16 typed records across Collections, Electronic Resources, Discovery, Preservation/Conservation, Technical Services, Special Collections/Archives, Data Services, and Rare Books/Manuscripts.
- State: 20 retained revisions, 5,000 linked audit events, 500 incidents, 50 named local workspaces, optimistic multi-tab concurrency, a current and prior verified generation, and explicit recovery.
- Documents: system inventory, configuration register, incident ticket, vendor escalation, change request, postmortem, rollback runbook, access-control matrix, continuity checklist, Technical Report HTML, Public Notice HTML, and a full workspace backup.

Every visible catalog comparison and every catalog/archive/service record in the Technical Report uses two complete blocks of record: **Original input** and **New output**. Values, provenance, types, and accessible definitions remain available; the application does not replace evidence with an abbreviated generated summary.

## Security and privacy boundary

Application code implements no analytics, telemetry, cookies, remote fonts, remote imports, background uploads, or URL-following behavior. Cloudflare may independently process ordinary HTTP request metadata at the static origin; that platform boundary is documented separately. IndexedDB and downloaded workspace backups are plaintext and rely on browser profile, device, filesystem, and institutional controls for confidentiality.

Imports are treated as hostile until accepted. Controls include fatal UTF-8, byte and cardinality limits, a linear XML pre-scan, exact official XML namespaces, DTD/entity/processing-instruction rejection, exact DTO reconstruction, prototype-key rejection, public-HTTPS validation without requests, formula neutralization, apply-time revalidation, atomic IndexedDB writes, and state/payload digests. SHA-256 links detect internal mismatch; they are not signatures and do not establish authorship, custody, trusted time, or nonrepudiation.

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

Repository policy is in [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [SUPPORT.md](SUPPORT.md), [CHANGELOG.md](CHANGELOG.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Copyright is reserved; see [LICENSE.md](LICENSE.md).
