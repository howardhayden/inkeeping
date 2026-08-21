# Data model

## Version domains

| Domain | Current value | Compatibility rule |
| --- | --- | --- |
| Workspace storage namespace | `library-access-continuity-lab` v1 payload | Stable across product rename; exact snapshot validation |
| IndexedDB | `library-access-continuity-lab`, database version 2 | Atomic legacy-store migration to manifest/generation stores |
| Catalog batch | `in-keeping/catalog-batch`, version 1 | Legacy root namespace accepted only through same exact contract |
| Archive schema package | `in-keeping/archive-schema`, version 2 | `lacl-archive-schema` versions 1–2 accepted for bounded compatibility |
| Service register | `in-keeping/service-register`, version 1 | Export-only independent register |
| Workspace backup | `in-keeping/workspace-backup`, version 2 | Legacy `in-keeping/private-workspace-backup` version 1 remains reviewable |

Application SemVer and these interchange/storage versions are independent. A format change increments its own version even when the application remains within one major line.

## Workspace

| Field | Type and bound | Meaning |
| --- | --- | --- |
| `schema` | exact string | Stable workspace namespace |
| `version` | exact integer `1` | Workspace payload version |
| `name` | NFKC text, 1–120 characters | Operator name; unique after normalized local comparison |
| `createdAt`, `updatedAt` | real ISO 8601 UTC instant | Application clock observation; not trusted institutional time |
| `activeRevisionId` | safe ID, ≤128 | Must identify exactly one retained revision |
| `revisions` | 1–20 `Revision` objects | Immutable retained state snapshots |
| `incidents` | 0–500 `Incident` objects | Operational incident register |
| `audit` | 1–5,000 `AuditEvent` objects | Ordered linked event ledger; latest event binds non-audit state |

The complete saved serialization is limited to 25 MiB. Unknown fields, prototype-related keys, invalid dates, duplicate IDs, unsupported enum values, impossible nested state, or an invalid audit chain reject the snapshot.

## Revision

| Field | Type and bound | Invariant |
| --- | --- | --- |
| `id` | safe unique ID, ≤128 | Unique in workspace |
| `parentId` | safe ID or `null` | First revision is null; later revision names a retained/logical predecessor |
| `createdAt` | real UTC instant | Application-observed creation time |
| `label` | bounded text | Human-readable action |
| `digest` | lowercase SHA-256 hex | Hash of canonical revision content excluding the digest itself |
| `records` | 0–1,000 catalog records | IDs and stable identifiers unique within active set |
| `config` | exact `LabConfig` | Resolver/proxy/pickup/member values |
| `archiveSchemas` | 0–50 schemas | Stable IDs; version/structural rules enforced |
| `archiveUnits` | 0–5,000 records | Every schema/version exists; hierarchy and typed values valid |
| `serviceRecords` | 0–1,000 records | Definition-owned exact typed fields and unique IDs |

The digest includes all catalog, configuration, archival, and service state. Restoring a retained revision copies its content into a new revision; existing revision objects are not rewritten.

## Audit event

| Field | Type | Rule |
| --- | --- | --- |
| `sequence` | positive integer | Exact one-based array position |
| `at` | real UTC instant | Clock observation, not trusted timestamp |
| `role` | text ≤100 | Operator-supplied/application role label; not authenticated identity |
| `action` | text ≤180 | Bounded action description |
| `target` | text ≤180 | Bounded record/source/config target |
| `outcome` | `accepted`, `rejected`, `rolled-back` | Exact enum |
| `stateDigest` | optional SHA-256 | Required on current events; complete non-audit workspace state |
| `previousHash` | `GENESIS` or SHA-256 | First event uses `GENESIS`; others equal preceding hash |
| `hash` | SHA-256 | Canonical event fields including previous link |

Hashes provide internal integrity evidence only. See the threat model for recomputation, truncation, identity, and trusted-time limits.

## Catalog record

Core fields are ID (≤128), title (≤1,024), creators (≤50 × 512), contributors (≤50 × 512), year (≤16), one of 20 resource formats, identifiers (≤50), links (≤20 × 2,048), availability, edition/location (≤512), and requestable/suppressed/public-visible booleans.

Descriptive metadata contains issued/created/modified dates; publisher/place/language; subjects/genres; abstract; rights/license; series/container title; volume/issue/pages; extent/audience/coverage; relations; and notes. Descriptive arrays contain at most 100 values and individual values are bounded by their field contract.

