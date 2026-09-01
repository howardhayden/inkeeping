import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBlankWorkspace,
  createFixtureWorkspace,
  activeRevision,
  recordEvidenceDisposition,
  recordWorkspaceAction,
  removeServiceRecord,
  updateConfig,
  upsertServiceRecord,
} from "../app/lab-core.ts";
import {
  makePublicNoticeHtml,
  makeTechnicalReportHtml,
  PUBLIC_NOTICE_FILENAME,
  REPORT_MIME,
  TECHNICAL_REPORT_FILENAME,
} from "../app/report-documents.ts";
import { REPORT_JOST_FONTS } from "../app/report-fonts.ts";
import { makeArchiveSchema } from "../app/archival-schemas.ts";

const GENERATED_AT = "2026-08-20T21:45:00.000Z";

async function createPublishableWorkspace() {
  let workspace = await createFixtureWorkspace();
  for (const record of [...(activeRevision(workspace).serviceRecords ?? [])]) {
    workspace = await removeServiceRecord(workspace, record.id);
  }
  workspace.incidents.forEach((incident) => { incident.synthetic = false; });
  return recordWorkspaceAction(workspace, "Prepare publishable report fixture");
}

test("report artifacts use stable HTML file contracts", () => {
  assert.equal(TECHNICAL_REPORT_FILENAME, "in-keeping-technical-report.html");
  assert.equal(PUBLIC_NOTICE_FILENAME, "in-keeping-public-notice.html");
  assert.equal(REPORT_MIME, "text/html;charset=utf-8");
});

test("embedded report fonts exactly match the licensed site assets", async () => {
  const fixtures = [
    ["latin", "../public/fonts/jost-latin.woff2"],
    ["latinExt", "../public/fonts/jost-latin-ext.woff2"],
    ["cyrillic", "../public/fonts/jost-cyrillic.woff2"],
  ];
  for (const [key, path] of fixtures) {
    const asset = await readFile(new URL(path, import.meta.url));
    const embedded = Buffer.from(REPORT_JOST_FONTS[key], "base64");
    assert.deepEqual(embedded, asset);
  }
});

test("technical report is a bounded active-state post-run notebook document", async () => {
  const workspace = await createFixtureWorkspace();
  const report = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);

  assert.ok(report.startsWith("<!doctype html>"));
  assert.ok(report.endsWith("</html>"));
  assert.match(report, /<html lang="en">/);
  assert.match(report, /<title>[^<]+Technical report<\/title>/);
  assert.match(report, /data-document-format="post-jupyter-html"/);
  assert.equal((report.match(/class="jp-Cell"/g) ?? []).length, 15);
  assert.match(report, /Document control/);
  assert.match(report, /Software execution boundary/);
  assert.match(report, /Inventory and interoperability/);
  assert.match(report, /Complete finding register/);
  assert.match(report, /Evidence disposition register/);
  assert.match(report, /Incident register/);
  assert.match(report, /Archive schema register/);
  assert.match(report, /Catalog records — original input and new output/);
  assert.match(report, /Archive records — entered active values and canonical active records/);
  assert.match(report, /Service register — entered active values and canonical active records/);
  assert.match(report, /Data and record-type formatting/);
  assert.match(report, /Configuration register/);
  assert.match(report, /Recovery and audit/);
  assert.match(report, /Safeguards and recovery/);
  assert.match(report, /Production boundaries/);
  assert.match(report, /Audit chain<\/dt><dd>Internally consistent/);
  assert.match(report, /Original source elements and accessible definitions/);
  assert.match(report, /Canonical catalog record as JSON/);
  assert.match(report, /Entered active service values as JSON/);
  assert.match(report, /Canonical service record as JSON/);
  assert.match(report, /Historical revision payloads remain in the plaintext workspace backup/);
  assert.match(report, /Service-register field-type formatting rules/);
  assert.match(report, /Safeguard and residual-risk register/);
  assert.match(report, /Workspace data boundary/);
  assert.match(report, /Current-state binding/);
  assert.match(report, /Linked-event verification/);
  assert.match(report, /there are no telemetry, analytics, cookies, or background-upload paths/);
  assert.match(report, /A separately retained checkpoint can detect a regenerated saved history/);
  assert.match(report, /comparison with an independently held receipt/);
  assert.match(report, /IN KEEPING · Library systems continuity/);
  assert.doesNotMatch(report, /undefined|\[object Object\]/);
});

