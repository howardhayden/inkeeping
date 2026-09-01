import { MAX_AUDIT_EVENTS, activeRevision, forkWorkspace, renameWorkspace, validateWorkspaceSnapshot, type Workspace } from "./lab-core.ts";
import {
  CONTINUITY_ACKNOWLEDGMENT,
  createContinuityAnchor,
  extendContinuityAnchor,
  formatContinuityReceipt,
  validateContinuityAnchor,
  verifyContinuityAnchor,
  type ContinuityAcceptance,
  type ContinuityAnchor,
  type ContinuityVerification,
} from "./continuity-anchor.ts";
import {
  createContinuityWitness,
  formatContinuityWitness,
  parseContinuityTrustPolicy,
  parseSignedContinuityWitnessSet,
  verifyExternalContinuity,
  type ExternalContinuityVerification,
} from "./external-continuity.ts";
import { activateBrowserFile, isBrowserFile, readBrowserFileBytes, type BrowserFileDisposition } from "./browser-file-activation.ts";

// The durable database name is intentionally retained across the product rename so
// existing browser-local work is not stranded.
const DATABASE = "library-access-continuity-lab";
const LEGACY_STORE = "workspaces";
const MANIFEST_STORE = "workspace-manifests";
const GENERATION_STORE = "workspace-generations";
const CONTINUITY_STORE = "workspace-continuity-anchors";
const DB_VERSION = 3;
const CHANGE_CHANNEL = "in-keeping-local-workspaces";

export const MAX_LOCAL_WORKSPACES = 50;
export const MAX_WORKSPACE_BYTES = 25 * 1024 * 1024;
export const MAX_STORAGE_INSPECTION_MANIFESTS = 100;
export const MAX_STORAGE_INSPECTION_GENERATIONS = 256;
const MAX_STORAGE_INSPECTION_NODES = 1_000_000;
const MAX_STORAGE_INSPECTION_DEPTH = 18;

export type LocalWorkspaceManifest = {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  savedAt: string;
  activeGeneration: number;
  previousGeneration: number | null;
  previousPayloadDigest?: string | null;
  payloadDigest: string;
  bytes: number;
  recordCount: number;
  archiveCount: number;
  serviceCount: number;
  incidentCount: number;
  revisionCount: number;
  auditCount: number;
  token: string;
};

type StoredGeneration = {
  workspaceId: string;
  generation: number;
  savedAt: string;
  payloadDigest: string;
  bytes: number;
  payload: Workspace;
};

type StoredWorkspaceBundle = {
  manifest: LocalWorkspaceManifest | undefined;
  active: StoredGeneration | undefined;
  previous: StoredGeneration | undefined;
  anchor: ContinuityAnchor | undefined;
};

export type LocalWorkspaceOpen = {
  workspace: Workspace;
  manifest: LocalWorkspaceManifest;
  token: string;
  recoveredFromPrevious: boolean;
  openedGeneration: number;
  continuity: ContinuityVerification;
  externalContinuity: ExternalContinuityVerification;
  continuityAnchor: ContinuityAnchor | null;
};

export type LocalExternalContinuityInput = {
  signedWitnessSet: string;
  trustPolicy: string;
  expectedPolicyDigest: string;
  originScope: string;
};

export type LocalWorkspaceActivationExpectation = {
  id: string;
  token: string;
  generation: number;
  payloadDigest: string;
  anchorDigest: string;
  artifactSha256: string;
  workspace: Workspace;
  continuityAnchor: ContinuityAnchor;
};

export type LocalContinuityAcceptanceInput = Omit<ContinuityAcceptance, "browserTime" | "acknowledgment"> & {
  acknowledgment: typeof CONTINUITY_ACKNOWLEDGMENT;
};

export type LocalStorageStatus = {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
};

export type LocalWorkspaceRecoveryCandidate = {
  workspaceId: string;
  generation: number;
  payloadDigest: string;
  name: string;
  updatedAt: string;
  bytes: number;
  recordCount: number;
  archiveCount: number;
  serviceCount: number;
  incidentCount: number;
};

export type LocalWorkspaceQuarantineEntry = {
  workspaceId: string | null;
  reasons: ("invalid-manifest" | "missing-manifest" | "unreferenced-generation" | "missing-active-generation" | "missing-previous-generation" | "invalid-generation-index")[];
  generations: number[];
};

export type LocalWorkspaceStorageInspection = {
  workspaces: LocalWorkspaceManifest[];
  quarantine: LocalWorkspaceQuarantineEntry[];
  scannedManifests: number;
  scannedGenerations: number;
};

export class LocalWorkspaceQuarantineError extends Error {
  readonly inspection: LocalWorkspaceStorageInspection;

  constructor(inspection: LocalWorkspaceStorageInspection) {
    super(`Browser-local storage contains ${inspection.quarantine.length} quarantined workspace ${inspection.quarantine.length === 1 ? "entry" : "entries"}. Inspect recovery candidates before continuing.`);
    this.name = "LocalWorkspaceQuarantineError";
    this.inspection = inspection;
  }
}

let migrationTask: Promise<void> | null = null;

export function createWorkspaceId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") throw new Error("Secure local workspace identifiers are unavailable in this browser.");
  return `ws-${crypto.randomUUID()}`;
}

export async function listLocalWorkspaces(): Promise<LocalWorkspaceManifest[]> {
  const inspection = await inspectLocalWorkspaceStorage();
  if (inspection.quarantine.length) throw new LocalWorkspaceQuarantineError(inspection);
  return inspection.workspaces;
}

export async function inspectLocalWorkspaceStorage(): Promise<LocalWorkspaceStorageInspection> {
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    const manifestEntries = await readManifestIndexBounded(db);
    const generationKeysFound = await readKeysBounded(db, GENERATION_STORE, MAX_STORAGE_INSPECTION_GENERATIONS, "generation");
    const validManifests = new Map<string, LocalWorkspaceManifest>();
    const rawManifestIds = new Set<string>();
    const quarantine = new Map<string, LocalWorkspaceQuarantineEntry>();
    const generationKeys = new Set<string>();

    const quarantineEntry = (workspaceId: string | null) => {
      const key = workspaceId ?? "[invalid-generation-index]";
      const current = quarantine.get(key) ?? { workspaceId, reasons: [], generations: [] } satisfies LocalWorkspaceQuarantineEntry;
      quarantine.set(key, current);
      return current;
    };
    const addReason = (entry: LocalWorkspaceQuarantineEntry, reason: LocalWorkspaceQuarantineEntry["reasons"][number]) => {
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    };
    const addGeneration = (entry: LocalWorkspaceQuarantineEntry, generation: number) => {
      if (!entry.generations.includes(generation)) entry.generations.push(generation);
    };

    for (const entry of manifestEntries) {
      const id = typeof entry.key === "string" && isWorkspaceId(entry.key) ? entry.key : null;
      if (id) rawManifestIds.add(id);
      if (entry.manifest && id === entry.manifest.id) validManifests.set(id, entry.manifest);
      else addReason(quarantineEntry(id), "invalid-manifest");
    }

    for (const key of generationKeysFound) {
      const index = generationIndex(key);
      if (!index) {
        addReason(quarantineEntry(null), "invalid-generation-index");
        continue;
      }
      generationKeys.add(generationKey(index.workspaceId, index.generation));
      const manifest = validManifests.get(index.workspaceId);
      if (!rawManifestIds.has(index.workspaceId)) {
        const item = quarantineEntry(index.workspaceId);
        addReason(item, "missing-manifest");
        addGeneration(item, index.generation);
      } else if (!manifest) {
        const item = quarantineEntry(index.workspaceId);
        addReason(item, "invalid-manifest");
        addGeneration(item, index.generation);
      } else if (index.generation !== manifest.activeGeneration && index.generation !== manifest.previousGeneration) {
        const item = quarantineEntry(index.workspaceId);
        addReason(item, "unreferenced-generation");
        addGeneration(item, index.generation);
      }
    }

    for (const manifest of [...validManifests.values()]) {
      const item = quarantineEntry(manifest.id);
      if (!generationKeys.has(generationKey(manifest.id, manifest.activeGeneration))) {
        addReason(item, "missing-active-generation");
        if (manifest.previousGeneration !== null && generationKeys.has(generationKey(manifest.id, manifest.previousGeneration))) addGeneration(item, manifest.previousGeneration);
        validManifests.delete(manifest.id);
      } else {
        const stored = await readOne<StoredGeneration>(db, GENERATION_STORE, [manifest.id, manifest.activeGeneration]);
        const verified = await verifyGeneration(stored, manifest.payloadDigest);
        if (verified.status !== "verified" || !activeManifestMetadataMatches(manifest, stored, verified.workspace)) {
          addReason(item, "invalid-manifest");
          addGeneration(item, manifest.activeGeneration);
          if (manifest.previousGeneration !== null && generationKeys.has(generationKey(manifest.id, manifest.previousGeneration))) addGeneration(item, manifest.previousGeneration);
          validManifests.delete(manifest.id);
        }
      }
      if (manifest.previousGeneration !== null && !generationKeys.has(generationKey(manifest.id, manifest.previousGeneration))) addReason(item, "missing-previous-generation");
      if (!item.reasons.length) quarantine.delete(manifest.id);
    }

    return {
      workspaces: [...validManifests.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.name.localeCompare(b.name)),
      quarantine: [...quarantine.values()]
        .map((entry) => ({ ...entry, reasons: [...entry.reasons].sort(), generations: [...entry.generations].sort((a, b) => a - b) }))
        .sort((a, b) => (a.workspaceId ?? "").localeCompare(b.workspaceId ?? "")),
      scannedManifests: manifestEntries.length,
      scannedGenerations: generationKeysFound.length,
    };
  } finally { db.close(); }
}

