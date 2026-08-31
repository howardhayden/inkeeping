import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  activeRevision,
  assessActiveEvidence,
  applyArchiveImport,
  applyImport,
  checkRecords,
  createIncidentFromFinding,
  createBlankWorkspace,
  createFixtureWorkspace,
  DOCUMENT_OPTIONS,
  makeOperationalDocument,
  MAX_AUDIT_EVENTS,
  prepareLocalWorkspace,
  reviewImport,
  rollbackTo,
  forkWorkspace,
  recordWorkspaceAction,
  recordEvidenceDisposition,
  removeServiceRecord,
  renameWorkspace,
  removeArchiveSchema,
  removeArchiveUnit,
  updateCatalogRecord,
  updateConfig,
  updateIncident,
  upsertArchiveSchema,
  upsertArchiveUnit,
  upsertServiceRecord,
  validateWorkspaceSnapshot,
  type CatalogRecord,
  type CatalogRecordPatch,
  type ImportReview,
  type Incident,
  type LabConfig,
  type DocumentKind,
  type EvidenceDispositionInput,
  type RecordElement,
  type Workspace,
} from "./lab-core";
import {
  clearLocalWorkspaces,
  corroborateLocalContinuityReceipt,
  createLocalWorkspace,
  deleteLocalWorkspace,
  getLocalStorageStatus,
  inspectLocalWorkspaceRecoveryCandidate,
  initializeLocalContinuityAnchor,
  listLocalWorkspaces,
  LocalWorkspaceQuarantineError,
  openLocalWorkspace,
  makeLocalContinuityReceipt,
  reconstructLocalWorkspaceFromQuarantine,
  requestDurableStorage,
  saveLocalWorkspace,
  subscribeLocalWorkspaceChanges,
  type LocalStorageStatus,
  type LocalWorkspaceManifest,
  type LocalWorkspaceRecoveryCandidate,
  type LocalWorkspaceStorageInspection,
  type LocalContinuityAcceptanceInput,
} from "./lab-storage";
import { DATA_FORMAT_RULES, EXCHANGE_FORMATS, RECORD_FORMATS, exchangeFilename, exchangeMime, formatRecords, type ExchangeFormat } from "./record-formats";
import { ARCHIVE_EXCHANGE_FORMATS, ARCHIVE_FIELD_KINDS, ARCHIVE_LEVELS, ARCHIVE_PROFILES, ARCHIVE_RECORD_TYPES, archiveFilename, archiveMime, formatArchive, makeArchiveSchema, normalizeArchiveEditorValues, parseOneValuePerLine, parseOneValuePerLineDraft, reviewArchiveImport, type ArchiveField, type ArchiveImportReview, type ArchiveProfile, type ArchiveRecordType, type ArchiveSchema, type ArchiveUnit, type ArchiveValue, type ArchiveExchangeFormat } from "./archival-schemas";
import { makePublicNoticeHtml, makeTechnicalReportHtml, PUBLIC_NOTICE_FILENAME, REPORT_MIME, TECHNICAL_REPORT_FILENAME } from "./report-documents.ts";
import { SERVICE_AREAS, SERVICE_RECORD_DEFINITIONS, formatServiceRegister, makeServiceRecord, serviceDefinition, serviceFilename, serviceMime, type ServiceArea, type ServiceFieldDefinition, type ServiceRecord, type ServiceValue } from "./service-register";
import { makeWorkspaceBackup, reviewWorkspaceBackup, verifyWorkspaceBackupReviewBinding, workspaceBackupFilename, WORKSPACE_BACKUP_MIME, type WorkspaceBackupReview } from "./workspace-backups";
import { pageContaining, paginate, type PageSlice } from "./list-pagination";
import { verifyOutputFreshness, type OutputFreshnessLease, type OutputFreshnessMode } from "./output-freshness.ts";
import { CONTINUITY_ACKNOWLEDGMENT, type ContinuityVerification } from "./continuity-anchor.ts";
import { canonicalDigest as canonicalEvidenceDigest, EVIDENCE_TIME_BASIS } from "./evidence-authority.ts";

type View = "overview" | "records" | "services" | "archives" | "incidents" | "changes" | "reports";
type OutputGate = { blocked: boolean; reason: string };
type ArtifactFreshnessVerifier = (mode: OutputFreshnessMode) => Promise<OutputFreshnessLease>;
type ActiveLocalSession = { id: string; token: string; savedAt: string; continuity: ContinuityVerification; independentReceipt: string | null };

type DraftGuardValue = {
  register: (id: string, dirty: boolean, reset: () => void) => void;
  confirmDiscard: (message?: string, force?: boolean, excludeId?: string) => boolean;
};

const DraftGuardContext = createContext<DraftGuardValue>({
  register: () => undefined,
  confirmDiscard: () => true,
});

const ArtifactFreshnessContext = createContext<ArtifactFreshnessVerifier>(async () => {
  throw new Error("Artifact freshness verification is unavailable.");
});

function useArtifactFreshness(): ArtifactFreshnessVerifier {
  return useContext(ArtifactFreshnessContext);
}

function useDraftRegistration(dirty: boolean, reset: () => void): string {
  const id = useId();
  const { register } = useContext(DraftGuardContext);
  const resetRef = useRef(reset);
  useEffect(() => { resetRef.current = reset; }, [reset]);
  const resetCurrent = useCallback(() => resetRef.current(), []);
  useLayoutEffect(() => {
    register(id, dirty, resetCurrent);
    return () => register(id, false, resetCurrent);
  }, [dirty, id, register, resetCurrent]);
  return id;
}

function useDraftLossGuard(dirty: boolean, reset: () => void): DraftGuardValue["confirmDiscard"] {
  useDraftRegistration(dirty, reset);
  const { confirmDiscard } = useContext(DraftGuardContext);
  return confirmDiscard;
}

async function readLocalWorkspaceListing(): Promise<{ workspaces: LocalWorkspaceManifest[]; inspection: LocalWorkspaceStorageInspection | null }> {
  try {
    return { workspaces: await listLocalWorkspaces(), inspection: null };
  } catch (error) {
    if (error instanceof LocalWorkspaceQuarantineError) {
      return { workspaces: error.inspection.workspaces, inspection: error.inspection };
    }
    throw error;
  }
}

const views: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "records", label: "Records" },
  { id: "services", label: "Services" },
  { id: "archives", label: "Archives" },
  { id: "incidents", label: "Incidents" },
  { id: "changes", label: "Changes" },
  { id: "reports", label: "Reports" },
];

