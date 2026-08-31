# Operations and recovery

This runbook governs a deployed IN KEEPING origin and the browser-local work performed through it. It is written for service owners, web services staff, systems librarians, records stewards, and incident responders.

## Operating boundary

IN KEEPING has no application server, user account, remote workspace store, API, telemetry endpoint, or server-side recovery copy. Cloudflare serves static HTML, CSS, JavaScript, fonts, images, and response headers. Parsing, comparison, validation, hashing, revision construction, reports, and IndexedDB operations occur in the operator's browser.

Operational ownership therefore has three distinct layers:

| Layer | Owner | What can be observed or recovered |
| --- | --- | --- |
| GitHub and release pipeline | Repository maintainers | Source, review, checks, build artifacts, SBOM, release commit |
| Cloudflare and DNS | Web/DNS service owner | Asset deployment, HTTP/DNS availability, certificates, ordinary platform request metadata according to account settings |
| Browser profile and downloaded files | Operator and institutional endpoint/storage owners | In-memory work, named IndexedDB workspaces and local anchors, reports, plaintext backups, unsigned receipts |

The first two layers cannot inspect or restore the third. `observability.enabled` is false in `wrangler.jsonc`, the CSP uses `connect-src 'none'`, and application code has no data-submission path. Account-level Cloudflare products and retention settings remain an infrastructure governance decision; the repository cannot configure or attest to them.

## Roles

Assign named people or groups before production use. One person may fill multiple roles only when institutional segregation-of-duties policy permits it.

| Role | Responsibilities |
| --- | --- |
| Product steward | Scope, workflow fitness, retention interpretation, release acceptance |
| Repository maintainer | Reviewed changes, protected branch, dependencies, release evidence |
| Cloudflare owner | Workers Builds, deployment, domain, certificate, rollback, platform settings |
| DNS/registrar owner | Hover registration, nameservers, DNSSEC, mail and unrelated record continuity |
| Records/data steward | Approves real-data use, access, backup location, retention and disposal |
| Accessibility reviewer | Keyboard, reflow, screen reader, report and error-path evaluation |
| Incident commander | Severity, containment, communications, evidence, recovery decision |
| Operator | Reviews imports, applies changes, saves explicitly, exports and handles local files |

## Routine operating procedure

### Start a work session

1. Navigate to the exact approved canonical HTTPS origin from a managed browser profile.
2. Confirm the address bar has no alternate host, port, preview, `workers.dev`, or Sites checkpoint hostname.
3. Open the intended named workspace and confirm its name and counts before editing, or begin with the blank in-memory workspace.
4. If the browser reports storage not persisted, follow endpoint policy before substantial work. A persistence request is only a browser request; it is not a durability guarantee.
5. Import only through the review workflow. For catalog files, inspect the complete **Original input** and **New output** blocks. Supply an explicit admit-unverified, reject, or withdraw disposition for the unchanged review; no disposition grants authority. Archival review uses its bounded schema/record summary rather than claiming a retained per-record original source.
6. Save deliberately at meaningful checkpoints. A working copy is not saved merely because the page remains open.
7. Check continuity status. An unanchored workspace requires an explicit baseline acceptance before ordinary outward use; a continuity failure must be preserved and investigated, never silently re-anchored in place.

### End a work session

1. Resolve or record blocking findings and unsaved drafts.
2. Explicitly save the named workspace and confirm the saved timestamp/counts update.
3. If ordinary outward artifacts are required, retain and compare a fresh receipt for this exact generation, confirm that continuity/evidence/finding gates pass, and generate only after the two click-time saved-state checks succeed.
4. Download the current-session backup for workspace-payload recovery. After the final anchored save, separately download the exact-state continuity receipt.
5. Move backup and receipt to approved protected storage outside the browser-local failure/control domain; do not leave them in a general Downloads folder longer than policy allows.
6. Close record evidence and reports before screen sharing or handing over the device.

### Generate outward artifacts

