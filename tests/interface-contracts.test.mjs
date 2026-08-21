import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const ui = await readFile(new URL("../app/continuity-lab.tsx", import.meta.url), "utf8");
const storage = await readFile(new URL("../app/lab-storage.ts", import.meta.url), "utf8");
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
  assert.match(ui, /anchor\.target = "_blank"/);
  assert.match(ui, /anchor\.download = file\.name/);
  assert.match(ui, /anchor\.rel = "noopener noreferrer"/);
  assert.match(ui, /anchor\.referrerPolicy = "no-referrer"/);
  assert.match(ui, /document\.body\.append\(anchor\)/);
  assert.match(ui, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/);
  assert.match(ui, /anchor\.remove\(\)/);
  assert.doesNotMatch(ui, /lacl-(?:technical-report|public-notice)\.md/);
});

test("draft-only edits participate in navigation and unload loss guards", () => {
  assert.match(ui, /const draftEditors = useRef\(new Map<string, \(\) => void>\(\)\)/);
  assert.match(ui, /if \(!dirty && !hasDraftChanges\) return/);
  assert.match(ui, /if \(!confirmDraftDiscard\(\)\) return false/);
  assert.match(ui, /useDraftLossGuard\(JSON\.stringify\(draft\) !== JSON\.stringify\(record\)/);
  assert.match(ui, /useDraftLossGuard\(note\.length > 0/);
  assert.match(ui, /useDraftLossGuard\(JSON\.stringify\(draft\) !== JSON\.stringify\(config\)/);
  assert.match(ui, /useDraftRegistration\(Boolean\(name\)/);
});

test("selection stays on the page that owns the selected record", () => {
  assert.ok((ui.match(/const requestedPagination = paginate\(/g) ?? []).length >= 4);
  assert.ok((ui.match(/pageContaining\([^\n]+selected\.id/g) ?? []).length >= 3);
  assert.match(ui, /effectivePage = selectedId && !requestedPagination\.items\.some/);
  assert.match(ui, /if \(!confirmDiscard\(\)\) return; const next = paginate\(incidents/);
});

test("incident notes cannot cross selections or disappear after rejected writes", () => {
  assert.match(ui, /onUpdate: \(id: string, patch:[^\n]+\) => Promise<boolean>/);
  assert.match(ui, /if \(await onUpdate\(selected\.id, \{ note \}\)\) setNote\(""\)/);
  assert.match(ui, /selected\?\.id !== incident\.id && confirmDiscard\(\)\) onSelect\(incident\.id\)/);
  assert.match(ui, /maxLength=\{2000\} rows=\{3\} disabled=\{busy\}/);
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
  assert.match(ui, /Workspace data is internally consistent/);
  assert.doesNotMatch(ui, /Browser-local data|Private by default · No telemetry|Session active in memory|Not saved locally|SHA-256 linked events detect local alteration/);
  assert.doesNotMatch(ui, /<h2>Audit chain<\/h2>|<h2>Safeguards<\/h2>/);
  assert.doesNotMatch(ui, /<footer className="app-footer"|Blank workspace ready|Local-first archival and access continuity|00 · New workspace|Revision REV-/);
  assert.match(favicon, /#0b4705/);
  assert.match(favicon, /#1b1d1a/);
  assert.match(favicon, /#950f22/);
  assert.doesNotMatch(favicon, /#077995/i);
});
