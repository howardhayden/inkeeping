#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sbomPath = path.resolve(root, process.argv[2] ?? "in-keeping.cdx.json");
const licenseId = "LicenseRef-Hayden-Proprietary-1.1";
const supersededLicenseId = "LicenseRef-Hayden-Proprietary-1.0";
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const sbomText = await readFile(sbomPath, "utf8");
const sbom = JSON.parse(sbomText);

assert.equal(sbom.bomFormat, "CycloneDX", "SBOM must be CycloneDX");
assert.equal(sbom.metadata?.component?.["bom-ref"], `${packageJson.name}@${packageJson.version}`);
assert.equal(sbom.metadata?.component?.purl, `pkg:npm/${packageJson.name}@${packageJson.version}`);
assert.ok(
  sbom.metadata?.component?.licenses?.some((entry) => entry.license?.id === licenseId),
  `root component must declare ${licenseId}`,
);
assert.ok(!sbomText.includes(supersededLicenseId), "SBOM retains the superseded active identifier");

console.log(`CycloneDX root component declares ${licenseId}.`);
