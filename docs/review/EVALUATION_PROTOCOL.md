# Evaluation protocol

## Protocol status

This protocol is a proposed method for evaluating IN KEEPING with synthetic data. It is not an institutional approval, an IRB determination, a usability-research protocol, a penetration-test authorization, or permission to test a production service.

Before recruiting people, recording sessions, collecting identifiable feedback/performance, using institutional records, or presenting results as research, the evaluation lead must use the current official UAlbany/SUNY process and obtain every required determination. The project team must not self-determine that an activity is exempt or outside human-subjects review. A quality-assurance exercise can become research or an employee-data activity depending on purpose, methods, and dissemination.

## Evaluation question

Can designated library and technical reviewers, using only synthetic fixtures on an isolated candidate, verify that IN KEEPING:

1. performs its stated continuity tasks without becoming an authoritative source;
2. refuses malformed, hostile, ambiguous, or oversized imports without hidden loss;
3. preserves complete Original input and New output evidence for professional review;
4. makes persistence, recovery, export, public projection, and deletion boundaries understandable;
5. supports the intended cross-department workflows and receiving-software handoffs;
6. remains operable with required keyboard, assistive-technology, zoom, and reflow settings; and
7. can be built, deployed, monitored without workspace telemetry, recovered, rolled back, and retired under an institutional operating model?

## Evaluation stages

| Stage | Environment | Data | Primary question | Authorization required |
| --- | --- | --- | --- | --- |
| 0. Desk review | Repository only | None | Are scope, architecture, risks, and evidence internally consistent? | Repository review authority |
| 1. Automated candidate assurance | Isolated build/CI | Repository synthetic fixtures | Does the immutable candidate satisfy executable contracts? | Release-owner authorization |
| 2. Expert functional walkthrough | Local or isolated nonproduction origin | Synthetic only | Are librarian tasks and evidence professionally intelligible? | Approved synthetic evaluation scope |
| 3. Accessibility/usability review | Approved test devices/browsers/AT | Synthetic only | Can supported users complete safety-relevant tasks? | Accessibility test authorization; research determination if applicable |
| 4. Receiving-software validation | Isolated receiving-software test tenants/tools | Synthetic only | Are declared exports accepted and semantically conserved in named versions/profiles? | System/vendor test authorization |
| 5. Platform/recovery rehearsal | Nonproduction Cloudflare/GitHub/Hover-equivalent path | Synthetic only | Do live headers, request graph, origin migration, recovery, rollback, and exit work? | Platform/change authorization |
| 6. Production consideration | Formal institutional review | No production data until approved | Are controls, owners, policies, and residual risks acceptable for named uses? | Current official institutional approval process |

Stages do not imply automatic progression. A stop at any stage is a valid result.

## Roles and independence

At minimum, assign:

| Role | Responsibility | Independence expectation |
| --- | --- | --- |
| Evaluation lead | Freeze protocol/candidate, control fixtures, maintain issue/evidence log | Must not alter criteria after seeing results without versioning the protocol |
| Library workflow reviewers | Judge semantics and handoff fit by area | At least one reviewer must be independent of implementation for each area proposed for use |
| Security/privacy reviewer | Inspect data flows, hostile inputs, plaintext handling, platform boundary | Must be authorized for the test method; no uncontrolled offensive testing |
| Accessibility reviewer | Execute keyboard, zoom/reflow, visual, and AT matrix | Use institutionally accepted evaluation method; record unresolved blockers |
| Platform/release reviewer | Verify build, Cloudflare/GitHub/DNS, headers, rollback, and account controls | Must have read-only evidence access where possible; production writes follow change control |
| Records/data-governance reviewer | Determine classification, retention, deletion, legal hold, and evidence handling | Decision recorded outside the application workspace |
| Observer/note keeper | Record steps and actual results | Use role-coded IDs and no recording unless separately approved |

The implementation author may demonstrate the product but must not be the sole acceptor of security, accessibility, interoperability, or production readiness.

## Candidate and environment control

Before execution, record:

```text
Protocol version:
Full Git commit SHA and tag:
Pull request and review IDs:
package-lock.json SHA-256:
Build artifact SHA-256:
CycloneDX SBOM SHA-256:
Node/npm versions:
Operating system and device specification:
Browser and assistive-technology versions:
Origin and Cloudflare deployment/version ID, if used:
Receiving product, version, tenant/profile, and import settings:
Evaluator role code:
Start/end UTC:
```

