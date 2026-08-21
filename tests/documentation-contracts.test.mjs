import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
  }));
  return nested.flat();
}

const requiredDocuments = [
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CHANGELOG.md",
  "docs/PRODUCT_SCOPE.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_MODEL.md",
  "docs/IMPORTS.md",
  "docs/DATA_FORMATS.md",
  "docs/INTEROPERABILITY.md",
  "docs/STANDARDS_AND_REFERENCES.md",
  "docs/SAMPLE_DATA.md",
  "docs/SECURITY.md",
  "docs/THREAT_MODEL.md",
  "docs/PRIVACY_AND_DATA_GOVERNANCE.md",
  "docs/RISK_REGISTER.md",
  "docs/ACCESSIBILITY.md",
  "docs/TESTING.md",
  "docs/VALIDATION_REPORT.md",
  "docs/TRACEABILITY_MATRIX.md",
  "docs/DEPLOYMENT.md",
  "docs/OPERATIONS.md",
  "docs/RELEASE_AND_MAINTENANCE.md",
  "docs/PERFORMANCE_AND_RELIABILITY.md",
  "docs/decisions/README.md",
  "docs/review/SUNY_ALBANY_REVIEW_DOSSIER.md",
  "docs/review/REVIEW_EVIDENCE_MATRIX.md",
  "docs/review/EVALUATION_PROTOCOL.md",
  "docs/review/DATA_MANAGEMENT_AND_ETHICS.md",
  "docs/review/COMPETENCY_CROSSWALK.md",
];

test("the documented production and review set exists", async () => {
  await Promise.all(requiredDocuments.map((relative) => access(path.join(projectRoot, relative))));
});

test("local Markdown links resolve inside the repository", async () => {
  const files = [
    ...(await markdownFiles(path.join(projectRoot, "docs"))),
    ...((await readdir(projectRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(projectRoot, entry.name))),
  ];
  const failures = [];

  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    const links = markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
    for (const match of links) {
      const rawTarget = match[1].replace(/^<|>$/g, "");
      if (/^(?:https?:|mailto:|#)/i.test(rawTarget)) continue;
      const pathname = decodeURIComponent(rawTarget.split("#", 1)[0]);
      if (!pathname) continue;
      const resolved = path.resolve(path.dirname(file), pathname);
      const relative = path.relative(projectRoot, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        failures.push(`${path.relative(projectRoot, file)}: target escapes repository: ${rawTarget}`);
        continue;
      }
      try {
        await access(resolved);
      } catch {
        failures.push(`${path.relative(projectRoot, file)}: missing target: ${rawTarget}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("governing documentation records the implemented hostile-import controls precisely", async () => {
  const security = await readFile(path.join(projectRoot, "docs/SECURITY.md"), "utf8");
  const imports = await readFile(path.join(projectRoot, "docs/IMPORTS.md"), "utf8");
  const traceability = await readFile(path.join(projectRoot, "docs/TRACEABILITY_MATRIX.md"), "utf8");
  const standards = await readFile(path.join(projectRoot, "docs/STANDARDS_AND_REFERENCES.md"), "utf8");

  assert.match(security, /unused namespace declaration/i);
  assert.match(security, /foreign elements, foreign attributes/i);
  assert.match(security, /reject, do not truncate/i);
  assert.match(security, /fields (?:at|are limited to) 1,022 per entry/i);
  assert.match(imports, /lines never disappear silently/i);
  assert.match(imports, /at most one blank separator/i);
  assert.match(traceability, /XML-001/);
  assert.match(traceability, /CARD-001/);
  assert.match(traceability, /RIS-001/);
  assert.match(traceability, /MARC-001/);
  assert.match(traceability, /BIB-001/);
  assert.match(traceability, /UI-PAGE-001/);
  assert.match(traceability, /BAK-001/);
  assert.match(standards, /no official EAD XSD files and no test that invokes an external XSD validator/i);
});

test("backup and interface language disclose plaintext without reviving discarded status slogans", async () => {
  const ui = await readFile(path.join(projectRoot, "app/continuity-lab.tsx"), "utf8");
  const backups = await readFile(path.join(projectRoot, "app/workspace-backups.ts"), "utf8");
  const allDocs = (await Promise.all((await markdownFiles(path.join(projectRoot, "docs"))).map((file) => readFile(file, "utf8")))).join("\n");

  assert.match(ui, /Plaintext JSON/);
  assert.match(backups, /plaintext-json-not-encrypted/);
  assert.match(allDocs, /plaintext-json-not-encrypted/);
  assert.doesNotMatch(ui, /Private by default · No telemetry|Session active in memory|Not saved locally|BROWSER-LOCAL DATA|Blank workspace ready|Revision REV-/);
});
