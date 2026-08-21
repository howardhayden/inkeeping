## Change

Describe the operational problem, affected workflows, and why this change belongs in IN KEEPING.

## Boundaries

- [ ] No application data transmission, new storage, remote import, analytics, cookie, or credential path was introduced.
- [ ] Import/export and receiving-system claims remain no stronger than the retained evidence.
- [ ] Public Notice remains a fixed allowlist projection.
- [ ] UI and report changes preserve keyboard order, reflow, labels, and non-color status cues.

## Evidence

- [ ] `npm run release:check` passes.
- [ ] New behavior has deterministic automated coverage.
- [ ] Manual or external validation evidence is linked where automation cannot establish the claim.
- [ ] Documentation, change log, and affected traceability rows are updated.

## Recovery

State the rollback method, schema/interchange compatibility effect, and any required operator action.
