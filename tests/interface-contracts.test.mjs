import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const ui = await readFile(new URL("../app/continuity-lab.tsx", import.meta.url), "utf8");
const storage = await readFile(new URL("../app/lab-storage.ts", import.meta.url), "utf8");
const freshness = await readFile(new URL("../app/output-freshness.ts", import.meta.url), "utf8");
const activation = await readFile(new URL("../app/browser-file-activation.ts", import.meta.url), "utf8");
const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");

test("application shell assigns one viewport-bounded scroll owner", () => {
  assert.match(css, /\.app-shell\s*\{[^}]*block-size:\s*100dvh[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.main-area\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s);
  assert.match(css, /\.import-panel\s*\{[^}]*max-block-size:\s*min\(45dvh,\s*30rem\)[^}]*overflow:\s*auto/s);
  assert.match(css, /html\s*\{[^}]*max-inline-size:\s*100%[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(css, /min-height:\s*(?:560|420)px/);
  assert.doesNotMatch(css, /width:\s*100vw/);
});

test("empty workbenches collapse and populated panes own bounded overflow", () => {
  assert.match(css, /\.split-view\.is-empty\s*\{[^}]*block-size:\s*auto/s);
  assert.match(css, /\.archive-record-layout\.is-empty\s*\{[^}]*block-size:\s*auto/s);
  assert.match(css, /\.record-list\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.inspector\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.archive-tree\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.archive-unit-editor\s*\{[^}]*overflow:\s*auto/s);
  assert.match(ui, /records\.length \? "split-view" : "split-view is-empty"/);
  assert.match(ui, /incidents\.length \? "split-view" : "split-view is-empty"/);
  assert.match(ui, /ordered\.length \? "archive-record-layout" : "archive-record-layout is-empty"/);
  assert.match(css, /\.service-layout\s*\{[^}]*block-size:\s*clamp\([^}]*dvh[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.service-record-list\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.service-stage\s*\{[^}]*overflow:\s*auto/s);
});

test("report controls open or download HTML with a safe Blob lifecycle", () => {
  assert.equal((ui.match(/>Open<span className="sr-only">/g) ?? []).length, 2);
  assert.equal((ui.match(/>Download<span className="sr-only"> (?:technical report|public notice)<\/span> HTML<\/button>/g) ?? []).length, 2);
  assert.match(activation, /anchor\.target = "_blank"/);
  assert.match(activation, /anchor\.download = file\.name/);
  assert.match(activation, /anchor\.rel = "noopener noreferrer"/);
  assert.match(activation, /anchor\.referrerPolicy = "no-referrer"/);
  assert.match(activation, /document\.body\.append\(anchor\)/);
  assert.match(activation, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/);
  assert.match(activation, /anchor\?\.remove\(\)/);
  assert.doesNotMatch(ui, /lacl-(?:technical-report|public-notice)\.md/);
});

test("draft-only edits participate in navigation and unload loss guards", () => {
  assert.match(ui, /const draftEditors = useRef\(new Map<string, \(\) => void>\(\)\)/);
  assert.match(ui, /useLayoutEffect\(\(\) => \{\s*register\(id, dirty, resetCurrent\)/);
  assert.match(ui, /if \(!dirty && !hasDraftChanges\) return/);
  assert.match(ui, /if \(!confirmDraftDiscard\(\)\) return false/);
  assert.match(ui, /useDraftLossGuard\(JSON\.stringify\(draft\) !== JSON\.stringify\(record\)/);
  assert.match(ui, /useDraftLossGuard\(JSON\.stringify\(draft\) !== JSON\.stringify\(baseline\)/);
  assert.match(ui, /useDraftLossGuard\(JSON\.stringify\(draft\) !== JSON\.stringify\(config\)/);
  assert.match(ui, /useDraftRegistration\(Boolean\(name\)/);
});

test("selection stays on the page that owns the selected record", () => {
  assert.ok((ui.match(/const requestedPagination = paginate\(/g) ?? []).length >= 4);
  assert.ok((ui.match(/pageContaining\([^\n]+selected\.id/g) ?? []).length >= 3);
  assert.match(ui, /effectivePage = selectedId && !requestedPagination\.items\.some/);
  assert.match(ui, /if \(!confirmDiscard\(\)\) return; const next = paginate\(incidents/);
});

test("incident updates cannot cross selections and resolution evidence is explicit", () => {
  assert.match(ui, /onUpdate: \(id: string, patch:[^\n]+\) => Promise<boolean>/);
  assert.match(ui, /await onUpdate\(incident\.id, patch\)/);
  assert.match(ui, /required=\{resolving\}/);
  assert.match(ui, /Required in the same update that resolves the incident/);
  assert.match(ui, /IncidentUpdateForm key=\{`\$\{selected\.id\}:\$\{selected\.updatedAt\}`\}/);
  assert.match(ui, /selected\?\.id !== incident\.id && confirmDiscard\(\)\) onSelect\(incident\.id\)/);
  assert.match(ui, /maxLength=\{2000\} rows=\{3\} required=\{resolving\} disabled=\{busy\}/);
});

test("review inputs can re-read the same path and announce their result", () => {
  assert.match(ui, /const file = event\.currentTarget\.files\?\.\[0\]; event\.currentTarget\.value = ""; void handleFile\(file\)/);
  assert.match(ui, /setReview\(null\);\s+await runBusy/);
  assert.match(ui, /<ReviewAnnouncements label="Import review"/);
  assert.match(ui, /<ReviewAnnouncements label="Backup review"/);
  assert.match(ui, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(ui, /role="alert" aria-live="assertive" aria-atomic="true"/);
  assert.match(ui, /className="sr-only" role="status" aria-live="polite" aria-atomic="true"/);
});

test("large archival parent choice is filtered to a bounded native selector", () => {
  assert.match(ui, />Find parent<\/span>/);
  assert.match(ui, /matchingParents\.slice\(0, 100\)/);
  assert.match(ui, /matchingParents\.filter\([^\n]+\.slice\(0, 99\)/);
  assert.doesNotMatch(ui, /units\.filter\(\(item\) => item\.id !== unit\?\.id\)\.map\(\(item\) => <option/);
  assert.ok((ui.match(/parseOneValuePerLineDraft\(/g) ?? []).length >= 2);
  assert.match(ui, /vocabulary: parseOneValuePerLine\(item\.vocabulary\.join\("\\n"\)\)/);
  assert.match(ui, /values: normalizeArchiveEditorValues\(schema, values\)/);
  assert.doesNotMatch(ui, /function splitLines|\r\?\\n\|\\s\*;\\s\*/);
});

test("storage quarantine is retained, inspected, and only copied into a new name", () => {
  assert.match(ui, /error instanceof LocalWorkspaceQuarantineError/);
  assert.match(ui, /workspaces: error\.inspection\.workspaces, inspection: error\.inspection/);
  assert.match(ui, />Storage inspection required<\/h3>/);
  assert.match(ui, /inspectLocalWorkspaceRecoveryCandidate\(choice\.workspaceId, choice\.generation\)/);
  assert.match(ui, /reconstructLocalWorkspaceFromQuarantine\(candidate\.workspaceId, candidate\.generation, candidate\.payloadDigest, newName\)/);
  assert.match(ui, /The original quarantine remains unchanged/);
  assert.match(ui, /disabled=\{busy \|\| storageQuarantined \|\| manifests\.length === 0\}/);
});

test("named local workspaces replace fixed slot selection", () => {
  assert.match(ui, />Create workspace<\/button>/);
  assert.match(ui, />Saved workspaces<\/span>/);
  assert.match(ui, /Rename or duplicate/);
  assert.match(ui, /Download current session/);
  assert.match(ui, /Download selected saved backup/);
  assert.match(ui, />Current session<\/strong>/);
  assert.match(ui, /Save current session “\$\{workspace\.name\}”/);
  assert.doesNotMatch(ui, />Save changes<\/button>/);
  assert.match(ui, /Plaintext JSON/);
  assert.doesNotMatch(ui, /Private workspace backup/);
  assert.match(storage, /workspace-manifests/);
  assert.match(storage, /workspace-generations/);
  assert.match(storage, /expectedToken/);
  assert.match(storage, /previousGeneration/);
  assert.match(storage, /previousPayloadDigest/);
  assert.match(ui, /opened\.token !== selected\.token/);
  assert.match(ui, /operationActive\.current/);
  assert.match(ui, /sessionVersion\.current !== expectedSessionVersion/);
  assert.doesNotMatch(ui, /saveRecoveredLocalWorkspace/);
  assert.doesNotMatch(ui, /Slot [ABC]|slot [ABC]/);
  assert.doesNotMatch(storage, /type Slot\s*=\s*"A"/);
});

test("download and saved-workspace actions expose their actual targets", () => {
  assert.match(ui, /Download record \$\{record\.id\} as/);
  assert.match(ui, /Download catalog as \$\{/);
  assert.match(ui, /Download<span className="sr-only"> technical report<\/span> HTML/);
  assert.match(ui, /Download<span className="sr-only"> public notice<\/span> HTML/);
  assert.match(ui, /Open saved workspace “\$\{selected\.name\}”/);
  assert.match(ui, /Delete saved workspace “\$\{selected\.name\}”/);
});

test("identity and global status copy use the finished product language", () => {
  assert.match(ui, /IN KEEPING/);
  assert.match(ui, /Library systems continuity workbench/);
  assert.match(ui, /notice && <div className="notice-bar"/);
  assert.match(ui, />Verify integrity<\/button>/);
  assert.match(ui, />Start blank working copy<\/button>/);
  assert.match(ui, /Full workspace structure and internal consistency verified/);
  assert.match(ui, /Internally consistent; not authenticated/);
  assert.match(ui, /integrityOutputBlocked = auditState !== "valid"/);
  assert.match(ui, /Compatibility and operational outputs are blocked/);
  assert.doesNotMatch(ui, /Browser-local data|Private by default · No telemetry|Session active in memory|Not saved locally|SHA-256 linked events detect local alteration/);
  assert.doesNotMatch(ui, /<h2>Audit chain<\/h2>|<h2>Safeguards<\/h2>/);
  assert.doesNotMatch(ui, /<footer className="app-footer"|Blank workspace ready|Local-first archival and access continuity|00 · New workspace|Revision REV-/);
  assert.match(favicon, /#0b4705/);
  assert.match(favicon, /#1b1d1a/);
  assert.match(favicon, /#950f22/);
  assert.doesNotMatch(favicon, /#077995/i);
});

test("outward artifacts share integrity, sample, and stale-session gates", () => {
  assert.match(ui, /const outputGate: OutputGate = sampleContaminated/);
  assert.match(ui, /activeLocalStale[\s\S]+Outputs are blocked because the named saved workspace changed in another tab/);
  assert.ok((ui.match(/outputGate=\{outputGate\}/g) ?? []).length >= 4);
  assert.match(ui, /disabled=\{outputGate\.blocked\}/);
  assert.match(ui, /disabled=\{busy \|\| outputGate\.blocked\}/);
  assert.match(ui, /const formatted = outputGate\.blocked \? ""/);
  assert.match(ui, /Ordinary outward artifacts require a named, saved workspace/);
  assert.match(ui, /Save the current workspace before generating ordinary outward artifacts/);
  assert.match(ui, /verifyOutputFreshness\(workspace/);
  assert.ok((ui.match(/verifyFreshness\("authoritative",/g) ?? []).length >= 5);
  assert.match(ui, /verifyFreshness\(technical \? "diagnostic" : "authoritative",/);
  assert.doesNotMatch(ui, /lease\.recheck/);
  assert.match(ui, /outputAttemptActive\.current = true[\s\S]+await lease\.activate\(artifact\.file, artifact\.disposition\)[\s\S]+finally[\s\S]+outputAttemptActive\.current = false/);
  assert.match(ui, /function makeTextArtifact[\s\S]+new File\(\[text\]/);
  assert.match(ui, /function makeHtmlArtifact[\s\S]+new File\(\[html\]/);
  assert.match(freshness, /opened\.token === context\.activeLocal\.token/);
  assert.match(freshness, /opened\.recoveredFromPrevious \|\| !sameToken \|\| !sameSessionState/);
  assert.match(freshness, /savedStateDigest === await workspaceStateDigest\(workspace\)/);
  assert.match(freshness, /current\.fingerprint !== initial\.fingerprint/);
  assert.match(freshness, /currentArtifactWorkspaceDigest !== artifactWorkspaceDigest/);
  assert.ok((freshness.match(/currentArtifactWorkspaceDigest !== artifactWorkspaceDigest/g) ?? []).length >= 2);
  assert.match(freshness, /externalContinuity\.status === "trusted-match"/);
  assert.match(freshness, /externalWitnessDigest:[\s\S]+externalPolicyId:[\s\S]+externalPolicyRevision:[\s\S]+externalPolicyDigest:[\s\S]+externalTopologyStatus:/);
  assert.match(freshness, /context\.activateWorkspace\(\{ \.\.\.initial\.activationIdentity, artifactSha256, workspace: artifactWorkspace \}, file, disposition\)/);
  assert.match(storage, /\[MANIFEST_STORE, GENERATION_STORE, CONTINUITY_STORE\], "readonly"/);
  assert.match(storage, /actualArtifactSha256 !== identity\.artifactSha256[\s\S]+manifest\.token !== identity\.token[\s\S]+generation\.payloadDigest !== identity\.payloadDigest[\s\S]+boundedWorkspaceSerialization\(generation\.payload\) !== expectedWorkspace[\s\S]+JSON\.stringify\(anchor\) !== expectedAnchor[\s\S]+activateBrowserFile\(artifactFile, artifactDisposition\)/);
  assert.doesNotMatch(storage, /activationAction|action:\s*\(\)\s*=>\s*void/);
  assert.match(freshness, /context\.getPendingDrafts\(\)/);
  assert.match(freshness, /context\.getOperationInProgress\(\)/);
  assert.match(freshness, /context\.getStorageVersion\(\) !== context\.expectedStorageVersion/);
  assert.match(ui, /hasDraftChanges[\s\S]+drafts are not part of the named saved generation/);
  assert.match(ui, /getPendingDrafts: \(\) => draftEditors\.current\.size > 0/);
  assert.match(ui, /getOperationInProgress: \(\) => operationActive\.current/);
  assert.match(ui, /getStorageQuarantined: \(\) => storageQuarantined\.current/);
  assert.match(ui, /const publicationStateBlocked = !activeLocal \|\| dirty \|\| activeStale/);
  assert.match(ui, /Incident for this document/);
  assert.match(ui, /makeOperationalDocument\(lease\.artifactWorkspace, documentKind, incidentBoundDocument \? selectedIncidentId : undefined\)/);
  assert.match(ui, /makePublicNoticeHtml\(lease\.artifactWorkspace, generatedAt\)/);
  assert.ok((ui.match(/activeRevision\(lease\.artifactWorkspace\)/g) ?? []).length >= 3);
  assert.match(ui, /const snapshot = await consumeWorkspaceBackupReview\(reviewed\)/);
  assert.match(ui, /const reviewedWorkspace = snapshot\.workspace/);
  assert.doesNotMatch(ui, /verifyWorkspaceBackupReviewBinding\(reviewed\)|reviewed\.workspace!/);
  assert.match(ui, /blockingFindings = findings\.filter\(\(finding\) => finding\.severity === "error" \|\| finding\.severity === "warning"\)/);
  assert.match(ui, /Informational duplicate notices.*do not permanently disable export/);
});

test("blank catalog workspaces cannot emit self-incompatible empty packages", () => {
  assert.match(ui, /const catalogOutputBlocked = outputGate\.blocked \|\| records\.length === 0/);
  assert.match(ui, /Catalog export requires at least one record/);
  assert.match(ui, /disabled=\{catalogOutputBlocked\}/);
});

test("evidence admission and continuity are explicit non-authority gates", () => {
  assert.match(ui, /Structural checks passed\. They do not establish truth, custody, completeness, or authority/);
  assert.match(ui, /<option value="">Choose…<\/option><option value="admit-unverified">Admit as unverified evidence/);
  assert.match(ui, /timeBasis: EVIDENCE_TIME_BASIS/);
  assert.match(ui, /applyImport\(workspace, review, disposition\)/);
  assert.match(ui, /applyArchiveImport\(workspace, source, disposition\)/);
  assert.match(ui, /Open workspace backup as unverified evidence/);
  assert.match(ui, /initializeLocalContinuityAnchor/);
  assert.match(ui, /continuity-not-authenticity-v1|CONTINUITY_ACKNOWLEDGMENT/);
  assert.match(ui, /Download local comparison receipt/);
  assert.match(ui, /Compare local receipt/);
  assert.match(ui, /An unsigned local receipt is diagnostic only/);
  assert.match(ui, /Download unsigned witness request/);
  assert.match(ui, /Select signed witness set/);
  assert.match(ui, /Select trust policy/);
  assert.match(ui, /Expected current policy SHA-256 · separate channel/);
  assert.match(ui, /Verify external checkpoint material/);
  assert.match(ui, /Ordinary outward artifacts require this exact saved generation to match a signed witness chain under the exact current policy digest obtained through a separate trust channel/);
  assert.match(ui, /independentReceipt: serialized/);
  assert.match(ui, /openLocalWorkspace\(id, activeLocal\?\.independentReceipt \?\? null, activeLocal\?\.externalProof \?\? null\)/);
  assert.match(ui, /Ordinary outward artifacts are blocked by active unverified or unattributed content/i);
  assert.ok(
    ui.indexOf('if (disposition.decision !== "admit-unverified")')
      < ui.indexOf('if (!confirmDraftDiscard("Open this workspace backup? Current changes will be lost.", dirty))'),
    "backup rejection/withdrawal must be recorded before any replacement confirmation",
  );
  assert.match(ui, /disposition\.decision === "admit-unverified" && !confirmDiscard\(\)/);
  assert.match(ui, /operator-withdrew[\s\S]+operator-rejected/);
});
