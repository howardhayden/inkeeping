import { reviewPublicHttpsUrl } from "./public-url.ts";
import { protectSpreadsheetCell } from "./spreadsheet-safety.ts";

export type ServiceArea =
  | "collections"
  | "electronic-resources"
  | "discovery"
  | "preservation"
  | "technical-services"
  | "special-collections"
  | "data-services"
  | "rare-materials";

export type ServiceFieldKind =
  | "text"
  | "long-text"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "date-time"
  | "identifier"
  | "uri"
  | "controlled-term"
  | "checksum"
  | "media-type";

export type ServiceRecordState = "active" | "review" | "due" | "blocked" | "retired";
export type ServiceSensitivity = "public" | "internal" | "restricted";
export type ServiceValue = string | string[] | boolean | number;

export type ServiceFieldDefinition = {
  id: string;
  label: string;
  definition: string;
  kind: ServiceFieldKind;
  required?: boolean;
  repeatable?: boolean;
  vocabulary?: string[];
};

export type ServiceRecordDefinition = {
  kind: string;
  area: ServiceArea;
  label: string;
  purpose: string;
  fields: ServiceFieldDefinition[];
};

export type ServiceRecord = {
  id: string;
  kind: string;
  area: ServiceArea;
  title: string;
  state: ServiceRecordState;
  ownerRole: string;
  system: string;
  sensitivity: ServiceSensitivity;
  values: Record<string, ServiceValue>;
  createdAt: string;
  updatedAt: string;
};

export type ServiceExchangeFormat = "service-json" | "service-csv";

export const SERVICE_AREAS: { id: ServiceArea; label: string; remit: string }[] = [
  { id: "collections", label: "Collections", remit: "Selection policy, funds, commitments, and review cycles." },
  { id: "electronic-resources", label: "Electronic Resources", remit: "Entitlements, licenses, access models, renewals, and usage evidence." },
  { id: "discovery", label: "Discovery", remit: "Indexes, mappings, suppression, link routing, and verification." },
  { id: "preservation", label: "Preservation / Conservation", remit: "Condition, treatment, storage, checksums, and review." },
  { id: "technical-services", label: "Technical Services", remit: "Orders, receiving, metadata batches, authority work, and rollback." },
  { id: "special-collections", label: "Special Collections / Archives", remit: "Accessioning, restrictions, processing, arrangement, and description." },
  { id: "data-services", label: "Data Services", remit: "Dataset custody, repositories, management plans, formats, and retention." },
  { id: "rare-materials", label: "Rare Books / Manuscripts", remit: "Copy-specific description, provenance, condition, and treatment." },
];

export const SERVICE_FIELD_KINDS: ServiceFieldKind[] = [
  "text", "long-text", "integer", "decimal", "boolean", "date", "date-time",
  "identifier", "uri", "controlled-term", "checksum", "media-type",
];

export const SERVICE_DATA_FORMAT_RULES: { kind: ServiceFieldKind; storage: string; exchange: string }[] = [
  { kind: "text", storage: "Unicode NFC text; 1,000 characters maximum.", exchange: "JSON string; one UTF-8 CSV cell." },
  { kind: "long-text", storage: "Unicode NFC text; 4,000 characters maximum.", exchange: "JSON string; RFC 4180 quoted CSV cell when needed." },
  { kind: "integer", storage: "Finite whole number with absolute value no greater than 10^12.", exchange: "JSON number; base-10 CSV text." },
  { kind: "decimal", storage: "Finite decimal with absolute value no greater than 10^12.", exchange: "JSON number; base-10 CSV text." },
  { kind: "boolean", storage: "Explicit true or false.", exchange: "JSON boolean; true or false CSV text." },
  { kind: "date", storage: "Real Gregorian calendar date in YYYY-MM-DD.", exchange: "Unchanged ISO 8601 calendar-date text." },
  { kind: "date-time", storage: "ISO 8601 UTC instant ending in Z.", exchange: "Unchanged UTC timestamp." },
  { kind: "identifier", storage: "Bounded non-whitespace identifier without markup delimiters.", exchange: "Unchanged display identifier; no inferred normalization." },
  { kind: "uri", storage: "Public HTTPS URL without credentials, private hosts, or secret-like query keys.", exchange: "Unchanged validated URL." },
  { kind: "controlled-term", storage: "One declared vocabulary value.", exchange: "Vocabulary token as JSON or CSV text." },
  { kind: "checksum", storage: "Optional algorithm label plus 32–128 hexadecimal characters.", exchange: "Unchanged lowercase- or uppercase-hex display value." },
  { kind: "media-type", storage: "IANA-style type/subtype token.", exchange: "Unchanged media-type text." },
];

