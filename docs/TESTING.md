# Testing and release evidence

## Policy

Tests establish repeatable evidence for specific requirements. They do not establish that all defects are absent, that a mapping is institutionally correct, that a live deployment matches source, or that the interface is accessible in every user agent.

Source and tests change together. A parser, storage, report, public projection, response policy, or data-limit change is incomplete until its positive, negative, and exact-boundary behavior is represented in tests and linked from [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md).

## Supported toolchain

- Node.js 22.13 or later, enforced by `package.json` engines.
- Exact package versions and the committed npm lockfile.
- TypeScript 5.9 across application, worker/checkpoint adapter, and tooling configurations.
- Node's test runner with experimental TypeScript stripping.
- `fake-indexeddb` for deterministic IndexedDB behavior.
- `@xmldom/xmldom` in the Node test environment for XML DOM behavior.
- Vite production builds and Wrangler strict dry runs.

Browser engines, operating systems, assistive technologies, Cloudflare live delivery, third-party archival/catalog products, and spreadsheet behavior require external validation; they are not simulated by the unit runner.

## Commands

Install exactly the lockfile:

```sh
npm ci
```

Run the complete production acceptance gate:

```sh
npm run release:check
```

The gate expands to:

1. `npm run lint`
2. `npm run typecheck`
   - `typecheck:app`
   - `typecheck:worker`
   - `typecheck:tools`
3. `npm test`
   - verified static production build
   - complete `tests/*.test.mjs` unit/contract run
4. `npm run audit:dependencies` using `npm audit --audit-level=high`
5. `npm run validate:cloudflare`
6. `npm run deploy:dry-run` using strict Wrangler deployment validation

The first failure stops the release command. A release record must preserve command, UTC time, commit SHA, environment, exit status, test totals, and relevant artifact/log locations. [`VALIDATION_REPORT.md`](VALIDATION_REPORT.md) records its identified historical candidate; current adversarial working-tree evidence is recorded separately in [`RED_TEAM_REGISTER.md`](RED_TEAM_REGISTER.md). Neither substitutes for an immutable release record.

The dry-run command is a no-upload packaging, configuration, and binding check. Its wrapper re-executes with repository-local writable `HOME`, `XDG_CONFIG_HOME`, and `TMPDIR` directories, disables Wrangler metrics and log writes, and removes inherited network proxies for that mode. Wrangler then runs with `--autoconfig=false --strict --dry-run --outdir dist/wrangler-dry-run`, so the result does not depend on a developer machine's global Wrangler configuration or proxy settings. This does not validate a Cloudflare account, DNS, TLS, or live response behavior. Preview and production deployment commands retain their authenticated network environment.

Focused commands are useful during development but do not replace `release:check`:

```sh
node --experimental-strip-types --test tests/lab-core.test.mjs
node --experimental-strip-types --test tests/lab-storage.test.mjs tests/list-pagination.test.mjs tests/workspace-backups.test.mjs
node --experimental-strip-types --test tests/json-safety.test.mjs tests/continuity-anchor.test.mjs tests/evidence-authority.test.mjs tests/output-freshness.test.mjs
```

## Test-suite inventory

The current source tree contains these suites; counts are test declarations and can change as the candidate changes.

