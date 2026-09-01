# Data model

## Version domains

| Domain | Current value | Compatibility rule |
| --- | --- | --- |
| Workspace storage namespace | `library-access-continuity-lab` v1 payload | Stable across product rename; exact snapshot validation |
| IndexedDB | `library-access-continuity-lab`, database version 3 | Version 2 manifests/generations remain; upgrade adds an empty continuity-anchor store and never silently accepts a baseline |
| Catalog batch | `in-keeping/catalog-batch`, version 1 | Legacy root namespace accepted only through same exact contract |
| Archive schema package | `in-keeping/archive-schema`, version 2 | `lacl-archive-schema` versions 1–2 accepted for bounded compatibility |
| Service register | `in-keeping/service-register`, version 1 | Export-only independent register |
| Workspace backup | `in-keeping/workspace-backup`, version 2 | Legacy `in-keeping/private-workspace-backup` version 1 remains reviewable |
| Evidence disposition | `in-keeping/evidence-authority-decision`, version 1 | Exact, content-bound operator claim; never upgraded into verified or authoritative evidence |
| Evidence application | `in-keeping/evidence-application-outcome`, version 1 | Exact decision link, source/outcome reason, and applied revision-state binding |
| Evidence warning manifest | `in-keeping/evidence-warning-manifest`, version 1 | Optional on legacy evidence reviews; when present, binds one complete warning set to the exact source and parser profile |
| Continuity anchor | `in-keeping/continuity-anchor`, version 1 | Separate local checkpoint; pre-existing workspaces remain unanchored until explicit acceptance |
| Continuity receipt | `in-keeping/continuity-anchor-receipt`, version 1 | Unsigned exact-checkpoint comparison file; stale or cross-workspace receipts reject |
| Continuity witness | `in-keeping/continuity-witness`, version 1 | Unsigned request binds one local checkpoint and origin scope for external signing |
| Signed continuity witness | `in-keeping/signed-continuity-witness`, version 1 | ECDSA P-256 signature wrapper under a named external authority and key |
| Signed continuity witness set | `in-keeping/signed-continuity-witness-set`, version 1 | Bounded externally supplied chain material; verification still requires a trust policy and separate policy pin |
| Continuity trust policy | `in-keeping/continuity-trust-policy`, version 1 | Exact authority, key status, and accepted terminal set; cannot establish its own currency |
| Recovery transition review | `in-keeping/recovery-transition-review`, version 1 | Source-review record only; never activates or persists a destination and always requires a new lineage |
| Interoperability receiver profile | `in-keeping/interoperability-receiver-profile`, version 1 | Claimed receiver/version/environment plus the exact ordered cases derived from the source-controlled exchange definition |
| Interoperability compatibility package | `in-keeping/interoperability-compatibility-package`, version 1 | One nonempty payload and payload-bound JSON loss/warning reports, with exact metadata and text-byte digests |
| Interoperability semantic diff | `in-keeping/interoperability-semantic-diff`, version 1 | Exact profile/package link and internally consistent registered case/path observations |
| Interoperability run | `in-keeping/interoperability-run`, version 1 | Exact profile/package/diff plus matching manifest/build/full-commit claims and per-case outcomes |

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
| `evidenceAuthority` | optional 0–5,000 `EvidenceAuthorityRecord` objects | Content-bound operator dispositions; current workspaces use an array while legacy payloads may omit it |
| `evidenceApplications` | optional 0–5,000 `EvidenceApplicationRecord` objects | One unique applied/not-applied result per linked decision; legacy payloads may omit it |
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

## Evidence authority record

`EvidenceAuthorityRecord` is deliberately named for the decision boundary it records, not because the application has verified an authority. It has the exact schema/version above, an `EvidenceDescriptor`, the descriptor's canonical SHA-256, an `EvidenceDisposition`, and a canonical SHA-256 binding the complete record. Duplicate record digests reject. These unkeyed digests detect mutation of the represented fields; they do not establish source truth, origin, custody, actor identity, institutional authority, or trusted time.

