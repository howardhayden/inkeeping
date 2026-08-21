import assert from "node:assert/strict";
import test from "node:test";
import {
  SERVICE_AREAS,
  SERVICE_DATA_FORMAT_RULES,
  SERVICE_FIELD_KINDS,
  SERVICE_RECORD_DEFINITIONS,
  formatServiceRegister,
  makeServiceRecord,
  validateServiceRecords,
} from "../app/service-register.ts";

const AT = "2026-08-20T12:00:00.000Z";

function valueFor(field) {
  const value = field.kind === "integer" ? 12
    : field.kind === "decimal" ? 12.5
      : field.kind === "boolean" ? true
        : field.kind === "date" ? "2026-08-20"
          : field.kind === "date-time" ? AT
            : field.kind === "identifier" ? "LOCAL-001"
              : field.kind === "uri" ? "https://library.example.org/record/1"
                : field.kind === "controlled-term" ? field.vocabulary[0]
                  : field.kind === "checksum" ? `sha256:${"a".repeat(64)}`
                    : field.kind === "media-type" ? "application/pdf"
                      : field.kind === "long-text" ? "A bounded operational statement."
                        : "Recorded value";
  return field.repeatable ? [value] : value;
}

function completeRecord(definition, index) {
  const record = makeServiceRecord(definition.kind, `SERVICE-${String(index + 1).padStart(2, "0")}`, AT);
  record.title = definition.label;
  record.ownerRole = "Systems Librarian";
  record.system = "Institutional workflow";
  record.state = "active";
  record.values = Object.fromEntries(definition.fields.map((field) => [field.id, valueFor(field)]));
  return record;
}

test("every service area, record type, and field type has an explicit validated representation", () => {
  const records = SERVICE_RECORD_DEFINITIONS.map(completeRecord);
  validateServiceRecords(records);
  assert.equal(SERVICE_AREAS.length, 8);
  assert.equal(SERVICE_RECORD_DEFINITIONS.length, 16);
  assert.deepEqual(new Set(SERVICE_RECORD_DEFINITIONS.map((definition) => definition.area)), new Set(SERVICE_AREAS.map((area) => area.id)));
  assert.deepEqual(new Set(SERVICE_DATA_FORMAT_RULES.map((rule) => rule.kind)), new Set(SERVICE_FIELD_KINDS));
  assert.deepEqual(new Set(SERVICE_RECORD_DEFINITIONS.flatMap((definition) => definition.fields.map((field) => field.kind))), new Set(SERVICE_FIELD_KINDS));
});

test("service JSON and long-form CSV preserve typed records without spreadsheet execution", () => {
  const records = SERVICE_RECORD_DEFINITIONS.map(completeRecord);
  records[0].title = '=HYPERLINK("https://example.org")';
  const json = JSON.parse(formatServiceRegister(records, "service-json", AT));
  assert.equal(json.schema, "in-keeping/service-register");
  assert.equal(json.version, 1);
  assert.deepEqual(json.records, records);
  const csv = formatServiceRegister(records, "service-csv", AT);
  assert.match(csv, /record_id,area,record_type/);
  assert.match(csv, /'=HYPERLINK/);
  assert.doesNotMatch(csv, /undefined|\[object Object\]/);
});

test("service validation rejects hostile URLs, invalid dates, controls, and numeric overflow", () => {
  const entitlement = completeRecord(SERVICE_RECORD_DEFINITIONS.find((definition) => definition.kind === "resource-entitlement"), 0);
  entitlement.values.license_uri = "https://127.0.0.1/private";
  assert.throws(() => validateServiceRecords([entitlement]), /private, reserved, or non-routable IPv4/i);

  const condition = completeRecord(SERVICE_RECORD_DEFINITIONS.find((definition) => definition.kind === "condition-assessment"), 1);
  condition.values.assessed_on = "2026-02-30";
  assert.throws(() => validateServiceRecords([condition]), /real calendar date/i);

  const fund = completeRecord(SERVICE_RECORD_DEFINITIONS.find((definition) => definition.kind === "collection-fund"), 2);
  fund.values.allocation = 1_000_000_000_001;
  assert.throws(() => validateServiceRecords([fund]), /bounded finite decimal/i);

  const policy = completeRecord(SERVICE_RECORD_DEFINITIONS.find((definition) => definition.kind === "collection-policy"), 3);
  policy.title = "Unsafe\u0000title";
  assert.throws(() => validateServiceRecords([policy]), /control characters/i);

  const impossibleTime = completeRecord(SERVICE_RECORD_DEFINITIONS[0], 4);
  impossibleTime.updatedAt = "2026-02-30T00:00:00.000Z";
  assert.throws(() => validateServiceRecords([impossibleTime]), /ISO 8601 UTC instant/i);
});

test("service records require canonical NFC text and reject whitespace-only required values", () => {
  const record = completeRecord(SERVICE_RECORD_DEFINITIONS.find((definition) => definition.kind === "collection-policy"), 0);

  const paddedTitle = structuredClone(record);
  paddedTitle.title = " Padded title ";
  assert.throws(() => validateServiceRecords([paddedTitle]), /without surrounding whitespace/i);

  const decomposedValue = structuredClone(record);
  decomposedValue.values.scope = "Cafe\u0301 collections";
  assert.throws(() => validateServiceRecords([decomposedValue]), /NFC Unicode/i);

  const whitespaceRequired = structuredClone(record);
  whitespaceRequired.values.scope = "   ";
  assert.throws(() => validateServiceRecords([whitespaceRequired]), /required value is blank|without surrounding whitespace/i);
});

test("service validation rejects unknown fields, wrong areas, and duplicate identifiers", () => {
  const first = completeRecord(SERVICE_RECORD_DEFINITIONS[0], 0);
  const unknown = structuredClone(first);
  unknown.values.__unexpected = "value";
  assert.throws(() => validateServiceRecords([unknown]), /Unknown service field/);

  const wrongArea = structuredClone(first);
  wrongArea.area = "discovery";
  assert.throws(() => validateServiceRecords([wrongArea]), /area does not match/i);

  assert.throws(() => validateServiceRecords([first, structuredClone(first)]), /unique/i);
});
