import { validateArchiveSchema, validateArchiveSet, validateArchiveUnit, verifyArchiveImportReviewBinding, type ArchiveImportReview, type ArchiveSchema, type ArchiveUnit } from "./archival-schemas.ts";
import { makeServiceRecord, serviceDefinition, validateServiceRecords, type ServiceRecord, type ServiceValue } from "./service-register.ts";
import { reviewPublicHttpsUrl } from "./public-url.ts";
import { assertSafeJsonText } from "./json-safety.ts";
import { assertIdentityText, containsUnicodeFormatControl } from "./identity-safety.ts";
import { assertSafeXmlText, assertXmlElementNamespaces } from "./xml-safety.ts";
import { unprotectSpreadsheetCell } from "./spreadsheet-safety.ts";
import {
  canonicalDigest as canonicalEvidenceDigest,
  createEvidenceApplicationRecord,
  createEvidenceAuthorityRecord,
  createEvidenceWarningManifest,
  MAX_EVIDENCE_WARNINGS,
  validateEvidenceApplicationLink,
  validateEvidenceApplicationRecord,
  validateEvidenceAuthorityRecord,
  type EvidenceApplicationInput,
  type EvidenceApplicationRecord,
  type EvidenceAuthorityRecord,
  type EvidenceDescriptor,
  type EvidenceDisposition,
} from "./evidence-authority.ts";

export const PRODUCT_NAME = "IN KEEPING";
export const PRODUCT_DESCRIPTOR = "Library systems continuity workbench";
// Retained as a stable storage/interchange namespace so previously exported work
// remains readable after the product rename.
export const LAB_SCHEMA = "library-access-continuity-lab";
export const CATALOG_PACKET_SCHEMA = "in-keeping/catalog-batch";
export const LAB_VERSION = 1;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_NATIVE_PACKET_BYTES = 32 * 1024 * 1024;
export const MAX_RECORDS = 1000;
export const MAX_SOURCE_ELEMENTS = 1024;
export const MAX_AUDIT_EVENTS = 5000;
export const MAX_INCIDENTS = 500;
export const MAX_INCIDENT_NOTES = 500;

const MARCXML_NS = "http://www.loc.gov/MARC21/slim";
const MODS_NS = "http://www.loc.gov/mods/v3";
const DC_ELEMENTS_NS = "http://purl.org/dc/elements/1.1/";
const OAI_DC_NS = "http://www.openarchives.org/OAI/2.0/oai_dc/";
const IN_KEEPING_XML_NS = "https://hah.dev/ns/in-keeping/1";

export type RecordFormat =
  | "Article"
  | "Book"
  | "Online book"
  | "Book chapter"
  | "Conference paper"
  | "Serial"
  | "Newspaper"
  | "Video"
  | "Audio"
  | "Image"
  | "Map"
  | "Score"
  | "Dataset"
  | "Software"
  | "Website"
  | "Report"
  | "Thesis"
  | "Manuscript"
  | "Archival collection"
  | "Other";

const RECORD_FORMAT_VALUES: readonly RecordFormat[] = ["Article", "Book", "Online book", "Book chapter", "Conference paper", "Serial", "Newspaper", "Video", "Audio", "Image", "Map", "Score", "Dataset", "Software", "Website", "Report", "Thesis", "Manuscript", "Archival collection", "Other"];

export type Availability =
  | "Available"
  | "Online"
  | "Unavailable"
  | "Check availability";

export type FindingSeverity = "error" | "warning" | "notice";
export type SourceFormat = "fixture" | "marcxml" | "dcxml" | "modsxml" | "in-keeping-json" | "laclab-json" | "csl-json" | "jsonld" | "ris" | "bibtex" | "csv" | "tsv" | "marc-text";

export type Identifier = {
  scheme: "doi" | "isbn" | "issn" | "oclc" | "lccn" | "orcid" | "ismn" | "upc" | "uri" | "local";
  value: string;
};

export type RecordElement = {
  code: string;
  name: string;
  value: string;
  definition: string;
};

export type DescriptiveMetadata = {
  issued: string;
  created: string;
  modified: string;
  publisher: string;
  place: string;
  language: string;
  subjects: string[];
  genres: string[];
  abstract: string;
  rights: string;
  license: string;
  series: string;
  containerTitle: string;
  volume: string;
  issue: string;
  pages: string;
  extent: string;
  audience: string;
  coverage: string;
  relations: string[];
  notes: string[];
};

export type CatalogRecord = {
  id: string;
  title: string;
  creators: string[];
  contributors?: string[];
  year: string;
  format: RecordFormat;
  identifiers: Identifier[];
  links: string[];
  availability: Availability;
  edition: string;
  location: string;
  suppressed: boolean;
  publicVisible: boolean;
  requestable: boolean;
  metadata?: DescriptiveMetadata;
  source: {
    format: SourceFormat;
    label: string;
    digest: string;
    ordinal: number;
    trace: Record<string, string>;
    elements?: RecordElement[];
  };
};

export type Finding = {
  id: string;
  severity: FindingSeverity;
  code: string;
  recordId?: string;
  label: string;
  detail: string;
};

export type IncidentState = "open" | "investigating" | "monitoring" | "resolved";

export type Incident = {
  id: string;
  title: string;
  service: string;
  state: IncidentState;
  severity: "high" | "medium" | "low";
  recordId?: string;
  ownerRole: string;
  openedAt: string;
  updatedAt: string;
  evidence: string[];
  notes: string[];
  nextAction: string;
  synthetic: boolean;
};

export type LabConfig = {
  resolverBase: string;
  proxyPrefix: string;
  defaultPickupLocation: string;
  memberCode: string;
};

export type Revision = {
  id: string;
  parentId: string | null;
  createdAt: string;
  label: string;
  digest: string;
  records: CatalogRecord[];
  config: LabConfig;
  archiveSchemas?: ArchiveSchema[];
  archiveUnits?: ArchiveUnit[];
  serviceRecords?: ServiceRecord[];
};

export type AuditEvent = {
  sequence: number;
  at: string;
  role: string;
  action: string;
  target: string;
  outcome: "accepted" | "rejected" | "rolled-back";
  /** Present on current events; legacy events remain verifiable without it. */
  stateDigest?: string;
  previousHash: string;
  hash: string;
};

export type Workspace = {
  schema: typeof LAB_SCHEMA;
  version: typeof LAB_VERSION;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeRevisionId: string;
  revisions: Revision[];
  incidents: Incident[];
  /** Explicit local dispositions of reviewed evidence; never an authority claim. */
  evidenceAuthority?: EvidenceAuthorityRecord[];
  /** Content-bound outcomes linking evidence decisions to attempted application. */
  evidenceApplications?: EvidenceApplicationRecord[];
  audit: AuditEvent[];
};

export type EvidenceDispositionInput = EvidenceDisposition;
export type EvidenceDescriptorInput = EvidenceDescriptor;
export type EvidenceApplicationInputValue = EvidenceApplicationInput;

export type ActiveEvidenceAssessment = {
  blocked: boolean;
  activeUnverifiedDecisionDigests: string[];
  unattributedCatalogIds: string[];
  unattributedArchiveIds: string[];
  unattributedServiceIds: string[];
  reason: string;
};

export type ImportReview = {
  filename: string;
  bytes: number;
  digest: string;
  format: Exclude<SourceFormat, "fixture"> | "unknown";
  records: CatalogRecord[];
  findings: Finding[];
  blocked: boolean;
  summary: string;
};

// Successful file review objects are bound in memory. A copied or mutated
// object cannot retain the capability to apply the originally reviewed bytes.
const importReviewBindings = new WeakMap<ImportReview, string>();

export type ReviewedSource = {
  filename: string;
  format: string;
  digest: string;
};

export type DocumentKind =
  | "system-inventory"
  | "configuration-register"
  | "incident-ticket"
  | "vendor-escalation"
  | "change-request"
  | "postmortem"
  | "rollback-runbook"
  | "access-control"
  | "continuity-checklist";

export const DOCUMENT_OPTIONS: { value: DocumentKind; label: string }[] = [
  { value: "system-inventory", label: "System inventory" },
  { value: "configuration-register", label: "Configuration register" },
  { value: "incident-ticket", label: "Incident ticket" },
  { value: "vendor-escalation", label: "Vendor escalation" },
  { value: "change-request", label: "Change request" },
  { value: "postmortem", label: "Postmortem" },
  { value: "rollback-runbook", label: "Rollback runbook" },
  { value: "access-control", label: "Access-control matrix" },
  { value: "continuity-checklist", label: "Continuity checklist" },
];

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const fixtureSource = (ordinal: number, elements: RecordElement[] = []): CatalogRecord["source"] => ({
  format: "fixture",
  label: "Built-in synthetic dataset",
  digest: "fixture-v1",
  ordinal,
  trace: {},
  elements,
});

const element = (code: string, name: string, value: string, definition: string): RecordElement => ({ code, name, value, definition });

export const FIXTURE_RECORDS: CatalogRecord[] = [
  {
    id: "BIB-00814",
    title: "Coastal adaptation and working harbors",
    creators: ["Mina Rao"],
    year: "2026",
    format: "Article",
    identifiers: [{ scheme: "doi", value: "10.5555/in-keeping.2026.0001" }],
    links: ["https://journals.example.org/doi/full/10.5555/in-keeping.2026.0001"],
    availability: "Online",
    edition: "",
    location: "Online",
    suppressed: false,
    publicVisible: true,
    requestable: false,
    source: fixtureSource(1, [
      element("001", "Control number", "BIB-00814", "The source system's stable record number."),
      element("245 10 $a", "Title statement", "Coastal adaptation and working harbors", "The title supplied for discovery display and searching."),
      element("100 1# $a", "Primary creator", "Rao, Mina", "The person chiefly responsible for the work."),
      element("024 7# $a", "DOI", "10.5555/in-keeping.2026.0001", "A persistent identifier for the article."),
      element("856 40 $u", "Electronic location", "https://journals.example.org/doi/full/10.5555/in-keeping.2026.0001", "The source URL used to construct online access."),
    ]),
  },
  {
    id: "BIB-102884",
    title: "Salt marsh restoration: field methods for changing coasts",
    creators: ["Lina Ortiz"],
    year: "2024",
    format: "Video",
    identifiers: [{ scheme: "isbn", value: "9781942345671" }],
    links: ["https://books.example.org/title/102884"],
    availability: "Online",
    edition: "First edition",
    location: "Online",
    suppressed: false,
    publicVisible: true,
    requestable: false,
    source: {
      ...fixtureSource(2, [
        element("001", "Control number", "BIB-102884", "The source system's stable record number."),
        element("245 10 $a", "Title statement", "Salt marsh restoration: field methods for changing coasts", "The title supplied for discovery display and searching."),
        element("336 ## $b", "Content type code", "txt", "RDA code identifying textual content."),
        element("337 ## $b", "Media type code", "c", "RDA code identifying computer-mediated access."),
        element("338 ## $b", "Carrier type code", "cr", "RDA code identifying an online resource."),
        element("999 ## $a", "Local format code", "VID", "A locally defined value; it must not override controlled RDA fields."),
      ]),
      trace: { "336$b": "txt", "337$b": "c", "338$b": "cr", "999$a": "VID" },
    },
  },
  {
    id: "BIB-000287",
    title: "The coastwise archive",
    creators: ["Mara Ellison"],
    year: "2024",
    format: "Book",
    identifiers: [{ scheme: "isbn", value: "9781603095273" }],
    links: [],
    availability: "Available",
    edition: "First edition",
    location: "Main Library",
    suppressed: false,
    publicVisible: true,
    requestable: false,
    source: {
      ...fixtureSource(3, [
        element("001", "Control number", "BIB-000287", "The source system's stable record number."),
        element("245 14 $a", "Title statement", "The coastwise archive", "The title supplied for discovery display and searching."),
        element("852 ## $b", "Permanent location", "Main Library", "The owning location used by fulfillment rules."),
        element("item:temp_location", "Temporary location", "ANNEX-PROCESSING", "A temporary item location that can alter request eligibility."),
        element("item:status", "Item status", "AVAILABLE", "The circulation state supplied by the item system."),
      ]),
      trace: { temporary_location: "ANNEX-PROCESSING", item_status: "AVAILABLE" },
    },
  },
  {
    id: "BIB-004102",
    title: "Tidal records of the inland sea",
    creators: ["A. K. Bell"],
    year: "2019",
    format: "Book",
    identifiers: [{ scheme: "isbn", value: "9780306406157" }],
    links: [],
    availability: "Available",
    edition: "Second edition",
    location: "Special Collections",
    suppressed: true,
    publicVisible: true,
    requestable: false,
    source: fixtureSource(4, [element("001", "Control number", "BIB-004102", "The source system's stable record number."), element("999 ## $s", "Suppression instruction", "SUPPRESS", "A local instruction that excludes the record from public discovery.")]),
  },
  {
    id: "BIB-004103",
    title: "Tidal records of the inland sea",
    creators: ["A. K. Bell"],
    year: "2019",
    format: "Book",
    identifiers: [{ scheme: "isbn", value: "9780306406157" }],
    links: [],
    availability: "Check availability",
    edition: "Second edition",
    location: "Annex",
    suppressed: false,
    publicVisible: true,
    requestable: true,
    source: fixtureSource(5, [element("001", "Control number", "BIB-004103", "The source system's stable record number."), element("852 ## $b", "Location", "Annex", "The shelving or service location for the item.")]),
  },
  {
    id: "BIB-009921",
    title: "Shared systems field guide",
    creators: ["North Coast Library Network"],
    year: "2025",
    format: "Online book",
    identifiers: [{ scheme: "local", value: "NCLN-9921" }],
    links: ["https://content.example.org/shared-systems"],
    availability: "Online",
    edition: "Network edition",
    location: "Online",
    suppressed: false,
    publicVisible: true,
    requestable: false,
    source: fixtureSource(6, [element("001", "Control number", "BIB-009921", "The source system's stable record number."), element("856 40 $u", "Electronic location", "https://content.example.org/shared-systems", "The source URL used to construct online access.")]),
  },
];

export const FIXTURE_INCIDENTS: Incident[] = [
  incident("ACL-01", "Full text leaves the authenticated route", "Electronic access", "high", "BIB-00814", ["Entitlement active", "Redirect host outside proxy rule"], "Review target host and vendor case"),
  incident("ACL-02", "Online book appears under Video", "Discovery metadata", "medium", "BIB-102884", ["RDA fields indicate text", "Local 999 outranks controlled fields"], "Correct rule priority and recheck"),
  incident("ACL-03", "Available copy cannot be requested", "Fulfillment", "medium", "BIB-000287", ["Item is available", "Temporary location blocks request"], "Clear stale location through inventory workflow"),
  incident("ACL-04", "Release removes availability labels", "Change control", "high", undefined, ["Legacy status omitted from fixture", "Rollback check passes"], "Add mixed-version status fixtures"),
  incident("ACL-05", "Filtering does not announce results", "Accessibility", "medium", undefined, ["Focus remains visible", "Result count is not announced"], "Add status message and repeat manual checks"),
  incident("ACL-06", "Shared resolver change fails for one member", "Consortium", "high", "BIB-009921", ["Three members pass", "One local override double-proxies"], "Remove only the conflicting override"),
];

const SAMPLE_TIME = "2026-08-20T14:00:00.000Z";

function sampleServiceRecord(
  kind: string,
  id: string,
  title: string,
  ownerRole: string,
  system: string,
  values: Record<string, ServiceValue>,
): ServiceRecord {
  return {
    ...makeServiceRecord(kind, id, SAMPLE_TIME),
    title,
    state: "active",
    ownerRole,
    system,
    values,
  };
}

export const FIXTURE_SERVICE_RECORDS: ServiceRecord[] = [
  sampleServiceRecord("collection-policy", "SRV-COL-001", "Coastal and climate collections", "Collection strategist", "Collection policy register", {
    scope: "Research and teaching resources addressing coastal communities, climate adaptation, and working waterfronts.",
    audience: ["Students", "Faculty", "Regional partners"],
    review_cycle_months: 24,
  }),
  sampleServiceRecord("resource-entitlement", "SRV-ER-001", "North Coast journals package", "Electronic resources librarian", "ERM", {
    provider: "North Coast Academic Press",
    platform: "North Coast Journals",
    access_model: "subscription",
    authentication: "proxy",
    renewal_date: "2027-06-30",
    perpetual_access: true,
    counter_supported: true,
  }),
  sampleServiceRecord("discovery-profile", "SRV-DIS-001", "Unified discovery index", "Discovery librarian", "Discovery service", {
    index_name: "unified-discovery",
    source_system: "Library services platform",
    mapping_version: "mapping-2026.08",
    facets: ["Resource type", "Availability", "Collection"],
    suppression_rule: "Suppress records and holdings carrying the approved local suppression flag.",
    last_reindex: SAMPLE_TIME,
  }),
  sampleServiceRecord("condition-assessment", "SRV-PRE-001", "Coastwise archive housing review", "Preservation librarian", "Preservation register", {
    object_identifier: "COLL-COAST-01",
    material_type: "Paper records and photographic prints",
    condition_rating: "monitor",
    housing: "Buffered folders and archival cartons",
    assessed_on: "2026-08-20",
    next_review: "2027-08-20",
  }),
  sampleServiceRecord("metadata-job", "SRV-TS-001", "Nightly authority reconciliation", "Metadata services librarian", "Metadata pipeline", {
    job_name: "authority-reconciliation",
    source_format: "MARCXML",
    target_format: "Canonical discovery records",
    mapping_version: "authority-map-3",
    authority_sources: ["Library of Congress Name Authority File"],
    record_count: 428,
    last_run: SAMPLE_TIME,
    rollback_reference: "REV-SAMPLE-BASELINE",
  }),
  sampleServiceRecord("accession", "SRV-SC-001", "Harbor planning records accession", "Special collections archivist", "Accession register", {
    accession_number: "2026-014",
    source_type: "transfer",
    received_on: "2026-08-12",
    extent: "4 linear feet and 18.2 GB",
    deed_status: "executed",
    processing_priority: "normal",
  }),
  sampleServiceRecord("dataset-custody", "SRV-DATA-001", "Tidal sensor observations", "Research data librarian", "Institutional data repository", {
    persistent_id: "doi:10.5555/example.tides.2026",
    repository: "Institutional data repository",
    steward_role: "Research data services",
    media_type: "text/csv",
    checksum: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    retention_rule: "Retain the preservation package and public derivative for at least ten years after project close.",
    access_level: "open",
  }),
  sampleServiceRecord("copy-provenance", "SRV-RBM-001", "Tidal records — annotated copy", "Rare books cataloger", "Copy-specific description register", {
    shelfmark: "RB-2019-BELL-2",
    imprint: "Newport: Harbor Press, 2019",
    copy_note: "Second-edition copy with contemporary marginal annotations and a local binder's ticket.",
    provenance_events: ["Gift of the Bell family, 2025"],
    binding: "Quarter cloth with marbled paper boards",
    cataloging_standard: "DCRM(B)",
    verified_on: "2026-08-20",
  }),
];

function incident(
  id: string,
  title: string,
  service: string,
  severity: Incident["severity"],
  recordId: string | undefined,
  evidence: string[],
  nextAction: string,
): Incident {
  const at = "2026-08-20T14:00:00.000Z";
  return {
    id,
    title,
    service,
    state: "investigating",
    severity,
    ...(recordId ? { recordId } : {}),
    ownerRole: "Systems administrator",
    openedAt: at,
    updatedAt: at,
    evidence,
    notes: [],
    nextAction,
    synthetic: true,
  };
}

export async function createFixtureWorkspace(): Promise<Workspace> {
  const createdAt = new Date().toISOString();
  const config: LabConfig = {
    resolverBase: "https://resolver.example.org/openurl",
    proxyPrefix: "https://proxy.example.org/login?url=",
    defaultPickupLocation: "Main Library",
    memberCode: "NRU",
  };
  const digest = await revisionStateDigest(FIXTURE_RECORDS, config, [], [], FIXTURE_SERVICE_RECORDS);
  const revision: Revision = {
    id: makeId("REV"),
    parentId: null,
    createdAt,
    label: "Synthetic baseline",
    digest,
    records: structuredClone(FIXTURE_RECORDS),
    config,
    archiveSchemas: [],
    archiveUnits: [],
    serviceRecords: structuredClone(FIXTURE_SERVICE_RECORDS),
  };
  const workspace: Workspace = {
    schema: LAB_SCHEMA,
    version: LAB_VERSION,
    name: "Sample workspace",
    createdAt,
    updatedAt: createdAt,
    activeRevisionId: revision.id,
    revisions: [revision],
    incidents: structuredClone(FIXTURE_INCIDENTS),
    evidenceAuthority: [],
    evidenceApplications: [],
    audit: [],
  };
  return appendAudit(workspace, "Initialize", revision.id, "accepted");
}

export async function createBlankWorkspace(name = "Working copy"): Promise<Workspace> {
  const createdAt = new Date().toISOString();
  const config: LabConfig = {
    resolverBase: "",
    proxyPrefix: "",
    defaultPickupLocation: "",
    memberCode: "",
  };
  const revision: Revision = {
    id: makeId("REV"),
    parentId: null,
    createdAt,
    label: "Empty baseline",
    digest: await revisionStateDigest([], config, [], [], []),
    records: [],
    config,
    archiveSchemas: [],
    archiveUnits: [],
    serviceRecords: [],
  };
  return appendAudit(
    {
      schema: LAB_SCHEMA,
      version: LAB_VERSION,
      name: cleanWorkspaceName(name),
      createdAt,
      updatedAt: createdAt,
      activeRevisionId: revision.id,
      revisions: [revision],
      incidents: [],
      evidenceAuthority: [],
      evidenceApplications: [],
      audit: [],
    },
    "Initialize",
    revision.id,
    "accepted",
  );
}

export function activeRevision(workspace: Workspace): Revision {
  return workspace.revisions.find((revision) => revision.id === workspace.activeRevisionId)
    ?? workspace.revisions[workspace.revisions.length - 1];
}

/**
 * Resolve evidence barriers against the exact active revision. Historical
 * decisions remain in the register, but a failed application or a source whose
 * scoped entities are no longer active cannot permanently latch every output.
 * Legacy decisions without an application outcome are treated conservatively
 * as potentially applied. Manually entered archive and service records are
 * explicitly unattributed because those models retain no source-level proof.
 */
export function assessActiveEvidence(workspace: Workspace): ActiveEvidenceAssessment {
  const revision = activeRevision(workspace);
  const applications = new Map((workspace.evidenceApplications ?? []).map((item) => [item.decisionRecordSha256, item]));
  const activeDecisions = (workspace.evidenceAuthority ?? []).filter((decision) => {
    if (decision.disposition.decision !== "admit-unverified") return false;
    const application = applications.get(decision.recordSha256);
    if (application?.outcome === "not-applied") return false;
    const ids = new Set(decision.evidence.scope.entityIds);
    switch (decision.evidence.source.kind) {
      case "catalog-import":
        return revision.records.some((record) => ids.has(record.id) && record.source.digest === decision.evidence.source.sha256);
      case "archive-import":
        return (revision.archiveUnits ?? []).some((unit) => ids.has(unit.id))
          || (revision.archiveSchemas ?? []).some((schema) => ids.has(`schema:${schema.id}`));
      case "workspace-backup":
      case "workspace-history":
        return true;
      default:
        if (decision.evidence.scope.kind === "workspace") return true;
        if (decision.evidence.scope.kind === "catalog-records") return revision.records.some((record) => ids.has(record.id));
        if (decision.evidence.scope.kind === "archive-records") return (revision.archiveUnits ?? []).some((unit) => ids.has(unit.id)) || (revision.archiveSchemas ?? []).some((schema) => ids.has(`schema:${schema.id}`));
        if (decision.evidence.scope.kind === "service-records") return (revision.serviceRecords ?? []).some((record) => ids.has(record.id));
        return ids.size > 0;
    }
  });

  const coveredCatalog = new Set<string>();
  const coveredArchive = new Set<string>();
  for (const decision of activeDecisions) {
    if (decision.evidence.source.kind === "catalog-import") {
      for (const id of decision.evidence.scope.entityIds) coveredCatalog.add(`${id}\u0000${decision.evidence.source.sha256}`);
    }
    if (decision.evidence.source.kind === "archive-import") {
      for (const id of decision.evidence.scope.entityIds) coveredArchive.add(id);
    }
  }

  const unattributedCatalogIds = revision.records
    .filter((record) => record.source.format !== "fixture" && !coveredCatalog.has(`${record.id}\u0000${record.source.digest}`))
    .map((record) => record.id);
  const unattributedArchiveIds = [
    ...(revision.archiveSchemas ?? []).filter((schema) => !coveredArchive.has(`schema:${schema.id}`)).map((schema) => `schema:${schema.id}`),
    ...(revision.archiveUnits ?? []).filter((unit) => !coveredArchive.has(unit.id)).map((unit) => unit.id),
  ];
  // Service records currently have no distinct source payload in the model.
  // Treating them as locally verified would silently grant authority to typed
  // but potentially fabricated operator entry.
  const unattributedServiceIds = (revision.serviceRecords ?? []).map((record) => record.id);
  const blocked = activeDecisions.length > 0 || unattributedCatalogIds.length > 0 || unattributedArchiveIds.length > 0 || unattributedServiceIds.length > 0;
  const reason = blocked
    ? `Active content includes ${activeDecisions.length} unverified evidence admission${activeDecisions.length === 1 ? "" : "s"}, ${unattributedCatalogIds.length} unattributed catalog record${unattributedCatalogIds.length === 1 ? "" : "s"}, ${unattributedArchiveIds.length} unattributed archival object${unattributedArchiveIds.length === 1 ? "" : "s"}, and ${unattributedServiceIds.length} locally entered service record${unattributedServiceIds.length === 1 ? "" : "s"}. Structural validity and local entry do not establish truth or authority.`
    : "No active unverified or unattributed record content was found in the current revision.";
  return {
    blocked,
    activeUnverifiedDecisionDigests: activeDecisions.map((item) => item.recordSha256),
    unattributedCatalogIds,
    unattributedArchiveIds,
    unattributedServiceIds,
    reason,
  };
}

