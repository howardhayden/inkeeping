import { reviewPublicHttpsUrl } from "./public-url.ts";
import { assertSafeJsonText } from "./json-safety.ts";
import { assertIdentityText } from "./identity-safety.ts";
import { assertSafeXmlText, assertXmlElementNamespaces } from "./xml-safety.ts";

export type ArchiveFieldKind =
  | "text"
  | "long-text"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "date-time"
  | "edtf"
  | "identifier"
  | "uri"
  | "language-code"
  | "media-type"
  | "checksum"
  | "controlled-term"
  | "record-reference"
  | "agent-reference";

export type ArchiveRecordType =
  | "description"
  | "accession"
  | "authority"
  | "agent"
  | "repository"
  | "digital-object"
  | "rights"
  | "event"
  | "subject"
  | "location";

export type ArchiveLevel = "repository" | "fonds" | "collection" | "record-group" | "series" | "subseries" | "file" | "item" | "other";
export type ArchiveProfile = "blank" | "dacs" | "ead4" | "ead3" | "ead2002" | "archives-space" | "atom" | "ric";

export type ArchiveField = {
  id: string;
  label: string;
  definition: string;
  kind: ArchiveFieldKind;
  required: boolean;
  repeatable: boolean;
  vocabulary: string[];
  mappings: { ead: string; archivesSpace: string; atom: string; ric: string };
};

export type ArchiveSchema = {
  id: string;
  name: string;
  description: string;
  profile: ArchiveProfile;
  /** Omitted only by pre-archive-v2 local snapshots; new schemas always persist it. */
  recordType?: ArchiveRecordType;
  version: number;
  fields: ArchiveField[];
  createdAt: string;
  updatedAt: string;
};

export type ArchiveValue = string | string[] | boolean | boolean[] | number | number[];

export type ArchiveUnit = {
  id: string;
  schemaId: string;
  schemaVersion: number;
  parentId: string | null;
  level: ArchiveLevel;
  values: Record<string, ArchiveValue>;
  /** Missing values in legacy snapshots are interpreted as private. */
  published?: boolean;
  /** BCP 47 language tag for the description, not the described material. */
  language?: string;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveExchangeFormat = "ead4" | "ead3" | "ead2002" | "archives-space-csv" | "atom-csv" | "dctap-csv" | "schema-package";

export type ArchiveImportReview = {
  filename: string;
  bytes: number;
  digest: string;
  format: string;
  schema: ArchiveSchema | null;
  units: ArchiveUnit[];
  blocked: boolean;
  summary: string;
};

// A successful review is a short-lived capability, not a serializable claim.
// The private binding prevents callers from substituting a coherent-looking
// schema/record set after the file bytes were reviewed.
const archiveImportReviewBindings = new WeakMap<ArchiveImportReview, string>();

export const ARCHIVE_EXCHANGE_FORMATS: { value: ArchiveExchangeFormat; label: string; extension: string; mime: string }[] = [
  { value: "ead4", label: "EAD 4.0 XML", extension: "ead4.xml", mime: "application/xml" },
  { value: "ead3", label: "EAD3 XML", extension: "ead3.xml", mime: "application/xml" },
  { value: "ead2002", label: "EAD 2002 XML", extension: "ead.xml", mime: "application/xml" },
  { value: "archives-space-csv", label: "ArchivesSpace AO crosswalk CSV", extension: "aspace-ao.csv", mime: "text/csv" },
  { value: "atom-csv", label: "AtoM ISAD CSV", extension: "atom.csv", mime: "text/csv" },
  { value: "dctap-csv", label: "DCTAP schema CSV", extension: "dctap.csv", mime: "text/csv" },
  { value: "schema-package", label: "Lossless schema package", extension: "archive-schema.json", mime: "application/json" },
];

export const ARCHIVE_LEVELS: ArchiveLevel[] = ["repository", "fonds", "collection", "record-group", "series", "subseries", "file", "item", "other"];
export const ARCHIVE_FIELD_KINDS: ArchiveFieldKind[] = ["text", "long-text", "integer", "decimal", "boolean", "date", "date-time", "edtf", "identifier", "uri", "language-code", "media-type", "checksum", "controlled-term", "record-reference", "agent-reference"];
export const ARCHIVE_RECORD_TYPES: ArchiveRecordType[] = ["description", "accession", "authority", "agent", "repository", "digital-object", "rights", "event", "subject", "location"];

/**
 * Parses the editor contract literally: each nonempty line is one value.
 * Semicolons and surrounding whitespace remain data so validation, rather than
 * an invisible UI normalization, decides whether a value is admissible.
 */
export function parseOneValuePerLine(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.length > 0);
}

