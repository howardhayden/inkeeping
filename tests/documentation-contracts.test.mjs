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
  "docs/RED_TEAM_REGISTER.md",
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
  assert.match(traceability, /JSON-001/);
  assert.match(traceability, /EVID-001/);
  assert.match(traceability, /AUD-003/);
  assert.match(traceability, /UI-FRESH-001/);
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

test("repository licensing and red-team evidence do not make contradictory authority claims", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  const contributing = await readFile(path.join(projectRoot, "CONTRIBUTING.md"), "utf8");
  const licensing = await readFile(path.join(projectRoot, "LICENSING.md"), "utf8");
  const register = await readFile(path.join(projectRoot, "docs/RED_TEAM_REGISTER.md"), "utf8");
  const historicalValidation = await readFile(path.join(projectRoot, "docs/VALIDATION_REPORT.md"), "utf8");

  assert.match(readme, /source-available for noncommercial use/i);
  assert.doesNotMatch(readme, /released under the \[MIT License\]/i);
  assert.match(licensing, /original software.*PolyForm-Noncommercial-1\.0\.0/is);
  assert.doesNotMatch(contributing, /Software and mixed source files follow the MIT License/i);
  assert.doesNotMatch(contributing, /standalone documentation follows CC BY-SA 4\.0/i);
  assert.match(register, /integrity is not authenticity/i);
  assert.match(register, /Reproduced failure or unsafe ambiguity.*Enforced constraint and implementation.*Evidence/is);
  assert.match(register, /Focused verified.*not the complete engineering suite/is);
  assert.match(register, /RT-AUTH-001.*recomputing hashes.*wholesale record\/history replacement/is);
  assert.match(register, /RT-SEM-001.*operator-admitted-unverified/is);
  assert.match(register, /RT-FRESH-001.*single-use.*RT-FRESH-003 fence/is);
  assert.doesNotMatch(register, /RT-PARSE-00[1-5]\s*\|\s*\*\*Open/i);
  assert.match(historicalValidation, /Historical candidate-specific evidence.*not current working-tree proof/is);
  assert.match(historicalValidation, /139 tests, 139 passed/);
});

test("governing docs preserve continuity, evidence, and click-time trust boundaries", async () => {
  const architecture = await readFile(path.join(projectRoot, "docs/ARCHITECTURE.md"), "utf8");
  const dataModel = await readFile(path.join(projectRoot, "docs/DATA_MODEL.md"), "utf8");
  const security = await readFile(path.join(projectRoot, "docs/SECURITY.md"), "utf8");

  assert.match(architecture, /IndexedDB v3/i);
  assert.match(dataModel, /workspace-continuity-anchors/);
  assert.match(dataModel, /in-keeping\/evidence-application-outcome/);
  assert.match(dataModel, /resultingRevisionId.*resultingRevisionDigest/is);
  assert.match(security, /unsigned exact-checkpoint receipt/i);
  assert.match(security, /For ordinary output.*requires a bounded `in-keeping\/signed-continuity-witness-set`/is);
  assert.match(security, /requires the exact current policy SHA-256 obtained through a separate institutional trust channel/i);
  assert.match(security, /trust-policy JSON cannot authorize itself/i);
  assert.match(architecture, /reset ledger.*cannot advance the same anchor/i);
  assert.match(security, /no local state is named trusted, verified, authenticated, or authoritative/i);
  assert.match(security, /constructs an immutable `File`.*repeats the complete saved-state.*artifact-snapshot checks/is);
  assert.match(security, /readonly IndexedDB transaction over the manifest, generation, and continuity-anchor stores.*synchronous browser open\/download request/is);
  assert.match(security, /does not make browser or operating-system persistence part of the IndexedDB transaction/i);
});