export function checkRecords(records: CatalogRecord[], maximum = Number.POSITIVE_INFINITY): Finding[] {
  const findings: Finding[] = [];
  const ids = new Map<string, string[]>();
  const titles = new Map<string, string[]>();
  const recordIds = new Map<string, number>();

  for (const record of records) {
    recordIds.set(record.id, (recordIds.get(record.id) ?? 0) + 1);
    if (!record.title.trim()) addFinding(findings, "error", "TITLE_MISSING", record.id, "Title missing", "Add a title before publishing.");
    if (!SAFE_ID.test(record.id)) addFinding(findings, "error", "ID_INVALID", record.id, "Identifier is not safe", "Use 1–128 letters, numbers, dots, colons, underscores, or hyphens.");
    if (record.suppressed && record.publicVisible) addFinding(findings, "error", "SUPPRESSION_LEAK", record.id, "Suppressed record is public", "Remove it from the public projection.");
    if (record.availability === "Available" && !record.requestable && record.location !== "Online") addFinding(findings, "warning", "REQUEST_MISMATCH", record.id, "Available item is not requestable", "Trace item status, location, patron context, and request policy.");
    if (record.format === "Video" && record.source.trace["336$b"] === "txt" && record.source.trace["338$b"] === "cr") addFinding(findings, "warning", "FORMAT_CONFLICT", record.id, "Format conflicts with RDA fields", "Prefer controlled content, media, and carrier fields over the local code.");

    const seenIdentifierKeys = new Set<string>();
    for (const identifier of record.identifiers) {
      const normalized = normalizeIdentifier(identifier);
      const exactKey = `${identifier.scheme}:${normalized}`;
      if (seenIdentifierKeys.has(exactKey)) addFinding(findings, "error", "IDENTIFIER_DUPLICATE", record.id, "Duplicate stable identifier", `${exactKey} is repeated within the record.`);
      seenIdentifierKeys.add(exactKey);
      if (identifier.scheme === "isbn" && !validIsbn(normalized)) addFinding(findings, "warning", "ISBN_INVALID", record.id, "ISBN checksum fails", identifier.value);
      if (identifier.scheme === "doi" && !/^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(normalized)) addFinding(findings, "warning", "DOI_INVALID", record.id, "DOI is malformed", identifier.value);
    }

    const doiClaims = stableDoiClaims(record);
    if (doiClaims.size > 1) addFinding(findings, "warning", "IDENTITY_CARRIER_CONFLICT", record.id, "Contradictory DOI identity carriers", `The record asserts ${[...doiClaims].sort().join(", ")} across typed identifiers, URI identifiers, or DOI resolver links.`);
    for (const key of stableIdentityClaims(record)) ids.set(key, [...(ids.get(key) ?? []), record.id]);

    for (const link of record.links) {
      const result = validatePublicUrl(link);
      if (!result.ok) addFinding(findings, "error", "URL_UNSAFE", record.id, "Unsafe access URL", result.reason);
    }

    const titleKey = normalizeTitle(record.title);
    if (titleKey) titles.set(titleKey, [...(titles.get(titleKey) ?? []), record.id]);
  }

  for (const [identifier, recordIds] of ids) {
    if (recordIds.length > 1) addFinding(findings, "error", "IDENTIFIER_DUPLICATE", recordIds[0], "Duplicate stable identifier", `${identifier} appears in ${recordIds.join(", ")}.`);
  }
  for (const [title, recordIds] of titles) {
    if (recordIds.length > 1) addFinding(findings, "notice", "TITLE_DUPLICATE", recordIds[0], "Possible duplicate edition", `${recordIds.length} records normalize to “${title}”.`);
  }
  for (const [recordId, count] of recordIds) {
    if (count > 1) addFinding(findings, "error", "RECORD_ID_DUPLICATE", recordId, "Duplicate record identifier", `${recordId} occurs ${count} times in the same record set.`);
  }
  return Number.isFinite(maximum) ? findings.slice(0, Math.max(0, maximum)) : findings;
}

export async function reviewImport(file: File): Promise<ImportReview> {
  const base: ImportReview = {
    filename: cleanText(file.name, 180),
    bytes: file.size,
    digest: "",
    format: "unknown",
    records: [],
    findings: [],
    blocked: true,
    summary: "Import rejected.",
  };

  const lowerName = file.name.toLowerCase();
  const isJson = lowerName.endsWith(".json") || lowerName.endsWith(".jsonld");
  const isXml = lowerName.endsWith(".xml") || lowerName.endsWith(".marcxml");
  const isText = /\.(ris|bib|bibtex|csv|tsv|mrk|mrc\.txt)$/.test(lowerName);
  const acceptedMime = !file.type
    || (isJson && ["application/json", "application/ld+json"].includes(file.type))
    || (isXml && ["application/xml", "text/xml"].includes(file.type))
    || (isText && ["text/plain", "text/csv", "text/tab-separated-values", "application/x-bibtex", "application/x-research-info-systems"].includes(file.type));
  if (!acceptedMime) return blockedReview(base, "MIME_MISMATCH", "File type does not match its extension.");
  if (file.size === 0) return blockedReview(base, "FILE_EMPTY", "The file is empty.");
  const nativePacketName = lowerName.endsWith(".in-keeping.json");
  const maximumBytes = nativePacketName ? MAX_NATIVE_PACKET_BYTES : MAX_FILE_BYTES;
  if (file.size > maximumBytes) return blockedReview(base, "FILE_TOO_LARGE", nativePacketName ? "Versioned IN KEEPING packets have a 32 MiB maximum." : "Maximum size is 5 MiB.");

  let text: string;
  try {
    const bytes = await file.arrayBuffer();
    base.digest = await sha256Hex(bytes);
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.startsWith("\uFEFF")) text = text.slice(1);
  } catch {
    return blockedReview(base, "UTF8_INVALID", "The file is not valid UTF-8.");
  }

  if (CONTROL_CHARACTERS.test(text)) return blockedReview(base, "CONTROL_CHARACTER", "The file contains disallowed control characters.");

  try {
    if (isJson) {
      const parsed = assertSafeJsonText(text);
      if (file.size > MAX_FILE_BYTES && !isCatalogPacket(parsed)) return blockedReview(base, "FILE_TOO_LARGE", "Only a strictly versioned IN KEEPING packet may exceed the 5 MiB foreign-file limit.");
      inspectJson(parsed, 0);
      if (isCatalogPacket(parsed)) {
        base.format = "in-keeping-json";
        base.records = parseJsonPacket(parsed, base.filename, base.digest);
      } else if (lowerName.endsWith(".jsonld")) {
        base.format = "jsonld";
        base.records = parseJsonLd(parsed, base.filename, base.digest);
      } else if (lowerName.endsWith(".csl.json")) {
        if (isJsonLd(parsed)) throw new Error("A .csl.json file may not declare a JSON-LD context or graph; use .jsonld for JSON-LD.");
        base.format = "csl-json";
        base.records = parseCslJson(parsed, base.filename, base.digest);
      } else if (isJsonLd(parsed)) {
        base.format = "jsonld";
        base.records = parseJsonLd(parsed, base.filename, base.digest);
      } else {
        base.format = "csl-json";
        base.records = parseCslJson(parsed, base.filename, base.digest);
      }
    } else if (lowerName.endsWith(".xml") || lowerName.endsWith(".marcxml")) {
      assertSafeXmlText(text);
      const document = new DOMParser().parseFromString(text, "application/xml");
      if (document.getElementsByTagName("parsererror").length) throw new Error("XML could not be parsed.");
      const nodes = document.getElementsByTagName("*").length;
      if (nodes > 100000) throw new Error("XML contains more than 100,000 nodes.");
      const root = document.documentElement.localName;
      const namespace = document.documentElement.namespaceURI ?? "";
      if ((root === "collection" || root === "record") && namespace === MARCXML_NS) {
        assertXmlElementNamespaces(document, [MARCXML_NS]);
        base.format = "marcxml";
        base.records = parseMarcXml(document, base.filename, base.digest);
      } else if ((root === "mods" || root === "modsCollection") && namespace === MODS_NS) {
        assertXmlElementNamespaces(document, [MODS_NS]);
        base.format = "modsxml";
        base.records = parseModsXml(document, base.filename, base.digest);
      } else if ((root === "dc" && namespace === OAI_DC_NS) || (root === "collection" && namespace === IN_KEEPING_XML_NS)) {
        assertXmlElementNamespaces(document, [IN_KEEPING_XML_NS, OAI_DC_NS, DC_ELEMENTS_NS]);
        base.format = "dcxml";
        base.records = parseDcXml(document, base.filename, base.digest);
      } else {
        throw new Error("The XML root and namespace are not an accepted MARCXML, MODS, or OAI Dublin Core record set.");
      }
    } else if (lowerName.endsWith(".ris")) {
      base.format = "ris"; base.records = parseRis(text, base.filename, base.digest);
    } else if (lowerName.endsWith(".bib") || lowerName.endsWith(".bibtex")) {
      base.format = "bibtex"; base.records = parseBibtex(text, base.filename, base.digest);
    } else if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
      base.format = lowerName.endsWith(".tsv") ? "tsv" : "csv"; base.records = parseDelimited(text, base.filename, base.digest, base.format === "tsv" ? "\t" : ",");
    } else if (lowerName.endsWith(".mrk") || lowerName.endsWith(".mrc.txt")) {
      base.format = "marc-text"; base.records = parseMarcText(text, base.filename, base.digest);
    } else {
      return blockedReview(base, "FORMAT_UNSUPPORTED", "Use a supported library exchange format.");
    }
  } catch (error) {
    return blockedReview(base, "PARSE_REJECTED", safeError(error));
  }

  const evaluatedFindings = checkRecords(base.records, Number.POSITIVE_INFINITY);
  let shapeFinding: Finding | null = null;
  try {
    base.records.forEach((record, index) => validateStoredRecord(record, index + 1));
  } catch (error) {
    shapeFinding = { id: "IMPORT_SHAPE_INVALID", severity: "error", code: "SHAPE_INVALID", label: "Record shape exceeds the import contract", detail: safeError(error) };
  }
  const structuralFindings = shapeFinding ? [...evaluatedFindings, shapeFinding] : evaluatedFindings;
  const allFindings = structuralFindings.length > MAX_EVIDENCE_WARNINGS - 1
    ? [...structuralFindings, { id: "EVIDENCE_WARNING_CAPACITY", severity: "error" as const, code: "WARNING_CAPACITY_EXCEEDED", label: "Complete warning manifest exceeds capacity", detail: `The review produced ${structuralFindings.length.toLocaleString("en-US")} findings; at most ${(MAX_EVIDENCE_WARNINGS - 1).toLocaleString("en-US")} can be retained alongside the mandatory authority warning without omission.` }]
    : structuralFindings;
  base.findings = [...allFindings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  base.blocked = base.records.length === 0 || allFindings.some((finding) => finding.severity === "error");
  base.summary = base.records.length === 0
    ? "No records were found; the import cannot be applied."
    : base.blocked
    ? `${base.records.length} records reviewed; errors must be corrected before apply.`
    : `${base.records.length} records ready for review and apply.`;
  if (!base.blocked) importReviewBindings.set(base, await importReviewBinding(base));
  return base;
}

export async function applyImport(workspace: Workspace, review: ImportReview, disposition: EvidenceDispositionInput): Promise<Workspace> {
  const sourceTarget = reviewedSourceAuditTarget(review);
  let trustedRecords: boolean;
  try {
    review.records.forEach((record, index) => validateStoredRecord(record, index + 1));
    const expectedBinding = importReviewBindings.get(review);
    trustedRecords = Boolean(expectedBinding)
      && expectedBinding === await importReviewBinding(review)
      && trustedReviewedSource(review)
      && review.format !== "unknown"
      && review.records.every((record) => record.source.digest === review.digest && record.source.label === review.filename && record.source.format === review.format)
      && review.records.length <= MAX_RECORDS
      && !checkRecords(review.records, Number.POSITIVE_INFINITY).some((finding) => finding.severity === "error");
  } catch {
    trustedRecords = false;
  }
  if (review.blocked || review.records.length === 0 || !trustedRecords) {
    return appendAudit(workspace, "Reject import", sourceTarget, "rejected");
  }
  const parserProfile = `catalog-${review.format}-v1`;
  const warningManifest = await createEvidenceWarningManifest(review.digest, parserProfile, [
    ...review.findings.map((finding) => ({ severity: finding.severity, code: finding.code, entityId: finding.recordId ?? null, label: finding.label, detail: finding.detail, occurrenceKey: finding.id })),
    { severity: "warning", code: "STRUCTURE_ONLY_AUTHORITY_UNVERIFIED", entityId: null, label: "Structural review is not authority", detail: "Parser success and internal consistency do not establish origin, custody, completeness, or truth.", occurrenceKey: "semantic-authority-boundary" },
  ]);
  const authorityRecord = await createEvidenceAuthorityRecord({
    source: { kind: "catalog-import", filename: review.filename, format: review.format, bytes: review.bytes, sha256: review.digest },
    review: { structuralStatus: "passed", canonicalPayloadSha256: await canonicalEvidenceDigest(review.records), parserProfile, warningManifest },
    scope: { kind: "catalog-records", entityIds: review.records.map((record) => record.id) },
  }, disposition);
  const authorityTarget = `evidence:${authorityRecord.recordSha256} · source:${review.digest}`;
  if (authorityRecord.disposition.decision !== "admit-unverified") {
    return appendEvidenceDecisionOutcome(
      workspace,
      authorityRecord,
      {
        outcome: "not-applied",
        reason: authorityRecord.disposition.decision === "withdraw" ? "operator-withdrew" : "operator-rejected",
        detail: authorityRecord.disposition.decision === "withdraw" ? "The operator withdrew the reviewed evidence; no records were applied." : "The operator rejected the reviewed evidence; no records were applied.",
        resultingRevisionId: null,
        resultingRevisionDigest: null,
      },
      authorityRecord.disposition.decision === "withdraw" ? "Withdraw evidence admission" : "Reject reviewed evidence",
      authorityTarget,
      "rejected",
    );
  }
  const current = activeRevision(workspace);
  if (current.records.length + review.records.length > MAX_RECORDS) {
    return appendEvidenceDecisionOutcome(workspace, authorityRecord, {
      outcome: "not-applied",
      reason: "workspace-record-limit",
        detail: "The operator admitted the reviewed source as unverified evidence, but destination capacity prevented application.",
        resultingRevisionId: null,
        resultingRevisionDigest: null,
    }, "Reject import over workspace record limit", authorityTarget, "rejected");
  }
  const existingIds = new Set(current.records.map((record) => record.id));
  const conflicts = review.records.filter((record) => existingIds.has(record.id));
  if (conflicts.length) {
    return appendEvidenceDecisionOutcome(workspace, authorityRecord, {
      outcome: "not-applied",
      reason: "destination-identity-conflict",
      detail: `The operator admitted the reviewed source as unverified evidence, but ${conflicts.length} destination record ID conflict${conflicts.length === 1 ? "" : "s"} prevented application.`,
      resultingRevisionId: null,
      resultingRevisionDigest: null,
    }, "Reject conflicting import", authorityTarget, "rejected");
  }
  const existingIdentifiers = new Set(current.records.flatMap(stableIdentityClaims));
  const identifierConflict = review.records.some((record) => stableIdentityClaims(record).some((identifier) => existingIdentifiers.has(identifier)));
  if (identifierConflict) {
    return appendEvidenceDecisionOutcome(workspace, authorityRecord, {
      outcome: "not-applied",
      reason: "destination-identity-conflict",
      detail: "The operator admitted the reviewed source as unverified evidence, but a duplicate stable identifier prevented application.",
      resultingRevisionId: null,
      resultingRevisionDigest: null,
    }, "Reject duplicate stable identifier", authorityTarget, "rejected");
  }
  const records = [...current.records, ...structuredClone(review.records)];
  const config = structuredClone(current.config);
  const createdAt = new Date().toISOString();
  const revision: Revision = {
    id: makeId("REV"),
    parentId: current.id,
    createdAt,
    label: `Import ${auditText(review.filename, 173, "unnamed")}`,
    digest: await revisionStateDigest(records, config, current.archiveSchemas ?? [], current.archiveUnits ?? [], current.serviceRecords ?? []),
    records,
    config,
    archiveSchemas: structuredClone(current.archiveSchemas ?? []),
    archiveUnits: structuredClone(current.archiveUnits ?? []),
    serviceRecords: structuredClone(current.serviceRecords ?? []),
  };
  const next = {
    ...workspace,
    updatedAt: createdAt,
    activeRevisionId: revision.id,
    revisions: retainRevisions(workspace.revisions, revision),
    evidenceAuthority: [...(workspace.evidenceAuthority ?? []), authorityRecord],
    evidenceApplications: [
      ...(workspace.evidenceApplications ?? []),
      await createEvidenceApplicationRecord(authorityRecord, {
        outcome: "applied",
        reason: "catalog-import-applied",
        detail: "The reviewed catalog records were applied to the named resulting revision as unverified evidence.",
        resultingRevisionId: revision.id,
        resultingRevisionDigest: revision.digest,
      }),
    ],
  };
  return appendAudit(next, "Apply reviewed import as unverified evidence", authorityTarget, "accepted");
}

export async function updateConfig(workspace: Workspace, config: LabConfig): Promise<Workspace> {
  validateConfig(config);
  const current = activeRevision(workspace);
  const createdAt = new Date().toISOString();
  const safeConfig: LabConfig = {
    resolverBase: cleanText(config.resolverBase, 2048),
    proxyPrefix: cleanText(config.proxyPrefix, 2048),
    defaultPickupLocation: cleanText(config.defaultPickupLocation, 160),
    memberCode: cleanText(config.memberCode, 32).toUpperCase(),
  };
  const revision: Revision = {
    id: makeId("REV"),
    parentId: current.id,
    createdAt,
    label: "Configuration change",
    digest: await revisionStateDigest(current.records, safeConfig, current.archiveSchemas ?? [], current.archiveUnits ?? [], current.serviceRecords ?? []),
    records: structuredClone(current.records),
    config: safeConfig,
    archiveSchemas: structuredClone(current.archiveSchemas ?? []),
    archiveUnits: structuredClone(current.archiveUnits ?? []),
    serviceRecords: structuredClone(current.serviceRecords ?? []),
  };
  return appendAudit(
    {
      ...workspace,
      updatedAt: createdAt,
      activeRevisionId: revision.id,
      revisions: retainRevisions(workspace.revisions, revision),
    },
    "Update configuration",
    revision.id,
    "accepted",
  );
}

export type CatalogRecordPatch = Pick<CatalogRecord, "title" | "creators" | "contributors" | "format" | "availability" | "edition" | "location" | "requestable" | "publicVisible" | "suppressed" | "links">;

export async function updateCatalogRecord(workspace: Workspace, recordId: string, patch: CatalogRecordPatch): Promise<Workspace> {
  const current = activeRevision(workspace);
  const target = current.records.find((record) => record.id === recordId);
  if (!target) throw new Error("Record not found.");
  if (patch.links.length > 20) throw new Error("A record can contain at most 20 access links.");
  if (patch.creators.length > 50 || (patch.contributors?.length ?? 0) > 50) throw new Error("A record can contain at most 50 creators and 50 contributors.");
  const links = patch.links.map((link) => cleanText(link, 2048));
  for (const link of links) { const result = validatePublicUrl(link); if (!result.ok) throw new Error(`Access URL: ${result.reason}`); }
  const updated: CatalogRecord = {
    ...target,
    title: cleanText(patch.title, 1024),
    creators: patch.creators.map((item) => cleanText(item, 512)),
    contributors: (patch.contributors ?? []).map((item) => cleanText(item, 512)),
    format: patch.format,
    availability: patch.availability,
    edition: cleanText(patch.edition, 512),
    location: cleanText(patch.location, 512),
    requestable: patch.requestable,
    publicVisible: patch.publicVisible,
    suppressed: patch.suppressed,
    links,
  };
  const blocking = checkRecords([updated]).find((finding) => finding.severity === "error");
  if (blocking) throw new Error(`${blocking.code}: ${blocking.label}`);
  const records = current.records.map((record) => record.id === recordId ? updated : record);
  const createdAt = new Date().toISOString();
  const revision: Revision = { id: makeId("REV"), parentId: current.id, createdAt, label: `Correct ${recordId}`, digest: await revisionStateDigest(records, current.config, current.archiveSchemas ?? [], current.archiveUnits ?? [], current.serviceRecords ?? []), records, config: structuredClone(current.config), archiveSchemas: structuredClone(current.archiveSchemas ?? []), archiveUnits: structuredClone(current.archiveUnits ?? []), serviceRecords: structuredClone(current.serviceRecords ?? []) };
  return appendAudit({ ...workspace, updatedAt: createdAt, activeRevisionId: revision.id, revisions: retainRevisions(workspace.revisions, revision) }, "Correct catalog record", recordId, "accepted");
}

export async function upsertArchiveSchema(workspace: Workspace, schema: ArchiveSchema): Promise<Workspace> {
  validateArchiveSchema(schema);
  const current = activeRevision(workspace);
  const existing = (current.archiveSchemas ?? []).find((item) => item.id === schema.id);
  if (existing) {
    if (schema.version !== existing.version + 1) throw new Error("A saved schema version must advance by exactly one.");
    if (schema.createdAt !== existing.createdAt) throw new Error("Schema createdAt is immutable.");
    const recordsExist = (current.archiveUnits ?? []).some((item) => item.schemaId === schema.id);
    if (recordsExist && archiveSchemaStructure(existing) !== archiveSchemaStructure(schema)) throw new Error("Structural changes to a schema with records require a new schema and an explicit record migration.");
  } else if (schema.version !== 1) {
    throw new Error("A new archival schema must begin at version 1.");
  }
  const schemas = [...(current.archiveSchemas ?? []).filter((item) => item.id !== schema.id), structuredClone(schema)];
  const units = structuredClone(current.archiveUnits ?? []).map((item) => item.schemaId === schema.id ? { ...item, schemaVersion: schema.version } : item);
  validateArchiveSet(schemas, units);
  return archiveRevision(workspace, current, schemas, units, `Schema ${schema.name}`, "Save archival schema", schema.id);
}

export async function removeArchiveSchema(workspace: Workspace, schemaId: string): Promise<Workspace> {
  const current = activeRevision(workspace);
  if ((current.archiveUnits ?? []).some((item) => item.schemaId === schemaId)) throw new Error("Remove this schema's records before removing the schema.");
  const schemas = (current.archiveSchemas ?? []).filter((item) => item.id !== schemaId);
  if (schemas.length === (current.archiveSchemas ?? []).length) throw new Error("Schema not found.");
  return archiveRevision(workspace, current, schemas, structuredClone(current.archiveUnits ?? []), `Remove schema ${schemaId}`, "Remove archival schema", schemaId);
}

export async function upsertArchiveUnit(workspace: Workspace, unit: ArchiveUnit): Promise<Workspace> {
  const current = activeRevision(workspace);
  const schemas = structuredClone(current.archiveSchemas ?? []);
  const schema = schemas.find((item) => item.id === unit.schemaId); if (!schema) throw new Error("Schema not found.");
  const units = [...(current.archiveUnits ?? []).filter((item) => item.id !== unit.id), structuredClone(unit)];
  validateArchiveUnit(unit, schema, units); validateArchiveSet(schemas, units);
  return archiveRevision(workspace, current, schemas, units, `Archive record ${unit.id}`, "Save archival record", unit.id);
}

export async function removeArchiveUnit(workspace: Workspace, unitId: string): Promise<Workspace> {
  const current = activeRevision(workspace);
  if ((current.archiveUnits ?? []).some((item) => item.parentId === unitId)) throw new Error("Move or remove child records first.");
  const units = (current.archiveUnits ?? []).filter((item) => item.id !== unitId);
  if (units.length === (current.archiveUnits ?? []).length) throw new Error("Archival record not found.");
  return archiveRevision(workspace, current, structuredClone(current.archiveSchemas ?? []), units, `Remove archive record ${unitId}`, "Remove archival record", unitId);
}