/** Keeps empty draft lines so a controlled textarea does not eat Enter. */
export function parseOneValuePerLineDraft(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

export function normalizeArchiveEditorValues(schema: ArchiveSchema, draft: Record<string, ArchiveValue>): Record<string, ArchiveValue> {
  const normalized = { ...draft };
  for (const field of schema.fields) {
    const current = normalized[field.id];
    if (!field.repeatable || !Array.isArray(current)) continue;
    if (!current.every((entry) => typeof entry === "string")) continue;
    const lines = current.filter((entry) => entry.length > 0);
    if (!lines.length) {
      delete normalized[field.id];
      continue;
    }
    if ((field.kind === "integer" || field.kind === "decimal") && lines.every(canonicalNumericDraft)) {
      normalized[field.id] = lines.map(Number);
    } else if (field.kind === "boolean" && lines.every((entry) => /^(?:true|false)$/.test(entry))) {
      normalized[field.id] = lines.map((entry) => entry === "true");
    } else {
      normalized[field.id] = lines;
    }
  }
  return normalized;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SCHEMAS = 50;
const MAX_FIELDS = 128;
const MAX_UNITS = 5000;
const MAX_VALUES = 250;
const MAX_DEPTH = 32;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const EAD4_NS = "https://standards.openpreservation.org/ead/v4";
const EAD3_NS = "http://ead3.archivists.org/schema/";
const EAD2002_NS = "urn:isbn:1-931666-22-9";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const EAD_CORE_RULES = {
  reference_code: { kind: "identifier", repeatable: false, mapping: "unitId" },
  title: { kind: "text", repeatable: false, mapping: "unitTitle" },
  dates: { kind: "edtf", repeatable: true, mapping: "unitDate" },
  creator: { kind: "text", repeatable: true, mapping: "agents" },
  extent: { kind: "text", repeatable: true, mapping: "extent" },
  scope_content: { kind: "long-text", repeatable: false, mapping: "scopeContent" },
  arrangement: { kind: "long-text", repeatable: false, mapping: "arrangement" },
  access_conditions: { kind: "long-text", repeatable: false, mapping: "accessConditions" },
  use_conditions: { kind: "long-text", repeatable: false, mapping: "useConditions" },
  language: { kind: "language-code", repeatable: true, mapping: "languageOfMaterial" },
  repository: { kind: "text", repeatable: false, mapping: "repository" },
  subjects: { kind: "controlled-term", repeatable: true, mapping: "subjectHeadings" },
  related_material: { kind: "long-text", repeatable: true, mapping: "relatedMaterial" },
  digital_object_uri: { kind: "uri", repeatable: true, mapping: "formsAvailable" },
  note: { kind: "long-text", repeatable: true, mapping: "otherDescription" },
} as const satisfies Record<string, { kind: ArchiveFieldKind; repeatable: boolean; mapping: string }>;
const ATOM_CSV_HEADERS = [
  "legacyId", "parentId", "identifier", "title", "levelOfDescription", "eventDates", "eventTypes", "eventActors",
  "extentAndMedium", "scopeAndContent", "arrangement", "accessConditions", "reproductionConditions", "language",
  "subjectAccessPoints", "relatedUnitsOfDescription", "digitalObjectURI", "generalNote", "culture", "publicationStatus",
] as const;
const ARCHIVES_SPACE_CSV_HEADERS = ["ead", "res_uri", "hierarchy", "parent_ref_id", "level", "other_level", "title", "unit_id", "ref_id", "publish", "langcode", "dates", "creators", "extents", "n_scopecontent", "n_arrangement", "n_accessrestrict", "n_userestrict", "n_relatedmaterial", "n_odd", "digital_object_uri"] as const;
const ARCHIVES_SPACE_CSV_LABELS = ["Resource EAD ID", "Resource URI", "Hierarchy depth", "Parent reference ID", "Level", "Other level", "Title", "Component ID", "Reference ID", "Publish", "Description language", "Dates", "Creators", "Extents", "Scope and content note", "Arrangement note", "Access restriction note", "Use restriction note", "Related material note", "General note", "Digital object URI"] as const;

const field = (
  id: string,
  label: string,
  definition: string,
  kind: ArchiveFieldKind,
  required = false,
  repeatable = false,
  ead = id,
  archivesSpace = id,
  atom = id,
  ric = id,
): ArchiveField => ({ id, label, definition, kind, required, repeatable, vocabulary: [], mappings: { ead, archivesSpace, atom, ric } });

const descriptiveFields = (): ArchiveField[] => [
  field("reference_code", "Reference code", "The unique local identifier for this unit of description.", "identifier", true, false, "unitId", "unit_id", "identifier", "identifier"),
  field("title", "Title", "The supplied or devised title of the archival unit.", "text", true, false, "unitTitle", "title", "title", "name"),
  field("dates", "Dates", "Inclusive, bulk, open, or uncertain dates expressed with EDTF notation.", "edtf", false, true, "unitDate", "dates", "eventDates", "date"),
  field("creator", "Creator", "The person, family, or organization responsible for creating the records.", "text", false, true, "agents", "creators", "eventActors", "hasOrHadAgent"),
  field("extent", "Extent", "The quantity and physical or digital form of the materials.", "text", false, true, "extent", "extents", "extentAndMedium", "quantity"),
  field("scope_content", "Scope and content", "A narrative describing the nature and content of the materials.", "long-text", false, false, "scopeContent", "n_scopecontent", "scopeAndContent", "scope"),
  field("arrangement", "Arrangement", "The organization or ordering of the materials.", "long-text", false, false, "arrangement", "n_arrangement", "arrangement", "classification"),
  field("access_conditions", "Conditions governing access", "Restrictions or conditions controlling access.", "long-text", false, false, "accessConditions", "n_accessrestrict", "accessConditions", "conditionsOfAccess"),
  field("use_conditions", "Conditions governing use", "Restrictions or conditions controlling reproduction or use.", "long-text", false, false, "useConditions", "n_userestrict", "reproductionConditions", "conditionsOfUse"),
  field("language", "Language of material", "BCP 47 language codes for the described materials.", "language-code", false, true, "languageOfMaterial", "language_of_material", "language", "language"),
  field("repository", "Repository", "The institution responsible for custody of the materials.", "text", false, false, "repository", "repository", "repository", "isOrWasHeldBy"),
  field("subjects", "Subjects", "Controlled topical, geographic, genre, occupation, or name access points.", "controlled-term", false, true, "subjectHeadings", "subjects", "subjectAccessPoints", "hasOrHadSubject"),
  field("related_material", "Related material", "References to related archival or published material.", "long-text", false, true, "relatedMaterial", "n_relatedmaterial", "relatedUnitsOfDescription", "hasOrHadRelation"),
  field("digital_object_uri", "Digital object URI", "A public HTTPS location for a digital representation.", "uri", false, true, "formsAvailable", "digital_object_uri", "digitalObjectURI", "digitalInstantiation"),
  field("note", "General note", "Additional descriptive information not represented elsewhere.", "long-text", false, true, "otherDescription", "n_odd", "generalNote", "descriptiveNote"),
];

export const ARCHIVE_PROFILES: { value: ArchiveProfile; label: string; description: string }[] = [
  { value: "blank", label: "Blank", description: "Begin with only identifier and title." },
  { value: "dacs", label: "DACS description", description: "A practical DACS-aligned descriptive core." },
  { value: "ead4", label: "EAD 4.0", description: "Current Encoded Archival Description exchange." },
  { value: "ead3", label: "EAD3", description: "Legacy exchange retained for installed systems." },
  { value: "ead2002", label: "EAD 2002", description: "Broad legacy ArchivesSpace and AtoM compatibility." },
  { value: "archives-space", label: "ArchivesSpace", description: "Archival-object crosswalk plus EAD 2002 round-trip exchange." },
  { value: "atom", label: "AtoM", description: "ISAD(G)-oriented CSV crosswalk." },
  { value: "ric", label: "RiC-inspired", description: "A declarative relationship-oriented crosswalk; not a RiC-O serializer." },
];

export function makeArchiveSchema(profile: ArchiveProfile, name: string, id: string, at = new Date().toISOString()): ArchiveSchema {
  const fields = profile === "blank" ? descriptiveFields().slice(0, 2) : descriptiveFields();
  const schema: ArchiveSchema = {
    id,
    name: clean(name, 120),
    description: ARCHIVE_PROFILES.find((item) => item.value === profile)?.description ?? "",
    profile,
    recordType: "description",
    version: 1,
    fields,
    createdAt: at,
    updatedAt: at,
  };
  validateArchiveSchema(schema);
  return schema;
}

export function validateArchiveSchema(schema: ArchiveSchema): void {
  if (!safeId(schema.id)) throw new Error("Schema ID must use safe letters, numbers, dots, underscores, colons, or hyphens.");
  canonicalText(schema.name, 120, "Schema name", true);
  canonicalText(schema.description, 1000, "Schema description");
  if (!ARCHIVE_PROFILES.some((item) => item.value === schema.profile)) throw new Error("Schema profile is unsupported.");
  if (schema.recordType !== undefined && !ARCHIVE_RECORD_TYPES.includes(schema.recordType)) throw new Error("Archive record type is unsupported.");
  if (!Number.isInteger(schema.version) || schema.version < 1 || schema.version > 1000) throw new Error("Schema version is invalid.");
  isoInstant(schema.createdAt, "Schema createdAt");
  isoInstant(schema.updatedAt, "Schema updatedAt");
  if (Date.parse(schema.updatedAt) < Date.parse(schema.createdAt)) throw new Error("Schema updatedAt precedes createdAt.");
  if (!Array.isArray(schema.fields) || schema.fields.length < 1 || schema.fields.length > MAX_FIELDS) throw new Error(`A schema must contain 1–${MAX_FIELDS} fields.`);

  const ids = new Set<string>();
  const targetMappings = { ead: new Set<string>(), archivesSpace: new Set<string>(), atom: new Set<string>(), ric: new Set<string>() };
  for (const item of schema.fields) {
    if (!safeId(item.id) || ids.has(item.id)) throw new Error("Schema field IDs must be safe and unique.");
    ids.add(item.id);
    canonicalText(item.label, 120, "Schema field label", true);
    canonicalText(item.definition, 500, "Schema field definition", true);
    if (!ARCHIVE_FIELD_KINDS.includes(item.kind)) throw new Error("Schema field type is unsupported.");
    if (typeof item.required !== "boolean" || typeof item.repeatable !== "boolean") throw new Error("Schema field flags are invalid.");
    if (!Array.isArray(item.vocabulary) || item.vocabulary.length > MAX_VALUES) throw new Error(`Controlled vocabulary exceeds ${MAX_VALUES} terms.`);
    const vocabulary = new Set<string>();
    item.vocabulary.forEach((value) => {
      const canonical = canonicalText(value, 256, "Controlled vocabulary term", true);
      if (canonical.includes("\n")) throw new Error("Controlled vocabulary terms cannot contain line breaks; use one term per line.");
      if (vocabulary.has(canonical)) throw new Error("Controlled vocabulary terms must be unique.");
      vocabulary.add(canonical);
    });
    for (const target of ["ead", "archivesSpace", "atom", "ric"] as const) {
      const mapping = canonicalText(item.mappings[target], 256, `${target} mapping`);
      if (!mapping) continue;
      const key = mapping.toLowerCase();
      if (targetMappings[target].has(key)) throw new Error(`${target} mappings must be unique.`);
      targetMappings[target].add(key);
    }
  }
  if (schemaRecordType(schema) === "description" && !schema.fields.some((item) => item.id === "title")) throw new Error("A descriptive schema requires a title field.");
}

export function validateArchiveUnit(unit: ArchiveUnit, schema: ArchiveSchema, allUnits: ArchiveUnit[], schemaUnitIds?: ReadonlySet<string>): void {
  if (!safeId(unit.id)) throw new Error("Archival record ID is invalid.");
  if (unit.schemaId !== schema.id) throw new Error("Archival record and schema do not match.");
  if (!Number.isInteger(unit.schemaVersion) || unit.schemaVersion !== schema.version) throw new Error("Archival record schema version is not current.");
  if (!ARCHIVE_LEVELS.includes(unit.level)) throw new Error("Archival level is unsupported.");
  if (schemaRecordType(schema) !== "description" && (unit.level !== "other" || unit.parentId !== null)) throw new Error("Non-description archival records must use level other and cannot use the descriptive hierarchy.");
  if (unit.parentId !== null && !safeId(unit.parentId)) throw new Error("Archival parent ID is invalid.");
  if (unit.parentId === unit.id) throw new Error("Archival record cannot be its own parent.");
  if (unit.parentId && !(schemaUnitIds ? schemaUnitIds.has(unit.parentId) : allUnits.some((item) => item.id === unit.parentId && item.schemaId === unit.schemaId))) throw new Error("Archival parent is missing or belongs to another schema.");
  if (unit.published !== undefined && typeof unit.published !== "boolean") throw new Error("Publication state must be true or false.");
  if (unit.language !== undefined && !languageTag(unit.language)) throw new Error("Description language must be a BCP 47 tag.");
  isoInstant(unit.createdAt, "Record createdAt");
  isoInstant(unit.updatedAt, "Record updatedAt");
  if (Date.parse(unit.updatedAt) < Date.parse(unit.createdAt)) throw new Error("Record updatedAt precedes createdAt.");
  if (!plainObject(unit.values) || Object.keys(unit.values).length > MAX_FIELDS) throw new Error("Archival field values are invalid.");

  const fields = new Map(schema.fields.map((item) => [item.id, item]));
  for (const key of Object.keys(unit.values)) {
    if (FORBIDDEN_KEYS.has(key) || !fields.has(key)) throw new Error(`Unknown archival field: ${key}.`);
  }
  for (const item of schema.fields) {
    const value = unit.values[item.id];
    if (item.required && empty(value)) throw new Error(`${item.label} is required.`);
    if (value !== undefined) validateArchiveValue(value, item);
  }
}

export function validateArchiveSet(schemas: ArchiveSchema[], units: ArchiveUnit[]): void {
  if (!Array.isArray(schemas) || schemas.length > MAX_SCHEMAS) throw new Error(`A workspace may contain no more than ${MAX_SCHEMAS} archival schemas.`);
  if (!Array.isArray(units) || units.length > MAX_UNITS) throw new Error(`A workspace may contain no more than ${MAX_UNITS.toLocaleString()} archival records.`);

  const schemaById = new Map<string, ArchiveSchema>();
  for (const schema of schemas) {
    if (schemaById.has(schema.id)) throw new Error("Archival schema IDs must be unique.");
    validateArchiveSchema(schema);
    schemaById.set(schema.id, schema);
  }
  const unitById = new Map<string, ArchiveUnit>();
  const unitIdsBySchema = new Map<string, Set<string>>();
  for (const unit of units) {
    if (unitById.has(unit.id)) throw new Error("Archival record IDs must be unique across the workspace.");
    unitById.set(unit.id, unit);
    const ids = unitIdsBySchema.get(unit.schemaId) ?? new Set<string>();
    ids.add(unit.id);
    unitIdsBySchema.set(unit.schemaId, ids);
  }
  for (const unit of units) {
    const schema = schemaById.get(unit.schemaId);
    if (!schema) throw new Error("Archival record references a missing schema.");
    validateArchiveUnit(unit, schema, units, unitIdsBySchema.get(unit.schemaId));
  }

  const referenceCodeOwners = new Map<string, string>();
  for (const unit of units) {
    const raw = unit.values.reference_code;
    const referenceCodes = Array.isArray(raw) ? raw : [raw];
    for (const referenceCode of referenceCodes) {
      if (typeof referenceCode !== "string" || !referenceCode) continue;
      const owner = referenceCodeOwners.get(referenceCode);
      if (owner && owner !== unit.id) throw new Error("Archival reference codes must be unique across distinct records.");
      referenceCodeOwners.set(referenceCode, unit.id);
    }
  }

  const depths = new Map<string, number>();
  for (const start of units) {
    if (depths.has(start.id)) continue;
    const path: ArchiveUnit[] = [];
    const positions = new Set<string>();
    let cursor: ArchiveUnit | undefined = start;
    let baseDepth = 0;
    while (cursor) {
      const cached = depths.get(cursor.id);
      if (cached !== undefined) { baseDepth = cached; break; }
      if (positions.has(cursor.id)) throw new Error("Archival hierarchy contains a cycle.");
      positions.add(cursor.id);
      path.push(cursor);
      cursor = cursor.parentId ? unitById.get(cursor.parentId) : undefined;
    }
    for (let index = path.length - 1; index >= 0; index -= 1) {
      baseDepth += 1;
      if (baseDepth > MAX_DEPTH + 1) throw new Error(`Archival hierarchy exceeds ${MAX_DEPTH} component levels.`);
      depths.set(path[index].id, baseDepth);
    }
  }
}

export function formatArchive(schema: ArchiveSchema, units: ArchiveUnit[], format: ArchiveExchangeFormat): string {
  validateArchiveSet([schema], units);
  assertArchiveSourceBudget(schema, units);
  let output: string;
  if (format === "schema-package") output = JSON.stringify({ schema: "in-keeping/archive-schema", version: 2, exportedAt: new Date().toISOString(), definition: canonicalSchema(schema), records: units.map(canonicalUnit) }, null, 2);
  else if (format === "dctap-csv") output = dctapCsv(schema);
  else {
    if (schemaRecordType(schema) !== "description") throw new Error("EAD and archival-management CSV exports are available only for descriptive record schemas. Use DCTAP or the lossless schema package for this record type.");
    if (!units.length && ["ead4", "ead3", "ead2002"].includes(format)) throw new Error("EAD export requires exactly one root description.");
    if (!units.length) throw new Error("This exchange format requires at least one archival record.");
    if (format === "archives-space-csv") output = archivesSpaceCsv(schema, units);
    else if (format === "atom-csv") output = atomCsv(schema, units);
    else {
      const roots = units.filter((unit) => unit.parentId === null);
      if (roots.length !== 1) throw new Error("EAD export requires exactly one root description.");
      assertEadCoreOnly(schema, units);
      output = format === "ead4" ? ead4Xml(schema, units, roots[0]) : format === "ead3" ? ead3Xml(schema, units, roots[0]) : ead2002Xml(schema, units, roots[0]);
    }
  }
  if (new TextEncoder().encode(output).byteLength > MAX_FILE_BYTES) throw new Error("Export exceeds the 5 MiB archival import ceiling. Export a smaller archival selection.");
  return output;
}

export async function reviewArchiveImport(file: File): Promise<ArchiveImportReview> {
  const base: ArchiveImportReview = { filename: file.name.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "unnamed", bytes: file.size, digest: "", format: "unknown", schema: null, units: [], blocked: true, summary: "Import rejected." };
  if (!file.size || file.size > MAX_FILE_BYTES) return { ...base, summary: "File must contain 1 byte–5 MiB." };
  const lower = file.name.toLowerCase();
  const extension = lower.endsWith(".json") ? "json" : lower.endsWith(".csv") ? "csv" : /\.(?:xml|ead)$/.test(lower) ? "xml" : "";
  if (!extension) return { ...base, summary: "Use EAD XML, an archival CSV, or a schema package." };
  if (!mimeMatches(file.type, extension)) return { ...base, summary: `Declared media type ${file.type || "unknown"} does not match the filename.` };

  try {
    const bytes = await file.arrayBuffer();
    base.digest = await hash(bytes);
    let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.startsWith("\uFEFF")) text = text.slice(1);
    cleanFileText(text);

    if (extension === "json") {
      const parsed = assertSafeJsonText(text);
      inspectUntrusted(parsed, 0);
      const root = objectValue(parsed, "Schema package must be an object.");
      exactKeys(root, ["schema", "version", "exportedAt", "definition", "records"]);
      if (!["in-keeping/archive-schema", "lacl-archive-schema"].includes(String(root.schema)) || ![1, 2].includes(Number(root.version))) throw new Error("Schema package version is unsupported.");
      if (root.exportedAt !== undefined) isoInstant(stringValue(root.exportedAt, 64, "exportedAt"), "exportedAt");
      const schema = parseSchemaDto(root.definition);
      if (!Array.isArray(root.records) || root.records.length > MAX_UNITS) throw new Error("Schema package record limit exceeded.");
      const units = root.records.map((record) => parseUnitDto(record));
      validateArchiveSet([schema], units);
      return bindArchiveImportReview({ ...base, format: "schema-package", schema, units, blocked: false, summary: `${units.length} archival records ready to apply.` });
    }
    if (extension === "csv") {
      const result = archiveCsvImport(text, base.digest);
      validateArchiveSet([result.schema], result.units);
      return bindArchiveImportReview({ ...base, format: result.schema.profile === "atom" ? "atom-csv" : "archives-space-csv", ...result, blocked: false, summary: `${result.units.length} archival records ready to apply.` });
    }

    assertSafeXmlText(text);
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.getElementsByTagName("parsererror").length || document.documentElement.localName !== "ead") throw new Error("Only EAD XML is accepted here.");
    if (![EAD4_NS, EAD3_NS, EAD2002_NS].includes(document.documentElement.namespaceURI ?? "")) throw new Error("EAD must declare a supported official namespace.");
    const namespace = document.documentElement.namespaceURI ?? "";
    assertXmlElementNamespaces(document, namespace === EAD2002_NS ? [namespace, XLINK_NS] : [namespace]);
    if (document.getElementsByTagName("*").length > 100000) throw new Error("XML node limit exceeded.");
    const profile: ArchiveProfile = namespace === EAD4_NS ? "ead4" : namespace === EAD3_NS ? "ead3" : "ead2002";
    assertSupportedEadStructure(document, profile);
    const result = eadImport(document, base.digest);
    validateArchiveSet([result.schema], result.units);
    if (!result.units.length) throw new Error("EAD contains no importable descriptions.");
    return bindArchiveImportReview({ ...base, format: result.schema.profile, ...result, blocked: false, summary: `${result.units.length} archival records ready to apply.` });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/[<>]/g, "") : "The archival file could not be parsed.";
    return { ...base, summary: message.slice(0, 500) };
  }
}