test("notebook reports embed Jost, site colors, and an offline CSP", async () => {
  const workspace = await createBlankWorkspace();
  const technical = await makeTechnicalReportHtml(workspace, "idle", GENERATED_AT);
  const notice = await makePublicNoticeHtml(workspace, GENERATED_AT);

  for (const report of [technical, notice]) {
    assert.match(report, /data:font\/woff2;base64,/);
    assert.match(report, /font-family:Jost/);
    assert.match(report, /font-license[^>]+SIL Open Font License 1\.1/);
    assert.match(report, /--green:#0b4705/);
    assert.match(report, /--red:#950f22/);
    assert.match(report, /default-src 'none'/);
    assert.match(report, /script-src 'none'/);
    assert.match(report, /connect-src 'none'/);
    assert.match(report, /font-src data:/);
    assert.match(report, /object-src 'none'/);
    assert.match(report, /frame-src 'none'/);
    assert.match(report, /base-uri 'none'/);
    assert.match(report, /form-action 'none'/);
    assert.match(report, /IN KEEPING post-run notebook renderer/);
    assert.doesNotMatch(report, /<script\b|<link\b|<base\b|<iframe\b|<object\b|<embed\b|<form\b/i);
    assert.doesNotMatch(report, /(?:src|href)=["']https?:|@import|url\(["']?https?:/i);
  }
});

test("all software diagrams are semantic linear flows with no crossing edges", async () => {
  const workspace = await createPublishableWorkspace();
  const technical = await makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);
  const notice = await makePublicNoticeHtml(workspace, GENERATED_AT);

  assert.match(technical, /Import trust boundary/);
  assert.match(technical, /Catalog lane/);
  assert.match(technical, /Archives lane/);
  assert.match(technical, /Service lane/);
  assert.match(technical, /Named-workspace save path/);
  assert.match(technical, /Recovery path/);
  assert.match(technical, /Workspace data boundary/);
  assert.match(technical, /Current-state binding/);
  assert.match(technical, /Linked-event verification/);
  assert.match(notice, /Private-to-public projection/);
  assert.match(notice, /Access assistance path/);

  for (const report of [technical, notice]) {
    const figures = report.match(/<figure class="diagram"[\s\S]*?<\/figure>/g) ?? [];
    assert.ok(figures.length >= 2);
    for (const figure of figures) {
      assert.match(figure, /<figcaption id="[^"]+">[^<]+<\/figcaption>/);
      assert.equal((figure.match(/<ol class="diagram-flow"/g) ?? []).length, 1);
      assert.ok((figure.match(/<li><span>/g) ?? []).length >= 4);
    }
    assert.doesNotMatch(report, /<svg\b|<path\b|<line\b|<canvas\b/i);
  }
});

test("technical dynamic values are escaped without creating executable markup", async () => {
  const workspace = await createFixtureWorkspace();
  workspace.name = 'Alpha </title><script id="owned">alert(1)</script> & "Lab"';
  workspace.incidents[0].title = '<img src=x onerror="alert(2)"> incident';
  workspace.incidents[0].notes = ["<svg onload=alert(3)>"];
  workspace.incidents[0].evidence = ["A&B <unsafe>"];

  const report = await makeTechnicalReportHtml(workspace, "invalid", GENERATED_AT);
  assert.equal((report.match(/<script\b/g) ?? []).length, 0);
  assert.equal((report.match(/<img\b/g) ?? []).length, 0);
  assert.equal((report.match(/<svg\b/g) ?? []).length, 0);
  assert.match(report, /Alpha &lt;\/title&gt;&lt;script id=&quot;owned&quot;&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Lab&quot;/);
  assert.match(report, /&lt;img src=x onerror=&quot;alert\(2\)&quot;&gt; incident/);
  assert.match(report, /A&amp;B &lt;unsafe&gt;/);
  assert.match(report, /Mismatch detected/);
});

test("technical report DOM identifiers remain unique after lossy ID normalization", async () => {
  const workspace = await createFixtureWorkspace();
  const revision = workspace.revisions.find((item) => item.id === workspace.activeRevisionId);
  revision.records[0].id = "A:B";
  revision.records[1].id = "A-B";
  revision.serviceRecords[0].id = "S:A";
  revision.serviceRecords[1].id = "S-A";
  const firstSchema = makeArchiveSchema("blank", "First schema", "Q:A", GENERATED_AT);
  const secondSchema = makeArchiveSchema("blank", "Second schema", "Q-A", GENERATED_AT);
  revision.archiveSchemas = [firstSchema, secondSchema];
  const report = await makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);
  const ids = [...report.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const idSet = new Set(ids);
  for (const match of report.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(idSet.has(id), id);
  }
});

test("public notice uses a fixed projection and cannot carry internal evidence", async () => {
  let workspace = await createPublishableWorkspace();
  const initialRevision = workspace.revisions.find((item) => item.id === workspace.activeRevisionId);
  assert.ok(initialRevision);
  workspace.name = "PRIVATE-WORKSPACE-SENTINEL";
  workspace.incidents[0].service = "PRIVATE-SERVICE-SENTINEL";
  workspace.incidents[0].title = "PRIVATE-TITLE-SENTINEL";
  workspace.incidents[0].ownerRole = "PRIVATE-OWNER-SENTINEL";
  workspace.incidents[0].nextAction = "PRIVATE-NEXT-SENTINEL";
  workspace.incidents[0].evidence = ["PRIVATE-EVIDENCE-SENTINEL"];
  workspace.incidents[0].notes = ["PRIVATE-NOTE-SENTINEL"];
  workspace = await updateConfig(workspace, {
    ...initialRevision.config,
    resolverBase: "https://private-resolver-sentinel.example.org/openurl",
    proxyPrefix: "https://private-proxy-sentinel.example.org/login?url=",
    defaultPickupLocation: "PRIVATE-PICKUP-SENTINEL",
  });
  const revision = workspace.revisions.find((item) => item.id === workspace.activeRevisionId);
  assert.ok(revision);

  const report = await makePublicNoticeHtml(workspace, GENERATED_AT);
  assert.match(report, /Library service update/);
  assert.match(report, /Library service/);
  assert.match(report, /public file excludes catalog and archive records, service-register fields/i);
  for (const sentinel of [
    "PRIVATE-WORKSPACE-SENTINEL",
    "PRIVATE-RESOLVER-SENTINEL",
    "PRIVATE-PROXY-SENTINEL",
    "PRIVATE-SERVICE-SENTINEL",
    "PRIVATE-TITLE-SENTINEL",
    "PRIVATE-OWNER-SENTINEL",
    "PRIVATE-NEXT-SENTINEL",
    "PRIVATE-EVIDENCE-SENTINEL",
    "PRIVATE-NOTE-SENTINEL",
    revision.id,
    revision.digest,
    workspace.incidents[0].id,
  ]) {
    assert.equal(report.toLowerCase().includes(sentinel.toLowerCase()), false);
  }

  const fixture = await createFixtureWorkspace();
  const serviceRecord = structuredClone(activeRevision(fixture).serviceRecords[0]);
  serviceRecord.values.scope = "PRIVATE-SERVICE-REGISTER-SENTINEL";
  workspace = await upsertServiceRecord(workspace, serviceRecord);
  await assert.rejects(
    () => makePublicNoticeHtml(workspace, GENERATED_AT),
    /locally entered service record.*do(?:es)? not establish truth or authority/i,
  );
});

test("blank reports retain explicit zero states without implying an all-clear", async () => {
  const workspace = await createBlankWorkspace();
  const technical = await makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);
  const notice = await makePublicNoticeHtml(workspace, GENERATED_AT);

  assert.match(technical, /Review required/);
  assert.match(technical, /No metadata or access findings/);
  assert.match(technical, /No incidents were present/);
  assert.match(technical, /No archival schemas were present/);
  assert.match(technical, /No service records were present/);
  assert.match(technical, /Internally consistent; not authenticated/);
  assert.match(notice, /No active incident is recorded in this workspace/);
  assert.match(notice, /No affected services are currently listed/);
});

test("caller-declared audit state cannot override report self-validation", async () => {
  const workspace = await createBlankWorkspace();
  const callerInvalid = await makeTechnicalReportHtml(workspace, "invalid", GENERATED_AT);
  const callerUnchecked = await makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);

  assert.equal(callerInvalid, callerUnchecked);
  assert.match(callerInvalid, /Review required/);
  assert.doesNotMatch(callerInvalid, /No active exceptions/);
  assert.match(callerInvalid, /Internally consistent; not authenticated/);
  assert.match(callerInvalid, /only (?:the )?information present in this workspace/i);
  assert.match(callerInvalid, /absence of a record is not evidence/i);
  assert.doesNotMatch(callerUnchecked, /status-ok/);
});

test("report generators do not trust caller-declared validity for a tampered snapshot", async () => {
  const workspace = await createBlankWorkspace("Validated workspace");
  workspace.name = "Substituted authority";

  const technical = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT, { savedCopyStatus: "current" });
  assert.match(technical, /Action required/);
  assert.match(technical, /Mismatch detected/);
  assert.doesNotMatch(technical, /No active exceptions/);
  await assert.rejects(async () => makePublicNoticeHtml(workspace, GENERATED_AT), /validation|integrity|invalid/i);
});

