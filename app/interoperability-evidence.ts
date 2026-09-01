import { canonicalDigest } from "./evidence-authority.ts";
import { assertSafeJsonText } from "./json-safety.ts";

export const INTEROP_PROFILE_SCHEMA = "in-keeping/interoperability-receiver-profile";
export const COMPATIBILITY_PACKAGE_SCHEMA = "in-keeping/interoperability-compatibility-package";
export const INTEROP_DIFF_SCHEMA = "in-keeping/interoperability-semantic-diff";
export const INTEROP_RUN_SCHEMA = "in-keeping/interoperability-run";
export const INTEROP_LOSS_REPORT_SCHEMA = "in-keeping/interoperability-loss-report";
export const INTEROP_WARNING_MANIFEST_SCHEMA = "in-keeping/interoperability-warning-manifest";
export const INTEROP_VERSION = 1;
export const MAX_COMPATIBILITY_PACKAGE_BYTES = 8 * 1024 * 1024;
export const MAX_INTEROPERABILITY_RECORD_BYTES = 8 * 1024 * 1024;
export const INTEROP_FIXTURE_MANIFEST = {
  schema: "in-keeping/interoperability-fixture-manifest",
  version: 1,
  exchanges: [{
    domain: "catalog",
    format: "csv",
    profile: "in-keeping-versioned-csv-v1",
    exporterProfile: "catalog-csv-v1",
    mediaType: "text/csv",
    cases: [
      { caseId: "IK-INT-FX-01", paths: ["/records/0/title"], requiresReexport: true },
      { caseId: "IK-INT-FX-02", paths: ["/records/0/id"], requiresReexport: true },
    ],
  }],
} as const;

export type InteroperabilityCaseId = typeof INTEROP_FIXTURE_MANIFEST.exchanges[number]["cases"][number]["caseId"];

type Pair = { name: string; version: string };
type Setting = { key: string; value: string };

export type InteroperabilityReceiverProfile = {
  schema: typeof INTEROP_PROFILE_SCHEMA;
  version: typeof INTEROP_VERSION;
  profileId: string;
  receiver: { product: string; version: string; build: string };
  environment: { os: string; locale: string };
  extensions: Pair[];
  settings: Setting[];
  exchange: { domain: "catalog" | "archive" | "service"; format: string; profile: string; mediaType: string };
  fixtureManifestSha256: string;
  requiredCases: InteroperabilityCaseId[];
  recordSha256: string;
};

export type CompatibilityPackageEntry = {
  role: "payload" | "loss-report" | "warning-manifest";
  filename: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  text: string;
};

export type CompatibilityPackage = {
  schema: typeof COMPATIBILITY_PACKAGE_SCHEMA;
  version: typeof INTEROP_VERSION;
  packageId: string;
  producer: { commitSha: string; buildSha256: string; fixtureManifestSha256: string; exporterProfile: string };
  entries: CompatibilityPackageEntry[];
  recordSha256: string;
};

export type SemanticObservation = {
  caseId: InteroperabilityCaseId;
  path: string;
  expected: JsonObservationValue;
  displayed: JsonObservationValue;
  underlying: JsonObservationValue;
  reexported: JsonObservationValue;
  transformation: "unchanged" | "normalized" | "escaped" | "unescaped" | "coerced" | "truncated" | "omitted" | "duplicated" | "merged" | "split" | "reordered" | "executed" | "network-requested" | "unknown";
  finding: "none" | "declared-loss" | "unexpected-loss" | "hazard";
  note: string;
};

type JsonObservationValue = string | number | boolean | null | (string | number | boolean | null)[];

export type InteroperabilitySemanticDiff = {
  schema: typeof INTEROP_DIFF_SCHEMA;
  version: typeof INTEROP_VERSION;
  profileSha256: string;
  packageSha256: string;
  receivedArtifact: { sha256: string; bytes: number };
  reexportedArtifact: { sha256: string; bytes: number } | null;
  observations: SemanticObservation[];
  recordSha256: string;
};

export type InteroperabilityRun = {
  schema: typeof INTEROP_RUN_SCHEMA;
  version: typeof INTEROP_VERSION;
  runId: string;
  profileSha256: string;
  packageSha256: string;
  diffSha256: string;
  fixtureManifestSha256: string;
  producer: { commitSha: string; buildSha256: string };
  recordedAt: string;
  operator: { role: string; evidenceRecord: string };
  results: { caseId: InteroperabilityCaseId; status: "pass" | "fail" | "blocked" | "not-run"; detail: string; evidenceRefs: string[] }[];
  recordSha256: string;
};

