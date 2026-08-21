# Accessibility

## Status

IN KEEPING is designed toward WCAG 2.2 Level AA, but this repository does **not** claim conformance or certification. Source inspection and deterministic regression tests cover selected semantic and layout contracts. No completed assistive-technology/browser matrix, independent audit, or production usability study is recorded in this document.

Accessibility is a release requirement because import review, save/recovery, incident management, and public communication are safety-relevant workflows. A passing build does not replace manual evaluation.

## Implemented interface structure

### Landmarks, headings, and navigation

- The application document declares English.
- A visible-on-focus skip link moves focus to the main work area.
- The shell uses header, labeled primary navigation, and one focusable main region.
- Each major view has an identified level-one heading.
- Navigation buttons expose the current view with `aria-current="page"`.
- Empty states collapse instead of reserving an arbitrarily tall canvas.

### Controls and names

- Forms use native `button`, `input`, `select`, `textarea`, `fieldset`, `legend`, `details`, and `summary` elements.
- Visible labels wrap or are programmatically associated with inputs.
- Icon-only close/dismiss controls have accessible names.
- Download and saved-workspace controls name the actual record, format, report, current session, or selected saved workspace rather than exposing repeated unlabeled “Download,” “Open,” or “Delete” actions.
- Toggle-like rows expose selection through `aria-pressed`; primary navigation exposes page state.
- Disabled controls remain native disabled controls and, where necessary, reference explanatory text with `aria-describedby`.

### Status and error communication

- Import and backup results use `role="alert"` when blocked and `role="status"` when ready.
- A polite, atomic live region announces global operation messages.
- Storage quarantine has an alert heading, live candidate status, explicit selection, and named reconstruction action.
- Field errors are associated with the relevant form and use alert semantics.
- Pagers expose a polite `start–end of total` status.
- Status is expressed in text as well as color. Decorative severity marks are hidden from assistive technology.

### Focus and keyboard behavior

- Native controls supply their normal keyboard interaction.
- Buttons, links, inputs, selects, textareas, and summaries have a visible `:focus-visible` outline.
- Closing the import panel returns focus to the Import button.
- View changes move focus to the main region.
- Draft-loss guards cover view changes, row selection, filters, page changes, workspace actions, and page unload. Confirmation is not a substitute for autosave, but it prevents silent loss during keyboard or pointer navigation.
- Technical report tables and long preformatted blocks are focusable regions when independent scrolling is needed.

No roving-tabindex or custom composite widget behavior is claimed. The archival parent chooser uses a native search input plus a bounded native select rather than thousands of options.

## Record comparison semantics

Every catalog comparison is labeled **Original input and new output** and contains two separately titled record blocks. Original source elements use a description list with code, name, value, and an accessible definition referenced by `aria-describedby`. The normalized record is rendered as a complete, readable field set rather than a short generated evidence summary.

Technical Report catalog, archive, and service entries follow the same two-block record pattern. This does not guarantee that a crosswalk is semantically correct; it ensures the evidence needed for review is present and named.

## Viewport, reflow, and scrolling

The application shell uses `100dvh` and hides page-level overflow. The main area is the primary scroll owner. Data-heavy panes—record lists, inspectors, archive trees/editors, service lists/stages, and the import panel—own bounded internal scrolling. CSS uses logical block/inline properties, percentages, `dvh`, `rem`, `min()`, `max()`, `clamp()`, and grid/flex layouts rather than a fixed desktop canvas.

The design intention is:

- no content positioned outside the viewport as a required interaction target;
- one predictable main scroll area plus bounded data panes;
- empty panes that reduce to their content;
- narrow layouts that stack or simplify multi-column regions; and
- horizontally scrollable tables/preformatted records when preserving the record form is more usable than clipping.

These are source-level properties. Manual reflow testing at 320 CSS pixels, 400% zoom, browser text zoom, mobile viewport resizing, and operating-system scrollbar configurations remains required.

Large record, incident, service, and archive indexes use a shared 100-row page contract. The selected row is moved to its containing page after creation/update, preventing a selected detail from becoming disconnected from an invisible list row. Archival parent search shows at most 100 options at once.

## Visual presentation

The visual system uses Jost, a paper background, dark ink, dark green for accepted/current state, dark red for blocking/destructive state, and structural hairlines. Jost is self-hosted; the interface does not depend on a remote font. Forced-colors rules add current-color borders to important status surfaces, and reduced-motion rules remove transitions and smooth scrolling.

Color values and CSS inspection alone are not accepted contrast evidence. Required manual validation includes normal text, large text, focus indicators, hairlines/borders, disabled controls, green/red state surfaces, links, and selected rows under default, high-contrast/forced-color, and user style settings. Information must remain understandable without distinguishing green from red.

## Generated report accessibility

Technical Report and Public Notice HTML files:

- declare English and a light color scheme;
- embed Jost and all CSS, with no remote dependency;
- include a skip link, document header, one main region, an article label, and ordered heading hierarchy;
- use `figure`, `figcaption`, and descriptive text for software/data flows;
- represent diagrams as one ordered semantic path, without crossing lines or an unlabeled SVG;
- use captioned tables inside labeled, focusable scroll regions;
- label Jupyter-style prompt text as decorative where it does not convey record meaning;
- expose Original/New sections and definitions as document structure; and
- include no script, iframe, form, object, embed, or remote URL.

