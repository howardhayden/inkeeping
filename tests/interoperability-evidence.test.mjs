import assert from "node:assert/strict";
import test from "node:test";
import {
  INTEROP_LOSS_REPORT_SCHEMA,
  INTEROP_WARNING_MANIFEST_SCHEMA,
  assessInteroperabilityEvidenceBundle,
  interoperabilityFixtureManifestDigest,
  makeCompatibilityPackage,
  sealInteroperabilityReceiverProfile,
  sealInteroperabilityRun,
  sealInteroperabilitySemanticDiff,
  validateCompatibilityPackage,
  validateCompatibilityPackageText,
  validateInteroperabilityReceiverProfile,
  validateInteroperabilityReceiverProfileText,
  validateInteroperabilityRun,
  validateInteroperabilityRunText,
  validateInteroperabilitySemanticDiff,
  validateInteroperabilitySemanticDiffText,
} from "../app/interoperability-evidence.ts";

const digest = (character) => character.repeat(64);
const commit = "abcdef0123456789abcdef0123456789abcdef01";
const payloadText = "id,title\n1,'=literal\n";
const defaultObservations = [
  { caseId: "IK-INT-FX-01", path: "/records/0/title", expected: "=literal", displayed: "=literal", underlying: "=literal", reexported: "=literal", transformation: "unchanged", finding: "none", note: "Synthetic non-product unit evidence only." },
  { caseId: "IK-INT-FX-02", path: "/records/0/id", expected: "1", displayed: "1", underlying: "1", reexported: "1", transformation: "unchanged", finding: "none", note: "Synthetic non-product unit evidence only." },
];

