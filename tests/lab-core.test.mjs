import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import {
  activeRevision,
  assessActiveEvidence,
  applyImport,
  CATALOG_PACKET_SCHEMA,
  checkRecords,
  createBlankWorkspace,
  createIncidentFromFinding,
  createFixtureWorkspace,
  exportPacket,
  applyArchiveImport,
  makeOperationalDocument,
  MAX_AUDIT_EVENTS,
  prepareLocalWorkspace,
  recordEvidenceDisposition,
  recordWorkspaceAction,
  reviewImport,
  rollbackTo,
  updateIncident,
  upsertServiceRecord,
  updateConfig,
  updateCatalogRecord,
  upsertArchiveSchema,
  validateWorkspaceSnapshot,
  verifyAudit,
} from "../app/lab-core.ts";
import { canonicalDigest as canonicalEvidenceDigest } from "../app/evidence-authority.ts";
import { formatArchive, makeArchiveSchema, reviewArchiveImport } from "../app/archival-schemas.ts";
import { EXCHANGE_FORMATS, RECORD_FORMATS, formatRecords } from "../app/record-formats.ts";
import { makeServiceRecord } from "../app/service-register.ts";
import { MAX_XML_ATTRIBUTES_PER_ELEMENT, MAX_XML_DEPTH, MAX_XML_ELEMENTS, assertSafeXmlText } from "../app/xml-safety.ts";

globalThis.DOMParser = DOMParser;

const evidenceDisposition = (overrides = {}) => ({
  decision: "admit-unverified",
  claimedOrigin: "direct-export",
  custodyNote: "Selected directly from the claimed source system for review.",
  actorRoleClaim: "Metadata continuity reviewer",
  rationale: "Admit only as unverified working evidence pending external reconciliation.",
  policyReference: "TEST-POLICY-001",
  atBrowser: "2026-08-31T00:00:00.000Z",
  timeBasis: "browser-clock-untrusted",
  ...overrides,
});

test("fixture workspace exposes deterministic operational findings", async () => {
  const workspace = await createFixtureWorkspace();
  const findings = checkRecords(activeRevision(workspace).records);
  const codes = new Set(findings.map((finding) => finding.code));
  assert.equal(activeRevision(workspace).records.length, 6);
  assert.equal(activeRevision(workspace).serviceRecords.length, 8);
  assert.ok(codes.has("FORMAT_CONFLICT"));
  assert.ok(codes.has("REQUEST_MISMATCH"));
  assert.ok(codes.has("SUPPRESSION_LEAK"));
  assert.ok(codes.has("IDENTIFIER_DUPLICATE"));
  assert.equal(await verifyAudit(workspace), true);
});

test("configuration changes are revisioned and rollback preserves history", async () => {
  const baseline = await createFixtureWorkspace();
  const baselineId = baseline.activeRevisionId;
  const changed = await updateConfig(baseline, {
    resolverBase: "https://resolver.example.org/openurl",
    proxyPrefix: "https://proxy.example.org/login?url=",
    defaultPickupLocation: "Annex",
    memberCode: "ALD",
  });
  assert.notEqual(changed.activeRevisionId, baselineId);
  const restored = await rollbackTo(changed, baselineId);
  assert.equal(activeRevision(restored).config.defaultPickupLocation, "Main Library");
  assert.equal(restored.audit.at(-1).outcome, "rolled-back");
  assert.equal(await verifyAudit(restored), true);
});

test("catalog corrections are validated, revisioned, and reversible", async () => {
  const baseline = await createFixtureWorkspace();
  const record = activeRevision(baseline).records[0];
  const corrected = await updateCatalogRecord(baseline, record.id, { title: "Corrected title", creators: record.creators, contributors: [], format: "Dataset", availability: "Online", edition: record.edition, location: "Online", requestable: false, publicVisible: true, suppressed: false, links: ["https://example.org/corrected"] });
  assert.equal(activeRevision(corrected).records[0].title, "Corrected title");
  assert.equal(activeRevision(corrected).records[0].format, "Dataset");
  assert.equal(corrected.audit.at(-1).action, "Correct catalog record");
  const restored = await rollbackTo(corrected, baseline.activeRevisionId);
  assert.equal(activeRevision(restored).records[0].title, record.title);
  await assert.rejects(updateCatalogRecord(baseline, record.id, { title: record.title, creators: [], contributors: [], format: "Book", availability: "Online", edition: "", location: "Online", requestable: false, publicVisible: true, suppressed: false, links: ["https://localhost/private"] }), /Access URL/i);
});

test("unsafe configuration URLs are rejected", async () => {
  const workspace = await createBlankWorkspace();
  await assert.rejects(
    updateConfig(workspace, {
      resolverBase: "http://127.0.0.1/admin",
      proxyPrefix: "",
      defaultPickupLocation: "Main",
      memberCode: "ABC",
    }),
    /Only HTTPS|Private or local/,
  );
});

test("valid versioned JSON is reviewed then applied atomically", async () => {
  const packet = {
    schema: CATALOG_PACKET_SCHEMA,
    version: 1,
    kind: "catalog-batch",
    provenance: { label: "Unit test" },
    records: [
      {
        id: "BIB-TEST-1",
        title: "Test record",
        creators: ["Cataloger"],
        year: "2026",
        format: "Book",
        identifiers: [{ scheme: "local", value: "TEST-1" }],
        links: [],
        availability: "Check availability",
        edition: "",
        location: "Main",
        suppressed: false,
        publicVisible: true,
        requestable: true,
      },
    ],
  };
  const file = new File([JSON.stringify(packet)], "batch.in-keeping.json", { type: "application/json" });
  const review = await reviewImport(file);
  assert.equal(review.blocked, false);
  assert.equal(review.records.length, 1);
  const blank = await createBlankWorkspace();
  const applied = await applyImport(blank, review, evidenceDisposition());
  assert.equal(activeRevision(applied).records.length, 1);
  assert.notEqual(applied.activeRevisionId, blank.activeRevisionId);
  const exported = JSON.parse(exportPacket(applied));
  assert.equal(exported.schema, CATALOG_PACKET_SCHEMA);
  assert.equal(exported.records[0].source, undefined);
  assert.match(applied.audit.at(-1).target, new RegExp(`^evidence:[a-f0-9]{64} · source:${review.digest}$`));
  assert.equal(applied.evidenceAuthority.length, 1);
  assert.equal(applied.evidenceAuthority[0].disposition.decision, "admit-unverified");
  assert.equal(applied.evidenceApplications.length, 1);
  assert.equal(applied.evidenceApplications[0].outcome, "applied");
  assert.equal(applied.evidenceApplications[0].resultingRevisionId, applied.activeRevisionId);
});

test("catalog apply revalidates quarantined provenance", async () => {
  const packet = {
    schema: CATALOG_PACKET_SCHEMA, version: 1, kind: "catalog-batch", provenance: { label: "Quarantine" },
    records: [{ id: "BIB-PROV-1", title: "Provenance", creators: [], year: "2026", format: "Book", identifiers: [], links: [], availability: "Check availability", edition: "", location: "", suppressed: false, publicVisible: true, requestable: false }],
  };
  const review = await reviewImport(new File([JSON.stringify(packet)], "provenance.in-keeping.json", { type: "application/json" }));
  assert.equal(review.blocked, false);
  const forged = structuredClone(review);
  forged.digest = "0".repeat(64);
  forged.format = "csv";
  forged.filename = "forged.csv";
  forged.records[0].title = "Substituted after review";
  forged.records[0].source.digest = forged.digest;
  forged.records[0].source.format = forged.format;
  forged.records[0].source.label = forged.filename;
  const blank = await createBlankWorkspace();
  const rejected = await applyImport(blank, forged, evidenceDisposition());
  assert.equal(rejected.activeRevisionId, blank.activeRevisionId);
  assert.equal(rejected.audit.at(-1).action, "Reject import");
  assert.equal(rejected.audit.at(-1).outcome, "rejected");
});

test("structurally valid evidence requires an explicit disposition and never becomes locally authoritative", async () => {
  const fabricatedPacket = {
    schema: CATALOG_PACKET_SCHEMA, version: 1, kind: "catalog-batch", provenance: { label: "Fabricated but valid" },
    records: [{ id: "FABRICATED-1", title: "Invented evidence", creators: ["Unknown claimant"], year: "2026", format: "Book", identifiers: [], links: [], availability: "Check availability", edition: "", location: "", suppressed: false, publicVisible: true, requestable: false }],
  };
  const review = await reviewImport(new File([JSON.stringify(fabricatedPacket)], "fabricated.in-keeping.json", { type: "application/json" }));
  assert.equal(review.blocked, false);
  const blank = await createBlankWorkspace("Evidence admission");

  await assert.rejects(applyImport(blank, review), /disposition.*plain object|no decision defaults/i);
  await assert.rejects(applyImport(blank, review, { ...evidenceDisposition(), verified: true }), /Unknown evidence disposition field: verified/i);

  const rejected = await applyImport(blank, review, evidenceDisposition({ decision: "reject", rationale: "Origin claim could not be reconciled." }));
  assert.equal(activeRevision(rejected).records.length, 0);
  assert.equal(rejected.evidenceAuthority.at(-1).disposition.decision, "reject");
  assert.equal(rejected.evidenceApplications.at(-1).outcome, "not-applied");

  const admitted = await applyImport(blank, review, evidenceDisposition());
  assert.equal(activeRevision(admitted).records.length, 1);
  assert.equal(admitted.evidenceAuthority.at(-1).disposition.decision, "admit-unverified");
  assert.equal(admitted.evidenceApplications.at(-1).outcome, "applied");
  assert.equal("authoritative" in admitted.evidenceAuthority.at(-1), false);
  await assert.doesNotReject(validateWorkspaceSnapshot(admitted));
});

test("destination rejection retains the exact evidence decision and a linked non-application outcome", async () => {
  const blank = await createBlankWorkspace("Destination conflict decisions");
  const firstReview = await reviewImport(new File(["id,title\nSAME-1,First source"], "first.csv", { type: "text/csv" }));
  const first = await applyImport(blank, firstReview, evidenceDisposition());
  const secondReview = await reviewImport(new File(["id,title\nSAME-1,Contradictory source"], "second.csv", { type: "text/csv" }));
  const conflicted = await applyImport(first, secondReview, evidenceDisposition({ atBrowser: "2026-08-31T00:01:00.000Z" }));

  assert.equal(conflicted.activeRevisionId, first.activeRevisionId);
  assert.equal(conflicted.evidenceAuthority.length, 2);
  assert.equal(conflicted.evidenceAuthority.at(-1).evidence.source.filename, "second.csv");
  assert.equal(conflicted.evidenceApplications.length, 2);
  assert.equal(conflicted.evidenceApplications.at(-1).outcome, "not-applied");
  assert.equal(conflicted.evidenceApplications.at(-1).reason, "destination-identity-conflict");
  assert.equal(conflicted.evidenceApplications.at(-1).decisionRecordSha256, conflicted.evidenceAuthority.at(-1).recordSha256);
  assert.equal(conflicted.audit.at(-1).action, "Reject conflicting import");
  await assert.doesNotReject(validateWorkspaceSnapshot(conflicted));
});

test("application outcomes cannot contradict their source kind or target a nonexistent current revision", async () => {
  const blank = await createBlankWorkspace("Application linkage attacks");
  const review = await reviewImport(new File(["id,title\nBOUND-1,Bound source"], "bound.csv", { type: "text/csv" }));
  const applied = await applyImport(blank, review, evidenceDisposition());
  const contradicted = structuredClone(applied);
  const application = contradicted.evidenceApplications.at(-1);
  application.reason = "workspace-backup-opened";
  const unsignedApplication = structuredClone(application);
  delete unsignedApplication.recordSha256;
  application.recordSha256 = await canonicalEvidenceDigest(unsignedApplication);
  contradicted.audit = [];
  const coherentlyRehashed = await recordWorkspaceAction(contradicted, "Rehash contradictory application outcome");
  await assert.rejects(validateWorkspaceSnapshot(coherentlyRehashed), /contradicts catalog-import/i);

  await assert.rejects(
    recordEvidenceDisposition(
      blank,
      {
        source: { kind: "catalog-import", filename: "missing.csv", format: "catalog-csv-v1", bytes: 10, sha256: "a".repeat(64) },
        review: { structuralStatus: "passed", canonicalPayloadSha256: "b".repeat(64), parserProfile: "catalog-csv-v1" },
        scope: { kind: "catalog-records", entityIds: ["MISSING-1"] },
      },
      evidenceDisposition({ atBrowser: "2026-08-31T00:02:00.000Z" }),
      "Attempt nonexistent evidence target",
      {
        outcome: "applied",
        reason: "catalog-import-applied",
        detail: "This target does not exist.",
        resultingRevisionId: "REV-NOT-PRESENT",
        resultingRevisionDigest: "c".repeat(64),
      },
    ),
    /existing resulting revision.*exact state digest/i,
  );
});

test("active evidence assessment does not latch removed history and blocks unattributed typed local records", async () => {
  const blank = await createBlankWorkspace("Active evidence reachability");
  const review = await reviewImport(new File(["id,title\nREMOVED-1,Temporary evidence"], "temporary.csv", { type: "text/csv" }));
  const imported = await applyImport(blank, review, evidenceDisposition());
  assert.equal(assessActiveEvidence(imported).activeUnverifiedDecisionDigests.length, 1);
  const removed = await rollbackTo(imported, blank.activeRevisionId);
  assert.equal(activeRevision(removed).records.length, 0);
  assert.equal(assessActiveEvidence(removed).blocked, false);
  assert.equal(removed.evidenceAuthority.length, 1, "historical decision remains reportable");

  const service = makeServiceRecord("collection-policy", "SRV-UNATTRIBUTED", "2026-08-31T00:00:00.000Z");
  Object.assign(service, {
    title: "Official-looking but locally asserted policy",
    ownerRole: "Director",
    system: "Policy register",
    state: "active",
    values: { scope: "A structurally valid local assertion.", audience: ["All patrons"] },
  });
  const withService = await upsertServiceRecord(blank, service);
  assert.deepEqual(assessActiveEvidence(withService).unattributedServiceIds, [service.id]);
  assert.equal(assessActiveEvidence(withService).blocked, true);

  const schema = makeArchiveSchema("blank", "Local asserted schema", "SCHEMA-UNATTRIBUTED", "2026-08-31T00:00:00.000Z");
  const withArchive = await upsertArchiveSchema(blank, schema);
  assert.deepEqual(assessActiveEvidence(withArchive).unattributedArchiveIds, [`schema:${schema.id}`]);
  assert.equal(assessActiveEvidence(withArchive).blocked, true);
});

test("catalog quarantine rejects supplied unsafe primary IDs but permits absent IDs", async () => {
  const unsafe = await reviewImport(new File([
    "TY  - BOOK\nID  - SAME ID\nTI  - Supplied unsafe identity\nER  - \n",
  ], "unsafe-id.ris", { type: "application/x-research-info-systems" }));
  assert.equal(unsafe.blocked, true);
  assert.match(unsafe.findings[0].detail, /unsafe primary identifier/i);

  const absent = await reviewImport(new File([
    "TY  - BOOK\nTI  - No supplied identity\nER  - \n",
  ], "absent-id.ris", { type: "application/x-research-info-systems" }));
  assert.equal(absent.blocked, false, absent.summary);
  assert.match(absent.records[0].id, /^RIS-[a-f0-9]{12}-1$/);
});

