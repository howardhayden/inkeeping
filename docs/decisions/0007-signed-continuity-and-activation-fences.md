# ADR 0007: Signed continuity and activation fences

- **Status:** Accepted
- **Date:** 2026-09-01
- **Supersedes:** [ADR 0006](0006-continuity-anchors-and-evidence-boundaries.md) for ordinary-output continuity and click-time activation

## Context

ADR 0006 introduced local anchors, unsigned checkpoint receipts, unverified evidence dispositions, and a two-read output lease. Red-team attacks demonstrated two remaining authority-shaped failures. First, an actor who coherently replaced the workspace, local anchor, and unsigned receipt could present a fully regenerated history that passed every browser-local digest. Second, a read followed by file activation left a commit window between the final saved-state observation and the synchronous browser activation request; accepting an opaque callback also allowed asynchronous work to escape the intended fence.

Parser review had a related semantic gap. Structurally valid fabricated evidence remained admissible without a durable, exact-source record of every parser warning. Recovery and interoperability observations also needed machine-checkable records that could not be mistaken for restoration, product certification, or institutional approval.

## Decision

### External signed continuity

Local anchors and unsigned receipts remain diagnostic comparison material. They cannot unlock ordinary outward output.

Ordinary output requires a versioned external witness set and trust policy. Each P-256 signed witness canonically binds the workspace, lineage, branch and origin; sequence and predecessor witness; current local-anchor digest; saved generation and workspace digest; and exact audit genesis, terminal hash, terminal state digest, count, and predecessor-ledger hash. Verification rejects malformed signatures and keys, unknown or revoked keys, duplicate or missing sequence positions, forks, truncation, disconnected roots, origin or scope splices, terminal conflicts, and policy-terminal disagreement. Input order and the untrusted browser clock do not choose the chain.

The trust policy is not self-authorizing. Verification requires the exact SHA-256 digest of the expected policy, operationally obtained through a separately governed channel. A missing or substituted pin fails distinctly; the application cannot establish that the supplied pin was independently obtained or remains current. A successful result means only that the exact saved checkpoint corresponds to the signed terminal under the selected pinned policy. It does not establish source truth, completeness, custody, signer authority, trusted time, or institutional approval. Version-1 witness signatures do not bind a particular policy ID or revision, so a later exactly pinned policy that reuses the key and terminal can reauthorize an earlier witness. Key issuance, policy semantics, policy-digest distribution, revocation operations, and durable witness retention remain external.

### Complete warning provenance

Every newly reviewed catalog, archival, or backup source carries a canonical warning manifest bound to the exact source digest and parser profile. Stable warning identities bind code, entity, occurrence, and detail; the manifest binds the complete sorted set and its ruleset digest. Removing, rewriting, reordering to change occurrence identity, or attaching the warnings to another source/parser invalidates the evidence record. Legacy evidence without a warning manifest remains visibly legacy; the application does not invent a complete history for it.

The manifest proves only correspondence between a parser run, its exact source, and the warnings the implemented rules emitted. It does not prove parser correctness, semantic truth, authenticity, completeness of the source, or resolution by an operator.

### Recovery-transition review

A reviewed backup may produce a strict recovery-transition review record. The record preserves the actual backup envelope version and protection marker, exact raw and payload bindings, parser profile, audit checkpoint, and any supplied continuity material. Its stage is always `source-reviewed-not-activated`; continuity and authority are never inherited; and a destination must use a new lineage.

An unsigned receipt can record exact content correspondence only. A signed terminal can record correspondence under the exact supplied policy pin. The review record cannot activate or persist a destination workspace, cannot prove that a policy pin was independently obtained, and cannot establish raw-backup authenticity, source currency, custody, trusted time, attachment recovery, clean-device conditions, or durable destination storage. Those claims require a separately observed recovery drill and governed records.

### Interoperability evidence records

Receiver profiles, compatibility packages, semantic diffs, and run records use strict, acyclic, exact-digest DTOs. Bundle assessment derives the required cases from the validated receiver profile and distinguishes invalid, obsolete, failed, blocked, incomplete, and recorded-pass evidence. A recorded pass requires observations for every required case and no unrecorded loss or hazard.

`RECORDED_PASS` means only that the supplied operator evidence is internally complete for the exact profile, fixture, build, and commit. It is not certification of a named receiving product. A real product/version run, operator identity, acceptance decision, and retained external evidence remain external.

### Single-use output activation fence

The ordinary-output broker acquires one process-local, single-use lease for the exact clean named saved generation. It verifies the signed external terminal and separately supplied policy digest, active evidence state, workspace identity, token, payload and state digests, audit head, revision, anchor, and artifact bytes. The artifact is constructed as an immutable `File` before final activation and is digested both before and after the second saved-state read.

Final activation runs inside one readonly IndexedDB transaction spanning the manifest, generation, and continuity stores. The storage API accepts only the exact digest-bound `File` and its open/download disposition; it exposes no arbitrary callback. The transaction rechecks the exact workspace, generation, token, payload, metadata, and anchor, then invokes the browser activation primitive synchronously before releasing its read lock. A writer committed before the transaction is observed and causes failure; a later writer is queued until the activation request completes. The lease is consumed before asynchronous work so it cannot be reused or activated concurrently.

This fence prevents a later IndexedDB writer from committing between final saved-state verification and the synchronous browser activation request. It does not prove that the browser or operating system saved or opened the file, prevent a write after the request returns, provide continuing freshness, govern an already downloaded file, or authorize publication.

## Consequences

- Fully regenerated browser-local histories and unsigned receipts no longer satisfy the ordinary-output continuity gate by themselves.
- A substituted trust policy cannot authorize itself; operations must distribute and retain the expected current policy digest separately.
- Parser warnings become durable, exact-source evidence, while fabricated but structurally valid input remains explicitly unverified.
- Recovery review cannot silently become restoration or inherited continuity. A real destination transition remains a new-lineage operational act.
- Interoperability records can be checked for internal completeness without converting them into third-party certification.
- Supported ordinary UI paths have a narrower saved-state-to-activation race. Browser/OS completion, later currency, human approval, and direct low-level transformer use remain outside the fence.

## Verification

- `tests/external-continuity.test.mjs` covers exact terminal verification, policy substitution, deletion, truncation, duplication, forks, origin splices, key status, signature failure, and input/clock reordering.
- `tests/lab-storage.test.mjs` covers exact signed checkpoint matching and the three-store final transaction, including earlier and queued-later writers.
- `tests/output-freshness.test.mjs` covers external-continuity failures, single-use activation, artifact mutation, second-read mutation, and final-fence failure.
- `tests/evidence-authority.test.mjs`, `tests/lab-core.test.mjs`, and `tests/archival-schemas.test.mjs` cover complete warning bindings, fabricated inputs, parser-identity contradictions, and cross-carrier collisions.
- `tests/recovery-transition.test.mjs` covers non-activation, new-lineage requirements, unsigned and signed correspondence, pin mismatch, exact capability binding, and fully regenerated internal review records.
- `tests/interoperability-evidence.test.mjs` covers the four-record digest chain, missing or swapped material, required-case derivation, and conservative result states.
- Browser/OS download completion, real clean-device recovery, separately governed policy distribution, institutional signing/revocation, named receiving-product acceptance, and second-operator replay remain manual or external evidence.
