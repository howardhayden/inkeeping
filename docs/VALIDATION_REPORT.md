# Validation report

## Record identification

| Field | Value |
| --- | --- |
| Report ID | `VR-2026-08-21-04` |
| Evidence time | 2026-08-21T23:06:17Z |
| Repository base commit | `48c02336559c34366d739d1727e833cbd6115264` |
| Candidate state | Modified working tree; not an immutable release commit |
| Execution environment | Linux 6.18.35 x86_64; Node.js v24.19.0; npm 11.9.0 |
| Prepared for | Engineering assurance review |
| Release decision | **Pending** — the complete local release gate passed, including lint, all TypeScript targets, fresh verified builds, 139 tests, dependency audit, static Cloudflare artifact validation, and strict Wrangler dry run; an immutable release commit, live-host checks, and external acceptance evidence remain outstanding |

This report records commands actually executed against the identified working tree. It is not a certification, deployment record, accessibility-conformance claim, standards-conformance claim, or vendor-acceptance claim. A change to implementation, tests, dependencies, build configuration, or generated artifacts invalidates the affected result until the command is rerun.

## Executed release evidence

### Complete release gate

Command:

```sh
VITE_SITE_URL=https://inkeep.ing npm run release:check
```

Result: **PASS**.

The command completed, in order:

1. `npm run lint` across the repository;
2. `npm run typecheck` for the application, checkpoint adapter/worker, and tooling configurations;
3. `npm test`, comprising fresh Vite application and Sites checkpoint-adapter builds, artifact validation, and all `tests/*.test.mjs` files;
4. `npm run audit:dependencies`, the high-severity dependency advisory audit;
5. `npm run validate:cloudflare`, repeating static-asset artifact validation after the audit; and
6. `npm run deploy:dry-run`, whose wrapper validates the artifact once more before the strict, no-upload Wrangler deployment check.

Node test-runner result: **139 tests, 139 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**. Node-reported duration: 1593.485962 ms.

Fresh artifact sizes reported by Vite:

| Artifact | Size | Gzip |
| --- | ---: | ---: |
| `dist/client/index.html` | 2.29 kB | 0.81 kB |
| `dist/client/assets/index-DSwMZGtL.css` | 32.59 kB | 6.70 kB |
| `dist/client/assets/vendor-Bfx28lbG.js` | 189.61 kB | 59.61 kB |
| `dist/client/assets/index-BymJpo8m.js` | 435.45 kB | 160.49 kB |
| `dist/server/index.js` | 1.15 kB | 0.57 kB |

The 139 declarations span 12 suites. Parameterized tests exercise more cases than the declaration count. The inventory is maintained in [`TESTING.md`](TESTING.md).

### Dependency audit

Command:

```sh
npm run audit:dependencies
```

Result: **PASS** — `npm audit --audit-level=high` reported `found 0 vulnerabilities` against the current lockfile. This is a registry advisory result at the execution time, not proof that dependencies contain no vulnerabilities.

### Cloudflare artifact validation

Command:

```sh
node scripts/validate-cloudflare-build.mjs --production-origin
```

Result: **PASS** — `Cloudflare static-asset artifact validated.` The production-origin mode verified that the built canonical host is `inkeep.ing`, not a reserved, checkpoint, preview, or `workers.dev` host.

The validator checks the built artifact and static hosting contract. It does not contact a live deployment or prove Cloudflare account settings.

### Diff hygiene

Command:

```sh
git diff --check
```

Result: **PASS** — no whitespace errors were reported.

### Wrangler dry run

Command:

```sh
VITE_SITE_URL=https://inkeep.ing npm run deploy:dry-run
```

Result: **PASS**. Wrangler 4.125.0 read 17 static assets, reported a total upload of 0.31 KiB (0.22 KiB gzip), found no bindings, and exited at `--dry-run` without uploading or deploying.

The earlier managed-runtime failure was caused by environmental leakage: Wrangler inherited network proxy variables and attempted to use a global configuration location that was not writable. The dry-run path now self-wraps in a repository-local writable runtime and removes inherited HTTP, HTTPS, and all-proxy variables before invoking Wrangler. This isolation is limited to the local compile-and-validation dry run; preview and production deployment paths retain their authenticated network environment. The corrected command also passed when deliberately invoked with nonresponsive proxy endpoints.

## Control results represented in the passing suite

### Hostile XML

