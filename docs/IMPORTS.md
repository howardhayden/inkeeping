# Import contract

IN KEEPING treats every selected file as untrusted. Import is a two-step operation: **review** parses and validates a candidate without changing the workspace; **apply** creates a new revision only when the reviewed filename, format, SHA-256 digest, record provenance, record shape, and findings still agree. A rejected or stale review is never partially applied.

This document is the operational file boundary. [Data formats](DATA_FORMATS.md) defines the canonical records, [interoperability](INTEROPERABILITY.md) defines crosswalk losses, and [standards and references](STANDARDS_AND_REFERENCES.md) states what has and has not been externally validated.

## Shared input boundary

- Files must contain at least one byte and decode as UTF-8. A leading UTF-8 BOM is removed. Invalid UTF-8, C0 control characters other than tab/LF/CR, and DEL are rejected.
- Filename extension and a supplied media type must agree. An empty media type is accepted because browsers and operating systems do not always provide one. Archival import also accepts `application/octet-stream` as unknown rather than contradictory.
- Parsing is fail-closed: unknown keys in strict native packages, unsupported XML structures or namespaces, malformed lines, duplicate IDs, and values beyond a declared limit reject the candidate. Lists are not silently truncated.
- Catalog apply rejects duplicate record IDs, duplicate stable identifiers, any error finding, or a result that would exceed 1,000 catalog records in the workspace.
- Archive apply revalidates the complete schema and record set. IDs must be unique across the archival workspace; parents must exist in the same schema; hierarchy cycles and excessive depth reject the set.
- Import does not execute scripts, spreadsheet formulas, XML external references, BibTeX macros, or network requests.

## Catalog import matrix

The ordinary catalog ceiling is **5 MiB** (`5 × 1,024 × 1,024` bytes) and **1–1,000 records** per file.

| Input | Filename extensions | Accepted declared media types | Additional rule |
| --- | --- | --- | --- |
| IN KEEPING catalog packet, CSL-JSON | `.json` | `application/json`, `application/ld+json` | Strict native packet detection precedes CSL interpretation. |
| Schema.org JSON-LD | `.json`, `.jsonld` | `application/json`, `application/ld+json` | A `.jsonld` file is interpreted as JSON-LD. |
| MARCXML, MODS, OAI Dublin Core | `.xml`, `.marcxml` | `application/xml`, `text/xml` | Root name and namespace choose the parser. |
| RIS | `.ris` | `text/plain`, `application/x-research-info-systems`, plus the other accepted text media types below | UTF-8 tagged text. |
| BibTeX | `.bib`, `.bibtex` | `text/plain`, `application/x-bibtex`, plus the other accepted text media types below | Bounded entry parser; no macro evaluation. |
| CSV | `.csv` | `text/plain`, `text/csv`, `text/tab-separated-values`, `application/x-bibtex`, `application/x-research-info-systems` | Comma-delimited. |
| TSV | `.tsv` | Same text set as CSV | Tab-delimited with versioned escapes when exported by IN KEEPING. |
| MARC mnemonic | `.mrk`, `.mrc.txt` | Same text set as CSV | MarcEdit-style mnemonic text, not binary ISO 2709. |

The broad text media-type set reflects unreliable browser classification; the extension selects the parser. A contradictory nonempty type is rejected.

### Native 32 MiB exception

A filename ending exactly in `.in-keeping.json` may be read up to **32 MiB**. After JSON parsing, a file over 5 MiB is accepted only if it is a strict version-1 catalog packet with:

```json
{
  "schema": "in-keeping/catalog-batch",
  "version": 1,
  "kind": "catalog-batch",
  "provenance": {},
  "records": []
}
```

The legacy storage namespace `library-access-continuity-lab` remains readable for migration. Renaming an arbitrary JSON file to `.in-keeping.json` does not bypass structural validation. All other catalog files remain limited to 5 MiB.

## Catalog parser rules

### JSON, CSL-JSON, and JSON-LD

Before mapping, JSON is limited to 16 nested levels, 5,000 values per array, 256 keys per object, 256 characters per key, and 8,192 characters per string. `__proto__`, `prototype`, and `constructor` keys are rejected.

- Native packets require exact top-level and record keys, version 1, kind `catalog-batch`, and 1–1,000 records. Their canonical projection is the lossless catalog interchange described in [interoperability](INTEROPERABILITY.md).
- CSL-JSON accepts one object or an array of 1–1,000 items. A name may be retained from `literal` or conservatively assembled from `given` and `family`. A `date-parts` value must contain exactly one date of one to three real Gregorian components; a date range is rejected rather than reduced. Literal dates remain literal.
- JSON-LD accepts a resource object, an array, or an object containing `@graph`, with 1–1,000 resources. `@id` becomes a link only when it passes the public-HTTPS boundary; an `urn:in-keeping:` value may become the local ID. `additionalType` can retain an exact IN KEEPING record type.

