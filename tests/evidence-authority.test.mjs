import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDigest,
  createEvidenceApplicationRecord,
  createEvidenceAuthorityRecord,
  deriveEvidenceAuthorityStatus,
  EVIDENCE_TIME_BASIS,
  validateEvidenceAuthorityRecord,
  validateEvidenceApplicationRecord,
  validateEvidenceDescriptor,
} from "../app/evidence-authority.ts";

const sourceDigest = "a".repeat(64);
const payloadDigest = "b".repeat(64);

function evidence(overrides = {}) {
  return {
    source: {
      kind: "catalog-import",
      filename: "claimed-export.json",
      format: "in-keeping-catalog-v1",
      bytes: 1_024,
      sha256: sourceDigest,
    },
    review: {
      structuralStatus: "passed",
      canonicalPayloadSha256: payloadDigest,
      parserProfile: "catalog-json-v1/strict",
    },
    scope: { kind: "catalog-records", entityIds: ["BIB-1", "BIB-2"] },
    ...overrides,
  };
}

function disposition(decision = "admit-unverified", overrides = {}) {
  return {
    decision,
    claimedOrigin: "direct-export",
    custodyNote: "Operator claims the file was exported from the named source and retained on managed storage.",
    actorRoleClaim: "Collections systems librarian",
    rationale: "Admitted for comparison while independent reconciliation remains outstanding.",
    policyReference: "LOCAL-EVIDENCE-7.2",
    atBrowser: "2026-08-31T12:34:56.000Z",
    timeBasis: EVIDENCE_TIME_BASIS,
    ...overrides,
  };
}

test("evidence admission refuses absent, blank, and defaulted disposition claims", async () => {
  await assert.rejects(createEvidenceAuthorityRecord(evidence(), {}), /Missing evidence disposition field/);
  await assert.rejects(
    createEvidenceAuthorityRecord(evidence(), disposition("admit-unverified", { custodyNote: "" })),
    /Custody note must contain/,
  );
  await assert.rejects(
    createEvidenceAuthorityRecord(evidence(), disposition("admit-unverified", { claimedOrigin: undefined })),
    /Claimed origin/,
  );
  await assert.rejects(
    createEvidenceAuthorityRecord(evidence(), disposition("admit-unverified", { timeBasis: undefined })),
    /time basis/,
  );
});

test("exact DTO validation rejects authority-shaped injected fields", () => {
  const injected = evidence();
  injected.review.verified = true;
  assert.throws(() => validateEvidenceDescriptor(injected), /Unknown evidence review field: verified/);

  const sourceInjected = evidence();
  sourceInjected.source.authoritative = true;
  assert.throws(() => validateEvidenceDescriptor(sourceInjected), /Unknown evidence source field: authoritative/);
});

test("canonical digest is stable across object key order but binds array order", async () => {
  const first = { alpha: 1, nested: { beta: "two", gamma: ["a", "b"] } };
  const reordered = { nested: { gamma: ["a", "b"], beta: "two" }, alpha: 1 };
  const arrayReordered = { alpha: 1, nested: { beta: "two", gamma: ["b", "a"] } };
  assert.equal(await canonicalDigest(first), await canonicalDigest(reordered));
  assert.notEqual(await canonicalDigest(first), await canonicalDigest(arrayReordered));
});

test("a copied disposition or evidence digest cannot authorize different evidence", async () => {
  const admitted = await createEvidenceAuthorityRecord(evidence(), disposition());
  const other = await createEvidenceAuthorityRecord(
    evidence({ source: { ...evidence().source, filename: "different.json", sha256: "c".repeat(64) } }),
    disposition(),
  );

  const copiedDisposition = structuredClone(other);
  copiedDisposition.disposition = admitted.disposition;
  copiedDisposition.recordSha256 = admitted.recordSha256;
  await assert.rejects(validateEvidenceAuthorityRecord(copiedDisposition), /record digest/);

  const copiedBinding = structuredClone(other);
  copiedBinding.evidenceSha256 = admitted.evidenceSha256;
  await assert.rejects(validateEvidenceAuthorityRecord(copiedBinding), /binding digest/);
});

