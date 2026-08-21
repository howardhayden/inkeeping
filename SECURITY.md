# Security policy

## Supported release

Security fixes are applied to the current `1.x` release line. Pre-release deployments and old Cloudflare versions are not supported once a corrected version is published.

## Reporting a vulnerability

Do not open a public issue and do not include restricted library records, credentials, exploit payloads, or personal data in a ticket.

Use the repository’s **Security → Advisories → Report a vulnerability** path after private vulnerability reporting is enabled. If that control is not visible, contact the repository owner through an established nonpublic institutional channel and ask for a private reporting route before sending technical details.

Include:

- affected release and commit;
- affected origin and browser, when relevant;
- a minimal synthetic proof of concept;
- expected impact and required operator action; and
- whether the issue has been disclosed elsewhere.

The maintainer should acknowledge a complete report within five business days, establish severity and containment within ten business days, and coordinate disclosure after a corrected release is available. These are service objectives, not a bounty or contractual guarantee.

## Scope

In scope: import quarantine, parsers, workspace validation, IndexedDB generations, backup review, report redaction, static response policy, build/release configuration, and dependency integrity.

Out of scope: social engineering without a software defect; physical/device compromise; malicious browser extensions; ordinary Cloudflare availability; attacks requiring the reporter to publish real restricted records; and behavior in modified builds.

Engineering controls, limits, and residual risks are documented in [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
