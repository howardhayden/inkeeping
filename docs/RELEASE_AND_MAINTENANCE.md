# Release and maintenance

IN KEEPING treats releases as evidence-bearing changes to a local records tool, not as an asset upload alone. This document defines the repository gate, change control, dependency stewardship, release record, rollback, and maintenance cadence.

## Source of release truth

A production release is one full Git commit SHA on protected `main` for which:

1. the pull-request assurance checks passed on the final reviewed content;
2. Cloudflare Workers Builds installed the committed lockfile and ran the same release gate;
3. root `wrangler.jsonc` deployed `dist/client` as binding-free static assets;
4. `VITE_SITE_URL` was the exact approved canonical HTTPS origin;
5. live status, header, DNS, workflow, and accessibility smoke checks passed; and
6. a release record identifies the deployment and retained SBOM.

A Git tag, GitHub release, Cloudflare deployment, or `package.json` version alone is not sufficient evidence.

## Version policy

The application follows Semantic Versioning:

- **Patch**: backward-compatible defect, documentation, security hardening, or accessibility correction that does not change an accepted external schema.
- **Minor**: backward-compatible workflow, record type, output, or field addition.
- **Major**: intentionally incompatible application, workspace, backup, import/export, or report contract.

Independent format versions remain explicit. The workspace-backup envelope, strict IN KEEPING packet, versioned CSV/TSV projection, schema package, and IndexedDB schema must not be inferred solely from the application version.

Compatibility claims require executable fixtures. A reader accepting an older version is allowed only when the implementation validates that exact older contract. Unknown versions and unknown envelope fields fail closed.

## Change classification

Every pull request identifies all affected classes:

| Class | Required review/evidence |
| --- | --- |
| UI/task flow | Keyboard, focus, reflow, labels, status announcement, draft-loss, target-browser checks |
| Catalog import/export | Governing specification, hostile and maximum-boundary fixtures, exact round trip or named loss, receiving-software evidence |
| Archival schema/interchange | Schema version, hierarchy/cardinality boundaries, EAD/AtoM/ArchivesSpace/DCTAP fixtures, crosswalk limits |
| Service-register model | Field definition, storage/exchange formatting, validation, export/re-import evidence |
| Storage/backup | Migration, exact envelope, token/concurrency, digest binding, failure atomicity, recovery and rollback |
| Audit/revisions | State binding, chain verification, cap rotation, residual assurance limits |
| Public Notice/report | Fixed projection/redaction, offline CSP, document size, accessibility, diagram/layout review |
| Security/privacy | Threat/risk update, hostile input, data-flow or platform-boundary review |
| Deployment/DNS | Exact origin, header/cache matrix, DNS/mail preservation, rollback owner |
| Dependency/toolchain | Lockfile, audit, dependency review, licenses, SBOM delta, build reproducibility |

Changes that create a remote request, account, credential, API, server store, runtime binding, analytics path, new origin, or background processing are architectural changes. They require an accepted ADR, privacy/security review, operating owner, data lifecycle, failure behavior, and revised public disclosures before implementation is accepted.

## Release gate

The authoritative command is:

```sh
VITE_SITE_URL="CANONICAL_ORIGIN" npm run release:check
```

Replace the token with the exact production origin. The command expands as follows:

```text
release:check
  +-- verify
  |     +-- lint
  |     +-- typecheck
  |     |     +-- application
  |     |     +-- checkpoint Worker adapter
  |     |     +-- Node build tools
  |     +-- test
  |           +-- verified production build
  |           |     +-- dist/client static assets
  |           |     +-- dist/server Sites checkpoint adapter
  |           |     +-- artifact contract validation
  |           +-- deterministic unit/contract tests
  +-- npm audit at high severity
  +-- Cloudflare artifact validation
  +-- strict Wrangler production-config dry run
```

`scripts/build-verified.sh` applies bounded build execution and generates both surfaces because Sites checkpointing needs the adapter. `scripts/validate-cloudflare-build.mjs` enforces that production has no Worker entry point or binding and that the checkpoint adapter remains separate. `scripts/cloudflare-deploy.sh` refuses an absent build and disables Wrangler metrics/log files for the command environment.

The dry-run and checkpoint paths may validate an artifact built with a nonproduction placeholder. The production path does not: `npm run deploy:cloudflare` adds the validator's `--production-origin` requirement and rejects canonical hosts in the reserved `.example`, `.invalid`, `.test`, or `.localhost` namespaces and every `.chatgpt.site` or `.workers.dev` host. The final asset build must therefore run with `VITE_SITE_URL="CANONICAL_ORIGIN"` before production deployment. Supplying the variable only to the later deploy command cannot repair already-generated HTML, robots, or sitemap files.

Do not replace the gate with a successful development server, Sites checkpoint, or unreviewed `wrangler deploy`.

## Pull-request evidence

Before merge:

