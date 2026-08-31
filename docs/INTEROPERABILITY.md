# Interoperability and crosswalk policy

IN KEEPING separates reversible native exchange from useful but intentionally bounded crosswalks. An export button means “produce this documented profile,” not “certify acceptance by every product that uses the format name.” Production release always includes validation in the exact receiving software and version.

## Assurance classes

| Class | Meaning | Formats |
| --- | --- | --- |
| Native, typed exchange | Preserves the application’s canonical fields and scalar types within the documented limits. Import still rebuilds provenance evidence. | IN KEEPING catalog packet; IN KEEPING archive schema package |
| Application-profile round trip | The repository tests the fields emitted by its own serializer through its own strict importer. It does not preserve arbitrary source extensions and does not establish standards or vendor conformance. | Versioned CSV/TSV; supported EAD core; implemented XML/JSON/text profiles |
| Intentional crosswalk | Maps the supported semantic intersection; fields without a target expression may be combined, omitted, or placed only in an explicitly documented target column. | OAI DC, MODS, CSL-JSON, Schema.org JSON-LD, RIS, BibTeX, MARC mnemonic, AtoM CSV, ArchivesSpace CSV, DCTAP |
| External validation | A release gate performed outside the application using official schemas, target templates, APIs, staging imports, and human review. | Every standards- or vendor-facing delivery |

Only the native catalog packet and native archive package are described as lossless for their respective canonical models. “Lossless” does not include the catalog `source` evidence object, raw uploaded bytes, audit history, incidents, workspace configuration, or receiving-system fields that do not exist in the canonical model.

## Catalog exchange

| Export | Extension / media type | Mapped content | Deliberate limits |
| --- | --- | --- | --- |
| IN KEEPING JSON | `.in-keeping.json` / `application/json` | Complete canonical catalog record, metadata, flags, arrays, and identifiers | Raw duplicate-decoded-member and Unicode-scalar scan precedes exact packet validation. The packet omits internal `source`; re-import creates new provenance/evidence from the packet. |
| OAI Dublin Core batch | `.dc.xml` / `application/xml` | Title, creators/contributors, type, date, publisher, subjects, abstract, language, identifiers, links, rights/license, relations, coverage | Flat 15-element crosswalk; structural distinctions, flags, many metadata fields, and target-specific qualifiers are not preserved. Import accepts at most one case-insensitive private `urn:in-keeping:` identity wrapper, retains other identifiers as repeatable evidence, sends HTTP(S)-shaped values through the shared public-HTTPS link boundary, and rejects Unicode-lookalike private wrappers. Namespace declarations are permitted, but semantic attributes on the root, record, or DCMES leaves reject. |
| MODS XML | `.mods.xml` / `application/xml` | Record ID, title, names/roles, normalized type/genre, origin, language, subjects, identifiers, links/location, abstract, rights/license, extent, series, audience, notes | Supported internal MODS subset only. Import permits at most one `recordInfo`; supplied `recordIdentifier` values must be nonempty and agree, with exact repeats retained separately as source evidence, while general `identifier` elements remain repeatable. A closed set of six semantic attribute locations is validated and retained; every other attribute and arbitrary extension rejects. |
| CSL-JSON | `.csl.json` / `application/json` | Citation ID/type, exact normalized type in `genre`, literal names, date, publisher/place, language, abstract, primary DOI/ISBN/ISSN/URL, volume/issue/pages/container, keywords | Citation-focused. Identity-bearing keys must use exact `id`, `DOI`, `ISBN`, `ISSN`, `PMID`, and `URL` spelling; case and NFKC aliases reject. Bidi controls in property names reject, and JSON-LD `@context`, `@graph`, `@id`, and `identifier` carriers reject recursively rather than competing with CSL identity; CSL `@type` alone remains permitted. `id` is nonempty text or a nonnegative safe integer; the other supplied values are nonempty text. |
| Schema.org JSON-LD | `.jsonld` / `application/ld+json` | Creative-work type, exact normalized type in `additionalType`, local URN, property-value identifiers, names, date, publisher, language, subjects, abstract, license, URLs | Only exact string contexts `https://schema.org` and `https://schema.org/` are accepted. A graph container has exactly `@context` and array-valued `@graph`; nested graphs and context overrides reject. Declaration and identity keys at the root and mapped resource (`@context`, `@graph`, `@id`, `identifier`, and `url`) must use exact case, Unicode form, and bidi-free spelling. `@id` is either a safe private IN KEEPING URN or public HTTPS IRI; the former can become the local ID and the latter remains a link. General identifiers may not carry the private wrapper. Identifier objects are closed to optional exact `@type: "PropertyValue"`, exactly one `value`/`@value`, and at most one nonempty `propertyID`/`type`; URL objects contain only exact `@id`. This is not general JSON-LD processing. |
| RIS | `.ris` / `application/x-research-info-systems` | Normalized type in `M3`, ID, title, names, dates, publication, language, edition, containers, pagination, abstract, rights, notes, subjects, URLs, DOI and ISBN/ISSN | De facto tagged profile with at most one nonempty `ID`; every supplied `DO` and `SN` must also be nonempty, while multiple nonempty values remain repeatable evidence. Values are one line. This is not a claim of compatibility with a particular reference manager. |
| BibTeX | `.bib` / `application/x-bibtex` | Type, safe citation key, title, exact normalized type field, literal display names, year, publication/container data, primary DOI/ISBN/ISSN/URL, subjects, abstract, language, rights, notes | Safe subset with no macros, concatenation, `@string`, `@preamble`, or `@comment` directives, arbitrary entry syntax, full name-part model, multiple URLs, or all identifiers. Bounded `%` comments are accepted and terminate on CR, LF, or CRLF. |
| CSV / TSV | `.csv`, `.tsv` / corresponding text type | Full canonical projection in version-1 columns with JSON list cells and explicit booleans | Versioned own-export round trip; JSON list/object cells receive the raw duplicate-member and Unicode-scalar scan before mapping. Unversioned list splitting is intentionally lossy. |
| MARC mnemonic | `.mrk` / `text/plain` | Leader profile, local ID, title, literal names/roles, identifiers, edition, publication, language, extent, RDA 336/337/338, exact normalized type in local 655, genres, subjects, abstract, notes, location, URLs | MarcEdit-style text, not ISO 2709. Import permits at most one nonempty `001` and `003`; separate `020`, `022`, and `024` fields remain repeatable, while each occurrence permits at most one `$a` and each `024` at most one `$2`. Conservative `720` names and local fields require local-policy review. |