| Suite | Current declarations | Principal evidence |
| --- | ---: | --- |
| [`tests/lab-core.test.mjs`](../tests/lab-core.test.mjs) | 64 | Workspace mutation, bound catalog/archive review and evidence decision/application outcomes, active-provenance assessment, exact XML/JSON quarantine, cross-format parser identity/cardinality, all catalog exchanges, rollover/tamper, incident closure, linear revisions |
| [`tests/archival-schemas.test.mjs`](../tests/archival-schemas.test.mjs) | 33 | Custom schemas/record types, archive-package JSON safety, document/agency/reference/repository identity, EAD 4/EAD3/EAD 2002 loss preflight, CSV, hierarchy/limits, hostile structures, round trips |
| [`tests/documentation-contracts.test.mjs`](../tests/documentation-contracts.test.mjs) | 6 | Required document set, local-link integrity, hostile-import traceability, backup/interface language, licensing/red-team claims, continuity/evidence/freshness boundaries |
| [`tests/interface-contracts.test.mjs`](../tests/interface-contracts.test.mjs) | 15 | Source/CSS contracts for scrolling, drafts, paging, closure, statuses, shared freshness/evidence/continuity output gates, quarantine UI, named workspaces |
| [`tests/lab-storage.test.mjs`](../tests/lab-storage.test.mjs) | 23 | DB-v3 migration/save, token and anchor conflicts, two generations, continuity baseline/advance/regeneration/co-rewrite receipt, recovery/quarantine/reconstruction/deletion |
| [`tests/report-documents.test.mjs`](../tests/report-documents.test.mjs) | 20 | Static report contracts, generator self-validation, continuity/evidence disclosures, withdrawal laundering, sample/closure/Public Notice gates, capacity and escaping |
| [`tests/workspace-backups.test.mjs`](../tests/workspace-backups.test.mjs) | 11 | v2 marker/v1 compatibility, raw JSON safety, exact envelope/state, bound capability, non-JSON collision, hostile keys, size/MIME/UTF-8/time boundaries |
| [`tests/continuity-anchor.test.mjs`](../tests/continuity-anchor.test.mjs) | 10 | Explicit baseline, regenerated history, exact-prefix extension, forged-reset rejection, strict DTOs, receipt JSON safety, stale/cross-workspace receipts, continuity/authenticity separation |
| [`tests/evidence-authority.test.mjs`](../tests/evidence-authority.test.mjs) | 9 | No-default dispositions, exact DTO/digests, copied/tampered claims, fabricated evidence remains unverified, conservative withdrawal status, source-specific application outcomes and revision binding |
| [`tests/json-safety.test.mjs`](../tests/json-safety.test.mjs) | 6 | Literal/escape-equivalent duplicate JSON members, object scoping, valid pairs, lone surrogate rejection, unchanged valid data |
| [`tests/output-freshness.test.mjs`](../tests/output-freshness.test.mjs) | 13 | Exact reopened saved state, dirty/stale/fallback/substitution failures, exact receipt and active-evidence blocks, withdrawal/manual-assertion attacks, artifact mutation, draft/operation/storage/session/build races, diagnostic labels |
| [`tests/production-contracts.test.mjs`](../tests/production-contracts.test.mjs) | 5 | Static/binding-free production configuration, canonical/deployable HTTPS origin, typecheck/release scripts, response-policy source |
| [`tests/service-register.test.mjs`](../tests/service-register.test.mjs) | 5 | Service definitions, canonical/required text validation, JSON/CSV export, bounded field semantics |
| [`tests/list-pagination.test.mjs`](../tests/list-pagination.test.mjs) | 3 | Shared 100-row maximum, page clamping, selected-row page resolution |
| [`tests/rendered-html.test.mjs`](../tests/rendered-html.test.mjs) | 2 | Built HTML metadata and headers returned by the checkpoint static adapter |
| [`tests/public-url.test.mjs`](../tests/public-url.test.mjs) | 1 | Public credential-free HTTPS policy and literal private/reserved address rejection |
| **Total** | **226** | Test declarations in the inspected working tree |

The total is descriptive, not a quality score. Many parameterized cases run within one test declaration.

## Assurance patterns

### Exact boundaries

Security-relevant maxima must be tested at the largest accepted value and the first rejected value. Current examples include:

- XML element count at 100,000/100,001;
- XML depth at 256/257;
- per-element XML attributes at 64/65;
- XML counted node/attribute allocation at 100,000/100,001;
- catalog native-packet behavior above 5 MiB and below the 32 MiB ceiling, including a disguised non-packet rejection;
- canonical arrays at their maxima and one item beyond in representative import paths;
- RIS and MARC retained evidence at 1,024 and 1,025;
- BibTeX fields at 1,022 and 1,023, accounting for 1,024 total evidence elements;
- pagination at 100 rows and the next page;
- storage inspection at 100/101 manifests and 256/257 generation keys; and
- archival EDTF groups at 2/100 members, with malformed delimiters and impossible full dates rejected; and
- backup marker presence/mismatch and envelope validation.

Only tests that assert both sides of a boundary support an “exact maximum” claim.

### Fail-closed malformed input

Negative fixtures must assert all three outcomes where relevant:

1. `blocked` or a rejected promise;
2. zero admitted records/no mutated active revision; and
3. an operator-facing bounded error indicating the failed rule.

Current cases cover DTD/entity input, invalid namespaces, same-namespace extension structure, hidden mixed content, unsupported attributes, invalid ordering, prototype keys, duplicate decoded JSON members, lone surrogates, unknown fields, future versions, MIME mismatch, invalid UTF-8/control characters, malformed delimited quoting, deceptive JSON-LD contexts/graph overrides, CSL identity aliases/types, contradictory singular source identities, unsafe URLs, and malformed line grammars. Raw-JSON attacks include catalog/archive roots, workspace backups, continuity receipts, and versioned tabular JSON cells.

### Review binding and record identity

