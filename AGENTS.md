# AGENTS.md

Repository-level instructions for coding agents working on Inkiva.

## 1. Product contract

Inkiva is a document-first Markdown desktop editor. The editing experience has higher priority than background work.

Follow these principles for every change:

- Preserve standard Markdown and standard links. Do not introduce Inkiva-only syntax into user documents.
- Prioritize keyboard input, caret/selection, IME, undo/redo, rendering state, and save before search/indexing/diagrams/images/update checks.
- Background work must not block startup, typing, scrolling, selection, or editing.
- Prefer simple, low-noise UI and consistent tokens/interactions.
- Do not trade correctness for benchmark numbers, CI green status, or implementation convenience.
- Do not describe a test-only change as a product/performance improvement.

## 2. Repository map

Inkiva is a pnpm monorepo.

- `packages/desktop/`: Electron + Vue 3 desktop application.
- `packages/muya/`: TypeScript editor engine currently used by the desktop renderer.
- `packages/muyajs/`: legacy editor engine being retired.
- `packages/website/`: website.
- `docs/`: architecture, performance, release, and progress records.
- `dist/`: packaged release artifacts.

Important boundaries:

- Main process: Node.js/Electron APIs, filesystem, windows, updater.
- Preload: main/renderer bridge.
- Renderer: Vue 3 + Pinia editor UI.
- Cross-process types belong under `packages/desktop/src/shared/types/`.
- Renderer code must not bypass the approved IPC/preload boundary.

Use the current repository state as authority; do not assume old architecture notes are still correct.

## 3. Mandatory task workflow

For non-trivial work use:

> inspect → plan → define tests → implement → validate → review diff → commit/push/PR when authorized → follow CI → record stage result

Rules:

1. Start from the latest intended base, normally `develop`.
2. Use one isolated worktree/branch per task.
3. Before implementation, define the failing or regression test that proves the problem.
4. Confirm the test actually exposes the problem before changing production code.
5. Never weaken assertions, thresholds, workloads, sample counts, or scenarios to make a change pass.
6. Run focused validation first, then the broader gates required by the affected area.
7. Review the final diff and workspace hygiene before handoff.
8. Every meaningful stage must update a resumable progress/architecture/performance document.
9. A PR being created does not mean it is merged. A green job does not mean every gate passed.
10. Do not merge automatically unless the user explicitly requests it.

## 4. Windows Runner: branch and worktree protocol

This repository is commonly operated through a Windows WebCodex Runner. The following rules are mandatory because the same environment failures have repeatedly wasted time.

### 4.1 Never loop on managed worktree bootstrap

If managed worktree creation returns:

`managed_worktree_root_unavailable`

then:

1. Treat it as a Runner capability/path restriction, not a repository defect.
2. Do **not** retry the same managed-worktree request.
3. Do **not** probe random alternative managed roots.
4. Use the registered main checkout and Git-native worktrees under:
   `E:\workspace\opensource\Inkiva\.worktrees\<task>`
5. Before creating anything, inspect existing worktrees/projects and reuse the intended task worktree if it already exists.

The normal fallback is:

- update/fetch the main checkout;
- make sure the intended base is current;
- create one Git-native worktree from the intended base;
- create/switch to the task branch there;
- register/use that worktree as the task project if required.

Never create a second worktree for the same logical task merely because the first bootstrap mechanism failed.

### 4.2 Do not work directly on a dirty main checkout

The main checkout is the source/base checkout. Keep it clean.

If it is dirty before task work begins:

- identify whether changes belong to an existing task;
- preserve or move them appropriately;
- restore the main checkout to a known clean state before using it as a base.

Do not silently discard unrelated user work.

## 5. pnpm / Node environment protocol

The Runner shell is not equivalent to an interactive developer terminal.

Verified Runner behavior:

- `node` is available.
- bare `pnpm` may return `CommandNotFound`.
- the supported package-manager entry point is `corepack pnpm`.
- current verified pnpm version is `10.33.4`.