export async function applyArchiveImport(workspace: Workspace, source: ArchiveImportReview, disposition: EvidenceDispositionInput): Promise<Workspace> {
  const schema = source.schema;
  const importedUnits = source.units;
  if (!schema || source.blocked || !(await verifyArchiveImportReviewBinding(source))) throw new Error("Archival import review binding is missing or changed; review the source file again.");
  validateArchiveSet([schema], importedUnits);
  if (!trustedReviewedSource(source) || source.format === "unknown") throw new Error("Archival import provenance is invalid or incomplete.");
  const parserProfile = `archive-${source.format}-v1`;
  const warningManifest = await createEvidenceWarningManifest(source.digest, parserProfile, [{
    severity: "warning", code: "STRUCTURE_ONLY_AUTHORITY_UNVERIFIED", entityId: null, label: "Structural review is not authority", detail: "Parser success and internal consistency do not establish origin, custody, completeness, or truth.", occurrenceKey: "semantic-authority-boundary",
  }]);
  const authorityRecord = await createEvidenceAuthorityRecord({
    source: { kind: "archive-import", filename: source.filename, format: source.format, bytes: source.bytes, sha256: source.digest },
    review: { structuralStatus: "passed", canonicalPayloadSha256: await canonicalEvidenceDigest({ schema, units: importedUnits }), parserProfile, warningManifest },
    scope: { kind: "archive-records", entityIds: [...new Set([`schema:${schema.id}`, ...importedUnits.map((unit) => unit.id)])] },
  }, disposition);
  const authorityTarget = `evidence:${authorityRecord.recordSha256} · source:${source.digest}`;
  if (authorityRecord.disposition.decision !== "admit-unverified") {
    return appendEvidenceDecisionOutcome(
      workspace,
      authorityRecord,
      {
        outcome: "not-applied",
        reason: authorityRecord.disposition.decision === "withdraw" ? "operator-withdrew" : "operator-rejected",
        detail: authorityRecord.disposition.decision === "withdraw" ? "The operator withdrew the reviewed archival evidence; no records were applied." : "The operator rejected the reviewed archival evidence; no records were applied.",
        resultingRevisionId: null,
        resultingRevisionDigest: null,
      },
      authorityRecord.disposition.decision === "withdraw" ? "Withdraw evidence admission" : "Reject reviewed evidence",
      authorityTarget,
      "rejected",
    );
  }
  const current = activeRevision(workspace); const schemas = structuredClone(current.archiveSchemas ?? []); const units = structuredClone(current.archiveUnits ?? []);
  if (schemas.some((item) => item.id === schema.id) || importedUnits.some((item) => units.some((existing) => existing.id === item.id))) {
    return appendEvidenceDecisionOutcome(workspace, authorityRecord, {
      outcome: "not-applied",
      reason: "destination-identity-conflict",
      detail: "The operator admitted the reviewed archival source as unverified evidence, but a destination schema or record identity conflict prevented application.",
      resultingRevisionId: null,
      resultingRevisionDigest: null,
    }, "Reject conflicting archival import", authorityTarget, "rejected");
  }
  const archiveSchemas = [...schemas, structuredClone(schema)];
  const archiveUnits = [...units, ...structuredClone(importedUnits)];
  validateArchiveSet(archiveSchemas, archiveUnits);
  const createdAt = new Date().toISOString();
  const records = structuredClone(current.records);
  const config = structuredClone(current.config);
  const serviceRecords = structuredClone(current.serviceRecords ?? []);
  const revision: Revision = {
    id: makeId("REV"),
    parentId: current.id,
    createdAt,
    label: cleanText(`Import ${schema.name}`, 180),
    digest: await revisionStateDigest(records, config, archiveSchemas, archiveUnits, serviceRecords),
    records,
    config,
    archiveSchemas,
    archiveUnits,
    serviceRecords,
  };
  const application = await createEvidenceApplicationRecord(authorityRecord, {
    outcome: "applied",
    reason: "archive-import-applied",
    detail: "The reviewed archival schema and records were applied to the named resulting revision as unverified evidence.",
    resultingRevisionId: revision.id,
    resultingRevisionDigest: revision.digest,
  });
  return appendAudit({
    ...workspace,
    updatedAt: createdAt,
    activeRevisionId: revision.id,
    revisions: retainRevisions(workspace.revisions, revision),
    evidenceAuthority: [...(workspace.evidenceAuthority ?? []), authorityRecord],
    evidenceApplications: [...(workspace.evidenceApplications ?? []), application],
  }, "Apply archival import as unverified evidence", authorityTarget, "accepted");
}

export async function upsertServiceRecord(workspace: Workspace, record: ServiceRecord): Promise<Workspace> {
  const current = activeRevision(workspace);
  const existing = (current.serviceRecords ?? []).find((item) => item.id === record.id);
  if (existing && existing.createdAt !== record.createdAt) throw new Error("Service record createdAt is immutable.");
  const serviceRecords = [...(current.serviceRecords ?? []).filter((item) => item.id !== record.id), structuredClone(record)];
  validateServiceRecords(serviceRecords);
  return serviceRevision(workspace, current, serviceRecords, `${existing ? "Update" : "Create"} ${record.id}`, existing ? "Update service record" : "Create service record", record.id);
}

export async function removeServiceRecord(workspace: Workspace, recordId: string): Promise<Workspace> {
  const current = activeRevision(workspace);
  const serviceRecords = (current.serviceRecords ?? []).filter((item) => item.id !== recordId);
  if (serviceRecords.length === (current.serviceRecords ?? []).length) throw new Error("Service record not found.");
  validateServiceRecords(serviceRecords);
  return serviceRevision(workspace, current, serviceRecords, `Remove ${recordId}`, "Remove service record", recordId);
}

async function serviceRevision(workspace: Workspace, current: Revision, serviceRecords: ServiceRecord[], label: string, action: string, target: string): Promise<Workspace> {
  const createdAt = new Date().toISOString();
  const records = structuredClone(current.records);
  const config = structuredClone(current.config);
  const archiveSchemas = structuredClone(current.archiveSchemas ?? []);
  const archiveUnits = structuredClone(current.archiveUnits ?? []);
  const revision: Revision = {
    id: makeId("REV"), parentId: current.id, createdAt, label: cleanText(label, 180),
    digest: await revisionStateDigest(records, config, archiveSchemas, archiveUnits, serviceRecords),
    records, config, archiveSchemas, archiveUnits, serviceRecords,
  };
  return appendAudit({ ...workspace, updatedAt: createdAt, activeRevisionId: revision.id, revisions: retainRevisions(workspace.revisions, revision) }, action, target, "accepted");
}

export async function renameWorkspace(workspace: Workspace, name: string, action = "Rename workspace", target?: string): Promise<Workspace> {
  const safeName = cleanWorkspaceName(name);
  if (safeName === workspace.name && action === "Rename workspace") return workspace;
  return appendAudit({ ...workspace, name: safeName, updatedAt: new Date().toISOString() }, cleanText(action, 180), target ? cleanText(target, 180) : safeName, "accepted");
}

export async function prepareLocalWorkspace(workspace: Workspace, name: string): Promise<Workspace> {
  const safeName = cleanWorkspaceName(name);
  const next = { ...structuredClone(workspace), name: safeName, updatedAt: new Date().toISOString() };
  if (workspace.audit.length >= MAX_AUDIT_EVENTS) {
    await requireVerifiedPredecessor(workspace);
    return startSuccessorAudit(next, "Create successor workspace", workspace.audit.at(-1)!.hash);
  }
  return appendAudit(next, "Create local workspace", safeName, "accepted");
}

export async function forkWorkspace(workspace: Workspace, name: string): Promise<Workspace> {
  const safeName = cleanWorkspaceName(name);
  const next = { ...structuredClone(workspace), name: safeName, updatedAt: new Date().toISOString() };
  if (workspace.audit.length >= MAX_AUDIT_EVENTS) {
    await requireVerifiedPredecessor(workspace);
    return startSuccessorAudit(next, "Create successor workspace", workspace.audit.at(-1)!.hash);
  }
  return appendAudit(next, "Duplicate workspace", safeName, "accepted");
}

async function requireVerifiedPredecessor(workspace: Workspace): Promise<void> {
  try {
    await validateWorkspaceSnapshot(workspace);
  } catch {
    throw new Error("A successor workspace cannot be created because the predecessor snapshot or audit chain failed integrity validation.");
  }
}

function startSuccessorAudit(workspace: Workspace, action: string, predecessorHash: string): Promise<Workspace> {
  return appendAudit({ ...workspace, audit: [] }, action, `prior-ledger-sha256:${predecessorHash}`, "accepted");
}

export async function recordWorkspaceAction(workspace: Workspace, action: string, target = "Browser-local workspace"): Promise<Workspace> {
  return appendAudit({ ...workspace, updatedAt: new Date().toISOString() }, cleanText(action, 180), cleanText(target, 180), "accepted");
}

export async function recordEvidenceDisposition(
  workspace: Workspace,
  evidence: EvidenceDescriptorInput,
  disposition: EvidenceDispositionInput,
  action: string,
  application?: EvidenceApplicationInputValue,
): Promise<Workspace> {
  const record = await createEvidenceAuthorityRecord(evidence, disposition);
  if (application) {
    return appendEvidenceDecisionOutcome(
      workspace,
      record,
      application,
      action,
      `evidence:${record.recordSha256} · source:${record.evidence.source.sha256}`,
      application.outcome === "applied" ? "accepted" : "rejected",
    );
  }
  const next = {
    ...workspace,
    updatedAt: disposition.atBrowser,
    evidenceAuthority: [...(workspace.evidenceAuthority ?? []), record],
  };
  return appendAudit(next, cleanText(action, 180), `evidence:${record.recordSha256} · source:${record.evidence.source.sha256}`, disposition.decision === "admit-unverified" ? "accepted" : "rejected");
}

async function appendEvidenceDecisionOutcome(
  workspace: Workspace,
  decision: EvidenceAuthorityRecord,
  application: EvidenceApplicationInputValue,
  action: string,
  target: string,
  auditOutcome: AuditEvent["outcome"],
): Promise<Workspace> {
  if (application.outcome === "applied") {
    const resultingRevision = workspace.revisions.find((revision) => revision.id === application.resultingRevisionId);
    if (!resultingRevision || resultingRevision.digest !== application.resultingRevisionDigest) {
      throw new Error("Applied evidence must bind an existing resulting revision and its exact state digest.");
    }
  }
  const outcome = await createEvidenceApplicationRecord(decision, application);
  return appendAudit({
    ...workspace,
    updatedAt: decision.disposition.atBrowser,
    evidenceAuthority: [...(workspace.evidenceAuthority ?? []), decision],
    evidenceApplications: [...(workspace.evidenceApplications ?? []), outcome],
  }, cleanText(action, 180), cleanText(target, 180), auditOutcome);
}

export function reviewedSourceAuditTarget(source: ReviewedSource): string {
  const digest = typeof source.digest === "string" && /^[a-f0-9]{64}$/.test(source.digest) ? source.digest : "digest-unavailable";
  const format = auditText(source.format, 40, "unknown");
  const prefix = `sha256:${digest} · ${format} · `;
  return prefix + auditText(source.filename, Math.max(1, 180 - prefix.length), "unnamed");
}

function trustedReviewedSource(source: ReviewedSource): boolean {
  return typeof source.digest === "string"
    && /^[a-f0-9]{64}$/.test(source.digest)
    && typeof source.format === "string"
    && source.format.length > 0
    && source.format.length <= 40
    && auditText(source.format, 40, "") === source.format
    && typeof source.filename === "string"
    && source.filename.length > 0
    && source.filename.length <= 180
    && auditText(source.filename, 180, "") === source.filename;
}

function importReviewBinding(review: ImportReview): Promise<string> {
  return digestValue({
    filename: review.filename,
    bytes: review.bytes,
    digest: review.digest,
    format: review.format,
    records: review.records,
    findings: review.findings,
    blocked: review.blocked,
    summary: review.summary,
  });
}

function auditText(value: unknown, maximum: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maximum) || fallback;
}

async function archiveRevision(workspace: Workspace, current: Revision, archiveSchemas: ArchiveSchema[], archiveUnits: ArchiveUnit[], label: string, action: string, target: string): Promise<Workspace> {
  validateArchiveSet(archiveSchemas, archiveUnits);
  const createdAt = new Date().toISOString();
  const records = structuredClone(current.records), config = structuredClone(current.config), serviceRecords = structuredClone(current.serviceRecords ?? []);
  const revision: Revision = { id: makeId("REV"), parentId: current.id, createdAt, label: cleanText(label, 180), digest: await revisionStateDigest(records, config, archiveSchemas, archiveUnits, serviceRecords), records, config, archiveSchemas, archiveUnits, serviceRecords };
  return appendAudit({ ...workspace, updatedAt: createdAt, activeRevisionId: revision.id, revisions: retainRevisions(workspace.revisions, revision) }, action, target, "accepted");
}

export async function rollbackTo(workspace: Workspace, revisionId: string): Promise<Workspace> {
  const target = workspace.revisions.find((revision) => revision.id === revisionId);
  if (!target) throw new Error("Revision not found.");
  const current = activeRevision(workspace);
  const createdAt = new Date().toISOString();
  const revision: Revision = {
    id: makeId("REV"),
    parentId: current.id,
    createdAt,
    label: `Restore ${target.id}`,
    digest: await revisionStateDigest(target.records, target.config, target.archiveSchemas ?? [], target.archiveUnits ?? [], target.serviceRecords ?? []),
    records: structuredClone(target.records),
    config: structuredClone(target.config),
    archiveSchemas: structuredClone(target.archiveSchemas ?? []),
    archiveUnits: structuredClone(target.archiveUnits ?? []),
    serviceRecords: structuredClone(target.serviceRecords ?? []),
  };
  return appendAudit(
    {
      ...workspace,
      updatedAt: createdAt,
      activeRevisionId: revision.id,
      revisions: retainRevisions(workspace.revisions, revision),
    },
    "Restore revision",
    target.id,
    "rolled-back",
  );
}

export async function updateIncident(
  workspace: Workspace,
  incidentId: string,
  patch: Partial<Pick<Incident, "state" | "ownerRole" | "nextAction">> & { note?: string },
): Promise<Workspace> {
  const existing = workspace.incidents.find((incident) => incident.id === incidentId);
  if (!existing) throw new Error("Incident not found.");
  const note = patch.note?.trim();
  if (note && existing.notes.length >= MAX_INCIDENT_NOTES) throw new Error("Incident note capacity reached. Export the record before continuing in a successor workspace.");
  if (patch.state && !["open", "investigating", "monitoring", "resolved"].includes(patch.state)) throw new Error("Incident state is invalid.");
  const nextState = patch.state ?? existing.state;
  const nextOwnerRole = patch.ownerRole !== undefined ? cleanText(patch.ownerRole, 100) : existing.ownerRole;
  const nextAction = patch.nextAction !== undefined ? cleanText(patch.nextAction, 500) : existing.nextAction;
  const resolving = existing.state !== "resolved" && nextState === "resolved";
  const revisingResolvedClaim = existing.state === "resolved" && nextState === "resolved"
    && (nextOwnerRole !== existing.ownerRole || nextAction !== existing.nextAction);
  if (resolving && !note) throw new Error("Incident resolution requires a contemporaneous closure note describing the evidence checked.");
  if (revisingResolvedClaim && !note) throw new Error("Changing the owner or closure criterion of a resolved incident requires a contemporaneous note, or reopen the incident first.");
  if (nextState === "resolved" && (!nextOwnerRole || /^unassigned$/i.test(nextOwnerRole))) throw new Error("Incident resolution requires an assigned owner role.");
  if (nextState === "resolved" && !nextAction) throw new Error("Incident resolution requires a closure criterion.");
  if (nextState === "resolved" && !note && !existing.notes.some((item) => item.trim())) throw new Error("A resolved incident requires recorded closure evidence.");
  const incidents = workspace.incidents.map((incident) => {
    if (incident.id !== incidentId) return incident;
    return {
      ...incident,
      state: nextState,
      ownerRole: nextOwnerRole,
      nextAction,
      notes: note ? [...incident.notes, cleanText(note, 2000)] : incident.notes,
      updatedAt: new Date().toISOString(),
    };
  });
  return appendAudit({ ...workspace, incidents, updatedAt: new Date().toISOString() }, "Update incident", incidentId, "accepted");
}

export async function createIncidentFromFinding(
  workspace: Workspace,
  finding: Finding,
): Promise<Workspace> {
  if (workspace.incidents.length >= MAX_INCIDENTS) throw new Error("Incident capacity reached. Export the record before continuing in a successor workspace.");
  let evidenceDetail: string;
  try { evidenceDetail = cleanText(finding.detail, 2000); }
  catch { throw new Error("Finding evidence exceeds the 2,000-character incident boundary. Preserve the complete finding in the Technical Report before creating a bounded incident record."); }
  const duplicate = workspace.incidents.some((incident) =>
    incident.recordId === finding.recordId && incident.evidence.includes(finding.code) && incident.state !== "resolved",
  );
  if (duplicate) throw new Error("An open incident already tracks this finding.");
  const at = new Date().toISOString();
  const sourceRecord = finding.recordId
    ? activeRevision(workspace).records.find((record) => record.id === finding.recordId)
    : undefined;
  const incident: Incident = {
    id: makeId("INC"),
    title: cleanText(finding.label, 500),
    service: serviceForFinding(finding.code),
    state: "open",
    severity: finding.severity === "error" ? "high" : finding.severity === "warning" ? "medium" : "low",
    ...(finding.recordId ? { recordId: finding.recordId } : {}),
    ownerRole: "Unassigned",
    openedAt: at,
    updatedAt: at,
    evidence: [cleanText(finding.code, 2000), evidenceDetail],
    notes: [],
    nextAction: nextActionForFinding(finding.code),
    synthetic: sourceRecord?.source.format === "fixture",
  };
  return appendAudit(
    { ...workspace, incidents: [...workspace.incidents, incident], updatedAt: at },
    "Create incident",
    incident.id,
    "accepted",
  );
}


export function makeOperationalDocument(workspace: Workspace, kind: DocumentKind, incidentId?: string): string {
  const revision = activeRevision(workspace);
  const incidentBound = kind === "incident-ticket" || kind === "vendor-escalation" || kind === "postmortem";
  if (incidentBound && !incidentId) throw new Error("Select an incident before generating this incident-bound document.");
  const incident = incidentId ? workspace.incidents.find((item) => item.id === incidentId) : undefined;
  if (incidentBound && !incident) throw new Error("The selected incident is no longer present in this workspace.");
  if (incidentBound && incident?.state === "resolved") {
    if (!incident.notes.some((note) => note.trim())) throw new Error("This resolved incident lacks closure evidence. Reopen it or record an activity or closure note before generating an operational document.");
    if (!incident.ownerRole.trim() || /^unassigned$/i.test(incident.ownerRole.trim())) throw new Error("This resolved incident lacks an assigned owner. Reopen it or assign an owner role before generating an operational document.");
    if (!incident.nextAction.trim()) throw new Error("This resolved incident lacks a closure criterion. Reopen it or record the criterion before generating an operational document.");
  }
  const md = markdownInline;
  const incidentNotes = incident?.notes.length ? incident.notes.map((item) => `- ${md(item)}`) : ["- No activity or closure notes are recorded."];
  const common = [
    `Document: ${md(DOCUMENT_OPTIONS.find((option) => option.value === kind)?.label ?? kind)}`,
    "Draft status: requires institutional review before operational reliance or circulation",
    "Document review owner role: Unassigned — assign through the institution's authoritative process",
    `Workspace: ${md(workspace.name)}`,
    `Revision: ${md(revision.id)}`,
    `Workspace updated (browser clock; not trusted time): ${md(workspace.updatedAt)}`,
    "Evidence scope: This document reflects content present in this workspace; it does not establish that the workspace is complete, authentic, authoritative, or current in the system of record.",
    "",
  ];
  const sections: Record<DocumentKind, string[]> = {
    "system-inventory": [
      "# System inventory",
      "",
      "Baseline control template: these rows do not establish that a component is deployed, configured, tested, authoritative, or present. Reconcile every row with the institution's authoritative inventory before reliance.",
      "",
      "| Component | Purpose | Dependency | Recovery evidence |",
      "| --- | --- | --- | --- |",
      "| Source records | MARCXML / Dublin Core custody | Fatal UTF-8 plus bounded structural and typed validation | Import receipt and digest |",
      "| Normalization | Canonical discovery fields | Source trace and rule order | Finding reconciliation |",
      "| Discovery | Search, facets, visibility | Normalized records | Record and count checks |",
      "| Resolver | OpenURL target construction | Resolver and proxy configuration | Controlled link check |",
      "| Fulfillment | Availability and request state | Holding, item, location, policy | Synthetic request trace |",
      "| Named local workspace | Catalog, archives, service registers, incidents, revisions, and audit | Explicit save with internally validated, manifest-digest-bound current and prior generations | Digest verification, plaintext workspace backup, and reversible restore |",
    ],
    "configuration-register": [
      "# Configuration register",
      "",
      `- Resolver: ${md(revision.config.resolverBase || "Not configured")}`,
      `- Proxy prefix: ${md(revision.config.proxyPrefix || "Not configured")}`,
      `- Default pickup: ${md(revision.config.defaultPickupLocation || "Not configured")}`,
      `- Member code: ${md(revision.config.memberCode || "Not configured")}`,
      `- Active digest: ${md(revision.digest)}`,
      "",
      "Changes require a new revision. Rollback restores a prior state as another revision; it does not erase history.",
    ],
    "incident-ticket": incident ? [
      `# ${md(incident.id)} — ${md(incident.title)}`,
      "",
      `- State: ${md(incident.state)}`,
      `- Severity: ${md(incident.severity)}`,
      `- Service: ${md(incident.service)}`,
      `- Owner role: ${md(incident.ownerRole)}`,
      `- Opened: ${md(incident.openedAt)}`,
      `- Updated: ${md(incident.updatedAt)}`,
      "",
      "## Evidence",
      ...incident.evidence.map((item) => `- ${md(item)}`),
      "",
      `## ${incident.state === "resolved" ? "Closure criterion" : "Next action"}`,
      md(incident.nextAction),
      "",
      `## ${incident.state === "resolved" ? "Closure evidence and activity notes" : "Activity notes"}`,
      ...incidentNotes,
    ] : ["# Incident ticket", "", "No incident selected."],
    "vendor-escalation": incident ? [
      `# Vendor escalation — ${md(incident.id)}`,
      "",
      `Service: ${md(incident.service)}`,
      `Impact: ${md(incident.title)}`,
      `First observed: ${md(incident.openedAt)}`,
      "",
      "## Evidence supplied",
      ...incident.evidence.map((item) => `- ${md(item)}`),
      "",
      "## Activity and closure notes",
      ...incidentNotes,
      "",
      "## Requested response",
      "Confirm the authoritative target or configuration, identify any recent change, and provide a correction or documented workaround.",
      "",
      "Disclosure review: Review every supplied evidence and note value for patron, personal, confidential, or contract-restricted data before sending. This document does not determine that those data are absent.",
    ] : ["# Vendor escalation", "", "No incident selected."],
    "change-request": [
      "# Change request",
      "",
      "## Purpose",
      "Describe the smallest configuration or normalization change that resolves the verified condition.",
      "",
      "## Preconditions",
      "- Record the active revision and digest.",
      "- Identify affected records, members, and services.",
      "- Run baseline checks.",
      "",
      "## Validation",
      "- Re-run the failing check.",
      "- Check an unaffected control record or member.",
      "- Confirm public language and accessibility behavior.",
      "",
      "## Rollback",
      `Restore revision ${md(revision.id)} if any acceptance check fails.`,
    ],
    "postmortem": incident ? [
      `# Postmortem — ${md(incident.id)}`,
      "",
      `- State: ${md(incident.state)}`,
      `- Severity: ${md(incident.severity)}`,
      `- Owner role: ${md(incident.ownerRole)}`,
      ...(incident.state === "resolved" ? [] : ["", `Status warning: This incident remains ${md(incident.state)}; this draft is not closure evidence and must not be treated as a completed postmortem.`]),
      "",
      "## Impact",
      md(incident.title),
      "",
      "## Detection",
      md(incident.evidence[0] ?? "Document the first reliable signal."),
      "",
      "## Contributing conditions",
      "Document missing controls, incomplete inventory, or dependency mismatch without attributing blame.",
      "",
      "## Recovery",
      md(incident.nextAction),
      "",
      `## ${incident.state === "resolved" ? "Closure evidence and activity notes" : "Activity notes"}`,
      ...incidentNotes,
      "",
      "## Follow-up",
      "Assign an owner role, a verification date, and a regression check for each accepted action.",
    ] : ["# Postmortem", "", "No incident selected."],
    "rollback-runbook": [
      "# Upgrade and rollback runbook",
      "",
      "1. Record the active revision, digest, scope, and owner role.",
      "2. Export the technical report and current configuration register.",
      "3. Stage the change; do not overwrite an existing revision.",
      "4. Run checks for the affected path and one unaffected control.",
      "5. If any check fails, restore the last known-good revision.",
      "6. Verify service, public language, and audit-chain integrity.",
      "7. Attach results to the incident or change record.",
    ],
    "access-control": [
      "# Access-control matrix",
      "",
      "| Role | View | Change authority |",
      "| --- | --- | --- |",
      "| Public | Status notice and help | None |",
      "| Service desk | Incident summary and procedure | Notes and escalation |",
      "| Metadata staff | Source, normalization, index scope | Approved metadata correction |",
      "| Systems administrator | Configuration, audit, rollback | Approved systems change |",
      "| Auditor | Evidence, revisions, approvals | None |",
      "",
      "This standalone local interface does not claim to enforce institutional identity or authorization.",
    ],
    "continuity-checklist": [
      "# Business-continuity checklist",
      "",
      "- [ ] System owner roles and vendor contacts are current.",
      "- [ ] Source formats, identifiers, and suppression rules are inventoried.",
      "- [ ] Resolver, proxy, entitlement, and member overrides are documented.",
      "- [ ] Known-record, known-link, request, and accessibility checks pass.",
      "- [ ] Last known-good revision can be restored.",
      "- [ ] Audit chain verifies and reports can be exported.",
      "- [ ] Patron notice and staff procedure are available offline.",
      "- [ ] Imported data retention and deletion are understood.",
    ],
  };
  return [...common, ...sections[kind], "", "Review trigger: configuration, schema, vendor target, or policy change."].join("\n");
}

function markdownInline(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r?\n/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\u005b\u005d()#+.!|~-])/g, "\\$1");
}