1. Use a named workspace whose current session is clean and non-recovery. Download/retain the exact current receipt outside the browser-local control domain and compare it so status is `continuity-corroborated`; local checkpoint equality is insufficient.
2. Resolve ordinary findings and active unverified/unattributed evidence. A later withdrawal retracts a claim but does not authenticate or remove retained content; removing scoped entities may end the active barrier while the historical decision remains reportable.
3. Request the artifact. The UI reopens the exact named generation with that same receipt, checks token/state/audit/revision/anchor/evidence, renders from the reopened snapshot, and reopens/rechecks the receipt and fingerprint after construction before file activation.
4. If any storage, freshness, continuity, or evidence check fails, preserve the diagnostic Technical Report or current-session backup as appropriate, reconcile the state, and retry. Do not bypass the gate with a low-level serializer.
5. Confirm the browser actually created/opened the expected file, inspect its content, record the source generation/check time externally when required, and obtain destination/publication approval.

The lease establishes correspondence at its verification instants. IndexedDB and browser file activation are not atomic; another tab can save immediately afterward. A downloaded file has no continuing freshness signal, revocation, authenticity proof, or institutional approval.

### Recurring service checks

| Cadence | Check | Evidence |
| --- | --- | --- |
| Each release | Release gate, exact canonical metadata, header/status matrix, synthetic workflow, browser/accessibility matrix | Release record |
| Weekly | Canonical root and 404 synthetic probes; certificate and DNS/mail status; failed Workers Builds | Operations log without record content |
| Monthly | Cloudflare/GitHub administrators, MFA, Git integration, branch rules, platform logging/analytics settings, backup destination access | Access review |
| Quarterly | Restore drill from an approved synthetic plaintext backup into a disposable profile; quarantine reconstruction drill | Recovery record |
| At dependency PRs | Lockfile, dependency review, license/SBOM delta, tests, upstream notices | Pull request and release record |
| At domain/account changes | Origin migration, complete DNS/mail inventory, DNSSEC, ownership and decommission plan | Approved change ticket |

Do not place workspace names, record titles, imported evidence, incident notes, report files, or backups into general monitoring systems.

## Monitoring boundary

### What to monitor

Use an external synthetic probe that performs only `GET` or `HEAD` against public static paths:

- canonical `/` returns 200 over HTTPS;
- one known hashed asset returns 200 with immutable caching;
- a generated unknown path returns 404;
- CSP, `nosniff`, referrer, framing, cross-origin, permissions, and HSTS headers remain present;
- noncanonical web variants redirect once to the exact canonical origin;
- DNS, certificate, and mail records resolve as approved; and
- the latest protected-main Workers Build completed successfully.

Use a synthetic path with no personal or record data. Retain only the minimum URL, timestamp, response status, latency, and relevant header values needed for availability operations.

### What not to monitor

- Do not add client analytics, session replay, error beacons, remote fonts, tag managers, or RUM scripts.
- Do not ask the browser to upload workspace health, names, counts, imported filenames, digests, or incident content.
- Do not use production records in availability tests.
- Do not interpret Cloudflare request analytics as application activity or successful workspace use.
- Do not claim that disabled Worker observability disables all Cloudflare account, DNS, security, or edge metadata processing. Review the account itself and document the institution's configuration and disclosure.

Browser performance and workflow validation are release-lab activities performed with synthetic fixtures. They are not continuous surveillance of operators.

## Browser-local storage

### Normal save invariant

A named workspace save validates the complete snapshot and audit ledger, applies the 25 MiB serialized boundary and browser quota preflight, and computes a SHA-256 payload digest. Before opening the write transaction, a normal save re-reads and internally validates the manifest-bound active generation and the prior generation that rotation would delete. If a local continuity anchor exists, the base must match it and the complete old audit must be an exact prefix of the new audit. A reset ledger cannot advance that anchor by merely naming the old terminal hash; rollover requires a new workspace/lineage and explicit baseline. The transaction then rechecks the optimistic token and current anchor before committing the manifest, immutable generation, and advanced anchor atomically. The manifest binds both retained generation digests. If any base, digest, token, or anchor check fails, rotation is refused and no stored generation or anchor is changed.

A recovery save has stricter preconditions: before opening the write transaction it revalidates the selected manifest-bound fallback, confirms the active generation is still invalid without an active/manifest digest disagreement, and requires the submitted workspace to match that fallback byte for byte. Inside the transaction it rechecks the token and selected recovery generation. Altered recovery content must be saved under a new workspace instead of being substituted into the damaged slot.

The token prevents accidental overwrite by a stale tab. The local anchor detects workspace-only regeneration while the anchor remains unchanged. Neither authenticates a person, authorizes access, proves source truth, or prevents coherent replacement of every browser-local store. An independently held exact receipt supplies only a comparison point.

### Continuity receipt residuals