Source provenance contains detected format, bounded filename/label, full source-file digest, record ordinal, up to 64 trace keys, and up to 1,024 reconstructed `RecordElement` objects. Each element has a code, name, value, and definition. This is review evidence, not the original byte stream.

## Incident

| Field | Bound |
| --- | --- |
| ID | safe unique value ≤128 |
| Title | ≤500 |
| Service | ≤160 |
| State | open, investigating, monitoring, resolved |
| Severity | high, medium, low |
| Record ID | optional existing/safe record reference ≤128 |
| Owner role | ≤100; descriptive only |
| Opened/updated | real UTC instants |
| Evidence | ≤100 entries × 2,000 |
| Notes | ≤500 entries × 2,000 |
| Next action | ≤500 |
| Synthetic | boolean; blocks Public Notice while open |

Adding the 501st incident or note fails before mutation. Raw incident fields are never passed into the Public Notice renderer.

## Configuration

`resolverBase` and `proxyPrefix` are empty or validated template-capable public HTTPS URLs, each ≤2,048 characters. `defaultPickupLocation` is ≤160 and `memberCode` ≤32. URL validation never resolves DNS or sends a request. Templates are reviewed after bounded placeholder substitution and cannot contain credentials, local/private/reserved hosts, terminal dots, or secret-like query keys.

## Archival schema

An `ArchiveSchema` has safe ID; name ≤120; description ≤1,000; profile (`blank`, `dacs`, `ead4`, `ead3`, `ead2002`, `archives-space`, `atom`, `ric`); one of ten record types; positive integer version; 1–128 fields; and real creation/update instants.

An `ArchiveField` has safe unique ID; label ≤120; definition ≤500; one of sixteen field kinds; required/repeatable booleans; 0–250 unique controlled values; and bounded EAD/ArchivesSpace/AtoM/RiC mapping cues. A schema version advances exactly one. Structural change after records exist requires a new schema and explicit migration.

An `ArchiveUnit` has safe ID; schema ID/version; parent or null; archival level; an exact value map; publication boolean defaulting false; BCP 47 description language; and real UTC instants. Description records may form a maximum 32-level acyclic hierarchy. Other record types have no parent and level `other`. Each repeatable field contains at most 250 typed scalar values.

## Service record

A `ServiceRecord` has safe unique ID; one of sixteen definition keys; one of eight areas; title; state (`active`, `review`, `due`, `blocked`, `retired`); owner role; system of record; sensitivity (`public`, `internal`, `restricted`); exact typed values; and creation/update UTC instants.

Definitions are code-owned and list each field’s ID, label, definition, type, required/repeatable state, and vocabulary. A record may not introduce an unknown field or area/type mismatch. Sensitivity is a handling label, not authorization.

## Named local storage

`workspace-manifests` stores name, normalized name, current and optional prior generation numbers, the digest bound to each referenced generation, bytes, domain counts, optimistic token, and timestamps. `workspace-generations` stores immutable payloads keyed by workspace ID plus generation. Legacy manifests without a prior-generation digest may still open a verified active generation, but the unbound prior generation is never trusted as a fallback; the next ordinary save upgrades the manifest.

Workspace IDs use `crypto.randomUUID`. Tokens use cryptographically random values. They prevent accidental stale-tab overwrite; they do not authenticate a human. `BroadcastChannel` announces manifest changes to other same-origin tabs but does not carry workspace payloads.

## Workspace backup

The v2 JSON envelope accepts exactly:

```text
schema · version · protection · createdAt · payloadDigest · workspace
```

It is limited to 26 MiB. Version 2 requires `protection` to equal `plaintext-json-not-encrypted`; omitting or changing that marker rejects the file. `payloadDigest` is SHA-256 over compact validated workspace JSON. Review applies fatal UTF-8, key/depth/array bounds, exact envelope reconstruction, version compatibility, real time, payload digest, complete snapshot validation, revision digests, URLs, archives, services, and audit verification. Legacy version 1 envelopes remain reviewable under their original exact five-field contract and are never rewritten in place.

The file is plaintext. The digest provides integrity checking, not encryption, access control, authenticity, or custody. Opening it produces a working copy; persistence still requires an explicit named-workspace create.

## Retention and deletion semantics

The software’s 20 revisions, two IndexedDB generations, and 5,000 audit events are technical caps, not institutional retention rules. Deleting a named workspace deletes its manifest and generations in the current origin. It does not erase the open working copy until replaced, exported files, browser/device backups, receiving-system copies, or platform HTTP metadata.
