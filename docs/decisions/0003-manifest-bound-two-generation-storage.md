# ADR 0003: Manifest-bound two-generation storage

- **Status:** Accepted
- **Date:** 2026-08-20

> **Supersession note (2026-08-31):** ADR 0006 supersedes only this record's IndexedDB version-2 schema detail by adding a version-3 continuity-anchor store and atomic anchor advancement. The manifest-bound active/prior generation and non-destructive recovery decision below remains accepted as historical decision context.

## Context

A browser-local tool needs bounded recovery from an interrupted or invalid save without hiding corruption, silently choosing unrelated bytes, or growing unbounded history. Opening suspect storage must not destroy the evidence needed for diagnosis or salvage.

## Decision

Each named workspace has one manifest and immutable generation records in IndexedDB v2. A normal save validates the complete workspace/audit, enforces size/quota, and hashes the serialized payload. Before opening the write transaction, it re-reads and internally validates both the manifest-bound active generation and the prior generation that rotation would delete. Inside the transaction it rechecks the optimistic token before committing the new generation plus manifest. The manifest binds the active generation digest and, when present, the retained prior generation digest. Opening also requires the manifest timestamp to match the stored generation timestamp, both byte counts to match the validated serialization, and the manifest name and domain counts to match the payload. A failed base, digest, metadata, or token check leaves all stored generations in place or quarantines the entry.

An active-generation/manifest digest disagreement stops open and never falls back. A prior generation can open only when its digest is manifest-bound and its complete payload passes full internal validation; it opens as an unsaved recovery copy without rewriting or deleting stored generations. Saving that recovery copy into the same slot first confirms the active remains invalid without a digest disagreement, revalidates the fallback, requires byte-identical submitted content, and rechecks the token and selected recovery generation inside the transaction.

Invalid manifests and orphan/unreferenced generations are explicit quarantine entries. Bounded inspection checks one selected candidate for internal consistency. Reconstruction rereads the candidate, rechecks its expected digest and complete state, creates a new UUID/name, and leaves the quarantined source unchanged. Neither validation nor reconstruction proves authenticity, custody, authority, or evidentiary completeness.

## Consequences

- Only active plus one prior generation are retained during normal operation; this is not institutional backup or retention.
- Optimistic tokens prevent accidental stale-tab overwrite but do not authenticate an operator.
- Recovery is visible and requires deliberate export/save/reconstruction.
- Legacy manifests may upgrade through a normal save, but an unbound legacy fallback is never trusted.
- Browser loss, eviction, origin change, and downloaded-file handling remain operator/institution responsibilities.

## Verification

- `tests/lab-storage.test.mjs` exercises digest mismatch, bound/unbound fallback, transaction failure, tokens, exact inspection caps, candidate verification, reconstruction, and source preservation.
- Workspace-backup tests enforce a versioned plaintext envelope and complete validation.
- Quarterly synthetic drills cover bound-prior recovery and quarantine reconstruction.