- **No multi-generation successor proof:** a receipt proves equality with one exact checkpoint only. A legitimate save makes the prior receipt stale, and the application does not emit a recipient-verifiable proof covering every intervening generation. Retain and compare a fresh exact receipt for each generation used for ordinary output; keep prior receipts under external records policy when the sequence itself matters.
- **No receipt-bootstrapped clean-device restore:** a receipt contains no workspace payload and is bound to the old workspace ID/lineage. A backup omits the local anchor. On a clean device/origin, preserve both as external transition evidence, review the backup as unverified, create a new workspace, explicitly accept a new baseline, and retain/compare a new receipt. This does not cryptographically continue or authenticate the old lineage.

### Revision and audit capacity

The workspace retains at most 20 revision bodies and 5,000 audit events. Revision rotation removes the oldest body only after a valid successor exists; the later audit chain cannot reconstruct that removed body. Event 5,000 remains a valid state-bound event without an additional redundant save event. Further state-changing actions stop at capacity.

Before reaching the audit boundary, download the Technical Report and current-session backup, then create or duplicate a successor workspace through the supported UI. The successor's first event records lineage to the predecessor ledger hash. Treat the predecessor and successor together under the institution's records schedule; a technical successor is not authorization to dispose of the prior workspace.

### Plaintext backup handling

Current backups use the versioned `in-keeping/workspace-backup` envelope and carry `protection: plaintext-json-not-encrypted`. They contain the complete bounded workspace payload and may include restricted records, source evidence/dispositions, operational incidents, staff-entered notes, configuration, retained revisions, and audit events. They exclude IndexedDB manifests/generations/tokens, the separate local continuity anchor, and downloaded receipts. They do not prove that underlying evidence or nested claims are authentic or institutionally complete.

Required handling:

1. Download only by explicit operator action.
2. Assume the browser and operating system may retain a local copy, recent-file entry, thumbnail, backup, or synchronization copy.
3. Move the file into institutionally approved encrypted storage with named access groups.
4. Use institutional transfer tools for handoff; do not attach real backups to public issues, ordinary chat, or unapproved email.
5. Apply the records schedule for the underlying content, not the application's two-generation or 20-revision technical cap.
6. Record destruction where required, including known synchronized or endpoint copies.

The backup digest detects accidental alteration after exact validation. It does not provide encryption, authentication, nonrepudiation, trusted time, or proof of custody.

## Recovery decision tree

```text
working copy still open?
        |
        +-- yes --> download current-session backup before reload
        |
        +-- no --> can named workspace open normally?
                      |
                      +-- yes --> verify counts/audit; continue
                      |
                      +-- no --> did app open manifest-bound prior generation?
                                    |
                                    +-- yes --> treat as unsaved recovery copy
                                    |           export, create new named slot, verify
                                    |
                                    +-- no --> storage inspection required
                                                inspect one candidate
                                                reconstruct under new UUID/name
                                                retain quarantined source bytes
```

### A. Unsaved working copy, quota denial, or save failure

1. Do not reload, close the tab, clear site data, update the browser, or change origins.
2. Read the error and preserve it without record content.
3. Download the current-session plaintext backup.
4. Move the file to approved protected storage.
5. In a separate disposable profile, open the backup only with an explicit admit-unverified disposition, confirm the review, create a new named workspace, save, reopen, and compare counts. Treat it as a new unanchored lineage; preserve the old backup/receipt and explicitly accept/document a new baseline only after review.
6. Investigate browser quota, storage policy, or stale-token conditions only after recovery is verified.

Quota preflight is advisory because the browser controls allocation and eviction. A successful save does not replace institutional backup.

### B. Stale-tab token conflict

The operation stops before overwrite.

1. Export the unsaved tab as a current-session backup.
2. Open the latest named workspace in another clean tab and identify the expected current generation.
3. Reconcile changes manually using the application's bounded displayed records or institutionally approved comparison tooling.
4. Save a deliberate successor or create a separate named workspace.
5. Do not bypass the token in IndexedDB developer tools and do not assume last-writer-wins semantics.

Ordinary authoritative output also reopens storage at click time, so a delayed or missing cross-tab notification does not authorize a stale derivative. If storage changed before or during construction, activation stops. Current-session backup remains available specifically to preserve the conflicting open copy.

### C. Manifest-bound prior generation