test("duplicate DOI matching normalizes the common DOI label prefix", async () => {
  const review = await reviewImport(new File([
    "TY  - BOOK\nID  - DOI-ONE\nTI  - First DOI form\nDO  - 10.5555/same\nER  - \n"
      + "TY  - BOOK\nID  - DOI-TWO\nTI  - Second DOI form\nDO  - doi: 10.5555/same\nER  - \n",
  ], "duplicate-doi.ris", { type: "application/x-research-info-systems" }));

  assert.equal(review.blocked, true);
  assert.ok(review.findings.some((finding) => finding.code === "IDENTIFIER_DUPLICATE"));
});

test("maximum-length import filenames still produce a saveable revision label", async () => {
  const packet = {
    schema: CATALOG_PACKET_SCHEMA, version: 1, kind: "catalog-batch", provenance: { label: "Long filename" },
    records: [{ id: "BIB-LONG-NAME", title: "Long filename", creators: [], year: "2026", format: "Book", identifiers: [], links: [], availability: "Check availability", edition: "", location: "", suppressed: false, publicVisible: true, requestable: false }],
  };
  const filename = `${"a".repeat(175)}.json`;
  const review = await reviewImport(new File([JSON.stringify(packet)], filename, { type: "application/json" }));
  const applied = await applyImport(await createBlankWorkspace(), review, evidenceDisposition());
  assert.ok(activeRevision(applied).label.length <= 180);
  await assert.doesNotReject(validateWorkspaceSnapshot(applied));
});

