import { parseContinuityReceipt, validateContinuityReceipt, type ContinuityReceipt } from "./continuity-anchor.ts";
import { canonicalDigest } from "./evidence-authority.ts";
import {
  continuityTrustPolicyDigest,
  parseContinuityTrustPolicy,
  parseSignedContinuityWitnessSet,
  verifyContinuityTopology,
  verifyContinuityWitnessSignature,
  type SignedContinuityWitness,
} from "./external-continuity.ts";
import { assertSafeJsonText } from "./json-safety.ts";
import {
  LEGACY_WORKSPACE_BACKUP_SCHEMA,
  WORKSPACE_BACKUP_PROTECTION,
  WORKSPACE_BACKUP_SCHEMA,
  consumeWorkspaceBackupReview,
  type WorkspaceBackupReview,
} from "./workspace-backups.ts";

export const RECOVERY_TRANSITION_REVIEW_SCHEMA = "in-keeping/recovery-transition-review";
export const RECOVERY_TRANSITION_REVIEW_VERSION = 1;
export const MAX_RECOVERY_TRANSITION_REVIEW_BYTES = 64 * 1024;

export type RecoveryContinuityMaterial =
  | { kind: "none" }
  | { kind: "unsigned-receipt"; receiptText: string }
  | { kind: "pinned-signed-witness"; signedWitnessSetText: string; trustPolicyText: string; expectedPolicyDigest: string };

type RecoverySource = {
  filename: string;
  bytes: number;
  rawSha256: string;
  envelopeSchema: typeof WORKSPACE_BACKUP_SCHEMA | typeof LEGACY_WORKSPACE_BACKUP_SCHEMA;
  envelopeVersion: 1 | 2;
  protectionDeclaration: typeof WORKSPACE_BACKUP_PROTECTION | "legacy-v1-unspecified";
  createdAtClaim: string;
  payloadSha256: string;
  parserProfile: "workspace-backup-v1" | "workspace-backup-v2";
  checkpoint: {
    ledgerGenesisHash: string;
    terminalHash: string;
    terminalStateDigest: string;
    auditCount: number;
    predecessorTerminalHash: string | null;
  };
};

type RecoveryContinuity =
  | { status: "not-supplied" }
  | { status: "content-matched-unsigned"; receiptRawSha256: string; identityBasis: "receipt-claim-only"; receipt: ContinuityReceipt }
  | {
      status: "signed-checkpoint-matches-supplied-policy-pin";
      signedSetRawSha256: string;
      policyRawSha256: string;
      policyCanonicalSha256: string;
      policyId: string;
      policyRevision: number;
      authorityId: string;
      keyId: string;
      identityBasis: "signed-witness-under-supplied-policy-pin";
      terminal: {
        workspaceId: string;
        lineageId: string;
        branchId: string;
        originScope: string;
        sequence: number;
        generation: number;
        anchorDigest: string;
        workspaceDigest: string;
        ledgerGenesisHash: string;
        auditHeadDigest: string;
        terminalStateDigest: string;
        auditCount: number;
        predecessorTerminalHash: string | null;
        witnessDigest: string;
      };
    };

