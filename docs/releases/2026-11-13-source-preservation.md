# Source preservation candidate — 2026-11-13

This record accompanies the source-preservation change based on `4c94ad99f67d5d772e6d5e1a72053df3b10629d0`. The containing Git commit and its pull-request checks identify the exact candidate. The earlier `VALIDATION_REPORT.md` remains historical evidence for its original candidate.

## Problem and implementation

Import review retained normalized evidence but not the selected file bytes. The new version-1 package captures an immutable source, its complete parser review and two SHA-256 bindings. A recovery interface verifies both digests before offering a download; stored review claims never receive an Apply capability. This introduces an interchange format without changing workspace storage or crosswalk semantics. See [the contract](../SOURCE_PRESERVATION.md).

## Regression evidence

The new test file initially failed because the preservation implementation did not exist. The first implementation passed raw byte and maximum-size recovery; two assertions were corrected after inspecting existing behavior: catalog Apply records rejection in the audit rather than throwing, and the source-only tamper fixture needed a matching byte-count claim to reach the independent source-digest check. Assertions now verify unchanged active state plus a rejected audit outcome, and rejection of altered bytes even after recomputing the package digest.

Automated cases cover catalog/archive snapshots, BOM/CRLF/decomposed Unicode, binary and empty rejected input, metadata/content alteration, duplicate decoded JSON keys, surrogate strings, unsafe keys, canonical base64, source limits at 32 MiB and 32 MiB + 1, and oversized packages. The existing interface contract also caught review-reset ordering; the source state reset was moved before the existing immediate `setReview(null)` boundary.

## Browser execution

Environment: macOS arm64, Node v24.18.0, Codex in-app browser; synthetic data only. No assistive technology or external receiving product was evaluated.

The local browser selected a 73-byte CSV with a UTF-8 BOM and decomposed Unicode. It displayed a successful catalog review, downloaded a preservation package, reopened that downloaded package and displayed matching package/source digests, then downloaded the recovered original. A filesystem `cmp` succeeded. Both original and recovered SHA-256 were `efd26b23a9fda3e7cfeaf1811915bd8ac8aa945b740dbe3848892387d334ce5c`. Workspace counts remained zero through recovery.

## Release gate

The macOS host does not have GNU `timeout`, which the existing build wrapper requires. Its initial full release command passed licensing, lint and all TypeScript surfaces, then stopped at that precondition. The underlying build and verification commands are run locally; the complete unchanged `npm run release:check` command must pass in GitHub's Linux release job before merge. CI run URLs and the immutable deployed commit are retained in the pull request and GitHub deployment records.

The initial dependency audit found eight high and ten moderate findings in the existing build dependency graph. The candidate updates Vite, Wrangler and its matching Workers types, ESLint, and affected transitive dependencies. A pinned minimatch override addresses the advisory affecting the versions still requested by lint tooling. These are development dependencies; the production React dependencies are unchanged.

Final local component results: licensing check, lint, all three TypeScript surfaces, both Vite builds, 269 tests (269 passed; zero failed/skipped), production artifact validation and the strict Cloudflare dry run passed. The dependency audit reported zero vulnerabilities. The production client entry was `index-hNejypP4.js` with stylesheet `index-Bv2u6cKO.css`. These local results supplement the required Linux release gate; they do not assert a deployment occurred.

## Recovery and remaining scope

Downloaded packages remain recoverable independently of workspace state. They are plaintext and require completed downloads. Hashes do not establish authenticity. Browser eviction and unsaved work remain governed by existing backup procedures. Existing schema/storage versions remain unchanged; an older app release cannot read the new package. Rollback may restore the previous post-commercial-baseline application release without migrating workspace data. Current crosswalk and external acceptance limitations remain in effect.