export type InteroperabilityAssessment = "INVALID_RECORD" | "VERSION_OBSOLETE" | "FAILED" | "BLOCKED" | "INCOMPLETE" | "RECORDED_PASS";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CASE_ID = /^IK-INT-FX-(?:0[1-9]|1[0-4])$/;
const ROLES = ["payload", "loss-report", "warning-manifest"] as const;
const TRANSFORMATIONS = new Set(["unchanged", "normalized", "escaped", "unescaped", "coerced", "truncated", "omitted", "duplicated", "merged", "split", "reordered", "executed", "network-requested", "unknown"]);
const FINDINGS = new Set(["none", "declared-loss", "unexpected-loss", "hazard"]);
const RUN_STATUSES = new Set(["pass", "fail", "blocked", "not-run"]);
const LOSS_TRANSFORMATIONS = new Set(["coerced", "truncated", "omitted", "duplicated", "merged", "split"]);
const HAZARD_TRANSFORMATIONS = new Set(["executed", "network-requested"]);

type CompatibilityLossReport = {
  schema: typeof INTEROP_LOSS_REPORT_SCHEMA;
  version: typeof INTEROP_VERSION;
  payloadSha256: string;
  completeness: "complete";
  losses: { caseId: InteroperabilityCaseId; path: string; finding: "declared-loss" | "unexpected-loss"; detail: string }[];
};

type CompatibilityWarningManifest = {
  schema: typeof INTEROP_WARNING_MANIFEST_SCHEMA;
  version: typeof INTEROP_VERSION;
  payloadSha256: string;
  completeness: "complete";
  warnings: { caseId: InteroperabilityCaseId; path: string; finding: "hazard"; detail: string }[];
};

export function interoperabilityFixtureManifestDigest(): Promise<string> {
  return canonicalDigest(INTEROP_FIXTURE_MANIFEST);
}

export async function sealInteroperabilityReceiverProfile(value: Omit<InteroperabilityReceiverProfile, "schema" | "version" | "recordSha256">): Promise<InteroperabilityReceiverProfile> {
  const unsigned = readProfile({ schema: INTEROP_PROFILE_SCHEMA, version: INTEROP_VERSION, ...value, recordSha256: "0".repeat(64) });
  if (unsigned.fixtureManifestSha256 !== await interoperabilityFixtureManifestDigest()) throw new Error("Receiver profile fixture manifest is not the source-controlled current manifest.");
  const content = recordContent(unsigned);
  const result = { ...content, recordSha256: await canonicalDigest(content) };
  assertRecordBytes(result, "Receiver profile");
  return result;
}

export async function validateInteroperabilityReceiverProfile(value: unknown): Promise<InteroperabilityReceiverProfile> {
  const profile = await verifyRecord(readProfile(value), "Receiver profile");
  if (profile.fixtureManifestSha256 !== await interoperabilityFixtureManifestDigest()) throw new Error("Receiver profile fixture manifest is not the source-controlled current manifest.");
  assertRecordBytes(profile, "Receiver profile");
  return profile;
}

export async function validateInteroperabilityReceiverProfileText(text: string): Promise<InteroperabilityReceiverProfile> {
  return validateInteroperabilityReceiverProfile(parseRecordText(text, "Receiver profile"));
}

export async function makeCompatibilityPackage(input: { packageId: string; producer: CompatibilityPackage["producer"]; entries: { role: CompatibilityPackageEntry["role"]; filename: string; mediaType: string; text: string }[] }): Promise<CompatibilityPackage> {
  const entries = await Promise.all(input.entries.map(async (entry) => {
    const text = boundedText(entry.text, MAX_COMPATIBILITY_PACKAGE_BYTES, "Compatibility entry text", true);
    const bytes = new TextEncoder().encode(text);
    return { role: entry.role, filename: safeFilename(entry.filename), mediaType: mediaType(entry.mediaType), bytes: bytes.byteLength, sha256: await sha256Bytes(bytes), text };
  }));
  const unsigned = readPackage({ schema: COMPATIBILITY_PACKAGE_SCHEMA, version: INTEROP_VERSION, packageId: input.packageId, producer: input.producer, entries, recordSha256: "0".repeat(64) });
  if (unsigned.producer.fixtureManifestSha256 !== await interoperabilityFixtureManifestDigest()) throw new Error("Compatibility package fixture manifest is not the source-controlled current manifest.");
  const content = recordContent(unsigned);
  const result = { ...content, recordSha256: await canonicalDigest(packageDigestContent(unsigned)) };
  readCompatibilityReports(result);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_COMPATIBILITY_PACKAGE_BYTES) throw new Error("Compatibility package exceeds 8 MiB.");
  return result;
}

export async function validateCompatibilityPackageText(text: string): Promise<CompatibilityPackage> {
  if (new TextEncoder().encode(text).byteLength > MAX_COMPATIBILITY_PACKAGE_BYTES) throw new Error("Compatibility package exceeds 8 MiB.");
  let parsed: unknown;
  try {
    parsed = assertSafeJsonText(text);
  } catch (error) {
    throw new Error(`Compatibility package JSON is invalid: ${error instanceof Error ? error.message : "parse failure"}`, { cause: error });
  }
  return validateCompatibilityPackage(parsed);
}

