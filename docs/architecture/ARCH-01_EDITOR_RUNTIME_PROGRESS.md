# ARCH-01 Editor Runtime Extraction — Progress Ledger

> Purpose: durable recovery log for ARCH-01. Update this file after every completed stage so work can resume after network/session loss without relying on chat history.

## Task identity

- Branch: `arch/01-editor-runtime`
- Base: `origin/develop` @ `96e18c9415194e380d664d5ea351883cdcd64c6d`
- Source audit: `docs/architecture/ARCHITECTURE_AUDIT_2026-09.md` §7 `ARCH-01`
- Goal: move editor lifecycle/revision/snapshot/persistence orchestration behind `DocumentEditorRuntime` without changing user-visible Markdown behavior.
- Hard rule: `DocumentEditorRuntime.dispose()` becomes the only high-level editor-runtime teardown entry used by Vue.
- Test rule: tests are written/strengthened before each implementation slice; assertions/workloads are not weakened to obtain green CI.

## Ownership contract

Authoritative document semantics remain in Muya. `DocumentRevisionSnapshotCache` owns revision-scoped derived values. `DocumentEditorRuntime` is the renderer runtime owner/coordinator; Vue remains UI binding only.

The runtime may coordinate:

- Muya instance lifecycle and high-level teardown;
- monotonic document revision transitions;
- snapshot scheduling/capture handoff;
- history snapshot/restore coordination;
- persistence handoff for save/autosave;
- selection/scroll presentation-state restore hooks;
- runtime-owned subscriptions/observers/disposables.

The runtime must not invent Inkiva-specific Markdown state or duplicate Muya document semantics.

## Evidence from base

`packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue` still directly coordinates:

- revision-aware Markdown/history/block snapshot capture (`captureEditorSnapshot`);
- `EditorSnapshotScheduler.dispose()`;
- large renderer-bus unsubscribe list;
- input probe/listener cleanup;
- scroll timer/listener cleanup;
- TOC/layout runtime destruction;
- pending scroll restore cleanup;
- image viewer destruction;
- final Muya `destroy()`.

This confirms the audit finding that Vue is still the runtime resource owner.

## Validation matrix

| Area | Required protection | Layer |
| --- | --- | --- |
| Runtime lifecycle | dispose is idempotent; all registered resources disposed once; registration after dispose fails closed | Unit |
| Revision | content mutation advances monotonically; presentation changes do not advance revision | Unit + existing snapshot tests |
| Snapshot scheduling | deferred/immediate/persistence capture survives extraction | Unit + integration |
| Tab switch | outgoing tab snapshot/cursor state preserved; incoming lifecycle becomes active | Integration/Electron E2E |
| History restore | restored history belongs to matching document/revision | Integration/Electron E2E |
| Selection/scroll | presentation restore is revision-neutral and survives tab switch | Integration/Electron E2E |
| Save/autosave | same revision snapshot is reused; stale async results cannot overwrite newer revision | Unit + integration/Electron E2E |
| Mount/unmount | no listener/timer/runtime resource remains after unmount | Unit + Electron E2E |
| Source mode | WYSIWYG/source handoff remains lossless | Electron E2E |

## Stage log

### Stage 0 — baseline / test design

Status: **complete**

Completed:

- refreshed `origin/develop` and created dedicated worktree/branch;
- confirmed base SHA `96e18c94` (architecture audit merge);
- re-read ARCH-01 success criteria and current `editor.vue` teardown/snapshot paths;
- defined the runtime ownership contract and validation matrix above.

Validation evidence:

- Focused test command: `packages\\desktop\\node_modules\\.bin\\vitest.cmd run test/unit/specs/document-editor-runtime.spec.ts` from `packages/desktop`.
- Expected red result observed: Vitest failed because `@/services/documentEditorRuntime` did not exist. This is the intended test-first failure proving the new contract was not already implemented.
- Two earlier attempts through `corepack pnpm ...` timed out before Vitest output because the fresh worktree had no local dependency links; these are environment failures and are not counted as red-test evidence.
- Local-only dependency junctions now point this worktree at the already-installed main checkout dependencies; they are Git-ignored and must not be committed.

Blockers: none.

### Stage 1 — runtime lifecycle/revision kernel

Status: **complete**

Implemented after the red test:

- added `services/documentEditorRuntime.ts`;
- runtime owns an idempotent disposable registry with fail-closed post-dispose registration;
- runtime delegates active/warm/cold lifecycle and monotonic content revision operations to `DocumentRevisionSnapshotCache`;
- runtime exposes revision-scoped Markdown retrieval so persistence consumers can reuse one derived snapshot per revision.

Validation evidence:

- `vitest run test/unit/specs/document-editor-runtime.spec.ts`: **4/4 passed**.
- Runtime + existing revision snapshot regression suite: **20/20 passed** across 2 files.
- `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **passed**.
- focused ESLint on the runtime and its unit spec: **passed**. The command emitted only the repository's existing `MODULE_TYPELESS_PACKAGE_JSON` warning; no lint error occurred.

Stage result:

- runtime lifecycle/revision kernel is now test protected;
- no Vue integration has been claimed yet;
- no user-visible behavior or Markdown semantics changed.

Next stage:

1. add tests around runtime-owned teardown/subscription cleanup before changing `editor.vue`;
2. migrate the first coherent resource group (snapshot scheduler + high-level runtime disposables) behind `DocumentEditorRuntime`;
3. keep save/tab-switch/source-mode behavior unchanged and rerun focused integration/E2E coverage;
4. update this ledger after the migration slice before expanding ownership further.

Stage 1 implementation commit: `54b1e1a9` (`refactor(editor): add document editor runtime kernel`).

### Stage 2 — snapshot scheduler + renderer bus teardown ownership

Status: **complete and pushed**

Test-first evidence:

- Added a subscription ownership contract before implementation.
- Red result: runtime unit suite ran 5 tests with **1 failed / 4 passed** because `runtime.subscribe` did not exist.
- After implementation: runtime unit suite **5/5 passed**.

Implemented:

- `DocumentEditorRuntime.subscribe()` now owns subscription setup/teardown as one lifecycle resource.
- `editor.vue` creates one `DocumentEditorRuntime` for the component runtime.
- `EditorSnapshotScheduler.dispose()` is registered with the runtime instead of being called directly by Vue teardown.
- Renderer `bus.on(...)` registrations are paired with runtime-owned disposables; `onBeforeUnmount` no longer contains the previous long `bus.off(...)` list.
- Vue teardown now calls `editorRuntime.dispose()` for this migrated resource group.
- Scroll/layout/input-probe/image-viewer/Muya destruction remain outside the runtime in this stage and are intentionally deferred to later slices.

Validation evidence:

- runtime + revision snapshot regression: **21/21 passed** across 2 Vitest files.
- `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **passed**.
- `git diff --check`: **passed**.
- Focused ESLint including `editor.vue` timed out twice (90 s and 120 s) without producing lint diagnostics. This is recorded as an unresolved validation execution issue, not as a lint pass and not as a code failure.

Implementation commit:

- `29347373a681c9cfddb6e278094840cc2f8151b4` — `refactor(editor): move bus teardown into runtime`.

Remote state:

- Verified push succeeded; branch now tracks `origin/arch/01-editor-runtime`.

Next:

1. verify/retry remote push without duplicating commits;
2. add test-first coverage for the next teardown ownership slice: input probe/listeners, scroll timers/listeners, TOC/layout resources;
3. migrate those resources behind runtime disposables while preserving cleanup ordering;
4. run focused unit/typecheck and Electron E2E covering mount/unmount, tab switch and source/WYSIWYG switch;
5. only after these pass, move final Muya instance destruction behind `DocumentEditorRuntime.dispose()`.

### Stage 3 — presentation resource teardown ownership

Status: **complete and pushed**

Test-first evidence:

- Added a structural ownership gate to `editor-switch-protection.spec.ts` requiring `onBeforeUnmount` to delegate presentation-resource cleanup to `editorRuntime.dispose()` rather than directly removing document/input/scroll listeners or destroying TOC/layout resources.
- Red result: focused suite ran 8 tests with **1 failed / 7 passed** and explicitly reported `document.removeEventListener('keyup', ...)` still present in `onBeforeUnmount`.
- After migration: runtime/snapshot/structural suites **29/29 passed** across 3 files.

Implemented:

- grouped document keyup, input probe DOM listeners, scroll listener/timer, pending scroll persistence, renderer scroll monitor, TOC scheduler, layout reconciler, TOC scroll sync and pending scroll restore cleanup into `disposeEditorPresentationResources()`;
- registered that ordered cleanup group with `DocumentEditorRuntime`;
- removed those individual teardown operations from `onBeforeUnmount`;
- preserved the previous cleanup order inside the grouped disposable rather than relying on registration-order side effects.

Validation evidence:

- `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **passed**.
- focused ESLint initially exposed one real style error (`space-before-function-paren`), which was fixed; rerun **passed** with only the repository's existing `MODULE_TYPELESS_PACKAGE_JSON` warning.
- Electron Vite build: **passed** using the direct CLI from `packages/desktop`; renderer build completed in 33.33 s.
- focused `view-modes` E2E after environment repair: **1/1 passed**.
- full targeted Electron E2E (`editor-switch-performance.spec.ts` + `view-modes.spec.ts`): **13 passed / 1 skipped**, 28.7 s.
- covered behavior includes tab-switch snapshot reuse, deferred edit race, one-revision save/export/close reuse, warm large-document virtualization, focus/typewriter/source mode switches and source-mode menu state.

Environment incident and resolution:

- The fresh worktree initially reused the main checkout `node_modules` through junctions. Realpath inspection proved Electron/Playwright then resolved through an unrelated `perf-pr-c-stage-c0` worktree.
- Removed those broad junctions and created a local pnpm layout. The filtered desktop install linked 1511 packages but native `ced` and `native-keymap` postinstall failed because this machine lacks Visual Studio C++ Build Tools.
- Initial real E2E launch then failed in `beforeAll` because `ced.node` was absent. Existing matching native binaries from the already-working main checkout were copied locally for validation only; a local Electron command bridge likewise points to the already-installed Electron 42.1.0 binary.
- These environment bridges live under ignored `node_modules` and are not part of the product diff or commit.
- After repairing only those local runtime prerequisites, the exact targeted E2E suite passed as recorded above. Therefore the earlier E2E timeouts are classified as worktree dependency-environment failures, not product regressions.

Stage 3 commit: `b1306101` (`refactor(editor): move presentation teardown into runtime`), pushed to `origin/arch/01-editor-runtime`.

### Stage 4 — final instance teardown ownership

Status: **complete, pending final combined commit/push**

Test-first evidence:

- Expanded the structural teardown gate to forbid direct `imageViewer.destroy()` and `editor.value.destroy()` calls inside `onBeforeUnmount`.
- Red result: focused suite ran 8 tests with **1 failed / 7 passed**, explicitly finding `imageViewer.destroy()` in Vue teardown.
- Moved image viewer and Muya destruction into a runtime-owned ordered disposable group.
- After implementation: runtime/snapshot/structural suites **29/29 passed**.
- `vue-tsc`: **passed**; focused ESLint: **passed**.
- Rebuilt Electron renderer and reran targeted Electron E2E: **13 passed / 1 skipped**, 30.9 s.

Result:

- `onBeforeUnmount` no longer destroys runtime resources individually; Vue performs the final active-editor flush and delegates high-level teardown to `editorRuntime.dispose()`.

### Stage 5 — revision / snapshot / history orchestration boundary

Status: **complete, pending final combined commit/push**

Test-first evidence:

- Added runtime contract coverage for `recordMutation()` + scheduler request/flush ownership. Red result: runtime suite **1 failed / 5 passed** because `recordMutation` did not exist; implementation then turned the suite green.
- Added runtime history-restore ownership coverage. Red result: runtime suite **1 failed / 6 passed** because `restoreCurrentHistory` did not exist; implementation then turned the suite green.
- Added a structural regression guard forbidding `documentRevisionSnapshots` and direct `editorSnapshotScheduler.request/flush` orchestration inside `editor.vue`.

Implemented:

- `DocumentEditorRuntime` owns the snapshot scheduler contract and scheduler disposal.
- `recordMutation()` now owns the ordering `mark dirty / allocate revision -> schedule snapshot capture`.
- `flushSnapshot()` owns full / persistence / switch flush modes used by save, export and tab switching.
- revision-scoped Markdown, history metadata, word count and block derived-state access now go through runtime facade methods.
- exact-source Markdown seeding and closed-document snapshot pruning now go through the runtime boundary.
- current-revision history lookup/restore is coordinated by `restoreCurrentHistory()`; Vue only supplies the Muya `setHistory` binding.
- `editor.vue` contains **zero direct `documentRevisionSnapshots` references** and **zero direct `editorSnapshotScheduler.request/flush` calls**.

Final validation evidence:

- Runtime + revision snapshot + architecture structural unit suites: **32/32 passed** across 3 files.
- `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **passed**.
- focused ESLint on runtime/editor/tests: **passed**; only the repository's existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains.
- `git diff --check`: **passed**.
- Electron Vite build from the final working tree: **passed**, renderer build 34.42 s.
- final targeted Electron E2E (`editor-switch-performance.spec.ts` + `view-modes.spec.ts`): **13 passed / 1 skipped**, 31.2 s.
- validated flows include editor mount, repeated tab switch, edited-tab snapshot reuse, deferred edit race, save/autosave/export/close snapshot sharing, warm large-document virtualization, focus/typewriter/source-code mode transitions and source-mode menu state.

### ARCH-01 completion assessment

Status: **implementation complete; final commit/push/PR creation remains**

Success criteria review against `ARCHITECTURE_AUDIT_2026-09.md`:

- runtime owns Muya/high-level editor lifecycle teardown: **met**;
- runtime owns snapshot scheduler lifecycle and scheduling modes: **met**;
- runtime exposes narrow revision/snapshot/history commands: **met**;
- Vue remains the adapter for UI/Muya/store-specific bindings rather than the owner of revision/snapshot timing: **met**;
- `DocumentEditorRuntime.dispose()` is the sole high-level runtime teardown entry used by Vue: **met**;
- `editor.vue` no longer directly orchestrates snapshot cache/scheduler timing: **met and structurally guarded**.

This is an architecture/correctness PR. No Before/After performance experiment was performed, so **no performance improvement is claimed**.

Next:

1. commit and push Stages 4–5 plus this completion ledger;
2. create the focused ARCH-01 PR against `develop` with the validation evidence above;
3. track CI and only describe ARCH-01 as merge-ready after required tests are green.
