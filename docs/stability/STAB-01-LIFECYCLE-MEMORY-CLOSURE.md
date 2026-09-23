# STAB-01 — Lifecycle & Memory Closure

## Task

Goal: close lifecycle/resource-release contracts across window, renderer, tab, document, editor, render-surface and background-service lifetimes.

Core rule:

> Every Creation Has an Owner. Every Lifecycle Has a Deterministic End. Destroyed Means Unreachable.

Branch: `stab/stab-01-lifecycle-memory-closure`

Base: `develop@cbc7e16221dafb342640872bbc022541d8562720`

## Phase 0 — Baseline / architecture review

Status: complete.

Reviewed:

- `AGENTS.md` and canonical Windows/worktree/testing/performance/workflow guidance.
- ARCH-01 editor runtime ownership.
- ARCH-06 public-boundary rule.
- ARCH-07 background scheduler lifecycle.
- ARCH-08 final architecture-closure report.
- BASELINE-01 post-governance performance/stability baseline.

Relevant inherited evidence:

- BASELINE-01 repeated 500K/1M lifecycle probes reported no linear heap-growth flag; mixed-tab single-delta growth was explicitly not treated as proof of leak.
- ARCH-07 requires scheduler close to release queued/deferred/running references and provides deterministic `activeCount === 0` coverage.
- `DocumentEditorRuntime` is the renderer editor lifecycle owner and disposes registered resources in reverse registration order.
- Existing geometry/TOC utilities already expose explicit `destroy()` contracts that cancel rAF, disconnect observers, remove scroll listeners and clear retained geometry.

Environment:

- Managed-worktree bootstrap returned the known `managed_worktree_root_unavailable` signature.
- Per `docs/agent/ENVIRONMENT.md`, no retry/exploration was performed; STAB-01 uses Git-native `.worktrees/stab-01`.

## Phase 1 — Lifecycle inventory

Status: complete. Ownership map was established before production changes; second-pass registry/timer/observer/IPC audit then narrowed the retained-resource candidates.

| Resource | Created by | Owner | Destroy trigger | Cleanup contract | Current risk |
| --- | --- | --- | --- | --- | --- |
| WYSIWYG Muya/editor instance | `editor.vue` | `DocumentEditorRuntime` integration | editor component unmount | `editor.destroy()`, ref cleared | Low; explicit |
| Image viewer | `editor.vue` | editor component/runtime | close viewer or editor unmount | `destroy()`, ref cleared | Low |
| editor DOM listeners | `editor.vue` | editor runtime presentation resources | editor component unmount | explicit `removeEventListener` | Low |
| typed renderer bus handlers | `editor.vue` | `DocumentEditorRuntime` | runtime dispose | registered disposer calls `bus.off` | Low |
| snapshot scheduler | editor runtime | `DocumentEditorRuntime` | runtime dispose | scheduler `dispose()` | Low |
| editor layout Resize/Mutation observers | `editorLayout.ts` | layout reconciler | editor presentation dispose | disconnect observers, cancel rAF, remove scroll listener, clear maps/sets | Low |
| TOC scroll synchronization | `tocOutline.ts` | editor presentation | editor presentation dispose | cancel rAF, remove scroll listener, clear positions | Low |
| Source CodeMirror instance | `sourceCode.vue` | Source component | Source unmount | Vue removes DOM; bus/timer/snapshot resources explicitly released | Medium: CodeMirror instance lifetime needs focused retained-reference verification |
| Source bus handlers | `sourceCode.vue` | Source component | Source unmount | explicit `bus.off` for all registered handlers | Low |
| Source commit timer | `sourceCode.vue` | Source component | Source unmount | `clearTimeout` | Low |
| Document Intelligence interaction listeners | Pinia DI store | store START/STOP lifecycle | STOP | remove all window listeners + cancel rAF | Low |
| Document Intelligence coordinator | DI store | DI store | STOP | coordinator `dispose()` | Low |
| DI timers/background handles | DI coordinator | coordinator | dispose | timers cleared, pending sets/cancel handles cleared, scheduler closed | Low |
| ARCH-07 scheduler queues/tasks | `BackgroundTaskScheduler` | coordinator/service | owner close/dispose | timer clear; task/deferred/running maps discarded+cleared | Low / contract-covered |
| Renderer performance rAF/observer | performance runtime | performance service | service dispose | cancel rAF/disconnect observer/clear state | Low |
| Autosave queued timers | `AutosaveQueue` | document autosave owner | tab close / queue dispose | cancel per-document timer/pending state; dispose clears all | Fixed: bulk-close path lacked per-document cancel |
| BrowserWindow/webContents refs | main process window/menu/services | main-process service/window registry | BrowserWindow close/destroy | window registry removal, watcher/menu cleanup, preflight owner-destroy rejection | Fixed preflight pending retention; other audited paths explicit |
| IPC listeners | main-process startup modules | application/main-process lifetime | app termination | mostly process-lifetime registrations | Medium: must distinguish intentional app-lifetime registration from per-window listener leakage |
| ripgrep active searches | main IPC ripgrep | one search request | cancel / finish / sender destroy | per-search destroyed listener + active-map disposer | Fixed: completed searches retained destroyed listeners |
| revision/snapshot cache | renderer snapshot service | live tab/document set | close / lifecycle sync | explicit `release`, `prune(liveIds)`, stale async result identity/revision checks | Low |
| virtual surface DOM/materialization | Muya/surface | editor/render surface | document/editor teardown | existing virtualization + editor destroy | Medium: verify repeated close/switch counters |