Run `npm ci` and `npm run release:check` against the exact commit. Preserve logs and the artifact. Do not test a later dirty working tree under the earlier commit label. [Testing](../TESTING.md) defines the release gate; [Validation report](../VALIDATION_REPORT.md) is a precedent for evidence structure, not a reusable pass.

Use a dedicated browser profile. Disable unapproved extensions. Confirm no prior IN KEEPING data exists under the test origin. Record browser storage/persistence settings and private-browsing status. Do not use a preview origin for real data.

## Synthetic fixture requirements

Every fixture must be demonstrably fictional and reviewed before use. Avoid real patron, student, employee, donor, licensor, vendor-contact, collection restriction, incident, credential, contract, unpublished research, or culturally sensitive information. Reserved identifiers and domains should be used where the parser permits them; where public-HTTPS syntax is required, use an approved controlled test hostname or avoid the optional URI field rather than querying a real unrelated host.

The fixture register must include:

| Field | Requirement |
| --- | --- |
| Fixture ID/version | Stable, non-personal identifier |
| Purpose | Exact requirement/task exercised |
| Format/profile | Syntax plus local or vendor profile, where relevant |
| Expected result | Accept, quarantine/reject, or documented lossy crosswalk |
| Expected counts/values | Records, fields, hierarchy, identifiers, digests where fixed |
| Synthetic provenance | Creator/date/method and statement that no production source was transformed |
| Sensitivity | Synthetic/public-test; no claim that the application can enforce this label |
| Cleanup | Files, workspaces, screenshots/logs, and receiving-system records to remove |

Required fixture families are:

1. one blank startup with no implicit records;
2. the repository Sample data invoked explicitly from Import;
3. minimal and representative valid files for every claimed import/export format;
4. all 20 normalized catalog record types and supported descriptive fields;
5. all 10 archival record types and 16 archival field kinds;
6. all 16 service record definitions across eight areas and every service field kind;
7. exact maximum and first-over-limit cases for security-relevant bounds;
8. malformed and namespace-confused XML; literal/escape-equivalent duplicate JSON keys and lone surrogates in catalog/archive/backup/receipt/tabular paths; deceptive JSON-LD/CSL; RIS, MARC/MARCXML, BibTeX, and tabular cases;
9. formula-leading, delimiter, quote, newline, Unicode, markup, and duplicate-identifier cases;
10. storage states for stale tokens, missing/corrupt generations, active/manifest mismatch, bound/unbound prior generations, display-metadata mismatch, maximum-safe generation, invalid/orphan storage, absent/mismatched anchors, whole-history regeneration, and whole-local-store replacement;
11. cloned/coherently substituted catalog, archive, and backup review objects plus missing/copied/tampered evidence dispositions;
12. unsafe/absent primary IDs, equivalent DOI labels, duplicate archival reference codes, contradictory singular RIS/MARC/MODS/DC/EAD/JSON-LD/CSL identities, and legitimate repeatable controls;
13. incidents that attempt resolution without same-update closure evidence or an assigned owner, plus resolved incidents missing owner, note, or closure criterion;
14. internal canaries, synthetic states, stale/dirty/unnamed/recovery/unanchored/continuity-failure/evidence-unverified publication state, and unresolved findings that block outward output;
15. delayed/suppressed cross-tab notification, pre-click storage mutation, during-construction mutation, storage-read failure, and browser activation cases;
16. exact, stale, cross-workspace, mutated, and co-located continuity receipts; and
17. viewport, long-value, dense-index, and report-capacity fixtures.

Never put exploit fixtures or restricted content on a public issue, shared production origin, or unapproved receiving tenant.

## Execution method

For each test case, record:

| Field | Value |
| --- | --- |
| Case ID / requirement ID |  |
| Candidate / environment |  |
| Fixture ID and SHA-256 |  |
| Preconditions |  |
| Exact steps |  |
| Expected result |  |
| Actual result |  |
| Pass / fail / blocked / not run |  |
| Evidence location |  |
| Defect/risk ID |  |
| Evaluator role / UTC |  |
| Retest candidate and result |  |