The descriptor binds three exact blocks:

| Block | Fields and bounds |
| --- | --- |
| `source` | kind (`catalog-import`, `archive-import`, `workspace-backup`, `workspace-history`, or `other`); filename ≤180; format ≤80; source bytes 1–32 MiB; lowercase SHA-256 |
| `review` | structural status exactly `passed`; canonical-payload SHA-256; parser profile ≤160; optional durable warning manifest |
| `scope` | kind (`catalog-records`, `archive-records`, `service-records`, `workspace`, or `other`); 1–5,000 unique entity IDs, each ≤256 |

Current catalog, archive, and workspace-backup review paths include an `in-keeping/evidence-warning-manifest` in this review block. The manifest binds the exact source SHA-256, parser profile, a warning-ruleset profile digest, the literal completeness value `complete`, and at most 1,000 warnings sorted by deterministic warning ID; each warning and the complete manifest carry their own canonical SHA-256. Because it is inside the evidence descriptor, it remains with the evidence-authority record, named workspace, and workspace backup instead of disappearing with transient review UI. `complete` means the entire warning set emitted under that parser/ruleset contract, not that the parser is correct or the real-world evidence is true, authoritative, or complete. A legacy descriptor may omit the manifest; that absence remains explicit and must never be interpreted as a warning-free or complete review.

The disposition contains no defaults. It requires decision (`admit-unverified`, `reject`, or `withdraw`); claimed origin (`unknown`, `direct-export`, `transferred-copy`, or `other`); nonempty custody note, actor-role claim, rationale, and policy reference; browser-observed UTC instant; and the literal time basis `browser-clock-untrusted`. Those fields are operator claims. `admit-unverified` is the only import decision that can add the reviewed catalog/archive content or open a reviewed workspace backup. Rejection or withdrawal never turns structurally valid content into trusted content. A later withdrawal cannot erase or release content reached by a prior admission. If that scoped content is removed from the active revision, the decision remains historical and reportable without permanently blocking unrelated active content.

## Evidence application record

`EvidenceApplicationRecord` separately binds one decision record and evidence digest to an outcome (`applied` or `not-applied`), a closed reason, bounded detail, the decision's browser time/basis, and its own canonical SHA-256. Source kind, disposition, outcome, and reason must agree: catalog, archive, and workspace-backup application use their matching applied reason; reject and withdraw use their matching non-application reason; capacity/conflict reasons are accepted only for supported source types. An applied record requires both `resultingRevisionId` and `resultingRevisionDigest`; a non-applied record requires both to be null. Creation paths verify that the target revision currently exists and its state digest matches. Snapshot validation rechecks the digest whenever that revision remains among the 20 retained bodies; the stored revision digest remains the binding after normal revision pruning.

The linked outcome preserves explicit refusal, withdrawal, destination conflict, or capacity failure even though no content revision was created. It is still an unkeyed local integrity record, not proof that the decision, reason, actor, or underlying evidence is truthful.

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
| Synthetic | boolean; blocks Public Notice whenever the incident is present, regardless of state |

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

`workspace-manifests` stores name, normalized name, current and optional prior generation numbers, the digest bound to each referenced generation, bytes, domain counts, optimistic token, and timestamps. `workspace-generations` stores immutable payloads keyed by workspace ID plus generation. `workspace-continuity-anchors` stores at most one active continuity-anchor DTO keyed by workspace ID. The anchor is separate from the workspace payload and generations, but it remains in the same origin-scoped IndexedDB, browser profile, device, and local-attacker boundary.

On active open, the manifest timestamp must match the stored generation timestamp; manifest and generation byte counts must match the internally validated serialization; and the manifest name and domain counts must match that payload. A mismatch quarantines the entry. Legacy manifests without a prior-generation digest may still open an internally validated active generation whose digest is bound by the manifest, but the unbound prior generation is never eligible as a fallback or for rotation; storage inspection and reconstruction are required instead of silently trusting it.

