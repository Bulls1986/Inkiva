# V06-13 — Performance and lifecycle qualification

## Identity / acceptance boundaries

- Base: `origin/develop@3992b5fc6de78998b5ded856b077e3b8971f4092` (following V06-12 closeout).
- Branch: `perf/v06-13-workspace-lifecycle`; isolated managed worktree `inkiva-2c995427`.
- Plan: `docs/product/V0.6-DELIVERY-PLAN.md` V06-13; outstanding workspace watcher qualification: #230.
- Governing contracts: `AGENTS.md`, `docs/agent/{TESTING,ARCHITECTURE_RELEASE,PERFORMANCE,WORKFLOW,ENVIRONMENT}.md`, `docs/architecture/ARCH-07-BACKGROUND-SCHEDULER.md`, and existing `perf/gate` / `perf/soak` contracts.
- Do **not** confuse P0 reference-runner qualification, PR Fast Gate, a workstation microbenchmark, or a single green CI job.

## Stage 0 — Scope and baseline (2026-10-21)

Completed:

1. Refreshed the authoritative remote `develop` ref; observed clean isolated base and identified watcher/index lifecycle boundaries.
2. Confirmed #230 remains open: its 1k/5k/20k workspace event-burst acceptance is not established by earlier Fast Gate results.
3. Identified the `project-tree-changed` 350 ms coalescing / `>256` distinct-path rescan boundary in the renderer store. At 256 or fewer paths, the coordinator independently refreshes backlinks and full broken-link diagnostics after each completed per-file update. This is a testable work-amplification hypothesis, **not yet a measured regression**.
4. Recorded existing `DocumentIntelligenceService` generation, per-file revision, unsaved-overlay and close-scope guards; existing unit tests already cover stale scan, external refresh and window isolation.
5. Defined an initial deterministic 64-file watcher-burst test of **all 64 distinct path updates** and at most two full diagnostic recomputations. This is a proposed new workload contract, not a weakening of any existing threshold or scenario.

### Workload inventory (fixed before measurements)

| Workload | Logical Markdown sources | Links | Images | Outline headings | Change pattern |
| --- | ---: | ---: | ---: | ---: | --- |
| Small workspace | 1,000 | 2 per file | 1 per 20 files | 1 per file | single file; 64 file burst |
| Medium workspace | 5,000 | 2 per file | 1 per 20 files | 1 per file | 256 file burst, directory rename |
| Large workspace | 20,000 | 2 per file | 1 per 20 files | 1 per file | 257 file overflow / full rescan, root switch |

Keep unopen files in these populations and keep real filesystem / Electron behavior distinct from synthetic `MarkdownLinkIndex` in-memory profiling. The existing `perf/gate` canonical fixture dimensions and minimum sample counts are unchanged; this table is a *supplementary* index/workspace stress suite definition. Record fixture creation tooling, environment, raw samples, percentiles, heap post-GC trend, event-loop lag, watcher handle closure, cancellation counts and process CPU once a runnable collector exists. Do not infer an absolute budget from this proposed inventory.

### Readiness/blocked evidence

- The initial managed worktree had no dependency graph; matching-lockfile root Junction to the source checkout did not expose a complete `vitest` launcher/transitive graph. A donor Vitest attempt failed in startup (`tinyexec/index.js` absent), **not** an executable product Red.
- Started one worktree-local `pnpm install --offline --frozen-lockfile --ignore-scripts` after safely removing the *worktree Junction*; the first bounded shell Job reached package linking but timed out. It is an environment bootstrap outcome and must not be called a test pass or fail.
- Continue to observe the single resumed install Job; only after successful tool discovery run the focused test to establish executable Red before modifying production code.

## Next gate

1. Complete worktree-local test readiness. Run the 64-path test on unchanged production code and retain actual assertion failure (Red), or explicitly mark strict TDD blocked.
2. If Red is valid, eliminate duplicate full diagnostics for an event burst while preserving every file update, stale-revision rejection, window isolation and disposable timers.
3. Measure identical source/environment workloads before and after any optimized code path; record **raw** output, not a guessed speedup.
4. Run focused unit, affected lifecycle/Electron tests, lint/typecheck/build, unchanged Fast Gate, and PR CI. Record reference-runner and native macOS limits honestly.
5. Review architecture and whitespace, commit and PR; squash merge only when the full required checks are actually accepted, then verify GitHub merged state and remote `develop` SHA.

