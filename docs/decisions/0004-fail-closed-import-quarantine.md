# ADR 0004: Fail-closed import quarantine

- **Status:** Accepted; evidence-authority boundary refined by [ADR 0006](0006-continuity-anchors-and-evidence-boundaries.md)
- **Date:** 2026-08-20

## Context

Library exchange files can be malformed, oversized, ambiguous, namespace-confused, structurally hostile, formula-leading, or lossy under a crosswalk. Partially accepting such files would make omissions difficult to detect and would turn an interoperability limitation into apparently successful data.

## Decision

Every selected file passes byte, MIME/extension, fatal UTF-8, allocation, structure, exact DTO, cardinality, value, and semantic checks before it can enter a workspace. Catalog, archive-package, backup, receipt, and versioned-tabular JSON receives a pre-parse decoded-member/Unicode-scalar scan. XML receives a linear bounded pre-DOM scan and exact namespace/structure validation. Tagged-line formats reject malformed lines and contradictory singular identities while preserving format-defined repeatable identifiers. BibTeX uses a bounded parser, recognizes percent comments terminated by CR, LF, or CRLF, and rejects unsupported macros/concatenation. JSON-LD and CSL dispatch and identity carriers are profile-bound. Arrays and records over a cap are rejected rather than sliced.

Review is nonmutating. Catalog review presents complete accessible **Original input** and **New output** blocks. Archive and service records have no retained per-record original-source version; Technical Report views therefore distinguish **Entered active values** from the **Canonical active record**. A successful catalog or archival review is bound in memory to that exact object and every decision field. Apply rejects clones, mutations, or coherently substituted reviews, then revalidates destination conflicts, shapes, hierarchies, and complete-set invariants before constructing one successor revision. Passing these checks never grants authority: a catalog, archive, or restored-backup review requires an explicit evidence disposition, and `admit-unverified` remains an ordinary-output blocker under ADR 0006.

## Consequences

- Some files accepted by permissive tools are intentionally rejected.
- Crosswalks must name unsupported or lossy constructs; adding “best effort” parsing requires a new decision.
- Operator review is necessary but not a substitute for parser bounds.
- Exact review binding prevents post-review substitution but cannot prove that fabricated, internally consistent input is truthful, authentic, or complete.
- Receiving-system compatibility is claimed only for retained test evidence and identified software/profile versions.
- Performance fixes cannot silently truncate evidence.

## Verification

- Exact-limit and one-over tests cover catalog, XML, archival, service, storage, and report boundaries.
- Round-trip tests cover accepted normalized record types and lossless packages.
- Malformed XML, raw JSON member/scalar ambiguity, deceptive JSON-LD/CSL dispatch, contradictory RIS/MARC/MODS/DC/EAD identities, BibTeX line endings/grammar, delimited data, unknown fields, prototype keys, and namespace conflicts have rejection fixtures.
- Mutation tests establish that review/rejected apply preserve the previous active revision.
