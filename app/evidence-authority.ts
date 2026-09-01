export const EVIDENCE_AUTHORITY_SCHEMA = "in-keeping/evidence-authority-decision";
export const EVIDENCE_AUTHORITY_VERSION = 1;
export const EVIDENCE_APPLICATION_SCHEMA = "in-keeping/evidence-application-outcome";
export const EVIDENCE_APPLICATION_VERSION = 1;
export const EVIDENCE_TIME_BASIS = "browser-clock-untrusted";
export const MAX_EVIDENCE_SOURCE_BYTES = 32 * 1024 * 1024;

export type EvidenceSourceKind =
  | "catalog-import"
  | "archive-import"
  | "workspace-backup"
  | "workspace-history"
  | "other";

export type EvidenceScopeKind =
  | "catalog-records"
  | "archive-records"
  | "service-records"
  | "workspace"
  | "other";

export type ClaimedOrigin = "unknown" | "direct-export" | "transferred-copy" | "other";
export type EvidenceDecision = "admit-unverified" | "reject" | "withdraw";
export type EvidenceAuthorityStatus =
  | "unattributed"
  | "operator-admitted-unverified"
  | "rejected"
  | "withdrawn";

export type EvidenceWarningInput = {
  severity: "error" | "warning" | "notice";
  code: string;
  entityId: string | null;
  label: string;
  detail: string;
  occurrenceKey: string;
};

export type EvidenceWarningRecord = EvidenceWarningInput & {
  warningId: string;
  recordSha256: string;
};

export type EvidenceWarningManifest = {
  schema: "in-keeping/evidence-warning-manifest";
  version: 1;
  sourceSha256: string;
  parserProfile: string;
  rulesetSha256: string;
  completeness: "complete";
  warnings: EvidenceWarningRecord[];
  recordSha256: string;
};

export type EvidenceDescriptor = {
  source: {
    kind: EvidenceSourceKind;
    filename: string;
    format: string;
    bytes: number;
    sha256: string;
  };
  review: {
    structuralStatus: "passed";
    canonicalPayloadSha256: string;
    parserProfile: string;
    warningManifest?: EvidenceWarningManifest;
  };
  scope: {
    kind: EvidenceScopeKind;
    entityIds: string[];
  };
};

/**
 * An operator claim about structurally reviewed evidence. These fields never
 * constitute system verification of origin, custody, authorship, or truth.
 */
export type EvidenceDisposition = {
  decision: EvidenceDecision;
  claimedOrigin: ClaimedOrigin;
  custodyNote: string;
  actorRoleClaim: string;
  rationale: string;
  policyReference: string;
  atBrowser: string;
  timeBasis: typeof EVIDENCE_TIME_BASIS;
};

export type EvidenceAuthorityRecord = {
  schema: typeof EVIDENCE_AUTHORITY_SCHEMA;
  version: typeof EVIDENCE_AUTHORITY_VERSION;
  evidence: EvidenceDescriptor;
  evidenceSha256: string;
  disposition: EvidenceDisposition;
  recordSha256: string;
};

export type EvidenceApplicationOutcome = "applied" | "not-applied";
export type EvidenceApplicationReason =
  | "catalog-import-applied"
  | "archive-import-applied"
  | "workspace-backup-opened"
  | "operator-rejected"
  | "operator-withdrew"
  | "workspace-record-limit"
  | "destination-identity-conflict"
  | "other";

export type EvidenceApplicationInput = {
  outcome: EvidenceApplicationOutcome;
  reason: EvidenceApplicationReason;
  detail: string;
  resultingRevisionId: string | null;
  resultingRevisionDigest: string | null;
};

/**
 * A separate application outcome keeps the operator's evidence decision even
 * when destination validation refuses to apply it. It is deliberately linked
 * to, but not folded into, the decision record so a failed application cannot
 * silently erase or rewrite the submitted disposition.
 */
