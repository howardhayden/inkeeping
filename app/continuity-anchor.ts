import { validateWorkspaceSnapshot, verifyAudit, type AuditEvent, type Workspace } from "./lab-core.ts";
import { assertSafeJsonText } from "./json-safety.ts";

export const CONTINUITY_ANCHOR_SCHEMA = "in-keeping/continuity-anchor";
export const CONTINUITY_ANCHOR_VERSION = 1;
export const CONTINUITY_RECEIPT_SCHEMA = "in-keeping/continuity-anchor-receipt";
export const CONTINUITY_RECEIPT_VERSION = 1;
export const CONTINUITY_ACKNOWLEDGMENT = "continuity-not-authenticity-v1";

export const CONTINUITY_SOURCE_KINDS = [
  "new-workspace",
  "local-workspace",
  "workspace-backup",
  "continuity-receipt",
  "other-reviewed-source",
] as const;

export type ContinuitySourceKind = typeof CONTINUITY_SOURCE_KINDS[number];

export type ContinuityAcceptance = {
  browserTime: string;
  operatorRole: string;
  authorityReference: string;
  rationale: string;
  sourceKind: ContinuitySourceKind;
  sourcePayloadDigest: string | null;
  sourceAnchorDigest: string | null;
  acknowledgment: typeof CONTINUITY_ACKNOWLEDGMENT;
};

export type ContinuityCheckpoint = {
  generation: number;
  payloadDigest: string;
  ledgerGenesisHash: string;
  terminalHash: string;
  terminalStateDigest: string;
  auditCount: number;
  predecessorTerminalHash: string | null;
};

export type ContinuityAnchor = {
  schema: typeof CONTINUITY_ANCHOR_SCHEMA;
  version: typeof CONTINUITY_ANCHOR_VERSION;
  workspaceId: string;
  lineageId: string;
  sequence: number;
  previousAnchorDigest: string | null;
  initialAcceptance: ContinuityAcceptance;
  activeCheckpoint: ContinuityCheckpoint;
  previousCheckpoint: ContinuityCheckpoint | null;
  digest: string;
};

export type ContinuityReceipt = {
  schema: typeof CONTINUITY_RECEIPT_SCHEMA;
  version: typeof CONTINUITY_RECEIPT_VERSION;
  workspaceId: string;
  lineageId: string;
  sequence: number;
  anchorDigest: string;
  activeCheckpoint: ContinuityCheckpoint;
};

export type ContinuityStatus =
  | "unanchored"
  | "continuity-verified-local"
  | "continuity-corroborated"
  | "continuity-failure";

export type ContinuityVerification = {
  status: ContinuityStatus;
  reason: string;
  anchorDigest: string | null;
};

type AnchorDigestValue = Omit<ContinuityAnchor, "digest">;

type CreateContinuityAnchorInput = {
  workspace: Workspace;
  workspaceId: string;
  lineageId: string;
  generation: number;
  payloadDigest: string;
  initialAcceptance: ContinuityAcceptance;
};

type ExtendContinuityAnchorInput = {
  previousWorkspace: Workspace;
  workspace: Workspace;
  generation: number;
  payloadDigest: string;
};

