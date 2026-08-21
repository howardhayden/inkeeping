# ADR 0004: Fail-closed import quarantine

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

Library exchange files can be malformed, oversized, ambiguous, namespace-confused, structurally hostile, formula-leading, or lossy under a crosswalk. Partially accepting such files would make omissions difficult to detect and would turn an interoperability limitation into apparently successful data.

## Decision

Every selected file passes byte, MIME/extension, fatal UTF-8, allocation, structure, exact DTO, cardinality, value, and semantic checks before it can enter a workspace. XML receives a linear bounded pre-DOM scan and exact namespace/structure validation. Tagged-line formats reject malformed lines. BibTeX uses a bounded parser and rejects unsupported macros/concatenation. Arrays and records over a cap are rejected rather than sliced.

Review is nonmutating and presents complete accessible **Original input** and **New output** blocks. Apply revalidates source binding, normalized records, findings, destination conflicts, hierarchies, and complete-set invariants before constructing one successor revision.

## Consequences

- Some files accepted by permissive tools are intentionally rejected.
- Crosswalks must name unsupported or lossy constructs; adding “best effort” parsing requires a new decision.
- Operator review is necessary but not a substitute for parser bounds.
- Receiving-system compatibility is claimed only for retained test evidence and identified software/profile versions.
- Performance fixes cannot silently truncate evidence.

## Verification

- Exact-limit and one-over tests cover catalog, XML, archival, service, storage, and report boundaries.
- Round-trip tests cover accepted normalized record types and lossless packages.
- Malformed XML, RIS, MARC, BibTeX, delimited data, unknown fields, prototype keys, and namespace conflicts have rejection fixtures.
- Mutation tests establish that review/rejected apply preserve the previous active revision.