export async function inspectLocalWorkspaceRecoveryCandidate(workspaceId: string, generation: number): Promise<LocalWorkspaceRecoveryCandidate | null> {
  validateWorkspaceId(workspaceId);
  validateGenerationNumber(generation);
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    const [manifest, stored] = await readManifestAndGeneration(db, workspaceId, generation);
    const candidate = await verifiedRecoveryCandidate(stored, workspaceId, generation);
    if (validManifestShape(manifest) && (manifest.activeGeneration === generation || manifest.previousGeneration === generation)) {
      const expectedDigest = manifest.activeGeneration === generation ? manifest.payloadDigest : manifest.previousPayloadDigest;
      if (candidate && expectedDigest === candidate.payloadDigest) {
        const active = await readOne<StoredGeneration>(db, GENERATION_STORE, [workspaceId, manifest.activeGeneration]);
        const activeVerification = await verifyGeneration(active, manifest.payloadDigest);
        if (activeVerification.status === "verified" && activeManifestMetadataMatches(manifest, active, activeVerification.workspace)) {
          throw new Error("The selected generation is referenced by a matching valid manifest and is not quarantined.");
        }
      }
    }
    return candidate;
  } finally { db.close(); }
}

export async function reconstructLocalWorkspaceFromQuarantine(workspaceId: string, generation: number, expectedDigest: string, name: string): Promise<LocalWorkspaceManifest> {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("Recovery candidate digest is invalid.");
  const candidate = await inspectLocalWorkspaceRecoveryCandidate(workspaceId, generation);
  if (!candidate || candidate.payloadDigest !== expectedDigest) throw new Error("The quarantined generation changed or no longer verifies.");
  const db = await openDatabase();
  let stored: StoredGeneration | undefined;
  try { stored = await readOne<StoredGeneration>(db, GENERATION_STORE, [workspaceId, generation]); }
  finally { db.close(); }
  const verified = await verifiedRecoveryCandidate(stored, workspaceId, generation);
  if (!verified || verified.payloadDigest !== expectedDigest || !stored) throw new Error("The quarantined generation changed or no longer verifies.");
  const recovered = stored.payload.audit.length >= MAX_AUDIT_EVENTS
    ? await forkWorkspace(stored.payload, name)
    : await renameWorkspace(stored.payload, name, "Reconstruct quarantined local workspace", `generation:${generation} · ${expectedDigest}`);
  return writeWorkspace(createWorkspaceId(), recovered, null, true, null, true);
}

export async function createLocalWorkspace(workspace: Workspace): Promise<LocalWorkspaceManifest> {
  return writeWorkspace(createWorkspaceId(), workspace, null, true);
}

/**
 * Explicitly accepts the current saved generation as a local continuity
 * baseline. This records an operator claim and browser time; it does not prove
 * identity, authority, custody, completeness, or authenticity.
 */
export async function initializeLocalContinuityAnchor(
  id: string,
  expectedToken: string,
  input: LocalContinuityAcceptanceInput,
): Promise<ContinuityVerification> {
  validateWorkspaceId(id);
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    const manifest = await readOne<LocalWorkspaceManifest>(db, MANIFEST_STORE, id);
    if (!manifest || !validManifestShape(manifest) || manifest.token !== expectedToken) throw new Error("The named saved workspace changed. Reopen it before accepting a continuity baseline.");
    const existing = await readOne<ContinuityAnchor>(db, CONTINUITY_STORE, id);
    if (existing) throw new Error("This workspace already has a continuity anchor. A failed lineage cannot be silently re-anchored in place.");
    const stored = await readOne<StoredGeneration>(db, GENERATION_STORE, [id, manifest.activeGeneration]);
    const verified = await verifyGeneration(stored, manifest.payloadDigest);
    if (verified.status !== "verified") throw new Error("The manifest-bound saved generation does not verify and cannot be accepted as a continuity baseline.");
    const anchor = await createContinuityAnchor({
      workspace: verified.workspace,
      workspaceId: id,
      lineageId: `lineage-${crypto.randomUUID()}`,
      generation: manifest.activeGeneration,
      payloadDigest: manifest.payloadDigest,
      initialAcceptance: {
        ...input,
        browserTime: new Date().toISOString(),
        acknowledgment: CONTINUITY_ACKNOWLEDGMENT,
      },
    });
    await completeTransaction(db, [MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE], "readwrite", (transaction, resolve, reject) => {
      const manifestRequest = transaction.objectStore(MANIFEST_STORE).get(id);
      const generationRequest = transaction.objectStore(GENERATION_STORE).get([id, manifest.activeGeneration]);
      const anchorRequest = transaction.objectStore(CONTINUITY_STORE).get(id);
      let readyCount = 0;
      const ready = () => {
        readyCount += 1;
        if (readyCount !== 3) return;
        const current = manifestRequest.result as LocalWorkspaceManifest | undefined;
        const currentGeneration = generationRequest.result as StoredGeneration | undefined;
        if (!current || current.token !== expectedToken || current.payloadDigest !== manifest.payloadDigest || current.activeGeneration !== manifest.activeGeneration) return reject(new Error("The named saved workspace changed while its continuity baseline was being accepted."));
        if (!currentGeneration || currentGeneration.payloadDigest !== manifest.payloadDigest || currentGeneration.workspaceId !== id || currentGeneration.generation !== manifest.activeGeneration) return reject(new Error("The saved generation changed while its continuity baseline was being accepted."));
        if (anchorRequest.result !== undefined) return reject(new Error("A continuity anchor was created in another tab. Reopen the workspace before continuing."));
        transaction.objectStore(CONTINUITY_STORE).add(anchor);
        resolve(undefined);
      };
      manifestRequest.onsuccess = ready;
      generationRequest.onsuccess = ready;
      anchorRequest.onsuccess = ready;
      manifestRequest.onerror = () => reject(storageError(manifestRequest.error));
      generationRequest.onerror = () => reject(storageError(generationRequest.error));
      anchorRequest.onerror = () => reject(storageError(anchorRequest.error));
    });
    announceChange();
    return verifyContinuityAnchor(anchor, {
      workspace: verified.workspace,
      workspaceId: id,
      lineageId: anchor.lineageId,
      generation: manifest.activeGeneration,
      payloadDigest: manifest.payloadDigest,
    });
  } finally { db.close(); }
}

