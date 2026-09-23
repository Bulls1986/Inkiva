# CORRECTNESS-02 / Source Mode Readiness — Progress

Branch: `correctness-02-source-mode-readiness`
Base: `origin/develop@cbc7e162` (rebased after BASELINE-02 closure)
Status: in progress

## Phase 1 — Architecture / data-flow audit

### Current Source Mode data flow

1. The visible source editor is CodeMirror 5 and owns a complete in-memory Markdown document while Source Mode is mounted.
2. Initial text comes from the active tab's `markdown` prop. External file-load/file-change events can replace the CodeMirror value with the incoming full Markdown text.
3. A CodeMirror `change` event is the source-mode mutation boundary. It does not synchronously serialize the whole document. Instead it:
   - advances the document content revision through `editorStore.MARK_CONTENT_DIRTY(id)`;
   - persists the source cursor;
   - schedules a coalesced source snapshot tagged with that exact revision.
4. The delayed source snapshot reads `cm.getValue()`, seeds `documentRevisionSnapshots` for that revision, and then publishes the Markdown/cursor through `LISTEN_FOR_CONTENT_CHANGE`.
5. Hard boundaries flush the pending snapshot before consuming document state: explicit save, tab switch, source view unmount, and the generic active-editor flush events.
6. Explicit save calls `flushActiveEditorForSave()`, reads the current document revision, then reads Markdown for that revision from `documentRevisionSnapshots` (falling back to the tab Markdown only when no snapshot exists), and sends that exact revision to the main process.
7. Source -> WYSIWYG handoff happens when Source Mode unmounts: it flushes the current source snapshot, captures the current source Markdown/cursor, disposes the scheduler/listeners, and emits `file-changed`. The WYSIWYG editor consumes that event and rebuilds/replaces its document state.
8. WYSIWYG -> Source initialization uses the active tab/document Markdown snapshot passed into `sourceCode.vue`; Source Mode does not read the currently mounted WYSIWYG DOM.
9. Source undo/redo is owned by CodeMirror while Source Mode is active. Existing E2E coverage explicitly verifies that Edit/shortcut undo/redo routes to CodeMirror rather than the hidden WYSIWYG engine.
10. Tab isolation is document-id keyed. Before a cross-tab file change, Source Mode flushes the outgoing tab snapshot and publishes its cursor/Markdown before adopting the incoming tab id/value.
11. Lifecycle cleanup currently removes all Source Mode bus listeners, clears the word-count timer, flushes the final source snapshot while the component is still current, disposes the snapshot scheduler, then emits the final `file-changed` handoff.
12. Outline/TOC is derived through editor-store content-change propagation, not directly from the CodeMirror DOM. Source-mode TOC click navigation resolves headings against the full CodeMirror value.

### Revision contract observed

- `documentRevisionSnapshots` owns one monotonic content revision per document id.
- Presentation-only state does not advance content revision.
- Advancing a revision invalidates derived Markdown/blocks/history metadata for the prior revision.
- Snapshot writes are revision-guarded: a derived value is stored only when the cache entry still owns the same revision.
- Async derived work that settles for an older revision is dropped rather than overwriting the current snapshot.
- Source snapshot scheduling coalesces rapid edits and retains only the newest requested callback for the document boundary.
- The critical correctness question for CORRECTNESS-02 is therefore whether every hard boundary flushes the newest CodeMirror content into the current revision before save/switch/unmount consumers read it.

### Existing coverage found

- Source snapshot coalescing / newest-revision flush / stale-tab cancel unit tests.
- Source dirty tracking regression coverage.
- Source undo/redo E2E.
- Source TOC navigation coverage.
- Source/WYSIWYG saved-state and undo parity coverage.
- View-mode source toggle/menu-state coverage.
- Source-mode caret parity and virtualization round-trip coverage.
- External reload source scroll restore coverage.

### Gaps to close next

- Direct editor == document snapshot == on-disk assertions for immediate Source save.
- Rapid edit -> immediate save / mode switch / tab switch revision-race tests.
- Full-document select/copy/cut/delete/undo semantics on large source text.
- Invalid Markdown and invalid diagram intermediate-state round trips.
- Repeated Source <-> WYSIWYG switching with edits.
- Standard 50K / 500K / 1M correctness probes at head/middle/tail with reopen verification.
- Heading mutation -> Outline refresh including bulk headings.
- 8-tab independent source buffers/history/selection.
- CJK/Unicode edit/delete/clipboard/undo/mode-switch coverage.
- Source lifecycle repetition / listener and scheduler non-accumulation evidence.

## Phase 2 — Harness

Test design is complete and the focused Source readiness spec has been added at `packages/desktop/test/e2e/source-mode-readiness.spec.ts` using the existing Electron/Playwright helpers, per-launch temp Markdown files, and isolated userDataDir behavior.

Local execution is currently blocked by environment/bootstrap rather than product behavior:

- the first E2E smoke was invalid because the config path was wrong and the worktree had no current-branch build artifact;
- reusing the main checkout root `node_modules` via Junction was rejected after `node_modules/@muyajs/core` resolved to the main checkout `packages/muya`, which violates current-worktree source ownership;
- one 120-second and one 600-second `pnpm install --offline --frozen-lockfile --ignore-scripts` attempt both timed out silently and produced no worktree-local `node_modules`;
- no Source product failure is inferred from these bootstrap failures.

The new deterministic coverage fills gaps rather than duplicating the existing virtualization suites: immediate revision/save flush, immediate mode-switch stale-overwrite guard, 100 switch cycles with edits, complete-source Select All/Copy, invalid Markdown exact round-trip/save, and 50K/500K/1M full-source head/middle/tail edit + immediate disk save.

## Phase 3 — P0

Test definitions added; execution evidence pending CI because the local harness is blocked. No production code has been changed without a red product test.

Existing coverage retained as supporting evidence:

- Source CodeMirror undo/redo ownership: `issue-781-source-undo.spec.ts`;
- Source/WYSIWYG undo and saved-state parity: `parity-source-undo-saved.spec.ts`;
- full logical Source independent of mounted virtual DOM plus CJK/Emoji: `virtualization-source-view-cjk.spec.ts`;
- invalid Mermaid intermediate-state recovery: `virtualization-diagram-recovery.spec.ts`;
- Source TOC navigation and WYSIWYG live TOC updates: `source-toc-scroll.spec.ts` / `toc-panel-content.spec.ts`;
- latest-revision save with unmounted tail: `virtualization-editing-operations.spec.ts`.

## Phase 4 — Large documents

50K / 500K / 1M correctness probes are defined in `source-mode-readiness.spec.ts`. Each asserts complete initial Source text, head/middle/tail edits, an immediate save without waiting for the source debounce, actual disk content, and complete-document size/tail evidence. Execution evidence pending CI.

## Phase 5 — Outline / Find / Tab / Selection / CJK

Pending.

## Phase 6 — Combination scenarios / lifecycle

Pending.

## Phase 7 — Full regression

Pending.

## Phase 8 — CI

Pending.

## Phase 9 — Documentation / learning review

Pending.

## Phase 10 — PR closeout

Pending.