1. Use synthetic or correctly redacted fixtures; never commit a real backup or restricted record.
2. Describe the affected librarian workflow and authoritative-system boundary.
3. Add or update deterministic tests for success, exact maximum, one over maximum, malformed structure, and failure atomicity where applicable.
4. Demonstrate that no accepted input is silently truncated, skipped, or coerced.
5. Update user-facing definitions and complete **Original input** / **New output** records where the model changes.
6. Update `CHANGELOG.md`, governing documentation, risk register, traceability matrix, and validation report.
7. Record manual/browser/assistive-technology or receiving-software evidence when automation cannot establish the claim.
8. Run:

```sh
npm ci
VITE_SITE_URL="CANONICAL_ORIGIN" npm run release:check
git diff --check
```

9. Resolve review comments and rerun required checks on the final commit.

The repository template is part of the control. Reviewers should reject checked boxes that lack linked evidence.

## GitHub assurance

The committed workflows provide:

- `Production assurance` on pull requests and pushes to `main`;
- exact checkout and Node runtime setup;
- `npm ci` from `package-lock.json`;
- the full release gate;
- a CycloneDX JSON SBOM produced by `npm sbom` and JSON-validated;
- a per-commit artifact containing `dist` and the SBOM for 14 days;
- dependency review on pull requests with a `moderate` failure threshold; and
- CodeQL for JavaScript/TypeScript on pull requests, `main`, a weekly schedule, and manual dispatch.

GitHub Actions are pinned to full immutable commit SHAs. Version comments may describe the expected upstream release, but the SHA is authoritative. Renovating an action pin is a dependency change and must be reviewed like code.

Configure branch rules as described in `docs/DEPLOYMENT.md`. A post-merge CI failure stops release acceptance even if Cloudflare already deployed; invoke rollback or containment and correct the pipeline ordering/configuration.

## Dependency and SBOM policy

### Locked installation

`package-lock.json` is authoritative. Production and CI use `npm ci`; changes that alter dependency resolution must include and review the lockfile. The deployed browser bundle directly depends on React and React DOM. Vite, TypeScript, ESLint, Wrangler, XML test support, fake IndexedDB, and Cloudflare types are development/test/deploy dependencies but remain part of the build threat surface.

### Automated maintenance

Dependabot is configured weekly for npm and GitHub Actions, with bounded open pull requests and grouped production/toolchain updates. Automation opens proposals; it does not authorize merges.

For each dependency change:

1. Read the upstream release notes and security advisories from the primary source.
2. Inspect manifest and lockfile deltas, package ownership, install scripts, license, transitive additions, and runtime/bundle effect.
3. Run dependency review, `npm audit`, CodeQL as applicable, and the complete release gate.
4. Generate and compare the CycloneDX SBOM.
5. Confirm no remote runtime asset, telemetry, unexpected binding, or additional browser permission appears.
6. Update `THIRD_PARTY_NOTICES.md` and the font/license inventory when required.
7. Prefer one reviewable dependency concern per pull request when grouping would obscure provenance.

`npm audit --audit-level=high` is one gate, not a complete vulnerability assessment. A clean audit does not cover malicious-but-unreported packages, compromised maintainers, platform actions, browser defects, or non-npm assets.

### SBOM handling

The CI SBOM is generated from the exact release dependency graph and retained with the build artifact. The release record stores its filename, digest, workflow run, and disposition. Retain SBOMs according to institutional software/supply-chain policy, which should normally outlast the 14-day CI artifact window. Do not treat the SBOM as a vulnerability scan or proof of reproducibility by itself.

## Release procedure

### 1. Prepare

- Select version and update `package.json`, `CHANGELOG.md`, and compatibility documentation as needed.
- Freeze schema/version identifiers and the exact `CANONICAL_ORIGIN`.
- Confirm no `.example`, `.invalid`, `.test`, `.localhost`, temporary Sites, preview, or `workers.dev` origin remains in built public metadata.
- Complete automated and required manual evidence.
- Confirm backup, rollback, Cloudflare, GitHub, Hover/DNS, security, accessibility, and records owners are reachable.

### 2. Review and merge

- Open a pull request from a short-lived branch.
- Require the protected checks and independent approval.
- Merge only the reviewed final commit into `main`.
- Record the full merge/release SHA; abbreviated hashes are display aids only.

### 3. Build and deploy

- Workers Builds must select `main`, run `npm ci && npm run release:check`, then `npm run deploy:cloudflare`.
- `VITE_SITE_URL` must equal the exact production origin in Workers Builds and GitHub CI.
- The assets must be freshly built with that value; the production-origin validator must pass before Wrangler upload.
- Confirm the Cloudflare project name is `in-keeping` and matches `wrangler.jsonc`.
- Confirm root `wrangler.jsonc`, not generated Sites configuration, was deployed.
- Record the Workers Build and deployment/version IDs.

### 4. Verify