export type RecoveryTransitionReview = {
  schema: typeof RECOVERY_TRANSITION_REVIEW_SCHEMA;
  version: typeof RECOVERY_TRANSITION_REVIEW_VERSION;
  stage: "source-reviewed-not-activated";
  continuityInherited: false;
  authorityInherited: false;
  source: RecoverySource;
  continuity: RecoveryContinuity;
  correspondence: {
    exactBackupFile: "observed-self-recorded-unsigned";
    payloadCheckpoint: "not-assessed" | "content-matched-unsigned" | "signed-terminal-matches-supplied-policy-pin";
  };
  prospectiveDestination: {
    origin: string;
    sourceOrigin: string | null;
    originRelation: "same-origin" | "cross-origin" | "unknown";
    lineage: "new-lineage-required";
  };
  limitations: {
    rawBackupAuthenticity: "not-established";
    sourceCurrency: "not-established-by-this-record";
    evidenceTruth: "not-established";
    completeness: "not-established";
    custody: "not-established";
    cleanDevice: "not-established";
    attachmentBytes: "not-modeled";
    destinationPersistence: "not-performed";
    trustedTime: "not-established";
    policyPinIndependence: "not-established-by-this-record";
  };
  reviewedAtBrowser: string;
  timeBasis: "browser-clock-untrusted";
  recordSha256: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LIMITATIONS: RecoveryTransitionReview["limitations"] = {
  rawBackupAuthenticity: "not-established",
  sourceCurrency: "not-established-by-this-record",
  evidenceTruth: "not-established",
  completeness: "not-established",
  custody: "not-established",
  cleanDevice: "not-established",
  attachmentBytes: "not-modeled",
  destinationPersistence: "not-performed",
  trustedTime: "not-established",
  policyPinIndependence: "not-established-by-this-record",
};

export async function sealRecoveryTransitionReview(input: {
  backupReview: WorkspaceBackupReview;
  continuity: RecoveryContinuityMaterial;
  prospectiveDestinationOrigin: string;
  reviewedAtBrowser: string;
}): Promise<RecoveryTransitionReview> {
  const backupReviewCapability = input.backupReview;
  const continuityMaterial = snapshotRecoveryContinuityMaterial(input.continuity);
  const prospectiveDestinationOrigin = input.prospectiveDestinationOrigin;
  const reviewedAtBrowser = input.reviewedAtBrowser;
  const backupReview = await consumeWorkspaceBackupReview(backupReviewCapability);
  if (!backupReview) throw new Error("Recovery requires the exact unchanged process-local backup review capability.");
  const envelope = backupReview.envelope;
  const source: RecoverySource = {
    filename: backupReview.filename,
    bytes: backupReview.bytes,
    rawSha256: backupReview.digest,
    envelopeSchema: envelope.schema,
    envelopeVersion: envelope.version,
    protectionDeclaration: envelope.protectionDeclaration,
    createdAtClaim: envelope.createdAtClaim,
    payloadSha256: envelope.payloadSha256,
    parserProfile: envelope.parserProfile,
    checkpoint: structuredClone(envelope.snapshot),
  };
  const destinationOrigin = exactOrigin(prospectiveDestinationOrigin, "prospective destination origin");
  const continuity = await reviewContinuity(source, continuityMaterial);
  const sourceOrigin = continuity.status === "signed-checkpoint-matches-supplied-policy-pin" ? continuity.terminal.originScope : null;
  const payloadCheckpoint = continuity.status === "not-supplied" ? "not-assessed" as const : continuity.status === "content-matched-unsigned" ? "content-matched-unsigned" as const : "signed-terminal-matches-supplied-policy-pin" as const;
  const unsigned = {
    schema: RECOVERY_TRANSITION_REVIEW_SCHEMA as typeof RECOVERY_TRANSITION_REVIEW_SCHEMA,
    version: RECOVERY_TRANSITION_REVIEW_VERSION as typeof RECOVERY_TRANSITION_REVIEW_VERSION,
    stage: "source-reviewed-not-activated" as const,
    continuityInherited: false as const,
    authorityInherited: false as const,
    source,
    continuity,
    correspondence: { exactBackupFile: "observed-self-recorded-unsigned" as const, payloadCheckpoint },
    prospectiveDestination: {
      origin: destinationOrigin,
      sourceOrigin,
      originRelation: sourceOrigin === null ? "unknown" as const : sourceOrigin === destinationOrigin ? "same-origin" as const : "cross-origin" as const,
      lineage: "new-lineage-required" as const,
    },
    limitations: structuredClone(LIMITATIONS),
    reviewedAtBrowser: instant(reviewedAtBrowser, "recovery review browser time"),
    timeBasis: "browser-clock-untrusted" as const,
  };
  const record = { ...unsigned, recordSha256: await canonicalDigest(unsigned) };
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > MAX_RECOVERY_TRANSITION_REVIEW_BYTES) throw new Error("Recovery transition review exceeds 64 KiB.");
  return record;
}

