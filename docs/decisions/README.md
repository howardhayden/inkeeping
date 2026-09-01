# Architecture decision records

These records preserve decisions that constrain production operation, storage, privacy, and recovery. They describe the accepted repository state; a later implementation that contradicts one requires a superseding ADR and the corresponding security, privacy, data, deployment, testing, and review updates.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-binding-free-static-production.md) | Accepted | Production is binding-free Cloudflare Workers Static Assets |
| [0002](0002-single-canonical-origin.md) | Accepted | One canonical HTTPS origin owns browser-local persistence |
| [0003](0003-manifest-bound-two-generation-storage.md) | Accepted | Saves retain manifest-bound active/prior generations and recovery is non-destructive |
| [0004](0004-fail-closed-import-quarantine.md) | Accepted | Untrusted exchange files remain in bounded quarantine until explicit apply |
| [0005](0005-no-application-telemetry.md) | Accepted | Production has no application telemetry or workspace-content network path |
| [0006](0006-continuity-anchors-and-evidence-boundaries.md) | Superseded by 0007 | Introduced local continuity anchors, unsigned receipts, evidence dispositions, and a two-read output lease |
| [0007](0007-signed-continuity-and-activation-fences.md) | Accepted | Signed external witnesses, separately pinned trust policy, durable warning provenance, and a final activation fence narrow regenerated-history and saved-state races |

## Format

Each ADR records status, date, context, decision, consequences, and verification. ADRs are append-only decision history: do not rewrite an accepted decision to conceal a change. Mark it superseded and link the replacement.