Therefore all agent-run package commands should use:

```bash
corepack pnpm <args>
```

Examples:

```bash
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm -C packages/desktop exec vitest run test/unit/specs/example.spec.ts
corepack pnpm -C packages/desktop exec playwright test test/e2e/example.spec.ts
```

Hard rules:

- Do not globally install pnpm because bare `pnpm` is missing.
- Do not repeatedly probe different pnpm executables.
- Do not invoke relative Windows `.cmd` files such as `vitest.cmd` through `run_process`; use `corepack pnpm exec ...`.
- Do not treat package-manager command resolution failures as product-code failures.

## 6. Fresh worktree dependency protocol

A fresh worktree often has no usable `node_modules`. Treat dependency topology as infrastructure.

Before any install:

1. Compare the current worktree's `pnpm-lock.yaml` with the known-good/base checkout.
2. Inspect whether the local pnpm store is already populated.
3. Inspect whether the worktree already has a valid local pnpm link graph.
4. Only then decide whether dependency restoration is required.

When lockfiles match and the local store is populated, the preferred restoration command is:

```bash
corepack pnpm install --offline --frozen-lockfile --ignore-scripts
```

This is a link-graph restoration step, not a dependency upgrade.

After it completes, verify:

- `node_modules/.modules.yaml` exists;
- `nodeLinker: isolated`;
- `virtualStoreDir` points inside the current worktree's `node_modules/.pnpm`;
- required root/package `.bin` tools exist;
- representative package links resolve inside the current worktree.

### 6.1 Junctions are not a valid general test environment

Do not use another worktree's `node_modules` Junction as the normal solution for a test-ready worktree.

Reason: Vite/Vitest resolves realpaths. Cross-worktree Junctions can cause imports to resolve outside the current project root and produce errors such as `Denied ID ...other-worktree...`.

A Junction may be used only for a narrowly justified diagnostic experiment, never as proof that the worktree is ready for the real test suite.

A successful TypeScript check through a Junction does not prove Vitest/Vite/E2E correctness.

## 7. Job de-duplication: one logical operation, one active Job

A slow or silent Job is not evidence of failure.

Before starting any long-running operation such as:

- dependency install;
- unit/integration test;
- E2E;
- build/package;
- performance gate;
- release validation;

first inspect active Jobs for the same session/task.

Mandatory rules:

1. There may be **at most one active Job per logical operation**.
2. If the Job already exists, observe that exact Job.
3. Do not start a replacement because there is temporarily no output.
4. Timeout/client disconnect/unknown response does not prove the process stopped. Query Job state first.
5. Retry only after the original Job is confirmed terminal and the retry reason is understood.
6. Never run two concurrent `pnpm install` operations in the same worktree.
7. Never launch duplicate copies of the same test or performance gate merely to get faster feedback.
8. If duplicates were accidentally created, stop redundant copies and retain one authoritative execution.
9. Record abnormal Job recovery in the stage/progress document.

This rule applies across new chat sessions as well: recover existing task state before launching work again.

## 8. Recognize environment failures before touching product code

The following usually indicate environment/topology problems:

- `pnpm`, `vitest`, `vue-tsc`, or `eslint` not found;
- Vitest reports zero tests while Vite reports a denied path into another worktree;
- many unrelated suites fail simultaneously after dependency/worktree changes;
- Windows `.cmd` relative-path execution fails;
- managed worktree bootstrap reports `managed_worktree_root_unavailable`;
- offline dependency restoration is still running but temporarily emits no output.

For these cases:

- diagnose the environment first;
- do not patch product code;
- do not loosen Vite allowlists;
- do not weaken tests;
- do not start duplicate Jobs.

## 9. Testing contract

Testing is part of the implementation, not cleanup after implementation.

Choose the required levels based on the task:

- unit tests;
- integration tests;
- Electron E2E;
- packaged integration tests;
- release artifact contract tests;
- performance benchmarks/gates;
- stability and memory tests.

Typical commands:

```bash
corepack pnpm run test
corepack pnpm run test:unit
corepack pnpm run test:e2e
corepack pnpm run lint
corepack pnpm run typecheck
```

For a focused desktop Vitest spec:

```bash
corepack pnpm -C packages/desktop exec vitest run <spec>
```

For a focused Playwright spec:

```bash
corepack pnpm -C packages/desktop exec playwright test <spec>
```

Do not run the entire suite before a focused failing test has been reproduced when a narrower test is available.

## 10. Performance work rules

Every performance PR must contain a real code-path optimization, not only tests/telemetry/reporting/gate configuration.

A performance result must include:

- exact optimized path;
- same environment/workload/statistics before and after;
- raw Before → After values;
- reduction percentage and/or speedup;
- final threshold evaluation;
- stability/memory/regression result;
- remaining limitations.

Never pass a performance gate by:

- raising thresholds;
- lowering workload;
- reducing sample count;
- changing statistics;
- removing failing metrics;
- turning failures into warnings.

Local microbenchmarks and full Electron user-experience measurements must be reported separately.

## 11. Current fast performance gate

Treat the repository/configured gate as final authority if these values change. Current project targets include:

- 50K first paint p95 < 200 ms
- 50K editable p95 < 250 ms
- input latency p95 < 8 ms
- input latency p99 < 16 ms
- input latency max < 32 ms
- 50K scroll minimum >= 60 FPS unless an explicitly approved temporary task threshold says otherwise
- folder search first results p95 < 300 ms
- 50K save p95 < 100 ms
- diagram placeholder p95 < 50 ms
- synchronous above-fold diagram rendering = 0
- offscreen image request/decode = 0
- linear memory growth = 0
- crash / renderer crash / OOM / CPU runaway / renderer hang = 0

A green CI job is not equivalent to passing the final threshold report.

## 12. Code and architecture conventions

- TypeScript strict mode.
- 2-space indentation.
- no semicolons.
- single quotes.
- Follow `.github/COMMENTING-GUIDELINES.md`.
- Comments should explain rationale/invariants/ownership, not repeat the code.
- Keep cross-process types centralized.
- Respect Electron security/process boundaries.
- Prefer the smallest coherent architecture change over accumulating patches.
- Do not introduce blocking background work into editor hot paths.

## 13. Documentation and recovery records

For every multi-stage architecture, performance, stability, or high-risk editor task:

- maintain a progress/change ledger under `docs/`;
- record completed work, unfinished work, blockers, validation evidence, and next action;
- update it at stage boundaries so a new session can resume without rediscovery;
- never invent missing historical Before/After numbers.

Useful existing records include:

- `docs/architecture/ARCHITECTURE_AUDIT_2026-09.md`
- `docs/architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md`
- `docs/architecture/ARCH-05-EVENT-BUS-CONTRACT.md`
- `docs/perf-pr-c-change-ledger.md`

## 14. PR and release discipline

- PRs target `develop` unless the task explicitly requires another base.
- One PR should solve one clear objective.
- Strongly coupled implementation/tests/guards belong in the same coherent change chain.
- Performance PR dependencies must be validated in order.
- Do not claim completion before the required final gate passes.
- Do not claim merge before GitHub actually reports the PR merged.
- Release work must verify required tests, packaging, updater/artifact contracts, version/docs consistency, and platform targets defined by the current release workflow.

## 15. Startup checklist for every new coding session

Before changing code:

1. Read this `AGENTS.md`.
2. Identify the exact task/base/branch.
3. Inspect main checkout cleanliness.
4. Inspect existing task worktrees before creating one.
5. If managed worktree fails with `managed_worktree_root_unavailable`, immediately use the Git-native fallback; do not retry it.
6. Inspect active Jobs before starting any long-running command.
7. Use `corepack pnpm`, not bare `pnpm`.
8. Verify dependency topology before running tests.
9. Reproduce the problem with a focused failing test.
10. Record the stage so another session can resume without repeating environment discovery.