const f = (
  id: string,
  label: string,
  definition: string,
  kind: ServiceFieldKind = "text",
  required = false,
  repeatable = false,
  vocabulary: string[] = [],
): ServiceFieldDefinition => ({ id, label, definition, kind, required, repeatable, vocabulary });

export const SERVICE_RECORD_DEFINITIONS: ServiceRecordDefinition[] = [
  {
    kind: "collection-policy", area: "collections", label: "Collection policy", purpose: "Records a collecting scope and its accountable review cycle.",
    fields: [
      f("scope", "Collecting scope", "Subjects, formats, communities, and collecting depth covered by the policy.", "long-text", true),
      f("audience", "Primary audience", "Communities and programs the collection is intended to serve.", "text", true, true),
      f("selection_roles", "Selection roles", "Roles authorized to select, approve, or withdraw material.", "text", false, true),
      f("review_cycle_months", "Review cycle (months)", "Maximum interval between policy reviews.", "integer"),
      f("exclusions", "Exclusions", "Materials or collecting activity explicitly outside scope.", "long-text"),
    ],
  },
  {
    kind: "collection-fund", area: "collections", label: "Collection fund", purpose: "Tracks an allocation without becoming an accounting system of record.",
    fields: [
      f("fiscal_year", "Fiscal year", "Institutional fiscal year label.", "text", true),
      f("fund_code", "Fund code", "Stable local fund identifier.", "identifier", true),
      f("allocation", "Allocation", "Approved amount in the stated currency.", "decimal", true),
      f("committed", "Committed", "Amount already committed.", "decimal"),
      f("currency", "Currency", "ISO 4217 currency code.", "controlled-term", true, false, ["USD", "CAD", "EUR", "GBP", "AUD"]),
      f("notes", "Stewardship note", "Context needed to interpret the allocation.", "long-text"),
    ],
  },
  {
    kind: "resource-entitlement", area: "electronic-resources", label: "Resource entitlement", purpose: "Connects a licensed resource to coverage, authentication, renewal, and perpetual-access terms.",
    fields: [
      f("provider", "Provider", "Organization supplying access.", "text", true),
      f("platform", "Platform", "User-facing host or delivery platform.", "text", true),
      f("coverage_start", "Coverage start", "First date covered by the entitlement.", "date"),
      f("coverage_end", "Coverage end", "Last date covered by the entitlement, when bounded.", "date"),
      f("access_model", "Access model", "Basis on which access is granted.", "controlled-term", true, false, ["subscription", "perpetual", "evidence-based", "demand-driven", "open-access", "consortial"]),
      f("authentication", "Authentication", "Expected authentication route.", "controlled-term", true, false, ["ip", "proxy", "saml", "openid-connect", "library-card", "public"]),
      f("license_uri", "License URI", "Public or institutionally reachable agreement reference without credentials.", "uri"),
      f("renewal_date", "Renewal date", "Next renewal or cancellation decision date.", "date"),
      f("perpetual_access", "Perpetual access", "Whether post-cancellation access is contractually retained.", "boolean"),
      f("counter_supported", "COUNTER supported", "Whether standardized usage reporting is available.", "boolean"),
    ],
  },
  {
    kind: "license-obligation", area: "electronic-resources", label: "License obligation", purpose: "Surfaces operational clauses without replacing the authoritative agreement.",
    fields: [
      f("agreement_id", "Agreement ID", "Stable reference to the authoritative agreement.", "identifier", true),
      f("licensor", "Licensor", "Contracting provider or rights holder.", "text", true),
      f("effective_on", "Effective date", "Date the agreement takes effect.", "date"),
      f("expires_on", "Expiration date", "Date the agreement ends or renews.", "date"),
      f("authorized_users", "Authorized users", "Plain-language authorized-user categories.", "long-text"),
      f("ill_terms", "Interlibrary loan terms", "Operational lending or document-delivery conditions.", "long-text"),
      f("accessibility_terms", "Accessibility terms", "Remediation, conformance, and accessible-copy obligations.", "long-text"),
      f("text_mining_terms", "Text and data mining terms", "Permitted computational use and request path.", "long-text"),
      f("post_cancellation_access", "Post-cancellation access", "Retained-access scope and verification method.", "long-text"),
    ],
  },
  {
    kind: "discovery-profile", area: "discovery", label: "Discovery profile", purpose: "Makes indexing, display, facet, and suppression rules reviewable.",
    fields: [
      f("index_name", "Index", "Search index or profile name.", "identifier", true),
      f("source_system", "Source system", "Authoritative source supplying records.", "text", true),
      f("mapping_version", "Mapping version", "Versioned mapping or normalization ruleset.", "identifier", true),
      f("facets", "Facets", "Public facets produced by the profile.", "text", false, true),
      f("suppression_rule", "Suppression rule", "Rule preventing private or withdrawn records from appearing.", "long-text", true),
      f("last_reindex", "Last full reindex", "Most recent completed full-index rebuild.", "date-time"),
    ],
  },
  {
    kind: "link-routing", area: "discovery", label: "Link routing", purpose: "Records an OpenURL or direct-link route and its known-good evidence.",
    fields: [
      f("resolver_target", "Resolver target", "Public HTTPS resolver or target endpoint.", "uri", true),
      f("knowledge_base", "Knowledge base", "Knowledge-base or holdings source.", "text", true),
      f("proxy_rule", "Proxy rule", "Rule or stanza identifier, never a credential.", "identifier"),
      f("test_identifier", "Known-item identifier", "DOI, ISBN, ISSN, or local ID used as a control.", "identifier", true),
      f("expected_route", "Expected route", "Human-readable success path.", "long-text", true),
      f("last_verified", "Last verified", "Time the route most recently passed.", "date-time"),
    ],
  },
  {
    kind: "condition-assessment", area: "preservation", label: "Condition assessment", purpose: "Captures a bounded condition decision and its next review.",
    fields: [
      f("object_identifier", "Object identifier", "Stable collection, item, or container identifier.", "identifier", true),
      f("material_type", "Material type", "Primary physical or digital material.", "text", true),
      f("condition_rating", "Condition rating", "Locally defined condition band.", "controlled-term", true, false, ["stable", "monitor", "treatment-needed", "do-not-handle"]),
      f("hazards", "Hazards", "Known handling, mold, media, or environmental hazards.", "long-text", false, true),
      f("housing", "Housing", "Current enclosure or storage housing.", "text"),
      f("assessed_on", "Assessed on", "Assessment date.", "date", true),
      f("next_review", "Next review", "Scheduled reassessment date.", "date"),
    ],
  },
  {
    kind: "preservation-action", area: "preservation", label: "Preservation action", purpose: "Records a preservation event with before-and-after integrity evidence.",
    fields: [
      f("action_type", "Action type", "Treatment, migration, normalization, rehousing, or fixity action.", "controlled-term", true, false, ["treatment", "rehousing", "stabilization", "digitization", "migration", "normalization", "fixity-check"]),
      f("object_identifier", "Object identifier", "Stable identifier for the object acted upon.", "identifier", true),
      f("performed_on", "Performed on", "Date of the action.", "date", true),
      f("agent_role", "Agent role", "Responsible role; avoid personal data unless institutionally required.", "text", true),
      f("action_note", "Action note", "Materials, methods, outcomes, and exceptions.", "long-text", true),
      f("before_checksum", "Before checksum", "Pre-action fixity value when applicable.", "checksum"),
      f("after_checksum", "After checksum", "Post-action fixity value when applicable.", "checksum"),
      f("storage_location", "Storage location", "Controlled storage reference, not a secret URL.", "text"),
    ],
  },
  {
    kind: "acquisition-order", area: "technical-services", label: "Acquisition order", purpose: "Tracks order-to-receipt state and identifiers needed for reconciliation.",
    fields: [
      f("order_id", "Order ID", "Stable order identifier.", "identifier", true),
      f("vendor", "Vendor", "Supplier or source.", "text", true),
      f("fund_code", "Fund code", "Local fund identifier.", "identifier"),
      f("ordered_on", "Ordered on", "Order date.", "date", true),
      f("received_on", "Received on", "Receipt date, when complete.", "date"),
      f("order_status", "Order status", "Current acquisition state.", "controlled-term", true, false, ["requested", "approved", "ordered", "partially-received", "received", "cancelled", "claimed"]),
      f("invoice_reference", "Invoice reference", "Invoice identifier only; do not store payment credentials.", "identifier"),
    ],
  },
  {
    kind: "metadata-job", area: "technical-services", label: "Metadata job", purpose: "Makes a repeatable metadata transformation observable and reversible.",
    fields: [
      f("job_name", "Job name", "Stable name of the batch or pipeline.", "identifier", true),
      f("source_format", "Source format", "Input syntax and profile.", "text", true),
      f("target_format", "Target format", "Output syntax and profile.", "text", true),
      f("mapping_version", "Mapping version", "Versioned transformation ruleset.", "identifier", true),
      f("authority_sources", "Authority sources", "Controlled vocabularies or identity services consulted.", "text", false, true),
      f("record_count", "Record count", "Number of records processed.", "integer"),
      f("last_run", "Last run", "Most recent completed execution.", "date-time"),
      f("rollback_reference", "Rollback reference", "Revision, batch, or restore identifier.", "identifier"),
    ],
  },
  {
    kind: "accession", area: "special-collections", label: "Accession", purpose: "Tracks custody, status, extent, restrictions, and processing priority.",
    fields: [
      f("accession_number", "Accession number", "Stable accession identifier.", "identifier", true),
      f("source_type", "Source type", "Transfer, gift, purchase, deposit, or other custody basis.", "controlled-term", true, false, ["transfer", "gift", "purchase", "deposit", "unknown"]),
      f("received_on", "Received on", "Date custody was received.", "date", true),
      f("extent", "Extent", "Quantity and form at accession.", "text", true),
      f("deed_status", "Agreement status", "Status of the deed, transfer, or deposit instrument.", "controlled-term", false, false, ["not-required", "pending", "executed", "incomplete", "unknown"]),
      f("restrictions", "Restrictions", "Access, use, privacy, or legal restrictions; avoid unnecessary personal data.", "long-text"),
      f("processing_priority", "Processing priority", "Locally assigned priority.", "controlled-term", false, false, ["low", "normal", "high", "urgent"]),
    ],
  },
  {
    kind: "processing-plan", area: "special-collections", label: "Processing plan", purpose: "Connects arrangement and description decisions to effort, standards, and completion.",
    fields: [
      f("collection_identifier", "Collection identifier", "Identifier for the collection or accession.", "identifier", true),
      f("processing_level", "Processing level", "Intended level of arrangement and description.", "controlled-term", true, false, ["collection", "series", "file", "item", "minimal"]),
      f("arrangement", "Arrangement", "Proposed intellectual and physical arrangement.", "long-text", true),
      f("description_standard", "Description standard", "DACS, local, or other declared standard.", "text", true),
      f("estimated_hours", "Estimated hours", "Expected processing effort.", "decimal"),
      f("born_digital", "Born-digital material", "Whether the plan includes born-digital records.", "boolean"),
      f("target_completion", "Target completion", "Planned completion date.", "date"),
    ],
  },
  {
    kind: "dataset-custody", area: "data-services", label: "Dataset custody", purpose: "Documents stewardship, fixity, access, retention, and repository location.",
    fields: [
      f("persistent_id", "Persistent identifier", "DOI, ARK, Handle, or stable local identifier.", "identifier", true),
      f("repository", "Repository", "Repository or managed storage service.", "text", true),
      f("steward_role", "Steward role", "Role accountable for custody and review.", "text", true),
      f("media_type", "Primary media type", "IANA media type for the primary content.", "media-type"),
      f("checksum", "Checksum", "Fixity value for a declared object or package.", "checksum"),
      f("retention_rule", "Retention rule", "Retention period and disposal or transfer trigger.", "long-text", true),
      f("access_level", "Access level", "Current access classification.", "controlled-term", true, false, ["open", "campus", "mediated", "embargoed", "restricted"]),
      f("embargo_until", "Embargo until", "End date of an embargo, when present.", "date"),
    ],
  },
  {
    kind: "data-management-plan", area: "data-services", label: "Data management plan", purpose: "Operationalizes storage, backup, formats, rights, and retention commitments.",
    fields: [
      f("project_identifier", "Project identifier", "Stable project or award identifier.", "identifier", true),
      f("funder", "Funder", "Funding or sponsoring organization.", "text"),
      f("storage_tier", "Storage tier", "Approved working, protected, archival, or restricted tier.", "text", true),
      f("backup_schedule", "Backup schedule", "Frequency, copies, and restore-verification expectation.", "long-text", true),
      f("file_formats", "File formats", "Expected or preferred file formats.", "text", true, true),
      f("retention_period", "Retention period", "Required retention and disposition trigger.", "text", true),
      f("rights_basis", "Rights basis", "Ownership, license, consent, or legal basis for management and sharing.", "long-text"),
    ],
  },
  {
    kind: "copy-provenance", area: "rare-materials", label: "Copy provenance", purpose: "Records copy-specific history, marks, binding, and verification.",
    fields: [
      f("shelfmark", "Shelfmark", "Stable local copy or item identifier.", "identifier", true),
      f("imprint", "Imprint", "Place, agent, and date of production or publication.", "text", true),
      f("copy_note", "Copy note", "Copy-specific features not represented by the general bibliographic record.", "long-text", true),
      f("provenance_events", "Provenance events", "Chronological ownership, custody, sale, gift, or transfer evidence.", "long-text", false, true),
      f("binding", "Binding", "Binding structure, materials, decoration, and date when known.", "long-text"),
      f("marks", "Marks of ownership or use", "Bookplates, inscriptions, annotations, stamps, or other evidence.", "long-text", false, true),
      f("cataloging_standard", "Cataloging standard", "DCRM, RDA, or other declared standard.", "text"),
      f("verified_on", "Verified on", "Date the copy-specific evidence was last reviewed.", "date"),
    ],
  },
  {
    kind: "conservation-treatment", area: "rare-materials", label: "Conservation treatment", purpose: "Records treatment intent, materials, outcome, and aftercare for a rare object.",
    fields: [
      f("object_identifier", "Object identifier", "Stable copy, item, or component identifier.", "identifier", true),
      f("treatment_type", "Treatment type", "Primary conservation intervention.", "text", true),
      f("condition_before", "Condition before", "Documented pre-treatment condition.", "long-text", true),
      f("materials_used", "Materials used", "Materials introduced during treatment.", "text", false, true),
      f("treatment_date", "Treatment date", "Date treatment was completed.", "date", true),
      f("conservator_role", "Conservator role", "Responsible role or unit.", "text", true),
      f("aftercare", "Aftercare", "Handling, housing, environment, or monitoring instructions.", "long-text"),
      f("next_review", "Next review", "Scheduled condition review date.", "date"),
    ],
  },
];

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_RECORDS = 1000;