async function sha256Text(value) {
  const hashed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makePackage({
  payload = payloadText,
  losses = [],
  warnings = [],
  lossText,
  warningText,
  producer = {},
  filenames = {},
} = {}) {
  const payloadSha256 = await sha256Text(payload);
  const fixtureManifestSha256 = await interoperabilityFixtureManifestDigest();
  return makeCompatibilityPackage({
    packageId: "package.synthetic.1",
    producer: {
      commitSha: commit,
      buildSha256: digest("d"),
      fixtureManifestSha256,
      exporterProfile: "catalog-csv-v1",
      ...producer,
    },
    entries: [
      { role: "payload", filename: filenames.payload ?? "records.csv", mediaType: "text/csv", text: payload },
      {
        role: "loss-report",
        filename: filenames.loss ?? "loss.json",
        mediaType: "application/json",
        text: lossText ?? JSON.stringify({ schema: INTEROP_LOSS_REPORT_SCHEMA, version: 1, payloadSha256, completeness: "complete", losses }),
      },
      {
        role: "warning-manifest",
        filename: filenames.warning ?? "warnings.json",
        mediaType: "application/json",
        text: warningText ?? JSON.stringify({ schema: INTEROP_WARNING_MANIFEST_SCHEMA, version: 1, payloadSha256, completeness: "complete", warnings }),
      },
    ],
  });
}

async function fixture({ losses = [], warnings = [], observations = defaultObservations, reexportedArtifact = { sha256: digest("b"), bytes: 25 } } = {}) {
  const fixtureManifestSha256 = await interoperabilityFixtureManifestDigest();
  const profile = await sealInteroperabilityReceiverProfile({
    profileId: "receiver.calc.synthetic",
    receiver: { product: "Synthetic receiver", version: "1.0", build: "test-build" },
    environment: { os: "Synthetic OS", locale: "en-US" },
    extensions: [],
    settings: [{ key: "import.encoding", value: "UTF-8" }, { key: "formula.execution", value: "disabled" }],
    exchange: { domain: "catalog", format: "csv", profile: "in-keeping-versioned-csv-v1", mediaType: "text/csv" },
    fixtureManifestSha256,
    requiredCases: ["IK-INT-FX-01", "IK-INT-FX-02"],
  });
  const pack = await makePackage({ losses, warnings });
  const payload = pack.entries.find((entry) => entry.role === "payload");
  assert.ok(payload);
  const diff = await sealInteroperabilitySemanticDiff({
    profileSha256: profile.recordSha256,
    packageSha256: pack.recordSha256,
    receivedArtifact: { sha256: payload.sha256, bytes: payload.bytes },
    reexportedArtifact,
    observations,
  });
  const run = await sealInteroperabilityRun({
    runId: "run.synthetic.1",
    profileSha256: profile.recordSha256,
    packageSha256: pack.recordSha256,
    diffSha256: diff.recordSha256,
    fixtureManifestSha256,
    producer: { commitSha: commit, buildSha256: digest("d") },
    recordedAt: "2026-09-01T00:00:00.000Z",
    operator: { role: "Synthetic test operator", evidenceRecord: "TEST-ONLY" },
    results: [
      { caseId: "IK-INT-FX-01", status: "pass", detail: "Synthetic unit path passed.", evidenceRefs: ["TEST-1"] },
      { caseId: "IK-INT-FX-02", status: "blocked", detail: "Requires a named receiving product.", evidenceRefs: [] },
    ],
  });
  const current = { profileSha256: profile.recordSha256, fixtureManifestSha256, producerCommitSha: commit, producerBuildSha256: run.producer.buildSha256 };
  return { profile, pack, diff, run, current };
}

function unsigned(record) {
  const content = { ...record };
  delete content.schema;
  delete content.version;
  delete content.recordSha256;
  return content;
}

test("source-controlled profile, payload-bound reports, semantic diff, and run form one exact chain", async () => {
  const { profile, pack, diff, run } = await fixture();
  assert.deepEqual(await validateInteroperabilityReceiverProfile(profile), profile);
  assert.deepEqual(await validateInteroperabilityReceiverProfileText(JSON.stringify(profile)), profile);
  assert.deepEqual(await validateCompatibilityPackage(pack), pack);
  assert.deepEqual(await validateCompatibilityPackageText(JSON.stringify(pack)), pack);
  assert.deepEqual(await validateInteroperabilitySemanticDiff(diff), diff);
  assert.deepEqual(await validateInteroperabilitySemanticDiffText(JSON.stringify(diff)), diff);
  assert.deepEqual(await validateInteroperabilityRun(run), run);
  assert.deepEqual(await validateInteroperabilityRunText(JSON.stringify(run)), run);
  assert.equal(profile.fixtureManifestSha256, await interoperabilityFixtureManifestDigest());
  assert.deepEqual(profile.requiredCases, ["IK-INT-FX-01", "IK-INT-FX-02"]);
  assert.equal(pack.producer.fixtureManifestSha256, profile.fixtureManifestSha256);
  assert.equal(pack.producer.buildSha256, run.producer.buildSha256);
  assert.equal(diff.profileSha256, profile.recordSha256);
  assert.equal(diff.packageSha256, pack.recordSha256);
  assert.equal(run.diffSha256, diff.recordSha256);
});

test("caller-selected case subsets and unsupported exchanges cannot mint a profile", async () => {
  const { profile } = await fixture();
  await assert.rejects(
    sealInteroperabilityReceiverProfile({ ...unsigned(profile), requiredCases: ["IK-INT-FX-01"] }),
    /exactly equal.*source-controlled manifest|caller-selected subsets/i,
  );
  await assert.rejects(
    sealInteroperabilityReceiverProfile({ ...unsigned(profile), exchange: { ...profile.exchange, profile: "caller-selected-profile" } }),
    /not defined by the source-controlled.*manifest/i,
  );
});

test("missing, swapped, altered, garbage, or payload-detached package entries reject", async () => {
  const { pack } = await fixture();
  const missing = structuredClone(pack);
  missing.entries.pop();
  await assert.rejects(validateCompatibilityPackage(missing), /exactly payload, loss-report, and warning-manifest/i);

  const swappedRole = structuredClone(pack);
  swappedRole.entries[0].role = "loss-report";
  await assert.rejects(validateCompatibilityPackage(swappedRole), /complete and unique/i);

  const altered = structuredClone(pack);
  altered.entries[0].text += "2,substituted\n";
  await assert.rejects(validateCompatibilityPackage(altered), /bytes or digest/i);
  await assert.rejects(validateCompatibilityPackageText(pack.entries[0].text), /package|object|schema/i, "a loose payload is not a package");

  await assert.rejects(makePackage({ lossText: "[]" }), /loss report.*plain object/i);
  await assert.rejects(makePackage({ warningText: "not-json" }), /json|primitive|invalid/i);
  await assert.rejects(makePackage({ lossText: JSON.stringify({ schema: INTEROP_LOSS_REPORT_SCHEMA, version: 1, payloadSha256: digest("e"), completeness: "complete", losses: [] }) }), /payload binding/i);
  await assert.rejects(makePackage({ filenames: { warning: "loss.json" } }), /filenames must be unique/i);
  await assert.rejects(makePackage({ payload: "" }), /payload must be nonempty/i);
});

test("bundle assessment derives conservative states from the complete exact chain", async () => {
  const { profile, pack, diff, run, current } = await fixture();
  const bundle = (candidateRun, candidateDiff = diff, candidatePack = pack) => ({ profile, package: candidatePack, diff: candidateDiff, run: candidateRun });
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(run), current), "BLOCKED");
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(run), { ...current, profileSha256: digest("e") }), "VERSION_OBSOLETE");
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(run), { ...current, producerCommitSha: "abcdef0" }), "INVALID_RECORD", "malformed current pins return a conservative state instead of rejecting");

  const failed = await sealInteroperabilityRun({ ...unsigned(run), results: run.results.map((item) => item.caseId === "IK-INT-FX-02" ? { ...item, status: "fail" } : item) });
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(failed), current), "FAILED");
  const incomplete = await sealInteroperabilityRun({ ...unsigned(run), results: run.results.filter((item) => item.caseId !== "IK-INT-FX-02") });
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(incomplete), current), "INCOMPLETE");
  const passed = await sealInteroperabilityRun({ ...unsigned(run), results: run.results.map((item, index) => ({ ...item, status: "pass", evidenceRefs: item.evidenceRefs.length ? item.evidenceRefs : [`TEST-${index + 1}`] })) });
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(passed), current), "RECORDED_PASS");

  const tampered = structuredClone(passed);
  tampered.results[0].detail = "False pass substituted.";
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(tampered), current), "INVALID_RECORD");
  const relinked = await sealInteroperabilityRun({ ...unsigned(passed), diffSha256: digest("f") });
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(relinked), current), "INVALID_RECORD", "a valid but unlinked run cannot self-certify");

  const noReexport = await sealInteroperabilitySemanticDiff({ ...unsigned(diff), reexportedArtifact: null });
  const noReexportRun = await sealInteroperabilityRun({ ...unsigned(passed), diffSha256: noReexport.recordSha256 });
  assert.equal(await assessInteroperabilityEvidenceBundle(bundle(noReexportRun, noReexport), current), "INCOMPLETE");
});

