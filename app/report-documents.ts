import { activeRevision, assessActiveEvidence, checkRecords, validateWorkspaceSnapshot, type CatalogRecord, type Incident, type Workspace } from "./lab-core.ts";
import { ARCHIVE_FIELD_KINDS, ARCHIVE_RECORD_TYPES, type ArchiveFieldKind, type ArchiveSchema, type ArchiveUnit } from "./archival-schemas.ts";
import { REPORT_JOST_FONTS } from "./report-fonts.ts";
import { DATA_FORMAT_RULES, RECORD_FORMATS } from "./record-formats.ts";
import { SERVICE_AREAS, SERVICE_DATA_FORMAT_RULES, SERVICE_RECORD_DEFINITIONS, serviceDefinition, type ServiceArea, type ServiceRecord, type ServiceValue } from "./service-register.ts";
import type { ContinuityStatus } from "./continuity-anchor.ts";

export const TECHNICAL_REPORT_FILENAME = "in-keeping-technical-report.html";
export const PUBLIC_NOTICE_FILENAME = "in-keeping-public-notice.html";
export const REPORT_MIME = "text/html;charset=utf-8";

const MAX_TECHNICAL_REPORT_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_REPORT_OUTPUT_BYTES = 32 * 1024 * 1024;

export type ReportAuditState = "not-checked" | "valid" | "invalid" | "idle";
export type TechnicalReportContext = {
  savedCopyStatus?: "current" | "stale" | "unsaved-changes" | "not-saved";
  continuityStatus?: ContinuityStatus;
  continuityReason?: string;
};

const PUBLIC_SERVICE_COPY = {
  "Electronic access": "Some full-text links may fail. Try the item again from the library record, or ask staff for another access route.",
  Fulfillment: "Some requests may be unavailable. Library staff can check holdings and other delivery options.",
  "Discovery metadata": "Some descriptions or availability details may be incomplete while staff review the service.",
  "Library service": "Staff are reviewing an issue that may affect this service.",
} as const;

type PublicService = keyof typeof PUBLIC_SERVICE_COPY;