## Stage 1 — Executed root-switch Red/Green (2026-10-21)

**Status: focused production defect fixed and tested; broad qualification pending.**

- The worktree-local offline dependency install completed successfully (`1850` linked packages; pnpm 10.33.4; 3m26.6s). On this Windows machine the `pnpm`-delegated Vitest launcher hits a known space-containing NVM path issue; direct trusted `node packages/desktop/node_modules/vitest/vitest.mjs` executes current-worktree specs correctly. The wrapper failure is environment-only.
- The first 64-event diagnostic test **passed unchanged baseline code** (1/1; 10 other tests skipped). Therefore it is a retained protection against amplification, **not evidence of a product defect** and not grounds for adding a coalescing patch layer.
- **Executable Red:** `node node_modules/vitest/vitest.mjs run test/unit/specs/document-intelligence-renderer.spec.ts -t "starts a new workspace scan before"` (cwd `packages/desktop`). The test body ran; the assertion `expect(api.indexWorkspace).toHaveBeenCalledWith('/fast')` failed: only `'/slow'` was called while the first scan remained pending. Existing coordinator reused scheduler id `workspace-index`, serializing two independent root generations and delaying the main-process generation guard that invalidates stale work.
- **Minimal fix:** the existing `DocumentIntelligenceCoordinator.indexWorkspace` now uses the monotonic `workspaceIndexVersion` in its scheduler id. Distinct root generations may invoke IPC concurrently; the main-process scope generation guard and renderer response-version check already reject obsolete scan results. No new IPC, no Markdown rewrite, no timer, no open-document ownership change.
- **Executable Green:** the complete `document-intelligence-renderer.spec.ts` suite passed **12/12** on the fixed code; includes the 64-event test and existing index/snapshot/scheduler/caret-independent guards.
- Added a dedicated slow-read/close-scope resource test in `document-intelligence-workspace-index.spec.ts`; execution is pending broader focused tests.
- Added `perf/soak/v06-13-workspace-index.mts`: real nested filesystem, 1k/5k/20k unopened Markdown files, 2 navigable links per file, image references and outline headings, raw scan/CPU/event-loop/memory/refresh observations, fixed 64-file refresh burst and close-scope backlink guard. It is **not** an Electron watcher, renderer input, cold-start or reference-machine gate.
- Smoke collector **passed**, but is expressly non-qualifying: 1k sources / one sample, Windows x64 Node 24.21.0, scan **669.17 ms**, single-file refresh **1.75 ms**, 64 file refresh **21.26 ms**, zero backlinks after scope closure. Raw record: `perf-results/v06-13/workspace-index/smoke.json` (local generated, untracked). These are observations only, not before/after proof or release budgets.

**Next:** complete 5-sample observations at all populations, update raw distributions/limitations, run all required tests and official CI. Do not close #230 on the basis of Node-only service observations.

## Stage 2 — Real-file service characterization (2026-10-21)

**Status: complete for the Node/service-only population. Not a reference or Electron pass.**

Executed command (repository root):

```bash
node --expose-gc --import tsx perf/soak/v06-13-workspace-index.mts
```

Real on-disk, unopened Markdown fixtures, Node 24.21.0, Windows x64, one process, five scans per population, post-GC heap sampling and 64 distinct refreshes per sample. Each scan indexed the exact expected number of files and returned all expected home backlinks; all 15 cycles rejected a stale backlink from a closed scope. Raw report is generated locally at `perf-results/v06-13/workspace-index/raw.json` (Git-ignored; regenerate from the fixed source).