test("semantic contradictions and evidence-free passes fail closed", async () => {
  const { diff, run } = await fixture();
  const unequal = structuredClone(diff.observations);
  unequal[0].displayed = "changed";
  await assert.rejects(sealInteroperabilitySemanticDiff({ ...unsigned(diff), observations: unequal }), /unchanged.*preserve/i);

  const executedWithoutHazard = structuredClone(diff.observations);
  executedWithoutHazard[0].transformation = "executed";
  await assert.rejects(sealInteroperabilitySemanticDiff({ ...unsigned(diff), observations: executedWithoutHazard }), /classified as hazards/i);

  const lossWithoutLossFinding = structuredClone(diff.observations);
  lossWithoutLossFinding[0].transformation = "omitted";
  await assert.rejects(sealInteroperabilitySemanticDiff({ ...unsigned(diff), observations: lossWithoutLossFinding }), /require a declared\/unexpected loss/i);

  const evidenceFree = structuredClone(run.results);
  evidenceFree[0].evidenceRefs = [];
  await assert.rejects(sealInteroperabilityRun({ ...unsigned(run), results: evidenceFree }), /passing.*evidence reference/i);
});

test("loss and hazard reports must match the exact semantic observations", async () => {
  const loss = { caseId: "IK-INT-FX-01", path: "/records/0/title", finding: "declared-loss", detail: "Synthetic declared omission." };
  const mismatched = await fixture({ losses: [loss] });
  assert.equal(await assessInteroperabilityEvidenceBundle({ profile: mismatched.profile, package: mismatched.pack, diff: mismatched.diff, run: mismatched.run }, mismatched.current), "INVALID_RECORD");

  const lossObservations = structuredClone(defaultObservations);
  lossObservations[0] = { ...lossObservations[0], displayed: null, underlying: null, reexported: null, transformation: "omitted", finding: "declared-loss", note: "Different claimed loss detail." };
  const detailMismatch = await fixture({ losses: [loss], observations: lossObservations });
  assert.equal(await assessInteroperabilityEvidenceBundle({ profile: detailMismatch.profile, package: detailMismatch.pack, diff: detailMismatch.diff, run: detailMismatch.run }, detailMismatch.current), "INVALID_RECORD", "a report cannot retain a different semantic detail under the same case/path/finding identity");

  lossObservations[0].note = loss.detail;
  const matched = await fixture({ losses: [loss], observations: lossObservations });
  const passed = await sealInteroperabilityRun({ ...unsigned(matched.run), results: matched.run.results.map((item, index) => ({ ...item, status: "pass", evidenceRefs: item.evidenceRefs.length ? item.evidenceRefs : [`LOSS-${index + 1}`] })) });
  assert.equal(await assessInteroperabilityEvidenceBundle({ profile: matched.profile, package: matched.pack, diff: matched.diff, run: passed }, matched.current), "INCOMPLETE", "declared loss cannot pass without a source-controlled allowed-loss policy");

  const hazard = { caseId: "IK-INT-FX-01", path: "/records/0/title", finding: "hazard", detail: "Synthetic formula execution." };
  const hazardObservations = structuredClone(defaultObservations);
  hazardObservations[0] = { ...hazardObservations[0], transformation: "executed", finding: "hazard", note: hazard.detail };
  const hazardous = await fixture({ warnings: [hazard], observations: hazardObservations });
  assert.equal(await assessInteroperabilityEvidenceBundle({ profile: hazardous.profile, package: hazardous.pack, diff: hazardous.diff, run: hazardous.run }, hazardous.current), "FAILED");

  const unexpected = { ...loss, finding: "unexpected-loss", detail: "Synthetic unexpected omission." };
  const unexpectedObservations = structuredClone(defaultObservations);
  unexpectedObservations[0] = { ...unexpectedObservations[0], displayed: null, underlying: null, reexported: null, transformation: "omitted", finding: "unexpected-loss", note: unexpected.detail };
  const unexpectedLoss = await fixture({ losses: [unexpected], observations: unexpectedObservations });
  assert.equal(await assessInteroperabilityEvidenceBundle({ profile: unexpectedLoss.profile, package: unexpectedLoss.pack, diff: unexpectedLoss.diff, run: unexpectedLoss.run }, unexpectedLoss.current), "FAILED");
});

test("raw duplicate members, lone surrogates, and abbreviated commits reject", async () => {
  const { profile, diff } = await fixture();
  const duplicateProfile = JSON.stringify(profile).replace(`"profileId":"${profile.profileId}"`, `"profileId":"shadow","profileId":"${profile.profileId}"`);
  await assert.rejects(validateInteroperabilityReceiverProfileText(duplicateProfile), /duplicate member name/i);

  const surrogateDiff = JSON.stringify(diff).replace("Synthetic non-product unit evidence only.", "\\ud800");
  await assert.rejects(validateInteroperabilitySemanticDiffText(surrogateDiff), /unpaired Unicode surrogate/i);
  await assert.rejects(makePackage({ payload: "\ud800" }), /bounded canonical text/i);
  await assert.rejects(makePackage({ producer: { commitSha: "abcdef0" } }), /commit SHA is invalid/i);
});