test("structurally valid, internally consistent fabricated input remains unverified", async () => {
  const fabricated = await createEvidenceAuthorityRecord(
    evidence({
      source: { ...evidence().source, filename: "fabricated-but-valid.json", sha256: "f".repeat(64) },
      review: { ...evidence().review, canonicalPayloadSha256: "e".repeat(64) },
    }),
    disposition("admit-unverified", {
      claimedOrigin: "unknown",
      custodyNote: "No external custody evidence is available; all fields may have been fabricated together.",
    }),
  );

  assert.equal(await deriveEvidenceAuthorityStatus([fabricated]), "operator-admitted-unverified");
  assert.equal("verified" in fabricated.disposition, false);
  assert.equal("authoritative" in fabricated, false);
  assert.ok(!["trusted", "verified", "authoritative", "operator-admitted-verified"].includes(
    await deriveEvidenceAuthorityStatus([fabricated]),
  ));
});

test("mutation of reviewed evidence or human claims invalidates its record digest", async () => {
  const admitted = await createEvidenceAuthorityRecord(evidence(), disposition());

  const evidenceMutation = structuredClone(admitted);
  evidenceMutation.evidence.scope.entityIds[0] = "BIB-SUBSTITUTED";
  await assert.rejects(validateEvidenceAuthorityRecord(evidenceMutation), /binding digest/);

  const claimMutation = structuredClone(admitted);
  claimMutation.disposition.rationale = "Substituted rationale";
  await assert.rejects(validateEvidenceAuthorityRecord(claimMutation), /record digest/);
});

test("withdrawal has conservative precedence independent of untrusted browser time or array order", async () => {
  const descriptor = evidence();
  const admitted = await createEvidenceAuthorityRecord(descriptor, disposition("admit-unverified", { atBrowser: "2026-08-31T14:00:00.000Z" }));
  const withdrawn = await createEvidenceAuthorityRecord(descriptor, disposition("withdraw", { atBrowser: "2026-08-31T13:00:00.000Z", rationale: "Custody claim was withdrawn after contradictory evidence appeared." }));
  assert.equal(await deriveEvidenceAuthorityStatus([admitted, withdrawn]), "withdrawn");
  assert.equal(await deriveEvidenceAuthorityStatus([withdrawn, admitted]), "withdrawn");
  assert.equal(await deriveEvidenceAuthorityStatus([]), "unattributed");
});

test("decision sets cannot combine different evidence bindings", async () => {
  const first = await createEvidenceAuthorityRecord(evidence(), disposition());
  const second = await createEvidenceAuthorityRecord(
    evidence({ scope: { kind: "catalog-records", entityIds: ["BIB-OTHER"] } }),
    disposition("reject"),
  );
  await assert.rejects(deriveEvidenceAuthorityStatus([first, second]), /different evidence bindings/);
});

test("application outcomes are exact, content-bound, and cannot relabel a failed decision as applied", async () => {
  const admitted = await createEvidenceAuthorityRecord(evidence(), disposition());
  const applied = await createEvidenceApplicationRecord(admitted, {
    outcome: "applied",
    reason: "catalog-import-applied",
    detail: "The exact reviewed records were applied to the resulting revision.",
    resultingRevisionId: "REV-1",
    resultingRevisionDigest: "e".repeat(64),
  });
  assert.deepEqual(await validateEvidenceApplicationRecord(applied), applied);

  await assert.rejects(createEvidenceApplicationRecord(admitted, {
    outcome: "applied",
    reason: "catalog-import-applied",
    detail: "Missing resulting revision.",
    resultingRevisionId: null,
    resultingRevisionDigest: null,
  }), /must identify and bind the resulting active revision/i);

  const mutated = structuredClone(applied);
  mutated.outcome = "not-applied";
  mutated.resultingRevisionId = null;
  mutated.resultingRevisionDigest = null;
  await assert.rejects(validateEvidenceApplicationRecord(mutated), /non-application reason|digest does not match/i);
  await assert.rejects(
    createEvidenceApplicationRecord(admitted, {
      outcome: "applied",
      reason: "operator-rejected",
      detail: "Contradictory applied outcome.",
      resultingRevisionId: "REV-CONTRADICTORY",
      resultingRevisionDigest: "f".repeat(64),
    }),
    /applied import or backup reason/i,
  );
  await assert.rejects(
    createEvidenceApplicationRecord(admitted, {
      outcome: "not-applied",
      reason: "catalog-import-applied",
      detail: "Contradictory non-application outcome.",
      resultingRevisionId: null,
      resultingRevisionDigest: null,
    }),
    /non-application reason/i,
  );
  await assert.rejects(
    createEvidenceApplicationRecord(admitted, {
      outcome: "applied",
      reason: "workspace-backup-opened",
      detail: "A catalog source cannot be relabeled as a backup opening.",
      resultingRevisionId: "REV-CONTRADICTORY",
      resultingRevisionDigest: "f".repeat(64),
    }),
    /contradicts catalog-import/i,
  );
});