export async function verifyArchiveImportReviewBinding(review: ArchiveImportReview): Promise<boolean> {
  const expected = archiveImportReviewBindings.get(review);
  return Boolean(expected)
    && review.blocked === false
    && review.schema !== null
    && expected === await archiveImportReviewBinding(review);
}

async function bindArchiveImportReview(review: ArchiveImportReview): Promise<ArchiveImportReview> {
  archiveImportReviewBindings.set(review, await archiveImportReviewBinding(review));
  return review;
}

function archiveImportReviewBinding(review: ArchiveImportReview): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    filename: review.filename,
    bytes: review.bytes,
    digest: review.digest,
    format: review.format,
    schema: review.schema,
    units: review.units,
  }));
  return hash(bytes.buffer);
}

export function archiveFilename(schema: ArchiveSchema, format: ArchiveExchangeFormat): string {
  const base = schema.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "archive";
  return `${base}.${ARCHIVE_EXCHANGE_FORMATS.find((item) => item.value === format)?.extension ?? "txt"}`;
}

export function archiveMime(format: ArchiveExchangeFormat): string {
  return ARCHIVE_EXCHANGE_FORMATS.find((item) => item.value === format)?.mime ?? "text/plain";
}

function atomCsv(schema: ArchiveSchema, units: ArchiveUnit[]): string {
  if (schemaRecordType(schema) !== "description") throw new Error("AtoM ISAD CSV requires a descriptive record schema.");
  const baseHeaders: readonly string[] = ATOM_CSV_HEADERS;
  const headers = [...baseHeaders, ...schema.fields.map((item) => item.mappings.atom).filter((mapping) => mapping && !baseHeaders.includes(mapping))];
  const rows = topologicalUnits(units).map((unit) => {
    const dates = values(unit.values.dates);
    const fixed: Record<string, string> = {
      legacyId: unit.id,
      parentId: unit.parentId ?? "",
      identifier: display(unit.values.reference_code),
      title: display(unit.values.title),
      levelOfDescription: atomLevel(unit.level),
      eventDates: encodeCsvList(dates),
      eventTypes: encodeCsvList(dates.map(() => "Creation")),
      eventActors: encodeCsvList(values(unit.values.creator)),
      extentAndMedium: encodeCsvList(values(unit.values.extent)),
      scopeAndContent: display(unit.values.scope_content),
      arrangement: display(unit.values.arrangement),
      accessConditions: display(unit.values.access_conditions),
      reproductionConditions: display(unit.values.use_conditions),
      language: encodeCsvList(values(unit.values.language)),
      subjectAccessPoints: encodeCsvList(values(unit.values.subjects)),
      relatedUnitsOfDescription: encodeCsvList(values(unit.values.related_material)),
      digitalObjectURI: encodeCsvList(values(unit.values.digital_object_uri)),
      generalNote: encodeCsvList(values(unit.values.note)),
      culture: unit.language || "en",
      publicationStatus: unit.published === true ? "Published" : "Draft",
    };
    for (const schemaField of schema.fields) {
      const mapping = schemaField.mappings.atom;
      if (mapping && !baseHeaders.includes(mapping)) fixed[mapping] = schemaField.repeatable ? encodeCsvList(values(unit.values[schemaField.id])) : display(unit.values[schemaField.id]);
    }
    return headers.map((header) => csv(fixed[header] ?? ""));
  });
  return [headers.map(csv), ...rows].map((row) => row.join(",")).join("\n") + "\n";
}

function archivesSpaceCsv(schema: ArchiveSchema, units: ArchiveUnit[]): string {
  if (schemaRecordType(schema) !== "description") throw new Error("ArchivesSpace archival-object crosswalk requires a descriptive record schema.");
  const baseHeaders: readonly string[] = ARCHIVES_SPACE_CSV_HEADERS;
  const extraFields = schema.fields.filter((item) => item.mappings.archivesSpace && !baseHeaders.includes(item.mappings.archivesSpace));
  const headers = [...baseHeaders, ...extraFields.map((item) => item.mappings.archivesSpace)];
  const labels = [...ARCHIVES_SPACE_CSV_LABELS, ...extraFields.map((item) => item.label)];
  const depths = hierarchyDepths(units);
  const rows = topologicalUnits(units).map((unit) => {
    const fixed: Record<string, string> = {
      ead: schema.id,
      res_uri: "",
      hierarchy: String(depths.get(unit.id) ?? 1),
      parent_ref_id: unit.parentId ?? "",
      level: legacyLevel(unit.level),
      other_level: unit.level === "repository" || unit.level === "other" ? unit.level : "",
      title: display(unit.values.title),
      unit_id: display(unit.values.reference_code),
      ref_id: unit.id,
      publish: unit.published === true ? "true" : "false",
      langcode: unit.language || "en",
      dates: encodeCsvList(values(unit.values.dates)),
      creators: encodeCsvList(values(unit.values.creator)),
      extents: encodeCsvList(values(unit.values.extent)),
      n_scopecontent: display(unit.values.scope_content),
      n_arrangement: display(unit.values.arrangement),
      n_accessrestrict: display(unit.values.access_conditions),
      n_userestrict: display(unit.values.use_conditions),
      n_relatedmaterial: encodeCsvList(values(unit.values.related_material)),
      n_odd: encodeCsvList(values(unit.values.note)),
      digital_object_uri: encodeCsvList(values(unit.values.digital_object_uri)),
    };
    for (const schemaField of extraFields) fixed[schemaField.mappings.archivesSpace] = schemaField.repeatable ? encodeCsvList(values(unit.values[schemaField.id])) : display(unit.values[schemaField.id]);
    return headers.map((header) => csv(fixed[header] ?? ""));
  });
  return [headers.map(csv), labels.map(csv), ...rows].map((row) => row.join(",")).join("\n") + "\n";
}

function dctapCsv(schema: ArchiveSchema): string {
  const headers = ["shapeID", "shapeLabel", "propertyID", "propertyLabel", "mandatory", "repeatable", "valueNodeType", "valueDataType", "valueShape", "valueConstraint", "valueConstraintType", "note"];
  const shape = `${schema.id}#${schemaRecordType(schema)}`;
  const rows = schema.fields.map((item) => [shape, schema.name, item.id, item.label, String(item.required), String(item.repeatable), nodeType(item.kind), datatype(item.kind), referenceShape(item.kind, schema), item.vocabulary.join(" | "), item.vocabulary.length ? "picklist" : "", item.definition]);
  return [headers, ...rows].map((row) => row.map(csv).join(",")).join("\n") + "\n";
}