export function exportPacket(workspace: Workspace): string {
  const revision = activeRevision(workspace);
  const packet = {
    schema: CATALOG_PACKET_SCHEMA,
    version: LAB_VERSION,
    kind: "catalog-batch",
    provenance: { label: workspace.name, exportedAt: new Date().toISOString(), revision: revision.id },
    records: revision.records.map((record) => ({
      id: record.id,
      title: record.title,
      creators: record.creators,
      contributors: record.contributors ?? [],
      year: record.year,
      format: record.format,
      identifiers: record.identifiers,
      links: record.links,
      availability: record.availability,
      edition: record.edition,
      location: record.location,
      suppressed: record.suppressed,
      publicVisible: record.publicVisible,
      requestable: record.requestable,
      metadata: record.metadata ?? emptyMetadata(),
    })),
  };
  return JSON.stringify(packet, null, 2);
}

export async function verifyAudit(workspace: Workspace): Promise<boolean> {
  if (!workspace.audit.length) return false;
  let previousHash = "GENESIS";
  for (const [index, event] of workspace.audit.entries()) {
    if (event.sequence !== index + 1) return false;
    if (event.previousHash !== previousHash) return false;
    const hash = await digestValue({
      sequence: event.sequence,
      at: event.at,
      role: event.role,
      action: event.action,
      target: event.target,
      outcome: event.outcome,
      ...(event.stateDigest ? { stateDigest: event.stateDigest } : {}),
      previousHash: event.previousHash,
    });
    if (hash !== event.hash) return false;
    previousHash = hash;
  }
  const latestStateDigest = workspace.audit.at(-1)?.stateDigest;
  if (!latestStateDigest) return false;
  if (latestStateDigest !== await workspaceStateDigest(workspace)
    && latestStateDigest !== await legacyWorkspaceStateDigest(workspace)) return false;
  return true;
}

export async function validateWorkspaceSnapshot(value: unknown): Promise<Workspace> {
  inspectJson(value, 0);
  const root = asObject(value, "Saved workspace must be an object.");
  exactKeys(root, ["schema", "version", "name", "createdAt", "updatedAt", "activeRevisionId", "revisions", "incidents", "evidenceAuthority", "evidenceApplications", "audit"]);
  if (root.schema !== LAB_SCHEMA || root.version !== LAB_VERSION) throw new Error("Saved workspace version is unsupported.");
  if (cleanWorkspaceName(readString(root.name, 120, "workspace name")) !== root.name) throw new Error("Workspace name is not in canonical form.");
  readDate(root.createdAt, "createdAt");
  readDate(root.updatedAt, "updatedAt");
  const activeId = readString(root.activeRevisionId, 128, "activeRevisionId");

  if (!Array.isArray(root.revisions) || root.revisions.length < 1 || root.revisions.length > 20) throw new Error("Saved workspace must contain 1–20 revisions.");
  const revisionIds = new Set<string>();
  let previousRevisionId: string | null = null;
  for (const [index, valueRevision] of root.revisions.entries()) {
    const revision = asObject(valueRevision, `Revision ${index + 1} must be an object.`);
    exactKeys(revision, ["id", "parentId", "createdAt", "label", "digest", "records", "config", "archiveSchemas", "archiveUnits", "serviceRecords"]);
    const id = readString(revision.id, 128, "revision id");
    if (!SAFE_ID.test(id) || revisionIds.has(id)) throw new Error("Revision ID is invalid or duplicated.");
    const parentId = revision.parentId === null ? null : readString(revision.parentId, 128, "parent revision");
    if (parentId !== previousRevisionId) throw new Error(index === 0
      ? "The first retained revision must begin the retained revision lineage."
      : "Each retained revision must name the immediately preceding retained revision as its parent.");
    revisionIds.add(id);
    previousRevisionId = id;
    readDate(revision.createdAt, "revision createdAt");
    readString(revision.label, 180, "revision label");
    const digest = readString(revision.digest, 64, "revision digest");
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Revision digest is invalid.");
    if (!Array.isArray(revision.records) || revision.records.length > MAX_RECORDS) throw new Error("Revision record limit exceeded.");
    const storedRecordIds = new Set<string>();
    revision.records.forEach((record, recordIndex) => {
      validateStoredRecord(record, recordIndex + 1);
      const recordId = (record as CatalogRecord).id;
      if (storedRecordIds.has(recordId)) throw new Error(`Revision ${id} contains duplicate record ID ${recordId}.`);
      storedRecordIds.add(recordId);
    });
    const config = validateStoredConfig(revision.config);
    validateConfig(config);
    const hasArchiveSchemas = Object.prototype.hasOwnProperty.call(revision, "archiveSchemas");
    const hasArchiveUnits = Object.prototype.hasOwnProperty.call(revision, "archiveUnits");
    if (hasArchiveSchemas !== hasArchiveUnits) throw new Error("Stored archival state is incomplete.");
    validateStoredArchiveState(revision.archiveSchemas, revision.archiveUnits);
    const hasServiceRecords = Object.prototype.hasOwnProperty.call(revision, "serviceRecords");
    validateStoredServiceRecords(revision.serviceRecords);
    const expectedDigest = hasServiceRecords
      ? await revisionStateDigest(revision.records as CatalogRecord[], config, hasArchiveSchemas ? revision.archiveSchemas as ArchiveSchema[] : [], hasArchiveUnits ? revision.archiveUnits as ArchiveUnit[] : [], revision.serviceRecords as ServiceRecord[])
      : hasArchiveSchemas
        ? await revisionStateDigest(revision.records as CatalogRecord[], config, revision.archiveSchemas as ArchiveSchema[], revision.archiveUnits as ArchiveUnit[])
      : await digestValue({ records: revision.records, config });
    if (digest !== expectedDigest) throw new Error("Revision content digest does not match its stored state.");
  }
  if (!revisionIds.has(activeId)) throw new Error("Saved workspace has no active revision.");
  if (activeId !== previousRevisionId) throw new Error("The active revision must be the last retained revision.");

  if (!Array.isArray(root.incidents) || root.incidents.length > MAX_INCIDENTS) throw new Error("Incident limit exceeded.");
  const incidentIds = new Set<string>();
  root.incidents.forEach((item, index) => {
    const incident = asObject(item, `Incident ${index + 1} must be an object.`);
    exactKeys(incident, ["id", "title", "service", "state", "severity", "recordId", "ownerRole", "openedAt", "updatedAt", "evidence", "notes", "nextAction", "synthetic"]);
    const id = readString(incident.id, 128, "incident id");
    if (!SAFE_ID.test(id) || incidentIds.has(id)) throw new Error("Incident ID is invalid or duplicated.");
    incidentIds.add(id);
    readString(incident.title, 500, "incident title");
    readString(incident.service, 160, "incident service");
    if (!["open", "investigating", "monitoring", "resolved"].includes(String(incident.state))) throw new Error("Incident state is invalid.");
    if (!["high", "medium", "low"].includes(String(incident.severity))) throw new Error("Incident severity is invalid.");
    if (incident.recordId !== undefined) readString(incident.recordId, 128, "incident recordId");
    readString(incident.ownerRole, 100, "ownerRole");
    readDate(incident.openedAt, "incident openedAt");
    readDate(incident.updatedAt, "incident updatedAt");
    validateStringArray(incident.evidence, 100, 2000, "incident evidence");
    validateStringArray(incident.notes, MAX_INCIDENT_NOTES, 2000, "incident notes");
    readString(incident.nextAction, 500, "nextAction");
    readBoolean(incident.synthetic, "synthetic");
  });

  const evidenceByRecordDigest = new Map<string, EvidenceAuthorityRecord>();
  if (root.evidenceAuthority !== undefined) {
    if (!Array.isArray(root.evidenceAuthority) || root.evidenceAuthority.length > 5_000) throw new Error("Evidence authority record limit exceeded.");
    for (const item of root.evidenceAuthority) {
      const record = await validateEvidenceAuthorityRecord(item);
      if (evidenceByRecordDigest.has(record.recordSha256)) throw new Error("Evidence authority records must not be duplicated.");
      evidenceByRecordDigest.set(record.recordSha256, record);
    }
  }

  if (root.evidenceApplications !== undefined) {
    if (!Array.isArray(root.evidenceApplications) || root.evidenceApplications.length > 5_000) throw new Error("Evidence application record limit exceeded.");
    const applicationDigests = new Set<string>();
    const appliedDecisions = new Set<string>();
    for (const item of root.evidenceApplications) {
      const application = await validateEvidenceApplicationRecord(item);
      if (applicationDigests.has(application.recordSha256) || appliedDecisions.has(application.decisionRecordSha256)) {
        throw new Error("Evidence application records and decision links must be unique.");
      }
      const decision = evidenceByRecordDigest.get(application.decisionRecordSha256);
      if (!decision) throw new Error("Evidence application outcome is not linked to an evidence decision.");
      validateEvidenceApplicationLink(decision, application);
      if (application.outcome === "applied") {
        const retainedRevision = (root.revisions as Revision[]).find((revision) => revision.id === application.resultingRevisionId);
        if (retainedRevision && retainedRevision.digest !== application.resultingRevisionDigest) {
          throw new Error("Evidence application resulting revision digest does not match the retained revision.");
        }
      }
      applicationDigests.add(application.recordSha256);
      appliedDecisions.add(application.decisionRecordSha256);
    }
  }

  if (!Array.isArray(root.audit) || root.audit.length < 1 || root.audit.length > MAX_AUDIT_EVENTS) throw new Error(`Saved workspace must contain 1–${MAX_AUDIT_EVENTS.toLocaleString()} audit events.`);
  root.audit.forEach((item, index) => {
    const event = asObject(item, `Audit event ${index + 1} must be an object.`);
    exactKeys(event, ["sequence", "at", "role", "action", "target", "outcome", "stateDigest", "previousHash", "hash"]);
    if (event.sequence !== index + 1) throw new Error("Audit sequence is invalid.");
    readDate(event.at, "audit timestamp");
    readString(event.role, 100, "audit role");
    readString(event.action, 180, "audit action");
    readString(event.target, 180, "audit target");
    if (!["accepted", "rejected", "rolled-back"].includes(String(event.outcome))) throw new Error("Audit outcome is invalid.");
    if (event.stateDigest !== undefined && !/^[a-f0-9]{64}$/.test(readString(event.stateDigest, 64, "state digest"))) throw new Error("Audit state digest is invalid.");
    const previousHash = readString(event.previousHash, 64, "previous hash");
    if (index === 0 ? previousHash !== "GENESIS" : !/^[a-f0-9]{64}$/.test(previousHash)) throw new Error("Previous audit hash is invalid.");
    if (!/^[a-f0-9]{64}$/.test(readString(event.hash, 64, "audit hash"))) throw new Error("Audit hash is invalid.");
  });
  if (!(root.audit.at(-1) as Record<string, unknown>).stateDigest) throw new Error("The latest audit event must bind the saved workspace state.");

  const workspace = structuredClone(value) as Workspace;
  if (!(await verifyAudit(workspace))) throw new Error("Saved workspace audit chain is invalid.");
  return workspace;
}

function validateStoredArchiveState(schemaValue: unknown, unitValue: unknown): void {
  const schemas = schemaValue === undefined ? [] : schemaValue;
  const units = unitValue === undefined ? [] : unitValue;
  if (!Array.isArray(schemas) || schemas.length > 50 || !Array.isArray(units) || units.length > 5000) throw new Error("Stored archival state exceeds its limits.");
  for (const raw of schemas) {
    const schema = asObject(raw, "Stored archival schema must be an object.");
    exactKeys(schema, ["id", "name", "description", "profile", "recordType", "version", "fields", "createdAt", "updatedAt"]);
    readString(schema.id, 128, "archive schema id"); readString(schema.name, 120, "archive schema name"); readString(schema.description, 1000, "archive schema description"); readString(schema.profile, 32, "archive schema profile");
    if (schema.recordType !== undefined) readString(schema.recordType, 32, "archive schema recordType");
    if (!Number.isInteger(schema.version)) throw new Error("Archive schema version is invalid."); readDate(schema.createdAt, "archive schema createdAt"); readDate(schema.updatedAt, "archive schema updatedAt");
    if (!Array.isArray(schema.fields) || schema.fields.length > 128) throw new Error("Archive schema field limit exceeded.");
    for (const rawField of schema.fields) {
      const field = asObject(rawField, "Archive schema field must be an object."); exactKeys(field, ["id", "label", "definition", "kind", "required", "repeatable", "vocabulary", "mappings"]);
      readString(field.id, 128, "archive field id"); readString(field.label, 120, "archive field label"); readString(field.definition, 500, "archive field definition"); readString(field.kind, 32, "archive field kind"); readBoolean(field.required, "archive field required"); readBoolean(field.repeatable, "archive field repeatable"); validateStringArray(field.vocabulary, 250, 256, "archive field vocabulary");
      const mappings = asObject(field.mappings, "Archive field mappings must be an object."); exactKeys(mappings, ["ead", "archivesSpace", "atom", "ric"]); Object.values(mappings).forEach((value) => readString(value, 256, "archive field mapping"));
    }
  }
  for (const raw of units) {
    const unit = asObject(raw, "Stored archival record must be an object."); exactKeys(unit, ["id", "schemaId", "schemaVersion", "parentId", "level", "values", "published", "language", "createdAt", "updatedAt"]);
    readString(unit.id, 128, "archive record id"); readString(unit.schemaId, 128, "archive record schemaId"); if (!Number.isInteger(unit.schemaVersion)) throw new Error("Archive record schemaVersion is invalid."); if (unit.parentId !== null) readString(unit.parentId, 128, "archive parentId"); readString(unit.level, 32, "archive level"); readDate(unit.createdAt, "archive record createdAt"); readDate(unit.updatedAt, "archive record updatedAt");
    if (unit.published !== undefined) readBoolean(unit.published, "archive record published");
    if (unit.language !== undefined) readString(unit.language, 64, "archive record language");
    const values = asObject(unit.values, "Archive record values must be an object."); if (Object.keys(values).length > 128) throw new Error("Archive record values exceed 128 fields.");
    for (const [key, value] of Object.entries(values)) { if (FORBIDDEN_KEYS.has(key)) throw new Error("Archive record contains a forbidden key."); if (Array.isArray(value)) { if (value.length > 250) throw new Error("Archive field value limit exceeded."); value.forEach((entry) => { if (!["string", "boolean", "number"].includes(typeof entry)) throw new Error("Archive field arrays must contain scalar values."); }); } else if (!["string", "boolean", "number"].includes(typeof value)) throw new Error("Archive field values must be scalar or scalar arrays."); }
  }
  validateArchiveSet(structuredClone(schemas) as ArchiveSchema[], structuredClone(units) as ArchiveUnit[]);
}

function validateStoredServiceRecords(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Stored service records exceed their limit.");
  for (const [index, raw] of value.entries()) {
    const record = asObject(raw, `Service record ${index + 1} must be an object.`);
    exactKeys(record, ["id", "kind", "area", "title", "state", "ownerRole", "system", "sensitivity", "values", "createdAt", "updatedAt"]);
    readString(record.id, 128, "service record id");
    const kind = readString(record.kind, 80, "service record kind");
    serviceDefinition(kind);
    readString(record.area, 80, "service record area");
    readString(record.title, 500, "service record title");
    readString(record.state, 32, "service record state");
    readString(record.ownerRole, 160, "service record owner role");
    readString(record.system, 256, "service record system");
    readString(record.sensitivity, 32, "service record sensitivity");
    readDate(record.createdAt, "service record createdAt");
    readDate(record.updatedAt, "service record updatedAt");
    const values = asObject(record.values, "Service record values must be an object.");
    if (Object.keys(values).length > 64) throw new Error("Service record values exceed 64 fields.");
    for (const [key, fieldValue] of Object.entries(values)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error("Service record contains a forbidden key.");
      const list = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      if (list.length > 100 || list.some((entry) => !["string", "boolean", "number"].includes(typeof entry))) throw new Error("Service field values must be bounded scalar values.");
    }
  }
  validateServiceRecords(structuredClone(value) as ServiceRecord[]);
}

function retainRevisions(previous: Revision[], revision: Revision): Revision[] {
  const retained = [...previous.slice(-19).map((item) => structuredClone(item)), revision];
  if (retained[0]?.parentId && !retained.some((item) => item.id === retained[0].parentId)) retained[0].parentId = null;
  return retained;
}

function archiveSchemaStructure(schema: ArchiveSchema): string {
  return JSON.stringify({
    profile: schema.profile,
    recordType: schema.recordType ?? "description",
    fields: schema.fields.map((field) => ({ id: field.id, kind: field.kind, required: field.required, repeatable: field.repeatable })),
  });
}

function revisionStateDigest(records: CatalogRecord[], config: LabConfig, archiveSchemas: ArchiveSchema[], archiveUnits: ArchiveUnit[], serviceRecords?: ServiceRecord[]): Promise<string> {
  return serviceRecords === undefined
    ? digestValue({ records, config, archiveSchemas, archiveUnits })
    : digestValue({ records, config, archiveSchemas, archiveUnits, serviceRecords });
}

async function appendAudit(
  workspace: Workspace,
  action: string,
  target: string,
  outcome: AuditEvent["outcome"],
): Promise<Workspace> {
  if (workspace.audit.length >= MAX_AUDIT_EVENTS) throw new Error("Audit capacity reached. Export this workspace and begin a successor before making another change.");
  const previousHash = workspace.audit.at(-1)?.hash ?? "GENESIS";
  const stateDigest = await workspaceStateDigest(workspace);
  const eventBase = {
    sequence: workspace.audit.length + 1,
    at: new Date().toISOString(),
    role: "Local operator",
    action,
    target: cleanText(target, 180),
    outcome,
    stateDigest,
    previousHash,
  };
  const hash = await digestValue(eventBase);
  return { ...workspace, audit: [...workspace.audit, { ...eventBase, hash }] };
}

export function workspaceStateDigest(workspace: Workspace): Promise<string> {
  const state = workspaceStateValue(workspace);
  // Audit state digests must survive JSON backup/export. JSON removes optional
  // properties whose value is undefined, so bind the portable representation.
  return digestValue(JSON.parse(JSON.stringify(state)));
}

function legacyWorkspaceStateDigest(workspace: Workspace): Promise<string> {
  return digestValue(workspaceStateValue(workspace));
}

function workspaceStateValue(workspace: Workspace) {
  return {
    schema: workspace.schema,
    version: workspace.version,
    name: workspace.name,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    activeRevisionId: workspace.activeRevisionId,
    revisions: workspace.revisions,
    incidents: workspace.incidents,
    ...(workspace.evidenceAuthority !== undefined ? { evidenceAuthority: workspace.evidenceAuthority } : {}),
    ...(workspace.evidenceApplications !== undefined ? { evidenceApplications: workspace.evidenceApplications } : {}),
  };
}

function isCatalogPacket(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = (value as Record<string, unknown>).schema;
  return schema === CATALOG_PACKET_SCHEMA || schema === LAB_SCHEMA;
}

function isJsonLd(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(isJsonLd);
  const item = value as Record<string, unknown>;
  return "@context" in item || "@graph" in item;
}

type ImportedRecord = Partial<Omit<CatalogRecord, "source" | "metadata">> & { metadata?: Partial<DescriptiveMetadata> };

function importedRecord(value: ImportedRecord, sourceFormat: Exclude<SourceFormat, "fixture">, label: string, digest: string, ordinal: number, elements: RecordElement[]): CatalogRecord {
  const fallback = `${sourceFormat.toUpperCase()}-${digest.slice(0, 12)}-${ordinal}`;
  const suppliedId = value.id === undefined ? "" : cleanText(value.id, 128);
  if (suppliedId && !SAFE_ID.test(suppliedId)) throw new Error(`Record ${ordinal} has an unsafe primary identifier.`);
  const id = suppliedId || fallback;
  const creators = value.creators ?? [];
  const contributors = value.contributors ?? [];
  const identifiers = value.identifiers ?? [];
  const links = value.links ?? [];
  if (creators.length > 50) throw new Error(`Record ${ordinal} exceeds 50 creators.`);
  if (contributors.length > 50) throw new Error(`Record ${ordinal} exceeds 50 contributors.`);
  if (identifiers.length > 50) throw new Error(`Record ${ordinal} exceeds 50 identifiers.`);
  if (links.length > 20) throw new Error(`Record ${ordinal} exceeds 20 links.`);
  if (elements.length > MAX_SOURCE_ELEMENTS) throw new Error(`Record ${ordinal} exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} source elements.`);
  const metadata = parseMetadata({ ...emptyMetadata(), ...(value.metadata ?? {}) });
  return {
    id,
    title: cleanText(value.title ?? "", 1024),
    creators: creators.map((item) => cleanText(item, 512)),
    contributors: contributors.map((item) => cleanText(item, 512)),
    year: cleanText(value.year ?? value.metadata?.issued?.slice(0, 4) ?? "", 16),
    format: value.format ?? "Other",
    identifiers: identifiers.map(parseIdentifier),
    links: links.map((item) => cleanText(item, 2048)),
    availability: value.availability ?? ((value.links?.length ?? 0) > 0 ? "Online" : "Check availability"),
    edition: cleanText(value.edition ?? "", 512),
    location: cleanText(value.location ?? ((value.links?.length ?? 0) > 0 ? "Online" : ""), 512),
    suppressed: value.suppressed ?? false,
    publicVisible: value.publicVisible ?? !(value.suppressed ?? false),
    requestable: value.requestable ?? false,
    metadata,
    source: { format: sourceFormat, label, digest, ordinal, trace: {}, elements },
  };
}

function sourceElement(code: string, value: unknown): RecordElement | null {
  if (value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return null;
  return element(cleanText(code, 64), "Source field", cleanText(text, 8192), "A source value retained for normalization review.");
}

function parseCslJson(value: unknown, label: string, digest: string): CatalogRecord[] {
  const list = Array.isArray(value) ? value : [value];
  if (!list.length || list.length > MAX_RECORDS) throw new Error("CSL-JSON must contain 1–1,000 items.");
  return list.map((raw, index) => {
    const item = asObject(raw, `CSL item ${index + 1} must be an object.`);
    assertNoJsonLdCarriersInCsl(item, index + 1);
    assertCanonicalCslIdentityKeys(item, index + 1);
    const names = (key: string) => Array.isArray(item[key]) ? (item[key] as unknown[]).map((entry) => { const name = asObject(entry, "CSL names must be objects."); return cleanText([name.literal, name.family, name.given].filter((part) => typeof part === "string").join(name.literal ? "" : name.family && name.given ? ", " : ""), 512); }) : [];
    const issued = cslDate(item.issued);
    const identifiers: Identifier[] = [];
    for (const [key, scheme] of [["DOI", "doi"], ["ISBN", "isbn"], ["ISSN", "issn"], ["PMID", "local"]] as const) {
      if (item[key] === undefined) continue;
      if (typeof item[key] !== "string" || !item[key].trim()) throw new Error(`CSL item ${index + 1} ${key} must be nonempty text when supplied.`);
      identifiers.push({ scheme, value: cleanText(item[key] as string, 256) });
    }
    if (item.URL !== undefined && (typeof item.URL !== "string" || !item.URL.trim())) throw new Error(`CSL item ${index + 1} URL must be nonempty text when supplied.`);
    const url = typeof item.URL === "string" ? cleanText(item.URL, 2048) : "";
    if (url) assertIdentityText(url, `CSL item ${index + 1} URL`);
    const suppliedId = cslPrimaryId(item.id, index + 1);
    const elements = Object.entries(item).map(([key, entry]) => sourceElement(key, entry)).filter((entry): entry is RecordElement => Boolean(entry));
    return importedRecord({ id: suppliedId, title: typeof item.title === "string" ? item.title : "", creators: names("author"), contributors: [...names("editor"), ...names("translator")], format: exactRecordFormat(toArray(item.genre).map(entityName)) ?? formatFromCsl(String(item.type ?? ""), Boolean(url)), identifiers, links: url ? [url] : [], year: issued.slice(0, 4), metadata: { issued, publisher: textValue(item.publisher), place: textValue(item["publisher-place"]), language: textValue(item.language), abstract: textValue(item.abstract), subjects: typeof item.keyword === "string" ? splitList(item.keyword) : [], containerTitle: textValue(item["container-title"]), volume: textValue(item.volume), issue: textValue(item.issue), pages: textValue(item.page) } }, "csl-json", label, digest, index + 1, elements);
  });
}

function assertCanonicalCslIdentityKeys(item: Record<string, unknown>, ordinal: number): void {
  const canonical = ["id", "DOI", "ISBN", "ISSN", "PMID", "URL"];
  assertCanonicalIdentityKeys(item, canonical, `CSL item ${ordinal}`);
}

function assertNoJsonLdCarriersInCsl(value: unknown, ordinal: number): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoJsonLdCarriersInCsl(entry, ordinal));
    return;
  }
  const item = value as Record<string, unknown>;
  const jsonLdCarriers = ["@context", "@graph", "@id", "identifier"];
  for (const key of Object.keys(item)) {
    if (containsUnicodeFormatControl(key)) throw new Error(`CSL item ${ordinal} contains a property name with unsupported Unicode format or bidirectional controls.`);
    const alias = canonicalIdentityKey(key, jsonLdCarriers);
    if (alias) throw new Error(`CSL item ${ordinal} contains JSON-LD declaration or identity key ${key}; ${alias} is not accepted in CSL-JSON.`);
  }
  Object.values(item).forEach((entry) => assertNoJsonLdCarriersInCsl(entry, ordinal));
}

function cslPrimaryId(value: unknown, ordinal: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    if (!value.trim()) throw new Error(`CSL item ${ordinal} id must be nonempty when supplied.`);
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error(`CSL item ${ordinal} id must be nonempty text or a nonnegative safe integer.`);
}