export type VerifyContinuityAnchorInput = {
  workspace: Workspace;
  workspaceId: string;
  lineageId: string;
  generation: number;
  payloadDigest: string;
  independentReceipt?: ContinuityReceipt | string | null;
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_RECEIPT_BYTES = 16 * 1024;
const ACCEPTANCE_KEYS = ["browserTime", "operatorRole", "authorityReference", "rationale", "sourceKind", "sourcePayloadDigest", "sourceAnchorDigest", "acknowledgment"] as const;
const CHECKPOINT_KEYS = ["generation", "payloadDigest", "ledgerGenesisHash", "terminalHash", "terminalStateDigest", "auditCount", "predecessorTerminalHash"] as const;
const ANCHOR_KEYS = ["schema", "version", "workspaceId", "lineageId", "sequence", "previousAnchorDigest", "initialAcceptance", "activeCheckpoint", "previousCheckpoint", "digest"] as const;
const RECEIPT_KEYS = ["schema", "version", "workspaceId", "lineageId", "sequence", "anchorDigest", "activeCheckpoint"] as const;

/**
 * SHA-256 of the exact portable workspace payload used by browser-local storage.
 * This deliberately binds property order as well as values: it is a saved-byte
 * continuity check, not a claim that two semantically similar objects are equal.
 */
export function continuityPayloadDigest(workspace: Workspace): Promise<string> {
  return sha256Hex(JSON.stringify(workspace));
}

/** SHA-256 over the canonical, key-sorted anchor DTO excluding its digest. */
export function continuityAnchorDigest(value: AnchorDigestValue): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export async function createContinuityAnchor(input: CreateContinuityAnchorInput): Promise<ContinuityAnchor> {
  const workspaceId = readId(input.workspaceId, "workspaceId");
  const lineageId = readId(input.lineageId, "lineageId");
  const initialAcceptance = readAcceptance(input.initialAcceptance);
  const activeCheckpoint = await checkpointFor(input.workspace, input.generation, input.payloadDigest);
  const value: AnchorDigestValue = {
    schema: CONTINUITY_ANCHOR_SCHEMA,
    version: CONTINUITY_ANCHOR_VERSION,
    workspaceId,
    lineageId,
    sequence: 1,
    previousAnchorDigest: null,
    initialAcceptance,
    activeCheckpoint,
    previousCheckpoint: null,
  };
  return { ...value, digest: await continuityAnchorDigest(value) };
}

/**
 * Advances an existing workspace anchor only across an exact audit-prefix
 * extension. Ledger rollover belongs to a new workspace/lineage with a newly
 * accepted baseline; a claimed predecessor hash alone is not successor proof.
 */
export async function extendContinuityAnchor(anchorValue: unknown, input: ExtendContinuityAnchorInput): Promise<ContinuityAnchor> {
  const anchor = await validateContinuityAnchor(anchorValue);
  await assertCheckpointMatches(anchor.activeCheckpoint, input.previousWorkspace);
  if (input.generation !== anchor.activeCheckpoint.generation + 1) {
    throw new Error("Continuity anchor extension must bind the immediately following saved generation.");
  }

  const previous = await validatedWorkspace(input.previousWorkspace);
  const current = await validatedWorkspace(input.workspace);
  if (!auditExtends(previous.audit, current.audit)) {
    throw new Error("The saved workspace does not exactly extend the anchored audit history. A successor ledger requires a new workspace and explicitly accepted baseline.");
  }

  const activeCheckpoint = await checkpointFor(current, input.generation, input.payloadDigest);
  if (activeCheckpoint.payloadDigest === anchor.activeCheckpoint.payloadDigest) {
    throw new Error("Continuity anchor extension requires a distinct saved payload.");
  }
  const value: AnchorDigestValue = {
    schema: CONTINUITY_ANCHOR_SCHEMA,
    version: CONTINUITY_ANCHOR_VERSION,
    workspaceId: anchor.workspaceId,
    lineageId: anchor.lineageId,
    sequence: anchor.sequence + 1,
    previousAnchorDigest: anchor.digest,
    initialAcceptance: anchor.initialAcceptance,
    activeCheckpoint,
    previousCheckpoint: anchor.activeCheckpoint,
  };
  return { ...value, digest: await continuityAnchorDigest(value) };
}

/** Strictly validates shape, bounds, canonical values, and the anchor digest. */
export async function validateContinuityAnchor(value: unknown): Promise<ContinuityAnchor> {
  const root = exactObject(value, ANCHOR_KEYS, "Continuity anchor");
  if (root.schema !== CONTINUITY_ANCHOR_SCHEMA || root.version !== CONTINUITY_ANCHOR_VERSION) {
    throw new Error("Continuity anchor schema or version is unsupported.");
  }
  const anchor: ContinuityAnchor = {
    schema: CONTINUITY_ANCHOR_SCHEMA,
    version: CONTINUITY_ANCHOR_VERSION,
    workspaceId: readId(root.workspaceId, "workspaceId"),
    lineageId: readId(root.lineageId, "lineageId"),
    sequence: readPositiveInteger(root.sequence, "anchor sequence"),
    previousAnchorDigest: readNullableDigest(root.previousAnchorDigest, "previousAnchorDigest"),
    initialAcceptance: readAcceptance(root.initialAcceptance),
    activeCheckpoint: readCheckpoint(root.activeCheckpoint, "active checkpoint"),
    previousCheckpoint: root.previousCheckpoint === null ? null : readCheckpoint(root.previousCheckpoint, "previous checkpoint"),
    digest: readDigest(root.digest, "anchor digest"),
  };
  if (anchor.sequence === 1) {
    if (anchor.previousAnchorDigest !== null || anchor.previousCheckpoint !== null) throw new Error("An initial anchor cannot name a previous anchor or checkpoint.");
  } else {
    if (anchor.previousAnchorDigest === null || anchor.previousCheckpoint === null) throw new Error("An extended anchor must name its previous anchor and checkpoint.");
    if (anchor.activeCheckpoint.generation !== anchor.previousCheckpoint.generation + 1) throw new Error("Anchor checkpoints must describe consecutive generations.");
  }
  const { digest, ...digestValue } = anchor;
  if (digest !== await continuityAnchorDigest(digestValue)) throw new Error("Continuity anchor digest does not match its canonical content.");
  return structuredClone(anchor);
}

/**
 * Checks a current saved generation against its local anchor and, optionally,
 * an independently retained receipt. Status names intentionally make no
 * authenticity claim.
 */
export async function verifyContinuityAnchor(anchorValue: unknown | null, input: VerifyContinuityAnchorInput): Promise<ContinuityVerification> {
  if (anchorValue === null || anchorValue === undefined) {
    return { status: "unanchored", reason: "No separately stored local continuity anchor is available for this workspace.", anchorDigest: null };
  }
  try {
    const anchor = await validateContinuityAnchor(anchorValue);
    if (readId(input.workspaceId, "workspaceId") !== anchor.workspaceId || readId(input.lineageId, "lineageId") !== anchor.lineageId) {
      throw new Error("The continuity anchor belongs to a different workspace or lineage.");
    }
    if (input.generation !== anchor.activeCheckpoint.generation) throw new Error("The saved generation does not match the active continuity checkpoint.");
    if (readDigest(input.payloadDigest, "payload digest") !== anchor.activeCheckpoint.payloadDigest) throw new Error("The supplied payload digest does not match the active continuity checkpoint.");
    await assertCheckpointMatches(anchor.activeCheckpoint, input.workspace);

    if (input.independentReceipt !== null && input.independentReceipt !== undefined) {
      const receipt = typeof input.independentReceipt === "string"
        ? parseContinuityReceipt(input.independentReceipt)
        : validateContinuityReceipt(input.independentReceipt);
      if (!await checkContinuityReceipt(receipt, anchor)) throw new Error("The independent continuity receipt is stale or belongs to another anchor.");
      return { status: "continuity-corroborated", reason: "The saved generation matches both its local anchor and the independently retained receipt; authenticity is not established.", anchorDigest: anchor.digest };
    }
    return { status: "continuity-verified-local", reason: "The saved generation matches its locally retained checkpoint; authenticity is not established.", anchorDigest: anchor.digest };
  } catch (error) {
    return {
      status: "continuity-failure",
      reason: error instanceof Error ? error.message : "Continuity verification failed.",
      anchorDigest: null,
    };
  }
}

export function formatContinuityReceipt(anchor: ContinuityAnchor): string {
  return JSON.stringify({
    schema: CONTINUITY_RECEIPT_SCHEMA,
    version: CONTINUITY_RECEIPT_VERSION,
    workspaceId: anchor.workspaceId,
    lineageId: anchor.lineageId,
    sequence: anchor.sequence,
    anchorDigest: anchor.digest,
    activeCheckpoint: anchor.activeCheckpoint,
  } satisfies ContinuityReceipt, null, 2);
}

export function parseContinuityReceipt(serialized: string): ContinuityReceipt {
  if (typeof serialized !== "string" || serialized.length === 0 || new TextEncoder().encode(serialized).byteLength > MAX_RECEIPT_BYTES) {
    throw new Error("Continuity receipt must be nonempty JSON no larger than 16 KiB.");
  }
  let value: unknown;
  try { value = assertSafeJsonText(serialized); } catch (error) {
    const detail = error instanceof Error ? error.message : "Continuity receipt is not valid JSON.";
    throw new Error(`Continuity receipt failed JSON quarantine. ${detail}`, { cause: error });
  }
  return validateContinuityReceipt(value);
}

export function validateContinuityReceipt(value: unknown): ContinuityReceipt {
  const root = exactObject(value, RECEIPT_KEYS, "Continuity receipt");
  if (root.schema !== CONTINUITY_RECEIPT_SCHEMA || root.version !== CONTINUITY_RECEIPT_VERSION) throw new Error("Continuity receipt schema or version is unsupported.");
  return {
    schema: CONTINUITY_RECEIPT_SCHEMA,
    version: CONTINUITY_RECEIPT_VERSION,
    workspaceId: readId(root.workspaceId, "workspaceId"),
    lineageId: readId(root.lineageId, "lineageId"),
    sequence: readPositiveInteger(root.sequence, "receipt sequence"),
    anchorDigest: readDigest(root.anchorDigest, "receipt anchor digest"),
    activeCheckpoint: readCheckpoint(root.activeCheckpoint, "receipt active checkpoint"),
  };
}

export async function checkContinuityReceipt(receiptValue: unknown, independentAnchorValue: unknown): Promise<boolean> {
  try {
    const receipt = validateContinuityReceipt(receiptValue);
    const anchor = await validateContinuityAnchor(independentAnchorValue);
    return receipt.workspaceId === anchor.workspaceId
      && receipt.lineageId === anchor.lineageId
      && receipt.sequence === anchor.sequence
      && receipt.anchorDigest === anchor.digest
      && canonicalJson(receipt.activeCheckpoint) === canonicalJson(anchor.activeCheckpoint);
  } catch {
    return false;
  }
}

async function checkpointFor(workspaceValue: Workspace, generationValue: number, payloadDigestValue: string): Promise<ContinuityCheckpoint> {
  const workspace = await validatedWorkspace(workspaceValue);
  const generation = readPositiveInteger(generationValue, "saved generation");
  const payloadDigest = readDigest(payloadDigestValue, "payload digest");
  const actualPayloadDigest = await continuityPayloadDigest(workspace);
  if (payloadDigest !== actualPayloadDigest) throw new Error("Payload digest does not match the exact saved workspace representation.");
  const first = workspace.audit[0];
  const terminal = workspace.audit.at(-1);
  if (!first || !terminal?.stateDigest) throw new Error("A continuity checkpoint requires a nonempty, state-bound audit ledger.");
  return {
    generation,
    payloadDigest,
    ledgerGenesisHash: first.hash,
    terminalHash: terminal.hash,
    terminalStateDigest: terminal.stateDigest,
    auditCount: workspace.audit.length,
    predecessorTerminalHash: predecessorTerminalHash(workspace.audit),
  };
}

async function assertCheckpointMatches(checkpoint: ContinuityCheckpoint, workspaceValue: Workspace): Promise<void> {
  const actual = await checkpointFor(workspaceValue, checkpoint.generation, checkpoint.payloadDigest);
  if (canonicalJson(actual) !== canonicalJson(checkpoint)) throw new Error("Saved workspace does not match the retained continuity checkpoint.");
}

async function validatedWorkspace(value: Workspace): Promise<Workspace> {
  const workspace = await validateWorkspaceSnapshot(value);
  if (!await verifyAudit(workspace)) throw new Error("Workspace audit integrity or terminal state binding failed.");
  return workspace;
}

function auditExtends(previous: AuditEvent[], current: AuditEvent[]): boolean {
  if (current.length <= previous.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (canonicalJson(current[index]) !== canonicalJson(previous[index])) return false;
  }
  return true;
}

function predecessorTerminalHash(audit: AuditEvent[]): string | null {
  const first = audit[0];
  if (!first || first.sequence !== 1 || first.previousHash !== "GENESIS") return null;
  const match = /^prior-ledger-sha256:([a-f0-9]{64})$/.exec(first.target);
  return match?.[1] ?? null;
}

function readAcceptance(value: unknown): ContinuityAcceptance {
  const root = exactObject(value, ACCEPTANCE_KEYS, "Initial continuity acceptance");
  const browserTime = readIsoInstant(root.browserTime, "acceptance browser time");
  const operatorRole = readCanonicalText(root.operatorRole, 120, "operator role");
  const authorityReference = readCanonicalText(root.authorityReference, 500, "authority reference");
  const rationale = readCanonicalText(root.rationale, 1000, "acceptance rationale");
  if (!CONTINUITY_SOURCE_KINDS.includes(root.sourceKind as ContinuitySourceKind)) throw new Error("Continuity source kind is unsupported.");
  const sourcePayloadDigest = readNullableDigest(root.sourcePayloadDigest, "sourcePayloadDigest");
  const sourceAnchorDigest = readNullableDigest(root.sourceAnchorDigest, "sourceAnchorDigest");
  if (root.acknowledgment !== CONTINUITY_ACKNOWLEDGMENT) throw new Error("Continuity acceptance must acknowledge that continuity does not establish authenticity.");
  return { browserTime, operatorRole, authorityReference, rationale, sourceKind: root.sourceKind as ContinuitySourceKind, sourcePayloadDigest, sourceAnchorDigest, acknowledgment: CONTINUITY_ACKNOWLEDGMENT };
}

function readCheckpoint(value: unknown, label: string): ContinuityCheckpoint {
  const root = exactObject(value, CHECKPOINT_KEYS, label);
  const auditCount = readPositiveInteger(root.auditCount, `${label} auditCount`);
  if (auditCount > 5000) throw new Error(`${label} auditCount exceeds the supported ledger bound.`);
  return {
    generation: readPositiveInteger(root.generation, `${label} generation`),
    payloadDigest: readDigest(root.payloadDigest, `${label} payloadDigest`),
    ledgerGenesisHash: readDigest(root.ledgerGenesisHash, `${label} ledgerGenesisHash`),
    terminalHash: readDigest(root.terminalHash, `${label} terminalHash`),
    terminalStateDigest: readDigest(root.terminalStateDigest, `${label} terminalStateDigest`),
    auditCount,
    predecessorTerminalHash: readNullableDigest(root.predecessorTerminalHash, `${label} predecessorTerminalHash`),
  };
}

function exactObject<const Keys extends readonly string[]>(value: unknown, keys: Keys, label: string): Record<Keys[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
  return value as Record<Keys[number], unknown>;
}

function readId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} must be a safe identifier of at most 128 characters.`);
  return value;
}

function readDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function readNullableDigest(value: unknown, label: string): string | null {
  return value === null ? null : readDigest(value, label);
}

function readPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

function readCanonicalText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.normalize("NFC") || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be nonempty canonical text of at most ${maximum} characters.`);
  }
  return value;
}

function readIsoInstant(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} must be a canonical ISO 8601 UTC instant.`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
