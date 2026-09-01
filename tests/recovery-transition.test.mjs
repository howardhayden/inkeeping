import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import {
  CONTINUITY_SIGNATURE_SUITE,
  CONTINUITY_TRUST_POLICY_SCHEMA,
  CONTINUITY_TRUST_POLICY_VERSION,
  CONTINUITY_WITNESS_SET_SCHEMA,
  CONTINUITY_WITNESS_SET_VERSION,
  SIGNED_CONTINUITY_WITNESS_SCHEMA,
  SIGNED_CONTINUITY_WITNESS_VERSION,
  continuityTrustPolicyDigest,
  continuityWitnessSigningBytes,
  createContinuityWitness,
} from "../app/external-continuity.ts";
import {
  CONTINUITY_ACKNOWLEDGMENT,
  continuityPayloadDigest,
  createContinuityAnchor,
  formatContinuityReceipt,
} from "../app/continuity-anchor.ts";
import { canonicalDigest } from "../app/evidence-authority.ts";
import { createBlankWorkspace } from "../app/lab-core.ts";
import {
  compareRecoveryTransitionReview,
  formatRecoveryTransitionReview,
  parseRecoveryTransitionReview,
  sealRecoveryTransitionReview,
  validateRecoveryTransitionReview,
} from "../app/recovery-transition.ts";
import { makeWorkspaceBackup, reviewWorkspaceBackup } from "../app/workspace-backups.ts";

const ORIGIN = "https://recovery.example";
const AT = "2026-09-01T00:00:00.000Z";

async function sha256Text(value) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(new Uint8Array(result)).toString("hex");
}

async function makeFixture() {
  const workspace = await createBlankWorkspace("Recovery transition fixture");
  const anchor = await createContinuityAnchor({
    workspace,
    workspaceId: "ws-recovery-source",
    lineageId: "lineage-recovery-source",
    generation: 7,
    payloadDigest: await continuityPayloadDigest(workspace),
    initialAcceptance: {
      browserTime: AT,
      operatorRole: "Synthetic custodian",
      authorityReference: "TEST-ONLY",
      rationale: "Synthetic recovery fixture.",
      sourceKind: "local-workspace",
      sourcePayloadDigest: null,
      sourceAnchorDigest: null,
      acknowledgment: CONTINUITY_ACKNOWLEDGMENT,
    },
  });
  const backupText = await makeWorkspaceBackup(workspace, AT);
  const review = await reviewWorkspaceBackup(new File([backupText], "recovery-source.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  return { workspace, anchor, backupText, review };
}

async function makeSigned(anchor) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const key = { keyId: "recovery-key", status: "active", publicJwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y } };
  const witness = await createContinuityWitness(anchor, ORIGIN, AT);
  const unsigned = { schema: SIGNED_CONTINUITY_WITNESS_SCHEMA, version: SIGNED_CONTINUITY_WITNESS_VERSION, witness, authorityId: "recovery-authority", keyId: key.keyId, suite: CONTINUITY_SIGNATURE_SUITE, signature: Buffer.alloc(64).toString("base64url") };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, continuityWitnessSigningBytes(unsigned));
  const signed = { ...unsigned, signature: Buffer.from(new Uint8Array(signature)).toString("base64url") };
  const signedSet = { schema: CONTINUITY_WITNESS_SET_SCHEMA, version: CONTINUITY_WITNESS_SET_VERSION, witnesses: [signed] };
  const policy = {
    schema: CONTINUITY_TRUST_POLICY_SCHEMA,
    version: CONTINUITY_TRUST_POLICY_VERSION,
    policyId: "recovery-policy",
    authorityId: "recovery-authority",
    revision: 1,
    keys: [key],
    terminals: [{ workspaceId: witness.workspaceId, lineageId: witness.lineageId, branchId: witness.branchId, originScope: witness.originScope, sequence: witness.sequence, witnessDigest: witness.digest }],
  };
  return { signedSetText: JSON.stringify(signedSet), policyText: JSON.stringify(policy), pin: await continuityTrustPolicyDigest(policy) };
}

