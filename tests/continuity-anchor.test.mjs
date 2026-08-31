import assert from "node:assert/strict";
import test from "node:test";
import {
  checkContinuityReceipt,
  CONTINUITY_ACKNOWLEDGMENT,
  continuityPayloadDigest,
  createContinuityAnchor,
  extendContinuityAnchor,
  formatContinuityReceipt,
  parseContinuityReceipt,
  validateContinuityAnchor,
  validateContinuityReceipt,
  verifyContinuityAnchor,
} from "../app/continuity-anchor.ts";
import { createBlankWorkspace, recordWorkspaceAction } from "../app/lab-core.ts";

function acceptance(overrides = {}) {
  return {
    browserTime: "2026-08-31T09:00:00.000Z",
    operatorRole: "Records continuity officer",
    authorityReference: "Continuity policy CP-4, section 3",
    rationale: "Establish an independently retained checkpoint after explicit operator review.",
    sourceKind: "new-workspace",
    sourcePayloadDigest: null,
    sourceAnchorDigest: null,
    acknowledgment: CONTINUITY_ACKNOWLEDGMENT,
    ...overrides,
  };
}

async function makeAnchor(workspace, overrides = {}) {
  return createContinuityAnchor({
    workspace,
    workspaceId: "WS-ANCHOR-1",
    lineageId: "LINEAGE-1",
    generation: 1,
    payloadDigest: await continuityPayloadDigest(workspace),
    initialAcceptance: acceptance(),
    ...overrides,
  });
}

test("an explicit anchor validates and distinguishes local from independently corroborated continuity", async () => {
  const workspace = await createBlankWorkspace("Continuity anchor test");
  const payloadDigest = await continuityPayloadDigest(workspace);
  const anchor = await makeAnchor(workspace);
  assert.deepEqual(await validateContinuityAnchor(anchor), anchor);

  const local = await verifyContinuityAnchor(anchor, {
    workspace,
    workspaceId: anchor.workspaceId,
    lineageId: anchor.lineageId,
    generation: 1,
    payloadDigest,
  });
  assert.equal(local.status, "continuity-verified-local");
  assert.match(local.reason, /authenticity is not established/i);

  const serializedReceipt = formatContinuityReceipt(anchor);
  const receipt = parseContinuityReceipt(serializedReceipt);
  assert.deepEqual(validateContinuityReceipt(receipt), receipt);
  assert.equal(await checkContinuityReceipt(receipt, anchor), true);
  const corroborated = await verifyContinuityAnchor(anchor, {
    workspace,
    workspaceId: anchor.workspaceId,
    lineageId: anchor.lineageId,
    generation: 1,
    payloadDigest,
    independentReceipt: serializedReceipt,
  });
  assert.equal(corroborated.status, "continuity-corroborated");
  assert.match(corroborated.reason, /authenticity is not established/i);
});

test("a fully regenerated, internally valid history cannot replace the retained checkpoint", async () => {
  const original = await createBlankWorkspace("Regenerated history");
  const anchor = await makeAnchor(original);
  const regenerated = await createBlankWorkspace("Regenerated history");
  const result = await verifyContinuityAnchor(anchor, {
    workspace: regenerated,
    workspaceId: anchor.workspaceId,
    lineageId: anchor.lineageId,
    generation: 1,
    payloadDigest: await continuityPayloadDigest(regenerated),
  });
  assert.equal(result.status, "continuity-failure");
  assert.match(result.reason, /payload digest|checkpoint/i);
});