function archiveCsvImport(text: string, digest: string): { schema: ArchiveSchema; units: ArchiveUnit[] } {
  const rows = csvRows(text);
  if (rows.length < 2 || rows.length > MAX_UNITS + 2) throw new Error(`CSV must contain a header and 1–${MAX_UNITS.toLocaleString()} records.`);
  const headers = rows[0].map((value) => clean(value, 256));
  if (headers.some((header) => !header) || new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) throw new Error("CSV headers must be nonempty and unique.");
  if (rows.some((row) => row.length !== headers.length)) throw new Error("Every CSV row must have the same number of columns as the header.");

  const atom = headers.includes("legacyId") && headers.includes("levelOfDescription");
  const aspace = headers.includes("ref_id") && (headers.includes("hierarchy") || headers.includes("parent_ref_id"));
  if (atom && aspace) throw new Error("CSV ambiguously matches both AtoM and ArchivesSpace crosswalks.");
  if (!atom && !aspace) throw new Error("CSV does not match the supported AtoM or ArchivesSpace archival-object crosswalk.");
  const hasLabelRow = aspace && ARCHIVES_SPACE_CSV_LABELS.every((label, index) => rows[1]?.[index] === label);
  const dataRows = rows.slice(hasLabelRow ? 2 : 1);
  if (!dataRows.length) throw new Error("CSV contains no archival records.");

  const profile: ArchiveProfile = atom ? "atom" : "archives-space";
  const schema = makeArchiveSchema(profile, atom ? "AtoM descriptions" : "ArchivesSpace archival objects", `SCHEMA-${profile.toUpperCase()}-${digest.slice(0, 10)}`);
  const known = new Set(atom
    ? ["legacyId", "parentId", "identifier", "title", "levelOfDescription", "eventDates", "eventTypes", "eventActors", "extentAndMedium", "scopeAndContent", "arrangement", "accessConditions", "reproductionConditions", "language", "subjectAccessPoints", "relatedUnitsOfDescription", "digitalObjectURI", "generalNote", "culture", "publicationStatus"]
    : ["ead", "res_uri", "hierarchy", "parent_ref_id", "level", "other_level", "title", "unit_id", "ref_id", "publish", "langcode", "dates", "creators", "extents", "n_scopecontent", "n_arrangement", "n_accessrestrict", "n_userestrict", "n_relatedmaterial", "n_odd", "digital_object_uri"]);
  const target = atom ? "atom" : "archivesSpace";
  const mappedColumns = new Set(schema.fields.map((item) => item.mappings[target]).filter(Boolean));
  const customColumns = headers.filter((header) => !known.has(header) && !mappedColumns.has(header));
  const usedIds = new Set(schema.fields.map((item) => item.id));
  for (const column of customColumns) {
    const id = uniqueFieldId(column, usedIds);
    usedIds.add(id);
    schema.fields.push(field(id, column, `Imported CSV column: ${column}.`, "text", false, false, "", aspace ? column : "", atom ? column : "", ""));
  }
  validateArchiveSchema(schema);

  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  const column = (row: string[], name: string) => {
    const index = headerIndexes.get(name);
    return index === undefined ? "" : clean(row[index], MAX_FILE_BYTES);
  };
  const now = new Date().toISOString();
  const units: ArchiveUnit[] = [];
  const unitIds = new Set<string>();
  const unitDepths = new Map<string, number>();
  const depthStack: string[] = [];
  let resourceEad = "";
  let resourceUri = "";
  for (const [index, row] of dataRows.entries()) {
    const rawId = column(row, atom ? "legacyId" : "ref_id");
    if (!safeId(rawId)) throw new Error(`CSV row ${index + 2} has an invalid or missing record ID.`);
    let parentId = column(row, atom ? "parentId" : "parent_ref_id") || null;
    let declaredDepth: number | null = null;
    if (!atom) {
      const rowEad = column(row, "ead");
      const rowUri = column(row, "res_uri");
      if (rowEad && resourceEad && rowEad !== resourceEad) throw new Error("ArchivesSpace CSV crosses more than one resource EAD boundary.");
      if (rowUri && resourceUri && rowUri !== resourceUri) throw new Error("ArchivesSpace CSV crosses more than one resource URI boundary.");
      resourceEad ||= rowEad;
      resourceUri ||= rowUri;
      const depthText = column(row, "hierarchy");
      if (depthText) {
        declaredDepth = Number(depthText);
        if (!Number.isInteger(declaredDepth) || declaredDepth < 1 || declaredDepth > MAX_DEPTH + 1) throw new Error(`CSV row ${index + 2} has an invalid hierarchy depth.`);
      }
      if (!parentId && declaredDepth && declaredDepth > 1) {
        parentId = depthStack[declaredDepth - 2] ?? null;
        if (!parentId) throw new Error(`CSV row ${index + 2} skips a hierarchy parent.`);
      }
    }
    if (parentId && !safeId(parentId)) throw new Error(`CSV row ${index + 2} has an invalid parent ID.`);
    if (parentId && !unitIds.has(parentId)) throw new Error(`CSV row ${index + 2} must follow its parent record.`);
    const actualDepth = parentId ? (unitDepths.get(parentId) ?? 0) + 1 : 1;
    if (declaredDepth !== null && declaredDepth !== actualDepth) throw new Error(`CSV row ${index + 2} hierarchy depth conflicts with its parent reference.`);
    if (actualDepth > MAX_DEPTH + 1) throw new Error(`CSV row ${index + 2} exceeds the archival hierarchy limit.`);
    depthStack[actualDepth - 1] = rawId;
    depthStack.length = actualDepth;

    const valuesMap: Record<string, ArchiveValue> = Object.create(null) as Record<string, ArchiveValue>;
    if (atom) {
      const eventDates = decodeCsvList(column(row, "eventDates"));
      const eventTypes = decodeCsvList(column(row, "eventTypes"));
      if (eventTypes.some((value) => !/^creation$/i.test(value)) || (eventTypes.length && eventTypes.length !== eventDates.length)) throw new Error(`CSV row ${index + 2} contains event types outside the supported creation-date crosswalk.`);
      assign(valuesMap, "reference_code", column(row, "identifier"));
      assign(valuesMap, "title", column(row, "title"));
      assignArray(valuesMap, "dates", eventDates);
      assignList(valuesMap, "creator", column(row, "eventActors"));
      assignList(valuesMap, "extent", column(row, "extentAndMedium"));
      assign(valuesMap, "scope_content", column(row, "scopeAndContent"));
      assign(valuesMap, "arrangement", column(row, "arrangement"));
      assign(valuesMap, "access_conditions", column(row, "accessConditions"));
      assign(valuesMap, "use_conditions", column(row, "reproductionConditions"));
      assignList(valuesMap, "language", column(row, "language"));
      assignList(valuesMap, "subjects", column(row, "subjectAccessPoints"));
      assignList(valuesMap, "related_material", column(row, "relatedUnitsOfDescription"));
      assignList(valuesMap, "digital_object_uri", column(row, "digitalObjectURI"));
      assignList(valuesMap, "note", column(row, "generalNote"));
    } else {
      assign(valuesMap, "reference_code", column(row, "unit_id"));
      assign(valuesMap, "title", column(row, "title"));
      assignList(valuesMap, "dates", column(row, "dates"));
      assignList(valuesMap, "creator", column(row, "creators"));
      assignList(valuesMap, "extent", column(row, "extents"));
      assign(valuesMap, "scope_content", column(row, "n_scopecontent"));
      assign(valuesMap, "arrangement", column(row, "n_arrangement"));
      assign(valuesMap, "access_conditions", column(row, "n_accessrestrict"));
      assign(valuesMap, "use_conditions", column(row, "n_userestrict"));
      assignList(valuesMap, "related_material", column(row, "n_relatedmaterial"));
      assignList(valuesMap, "digital_object_uri", column(row, "digital_object_uri"));
      assignList(valuesMap, "note", column(row, "n_odd"));
    }
    for (const schemaField of schema.fields) {
      if (!empty(valuesMap[schemaField.id])) continue;
      const raw = column(row, schemaField.mappings[target]);
      if (schemaField.repeatable) assignList(valuesMap, schemaField.id, raw);
      else assign(valuesMap, schemaField.id, raw);
    }
    if (empty(valuesMap.reference_code)) valuesMap.reference_code = rawId;
    if (empty(valuesMap.title)) throw new Error(`CSV row ${index + 2} has no title.`);
    const language = column(row, atom ? "culture" : "langcode") || "en";
    if (!languageTag(language)) throw new Error(`CSV row ${index + 2} has an invalid description language.`);
    const publication = column(row, atom ? "publicationStatus" : "publish");
    if (atom && publication && !/^(?:draft|published)$/i.test(publication)) throw new Error(`CSV row ${index + 2} has an unsupported publication status.`);
    if (!atom && publication && !/^(?:true|false)$/i.test(publication)) throw new Error(`CSV row ${index + 2} has an unsupported publish value.`);
    units.push({
      id: rawId,
      schemaId: schema.id,
      schemaVersion: schema.version,
      parentId,
      level: csvImportLevel(column(row, atom ? "levelOfDescription" : "level"), atom ? "" : column(row, "other_level")),
      values: valuesMap,
      published: atom ? /^published$/i.test(publication) : /^true$/i.test(publication),
      language,
      createdAt: now,
      updatedAt: now,
    });
    unitIds.add(rawId);
    unitDepths.set(rawId, actualDepth);
  }
  return { schema, units };
}

function assertSupportedEadStructure(document: Document, profile: ArchiveProfile): void {
  const root = document.documentElement;
  const ead4DescriptionChildren = ["identificationData", "agents", "formsAvailable", "scopeContent", "arrangement", "accessConditions", "useConditions", "relatedMaterial", "otherDescription", "subjectHeadings"];
  const legacyDescriptionChildren = ["did", "scopecontent", "arrangement", "accessrestrict", "userestrict", "relatedmaterial", "odd", "controlaccess"];
  const ead4: Record<string, readonly string[]> = {
    ead: ["control", "archDesc"],
    control: ["recordId", "maintenanceAgency", "maintenanceHistory"],
    maintenanceAgency: ["agencyCode", "agencyName"],
    maintenanceHistory: ["maintenanceEvent"],
    maintenanceEvent: ["agent", "eventDateTime", "eventDescription"],
    agent: ["label", "role"],
    archDesc: [...ead4DescriptionChildren, "descriptionOfComponents"],
    c: [...ead4DescriptionChildren, "c"],
    descriptionOfComponents: ["c"],
    identificationData: ["unitId", "unitTitle", "unitDate", "extent", "languageOfMaterial", "otherIdentificationData"],
    unitDate: ["textualDate"],
    languageOfMaterial: ["language"],
    extent: ["quantity"],
    agents: ["agent"],
    formsAvailable: ["formAvailable"],
    formAvailable: ["label"],
    subjectHeadings: ["subject"],
    subject: ["term"],
    scopeContent: ["p"], arrangement: ["p"], accessConditions: ["p"], useConditions: ["p"], relatedMaterial: ["p"], otherDescription: ["p"],
    recordId: [], agencyCode: [], agencyName: [], eventDateTime: [], eventDescription: [], label: [], role: [], unitId: [], unitTitle: [], textualDate: [], quantity: [], otherIdentificationData: [], language: [], term: [], p: [],
  };
  const legacyCommon: Record<string, readonly string[]> = {
    archdesc: [...legacyDescriptionChildren, "dsc"],
    c: [...legacyDescriptionChildren, "c"],
    dsc: ["c"],
    did: ["unitid", "unittitle", "unitdate", "physdesc", "origination", "langmaterial", "repository", "dao"],
    physdesc: ["extent"],
    origination: ["name", "persname", "famname", "corpname"],
    langmaterial: ["language"], repository: ["corpname", "name"],
    controlaccess: ["subject", "genreform", "geogname", "name", "persname", "famname", "corpname", "occupation", "function"],
    scopecontent: ["p"], arrangement: ["p"], accessrestrict: ["p"], userestrict: ["p"], relatedmaterial: ["p"], odd: ["head", "p"],
    unitid: [], unittitle: [], unitdate: [], extent: [], name: [], persname: [], famname: [], corpname: [], language: [], subject: [], genreform: [], geogname: [], occupation: [], function: [], dao: [], head: [], p: [],
  };
  const ead3: Record<string, readonly string[]> = {
    ...legacyCommon,
    ead: ["control", "archdesc"],
    control: ["recordid", "filedesc", "maintenancestatus", "maintenanceagency", "languagedeclaration", "maintenancehistory"],
    filedesc: ["titlestmt"], titlestmt: ["titleproper"], maintenanceagency: ["agencyname"],
    languagedeclaration: ["language", "script"], maintenancehistory: ["maintenanceevent"],
    maintenanceevent: ["eventtype", "eventdatetime", "agenttype", "agent", "eventdescription"],
    physdesc: [], name: ["part"], persname: ["part"], famname: ["part"], corpname: ["part"], subject: ["part"], genreform: ["part"], geogname: ["part"], occupation: ["part"], function: ["part"], part: [],
    recordid: [], maintenancestatus: [], agencyname: [], script: [], eventtype: [], eventdatetime: [], agenttype: [], agent: [], eventdescription: [], titleproper: [],
  };
  const ead2002: Record<string, readonly string[]> = {
    ...legacyCommon,
    ead: ["eadheader", "archdesc"],
    eadheader: ["eadid", "filedesc", "profiledesc"], filedesc: ["titlestmt"], titlestmt: ["titleproper"],
    profiledesc: ["creation", "langusage"], creation: ["date"], langusage: ["language"],
    eadid: [], titleproper: [], date: [],
  };
  const structure = profile === "ead4" ? ead4 : profile === "ead3" ? ead3 : ead2002;
  const paragraphContainers = new Set(profile === "ead4"
    ? ["scopeContent", "arrangement", "accessConditions", "useConditions", "relatedMaterial", "otherDescription"]
    : ["scopecontent", "arrangement", "accessrestrict", "userestrict", "relatedmaterial", "odd"]);
  const mixedText = new Set(profile === "ead2002" ? ["creation"] : []);

  const allowedAttributes = (name: string): Set<string> => {
    const result = new Set<string>();
    if ((profile === "ead4" && ["archDesc", "c"].includes(name)) || (profile !== "ead4" && (name === "archdesc" || isLegacyComponentName(name)))) {
      ["id", "level", "otherlevel", "audience"].forEach((item) => result.add(item));
      if (profile === "ead4") result.add("languageOfElement");
      if (profile === "ead3") result.add("lang");
      if (profile === "ead4") result.add("xml:lang");
    }
    const map: Record<string, readonly string[]> = profile === "ead4" ? {
      ead: ["languageOfElement"], control: ["maintenanceStatus", "publicationStatus"], maintenanceEvent: ["maintenanceEventType"],
      eventDateTime: ["standardDateTime"], language: ["languageCode"], formAvailable: ["valueURI", "href"], otherDescription: ["localType"], otherIdentificationData: ["localType"],
    } : profile === "ead3" ? {
      maintenancestatus: ["value"], language: ["langcode"], script: ["scriptcode"], eventtype: ["value"], eventdatetime: ["standarddatetime"],
      agenttype: ["value"], dao: ["daotype", "href"], odd: ["localtype"], dsc: ["type"],
    } : {
      eadheader: ["audience", "langencoding", "scriptencoding", "dateencoding", "countryencoding"], language: ["langcode"], date: ["normal"],
      dao: ["xlink:type", "xlink:href"], dsc: ["type"],
    };
    (map[name] ?? []).forEach((item) => result.add(item));
    return result;
  };

  const visit = (node: Element): void => {
    const name = node.localName;
    const key = profile !== "ead4" && isLegacyComponentName(name) ? "c" : name;
    const allowedChildren = structure[key];
    if (!allowedChildren) throw new Error(`EAD contains unsupported element: ${name}.`);
    const allowedAttributeNames = allowedAttributes(name);
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
      if (!allowedAttributeNames.has(attribute.name)) throw new Error(`EAD contains unsupported attribute ${attribute.name} on ${name}.`);
    }
    const children = childElements(node);
    for (const child of children) {
      const childKey = profile !== "ead4" && isLegacyComponentName(child.localName) ? "c" : child.localName;
      if (!allowedChildren.includes(childKey)) throw new Error(`EAD contains unsupported ${child.localName} inside ${name}.`);
    }
    const directText = Array.from(node.childNodes).filter((child) => child.nodeType === 3 || child.nodeType === 4).map((child) => child.nodeValue ?? "").join("");
    if (children.length && directText.trim() && !mixedText.has(name)) throw new Error(`EAD contains unsupported mixed text inside ${name}.`);
    if (!children.length && directText) clean(directText, 8192);
    if (paragraphContainers.has(name) && children.filter((child) => child.localName === "p").length !== 1) throw new Error(`EAD ${name} must contain exactly one paragraph in the supported profile.`);
    if ((profile === "ead4" && ["archDesc", "c"].includes(name)) || (profile !== "ead4" && (name === "archdesc" || isLegacyComponentName(name)))) {
      const audience = node.getAttribute("audience");
      if (audience && !/^(?:internal|external|public)$/i.test(audience)) throw new Error("EAD description audience is unsupported.");
    }
    if (profile === "ead4" && name === "formAvailable" && !node.getAttribute("valueURI") && !node.getAttribute("href")) throw new Error("EAD formAvailable requires a URI.");
    if (profile === "ead4" && name === "otherIdentificationData" && node.getAttribute("localType") !== "in-keeping:repository") throw new Error("EAD otherIdentificationData is outside the supported repository crosswalk.");
    if (profile !== "ead4" && name === "dao" && !node.getAttribute("href") && !node.getAttributeNS(XLINK_NS, "href")) throw new Error("EAD dao requires a URI.");
    children.forEach(visit);
  };
  visit(root);

  const descriptionName = profile === "ead4" ? "archDesc" : "archdesc";
  const descriptions = direct(root, descriptionName);
  if (descriptions.length !== 1) throw new Error("EAD has no description or contains multiple direct archival descriptions; exactly one is required.");
  eadDocumentIdentity(root, profile);
  const validateDescription = (node: Element): void => {
    const identificationName = profile === "ead4" ? "identificationData" : "did";
    const identification = direct(node, identificationName);
    if (identification.length !== 1) throw new Error(`Every EAD description requires exactly one ${identificationName}.`);
    const titleName = profile === "ead4" ? "unitTitle" : "unittitle";
    const referenceName = profile === "ead4" ? "unitId" : "unitid";
    if (direct(identification[0], titleName).length !== 1) throw new Error("Every EAD description requires exactly one title.");
    if (direct(identification[0], referenceName).length > 1) throw new Error("An EAD description may contain no more than one reference code.");
    const repositories = profile === "ead4"
      ? direct(identification[0], "otherIdentificationData").filter((item) => item.getAttribute("localType") === "in-keeping:repository")
      : direct(identification[0], "repository");
    if (repositories.length > 1) throw new Error("The supported EAD profile permits no more than one repository identity per description.");
    if (repositories.length === 1) {
      const repository = repositories[0];
      if (profile === "ead4") {
        assertIdentityText(textOf(repository), "EAD repository identity");
      } else {
        const nameCarriers = childElements(repository).filter((child) => child.namespaceURI === repository.namespaceURI && ["corpname", "name"].includes(child.localName));
        if (nameCarriers.length !== 1 || childElements(repository).length !== 1) {
          throw new Error("A legacy EAD repository identity requires exactly one direct name or corpname element.");
        }
        if (profile === "ead3") {
          const parts = direct(nameCarriers[0], "part");
          if (!parts.length) throw new Error("An EAD3 repository name requires one or more nonempty part elements.");
          parts.forEach((part) => assertIdentityText(textOf(part), "EAD3 repository name part"));
        } else {
          assertIdentityText(textOf(nameCarriers[0]), "EAD 2002 repository identity");
        }
      }
    }
    const singleSections = profile === "ead4" ? ["scopeContent", "arrangement", "accessConditions", "useConditions", "agents", "formsAvailable", "subjectHeadings", "descriptionOfComponents"] : ["scopecontent", "arrangement", "accessrestrict", "userestrict", "controlaccess", "dsc"];
    for (const section of singleSections) if (direct(node, section).length > 1) throw new Error(`An EAD description may contain no more than one ${section}.`);
    const repeatGroups = profile === "ead4"
      ? [[identification[0], "unitDate"], [identification[0], "extent"], [identification[0], "languageOfMaterial"], [node, "relatedMaterial"], [node, "otherDescription"]] as const
      : [[identification[0], "unitdate"], [identification[0], "physdesc"], [identification[0], "origination"], [identification[0], "langmaterial"], [identification[0], "dao"], [node, "relatedmaterial"], [node, "odd"]] as const;
    for (const [container, childName] of repeatGroups) if (direct(container, childName).length > MAX_VALUES) throw new Error(`EAD ${childName} exceeds ${MAX_VALUES} values.`);
    if (profile === "ead4") {
      const nestedGroups = [[direct(node, "agents")[0], "agent"], [direct(node, "formsAvailable")[0], "formAvailable"], [direct(node, "subjectHeadings")[0], "subject"]] as const;
      for (const [container, childName] of nestedGroups) if (container && direct(container, childName).length > MAX_VALUES) throw new Error(`EAD ${childName} exceeds ${MAX_VALUES} values.`);
    } else {
      const controlAccess = direct(node, "controlaccess")[0];
      if (controlAccess && childElements(controlAccess).length > MAX_VALUES) throw new Error(`EAD subject access points exceed ${MAX_VALUES} values.`);
      if (profile === "ead2002" && direct(node, "odd").filter((item) => textOf(direct(item, "head")[0]) === "in-keeping:description-language").length > 1) {
        throw new Error("EAD 2002 contains multiple description-language declarations.");
      }
    }
    for (const child of componentChildren(node, profile)) validateDescription(child);
  };
  validateDescription(descriptions[0]);
}

