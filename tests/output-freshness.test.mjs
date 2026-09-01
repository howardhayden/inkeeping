import assert from "node:assert/strict";
import test from "node:test";

import { createBlankWorkspace, recordEvidenceDisposition, upsertServiceRecord } from "../app/lab-core.ts";
import { verifyOutputFreshness } from "../app/output-freshness.ts";
import { makeServiceRecord } from "../app/service-register.ts";

const ACTIVE = { id: "ws-11111111-1111-4111-8111-111111111111", token: "token-a", savedAt: "2026-08-31T00:00:00.000Z" };

function artifact(text = "prepared artifact") {
  return new File([text], "artifact.txt", { type: "text/plain" });
}

async function fileSha256(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function opened(workspace, overrides = {}) {
  const token = overrides.token ?? ACTIVE.token;
  return {
    workspace: structuredClone(workspace),
    manifest: { id: ACTIVE.id, token, payloadDigest: "a".repeat(64) },
    token,
    recoveredFromPrevious: false,
    openedGeneration: 1,
    continuity: { status: "continuity-corroborated", reason: "Current local receipt matches diagnostically; authenticity is not established.", anchorDigest: "b".repeat(64) },
    externalContinuity: { status: "trusted-match", reason: "Signed witness and exact current policy digest match.", witnessDigest: "c".repeat(64), policyId: "policy.test", policyRevision: 1, policyDigest: "d".repeat(64), topology: { status: "corroborated-at-checkpoint" } },
    continuityAnchor: { digest: "b".repeat(64) },
    ...overrides,
  };
}

function context(workspace, overrides = {}) {
  let version = 7;
  return {
    value: {
      activeLocal: ACTIVE,
      dirty: false,
      expectedSessionVersion: 7,
      getSessionVersion: () => version,
      getPendingDrafts: () => false,
      getOperationInProgress: () => false,
      expectedStorageVersion: 3,
      getStorageVersion: () => 3,
      getStorageQuarantined: () => false,
      openWorkspace: async () => opened(workspace),
      activateWorkspace: async () => undefined,
      ...overrides,
    },
    setVersion(next) { version = next; },
  };
}

test("authoritative output receives a current lease only for the exact named saved state", async () => {
  const workspace = await createBlankWorkspace("Fresh output");
  let activation = null;
  const harness = context(workspace, {
    activateWorkspace: async (expected, file, disposition) => { activation = { expected, file, disposition }; },
  });
  const result = await verifyOutputFreshness(workspace, harness.value, "authoritative");

  assert.equal(result.savedCopyStatus, "current");
  assert.deepEqual(result.artifactWorkspace, workspace);
  assert.notEqual(result.artifactWorkspace, workspace, "the artifact is rendered from the reopened saved snapshot, not the React closure");
  const file = artifact("exact artifact bytes");
  await result.activate(file, "download");
  assert.equal(activation.file, file);
  assert.equal(activation.disposition, "download");
  assert.equal(activation.expected.artifactSha256, await fileSha256(file));
});

test("authoritative output fails closed for unnamed, dirty, recovered, changed-token, and substituted saved states", async () => {
  const workspace = await createBlankWorkspace("Fresh output");
  const replacement = await createBlankWorkspace("Substituted output");

  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { activeLocal: null }).value, "authoritative"),
    /named, saved workspace/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { dirty: true }).value, "authoritative"),
    /unsaved changes/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(workspace, { recoveredFromPrevious: true }) }).value, "authoritative"),
    /required recovery/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(workspace, { token: "token-b" }) }).value, "authoritative"),
    /changed in another tab/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(replacement) }).value, "authoritative"),
    /does not exactly match/i,
  );
});

test("authoritative output rejects missing, untrusted, or mismatched external continuity evidence", async () => {
  const workspace = await createBlankWorkspace("Unanchored output");
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(workspace, { externalContinuity: { status: "policy-pin-missing", reason: "No separate policy pin.", witnessDigest: null, policyId: null, policyRevision: null, policyDigest: null, topology: null }, continuityAnchor: null }) }).value, "authoritative"),
    /signed witness chain.*policy digest/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(workspace, { externalContinuity: { status: "invalid-signature", reason: "Invalid signature.", witnessDigest: null, policyId: "policy.test", policyRevision: 1, policyDigest: "d".repeat(64), topology: null } }) }).value, "authoritative"),
    /signed witness chain.*policy digest/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(workspace, { externalContinuity: { status: "content-mismatch", reason: "Anchor mismatch.", witnessDigest: "c".repeat(64), policyId: "policy.test", policyRevision: 1, policyDigest: "d".repeat(64), topology: null } }) }).value, "authoritative"),
    /signed witness chain.*policy digest/i,
  );
});

