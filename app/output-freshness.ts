import { assessActiveEvidence, validateWorkspaceSnapshot, workspaceStateDigest, type Workspace } from "./lab-core.ts";
import type { LocalWorkspaceOpen } from "./lab-storage.ts";

export type SavedCopyStatus = "current" | "stale" | "unsaved-changes" | "not-saved";
export type OutputFreshnessMode = "authoritative" | "diagnostic";

export type ActiveLocalWorkspace = {
  id: string;
  token: string;
  savedAt: string;
};

export type OutputFreshnessContext = {
  activeLocal: ActiveLocalWorkspace | null;
  dirty: boolean;
  expectedSessionVersion: number;
  getSessionVersion: () => number;
  getPendingDrafts: () => boolean;
  getOperationInProgress: () => boolean;
  expectedStorageVersion: number;
  getStorageVersion: () => number;
  getStorageQuarantined: () => boolean;
  openWorkspace: (id: string) => Promise<LocalWorkspaceOpen>;
};

export type OutputFreshnessLease = {
  savedCopyStatus: SavedCopyStatus;
  continuityStatus: LocalWorkspaceOpen["continuity"]["status"] | "unanchored";
  continuityReason: string;
  /** The exact verified saved snapshot for authoritative artifact rendering. */
  artifactWorkspace: Workspace;
  /**
   * Re-read the named generation after asynchronous artifact construction and
   * immediately before activating the file. No browser event can interleave
   * between a resolved recheck and synchronous Blob/anchor activation.
   */
  recheck: () => Promise<void>;
};

type Inspection = {
  savedCopyStatus: SavedCopyStatus;
  fingerprint: string;
  savedWorkspace: Workspace | null;
  continuityStatus: LocalWorkspaceOpen["continuity"]["status"] | "unanchored";
  continuityReason: string;
  evidenceBlocked: boolean;
  evidenceReason: string;
};

function assertSessionVersion(context: OutputFreshnessContext): void {
  if (context.getSessionVersion() !== context.expectedSessionVersion) {
    throw new Error("The session changed while freshness was being verified. Retry the output from the current session.");
  }
}

function assertLeaseContext(context: OutputFreshnessContext, mode: OutputFreshnessMode): void {
  assertSessionVersion(context);
  if (context.getOperationInProgress()) {
    throw new Error("Another workspace operation is still finishing. Wait for it to complete before generating an artifact.");
  }
  if (mode !== "authoritative") return;
  if (context.getPendingDrafts()) {
    throw new Error("Save or discard the visible form drafts before generating this authoritative artifact.");
  }
  if (context.getStorageVersion() !== context.expectedStorageVersion) {
    throw new Error("Browser-local storage changed while freshness was being verified. Retry from the current storage state.");
  }
  if (context.getStorageQuarantined()) {
    throw new Error("Browser-local storage is quarantined for inspection, so no authoritative artifact was generated.");
  }
}

