# Standards and reference register

This register records the primary specifications used to name or design interchange features and the evidence level actually present in IN KEEPING. A linked specification is a design reference, not a conformance certificate.

## Validation vocabulary

| Level | Meaning |
| --- | --- |
| Implemented profile | Source code enforces the documented bounded syntax, namespaces, scalar rules, and cardinalities. |
| Repository regression evidence | Automated tests exercise accepted/rejected fixtures, boundaries, escaping, and the application’s own export/re-import path. |
| Official schema validation | An authoritative machine-readable schema is run against produced artifacts. **Not present for EAD4, EAD3, EAD 2002, MODS, MARCXML, OAI DC, CSL-JSON, or Schema.org in this repository.** |
| Receiving-software validation | The artifact is staged in a named product/version and reviewed. This is an external deployment responsibility and is not claimed by the repository tests. |

## XML and general data syntax

| Reference | Use in the application | Evidence level |
| --- | --- | --- |
| [W3C XML 1.0](https://www.w3.org/TR/xml/) | XML declaration and well-formedness vocabulary | Restricted XML 1.0 pre-parser plus DOM parse; DTDs, entities, and processing instructions intentionally excluded |
| [W3C Namespaces in XML](https://www.w3.org/TR/xml-names/) | Namespace-qualified XML format dispatch | Exact allowlists and foreign-namespace rejection; not a generic namespace processor profile |
| [RFC 8259: JSON](https://www.rfc-editor.org/rfc/rfc8259) | JSON interchange syntax | Before `JSON.parse`, catalog/archive packages, workspace backups, continuity receipts, signed witness/policy records, recovery-transition/interoperability records, and JSON arrays/objects embedded in versioned CSV/TSV cells receive a raw scan that rejects duplicate decoded member names and unpaired Unicode surrogates. Parsed values then receive stricter depth/key/string/array/prototype and exact-shape checks. This is a local, non-streaming profile, not general JSON validation. |
| [RFC 4180: CSV](https://www.rfc-editor.org/rfc/rfc4180) | CSV quoting model | Informational reference; strict equal-width tables and local list/formula conventions add an application profile |
| [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) | Exact-string Schema.org context for a bounded object/array/`@graph` projection | Only `https://schema.org` and `https://schema.org/` are accepted as string contexts. A graph container has exactly `@context` and array-valued `@graph`; nested graphs and context overrides reject. Declaration and identity keys at the root and mapped resource (`@context`, `@graph`, `@id`, `identifier`, and `url`) must use exact case, Unicode form, and bidi-free spelling. Identifier objects are closed to optional exact `@type: "PropertyValue"`, exactly one `value`/`@value`, and at most one nonempty `propertyID`/`type`; URL objects contain only exact `@id`. A private IN KEEPING URN is accepted only in `@id`; a public-HTTPS `@id` is retained as a link rather than made the local ID. There is no expansion, compaction, remote-context retrieval, RDF dataset validation, or JSON-LD processor conformance. |

## Bibliographic and discovery formats

| Reference | Implemented scope | Validation status |
| --- | --- | --- |
| [MARC 21 Format for Bibliographic Data](https://www.loc.gov/marc/bibliographic/) and [Leader](https://www.loc.gov/marc/bibliographic/bdleader.html) | Bibliographic leader checks and bounded mnemonic field/subfield mapping | Internal parser/serializer tests require at most one nonempty `001` and `003`. Separate `020`, `022`, and `024` fields remain repeatable. One shared 020 rule removes only a terminal parenthetical qualifier; one shared 024 rule validates indicator 1, requires blank indicator 2, requires `$2` only for indicator 7, forbids it otherwise, and maps fixed UPC/ISMN indicators without guessing from value text. Mnemonic text is not ISO 2709 and is not certified against a cataloging policy. |
| [Library of Congress MARCXML](https://www.loc.gov/standards/marcxml/) and [MARC21slim XSD](https://www.loc.gov/standards/marcxml/schema/MARC21.xsd) | `http://www.loc.gov/MARC21/slim` record subset | The exact same `001`/`003`, 020 qualifier, and 024 indicator/`$2` rules apply under strict internal structure and namespace tests. The official XSD is a reference and is not executed in this repository. |
| [Library of Congress MODS 3](https://www.loc.gov/standards/mods/v3/) | Bounded MODS 3 subset | Import permits at most one `recordInfo`; supplied `recordIdentifier` values must be nonempty and agree, while exact repeats remain separately retained source evidence and general `identifier` elements remain repeatable. Six semantic attribute locations are value-validated and retained; all other attributes and arbitrary extensions reject. Own round-trip tests are not an official XSD run. |
| [DCMI Metadata Terms: DCMES](https://www.dublincore.org/specifications/dublin-core/dces/) and [OAI DC XSD](https://www.openarchives.org/OAI/2.0/oai_dc.xsd) | Flat 15-element OAI DC batch subset | At most one case-insensitive `urn:in-keeping:` private primary-identity wrapper is accepted; Unicode-lookalike wrappers reject, while ordinary identifiers remain repeatable evidence. HTTP(S)-shaped identifiers enter link validation, where only the shared public-HTTPS profile is accepted. No semantic attributes are accepted on the document root, `oai_dc:dc` record, or DCMES leaves; the XSD is not run. |
| [OAI-PMH 2.0](https://www.openarchives.org/OAI/2.0/openarchivesprotocol.htm) | Namespace and `oai_dc:dc` record vocabulary only | The application is not an OAI-PMH repository, harvester, transport, or protocol implementation |
| [Citation Style Language schema repository](https://github.com/citation-style-language/schema) | Citation-oriented CSL-JSON mapping | Identity-bearing keys must use the exact canonical spellings `id`, `DOI`, `ISBN`, `ISSN`, `PMID`, and `URL`; case or NFKC aliases reject. Bidi controls in property names reject, and JSON-LD `@context`, `@graph`, `@id`, and `identifier` carriers reject recursively rather than competing with CSL identity; CSL `@type` alone remains permitted. `id` is nonempty text or a nonnegative safe integer, and the other supplied identity values are nonempty text. These are bounded local import/export tests with no schema run; no blanket CSL-JSON conformance claim is made. |
| [Schema.org CreativeWork](https://schema.org/CreativeWork) | CreativeWork subclass projection under the exact JSON-LD context profile above | Local mapping and hostile-context tests only; no Schema.org validator or consumer certification |
| [BibTeX resources at TUG](https://tug.org/bibtex/) | Familiar entry and field syntax | Deliberately smaller safe subset: no `@string`, `@preamble`, or `@comment` directives, macros, or concatenation. Bounded `%` line comments are accepted and terminate consistently on CR, LF, or CRLF. This is not full BibTeX conformance. |
| RIS | De facto two-letter tagged interchange used by reference managers | The local line profile permits at most one nonempty `ID` primary carrier; every supplied `DO` and `SN` must also be nonempty, while multiple nonempty `DO` and `SN` values remain repeatable evidence. No stable open authoritative specification is asserted here; test the documented profile in the receiving manager. |

## Archival description and management

| Reference | Implemented scope | Validation status |
| --- | --- | --- |
| [Library of Congress EAD overview](https://www.loc.gov/ead/) | Version lifecycle and authoritative schema links | Reference only |
| [EAD 4.0 schema source](https://github.com/SAA-SDT/eas-schemas/tree/main/xml-schemas/ead) and [official EAD4 XSD](https://www.loc.gov/ead/v4/ead.xsd) | Current EAD namespace and vocabulary design | Internal EAD4 profile assertions allow at most one nonempty repository identity carrier per description. An optional `control`, when present, requires exactly one nonempty safe `recordId`, retained as the imported schema ID; its optional `maintenanceAgency` is singular and has at most one nonempty `agencyCode` and `agencyName`, with at least one present. Own-output re-import is exercised, but no official EAD4 XSD was copied into or executed by this repository. External XSD validation is pending. |
| [Library of Congress EAD3 schema page](https://www.loc.gov/ead/ead3schema.html) and [official undeprecated EAD3 XSD](https://www.loc.gov/ead/ead3_undeprecated.xsd) | EAD3 namespace and schema reference | The internal profile allows at most one repository carrier containing exactly one `name` or `corpname`; an EAD3 name may retain multiple nonempty `part` elements. An optional `control`, when present, requires exactly one nonempty safe `recordid`, retained as the imported schema ID; its optional singular `maintenanceagency` requires exactly one nonempty `agencyname`. Official EAD3 XSD validation is external/pending. |
| [Library of Congress EAD 2002 schema page](https://www.loc.gov/ead/eadschema.html) and [official EAD 2002 XSD](https://www.loc.gov/ead/ead.xsd) | Legacy EAD 2002 namespace/XLink reference | The internal profile allows at most one nonempty repository carrier with exactly one direct `name` or `corpname`. An optional `eadheader`, when present, requires exactly one nonempty safe `eadid`, retained as the imported schema ID. EAD 2002 remains for installed-system exchange; the official EAD site marks it deprecated and unsupported by TS-EAS. Official XSD validation is external/pending. |
| [AtoM 2.10 CSV import documentation](https://accesstomemory.org/en/docs/2.10/user-manual/import-export/csv-import/) and [AtoM CSV template resources](https://wiki.accesstomemory.org/Resources/CSV_templates) | Parent-before-child and release-specific CSV planning | IN KEEPING emits an ISAD-oriented crosswalk only. No AtoM release has been run by the repository test suite; use the target release’s template and staging import. |
| [ArchivesSpace source repository](https://github.com/archivesspace/archivesspace) and [official API documentation](https://archivesspace.github.io/archivesspace/api/) | Release-specific archival-object/API planning | IN KEEPING emits a bounded archival-object CSV crosswalk, not API payloads or certified bulk-import templates. No vendor/release conformance is claimed. |
| [DCTAP Primer](https://www.dublincore.org/specifications/dctap/primer/) and [DCTAP elements](https://www.dublincore.org/specifications/dctap/elements/) | Reviewable tabular application-profile terms; the primer is a DCMI Community Specification | Export-only local schema description; no DCTAP importer, prefix resolution, SHACL/JSON Schema generation, or data validation |

### Exact EAD evidence statement

The repository contains **no official EAD XSD files and no test that invokes an external XSD validator**. EAD tests cover application-defined namespace and structural assertions, hostile foreign structures, cardinality and hierarchy boundaries, escaping, mapped core fields, rejection of populated custom fields and altered populated-core semantics, privacy/publication state, and re-import of the application’s own serializers. Within that private profile, every description has at most one repository identity carrier; legacy carriers have exactly one direct `name` or `corpname`, and EAD3 preserves multiple nonempty `part` values instead of concatenating or selecting one silently. A supplied EAD4/EAD3 control or EAD 2002 header has exactly one nonempty safe version-specific document identity, which becomes the imported schema ID; a control-less document remains supported and receives a digest-derived local fallback instead. EAD4 and EAD3 maintenance-agency elements receive the cardinality and nonempty-value checks described above but are not authority proof. EAD export has no local-note or scalar-joining fallback: a nonempty value outside the exact core, a populated core field with changed kind/cardinality/mapping, or a mismatched scalar/array shape rejects and must travel in the lossless schema package. These tests are valuable regression evidence, but they are not evidence that an export validates against the official EAD4, EAD3, or EAD 2002 XSD and are not evidence that ArchivesSpace, AtoM, or another product will ingest it.

Before production delivery, run the exact output through the official schema for the declared EAD version, preserve the validator/version and output, then stage it in the receiving system. Resolve placeholder agency/control data and local extension conventions before approval.

## Scalar vocabularies

| Reference | Application behavior | Qualification |
| --- | --- | --- |
| [RFC 5646 / BCP 47](https://www.rfc-editor.org/rfc/rfc5646) | Archive description/material language syntax | Syntactic subset only; no Language Subtag Registry lookup or canonical case rewriting |
| [Library of Congress EDTF](https://www.loc.gov/standards/datetime/) | Archive `edtf` values | Regex-bounded subset documented in [data formats](DATA_FORMATS.md); no claim of complete EDTF Level 0/1/2 validation |
| [IANA Media Types registry](https://www.iana.org/assignments/media-types/media-types.xhtml) | Archive/service media-type syntax | Syntax check only; no registry lookup, deprecation check, or parameter semantics validation |
| [Unicode Normalization Forms](https://www.unicode.org/reports/tr15/) | NFC handling for archival and service text | Stored values must use canonical NFC without surrounding whitespace; archival text additionally canonicalizes CR line endings |

## Security-relevant local conventions

The following are application contracts, not external standards:

- public URLs must use HTTPS and pass the local private-host, credential, and secret-like query boundary;
- SHA-256 import digests bind selected bytes but do not prove authorship or provenance outside the application;
- formula-leading CSV/TSV cells receive a reversible apostrophe sentinel; risk classification sees through Unicode whitespace/format/bidi controls, compatibility sigils, and apostrophe chains, but a receiving spreadsheet’s settings remain outside application control;
- the raw JSON scan covers catalog/archive packages, workspace backups, continuity receipts, signed witness/policy records, recovery/interoperability records, and versioned tabular JSON cells; it rejects duplicate decoded keys and unpaired surrogates before semantic parsing, while later exact-key and prototype checks further narrow the profile;
- namespace allowlists deliberately reject extensible XML that could otherwise disappear during mapping;
- format-defined singular identity carriers reject contradictory repetition, while standards-valid repeatable identifiers remain retained evidence under the per-format limits above;
- OAI DC accepts no semantic attributes, while MODS accepts only its documented, validated attribute set and retains those values as source evidence;
- archive-editor vocabulary and repeatable values split only at newlines; semicolons and surrounding whitespace remain data until canonical validation;
- native archive references are safe local IDs even when DCTAP labels their node type `IRI`.

These parser rules distinguish an unambiguous local representation from a contradictory one; they do not establish that an identifier was honestly supplied, that two records describe the same real-world entity, or that a source has institutional authority. An accepted public-HTTPS JSON-LD `@id` or Dublin Core identifier is retained as a link rather than promoted to the local primary ID. MARC `003` is retained as agency evidence but is not combined with `001` into the application’s local record ID. Authoritative reconciliation remains external.

## Release review cadence

At each production release and before adding or changing a format:

1. record the specification revision and authoritative URL;
2. identify every syntax or vocabulary feature intentionally excluded;
3. update accepted/rejected fixtures and boundary tests;
4. run available official schemas and validators outside the application and retain their reports;
5. stage output in every supported receiving-product version;
6. update the crosswalk loss register and migration notes;
7. avoid changing “implemented profile” to “conformant” unless the repository contains reproducible evidence for that precise claim.