test("anchor validation rejects missing, unknown, prototype-bearing, malformed, and recomputed-looking values", async () => {
  const workspace = await createBlankWorkspace("Strict anchor validation");
  const anchor = await makeAnchor(workspace);

  const missing = structuredClone(anchor);
  delete missing.lineageId;
  await assert.rejects(validateContinuityAnchor(missing), /missing or unknown fields/i);

  const unknown = structuredClone(anchor);
  unknown.authentic = true;
  await assert.rejects(validateContinuityAnchor(unknown), /missing or unknown fields/i);

  const prototypeBearing = structuredClone(anchor);
  Object.setPrototypeOf(prototypeBearing.initialAcceptance, { inheritedAuthority: true });
  await assert.rejects(validateContinuityAnchor(prototypeBearing), /plain object/i);

  const malformed = structuredClone(anchor);
  malformed.activeCheckpoint.terminalHash = "A".repeat(64);
  await assert.rejects(validateContinuityAnchor(malformed), /lowercase SHA-256/i);

  const substituted = structuredClone(anchor);
  substituted.workspaceId = "WS-SUBSTITUTED";
  await assert.rejects(validateContinuityAnchor(substituted), /digest does not match/i);
});

test("workspace and lineage identifiers prevent cross-workspace anchor substitution", async () => {
  const workspace = await createBlankWorkspace("Cross-workspace substitution");
  const anchor = await makeAnchor(workspace);
  const result = await verifyContinuityAnchor(anchor, {
    workspace,
    workspaceId: "WS-OTHER",
    lineageId: anchor.lineageId,
    generation: 1,
    payloadDigest: await continuityPayloadDigest(workspace),
  });
  assert.equal(result.status, "continuity-failure");
  assert.match(result.reason, /different workspace or lineage/i);
});

test("anchor extension requires an exact prior audit prefix and consecutive saved generation", async () => {
  const original = await createBlankWorkspace("Exact audit extension");
  const first = await makeAnchor(original);
  const next = await recordWorkspaceAction(original, "Exercise continuity checkpoint", "RT-CONT-01");
  const second = await extendContinuityAnchor(first, {
    previousWorkspace: original,
    workspace: next,
    generation: 2,
    payloadDigest: await continuityPayloadDigest(next),
  });

  assert.equal(second.sequence, 2);
  assert.equal(second.previousAnchorDigest, first.digest);
  assert.deepEqual(second.previousCheckpoint, first.activeCheckpoint);
  assert.equal(second.activeCheckpoint.auditCount, first.activeCheckpoint.auditCount + 1);

  const unrelated = await recordWorkspaceAction(await createBlankWorkspace("Unrelated history"), "Unrelated save", "RT-CONT-OTHER");
  await assert.rejects(extendContinuityAnchor(first, {
    previousWorkspace: original,
    workspace: unrelated,
    generation: 2,
    payloadDigest: await continuityPayloadDigest(unrelated),
  }), /does not exactly extend/i);

  await assert.rejects(extendContinuityAnchor(first, {
    previousWorkspace: original,
    workspace: next,
    generation: 3,
    payloadDigest: await continuityPayloadDigest(next),
  }), /immediately following saved generation/i);

  await assert.rejects(extendContinuityAnchor(first, {
    previousWorkspace: original,
    workspace: original,
    generation: 2,
    payloadDigest: await continuityPayloadDigest(original),
  }), /does not exactly extend/i);
});

test("a fabricated successor-looking ledger cannot advance an existing workspace anchor", async () => {
  const original = await createBlankWorkspace("Anchored predecessor");
  const anchor = await makeAnchor(original);
  const fabricated = await createBlankWorkspace("Fabricated replacement");
  fabricated.audit = [];
  const successorLooking = await recordWorkspaceAction(
    fabricated,
    "Create successor workspace",
    `prior-ledger-sha256:${original.audit.at(-1).hash}`,
  );

  await assert.doesNotReject(async () => {
    assert.equal(successorLooking.audit[0].previousHash, "GENESIS");
    assert.equal(successorLooking.audit[0].target, `prior-ledger-sha256:${original.audit.at(-1).hash}`);
  });
  await assert.rejects(
    extendContinuityAnchor(anchor, {
      previousWorkspace: original,
      workspace: successorLooking,
      generation: 2,
      payloadDigest: await continuityPayloadDigest(successorLooking),
    }),
    /does not exactly extend.*successor ledger requires a new workspace/i,
  );
});

