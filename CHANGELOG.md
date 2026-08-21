# Changelog

This project follows Semantic Versioning for application releases. Interchange and storage schemas retain their own explicit versions.

## 1.0.0 — 2026-08-20

### Added

- Blank-start browser-local workbench with named IndexedDB workspaces, verified generations, stale-tab rejection, and recovery.
- Catalog quarantine, record comparison, findings, correction revisions, and ten exchange outputs.
- Custom archival schemas, ten archival record types, sixteen field kinds, EAD/DCTAP/AtoM/ArchivesSpace exchange, and hierarchy validation.
- Eight-domain service-register model with sixteen operating record types.
- Incident, configuration, revision, rollback, audit, workspace-backup, Technical Report, and Public Notice workflows.
- Static Cloudflare production topology, strict response policy, GitHub assurance workflows, SBOM generation, governing operating documentation, and an institutional review dossier.
- Shared 100-row pagination with selected-record page reconciliation for large indexes.
- Storage inspection and explicit quarantine reconstruction into a new workspace while retaining the source bytes.

### Security

- Exact XML namespaces and direct MARC/DC structures; bounded linear XML pre-scan before DOM construction.
- Explicit rejection instead of silent array or tagged-line truncation.
- Strict bounded BibTeX parser with nested-brace support and rejection of macros/concatenation.
- Exact RIS and MARC mnemonic line grammars: only one blank separator between complete records is accepted; malformed, leading, repeated, and intra-record blank lines reject.
- Workspace-backup version 2 requires the literal `plaintext-json-not-encrypted` protection marker and the interface identifies downloads as plaintext JSON.
- Custom archive schema and service text must already be canonical NFC without surrounding whitespace; required definitions and values cannot be whitespace-only.
- The application EDTF subset requires valid date atoms, paired bounded set/list delimiters, and real fully numeric calendar dates.
- EAD4, EAD3, and EAD 2002 exports reject populated custom fields, altered populated-core kinds/cardinalities/mappings, and mismatched scalar/array shapes rather than dropping, relocating, or joining values; the lossless schema package remains the preservation path.
- OAI DC rejects semantic attributes, while MODS accepts only a closed, value-validated attribute set and retains accepted attributes as source evidence.
- Archive-editor vocabularies and repeatable values split only on newlines, preserve an empty draft line while typing, and discard only zero-length lines on commit; semicolons and surrounding whitespace remain data for canonical validation.
- No public server runtime, application telemetry, remote import, or workspace-content transmission path.

### Compatibility

- Backup schema is `in-keeping/workspace-backup` version 2. Version 1 `in-keeping/private-workspace-backup` envelopes remain reviewable.
- Legacy browser database and storage namespace remain unchanged to avoid stranding saved work on the same origin.
- EAD, MARCXML, MODS, and OAI Dublin Core support is an internally tested structural profile; official external XSD and receiving-product validation remain release evidence, not repository claims.
