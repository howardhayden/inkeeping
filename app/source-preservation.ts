import { reviewImport, type ImportReview } from "./lab-core.ts";
import { reviewArchiveImport, type ArchiveImportReview } from "./archival-schemas.ts";
import { assertSafeJsonText, assertUnicodeScalarTree } from "./json-safety.ts";
import { isBrowserFile, readBrowserFileBytes } from "./browser-file-activation.ts";

export const SOURCE_PRESERVATION_SCHEMA = "in-keeping/source-preservation";
export const MAX_PRESERVATION_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_PRESERVATION_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_REVIEW_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 48 * 1024;
const CHUNK_CHARACTERS = 4 * CHUNK_BYTES / 3;
const PROTECTION = "plaintext-json-not-encrypted";
type SourceKind = "catalog" | "archive";
type Review = ImportReview | ArchiveImportReview;
type JsonObject = Record<string, unknown>;

export type PreservedImport<T extends Review> = {
  review: T;
  packageFile: File | null;
  preservationError: string;
};

type SourceMetadata = { filename: string; mediaType: string; lastModified: number; bytes: number; sha256: string };
type StoredReview = { kind: SourceKind; parserProfile: string; snapshot: JsonObject };
export type RecoveredSource = { file: File; metadata: SourceMetadata; review: StoredReview };

export function prepareSourceImport(file: File, kind: "catalog"): Promise<PreservedImport<ImportReview>>;
export function prepareSourceImport(file: File, kind: "archive"): Promise<PreservedImport<ArchiveImportReview>>;
export async function prepareSourceImport(file: File, kind: SourceKind): Promise<PreservedImport<Review>> {
  if (!isBrowserFile(file)) throw new Error("Choose a source file.");
  if (kind !== "catalog" && kind !== "archive") throw new Error("Unsupported source kind.");
  // Snapshot the immutable Blob before either review or preservation reads it.
  const source = new File([Blob.prototype.slice.call(file)], file.name, { type: file.type, lastModified: file.lastModified });
  const review = kind === "catalog" ? await reviewImport(source) : await reviewArchiveImport(source);
  try {
    if (source.size > MAX_PRESERVATION_SOURCE_BYTES) throw new Error("Source preservation has a 32 MiB limit. No bytes were truncated.");
    const metadata = {
      filename: exactText(source.name, 1024, "Source filename"),
      mediaType: exactText(source.type, 256, "Source media type", true),
      lastModified: exactInteger(source.lastModified, Number.MAX_SAFE_INTEGER, "Source modification time"),
      bytes: source.size,
      sha256: "",
    };
    assertUnicodeScalarTree(metadata);
    const bytes = new Uint8Array(await readBrowserFileBytes(source));
    metadata.sha256 = await digest(bytes);
    const snapshot = assertSafeJsonText(JSON.stringify(review)) as JsonObject;
    const storedReview = { kind, parserProfile: `${kind}-${review.format}-v1`, snapshot };
    validateReview(storedReview, metadata);
    const payload = {
      schema: SOURCE_PRESERVATION_SCHEMA,
      version: 1,
      protection: PROTECTION,
      source: { ...metadata, encoding: "base64", chunks: encodeChunks(bytes) },
      review: storedReview,
    };
    const text = JSON.stringify({ ...payload, packageSha256: await digest(JSON.stringify(payload)) });
    const packageFile = new File([text], `${downloadName(source.name)}.in-keeping-source.json`, { type: "application/json" });
    if (packageFile.size > MAX_PRESERVATION_PACKAGE_BYTES) throw new Error("The complete preservation package exceeds the 80 MiB limit. No source or review content was omitted.");
    return { review, packageFile, preservationError: "" };
  } catch (error) {
    return { review, packageFile: null, preservationError: error instanceof Error ? error.message : "Source preservation could not be prepared. Keep the original file." };
  }
}

