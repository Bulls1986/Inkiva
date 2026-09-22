# ARCH-03 Virtual Surface Contract

## Status

- Task: ARCH-03 — Virtual Surface Contract
- Priority/rank: P1 / architecture debt rank 4
- Branch: `arch/03-virtual-surface-contract`
- Baseline: `origin/develop@c933d43041cace6b0ed7c00268402c4992c83e91`
- Current phase: implementation complete / PR validation closeout
- PR: #161 — `ARCH-03: introduce virtual surface contract`
- Merge status: not merged
- CI status: implementation head `1c7e52ea` fully green; final documentation-only closeout push requires one last PR revalidation

## Goal

Desktop renderer must consume document-surface business semantics rather than Muya virtualization implementation semantics.

Target contract:

```ts
interface IDocumentSurface {
  revealBlock: (index: number, options?: { viewportOffset?: number }) => boolean
  getBlockOffset: (index: number) => number | null
  isWindowed: () => boolean
  prepareForNavigation: () => void
}
```

Virtualization-internal state transitions such as resize correction, materialization, pinning, mounted-window state and selection range hydration remain owned by Muya.

## Baseline findings

Direct Desktop coupling found on the baseline:

- `editor.vue`
  - `releaseVirtualResizeCorrectionForNavigation()`
  - `getVirtualizationSnapshot()`
  - `scrollVirtualBlockIntoView()`
  - `getVirtualBlockOffset()`
- `tocOutline.ts`
  - exposes `getVirtualBlockOffset` as a virtualization-specific callback concept.
- Muya `scrollVirtualBlockIntoView()` already cancelled resize correction and owned navigation hydration, proving the state transition belongs behind the surface boundary. Generic caret/tab programmatic scrolls still require the same protection, so the business contract includes `prepareForNavigation()`; Desktop expresses navigation intent without naming virtualization or resize-correction state.

## Test-first plan

Required regression surface from the architecture audit:

- Home / End
- large-range selection
- IME composition lifecycle
- undo / redo across window changes
- responsive resize
- tab scroll restore
- outline / distant heading reveal

Existing Electron coverage is mapped in `packages/desktop/test/e2e/VIRTUALIZATION_REGRESSION_COVERAGE.md` and the split virtualization specs. This PR adds a structural contract gate so future Desktop code cannot reintroduce virtualization-specific APIs.

### New hard gate

`packages/desktop/test/unit/specs/virtual-surface-contract.spec.ts`

The gate must fail while Desktop directly references:

- `getVirtualizationSnapshot`
- `getVirtualBlockOffset`
- `scrollVirtualBlockIntoView`
- `releaseVirtualResizeCorrectionForNavigation`

and must require the Muya surface boundary to expose:

- `revealBlock`
- `getBlockOffset`
- `isWindowed`
- `prepareForNavigation`

## Validation policy

No existing assertions, performance thresholds, workloads, retry rules or sample counts may be relaxed. Raw scroll hot paths must not gain layout reads or O(N) work.

Planned validation:

1. New ARCH-03 structural unit gate — first run expected red on baseline.
2. Focused Muya virtualization unit tests.
3. Desktop unit suite for TOC/layout/tab-switch related code.
4. Existing targeted virtualization Electron gate (`pnpm test:e2e:virtualization`) or the smallest deterministic subset covering the required scenarios.
5. `pnpm typecheck`
6. `pnpm lint`
7. `pnpm build:unpack`

## Stage log

### Stage 0 — bootstrap and baseline

Completed:

- fetched current `origin/develop`;
- created isolated worktree and branch from `c933d430`;
- verified ARCH-03 is the current rank-4 architecture task;
- inspected Desktop/Muya direct virtualization API coupling;
- confirmed existing virtualization regression matrix already covers the mandated interaction domains.

Completed test-first evidence:

- restored worktree-local dependencies with `pnpm install --offline --frozen-lockfile --ignore-scripts`: 1851 resolved, 1827 reused, 0 downloaded, completed in 2m 33.7s;
- added the fail-closed structural gate before implementation;
- baseline gate result: **2/2 tests failed** as intended — Desktop still referenced virtualization-specific APIs and Muya lacked the business surface API;
- first implementation rerun: **1/2 passed, 1/2 failed**, correctly exposing two remaining `releaseVirtualResizeCorrectionForNavigation` calls in caret-follow and tab-scroll-restore flows rather than allowing an incomplete boundary migration.

Implementation completed so far:

- added typed `IDocumentSurface` on Muya `ScrollPage` (repository naming/style compliant);
- introduced `revealBlock`, `getBlockOffset`, `isWindowed`, and generic `prepareForNavigation` business operations;
- moved resize-correction teardown behind `prepareForNavigation` and made `revealBlock` own that transition;
- migrated TOC reveal, TOC offset lookup, caret navigation, tab restore preparation, and layout defer checks away from virtualization-specific APIs;
- retained `getVirtualBlockOffset` only as Muya-internal diagnostics/test compatibility, while the Desktop structural gate forbids it.

Validation completed so far:

- ARCH-03 structural gate: **2/2 passed** after migration.
- Muya virtualization unit suites (`virtualizationProduction.spec.ts` + `virtualizationPrototype.spec.ts`): **36/36 passed**.
- Desktop focused suites (`virtual-surface-contract`, `toc-outline`, `editor-layout`): initial run exposed one stale variable name in `tocOutline.ts`; after fixing implementation, rerun **26/26 passed**.
- `pnpm -C packages/desktop run typecheck`: **passed** after the final interface/style changes.
- Desktop focused ESLint on the changed renderer/test files: **0 errors**.
- Muya package lint initially exposed **5 ARCH-03 errors** (interface naming/signature style) plus existing warnings; after correcting the contract to repository style (`IDocumentSurface` + function-property signatures), final Muya lint is **0 errors / 16 existing warnings**, with no ARCH-03-added warning remaining.
- `pnpm -C packages/desktop run build:unpack`: **passed**; only existing Vite chunking warnings were emitted.
- Electron virtualization gate after repairing worktree-local native test prerequisites: **42/43 passed**. The only failure is `OUT-015/OUT-020: repeated top-middle-bottom navigation does not accumulate outline mismatch` at the physical bottom scroll assertion.
- The exact failing OUT-015/OUT-020 case was then executed three times on an isolated, unmodified detached baseline worktree at `c933d430`: **3/3 failed at the same line and same bottom-scroll assertion**. The ARCH-03 branch repeat was also **3/3 failed** at that identical assertion. This establishes the failure as a pre-existing `develop@c933d430` defect rather than an ARCH-03 regression. The test, timeout, assertion and workload were not modified or relaxed.

CI validation on implementation head `1c7e52ea`:

- all reported PR checks completed successfully: Desktop E2E, Desktop Lint, Test, Muya Build/Lint/Spec/Unit/E2E, circular dependency check, Windows x64 PR Build, macOS Intel PR Build, macOS Apple Silicon PR Build, artifact-link comment job, and Performance Fast Gate;
- Performance Fast Gate attempt 1 failed only `memory.heapLinearGrowth` (`max=1`, required `0`) while `heapGrowth50=2.26%` stayed far below the `<15%` threshold and every other performance/stability gate passed;
- the same commit was rerun with identical thresholds, sample counts and workload; attempt 2 passed the final threshold evaluation without any code/config/test change;
- successful rerun metrics: 50K first-screen p95 `92.26 ms`, editable p95 `124.11 ms`, input p95 `0.40 ms`, input p99 `1.236 ms`, input max `1.90 ms`, scroll minimum `60 FPS`, folder-search first-batch p95 `101.545 ms`, 50K save p95 `44.225 ms`, heapGrowth50 `1.391%`, memory linear-growth count `0`, crash count `0`, renderer-hang count `0`;
- comparison reference: the previous ARCH-02 successful Fast Gate had memory linear-growth count `0`, heapGrowth50 `1.32%`, save p95 `45.91 ms`, scroll `60 FPS`. The transient attempt-1 trend flag is recorded rather than hidden; no threshold/workload/sample-count relaxation was used.

Environment incident:

- the safe offline dependency install used `--ignore-scripts`, so the first Electron gate never entered test bodies because native `ced.node` was absent;
- matching `ced.node` and `native-keymap` binaries from the already-working ARCH-01 worktree were copied only into this worktree's ignored `node_modules`; they are not product changes and will not be committed;
- a transient root-level `ced.node` created by an initial PowerShell path mistake was deleted immediately; runtime copies remain only under ignored `node_modules`.

Closeout state:

- final diff/hygiene review is complete: only the intended project files were committed; no copied native binaries are tracked;
- implementation/test/documentation stage committed as `410ed0ce` (`refactor(editor): add virtual surface contract`) and pushed;
- PR-status ledger stage committed as `1c7e52ea` (`docs(architecture): record ARCH-03 PR status`) and pushed;
- PR #161 is open against `develop`, not merged;
- implementation head `1c7e52ea` passed all PR checks after the unchanged Fast Gate rerun described above;
- this document closeout will be pushed as documentation-only; inspect PR #161 for the latest-head CI state before merge. Do not auto-merge.

Blockers / known baseline defects:

- `OUT-015/OUT-020` is a reproducible pre-existing `develop@c933d430` failure: both baseline and ARCH-03 branch fail 3/3 at the same bottom-scroll outline synchronization assertion. It remains fail-closed and is not modified by this task.
- no ARCH-03-specific product-code blocker is currently known.
- Runner does not support delegated coding-agent runs; work continues directly in this worktree.

## Recovery instructions

1. Open worktree:
   `E:\\workspace\\opensource\\Inkiva\\.worktrees\\arch-03-virtual-surface-contract`
2. Verify branch:
   `git status --short --branch`
3. Read this file and `docs/architecture/ARCHITECTURE_AUDIT_2026-09.md` ARCH-03 section.
4. Inspect PR #161 latest-head CI. The implementation head `1c7e52ea` is fully green; any later run is for documentation-only closeout unless product code changed. If a check fails, diagnose it without weakening tests. Leave the PR unmerged.
5. Never modify or delete the main checkout's unrelated `perf-results/`.