test("recovery review is explicitly non-activated, non-inherited, new-lineage evidence", async () => {
  const { review } = await makeFixture();
  const record = await sealRecoveryTransitionReview({ backupReview: review, continuity: { kind: "none" }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT });
  assert.equal(record.stage, "source-reviewed-not-activated");
  assert.equal(record.continuityInherited, false);
  assert.equal(record.authorityInherited, false);
  assert.equal(record.correspondence.exactBackupFile, "observed-self-recorded-unsigned");
  assert.equal(record.correspondence.payloadCheckpoint, "not-assessed");
  assert.equal(record.prospectiveDestination.lineage, "new-lineage-required");
  assert.equal(record.limitations.cleanDevice, "not-established");
  assert.equal(record.limitations.destinationPersistence, "not-performed");
  assert.equal(record.limitations.attachmentBytes, "not-modeled");
  assert.deepEqual(await parseRecoveryTransitionReview(await formatRecoveryTransitionReview(record)), record);
  await assert.rejects(sealRecoveryTransitionReview({ backupReview: structuredClone(review), continuity: { kind: "none" }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT }), /exact unchanged.*capability/i);

  const reviewedDigest = review.digest;
  let digestReads = 0;
  Object.defineProperty(review, "digest", { enumerable: true, configurable: true, get() { digestReads += 1; return digestReads === 1 ? reviewedDigest : "f".repeat(64); } });
  await assert.rejects(sealRecoveryTransitionReview({ backupReview: review, continuity: { kind: "none" }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT }), /exact unchanged.*capability/i);
  assert.equal(digestReads, 0, "backup-review accessors are rejected without invocation");
});

test("an unsigned receipt establishes checkpoint content correspondence only", async () => {
  const { anchor, review } = await makeFixture();
  const receiptText = formatContinuityReceipt(anchor);
  const record = await sealRecoveryTransitionReview({ backupReview: review, continuity: { kind: "unsigned-receipt", receiptText }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT });
  assert.equal(record.continuity.status, "content-matched-unsigned");
  assert.equal(record.continuity.identityBasis, "receipt-claim-only");
  assert.equal(record.continuity.receiptRawSha256, await sha256Text(receiptText));
  assert.equal(record.correspondence.payloadCheckpoint, "content-matched-unsigned");
  assert.equal(record.prospectiveDestination.sourceOrigin, null);

  let receiptReads = 0;
  const accessorMaterial = { kind: "unsigned-receipt" };
  Object.defineProperty(accessorMaterial, "receiptText", { enumerable: true, get() { receiptReads += 1; return receiptReads === 1 ? receiptText : "{}"; } });
  await assert.rejects(sealRecoveryTransitionReview({ backupReview: review, continuity: accessorMaterial, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT }), /accessors are not supported/i);
  assert.equal(receiptReads, 0, "continuity accessors are rejected without invocation");

  const receipt = JSON.parse(receiptText);
  for (const [field, replacement] of [["payloadDigest", "f".repeat(64)], ["ledgerGenesisHash", "e".repeat(64)], ["terminalHash", "d".repeat(64)], ["terminalStateDigest", "c".repeat(64)], ["auditCount", receipt.activeCheckpoint.auditCount + 1], ["predecessorTerminalHash", "b".repeat(64)]]) {
    const altered = structuredClone(receipt);
    altered.activeCheckpoint[field] = replacement;
    await assert.rejects(sealRecoveryTransitionReview({ backupReview: review, continuity: { kind: "unsigned-receipt", receiptText: JSON.stringify(altered) }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT }), /does not match every.*checkpoint/i);
  }

  const contradictory = structuredClone(record);
  contradictory.continuity.receipt.activeCheckpoint.payloadDigest = "f".repeat(64);
  delete contradictory.recordSha256;
  contradictory.recordSha256 = await canonicalDigest(contradictory);
  await assert.rejects(validateRecoveryTransitionReview(contradictory), /unsigned continuity checkpoint does not match its source/i);
});