### Phase-1 observations

1. The governed editor path already has substantial symmetric cleanup; STAB-01 must not rewrite it without retained-resource evidence.
2. BASELINE-01 supports bounded memory retention, but its own report says long listener/observer endurance was manual/not executed; deterministic lifecycle counters remain useful.
3. Main-process window/webContents ownership, async search ownership and document close paths produced the actionable defects below. Snapshot cache release/prune and stale-result checks are explicit. Source-mode teardown has explicit bus/timer/scheduler guards; retained behavior still requires stress validation rather than speculative rewriting.

## Phase 2 — Reproduction / measurement

Status: complete for deterministic retained-resource reproduction; stress/memory trend validation continues in Phase 6.

Measurement rules applied:

- environment/bootstrap failures were excluded from product evidence;
- deterministic listener/timer/owner counts were preferred over RSS;
- production code was not changed until a focused red test reproduced each defect;
- BASELINE-01 heap/RSS data remains supporting context, not leak proof.

Environment note: a root dependency Junction allowed a main-process spec to run but caused Vite to resolve CSS through another checkout. Per `ENVIRONMENT.md`, that topology was removed. The worktree was repaired with one local offline frozen install; readiness is `vitest 4.1.9 / node 24.21.0`.

## Phase 3 — Confirmed retained resources

Status: complete for the audit findings.

| Issue | Symptom | Evidence | Root cause |
| --- | --- | --- | --- |
| STAB-01-01 ripgrep sender listener retention | completed searches left `webContents.destroyed` listeners behind | focused red: 7 tests, new case got listener count 1 after normal completion instead of 0 | sender-destroy listener was registered outside the individual search resource and only naturally disappeared when the renderer itself died |
| STAB-01-02 bulk-close autosave timer | closed tabs could still emit `mt::response-file-save` after the close | focused red: 6 tests, delayed IPC count 1 instead of 0 after `CLOSE_TABS` + timer advance | single-tab close called `autosaveQueue.cancel(id)`; bulk close did not |
| STAB-01-03 update preflight window retention | pending update preflight had no renderer-destroy exit and could retain promise/timer state until 15s timeout | focused red: 2/2 lifecycle expectations failed because no `destroyed` owner listener existed | timer/pending state was owned only by response/timeout, not by BrowserWindow/webContents lifecycle |

Not classified as leaks:

- `DocumentRevisionSnapshotCache`: closed-tab state is removed by `release` / `prune`; async completion checks entry identity + revision before publishing.
- editor layout/TOC observers and rAF: explicit `destroy()` disconnect/cancel paths.
- renderer/app IPC registrations that are installed once for renderer lifetime: owner is the renderer process, not a tab/document.
- preferences language polling interval: renderer-lifetime singleton; it is an idle-cost candidate, not retained-growth evidence.
- `DocumentWriteQueue._lastWrittenRevisions`: app-lifetime path→revision cache; bounded-size behavior will be documented separately from reachable-owner leaks.

## Phase 4 — Minimal lifecycle fixes

Status: complete for confirmed defects.

1. Ripgrep now registers one sender-destroy listener per active search and stores its disposer in the active-search entry. Every normal finish/cancel path removes that listener before dropping the entry. Focused regression: 7/7 pass.
2. `CLOSE_TABS` now cancels queued autosave work for each removed document, matching `FORCE_CLOSE_TAB`. Focused regression: 6/6 pass.
3. `RendererUpdatePreflight` now owns timer + renderer-destroy listener as one pending resource. Normal resolve, timeout, send failure and renderer destruction all converge on deterministic disposal. Focused regression: 2/2 pass.

Architecture check: fixes stay inside existing main-process IPC/update boundaries and renderer store/autosave boundary; no ARCH-06 shortcut or ARCH-07 bypass was introduced.

## Phase 5 — Regression test hardening

Status: complete.

Added/extended deterministic gates:

- ripgrep normal completion returns sender `destroyed` listener count to baseline;
- bulk tab close prevents delayed autosave callback from crossing the tab lifecycle;
- update preflight normal response and renderer destruction both return listener/timer counts to baseline.