export function makeServiceRecord(kind: string, id: string, at = new Date().toISOString()): ServiceRecord {
  const definition = serviceDefinition(kind);
  const record: ServiceRecord = {
    id: clean(id, 128),
    kind: definition.kind,
    area: definition.area,
    title: "",
    state: "review",
    ownerRole: "",
    system: "",
    sensitivity: "internal",
    values: Object.fromEntries(definition.fields.filter((item) => item.kind === "boolean").map((item) => [item.id, false])),
    createdAt: exactDate(at, "Created time"),
    updatedAt: exactDate(at, "Updated time"),
  };
  return record;
}

export function validateServiceRecords(records: ServiceRecord[]): void {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) throw new Error(`A workspace may contain no more than ${MAX_RECORDS.toLocaleString()} service records.`);
  const ids = new Set<string>();
  for (const record of records) {
    if (!SAFE_ID.test(record.id) || ids.has(record.id)) throw new Error("Service record IDs must be safe and unique.");
    ids.add(record.id);
    const definition = serviceDefinition(record.kind);
    if (record.area !== definition.area) throw new Error("Service record area does not match its record type.");
    assertCanonicalText(record.title, 500, "Service record title", true);
    assertCanonicalText(record.ownerRole, 160, "Service record owner role");
    assertCanonicalText(record.system, 256, "Service record system");
    if (!["active", "review", "due", "blocked", "retired"].includes(record.state)) throw new Error("Service record state is invalid.");
    if (!["public", "internal", "restricted"].includes(record.sensitivity)) throw new Error("Service record sensitivity is invalid.");
    const createdAt = exactDate(record.createdAt, "Created time");
    const updatedAt = exactDate(record.updatedAt, "Updated time");
    if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error("Service record updated time precedes creation.");
    if (!plainObject(record.values) || Object.keys(record.values).length > 64) throw new Error("Service record values are invalid.");
    const fields = new Map(definition.fields.map((item) => [item.id, item]));
    for (const key of Object.keys(record.values)) {
      if (FORBIDDEN_KEYS.has(key) || !fields.has(key)) throw new Error(`Unknown service field: ${key}.`);
    }
    for (const field of definition.fields) {
      const value = record.values[field.id];
      if (field.required && empty(value)) throw new Error(`${field.label} is required.`);
      if (value !== undefined) validateValue(value, field);
    }
  }
}

