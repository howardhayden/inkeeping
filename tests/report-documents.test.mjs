import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBlankWorkspace,
  createFixtureWorkspace,
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
  const workspace = await createFixtureWorkspace();
  workspace.incidents.forEach((incident) => { incident.synthetic = false; });
  return workspace;
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

test("technical report is a complete static post-run notebook document", async () => {
  const workspace = await createFixtureWorkspace();
  const report = makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);

  assert.ok(report.startsWith("<!doctype html>"));
  assert.ok(report.endsWith("</html>"));
  assert.match(report, /<html lang="en">/);
  assert.match(report, /<title>[^<]+Technical report<\/title>/);
  assert.match(report, /data-document-format="post-jupyter-html"/);
  assert.equal((report.match(/class="jp-Cell"/g) ?? []).length, 14);
  assert.match(report, /Document control/);
  assert.match(report, /Software execution boundary/);
  assert.match(report, /Inventory and interoperability/);
  assert.match(report, /Complete finding register/);
  assert.match(report, /Incident register/);
  assert.match(report, /Archive schema register/);
  assert.match(report, /Catalog records — original input and new output/);
  assert.match(report, /Archive records — original input and new output/);
  assert.match(report, /Service register — original input and new output/);
  assert.match(report, /Data and record-type formatting/);
  assert.match(report, /Configuration register/);
  assert.match(report, /Recovery and audit/);
  assert.match(report, /Safeguards and recovery/);
  assert.match(report, /Production boundaries/);
  assert.match(report, /Audit chain<\/dt><dd>Internally consistent/);
  assert.match(report, /Original source elements and accessible definitions/);
  assert.match(report, /Canonical catalog record as JSON/);
  assert.match(report, /Canonical service record as JSON/);
  assert.match(report, /Service-register field-type formatting rules/);
  assert.match(report, /Safeguard and residual-risk register/);
  assert.match(report, /Workspace data boundary/);
  assert.match(report, /Current-state binding/);
  assert.match(report, /Linked-event verification/);
  assert.match(report, /there are no telemetry, analytics, cookies, or background-upload paths/);
  assert.match(report, /validly truncated tail can be indistinguishable/);
  assert.match(report, /IN KEEPING · Library systems continuity/);
  assert.doesNotMatch(report, /undefined|\[object Object\]/);
});

test("notebook reports embed Jost, site colors, and an offline CSP", async () => {
  const workspace = await createBlankWorkspace();
  const technical = makeTechnicalReportHtml(workspace, "idle", GENERATED_AT);
  const notice = makePublicNoticeHtml(workspace, GENERATED_AT);

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
  const technical = makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);
  const notice = makePublicNoticeHtml(workspace, GENERATED_AT);

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

  const report = makeTechnicalReportHtml(workspace, "invalid", GENERATED_AT);
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
  const report = makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);
  const ids = [...report.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const idSet = new Set(ids);
  for (const match of report.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(idSet.has(id), id);
  }
});

test("public notice uses a fixed projection and cannot carry internal evidence", async () => {
  const workspace = await createPublishableWorkspace();
  const revision = workspace.revisions.find((item) => item.id === workspace.activeRevisionId);
  assert.ok(revision);
  workspace.name = "PRIVATE-WORKSPACE-SENTINEL";
  revision.config.resolverBase = "https://PRIVATE-RESOLVER-SENTINEL.invalid";
  revision.config.proxyPrefix = "https://PRIVATE-PROXY-SENTINEL.invalid";
  workspace.incidents[0].service = "PRIVATE-SERVICE-SENTINEL";
  workspace.incidents[0].title = "PRIVATE-TITLE-SENTINEL";
  workspace.incidents[0].ownerRole = "PRIVATE-OWNER-SENTINEL";
  workspace.incidents[0].nextAction = "PRIVATE-NEXT-SENTINEL";
  workspace.incidents[0].evidence = ["PRIVATE-EVIDENCE-SENTINEL"];
  workspace.incidents[0].notes = ["PRIVATE-NOTE-SENTINEL"];
  revision.serviceRecords[0].values.scope = "PRIVATE-SERVICE-REGISTER-SENTINEL";

  const report = makePublicNoticeHtml(workspace, GENERATED_AT);
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
    "PRIVATE-SERVICE-REGISTER-SENTINEL",
    revision.id,
    revision.digest,
    workspace.incidents[0].id,
  ]) {
    assert.equal(report.toLowerCase().includes(sentinel.toLowerCase()), false);
  }
});

test("blank reports retain explicit zero and no-issue states", async () => {
  const workspace = await createBlankWorkspace();
  const technical = makeTechnicalReportHtml(workspace, "not-checked", GENERATED_AT);
  const notice = makePublicNoticeHtml(workspace, GENERATED_AT);

  assert.match(technical, /No active exceptions/);
  assert.match(technical, /No metadata or access findings/);
  assert.match(technical, /No incidents were present/);
  assert.match(technical, /No archival schemas were present/);
  assert.match(technical, /No service records were present/);
  assert.match(technical, /Not checked for this export/);
  assert.match(notice, /No known service issues/);
  assert.match(notice, /No affected services are currently listed/);
});

test("fixed inputs generate byte-identical reports without mutating workspace", async () => {
  const workspace = await createPublishableWorkspace();
  const before = structuredClone(workspace);
  const first = makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);
  const second = makeTechnicalReportHtml(workspace, "valid", GENERATED_AT);
  const publicFirst = makePublicNoticeHtml(workspace, GENERATED_AT);
  const publicSecond = makePublicNoticeHtml(workspace, GENERATED_AT);

  assert.equal(first, second);
  assert.equal(publicFirst, publicSecond);
  assert.deepEqual(workspace, before);
});

test("public notice generation blocks open Sample data incidents", async () => {
  const workspace = await createFixtureWorkspace();
  assert.throws(() => makePublicNoticeHtml(workspace, GENERATED_AT), /Sample data incidents/i);
});

test("report CSS constrains reflow and assigns scroll ownership locally", async () => {
  const report = makeTechnicalReportHtml(await createBlankWorkspace(), "idle", GENERATED_AT);
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
