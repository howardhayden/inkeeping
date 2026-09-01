import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  activateAgainstLocalWorkspace,
  clearLocalWorkspaces,
  corroborateLocalContinuityReceipt,
  createLocalWorkspace,
  deleteLocalWorkspace,
  initializeLocalContinuityAnchor,
  inspectLocalWorkspaceRecoveryCandidate,
  inspectLocalWorkspaceStorage,
  listLocalWorkspaces,
  LocalWorkspaceQuarantineError,
  openLocalWorkspace,
  openContinuityVerifiedWorkspace,
  makeLocalContinuityReceipt,
  makeLocalContinuityWitness,
  reconstructLocalWorkspaceFromQuarantine,
  saveLocalWorkspace,
  saveRecoveredLocalWorkspace,
} from "../app/lab-storage.ts";
import { createBlankWorkspace, renameWorkspace } from "../app/lab-core.ts";
import { CONTINUITY_ACKNOWLEDGMENT, createContinuityAnchor, parseContinuityReceipt } from "../app/continuity-anchor.ts";
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
  parseContinuityWitness,
} from "../app/external-continuity.ts";

const DATABASE = "library-access-continuity-lab";
const LEGACY_STORE = "workspaces";
const MANIFEST_STORE = "workspace-manifests";
const GENERATION_STORE = "workspace-generations";
const CONTINUITY_STORE = "workspace-continuity-anchors";