function parseJsonLd(value: unknown, label: string, digest: string): CatalogRecord[] {
  const root = Array.isArray(value) ? value : asObject(value, "JSON-LD root must be an object.");
  const graphRoot = !Array.isArray(root) && Object.hasOwn(root, "@graph") ? root : null;
  assertCanonicalIdentityKeysDeep(root, ["@context", "@graph", "@id", "identifier", "url"], "JSON-LD");
  if (!Array.isArray(root) && Object.hasOwn(root, "@graph") && !Array.isArray(root["@graph"])) {
    throw new Error("JSON-LD @graph must be an array when supplied.");
  }
  if (graphRoot) exactKeys(graphRoot, ["@context", "@graph"]);
  assertNoNestedJsonLdGraphs(root, graphRoot);
  const list = Array.isArray(root) ? root : Array.isArray(root["@graph"]) ? root["@graph"] as unknown[] : [root];
  if (!list.length || list.length > MAX_RECORDS) throw new Error("JSON-LD must contain 1–1,000 resources.");
  validateJsonLdContext(root, list);
  return list.map((raw, index) => {
    const item = asObject(raw, `JSON-LD resource ${index + 1} must be an object.`);
    assertCanonicalIdentityKeys(item, ["@context", "@graph", "@id", "identifier", "url"], `JSON-LD resource ${index + 1}`);
    const names = (key: string) => toArray(item[key]).map((entry) => typeof entry === "string" ? entry : textValue(asObject(entry, "JSON-LD name must be text or an object.").name)).filter(Boolean);
    const links = toArray(item.url).map((entry) => {
      if (typeof entry === "string") {
        const link = cleanText(entry, 2048);
        assertIdentityText(link, "JSON-LD URL");
        return link;
      }
      const link = asObject(entry, "JSON-LD URL values must be text or objects with @id.");
      assertCanonicalIdentityKeys(link, ["@id"], "JSON-LD URL object");
      exactKeys(link, ["@id"]);
      if (typeof link["@id"] !== "string") throw new Error("JSON-LD URL objects require a text @id.");
      const identity = cleanText(link["@id"], 2048);
      assertIdentityText(identity, "JSON-LD URL object @id");
      return identity;
    });
    const nativeId = jsonLdPrimaryId(item["@id"], index + 1, links);
    const identifiers = parseLooseIdentifiers(item.identifier);
    const elements = Object.entries(item).map(([key, entry]) => sourceElement(key, entry)).filter((entry): entry is RecordElement => Boolean(entry));
    return importedRecord({ id: nativeId, title: textValue(item.name) || textValue(item.headline), creators: names("author"), contributors: names("contributor"), format: exactRecordFormat(toArray(item.additionalType).map(entityName)) ?? formatFromSchema(textValue(item["@type"]), Boolean(links.length)), identifiers, links, year: textValue(item.datePublished).slice(0, 4), metadata: { issued: textValue(item.datePublished), created: textValue(item.dateCreated), modified: textValue(item.dateModified), publisher: entityName(item.publisher), language: textValue(item.inLanguage), subjects: toArray(item.keywords ?? item.about).map(entityName).filter(Boolean), abstract: textValue(item.description), rights: textValue(item.copyrightNotice), license: typeof item.license === "string" ? item.license : "" } }, "jsonld", label, digest, index + 1, elements);
  });
}

function canonicalIdentityKey(key: string, canonical: readonly string[]): string | undefined {
  const skeleton = key.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase();
  return canonical.find((candidate) => candidate.toLowerCase() === skeleton);
}

function assertCanonicalIdentityKeys(item: Record<string, unknown>, canonical: readonly string[], label: string): void {
  for (const key of Object.keys(item)) {
    if (containsUnicodeFormatControl(key)) throw new Error(`${label} contains a property name with unsupported Unicode format or bidirectional controls.`);
    const alias = canonicalIdentityKey(key, canonical);
    if (alias && key !== alias) throw new Error(`${label} uses deceptive identity or declaration key ${key}; use the canonical ${alias} key.`);
  }
}

function assertCanonicalIdentityKeysDeep(value: unknown, canonical: readonly string[], label: string): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => assertCanonicalIdentityKeysDeep(entry, canonical, label));
    return;
  }
  const item = value as Record<string, unknown>;
  assertCanonicalIdentityKeys(item, canonical, label);
  Object.values(item).forEach((entry) => assertCanonicalIdentityKeysDeep(entry, canonical, label));
}

function assertNoNestedJsonLdGraphs(value: unknown, allowedRoot: Record<string, unknown> | null): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoNestedJsonLdGraphs(entry, allowedRoot));
    return;
  }
  const item = value as Record<string, unknown>;
  if (item !== allowedRoot && Object.hasOwn(item, "@graph")) throw new Error("Nested JSON-LD @graph declarations are not accepted.");
  Object.values(item).forEach((entry) => assertNoNestedJsonLdGraphs(entry, allowedRoot));
}

function validateJsonLdContext(root: unknown[] | Record<string, unknown>, list: unknown[]): void {
  const accepted = new Set(["https://schema.org", "https://schema.org/"]);
  const requireContext = (value: unknown, label: string): void => {
    const item = asObject(value, `${label} must be an object.`);
    if (typeof item["@context"] !== "string" || !accepted.has(item["@context"] as string)) {
      throw new Error(`${label} must declare the supported https://schema.org JSON-LD context; object, array, aliased, and remote contexts are not accepted.`);
    }
  };
  if (Array.isArray(root)) {
    root.forEach((item, index) => requireContext(item, `JSON-LD resource ${index + 1}`));
  } else {
    requireContext(root, "JSON-LD root");
    if (Array.isArray(root["@graph"])) {
      for (const [index, raw] of list.entries()) {
        const item = asObject(raw, `JSON-LD resource ${index + 1} must be an object.`);
        if (Object.hasOwn(item, "@context")) throw new Error(`JSON-LD resource ${index + 1} may not override the root context.`);
      }
    }
  }
  const allowedContexts = new Set<object>(Array.isArray(root) ? root.filter((item): item is object => Boolean(item) && typeof item === "object") : [root]);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (!allowedContexts.has(value as object) && Object.hasOwn(value as object, "@context")) throw new Error("Nested JSON-LD context overrides are not accepted.");
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(root);
}

function jsonLdPrimaryId(value: unknown, ordinal: number, links: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`JSON-LD resource ${ordinal} @id must be nonempty text when supplied.`);
  const cleaned = cleanText(value, 2048);
  assertIdentityText(cleaned, `JSON-LD resource ${ordinal} @id`);
  const native = nativeIdentityPayload(cleaned, `JSON-LD resource ${ordinal} @id`);
  if (native !== null) return native;
  if (/^https:\/\//i.test(cleaned)) {
    links.push(cleaned);
    return undefined;
  }
  throw new Error(`JSON-LD resource ${ordinal} @id must be an IN KEEPING identity URN or a public HTTPS IRI.`);
}

function nativeIdentityPayload(value: string, label: string): string | null {
  assertIdentityText(value, label);
  const match = value.match(/^urn:in-keeping:(.*)$/i);
  if (!match) {
    if (/^urn:in-keeping:/i.test(value.normalize("NFKC"))) {
      throw new Error(`${label} uses a Unicode lookalike for the IN KEEPING identity wrapper.`);
    }
    return null;
  }
  const payload = cleanText(match[1], 128);
  if (!payload || !SAFE_ID.test(payload)) throw new Error(`${label} contains an empty or unsafe IN KEEPING identity.`);
  return payload;
}

function* sourceLines(text: string): Generator<{ line: string; lineNumber: number; terminal: boolean }> {
  let start = 0;
  let lineNumber = 1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== "\n" && character !== "\r") continue;
    yield { line: text.slice(start, index), lineNumber, terminal: false };
    if (character === "\r" && text[index + 1] === "\n") index += 1;
    start = index + 1;
    lineNumber += 1;
  }
  yield { line: text.slice(start), lineNumber, terminal: start === text.length };
}

function parseRis(text: string, label: string, digest: string): CatalogRecord[] {
  const chunks: { line: string; lineNumber: number }[][] = [];
  let current: { line: string; lineNumber: number }[] = [];
  let separated = false;
  for (const { line: rawLine, lineNumber, terminal } of sourceLines(text)) {
    if (rawLine === "") {
      if (terminal) continue;
      if (current.length) throw new Error(`RIS line ${lineNumber} is blank inside a record; blank lines are accepted only as single separators after ER  -.`);
      if (!chunks.length || separated) throw new Error(`RIS line ${lineNumber} is an unexpected blank line; use at most one blank separator between complete records.`);
      separated = true;
      continue;
    }
    separated = false;
    if (/^ER {2}-[ \t]*$/.test(rawLine)) {
      if (!current.length) throw new Error(`RIS line ${lineNumber} terminates an empty record.`);
      chunks.push(current);
      current = [];
      if (chunks.length > MAX_RECORDS) throw new Error("RIS exceeds 1,000 records.");
      continue;
    }
    if (current.length >= MAX_SOURCE_ELEMENTS - 1) throw new Error(`RIS record ${chunks.length + 1} exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} retained source elements including ER.`);
    current.push({ line: rawLine, lineNumber });
  }
  if (current.length) throw new Error(`RIS record ${chunks.length + 1} does not end with ER  -.`);
  if (!chunks.length) throw new Error("RIS must contain 1–1,000 records, each ending with ER  -.");
  return chunks.map((chunk, index) => {
    const map = new Map<string, string[]>();
    const elements: RecordElement[] = [];
    const orderedFields: { code: string; value: string }[] = [];
    for (const { line, lineNumber } of chunk) {
      const match = line.match(/^([A-Z0-9]{2}) {2}- ?(.*)$/);
      if (!match) throw new Error(`RIS record ${index + 1}, line ${lineNumber} is not a tagged field.`);
      if (match[1] === "ER") throw new Error(`RIS record ${index + 1}, line ${lineNumber} has data after ER; ER must be the record terminator.`);
      if (elements.length >= MAX_SOURCE_ELEMENTS - 1) throw new Error(`RIS record ${index + 1} exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} retained source elements including ER.`);
      const value = cleanText(match[2], 8192);
      const mapped = map.get(match[1]);
      if (mapped) mapped.push(value); else map.set(match[1], [value]);
      orderedFields.push({ code: match[1], value });
      elements.push(element(match[1], risFieldName(match[1]), value, "A tagged RIS source value."));
    }
    if (chunk[0].line.slice(0, 2) !== "TY" || (map.get("TY")?.length ?? 0) !== 1 || !map.get("TY")?.[0]) {
      throw new Error(`RIS record ${index + 1} must begin with exactly one nonempty TY field.`);
    }
    const sourceIds = map.get("ID") ?? [];
    if (sourceIds.length > 1) throw new Error(`RIS record ${index + 1} contains contradictory duplicate singular ID fields.`);
    if (sourceIds.length === 1) assertIdentityText(sourceIds[0], `RIS record ${index + 1} ID`);
    for (const tag of ["DO", "SN"] as const) {
      for (const value of map.get(tag) ?? []) {
        if (!value) throw new Error(`RIS record ${index + 1} ${tag} values must be nonempty when supplied.`);
        assertIdentityText(value, `RIS record ${index + 1} ${tag}`);
      }
    }
    const first = (key: string) => map.get(key)?.[0] ?? "";
    const identifiers: Identifier[] = [
      ...(map.get("DO") ?? []).map((value) => ({ scheme: "doi" as const, value })),
      ...(map.get("SN") ?? []).map((value) => ({ scheme: /^\d{4}-?\d{3}[\dX]$/i.test(value) ? "issn" as const : "isbn" as const, value })),
    ];
    elements.push(element("ER", "End of reference", "", "The source record terminator."));
    return importedRecord({ id: first("ID"), title: first("TI") || first("T1") || first("CT"), creators: orderedFields.filter((field) => field.code === "AU" || field.code === "A1").map((field) => field.value), contributors: orderedFields.filter((field) => field.code === "A2").map((field) => field.value), year: (first("PY") || first("Y1")).slice(0, 4), format: exactRecordFormat([first("M3")]) ?? formatFromRis(first("TY")), identifiers, links: [...(map.get("UR") ?? [])], edition: first("ET"), metadata: { issued: first("PY") || first("Y1"), publisher: first("PB"), place: first("CY"), language: first("LA"), subjects: map.get("KW") ?? [], abstract: first("AB") || first("N2"), rights: first("C1"), series: first("T3"), containerTitle: first("T2") || first("JO") || first("JF"), volume: first("VL"), issue: first("IS"), pages: [first("SP"), first("EP")].filter(Boolean).join("–"), notes: map.get("N1") ?? [] } }, "ris", label, digest, index + 1, elements);
  });
}

function parseBibtex(text: string, label: string, digest: string): CatalogRecord[] {
  const entries = parseBibtexSource(text);
  return entries.map((entry, index) => {
    const fields = Object.fromEntries(Object.entries(entry.fields).map(([key, value]) => [key, decodeBibtexText(value)]));
    const identifiers: Identifier[] = [["doi", "doi"], ["isbn", "isbn"], ["issn", "issn"]].flatMap(([key, scheme]) => fields[key] ? [{ scheme: scheme as Identifier["scheme"], value: fields[key] }] : []);
    const elements = [
      element("entry-type", "BibTeX entry type", entry.type, "The source entry type."),
      element("citation-key", "BibTeX citation key", entry.key, "The source citation key."),
      ...Object.entries(entry.fields).map(([code, value]) => element(code, "BibTeX field", value, "A named BibTeX source field.")),
    ];
    return importedRecord({ id: entry.key, title: fields.title ?? "", creators: splitBibtexNames(entry.fields.author), contributors: splitBibtexNames(entry.fields.editor), year: fields.year ?? fields.date?.slice(0, 4) ?? "", format: exactRecordFormat([fields.type ?? ""]) ?? formatFromBib(entry.type), identifiers, links: fields.url ? [fields.url] : [], edition: fields.edition ?? "", metadata: { issued: fields.date ?? fields.year ?? "", publisher: fields.publisher ?? "", place: fields.address ?? "", language: fields.language ?? "", subjects: splitList(fields.keywords), abstract: fields.abstract ?? "", rights: fields.copyright ?? "", series: fields.series ?? "", containerTitle: fields.journal ?? fields.booktitle ?? "", volume: fields.volume ?? "", issue: fields.number ?? "", pages: fields.pages ?? "", notes: splitList(fields.note) } }, "bibtex", label, digest, index + 1, elements);
  });
}

type ParsedBibtexEntry = { type: string; key: string; fields: Record<string, string> };

function parseBibtexSource(text: string): ParsedBibtexEntry[] {
  let index = 0;
  const entries: ParsedBibtexEntry[] = [];

  const skipSpaceAndComments = () => {
    while (index < text.length) {
      if (/\s/.test(text[index])) { index += 1; continue; }
      if (text[index] === "%") {
        while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
        if (text[index] === "\r" && text[index + 1] === "\n") index += 2;
        else if (index < text.length) index += 1;
        continue;
      }
      break;
    }
  };

  const word = (label: string, maximum: number) => {
    const start = index;
    while (index < text.length && /[A-Za-z0-9_:-]/.test(text[index])) index += 1;
    if (start === index) throw new Error(`BibTeX ${label} is missing near character ${index + 1}.`);
    const result = text.slice(start, index);
    if (result.length > maximum) throw new Error(`BibTeX ${label} exceeds ${maximum} characters.`);
    return result;
  };

  const value = (): string => {
    const opening = text[index];
    if (opening === "{") {
      index += 1;
      let depth = 1;
      let result = "";
      while (index < text.length && depth) {
        const character = text[index++];
        if (character === "\\" && index < text.length) { result += character + text[index++]; continue; }
        if (character === "{") { depth += 1; if (depth > 64) throw new Error("BibTeX value nesting exceeds 64 levels."); result += character; continue; }
        if (character === "}") { depth -= 1; if (depth) result += character; continue; }
        result += character;
        if (result.length > 8192) throw new Error("BibTeX field exceeds 8,192 characters.");
      }
      if (depth) throw new Error("BibTeX braced value is not terminated.");
      return cleanText(result, 8192);
    }
    if (opening === '"') {
      index += 1;
      let result = "";
      let terminated = false;
      let braceDepth = 0;
      while (index < text.length) {
        const character = text[index++];
        if (character === "\\" && index < text.length) { result += character + text[index++]; continue; }
        if (character === "{") { braceDepth += 1; if (braceDepth > 64) throw new Error("BibTeX value nesting exceeds 64 levels."); result += character; continue; }
        if (character === "}") { if (braceDepth === 0) throw new Error("BibTeX quoted value contains an unbalanced closing brace."); braceDepth -= 1; result += character; continue; }
        if (character === '"') { if (braceDepth) throw new Error("BibTeX quoted value contains unbalanced braces."); terminated = true; break; }
        result += character;
        if (result.length > 8192) throw new Error("BibTeX field exceeds 8,192 characters.");
      }
      if (braceDepth) throw new Error("BibTeX quoted value contains unbalanced braces.");
      if (!terminated) throw new Error("BibTeX quoted value is not terminated.");
      return cleanText(result, 8192);
    }
    const start = index;
    while (index < text.length && /[0-9]/.test(text[index])) index += 1;
    if (start === index) throw new Error("BibTeX values must be braced, quoted, or numeric; macros and concatenation are not accepted.");
    return text.slice(start, index);
  };

  while (true) {
    skipSpaceAndComments();
    if (index >= text.length) break;
    if (text[index] !== "@") throw new Error(`BibTeX contains unexpected text near character ${index + 1}.`);
    index += 1;
    const type = word("entry type", 32).toLowerCase();
    if (["comment", "preamble", "string"].includes(type)) throw new Error(`BibTeX @${type} directives are not accepted; resolve macros before import.`);
    skipSpaceAndComments();
    const opening = text[index++];
    if (opening !== "{" && opening !== "(") throw new Error("BibTeX entry must open with { or (.");
    const closing = opening === "{" ? "}" : ")";
    const keyStart = index;
    while (index < text.length && text[index] !== "," && text[index] !== closing) index += 1;
    const key = cleanText(text.slice(keyStart, index), 128);
    if (!key || text[index] !== ",") throw new Error("BibTeX entry requires a citation key followed by a comma.");
    if (!SAFE_ID.test(key)) throw new Error("BibTeX citation keys must use 1–128 letters, numbers, dots, colons, underscores, or hyphens.");
    index += 1;
    const fields: Record<string, string> = Object.create(null) as Record<string, string>;
    let fieldCount = 0;

    while (true) {
      skipSpaceAndComments();
      if (text[index] === closing) { index += 1; break; }
      if (fieldCount >= MAX_SOURCE_ELEMENTS - 2) throw new Error(`BibTeX entry exceeds ${MAX_SOURCE_ELEMENTS - 2} fields and the ${MAX_SOURCE_ELEMENTS.toLocaleString()}-element source-evidence limit.`);
      const name = word("field name", 64).toLowerCase();
      if (Object.hasOwn(fields, name)) throw new Error(`BibTeX field ${name} is duplicated.`);
      skipSpaceAndComments();
      if (text[index++] !== "=") throw new Error(`BibTeX field ${name} requires =.`);
      skipSpaceAndComments();
      fields[name] = value();
      fieldCount += 1;
      skipSpaceAndComments();
      if (text[index] === "#") throw new Error("BibTeX string concatenation is not accepted; resolve it before import.");
      if (text[index] === ",") { index += 1; continue; }
      if (text[index] === closing) continue;
      throw new Error(`BibTeX field ${name} must end with a comma or the entry delimiter.`);
    }

    entries.push({ type, key, fields });
    if (entries.length > MAX_RECORDS) throw new Error("BibTeX exceeds 1,000 entries.");
  }

  if (!entries.length) throw new Error("BibTeX contains no entries.");
  return entries;
}

function parseDelimited(text: string, label: string, digest: string, delimiter: "," | "\t"): CatalogRecord[] {
  const rows = parseRows(text, delimiter);
  if (rows.length < 2 || rows.length - 1 > MAX_RECORDS) throw new Error("Delimited data must contain a header and 1–1,000 records.");
  const headers = rows[0].map((value) => value.trim().toLowerCase().replace(/[ -]+/g, "_"));
  if (headers.some((header) => !header)) throw new Error("Delimited headers must be nonempty.");
  if (new Set(headers).size !== headers.length) throw new Error("Delimited headers must be unique after normalization.");
  const mismatchedRow = rows.slice(1).findIndex((row) => row.length !== headers.length);
  if (mismatchedRow >= 0) throw new Error(`Delimited row ${mismatchedRow + 2} has ${rows[mismatchedRow + 1].length} cells; expected ${headers.length}.`);
  const allowed = new Set(["in_keeping_tabular_version", "id", "title", "creators", "contributors", "year", "issued", "created", "modified", "format", "identifiers", "links", "publisher", "place", "language", "subjects", "genres", "abstract", "rights", "license", "series", "container_title", "volume", "issue", "pages", "extent", "audience", "coverage", "relations", "notes", "availability", "edition", "location", "suppressed", "public_visible", "requestable"]);
  const unknown = headers.find((header) => !allowed.has(header)); if (unknown) throw new Error(`Unknown delimited column: ${unknown}.`);
  if (!headers.includes("title")) throw new Error("Delimited data requires a title column.");
  return rows.slice(1).map((row, index) => {
    const versionIndex = headers.indexOf("in_keeping_tabular_version");
    const version = versionIndex >= 0 ? cleanText(row[versionIndex] ?? "", 16) : "";
    if (versionIndex >= 0 && version !== "1") throw new Error(`Delimited row ${index + 2} has an unsupported IN KEEPING tabular version.`);
    const item = Object.fromEntries(headers.map((header, i) => [header, cleanText(version === "1" && header !== "in_keeping_tabular_version" ? decodeVersionedTabularCell(row[i] ?? "", delimiter) : row[i] ?? "", 8192)]));
    const format = formatFromText(item.format);
    const elements = headers.map((header, i) => element(header, "Delimited field", row[i] ?? "", "A column value from the imported table."));
    const list: (value: string | undefined, field: string) => string[] = version === "1" ? parseVersionedTabularList : (value: string | undefined) => splitList(value);
    return importedRecord({ id: item.id, title: item.title, creators: list(item.creators, "creators"), contributors: list(item.contributors, "contributors"), year: item.year, format, identifiers: version === "1" ? parseVersionedTabularIdentifiers(item.identifiers) : parseIdentifierList(item.identifiers), links: list(item.links, "links"), availability: availabilityFromText(item.availability), edition: item.edition, location: item.location, suppressed: strictBoolText(item.suppressed, "suppressed", false), publicVisible: strictBoolText(item.public_visible, "public_visible", true), requestable: strictBoolText(item.requestable, "requestable", false), metadata: { issued: item.issued, created: item.created, modified: item.modified, publisher: item.publisher, place: item.place, language: item.language, subjects: list(item.subjects, "subjects"), genres: list(item.genres, "genres"), abstract: item.abstract, rights: item.rights, license: item.license, series: item.series, containerTitle: item.container_title, volume: item.volume, issue: item.issue, pages: item.pages, extent: item.extent, audience: item.audience, coverage: item.coverage, relations: list(item.relations, "relations"), notes: list(item.notes, "notes") } }, delimiter === "\t" ? "tsv" : "csv", label, digest, index + 1, elements);
  });
}