Successful catalog, archive, and workspace-backup review objects are treated as in-memory capabilities. Regression cases clone or coherently substitute decision-relevant fields and require Apply/Open to reject, while an unchanged object from the successful review remains usable. Backup Open also repeats full snapshot validation so non-JSON values such as `NaN` cannot exploit `JSON.stringify` collisions with reviewed `null` values. Apply/Open tests require complete no-default evidence dispositions and reject injected authority fields, copied decisions, changed source/scope bindings, and fabricated content promoted above `operator-admitted-unverified`. Withdrawal-laundering tests ensure a later claim change cannot rehabilitate retained evidence for ordinary output. These bindings show local consistency within one running application process; they do not establish source truth, identity, custody, or protection from compromised application code.

Identity cases reject unsafe supplied catalog primary IDs, verify deterministic source-digest/ordinal IDs only when the source omits one, normalize the supported `doi:` label before duplicate comparison, and reject duplicate archival reference codes across distinct records. Cross-format cases distinguish singular identity carriers from legitimate repeatable evidence in RIS, MARC/MARCXML, MODS, Dublin Core, EAD, JSON-LD, and CSL. These are syntactic and local-identity safeguards, not authority control or real-world entity resolution.

### No silent reduction

Tests construct oversized creator/contributor/identifier/link and metadata arrays across supported exchange paths. The expected result is import rejection, never `slice`-to-maximum behavior. CSL ranges and JSON-LD multi-value forms are either supported or explicitly rejected. RIS/MARC malformed lines and BibTeX unsupported constructs reject the whole import.

### Round trip and semantic conservation

Round-trip tests cover all 20 normalized catalog record types and canonical array maxima across ten export formats, plus supported descriptive fields in MODS, RIS, BibTeX, and MARC mnemonic. Versioned CSV/TSV exercises embedded delimiters, formula-leading text, and line breaks. Archival tests cover EAD variants, AtoM, ArchivesSpace, and the lossless schema package.

Round-trip equality is limited to fields the format/profile supports. It is not evidence of standards certification or compatibility with every version/local configuration of third-party software. Institution-specific fixture exchange remains required.

### Storage fault injection

`fake-indexeddb` tests modify manifests and generations directly to create states the normal UI cannot create:

- stale token;
- corrupt active payload;
- active generation missing immediately before a normal save;
- corrupt or missing manifest-bound prior generation immediately before destructive rotation;
- substituted prior payload;
- active/manifest digest disagreement;
- valid-shaped manifest display metadata that disagrees with the verified active generation;
- active generation at the safe-integer increment boundary;
- recovery save attempted while active state remains healthy or with input different from the verified fallback;
- legacy missing prior digest;
- invalid manifest;
- missing manifest/orphan generation;
- invalid candidate payload/audit; and
- cursor-boundary overflow.
- unanchored baseline acceptance without the exact acknowledgment;
- fully regenerated workspace with unchanged local anchor;
- coherent replacement of workspace and local anchor followed by comparison with an old independently held receipt;
- stale/cross-workspace receipt replay, anchor mutation/deletion, and anchor race during save; and
- attempted in-place recovery of an anchored lineage.

Tests assert not only successful reconstruction but that source manifest/generation bytes remain unchanged and the new workspace receives a different UUID. The pre-transaction freshness check is paired with an optimistic-token recheck inside the write transaction; the tests do not claim protection from an attacker who controls all application code and stored bytes.

### Generated artifacts and response contracts

Build tests inspect produced static HTML and the checkpoint adapter's response headers. Report tests parse structural patterns and prohibit scripts, remote resources, forms, frames, objects, and crossing-line SVG diagrams. Both report generators validate the supplied snapshot themselves; report cases require tampered/sample/finding/unsupported-closure states to remain visible or reject rather than becoming clean authority claims. Production tests ensure `wrangler.jsonc` has no `main` and no D1/R2/KV/Durable Object bindings.

Interface source contracts assert one shared fail-closed gate across catalog, archive, service, operational, and public outputs when the workspace is invalid, unchecked, sample-contaminated, below `continuity-corroborated`, evidence-unverified/unattributed, or has error/warning metadata findings. `output-freshness.test.mjs` exercises the independent runtime lease: unnamed, dirty, recovery, changed-token, substituted state, storage failure, session mutation, local-only/unanchored/failed continuity, admitted/manual evidence, and post-construction generation race all stop authoritative activation. Storage tests require a fresh exact receipt after save and reject a stale receipt; anchor tests reject a forged successor-looking reset ledger. Evidence/core tests reject source/reason/outcome contradictions and nonexistent current revision targets. The artifact input must be the reopened saved snapshot, not the React closure. Diagnostic reports distinguish current, stale, unsaved, and not-saved sessions. Informational duplicate notices remain visible without permanently disabling export. Catalog serializers and UI controls also reject a zero-record batch. Incident resolution requires owner, criterion, and closure note; a later owner/criterion change while resolved also requires a contemporaneous note; incident-bound documents require an explicit target. These source/unit checks do not replace browser interaction or semantic review.