Do not record “works,” “looks good,” or a screenshot alone. The evidence must be sufficient for another qualified reviewer to repeat the case.

## Core task protocol

### A. Blank start, import, and comparison

1. Open the candidate in a clean profile.
2. Verify that the workspace contains no sample records, incidents, schemas, or service records.
3. Confirm that no IndexedDB named workspace appears until explicit creation.
4. Open Import, select Sample data, and verify that this is an explicit operator action.
5. Separately review one valid synthetic file in each proposed format.
6. Before Apply, verify that the active revision has not changed.
7. Inspect the two labeled blocks: Original input and New output.
8. Confirm that source code/name/value/definition and all canonical output fields are available to keyboard and assistive technology.
9. Exercise missing disposition, reject, withdraw, and admit-unverified. Confirm no default is supplied; reject/withdraw add no records; admission creates exactly one successor revision, a content-bound evidence record, and a state-bound event, but no trusted/verified status.
10. Clone a successful catalog review and coherently change its filename, format, digest, record content, and record provenance; verify Apply rejects it. Repeat with an archive review, then change destination state and verify prior-state preservation.

Acceptance: no implicit data; review is nonmutating; all evidence/claims are inspectable; apply and disposition are explicit and revalidated; rejection causes no partial mutation; fabricated but valid content remains visibly unverified and diagnostic-only.

### B. Hostile-import refusal

Execute the registered negative and exact-boundary fixtures. At minimum cover:

- file byte, MIME/extension, fatal UTF-8, control-character, record-count, and canonical-array bounds;
- XML declaration, DTD/entity/processing instruction, foreign element/applied attribute namespace, unsupported same-namespace structure, hidden/mixed content, 256/257 depth, 100,000/100,001 element/allocation, and 64/65 attribute cases;
- RIS missing/duplicate/noninitial `TY`, duplicate singular `ID`, malformed line, missing/nonterminal `ER`, separator misuse, and 1,024/1,025 cases;
- MARC/MARCXML duplicate `001`/`003`, per-field duplicate `020`/`022`/`024` `$a` or `024` `$2`, legal distinct repeats, invalid leader/tag/indicator/subfield, separator misuse, injection, and 1,024/1,025 cases;
- MODS repeated `recordInfo`/contradictory `recordIdentifier`, Dublin Core private-wrapper duplication, and EAD missing/duplicate/conflicting repository carriers with valid multipart/repeatable controls;
- BibTeX nested braces/safe values and CR/LF/CRLF comments, then directives, macros, concatenation, duplicate fields, malformed delimiters, excessive nesting, and 1,022/1,023-field cases;
- JSON literal/escape-equivalent duplicate members and lone high/low surrogates across every raw/cell JSON path; unknown/prototype keys, unsupported version, bounds, and disguised foreign JSON above 5 MiB;
- JSON-LD exact/remote/object/array/nested/graph-item contexts, wrong graph shape, `@id`/identifier conflicts, empty schemes, and Unicode-lookalike private URNs; CSL extension/dispatch, case/NFKC identity-key aliases, and wrong identity value types; and
- delimited unknown/duplicate columns, row-width mismatch, invalid booleans, unterminated quote, formula-leading content, embedded delimiter, and line-break behavior.
- unsafe supplied catalog primary IDs, absent primary IDs, supported `doi:` label variants representing the same DOI, and duplicate archival reference codes across distinct records.

Acceptance: each accepted boundary retains the complete expected value set; each invalid or over-limit file is rejected as a whole with a bounded operator-facing reason; no source line, array item, or record silently disappears; no network request is made.

### C. Catalog and discovery workflow

1. Review and apply a catalog batch containing identifiers, creators/contributors, dates, subjects/genres, links, rights/license, series, holdings/access fields, and every proposed normalized type.
2. Make a catalog correction; verify source evidence remains visible and a new revision is created.
3. Search, filter, and page a list over 100 records; verify the selected detail remains on its containing page.
4. Export each proposed format and re-import it where supported.
5. Open outputs in the institution-supported cataloging, discovery, spreadsheet, or transformation tool.
6. Compare every expected field, repeatability, type mapping, escaping, order where meaningful, warnings, and declared loss.
7. Verify discovery profile, suppression, and link-routing records without executing a route.
8. Confirm an unsafe supplied catalog primary ID rejects, an absent primary ID receives the documented source-digest/ordinal local ID, and equivalent supported DOI label forms collide during duplicate review.

