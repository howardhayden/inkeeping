import { activeRevision, validateWorkspaceSnapshot, type Workspace } from "./lab-core.ts";
import { assertSafeJsonText } from "./json-safety.ts";
import { MAX_WORKSPACE_BYTES } from "./lab-storage.ts";

export const WORKSPACE_BACKUP_MIME = "application/json";
export const WORKSPACE_BACKUP_SCHEMA = "in-keeping/workspace-backup";
export const WORKSPACE_BACKUP_VERSION = 2;
export const WORKSPACE_BACKUP_PROTECTION = "plaintext-json-not-encrypted";
export const LEGACY_WORKSPACE_BACKUP_SCHEMA = "in-keeping/private-workspace-backup";
const MAX_BACKUP_BYTES = MAX_WORKSPACE_BYTES + 1024 * 1024;

export type WorkspaceBackupEnvelopeMetadata = {
  schema: typeof WORKSPACE_BACKUP_SCHEMA | typeof LEGACY_WORKSPACE_BACKUP_SCHEMA;
  version: 1 | typeof WORKSPACE_BACKUP_VERSION;
  protectionDeclaration: typeof WORKSPACE_BACKUP_PROTECTION | "legacy-v1-unspecified";
  createdAtClaim: string;
  payloadSha256: string;
  parserProfile: "workspace-backup-v1" | "workspace-backup-v2";
  snapshot: {
    ledgerGenesisHash: string;
    terminalHash: string;
    terminalStateDigest: string;
    auditCount: number;
    predecessorTerminalHash: string | null;
  };
};

export type WorkspaceBackupReview = {
  filename: string;
  bytes: number;
  digest: string;
  workspace: Workspace | null;
  envelope: WorkspaceBackupEnvelopeMetadata | null;
  blocked: boolean;
  summary: string;
};

export type WorkspaceBackupReviewSnapshot = Omit<WorkspaceBackupReview, "workspace" | "envelope" | "blocked"> & {
  workspace: Workspace;
  envelope: WorkspaceBackupEnvelopeMetadata;
  blocked: false;
};

const workspaceBackupReviewBindings = new WeakMap<WorkspaceBackupReview, string>();
const WORKSPACE_BACKUP_REVIEW_KEYS = ["filename", "bytes", "digest", "workspace", "envelope", "blocked", "summary"] as const;
const WORKSPACE_BACKUP_ENVELOPE_KEYS = ["schema", "version", "protectionDeclaration", "createdAtClaim", "payloadSha256", "parserProfile", "snapshot"] as const;
const WORKSPACE_BACKUP_SNAPSHOT_KEYS = ["ledgerGenesisHash", "terminalHash", "terminalStateDigest", "auditCount", "predecessorTerminalHash"] as const;
const SHA256 = /^[a-f0-9]{64}$/;

export async function makeWorkspaceBackup(workspace: Workspace, createdAt = new Date().toISOString()): Promise<string> {
  const validated = await validateWorkspaceSnapshot(workspace);
  const payloadText = JSON.stringify(validated);
  const payloadDigest = await sha256Hex(payloadText);
  const text = JSON.stringify({
    schema: WORKSPACE_BACKUP_SCHEMA,
    version: WORKSPACE_BACKUP_VERSION,
    protection: WORKSPACE_BACKUP_PROTECTION,
    createdAt: exactInstant(createdAt),
    payloadDigest,
    workspace: validated,
  });
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error("The workspace backup exceeds the 26 MiB recovery limit. Divide the workspace before exporting.");
  return text;
}