export async function validateCompatibilityPackage(value: unknown): Promise<CompatibilityPackage> {
  const pack = readPackage(value);
  if (pack.producer.fixtureManifestSha256 !== await interoperabilityFixtureManifestDigest()) throw new Error("Compatibility package fixture manifest is not the source-controlled current manifest.");
  for (const entry of pack.entries) {
    const bytes = new TextEncoder().encode(entry.text);
    if (bytes.byteLength !== entry.bytes || await sha256Bytes(bytes) !== entry.sha256) throw new Error(`Compatibility package ${entry.role} bytes or digest do not match.`);
  }
  if (pack.recordSha256 !== await canonicalDigest(packageDigestContent(pack))) throw new Error("Compatibility package digest does not match its content.");
  readCompatibilityReports(pack);
  assertRecordBytes(pack, "Compatibility package", MAX_COMPATIBILITY_PACKAGE_BYTES);
  return pack;
}

export async function sealInteroperabilitySemanticDiff(value: Omit<InteroperabilitySemanticDiff, "schema" | "version" | "recordSha256">): Promise<InteroperabilitySemanticDiff> {
  const unsigned = readDiff({ schema: INTEROP_DIFF_SCHEMA, version: INTEROP_VERSION, ...value, recordSha256: "0".repeat(64) });
  const content = recordContent(unsigned);
  const result = { ...content, recordSha256: await canonicalDigest(content) };
  assertRecordBytes(result, "Interoperability semantic diff");
  return result;
}

export async function validateInteroperabilitySemanticDiff(value: unknown): Promise<InteroperabilitySemanticDiff> {
  const diff = await verifyRecord(readDiff(value), "Interoperability semantic diff");
  assertRecordBytes(diff, "Interoperability semantic diff");
  return diff;
}

export async function validateInteroperabilitySemanticDiffText(text: string): Promise<InteroperabilitySemanticDiff> {
  return validateInteroperabilitySemanticDiff(parseRecordText(text, "Interoperability semantic diff"));
}

export async function sealInteroperabilityRun(value: Omit<InteroperabilityRun, "schema" | "version" | "recordSha256">): Promise<InteroperabilityRun> {
  const unsigned = readRun({ schema: INTEROP_RUN_SCHEMA, version: INTEROP_VERSION, ...value, recordSha256: "0".repeat(64) });
  if (unsigned.fixtureManifestSha256 !== await interoperabilityFixtureManifestDigest()) throw new Error("Interoperability run fixture manifest is not the source-controlled current manifest.");
  const content = recordContent(unsigned);
  const result = { ...content, recordSha256: await canonicalDigest(content) };
  assertRecordBytes(result, "Interoperability run");
  return result;
}

export async function validateInteroperabilityRun(value: unknown): Promise<InteroperabilityRun> {
  const run = await verifyRecord(readRun(value), "Interoperability run");
  if (run.fixtureManifestSha256 !== await interoperabilityFixtureManifestDigest()) throw new Error("Interoperability run fixture manifest is not the source-controlled current manifest.");
  assertRecordBytes(run, "Interoperability run");
  return run;
}

export async function validateInteroperabilityRunText(text: string): Promise<InteroperabilityRun> {
  return validateInteroperabilityRun(parseRecordText(text, "Interoperability run"));
}