function parseMarcText(text: string, label: string, digest: string): CatalogRecord[] {
  const chunks: { line: string; lineNumber: number }[][] = [];
  let current: { line: string; lineNumber: number }[] = [];
  for (const { line, lineNumber, terminal } of sourceLines(text)) {
    if (line === "") {
      if (terminal) continue;
      if (!current.length) throw new Error(`MARC mnemonic line ${lineNumber} is an unexpected blank line; use at most one blank separator between complete records.`);
      chunks.push(current);
      current = [];
      if (chunks.length > MAX_RECORDS) throw new Error("MARC mnemonic exceeds 1,000 records.");
      continue;
    }
    if (/^=LDR {2}/.test(line)) {
      if (current.length) chunks.push(current);
      current = [{ line, lineNumber }];
      if (chunks.length >= MAX_RECORDS) throw new Error("MARC mnemonic exceeds 1,000 records.");
      continue;
    }
    if (!current.length) throw new Error(`MARC mnemonic line ${lineNumber} appears before a valid =LDR record leader.`);
    if (current.length >= MAX_SOURCE_ELEMENTS) throw new Error(`MARC mnemonic record ${chunks.length + 1} exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} retained source elements.`);
    current.push({ line, lineNumber });
  }
  if (current.length) chunks.push(current);
  if (!chunks.length) throw new Error("MARC mnemonic must contain 1–1,000 records beginning with =LDR.");
  return chunks.map((chunk, index) => {
    const map = new Map<string, { indicators: string; entries: { code: string; value: string }[]; subfields: Map<string, string[]>; value: string }[]>();
    const elements: RecordElement[] = [];
    for (const { line, lineNumber } of chunk) {
      const match = line.match(/^=(LDR|\d{3}) {2}(.*)$/);
      if (!match) throw new Error(`MARC mnemonic record ${index + 1}, line ${lineNumber} is malformed.`);
      const tag = match[1], body = match[2];
      if (tag === "LDR" || /^00[1-9]$/.test(tag)) {
        if (tag === "LDR" && !validMarcLeader(body)) throw new Error(`MARC mnemonic record ${index + 1}, line ${lineNumber} has an invalid 24-character MARC21 leader.`);
        if (elements.length >= MAX_SOURCE_ELEMENTS) throw new Error(`MARC mnemonic record ${index + 1} exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} retained source elements.`);
        const mapped = map.get(tag);
        const field = { indicators: "", entries: [], subfields: new Map<string, string[]>(), value: sourceText(body, 8192) };
        if (mapped) mapped.push(field); else map.set(tag, [field]);
        elements.push(element(tag, marcElementName(tag), body, marcElementDefinition(tag)));
        continue;
      }
      if (Number(tag) < 10) throw new Error(`MARC mnemonic record ${index + 1}, line ${lineNumber} has an invalid control field tag.`);
      const { indicators, entries, subfields } = parseMarcMnemonicDataField(body, index + 1, lineNumber, MAX_SOURCE_ELEMENTS - elements.length);
      for (const entry of entries) elements.push(element(`${tag} ${indicators} $${entry.code}`, marcElementName(tag), entry.value, marcElementDefinition(tag)));
      const mapped = map.get(tag);
      const field = { indicators, entries, subfields, value: "" };
      if (mapped) mapped.push(field); else map.set(tag, [field]);
    }
    if ((map.get("LDR")?.length ?? 0) !== 1) throw new Error(`MARC mnemonic record ${index + 1} must contain exactly one leader.`);
    const values = (tag: string, code: string) => (map.get(tag) ?? []).flatMap((field) => field.subfields.get(code) ?? []);
    const fields = (tag: string) => map.get(tag) ?? [];
    const control = (tag: string) => map.get(tag)?.[0]?.value ?? "";
    for (const tag of ["001", "003"]) {
      const occurrences = fields(tag);
      if (occurrences.length > 1) throw new Error(`MARC mnemonic record ${index + 1} contains duplicate singular ${tag} control fields.`);
      if (occurrences.length === 1) assertIdentityText(occurrences[0].value, `MARC mnemonic record ${index + 1} ${tag}`);
    }
    for (const tag of ["020", "022", "024"]) {
      for (const field of fields(tag)) {
        if ((field.subfields.get("a")?.length ?? 0) > 1) throw new Error(`MARC mnemonic record ${index + 1} ${tag} contains repeated nonrepeatable $a within one field.`);
        if (tag === "024" && (field.subfields.get("2")?.length ?? 0) > 1) throw new Error(`MARC mnemonic record ${index + 1} 024 contains repeated nonrepeatable $2 within one field.`);
        for (const value of field.subfields.get("a") ?? []) assertIdentityText(value, `MARC mnemonic record ${index + 1} ${tag} $a`);
        if (tag === "024") {
          for (const value of field.subfields.get("2") ?? []) assertIdentityText(value, `MARC mnemonic record ${index + 1} 024 $2`);
          marc024Scheme(field.indicators[0], field.indicators[1], field.subfields.get("2")?.[0] ?? "", `MARC mnemonic record ${index + 1} 024`);
        }
      }
    }
    const leader = control("LDR");
    const trace = { "001": control("001"), "003": control("003"), "LDR/06": leader[6] ?? "", "LDR/07": leader[7] ?? "", "336$b": values("336", "b")[0] ?? "", "337$b": values("337", "b")[0] ?? "", "338$b": values("338", "b")[0] ?? "", "999$a": values("999", "a")[0] ?? "" };
    const links = values("856", "u");
    const additionalNames = ["700", "720"].flatMap((tag) => fields(tag)).map((field) => ({ name: field.subfields.get("a")?.[0] ?? "", role: (field.subfields.get("e")?.[0] ?? "").toLowerCase() })).filter((entry) => entry.name);
    const identifiers: Identifier[] = [
      ...values("020", "a").map((value) => ({ scheme: "isbn" as const, value: marc020IdentifierValue(value) })),
      ...values("022", "a").map((value) => ({ scheme: "issn" as const, value })),
      ...fields("024").flatMap((field) => (field.subfields.get("a") ?? []).map((value) => ({ scheme: marc024Scheme(field.indicators[0], field.indicators[1], field.subfields.get("2")?.[0] ?? "", `MARC mnemonic record ${index + 1} 024`), value }))),
    ];
    const title = fields("245").flatMap((field) => field.entries.filter((entry) => entry.code === "a" || entry.code === "b").map((entry) => entry.value)).join(" ");
    const declaredFormats = fields("655")
      .filter((field) => field.subfields.get("2")?.some((value) => value.toLowerCase() === "in-keeping"))
      .flatMap((field) => field.subfields.get("a") ?? []);
    const genres = fields("655")
      .filter((field) => !field.subfields.get("2")?.some((value) => value.toLowerCase() === "in-keeping"))
      .flatMap((field) => field.subfields.get("a") ?? []);
    const issued = values("264", "c")[0] || values("260", "c")[0] || "";
    const record = importedRecord({ id: control("001"), title, creators: [...values("100", "a"), ...additionalNames.filter((entry) => /^(?:author|creator|composer|artist)$/i.test(entry.role)).map((entry) => entry.name)], contributors: additionalNames.filter((entry) => !/^(?:author|creator|composer|artist)$/i.test(entry.role)).map((entry) => entry.name), year: issued.slice(0, 4) || control("008").slice(7, 11), format: marcFormat(trace, genres, declaredFormats), identifiers, links, edition: values("250", "a")[0] ?? "", location: values("852", "b")[0] ?? "", metadata: { issued, publisher: values("264", "b")[0] || values("260", "b")[0] || "", place: values("264", "a")[0] || values("260", "a")[0] || "", language: values("041", "a")[0] ?? "", subjects: values("650", "a"), genres, abstract: values("520", "a")[0] ?? "", extent: values("300", "a")[0] ?? "", notes: values("500", "a") } }, "marc-text", label, digest, index + 1, elements);
    record.source.trace = trace; return record;
  });
}

function parseMarcMnemonicDataField(body: string, recordNumber: number, lineNumber: number, maximumEntries: number): { indicators: string; entries: { code: string; value: string }[]; subfields: Map<string, string[]> } {
  if (body.length < 3) throw new Error(`MARC mnemonic record ${recordNumber}, line ${lineNumber} has no subfield.`);
  const rawIndicators = body.slice(0, 2);
  if (!/^[A-Za-z0-9#\\ ]{2}$/.test(rawIndicators)) throw new Error(`MARC mnemonic record ${recordNumber}, line ${lineNumber} has invalid indicators.`);
  const indicators = rawIndicators.replace(/[\\ ]/g, "#");
  const source = body.slice(2);
  if (!source.startsWith("$")) throw new Error(`MARC mnemonic record ${recordNumber}, line ${lineNumber} contains text before its first subfield.`);
  const entries: { code: string; value: string }[] = [];
  const subfields = new Map<string, string[]>();
  let index = 0;
  while (index < source.length) {
    if (entries.length >= maximumEntries) throw new Error(`MARC mnemonic record ${recordNumber} exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} retained source elements.`);
    if (source[index] !== "$") throw new Error(`MARC mnemonic record ${recordNumber}, line ${lineNumber} has malformed subfield data.`);
    index += 1;
    const code = source[index++];
    if (!/^[a-z0-9]$/.test(code ?? "")) throw new Error(`MARC mnemonic record ${recordNumber}, line ${lineNumber} has an invalid subfield code.`);
    let value = "";
    while (index < source.length && source[index] !== "$") {
      if (source[index] === "\\" && (source[index + 1] === "$" || source[index + 1] === "\\")) {
        value += source[index + 1];
        index += 2;
      } else {
        value += source[index++];
      }
      if (value.length > 8192) throw new Error(`MARC mnemonic record ${recordNumber}, line ${lineNumber} contains a subfield longer than 8,192 characters.`);
    }
    const normalized = cleanText(value, 8192);
    entries.push({ code, value: normalized });
    const mapped = subfields.get(code);
    if (mapped) mapped.push(normalized); else subfields.set(code, [normalized]);
  }
  return { indicators, entries, subfields };
}

function parseJsonPacket(parsed: unknown, label: string, digest: string): CatalogRecord[] {
  inspectJson(parsed, 0);
  const root = asObject(parsed, "Packet must be an object.");
  exactKeys(root, ["schema", "version", "kind", "provenance", "records"]);
  if (![CATALOG_PACKET_SCHEMA, LAB_SCHEMA].includes(String(root.schema)) || root.version !== LAB_VERSION || root.kind !== "catalog-batch") throw new Error("Unsupported packet schema, version, or kind.");
  const provenance = asObject(root.provenance, "Packet provenance must be an object.");
  exactKeys(provenance, ["label", "exportedAt", "revision"]);
  if ("label" in provenance) readString(provenance.label, 180, "provenance label");
  if ("exportedAt" in provenance) readDate(provenance.exportedAt, "provenance exportedAt");
  if ("revision" in provenance) readString(provenance.revision, 128, "provenance revision");
  if (!Array.isArray(root.records) || root.records.length < 1 || root.records.length > MAX_RECORDS) throw new Error("Packet must contain 1–1,000 records.");
  return root.records.map((value, index) => parseJsonRecord(value, label, digest, index + 1));
}

function packetSourceElements(record: Record<string, unknown>): RecordElement[] {
  const elements: RecordElement[] = [];
  const append = (code: string, value: unknown): void => {
    if (Array.isArray(value)) {
      if (!value.length) {
        const retained = sourceElement(code, value);
        if (retained) elements.push(retained);
        return;
      }
      value.forEach((entry, index) => append(`${code}[${index + 1}]`, entry));
      return;
    }
    const retained = sourceElement(code, value);
    if (retained) elements.push(retained);
  };
  for (const [code, value] of Object.entries(record)) {
    if (code === "metadata" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [metadataCode, metadataValue] of Object.entries(value as Record<string, unknown>)) append(`metadata.${metadataCode}`, metadataValue);
    } else append(code, value);
  }
  if (elements.length > MAX_SOURCE_ELEMENTS) throw new Error(`Packet record exceeds ${MAX_SOURCE_ELEMENTS.toLocaleString()} retained source elements.`);
  return elements;
}

function parseJsonRecord(value: unknown, label: string, digest: string, ordinal: number): CatalogRecord {
  const record = asObject(value, `Record ${ordinal} must be an object.`);
  exactKeys(record, ["id", "title", "creators", "contributors", "year", "format", "identifiers", "links", "availability", "edition", "location", "suppressed", "publicVisible", "requestable", "metadata"]);
  if (!Array.isArray(record.creators) || !Array.isArray(record.identifiers) || !Array.isArray(record.links)) throw new Error(`Record ${ordinal} has invalid arrays.`);
  if (record.creators.length > 50) throw new Error(`Record ${ordinal} exceeds 50 creators.`);
  if (record.contributors !== undefined && (!Array.isArray(record.contributors) || record.contributors.length > 50)) throw new Error(`Record ${ordinal} exceeds 50 contributors.`);
  if (record.identifiers.length > 50) throw new Error(`Record ${ordinal} exceeds 50 identifiers.`);
  if (record.links.length > 20) throw new Error(`Record ${ordinal} exceeds 20 links.`);
  const formats: RecordFormat[] = ["Article", "Book", "Online book", "Book chapter", "Conference paper", "Serial", "Newspaper", "Video", "Audio", "Image", "Map", "Score", "Dataset", "Software", "Website", "Report", "Thesis", "Manuscript", "Archival collection", "Other"];
  const availability: Availability[] = ["Available", "Online", "Unavailable", "Check availability"];
  if (!formats.includes(record.format as RecordFormat) || !availability.includes(record.availability as Availability)) throw new Error(`Record ${ordinal} has invalid format or availability.`);
  return {
    id: readString(record.id, 128, "id"),
    title: readString(record.title, 1024, "title"),
    creators: record.creators.map((item) => readString(item, 512, "creator")),
    contributors: record.contributors === undefined ? [] : readStringArray(record.contributors, 50, 512, "contributors"),
    year: readString(record.year, 16, "year"),
    format: record.format as RecordFormat,
    identifiers: record.identifiers.map(parseIdentifier),
    links: record.links.map((item) => readString(item, 2048, "link")),
    availability: record.availability as Availability,
    edition: readString(record.edition, 512, "edition"),
    location: readString(record.location, 512, "location"),
    suppressed: readBoolean(record.suppressed, "suppressed"),
    publicVisible: readBoolean(record.publicVisible, "publicVisible"),
    requestable: readBoolean(record.requestable, "requestable"),
    metadata: parseMetadata(record.metadata),
    source: {
      format: "in-keeping-json", label, digest, ordinal, trace: {},
      elements: packetSourceElements(record),
    },
  };
}

function validateStoredRecord(value: unknown, ordinal: number): void {
  const record = asObject(value, `Stored record ${ordinal} must be an object.`);
  exactKeys(record, ["id", "title", "creators", "contributors", "year", "format", "identifiers", "links", "availability", "edition", "location", "suppressed", "publicVisible", "requestable", "metadata", "source"]);
  const id = readString(record.id, 128, "stored record id");
  if (!SAFE_ID.test(id)) throw new Error("Stored record ID is invalid.");
  readString(record.title, 1024, "stored title");
  validateStringArray(record.creators, 50, 512, "stored creators");
  if (record.contributors !== undefined) validateStringArray(record.contributors, 50, 512, "stored contributors");
  readString(record.year, 16, "stored year");
  if (!["Article", "Book", "Online book", "Book chapter", "Conference paper", "Serial", "Newspaper", "Video", "Audio", "Image", "Map", "Score", "Dataset", "Software", "Website", "Report", "Thesis", "Manuscript", "Archival collection", "Other"].includes(String(record.format))) throw new Error("Stored format is invalid.");
  if (!Array.isArray(record.identifiers) || record.identifiers.length > 50) throw new Error("Stored identifiers are invalid.");
  record.identifiers.forEach(parseIdentifier);
  validateStringArray(record.links, 20, 2048, "stored links");
  for (const link of record.links as string[]) {
    const result = validatePublicUrl(link);
    if (!result.ok) throw new Error(`Stored URL rejected: ${result.reason}`);
  }
  if (!["Available", "Online", "Unavailable", "Check availability"].includes(String(record.availability))) throw new Error("Stored availability is invalid.");
  readString(record.edition, 512, "stored edition");
  readString(record.location, 512, "stored location");
  readBoolean(record.suppressed, "stored suppressed");
  readBoolean(record.publicVisible, "stored publicVisible");
  readBoolean(record.requestable, "stored requestable");
  if (record.metadata !== undefined) parseMetadata(record.metadata);
  const source = asObject(record.source, "Stored source must be an object.");
  exactKeys(source, ["format", "label", "digest", "ordinal", "trace", "elements"]);
  if (!["fixture", "marcxml", "dcxml", "modsxml", "in-keeping-json", "laclab-json", "csl-json", "jsonld", "ris", "bibtex", "csv", "tsv", "marc-text"].includes(String(source.format))) throw new Error("Stored source format is invalid.");
  readString(source.label, 180, "source label");
  readString(source.digest, 128, "source digest");
  if (!Number.isInteger(source.ordinal) || Number(source.ordinal) < 1 || Number(source.ordinal) > MAX_RECORDS) throw new Error("Source ordinal is invalid.");
  const trace = asObject(source.trace, "Source trace must be an object.");
  if (Object.keys(trace).length > 64) throw new Error("Source trace exceeds 64 fields.");
  Object.values(trace).forEach((traceValue) => readString(traceValue, 8192, "trace value"));
  if (source.elements !== undefined) validateRecordElements(source.elements, "source elements");
}

function validateRecordElements(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_ELEMENTS) throw new Error(`${field} must contain no more than ${MAX_SOURCE_ELEMENTS.toLocaleString()} elements.`);
  value.forEach((item, index) => {
    const entry = asObject(item, `${field} ${index + 1} must be an object.`);
    exactKeys(entry, ["code", "name", "value", "definition"]);
    readString(entry.code, 64, `${field} code`);
    readString(entry.name, 160, `${field} name`);
    readString(entry.value, 8192, `${field} value`);
    readString(entry.definition, 500, `${field} definition`);
  });
}

function validateStoredConfig(value: unknown): LabConfig {
  const config = asObject(value, "Stored config must be an object.");
  exactKeys(config, ["resolverBase", "proxyPrefix", "defaultPickupLocation", "memberCode"]);
  return {
    resolverBase: readString(config.resolverBase, 2048, "resolverBase"),
    proxyPrefix: readString(config.proxyPrefix, 2048, "proxyPrefix"),
    defaultPickupLocation: readString(config.defaultPickupLocation, 160, "defaultPickupLocation"),
    memberCode: readString(config.memberCode, 32, "memberCode"),
  };
}

