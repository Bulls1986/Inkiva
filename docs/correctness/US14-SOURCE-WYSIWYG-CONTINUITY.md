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
- `@muyajs/core` exposes `isMarkdownWysiwygTransitionSafe`. The check stays inside Muya and consumes parser-owned semantic metadata: an explicitly unfinished fenced block (`fenceClosed === false`) is unsafe, while otherwise representable Markdown is allowed even when Muya's serializer would normalize formatting. Desktop does not duplicate Markdown parsing rules.
- The existing revision/save/history/virtual-surface paths were not replaced. Safe switches continue through the existing Source handoff, so mode changes do not add a content revision merely because the view changed.
- The old CORRECTNESS-02 expectation that unfinished Markdown may leave Source was updated to the US14 contract: unsafe Markdown remains in Source and still saves byte-for-byte.

## Green / regression evidence

Deterministic local evidence captured from the US14 worktree:

- Current-worktree Electron build: **PASS** after the CI remediation and API naming closeout (`electron-vite` main + preload + renderer, 35.70 s on the final recorded build).
- Muya transition-safety unit suite: **5/5 PASS**. It covers canonical Markdown, terminal-newline variants, tables whose serializer spacing may differ, task/bullet lists, and an unfinished fenced block.
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

## PR #208 first-CI remediation

The first PR head (`eb9650c4`) completed **10/11 workflows successfully**. Lint, Test, Muya Lint/Test/Build/E2E, CommonMark+GFM, circular-dependency check, Performance Fast Gate, and the complete three-platform PR Build/package/updater-smoke chain were green. The only red workflow was Desktop E2E:

- **379 passed / 15 skipped / 11 failed**.
- All 11 failures clustered around Source-mode entry/exit helpers.
- Nine failures (all-blocks round-trip, table alignment, PG1 table state, US12 table editing, issue-4346) could not leave Source because the initial safety gate required Muya parse -> serialize byte equality.
- Two Typora IME tests attempted to call `getMarkdownContent()` while composition was active. That helper enters Source to read Markdown, which directly conflicts with US14's contract that a mode switch must wait for `compositionend`.

Root cause:

1. **Representability and byte stability were incorrectly conflated.** Muya may normalize table/list formatting during serialization even though the Markdown is valid and safely modelled in WYSIWYG. Source byte stability is already protected by the existing desktop handoff/revision contract and is not a precondition for entering WYSIWYG.
2. **The first implementation duplicated fence parsing.** Muya already carries `code-block.meta.fenceClosed`; the transition gate should consume that semantic state instead of maintaining a parallel fence scanner.
3. **A read helper had an interaction side effect.** IME tests need a read-only document observation path; switching modes merely to inspect Markdown invalidates the behavior being tested.

Remediation:

- transition safety now parses once through `MarkdownToState` and rejects only parser-described unsafe intermediate state (`fenceClosed === false`) or parse failure;
- serializer byte equality and the duplicate fence scanner were removed;
- the public API was renamed from `isMarkdownWysiwygRoundTripSafe` to `isMarkdownWysiwygTransitionSafe` to match the actual contract;
- the two IME tests now read `editor.currentFile.markdown` directly from Pinia rather than entering Source.

Post-remediation local evidence:

- Muya transition-safety Red: table + task-list regressions reproduced **2 failed / 3 passed** before the production fix.
- Muya transition-safety Green: **5/5 PASS** after the fix.
- The seven specs containing the original CI failures plus US14: the original all-blocks/table/PG1/US12/issue-4346 failures all turned green, and US14 remained **5/5 PASS**. The remaining two IME failures were the helper-contract issue above.
- Corrected Typora IME focused run: **2/2 PASS**.
- Final targeted run (US14 + all-blocks + full Typora): **23/24 PASS**; the sole failure was the pre-existing/order-sensitive `pairs Markdown marker *` caret-placement test, which was green in the first GitHub full E2E and passed immediately when re-run alone (**1/1**). No product change was made for that unrelated fluctuation.
- Final Muya ESLint, Desktop touched-file ESLint, Muya `tsc --noEmit`, Muya public-boundary guard, recovery/history boundary guard, Electron build, and `git diff --check`: **PASS**.

## PR #208 second-CI remediation

The second PR head (`7ad13ba7`) again completed **10/11 workflows successfully**. All first-CI failures disappeared. Desktop E2E improved from **379 passed / 15 skipped / 11 failed** to **389 passed / 15 skipped / 1 failed**.

The sole remaining failure was the CORRECTNESS-02 case `P0 unsafe Markdown remains in Source and saves byte-for-byte`. Its fixture begins with an unfinished ```mermaid` fence.

Root cause:

- `MarkdownToState` already calculated `fenceClosed === false` from the original code token;
- ordinary fenced code preserved that metadata in `code-block.meta`;
- the diagram conversion branch converted the same token into a `diagram` state but dropped `fenceClosed`;
- transition safety therefore saw a valid diagram state rather than the parser-known unfinished fenced construct.

The fix remains inside Muya's existing semantic boundary:

- `IDiagramMeta` now carries optional `fenceClosed`;
- `MarkdownToState` preserves `fenceClosed: false` when a fenced code token becomes a diagram state;
- `isMarkdownWysiwygTransitionSafe` rejects parser-described unfinished diagram fences alongside ordinary unfinished fenced code.