export async function makeLocalContinuityReceipt(id: string, expectedToken: string): Promise<string> {
  const { opened, anchor } = await openLocalWorkspaceWithAnchor(id, null);
  if (opened.token !== expectedToken) throw new Error("The named saved workspace changed. Reopen it before downloading a continuity receipt.");
  if (opened.recoveredFromPrevious || opened.continuity.status !== "continuity-verified-local" || !anchor) throw new Error("The exact active saved generation does not have a matching local continuity checkpoint.");
  return formatContinuityReceipt(await validateContinuityAnchor(anchor));
}

export async function makeLocalContinuityWitness(id: string, expectedToken: string, originScope: string): Promise<string> {
  validateWorkspaceId(id);
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    const bundle = await readWorkspaceBundle(db, id);
    const manifest = bundle.manifest;
    if (!manifest || !validManifestShape(manifest) || manifest.token !== expectedToken) throw new Error("The named saved workspace changed. Reopen it before creating a continuity witness request.");
    const verified = await verifyGeneration(bundle.active, manifest.payloadDigest);
    if (verified.status !== "verified" || !activeManifestMetadataMatches(manifest, bundle.active, verified.workspace)) throw new Error("The exact active saved generation does not verify.");
    if (!bundle.anchor) throw new Error("The exact active saved generation has no local continuity checkpoint.");
    const continuity = await verifyContinuityAnchor(bundle.anchor, { workspace: verified.workspace, workspaceId: id, lineageId: bundle.anchor.lineageId, generation: manifest.activeGeneration, payloadDigest: manifest.payloadDigest });
    if (continuity.status !== "continuity-verified-local") throw new Error(`The local continuity checkpoint does not match. ${continuity.reason}`);
    return formatContinuityWitness(await createContinuityWitness(bundle.anchor, originScope, new Date().toISOString()));
  } finally { db.close(); }
}

export async function corroborateLocalContinuityReceipt(id: string, expectedToken: string, serializedReceipt: string): Promise<ContinuityVerification> {
  const { opened } = await openLocalWorkspaceWithAnchor(id, serializedReceipt);
  if (opened.token !== expectedToken || opened.recoveredFromPrevious) throw new Error("The named saved workspace changed or required recovery. Reopen it before comparing an independent continuity receipt.");
  if (opened.continuity.status !== "continuity-corroborated") throw new Error(`The independent continuity receipt did not corroborate this exact saved generation. ${opened.continuity.reason}`);
  return opened.continuity;
}

export async function verifyLocalExternalContinuity(id: string, expectedToken: string, input: LocalExternalContinuityInput): Promise<ExternalContinuityVerification> {
  const opened = await openLocalWorkspace(id, null, input);
  if (opened.token !== expectedToken || opened.recoveredFromPrevious) throw new Error("The named saved workspace changed or required recovery. Reopen it before verifying external continuity evidence.");
  return opened.externalContinuity;
}

export async function saveLocalWorkspace(id: string, workspace: Workspace, expectedToken: string): Promise<LocalWorkspaceManifest> {
  validateWorkspaceId(id);
  return writeWorkspace(id, workspace, expectedToken, false, null);
}

export async function saveRecoveredLocalWorkspace(id: string, workspace: Workspace, expectedToken: string, recoveredGeneration: number): Promise<LocalWorkspaceManifest> {
  validateWorkspaceId(id);
  if (!Number.isSafeInteger(recoveredGeneration) || recoveredGeneration < 1) throw new Error("Recovered local generation is invalid.");
  return writeWorkspace(id, workspace, expectedToken, false, recoveredGeneration);
}

export async function openLocalWorkspace(id: string, independentReceipt: string | null = null, externalInput: LocalExternalContinuityInput | null = null): Promise<LocalWorkspaceOpen> {
  return (await openLocalWorkspaceWithAnchor(id, independentReceipt, externalInput)).opened;
}

async function openLocalWorkspaceWithAnchor(id: string, independentReceipt: string | null, externalInput: LocalExternalContinuityInput | null = null): Promise<{ opened: LocalWorkspaceOpen; anchor: ContinuityAnchor | null }> {
  validateWorkspaceId(id);
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    const bundle = await readWorkspaceBundle(db, id);
    const manifest = bundle.manifest;
    if (!manifest || !validManifestShape(manifest)) throw new Error("The selected local workspace is unavailable.");
    const active = bundle.active;
    const opened = await verifyGeneration(active, manifest.payloadDigest);
    if (opened.status === "verified") {
      if (!activeManifestMetadataMatches(manifest, active, opened.workspace)) throw new Error("Workspace integrity verification stopped because manifest display metadata disagrees with the verified active generation. Inspect quarantined storage before continuing.");
      const continuity = await continuityForOpenedGeneration(bundle.anchor, id, opened.workspace, manifest.activeGeneration, manifest.payloadDigest, independentReceipt);
      const externalContinuity = await externalContinuityForAnchor(bundle.anchor, externalInput);
      return { opened: { workspace: opened.workspace, manifest, token: manifest.token, recoveredFromPrevious: false, openedGeneration: manifest.activeGeneration, continuity, externalContinuity, continuityAnchor: bundle.anchor ? await validateContinuityAnchor(bundle.anchor).catch(() => null) : null }, anchor: bundle.anchor ?? null };
    }
    if (opened.status === "digest-disagreement") throw new Error("Workspace integrity verification stopped because the active generation and its manifest digest disagree. No fallback generation was opened.");
    if (manifest.previousGeneration !== null) {
      if (!manifest.previousPayloadDigest) throw new Error("Workspace integrity verification failed. This legacy manifest does not bind its fallback generation, so the fallback was not opened.");
      const previous = bundle.previous;
      const recovered = await verifyGeneration(previous, manifest.previousPayloadDigest);
      if (recovered.status === "verified" && previous) {
        const continuity = await continuityForOpenedGeneration(bundle.anchor, id, recovered.workspace, manifest.previousGeneration, manifest.previousPayloadDigest, independentReceipt);
        const externalContinuity = await externalContinuityForAnchor(bundle.anchor, externalInput);
        return { opened: { workspace: recovered.workspace, manifest: openedGenerationManifest(manifest, previous, recovered.workspace), token: manifest.token, recoveredFromPrevious: true, openedGeneration: manifest.previousGeneration, continuity, externalContinuity, continuityAnchor: bundle.anchor ? await validateContinuityAnchor(bundle.anchor).catch(() => null) : null }, anchor: bundle.anchor ?? null };
      }
    }
    throw new Error("Workspace integrity verification failed. No verified local generation is available.");
  } finally { db.close(); }
}

export async function openContinuityVerifiedWorkspace(id: string, independentReceipt: string | null = null, externalInput: LocalExternalContinuityInput | null = null): Promise<LocalWorkspaceOpen> {
  const opened = await openLocalWorkspace(id, independentReceipt, externalInput);
  if (opened.recoveredFromPrevious) throw new Error("The workspace opened from a recovery generation and cannot produce ordinary outward artifacts.");
  if (opened.continuity.status !== "continuity-verified-local" && opened.continuity.status !== "continuity-corroborated") {
    throw new Error(`The saved generation does not match its local continuity checkpoint. ${opened.continuity.reason}`);
  }
  if (opened.externalContinuity.status !== "trusted-match") {
    throw new Error(`A signed witness chain under the supplied expected policy digest is required before ordinary outward artifacts can be generated. ${opened.externalContinuity.reason}`);
  }
  return opened;
}

/**
 * Holds a readonly IndexedDB snapshot across the final synchronous browser
 * activation. Earlier overlapping writes are observed; later writes to any of
 * the three stores wait until the synchronous browser activation has returned.
 *
 * This proves only that exact bytes were offered to the browser while the
 * named local state was fenced. It cannot prove that an OS save completed.
 */