export function ContinuityLab() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("All");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [localWorkspaces, setLocalWorkspaces] = useState<LocalWorkspaceManifest[]>([]);
  const [storageInspection, setStorageInspection] = useState<LocalWorkspaceStorageInspection | null>(null);
  const [activeLocal, setActiveLocal] = useState<ActiveLocalSession | null>(null);
  const [storageStatus, setStorageStatus] = useState<LocalStorageStatus>({ supported: true, persisted: null, usage: null, quota: null });
  const [dirty, setDirty] = useState(false);
  const [auditState, setAuditState] = useState<"idle" | "valid" | "invalid">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const operationActive = useRef(false);
  const sessionVersion = useRef(0);
  const storageVersion = useRef(0);
  const storageQuarantined = useRef(false);
  const draftEditors = useRef(new Map<string, () => void>());
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const registerDraft = useCallback((id: string, isDirty: boolean, reset: () => void) => {
    if (isDirty) draftEditors.current.set(id, reset);
    else draftEditors.current.delete(id);
    setHasDraftChanges(draftEditors.current.size > 0);
  }, []);
  const confirmDraftDiscard = useCallback((message = "Discard unsaved form changes?", force = false, excludeId?: string) => {
    const entries = [...draftEditors.current.entries()].filter(([id]) => id !== excludeId);
    if (!force && entries.length === 0) return true;
    if (!confirm(message)) return false;
    for (const [id, reset] of entries) {
      draftEditors.current.delete(id);
      reset();
    }
    setHasDraftChanges(draftEditors.current.size > 0);
    return true;
  }, []);
  const draftGuard = useMemo(() => ({ register: registerDraft, confirmDiscard: confirmDraftDiscard }), [confirmDraftDiscard, registerDraft]);
  const applyLocalWorkspaceListing = useCallback((listing: { workspaces: LocalWorkspaceManifest[]; inspection: LocalWorkspaceStorageInspection | null }) => {
    storageVersion.current += 1;
    storageQuarantined.current = Boolean(listing.inspection?.quarantine.length);
    setLocalWorkspaces(listing.workspaces);
    setStorageInspection(listing.inspection);
  }, []);

  useEffect(() => {
    let active = true;
    createBlankWorkspace()
      .then((next) => {
        if (!active) return;
        setWorkspace(next);
        setSelectedRecordId(activeRevision(next).records[0]?.id ?? "");
        setSelectedIncidentId(next.incidents[0]?.id ?? "");
      })
      .catch(() => setNotice("Workspace could not be initialized."));
    readLocalWorkspaceListing().then((listing) => {
      if (!active) return;
      applyLocalWorkspaceListing(listing);
      if (listing.inspection) setNotice("Browser-local storage requires inspection before ordinary saves can continue.");
    }).catch(() => { if (active) setNotice("Browser workspace storage is unavailable."); });
    getLocalStorageStatus().then((status) => { if (active) setStorageStatus(status); }).catch(() => { if (active) setStorageStatus({ supported: false, persisted: null, usage: null, quota: null }); });
    const unsubscribe = subscribeLocalWorkspaceChanges(() => {
      readLocalWorkspaceListing().then((listing) => {
        if (!active) return;
        applyLocalWorkspaceListing(listing);
      }).catch(() => undefined);
    });
    return () => { active = false; unsubscribe(); };
  }, [applyLocalWorkspaceListing]);

  useEffect(() => {
    if (!workspace) return;
    let active = true;
    validateWorkspaceSnapshot(workspace)
      .then(() => { if (active) setAuditState("valid"); })
      .catch(() => { if (active) setAuditState("invalid"); });
    return () => { active = false; };
  }, [workspace]);

  useEffect(() => {
    if (!dirty && !hasDraftChanges) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [dirty, hasDraftChanges]);

  useEffect(() => {
    const readView = () => {
      const candidate = new URLSearchParams(location.search).get("view");
      if (!views.some((item) => item.id === candidate) || candidate === view) return;
      if (confirmDraftDiscard()) {
        setView(candidate as View);
        requestAnimationFrame(() => mainRef.current?.focus());
        return;
      }
      const restored = new URL(location.href);
      restored.searchParams.set("view", view);
      history.pushState(null, "", restored);
    };
    readView();
    addEventListener("popstate", readView);
    return () => removeEventListener("popstate", readView);
  }, [confirmDraftDiscard, view]);

  const revision = workspace ? activeRevision(workspace) : null;
  const records = useMemo(() => revision?.records ?? [], [revision]);
  const findings = useMemo(() => checkRecords(records), [records]);
  const formats = useMemo(() => ["All", ...new Set(records.map((record) => record.format))], [records]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRecords = useMemo(() => records.filter((record) => {
    const matchesFormat = format === "All" || record.format === format;
    const haystack = [record.id, record.title, ...record.creators, ...record.identifiers.map((item) => item.value)].join(" ").toLowerCase();
    return matchesFormat && (!normalizedQuery || haystack.includes(normalizedQuery));
  }), [format, normalizedQuery, records]);
  const selectedRecord = visibleRecords.find((record) => record.id === selectedRecordId) ?? visibleRecords[0];
  const selectedIncident = workspace?.incidents.find((incident) => incident.id === selectedIncidentId) ?? workspace?.incidents[0];
  const activeManifest = activeLocal ? localWorkspaces.find((item) => item.id === activeLocal.id) : undefined;
  const activeLocalStale = Boolean(activeLocal && (!activeManifest || activeManifest.token !== activeLocal.token));
  const blockingFindings = findings.filter((finding) => finding.severity === "error" || finding.severity === "warning");
  const sampleContaminated = Boolean(workspace && (workspace.incidents.some((incident) => incident.synthetic) || records.some((record) => record.source.format === "fixture")));
  const activeEvidence = workspace ? assessActiveEvidence(workspace) : null;
  const outputGate: OutputGate = sampleContaminated
    ? { blocked: true, reason: "Ordinary compatibility and operational outputs are blocked because this workspace contains Sample data. Use the Technical Report or a plaintext workspace backup for review, or begin blank for production work." }
    : !activeLocal
      ? { blocked: true, reason: "Ordinary outward artifacts require a named, saved workspace so the exact saved generation can be rechecked when the file is created." }
      : activeLocal.continuity.status !== "continuity-corroborated" || !activeLocal.independentReceipt
        ? { blocked: true, reason: `Ordinary outward artifacts require this exact saved generation to be rechecked against an independently retained current receipt. ${activeLocal.continuity.reason}` }
      : activeEvidence?.blocked
        ? { blocked: true, reason: `Ordinary outward artifacts are blocked by active unverified or unattributed content. ${activeEvidence.reason} Use the Technical Report or workspace backup for review; no local parser or continuity checkpoint can grant this content authority.` }
      : busy
        ? { blocked: true, reason: "Ordinary outward artifacts wait until the current workspace operation finishes." }
      : hasDraftChanges
        ? { blocked: true, reason: "Save or discard every visible form draft before generating ordinary outward artifacts; drafts are not part of the named saved generation." }
      : dirty
        ? { blocked: true, reason: "Save the current workspace before generating ordinary outward artifacts so the exact saved generation can be rechecked." }
        : activeLocalStale
          ? { blocked: true, reason: "Outputs are blocked because the named saved workspace changed in another tab. Reload it or deliberately duplicate this session before generating artifacts." }
          : storageInspection
            ? { blocked: true, reason: "Ordinary outward artifacts are blocked while browser-local storage is quarantined for inspection." }
            : auditState !== "valid"
              ? { blocked: true, reason: auditState === "invalid" ? "Outputs are blocked because full workspace validation failed." : "Outputs wait for the full workspace validation check to finish." }
              : blockingFindings.length > 0
                ? { blocked: true, reason: "Compatibility and operational outputs are blocked while error or warning metadata findings remain. Informational duplicate notices remain visible in the Technical Report but do not permanently disable export." }
                : { blocked: false, reason: "" };

  const verifyOutwardArtifact = useCallback<ArtifactFreshnessVerifier>((mode) => {
    if (!workspace) return Promise.reject(new Error("The workspace is unavailable."));
    const expectedSessionVersion = sessionVersion.current;
    const expectedStorageVersion = storageVersion.current;
    return verifyOutputFreshness(workspace, {
      activeLocal,
      dirty,
      expectedSessionVersion,
      getSessionVersion: () => sessionVersion.current,
      getPendingDrafts: () => draftEditors.current.size > 0,
      getOperationInProgress: () => operationActive.current,
      expectedStorageVersion,
      getStorageVersion: () => storageVersion.current,
      getStorageQuarantined: () => storageQuarantined.current,
      openWorkspace: (id) => openLocalWorkspace(id, activeLocal?.independentReceipt ?? null),
    }, mode);
  }, [activeLocal, dirty, workspace]);

  function changeView(next: View) {
    if (next === view) return true;
    if (!confirmDraftDiscard()) return false;
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.pushState(null, "", url);
    requestAnimationFrame(() => mainRef.current?.focus());
    return true;
  }

  function replaceSession(next: Workspace, local: ActiveLocalSession | null, hasUnsavedChanges: boolean) {
    sessionVersion.current += 1;
    setWorkspace(next);
    setActiveLocal(local);
    setDirty(hasUnsavedChanges);
    setSelectedRecordId(activeRevision(next).records[0]?.id ?? "");
    setSelectedIncidentId(next.incidents[0]?.id ?? "");
    setReview(null);
    setAuditState("idle");
  }

  function updateSession(next: Workspace, message: string) {
    sessionVersion.current += 1;
    setWorkspace(next);
    setDirty(true);
    setAuditState("idle");
    setNotice(message);
  }

  async function refreshLocalWorkspaces() {
    const listing = await readLocalWorkspaceListing();
    applyLocalWorkspaceListing(listing);
    setStorageStatus(await getLocalStorageStatus());
  }

  async function runBusy(task: () => Promise<void>) {
    if (operationActive.current) {
      setNotice("Another operation is still finishing.");
      return false;
    }
    operationActive.current = true;
    setBusy(true);
    try {
      await task();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The operation failed safely.";
      if (/changed in another tab/i.test(message)) await refreshLocalWorkspaces().catch(() => undefined);
      setNotice(message);
      return false;
    } finally {
      operationActive.current = false;
      setBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setReview(null);
    await runBusy(async () => {
      const nextReview = await reviewImport(file);
      setReview(nextReview);
    });
  }

  async function applyReviewedImport(disposition: EvidenceDispositionInput) {
    if (!workspace || !review) return;
    await runBusy(async () => {
      const next = await applyImport(workspace, review, disposition);
      updateSession(next, next.activeRevisionId === workspace.activeRevisionId
        ? "Import rejected without changing trusted records. Review the source, provenance, limits, and identifier conflicts."
        : "Reviewed records applied as unverified evidence in one revision; the operator claim does not establish truth or authority.");
      setReview(null);
      if (fileRef.current) fileRef.current.value = "";
      setImportOpen(false);
    });
  }

  async function resetWorkspace(sample: boolean) {
    const sessionHasChanges = dirty || hasWorkspaceContent(workspace);
    if (!confirmDraftDiscard(sample ? "Replace the current working copy with Sample data? Current changes will be lost." : "Start a blank working copy? Current changes will be lost.", sessionHasChanges)) return;
    await runBusy(async () => {
      const next = sample ? await createFixtureWorkspace() : await createBlankWorkspace();
      replaceSession(next, null, sample);
      if (sample) {
        setImportOpen(false);
        changeView("overview");
      }
      setNotice(sample ? "Sample data opened." : "");
    });
  }

  async function createNamedWorkspace(name: string) {
    if (!workspace) return;
    return runBusy(async () => {
      const next = await prepareLocalWorkspace(workspace, name);
      const manifest = await createLocalWorkspace(next);
      replaceSession(next, { id: manifest.id, token: manifest.token, savedAt: manifest.savedAt, continuity: { status: "unanchored", reason: "Explicitly accept a local continuity baseline before ordinary outward use.", anchorDigest: null }, independentReceipt: null }, false);
      await refreshLocalWorkspaces();
      setNotice(`Created and saved “${manifest.name}” in this browser.`);
    });
  }

  async function saveCurrentWorkspace() {
    if (!workspace || !activeLocal) throw new Error("Create a local workspace before saving this session.");
    if (activeLocalStale) { setNotice("This workspace changed in another tab. Reload its saved version or duplicate this session under a new name."); return false; }
    return runBusy(async () => {
      const atCapacity = workspace.audit.length >= MAX_AUDIT_EVENTS;
      const next = atCapacity ? workspace : await recordWorkspaceAction(workspace, "Save local workspace");
      const manifest = await saveLocalWorkspace(activeLocal.id, next, activeLocal.token);
      const reopened = await openLocalWorkspace(activeLocal.id);
      const continuity = reopened.token === manifest.token
        ? reopened.continuity
        : { status: "continuity-failure" as const, reason: "The named workspace changed again immediately after this save. Reload it before continuity comparison.", anchorDigest: null };
      replaceSession(next, { id: manifest.id, token: manifest.token, savedAt: manifest.savedAt, continuity, independentReceipt: null }, false);
      await refreshLocalWorkspaces();
      setNotice(atCapacity
        ? `Changes saved to “${manifest.name}”. Independent receipt corroboration was cleared. Its audit ledger is full; create a new successor workspace/lineage and explicitly accept a new baseline.`
        : `Changes saved to “${manifest.name}”. Independent receipt corroboration was cleared; retain and compare a fresh receipt for this generation before ordinary output.`);
    });
  }

  async function acceptContinuityBaseline(input: LocalContinuityAcceptanceInput) {
    if (!activeLocal || !workspace || dirty || activeLocalStale) throw new Error("Open the exact clean named saved workspace before accepting a continuity baseline.");
    return runBusy(async () => {
      const continuity = await initializeLocalContinuityAnchor(activeLocal.id, activeLocal.token, input);
      setActiveLocal({ ...activeLocal, continuity, independentReceipt: null });
      setNotice("Local continuity baseline accepted and bound to this saved generation. This does not establish authenticity, identity, custody, completeness, authority, or trusted time. Download, separately retain, and compare its receipt before ordinary output.");
    });
  }

  async function downloadContinuityReceipt() {
    if (!activeLocal) throw new Error("Open a named saved workspace before downloading a continuity receipt.");
    return runBusy(async () => {
      const text = await makeLocalContinuityReceipt(activeLocal.id, activeLocal.token);
      downloadText(`${workspace?.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "workspace"}.in-keeping-continuity-receipt.json`, text, "application/json");
      setNotice("Continuity receipt downloaded. Retain it independently and compare this exact file before ordinary output; a receipt kept only beside the workspace cannot detect coherent replacement of both.");
    });
  }

  async function compareContinuityReceipt(file: File) {
    if (!activeLocal || dirty || activeLocalStale) throw new Error("Open the exact clean named saved workspace before comparing an independent receipt.");
    return runBusy(async () => {
      if (file.size < 1 || file.size > 16 * 1024) throw new Error("Continuity receipt must be nonempty JSON no larger than 16 KiB.");
      const serialized = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const continuity = await corroborateLocalContinuityReceipt(activeLocal.id, activeLocal.token, serialized);
      setActiveLocal({ ...activeLocal, continuity, independentReceipt: serialized });
      setNotice("The independently supplied receipt corroborates this exact saved checkpoint. This still does not establish authenticity, evidence truth, identity, custody, authority, completeness, or trusted time.");
    });
  }

  async function openNamedWorkspace(id: string) {
    if (!confirmDraftDiscard("Open another local workspace? Unsaved changes in this session will be lost.", dirty)) return false;
    return runBusy(async () => {
      const opened = await openLocalWorkspace(id);
      if (!opened.recoveredFromPrevious) {
        replaceSession(opened.workspace, { id, token: opened.token, savedAt: opened.manifest.savedAt, continuity: opened.continuity, independentReceipt: null }, false);
        await refreshLocalWorkspaces();
        setNotice(`Opened “${opened.manifest.name}”. Receipt corroboration is not restored from browser state; compare the exact current receipt before ordinary output.`);
        return;
      }
      replaceSession(opened.workspace, null, true);
      await refreshLocalWorkspaces();
      setNotice(`Opened the previous verified generation of “${opened.manifest.name}” as an unsaved recovery copy. Stored generations were not changed. Download a backup or create a new workspace before continuing.`);
    });
  }

  async function renameNamedWorkspace(id: string, name: string) {
    if (activeLocal?.id === id && activeLocalStale) { setNotice("This workspace changed in another tab. Reload it before renaming."); return false; }
    if (activeLocal?.id === id && dirty && !confirm("Rename this workspace and save its current unsaved changes?")) return false;
    return runBusy(async () => {
      const opened = activeLocal?.id === id ? null : await openLocalWorkspace(id);
      const source = activeLocal?.id === id && workspace ? workspace : opened!.workspace;
      const expectedToken = activeLocal?.id === id ? activeLocal.token : opened!.token;
      const recovered = Boolean(opened?.recoveredFromPrevious);
      if (recovered) throw new Error("This saved workspace requires recovery. Open its verified recovery copy, then create a new workspace with the required name.");
      const next = await renameWorkspace(source, name, "Rename workspace");
      const manifest = await saveLocalWorkspace(id, next, expectedToken);
      if (activeLocal?.id === id) {
        const reopened = await openLocalWorkspace(id);
        const continuity = reopened.token === manifest.token
          ? reopened.continuity
          : { status: "continuity-failure" as const, reason: "The named workspace changed again immediately after this rename. Reload it before continuity comparison.", anchorDigest: null };
        replaceSession(next, { id, token: manifest.token, savedAt: manifest.savedAt, continuity, independentReceipt: null }, false);
      }
      await refreshLocalWorkspaces();
      setNotice(`Renamed the local workspace to “${manifest.name}”. Receipt corroboration was cleared; retain and compare a fresh receipt for this generation before ordinary output.`);
    });
  }

  async function duplicateNamedWorkspace(id: string, name: string) {
    if (activeLocal?.id === id && dirty && !confirm("Duplicate this workspace including its current unsaved changes?")) return false;
    return runBusy(async () => {
      const source = activeLocal?.id === id && workspace ? workspace : (await openLocalWorkspace(id)).workspace;
      const next = await forkWorkspace(source, name);
      const manifest = await createLocalWorkspace(next);
      await refreshLocalWorkspaces();
      setNotice(`Created “${manifest.name}” as an independent local workspace.`);
    });
  }

  async function removeNamedWorkspace(id: string) {
    const manifest = localWorkspaces.find((item) => item.id === id);
    if (activeLocal?.id === id && activeLocalStale) { setNotice("This workspace changed in another tab. Reload it before deleting its saved version."); return false; }
    if (!manifest || !confirm(`Delete “${manifest.name}” from this browser? Use “Download selected saved backup” first if this saved version must be retained.`)) return false;
    return runBusy(async () => {
      await deleteLocalWorkspace(id, activeLocal?.id === id ? activeLocal.token : manifest.token);
      if (activeLocal?.id === id && workspace) {
        sessionVersion.current += 1;
        setActiveLocal(null);
        setDirty(true);
      }
      await refreshLocalWorkspaces();
      setNotice(`Deleted “${manifest.name}” from browser-local storage. Exported files, if any, were not affected.`);
    });
  }

  async function forgetAll() {
    if (!confirm("Delete every saved local workspace from this browser? The current session will remain open but will no longer be saved locally. Exported files will not be affected.")) return;
    await runBusy(async () => {
      await clearLocalWorkspaces();
      sessionVersion.current += 1;
      setActiveLocal(null);
      setDirty(true);
      await refreshLocalWorkspaces();
      setNotice("All saved workspaces were deleted. The open session was left unchanged.");
    });
  }

  async function openBackup(reviewed: WorkspaceBackupReview, disposition: EvidenceDispositionInput) {
    if (!workspace) {
      setNotice("The current workspace is unavailable; review the backup again after initialization completes.");
      return false;
    }
    if (!reviewed.workspace || reviewed.blocked || !await verifyWorkspaceBackupReviewBinding(reviewed)) {
      setNotice("The workspace-backup review binding is missing or changed. Review the source file again before opening it.");
      return false;
    }
    const evidence = {
      source: { kind: "workspace-backup" as const, filename: reviewed.filename, format: "workspace-backup-v2", bytes: reviewed.bytes, sha256: reviewed.digest },
      review: { structuralStatus: "passed" as const, canonicalPayloadSha256: await canonicalEvidenceDigest(reviewed.workspace), parserProfile: "workspace-backup-v2" },
      scope: { kind: "workspace" as const, entityIds: [reviewed.workspace.activeRevisionId] },
    };
    if (disposition.decision !== "admit-unverified") {
      return runBusy(async () => {
        const next = await recordEvidenceDisposition(
          workspace,
          evidence,
          disposition,
          disposition.decision === "withdraw" ? "Withdraw reviewed workspace backup" : "Reject reviewed workspace backup",
          {
            outcome: "not-applied",
            reason: disposition.decision === "withdraw" ? "operator-withdrew" : "operator-rejected",
            detail: disposition.decision === "withdraw" ? "The reviewed backup was withdrawn and did not replace the current session." : "The reviewed backup was rejected and did not replace the current session.",
            resultingRevisionId: null,
            resultingRevisionDigest: null,
          },
        );
        updateSession(next, `The reviewed backup was ${disposition.decision === "withdraw" ? "withdrawn" : "rejected"}; its exact disposition and non-application outcome remain in this workspace.`);
      });
    }
    if (!confirmDraftDiscard("Open this workspace backup? Current changes will be lost.", dirty)) return false;
    const expectedSessionVersion = sessionVersion.current;
    return runBusy(async () => {
      if (reviewed.workspace!.audit.length >= MAX_AUDIT_EVENTS) throw new Error("The reviewed backup audit ledger is full. Preserve it for diagnosis and create an explicitly accepted successor before continuing.");
      const next = await recordEvidenceDisposition(reviewed.workspace!, evidence, disposition, "Open workspace backup as unverified evidence", {
        outcome: "applied",
        reason: "workspace-backup-opened",
        detail: "The reviewed backup replaced the working session as unverified evidence; it did not become authoritative.",
        resultingRevisionId: reviewed.workspace!.activeRevisionId,
        resultingRevisionDigest: activeRevision(reviewed.workspace!).digest,
      });
      if (sessionVersion.current !== expectedSessionVersion) throw new Error("The current session changed while the backup was opening. Review the backup again before replacing it.");
      replaceSession(next, null, true);
      setNotice(`Opened “${next.name}” as explicitly unverified evidence. Create a local workspace and separately accept a continuity baseline to retain and use it in this browser.`);
    });
  }

  if (!workspace || !revision) {
    return <main className="loading-state"><p role="status">{notice || "Loading workspace…"}</p></main>;
  }

  return (
    <ArtifactFreshnessContext.Provider value={verifyOutwardArtifact}>
    <DraftGuardContext.Provider value={draftGuard}>
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>

      <header className="app-header">
        <div className="brand-block">
          <BrandMark />
          <div><strong>IN KEEPING</strong><span>Library systems continuity workbench</span></div>
        </div>
        <div className="header-actions">
          <button ref={importButtonRef} className="secondary-button" type="button" onClick={() => setImportOpen((open) => !open)} aria-expanded={importOpen} aria-controls="import-panel">Import</button>
        </div>
      </header>

      <nav className="primary-nav" aria-label="Workspace">
        {views.map((item, index) => (
          <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => changeView(item.id)}>
            <span>{String(index + 1).padStart(2, "0")}</span>{item.label}
          </button>
        ))}
      </nav>

      {importOpen && (
        <section id="import-panel" className="import-panel" aria-labelledby="import-title" aria-busy={busy}>
          <div className="panel-heading">
            <div><h2 id="import-title">Review import</h2><p>Exchange files ≤5 MiB · *.in-keeping.json ≤32 MiB</p></div>
            <button className="icon-button" type="button" onClick={() => { setImportOpen(false); importButtonRef.current?.focus(); }} aria-label="Close import panel">×</button>
          </div>
          <div className="import-source"><label className="file-field"><span>Choose library data</span><input ref={fileRef} type="file" aria-describedby="import-formats" accept=".xml,.marcxml,.json,.jsonld,.ris,.bib,.bibtex,.csv,.tsv,.mrk,.mrc.txt,application/xml,text/xml,application/json,application/ld+json,text/plain,text/csv,text/tab-separated-values" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void handleFile(file); }} disabled={busy} /></label><button className="secondary-button" type="button" onClick={() => resetWorkspace(true)} disabled={busy}>Sample data</button></div>
          <details className="import-formats"><summary id="import-formats">Supported formats</summary><p>MARCXML, MARC mnemonic, Dublin Core, MODS, IN KEEPING JSON, CSL-JSON, JSON-LD, RIS, BibTeX, CSV, and TSV.</p></details>
          <ReviewAnnouncements label="Import review" busy={busy} summary={review?.summary ?? ""} blocked={review?.blocked ?? false} />
          {review && <ImportReviewCard key={`${review.digest}:${review.filename}`} review={review} onApply={applyReviewedImport} busy={busy} />}
        </section>
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{notice}</div>
      {notice && <div className="notice-bar"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss message" onClick={() => setNotice("")}>×</button></div>}
      {activeLocalStale && <div className="workspace-stale" role="alert"><strong>Saved version changed</strong><span>Another tab changed or removed the named saved workspace. Saving and outward outputs are blocked; open Reports to reload the saved version or deliberately duplicate this session. The current session remains available for a conflict-recovery backup.</span></div>}

      <main ref={mainRef} id="main" className="main-area" tabIndex={-1}>
        {view === "overview" && (
          <Overview workspace={workspace} findings={findings} onOpenIncident={(id) => { setSelectedIncidentId(id); changeView("incidents"); }} onOpenFinding={(recordId) => { if (recordId) setSelectedRecordId(recordId); changeView("records"); }} />
        )}
        {view === "records" && (
          <RecordsView
            records={visibleRecords}
            allCount={records.length}
            findings={findings}
            selected={selectedRecord}
            selectedId={selectedRecord?.id ?? ""}
            query={query}
            format={format}
            formats={formats}
            outputGate={outputGate}
            onQuery={setQuery}
            onFormat={setFormat}
            onSelect={setSelectedRecordId}
            onUpdate={async (recordId, patch) => {
              await runBusy(async () => {
                updateSession(await updateCatalogRecord(workspace, recordId, patch), "Record correction saved as a reversible revision.");
              });
            }}
            onCreateIncident={async (finding) => {
              await runBusy(async () => {
                const next = await createIncidentFromFinding(workspace, finding);
                const created = next.incidents.at(-1);
                updateSession(next, "Incident created.");
                if (created) setSelectedIncidentId(created.id);
                changeView("incidents");
              });
            }}
          />
        )}
        {view === "services" && (
          <ServicesView
            records={revision.serviceRecords ?? []}
            busy={busy}
            outputGate={outputGate}
            onSave={async (record) => runBusy(async () => updateSession(await upsertServiceRecord(workspace, record), "Service register record saved as a reversible revision."))}
            onRemove={async (id) => runBusy(async () => updateSession(await removeServiceRecord(workspace, id), "Service register record removed in a reversible revision."))}
          />
        )}
        {view === "incidents" && (
          <IncidentsView
            incidents={workspace.incidents}
            records={records}
            selected={selectedIncident}
            busy={busy}
            onSelect={setSelectedIncidentId}
            onUpdate={(id, patch) => runBusy(async () => {
                updateSession(await updateIncident(workspace, id, patch), "Incident updated.");
              })}
          />
        )}
        {view === "archives" && (
          <ArchivesView
            workspace={workspace}
            busy={busy}
            outputGate={outputGate}
            onSaveSchema={async (schema) => runBusy(async () => updateSession(await upsertArchiveSchema(workspace, schema), "Archival schema saved as a reversible revision."))}
            onRemoveSchema={async (id) => runBusy(async () => updateSession(await removeArchiveSchema(workspace, id), "Archival schema removed in a reversible revision."))}
            onSaveUnit={async (unit) => runBusy(async () => updateSession(await upsertArchiveUnit(workspace, unit), "Archival record saved as a reversible revision."))}
            onRemoveUnit={async (id) => runBusy(async () => updateSession(await removeArchiveUnit(workspace, id), "Archival record removed in a reversible revision."))}
            onApplyImport={async (source, disposition) => runBusy(async () => {
              const next = await applyArchiveImport(workspace, source, disposition);
              updateSession(next, next.activeRevisionId === workspace.activeRevisionId
                ? "The archival evidence disposition was retained, but destination validation prevented application."
                : "Reviewed archival records applied as unverified evidence in one revision.");
            })}
          />
        )}
        {view === "changes" && (
          <ChangesView
            key={revision.id}
            workspace={workspace}
            config={revision.config}
            busy={busy}
            onSave={async (config) => {
              await runBusy(async () => {
                updateSession(await updateConfig(workspace, config), "Configuration saved as a reversible revision.");
              });
            }}
            onRollback={async (id) => {
              await runBusy(async () => {
                updateSession(await rollbackTo(workspace, id), "Prior state restored as a new revision; history preserved.");
              });
            }}
          />
        )}
        {view === "reports" && (
          <ReportsView
            workspace={workspace}
            auditState={auditState}
            outputGate={outputGate}
            busy={busy}
            localWorkspaces={localWorkspaces}
            activeLocal={activeLocal}
            dirty={dirty}
            storageStatus={storageStatus}
            storageInspection={storageInspection}
            onCreate={createNamedWorkspace}
            onSave={saveCurrentWorkspace}
            onAcceptContinuity={acceptContinuityBaseline}
            onDownloadContinuityReceipt={downloadContinuityReceipt}
            onCompareContinuityReceipt={compareContinuityReceipt}
            onOpen={openNamedWorkspace}
            onRename={renameNamedWorkspace}
            onDuplicate={duplicateNamedWorkspace}
            onDelete={removeNamedWorkspace}
            onForget={forgetAll}
            onOpenBackup={openBackup}
            onRequestDurable={async () => {
              const granted = await requestDurableStorage();
              setStorageStatus(await getLocalStorageStatus());
              setNotice(granted ? "This browser granted durable storage for local workspaces." : "Durable storage was not granted; downloaded workspace backups remain the recovery boundary.");
            }}
            onNotice={setNotice}
            onReset={() => resetWorkspace(false)}
            onVerify={async () => {
              try {
                await validateWorkspaceSnapshot(workspace);
                setAuditState("valid");
                setNotice("Full workspace structure and internal consistency verified. This does not prove authenticity, authorship, custody, completeness, authority, or trusted time.");
              } catch {
                setAuditState("invalid");
                setNotice("Workspace integrity mismatch detected.");
              }
            }}
            onRefreshStorage={refreshLocalWorkspaces}
          />
        )}
      </main>
    </div>
    </DraftGuardContext.Provider>
    </ArtifactFreshnessContext.Provider>
  );
}

function Overview({
  workspace,
  findings,
  onOpenIncident,
  onOpenFinding,
}: {
  workspace: Workspace;
  findings: ReturnType<typeof checkRecords>;
  onOpenIncident: (id: string) => void;
  onOpenFinding: (recordId?: string) => void;
}) {
  const [findingPage, setFindingPage] = useState(0);
  const [incidentPage, setIncidentPage] = useState(0);
  const revision = activeRevision(workspace);
  const openIncidents = workspace.incidents.filter((incident) => incident.state !== "resolved");
  const blocking = findings.filter((finding) => finding.severity === "error");
  const findingPagination = paginate(findings, findingPage, 8);
  const incidentPagination = paginate(openIncidents, incidentPage, 8);
  return (
    <section aria-labelledby="overview-title">
      <div className="page-heading"><div><p className="eyebrow">Current workspace</p><h1 id="overview-title">Overview</h1></div><div className="summary-line"><span><b>{revision.records.length}</b> catalog</span><span><b>{revision.serviceRecords?.length ?? 0}</b> service</span><span><b>{revision.archiveUnits?.length ?? 0}</b> archival</span><span><b>{findings.length}</b> findings</span><span><b>{openIncidents.length}</b> incidents</span></div></div>
      <div className="overview-grid">
        <section className="list-section" aria-labelledby="attention-title">
          <div className="section-heading"><h2 id="attention-title">Needs attention</h2><span>{blocking.length} blocking</span></div>
          {findings.length === 0 ? <Empty label="No metadata findings." /> : findingPagination.items.map((finding) => (
            <button className="plain-row" type="button" key={finding.id} onClick={() => onOpenFinding(finding.recordId)}>
              <span className={`severity-mark ${finding.severity}`} aria-hidden="true" />
              <span><strong>{finding.label}</strong><small>{finding.recordId ?? "Workspace"} · {finding.code}</small></span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          <ListPager pagination={findingPagination} onPage={setFindingPage} />
        </section>
        <section className="list-section" aria-labelledby="incident-title">
          <div className="section-heading"><h2 id="incident-title">Incidents</h2><span>{openIncidents.length} open</span></div>
          {openIncidents.length === 0 ? <Empty label="No open incidents." /> : incidentPagination.items.map((incident) => (
            <button className="plain-row" type="button" key={incident.id} onClick={() => onOpenIncident(incident.id)}>
              <span className={`severity-mark ${incident.severity}`} aria-hidden="true" />
              <span><strong>{incident.title}</strong><small>{incident.id} · {incident.service}</small></span>
              <span className="row-state">{incident.state}</span>
            </button>
          ))}
          <ListPager pagination={incidentPagination} onPage={setIncidentPage} />
        </section>
      </div>
      <details className="system-chain"><summary>System chain</summary><pre tabIndex={0} role="region" aria-label="Metadata flows through discovery, access, and fulfillment">{`source → normalize → discovery → link / request\n                         ↓          ↓\n                    auth / proxy  fulfillment`}</pre></details>
    </section>
  );
}

function ServicesView({ records, busy, outputGate, onSave, onRemove }: { records: ServiceRecord[]; busy: boolean; outputGate: OutputGate; onSave: (record: ServiceRecord) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }) {
  const [area, setArea] = useState<ServiceArea | "all">("all");
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const [newKind, setNewKind] = useState(SERVICE_RECORD_DEFINITIONS[0].kind);
  const [draft, setDraft] = useState<ServiceRecord | null>(null);
  const [page, setPage] = useState(0);
  const [outputError, setOutputError] = useState("");
  const verifyFreshness = useArtifactFreshness();
  const { confirmDiscard } = useContext(DraftGuardContext);
  const visible = area === "all" ? records : records.filter((record) => record.area === area);
  const selected = draft ?? visible.find((record) => record.id === selectedId) ?? visible[0] ?? null;
  const requestedPagination = paginate(visible, page);
  const effectivePage = !draft && selected && !requestedPagination.items.some((record) => record.id === selected.id)
    ? pageContaining(visible, (record) => record.id === selected.id)
    : requestedPagination.page;
  const pagination = paginate(visible, effectivePage);
  const selectedDefinition = selected ? serviceDefinition(selected.kind) : null;

  function beginRecord() {
    if (!confirmDiscard()) return;
    const record = makeServiceRecord(newKind, makeLocalId("SRV"));
    setDraft(record);
    setSelectedId(record.id);
    setArea(record.area);
    setPage(0);
  }

  async function deliverServiceRegister(format: "service-json" | "service-csv") {
    setOutputError("");
    try {
      if (outputGate.blocked) throw new Error(outputGate.reason);
      const lease = await verifyFreshness("authoritative");
      const text = formatServiceRegister(activeRevision(lease.artifactWorkspace).serviceRecords ?? [], format);
      await lease.recheck();
      downloadText(serviceFilename("in-keeping", format), text, serviceMime(format));
    } catch (error) {
      setOutputError(error instanceof Error ? error.message : "The service register could not be exported safely.");
    }
  }

  return (
    <section aria-labelledby="services-title">
      <div className="page-heading">
        <div><p className="eyebrow">Cross-department registers</p><h1 id="services-title">Services</h1></div>
        <div className="service-export-actions">
          <button type="button" className="secondary-button" disabled={outputGate.blocked} aria-describedby={outputGate.blocked || outputError ? "service-output-blocked" : undefined} onClick={() => { void deliverServiceRegister("service-json"); }}>Export JSON</button>
          <button type="button" className="secondary-button" disabled={outputGate.blocked} aria-describedby={outputGate.blocked || outputError ? "service-output-blocked" : undefined} onClick={() => { void deliverServiceRegister("service-csv"); }}>Export CSV</button>
        </div>
      </div>
      {(outputGate.blocked || outputError) && <p id="service-output-blocked" className="field-error" role={outputError ? "alert" : undefined}>{outputError || outputGate.reason}</p>}
      <div className="service-coverage" aria-label="Service register coverage">
        <button type="button" className={area === "all" ? "active" : ""} aria-pressed={area === "all"} onClick={() => { if (area === "all" || !confirmDiscard()) return; setArea("all"); setDraft(null); setPage(0); }}><strong>{records.length}</strong><span>All registers</span></button>
        {SERVICE_AREAS.map((item) => {
          const count = records.filter((record) => record.area === item.id).length;
          return <button key={item.id} type="button" className={area === item.id ? "active" : ""} aria-pressed={area === item.id} title={item.remit} onClick={() => { if (area === item.id || !confirmDiscard()) return; setArea(item.id); setDraft(null); setPage(0); }}><strong>{count}</strong><span>{item.label}</span></button>;
        })}
      </div>
      <div className={`service-layout${records.length === 0 && !draft ? " is-empty" : ""}`}>
        <aside className="service-index" aria-label="Service register records">
          <div className="section-heading"><h2>Records</h2><span>{visible.length}</span></div>
          <div className="service-record-list">
            {visible.length ? pagination.items.map((record) => {
              const definition = serviceDefinition(record.kind);
              return <button key={record.id} type="button" className={selected?.id === record.id && !draft ? "service-row selected" : "service-row"} aria-pressed={selected?.id === record.id && !draft} onClick={() => { if (!draft && selected?.id === record.id || !confirmDiscard()) return; setDraft(null); setSelectedId(record.id); }}><span><strong>{record.title}</strong><small>{definition.label} · {record.state}</small></span><span className={`sensitivity ${record.sensitivity}`}>{record.sensitivity}</span></button>;
            }) : <Empty label="No records in this register." />}
            <ListPager pagination={pagination} onPage={(nextPage) => { if (!confirmDiscard()) return; const next = paginate(visible, nextPage); setPage(next.page); setDraft(null); setSelectedId(next.items[0]?.id ?? ""); }} />
          </div>
          <div className="service-new-record">
            <label><span>Record type</span><select value={newKind} onChange={(event) => setNewKind(event.target.value)}>{SERVICE_AREAS.map((item) => <optgroup key={item.id} label={item.label}>{SERVICE_RECORD_DEFINITIONS.filter((definition) => definition.area === item.id).map((definition) => <option key={definition.kind} value={definition.kind}>{definition.label}</option>)}</optgroup>)}</select></label>
            <button type="button" disabled={busy} onClick={beginRecord}>New record</button>
          </div>
        </aside>
        <div className="service-stage">
          {selected && selectedDefinition ? (
            <ServiceRecordEditor
              key={`${selected.id}-${selected.updatedAt}-${draft ? "draft" : "stored"}`}
              record={selected}
              definition={selectedDefinition}
              busy={busy}
              isNew={Boolean(draft)}
              onCancel={() => setDraft(null)}
              onSave={async (record) => { if (await onSave(record)) { const nextRecords = [...records.filter((item) => item.id !== record.id), record].filter((item) => item.area === record.area); setDraft(null); setSelectedId(record.id); setArea(record.area); setPage(pageContaining(nextRecords, (item) => item.id === record.id)); } }}
              onRemove={async (id) => { if (confirm("Remove this service record? The change will remain recoverable through revision history.") && await onRemove(id)) { setDraft(null); setSelectedId(""); } }}
            />
          ) : <div className="service-empty"><p>Choose a register record or create one from a defined workflow type.</p><small>These are local operational registers and preflight records—not replacements for an ILS, ERM, preservation repository, or collections-management system.</small></div>}
        </div>
      </div>
    </section>
  );
}

function ServiceRecordEditor({ record, definition, busy, isNew, onCancel, onSave, onRemove }: { record: ServiceRecord; definition: ReturnType<typeof serviceDefinition>; busy: boolean; isNew: boolean; onCancel: () => void; onSave: (record: ServiceRecord) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [draft, setDraft] = useState<ServiceRecord>(() => structuredClone(record));
  const [error, setError] = useState("");
  const confirmDiscard = useDraftLossGuard(JSON.stringify(draft) !== JSON.stringify(record), () => setDraft(structuredClone(record)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setError("");
      await onSave(normalizeServiceDraft(draft, definition.fields));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The service record could not be validated.");
    }
  }

  return (
    <form className="service-editor" onSubmit={submit} aria-describedby={error ? "service-editor-error" : undefined}>
      <header className="service-editor-heading"><div><p className="eyebrow">{SERVICE_AREAS.find((item) => item.id === definition.area)?.label}</p><h2>{definition.label}</h2><p>{definition.purpose}</p></div><span>{isNew ? "New" : record.id}</span></header>
      <div className="field-pair"><label><span>Record title</span><input value={draft.title} maxLength={500} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>Owner role <small>Prefer a role or unit to a person.</small></span><input value={draft.ownerRole} maxLength={160} onChange={(event) => setDraft({ ...draft, ownerRole: event.target.value })} /></label></div>
      <div className="field-pair"><label><span>System of record</span><input value={draft.system} maxLength={256} onChange={(event) => setDraft({ ...draft, system: event.target.value })} /></label><label><span>Workflow state</span><select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value as ServiceRecord["state"] })}><option value="active">Active</option><option value="review">Review</option><option value="due">Due</option><option value="blocked">Blocked</option><option value="retired">Retired</option></select></label></div>
      <label><span>Sensitivity <small>Restricted fields remain local but still require institutional handling.</small></span><select value={draft.sensitivity} onChange={(event) => setDraft({ ...draft, sensitivity: event.target.value as ServiceRecord["sensitivity"] })}><option value="public">Public</option><option value="internal">Internal</option><option value="restricted">Restricted</option></select></label>
      <div className="service-fields">
        {definition.fields.map((field) => <ServiceFieldInput key={field.id} field={field} value={draft.values[field.id]} onChange={(value) => setDraft({ ...draft, values: { ...draft.values, [field.id]: value } })} />)}
      </div>
      {error && <p id="service-editor-error" className="field-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="submit" disabled={busy}>Save revision</button>{isNew ? <button type="button" className="secondary-button" onClick={() => { if (confirmDiscard()) onCancel(); }}>Cancel</button> : <button type="button" className="danger-button" disabled={busy} onClick={() => onRemove(record.id)}>Remove</button>}</div>
    </form>
  );
}

function ServiceFieldInput({ field, value, onChange }: { field: ServiceFieldDefinition; value: ServiceValue | undefined; onChange: (value: ServiceValue) => void }) {
  const text = Array.isArray(value) ? value.join("\n") : typeof value === "string" || typeof value === "number" ? String(value) : "";
  const label = <span>{field.label}{field.required ? " · required" : ""}<small>{field.definition}{field.repeatable ? " One value per line." : ""}</small></span>;
  if (field.kind === "boolean") return <label className="checkbox-field service-boolean"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /> <span>{field.label}<small>{field.definition}</small></span></label>;
  if (field.kind === "controlled-term") return <label>{label}<select value={text} required={field.required} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{field.vocabulary?.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>;
  if (field.kind === "long-text" || field.repeatable) return <label>{label}<textarea value={text} rows={field.kind === "long-text" ? 4 : 3} required={field.required} onChange={(event) => onChange(event.target.value)} /></label>;
  const type = field.kind === "integer" || field.kind === "decimal" ? "number" : field.kind === "date" ? "date" : field.kind === "date-time" ? "datetime-local" : field.kind === "uri" ? "url" : "text";
  const displayValue = field.kind === "date-time" && text ? text.replace(/Z$/, "").slice(0, 16) : text;
  return <label>{label}<input type={type} step={field.kind === "integer" ? "1" : field.kind === "decimal" ? "any" : undefined} value={displayValue} required={field.required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function normalizeServiceDraft(record: ServiceRecord, fields: ServiceFieldDefinition[]): ServiceRecord {
  const values: Record<string, ServiceValue> = {};
  for (const field of fields) {
    const raw = record.values[field.id];
    if (field.kind === "boolean") { values[field.id] = raw === true; continue; }
    const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : Array.isArray(raw) ? raw.map(String).join("\n") : "";
    if (!text) continue;
    if (field.repeatable) values[field.id] = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    else if (field.kind === "integer") values[field.id] = Number.parseInt(text, 10);
    else if (field.kind === "decimal") values[field.id] = Number(text);
    else if (field.kind === "date-time") values[field.id] = new Date(text).toISOString();
    else values[field.id] = text;
  }
  return { ...record, title: record.title.trim(), ownerRole: record.ownerRole.trim(), system: record.system.trim(), values, updatedAt: new Date().toISOString() };
}

function ArchivesView({ workspace, busy, outputGate, onSaveSchema, onRemoveSchema, onSaveUnit, onRemoveUnit, onApplyImport }: { workspace: Workspace; busy: boolean; outputGate: OutputGate; onSaveSchema: (schema: ArchiveSchema) => Promise<boolean>; onRemoveSchema: (id: string) => Promise<boolean>; onSaveUnit: (unit: ArchiveUnit) => Promise<boolean>; onRemoveUnit: (id: string) => Promise<boolean>; onApplyImport: (source: ArchiveImportReview, disposition: EvidenceDispositionInput) => Promise<boolean> }) {
  const revision = activeRevision(workspace);
  const schemas = revision.archiveSchemas ?? [];
  const units = revision.archiveUnits ?? [];
  const [selectedId, setSelectedId] = useState(schemas[0]?.id ?? "");
  const [profile, setProfile] = useState<ArchiveProfile>("dacs");
  const [name, setName] = useState("");
  const [archiveReview, setArchiveReview] = useState<ArchiveImportReview | null>(null);
  const [importError, setImportError] = useState("");
  const newSchemaDraftId = useDraftRegistration(Boolean(name.trim()) || profile !== "dacs", () => { setName(""); setProfile("dacs"); });
  const { confirmDiscard } = useContext(DraftGuardContext);
  const selected = schemas.find((item) => item.id === selectedId) ?? schemas[0];
  return (
    <section aria-labelledby="archives-title">
      <div className="page-heading">
        <div><p className="eyebrow">Hierarchical description</p><h1 id="archives-title">Archives</h1></div>
        <span className="count-label">{schemas.length} schemas · {units.length} records</span>
      </div>
      <div className="archive-layout">
        <aside className="schema-index" aria-label="Archival schemas">
          <div className="section-heading"><h2>Schemas</h2><span>versioned</span></div>
          {schemas.map((schema, index) => {
            const isSelected = selected?.id === schema.id;
            return (
              <button key={schema.id} type="button" className={isSelected ? "schema-row selected" : "schema-row"} aria-pressed={isSelected} onClick={() => { if (!isSelected && confirmDiscard()) setSelectedId(schema.id); }}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{schema.name}</strong><small>v{schema.version} · {schema.profile}</small>
              </button>
            );
          })}
          <form className="new-schema" onSubmit={async (event) => { event.preventDefault(); if (!name.trim()) return; const schema = makeArchiveSchema(profile, name, makeLocalId("SCHEMA")); if (!confirmDiscard("Create this schema and discard other unsaved form changes?", false, newSchemaDraftId)) return; if (await onSaveSchema(schema)) { setSelectedId(schema.id); setName(""); setProfile("dacs"); } }}>
            <h3>New schema</h3>
            <label><span>Basis</span><select value={profile} onChange={(event) => setProfile(event.target.value as ArchiveProfile)}>{ARCHIVE_PROFILES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
            <button type="submit" disabled={busy}>Create</button>
          </form>
          <div className="archive-import">
            <h3>Import</h3>
            <label className="file-field archive-file-field">
              <span>Choose archival data</span>
              <input
                type="file"
                accept=".xml,.ead,.csv,.json,application/xml,text/xml,text/csv,application/json"
                disabled={busy}
                aria-describedby={importError ? "archive-import-error" : undefined}
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setImportError("");
                  setArchiveReview(null);
                  try {
                    setArchiveReview(await reviewArchiveImport(file));
                  } catch (error) {
                    setImportError(error instanceof Error ? error.message : "The archive could not be reviewed safely.");
                  } finally {
                    input.value = "";
                  }
                }}
              />
            </label>
            {importError && <p id="archive-import-error" className="field-error" role="alert">{importError}</p>}
            {archiveReview && <div className={archiveReview.blocked ? "archive-review blocked" : "archive-review ready"} role={archiveReview.blocked ? "alert" : "status"} aria-atomic="true"><strong>{archiveReview.format}</strong><span>{archiveReview.summary}</span>{!archiveReview.blocked && archiveReview.schema && <EvidenceDispositionForm busy={busy} onSubmit={async (disposition) => { if (disposition.decision === "admit-unverified" && !confirmDiscard()) return; if (await onApplyImport(archiveReview, disposition)) { if (disposition.decision === "admit-unverified") setSelectedId(archiveReview.schema!.id); setArchiveReview(null); } }} />}</div>}
          </div>
        </aside>
        <div className="schema-stage">
          {selected ? <SchemaEditor key={`${selected.id}-${selected.version}`} schema={selected} units={units.filter((item) => item.schemaId === selected.id)} allUnits={units} busy={busy} outputGate={outputGate} onSave={onSaveSchema} onRemove={onRemoveSchema} onSaveUnit={onSaveUnit} onRemoveUnit={onRemoveUnit} /> : <div className="archive-empty"><p>No archival schema yet.</p><small>Create a local profile or import an EAD, ArchivesSpace, AtoM, or schema-package file.</small></div>}
        </div>
      </div>
    </section>
  );
}

function SchemaEditor({ schema, units, allUnits, busy, outputGate, onSave, onRemove, onSaveUnit, onRemoveUnit }: { schema: ArchiveSchema; units: ArchiveUnit[]; allUnits: ArchiveUnit[]; busy: boolean; outputGate: OutputGate; onSave: (schema: ArchiveSchema) => Promise<boolean>; onRemove: (id: string) => Promise<boolean>; onSaveUnit: (unit: ArchiveUnit) => Promise<boolean>; onRemoveUnit: (id: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(structuredClone(schema));
  const [exchange, setExchange] = useState<ArchiveExchangeFormat>("ead4");
  const [exportError, setExportError] = useState("");
  const verifyFreshness = useArtifactFreshness();
  const exportErrorId = useId().replace(/:/g, "");
  useDraftLossGuard(JSON.stringify(draft) !== JSON.stringify(schema), () => setDraft(structuredClone(schema)));
  const setField = (index: number, patch: Partial<ArchiveField>) => setDraft({ ...draft, fields: draft.fields.map((item, position) => position === index ? { ...item, ...patch } : item) });
  const addField = () => setDraft({ ...draft, fields: [...draft.fields, { id: `field_${draft.fields.length + 1}`, label: "New field", definition: "Define this archival value.", kind: "text", required: false, repeatable: false, vocabulary: [], mappings: { ead: "", archivesSpace: "", atom: "", ric: "" } }] });
  return (
    <article className="schema-editor">
      <header className="schema-heading">
        <div><p className="eyebrow">{schema.id} · v{schema.version}</p><h2>{schema.name}</h2></div>
        <button className="danger-button" type="button" disabled={busy || units.length > 0} onClick={() => { if (confirm(`Remove the schema “${schema.name}”?`)) void onRemove(schema.id); }}>Remove</button>
      </header>
      <form className="schema-definition" onSubmit={(event) => { event.preventDefault(); void onSave({ ...draft, recordType: draft.recordType ?? "description", fields: draft.fields.map((item) => ({ ...item, vocabulary: parseOneValuePerLine(item.vocabulary.join("\n")) })), version: schema.version + 1, updatedAt: new Date().toISOString() }); }}>
        <div className="field-pair">
          <label><span>Schema name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} required /></label>
          <label><span>Standards basis</span><select value={draft.profile} onChange={(event) => setDraft({ ...draft, profile: event.target.value as ArchiveProfile })}>{ARCHIVE_PROFILES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <label><span>Record type</span><select value={draft.recordType ?? "description"} onChange={(event) => setDraft({ ...draft, recordType: event.target.value as ArchiveRecordType })}>{ARCHIVE_RECORD_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Purpose</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} maxLength={1000} /></label>
        <div className="schema-field-head"><h3>Fields</h3><button className="secondary-button" type="button" onClick={addField}>Add field</button></div>
        <div className="schema-fields">
          {draft.fields.map((item, index) => (
            <details key={`${item.id}-${index}`} className="schema-field">
              <summary><code>{item.id}</code><span>{item.label}</span><small>{item.kind}{item.repeatable ? " · many" : ""}{item.required ? " · required" : ""}</small></summary>
              <div className="schema-field-body">
                <div className="field-pair">
                  <label><span>Machine key</span><input value={item.id} onChange={(event) => setField(index, { id: event.target.value })} maxLength={128} required /></label>
                  <label><span>Visible label</span><input value={item.label} onChange={(event) => setField(index, { label: event.target.value })} maxLength={120} required /></label>
                </div>
                <label><span>Definition</span><textarea value={item.definition} onChange={(event) => setField(index, { definition: event.target.value })} rows={2} maxLength={500} /></label>
                <div className="field-pair">
                  <label><span>Data type</span><select value={item.kind} onChange={(event) => setField(index, { kind: event.target.value as ArchiveField["kind"] })}>{ARCHIVE_FIELD_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
                  <label><span>Vocabulary · one term per line</span><textarea value={item.vocabulary.join("\n")} onChange={(event) => setField(index, { vocabulary: parseOneValuePerLineDraft(event.target.value) })} rows={2} /></label>
                </div>
                <fieldset><legend>Cardinality</legend><label><input type="checkbox" checked={item.required} onChange={(event) => setField(index, { required: event.target.checked })} /> Required</label><label><input type="checkbox" checked={item.repeatable} onChange={(event) => setField(index, { repeatable: event.target.checked })} /> Repeatable</label></fieldset>
                <details className="mapping-fields">
                  <summary>Crosswalk references</summary>
                  <div className="field-pair">
                    <label><span>EAD element</span><input value={item.mappings.ead} onChange={(event) => setField(index, { mappings: { ...item.mappings, ead: event.target.value } })} /></label>
                    <label><span>ArchivesSpace column</span><input value={item.mappings.archivesSpace} onChange={(event) => setField(index, { mappings: { ...item.mappings, archivesSpace: event.target.value } })} /></label>
                    <label><span>AtoM column</span><input value={item.mappings.atom} onChange={(event) => setField(index, { mappings: { ...item.mappings, atom: event.target.value } })} /></label>
                    <label><span>RiC property</span><input value={item.mappings.ric} onChange={(event) => setField(index, { mappings: { ...item.mappings, ric: event.target.value } })} /></label>
                  </div>
                </details>
                <button className="text-button" type="button" disabled={item.id === "title"} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, position) => position !== index) })}>Remove field</button>
              </div>
            </details>
          ))}
        </div>
        <div className="schema-actions">
          <button type="submit" disabled={busy}>Save version {schema.version + 1}</button>
          <div className="archive-export-group">
            <div className="archive-export">
              <label><span>Format</span><select value={exchange} onChange={(event) => { setExchange(event.target.value as ArchiveExchangeFormat); setExportError(""); }}>{ARCHIVE_EXCHANGE_FORMATS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <button
                className="secondary-button"
                type="button"
                disabled={busy || outputGate.blocked}
                aria-describedby={exportError ? exportErrorId : outputGate.blocked ? `${exportErrorId}-blocked` : undefined}
                onClick={async () => {
                  setExportError("");
                  try {
                    if (outputGate.blocked) throw new Error(outputGate.reason);
                    const lease = await verifyFreshness("authoritative");
                    const artifactRevision = activeRevision(lease.artifactWorkspace);
                    const artifactSchema = (artifactRevision.archiveSchemas ?? []).find((item) => item.id === schema.id);
                    if (!artifactSchema) throw new Error("The selected archival schema is not present in the verified saved generation.");
                    const artifactUnits = (artifactRevision.archiveUnits ?? []).filter((item) => item.schemaId === artifactSchema.id);
                    const text = formatArchive(artifactSchema, artifactUnits, exchange);
                    await lease.recheck();
                    downloadText(archiveFilename(artifactSchema, exchange), text, archiveMime(exchange));
                  } catch (error) {
                    setExportError(error instanceof Error ? error.message : "The archive could not be exported safely.");
                  }
                }}
              >Export</button>
            </div>
            {outputGate.blocked && <p id={`${exportErrorId}-blocked`} className="field-error">{outputGate.reason}</p>}
            {exportError && <p id={exportErrorId} className="field-error" role="alert">{exportError}</p>}
          </div>
        </div>
      </form>
      <ArchiveRecords schema={schema} units={units} allUnits={allUnits} busy={busy} onSave={onSaveUnit} onRemove={onRemoveUnit} />
    </article>
  );
}

function ArchiveRecords({ schema, units, allUnits, busy, onSave, onRemove }: { schema: ArchiveSchema; units: ArchiveUnit[]; allUnits: ArchiveUnit[]; busy: boolean; onSave: (unit: ArchiveUnit) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }) {
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState(0);
  const { confirmDiscard } = useContext(DraftGuardContext);
  const selected = units.find((item) => item.id === selectedId);
  const ordered = orderArchiveUnits(units);
  const requestedPagination = paginate(ordered, page);
  const effectivePage = selected && !requestedPagination.items.some((item) => item.unit.id === selected.id)
    ? pageContaining(ordered, (item) => item.unit.id === selected.id)
    : requestedPagination.page;
  const pagination = paginate(ordered, effectivePage);
  const descriptive = (schema.recordType ?? "description") === "description";
  return (
    <section className="archive-records" aria-labelledby="archive-records-title">
      <div className="section-heading"><h3 id="archive-records-title">Records</h3><button className="secondary-button" type="button" onClick={() => { if (confirmDiscard()) setSelectedId(""); }}>New record</button></div>
      <div className={ordered.length ? "archive-record-layout" : "archive-record-layout is-empty"}>
        <div className="archive-tree" role="group" aria-label={descriptive ? "Archival record hierarchy" : `${schema.recordType} records`}>
          {ordered.length ? pagination.items.map(({ unit, depth }) => {
            const isSelected = selected?.id === unit.id;
            return (
              <button type="button" key={unit.id} className={`${isSelected ? "archive-unit selected" : "archive-unit"} archive-depth-${descriptive ? Math.min(depth, 12) : 0}`} aria-pressed={isSelected} onClick={() => { if (!isSelected && confirmDiscard()) setSelectedId(unit.id); }}>
                <code aria-hidden="true">{descriptive && depth ? "└─" : "●"}</code>
                <span><strong>{displayArchiveRecordLabel(unit, schema)}</strong><small>{unit.id} · {descriptive ? unit.level : schema.recordType}</small></span>
              </button>
            );
          }) : <Empty label="No archival records." />}
          <ListPager pagination={pagination} onPage={(nextPage) => { if (!confirmDiscard()) return; const next = paginate(ordered, nextPage); setPage(next.page); setSelectedId(next.items[0]?.unit.id ?? ""); }} />
        </div>
        <ArchiveUnitEditor key={selected?.id ?? `new-${schema.version}`} schema={schema} unit={selected} units={units} allUnits={allUnits} busy={busy} onSave={async (unit) => { const saved = await onSave(unit); if (saved) { const nextUnits = orderArchiveUnits([...units.filter((item) => item.id !== unit.id), unit]); setSelectedId(unit.id); setPage(pageContaining(nextUnits, (item) => item.unit.id === unit.id)); } return saved; }} onRemove={async (id) => { const removed = await onRemove(id); if (removed) setSelectedId(""); return removed; }} />
      </div>
    </section>
  );
}

function ArchiveUnitEditor({ schema, unit, units, allUnits, busy, onSave, onRemove }: { schema: ArchiveSchema; unit?: ArchiveUnit; units: ArchiveUnit[]; allUnits: ArchiveUnit[]; busy: boolean; onSave: (unit: ArchiveUnit) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }) {
  const descriptive = (schema.recordType ?? "description") === "description";
  const initialLevel = unit?.level ?? (descriptive ? "collection" : "other");
  const [id, setId] = useState(unit?.id ?? "");
  const [parentId, setParentId] = useState(unit?.parentId ?? "");
  const [level, setLevel] = useState<ArchiveUnit["level"]>(initialLevel);
  const [values, setValues] = useState<Record<string, ArchiveValue>>(structuredClone(unit?.values ?? {}));
  const [published, setPublished] = useState(unit?.published === true);
  const [language, setLanguage] = useState(unit?.language ?? "en");
  const [parentQuery, setParentQuery] = useState("");
  const parentResultsId = useId().replace(/:/g, "");
  const matchingParents = useMemo(() => {
    const query = parentQuery.trim().toLocaleLowerCase("en-US");
    return units.filter((item) => item.id !== unit?.id && (!query || `${item.id} ${displayArchiveRecordLabel(item, schema)}`.toLocaleLowerCase("en-US").includes(query)));
  }, [parentQuery, schema, unit?.id, units]);
  const selectedParent = units.find((item) => item.id === parentId && item.id !== unit?.id);
  const shownParents = selectedParent && !matchingParents.slice(0, 100).some((item) => item.id === selectedParent.id)
    ? [selectedParent, ...matchingParents.filter((item) => item.id !== selectedParent.id).slice(0, 99)]
    : matchingParents.slice(0, 100);
  useDraftLossGuard(
    id !== (unit?.id ?? "")
      || parentId !== (unit?.parentId ?? "")
      || level !== initialLevel
      || JSON.stringify(values) !== JSON.stringify(unit?.values ?? {})
      || published !== (unit?.published === true)
      || language !== (unit?.language ?? "en"),
    () => {
      setId(unit?.id ?? "");
      setParentId(unit?.parentId ?? "");
      setLevel(initialLevel);
      setValues(structuredClone(unit?.values ?? {}));
      setPublished(unit?.published === true);
      setLanguage(unit?.language ?? "en");
      setParentQuery("");
    },
  );
  const changeValue = (field: ArchiveField, raw: string | boolean) => {
    let value: ArchiveValue = raw;
    if (field.repeatable && typeof raw === "string") {
      value = parseOneValuePerLineDraft(raw);
    } else if ((field.kind === "integer" || field.kind === "decimal") && typeof raw === "string") value = raw === "" ? "" : Number(raw);
    setValues({ ...values, [field.id]: value });
  };
  return (
    <form className="archive-unit-editor" onSubmit={(event) => { event.preventDefault(); const now = new Date().toISOString(); void onSave({ id, schemaId: schema.id, schemaVersion: schema.version, parentId: descriptive ? parentId || null : null, level: descriptive ? level : "other", values: normalizeArchiveEditorValues(schema, values), published, language, createdAt: unit?.createdAt ?? now, updatedAt: now }); }}>
      <div className="unit-editor-heading"><h4>{unit ? "Edit record" : "New record"}</h4>{unit && <button className="text-button" type="button" disabled={busy || allUnits.some((item) => item.parentId === unit.id)} onClick={() => { if (confirm(`Remove archival record “${displayArchiveRecordLabel(unit, schema)}”?`)) void onRemove(unit.id); }}>Remove</button>}</div>
      {descriptive ? (
        <>
          <div className="field-pair"><label><span>Record ID</span><input value={id} onChange={(event) => setId(event.target.value)} maxLength={128} required disabled={Boolean(unit)} /></label><label><span>Level</span><select value={level} onChange={(event) => setLevel(event.target.value as ArchiveUnit["level"])}>{ARCHIVE_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <div className="parent-picker">
            <label><span>Find parent</span><input type="search" value={parentQuery} onChange={(event) => setParentQuery(event.target.value)} aria-controls={parentResultsId} placeholder="ID or title" /></label>
            <label><span>Parent</span><select id={parentResultsId} value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">None</option>{shownParents.map((item) => <option key={item.id} value={item.id}>{item.id} · {displayArchiveRecordLabel(item, schema)}</option>)}</select></label>
            <small role="status" aria-live="polite">{matchingParents.length > 100 ? `Showing 100 of ${matchingParents.length} matches.` : `${matchingParents.length} ${matchingParents.length === 1 ? "match" : "matches"}.`}</small>
          </div>
        </>
      ) : <div className="field-pair"><label><span>Record ID</span><input value={id} onChange={(event) => setId(event.target.value)} maxLength={128} required disabled={Boolean(unit)} /></label><div className="read-only-field"><span>Record type</span><strong>{schema.recordType}</strong></div></div>}
      <div className="field-pair"><label><span>Description language · BCP 47</span><input value={language} onChange={(event) => setLanguage(event.target.value)} pattern="[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*" maxLength={64} required /></label><label className="checkbox-field"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span>Published<small>Off by default. Exported records remain private or draft.</small></span></label></div>
      {schema.fields.map((field) => <ArchiveValueField key={field.id} field={field} value={values[field.id]} onChange={(value) => changeValue(field, value)} />)}
      <button type="submit" disabled={busy}>Save record</button>
    </form>
  );
}

function ArchiveValueField({ field, value, onChange }: { field: ArchiveField; value: ArchiveValue | undefined; onChange: (value: string | boolean) => void }) {
  if (field.kind === "boolean" && !field.repeatable) return <label className="checkbox-field"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{field.label}{field.required ? " · required" : ""}<small>{field.definition}</small></span></label>;
  const text = Array.isArray(value) ? value.join("\n") : value === undefined ? "" : String(value); const common = { value: text, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value), required: field.required, "aria-describedby": `archive-help-${field.id}` };
  const numeric = field.kind === "integer" || field.kind === "decimal";
  return <label><span>{field.label}{field.required ? " · required" : ""}<small id={`archive-help-${field.id}`}>{field.definition}</small></span>{field.kind === "controlled-term" && field.vocabulary.length && !field.repeatable ? <select {...common}><option value="">Select</option>{field.vocabulary.map((item) => <option key={item}>{item}</option>)}</select> : field.kind === "long-text" || field.repeatable ? <textarea {...common} rows={field.kind === "long-text" ? 4 : 2} placeholder={field.repeatable ? field.kind === "boolean" ? "true or false · one per line" : "One value per line" : undefined} /> : <input {...common} type={numeric ? "number" : field.kind === "uri" ? "url" : field.kind === "date" ? "date" : "text"} step={field.kind === "decimal" ? "any" : undefined} placeholder={field.kind === "date-time" ? "2026-08-20T12:00:00.000Z" : field.kind === "checksum" ? "sha256:…" : undefined} />}</label>;
}

function orderArchiveUnits(units: ArchiveUnit[]): { unit: ArchiveUnit; depth: number }[] {
  const children = new Map<string | null, ArchiveUnit[]>();
  for (const unit of units) {
    const siblings = children.get(unit.parentId);
    if (siblings) siblings.push(unit);
    else children.set(unit.parentId, [unit]);
  }
  const ordered: { unit: ArchiveUnit; depth: number }[] = [];
  const visited = new Set<string>();
  const stack = (children.get(null) ?? []).slice().reverse().map((unit) => ({ unit, depth: 0 }));
  while (stack.length) {
    const entry = stack.pop()!;
    if (visited.has(entry.unit.id)) continue;
    visited.add(entry.unit.id); ordered.push(entry);
    const nested = children.get(entry.unit.id) ?? [];
    for (let index = nested.length - 1; index >= 0; index -= 1) stack.push({ unit: nested[index], depth: Math.min(entry.depth + 1, 32) });
  }
  for (const unit of units) if (!visited.has(unit.id)) ordered.push({ unit, depth: 0 });
  return ordered;
}
function displayArchiveValue(value: ArchiveValue | undefined): string { return Array.isArray(value) ? value.join("; ") : value === undefined ? "" : String(value); }
function displayArchiveRecordLabel(unit: ArchiveUnit, schema: ArchiveSchema): string {
  const preferred = schema.fields.find((field) => ["title", "name", "authorized_form", "identifier"].includes(field.id)) ?? schema.fields.find((field) => field.kind === "text" || field.kind === "identifier");
  return displayArchiveValue(preferred ? unit.values[preferred.id] : undefined) || unit.id;
}
function makeLocalId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; }

function RecordsView({
  records,
  allCount,
  findings,
  selected,
  selectedId,
  query,
  format,
  formats,
  outputGate,
  onQuery,
  onFormat,
  onSelect,
  onUpdate,
  onCreateIncident,
}: {
  records: CatalogRecord[];
  allCount: number;
  findings: ReturnType<typeof checkRecords>;
  selected?: CatalogRecord;
  selectedId: string;
  query: string;
  format: string;
  formats: string[];
  outputGate: OutputGate;
  onQuery: (value: string) => void;
  onFormat: (value: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (recordId: string, patch: CatalogRecordPatch) => Promise<void>;
  onCreateIncident: (finding: ReturnType<typeof checkRecords>[number]) => Promise<void>;
}) {
  const [page, setPage] = useState(() => pageContaining(records, (record) => record.id === selectedId));
  const { confirmDiscard } = useContext(DraftGuardContext);
  const requestedPagination = paginate(records, page);
  const effectivePage = selectedId && !requestedPagination.items.some((record) => record.id === selectedId)
    ? pageContaining(records, (record) => record.id === selectedId)
    : requestedPagination.page;
  const pagination = paginate(records, effectivePage);
  const selectedFindings = findings.filter((finding) => finding.recordId === selected?.id);
  return (
    <section aria-labelledby="records-title">
      <div className="page-heading"><div><p className="eyebrow">Catalog and discovery</p><h1 id="records-title">Records</h1></div><span className="count-label" role="status">{records.length} of {allCount}</span></div>
      <div className="filter-bar">
        <label><span>Search</span><input type="search" value={query} onChange={(event) => { if (!confirmDiscard()) return; setPage(0); onQuery(event.target.value); }} placeholder="Title, creator, identifier" /></label>
        <label><span>Format</span><select value={format} onChange={(event) => { if (!confirmDiscard()) return; setPage(0); onFormat(event.target.value); }}>{formats.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className={records.length ? "split-view" : "split-view is-empty"}>
        <div className="record-list" aria-label="Record results">
          {records.length === 0 ? <Empty label="No matching records." /> : pagination.items.map((record) => {
            const recordFindings = findings.filter((finding) => finding.recordId === record.id);
            return (
              <button className={record.id === selectedId ? "record-row selected" : "record-row"} type="button" key={record.id} onClick={() => { if (record.id !== selectedId && confirmDiscard()) onSelect(record.id); }} aria-pressed={record.id === selectedId}>
                <span><strong>{record.title || "Untitled record"}</strong><small>{record.id} · {record.creators.join(", ") || "No creator"}</small></span>
                <span><small>{record.format}</small>{recordFindings.length > 0 && <b className="finding-count">{recordFindings.length}</b>}</span>
              </button>
            );
          })}
          <ListPager pagination={pagination} onPage={(nextPage) => { if (!confirmDiscard()) return; const next = paginate(records, nextPage); setPage(next.page); if (next.items[0]) onSelect(next.items[0].id); }} />
        </div>
        {selected ? <RecordInspector key={selected.id} record={selected} findings={selectedFindings} outputGate={outputGate} onCreateIncident={onCreateIncident} onUpdate={onUpdate} /> : <aside className="inspector"><Empty label="Select a record." /></aside>}
      </div>
    </section>
  );
}

function RecordInspector({ record, findings, outputGate, onCreateIncident, onUpdate }: { record: CatalogRecord; findings: ReturnType<typeof checkRecords>; outputGate: OutputGate; onCreateIncident: (finding: ReturnType<typeof checkRecords>[number]) => Promise<void>; onUpdate: (recordId: string, patch: CatalogRecordPatch) => Promise<void> }) {
  const [exchangeFormat, setExchangeFormat] = useState<ExchangeFormat>("dublin-core");
  const [outputError, setOutputError] = useState("");
  const verifyFreshness = useArtifactFreshness();
  const { confirmDiscard } = useContext(DraftGuardContext);
  const formatted = outputGate.blocked ? "" : formatRecords([record], exchangeFormat);
  async function deliverRecord() {
    setOutputError("");
    try {
      if (outputGate.blocked) throw new Error(outputGate.reason);
      const lease = await verifyFreshness("authoritative");
      const artifactRecord = activeRevision(lease.artifactWorkspace).records.find((item) => item.id === record.id);
      if (!artifactRecord) throw new Error("The selected catalog record is not present in the verified saved generation.");
      const text = formatRecords([artifactRecord], exchangeFormat);
      await lease.recheck();
      downloadText(exchangeFilename(artifactRecord.id, exchangeFormat), text, exchangeMime(exchangeFormat));
    } catch (error) {
      setOutputError(error instanceof Error ? error.message : "The catalog record could not be exported safely.");
    }
  }
  return (
    <aside className="inspector" aria-labelledby="record-detail-title">
      <p className="eyebrow">{record.id}</p><h2 id="record-detail-title">Record comparison</h2>
      <RecordComparison record={record} />
      <div className="record-tools"><label><span>Output format</span><select value={exchangeFormat} onChange={(event) => { setExchangeFormat(event.target.value as ExchangeFormat); setOutputError(""); }}>{EXCHANGE_FORMATS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button className="secondary-button" type="button" disabled={outputGate.blocked} aria-describedby={outputGate.blocked || outputError ? "record-output-blocked" : undefined} aria-label={`Download record ${record.id} as ${EXCHANGE_FORMATS.find((item) => item.value === exchangeFormat)?.label ?? exchangeFormat}`} onClick={() => { void deliverRecord(); }}>Download</button></div>
      {(outputGate.blocked || outputError) ? <p id="record-output-blocked" className="field-error" role={outputError ? "alert" : undefined}>{outputError || outputGate.reason}</p> : <details className="format-preview"><summary>Formatted record</summary><pre tabIndex={0} role="region" aria-label={`${exchangeFormat} formatted record`}>{formatted}</pre></details>}
      <RecordCorrection record={record} onUpdate={onUpdate} />
      <section className="inspector-section"><h3>Detected issues</h3>{findings.length ? findings.map((finding) => <div className="finding-item" key={finding.id}><span className={`severity-mark ${finding.severity}`} aria-hidden="true" /><span><strong>{finding.code}</strong><small>{finding.label}</small><button className="finding-action" type="button" onClick={() => { if (confirmDiscard()) void onCreateIncident(finding); }}>Create incident</button></span></div>) : <span className="muted">None</span>}</section>
    </aside>
  );
}

function RecordCorrection({ record, onUpdate }: { record: CatalogRecord; onUpdate: (recordId: string, patch: CatalogRecordPatch) => Promise<void> }) {
  const baseline = { title: record.title, creators: record.creators.join("\n"), contributors: record.contributors?.join("\n") ?? "", format: record.format, availability: record.availability, edition: record.edition, location: record.location, links: record.links.join("\n"), requestable: record.requestable, publicVisible: record.publicVisible, suppressed: record.suppressed };
  const [draft, setDraft] = useState(baseline);
  useDraftLossGuard(JSON.stringify(draft) !== JSON.stringify(baseline), () => setDraft(baseline));
  const list = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return <details className="correction-form"><summary>Create correction revision</summary><form onSubmit={(event) => { event.preventDefault(); onUpdate(record.id, { ...draft, creators: list(draft.creators), contributors: list(draft.contributors), links: list(draft.links) }); }}><label><span>Title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={1024} required /></label><div className="field-pair"><label><span>Creators · one per line</span><textarea value={draft.creators} onChange={(event) => setDraft({ ...draft, creators: event.target.value })} rows={3} /></label><label><span>Contributors · one per line</span><textarea value={draft.contributors} onChange={(event) => setDraft({ ...draft, contributors: event.target.value })} rows={3} /></label></div><div className="field-pair"><label><span>Resource type</span><select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as CatalogRecord["format"] })}>{RECORD_FORMATS.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Availability</span><select value={draft.availability} onChange={(event) => setDraft({ ...draft, availability: event.target.value as CatalogRecord["availability"] })}><option>Available</option><option>Online</option><option>Unavailable</option><option>Check availability</option></select></label></div><div className="field-pair"><label><span>Edition</span><input value={draft.edition} onChange={(event) => setDraft({ ...draft, edition: event.target.value })} maxLength={512} /></label><label><span>Location</span><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} maxLength={512} /></label></div><label><span>Access URLs · one per line</span><textarea value={draft.links} onChange={(event) => setDraft({ ...draft, links: event.target.value })} rows={3} /></label><fieldset><legend>Access state</legend><label><input type="checkbox" checked={draft.requestable} onChange={(event) => setDraft({ ...draft, requestable: event.target.checked })} /> Requestable</label><label><input type="checkbox" checked={draft.publicVisible} onChange={(event) => setDraft({ ...draft, publicVisible: event.target.checked })} /> Publicly visible</label><label><input type="checkbox" checked={draft.suppressed} onChange={(event) => setDraft({ ...draft, suppressed: event.target.checked })} /> Suppressed</label></fieldset><button type="submit">Save revision</button></form></details>;
}

function IncidentUpdateForm({ incident, busy, onUpdate }: { incident: Incident; busy: boolean; onUpdate: (id: string, patch: Partial<Pick<Incident, "state" | "ownerRole" | "nextAction">> & { note?: string }) => Promise<boolean> }) {
  const baseline = { state: incident.state, ownerRole: incident.ownerRole, nextAction: incident.nextAction, note: "" };
  const [draft, setDraft] = useState(baseline);
  const resolving = incident.state !== "resolved" && draft.state === "resolved";
  useDraftLossGuard(JSON.stringify(draft) !== JSON.stringify(baseline), () => setDraft(baseline));
  return (
    <form className="note-form" onSubmit={async (event) => {
      event.preventDefault();
      const patch = { state: draft.state, ownerRole: draft.ownerRole, nextAction: draft.nextAction, ...(draft.note.trim() ? { note: draft.note } : {}) };
      await onUpdate(incident.id, patch);
    }}>
      <div className="inline-fields">
        <label><span>Status</span><select value={draft.state} disabled={busy} onChange={(event) => setDraft({ ...draft, state: event.target.value as Incident["state"] })}><option value="open">Open</option><option value="investigating">Investigating</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select></label>
        <label><span>Owner role <small>Required for resolution.</small></span><input value={draft.ownerRole} maxLength={100} required disabled={busy} onChange={(event) => setDraft({ ...draft, ownerRole: event.target.value })} /></label>
      </div>
      <label><span>{draft.state === "resolved" ? "Closure criterion" : "Next action"}</span><textarea value={draft.nextAction} maxLength={500} rows={2} required disabled={busy} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} /></label>
      <label><span>{resolving ? "Resolution evidence" : "Add note"} {resolving && <small>Required in the same update that resolves the incident.</small>}</span><textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={2000} rows={3} required={resolving} disabled={busy} /></label>
      <button type="submit" disabled={busy || JSON.stringify(draft) === JSON.stringify(baseline)}>Save incident update</button>
    </form>
  );
}

function IncidentsView({ incidents, records, selected, busy, onSelect, onUpdate }: { incidents: Incident[]; records: CatalogRecord[]; selected?: Incident; busy: boolean; onSelect: (id: string) => void; onUpdate: (id: string, patch: Partial<Pick<Incident, "state" | "ownerRole" | "nextAction">> & { note?: string }) => Promise<boolean> }) {
  const [page, setPage] = useState(() => pageContaining(incidents, (incident) => incident.id === selected?.id));
  const { confirmDiscard } = useContext(DraftGuardContext);
  const requestedPagination = paginate(incidents, page);
  const effectivePage = selected && !requestedPagination.items.some((incident) => incident.id === selected.id)
    ? pageContaining(incidents, (incident) => incident.id === selected.id)
    : requestedPagination.page;
  const pagination = paginate(incidents, effectivePage);
  return (
    <section aria-labelledby="incidents-title">
      <div className="page-heading"><div><p className="eyebrow">Service desk</p><h1 id="incidents-title">Incidents</h1></div><span className="count-label">{incidents.length}</span></div>
      <div className={incidents.length ? "split-view" : "split-view is-empty"}>
        <div className="record-list" aria-label="Incident results">
          {incidents.length === 0 ? <Empty label="No incidents." /> : pagination.items.map((incident) => <button className={selected?.id === incident.id ? "record-row selected" : "record-row"} type="button" key={incident.id} onClick={() => { if (selected?.id !== incident.id && confirmDiscard()) onSelect(incident.id); }} aria-pressed={selected?.id === incident.id}><span><strong>{incident.title}</strong><small>{incident.id} · {incident.service}</small></span><span className={`state-label ${incident.state}`}>{incident.state}</span></button>)}
          <ListPager pagination={pagination} onPage={(nextPage) => { if (!confirmDiscard()) return; const next = paginate(incidents, nextPage); setPage(next.page); if (next.items[0]) onSelect(next.items[0].id); }} />
        </div>
        {selected ? (
          <aside className="inspector" aria-labelledby="incident-detail-title">
            <p className="eyebrow">{selected.id} · {selected.service}</p><h2 id="incident-detail-title">{selected.title}</h2>
            {selected.recordId && records.find((record) => record.id === selected.recordId)
              ? <RecordComparison record={records.find((record) => record.id === selected.recordId)!} />
              : <RecordBlocks input={selected.evidence.map((value, index) => ({ code: `observation_${index + 1}`, name: "Observed condition", value, definition: "A condition recorded when the incident was opened." }))} output={[{ code: "incident_state", name: "Current state", value: selected.state, definition: "The current service-desk state for this incident." }, { code: "next_action", name: selected.state === "resolved" ? "Closure criterion" : "Required output", value: selected.nextAction, definition: selected.state === "resolved" ? "The criterion recorded for resolving this incident; consult the closure note for the evidence checked." : "The verifiable result required before this incident can advance." }]} inputMeta="Incident intake" outputMeta="Operational record" />}
            <IncidentUpdateForm key={`${selected.id}:${selected.updatedAt}`} incident={selected} busy={busy} onUpdate={onUpdate} />
            {selected.notes.length > 0 && <details className="trace"><summary>Notes ({selected.notes.length})</summary><ul className="compact-list">{selected.notes.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details>}
          </aside>
        ) : <aside className="inspector"><Empty label="Select an incident." /></aside>}
      </div>
    </section>
  );
}

function RecordComparison({ record }: { record: CatalogRecord }) {
  const input = record.source.elements?.length ? record.source.elements : Object.entries(record.source.trace).map(([code, value]) => ({ code, name: "Source element", value: value || "Not supplied", definition: "A retained source value used during normalization." }));
  const metadata = record.metadata;
  const output: RecordElement[] = [
    { code: "record_id", name: "Record identifier", value: record.id, definition: "The stable identifier exposed by the normalized record." },
    { code: "title", name: "Title", value: record.title || "Not supplied", definition: "The title displayed and indexed in discovery." },
    { code: "creators", name: "Creators", value: record.creators.join("; ") || "Not supplied", definition: "People or organizations indexed as responsible for the resource." },
    { code: "contributors", name: "Contributors", value: record.contributors?.join("; ") || "", definition: "Additional people or organizations associated with the resource." },
    { code: "display_year", name: "Display year", value: record.year, definition: "The conservative display year derived from supplied date evidence." },
    { code: "resource_type", name: "Resource type", value: record.format, definition: "The normalized type used for display and filtering." },
    { code: "identifiers", name: "Identifiers", value: record.identifiers.map((item) => `${item.scheme}: ${item.value}`).join("; ") || "None", definition: "Stable identifiers available for matching and linking." },
    { code: "availability", name: "Availability", value: record.availability, definition: "The user-facing availability statement." },
    { code: "edition", name: "Edition", value: record.edition, definition: "The edition or version statement retained by the canonical record." },
    { code: "location", name: "Location", value: record.location, definition: "The shelving, repository, service, or online location associated with access." },
    { code: "requestable", name: "Requestable", value: record.requestable ? "Yes" : "No", definition: "Whether the current fulfillment rules permit a request." },
    { code: "public_visible", name: "Public visibility", value: record.publicVisible ? "Yes" : "No", definition: "Whether the canonical record is marked as eligible for public discovery." },
    { code: "suppressed", name: "Suppressed", value: record.suppressed ? "Yes" : "No", definition: "Whether an explicit suppression rule withholds the record." },
    { code: "access_links", name: "Access links", value: record.links.join("; ") || "None", definition: "Validated HTTPS locations exposed for access." },
    { code: "issued", name: "Issued date", value: metadata?.issued || "", definition: "An EDTF-compatible publication or release date when supplied." },
    { code: "created", name: "Created date", value: metadata?.created || "", definition: "The resource creation date retained from the source." },
    { code: "modified", name: "Modified date", value: metadata?.modified || "", definition: "The resource or description modification date retained from the source." },
    { code: "publisher", name: "Publisher", value: metadata?.publisher || "", definition: "The entity responsible for making the resource available." },
    { code: "publication_place", name: "Publication place", value: metadata?.place || "", definition: "The place associated with publication or production." },
    { code: "language", name: "Language", value: metadata?.language || "", definition: "A supplied language label or code." },
    { code: "subjects", name: "Subjects", value: metadata?.subjects.join("; ") || "", definition: "Repeated topical, geographic, or named-entity access terms." },
    { code: "genres", name: "Genres", value: metadata?.genres.join("; ") || "", definition: "Repeated genre or form terms retained by the canonical record." },
    { code: "abstract", name: "Abstract", value: metadata?.abstract || "", definition: "A summary or description of the resource." },
    { code: "rights", name: "Rights statement", value: metadata?.rights || "", definition: "Human-readable information about rights or access conditions." },
    { code: "license", name: "License", value: metadata?.license || "", definition: "A machine-actionable license statement or URI." },
    { code: "container", name: "Container title", value: metadata?.containerTitle || "", definition: "The journal, book, series, or host resource containing this item." },
    { code: "series", name: "Series", value: metadata?.series || "", definition: "The series statement associated with the resource." },
    { code: "enumeration", name: "Volume, issue, pages", value: [metadata?.volume, metadata?.issue, metadata?.pages].filter(Boolean).join(" · "), definition: "The resource's enumeration and page span." },
    { code: "extent", name: "Extent", value: metadata?.extent || "", definition: "The physical or digital extent of the resource." },
    { code: "audience", name: "Audience", value: metadata?.audience || "", definition: "The intended or stated audience for the resource." },
    { code: "coverage", name: "Coverage", value: metadata?.coverage || "", definition: "The spatial or temporal scope associated with the resource." },
    { code: "relations", name: "Relations", value: metadata?.relations.join("; ") || "", definition: "Repeatable references to related resources." },
    { code: "notes", name: "Notes", value: metadata?.notes.join("; ") || "", definition: "Repeatable descriptive or processing notes." },
  ].filter((item) => item.value !== "") as RecordElement[];
  return <RecordBlocks input={input} output={output} inputMeta={`${record.source.format} · ${record.source.label}`} outputMeta="Normalized discovery record" />;
}

function RecordBlocks({ input, output, inputMeta, outputMeta }: { input: RecordElement[]; output: RecordElement[]; inputMeta: string; outputMeta: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className="record-comparison" aria-label="Original input and new output">
      <RecordBlock id={`${id}-input`} title="Original input" meta={inputMeta} elements={input} empty="No source elements were supplied." />
      <RecordBlock id={`${id}-output`} title="New output" meta={outputMeta} elements={output} empty="No output elements were produced." />
    </div>
  );
}

function RecordBlock({ id, title, meta, elements, empty }: { id: string; title: string; meta: string; elements: RecordElement[]; empty: string }) {
  return (
    <section className="record-block" aria-labelledby={id}>
      <header><h3 id={id}>{title}</h3><span>{meta}</span></header>
      {elements.length ? (
        <>
          <div className="sr-only">
            {elements.map((item, index) => <p id={`${id}-definition-${index}`} key={`${item.code}-${index}`}>{item.name}: {item.definition}</p>)}
          </div>
          <dl className="record-elements">
            {elements.map((item, index) => <div key={`${item.code}-${index}`} aria-describedby={`${id}-definition-${index}`}><dt><code>{item.code}</code><strong>{item.name}</strong></dt><dd><span>{item.value}</span></dd></div>)}
          </dl>
          <details className="element-definitions">
            <summary>Element definitions</summary>
            <dl>{elements.map((item, index) => <div key={`${item.code}-${index}`}><dt><code>{item.code}</code> · {item.name}</dt><dd>{item.definition}</dd></div>)}</dl>
          </details>
        </>
      ) : <p className="record-empty">{empty}</p>}
    </section>
  );
}

function ChangesView({ workspace, config, busy, onSave, onRollback }: { workspace: Workspace; config: LabConfig; busy: boolean; onSave: (config: LabConfig) => Promise<void>; onRollback: (id: string) => Promise<void> }) {
  const [draft, setDraft] = useState(config);
  const confirmDiscard = useDraftLossGuard(JSON.stringify(draft) !== JSON.stringify(config), () => setDraft(config));
  return (
    <section aria-labelledby="changes-title">
      <div className="page-heading"><div><p className="eyebrow">Reversible configuration</p><h1 id="changes-title">Changes</h1></div><span className="count-label">{workspace.revisions.length} revisions</span></div>
      <div className="changes-grid">
        <form className="config-form" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
          <h2>Configuration</h2>
          <label><span>Resolver URL</span><input type="url" value={draft.resolverBase} onChange={(event) => setDraft({ ...draft, resolverBase: event.target.value })} placeholder="https://…" /></label>
          <label><span>Proxy prefix</span><input type="url" value={draft.proxyPrefix} onChange={(event) => setDraft({ ...draft, proxyPrefix: event.target.value })} placeholder="https://…" /></label>
          <label><span>Default pickup</span><input value={draft.defaultPickupLocation} onChange={(event) => setDraft({ ...draft, defaultPickupLocation: event.target.value })} maxLength={160} /></label>
          <label><span>Member code</span><input value={draft.memberCode} onChange={(event) => setDraft({ ...draft, memberCode: event.target.value })} maxLength={32} /></label>
          <div className="form-actions"><button type="submit" disabled={busy}>Save revision</button><button className="secondary-button" type="button" onClick={() => setDraft(config)}>Discard</button></div>
        </form>
        <section className="revision-list" aria-labelledby="history-title"><div className="section-heading"><h2 id="history-title">Revision history</h2><span>Rollback creates a new revision</span></div>{[...workspace.revisions].reverse().map((revision, index) => <article key={revision.id}><div><strong>{revision.label}</strong><small>{revision.id} · {revision.digest.slice(0, 12)} · {formatDate(revision.createdAt)}</small></div>{index === 0 ? <span className="current-label">Current</span> : <button className="secondary-button" type="button" disabled={busy} onClick={() => { if (confirmDiscard()) void onRollback(revision.id); }}>Restore</button>}</article>)}</section>
      </div>
    </section>
  );
}

function ReportsView({ workspace, auditState, outputGate, busy, localWorkspaces, activeLocal, dirty, storageStatus, storageInspection, onCreate, onSave, onAcceptContinuity, onDownloadContinuityReceipt, onCompareContinuityReceipt, onOpen, onRename, onDuplicate, onDelete, onForget, onOpenBackup, onRequestDurable, onNotice, onReset, onVerify, onRefreshStorage }: { workspace: Workspace; auditState: "idle" | "valid" | "invalid"; outputGate: OutputGate; busy: boolean; localWorkspaces: LocalWorkspaceManifest[]; activeLocal: ActiveLocalSession | null; dirty: boolean; storageStatus: LocalStorageStatus; storageInspection: LocalWorkspaceStorageInspection | null; onCreate: (name: string) => Promise<boolean | undefined>; onSave: () => Promise<boolean | undefined>; onAcceptContinuity: (input: LocalContinuityAcceptanceInput) => Promise<boolean | undefined>; onDownloadContinuityReceipt: () => Promise<boolean | undefined>; onCompareContinuityReceipt: (file: File) => Promise<boolean | undefined>; onOpen: (id: string) => Promise<boolean | undefined>; onRename: (id: string, name: string) => Promise<boolean | undefined>; onDuplicate: (id: string, name: string) => Promise<boolean | undefined>; onDelete: (id: string) => Promise<boolean | undefined>; onForget: () => Promise<void>; onOpenBackup: (review: WorkspaceBackupReview, disposition: EvidenceDispositionInput) => Promise<boolean>; onRequestDurable: () => Promise<void>; onNotice: (message: string) => void; onReset: () => void; onVerify: () => Promise<void>; onRefreshStorage: () => Promise<void> }) {
  const [documentKind, setDocumentKind] = useState<DocumentKind>("system-inventory");
  const [exchangeFormat, setExchangeFormat] = useState<ExchangeFormat>("laclab-json");
  const [incidentId, setIncidentId] = useState(workspace.incidents[0]?.id ?? "");
  const verifyFreshness = useArtifactFreshness();
  const records = activeRevision(workspace).records;
  const integrityOutputBlocked = auditState !== "valid";
  const sampleContaminated = workspace.incidents.some((incident) => incident.synthetic) || records.some((record) => record.source.format === "fixture");
  const unsupportedClosures = workspace.incidents.some((incident) => incident.state === "resolved" && (!incident.notes.some((note) => note.trim()) || !incident.ownerRole.trim() || /^unassigned$/i.test(incident.ownerRole.trim()) || !incident.nextAction.trim()));
  const activeManifest = activeLocal ? localWorkspaces.find((item) => item.id === activeLocal.id) : undefined;
  const activeStale = Boolean(activeLocal && (!activeManifest || activeManifest.token !== activeLocal.token));
  const publicationStateBlocked = !activeLocal || dirty || activeStale;
  const publicNoticeBlocked = integrityOutputBlocked || outputGate.blocked || unsupportedClosures || publicationStateBlocked;
  const publicNoticeBlockMessage = sampleContaminated
    ? "Public Notice is unavailable because this workspace contains Sample data, including resolved synthetic incidents. Begin a blank workspace for publication work."
    : unsupportedClosures
      ? "Public Notice is unavailable because a resolved incident lacks an assigned owner, closure evidence, or a closure criterion or next action. Reopen or document it first."
      : !activeLocal
        ? "Public Notice requires a named, saved workspace so freshness can be rechecked at generation time."
        : dirty
          ? "Save the current workspace before generating a Public Notice so the exact saved version can be rechecked."
          : activeStale
            ? "Public Notice is unavailable because the named saved workspace changed in another tab. Reload it before publication work."
            : outputGate.reason || "Public Notice is unavailable until the full workspace structure and internal consistency check passes.";
  const incidentBoundDocument = documentKind === "incident-ticket" || documentKind === "vendor-escalation" || documentKind === "postmortem";
  const selectedIncidentId = workspace.incidents.some((incident) => incident.id === incidentId) ? incidentId : workspace.incidents[0]?.id ?? "";
  const operationalOutputBlocked = outputGate.blocked || (incidentBoundDocument && !selectedIncidentId);
  const catalogOutputBlocked = outputGate.blocked || records.length === 0;

  async function deliverReport(kind: "technical" | "notice", download: boolean) {
    try {
      const technical = kind === "technical";
      if (!technical && publicNoticeBlocked) throw new Error(publicNoticeBlockMessage);
      const lease = await verifyFreshness(technical ? "diagnostic" : "authoritative");
      const generatedAt = new Date().toISOString();
      const filename = technical ? TECHNICAL_REPORT_FILENAME : PUBLIC_NOTICE_FILENAME;
      const html = technical
        ? await makeTechnicalReportHtml(workspace, auditState, generatedAt, { savedCopyStatus: lease.savedCopyStatus, continuityStatus: lease.continuityStatus, continuityReason: lease.continuityReason })
        : await makePublicNoticeHtml(lease.artifactWorkspace, generatedAt);
      await lease.recheck();
      openHtmlDocument(filename, html, download);
      onNotice((technical ? "Technical report" : "Public notice") + (download ? " HTML downloaded." : " opened as notebook HTML."));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The report file could not be prepared safely.");
    }
  }

  async function deliverCatalog() {
    try {
      if (catalogOutputBlocked) throw new Error(outputGate.reason || "Catalog export requires at least one record.");
      const lease = await verifyFreshness("authoritative");
      const text = formatRecords(activeRevision(lease.artifactWorkspace).records, exchangeFormat);
      await lease.recheck();
      downloadText(exchangeFilename("in-keeping-catalog", exchangeFormat), text, exchangeMime(exchangeFormat));
      onNotice("Catalog compatibility file downloaded from the verified named saved generation.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The catalog file could not be prepared safely.");
    }
  }

  async function deliverOperationalDocument() {
    try {
      if (operationalOutputBlocked) throw new Error(outputGate.reason || "Select an incident before generating this incident-bound document.");
      const lease = await verifyFreshness("authoritative");
      const text = makeOperationalDocument(lease.artifactWorkspace, documentKind, incidentBoundDocument ? selectedIncidentId : undefined);
      await lease.recheck();
      downloadText("in-keeping-" + documentKind + ".md", text, "text/markdown");
      onNotice("Operational document downloaded for review.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The operational document could not be prepared safely.");
    }
  }

  return (
    <section aria-labelledby="reports-title">
      <div className="page-heading"><div><p className="eyebrow">Handoff and recovery</p><h1 id="reports-title">Reports</h1></div></div>
      <div className="reports-grid">
        <section className="action-group">
          <h2>Report files</h2>
          <p>Open the complete notebook HTML before sharing.</p>
          <div className="report-document-list">
            <article className="report-document-row">
              <div><span>01 · Staff record</span><h3>Technical report</h3><p>Catalog, archives, service registers, diagrams, safeguards, configuration, revisions, and audit.</p></div>
              <div className="report-document-actions">
                <button type="button" onClick={() => { void deliverReport("technical", false); }}>Open<span className="sr-only"> technical report in a new tab</span></button>
                <button type="button" className="secondary-button" onClick={() => { void deliverReport("technical", true); }}>Download<span className="sr-only"> technical report</span> HTML</button>
              </div>
            </article>
            <article className="report-document-row">
              <div><span>02 · Public record</span><h3>Public notice</h3><p>Plain-language service status from a fixed public projection.</p></div>
              <div className="report-document-actions">
                <button type="button" disabled={publicNoticeBlocked} aria-describedby={publicNoticeBlocked ? "public-notice-blocked" : undefined} onClick={() => { void deliverReport("notice", false); }}>Open<span className="sr-only"> public notice in a new tab</span></button>
                <button type="button" className="secondary-button" disabled={publicNoticeBlocked} aria-describedby={publicNoticeBlocked ? "public-notice-blocked" : undefined} onClick={() => { void deliverReport("notice", true); }}>Download<span className="sr-only"> public notice</span> HTML</button>
              </div>
            </article>
          </div>
          {publicNoticeBlocked && <p id="public-notice-blocked" className="field-error">{publicNoticeBlockMessage}</p>}
          {outputGate.blocked && <p id="integrity-output-blocked" className="field-error">{outputGate.reason} The Technical Report remains available and labels the current limitations.</p>}
          <div className="document-picker"><label><span>Catalog format</span><select value={exchangeFormat} onChange={(event) => setExchangeFormat(event.target.value as ExchangeFormat)}>{EXCHANGE_FORMATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button type="button" className="secondary-button" disabled={catalogOutputBlocked} aria-describedby={catalogOutputBlocked ? (outputGate.blocked ? "integrity-output-blocked" : "catalog-output-blocked") : undefined} aria-label={`Download catalog as ${EXCHANGE_FORMATS.find((option) => option.value === exchangeFormat)?.label ?? exchangeFormat}`} onClick={() => { void deliverCatalog(); }}>Download</button></div>
          {records.length === 0 && <p id="catalog-output-blocked" className="field-error">Catalog export requires at least one record. No empty compatibility file will be generated because IN KEEPING import contracts require 1–1,000 records.</p>}
          <div className="document-picker"><label><span>Operational document</span><select value={documentKind} onChange={(event) => setDocumentKind(event.target.value as DocumentKind)}>{DOCUMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button type="button" className="secondary-button" disabled={operationalOutputBlocked} aria-describedby={operationalOutputBlocked ? "operational-output-blocked" : undefined} aria-label={`Download ${DOCUMENT_OPTIONS.find((option) => option.value === documentKind)?.label ?? documentKind}`} onClick={() => { void deliverOperationalDocument(); }}>Download</button></div>
          {incidentBoundDocument && <label className="workspace-select"><span>Incident for this document</span><select value={selectedIncidentId} onChange={(event) => setIncidentId(event.target.value)}>{workspace.incidents.map((incident) => <option key={incident.id} value={incident.id}>{incident.id} · {incident.title} · {incident.state}</option>)}</select></label>}
          {operationalOutputBlocked && <p id="operational-output-blocked" className="field-error">{outputGate.reason || "Select an incident before generating this incident-bound document."}</p>}
          <details className="format-rules"><summary>Formatting rules</summary><dl>{DATA_FORMAT_RULES.map((item) => <div key={item.type}><dt>{item.type}</dt><dd>{item.rule}</dd></div>)}</dl></details>
        </section>
        <LocalWorkspaceManager key={activeLocal?.id ?? "working-copy"} workspace={workspace} manifests={localWorkspaces} activeLocal={activeLocal} dirty={dirty} busy={busy} storageStatus={storageStatus} storageInspection={storageInspection} auditState={auditState} onCreate={onCreate} onSave={onSave} onAcceptContinuity={onAcceptContinuity} onDownloadContinuityReceipt={onDownloadContinuityReceipt} onCompareContinuityReceipt={onCompareContinuityReceipt} onOpen={onOpen} onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} onForget={onForget} onOpenBackup={onOpenBackup} onRequestDurable={onRequestDurable} onNotice={onNotice} onReset={onReset} onVerify={onVerify} onRefreshStorage={onRefreshStorage} />
      </div>
    </section>
  );
}

function LocalWorkspaceManager({ workspace, manifests, activeLocal, dirty, busy, storageStatus, storageInspection, auditState, onCreate, onSave, onAcceptContinuity, onDownloadContinuityReceipt, onCompareContinuityReceipt, onOpen, onRename, onDuplicate, onDelete, onForget, onOpenBackup, onRequestDurable, onNotice, onReset, onVerify, onRefreshStorage }: { workspace: Workspace; manifests: LocalWorkspaceManifest[]; activeLocal: ActiveLocalSession | null; dirty: boolean; busy: boolean; storageStatus: LocalStorageStatus; storageInspection: LocalWorkspaceStorageInspection | null; auditState: "idle" | "valid" | "invalid"; onCreate: (name: string) => Promise<boolean | undefined>; onSave: () => Promise<boolean | undefined>; onAcceptContinuity: (input: LocalContinuityAcceptanceInput) => Promise<boolean | undefined>; onDownloadContinuityReceipt: () => Promise<boolean | undefined>; onCompareContinuityReceipt: (file: File) => Promise<boolean | undefined>; onOpen: (id: string) => Promise<boolean | undefined>; onRename: (id: string, name: string) => Promise<boolean | undefined>; onDuplicate: (id: string, name: string) => Promise<boolean | undefined>; onDelete: (id: string) => Promise<boolean | undefined>; onForget: () => Promise<void>; onOpenBackup: (review: WorkspaceBackupReview, disposition: EvidenceDispositionInput) => Promise<boolean>; onRequestDurable: () => Promise<void>; onNotice: (message: string) => void; onReset: () => void; onVerify: () => Promise<void>; onRefreshStorage: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState(activeLocal?.id ?? manifests[0]?.id ?? "");
  const [nextName, setNextName] = useState("");
  const [backupReview, setBackupReview] = useState<WorkspaceBackupReview | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [continuityRole, setContinuityRole] = useState("");
  const [continuityReference, setContinuityReference] = useState("");
  const [continuityRationale, setContinuityRationale] = useState("");
  const [continuityAcknowledged, setContinuityAcknowledged] = useState(false);
  const nameDraftId = useDraftRegistration(Boolean(name), () => setName(""));
  const nextNameDraftId = useDraftRegistration(Boolean(nextName), () => setNextName(""));
  const { confirmDiscard } = useContext(DraftGuardContext);
  const backupReviewSequence = useRef(0);
  const selected = manifests.find((item) => item.id === selectedId)
    ?? manifests.find((item) => item.id === activeLocal?.id)
    ?? manifests[0];
  const activeManifest = activeLocal ? manifests.find((item) => item.id === activeLocal.id) : undefined;
  const activeStale = Boolean(activeLocal && (!activeManifest || activeManifest.token !== activeLocal.token));
  const selectedActiveIsStale = Boolean(selected && activeLocal?.id === selected.id && activeStale);
  const storageQuarantined = Boolean(storageInspection?.quarantine.length);
  const currentSessionState = activeStale ? "Saved copy changed" : activeManifest ? (dirty ? "Unsaved changes" : "Saved") : "Working copy";
  const continuityAccepted = activeLocal && ["continuity-verified-local", "continuity-corroborated"].includes(activeLocal.continuity.status);

  async function downloadBackup(target: "session" | "selected") {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      let source = workspace;
      let recovered = false;
      if (target === "selected") {
        if (!selected) throw new Error("Select a saved workspace before downloading its backup.");
        const opened = await openLocalWorkspace(selected.id);
        if (opened.token !== selected.token) throw new Error("The selected workspace changed in another tab. Refresh the list before downloading its backup.");
        source = opened.workspace;
        recovered = opened.recoveredFromPrevious;
      }
      const text = await makeWorkspaceBackup(source);
      downloadText(workspaceBackupFilename(source.name), text, WORKSPACE_BACKUP_MIME);
      onNotice(`${target === "selected" ? `Saved workspace “${source.name}”` : `Current session “${source.name}”`} backed up as plaintext JSON.${recovered ? " The file contains its previous manifest-verified generation; stored generations were not changed." : ""}`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The workspace backup could not be prepared safely.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const sequence = backupReviewSequence.current + 1;
    backupReviewSequence.current = sequence;
    setBackupBusy(true);
    try {
      const next = await reviewWorkspaceBackup(file);
      if (backupReviewSequence.current === sequence) setBackupReview(next);
    } catch (error) {
      if (backupReviewSequence.current === sequence) onNotice(error instanceof Error ? error.message : "The workspace backup could not be reviewed safely.");
    } finally {
      if (backupReviewSequence.current === sequence) setBackupBusy(false);
    }
  }

  async function openReviewedBackup(disposition: EvidenceDispositionInput) {
    if (!backupReview || backupReview.blocked || backupBusy) return;
    setBackupBusy(true);
    try {
      if (await onOpenBackup(backupReview, disposition)) setBackupReview(null);
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <section className="action-group local-workspace-manager" aria-labelledby="local-workspaces-title" aria-busy={busy || backupBusy}>
      <h2 id="local-workspaces-title">Local workspaces</h2>
      {storageInspection?.quarantine.length ? <StorageQuarantine inspection={storageInspection} busy={busy} onNotice={onNotice} onRefresh={onRefreshStorage} /> : null}
      {activeStale && <div className="workspace-stale" role="alert"><strong>Saved version changed</strong><span>{activeManifest ? "Another tab saved this workspace. Reload it before changing the saved copy, or duplicate this session under a new name." : "The saved workspace was removed in another tab. This session remains open and unsaved."}</span>{activeManifest && <button type="button" className="secondary-button" disabled={busy} onClick={() => onOpen(activeManifest.id)}>Reload saved version</button>}</div>}
      <div className="workspace-current"><div><strong>Current session</strong><span>{workspace.name} · {currentSessionState}</span></div><button type="button" aria-label={`Save current session “${workspace.name}”`} disabled={busy || storageQuarantined || !activeLocal || !dirty || activeStale} onClick={onSave}>Save current session</button></div>
      <form className="workspace-create" onSubmit={async (event) => { event.preventDefault(); const submittedName = name; if (!confirmDiscard("Create this workspace and discard the other unsaved name?", false, nameDraftId)) return; if (await onCreate(submittedName)) setName(""); }}><label><span>Workspace name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label><button type="submit" disabled={busy || storageQuarantined}>Create workspace</button></form>
      {manifests.length ? (
        <>
          <label className="workspace-select"><span>Saved workspaces</span><select value={selected?.id ?? ""} onChange={(event) => { if (!confirmDiscard()) return; setSelectedId(event.target.value); setNextName(""); }}>{manifests.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === activeLocal?.id ? " · current" : ""}</option>)}</select></label>
          {selected && <div className="workspace-summary"><strong>{selected.name}</strong><span>{selected.recordCount} catalog · {selected.archiveCount} archival · {selected.serviceCount} service</span><span>{formatBytes(selected.bytes)} · saved {formatDate(selected.savedAt)}</span></div>}
          <div className="button-row"><button type="button" className="secondary-button" aria-label={selected ? `Open saved workspace “${selected.name}”` : "Open saved workspace"} disabled={busy || !selected || selected.id === activeLocal?.id} onClick={() => selected && onOpen(selected.id)}>Open</button><button type="button" className="danger-button" aria-label={selected ? `Delete saved workspace “${selected.name}”` : "Delete saved workspace"} disabled={busy || storageQuarantined || !selected || selectedActiveIsStale} onClick={() => selected && onDelete(selected.id)}>Delete</button></div>
          <details className="workspace-secondary-actions"><summary>Rename or duplicate</summary><label><span>New name</span><input value={nextName} onChange={(event) => setNextName(event.target.value)} maxLength={120} /></label><div className="button-row"><button type="button" className="secondary-button" aria-label={selected ? `Rename saved workspace “${selected.name}”` : "Rename saved workspace"} disabled={busy || storageQuarantined || !selected || !nextName.trim() || selectedActiveIsStale} onClick={async () => { if (!selected) return; const submittedName = nextName; if (!confirmDiscard("Rename this workspace and discard the other unsaved name?", false, nextNameDraftId)) return; if (await onRename(selected.id, submittedName)) setNextName(""); }}>Rename</button><button type="button" className="secondary-button" aria-label={selected ? `Duplicate saved workspace “${selected.name}”` : "Duplicate saved workspace"} disabled={busy || storageQuarantined || !selected || !nextName.trim()} onClick={async () => { if (!selected) return; const submittedName = nextName; if (!confirmDiscard("Duplicate this workspace and discard the other unsaved name?", false, nextNameDraftId)) return; if (await onDuplicate(selected.id, submittedName)) setNextName(""); }}>Duplicate</button></div></details>
        </>
      ) : <p className="empty-state">No local workspaces yet.</p>}
      {activeLocal && <div className="workspace-backup">
        <h3>Continuity checkpoint</h3>
        <p className="field-help">{activeLocal.continuity.reason} Ordinary output requires an exact current independent receipt comparison; save, rename, and reload clear that process-local proof. A local checkpoint detects later coherent workspace replacement only while the checkpoint remains separate. It does not prove authenticity, truth, identity, custody, completeness, authority, or trusted time.</p>
        {continuityAccepted
          ? <div className="button-row"><span className="audit-result valid">{activeLocal.continuity.status === "continuity-corroborated" ? "Independent receipt matches" : "Continuity verified locally"}</span><button type="button" className="secondary-button" disabled={busy || dirty || activeStale} onClick={() => { void onDownloadContinuityReceipt(); }}>Download independent receipt</button><label className="backup-file"><span>Compare independent receipt</span><input type="file" accept=".json,application/json" disabled={busy || dirty || activeStale} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onCompareContinuityReceipt(file); }} /></label></div>
          : activeLocal.continuity.status === "continuity-failure"
            ? <p className="field-error" role="alert">Continuity failure: this lineage cannot be re-anchored in place. Preserve it for diagnosis and create a separately accepted new baseline.</p>
            : <form className="workspace-create" onSubmit={async (event) => {
                event.preventDefault();
                const accepted = await onAcceptContinuity({
                  operatorRole: continuityRole,
                  authorityReference: continuityReference,
                  rationale: continuityRationale,
                  sourceKind: "local-workspace",
                  sourcePayloadDigest: null,
                  sourceAnchorDigest: null,
                  acknowledgment: CONTINUITY_ACKNOWLEDGMENT,
                });
                if (accepted) { setContinuityRole(""); setContinuityReference(""); setContinuityRationale(""); setContinuityAcknowledged(false); }
              }}>
                <p className="field-help">Explicitly accept this exact clean saved generation as a local baseline. Role and authority reference are operator claims, not authenticated identity.</p>
                <label><span>Operator role claim</span><input value={continuityRole} onChange={(event) => setContinuityRole(event.target.value)} maxLength={120} required /></label>
                <label><span>Authority or ticket reference</span><input value={continuityReference} onChange={(event) => setContinuityReference(event.target.value)} maxLength={500} required /></label>
                <label><span>Acceptance rationale</span><textarea value={continuityRationale} onChange={(event) => setContinuityRationale(event.target.value)} maxLength={1000} rows={3} required /></label>
                <label className="checkbox-row"><input type="checkbox" checked={continuityAcknowledged} onChange={(event) => setContinuityAcknowledged(event.target.checked)} required /><span>I understand continuity is not authenticity and browser time is untrusted.</span></label>
                <button type="submit" disabled={busy || dirty || activeStale || !continuityAcknowledged}>Accept local continuity baseline</button>
              </form>}
      </div>}
      <div className="workspace-backup">
        <h3>Workspace backup</h3>
        <p className="field-help">Plaintext JSON. The current session {activeStale ? "is stale relative to a changed or removed named saved copy" : dirty ? "includes unsaved changes" : activeLocal ? "matches the named saved version known in this tab" : "is a working copy"}; the selected backup reopens and validates the named saved copy.</p>
        <ReviewAnnouncements label="Backup review" busy={backupBusy} summary={backupReview?.summary ?? ""} blocked={backupReview?.blocked ?? false} />
        <div className="button-row"><button type="button" className="secondary-button" aria-label={`Download current session “${workspace.name}”`} disabled={busy || backupBusy} onClick={() => downloadBackup("session")}>Download current session</button><button type="button" className="secondary-button" aria-label={selected ? `Download saved workspace “${selected.name}”` : "Download selected saved workspace"} disabled={busy || backupBusy || !selected} onClick={() => downloadBackup("selected")}>Download selected saved backup</button><label className="backup-file"><span>Review backup</span><input type="file" accept=".json,application/json" disabled={busy || backupBusy} onChange={selectBackup} /></label></div>
        {backupReview && <div className={backupReview.blocked ? "backup-review blocked" : "backup-review ready"}><strong>{backupReview.filename}</strong><span>{backupReview.summary}</span>{!backupReview.blocked && <EvidenceDispositionForm busy={busy || backupBusy} onSubmit={openReviewedBackup} />}</div>}
      </div>
      <details className="storage-details"><summary>Storage and integrity</summary><dl><div><dt>Persistence</dt><dd>{storageStatus.persisted === true ? "Durable storage granted" : storageStatus.persisted === false ? "Browser may evict under storage pressure" : "Not reported"}</dd></div><div><dt>Browser usage</dt><dd>{storageStatus.usage === null || storageStatus.quota === null ? "Not reported" : `${formatBytes(storageStatus.usage)} of ${formatBytes(storageStatus.quota)}`}</dd></div></dl><div className="button-row"><button type="button" className="secondary-button" disabled={busy} onClick={onVerify}>Verify integrity</button><span className={`audit-result ${auditState}`}>{auditState === "idle" ? "Full check in progress" : auditState === "valid" ? "Internally consistent; not authenticated" : "Mismatch detected"}</span></div>{storageStatus.persisted === false && <button type="button" className="secondary-button" onClick={onRequestDurable}>Request durable storage</button>}<div className="button-row"><button type="button" className="secondary-button" disabled={busy} onClick={onReset}>Start blank working copy</button><button type="button" className="text-button" disabled={busy || storageQuarantined || manifests.length === 0} onClick={onForget}>Delete all local workspaces</button></div></details>
    </section>
  );
}

function StorageQuarantine({ inspection, busy, onNotice, onRefresh }: { inspection: LocalWorkspaceStorageInspection; busy: boolean; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const choices = inspection.quarantine.flatMap((entry) => entry.workspaceId
    ? entry.generations.map((generation) => ({ workspaceId: entry.workspaceId!, generation, key: `${entry.workspaceId}:${generation}` }))
    : []);
  const [choiceKey, setChoiceKey] = useState(choices[0]?.key ?? "");
  const [candidate, setCandidate] = useState<LocalWorkspaceRecoveryCandidate | null>(null);
  const [candidateStatus, setCandidateStatus] = useState("");
  const [newName, setNewName] = useState("");
  const [working, setWorking] = useState(false);
  useDraftLossGuard(Boolean(newName), () => setNewName(""));
  const choice = choices.find((item) => item.key === choiceKey) ?? choices[0];

  async function inspectCandidate() {
    if (!choice || working) return;
    setWorking(true);
    setCandidate(null);
    setCandidateStatus("Inspecting selected generation…");
    try {
      const next = await inspectLocalWorkspaceRecoveryCandidate(choice.workspaceId, choice.generation);
      setCandidate(next);
      setCandidateStatus(next ? "Internally consistent recovery candidate; authenticity and completeness are not established." : "This generation did not verify and cannot be reconstructed.");
    } catch (error) {
      setCandidateStatus(error instanceof Error ? error.message : "The selected generation could not be inspected safely.");
    } finally {
      setWorking(false);
    }
  }

  async function reconstructCandidate() {
    if (!candidate || !newName.trim() || working) return;
    if (!confirm(`Create “${newName.trim()}” from this verified generation? The quarantined source will remain unchanged.`)) return;
    setWorking(true);
    try {
      const reconstructed = await reconstructLocalWorkspaceFromQuarantine(candidate.workspaceId, candidate.generation, candidate.payloadDigest, newName);
      await onRefresh();
      setNewName("");
      onNotice(`Created “${reconstructed.name}” from verified quarantined generation ${candidate.generation}. The original quarantine remains unchanged.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The verified generation could not be reconstructed safely.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="storage-quarantine" role="alert" aria-labelledby="storage-quarantine-title" aria-busy={working}>
      <h3 id="storage-quarantine-title">Storage inspection required</h3>
      <ul>
        {inspection.quarantine.map((entry, index) => <li key={`${entry.workspaceId ?? "invalid"}-${index}`}><strong>{entry.workspaceId ?? "Invalid generation index"}</strong><span>{entry.reasons.map(quarantineReasonLabel).join(" · ")}</span><small>Generations: {entry.generations.length ? entry.generations.join(", ") : "none"}</small></li>)}
      </ul>
      {choices.length ? (
        <div className="quarantine-recovery">
          <label><span>Recovery candidate</span><select value={choice?.key ?? ""} disabled={busy || working} onChange={(event) => { setChoiceKey(event.target.value); setCandidate(null); setCandidateStatus(""); setNewName(""); }}>{choices.map((item) => <option key={item.key} value={item.key}>{item.workspaceId} · generation {item.generation}</option>)}</select></label>
          <button type="button" className="secondary-button" disabled={busy || working || !choice} onClick={inspectCandidate}>Inspect candidate</button>
          <div className="quarantine-status" role="status" aria-live="polite" aria-atomic="true">{candidateStatus}</div>
          {candidate && <dl className="quarantine-candidate"><div><dt>Name</dt><dd>{candidate.name}</dd></div><div><dt>Digest</dt><dd><code>{candidate.payloadDigest}</code></dd></div><div><dt>Contents</dt><dd>{candidate.recordCount} catalog · {candidate.archiveCount} archival · {candidate.serviceCount} service · {candidate.incidentCount} incidents</dd></div></dl>}
          {candidate && <div className="quarantine-reconstruct"><label><span>New workspace name</span><input value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} /></label><button type="button" disabled={busy || working || !newName.trim()} onClick={reconstructCandidate}>Create reconstruction</button></div>}
        </div>
      ) : <p>No generation is available for reconstruction.</p>}
    </section>
  );
}

function quarantineReasonLabel(reason: LocalWorkspaceStorageInspection["quarantine"][number]["reasons"][number]): string {
  return ({
    "invalid-manifest": "Invalid manifest",
    "missing-manifest": "Missing manifest",
    "unreferenced-generation": "Unreferenced generation",
    "missing-active-generation": "Missing active generation",
    "missing-previous-generation": "Missing previous generation",
    "invalid-generation-index": "Invalid generation index",
  } as const)[reason];
}

function ReviewAnnouncements({ label, busy, summary, blocked }: { label: string; busy: boolean; summary: string; blocked: boolean }) {
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{busy ? `${label} in progress.` : blocked ? "" : summary}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{!busy && blocked ? summary : ""}</div>
    </>
  );
}

function EvidenceDispositionForm({ busy, onSubmit }: { busy: boolean; onSubmit: (disposition: EvidenceDispositionInput) => Promise<unknown> }) {
  const [decision, setDecision] = useState<"" | EvidenceDispositionInput["decision"]>("");
  const [claimedOrigin, setClaimedOrigin] = useState<"" | EvidenceDispositionInput["claimedOrigin"]>("");
  const [custodyNote, setCustodyNote] = useState("");
  const [actorRoleClaim, setActorRoleClaim] = useState("");
  const [rationale, setRationale] = useState("");
  const [policyReference, setPolicyReference] = useState("");
  return (
    <form className="evidence-disposition" onSubmit={async (event) => {
      event.preventDefault();
      if (!decision || !claimedOrigin) return;
      await onSubmit({ decision, claimedOrigin, custodyNote, actorRoleClaim, rationale, policyReference, atBrowser: new Date().toISOString(), timeBasis: EVIDENCE_TIME_BASIS });
    }}>
      <p className="field-help">Structural checks passed. They do not establish truth, custody, completeness, or authority. An admission remains explicitly unverified.</p>
      <label><span>Disposition</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} required><option value="">Choose…</option><option value="admit-unverified">Admit as unverified evidence</option><option value="reject">Reject evidence</option><option value="withdraw">Record withdrawal</option></select></label>
      <label><span>Claimed origin / custody path</span><select value={claimedOrigin} onChange={(event) => setClaimedOrigin(event.target.value as typeof claimedOrigin)} required><option value="">Choose…</option><option value="unknown">Unknown</option><option value="direct-export">Direct export claim</option><option value="transferred-copy">Transferred copy claim</option><option value="other">Other claim</option></select></label>
      <label><span>Custody note</span><textarea value={custodyNote} onChange={(event) => setCustodyNote(event.target.value)} maxLength={2000} rows={2} required /></label>
      <label><span>Actor role claim</span><input value={actorRoleClaim} onChange={(event) => setActorRoleClaim(event.target.value)} maxLength={200} required /></label>
      <label><span>Decision rationale</span><textarea value={rationale} onChange={(event) => setRationale(event.target.value)} maxLength={2000} rows={2} required /></label>
      <label><span>Policy / ticket reference</span><input value={policyReference} onChange={(event) => setPolicyReference(event.target.value)} maxLength={500} required /></label>
      <button type="submit" disabled={busy || !decision || !claimedOrigin}>Record disposition</button>
    </form>
  );
}

function ImportReviewCard({ review, onApply, busy }: { review: ImportReview; onApply: (disposition: EvidenceDispositionInput) => Promise<void>; busy: boolean }) {
  const [page, setPage] = useState(0);
  const findingPagination = paginate(review.findings, page);
  return (
    <div className="import-review">
      <dl><div><dt>File</dt><dd>{review.filename}</dd></div><div><dt>Format</dt><dd>{review.format}</dd></div><div><dt>Records</dt><dd>{review.records.length}</dd></div><div><dt>SHA-256</dt><dd><code>{review.digest || "—"}</code></dd></div></dl>
      <div className={review.blocked ? "review-state blocked" : "review-state ready"}>{review.summary}</div>
      {review.findings.length > 0 && <details><summary>Findings ({review.findings.length})</summary><ul className="compact-list">{findingPagination.items.map((finding) => <li key={finding.id}><strong>{finding.code}</strong> · {finding.label}<span>{finding.detail}</span></li>)}</ul><ListPager pagination={findingPagination} onPage={setPage} /></details>}
      {!review.blocked && review.records.length > 0 && <EvidenceDispositionForm busy={busy} onSubmit={onApply} />}
    </div>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M18 12H9v40h9M46 12h9v40h-9" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M24 22h16M24 32h12M24 42h16" fill="none" stroke="var(--ink)" strokeWidth="4" />
      <circle cx="44" cy="32" r="4" fill="var(--red)" />
    </svg>
  );
}

function Empty({ label }: { label: string }) { return <p className="empty-state">{label}</p>; }

function ListPager({ pagination, onPage }: { pagination: PageSlice<unknown>; onPage: (page: number) => void }) {
  if (pagination.pages <= 1) return null;
  return (
    <nav className="list-pager" aria-label="Result pages">
      <button type="button" className="secondary-button" disabled={pagination.page === 0} onClick={() => onPage(pagination.page - 1)}>Previous</button>
      <span aria-live="polite">{pagination.start}–{pagination.end} of {pagination.total}</span>
      <button type="button" className="secondary-button" disabled={pagination.page >= pagination.pages - 1} onClick={() => onPage(pagination.page + 1)}>Next</button>
    </nav>
  );
}

function hasWorkspaceContent(workspace: Workspace | null): boolean {
  if (!workspace) return false;
  const revision = activeRevision(workspace);
  return revision.records.length > 0
    || workspace.incidents.length > 0
    || (revision.archiveSchemas?.length ?? 0) > 0
    || (revision.archiveUnits?.length ?? 0) > 0
    || (revision.serviceRecords?.length ?? 0) > 0
    || Object.values(revision.config).some((value) => value.trim().length > 0);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function openHtmlDocument(filename: string, html: string, download: boolean) {
  activateLocalFile(new File([html], filename, { type: REPORT_MIME }), download);
}

function downloadText(filename: string, text: string, type: string) {
  activateLocalFile(new File([text], filename, { type: type + ";charset=utf-8" }), true);
}

function activateLocalFile(file: File, download: boolean) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener noreferrer";
  anchor.referrerPolicy = "no-referrer";
  if (download) anchor.download = file.name;
  else anchor.target = "_blank";
  document.body.append(anchor);
  try {
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
}