All operator-supplied catalog JSON and archive-schema packages, complete workspace backups, continuity receipts, and JSON arrays/objects embedded in versioned CSV/TSV cells pass the same raw member/scalar quarantine before semantic parsing. Literal and escape-equivalent duplicate member names and lone Unicode surrogates reject before a native parser can discard or normalize them. This local scanner is not a streaming JSON implementation or a general certification of every JSON consumer.

MARCXML is an import-only profile here. It applies the same singular `001`/`003` and per-occurrence `020`/`022`/`024` rules as mnemonic MARC, in addition to its closed namespace, structure, ordering, and lowercase subfield-code checks. Separate identifier fields remain repeatable; only contradictory or invalid cardinality within a defined singular carrier fails closed.

Repository tests exercise all 20 normalized catalog record types through every own exporter/importer and exercise maximum cardinalities. This establishes regression behavior inside the application, not arbitrary-source losslessness, external conformance, or real-world entity resolution. These checks cannot establish that an identifier is truthful, that two records with compatible identifiers describe the same entity, or that a source has authority. In particular, public JSON-LD and Dublin Core identifiers retained as links do not become local primary IDs, and MARC `003` is retained as evidence rather than combined with `001` into the application record ID.

For MODS import, the closed attribute set is `titleInfo@type` (`primary` or `alternative`), `roleTerm@type` (`text`), `genre@authority` and `identifier@type` (controlled tokens of 1–64 characters), `accessCondition@type` (`license`), and `relatedItem@type` (`series`, required when that element is present). Namespace declarations are structural and are not retained as evidence. Every accepted semantic attribute and every exact repeated `recordIdentifier` becomes ordered **Original input** evidence; unsupported attributes or contradictory record identifiers reject rather than disappear during mapping.

## Archival native package