export async function activateAgainstLocalWorkspace(
  expected: LocalWorkspaceActivationExpectation,
  file: File,
  disposition: BrowserFileDisposition,
): Promise<void> {
  validateWorkspaceId(expected.id);
  validateGenerationNumber(expected.generation);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected.token)) throw new Error("Artifact activation token is invalid.");
  if (!/^[a-f0-9]{64}$/.test(expected.payloadDigest) || !/^[a-f0-9]{64}$/.test(expected.anchorDigest) || !/^[a-f0-9]{64}$/.test(expected.artifactSha256)) throw new Error("Artifact activation digest is invalid.");
  if (!isBrowserFile(file)) throw new Error("Artifact activation requires an immutable File.");
  if (disposition !== "download" && disposition !== "open") throw new Error("Artifact activation disposition is unsupported.");
  const identity = {
    id: expected.id,
    token: expected.token,
    generation: expected.generation,
    payloadDigest: expected.payloadDigest,
    anchorDigest: expected.anchorDigest,
    artifactSha256: expected.artifactSha256,
  } as const;
  const expectedWorkspace = boundedWorkspaceSerialization(expected.workspace);
  const expectedAnchorValue = structuredClone(expected.continuityAnchor);
  const artifactFile = file;
  const artifactDisposition = disposition;
  const validatedAnchor = await validateContinuityAnchor(expectedAnchorValue);
  if (validatedAnchor.digest !== identity.anchorDigest || validatedAnchor.workspaceId !== identity.id) throw new Error("Artifact activation continuity identity is inconsistent.");
  const expectedAnchor = JSON.stringify(validatedAnchor);

  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    let actualArtifactSha256: string;
    try {
      actualArtifactSha256 = await sha256Bytes(await readBrowserFileBytes(artifactFile));
    } catch {
      throw new Error("The prepared artifact bytes could not be verified before final activation.");
    }
    if (actualArtifactSha256 !== identity.artifactSha256) throw new Error("The prepared artifact bytes changed before final activation.");
    await completeTransaction<void>(db, [MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE], "readonly", (transaction, resolve, reject) => {
      const manifestRequest = transaction.objectStore(MANIFEST_STORE).get(identity.id);
      const generationRequest = transaction.objectStore(GENERATION_STORE).get([identity.id, identity.generation]);
      const anchorRequest = transaction.objectStore(CONTINUITY_STORE).get(identity.id);
      let remaining = 3;
      const fail = (message: string) => reject(new Error(message));
      const ready = () => {
        remaining -= 1;
        if (remaining !== 0) return;
        try {
          const manifest = manifestRequest.result as LocalWorkspaceManifest | undefined;
          const generation = generationRequest.result as StoredGeneration | undefined;
          const anchor = anchorRequest.result as ContinuityAnchor | undefined;
          if (!manifest || !validManifestShape(manifest)
            || manifest.id !== identity.id
            || manifest.token !== identity.token
            || manifest.activeGeneration !== identity.generation
            || manifest.payloadDigest !== identity.payloadDigest) return fail("The named saved workspace changed before artifact activation.");
          if (!generation
            || generation.workspaceId !== identity.id
            || generation.generation !== identity.generation
            || generation.payloadDigest !== identity.payloadDigest
            || !activeManifestMetadataMatches(manifest, generation, generation.payload)
            || boundedWorkspaceSerialization(generation.payload) !== expectedWorkspace) return fail("The exact saved generation changed before artifact activation.");
          if (!anchor || anchor.digest !== identity.anchorDigest || JSON.stringify(anchor) !== expectedAnchor) return fail("The continuity checkpoint changed before artifact activation.");
          activateBrowserFile(artifactFile, artifactDisposition);
          resolve(undefined);
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Artifact activation failed safely."));
        }
      };
      for (const request of [manifestRequest, generationRequest, anchorRequest]) {
        request.onsuccess = ready;
        request.onerror = () => reject(storageError(request.error));
      }
    });
  } finally { db.close(); }
}

export async function deleteLocalWorkspace(id: string, expectedToken?: string): Promise<void> {
  validateWorkspaceId(id);
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    await completeTransaction(db, [MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE], "readwrite", (transaction, resolve, reject) => {
      const manifests = transaction.objectStore(MANIFEST_STORE);
      const generations = transaction.objectStore(GENERATION_STORE);
      const request = manifests.get(id);
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        const manifest = request.result as LocalWorkspaceManifest | undefined;
        if (!manifest) return reject(new Error("The selected local workspace no longer exists."));
        if (expectedToken && manifest.token !== expectedToken) return reject(new Error("This local workspace changed in another tab. Open it again before deleting."));
        manifests.delete(id);
        generations.delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
        transaction.objectStore(CONTINUITY_STORE).delete(id);
        resolve(undefined);
      };
    });
    announceChange();
  } finally { db.close(); }
}

export async function clearLocalWorkspaces(): Promise<void> {
  await ensureLegacyMigration();
  const db = await openDatabase();
  try {
    await completeTransaction(db, [MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE, LEGACY_STORE], "readwrite", (transaction, resolve) => {
      transaction.objectStore(MANIFEST_STORE).clear();
      transaction.objectStore(GENERATION_STORE).clear();
      transaction.objectStore(CONTINUITY_STORE).clear();
      transaction.objectStore(LEGACY_STORE).clear();
      resolve(undefined);
    });
    announceChange();
  } finally { db.close(); }
}

export async function getLocalStorageStatus(): Promise<LocalStorageStatus> {
  const supported = typeof indexedDB !== "undefined";
  if (!supported) return { supported: false, persisted: null, usage: null, quota: null };
  if (typeof navigator === "undefined" || !navigator.storage) return { supported: true, persisted: null, usage: null, quota: null };
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate().catch(() => ({} as StorageEstimate)),
    navigator.storage.persisted?.().catch(() => null) ?? Promise.resolve(null),
  ]);
  return { supported: true, persisted, usage: typeof estimate.usage === "number" ? estimate.usage : null, quota: typeof estimate.quota === "number" ? estimate.quota : null };
}

export async function requestDurableStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return navigator.storage.persist().catch(() => false);
}

export function subscribeLocalWorkspaceChanges(listener: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  try {
    const channel = new BroadcastChannel(CHANGE_CHANNEL);
    channel.addEventListener("message", listener);
    return () => { try { channel.close(); } catch { /* best-effort notification channel */ } };
  } catch { return () => undefined; }
}