export type EvidenceApplicationRecord = {
  schema: typeof EVIDENCE_APPLICATION_SCHEMA;
  version: typeof EVIDENCE_APPLICATION_VERSION;
  decisionRecordSha256: string;
  evidenceSha256: string;
  outcome: EvidenceApplicationOutcome;
  reason: EvidenceApplicationReason;
  detail: string;
  resultingRevisionId: string | null;
  resultingRevisionDigest: string | null;
  atBrowser: string;
  timeBasis: typeof EVIDENCE_TIME_BASIS;
  recordSha256: string;
};

const SOURCE_KINDS = new Set<EvidenceSourceKind>([
  "catalog-import",
  "archive-import",
  "workspace-backup",
  "workspace-history",
  "other",
]);
const SCOPE_KINDS = new Set<EvidenceScopeKind>([
  "catalog-records",
  "archive-records",
  "service-records",
  "workspace",
  "other",
]);
const CLAIMED_ORIGINS = new Set<ClaimedOrigin>(["unknown", "direct-export", "transferred-copy", "other"]);
const DECISIONS = new Set<EvidenceDecision>(["admit-unverified", "reject", "withdraw"]);
const APPLICATION_OUTCOMES = new Set<EvidenceApplicationOutcome>(["applied", "not-applied"]);
const APPLICATION_REASONS = new Set<EvidenceApplicationReason>([
  "catalog-import-applied",
  "archive-import-applied",
  "workspace-backup-opened",
  "operator-rejected",
  "operator-withdrew",
  "workspace-record-limit",
  "destination-identity-conflict",
  "other",
]);
const APPLIED_REASONS = new Set<EvidenceApplicationReason>([
  "catalog-import-applied",
  "archive-import-applied",
  "workspace-backup-opened",
]);
const NOT_APPLIED_REASONS = new Set<EvidenceApplicationReason>([
  "operator-rejected",
  "operator-withdrew",
  "workspace-record-limit",
  "destination-identity-conflict",
  "other",
]);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DISALLOWED_TEXT = /[\u0000-\u001f\u007f]/;
const MAX_SCOPE_ENTITIES = 5_000;
export const MAX_EVIDENCE_WARNINGS = 1_000;
const WARNING_SEVERITIES = new Set(["error", "warning", "notice"]);
const EVIDENCE_WARNING_SCHEMA = "in-keeping/evidence-warning-manifest";
const EVIDENCE_WARNING_VERSION = 1;

export async function createEvidenceWarningManifest(
  sourceSha256Value: unknown,
  parserProfileValue: unknown,
  warningValues: readonly unknown[],
): Promise<EvidenceWarningManifest> {
  const sourceSha256 = exactSha256(sourceSha256Value, "Warning source SHA-256");
  const parserProfile = exactText(parserProfileValue, 160, "Warning parser profile");
  if (!Array.isArray(warningValues) || warningValues.length > MAX_EVIDENCE_WARNINGS) throw new Error(`Evidence warnings exceed ${MAX_EVIDENCE_WARNINGS.toLocaleString("en-US")} entries.`);
  const inputs = warningValues.map(validateEvidenceWarningInput);
  if (new Set(inputs.map((item) => item.occurrenceKey)).size !== inputs.length) throw new Error("Evidence warning occurrence keys must be unique.");
  const warnings = await Promise.all(inputs.map(async (input) => {
    const warningId = `WRN-${await canonicalDigest({ sourceSha256, parserProfile, code: input.code, entityId: input.entityId, occurrenceKey: input.occurrenceKey, detail: input.detail })}`;
    const unsigned = { warningId, ...input };
    return { ...unsigned, recordSha256: await canonicalDigest(unsigned) } satisfies EvidenceWarningRecord;
  }));
  warnings.sort((left, right) => left.warningId.localeCompare(right.warningId));
  const rulesetSha256 = await canonicalDigest({ profile: "in-keeping/evidence-warning-rules-v1", parserProfile });
  const unsigned: Omit<EvidenceWarningManifest, "recordSha256"> = {
    schema: EVIDENCE_WARNING_SCHEMA,
    version: EVIDENCE_WARNING_VERSION,
    sourceSha256,
    parserProfile,
    rulesetSha256,
    completeness: "complete" as const,
    warnings,
  };
  return { ...unsigned, recordSha256: await canonicalDigest(unsigned) };
}