export function serviceDefinition(kind: string): ServiceRecordDefinition {
  const definition = SERVICE_RECORD_DEFINITIONS.find((item) => item.kind === kind);
  if (!definition) throw new Error("Service record type is unsupported.");
  return definition;
}

export function formatServiceRegister(records: ServiceRecord[], format: ServiceExchangeFormat, exportedAt = new Date().toISOString()): string {
  validateServiceRecords(records);
  if (format === "service-json") {
    return JSON.stringify({ schema: "in-keeping/service-register", version: 1, exportedAt: exactDate(exportedAt, "Export time"), records }, null, 2);
  }
  const headers = ["record_id", "area", "record_type", "title", "state", "owner_role", "system", "sensitivity", "field_id", "field_type", "value_index", "value", "created_at", "updated_at"];
  const rows: string[][] = [];
  for (const record of records) {
    const definition = serviceDefinition(record.kind);
    const values = definition.fields.flatMap((field) => {
      const raw = record.values[field.id];
      const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
      return list.map((value, index) => [record.id, record.area, record.kind, record.title, record.state, record.ownerRole, record.system, record.sensitivity, field.id, field.kind, String(index + 1), scalar(value), record.createdAt, record.updatedAt]);
    });
    if (values.length) rows.push(...values);
    else rows.push([record.id, record.area, record.kind, record.title, record.state, record.ownerRole, record.system, record.sensitivity, "", "", "", "", record.createdAt, record.updatedAt]);
  }
  return [headers, ...rows].map((row) => row.map(csv).join(",")).join("\n") + "\n";
}