test("clean and service-register status remains scoped to what this workspace records", async () => {
  const blank = await createBlankWorkspace();
  const localOnly = await makeTechnicalReportHtml(blank, "valid", GENERATED_AT, { savedCopyStatus: "current", continuityStatus: "continuity-verified-local", continuityReason: "Matching local checkpoint; authenticity is not established." });
  assert.match(localOnly, /Review required/);
  assert.match(localOnly, /Local comparison only/);
  assert.doesNotMatch(localOnly, /No active exceptions recorded in this workspace/);

  const receiptOnly = await makeTechnicalReportHtml(blank, "valid", GENERATED_AT, { savedCopyStatus: "current", continuityStatus: "continuity-corroborated", continuityReason: "Exact unsigned local comparison receipt compared." });
  assert.match(receiptOnly, /Review required/);
  assert.match(receiptOnly, /unsigned receipts are diagnostic/i);
  assert.doesNotMatch(receiptOnly, /No active exceptions recorded in this workspace/);

  const clean = await makeTechnicalReportHtml(blank, "valid", GENERATED_AT, { savedCopyStatus: "current", continuityStatus: "continuity-corroborated", continuityReason: "Exact unsigned local comparison receipt compared.", externalContinuity: { status: "trusted-match", reason: "Exact signed checkpoint correspondence under the supplied current policy pin.", witnessDigest: "a".repeat(64), policyId: "TEST-POLICY", policyRevision: 3, policyDigest: "b".repeat(64), topology: { status: "corroborated-at-checkpoint", sequence: ["a".repeat(64)], branchHeads: ["a".repeat(64)], findings: [], terminalWitnessDigest: "a".repeat(64) } } });
  assert.match(clean, /No active exceptions recorded in this workspace/);
  assert.doesNotMatch(clean, /class="status-banner status-ok"/);
  assert.match(clean, /Caller or interface reports that this session matches a named saved version/);
  assert.match(clean, /did not independently verify browser-storage freshness/);

  let blockedWorkspace = await createBlankWorkspace();
  const fixture = await createFixtureWorkspace();
  const serviceRecord = structuredClone(fixture.revisions.at(-1).serviceRecords[0]);
  serviceRecord.state = "blocked";
  blockedWorkspace = await upsertServiceRecord(blockedWorkspace, serviceRecord);
  const blocked = await makeTechnicalReportHtml(blockedWorkspace, "valid", GENERATED_AT, { savedCopyStatus: "current" });
  assert.match(blocked, /Action required/);

  serviceRecord.state = "review";
  blockedWorkspace = await upsertServiceRecord(blockedWorkspace, serviceRecord);
  const review = await makeTechnicalReportHtml(blockedWorkspace, "valid", GENERATED_AT, { savedCopyStatus: "current" });
  assert.match(review, /Review required/);
});

