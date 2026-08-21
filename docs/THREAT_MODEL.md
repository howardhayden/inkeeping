# Threat model

## Model record

| Field | Value |
| --- | --- |
| System | IN KEEPING 1.0 static browser application |
| Review scope | Source import, browser execution, browser-local persistence, generated files, static delivery |
| Method | Asset/trust-boundary analysis with misuse cases grouped by spoofing, tampering, disclosure, denial of service, and privilege assumptions |
| Authority | Current source and automated tests; see [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) |
| Excluded from assurance | Cloudflare account configuration, Hover account and DNS controls, GitHub organization policy, endpoint security, browser vendor behavior, institutional identity, recipient software, and institutional legal compliance |

This model describes what the application can and cannot defend. It is not a penetration-test report or a claim of formal verification.

## Data flow and trust boundaries

```text
[GitHub source and lockfile]
          |
          | reviewed build/deploy
          v
[Cloudflare static origin] -- ordinary HTTP/TLS metadata --> [Cloudflare account/platform]
          |
          | HTML, CSS, JS, local fonts
          v
+-------------------------- browser/origin boundary ---------------------------+
| [Application memory] <--- operator input / untrusted local file              |
|         |                         |                                            |
|         | review                 v                                            |
|         |                 [bounded quarantine parser]                          |
|         |                         |                                            |
|         | explicit apply         v                                            |
|         +----------------> [validated working copy]                            |
|                                   |                                            |
|                         explicit create/save                                   |
|                                   v                                            |
|              [origin-scoped IndexedDB manifest + generations]                  |
+-------------------------------------------------------------------------------+
                         |
                         | explicit browser download/open
                         v
               [plaintext exported files]
                         |
                         v
          [filesystem, recipient, external software]
```

Trust changes occur at five points:

1. **Supply to origin:** repository and dependency content becomes public static code.
2. **Origin to browser:** Cloudflare and the network deliver application assets; response policy must be present.
3. **File to quarantine:** attacker-controlled bytes enter a bounded parser but are not yet workspace state.
4. **Quarantine to working copy:** operator approval plus apply-time validation admits canonical data.
5. **Browser to file:** reports, catalog/archive exports, operational documents, and backups leave application control as plaintext.

The IndexedDB origin tuple—scheme, host, and port—is a security and continuity boundary. A preview domain, apex domain, and `www` host have different stores.

## Protected assets

| Asset | Security objective |
| --- | --- |
| Operator device and browser responsiveness | A selected file should not cause unbounded parser work or DOM construction within documented limits. |
| Working workspace | Unreviewed input must not mutate it; committed state must conform to exact bounded DTOs. |
| Source evidence | Accepted source fields must remain available for comparison and must not silently disappear because a line is malformed. |
| Revision and audit consistency | Stored state, revision digests, and linked events must agree or validation must fail. |
| Saved local generations | Active and prior bytes must be manifest-bound; failed bytes must not be silently overwritten during open/reconstruction. |
| Confidential operational information | Application code must not create a remote workspace-data path; plaintext and platform boundaries must remain explicit. |
| Public notice | Only the fixed public projection should enter the notice; synthetic sample incidents must not be publishable. |
| Deployment integrity | Production must remain static, binding-free, and served with the defined response policy. |
| Accessibility of operational controls | Security and recovery actions must have perceivable labels, statuses, focus behavior, and keyboard access. |

## Actors and capabilities

### Expected operator

An authorized librarian uses a supported browser profile, selects local files, reviews transformations, applies changes, saves named workspaces, and controls exported files. The application assumes the operator can make mistakes and may open misleading metadata; it does not assume the operator is a security specialist.

### Malicious file producer

Can construct files with misleading extensions/MIME types, invalid UTF-8, DTD/entity constructs, namespace confusion, deep or wide structures, duplicate/unknown keys, prototype names, oversized arrays, malformed lines, formula-leading text, unsafe URLs, inconsistent identifiers, or semantically deceptive content.

### Local profile or device attacker

Can read or modify IndexedDB or downloaded files, execute code in the profile, or operate the unlocked application. This actor is outside the application's prevention boundary. Unkeyed digests can expose inconsistency but cannot stop a complete rewrite.

### Supply-chain or deployment attacker

Can attempt to alter repository content, dependencies, build output, DNS, or static-host configuration. Repository review, exact lockfile, automated release checks, account security, and DNS controls are the applicable layers. The browser application does not self-attest its delivered bundle.

### Hosting/network platform

Can observe and process ordinary DNS/TLS/HTTP metadata and serve assets according to platform configuration. Workspace bodies are not transmitted by application code, but the institution must evaluate platform logs, analytics, legal terms, and jurisdiction.