### XML resource boundary

Every catalog and archival XML file passes a linear pre-parser before `DOMParser`:

| Resource | Maximum |
| --- | ---: |
| Elements | 100,000 |
| Nesting depth | 256 |
| Nodes plus attributes | 100,000 |
| Attributes on one element | 64 |
| XML name | 256 characters, ASCII XML-name subset |
| One tag | 16,384 characters |
| One text node, comment, CDATA section, or attribute value | 8,192 characters |

An optional declaration must be first and describe XML 1.0, optionally UTF-8 and optionally `standalone="yes"` or `"no"`. All other processing instructions, DTDs, declarations, and entity definitions are rejected. Tags and attributes must be balanced, quoted, unique, and well formed. Comments with illegal hyphen sequences reject the file.

After parsing, every element and applied namespaced attribute must belong to the format allowlist. Namespace declarations are structural rather than semantic attributes: an unused declaration may remain, but using its prefix on an element or attribute triggers the namespace check. Every other attribute is subject to the format-specific semantic allowlist below. A recognized record accompanied by a foreign extension or unsupported attribute is rejected rather than accepted with data silently discarded.

| Catalog XML profile | Required namespace | Accepted roots | Format-specific boundary |
| --- | --- | --- | --- |
| MARCXML | `http://www.loc.gov/MARC21/slim` | `collection`, `record` | Exact leader/controlfield/datafield order and structure; 1–1,000 records; at most 256 data fields and 1,024 retained control/subfield evidence elements per record. The leader must be a valid 24-character MARC21 bibliographic leader. XML `id` attributes are ASCII NCNames, 1–256 characters, unique across the document. |
| MODS | `http://www.loc.gov/mods/v3` | `modsCollection`, `mods` | Only the implemented, text-bounded element paths are accepted. The only semantic attributes are `titleInfo@type` (`primary` or `alternative`), `roleTerm@type` (`text`), `genre@authority` and `identifier@type` (1–64-character controlled tokens), `accessCondition@type` (`license`), and required `relatedItem@type` (`series`). Accepted attributes are retained as ordered source evidence. Every other attribute, `extension`, or unsupported structure rejects the file. |
| OAI Dublin Core batch | record namespace `http://www.openarchives.org/OAI/2.0/oai_dc/`; element namespace `http://purl.org/dc/elements/1.1/`; optional IN KEEPING wrapper `https://hah.dev/ns/in-keeping/1` | `oai_dc:dc`, IN KEEPING `collection` | Direct, text-only elements from the implemented 15-element DCMES profile; 1–1,000 records. Namespace declarations are accepted, but the document root, each `oai_dc:dc` record, and every DCMES leaf accept no semantic attributes. Any such attribute rejects the file. |

These checks are an internal structural profile, not official XSD validation.

### RIS record framing

- Every nonempty record starts with exactly one `TY  - value` line and ends with `ER  -`.
- Every content line must match `XX  - value`; malformed lines reject the entire file.
- At most one blank separator is allowed between two complete records, after `ER  -`. A leading blank, two separators, a blank inside a record, content after `ER  -`, duplicate `TY`, or an unterminated record is rejected.
- LF and CRLF are accepted. A record may retain at most 1,024 source elements, including `ER`; the file may contain at most 1,000 records.

### BibTeX bounded subset

- Entries use `@type{key, ...}` or `@type(key, ...)`. Entry types contain only ASCII letters, numbers, underscore, colon, or hyphen and are at most 32 characters. Citation keys use the safe ID alphabet and are 1–128 characters.
- Field names are at most 64 characters. Values must be braced, quoted, or numeric. Braced values support nested braces to depth 64; a field is at most 8,192 characters.
- Duplicate fields reject the entry. `@string`, `@preamble`, and `@comment` directives are rejected. Bare macros and `#` string concatenation are rejected; resolve them before import.
- An entry may have at most 1,022 fields in addition to its type and key, matching the 1,024-element evidence ceiling. A file may contain at most 1,000 entries.
- Creator/editor text is split only on a top-level ` and `. Braces are honored so a literal institutional or display name is not further invented into given/family components.

This is a deterministic safety subset, not a complete BibTeX language implementation.

### MARC mnemonic line discipline

