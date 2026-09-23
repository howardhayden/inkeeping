#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const licenseId = "LicenseRef-Hayden-Proprietary-1.1";
const licenseName = "Hayden Howard Proprietary Product and Source License 1.1";
const canonicalLicenseHash = "07b7734eb4da7c79ffdd32d4641ab64eea1922e8149ebf50c430e5f54657628c";
const copySpecificNotice =
  "Permissions validly attached to earlier distributed copies remain governed by their own terms and do not automatically attach to later copies or snapshots.";
const baselineParent = "f45b1fb1b64011c44a3c85cd1307745517d0a7d6";
const permissiveCutoff = "1019e26582c9f676b1184ef6ced42adea65b732b";
const baselineCommit = "a9915ad36b43759e32dbe46befc09bd64743dcfb";
const historicalHashes = new Map([
  ["LICENSES/HISTORICAL/Hayden-Proprietary-1.0-2026-09-23.txt", "822ce196a020ed2d4e3f077af3f2b49f11f8fc57e4310f3b32ac7cdb461054a0"],
  ["LICENSES/MIT-2026-08-24.txt", "f1ae5d3c15dc06b1cadeabb6c55e1abf095275554875c1d40df41d870f797d72"],
  ["LICENSES/PolyForm-Noncommercial-1.0.0.txt", "ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8"],
  ["LICENSES/CC-BY-NC-SA-4.0.txt", "1349a4b6148492b44f629e64eed676612e234fe9a839e4f3b277c1482c8849f1"],
  ["public/fonts/OFL.txt", "ef56015fe734e4c7d2b8b32d8556cb55e8940d86520ebb7fbaae775d55aa0802"],
]);

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

function json(relative) {
  return JSON.parse(read(relative));
}

function requirePolicy(condition, message) {
  if (!condition) throw new Error(`licensing policy check failed: ${message}`);
}

const license = read("LICENSE");
const normalizedLicense = license.replace(/\s+/g, " ");
const actualLicenseHash = createHash("sha256").update(license).digest("hex");
requirePolicy(actualLicenseHash === canonicalLicenseHash, "root LICENSE is not the canonical 1.1 text");
requirePolicy(license.startsWith(`# ${licenseName}\n`), "root LICENSE title drifted");
requirePolicy(license.includes(`SPDX-License-Identifier: ${licenseId}`), "root LICENSE identifier is missing");
requirePolicy(normalizedLicense.includes("applies prospectively"), "prospective boundary is missing");
requirePolicy(normalizedLicense.includes("machine-learning model training, fine-tuning"), "machine-learning restriction wording drifted");
requirePolicy(normalizedLicense.includes(copySpecificNotice), "copy-specific historical boundary is missing from LICENSE");

const licensing = read("LICENSING.md").replace(/\s+/g, " ");
requirePolicy(licensing.includes(licenseId), "LICENSING.md current identifier drifted");
requirePolicy(licensing.includes(copySpecificNotice), "copy-specific historical boundary is missing from LICENSING.md");

const map = json("LICENSE-MAP.json");
requirePolicy(map.format === "howardhayden-license-map-v3", "license-map format drifted");
requirePolicy(map.default_license === licenseId, "license-map default drifted");
requirePolicy(map.audited === "2026-08-24", "prepared scope-audit date drifted");
requirePolicy(map.commercial_use_granted === false, "commercial implementation-reuse boundary drifted");
requirePolicy(map.implementation_reuse_granted === false, "implementation reuse boundary drifted");
requirePolicy(map.noncommercial_reuse_granted === false, "noncommercial reuse boundary drifted");
requirePolicy(map.institutional_reuse_exception === false, "institutional exception drifted");
requirePolicy(map.official_product_use_only === true, "Official Product operating boundary drifted");
requirePolicy(map.priced_product_requires_entitlement === true, "priced-product boundary drifted");
requirePolicy(map.no_automatic_permissive_exceptions === true, "permissive-exception boundary drifted");
requirePolicy(Array.isArray(map.permissive_exceptions) && map.permissive_exceptions.length === 0, "unexpected permissive exception");
requirePolicy(map.historical_notice.includes(copySpecificNotice), "license-map copy-specific historical notice drifted");
const mappedLicenses = new Set(map.rules.map((rule) => rule.license));
requirePolicy(mappedLicenses.has("SOURCE-COMPONENT-TERMS"), "generated-component boundary is missing");
requirePolicy(mappedLicenses.has("SOURCE-SPECIFIC-NOTICES"), "source-specific notice boundary is missing");
requirePolicy(mappedLicenses.has(licenseId), "current proprietary scope is missing from license map");
requirePolicy(!JSON.stringify(map).includes("LicenseRef-Hayden-Proprietary-1.0"), "license map retains the superseded active identifier");

