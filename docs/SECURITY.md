# Security engineering

## Purpose and authority

This document defines the security properties of the current IN KEEPING implementation. It is a control description, not a certification. The executable source and tests are authoritative when this document and the application disagree.

Primary implementation references:

- [`app/lab-core.ts`](../app/lab-core.ts): catalog quarantine, canonical validation, revisions, incidents, state digests, and linked audit events.
- [`app/xml-safety.ts`](../app/xml-safety.ts): pre-DOM XML structural scan and namespace policy.
- [`app/archival-schemas.ts`](../app/archival-schemas.ts): archival schema, EAD, and archival CSV quarantine.
- [`app/lab-storage.ts`](../app/lab-storage.ts): IndexedDB manifests, generations, optimistic tokens, bounded inspection, and reconstruction.
- [`app/workspace-backups.ts`](../app/workspace-backups.ts): workspace-backup envelope and review.
- [`app/public-url.ts`](../app/public-url.ts): non-fetching public-HTTPS validation.
- [`security-headers.ts`](../security-headers.ts), [`public/_headers`](../public/_headers), and [`wrangler.jsonc`](../wrangler.jsonc): response and hosting policy.

The corresponding requirements and evidence are indexed in [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md). Residual risks are owned in [`RISK_REGISTER.md`](RISK_REGISTER.md).

## Security boundary

The production application is a static asset set. Parsing, normalization, comparison, editing, hashing, report generation, and IndexedDB persistence execute in the operator's browser. The production `wrangler.jsonc` declares static assets, no application Worker entry point, no data binding, and disabled Wrangler observability. Application source has no path that uploads workspace content, follows an imported URL, or submits a form to a server. The production Content Security Policy includes `connect-src 'none'`.

This boundary does **not** make the deployment invisible to its host. Cloudflare, DNS, TLS, browser, operating-system, endpoint-management, and network layers can process ordinary request metadata independently of application code. Account-level Cloudflare logging and analytics are deployment settings and require an external review. See [`PRIVACY_AND_DATA_GOVERNANCE.md`](PRIVACY_AND_DATA_GOVERNANCE.md).

There is no application authentication or authorization layer. Access is inherited from the browser profile, operating-system account, device, and any controls on downloaded files. The application must not be treated as an institutional system of record or a repository for credentials, authentication secrets, regulated data, or unapproved restricted records.

## Hostile-import lifecycle

Catalog and archival imports are untrusted until an operator explicitly applies a successful review. Review is non-mutating. A catalog apply revalidates the review's file name, digest, format, canonical record shapes, findings, identifiers, and destination capacity. An archival apply likewise binds the reviewed digest, format, file name, schema, records, and complete-set invariants. A failure leaves the active revision unchanged and records the rejected action when the operation reaches the workspace layer.

The interface presents source evidence and normalized output as two complete record blocks, **Original input** and **New output**, with accessible element definitions. This supports human review; it does not make misleading but structurally valid metadata trustworthy.

### File admission

Catalog admission in `reviewImport` enforces extension/MIME agreement, nonzero size, fatal UTF-8 decoding, and rejection of disallowed control characters.

- Foreign catalog formats are limited to 5 MiB.
- A file whose name ends in `.in-keeping.json` may be read up to 32 MiB, but content above 5 MiB is accepted only when it is a versioned IN KEEPING catalog packet and later passes exact packet validation. Renaming arbitrary JSON does not make it acceptable.
- Archival imports are limited to 5 MiB for EAD XML, supported archival CSV, and archive-schema packages.
- Workspace-backup review has a separate 26 MiB envelope limit derived from the 25 MiB local-workspace limit plus envelope allowance.

JSON is byte-bounded before `JSON.parse`, then walked with depth, string, array, object-key, forbidden-key, and exact DTO checks. It is not a streaming JSON parser. XML receives the structural scan described below before DOM construction.

### XML before DOM construction

`assertSafeXmlText` performs a single forward structural scan before `DOMParser`. The scan rejects:

- DTDs, entity declarations, non-XML processing instructions, and other `<!...>` declarations;
- XML declarations other than bounded XML 1.0 declarations using UTF-8 when an encoding is stated;
- unbalanced, unclosed, malformed, or overlong tags;
- invalid comments, unterminated CDATA/comments/instructions, duplicate attributes, unquoted attribute values, and invalid ASCII names;
- more than 100,000 elements;
- nesting beyond 256 open elements;
- more than 100,000 counted nodes and attributes;
- more than 64 attributes on one element;
- a tag longer than 16,384 characters; or
- a text node, CDATA section, comment, or attribute value longer than 8,192 characters.

These are parser resource limits, not XML Schema validation and not proof that the document is semantically correct. Entity references are not expanded because entity declarations and DTDs are rejected.

### Namespace and vocabulary handling

After DOM parsing, every element must use a namespace allowed for the detected format. A namespaced attribute must use the format namespace, the XML namespace, or the namespace-declaration namespace. Format-specific validators then require an accepted root, direct-child structure, ordering, leaf/text behavior, and attribute names. MARCXML, MODS, OAI Dublin Core, and EAD therefore reject foreign elements, foreign attributes, same-namespace extension elements outside the accepted subset, and namespace-confused lookalikes rather than silently ignoring them.

