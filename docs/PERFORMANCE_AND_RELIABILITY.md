# Performance and reliability

IN KEEPING is intentionally bounded. It trades unbounded ingestion and hidden partial success for explicit capacity limits, paginated indexes, complete validation, atomic local commits, and operator-visible failure. This document records the implemented boundaries and the evidence needed before making performance or availability claims.

## Performance model

Production serves immutable static assets from Cloudflare. After load, the application performs no API calls, remote imports, analytics, font requests, or workspace uploads. React, parsing, normalization, hashing, validation, reports, and IndexedDB execute on the operator's device.

```text
network acquisition              browser-local work
HTML + hashed JS/CSS/fonts  -->  parse -> review -> apply -> save/export
Cloudflare edge                  CPU, memory, IndexedDB, filesystem activation
```

Consequences:

- Network performance affects application acquisition, not per-record server calls.
- Parsing/report latency and memory depend on the browser, device, source structure, and accepted maximums.
- Cloudflare scaling does not raise browser-local workspace limits.
- A fast static response does not establish that a large import or report is usable on the institution's target device.
- No production RUM is collected. Performance evidence comes from controlled synthetic release testing.

## Implemented capacity boundaries

Values below are enforced in source and covered by boundary tests unless stated otherwise. They are software safety limits, not records-retention policy or a recommendation to operate continuously at the maximum.

### Catalog and hostile imports

| Boundary | Enforced value | Failure behavior |
| --- | ---: | --- |
| Foreign catalog import file | 5 MiB | Review blocked before format parsing |
| Strict versioned IN KEEPING packet | 32 MiB | Review blocked; a disguised/invalid foreign JSON file cannot use the larger allowance |
| Catalog records per revision/import result | 1,000 | Whole operation rejected; no slicing |
| Retained source elements per record | 1,024 | Record/file rejected; tagged lines are not silently skipped |
| Creators per record | 50 | Record rejected |
| Contributors per record | 50 | Record rejected |
| Identifiers per record | 50 | Record rejected |
| Links per record | 20 | Record rejected |
| Link length | 2,048 characters | Record rejected |
| XML elements | 100,000 | Pre-DOM scan stops |
| XML nodes plus attributes | 100,000 | Pre-DOM scan stops |
| XML nesting depth | 256 | Pre-DOM scan stops |
| Attributes per XML element | 64 | Pre-DOM scan stops |
| XML tag length | 16,384 characters | Pre-DOM scan stops |
| XML text, comment, CDATA, or attribute value | 8,192 characters per bounded item | Pre-DOM scan stops |
| MARCXML fields/subfields | 256 fields and 1,024 subfields per record | Record rejected |

XML processing rejects DTDs, entities, processing instructions, malformed structural boundaries, unsupported attributes/children, and foreign namespaces before normalization. RIS and MARC mnemonic reject malformed/unexpected lines. BibTeX is a bounded nested-brace parser and rejects macros, string directives, and concatenation rather than attempting a lossy interpretation.

### Archival schemas and records

| Boundary | Enforced value | Failure behavior |
| --- | ---: | --- |
| Archival exchange file/output | 5 MiB | Review/export rejected |
| Custom schemas per workspace | 50 | Revision rejected |
| Fields per schema | 128 | Schema rejected |
| Vocabulary/scalar-array values per field | 250 | Schema/record rejected |
| Archival records per workspace | 5,000 | Revision/import rejected |
| Archival component hierarchy | 32 component levels | Record/import rejected |

The same boundaries apply to lossless schema packages and crosswalk inputs; foreign formats do not receive a silent lower-fidelity overflow path.

### Service registers, incidents, revisions, and audit

| Boundary | Enforced value | Failure behavior |
| --- | ---: | --- |
| Service-register records | 1,000 | Revision rejected |
| Incidents | 500 | New incident rejected before mutation |
| Notes per incident | 500 | New note rejected before mutation |
| Incident note/evidence item | 2,000 characters | Mutation rejected or input constrained |
| Retained revision bodies | 20 | Oldest body rotates after a valid successor is constructed |
| Audit events | 5,000 | Final valid event is retained; later state mutations stop |

Revision rotation and audit capacity are distinct. An audit entry may preserve the action/hash after an old revision body rotates, but it cannot reconstruct that removed body.

### Local persistence, backup, and recovery inspection

| Boundary | Enforced value | Failure behavior |
| --- | ---: | --- |
| Named local workspaces per exact origin | 50 | Create rejected |
| Validated serialized workspace save | 25 MiB | Save rejected; working copy remains open |
| Retained generations per normal workspace | Active plus one prior | Older prior removed only in a normal successful rotation |
| Plaintext workspace-backup review/export | 26 MiB envelope limit | Review/export rejected |
| Storage inspection manifests | 100 | Inspection stops rather than silently omitting entries |
| Storage inspection generation keys | 256 | Inspection stops rather than silently omitting entries |
| Defensive inspection nodes | 1,000,000 | Candidate/manifest validation stops |
| Defensive inspection depth | 18 | Candidate/manifest validation stops |