export async function makeTechnicalReportHtml(
  workspace: Workspace,
  _auditState: ReportAuditState = "not-checked",
  generatedAt = new Date().toISOString(),
  context: TechnicalReportContext = {},
): Promise<string> {
  // Retained for call-site compatibility; report integrity is derived below
  // from full snapshot validation and never from this caller declaration.
  void _auditState;
  const inputBytes = new TextEncoder().encode(JSON.stringify(workspace)).byteLength;
  if (inputBytes > MAX_TECHNICAL_REPORT_INPUT_BYTES) {
    throw new Error("The workspace is too large for one technical report. Export the catalog, archive, service register, and workspace backup separately.");
  }
  let snapshotValid = true;
  try {
    await validateWorkspaceSnapshot(workspace);
  } catch {
    snapshotValid = false;
  }
  const auditState: ReportAuditState = snapshotValid ? "valid" : "invalid";
  const revision = activeRevision(workspace);
  const timestamp = exactTimestamp(generatedAt);
  const findings = [...checkRecords(revision.records, Number.POSITIVE_INFINITY)].sort((a, b) =>
    severityOrder(a.severity) - severityOrder(b.severity)
      || a.code.localeCompare(b.code)
      || (a.recordId ?? "").localeCompare(b.recordId ?? ""),
  );
  const incidents = [...workspace.incidents].sort((a, b) =>
    a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id),
  );
  const schemas = [...(revision.archiveSchemas ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const units = revision.archiveUnits ?? [];
  const serviceRecords = [...(revision.serviceRecords ?? [])].sort((a, b) => a.area.localeCompare(b.area) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const openIncidents = incidents.filter((incident) => incident.state !== "resolved");
  const unsupportedClosures = incidents.filter((incident) => incident.state === "resolved" && (!incident.notes.some((note) => note.trim()) || !incident.ownerRole.trim() || /^unassigned$/i.test(incident.ownerRole.trim()) || !incident.nextAction.trim()));
  const blockedServices = serviceRecords.filter((record) => record.state === "blocked");
  const reviewServices = serviceRecords.filter((record) => record.state === "review" || record.state === "due");
  const sampleContaminated = incidents.some((incident) => incident.synthetic) || revision.records.some((record) => record.source.format === "fixture");
  const savedCopyStatus = context.savedCopyStatus ?? "not-saved";
  const continuityStatus = context.continuityStatus ?? "unanchored";
  const continuityReason = context.continuityReason ?? "No separately retained continuity checkpoint was supplied to this generator.";
  const evidenceAuthority = workspace.evidenceAuthority ?? [];
  const evidenceApplications = workspace.evidenceApplications ?? [];
  const applicationByDecision = new Map(evidenceApplications.map((record) => [record.decisionRecordSha256, record]));
  const activeEvidence = assessActiveEvidence(workspace);
  const admittedUnverifiedEvidence = evidenceAuthority.filter((record) => record.disposition.decision === "admit-unverified");
  const reportState = auditState === "invalid"
    ? "Action required"
    : findings.some((finding) => finding.severity === "error")
    || openIncidents.some((incident) => incident.severity === "high")
    || blockedServices.length > 0
    || unsupportedClosures.length > 0
    || sampleContaminated
    || savedCopyStatus === "stale"
    || continuityStatus === "continuity-failure"
    ? "Action required"
    : auditState !== "valid" || findings.length || openIncidents.length || reviewServices.length > 0 || savedCopyStatus !== "current" || continuityStatus !== "continuity-corroborated" || activeEvidence.blocked
      ? "Review required"
      : "No active exceptions recorded in this workspace";
  const auditLabel = auditState === "valid"
    ? "Internally consistent; not authenticated"
    : auditState === "invalid"
      ? "Mismatch detected"
      : "Not checked for this export";

  const documentControl = [
    statusBanner("Current state", reportState, reportState === "Action required" ? "danger" : reportState === "Review required" ? "review" : "neutral"),
    '<dl class="metadata-grid">',
    definition("Workspace", workspace.name),
    definition("Active revision", revision.id),
    definition("Revision digest", revision.digest),
    definition("Workspace updated — browser clock", displayTime(workspace.updatedAt), workspace.updatedAt),
    definition("Report generated — browser clock", displayTime(timestamp), timestamp),
    definition("Audit chain", auditLabel),
    definition("Named saved copy", savedCopyStatus === "current" ? "Caller or interface reports that this session matches a named saved version; this generator did not independently verify browser-storage freshness" : savedCopyStatus === "stale" ? "Named saved version changed or disappeared in another tab" : savedCopyStatus === "unsaved-changes" ? "Current session contains unsaved changes" : "Current session is not attached to a named saved workspace"),
    definition("Continuity", `${continuityStatus} — ${continuityReason}`),
    definition("Evidence dispositions", `${evidenceAuthority.length} recorded; ${evidenceApplications.filter((item) => item.outcome === "applied").length} applied and ${evidenceApplications.filter((item) => item.outcome === "not-applied").length} not applied; ${activeEvidence.activeUnverifiedDecisionDigests.length} unverified admission${activeEvidence.activeUnverifiedDecisionDigests.length === 1 ? "" : "s"} reach active content`),
    definition("Evidence scope", "This report covers only the information present in this workspace. The absence of a record is not evidence that an event, dependency, error, or unresolved condition does not exist."),
    "</dl>",
    unsupportedClosures.length ? '<p class="handling-note"><strong>Action required:</strong> Unsupported closure evidence or criteria are missing for resolved incident(s) ' + unsupportedClosures.map((incident) => html(incident.id)).join(", ") + '. Reopen each incident or record an assigned owner, a contemporaneous closure note, and a nonblank closure criterion or next action before relying on an all-clear.</p>' : "",
    sampleContaminated ? '<p class="handling-note"><strong>Sample data:</strong> This workspace contains synthetic records or incidents. Use this Technical Report only for review and testing; ordinary compatibility, operational, and public outputs must come from a blank production workspace.</p>' : "",
    savedCopyStatus === "stale" ? '<p class="handling-note"><strong>Stale session:</strong> The named saved workspace changed or disappeared in another tab. This report describes the open session, not the newer saved version. Reconcile both before reliance.</p>' : savedCopyStatus === "unsaved-changes" ? '<p class="handling-note"><strong>Unsaved session:</strong> This report includes browser-session changes that are not present in the named saved workspace.</p>' : savedCopyStatus === "not-saved" ? '<p class="handling-note"><strong>Working copy:</strong> This report was generated from a session that is not attached to a named saved workspace.</p>' : "",
    continuityStatus === "continuity-failure" ? '<p class="handling-note"><strong>Continuity failure:</strong> The current saved state did not match its separately retained local checkpoint. Preserve both and investigate; do not re-anchor this lineage in place.</p>' : continuityStatus === "unanchored" ? '<p class="handling-note"><strong>Unanchored:</strong> Internal hashes alone do not detect a fully regenerated history. Ordinary outward artifacts require an explicitly accepted checkpoint and exact current independent receipt comparison.</p>' : continuityStatus === "continuity-verified-local" ? '<p class="handling-note"><strong>Local checkpoint only:</strong> The saved state matches its same-origin checkpoint, but ordinary outward artifacts remain blocked until an independently retained receipt for this exact generation is compared.</p>' : '<p class="handling-note"><strong>Corroborated continuity only:</strong> The exact current receipt comparison detects defined local replacement, but does not establish authenticity, identity, custody, completeness, authority, or trusted time.</p>',
    activeEvidence.blocked ? `<p class="handling-note"><strong>Active evidence barrier:</strong> ${html(activeEvidence.reason)} Historical decisions and non-application outcomes remain recorded; withdrawal alone cannot launder retained active content.</p>` : admittedUnverifiedEvidence.length ? '<p class="handling-note"><strong>Historical evidence decisions:</strong> Unverified admissions remain in the decision register, but none currently reach an active output entity. They remain reviewable and do not become authoritative.</p>' : "",
    '<div class="metric-grid" aria-label="Current inventory totals">',
    metric(revision.records.length, "Catalog records"),
    metric(schemas.length, "Archive schemas"),
    metric(units.length, "Archive records"),
    metric(serviceRecords.length, "Service records"),
    metric(findings.length, "Findings"),
    metric(openIncidents.length, "Open incidents"),
    metric(workspace.revisions.length, "Revisions"),
    "</div>",
  ].join("");

  const executionBoundary = [
    flowFigure(
      "technical-workspace-boundary",
      "Workspace data boundary",
      "Application data is not transmitted by application code: there are no telemetry, analytics, cookies, or background-upload paths. Saving and downloading occur only after an operator action; downloaded files then leave the application's access, deletion, and retention controls.",
      ["Operator input", "Working copy in browser memory", "Named IndexedDB workspace — explicit save", "Report or plaintext workspace backup — explicit download", "Operator-controlled handling"],
    ),
    flowFigure(
      "technical-import-flow",
      "Import trust boundary",
      "Each untrusted file follows one linear path. Review occurs before the workspace can change.",
      ["Exchange file", "Size, MIME and UTF-8 bounds", "Exact parser reconstruction", "Quarantine review", "Explicit unverified disposition", "Atomic revision"],
    ),
    '<div class="diagram-lanes" aria-label="Catalog, archives, and service-register processing lanes">',
    laneFigure("Catalog lane", ["Library exchange", "Canonical catalog record", "Deterministic checks", "Discovery exports"]),
    laneFigure("Archives lane", ["Schema or description", "Typed versioned record", "Hierarchy validation", "Archival exports"]),
    laneFigure("Service lane", ["Workflow definition", "Typed local register", "Field validation", "JSON or long-form CSV"]),
    "</div>",
    flowFigure(
      "technical-recovery-flow",
      "Recovery path",
      "Opening a manifest-bound prior generation is read-only and produces an unsaved recovery copy. Reconstruction from quarantine creates a new named workspace only after explicit inspection and confirmation; the original stored bytes remain available for diagnosis.",
      ["Named local workspace", "Manifest-bound generation digests", "Snapshot and audit verification", "Unsaved recovery copy", "Operator backup or new workspace"],
    ),
  ].join("");

  const inventory = [
    dataTable(
      "inventory-table",
      "Current software inventory",
      ["Domain", "Count", "Operational boundary"],
      [
        ["Catalog records", revision.records.length, "Normalized records retain bounded source evidence."],
        ["Archive schemas", schemas.length, "Schemas are versioned; structural changes require a new schema."],
        ["Archive records", units.length, String(units.filter((unit) => unit.published === true).length) + " explicitly published; all others remain private."],
        ["Service records", serviceRecords.length, "Typed local registers cover operational preflight and continuity; authoritative systems remain external."],
        ["Incidents", incidents.length, String(openIncidents.length) + " open; resolved records remain in local history."],
        ["Audit events", workspace.audit.length, "SHA-256 verification detects hash, link, and current-state mismatches. The chain has no signer; continuity checkpoint status is disclosed in Document control."],
      ],
    ),
    dataTable(
      "interop-table",
      "Implemented exchange surface",
      ["Record family", "Import or export forms", "Boundary"],
      [
        ["Catalog", "MARCXML, MARC mnemonic, Dublin Core, MODS, CSL-JSON, JSON-LD, RIS, BibTeX, CSV, TSV", "Normalized through quarantine into canonical catalog records."],
        ["Archives", "EAD 4, EAD3, EAD 2002, AtoM ISAD CSV, ArchivesSpace AO crosswalk CSV", "Version-specific adapters; receiving-system validation remains required."],
        ["Schema", "DCTAP CSV, lossless schema package", "All field kinds and record types are explicit and versioned."],
        ["Service registers", "Versioned IN KEEPING JSON, normalized long-form CSV", "Generic exchange only; no ILS, ERM, repository, or vendor-API conformance is implied."],
      ],
    ),
    dataTable(
      "service-coverage-table",
      "Cross-department register coverage",
      ["Area", "Record types", "Current records"],
      SERVICE_AREAS.map((area) => [
        area.label,
        serviceRecordTypeLabels(area.id).join("; "),
        serviceRecords.filter((record) => record.area === area.id).length,
      ]),
    ),
  ].join("");

  const findingRegister = findings.length
    ? dataTable(
        "findings-table",
        "Complete finding register — " + findings.length,
        ["Severity", "Code", "Record", "Condition", "Evidence"],
        findings.map((finding) => [finding.severity, finding.code, finding.recordId ?? "Workspace", finding.label, finding.detail]),
      )
    : emptyOutput("No metadata or access findings were present in this revision.");

  const evidenceRegister = evidenceAuthority.length
    ? dataTable(
        "evidence-authority-table",
        "Evidence disposition register — " + evidenceAuthority.length,
        ["Source", "Scope", "Disposition", "Application outcome", "Claimed origin", "Actor role claim", "Policy reference", "Browser time", "Binding"],
        evidenceAuthority.map((record) => [
          `${record.evidence.source.kind} · ${record.evidence.source.filename} · sha256:${record.evidence.source.sha256}`,
          `${record.evidence.scope.kind} · ${record.evidence.scope.entityIds.join(", ")}`,
          record.disposition.decision,
          applicationByDecision.has(record.recordSha256)
            ? `${applicationByDecision.get(record.recordSha256)!.outcome} · ${applicationByDecision.get(record.recordSha256)!.reason} · ${applicationByDecision.get(record.recordSha256)!.detail}${applicationByDecision.get(record.recordSha256)!.resultingRevisionId ? ` · revision:${applicationByDecision.get(record.recordSha256)!.resultingRevisionId} · revision-state-sha256:${applicationByDecision.get(record.recordSha256)!.resultingRevisionDigest}` : ""}`
            : "legacy/unknown application outcome — treated conservatively when scoped content is active",
          `${record.disposition.claimedOrigin} · ${record.disposition.custodyNote}`,
          record.disposition.actorRoleClaim,
          record.disposition.policyReference,
          `${record.disposition.atBrowser} · ${record.disposition.timeBasis}`,
          record.recordSha256,
        ]),
      ) + '<p class="handling-note"><strong>Authority limit:</strong> Every row is a content-bound local decision record. No row authenticates its actor, source, custody claim, chronology, completeness, or truth.</p>'
    : emptyOutput("No explicit evidence dispositions were recorded. Absence of a disposition is not evidence of authority or completeness.");

  const incidentRegister = incidents.length
    ? '<div class="record-stack">' + incidents.map(incidentRecord).join("") + "</div>"
    : emptyOutput("No incidents were present in this workspace.");

  const schemaRegister = schemas.length
    ? '<div class="record-stack">' + schemas.map((schema, schemaIndex) => [
        '<article class="record-panel">',
        "<header><div><span class=\"record-kicker\">",
        html(schema.profile), " · ", html(schema.recordType ?? "description"),
        "</span><h3>", html(schema.name), "</h3></div><strong>v", String(schema.version), "</strong></header>",
        "<p>", html(schema.description || "No schema description supplied."), "</p>",
        '<dl class="inline-definitions">',
        definition("Schema ID", schema.id),
        definition("Created", displayTime(schema.createdAt), schema.createdAt),
        definition("Updated", displayTime(schema.updatedAt), schema.updatedAt),
        definition("Fields", String(schema.fields.length)),
        "</dl>",
        schema.fields.length
          ? dataTable(
              "schema-" + String(schemaIndex + 1) + "-" + safeId(schema.id) + "-fields",
              schema.name + " field definitions",
              ["Field", "Label", "Type", "Cardinality", "Definition"],
              schema.fields.map((field) => [
                field.id,
                field.label,
                field.kind,
                (field.required ? "required" : "optional") + " · " + (field.repeatable ? "repeatable" : "single"),
                field.definition,
              ]),
            )
          : emptyOutput("This schema defines no fields."),
        "</article>",
      ].join("")).join("") + "</div>"
    : emptyOutput("No archival schemas were present in this revision.");

  const configuration = [
    '<dl class="metadata-grid">',
    definition("Resolver URL", revision.config.resolverBase || "Not configured"),
    definition("Proxy prefix", revision.config.proxyPrefix || "Not configured"),
    definition("Default pickup", revision.config.defaultPickupLocation || "Not configured"),
    definition("Member code", revision.config.memberCode || "Not configured"),
    "</dl>",
    '<p class="handling-note"><strong>Staff handling:</strong> Configuration is intentionally included in the technical artifact. Review the entire file before sharing it outside the responsible team.</p>',
  ].join("");

  const catalogRecords = revision.records.length
    ? '<div class="record-stack">' + revision.records.map((record, index) => catalogRecordPair(record, index)).join("") + "</div>"
    : emptyOutput("No catalog records were present in this revision.");

  const schemaIndex = new Map(schemas.map((schema) => [schema.id, schema]));
  const archiveRecords = units.length
    ? '<div class="record-stack">' + units.map((unit, index) => archiveRecordPair(unit, schemaIndex.get(unit.schemaId), index)).join("") + "</div>"
    : emptyOutput("No archival records were present in this revision.");

  const serviceRegister = serviceRecords.length
    ? '<div class="record-stack">' + serviceRecords.map((record, index) => serviceRecordPair(record, index)).join("") + "</div>"
    : emptyOutput("No service records were present in this revision.");

  const formats = [
    dataTable(
      "catalog-format-rules",
      "Catalog data-type formatting rules",
      ["Data type", "Storage and exchange rule"],
      DATA_FORMAT_RULES.map((item) => [item.type, item.rule]),
    ),
    dataTable(
      "catalog-record-types",
      "Catalog resource types",
      ["Type", "Interpretation"],
      RECORD_FORMATS.map((format) => [format, format === "Other" ? "Source type was retained without a more specific inferred mapping." : "Declared normalized resource type; source evidence remains attached to the record."]),
    ),
    dataTable(
      "archive-record-types",
      "Archival record types",
      ["Record type", "Scope"],
      ARCHIVE_RECORD_TYPES.map((recordType) => [recordType, archiveRecordTypeScope(recordType)]),
    ),
    dataTable(
      "archive-field-rules",
      "Archival field-type formatting rules",
      ["Field type", "Storage and exchange rule"],
      ARCHIVE_FIELD_KINDS.map((kind) => [kind, archiveFieldRule(kind)]),
    ),
    dataTable(
      "service-record-types",
      "Service-register record types",
      ["Area", "Record type", "Purpose"],
      SERVICE_RECORD_DEFINITIONS.map((definition) => [serviceAreaLabel(definition.area), definition.label, definition.purpose]),
    ),
    dataTable(
      "service-field-rules",
      "Service-register field-type formatting rules",
      ["Field type", "Stored form", "Exchange form"],
      SERVICE_DATA_FORMAT_RULES.map((rule) => [rule.kind, rule.storage, rule.exchange]),
    ),
  ].join("");

  const recovery = [
    flowFigure(
      "technical-state-binding-flow",
      "Current-state binding",
      "The verifier reconstructs the complete current non-audit workspace state, serializes its portable form, hashes it, and compares that digest with the latest event's state binding.",
      ["Current non-audit workspace state", "Portable canonical representation", "SHA-256 state digest", "Latest event state digest", "Match or fail"],
    ),
    flowFigure(
      "technical-event-chain-flow",
      "Linked-event verification",
      "For every stored event, validation requires the expected sequence and previous hash, reconstructs the bounded event fields, and compares a recomputed SHA-256 hash with the stored hash. This detects changed fields, broken links, reordering, and current-state mismatch unless every affected digest and hash is also rewritten. A separately retained checkpoint can detect a regenerated saved history; coherent replacement of the workspace and every local checkpoint requires comparison with an independently held receipt. None of these hashes prove identity, authorization, truth, custody, completeness, trusted time, provenance, or nonrepudiation.",
      ["Genesis or prior-event hash", "Sequence and bounded event fields", "Stored state digest", "Recomputed SHA-256 event hash", "Stored hash and next link", "Match, continue, or fail"],
    ),
    dataTable(
      "revision-table",
      "Revision history — " + workspace.revisions.length,
      ["Revision", "Parent", "Created", "Change", "Digest"],
      [...workspace.revisions].reverse().map((item) => [
        item.id,
        item.parentId ?? "Initial",
        displayTime(item.createdAt),
        item.label,
        item.digest,
      ]),
    ),
    workspace.audit.length
      ? dataTable(
          "audit-table",
          "Audit chain — " + workspace.audit.length + " events",
          ["Seq.", "Time", "Role", "Action", "Target", "Outcome", "State digest", "Previous hash", "Hash"],
          [...workspace.audit].sort((a, b) => a.sequence - b.sequence).map((event) => [
            event.sequence,
            displayTime(event.at),
            event.role,
            event.action,
            event.target,
            event.outcome,
            event.stateDigest ?? "Legacy event — not state-bound",
            event.previousHash || "Genesis",
            event.hash,
          ]),
        )
      : emptyOutput("No audit events were present."),
  ].join("");

  const safeguards = [
    flowFigure(
      "technical-storage-flow",
      "Named-workspace save path",
      "A save is verified before it becomes current. The manifest binds the SHA-256 digest of both retained generations; an active-generation/manifest disagreement stops without silently opening a fallback.",
      ["Working copy in memory", "Named workspace", "Validate complete snapshot and audit", "Digest current and prior generations", "Atomic IndexedDB transaction", "Manifest-bound generations"],
    ),
    dataTable(
      "safeguard-register",
      "Safeguard and residual-risk register",
      ["Threat or failure", "Implemented control", "Failure behavior", "Residual limit"],
      [
        ["Oversized, deep, or structurally hostile import", "Byte, depth, array, key, exact-shape, count, and type limits before acceptance.", "Import remains quarantined; the active revision is unchanged.", "A syntactically valid file can still contain misleading library data and requires human review."],
        ["Prototype keys or active markup", "Prototype-related keys and control characters are rejected; imported text is rendered as text, never trusted markup.", "The affected import or backup is rejected.", "Textual social engineering cannot be solved by structural validation alone."],
        ["Credential or internal-network URL", "Only public HTTPS URLs without credentials, secret-like query keys, loopback, link-local, or private IPv4/IPv6 hosts are accepted.", "The record fails validation and is not committed.", "DNS rebinding and the future behavior of a public host remain outside a static local validator."],
        ["Spreadsheet formula execution", "CSV cells beginning with formula-significant characters are prefixed before export.", "The exported value is treated as text by common spreadsheet software.", "Receiving applications can apply different import settings; review remains required."],
        ["Interrupted or quota-exhausted save", "Preflight estimate, bounded payload, digest, and a single multi-store IndexedDB transaction.", "The transaction aborts and the prior saved generation remains current.", "Browser eviction remains possible unless the user grants durable storage or retains a downloaded backup."],
        ["Stale tab overwrite", "Every manifest carries an optimistic token checked during save.", "The stale save is rejected and the user must reopen the current workspace.", "Simultaneous edits are not merged automatically."],
        ["Corrupted current generation", "The manifest binds current and prior generation digests; opening also performs strict snapshot, revision, archive, service, and audit validation.", "A manifest-bound prior generation may open only as an unsaved recovery copy. Opening never rewrites or deletes stored generations.", "One prior manifest-bound generation is retained. Failed or orphaned bytes require explicit inspection and remain browser-local until separately deleted."],
        ["Unintended disclosure", "Application code implements no analytics or background workspace upload; the public notice is a fixed one-way projection that excludes catalog, archive, service-register, configuration, and audit data.", "Workspace content stays in memory or browser storage unless the operator downloads or shares a file. The hosting provider may separately process ordinary HTTP request metadata.", "Downloaded files are plaintext and outside this application's deletion, retention, encryption, and access controls."],
        ["Undetected state alteration", "Each current audit event links the prior hash; the latest event binds the complete non-audit workspace state with SHA-256. Named saved workspaces can add a separately retained continuity checkpoint.", "Internal mismatch or checkpoint disagreement blocks ordinary output.", "An actor controlling every browser-local store can replace both workspace and checkpoint; compare an independently held receipt. No hash proves identity, truth, authority, custody, completeness, trusted time, provenance, or nonrepudiation."],
        ["Accidental deletion", "Deletion names the target, requires confirmation, and never deletes downloaded backups.", "The selected browser-local workspace or all local workspaces are removed only after confirmation.", "Browser-local deletion has no institutional records-retention authority and cannot recall exported copies."],
      ],
    ),
  ].join("");

  const boundaries = '<div class="boundary-grid">'
    + boundary("Static report", "The report was rendered in the browser. This HTML file contains no analytics, scripts, cookies, remote fonts, or external resource requests.")
    + boundary("Hostile imports", "Files are bounded, reconstructed into exact typed objects, reviewed in quarantine, and applied atomically only after acceptance.")
    + boundary("Reversibility", "Configuration, catalog, archival, and service-register changes create immutable revision records. Restore operations also create revisions.")
    + boundary("Accessibility", "The document uses landmarks, ordered flows, scoped table headers, explicit status text, keyboard-scrollable data regions, print rules, and 400% reflow.")
    + boundary("Interoperability", "Crosswalks preserve the local canonical model. Vendor acceptance and external schema validation remain receiving-system responsibilities.")
    + boundary("Browser-local persistence", "Named workspaces keep a current and one prior verified generation. A downloaded workspace backup is a plaintext, operator-controlled recovery copy outside browser eviction and application deletion.")
    + boundary("Integrity limit", "The latest audit event binds the complete non-audit state and linked hashes detect internal mismatch. A separately retained local checkpoint detects a regenerated saved history while that checkpoint remains unchanged; an independently held receipt is needed to detect coherent replacement of every browser-local store. Neither proves identity, authorization, truth, custody, completeness, trusted time, provenance, or nonrepudiation.")
    + "</div>";

  const cells = [
    notebookCell(1, "Document control", documentControl),
    notebookCell(2, "Software execution boundary", executionBoundary),
    notebookCell(3, "Inventory and interoperability", inventory),
    notebookCell(4, "Findings", findingRegister),
    notebookCell(5, "Evidence disposition register", evidenceRegister),
    notebookCell(6, "Catalog records — original input and new output", catalogRecords),
    notebookCell(7, "Incident register", incidentRegister),
    notebookCell(8, "Archive schema register", schemaRegister),
    notebookCell(9, "Archive records — entered active values and canonical active records", archiveRecords),
    notebookCell(10, "Service register — entered active values and canonical active records", serviceRegister),
    notebookCell(11, "Data and record-type formatting", formats),
    notebookCell(12, "Configuration register", configuration),
    notebookCell(13, "Recovery and audit", recovery),
    notebookCell(14, "Safeguards and recovery", safeguards),
    notebookCell(15, "Production boundaries", boundaries),
  ].join("");

  return reportDocument({
    title: workspace.name + " — Technical report",
    eyebrow: "POST-RUN NOTEBOOK · TECHNICAL REPORT",
    classification: "Potentially restricted staff record — classify at highest included sensitivity before sharing",
    description: "A complete active-state rendering of bounded catalog, archival, service-register, incident, and configuration content, plus indexes of retained revisions and audit events present in this local workspace. Historical revision payloads remain in the plaintext workspace backup and are not fully repeated here. This report does not establish external completeness, authenticity, authority, or trusted time.",
    generatedAt: timestamp,
    cells,
  });
}

export async function makePublicNoticeHtml(
  workspace: Workspace,
  generatedAt = new Date().toISOString(),
): Promise<string> {
  try {
    await validateWorkspaceSnapshot(workspace);
  } catch {
    throw new Error("Public Notice is unavailable because full workspace validation failed.");
  }
  const timestamp = exactTimestamp(generatedAt);
  const openIncidents = workspace.incidents.filter((incident) => incident.state !== "resolved");
  if (workspace.incidents.some((incident) => incident.synthetic)) throw new Error("Public Notice is unavailable from a workspace containing Sample data incidents. Begin a blank workspace for publication work.");
  if (workspace.incidents.some((incident) => incident.state === "resolved" && (!incident.notes.some((note) => note.trim()) || !incident.ownerRole.trim() || /^unassigned$/i.test(incident.ownerRole.trim()) || !incident.nextAction.trim()))) throw new Error("Public Notice is unavailable because one or more resolved incidents lack closure evidence, an assigned owner, or a closure criterion or next action. Reopen or document those incidents first.");
  const activeEvidence = assessActiveEvidence(workspace);
  if (activeEvidence.blocked) {
    throw new Error(`Public Notice is unavailable because active workspace content is unverified or unattributed. ${activeEvidence.reason}`);
  }
  const services = [...new Set(openIncidents.map(publicService))].sort();
  const status = openIncidents.length
    ? String(openIncidents.length) + " service issue" + (openIncidents.length === 1 ? "" : "s") + " under review"
    : "No active incident is recorded in this workspace";

  const currentStatus = [
    statusBanner("Library service update", status, openIncidents.length > 0 ? "danger" : "review"),
    '<p class="lead">',
    openIncidents.length
      ? "Library staff are reviewing the affected service paths. The notice below contains only information needed to seek access or assistance."
      : "No active incident is recorded in this workspace. This does not show that every service was checked or working; confirm current service state through the institution's authoritative process before publication.",
    "</p>",
  ].join("");

  const affectedServices = services.length
    ? dataTable(
        "public-service-table",
        "Current public service guidance",
        ["Service", "What you can do"],
        services.map((service) => [service, PUBLIC_SERVICE_COPY[service]]),
      )
    : emptyOutput("No affected services are currently listed.");

  const noticeBoundary = [
    flowFigure(
      "public-redaction-flow",
      "Private-to-public projection",
      "The publication path is one-way. A new allowlisted object is built from the service category; internal evidence and configuration are never passed to the public renderer.",
      ["Private incident record", "Read service category only", "Build fixed public object", "Plain-language status notice"],
    ),
    flowFigure(
      "public-help-flow",
      "Access assistance path",
      "If an item remains unavailable, staff can help check another route.",
      ["Try from the library record", "Note the item and service", "Contact library staff", "Receive an accessible alternative or follow-up"],
    ),
  ].join("");

  const help = '<div class="boundary-grid">'
    + boundary("Need access?", "Contact library staff if you still cannot find, open, or request an item. Include the item title and the step that did not work; do not send passwords or sensitive account details.")
    + boundary("Accessible assistance", "Ask for the response format or access route that works for you. Staff can check alternate copies, request paths, or follow-up methods.")
    + boundary("Notice generated", displayTime(timestamp), timestamp)
    + boundary("Evidence scope", "This draft reflects only open incident records present in one local workspace. Absence here is not an institutional all-clear, and the browser clock is not trusted time.")
    + boundary("Privacy", "This public file excludes catalog and archive records, service-register fields, record identifiers, staff notes, incident evidence, configuration, revision digests, and audit history.")
    + "</div>";

  return reportDocument({
    title: "Library service update — Public notice",
    eyebrow: "POST-RUN NOTEBOOK · PUBLIC NOTICE",
    classification: "Draft public information — approval required",
    description: "A plain-language draft generated solely from open incident records present in a redacted local projection. Publication requires current institutional review and approval.",
    generatedAt: timestamp,
    cells: [
      notebookCell(1, "Current status", currentStatus),
      notebookCell(2, "Affected services", affectedServices),
      notebookCell(3, "Public notice boundary", noticeBoundary),
      notebookCell(4, "Help and freshness", help),
    ].join(""),
  });
}

function reportDocument(input: {
  title: string;
  eyebrow: string;
  classification: string;
  description: string;
  generatedAt: string;
  cells: string;
}): string {
  const document = [
    "<!doctype html>",
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="color-scheme" content="light">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    '<meta name="referrer" content="no-referrer">',
    '<meta name="generator" content="IN KEEPING post-run notebook renderer">',
    '<meta name="font-license" content="Jost · Copyright 2020 The Jost Project Authors · SIL Open Font License 1.1">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'\">",
    "<title>", html(input.title), "</title><style>", reportStyles(), "</style></head><body>",
    '<a class="skip-link" href="#report-main">Skip to report</a>',
    '<div class="notebook-shell"><header class="document-header"><div>',
    '<p class="document-eyebrow">', html(input.eyebrow), "</p>",
    '<h1 id="report-title">', html(input.title), "</h1>",
    '<p class="document-description">', html(input.description), "</p></div>",
    '<div class="document-classification"><span>Handling</span><strong>', html(input.classification), "</strong>",
    '<time datetime="', html(input.generatedAt), '">', html(displayTime(input.generatedAt)), "</time></div></header>",
    '<main id="report-main" tabindex="-1"><article class="jp-Notebook" data-document-format="post-jupyter-html" aria-labelledby="report-title">',
    input.cells,
    "</article></main>",
    "<footer><span>IN KEEPING · Library systems continuity</span><span>Generated locally · Static HTML · No runtime or network requests</span></footer>",
    "</div></body></html>",
  ].join("");
  if (new TextEncoder().encode(document).byteLength > MAX_REPORT_OUTPUT_BYTES) {
    throw new Error("The report exceeds the 32 MiB output boundary.");
  }
  return document;
}

function notebookCell(number: number, title: string, body: string): string {
  const id = "cell-" + String(number).padStart(2, "0");
  return [
    '<section class="jp-Cell" aria-labelledby="', id, '-title">',
    '<div class="jp-InputPrompt" aria-hidden="true">Out&nbsp;[', String(number).padStart(2, "0"), "]:</div>",
    '<div class="jp-OutputArea"><h2 id="', id, '-title">', html(title), "</h2>",
    body,
    "</div></section>",
  ].join("");
}

function flowFigure(id: string, caption: string, description: string, nodes: string[]): string {
  return [
    '<figure class="diagram" aria-labelledby="', id, '-caption" aria-describedby="', id, '-description">',
    '<figcaption id="', id, '-caption">', html(caption), "</figcaption>",
    '<p id="', id, '-description">', html(description), "</p>",
    '<ol class="diagram-flow" style="--flow-columns:', String(nodes.length), '">',
    nodes.map((node) => "<li><span>" + html(node) + "</span></li>").join(""),
    "</ol></figure>",
  ].join("");
}

function laneFigure(title: string, nodes: string[]): string {
  return [
    '<section class="diagram lane" aria-label="', html(title), '"><h3>', html(title), "</h3>",
    '<ol class="diagram-flow">',
    nodes.map((node) => "<li><span>" + html(node) + "</span></li>").join(""),
    "</ol></section>",
  ].join("");
}

function dataTable(
  id: string,
  caption: string,
  headers: string[],
  rows: (string | number)[][],
): string {
  if (!rows.length) return emptyOutput("No " + caption.toLowerCase() + " entries were present.");
  return [
    '<div class="table-scroll" role="region" aria-labelledby="', id, '-caption" tabindex="0">',
    '<table><caption id="', id, '-caption">', html(caption), "</caption><thead><tr>",
    headers.map((header) => '<th scope="col">' + html(header) + "</th>").join(""),
    "</tr></thead><tbody>",
    rows.map((row) => "<tr>" + row.map((value, index) =>
      index === 0
        ? '<th scope="row">' + html(value) + "</th>"
        : "<td>" + html(value) + "</td>",
    ).join("") + "</tr>").join(""),
    "</tbody></table></div>",
  ].join("");
}

function incidentRecord(incident: Incident): string {
  return [
    '<article class="record-panel"><header><div><span class="record-kicker">',
    html(incident.service), " · ", html(incident.severity),
    "</span><h3>", html(incident.title), "</h3></div><strong>", html(incident.state), "</strong></header>",
    '<dl class="inline-definitions">',
    definition("Incident ID", incident.id),
    definition("Record", incident.recordId ?? "Workspace"),
    definition("Owner role", incident.ownerRole),
    definition("Opened", displayTime(incident.openedAt), incident.openedAt),
    definition("Updated", displayTime(incident.updatedAt), incident.updatedAt),
    definition("Synthetic", incident.synthetic ? "Yes" : "No"),
    definition("Next action", incident.nextAction),
    definition("Evidence", incident.evidence.join(" · ") || "None"),
    definition("Notes", incident.notes.join(" · ") || "None"),
    "</dl></article>",
  ].join("");
}

function catalogRecordPair(record: CatalogRecord, index: number): string {
  const id = "catalog-" + String(index + 1) + "-" + safeId(record.id);
  const sourceElements = record.source.elements?.length
    ? record.source.elements.map((element) => [element.code, element.name, element.value, element.definition])
    : Object.entries(record.source.trace).map(([code, value]) => [code, "Source trace", value, "A parser trace value retained exactly with the normalized record."]);
  const original = {
    format: record.source.format,
    label: record.source.label,
    digest: record.source.digest,
    ordinal: record.source.ordinal,
    trace: record.source.trace,
    elements: record.source.elements ?? [],
  };
  return recordPair(
    id,
    record.title || record.id,
    record.format + " · " + record.id,
    "Original input",
    "The exact source evidence retained with this record. It is bounded evidence, not a byte-for-byte copy of the complete imported file.",
    codeBlock("Retained original input as JSON", original),
    dataTable(
      id + "-source-elements",
      "Original source elements and accessible definitions",
      ["Element", "Name", "Original value", "Definition"],
      sourceElements.length ? sourceElements : [["—", "No retained element", "—", "This record contains source provenance but no reconstructed source element."]],
    ),
    "New output",
    "The complete canonical catalog record used for validation, revision digests, display, and exchange formatting.",
    codeBlock("Canonical catalog record as JSON", record),
    dataTable(
      id + "-output-fields",
      "Canonical output fields and accessible definitions",
      ["Field", "Data type", "Current value", "Definition"],
      catalogOutputRows(record),
    ),
  );
}

function catalogOutputRows(record: CatalogRecord): (string | number)[][] {
  const metadata = {
    issued: "", created: "", modified: "", publisher: "", place: "", language: "", subjects: [] as string[], genres: [] as string[], abstract: "", rights: "", license: "", series: "", containerTitle: "", volume: "", issue: "", pages: "", extent: "", audience: "", coverage: "", relations: [] as string[], notes: [] as string[],
    ...(record.metadata ?? {}),
  };
  const rows: (string | number)[][] = [
    ["id", "identifier", record.id, "Stable local record identifier."],
    ["title", "text", record.title, "Preferred title used by the canonical record."],
    ["creators", "text list", renderValue(record.creators), "Primary agents responsible for the resource, retained in supplied display order."],
    ["contributors", "text list", renderValue(record.contributors ?? []), "Additional responsible agents and contributors."],
    ["year", "date text", record.year, "Display year derived conservatively from supplied date evidence."],
    ["format", "controlled term", record.format, "Normalized catalog resource type."],
    ["identifiers", "identifier objects", renderValue(record.identifiers.map((item) => item.scheme + ":" + item.value)), "Scheme-qualified identifiers; display values are preserved."],
    ["links", "HTTPS URI list", renderValue(record.links), "Validated public access or description links."],
    ["availability", "controlled term", record.availability, "Current access or availability state."],
    ["edition", "text", record.edition, "Edition or version statement."],
    ["location", "text", record.location, "Service, shelving, repository, or access location."],
    ["suppressed", "boolean", String(record.suppressed), "Whether the record is withheld by an explicit suppression rule."],
    ["publicVisible", "boolean", String(record.publicVisible), "Whether the record may appear in public discovery."],
    ["requestable", "boolean", String(record.requestable), "Whether the resource may be requested through the modeled service."],
  ];
  const metadataDefinitions: Record<keyof typeof metadata, [string, string]> = {
    issued: ["date text", "Publication or issuance date as supplied."], created: ["date text", "Resource creation date as supplied."], modified: ["date text", "Resource or description modification date as supplied."],
    publisher: ["text", "Publishing or issuing agent."], place: ["text", "Place of publication or production."], language: ["language code or label", "Language of the resource or description."],
    subjects: ["controlled-term list", "Repeatable topical, geographic, chronological, or named-entity access terms."], genres: ["controlled-term list", "Repeatable genre or form terms."],
    abstract: ["long text", "Summary or abstract of the resource."], rights: ["long text", "Human-readable rights or access statement."], license: ["text or URI", "Machine-actionable license identifier or statement, kept distinct from rights."],
    series: ["text", "Series statement."], containerTitle: ["text", "Host publication, journal, or container title."], volume: ["text", "Volume designation."], issue: ["text", "Issue designation."], pages: ["text", "Page or article-number extent."],
    extent: ["text", "Physical or digital extent statement."], audience: ["text", "Intended or stated audience."], coverage: ["text", "Spatial or temporal coverage."],
    relations: ["identifier or URI list", "Repeatable related-resource references."], notes: ["long-text list", "Repeatable descriptive or processing notes."],
  };
  for (const [field, value] of Object.entries(metadata)) {
    const [type, definition] = metadataDefinitions[field as keyof typeof metadata];
    rows.push(["metadata." + field, type, renderValue(value), definition]);
  }
  rows.push(
    ["source.format", "controlled term", record.source.format, "Parser family that produced this canonical record."],
    ["source.label", "text", record.source.label, "Operator-visible source label or filename."],
    ["source.digest", "SHA-256", record.source.digest, "Digest of the reviewed source payload."],
    ["source.ordinal", "integer", record.source.ordinal, "One-based record position in the source payload."],
    ["source.trace", "text map", renderValue(record.source.trace), "Bounded parser trace used for normalization review."],
    ["source.elements", "defined element list", String(record.source.elements?.length ?? 0) + " retained", "Reconstructed source elements with code, name, value, and definition."],
  );
  return rows;
}

function archiveRecordPair(unit: ArchiveUnit, schema: ArchiveSchema | undefined, index: number): string {
  const id = "archive-" + String(index + 1) + "-" + safeId(unit.id);
  const fieldIndex = new Map(schema?.fields.map((field) => [field.id, field]) ?? []);
  const valueRows = Object.entries(unit.values).map(([fieldId, value]) => {
    const field = fieldIndex.get(fieldId);
    return [fieldId, field?.label ?? "Unresolved field", field?.kind ?? typeof value, renderValue(value), field?.definition ?? "The referenced schema definition was not present in this report."];
  });
  const outputRows: (string | number)[][] = [
    ["id", "identifier", unit.id, "Stable archival record identifier."],
    ["schemaId", "identifier", unit.schemaId, "Identifier of the schema that validates this record."],
    ["schemaVersion", "integer", unit.schemaVersion, "Exact schema version used by this record."],
    ["parentId", "record reference or null", unit.parentId ?? "No parent", "Parent record in the validated hierarchy; null identifies a root."],
    ["level", "controlled term", unit.level, "Descriptive hierarchy level; non-description schemas use other."],
    ["published", "boolean", String(unit.published === true), "Explicit public-release state; missing legacy values are interpreted as private."],
    ["language", "BCP 47-style code", unit.language ?? "en", "Language of the description, distinct from the language of material."],
    ["createdAt", "UTC date-time", unit.createdAt, "Record creation timestamp."],
    ["updatedAt", "UTC date-time", unit.updatedAt, "Most recent record-change timestamp."],
    ...valueRows.map((row) => ["values." + row[0], row[2], row[3], row[4]]),
  ];
  return recordPair(
    id,
    archiveRecordTitle(unit, schema),
    (schema?.recordType ?? "description") + " · " + unit.id,
    "Entered active values",
    "The schema-bound values present in the active archival record. This model does not retain a separate per-record source version, so these values must not be read as original provenance.",
    codeBlock("Entered active archival values as JSON", { schemaId: unit.schemaId, schemaVersion: unit.schemaVersion, values: unit.values }),
    dataTable(id + "-source-fields", "Entered active archival fields and accessible definitions", ["Field", "Label", "Data type", "Active value", "Definition"], valueRows.length ? valueRows : [["—", "No fields", "—", "—", "The schema accepted an empty value object."]]),
    "Canonical active record",
    "The canonical active archival record after hierarchy, publication, language, cardinality, and field-type validation.",
    codeBlock("Canonical archival record as JSON", unit),
    dataTable(id + "-output-fields", "Canonical archival output and accessible definitions", ["Field", "Data type", "Current value", "Definition"], outputRows),
  );
}

function serviceRecordPair(record: ServiceRecord, index: number): string {
  const id = "service-" + String(index + 1) + "-" + safeId(record.id);
  const definitionValue = serviceDefinition(record.kind);
  const fieldIndex = new Map(definitionValue.fields.map((field) => [field.id, field]));
  const valueRows = Object.entries(record.values).map(([fieldId, value]) => {
    const field = fieldIndex.get(fieldId);
    return [fieldId, field?.label ?? "Unresolved field", field?.kind ?? typeof value, renderValue(value), field?.definition ?? "The declared service definition was not present."];
  });
  const outputRows: (string | number)[][] = [
    ["id", "identifier", record.id, "Stable local service-register identifier."],
    ["kind", "controlled term", record.kind, "Declared record definition used for validation."],
    ["area", "controlled term", serviceAreaLabel(record.area), "Library operational area accountable for this record."],
    ["title", "text", record.title, "Operator-readable record title."],
    ["state", "controlled term", record.state, "Workflow state: active, review, due, blocked, or retired."],
    ["ownerRole", "text", record.ownerRole, "Accountable institutional role; personal data is not required."],
    ["system", "text", record.system || "Not specified", "Related platform, repository, vendor service, collection, or workflow."],
    ["sensitivity", "controlled term", record.sensitivity, "Public, internal, or restricted handling classification."],
    ["createdAt", "UTC date-time", record.createdAt, "Record creation timestamp."],
    ["updatedAt", "UTC date-time", record.updatedAt, "Most recent record-change timestamp."],
    ...valueRows.map((row) => ["values." + row[0], row[2], row[3], row[4]]),
  ];
  return recordPair(
    id,
    record.title,
    serviceAreaLabel(record.area) + " · " + definitionValue.label,
    "Entered active values",
    "The typed values present in the active service record. This model does not retain a separate per-record source version, so these values must not be read as original provenance.",
    codeBlock("Entered active service values as JSON", { kind: record.kind, values: record.values }),
    dataTable(id + "-source-fields", "Entered active service fields and accessible definitions", ["Field", "Label", "Data type", "Active value", "Definition"], valueRows.length ? valueRows : [["—", "No fields", "—", "—", "This service record contains no optional field values."]]),
    "Canonical active record",
    "The canonical active service record included in the revision digest, rollback state, plaintext workspace backup, and generic exchange exports.",
    codeBlock("Canonical service record as JSON", record),
    dataTable(id + "-output-fields", "Canonical service output and accessible definitions", ["Field", "Data type", "Current value", "Definition"], outputRows),
  );
}

function recordPair(
  id: string,
  title: string,
  kicker: string,
  originalLabel: string,
  originalDescription: string,
  originalCode: string,
  originalDefinitions: string,
  outputLabel: string,
  outputDescription: string,
  outputCode: string,
  outputDefinitions: string,
): string {
  return [
    '<article class="transformation-record" aria-labelledby="', id, '-title"><header><span class="record-kicker">', html(kicker), '</span><h3 id="', id, '-title">', html(title), "</h3></header>",
    '<div class="record-pair-grid">',
    '<section class="record-block" aria-labelledby="', id, '-original"><h4 id="', id, '-original">', html(originalLabel), "</h4><p>", html(originalDescription), "</p>", originalCode, originalDefinitions, "</section>",
    '<section class="record-block" aria-labelledby="', id, '-output"><h4 id="', id, '-output">', html(outputLabel), "</h4><p>", html(outputDescription), "</p>", outputCode, outputDefinitions, "</section>",
    "</div></article>",
  ].join("");
}

function codeBlock(label: string, value: unknown): string {
  return '<figure class="record-code"><figcaption>' + html(label) + '</figcaption><pre tabindex="0"><code>' + html(JSON.stringify(value, null, 2)) + "</code></pre></figure>";
}

function archiveRecordTitle(unit: ArchiveUnit, schema?: ArchiveSchema): string {
  const titleField = schema?.fields.find((field) => field.id === "title" || /title|name/i.test(field.label));
  const titleValue = titleField ? unit.values[titleField.id] : undefined;
  const textValue = Array.isArray(titleValue) ? titleValue[0] : titleValue;
  return typeof textValue === "string" && textValue ? textValue : unit.id;
}

function renderValue(value: ServiceValue | unknown): string {
  if (Array.isArray(value)) return value.length ? value.map((item) => renderValue(item)).join("; ") : "—";
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === "" || value === undefined || value === null) return "—";
  return String(value);
}

function serviceAreaLabel(area: ServiceArea): string {
  return SERVICE_AREAS.find((item) => item.id === area)?.label ?? area;
}

function serviceRecordTypeLabels(area: ServiceArea): string[] {
  return SERVICE_RECORD_DEFINITIONS.filter((definition) => definition.area === area).map((definition) => definition.label);
}

function archiveRecordTypeScope(recordType: string): string {
  const scopes: Record<string, string> = {
    description: "Hierarchical intellectual description with an explicit publication state.", accession: "Custody and receipt record; not serialized as EAD description.", authority: "Controlled authority record.", agent: "Person, family, or corporate-body identity record.", repository: "Repository or custodial institution record.", "digital-object": "Digital object and delivery metadata record.", rights: "Rights basis, restriction, permission, or license record.", event: "Preservation, custody, or description event record.", subject: "Controlled subject or concept record.", location: "Physical or managed-storage location record.",
  };
  return scopes[recordType] ?? "Declared archival record type.";
}

function archiveFieldRule(kind: ArchiveFieldKind): string {
  const rules: Record<ArchiveFieldKind, string> = {
    text: "One bounded Unicode NFC string; emitted as escaped text, never markup.",
    "long-text": "One bounded multiline Unicode NFC string; XML serializers emit textual paragraphs.",
    integer: "Safe whole number with absolute value no greater than 10^12; JSON number and xsd:integer declaration.",
    decimal: "Finite number with absolute value no greater than 10^12; JSON number and xsd:decimal declaration.",
    boolean: "Explicit JSON boolean; serialized as true or false.",
    date: "A real Gregorian date in YYYY-MM-DD; missing components are not inferred.",
    "date-time": "An ISO 8601 UTC instant ending in Z.",
    edtf: "Bounded EDTF text preserving uncertainty, approximation, open intervals, or ranges.",
    identifier: "Bounded textual identifier retained without silent regeneration.",
    uri: "Validated public HTTPS URI without credentials, private hosts, or secret-like query keys.",
    "language-code": "Conservative BCP 47-style language tag retained as text.",
    "media-type": "IANA-style type/subtype token with bounded optional parameters.",
    checksum: "md5, sha256, or sha512 label with the exact hexadecimal digest length.",
    "controlled-term": "Text that must match the field vocabulary when a vocabulary is declared.",
    "record-reference": "Safe local archival record identifier; target resolution is not inferred or validated.",
    "agent-reference": "Safe local agent identifier; target resolution is not inferred or validated.",
  };
  return rules[kind];
}

function publicService(incident: Incident): PublicService {
  if (incident.service === "Electronic access") return "Electronic access";
  if (incident.service === "Fulfillment") return "Fulfillment";
  if (incident.service === "Discovery metadata") return "Discovery metadata";
  return "Library service";
}

function statusBanner(label: string, value: string, tone: "danger" | "review" | "neutral"): string {
  return '<div class="status-banner status-' + tone + '"><span>'
    + html(label) + "</span><strong>" + html(value) + "</strong></div>";
}

function definition(term: string, value: string, time?: string): string {
  const rendered = time
    ? '<time datetime="' + html(exactTimestamp(time)) + '">' + html(value) + "</time>"
    : html(value);
  return "<div><dt>" + html(term) + "</dt><dd>" + rendered + "</dd></div>";
}

function metric(value: number, label: string): string {
  return "<div><strong>" + value.toLocaleString("en-US") + "</strong><span>" + html(label) + "</span></div>";
}

function boundary(title: string, copy: string, time?: string): string {
  const content = time
    ? '<time datetime="' + html(exactTimestamp(time)) + '">' + html(copy) + "</time>"
    : html(copy);
  return "<section><h3>" + html(title) + "</h3><p>" + content + "</p></section>";
}

function emptyOutput(copy: string): string {
  return '<p class="empty-output">' + html(copy) + "</p>";
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "schema";
}

function severityOrder(value: string): number {
  return value === "error" ? 0 : value === "warning" ? 1 : 2;
}

function exactTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Report timestamp must be a valid date-time.");
  return date.toISOString();
}

function displayTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

function html(value: unknown): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (character) => escapes[character] ?? character);
}

function reportStyles(): string {
  return [
    "@font-face{font-family:Jost;font-style:normal;font-weight:400 700;font-display:block;src:url(data:font/woff2;base64,",
    REPORT_JOST_FONTS.latin,
    ') format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}',
    "@font-face{font-family:Jost;font-style:normal;font-weight:400 700;font-display:block;src:url(data:font/woff2;base64,",
    REPORT_JOST_FONTS.latinExt,
    ') format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}',
    "@font-face{font-family:Jost;font-style:normal;font-weight:400 700;font-display:block;src:url(data:font/woff2;base64,",
    REPORT_JOST_FONTS.cyrillic,
    ') format("woff2");unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}',
    REPORT_CSS,
  ].join("");
}

const REPORT_CSS = [
  ":root{--paper:#fefefc;--surface:#f7f8f5;--ink:#1b1d1a;--muted:#61675f;--line:#d5d8d1;--line-strong:#a8afa4;--green:#0b4705;--green-soft:#edf4eb;--red:#950f22;--red-soft:#f8eaed;color-scheme:light}",
  "*{box-sizing:border-box}",
  "html{inline-size:100%;max-inline-size:100%;min-block-size:100%;overflow-x:hidden;background:var(--paper);scroll-behavior:smooth}",
  "body{inline-size:100%;max-inline-size:100%;min-block-size:100svh;min-block-size:100dvh;margin:0;overflow-x:hidden;background:var(--paper);color:var(--ink);font:400 16px/1.55 Jost,Avenir Next,Avenir,Century Gothic,system-ui,sans-serif}",
  "::selection{background:#dbe8d8;color:#000}",
  ".skip-link{position:fixed;inset-block-start:.6rem;inset-inline-start:.6rem;z-index:5;transform:translateY(-180%);padding:.55rem .75rem;background:var(--ink);color:#fff}.skip-link:focus{transform:none}.skip-link:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--green);outline-offset:3px}",
  ".notebook-shell{inline-size:min(92dvw,82rem);max-inline-size:calc(100% - 2rem);min-block-size:100dvh;margin-inline:auto;display:flex;flex-direction:column}",
  ".document-header{display:grid;grid-template-columns:minmax(0,1fr) minmax(12rem,18rem);gap:clamp(1.25rem,4vw,4rem);align-items:end;padding-block:clamp(2rem,7dvh,5rem) 1.5rem;border-bottom:1px solid var(--ink)}",
  ".document-eyebrow{margin:0 0 .45rem;color:var(--green);font:700 .75rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}.document-header h1{max-inline-size:18ch;margin:0;font-size:clamp(2.15rem,6vw,4.8rem);font-weight:400;line-height:.98;letter-spacing:-.045em;overflow-wrap:anywhere}.document-description{max-inline-size:62ch;margin:1rem 0 0;color:var(--muted)}",
  ".document-classification{min-inline-size:0;padding-block:.75rem;border-block:1px solid var(--line);display:grid;gap:.25rem}.document-classification span{color:var(--muted);font-size:.75rem;letter-spacing:.06em;text-transform:uppercase}.document-classification strong{color:var(--red);font-weight:500}.document-classification time{font:400 .75rem/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}",
  "main{flex:1;min-inline-size:0}.jp-Notebook{min-inline-size:0}.jp-Cell{display:grid;grid-template-columns:minmax(4.5rem,7dvw) minmax(0,1fr);border-bottom:1px solid var(--line)}.jp-InputPrompt{padding:1.45rem 1rem 1rem 0;color:var(--green);font:400 .75rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right;white-space:nowrap}.jp-OutputArea{min-inline-size:0;padding:1.25rem 0 2rem clamp(1rem,3vw,2.5rem);border-inline-start:1px solid var(--line)}.jp-OutputArea>h2{margin:0 0 1rem;font-size:clamp(1.25rem,2vw,1.75rem);font-weight:500;line-height:1.2;letter-spacing:-.02em}",
  ".status-banner{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;padding:.8rem 0;border-block:2px solid currentColor}.status-banner span{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}.status-banner strong{font-size:clamp(1.1rem,2.4vw,1.65rem);font-weight:500;text-align:right}.status-neutral{color:var(--muted)}.status-review{color:var(--ink)}.status-danger{color:var(--red)}",
  ".metadata-grid,.inline-definitions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 1.5rem;margin:1rem 0}.metadata-grid>div,.inline-definitions>div{min-inline-size:0;padding:.55rem 0;border-bottom:1px solid var(--line)}dt{color:var(--muted);font-size:.75rem;letter-spacing:.04em;text-transform:uppercase}dd{margin:.16rem 0 0;overflow-wrap:anywhere}time{overflow-wrap:anywhere}",
  ".metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:1.25rem;border-block:1px solid var(--ink)}.metric-grid>div{min-inline-size:0;padding:1rem;border-inline-end:1px solid var(--line)}.metric-grid>div:nth-child(3n){border-inline-end:0}.metric-grid strong,.metric-grid span{display:block}.metric-grid strong{font-size:clamp(1.5rem,4vw,2.35rem);font-weight:400;line-height:1}.metric-grid span{margin-top:.35rem;color:var(--muted);font-size:.78rem}",
  ".diagram{max-inline-size:100%;margin:1.1rem 0 1.6rem;padding:1rem;border-block:1px solid var(--ink);overflow:hidden}.diagram figcaption,.lane h3{font-size:.9rem;font-weight:600}.diagram>p{max-inline-size:70ch;margin:.25rem 0 1rem;color:var(--muted);font-size:.82rem}.diagram-flow{display:grid;grid-template-columns:repeat(var(--flow-columns,5),minmax(0,1fr));gap:1.6rem;margin:0;padding:0;list-style:none;counter-reset:flow}.diagram-flow li{position:relative;min-inline-size:0;display:grid;place-items:center;min-block-size:5.25rem;padding:.65rem;border:1px solid var(--line-strong);background:var(--paper);text-align:center;overflow-wrap:anywhere;counter-increment:flow}.diagram-flow li:before{content:counter(flow,decimal-leading-zero);position:absolute;inset-block-start:.25rem;inset-inline-start:.35rem;color:var(--green);font:400 .65rem ui-monospace,SFMono-Regular,Menlo,monospace}.diagram-flow li:not(:last-child):after{content:'→';position:absolute;inset-inline-end:-1.15rem;inset-block-start:50%;translate:0 -50%;color:var(--green);font:700 1rem ui-monospace,SFMono-Regular,Menlo,monospace}.diagram-flow li span{font-size:.78rem;line-height:1.35}.diagram-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.25rem;margin-block:1rem 1.6rem}.lane{min-inline-size:0;margin:0;padding:1rem;border-block:1px solid var(--ink)}.lane .diagram-flow{--flow-columns:1;gap:1.35rem;margin-top:.8rem}.lane .diagram-flow li{min-block-size:3.65rem}.lane .diagram-flow li:not(:last-child):after{content:'↓';inset-inline-start:50%;inset-inline-end:auto;inset-block-start:auto;inset-block-end:-1.15rem;translate:-50% 0}",
  ".table-scroll{inline-size:100%;max-inline-size:100%;max-block-size:min(68dvh,48rem);margin:1rem 0 1.5rem;overflow:auto;overscroll-behavior:contain;border-block:1px solid var(--ink);scrollbar-gutter:stable}table{inline-size:100%;min-inline-size:42rem;border-collapse:collapse;font-size:.78rem;text-align:left}caption{padding:.65rem 0;text-align:left;font-size:.88rem;font-weight:600}th,td{max-inline-size:32rem;padding:.55rem .65rem .55rem 0;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}thead th{position:sticky;inset-block-start:0;background:var(--paper);color:var(--muted);font-size:.7rem;letter-spacing:.05em;text-transform:uppercase}tbody th{font-weight:500}",
  ".record-stack{display:grid;gap:1rem}.record-panel,.transformation-record{min-inline-size:0;padding-block:.8rem;border-block-start:1px solid var(--ink)}.record-panel>header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.record-panel h3,.transformation-record h3{margin:.15rem 0 0;font-size:1rem;font-weight:500;overflow-wrap:anywhere}.record-panel>header>strong{color:var(--green);font:500 .75rem ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.record-panel>p{margin:.6rem 0;color:var(--muted);font-size:.84rem}.record-kicker{color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}.record-pair-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(1rem,3vw,2.5rem);margin-top:1rem}.record-block{min-inline-size:0}.record-block h4{margin:0;padding:.55rem 0;border-block:2px solid currentColor;color:var(--green);font-size:.9rem}.record-block>p{min-block-size:3.9em;margin:.65rem 0;color:var(--muted);font-size:.8rem}.record-code{min-inline-size:0;margin:0 0 1rem}.record-code figcaption{padding:.45rem 0;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}.record-code pre{max-inline-size:100%;max-block-size:min(44dvh,30rem);margin:0;padding:.8rem;overflow:auto;overscroll-behavior:contain;background:var(--surface);border-block:1px solid var(--line);font:400 .7rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;scrollbar-gutter:stable}.record-code code{font:inherit}",
  ".boundary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.boundary-grid section{min-inline-size:0;padding:.8rem 0;border-block-start:1px solid var(--ink)}.boundary-grid h3{margin:0 0 .35rem;font-size:.88rem}.boundary-grid p{margin:0;color:var(--muted);font-size:.82rem;overflow-wrap:anywhere}.handling-note{margin:1rem 0 0;padding:.8rem;border-inline-start:3px solid var(--red);background:var(--red-soft);font-size:.84rem}.empty-output{margin:0;padding:1rem 0;border-block:1px solid var(--line);color:var(--muted)}.lead{max-inline-size:65ch;font-size:1.05rem}footer{display:flex;justify-content:space-between;gap:1rem;padding:1.2rem 0 2rem;border-block-start:1px solid var(--ink);color:var(--muted);font-size:.75rem}footer span:first-child{color:var(--green)}",
  "@media(max-width:52rem){.document-header{grid-template-columns:1fr}.document-classification{max-inline-size:none}.jp-Cell{grid-template-columns:1fr}.jp-InputPrompt{padding:1rem 0 .25rem;text-align:left}.jp-OutputArea{padding:0 0 1.75rem;border-inline-start:0}.diagram-flow{--flow-columns:1!important;gap:1.35rem}.diagram-flow li{min-block-size:3.75rem}.diagram-flow li:not(:last-child):after{content:'↓';inset-inline-start:50%;inset-inline-end:auto;inset-block-start:auto;inset-block-end:-1.15rem;translate:-50% 0}.diagram-lanes,.boundary-grid,.record-pair-grid{grid-template-columns:1fr}.record-block>p{min-block-size:0}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric-grid>div:nth-child(3n){border-inline-end:1px solid var(--line)}.metric-grid>div:nth-child(2n){border-inline-end:0}}",
  "@media(max-width:34rem){.notebook-shell{inline-size:calc(100% - 2rem);max-inline-size:calc(100% - 2rem)}.document-header{padding-block:1.5rem 1rem}.document-header h1{font-size:2.2rem}.metadata-grid,.inline-definitions,.metric-grid{grid-template-columns:1fr}.metric-grid>div{border-inline-end:0!important}.status-banner,.record-panel>header,footer{align-items:flex-start;flex-direction:column}.status-banner strong{text-align:left}.table-scroll{max-block-size:62dvh}.document-classification{min-inline-size:0}}",
  "@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media(forced-colors:active){.status-banner,.diagram-flow li,.handling-note{border:1px solid currentColor}}",
  "@media print{body{font-size:10pt}.notebook-shell{inline-size:100%;max-inline-size:none}.document-header{padding-block:1rem}.jp-Cell{break-inside:auto}.jp-OutputArea{padding-block:1rem}.table-scroll,.record-code pre{max-block-size:none;overflow:visible;white-space:pre-wrap}.diagram,.record-panel,.transformation-record,.boundary-grid section{break-inside:avoid}thead th{position:static}footer{padding-block:1rem}}",
].join("");
