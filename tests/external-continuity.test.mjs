import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTINUITY_SIGNATURE_SUITE,
  CONTINUITY_TRUST_POLICY_SCHEMA,
  CONTINUITY_TRUST_POLICY_VERSION,
  CONTINUITY_WITNESS_SET_SCHEMA,
  CONTINUITY_WITNESS_SET_VERSION,
  MAX_CONTINUITY_WITNESSES,
  SIGNED_CONTINUITY_WITNESS_SCHEMA,
  SIGNED_CONTINUITY_WITNESS_VERSION,
  continuityTrustPolicyDigest,
  continuityWitnessSigningBytes,
  createContinuityWitness,
  verifyContinuityTopology,
  verifyExternalContinuity,
} from "../app/external-continuity.ts";
import {
  CONTINUITY_ACKNOWLEDGMENT,
  continuityPayloadDigest,
  createContinuityAnchor,
  extendContinuityAnchor,
} from "../app/continuity-anchor.ts";
import { createBlankWorkspace, recordWorkspaceAction } from "../app/lab-core.ts";

const ORIGIN = "https://example.test";
const WORKSPACE_ID = "ws-external-continuity";
const LINEAGE_ID = "lineage-external-continuity";
const ACCEPTANCE = {
  browserTime: "2026-09-01T00:00:00.000Z",
  operatorRole: "Continuity custodian",
  authorityReference: "TEST-ONLY",
  rationale: "Synthetic continuity test fixture.",
  sourceKind: "new-workspace",
  sourcePayloadDigest: null,
  sourceAnchorDigest: null,
  acknowledgment: CONTINUITY_ACKNOWLEDGMENT,
};

async function makeKey(keyId = "checkpoint-key") {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    keyId,
    pair,
    policyKey: { keyId, status: "active", publicJwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y } },
  };
}

function base64url(bytes) {
  return Buffer.from(new Uint8Array(bytes)).toString("base64url");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function redigestWitness(witness, overrides) {
  const unsigned = { ...witness, ...overrides };
  Reflect.deleteProperty(unsigned, "digest");
  const digest = Buffer.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(unsigned))))).toString("hex");
  return { ...unsigned, digest };
}

async function signWitness(witness, key, authorityId = "authority.example") {
  const unsigned = {
    schema: SIGNED_CONTINUITY_WITNESS_SCHEMA,
    version: SIGNED_CONTINUITY_WITNESS_VERSION,
    witness,
    authorityId,
    keyId: key.keyId,
    suite: CONTINUITY_SIGNATURE_SUITE,
    signature: base64url(new Uint8Array(64)),
  };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.pair.privateKey, continuityWitnessSigningBytes(unsigned));
  return { ...unsigned, signature: base64url(signature) };
}

async function makeChain(length = 4, claimedTimes = []) {
  let workspace = await createBlankWorkspace("External continuity fixture");
  let anchor = await createContinuityAnchor({
    workspace,
    workspaceId: WORKSPACE_ID,
    lineageId: LINEAGE_ID,
    generation: 1,
    payloadDigest: await continuityPayloadDigest(workspace),
    initialAcceptance: ACCEPTANCE,
  });
  const workspaces = [workspace];
  const anchors = [anchor];
  const witnesses = [await createContinuityWitness(anchor, ORIGIN, claimedTimes[0] ?? "2026-09-01T00:00:00.000Z")];
  for (let index = 1; index < length; index += 1) {
    const previous = workspace;
    workspace = await recordWorkspaceAction(previous, `Synthetic action ${index}`, `TEST-${index}`);
    anchor = await extendContinuityAnchor(anchor, {
      previousWorkspace: previous,
      workspace,
      generation: index + 1,
      payloadDigest: await continuityPayloadDigest(workspace),
    });
    workspaces.push(workspace);
    anchors.push(anchor);
    witnesses.push(await createContinuityWitness(anchor, ORIGIN, claimedTimes[index] ?? `2026-09-01T00:00:0${index}.000Z`));
  }
  return { workspace, anchor, workspaces, anchors, witnesses };
}

function terminal(witness) {
  return {
    workspaceId: witness.workspaceId,
    lineageId: witness.lineageId,
    branchId: witness.branchId,
    originScope: witness.originScope,
    sequence: witness.sequence,
    witnessDigest: witness.digest,
  };
}