const continuityAcceptance = (overrides = {}) => ({
  operatorRole: "Records continuity lead",
  authorityReference: "TICKET-2026-001",
  rationale: "Accept the reviewed local saved generation as the continuity baseline.",
  sourceKind: "local-workspace",
  sourcePayloadDigest: null,
  sourceAnchorDigest: null,
  acknowledgment: CONTINUITY_ACKNOWLEDGMENT,
  ...overrides,
});

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database deletion was blocked."));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE);
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(GENERATION_STORE)) db.createObjectStore(GENERATION_STORE, { keyPath: ["workspaceId", "generation"] });
      if (!db.objectStoreNames.contains(CONTINUITY_STORE)) db.createObjectStore(CONTINUITY_STORE, { keyPath: "workspaceId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function putLegacy(key, value) {
  const db = await openDatabase();
  const transaction = db.transaction([LEGACY_STORE], "readwrite");
  transaction.objectStore(LEGACY_STORE).put(value, key);
  await transactionDone(transaction);
  db.close();
}

async function readStore(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction([storeName], "readonly");
  const done = transactionDone(transaction);
  const request = transaction.objectStore(storeName).get(key);
  const value = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await done;
  db.close();
  return value;
}

async function updateStore(storeName, key, update) {
  const db = await openDatabase();
  const transaction = db.transaction([storeName], "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  const request = store.get(key);
  request.onsuccess = () => {
    if (request.result === undefined) throw new Error("Test fixture is missing its stored value.");
    store.put(update(request.result));
  };
  await done;
  db.close();
}

async function deleteStoreValue(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction([storeName], "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
  db.close();
}

async function putStoreValue(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction([storeName], "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  db.close();
}

async function putInvalidManifests(count) {
  const db = await openDatabase();
  const transaction = db.transaction([MANIFEST_STORE], "readwrite");
  const store = transaction.objectStore(MANIFEST_STORE);
  for (let index = 0; index < count; index += 1) store.put({ id: `ws-${crypto.randomUUID()}`, invalid: true });
  await transactionDone(transaction);
  db.close();
}

async function putGenerationIndexes(count) {
  const db = await openDatabase();
  const transaction = db.transaction([GENERATION_STORE], "readwrite");
  const store = transaction.objectStore(GENERATION_STORE);
  const workspaceId = `ws-${crypto.randomUUID()}`;
  for (let generation = 1; generation <= count; generation += 1) store.put({ workspaceId, generation });
  await transactionDone(transaction);
  db.close();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fileSha256(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function withBrowserActivation(onClick, task) {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const anchor = { href: "", rel: "", referrerPolicy: "", download: "", target: "", click: onClick, remove: () => undefined };
  globalThis.document = { createElement: () => anchor, body: { append: () => undefined } };
  globalThis.window = { setTimeout: (callback) => { callback(); return 0; } };
  try {
    return await task(anchor);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

async function makeExternalInput(witness) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const unsigned = {
    schema: SIGNED_CONTINUITY_WITNESS_SCHEMA,
    version: SIGNED_CONTINUITY_WITNESS_VERSION,
    witness,
    authorityId: "authority.storage-test",
    keyId: "checkpoint-key",
    suite: CONTINUITY_SIGNATURE_SUITE,
    signature: Buffer.from(new Uint8Array(64)).toString("base64url"),
  };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, continuityWitnessSigningBytes(unsigned));
  const signed = { ...unsigned, signature: Buffer.from(new Uint8Array(signature)).toString("base64url") };
  const policy = {
    schema: CONTINUITY_TRUST_POLICY_SCHEMA,
    version: CONTINUITY_TRUST_POLICY_VERSION,
    policyId: "policy.storage-test",
    authorityId: "authority.storage-test",
    revision: 1,
    keys: [{ keyId: "checkpoint-key", status: "active", publicJwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y } }],
    terminals: [{ workspaceId: witness.workspaceId, lineageId: witness.lineageId, branchId: witness.branchId, originScope: witness.originScope, sequence: witness.sequence, witnessDigest: witness.digest }],
  };
  return {
    signedWitnessSet: JSON.stringify({ schema: CONTINUITY_WITNESS_SET_SCHEMA, version: CONTINUITY_WITNESS_SET_VERSION, witnesses: [signed] }),
    trustPolicy: JSON.stringify(policy),
    expectedPolicyDigest: await continuityTrustPolicyDigest(policy),
    originScope: witness.originScope,
  };
}

async function corruptGeneration(id, generation) {
  await updateStore(GENERATION_STORE, [id, generation], (value) => {
    value.payload.name = "Corrupt payload";
    return value;
  });
}

test("legacy workspaces are claimed once and moved atomically across tabs", async () => {
  await deleteDatabase();
  const first = await createBlankWorkspace("Legacy collection");
  const second = await createBlankWorkspace("Legacy collection");
  await putLegacy("slot-a", first);
  await putLegacy("slot-b", second);

  const tabA = await import("../app/lab-storage.ts?migration-tab-a");
  const tabB = await import("../app/lab-storage.ts?migration-tab-b");
  await Promise.all([tabA.listLocalWorkspaces(), tabB.listLocalWorkspaces()]);
  const manifests = await tabA.listLocalWorkspaces();

  assert.equal(manifests.length, 2);
  assert.equal(new Set(manifests.map((item) => item.normalizedName)).size, 2);
  assert.equal(await readStore(LEGACY_STORE, "slot-a"), undefined);
  assert.equal(await readStore(LEGACY_STORE, "slot-b"), undefined);
});

test("continuity baselines advance with verified saves while unsigned receipts remain diagnostic", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Anchored continuity register");
  const created = await createLocalWorkspace(first);
  const unanchored = await openLocalWorkspace(created.id);
  assert.equal(unanchored.continuity.status, "unanchored");
  await assert.rejects(openContinuityVerifiedWorkspace(created.id), /local continuity checkpoint/i);

  const accepted = await initializeLocalContinuityAnchor(created.id, created.token, continuityAcceptance());
  assert.equal(accepted.status, "continuity-verified-local");
  await assert.rejects(openContinuityVerifiedWorkspace(created.id), /signed witness chain.*policy digest/i);
  const firstAnchor = await readStore(CONTINUITY_STORE, created.id);
  assert.equal(firstAnchor.sequence, 1);

  const receiptText = await makeLocalContinuityReceipt(created.id, created.token);
  const receipt = parseContinuityReceipt(receiptText);
  assert.equal(receipt.anchorDigest, firstAnchor.digest);
  assert.equal(receipt.workspaceId, created.id);
  assert.equal((await corroborateLocalContinuityReceipt(created.id, created.token, receiptText)).status, "continuity-corroborated");
  const anchored = await openLocalWorkspace(created.id, receiptText);
  assert.equal(anchored.continuity.status, "continuity-corroborated");
  await assert.rejects(openContinuityVerifiedWorkspace(created.id, receiptText), /signed witness chain.*policy digest/i);

  const nextWorkspace = await renameWorkspace(first, "Anchored continuity register revised");
  const saved = await saveLocalWorkspace(created.id, nextWorkspace, created.token);
  const nextAnchor = await readStore(CONTINUITY_STORE, created.id);
  assert.equal(nextAnchor.sequence, 2);
  assert.equal(nextAnchor.previousAnchorDigest, firstAnchor.digest);
  assert.equal(nextAnchor.previousCheckpoint.payloadDigest, created.payloadDigest);
  assert.equal(nextAnchor.activeCheckpoint.payloadDigest, saved.payloadDigest);
  await assert.rejects(openContinuityVerifiedWorkspace(created.id), /signed witness chain.*policy digest/i);
  await assert.rejects(corroborateLocalContinuityReceipt(created.id, saved.token, receiptText), /did not corroborate|stale/i);
  const currentReceipt = await makeLocalContinuityReceipt(created.id, saved.token);
  assert.equal((await corroborateLocalContinuityReceipt(created.id, saved.token, currentReceipt)).status, "continuity-corroborated");
  assert.equal((await openLocalWorkspace(created.id, currentReceipt)).workspace.name, "Anchored continuity register revised");
  await assert.rejects(openContinuityVerifiedWorkspace(created.id, currentReceipt), /signed witness chain.*policy digest/i);
});

test("atomic witness creation and an exact pinned signed witness unlock only its current generation", async () => {
  await clearLocalWorkspaces();
  const workspace = await createBlankWorkspace("Externally witnessed storage");
  const created = await createLocalWorkspace(workspace);
  await initializeLocalContinuityAnchor(created.id, created.token, continuityAcceptance());
  const witness = parseContinuityWitness(await makeLocalContinuityWitness(created.id, created.token, "https://example.test"));
  const externalInput = await makeExternalInput(witness);
  const opened = await openContinuityVerifiedWorkspace(created.id, null, externalInput);
  assert.equal(opened.externalContinuity.status, "trusted-match");
  assert.equal(opened.continuity.status, "continuity-verified-local");

  const changed = await renameWorkspace(workspace, "Externally witnessed storage changed");
  const saved = await saveLocalWorkspace(created.id, changed, created.token);
  await assert.rejects(openContinuityVerifiedWorkspace(created.id, null, externalInput), /signed witness chain|signed terminal|checkpoint/i);
  await assert.rejects(makeLocalContinuityWitness(created.id, created.token, "https://example.test"), /changed/i);
  assert.ok(await makeLocalContinuityWitness(created.id, saved.token, "https://example.test"));
});

test("the final activation snapshot observes earlier writes and queues later writes until synchronous activation", async () => {
  await clearLocalWorkspaces();
  const workspace = await createBlankWorkspace("Activation fence storage");
  const created = await createLocalWorkspace(workspace);
  await initializeLocalContinuityAnchor(created.id, created.token, continuityAcceptance());
  const witness = parseContinuityWitness(await makeLocalContinuityWitness(created.id, created.token, "https://example.test"));
  const externalInput = await makeExternalInput(witness);
  const opened = await openContinuityVerifiedWorkspace(created.id, null, externalInput);
  const file = new File(["exact activation bytes"], "activation.txt", { type: "text/plain" });
  const expectation = {
    id: created.id,
    token: opened.token,
    generation: opened.openedGeneration,
    payloadDigest: opened.manifest.payloadDigest,
    anchorDigest: opened.continuityAnchor.digest,
    artifactSha256: await fileSha256(file),
    workspace: opened.workspace,
    continuityAnchor: opened.continuityAnchor,
  };

  const otherConnection = await openDatabase();
  const events = [];
  let mismatchClicks = 0;
  await withBrowserActivation(() => { mismatchClicks += 1; }, async () => {
    await assert.rejects(
      activateAgainstLocalWorkspace(expectation, new File(["substituted bytes"], file.name, { type: file.type }), "download"),
      /prepared artifact bytes changed/i,
    );
  });
  assert.equal(mismatchClicks, 0);

  let writerDone;
  await withBrowserActivation(() => {
    events.push("activation");
    const writer = otherConnection.transaction([MANIFEST_STORE], "readwrite");
    const store = writer.objectStore(MANIFEST_STORE);
    const request = store.get(created.id);
    request.onsuccess = () => store.put({ ...request.result, token: crypto.randomUUID() });
    writerDone = transactionDone(writer).then(() => { events.push("writer completed"); });
  }, async (anchor) => {
    await activateAgainstLocalWorkspace(expectation, file, "download");
    assert.equal(anchor.download, file.name);
  });
  events.push("fence resolved");
  await writerDone;
  otherConnection.close();
  assert.deepEqual(events, ["activation", "fence resolved", "writer completed"]);
  await withBrowserActivation(() => events.push("unsafe activation"), async () => {
    await assert.rejects(activateAgainstLocalWorkspace(expectation, file, "download"), /changed before artifact activation/i);
  });
  assert.equal(events.includes("unsafe activation"), false);
});

test("a wholly regenerated but internally consistent history cannot satisfy the retained local anchor", async () => {
  await clearLocalWorkspaces();
  const original = await createBlankWorkspace("Original anchored history");
  const created = await createLocalWorkspace(original);
  await initializeLocalContinuityAnchor(created.id, created.token, continuityAcceptance());
  const independentlyRetainedReceipt = await makeLocalContinuityReceipt(created.id, created.token);

  const fabricated = await createBlankWorkspace("Fabricated replacement history");
  const serialized = JSON.stringify(fabricated);
  const digest = await sha256Hex(serialized);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  await updateStore(GENERATION_STORE, [created.id, created.activeGeneration], (generation) => ({
    ...generation,
    payloadDigest: digest,
    bytes,
    payload: structuredClone(fabricated),
  }));
  await updateStore(MANIFEST_STORE, created.id, (manifest) => ({
    ...manifest,
    name: fabricated.name,
    normalizedName: fabricated.name.toLocaleLowerCase("en-US"),
    payloadDigest: digest,
    bytes,
    recordCount: 0,
    archiveCount: 0,
    serviceCount: 0,
    incidentCount: 0,
    revisionCount: fabricated.revisions.length,
    auditCount: fabricated.audit.length,
  }));

  const diagnostic = await openLocalWorkspace(created.id);
  assert.equal(diagnostic.workspace.name, "Fabricated replacement history");
  assert.equal(diagnostic.continuity.status, "continuity-failure");
  await assert.rejects(openContinuityVerifiedWorkspace(created.id), /continuity verification.*anchor|checkpoint|does not match/i);

  const replacementAnchor = await createContinuityAnchor({
    workspace: fabricated,
    workspaceId: created.id,
    lineageId: `lineage-${crypto.randomUUID()}`,
    generation: created.activeGeneration,
    payloadDigest: digest,
    initialAcceptance: { ...continuityAcceptance(), browserTime: "2026-08-31T00:00:00.000Z" },
  });
  await putStoreValue(CONTINUITY_STORE, replacementAnchor);
  assert.equal((await openLocalWorkspace(created.id)).continuity.status, "continuity-verified-local", "coherent replacement of every local store is locally indistinguishable");
  await assert.rejects(corroborateLocalContinuityReceipt(created.id, created.token, independentlyRetainedReceipt), /did not corroborate|stale|another anchor/i);
});

test("continuity acceptance cannot silently replace an existing anchor and deletion removes only the local checkpoint", async () => {
  await clearLocalWorkspaces();
  const workspace = await createBlankWorkspace("Immutable local anchor");
  const created = await createLocalWorkspace(workspace);
  await initializeLocalContinuityAnchor(created.id, created.token, continuityAcceptance());
  const anchor = await readStore(CONTINUITY_STORE, created.id);
  await assert.rejects(initializeLocalContinuityAnchor(created.id, created.token, continuityAcceptance({ rationale: "Attempted silent re-anchor." })), /already has a continuity anchor|cannot be silently re-anchored/i);
  assert.deepEqual(await readStore(CONTINUITY_STORE, created.id), anchor);
  await deleteLocalWorkspace(created.id, created.token);
  assert.equal(await readStore(CONTINUITY_STORE, created.id), undefined);
});

test("saves bind both retained generations, reject stale tokens, and preserve failed bytes during recovery", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Continuity register");
  const created = await createLocalWorkspace(first);
  const second = await renameWorkspace(first, "Continuity register revised");
  const saved = await saveLocalWorkspace(created.id, second, created.token);

  await assert.rejects(saveLocalWorkspace(created.id, second, created.token), /changed in another tab/i);
  const current = await openLocalWorkspace(created.id);
  assert.equal(current.recoveredFromPrevious, false);
  assert.equal(current.workspace.name, "Continuity register revised");
  assert.equal(current.manifest.previousGeneration, 1);
  assert.equal(current.manifest.previousPayloadDigest, created.payloadDigest);
  await assert.rejects(inspectLocalWorkspaceRecoveryCandidate(created.id, current.openedGeneration), /matching valid manifest/i);

  await corruptGeneration(created.id, current.openedGeneration);
  const recovered = await openLocalWorkspace(created.id);
  assert.equal(recovered.recoveredFromPrevious, true);
  assert.equal(recovered.openedGeneration, 1);
  assert.equal(recovered.workspace.name, "Continuity register");
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));

  const repaired = await saveRecoveredLocalWorkspace(created.id, recovered.workspace, recovered.token, recovered.openedGeneration);
  assert.equal(repaired.previousGeneration, 1);
  assert.equal(repaired.previousPayloadDigest, created.payloadDigest);
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
  assert.ok(await readStore(GENERATION_STORE, [created.id, repaired.activeGeneration]));
  assert.ok(await readStore(GENERATION_STORE, [created.id, 1]));
  assert.equal((await openLocalWorkspace(created.id)).recoveredFromPrevious, false);
});

test("normal save refuses to rotate away the last verified fallback when the active generation vanished", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Vanishing active generation");
  const created = await createLocalWorkspace(first);
  const second = await renameWorkspace(first, "Vanishing active generation revised");
  const saved = await saveLocalWorkspace(created.id, second, created.token);
  const openTab = await openLocalWorkspace(created.id);

  await deleteStoreValue(GENERATION_STORE, [created.id, saved.activeGeneration]);
  const third = await renameWorkspace(openTab.workspace, "Stale tab must not rotate fallback");
  await assert.rejects(saveLocalWorkspace(created.id, third, openTab.token), /generation.*verify|integrity|reopen/i);

  const manifest = await readStore(MANIFEST_STORE, created.id);
  assert.equal(manifest.activeGeneration, saved.activeGeneration);
  assert.equal(manifest.previousGeneration, created.activeGeneration);
  assert.ok(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]));
});

