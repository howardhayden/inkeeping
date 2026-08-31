import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { activeRevision, createBlankWorkspace, createFixtureWorkspace } from "../app/lab-core.ts";
import {
  WORKSPACE_BACKUP_MIME,
  WORKSPACE_BACKUP_PROTECTION,
  WORKSPACE_BACKUP_SCHEMA,
  makeWorkspaceBackup,
  reviewWorkspaceBackup,
  verifyWorkspaceBackupReviewBinding,
  workspaceBackupFilename,
} from "../app/workspace-backups.ts";

const AT = "2026-08-20T12:00:00.000Z";

test("workspace backups round-trip the complete validated state", async () => {
  const workspace = await createFixtureWorkspace();
  const text = await makeWorkspaceBackup(workspace, AT);
  const envelope = JSON.parse(text);
  assert.equal(envelope.schema, WORKSPACE_BACKUP_SCHEMA);
  assert.equal(envelope.version, 2);
  assert.equal(envelope.protection, WORKSPACE_BACKUP_PROTECTION);
  assert.match(text, new RegExp(workspace.name));
  assert.equal(envelope.createdAt, AT);
  assert.equal(envelope.payloadDigest.length, 64);

  const review = await reviewWorkspaceBackup(new File([text], "holding.in-keeping-workspace-backup.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(review.blocked, false, review.summary);
  assert.deepEqual(review.workspace, workspace);
  assert.equal(activeRevision(review.workspace).serviceRecords.length, 8);
  assert.match(review.summary, /catalog.*archival.*service records/i);
  assert.match(review.summary, /internal consistency verified.*authenticity.*not established/i);
  assert.equal(await verifyWorkspaceBackupReviewBinding(review), true);
  assert.equal(workspaceBackupFilename("Rare Books / 2026"), "Rare-Books-2026.in-keeping-workspace-backup.json");
});

test("workspace-backup apply capability cannot be cloned or paired with substituted state", async () => {
  const firstText = await makeWorkspaceBackup(await createFixtureWorkspace(), AT);
  const first = await reviewWorkspaceBackup(new File([firstText], "first.json", { type: WORKSPACE_BACKUP_MIME }));
  const secondWorkspace = await createBlankWorkspace("Substituted but otherwise valid review object");
  const secondText = await makeWorkspaceBackup(secondWorkspace, AT);
  const second = await reviewWorkspaceBackup(new File([secondText], "second.json", { type: WORKSPACE_BACKUP_MIME }));

  assert.equal(await verifyWorkspaceBackupReviewBinding(first), true);
  assert.equal(await verifyWorkspaceBackupReviewBinding(structuredClone(first)), false);
  const substituted = structuredClone(first);
  substituted.workspace = second.workspace;
  substituted.digest = second.digest;
  assert.equal(await verifyWorkspaceBackupReviewBinding(substituted), false);
});

test("workspace-backup capability rejects non-JSON mutations that collide during stringification", async () => {
  const text = await makeWorkspaceBackup(await createBlankWorkspace("Strict backup binding"), AT);
  const review = await reviewWorkspaceBackup(new File([text], "strict.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(await verifyWorkspaceBackupReviewBinding(review), true);

  review.workspace.revisions[0].parentId = Number.NaN;
  assert.equal(JSON.stringify(review.workspace.revisions[0].parentId), "null", "the attack collides with the reviewed null under JSON.stringify");
  assert.equal(await verifyWorkspaceBackupReviewBinding(review), false);
});

test("legacy version-one backup envelopes remain reviewable without changing their payload", async () => {
  const workspace = await createFixtureWorkspace();
  const envelope = JSON.parse(await makeWorkspaceBackup(workspace, AT));
  envelope.schema = "in-keeping/private-workspace-backup";
  envelope.version = 1;
  delete envelope.protection;
  const review = await reviewWorkspaceBackup(new File([JSON.stringify(envelope)], "legacy.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(review.blocked, false, review.summary);
  assert.deepEqual(review.workspace, workspace);
});

test("workspace-backup review rejects altered state even when the outer JSON is valid", async () => {
  const workspace = await createFixtureWorkspace();
  const envelope = JSON.parse(await makeWorkspaceBackup(workspace, AT));
  envelope.workspace.name = "Altered workspace";
  const review = await reviewWorkspaceBackup(new File([JSON.stringify(envelope)], "altered.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(review.blocked, true);
  assert.match(review.summary, /audit chain|digest/i);
});

test("workspace-backup envelope requires a real UTC instant", async () => {
  const workspace = await createFixtureWorkspace();
  const envelope = JSON.parse(await makeWorkspaceBackup(workspace, AT));
  envelope.createdAt = "2026-02-30T00:00:00.000Z";
  const review = await reviewWorkspaceBackup(new File([JSON.stringify(envelope)], "impossible-date.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(review.blocked, true);
  assert.match(review.summary, /ISO 8601 UTC instant/i);
});

test("current workspace backups cannot omit or misstate plaintext protection", async () => {
  const workspace = await createFixtureWorkspace();
  const envelope = JSON.parse(await makeWorkspaceBackup(workspace, AT));
  delete envelope.protection;
  const missing = await reviewWorkspaceBackup(new File([JSON.stringify(envelope)], "missing-protection.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(missing.blocked, true);
  assert.match(missing.summary, /plaintext JSON.*not encrypted/i);
  envelope.protection = "encrypted";
  const falseClaim = await reviewWorkspaceBackup(new File([JSON.stringify(envelope)], "false-protection.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(falseClaim.blocked, true);
  assert.match(falseClaim.summary, /plaintext JSON.*not encrypted/i);
});

test("workspace-backup quarantine rejects unknown fields, prototype keys, and unsupported versions", async () => {
  const workspace = await createFixtureWorkspace();
  const text = await makeWorkspaceBackup(workspace, AT);
  const unknown = JSON.parse(text);
  unknown.unexpected = true;
  assert.match((await reviewWorkspaceBackup(new File([JSON.stringify(unknown)], "unknown.json", { type: WORKSPACE_BACKUP_MIME }))).summary, /Unknown backup field/i);

  const poisoned = text.replace(/"workspace":\s*\{/, '"workspace":{"__proto__":{"polluted":true},');
  assert.match((await reviewWorkspaceBackup(new File([poisoned], "poisoned.json", { type: WORKSPACE_BACKUP_MIME }))).summary, /forbidden or oversized field/i);

  const future = JSON.parse(text);
  future.version = 99;
  assert.match((await reviewWorkspaceBackup(new File([JSON.stringify(future)], "future.json", { type: WORKSPACE_BACKUP_MIME }))).summary, /version is unsupported/i);
});

test("workspace-backup errors stay bounded under oversized hostile keys", async () => {
  const key = "x".repeat(12_000);
  const review = await reviewWorkspaceBackup(new File([JSON.stringify({ [key]: true })], "oversized-key.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(review.blocked, true);
  assert.ok(review.summary.length <= 500);
  assert.match(review.summary, /oversized field name/i);
});

test("workspace-backup JSON quarantine rejects duplicate decoded identities and lone surrogates", async () => {
  const text = await makeWorkspaceBackup(await createBlankWorkspace("Backup JSON quarantine"), AT);
  assert.equal(text[0], "{", "workspace backups must serialize as a top-level JSON object");
  const duplicate = `{"schema":"forged",${text.slice(1)}`;
  const duplicateReview = await reviewWorkspaceBackup(new File([duplicate], "duplicate-schema.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(duplicateReview.blocked, true);
  assert.match(duplicateReview.summary, /duplicate member name "schema"/i);

  const surrogate = text.replace(WORKSPACE_BACKUP_SCHEMA, "\\uD800");
  const surrogateReview = await reviewWorkspaceBackup(new File([surrogate], "surrogate-schema.json", { type: WORKSPACE_BACKUP_MIME }));
  assert.equal(surrogateReview.blocked, true);
  assert.match(surrogateReview.summary, /unpaired Unicode surrogate/i);
});

test("workspace-backup review enforces extension, MIME, size, and UTF-8 boundaries", async () => {
  assert.match((await reviewWorkspaceBackup(new File(["{}"], "backup.txt", { type: "application/json" }))).summary, /workspace-backup JSON/i);
  assert.match((await reviewWorkspaceBackup(new File(["{}"], "backup.json", { type: "text/html" }))).summary, /MIME type/i);
  assert.match((await reviewWorkspaceBackup(new File([], "backup.json", { type: "application/json" }))).summary, /empty/i);
  assert.match((await reviewWorkspaceBackup(new File([new Uint8Array([0xff, 0xfe, 0xfd])], "backup.json", { type: "application/json" }))).summary, /UTF-8/i);
});