On open, the active generation must match its stored digest and the digest bound by the manifest, then pass complete snapshot and audit validation. The manifest timestamp must match the stored generation timestamp; manifest and generation byte counts must match the validated serialization; and the manifest name and domain counts must match that payload. Any display-metadata disagreement quarantines the entry instead of presenting the manifest summary. These are internal-consistency checks, not authenticity or completeness proofs. A digest disagreement between active bytes and the manifest stops the operation; the application does not hide it by opening a fallback.

If the active generation is missing or structurally invalid without that digest disagreement, a prior generation may open only when the same manifest binds its digest and the complete prior payload passes full internal validation. The UI presents it as an unsaved recovery copy.

Opening that copy:

- does not rewrite the manifest;
- does not delete or replace either generation;
- does not assert that the failed active bytes are harmless; and
- does not persist the recovered copy.

Immediately download a backup, create a new named workspace, save, reopen, and compare it. Preserve the original local storage until the incident owner approves disposition.

Legacy manifests without a prior-generation digest may open a valid bound active generation, but their unbound fallback is never trusted.

### D. Explicit quarantine inspection and reconstruction

Invalid manifests, orphan generations, unreferenced generations, missing referenced generations, and malformed generation indexes are not silently filtered from the workspace list. The list operation reports that storage inspection is required.

Inspection is bounded to 100 manifest entries and 256 generation keys. Its defensive object walk is bounded to 1,000,000 nodes and depth 18. Exceeding a boundary stops inspection; it is not an instruction to raise the cap in production.

Recovery procedure:

1. Record the origin, browser/profile, release, quarantine reasons, workspace ID when available, and generation numbers. Do not copy payload content into the incident system.
2. Select one quarantined generation through the UI.
3. Let the application recompute the stored payload digest and validate the complete snapshot, revisions, archives, service records, URLs, and audit ledger.
4. If inspection returns no internally consistent candidate, stop. Preserve the browser profile under institutional incident handling; do not hand-edit IndexedDB.
5. If it returns a candidate, review its exact name, timestamp, digest, size, and counts.
6. Choose a new, unique workspace name and explicitly confirm reconstruction.
7. Reconstruction rereads and revalidates the same generation and expected digest, creates a new random workspace ID, adds a recovery/lineage event or forks a full ledger, and writes a separate saved workspace.
8. Open the reconstructed workspace, verify counts and audit status, download a new backup, and record the new workspace ID outside sensitive content.
9. Leave the quarantined source bytes unchanged until root cause, retention, and deletion are approved.

Reconstruction is salvage, not proof that the original manifest was authentic or that other generations are safe.

### E. Origin cutover or host mismatch

IndexedDB cannot be moved by DNS, redirects, Cloudflare rollback, or copying static assets. From the old exact origin, make a final anchored save and download both the plaintext workspace backup and matching unsigned receipt. At the new exact origin, review that exact backup, explicitly admit it only as unverified, open the unchanged review into memory, create a new named workspace, save, reopen, and compare. The old receipt cannot cryptographically continue the new workspace ID/lineage; preserve it as external transition evidence, then explicitly accept and document a new baseline. Repeat per workspace/profile. Keep the old origin until migration acceptance, then follow decommissioning.

### F. Browser profile loss or site-data deletion

If no approved backup exists, the application, GitHub, and Cloudflare cannot recover the workspace. Preserve endpoint backups or forensic images only under applicable institutional authority; do not promise recovery. Record the loss, affected retention/privacy obligations, notification decision, and corrective action.

## Incident response

### Severity guide

| Severity | Examples | Initial action |
| --- | --- | --- |
| Critical | Wrong production origin serving a modified build; suspected supply-chain compromise; restricted backup publicly exposed; zone-wide DNS/mail failure | Stop use/deployments, preserve evidence, invoke institutional security/continuity process |
| High | Import escapes quarantine; Public Notice exposes nonallowlisted content; active/manifest digest disagreement across known-good workspaces; security headers broadly absent | Disable affected workflow or roll back; preserve affected synthetic reproduction and local evidence |
| Moderate | Recoverable storage quarantine; stale-version client defect; a supported export rejected by receiving software; accessibility blocker | Contain workflow, use backup/reconstruction, schedule corrected release |
| Low | Cosmetic defect with no data, access, or task impact; documentation mismatch | Record and correct through normal change control |

Severity is adjusted for actual data classification, scale, exploitability, and institutional obligations.

### First response