export async function assessInteroperabilityEvidenceBundle(
  value: { profile: unknown; package: unknown; diff: unknown; run: unknown },
  current: { profileSha256: string; fixtureManifestSha256: string; producerCommitSha: string; producerBuildSha256: string },
): Promise<InteroperabilityAssessment> {
  let profile: InteroperabilityReceiverProfile;
  let pack: CompatibilityPackage;
  let diff: InteroperabilitySemanticDiff;
  let run: InteroperabilityRun;
  let lossReport: CompatibilityLossReport;
  let warningManifest: CompatibilityWarningManifest;
  let currentProfileSha256: string;
  let currentFixtureManifestSha256: string;
  let currentProducerCommitSha: string;
  let currentProducerBuildSha256: string;
  try {
    profile = await validateInteroperabilityReceiverProfile(value.profile);
    pack = await validateCompatibilityPackage(value.package);
    diff = await validateInteroperabilitySemanticDiff(value.diff);
    run = await validateInteroperabilityRun(value.run);
    ({ lossReport, warningManifest } = readCompatibilityReports(pack));
    currentProfileSha256 = digest(current.profileSha256, "Current profile digest");
    currentFixtureManifestSha256 = digest(current.fixtureManifestSha256, "Current fixture-manifest digest");
    currentProducerCommitSha = commit(current.producerCommitSha);
    currentProducerBuildSha256 = digest(current.producerBuildSha256, "Current producer build digest");
  } catch { return "INVALID_RECORD"; }
  const payload = pack.entries.find((entry) => entry.role === "payload");
  const exchangeDefinition = fixtureExchange(profile.exchange);
  const sourceControlledFixtureManifestSha256 = await interoperabilityFixtureManifestDigest();
  if (!payload
      || payload.mediaType !== profile.exchange.mediaType
      || pack.producer.exporterProfile !== exchangeDefinition.exporterProfile
      || pack.producer.fixtureManifestSha256 !== profile.fixtureManifestSha256
      || diff.profileSha256 !== profile.recordSha256
      || diff.packageSha256 !== pack.recordSha256
      || diff.receivedArtifact.sha256 !== payload.sha256
      || diff.receivedArtifact.bytes !== payload.bytes
      || run.profileSha256 !== profile.recordSha256
      || run.packageSha256 !== pack.recordSha256
      || run.diffSha256 !== diff.recordSha256
      || pack.producer.commitSha !== run.producer.commitSha
      || pack.producer.buildSha256 !== run.producer.buildSha256
      || pack.producer.fixtureManifestSha256 !== run.fixtureManifestSha256
      || !reportsMatchDiff(lossReport, warningManifest, diff)) return "INVALID_RECORD";
  if (profile.recordSha256 !== currentProfileSha256
      || run.fixtureManifestSha256 !== sourceControlledFixtureManifestSha256
      || currentFixtureManifestSha256 !== sourceControlledFixtureManifestSha256
      || run.producer.commitSha !== currentProducerCommitSha
      || run.producer.buildSha256 !== currentProducerBuildSha256) return "VERSION_OBSOLETE";
  const required = profile.requiredCases;
  const expectedObservations = new Set(exchangeDefinition.cases.flatMap((item) => item.paths.map((path) => `${item.caseId}\u0000${path}`)));
  const suppliedObservations = new Set(diff.observations.map((item) => `${item.caseId}\u0000${item.path}`));
  if ([...suppliedObservations].some((item) => !expectedObservations.has(item))) return "INVALID_RECORD";
  const byCase = new Map(run.results.map((item) => [item.caseId, item]));
  if (required.some((caseId) => byCase.get(caseId)?.status === "fail") || diff.observations.some((item) => item.finding === "unexpected-loss" || item.finding === "hazard")) return "FAILED";
  if (required.some((caseId) => byCase.get(caseId)?.status === "blocked")) return "BLOCKED";
  if (required.some((caseId) => !byCase.has(caseId) || byCase.get(caseId)?.status === "not-run")) return "INCOMPLETE";
  if ([...expectedObservations].some((item) => !suppliedObservations.has(item)) || diff.observations.some((item) => item.finding === "declared-loss")) return "INCOMPLETE";
  if (exchangeDefinition.cases.some((item) => item.requiresReexport) && diff.reexportedArtifact === null) return "INCOMPLETE";
  return "RECORDED_PASS";
}

function readProfile(value: unknown): InteroperabilityReceiverProfile {
  const root = exact(value, ["schema", "version", "profileId", "receiver", "environment", "extensions", "settings", "exchange", "fixtureManifestSha256", "requiredCases", "recordSha256"], "Receiver profile");
  if (root.schema !== INTEROP_PROFILE_SCHEMA || root.version !== INTEROP_VERSION) throw new Error("Receiver profile schema or version is unsupported.");
  const receiver = exact(root.receiver, ["product", "version", "build"], "Receiver identity");
  const environment = exact(root.environment, ["os", "locale"], "Receiver environment");
  const exchange = exact(root.exchange, ["domain", "format", "profile", "mediaType"], "Receiver exchange profile");
  if (exchange.domain !== "catalog" && exchange.domain !== "archive" && exchange.domain !== "service") throw new Error("Receiver exchange domain is unsupported.");
  const normalizedExchange: InteroperabilityReceiverProfile["exchange"] = { domain: exchange.domain, format: text(rootText(exchange.format), 80, "Exchange format"), profile: text(rootText(exchange.profile), 160, "Exchange profile"), mediaType: mediaType(exchange.mediaType) };
  const definition = fixtureExchange(normalizedExchange);
  return {
    schema: INTEROP_PROFILE_SCHEMA, version: INTEROP_VERSION, profileId: identifier(root.profileId, "Profile ID"),
    receiver: { product: text(rootText(receiver.product), 160, "Receiver product"), version: text(rootText(receiver.version), 80, "Receiver version"), build: text(rootText(receiver.build), 120, "Receiver build") },
    environment: { os: text(rootText(environment.os), 160, "Receiver OS"), locale: text(rootText(environment.locale), 80, "Receiver locale") },
    extensions: pairs(root.extensions, "extension"), settings: settings(root.settings),
    exchange: normalizedExchange,
    fixtureManifestSha256: digest(root.fixtureManifestSha256, "Receiver fixture-manifest digest"),
    requiredCases: uniqueCases(root.requiredCases, definition.cases.map((item) => item.caseId)), recordSha256: digest(root.recordSha256, "Receiver profile digest"),
  };
}