async function writeWorkspace(id: string, input: Workspace, expectedToken: string | null, create: boolean, recoveredGeneration: number | null = null, allowQuarantine = false): Promise<LocalWorkspaceManifest> {
  validateWorkspaceId(id);
  await ensureLegacyMigration();
  boundedWorkspaceSerialization(input);
  const workspace = await validateWorkspaceSnapshot(input);
  const serialized = boundedWorkspaceSerialization(workspace);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MAX_WORKSPACE_BYTES) throw new Error("This workspace exceeds the 25 MiB local-save limit. Export or divide the work before saving.");
  await preflightQuota(bytes);
  const payloadDigest = await sha256Hex(serialized);
  const normalizedName = normalizeName(workspace.name);
  const savedAt = new Date().toISOString();
  const db = await openDatabase();
  let result!: LocalWorkspaceManifest;
  try {
    const saveBase = create ? null : await requireVerifiedSaveBase(db, id, expectedToken, recoveredGeneration, workspace);
    if (saveBase && recoveredGeneration === null && payloadDigest === saveBase.manifest.payloadDigest) return saveBase.manifest;
    const nextAnchor = saveBase?.anchor
      ? await extendContinuityAnchor(saveBase.anchor, {
          previousWorkspace: saveBase.workspace,
          workspace,
          generation: saveBase.manifest.activeGeneration + 1,
          payloadDigest,
        })
      : null;
    await completeTransaction(db, [MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE], "readwrite", (transaction, resolve, reject) => {
      const manifests = transaction.objectStore(MANIFEST_STORE);
      const generations = transaction.objectStore(GENERATION_STORE);
      const anchors = transaction.objectStore(CONTINUITY_STORE);
      const allRequest = manifests.getAll(undefined, MAX_STORAGE_INSPECTION_MANIFESTS + 1);
      const anchorRequest = anchors.get(id);
      let manifestsReady = false;
      let anchorReady = false;
      allRequest.onerror = () => reject(storageError(allRequest.error));
      anchorRequest.onerror = () => reject(storageError(anchorRequest.error));
      const commit = () => {
        if (!manifestsReady || !anchorReady) return;
        const raw = allRequest.result as unknown[];
        if (raw.length > MAX_STORAGE_INSPECTION_MANIFESTS) return reject(new Error(`Local storage manifest inspection exceeds ${MAX_STORAGE_INSPECTION_MANIFESTS} entries.`));
        if (!allowQuarantine && raw.some((item) => !validManifestShape(item))) return reject(new Error("Browser-local storage contains an invalid manifest. Inspect quarantined storage before saving."));
        const all = raw.filter(validManifestShape);
        const current = all.find((item) => item.id === id);
        if (create && current) return reject(new Error("A local workspace with this identifier already exists."));
        if (!create && !current) return reject(new Error("The selected local workspace no longer exists."));
        if (!create && current?.token !== expectedToken) return reject(new Error("This local workspace changed in another tab. Open it again before saving."));
        const currentAnchor = anchorRequest.result as ContinuityAnchor | undefined;
        if ((currentAnchor?.digest ?? null) !== (saveBase?.anchor?.digest ?? null)) return reject(new Error("The continuity anchor changed in another tab. Reopen the workspace before saving."));
        if (recoveredGeneration !== null && current?.previousGeneration !== recoveredGeneration) return reject(new Error("The verified recovery generation changed. Open the local workspace again before saving."));
        if (recoveredGeneration !== null && !current?.previousPayloadDigest) return reject(new Error("The fallback generation is not bound by this manifest and cannot be used for recovery."));
        if (create && all.length >= MAX_LOCAL_WORKSPACES) return reject(new Error(`This browser already contains ${MAX_LOCAL_WORKSPACES} local workspaces.`));
        if (all.some((item) => item.id !== id && item.normalizedName === normalizedName)) return reject(new Error("A local workspace with this name already exists."));

        const currentGeneration = current?.activeGeneration ?? 0;
        if (!Number.isSafeInteger(currentGeneration) || currentGeneration >= Number.MAX_SAFE_INTEGER) return reject(new Error("The active local generation cannot be safely incremented. Preserve the stored generations and reconstruct the workspace under a new identifier."));
        const generation = currentGeneration + 1;
        const revision = activeRevision(workspace);
        result = {
          id, name: workspace.name, normalizedName, createdAt: current?.createdAt ?? savedAt, savedAt,
          activeGeneration: generation, previousGeneration: recoveredGeneration ?? current?.activeGeneration ?? null,
          previousPayloadDigest: recoveredGeneration !== null ? current?.previousPayloadDigest ?? null : current?.payloadDigest ?? null,
          payloadDigest, bytes, recordCount: revision.records.length,
          archiveCount: revision.archiveUnits?.length ?? 0, serviceCount: revision.serviceRecords?.length ?? 0,
          incidentCount: workspace.incidents.length, revisionCount: workspace.revisions.length,
          auditCount: workspace.audit.length, token: createToken(),
        };
        generations.put({ workspaceId: id, generation, savedAt, payloadDigest, bytes, payload: structuredClone(workspace) } satisfies StoredGeneration);
        manifests.put(result);
        if (nextAnchor) anchors.put(nextAnchor);
        // A failed active generation is retained during recovery. Opening a verified
        // fallback must not destroy the bytes needed for later diagnosis or salvage.
        if (recoveredGeneration === null && current?.previousGeneration !== null && current?.previousGeneration !== undefined) generations.delete([id, current.previousGeneration]);
        resolve(undefined);
      };
      allRequest.onsuccess = () => { manifestsReady = true; commit(); };
      anchorRequest.onsuccess = () => { anchorReady = true; commit(); };
    });
  } finally { db.close(); }
  announceChange();
  return result;
}

type VerifiedSaveBase = { manifest: LocalWorkspaceManifest; workspace: Workspace; anchor: ContinuityAnchor | null };

async function requireVerifiedSaveBase(db: IDBDatabase, id: string, expectedToken: string | null, recoveredGeneration: number | null, workspace: Workspace): Promise<VerifiedSaveBase> {
  const manifest = await readOne<LocalWorkspaceManifest>(db, MANIFEST_STORE, id);
  if (!manifest || !validManifestShape(manifest)) throw new Error("The selected local workspace manifest no longer verifies. Reopen or inspect storage before saving.");
  if (manifest.token !== expectedToken) throw new Error("This local workspace changed in another tab. Open it again before saving.");

  const generation = recoveredGeneration ?? manifest.activeGeneration;
  const expectedDigest = recoveredGeneration === null ? manifest.payloadDigest : manifest.previousPayloadDigest;
  if (recoveredGeneration !== null && manifest.previousGeneration !== recoveredGeneration) throw new Error("The verified recovery generation changed. Open the local workspace again before saving.");
  if (!expectedDigest) {
    const reason = recoveredGeneration === null
      ? "The manifest-bound generation is missing its digest"
      : "The fallback generation is not bound by this manifest";
    throw new Error(`${reason} and cannot be rotated during save.`);
  }
  const stored = await readOne<StoredGeneration>(db, GENERATION_STORE, [id, generation]);
  const verified = await verifyGeneration(stored, expectedDigest);
  if (verified.status !== "verified") throw new Error("The manifest-bound generation no longer verifies. Reopen or inspect storage before saving so the last verified fallback is not rotated away.");
  const anchorValue = await readOne<ContinuityAnchor>(db, CONTINUITY_STORE, id);
  let anchor: ContinuityAnchor | null = null;
  if (anchorValue) {
    if (recoveredGeneration !== null) throw new Error("An anchored workspace cannot be repaired in place from an older generation. Preserve the failed lineage and create an explicitly accepted new baseline.");
    const continuity = await verifyContinuityAnchor(anchorValue, {
      workspace: verified.workspace,
      workspaceId: id,
      lineageId: anchorValue.lineageId,
      generation: manifest.activeGeneration,
      payloadDigest: manifest.payloadDigest,
    });
    if (continuity.status !== "continuity-verified-local") throw new Error(`The current saved workspace does not match its retained continuity anchor. ${continuity.reason}`);
    anchor = anchorValue;
  }

  if (recoveredGeneration !== null) {
    const active = await readOne<StoredGeneration>(db, GENERATION_STORE, [id, manifest.activeGeneration]);
    const activeVerification = await verifyGeneration(active, manifest.payloadDigest);
    if (activeVerification.status === "verified") throw new Error("Recovery save refused because the active generation still verifies. Use a normal save or create a new workspace instead.");
    if (activeVerification.status === "digest-disagreement") throw new Error("Recovery save refused because the active generation and manifest digest disagree. Inspect quarantined storage instead of substituting slot state.");
    if (boundedWorkspaceSerialization(workspace) !== boundedWorkspaceSerialization(verified.workspace)) throw new Error("Recovery save input does not match the manifest-bound verified fallback generation. Create a new workspace for altered recovery content.");
  }

  // A normal save rotates the active generation into the fallback slot and
  // deletes the currently referenced fallback. Verify that exact fallback,
  // including its manifest-bound digest, before permitting the destructive
  // part of the rotation. Missing, corrupt, or legacy-unbound bytes remain in
  // place for explicit storage inspection and recovery.
  if (recoveredGeneration === null && manifest.previousGeneration !== null) {
    if (!manifest.previousPayloadDigest) throw new Error("The previous generation is not bound by this manifest and cannot be rotated during save. Inspect storage before continuing.");
    const previous = await readOne<StoredGeneration>(db, GENERATION_STORE, [id, manifest.previousGeneration]);
    const verifiedPrevious = await verifyGeneration(previous, manifest.previousPayloadDigest);
    if (verifiedPrevious.status !== "verified") throw new Error("The manifest-bound previous generation no longer verifies and cannot be rotated during save. Inspect storage before continuing; no stored generation was deleted.");
  }
  return { manifest, workspace: verified.workspace, anchor };
}