export async function validateEvidenceWarningManifest(value: unknown): Promise<EvidenceWarningManifest> {
  const manifest = readEvidenceWarningManifest(value);
  const ids = manifest.warnings.map((item) => item.warningId);
  if (new Set(ids).size !== ids.length || ids.some((item, index) => index > 0 && ids[index - 1].localeCompare(item) >= 0)) throw new Error("Evidence warning records must be uniquely sorted by stable warning ID.");
  for (const warning of manifest.warnings) {
    const input = validateEvidenceWarningInput(warning);
    const expectedId = `WRN-${await canonicalDigest({ sourceSha256: manifest.sourceSha256, parserProfile: manifest.parserProfile, code: input.code, entityId: input.entityId, occurrenceKey: input.occurrenceKey, detail: input.detail })}`;
    if (warning.warningId !== expectedId) throw new Error("Evidence warning ID does not match its stable condition identity.");
    const { recordSha256, ...unsigned } = warning;
    if (recordSha256 !== await canonicalDigest(unsigned)) throw new Error("Evidence warning record digest does not match its content.");
  }
  const expectedRuleset = await canonicalDigest({ profile: "in-keeping/evidence-warning-rules-v1", parserProfile: manifest.parserProfile });
  if (manifest.rulesetSha256 !== expectedRuleset) throw new Error("Evidence warning ruleset digest is unsupported.");
  const { recordSha256, ...unsigned } = manifest;
  if (recordSha256 !== await canonicalDigest(unsigned)) throw new Error("Evidence warning manifest digest does not match its complete warning set.");
  return manifest;
}

function validateEvidenceWarningInput(value: unknown): EvidenceWarningInput {
  const input = record(value, "Evidence warning must be a plain object.");
  const allowed = ["severity", "code", "entityId", "label", "detail", "occurrenceKey"];
  const withRecord = [...allowed, "warningId", "recordSha256"];
  if (Object.hasOwn(input, "warningId") || Object.hasOwn(input, "recordSha256")) exactKeys(input, withRecord, "evidence warning record");
  else exactKeys(input, allowed, "evidence warning");
  if (typeof input.severity !== "string" || !WARNING_SEVERITIES.has(input.severity)) throw new Error("Evidence warning severity is unsupported.");
  return {
    severity: input.severity as EvidenceWarningInput["severity"],
    code: exactText(input.code, 120, "Evidence warning code"),
    entityId: input.entityId === null ? null : exactText(input.entityId, 256, "Evidence warning entity ID"),
    label: exactText(input.label, 300, "Evidence warning label"),
    detail: exactText(input.detail, 2_000, "Evidence warning detail"),
    occurrenceKey: exactText(input.occurrenceKey, 256, "Evidence warning occurrence key"),
  };
}

