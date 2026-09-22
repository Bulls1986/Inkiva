# ARCH-05 — Renderer Event Bus Contract Closure

## Recovery ledger

- Branch: `arch/05-event-bus-contract`
- Base: `origin/develop` at `4839ed4340175dd2f21d45c241d58a844dee1665` (`refactor(editor): extract document editor runtime (#157)`)
- Scope: architecture debt rank #2 from `ARCHITECTURE_AUDIT_2026-09.md`
- Goal: replace the renderer bus catch-all `Emitter<Record<string, unknown>>` with a closed, strongly typed event map without changing runtime event names or mitt's single-payload semantics.
- Final delivery: PR **#158** merged into `develop` on **2026-09-21 23:05:25 UTC**; merge commit `42ea8f57f63ddc1a5ce7753e3fad0b5e705f1fc2`.
- Classification: architecture/correctness work. No independent Before/After performance measurement was performed, so ARCH-05 is not recorded as a performance optimization result.

## Stage 1 — Baseline and audit

Status: completed.

Evidence:

- `packages/desktop/src/shared/types/bus.ts` is only a placeholder with `[key: string]: unknown[]`.
- `packages/desktop/src/renderer/src/bus/index.ts` bypasses that placeholder and instantiates `Emitter<Record<string, unknown>>`.
- Mechanical scan found **84 distinct literal renderer bus events** across `emit/on/off` call sites.
- Event domains include editor commands, file lifecycle, tabs, sidebar, search/replace, command palette, export/import, language, zoom/view state, image/cache and persistence flush events.
- `editor.vue` still has a registration helper using `event: string, handler: any`, which defeats compile-time protocol checking.

Non-goals:

- no event renaming;
- no conversion to tuple payloads;
- no business-flow refactor;
- no replacement of mitt;
- no weakening of existing tests or typecheck.

## Stage 2 — Test design

Status: completed.

Tests are intentionally fail-closed:

1. unknown event names must fail TypeScript compilation;
2. representative wrong payloads (`mt::window-zoom`, `TABS::close-this`, `showExportDialog`) must fail TypeScript compilation;
3. runtime unit coverage preserves mitt single-payload `emit/on/off` behavior;
4. payload-less events continue to deliver `undefined` and require no synthetic tuple wrapper.

The new `bus-contract.spec.ts` was added before implementation. Against the baseline catch-all bus, `pnpm typecheck` failed exactly as intended with four `TS2578: Unused '@ts-expect-error' directive` errors for: unknown event name, string zoom payload, numeric tab id, and unsupported `docx` export dialog type. This is the preserved red-test evidence proving the original bus did not enforce its protocol.

## Stage 3 — Implementation

Status: completed.

Implemented changes:

- `packages/desktop/src/shared/types/bus.ts` is now a closed `BusEvents` map with no catch-all string index signature.
- `packages/desktop/src/renderer/src/bus/index.ts` now instantiates `mitt<BusEvents>()`; mitt remains single-payload and runtime event names are unchanged.
- The contract covers 84 direct literal `bus.emit/on/off` events plus `insert-image` and `image-uploaded`, which are registered through the typed `registerBusHandler` helper: **86 named events total**.
- `editor.vue` `registerBusHandler(event: string, handler: any)` was replaced by a `keyof BusEvents` + `Handler<BusEvents[K]>` generic contract.
- main-to-renderer edit/paragraph/format string inputs are narrowed to known action unions before re-emitting onto the renderer bus; arbitrary strings no longer become arbitrary renderer event names.
- zoom and spelling payloads are validated at the ingress boundary before typed bus emission.
- `commandCenterRuntime.ts` no longer reintroduces `event: string` / `payload?: unknown`; it accepts the typed mitt `on` surface and exact command event payloads.
- the command-center startup test now uses a real `mitt<BusEvents>()`, so the adapter is exercised against the same compile-time contract as production.

Compatibility notes:

- No bus event was renamed.
- No event payload was converted to an array/tuple wrapper.
- The only behavior tightening is at invalid external input boundaries: unsupported dynamic edit/paragraph/format names, non-numeric zoom values, and malformed spelling replacement payloads are no longer forwarded into the renderer event graph.

## Stage 4 — Validation

Status: completed.

Completed validation evidence:

- red typecheck: expected failure with four unused `@ts-expect-error` directives on the pre-fix catch-all bus;
- post-fix `pnpm -C packages/desktop run typecheck`: **passed**;
- `bus-contract.spec.ts`: **3/3 passed**;
- `command-center-startup.spec.ts` + `bus-contract.spec.ts`: **4/4 passed**;
- targeted ESLint on all touched TS/Vue/test files: **0 errors**; 3 warnings are pre-existing (`commands/index.ts` unused `t`, `editor.ts` two non-null assertions) and are outside ARCH-05;
- escape audit: no `Emitter<Record<string, unknown>>` remains; no `handler: any` bus registration remains; the only variable event registration is the generic `registerBusHandler<K extends keyof BusEvents>`, which is compile-time closed.
- full lint: **0 errors / 235 warnings**; warnings are repository baseline warnings, not new ARCH-05 lint errors;
- focused renderer-event regression after fixing worktree-local dependencies: `listen-for-main.spec.ts` + `bus-contract.spec.ts` + `command-center-startup.spec.ts` = **6/6 passed**;
- full desktop unit suite with ARCH-05 changes: **140 files passed / 6 failed; 1180 tests passed / 16 failed / 1 skipped**;
- exact baseline comparison: all ARCH-05 changes were stashed, the same six failing specs were run at base `4839ed43` in the identical dependency environment, and they reproduced **6/6 failing files and the same 16 failing tests**. Therefore these failures are pre-existing baseline failures, not caused by ARCH-05. The files are `ui-02-chrome-contract`, `ui-04-controls-contract`, `document-intelligence-links`, `document-intelligence-repair`, `document-intelligence-history`, and `move-image-to-folder`.