export async function validateRecoveryTransitionReview(value: unknown): Promise<RecoveryTransitionReview> {
  const root = exact(value, ["schema", "version", "stage", "continuityInherited", "authorityInherited", "source", "continuity", "correspondence", "prospectiveDestination", "limitations", "reviewedAtBrowser", "timeBasis", "recordSha256"], "Recovery transition review");
  if (root.schema !== RECOVERY_TRANSITION_REVIEW_SCHEMA || root.version !== RECOVERY_TRANSITION_REVIEW_VERSION || root.stage !== "source-reviewed-not-activated" || root.continuityInherited !== false || root.authorityInherited !== false || root.timeBasis !== "browser-clock-untrusted") throw new Error("Recovery transition review schema, version, inheritance boundary, stage, or time basis is unsupported.");
  const source = readSource(root.source);
  const continuity = readContinuity(root.continuity);
  if (continuity.status === "content-matched-unsigned" && !checkpointMatchesSource(continuity.receipt.activeCheckpoint, source)) throw new Error("Recovery unsigned continuity checkpoint does not match its source.");
  if (continuity.status === "signed-checkpoint-matches-supplied-policy-pin" && !signedCheckpointMatchesSource(source, continuity.terminal)) throw new Error("Recovery signed continuity checkpoint does not match its source.");
  const correspondence = exact(root.correspondence, ["exactBackupFile", "payloadCheckpoint"], "Recovery correspondence");
  const expectedPayloadCorrespondence = continuity.status === "not-supplied" ? "not-assessed" : continuity.status === "content-matched-unsigned" ? "content-matched-unsigned" : "signed-terminal-matches-supplied-policy-pin";
  if (correspondence.exactBackupFile !== "observed-self-recorded-unsigned" || correspondence.payloadCheckpoint !== expectedPayloadCorrespondence) throw new Error("Recovery correspondence overstates or contradicts the supplied evidence class.");
  const destination = exact(root.prospectiveDestination, ["origin", "sourceOrigin", "originRelation", "lineage"], "Recovery destination");
  const origin = exactOrigin(destination.origin, "prospective destination origin");
  const sourceOrigin = destination.sourceOrigin === null ? null : exactOrigin(destination.sourceOrigin, "recovery source origin");
  const expectedRelation = sourceOrigin === null ? "unknown" : sourceOrigin === origin ? "same-origin" : "cross-origin";
  if (destination.originRelation !== expectedRelation || destination.lineage !== "new-lineage-required") throw new Error("Recovery destination origin relation or lineage declaration is contradictory.");
  const continuityOrigin = continuity.status === "signed-checkpoint-matches-supplied-policy-pin" ? continuity.terminal.originScope : null;
  if (sourceOrigin !== continuityOrigin) throw new Error("Recovery source origin does not match its continuity evidence class.");
  const limitations = exact(root.limitations, Object.keys(LIMITATIONS) as (keyof typeof LIMITATIONS)[], "Recovery limitations");
  for (const [key, expected] of Object.entries(LIMITATIONS)) if (limitations[key as keyof typeof LIMITATIONS] !== expected) throw new Error(`Recovery limitation ${key} is missing or overstated.`);
  const record: RecoveryTransitionReview = {
    schema: RECOVERY_TRANSITION_REVIEW_SCHEMA,
    version: RECOVERY_TRANSITION_REVIEW_VERSION,
    stage: "source-reviewed-not-activated",
    continuityInherited: false,
    authorityInherited: false,
    source,
    continuity,
    correspondence: { exactBackupFile: "observed-self-recorded-unsigned", payloadCheckpoint: expectedPayloadCorrespondence },
    prospectiveDestination: { origin, sourceOrigin, originRelation: expectedRelation, lineage: "new-lineage-required" },
    limitations: structuredClone(LIMITATIONS),
    reviewedAtBrowser: instant(root.reviewedAtBrowser, "recovery review browser time"),
    timeBasis: "browser-clock-untrusted",
    recordSha256: digest(root.recordSha256, "recovery transition review digest"),
  };
  const { recordSha256, ...unsigned } = record;
  if (recordSha256 !== await canonicalDigest(unsigned)) throw new Error("Recovery transition review digest does not match its content.");
  return record;
}