function readPackage(value: unknown): CompatibilityPackage {
  const root = exact(value, ["schema", "version", "packageId", "producer", "entries", "recordSha256"], "Compatibility package");
  if (root.schema !== COMPATIBILITY_PACKAGE_SCHEMA || root.version !== INTEROP_VERSION) throw new Error("Compatibility package schema or version is unsupported.");
  const producer = exact(root.producer, ["commitSha", "buildSha256", "fixtureManifestSha256", "exporterProfile"], "Compatibility producer");
  if (!Array.isArray(root.entries) || root.entries.length !== 3) throw new Error("Compatibility package must contain exactly payload, loss-report, and warning-manifest entries.");
  const entries = root.entries.map((item) => {
    const entry = exact(item, ["role", "filename", "mediaType", "bytes", "sha256", "text"], "Compatibility entry");
    if (!ROLES.includes(entry.role as CompatibilityPackageEntry["role"])) throw new Error("Compatibility entry role is unsupported.");
    return { role: entry.role as CompatibilityPackageEntry["role"], filename: safeFilename(entry.filename), mediaType: mediaType(entry.mediaType), bytes: integer(entry.bytes, 0, MAX_COMPATIBILITY_PACKAGE_BYTES, "Compatibility entry bytes"), sha256: digest(entry.sha256, "Compatibility entry digest"), text: boundedText(entry.text, MAX_COMPATIBILITY_PACKAGE_BYTES, "Compatibility entry text", true) };
  });
  if (new Set(entries.map((item) => item.role)).size !== 3 || ROLES.some((role) => !entries.some((item) => item.role === role))) throw new Error("Compatibility package entry roles must be complete and unique.");
  if (new Set(entries.map((item) => item.filename)).size !== entries.length) throw new Error("Compatibility package filenames must be unique.");
  if ((entries.find((item) => item.role === "payload")?.bytes ?? 0) < 1) throw new Error("Compatibility package payload must be nonempty.");
  return { schema: COMPATIBILITY_PACKAGE_SCHEMA, version: INTEROP_VERSION, packageId: identifier(root.packageId, "Package ID"), producer: { commitSha: commit(producer.commitSha), buildSha256: digest(producer.buildSha256, "Compatibility producer build digest"), fixtureManifestSha256: digest(producer.fixtureManifestSha256, "Compatibility fixture-manifest digest"), exporterProfile: text(rootText(producer.exporterProfile), 160, "Exporter profile") }, entries, recordSha256: digest(root.recordSha256, "Compatibility package digest") };
}

function readDiff(value: unknown): InteroperabilitySemanticDiff {
  const root = exact(value, ["schema", "version", "profileSha256", "packageSha256", "receivedArtifact", "reexportedArtifact", "observations", "recordSha256"], "Interoperability semantic diff");
  if (root.schema !== INTEROP_DIFF_SCHEMA || root.version !== INTEROP_VERSION) throw new Error("Interoperability semantic-diff schema or version is unsupported.");
  if (!Array.isArray(root.observations) || root.observations.length > 5_000) throw new Error("Semantic diff exceeds 5,000 observations.");
  const observations = root.observations.map((item) => {
    const observation = exact(item, ["caseId", "path", "expected", "displayed", "underlying", "reexported", "transformation", "finding", "note"], "Semantic observation");
    if (!TRANSFORMATIONS.has(observation.transformation as string) || !FINDINGS.has(observation.finding as string)) throw new Error("Semantic observation classification is unsupported.");
    const result = { caseId: caseId(observation.caseId), path: text(rootText(observation.path), 512, "Observation path"), expected: observationValue(observation.expected), displayed: observationValue(observation.displayed), underlying: observationValue(observation.underlying), reexported: observationValue(observation.reexported), transformation: observation.transformation as SemanticObservation["transformation"], finding: observation.finding as SemanticObservation["finding"], note: text(rootText(observation.note), 2_000, "Observation note") };
    const loss = result.finding === "declared-loss" || result.finding === "unexpected-loss";
    if (result.transformation === "unchanged" && (!sameObservationValue(result.expected, result.displayed) || !sameObservationValue(result.expected, result.underlying) || !sameObservationValue(result.expected, result.reexported))) throw new Error("An unchanged semantic observation must preserve the exact expected value across display, storage, and re-export.");
    if (HAZARD_TRANSFORMATIONS.has(result.transformation) !== (result.finding === "hazard")) throw new Error("Executed or network-requested transformations must be classified as hazards, and hazards must name that transformation.");
    if ((LOSS_TRANSFORMATIONS.has(result.transformation) || result.transformation === "unknown") !== loss) throw new Error("Loss-like or unknown transformations require a declared/unexpected loss finding, and loss findings require that transformation class.");
    return result;
  });
  if (new Set(observations.map((item) => `${item.caseId}\u0000${item.path}`)).size !== observations.length) throw new Error("Semantic observation case/path identities must be unique.");
  return { schema: INTEROP_DIFF_SCHEMA, version: INTEROP_VERSION, profileSha256: digest(root.profileSha256, "Profile digest"), packageSha256: digest(root.packageSha256, "Package digest"), receivedArtifact: artifact(root.receivedArtifact), reexportedArtifact: root.reexportedArtifact === null ? null : artifact(root.reexportedArtifact), observations, recordSha256: digest(root.recordSha256, "Semantic diff digest") };
}