/** Recovery checks stored claims but never grants an import/apply capability. */
export async function recoverSourcePreservation(file: File): Promise<RecoveredSource> {
  if (!isBrowserFile(file)) throw new Error("Choose a preservation package.");
  const blob = Blob.prototype.slice.call(file) as Blob;
  if (!blob.size || blob.size > MAX_PRESERVATION_PACKAGE_BYTES) throw new Error("Preservation packages must contain 1 byte–80 MiB.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer());
  const root = object(assertSafeJsonText(text));
  exactKeys(root, ["schema", "version", "protection", "source", "review", "packageSha256"]);
  if (root.schema !== SOURCE_PRESERVATION_SCHEMA || root.version !== 1) throw new Error("Unsupported source-preservation package version.");
  if (root.protection !== PROTECTION) throw new Error("The package must identify its contents as plaintext, not encrypted.");
  const source = object(root.source);
  exactKeys(source, ["filename", "mediaType", "lastModified", "bytes", "sha256", "encoding", "chunks"]);
  const metadata: SourceMetadata = {
    filename: exactText(source.filename, 1024, "Source filename"),
    mediaType: exactText(source.mediaType, 256, "Source media type", true),
    lastModified: exactInteger(source.lastModified, Number.MAX_SAFE_INTEGER, "Source modification time"),
    bytes: exactInteger(source.bytes, MAX_PRESERVATION_SOURCE_BYTES, "Source byte count"),
    sha256: exactDigest(source.sha256),
  };
  if (source.encoding !== "base64") throw new Error("Unsupported source encoding.");
  const storedReview = object(root.review);
  validateReview(storedReview, metadata);
  // Fixed envelope order, with review snapshot member order retained as stored.
  const payload = {
    schema: root.schema, version: root.version, protection: root.protection,
    source: { ...metadata, encoding: source.encoding, chunks: source.chunks },
    review: { kind: storedReview.kind, parserProfile: storedReview.parserProfile, snapshot: storedReview.snapshot },
  };
  validateChunks(source.chunks, metadata.bytes);
  if (exactDigest(root.packageSha256) !== await digest(JSON.stringify(payload))) throw new Error("Preservation package digest mismatch. Recovery was blocked.");
  const bytes = decodeChunks(source.chunks as string[], metadata.bytes);
  if (metadata.sha256 !== await digest(bytes)) throw new Error("Original source digest mismatch. Recovery was blocked.");
  return {
    file: new File([bytes], downloadName(metadata.filename), { type: "application/octet-stream", lastModified: metadata.lastModified }),
    metadata,
    review: storedReview as StoredReview,
  };
}

function validateReview(value: JsonObject, source: SourceMetadata): void {
  exactKeys(value, ["kind", "parserProfile", "snapshot"]);
  if (value.kind !== "catalog" && value.kind !== "archive") throw new Error("Unsupported preservation review kind.");
  const snapshot = object(value.snapshot);
  exactKeys(snapshot, value.kind === "catalog"
    ? ["filename", "bytes", "digest", "format", "records", "findings", "blocked", "summary"]
    : ["filename", "bytes", "digest", "format", "schema", "units", "blocked", "summary"]);
  inspectSnapshot(snapshot, 0, { nodes: 0 });
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_REVIEW_BYTES) throw new Error("The complete review exceeds the 32 MiB preservation limit. Keep the original file; no review content was omitted.");
  exactText(snapshot.filename, 180, "Review filename", true);
  const format = exactText(snapshot.format, 40, "Review format");
  if (!/^[a-z0-9-]+$/.test(format) || value.parserProfile !== `${value.kind}-${format}-v1`) throw new Error("Preservation parser profile does not match its review.");
  exactText(snapshot.summary, 8192, "Review summary", true);
  if (typeof snapshot.blocked !== "boolean" || snapshot.bytes !== source.bytes) throw new Error("Preservation review does not match the source byte count or outcome.");
  if (snapshot.digest !== source.sha256 && !(snapshot.blocked && snapshot.digest === "")) throw new Error("Preservation review source digest mismatch.");
  if (value.kind === "catalog") {
    if (!Array.isArray(snapshot.records) || !Array.isArray(snapshot.findings)) throw new Error("Catalog preservation review requires records and findings.");
  } else if (!Array.isArray(snapshot.units) || (snapshot.schema !== null && typeof snapshot.schema !== "object")) {
    throw new Error("Archive preservation review requires schema and records.");
  }
}

function inspectSnapshot(value: unknown, depth: number, budget: { nodes: number }): void {
  budget.nodes += 1;
  if (depth > 32 || budget.nodes > 2_000_000) throw new Error("Preservation review structure exceeds its limit.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > 8192) throw new Error("Preservation review text exceeds its limit.");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 100_000) throw new Error("Preservation review array exceeds its limit.");
    value.forEach((item) => inspectSnapshot(item, depth + 1, budget));
    return;
  }
  const record = object(value);
  if (Object.keys(record).length > 256) throw new Error("Preservation review object exceeds its limit.");
  for (const [key, item] of Object.entries(record)) {
    if (key.length > 256 || ["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe preservation review key.");
    inspectSnapshot(item, depth + 1, budget);
  }
}

function encodeChunks(bytes: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
    chunks.push(btoa(String.fromCharCode(...chunk)));
  }
  return chunks;
}

function validateChunks(value: unknown, bytes: number): void {
  if (!Array.isArray(value) || value.length !== Math.ceil(bytes / CHUNK_BYTES)) throw new Error("Source chunk count does not match its byte count.");
  for (let index = 0; index < value.length; index += 1) {
    const chunk = value[index];
    const expectedBytes = Math.min(CHUNK_BYTES, bytes - index * CHUNK_BYTES);
    if (typeof chunk !== "string" || chunk.length > CHUNK_CHARACTERS || chunk.length !== 4 * Math.ceil(expectedBytes / 3) || /[^A-Za-z0-9+/=]/.test(chunk)) throw new Error("Invalid source base64 chunk.");
  }
}

function decodeChunks(chunks: string[], length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    const decoded = atob(chunk);
    if (btoa(decoded) !== chunk || decoded.length !== Math.min(CHUNK_BYTES, length - offset)) throw new Error("Source base64 is not canonical or has an invalid length.");
    for (let index = 0; index < decoded.length; index += 1) bytes[offset++] = decoded.charCodeAt(index);
  }
  return bytes;
}

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Preservation package requires an object.");
  return value as JsonObject;
}

function exactKeys(value: JsonObject, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error("Preservation package has missing or unknown fields.");
}

function exactText(value: unknown, maximum: number, label: string, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.length) || value.length > maximum) throw new Error(`${label} exceeds the preservation contract.`);
  return value;
}

function exactInteger(value: unknown, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`${label} exceeds the preservation limit.`);
  return value;
}

function exactDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid preservation digest.");
  return value;
}

function downloadName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f/\\:\u202a-\u202e\u2066-\u2069]/g, "_").replace(/^\.+/, "_").slice(0, 180) || "recovered-source.bin";
}

async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