Acceptance: internal lossless/native paths preserve all defined values; crosswalk loss matches the documented profile; receiving-system differences are recorded and accepted by the metadata owner; no claim is made that URL syntax validation proves resolver availability.

### D. Electronic resources and collections workflow

1. Create synthetic collection policy and fund records.
2. Create synthetic entitlement and license-obligation records covering authentication mode, coverage, renewal, perpetual access, authorized users, accessibility, ILL, TDM, and post-cancellation terms.
3. Verify field definitions, types, required/repeatable behavior, controlled terms, and sensitivity display.
4. Export service JSON and CSV; inspect formula-leading and multiline text behavior.
5. Confirm that no agreement text, payment credential, vendor credential, or real commercial term is present.

Acceptance: records support reconciliation/handoff but do not appear to replace the ERM, contract, finance, or legal record; exports preserve exact typed synthetic values.

### E. Archives, special collections, and rare materials workflow

1. Create/version a custom archival schema and supply a definition for every field.
2. Exercise all 16 field kinds and controlled/repeatable/required behavior.
3. Build a 32-level valid description hierarchy; attempt a cycle, missing parent, cross-schema parent, and level 33.
4. Exercise accession, authority, agent, repository, digital object, rights, event, subject, and location records outside the descriptive hierarchy.
5. Export/re-import the lossless schema package.
6. Export representative EAD 4.0, EAD3, EAD 2002, AtoM CSV, ArchivesSpace crosswalk CSV, and DCTAP.
7. Inspect those outputs in institution-supported archival tools/profiles.
8. Create synthetic copy-provenance and conservation-treatment service records; confirm separation of general description, copy evidence, condition, and treatment authorization.
9. Attempt to assign the same archival reference code to two distinct records and verify the entire set rejects.

Acceptance: unsupported hierarchy or structure fails closed; lossless package preserves exact field kinds/values; receiving-tool differences and private/public defaults are reviewed by an archivist; no export is treated as publication or custody authority.

### F. Preservation and data-services workflow

1. Create synthetic condition assessment and preservation action records with before/after fixity references.
2. Create dataset-custody and data-management-plan records with media type, checksum, retention trigger, access level, storage/backup, formats, and rights basis.
3. Verify checksum/media/date/numeric/public-URL validation and maximum values.
4. Confirm that a checksum reference is not described as preservation, authenticity, or custody proof.
5. Export JSON/CSV and inspect with approved spreadsheet/data tooling.

Acceptance: records support review and transfer but do not claim repository custody, restore verification, rights approval, or preservation success without external evidence.

### G. Incidents, changes, and reports

1. Create incidents across severity/state values, add evidence, change owner/next action, and add notes.
2. Attempt resolution without a closure note, then without an assigned owner; both must reject. Resolve only by supplying owner and contemporaneous evidence in the same update.
3. Switch incidents while an update draft exists; verify it cannot cross records or disappear after a rejected update.
4. With at least two incidents, generate incident ticket, vendor escalation, and postmortem documents only after explicitly selecting the intended incident. Verify no value from the unselected incident appears and that supported closure evidence is included.
5. Load syntactically valid resolved incidents missing closure note, assigned owner, or closure criterion; verify incident-bound documents and Public Notice reject them rather than implying supported closure.
6. Generate the Technical Report; inspect document control, flows, bounded active-state inventory/records, findings, incidents, schemas, configuration, revisions, audit, safeguards, and explicit completeness/authenticity limits.
7. Use internal canary strings in every field excluded from Public Notice; generate a notice and prove all canaries absent.
8. Add synthetic catalog content and synthetic incidents in open and resolved states; verify every ordinary compatibility, operational, and public output blocks. Confirm the Technical Report remains available with a sample warning and begin blank before production output.
9. Exercise invalid/unchecked, finding, unnamed, dirty, recovery, stale, unanchored/continuity-failure, and admitted/unattributed-evidence states; verify every authoritative catalog, archive, service, operational, and public path fails closed. Verify zero-record catalog output also rejects.
10. Suppress/delay cross-tab notification, change the named generation immediately before click, and change it during a deliberately large artifact build. Verify the first reopen catches pre-click state, the final reopen catches the construction race, content is built only from the reopened snapshot, and no file activates on failure.
11. Attempt a later withdrawal of an admitted fabricated source while its records remain retained; verify Technical Report discloses both decisions and ordinary output/Public Notice remain blocked.
12. Attempt Public Notice from unnamed, dirty, stale, unanchored, and evidence-unverified state and from an empty incident register. Verify blocked cases; the empty register disclaims a service-health all-clear.
13. Review the nonsynthetic category-only notice as though preparing publication, confirm the browser created the expected file, but do not publish it.