export async function reviewWorkspaceBackup(file: File): Promise<WorkspaceBackupReview> {
  const review: WorkspaceBackupReview = {
    filename: safeFilename(file.name), bytes: file.size, digest: "", workspace: null,
    envelope: null,
    blocked: true, summary: "Workspace backup rejected.",
  };
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".json")) return reject(review, "Use an IN KEEPING workspace-backup JSON file.");
  if (file.type && file.type !== "application/json" && file.type !== "text/json") return reject(review, "The backup MIME type does not match JSON.");
  if (file.size === 0) return reject(review, "The backup file is empty.");
  if (file.size > MAX_BACKUP_BYTES) return reject(review, "The backup exceeds the 26 MiB review limit.");

  let text: string;
  try {
    const bytes = await file.arrayBuffer();
    review.digest = await sha256Hex(bytes);
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject(review, "The backup is not valid UTF-8.");
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return reject(review, "The backup contains disallowed control characters.");

  try {
    const parsed = assertSafeJsonText(text);
    inspect(parsed, 0);
    const envelope = object(parsed, "The backup envelope must be an object.");
    const current = envelope.schema === WORKSPACE_BACKUP_SCHEMA && envelope.version === WORKSPACE_BACKUP_VERSION;
    const legacy = envelope.schema === LEGACY_WORKSPACE_BACKUP_SCHEMA && envelope.version === 1;
    if (!current && !legacy) throw new Error("The workspace-backup version is unsupported.");
    exactKeys(envelope, current ? ["schema", "version", "protection", "createdAt", "payloadDigest", "workspace"] : ["schema", "version", "createdAt", "payloadDigest", "workspace"]);
    if (current && envelope.protection !== WORKSPACE_BACKUP_PROTECTION) throw new Error("The current backup must identify itself as plaintext JSON that is not encrypted.");
    const createdAtClaim = exactInstant(envelope.createdAt);
    if (typeof envelope.payloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(envelope.payloadDigest)) throw new Error("The backup payload digest is invalid.");
    const workspace = await validateWorkspaceSnapshot(envelope.workspace);
    const actualDigest = await sha256Hex(JSON.stringify(workspace));
    if (actualDigest !== envelope.payloadDigest) throw new Error("The backup payload digest does not match its workspace.");
    const first = workspace.audit[0];
    const terminal = workspace.audit.at(-1);
    if (!first || !terminal?.stateDigest) throw new Error("The backup workspace lacks a state-bound audit ledger.");
    review.envelope = {
      schema: current ? WORKSPACE_BACKUP_SCHEMA : LEGACY_WORKSPACE_BACKUP_SCHEMA,
      version: current ? WORKSPACE_BACKUP_VERSION : 1,
      protectionDeclaration: current ? WORKSPACE_BACKUP_PROTECTION : "legacy-v1-unspecified",
      createdAtClaim,
      payloadSha256: envelope.payloadDigest,
      parserProfile: current ? "workspace-backup-v2" : "workspace-backup-v1",
      snapshot: {
        ledgerGenesisHash: first.hash,
        terminalHash: terminal.hash,
        terminalStateDigest: terminal.stateDigest,
        auditCount: workspace.audit.length,
        predecessorTerminalHash: /^prior-ledger-sha256:([a-f0-9]{64})$/.exec(first.target)?.[1] ?? null,
      },
    };
    review.workspace = workspace;
    review.blocked = false;
    const revision = activeRevision(workspace);
    review.summary = `${workspace.name} · ${revision.records.length} catalog · ${revision.archiveUnits?.length ?? 0} archival · ${revision.serviceRecords?.length ?? 0} service records. Structure and internal consistency verified; authenticity, authorship, custody, completeness, authority, and trusted time are not established. Open the reviewed copy, then create a named workspace if it should remain in this browser.`;
    workspaceBackupReviewBindings.set(review, await workspaceBackupReviewBinding(review));
    return review;
  } catch (error) {
    return reject(review, safeError(error));
  }
}

export async function verifyWorkspaceBackupReviewBinding(review: WorkspaceBackupReview): Promise<boolean> {
  return await consumeWorkspaceBackupReview(review) !== null;
}

/**
 * Consume a process-local review capability into a detached, fully revalidated
 * snapshot. Callers must use the returned snapshot rather than reading the
 * mutable capability again after this asynchronous boundary.
 */
