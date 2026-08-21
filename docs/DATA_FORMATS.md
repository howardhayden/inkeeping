# Canonical data formats

IN KEEPING stores three operational domains in one revision: catalog records, custom archival schemas and records, and service-register records. This document defines their supported record types, scalar types, canonical limits, and cardinalities. It does not turn a crosswalk into an external standard claim; see [interoperability](INTEROPERABILITY.md).

All text is Unicode. Catalog field normalization returns NFC text with CR/CRLF converted to LF and surrounding whitespace removed; retained source evidence can preserve source-significant spacing. Stored archival and service values must equal canonical NFC without surrounding whitespace. Archival text also canonicalizes CR line endings and rejects unpaired surrogates. IDs reject `__proto__`, `prototype`, and `constructor` where dynamic object keys are accepted.

## Catalog record

### Record types

The `format` enumeration contains exactly:

| Record type | Intended normalized category |
| --- | --- |
| `Article` | Journal or periodical article |
| `Book` | Monographic volume |
| `Online book` | Monograph delivered online |
| `Book chapter` | Part of a monograph |
| `Conference paper` | Conference contribution |
| `Serial` | Continuing resource |
| `Newspaper` | Newspaper resource or article profile |
| `Video` | Moving-image resource |
| `Audio` | Sound resource |
| `Image` | Still image |
| `Map` | Cartographic resource |
| `Score` | Notated music |
| `Dataset` | Dataset |
| `Software` | Software or computer program |
| `Website` | Website or web resource |
| `Report` | Report or technical report |
| `Thesis` | Thesis or dissertation |
| `Manuscript` | Manuscript resource |
| `Archival collection` | Collection-level archival catalog record |
| `Other` | Resource not safely normalized above |

`availability` is one of `Available`, `Online`, `Unavailable`, or `Check availability`. Identifier schemes are `doi`, `isbn`, `issn`, `oclc`, `lccn`, `orcid`, `ismn`, `upc`, `uri`, and `local`.

### Canonical fields

| Field | Type and cardinality | Limit or rule |
| --- | --- | --- |
| `id` | required string | 1–128 characters; `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` |
| `title` | string | 1,024 characters |
| `creators` | string array | 0–50; 512 characters each |
| `contributors` | string array | 0–50; 512 characters each |
| `year` | string | 16 characters; display value, not forced to an integer |
| `format` | enum | One of the 20 record types above |
| `identifiers` | object array | 0–50; exact supported scheme and a value of at most 256 characters |
| `links` | string array | 0–20; 2,048 characters each; each stored link must pass the public-HTTPS safety boundary |
| `availability` | enum | One of four states above |
| `edition` | string | 512 characters |
| `location` | string | 512 characters |
| `suppressed` | boolean | Explicit `true` or `false` |
| `publicVisible` | boolean | Explicit `true` or `false` |
| `requestable` | boolean | Explicit `true` or `false` |
| `metadata` | object | Exact descriptive fields below |
| `source` | object | Import provenance and evidence; not included in native catalog export |

### Descriptive metadata

| Field | Type | Maximum |
| --- | --- | ---: |
| `issued`, `created`, `modified` | string | 64 characters each |
| `publisher`, `place`, `series`, `containerTitle` | string | 2,048 characters each |
| `language` | string | 100 characters |
| `subjects`, `genres`, `relations`, `notes` | string arrays | 100 values per field; 1,024 characters per value |
| `abstract` | string | 8,192 characters |
| `rights` | string | 4,096 characters |
| `license` | string | 2,048 characters |
| `volume`, `issue` | string | 64 characters each |
| `pages` | string | 128 characters |
| `extent`, `audience`, `coverage` | string | 512 characters each |

### Catalog source evidence

`source` contains `format`, normalized `label` (180 characters), SHA-256 `digest` text (128-character field), record `ordinal` (1–1,000), up to 64 trace entries of 8,192 characters, and optionally up to 1,024 ordered `RecordElement` objects. A `RecordElement` contains `code` (64), `name` (160), `value` (8,192), and `definition` (500). The UI exposes these as the accessible **Original input** block and exposes the complete canonical projection as **New output**.

## Archive schema and record

### Archive record types

Every custom schema declares one record type:

| Record type | Intended use | Hierarchy rule |
| --- | --- | --- |
| `description` | Hierarchical intellectual description | Any supported level; parent may reference a record in the same schema |
| `accession` | Custody/acquisition event or body of material received | `level: other`, no parent |
| `authority` | Authority or identity-control record | `level: other`, no parent |
| `agent` | Person, family, organization, or software agent | `level: other`, no parent |
| `repository` | Custodial or holding institution record | `level: other`, no parent |
| `digital-object` | Managed digital representation or object | `level: other`, no parent |
| `rights` | Rights basis, permission, restriction, or license record | `level: other`, no parent |
| `event` | Preservation, custody, description, or other event | `level: other`, no parent |
| `subject` | Subject or access-point record | `level: other`, no parent |
| `location` | Physical or logical storage location | `level: other`, no parent |

Only `description` schemas can export EAD, AtoM CSV, or ArchivesSpace CSV. All ten types can export DCTAP schema documentation and the lossless native archive package. EAD4, EAD3, and EAD 2002 additionally reject a description set when any record has a nonempty value outside the exact EAD core listed under [default descriptive fields](#default-descriptive-fields), when a populated core field changes its declared kind, cardinality, or fixed EAD mapping, or when its stored scalar/array shape disagrees with that cardinality. The native package is the lossless route for custom fields and custom EAD semantics.

Description levels are `repository`, `fonds`, `collection`, `record-group`, `series`, `subseries`, `file`, `item`, and `other`. Profiles are `blank`, `dacs`, `ead4`, `ead3`, `ead2002`, `archives-space`, `atom`, and `ric`. `ric` means a declarative RiC-inspired mapping only; it is not a RiC-O serializer.

### Archive schema

| Field | Rule |
| --- | --- |
| `id` | Safe ID, 1–128 characters; unique in the workspace |
| `name` | 120 characters |
| `description` | 1,000 characters |
| `profile` | One profile above |
| `recordType` | One record type above; absent legacy value means `description` |
| `version` | Integer 1–1,000 |
| `fields` | 1–128 field definitions |
| `createdAt`, `updatedAt` | Valid UTC instants; update cannot precede creation |

Each field definition has a safe unique `id`; a required canonical `label` up to 120 characters; a required canonical `definition` up to 500; one scalar `kind`; explicit `required` and `repeatable`; up to 250 unique, nonblank canonical vocabulary terms of 256 characters; and canonical, case-insensitively unique EAD, ArchivesSpace, AtoM, and RiC mapping strings of up to 256 characters each. Vocabulary terms cannot contain line breaks because a line is the editor's term boundary. Schema names are required; names, descriptions, labels, definitions, vocabulary terms, and mapping strings must already use NFC, LF line endings, and no surrounding whitespace. A description schema must contain a `title` field.

### Archive record

| Field | Rule |
| --- | --- |
| `id` | Safe ID, 1–128 characters; unique across all archival records |
| `schemaId` / `schemaVersion` | Must identify the current definition and exact version |
| `parentId` | `null` or a prior valid record in the same description schema; no self-reference or cycle |
| `level` | One description level; non-description records must use `other` |
| `values` | At most 128 known schema-field keys; each value must match its definition |
| `published` | Boolean; absent legacy value becomes `false` |
| `language` | Description-language tag; absent legacy value becomes `en` |
| `createdAt`, `updatedAt` | Valid UTC instants; update cannot precede creation |

A workspace has at most 50 archive schemas and 5,000 archive records. A hierarchy has one root plus at most 32 component levels. A repeatable field has at most 250 values; a nonrepeatable field has one scalar. Arrays in the native package must be homogeneous strings, booleans, or numbers.

### Archive editor list syntax

Vocabulary terms and repeatable archive values are newline-delimited only. The controlled editor preserves empty draft lines while typing, including a trailing Enter, so the browser does not remove the start of the next value. On commit it converts CR and CRLF to LF, treats each line with at least one character as one value, and omits only zero-length lines. A vocabulary term or one member of a repeatable field cannot itself contain a line break. The editor does not split on semicolons or vertical bars: both remain ordinary data inside the value.

The editor also retains leading and trailing whitespace, including a whitespace-only line, instead of trimming it invisibly. Canonical schema or value validation then rejects that whitespace. This editor rule does not alter the separate delimited-file contracts: unversioned catalog tables may split list cells on semicolon or vertical bar, while AtoM and ArchivesSpace repeated cells use the escaped vertical-bar convention documented in [imports](IMPORTS.md).

### Archive scalar types

| Kind | Canonical stored value | Validation and exchange meaning |
| --- | --- | --- |
| `text` | nonempty string | NFC, LF line endings, no surrounding whitespace; at most 2,048 characters |
| `long-text` | nonempty string | Same canonical text rules; at most 8,192 characters |
| `integer` | JSON number | JavaScript safe integer, not negative zero, absolute value ≤ 10¹² |
| `decimal` | JSON number | Finite number, not negative zero, absolute value ≤ 10¹² |
| `boolean` | JSON boolean | Explicit `true` or `false` |
| `date` | string | Real Gregorian date exactly `YYYY-MM-DD` |
| `date-time` | string | UTC `YYYY-MM-DDTHH:mm:ssZ` or 1–3 fractional digits followed by `Z`; value must equal its canonical instant |
| `edtf` | string | Application subset defined below; it is not a complete EDTF parser |
| `identifier` | string | Canonical text up to 2,048 characters; no automatic identifier normalization |
| `uri` | string | Public HTTPS URL; credentials, private/local hosts, and secret-like query material are rejected |
| `language-code` | string | Syntactic tag `[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*`; no IANA registry lookup |
| `media-type` | string | IANA-style type/subtype and optional syntactically bounded parameters; no registry lookup |
| `checksum` | string | Exactly `sha256:` + 64 hex, `sha512:` + 128 hex, or `md5:` + 32 hex |
| `controlled-term` | string | Exact vocabulary token when the field declares a vocabulary |
| `record-reference` | string | Safe local record ID; DCTAP describes it as an IRI-shaped reference, but storage is a local token |
| `agent-reference` | string | Safe local agent ID; same local-token qualification |

The accepted EDTF-like grammar is deliberately finite:

```text
atom       := [0-9X]{4}(?:-[0-9X]{2}(?:-[0-9X]{2})?)?[?~%]?
expression := atom(?:/(?:atom|\.\.))?
group      := "[" expression("," expression){1,99} "]"
           |  "{" expression("," expression){1,99} "}"
```

An expression has at most one slash, must begin with an atom, and may use `..` only as its open end. Numeric months are `01`–`12`; numeric days are `01`–`31`; a fully numeric year-month-day must be a real Gregorian date. When the month is `XX`, a supplied day must also be `XX`. Group members cannot contain surrounding whitespace. Brackets/braces must pair, and a group contains 2–100 comma-separated expressions. This checks the application grammar only; it does not establish complete EDTF Level 0, 1, or 2 semantics.

### Default descriptive fields

Nonblank description profiles begin with this exact core. `*` means required and `[]` means repeatable.

| Field | Kind | Cardinality |
| --- | --- | --- |
| `reference_code` | `identifier` | exactly one* |
| `title` | `text` | exactly one* |
| `dates` | `edtf` | 0–250[] |
| `creator` | `text` | 0–250[] |
| `extent` | `text` | 0–250[] |
| `scope_content` | `long-text` | 0–1 |
| `arrangement` | `long-text` | 0–1 |
| `access_conditions` | `long-text` | 0–1 |
| `use_conditions` | `long-text` | 0–1 |
| `language` | `language-code` | 0–250[] |
| `repository` | `text` | 0–1 |
| `subjects` | `controlled-term` | 0–250[]; open until a vocabulary is declared |
| `related_material` | `long-text` | 0–250[] |
| `digital_object_uri` | `uri` | 0–250[] |
| `note` | `long-text` | 0–250[] |

The blank profile begins with required `reference_code` and `title` only. Any profile can be extended to the 128-field schema limit.

The 15 IDs in this table are the complete EAD export core. Before serializing EAD4, EAD3, or EAD 2002, the exporter rejects any record with a nonempty value under another field ID. Each populated core field must also retain the kind and cardinality in this table, its fixed EAD mapping, and the corresponding scalar or array value shape; `reference_code` and `title` must be nonempty. This prevents an edited core ID from bypassing the custom-field check and collapsing multiple values into one. The exporter neither moves custom data into `note` nor silently omits it. Empty custom values do not block export because they contain no value to preserve. Use the lossless schema package for custom fields, mappings, or cardinalities.

## Service register

### Record envelope

Every service record contains:

| Field | Rule |
| --- | --- |
| `id` | Safe unique ID, 1–128 characters |
| `kind` | One of the 16 definitions below |
| `area` | Must exactly match the definition’s area |
| `title` | Required canonical NFC string, nonblank, without surrounding whitespace, at most 500 characters |
| `state` | `active`, `review`, `due`, `blocked`, or `retired` |
| `ownerRole` | Canonical NFC string without surrounding whitespace, at most 160 characters |
| `system` | Canonical NFC string without surrounding whitespace, at most 256 characters |
| `sensitivity` | `public`, `internal`, or `restricted` |
| `values` | At most 64 known definition fields |
| `createdAt`, `updatedAt` | Canonical UTC instants; update cannot precede creation |

A workspace has at most 1,000 service records. A repeatable definition field has at most 100 values. Required fields cannot be absent, an empty string, or an empty array.

### Service record types

| Area | Record type | Operational purpose |
| --- | --- | --- |
| Collections | `collection-policy` | Collecting scope, audience, selection responsibility, exclusions, and review cycle |
| Collections | `collection-fund` | Fiscal-year allocation and commitment context without replacing the financial system of record |
| Electronic Resources | `resource-entitlement` | Provider/platform coverage, authentication, renewal, perpetual access, and COUNTER availability |
| Electronic Resources | `license-obligation` | Operational clauses linked to, but not replacing, the authoritative agreement |
| Discovery | `discovery-profile` | Source, mapping version, facets, suppression rule, and reindex evidence |
| Discovery | `link-routing` | Resolver/knowledge-base route, safe rule identifier, known item, expected path, and verification time |
| Preservation / Conservation | `condition-assessment` | Material, condition band, hazards, housing, assessment, and next review |
| Preservation / Conservation | `preservation-action` | Action, object, role, outcome, before/after checksums, and managed storage reference |
| Technical Services | `acquisition-order` | Order, vendor, fund, dates, status, and invoice reference without credentials |
| Technical Services | `metadata-job` | Source/target formats, mapping version, authority sources, count, run time, and rollback reference |
| Special Collections / Archives | `accession` | Custody basis, receipt, extent, agreement status, restrictions, and priority |
| Special Collections / Archives | `processing-plan` | Intended level, arrangement, standard, effort, born-digital flag, and target date |
| Data Services | `dataset-custody` | Persistent ID, repository, steward, media type, fixity, retention, and access level |
| Data Services | `data-management-plan` | Storage, backups, formats, retention, rights, project, and funder context |
| Rare Books / Manuscripts | `copy-provenance` | Shelfmark, imprint, copy features, provenance, binding, marks, standard, and review date |
| Rare Books / Manuscripts | `conservation-treatment` | Object, pre-treatment condition, intervention, materials, role, aftercare, and next review |

The eight area identifiers are `collections`, `electronic-resources`, `discovery`, `preservation`, `technical-services`, `special-collections`, `data-services`, and `rare-materials`.

### Exact service field definitions

In the table below, `*` is required and `[]` is repeatable. Repeatable fields in the current built-in definitions are textual and contain at most 100 strings. A field without a marker is optional and nonrepeatable.

| Record type | Field contract |
| --- | --- |
| `collection-policy` | `scope:long-text*`; `audience:text*[]`; `selection_roles:text[]`; `review_cycle_months:integer`; `exclusions:long-text` |
| `collection-fund` | `fiscal_year:text*`; `fund_code:identifier*`; `allocation:decimal*`; `committed:decimal`; `currency:controlled-term*` = `USD` / `CAD` / `EUR` / `GBP` / `AUD`; `notes:long-text` |
| `resource-entitlement` | `provider:text*`; `platform:text*`; `coverage_start:date`; `coverage_end:date`; `access_model:controlled-term*` = `subscription` / `perpetual` / `evidence-based` / `demand-driven` / `open-access` / `consortial`; `authentication:controlled-term*` = `ip` / `proxy` / `saml` / `openid-connect` / `library-card` / `public`; `license_uri:uri`; `renewal_date:date`; `perpetual_access:boolean`; `counter_supported:boolean` |
| `license-obligation` | `agreement_id:identifier*`; `licensor:text*`; `effective_on:date`; `expires_on:date`; `authorized_users:long-text`; `ill_terms:long-text`; `accessibility_terms:long-text`; `text_mining_terms:long-text`; `post_cancellation_access:long-text` |
| `discovery-profile` | `index_name:identifier*`; `source_system:text*`; `mapping_version:identifier*`; `facets:text[]`; `suppression_rule:long-text*`; `last_reindex:date-time` |
| `link-routing` | `resolver_target:uri*`; `knowledge_base:text*`; `proxy_rule:identifier`; `test_identifier:identifier*`; `expected_route:long-text*`; `last_verified:date-time` |
| `condition-assessment` | `object_identifier:identifier*`; `material_type:text*`; `condition_rating:controlled-term*` = `stable` / `monitor` / `treatment-needed` / `do-not-handle`; `hazards:long-text[]`; `housing:text`; `assessed_on:date*`; `next_review:date` |
| `preservation-action` | `action_type:controlled-term*` = `treatment` / `rehousing` / `stabilization` / `digitization` / `migration` / `normalization` / `fixity-check`; `object_identifier:identifier*`; `performed_on:date*`; `agent_role:text*`; `action_note:long-text*`; `before_checksum:checksum`; `after_checksum:checksum`; `storage_location:text` |
| `acquisition-order` | `order_id:identifier*`; `vendor:text*`; `fund_code:identifier`; `ordered_on:date*`; `received_on:date`; `order_status:controlled-term*` = `requested` / `approved` / `ordered` / `partially-received` / `received` / `cancelled` / `claimed`; `invoice_reference:identifier` |
| `metadata-job` | `job_name:identifier*`; `source_format:text*`; `target_format:text*`; `mapping_version:identifier*`; `authority_sources:text[]`; `record_count:integer`; `last_run:date-time`; `rollback_reference:identifier` |
| `accession` | `accession_number:identifier*`; `source_type:controlled-term*` = `transfer` / `gift` / `purchase` / `deposit` / `unknown`; `received_on:date*`; `extent:text*`; `deed_status:controlled-term` = `not-required` / `pending` / `executed` / `incomplete` / `unknown`; `restrictions:long-text`; `processing_priority:controlled-term` = `low` / `normal` / `high` / `urgent` |
| `processing-plan` | `collection_identifier:identifier*`; `processing_level:controlled-term*` = `collection` / `series` / `file` / `item` / `minimal`; `arrangement:long-text*`; `description_standard:text*`; `estimated_hours:decimal`; `born_digital:boolean`; `target_completion:date` |
| `dataset-custody` | `persistent_id:identifier*`; `repository:text*`; `steward_role:text*`; `media_type:media-type`; `checksum:checksum`; `retention_rule:long-text*`; `access_level:controlled-term*` = `open` / `campus` / `mediated` / `embargoed` / `restricted`; `embargo_until:date` |
| `data-management-plan` | `project_identifier:identifier*`; `funder:text`; `storage_tier:text*`; `backup_schedule:long-text*`; `file_formats:text*[]`; `retention_period:text*`; `rights_basis:long-text` |
| `copy-provenance` | `shelfmark:identifier*`; `imprint:text*`; `copy_note:long-text*`; `provenance_events:long-text[]`; `binding:long-text`; `marks:long-text[]`; `cataloging_standard:text`; `verified_on:date` |
| `conservation-treatment` | `object_identifier:identifier*`; `treatment_type:text*`; `condition_before:long-text*`; `materials_used:text[]`; `treatment_date:date*`; `conservator_role:text*`; `aftercare:long-text`; `next_review:date` |

### Service scalar types

| Kind | JSON value | Validation |
| --- | --- | --- |
| `text` | string | Canonical NFC noncontrol text without surrounding whitespace; ≤1,000 characters |
| `long-text` | string | Same canonical text model; ≤4,000 characters |
| `integer` | JSON number | Finite whole number; absolute value ≤10¹² |
| `decimal` | JSON number | Finite number; absolute value ≤10¹² |
| `boolean` | JSON boolean | `true` or `false` |
| `date` | string | Real Gregorian `YYYY-MM-DD` |
| `date-time` | string | UTC instant with seconds and optional exactly three fractional digits; canonical equivalent required |
| `identifier` | string | 1–256 non-whitespace characters; `<` and `>` forbidden |
| `uri` | string | Public HTTPS URL boundary |
| `controlled-term` | string | Exact declared token when a vocabulary exists |
| `checksum` | string | Optional 2–32 character lowercase-alphanumeric/hyphen algorithm label plus colon, then 32–128 hex characters; unlabeled hex also allowed |
| `media-type` | string | Syntactic IANA-style type/subtype; parameters are not accepted |

Service JSON preserves JSON scalar types. Service CSV is a long-form export with one row per scalar value and a `field_type` column; it is an operational extract, not a native import or automatic round trip.

## Workspace cardinality summary

| Domain | Ceiling |
| --- | ---: |
| Catalog records per import/workspace | 1,000 |
| Catalog creators / contributors / identifiers / links per record | 50 / 50 / 50 / 20 |
| Source evidence elements per catalog record | 1,024 |
| Archive schemas per workspace | 50 |
| Fields per archive schema | 128 |
| Archive records per workspace/package | 5,000 |
| Repeatable archive values / vocabulary terms | 250 |
| Archive component levels below the root | 32 |
| Service records per workspace | 1,000 |
| Value keys per service record | 64 |
| Repeatable service values | 100 |