Acceptance: state changes are revision/audit bound; closure/target are explicit; drafts are safe; Technical Report is a bounded diagnostic rendering; authoritative artifacts match the exact saved state at verification instants and fail on detected races; Public Notice contains only the fixed projection; later currency and human publication approval remain explicit.

### H. Workspace, backup, recovery, and deletion

1. Create a named workspace; save; confirm it is unanchored and ordinary output blocks. Explicitly accept a baseline with the required continuity-not-authenticity acknowledgment; download its receipt; modify/save; confirm the anchor advances atomically and the old receipt is stale.
2. Attempt a stale-tab save and verify overwrite is blocked. With notification delayed, request output and verify the click-time storage reopen still blocks it.
3. Immediately before a normal save, remove/corrupt the active generation and separately remove/corrupt the prior generation that rotation would delete; verify each save stops and every remaining stored byte is preserved.
4. Attempt recovery save while active state still verifies and with altered input that differs from the verified fallback; verify both reject. Exercise the maximum-safe generation and valid-shaped manifest metadata mismatch cases.
5. Download a current-session backup, a separately selected saved-workspace backup, and the exact current continuity receipt; verify action names and targets.
6. Inspect backup JSON and confirm `protection` is `plaintext-json-not-encrypted`.
7. Alter payload/state/digest/version/unknown/duplicate field or add a lone surrogate and verify rejection. Clone/substitute a successful backup review and verify Open rejects. Exercise missing/reject/withdraw dispositions; only admit-unverified opens, and it adds an outer unverified backup evidence record.
8. Exercise manifest-bound prior recovery; confirm it opens as an unsaved copy without stored rewrite/deletion.
9. Exercise invalid-manifest and orphan-generation inspection; verify a selected valid candidate only, reconstruct with a new UUID/name, and compare source bytes before/after.
10. Regenerate a completely internally valid replacement workspace/history while retaining the old local anchor; verify continuity failure and no in-place re-anchor. Then replace every browser-local store coherently; verify local checks alone cannot distinguish it but the independently retained exact old receipt fails comparison. Repeat with a stale/cross-workspace/mutated receipt.
11. Migrate a synthetic backup from old to canonical origin. Confirm backup excludes anchor/receipt, Open is explicitly unverified, the new workspace is unanchored, and the old receipt cannot continue its new workspace/lineage. Preserve transition evidence and explicitly accept a new baseline after review.
12. Delete the selected local workspace; verify its local anchor is deleted but the open copy and downloaded backup/receipt are not falsely reported erased.

Acceptance: all targets, reviews, dispositions, and baseline choices are explicit; freshness, identity, digest, and checkpoint mismatches stop; recovery is non-destructive and unanchored; local continuity/unsigned receipts are not authenticity; plaintext/origin boundaries and external governance are understood.

## Accessibility protocol

Use the complete manual procedure in [Accessibility](../ACCESSIBILITY.md). At minimum, test the core tasks above with:

- keyboard only, including skip link, logical focus, visible focus, dialogs/confirms, file input, details/summary, page/filter controls, and destructive actions;
- 200% and 400% browser zoom plus a 320-by-256 CSS-pixel viewport;
- increased text size, reduced motion, forced colors/high contrast, and a color-vision simulation;
- the institution's supported Chromium and non-Chromium browsers; and
- the required screen reader/browser combinations.

Record headings/landmarks, labels/descriptions, current/pressed/expanded state, live announcements, error association, table/record navigation, scroll-region behavior, report reading order, and Public Notice comprehension.

Acceptance for an evaluation candidate is zero unresolved defects that prevent task completion, hide an error/state, cause data loss, obscure a destructive target, or require color alone. Other defects require severity, owner, workaround, retest, and an explicit decision. This protocol does not itself support a WCAG conformance claim.