function readEvidenceWarningManifest(value: unknown): EvidenceWarningManifest {
  const root = record(value, "Evidence warning manifest must be a plain object.");
  exactKeys(root, ["schema", "version", "sourceSha256", "parserProfile", "rulesetSha256", "completeness", "warnings", "recordSha256"], "evidence warning manifest");
  if (root.schema !== EVIDENCE_WARNING_SCHEMA || root.version !== EVIDENCE_WARNING_VERSION || root.completeness !== "complete") throw new Error("Evidence warning manifest schema, version, or completeness is unsupported.");
  if (!Array.isArray(root.warnings) || root.warnings.length > MAX_EVIDENCE_WARNINGS) throw new Error(`Evidence warning manifest exceeds ${MAX_EVIDENCE_WARNINGS.toLocaleString("en-US")} entries.`);
  const warnings = root.warnings.map((item) => {
    const raw = record(item, "Evidence warning record must be a plain object.");
    const input = validateEvidenceWarningInput(raw);
    return { warningId: exactSafeId(raw.warningId, "Evidence warning ID"), ...input, recordSha256: exactSha256(raw.recordSha256, "Evidence warning record SHA-256") } satisfies EvidenceWarningRecord;
  });
  return {
    schema: EVIDENCE_WARNING_SCHEMA,
    version: EVIDENCE_WARNING_VERSION,
    sourceSha256: exactSha256(root.sourceSha256, "Warning source SHA-256"),
    parserProfile: exactText(root.parserProfile, 160, "Warning parser profile"),
    rulesetSha256: exactSha256(root.rulesetSha256, "Warning ruleset SHA-256"),
    completeness: "complete",
    warnings,
    recordSha256: exactSha256(root.recordSha256, "Warning manifest SHA-256"),
  };
}

/**
 * Construct a content-bound decision. There are deliberately no default
 * claims: every disposition and every browser-clock field must be supplied.
 */
export async function createEvidenceAuthorityRecord(
  evidenceInput: unknown,
  dispositionInput: unknown,
): Promise<EvidenceAuthorityRecord> {
  const evidence = validateEvidenceDescriptor(evidenceInput);
  if (evidence.review.warningManifest) await validateEvidenceWarningManifest(evidence.review.warningManifest);
  const disposition = validateEvidenceDisposition(dispositionInput);
  const evidenceSha256 = await canonicalDigest(evidence);
  const unsigned = {
    schema: EVIDENCE_AUTHORITY_SCHEMA,
    version: EVIDENCE_AUTHORITY_VERSION,
    evidence,
    evidenceSha256,
    disposition,
  } as const;
  return { ...unsigned, recordSha256: await canonicalDigest(unsigned) };
}

export function validateEvidenceDescriptor(value: unknown): EvidenceDescriptor {
  const root = record(value, "Evidence descriptor must be a plain object.");
  exactKeys(root, ["source", "review", "scope"], "evidence descriptor");

  const source = record(root.source, "Evidence source must be a plain object.");
  exactKeys(source, ["kind", "filename", "format", "bytes", "sha256"], "evidence source");
  if (typeof source.kind !== "string" || !SOURCE_KINDS.has(source.kind as EvidenceSourceKind)) {
    throw new Error("Evidence source kind is unsupported.");
  }
  const filename = exactText(source.filename, 180, "Evidence filename");
  const format = exactText(source.format, 80, "Evidence format");
  if (!Number.isSafeInteger(source.bytes) || (source.bytes as number) < 1 || (source.bytes as number) > MAX_EVIDENCE_SOURCE_BYTES) {
    throw new Error("Evidence source bytes must be an integer from 1 through 32 MiB.");
  }
  const sourceSha256 = exactSha256(source.sha256, "Evidence source SHA-256");

  const review = record(root.review, "Evidence review must be a plain object.");
  const hasWarningManifest = Object.hasOwn(review, "warningManifest");
  exactKeys(review, hasWarningManifest ? ["structuralStatus", "canonicalPayloadSha256", "parserProfile", "warningManifest"] : ["structuralStatus", "canonicalPayloadSha256", "parserProfile"], "evidence review");
  if (review.structuralStatus !== "passed") {
    throw new Error("Evidence structural status must be exactly passed before a disposition can be recorded.");
  }
  const canonicalPayloadSha256 = exactSha256(review.canonicalPayloadSha256, "Canonical payload SHA-256");
  const parserProfile = exactText(review.parserProfile, 160, "Parser profile");
  const warningManifest = hasWarningManifest ? readEvidenceWarningManifest(review.warningManifest) : undefined;
  if (warningManifest && (warningManifest.sourceSha256 !== sourceSha256 || warningManifest.parserProfile !== parserProfile)) throw new Error("Evidence warning manifest does not bind the exact source and parser profile.");

  const scope = record(root.scope, "Evidence scope must be a plain object.");
  exactKeys(scope, ["kind", "entityIds"], "evidence scope");
  if (typeof scope.kind !== "string" || !SCOPE_KINDS.has(scope.kind as EvidenceScopeKind)) {
    throw new Error("Evidence scope kind is unsupported.");
  }
  if (!Array.isArray(scope.entityIds) || scope.entityIds.length < 1 || scope.entityIds.length > MAX_SCOPE_ENTITIES) {
    throw new Error(`Evidence scope must contain 1–${MAX_SCOPE_ENTITIES.toLocaleString("en-US")} entity IDs.`);
  }
  const entityIds = scope.entityIds.map((item) => exactText(item, 256, "Evidence scope entity ID"));
  if (new Set(entityIds).size !== entityIds.length) throw new Error("Evidence scope entity IDs must be unique.");

  return {
    source: {
      kind: source.kind as EvidenceSourceKind,
      filename,
      format,
      bytes: source.bytes as number,
      sha256: sourceSha256,
    },
    review: { structuralStatus: "passed", canonicalPayloadSha256, parserProfile, ...(warningManifest ? { warningManifest } : {}) },
    scope: { kind: scope.kind as EvidenceScopeKind, entityIds },
  };
}