An **unused namespace declaration** such as `xmlns:extension="https://example.invalid/ns"` is allowed because a declaration alone is neither a data element nor an applied attribute. If that prefix is used on an element or attribute, the namespace check rejects the document unless the namespace is part of that format's explicit allowlist. This distinction is intentional and visible in `assertXmlElementNamespaces` and the format-specific attribute validators.

The XML support is an explicitly bounded profile of each exchange vocabulary. It is not complete validation against every official schema or extension mechanism.

EAD export has a separate loss preflight. A populated field outside the fixed 15-field core rejects. A populated core field also rejects when an editable schema has changed its kind, repeatability, or fixed EAD mapping, or when the stored scalar/array shape disagrees with that cardinality. Required reference code and title values must be present. There is no fallback that joins repeated scalars, relocates custom values into local notes, or silently omits them; the lossless schema package is required for those cases.

### Cardinality: reject, do not truncate

Canonical record arrays are checked before acceptance. Oversized arrays are rejected rather than reduced to a prefix. Current catalog maxima include 1,000 records per import/workspace revision, 50 creators, 50 contributors, 50 identifiers, 20 links, 100 values for each canonical metadata list, and 1,024 retained source-evidence elements per record. The same maxima are exercised across supported catalog interchange paths.

This reject-not-truncate rule concerns arrays and record cardinality. It should not be generalized into a claim that every scalar normalization preserves arbitrary-length input; scalar fields have their own documented length and normalization rules.

### RIS grammar

RIS is parsed as tagged records rather than by filtering lines. Every nonblank source line before the terminator must match a two-character tag followed by `  -`. A record:

1. begins with exactly one nonempty `TY` field;
2. ends with an `ER  -` terminator;
3. has no data after its terminator;
4. permits at most one blank separator between complete records;
5. rejects leading blank lines, blank lines inside a record, repeated blank separators, untagged lines, duplicate `TY`, missing terminators, and empty records; and
6. retains at most 1,024 evidence elements, including the `ER` terminator.

LF and CRLF input are accepted. A final line ending is not treated as an extra record. Malformed lines are not skipped.

### MARC mnemonic grammar

MARC mnemonic input is parsed line by line. Each record begins with exactly one structurally valid, 24-character `=LDR  ` line. Every following line must match `=(LDR|three digits)`, two spaces, and a body. Control and data fields, indicators, subfield codes, delimiters, and escaped literal `$`/`\` characters are validated. A new `=LDR` can start the next record directly; alternatively, one blank line can separate records. Leading blanks, repeated blank separators, lines before a leader, malformed lines, invalid leaders, invalid indicators, text before the first subfield, and invalid subfield codes reject the import. Lines are not filtered or discarded.

One control/leader value or one data-field subfield consumes one retained evidence element. A record above 1,024 retained evidence elements is rejected.

### Bounded BibTeX profile

The BibTeX parser implements a deliberately limited, non-executable grammar, not the full BibTeX language. It accepts braced values, quoted values, and numeric literals; tracks nested braces to 64 levels; and caps each decoded field at 8,192 characters, entries at 1,000, and fields at 1,022 per entry. Entry type and citation key consume the remaining two positions in the 1,024-element evidence budget.

The parser rejects `@string`, `@preamble`, and `@comment` directives; value macros; `#` concatenation; duplicate fields; missing citation keys; unsafe citation keys; malformed delimiters; unbalanced values; and unexpected text. Percent line comments outside values are skipped. Operators must resolve macros and concatenation before import.

### Delimited and spreadsheet output

CSV and TSV readers validate headers, duplicate normalized names, row width, record and column counts, quotes, and cell length. Versioned tabular lists are JSON arrays within cells, so embedded delimiters are not treated as list boundaries. Versioned TSV uses an explicit reversible escape grammar. Import rejects unknown columns and invalid booleans.

Exported formula-leading cells are neutralized for common spreadsheet consumers. This reduces, but cannot eliminate, formula interpretation risk because receiving applications and import settings differ. A recipient must still review the file before opening it in a spreadsheet application.

### URL policy

Imported and configured URLs are syntax-checked without a network request. Only credential-free HTTPS URLs are accepted. The validator rejects local/single-label names, trailing-dot variants, named local suffixes, private/reserved/non-routable literal IPv4 and IPv6 ranges, and secret-like query parameter names. It does not resolve DNS; it cannot prevent later DNS rebinding, a future change in the destination, or misleading content at a public host. The application does not follow accepted URLs during import.

## Browser-local storage controls

### Explicit persistence

A working copy starts in memory. IndexedDB persistence begins only after an operator creates a named workspace or explicitly opens and saves a reviewed copy. A normal save validates the complete snapshot and audit chain, performs bounded serialization, enforces the 25 MiB payload ceiling, requests a quota estimate when available, calculates SHA-256, checks an optimistic concurrency token, and writes the generation and manifest in one IndexedDB transaction.