export function serviceFilename(workspaceName: string, format: ServiceExchangeFormat): string {
  const safe = workspaceName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return `${safe}.service-register.${format === "service-json" ? "json" : "csv"}`;
}

export function serviceMime(format: ServiceExchangeFormat): string {
  return format === "service-json" ? "application/json" : "text/csv";
}

function validateValue(value: ServiceValue, field: ServiceFieldDefinition): void {
  if (Array.isArray(value)) {
    if (!field.repeatable) throw new Error(`${field.label} is not repeatable.`);
    if (value.length > 100) throw new Error(`${field.label} exceeds 100 values.`);
    value.forEach((entry) => validateScalar(entry, field));
  } else {
    validateScalar(value, field);
  }
}

function validateScalar(value: string | boolean | number, field: ServiceFieldDefinition): void {
  if (field.kind === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${field.label} must be true or false.`);
    return;
  }
  if (field.kind === "integer" || field.kind === "decimal") {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000 || (field.kind === "integer" && !Number.isInteger(value))) throw new Error(`${field.label} must be a bounded finite ${field.kind}.`);
    return;
  }
  if (typeof value !== "string") throw new Error(`${field.label} must be text.`);
  const maximum = field.kind === "long-text" ? 4000 : 1000;
  const text = assertCanonicalText(value, maximum, field.label, field.required);
  if (!text) return;
  if (field.kind === "date" && !calendarDate(text)) throw new Error(`${field.label} must be a real calendar date using YYYY-MM-DD.`);
  if (field.kind === "date-time") exactDate(text, field.label);
  if (field.kind === "identifier" && !/^[^\s<>]{1,256}$/.test(text)) throw new Error(`${field.label} contains unsafe identifier characters.`);
  if (field.kind === "uri") validatePublicUrl(text, field.label);
  if (field.kind === "controlled-term" && field.vocabulary?.length && !field.vocabulary.includes(text)) throw new Error(`${field.label} must use its declared vocabulary.`);
  if (field.kind === "checksum" && !/^(?:[a-z0-9][a-z0-9-]{1,31}:)?[a-fA-F0-9]{32,128}$/.test(text)) throw new Error(`${field.label} must be a labeled or hexadecimal checksum.`);
  if (field.kind === "media-type" && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(text)) throw new Error(`${field.label} must be an IANA-style media type.`);
}

function validatePublicUrl(value: string, label: string): void {
  const review = reviewPublicHttpsUrl(value);
  if (!review.ok) throw new Error(`${label}: ${review.reason}`);
}

function clean(value: string, maximum: number, required = false): string {
  if (typeof value !== "string") throw new Error("Expected text.");
  const normalized = value.normalize("NFC").trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) throw new Error("Text contains disallowed control characters.");
  if (required && !normalized) throw new Error("A required value is blank.");
  if (normalized.length > maximum) throw new Error(`Text exceeds ${maximum.toLocaleString()} characters.`);
  return normalized;
}

function assertCanonicalText(value: string, maximum: number, label: string, required = false): string {
  const normalized = clean(value, maximum, required);
  if (normalized !== value) throw new Error(`${label} must use NFC Unicode without surrounding whitespace.`);
  return normalized;
}

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function exactDate(value: string, label: string): string {
  const match = typeof value === "string" ? value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/) : null;
  const canonical = match ? `${match[1]}.${match[2] ?? "000"}Z` : "";
  if (!match || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== canonical) throw new Error(`${label} must be an ISO 8601 UTC instant.`);
  return value;
}

function empty(value: ServiceValue | undefined): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function plainObject(value: unknown): value is Record<string, ServiceValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scalar(value: string | boolean | number): string { return typeof value === "string" ? value : String(value); }

function csv(value: string): string {
  const safe = protectSpreadsheetCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