export async function parseRecoveryTransitionReview(text: string): Promise<RecoveryTransitionReview> {
  if (typeof text !== "string" || !text || new TextEncoder().encode(text).byteLength > MAX_RECOVERY_TRANSITION_REVIEW_BYTES) throw new Error("Recovery transition review must be nonempty JSON no larger than 64 KiB.");
  return validateRecoveryTransitionReview(assertSafeJsonText(text));
}

export async function formatRecoveryTransitionReview(value: unknown): Promise<string> {
  return JSON.stringify(await validateRecoveryTransitionReview(value), null, 2);
}

export async function compareRecoveryTransitionReview(recordValue: unknown, input: Parameters<typeof sealRecoveryTransitionReview>[0]): Promise<boolean> {
  try {
    const record = await validateRecoveryTransitionReview(recordValue);
    const recreated = await sealRecoveryTransitionReview(input);
    return JSON.stringify(record) === JSON.stringify(recreated);
  } catch {
    return false;
  }
}

async function reviewContinuity(source: RecoverySource, material: RecoveryContinuityMaterial): Promise<RecoveryContinuity> {
  if (material.kind === "none") return { status: "not-supplied" };
  if (material.kind === "unsigned-receipt") {
    const receipt = parseContinuityReceipt(material.receiptText);
    if (!checkpointMatchesSource(receipt.activeCheckpoint, source)) throw new Error("Unsigned continuity receipt does not match every reviewed backup checkpoint field.");
    return { status: "content-matched-unsigned", receiptRawSha256: await sha256Text(material.receiptText), identityBasis: "receipt-claim-only", receipt };
  }
  const expected = digest(material.expectedPolicyDigest, "expected current policy digest");
  const set = parseSignedContinuityWitnessSet(material.signedWitnessSetText);
  const policy = parseContinuityTrustPolicy(material.trustPolicyText);
  const canonicalPolicy = await continuityTrustPolicyDigest(policy);
  if (expected !== canonicalPolicy) throw new Error("The supplied policy does not match the expected current digest obtained through a separate channel.");
  const verified: SignedContinuityWitness[] = [];
  for (const signed of set.witnesses) {
    const result = await verifyContinuityWitnessSignature(signed, policy);
    if (result.keyStatus !== "active") throw new Error("A recovery witness uses a key revoked by the exact pinned policy.");
    verified.push(result.signed);
  }
  const candidates = verified.filter((signed) => checkpointMatchesSourceWitness(source, signed));
  const terminalCandidates = candidates.flatMap((signed) => policy.terminals
    .filter((terminal) => terminal.witnessDigest === signed.witness.digest
      && terminal.workspaceId === signed.witness.workspaceId
      && terminal.lineageId === signed.witness.lineageId
      && terminal.branchId === signed.witness.branchId
      && terminal.originScope === signed.witness.originScope
      && terminal.sequence === signed.witness.sequence)
    .map((terminal) => ({ signed, terminal })));
  if (terminalCandidates.length !== 1) throw new Error("The exact pinned policy must bind one signed terminal matching the reviewed backup checkpoint.");
  const selected = terminalCandidates[0];
  const topology = await verifyContinuityTopology(verified.map((item) => item.witness), selected.terminal);
  if (topology.status !== "corroborated-at-checkpoint") throw new Error(`Recovery witness topology is ${topology.status}; the reviewed source is not externally corroborated.`);
  return {
    status: "signed-checkpoint-matches-supplied-policy-pin",
    signedSetRawSha256: await sha256Text(material.signedWitnessSetText),
    policyRawSha256: await sha256Text(material.trustPolicyText),
    policyCanonicalSha256: canonicalPolicy,
    policyId: policy.policyId,
    policyRevision: policy.revision,
    authorityId: selected.signed.authorityId,
    keyId: selected.signed.keyId,
    identityBasis: "signed-witness-under-supplied-policy-pin",
    terminal: {
      workspaceId: selected.signed.witness.workspaceId,
      lineageId: selected.signed.witness.lineageId,
      branchId: selected.signed.witness.branchId,
      originScope: selected.signed.witness.originScope,
      sequence: selected.signed.witness.sequence,
      generation: selected.signed.witness.generation,
      anchorDigest: selected.signed.witness.anchorDigest,
      workspaceDigest: selected.signed.witness.workspaceDigest,
      ledgerGenesisHash: selected.signed.witness.ledgerGenesisHash,
      auditHeadDigest: selected.signed.witness.auditHeadDigest,
      terminalStateDigest: selected.signed.witness.terminalStateDigest,
      auditCount: selected.signed.witness.auditCount,
      predecessorTerminalHash: selected.signed.witness.predecessorTerminalHash,
      witnessDigest: selected.signed.witness.digest,
    },
  };
}