test("technical reports expose unverified evidence decisions and continuity limitations", async () => {
  const blank = await createBlankWorkspace("Evidence-limited report");
  const workspace = await recordEvidenceDisposition(blank, {
    source: { kind: "workspace-history", filename: "fabricated.json", format: "workspace-backup-v2", bytes: 128, sha256: "a".repeat(64) },
    review: { structuralStatus: "passed", canonicalPayloadSha256: "b".repeat(64), parserProfile: "workspace-backup-v2" },
    scope: { kind: "workspace", entityIds: [blank.activeRevisionId] },
  }, {
    decision: "admit-unverified", claimedOrigin: "unknown", custodyNote: "No independently established custody path.", actorRoleClaim: "Replacement operator", rationale: "Retain for diagnosis only.", policyReference: "INCIDENT-42", atBrowser: GENERATED_AT, timeBasis: "browser-clock-untrusted",
  }, "Open fabricated history as unverified evidence");
  const report = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT, { savedCopyStatus: "current", continuityStatus: "unanchored", continuityReason: "No independent checkpoint." });

  assert.match(report, /Evidence disposition register/);
  assert.match(report, /fabricated\.json/);
  assert.match(report, /admit-unverified/);
  assert.match(report, /No independently established custody path/);
  assert.match(report, /unverified evidence/i);
  assert.match(report, /same-origin anchors and unsigned receipts are diagnostic/i);
  assert.match(report, /no purely browser-local state can supply that authority/i);
  assert.doesNotMatch(report, /No active exceptions recorded in this workspace/);
  await assert.rejects(makePublicNoticeHtml(workspace, GENERATED_AT), /unverified evidence admission|unverified or unattributed/i);
});