export async function consumeWorkspaceBackupReview(review: WorkspaceBackupReview): Promise<WorkspaceBackupReviewSnapshot | null> {
  const expected = workspaceBackupReviewBindings.get(review);
  if (!expected) return null;
  try {
    // Take the only read of caller-controlled state synchronously. Accessors are
    // not reviewed JSON data, and a detached copy cannot be changed while the
    // validation and digest promises below are pending.
    assertPlainDataGraph(review, new Set<object>(), 0);
    const detached = structuredClone(review) as WorkspaceBackupReview;
    exactKeys(object(detached, "Workspace backup review must be an object."), [...WORKSPACE_BACKUP_REVIEW_KEYS]);
    if (Object.keys(detached).length !== WORKSPACE_BACKUP_REVIEW_KEYS.length
      || detached.blocked !== false
      || typeof detached.filename !== "string"
      || safeFilename(detached.filename) !== detached.filename
      || typeof detached.bytes !== "number"
      || !Number.isSafeInteger(detached.bytes)
      || detached.bytes < 1
      || detached.bytes > MAX_BACKUP_BYTES
      || typeof detached.digest !== "string"
      || !SHA256.test(detached.digest)
      || typeof detached.summary !== "string"
      || !detached.summary
      || detached.summary.length > 2_000
      || detached.summary !== detached.summary.normalize("NFC")
      || /[\u0000-\u001f\u007f]/.test(detached.summary)
      || !detached.workspace
      || !detached.envelope) return null;

    const workspace = await validateWorkspaceSnapshot(detached.workspace);
    const envelope = await validateWorkspaceBackupEnvelopeMetadata(detached.envelope, workspace);
    if (expected !== await workspaceBackupReviewBinding(detached)) return null;
    return {
      filename: detached.filename,
      bytes: detached.bytes,
      digest: detached.digest,
      workspace,
      envelope,
      blocked: false,
      summary: detached.summary,
    };
  } catch {
    return null;
  }
}

export function workspaceBackupFilename(name: string): string {
  const safe = name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return `${safe}.in-keeping-workspace-backup.json`;
}

function reject(review: WorkspaceBackupReview, summary: string): WorkspaceBackupReview {
  return { ...review, blocked: true, workspace: null, envelope: null, summary };
}

function safeFilename(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "unnamed.json";
}

function exactInstant(value: unknown): string {
  if (typeof value !== "string") throw new Error("Backup time must be an ISO 8601 UTC instant.");
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/);
  const canonical = match ? `${match[1]}.${match[2] ?? "000"}Z` : "";
  if (!match || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== canonical) throw new Error("Backup time must be an ISO 8601 UTC instant.");
  return canonical;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): void {
  const safe = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !safe.has(key));
  if (unknown) throw new Error(`Unknown backup field: ${unknown}.`);
}