test("normal save refuses to delete a corrupt manifest-bound previous generation", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Corrupt previous generation");
  const created = await createLocalWorkspace(first);
  const second = await renameWorkspace(first, "Corrupt previous generation revised");
  const saved = await saveLocalWorkspace(created.id, second, created.token);
  const opened = await openLocalWorkspace(created.id);

  await corruptGeneration(created.id, created.activeGeneration);
  const corruptPrevious = await readStore(GENERATION_STORE, [created.id, created.activeGeneration]);
  const third = await renameWorkspace(opened.workspace, "Corrupt previous generation must remain quarantined");
  await assert.rejects(saveLocalWorkspace(created.id, third, opened.token), /previous generation.*verif|cannot be rotated/i);

  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), saved);
  assert.deepEqual(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]), corruptPrevious);
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
});

test("normal save refuses to rotate a missing manifest-bound previous generation", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Missing previous generation");
  const created = await createLocalWorkspace(first);
  const second = await renameWorkspace(first, "Missing previous generation revised");
  const saved = await saveLocalWorkspace(created.id, second, created.token);
  const opened = await openLocalWorkspace(created.id);

  await deleteStoreValue(GENERATION_STORE, [created.id, created.activeGeneration]);
  const third = await renameWorkspace(opened.workspace, "Missing previous generation must block rotation");
  await assert.rejects(saveLocalWorkspace(created.id, third, opened.token), /previous generation.*verif|cannot be rotated/i);

  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), saved);
  assert.equal(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]), undefined);
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
});