function policy(key, terminalWitness, overrides = {}) {
  return {
    schema: CONTINUITY_TRUST_POLICY_SCHEMA,
    version: CONTINUITY_TRUST_POLICY_VERSION,
    policyId: "policy.example.current",
    authorityId: "authority.example",
    revision: 1,
    keys: [key.policyKey],
    terminals: [terminal(terminalWitness)],
    ...overrides,
  };
}

function set(witnesses) {
  return { schema: CONTINUITY_WITNESS_SET_SCHEMA, version: CONTINUITY_WITNESS_SET_VERSION, witnesses };
}

test("an exact supplied policy digest and signed terminal corroborate only the current checkpoint", async () => {
  const chain = await makeChain();
  const key = await makeKey();
  const signed = await Promise.all(chain.witnesses.map((item) => signWitness(item, key)));
  const trust = policy(key, chain.witnesses.at(-1));
  const pin = await continuityTrustPolicyDigest(trust);
  const result = await verifyExternalContinuity(chain.anchor, set(signed.reverse()), trust, ORIGIN, pin);
  assert.equal(result.status, "trusted-match");
  assert.equal(result.policyDigest, pin);
  assert.equal(result.topology.status, "corroborated-at-checkpoint");
  assert.match(result.reason, /does not establish.*policy digest was independently obtained or current/i);

  const invalidAnchor = structuredClone(chain.anchor);
  invalidAnchor.digest = "f".repeat(64);
  const invalid = await verifyExternalContinuity(invalidAnchor, set(signed), trust, ORIGIN, pin);
  assert.equal(invalid.status, "invalid-evidence");
  assert.match(invalid.reason, /local continuity anchor is invalid/i);

  const malformedOrigin = await verifyExternalContinuity(chain.anchor, set(signed), trust, "not-an-origin", pin);
  assert.equal(malformedOrigin.status, "invalid-evidence");
  assert.match(malformedOrigin.reason, /current origin scope is invalid/i);
});

test("a policy file cannot authorize itself and a substituted policy is rejected by the expected pin", async () => {
  const chain = await makeChain(2);
  const honest = await makeKey("honest-key");
  const attacker = await makeKey("attacker-key");
  const attackerSigned = await Promise.all(chain.witnesses.map((item) => signWitness(item, attacker)));
  const attackerPolicy = policy(attacker, chain.witnesses.at(-1), { policyId: "attacker-policy" });
  assert.equal((await verifyExternalContinuity(chain.anchor, set(attackerSigned), attackerPolicy, ORIGIN, null)).status, "policy-pin-missing");

  const honestPolicy = policy(honest, chain.witnesses.at(-1));
  const honestPin = await continuityTrustPolicyDigest(honestPolicy);
  assert.equal((await verifyExternalContinuity(chain.anchor, set(attackerSigned), attackerPolicy, ORIGIN, honestPin)).status, "policy-pin-mismatch");

  const replayed = { ...honestPolicy, revision: 2 };
  assert.equal((await verifyExternalContinuity(chain.anchor, set(attackerSigned), replayed, ORIGIN, honestPin)).status, "policy-pin-mismatch");
});

test("deletion, truncation, duplication, non-genesis roots, and bounded exhaustion never corroborate", async () => {
  const chain = await makeChain(5);
  const expected = terminal(chain.witnesses.at(-1));
  assert.equal((await verifyContinuityTopology(chain.witnesses.filter((_, index) => index !== 2), expected)).status, "gap");
  assert.equal((await verifyContinuityTopology(chain.witnesses.slice(0, -1), expected)).status, "truncated");
  assert.equal((await verifyContinuityTopology([...chain.witnesses, chain.witnesses[2]], expected)).status, "invalid");
  assert.equal((await verifyContinuityTopology([chain.witnesses[3]], terminal(chain.witnesses[3]))).status, "gap");
  assert.equal((await verifyContinuityTopology(Array(MAX_CONTINUITY_WITNESSES + 1).fill(chain.witnesses[0]), expected)).status, "indeterminate");
});