test("authoritative output rejects structurally valid evidence that remains only operator-admitted", async () => {
  const blank = await createBlankWorkspace("Unverified evidence output");
  const workspace = await recordEvidenceDisposition(blank, {
    source: { kind: "workspace-history", filename: "fabricated.json", format: "workspace-backup-v2", bytes: 100, sha256: "a".repeat(64) },
    review: { structuralStatus: "passed", canonicalPayloadSha256: "b".repeat(64), parserProfile: "workspace-backup-v2" },
    scope: { kind: "workspace", entityIds: [blank.activeRevisionId] },
  }, {
    decision: "admit-unverified", claimedOrigin: "unknown", custodyNote: "Unknown custody.", actorRoleClaim: "Local operator", rationale: "Diagnostic use only.", policyReference: "INC-1", atBrowser: "2026-08-31T00:00:00.000Z", timeBasis: "browser-clock-untrusted",
  }, "Admit fabricated history as unverified");

  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace).value, "authoritative"),
    /blocked by unresolved evidence authority.*do(?:es)? not establish truth or authority/i,
  );
});

test("authoritative output rejects structurally valid but unattributed local service assertions", async () => {
  const blank = await createBlankWorkspace("Unattributed typed output");
  const service = makeServiceRecord("collection-policy", "SRV-FABRICATED", "2026-08-31T00:00:00.000Z");
  Object.assign(service, {
    title: "Official-looking local assertion",
    ownerRole: "Director",
    system: "Policy register",
    state: "active",
    values: { scope: "Fabricated but structurally valid policy text.", audience: ["All patrons"] },
  });
  const workspace = await upsertServiceRecord(blank, service);
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace).value, "authoritative"),
    /blocked by unresolved evidence authority.*locally entered service record.*do(?:es)? not establish truth or authority/i,
  );
});

test("withdrawing an admission cannot launder retained unverified evidence into an outward artifact", async () => {
  const blank = await createBlankWorkspace("Withdrawn claim output");
  const evidence = {
    source: { kind: "workspace-history", filename: "fabricated.json", format: "workspace-backup-v2", bytes: 100, sha256: "c".repeat(64) },
    review: { structuralStatus: "passed", canonicalPayloadSha256: "d".repeat(64), parserProfile: "workspace-backup-v2" },
    scope: { kind: "workspace", entityIds: [blank.activeRevisionId] },
  };
  let workspace = await recordEvidenceDisposition(blank, evidence, {
    decision: "admit-unverified", claimedOrigin: "unknown", custodyNote: "Unknown custody.", actorRoleClaim: "Local operator", rationale: "Diagnostic use only.", policyReference: "INC-2", atBrowser: "2026-08-31T00:00:00.000Z", timeBasis: "browser-clock-untrusted",
  }, "Admit fabricated history as unverified");
  workspace = await recordEvidenceDisposition(workspace, evidence, {
    decision: "withdraw", claimedOrigin: "unknown", custodyNote: "The earlier claim is withdrawn; retained content was not removed.", actorRoleClaim: "Local operator", rationale: "Contradictory source information appeared.", policyReference: "INC-2", atBrowser: "2026-08-31T00:01:00.000Z", timeBasis: "browser-clock-untrusted",
  }, "Withdraw evidence claim");

  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace).value, "authoritative"),
    /blocked by unresolved evidence authority/i,
  );
});

test("storage errors and a session change during the read produce no freshness lease", async () => {
  const workspace = await createBlankWorkspace("Fresh output");
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => { throw new Error("database unavailable"); } }).value, "authoritative"),
    /could not be verified.*database unavailable/i,
  );

  const harness = context(workspace);
  harness.value.openWorkspace = async () => {
    harness.setVersion(8);
    return opened(workspace);
  };
  await assert.rejects(
    verifyOutputFreshness(workspace, harness.value, "authoritative"),
    /session changed while freshness was being verified/i,
  );
});

test("the lease activation detects a saved-generation race after initial verification", async () => {
  const workspace = await createBlankWorkspace("Fresh output");
  let token = ACTIVE.token;
  const harness = context(workspace, { openWorkspace: async () => opened(workspace, { token }) });
  const result = await verifyOutputFreshness(workspace, harness.value, "authoritative");

  token = "token-b";
  await assert.rejects(result.activate(artifact(), "download"), /changed while the artifact was being prepared/i);
});

test("the lease activation rejects mutation of the exact artifact snapshot", async () => {
  const workspace = await createBlankWorkspace("Mutable artifact snapshot");
  const harness = context(workspace);
  const result = await verifyOutputFreshness(workspace, harness.value, "authoritative");

  result.artifactWorkspace.name = "Substituted after verification";
  await assert.rejects(result.activate(artifact(), "download"), /verified artifact snapshot changed/i);
});

