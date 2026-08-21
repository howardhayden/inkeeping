# Deployment

This runbook publishes IN KEEPING as binding-free Cloudflare Workers Static Assets from the protected `main` branch of `howardhayden/inkeeping`. The production origin is the Hover-registered apex `https://inkeep.ing`. Complete and approve the remaining operator-specific deployment record before changing DNS.

## Required decisions

Record these values in the institution's change ticket. The first four are source-controlled production decisions; the remaining values must be supplied by the authorized operator. Do not substitute a temporary Sites, preview, or `workers.dev` origin.

| Token | Operator-supplied value | Constraint |
| --- | --- | --- |
| `CANONICAL_ORIGIN` | `https://inkeep.ing` | Source-controlled; HTTPS origin only, with no credentials, port, path, query, or fragment |
| `CANONICAL_HOST` | `inkeep.ing` | Source-controlled apex; the only application origin |
| `REGISTERED_DOMAIN` | `inkeep.ing` | Hover-registered domain |
| `GITHUB_REPOSITORY` | `howardhayden/inkeeping` | Source-controlled repository identity |
| `CLOUDFLARE_ACCOUNT` | Owning Cloudflare account | Must have an active zone for `REGISTERED_DOMAIN` |
| `DNS_CHANGE_OWNER` | Named operational owner | Authorized for Hover and Cloudflare DNS |
| `RELEASE_COMMIT` | Full Git commit SHA | Must be on protected `main` and pass the release gate |
| `CHANGE_WINDOW` | Approved date/time and rollback owner | Must account for nameserver propagation |

The canonical choice is a data-location decision. IndexedDB is isolated by scheme, host, and port. `https://www...`, `https://...` at the apex, a `workers.dev` hostname, and a Sites checkpoint hostname are different stores even when they display identical assets.

## Production topology

```text
protected GitHub main
        |
        | Workers Builds: locked install + release gate
        v
Cloudflare Workers Static Assets
        |
        | one Custom Domain / canonical HTTPS origin
        v
operator browser
        |
        +-- in-memory working copy
        +-- origin-scoped IndexedDB after explicit create/save
        +-- explicit plaintext downloads
```

Production is defined by the source-controlled root `wrangler.jsonc`:

- `name` is `in-keeping`;
- `workers_dev` and `preview_urls` are `false` so no alternate public workbench origin is created;
- `assets.directory` is `./dist/client`;
- `html_handling` is `auto-trailing-slash`;
- `not_found_handling` is `404-page`;
- `observability.enabled` is `false`; and
- there is no `main`, assets binding, KV, D1, R2, Durable Object, queue, service, secret, or other runtime binding.

`dist/server/index.js` and `dist/server/wrangler.json` are generated only for ChatGPT Sites checkpointing. They contain a minimal `ASSETS.fetch()` adapter because that checkpoint environment requires an entry point. Never select `dist/server/wrangler.json`, `vite.sites.config.ts`, or `worker/sites-adapter.ts` as the GitHub/Cloudflare production configuration.

## 1. Preflight

### 1.1 Establish administrative control

Before a technical change:

1. Confirm at least two institutionally controlled administrators can reach Hover, Cloudflare, and GitHub with multifactor authentication.
2. Confirm the Cloudflare account, GitHub organization, billing owner, registrar contact, and incident contacts are institutional rather than personal.
3. Record who may merge to `main`, alter Workers Builds, attach domains, change DNS, change DNSSEC, roll back, or delete the project.
4. Export the current DNS zone from the authoritative provider and retain a dated copy in the change record.
5. Inventory all records, including apex and `www` web records, `MX`, mail-host `A`/`AAAA`/`CNAME`, SPF, DKIM, DMARC, verification TXT records, SRV records, CAA, and any existing DNSSEC DS record.
6. Confirm the institution's retention and access location for plaintext workspace backups and release evidence.

Cloudflare's quick scan is discovery assistance, not an authoritative migration. Every scanned record must be compared with the export and missing records must be added manually before nameservers change.