`in-keeping/archive-schema`, version 2, is the reversible archival handoff. It carries the complete schema definition, record type, all 16 scalar kinds, vocabularies, four mapping strings, exact hierarchy, typed values, publication state, description language, and timestamps. Its raw JSON is scanned for duplicate decoded member names and unpaired Unicode surrogates before exact package validation. Version 1 packages remain readable and are canonicalized with documented defaults.

Use the native package as the preservation and rollback artifact even when an EAD or vendor CSV is the delivery artifact.

## EAD mapping profile

EAD 4.0, EAD3, and EAD 2002 import and export the implemented descriptive intersection:

| Canonical field | EAD intent |
| --- | --- |
| `reference_code` | Unit identifier |
| `title` | Unit title |
| `dates` | Unit dates, repeatable |
| `creator` | Origination/agent statement, repeatable |
| `extent` | Extent, repeatable |
| `scope_content` | Scope and content |
| `arrangement` | Arrangement |
| `access_conditions` | Access restriction/conditions |
| `use_conditions` | Use or reproduction restriction |
| `language` | Language of material |
| `repository` | Custodial repository |
| `subjects` | Controlled access points |
| `related_material` | Related material, repeatable |
| `digital_object_uri` | Public HTTPS digital representation |
| `note` | General note |
| hierarchy | `archdesc` plus nested components |
| `published` | Public/external versus internal audience where that version supports the mapped expression |
| record `language` | Description language using the version-specific supported expression |

The 15 named fields above are the exact EAD export core. Before EAD4, EAD3, or EAD 2002 serialization, every record is inspected; any nonempty value under another field ID rejects the entire export and identifies the custom field and record. A populated core field must retain its default kind, repeatability, fixed EAD mapping, and scalar/array value shape; the two required identity fields must be nonempty. This closes the editable-core-ID path that could otherwise join a repeated scalar field. Empty custom values do not block export. There is no local-note fallback, scalar joining, or silent omission. Use the lossless schema package to preserve custom fields or altered core semantics.

On import, the supported EAD profile permits at most one repository identity carrier in each description. EAD4 requires that carrier to contain nonempty text. EAD3 and EAD 2002 require exactly one direct `name` or `corpname`; EAD3 retains one or more nonempty `part` elements as repeatable name evidence, while EAD 2002 requires nonempty name text. Duplicate, empty, or structurally competing carriers reject instead of selecting or concatenating one silently.

The version-specific document identity is also singular. A supplied EAD4 `control` requires exactly one nonempty safe `recordId`; EAD3 requires `control/recordid`; EAD 2002 requires `eadheader/eadid`. That value becomes the imported schema ID. A document without the optional control/header remains supported and receives a digest-derived local fallback rather than fabricating source identity. EAD4 permits at most one `maintenanceAgency`, with at most one nonempty `agencyCode` and `agencyName` and at least one of them present; EAD3 permits at most one `maintenanceagency` with exactly one nonempty `agencyname`. These are parser-disambiguation rules within the local EAD crosswalk, not repository or agency authority control or proof of custody.

EAD export requires exactly one root description and XML-NCName record IDs. The EAD4 control block uses a generated placeholder agency statement when institutional agency data is unavailable; replace it before deposit. None of the EAD serializers has been executed against the official EAD4, EAD3, or EAD 2002 XSDs in this repository. The test suite proves strict namespace/structure checks and own-output re-import only. Official XSD validation and a staging ingest are external, pending release gates.

## AtoM ISAD CSV crosswalk

The fixed columns, in order, are:

`legacyId`, `parentId`, `identifier`, `title`, `levelOfDescription`, `eventDates`, `eventTypes`, `eventActors`, `extentAndMedium`, `scopeAndContent`, `arrangement`, `accessConditions`, `reproductionConditions`, `language`, `subjectAccessPoints`, `relatedUnitsOfDescription`, `digitalObjectURI`, `generalNote`, `culture`, `publicationStatus`.

Behavior:

- records are topologically ordered, parent before child;
- each exported date receives the event type `Creation`;
- repeatable values use the escaped vertical-bar convention described in [imports](IMPORTS.md);
- description language defaults to `en` when absent;
- `published: true` becomes `Published`; every other state becomes `Draft`;
- additional schema mappings become additional columns;
- import accepts only creation-date events and produces custom nonrepeatable text fields for otherwise unknown columns.