function eadDocumentIdentity(root: Element, profile: ArchiveProfile): string {
  const controlName = profile === "ead2002" ? "eadheader" : "control";
  const controls = direct(root, controlName);
  if (controls.length > 1) throw new Error(`EAD may contain no more than one ${controlName}.`);
  if (!controls.length) return "";

  const control = controls[0];
  const identityName = profile === "ead4" ? "recordId" : profile === "ead3" ? "recordid" : "eadid";
  const identities = direct(control, identityName);
  if (identities.length !== 1) throw new Error(`An EAD ${controlName} requires exactly one ${identityName} document identity.`);
  const identity = textOf(identities[0]);
  assertIdentityText(identity, `EAD document identity ${identityName}`);
  if (!safeId(identity)) throw new Error(`EAD document identity ${identityName} must use the supported safe local identifier syntax.`);

  if (profile === "ead4") {
    const agencies = direct(control, "maintenanceAgency");
    if (agencies.length > 1) throw new Error("EAD4 control permits no more than one maintenanceAgency identity.");
    if (agencies.length === 1) {
      const codes = direct(agencies[0], "agencyCode");
      const names = direct(agencies[0], "agencyName");
      if (codes.length > 1 || names.length > 1) throw new Error("EAD4 maintenanceAgency permits at most one agencyCode and one agencyName.");
      if (!codes.length && !names.length) throw new Error("EAD4 maintenanceAgency requires a nonempty agencyCode or agencyName.");
      codes.forEach((item) => assertIdentityText(textOf(item), "EAD4 maintenanceAgency agencyCode"));
      names.forEach((item) => assertIdentityText(textOf(item), "EAD4 maintenanceAgency agencyName"));
    }
  } else if (profile === "ead3") {
    const agencies = direct(control, "maintenanceagency");
    if (agencies.length > 1) throw new Error("EAD3 control permits no more than one maintenanceagency identity.");
    if (agencies.length === 1) {
      const names = direct(agencies[0], "agencyname");
      if (names.length !== 1) throw new Error("EAD3 maintenanceagency requires exactly one nonempty agencyname.");
      assertIdentityText(textOf(names[0]), "EAD3 maintenanceagency agencyname");
    }
  }

  return identity;
}

function isLegacyComponentName(name: string): boolean { return /^c(?:\d{2})?$/.test(name); }

function eadImport(document: Document, digest: string): { schema: ArchiveSchema; units: ArchiveUnit[] } {
  const namespace = document.documentElement.namespaceURI ?? "";
  const profile: ArchiveProfile = namespace === EAD4_NS ? "ead4" : namespace === EAD3_NS ? "ead3" : namespace === EAD2002_NS ? "ead2002" : (() => { throw new Error("EAD namespace is unsupported."); })();
  const archDesc = direct(document.documentElement, profile === "ead4" ? "archDesc" : "archdesc")[0];
  if (!archDesc) throw new Error("EAD has no archival description.");
  const documentIdentity = eadDocumentIdentity(document.documentElement, profile);
  const rootTitle = unitText(archDesc, profile, "title") || headerTitle(document.documentElement, profile) || "Imported EAD description";
  const schema = makeArchiveSchema(profile, rootTitle, documentIdentity || `SCHEMA-${profile.toUpperCase()}-${digest.slice(0, 10)}`);
  const units: ArchiveUnit[] = [];
  const ids = new Set<string>();
  const now = new Date().toISOString();

  const walk = (node: Element, parentId: string | null, depth: number) => {
    if (depth > MAX_DEPTH || units.length >= MAX_UNITS) throw new Error("EAD hierarchy exceeds its limits.");
    const suppliedId = clean(node.getAttribute("id") ?? "", 128);
    if (suppliedId && !safeId(suppliedId)) throw new Error("EAD component ID is unsafe.");
    const referenceCode = unitText(node, profile, "reference") || suppliedId;
    const generatedId = `ARCH-${digest.slice(0, 8)}-${units.length + 1}`;
    const id = suppliedId || (safeId(referenceCode) ? referenceCode : generatedId);
    if (ids.has(id)) throw new Error("EAD component IDs are duplicated.");
    ids.add(id);
    const title = unitText(node, profile, "title");
    if (!title) throw new Error("Every EAD description requires a title.");

    const unitValues: Record<string, ArchiveValue> = Object.create(null) as Record<string, ArchiveValue>;
    unitValues.reference_code = referenceCode || id;
    unitValues.title = title;
    assignArray(unitValues, "dates", unitTexts(node, profile, "dates"));
    assignArray(unitValues, "creator", unitTexts(node, profile, "creator"));
    assignArray(unitValues, "extent", unitTexts(node, profile, "extent"));
    assign(unitValues, "scope_content", sectionText(node, profile, "scope"));
    assign(unitValues, "arrangement", sectionText(node, profile, "arrangement"));
    assign(unitValues, "access_conditions", sectionText(node, profile, "access"));
    assign(unitValues, "use_conditions", sectionText(node, profile, "use"));
    assignArray(unitValues, "language", unitTexts(node, profile, "language"));
    assign(unitValues, "repository", unitText(node, profile, "repository"));
    assignArray(unitValues, "subjects", unitTexts(node, profile, "subjects"));
    assignArray(unitValues, "related_material", sectionTexts(node, profile, "related"));
    assignArray(unitValues, "digital_object_uri", unitTexts(node, profile, "digital"));
    assignArray(unitValues, "note", sectionTexts(node, profile, "note"));

    const suppliedLanguage = profile === "ead4"
      ? node.getAttribute("languageOfElement") || node.getAttributeNS(XML_NS, "lang")
      : profile === "ead3" ? node.getAttribute("lang") : ead2002DescriptionLanguage(node);
    if (suppliedLanguage && !languageTag(suppliedLanguage)) throw new Error("EAD description language must be a BCP 47 tag.");
    const language = suppliedLanguage || "en";
    const unit: ArchiveUnit = {
      id,
      schemaId: schema.id,
      schemaVersion: schema.version,
      parentId,
      level: eadImportLevel(node),
      values: unitValues,
      published: /^(?:external|public)$/i.test(node.getAttribute("audience") ?? ""),
      language,
      createdAt: now,
      updatedAt: now,
    };
    units.push(unit);
    for (const child of componentChildren(node, profile)) walk(child, id, depth + 1);
  };
  walk(archDesc, null, 0);
  if (!units.length) throw new Error("EAD contains no importable descriptions.");
  return { schema, units };
}

function ead4Xml(schema: ArchiveSchema, units: ArchiveUnit[], root: ArchiveUnit): string {
  const children = childrenMap(units);
  const renderedChildren = (children.get(root.id) ?? []).map((child) => ead4Component(child, children)).join("");
  const control = `<control maintenanceStatus="derived" publicationStatus="${root.published === true ? "published" : "internal"}"><recordId>${xml(schema.id)}</recordId><maintenanceAgency><agencyName>Institution not supplied</agencyName></maintenanceAgency><maintenanceHistory><maintenanceEvent maintenanceEventType="created"><agent><label>IN KEEPING</label></agent><eventDateTime>${xml(schema.updatedAt)}</eventDateTime><eventDescription>Generated from a local, validated archival revision; replace the maintenance agency with the responsible institution before deposit.</eventDescription></maintenanceEvent></maintenanceHistory></control>`;
  const arch = `<archDesc${eadAttributes(root, "ead4")}>${ead4Body(root)}${renderedChildren ? `<descriptionOfComponents>${renderedChildren}</descriptionOfComponents>` : ""}</archDesc>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ead xmlns="${EAD4_NS}" languageOfElement="${xml(root.language || "en")}">${control}${arch}</ead>\n`;
}