Continuity acceptance is a separate explicit action over one exact clean saved generation. The initial acceptance records a browser-observed time, operator-role claim, authority reference, rationale, source kind, optional source payload/anchor digests, and the literal acknowledgment `continuity-not-authenticity-v1`. Its active checkpoint binds generation, exact serialized-payload digest, ledger genesis and terminal hashes, terminal state digest, audit count, and any explicit predecessor-ledger terminal hash. Anchor sequence and previous-anchor/checkpoint fields bind later checkpoint advancement. Acceptance claims are not authenticated identity, authorization, custody, completeness, truth, or trusted time.

Once accepted, a normal verified save advances the anchor only to the immediately following generation and only when the complete old audit is an exact prefix of the new audit. A reset ledger cannot advance the same anchor merely by naming the prior terminal hash; rollover requires a new workspace ID/lineage and separately accepted baseline. The new manifest, generation, and anchor commit in one IndexedDB transaction after the token and prior anchor digest are rechecked. A continuity mismatch blocks ordinary saved output and cannot be silently re-anchored in place. Anchored fallback recovery is not promoted in place; preserve the failed lineage and explicitly establish a new workspace/baseline where recovery policy allows.

An exported receipt is JSON bounded to 16 KiB containing workspace ID, lineage ID, anchor sequence/digest, and the active checkpoint. Receipt generation reads the manifest, referenced generation(s), and anchor in one IndexedDB readonly transaction before exact validation and formatting. Matching it yields only `continuity-corroborated`: equality with the exact supplied receipt. It is unsigned, contains no trusted timestamp or authenticated signer, and becomes stale for current-checkpoint comparison after the anchor advances. It remains useful diagnostic comparison material, but it cannot unlock ordinary outward output or prove operational independence.

Ordinary outward output additionally requires `externalContinuity.status` to be `trusted-match`. The exact saved checkpoint must match an externally signed witness chain, every used key must be active under the exact supplied trust policy, the chain topology and policy terminal must corroborate that checkpoint, and the policy's canonical SHA-256 must equal an expected current digest obtained through a separate institutional trust channel. The signed witness set, policy, and expected digest are supplied at use time; save, rename, and reload clear that process-local proof rather than storing external authority in IndexedDB. A match establishes checkpoint correspondence under the selected policy only. It does not establish that the policy pin was independently obtained or current, nor evidence truth, completeness, custody, authorization, identity, or trusted time.

For authoritative activation, the single-use output lease renders from the reopened saved snapshot and checks the artifact-snapshot digest before and after a final saved-state/fingerprint inspection. The storage layer accepts only the exact digest-bound `File` and its open/download disposition. It then opens one readonly IndexedDB transaction across `workspace-manifests`, `workspace-generations`, and `workspace-continuity-anchors`, rechecks the exact workspace ID, token, generation, payload digest, complete workspace serialization, anchor digest, and complete anchor value, and synchronously offers the file to the browser while that snapshot is held. Writes that began earlier are observed; writes to those stores that begin later wait until the activation request returns. This fence establishes only that the exact bytes were offered while that named local state was unchanged. It cannot prove that the browser or operating system completed a save/open, prevent a later write, or make a downloaded artifact remain current.

Workspace IDs use `crypto.randomUUID`. Tokens use cryptographically random values. They prevent accidental stale-tab overwrite; they do not authenticate a human. `BroadcastChannel` announces manifest changes to other same-origin tabs but does not carry workspace payloads.

## Workspace backup

The v2 JSON envelope accepts exactly:

```text
schema · version · protection · createdAt · payloadDigest · workspace
```

It is limited to 26 MiB. Version 2 requires `protection` to equal `plaintext-json-not-encrypted`; omitting or changing that marker rejects the file. `payloadDigest` is SHA-256 over compact internally validated workspace JSON. Review applies fatal UTF-8, key/depth/array bounds, exact envelope reconstruction, version compatibility, real time, payload digest, complete snapshot validation, revision digests, URLs, archives, services, and audit verification. The successful review is bound in memory to its exact object and decision fields; the UI refuses a cloned, mutated, or substituted review. Legacy version 1 envelopes remain reviewable under their original exact five-field contract and are never rewritten in place.