test("valid-shaped manifest display metadata must exactly match its verified active generation", async () => {
  const mutations = [
    ["name", (manifest) => ({ ...manifest, name: "Fabricated display name", normalizedName: "fabricated display name" })],
    ["savedAt", (manifest) => ({ ...manifest, savedAt: new Date(Date.parse(manifest.savedAt) + 1000).toISOString() })],
    ["bytes", (manifest) => ({ ...manifest, bytes: manifest.bytes + 1 })],
    ["recordCount", (manifest) => ({ ...manifest, recordCount: manifest.recordCount + 1 })],
    ["archiveCount", (manifest) => ({ ...manifest, archiveCount: manifest.archiveCount + 1 })],
    ["serviceCount", (manifest) => ({ ...manifest, serviceCount: manifest.serviceCount + 1 })],
    ["incidentCount", (manifest) => ({ ...manifest, incidentCount: manifest.incidentCount + 1 })],
    ["revisionCount", (manifest) => ({ ...manifest, revisionCount: manifest.revisionCount + 1 })],
    ["auditCount", (manifest) => ({ ...manifest, auditCount: manifest.auditCount + 1 })],
  ];

  for (const [field, mutate] of mutations) {
    await clearLocalWorkspaces();
    const created = await createLocalWorkspace(await createBlankWorkspace(`Metadata binding ${field}`));
    const stored = await readStore(GENERATION_STORE, [created.id, created.activeGeneration]);
    await updateStore(MANIFEST_STORE, created.id, mutate);

    await assert.rejects(listLocalWorkspaces(), LocalWorkspaceQuarantineError, `${field} mismatch must not list`);
    const inspection = await inspectLocalWorkspaceStorage();
    assert.equal(inspection.workspaces.some((manifest) => manifest.id === created.id), false, `${field} mismatch must not surface a display manifest`);
    assert.deepEqual(inspection.quarantine[0].reasons, ["invalid-manifest"]);
    assert.deepEqual(inspection.quarantine[0].generations, [created.activeGeneration]);
    await assert.rejects(openLocalWorkspace(created.id), /manifest.*metadata.*disagree|integrity/i, `${field} mismatch must not open`);
    assert.deepEqual(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]), stored, `${field} mismatch must preserve stored bytes`);
  }
});