test("a signed terminal can match the payload only under the exact supplied policy pin", async () => {
  const { anchor, review } = await makeFixture();
  const signed = await makeSigned(anchor);
  const material = { kind: "pinned-signed-witness", signedWitnessSetText: signed.signedSetText, trustPolicyText: signed.policyText, expectedPolicyDigest: signed.pin };
  const record = await sealRecoveryTransitionReview({ backupReview: review, continuity: material, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT });
  assert.equal(record.continuity.status, "signed-checkpoint-matches-supplied-policy-pin");
  assert.equal(record.continuity.signedSetRawSha256, await sha256Text(signed.signedSetText));
  assert.equal(record.continuity.policyRawSha256, await sha256Text(signed.policyText));
  assert.equal(record.continuity.terminal.workspaceDigest, review.envelope.payloadSha256);
  assert.equal(record.continuity.terminal.ledgerGenesisHash, review.envelope.snapshot.ledgerGenesisHash);
  assert.equal(record.continuity.terminal.auditHeadDigest, review.envelope.snapshot.terminalHash);
  assert.equal(record.continuity.terminal.terminalStateDigest, review.envelope.snapshot.terminalStateDigest);
  assert.equal(record.continuity.terminal.auditCount, review.envelope.snapshot.auditCount);
  assert.equal(record.continuity.terminal.predecessorTerminalHash, review.envelope.snapshot.predecessorTerminalHash);
  assert.equal(record.correspondence.payloadCheckpoint, "signed-terminal-matches-supplied-policy-pin");
  assert.equal(record.prospectiveDestination.originRelation, "same-origin");
  assert.equal(record.limitations.rawBackupAuthenticity, "not-established");
  assert.equal(record.limitations.policyPinIndependence, "not-established-by-this-record");
  assert.equal(await compareRecoveryTransitionReview(record, { backupReview: review, continuity: material, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT }), true);
  await assert.rejects(sealRecoveryTransitionReview({ backupReview: review, continuity: { ...material, expectedPolicyDigest: "0".repeat(64) }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT }), /does not match.*separate channel/i);

  const mutableMaterial = { ...material };
  const stableSeal = sealRecoveryTransitionReview({ backupReview: review, continuity: mutableMaterial, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT });
  mutableMaterial.signedWitnessSetText = "{}";
  mutableMaterial.trustPolicyText = "{}";
  const stableRecord = await stableSeal;
  assert.equal(stableRecord.continuity.signedSetRawSha256, await sha256Text(signed.signedSetText));
  assert.equal(stableRecord.continuity.policyRawSha256, await sha256Text(signed.policyText));

  const contradictory = structuredClone(record);
  contradictory.continuity.terminal.workspaceDigest = "f".repeat(64);
  delete contradictory.recordSha256;
  contradictory.recordSha256 = await canonicalDigest(contradictory);
  await assert.rejects(validateRecoveryTransitionReview(contradictory), /signed continuity checkpoint does not match its source/i);
});

test("accepted backup timestamps are canonicalized before recovery sealing", async () => {
  const workspace = await createBlankWorkspace("Recovery timestamp fixture");
  const envelope = JSON.parse(await makeWorkspaceBackup(workspace, AT));
  envelope.createdAt = "2026-09-01T00:00:00Z";
  const review = await reviewWorkspaceBackup(new File([JSON.stringify(envelope)], "timestamp-source.json", { type: "application/json" }));
  assert.equal(review.blocked, false, review.summary);
  assert.equal(review.envelope.createdAtClaim, AT);
  const record = await sealRecoveryTransitionReview({ backupReview: review, continuity: { kind: "none" }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT });
  assert.equal(record.source.createdAtClaim, AT);
  assert.deepEqual(await validateRecoveryTransitionReview(record), record);
});

test("internal review hashes detect mutation but cannot authenticate a regenerated history", async () => {
  const { review } = await makeFixture();
  const input = { backupReview: review, continuity: { kind: "none" }, prospectiveDestinationOrigin: ORIGIN, reviewedAtBrowser: AT };
  const original = await sealRecoveryTransitionReview(input);
  const tampered = structuredClone(original);
  tampered.reviewedAtBrowser = "2026-09-02T00:00:00.000Z";
  await assert.rejects(validateRecoveryTransitionReview(tampered), /digest/i);

  const regenerated = structuredClone(tampered);
  delete regenerated.recordSha256;
  regenerated.recordSha256 = await canonicalDigest(regenerated);
  assert.equal((await validateRecoveryTransitionReview(regenerated)).reviewedAtBrowser, regenerated.reviewedAtBrowser, "a fully regenerated internal record remains internally consistent");
  assert.equal(await compareRecoveryTransitionReview(regenerated, input), false, "comparison to the original review/materials exposes the substitution");

  for (const mutation of [
    (record) => { record.unexpected = true; },
    (record) => { record.continuityInherited = true; },
    (record) => { record.limitations.cleanDevice = "verified"; },
    (record) => { record.prospectiveDestination.activationId = "forged"; },
  ]) {
    const hostile = structuredClone(original);
    mutation(hostile);
    await assert.rejects(validateRecoveryTransitionReview(hostile), /unknown|unsupported|overstat|missing|inheritance/i);
  }
});