The report renderer is covered by structural tests. It has not been certified in screen readers, office-suite HTML importers, PDF conversion tools, or archival web viewers. Conversion to another format creates a new accessibility review boundary.

## Known limitations and non-claims

- No screen-reader results are recorded for NVDA, JAWS, VoiceOver, TalkBack, or Narrator.
- No keyboard-only task-completion protocol has yet been recorded against a production build.
- No automated axe-core, Accessibility Insights, Lighthouse accessibility, or equivalent report is part of the current release gate.
- Interface contract tests inspect source strings and CSS contracts; they are not a browser accessibility tree or interaction test.
- The application uses browser confirmation dialogs for draft/discard and destructive confirmation flows; wording and focus return require browser-specific review.
- Long record values, dense description lists, and independently scrolling panes may require usability adjustment after testing with magnification and screen readers.
- Native select behavior and file input presentation vary by browser/operating system.
- The application language is English; no localization, language switcher, or bidirectional-layout assurance is provided.
- Imported content can contain language changes that are not individually marked with `lang`.
- Accessibility of files after opening in third-party cataloging, spreadsheet, office, or archival software is outside this renderer.
- A disabled Public Notice control has explanatory association, but institution-specific communications guidance is external.

These limitations do not waive accessibility obligations. They identify evidence that must be collected before a conformance statement.

## Manual acceptance protocol

Record results by browser, operating system, viewport, input method, and assistive technology. Retain issue IDs and screenshots/transcripts where permitted.

### Keyboard-only tasks

1. Load a blank workspace and use the skip link.
2. Open and close Import, verify focus return, load Sample data, and review a record.
3. Review Original/New blocks and definitions; apply or reject an import.
4. Search/filter/page records and verify selection stays connected to the visible row.
5. Create and edit an archive schema/record, including parent search.
6. Create/edit service and incident records; add a note and confirm failure does not clear it.
7. Make a configuration draft, attempt navigation, and verify discard protection.
8. Create, save, open, rename, duplicate, back up, and delete a named workspace.
9. Exercise quarantine inspection with a controlled corrupt fixture; verify candidate status and reconstruction naming.
10. Open/download both report types and navigate headings, tables, diagrams, and Original/New blocks.

Acceptance requires a logical focus order, visible focus, no keyboard trap, complete accessible names, understandable errors/status, and no silent draft loss.

### Zoom, reflow, and visual checks

Test at 200% and 400% browser zoom, 320-by-256 CSS pixel viewport, increased text size, minimum and large supported viewport heights, reduced motion, Windows forced colors/high contrast, and a color-vision simulation. Confirm that:

- essential controls and headings remain visible or reachable by the correct scroll owner;
- no text or control is clipped without a scrolling mechanism;
- focus is not hidden behind sticky or scrollable content;
- state does not depend on color alone;
- hit targets are usable with pointer and touch where touch is in scope; and
- record blocks/tables remain associated with labels and definitions.

### Assistive-technology matrix

At minimum, the institution should select one Chromium and one non-Chromium browser, plus the screen reader combinations required by its support policy. Test landmarks/headings, form labels/instructions, validation, live regions, expanded state, pressed/current state, pagers, file inputs, details/summary, scroll regions, report tables, and quarantine recovery. Record versions and results; do not infer one platform from another.

## Automated evidence

| Evidence | What it checks | What it does not check |
| --- | --- | --- |
| [`tests/interface-contracts.test.mjs`](../tests/interface-contracts.test.mjs) | Viewport scroll-owner CSS, native/labeled controls and action names, draft guards, live regions, pagination/selection, bounded parent selector, quarantine surface | Browser accessibility tree, focus execution, screen-reader speech, contrast, touch |
| [`tests/list-pagination.test.mjs`](../tests/list-pagination.test.mjs) | 100-row boundary, hostile/stale page clamping, selected-record page resolution | Render performance and comprehension |
| [`tests/report-documents.test.mjs`](../tests/report-documents.test.mjs) | Report language/structure, skip link, semantic diagrams/tables, no active/remote content, Original/New content | Screen-reader/browser behavior and converted formats |
| [`tests/rendered-html.test.mjs`](../tests/rendered-html.test.mjs) | Production HTML and security response policy | Visual/reflow/accessibility behavior |

Current execution evidence is recorded in [`VALIDATION_REPORT.md`](VALIDATION_REPORT.md). A test file's existence is not evidence that it passed a particular release candidate.

## Defect handling

Accessibility defects use the same release-blocking policy as functional and security defects when they prevent task completion, obscure a destructive action, lose data, or make status/error information unavailable. Fixes require a regression test where automation can represent the failure and a recorded manual retest for behavior automation cannot represent.

Any conformance statement must identify exact version, pages/views, user agents, assistive technologies, exceptions, evaluation method, evaluator, and date. This document alone is not such a statement.