test("a later withdrawal cannot hide an earlier evidence admission from reports or Public Notice gating", async () => {
  const blank = await createBlankWorkspace("Withdrawn evidence report");
  const evidence = {
    source: { kind: "workspace-history", filename: "disputed.json", format: "workspace-backup-v2", bytes: 128, sha256: "c".repeat(64) },
    review: { structuralStatus: "passed", canonicalPayloadSha256: "d".repeat(64), parserProfile: "workspace-backup-v2" },
    scope: { kind: "workspace", entityIds: [blank.activeRevisionId] },
  };
  let workspace = await recordEvidenceDisposition(blank, evidence, {
    decision: "admit-unverified", claimedOrigin: "unknown", custodyNote: "No independently established custody path.", actorRoleClaim: "Replacement operator", rationale: "Retain for diagnosis only.", policyReference: "INCIDENT-43", atBrowser: GENERATED_AT, timeBasis: "browser-clock-untrusted",
  }, "Admit disputed history as unverified");
  workspace = await recordEvidenceDisposition(workspace, evidence, {
    decision: "withdraw", claimedOrigin: "unknown", custodyNote: "The admission claim was withdrawn without deleting retained content.", actorRoleClaim: "Replacement operator", rationale: "A conflicting source appeared.", policyReference: "INCIDENT-43", atBrowser: "2026-08-31T13:35:00.000Z", timeBasis: "browser-clock-untrusted",
  }, "Withdraw disputed evidence claim");

  const report = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT, { savedCopyStatus: "current", continuityStatus: "continuity-verified-local", continuityReason: "Local checkpoint matches; authenticity is not established." });
  assert.match(report, /withdrawal alone cannot launder retained active content/i);
  assert.match(report, />withdraw<\/td>/);
  await assert.rejects(makePublicNoticeHtml(workspace, GENERATED_AT), /unverified evidence admission|unverified or unattributed/i);
});