This is an ISAD-oriented crosswalk, not certification against an AtoM release’s CSV template, culture configuration, taxonomy, slug behavior, or required institutional defaults. Compare the header with the target release’s official template and stage the import. The crosswalk does not implement other AtoM columns such as `qubitParentSlug` unless supplied through a reviewed custom mapping, and even then target acceptance is external.

## ArchivesSpace archival-object CSV crosswalk

The fixed columns, in order, are:

`ead`, `res_uri`, `hierarchy`, `parent_ref_id`, `level`, `other_level`, `title`, `unit_id`, `ref_id`, `publish`, `langcode`, `dates`, `creators`, `extents`, `n_scopecontent`, `n_arrangement`, `n_accessrestrict`, `n_userestrict`, `n_relatedmaterial`, `n_odd`, `digital_object_uri`.

The exporter includes the exact human-readable label row recognized by the importer. It emits:

- one schema ID in `ead`;
- a blank `res_uri` by design, because an operator must choose the existing target resource rather than accept an invented URI;
- explicit hierarchy depth and parent reference ID;
- `true` or `false` publication state;
- description language, defaulting to `en`;
- supported core values and any additional schema mappings.

Import permits only one nonblank resource EAD boundary and one nonblank resource URI boundary, requires parent-before-child order, and verifies declared depth against the parent. The optional exact label row may appear only immediately after the header.

This file is an archival-object crosswalk, not the full official ArchivesSpace bulk-import contract and not evidence of compatibility with any particular ArchivesSpace release, plugin, repository, resource URI, controlled vocabulary, or API. Supply the target resource, compare with the release-specific template, and stage the load.

## DCTAP schema CSV

DCTAP is an export-only description of the custom schema. It contains:

`shapeID`, `shapeLabel`, `propertyID`, `propertyLabel`, `mandatory`, `repeatable`, `valueNodeType`, `valueDataType`, `valueShape`, `valueConstraint`, `valueConstraintType`, and `note`.

The shape is `${schema.id}#${recordType}`. URI and reference fields use `IRI`; all others use `Literal`. Datatype tokens include `xsd:*`, `edtf:EDTF`, `dcterms:MediaType`, and `premis:messageDigest`. Controlled vocabularies are joined with ` | ` and declared as a `picklist`; local record and agent references receive local shape tokens.

The CSV does not declare prefix bindings, dereference local identifiers, import records, produce SHACL, produce JSON Schema, or validate data. Its shape/property identifiers may be local tokens rather than globally valid IRIs. Treat it as a reviewable application profile and add project-specific URI policy before using it as a formal external constraint language.

## Service-register exports

Service JSON exports `{ "schema": "in-keeping/service-register", "version": 1, "exportedAt", "records" }` and preserves the validated JSON scalar types. Service CSV is a long-form operational extract with columns:

`record_id`, `area`, `record_type`, `title`, `state`, `owner_role`, `system`, `sensitivity`, `field_id`, `field_type`, `value_index`, `value`, `created_at`, `updated_at`.

Each scalar or repeatable value becomes one row. Strings, booleans, and numbers are rendered as text while `field_type` and `value_index` provide reconstruction context. Cells beginning with a formula sigil receive an apostrophe sentinel. The current application has no service-register import path; neither service JSON nor CSV should be described as an application round trip.

## Receiving-system validation record

For every production handoff, preserve:

1. native source package and SHA-256 digest;
2. export format and application version/commit;
3. receiving product, exact version, plugins, import template, and configuration;
4. official XSD/schema/API/template validator output when applicable;
5. staging import counts, warnings, rejected rows, hierarchy and identifier checks;
6. representative comparisons for titles, names, dates, identifiers, rights/restrictions, publication state, links, hierarchy, Unicode, multiline text, repeated values, and formula-leading text;
7. accepted local transformations and their owner;
8. rollback artifact and approval.

Do not promote a staged crosswalk merely because it parses. Verify discovery display, suppression/restriction behavior, digital-object routes, parentage, and export-back behavior in the target system.