Browser quota may be lower than the product limit and can change. A quota estimate and persistence request are advisory. IndexedDB can still be unavailable, denied, evicted, removed with profile/site data, or stranded on another origin.

### Reports and lists

| Boundary | Enforced value | Failure behavior |
| --- | ---: | --- |
| Technical Report workspace input | 8 MiB bounded serialization | Generation stops before document construction |
| Generated report HTML | 32 MiB encoded output | File activation stops |
| Master-list page size | 100 rows | Page request is clamped to a valid page |

Record, archival, service, incident, and other large master indexes use the shared pagination contract. Invalid, negative, nonfinite, or stale page requests clamp to the valid range. After create/update/filter, the selected item resolves to the page that contains it; hidden rows are not revived merely because an earlier page number existed.

Pagination limits rendered rows, not the cost of validating a complete accepted workspace. Search/filter may still examine the bounded in-memory collection.

## Failure semantics

Reliability depends on what happens at a boundary:

- Oversized arrays, rows, elements, and files are rejected; they are not truncated.
- Malformed RIS and MARC lines are rejected; they are not discarded.
- Unsupported BibTeX macros/concatenation are rejected; they are not expanded or flattened.
- XML namespace and depth failures occur before DOM allocation and workspace mutation.
- Review never mutates a workspace. Apply revalidates the selected source and destination before one successor revision.
- A failed revision or import leaves the prior active revision unchanged.
- A save uses one IndexedDB transaction for manifest and generation. Browser abort/quota failure preserves the prior committed state.
- A stale token blocks overwrite instead of auto-merging tabs.
- A manifest/active digest disagreement stops open; the application does not mask it with a fallback.
- A valid manifest-bound prior generation opens only as an unsaved recovery copy and does not rewrite/delete stored evidence.
- Quarantine reconstruction creates a new UUID workspace after a second digest/full-payload verification and leaves the quarantined source unchanged.
- An authoritative whole-catalog, per-record catalog, archive, service, operational, or Public Notice output requires a clean named session with no pending draft/operation or storage quarantine, no active operator-admitted-unverified evidence or unattributed catalog/archive/service content, and `continuity-corroborated` from an exact independently supplied receipt for the current generation. At activation time the application reopens and validates the saved generation with that receipt, compares its token, payload/state digest, audit head, active revision, anchor, evidence state, and full artifact snapshot with the session, renders from that reopened snapshot rather than the React closure, then repeats the saved-state/receipt/fingerprint checks after construction. Any read, fallback, mismatch, mutation, local-only continuity, stale receipt, or active-evidence failure stops activation.
- The Technical Report is deliberately diagnostic. It renders the open session and labels its relationship to a named saved copy and continuity checkpoint as current, stale, unsaved, not saved, verified, or failed rather than borrowing authoritative-output status.
- Report over-capacity failure occurs before file activation. Component exports and the plaintext workspace-backup path remain separate options when their own limits permit.

These properties provide deterministic containment. They do not guarantee power-loss behavior outside the browser's IndexedDB transaction, device durability, malicious-extension resistance, or recovery without a backup. The two freshness reads and browser file activation are not one atomic transaction: another context can commit immediately after the final read, and a file can therefore become stale immediately after verification. The check establishes correspondence to one exact saved generation at the recorded check instants, not that the file is still latest when a recipient opens, imports, approves, or publishes it.

## Static asset and cache reliability

Vite builds both the production client and checkpoint adapter to ES2022 with source-map emission disabled. The production client extracts content-hashed assets and separates the vendor group. Jost fonts are self-hosted. Root HTML, `index.html`, and `404.html` use `Cache-Control: no-cache` so clients revalidate. Hashed `/assets/*` and stable `/fonts/*` use one-year immutable browser caching. Cloudflare also provides validators for static assets.

`not_found_handling: 404-page` preserves an actual 404 response for unknown paths instead of returning the application shell. A release must test status, not just page appearance.

The application is not declared an offline application. Cached assets may allow an already loaded session to continue, but no service worker or offline installation contract exists. An origin outage can prevent a new load even though IndexedDB still exists.

## Release performance evidence

No universal latency, Core Web Vitals, maximum-import duration, or browser quota claim is established by this repository. Hardware, browser, extension policy, endpoint security, and source shape materially affect results. Each production owner must create a baseline on representative managed devices and retain the measurements with the release.

### Asset inventory

After a canonical-origin build:

```sh
find dist/client -type f -printf '%s %p\n' | sort -nr
du -sh dist/client
```

Record total encoded bytes, largest JS/CSS/font/image files, compressed transfer sizes from the live origin, request count, and cache behavior. Reject unexpected remote assets, source data, any `.map` output or `sourceMappingURL` reference, or a material unexplained increase. Production contract tests assert that source maps remain disabled in both Vite build surfaces.

