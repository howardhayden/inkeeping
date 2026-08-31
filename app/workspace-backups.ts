import { activeRevision, validateWorkspaceSnapshot, type Workspace } from "./lab-core.ts";
import { assertSafeJsonText } from "./json-safety.ts";
import { MAX_WORKSPACE_BYTES } from "./lab-storage.ts";

export const WORKSPACE_BACKUP_MIME = "application/json";
export const WORKSPACE_BACKUP_SCHEMA = "in-keeping/workspace-backup";
export const WORKSPACE_BACKUP_VERSION = 2;
export const WORKSPACE_BACKUP_PROTECTION = "plaintext-json-not-encrypted";
const LEGACY_WORKSPACE_BACKUP_SCHEMA = "in-keeping/private-workspace-backup";
const MAX_BACKUP_BYTES = MAX_WORKSPACE_BYTES + 1024 * 1024;

export type WorkspaceBackupReview = {
  filename: string;
  bytes: number;
  digest: string;
  workspace: Workspace | null;
  blocked: boolean;
  summary: string;
};

const workspaceBackupReviewBindings = new WeakMap<WorkspaceBackupReview, string>();

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
    exactInstant(envelope.createdAt);
    if (typeof envelope.payloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(envelope.payloadDigest)) throw new Error("The backup payload digest is invalid.");
    const workspace = await validateWorkspaceSnapshot(envelope.workspace);
    const actualDigest = await sha256Hex(JSON.stringify(workspace));
    if (actualDigest !== envelope.payloadDigest) throw new Error("The backup payload digest does not match its workspace.");
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
  const expected = workspaceBackupReviewBindings.get(review);
  if (!expected || review.blocked || !review.workspace) return false;
  try {
    // JSON stringification alone is not a strict type boundary: values such as
    // NaN can collide with reviewed null values. Revalidate the exact object at
    // consumption so only the bounded JSON workspace that was reviewed opens.
    await validateWorkspaceSnapshot(review.workspace);
    return expected === await workspaceBackupReviewBinding(review);
  } catch {
    return false;
  }
}

export function workspaceBackupFilename(name: string): string {
  const safe = name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return `${safe}.in-keeping-workspace-backup.json`;
}

function reject(review: WorkspaceBackupReview, summary: string): WorkspaceBackupReview {
  return { ...review, blocked: true, workspace: null, summary };
}

function safeFilename(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "unnamed.json";
}

function exactInstant(value: unknown): string {
  if (typeof value !== "string") throw new Error("Backup time must be an ISO 8601 UTC instant.");
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/);
  const canonical = match ? `${match[1]}.${match[2] ?? "000"}Z` : "";
  if (!match || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== canonical) throw new Error("Backup time must be an ISO 8601 UTC instant.");
  return value;
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
    blocked: review.blocked,
    summary: review.summary,
  }));
}
