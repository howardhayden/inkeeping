import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import {
  ARCHIVE_FIELD_KINDS,
  ARCHIVE_RECORD_TYPES,
  formatArchive,
  makeArchiveSchema,
  normalizeArchiveEditorValues,
  parseOneValuePerLine,
  parseOneValuePerLineDraft,
  reviewArchiveImport,
  validateArchiveSet,
} from "../app/archival-schemas.ts";
import {
  activeRevision,
  createBlankWorkspace,
  createFixtureWorkspace,
  rollbackTo,
  upsertArchiveSchema,
  upsertArchiveUnit,
  validateWorkspaceSnapshot,
  verifyAudit,
} from "../app/lab-core.ts";

globalThis.DOMParser = DOMParser;

const AT = "2026-08-20T12:00:00.000Z";

function makeSchema(profile = "dacs", id = "SCHEMA-ARCHIVE-1") {
  return makeArchiveSchema(profile, "Community records", id, AT);
}

function makeUnit(schema, {
  id = "UNIT-ROOT",
  parentId = null,
  level = "collection",
  referenceCode = "MS-001",
  title = "Community records",
  values = {},
  published = false,
  language = "en",
} = {}) {
  return {
    id,
    schemaId: schema.id,
    schemaVersion: schema.version,
    parentId,
    level,
    published,
    language,
    values: {
      reference_code: referenceCode,
      title,
      ...values,
    },
    createdAt: AT,
    updatedAt: AT,
  };
}

function elementChildren(node) {
  return Array.from(node.childNodes).filter((child) => child.nodeType === 1);
}

function directChild(node, localName) {
  return elementChildren(node).find((child) => child.localName === localName) ?? null;
}

function descendant(node, localName) {
  return Array.from(node.getElementsByTagNameNS("*", localName))[0] ?? null;
}