- The forward scan rejects DTD/entity content, non-XML processing instructions, malformed tokens, excessive pre-parse element/depth/node/attribute/text limits, and parser-confusing structures before `DOMParser`.
- Foreign elements and applied foreign attributes reject. An unused namespace declaration remains permitted because it contributes no record content.
- MARCXML, MODS, OAI Dublin Core, and all three EAD profiles apply closed structure and attribute rules after parsing.
- OAI Dublin Core permits namespace declarations but no semantic attributes on wrapper, record, or DCMES leaf elements.
- MODS permits only six documented attribute locations with bounded values; every accepted attribute becomes an **Original input** source-evidence element, and every unsupported attribute rejects.

### No silent cardinality reduction

- Oversized catalog arrays reject across all supported interchange paths rather than being sliced or reduced.
- RIS and MARC mnemonic parse every source line. Leading, repeated, intra-record, and otherwise malformed blank lines reject; at most one blank separator is allowed between complete records; a terminal line ending is not treated as another record.
- The bounded BibTeX parser supports nested braces and quoted/braced/numeric literals while rejecting directives, macros, concatenation, duplicate fields, malformed delimiters, excessive nesting, and field/evidence overflow.
- Large list integrations use the shared 100-row pagination contract and keep the selected record on its containing page.

### Archival loss controls

- EAD4, EAD3, and EAD 2002 reject a populated field outside the fixed 15-field core.
- An editable core ID cannot bypass that check: populated core fields must retain the fixed kind, repeatability, EAD mapping, and scalar/array shape; required reference code and title values must be present.
- There is no local-note, scalar-joining, or silent-omission fallback. The native schema package is the lossless path for custom data and schema semantics.
- Controlled multiline editors preserve a trailing Enter while typing, split only at newlines, preserve semicolons and validation-significant whitespace, and remove only zero-length lines at commit. Embedded newlines inside one vocabulary term or repeatable value reject as ambiguous.

### Persistence, integrity, and disclosure

- Named IndexedDB workspaces use optimistic tokens, digest-bound active/prior generations, bounded inspection, fail-closed quarantine, and explicit reconstruction into a new UUID without rewriting source bytes.
- Workspace-backup version 2 requires `protection: "plaintext-json-not-encrypted"`; the interface names the downloads as plaintext JSON.
- Revision and linked-event validation detects inconsistent local state. The tests and documentation do not treat an unkeyed hash chain as proof of identity, authorization, custody, trusted time, or nonrepudiation.

### Reports, response policy, and blank start

- The application starts blank and loads Sample data only after an explicit action.
- Technical Report and Public Notice outputs are static post-run notebook HTML with embedded Jost assets, offline CSP, semantic no-crossing-line diagrams, bounded output, escaping, and deterministic fixed-input behavior.
- Production configuration is static, binding-free, and contract-tested with restrictive response headers. Live response and browser-network capture remain external evidence.

## Tested-file and artifact fingerprints

These SHA-256 values identify selected files at the evidence time. They are not signatures and do not capture the complete module/dependency graph.

