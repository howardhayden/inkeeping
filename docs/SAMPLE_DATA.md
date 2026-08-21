# Sample data

IN KEEPING starts with a blank working copy. It does not preload catalog records, archival descriptions, service records, incidents, schemas, or institutional configuration.

**Sample data** is an explicit action on the import screen. Selecting it asks before replacing a changed working copy, then opens a separate in-memory sample workspace. It is never merged into the current workspace and is not saved into a local slot unless the operator deliberately creates or replaces one through the normal storage workflow.

## Contents

The sample workspace is synthetic and time-bounded. It contains:

- six catalog records covering representative identifiers, resource types, links, publication data, availability, suppression/request behavior, and retained source elements;
- eight service records, one representative record for each operational area: collection policy, electronic-resource entitlement, discovery profile, condition assessment, metadata job, accession, dataset custody, and copy provenance;
- six synthetic incidents that exercise triage, evidence, resolution, change planning, rollback, and reporting paths;
- example resolver, proxy, pickup, and member configuration using nonproduction values and `.example.org` destinations;
- no preloaded archival schema or archive records, so custom schema creation begins from an explicit user choice.

The sample is intended to make navigation, filters, record review, exports, incident handling, and report generation observable without asking the operator to disclose institutional data.

## Safety and publication boundaries

- Names, systems, identifiers, URLs, checksums, and holdings scenarios are fabricated. They are not suitable as production policy, licensing interpretation, cataloging authority, preservation evidence, or repository configuration.
- A sample checksum demonstrates formatting only; it is not fixity evidence for a real object.
- The sample includes open incidents by design. Public Notice generation is blocked while a synthetic sample incident remains open, preventing demonstration language from being published as an institutional notice.
- Native exports made from the sample remain sample artifacts even if a filename is changed. Treat them as disposable and do not ingest them into a production catalog, ERM, discovery index, repository, ArchivesSpace, AtoM, preservation system, or reporting warehouse.
- The sample is not a golden data set, conformance suite, benchmark, security proof, accessibility certification, or substitute for staging with the institution’s own approved records.

## Recommended use

1. Open **Sample data** only after saving or intentionally discarding current work.
2. Inspect a catalog record’s full **Original input** and **New output** blocks, including field definitions.
3. Review one record from each service area and exercise an incident and change path.
4. Export only to a disposable directory or staging system.
5. Start a blank working copy before creating institutional schemas or importing operational data.

For data contracts and import boundaries, use [data formats](DATA_FORMATS.md) and [imports](IMPORTS.md). For receiving-system limitations, use [interoperability](INTEROPERABILITY.md).