function inspect(value: unknown, depth: number): void {
  if (depth > 18) throw new Error("Backup nesting exceeds 18 levels.");
  if (typeof value === "string") {
    if (value.length > 8192) throw new Error("Backup text exceeds 8 KiB per value.");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("Backup text contains disallowed control characters.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new Error("Backup array exceeds 5,000 values.");
    value.forEach((item) => inspect(item, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 256) throw new Error("Backup object exceeds 256 fields.");
    for (const key of keys) {
      if (["__proto__", "prototype", "constructor"].includes(key) || key.length > 256 || /[\u0000-\u001f\u007f]/.test(key)) throw new Error("Backup contains a forbidden or oversized field name.");
      inspect((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}

async function validateWorkspaceBackupEnvelopeMetadata(value: unknown, workspace: Workspace): Promise<WorkspaceBackupEnvelopeMetadata> {
  const envelope = object(value, "Workspace backup envelope metadata must be an object.");
  exactKeys(envelope, [...WORKSPACE_BACKUP_ENVELOPE_KEYS]);
  if (Object.keys(envelope).length !== WORKSPACE_BACKUP_ENVELOPE_KEYS.length) throw new Error("Workspace backup envelope metadata has missing fields.");
  const snapshot = object(envelope.snapshot, "Workspace backup checkpoint metadata must be an object.");
  exactKeys(snapshot, [...WORKSPACE_BACKUP_SNAPSHOT_KEYS]);
  if (Object.keys(snapshot).length !== WORKSPACE_BACKUP_SNAPSHOT_KEYS.length) throw new Error("Workspace backup checkpoint metadata has missing fields.");

  const current = envelope.schema === WORKSPACE_BACKUP_SCHEMA
    && envelope.version === WORKSPACE_BACKUP_VERSION
    && envelope.protectionDeclaration === WORKSPACE_BACKUP_PROTECTION
    && envelope.parserProfile === "workspace-backup-v2";
  const legacy = envelope.schema === LEGACY_WORKSPACE_BACKUP_SCHEMA
    && envelope.version === 1
    && envelope.protectionDeclaration === "legacy-v1-unspecified"
    && envelope.parserProfile === "workspace-backup-v1";
  if (!current && !legacy) throw new Error("Workspace backup envelope metadata is contradictory.");
  const createdAtClaim = exactInstant(envelope.createdAtClaim);
  if (createdAtClaim !== envelope.createdAtClaim || typeof envelope.payloadSha256 !== "string" || !SHA256.test(envelope.payloadSha256)) throw new Error("Workspace backup envelope digest or timestamp is invalid.");

  const first = workspace.audit[0];
  const terminal = workspace.audit.at(-1);
  if (!first || !terminal?.stateDigest) throw new Error("The backup workspace lacks a state-bound audit ledger.");
  const payloadSha256 = await sha256Hex(JSON.stringify(workspace));
  const expectedSnapshot: WorkspaceBackupEnvelopeMetadata["snapshot"] = {
    ledgerGenesisHash: first.hash,
    terminalHash: terminal.hash,
    terminalStateDigest: terminal.stateDigest,
    auditCount: workspace.audit.length,
    predecessorTerminalHash: /^prior-ledger-sha256:([a-f0-9]{64})$/.exec(first.target)?.[1] ?? null,
  };
  if (payloadSha256 !== envelope.payloadSha256 || JSON.stringify(snapshot) !== JSON.stringify(expectedSnapshot)) throw new Error("Workspace backup envelope metadata does not match its workspace.");
  return {
    schema: current ? WORKSPACE_BACKUP_SCHEMA : LEGACY_WORKSPACE_BACKUP_SCHEMA,
    version: current ? WORKSPACE_BACKUP_VERSION : 1,
    protectionDeclaration: current ? WORKSPACE_BACKUP_PROTECTION : "legacy-v1-unspecified",
    createdAtClaim,
    payloadSha256,
    parserProfile: current ? "workspace-backup-v2" : "workspace-backup-v1",
    snapshot: expectedSnapshot,
  };
}

function assertPlainDataGraph(value: unknown, seen: Set<object>, depth: number): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Workspace backup review data must contain finite numbers.");
    return;
  }
  if (!value || typeof value !== "object" || depth > 20 || seen.has(value)) throw new Error("Workspace backup review must be an acyclic plain-data graph.");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype)) throw new Error("Workspace backup review must contain only plain data objects.");
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    if (typeof key !== "string") throw new Error("Workspace backup review must not contain symbol fields.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("Workspace backup review must contain only enumerable data fields.");
    assertPlainDataGraph(descriptor.value, seen, depth + 1);
  }
  seen.delete(value);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The backup structure is invalid.";
  return message.normalize("NFC").replace(/[<>\u0000-\u001f\u007f]/g, "").slice(0, 500) || "The backup structure is invalid.";
}

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function workspaceBackupReviewBinding(review: WorkspaceBackupReview): Promise<string> {
  return sha256Hex(JSON.stringify({
    filename: review.filename,
    bytes: review.bytes,
    digest: review.digest,
    workspace: review.workspace,
    envelope: review.envelope,
    blocked: review.blocked,
    summary: review.summary,
  }));
}