test("archival apply binds the reviewed file digest, format, and filename", async () => {
  const blank = await createBlankWorkspace();
  const schema = makeArchiveSchema("blank", "Accession register", "SCHEMA-AUDIT", "2026-08-20T12:00:00.000Z");
  const packet = formatArchive(schema, [], "schema-package", "2026-08-20T12:00:00.000Z");
  const review = await reviewArchiveImport(new File([packet], "accessions.archive-schema.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  const applied = await applyArchiveImport(blank, review, evidenceDisposition());
  assert.match(applied.audit.at(-1).target, new RegExp(`^evidence:[a-f0-9]{64} · source:${review.digest}$`));
  assert.equal(applied.evidenceAuthority[0].disposition.decision, "admit-unverified");
  assert.equal(applied.evidenceApplications[0].outcome, "applied");

  const forged = structuredClone(review);
  forged.schema.name = "Substituted archival schema";
  await assert.rejects(applyArchiveImport(blank, forged, evidenceDisposition()), /review binding|provenance/i);
});

test("audit-ledger rollover refuses an unverified predecessor", async () => {
  const workspace = await createBlankWorkspace("Unverified predecessor");
  workspace.audit = Array.from({ length: MAX_AUDIT_EVENTS }, (_, index) => ({
    sequence: index + 1,
    at: "2026-08-20T12:00:00.000Z",
    role: "Local operator",
    action: "Fabricated event",
    target: "Fabricated target",
    outcome: "accepted",
    stateDigest: "e".repeat(64),
    previousHash: index === 0 ? "GENESIS" : "f".repeat(64),
    hash: "f".repeat(64),
  }));

  await assert.rejects(prepareLocalWorkspace(workspace, "Successor"), /predecessor|audit chain|integrity/i);
});

test("saved snapshots require one forward linear retained revision lineage", async () => {
  const first = await createBlankWorkspace("Lineage");
  const second = await updateConfig(first, {
    resolverBase: "",
    proxyPrefix: "",
    defaultPickupLocation: "Stacks",
    memberCode: "LIN",
  });
  const reversed = structuredClone(second);
  reversed.revisions[0].parentId = reversed.revisions[1].id;
  reversed.revisions[1].parentId = null;

  await assert.rejects(validateWorkspaceSnapshot(reversed), /revision lineage|parent/i);
});

test("prototype keys and future schemas are quarantined", async () => {
  const poisoned = new File([
    '{"schema":"library-access-continuity-lab","version":1,"kind":"catalog-batch","provenance":{"label":"x"},"records":[],"__proto__":{"polluted":true}}',
  ], "poison.laclab.json", { type: "application/json" });
  const poisonedReview = await reviewImport(poisoned);
  assert.equal(poisonedReview.blocked, true);
  assert.equal(poisonedReview.findings[0].code, "PARSE_REJECTED");

  const future = new File([
    JSON.stringify({ schema: "library-access-continuity-lab", version: 99, kind: "catalog-batch", provenance: { label: "x" }, records: [] }),
  ], "future.laclab.json", { type: "application/json" });
  const futureReview = await reviewImport(future);
  assert.equal(futureReview.blocked, true);
});

test("MIME mismatch and unsafe record URLs are rejected", async () => {
  const mismatch = new File(["{}"], "packet.json", { type: "text/html" });
  assert.equal((await reviewImport(mismatch)).findings[0].code, "MIME_MISMATCH");

  const packet = {
    schema: "library-access-continuity-lab",
    version: 1,
    kind: "catalog-batch",
    provenance: { label: "URL test" },
    records: [{
      id: "BAD-URL",
      title: "Unsafe",
      creators: [],
      year: "2026",
      format: "Other",
      identifiers: [{ scheme: "local", value: "BAD" }],
      links: ["javascript:alert(1)"],
      availability: "Online",
      edition: "",
      location: "Online",
      suppressed: false,
      publicVisible: true,
      requestable: false,
    }],
  };
  const review = await reviewImport(new File([JSON.stringify(packet)], "unsafe.json", { type: "application/json" }));
  assert.equal(review.blocked, true);
  assert.ok(review.findings.some((finding) => finding.code === "URL_UNSAFE"));
});

test("saved workspace validation detects tampering and unsafe stored URLs", async () => {
  const workspace = await createFixtureWorkspace();
  assert.equal((await validateWorkspaceSnapshot(workspace)).schema, "library-access-continuity-lab");

  const alteredAudit = structuredClone(workspace);
  alteredAudit.audit[0].action = "Altered";
  await assert.rejects(validateWorkspaceSnapshot(alteredAudit), /audit chain/i);

  const alteredState = structuredClone(workspace);
  alteredState.name = "Altered but canonical";
  assert.equal(await verifyAudit(alteredState), false);
  await assert.rejects(validateWorkspaceSnapshot(alteredState), /audit chain/i);

  const noAudit = structuredClone(workspace);
  noAudit.audit = [];
  assert.equal(await verifyAudit(noAudit), false);
  await assert.rejects(validateWorkspaceSnapshot(noAudit), /audit events/i);

  const duplicateRecord = structuredClone(workspace);
  duplicateRecord.revisions[0].records.push(structuredClone(duplicateRecord.revisions[0].records[0]));
  await assert.rejects(validateWorkspaceSnapshot(duplicateRecord), /duplicate record ID/i);

  const unsafeRecord = structuredClone(workspace);
  unsafeRecord.revisions[0].records[0].links = ["https://localhost/private"];
  await assert.rejects(validateWorkspaceSnapshot(unsafeRecord), /Stored URL rejected/i);
});

test("catalog delimited imports require exact headers, row width, and booleans", async () => {
  const cases = [
    ["duplicate.csv", "title,public-visible,public visible\nRecord,false,false\n", /unique after normalization/i, "text/csv"],
    ["extra.csv", "id,title\nR-1,Record,extra\n", /row 2 has 3 cells; expected 2/i, "text/csv"],
    ["short.tsv", "id\ttitle\tyear\nR-1\tRecord\n", /row 2 has 2 cells; expected 3/i, "text/tab-separated-values"],
    ["boolean.csv", "id,title,suppressed\nR-1,Record,maybe\n", /suppressed must be true\/false/i, "text/csv"],
  ];
  for (const [name, content, expected, type] of cases) {
    const review = await reviewImport(new File([content], name, { type }));
    assert.equal(review.blocked, true, name);
    assert.equal(review.findings[0].code, "PARSE_REJECTED", name);
    assert.match(review.findings[0].detail, expected, name);
  }
});

test("canonical catalog packets reject silent truncation and invalid provenance", async () => {
  const baseRecord = { id: "BIB-LIMIT-1", title: "Bounded", creators: [], contributors: [], year: "2026", format: "Book", identifiers: [], links: [], availability: "Check availability", edition: "", location: "", suppressed: false, publicVisible: true, requestable: false };
  const cases = [
    [{ ...baseRecord, creators: Array(51).fill("Creator") }, {}, /exceeds 50 creators/i],
    [{ ...baseRecord, contributors: Array(51).fill("Contributor") }, {}, /exceeds 50 contributors/i],
    [{ ...baseRecord, identifiers: Array.from({ length: 51 }, (_, index) => ({ scheme: "local", value: `ID-${index}` })) }, {}, /exceeds 50 identifiers/i],
    [{ ...baseRecord, links: Array.from({ length: 21 }, (_, index) => `https://example.org/${index}`) }, {}, /exceeds 20 links/i],
    [baseRecord, { revision: 42 }, /provenance revision must be text/i],
    [baseRecord, { exportedAt: "2026-02-30T00:00:00.000Z" }, /ISO 8601 UTC instant/i],
  ];
  for (const [record, provenance, expected] of cases) {
    const packet = { schema: CATALOG_PACKET_SCHEMA, version: 1, kind: "catalog-batch", provenance: { label: "Limits", ...provenance }, records: [record] };
    const review = await reviewImport(new File([JSON.stringify(packet)], "limits.in-keeping.json", { type: "application/json" }));
    assert.equal(review.blocked, true);
    assert.match(review.findings[0].detail, expected);
  }
});

test("review retains every finding, including a late blocking error", async () => {
  const rows = ["id,title"];
  for (let index = 0; index < 205; index += 1) rows.push(`R-${index},`);
  const review = await reviewImport(new File([rows.join("\n")], "late-error.csv", { type: "text/csv" }));
  assert.equal(review.blocked, true);
  assert.equal(review.findings.length, 205);
  assert.ok(review.findings.some((finding) => finding.code === "TITLE_MISSING" && finding.recordId === "R-204"));
});

test("service-register changes are revisioned, state-bound, and reversible", async () => {
  const baseline = await createFixtureWorkspace();
  const service = structuredClone(activeRevision(baseline).serviceRecords[0]);
  service.title = "Revised collection commitment";
  service.updatedAt = new Date().toISOString();
  const changed = await upsertServiceRecord(baseline, service);
  assert.equal(activeRevision(changed).serviceRecords.find((record) => record.id === service.id).title, service.title);
  assert.equal(changed.audit.at(-1).action, "Update service record");
  assert.equal(changed.audit.at(-1).stateDigest.length, 64);
  assert.equal(await verifyAudit(changed), true);

  const restored = await rollbackTo(changed, baseline.activeRevisionId);
  assert.notEqual(activeRevision(restored).serviceRecords.find((record) => record.id === service.id).title, service.title);
  assert.equal(await verifyAudit(restored), true);

  const tampered = structuredClone(changed);
  tampered.revisions.at(-1).serviceRecords[0].title = "Unrecorded alteration";
  await assert.rejects(validateWorkspaceSnapshot(tampered), /digest|audit chain/i);
});

test("incident and note limits reject mutations before state becomes unsaveable", async () => {
  const workspace = await createFixtureWorkspace();
  const fullIncidents = structuredClone(workspace);
  fullIncidents.incidents = Array.from({ length: 500 }, (_, index) => ({ ...structuredClone(workspace.incidents[0]), id: `INC-${index}` }));
  await assert.rejects(createIncidentFromFinding(fullIncidents, { id: "F-1", severity: "warning", code: "TEST", label: "Capacity", detail: "Capacity", recordId: undefined }), /Incident capacity reached/i);

  const fullNotes = structuredClone(workspace);
  fullNotes.incidents[0].notes = Array.from({ length: 500 }, (_, index) => `Note ${index}`);
  await assert.rejects(updateIncident(fullNotes, fullNotes.incidents[0].id, { note: "One too many" }), /note capacity reached/i);

  await assert.rejects(createIncidentFromFinding(workspace, { id: "F-LONG", severity: "warning", code: "LONG", label: "Long evidence", detail: "x".repeat(2001) }), /2,000-character incident boundary/i);
});

test("incident resolution requires contemporaneous closure evidence and an assigned owner", async () => {
  const blank = await createBlankWorkspace("Incident closure evidence");
  const opened = await createIncidentFromFinding(blank, {
    id: "F-CLOSE",
    severity: "error",
    code: "SERVICE_UNAVAILABLE",
    label: "Repository access unavailable",
    detail: "The monitored access check did not complete.",
  });
  const incidentId = opened.incidents[0].id;

  await assert.rejects(updateIncident(opened, incidentId, { state: "resolved" }), /resolution.*note/i);
  await assert.rejects(updateIncident(opened, incidentId, { state: "resolved", note: "Access check completed successfully." }), /assigned owner role/i);
  await assert.rejects(updateIncident(opened, incidentId, { state: "resolved", ownerRole: "Repository operations lead", nextAction: "", note: "Access check completed successfully." }), /closure criterion/i);

  const resolved = await updateIncident(opened, incidentId, {
    state: "resolved",
    ownerRole: "Repository operations lead",
    note: "Access check completed successfully from the approved monitoring path.",
  });
  assert.equal(resolved.incidents[0].state, "resolved");
  assert.equal(resolved.incidents[0].ownerRole, "Repository operations lead");
  assert.match(resolved.incidents[0].notes.at(-1), /approved monitoring path/i);
  assert.equal(await verifyAudit(resolved), true);

  await assert.rejects(updateIncident(resolved, incidentId, { nextAction: "No verification required" }), /resolved incident.*contemporaneous note|contemporaneous note.*resolved incident/i);
  await assert.rejects(updateIncident(resolved, incidentId, { ownerRole: "Unassigned" }), /resolved incident.*contemporaneous note|contemporaneous note.*resolved incident/i);
  const revisedClosure = await updateIncident(resolved, incidentId, {
    nextAction: "Repeat the approved control-record and access-path checks after the next deployment.",
    note: "Closure criterion updated after service-owner review; the original verification note remains retained.",
  });
  assert.match(revisedClosure.incidents[0].nextAction, /control-record and access-path checks/i);
  assert.match(revisedClosure.incidents[0].notes.at(-1), /service-owner review/i);
});

test("operational documents carry revision and recovery context", async () => {
  const workspace = await createFixtureWorkspace();
  const inventory = makeOperationalDocument(workspace, "system-inventory");
  const runbook = makeOperationalDocument(workspace, "rollback-runbook");
  assert.match(inventory, /System inventory/);
  assert.match(inventory, /Baseline control template.*do not establish.*deployed.*authoritative.*institution.*inventory/i);
  assert.match(inventory, /Revision:/);
  assert.match(runbook, /last known-good revision/i);
  assert.match(runbook, /Review trigger:/);
  const hostile = await createBlankWorkspace('<img src=x onerror="alert(1)">');
  const escaped = makeOperationalDocument(hostile, "system-inventory");
  assert.doesNotMatch(escaped, /<img/i);
  assert.match(escaped, /&lt;img/);
});

test("operational documents do not relabel mutation time as verification evidence", async () => {
  const workspace = await createFixtureWorkspace();
  const inventory = makeOperationalDocument(workspace, "system-inventory");

  assert.doesNotMatch(inventory, /Last verified:/i);
  assert.match(inventory, /Workspace updated \(browser clock; not trusted time\):/i);
  assert.match(inventory, /Draft status: requires institutional review/i);
  assert.match(inventory, /content present in this workspace/i);
});

test("incident-bound documents require an explicit target and carry closure evidence", async () => {
  let workspace = await createBlankWorkspace("Explicit incident reports");
  workspace = await createIncidentFromFinding(workspace, { id: "F-A", severity: "error", code: "OUTAGE_A", label: "Repository A unavailable", detail: "Repository A check failed." });
  const firstId = workspace.incidents[0].id;
  workspace = await createIncidentFromFinding(workspace, { id: "F-B", severity: "warning", code: "OUTAGE_B", label: "Repository B degraded", detail: "Repository B check degraded." });
  const secondId = workspace.incidents[1].id;
  workspace = await updateIncident(workspace, secondId, { state: "resolved", ownerRole: "Repository operations lead", note: "Repository B passed the approved access and control-record checks." });

  assert.throws(() => makeOperationalDocument(workspace, "incident-ticket"), /select an incident/i);
  const ticket = makeOperationalDocument(workspace, "incident-ticket", secondId);
  assert.equal(ticket.includes(secondId.replaceAll("-", "\\-")), true);
  assert.match(ticket, /passed the approved access and control\\-record checks/i);
  assert.equal(ticket.includes(firstId.replaceAll("-", "\\-")), false);
  assert.doesNotMatch(ticket, /Repository A unavailable/);
  const escalation = makeOperationalDocument(workspace, "vendor-escalation", secondId);
  assert.doesNotMatch(escalation, /No patron data is included/);
  assert.match(escalation, /review every supplied.*personal.*data/i);
  const openPostmortem = makeOperationalDocument(workspace, "postmortem", firstId);
  assert.match(openPostmortem, /State: open/i);
  assert.match(openPostmortem, /incident remains open.*not closure evidence.*not.*completed postmortem/i);
  assert.doesNotMatch(openPostmortem, /## Closure evidence and activity notes/);
});

test("incident-bound documents reject unsupported resolved incidents", async () => {
  let workspace = await createBlankWorkspace("Legacy incident reports");
  workspace = await createIncidentFromFinding(workspace, { id: "F-LEGACY", severity: "error", code: "OUTAGE_LEGACY", label: "Repository unavailable", detail: "Repository check failed." });
  const incidentId = workspace.incidents[0].id;
  workspace = await updateIncident(workspace, incidentId, {
    state: "resolved",
    ownerRole: "Repository operations lead",
    note: "Repository passed the approved access and control-record checks.",
  });

  const withoutNoteDraft = structuredClone(workspace);
  withoutNoteDraft.incidents[0].notes = [];
  const withoutNote = await recordWorkspaceAction(withoutNoteDraft, "Import legacy incident state", incidentId);
  await validateWorkspaceSnapshot(withoutNote);

  const withoutOwnerDraft = structuredClone(workspace);
  withoutOwnerDraft.incidents[0].ownerRole = "Unassigned";
  const withoutOwner = await recordWorkspaceAction(withoutOwnerDraft, "Import legacy incident state", incidentId);
  await validateWorkspaceSnapshot(withoutOwner);

  const withoutCriterionDraft = structuredClone(workspace);
  withoutCriterionDraft.incidents[0].nextAction = "";
  const withoutCriterion = await recordWorkspaceAction(withoutCriterionDraft, "Import legacy incident state", incidentId);
  await validateWorkspaceSnapshot(withoutCriterion);

  for (const kind of ["incident-ticket", "vendor-escalation", "postmortem"]) {
    assert.throws(() => makeOperationalDocument(withoutNote, kind, incidentId), /closure evidence/i);
    assert.throws(() => makeOperationalDocument(withoutOwner, kind, incidentId), /assigned owner/i);
    assert.throws(() => makeOperationalDocument(withoutCriterion, kind, incidentId), /closure criterion/i);
  }
});

test("MARCXML and Dublin Core XML normalize into canonical records", async () => {
  const marc = `<?xml version="1.0" encoding="UTF-8"?>
    <collection xmlns="http://www.loc.gov/MARC21/slim">
      <record>
        <leader>00000nam a2200000 i 4500</leader>
        <controlfield tag="001">BIB-XML-1</controlfield>
        <datafield tag="245" ind1="1" ind2="0"><subfield code="a">A resilient catalog</subfield></datafield>
        <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Case, Ada</subfield></datafield>
        <datafield tag="020" ind1=" " ind2=" "><subfield code="a">9780306406157</subfield></datafield>
        <datafield tag="336" ind1=" " ind2=" "><subfield code="b">txt</subfield></datafield>
        <datafield tag="338" ind1=" " ind2=" "><subfield code="b">cr</subfield></datafield>
        <datafield tag="856" ind1="4" ind2="0"><subfield code="u">https://books.example.org/record/1</subfield></datafield>
      </record>
    </collection>`;
  const marcReview = await reviewImport(new File([marc], "records.marcxml", { type: "application/xml" }));
  assert.equal(marcReview.blocked, false);
  assert.equal(marcReview.format, "marcxml");
  assert.equal(marcReview.records[0].id, "BIB-XML-1");
  assert.equal(marcReview.records[0].format, "Online book");
  assert.ok(marcReview.records[0].source.elements.some((item) => item.code === "245 10 $a" && item.name === "Title statement"));

  const dc = `<?xml version="1.0" encoding="UTF-8"?>
    <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Continuity by design</dc:title>
      <dc:creator>Rowan Lee</dc:creator>
      <dc:type>Book</dc:type>
      <dc:identifier>DC-1</dc:identifier>
      <dc:identifier>https://repository.example.org/items/1</dc:identifier>
    </oai_dc:dc>`;
  const dcReview = await reviewImport(new File([dc], "record.dc.xml", { type: "text/xml" }));
  assert.equal(dcReview.blocked, false);
  assert.equal(dcReview.format, "dcxml");
  assert.equal(dcReview.records[0].title, "Continuity by design");
  assert.equal(dcReview.records[0].format, "Book");
  assert.ok(dcReview.records[0].source.elements.some((item) => item.code === "dc:title" && item.definition));
});

test("stored source elements are bounded and strictly shaped", async () => {
  const workspace = await createFixtureWorkspace();
  const malformed = structuredClone(workspace);
  malformed.revisions[0].records[0].source.elements[0].html = "<script>alert(1)</script>";
  await assert.rejects(validateWorkspaceSnapshot(malformed), /Unknown field/i);

  const oversized = structuredClone(workspace);
  oversized.revisions[0].records[0].source.elements = Array.from({ length: 1025 }, (_, index) => ({ code: String(index), name: "Field", value: "value", definition: "definition" }));
  await assert.rejects(validateWorkspaceSnapshot(oversized), /no more than 1,024/i);
});

test("XML declarations that enable external content are rejected before parsing", async () => {
  const xml = `<?xml version="1.0"?><!DOCTYPE record [<!ENTITY x SYSTEM "https://example.org/x">]><record>&x;</record>`;
  const review = await reviewImport(new File([xml], "hostile.xml", { type: "application/xml" }));
  assert.equal(review.blocked, true);
  assert.match(review.findings[0].detail, /DTD|entities/i);
});

test("XML import rejects foreign namespaces, namespace-confused fields, and excessive depth", async () => {
  const unusedDeclaration = `<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:unused="https://example.org/unused"><dc:title>Declared only</dc:title><dc:identifier>UNUSED-NS</dc:identifier></oai_dc:dc>`;
  const unusedReview = await reviewImport(new File([unusedDeclaration], "unused.dc.xml", { type: "application/xml" }));
  assert.equal(unusedReview.blocked, false, unusedReview.summary);
  assert.equal(unusedReview.records[0].title, "Declared only");

  const disguisedMarc = `<collection xmlns="https://attacker.invalid/marc"><record xmlns="http://www.loc.gov/MARC21/slim"><controlfield tag="001">FORGED</controlfield></record></collection>`;
  const disguisedReview = await reviewImport(new File([disguisedMarc], "disguised.marcxml", { type: "application/xml" }));
  assert.equal(disguisedReview.blocked, true);
  assert.match(disguisedReview.findings[0].detail, /root and namespace|not an accepted/i);

  const mixedDc = `<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:evil="https://attacker.invalid/"><evil:title>Forged title</evil:title><dc:identifier>SAFE-ID</dc:identifier></oai_dc:dc>`;
  const mixedReview = await reviewImport(new File([mixedDc], "mixed.dc.xml", { type: "application/xml" }));
  assert.equal(mixedReview.blocked, true);
  assert.match(mixedReview.findings[0].detail, /namespace.*not accepted/i);

  const deepXml = `<mods xmlns="http://www.loc.gov/mods/v3">${"<extension>".repeat(257)}value${"</extension>".repeat(257)}</mods>`;
  const deepReview = await reviewImport(new File([deepXml], "deep.mods.xml", { type: "application/xml" }));
  assert.equal(deepReview.blocked, true);
  assert.match(deepReview.findings[0].detail, /nesting exceeds/i);
});

test("the XML pre-parser enforces exact element and depth boundaries before DOM construction", () => {
  const maximumElements = `<root>${"<item/>".repeat(MAX_XML_ELEMENTS - 1)}</root>`;
  assert.doesNotThrow(() => assertSafeXmlText(maximumElements));
  assert.throws(() => assertSafeXmlText(`<root>${"<item/>".repeat(MAX_XML_ELEMENTS)}</root>`), /element limit/i);

  const maximumDepth = "<node>".repeat(MAX_XML_DEPTH) + "value" + "</node>".repeat(MAX_XML_DEPTH);
  assert.doesNotThrow(() => assertSafeXmlText(maximumDepth));
  assert.throws(() => assertSafeXmlText("<node>".repeat(MAX_XML_DEPTH + 1) + "</node>".repeat(MAX_XML_DEPTH + 1)), /nesting exceeds/i);
  assert.throws(() => assertSafeXmlText("<root><child></root></child>"), /unbalanced/i);
  assert.throws(() => assertSafeXmlText("<root><child/></root><open>"), /not fully closed/i);
});

test("the XML pre-parser bounds comments, attributes, and parser allocations", () => {
  const commentsAtLimit = `<root>${"<!---->".repeat(MAX_XML_ELEMENTS - 1)}</root>`;
  assert.doesNotThrow(() => assertSafeXmlText(commentsAtLimit));
  assert.throws(() => assertSafeXmlText(`<root>${"<!---->".repeat(MAX_XML_ELEMENTS)}</root>`), /node and attribute limit/i);

  const attributes = (count) => Array.from({ length: count }, (_, index) => ` a${index}="x"`).join("");
  assert.doesNotThrow(() => assertSafeXmlText(`<root${attributes(MAX_XML_ATTRIBUTES_PER_ELEMENT)}/>`));
  assert.throws(() => assertSafeXmlText(`<root${attributes(MAX_XML_ATTRIBUTES_PER_ELEMENT + 1)}/>`), /exceeds 64 attributes/i);

  const fullElements = `<i${attributes(MAX_XML_ATTRIBUTES_PER_ELEMENT)}/>`;
  const exactAllocationLimit = `<root>${fullElements.repeat(1538)}<i${attributes(28)}/></root>`;
  assert.doesNotThrow(() => assertSafeXmlText(exactAllocationLimit));
  assert.throws(() => assertSafeXmlText(exactAllocationLimit.replace("</root>", "<!----></root>")), /node and attribute limit/i);

  assert.doesNotThrow(() => assertSafeXmlText(`<?xml version="1.0" encoding="UTF-8"?><root/>`));
  assert.throws(() => assertSafeXmlText(`<?xml version="1.1"?><root/>`), /XML 1\.0/i);
  assert.throws(() => assertSafeXmlText(`<root value="${"x".repeat(8193)}"/>`), /attribute value exceeds/i);
  assert.throws(() => assertSafeXmlText(`<root><!--invalid---></root>`), /invalid hyphen sequence/i);
});

test("recognized XML formats reject every foreign element instead of ignoring extensions", async () => {
  const mixed = [
    {
      name: "mixed.marcxml",
      xml: `<collection xmlns="http://www.loc.gov/MARC21/slim" xmlns:evil="https://attacker.invalid/"><record><controlfield tag="001">MIXED-MARC</controlfield><datafield tag="245" ind1="1" ind2="0"><subfield code="a">Real title</subfield></datafield><evil:datafield tag="245"><evil:subfield code="a">Forged</evil:subfield></evil:datafield></record></collection>`,
    },
    {
      name: "mixed.dc.xml",
      xml: `<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:evil="https://attacker.invalid/"><dc:title>Real title</dc:title><dc:identifier>MIXED-DC</dc:identifier><evil:title>Forged</evil:title></oai_dc:dc>`,
    },
    {
      name: "mixed.mods.xml",
      xml: `<mods xmlns="http://www.loc.gov/mods/v3" xmlns:evil="https://attacker.invalid/"><recordInfo><recordIdentifier>MIXED-MODS</recordIdentifier></recordInfo><titleInfo><title>Real title</title></titleInfo><evil:title>Forged</evil:title></mods>`,
    },
  ];
  for (const fixture of mixed) {
    const review = await reviewImport(new File([fixture.xml], fixture.name, { type: "application/xml" }));
    assert.equal(review.blocked, true, fixture.name);
    assert.match(review.findings[0].detail, /namespace.*not accepted/i, fixture.name);
    assert.equal(review.records.length, 0, fixture.name);
  }
});

test("MARCXML rejects unsupported same-namespace structure before mapping", async () => {
  const ns = "http://www.loc.gov/MARC21/slim";
  const leader = "<leader>00000nam a2200000 i 4500</leader>";
  const title = `<datafield tag="245" ind1="1" ind2="0"><subfield code="a">Title</subfield></datafield>`;
  const hostile = [
    [`<collection xmlns="${ns}"><bogus/></collection>`, /outside the accepted record structure/i],
    [`<collection xmlns="${ns}">Hidden text<record>${leader}${title}</record></collection>`, /text outside an accepted leaf/i],
    [`<record xmlns="${ns}">${leader}<bogus/>${title}</record>`, /leader\/controlfield\/datafield structure/i],
    [`<record xmlns="${ns}">Hidden text${leader}${title}</record>`, /text outside an accepted leaf/i],
    [`<record xmlns="${ns}">${title}</record>`, /exactly one.*leader|begin with its leader/i],
    [`<record xmlns="${ns}"><leader><subfield code="a">00000nam a2200000 i 4500</subfield></leader>${title}</record>`, /text-only.*leader/i],
    [`<record xmlns="${ns}">${leader}<datafield tag="001" ind1=" " ind2=" "><subfield code="a">Wrong class</subfield></datafield>${title}</record>`, /invalid data field/i],
    [`<record xmlns="${ns}">${leader}<controlfield tag="010">Wrong class</controlfield>${title}</record>`, /invalid control field/i],
    [`<record xmlns="${ns}">${leader}<datafield tag="245" ind1="1" ind2="0">Hidden text<subfield code="a">Title</subfield></datafield></record>`, /text outside an accepted leaf/i],
    [`<record xmlns="${ns}">${leader}<datafield tag="245" ind1="1" ind2="0"><subfield code="a"><subfield code="b">Nested</subfield></subfield></datafield></record>`, /invalid subfield/i],
    [`<record xmlns="${ns}">${title}${leader}<controlfield tag="001">OUT-OF-ORDER</controlfield></record>`, /order leader|begin with its leader/i],
    [`<record xmlns="${ns}"><leader injected="x">00000nam a2200000 i 4500</leader>${title}</record>`, /unsupported attribute/i],
    [`<record xmlns="${ns}">${leader}<controlfield tag="001" injected="x">ATTR</controlfield>${title}</record>`, /unsupported attribute/i],
    [`<record xmlns="${ns}">${leader}<datafield tag="245" ind1="1" ind2="0" injected="x"><subfield code="a">Title</subfield></datafield></record>`, /unsupported attribute/i],
    [`<record xmlns="${ns}">${leader}<datafield tag="245" ind1="1" ind2="0"><subfield code="a" injected="x">Title</subfield></datafield></record>`, /invalid subfield/i],
  ];
  for (const [xml, expected] of hostile) {
    const review = await reviewImport(new File([xml], "hostile.marcxml", { type: "application/xml" }));
    assert.equal(review.blocked, true, review.summary);
    assert.equal(review.records.length, 0);
    assert.match(review.findings[0].detail, expected);
  }
});

test("MARCXML validates unique bounded IDs and retains them as source evidence", async () => {
  const ns = "http://www.loc.gov/MARC21/slim";
  const acceptedXml = `<collection xmlns="${ns}" id="batch_1"><record id="record-1" type="Bibliographic"><leader id="leader.1" xml:space="preserve">00000nam a2200000 i 4500</leader><controlfield id="control-001" tag="001" xml:space="preserve">MARC-ID-1</controlfield><datafield id="field-245" tag="245" ind1="1" ind2="0"><subfield id="subfield-245a" code="a">Title</subfield></datafield></record></collection>`;
  const accepted = await reviewImport(new File([acceptedXml], "ids.marcxml", { type: "application/xml" }));
  assert.equal(accepted.blocked, false, accepted.summary);
  assert.deepEqual(
    accepted.records[0].source.elements.filter((item) => item.code.endsWith("@id")).map((item) => item.value),
    ["batch_1", "record-1", "leader.1", "control-001", "field-245", "subfield-245a"],
  );

  const record = (id, nested = "") => `<record xmlns="${ns}" id="${id}"><leader>00000nam a2200000 i 4500</leader>${nested}<datafield tag="245" ind1="1" ind2="0"><subfield code="a">Title</subfield></datafield></record>`;
  const maximumId = `a${"x".repeat(255)}`;
  const boundary = await reviewImport(new File([record(maximumId)], "boundary-id.marcxml", { type: "application/xml" }));
  assert.equal(boundary.blocked, false, boundary.summary);
  assert.ok(boundary.records[0].source.elements.some((item) => item.code === "record @id" && item.value === maximumId));

  const duplicateRecords = `<collection xmlns="${ns}">${record("record-shared")}${record("record-shared")}</collection>`;
  const hostile = [
    [record(""), /ASCII NCNames/i],
    [record("1-leading-digit"), /ASCII NCNames/i],
    [record("prefix:value"), /ASCII NCNames/i],
    [record(`a${"x".repeat(256)}`), /ASCII NCNames/i],
    [record("duplicate", `<controlfield id="duplicate" tag="001">MARC-ID-2</controlfield>`), /duplicated/i],
    [duplicateRecords, /duplicated/i],
  ];
  for (const [xml, expected] of hostile) {
    const review = await reviewImport(new File([xml], "hostile-id.marcxml", { type: "application/xml" }));
    assert.equal(review.blocked, true, review.summary);
    assert.equal(review.records.length, 0);
    assert.match(review.findings[0].detail, expected);
  }
});

test("Dublin Core batches accept only direct text-only DCMES record fields", async () => {
  const wrapper = "https://hah.dev/ns/in-keeping/1";
  const oai = "http://www.openarchives.org/OAI/2.0/oai_dc/";
  const dc = "http://purl.org/dc/elements/1.1/";
  const hostile = [
    [`<ik:collection xmlns:ik="${wrapper}" xmlns:oai_dc="${oai}" xmlns:dc="${dc}"><dc:title>Not a record</dc:title></ik:collection>`, /outside the accepted.*record structure/i],
    [`<oai_dc:dc xmlns:oai_dc="${oai}" xmlns:dc="${dc}"><dc:bogus>Unsupported</dc:bogus></oai_dc:dc>`, /only text-only DCMES/i],
    [`<oai_dc:dc xmlns:oai_dc="${oai}" xmlns:dc="${dc}"><dc:title><dc:creator>Nested</dc:creator></dc:title></oai_dc:dc>`, /only text-only DCMES/i],
    [`<oai_dc:dc xmlns:oai_dc="${oai}" xmlns:dc="${dc}">Hidden text<dc:title>Visible</dc:title></oai_dc:dc>`, /text outside an accepted leaf/i],
    [`<ik:collection xmlns:ik="${wrapper}" xmlns:oai_dc="${oai}" xmlns:dc="${dc}" mode="merge"><oai_dc:dc><dc:title>Visible</dc:title></oai_dc:dc></ik:collection>`, /unsupported attribute/i],
    [`<oai_dc:dc xmlns:oai_dc="${oai}" xmlns:dc="${dc}" profile="qualified"><dc:title>Visible</dc:title></oai_dc:dc>`, /unsupported attribute/i],
    [`<oai_dc:dc xmlns:oai_dc="${oai}" xmlns:dc="${dc}"><dc:title qualifier="alternative">Visible</dc:title></oai_dc:dc>`, /unsupported attribute/i],
    [`<oai_dc:dc xmlns:oai_dc="${oai}" xmlns:dc="${dc}"><dc:title dc:bogus="same-namespace">Visible</dc:title></oai_dc:dc>`, /unsupported attribute/i],
  ];
  for (const [xml, expected] of hostile) {
    const review = await reviewImport(new File([xml], "hostile.dc.xml", { type: "application/xml" }));
    assert.equal(review.blocked, true, review.summary);
    assert.equal(review.records.length, 0);
    assert.match(review.findings[0].detail, expected);
  }
});

test("MODS mapping follows exact structural paths and rejects unbounded extensions", async () => {
  const exactPath = `<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-PATH-1</recordIdentifier></recordInfo><titleInfo><title>Canonical title</title></titleInfo><note>Retained note</note><typeOfResource>text</typeOfResource></mods>`;
  const accepted = await reviewImport(new File([exactPath], "paths.mods.xml", { type: "application/xml" }));
  assert.equal(accepted.blocked, false, accepted.summary);
  assert.equal(accepted.records[0].title, "Canonical title");

  const poisonedLeaf = `<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-POISON-1</recordIdentifier></recordInfo><titleInfo><title>Real<namePart>Forged</namePart></title></titleInfo></mods>`;
  const poisoned = await reviewImport(new File([poisonedLeaf], "poisoned.mods.xml", { type: "application/xml" }));
  assert.equal(poisoned.blocked, true);
  assert.match(poisoned.findings[0].detail, /text-only title/i);

  const extension = `<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-EXT-1</recordIdentifier></recordInfo><titleInfo><title>Canonical title</title></titleInfo><extension><titleInfo><title>Forged title</title></titleInfo></extension></mods>`;
  const rejected = await reviewImport(new File([extension], "extension.mods.xml", { type: "application/xml" }));
  assert.equal(rejected.blocked, true);
  assert.match(rejected.findings[0].detail, /extension.*not accepted/i);

  const nestedExtension = `<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-EXT-2</recordIdentifier></recordInfo><titleInfo><title>Canonical title</title></titleInfo><note><extension><titleInfo><title>Forged title</title></titleInfo></extension></note></mods>`;
  const nestedRejected = await reviewImport(new File([nestedExtension], "nested-extension.mods.xml", { type: "application/xml" }));
  assert.equal(nestedRejected.blocked, true);
  assert.match(nestedRejected.findings[0].detail, /extension.*not accepted/i);

  const alternateFirst = `<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-TITLE-1</recordIdentifier></recordInfo><titleInfo type="alternative"><title>Alternative title</title></titleInfo><titleInfo><title>Primary title</title></titleInfo><genre authority="aat">books</genre><identifier type="local">MODS-TITLE-1</identifier></mods>`;
  const primary = await reviewImport(new File([alternateFirst], "primary.mods.xml", { type: "application/xml" }));
  assert.equal(primary.blocked, false, primary.summary);
  assert.equal(primary.records[0].title, "Primary title");
  assert.ok(primary.records[0].source.elements.some((item) => item.code === "mods:titleInfo @type" && item.value === "alternative"));
  assert.ok(primary.records[0].source.elements.some((item) => item.code === "mods:genre @authority" && item.value === "aat"));
  assert.ok(primary.records[0].source.elements.some((item) => item.code === "mods:identifier @type" && item.value === "local"));

  const bogusCollection = `<modsCollection xmlns="http://www.loc.gov/mods/v3"><bogus/></modsCollection>`;
  const collectionRejected = await reviewImport(new File([bogusCollection], "collection.mods.xml", { type: "application/xml" }));
  assert.equal(collectionRejected.blocked, true);
  assert.match(collectionRejected.findings[0].detail, /outside the accepted record structure/i);

  for (const hostile of [
    `<mods xmlns="http://www.loc.gov/mods/v3">Hidden text<titleInfo><title>Visible</title></titleInfo></mods>`,
    `<mods xmlns="http://www.loc.gov/mods/v3"><titleInfo><title>Visible</title></titleInfo><bogus>Hidden</bogus></mods>`,
    `<mods xmlns="http://www.loc.gov/mods/v3" injected="true"><titleInfo><title>Visible</title></titleInfo></mods>`,
    `<mods xmlns="http://www.loc.gov/mods/v3"><titleInfo qualifier="display"><title>Visible</title></titleInfo></mods>`,
    `<mods xmlns="http://www.loc.gov/mods/v3"><titleInfo xmlns:mods="http://www.loc.gov/mods/v3" mods:bogus="same-namespace"><title>Visible</title></titleInfo></mods>`,
    `<mods xmlns="http://www.loc.gov/mods/v3"><titleInfo type="uniform"><title>Visible</title></titleInfo></mods>`,
    `<mods xmlns="http://www.loc.gov/mods/v3"><titleInfo><title>Visible</title></titleInfo><identifier type="bad value">ID</identifier></mods>`,
  ]) {
    const hostileReview = await reviewImport(new File([hostile], "hostile.mods.xml", { type: "application/xml" }));
    assert.equal(hostileReview.blocked, true);
    assert.match(hostileReview.findings[0].detail, /text outside an accepted leaf|unsupported (?:bogus|attribute)|titleInfo type|controlled token/i);
  }
});

test("OAI Dublin Core batch output round-trips through the namespaced quarantine", async () => {
  const workspace = await createFixtureWorkspace();
  const source = formatRecords(activeRevision(workspace).records, "dublin-core");
  assert.match(source, /<ik:collection[^>]+https:\/\/hah\.dev\/ns\/in-keeping\/1/);
  assert.match(source, /<oai_dc:dc>/);
  const review = await reviewImport(new File([source], "records.dc.xml", { type: "application/xml" }));
  assert.equal(review.format, "dcxml");
  assert.doesNotMatch(review.findings.map((finding) => finding.detail).join(" "), /root and namespace|could not be parsed/i);
  assert.equal(review.records.length, activeRevision(workspace).records.length);
});

test("production exchange formats serialize every supported record type", async () => {
  const workspace = await createFixtureWorkspace();
  const records = activeRevision(workspace).records;
  assert.equal(RECORD_FORMATS.length, 20);
  for (const format of EXCHANGE_FORMATS) {
    const output = formatRecords(records, format.value);
    assert.ok(output.length > 40, `${format.label} output is present`);
    assert.doesNotMatch(output, /undefined|\[object Object\]/);
  }
  assert.match(formatRecords(records, "dublin-core"), /<dc:title>/);
  assert.match(formatRecords(records, "mods"), /<modsCollection/);
  assert.match(formatRecords(records, "ris"), /TY {2}- /);
  assert.match(formatRecords(records, "marc-text"), /=245 {2}00\$a/);
  assert.match(formatRecords(records, "marc-text"), /=720 {2}\\\\\$a[^\n]+\$ecreator/);
});

test("catalog formatters reject empty batches instead of emitting files their imports refuse", () => {
  for (const format of EXCHANGE_FORMATS) {
    assert.throws(() => formatRecords([], format.value), /requires 1–1,000 records; no file was generated/i);
  }
});

test("every exchange format preserves all 20 normalized record types on re-import", async () => {
  const workspace = await createFixtureWorkspace();
  const template = structuredClone(activeRevision(workspace).records[0]);
  const records = RECORD_FORMATS.map((format, index) => ({
    ...structuredClone(template),
    id: `TYPE-${String(index + 1).padStart(2, "0")}`,
    title: `${format} semantic round-trip`,
    format,
    identifiers: [],
    links: [],
    source: { ...structuredClone(template.source), elements: [] },
  }));
  const files = {
    "laclab-json": ["types.in-keeping.json", "application/json"],
    "dublin-core": ["types.dc.xml", "application/xml"],
    mods: ["types.mods.xml", "application/xml"],
    "csl-json": ["types.csl.json", "application/json"],
    "schema-jsonld": ["types.jsonld", "application/ld+json"],
    ris: ["types.ris", "application/x-research-info-systems"],
    bibtex: ["types.bib", "application/x-bibtex"],
    csv: ["types.csv", "text/csv"],
    tsv: ["types.tsv", "text/tab-separated-values"],
    "marc-text": ["types.mrk", "text/plain"],
  };

  for (const exchange of EXCHANGE_FORMATS) {
    const [filename, mime] = files[exchange.value];
    const output = formatRecords(records, exchange.value);
    const review = await reviewImport(new File([output], filename, { type: mime }));
    assert.equal(review.blocked, false, `${exchange.label}: ${review.summary} ${review.findings.map((finding) => finding.detail).join(" ")}`);
    assert.equal(review.records.length, RECORD_FORMATS.length, exchange.label);
    assert.deepEqual(review.records.map((record) => record.format), RECORD_FORMATS, exchange.label);
  }
});

test("every exchange format can re-import a record at all canonical array maxima", async () => {
  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.id = "MAX-ARRAYS-1";
  record.title = "Maximum canonical arrays";
  record.format = "Other";
  record.creators = Array.from({ length: 50 }, (_, index) => `Creator ${index + 1}`);
  record.contributors = Array.from({ length: 50 }, (_, index) => `Contributor ${index + 1}`);
  record.identifiers = Array.from({ length: 50 }, (_, index) => ({ scheme: "local", value: `LOCAL-${index + 1}` }));
  record.links = Array.from({ length: 20 }, (_, index) => `https://example.org/resource/${index + 1}`);
  record.availability = "Online";
  record.metadata = {
    issued: "2026", created: "", modified: "", publisher: "", place: "", language: "",
    subjects: Array.from({ length: 100 }, (_, index) => `Subject ${index + 1}`),
    genres: Array.from({ length: 100 }, (_, index) => `Genre ${index + 1}`),
    abstract: "", rights: "", license: "", series: "", containerTitle: "", volume: "", issue: "", pages: "", extent: "", audience: "", coverage: "",
    relations: Array.from({ length: 100 }, (_, index) => `Relation ${index + 1}`),
    notes: Array.from({ length: 100 }, (_, index) => `Note ${index + 1}`),
  };
  const files = {
    "laclab-json": ["maximum.in-keeping.json", "application/json"], "dublin-core": ["maximum.dc.xml", "application/xml"], mods: ["maximum.mods.xml", "application/xml"],
    "csl-json": ["maximum.csl.json", "application/json"], "schema-jsonld": ["maximum.jsonld", "application/ld+json"], ris: ["maximum.ris", "application/x-research-info-systems"],
    bibtex: ["maximum.bib", "application/x-bibtex"], csv: ["maximum.csv", "text/csv"], tsv: ["maximum.tsv", "text/tab-separated-values"], "marc-text": ["maximum.mrk", "text/plain"],
  };
  for (const exchange of EXCHANGE_FORMATS) {
    const [filename, mime] = files[exchange.value];
    const review = await reviewImport(new File([formatRecords([record], exchange.value)], filename, { type: mime }));
    assert.equal(review.blocked, false, `${exchange.label}: ${review.summary} ${review.findings.map((finding) => finding.detail).join(" ")}`);
    assert.equal(review.records.length, 1, exchange.label);
  }
  for (const format of ["dublin-core", "mods", "schema-jsonld", "csv", "tsv", "marc-text"]) {
    const [filename, mime] = files[format];
    const review = await reviewImport(new File([formatRecords([record], format)], filename, { type: mime }));
    assert.equal(review.records[0].creators.length, 50, format);
    assert.equal(review.records[0].contributors.length, 50, format);
    assert.equal(review.records[0].identifiers.length, 50, format);
    assert.equal(review.records[0].links.length, 20, format);
    assert.equal(review.records[0].metadata.subjects.length, 100, format);
  }
});

test("versioned native packets remain self-importable above the foreign-file ceiling", async () => {
  const workspace = await createFixtureWorkspace();
  const template = structuredClone(activeRevision(workspace).records[0]);
  const records = Array.from({ length: 1000 }, (_, index) => ({
    ...structuredClone(template), id: `NATIVE-${index + 1}`, title: `Native packet record ${index + 1}`,
    creators: [], contributors: [], identifiers: [], links: [], format: "Other", availability: "Available",
    metadata: { ...structuredClone(template.metadata), subjects: [], genres: [], relations: [], notes: [], abstract: "x".repeat(6000) },
  }));
  const output = formatRecords(records, "laclab-json");
  const file = new File([output], "large.in-keeping.json", { type: "application/json" });
  assert.ok(file.size > 5 * 1024 * 1024);
  assert.ok(file.size < 32 * 1024 * 1024);
  const review = await reviewImport(file);
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.records.length, 1000);

  const boundary = structuredClone(template);
  boundary.id = "ABSTRACT-BOUNDARY";
  boundary.identifiers = [];
  boundary.links = [];
  boundary.metadata = { ...structuredClone(template.metadata), abstract: "x".repeat(8192) };
  const boundaryReview = await reviewImport(new File([formatRecords([boundary], "laclab-json")], "boundary.in-keeping.json", { type: "application/json" }));
  assert.equal(boundaryReview.blocked, false, boundaryReview.summary);
  assert.equal(boundaryReview.records[0].metadata.abstract.length, 8192);

  const disguisedForeign = new File([JSON.stringify({ title: "not a packet", padding: "x".repeat(5 * 1024 * 1024) })], "disguised.in-keeping.json", { type: "application/json" });
  const disguisedReview = await reviewImport(disguisedForeign);
  assert.equal(disguisedReview.blocked, true);
  assert.match(disguisedReview.findings[0].detail, /strictly versioned.*5 MiB/i);
});

test("CSL export preserves EDTF and other non-calendar dates as literals", async () => {
  const workspace = await createFixtureWorkspace();
  const template = structuredClone(activeRevision(workspace).records[0]);
  for (const issued of ["2020/2021", "2026-08~", "[2020..]", "unknown", "0050-01-01", "2026-08-20"]) {
    const record = structuredClone(template);
    record.id = `CSL-DATE-${issued.replace(/[^A-Za-z0-9]+/g, "-")}`;
    record.identifiers = [];
    record.links = [];
    record.metadata = { ...structuredClone(template.metadata), issued };
    const review = await reviewImport(new File([formatRecords([record], "csl-json")], "date.csl.json", { type: "application/json" }));
    assert.equal(review.blocked, false, `${issued}: ${review.summary}`);
    assert.equal(review.records[0].metadata.issued, issued);
  }
});

test("versioned CSV and TSV preserve list delimiters, formula-leading text, and line breaks", async () => {
  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.id = "TABULAR-LOSSLESS-1";
  record.title = "=SUM(A1:A2)\\path\nsecond line";
  record.creators = ["Name; Corporate", "Second | Name"];
  record.contributors = ["'=Literal formula name", "Contributor, Comma"];
  record.identifiers = [{ scheme: "local", value: "LOCAL;ONE|TWO" }, { scheme: "doi", value: "10.5555/tabular" }];
  record.links = ["https://example.org/one", "https://example.org/two"];
  record.availability = "Unavailable";
  record.edition = "@edition";
  record.location = "Vault A";
  record.suppressed = true;
  record.publicVisible = false;
  record.requestable = true;
  record.metadata = {
    issued: "2026-08~", created: "2025-01-02", modified: "2026-08-20",
    publisher: "-Example Press", subjects: ["Libraries; digital", "Pipes | retained"], genres: ["Data; files", "Research | data"],
    abstract: "First line\\path\nSecond line", relations: ["REL;1", "REL|2"], notes: ["Note; one", "Note | two"],
    place: "", language: "", rights: "", license: "", series: "", containerTitle: "", volume: "", issue: "", pages: "", extent: "", audience: "", coverage: "",
  };
  const projection = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "source"));
  for (const [format, filename, mime] of [["csv", "lossless.csv", "text/csv"], ["tsv", "lossless.tsv", "text/tab-separated-values"]]) {
    const output = formatRecords([record], format);
    assert.match(output, /'=SUM\(A1:A2\)/);
    const review = await reviewImport(new File([output], filename, { type: mime }));
    assert.equal(review.blocked, false, `${format}: ${review.summary}`);
    assert.deepEqual(projection(review.records[0]), projection(record), format);
  }
});

test("versioned CSV and TSV quarantine contradictory or non-scalar JSON identities inside cells", async () => {
  const workspace = await createFixtureWorkspace();
  const record = activeRevision(workspace).records[0];
  for (const [format, filename, mime] of [
    ["csv", "identity-conflict.csv", "text/csv"],
    ["tsv", "identity-conflict.tsv", "text/tab-separated-values"],
  ]) {
    const output = formatRecords([record], format);
    const duplicate = output.replace(/""value"":""([^"\r\n]+)""/, '""value"":""forged"",""value"":""$1""');
    assert.notEqual(duplicate, output, `${format} duplicate-key fixture was injected`);
    const duplicateReview = await reviewImport(new File([duplicate], filename, { type: mime }));
    assert.equal(duplicateReview.blocked, true);
    assert.match(duplicateReview.findings[0].detail, /duplicate member name "value"/i);

    const surrogate = output.replace(/""value"":""([^"\r\n]+)""/, '""value"":""\\uD800""');
    assert.notEqual(surrogate, output, `${format} surrogate fixture was injected`);
    const surrogateReview = await reviewImport(new File([surrogate], filename, { type: mime }));
    assert.equal(surrogateReview.blocked, true);
    assert.match(surrogateReview.findings[0].detail, /unpaired Unicode surrogate|unsupported \\u escape/i);
  }
});

test("CSL-JSON round-trips display names without inventing personal-name structure", async () => {
  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.id = "CSL-NAMES-1";
  record.creators = ["Research and Development Office", "Case, Ada"];
  record.contributors = ["University at Albany, SUNY"];
  record.identifiers = [];
  record.links = [];
  const source = formatRecords([record], "csl-json");
  assert.match(source, /"literal": "Research and Development Office"/);
  const review = await reviewImport(new File([source], "names.csl.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  assert.deepEqual(review.records[0].creators, record.creators);
  assert.deepEqual(review.records[0].contributors, record.contributors);
});

test("MODS, RIS, BibTeX, and MARC exports retain their supported descriptive fields conservatively", async () => {
  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.id = "RICH-EXCHANGE-1";
  record.title = "Conservative exchange";
  record.format = "Book chapter";
  record.creators = ["Research and Development Office"];
  record.contributors = ["Case, Ada"];
  record.identifiers = [
    { scheme: "doi", value: "10.5555/rich.one" },
    { scheme: "doi", value: "10.5555/rich.two" },
    { scheme: "isbn", value: "9780306406157" },
    { scheme: "issn", value: "2049-3630" },
  ];
  record.links = ["https://example.org/rich"];
  record.edition = "Second edition";
  record.location = "Special Collections";
  record.metadata = {
    issued: "2026-08~", created: "2025-01-02", modified: "2026-08-20", publisher: "Example Press", place: "Albany", language: "en",
    subjects: ["Libraries"], genres: ["Case studies"], abstract: "A complete abstract.", rights: "Reading-room use.", license: "https://creativecommons.org/licenses/by/4.0/",
    series: "Continuity studies", containerTitle: "Library systems handbook", volume: "2", issue: "1", pages: "10–20", extent: "12 pages", audience: "Systems librarians", coverage: "New York",
    relations: ["REL-1"], notes: ["Retain this note."],
  };

  const mods = await reviewImport(new File([formatRecords([record], "mods")], "rich.mods.xml", { type: "application/xml" }));
  assert.equal(mods.blocked, false, mods.summary);
  assert.equal(mods.records[0].edition, record.edition);
  assert.equal(mods.records[0].location, record.location);
  assert.equal(mods.records[0].metadata.created, record.metadata.created);
  assert.equal(mods.records[0].metadata.modified, record.metadata.modified);
  assert.equal(mods.records[0].metadata.license, record.metadata.license);
  assert.equal(mods.records[0].metadata.series, record.metadata.series);
  assert.equal(mods.records[0].metadata.extent, record.metadata.extent);
  assert.equal(mods.records[0].metadata.audience, record.metadata.audience);
  assert.deepEqual(mods.records[0].metadata.genres, record.metadata.genres);
  assert.deepEqual(mods.records[0].metadata.notes, record.metadata.notes);

  const ris = await reviewImport(new File([formatRecords([record], "ris")], "rich.ris", { type: "application/x-research-info-systems" }));
  assert.equal(ris.blocked, false, ris.summary);
  assert.deepEqual(ris.records[0].identifiers, record.identifiers);
  assert.equal(ris.records[0].edition, record.edition);
  assert.equal(ris.records[0].metadata.place, record.metadata.place);
  assert.equal(ris.records[0].metadata.language, record.metadata.language);
  assert.equal(ris.records[0].metadata.series, record.metadata.series);
  assert.equal(ris.records[0].metadata.rights, record.metadata.rights);
  assert.deepEqual(ris.records[0].metadata.notes, record.metadata.notes);

  const bibtex = formatRecords([record], "bibtex");
  assert.match(bibtex, /booktitle\s*=\s*\{Library systems handbook\}/);
  assert.doesNotMatch(bibtex, /journal\s*=/);
  const bib = await reviewImport(new File([bibtex], "rich.bib", { type: "application/x-bibtex" }));
  assert.equal(bib.blocked, false, bib.summary);
  assert.equal(bib.records[0].metadata.containerTitle, record.metadata.containerTitle);
  assert.equal(bib.records[0].edition, record.edition);

  const marcText = formatRecords([record], "marc-text");
  assert.match(marcText, /=245 {2}00\$a/);
  assert.match(marcText, /=720 {2}\\\\\$aResearch and Development Office\$ecreator/);
  assert.doesNotMatch(marcText, /^=100|^=700/m);
  const marc = await reviewImport(new File([marcText], "rich.mrk", { type: "text/plain" }));
  assert.equal(marc.blocked, false, marc.summary);
  assert.deepEqual(marc.records[0].creators, record.creators);
  assert.deepEqual(marc.records[0].contributors, record.contributors);
  assert.equal(marc.records[0].year, "2026");
  assert.equal(marc.records[0].metadata.issued, record.metadata.issued);
  assert.equal(marc.records[0].edition, record.edition);
  assert.equal(marc.records[0].location, record.location);
  assert.equal(marc.records[0].metadata.extent, record.metadata.extent);
  assert.deepEqual(marc.records[0].metadata.genres, record.metadata.genres);
  assert.deepEqual(marc.records[0].metadata.notes, record.metadata.notes);
});

test("serializers escape markup, formulas, and tagged-line injection", async () => {
  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.title = '=HYPERLINK("https://example.org") & <unsafe>';
  record.creators = ["Rao, Mina\nER  - forged"];
  record.metadata = { ...(record.metadata ?? { issued: "", created: "", modified: "", publisher: "", place: "", language: "", subjects: [], genres: [], abstract: "", rights: "", license: "", series: "", containerTitle: "", volume: "", issue: "", pages: "", extent: "", audience: "", coverage: "", relations: [], notes: [] }), subjects: ["price $5"] };
  assert.match(formatRecords([record], "csv"), /'=HYPERLINK/);
  assert.match(formatRecords([record], "dublin-core"), /&amp; &lt;unsafe&gt;/);
  assert.doesNotMatch(formatRecords([record], "ris"), /\nER {2}- forged/);
  assert.match(formatRecords([record], "marc-text"), /price \\\$5/);
});

test("common library exchange imports normalize through quarantine", async () => {
  const files = [
    new File([JSON.stringify([{ id: "CSL-1", type: "article-journal", title: "CSL title", author: [{ family: "Lee", given: "Rowan" }], issued: { "date-parts": [[2026, 8, 20]] }, DOI: "10.5555/csl.1", URL: "https://example.org/csl" }])], "items.csl.json", { type: "application/json" }),
    new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Dataset", "@id": "urn:in-keeping:DATA-1", name: "Linked data title", author: { "@type": "Person", name: "Mina Rao" }, datePublished: "2026-08-20", url: "https://example.org/data" })], "item.jsonld", { type: "application/ld+json" }),
    new File(["TY  - JOUR\nID  - RIS-1\nTI  - RIS title\nAU  - Ortiz, Lina\nPY  - 2026\nDO  - 10.5555/ris.1\nER  - \n"], "item.ris", { type: "application/x-research-info-systems" }),
    new File(["@book{BIBTEX-1,\n title = {BibTeX title},\n author = {Bell, A. K.},\n year = {2026},\n isbn = {9780306406157}\n}\n"], "item.bib", { type: "application/x-bibtex" }),
    new File(["id,title,creators,format,links,subjects\nCSV-1,CSV title,Rowan Lee,Dataset,https://example.org/csv,continuity;metadata\n"], "item.csv", { type: "text/csv" }),
    new File(["id\ttitle\tcreators\tformat\nTSV-1\tTSV title\tMina Rao\tReport\n"], "item.tsv", { type: "text/tab-separated-values" }),
    new File(["=LDR  00000nam a2200000 i 4500\n=001  MRK-1\n=245  10$aMARC mnemonic title\n=100  1#$aCase, Ada\n=020  ##$a9780306406157\n"], "item.mrk", { type: "text/plain" }),
    new File([`<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-1</recordIdentifier></recordInfo><titleInfo><title>MODS title</title></titleInfo><name><namePart>Rao, Mina</namePart><role><roleTerm>creator</roleTerm></role></name><typeOfResource>text</typeOfResource><genre>book</genre><originInfo><dateIssued>2026</dateIssued></originInfo></mods>`], "item.mods.xml", { type: "application/xml" }),
  ];
  for (const file of files) {
    const review = await reviewImport(file);
    assert.equal(review.blocked, false, `${file.name}: ${review.summary}`);
    assert.equal(review.records.length, 1);
    assert.ok(review.records[0].source.elements.length > 0);
    assert.ok(review.records[0].metadata);
  }
});

test("oversized record arrays are rejected in every catalog interchange path", async () => {
  const creatorElements = (tag, count, wrap = (value) => value) => Array.from({ length: count }, (_, index) => wrap(`<${tag}>Creator ${index + 1}</${tag}>`)).join("");
  const fixtures = [
    new File([JSON.stringify([{ id: "CSL-OVER", title: "Overflow", author: Array.from({ length: 51 }, (_, index) => ({ literal: `Creator ${index + 1}` })) }])], "overflow.csl.json", { type: "application/json" }),
    new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "Overflow", identifier: Array.from({ length: 51 }, (_, index) => `ID-${index + 1}`) })], "overflow.jsonld", { type: "application/ld+json" }),
    new File([`TY  - BOOK\nTI  - Overflow\n${Array.from({ length: 51 }, (_, index) => `AU  - Creator ${index + 1}`).join("\n")}\nER  - \n`], "overflow.ris", { type: "application/x-research-info-systems" }),
    new File([`=LDR  00000nam a2200000 i 4500\n=001  MARC-OVER\n=245  10$aOverflow\n${Array.from({ length: 51 }, (_, index) => `=700  1#$aCreator ${index + 1}`).join("\n")}\n`], "overflow.mrk", { type: "text/plain" }),
    new File([`<collection xmlns="http://www.loc.gov/MARC21/slim"><record><leader>00000nam a2200000 i 4500</leader><controlfield tag="001">MARCXML-OVER</controlfield><datafield tag="245" ind1="1" ind2="0"><subfield code="a">Overflow</subfield></datafield>${Array.from({ length: 51 }, (_, index) => `<datafield tag="700" ind1="1" ind2=" "><subfield code="a">Creator ${index + 1}</subfield></datafield>`).join("")}</record></collection>`], "overflow.marcxml", { type: "application/xml" }),
    new File([`<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Overflow</dc:title>${creatorElements("dc:creator", 51)}</oai_dc:dc>`], "overflow.dc.xml", { type: "application/xml" }),
    new File([`<mods xmlns="http://www.loc.gov/mods/v3"><recordInfo><recordIdentifier>MODS-OVER</recordIdentifier></recordInfo><titleInfo><title>Overflow</title></titleInfo>${Array.from({ length: 51 }, (_, index) => `<name><namePart>Creator ${index + 1}</namePart><role><roleTerm>creator</roleTerm></role></name>`).join("")}</mods>`], "overflow.mods.xml", { type: "application/xml" }),
  ];
  for (const file of fixtures) {
    const review = await reviewImport(file);
    assert.equal(review.blocked, true, `${file.name}: ${review.summary}`);
    assert.equal(review.records.length, 0, file.name);
    assert.match(review.findings.map((finding) => finding.detail).join(" "), /exceeds 50|more than 50|invalid/i, file.name);
  }

  const boundary = await reviewImport(new File([JSON.stringify([{ id: "CSL-BOUNDARY", title: "Boundary", author: Array.from({ length: 50 }, (_, index) => ({ literal: `Creator ${index + 1}` })) }])], "boundary.csl.json", { type: "application/json" }));
  assert.equal(boundary.blocked, false, boundary.summary);
  assert.equal(boundary.records[0].creators.length, 50);
});

test("CSL and JSON-LD arrays are supported or explicitly rejected, never reduced", async () => {
  const dateRange = await reviewImport(new File([JSON.stringify([{ id: "CSL-RANGE", title: "Range", issued: { "date-parts": [[2025], [2026]] } }])], "range.csl.json", { type: "application/json" }));
  assert.equal(dateRange.blocked, true);
  assert.match(dateRange.findings[0].detail, /exactly one date|not silently reduced/i);

  const fourPartDate = await reviewImport(new File([JSON.stringify([{ id: "CSL-DATE-OVER", title: "Date", issued: { "date-parts": [[2026, 8, 20, 1]] } }])], "date-over.csl.json", { type: "application/json" }));
  assert.equal(fourPartDate.blocked, true);
  assert.match(fourPartDate.findings[0].detail, /one to three/i);

  const urls = Array.from({ length: 20 }, (_, index) => `https://example.org/resource/${index + 1}`);
  const accepted = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Dataset", name: "URL array", url: urls })], "urls.jsonld", { type: "application/ld+json" }));
  assert.equal(accepted.blocked, false, accepted.summary);
  assert.deepEqual(accepted.records[0].links, urls);

  const tooMany = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Dataset", name: "URL overflow", url: [...urls, "https://example.org/resource/21"] })], "url-overflow.jsonld", { type: "application/ld+json" }));
  assert.equal(tooMany.blocked, true);
  assert.match(tooMany.findings[0].detail, /exceeds 20 links/i);
});

test("JSON quarantine preserves identity evidence and rejects deceptive JSON-LD semantics", async () => {
  for (const [source, name, expected] of [
    ['{"id":"first","\\u0069d":"second","title":"Lost identity"}', "duplicate.csl.json", /duplicate member name/i],
    ['{"id":"\\uD800","title":"Invalid scalar"}', "surrogate.csl.json", /unpaired Unicode surrogate/i],
    [JSON.stringify({ "@context": { "@vocab": "https://schema.org/" }, "@type": "Book", name: "Aliased" }), "object-context.jsonld", /supported.*schema\.org.*context/i],
    [JSON.stringify({ "@context": "https://attacker.invalid/context", "@type": "Book", name: "Remote" }), "remote-context.jsonld", /supported.*schema\.org.*context/i],
    [JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "Nested", author: { "@context": "https://attacker.invalid/context", name: "Forged" } }), "nested-context.jsonld", /nested.*context/i],
  ]) {
    const review = await reviewImport(new File([source], name, { type: name.endsWith("jsonld") ? "application/ld+json" : "application/json" }));
    assert.equal(review.blocked, true, `${name}: ${review.summary}`);
    assert.match(review.findings[0].detail, expected, name);
  }

  const cslWithType = await reviewImport(new File([JSON.stringify({ id: "CSL-TYPE-1", "@type": "article-journal", title: "CSL remains CSL" })], "typed.csl.json", { type: "application/json" }));
  assert.equal(cslWithType.blocked, false, cslWithType.summary);
  assert.equal(cslWithType.format, "csl-json");
  assert.equal(cslWithType.records[0].id, "CSL-TYPE-1");

  const numericCslId = await reviewImport(new File([JSON.stringify({ id: 123, title: "Numeric CSL identity" })], "numeric.csl.json", { type: "application/json" }));
  assert.equal(numericCslId.blocked, false, numericCslId.summary);
  assert.equal(numericCslId.records[0].id, "123");
  for (const item of [
    { id: ["A", "B"], title: "Array" },
    { Id: "ALIAS", title: "Case alias" },
    { "ｉｄ": "ALIAS", title: "NFKC ID alias" },
    { id: "SAFE", "ＤＯＩ": "10.1/fullwidth", title: "NFKC DOI alias" },
    { id: "SAFE", DOI: ["10.1/a"], title: "Wrong DOI" },
    { id: "SAFE", DOI: "10.1/a\u200b", title: "Format-controlled DOI" },
    { id: "SAFE", URL: "https://example.org/a\u2060b", title: "Format-controlled URL" },
    { id: "SAFE", "@id": "urn:in-keeping:CSL-SHADOW", title: "Cross-dialect @id" },
    { id: "SAFE", identifier: "CSL-SHADOW", title: "Cross-dialect identifier" },
    { id: "SAFE", author: [{ literal: "Name", "@ID": "urn:in-keeping:NESTED" }], title: "Nested JSON-LD identity alias" },
    { id: "SAFE", note: { "@i\u2066d": "urn:in-keeping:BIDI" }, title: "Bidi identity alias" },
    { id: "SAFE", "D\u200bOI": "10.1/deceptive", title: "Format-controlled CSL identity key" },
  ]) {
    const review = await reviewImport(new File([JSON.stringify(item)], "wrong.csl.json", { type: "application/json" }));
    assert.equal(review.blocked, true, review.summary);
  }

  const publicId = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org/", "@id": "https://example.org/item/1", "@type": "Book", name: "Public linked identity", identifier: ["LOCAL-A", "LOCAL-B"] })], "public.jsonld", { type: "application/ld+json" }));
  assert.equal(publicId.blocked, false, publicId.summary);
  assert.match(publicId.records[0].id, /^JSONLD-[a-f0-9]{12}-1$/);
  assert.deepEqual(publicId.records[0].links, ["https://example.org/item/1"]);
  assert.deepEqual(publicId.records[0].identifiers.map((item) => item.value), ["LOCAL-A", "LOCAL-B"]);

  const privateId = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@id": "URN:IN-KEEPING:JSONLD-PRIVATE", "@type": "Book", name: "Private identity" })], "private.jsonld", { type: "application/ld+json" }));
  assert.equal(privateId.blocked, false, privateId.summary);
  assert.equal(privateId.records[0].id, "JSONLD-PRIVATE");

  for (const key of ["＠id", "@ｉｄ", "@ID", "@i\u2066d", "@i\u200ed", "@\u200bid", "Identifier", "ＵＲＬ", "@Context", "＠graph"]) {
    const review = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "Identity alias", [key]: "urn:in-keeping:FORGED" })], "identity-alias.jsonld", { type: "application/ld+json" }));
    assert.equal(review.blocked, true, `${key}: ${review.summary}`);
    assert.match(review.findings[0].detail, /deceptive identity or declaration key|bidirectional controls/i, key);
  }
  const duplicateAlias = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@id": "urn:in-keeping:REAL", "@ID": "urn:in-keeping:FORGED", name: "Parallel alias" })], "parallel-alias.jsonld", { type: "application/ld+json" }));
  assert.equal(duplicateAlias.blocked, true);
  assert.match(duplicateAlias.findings[0].detail, /deceptive identity or declaration key/i);

  for (const key of ["@Context", "＠ｇｒａｐｈ", "@ID", "Identifier", "ＵＲＬ", "@i\u2066d", "@i\u200ed", "@\u200bid"]) {
    const nested = { "@context": "https://schema.org", "@type": "Book", name: "Nested identity alias", author: [{ name: "Visible author", [key]: "forged" }] };
    const review = await reviewImport(new File([JSON.stringify(nested)], "nested-alias.jsonld", { type: "application/ld+json" }));
    assert.equal(review.blocked, true, `${key}: ${review.summary}`);
    assert.match(review.findings[0].detail, /deceptive identity or declaration key|bidirectional controls/i, key);
  }

  const graph = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@graph": [
    { "@id": "urn:in-keeping:GRAPH-ONE", "@type": "Book", name: "Graph one" },
    { "@id": "urn:in-keeping:GRAPH-TWO", "@type": "Book", name: "Graph two" },
  ] })], "graph.jsonld", { type: "application/ld+json" }));
  assert.equal(graph.blocked, false, graph.summary);
  assert.deepEqual(graph.records.map((record) => record.id), ["GRAPH-ONE", "GRAPH-TWO"]);

  for (const source of [
    { "@context": "https://schema.org", "@graph": { "@type": "Book", name: "Wrong graph type" } },
    { "@context": "https://schema.org", "@graph": [{ "@context": "https://schema.org", "@type": "Book", name: "Redundant override" }] },
    { "@context": "https://schema.org", "@graph": [{ "@context": "https://attacker.invalid/context", "@type": "Book", name: "Hostile override" }] },
    { "@context": "https://schema.org", "@id": "urn:in-keeping:IGNORED-ROOT", "@graph": [{ "@type": "Book", name: "Root identity override" }] },
    { "@context": "https://schema.org", identifier: "IGNORED-ROOT", "@graph": [{ "@type": "Book", name: "Root identifier override" }] },
    { "@context": "https://schema.org", "@type": "Book", name: "Nested graph", author: { "@graph": [] } },
    { "@context": "https://schema.org", "@graph": [{ "@type": "Book", name: "Graph item", "@graph": [] }] },
  ]) {
    const review = await reviewImport(new File([JSON.stringify(source)], "graph-conflict.jsonld", { type: "application/ld+json" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.findings[0].detail, /@graph must be an array|may not override the root context|nested JSON-LD @graph|Unknown field/i);
  }

  const supportedIdentityObjects = await reviewImport(new File([JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Book",
    name: "Supported identity objects",
    identifier: [{ "@type": "PropertyValue", value: "10.5555/supported", propertyID: "doi" }, { "@value": "9780306406157", type: "isbn" }],
    url: { "@id": "https://example.org/supported" },
  })], "supported-identities.jsonld", { type: "application/ld+json" }));
  assert.equal(supportedIdentityObjects.blocked, false, supportedIdentityObjects.summary);
  assert.deepEqual(supportedIdentityObjects.records[0].identifiers.map((item) => item.scheme), ["doi", "isbn"]);
  assert.deepEqual(supportedIdentityObjects.records[0].links, ["https://example.org/supported"]);

  for (const identifier of [
    { value: "A", "@value": "B", propertyID: "local" },
    { value: "A", propertyID: "doi", type: "isbn" },
    { value: ["A", "B"], propertyID: "local" },
    { value: "A", propertyID: "" },
    { value: "A", type: "" },
    { value: "A", PropertyID: "doi" },
    { "@Value": "A", propertyID: "local" },
    { "@Type": "PropertyValue", value: "A", propertyID: "local" },
    { "@type": "Other", value: "A", propertyID: "local" },
    { value: "A", "property\u2066ID": "doi" },
    { value: "A", propertyID: "local", ignored: "forged" },
    { value: "A\u200b", propertyID: "local" },
    { value: "A", propertyID: "do\u2060i" },
    "urn:in-keeping:SHADOW-ID",
  ]) {
    const review = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "Identifier conflict", identifier })], "identifier-conflict.jsonld", { type: "application/ld+json" }));
    assert.equal(review.blocked, true, review.summary);
  }
  for (const url of [{ "@ID": "https://example.org/alias" }, { "@id": "https://example.org/extra", ignored: true }]) {
    const review = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "URL identity conflict", url })], "url-conflict.jsonld", { type: "application/ld+json" }));
    assert.equal(review.blocked, true, review.summary);
  }
  for (const control of ["\u200b", "\u2060", "\u200e"]) {
    for (const url of [`https://example.org/a${control}b`, { "@id": `https://example.org/a${control}b` }]) {
      const review = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "Format-controlled URL", url })], "format-url.jsonld", { type: "application/ld+json" }));
      assert.equal(review.blocked, true, review.summary);
      assert.match(review.findings[0].detail, /Unicode format|bidirectional control/i);
    }
  }

  const unicodeIdentifier = await reviewImport(new File([JSON.stringify({ "@context": "https://schema.org", "@type": "Book", name: "Visible Unicode identity", identifier: { value: "資料-α", propertyID: "local" } })], "unicode-identity.jsonld", { type: "application/ld+json" }));
  assert.equal(unicodeIdentifier.blocked, false, unicodeIdentifier.summary);
  assert.equal(unicodeIdentifier.records[0].identifiers[0].value, "資料-α");
});

