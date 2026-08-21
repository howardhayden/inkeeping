import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  clearLocalWorkspaces,
  createLocalWorkspace,
  deleteLocalWorkspace,
  inspectLocalWorkspaceRecoveryCandidate,
  inspectLocalWorkspaceStorage,
  listLocalWorkspaces,
  LocalWorkspaceQuarantineError,
  openLocalWorkspace,
  reconstructLocalWorkspaceFromQuarantine,
  saveLocalWorkspace,
  saveRecoveredLocalWorkspace,
} from "../app/lab-storage.ts";
import { createBlankWorkspace, renameWorkspace } from "../app/lab-core.ts";

const DATABASE = "library-access-continuity-lab";
const LEGACY_STORE = "workspaces";
const MANIFEST_STORE = "workspace-manifests";
const GENERATION_STORE = "workspace-generations";

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
    const request = globalThis.indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE);
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(GENERATION_STORE)) db.createObjectStore(GENERATION_STORE, { keyPath: ["workspaceId", "generation"] });
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

test("legacy manifests without a fallback digest open an intact active generation and upgrade on save", async () => {
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
  const upgraded = await saveLocalWorkspace(created.id, await renameWorkspace(opened.workspace, "Legacy digest manifest upgraded"), opened.token);
  assert.equal(upgraded.previousGeneration, saved.activeGeneration);
  assert.equal(upgraded.previousPayloadDigest, saved.payloadDigest);
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