### Browser task matrix

Use synthetic fixtures on every supported browser/OS class and at least one institutionally representative lower-powered device. Measure and record:

1. cold canonical load with empty cache;
2. warm revalidated load;
3. blank workspace first interaction;
4. ordinary and maximum-boundary catalog review without apply;
5. maximum accepted list pagination and selection;
6. archival hierarchy review at the supported depth;
7. save, reopen, token conflict, bound-prior recovery, and quarantine reconstruction;
8. Technical Report generation near its accepted boundary;
9. authoritative whole-catalog, per-record catalog, archive, service, operational, and Public Notice generation with the cross-tab notification delayed or unavailable, including a second-tab change before the first freshness read and during artifact construction;
10. storage-read failure, recovery fallback, missing/local-only/failed continuity, stale or missing exact receipt, active admitted/unattributed content, pending draft/operation, storage quarantine, and artifact-snapshot mutation at output activation;
11. actual new-tab and download behavior after the asynchronous double-open check, including popup/automatic-download policy and the 60-second Blob URL lifetime; and
12. keyboard and assistive-technology completion of the same core tasks.

Capture median and worst observed duration for repeated synthetic runs, peak browser memory when tooling permits, visible long tasks, crashes, and whether status announcements remain timely. Do not send these measurements from production operators.

### Acceptance rule

A release is blocked when a previously supported fixture cannot complete, the UI stops responding long enough that the task state is ambiguous, a maximum accepted input causes a crash, a boundary is bypassed, or asset/task cost regresses materially without a reviewed explanation and mitigation. Set numeric institutional budgets after the first representative baseline; record them in the release evidence rather than inventing a cross-device promise here.

When a maximum is safe but operationally slow, document a recommended working size and retain the hard reject boundary. Do not silently lower accepted record counts or add truncation as a performance fix.

## Reliability verification matrix

| Invariant | Automated evidence | Required production evidence |
| --- | --- | --- |
| Binding-free static production | Production/artifact contract tests, Wrangler dry run | Deployed config and request graph |
| Canonical origin | Origin validation tests, generated metadata | Live canonical/redirect check |
| Security headers/404/cache | Rendered and production contract tests | Live response matrix |
| Import allocation limits | Exact-boundary and one-over tests | Representative browser timing |
| No silent data loss | Round-trip and malformed-line tests | Receiving-software sample when claiming compatibility |
| Pagination | Shared 100-row unit/interface contracts | Keyboard/selection check on large synthetic lists |
| Atomic save and stale-tab block | fake-IndexedDB storage tests | Multi-tab smoke test |
| Authoritative artifact freshness lease | Output-freshness race/error tests and interface contracts | Multi-tab test with delayed notification, before-click and during-construction mutation, and confirmed browser file activation |
| Evidence and continuity output gates | Evidence-authority, continuity-anchor, output-freshness, and interface tests | Reviewer verifies operator-admitted-unverified evidence, imported catalogs without a bound authority record, and missing/mismatched checkpoints block authoritative output without obscuring the diagnostic routes |
| Bound prior recovery | Storage corruption/digest tests | Quarterly recovery drill |
| Explicit quarantine reconstruction | Inspection/reconstruction tests | Quarterly synthetic drill |
| Plaintext backup contract | Envelope/digest/version tests | Protected destination and restore drill |
| Report boundary/redaction | Report document tests | Open/download/layout/accessibility check |

Automation is necessary but cannot establish Cloudflare account settings, browser eviction policy, DNS/mail continuity, assistive-technology usability, receiving-system behavior, or institutional handling of downloaded files. It also cannot make IndexedDB verification and browser/OS file activation atomic, observe that a programmatic anchor activation produced a durable file, or establish that a previously generated artifact remains current later.

## Availability and continuity

Set availability objectives at the service-owner level, distinguishing:

- static-origin/DNS availability;
- successful application acquisition;
- client workflow completion;
- browser-local persistence; and
- authoritative downstream-system availability.

IN KEEPING cannot guarantee the last three through Cloudflare uptime. Continuity controls are the single canonical origin, explicit named saves, plaintext backups kept in approved encrypted storage, Technical Reports, verified recovery, and documented downstream handoff.

Do not create a second live hostname as an availability failover: it creates a separate IndexedDB store and risks split work. Restore the same canonical origin or use the approved backup/continuity procedure.

## Capacity changes

Changing a limit is an architectural and compatibility change. A proposal must include:

- operational need and representative source shape;
- browser CPU/memory and report-size evidence;
- exact boundary/one-over/hostile fixtures;
- persistence/quota and backup implications;
- UI pagination/search behavior;
- receiving-format and round-trip impact;
- failure atomicity and recovery effects; and
- documentation, risk, and release updates.

Raising one layer while leaving a lower downstream limit unchanged creates an unusable accepted state and is prohibited. For example, a workspace limit cannot be raised without reviewing backup, report, validation, IndexedDB, audit, and export boundaries together.