test("missing active storage never surfaces fabricated manifest metadata for a verified fallback", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Verified fallback identity");
  const created = await createLocalWorkspace(first);
  const second = await renameWorkspace(first, "Newer active identity");
  const saved = await saveLocalWorkspace(created.id, second, created.token);

  await updateStore(MANIFEST_STORE, created.id, (manifest) => ({
    ...manifest,
    name: "Fabricated authority label",
    normalizedName: "fabricated authority label",
    recordCount: 999,
  }));
  await deleteStoreValue(GENERATION_STORE, [created.id, saved.activeGeneration]);

  const inspection = await inspectLocalWorkspaceStorage();
  assert.equal(inspection.workspaces.some((manifest) => manifest.id === created.id), false);
  assert.deepEqual(inspection.quarantine[0].reasons, ["missing-active-generation"]);
  assert.deepEqual(inspection.quarantine[0].generations, [created.activeGeneration]);

  const candidate = await inspectLocalWorkspaceRecoveryCandidate(created.id, created.activeGeneration);
  assert.equal(candidate.name, "Verified fallback identity");
  assert.equal(candidate.recordCount, 0);

  const opened = await openLocalWorkspace(created.id);
  assert.equal(opened.recoveredFromPrevious, true);
  assert.equal(opened.workspace.name, "Verified fallback identity");
  assert.equal(opened.manifest.name, "Verified fallback identity");
  assert.equal(opened.manifest.recordCount, 0);
  assert.equal(opened.manifest.activeGeneration, opened.openedGeneration);
});

