import { validateContinuityAnchor, type ContinuityAnchor, type ContinuityCheckpoint } from "./continuity-anchor.ts";
import { assertSafeJsonText } from "./json-safety.ts";

export const CONTINUITY_WITNESS_SCHEMA = "in-keeping/continuity-witness";
export const CONTINUITY_WITNESS_VERSION = 1;
export const SIGNED_CONTINUITY_WITNESS_SCHEMA = "in-keeping/signed-continuity-witness";
export const SIGNED_CONTINUITY_WITNESS_VERSION = 1;
export const CONTINUITY_WITNESS_SET_SCHEMA = "in-keeping/signed-continuity-witness-set";
export const CONTINUITY_WITNESS_SET_VERSION = 1;
export const CONTINUITY_TRUST_POLICY_SCHEMA = "in-keeping/continuity-trust-policy";
export const CONTINUITY_TRUST_POLICY_VERSION = 1;
export const CONTINUITY_TIME_BASIS = "browser-clock-untrusted";
export const CONTINUITY_SIGNATURE_SUITE = "ECDSA-P256-SHA256";
export const MAX_CONTINUITY_WITNESSES = 256;
export const MAX_EXTERNAL_CONTINUITY_BYTES = 4 * 1024 * 1024;

export type ContinuityWitness = {
  schema: typeof CONTINUITY_WITNESS_SCHEMA;
  version: typeof CONTINUITY_WITNESS_VERSION;
  workspaceId: string;
  lineageId: string;
  branchId: string;
  originScope: string;
  sequence: number;
  predecessorAnchorDigest: string | null;
  anchorDigest: string;
  generation: number;
  workspaceDigest: string;
  ledgerGenesisHash: string;
  auditHeadDigest: string;
  terminalStateDigest: string;
  auditCount: number;
  predecessorTerminalHash: string | null;
  claimedAtBrowser: string;
  timeBasis: typeof CONTINUITY_TIME_BASIS;
  digest: string;
};

export type SignedContinuityWitness = {
  schema: typeof SIGNED_CONTINUITY_WITNESS_SCHEMA;
  version: typeof SIGNED_CONTINUITY_WITNESS_VERSION;
  witness: ContinuityWitness;
  authorityId: string;
  keyId: string;
  suite: typeof CONTINUITY_SIGNATURE_SUITE;
  signature: string;
};

export type SignedContinuityWitnessSet = {
  schema: typeof CONTINUITY_WITNESS_SET_SCHEMA;
  version: typeof CONTINUITY_WITNESS_SET_VERSION;
  witnesses: SignedContinuityWitness[];
};

export type ContinuityTrustKey = {
  keyId: string;
  status: "active" | "revoked";
  publicJwk: { kty: "EC"; crv: "P-256"; x: string; y: string };
};

export type ContinuityTerminal = {
  workspaceId: string;
  lineageId: string;
  branchId: string;
  originScope: string;
  sequence: number;
  witnessDigest: string;
};

export type ContinuityTrustPolicy = {
  schema: typeof CONTINUITY_TRUST_POLICY_SCHEMA;
  version: typeof CONTINUITY_TRUST_POLICY_VERSION;
  policyId: string;
  authorityId: string;
  revision: number;
  keys: ContinuityTrustKey[];
  terminals: ContinuityTerminal[];
};

export type ContinuityTopologyStatus =
  | "no-evidence"
  | "invalid"
  | "valid-prefix"
  | "gap"
  | "forked"
  | "boundary"
  | "truncated"
  | "terminal-conflict"
  | "indeterminate"
  | "corroborated-at-checkpoint";

export type ContinuityTopologyFinding = {
  code: "INVALID_NODE" | "DUPLICATE" | "GAP" | "FORK" | "ROOT_CONFLICT" | "DISCONNECTED" | "SCOPE_CONFLICT" | "TERMINAL_CONFLICT" | "TRUNCATED" | "LIMIT";
  anchorDigest: string | null;
  detail: string;
};

export type ContinuityTopologyResult = {
  status: ContinuityTopologyStatus;
  sequence: string[];
  branchHeads: string[];
  findings: ContinuityTopologyFinding[];
  terminalWitnessDigest: string | null;
};

