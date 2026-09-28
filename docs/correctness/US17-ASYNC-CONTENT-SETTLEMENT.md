# US17 / Async Content Settlement

## Scope

US17 closes the user-visible continuity contract while images, diagrams, math and tables settle from placeholder/intermediate geometry to their final size.

Acceptance focus: AC-68, AC-69, AC-70.

Base: `origin/develop@3e4da44e`

Branch: `feat/v0.5-us17`

## Stage 0 — diagnosis

Status: completed before production mutation.

Mandatory pre-mutation material read:

- repository-root `AGENTS.md`;
- `docs/agent/TESTING.md`;
- `docs/agent/ARCHITECTURE_RELEASE.md`;
- ARCH-03 virtual-surface contract;
- ARCH-04 block-geometry contract;
- `ASYNC_GEOMETRY_INVALIDATION_FIX.md`.

Authoritative architecture remains unchanged:

`ResizeObserver -> top-level block geometry -> Muya logical offsets/materialization -> Desktop projection/Outline`.

No component-specific diagram/image/table height event and no Desktop-owned second geometry store will be introduced.

### Existing coverage/capabilities to reuse

1. The GEO async-geometry regression already proves generic top-level asynchronous growth, cross-segment prefix correction, complete virtual viewport materialization and Outline convergence.
2. Muya already owns virtual resize correction. Trusted wheel/touch/pointer/mousedown/keydown intent cancels an outstanding resize correction, while `prepareForNavigation()` clears the same correction before logical navigation such as Outline reveal.
3. TOC active-state commits are generation invalidated across two paint boundaries, so a newer scroll cancels an older pending active-heading commit.
4. Diagram renders are generation-aware and coordinator-isolated per block. A renderer failure is converted into a block-local error state; the source editor stays available, and another queued diagram is not supposed to be blocked by the failure.
5. Diagram errors already show a localized readable message and sanitized detail. Error presentation keeps the source container visible.

### Gaps found

1. Product interaction requires a block-local **Retry / view-source path** after a diagram failure. Source is already visible in the current error presentation, but there is no explicit Retry control; the existing test deliberately proves only that automatic retry never happens.
2. AC-70 has architecture-level implementation but lacks a focused executable race contract proving that a correction queued before newer user navigation cannot write `scrollTop` later.
3. AC-68 names image, Mermaid, PlantUML, Vega, math and table examples. Their renderer/content fidelity has separate coverage, while geometry ownership is deliberately generic. US17 must validate this composition without adding renderer-specific geometry protocols.

## Red plan

Use the cheapest layer that observes each missing contract:

1. DiagramPreview unit Red: a failed render exposes a localized Retry control; activating it retries the same source explicitly and can recover to preview without changing Markdown/source ownership.
2. Muya virtualization unit Red: queue a resize correction, issue newer trusted navigation intent before its rAF settles, then prove the stale correction cannot reclaim `scrollTop`.
3. Only add/extend Electron E2E where the real interaction boundary is not already protected by the existing GEO suite.

Environment/bootstrap failures, zero-test discovery and timeouts before the intended assertion are not Red evidence.

## Stage 1 — executable Red

The first two Vitest launches did not reach the intended test because the fresh worktree had no dependency graph. A temporary root dependency Junction then exposed that the main checkout donor graph was incomplete: Vitest failed during startup because `tinyexec/index.js` was missing. Per the environment contract, none of those failures count as Red.

The worktree dependency graph was recovered once with:

`pnpm install --frozen-lockfile`

The install completed successfully, including the repository postinstall Electron native-module rebuild.

Focused Red:

`pnpm exec vitest run packages/muya/src/block/extra/diagram/__tests__/diagramPreview.spec.ts`

Result: **1 file discovered; 26 tests executed; 25 passed, 1 failed**.

The only failure is the new US17 behavior:

`offers an explicit retry action after a block-local render failure`

The renderer reached the controlled `temporary renderer failure` path, the existing block-local error state and readable detail both passed, and the assertion failed because `.mu-diagram-error-retry` does not exist. This is valid behavioral Red.