function activeManifestMetadataMatches(manifest: LocalWorkspaceManifest, stored: StoredGeneration | undefined, workspace: Workspace): boolean {
  if (!stored || stored.workspaceId !== manifest.id || stored.generation !== manifest.activeGeneration) return false;
  try {
    const serialized = boundedWorkspaceSerialization(workspace);
    const bytes = new TextEncoder().encode(serialized).byteLength;
    const revision = activeRevision(workspace);
    return stored.payloadDigest === manifest.payloadDigest
      && stored.savedAt === manifest.savedAt
      && stored.bytes === bytes
      && manifest.name === workspace.name
      && manifest.normalizedName === normalizeName(workspace.name)
      && manifest.bytes === bytes
      && manifest.recordCount === revision.records.length
      && manifest.archiveCount === (revision.archiveUnits?.length ?? 0)
      && manifest.serviceCount === (revision.serviceRecords?.length ?? 0)
      && manifest.incidentCount === workspace.incidents.length
      && manifest.revisionCount === workspace.revisions.length
      && manifest.auditCount === workspace.audit.length;
  } catch { return false; }
}

function openedGenerationManifest(source: LocalWorkspaceManifest, stored: StoredGeneration, workspace: Workspace): LocalWorkspaceManifest {
  const revision = activeRevision(workspace);
  return {
    id: source.id,
    name: workspace.name,
    normalizedName: normalizeName(workspace.name),
    createdAt: workspace.createdAt,
    savedAt: stored.savedAt,
    activeGeneration: stored.generation,
    previousGeneration: null,
    previousPayloadDigest: null,
    payloadDigest: stored.payloadDigest,
    bytes: stored.bytes,
    recordCount: revision.records.length,
    archiveCount: revision.archiveUnits?.length ?? 0,
    serviceCount: revision.serviceRecords?.length ?? 0,
    incidentCount: workspace.incidents.length,
    revisionCount: workspace.revisions.length,
    auditCount: workspace.audit.length,
    token: source.token,
  };
}

type GenerationVerification =
  | { status: "verified"; workspace: Workspace }
  | { status: "unavailable" }
  | { status: "digest-disagreement" };

async function verifyGeneration(value: StoredGeneration | undefined, expectedDigest: string): Promise<GenerationVerification> {
  if (!value || typeof value !== "object" || !value.payload) return { status: "unavailable" };
  try {
    const digest = await sha256Hex(boundedWorkspaceSerialization(value.payload));
    const matchesGeneration = digest === value.payloadDigest;
    const matchesManifest = digest === expectedDigest;
    if (matchesGeneration !== matchesManifest) return { status: "digest-disagreement" };
    if (!matchesGeneration) return { status: "unavailable" };
    return { status: "verified", workspace: await validateWorkspaceSnapshot(value.payload) };
  } catch { return { status: "unavailable" }; }
}

async function continuityForOpenedGeneration(
  anchor: ContinuityAnchor | undefined,
  workspaceId: string,
  workspace: Workspace,
  generation: number,
  payloadDigest: string,
  independentReceipt: string | null,
): Promise<ContinuityVerification> {
  if (!anchor) return { status: "unanchored", reason: "No separately retained local continuity checkpoint exists. Explicitly accept a baseline before ordinary outward use.", anchorDigest: null };
  return verifyContinuityAnchor(anchor, {
    workspace,
    workspaceId,
    lineageId: anchor.lineageId,
    generation,
    payloadDigest,
    independentReceipt,
  });
}

async function externalContinuityForAnchor(
  anchor: ContinuityAnchor | undefined,
  input: LocalExternalContinuityInput | null,
): Promise<ExternalContinuityVerification> {
  if (!anchor) return { status: "indeterminate", reason: "No local continuity checkpoint exists for comparison.", witnessDigest: null, policyId: null, policyRevision: null, policyDigest: null, topology: null };
  if (!input) return { status: "policy-pin-missing", reason: "No signed witness set, policy, and separately obtained current policy digest were supplied.", witnessDigest: null, policyId: null, policyRevision: null, policyDigest: null, topology: null };
  try {
    return verifyExternalContinuity(
      anchor,
      parseSignedContinuityWitnessSet(input.signedWitnessSet),
      parseContinuityTrustPolicy(input.trustPolicy),
      input.originScope,
      input.expectedPolicyDigest,
    );
  } catch (error) {
    return { status: "indeterminate", reason: error instanceof Error ? error.message : "External continuity verification failed.", witnessDigest: null, policyId: null, policyRevision: null, policyDigest: null, topology: null };
  }
}

async function verifiedRecoveryCandidate(value: StoredGeneration | undefined, workspaceId: string, generation: number): Promise<LocalWorkspaceRecoveryCandidate | null> {
  if (!value || value.workspaceId !== workspaceId || value.generation !== generation || !value.payload || typeof value.payloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.payloadDigest)) return null;
  try {
    const serialized = boundedWorkspaceSerialization(value.payload);
    const digest = await sha256Hex(serialized);
    if (digest !== value.payloadDigest) return null;
    const workspace = await validateWorkspaceSnapshot(value.payload);
    const revision = activeRevision(workspace);
    return {
      workspaceId,
      generation,
      payloadDigest: digest,
      name: workspace.name,
      updatedAt: workspace.updatedAt,
      bytes: new TextEncoder().encode(serialized).byteLength,
      recordCount: revision.records.length,
      archiveCount: revision.archiveUnits?.length ?? 0,
      serviceCount: revision.serviceRecords?.length ?? 0,
      incidentCount: workspace.incidents.length,
    };
  } catch { return null; }
}

function generationIndex(key: IDBValidKey): { workspaceId: string; generation: number } | null {
  if (!Array.isArray(key) || key.length !== 2 || typeof key[0] !== "string" || !isWorkspaceId(key[0]) || !Number.isSafeInteger(key[1]) || Number(key[1]) < 1) return null;
  return { workspaceId: key[0], generation: Number(key[1]) };
}

function generationKey(workspaceId: string, generation: number): string { return `${workspaceId}:${generation}`; }

function validateGenerationNumber(generation: number): void {
  if (!Number.isSafeInteger(generation) || generation < 1) throw new Error("Local generation is invalid.");
}