export function validateEvidenceDisposition(value: unknown): EvidenceDisposition {
  const disposition = record(value, "Evidence disposition must be a plain object; no decision defaults are permitted.");
  exactKeys(
    disposition,
    ["decision", "claimedOrigin", "custodyNote", "actorRoleClaim", "rationale", "policyReference", "atBrowser", "timeBasis"],
    "evidence disposition",
  );
  if (typeof disposition.decision !== "string" || !DECISIONS.has(disposition.decision as EvidenceDecision)) {
    throw new Error("Evidence decision must be admit-unverified, reject, or withdraw.");
  }
  if (typeof disposition.claimedOrigin !== "string" || !CLAIMED_ORIGINS.has(disposition.claimedOrigin as ClaimedOrigin)) {
    throw new Error("Claimed origin must be unknown, direct-export, transferred-copy, or other.");
  }
  const custodyNote = exactText(disposition.custodyNote, 2_000, "Custody note");
  const actorRoleClaim = exactText(disposition.actorRoleClaim, 200, "Actor role claim");
  const rationale = exactText(disposition.rationale, 2_000, "Disposition rationale");
  const policyReference = exactText(disposition.policyReference, 500, "Policy reference");
  const atBrowser = exactBrowserInstant(disposition.atBrowser);
  if (disposition.timeBasis !== EVIDENCE_TIME_BASIS) {
    throw new Error(`Evidence time basis must be exactly ${EVIDENCE_TIME_BASIS}.`);
  }
  return {
    decision: disposition.decision as EvidenceDecision,
    claimedOrigin: disposition.claimedOrigin as ClaimedOrigin,
    custodyNote,
    actorRoleClaim,
    rationale,
    policyReference,
    atBrowser,
    timeBasis: EVIDENCE_TIME_BASIS,
  };
}

export async function validateEvidenceAuthorityRecord(value: unknown): Promise<EvidenceAuthorityRecord> {
  const root = record(value, "Evidence authority record must be a plain object.");
  exactKeys(root, ["schema", "version", "evidence", "evidenceSha256", "disposition", "recordSha256"], "evidence authority record");
  if (root.schema !== EVIDENCE_AUTHORITY_SCHEMA || root.version !== EVIDENCE_AUTHORITY_VERSION) {
    throw new Error("Evidence authority schema or version is unsupported.");
  }
  const evidence = validateEvidenceDescriptor(root.evidence);
  if (evidence.review.warningManifest) await validateEvidenceWarningManifest(evidence.review.warningManifest);
  const disposition = validateEvidenceDisposition(root.disposition);
  const evidenceSha256 = exactSha256(root.evidenceSha256, "Evidence binding SHA-256");
  const recordSha256 = exactSha256(root.recordSha256, "Evidence decision record SHA-256");
  const actualEvidenceSha256 = await canonicalDigest(evidence);
  if (evidenceSha256 !== actualEvidenceSha256) {
    throw new Error("Evidence binding digest does not match the reviewed source, canonical payload, parser profile, and scope.");
  }
  const unsigned = {
    schema: EVIDENCE_AUTHORITY_SCHEMA,
    version: EVIDENCE_AUTHORITY_VERSION,
    evidence,
    evidenceSha256,
    disposition,
  } as const;
  if (recordSha256 !== await canonicalDigest(unsigned)) {
    throw new Error("Evidence decision record digest does not match its bound disposition.");
  }
  return { ...unsigned, recordSha256 };
}