function validateStringArray(value: unknown, maxItems: number, maxLength: number, field: string): void {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} is invalid.`);
  value.forEach((item) => readString(item, maxLength, field));
}

function readStringArray(value: unknown, maxItems: number, maxLength: number, field: string): string[] {
  validateStringArray(value, maxItems, maxLength, field);
  return (value as unknown[]).map((item) => readString(item, maxLength, field));
}

function emptyMetadata(): DescriptiveMetadata {
  return { issued: "", created: "", modified: "", publisher: "", place: "", language: "", subjects: [], genres: [], abstract: "", rights: "", license: "", series: "", containerTitle: "", volume: "", issue: "", pages: "", extent: "", audience: "", coverage: "", relations: [], notes: [] };
}

function parseMetadata(value: unknown): DescriptiveMetadata {
  if (value === undefined) return emptyMetadata();
  const item = asObject(value, "Metadata must be an object.");
  const keys = ["issued", "created", "modified", "publisher", "place", "language", "subjects", "genres", "abstract", "rights", "license", "series", "containerTitle", "volume", "issue", "pages", "extent", "audience", "coverage", "relations", "notes"];
  exactKeys(item, keys);
  const text = (key: string, max = 2048) => item[key] === undefined ? "" : readString(item[key], max, `metadata ${key}`);
  const list = (key: string, maxItems = 100) => item[key] === undefined ? [] : readStringArray(item[key], maxItems, 1024, `metadata ${key}`);
  return { issued: text("issued", 64), created: text("created", 64), modified: text("modified", 64), publisher: text("publisher"), place: text("place"), language: text("language", 100), subjects: list("subjects"), genres: list("genres"), abstract: text("abstract", 8192), rights: text("rights", 4096), license: text("license", 2048), series: text("series"), containerTitle: text("containerTitle"), volume: text("volume", 64), issue: text("issue", 64), pages: text("pages", 128), extent: text("extent", 512), audience: text("audience", 512), coverage: text("coverage", 512), relations: list("relations"), notes: list("notes") };
}

function parseIdentifier(value: unknown): Identifier {
  const item = asObject(value, "Identifier must be an object.");
  exactKeys(item, ["scheme", "value"]);
  const schemes = ["doi", "isbn", "issn", "oclc", "lccn", "orcid", "ismn", "upc", "uri", "local"];
  if (!schemes.includes(String(item.scheme))) throw new Error("Identifier scheme is unsupported.");
  const identifier = readString(item.value, 256, "identifier");
  assertIdentityText(identifier, "Identifier value");
  return { scheme: item.scheme as Identifier["scheme"], value: identifier };
}

function parseMarcXml(document: Document, label: string, digest: string): CatalogRecord[] {
  const root = document.documentElement;
  const xmlIds = new Set<string>();
  assertElementOnlyContent(root, "MARCXML root");
  assertOnlyXmlAttributes(root, root.localName === "collection" ? ["id"] : ["id", "type"]);
  if (root.localName === "collection") assertUniqueMarcXmlId(root, xmlIds);
  if (root.localName === "collection" && childElements(root).some((child) => child.namespaceURI !== MARCXML_NS || child.localName !== "record")) {
    throw new Error("MARCXML collection contains an element outside the accepted record structure.");
  }
  const records = root.localName === "record"
    ? [root]
    : directElements(root, MARCXML_NS, "record");
  if (!records.length || records.length > MAX_RECORDS) throw new Error("MARCXML must contain 1–1,000 records.");
  return records.map((record, index) => {
    assertElementOnlyContent(record, `MARC record ${index + 1}`);
    assertOnlyXmlAttributes(record, ["id", "type"]);
    assertUniqueMarcXmlId(record, xmlIds);
    const recordType = record.getAttribute("type");
    if (recordType && recordType !== "Bibliographic") throw new Error(`MARC record ${index + 1} is not a bibliographic record.`);
    const unexpectedRecordElement = childElements(record).find((child) => child.namespaceURI !== MARCXML_NS || !["leader", "controlfield", "datafield"].includes(child.localName));
    if (unexpectedRecordElement) throw new Error(`MARC record ${index + 1} contains an element outside the accepted leader/controlfield/datafield structure.`);
    let phase = 0;
    for (const [childIndex, child] of childElements(record).entries()) {
      if (child.localName === "leader") {
        if (childIndex !== 0 || phase !== 0) throw new Error(`MARC record ${index + 1} must order leader, control fields, then data fields.`);
        phase = 1;
      } else if (child.localName === "controlfield") {
        if (phase !== 1) throw new Error(`MARC record ${index + 1} must order leader, control fields, then data fields.`);
      } else if (child.localName === "datafield") {
        if (phase === 0) throw new Error(`MARC record ${index + 1} must begin with its leader.`);
        phase = 2;
      }
    }
    const leaders = directElements(record, MARCXML_NS, "leader");
    const leader = leaders[0]?.textContent ?? "";
    if (leaders.length !== 1 || childElements(leaders[0]).length || !validMarcLeader(leader)) throw new Error(`MARC record ${index + 1} requires exactly one text-only, structurally valid 24-character leader.`);
    assertOnlyXmlAttributes(leaders[0], ["id", "xml:space"]);
    assertUniqueMarcXmlId(leaders[0], xmlIds);
    if (leaders[0].hasAttribute("xml:space") && leaders[0].getAttribute("xml:space") !== "preserve") throw new Error(`MARC record ${index + 1} leader has invalid xml:space.`);
    const fields = directElements(record, MARCXML_NS, "datafield");
    const subfields = fields.flatMap((field) => directElements(field, MARCXML_NS, "subfield"));
    if (fields.length > 256 || subfields.length > 1024) throw new Error(`MARC record ${index + 1} exceeds field limits.`);
    const controlFields = directElements(record, MARCXML_NS, "controlfield");
    for (const field of controlFields) {
      assertOnlyXmlAttributes(field, ["id", "tag", "xml:space"]);
      assertUniqueMarcXmlId(field, xmlIds);
      if (field.hasAttribute("xml:space") && field.getAttribute("xml:space") !== "preserve") throw new Error(`MARC record ${index + 1} control field has invalid xml:space.`);
      if (!/^00[1-9]$/.test(field.getAttribute("tag") ?? "") || childElements(field).length) throw new Error(`MARC record ${index + 1} contains an invalid control field.`);
    }
    for (const tag of ["001", "003"]) {
      const occurrences = controlFields.filter((field) => field.getAttribute("tag") === tag);
      if (occurrences.length > 1) throw new Error(`MARC record ${index + 1} contains duplicate singular ${tag} control fields.`);
      if (occurrences.length === 1) assertIdentityText(occurrences[0].textContent ?? "", `MARC record ${index + 1} ${tag}`);
    }
    for (const field of fields) {
      assertElementOnlyContent(field, `MARC record ${index + 1} data field`);
      assertOnlyXmlAttributes(field, ["id", "tag", "ind1", "ind2"]);
      assertUniqueMarcXmlId(field, xmlIds);
      const tag = field.getAttribute("tag") ?? "";
      if (!/^\d{3}$/.test(tag) || Number(tag) < 10 || !/^[\x20-\x7e]$/.test(field.getAttribute("ind1") ?? "") || !/^[\x20-\x7e]$/.test(field.getAttribute("ind2") ?? "")) throw new Error(`MARC record ${index + 1} contains an invalid data field.`);
      const directSubfields = childElements(field);
      if (!directSubfields.length || directSubfields.some((child) => child.namespaceURI !== MARCXML_NS || child.localName !== "subfield" || !onlyXmlAttributes(child, ["id", "code"]) || !/^[a-z0-9]$/.test(child.getAttribute("code") ?? "") || childElements(child).length)) throw new Error(`MARC record ${index + 1} contains an invalid subfield or empty data field.`);
      directSubfields.forEach((child) => assertUniqueMarcXmlId(child, xmlIds));
      if (["020", "022", "024"].includes(tag) && directSubfields.filter((child) => child.getAttribute("code") === "a").length > 1) {
        throw new Error(`MARC record ${index + 1} ${tag} contains repeated nonrepeatable $a within one field.`);
      }
      if (tag === "024" && directSubfields.filter((child) => child.getAttribute("code") === "2").length > 1) {
        throw new Error(`MARC record ${index + 1} 024 contains repeated nonrepeatable $2 within one field.`);
      }
      if (["020", "022", "024"].includes(tag)) {
        directSubfields.filter((child) => child.getAttribute("code") === "a")
          .forEach((child) => assertIdentityText(child.textContent ?? "", `MARC record ${index + 1} ${tag} $a`));
      }
      if (tag === "024") {
        directSubfields.filter((child) => child.getAttribute("code") === "2")
          .forEach((child) => assertIdentityText(child.textContent ?? "", `MARC record ${index + 1} 024 $2`));
        const sourceCode = directSubfields.find((child) => child.getAttribute("code") === "2")?.textContent ?? "";
        marc024Scheme(field.getAttribute("ind1") ?? "", field.getAttribute("ind2") ?? "", sourceCode, `MARC record ${index + 1} 024`);
      }
    }
    const control = (tag: string) => controlFields.find((node) => node.getAttribute("tag") === tag)?.textContent?.trim() ?? "";
    const values = (tag: string, code: string) => fields.filter((field) => field.getAttribute("tag") === tag).flatMap((field) => directElements(field, MARCXML_NS, "subfield").filter((node) => node.getAttribute("code") === code).map((node) => cleanText(node.textContent ?? "", 8192))).filter(Boolean);
    const title = fields.filter((field) => field.getAttribute("tag") === "245").flatMap((field) => directElements(field, MARCXML_NS, "subfield").filter((node) => ["a", "b"].includes(node.getAttribute("code") ?? "")).map((node) => cleanText(node.textContent ?? "", 8192))).filter(Boolean).join(" ").replace(/\s*[/:;]\s*$/, "").trim();
    const id = control("001") || `MARC-${digest.slice(0, 12)}-${index + 1}`;
    const identifiers: Identifier[] = [
      ...values("020", "a").map((value) => ({ scheme: "isbn" as const, value: marc020IdentifierValue(value) })),
      ...values("022", "a").map((value) => ({ scheme: "issn" as const, value })),
      ...fields.filter((field) => field.getAttribute("tag") === "024").flatMap((field) => {
        const sourceCode = directElements(field, MARCXML_NS, "subfield").find((node) => node.getAttribute("code") === "2")?.textContent ?? "";
        const scheme = marc024Scheme(field.getAttribute("ind1") ?? "", field.getAttribute("ind2") ?? "", sourceCode, `MARC record ${index + 1} 024`);
        return directElements(field, MARCXML_NS, "subfield").filter((node) => node.getAttribute("code") === "a").map((node) => cleanText(node.textContent ?? "", 256)).map((value) => ({ scheme, value }));
      }),
    ];
    const trace = {
      "001": control("001"),
      "003": control("003"),
      "LDR/06": leader[6] ?? "",
      "LDR/07": leader[7] ?? "",
      "336$b": values("336", "b")[0] ?? "",
      "337$b": values("337", "b")[0] ?? "",
      "338$b": values("338", "b")[0] ?? "",
      "999$a": values("999", "a")[0] ?? "",
    };
    const sourceElements: RecordElement[] = [
      ...(root === record ? [] : xmlOptionalAttributeElements(root, "collection", [])),
      ...xmlOptionalAttributeElements(record, "record", []),
      ...xmlOptionalAttributeElements(leaders[0], "LDR", []),
      element("LDR", "Leader", leader, "The fixed 24-character MARC leader."),
    ];
    for (const node of childElements(record)) {
      if (node.namespaceURI === MARCXML_NS && node.localName === "controlfield") {
        const tag = node.getAttribute("tag") ?? "";
        const value = cleanText(node.textContent ?? "", 8192);
        if (tag) sourceElements.push(...xmlOptionalAttributeElements(node, tag, ["tag"]), element(tag, marcElementName(tag), value, marcElementDefinition(tag)));
      }
      if (node.namespaceURI === MARCXML_NS && node.localName === "datafield") {
        const tag = node.getAttribute("tag") ?? "";
        const indicators = `${node.getAttribute("ind1") || "#"}${node.getAttribute("ind2") || "#"}`.replace(/ /g, "#");
        sourceElements.push(...xmlOptionalAttributeElements(node, tag, ["tag", "ind1", "ind2"]));
        for (const child of childElements(node)) {
          if (child.namespaceURI !== MARCXML_NS || child.localName !== "subfield") continue;
          const code = child.getAttribute("code") ?? "";
          const value = cleanText(child.textContent ?? "", 8192);
          if (tag && code) sourceElements.push(...xmlOptionalAttributeElements(child, `${tag} $${code}`, ["code"]), element(`${tag} ${indicators} $${code}`, marcElementName(tag), value, marcElementDefinition(tag)));
        }
      }
    }
    const declaredFormats = fields.filter((field) => field.getAttribute("tag") === "655")
      .filter((field) => directElements(field, MARCXML_NS, "subfield").some((node) => node.getAttribute("code") === "2" && node.textContent?.trim().toLowerCase() === "in-keeping"))
      .flatMap((field) => directElements(field, MARCXML_NS, "subfield").filter((node) => node.getAttribute("code") === "a").map((node) => cleanText(node.textContent ?? "", 8192)));
    const genres = fields.filter((field) => field.getAttribute("tag") === "655")
      .filter((field) => !directElements(field, MARCXML_NS, "subfield").some((node) => node.getAttribute("code") === "2" && node.textContent?.trim().toLowerCase() === "in-keeping"))
      .flatMap((field) => directElements(field, MARCXML_NS, "subfield").filter((node) => node.getAttribute("code") === "a").map((node) => cleanText(node.textContent ?? "", 8192)));
    const format = marcFormat(trace, genres, declaredFormats);
    const suppression = [...values("999", "s"), ...values("852", "x")].some((value) => /suppres|withdrawn/i.test(value));
    const issued = values("264", "c")[0] || values("260", "c")[0] || "";
    const additionalNames = fields.filter((field) => ["700", "720"].includes(field.getAttribute("tag") ?? "")).map((field) => ({ name: directElements(field, MARCXML_NS, "subfield").find((node) => node.getAttribute("code") === "a")?.textContent?.trim() ?? "", role: directElements(field, MARCXML_NS, "subfield").find((node) => node.getAttribute("code") === "e")?.textContent?.trim().toLowerCase() ?? "" })).filter((entry) => entry.name);
    const parsed = importedRecord({
      id,
      title,
      creators: [...values("100", "a"), ...additionalNames.filter((entry) => /^(?:author|creator|composer|artist)$/i.test(entry.role)).map((entry) => entry.name)],
      contributors: additionalNames.filter((entry) => !/^(?:author|creator|composer|artist)$/i.test(entry.role)).map((entry) => entry.name),
      year: issued.slice(0, 4) || control("008").slice(7, 11),
      format,
      identifiers,
      links: values("856", "u"),
      availability: values("856", "u").length ? "Online" : "Check availability",
      edition: values("250", "a")[0] ?? "",
      location: values("852", "b")[0] ?? "",
      suppressed: suppression,
      publicVisible: !suppression,
      requestable: false,
      metadata: { issued, publisher: values("264", "b")[0] || values("260", "b")[0] || "", place: values("264", "a")[0] || values("260", "a")[0] || "", language: values("041", "a")[0] ?? "", subjects: values("650", "a"), genres, abstract: values("520", "a")[0] ?? "", extent: values("300", "a")[0] ?? "", notes: values("500", "a") },
    }, "marcxml", label, digest, index + 1, sourceElements);
    parsed.source.trace = trace;
    return parsed;
  });
}

function parseDcXml(document: Document, label: string, digest: string): CatalogRecord[] {
  const documentRoot = document.documentElement;
  assertElementOnlyContent(documentRoot, "Dublin Core root");
  assertOnlyXmlAttributes(documentRoot, []);
  if (documentRoot.localName === "collection" && childElements(documentRoot).some((child) => child.namespaceURI !== OAI_DC_NS || child.localName !== "dc")) {
    throw new Error("Dublin Core collection contains an element outside the accepted oai_dc:dc record structure.");
  }
  const roots = documentRoot.localName === "dc" && documentRoot.namespaceURI === OAI_DC_NS
    ? [document.documentElement]
    : directElements(documentRoot, OAI_DC_NS, "dc");
  if (!roots.length || roots.length > MAX_RECORDS) throw new Error("Dublin Core must contain 1–1,000 dc records.");
  const dcmes = new Set(["title", "creator", "subject", "description", "publisher", "contributor", "date", "type", "format", "identifier", "source", "language", "relation", "coverage", "rights"]);
  for (const [index, root] of roots.entries()) {
    assertElementOnlyContent(root, `Dublin Core record ${index + 1}`);
    assertOnlyXmlAttributes(root, []);
    if (childElements(root).some((child) => child.namespaceURI !== DC_ELEMENTS_NS || !dcmes.has(child.localName) || childElements(child).length)) {
      throw new Error(`Dublin Core record ${index + 1} must contain only text-only DCMES elements.`);
    }
    for (const child of childElements(root)) assertOnlyXmlAttributes(child, []);
  }
  const values = (root: Element, name: string) => directElements(root, DC_ELEMENTS_NS, name).map((node) => cleanText(node.textContent ?? "", 8192)).filter(Boolean);
  return roots.map((root, index) => {
    const identifiers = directElements(root, DC_ELEMENTS_NS, "identifier").map((node) => cleanText(node.textContent ?? "", 8192));
    identifiers.forEach((value) => assertIdentityText(value, `Dublin Core record ${index + 1} identifier`));
    const classifiedIdentifiers = identifiers.map((value) => ({ value, native: nativeIdentityPayload(value, `Dublin Core record ${index + 1} identifier`) }));
    const nativeIdentifiers = classifiedIdentifiers.filter((entry) => entry.native !== null);
    if (nativeIdentifiers.length > 1) throw new Error(`Dublin Core record ${index + 1} contains duplicate private IN KEEPING identity wrappers.`);
    const links = identifiers.filter((value) => /^https?:\/\//i.test(value));
    const typedIdentifiers: Identifier[] = classifiedIdentifiers.filter((entry) => !/^https?:\/\//i.test(entry.value) && entry.native === null).map(({ value }) => {
      const typed = value.match(/^([A-Za-z]+):(.*)$/);
      if (typed?.[2]) return { scheme: identifierScheme(typed[1]), value: cleanText(typed[2], 256) };
      if (/^10\.\d{4,9}\//i.test(value)) return { scheme: "doi", value };
      if (/^(?:97[89])?\d[\dXx -]{8,16}$/.test(value)) return { scheme: "isbn", value };
      return { scheme: "local", value };
    });
    const typeValues = values(root, "type");
    const types = typeValues.join(" ").toLowerCase();
    const format: RecordFormat = exactRecordFormat(typeValues) ?? (types.includes("article") ? "Article" : types.includes("video") ? "Video" : types.includes("book") && links.length ? "Online book" : types.includes("book") ? "Book" : "Other");
    const sourceElements = directElements(root, DC_ELEMENTS_NS).map((node) => {
      const name = node.localName.toLowerCase();
      return element(`dc:${name}`, dcElementName(name), cleanText(node.textContent ?? "", 8192), dcElementDefinition(name));
    });
    const parsed = importedRecord({
      id: nativeIdentifiers[0]?.native ?? undefined,
      title: values(root, "title")[0] ?? "",
      creators: values(root, "creator"),
      contributors: values(root, "contributor"),
      year: (values(root, "date")[0] ?? "").slice(0, 16),
      format,
      identifiers: typedIdentifiers,
      links,
      availability: links.length ? "Online" : "Check availability",
      edition: "",
      location: links.length ? "Online" : "",
      suppressed: false,
      publicVisible: true,
      requestable: false,
      metadata: { issued: values(root, "date")[0] ?? "", publisher: values(root, "publisher")[0] ?? "", language: values(root, "language")[0] ?? "", subjects: values(root, "subject"), abstract: values(root, "description")[0] ?? "", rights: values(root, "rights")[0] ?? "", coverage: values(root, "coverage")[0] ?? "", relations: values(root, "relation") },
    }, "dcxml", label, digest, index + 1, sourceElements);
    parsed.source.trace = { type: values(root, "type").join("; ") };
    return parsed;
  });
}

function parseModsXml(document: Document, label: string, digest: string): CatalogRecord[] {
  const documentRoot = document.documentElement;
  assertElementOnlyContent(documentRoot, "MODS root");
  if (documentRoot.localName === "modsCollection") assertOnlyXmlAttributes(documentRoot, []);
  if (documentRoot.localName === "modsCollection" && childElements(documentRoot).some((child) => child.namespaceURI !== MODS_NS || child.localName !== "mods")) {
    throw new Error("MODS collection contains an element outside the accepted record structure.");
  }
  const roots = documentRoot.localName === "mods" ? [documentRoot] : directElements(documentRoot, MODS_NS, "mods");
  if (!roots.length || roots.length > MAX_RECORDS) throw new Error("MODS XML must contain 1–1,000 mods records.");
  return roots.map((root, index) => {
    if (root.getElementsByTagNameNS(MODS_NS, "extension").length) throw new Error(`MODS record ${index + 1} contains an extension element whose schema is not accepted.`);
    assertModsStructure(root, index + 1);
    const recordInfos = directElements(root, MODS_NS, "recordInfo");
    if (recordInfos.length > 1) throw new Error(`MODS record ${index + 1} contains duplicate singular recordInfo elements.`);
    const recordIdentifierNodes = recordInfos.flatMap((node) => directElements(node, MODS_NS, "recordIdentifier"));
    const recordIdentifierValues = recordIdentifierNodes.map((node) => cleanText(node.textContent ?? "", 128));
    recordIdentifierValues.forEach((value) => assertIdentityText(value, `MODS record ${index + 1} recordIdentifier`));
    if (new Set(recordIdentifierValues).size > 1) throw new Error(`MODS record ${index + 1} contains contradictory recordIdentifier values.`);
    const values = (...path: string[]) => pathElements(root, MODS_NS, path).map((node) => cleanText(node.textContent ?? "", 8192)).filter(Boolean);
    const names = directElements(root, MODS_NS, "name");
    const creatorNames: string[] = [], contributorNames: string[] = [];
    for (const name of names) {
      const display = directElements(name, MODS_NS, "namePart").map((node) => cleanText(node.textContent ?? "", 512)).filter(Boolean).join(", ");
      const roles = pathElements(name, MODS_NS, ["role", "roleTerm"]).map((node) => node.textContent?.toLowerCase() ?? "");
      if (roles.some((role) => /author|creator|composer|artist/.test(role))) creatorNames.push(display); else contributorNames.push(display);
    }
    const identifiers: Identifier[] = directElements(root, MODS_NS, "identifier").map((node) => ({ scheme: identifierScheme(node.getAttribute("type") ?? "local"), value: cleanText(node.textContent ?? "", 256) }));
    const links = values("location", "url").filter((value) => /^https?:\/\//i.test(value));
    const typeText = values("typeOfResource")[0] ?? "";
    const genreNodes = directElements(root, MODS_NS, "genre");
    const allGenreText = genreNodes.map((node) => cleanText(node.textContent ?? "", 8192)).filter(Boolean);
    const genreText = genreNodes
      .filter((node) => (node.getAttribute("authority") ?? "").toLowerCase() !== "in-keeping")
      .map((node) => cleanText(node.textContent ?? "", 8192)).filter(Boolean);
    const declaredFormat = exactRecordFormat(genreNodes
      .filter((node) => (node.getAttribute("authority") ?? "").toLowerCase() === "in-keeping")
      .map((node) => cleanText(node.textContent ?? "", 8192)));
    const series = directElements(root, MODS_NS, "relatedItem")
      .filter((node) => (node.getAttribute("type") ?? "").toLowerCase() === "series")
      .flatMap((node) => pathElements(node, MODS_NS, ["titleInfo", "title"]))
      .map((node) => cleanText(node.textContent ?? "", 8192))
      .filter(Boolean);
    const titleInfos = directElements(root, MODS_NS, "titleInfo");
    const primaryTitleInfo = titleInfos.find((node) => !node.hasAttribute("type") || node.getAttribute("type") === "primary") ?? titleInfos[0];
    const title = primaryTitleInfo ? directElements(primaryTitleInfo, MODS_NS, "title").map((node) => cleanText(node.textContent ?? "", 8192)).filter(Boolean)[0] ?? "" : "";
    const elements = [
      ...directElements(root, MODS_NS).flatMap((node) => node.localName === "recordInfo"
        ? directElements(node, MODS_NS).map((child) => element(`mods:recordInfo/${child.localName}`, modsElementName(child.localName), cleanText(child.textContent ?? "", 8192), "A MODS record-information element retained separately for identity review."))
        : [element(`mods:${node.localName}`, modsElementName(node.localName), cleanText(node.textContent ?? "", 8192), "A MODS descriptive metadata element retained for review.")]),
      ...modsAttributeElements(root),
    ];
    const issued = values("originInfo", "dateIssued")[0] ?? "";
    const accessConditions = directElements(root, MODS_NS, "accessCondition");
    const rights = accessConditions.find((node) => (node.getAttribute("type") ?? "").toLowerCase() !== "license")?.textContent ?? "";
    const license = accessConditions.find((node) => (node.getAttribute("type") ?? "").toLowerCase() === "license")?.textContent ?? "";
    return importedRecord({ id: recordIdentifierValues[0], title, creators: creatorNames, contributors: contributorNames, year: issued.slice(0, 4), format: declaredFormat ?? formatFromMods(typeText, allGenreText, Boolean(links.length)), identifiers, links, edition: values("originInfo", "edition")[0] ?? "", location: values("location", "shelfLocator")[0] ?? (links.length ? "Online" : ""), metadata: { issued, created: values("originInfo", "dateCreated")[0] ?? "", modified: values("recordInfo", "recordChangeDate")[0] ?? "", publisher: values("originInfo", "publisher")[0] ?? "", place: values("originInfo", "place", "placeTerm")[0] ?? "", language: values("language", "languageTerm")[0] ?? "", subjects: [...values("subject", "topic"), ...values("subject", "geographic")], genres: genreText, abstract: values("abstract")[0] ?? "", rights: cleanText(rights, 8192), license: cleanText(license, 8192), series: series[0] ?? "", extent: values("physicalDescription", "extent")[0] ?? "", audience: values("targetAudience")[0] ?? "", notes: values("note") } }, "modsxml", label, digest, index + 1, elements);
  });
}

function childElements(node: Element): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
}

function directElements(node: Element, namespace: string, localName?: string): Element[] {
  return childElements(node).filter((child) => child.namespaceURI === namespace && (localName === undefined || child.localName === localName));
}

function pathElements(node: Element, namespace: string, path: readonly string[]): Element[] {
  return path.reduce<Element[]>((parents, localName) => parents.flatMap((parent) => directElements(parent, namespace, localName)), [node]);
}

function assertElementOnlyContent(node: Element, label: string): void {
  const hiddenText = Array.from(node.childNodes).find((child) => (child.nodeType === 3 || child.nodeType === 4) && Boolean(child.textContent?.trim()));
  if (hiddenText) throw new Error(`${label} contains text outside an accepted leaf element.`);
}

function onlyXmlAttributes(node: Element, allowed: readonly string[]): boolean {
  const accepted = new Set(allowed);
  return Array.from(node.attributes).every((attribute) => attribute.namespaceURI === "http://www.w3.org/2000/xmlns/" || accepted.has(attribute.name));
}

function assertOnlyXmlAttributes(node: Element, allowed: readonly string[]): void {
  if (!onlyXmlAttributes(node, allowed)) throw new Error(`XML ${node.localName} contains an unsupported attribute.`);
}

function assertUniqueMarcXmlId(node: Element, seen: Set<string>): void {
  if (!node.hasAttribute("id")) return;
  const value = node.getAttribute("id") ?? "";
  if (value.length > 256 || !/^[A-Za-z_][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error("MARCXML id attributes must be 1–256-character ASCII NCNames.");
  }
  if (seen.has(value)) throw new Error(`MARCXML id ${value} is duplicated.`);
  seen.add(value);
}

function xmlOptionalAttributeElements(node: Element, prefix: string, structural: readonly string[]): RecordElement[] {
  const omitted = new Set(structural);
  return Array.from(node.attributes)
    .filter((attribute) => attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/" && !omitted.has(attribute.name))
    .map((attribute) => element(`${prefix} @${attribute.name}`, "MARCXML attribute", cleanText(attribute.value, 8192), "An accepted MARCXML attribute retained with its source element."));
}

function assertModsStructure(root: Element, ordinal: number): void {
  const children: Record<string, readonly string[]> = {
    mods: ["recordInfo", "titleInfo", "name", "typeOfResource", "genre", "originInfo", "language", "subject", "identifier", "location", "abstract", "accessCondition", "physicalDescription", "relatedItem", "targetAudience", "note"],
    recordInfo: ["recordIdentifier", "recordChangeDate"],
    titleInfo: ["title"],
    name: ["namePart", "role"],
    role: ["roleTerm"],
    originInfo: ["place", "publisher", "dateIssued", "dateCreated", "edition"],
    place: ["placeTerm"],
    language: ["languageTerm"],
    subject: ["topic", "geographic"],
    location: ["url", "shelfLocator"],
    physicalDescription: ["extent"],
    relatedItem: ["titleInfo"],
  };
  const attributes: Record<string, readonly string[]> = {
    titleInfo: ["type"],
    roleTerm: ["type"],
    genre: ["authority"],
    identifier: ["type"],
    accessCondition: ["type"],
    relatedItem: ["type"],
  };
  const leaves = new Set(["recordIdentifier", "recordChangeDate", "title", "namePart", "roleTerm", "typeOfResource", "genre", "publisher", "dateIssued", "dateCreated", "edition", "placeTerm", "languageTerm", "topic", "geographic", "identifier", "url", "shelfLocator", "abstract", "accessCondition", "extent", "targetAudience", "note"]);
  const visit = (node: Element): void => {
    assertOnlyXmlAttributes(node, attributes[node.localName] ?? []);
    assertModsAttributeValues(node, ordinal);
    if (leaves.has(node.localName)) {
      if (childElements(node).length) throw new Error(`MODS record ${ordinal} requires text-only ${node.localName} elements.`);
      return;
    }
    const allowed = children[node.localName];
    if (!allowed) throw new Error(`MODS record ${ordinal} contains an unsupported ${node.localName} element.`);
    assertElementOnlyContent(node, `MODS record ${ordinal} ${node.localName}`);
    for (const child of childElements(node)) {
      if (!allowed.includes(child.localName)) throw new Error(`MODS record ${ordinal} contains an unsupported ${child.localName} element in ${node.localName}.`);
      visit(child);
    }
  };
  visit(root);
  for (const related of Array.from(root.getElementsByTagNameNS(MODS_NS, "relatedItem"))) {
    if ((related.getAttribute("type") ?? "").toLowerCase() !== "series") throw new Error(`MODS record ${ordinal} accepts relatedItem only for series statements.`);
  }
}

function assertModsAttributeValues(node: Element, ordinal: number): void {
  const value = (name: string) => node.getAttribute(name);
  if (node.localName === "titleInfo" && value("type") !== null && !["primary", "alternative"].includes(value("type")!)) {
    throw new Error(`MODS record ${ordinal} accepts titleInfo type only as primary or alternative.`);
  }
  if (node.localName === "roleTerm" && value("type") !== null && value("type") !== "text") {
    throw new Error(`MODS record ${ordinal} accepts roleTerm type only as text.`);
  }
  if (node.localName === "accessCondition" && value("type") !== null && value("type") !== "license") {
    throw new Error(`MODS record ${ordinal} accepts accessCondition type only as license.`);
  }
  if (node.localName === "relatedItem" && value("type") !== "series") {
    throw new Error(`MODS record ${ordinal} accepts relatedItem only for series statements.`);
  }
  for (const [elementName, attributeName] of [["genre", "authority"], ["identifier", "type"]] as const) {
    if (node.localName !== elementName || value(attributeName) === null) continue;
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(value(attributeName)!)) {
      throw new Error(`MODS record ${ordinal} ${elementName} ${attributeName} must be a 1–64-character controlled token.`);
    }
  }
}

function modsAttributeElements(root: Element): RecordElement[] {
  return [root, ...Array.from(root.getElementsByTagNameNS(MODS_NS, "*"))].flatMap((node) =>
    Array.from(node.attributes)
      .filter((attribute) => attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/")
      .map((attribute) => element(
        `mods:${node.localName} @${attribute.name}`,
        "MODS attribute",
        cleanText(attribute.value, 8192),
        "An accepted, validated MODS attribute retained with its source element.",
      )),
  );
}

function validMarcLeader(value: string): boolean {
  if (value.length !== 24 || !/^[\x20-\x7e]{24}$/.test(value)) return false;
  return /^\d{5}$/.test(value.slice(0, 5))
    && ["a", "c", "d", "n", "p"].includes(value[5])
    && "acdefgijkmoprt".includes(value[6])
    && "abcdims".includes(value[7])
    && [" ", "a"].includes(value[8])
    && [" ", "a"].includes(value[9])
    && value.slice(10, 12) === "22"
    && /^\d{5}$/.test(value.slice(12, 17))
    && " 1234578uz".includes(value[17])
    && " acinu".includes(value[18])
    && " abc".includes(value[19])
    && value.slice(20) === "4500";
}

function marcElementName(tag: string): string {
  return ({ "001": "Control number", "008": "Fixed-length data", "020": "ISBN", "022": "ISSN", "024": "Other standard identifier", "100": "Primary creator", "245": "Title statement", "250": "Edition statement", "260": "Publication statement", "264": "Production or publication", "300": "Physical description", "336": "Content type", "337": "Media type", "338": "Carrier type", "655": "Genre or form", "700": "Additional creator", "720": "Uncontrolled name", "852": "Location", "856": "Electronic location", "999": "Local field" } as Record<string, string>)[tag] ?? "MARC field";
}

function marcElementDefinition(tag: string): string {
  return ({ "001": "The source system's stable record number.", "008": "Coded dates, language, and other fixed catalog data.", "020": "An International Standard Book Number.", "022": "An International Standard Serial Number.", "024": "A standard identifier such as a DOI.", "100": "The person or organization chiefly responsible for the work.", "245": "The title and responsibility statement used for discovery.", "250": "The named edition of the resource.", "260": "Legacy publication details.", "264": "Production, publication, distribution, or copyright details.", "300": "The physical extent and form of the resource.", "336": "RDA description of the content's form.", "337": "RDA description of the equipment needed to access the content.", "338": "RDA description of the storage medium or carrier.", "655": "A term describing what the resource is.", "700": "An additional responsible person or organization.", "720": "A responsible name retained without inferring personal or corporate name structure.", "852": "The holding or shelving location.", "856": "A URL or other electronic access location.", "999": "Locally defined data whose meaning is institution-specific." } as Record<string, string>)[tag] ?? "A MARC source element retained for review.";
}

function dcElementName(name: string): string {
  return ({ title: "Title", creator: "Creator", contributor: "Contributor", type: "Resource type", identifier: "Identifier", date: "Date", publisher: "Publisher", subject: "Subject", description: "Description", language: "Language", rights: "Rights" } as Record<string, string>)[name] ?? "Dublin Core element";
}

function dcElementDefinition(name: string): string {
  return ({ title: "A name given to the resource.", creator: "An entity primarily responsible for making the resource.", contributor: "An entity responsible for contributing to the resource.", type: "The nature or genre of the resource.", identifier: "An unambiguous reference to the resource.", date: "A point or period associated with the resource.", publisher: "An entity responsible for making the resource available.", subject: "The topic of the resource.", description: "An account of the resource.", language: "The language of the resource.", rights: "Information about rights held in and over the resource." } as Record<string, string>)[name] ?? "A Dublin Core source element retained for review.";
}

function cslDate(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const date = value as Record<string, unknown>;
  if (typeof date.literal === "string") return cleanText(date.literal, 64);
  const raw = date["date-parts"];
  if (raw === undefined) return "";
  if (!Array.isArray(raw) || raw.length !== 1 || !Array.isArray(raw[0])) {
    throw new Error("CSL date-parts must contain exactly one date; date ranges are not silently reduced.");
  }
  const parts = raw[0] as unknown[];
  if (!parts.length || parts.length > 3 || parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error("CSL date-parts must contain one to three integer parts.");
  }
  const [year, month, day] = parts as number[];
  if (year < 0 || year > 9999 || month !== undefined && (month < 1 || month > 12)) {
    throw new Error("CSL date-parts contains an invalid year or month.");
  }
  if (day !== undefined) {
    const candidate = new Date(0);
    candidate.setUTCHours(0, 0, 0, 0);
    candidate.setUTCFullYear(year, month - 1, day);
    if (day < 1 || candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
      throw new Error("CSL date-parts contains an invalid calendar day.");
    }
  }
  return parts.map((part, index) => String(part).padStart(index ? 2 : 4, "0")).join("-");
}

function textValue(value: unknown): string { return typeof value === "string" ? cleanText(value, 8192) : ""; }
function toArray(value: unknown): unknown[] { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function splitList(value: string | undefined): string[] { return value ? value.split(/\s*(?:;|\|)\s*/).map((part) => cleanText(part, 1024)).filter(Boolean) : []; }
function splitBibtexNames(value: string | undefined): string[] {
  if (!value) return [];
  const names: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\") { index += 1; continue; }
    if (value[index] === "{") { depth += 1; continue; }
    if (value[index] === "}") { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) {
      const separator = value.slice(index).match(/^\s+and\s+/i)?.[0];
      if (separator) {
        names.push(value.slice(start, index));
        index += separator.length - 1;
        start = index + 1;
      }
    }
  }
  names.push(value.slice(start));
  return names.map((part) => cleanText(decodeBibtexName(part), 512)).filter(Boolean);
}

function decodeBibtexName(value: string): string {
  let output = "";
  for (let index = 0; index < value.length;) {
    if (value.startsWith("\\textbackslash{}", index)) { output += "\\"; index += 16; continue; }
    if (value.startsWith("\\textasciitilde{}", index)) { output += "~"; index += 17; continue; }
    if (value.startsWith("\\textasciicircum{}", index)) { output += "^"; index += 18; continue; }
    if (value[index] === "\\" && "{}%#$&_".includes(value[index + 1] ?? "")) { output += value[index + 1]; index += 2; continue; }
    if (value[index] !== "{" && value[index] !== "}") output += value[index];
    index += 1;
  }
  return output;
}

function decodeBibtexText(value: string): string {
  let output = "";
  for (let index = 0; index < value.length;) {
    if (value.startsWith("\\textbackslash{}", index)) { output += "\\"; index += 16; continue; }
    if (value.startsWith("\\textasciitilde{}", index)) { output += "~"; index += 17; continue; }
    if (value.startsWith("\\textasciicircum{}", index)) { output += "^"; index += 18; continue; }
    if (value[index] === "\\" && "{}%#$&_".includes(value[index + 1] ?? "")) { output += value[index + 1]; index += 2; continue; }
    output += value[index++];
  }
  return cleanText(output, 8192);
}
function strictBoolText(value: string | undefined, field: string, fallback: boolean): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized) return fallback;
  if (/^(?:true|yes|1|y)$/i.test(normalized)) return true;
  if (/^(?:false|no|0|n)$/i.test(normalized)) return false;
  throw new Error(`${field} must be true/false, yes/no, 1/0, or blank.`);
}

function decodeVersionedTabularCell(value: string, delimiter: "," | "\t"): string {
  if (delimiter !== "\t") {
    const restored = unprotectSpreadsheetCell(value);
    if (restored.state === "active-risk") throw new Error("Versioned CSV contains an unprotected spreadsheet-formula-like cell.");
    return restored.value;
  }
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\\") { output += value[index]; continue; }
    const escaped = value[index + 1];
    if (escaped === undefined) throw new Error("Versioned TSV contains a trailing escape character.");
    if (escaped === "\\") output += "\\";
    else if (escaped === "n") output += "\n";
    else if (escaped === "r") output += "\r";
    else if (escaped === "t") output += "\t";
    else throw new Error(`Versioned TSV contains an unsupported \\${escaped} escape.`);
    index += 1;
  }
  const restored = unprotectSpreadsheetCell(output);
  if (restored.state === "active-risk") throw new Error("Versioned TSV contains an unprotected spreadsheet-formula-like cell.");
  return restored.value;
}

function parseVersionedTabularList(value: string | undefined, field: string): string[] {
  if (!value) return [];
  let parsed: unknown;
  try { parsed = assertSafeJsonText(value); } catch (error) { throw new Error(`Versioned tabular ${field} must be a safe JSON array. ${safeError(error)}`, { cause: error }); }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) throw new Error(`Versioned tabular ${field} must be an array of text values.`);
  return parsed.map((entry) => cleanText(entry as string, 1024));
}

function parseVersionedTabularIdentifiers(value: string | undefined): Identifier[] {
  if (!value) return [];
  let parsed: unknown;
  try { parsed = assertSafeJsonText(value); } catch (error) { throw new Error(`Versioned tabular identifiers must be a safe JSON array. ${safeError(error)}`, { cause: error }); }
  if (!Array.isArray(parsed)) throw new Error("Versioned tabular identifiers must be an array.");
  if (parsed.length > 50) throw new Error("A record exceeds 50 identifiers.");
  return parsed.map(parseIdentifier);
}

function identifierScheme(value: string): Identifier["scheme"] {
  const key = value.trim().toLowerCase();
  if (["doi", "isbn", "issn", "oclc", "lccn", "orcid", "ismn", "upc", "uri"].includes(key)) return key as Identifier["scheme"];
  return "local";
}

function marc024Scheme(indicator1: string, indicator2: string, sourceCode: string, label: string): Identifier["scheme"] {
  const first = indicator1 === " " || indicator1 === "#" ? "#" : indicator1;
  const second = indicator2 === " " || indicator2 === "#" ? "#" : indicator2;
  if (!new Set(["#", "0", "1", "2", "3", "4", "7", "8"]).has(first) || second !== "#") throw new Error(`${label} has unsupported indicators.`);
  const source = sourceCode.trim();
  if (first === "7" && !source) throw new Error(`${label} indicator 7 requires exactly one nonempty $2 source code.`);
  if (first !== "7" && source) throw new Error(`${label} may carry $2 only when indicator 1 is 7.`);
  if (first === "1") return "upc";
  if (first === "2") return "ismn";
  return first === "7" ? identifierScheme(source) : "local";
}

function marc020IdentifierValue(value: string): string {
  return cleanText(value.replace(/\s+\([^()]*\)\s*$/, ""), 256);
}

function parseIdentifierList(value: string): Identifier[] {
  const identifiers = splitList(value);
  if (identifiers.length > 50) throw new Error("A record exceeds 50 identifiers.");
  return identifiers.map((part) => { const match = part.match(/^([A-Za-z]+):(.*)$/); return { scheme: identifierScheme(match?.[1] ?? "local"), value: cleanText(match?.[2]?.trim() || part, 256) }; });
}

function parseLooseIdentifiers(value: unknown): Identifier[] {
  const entries = toArray(value);
  if (entries.length > 50) throw new Error("A record exceeds 50 identifiers.");
  return entries.flatMap((entry) => {
    if (typeof entry === "string") {
      const raw = cleanText(entry, 256);
      assertIdentityText(raw, "JSON-LD identifier text");
      if (nativeIdentityPayload(raw, "JSON-LD identifier") !== null) throw new Error("IN KEEPING identity URNs are accepted only in JSON-LD @id, not general identifier values.");
      return [{ scheme: /^https:\/\//i.test(raw) ? "uri" as const : "local" as const, value: raw }];
    }
    const item = asObject(entry, "Identifier must be text or an object.");
    assertCanonicalIdentityKeys(item, ["@type", "value", "@value", "propertyID", "type"], "JSON-LD identifier object");
    exactKeys(item, ["@type", "value", "@value", "propertyID", "type"]);
    if (Object.hasOwn(item, "@type") && item["@type"] !== "PropertyValue") throw new Error("JSON-LD identifier object @type must be PropertyValue when supplied.");
    const hasValue = Object.hasOwn(item, "value");
    const hasJsonLdValue = Object.hasOwn(item, "@value");
    if (hasValue === hasJsonLdValue) throw new Error("JSON-LD identifier objects require exactly one of value or @value.");
    const rawValue = hasValue ? item.value : item["@value"];
    if (typeof rawValue !== "string" || !rawValue.trim()) throw new Error("JSON-LD identifier object values must be nonempty text.");
    const raw = cleanText(rawValue, 256);
    assertIdentityText(raw, "JSON-LD identifier object value");
    if (nativeIdentityPayload(raw, "JSON-LD identifier") !== null) throw new Error("IN KEEPING identity URNs are accepted only in JSON-LD @id, not general identifier values.");
    const hasPropertyId = Object.hasOwn(item, "propertyID");
    const hasType = Object.hasOwn(item, "type");
    if (hasPropertyId && hasType) throw new Error("JSON-LD identifier objects may not supply both propertyID and type identity schemes.");
    const schemeValue = hasPropertyId ? item.propertyID : hasType ? item.type : "";
    if ((hasPropertyId || hasType) && (typeof schemeValue !== "string" || !schemeValue.trim())) throw new Error("JSON-LD identifier scheme must be nonempty text when supplied.");
    const scheme = typeof schemeValue === "string" ? cleanText(schemeValue, 64) : "";
    if (scheme) assertIdentityText(scheme, "JSON-LD identifier scheme");
    return [{ scheme: identifierScheme(scheme), value: raw }];
  });
}

function entityName(value: unknown): string {
  if (typeof value === "string") return cleanText(value, 1024);
  if (value && typeof value === "object") return textValue((value as Record<string, unknown>).name);
  return "";
}

function formatFromCsl(value: string, online: boolean): RecordFormat {
  const key = value.toLowerCase();
  if (key.includes("article")) return "Article"; if (key.includes("chapter")) return "Book chapter"; if (key.includes("conference")) return "Conference paper"; if (key === "book") return online ? "Online book" : "Book"; if (key.includes("thesis")) return "Thesis"; if (key.includes("report")) return "Report"; if (key.includes("dataset")) return "Dataset"; if (key.includes("software")) return "Software"; if (key.includes("web")) return "Website"; if (key.includes("motion") || key.includes("video")) return "Video"; if (key.includes("song") || key.includes("audio")) return "Audio"; if (key.includes("map")) return "Map"; if (key.includes("manuscript")) return "Manuscript"; return "Other";
}

function formatFromSchema(value: string, online: boolean): RecordFormat {
  const key = value.toLowerCase();
  if (key.includes("article")) return "Article"; if (key.includes("chapter")) return "Book chapter"; if (key.includes("book")) return online ? "Online book" : "Book"; if (key.includes("periodical")) return "Serial"; if (key.includes("newspaper")) return "Newspaper"; if (key.includes("video")) return "Video"; if (key.includes("audio")) return "Audio"; if (key.includes("image")) return "Image"; if (key.includes("map")) return "Map"; if (key.includes("music")) return "Score"; if (key.includes("dataset")) return "Dataset"; if (key.includes("software")) return "Software"; if (key.includes("website") || key.includes("webpage")) return "Website"; if (key.includes("report")) return "Report"; if (key.includes("thesis")) return "Thesis"; if (key.includes("manuscript")) return "Manuscript"; if (key.includes("archive")) return "Archival collection"; return "Other";
}

function formatFromRis(value: string): RecordFormat {
  return ({ JOUR: "Article", CHAP: "Book chapter", CPAPER: "Conference paper", CONF: "Conference paper", BOOK: "Book", EBOOK: "Online book", SER: "Serial", NEWS: "Newspaper", VIDEO: "Video", SOUND: "Audio", ART: "Image", MAP: "Map", MUSIC: "Score", DATA: "Dataset", COMP: "Software", ELEC: "Website", RPRT: "Report", THES: "Thesis", MANSCPT: "Manuscript" } as Record<string, RecordFormat>)[value.toUpperCase()] ?? "Other";
}

function formatFromBib(value: string): RecordFormat {
  return ({ article: "Article", incollection: "Book chapter", inbook: "Book chapter", inproceedings: "Conference paper", conference: "Conference paper", book: "Book", booklet: "Book", periodical: "Serial", proceedings: "Serial", techreport: "Report", report: "Report", phdthesis: "Thesis", mastersthesis: "Thesis", thesis: "Thesis", unpublished: "Manuscript", dataset: "Dataset", software: "Software", online: "Website", webpage: "Website" } as Record<string, RecordFormat>)[value.toLowerCase()] ?? "Other";
}

function exactRecordFormat(values: readonly string[]): RecordFormat | undefined {
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    const match = RECORD_FORMAT_VALUES.find((format) => format.toLowerCase() === normalized);
    if (match) return match;
  }
  return undefined;
}

function formatFromText(value: string | undefined): RecordFormat {
  return exactRecordFormat(value === undefined ? [] : [value]) ?? "Other";
}

function availabilityFromText(value: string | undefined): Availability {
  return (["Available", "Online", "Unavailable", "Check availability"].find((item) => item.toLowerCase() === value?.toLowerCase()) as Availability | undefined) ?? "Check availability";
}

function formatFromMods(type: string, genres: string[], online: boolean): RecordFormat {
  const text = `${type} ${genres.join(" ")}`.toLowerCase();
  if (/archiv|collection/.test(text)) return "Archival collection"; if (/cartograph|map/.test(text)) return "Map"; if (/notated music|score/.test(text)) return "Score"; if (/moving image|video/.test(text)) return "Video"; if (/sound/.test(text)) return "Audio"; if (/still image|photograph/.test(text)) return "Image"; if (/dataset/.test(text)) return "Dataset"; if (/software/.test(text)) return "Software"; if (/thesis|dissertation/.test(text)) return "Thesis"; if (/article/.test(text)) return "Article"; if (/conference/.test(text)) return "Conference paper"; if (/report/.test(text)) return "Report"; if (/book/.test(text)) return online ? "Online book" : "Book"; return type.toLowerCase() === "text" ? (online ? "Online book" : "Book") : "Other";
}

function risFieldName(code: string): string { return ({ TY: "Reference type", ID: "Reference identifier", TI: "Title", AU: "Author", A2: "Secondary author", PY: "Publication date", PB: "Publisher", T2: "Container title", VL: "Volume", IS: "Issue", SP: "Start page", EP: "End page", AB: "Abstract", KW: "Keyword", UR: "URL", DO: "DOI", SN: "ISBN or ISSN" } as Record<string, string>)[code] ?? "RIS field"; }
function modsElementName(name: string): string { return ({ recordInfo: "Record information", titleInfo: "Title information", name: "Name", typeOfResource: "Resource type", genre: "Genre", originInfo: "Origin information", language: "Language", subject: "Subject", identifier: "Identifier", location: "Location", abstract: "Abstract", accessCondition: "Rights or access condition", physicalDescription: "Physical description", relatedItem: "Related item", note: "Note" } as Record<string, string>)[name] ?? "MODS element"; }

function parseRows(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false; let afterQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) { if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') { quoted = false; afterQuote = true; } else value += char; continue; }
    if (afterQuote) {
      if (char === delimiter) { row.push(value); value = ""; afterQuote = false; continue; }
      if (char === "\r" && text[index + 1] === "\n") continue;
      if (char === "\n") { row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ""; afterQuote = false; if (rows.length > MAX_RECORDS + 1) throw new Error("Delimited record limit exceeded."); continue; }
      throw new Error("Delimited data contains text after a closing quote.");
    }
    if (char === '"') { if (value) throw new Error("Delimited data contains a quote inside an unquoted field."); quoted = true; continue; }
    if (char === delimiter) { row.push(value); value = ""; continue; }
    if (char === "\n") { row.push(value.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; value = ""; if (rows.length > MAX_RECORDS + 1) throw new Error("Delimited record limit exceeded."); continue; }
    value += char;
    if (value.length > 8192) throw new Error("Delimited cell exceeds 8 KiB.");
  }
  if (quoted) throw new Error("Delimited data contains an unterminated quoted field.");
  row.push(value.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row);
  if (rows.some((item) => item.length > 64)) throw new Error("Delimited data exceeds 64 columns.");
  return rows;
}

function inspectJson(value: unknown, depth: number): void {
  if (depth > 16) throw new Error("JSON nesting exceeds 16 levels.");
  if (typeof value === "string") {
    if (value.length > 8192) throw new Error("JSON string exceeds 8 KiB.");
    if (CONTROL_CHARACTERS.test(value)) throw new Error("JSON string contains control characters.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new Error("JSON array exceeds 5,000 items.");
    value.forEach((item) => inspectJson(item, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 256) throw new Error("JSON object exceeds 256 keys.");
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key) || key.length > 256 || CONTROL_CHARACTERS.test(key)) throw new Error("JSON contains a forbidden or oversized key.");
      inspectJson((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) throw new Error(`Unknown field: ${unknown[0]}.`);
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readString(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  return cleanText(value, max);
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false.`);
  return value;
}

