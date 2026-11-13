# Source preservation packages

Catalog and archival import reviews offer **Download preservation package**. The native `.in-keeping-source.json` file contains the exact selected source bytes and the complete review snapshot, including normalized records, retained source evidence, findings where the parser supplies them, and the parser profile. This supports byte-for-byte recovery even when parsing rejects a source. BOMs, line endings, whitespace, Unicode normalization forms, invalid UTF-8 and binary bytes are retained unchanged.

Download the package before selecting another source, leaving the archival view, replacing the session, or reloading the page. Preparation is in memory; the package is not automatically saved to IndexedDB or included in workspace backups. Confirm the browser saved the download, then retain it according to the source's access and retention requirements. Packages contain plaintext data; base64 is encoding, not encryption.

To recover a file, open **Import → Recover a preserved source → Choose preservation package**. The application validates the envelope, compares its package digest, decodes the original bytes and compares their source digest before enabling **Download original source**. **Download recorded review** exports the historical review for inspection. Recovery does not modify a workspace. To apply recovered data, select the recovered source through the ordinary catalog or archival import workflow and complete a new review and disposition.

## Version 1 contract

The package has exactly six root fields:

| Field | Content |
| --- | --- |
| `schema` | `in-keeping/source-preservation` |
| `version` | Integer `1`; unknown versions reject |
| `protection` | `plaintext-json-not-encrypted` |
| `source` | Exact filename, browser-supplied media type and modification time, byte count, SHA-256, `encoding: "base64"`, ordered `chunks` |
| `review` | `kind` (`catalog` or `archive`), `parserProfile`, complete `snapshot` |
| `packageSha256` | SHA-256 of the UTF-8 JSON payload described below |

The source ceiling is 32 MiB. Each base64 chunk represents 49,152 bytes except the final chunk; an empty source has zero chunks. Padding must be canonical. The review snapshot ceiling is 32 MiB of compact UTF-8 JSON; the complete package ceiling is 80 MiB. Source filenames and media types allow at most 1,024 and 256 characters respectively. Review trees have bounded depth, nodes, keys, strings and arrays. Exceeding any limit disables package creation with an explicit error, without truncating source or review content; the ordinary import review remains available.

The package digest covers compact `JSON.stringify` output with root member order `schema`, `version`, `protection`, `source`, `review`. Source member order is `filename`, `mediaType`, `lastModified`, `bytes`, `sha256`, `encoding`, `chunks`; review order is `kind`, `parserProfile`, `snapshot`. Snapshot member and array order are retained as stored. The `packageSha256` member is excluded from its own digest. All digests use lowercase hexadecimal SHA-256. Whitespace outside JSON values is not part of this package digest; every decoded source byte is part of the independent source digest.

Raw JSON quarantine rejects duplicate decoded member names and unpaired Unicode surrogates. Exact envelope keys, versions, encoding, byte counts, review bindings and digests must agree. Prototype-related review keys reject. Recovery treats the stored snapshot as historical claims and does not feed it into workspace state or recreate its private in-memory Apply capability. The original media type remains in the package; downloads use `application/octet-stream` and never open the recovered content. Unsafe filename characters are replaced and download names are bounded to 180 characters, while the original filename remains intact in package metadata.

## Scope and compatibility

Matching digests detect internal mismatches. Anyone able to replace the entire unsigned package can recompute them; they do not establish authenticity, source truth, completeness, trusted time, custody or authority. The stored parser result describes the review that produced the package, not a fresh validation by the current application. A blocked source remains blocked historical evidence. The format does not contain later operator dispositions, edits, audit history, external attachments or a workspace backup.

Existing imports, native catalog/archive exchange packages, workspace schemas, IndexedDB stores and output authority gates retain their existing contracts. Standards and vendor exports remain crosswalks; original-source recoverability does not make them reversible. Earlier releases cannot open the new package, but ordinary source files and existing workspace backups remain compatible. A rollback affects the recovery interface, not already downloaded package bytes.

Tests are in [`tests/source-preservation.test.mjs`](../tests/source-preservation.test.mjs). The browser and release execution record is maintained separately in [`releases/2026-11-13-source-preservation.md`](releases/2026-11-13-source-preservation.md).