function readRun(value: unknown): InteroperabilityRun {
  const root = exact(value, ["schema", "version", "runId", "profileSha256", "packageSha256", "diffSha256", "fixtureManifestSha256", "producer", "recordedAt", "operator", "results", "recordSha256"], "Interoperability run");
  if (root.schema !== INTEROP_RUN_SCHEMA || root.version !== INTEROP_VERSION) throw new Error("Interoperability run schema or version is unsupported.");
  const producer = exact(root.producer, ["commitSha", "buildSha256"], "Run producer");
  const operator = exact(root.operator, ["role", "evidenceRecord"], "Run operator");
  if (!Array.isArray(root.results) || root.results.length > 1_000) throw new Error("Interoperability run exceeds 1,000 results.");
  const results = root.results.map((item) => {
    const result = exact(item, ["caseId", "status", "detail", "evidenceRefs"], "Run result");
    if (!RUN_STATUSES.has(result.status as string) || !Array.isArray(result.evidenceRefs) || result.evidenceRefs.length > 100) throw new Error("Run result status or evidence references are unsupported.");
    const status = result.status as InteroperabilityRun["results"][number]["status"];
    const evidenceRefs = result.evidenceRefs.map((entry) => text(rootText(entry), 256, "Run evidence reference"));
    if (new Set(evidenceRefs).size !== evidenceRefs.length) throw new Error("Run evidence references must be unique.");
    if (status === "pass" && evidenceRefs.length < 1) throw new Error("A passing run result requires at least one retained evidence reference.");
    return { caseId: caseId(result.caseId), status, detail: text(rootText(result.detail), 2_000, "Run result detail"), evidenceRefs };
  });
  if (new Set(results.map((item) => item.caseId)).size !== results.length) throw new Error("Interoperability run case IDs must be unique.");
  return { schema: INTEROP_RUN_SCHEMA, version: INTEROP_VERSION, runId: identifier(root.runId, "Run ID"), profileSha256: digest(root.profileSha256, "Profile digest"), packageSha256: digest(root.packageSha256, "Package digest"), diffSha256: digest(root.diffSha256, "Diff digest"), fixtureManifestSha256: digest(root.fixtureManifestSha256, "Fixture-manifest digest"), producer: { commitSha: commit(producer.commitSha), buildSha256: digest(producer.buildSha256, "Build digest") }, recordedAt: instant(root.recordedAt), operator: { role: text(rootText(operator.role), 160, "Operator role"), evidenceRecord: text(rootText(operator.evidenceRecord), 256, "Operator evidence record") }, results, recordSha256: digest(root.recordSha256, "Run digest") };
}