function readDate(value: unknown, field: string): string {
  const text = readString(value, 64, field);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/);
  const parsed = new Date(text);
  if (!match
    || Number.isNaN(parsed.valueOf())
    || parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() + 1 !== Number(match[2])
    || parsed.getUTCDate() !== Number(match[3])
    || parsed.getUTCHours() !== Number(match[4])
    || parsed.getUTCMinutes() !== Number(match[5])
    || parsed.getUTCSeconds() !== Number(match[6])) throw new Error(`${field} must be an ISO 8601 UTC instant.`);
  return text;
}

function cleanText(value: string, max: number): string {
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (CONTROL_CHARACTERS.test(normalized)) throw new Error("Text contains disallowed control characters.");
  if (normalized.length > max) throw new Error(`Text exceeds ${max} characters.`);
  return normalized;
}

function sourceText(value: string, max: number): string {
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n");
  if (CONTROL_CHARACTERS.test(normalized)) throw new Error("Text contains disallowed control characters.");
  if (normalized.length > max) throw new Error(`Text exceeds ${max} characters.`);
  return normalized;
}

function cleanWorkspaceName(value: string): string {
  if (typeof value !== "string") throw new Error("Workspace name must be text.");
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Workspace name is required.");
  if (CONTROL_CHARACTERS.test(normalized) || /[\u202A-\u202E\u2066-\u2069]/.test(normalized)) throw new Error("Workspace name contains disallowed directional or control characters.");
  if (normalized.length > 120) throw new Error("Workspace name exceeds 120 characters.");
  return normalized;
}

function validateConfig(config: LabConfig): void {
  for (const [label, value] of [["Resolver", config.resolverBase], ["Proxy", config.proxyPrefix]] as const) {
    if (!value) continue;
    const parsed = validatePublicUrl(value, true);
    if (!parsed.ok) throw new Error(`${label}: ${parsed.reason}`);
  }
  cleanText(config.defaultPickupLocation, 160);
  if (config.memberCode && !/^[A-Za-z0-9_-]{2,32}$/.test(config.memberCode)) throw new Error("Member code must be 2–32 letters, numbers, underscores, or hyphens.");
}

function validatePublicUrl(value: string, allowTemplate = false): { ok: boolean; reason: string } {
  const review = reviewPublicHttpsUrl(value, allowTemplate);
  return review.ok ? { ok: true, reason: "" } : review;
}

function normalizeIdentifier(identifier: Identifier): string {
  let value = identifier.value.trim();
  if (identifier.scheme === "doi") value = value.replace(/^doi:\s*/i, "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
  if (identifier.scheme === "isbn" || identifier.scheme === "issn") value = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return value;
}

export function stableIdentityClaims(record: Pick<CatalogRecord, "identifiers" | "links">): string[] {
  const claims = new Set<string>();
  for (const identifier of record.identifiers) {
    const normalized = normalizeIdentifier(identifier);
    if (normalized) claims.add(`${identifier.scheme}:${normalized}`);
    const doi = identifier.scheme === "local" || identifier.scheme === "uri" ? doiFromCarrier(identifier.value) : null;
    if (doi) claims.add(`doi:${doi}`);
  }
  for (const link of record.links) {
    const doi = doiFromCarrier(link);
    if (doi) claims.add(`doi:${doi}`);
  }
  return [...claims].sort();
}

function stableDoiClaims(record: Pick<CatalogRecord, "identifiers" | "links">): Set<string> {
  return new Set(stableIdentityClaims(record).filter((claim) => claim.startsWith("doi:")).map((claim) => claim.slice(4)));
}

function doiFromCarrier(value: string): string | null {
  const normalizedBare = normalizeIdentifier({ scheme: "doi", value });
  if (/^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(normalizedBare)) return normalizedBare;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !["doi.org", "dx.doi.org"].includes(parsed.hostname.toLowerCase())) return null;
  let path: string;
  try { path = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")); } catch { return null; }
  const normalized = normalizeIdentifier({ scheme: "doi", value: path });
  return /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(normalized) ? normalized : null;
}

function validIsbn(value: string): boolean {
  if (/^\d{13}$/.test(value)) return [...value].reduce((sum, char, index) => sum + Number(char) * (index % 2 === 0 ? 1 : 3), 0) % 10 === 0;
  if (/^\d{9}[\dX]$/.test(value)) return [...value].reduce((sum, char, index) => sum + (char === "X" ? 10 : Number(char)) * (10 - index), 0) % 11 === 0;
  return false;
}

function normalizeTitle(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function marcFormat(trace: Record<string, string>, genres: string[], declaredGenres: string[] = []): RecordFormat {
  const declared = exactRecordFormat(declaredGenres);
  if (declared) return declared;
  if (genres.some((genre) => /video|motion picture/i.test(genre))) return "Video";
  if (trace["336$b"] === "cod") return "Dataset";
  if (trace["336$b"] === "cop") return "Software";
  if (trace["LDR/06"] === "g") return "Video";
  if (trace["LDR/06"] === "i" || trace["LDR/06"] === "j") return "Audio";
  if (trace["LDR/06"] === "k") return "Image";
  if (trace["LDR/06"] === "e" || trace["LDR/06"] === "f") return "Map";
  if (trace["LDR/06"] === "c" || trace["LDR/06"] === "d") return "Score";
  if (trace["LDR/06"] === "t") return "Manuscript";
  if (trace["LDR/06"] === "p" && trace["LDR/07"] === "c") return "Archival collection";
  if (trace["LDR/07"] === "b") return "Article";
  if (trace["LDR/07"] === "a") return "Book chapter";
  if (trace["LDR/07"] === "s") return "Serial";
  if (trace["LDR/07"] === "i") return "Website";
  if (trace["336$b"] === "txt" && trace["338$b"] === "cr") return "Online book";
  if (trace["999$a"] === "VID") return "Video";
  return "Book";
}

function addFinding(findings: Finding[], severity: FindingSeverity, code: string, recordId: string | undefined, label: string, detail: string): void {
  const occurrence = findings.filter((item) => item.code === code && item.recordId === recordId && item.label === label && item.detail === detail).length + 1;
  findings.push({ id: `${code}:${recordId ?? "workspace"}:${occurrence}`, severity, code, recordId, label, detail });
}

function severityRank(severity: FindingSeverity): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

function blockedReview(base: ImportReview, code: string, detail: string): ImportReview {
  return { ...base, findings: [{ id: code, severity: "error", code, label: "Import blocked", detail }], summary: detail, blocked: true };
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The file could not be parsed.";
  return cleanText(message.replace(/[<>]/g, "").slice(0, 500), 500);
}

function serviceForFinding(code: string): string {
  if (code.includes("URL") || code.includes("DOI")) return "Electronic access";
  if (code.includes("REQUEST")) return "Fulfillment";
  return "Discovery metadata";
}

function nextActionForFinding(code: string): string {
  if (code === "SUPPRESSION_LEAK") return "Remove the record from the public projection and reconcile index counts.";
  if (code === "REQUEST_MISMATCH") return "Trace holding, item status, location, and request policy before changing configuration.";
  if (code === "FORMAT_CONFLICT") return "Compare the source fields with the normalization rule and stage a scoped correction.";
  if (code === "URL_UNSAFE") return "Quarantine the target and verify an approved HTTPS replacement.";
  if (code.includes("DUPLICATE")) return "Compare editions and stable identifiers before merging or suppressing records.";
  return "Verify the source, scope the affected records, and record a reversible correction.";
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

async function digestValue(value: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(value)));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

async function sha256Hex(value: ArrayBuffer | Uint8Array): Promise<string> {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
