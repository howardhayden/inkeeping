# ADR 0003: Manifest-bound two-generation storage

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

A browser-local tool needs bounded recovery from an interrupted or invalid save without hiding corruption, silently choosing unrelated bytes, or growing unbounded history. Opening suspect storage must not destroy the evidence needed for diagnosis or salvage.

## Decision

Each named workspace has one manifest and immutable generation records in IndexedDB v2. A normal save validates the complete workspace/audit, enforces size/quota, hashes the serialized payload, checks the optimistic token, and commits the new generation plus manifest atomically. The manifest binds the active generation digest and, when present, the retained prior generation digest.

An active-generation/manifest digest disagreement stops open and never falls back. A prior generation can open only when its digest is manifest-bound and its complete payload verifies; it opens as an unsaved recovery copy without rewriting or deleting stored generations.

Invalid manifests and orphan/unreferenced generations are explicit quarantine entries. Bounded inspection verifies one selected candidate. Reconstruction rereads the candidate, rechecks its expected digest and complete state, creates a new UUID/name, and leaves the quarantined source unchanged.

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