| Files | Fixture content SHA-256 | Scan samples (ms, sorted) | Median scan | Range | 64-path refresh sample range |
| ---: | --- | --- | ---: | ---: | ---: |
| 1,000 | `55a120316f06c0...e6adcfa4` | 573, 649, 653, 685, 742 | 653 ms | 573–742 ms | 18–25 ms |
| 5,000 | `8d688ff0faa26c...94f90` | 3,202, 3,573, 4,386, 4,577, 5,237 | 4,386 ms | 3,202–5,237 ms | 18–39 ms |
| 20,000 | `d209df9f8502d2...31ff9` | 11,813, 12,003, 12,371, 13,369, 18,629 | 12,371 ms | 11,813–18,629 ms | 25–43 ms |

The population is intentionally not diluted or capped below 20k. Main-process event-loop samples are captured in the raw output. The five 20k post-GC heap values following scope closure were 8,875,032; 7,724,624; 7,722,552; 7,762,920; 7,719,216 bytes. No monotonic post-close heap growth appears in those five service-instance cycles, but this alone cannot certify a native watcher, open Electron window, or full renderer memory leak-free state. The service scan took up to 18.6 seconds for 20k unopened files; that is a useful characterization, **not a failed numerical release threshold** since no evidence-backed #230 freshness budget has been frozen. Do not claim a scan speedup: the root-switch fix targets scheduler start ordering, while this collector measures the unchanged main-process filesystem service.

Focused regressions: `document-intelligence-renderer`, `document-intelligence-workspace-index`, `watcher-batch`, and `watcher-lifecycle` **32/32 passed**. Muya declaration prebuild followed by desktop `vue-tsc --noEmit` passed. Changed-file ESLint passed (only existing Node module-type warning). The first isolated desktop typecheck without the canonical Muya type prebuild failed with missing ambient declarations; the required prebuild resolved it, with no production code workaround.

Remaining qualification, deliberately not inferred from this stage: true chokidar/Electron watcher churn with 256/257 event boundary and directory rename, renderer frame/input readiness under stress, cross-window real Electron resource teardown, package/updater gates, full unit/E2E/Fast Gate, same-environment measured before/after speedup (if claimed), and any official `reference-low-end` baseline. These are still required for an unrestricted V06-13 / issue #230 closeout.

## Stage 3 — Local regression and quality gates (2026-10-21)

- Full desktop unit regression: `node node_modules/vitest/vitest.mjs run test/unit` from `packages/desktop` **172 test files passed, 1,350 tests passed, 1 skipped**, exit 0. The skipped test was not changed by this task.
- Targeted lifecycle, watcher and workspace index suites: **32/32 passed**, including new close-on-in-flight-read guard and superseded-root Red/Green.
- Desktop TypeScript `vue-tsc --noEmit -p tsconfig.json`: **passed** after required worktree-local Muya `tsc --declaration --emitDeclarationOnly` declaration build **passed**. Initial typecheck without building the Muya types was invalid bootstrap evidence; no type assertions or product interfaces were weakened.
- Changed TypeScript and benchmark ESLint: **passed** with only the pre-existing Node module-type warning. `git -c core.whitespace=cr-at-eol diff --check`: **passed**.
- Fast Gate policy/evaluator contracts: `node --import tsx --test perf/soak/fast-policy.spec.ts perf/soak/fast-runner.spec.ts` **14/14 passed**. This checks contract/evaluation logic, **not** a real Electron Fast Gate collection/evaluation run.

Unfinished at this stage: real Electron performance collector, cross-platform official builds/package/updater verification, PR latest-head CI, reference machine (only qualified when actually executed). No claim of full V06-13 release qualification until these are explicitly classified.

## Stage 4 — Desktop build and E2E diagnostic

- The current-worktree Electron Vite build succeeded and produced main, preload and renderer artifacts.
- The targeted Windows cross-file link navigation Playwright run started and discovered both tests, but both timed out after 30 seconds before reaching a useful product assertion. This is an unresolved local launch/readiness diagnostic, not a valid product performance failure or successful E2E gate. Official CI still must execute its full real Electron suite.
- Review verdict: source diff modifies only the renderer document-intelligence scheduling key. The main-process generation and per-window checks remain untouched; no changed release thresholds, workloads, or Markdown semantics.
- Full desktop unit run: 172 files passed, 1350 tests passed, 1 skipped. CI results and any merger status must be appended to this record after authoritative observation.
