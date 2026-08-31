# Contributing

IN KEEPING treats metadata correctness, reversibility, accessibility, privacy, and honest interoperability claims as release requirements.

## Before proposing a change

1. Open an issue using synthetic or redacted data unless the change is a privately reported vulnerability.
2. Name the affected librarian workflow and authoritative system boundary.
3. State whether storage, interchange, security, privacy, accessibility, or report projection changes.
4. For a new format, cite the governing specification and provide hostile, maximum-boundary, and round-trip fixtures.

## Implementation rules

- No remote import, background workspace upload, analytics, cookie, or credential path without an approved architecture decision and privacy review.
- Untrusted input remains outside workspace state until review and apply-time validation both succeed.
- Do not silently truncate, coerce, drop, or infer accepted source data. Reject loss or expose it as a blocking finding.
- Public Notice remains a fixed allowlist projection; it is not a private object with fields deleted afterward.
- New UI state must have text, keyboard behavior, visible focus, reflow, and non-color status.
- Schema and storage changes require compatibility fixtures, migration behavior, rollback limits, and documentation.
- Claims such as “conformant,” “compatible,” or “accessible” require retained evidence at the claimed level.

## Required evidence

Run:

```sh
npm ci
npm run release:check
git diff --check
```

Update the changelog, affected documentation, risk register, traceability matrix, and validation report. Manual/browser evidence belongs in a dated release record and must identify the browser, assistive technology or receiving software, version, task, expected result, and outcome.

## Pull requests

Use the repository template. Keep commits reviewable, do not bypass branch protection, and do not add secrets or real restricted records. GitHub Actions must be pinned to immutable full commit SHAs. Dependency changes must update the lockfile and pass dependency review.

## Contribution licensing

By submitting a contribution, you represent that you have the right to submit it and agree to license it under the written terms governing the affected material in [LICENSING.md](LICENSING.md). Current software and mixed source files are source-available for noncommercial use under PolyForm-Noncommercial-1.0.0; separable original documentation and media use CC-BY-NC-SA-4.0. Commercial use requires a separate written license. Third-party material must retain its original notices and terms.

## Licensing of contributions

This source-available repository is not accepting unsolicited code, content,
design, workflow, or data pull requests. Issue reports may be opened without
transferring copyright.

A substantive contribution is accepted only after written terms preserve the
maintainer's ability to license it consistently with the repository, including
under a separate commercial license. Do not submit employer-, client-, school-,
team-, or third-party-owned material without documented authority.

Accepted engineering changes must preserve genuine engineering evidence through:
`issue → constraint → design decision → implementation → failed test → correction → verification`.