Final delivery evidence:

- implementation was committed and delivered through PR **#158**;
- PR CI completed successfully across lint, test, E2E, Desktop PR fast hard gate, Windows x64, macOS Intel, macOS Apple Silicon, and artifact-comment job;
- the fast performance gate being green is an integration/regression gate result only; ARCH-05 did not perform an independent performance Before/After study and makes no measured speedup claim.

## Completed

- confirmed ARCH-05 is architecture-debt rank #2;
- created isolated worktree and branch from latest `origin/develop`;
- inventoried renderer bus usage: 84 direct literal bus events plus 2 helper-registered events, 86 total;
- added fail-closed compile-time + runtime bus contract tests;
- captured the expected red typecheck before implementation;
- implemented the closed `BusEvents` map and typed mitt instance;
- removed renderer bus `string`/`any` registration escapes, including command-center adapter leakage;
- post-fix typecheck, focused unit tests and targeted lint are green (lint has only 3 pre-existing warnings);
- final staged diff/hygiene review completed; `git diff --check` is clean and no lockfile/dependency manifest changes are present.

## Not completed

- None within the approved ARCH-05 scope.
- Broader renderer-event architectural changes beyond the closed 86-event contract are intentionally outside this task and require a separately scoped architecture item if needed.

## Worktree test-environment convention

Status: confirmed and must be followed for this task and future Inkiva worktrees.

- Do **not** assume a fresh worktree is test-ready merely because another checkout has `node_modules`.
- TypeScript-only checks may appear to work through Windows Junctions to another checkout, but Vite/Vitest resolves realpaths and rejects assets that land outside the current project root (`Denied ID ...other-worktree...`).
- A test-ready worktree needs its own pnpm isolated virtual store metadata: `node_modules/.modules.yaml` with `nodeLinker: isolated` and `virtualStoreDir` inside the current worktree.
- The verified recovery command is `pnpm install --offline --frozen-lockfile --ignore-scripts`. On this machine it reused **1827 packages, downloaded 0**, and completed in **3m 38.3s**; the earlier 120-second attempt timed out before a usable `node_modules` was created.
- After recovery, ARCH-05 had root/desktop `vitest`, desktop `vue-tsc`, and package links such as `github-markdown-css` resolving into `arch-05-event-bus-contract/node_modules/.pnpm`, eliminating the Vite realpath failure.
- This rule is now also documented in root `agent.md` with links to the architecture/recovery records so future coding agents do not rediscover it.

## Stage 5 — Delivery

Status: **completed and merged**.

- Local implementation commit: `bfd0edb98c54999af3db9380f381491c4d54af0b`.
- Normal Git Smart HTTP push/`ls-remote` repeatedly timed out on the original Runner even after `gh auth setup-git`; `gh auth status` itself was healthy for account `Bulls1986` with `repo`/`workflow` scopes.
- Delivery therefore used GitHub Git Data API rather than weakening or changing the source tree. Remote commit `40978f624d0f8adccace32a9106be7e59913ca84` was created from base `4839ed43`.
- Integrity check: local `HEAD^{tree}` and remote commit tree were exactly identical: `4dff8cabbf2c88ae0c878d70610007ecc56dfe58`.
- Remote branch: `arch/05-event-bus-contract`.
- Pull request: **#158** — `https://github.com/Bulls1986/Inkiva/pull/158`, base `develop`, final state **MERGED**.
- Merged at: **2026-09-21 23:05:25 UTC**.
- Merge commit: `42ea8f57f63ddc1a5ce7753e3fad0b5e705f1fc2`.
- Final CI status: **all 8 reported checks succeeded**:
  - `lint` — success;
  - `test` — success;
  - `e2e` — success;
  - `Desktop PR fast hard gate` — success;
  - `run-on-pr-head (windows-x64, windows-latest, windows, x64)` — success;
  - `run-on-pr-head (macos-x64, macos-15-intel, macos, x64)` — success;
  - `run-on-pr-head (macos-arm64, macos-15, macos, arm64)` — success;
  - `Comment artifact links on PR` — success.
- PR description preserves the red/green type-contract evidence, focused validation, full-unit baseline comparison, worktree environment lessons, and explicitly states that no test was weakened.

## Current blockers

None. ARCH-05 is complete in its approved scope and is already present in `develop` through merge commit `42ea8f57`.

The six local full-unit failures recorded in Stage 4 remain historical baseline observations: they were independently reproduced on the pre-change base and were not hidden, reclassified, or used to weaken tests. PR #158's actual required CI checks all completed successfully.

## Next step

No further ARCH-05 implementation work is required. Any future expansion beyond the closed renderer event contract should be opened as a new, separately scoped architecture task rather than extending the completed ARCH-05 record.