These are repository artifact checks. The live canonical domain requires an independent HTTP header and browser Network-panel capture after deployment.

### Interface contract tests

`interface-contracts.test.mjs` reads TSX and CSS source and asserts selected implementation patterns. It is useful for preventing accidental removal of labels, draft guards, bounded scroll owners, pagination use, recovery wording/actions, and accessible action names.

It is not a DOM-rendering, browser-interaction, accessibility-tree, layout screenshot, or assistive-technology suite. Manual procedures in [`ACCESSIBILITY.md`](ACCESSIBILITY.md) and the external acceptance steps below remain release evidence.

## Determinism and isolation

- Unit tests use fixed fixtures and, for report output, fixed generation timestamps where exact output matters.
- Browser storage tests delete/reset the fake database between scenarios and use direct fixture mutation only inside the test process.
- Imported URLs are never fetched, so parser tests do not depend on a remote host.
- Fonts are compared byte-for-byte between embedded report data and committed assets.
- The build generates site-origin documents from an explicitly validated HTTPS origin.

Tests that use current time or UUIDs assert structure/invariants rather than a literal value. A failure should be reproducible from the lockfile and recorded command.

## Required manual and external validation

Before production acceptance, record results for:

- keyboard-only completion of import, correction, schema, incident resolution with closure evidence, explicit incident-document selection, save, backup, quarantine reconstruction, and report tasks;
- zoom/reflow, text resize, reduced motion, forced colors, and contrast;
- the institution's supported screen reader/browser combinations;
- live canonical-origin response headers and Network-panel confirmation of no application data request;
- Cloudflare, GitHub, Hover, and endpoint account/security configuration;
- backup export, origin migration, verified restore, and source deletion/retention procedure;
- final anchored save plus fresh exact-state receipt export, storage outside the browser-local control domain, stale/cross-workspace receipt comparison, and clean-device restore that is explicitly recognized as a new unanchored lineage;
- fabricated-but-structurally-valid catalog/archive/backup input through admit-unverified, reject, and withdraw paths, confirming no ordinary derivative is available and a withdrawal does not rehabilitate retained content;
- delayed or suppressed cross-tab notification, another-tab change immediately before click, change during a large artifact build, IndexedDB read failure, recovery fallback, and popup/download activation behavior, confirming zero file activation on a detected mismatch;
- representative exports opened/imported by institutionally supported catalog, archival, spreadsheet, and discovery software;
- time-pressured stale-tab, continuity/evidence warning, output-gate, receipt, and conflict-recovery tasks performed by a newly assigned operator;
- Public Notice review by communications/privacy/accessibility owners, including resolved synthetic data, unsupported legacy closures, dirty/unsaved state, and an empty incident register; and
- maximum representative workspace performance on the minimum supported device.

These checks must identify evaluator, date, exact environment/version, fixture, expected result, actual result, issue reference, and disposition. “Looks good” is not auditable evidence.

## Defect and regression policy

1. Reproduce the defect with the smallest safe fixture.
2. Add a failing test at the correct layer.
3. Fix the implementation without weakening unrelated boundaries.
4. Add adjacent boundary/negative cases when the root cause could recur in another format.
5. Run the focused suite, then `npm run release:check`.
6. Update control documents and traceability when behavior or residual risk changes.
7. Retain the issue/PR/release link as change evidence.

Never update an assertion merely to match an unexplained behavior change.

## Release evidence retention

For each production release, retain:

- immutable commit/tag and lockfile;
- CI run and complete logs;
- test totals and failures/retries;
- dependency-audit output or accepted advisory record;
- build artifact digest and Cloudflare dry-run output;
- live header/network capture;
- manual accessibility and interoperability results;
- approver and outstanding accepted risks; and
- rollback target and recovery rehearsal result.

[`VALIDATION_REPORT.md`](VALIDATION_REPORT.md) is an immutable historical summary for its named candidate and 139-test execution, not a rolling current-state status page. Create a new candidate-specific record for each release. External evidence should be linked by stable institutional record identifiers rather than copied into workspace fields when it contains secrets or sensitive details.