test("save rejects an active generation that cannot be safely incremented", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Generation boundary");
  const created = await createLocalWorkspace(first);
  const stored = await readStore(GENERATION_STORE, [created.id, created.activeGeneration]);
  await deleteStoreValue(GENERATION_STORE, [created.id, created.activeGeneration]);
  await putStoreValue(GENERATION_STORE, { ...stored, generation: Number.MAX_SAFE_INTEGER });
  await updateStore(MANIFEST_STORE, created.id, (manifest) => ({ ...manifest, activeGeneration: Number.MAX_SAFE_INTEGER }));
  const boundaryManifest = await readStore(MANIFEST_STORE, created.id);
  const opened = await openLocalWorkspace(created.id);

  await assert.rejects(
    saveLocalWorkspace(created.id, await renameWorkspace(opened.workspace, "Generation boundary blocked"), opened.token),
    /generation.*safely increment/i,
  );
  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), boundaryManifest);
  assert.deepEqual(await readStore(GENERATION_STORE, [created.id, Number.MAX_SAFE_INTEGER]), { ...stored, generation: Number.MAX_SAFE_INTEGER });
});

test("recovery save refuses to substitute a workspace while the active generation is healthy", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Healthy active recovery guard");
  const created = await createLocalWorkspace(first);
  const saved = await saveLocalWorkspace(created.id, await renameWorkspace(first, "Healthy active recovery guard revised"), created.token);

  await assert.rejects(
    saveRecoveredLocalWorkspace(created.id, first, saved.token, created.activeGeneration),
    /active generation.*verif|recovery.*refused/i,
  );
  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), saved);
  assert.ok(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]));
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
});

test("recovery save binds its input to the verified fallback generation", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Bound recovery input");
  const created = await createLocalWorkspace(first);
  const saved = await saveLocalWorkspace(created.id, await renameWorkspace(first, "Bound recovery input revised"), created.token);
  await corruptGeneration(created.id, saved.activeGeneration);
  const corruptActive = await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]);
  const unrelated = await createBlankWorkspace("Unrelated recovery substitution");

  await assert.rejects(
    saveRecoveredLocalWorkspace(created.id, unrelated, saved.token, created.activeGeneration),
    /recovery.*input.*verified fallback|does not match.*fallback/i,
  );
  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), saved);
  assert.ok(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]));
  assert.deepEqual(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]), corruptActive);
});

test("a substituted fallback generation is rejected against the manifest-bound digest", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Bound collection");
  const created = await createLocalWorkspace(first);
  const saved = await saveLocalWorkspace(created.id, await renameWorkspace(first, "Bound collection revised"), created.token);
  const replacement = await createBlankWorkspace("Unrelated collection");
  const replacementText = JSON.stringify(replacement);
  const replacementDigest = await sha256Hex(replacementText);

  await updateStore(GENERATION_STORE, [created.id, created.activeGeneration], (generation) => ({
    ...generation,
    payload: replacement,
    payloadDigest: replacementDigest,
    bytes: new TextEncoder().encode(replacementText).byteLength,
  }));
  await corruptGeneration(created.id, saved.activeGeneration);

  await assert.rejects(openLocalWorkspace(created.id), /integrity verification failed/i);
  assert.equal((await readStore(GENERATION_STORE, [created.id, created.activeGeneration])).payload.name, "Unrelated collection");
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
});

