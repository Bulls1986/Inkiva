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

First authoritative CI execution (run 603) completed 380 E2E cases: 363 passed, 15 skipped, 2 failed. Lint, unit Test, Windows build, macOS x64 build, and macOS arm64 build were green.

The first failure is a confirmed existing product defect and Source truth-contract violation: the invalid/intermediate Markdown case survives inside CodeMirror, but Source -> WYSIWYG -> Source caused Muya `replaceContent()` to synchronously emit `json-change`; that event was recorded as a fresh user mutation and serialized Muya's normalized Markdown back over the exact Source snapshot. In the reproduced case an unfinished fenced block gained an auto-generated closing fence plus newline. The focused red E2E remains the regression gate.

The minimal production fix is constrained to the handoff boundary: while Muya synchronously rebuilds presentation state from the canonical Source snapshot, its rebuild `json-change` is not recorded as a new document mutation. Normal WYSIWYG edits remain unchanged. This preserves Source Markdown as the canonical revision while still rebuilding the rendered editor and its single undo boundary.

Second CI execution confirmed that fix removed the parser/serializer corruption: the unfinished fenced block is no longer auto-closed. The remaining byte difference was reduced to exactly one trailing newline. Root cause is the editor store's generic `adjustTrailingNewlines()` normalization running on Source-origin snapshots. Source updates now carry an explicit `preserveTrailingNewlines` contract so CodeMirror text remains byte-identical through store/revision/mode-switch/save boundaries; WYSIWYG-origin updates retain the existing final-newline preference behavior.

Existing coverage retained as supporting evidence:

- Source CodeMirror undo/redo ownership: `issue-781-source-undo.spec.ts`;
- Source/WYSIWYG undo and saved-state parity: `parity-source-undo-saved.spec.ts`;
- full logical Source independent of mounted virtual DOM plus CJK/Emoji: `virtualization-source-view-cjk.spec.ts`;
- invalid Mermaid intermediate-state recovery: `virtualization-diagram-recovery.spec.ts`;
- Source TOC navigation and WYSIWYG live TOC updates: `source-toc-scroll.spec.ts` / `toc-panel-content.spec.ts`;
- latest-revision save with unmounted tail: `virtualization-editing-operations.spec.ts`.

## Phase 4 — Large documents

50K / 500K / 1M correctness probes are defined in `source-mode-readiness.spec.ts`. Each asserts complete initial Source text, head/middle/tail edits, an immediate save without waiting for the source debounce, actual disk content, and complete-document size/tail evidence.

Run 603 evidence: 50K and 500K passed. The 1M case failed in the test helper before content assertions. A later architecture check confirmed the bounded-source threshold is 2 MiB, so 1 MiB is intentionally still inside the normal WYSIWYG envelope; the earlier test incorrectly assumed 1 MiB must already be degraded. The readiness helper now toggles the real Source command and gives the async CodeMirror surface the same 60-second large-document readiness window, while preserving the exact 1 MiB workload and all head/middle/tail/save assertions.

## Phase 5 — Outline / Find / Tab / Selection / CJK

P1 coverage in `source-mode-readiness-p1.spec.ts` covers: latest-revision Find after an immediate Source edit and undo; eight independent Source tabs with no cross-document history/content leakage; exact CJK/Unicode surrogate-pair edit + Source undo/redo + mode round trip; and 500 Source headings propagated to Outline in exact order with navigation.

The second CI execution exposed two separate facts. First, Find was genuinely unavailable in Source Mode because `EditorSearch` was mounted only under `v-if="!sourceCode"`; this is a real P1 product gap, not a stale-search race. The search UI is now owned by the editor-with-tabs container and Source Mode computes matches directly from current CodeMirror text, while hidden Muya search handlers are suppressed in Source Mode. Second, the 500-heading test expected all 500 Outline nodes to exist in the DOM simultaneously, but Inkiva intentionally virtualizes outlines above 300 rows; the store contains the full TOC while only a bounded visible window is mounted. The test now asserts the authoritative 500-item TOC snapshot, then verifies the virtualized first/last rows and navigation to heading 500.

## Phase 6 — Combination scenarios / lifecycle

The 100-cycle Source/WYSIWYG test now also asserts exactly one CodeMirror instance while Source is active and zero after every exit, providing deterministic component-instance non-accumulation evidence alongside the static Source cleanup audit and scheduler disposal tests. Deeper memory/listener growth measurement remains STAB-01 scope; CORRECTNESS-02 will not invent a memory threshold.

## Phase 7 — Full regression

Pending.

## Phase 8 — CI

PR #180 first substantive CI run: Lint green after test-style correction; unit Test green; Windows/macOS builds green; E2E red on invalid-Markdown and the 1M bounded-source helper assumption.

Second substantive CI run on remote head `dafe8067`: Lint, Test, Performance Fast Gate, Windows build, macOS x64 build, macOS arm64 build, and artifact publication all green. E2E failed in four Source-readiness scenarios: invalid Markdown now differed only by one final newline (product contract gap identified above); 1M still entered the generic helper before the async bounded-source wrapper had mounted (test infrastructure, now waits explicitly for bounded-source); Find proved a real missing Source feature; and the 500-heading Outline assertion conflicted with the intentional Outline virtualization architecture. All four causes are now addressed without reducing document sizes, heading counts, or correctness requirements. A new CI run is required before readiness can advance.

Third substantive CI run on remote head `bf13e2f3`: all non-E2E gates were green again. The invalid-Markdown defect and P1 Source Find scenario no longer appeared as failures. Remaining Source-readiness failures were test-contract issues: the 1 MiB case incorrectly expected the 2 MiB bounded-source threshold, the Outline store probe read nonexistent `label` rather than authoritative `content`, and the legacy find-replace suite still asserted that Find must be absent in Source Mode. Those tests are now aligned with the current Source contract without reducing the 1 MiB or 500-heading workloads. One unrelated WYSIWYG replace-all/undo saved-state assertion also failed in the same run and remains a full-regression item to re-check before closeout.

The replace-all/undo saved-state failure was traced to the first P0 handoff fix rather than dismissed as unrelated flake. Suppressing Muya's synchronous Source-handoff `json-change` correctly protected canonical Markdown, but also skipped the synthetic save-history update. A Source-seeded baseline could therefore be saved with one history id while a later WYSIWYG undo revisited the same content under another id, leaving the tab falsely dirty. The handoff now explicitly publishes only synthetic history metadata computed from Muya's normalized presentation state while carrying the exact Source Markdown/revision back through the store. This preserves Source truth ownership and restores undo-to-saved identity without re-enabling serializer overwrite.

Fourth substantive CI run on remote-equivalent tree `ab58edbf` (run 609) confirms the P0 invalid-Markdown and handoff-history regressions are no longer present: Lint, Test, PR Build, and Performance Fast Gate are green, with 367 E2E passed / 15 skipped / 2 failed. Both remaining failures were traced to incorrect test contracts rather than product behavior. Source Find returned `1 / 2`, proving both matches were found while the test incorrectly expected the initial current-match index to be `2 / 2`. The 500-heading Outline test clicked heading 500 successfully, but then required `activeTocSlug` to remain 500; the established scroll-sync contract recomputes active heading from the settled viewport activation line, and bottom-of-document scroll clamping legitimately makes heading 494 the active viewport heading. The gates now assert the real contracts: `1 / 2` for the initial Find result and actual viewport intersection of heading 500 after navigation, without changing the 500-heading workload.

## Phase 9 — Documentation / learning review

Pending.

## Phase 10 — PR closeout

Pending.