test("authoritative output rejects visible drafts and in-flight workspace operations", async () => {
  const workspace = await createBlankWorkspace("Pending UI state");
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { getPendingDrafts: () => true }).value, "authoritative"),
    /save or discard.*form drafts/i,
  );
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { getOperationInProgress: () => true }).value, "authoritative"),
    /operation is still finishing/i,
  );

  let pendingDrafts = false;
  const draftHarness = context(workspace, { getPendingDrafts: () => pendingDrafts });
  const draftLease = await verifyOutputFreshness(workspace, draftHarness.value, "authoritative");
  pendingDrafts = true;
  await assert.rejects(draftLease.activate(artifact(), "download"), /save or discard.*form drafts/i);

  let operationInProgress = false;
  const operationHarness = context(workspace, { getOperationInProgress: () => operationInProgress });
  const lease = await verifyOutputFreshness(workspace, operationHarness.value, "authoritative");
  operationInProgress = true;
  await assert.rejects(lease.activate(artifact(), "download"), /operation is still finishing/i);
});

test("authoritative output binds the current storage-inspection state", async () => {
  const workspace = await createBlankWorkspace("Storage inspection state");
  await assert.rejects(
    verifyOutputFreshness(workspace, context(workspace, { getStorageQuarantined: () => true }).value, "authoritative"),
    /storage is quarantined/i,
  );

  let storageVersion = 3;
  const storageHarness = context(workspace, { getStorageVersion: () => storageVersion });
  const lease = await verifyOutputFreshness(workspace, storageHarness.value, "authoritative");
  storageVersion = 4;
  await assert.rejects(lease.activate(artifact(), "download"), /storage changed while freshness was being verified/i);
});

test("diagnostic output labels visible drafts as unsaved changes", async () => {
  const workspace = await createBlankWorkspace("Draft diagnostic output");
  const result = await verifyOutputFreshness(workspace, context(workspace, { getPendingDrafts: () => true }).value, "diagnostic");
  assert.equal(result.savedCopyStatus, "unsaved-changes");
});

test("diagnostic reports truthfully distinguish working, unsaved, and stale copies", async () => {
  const workspace = await createBlankWorkspace("Diagnostic output");

  const working = await verifyOutputFreshness(workspace, context(workspace, { activeLocal: null }).value, "diagnostic");
  assert.equal(working.savedCopyStatus, "not-saved");

  const unsaved = await verifyOutputFreshness(workspace, context(workspace, { dirty: true }).value, "diagnostic");
  assert.equal(unsaved.savedCopyStatus, "unsaved-changes");

  const stale = await verifyOutputFreshness(workspace, context(workspace, { openWorkspace: async () => opened(workspace, { token: "token-b" }) }).value, "diagnostic");
  assert.equal(stale.savedCopyStatus, "stale");
});

test("a lease is single-use and a storage-fence failure performs no browser activation", async () => {
  const workspace = await createBlankWorkspace("Single-use output");
  let fences = 0;
  const lease = await verifyOutputFreshness(workspace, context(workspace, {
    activateWorkspace: async () => { fences += 1; throw new Error("final fence changed"); },
  }).value, "authoritative");
  const first = lease.activate(artifact("first"), "download");
  await assert.rejects(lease.activate(artifact("second"), "download"), /already consumed/i);
  await assert.rejects(first, /final fence changed/i);
  assert.equal(fences, 1);
});

test("mutation while the second saved-state read is pending is detected before the storage fence", async () => {
  const workspace = await createBlankWorkspace("Pending second read");
  let reads = 0;
  let releaseSecond;
  let secondStarted;
  const secondStartedPromise = new Promise((resolve) => { secondStarted = resolve; });
  const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
  let fences = 0;
  const harness = context(workspace, {
    openWorkspace: async () => {
      reads += 1;
      if (reads === 2) { secondStarted(); await secondGate; }
      return opened(workspace);
    },
    activateWorkspace: async () => { fences += 1; },
  });
  const lease = await verifyOutputFreshness(workspace, harness.value, "authoritative");
  const activation = lease.activate(artifact(), "download");
  await secondStartedPromise;
  lease.artifactWorkspace.name = "Mutated while reopen was pending";
  releaseSecond();
  await assert.rejects(activation, /verified artifact snapshot changed/i);
  assert.equal(fences, 0);
});

test("diagnostic output activates once without claiming a named-workspace fence", async () => {
  const workspace = await createBlankWorkspace("Diagnostic activation");
  let fences = 0;
  let clicks = 0;
  const lease = await verifyOutputFreshness(workspace, context(workspace, {
    activeLocal: null,
    activateWorkspace: async () => { fences += 1; },
  }).value, "diagnostic");
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const anchor = { href: "", rel: "", referrerPolicy: "", download: "", target: "", click: () => { clicks += 1; }, remove: () => undefined };
  globalThis.document = { createElement: () => anchor, body: { append: () => undefined } };
  globalThis.window = { setTimeout: (callback) => { callback(); return 0; } };
  try {
    await lease.activate(artifact(), "download");
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
  assert.equal(fences, 0);
  assert.equal(clicks, 1);
});