### Export recipient

Can receive plaintext HTML, JSON, XML, RIS, BibTeX, CSV/TSV, MARC mnemonic, or Markdown. Recipient software can interpret data differently, including spreadsheet formula behavior. The application cannot recall or govern a downloaded copy.

## Threat analysis

| ID | Threat or misuse case | Implemented controls | Failure behavior | Residual exposure |
| --- | --- | --- | --- | --- |
| TM-01 | Extension/MIME disguise | Extension/MIME agreement, exact supported formats, fatal UTF-8, content structure/version checks | Review remains blocked | An empty MIME is allowed for browser compatibility; content validation remains authoritative. |
| TM-02 | XML external entity or DTD processing | Pre-DOM rejection of DTD/entity declarations, processing instructions, and unsupported declarations | DOM construction is not attempted | The custom scan is not a complete XML specification implementation. |
| TM-03 | XML depth, width, or allocation pressure | Pre-DOM limits on elements, depth, nodes+attributes, per-element attributes, tag/text/value size; post-DOM count | File rejects at boundary | A file at the accepted maxima can still be expensive on a constrained device. Browser memory behavior is external. |
| TM-04 | Namespace confusion or ignored extension payload | Exact root namespaces, all-element namespace walk, namespaced-attribute check, format-specific child/attribute vocabulary | Entire import rejects; foreign nodes are not dropped | Unused `xmlns` declarations are allowed. The supported XML profiles are narrower than full standards. |
| TM-05 | JSON prototype/property injection | Forbidden `__proto__`, `prototype`, and `constructor` keys; plain-object/exact-key reconstruction | Import/backup/snapshot rejects | JSON is parsed before the bounded walk, within the file byte ceiling. |
| TM-06 | Silent record-array reduction | Per-field and per-record cardinality checks across interchange paths | Oversized record rejects; no prefix is committed | Scalar normalization uses separate length rules; semantic loss in lossy interchange mappings still requires review. |
| TM-07 | Malformed RIS/MARC line disappears | Explicit line generators and complete tagged-line grammars; blank-separator rules; retained evidence caps | Any malformed, misplaced, or excess line rejects the file | Valid but unsupported tags may be retained as evidence without canonical mapping. |
| TM-08 | BibTeX macros or executable-like grammar | Bounded grammar; directives, macros, concatenation, duplicate fields, malformed delimiters rejected | Entire BibTeX import rejects | Users must preprocess legitimate advanced BibTeX elsewhere; that tool becomes another trust boundary. |
| TM-09 | CSV/TSV formula execution | Formula-leading exports neutralized; exact versioned list/escape grammar | Export is text-oriented; malformed imports reject | Receiving software may override text interpretation. |
| TM-10 | SSRF or credential leakage through imported URL | No URL fetch; credential-free public HTTPS syntax policy; local/reserved literal addresses and secret-like query keys rejected | Record/config validation fails | DNS is not resolved; rebinding and future host behavior are not prevented. Clicking/exporting later leaves the boundary. |
| TM-11 | Unreviewed data mutates workspace | Non-mutating review, complete Original/New blocks, explicit Apply, apply-time provenance and shape revalidation | Active revision remains unchanged; rejection is auditable when applicable | A human can approve semantically malicious but structurally valid metadata. |
| TM-12 | Stale tab overwrites current state | Manifest token checked in atomic save; cross-tab change notification | Stale save rejects and must reopen/duplicate | No automatic merge; notification is best effort, while token enforcement is authoritative. |
| TM-13 | Partial or quota-failed save | Bounded serialization, optional quota preflight, one IndexedDB transaction | Transaction aborts; previous committed generation remains | Browser eviction or device failure remains possible. Quota estimates are advisory. |
| TM-14 | Active bytes silently roll back to unrelated prior bytes | Manifest binds both generation digests; active/manifest disagreement stops; fallback must be manifest-bound and fully valid | No fallback on digest disagreement; verified fallback is unsaved | An actor controlling all stored bytes/digests can forge a consistent replacement. |
| TM-15 | Corrupt/orphan storage is hidden or destructively repaired | List surfaces quarantine; bounded inspection; explicit candidate verification; new-name/new-UUID reconstruction | Original bytes remain unchanged | Reconstruction is a copy, not forensic proof. Quarantined data remains plaintext until governed deletion. |
| TM-16 | Backup protection misunderstood | v2 requires `plaintext-json-not-encrypted`; UI names plaintext JSON; full digest/snapshot validation | Misstated/missing marker rejects | Marker does not encrypt. Legacy v1 lacks the marker but remains reviewable. |
| TM-17 | Audit hash is mistaken for identity or nonrepudiation | Full chain/state verification plus documentation of limitations | Internal mismatch fails validation | No signer, external anchor, trusted time, authenticated actor, or guaranteed truncation detection. |
| TM-18 | Workspace data is uploaded or tracked by app | Static architecture, no application API, `connect-src 'none'`, no application analytics/cookies/telemetry | Browser blocks script connections under correct CSP | Cloudflare still receives normal asset-request metadata; extensions or compromised assets are external. |
| TM-19 | Clickjacking or active third-party content | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, same-origin policies, self-only scripts/styles, no objects/forms/workers | Compliant browser blocks prohibited context/resource | Header presence must be verified on the live canonical host. |
| TM-20 | Generated report runs active or remote content | Escaped data, no scripts/links/base/forms/frames/objects, embedded resources, document CSP denying all by default | Report is inert in a conforming browser | Technical Report can disclose its plaintext contents if shared. HTML viewers may ignore CSP. |
| TM-21 | Public notice leaks internal evidence | Fixed projection excludes raw workspace material and sample incidents block generation | Generation is unavailable when projection conditions fail | Service categories and incident status can still be sensitive; publication needs human approval. |
| TM-22 | Large index freezes list UI | Shared 100-row pagination contract and bounded parent-result selector | Only bounded rows render per page/result set | Search/filter work still runs over bounded in-memory workspace collections. |
| TM-23 | Security action is inaccessible | Native controls, labels, focus styles, live status/alerts, draft-loss guards, bounded scroll regions | Static and source-level regression tests detect selected regressions | No completed assistive-technology/browser matrix or independent accessibility audit is claimed. |
| TM-24 | Origin cutover strands local data | Origin dependence documented; explicit plaintext backup/open path | Migration requires operator export/import | DNS cannot migrate IndexedDB. Missing the procedure can cause apparent loss. |
| TM-25 | Dependency or deployment mutation | Exact lockfile, separate typechecks, deterministic tests, dependency audit, artifact validator, strict dry run | Release gate must stop | CI/account compromise and zero-day vulnerabilities remain external risks. |