const pkg = json("package.json");
const lock = json("package-lock.json");
requirePolicy(pkg.private === true, "package must remain private");
requirePolicy(pkg.license === licenseId, "package license identifier drifted");
requirePolicy(lock.license === licenseId, "lockfile top-level license identifier drifted");
requirePolicy(lock.packages?.[""]?.license === licenseId, "lockfile root-package license identifier drifted");

const citation = read("CITATION.cff");
requirePolicy(citation.includes(`license: ${licenseId}`), "citation license metadata drifted");
requirePolicy(citation.includes("cite this software project and the exact commit"), "citation does not require commit-specific identification");
requirePolicy(!citation.includes("date-released:"), "citation falsely identifies the prospective baseline as a historical release");
requirePolicy(!/^version:/m.test(citation), "citation falsely identifies the prospective baseline as a historical version");

const readme = read("README.md");
requirePolicy(readme.includes(licenseId), "README does not name the current license");
requirePolicy(readme.replace(/\s+/g, " ").includes(copySpecificNotice), "README copy-specific historical boundary drifted");
requirePolicy(readme.includes("## Owner-authorized development"), "development commands lack an authorization boundary");
requirePolicy(!readme.includes("source-available for noncommercial use"), "README restores the former grant");
requirePolicy(!readme.includes("PolyForm-Noncommercial-1.0.0"), "README advertises the former software license");
requirePolicy(!readme.includes("CC-BY-NC-SA-4.0"), "README advertises the former documentation license");

const contributing = read("CONTRIBUTING.md");
requirePolicy(contributing.includes("This proprietary repository"), "contribution policy is stale");

const baseline = read("COMMERCIAL_BASELINE.md");
requirePolicy(baseline.includes(baselineParent), "commercial baseline parent drifted");
requirePolicy(baseline.includes(permissiveCutoff), "historical permissive cutoff drifted");
requirePolicy(baseline.includes(baselineCommit), "historical 1.0 baseline commit drifted");
requirePolicy(baseline.includes("LicenseRef-Hayden-Proprietary-1.0"), "historical 1.0 baseline fact is missing");
requirePolicy(baseline.includes(licenseId), "1.1 successor note is missing from baseline record");
requirePolicy(baseline.replace(/\s+/g, " ").includes(copySpecificNotice), "baseline successor copy-specific boundary drifted");

for (const relative of [
  "COMMERCIAL-LICENSE.md",
  "NOTICE",
  "PERMISSIVE-EXCEPTIONS.md",
  "WORKFLOW-BOUNDARIES.md",
]) {
  requirePolicy(
    read(relative).replace(/\s+/g, " ").includes(copySpecificNotice),
    `${relative} copy-specific historical boundary drifted`,
  );
}

const thirdParty = read("THIRD_PARTY_NOTICES.md");
requirePolicy(thirdParty.includes("SIL Open Font License 1.1"), "Jost notice is missing");

for (const [relative, expected] of historicalHashes) {
  const actual = createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
  requirePolicy(actual === expected, `historical or third-party notice changed: ${relative}`);
}

console.log("licensing policy check passed (prospective policy; historical and third-party terms preserved)");