## Security, privacy, and platform protocol

1. Inspect the production artifact and source for `fetch`, XHR, beacon, WebSocket/EventSource, cookies, remote assets, dynamic script/style, and service-worker paths.
2. In a clean browser, capture page-load and full-task network traffic; identify every request, initiator, host, method, and payload.
3. Verify CSP and all required response/cache headers, actual 404 status, canonical redirects, and absence of a secondary workbench origin.
4. Verify root `wrangler.jsonc`—not the checkpoint adapter—is the deployed production configuration and contains no application binding.
5. Review Cloudflare account logging/analytics/security settings, GitHub organization/Actions/access controls, and Hover registrar/DNS/MFA/recovery/lock settings.
6. Review endpoint encryption, browser-profile separation, patch/extension policy, download destinations, synchronization, backup, remote support, and disposal.
7. Run only approved defensive negative tests within the authorized origin/environment. Do not conduct uncontrolled load, denial-of-service, account, DNS, dependency-publishing, or third-party tests.

Acceptance: the live implementation and accounts match the reviewed architecture and data map; any extra processor, request, binding, log, or permission is dispositioned before use.

## Performance and reliability protocol

Before measurement, the institution must define its minimum supported device/browser and explicit budgets for:

- initial static asset load under the approved network condition;
- review of representative maximum-size files;
- page/filter/selection response in 1,000 catalog, 5,000 archive, and 1,000 service-record workspaces;
- save/open/verification near the 25 MiB local ceiling;
- backup and report generation within their documented limits; and
- recovery inspection within the 100-manifest/256-generation inspection bounds.

Record median and worst observed result across a predefined run count, browser memory behavior, visible responsiveness, error result, and whether data remained complete. Do not invent budgets after measuring. A performance failure must never be “fixed” through silent truncation.

## Results and defect handling

Classify each case as:

- **Pass:** actual result equals the frozen criterion and evidence is retained.
- **Fail:** criterion not met; issue/risk and affected candidate recorded.
- **Blocked:** prerequisite/environment unavailable; not a pass.
- **Not run:** outside approved scope or omitted; not a pass.

For a defect:

1. stop if a stop condition applies;
2. preserve only the minimum synthetic evidence;
3. create a private issue when security-sensitive;
4. add the smallest reproducer and an automated regression where representable;
5. fix through reviewed source, never by weakening or deleting an unexplained assertion;
6. rerun the focused case and the complete release gate on the new commit; and
7. update traceability, risk, documentation, and the candidate identity.

## Stop conditions

Stop the affected evaluation immediately when:

- production, personal, restricted, credential, or contract data is discovered in a fixture/workspace/evidence file;
- the application transmits workspace content or follows an imported URL;
- an invalid import partially mutates trusted state or silently drops a line/value/record;
- a digest disagreement is hidden by fallback or recovery rewrites/deletes source evidence;
- a reviewed object can be cloned or coherently substituted into Apply/Open;
- an incident resolves without same-update closure evidence and an assigned owner, or an incident-bound document silently chooses its target;
- an ordinary outward artifact bypasses an integrity, freshness, sample, finding, closure, or saved-publication gate;
- Public Notice receives a nonallowlisted/internal value;
- a safety-critical task is inaccessible or a destructive target is ambiguous;
- testing degrades another service, DNS, mail, receiving tenant, or account security;
- candidate/source/artifact identity cannot be established;
- a required institutional determination or authorization is absent; or
- an evaluator requests withdrawal from a people-involving study/evaluation governed by such a process.

Notify the authorized lead through the approved channel. Do not place sensitive evidence in IN KEEPING, public GitHub issues, screenshots, or chat.

## Evaluation acceptance record

The final record must state one of: **accepted for the stated evaluation**, **conditionally accepted**, **rejected**, or **not decided**. It must include:

- exact candidate and environment;
- protocol and fixture versions;
- counts of pass/fail/blocked/not-run cases by requirement;
- unresolved defects and risk IDs;
- accessibility, receiving-software, recovery, live platform, and governance evidence locations;
- deviations from protocol and their approval;
- data/evidence disposition completion;
- decision authority, conditions, expiry/review date, and date; and
- an explicit statement that synthetic evaluation acceptance is not production authorization.
