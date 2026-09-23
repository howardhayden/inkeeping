#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const licenseId = "LicenseRef-Hayden-Proprietary-1.0";
const packageLicense = "SEE LICENSE IN LICENSE";
const baselineParent = "f45b1fb1b64011c44a3c85cd1307745517d0a7d6";
const permissiveCutoff = "1019e26582c9f676b1184ef6ced42adea65b732b";
const historicalHashes = new Map([
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
requirePolicy(license.startsWith("# Hayden Howard Proprietary Product and Source License 1.0\n"), "root LICENSE title drifted");
requirePolicy(license.includes(`SPDX-License-Identifier: ${licenseId}`), "root LICENSE identifier is missing");
requirePolicy(normalizedLicense.includes("applies prospectively") && normalizedLicense.includes("does not revoke or narrow valid earlier grants"), "prospective/historical boundary is missing");
requirePolicy(normalizedLicense.includes("machine-learning model training, fine-tuning"), "machine-learning restriction wording drifted");
requirePolicy(normalizedLicense.includes("an earlier grant automatically attaches to it"), "copy-specific historical-grant boundary is missing from LICENSE");

const licensing = read("LICENSING.md").replace(/\s+/g, " ");
requirePolicy(licensing.includes("an earlier grant automatically attaches to a later snapshot"), "copy-specific historical-grant boundary is missing from LICENSING.md");

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
requirePolicy(map.historical_notice.includes("an earlier grant automatically attaches to a later snapshot"), "license-map copy-specific historical notice drifted");
requirePolicy(!map.historical_notice.includes("including unchanged material in later snapshots"), "license-map improperly carries an earlier grant into later snapshots");
const mappedLicenses = new Set(map.rules.map((rule) => rule.license));
requirePolicy(mappedLicenses.has("SOURCE-COMPONENT-TERMS"), "generated-component boundary is missing");
requirePolicy(mappedLicenses.has("SOURCE-SPECIFIC-NOTICES"), "source-specific notice boundary is missing");

const pkg = json("package.json");
const lock = json("package-lock.json");
requirePolicy(pkg.private === true, "package must remain private");
requirePolicy(pkg.license === packageLicense, "package license pointer drifted");
requirePolicy(lock.license === packageLicense, "lockfile top-level license pointer drifted");
requirePolicy(lock.packages?.[""]?.license === packageLicense, "lockfile root-package license pointer drifted");

const citation = read("CITATION.cff");
requirePolicy(citation.includes(`license: ${licenseId}`), "citation license metadata drifted");
requirePolicy(citation.includes("cite this software project and the exact commit"), "citation does not require commit-specific identification");
requirePolicy(!citation.includes("date-released:"), "citation falsely identifies the prospective baseline as a historical release");
requirePolicy(!/^version:/m.test(citation), "citation falsely identifies the prospective baseline as a historical version");

const readme = read("README.md");
requirePolicy(readme.includes(licenseId), "README does not name the current license");
requirePolicy(readme.includes("## Owner-authorized development"), "development commands lack an authorization boundary");
requirePolicy(!readme.includes("source-available for noncommercial use"), "README restores the former grant");
requirePolicy(!readme.includes("PolyForm-Noncommercial-1.0.0"), "README advertises the former software license");
requirePolicy(!readme.includes("CC-BY-NC-SA-4.0"), "README advertises the former documentation license");

const contributing = read("CONTRIBUTING.md");
requirePolicy(contributing.includes("This proprietary repository"), "contribution policy is stale");

const baseline = read("COMMERCIAL_BASELINE.md");
requirePolicy(baseline.includes(baselineParent), "commercial baseline parent drifted");
requirePolicy(baseline.includes(permissiveCutoff), "historical permissive cutoff drifted");

const thirdParty = read("THIRD_PARTY_NOTICES.md");
requirePolicy(thirdParty.includes("SIL Open Font License 1.1"), "Jost notice is missing");

for (const [relative, expected] of historicalHashes) {
  const actual = createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
  requirePolicy(actual === expected, `historical or third-party notice changed: ${relative}`);
}

console.log("licensing policy check passed (prospective policy; historical and third-party terms preserved)");