function parseXml(value) {
  const document = new DOMParser().parseFromString(value, "application/xml");
  assert.equal(document.getElementsByTagName("parsererror").length, 0, "serializer emits well-formed XML");
  return document;
}

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((entry) => entry !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  assert.equal(quoted, false, "CSV has no unterminated field");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((entry) => entry !== "")) rows.push(row);
  }
  const [headers = [], ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function list(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function fieldForKind(kind, index) {
  return {
    id: kind === "text" ? "title" : `field_${index}`,
    label: kind,
    definition: `Explicit ${kind} field.`,
    kind,
    required: false,
    repeatable: false,
    vocabulary: [],
    mappings: {
      ead: `local:${index}`,
      archivesSpace: `field_${index}`,
      atom: `field${index}`,
      ric: `property${index}`,
    },
  };
}

function valueForKind(kind, suffix = "") {
  return ({
    text: `Plain text${suffix}`,
    "long-text": `A bounded narrative with meaningful context${suffix}.`,
    integer: 42,
    decimal: 3.125,
    boolean: false,
    date: "2026-08-20",
    "date-time": "2026-08-20T12:00:00.000Z",
    edtf: "1940/1980",
    identifier: `LOCAL-001${suffix}`,
    uri: `https://archives.example.org/record/1${suffix ? `?v=${encodeURIComponent(suffix)}` : ""}`,
    "language-code": "en-US",
    "media-type": "application/pdf",
    checksum: `sha256:${"a".repeat(64)}`,
    "controlled-term": `Open${suffix}`,
    "record-reference": `UNIT-RELATED${suffix}`,
    "agent-reference": `AGENT-001${suffix}`,
  })[kind];
}

test("new workspaces are blank and Sample data is loaded only by an explicit action", async () => {
  const blank = await createBlankWorkspace();
  const blankRevision = activeRevision(blank);
  assert.equal(blankRevision.records.length, 0);
  assert.equal(blankRevision.archiveSchemas?.length, 0);
  assert.equal(blankRevision.archiveUnits?.length, 0);
  assert.equal(blank.incidents.length, 0);
  assert.equal(blankRevision.label, "Empty baseline");

  const sample = await createFixtureWorkspace();
  assert.match(sample.name, /^Sample workspace$/);
  assert.ok(activeRevision(sample).records.length > 0);
  assert.ok(sample.incidents.length > 0);
  assert.notEqual(sample.activeRevisionId, blank.activeRevisionId);
});

test("schema packages round-trip custom schemas and typed record values exactly", async () => {
  const schema = makeSchema("blank", "SCHEMA-CUSTOM-1");
  assert.equal(schema.recordType, "description");
  schema.fields.push(
    {
      id: "digitized",
      label: "Digitized",
      definition: "Whether a digital surrogate has been created.",
      kind: "boolean",
      required: false,
      repeatable: false,
      vocabulary: [],
      mappings: { ead: "local:digitized", archivesSpace: "digitized", atom: "digitized", ric: "digitized" },
    },
    {
      id: "container_count",
      label: "Container count",
      definition: "Number of physical containers.",
      kind: "integer",
      required: false,
      repeatable: false,
      vocabulary: [],
      mappings: { ead: "local:containerCount", archivesSpace: "container_count", atom: "containerCount", ric: "quantity" },
    },
  );
  const units = [makeUnit(schema, { values: { digitized: false, container_count: 7 } })];
  const packet = formatArchive(schema, units, "schema-package");
  const review = await reviewArchiveImport(new File([packet], "community.archive-schema.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.format, "schema-package");
  assert.deepEqual(review.schema, schema);
  assert.deepEqual(review.units, units);
});

test("schema packages preserve an explicit value for every archival field kind", async () => {
  const schema = makeSchema("blank", "SCHEMA-ALL-TYPES");
  schema.recordType = "event";
  schema.fields = ARCHIVE_FIELD_KINDS.map(fieldForKind);
  const valueByKind = {
    text: "Plain text",
    "long-text": "A bounded narrative with meaningful context.",
    integer: 42,
    decimal: 3.125,
    boolean: false,
    date: "2026-08-20",
    "date-time": "2026-08-20T12:00:00.000Z",
    edtf: "1940/1980",
    identifier: "LOCAL-001",
    uri: "https://archives.example.org/record/1",
    "language-code": "en-US",
    "media-type": "application/pdf",
    checksum: `sha256:${"a".repeat(64)}`,
    "controlled-term": "Open",
    "record-reference": "UNIT-RELATED",
    "agent-reference": "AGENT-001",
  };
  const values = Object.fromEntries(schema.fields.map((field) => [field.id, valueByKind[field.kind]]));
  const unit = makeUnit(schema, { level: "other", parentId: null, values });
  delete unit.values.reference_code;
  const packet = formatArchive(schema, [unit], "schema-package");
  const review = await reviewArchiveImport(new File([packet], "all-types.archive-schema.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  assert.deepEqual(review.units[0].values, values);
  assert.equal(Object.keys(review.units[0].values).length, ARCHIVE_FIELD_KINDS.length);
});

test("the archival EDTF subset requires valid atoms and paired bounded sets", () => {
  const schema = makeSchema("dacs", "SCHEMA-EDTF");
  const maximumGroup = `[${Array.from({ length: 100 }, (_, index) => String(1900 + index)).join(",")}]`;
  const oversizedGroup = `[${Array.from({ length: 101 }, (_, index) => String(1800 + index)).join(",")}]`;
  const accepted = [
    "1940",
    "194X",
    "1940?",
    "1940-02-29",
    "1940-XX-XX",
    "1940/1980",
    "1940/..",
    "[1940,1980]",
    "{1940,1980/..}",
    maximumGroup,
  ];
  for (const value of accepted) {
    const unit = makeUnit(schema, { values: { dates: [value] } });
    assert.doesNotThrow(() => validateArchiveSet([schema], [unit]), value);
  }

  const rejected = [
    "[1940",
    "1940]",
    "{1940,1980]",
    "{1940}",
    "[1940, 1980]",
    "{.,/}",
    "1940-00",
    "1940-13",
    "1940-02-30",
    "1940-XX-15",
    "1940/1980/2000",
    oversizedGroup,
  ];
  for (const value of rejected) {
    const unit = makeUnit(schema, { values: { dates: [value] } });
    assert.throws(() => validateArchiveSet([schema], [unit]), /EDTF notation/i, value);
  }
});

test("custom archive schemas require canonical accessible labels and vocabulary terms", () => {
  const paddedName = makeSchema("blank", "SCHEMA-PADDED");
  paddedName.name = " Padded schema ";
  assert.throws(() => validateArchiveSet([paddedName], []), /Schema name.*surrounding whitespace/i);

  const blankDefinition = makeSchema("blank", "SCHEMA-BLANK-DEFINITION");
  blankDefinition.fields[0].definition = "";
  assert.throws(() => validateArchiveSet([blankDefinition], []), /field definition is required/i);

  const decomposedLabel = makeSchema("blank", "SCHEMA-NFD-LABEL");
  decomposedLabel.fields[0].label = "Cafe\u0301 title";
  assert.throws(() => validateArchiveSet([decomposedLabel], []), /field label.*NFC Unicode/i);

  const duplicateTerms = makeSchema("blank", "SCHEMA-DUPLICATE-TERMS");
  duplicateTerms.fields.push({
    ...fieldForKind("controlled-term", 50),
    vocabulary: ["Open", "Open"],
  });
  assert.throws(() => validateArchiveSet([duplicateTerms], []), /vocabulary terms must be unique/i);
});

test("archival reference codes are unique across distinct records", () => {
  const schema = makeSchema("blank", "SCHEMA-REFERENCE-CODE-UNIQUE");
  const first = makeUnit(schema, { id: "UNIT-REFERENCE-FIRST", referenceCode: "MS-SAME" });
  const second = makeUnit(schema, { id: "UNIT-REFERENCE-SECOND", referenceCode: "MS-SAME" });

  assert.throws(
    () => validateArchiveSet([schema], [first, second]),
    /reference codes must be unique across distinct records/i,
  );
});

test("lossless schema packages round-trip all 16 field kinds for all 10 archival record types", async () => {
  for (const [recordIndex, recordType] of ARCHIVE_RECORD_TYPES.entries()) {
    const schema = makeSchema("blank", `SCHEMA-PACKAGE-${recordIndex}`);
    schema.recordType = recordType;
    schema.fields = ARCHIVE_FIELD_KINDS.map(fieldForKind);
    const values = Object.fromEntries(schema.fields.map((schemaField) => [schemaField.id, valueForKind(schemaField.kind, `-${recordIndex}`)]));
    const unit = makeUnit(schema, { id: `UNIT-TYPE-${recordIndex}`, level: recordType === "description" ? "collection" : "other", values });
    delete unit.values.reference_code;
    const packet = formatArchive(schema, [unit], "schema-package");
    const review = await reviewArchiveImport(new File([packet], `type-${recordIndex}.archive-schema.json`, { type: "application/json" }));
    assert.equal(review.blocked, false, `${recordType}: ${review.summary}`);
    assert.equal(review.schema.recordType, recordType);
    assert.deepEqual(review.schema, schema);
    assert.deepEqual(review.units, [unit]);
  }
});

test("lossless packages accept 128 fields with 250 values and exactly 5,000 records", async () => {
  const wide = makeSchema("blank", "SCHEMA-WIDE-MAX");
  wide.recordType = "event";
  wide.fields = Array.from({ length: 128 }, (_, index) => ({
    ...fieldForKind("text", index),
    id: index === 0 ? "title" : `field_${index}`,
    repeatable: true,
    mappings: { ead: `local:${index}`, archivesSpace: `field_${index}`, atom: `field${index}`, ric: `property${index}` },
  }));
  const wideValues = Object.fromEntries(wide.fields.map((schemaField, index) => [schemaField.id, Array.from({ length: 250 }, (_, valueIndex) => `v${index}-${valueIndex}`)]));
  const wideUnit = makeUnit(wide, { id: "UNIT-WIDE-MAX", level: "other", values: wideValues });
  delete wideUnit.values.reference_code;
  const widePacket = formatArchive(wide, [wideUnit], "schema-package");
  const wideReview = await reviewArchiveImport(new File([widePacket], "wide.archive-schema.json", { type: "application/json" }));
  assert.equal(wideReview.blocked, false, wideReview.summary);
  assert.equal(wideReview.schema.fields.length, 128);
  assert.ok(Object.values(wideReview.units[0].values).every((value) => value.length === 250));
  assert.deepEqual(wideReview.units[0].values, wideValues);

  const many = makeSchema("blank", "SCHEMA-UNIT-MAX");
  const units = Array.from({ length: 5000 }, (_, index) => makeUnit(many, {
    id: `UNIT-${String(index).padStart(4, "0")}`,
    referenceCode: `MS-${index}`,
    title: `Record ${index}`,
  }));
  const manyPacket = formatArchive(many, units, "schema-package");
  assert.ok(Buffer.byteLength(manyPacket) <= 5 * 1024 * 1024);
  const manyReview = await reviewArchiveImport(new File([manyPacket], "many.archive-schema.json", { type: "application/json" }));
  assert.equal(manyReview.blocked, false, manyReview.summary);
  assert.equal(manyReview.units.length, 5000);
  assert.equal(manyReview.units.at(-1).id, "UNIT-4999");
});

test("non-description schemas cannot masquerade as hierarchy or vendor description exports", () => {
  const schema = makeSchema("blank", "SCHEMA-AGENT");
  schema.recordType = "agent";
  schema.fields = [fieldForKind("text", 0)];
  const hierarchical = makeUnit(schema, { level: "collection" });
  hierarchical.values = { title: "Example agent" };
  assert.throws(() => formatArchive(schema, [hierarchical], "schema-package"), /level other|descriptive hierarchy/i);

  const unit = makeUnit(schema, { level: "other", parentId: null });
  unit.values = { title: "Example agent" };
  assert.throws(() => formatArchive(schema, [unit], "ead4"), /only for descriptive record schemas/i);
  assert.throws(() => formatArchive(schema, [unit], "archives-space-csv"), /only for descriptive record schemas/i);
  assert.throws(() => formatArchive(schema, [unit], "atom-csv"), /only for descriptive record schemas/i);
  assert.match(formatArchive(schema, [unit], "schema-package"), /in-keeping\/archive-schema/);
  assert.match(formatArchive(schema, [], "dctap-csv"), /agent/);
});

test("DCTAP explicitly formats every archival field kind for every record type", () => {
  const expectedDatatype = {
    text: "xsd:string",
    "long-text": "xsd:string",
    integer: "xsd:integer",
    decimal: "xsd:decimal",
    boolean: "xsd:boolean",
    date: "xsd:date",
    "date-time": "xsd:dateTime",
    edtf: "edtf:EDTF",
    identifier: "xsd:string",
    uri: "xsd:anyURI",
    "language-code": "xsd:language",
    "media-type": "dcterms:MediaType",
    checksum: "premis:messageDigest",
    "controlled-term": "xsd:string",
    "record-reference": "xsd:anyURI",
    "agent-reference": "xsd:anyURI",
  };
  for (const [recordIndex, recordType] of ARCHIVE_RECORD_TYPES.entries()) {
    const schema = makeSchema("blank", `SCHEMA-DCTAP-${recordIndex}`);
    schema.recordType = recordType;
    schema.fields = ARCHIVE_FIELD_KINDS.map(fieldForKind);
    const rows = parseCsv(formatArchive(schema, [], "dctap-csv"));
    assert.equal(rows.length, ARCHIVE_FIELD_KINDS.length, `${recordType} exposes every field kind`);
    assert.ok(rows.every((row) => row.shapeID === `${schema.id}#${recordType}`));
    for (const [index, kind] of ARCHIVE_FIELD_KINDS.entries()) {
      assert.equal(rows[index].valueDataType, expectedDatatype[kind], `${recordType}/${kind} datatype`);
      assert.equal(rows[index].valueNodeType, ["uri", "record-reference", "agent-reference"].includes(kind) ? "IRI" : "Literal");
    }
  }
});

test("schema-package quarantine rejects MIME mismatches, unknown fields, and prototype keys", async () => {
  const schema = makeSchema("blank", "SCHEMA-SECURE-1");
  const unit = makeUnit(schema);
  const packet = formatArchive(schema, [unit], "schema-package");

  const mismatch = await reviewArchiveImport(new File([packet], "secure.archive-schema.json", { type: "text/html" }));
  assert.equal(mismatch.blocked, true);
  assert.match(mismatch.summary, /MIME|media type|content type|file type/i);

  const duplicateIdentity = packet.replace("{", '{"schema":"forged",');
  const duplicateReview = await reviewArchiveImport(new File([duplicateIdentity], "duplicate.archive-schema.json", { type: "application/json" }));
  assert.equal(duplicateReview.blocked, true);
  assert.match(duplicateReview.summary, /duplicate member name "schema"/i);

  const surrogateIdentity = packet.replace("in-keeping/archive-schema", "\\uD800");
  const surrogateReview = await reviewArchiveImport(new File([surrogateIdentity], "surrogate.archive-schema.json", { type: "application/json" }));
  assert.equal(surrogateReview.blocked, true);
  assert.match(surrogateReview.summary, /unpaired Unicode surrogate/i);

  const withUnknownRoot = JSON.parse(packet);
  withUnknownRoot.renderAsHtml = true;
  const unknownRoot = await reviewArchiveImport(new File([JSON.stringify(withUnknownRoot)], "unknown.archive-schema.json", { type: "application/json" }));
  assert.equal(unknownRoot.blocked, true);
  assert.match(unknownRoot.summary, /Unknown|unexpected|field|key/i);

  const withUnknownRecord = JSON.parse(packet);
  withUnknownRecord.records[0].html = "<script>alert(1)</script>";
  const unknownRecord = await reviewArchiveImport(new File([JSON.stringify(withUnknownRecord)], "unknown-record.archive-schema.json", { type: "application/json" }));
  assert.equal(unknownRecord.blocked, true);
  assert.match(unknownRecord.summary, /Unknown|unexpected|field|key/i);

  const poisoned = packet.replace(/^\{/, '{"constructor":{"polluted":true},');
  const poisonedReview = await reviewArchiveImport(new File([poisoned], "poison.archive-schema.json", { type: "application/json" }));
  assert.equal(poisonedReview.blocked, true);
  assert.match(poisonedReview.summary, /forbidden|prototype|constructor/i);
  assert.equal({}.polluted, undefined);

  const reservedId = makeUnit(schema, { id: "constructor" });
  assert.throws(() => validateArchiveSet([schema], [reservedId]), /invalid|forbidden|reserved/i);
});

test("archival hierarchy validation rejects missing parents, cycles, and depth beyond 32", () => {
  const schema = makeSchema("blank", "SCHEMA-HIERARCHY-1");
  const missingParent = makeUnit(schema, { id: "UNIT-ORPHAN", parentId: "UNIT-MISSING", level: "file" });
  assert.throws(() => validateArchiveSet([schema], [missingParent]), /parent.*missing|missing.*parent/i);

  const first = makeUnit(schema, { id: "UNIT-A", parentId: "UNIT-B", referenceCode: "A" });
  const second = makeUnit(schema, { id: "UNIT-B", parentId: "UNIT-A", referenceCode: "B" });
  assert.throws(() => validateArchiveSet([schema], [first, second]), /cycle|circular/i);

  const deep = Array.from({ length: 34 }, (_, index) => makeUnit(schema, {
    id: `UNIT-${String(index).padStart(2, "0")}`,
    parentId: index === 0 ? null : `UNIT-${String(index - 1).padStart(2, "0")}`,
    level: index === 0 ? "collection" : "series",
    referenceCode: `MS-${index}`,
    title: `Level ${index}`,
  }));
  assert.throws(() => validateArchiveSet([schema], deep), /32|depth|hierarchy.*limit/i);
});

test("archival URI fields share the public HTTPS boundary", () => {
  const schema = makeSchema("dacs", "SCHEMA-URI");
  const unit = makeUnit(schema, { values: { digital_object_uri: ["https://127.0.0.1/private"] } });
  assert.throws(() => validateArchiveSet([schema], [unit]), /Private, reserved, or non-routable IPv4/i);
});

test("archival timestamps require real UTC instants", () => {
  const schema = makeSchema("dacs", "SCHEMA-TIME");
  schema.updatedAt = "2026-02-30T00:00:00.000Z";
  assert.throws(() => validateArchiveSet([schema], []), /ISO 8601 UTC timestamp/i);
});

test("EAD serializers emit version-specific structures, round-trip, and escape record content", async () => {
  const schema = makeSchema("dacs", "SCHEMA-EAD-1");
  const rootTitle = 'Community & <unsafe> "records"';
  const root = makeUnit(schema, {
    title: rootTitle,
    values: {
      dates: ["1940/1980"],
      scope_content: "Contains correspondence & <notes>.",
      digital_object_uri: ["https://archives.example.org/object/1?a=1&b=2"],
    },
  });
  const child = makeUnit(schema, {
    id: "UNIT-CHILD",
    parentId: root.id,
    level: "file",
    referenceCode: "MS-001-01",
    title: "Minutes",
  });

  const ead4 = formatArchive(schema, [root, child], "ead4");
  assert.match(ead4, /&amp;/);
  assert.match(ead4, /&lt;unsafe&gt;/);
  assert.doesNotMatch(ead4, /<unsafe>/);
  const ead4Document = parseXml(ead4);
  assert.equal(ead4Document.documentElement.namespaceURI, "https://standards.openpreservation.org/ead/v4");
  const ead4Control = directChild(ead4Document.documentElement, "control");
  const ead4Description = directChild(ead4Document.documentElement, "archDesc");
  assert.ok(ead4Control);
  assert.ok(directChild(ead4Control, "recordId"));
  assert.ok(directChild(ead4Control, "maintenanceAgency"));
  assert.ok(directChild(ead4Control, "maintenanceHistory"));
  assert.ok(ead4Description);
  assert.ok(directChild(ead4Description, "identificationData"));
  assert.ok(directChild(ead4Description, "descriptionOfComponents"));
  assert.equal(descendant(ead4Description, "unitTitle").textContent, rootTitle);
  assert.equal(descendant(ead4Description, "formAvailable").getAttribute("valueURI"), "https://archives.example.org/object/1?a=1&b=2");
  assert.equal(ead4Document.getElementsByTagNameNS("*", "archdesc").length, 0, "EAD 4 uses camelCase element names");
  const roundTrip = await reviewArchiveImport(new File([ead4], "round-trip.ead.xml", { type: "application/xml" }));
  assert.equal(roundTrip.blocked, false, roundTrip.summary);
  assert.equal(roundTrip.units.length, 2);
  assert.ok(roundTrip.units.some((unit) => unit.values.title === rootTitle));
  assert.ok(roundTrip.units.some((unit) => unit.values.title === "Minutes"));

  const ead3 = parseXml(formatArchive(schema, [root, child], "ead3"));
  assert.equal(ead3.documentElement.namespaceURI, "http://ead3.archivists.org/schema/");
  const ead3Control = directChild(ead3.documentElement, "control");
  assert.ok(ead3Control);
  for (const name of ["recordid", "filedesc", "maintenancestatus", "maintenanceagency", "maintenancehistory"]) {
    assert.ok(directChild(ead3Control, name), `EAD3 control contains ${name}`);
  }
  const ead3Description = directChild(ead3.documentElement, "archdesc");
  assert.ok(directChild(ead3Description, "did"));
  assert.ok(directChild(ead3Description, "dsc"));

  const ead2002 = parseXml(formatArchive(schema, [root, child], "ead2002"));
  assert.equal(ead2002.documentElement.namespaceURI, "urn:isbn:1-931666-22-9");
  const header = directChild(ead2002.documentElement, "eadheader");
  assert.ok(header);
  assert.ok(descendant(header, "eadid"));
  assert.ok(descendant(header, "filedesc"));
  const legacyDescription = directChild(ead2002.documentElement, "archdesc");
  assert.ok(directChild(legacyDescription, "did"));
  assert.ok(directChild(legacyDescription, "dsc"));
  const dao = descendant(legacyDescription, "dao");
  assert.equal(dao.getAttributeNS("http://www.w3.org/1999/xlink", "href"), "https://archives.example.org/object/1?a=1&b=2");
});

test("EAD 4, EAD3, and EAD 2002 own exports re-import all mapped core evidence, levels, privacy, and hierarchy", async () => {
  const schema = makeSchema("dacs", "SCHEMA-EAD-CORE");
  const values = {
    reference_code: "MS-EAD-1",
    title: "Institutional records",
    dates: ["1940/1980", "2000"],
    creator: ["Office of Records", "Project staff"],
    extent: ["2 boxes", "1.5 GiB"],
    scope_content: "Administrative and born-digital records.",
    arrangement: "Two series.",
    access_conditions: "Reading-room access.",
    use_conditions: "Permission may be required.",
    language: ["en", "fr"],
    repository: "Example Archives",
    subjects: ["Digital preservation", "Institutional archives"],
    related_material: ["MS-EAD-2", "Published guide"],
    digital_object_uri: ["https://archives.example.org/object/1", "https://archives.example.org/object/2"],
    note: ["Processing complete.", "Checksums retained."],
  };
  const root = makeUnit(schema, { id: "UNIT-EAD-ROOT", level: "repository", values, published: true, language: "en-US" });
  const child = makeUnit(schema, { id: "UNIT-EAD-CHILD", parentId: root.id, level: "other", referenceCode: "MS-EAD-1-A", title: "Private component", published: false, language: "fr" });

  for (const format of ["ead4", "ead3", "ead2002"]) {
    const exported = formatArchive(schema, [child, root], format);
    const review = await reviewArchiveImport(new File([exported], `${format}.xml`, { type: "application/xml" }));
    assert.equal(review.blocked, false, `${format}: ${review.summary}`);
    const importedRoot = review.units.find((unit) => unit.id === root.id);
    const importedChild = review.units.find((unit) => unit.id === child.id);
    assert.ok(importedRoot);
    assert.ok(importedChild);
    assert.deepEqual({ ...importedRoot.values }, values, `${format} restores all mapped core evidence`);
    assert.equal(importedRoot.level, "repository");
    assert.equal(importedRoot.published, true);
    assert.equal(importedRoot.language, "en-US");
    assert.equal(importedChild.parentId, root.id);
    assert.equal(importedChild.level, "other");
    assert.equal(importedChild.published, false);
  }
});

test("EAD export rejects custom values that its fixed profile cannot preserve", async () => {
  const schema = makeSchema("dacs", "SCHEMA-EAD-CUSTOM");
  schema.fields.push({
    ...fieldForKind("long-text", 99),
    id: "processing_history",
    label: "Processing history",
    mappings: { ead: "local:processing-history", archivesSpace: "processing_history", atom: "processingHistory", ric: "processingHistory" },
  });
  const unit = makeUnit(schema, { values: { processing_history: "Retain this semantically distinct local evidence." } });

  for (const format of ["ead4", "ead3", "ead2002"]) {
    assert.throws(
      () => formatArchive(schema, [unit], format),
      /cannot preserve custom field processing_history.*lossless schema package/i,
      `${format} must reject rather than hide custom evidence in a local note`,
    );
  }

  const lossless = formatArchive(schema, [unit], "schema-package");
  const review = await reviewArchiveImport(new File([lossless], "custom.archive-schema.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.units[0].values.processing_history, "Retain this semantically distinct local evidence.");

  const changedCardinality = makeSchema("dacs", "SCHEMA-EAD-CARDINALITY");
  changedCardinality.fields.find((field) => field.id === "repository").repeatable = true;
  const repeatedRepository = makeUnit(changedCardinality, { values: { repository: ["Repository A", "Repository B"] } });
  for (const format of ["ead4", "ead3", "ead2002"]) {
    assert.throws(
      () => formatArchive(changedCardinality, [repeatedRepository], format),
      /cannot preserve the custom type, cardinality, or EAD mapping of field repository/i,
    );
  }

  const changedMapping = makeSchema("dacs", "SCHEMA-EAD-MAPPING");
  changedMapping.fields.find((field) => field.id === "title").mappings.ead = "localTitle";
  assert.throws(() => formatArchive(changedMapping, [makeUnit(changedMapping)], "ead4"), /custom type, cardinality, or EAD mapping of field title/i);

  const scalarRepeatable = makeSchema("dacs", "SCHEMA-EAD-SHAPE-REPEATABLE");
  assert.throws(() => formatArchive(scalarRepeatable, [makeUnit(scalarRepeatable, { values: { dates: "1940" } })], "ead4"), /cannot preserve the value cardinality of field dates/i);

  const arrayScalar = makeSchema("dacs", "SCHEMA-EAD-SHAPE-SCALAR");
  assert.throws(() => formatArchive(arrayScalar, [makeUnit(arrayScalar, { values: { title: ["One title"] } })], "ead4"), /cannot preserve the value cardinality of field title/i);
});

test("one-value-per-line editing preserves Enter, semicolons, and validation-significant whitespace", () => {
  assert.deepEqual(parseOneValuePerLine("Series A; Series B\nSeries C"), ["Series A; Series B", "Series C"]);
  assert.deepEqual(parseOneValuePerLine("Alpha\r\n\r\nBeta\rGamma"), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(parseOneValuePerLine(" padded \n\t\nplain"), [" padded ", "\t", "plain"]);
  assert.deepEqual(parseOneValuePerLine(""), []);
  assert.equal(parseOneValuePerLineDraft("Alpha\n").join("\n"), "Alpha\n", "a trailing Enter survives the controlled-input round trip");
  assert.equal(parseOneValuePerLineDraft("Alpha\nBeta").join("\n"), "Alpha\nBeta");
  assert.deepEqual(parseOneValuePerLineDraft(""), [""]);

  const schema = makeSchema("dacs", "SCHEMA-EDITOR-LINES");
  assert.deepEqual(
    normalizeArchiveEditorValues(schema, { title: "Title", creator: ["First; Second", ""], extent: [" 2 boxes ", ""] }),
    { title: "Title", creator: ["First; Second"], extent: [" 2 boxes "] },
    "commit removes only empty draft lines and leaves semicolons and whitespace for canonical validation",
  );

  const multilineVocabulary = structuredClone(schema);
  multilineVocabulary.fields.find((field) => field.id === "subjects").vocabulary = ["Alpha\nBeta"];
  assert.throws(() => validateArchiveSet([multilineVocabulary], []), /vocabulary terms cannot contain line breaks/i);
  assert.throws(
    () => validateArchiveSet([schema], [makeUnit(schema, { values: { creator: ["One creator\nTwo creators"] } })]),
    /values cannot contain line breaks.*one value per line/i,
  );
});

test("every EAD version rejects same-namespace extensions, hidden structure, duplicate descriptions, and foreign attributes", async () => {
  const schema = makeSchema("dacs", "SCHEMA-EAD-STRUCTURE");
  const unit = makeUnit(schema, { id: "UNIT-EAD-STRUCTURE" });
  const settings = {
    ead4: { close: "</archDesc>", title: "unitTitle", description: '<archDesc id="SECOND" level="collection"><identificationData><unitId>SECOND</unitId><unitTitle>Second</unitTitle></identificationData></archDesc>' },
    ead3: { close: "</archdesc>", title: "unittitle", description: '<archdesc id="SECOND" level="collection"><did><unitid>SECOND</unitid><unittitle>Second</unittitle></did></archdesc>' },
    ead2002: { close: "</archdesc>", title: "unittitle", description: '<archdesc id="SECOND" level="collection"><did><unitid>SECOND</unitid><unittitle>Second</unittitle></did></archdesc>' },
  };
  for (const format of ["ead4", "ead3", "ead2002"]) {
    const exported = formatArchive(schema, [unit], format);
    const { close, title, description } = settings[format];
    const variants = [
      exported.replace(close, `<script>ignored</script>${close}`),
      exported.replace(`<${title}>`, `<${title}><script/>`),
      exported.replace("</ead>", `${description}</ead>`),
      exported.replace("<ead ", '<ead xmlns:evil="https://attacker.invalid/" ').replace(`<${title}>`, `<${title} evil:render="html">`),
      exported.replace(`<${title}>`, `<${title} injected="true">`),
    ];
    for (const [index, hostile] of variants.entries()) {
      const review = await reviewArchiveImport(new File([hostile], `${format}-${index}.xml`, { type: "application/xml" }));
      assert.equal(review.blocked, true, `${format}/${index} must fail closed`);
      assert.equal(review.units.length, 0);
      assert.match(review.summary, /unsupported|namespace|description|attribute|inside|mixed/i);
    }
  }
});

test("all EAD versions round-trip the maximum supported 32 component levels", async () => {
  const schema = makeSchema("blank", "SCHEMA-EAD-DEPTH-MAX");
  const units = Array.from({ length: 33 }, (_, index) => makeUnit(schema, {
    id: `UNIT-DEPTH-${String(index).padStart(2, "0")}`,
    parentId: index === 0 ? null : `UNIT-DEPTH-${String(index - 1).padStart(2, "0")}`,
    level: index === 0 ? "collection" : "series",
    referenceCode: `MS-DEPTH-${index}`,
    title: `Depth ${index}`,
  }));
  for (const format of ["ead4", "ead3", "ead2002"]) {
    const exported = formatArchive(schema, units, format);
    const review = await reviewArchiveImport(new File([exported], `${format}-depth.xml`, { type: "application/xml" }));
    assert.equal(review.blocked, false, `${format}: ${review.summary}`);
    assert.equal(review.units.length, 33);
    assert.equal(review.units.at(-1).parentId, "UNIT-DEPTH-31");
  }
});

test("archival export and import enforce one shared 5 MiB ceiling", async () => {
  const schema = makeSchema("blank", "SCHEMA-EXCHANGE-BUDGET");
  schema.fields.push(
    ...Array.from({ length: 3 }, (_, index) => ({
      ...fieldForKind("long-text", index + 1),
      id: `large_${index}`,
      repeatable: true,
      mappings: { ead: `local:large${index}`, archivesSpace: `large_${index}`, atom: `large${index}`, ric: `large${index}` },
    })),
  );
  const enormous = "x".repeat(8192);
  const unit = makeUnit(schema, { values: Object.fromEntries(Array.from({ length: 3 }, (_, index) => [`large_${index}`, Array(250).fill(enormous)])) });
  assert.throws(() => formatArchive(schema, [unit], "schema-package"), /5 MiB|source budget|smaller/i);

  const exactCeiling = await reviewArchiveImport(new File([" ".repeat(5 * 1024 * 1024)], "exact.csv", { type: "text/csv" }));
  assert.doesNotMatch(exactCeiling.summary, /1 byte.5 MiB/i, "exactly 5 MiB reaches format validation");
  const overCeiling = await reviewArchiveImport(new File([" ".repeat(5 * 1024 * 1024 + 1)], "over.csv", { type: "text/csv" }));
  assert.equal(overCeiling.blocked, true);
  assert.match(overCeiling.summary, /1 byte.5 MiB/i);
});

test("EAD export requires exactly one archival root", () => {
  const schema = makeSchema("blank", "SCHEMA-ROOT-1");
  const first = makeUnit(schema, { id: "UNIT-FIRST", referenceCode: "FIRST" });
  const second = makeUnit(schema, { id: "UNIT-SECOND", referenceCode: "SECOND" });
  assert.throws(() => formatArchive(schema, [], "ead4"), /exactly one|one root|requires.*root/i);
  assert.throws(() => formatArchive(schema, [first, second], "ead4"), /exactly one|one root/i);
});

test("AtoM CSV preserves hierarchy identities, reference codes, order, and private defaults", () => {
  const schema = makeSchema("atom", "SCHEMA-ATOM-1");
  const root = makeUnit(schema, {
    id: "UNIT-ROOT",
    referenceCode: "MS-001",
    values: {
      dates: ["1940/1980"],
      creator: ["Jane Doe"],
      subjects: ["=WEBSERVICE(\"https://example.org\")"],
    },
  });
  const child = makeUnit(schema, {
    id: "UNIT-CHILD",
    parentId: root.id,
    level: "file",
    referenceCode: "MS-001-01",
    title: "Folder one",
  });
  const rows = parseCsv(formatArchive(schema, [child, root], "atom-csv"));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].legacyId, root.id, "parents are emitted before children");
  assert.equal(rows[0].parentId, "");
  assert.equal(rows[0].identifier, "MS-001");
  assert.equal(rows[0].publicationStatus, "Draft");
  assert.equal(rows[0].culture, "en");
  assert.equal(rows[0].eventDates, "1940/1980");
  assert.equal(rows[0].eventTypes, "Creation");
  assert.equal(rows[0].eventActors, "Jane Doe");
  assert.equal(rows[1].legacyId, child.id);
  assert.equal(rows[1].parentId, root.id);
  assert.equal(rows[1].identifier, "MS-001-01");
  assert.equal(rows[1].publicationStatus, "Draft");
  assert.notEqual(rows[0].publicationStatus, "Published");
  assert.match(rows[0].subjectAccessPoints, /^'/, "spreadsheet formulas are neutralized");
});

test("ArchivesSpace AO crosswalk is explicit about its resource boundary and private defaults", () => {
  const schema = makeSchema("archives-space", "SCHEMA-ASPACE-1");
  const root = makeUnit(schema, { id: "UNIT-ROOT", referenceCode: "MS-001" });
  const child = makeUnit(schema, {
    id: "UNIT-CHILD",
    parentId: root.id,
    level: "file",
    referenceCode: "MS-001-01",
    title: "Folder one",
  });
  const [labels, rootRow, childRow] = parseCsv(formatArchive(schema, [child, root], "archives-space-csv"));
  assert.equal(labels.res_uri, "Resource URI");
  assert.equal(rootRow.ead, schema.id);
  assert.equal(rootRow.res_uri, "", "the operator must supply an existing ArchivesSpace resource target");
  assert.equal(rootRow.ref_id, root.id);
  assert.equal(rootRow.unit_id, "MS-001");
  assert.equal(rootRow.parent_ref_id, "");
  assert.equal(rootRow.hierarchy, "1");
  assert.equal(rootRow.publish, "false");
  assert.equal(rootRow.langcode, "en");
  assert.equal(childRow.ref_id, child.id);
  assert.equal(childRow.parent_ref_id, root.id);
  assert.equal(childRow.unit_id, "MS-001-01");
  assert.equal(childRow.hierarchy, "2");
  assert.equal(childRow.publish, "false");
});

test("AtoM and ArchivesSpace own-export CSV round-trips every mapped core value without formula or list loss", async () => {
  const schema = makeSchema("dacs", "SCHEMA-CSV-ROUNDTRIP");
  const values = {
    reference_code: "MS-CSV-1",
    title: "-Quarterly technology files",
    dates: ["1940/1980", "2000"],
    creator: ["Alpha | Beta", "Path \\ authority"],
    extent: ["2 boxes", "1.5 GiB"],
    scope_content: '=HYPERLINK("https://attacker.invalid","scope")',
    arrangement: "Series A | Series B",
    access_conditions: "Closed \\ pending review",
    use_conditions: "Contact the repository",
    language: ["en", "fr"],
    repository: "@Example Archives",
    subjects: ["=WEBSERVICE(\"https://attacker.invalid\")", "'=literal apostrophe", "Pipes | and \\ slashes"],
    related_material: ["MS|002", "MS\\003"],
    digital_object_uri: ["https://archives.example.org/object/1", "https://archives.example.org/object/2"],
    note: ["First | note", "Second \\ note"],
  };
  const root = makeUnit(schema, { id: "UNIT-CSV-ROOT", level: "repository", values, published: true, language: "en-US" });
  const child = makeUnit(schema, { id: "UNIT-CSV-CHILD", parentId: root.id, level: "collection", referenceCode: "MS-CSV-1-A", title: "Private child", published: false, language: "fr" });

  for (const format of ["atom-csv", "archives-space-csv"]) {
    const exported = formatArchive(schema, [child, root], format);
    assert.match(exported, /'=HYPERLINK/, `${format} neutralizes an executable scalar cell`);
    assert.match(exported, /'=WEBSERVICE/, `${format} neutralizes an executable repeated-value cell`);
    const review = await reviewArchiveImport(new File([exported], `${format}.csv`, { type: "text/csv" }));
    assert.equal(review.blocked, false, `${format}: ${review.summary}`);
    assert.equal(review.units.length, 2);
    const importedRoot = review.units.find((unit) => unit.id === root.id);
    const importedChild = review.units.find((unit) => unit.id === child.id);
    assert.ok(importedRoot);
    assert.ok(importedChild);
    assert.deepEqual({ ...importedRoot.values }, values, `${format} restores every mapped core value exactly`);
    assert.equal(importedRoot.level, "repository");
    assert.equal(importedRoot.published, true);
    assert.equal(importedRoot.language, "en-US");
    assert.equal(importedChild.parentId, root.id);
    assert.equal(importedChild.published, false);
    assert.equal(importedChild.language, "fr");
  }
});

test("CSV import cannot silently discard a label-like row or coerce unknown publication states", async () => {
  const schema = makeSchema("archives-space", "SCHEMA-CSV-FAIL-CLOSED");
  const unit = makeUnit(schema);
  const exported = formatArchive(schema, [unit], "archives-space-csv");
  const rows = exported.split("\n");
  rows[1] = rows[1].replace("Resource URI", "Not the generated label row");
  const disguised = await reviewArchiveImport(new File([rows.join("\n")], "labels.csv", { type: "text/csv" }));
  assert.equal(disguised.blocked, true);
  assert.match(disguised.summary, /invalid|missing record ID|row/i);

  const atomSchema = makeSchema("atom", "SCHEMA-ATOM-STATUS");
  const atomUnit = makeUnit(atomSchema);
  const atom = formatArchive(atomSchema, [atomUnit], "atom-csv");
  const badStatus = atom.replace(/Draft/, "Unreviewed");
  const statusReview = await reviewArchiveImport(new File([badStatus], "status.csv", { type: "text/csv" }));
  assert.equal(statusReview.blocked, true);
  assert.match(statusReview.summary, /publication status/i);
});

test("EAD 4 import keeps root and child evidence separate and reads digital form URIs", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <ead xmlns="https://standards.openpreservation.org/ead/v4">
      <control>
        <recordId>FINDING-AID-1</recordId>
        <maintenanceAgency><agencyCode>US-EX</agencyCode><agencyName>Example Archives</agencyName></maintenanceAgency>
        <maintenanceHistory>
          <maintenanceEvent>
            <agent><label>Example Archives</label></agent>
            <eventDateTime standardDateTime="2026-08-20">20 August 2026</eventDateTime>
          </maintenanceEvent>
        </maintenanceHistory>
      </control>
      <archDesc id="UNIT-ROOT" level="collection">
        <identificationData>
          <unitId>MS-001</unitId><unitTitle>Root collection</unitTitle>
          <unitDate><textualDate>1940/1980</textualDate></unitDate>
        </identificationData>
        <scopeContent><p>Root scope only</p></scopeContent>
        <subjectHeadings><subject><term>Root subject</term></subject></subjectHeadings>
        <formsAvailable><formAvailable valueURI="https://archives.example.org/root"><label>Root scan</label></formAvailable></formsAvailable>
        <descriptionOfComponents>
          <c id="UNIT-CHILD" level="file">
            <identificationData>
              <unitId>MS-001-01</unitId><unitTitle>Child file</unitTitle>
              <unitDate><textualDate>1960</textualDate></unitDate>
            </identificationData>
            <scopeContent><p>Child scope only</p></scopeContent>
            <subjectHeadings><subject><term>Child subject</term></subject></subjectHeadings>
            <formsAvailable><formAvailable valueURI="https://archives.example.org/child"><label>Child scan</label></formAvailable></formsAvailable>
          </c>
        </descriptionOfComponents>
      </archDesc>
    </ead>`;
  const review = await reviewArchiveImport(new File([xml], "description.ead.xml", { type: "application/xml" }));
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.format, "ead4");
  assert.equal(review.units.length, 2);
  const root = review.units.find((unit) => unit.values.reference_code === "MS-001");
  const child = review.units.find((unit) => unit.values.reference_code === "MS-001-01");
  assert.ok(root);
  assert.ok(child);
  assert.equal(root.parentId, null);
  assert.equal(child.parentId, root.id);
  assert.equal(root.values.scope_content, "Root scope only");
  assert.equal(child.values.scope_content, "Child scope only");
  assert.doesNotMatch(String(root.values.scope_content), /Child scope/);
  assert.deepEqual(list(root.values.dates), ["1940/1980"]);
  assert.deepEqual(list(child.values.dates), ["1960"]);
  assert.deepEqual(list(root.values.subjects), ["Root subject"]);
  assert.deepEqual(list(child.values.subjects), ["Child subject"]);
  assert.deepEqual(list(root.values.digital_object_uri), ["https://archives.example.org/root"]);
  assert.deepEqual(list(child.values.digital_object_uri), ["https://archives.example.org/child"]);
  assert.equal(root.published, false);
  assert.equal(root.language, "en");
});

test("EAD repository identity rejects duplicate, missing, and conflicting scalar structures", async () => {
  const cases = [
    {
      name: "duplicate-repository.ead4.xml",
      xml: `<ead xmlns="https://standards.openpreservation.org/ead/v4"><archDesc level="collection"><identificationData><unitId>MS-EAD4-REPO</unitId><unitTitle>EAD4 repository</unitTitle><otherIdentificationData localType="in-keeping:repository">Repository A</otherIdentificationData><otherIdentificationData localType="in-keeping:repository">Repository B</otherIdentificationData></identificationData></archDesc></ead>`,
    },
    {
      name: "duplicate-repository.ead3.xml",
      xml: `<ead xmlns="http://ead3.archivists.org/schema/"><archdesc level="collection"><did><unitid>MS-EAD3-REPO</unitid><unittitle>EAD3 repository</unittitle><repository><corpname><part>Repository A</part></corpname></repository><repository><corpname><part>Repository A</part></corpname></repository></did></archdesc></ead>`,
    },
    {
      name: "duplicate-repository.ead.xml",
      xml: `<ead xmlns="urn:isbn:1-931666-22-9"><archdesc level="collection"><did><unitid>MS-EAD2002-REPO</unitid><unittitle>EAD 2002 repository</unittitle><repository><corpname>Repository A</corpname></repository><repository><corpname>Repository B</corpname></repository></did></archdesc></ead>`,
    },
    {
      name: "conflicting-repository-carriers.ead3.xml",
      xml: `<ead xmlns="http://ead3.archivists.org/schema/"><archdesc level="collection"><did><unitid>MS-EAD3-CARRIERS</unitid><unittitle>EAD3 repository carriers</unittitle><repository><corpname><part>Repository A</part></corpname><name><part>Repository B</part></name></repository></did></archdesc></ead>`,
    },
    {
      name: "missing-repository-carrier.ead.xml",
      xml: `<ead xmlns="urn:isbn:1-931666-22-9"><archdesc level="collection"><did><unitid>MS-EAD2002-EMPTY</unitid><unittitle>EAD 2002 empty repository</unittitle><repository/></did></archdesc></ead>`,
    },
  ];

  for (const fixture of cases) {
    const review = await reviewArchiveImport(new File([fixture.xml], fixture.name, { type: "application/xml" }));
    assert.equal(review.blocked, true, `${fixture.name}: ${review.summary}`);
    assert.match(review.summary, /repository/i, fixture.name);
    assert.equal(review.units.length, 0, fixture.name);
  }
});

test("EAD document and maintenance-agency identities are singular, nonempty, and retained", async () => {
  const fixtures = [
    {
      name: "document-id.ead4.xml",
      id: "EAD4-DOCUMENT",
      identity: "<recordId>EAD4-DOCUMENT</recordId>",
      xml: `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-DOCUMENT</recordId><maintenanceAgency><agencyName>Example Archives</agencyName></maintenanceAgency></control><archDesc level="collection"><identificationData><unitId>MS-EAD4-DOC</unitId><unitTitle>EAD4 document identity</unitTitle></identificationData></archDesc></ead>`,
    },
    {
      name: "document-id.ead3.xml",
      id: "EAD3-DOCUMENT",
      identity: "<recordid>EAD3-DOCUMENT</recordid>",
      xml: `<ead xmlns="http://ead3.archivists.org/schema/"><control><recordid>EAD3-DOCUMENT</recordid><maintenanceagency><agencyname>Example Archives</agencyname></maintenanceagency></control><archdesc level="collection"><did><unitid>MS-EAD3-DOC</unitid><unittitle>EAD3 document identity</unittitle></did></archdesc></ead>`,
    },
    {
      name: "document-id.ead.xml",
      id: "EAD2002-DOCUMENT",
      identity: "<eadid>EAD2002-DOCUMENT</eadid>",
      xml: `<ead xmlns="urn:isbn:1-931666-22-9"><eadheader><eadid>EAD2002-DOCUMENT</eadid></eadheader><archdesc level="collection"><did><unitid>MS-EAD2002-DOC</unitid><unittitle>EAD 2002 document identity</unittitle></did></archdesc></ead>`,
    },
  ];

  for (const fixture of fixtures) {
    const accepted = await reviewArchiveImport(new File([fixture.xml], fixture.name, { type: "application/xml" }));
    assert.equal(accepted.blocked, false, `${fixture.name}: ${accepted.summary}`);
    assert.equal(accepted.schema.id, fixture.id, `${fixture.name} retains its document identity as the imported schema ID`);

    for (const hostile of [
      fixture.xml.replace(fixture.identity, `${fixture.identity}${fixture.identity.replace(fixture.id, `${fixture.id}-OTHER`)}`),
      fixture.xml.replace(fixture.identity, fixture.identity.replace(fixture.id, "   ")),
      fixture.xml.replace(fixture.identity, ""),
      fixture.xml.replace(fixture.identity, fixture.identity.replace(fixture.id, "https://example.org/unsafe")),
      ...["\u200b", "\u2060", "\u200e"].map((control) => fixture.xml.replace(fixture.identity, fixture.identity.replace(fixture.id, control))),
    ]) {
      const review = await reviewArchiveImport(new File([hostile], `hostile-${fixture.name}`, { type: "application/xml" }));
      assert.equal(review.blocked, true, `${fixture.name}: ${review.summary}`);
      assert.match(review.summary, /document identity|recordId|recordid|eadid|safe local identifier/i, fixture.name);
      assert.equal(review.units.length, 0, fixture.name);
    }
  }

  const maintenanceCases = [
    `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-AGENCY-DUP</recordId><maintenanceAgency><agencyName>One</agencyName></maintenanceAgency><maintenanceAgency><agencyName>Two</agencyName></maintenanceAgency></control><archDesc level="collection"><identificationData><unitId>MS-1</unitId><unitTitle>Agency</unitTitle></identificationData></archDesc></ead>`,
    `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-AGENCY-NAME</recordId><maintenanceAgency><agencyName>One</agencyName><agencyName>Two</agencyName></maintenanceAgency></control><archDesc level="collection"><identificationData><unitId>MS-1</unitId><unitTitle>Agency</unitTitle></identificationData></archDesc></ead>`,
    `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-AGENCY-EMPTY</recordId><maintenanceAgency/></control><archDesc level="collection"><identificationData><unitId>MS-1</unitId><unitTitle>Agency</unitTitle></identificationData></archDesc></ead>`,
    `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-AGENCY-FORMAT</recordId><maintenanceAgency><agencyName>\u200b</agencyName></maintenanceAgency></control><archDesc level="collection"><identificationData><unitId>MS-1</unitId><unitTitle>Agency</unitTitle></identificationData></archDesc></ead>`,
    `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-AGENCY-CODE</recordId><maintenanceAgency><agencyCode>US\u2060EX</agencyCode></maintenanceAgency></control><archDesc level="collection"><identificationData><unitId>MS-1</unitId><unitTitle>Agency</unitTitle></identificationData></archDesc></ead>`,
    `<ead xmlns="http://ead3.archivists.org/schema/"><control><recordid>EAD3-AGENCY-DUP</recordid><maintenanceagency><agencyname>One</agencyname></maintenanceagency><maintenanceagency><agencyname>Two</agencyname></maintenanceagency></control><archdesc level="collection"><did><unitid>MS-1</unitid><unittitle>Agency</unittitle></did></archdesc></ead>`,
    `<ead xmlns="http://ead3.archivists.org/schema/"><control><recordid>EAD3-AGENCY-EMPTY</recordid><maintenanceagency><agencyname> </agencyname></maintenanceagency></control><archdesc level="collection"><did><unitid>MS-1</unitid><unittitle>Agency</unittitle></did></archdesc></ead>`,
    `<ead xmlns="http://ead3.archivists.org/schema/"><control><recordid>EAD3-AGENCY-FORMAT</recordid><maintenanceagency><agencyname>Archive\u200eName</agencyname></maintenanceagency></control><archdesc level="collection"><did><unitid>MS-1</unitid><unittitle>Agency</unittitle></did></archdesc></ead>`,
  ];
  for (const [index, xml] of maintenanceCases.entries()) {
    const review = await reviewArchiveImport(new File([xml], `maintenance-${index}.xml`, { type: "application/xml" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.summary, /maintenance.*agency/i);
    assert.equal(review.units.length, 0);
  }

  const unicodeAgency = `<ead xmlns="https://standards.openpreservation.org/ead/v4"><control><recordId>EAD4-UNICODE-AGENCY</recordId><maintenanceAgency><agencyName>مكتبة الجامعة</agencyName></maintenanceAgency></control><archDesc level="collection"><identificationData><unitId>MS-UNICODE</unitId><unitTitle>Unicode agency</unitTitle></identificationData></archDesc></ead>`;
  const unicodeReview = await reviewArchiveImport(new File([unicodeAgency], "unicode-agency.ead4.xml", { type: "application/xml" }));
  assert.equal(unicodeReview.blocked, false, unicodeReview.summary);
  assert.equal(unicodeReview.schema.id, "EAD4-UNICODE-AGENCY");
});

test("EAD3 canonical repository identity keeps repeated name parts and unrelated repeatable fields", async () => {
  const xml = `<ead xmlns="http://ead3.archivists.org/schema/"><archdesc level="collection"><did><unitid>MS-EAD3-PARTS</unitid><unittitle>EAD3 repeated fields</unittitle><unitdate>1900/1910</unitdate><unitdate>1920/1930</unitdate><origination><corpname><part>Creator A</part></corpname></origination><origination><corpname><part>Creator B</part></corpname></origination><repository><corpname><part>University of Example</part><part>Library</part><part>Special Collections</part></corpname></repository></did><relatedmaterial><p>Guide A</p></relatedmaterial><relatedmaterial><p>Guide B</p></relatedmaterial></archdesc></ead>`;
  const review = await reviewArchiveImport(new File([xml], "repository-parts.ead3.xml", { type: "application/xml" }));

  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.units.length, 1);
  assert.equal(review.units[0].values.repository, "University of Example Library Special Collections");
  assert.deepEqual(list(review.units[0].values.dates), ["1900/1910", "1920/1930"]);
  assert.equal(list(review.units[0].values.creator).length, 2);
  assert.deepEqual(list(review.units[0].values.related_material), ["Guide A", "Guide B"]);
});

test("EAD imports that contain no archival description fail closed", async () => {
  const empty = `<?xml version="1.0"?>
    <ead xmlns="https://standards.openpreservation.org/ead/v4">
      <control>
        <recordId>EMPTY-1</recordId>
        <maintenanceAgency><agencyName>Example Archives</agencyName></maintenanceAgency>
        <maintenanceHistory/>
      </control>
    </ead>`;
  const review = await reviewArchiveImport(new File([empty], "empty.ead.xml", { type: "application/xml" }));
  assert.equal(review.blocked, true);
  assert.match(review.summary, /no archival|no description|no record|zero|at least one/i);
  assert.equal(review.units.length, 0);
});

test("EAD import requires an official root namespace and rejects foreign lookalikes", async () => {
  const noNamespace = `<ead><archdesc id="ROOT" level="collection"><did><unitid>MS-1</unitid><unittitle>Unqualified</unittitle></did></archdesc></ead>`;
  const unqualified = await reviewArchiveImport(new File([noNamespace], "unqualified.ead.xml", { type: "application/xml" }));
  assert.equal(unqualified.blocked, true);
  assert.match(unqualified.summary, /official namespace/i);

  const confused = `<ead xmlns="http://ead3.archivists.org/schema/" xmlns:evil="https://attacker.invalid/"><archdesc id="REAL" level="collection"><did><unitid>MS-REAL</unitid><unittitle>Real title</unittitle></did></archdesc><evil:archdesc id="ROOT" level="collection"><evil:did><evil:unittitle>Forged</evil:unittitle></evil:did></evil:archdesc></ead>`;
  const mixed = await reviewArchiveImport(new File([confused], "mixed.ead.xml", { type: "application/xml" }));
  assert.equal(mixed.blocked, true);
  assert.match(mixed.summary, /namespace.*not accepted/i);
  assert.equal(mixed.units.length, 0);
});

test("archival revisions retain a valid 20-version chain and reject content tampering", async () => {
  let workspace = await createBlankWorkspace("Revision test");
  const schema = makeSchema("blank", "SCHEMA-REVISION-1");
  workspace = await upsertArchiveSchema(workspace, schema);
  const unit = makeUnit(schema, { id: "UNIT-REVISION", referenceCode: "REV-1" });
  for (let index = 0; index < 24; index += 1) {
    workspace = await upsertArchiveUnit(workspace, {
      ...unit,
      values: { ...unit.values, title: `Revision ${index + 1}` },
      updatedAt: new Date(Date.parse(AT) + index * 1000).toISOString(),
    });
  }

  assert.equal(workspace.revisions.length, 20);
  assert.equal(workspace.revisions[0].parentId, null);
  assert.equal(await verifyAudit(workspace), true);
  const restored = await validateWorkspaceSnapshot(workspace);
  assert.equal(activeRevision(restored).archiveUnits[0].values.title, "Revision 24");

  const previousRevision = workspace.revisions.at(-2);
  const rolledBack = await rollbackTo(workspace, previousRevision.id);
  assert.equal(activeRevision(rolledBack).archiveUnits[0].values.title, "Revision 23");
  assert.equal(rolledBack.audit.at(-1).outcome, "rolled-back");

  const tampered = structuredClone(rolledBack);
  const current = tampered.revisions.find((revision) => revision.id === tampered.activeRevisionId);
  current.archiveUnits[0].values.title = "Tampered after save";
  await assert.rejects(validateWorkspaceSnapshot(tampered), /digest|stored state|content/i);
});