Follow the live verification matrix in `docs/DEPLOYMENT.md`:

- canonical and noncanonical URL behavior;
- actual 404 status;
- security and cache headers;
- self-only request graph;
- synthetic import, complete comparison, apply, save/open, report, backup, and recovery;
- narrow-view/keyboard/screen-reader smoke tasks;
- DNS, certificate, mail, and unrelated-service continuity.

### 5. Accept and announce

After successful verification:

- create the release tag from the exact deployed commit if tags are part of institutional practice;
- publish only non-sensitive change notes;
- retain the release record and SBOM outside the short CI artifact window; and
- close the change ticket with named acceptance and rollback window.

Never announce a release solely because a Workers Build is green.

## Release record template

Copy this section into the approved change/evidence system.

```text
IN KEEPING release:
Application version:
Full Git commit SHA:
GitHub pull request and workflow runs:
Cloudflare Workers Build ID:
Cloudflare deployment/version ID:
Canonical origin:
Root wrangler.jsonc verified binding-free: yes/no
VITE_SITE_URL exact in GitHub and Cloudflare: yes/no
SBOM filename and SHA-256:
Build artifact retention/export location:
Automated gate result:
Manual browser/OS matrix:
Keyboard/screen-reader matrix:
Receiving-software matrix, if affected:
HTTP status/header/cache result:
DNS/certificate/mail result:
Workspace migration required/completed:
Known limitations and accepted risks:
Rollback version and owner:
Product, security/privacy, accessibility, and operations approvals:
Started/completed UTC timestamps:
```

Do not include workspaces, backups, record titles, imported filenames, source evidence, incident notes, or secrets in the release record.

## Rollback and correction

### Stop conditions

Stop or roll back when:

- the deployed commit differs from the accepted commit;
- canonical metadata differs from the actual origin;
- an unknown path returns a 200 application shell;
- CSP or other required isolation headers are absent;
- an application network request, telemetry path, unexpected binding, or remote asset appears;
- a supported import silently loses or changes accepted data;
- storage opens a digest-disagreeing active generation or rewrites recovery evidence;
- Public Notice includes a nonallowlisted field;
- a keyboard/accessibility regression blocks a core task; or
- DNS/mail/unrelated services regress during cutover.

### Procedure

1. Freeze further merges and deployments.
2. Preserve affected in-memory work through approved plaintext backups before reload.
3. Record current and target deployment IDs and full commits.
4. Roll Cloudflare back to the last verified static-asset version or correct the specific DNS/domain fault.
5. Rerun the live verification matrix.
6. Test older-client compatibility against backup copies before operators resume.
7. Fix forward through a reviewed pull request and add a regression test.
8. Update the incident, changelog, validation report, risk/traceability records, and release evidence.

Cloudflare rollback changes the active asset version; it does not roll back IndexedDB or downloaded files. Do not hand-edit workspace storage to make an old client accept new data.

## Emergency changes

An emergency does not remove evidence requirements. If the organization's emergency procedure permits branch-rule bypass:

- two authorized people must approve the action when possible;
- preserve the pre-change deployment/version and DNS state;
- make the smallest reversible change;
- run the release gate before deployment unless the gate itself is the incident;
- record the bypass, reason, actor, time, and commands;
- complete live verification immediately; and
- open a follow-up pull request, regression test, and post-incident review within the institutional deadline.

Never use an emergency to introduce a remote data path, disable quarantine, weaken backup disclosure, or erase suspect local generations.

## Maintenance cadence

| Cadence | Work |
| --- | --- |
| Weekly | Triage Dependabot, CodeQL, dependency review, build failures, upstream security notices |
| Monthly | Re-run the release gate on protected `main`; review administrators, Workers Builds settings, canonical metadata, live headers, certificate, DNS/mail, and account logging/analytics |
| Quarterly | Synthetic max-boundary and recovery drills; target browser/accessibility review; restore SBOM/release evidence from institutional archive |
| Semiannual | Revalidate receiving-software versions and archival/catalog crosswalk claims; review formats and deprecations |
| Annual | Threat/risk/privacy/retention review; DNSSEC/domain ownership; decommission readiness; supported-browser and Node/Cloudflare compatibility decisions |
| On advisory | Triage immediately, determine exposure, use private security reporting, patch/mitigate, rotate platform credentials if implicated, and issue a documented release |

Toolchain compatibility dates and platform documentation are time-sensitive. Upgrades must be deliberate; do not automatically advance the Wrangler compatibility date without release evidence.

## End of support

When a release line is no longer supported:

1. Publish the last supported version and migration/backup requirements.
2. Keep exact readers for retained older formats only when tested and documented.
3. Do not silently rewrite a backup or workspace into a new version.
4. Preserve final source, lockfile, SBOM, release records, migration fixtures, documentation, and license notices.
5. Follow `docs/OPERATIONS.md` for browser-local data disposition and infrastructure decommissioning.
