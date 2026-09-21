# ARCH-05 — Renderer Event Bus Contract Closure

## Recovery ledger

- Branch: `arch/05-event-bus-contract`
- Base: `origin/develop` at `4839ed4340175dd2f21d45c241d58a844dee1665` (`refactor(editor): extract document editor runtime (#157)`)
- Scope: architecture debt rank #2 from `ARCHITECTURE_AUDIT_2026-09.md`
- Goal: replace the renderer bus catch-all `Emitter<Record<string, unknown>>` with a closed, strongly typed event map without changing runtime event names or mitt's single-payload semantics.

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

Pending delivery:

- commit / push / PR / CI.

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

- commit/push/PR/CI.

## Worktree test-environment convention

Status: confirmed and must be followed for this task and future Inkiva worktrees.

- Do **not** assume a fresh worktree is test-ready merely because another checkout has `node_modules`.
- TypeScript-only checks may appear to work through Windows Junctions to another checkout, but Vite/Vitest resolves realpaths and rejects assets that land outside the current project root (`Denied ID ...other-worktree...`).
- A test-ready worktree needs its own pnpm isolated virtual store metadata: `node_modules/.modules.yaml` with `nodeLinker: isolated` and `virtualStoreDir` inside the current worktree.
- The verified recovery command is `pnpm install --offline --frozen-lockfile --ignore-scripts`. On this machine it reused **1827 packages, downloaded 0**, and completed in **3m 38.3s**; the earlier 120-second attempt timed out before a usable `node_modules` was created.
- After recovery, ARCH-05 had root/desktop `vitest`, desktop `vue-tsc`, and package links such as `github-markdown-css` resolving into `arch-05-event-bus-contract/node_modules/.pnpm`, eliminating the Vite realpath failure.
- This rule is now also documented in root `agent.md` with links to the architecture/recovery records so future coding agents do not rediscover it.

## Current blockers

No ARCH-05 repository-code blocker. WebCodex managed-worktree bootstrap and delegated coding-agent execution are unavailable on this Runner, so the worktree was created manually and registered as a normal Project. The worktree dependency environment is now locally restored and validation is operational. The full desktop unit suite still contains six baseline-failing files unrelated to ARCH-05; identical failures were reproduced against clean base commit `4839ed43` in the same worktree and dependency environment.

## Next step

Commit the complete ARCH-05 chain, push the branch, create/update the PR, and follow CI to final status without weakening any gate. PR notes must explicitly state that focused ARCH-05 tests/typecheck/lint pass while the full desktop unit suite retains six independently reproduced baseline failures.