1. Name an incident commander and scribe.
2. Record release commit, exact origin, timestamps, browser/OS, affected workflow, and whether real restricted data is involved.
3. Preserve the current working copy before reload with an approved plaintext backup when safe to do so.
4. Freeze deployment or DNS changes that could erase evidence or create more origins.
5. Use synthetic/minimal reproduction for GitHub. Follow the private vulnerability route in root `SECURITY.md` for security defects.
6. Decide whether to roll back assets, detach a domain, correct DNS, suspend a workflow, or continue under a documented workaround.
7. Validate recovery without overwriting or deleting the affected generations.
8. Make external notices only through institutional privacy, security, records, legal, accessibility, and communications owners as applicable.

### Evidence to retain

- Full commit SHA, release/deployment/version IDs, CI/Workers Build results, and SBOM.
- Exact response headers/status and DNS answers.
- Synthetic input that reproduces the defect.
- Backup digest, generation digest, workspace/generation IDs, and counts when needed, without embedding record content in general tickets.
- Browser console output only after reviewing it for sensitive values.
- Recovery actions, operator, time, and before/after identifiers.

The application's linked audit events are internal consistency evidence. They are not actor authentication, trusted timestamps, signatures, or a substitute for the institutional incident log.

### Closure

Close only after containment, recovery validation, affected-origin review, root-cause analysis, corrective test, release documentation, risk/traceability updates, and owner-approved retention/disposal. A postmortem should distinguish application defects from browser, platform, DNS, endpoint, and operator causes.

## Static-origin outage

A Cloudflare or DNS outage may prevent acquiring the application assets. It does not remotely delete IndexedDB. However, browser cache availability is not promised as an offline application and a new/reloaded tab may not start.

During an outage:

- keep any already open working tab open;
- download a current-session backup if the controls remain functional;
- do not clear site data or switch operators to an alternate hostname;
- preserve the canonical-origin decision;
- use approved downstream systems or documented continuity procedures for urgent authoritative work; and
- restore the same origin rather than creating a second live application store.

## Deployment rollback operations

Use the Cloudflare dashboard deployment history or current Wrangler rollback procedure to restore the last verified static-asset version. Record the version ID and verify the complete status/header/workflow matrix. Since production has no bindings or server data, the platform rollback concerns assets and configuration only; it still does not change IndexedDB or downloaded files.

Before rolling back across a workspace or interchange schema change, export current sessions and test the target release against a copy. Fail-closed rejection by an older release is safer than attempting to edit data it does not understand.

Correct forward from protected `main`; do not leave a dashboard-only production state.

## Decommissioning

Decommissioning is both an infrastructure change and a distributed local-data disposition project.

### Prepare

1. Name the decommission date, responsible owners, records authority, replacement workflow, and support end date.
2. Inventory every known production origin used over the service lifetime, including previews or earlier canonical hosts that may contain IndexedDB.
3. Notify operators not to create new work and provide the approved export/migration route.
4. For each retained workspace, download and verify a plaintext backup and required reports, import into the approved successor where applicable, and document acceptance.
5. Apply institutional retention, legal hold, privacy, and preservation requirements to release records, reports, backups, source, and platform metadata.

### Remove local data

After migration and authorization, delete named workspaces at each exact origin in each managed browser profile. Confirm that deletion does not imply deletion of:

- an open in-memory copy;
- downloaded files or operating-system/browser backups;
- synchronized folders or endpoint images;
- data imported into another system; or
- Cloudflare/GitHub/DNS operational metadata.

Close tabs and clear site data only after explicit confirmation that no needed workspace remains. Record completed profiles/devices where policy requires it.

### Retire infrastructure

1. Publish a final notice or controlled redirect according to service policy without exposing record content.
2. Detach the Custom Domain and remove only its web record after the retention window.
3. Preserve mail, verification, and unrelated DNS records.
4. Disconnect Workers Builds and revoke its access/token when no longer needed.
5. Archive the final source commit, lockfile, SBOM, release evidence, documentation, DNS record, and license notices.
6. Delete the Cloudflare Worker only after rollback and retention needs expire.
7. Keep, transfer, or expire the Hover registration under institutional domain policy; do not let a former application domain lapse while links, HSTS, or sensitive expectations remain.
8. Review Cloudflare and GitHub retention/deletion settings and document what those providers retain.

The final report must state which data was migrated, destroyed, retained, or could not be located. “Site deleted” is not a sufficient local-data disposition record.