Normal workspace creation is capped at 50 named workspaces. Storage inspection separately stops above 100 manifest rows or 256 generation keys. A stored workspace walk stops above 25 MiB, 1,000,000 nodes, depth 18, 5,000 values in one array, 256 fields in one object, or 8,192 characters in one text value.

### Two manifest-bound generations

After a normal save, the manifest names the active generation and at most one prior generation and binds the SHA-256 payload digest of each. Opening the active generation requires its serialized bytes to agree with both the generation's own digest and the manifest's active digest, followed by complete snapshot, revision, archive, service, and audit validation.

If the active generation and manifest digest disagree, opening stops; no fallback is silently selected. A prior generation can open only when it is present, its manifest digest exists, its bytes match both stored and manifest digests, and the full snapshot validates. It opens as an unsaved recovery copy. Opening does not rewrite or delete either generation.

SHA-256 here detects inconsistent local representations. It is unkeyed and provides no confidentiality, identity, authority, custody, trusted time, or resistance to an actor who can rewrite the payload and all related digests.

### Quarantine and reconstruction

Invalid manifests, missing manifests, orphan/unreferenced generations, missing referenced generations, and invalid generation indexes are surfaced through bounded storage inspection. Listing does not silently hide those conditions. The operator must choose a workspace/generation pair and inspect it. A candidate is shown only after stored-digest recomputation and complete snapshot/audit validation.

Reconstruction requires the candidate digest and a new name. It creates a new UUID workspace and an audit event that references the source generation and digest. The original manifest and generation bytes are not modified or deleted. Quarantine therefore supports evidence-preserving reconstruction; it is not automatic repair.

### Backups

Workspace backup version 2 requires this exact envelope marker:

```json
"protection": "plaintext-json-not-encrypted"
```

Review rejects a missing or different marker, unexpected envelope fields, invalid UTF-8, unsafe keys, excessive structure, malformed time, unsupported version, digest mismatch, or invalid workspace state. A legacy version-1 envelope can still be reviewed for continuity, but it has no v2 protection marker.

The marker is a disclosure, not a cryptographic control. Both IndexedDB content and downloaded backups are plaintext. Once downloaded, a backup is outside application deletion, encryption, access-control, and retention mechanisms.

## Revisions and linked audit events

Each revision stores a digest of its catalog, configuration, archival, and service-register state. Each audit event includes bounded event fields, the previous event hash, and a digest binding the current non-audit workspace state. Full snapshot validation checks revision digests, event sequence, hash links, event hashes, and the latest state binding.

The chain is an internal consistency mechanism. It is not a digital signature or external transparency log. The application has no user identity proof, role authorization, trusted timestamp, remote anchor, or nonrepudiation. An actor able to rewrite browser storage can construct a new internally consistent workspace. A validly truncated tail can be indistinguishable when the retained preceding event binds the same state. The fixed role text `Local operator` is descriptive, not authenticated identity.

The application retains at most 20 revision bodies and 5,000 audit events. Those capacity limits are not a records-retention schedule.

## Response and document controls

The production response policy sets a restrictive CSP, `Referrer-Policy: no-referrer`, MIME sniffing protection, frame denial, same-origin opener/resource policy, origin agent clustering, DNS-prefetch disablement, a permissions policy, and one-year HSTS without `includeSubDomains` or preload. Hashed static assets are cacheable; HTML is `no-cache`.

Generated Technical Report and Public Notice files are static HTML with embedded fonts and styles. Their own CSP uses `default-src 'none'`, `script-src 'none'`, `connect-src 'none'`, and denies frames, objects, forms, and base URLs. They contain no scripts or remote resources. They are still plaintext files and may contain sensitive operational data, particularly the Technical Report.

The Public Notice is a fixed projection of nonsynthetic open-incident service categories. It excludes workspace name, raw evidence, notes, catalog/archive/service records, configuration, hashes, and staff-role values. Sample incidents block public-notice generation. Human approval remains necessary before publication.

## Dependency and release controls

Runtime dependencies are limited to React and React DOM; build and test dependencies are exact-version locked. The release gate runs lint, all TypeScript configurations, production build, deterministic tests, `npm audit --audit-level=high`, artifact validation, and a strict Wrangler dry run. A green gate is necessary, not sufficient, for release. Repository branch protection, dependency update review, Cloudflare account configuration, domain/DNS controls, and incident response are external governance controls.

## Security reporting and change review

Security defects should be handled through the repository's private reporting process described in the root [`SECURITY.md`](../SECURITY.md). Any change to an import grammar, maximum, storage envelope, digest construction, public projection, response header, or Cloudflare binding requires:

1. a failing regression test that demonstrates the prior behavior;
2. an implementation change with boundary tests;
3. updates to this document, the threat model, risk register, and traceability matrix when the asserted control changes; and
4. a complete release-gate result recorded in [`VALIDATION_REPORT.md`](VALIDATION_REPORT.md).