## Abuse-case detail

### Foreign XML content hidden beside valid content

An attacker supplies a valid root and visible title but adds a foreign-namespace element or attribute carrying a different title or active-looking markup. The namespace walk sees the foreign namespace and rejects the entire file before mapping. A same-namespace but unsupported child also fails the structure-specific allowlist. Merely declaring an unused namespace does not fail because it contributes no record content.

### Oversized arrays intended to look successful

An attacker supplies 51 creators, identifiers, or analogous values and relies on a mapper to take the first 50. `importedRecord` and the format-specific parsers reject the record. Tests exercise this behavior across JSON, RIS, MARC mnemonic, MARCXML, Dublin Core, and MODS, as well as supported/rejected array shapes in CSL and JSON-LD.

### Corrupt active generation with a plausible prior copy

If active bytes no longer validate but the stored active digest and manifest digest still agree, open may try the prior generation only when that prior digest is present in the manifest and the prior payload fully validates. If active generation and manifest disagree, open stops without fallback because the manifest authority itself is in dispute. Recovery does not promote or overwrite stored bytes automatically.

### Invalid manifest with a usable generation

Normal listing returns a quarantine condition rather than filtering the invalid record. The operator explicitly inspects a generation. Only a self-consistent, fully valid workspace becomes a candidate. Reconstruction rechecks the digest, assigns a new UUID, records source generation/digest in the new audit event, and leaves the source manifest/generation unchanged.

## Assumptions that must remain true

- The canonical production host serves the committed static build and response headers.
- The application remains free of runtime data bindings and application network endpoints.
- Operators do not place secrets or unapproved restricted data in plaintext workspace fields or exports.
- Browser and device controls are appropriate for the selected data classification.
- The institution preserves external source files and authoritative system records when evidentiary custody is required.
- Operators review Original/New blocks and do not equate parser acceptance with metadata truth.
- Public notices receive institutional publication approval.
- GitHub, Cloudflare, Hover, and endpoint accounts use institutionally governed identity, least privilege, recovery, and logging.

If any assumption is false, the owning institution must add an external control or change the system design before use.

## Required validation

Automated evidence covers parser boundaries, exact DTO validation, storage generations, backup envelopes, pagination, interface source contracts, response headers, and report structure. Before production acceptance, the institution must also perform the manual and external checks listed in [`VALIDATION_REPORT.md`](VALIDATION_REPORT.md), including live-header inspection, browser/assistive-technology testing, account-policy review, origin migration rehearsal, and handling approval for intended data classes.