function ead4Component(unit: ArchiveUnit, children: Map<string, ArchiveUnit[]>): string {
  const nested = (children.get(unit.id) ?? []).map((child) => ead4Component(child, children)).join("");
  return `<c${eadAttributes(unit, "ead4")}>${ead4Body(unit)}${nested}</c>`;
}

function ead4Body(unit: ArchiveUnit): string {
  const identification = [
    `<unitId>${xml(display(unit.values.reference_code) || unit.id)}</unitId>`,
    `<unitTitle>${xml(display(unit.values.title))}</unitTitle>`,
    ...values(unit.values.dates).map((value) => `<unitDate><textualDate>${xml(value)}</textualDate></unitDate>`),
    ...values(unit.values.extent).map((value) => `<extent><quantity>${xml(value)}</quantity></extent>`),
    ...values(unit.values.language).map((value) => `<languageOfMaterial><language languageCode="${xml(value)}">${xml(value)}</language></languageOfMaterial>`),
    display(unit.values.repository) ? `<otherIdentificationData localType="in-keeping:repository">${xml(display(unit.values.repository))}</otherIdentificationData>` : "",
  ].join("");
  const agents = values(unit.values.creator);
  const forms = values(unit.values.digital_object_uri);
  const subjects = values(unit.values.subjects);
  return [
    `<identificationData>${identification}</identificationData>`,
    agents.length ? `<agents>${agents.map((value) => `<agent><label>${xml(value)}</label><role>creator</role></agent>`).join("")}</agents>` : "",
    forms.length ? `<formsAvailable>${forms.map((value) => `<formAvailable valueURI="${xml(value)}"><label>Digital object</label></formAvailable>`).join("")}</formsAvailable>` : "",
    paragraphSections(unit, { scope_content: "scopeContent", arrangement: "arrangement", access_conditions: "accessConditions", use_conditions: "useConditions", related_material: "relatedMaterial", note: "otherDescription" }),
    subjects.length ? `<subjectHeadings>${subjects.map((value) => `<subject><term>${xml(value)}</term></subject>`).join("")}</subjectHeadings>` : "",
  ].join("");
}

function ead3Xml(schema: ArchiveSchema, units: ArchiveUnit[], root: ArchiveUnit): string {
  const children = childrenMap(units);
  const descendantsXml = (children.get(root.id) ?? []).map((child) => legacyComponent(child, children, "ead3")).join("");
  const control = `<control><recordid>${xml(schema.id)}</recordid><filedesc><titlestmt><titleproper>${xml(schema.name)}</titleproper></titlestmt></filedesc><maintenancestatus value="derived"/><maintenanceagency><agencyname>Institution not supplied</agencyname></maintenanceagency><languagedeclaration><language langcode="eng">English</language><script scriptcode="Latn">Latin</script></languagedeclaration><maintenancehistory><maintenanceevent><eventtype value="derived"/><eventdatetime standarddatetime="${xml(schema.updatedAt)}">${xml(schema.updatedAt)}</eventdatetime><agenttype value="machine"/><agent>IN KEEPING</agent><eventdescription>Replace the maintenance agency with the responsible institution before deposit.</eventdescription></maintenanceevent></maintenancehistory></control>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ead xmlns="${EAD3_NS}">${control}<archdesc${eadAttributes(root, "ead3")}>${legacyBody(root, "ead3")}${descendantsXml ? `<dsc>${descendantsXml}</dsc>` : ""}</archdesc></ead>\n`;
}

function ead2002Xml(schema: ArchiveSchema, units: ArchiveUnit[], root: ArchiveUnit): string {
  const children = childrenMap(units);
  const descendantsXml = (children.get(root.id) ?? []).map((child) => legacyComponent(child, children, "ead2002")).join("");
  const date = schema.updatedAt.slice(0, 10).replace(/-/g, "");
  const header = `<eadheader audience="internal" langencoding="iso639-2b" scriptencoding="iso15924" dateencoding="iso8601" countryencoding="iso3166-1"><eadid>${xml(schema.id)}</eadid><filedesc><titlestmt><titleproper>${xml(schema.name)}</titleproper></titlestmt></filedesc><profiledesc><creation>Generated by IN KEEPING; responsible maintenance agency not supplied <date normal="${date}">${xml(schema.updatedAt.slice(0, 10))}</date></creation><langusage><language langcode="eng">English</language></langusage></profiledesc></eadheader>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ead xmlns="${EAD2002_NS}" xmlns:xlink="${XLINK_NS}">${header}<archdesc${eadAttributes(root, "ead2002")}>${legacyBody(root, "ead2002")}${descendantsXml ? `<dsc type="combined">${descendantsXml}</dsc>` : ""}</archdesc></ead>\n`;
}

function legacyComponent(unit: ArchiveUnit, children: Map<string, ArchiveUnit[]>, format: "ead3" | "ead2002"): string {
  const nested = (children.get(unit.id) ?? []).map((child) => legacyComponent(child, children, format)).join("");
  return `<c${eadAttributes(unit, format)}>${legacyBody(unit, format)}${nested}</c>`;
}

function legacyBody(unit: ArchiveUnit, format: "ead3" | "ead2002"): string {
  const digital = values(unit.values.digital_object_uri).map((value) => format === "ead2002" ? `<dao xlink:type="simple" xlink:href="${xml(value)}"/>` : `<dao daotype="derived" href="${xml(value)}"/>`).join("");
  const did = [
    `<unitid>${xml(display(unit.values.reference_code) || unit.id)}</unitid>`,
    `<unittitle>${xml(display(unit.values.title))}</unittitle>`,
    ...values(unit.values.dates).map((value) => `<unitdate>${xml(value)}</unitdate>`),
    ...values(unit.values.extent).map((value) => format === "ead3" ? `<physdesc>${xml(value)}</physdesc>` : `<physdesc><extent>${xml(value)}</extent></physdesc>`),
    ...values(unit.values.creator).map((value) => format === "ead3" ? `<origination><name><part>${xml(value)}</part></name></origination>` : `<origination><name>${xml(value)}</name></origination>`),
    ...values(unit.values.language).map((value) => `<langmaterial><language langcode="${xml(value)}">${xml(value)}</language></langmaterial>`),
    display(unit.values.repository) ? (format === "ead3" ? `<repository><corpname><part>${xml(display(unit.values.repository))}</part></corpname></repository>` : `<repository><corpname>${xml(display(unit.values.repository))}</corpname></repository>`) : "",
    digital,
  ].join("");
  const sections = paragraphSections(unit, { scope_content: "scopecontent", arrangement: "arrangement", access_conditions: "accessrestrict", use_conditions: "userestrict", related_material: "relatedmaterial", note: "odd" });
  const subjects = values(unit.values.subjects);
  const subjectXml = subjects.map((value) => format === "ead3" ? `<subject><part>${xml(value)}</part></subject>` : `<subject>${xml(value)}</subject>`).join("");
  const descriptionLanguage = format === "ead2002" && unit.language ? `<odd><head>in-keeping:description-language</head><p>${xml(unit.language)}</p></odd>` : "";
  return `<did>${did}</did>${sections}${subjects.length ? `<controlaccess>${subjectXml}</controlaccess>` : ""}${descriptionLanguage}`;
}

function paragraphSections(unit: ArchiveUnit, mapping: Record<string, string>): string {
  return Object.entries(mapping).flatMap(([id, tag]) => values(unit.values[id]).map((value) => `<${tag}><p>${xml(value)}</p></${tag}>`)).join("");
}

function assertEadCoreOnly(schema: ArchiveSchema, units: ArchiveUnit[]): void {
  const fields = new Map(schema.fields.map((field) => [field.id, field]));
  for (const unit of units) {
    for (const required of ["reference_code", "title"] as const) {
      if (empty(unit.values[required])) throw new Error(`EAD export requires a nonempty ${required} value on archival record ${unit.id}. Use the lossless schema package for this custom profile.`);
    }
    for (const [id, value] of Object.entries(unit.values)) {
      if (empty(value)) continue;
      const rule = EAD_CORE_RULES[id as keyof typeof EAD_CORE_RULES];
      if (!rule) throw new Error(`EAD export cannot preserve custom field ${id} on archival record ${unit.id}. Use the lossless schema package.`);
      const field = fields.get(id);
      if (!field || field.kind !== rule.kind || field.repeatable !== rule.repeatable || field.mappings.ead !== rule.mapping) {
        throw new Error(`EAD export cannot preserve the custom type, cardinality, or EAD mapping of field ${id} on archival record ${unit.id}. Use the lossless schema package.`);
      }
      if (Array.isArray(value) !== rule.repeatable) {
        throw new Error(`EAD export cannot preserve the value cardinality of field ${id} on archival record ${unit.id}. Use the lossless schema package.`);
      }
    }
  }
}

function canonicalNumericDraft(value: string): boolean {
  return value === value.trim() && value !== "" && Number.isFinite(Number(value));
}

function eadAttributes(unit: ArchiveUnit, family: "ead4" | "ead3" | "ead2002"): string {
  const level = family === "ead4" ? ead4Level(unit.level) : legacyLevel(unit.level);
  const otherLevel = family !== "ead4" && (unit.level === "repository" || unit.level === "other") ? ` otherlevel="${unit.level}"` : "";
  const language = unit.language ? family === "ead4" ? ` languageOfElement="${xml(unit.language)}"` : family === "ead3" ? ` lang="${xml(unit.language)}"` : "" : "";
  return ` id="${xml(xmlId(unit.id))}" level="${xml(level)}"${otherLevel} audience="${unit.published === true ? "external" : "internal"}"${language}`;
}

function componentChildren(node: Element, profile: ArchiveProfile): Element[] {
  if (profile === "ead4") {
    if (node.localName === "archDesc") return direct(node, "descriptionOfComponents").flatMap((container) => direct(container, "c"));
    return direct(node, "c");
  }
  if (node.localName.toLowerCase() === "archdesc") return direct(node, "dsc").flatMap((container) => childElements(container).filter((child) => child.namespaceURI === container.namespaceURI && isLegacyComponent(child)));
  return childElements(node).filter((child) => child.namespaceURI === node.namespaceURI && isLegacyComponent(child));
}

function unitText(node: Element, profile: ArchiveProfile, kind: "reference" | "title" | "repository"): string {
  const identification = profile === "ead4" ? direct(node, "identificationData")[0] : direct(node, "did")[0];
  if (!identification) return "";
  if (kind === "repository") {
    const repository = profile === "ead4"
      ? direct(identification, "otherIdentificationData").find((item) => item.getAttribute("localType") === "in-keeping:repository")
      : direct(identification, "repository")[0];
    if (!repository) return "";
    if (profile === "ead4") return textOf(repository);
    const nameCarrier = childElements(repository)[0];
    return profile === "ead3" ? direct(nameCarrier, "part").map(textOf).join(" ") : textOf(nameCarrier);
  }
  return textOf(direct(identification, profile === "ead4" ? (kind === "reference" ? "unitId" : "unitTitle") : (kind === "reference" ? "unitid" : "unittitle"))[0]);
}