The file is plaintext. The digest and validation provide internal consistency checking, not encryption, access control, authenticity, authorship, completeness, authority, or custody. It contains the complete bounded workspace payload, including retained evidence-disposition records, but it is not a complete export of browser-local persistence: manifests, generation wrappers, optimistic tokens, the local continuity anchor, and downloaded receipts are excluded. Opening it produces an unverified working copy; persistence still requires an explicit named-workspace create.

A recovery-transition review can seal a bounded record for the exact unchanged process-local backup review and optional continuity material. Its stage is always `source-reviewed-not-activated`; `continuityInherited` and `authorityInherited` are always false; the exact backup file is only `observed-self-recorded-unsigned`; and the prospective destination is always `new-lineage-required`. An unsigned receipt can establish only content correspondence. A signed witness terminal under a supplied matching policy pin can establish checkpoint correspondence under that selected policy, but not raw-backup authenticity or independent policy custody. The review also states that source currency, evidence truth/completeness/custody, trusted time, attachment bytes, a genuinely clean device, and destination persistence are not established. Its own unkeyed record digest can be regenerated and is not external attestation.

The recovery-transition contract does not write IndexedDB, activate the reviewed backup, or provide a clean-device restoration UI. Actual restoration onto a clean device or new origin therefore remains an external/manual controlled procedure: retain the source backup, signed witness/policy material and separately obtained policy digest when available, and the review record; create and validate a separate destination; assign a new workspace ID and lineage; and capture institutional recovery evidence. A newly accepted destination baseline freezes only the reviewed destination state. It does not retroactively authenticate the backup, its evidence, or the old lineage.

## Interoperability evidence bundle

The receiver profile, compatibility package, semantic diff, and run form a directed acyclic evidence chain under a source-controlled fixture manifest. The profile's exchange metadata selects a registered definition and its required cases must exactly equal that definition. The package contains exactly three uniquely named entries—one nonempty payload and exact JSON loss and warning reports. Entry SHA-256 values bind their text bytes; each report is complete under its local schema and binds the payload digest. The package and run carry matching fixture-manifest, build, exporter-profile, media-type, and full-commit claims where applicable. The diff links the exact profile/package and requires unique registered case/path observations with consistent unchanged, loss-like, execution, network, and hazard classifications.

Assessment reconstructs and validates every DTO, derives required cases from the source-controlled exchange definition, and returns one of `INVALID_RECORD`, `VERSION_OBSOLETE`, `FAILED`, `BLOCKED`, `INCOMPLETE`, or `RECORDED_PASS`. A pass requires exact observation coverage, a result and retained-evidence reference for every case, a required re-export descriptor, matching report details/classifications, and no declared or unexpected loss or hazard. Unexpected loss or hazard derives `FAILED`. Declared loss remains `INCOMPLETE` because the current manifest defines no allowed-loss policy. Raw-text entry points reject oversized input, duplicate decoded JSON members, and lone Unicode surrogates before semantic parsing; malformed current pins derive `INVALID_RECORD` rather than rejecting the assessment promise.

The status establishes only internal consistency of the supplied digest-bound claims. The unkeyed hashes do not prove who created a record; evidence-reference strings do not embed or authenticate external artifacts; and a recorded re-export digest does not prove custody of those bytes. No state proves that a receiving-product execution occurred, that observations are true, or that an operator or institution accepted the result.

## Retention and deletion semantics

The software’s 20 revisions, two IndexedDB generations, 5,000 evidence-disposition records, and 5,000 audit events are technical caps, not institutional retention rules. Deleting a named workspace deletes its manifest, generations, and local continuity anchor in the current origin. It does not erase the open working copy until replaced, downloaded receipts, exported files, browser/device backups, receiving-system copies, or platform HTTP metadata.