function checkpointMatchesSource(checkpoint: ContinuityReceipt["activeCheckpoint"], source: RecoverySource): boolean {
  return checkpoint.payloadDigest === source.payloadSha256
    && checkpoint.ledgerGenesisHash === source.checkpoint.ledgerGenesisHash
    && checkpoint.terminalHash === source.checkpoint.terminalHash
    && checkpoint.terminalStateDigest === source.checkpoint.terminalStateDigest
    && checkpoint.auditCount === source.checkpoint.auditCount
    && checkpoint.predecessorTerminalHash === source.checkpoint.predecessorTerminalHash;
}

function checkpointMatchesSourceWitness(source: RecoverySource, signed: SignedContinuityWitness): boolean {
  return signedCheckpointMatchesSource(source, signed.witness);
}

function signedCheckpointMatchesSource(source: RecoverySource, checkpoint: {
  workspaceDigest: string;
  ledgerGenesisHash: string;
  auditHeadDigest: string;
  terminalStateDigest: string;
  auditCount: number;
  predecessorTerminalHash: string | null;
}): boolean {
  return checkpoint.workspaceDigest === source.payloadSha256
    && checkpoint.ledgerGenesisHash === source.checkpoint.ledgerGenesisHash
    && checkpoint.auditHeadDigest === source.checkpoint.terminalHash
    && checkpoint.terminalStateDigest === source.checkpoint.terminalStateDigest
    && checkpoint.auditCount === source.checkpoint.auditCount
    && checkpoint.predecessorTerminalHash === source.checkpoint.predecessorTerminalHash;
}