export async function createEvidenceApplicationRecord(
  decisionValue: unknown,
  inputValue: unknown,
): Promise<EvidenceApplicationRecord> {
  const decision = await validateEvidenceAuthorityRecord(decisionValue);
  const input = validateEvidenceApplicationInput(inputValue);
  assertApplicationSemantics(decision, input);
  const unsigned = {
    schema: EVIDENCE_APPLICATION_SCHEMA,
    version: EVIDENCE_APPLICATION_VERSION,
    decisionRecordSha256: decision.recordSha256,
    evidenceSha256: decision.evidenceSha256,
    outcome: input.outcome,
    reason: input.reason,
    detail: input.detail,
    resultingRevisionId: input.resultingRevisionId,
    resultingRevisionDigest: input.resultingRevisionDigest,
    atBrowser: decision.disposition.atBrowser,
    timeBasis: EVIDENCE_TIME_BASIS,
  } as const;
  return { ...unsigned, recordSha256: await canonicalDigest(unsigned) };
}

export function validateEvidenceApplicationInput(value: unknown): EvidenceApplicationInput {
  const input = record(value, "Evidence application input must be a plain object.");
  exactKeys(input, ["outcome", "reason", "detail", "resultingRevisionId", "resultingRevisionDigest"], "evidence application input");
  if (typeof input.outcome !== "string" || !APPLICATION_OUTCOMES.has(input.outcome as EvidenceApplicationOutcome)) {
    throw new Error("Evidence application outcome must be applied or not-applied.");
  }
  if (typeof input.reason !== "string" || !APPLICATION_REASONS.has(input.reason as EvidenceApplicationReason)) {
    throw new Error("Evidence application reason is unsupported.");
  }
  const detail = exactText(input.detail, 1_000, "Evidence application detail");
  const resultingRevisionId = input.resultingRevisionId === null
    ? null
    : exactSafeId(input.resultingRevisionId, "Resulting revision ID");
  const resultingRevisionDigest = input.resultingRevisionDigest === null
    ? null
    : exactSha256(input.resultingRevisionDigest, "Resulting revision digest");
  if (input.outcome === "applied" && (resultingRevisionId === null || resultingRevisionDigest === null)) {
    throw new Error("Applied evidence must identify and bind the resulting active revision.");
  }
  if (input.outcome === "not-applied" && (resultingRevisionId !== null || resultingRevisionDigest !== null)) {
    throw new Error("Evidence that was not applied cannot identify or bind a resulting revision.");
  }
  if (input.outcome === "applied" && !APPLIED_REASONS.has(input.reason as EvidenceApplicationReason)) {
    throw new Error("Applied evidence must use an applied import or backup reason.");
  }
  if (input.outcome === "not-applied" && !NOT_APPLIED_REASONS.has(input.reason as EvidenceApplicationReason)) {
    throw new Error("Evidence that was not applied must use a non-application reason.");
  }
  return {
    outcome: input.outcome as EvidenceApplicationOutcome,
    reason: input.reason as EvidenceApplicationReason,
    detail,
    resultingRevisionId,
    resultingRevisionDigest,
  };
}