Validation:

- added a dedicated unfinished-mermaid transition-safety test and captured valid Red: **5 passed / 1 failed** before production modification;
- after preserving parser metadata, the transition-safety suite is **6/6 PASS**;
- Muya touched-file ESLint: **PASS**;
- Muya `tsc --noEmit`: **PASS**;
- Electron build: **PASS** (40.71 s);
- focused CORRECTNESS-02 unsafe-source + US14 unfinished-fence E2E: **2/2 PASS**;
- Muya public-boundary and recovery/history guards: **1/1 PASS** each.

## PR #208 final behavior-head CI

Behavior-bearing head `6a858042` completed the full PR matrix with all **11 workflows successful** after same-head reruns of two environment/timing-sensitive failures:

- Lint: **PASS**;
- Test: **PASS**;
- Desktop E2E: **PASS**;
- PR Build, including Windows x64, macOS x64, macOS arm64, package smoke and updater artifact smoke: **PASS**;
- Performance Fast Gate: **PASS**;
- Muya Lint/Test/Build/E2E/CommonMark+GFM/Circular Dependency: **PASS**.

The first attempt on this exact head had two non-product failures:

1. Performance Fast Gate executed the measurement successfully, then reported two p95 threshold misses: **279.68 ms vs <200 ms** and **311.25 ms vs <250 ms**. The same head was rerun with no code, threshold, workload, sample-count, retry-policy or timeout change and passed.
2. Muya E2E reported **259 passed / 3 flaky / 1 failed**. The stable failure was the existing empty-document `setContent("")` synchronization case, while search/replace, inline-format and auto-pair cases were classified flaky by Playwright. The same head was rerun with no code or test change and passed.

Because both failures disappeared on an unchanged Git tree, they are recorded as runner/timing variance, not as evidence for additional product changes. No threshold, assertion, timeout, retry count or coverage was weakened to obtain the final green matrix.

Typecheck note:

- `packages/desktop` `vue-tsc` in this fresh worktree reports existing Muya ambient/type-topology errors (`__MUYA_BLOCK__`, `MUYA_VERSION`, file-icons, sequence/prism declarations). The same command is green in the pre-warmed US13 worktree, while the current-worktree application build and Muya's own typecheck are green. This is classified as local dependency/topology evidence, not a US14 code regression; CI remains authoritative for the full desktop type gate.

AC-61 note:

- The durable existing regression is `virtualization-core.spec.ts` -> `source mode round-trip restores a caret in an offscreen logical block`.
- US14 does not alter the virtual surface, logical-block mapping, cursor serializer, or viewport restore code. The new coordinator delegates safe transitions into the same existing handoff.
- A late-session attempt to re-run that single E2E was blocked before test-body output by the Windows NVM/shim launch issue documented below. It is therefore not claimed as new local green evidence.

## Lessons consolidated

1. **Negative async UI assertions need a dwell window.** A `count === 0` check immediately after a Main -> Renderer IPC request can falsely pass before the IPC arrives. For deferred-transition tests, first prove the request had time to reach the renderer, then assert that the forbidden transition still has not happened.
2. **Mode intent belongs to the document, not the global preference bit.** IME deferral must carry `{documentId, target}` and must be invalidated on tab/window ownership loss; otherwise a late composition end can mutate the wrong document.
3. **Source transition safety belongs to Muya.** Desktop may ask whether a snapshot is safe to represent, but the answer must consume Muya's parser-owned semantic state rather than reimplement Markdown structure checks.
4. **Representability is not byte identity.** Serializer normalization of a valid table/list is not evidence that WYSIWYG is unsafe. Exact Source bytes remain a separate desktop document-handoff/persistence contract.
5. **Read-only test observation must stay read-only.** A helper that enters Source to inspect Markdown is invalid inside an IME-composition test whose contract explicitly forbids mode switching until composition ends. Use the authoritative store snapshot for observation instead.
6. **Semantic metadata must survive state specialization.** If a parser token becomes a richer state such as `diagram`, correctness metadata such as fence completeness must not disappear during conversion.
7. **Do not treat wrapper/bootstrap failures as product red.** The valid Red was captured only after current-worktree build + Electron launch + entry into the intended assertions.

## Stage 7 — merge / authoritative closeout

Status: **complete**

- PR #208 was squash-merged with expected-head fence `fae96c12d799fd6ba9a76a7dfa900c7a87991faa`.
- GitHub returned squash commit `8fb08c244db7b86d0daedef4bc16019e0c2acd9d`.
- The authoritative remote `develop` ref resolves exactly to `8fb08c244db7b86d0daedef4bc16019e0c2acd9d`.
- The merge completed at 2026-09-27 05:05:33 UTC.
- The fully validated behavior-bearing head remained `6a858042850f558e40afa5bcb48e746d0c2e0bae`; its full 11/11 PR workflow matrix was green before the documentation-only closure commit.
- Final pre-merge documentation head `fae96c12` carried `[skip ci]` and changed only this stage record, so it did not invalidate the validated product/performance evidence.
- This post-merge update is documentation-only and follows the existing v0.5 story closeout pattern.

## Remaining delivery

None. US14 / AC-59 / AC-60 / AC-61 / AC-80 are closed on authoritative `develop`.