test("stale receipts and replay against another independent anchor fail closed", async () => {
  const original = await createBlankWorkspace("Receipt replay");
  const first = await makeAnchor(original);
  const staleReceipt = parseContinuityReceipt(formatContinuityReceipt(first));
  const next = await recordWorkspaceAction(original, "Advance anchored history", "RT-CONT-02");
  const second = await extendContinuityAnchor(first, {
    previousWorkspace: original,
    workspace: next,
    generation: 2,
    payloadDigest: await continuityPayloadDigest(next),
  });

  assert.equal(await checkContinuityReceipt(staleReceipt, second), false);
  const staleResult = await verifyContinuityAnchor(second, {
    workspace: next,
    workspaceId: second.workspaceId,
    lineageId: second.lineageId,
    generation: 2,
    payloadDigest: await continuityPayloadDigest(next),
    independentReceipt: staleReceipt,
  });
  assert.equal(staleResult.status, "continuity-failure");
  assert.match(staleResult.reason, /stale|another anchor/i);

  const other = await makeAnchor(await createBlankWorkspace("Receipt replay target"), {
    workspaceId: "WS-ANCHOR-2",
    lineageId: "LINEAGE-2",
  });
  assert.equal(await checkContinuityReceipt(staleReceipt, other), false);
});

test("continuity receipts reject duplicate decoded identities and lone Unicode surrogates before parsing", async () => {
  const anchor = await makeAnchor(await createBlankWorkspace("Receipt JSON quarantine"));
  const receipt = formatContinuityReceipt(anchor);
  const duplicate = receipt.replace('"anchorDigest":', `"anchorDigest":"${"f".repeat(64)}","anchorDigest":`);
  assert.throws(() => parseContinuityReceipt(duplicate), /duplicate member name "anchorDigest"/i);

  const surrogate = receipt.replace('"workspaceId": "WS-ANCHOR-1"', '"workspaceId": "\\uD800"');
  assert.throws(() => parseContinuityReceipt(surrogate), /unpaired Unicode surrogate/i);
});

test("initial acceptance is exact, bounded, canonical, and must disclaim authenticity", async () => {
  const workspace = await createBlankWorkspace("Acceptance bounds");
  const payloadDigest = await continuityPayloadDigest(workspace);
  const base = {
    workspace,
    workspaceId: "WS-ACCEPTANCE",
    lineageId: "LINEAGE-ACCEPTANCE",
    generation: 1,
    payloadDigest,
  };

  await assert.rejects(createContinuityAnchor({ ...base, initialAcceptance: acceptance({ acknowledgment: "I trust it" }) }), /does not establish authenticity/i);
  await assert.rejects(createContinuityAnchor({ ...base, initialAcceptance: acceptance({ operatorRole: "x".repeat(121) }) }), /at most 120/i);
  await assert.rejects(createContinuityAnchor({ ...base, initialAcceptance: acceptance({ rationale: "" }) }), /nonempty canonical text/i);
  await assert.rejects(createContinuityAnchor({ ...base, initialAcceptance: acceptance({ browserTime: "2026-08-31" }) }), /ISO 8601/i);
  await assert.rejects(createContinuityAnchor({ ...base, initialAcceptance: { ...acceptance(), inventedAuthority: true } }), /missing or unknown fields/i);
});

test("the absence of an anchor is represented only as unanchored", async () => {
  const workspace = await createBlankWorkspace("Unanchored workspace");
  const result = await verifyContinuityAnchor(null, {
    workspace,
    workspaceId: "WS-UNANCHORED",
    lineageId: "LINEAGE-UNANCHORED",
    generation: 1,
    payloadDigest: await continuityPayloadDigest(workspace),
  });
  assert.deepEqual(result, {
    status: "unanchored",
    reason: "No separately stored local continuity anchor is available for this workspace.",
    anchorDigest: null,
  });
});
