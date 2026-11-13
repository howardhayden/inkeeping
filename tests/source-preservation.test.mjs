import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { activeRevision, applyImport, createBlankWorkspace } from "../app/lab-core.ts";
import { makeArchiveSchema, formatArchive } from "../app/archival-schemas.ts";
import {
  MAX_PRESERVATION_SOURCE_BYTES,
  MAX_PRESERVATION_PACKAGE_BYTES,
  prepareSourceImport,
  recoverSourcePreservation,
} from "../app/source-preservation.ts";

globalThis.DOMParser = DOMParser;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = () => new File([new Uint8Array([0xef, 0xbb, 0xbf]), 'title,creators\r\n"Cafe\u0301",Example\r\n'], "Cafe\u0301.csv", { type: "text/csv", lastModified: 12345 });
const pack = (value) => new File([JSON.stringify(value)], "source.in-keeping-source.json", { type: "application/json" });
const resign = (value) => { const payload = { ...value }; delete payload.packageSha256; value.packageSha256 = hash(JSON.stringify(payload)); return value; };

test("catalog preservation recovers exact bytes and metadata, including BOM, CRLF and decomposed Unicode", async () => {
  const original = source();
  const prepared = await prepareSourceImport(original, "catalog");
  assert.equal(prepared.review.blocked, false, prepared.review.summary);
  assert.equal(prepared.preservationError, "");
  const recovered = await recoverSourcePreservation(prepared.packageFile);
  assert.deepEqual(Buffer.from(await recovered.file.arrayBuffer()), Buffer.from(await original.arrayBuffer()));
  assert.equal(recovered.metadata.filename, original.name);
  assert.equal(recovered.metadata.mediaType, original.type);
  assert.equal(recovered.metadata.lastModified, original.lastModified);
  assert.equal(recovered.metadata.sha256, hash(Buffer.from(await original.arrayBuffer())));
  assert.equal(recovered.file.type, "application/octet-stream");
  assert.deepEqual(recovered.review.snapshot, prepared.review);
  assert.equal(recovered.review.parserProfile, "catalog-csv-v1");
  prepared.review.records[0].title = "Changed after packaging";
  assert.notEqual(recovered.review.snapshot.records[0].title, prepared.review.records[0].title);
  const workspace = await createBlankWorkspace();
  const rejected = await applyImport(workspace, recovered.review.snapshot, {});
  assert.deepEqual(activeRevision(rejected), activeRevision(workspace));
  assert.equal(rejected.audit.at(-1).outcome, "rejected");
});

test("archival preservation carries the complete schema and records", async () => {
  const schema = makeArchiveSchema("blank", "Preserved archive", "SCHEMA-SOURCE");
  const units = [{ id: "ROOT", schemaId: schema.id, schemaVersion: schema.version, parentId: null, level: "collection", values: { reference_code: "MS-1", title: "Original description" }, published: false, language: "en", createdAt: schema.createdAt, updatedAt: schema.updatedAt }];
  const original = new File([formatArchive(schema, units, "schema-package")], "archive.json", { type: "application/json" });
  const prepared = await prepareSourceImport(original, "archive");
  assert.equal(prepared.review.blocked, false, prepared.review.summary);
  const recovered = await recoverSourcePreservation(prepared.packageFile);
  assert.deepEqual(recovered.review.snapshot.schema, schema);
  assert.deepEqual(recovered.review.snapshot.units, units);
  assert.deepEqual(Buffer.from(await recovered.file.arrayBuffer()), Buffer.from(await original.arrayBuffer()));
});

test("recovery retains original metadata while making download filenames safe", async () => {
  const original = new File(["title\nExample\n"], "../unsafe\\name\u202e.csv", { type: "text/csv" });
  const prepared = await prepareSourceImport(original, "catalog");
  const recovered = await recoverSourcePreservation(prepared.packageFile);
  assert.equal(recovered.metadata.filename, original.name);
  assert.doesNotMatch(recovered.file.name, /[\\/\u202e]/);
  assert.deepEqual(Buffer.from(await recovered.file.arrayBuffer()), Buffer.from(await original.arrayBuffer()));
});