async function verifyRecord<T extends { recordSha256: string }>(record: T, label: string): Promise<T> { const { recordSha256, ...content } = record; if (recordSha256 !== await canonicalDigest(content)) throw new Error(`${label} digest does not match its content.`); return record; }
function recordContent<T extends { recordSha256: string }>(record: T): Omit<T, "recordSha256"> { const content = { ...record } as Partial<T>; delete content.recordSha256; return content as Omit<T, "recordSha256">; }
function packageDigestContent(pack: CompatibilityPackage) {
  return {
    schema: pack.schema,
    version: pack.version,
    packageId: pack.packageId,
    producer: pack.producer,
    entries: pack.entries.map((entry) => ({ role: entry.role, filename: entry.filename, mediaType: entry.mediaType, bytes: entry.bytes, sha256: entry.sha256 })),
  };
}
function readCompatibilityReports(pack: CompatibilityPackage): { lossReport: CompatibilityLossReport; warningManifest: CompatibilityWarningManifest } {
  const payloadEntry = pack.entries.find((entry) => entry.role === "payload");
  const lossEntry = pack.entries.find((entry) => entry.role === "loss-report");
  const warningEntry = pack.entries.find((entry) => entry.role === "warning-manifest");
  if (!payloadEntry || !lossEntry || !warningEntry || !/^application\/json(?:;charset=utf-8)?$/.test(lossEntry.mediaType) || !/^application\/json(?:;charset=utf-8)?$/.test(warningEntry.mediaType)) throw new Error("Compatibility loss and warning entries must be JSON documents.");
  const lossRoot = exact(assertSafeJsonText(lossEntry.text), ["schema", "version", "payloadSha256", "completeness", "losses"], "Compatibility loss report");
  if (lossRoot.schema !== INTEROP_LOSS_REPORT_SCHEMA || lossRoot.version !== INTEROP_VERSION || lossRoot.payloadSha256 !== payloadEntry.sha256 || lossRoot.completeness !== "complete" || !Array.isArray(lossRoot.losses) || lossRoot.losses.length > 1_000) throw new Error("Compatibility loss-report schema, payload binding, completeness, version, or count is unsupported.");
  const losses = lossRoot.losses.map((value) => {
    const item = exact(value, ["caseId", "path", "finding", "detail"], "Compatibility loss");
    if (item.finding !== "declared-loss" && item.finding !== "unexpected-loss") throw new Error("Compatibility loss classification is unsupported.");
    return { caseId: caseId(item.caseId), path: text(rootText(item.path), 512, "Compatibility loss path"), finding: item.finding, detail: text(rootText(item.detail), 2_000, "Compatibility loss detail") } satisfies CompatibilityLossReport["losses"][number];
  });
  const warningRoot = exact(assertSafeJsonText(warningEntry.text), ["schema", "version", "payloadSha256", "completeness", "warnings"], "Compatibility warning manifest");
  if (warningRoot.schema !== INTEROP_WARNING_MANIFEST_SCHEMA || warningRoot.version !== INTEROP_VERSION || warningRoot.payloadSha256 !== payloadEntry.sha256 || warningRoot.completeness !== "complete" || !Array.isArray(warningRoot.warnings) || warningRoot.warnings.length > 1_000) throw new Error("Compatibility warning-manifest schema, payload binding, completeness, version, or count is unsupported.");
  const warnings = warningRoot.warnings.map((value) => {
    const item = exact(value, ["caseId", "path", "finding", "detail"], "Compatibility warning");
    if (item.finding !== "hazard") throw new Error("Compatibility warning classification is unsupported.");
    return { caseId: caseId(item.caseId), path: text(rootText(item.path), 512, "Compatibility warning path"), finding: "hazard" as const, detail: text(rootText(item.detail), 2_000, "Compatibility warning detail") };
  });
  const identity = (item: { caseId: InteroperabilityCaseId; path: string }) => `${item.caseId}\u0000${item.path}`;
  if (new Set(losses.map(identity)).size !== losses.length || new Set(warnings.map(identity)).size !== warnings.length) throw new Error("Compatibility loss and warning case/path identities must be unique.");
  return {
    lossReport: { schema: INTEROP_LOSS_REPORT_SCHEMA, version: INTEROP_VERSION, payloadSha256: payloadEntry.sha256, completeness: "complete", losses },
    warningManifest: { schema: INTEROP_WARNING_MANIFEST_SCHEMA, version: INTEROP_VERSION, payloadSha256: payloadEntry.sha256, completeness: "complete", warnings },
  };
}
function reportsMatchDiff(lossReport: CompatibilityLossReport, warningManifest: CompatibilityWarningManifest, diff: InteroperabilitySemanticDiff): boolean {
  const reportIdentity = (item: { caseId: InteroperabilityCaseId; path: string; finding: string; detail: string }) => `${item.caseId}\u0000${item.path}\u0000${item.finding}\u0000${item.detail}`;
  const observationIdentity = (item: SemanticObservation) => `${item.caseId}\u0000${item.path}\u0000${item.finding}\u0000${item.note}`;
  const recordedLosses = new Set(lossReport.losses.map(reportIdentity));
  const observedLosses = new Set(diff.observations.filter((item) => item.finding === "declared-loss" || item.finding === "unexpected-loss").map(observationIdentity));
  const recordedWarnings = new Set(warningManifest.warnings.map(reportIdentity));
  const observedWarnings = new Set(diff.observations.filter((item) => item.finding === "hazard").map(observationIdentity));
  return sameSet(recordedLosses, observedLosses) && sameSet(recordedWarnings, observedWarnings);
}
function sameSet(left: Set<string>, right: Set<string>): boolean { return left.size === right.size && [...left].every((item) => right.has(item)); }
function sameObservationValue(left: JsonObservationValue, right: JsonObservationValue): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function exact<const K extends readonly string[]>(value: unknown, keys: K, label: string): Record<K[number], unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`); const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`); return value as Record<K[number], unknown>; }
function rootText(value: unknown): string { if (typeof value !== "string") throw new Error("Expected text value."); return value; }
function text(value: string, maximum: number, label: string, allowEmpty = false): string { if ((!allowEmpty && !value) || (!allowEmpty && value.trim() !== value) || value.length > maximum || value !== value.normalize("NFC") || hasUnpairedSurrogate(value) || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is not bounded canonical text.`); return value; }
function boundedText(value: unknown, maximumBytes: number, label: string, allowEmpty = false): string { const result = rootText(value); if ((!allowEmpty && !result) || result !== result.normalize("NFC") || hasUnpairedSurrogate(result) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result) || new TextEncoder().encode(result).byteLength > maximumBytes) throw new Error(`${label} is not bounded canonical text.`); return result; }
function identifier(value: unknown, label: string): string { if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} is invalid.`); return value; }
function digest(value: unknown, label: string): string { if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} is invalid.`); return value; }
function commit(value: unknown): string { if (typeof value !== "string" || !COMMIT.test(value)) throw new Error("Commit SHA is invalid."); return value; }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`); return value; }
function safeFilename(value: unknown): string { const result = text(rootText(value), 180, "Compatibility filename"); if (/[/\\]/.test(result) || result === "." || result === "..") throw new Error("Compatibility filename is unsafe."); return result; }
function mediaType(value: unknown): string { const result = text(rootText(value), 120, "Media type"); if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;charset=utf-8)?$/.test(result)) throw new Error("Media type is invalid."); return result; }
function pairs(value: unknown, label: string): Pair[] { if (!Array.isArray(value) || value.length > 100) throw new Error(`Receiver ${label}s exceed 100 entries.`); const result = value.map((item) => { const pair = exact(item, ["name", "version"], `Receiver ${label}`); return { name: text(rootText(pair.name), 160, `${label} name`), version: text(rootText(pair.version), 80, `${label} version`) }; }); if (new Set(result.map((item) => item.name)).size !== result.length) throw new Error(`Receiver ${label} names must be unique.`); return result; }
function settings(value: unknown): Setting[] { if (!Array.isArray(value) || value.length > 200) throw new Error("Receiver settings exceed 200 entries."); const result = value.map((item) => { const setting = exact(item, ["key", "value"], "Receiver setting"); return { key: text(rootText(setting.key), 160, "Setting key"), value: text(rootText(setting.value), 500, "Setting value", true) }; }); if (new Set(result.map((item) => item.key)).size !== result.length) throw new Error("Receiver setting keys must be unique."); return result; }
function caseId(value: unknown): InteroperabilityCaseId { const supported = new Set<string>(INTEROP_FIXTURE_MANIFEST.exchanges.flatMap((exchange) => exchange.cases.map((item) => item.caseId))); if (typeof value !== "string" || !CASE_ID.test(value) || !supported.has(value)) throw new Error("Interoperability fixture case ID is invalid or not defined by the source-controlled manifest."); return value as InteroperabilityCaseId; }
function uniqueCases(value: unknown, expected: readonly InteroperabilityCaseId[]): InteroperabilityCaseId[] { if (!Array.isArray(value)) throw new Error("Required fixture cases must be derived from the source-controlled manifest."); const result = value.map(caseId); if (result.length !== expected.length || result.some((item, index) => item !== expected[index])) throw new Error("Required fixture cases must exactly equal the ordered cases derived from the source-controlled manifest; caller-selected subsets are not accepted."); return result; }
function fixtureExchange(value: { domain: "catalog" | "archive" | "service"; format: string; profile: string; mediaType: string }) { const match = INTEROP_FIXTURE_MANIFEST.exchanges.find((item) => item.domain === value.domain && item.format === value.format && item.profile === value.profile && item.mediaType === value.mediaType); if (!match) throw new Error("Receiver exchange is not defined by the source-controlled interoperability fixture manifest."); return match; }
function artifact(value: unknown): { sha256: string; bytes: number } { const item = exact(value, ["sha256", "bytes"], "Receiver artifact"); return { sha256: digest(item.sha256, "Artifact digest"), bytes: integer(item.bytes, 0, MAX_COMPATIBILITY_PACKAGE_BYTES, "Artifact bytes") }; }
function observationValue(value: unknown): JsonObservationValue { const valid = (item: unknown) => item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item) || typeof item === "string" && item.length <= 8_192 && !hasUnpairedSurrogate(item) && item === item.normalize("NFC"); if (valid(value)) return value as JsonObservationValue; if (Array.isArray(value) && value.length <= 100 && value.every(valid)) return value as JsonObservationValue; throw new Error("Semantic observation values must be bounded canonical JSON scalars or scalar arrays."); }
function instant(value: unknown): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("Run time must be a canonical browser-claimed UTC instant."); return value; }
async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> { const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength)); copy.set(bytes); const hashed = await crypto.subtle.digest("SHA-256", copy); return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function hasUnpairedSurrogate(value: string): boolean { for (let index = 0; index < value.length; index += 1) { const unit = value.charCodeAt(index); if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(index + 1); if (!(next >= 0xdc00 && next <= 0xdfff)) return true; index += 1; } else if (unit >= 0xdc00 && unit <= 0xdfff) return true; } return false; }
function parseRecordText(value: string, label: string): unknown { if (typeof value !== "string" || !value || new TextEncoder().encode(value).byteLength > MAX_INTEROPERABILITY_RECORD_BYTES) throw new Error(`${label} must be nonempty JSON no larger than 8 MiB.`); try { return assertSafeJsonText(value); } catch (error) { throw new Error(`${label} JSON is invalid: ${error instanceof Error ? error.message : "parse failure"}`, { cause: error }); } }
function assertRecordBytes(value: unknown, label: string, maximum = MAX_INTEROPERABILITY_RECORD_BYTES): void { let serialized: string; try { serialized = JSON.stringify(value); } catch (error) { throw new Error(`${label} cannot be serialized as bounded JSON.`, { cause: error }); } if (new TextEncoder().encode(serialized).byteLength > maximum) throw new Error(`${label} exceeds ${(maximum / (1024 * 1024)).toLocaleString("en-US")} MiB.`); }