export async function validateEvidenceApplicationRecord(value: unknown): Promise<EvidenceApplicationRecord> {
  const root = record(value, "Evidence application record must be a plain object.");
  exactKeys(root, ["schema", "version", "decisionRecordSha256", "evidenceSha256", "outcome", "reason", "detail", "resultingRevisionId", "resultingRevisionDigest", "atBrowser", "timeBasis", "recordSha256"], "evidence application record");
  if (root.schema !== EVIDENCE_APPLICATION_SCHEMA || root.version !== EVIDENCE_APPLICATION_VERSION) {
    throw new Error("Evidence application schema or version is unsupported.");
  }
  const input = validateEvidenceApplicationInput({
    outcome: root.outcome,
    reason: root.reason,
    detail: root.detail,
    resultingRevisionId: root.resultingRevisionId,
    resultingRevisionDigest: root.resultingRevisionDigest,
  });
  const recordValue: Omit<EvidenceApplicationRecord, "recordSha256"> = {
    schema: EVIDENCE_APPLICATION_SCHEMA,
    version: EVIDENCE_APPLICATION_VERSION,
    decisionRecordSha256: exactSha256(root.decisionRecordSha256, "Evidence decision record SHA-256"),
    evidenceSha256: exactSha256(root.evidenceSha256, "Evidence binding SHA-256"),
    outcome: input.outcome,
    reason: input.reason,
    detail: input.detail,
    resultingRevisionId: input.resultingRevisionId,
    resultingRevisionDigest: input.resultingRevisionDigest,
    atBrowser: exactBrowserInstant(root.atBrowser),
    timeBasis: root.timeBasis === EVIDENCE_TIME_BASIS
      ? EVIDENCE_TIME_BASIS
      : (() => { throw new Error(`Evidence application time basis must be exactly ${EVIDENCE_TIME_BASIS}.`); })(),
  };
  const recordSha256 = exactSha256(root.recordSha256, "Evidence application record SHA-256");
  if (recordSha256 !== await canonicalDigest(recordValue)) {
    throw new Error("Evidence application record digest does not match its bound outcome.");
  }
  return { ...recordValue, recordSha256 };
}

/** Validate the exact decision/outcome link and source-specific reason. */
export function validateEvidenceApplicationLink(
  decision: EvidenceAuthorityRecord,
  application: EvidenceApplicationRecord,
): void {
  if (application.decisionRecordSha256 !== decision.recordSha256 || application.evidenceSha256 !== decision.evidenceSha256) {
    throw new Error("Evidence application outcome is not linked to its exact decision and evidence binding.");
  }
  if (application.atBrowser !== decision.disposition.atBrowser || application.timeBasis !== decision.disposition.timeBasis) {
    throw new Error("Evidence application time does not match its linked decision.");
  }
  assertApplicationSemantics(decision, application);
}

function assertApplicationSemantics(
  decision: EvidenceAuthorityRecord,
  application: Pick<EvidenceApplicationInput, "outcome" | "reason">,
): void {
  const disposition = decision.disposition.decision;
  if (disposition === "reject") {
    if (application.outcome !== "not-applied" || application.reason !== "operator-rejected") {
      throw new Error("A rejected evidence decision must retain an operator-rejected non-application outcome.");
    }
    return;
  }
  if (disposition === "withdraw") {
    if (application.outcome !== "not-applied" || application.reason !== "operator-withdrew") {
      throw new Error("A withdrawn evidence decision must retain an operator-withdrew non-application outcome.");
    }
    return;
  }

  const sourceKind = decision.evidence.source.kind;
  const allowed = sourceKind === "catalog-import"
    ? application.outcome === "applied"
      ? new Set<EvidenceApplicationReason>(["catalog-import-applied"])
      : new Set<EvidenceApplicationReason>(["workspace-record-limit", "destination-identity-conflict", "other"])
    : sourceKind === "archive-import"
      ? application.outcome === "applied"
        ? new Set<EvidenceApplicationReason>(["archive-import-applied"])
        : new Set<EvidenceApplicationReason>(["destination-identity-conflict", "other"])
      : sourceKind === "workspace-backup"
        ? application.outcome === "applied"
          ? new Set<EvidenceApplicationReason>(["workspace-backup-opened"])
          : new Set<EvidenceApplicationReason>(["other"])
        : application.outcome === "not-applied"
          ? new Set<EvidenceApplicationReason>(["other"])
          : new Set<EvidenceApplicationReason>();
  if (!allowed.has(application.reason)) {
    throw new Error(`Evidence application reason ${application.reason} contradicts ${sourceKind} with outcome ${application.outcome}.`);
  }
}