- A record begins with `=LDR  ` and exactly one valid 24-character leader. A new leader or one blank line may separate complete records. A leading or repeated blank separator is invalid.
- Every line is `=(LDR|three digits)  body`. Tags `001`–`009` are control fields. A data field has exactly two indicators from letters, digits, `#`, backslash, or space, followed immediately by one or more `$` plus one alphanumeric subfield code.
- Backslash escapes only a literal `$` or backslash in subfield data. Text before the first subfield, malformed indicators, invalid codes, and every malformed line reject the file; lines never disappear silently.
- A record retains at most 1,024 control fields/subfields for evidence; a file has at most 1,000 records.

### CSV and TSV

Delimited import requires a header plus 1–1,000 records, no more than 64 columns, cells no longer than 8,192 characters, unique normalized headers, a `title` column, equal row widths, and terminated quoting. Unknown columns reject the file.

IN KEEPING exports a versioned table with `in_keeping_tabular_version` equal to `1`. In a version-1 row:

- creators, contributors, links, subjects, genres, relations, and notes are JSON arrays in a cell;
- identifiers are a JSON array of `{ "scheme", "value" }` objects;
- CSV uses doubled-quote field quoting; TSV additionally encodes backslash, tab, CR, and LF as `\\`, `\t`, `\r`, and `\n`;
- booleans are exported as `true` or `false` and may import from `true/false`, `yes/no`, `1/0`, or `y/n`;
- a data cell whose first non-space content begins with `=`, `+`, `@`, or `-` receives a leading apostrophe on export. Import removes only this specific sentinel when the restored value is still formula-like. The application never evaluates the formula.

Unversioned tables remain readable, but list fields are split on semicolon or vertical bar and therefore are not a lossless interchange. Prefer the versioned export for re-import.

## Archival import matrix

All archival files are **1 byte–5 MiB**. JSON, CSV, and EAD imports decode as UTF-8, remove one leading BOM, and enforce the shared text boundary.

| Input | Extensions | Accepted declared media types | Records |
| --- | --- | --- | ---: |
| Lossless archive schema package | `.json` | empty, `application/octet-stream`, `application/json`, `text/json` | 0–5,000 |
| AtoM or ArchivesSpace crosswalk | `.csv` | empty, `application/octet-stream`, `text/csv`, `application/csv`, `text/plain`, `application/vnd.ms-excel` | 1–5,000 data rows |
| EAD 4.0, EAD3, or EAD 2002 | `.xml`, `.ead` | empty, `application/octet-stream`, `application/xml`, `text/xml`, `application/ead+xml` | 1–5,000 descriptions |

### Archive schema package

The strict JSON package is `in-keeping/archive-schema`, version 2; versions 1 and 2 and the legacy `lacl-archive-schema` name remain readable. Exact keys are required. JSON limits are 16 levels, 5,000 array items, 256 object keys, 256 characters per key, and 8,192 characters per string, with prototype-related keys forbidden. A package contains one definition and at most 5,000 typed records. Legacy records receive explicit defaults on import: `recordType: "description"`, `published: false`, and description language `en` when absent.

### EAD

Only these namespaces are accepted:

- EAD 4.0: `https://standards.openpreservation.org/ead/v4`
- EAD3: `http://ead3.archivists.org/schema/`
- EAD 2002: `urn:isbn:1-931666-22-9`

EAD 2002 alone may also use XLink. The root must be `ead`; the document must contain exactly one direct `archdesc`; each imported description has exactly one supported identification container and one title. Unsupported same-namespace elements, hidden mixed text, duplicate singleton sections, foreign attributes, unsupported `audience` values, excessive repeated groups, invalid levels, duplicate IDs, missing parents, and hierarchy depth beyond 32 component levels reject the file. The importer retains the title in the EAD control/header separately from the root description title.

Imported and generated record IDs use the safe local ID syntax. Export to EAD additionally requires an XML NCName (`[A-Za-z_][A-Za-z0-9_.-]{0,127}`); use the native archive package if a valid local ID cannot be expressed that way.