| File | SHA-256 |
| --- | --- |
| `app/lab-core.ts` | `6fda5294157b15f7ca8dca1e65af1ed47c3b90d6156b32264d1b5430e3975c2f` |
| `app/xml-safety.ts` | `bb864c1126a229c553445514b72b7cea1a489722420211f207904b7de99a5333` |
| `app/archival-schemas.ts` | `13f38aad4c66d8e291ee273750d28cdabb3e9db50f6e07a36335a9caf25b11f4` |
| `app/continuity-lab.tsx` | `cca708932631f4bb537ffeb5b4044f163d3f28d0ce2cafd4a34d54f89d8c7479` |
| `app/lab-storage.ts` | `02285d6315d6c1ea470b238873519930ed1f6f0c38fb27348d2b7e3fadc86d19` |
| `app/list-pagination.ts` | `e80609d8c323506f431576dac28ccf409877f62245445f52b2f8fadc9680f7b4` |
| `app/workspace-backups.ts` | `57aa98d3dc26c1350bdf0d234c37165c9b7a7d97e6416e9896595f16daabe696` |
| `tests/lab-core.test.mjs` | `b7cfaceb2792d24fb7b7e8c577243a4d44e852a3150b3a1b7b877801515df2d6` |
| `tests/archival-schemas.test.mjs` | `e1f870066b6f05c7839145b8da11a8d71ece152ed8b11933c3b137d7fcd1a578` |
| `tests/interface-contracts.test.mjs` | `af58696d71cc27bb8b6c3cdcc76e52ebc8f8b3774b2cfab26d2bb34ed6e4fcaf` |
| `tests/documentation-contracts.test.mjs` | `187355cbcb5163caa2ab7ebeda6d483e7e53475b439bf2daf3a43d8e9e0ed808` |
| `tests/production-contracts.test.mjs` | `c2505ba36b3ce434de824cfea054ba351d8f3b7822f9a965b55116189e3d57dc` |
| `scripts/cloudflare-deploy.sh` | `6bbba44dc3aefbfd8ed65d9139ba2b6ac598cd2a3410d4c5588e5d2a5b56bf4b` |
| `scripts/sites-env.sh` | `2e494e4d11ccb0a60ffff49824503fb6c9f05e5ea924a4c0e68d1cafa6c36ffb` |
| `.github/workflows/ci.yml` | `d561f0c4e7f0bd3d12571767f1c42e2a60d757690b06f52329428b448e5933f0` |
| `docs/DEPLOYMENT.md` | `6dca0997596fbb41f83dbfff7e52c76639ed305b14eb9efa1f11c4a60fd34247` |
| `package.json` | `a0f41d70a8225c66a8f1c31c568c1ae359a99590d3a8376fcac51bf6dfc43f1c` |
| `package-lock.json` | `f0d9a17b6051393adf7e4e00c26a0b0c8163c395d0e8e42322e69391d69e7733` |
| `wrangler.jsonc` | `ea1baeec10327439fbc8ecf37cab84af64f2d6df197eb5eed51da9572b87ad54` |
| `scripts/validate-cloudflare-build.mjs` | `8c549ccb6fe98fcf2bb4999447603b246d63aa98b24438c5c00874c1ffc2e1b5` |
| `dist/client/index.html` | `e791e11d44ced772415d4587a0968fd4d16b393ac2751e0f10e11effdf83e95e` |
| `dist/client/assets/index-BymJpo8m.js` | `f1479bb796db5a35e58e8126fcf27db080323216c9a5aab226e7fe83ccaf5b83` |
| `dist/client/assets/index-DSwMZGtL.css` | `65cd38692303b94aee78ea1c74e774913a1de1030a397023c696452433fd0093` |
| `dist/server/index.js` | `055a880123df68130e9160878f34b3871fefba61adddd9aae1e3657da846cfbe` |

The working-tree fingerprints are subordinate to an immutable release commit. Build hashes can change across toolchain/environment changes even when source semantics do not.

## Evidence not completed by this report

The following remain required before a production acceptance decision:

- immutable commit/tag and CI log for the exact candidate;
- canonical-domain DNS, TLS, response-header, cache, redirect, and browser Network-panel capture;
- Cloudflare, GitHub, and Hover account/security/privacy configuration review;
- keyboard, zoom/reflow, contrast, forced-colors, reduced-motion, and institution-supported browser/assistive-technology evaluation;
- representative institution-supported catalog, archival, spreadsheet, discovery, preservation, and repository product/version import-export checks;
- official EAD XSD validation and receiving-system staging where EAD will be used;
- canonical-origin migration, restore, and recovery rehearsal;
- institutional privacy, security, accessibility, records-management, communications, and data-governance decisions; and
- owner/date/disposition for every accepted residual risk.

## Release acceptance record template

| Field | Required entry |
| --- | --- |
| Release commit/tag | Immutable SHA and tag |
| UTC execution time | ISO 8601 |
| `npm ci` | Exit status and log link |
| `npm run release:check` | Exit status, test totals, CI log link |
| Dependency audit | Finding count and accepted-advisory record, if any |
| Artifact | Deployable artifact digest and validation output |
| Wrangler dry run | Exit status and retained output |
| Live origin | Exact HTTPS URL |
| Live headers/network | Capture record and reviewer |
| Accessibility | Browser/AT matrix record and open issues |
| Interoperability | Product/version/fixture results |
| Recovery rehearsal | Source/destination origin, counts, digests, result |
| External governance | Cloudflare/GitHub/Hover/data/privacy/records decisions |
| Accepted residual risks | Risk IDs, authority, expiry/review date |
| Decision | Approved, conditionally approved, or rejected; named approver/date |

## Conclusion

The current modified working tree passed the complete release gate: fresh builds, all 139 tests, the dependency audit, static Cloudflare artifact validation, and the strict Wrangler dry run. The recorded controls support the hostile-import, loss-prevention, pagination, and plaintext-disclosure behaviors for this candidate. Production acceptance remains pending only on the immutable release/CI record and the live-host, accessibility, interoperability, recovery, and institutional-governance evidence identified above.