test("an active generation and manifest digest disagreement never rolls back to the fallback", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Digest authority");
  const created = await createLocalWorkspace(first);
  const saved = await saveLocalWorkspace(created.id, await renameWorkspace(first, "Digest authority current"), created.token);

  await updateStore(MANIFEST_STORE, created.id, (manifest) => ({ ...manifest, payloadDigest: "0".repeat(64) }));

  await assert.rejects(openLocalWorkspace(created.id), /active generation and its manifest digest disagree/i);
  const candidate = await inspectLocalWorkspaceRecoveryCandidate(created.id, saved.activeGeneration);
  assert.ok(candidate);
  assert.equal(candidate.payloadDigest, saved.payloadDigest);
  const reconstructed = await reconstructLocalWorkspaceFromQuarantine(created.id, saved.activeGeneration, candidate.payloadDigest, "Digest authority reconstruction");
  assert.equal((await openLocalWorkspace(reconstructed.id)).workspace.name, "Digest authority reconstruction");
  assert.equal((await readStore(GENERATION_STORE, [created.id, saved.activeGeneration])).payload.name, "Digest authority current");
  assert.equal((await readStore(GENERATION_STORE, [created.id, created.activeGeneration])).payload.name, "Digest authority");
});

test("legacy manifests without a fallback digest open an intact active generation but block destructive rotation", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Legacy digest manifest");
  const created = await createLocalWorkspace(first);
  const saved = await saveLocalWorkspace(created.id, await renameWorkspace(first, "Legacy digest manifest current"), created.token);
  await updateStore(MANIFEST_STORE, created.id, (manifest) => {
    delete manifest.previousPayloadDigest;
    return manifest;
  });

  const opened = await openLocalWorkspace(created.id);
  assert.equal(opened.workspace.name, "Legacy digest manifest current");
  const legacyManifest = await readStore(MANIFEST_STORE, created.id);
  await assert.rejects(
    saveLocalWorkspace(created.id, await renameWorkspace(opened.workspace, "Legacy digest manifest blocked"), opened.token),
    /previous generation is not bound.*cannot be rotated/i,
  );
  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), legacyManifest);
  assert.ok(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]));
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
});

test("legacy manifests never trust an unbound fallback generation", async () => {
  await clearLocalWorkspaces();
  const first = await createBlankWorkspace("Legacy unbound fallback");
  const created = await createLocalWorkspace(first);
  const saved = await saveLocalWorkspace(created.id, await renameWorkspace(first, "Legacy unbound current"), created.token);
  await updateStore(MANIFEST_STORE, created.id, (manifest) => {
    delete manifest.previousPayloadDigest;
    return manifest;
  });
  await corruptGeneration(created.id, saved.activeGeneration);

  await assert.rejects(openLocalWorkspace(created.id), /legacy manifest does not bind its fallback generation/i);
  await assert.rejects(saveRecoveredLocalWorkspace(created.id, first, saved.token, created.activeGeneration), /not bound by this manifest/i);
  assert.ok(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]));
  assert.ok(await readStore(GENERATION_STORE, [created.id, saved.activeGeneration]));
});

test("invalid manifests are quarantined and verified generations reconstruct only into a new workspace", async () => {
  await clearLocalWorkspaces();
  const created = await createLocalWorkspace(await createBlankWorkspace("Manifest quarantine source"));
  await updateStore(MANIFEST_STORE, created.id, (manifest) => ({ ...manifest, token: "corrupt" }));
  const quarantinedManifest = await readStore(MANIFEST_STORE, created.id);
  const quarantinedGeneration = await readStore(GENERATION_STORE, [created.id, created.activeGeneration]);

  await assert.rejects(listLocalWorkspaces(), (error) => {
    assert.ok(error instanceof LocalWorkspaceQuarantineError);
    assert.equal(error.inspection.workspaces.length, 0);
    assert.equal(error.inspection.quarantine.length, 1);
    return true;
  });
  const inspection = await inspectLocalWorkspaceStorage();
  assert.deepEqual(inspection.quarantine[0].reasons, ["invalid-manifest"]);
  assert.deepEqual(inspection.quarantine[0].generations, [created.activeGeneration]);

  const candidate = await inspectLocalWorkspaceRecoveryCandidate(created.id, created.activeGeneration);
  assert.ok(candidate);
  assert.equal(candidate.name, "Manifest quarantine source");
  assert.equal(candidate.payloadDigest, created.payloadDigest);
  const reconstructed = await reconstructLocalWorkspaceFromQuarantine(created.id, created.activeGeneration, candidate.payloadDigest, "Manifest quarantine reconstruction");

  assert.notEqual(reconstructed.id, created.id);
  const openedReconstruction = await openLocalWorkspace(reconstructed.id);
  assert.equal(openedReconstruction.workspace.name, "Manifest quarantine reconstruction");
  assert.equal(openedReconstruction.workspace.audit.at(-1).action, "Reconstruct quarantined local workspace");
  assert.match(openedReconstruction.workspace.audit.at(-1).target, new RegExp(candidate.payloadDigest));
  assert.deepEqual(await readStore(MANIFEST_STORE, created.id), quarantinedManifest);
  assert.deepEqual(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]), quarantinedGeneration);
  const after = await inspectLocalWorkspaceStorage();
  assert.equal(after.workspaces.some((manifest) => manifest.id === reconstructed.id), true);
  assert.equal(after.quarantine.some((entry) => entry.workspaceId === created.id), true);
});