function unitTexts(node: Element, profile: ArchiveProfile, kind: "dates" | "creator" | "extent" | "language" | "subjects" | "digital"): string[] {
  const identification = profile === "ead4" ? direct(node, "identificationData")[0] : direct(node, "did")[0];
  if (kind === "subjects") {
    if (profile === "ead4") return direct(node, "subjectHeadings").flatMap((section) => direct(section, "subject")).flatMap((subject) => direct(subject, "term")).map(textOf).filter(Boolean);
    return direct(node, "controlaccess").flatMap((section) => childElements(section).filter((child) => child.namespaceURI === section.namespaceURI)).map(textOf).filter(Boolean);
  }
  if (kind === "digital") {
    if (profile === "ead4") return direct(node, "formsAvailable").flatMap((container) => direct(container, "formAvailable")).map((item) => clean(item.getAttribute("valueURI") || item.getAttribute("href") || "", 2048)).filter(Boolean);
    return identification ? direct(identification, "dao").map((item) => clean(item.getAttribute("href") || item.getAttributeNS(XLINK_NS, "href") || item.getAttribute("xlink:href") || "", 2048)).filter(Boolean) : [];
  }
  if (!identification) return [];
  if (profile === "ead4") {
    if (kind === "dates") return direct(identification, "unitDate").map((item) => textOf(direct(item, "textualDate")[0]) || textOf(item)).filter(Boolean);
    if (kind === "extent") return direct(identification, "extent").map(textOf).filter(Boolean);
    if (kind === "language") return direct(identification, "languageOfMaterial").flatMap((item) => direct(item, "language")).map((item) => clean(item.getAttribute("languageCode") || textOf(item), 256)).filter(Boolean);
    if (kind === "creator") return direct(node, "agents").flatMap((group) => direct(group, "agent")).flatMap((agent) => direct(agent, "label")).map(textOf).filter(Boolean);
  }
  if (kind === "dates") return direct(identification, "unitdate").map(textOf).filter(Boolean);
  if (kind === "extent") return profile === "ead3"
    ? direct(identification, "physdesc").map(textOf).filter(Boolean)
    : direct(identification, "physdesc").flatMap((item) => direct(item, "extent")).map(textOf).filter(Boolean);
  if (kind === "language") return direct(identification, "langmaterial").flatMap((item) => direct(item, "language")).map((item) => clean(item.getAttribute("langcode") || textOf(item), 256)).filter(Boolean);
  return direct(identification, "origination").flatMap((item) => childElements(item).filter((child) => child.namespaceURI === item.namespaceURI)).map(textOf).filter(Boolean);
}

function sectionText(node: Element, profile: ArchiveProfile, kind: "scope" | "arrangement" | "access" | "use"): string {
  return sectionTexts(node, profile, kind)[0] ?? "";
}

function sectionTexts(node: Element, profile: ArchiveProfile, kind: "scope" | "arrangement" | "access" | "use" | "related" | "note"): string[] {
  const names = profile === "ead4"
    ? { scope: "scopeContent", arrangement: "arrangement", access: "accessConditions", use: "useConditions", related: "relatedMaterial", note: "otherDescription" }
    : { scope: "scopecontent", arrangement: "arrangement", access: "accessrestrict", use: "userestrict", related: "relatedmaterial", note: "odd" };
  let sections = direct(node, names[kind]);
  if (kind === "note") {
    sections = sections.filter((section) => {
      if (profile === "ead4") return !(section.getAttribute("localType") ?? "").startsWith("in-keeping:");
      if (profile === "ead3") return !(section.getAttribute("localtype") ?? "").startsWith("in-keeping:");
      return !textOf(direct(section, "head")[0]).startsWith("in-keeping:");
    });
  }
  return sections.map(textOf).filter(Boolean);
}

function ead2002DescriptionLanguage(node: Element): string {
  const markers = direct(node, "odd").filter((item) => textOf(direct(item, "head")[0]) === "in-keeping:description-language");
  return markers.length === 1 ? textOf(direct(markers[0], "p")[0]) : "";
}

function headerTitle(root: Element, profile: ArchiveProfile): string {
  const control = direct(root, profile === "ead2002" ? "eadheader" : "control")[0];
  if (!control) return "";
  const candidates = descendants(control, profile === "ead4" ? "recordId" : "titleproper");
  return candidates.map(textOf).find(Boolean) ?? "";
}

function parseSchemaDto(value: unknown): ArchiveSchema {
  const dto = objectValue(value, "Schema definition must be an object.");
  exactKeys(dto, ["id", "name", "description", "profile", "recordType", "version", "fields", "createdAt", "updatedAt"]);
  if (!Array.isArray(dto.fields) || dto.fields.length < 1 || dto.fields.length > MAX_FIELDS) throw new Error("Schema field list is invalid.");
  const schema: ArchiveSchema = {
    id: stringValue(dto.id, 128, "schema id"),
    name: stringValue(dto.name, 120, "schema name"),
    description: stringValue(dto.description, 1000, "schema description"),
    profile: enumValue(dto.profile, ARCHIVE_PROFILES.map((item) => item.value), "schema profile"),
    recordType: dto.recordType === undefined ? "description" : enumValue(dto.recordType, ARCHIVE_RECORD_TYPES, "record type"),
    version: integerValue(dto.version, 1, 1000, "schema version"),
    fields: dto.fields.map(parseFieldDto),
    createdAt: stringValue(dto.createdAt, 64, "schema createdAt"),
    updatedAt: stringValue(dto.updatedAt, 64, "schema updatedAt"),
  };
  validateArchiveSchema(schema);
  return schema;
}

function parseFieldDto(value: unknown): ArchiveField {
  const dto = objectValue(value, "Schema field must be an object.");
  exactKeys(dto, ["id", "label", "definition", "kind", "required", "repeatable", "vocabulary", "mappings"]);
  if (!Array.isArray(dto.vocabulary) || dto.vocabulary.length > MAX_VALUES) throw new Error("Schema vocabulary is invalid.");
  const mappings = objectValue(dto.mappings, "Schema field mappings must be an object.");
  exactKeys(mappings, ["ead", "archivesSpace", "atom", "ric"]);
  return {
    id: stringValue(dto.id, 128, "field id"),
    label: stringValue(dto.label, 120, "field label"),
    definition: stringValue(dto.definition, 500, "field definition"),
    kind: enumValue(dto.kind, ARCHIVE_FIELD_KINDS, "field kind"),
    required: booleanValue(dto.required, "field required"),
    repeatable: booleanValue(dto.repeatable, "field repeatable"),
    vocabulary: dto.vocabulary.map((item) => stringValue(item, 256, "vocabulary term")),
    mappings: {
      ead: stringValue(mappings.ead, 256, "EAD mapping"),
      archivesSpace: stringValue(mappings.archivesSpace, 256, "ArchivesSpace mapping"),
      atom: stringValue(mappings.atom, 256, "AtoM mapping"),
      ric: stringValue(mappings.ric, 256, "RiC mapping"),
    },
  };
}

function parseUnitDto(value: unknown): ArchiveUnit {
  const dto = objectValue(value, "Archival record must be an object.");
  exactKeys(dto, ["id", "schemaId", "schemaVersion", "parentId", "level", "values", "published", "language", "createdAt", "updatedAt"]);
  const rawValues = objectValue(dto.values, "Archival record values must be an object.");
  if (Object.keys(rawValues).length > MAX_FIELDS) throw new Error("Archival record has too many fields.");
  const parsedValues: Record<string, ArchiveValue> = {};
  for (const [key, raw] of Object.entries(rawValues)) {
    if (!safeId(key)) throw new Error("Archival value key is unsafe.");
    parsedValues[key] = parseScalarOrArray(raw);
  }
  return {
    id: stringValue(dto.id, 128, "record id"),
    schemaId: stringValue(dto.schemaId, 128, "record schemaId"),
    schemaVersion: integerValue(dto.schemaVersion, 1, 1000, "record schemaVersion"),
    parentId: dto.parentId === null ? null : stringValue(dto.parentId, 128, "record parentId"),
    level: enumValue(dto.level, ARCHIVE_LEVELS, "record level"),
    values: parsedValues,
    published: dto.published === undefined ? false : booleanValue(dto.published, "record published"),
    language: dto.language === undefined ? "en" : stringValue(dto.language, 64, "record language"),
    createdAt: stringValue(dto.createdAt, 64, "record createdAt"),
    updatedAt: stringValue(dto.updatedAt, 64, "record updatedAt"),
  };
}

function canonicalSchema(schema: ArchiveSchema): ArchiveSchema {
  return { ...structuredClone(schema), recordType: schemaRecordType(schema) };
}

function canonicalUnit(unit: ArchiveUnit): ArchiveUnit {
  return { ...structuredClone(unit), published: unit.published === true, language: unit.language || "en" };
}

function validateArchiveValue(value: ArchiveValue, field: ArchiveField): void {
  const list: (string | boolean | number)[] = Array.isArray(value) ? value : [value];
  if (!list.length) throw new Error(`${field.label} is empty and must be omitted.`);
  if (!field.repeatable && list.length > 1) throw new Error(`${field.label} is not repeatable.`);
  if (list.length > MAX_VALUES) throw new Error(`${field.label} exceeds ${MAX_VALUES} values.`);
  for (const entry of list) {
    if (field.kind === "boolean") {
      if (typeof entry !== "boolean") throw new Error(`${field.label} must be true or false.`);
      continue;
    }
    if (field.kind === "integer") {
      if (!Number.isSafeInteger(entry) || Object.is(entry, -0) || Math.abs(Number(entry)) > 1_000_000_000_000) throw new Error(`${field.label} must be a safe integer.`);
      continue;
    }
    if (field.kind === "decimal") {
      if (typeof entry !== "number" || !Number.isFinite(entry) || Object.is(entry, -0) || Math.abs(entry) > 1_000_000_000_000) throw new Error(`${field.label} must be a finite decimal.`);
      continue;
    }
    if (typeof entry !== "string") throw new Error(`${field.label} must be text.`);
    const text = clean(entry, field.kind === "long-text" ? 8192 : 2048);
    if (!text || text !== entry) throw new Error(`${field.label} must be nonempty canonical Unicode text without surrounding whitespace or CR line endings.`);
    if (field.repeatable && text.includes("\n")) throw new Error(`${field.label} values cannot contain line breaks; use one value per line.`);
    if (field.kind === "date" && text && !calendarDate(text)) throw new Error(`${field.label} must use a valid YYYY-MM-DD date.`);
    if (field.kind === "date-time" && text) isoInstant(text, field.label);
    if (field.kind === "edtf" && text && !edtf(text)) throw new Error(`${field.label} must use EDTF notation.`);
    if (field.kind === "uri" && text) {
      const result = reviewPublicHttpsUrl(text);
      if (!result.ok) throw new Error(`${field.label}: ${result.reason}`);
    }
    if (field.kind === "language-code" && text && !languageTag(text)) throw new Error(`${field.label} must be a BCP 47 language tag.`);
    if (field.kind === "media-type" && text && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*[a-z0-9!#$&^_.+-]+=(?:[a-z0-9!#$&^_.+-]+|"[^"]*"))*$/i.test(text)) throw new Error(`${field.label} must be an IANA media type.`);
    if (field.kind === "checksum" && text && !/^(?:sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128}|md5:[a-f0-9]{32})$/i.test(text)) throw new Error(`${field.label} must use algorithm:hex formatting.`);
    if (["record-reference", "agent-reference"].includes(field.kind) && text && !safeId(text)) throw new Error(`${field.label} must contain a safe record identifier.`);
    if (field.kind === "controlled-term" && field.vocabulary.length && !field.vocabulary.includes(text)) throw new Error(`${field.label} is outside its controlled vocabulary.`);
  }
}

function datatype(kind: ArchiveFieldKind): string {
  return ({
    text: "xsd:string", "long-text": "xsd:string", integer: "xsd:integer", decimal: "xsd:decimal", boolean: "xsd:boolean",
    date: "xsd:date", "date-time": "xsd:dateTime", edtf: "edtf:EDTF", identifier: "xsd:string", uri: "xsd:anyURI",
    "language-code": "xsd:language", "media-type": "dcterms:MediaType", checksum: "premis:messageDigest",
    "controlled-term": "xsd:string", "record-reference": "xsd:anyURI", "agent-reference": "xsd:anyURI",
  } as Record<ArchiveFieldKind, string>)[kind];
}

function nodeType(kind: ArchiveFieldKind): string { return ["uri", "record-reference", "agent-reference"].includes(kind) ? "IRI" : "Literal"; }

function referenceShape(kind: ArchiveFieldKind, schema: ArchiveSchema): string {
  if (kind === "record-reference") return `${schema.id}#${schemaRecordType(schema)}`;
  if (kind === "agent-reference") return `${schema.id}#agent`;
  return "";
}

function schemaRecordType(schema: ArchiveSchema): ArchiveRecordType { return schema.recordType ?? "description"; }

function csvImportLevel(value: string, otherLevel: string): ArchiveLevel {
  const raw = value || "other";
  const candidate = raw.toLowerCase().trim() === "otherlevel" ? (otherLevel || "other") : raw;
  const normalized = candidate.toLowerCase().trim().replace(/\s+of\s+description$/i, "").replace(/[ _]+/g, "-");
  const aliases: Record<string, ArchiveLevel> = { recordgrp: "record-group", recordgroup: "record-group", "record-group": "record-group", subfonds: "subseries", "record-series": "series" };
  const result = ARCHIVE_LEVELS.includes(normalized as ArchiveLevel) ? normalized as ArchiveLevel : aliases[normalized];
  if (!result) throw new Error(`CSV archival level is unsupported: ${candidate}.`);
  return result;
}

function eadImportLevel(node: Element): ArchiveLevel {
  const level = clean(node.getAttribute("level") || "other", 64);
  const candidate = level.toLowerCase() === "otherlevel" ? clean(node.getAttribute("otherlevel") || "other", 64) : level;
  const normalized = candidate.toLowerCase().trim().replace(/\s+of\s+description$/i, "").replace(/[ _]+/g, "-");
  const aliases: Record<string, ArchiveLevel> = { recordgrp: "record-group", recordgroup: "record-group", "record-group": "record-group", subfonds: "subseries", "record-series": "series" };
  const result = ARCHIVE_LEVELS.includes(normalized as ArchiveLevel) ? normalized as ArchiveLevel : aliases[normalized];
  if (!result) throw new Error(`EAD level is unsupported: ${candidate}.`);
  return result;
}

function ead4Level(value: ArchiveLevel): string { return value === "record-group" ? "recordGroup" : value === "other" ? "other" : value; }

function legacyLevel(value: ArchiveLevel): string { return value === "record-group" ? "recordgrp" : value === "repository" || value === "other" ? "otherlevel" : value; }

function atomLevel(value: ArchiveLevel): string {
  return ({ repository: "Repository", fonds: "Fonds", collection: "Collection", "record-group": "Record group", series: "Series", subseries: "Subseries", file: "File", item: "Item", other: "Other" } as Record<ArchiveLevel, string>)[value];
}

function childrenMap(units: ArchiveUnit[]): Map<string, ArchiveUnit[]> {
  const map = new Map<string, ArchiveUnit[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const siblings = map.get(unit.parentId);
    if (siblings) siblings.push(unit);
    else map.set(unit.parentId, [unit]);
  }
  return map;
}

function hierarchyDepths(units: ArchiveUnit[]): Map<string, number> {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const result = new Map<string, number>();
  for (const unit of units) {
    let depth = 1;
    let cursor = unit;
    while (cursor.parentId) { depth += 1; cursor = byId.get(cursor.parentId)!; }
    result.set(unit.id, depth);
  }
  return result;
}

function topologicalUnits(units: ArchiveUnit[]): ArchiveUnit[] {
  const children = childrenMap(units);
  const ordered: ArchiveUnit[] = [];
  const stack = units.filter((unit) => unit.parentId === null).slice().reverse();
  while (stack.length) {
    const unit = stack.pop()!;
    ordered.push(unit);
    const nested = children.get(unit.id) ?? [];
    for (let index = nested.length - 1; index >= 0; index -= 1) stack.push(nested[index]);
  }
  if (ordered.length !== units.length) throw new Error("Archival hierarchy cannot be ordered.");
  return ordered;
}

function childElements(node: Element): Element[] { return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1); }