EAD4, EAD3, and EAD 2002 export inspect every record before serialization. A nonempty value whose field ID is outside the exact 15-field core in [data formats](DATA_FORMATS.md#default-descriptive-fields) rejects the entire export and identifies the custom field and record. A populated core field also rejects if its schema kind, repeatability, or fixed EAD mapping has changed, or if the stored scalar/array shape does not match the fixed cardinality. `reference_code` and `title` must be nonempty. Empty custom values do not carry data and do not block export. There is no local-note fallback, scalar joining, or silent omission; use the lossless archive schema package whenever custom-field values or custom EAD semantics must be preserved.

### AtoM and ArchivesSpace CSV detection

CSV has at most 256 columns and 5,000 data records plus an optional ArchivesSpace label row. Headers must be nonempty and case-insensitively unique, and all rows must match the header width.

- AtoM is detected by both `legacyId` and `levelOfDescription`.
- ArchivesSpace is detected by `ref_id` and either `hierarchy` or `parent_ref_id`.
- A file matching both, or neither, is rejected. A label-looking row in any other position is data and must validate; it is never silently skipped.
- Parent records must precede children. ArchivesSpace depth must agree with `parent_ref_id`; when a parent ID is absent, a non-root depth may infer only the immediately available parent from the preceding depth stack. A file cannot cross more than one nonblank resource EAD ID or resource URI boundary.
- AtoM date events must all be `Creation`, with one event type for each event date. Other event types reject the row instead of being discarded.
- Extra columns become nonrepeatable `text` fields in the generated archive schema. Existing mapped columns retain the core typed mapping.
- Repeated cells use a reversible vertical-bar list: `\|` is a literal bar and `\\` is a literal backslash. At most 250 values, each at most 8,192 characters.
- The same spreadsheet formula sentinel used by export is reversed only when the result is still formula-like; no formula is evaluated.

See [interoperability](INTEROPERABILITY.md) before loading either crosswalk into a production AtoM or ArchivesSpace instance.

## Complete workspace backup review

Catalog and archival imports add bounded records to a revision. A workspace backup is the separate recovery path for the complete validated workspace: catalog, archive schemas and records, service register, configuration, incidents, revisions, and audit ledger.

| Boundary | Contract |
| --- | --- |
| Filename | `.json`; generated suffix `.in-keeping-workspace-backup.json` |
| Declared media type | empty, `application/json`, or `text/json` |
| Size | 1 byte–26 MiB |
| Encoding | fatal UTF-8; disallowed controls rejected; no BOM-removal exception |
| Current envelope | `schema: "in-keeping/workspace-backup"`, `version: 2`, `protection: "plaintext-json-not-encrypted"`, `createdAt`, `payloadDigest`, `workspace` |
| Legacy envelope | `schema: "in-keeping/private-workspace-backup"`, `version: 1`; remains reviewable without the current `protection` field |
| JSON allocation limits | 18 nested levels, 5,000 array values, 256 object fields, 256 characters per key, 8,192 characters per string; prototype-related and control-bearing keys reject |

`createdAt` must be a real UTC instant. `payloadDigest` is exactly 64 lowercase SHA-256 hexadecimal characters over the compact JSON serialization of the validated workspace. Review validates both the digest and the same exact workspace, revision, URL, archive, service, incident, and state-bound audit rules used for local restoration.

The backup is deliberately labeled **plaintext JSON that is not encrypted**. The application does not imply confidentiality merely because the file is a backup. A valid review opens an unsaved recovery copy; it does not overwrite a named local workspace. The operator must explicitly create or replace a named workspace if the recovery copy should persist in that browser.

Service-register JSON and CSV are exports only; the current application has no independent service-register import. Use a complete workspace backup to restore service records together with their revision and audit context.

## Evidence shown during review

The record review presents two accessible blocks, under the group label **Original input and new output**:

- **Original input** lists retained source elements in source order. Each element has a code, an accessible name, its normalized textual value, and an accessible definition.
- **New output** lists the complete canonical record produced by the parser, with each field named and defined. It is not a shortened evidence summary.

The SHA-256 digest binds the complete selected byte stream. The retained source evidence binds the digest, normalized filename, parser format, record ordinal, up to 64 trace fields of 8,192 characters, and up to **1,024** `RecordElement` entries per catalog record. Each entry is limited to a 64-character code, 160-character name, 8,192-character value, and 500-character definition.

Retained elements are normalized display evidence, **not a raw byte-for-byte preservation copy**. Native catalog export omits the internal `source` object and rebuilds source evidence if re-imported. Keep the authoritative source file and its independently managed preservation metadata when evidentiary retention is required.

## Operator release checklist

1. Work in a disposable copy of the receiving system and keep the original file unchanged.
2. Verify filename, byte count, SHA-256 digest, detected format, record count, and every error or warning.
3. Compare representative and edge records using both full blocks: **Original input** and **New output**.
4. Apply only after the review is unblocked. Export the resulting native package as the reversible handoff.
5. For EAD, AtoM, ArchivesSpace, MARC, MODS, CSL, Schema.org, RIS, or BibTeX delivery, validate the exported artifact in the exact receiving software and version. Record rejected rows, warnings, local templates, and any accepted transformation as deployment evidence.

## Intentionally unsupported inputs

There is no import path for binary ISO 2709 MARC, ZIP/TAR or other containers, native spreadsheet workbooks, HTML, SVG, scripts, arbitrary JSON Patch, remote URLs, credentials, opaque vendor backups, DCTAP CSV, service-register exports, or the application’s report HTML. Convert with maintained institutional tooling, retain the authoritative source, inspect the result, and select only a documented bounded interchange file.