test("the signed terminal and immediate predecessor must bind the validated local anchor", async () => {
  const root = await makeChain(1);
  const branchA = await recordWorkspaceAction(root.workspace, "Branch A", "BRANCH-A");
  const branchB = await recordWorkspaceAction(root.workspace, "Branch B", "BRANCH-B");
  const anchorA = await extendContinuityAnchor(root.anchor, { previousWorkspace: root.workspace, workspace: branchA, generation: 2, payloadDigest: await continuityPayloadDigest(branchA) });
  const anchorB = await extendContinuityAnchor(root.anchor, { previousWorkspace: root.workspace, workspace: branchB, generation: 2, payloadDigest: await continuityPayloadDigest(branchB) });
  const terminalWorkspace = await recordWorkspaceAction(branchA, "Terminal A", "TERMINAL-A");
  const terminalAnchor = await extendContinuityAnchor(anchorA, { previousWorkspace: branchA, workspace: terminalWorkspace, generation: 3, payloadDigest: await continuityPayloadDigest(terminalWorkspace) });
  const branchBWitness = await createContinuityWitness(anchorB, ORIGIN, "2026-09-01T00:00:01.000Z");
  const honestTerminal = await createContinuityWitness(terminalAnchor, ORIGIN, "2026-09-01T00:00:02.000Z");
  const splicedTerminal = await redigestWitness(honestTerminal, { predecessorAnchorDigest: anchorB.digest });
  const key = await makeKey();
  const signedSplice = await Promise.all([root.witnesses[0], branchBWitness, splicedTerminal].map((item) => signWitness(item, key)));
  const splicePolicy = policy(key, splicedTerminal);
  const splice = await verifyExternalContinuity(terminalAnchor, set(signedSplice), splicePolicy, ORIGIN, await continuityTrustPolicyDigest(splicePolicy));
  assert.notEqual(splicedTerminal.predecessorAnchorDigest, terminalAnchor.previousAnchorDigest);
  assert.equal(splice.topology.status, "corroborated-at-checkpoint");
  assert.equal(splice.status, "content-mismatch");
  assert.match(splice.reason, /immediate predecessor/i);

  const chain = await makeChain(3);
  const substitutedPredecessor = await redigestWitness(chain.witnesses[1], { workspaceDigest: "f".repeat(64) });
  const signedSubstitution = await Promise.all([chain.witnesses[0], substitutedPredecessor, chain.witnesses[2]].map((item) => signWitness(item, key)));
  const substitutionPolicy = policy(key, chain.witnesses[2]);
  const substitution = await verifyExternalContinuity(chain.anchor, set(signedSubstitution), substitutionPolicy, ORIGIN, await continuityTrustPolicyDigest(substitutionPolicy));
  assert.equal(substitution.topology.status, "corroborated-at-checkpoint");
  assert.equal(substitution.status, "content-mismatch");
  assert.match(substitution.reason, /immediate predecessor/i);
});

test("predecessor-ledger changes break otherwise consecutive witness topology", async () => {
  const chain = await makeChain(3);
  const mutated = await redigestWitness(chain.witnesses[1], { predecessorTerminalHash: "a".repeat(64) });
  const topology = await verifyContinuityTopology([chain.witnesses[0], mutated, chain.witnesses[2]], terminal(chain.witnesses[2]));
  assert.equal(topology.status, "gap");
  assert.ok(topology.findings.some((finding) => finding.code === "GAP" && /ledger|audit progression/i.test(finding.detail)));
});

test("external terminal conflicts and both forms of rollback are classified distinctly", async () => {
  const chain = await makeChain(3);
  const key = await makeKey();
  const signed = await Promise.all(chain.witnesses.map((item) => signWitness(item, key)));
  const head = chain.witnesses.at(-1);
  const conflictingTerminal = { ...terminal(head), witnessDigest: `${head.digest[0] === "0" ? "1" : "0"}${head.digest.slice(1)}` };
  const conflictingPolicy = policy(key, head, { terminals: [conflictingTerminal] });
  const conflict = await verifyExternalContinuity(chain.anchor, set(signed), conflictingPolicy, ORIGIN, await continuityTrustPolicyDigest(conflictingPolicy));
  assert.equal(conflict.status, "invalid-evidence");
  assert.equal(conflict.topology.status, "terminal-conflict");

  const currentPolicy = policy(key, head);
  const currentPin = await continuityTrustPolicyDigest(currentPolicy);
  const truncated = await verifyExternalContinuity(chain.anchor, set(signed.slice(0, -1)), currentPolicy, ORIGIN, currentPin);
  assert.equal(truncated.status, "rollback");
  assert.equal(truncated.topology.status, "truncated");

  const localRollback = await verifyExternalContinuity(chain.anchors[1], set(signed), currentPolicy, ORIGIN, currentPin);
  assert.equal(localRollback.status, "rollback");
  assert.equal(localRollback.topology.status, "corroborated-at-checkpoint");
  assert.match(localRollback.reason, /local anchor precedes/i);
});