### 1.2 Verify the release candidate locally

Use the declared Node runtime and the lockfile:

```sh
node --version
npm ci
VITE_SITE_URL="https://inkeep.ing" npm run release:check
git diff --check
git status --short
```

`VITE_SITE_URL` must remain the exact final origin. `app/site-metadata.ts` rejects HTTP, credentials, explicit ports, paths, queries, and fragments. The value is compiled into canonical metadata, Open Graph metadata, `robots.txt`, and `sitemap.xml`; it is not a runtime switch.

Dry runs and Sites checkpoints may be built with a nonproduction placeholder because they are not promoted to the Cloudflare production origin. Production may not. `npm run deploy:cloudflare` invokes the artifact validator with `--production-origin`; it refuses canonical hosts in the reserved `.example`, `.invalid`, `.test`, or `.localhost` namespaces and hosts ending in `.chatgpt.site` or `.workers.dev`. Rebuild the assets with `VITE_SITE_URL="https://inkeep.ing"` before attempting production deployment. Changing an environment variable after the build does not rewrite the artifact.

The gate must finish with lint, all TypeScript surfaces, static and checkpoint builds, all unit/contract tests, a high-severity dependency audit, artifact validation, and a strict Wrangler dry run. A successful build creates:

| Output | Production use |
| --- | --- |
| `dist/client` | Yes: deploy this through root `wrangler.jsonc` |
| `dist/server` | No: Sites checkpoint adapter only |
| `dist/.openai/hosting.json` | No: Sites project identity only |
| `dist/wrangler-dry-run` | No: local dry-run output |

Inspect `dist/client/index.html`, `robots.txt`, and `sitemap.xml` and verify that each public URL begins with the exact `CANONICAL_ORIGIN`. Reject the release if `__SITE_ORIGIN__`, any reserved placeholder, a Sites host, or a `workers.dev` host remains.

### 1.3 Protect GitHub `main`

Create a repository ruleset or branch-protection rule for `main` appropriate to the organization's GitHub plan. At minimum:

- require a pull request and at least one approval from a maintainer who did not author the change;
- dismiss stale approvals when the diff changes;
- require conversation resolution;
- require the current `Production assurance / Verify release candidate` and `CodeQL / Analyze JavaScript and TypeScript` checks;
- require the dependency-review job for pull requests that alter dependencies;
- require the branch to be current with `main` before merge, or use the organization's merge queue;
- prohibit force pushes and branch deletion;
- restrict direct pushes; and
- prevent administrator/ruleset bypass except under a documented emergency procedure.

Signed commits and linear history are recommended when they match institutional policy. They do not replace review, build evidence, or an artifact digest.

The workflows use read-only default permissions, immutable full-SHA action pins, locked dependencies, CodeQL, dependency review, and a CycloneDX SBOM. Do not weaken those controls to make a deployment pass.

## 2. Prepare Cloudflare without changing authority

### 2.1 Add and review the zone

In `CLOUDFLARE_ACCOUNT`:

1. Onboard `REGISTERED_DOMAIN` as a full zone.
2. Choose the institutionally approved plan.
3. Allow a DNS scan if useful, then compare every result against the authoritative export.
4. Add every required non-web record before changing nameservers.
5. Keep mail endpoints DNS-only. `MX` cannot be proxied, and an `A`/`AAAA` record used only for SMTP should also remain DNS-only.
6. Preserve the mail provider's exact SPF, DKIM, DMARC, and verification values. Do not synthesize replacements.
7. Review CAA, SRV, TXT, wildcard, subdomain delegation, and DNSSEC dependencies explicitly.

Do not create a Custom Domain on `CANONICAL_HOST` while a conflicting CNAME exists. Cloudflare creates the Custom Domain DNS record and certificate; identify which existing web-only record it will replace. Never remove mail or verification records merely because they share the zone.

### 2.2 DNSSEC sequencing