test("singular catalog identities fail closed while standards-repeatable identifiers remain accepted", async () => {
  const duplicateRis = await reviewImport(new File(["TY  - BOOK\nID  - RIS-A\nID  - RIS-B\nTI  - Conflict\nER  - \n"], "duplicate-id.ris", { type: "application/x-research-info-systems" }));
  assert.equal(duplicateRis.blocked, true);
  assert.match(duplicateRis.findings[0].detail, /duplicate singular ID/i);
  const repeatableRis = await reviewImport(new File(["TY  - BOOK\nID  - RIS-OK\nTI  - Repeats\nDO  - 10.5555/one\nDO  - 10.5555/two\nSN  - 1234-5678\nSN  - 9780306406157\nER  - \n"], "repeatable.ris", { type: "application/x-research-info-systems" }));
  assert.equal(repeatableRis.blocked, false, repeatableRis.summary);
  assert.equal(repeatableRis.records[0].identifiers.length, 4);
  for (const tag of ["DO", "SN"]) {
    for (const empty of ["", "   "]) {
      const review = await reviewImport(new File([`TY  - BOOK\nID  - RIS-EMPTY\nTI  - Empty identifier\n${tag}  - ${empty}\nER  - \n`], `empty-${tag}.ris`, { type: "application/x-research-info-systems" }));
      assert.equal(review.blocked, true, `${tag}/${JSON.stringify(empty)}: ${review.summary}`);
      assert.match(review.findings[0].detail, new RegExp(`${tag} values must be nonempty`, "i"));
    }
  }
  for (const tag of ["ID", "DO", "SN"]) {
    for (const control of ["\u200b", "\u2060", "\u200e"]) {
      const review = await reviewImport(new File([`TY  - BOOK\n${tag === "ID" ? "" : "ID  - RIS-FORMAT\n"}TI  - Format control\n${tag}  - ${control}\nER  - \n`], `format-${tag}.ris`, { type: "application/x-research-info-systems" }));
      assert.equal(review.blocked, true, `${tag}/${control.codePointAt(0).toString(16)}: ${review.summary}`);
      assert.match(review.findings[0].detail, /Unicode format|bidirectional control/i);
    }
  }

  const leader = "00000nam a2200000 i 4500";
  const duplicateMnemonic = await reviewImport(new File([`=LDR  ${leader}\n=001  MARC-A\n=001  MARC-B\n=245  10$aConflict\n`], "duplicate.mrk", { type: "text/plain" }));
  assert.equal(duplicateMnemonic.blocked, true);
  assert.match(duplicateMnemonic.findings[0].detail, /duplicate singular 001/i);
  const duplicateMnemonicAgency = await reviewImport(new File([`=LDR  ${leader}\n=001  MARC-AGENCY\n=003  ORG-A\n=003  ORG-B\n=245  10$aConflict\n`], "duplicate-agency.mrk", { type: "text/plain" }));
  assert.equal(duplicateMnemonicAgency.blocked, true);
  assert.match(duplicateMnemonicAgency.findings[0].detail, /duplicate singular 003/i);
  for (const tag of ["001", "003"]) {
    for (const empty of ["   ", "\t", "\u00a0"]) {
      const identity = tag === "001" ? `=001  ${empty}` : `=001  MARC-EMPTY\n=003  ${empty}`;
      const review = await reviewImport(new File([`=LDR  ${leader}\n${identity}\n=245  10$aWhitespace identity\n`], `empty-${tag}.mrk`, { type: "text/plain" }));
      assert.equal(review.blocked, true, `${tag}/${JSON.stringify(empty)}: ${review.summary}`);
      assert.match(review.findings[0].detail, new RegExp(`${tag} must be nonempty`, "i"));
    }
  }
  for (const tag of ["001", "003"]) {
    for (const control of ["\u200b", "\u2060", "\u200e"]) {
      const identity = tag === "001" ? `=001  ${control}` : `=001  MARC-FORMAT\n=003  ${control}`;
      const review = await reviewImport(new File([`=LDR  ${leader}\n${identity}\n=245  10$aFormat-control identity\n`], `format-${tag}.mrk`, { type: "text/plain" }));
      assert.equal(review.blocked, true, `${tag}/${control.codePointAt(0).toString(16)}: ${review.summary}`);
      assert.match(review.findings[0].detail, /Unicode format|bidirectional control/i);
    }
  }
  const repeatedMnemonicFields = await reviewImport(new File([`=LDR  ${leader}\n=001  MARC-OK\n=003  ORG-A\n=245  10$aRepeatable fields\n=020  ##$a9780306406157\n=020  ##$a9781861972712\n=022  ##$a1234-5678\n=022  ##$a8765-4321\n=024  7#$a10.5555/one$2doi\n=024  7#$a10.5555/two$2doi\n`], "repeatable.mrk", { type: "text/plain" }));
  assert.equal(repeatedMnemonicFields.blocked, false, repeatedMnemonicFields.summary);
  assert.equal(repeatedMnemonicFields.records[0].identifiers.length, 6);
  for (const field of [
    "=020  ##$a9780306406157$a9781861972712",
    "=022  ##$a1234-5678$a8765-4321",
    "=024  7#$a10.5555/a$a10.5555/b$2doi",
    "=024  7#$a10.5555/a$2doi$2isbn",
    "=020  ##$A9780306406157",
    "=020  ##$a\u200b",
    "=022  ##$a",
    "=024  7#$a10.5555/a$2do\u2060i",
  ]) {
    const review = await reviewImport(new File([`=LDR  ${leader}\n=001  MARC-BAD\n=245  10$aConflict\n${field}\n`], "bad-identity.mrk", { type: "text/plain" }));
    assert.equal(review.blocked, true, `${field}: ${review.summary}`);
  }

  const marcXml = (body) => `<record xmlns="http://www.loc.gov/MARC21/slim"><leader>${leader}</leader>${body}<datafield tag="245" ind1="1" ind2="0"><subfield code="a">Identity</subfield></datafield></record>`;
  const duplicateMarcXml = await reviewImport(new File([marcXml('<controlfield tag="001">XML-A</controlfield><controlfield tag="001">XML-B</controlfield>')], "duplicate.marcxml", { type: "application/xml" }));
  assert.equal(duplicateMarcXml.blocked, true);
  assert.match(duplicateMarcXml.findings[0].detail, /duplicate singular 001/i);
  const duplicateMarcXmlAgency = await reviewImport(new File([marcXml('<controlfield tag="001">XML-AGENCY</controlfield><controlfield tag="003">ORG-A</controlfield><controlfield tag="003">ORG-B</controlfield>')], "duplicate-agency.marcxml", { type: "application/xml" }));
  assert.equal(duplicateMarcXmlAgency.blocked, true);
  assert.match(duplicateMarcXmlAgency.findings[0].detail, /duplicate singular 003/i);
  for (const tag of ["001", "003"]) {
    for (const control of ["\u200b", "\u2060", "\u200e"]) {
      const body = tag === "001"
        ? `<controlfield tag="001">${control}</controlfield>`
        : `<controlfield tag="001">XML-FORMAT</controlfield><controlfield tag="003">${control}</controlfield>`;
      const review = await reviewImport(new File([marcXml(body)], `format-${tag}.marcxml`, { type: "application/xml" }));
      assert.equal(review.blocked, true, `${tag}/${control.codePointAt(0).toString(16)}: ${review.summary}`);
      assert.match(review.findings[0].detail, /Unicode format|bidirectional control/i);
    }
  }
  const repeatableMarcXml = await reviewImport(new File([marcXml('<controlfield tag="001">XML-OK</controlfield><controlfield tag="003">ORG-A</controlfield><datafield tag="020" ind1=" " ind2=" "><subfield code="a">9780306406157</subfield></datafield><datafield tag="020" ind1=" " ind2=" "><subfield code="a">9781861972712</subfield></datafield><datafield tag="022" ind1=" " ind2=" "><subfield code="a">1234-5678</subfield></datafield><datafield tag="022" ind1=" " ind2=" "><subfield code="a">8765-4321</subfield></datafield><datafield tag="024" ind1="7" ind2=" "><subfield code="a">10.5555/one</subfield><subfield code="2">doi</subfield></datafield><datafield tag="024" ind1="7" ind2=" "><subfield code="a">10.5555/two</subfield><subfield code="2">doi</subfield></datafield>')], "repeatable.marcxml", { type: "application/xml" }));
  assert.equal(repeatableMarcXml.blocked, false, repeatableMarcXml.summary);
  assert.equal(repeatableMarcXml.records[0].identifiers.length, 6);
  for (const field of [
    '<datafield tag="020" ind1=" " ind2=" "><subfield code="a">9780306406157</subfield><subfield code="a">9781861972712</subfield></datafield>',
    '<datafield tag="022" ind1=" " ind2=" "><subfield code="a">1234-5678</subfield><subfield code="a">8765-4321</subfield></datafield>',
    '<datafield tag="024" ind1="7" ind2=" "><subfield code="a">10.5555/a</subfield><subfield code="a">10.5555/b</subfield><subfield code="2">doi</subfield></datafield>',
    '<datafield tag="024" ind1="7" ind2=" "><subfield code="a">10.5555/a</subfield><subfield code="2">doi</subfield><subfield code="2">isbn</subfield></datafield>',
    '<datafield tag="020" ind1=" " ind2=" "><subfield code="A">9780306406157</subfield></datafield>',
    '<datafield tag="020" ind1=" " ind2=" "><subfield code="a">\u200b</subfield></datafield>',
    '<datafield tag="022" ind1=" " ind2=" "><subfield code="a"></subfield></datafield>',
    '<datafield tag="024" ind1="7" ind2=" "><subfield code="a">10.5555/a</subfield><subfield code="2">do\u2060i</subfield></datafield>',
  ]) {
    const review = await reviewImport(new File([marcXml(`<controlfield tag="001">XML-BAD</controlfield>${field}`)], "bad-identity.marcxml", { type: "application/xml" }));
    assert.equal(review.blocked, true, `${field}: ${review.summary}`);
  }
});

