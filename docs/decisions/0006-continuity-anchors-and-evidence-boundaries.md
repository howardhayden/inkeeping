# ADR 0006: Continuity anchors and evidence boundaries

- **Status:** Accepted
- **Date:** 2026-08-31

## Context

Revision, state, event, generation, and backup digests detect defined internal inconsistency. By themselves they cannot distinguish a retained history from a wholly regenerated history whose content and every internal digest were replaced coherently. Structural parser success has a parallel limit: fabricated but internally valid evidence can satisfy syntax without becoming truthful, authoritative, or complete. Outward artifact checks also need to apply to the exact saved generation at the moment the operator activates a file, rather than relying on a cached cross-tab notification.

These are three related but different boundaries:

1. continuity asks whether current saved bytes extend a previously accepted checkpoint;
2. evidence disposition records what an operator decided about structurally reviewed input without upgrading that input to verified truth; and
3. output freshness asks whether the exact saved generation used to build an artifact remained current until file activation.

The application has no authenticated user, signature key, trusted clock, remote transparency service, institutional authority registry, or external evidence-custody system. The design must therefore use terms and statuses that do not imply those capabilities.

## Decision

### IndexedDB v3 and explicit local continuity anchors

IndexedDB database version 3 adds `workspace-continuity-anchors`, keyed by workspace ID, beside the existing manifest and generation stores. Upgrade creates the empty store only. It does not create an anchor for an existing workspace, infer acceptance from an intact hash chain, or silently re-anchor a failed lineage.

An operator may explicitly accept one exact clean saved generation as the local baseline. Acceptance records browser-observed time, role and authority-reference claims, rationale, source kind and optional source digests, plus the exact acknowledgment `continuity-not-authenticity-v1`. The version-1 anchor binds workspace and lineage IDs, monotonic anchor sequence, prior anchor digest, initial acceptance, active/previous checkpoints, and its canonical SHA-256. A checkpoint binds generation, exact payload digest, ledger genesis and terminal hashes, terminal state digest, audit count, and any explicit predecessor-ledger terminal hash.

After acceptance, a normal save may advance the anchor only to the next saved generation. Advancement requires the anchored prior workspace to verify and the new audit to contain the entire old audit as an exact prefix. A predecessor-hash claim in a reset ledger is not successor proof and cannot advance the same anchor. Ledger rollover creates a new workspace ID/lineage whose baseline and receipt must be separately accepted and corroborated. The transaction rechecks manifest token and prior anchor digest, then commits generation, manifest, and advanced anchor together. A changed, missing, malformed, cross-workspace, replayed, or unrelated anchor fails closed. A failed lineage cannot be silently re-anchored in place, and anchored recovery from an older fallback must become a separately accepted lineage rather than overwrite the failed one.

The local anchor is separate from workspace/generation payloads but not independent of the browser-local threat boundary: it remains in the same origin, IndexedDB database, profile, and device. An actor able to rewrite every local store can replace the workspace and anchor coherently.

### Independently held unsigned receipt

The operator may explicitly download a version-1 JSON receipt containing the workspace ID, lineage ID, anchor sequence/digest, and exact active checkpoint. Comparison is strict and current-state-specific. A stale receipt, cross-workspace receipt, altered checkpoint, or replay against another anchor fails. A matching independently supplied receipt yields only `continuity-corroborated`; ordinary local checkpoint equality yields `continuity-verified-local`. Neither status contains an authenticity claim.

The receipt is unsigned. It has no authenticated issuer, trusted timestamp, transparency-log inclusion proof, revocation service, custody record, or nonrepudiation property. Its additional detection value exists only when a receipt exported before the suspected rewrite remains unchanged outside the same browser-local failure and administrative domain. The application cannot verify that independence. A receipt retained only beside the database—or a fabricated receipt first presented with fabricated storage—does not defeat coherent replacement. A receipt becomes stale for exact-current comparison after an anchored save, so current corroboration requires a newly retained receipt.

### Evidence authority is a disposition record, not verified authority

Workspace payloads may retain up to 5,000 version-1 `in-keeping/evidence-authority-decision` records. Each record canonically binds source filename/format/bytes/digest, parser profile and canonical reviewed payload digest, explicit entity scope, and one complete operator disposition. The disposition has no defaults: decision, claimed origin, custody note, actor-role claim, rationale, policy reference, browser-observed instant, and literal `browser-clock-untrusted` basis are required.

The available decisions are `admit-unverified`, `reject`, and `withdraw`. Each recorded decision has at most one exact `in-keeping/evidence-application-outcome`: `applied` or `not-applied`, a source- and outcome-specific reason, detail, and—only when applied—the resulting revision ID and revision-state digest. Destination conflict, capacity refusal, rejection, and withdrawal therefore preserve both the submitted decision and non-application result. Only `admit-unverified` can place reviewed import content into a revision or open a reviewed backup into the working session. The derived status is correspondingly `operator-admitted-unverified`, never trusted, verified, or authoritative. A structurally valid fabricated source can still receive such a record; the record exposes and binds the human claim instead of proving it.