export type ExternalContinuityStatus =
  | "trusted-match"
  | "valid-untrusted"
  | "rollback"
  | "fork"
  | "gap"
  | "revoked-key"
  | "unknown-key"
  | "invalid-signature"
  | "invalid-evidence"
  | "policy-pin-missing"
  | "policy-pin-mismatch"
  | "content-mismatch"
  | "indeterminate";

export type ExternalContinuityVerification = {
  status: ExternalContinuityStatus;
  reason: string;
  witnessDigest: string | null;
  policyId: string | null;
  policyRevision: number | null;
  policyDigest: string | null;
  topology: ContinuityTopologyResult | null;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const WITNESS_KEYS = ["schema", "version", "workspaceId", "lineageId", "branchId", "originScope", "sequence", "predecessorAnchorDigest", "anchorDigest", "generation", "workspaceDigest", "ledgerGenesisHash", "auditHeadDigest", "terminalStateDigest", "auditCount", "predecessorTerminalHash", "claimedAtBrowser", "timeBasis", "digest"] as const;
const SIGNED_KEYS = ["schema", "version", "witness", "authorityId", "keyId", "suite", "signature"] as const;

export async function createContinuityWitness(
  anchorValue: ContinuityAnchor,
  originScopeValue: string,
  claimedAtBrowserValue: string,
): Promise<ContinuityWitness> {
  const anchor = await validateContinuityAnchor(anchorValue);
  const unsigned = {
    schema: CONTINUITY_WITNESS_SCHEMA,
    version: CONTINUITY_WITNESS_VERSION,
    workspaceId: id(anchor.workspaceId, "workspace ID"),
    lineageId: id(anchor.lineageId, "lineage ID"),
    branchId: id(anchor.lineageId, "branch ID"),
    originScope: originScope(originScopeValue),
    sequence: positiveInteger(anchor.sequence, "witness sequence"),
    predecessorAnchorDigest: nullableDigest(anchor.previousAnchorDigest, "predecessor anchor digest"),
    anchorDigest: digest(anchor.digest, "anchor digest"),
    generation: positiveInteger(anchor.activeCheckpoint.generation, "saved generation"),
    workspaceDigest: digest(anchor.activeCheckpoint.payloadDigest, "workspace digest"),
    ledgerGenesisHash: digest(anchor.activeCheckpoint.ledgerGenesisHash, "ledger genesis hash"),
    auditHeadDigest: digest(anchor.activeCheckpoint.terminalHash, "audit head digest"),
    terminalStateDigest: digest(anchor.activeCheckpoint.terminalStateDigest, "terminal state digest"),
    auditCount: positiveInteger(anchor.activeCheckpoint.auditCount, "audit count"),
    predecessorTerminalHash: nullableDigest(anchor.activeCheckpoint.predecessorTerminalHash, "predecessor terminal hash"),
    claimedAtBrowser: instant(claimedAtBrowserValue, "claimed browser time"),
    timeBasis: CONTINUITY_TIME_BASIS,
  } as const;
  return { ...unsigned, digest: await sha256Hex(canonicalJson(unsigned)) };
}

export function parseContinuityWitness(text: string): ContinuityWitness {
  return validateContinuityWitness(parseBoundedJson(text, "Continuity witness"));
}

export function validateContinuityWitness(value: unknown): ContinuityWitness {
  const root = exactObject(value, WITNESS_KEYS, "Continuity witness");
  if (root.schema !== CONTINUITY_WITNESS_SCHEMA || root.version !== CONTINUITY_WITNESS_VERSION) throw new Error("Continuity witness schema or version is unsupported.");
  return {
    schema: CONTINUITY_WITNESS_SCHEMA,
    version: CONTINUITY_WITNESS_VERSION,
    workspaceId: id(root.workspaceId, "workspace ID"),
    lineageId: id(root.lineageId, "lineage ID"),
    branchId: id(root.branchId, "branch ID"),
    originScope: originScope(root.originScope),
    sequence: positiveInteger(root.sequence, "witness sequence"),
    predecessorAnchorDigest: nullableDigest(root.predecessorAnchorDigest, "predecessor anchor digest"),
    anchorDigest: digest(root.anchorDigest, "anchor digest"),
    generation: positiveInteger(root.generation, "saved generation"),
    workspaceDigest: digest(root.workspaceDigest, "workspace digest"),
    ledgerGenesisHash: digest(root.ledgerGenesisHash, "ledger genesis hash"),
    auditHeadDigest: digest(root.auditHeadDigest, "audit head digest"),
    terminalStateDigest: digest(root.terminalStateDigest, "terminal state digest"),
    auditCount: positiveInteger(root.auditCount, "audit count"),
    predecessorTerminalHash: nullableDigest(root.predecessorTerminalHash, "predecessor terminal hash"),
    claimedAtBrowser: instant(root.claimedAtBrowser, "claimed browser time"),
    timeBasis: literal(root.timeBasis, CONTINUITY_TIME_BASIS, "witness time basis"),
    digest: digest(root.digest, "witness digest"),
  };
}

export async function verifyContinuityWitnessDigest(value: unknown): Promise<ContinuityWitness> {
  const witness = validateContinuityWitness(value);
  const { digest: supplied, ...unsigned } = witness;
  if (supplied !== await sha256Hex(canonicalJson(unsigned))) throw new Error("Continuity witness digest does not match its canonical content.");
  return witness;
}

export function parseSignedContinuityWitnessSet(text: string): SignedContinuityWitnessSet {
  return validateSignedContinuityWitnessSet(parseBoundedJson(text, "Signed continuity witness set"));
}

export function validateSignedContinuityWitnessSet(value: unknown): SignedContinuityWitnessSet {
  const root = exactObject(value, ["schema", "version", "witnesses"] as const, "Signed continuity witness set");
  if (root.schema !== CONTINUITY_WITNESS_SET_SCHEMA || root.version !== CONTINUITY_WITNESS_SET_VERSION) throw new Error("Signed continuity witness-set schema or version is unsupported.");
  if (!Array.isArray(root.witnesses) || root.witnesses.length < 1 || root.witnesses.length > MAX_CONTINUITY_WITNESSES) throw new Error(`Signed continuity witness set must contain 1–${MAX_CONTINUITY_WITNESSES.toLocaleString("en-US")} witnesses.`);
  return { schema: CONTINUITY_WITNESS_SET_SCHEMA, version: CONTINUITY_WITNESS_SET_VERSION, witnesses: root.witnesses.map(validateSignedContinuityWitness) };
}

export function validateSignedContinuityWitness(value: unknown): SignedContinuityWitness {
  const root = exactObject(value, SIGNED_KEYS, "Signed continuity witness");
  if (root.schema !== SIGNED_CONTINUITY_WITNESS_SCHEMA || root.version !== SIGNED_CONTINUITY_WITNESS_VERSION) throw new Error("Signed continuity witness schema or version is unsupported.");
  if (root.suite !== CONTINUITY_SIGNATURE_SUITE) throw new Error("Signed continuity witness suite is unsupported.");
  const signature = base64url(root.signature, "signed continuity witness signature", 64);
  return {
    schema: SIGNED_CONTINUITY_WITNESS_SCHEMA,
    version: SIGNED_CONTINUITY_WITNESS_VERSION,
    witness: validateContinuityWitness(root.witness),
    authorityId: id(root.authorityId, "authority ID"),
    keyId: id(root.keyId, "key ID"),
    suite: CONTINUITY_SIGNATURE_SUITE,
    signature,
  };
}

export function parseContinuityTrustPolicy(text: string): ContinuityTrustPolicy {
  return validateContinuityTrustPolicy(parseBoundedJson(text, "Continuity trust policy"));
}

export function validateContinuityTrustPolicy(value: unknown): ContinuityTrustPolicy {
  const root = exactObject(value, ["schema", "version", "policyId", "authorityId", "revision", "keys", "terminals"] as const, "Continuity trust policy");
  if (root.schema !== CONTINUITY_TRUST_POLICY_SCHEMA || root.version !== CONTINUITY_TRUST_POLICY_VERSION) throw new Error("Continuity trust-policy schema or version is unsupported.");
  if (!Array.isArray(root.keys) || root.keys.length < 1 || root.keys.length > 100) throw new Error("Continuity trust policy must contain 1–100 keys.");
  const keys = root.keys.map((item) => {
    const key = exactObject(item, ["keyId", "status", "publicJwk"] as const, "Continuity trust key");
    if (key.status !== "active" && key.status !== "revoked") throw new Error("Continuity trust key status is unsupported.");
    const jwk = exactObject(key.publicJwk, ["kty", "crv", "x", "y"] as const, "Continuity public key");
    if (jwk.kty !== "EC" || jwk.crv !== "P-256") throw new Error("Continuity public key must be EC P-256.");
    return { keyId: id(key.keyId, "key ID"), status: key.status, publicJwk: { kty: "EC", crv: "P-256", x: base64url(jwk.x, "public key x", 32), y: base64url(jwk.y, "public key y", 32) } } satisfies ContinuityTrustKey;
  });
  if (new Set(keys.map((item) => item.keyId)).size !== keys.length) throw new Error("Continuity trust-policy key IDs must be unique.");
  if (!Array.isArray(root.terminals) || root.terminals.length > 1_000) throw new Error("Continuity trust policy exceeds 1,000 terminal statements.");
  const terminals = root.terminals.map((item) => {
    const terminal = exactObject(item, ["workspaceId", "lineageId", "branchId", "originScope", "sequence", "witnessDigest"] as const, "Continuity terminal");
    return { workspaceId: id(terminal.workspaceId, "terminal workspace ID"), lineageId: id(terminal.lineageId, "terminal lineage ID"), branchId: id(terminal.branchId, "terminal branch ID"), originScope: originScope(terminal.originScope), sequence: positiveInteger(terminal.sequence, "terminal sequence"), witnessDigest: digest(terminal.witnessDigest, "terminal witness digest") } satisfies ContinuityTerminal;
  });
  const terminalKeys = terminals.map((item) => `${item.workspaceId}\u0000${item.lineageId}`);
  if (new Set(terminalKeys).size !== terminalKeys.length) throw new Error("Continuity trust policy may name only one terminal per workspace lineage.");
  return {
    schema: CONTINUITY_TRUST_POLICY_SCHEMA,
    version: CONTINUITY_TRUST_POLICY_VERSION,
    policyId: id(root.policyId, "policy ID"),
    authorityId: id(root.authorityId, "authority ID"),
    revision: positiveInteger(root.revision, "policy revision"),
    keys,
    terminals,
  };
}

export function continuityWitnessSigningBytes(value: SignedContinuityWitness): Uint8Array<ArrayBuffer> {
  const signed = validateSignedContinuityWitness(value);
  return new TextEncoder().encode(canonicalJson({
    domain: "IN_KEEPING_CONTINUITY_WITNESS_V1",
    schema: signed.schema,
    version: signed.version,
    witness: signed.witness,
    authorityId: signed.authorityId,
    keyId: signed.keyId,
    suite: signed.suite,
  }));
}

export async function verifyContinuityWitnessSignature(
  signedValue: unknown,
  policyValue: unknown,
): Promise<{ signed: SignedContinuityWitness; policy: ContinuityTrustPolicy; keyStatus: ContinuityTrustKey["status"] }> {
  const signed = validateSignedContinuityWitness(signedValue);
  const policy = validateContinuityTrustPolicy(policyValue);
  await verifyContinuityWitnessDigest(signed.witness);
  if (signed.authorityId !== policy.authorityId) throw new Error("Signed witness authority does not match the supplied trust policy.");
  const key = policy.keys.find((item) => item.keyId === signed.keyId);
  if (!key) throw new Error("Signed witness key is unknown to the supplied trust policy.");
  const publicKey = await crypto.subtle.importKey("jwk", { ...key.publicJwk, ext: true, key_ops: ["verify"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, decodeBase64url(signed.signature), continuityWitnessSigningBytes(signed));
  if (!valid) throw new Error("Signed continuity witness signature is invalid.");
  return { signed, policy, keyStatus: key.status };
}

export async function verifyContinuityTopology(
  witnessValues: readonly unknown[],
  expectedTerminalValue?: ContinuityTerminal | null,
): Promise<ContinuityTopologyResult> {
  if (witnessValues.length === 0) return topology("no-evidence", [], [], [], null);
  if (witnessValues.length > MAX_CONTINUITY_WITNESSES) return topology("indeterminate", [], [], [{ code: "LIMIT", anchorDigest: null, detail: "Witness count exceeds the bounded verification limit." }], null);
  let expected: ContinuityTerminal | null;
  try { expected = expectedTerminalValue ? validateTerminal(expectedTerminalValue) : null; }
  catch (error) { return topology("invalid", [], [], [{ code: "INVALID_NODE", anchorDigest: null, detail: errorMessage(error) }], null); }
  let witnesses: ContinuityWitness[];
  try { witnesses = await Promise.all(witnessValues.map(verifyContinuityWitnessDigest)); }
  catch (error) { return topology("invalid", [], [], [{ code: "INVALID_NODE", anchorDigest: null, detail: error instanceof Error ? error.message : "Witness validation failed." }], expected?.witnessDigest ?? null); }
  const findings: ContinuityTopologyFinding[] = [];
  const byAnchor = new Map<string, ContinuityWitness>();
  for (const witness of witnesses) {
    const existing = byAnchor.get(witness.anchorDigest);
    if (existing) {
      findings.push({ code: "DUPLICATE", anchorDigest: witness.anchorDigest, detail: existing.digest === witness.digest ? "Byte-equivalent witness content was supplied more than once." : "One anchor digest was paired with conflicting witness content." });
      if (existing.digest !== witness.digest) return topology("terminal-conflict", [], [], findings, null);
      continue;
    }
    byAnchor.set(witness.anchorDigest, witness);
  }
  const unique = [...byAnchor.values()];
  if (findings.some((item) => item.code === "DUPLICATE")) {
    return topology("invalid", [], [], findings, expected?.witnessDigest ?? null);
  }
  const first = unique[0];
  if (unique.some((item) => item.workspaceId !== first.workspaceId || item.lineageId !== first.lineageId || item.branchId !== first.branchId || item.originScope !== first.originScope)) {
    findings.push({ code: "SCOPE_CONFLICT", anchorDigest: null, detail: "Witnesses cross workspace, lineage, or branch scope." });
  }
  const children = new Map<string, ContinuityWitness[]>();
  const roots: ContinuityWitness[] = [];
  for (const witness of unique) {
    if (witness.predecessorAnchorDigest === null) roots.push(witness);
    else children.set(witness.predecessorAnchorDigest, [...(children.get(witness.predecessorAnchorDigest) ?? []), witness]);
  }
  if (roots.length === 1 && roots[0].sequence !== 1) {
    findings.push({ code: "GAP", anchorDigest: roots[0].anchorDigest, detail: `The sole root begins at sequence ${roots[0].sequence} instead of sequence 1.` });
  }
  if (roots.length !== 1) findings.push({ code: "ROOT_CONFLICT", anchorDigest: null, detail: `Expected one witness root and found ${roots.length}.` });
  for (const witness of unique) {
    if (witness.predecessorAnchorDigest && !byAnchor.has(witness.predecessorAnchorDigest)) findings.push({ code: "GAP", anchorDigest: witness.anchorDigest, detail: `Sequence ${witness.sequence} names an unavailable predecessor.` });
    const prior = witness.predecessorAnchorDigest ? byAnchor.get(witness.predecessorAnchorDigest) : undefined;
    if (prior && (
      witness.sequence !== prior.sequence + 1
      || witness.generation !== prior.generation + 1
      || witness.auditCount <= prior.auditCount
      || witness.ledgerGenesisHash !== prior.ledgerGenesisHash
      || witness.predecessorTerminalHash !== prior.predecessorTerminalHash
    )) findings.push({ code: "GAP", anchorDigest: witness.anchorDigest, detail: "Witness sequence, generation, ledger, or audit progression is not a consecutive extension." });
  }
  const forkParents = [...children.entries()].filter(([, values]) => values.length > 1);
  for (const [parent, values] of forkParents) findings.push({ code: "FORK", anchorDigest: parent, detail: `${values.length} successors share one predecessor.` });
  const heads = unique.filter((item) => !(children.get(item.anchorDigest)?.length)).sort((a, b) => a.digest.localeCompare(b.digest));
  const connected = new Set<string>();
  if (roots.length === 1) {
    const pending = [roots[0]];
    while (pending.length) {
      const item = pending.pop()!;
      if (connected.has(item.anchorDigest)) continue;
      connected.add(item.anchorDigest);
      pending.push(...(children.get(item.anchorDigest) ?? []));
    }
  }
  if (connected.size !== unique.length) findings.push({ code: "DISCONNECTED", anchorDigest: null, detail: `${unique.length - connected.size} witness nodes are disconnected from the sole root.` });
  const linear = roots.length === 1 && !findings.some((item) => ["ROOT_CONFLICT", "GAP", "FORK", "DISCONNECTED", "SCOPE_CONFLICT"].includes(item.code));
  const sequence = linear ? [...unique].sort((a, b) => a.sequence - b.sequence).map((item) => item.digest) : [];
  if (!linear) {
    const status: ContinuityTopologyStatus = forkParents.length || (roots.length > 1 && !findings.some((item) => item.code === "SCOPE_CONFLICT"))
      ? "forked"
      : findings.some((item) => item.code === "SCOPE_CONFLICT")
        ? "boundary"
        : findings.some((item) => item.code === "GAP" || item.code === "DISCONNECTED" || item.code === "ROOT_CONFLICT")
          ? "gap"
          : "invalid";
    return topology(status, sequence, heads.map((item) => item.digest), findings, expected?.witnessDigest ?? null);
  }
  const head = heads[0];
  if (!expected) return topology("valid-prefix", sequence, [head.digest], findings, null);
  if (expected.workspaceId !== head.workspaceId || expected.lineageId !== head.lineageId || expected.branchId !== head.branchId || expected.originScope !== head.originScope) {
    findings.push({ code: "SCOPE_CONFLICT", anchorDigest: head.anchorDigest, detail: "Supplied terminal belongs to another workspace or lineage." });
    return topology("boundary", sequence, [head.digest], findings, expected.witnessDigest);
  }
  if (expected.sequence > head.sequence) {
    findings.push({ code: "TRUNCATED", anchorDigest: head.anchorDigest, detail: `Observed head sequence ${head.sequence} precedes expected terminal sequence ${expected.sequence}.` });
    return topology("truncated", sequence, [head.digest], findings, expected.witnessDigest);
  }
  if (expected.sequence !== head.sequence || expected.witnessDigest !== head.digest) {
    findings.push({ code: "TERMINAL_CONFLICT", anchorDigest: head.anchorDigest, detail: "Observed head does not equal the supplied terminal statement." });
    return topology("terminal-conflict", sequence, [head.digest], findings, expected.witnessDigest);
  }
  return topology("corroborated-at-checkpoint", sequence, [head.digest], findings, expected.witnessDigest);
}

export async function verifyExternalContinuity(
  anchorValue: ContinuityAnchor,
  signedSetValue: unknown,
  policyValue: unknown,
  currentOriginScope: string,
  expectedPolicyDigest: string | null,
): Promise<ExternalContinuityVerification> {
  let anchor: ContinuityAnchor;
  try {
    anchor = await validateContinuityAnchor(anchorValue);
  } catch (error) {
    return external("invalid-evidence", `Local continuity anchor is invalid. ${errorMessage(error)}`, null, null, null, null, null);
  }
  let normalizedCurrentOriginScope: string;
  try {
    normalizedCurrentOriginScope = originScope(currentOriginScope);
  } catch (error) {
    return external("invalid-evidence", `Current origin scope is invalid. ${errorMessage(error)}`, null, null, null, null, null);
  }
  let set: SignedContinuityWitnessSet;
  let policy: ContinuityTrustPolicy;
  let policyDigestValue: string;
  try {
    set = validateSignedContinuityWitnessSet(signedSetValue);
    policy = validateContinuityTrustPolicy(policyValue);
    policyDigestValue = await continuityTrustPolicyDigest(policy);
  } catch (error) {
    return external("indeterminate", errorMessage(error), null, null, null, null, null);
  }
  const result = (status: ExternalContinuityStatus, reason: string, witnessDigest: string | null, topologyResult: ContinuityTopologyResult | null) => external(status, reason, witnessDigest, policy.policyId, policy.revision, policyDigestValue, topologyResult);
  if (expectedPolicyDigest === null) return result("policy-pin-missing", "No expected policy digest was supplied. The policy file cannot authorize itself, and the application cannot establish how a digest was obtained.", null, null);
  let pinnedPolicyDigest: string;
  try { pinnedPolicyDigest = digest(expectedPolicyDigest, "expected policy digest"); }
  catch (error) { return result("policy-pin-mismatch", errorMessage(error), null, null); }
  if (pinnedPolicyDigest !== policyDigestValue) {
    return result("policy-pin-mismatch", "The supplied policy does not match the supplied expected policy digest.", null, null);
  }
  const verified: SignedContinuityWitness[] = [];
  for (const candidate of set.witnesses) {
    try {
      const result = await verifyContinuityWitnessSignature(candidate, policy);
      if (result.keyStatus === "revoked") return external("revoked-key", "A signed witness uses a key marked revoked by the exact pinned policy.", candidate.witness.digest, policy.policyId, policy.revision, policyDigestValue, null);
      verified.push(result.signed);
    } catch (error) {
      const message = errorMessage(error);
      const status: ExternalContinuityStatus = /unknown/i.test(message)
        ? "unknown-key"
        : /signature is invalid/i.test(message)
          ? "invalid-signature"
          : "invalid-evidence";
      return result(status, message, candidate.witness.digest, null);
    }
  }
  const terminal = policy.terminals.find((item) => item.workspaceId === anchor.workspaceId && item.lineageId === anchor.lineageId) ?? null;
  if (!terminal) return result("indeterminate", "The exact pinned policy names no terminal for this workspace lineage.", null, null);
  const topologyResult = await verifyContinuityTopology(verified.map((item) => item.witness), terminal);
  if (topologyResult.status === "forked") return result("fork", "The signed witness sequence contains a fork.", terminal.witnessDigest, topologyResult);
  if (topologyResult.status === "gap") return result("gap", "The signed witness sequence contains a gap or disconnected component.", terminal.witnessDigest, topologyResult);
  if (topologyResult.status === "truncated") return result("rollback", "The signed witness sequence ends before the terminal bound by the exact pinned policy.", terminal.witnessDigest, topologyResult);
  if (topologyResult.status === "terminal-conflict") return result("invalid-evidence", "The signed witness head conflicts with the terminal selected by the supplied policy.", terminal.witnessDigest, topologyResult);
  if (topologyResult.status === "boundary") return result("content-mismatch", "The signed witness sequence crosses a workspace, lineage, branch, or origin boundary.", terminal.witnessDigest, topologyResult);
  if (topologyResult.status === "invalid") return result("invalid-evidence", "The signed witness sequence is invalid.", terminal.witnessDigest, topologyResult);
  if (topologyResult.status !== "corroborated-at-checkpoint") return result("indeterminate", `Continuity topology is ${topologyResult.status}.`, terminal.witnessDigest, topologyResult);
  const terminalSigned = verified.find((item) => item.witness.digest === terminal.witnessDigest);
  if (!terminalSigned) return result("indeterminate", "The pinned terminal witness is absent from the signed sequence.", terminal.witnessDigest, topologyResult);
  const witness = terminalSigned.witness;
  if (witness.originScope !== normalizedCurrentOriginScope) return result("content-mismatch", "The signed terminal belongs to a different recorded origin scope.", witness.digest, topologyResult);
  if (witness.sequence > anchor.sequence) return result("rollback", "The validated local anchor precedes the signed terminal selected by the supplied policy.", witness.digest, topologyResult);
  const predecessorWitness = anchor.previousAnchorDigest === null
    ? null
    : verified.find((item) => item.witness.anchorDigest === anchor.previousAnchorDigest)?.witness ?? null;
  const predecessorCheckpointMatches = anchor.previousCheckpoint === null
    ? predecessorWitness === null
    : predecessorWitness !== null && checkpointMatchesWitness(anchor.previousCheckpoint, predecessorWitness);
  if (witness.anchorDigest !== anchor.digest
    || witness.sequence !== anchor.sequence
    || witness.predecessorAnchorDigest !== anchor.previousAnchorDigest
    || witness.generation !== anchor.activeCheckpoint.generation
    || witness.workspaceDigest !== anchor.activeCheckpoint.payloadDigest
    || witness.ledgerGenesisHash !== anchor.activeCheckpoint.ledgerGenesisHash
    || witness.auditHeadDigest !== anchor.activeCheckpoint.terminalHash
    || witness.terminalStateDigest !== anchor.activeCheckpoint.terminalStateDigest
    || witness.auditCount !== anchor.activeCheckpoint.auditCount
    || witness.predecessorTerminalHash !== anchor.activeCheckpoint.predecessorTerminalHash
    || !predecessorCheckpointMatches) {
    return result("content-mismatch", "The signed terminal or its immediate predecessor does not bind the validated local continuity anchor.", witness.digest, topologyResult);
  }
  return result("trusted-match", "The validated local anchor checkpoint matches a signed witness chain and the terminal selected by the policy whose exact digest was supplied. This establishes checkpoint correspondence under that selected policy only; it does not establish signer authority, policy custody, evidence truth or completeness, trusted time, or that the supplied policy digest was independently obtained or current.", witness.digest, topologyResult);
}

export async function continuityTrustPolicyDigest(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(validateContinuityTrustPolicy(value)));
}

export async function formatContinuityWitness(value: ContinuityWitness): Promise<string> {
  return JSON.stringify(await verifyContinuityWitnessDigest(value), null, 2);
}

function validateTerminal(value: unknown): ContinuityTerminal {
  const terminal = exactObject(value, ["workspaceId", "lineageId", "branchId", "originScope", "sequence", "witnessDigest"] as const, "Continuity terminal");
  return { workspaceId: id(terminal.workspaceId, "terminal workspace ID"), lineageId: id(terminal.lineageId, "terminal lineage ID"), branchId: id(terminal.branchId, "terminal branch ID"), originScope: originScope(terminal.originScope), sequence: positiveInteger(terminal.sequence, "terminal sequence"), witnessDigest: digest(terminal.witnessDigest, "terminal witness digest") };
}

function topology(status: ContinuityTopologyStatus, sequence: string[], branchHeads: string[], findings: ContinuityTopologyFinding[], terminalWitnessDigest: string | null): ContinuityTopologyResult {
  return { status, sequence, branchHeads, findings, terminalWitnessDigest };
}

function external(status: ExternalContinuityStatus, reason: string, witnessDigest: string | null, policyId: string | null, policyRevision: number | null, policyDigest: string | null, topologyResult: ContinuityTopologyResult | null): ExternalContinuityVerification {
  return { status, reason, witnessDigest, policyId, policyRevision, policyDigest, topology: topologyResult };
}

function parseBoundedJson(text: string, label: string): unknown {
  if (typeof text !== "string" || text.length < 1 || new TextEncoder().encode(text).byteLength > MAX_EXTERNAL_CONTINUITY_BYTES) throw new Error(`${label} must be nonempty JSON no larger than 4 MiB.`);
  try { return assertSafeJsonText(text); }
  catch (error) { throw new Error(`${label} failed JSON quarantine. ${errorMessage(error)}`, { cause: error }); }
}

function exactObject<const K extends readonly string[]>(value: unknown, keys: K, label: string): Record<K[number], unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !keys.includes(key));
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (unknown || missing || actual.length !== keys.length) throw new Error(`${label} has missing or unknown fields.`);
  return value as Record<K[number], unknown>;
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} must be a safe identifier.`);
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function nullableDigest(value: unknown, label: string): string | null { return value === null ? null : digest(value, label); }
function positiveInteger(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer.`); return value; }
function literal<const T extends string>(value: unknown, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} is unsupported.`); return expected; }
function base64url(value: unknown, label: string, expectedBytes: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !BASE64URL.test(value)) throw new Error(`${label} must be canonical base64url.`);
  let decoded: Uint8Array<ArrayBuffer>;
  try { decoded = decodeBase64url(value); } catch { throw new Error(`${label} must be canonical base64url.`); }
  if (decoded.byteLength !== expectedBytes || encodeBase64url(decoded) !== value) throw new Error(`${label} must be canonical base64url encoding exactly ${expectedBytes} bytes.`);
  return value;
}

function originScope(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || value !== value.trim() || value !== value.normalize("NFC")) throw new Error("Origin scope must be canonical text.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Origin scope must be an absolute HTTPS origin."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.origin !== value) throw new Error("Origin scope must be an exact credential-free HTTPS origin.");
  return value;
}

function instant(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} must be a canonical ISO 8601 UTC instant.`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const hashed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64url(value: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Continuity verification failed."; }

export function checkpointMatchesWitness(checkpoint: ContinuityCheckpoint, witness: ContinuityWitness): boolean {
  return checkpoint.generation === witness.generation
    && checkpoint.payloadDigest === witness.workspaceDigest
    && checkpoint.ledgerGenesisHash === witness.ledgerGenesisHash
    && checkpoint.terminalHash === witness.auditHeadDigest
    && checkpoint.terminalStateDigest === witness.terminalStateDigest
    && checkpoint.auditCount === witness.auditCount
    && checkpoint.predecessorTerminalHash === witness.predecessorTerminalHash;
}