function boundedWorkspaceSerialization(value: unknown): string {
  type PendingValue = { kind: "value"; value: unknown; depth: number; arrayValue: boolean } | { kind: "leave"; value: object };
  const pending: PendingValue[] = [{ kind: "value", value, depth: 0, arrayValue: false }];
  const ancestors = new WeakSet<object>();
  const encoder = new TextEncoder();
  let bytes = 0;
  let nodes = 0;
  const addBytes = (count: number) => {
    bytes += count;
    if (bytes > MAX_WORKSPACE_BYTES) throw new Error("Stored workspace exceeds the local inspection byte limit.");
  };
  const encodedJsonBytes = (input: string) => encoder.encode(JSON.stringify(input)).byteLength;

  while (pending.length) {
    const item = pending.pop()!;
    if (item.kind === "leave") { ancestors.delete(item.value); continue; }
    nodes += 1;
    if (nodes > MAX_STORAGE_INSPECTION_NODES) throw new Error("Stored workspace exceeds the local inspection node limit.");
    if (item.depth > MAX_STORAGE_INSPECTION_DEPTH) throw new Error("Stored workspace exceeds the local inspection depth limit.");
    if (item.value === null) { addBytes(4); continue; }
    if (typeof item.value === "string") {
      if (item.value.length > 8192) throw new Error("Stored workspace contains oversized text.");
      addBytes(encodedJsonBytes(item.value));
      continue;
    }
    if (typeof item.value === "boolean") { addBytes(item.value ? 4 : 5); continue; }
    if (typeof item.value === "number") {
      addBytes(encoder.encode(JSON.stringify(item.value)).byteLength);
      continue;
    }
    if (item.value === undefined) {
      if (item.arrayValue) addBytes(4);
      continue;
    }
    if (typeof item.value !== "object") throw new Error("Stored workspace contains an unsupported value.");
    if (ancestors.has(item.value)) throw new Error("Stored workspace contains a cyclic value.");
    ancestors.add(item.value);
    pending.push({ kind: "leave", value: item.value });
    if (Array.isArray(item.value)) {
      if (item.value.length > 5000) throw new Error("Stored workspace array exceeds 5,000 values.");
      addBytes(2 + Math.max(0, item.value.length - 1));
      for (let index = item.value.length - 1; index >= 0; index -= 1) pending.push({ kind: "value", value: item.value[index], depth: item.depth + 1, arrayValue: true });
      continue;
    }
    const prototype = Object.getPrototypeOf(item.value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Stored workspace contains a non-record object.");
    const rawKeys = Object.keys(item.value);
    if (rawKeys.length > 256) throw new Error("Stored workspace object exceeds 256 fields.");
    const object = item.value as Record<string, unknown>;
    const keys = rawKeys.filter((key) => object[key] !== undefined);
    addBytes(2 + Math.max(0, keys.length - 1));
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key.length > 256) throw new Error("Stored workspace contains an oversized field name.");
      addBytes(encodedJsonBytes(key) + 1);
      pending.push({ kind: "value", value: object[key], depth: item.depth + 1, arrayValue: false });
    }
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined || encoder.encode(serialized).byteLength > MAX_WORKSPACE_BYTES) throw new Error("Stored workspace exceeds the local inspection byte limit.");
  return serialized;
}

async function ensureLegacyMigration(): Promise<void> {
  if (migrationTask) return migrationTask;
  migrationTask = migrateLegacySlots().catch((error) => { migrationTask = null; throw error; });
  return migrationTask;
}

async function migrateLegacySlots(): Promise<void> {
  const db = await openDatabase();
  let legacy: { key: IDBValidKey; value: unknown }[];
  try { legacy = await readEntriesBounded<unknown>(db, LEGACY_STORE, MAX_STORAGE_INSPECTION_MANIFESTS, "legacy workspace"); }
  finally { db.close(); }
  for (const entry of legacy) {
    const key = entry.key;
    if (typeof key !== "string") continue;
    try {
      boundedWorkspaceSerialization(entry.value);
      const original = await validateWorkspaceSnapshot(entry.value);
      const baseName = original.name || "Recovered workspace";
      let suffix = 2;
      let name = baseName;
      while (true) {
        const workspace = name === original.name ? original : await renameWorkspace(original, name);
        const result = await claimLegacyWorkspace(key, createWorkspaceId(), workspace);
        if (result === "moved" || result === "missing" || result === "full") break;
        name = `${baseName} ${suffix++}`;
      }
    } catch {
      // Invalid legacy values remain isolated and are never promoted as trusted workspaces.
    }
  }
}

async function claimLegacyWorkspace(key: IDBValidKey, id: string, workspace: Workspace): Promise<"moved" | "missing" | "conflict" | "full"> {
  const serialized = boundedWorkspaceSerialization(workspace);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MAX_WORKSPACE_BYTES) throw new Error("Legacy workspace exceeds the local-save limit.");
  const payloadDigest = await sha256Hex(serialized);
  const savedAt = new Date().toISOString();
  const revision = activeRevision(workspace);
  const manifest: LocalWorkspaceManifest = {
    id, name: workspace.name, normalizedName: normalizeName(workspace.name), createdAt: workspace.createdAt, savedAt,
    activeGeneration: 1, previousGeneration: null, previousPayloadDigest: null, payloadDigest, bytes,
    recordCount: revision.records.length, archiveCount: revision.archiveUnits?.length ?? 0,
    serviceCount: revision.serviceRecords?.length ?? 0, incidentCount: workspace.incidents.length,
    revisionCount: workspace.revisions.length, auditCount: workspace.audit.length, token: createToken(),
  };
  const db = await openDatabase();
  try {
    return await completeTransaction<"moved" | "missing" | "conflict" | "full">(db, [LEGACY_STORE, MANIFEST_STORE, GENERATION_STORE], "readwrite", (transaction, resolve, reject) => {
      const legacy = transaction.objectStore(LEGACY_STORE);
      const manifests = transaction.objectStore(MANIFEST_STORE);
      const legacyRequest = legacy.get(key);
      legacyRequest.onerror = () => reject(storageError(legacyRequest.error));
      legacyRequest.onsuccess = () => {
        if (legacyRequest.result === undefined) { resolve("missing"); return; }
        const manifestRequest = manifests.getAll(undefined, MAX_STORAGE_INSPECTION_MANIFESTS + 1);
        manifestRequest.onerror = () => reject(storageError(manifestRequest.error));
        manifestRequest.onsuccess = () => {
          const raw = manifestRequest.result as unknown[];
          if (raw.length > MAX_STORAGE_INSPECTION_MANIFESTS) { reject(new Error(`Local storage manifest inspection exceeds ${MAX_STORAGE_INSPECTION_MANIFESTS} entries.`)); return; }
          if (raw.some((item) => !validManifestShape(item))) { reject(new Error("Browser-local storage contains an invalid manifest. Legacy migration stopped without changing it.")); return; }
          const existing = raw as LocalWorkspaceManifest[];
          if (existing.length >= MAX_LOCAL_WORKSPACES) { resolve("full"); return; }
          if (existing.some((item) => item.normalizedName === manifest.normalizedName)) { resolve("conflict"); return; }
          manifests.add(manifest);
          transaction.objectStore(GENERATION_STORE).add({ workspaceId: id, generation: 1, savedAt, payloadDigest, bytes, payload: structuredClone(workspace) } satisfies StoredGeneration);
          legacy.delete(key);
          resolve("moved");
        };
      };
    });
  } finally { db.close(); }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Browser-local workspace storage is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE);
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(GENERATION_STORE)) db.createObjectStore(GENERATION_STORE, { keyPath: ["workspaceId", "generation"] });
      if (!db.objectStoreNames.contains(CONTINUITY_STORE)) db.createObjectStore(CONTINUITY_STORE, { keyPath: "workspaceId" });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => reject(new Error("Close other tabs using this site before upgrading local workspace storage."));
  });
}

function completeTransaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, operation: (transaction: IDBTransaction, resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let value: T;
    let staged = false;
    let rejected = false;
    const stage = (next: T) => { value = next; staged = true; };
    const fail = (error: Error) => { rejected = true; try { transaction.abort(); } catch { /* already complete */ } reject(error); };
    operation(transaction, stage, fail);
    transaction.oncomplete = () => {
      if (rejected) return;
      if (staged) resolve(value);
      else reject(new Error("Local workspace transaction completed without a result."));
    };
    transaction.onerror = () => { if (!rejected) reject(storageError(transaction.error)); };
    transaction.onabort = () => { if (!rejected) reject(storageError(transaction.error)); };
  });
}

function readOne<T>(db: IDBDatabase, storeName: string, key: IDBValidKey | IDBKeyRange): Promise<T | undefined> {
  return completeTransaction<T | undefined>(db, [storeName], "readonly", (transaction, resolve, reject) => {
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(storageError(request.error));
  });
}

