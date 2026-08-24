# Workflow licensing boundary

The repository's default noncommercial software terms apply to the
copyrightable implementation and expression of:

- hostile-file intake, bounded parsing, quarantine, comparison, review, and explicit apply
- catalog and archival normalization, schema, crosswalk, provenance, and loss-reporting workflows
- workspace creation, explicit persistence, revision, audit-link, concurrency, backup, and recovery
- operating-register, incident, decision, rollback, continuity, and institutional-handoff workflows
- Technical Report, Public Notice, inventory, matrix, ticket, postmortem, and runbook generation
- the authored field models, safeguards, labels, diagrams, test fixtures, and traceability contracts

The boundary is based on **task and product workflows**, not on an attempt to
claim every programming technique inside them. A small or general-purpose
function remains under the license of its containing file unless deliberately
extracted and separately licensed.

## No current permissive carve-outs

`LICENSE-MAP.json` contains an empty `permissive_exceptions` list. Function-level
mixed licensing is hard to audit and easy to misread. A reusable utility must
first become a separate, self-contained module with independent tests and an
explicit SPDX notice.

## Legal boundary

Copyright generally protects source expression, authored text, diagrams,
selection and arrangement, and other original expression; it does not by itself
create exclusive ownership of abstract ideas, methods, systems, facts, or
functionality.