/**
 * Derive only a conservative local status. Untrusted browser time cannot order
 * conflicting claims, so rejection overrides admission and any withdrawal is
 * terminal for the supplied decision set.
 */
export async function deriveEvidenceAuthorityStatus(values: readonly unknown[]): Promise<EvidenceAuthorityStatus> {
  if (values.length === 0) return "unattributed";
  const decisions = await Promise.all(values.map((value) => validateEvidenceAuthorityRecord(value)));
  const evidenceSha256 = decisions[0].evidenceSha256;
  if (decisions.some((item) => item.evidenceSha256 !== evidenceSha256)) {
    throw new Error("Evidence decisions for different evidence bindings cannot be combined.");
  }
  if (decisions.some((item) => item.disposition.decision === "withdraw")) return "withdrawn";
  if (decisions.some((item) => item.disposition.decision === "reject")) return "rejected";
  return decisions.some((item) => item.disposition.decision === "admit-unverified")
    ? "operator-admitted-unverified"
    : "unattributed";
}

/** Return a deterministic SHA-256 over a strictly bounded JSON value. */
export async function canonicalDigest(value: unknown): Promise<string> {
  inspectCanonicalValue(value, 0);
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  const unknown = Object.keys(value).find((key) => !expected.has(key));
  if (unknown) throw new Error(`Unknown ${label} field: ${unknown}.`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`Missing ${label} field: ${missing}.`);
}

function exactText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new Error(`${label} must contain 1–${max.toLocaleString("en-US")} characters.`);
  }
  if (value !== value.normalize("NFC") || value !== value.trim() || DISALLOWED_TEXT.test(value)) {
    throw new Error(`${label} must be canonical NFC text without surrounding whitespace or control characters.`);
  }
  return value;
}

function exactSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be 64 lowercase hexadecimal characters.`);
  return value;
}

function exactSafeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} must be a safe identifier of at most 128 characters.`);
  return value;
}

function exactBrowserInstant(value: unknown): string {
  if (typeof value !== "string") throw new Error("atBrowser must be an ISO 8601 UTC instant with milliseconds.");
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})Z$/);
  if (!match || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error("atBrowser must be an ISO 8601 UTC instant with milliseconds.");
  }
  return value;
}

function inspectCanonicalValue(value: unknown, depth: number): void {
  if (depth > 16) throw new Error("Canonical digest input exceeds 16 levels.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical digest input contains a non-finite number.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > 8_192 || value !== value.normalize("NFC") || DISALLOWED_TEXT.test(value)) {
      throw new Error("Canonical digest input contains invalid or oversized text.");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_SCOPE_ENTITIES) throw new Error("Canonical digest input contains an oversized array.");
    value.forEach((item) => inspectCanonicalValue(item, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const object = record(value, "Canonical digest input must contain only plain JSON objects.");
    const keys = Object.keys(object);
    if (keys.length > 256) throw new Error("Canonical digest input contains an oversized object.");
    for (const key of keys) {
      if (key.length > 256 || key !== key.normalize("NFC") || DISALLOWED_TEXT.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error("Canonical digest input contains an invalid object key.");
      }
      inspectCanonicalValue(object[key], depth + 1);
    }
    return;
  }
  throw new Error("Canonical digest input must contain only JSON values.");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