## Stage 2 — implementation and focused Green

Production change:

- diagram error presentation now includes a localized, keyboard-focusable Retry button;
- Retry is explicit only: it reuses the same `DiagramPreview._renderImmediately()` + render coordinator path, while the existing no-automatic-retry contract remains unchanged;
- the source editor remains visible/editable in error mode;
- all ten bundled Muya locales provide the Retry label;
- the control uses existing interaction radius/color inheritance and does not add a new visual-token family;
- no geometry ownership, Markdown syntax, history, save, recovery, or Desktop projection code changed.

Acceptance regressions added:

1. A failed diagram can be explicitly retried and recover to preview without changing source ownership.
2. With render concurrency forced to one, a failed block cannot block a queued healthy block.
3. An already-queued virtual resize callback cannot reclaim the viewport after newer explicit navigation, even if the stale callback is delivered after cancellation.
4. Trusted user scroll intent cancels an older resize correction; manually delivering its stale callback cannot overwrite the newer `scrollTop`.

Focused Green:

`pnpm exec vitest run packages/muya/src/block/extra/diagram/__tests__/diagramPreview.spec.ts packages/muya/src/utils/diagram/__tests__/coordinator.spec.ts packages/muya/src/block/scrollPage/__tests__/virtualizationProduction.spec.ts`

Result: **3 files, 75/75 tests passed**.

Representative AC-68 composition:

- image: lazy viewport load + failed-cache retry;
- Mermaid: preview/render adapter and error/source continuity;
- PlantUML: source encoding/server behavior plus shared staged diagram path;
- Vega-Lite: staged async render/commit/disposal;
- math: readable invalid-formula state without replacing the Markdown source;
- table: Markdown structure and undo boundaries;
- geometry: type-agnostic top-level block observation + virtual prefix/materialization contract.

Combined representative command completed with **8 files, 101/101 tests passed**.

Static validation:

- package-local ESLint for all US17 TypeScript/locale changes: **pass, 0 errors**;
- `pnpm --filter @muyajs/core lint:types`: **pass**;
- stylelint initially identified two US17 keyword-case errors plus property-order warnings in the new Retry block; those were corrected;
- rerunning stylelint reports no US17-block issue. The file still reports the pre-existing baseline at lines 61/624/625 (`no-descending-specificity`) plus six pre-existing property-order warnings outside the US17 block. US17 does not broaden that historical style debt.

## Guardrails

- preserve standard Markdown and source editability;
- preserve the single Muya-owned geometry chain;
- user navigation is newer intent and always outranks stale layout correction;
- one async block failure must remain block-local;
- no timeout/retry/skip/threshold relaxation to make validation pass;
- existing Inkiva visual tokens and interaction language remain authoritative over the product prototype.

## Stage 3 — Electron ownership-race closure

Status: completed.

The focused unit contracts were green, but the real Electron virtualization gate exposed a second AC-70 layer that did not appear under single-test timing.

### Executable Red evidence

The complete `@virtualization-core` gate first reached **49/50** with:

- `scroll bursts persist the latest position without a Pinia write per event` failing because persisted scroll position lagged the live editor by 198 px;
- after the first ownership correction, a later full-gate run reached **48/50**, with the persistence delta at 240 px and `SCR-012/SCR-013/DIA-006` rolling from a requested position around 2204 px back to 64 px.

The Mermaid rollback was then reduced to a bounded stress reproduction:

`pnpm --filter inkiva exec playwright test test/e2e/virtualization-diagram-recovery.spec.ts:91 --config=test/e2e/playwright.config.ts --repeat-each=8 --workers=2`

Pre-fix result: **5 passed / 3 failed**. Every failure hit the unchanged product assertion `settled >= requested - 32`, with `requested ~= 2204` and `settled = 64`. This is valid AC-70 behavioral Red under parallel Electron load.

### Root cause

There were multiple viewport writers, not one Mermaid-specific bug:

1. During a width/reflow ResizeObserver race, Muya could capture the still-mounted old DOM window while the scroll hot path had already recorded a newer user-owned logical viewport that had not yet crossed the hydration boundary.
2. Mounted-block measurement could still attempt viewport-anchor preservation while newer user scroll intent was pending hydration.
3. Desktop had two stale caret writers outside Muya geometry ownership:
   - `scrollToCursor()` defers its reveal with `nextTick()`, so an older caret reveal could execute after a newer user scroll;
   - the selection-change visibility correction could recenter an offscreen old caret after the user intentionally moved the reading viewport.

The rollback to 64 px therefore survived the first Muya-only fix. Treating every scroll regression as a geometry-only problem would have left a competing Desktop writer intact.

### Implementation

- Muya width reflow now treats the scroll hot-path logical anchor as authoritative while `_virtualUserScrollIntent` is pending, even before that anchor becomes exact mounted-DOM geometry.
- Mounted-block measurement does not preserve/replay a viewport anchor while newer user scroll intent owns the viewport.
- Desktop `scrollToCursor()` snapshots the monotonic editor-scroll revision before `nextTick()` and aborts when a newer scroll has occurred.
- After any editor scroll, selection-change caret visibility correction is suppressed until a subsequent explicit caret-intent pointer/keyboard interaction reconnects caret and viewport ownership.
- Electron scroll regressions model user navigation with an input ownership handoff before directly setting `scrollTop`; correctness thresholds and settle assertions remain unchanged.
- GEO-E2E-04 reuses the existing precise helper that places the growth target just above the viewport while keeping it mounted, rather than a coarse helper that could scroll the target out of the virtual window before exercising the geometry assertion.

No new diagram/image/table-specific geometry channel was introduced. ARCH-03/ARCH-04 ownership remains intact.

## Stage 4 — final validation and closeout

Status: local closeout green, except for explicitly recorded pre-existing/static baseline debt.

Final evidence:

- focused Muya virtualization production contract: **38/38 passed**;
- related real-Electron diagram/async-geometry/local-image set: **12/12 passed**;
- Mermaid parallel stress reproduction after the final ownership fix: **8/8 passed with 2 workers**;
- complete `pnpm --filter inkiva test:e2e:virtualization`: **50/50 passed in 3.3 minutes**;
- representative async-content composition suite: **8 files / 103 tests passed**;
- `pnpm --filter inkiva build`: **passed in 43.07s**, with only the existing Vite dynamic/static-import warnings;
- `pnpm --filter @muyajs/core lint:types`: **passed**;
- Muya changed-file ESLint: **0 errors / 5 existing complexity/max-lines warnings** in `scrollPage/index.ts`;
- Desktop changed-file ESLint: **passed**;
- `git -c core.whitespace=cr-at-eol diff --check`: **passed**;
- `blockSyntax.css` stylelint still reports the same pre-existing **3 no-descending-specificity errors + 6 property-order warnings** outside the US17 Retry block; the US17 block itself adds no stylelint finding.

Desktop standalone `vue-tsc --noEmit -p tsconfig.json` remains non-green because the Desktop program pulls Muya source through a type environment that reports the existing `__MUYA_BLOCK__`, `MUYA_VERSION`, FileIcons, JS-module declaration and Prism/loadLanguage declaration debt. None of the reported expressions are introduced by US17, while Muya's own typecheck is green and the built Electron product executes the full E2E gate. A detached-base comparison was attempted but is **not accepted as baseline evidence** because that worktree's dependency linkage resolved Muya back to the current US17 worktree. This limitation is recorded rather than relabeled as a passing baseline check.

### Learning review

- Async-content settlement is a **viewport ownership** problem as much as a geometry problem. Diagnose every potential `scrollTop` writer before adding another correction layer.
- Hydration is a geometry-settle boundary, but it must not revoke newer user ownership merely because two paint frames elapsed; late width/block measurements can still arrive afterward.
- A focused E2E that passes alone can still hide a scheduler race. When evidence points to load sensitivity, use a bounded repeated run with the same assertion/workload before changing production code.
- Test fixtures for scroll ownership must distinguish real input intent from naked programmatic `scrollTop` writes. The input gesture establishes ownership; direct geometry changes alone do not model the same product contract.
- A failed baseline-comparison environment is not evidence. Record it as invalid and rely only on independently valid gates.