Broader lifecycle regression suite:

- 10 spec files passed;
- 62/62 tests passed;
- coverage included document revision snapshots, editor runtime disposal, ARCH-07 background scheduler closure, watcher/window lifecycle, ripgrep, autosave, Source-mode dirty lifecycle and update-preflight owner destruction.

Electron lifecycle coverage:

- `editor-switch-performance.spec.ts`: 7/7 passed after the native test environment was repaired. It verifies one active editor, bounded warm/cold tab resources, snapshot reuse, deferred-snapshot race closure, autosave/save/export/close sharing and large-document switches without stale DOM retention.
- `view-modes.spec.ts`: 6 passed / 1 pre-existing skipped. Source → WYSIWYG teardown completed cleanly, CodeMirror surface disappeared on exit and mode-menu lifecycle returned to WYSIWYG state.

Typecheck classification:

- `packages/desktop` typecheck is not green on the baseline branch. The same command on clean `develop` reproduces the same Muya typing debt (`__MUYA_BLOCK__`, `MUYA_VERSION`, FileIcons declarations, sequence/prism declarations and readonly Promise typing).
- No typecheck error points at STAB-01 changed files. This is recorded as pre-existing gate debt and is not widened into an unrelated Muya cleanup.

## Phase 6 — Stress / memory / long-run validation

Status: complete for automated evidence available in the current environment.

### Existing fast lifecycle/performance gate

The existing PR-smoke fast gate ran unchanged through durable execution and passed:

- `@perf-fast-gate`: 1/1 passed in 3.8 minutes;
- it exercises real document, tab-switch, diagram and memory-cycle workloads and checks renderer errors/stability;
- no threshold, sample count, workload or assertion was weakened for STAB-01.

### Focused memory-closure diagnostic

A temporary diagnostic reused the production gate's `collectMemoryLeakCycleSamples` implementation and was removed after recording the result.

Method:

- 10 warm-up open/edit/switch/close cycles;
- 20 measured cycles;
- each measured sample collected after CDP `HeapProfiler.collectGarbage`;
- short evaluation window: 10 samples;
- long evaluation window: 20 samples.

Post-GC renderer heap series in bytes:

`18,789,192; 18,902,796; 18,960,340; 19,025,640; 19,166,296; 18,334,392; 18,354,656; 18,382,404; 18,399,168; 18,425,020; 18,442,528; 18,451,016; 18,461,336; 18,462,616; 18,468,456; 18,518,412; 18,532,784; 18,539,720; 18,546,772; 18,554,516`

Trend summary:

| Metric | Result |
| --- | ---: |
| first measured heap | 18,789,192 B |
| final measured heap | 18,554,516 B |
| minimum | 18,334,392 B |
| maximum | 19,166,296 B |
| short-window growth (10 samples) | +0.607% |
| long-window growth (20 samples) | -1.249% |
| short-window linear-growth flag | false |
| long-window linear-growth flag | false |

Interpretation:

- the measured renderer JS heap does not show a monotonic retained-growth staircase after warm-up;
- the long-window endpoint is below the first measured sample;
- the small positive short-window drift does not satisfy the gate's linear-growth evidence requirement;
- this evidence is specifically about reachable renderer JS heap after explicit test GC. It does not claim that Chromium allocator retention, native memory or RSS must return to an identical byte count.

### Extended interaction coverage

A combined Electron suite covering search, outline, image editing and all-block round-trip behavior produced 22 passing cases. The four failures were isolated to `all-blocks-roundtrip.spec.ts` LF/CRLF byte-stability assertions.

The identical all-blocks suite on clean `develop` reproduced the same four failures (1 pass / 4 failures), with the same Windows line-ending diffs. They are therefore classified as pre-existing correctness debt rather than STAB-01 lifecycle regressions.

Search, TOC/outline and image-related scenarios in the STAB-01 combined run passed without stale-callback or destroyed-object errors.

### Environment evidence excluded from product verdict

- the first Electron E2E run never entered product test bodies because worktree-local `ced.node` was absent after an `--ignore-scripts` dependency repair;
- an exact same-version/same-hash `ced.node` from the healthy main checkout restored E2E launch, after which the same editor-switch suite passed 7/7;
- full native rebuild attempts exceeded the Runner shell time budget, and a detached Electron rebuild exposed a `native-keymap@3.3.9` / Electron 42 MSVC compile incompatibility. E2E did not require changing product code or dependencies to pass;
- two ordinary fast-gate Jobs were externally stop-requested before producing a test result. The same unchanged gate completed successfully under durable detached execution.

## Remaining risk classification