function readSource(value: unknown): RecoverySource {
  const root = exact(value, ["filename", "bytes", "rawSha256", "envelopeSchema", "envelopeVersion", "protectionDeclaration", "createdAtClaim", "payloadSha256", "parserProfile", "checkpoint"], "Recovery source");
  const checkpoint = exact(root.checkpoint, ["ledgerGenesisHash", "terminalHash", "terminalStateDigest", "auditCount", "predecessorTerminalHash"], "Recovery source checkpoint");
  const schema = root.envelopeSchema;
  const version = integer(root.envelopeVersion, 1, 2, "backup envelope version") as 1 | 2;
  const legacy = schema === LEGACY_WORKSPACE_BACKUP_SCHEMA && version === 1 && root.protectionDeclaration === "legacy-v1-unspecified" && root.parserProfile === "workspace-backup-v1";
  const current = schema === WORKSPACE_BACKUP_SCHEMA && version === 2 && root.protectionDeclaration === WORKSPACE_BACKUP_PROTECTION && root.parserProfile === "workspace-backup-v2";
  if (!legacy && !current) throw new Error("Recovery backup envelope metadata is contradictory.");
  return {
    filename: boundedText(root.filename, 180, "backup filename"),
    bytes: integer(root.bytes, 1, 27 * 1024 * 1024, "backup bytes"),
    rawSha256: digest(root.rawSha256, "backup raw digest"),
    envelopeSchema: schema as RecoverySource["envelopeSchema"],
    envelopeVersion: version,
    protectionDeclaration: root.protectionDeclaration as RecoverySource["protectionDeclaration"],
    createdAtClaim: instant(root.createdAtClaim, "backup creation claim"),
    payloadSha256: digest(root.payloadSha256, "backup payload digest"),
    parserProfile: root.parserProfile as RecoverySource["parserProfile"],
    checkpoint: {
      ledgerGenesisHash: digest(checkpoint.ledgerGenesisHash, "backup ledger genesis"),
      terminalHash: digest(checkpoint.terminalHash, "backup audit head"),
      terminalStateDigest: digest(checkpoint.terminalStateDigest, "backup terminal state"),
      auditCount: integer(checkpoint.auditCount, 1, 10_000, "backup audit count"),
      predecessorTerminalHash: checkpoint.predecessorTerminalHash === null ? null : digest(checkpoint.predecessorTerminalHash, "backup predecessor terminal"),
    },
  };
}

function readContinuity(value: unknown): RecoveryContinuity {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Recovery continuity must be an object.");
  const status = (value as Record<string, unknown>).status;
  if (status === "not-supplied") {
    exact(value, ["status"], "Recovery continuity");
    return { status };
  }
  if (status === "content-matched-unsigned") {
    const root = exact(value, ["status", "receiptRawSha256", "identityBasis", "receipt"], "Recovery unsigned continuity");
    if (root.identityBasis !== "receipt-claim-only") throw new Error("Unsigned recovery identity basis is overstated.");
    return { status, receiptRawSha256: digest(root.receiptRawSha256, "receipt raw digest"), identityBasis: "receipt-claim-only", receipt: validateContinuityReceipt(root.receipt) };
  }
  if (status === "signed-checkpoint-matches-supplied-policy-pin") {
    const root = exact(value, ["status", "signedSetRawSha256", "policyRawSha256", "policyCanonicalSha256", "policyId", "policyRevision", "authorityId", "keyId", "identityBasis", "terminal"], "Recovery signed continuity");
    if (root.identityBasis !== "signed-witness-under-supplied-policy-pin") throw new Error("Signed recovery identity basis is unsupported.");
    const terminal = exact(root.terminal, ["workspaceId", "lineageId", "branchId", "originScope", "sequence", "generation", "anchorDigest", "workspaceDigest", "ledgerGenesisHash", "auditHeadDigest", "terminalStateDigest", "auditCount", "predecessorTerminalHash", "witnessDigest"], "Recovery signed terminal");
    return {
      status,
      signedSetRawSha256: digest(root.signedSetRawSha256, "signed-set raw digest"),
      policyRawSha256: digest(root.policyRawSha256, "policy raw digest"),
      policyCanonicalSha256: digest(root.policyCanonicalSha256, "canonical policy digest"),
      policyId: id(root.policyId, "policy ID"),
      policyRevision: integer(root.policyRevision, 1, Number.MAX_SAFE_INTEGER, "policy revision"),
      authorityId: id(root.authorityId, "authority ID"),
      keyId: id(root.keyId, "key ID"),
      identityBasis: "signed-witness-under-supplied-policy-pin",
      terminal: {
        workspaceId: id(terminal.workspaceId, "terminal workspace ID"),
        lineageId: id(terminal.lineageId, "terminal lineage ID"),
        branchId: id(terminal.branchId, "terminal branch ID"),
        originScope: exactOrigin(terminal.originScope, "terminal origin scope"),
        sequence: integer(terminal.sequence, 1, Number.MAX_SAFE_INTEGER, "terminal sequence"),
        generation: integer(terminal.generation, 1, Number.MAX_SAFE_INTEGER, "terminal generation"),
        anchorDigest: digest(terminal.anchorDigest, "terminal anchor digest"),
        workspaceDigest: digest(terminal.workspaceDigest, "terminal workspace digest"),
        ledgerGenesisHash: digest(terminal.ledgerGenesisHash, "terminal ledger genesis"),
        auditHeadDigest: digest(terminal.auditHeadDigest, "terminal audit head"),
        terminalStateDigest: digest(terminal.terminalStateDigest, "terminal state digest"),
        auditCount: integer(terminal.auditCount, 1, 10_000, "terminal audit count"),
        predecessorTerminalHash: terminal.predecessorTerminalHash === null ? null : digest(terminal.predecessorTerminalHash, "terminal predecessor hash"),
        witnessDigest: digest(terminal.witnessDigest, "terminal witness digest"),
      },
    };
  }
  throw new Error("Recovery continuity status is unsupported.");
}