## Stage 5 — PR handoff

Status: implementation committed and pushed; PR open, **not merged**.

- implementation commit: `5756473f` (`fix(editor): close async content settlement`);
- branch: `feat/v0.5-us17`;
- base: current `origin/develop@3e4da44e`;
- PR: **#213 — US17: close async content settlement**;
- local closeout gates are recorded above; inspect the latest PR head for CI status before any merge decision;
- merge policy remains squash-only, and this task does not auto-merge the PR.

## Stage 6 — first PR CI E2E follow-up

Status: first code-head CI exposed one test-fixture precondition race; fixture corrected locally and revalidated before repush.

PR #213 code head `5756473f` ran the full Linux Electron suite. The E2E job completed with **394 passed / 15 skipped / 1 failed**. The only failure was:

`US15 AC-81: Typewriter does not reclaim a newer user position when geometry above grows`

The failure happened **before** the product ownership assertion: `growthTargetMounted` was `false`, so the async-growth target had left the bounded virtual window before the test could trigger ResizeObserver growth. This is fixture-precondition evidence, not evidence that Typewriter reclaimed the viewport after growth.

Diagnosis showed that the fixture re-established the growth target with programmatic scroll while Typewriter follow was still active. Under loaded CI scheduling, Typewriter could legitimately recenter the caret and reclaim that programmatic fixture scroll before the target-settlement helper completed.

The fixture now follows the ownership contract explicitly:

1. after enabling Typewriter, issue a real wheel gesture first so user intent suspends Typewriter follow;
2. only then re-establish a currently mounted growth target just above the viewport;
3. use bounded small real wheel gestures and inspect actual geometry instead of assuming one wheel delta maps to a fixed pixel displacement;
4. require the target to remain mounted before triggering async growth;
5. keep the original AC-81 product assertions and geometry thresholds unchanged.

Post-fix local evidence:

- focused AC-81 stress: **10/10 passed with 2 workers**;
- complete `pnpm --filter inkiva test:e2e:virtualization`: **50/50 passed in 3.3 minutes**;
- changed-file Desktop ESLint: **passed**;
- `git -c core.whitespace=cr-at-eol diff --check`: **passed**.

The failed intermediate attempt is also retained as evidence: repositioning the target programmatically **before** suspending Typewriter produced **10/10 failures** at the helper postcondition. That invalid approach was removed rather than masked with retries, larger timeouts, or weaker assertions.

## Stage 7 — final PR CI closure

Status: code head **fully green**; PR remains open and unmerged.

Validated code head: `97be517d` (`test(e2e): stabilize typewriter geometry fixture`).

GitHub PR #213 completed the full gate set successfully:

- Desktop full E2E: **passed in 10m58s**;
- Desktop Lint: **passed**;
- Desktop Test: **passed**;
- Performance Fast Gate: **passed in 2m46s** with unchanged thresholds/workload;
- Muya Build: **passed**;
- Muya Lint: **passed**;
- Muya Test: **passed**;
- Muya E2E (Chromium): **passed**;
- Muya CommonMark + GFM spec: **passed**;
- Muya circular dependency check: **passed**;
- PR Build Windows x64: **passed**;
- PR Build macOS x64: **passed**;
- PR Build macOS arm64: **passed**;
- package smoke on Windows x64 / macOS x64 / macOS arm64: **all passed**;
- Updater artifact smoke: **passed**;
- artifact-link PR step: **passed**.

The first code head's Performance Fast Gate had reported only `observed max=1 does not satisfy eq 0`; the failed-step log did not identify the metric, and an artifact API lookup later timed out. The final code head passed the unchanged fast gate without any performance-threshold, sample-count, workload, retry, or product-code relaxation, so the earlier result is recorded as non-reproduced rather than assigned an invented root cause.

Final handoff: PR #213 is `MERGEABLE` against `develop`; per repository policy it remains **not merged** until an explicit squash-merge decision.