test("orphan generations are quarantined and can be explicitly copied without deleting the orphan", async () => {
  await clearLocalWorkspaces();
  const created = await createLocalWorkspace(await createBlankWorkspace("Orphan source"));
  const originalGeneration = await readStore(GENERATION_STORE, [created.id, created.activeGeneration]);
  await deleteStoreValue(MANIFEST_STORE, created.id);

  const inspection = await inspectLocalWorkspaceStorage();
  assert.deepEqual(inspection.workspaces, []);
  assert.deepEqual(inspection.quarantine[0].reasons, ["missing-manifest"]);
  assert.deepEqual(inspection.quarantine[0].generations, [created.activeGeneration]);
  const candidate = await inspectLocalWorkspaceRecoveryCandidate(created.id, created.activeGeneration);
  assert.ok(candidate);
  const reconstructed = await reconstructLocalWorkspaceFromQuarantine(created.id, created.activeGeneration, candidate.payloadDigest, "Orphan reconstruction");

  assert.notEqual(reconstructed.id, created.id);
  assert.deepEqual(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]), originalGeneration);
  assert.equal(await readStore(MANIFEST_STORE, created.id), undefined);
});

test("quarantine inspection never surfaces a generation whose payload or audit no longer verifies", async () => {
  await clearLocalWorkspaces();
  const created = await createLocalWorkspace(await createBlankWorkspace("Invalid orphan"));
  await deleteStoreValue(MANIFEST_STORE, created.id);
  await corruptGeneration(created.id, created.activeGeneration);

  assert.equal(await inspectLocalWorkspaceRecoveryCandidate(created.id, created.activeGeneration), null);
  await assert.rejects(
    reconstructLocalWorkspaceFromQuarantine(created.id, created.activeGeneration, created.payloadDigest, "Must not reconstruct"),
    /changed or no longer verifies/i,
  );
  assert.ok(await readStore(GENERATION_STORE, [created.id, created.activeGeneration]));
  assert.equal(await readStore(MANIFEST_STORE, created.id), undefined);
});

test("storage inspection fails closed at its manifest cursor boundary", async () => {
  await clearLocalWorkspaces();
  await putInvalidManifests(100);
  assert.equal((await inspectLocalWorkspaceStorage()).scannedManifests, 100);
  await putInvalidManifests(1);
  await assert.rejects(inspectLocalWorkspaceStorage(), /manifest inspection exceeds 100 entries/i);
});

test("storage inspection fails closed at its generation-key cursor boundary", async () => {
  await clearLocalWorkspaces();
  await putGenerationIndexes(256);
  assert.equal((await inspectLocalWorkspaceStorage()).scannedGenerations, 256);
  await putGenerationIndexes(1);
  await assert.rejects(inspectLocalWorkspaceStorage(), /generation inspection exceeds 256 entries/i);
});

test("delete and clear remove manifests, generations, and legacy values", async () => {
  await clearLocalWorkspaces();
  const first = await createLocalWorkspace(await createBlankWorkspace("Delete one"));
  const second = await createLocalWorkspace(await createBlankWorkspace("Delete all"));

  await assert.rejects(deleteLocalWorkspace(first.id, crypto.randomUUID()), /changed in another tab/i);
  assert.ok(await readStore(MANIFEST_STORE, first.id));
  await deleteLocalWorkspace(first.id, first.token);
  assert.equal(await readStore(MANIFEST_STORE, first.id), undefined);
  assert.equal(await readStore(GENERATION_STORE, [first.id, first.activeGeneration]), undefined);

  await putLegacy("leftover", await createBlankWorkspace("Legacy leftover"));
  await clearLocalWorkspaces();
  assert.deepEqual(await listLocalWorkspaces(), []);
  assert.equal(await readStore(MANIFEST_STORE, second.id), undefined);
  assert.equal(await readStore(GENERATION_STORE, [second.id, second.activeGeneration]), undefined);
  assert.equal(await readStore(LEGACY_STORE, "leftover"), undefined);
});