If the domain currently has a DS record, treat nameserver migration and DNSSEC as one controlled change. Follow the current Cloudflare and Hover procedures for the existing state; an obsolete DS record pointing at the former DNS provider can make the entire domain fail validation. Record the before/after DS values and validate them from outside the local resolver. Do not guess or copy example keys.

### 2.3 Create or connect the Worker

Create or select the Cloudflare Worker whose name exactly matches `wrangler.jsonc`: `in-keeping`. Connect `howardhayden/inkeeping` through Workers Builds.

Use these build settings:

| Setting | Required value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm ci && npm run release:check` |
| Deploy command | `npm run deploy:cloudflare` |
| Non-production branch deploys | Disabled; source also sets `preview_urls: false` |
| Build variable `VITE_SITE_URL` | `https://inkeep.ing` |
| Build variable `CI` | `1` |
| Build variable `DO_NOT_TRACK` | `1` |
| Build variable `WRANGLER_SEND_METRICS` | `false` |
| Build variable `WRANGLER_WRITE_LOGS` | `false` |
| Build variable `SKIP_DEPENDENCY_INSTALL` | `1`; the reviewed build command performs the single locked `npm ci` install |

Cloudflare uses the Wrangler version pinned in `package.json`. Do not change the Worker name in the dashboard or introduce dashboard-only bindings. Build settings apply to later builds and may differ when a failed build is retried, so retain a screenshot or exported record of the settings with each release baseline.

The production deploy command validates the canonical value embedded in the just-built HTML. A build made earlier with a placeholder or Sites origin will stop before Wrangler uploads it, even if Workers Builds now has the correct variable. Force a fresh build after changing `VITE_SITE_URL`.

The production configuration sets both `workers_dev: false` and `preview_urls: false`. Do not re-enable either in the dashboard: every alternate hostname is a separate IndexedDB location. If an isolated preview is approved for a future change, use a separate configuration and synthetic data only; never treat that origin as migratable production storage.

### 2.4 Align GitHub CI with the canonical origin

`.github/workflows/ci.yml` is source-controlled with `VITE_SITE_URL: https://inkeep.ing`. Confirm that value during review. The GitHub and Cloudflare gates must build the same public metadata; do not rely on the fallback Sites origin.

Merge only after required checks pass. Confirm the resulting Workers Build is for `RELEASE_COMMIT`, repeats the release gate, and deploys root `wrangler.jsonc`.

## 3. Validate the Cloudflare deployment before DNS cutover

Public `workers.dev` and version-preview URLs are disabled. Complete build and artifact verification locally and in GitHub Actions. After Cloudflare reports the zone active, attach the apex Custom Domain and perform the live matrix there with synthetic records before authorizing operational use.

Verify:

1. `/` returns the IN KEEPING document and the expected release assets.
2. `/404-probe-RELEASE_COMMIT` returns an actual 404 document, not the application shell with status 200.
3. Browser developer tools show only same-origin static asset requests; no application API, analytics, remote font, or imported URL request occurs.
4. `wrangler.jsonc` remains binding-free and `observability.enabled` remains false.
5. The built `robots.txt` and `sitemap.xml` contain `https://inkeep.ing`.
6. Import, review, apply, explicit save, backup download, report download, and recovery work with synthetic records in a disposable browser profile.
7. No test workspace is treated as migratable production data.

## 4. Prepare browser data for the origin cutover

This step applies whenever operators have used a Sites, `workers.dev`, preview, apex, `www`, HTTP, alternate port, or prior canonical origin.

For every browser profile and every named workspace on the old origin:

1. Open and verify the workspace.
2. Explicitly save pending changes if the current generation is healthy.
3. Download **Download current session** and, when required by policy, **Download selected saved backup**.
4. Treat every `.in-keeping-workspace-backup.json` file as plaintext JSON that is not encrypted. Move it immediately into approved encrypted storage with least-privilege access, retention, and disposal controls.
5. Download the Technical Report when it is required as review evidence; it may contain complete record evidence.
6. Record the workspace name, backup filename, generated timestamp, source origin, responsible operator, and approved destination. Do not put record content or the backup itself into the deployment ticket.
7. Keep the old origin available until the backup has been opened at the new origin, a new named workspace has been created, explicitly saved, reopened, and compared.

Opening a backup creates a working copy in memory. It does not silently persist at the new origin. The operator must create a named local workspace and save it. A digest detects accidental file alteration; it is not encryption, a signature, authorship evidence, or a trusted custody record.

There is no automatic cross-origin IndexedDB migration and no server copy to recover later.

## 5. Delegate authoritative DNS from Hover

### 5.1 Final record comparison

Immediately before the change:

- export or capture the current authoritative zone again;
- compare it to Cloudflare record by record;
- query the current authoritative nameservers for apex, `www`, MX, SPF, DKIM, DMARC, CAA, and operational subdomains;
- confirm the mail provider's acceptance tests are ready;
- confirm the Cloudflare-assigned pair of nameservers from the zone Overview page; and
- confirm a rollback owner can access Hover and the previous zone data.

### 5.2 Change nameservers

In Hover, edit the nameservers for `REGISTERED_DOMAIN` and enter only the exact pair assigned by Cloudflare. All authoritative nameservers must belong to the same provider. Record the time, prior values, new values, operator, and change ticket.

Nameserver propagation is not instantaneous. Hover documents that it can take 24–48 hours. During that interval, clients may query either DNS provider, so both zones must remain correct and mail must be tested from multiple networks.

Do not delete the former zone or disable mail service during the observation window.

## 6. Attach the canonical Custom Domain

Once Cloudflare reports the zone active and the production asset deployment is healthy:

1. Open the `in-keeping` Worker.
2. Add `inkeep.ing` as a Custom Domain under Domains & Routes.
3. Let Cloudflare create the web DNS record and certificate.
4. Confirm HTTPS is active and the certificate covers `CANONICAL_HOST`.
5. Confirm the exact origin in the address bar equals `https://inkeep.ing`.

Only `inkeep.ing` may serve the workbench. Do not attach the application to both apex and `www`. For `www.inkeep.ing`, first create Cloudflare's documented proxied placeholder `A` record for `www` pointing to `192.0.2.0`; the proxied request is intercepted by the redirect rule and never reaches that documentation-only address. Then create a permanent wildcard redirect from `https://www.inkeep.ing/*` to `https://inkeep.ing/${1}` and disable query-string preservation because the workbench has no query-driven route and URLs may contain sensitive text. Validate the redirect and destination before publishing the hostname. Operators must never save work on the redirecting host.

## 7. Live verification matrix

Run from at least two independent networks after DNS activation. Replace tokens before use.

```sh
curl --fail-with-body --silent --show-error --location \
  --output /dev/null --write-out '%{http_code} %{url_effective}\n' \
  "https://inkeep.ing/"

curl --silent --show-error --head "https://inkeep.ing/"
curl --silent --show-error --head "https://inkeep.ing/404-probe-RELEASE_COMMIT"
```

Record, rather than merely eyeball, these expected results:

| Request | Expected behavior |
| --- | --- |
| Canonical `/` | 200 over HTTPS; no redirect away from `https://inkeep.ing` |
| Noncanonical web host | One controlled redirect to `https://inkeep.ing` |
| Unknown path | 404 status and static 404 page |
| Root, `/index.html`, `/404.html` | `Cache-Control: no-cache` |
| Content-hashed `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` |
| `/fonts/*` | Same one-year immutable browser policy |
| All static responses | Repository security policy, correct `Content-Type`, and `nosniff` |

The required response policy is:

- `Content-Security-Policy`: self-only scripts/styles/fonts and same-origin/data images; `connect-src`, objects, frames, media, forms, workers, and manifests denied as committed;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Resource-Policy: same-origin`;
- `Origin-Agent-Cluster: ?1`;
- `X-DNS-Prefetch-Control: off`;
- the committed restrictive `Permissions-Policy`; and
- `Strict-Transport-Security: max-age=31536000` without `includeSubDomains` or `preload`.

Do not add HSTS `includeSubDomains` or preload during this application deployment. Those settings bind unrelated subdomains and require a separate domain-wide inventory, approval, and recovery plan.

Perform the browser workflow with synthetic data, keyboard-only navigation, a narrow viewport, and at least one supported screen reader/browser pair recorded by the release owner. Confirm no request is made when a record URL is displayed or imported.

### Mail and DNS acceptance

During and after propagation:

- query authoritative and public resolvers for all inventoried records;
- send inbound and outbound messages through the institution's actual mail service;
- validate SPF, DKIM, and DMARC using the mail provider's official tooling;
- confirm mail-host address records remain DNS-only where required; and
- confirm unrelated subdomains and verification records still work.

Web success does not establish mail or DNS success.

## 8. Acceptance and handoff

Production acceptance requires a release record containing:

- `RELEASE_COMMIT`, release version, SBOM artifact, and workflow run URLs;
- exact `CANONICAL_ORIGIN` and the approved canonical-host decision;
- GitHub ruleset/branch-protection evidence;
- Workers Builds settings and build ID;
- root `wrangler.jsonc` digest or committed revision;
- DNS before/after inventory, Hover change time, and DNSSEC result;
- HTTP status/header/cache matrix;
- mail and unrelated-service checks;
- browser/accessibility smoke-test matrix;
- old-origin backup/migration completion without record content; and
- named primary and rollback owners.

Do not mark the deployment complete while any operator's only current workspace remains on a noncanonical origin.

## Rollback

Choose the smallest rollback that contains the incident.

### Application release rollback

For a client regression with healthy DNS:

1. Freeze merges and record the current deployment/version ID and `RELEASE_COMMIT`.
2. Preserve an affected operator's working copy by downloading a plaintext backup before reload or browser clearing.
3. Use Cloudflare Deployments to roll back to the last verified version, or use Wrangler's version rollback procedure under an authorized operator account.
4. Verify root, 404, security headers, assets, and the affected workflow.
5. Open backups only in a disposable profile until compatibility with the older client is established.
6. Correct forward through a reviewed pull request. Do not leave an undocumented dashboard-only configuration change.

Static deployment rollback does not roll back, merge, or move IndexedDB. Older clients may reject newer workspace/interchange schema versions by design.

### Custom Domain rollback

If the deployment is healthy at the Cloudflare version URL but the Custom Domain is not:

1. Preserve the current DNS state and certificate/error evidence.
2. Remove or correct only the conflicting web-domain configuration.
3. Do not change MX, mail-host, TXT, CAA, or unrelated records.
4. Keep operators out of alternate origins; use backups, not ad hoc duplicate origins, for migration.

### Nameserver rollback

Use nameserver rollback only for a zone-wide failure that cannot be corrected promptly in Cloudflare. Restore the exact former authoritative nameservers in Hover and keep both zones intact through propagation. Coordinate DNSSEC state; restoring nameservers without compatible DS records can prolong failure. Record every change and repeat web, mail, and unrelated-service validation.

Rollback cannot recall a plaintext backup, erase a browser store, or undo data entered under an alternate origin.

## Platform references

Reviewed 2026-08-20; operators must recheck current vendor documentation before each production change.

- [Cloudflare full-zone nameserver setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
- [Cloudflare DNS quick-scan limits](https://developers.cloudflare.com/dns/zone-setups/reference/dns-quick-scan/)
- [Cloudflare email records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/email-records/)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare `workers.dev` and preview URL controls](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare build branch controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Cloudflare static-asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Cloudflare versions and rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Hover nameserver changes](https://support.hover.com/support/solutions/articles/201000064742-changing-your-domain-nameservers)
