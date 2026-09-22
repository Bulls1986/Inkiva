# ARCH-04 — Block Geometry Unification

## Recovery ledger

- Branch: `arch/04-block-geometry-unification`
- Base: `develop@17d370a1` (`ARCH-FIX: close async virtual geometry invalidation (#167)`)
- Scope: architecture debt rank #5 from `ARCHITECTURE_AUDIT_2026-09.md`.
- Classification: architecture/correctness. No performance claim is made without independent Before/After evidence.

## Goal

Make geometry ownership explicit without creating a second geometry store:

- Muya owns logical geometry and geometry-driven scroll correction while windowed.
- Desktop owns only mounted-DOM projection, TOC cache, tab restore and non-windowed scroll correction.
- Diagram/Image/Table/other async content changes continue through top-level block geometry; no component-specific height event is introduced.
- The raw scroll hot path remains layout-read free.

## Stage 1 — Baseline / gap audit

Status: completed.

The #167 async-geometry fix already closed the highest-risk correctness defect: cross-segment asynchronous block growth now updates Muya logical offsets/materialization, and Outline no longer lets a distant retained DOM heading override live logical prefix geometry.

Remaining ARCH-04 debt on the current base was contract expression rather than another diagram bug:

1. `editor.vue` still called `scrollPage.getBlockOffset()` and `scrollPage.isWindowed()` directly.
2. `EditorLayoutReconciler` used `shouldDeferScroll`, so the reason Desktop must not write `scrollTop` was encoded as a boolean callback rather than an explicit ownership contract.
3. No focused unit contract existed for the Desktop projection that delegates `revealBlock/getBlockOffset/isWindowed` semantics.

A repository search confirmed Desktop renderer has no `_virtual*` field access and no direct use of `releaseVirtualResizeCorrectionForNavigation`; ARCH-03 encapsulation remains intact.

## Stage 2 — Test-first contract

Status: tests written before production implementation; local red execution not accepted because the fresh worktree dependency topology was incomplete.

Added/changed focused gates:

- `editor-layout.spec.ts`: surface-owned scroll correction must report geometry changes without writing Desktop `scrollTop`.
- `virtual-surface-contract.spec.ts`: `editor.vue` may not directly call `scrollPage.getBlockOffset`, `scrollPage.isWindowed`, or reintroduce `shouldDeferScroll`.
- `document-geometry.spec.ts`: projection delegation, windowed ownership, pending-restore precedence, and unavailable-surface fallback.

Local execution attempt was **environment evidence only**: the fresh worktree had no package-local pnpm links, so `vitest` was not discoverable; one canonical offline/frozen recovery attempt then timed out without test discovery output. No product failure is inferred from those attempts.

## Stage 3 — Implementation

Status: completed.

Implemented so far:

- Added `createDocumentGeometryProjection()` as the Desktop-facing geometry boundary.
- Centralized `revealBlock`, `getBlockOffset`, and scroll-owner resolution there.
- Replaced boolean `shouldDeferScroll` with explicit `getScrollOwner()` returning `desktop`, `document-surface`, or `pending-restore`.
- `editor.vue` now routes TOC reveal/offset and layout scroll ownership through the projection rather than directly invoking geometry methods on `scrollPage`.

This preserves the existing ownership model: the projection delegates; it does not cache logical offsets, materialization windows, measured heights, or virtual state.

## Stage 4 — Validation

Status: completed. PR #168 CI is fully green.

Completed evidence:

- Desktop full `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **passed** using the known-good donor `vue-tsc` executable with the current worktree tsconfig/source.
- Direct runtime contract smoke via `node --import tsx`: **passed** (`DOCUMENT_GEOMETRY_RUNTIME_OK`), covering reveal delegation, offset delegation, windowed owner and pending-restore precedence.
- Structural contract script: **passed** (`ARCH04_STRUCTURAL_CONTRACT_OK`), proving Desktop renderer has no `scrollPage?.getBlockOffset`, `scrollPage?.isWindowed`, `shouldDeferScroll`, or forbidden ARCH-03 virtualization implementation API escapes.
- Windows-aware whitespace review `git -c core.whitespace=cr-at-eol diff --check`: **passed**. The plain check only flagged CRLF `\r` on newly added `ENVIRONMENT.md` lines; byte inspection confirmed no actual trailing spaces.

Environment evidence, not product failures:

- fresh worktree `pnpm -C packages/desktop exec vitest` initially had no package-local Vitest launcher;
- one offline/frozen install attempt timed out before test discovery and was not repeated;
- invoking the donor Vitest launcher from the current worktree package passes `--version` but the focused suite stalls before test discovery, so no red/green claim is made from that route;
- `pnpm lint` similarly stalls before output in this topology; no lint failure is inferred.
- direct jsdom behavior smoke could not start because the donor jsdom graph is missing transitive `is-potential-custom-element-name`; this is dependency-topology evidence, not a product assertion failure.

CI closure on PR #168:

- `lint`: **passed** (`1m0s`);
- `test`: **passed** (`2m19s`), covering the focused Desktop unit suites and contract guards in the repository CI topology;
- `Desktop PR fast hard gate`: **passed** (`3m17s`);
- `e2e`: **passed** (`6m41s`), preserving the existing virtualization interaction regression suite;
- PR build matrix: **Windows x64 passed** (`6m24s`), **macOS x64 passed** (`5m37s`), **macOS arm64 passed** (`4m30s`);
- artifact-link PR step: **passed**.

Final conclusion: ARCH-04 meets the documented ownership, correctness, regression, build and hygiene gates and is ready to merge.