test("forks and origin splices are visible regardless of input order or browser-clock order", async () => {
  const chain = await makeChain(3, ["2026-09-03T00:00:00.000Z", "2026-09-02T00:00:00.000Z", "2026-09-01T00:00:00.000Z"]);
  const topology = await verifyContinuityTopology([...chain.witnesses].reverse(), terminal(chain.witnesses.at(-1)));
  assert.equal(topology.status, "corroborated-at-checkpoint");

  const branchA = await recordWorkspaceAction(chain.workspaces[0], "Branch A", "BRANCH-A");
  const branchB = await recordWorkspaceAction(chain.workspaces[0], "Branch B", "BRANCH-B");
  const anchorA = await extendContinuityAnchor(chain.anchors[0], { previousWorkspace: chain.workspaces[0], workspace: branchA, generation: 2, payloadDigest: await continuityPayloadDigest(branchA) });
  const anchorB = await extendContinuityAnchor(chain.anchors[0], { previousWorkspace: chain.workspaces[0], workspace: branchB, generation: 2, payloadDigest: await continuityPayloadDigest(branchB) });
  const witnessA = await createContinuityWitness(anchorA, ORIGIN, "2026-09-04T00:00:00.000Z");
  const witnessB = await createContinuityWitness(anchorB, ORIGIN, "2026-09-04T00:00:00.000Z");
  assert.equal((await verifyContinuityTopology([chain.witnesses[0], witnessA, witnessB], terminal(witnessA))).status, "forked");

  const competingRoot = await createContinuityAnchor({
    workspace: chain.workspaces[0],
    workspaceId: WORKSPACE_ID,
    lineageId: LINEAGE_ID,
    generation: 1,
    payloadDigest: await continuityPayloadDigest(chain.workspaces[0]),
    initialAcceptance: { ...ACCEPTANCE, rationale: "Competing synthetic root." },
  });
  const competingRootWitness = await createContinuityWitness(competingRoot, ORIGIN, "2026-09-04T00:00:00.000Z");
  assert.equal((await verifyContinuityTopology([chain.witnesses[0], competingRootWitness], terminal(chain.witnesses[0]))).status, "forked");

  const originSplice = await createContinuityWitness(chain.anchors[1], "https://elsewhere.example", "2026-09-04T00:00:00.000Z");
  assert.equal((await verifyContinuityTopology([chain.witnesses[0], originSplice], terminal(originSplice))).status, "boundary");

  const fabricatedAnchor = structuredClone(chain.anchor);
  fabricatedAnchor.digest = "f".repeat(64);
  await assert.rejects(createContinuityWitness(fabricatedAnchor, ORIGIN, "2026-09-04T00:00:00.000Z"), /anchor digest/i);
});

test("unknown, revoked, and invalid signatures remain distinct blocking results", async () => {
  const chain = await makeChain(1);
  const honest = await makeKey("honest-key");
  const other = await makeKey("other-key");
  const signedOther = await signWitness(chain.witnesses[0], other);
  const honestPolicy = policy(honest, chain.witnesses[0]);
  const honestPin = await continuityTrustPolicyDigest(honestPolicy);
  assert.equal((await verifyExternalContinuity(chain.anchor, set([signedOther]), honestPolicy, ORIGIN, honestPin)).status, "unknown-key");

  const revokedPolicy = policy(other, chain.witnesses[0], { keys: [{ ...other.policyKey, status: "revoked" }] });
  const revokedPin = await continuityTrustPolicyDigest(revokedPolicy);
  assert.equal((await verifyExternalContinuity(chain.anchor, set([signedOther]), revokedPolicy, ORIGIN, revokedPin)).status, "revoked-key");

  const tampered = { ...signedOther, signature: `${signedOther.signature.startsWith("A") ? "B" : "A"}${signedOther.signature.slice(1)}` };
  const otherPolicy = policy(other, chain.witnesses[0]);
  const otherPin = await continuityTrustPolicyDigest(otherPolicy);
  assert.equal((await verifyExternalContinuity(chain.anchor, set([tampered]), otherPolicy, ORIGIN, otherPin)).status, "invalid-signature");
});