test("MODS and Dublin Core private identity rules retain legitimate repeatable evidence", async () => {
  const mods = (body) => `<mods xmlns="http://www.loc.gov/mods/v3">${body}<titleInfo><title>Identity review</title></titleInfo></mods>`;
  for (const body of [
    "<recordInfo><recordIdentifier>MODS-A</recordIdentifier><recordIdentifier>MODS-B</recordIdentifier></recordInfo>",
    "<recordInfo><recordIdentifier>MODS-A</recordIdentifier></recordInfo><recordInfo><recordIdentifier>MODS-B</recordIdentifier></recordInfo>",
    "<recordInfo><recordIdentifier/></recordInfo>",
    "<recordInfo><recordIdentifier>   </recordIdentifier></recordInfo>",
    "<recordInfo><recordIdentifier>\u200b</recordIdentifier></recordInfo>",
    "<recordInfo><recordIdentifier>MODS\u2060HIDDEN</recordIdentifier></recordInfo>",
  ]) {
    const review = await reviewImport(new File([mods(body)], "conflict.mods.xml", { type: "application/xml" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.findings[0].detail, /contradictory recordIdentifier|duplicate singular recordInfo|recordIdentifier must be nonempty|Unicode format|bidirectional control/i);
  }
  const exactMods = await reviewImport(new File([mods("<recordInfo><recordIdentifier>MODS-SAME</recordIdentifier><recordIdentifier>MODS-SAME</recordIdentifier></recordInfo>")], "exact.mods.xml", { type: "application/xml" }));
  assert.equal(exactMods.blocked, false, exactMods.summary);
  assert.equal(exactMods.records[0].id, "MODS-SAME");
  assert.equal(exactMods.records[0].source.elements.filter((item) => item.code === "mods:recordInfo/recordIdentifier").length, 2);
  const genericMods = await reviewImport(new File([mods('<identifier type="doi">10.5555/one</identifier><identifier type="isbn">9780306406157</identifier><identifier type="isbn">9781861972712</identifier><identifier type="local">LOCAL-TWO</identifier>')], "generic.mods.xml", { type: "application/xml" }));
  assert.equal(genericMods.blocked, false, genericMods.summary);
  assert.match(genericMods.records[0].id, /^MODSXML-[a-f0-9]{12}-1$/);
  assert.deepEqual(genericMods.records[0].identifiers.map((item) => item.value), ["10.5555/one", "9780306406157", "9781861972712", "LOCAL-TWO"]);
  for (const identifier of ["\u200b", "LOCAL\u200eHIDDEN"]) {
    const review = await reviewImport(new File([mods(`<identifier type="local">${identifier}</identifier>`)], "format-identifier.mods.xml", { type: "application/xml" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.findings[0].detail, /Unicode format|bidirectional control/i);
  }

  const dc = (identifiers) => `<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Identity review</dc:title>${identifiers.map((value) => `<dc:identifier>${value}</dc:identifier>`).join("")}</oai_dc:dc>`;
  const duplicateDc = await reviewImport(new File([dc(["urn:in-keeping:DC-A", "URN:IN-KEEPING:DC-B"])], "duplicate.dc.xml", { type: "application/xml" }));
  assert.equal(duplicateDc.blocked, true);
  assert.match(duplicateDc.findings[0].detail, /duplicate private/i);
  const upperDc = await reviewImport(new File([dc(["URN:IN-KEEPING:DC-UPPER", "doi:10.5555/dc", "https://example.org/dc"])], "upper.dc.xml", { type: "application/xml" }));
  assert.equal(upperDc.blocked, false, upperDc.summary);
  assert.equal(upperDc.records[0].id, "DC-UPPER");
  assert.deepEqual(upperDc.records[0].identifiers, [{ scheme: "doi", value: "10.5555/dc" }]);
  const genericDc = await reviewImport(new File([dc(["LOCAL-ONE", "LOCAL-TWO"])], "generic.dc.xml", { type: "application/xml" }));
  assert.equal(genericDc.blocked, false, genericDc.summary);
  assert.match(genericDc.records[0].id, /^DCXML-[a-f0-9]{12}-1$/);
  assert.deepEqual(genericDc.records[0].identifiers.map((item) => item.value), ["LOCAL-ONE", "LOCAL-TWO"]);
  const lookalikeDc = await reviewImport(new File([dc(["ｕｒｎ：ｉｎ－ｋｅｅｐｉｎｇ：DC-LOOKALIKE"])], "lookalike.dc.xml", { type: "application/xml" }));
  assert.equal(lookalikeDc.blocked, true);
  assert.match(lookalikeDc.findings[0].detail, /Unicode lookalike/i);
  for (const identifier of ["", "   ", "\u200b", "LOCAL\u2060HIDDEN", "urn:in-keeping:DC\u200eHIDDEN"]) {
    const review = await reviewImport(new File([dc([identifier])], "format-control.dc.xml", { type: "application/xml" }));
    assert.equal(review.blocked, true, `${JSON.stringify(identifier)}: ${review.summary}`);
    assert.match(review.findings[0].detail, /must be nonempty|Unicode format|bidirectional control/i);
  }
  const unicodeDc = await reviewImport(new File([dc(["資料-α"])], "unicode.dc.xml", { type: "application/xml" }));
  assert.equal(unicodeDc.blocked, false, unicodeDc.summary);
  assert.equal(unicodeDc.records[0].identifiers[0].value, "資料-α");
});

test("RIS rejects malformed, unterminated, duplicate-type, and nonterminal end lines", async () => {
  const hostile = [
    ["TY  - BOOK\nTI  - Missing end\n", /does not end/i],
    ["TY  - BOOK\nthis line disappears\nER  - \n", /not a tagged field/i],
    ["\nTY  - BOOK\nTI  - Leading blank\nER  - \n", /unexpected blank line/i],
    ["TY  - BOOK\n\nTI  - Blank inside record\nER  - \n", /blank inside a record/i],
    ["TY  - BOOK\nTI  - Repeated separator\nER  - \n\n\nTY  - BOOK\nTI  - Next\nER  - \n", /at most one blank separator/i],
    ["TI  - Late type\nTY  - BOOK\nER  - \n", /must begin/i],
    ["TY  - BOOK\nTY  - JOUR\nTI  - Duplicate type\nER  - \n", /exactly one/i],
    ["TY  - BOOK\nTI  - End data\nER  - unexpected\nER  - \n", /ER must be the record terminator|data after ER/i],
  ];
  for (const [source, pattern] of hostile) {
    const review = await reviewImport(new File([source], "hostile.ris", { type: "application/x-research-info-systems" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.findings[0].detail, pattern);
  }
  const crlf = await reviewImport(new File(["TY  - BOOK\r\nID  - RIS-CRLF\r\nTI  - Complete\r\nER  - \r\n"], "crlf.ris", { type: "application/x-research-info-systems" }));
  assert.equal(crlf.blocked, false, crlf.summary);
  assert.equal(crlf.records[0].id, "RIS-CRLF");

  const separated = await reviewImport(new File(["TY  - BOOK\nID  - RIS-ONE\nTI  - First\nER  - \n\nTY  - BOOK\nID  - RIS-TWO\nTI  - Second\nER  - \n"], "separated.ris", { type: "application/x-research-info-systems" }));
  assert.equal(separated.blocked, false, separated.summary);
  assert.deepEqual(separated.records.map((record) => record.id), ["RIS-ONE", "RIS-TWO"]);

  const ordered = await reviewImport(new File(["TY  - BOOK\nAU  - First creator\nA1  - Second creator\nAU  - Third creator\nTI  - Complete\nER  - \n"], "ordered.ris", { type: "application/x-research-info-systems" }));
  assert.equal(ordered.blocked, false, ordered.summary);
  assert.deepEqual(ordered.records[0].creators, ["First creator", "Second creator", "Third creator"]);
  assert.deepEqual(ordered.records[0].source.elements.filter((item) => item.code === "AU" || item.code === "A1").map((item) => item.value), ["First creator", "Second creator", "Third creator"]);

  const boundedFields = `TY  - BOOK\nTI  - Boundary\n${"Z1  - retained\n".repeat(1021)}ER  - \n`;
  const boundary = await reviewImport(new File([boundedFields], "boundary.ris", { type: "application/x-research-info-systems" }));
  assert.equal(boundary.blocked, false, boundary.summary);
  assert.equal(boundary.records[0].source.elements.length, 1024);
  const overflow = await reviewImport(new File([boundedFields.replace("ER  - ", "Z1  - overflow\nER  - ")], "overflow.ris", { type: "application/x-research-info-systems" }));
  assert.equal(overflow.blocked, true);
  assert.match(overflow.findings[0].detail, /exceeds 1,024 retained source elements/i);
});

test("MARC mnemonic rejects every malformed line and round-trips escaped delimiters", async () => {
  const hostile = [
    ["=001  NO-LEADER\n=245  10$aTitle\n", /before a valid.*leader/i],
    ["\n=LDR  00000nam a2200000 i 4500\n=001  LEADING-BLANK\n", /unexpected blank line/i],
    ["=LDR  00000nam a2200000 i 4500\n=001  BLANK-IN-RECORD\n\n=245  10$aTitle\n", /before a valid.*leader/i],
    ["=LDR  00000nam a2200000 i 4500\n=001  REPEATED-BLANK\n\n\n=LDR  00000nam a2200000 i 4500\n=001  NEXT\n", /at most one blank separator/i],
    ["=LDR\t\t00000nam a2200000 i 4500\n=245  10$aTitle\n", /before a valid.*leader/i],
    ["=LDR  XXXXXXXXXXXXXXXXXXXXXXXX\n=245  10$aTitle\n", /invalid.*MARC21 leader/i],
    ["=LDR  00000nam a2200000 i 4500\n=000  value\n=245  10$aTitle\n", /invalid control field tag/i],
    ["=LDR  00000nam a2200000 i 4500\n=001  MIDDLE\nnot a MARC line\n=245  10$aTitle\n", /line 3 is malformed/i],
    ["=LDR  00000nam a2200000 i 4500\n=245  10discarded$aTitle\n", /text before.*first subfield/i],
    ["=LDR  00000nam a2200000 i 4500\n=245  10Title without a subfield\n", /text before.*first subfield|no subfield/i],
    ["=LDR  00000nam a2200000 i 4500\n=245  10$?Title\n", /invalid subfield code/i],
  ];
  for (const [source, pattern] of hostile) {
    const review = await reviewImport(new File([source], "hostile.mrk", { type: "text/plain" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.findings[0].detail, pattern);
  }

  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.id = "MARC.ESCAPE-1";
  record.title = "Price $5 \\ preservation";
  const source = formatRecords([record], "marc-text");
  const review = await reviewImport(new File([source], "roundtrip.mrk", { type: "text/plain" }));
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.records[0].title, record.title);
  assert.equal(review.records[0].id, record.id);

  const semantic = await reviewImport(new File(["=LDR  00000ngm a2200000 i 4500\n=001  MARC-SEMANTIC-1\n=245  10$aAlpha$bBeta$aGamma\n=100  1#$aPrimary creator\n=700  1#$aContributing editor$eeditor\n=700  1#$aAdditional creator$ecreator\n=024  7#$a10.5555/marc.semantic$2doi\n=655  #0$aBook\n"], "semantic.mrk", { type: "text/plain" }));
  assert.equal(semantic.blocked, false, semantic.summary);
  assert.equal(semantic.records[0].format, "Video", "an uncontrolled 655 must not override the leader");
  assert.equal(semantic.records[0].title, "Alpha Beta Gamma");
  assert.deepEqual(semantic.records[0].creators, ["Primary creator", "Additional creator"]);
  assert.deepEqual(semantic.records[0].contributors, ["Contributing editor"]);
  assert.deepEqual(semantic.records[0].identifiers, [{ scheme: "doi", value: "10.5555/marc.semantic" }]);
  assert.deepEqual(semantic.records[0].source.elements.filter((item) => item.code.startsWith("245 ")).map((item) => item.value), ["Alpha", "Beta", "Gamma"]);

  const controlledType = await reviewImport(new File(["=LDR  00000ngm a2200000 i 4500\n=001  MARC-CONTROLLED-1\n=245  10$aControlled local type\n=655  #7$aBook$2in-keeping\n"], "controlled.mrk", { type: "text/plain" }));
  assert.equal(controlledType.blocked, false, controlledType.summary);
  assert.equal(controlledType.records[0].format, "Book");

  const boundedMarc = `=LDR  00000nam a2200000 i 4500\n=001  MARC-BOUNDARY\n=245  10$aBoundary\n=999  ##${"$zretained".repeat(1021)}\n`;
  const marcBoundary = await reviewImport(new File([boundedMarc], "boundary.mrk", { type: "text/plain" }));
  assert.equal(marcBoundary.blocked, false, marcBoundary.summary);
  assert.equal(marcBoundary.records[0].source.elements.length, 1024);
  const marcOverflow = await reviewImport(new File([boundedMarc.replace(/\n$/, "$zoverflow\n")], "overflow.mrk", { type: "text/plain" }));
  assert.equal(marcOverflow.blocked, true);
  assert.match(marcOverflow.findings[0].detail, /exceeds 1,024 retained source elements/i);
});

test("bounded BibTeX parsing supports nesting and rejects executable grammar", async () => {
  const acceptedSource = `% leading comment\n@book(BIB.NESTED-1,\n title = {A {Deeply {Nested}} Title},\n author = {{Research and Development Office} and {Smith, Ada}},\n note = "Quoted, multiline\nvalue",\n year = 2026\n)`;
  const accepted = await reviewImport(new File([acceptedSource], "nested.bib", { type: "application/x-bibtex" }));
  assert.equal(accepted.blocked, false, accepted.summary);
  assert.deepEqual(accepted.records[0].creators, ["Research and Development Office", "Smith, Ada"]);
  assert.equal(accepted.records[0].metadata.notes[0], "Quoted, multiline\nvalue");
  assert.ok(accepted.records[0].source.elements.some((item) => item.code === "citation-key" && item.value === "BIB.NESTED-1"));

  const quotedBoundarySource = `@book{BIB-QUOTED-64,title="${"{".repeat(64)}balanced${"}".repeat(64)}"}`;
  const quotedBoundary = await reviewImport(new File([quotedBoundarySource], "quoted-boundary.bib", { type: "application/x-bibtex" }));
  assert.equal(quotedBoundary.blocked, false, quotedBoundary.summary);

  const customFields = (count) => Array.from({ length: count }, (_, index) => `f${index.toString(36)}={x}`).join(",");
  const fieldBoundary = await reviewImport(new File([`@misc{BIB-FIELDS-1022,title={Boundary},${customFields(1021)}}`], "field-boundary.bib", { type: "application/x-bibtex" }));
  assert.equal(fieldBoundary.blocked, false, fieldBoundary.summary);
  assert.equal(fieldBoundary.records[0].source.elements.length, 1024);
  const fieldOverflow = await reviewImport(new File([`@misc{BIB-FIELDS-1023,title={Overflow},${customFields(1022)}}`], "field-overflow.bib", { type: "application/x-bibtex" }));
  assert.equal(fieldOverflow.blocked, true);
  assert.match(fieldOverflow.findings[0].detail, /exceeds 1022 fields/i);

  const hostile = [
    ["@string{month = {August}}\n@book{BIB-1,title={Title}}", /directives are not accepted/i],
    ["@book{BIB-1,title=month}", /macros and concatenation/i],
    ["@book{BIB-1,title={A} # {B}}", /concatenation is not accepted/i],
    ["@book{BIB-1,title={A},title={B}}", /duplicated/i],
    ["@book{BIB-1,title={Unterminated}", /entry delimiter|field name|not terminated/i],
    [`@book{BIB-1,title={${"{".repeat(64)}deep${"}".repeat(64)}}}`, /nesting exceeds/i],
    [`@book{BIB-1,title={${"x".repeat(8193)}}}`, /8,192/i],
    [`@book{BIB-1,title="${"{".repeat(65)}deep${"}".repeat(65)}"}`, /nesting exceeds/i],
    ["@book{BIB-1,title=\"A {{{ malformed\"}", /unbalanced braces/i],
    [`@${"entrytype".repeat(5)}{BIB-1,title={Title}}`, /entry type exceeds 32/i],
    [`@book{BIB-1,${"fieldname".repeat(8)}={Title}}`, /field name exceeds 64/i],
    ["@book{unsafe key,title={Title}}", /citation keys must use/i],
    ["@book{BIB-1,title={Title}} trailing", /unexpected text/i],
  ];
  for (const [source, pattern] of hostile) {
    const review = await reviewImport(new File([source], "hostile.bib", { type: "application/x-bibtex" }));
    assert.equal(review.blocked, true, review.summary);
    assert.match(review.findings[0].detail, pattern);
  }
});

test("BibTeX comments recognize CR, LF, and CRLF without hiding later records", async () => {
  for (const lineEnding of ["\n", "\r", "\r\n"]) {
    const source = `% leading comment${lineEnding}@book{BIB-FIRST,title={First}}${lineEnding}% between records${lineEnding}@book{BIB-SECOND,title={Second}}${lineEnding}% terminal comment`;
    const review = await reviewImport(new File([source], "comments.bib", { type: "application/x-bibtex" }));
    assert.equal(review.blocked, false, `${JSON.stringify(lineEnding)}: ${review.summary}`);
    assert.deepEqual(review.records.map((record) => record.id), ["BIB-FIRST", "BIB-SECOND"]);
  }
});

test("BibTeX serializer and bounded parser preserve safe keys, names, and special text", async () => {
  const workspace = await createFixtureWorkspace();
  const record = structuredClone(activeRevision(workspace).records[0]);
  record.id = "A.B";
  record.title = "Slash \\ braces {} percent % hash # dollar $ ampersand & underscore _ tilde ~ caret ^\nsecond line";
  record.creators = ["Research and Development Office", "Curator {A} \\ Team"];
  record.contributors = ["Editor & Co."];
  const source = formatRecords([record], "bibtex");
  assert.match(source, /\{A\.B,/);
  const review = await reviewImport(new File([source], "roundtrip.bib", { type: "application/x-bibtex" }));
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.records[0].id, record.id);
  assert.equal(review.records[0].title, record.title);
  assert.deepEqual(review.records[0].creators, record.creators);
  assert.deepEqual(review.records[0].contributors, record.contributors);
});

test("tabular exchange rejects unknown columns and unterminated quotes", async () => {
  const unknown = await reviewImport(new File(["title,html\nSafe,<script>\n"], "bad.csv", { type: "text/csv" }));
  assert.equal(unknown.blocked, true);
  assert.match(unknown.summary, /Unknown delimited column/);
  const quoted = await reviewImport(new File(['title,creators\n"Open,Rowan'], "bad.csv", { type: "text/csv" }));
  assert.equal(quoted.blocked, true);
  assert.match(quoted.summary, /unterminated/i);
});