The ordinary-output barrier is derived from active provenance reachability, not a permanent global latch. Historical decisions remain in reports. A failed/non-applied decision or an admission whose scoped entities no longer exist does not block unrelated active content. A withdrawal does not erase or release content reached by an earlier admission, and manually entered archive/service content remains unattributed because those models have no source-level authority binding.

### Click-time output freshness lease

Ordinary outward actions acquire a process-local output lease at click time. The lease reopens the named workspace, validates its exact snapshot, checks workspace ID/token, rejects recovery generations, compares saved-state digest, terminal audit hash, active revision, and session state, and requires `continuity-corroborated` from the exact independently supplied current receipt. The receipt string is retained only in the active UI session and is supplied to both storage reads; React status alone cannot satisfy the gate. Save, rename, and reload clear the proof. It also blocks active admitted-unverified evidence and unattributed catalog, archive, or service content. Artifact construction uses the reopened saved snapshot, not a potentially divergent working object.

After asynchronous rendering and immediately before synchronous Blob/download or window activation, the lease reopens storage again and compares a fingerprint containing workspace identity, token, payload digest, generation/recovery state, state digest, terminal audit hash, active revision, saved-copy state, continuity-anchor digest/status, and evidence gate. A session-version or fingerprint change stops without activating a file. This closes the ordinary cached-notification race for supported UI paths; it is not a lock on IndexedDB, a guarantee about previously downloaded files, or an authorization boundary for direct reuse of lower-level serializers.

Diagnostic Technical Reports may render an unsaved or stale working copy only with explicit saved-copy/continuity limitations and the same session-race checks. The implementation's internal mode name `authoritative` means “ordinary output requiring the strict lease”; it must not be presented as institutional authority, evidence truth, publication approval, or authenticity. A receipt comparison must be current for the exact generation at each ordinary-output click-time lease. The application cannot prove that the supplied receipt was independently held or that its accepted baseline was truthful.

### Backup and clean-device boundary

Workspace backup v2 contains the complete bounded workspace payload, including evidence-disposition records, but excludes IndexedDB manifests, generation wrappers, optimistic tokens, the local continuity anchor, and independently downloaded receipts. It is therefore not a complete export of browser-local continuity state.

Opening a backup creates an unsaved working copy only after exact review-object binding, full workspace validation, and explicit `admit-unverified` disposition. Creating it as a named workspace on a clean device or different origin assigns a new workspace ID and begins unanchored. The old receipt is not imported as the new anchor and cannot prove uninterrupted application-verified lineage across that transition. Operators must preserve the source backup and receipt under approved external governance, reconcile the transition, explicitly accept a new baseline, and retain a new receipt. The new baseline does not retroactively authenticate the restored evidence.

## Consequences

- A regenerated workspace fails against an unchanged local checkpoint; coherent replacement of every browser-local store remains possible.
- An independently held receipt can expose that local co-replacement only under the stated operational-independence condition; it is not a signature or authenticity proof.
- Existing version-2 databases upgrade without data loss but every pre-existing workspace remains visibly unanchored until explicit acceptance.
- Save, open, delete, clear, and storage-upgrade paths must include the anchor store where applicable. Deleting a named workspace deletes its local anchor but cannot recall a downloaded receipt.
- Ordinary outward artifacts require an exact current saved generation, exact current receipt corroboration, and no active unverified or unattributed content. This protects a defined saved-state relationship without granting institutional authority.
- Backup portability preserves the workspace payload but not local continuity identity. Clean-device restoration is a governed lineage transition, not silent continuity.
- Browser clocks, role/reference fields, evidence dispositions, and baseline acceptance remain claims. Authenticity, custody, authorization, chronology, completeness, publication approval, and nonrepudiation require external systems and accountable review.

## Verification

- `tests/continuity-anchor.test.mjs` covers canonical anchor validation, regenerated-history mismatch, cross-workspace substitution, exact-prefix advancement, unrelated saves, acceptance bounds, and stale/replayed receipts.
- `tests/lab-storage.test.mjs` covers version-3 storage creation, explicit baseline acceptance, atomic anchor advancement, co-replacement detection boundaries, no silent re-anchor, receipt comparison, and anchor deletion.
- `tests/evidence-authority.test.mjs` covers exact no-default dispositions, canonical bindings, fabricated-but-valid unverified status, mutation rejection, conservative withdrawal/rejection, and cross-evidence substitution.
- `tests/output-freshness.test.mjs` covers initial click-time verification, exact saved-snapshot rendering, delayed concurrent changes, second recheck, continuity failure, evidence gates, and diagnostic-state disclosure.
- Interface and report contract tests preserve operator-facing acknowledgment, independent-receipt language, output gate use, and explicit authenticity/completeness limits.
- Clean-device restoration, independent receipt custody, warning comprehension, institutional reconciliation, and external authority review remain manual or external evidence.