function snapshotRecoveryContinuityMaterial(value: RecoveryContinuityMaterial): RecoveryContinuityMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Recovery continuity material must be a plain data object.");
  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("Recovery continuity material must not contain symbol fields.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("Recovery continuity material must contain only enumerable data fields; accessors are not supported.");
    snapshot[key] = descriptor.value;
  }
  const kind = snapshot.kind;
  if (kind === "none") {
    exact(snapshot, ["kind"], "Recovery continuity material");
    return { kind };
  }
  if (kind === "unsigned-receipt") {
    const root = exact(snapshot, ["kind", "receiptText"], "Recovery unsigned continuity material");
    if (typeof root.receiptText !== "string") throw new Error("Recovery continuity receipt text must be a string.");
    return { kind, receiptText: root.receiptText };
  }
  if (kind === "pinned-signed-witness") {
    const root = exact(snapshot, ["kind", "signedWitnessSetText", "trustPolicyText", "expectedPolicyDigest"], "Recovery signed continuity material");
    if (typeof root.signedWitnessSetText !== "string" || typeof root.trustPolicyText !== "string" || typeof root.expectedPolicyDigest !== "string") throw new Error("Recovery signed continuity material must contain string evidence and policy fields.");
    return { kind, signedWitnessSetText: root.signedWitnessSetText, trustPolicyText: root.trustPolicyText, expectedPolicyDigest: root.expectedPolicyDigest };
  }
  throw new Error("Recovery continuity material kind is unsupported.");
}

function exact<const K extends readonly string[]>(value: unknown, keys: K, label: string): Record<K[number], unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
  return value as Record<K[number], unknown>;
}

function digest(value: unknown, label: string): string { if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`); return value; }
function id(value: unknown, label: string): string { if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} is invalid.`); return value; }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`); return value; }
function boundedText(value: unknown, maximum: number, label: string): string { if (typeof value !== "string" || !value || value.length > maximum || value !== value.normalize("NFC") || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is not bounded canonical text.`); return value; }
function instant(value: unknown, label: string): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} must be a canonical browser-claimed UTC instant.`); return value; }
function exactOrigin(value: unknown, label: string): string { if (typeof value !== "string") throw new Error(`${label} must be an exact HTTPS origin.`); let parsed: URL; try { parsed = new URL(value); } catch { throw new Error(`${label} must be an exact HTTPS origin.`); } if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== value) throw new Error(`${label} must be an exact credential-free HTTPS origin.`); return value; }
async function sha256Text(value: string): Promise<string> { const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