test("the package byte ceiling accepts 80 MiB with harmless JSON whitespace", async () => {
  const prepared = await prepareSourceImport(source(), "catalog");
  const padding = new Uint8Array(MAX_PRESERVATION_PACKAGE_BYTES - prepared.packageFile.size).fill(32);
  const atLimit = new File([prepared.packageFile, padding], "boundary.json");
  assert.equal(atLimit.size, MAX_PRESERVATION_PACKAGE_BYTES);
  const recovered = await recoverSourcePreservation(atLimit);
  assert.equal(recovered.metadata.sha256, hash(Buffer.from(await source().arrayBuffer())));
});

test("blocked, invalid UTF-8, binary, and empty sources remain exactly recoverable without becoming admitted", async () => {
  for (const bytes of [new Uint8Array([0xff, 0, 0xc3, 0x28, 13, 10]), new Uint8Array(), new TextEncoder().encode('<!DOCTYPE x><x/>')]) {
    const prepared = await prepareSourceImport(new File([bytes], "rejected.xml", { type: "application/xml" }), "catalog");
    assert.equal(prepared.review.blocked, true);
    const recovered = await recoverSourcePreservation(prepared.packageFile);
    assert.equal(recovered.review.snapshot.blocked, true);
    assert.deepEqual(new Uint8Array(await recovered.file.arrayBuffer()), bytes);
  }
});

test("recovery rejects changes to bytes, metadata, review, schema, and protection declaration", async () => {
  const prepared = await prepareSourceImport(source(), "catalog");
  const base = JSON.parse(await prepared.packageFile.text());
  for (const change of [
    (p) => { p.source.chunks[0] = 'AAAA'; },
    (p) => { p.source.filename = "another.csv"; },
    (p) => { p.review.snapshot.records[0].title = "Substituted"; },
    (p) => { p.version = 2; },
    (p) => { p.protection = "encrypted"; },
    (p) => { p.verified = true; },
    (p) => { p.source.bytes += 1; },
  ]) {
    const value = structuredClone(base); change(value);
    await assert.rejects(recoverSourcePreservation(pack(value)));
  }
  const modifiedBytes = structuredClone(base);
  modifiedBytes.source.chunks[0] = Buffer.from("bad").toString("base64");
  modifiedBytes.source.bytes = 3;
  modifiedBytes.review.snapshot.bytes = 3;
  await assert.rejects(recoverSourcePreservation(pack(resign(modifiedBytes))), /source.*digest/i);
});

test("quarantine rejects duplicate keys, surrogate strings, prototype keys, invalid base64, and oversized packages", async () => {
  const prepared = await prepareSourceImport(source(), "catalog");
  const text = await prepared.packageFile.text();
  await assert.rejects(recoverSourcePreservation(new File([text.replace('"version":1', '"version":1,"ver\\u0073ion":1')], "duplicate.json")), /duplicate/i);
  const base = JSON.parse(text);
  for (const change of [
    (p) => { p.source.filename = "bad\ud800.csv"; },
    (p) => { p.source.chunks = ["AB=="]; p.source.bytes = 1; },
    (p) => { p.source.chunks[0] += "\n"; },
    (p) => { p.review.snapshot.records[0].constructor = "poison"; },
    (p) => { p.review.snapshot.digest = "a".repeat(64); },
    (p) => { p.review.parserProfile = "archive-csv-v1"; },
    (p) => { p.source.chunks = ["", ...p.source.chunks]; },
  ]) {
    const value = structuredClone(base); change(value);
    await assert.rejects(recoverSourcePreservation(pack(resign(value))));
  }
  await assert.rejects(recoverSourcePreservation(new File([new Uint8Array(MAX_PRESERVATION_PACKAGE_BYTES + 1)], "oversize.json")), /limit|MiB/i);
});

test("source ceiling accepts exactly 32 MiB and refuses one byte more without truncation", async () => {
  const bytes = new Uint8Array(MAX_PRESERVATION_SOURCE_BYTES);
  bytes[0] = 0xff; bytes[bytes.length - 1] = 0xfe;
  const prepared = await prepareSourceImport(new File([bytes], "boundary.in-keeping.json"), "catalog");
  assert.ok(prepared.packageFile, prepared.preservationError);
  const recovered = await recoverSourcePreservation(prepared.packageFile);
  assert.equal(recovered.file.size, bytes.length);
  assert.equal(hash(Buffer.from(await recovered.file.arrayBuffer())), hash(bytes));
  const over = await prepareSourceImport(new File([bytes, new Uint8Array([1])], "overflow.in-keeping.json"), "catalog");
  assert.equal(over.packageFile, null);
  assert.match(over.preservationError, /32 MiB/);
});