/** Read manifest, generations, and continuity anchor from one IndexedDB snapshot. */
function readWorkspaceBundle(db: IDBDatabase, id: string): Promise<StoredWorkspaceBundle> {
  return completeTransaction<StoredWorkspaceBundle>(db, [MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE], "readonly", (transaction, resolve, reject) => {
    const manifests = transaction.objectStore(MANIFEST_STORE);
    const generations = transaction.objectStore(GENERATION_STORE);
    const anchors = transaction.objectStore(CONTINUITY_STORE);
    const bundle: StoredWorkspaceBundle = { manifest: undefined, active: undefined, previous: undefined, anchor: undefined };
    let pending = 2;
    const completeOne = () => {
      pending -= 1;
      if (pending === 0) resolve(bundle);
    };
    const fail = (request: IDBRequest) => reject(storageError(request.error));
    const manifestRequest = manifests.get(id);
    const anchorRequest = anchors.get(id);
    manifestRequest.onerror = () => fail(manifestRequest);
    anchorRequest.onerror = () => fail(anchorRequest);
    anchorRequest.onsuccess = () => {
      bundle.anchor = anchorRequest.result as ContinuityAnchor | undefined;
      completeOne();
    };
    manifestRequest.onsuccess = () => {
      bundle.manifest = manifestRequest.result as LocalWorkspaceManifest | undefined;
      if (bundle.manifest && validManifestShape(bundle.manifest)) {
        pending += 1;
        const activeRequest = generations.get([id, bundle.manifest.activeGeneration]);
        activeRequest.onerror = () => fail(activeRequest);
        activeRequest.onsuccess = () => {
          bundle.active = activeRequest.result as StoredGeneration | undefined;
          completeOne();
        };
        if (bundle.manifest.previousGeneration !== null) {
          pending += 1;
          const previousRequest = generations.get([id, bundle.manifest.previousGeneration]);
          previousRequest.onerror = () => fail(previousRequest);
          previousRequest.onsuccess = () => {
            bundle.previous = previousRequest.result as StoredGeneration | undefined;
            completeOne();
          };
        }
      }
      completeOne();
    };
  });
}

function readManifestIndexBounded(db: IDBDatabase): Promise<{ key: IDBValidKey; manifest: LocalWorkspaceManifest | null }[]> {
  return completeTransaction<{ key: IDBValidKey; manifest: LocalWorkspaceManifest | null }[]>(db, [MANIFEST_STORE], "readonly", (transaction, resolve, reject) => {
    const entries: { key: IDBValidKey; manifest: LocalWorkspaceManifest | null }[] = [];
    const request = transaction.objectStore(MANIFEST_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(entries); return; }
      if (entries.length >= MAX_STORAGE_INSPECTION_MANIFESTS) { reject(new Error(`Local storage manifest inspection exceeds ${MAX_STORAGE_INSPECTION_MANIFESTS} entries.`)); return; }
      entries.push({ key: cursor.primaryKey, manifest: validManifestShape(cursor.value) ? cursor.value : null });
      cursor.continue();
    };
    request.onerror = () => reject(storageError(request.error));
  });
}

function readEntriesBounded<T>(db: IDBDatabase, storeName: string, maximum: number, label: string): Promise<{ key: IDBValidKey; value: T }[]> {
  return completeTransaction<{ key: IDBValidKey; value: T }[]>(db, [storeName], "readonly", (transaction, resolve, reject) => {
    const entries: { key: IDBValidKey; value: T }[] = [];
    const request = transaction.objectStore(storeName).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(entries); return; }
      if (entries.length >= maximum) { reject(new Error(`Local storage ${label} inspection exceeds ${maximum} entries.`)); return; }
      entries.push({ key: cursor.primaryKey, value: cursor.value as T });
      cursor.continue();
    };
    request.onerror = () => reject(storageError(request.error));
  });
}

function readKeysBounded(db: IDBDatabase, storeName: string, maximum: number, label: string): Promise<IDBValidKey[]> {
  return completeTransaction<IDBValidKey[]>(db, [storeName], "readonly", (transaction, resolve, reject) => {
    const keys: IDBValidKey[] = [];
    const request = transaction.objectStore(storeName).openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(keys); return; }
      if (keys.length >= maximum) { reject(new Error(`Local storage ${label} inspection exceeds ${maximum} entries.`)); return; }
      keys.push(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(storageError(request.error));
  });
}

function readManifestAndGeneration(db: IDBDatabase, workspaceId: string, generation: number): Promise<[unknown, StoredGeneration | undefined]> {
  return completeTransaction<[unknown, StoredGeneration | undefined]>(db, [MANIFEST_STORE, GENERATION_STORE], "readonly", (transaction, resolve, reject) => {
    const manifestRequest = transaction.objectStore(MANIFEST_STORE).get(workspaceId);
    const generationRequest = transaction.objectStore(GENERATION_STORE).get([workspaceId, generation]);
    let manifestReady = false;
    let generationReady = false;
    let manifest: unknown;
    let stored: StoredGeneration | undefined;
    const ready = () => { if (manifestReady && generationReady) resolve([manifest, stored]); };
    manifestRequest.onsuccess = () => { manifest = manifestRequest.result; manifestReady = true; ready(); };
    generationRequest.onsuccess = () => { stored = generationRequest.result as StoredGeneration | undefined; generationReady = true; ready(); };
    manifestRequest.onerror = () => reject(storageError(manifestRequest.error));
    generationRequest.onerror = () => reject(storageError(generationRequest.error));
  });
}

async function preflightQuota(nextBytes: number): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate().catch(() => ({} as StorageEstimate));
  if (typeof estimate.quota !== "number" || typeof estimate.usage !== "number") return;
  const reserve = Math.max(1024 * 1024, estimate.quota * 0.02);
  if (estimate.quota - estimate.usage - reserve < nextBytes) throw new Error("This browser does not report enough available storage for a verified save. Download a workspace backup and free space before continuing.");
}

function normalizeName(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }

function isWorkspaceId(id: unknown): id is string {
  return typeof id === "string" && /^ws-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function validateWorkspaceId(id: string): void {
  if (!isWorkspaceId(id)) throw new Error("Local workspace identifier is invalid.");
}

function validManifestShape(value: unknown): value is LocalWorkspaceManifest {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LocalWorkspaceManifest>;
  const safeCount = (count: unknown, maximum: number) => Number.isSafeInteger(count) && Number(count) >= 0 && Number(count) <= maximum;
  return isWorkspaceId(item.id)
    && typeof item.name === "string" && item.name.length > 0 && item.name.length <= 120 && normalizeName(item.name) === item.normalizedName
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
    && typeof item.savedAt === "string" && Number.isFinite(Date.parse(item.savedAt))
    && Number.isSafeInteger(item.activeGeneration) && Number(item.activeGeneration) >= 1
    && (item.previousGeneration === null || Number.isSafeInteger(item.previousGeneration) && Number(item.previousGeneration) >= 1 && Number(item.previousGeneration) < Number(item.activeGeneration))
    && (item.previousGeneration === null
      ? item.previousPayloadDigest === undefined || item.previousPayloadDigest === null
      : item.previousPayloadDigest === undefined || typeof item.previousPayloadDigest === "string" && /^[a-f0-9]{64}$/.test(item.previousPayloadDigest))
    && typeof item.payloadDigest === "string" && /^[a-f0-9]{64}$/.test(item.payloadDigest)
    && safeCount(item.bytes, MAX_WORKSPACE_BYTES)
    && safeCount(item.recordCount, 1000)
    && safeCount(item.archiveCount, 5000)
    && safeCount(item.serviceCount, 1000)
    && safeCount(item.incidentCount, 500)
    && safeCount(item.revisionCount, 20) && Number(item.revisionCount) >= 1
    && safeCount(item.auditCount, 5000)
    && typeof item.token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.token);
}

function createToken(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") throw new Error("Secure local workspace tokens are unavailable in this browser.");
  return crypto.randomUUID();
}

function announceChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANGE_CHANNEL);
    channel.postMessage({ type: "changed" });
    channel.close();
  } catch { /* durable commit already succeeded; notification is best effort */ }
}

function storageError(error: DOMException | null): Error {
  if (error?.name === "QuotaExceededError") return new Error("Browser-local storage quota was exceeded. The previous verified generation remains intact.");
  if (error?.name === "AbortError") return new Error("The local workspace transaction was rolled back; prior saved data remains intact.");
  return new Error("The browser-local workspace operation did not complete.");
}

async function sha256Hex(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Bytes(value: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