function direct(node: Element, name: string): Element[] { return childElements(node).filter((child) => child.namespaceURI === node.namespaceURI && (child.localName === name || child.localName.toLowerCase() === name.toLowerCase())); }

function descendants(node: Element, name: string): Element[] { return Array.from(node.getElementsByTagNameNS(node.namespaceURI, name)); }

function isLegacyComponent(node: Element): boolean { return /^c(?:\d{2})?$/.test(node.localName.toLowerCase()); }

function textOf(node: Element | undefined): string { return node ? clean(node.textContent ?? "", 8192) : ""; }

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;
  const pushCell = () => {
    if (row.length >= 256) throw new Error("CSV exceeds 256 columns.");
    row.push(unprotectSpreadsheetCell(value));
    value = "";
  };
  const pushRow = () => {
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > MAX_UNITS + 2) throw new Error("CSV record limit exceeded.");
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else value += char;
      continue;
    }
    if (afterQuote) {
      if (char === ",") { pushCell(); afterQuote = false; continue; }
      if (char === "\r" && text[index + 1] === "\n") continue;
      if (char === "\n") {
        pushCell();
        pushRow();
        afterQuote = false;
        continue;
      }
      throw new Error("CSV contains text after a closing quote.");
    }
    if (char === '"') { if (value) throw new Error("CSV contains a quote inside an unquoted field."); quoted = true; continue; }
    if (char === ",") { pushCell(); continue; }
    if (char === "\n") {
      value = value.replace(/\r$/, "");
      pushCell();
      pushRow();
      continue;
    }
    value += char;
    if (value.length > MAX_FILE_BYTES) throw new Error("CSV cell exceeds the 5 MiB file ceiling.");
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  value = value.replace(/\r$/, "");
  pushCell();
  pushRow();
  return rows;
}

function cleanFileText(text: string): void {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("File contains disallowed control characters.");
}

function mimeMatches(type: string, extension: "json" | "csv" | "xml"): boolean {
  if (!type || type === "application/octet-stream") return true;
  const normalized = type.split(";", 1)[0].toLowerCase();
  const allowed = extension === "json" ? ["application/json", "text/json"] : extension === "csv" ? ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"] : ["application/xml", "text/xml", "application/ead+xml"];
  return allowed.includes(normalized);
}

function inspectUntrusted(value: unknown, depth: number): void {
  if (depth > 16) throw new Error("Schema package nesting exceeds 16 levels.");
  if (typeof value === "string") { clean(value, 8192); return; }
  if (Array.isArray(value)) {
    if (value.length > MAX_UNITS) throw new Error("Schema package array limit exceeded.");
    value.forEach((item) => inspectUntrusted(item, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 256) throw new Error("Schema package object limit exceeded.");
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key) || key.length > 256) throw new Error("Schema package contains a forbidden key.");
      inspectUntrusted((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}

function parseScalarOrArray(value: unknown): ArchiveValue {
  const parseScalar = (entry: unknown): string | boolean | number => {
    if (typeof entry === "string") return clean(entry, 8192);
    if (typeof entry === "boolean") return entry;
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    throw new Error("Archival values must be finite scalar values.");
  };
  if (Array.isArray(value)) {
    if (value.length > MAX_VALUES) throw new Error("Archival field value limit exceeded.");
    const parsed = value.map(parseScalar);
    if (new Set(parsed.map((entry) => typeof entry)).size > 1) throw new Error("Archival value arrays must use one scalar type.");
    if (parsed.every((entry): entry is string => typeof entry === "string")) return parsed;
    if (parsed.every((entry): entry is boolean => typeof entry === "boolean")) return parsed;
    return parsed as number[];
  }
  return parseScalar(value);
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!plainObject(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function plainObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): void {
  const known = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !known.has(key));
  if (unexpected) throw new Error(`Unknown field: ${unexpected}.`);
}

function stringValue(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  return clean(value, max);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  return value;
}

function integerValue(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function enumValue<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`${label} is unsupported.`);
  return value as T;
}

function values(value: ArchiveValue | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function display(value: ArchiveValue | undefined): string { return values(value).join("; "); }

function empty(value: ArchiveValue | undefined): boolean { return value === undefined || value === "" || (Array.isArray(value) && value.length === 0); }

function assign(target: Record<string, ArchiveValue>, key: string, value: string): void { if (value) target[key] = value; }

function assignArray(target: Record<string, ArchiveValue>, key: string, list: string[]): void { if (list.length) target[key] = list; }

function assignList(target: Record<string, ArchiveValue>, key: string, value: string): void {
  if (value) target[key] = decodeCsvList(value);
}

function safeId(value: string): boolean { return !FORBIDDEN_KEYS.has(value.toLowerCase()) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }

function uniqueFieldId(value: string, used: Set<string>): string {
  const seed = value.normalize("NFKD").replace(/[^A-Za-z0-9._:-]+/g, "_").replace(/^[_:.-]+/, "").slice(0, 96) || "imported_field";
  let id = safeId(seed) ? seed : `field_${seed.replace(/[^A-Za-z0-9._:-]/g, "_")}`;
  let suffix = 2;
  while (!safeId(id) || used.has(id)) id = `${seed.slice(0, 90)}_${suffix++}`;
  return id;
}

function clean(value: string, max: number): string {
  const result = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result) || result.length > max) throw new Error("Archival text is invalid or exceeds its limit.");
  for (let index = 0; index < result.length; index += 1) {
    const code = result.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = result.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error("Archival text contains an unpaired Unicode surrogate.");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("Archival text contains an unpaired Unicode surrogate.");
    }
  }
  return result;
}

function canonicalText(value: string, max: number, label: string, required = false): string {
  const result = clean(value, max);
  if (required && !result) throw new Error(`${label} is required.`);
  if (result !== value) throw new Error(`${label} must use NFC Unicode, LF line endings, and no surrounding whitespace.`);
  return result;
}

function isoInstant(value: string, label: string): void {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  const canonical = match ? `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z` : "";
  if (!match || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== canonical) throw new Error(`${label} must be an ISO 8601 UTC timestamp.`);
}

function languageTag(value: string): boolean { return /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value); }

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function edtf(value: string): boolean {
  if (edtfExpression(value)) return true;

  const opening = value[0];
  const expectedClosing = opening === "[" ? "]" : opening === "{" ? "}" : "";
  if (!expectedClosing || value.at(-1) !== expectedClosing) return false;
  const members = value.slice(1, -1).split(",");
  return members.length >= 2
    && members.length <= 100
    && members.every((member) => member.length > 0 && member === member.trim() && edtfExpression(member));
}

function edtfExpression(value: string): boolean {
  const slash = value.indexOf("/");
  if (slash < 0) return edtfAtom(value);
  if (slash === 0 || value.indexOf("/", slash + 1) >= 0) return false;
  const end = value.slice(slash + 1);
  return edtfAtom(value.slice(0, slash)) && (end === ".." || edtfAtom(end));
}

function edtfAtom(value: string): boolean {
  const match = value.match(/^([0-9X]{4})(?:-([0-9X]{2})(?:-([0-9X]{2}))?)?([?~%])?$/);
  if (!match) return false;
  const [, year, month, day] = match;
  if (month && month !== "XX" && (!/^\d{2}$/.test(month) || Number(month) < 1 || Number(month) > 12)) return false;
  if (day && day !== "XX" && (!/^\d{2}$/.test(day) || Number(day) < 1 || Number(day) > 31)) return false;
  if (month === "XX" && day && day !== "XX") return false;
  if (day && /^\d{4}$/.test(year) && month && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)) {
    return calendarDate(`${year}-${month}-${day}`);
  }
  return true;
}

function xmlId(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(value)) throw new Error("EAD export requires archival record IDs that are valid XML NCNames; use the lossless schema package for other IDs.");
  return value;
}

function xml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!); }

function csv(value: string): string {
  const safe = /^\s*'*[=+@-]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function unprotectSpreadsheetCell(value: string): string {
  if (!value.startsWith("'")) return value;
  const restored = value.slice(1);
  return /^\s*'*[=+@-]/.test(restored) ? restored : value;
}

function encodeCsvList(list: string[]): string {
  return list.map((value) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")).join("|");
}

function decodeCsvList(value: string): string[] {
  const result: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && (value[index + 1] === "\\" || value[index + 1] === "|")) {
      current += value[index + 1];
      index += 1;
    } else if (character === "|") {
      if (result.length >= MAX_VALUES - 1) throw new Error(`CSV list exceeds ${MAX_VALUES} values.`);
      result.push(clean(current, 8192));
      current = "";
    } else {
      current += character;
      if (current.length > 8192) throw new Error("CSV list value exceeds 8 KiB.");
    }
  }
  result.push(clean(current, 8192));
  return result.filter(Boolean);
}

function assertArchiveSourceBudget(schema: ArchiveSchema, units: ArchiveUnit[]): void {
  const encoder = new TextEncoder();
  let bytes = 0;
  const add = (value: unknown) => {
    if (typeof value === "string") bytes += encoder.encode(value).byteLength;
    else bytes += 16;
    if (bytes > MAX_FILE_BYTES) throw new Error("Archival content exceeds the 5 MiB exchange source budget. Export a smaller archival selection.");
  };
  add(schema.id); add(schema.name); add(schema.description); add(schema.createdAt); add(schema.updatedAt);
  for (const schemaField of schema.fields) {
    add(schemaField.id); add(schemaField.label); add(schemaField.definition);
    schemaField.vocabulary.forEach(add);
    Object.values(schemaField.mappings).forEach(add);
  }
  for (const unit of units) {
    add(unit.id); add(unit.schemaId); add(unit.parentId ?? ""); add(unit.language ?? ""); add(unit.createdAt); add(unit.updatedAt);
    for (const [key, raw] of Object.entries(unit.values)) {
      add(key);
      (Array.isArray(raw) ? raw : [raw]).forEach(add);
    }
  }
}

async function hash(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value.slice(0));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