async function completeWorkspaceDigest(workspace: Workspace): Promise<string> {
  const serialized = JSON.stringify(workspace);
  if (serialized === undefined) throw new Error("The artifact workspace cannot be serialized.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function inspectSavedCopy(
  workspace: Workspace,
  context: OutputFreshnessContext,
  mode: OutputFreshnessMode,
): Promise<Inspection> {
  assertLeaseContext(context, mode);
  if (!context.activeLocal) return { savedCopyStatus: "not-saved", fingerprint: "not-saved", savedWorkspace: null, continuityStatus: "unanchored", continuityReason: "No named saved workspace is attached.", evidenceBlocked: false, evidenceReason: "" };

  let opened: LocalWorkspaceOpen;
  try {
    opened = await context.openWorkspace(context.activeLocal.id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "browser-local storage is unavailable";
    throw new Error(`Saved-state freshness could not be verified, so no artifact was generated. ${detail}`, { cause: error });
  }
  assertLeaseContext(context, mode);

  if (opened.manifest.id !== context.activeLocal.id || opened.manifest.token !== opened.token) {
    throw new Error("Saved-state freshness could not be verified because storage returned an inconsistent workspace identity.");
  }
  await validateWorkspaceSnapshot(opened.workspace);
  assertLeaseContext(context, mode);

  const savedStateDigest = await workspaceStateDigest(opened.workspace);
  assertLeaseContext(context, mode);
  const sameToken = opened.token === context.activeLocal.token;
  const pendingDrafts = context.getPendingDrafts();
  const sameSessionState = context.dirty || pendingDrafts || (
    savedStateDigest === await workspaceStateDigest(workspace)
    && opened.workspace.audit.at(-1)?.hash === workspace.audit.at(-1)?.hash
    && opened.workspace.activeRevisionId === workspace.activeRevisionId
  );
  assertLeaseContext(context, mode);

  const stale = opened.recoveredFromPrevious || !sameToken || !sameSessionState;
  const continuityStatus = opened.continuity?.status ?? "unanchored";
  const continuityReason = opened.continuity?.reason ?? "No separately retained local continuity checkpoint exists.";
  const evidence = assessActiveEvidence(opened.workspace);
  const evidenceBlocked = evidence.blocked;
  const evidenceReason = evidenceBlocked ? evidence.reason : "";
  const savedCopyStatus: SavedCopyStatus = stale
    ? "stale"
    : context.dirty || pendingDrafts
      ? "unsaved-changes"
      : "current";
  const fingerprint = JSON.stringify({
    id: opened.manifest.id,
    token: opened.token,
    payloadDigest: opened.manifest.payloadDigest,
    recoveredFromPrevious: opened.recoveredFromPrevious,
    openedGeneration: opened.openedGeneration,
    savedStateDigest,
    auditHash: opened.workspace.audit.at(-1)?.hash ?? "",
    activeRevisionId: opened.workspace.activeRevisionId,
    savedCopyStatus,
    continuityStatus,
    continuityAnchorDigest: opened.continuity?.anchorDigest ?? null,
    evidenceBlocked,
  });
  return { savedCopyStatus, fingerprint, savedWorkspace: opened.workspace, continuityStatus, continuityReason, evidenceBlocked, evidenceReason };
}

function authoritativeFailure(inspection: Inspection, context: OutputFreshnessContext): Error | null {
  if (inspection.savedCopyStatus === "current") {
    if (inspection.evidenceBlocked) return new Error(`Authoritative artifact generation is blocked by unresolved evidence authority. ${inspection.evidenceReason}`);
    if (inspection.continuityStatus === "continuity-corroborated") return null;
    return new Error(`The exact saved generation has not been rechecked against an independently retained current continuity receipt. ${inspection.continuityReason}`);
  }
  if (context.dirty || inspection.savedCopyStatus === "unsaved-changes") {
    return new Error("Save the current workspace before generating this authoritative artifact; the session contains unsaved changes.");
  }
  if (inspection.savedCopyStatus === "stale") {
    return new Error("The named saved workspace changed in another tab, required recovery, or does not exactly match this session. Reload and review it before generating an authoritative artifact.");
  }
  return new Error("Create a named, saved workspace before generating this authoritative artifact.");
}

/**
 * Establish a click-time freshness lease for outward artifacts.
 *
 * Authoritative outputs require a valid session that exactly matches the
 * active, non-recovery named generation. Diagnostic Technical Reports may be
 * emitted from working, unsaved, or stale sessions, but receive an explicit
 * saved-copy status and retain the same race/error checks.
 */
export async function verifyOutputFreshness(
  workspace: Workspace,
  context: OutputFreshnessContext,
  mode: OutputFreshnessMode,
): Promise<OutputFreshnessLease> {
  assertLeaseContext(context, mode);
  if (mode === "authoritative") {
    if (!context.activeLocal) throw new Error("Create a named, saved workspace before generating this authoritative artifact.");
    if (context.dirty) throw new Error("Save the current workspace before generating this authoritative artifact; the session contains unsaved changes.");
    await validateWorkspaceSnapshot(workspace);
    assertLeaseContext(context, mode);
  }

  const initial = await inspectSavedCopy(workspace, context, mode);
  const failure = mode === "authoritative" ? authoritativeFailure(initial, context) : null;
  if (failure) throw failure;
  const artifactWorkspace = mode === "authoritative" ? initial.savedWorkspace! : workspace;
  const artifactWorkspaceDigest = await completeWorkspaceDigest(artifactWorkspace);
  assertLeaseContext(context, mode);

  return {
    savedCopyStatus: initial.savedCopyStatus,
    continuityStatus: initial.continuityStatus,
    continuityReason: initial.continuityReason,
    artifactWorkspace,
    recheck: async () => {
      let currentArtifactWorkspaceDigest: string;
      try {
        currentArtifactWorkspaceDigest = await completeWorkspaceDigest(artifactWorkspace);
      } catch {
        throw new Error("The verified artifact snapshot changed while the artifact was being prepared. No artifact was opened or downloaded.");
      }
      if (currentArtifactWorkspaceDigest !== artifactWorkspaceDigest) {
        throw new Error("The verified artifact snapshot changed while the artifact was being prepared. No artifact was opened or downloaded.");
      }
      assertLeaseContext(context, mode);
      const current = await inspectSavedCopy(workspace, context, mode);
      const currentFailure = mode === "authoritative" ? authoritativeFailure(current, context) : null;
      if (currentFailure || current.fingerprint !== initial.fingerprint || current.savedCopyStatus !== initial.savedCopyStatus) {
        throw new Error("The session or named saved workspace changed while the artifact was being prepared. No artifact was opened or downloaded; retry from the current state.");
      }
      assertLeaseContext(context, mode);
    },
  };
}