| Classification | Current evidence |
| --- | --- |
| confirmed lifecycle leak | three confirmed defects found in STAB-01; all fixed with deterministic regression tests |
| suspected retention | `DocumentWriteQueue._lastWrittenRevisions` is an application-lifetime path→revision registry whose distinct-path cardinality can grow; no workload here proved harmful retained growth |
| expected cache | revision snapshots are budgeted/pruned; closed-tab history intentionally retains a bounded recent set before memory measurement |
| renderer-lifetime idle work | preferences search-language polling uses a renderer-lifetime interval; it is not document/tab retained-growth evidence but remains an idle-cost cleanup candidate |
| Chromium / V8 behavior | heap expansion, allocator retention and RSS are not treated as leaks without reachable-owner evidence |
| environment noise | baseline Muya typecheck debt, native-keymap rebuild incompatibility, Runner Job cancellation and native-addon bootstrap are excluded from the product verdict |

Architecture check remains satisfied: no fix bypasses ARCH-06 public boundaries or ARCH-07 background scheduling contracts.

### Build validation

- `corepack pnpm -C packages/desktop run build`: passed;
- Electron main/preload/renderer production bundles completed successfully;
- emitted Vite dynamic/static import warnings are existing bundling warnings and did not fail the build.

## Phase 7 — CI / merge

Status: complete.

PR: #181 — `STAB-01: close lifecycle and memory ownership gaps`.

Required/check evidence before merge:

| Check | Result |
| --- | --- |
| E2E Test / `e2e` | pass |
| Test / `test` | pass |
| Lint / `lint` | pass |
| Performance Fast Gate / `Desktop PR fast hard gate` | pass |
| PR Build / Windows x64 | pass |
| PR Build / macOS x64 | pass |
| PR Build / macOS arm64 | pass |
| PR artifact link comment | pass |

PR #181 merged into `develop` at 2026-09-23 05:46:25 UTC.

Merge commit: `a65c122e6c5e6cfe647de70b304bc5cd74a9438a`.

No CI threshold, sample count, workload or required assertion was weakened to obtain green status.

## Phase 8 — Documentation / experience closure

Status: complete.

Durable records:

- this document contains the lifecycle inventory, three confirmed defects, root causes, fixes, deterministic regressions, memory series, environment exclusions and remaining-risk classification;
- `docs/agent/TESTING.md` was refined in the implementation commit with the reusable STAB-01 lifecycle/memory evidence contract:
  - prove owner closure with deterministic resource counts before interpreting process memory;
  - do not treat bootstrap/native-addon/runner failures as product red evidence;
  - warm up JIT/lazy initialization/bounded caches;
  - use multi-cycle post-GC trends when test-only GC is available;
  - distinguish reachable JS retention from cache, Chromium/V8 allocator retention, native memory and environment noise;
  - reproduce broad failures on clean base before calling them regressions.

The task did not add duplicate environment guidance: the worktree/bootstrap/native-compilation paths encountered during STAB-01 were already covered by `docs/agent/ENVIRONMENT.md` and were followed rather than re-invented.

Because this final update is documentation-only after implementation PR #181 and all required checks are green, project policy does not require repeating implementation CI.

## Final STAB-01 verdict

STAB-01 is complete.

Evidence-based closure:

- **Creation / owner / disposal:** the lifecycle inventory identifies the primary editor, renderer, scheduler, observer, timer, IPC, cache and main-process owners and their destroy paths.
- **Confirmed defects:** three concrete lifecycle leaks/races were reproduced with red tests and fixed:
  1. completed ripgrep searches retained renderer `destroyed` listeners;
  2. bulk tab close allowed queued autosave callbacks to outlive their documents;
  3. update preflight requests could retain timer/promise/window-owned state until timeout after renderer destruction.
- **Deterministic closure:** focused and broader lifecycle tests prove listener/timer/task/callback state returns to the expected baseline; stale work cannot cross the repaired owner boundaries.
- **Memory:** after 10 warm-up cycles and 20 measured post-GC cycles, renderer JS heap moved from 18,789,192 B to 18,554,516 B; long-window growth was -1.249% and both short/long linear-growth flags were false.
- **Long-running interaction:** tab/document switching, source/WYSIWYG mode transitions, search, outline, images/blocks, diagrams, autosave/save/export/close and large-document stale-DOM scenarios completed without a STAB-01-specific destroyed-object or retained-growth failure.
- **CI:** all PR #181 checks passed before merge.
- **Architecture:** no STAB-01 fix bypassed ARCH-06 public boundaries or ARCH-07 scheduler ownership.

Remaining items documented above are explicitly classified as suspected bounded/application-lifetime retention, expected cache, renderer-lifetime idle work, baseline correctness/type debt, Chromium/V8 behavior or environment noise; none is currently supported by evidence as an unclosed STAB-01 retained-growth leak.
