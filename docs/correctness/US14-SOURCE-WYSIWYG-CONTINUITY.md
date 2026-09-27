# US14 — Source / WYSIWYG Continuity

## Task identity

- Branch: `feat/us14-source-wysiwyg`
- Base: `develop@7ffc085d`
- Scope: v0.5.0 US14, AC-59 / AC-60 / AC-61 plus supplemental AC-80.
- Classification: P0 editor correctness / interaction continuity.

## Product contract

1. Source and WYSIWYG are two views over the same document revision; a mode switch alone must not create a content revision, save, or extra undo boundary.
2. While IME composition is active, a Source-mode request is deferred. Only the latest request for the composing document may run after composition ends.
3. Leaving the composing tab/window cancels its queued mode request; it must never mutate another document's mode or body.
4. Source Markdown that cannot be represented safely by the WYSIWYG model remains authoritative and editable in Source. The mode switch is rejected without replacing or normalizing the source text.
5. Caret/viewport restore remains semantic and revision-neutral. Existing virtual-surface ownership stays behind Muya's `IDocumentSurface`; Desktop must not inspect private virtual-window state.

## Architecture gate

Read before production mutation:

- `docs/agent/TESTING.md`
- `docs/agent/ARCHITECTURE_RELEASE.md`
- `docs/architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md`
- `docs/architecture/ARCH-03-VIRTUAL-SURFACE-CONTRACT.md`
- `docs/architecture/ARCH-04-BLOCK-GEOMETRY-UNIFICATION.md`
- `docs/architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md`
- prior `docs/correctness/correctness-02-source-mode-progress.md`

Ownership conclusion:

- Muya remains authoritative for Markdown parse/representation semantics.
- `DocumentEditorRuntime` remains high-level WYSIWYG lifecycle/revision owner.
- Source-mode transition intent is renderer UI state and must stay document-keyed.
- Desktop may consume a public Muya representability decision but must not duplicate the Markdown parser.

## Stage 0 — baseline / diagnosis

Status: complete.

Confirmed existing protection on the `develop` base:

- Source edits advance the same document revision and hard boundaries flush the latest CodeMirror snapshot.
- Source -> WYSIWYG handoff preserves exact Source bytes and suppresses rebuild-only `json-change` mutation recording.
- Repeated 100-cycle Source/WYSIWYG round trips, immediate save, invalid/intermediate Markdown byte preservation, and 50K/500K/1M Source correctness already have E2E coverage.
- Offscreen logical-block Source round-trip caret restoration is already covered by `virtualization-core.spec.ts`.

Confirmed US14 gaps before implementation:

- WYSIWYG tracks `editorCompositionActive` for command readiness, but Source-mode commands mutate `preferences.sourceCode` immediately; there is no composition-aware mode transition contract.
- Source CodeMirror has no corresponding document-keyed composition handoff contract for exiting Source.
- The existing readiness suite intentionally permits unfinished Markdown to enter WYSIWYG. US14 adds a stricter requirement: when Muya cannot safely represent the Source snapshot, remain in Source rather than exposing a normalized/ambiguous WYSIWYG state.

## Red gate

Focused E2E: `packages/desktop/test/e2e/us14-source-wysiwyg.spec.ts`.

Environment evidence before the Red run:

- `pnpm install --offline --frozen-lockfile --ignore-scripts` completed: 1851 resolved / 1827 reused / 0 downloaded.
- Only the exact Electron/ced runtime package paths required by E2E were linked from matching healthy dependency graphs; no package-level dependency tree or donor build output was reused.
- Current-worktree `pnpm -C packages/desktop run build:app` completed successfully; renderer build finished in 35.09 s.

A first negative assertion without a dwell window produced a false green because Main -> Renderer menu IPC had not reached the renderer yet. The test was corrected before production mutation: after the menu click it now observes the current surface for 250 ms before asserting that a composition-gated transition has not happened.

Valid Red run after that correction:

- Command: `pnpm -C packages/desktop exec playwright test test/e2e/us14-source-wysiwyg.spec.ts --config=test/e2e/playwright.config.ts --workers=1`
- Result: **4 failed / 0 passed**, all after Electron launch and entry into the intended test body.
- AC-60 WYSIWYG -> Source: Source mounted during active composition instead of waiting.
- AC-60 Source -> WYSIWYG: Source unmounted during active CodeMirror composition instead of waiting.
- AC-80: the original composing tab switched mode before the test could leave it, proving there is no document-keyed pending/cancel contract.
- AC-59: an unfinished fenced block exited Source; `.source-code .CodeMirror` disappeared instead of remaining editable with the exact source text.

This is the production Red gate. No production code had been changed when it was captured.

## Implementation

Status: complete.

The production change is intentionally narrow:

- `preferences.ts` no longer flips `sourceCode` directly. Source-mode requests are routed to one renderer-level transition coordinator.
- `editorWithTabs/index.vue` owns a document-keyed pending intent (`documentId + target`), captures composition events from both WYSIWYG and CodeMirror, applies latest-intent-wins, and clears pending state when the active document or window changes.
- `sourceCode.vue` owns Source snapshot readiness. Before Source -> WYSIWYG, it flushes the current CodeMirror snapshot and asks Muya whether that exact Markdown is safe to represent.
- `@muyajs/core` exposes `isMarkdownWysiwygRoundTripSafe`. The check stays inside Muya: incomplete fenced blocks are rejected with a linear scan, then the parsed state must serialize back without changing meaningful Markdown bytes. Desktop does not duplicate Muya parsing rules.
- The existing revision/save/history/virtual-surface paths were not replaced. Safe switches continue through the existing Source handoff, so mode changes do not add a content revision merely because the view changed.
- The old CORRECTNESS-02 expectation that unfinished Markdown may leave Source was updated to the US14 contract: unsafe Markdown remains in Source and still saves byte-for-byte.

## Green / regression evidence

Deterministic local evidence captured from the US14 worktree:

- Current-worktree Electron build: **PASS** after the final production/test changes (`electron-vite` main + preload + renderer, 33.99 s on the final recorded build).
- Muya safety unit suite reached **3/3 PASS** before the later behavior-preserving regex-to-linear-scan lint refactor. After that refactor, the final Electron US14 suite and Muya ESLint/architecture guards are green; a final unit re-run was blocked before test discovery by the late-session Windows Node launcher issue and is not claimed as fresh green evidence.
- US14 focused Electron E2E: **5/5 PASS**:
  - WYSIWYG -> Source waits for IME composition end.
  - Source -> WYSIWYG waits for CodeMirror composition end.
  - two queued toggles during one composition obey latest-intent-wins.
  - leaving the composing tab cancels the queued transition.
  - an unfinished fenced block remains editable in Source with exact text preserved.
- Desktop changed-file ESLint: **PASS**.
- Muya changed-file ESLint: **PASS**.
- Muya `tsc --noEmit`: **PASS**.
- `scripts/muya-public-type-boundary.test.mjs`: **1/1 PASS**.
- `scripts/recovery-history-boundary.test.mjs`: **1/1 PASS**.
- `git diff --check`: **PASS**.
- Combined US14 + existing Source readiness run: **12/13 PASS**. The sole failure was the full-document clipboard assertion: the copied text differed only by Windows `LF -> CRLF` normalization; no content bytes other than line-ending representation differed. This is recorded as platform/test-normalization evidence, not as content-loss evidence.

Typecheck note:

- `packages/desktop` `vue-tsc` in this fresh worktree reports existing Muya ambient/type-topology errors (`__MUYA_BLOCK__`, `MUYA_VERSION`, file-icons, sequence/prism declarations). The same command is green in the pre-warmed US13 worktree, while the current-worktree application build and Muya's own typecheck are green. This is classified as local dependency/topology evidence, not a US14 code regression; CI remains authoritative for the full desktop type gate.

AC-61 note:

- The durable existing regression is `virtualization-core.spec.ts` -> `source mode round-trip restores a caret in an offscreen logical block`.
- US14 does not alter the virtual surface, logical-block mapping, cursor serializer, or viewport restore code. The new coordinator delegates safe transitions into the same existing handoff.
- A late-session attempt to re-run that single E2E was blocked before test-body output by the Windows NVM/shim launch issue documented below. It is therefore not claimed as new local green evidence.

## Lessons consolidated

1. **Negative async UI assertions need a dwell window.** A `count === 0` check immediately after a Main -> Renderer IPC request can falsely pass before the IPC arrives. For deferred-transition tests, first prove the request had time to reach the renderer, then assert that the forbidden transition still has not happened.
2. **Mode intent belongs to the document, not the global preference bit.** IME deferral must carry `{documentId, target}` and must be invalidated on tab/window ownership loss; otherwise a late composition end can mutate the wrong document.
3. **Source safety belongs to Muya.** Desktop may ask whether a snapshot is representable, but Markdown structural detection and parse/serialize stability must stay in the editor engine boundary.
4. **Round-trip byte equality alone is insufficient for editing intermediate states.** Muya can preserve an unfinished fence byte-for-byte while still interpreting it as a fenced block. Structural incompleteness must be rejected before the round-trip comparison.
5. **Do not treat wrapper/bootstrap failures as product red.** The valid Red was captured only after current-worktree build + Electron launch + entry into the intended assertions.

## Closeout state

Implementation, focused product Red -> Green, static lint, Muya type/unit gates, architecture guards, diff review, and stage/lesson recording are complete.

Remaining repository workflow: commit the exact US14 change set, push the task branch, create/update the PR, and follow CI. Per repository policy this task must not auto-merge unless explicitly authorized.