test("technical report handling does not downgrade restricted content", async () => {
  let workspace = await createBlankWorkspace("Restricted report");
  const fixture = await createFixtureWorkspace();
  const restricted = structuredClone(fixture.revisions.at(-1).serviceRecords[0]);
  restricted.id = "SRV-RESTRICTED";
  restricted.title = "Restricted custody details";
  restricted.sensitivity = "restricted";
  workspace = await upsertServiceRecord(workspace, restricted);

  const report = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT, { savedCopyStatus: "current" });
  assert.match(report, /Potentially restricted staff record — classify at highest included sensitivity before sharing/);
  assert.doesNotMatch(report, /<strong>Staff operational record<\/strong>/);
  assert.match(report, />restricted<\/td>/);
});

test("unsupported resolved incidents cannot disappear from truthful outputs", async () => {
  let workspace = await createPublishableWorkspace();
  workspace.incidents.forEach((incident) => {
    incident.state = "resolved";
    incident.ownerRole = "Service owner";
    incident.notes = ["Closure evidence was reviewed."];
  });
  workspace.incidents[0].ownerRole = "Unassigned";
  workspace.incidents[0].notes = [];
  workspace = await recordWorkspaceAction(workspace, "Bind unsupported legacy closure fixture");

  const technical = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);
  assert.match(technical, /Action required/);
  assert.match(technical, /closure evidence.*missing|unsupported closure/i);
  await assert.rejects(() => makePublicNoticeHtml(workspace, GENERATED_AT), /closure evidence/i);

  workspace.incidents[0].ownerRole = "Service owner";
  workspace.incidents[0].notes = ["Closure evidence was reviewed."];
  workspace.incidents[0].nextAction = "";
  workspace = await recordWorkspaceAction(workspace, "Bind missing legacy closure criterion fixture");
  const missingCriterion = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);
  assert.match(missingCriterion, /Action required/);
  assert.match(missingCriterion, /closure criterion|next action/i);
  await assert.rejects(() => makePublicNoticeHtml(workspace, GENERATED_AT), /closure criterion|next action/i);
});

test("empty public notices disclose evidence scope instead of issuing an unqualified all-clear", async () => {
  const workspace = await createBlankWorkspace();
  const notice = await makePublicNoticeHtml(workspace, GENERATED_AT);

  assert.doesNotMatch(notice, /No known service issues/);
  assert.match(notice, /No active incident is recorded in this workspace/);
  assert.match(notice, /does not show that every service was checked or working/i);
  assert.match(notice, /Draft public information.*approval required/i);
});

test("fixed inputs generate byte-identical reports without mutating workspace", async () => {
  const workspace = await createPublishableWorkspace();
  const before = structuredClone(workspace);
  const first = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);
  const second = await makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);
  const publicFirst = await makePublicNoticeHtml(workspace, GENERATED_AT);
  const publicSecond = await makePublicNoticeHtml(workspace, GENERATED_AT);

  assert.equal(first, second);
  assert.equal(publicFirst, publicSecond);
  assert.deepEqual(workspace, before);
});

test("public notice generation blocks any workspace containing Sample data incidents", async () => {
  let workspace = await createFixtureWorkspace();
  await assert.rejects(() => makePublicNoticeHtml(workspace, GENERATED_AT), /Sample data incidents/i);
  workspace.incidents.forEach((incident) => {
    incident.state = "resolved";
  });
  workspace = await recordWorkspaceAction(workspace, "Bind resolved Sample data fixture");
  await assert.rejects(() => makePublicNoticeHtml(workspace, GENERATED_AT), /containing Sample data incidents/i);
});

test("report CSS constrains reflow and assigns scroll ownership locally", async () => {
  const report = await makeTechnicalReportHtml(await createBlankWorkspace(), "idle", GENERATED_AT);
  assert.match(report, /max-inline-size:100%/);
  assert.match(report, /min-block-size:100dvh/);
  assert.match(report, /max-block-size:min\(68dvh,48rem\)/);
  assert.match(report, /\.table-scroll\{[^}]*overflow:auto/);
  assert.match(report, /\.record-code pre\{[^}]*max-inline-size:100%[^}]*overflow:auto/);
  assert.match(report, /overflow-wrap:anywhere/);
  assert.match(report, /@media\(max-width:52rem\)/);
  assert.match(report, /@media print/);
  assert.doesNotMatch(report, /width:100vw/);
});
