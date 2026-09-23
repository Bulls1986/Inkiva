# PERF-01 — Large Document Activation

> Status: IN PROGRESS — MEASUREMENT FIRST  
> Branch: `perf/perf-01-large-document-activation`  
> Base: `develop@cbc7e16221dafb342640872bbc022541d8562720`  
> Principle: **Fast Activation First / Defer Everything Non-Critical**

## Scope

Optimize the complete large-document activation path from an open/activate request to stable first paint, viewport readiness, accepted input, and post-editable stability. This task does **not** reopen PR-C full block virtualization and does not alter Source Mode correctness contracts.

The required activation milestones are:

`T0 request -> T1 data available -> T2 parse/model ready -> T3 runtime mounted -> T4 first meaningful paint -> T5 viewport ready -> T6 editable -> T7 critical path complete -> T8 non-critical settled`.

## Guardrails

- Current repository thresholds/workloads/sample counts remain unchanged.
- 50K is the primary hard-gate workload; 10K/100K/200K are scalability tiers for PERF-01.
- Electron UX measurements remain authoritative; microbenchmarks may explain but cannot replace them.
- Default graphics and `--use-angle=gl` measurements are independent series and are never pooled.
- Deferred work must use the ARCH-07 scheduler rather than ad-hoc timers/promises.
- Geometry correctness continues through ARCH-03/ARCH-04 contracts.
- Warm activation may reuse bounded state, but unlimited retained editor/DOM state is forbidden.

## Starting evidence

The latest completed BASELINE-01 real-Electron 50K run recorded first-screen p95 `132.38 ms`, editable p95 `619.23 ms`, and 8-tab warm switch p95 `46.45 ms`; it also exposed tail instability in editable readiness. These values are **historical baseline evidence only**, not PERF-01 Before numbers. PERF-01 will collect fresh Before measurements from this exact base and environment before any production optimization.

BASELINE-02 subsequently hardened benchmark timing/provenance and corrected 50K open timing so all samples use renderer-owned `openStartAt -> firstScreen/editable` milestones. PERF-01 will use the corrected harness semantics.

## Stage ledger

| Stage | Status | Evidence / next action |
| --- | --- | --- |
| 0. Base / worktree / instructions | Complete | Latest remote `develop` verified as `cbc7e162`; main checkout fast-forwarded; isolated `.worktrees/perf-01` created. |
| 1. Environment readiness | Complete for PERF-01 Electron measurement | Node `24.21.0`, pnpm `10.33.4`, offline dependency restore complete, current-worktree Electron build passes, Fast Gate policy tests pass 14/14, and `ced.node` was rebuilt successfully. Full `electron-rebuild -f` still fails later on optional `native-keymap@3.3.9` (`__builtin_frame_address` under MSVC/Electron 42), but this does not block the Electron performance harness. |
| 2. Activation instrumentation / fixture coverage | Complete | Focused 50K phase/milestone instrumentation, deterministic 10K/50K/100K/200K activation fixtures, renderer-frame attribution, and retained default/OpenGL Fast Gate captures cover the Activation Path needed by PERF-01. |
| 3. Fresh Before Electron baseline | Complete for 50K Fast Gate | Authoritative retained default-backend Before dataset is complete. Default and OpenGL backend series remain separate by contract; broader 100K/200K activation scalability remains diagnostic rather than a repository gate. |
| 4. Critical-path audit | Complete | Caret/selection, initial TOC/layout consumers, renderer long tasks, background/occlusion throttling and virtual geometry were decomposed. Residual cold-tail evidence is localized on this machine to ANGLE/D3D11 BeginFrame delivery; OpenGL removes the starvation in the same-build diagnostic, but one Intel/driver combination is not sufficient evidence for a global backend switch. |
| 5. Focused failing benchmark/test | Complete for optimization 1 | 50K virtual activation was proven to execute two full virtual geometry rebuilds; warm `setContent(markdown)` was 62.2/71.1 ms in the initial two-switch probe. |
| 6. Focused optimization | Complete | Optimization 1 removes the duplicate width-agnostic virtual geometry rebuild. Cold-path work defers initial caret placement and fresh-DOM TOC/layout geometry reads until after the relevant paint/editable boundaries without changing Muya public init semantics or milestone contracts. Focused correctness passed: desktop milestone/TOC 18/18, Muya virtual geometry 13/13, current Electron build passed. |
| 7. After / scalability / regressions | Complete for PERF-01 activation scope | Final retained default-backend Fast Gate has first-screen p95 111.63 ms and editable p95 149.70 ms; activation gates are green. Repository-wide default evaluator still fails unrelated scroll/search metrics. Separate final OpenGL Fast Gate is P0 green with first-screen p95 59.94 ms, editable p95 89.84 ms and scroll minimum 60 FPS. 10K/50K/100K/200K warm activation diagnostic shows no obvious superlinear growth. |
| 8. PR / Required CI / evaluator / merge | Ready for PR / Required CI; merge pending | Final-source default evaluator still reports the pre-existing scroll/search failures (`50 < 55`, `340.57 > 300`), both materially improved from Before (`20`, `986.15`). Per repository precedent, these are documented as baseline failures rather than silently reclassified; Required CI and review still decide merge readiness. The green OpenGL series remains diagnostic only. |
| 9. Experience closeout | Complete | Existing `docs/agent/PERFORMANCE.md` was refined rather than duplicated: merged-raw evaluator input and graphics-backend attribution rules are now canonical; Windows launcher handling remains in `docs/agent/ENVIRONMENT.md`. |

## Required final report

Final closure will include the requested Before/After table for first meaningful paint, editable, critical path, warm activation, input tails, long tasks, peak/retained memory, plus separate 100K/200K scalability results and explicit answers to the twelve PERF-01 closure questions.

## Stage 1 evidence — local readiness

Observed on the PERF-01 worktree:

- Node: `v24.21.0`.
- pnpm: `10.33.4`.
- `pnpm install --offline --frozen-lockfile --ignore-scripts`: completed successfully with zero downloads.
- `pnpm --filter inkiva build`: passed using this worktree's source and produced this worktree's Electron/Vite output.
- `pnpm test:perf:fast`: passed `14/14`; no threshold, workload, statistic or sample contract changed.
- `pnpm test:e2e:perf:fast`: invalid as product/performance evidence because Electron failed during bootstrap before entering the test body. The concrete failure is a missing `ced@2.0.0` native binding (`ced.node`), an already documented consequence of an `--ignore-scripts` dependency restore.
- The canonical VS2022 Developer Command Prompt path was then used for the native rebuild. `ced.node` was produced successfully before the rebuild later failed on optional `native-keymap@3.3.9` with MSVC/Electron 42 headers (`cppgc/heap.h`: `__builtin_frame_address` not found). Since the real Electron harness launches and completes without that optional binding, PERF-01 is not blocked on it.

Production code remains unchanged at this stage.

## Fresh Before — retained default-backend Fast Gate

Authoritative retained artifacts for the first PERF-01 Before run:

- raw trace: `perf-results/perf-01/before/default-fast/fast.raw.json`
- normalized report: `perf-results/perf-01/before/default-fast/fast.report.json`
- threshold evaluation: `perf-results/perf-01/before/default-fast/fast.evaluation.json`

Provenance: `develop@cbc7e16221dafb342640872bbc022541d8562720`, Electron `42.1.0`, Node `v24.21.0`, graphics backend `default`, `pr-smoke`, 20 real Fast Gate samples. The raw run itself completed successfully; the existing repository evaluator correctly reports current baseline threshold failures rather than hiding them.

| Metric | p50 | p95 | p99 | max | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| 50K first meaningful paint | 106.95 ms | 198.60 ms | 592.20 ms | 690.60 ms | p95 is immediately below the `<200 ms` gate; the first/cold sample is a large tail outlier. |
| 50K editable | 141.20 ms | 250.81 ms | 1050.48 ms | 1250.40 ms | Current p95 is slightly over the `<250 ms` gate; the first/cold sample dominates the extreme tail. |
| 8-tab warm switch | 81.95 ms | 117.85 ms | 323.81 ms | 375.30 ms | Current retained Before signal; must be decomposed before optimization. |
| 8-tab cold switch | 90.45 ms | 121.33 ms | 323.86 ms | 374.50 ms | Existing Fast Gate evaluator also flags this p95 against its current repository threshold. |
| 8-tab aggregate switch | 87.00 ms | 107.25 ms | 269.05 ms | 309.50 ms | Aggregate p99 currently exceeds the existing repository threshold. |
| input latency | 0.20 ms | 1.50 ms | 1.92 ms | 4.20 ms | Input remains well inside PERF-01 latency gates in this run. |

The repository-wide Fast Gate evaluation also reported failures outside PERF-01's activation scope (including scroll/search/save families). They are preserved in the evaluator artifact but are not being reclassified as activation bottlenecks.

### Measurement interpretation so far

- This run establishes the current baseline only; it does **not** yet identify a root cause.
- The first 50K activation sample is `690.6 ms` first-screen / `1250.4 ms` editable while the remaining samples are much lower. That is strong evidence of a cold/first-runtime tail, but the work responsible for it still has to be attributed with phase timings/counters.
- `editable` is scheduled via ordered animation-frame milestones. Mounted-block geometry prewarming occurs only **after** the editable marker, so that prewarm cannot explain the measured editable latency itself.
- Current code already defers full TOC publication until `Muya.whenRenderComplete()`. PERF-01 must therefore distinguish deferred TOC work from synchronous activation-side TOC/geometry setup rather than assuming the entire outline is blocking.

## Optimization 1 — remove duplicate virtual geometry build

### Evidence

The virtualized activation path performed the following sequence synchronously:

1. create/reindex the full virtual block model;
2. `_rebuildVirtualOffsets(state)` without a live content width;
3. attach the live scroll container;
4. immediately `_rebuildVirtualOffsets(this._virtualStates, contentWidth())` again.

`_rebuildVirtualOffsets()` is O(N) in top-level block count: it maps every state block through `estimateVirtualBlockAdvance()` and rebuilds the offset index. The duplicate execution was confirmed with a focused unit diagnostic: one initial virtual activation advanced `geometryRevision` from 0 to **2**. This is direct counter evidence of two full geometry builds on one activation, not a complexity claim inferred only from source inspection.

The optimization removes only the first width-agnostic pass. The live-width pass remains authoritative, so geometry semantics and the ARCH-03/ARCH-04 propagation contract are unchanged. The focused unit contract now asserts `geometryRevision === 1` after initial virtual activation.

### Focused Electron evidence

Initial two-switch 50K probe:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| warm `setContent(markdown)` switch A | 62.2 ms | 46.8 ms | -24.8% |
| warm `setContent(markdown)` switch B | 71.1 ms | 48.6 ms | -31.6% |

To reduce machine-state bias, a second paired real-Electron benchmark ran 20 warm UI tab activations on the same machine/time window. The old redundant geometry pass was temporarily restored for the paired Before build and then removed again for the paired After build; the workload/test code was otherwise identical.

| Metric | Paired Before | Paired After | Improvement |
| --- | ---: | ---: | ---: |
| 50K warm activation p50 | 71.55 ms | 59.70 ms | 16.6% |
| 50K warm activation p95 | 87.58 ms | 77.23 ms | 11.8% |
| 50K warm activation max | 113.80 ms | 108.30 ms | 4.8% |
| synchronous `setContent` p50 | 30.80 ms | 25.30 ms | 17.9% |
| synchronous `setContent` p95 | 38.09 ms | 33.61 ms | 11.7% |
| synchronous `setContent` max | 39.70 ms | 35.80 ms | 9.8% |

This optimization therefore removes one proven O(N) activation scan and produces a measurable UI-level warm-activation gain without retaining inactive virtual DOM.

### Scalability diagnostic

The final-source real-Electron scaling diagnostic sampled deterministic mixed-Markdown tiers at 10K = **21.9 ms / 288 blocks**, 50K = **29.0 ms / 909 blocks**, 100K = **29.8 ms / 1509 blocks**, and 200K = **42.2 ms / 3018 blocks**. This remains a one-sample-per-tier scalability diagnostic rather than a statistical hard gate, but it provides explicit 100K/200K evidence and does not show superlinear activation degradation.

### Full-gate anomaly retained, not hidden

One retained 20-sample post-change Fast Gate run under `perf-results/perf-01/after/default-fast/` completed successfully at the Playwright level but took 6.8 minutes versus 4.3 minutes for the Fresh Before run. Its evaluator showed broad simultaneous degradation across unrelated families (for example 50K first-screen p95 421.01 ms, editable p95 505.55 ms, plus scroll/search/tab failures). Because independent workloads regressed together, this dataset is retained as an anomalous/noisy run and is **not** used to claim either success or regression for optimization 1. The paired real-Electron activation benchmark above was added specifically to isolate the code delta from whole-machine variance.

### Clean formal After — retained default-backend Fast Gate

The clean retained run is under `perf-results/perf-01/after/default-fast-clean/`; the collector completed **1/1** in **3.0 min** with the same `pr-smoke` workload and twenty samples per required Fast Gate series. Evaluation uses `fast.raw.json` directly; directory-mode evaluation intentionally ignores `*.raw.json` and therefore must not be used for this merged capture.

| Metric | Before | Clean After | Change |
| --- | ---: | ---: | ---: |
| 50K first-screen p95 | 198.59 ms | 107.72 ms | -45.8% |
| 50K first-screen max | 690.60 ms | 246.80 ms | -64.3% |
| 50K editable p95 | 250.81 ms | 153.95 ms | -38.6% |
| 50K editable max | 1250.40 ms | 544.40 ms | -56.5% |
| 8-tab warm switch p95 | 117.85 ms | 41.41 ms | -64.9% |
| 8-tab cold switch p95 | 121.33 ms | 37.66 ms | -69.0% |
| 8-tab aggregate switch p99 | 269.05 ms | 38.38 ms | -85.7% |
| input latency p95 | 1.50 ms | 0.62 ms | -58.7% |
| 50K scroll minimum | 20 FPS | 51 FPS | +155% |
| 50K scroll p50 | 50 FPS | 60 FPS | +20% |

The repository evaluator changes from **8 Before failures** to **1 After failure**. The remaining failure is `document.50k.scrollFps` minimum `51`, below the existing temporary Fast Gate floor `>=55`. This is not an activation regression: the identical metric improved materially from Before (`min 20`, `p50 50`) to After (`min 51`, `p50 60`). PERF-01 does not weaken that threshold or relabel the evaluator as green. Activation-specific gates are green; the repository-wide evaluator remains red until the independent scroll minimum is closed.

A later final default-backend repeat under `perf-results/perf-01/after/default-fast-final/` confirms the activation result while exposing machine-noisy non-activation metrics: first-screen p95 `111.63 ms`, editable p95 `149.70 ms`, warm switch p95 `43.10 ms`; its repository evaluator fails only scroll minimum `50 < 55` and folder-search first-batch p95 `340.57 ms > 300 ms`. PERF-01 does not treat either as an Activation Path regression.

The separate final OpenGL series under `perf-results/perf-01/after/opengl-fast-final/` is **P0 green** without threshold/workload/sample changes: first-screen p95 `59.94 ms`, editable p95 `89.84 ms`, input p95 `0.90 ms`, scroll minimum `60 FPS`, save p95 `68.31 ms`, warm switch p95 `47.90 ms`, and zero crash/OOM/hang counters. This strengthens the backend-localization diagnosis but still does not justify forcing OpenGL globally from one Intel UHD 620 / driver environment.

## Cold-path attribution — native caret, geometry consumers, and frame delivery

The first-runtime 50K tail was decomposed below `Muya.init()` instead of being treated as one editor-init number.

1. The cold `Editor.focus()` hotspot was traced through `setCursor()` → `TextSelection.setSelection()` → `_updateSelection()` to Chromium native Range installation. In a representative pre-change probe, `setCursor` cost ~102.6 ms, `setSelection` ~101.5 ms, `_updateSelection` ~100.1 ms, and `_selectRange` ~98.7 ms; endpoint/path/offset work was sub-millisecond. This identified a browser layout flush caused by placing the caret against freshly constructed, not-yet-painted DOM rather than a Muya selection algorithm hotspot.
2. Desktop cold mount now calls `initEditorCore(false)` while Muya's public/default `init()` semantics remain unchanged. The initial caret is placed after the first-screen paint boundary and before the interactive marker. On painted DOM, representative `_selectRange` cost fell to ~1–3 ms instead of ~99 ms.
3. Desktop post-init setup exposed the same fresh-DOM layout-flush pattern. Initial `tocScrollSync.update/attach/refresh` measured ~130.4 ms. `attach()` already schedules a rebuild by rAF, so the immediately following synchronous `refresh()` was removed; focused TOC unit coverage now proves attach schedules the initial rebuild without an explicit refresh. When that synchronous TOC layout read was removed, the first layout flush migrated to `createEditorLayoutReconciler`, where its constructor measured ~92.2 ms while seeding direct-block geometry. TOC attach and layout-reconciler baseline are therefore deferred until after the editable milestone; correctness observers remain active for subsequent geometry changes.
4. UI-plugin construction is not the cold first-screen hotspot. The current 17 plugin slices are deferred until editable and are typically tens of milliseconds in aggregate, with no plugin slice required for first-screen rendering.

The low-level caret/selection/core-init/virtual-measurement probes used to establish those attributions were temporary diagnostic instrumentation. They were removed from the final source after the root causes were proven; the retained E2E keeps only bounded PERF-testing phase counters, ordered-frame timing/long-task evidence, virtualization counts, and renderer backend identity. This prevents root-cause probes from becoming permanent production-path complexity while preserving the stage record as the evidence ledger.

### Ordered-rAF tail attribution

After the synchronous caret/TOC/layout consumers were removed from the pre-first-screen path, the remaining cold editable tail was instrumented at each milestone-frame request. Serial real-Electron probes showed a single ordered `requestAnimationFrame` edge intermittently waiting ~300–700 ms while neighboring frames completed in single-digit or low-double-digit milliseconds. The delayed edge can migrate between the first-screen→interactive and interactive→editable boundaries.

The delay is **not currently attributable to renderer JavaScript work**:

- the editor window is visible, focused, and not minimized; renderer `document.visibilityState` is `visible` and `document.hasFocus()` is true;
- virtual-block ResizeObserver measurement callbacks were only 4 callbacks / ~6–20 ms total in representative probes;
- `PerformanceObserver(longtask)` found no long task spanning the delayed rAF edge;
- most decisively, on one representative delayed edge the frame was requested at 1213.6 ms, a simultaneously queued `setTimeout(0)` ran at 1215.6 ms (~2 ms later), but the rAF callback did not run until 1521.8 ms (~308 ms later).

This evidence assigns the residual cold editable tail to Electron/Chromium BeginFrame / rAF delivery rather than to a 300–700 ms Muya or desktop main-thread algorithm. The ordered paint-boundary milestone contract is intentionally unchanged; PERF-01 must not improve its score by collapsing/removing those frame boundaries. The next experiment is therefore limited to frame-delivery behavior (for example startup-scoped throttling/frame-pump behavior) while keeping the same first-screen / interactive / editable semantics.

### Frame-delivery backend attribution

A targeted anti-throttling diagnostic launched the 50K cold activation with `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`, and `--disable-backgrounding-occluded-windows`. The residual stall remained: in a representative sample milestone frame 4 was requested at 999.7 ms, its paired zero-delay timer ran at 1002.9 ms, but the rAF callback did not run until 1356.7 ms (~357 ms wait), with no renderer long task spanning that interval. Generic background timer throttling, renderer backgrounding and occluded-window backgrounding therefore do not explain the tail.

A same-build graphics-backend A/B then changed only `--use-angle=gl`. Earlier probes already showed the default backend repeatedly starving an ordered rAF edge while OpenGL did not. The backend-identity diagnostic now makes that attribution concrete: the default renderer reports `ANGLE (... Direct3D11 ..., D3D11)` on Intel(R) UHD Graphics 620, driver `31.0.101.2111`; with only `--use-angle=gl` added it reports `ANGLE (... OpenGL 4.5.0)`. Window visibility/focus and renderer visibility remain identical.

A fresh three-sample same-workload comparison after backend capture recorded default milestone-4 request-to-rAF waits of approximately **283 ms, 335 ms and 298 ms**. The corresponding OpenGL samples were approximately **4 ms, 10 ms and 14 ms**. Zero-delay timers still ran promptly beside the delayed default-backend frame, and no renderer long task spans that wait. The evidence therefore localizes this machine's residual cold editable tail to the **ANGLE D3D11 / Windows compositor BeginFrame-delivery path**, not to Muya parsing, virtual geometry construction, selection/caret work, TOC/layout work, UI plugins, generic timer throttling, or renderer JavaScript execution.

This remains **diagnostic evidence, not a global product-policy decision**: one Intel UHD 620 / driver combination is insufficient evidence to force OpenGL for every Windows user. PERF-01 will keep default and OpenGL measurements separate, preserve the ordered paint-boundary milestone contract, and treat a global graphics-backend switch as out of scope unless broader compatibility/performance evidence justifies it. The diagnostic also established a separate harness hazard: `app.getGPUInfo('basic')` can leave this Playwright/Electron run wedged even when the caller races it against a 5-second timeout. The PERF-01 timing probe therefore does **not** invoke that API; backend identity is collected from renderer WebGL/ANGLE information instead, so diagnostic telemetry cannot hold the activation run open.

### Windows E2E launcher diagnostic

The local Windows E2E path also exposed a separate environment problem: the active NVM path contains `Author Software`, and command-wrapper execution can split that path before the Playwright test body starts. The current-worktree Electron binary itself is healthy (`v42.1.0`) and the current-worktree Electron build passes. The E2E helper now resolves the real Electron executable through `node_modules/electron/path.txt` instead of the package `.cmd` wrapper, and the focused Playwright diagnostic can be run through the current Node executable plus Playwright's JavaScript CLI while keeping cwd/source/config/build artifacts in this worktree. These launcher failures are environment evidence, not product-performance evidence.

Final local regression validation used the repository's canonical `pnpm exec vitest` path: desktop milestone/TOC tests passed **18/18** and Muya progressive-render/virtual-geometry tests passed **13/13**. A single cold-activation Electron diagnostic also passed **1/1** and reproduced the expected backend timing evidence. A later command that aggregated several Electron cases under one Runner invocation exceeded the outer 90-second Runner budget before emitting test discovery/output; because the same individual scenario and the retained full Fast Gate complete successfully, that aggregate timeout is retained as test-infrastructure evidence rather than reclassified as a product failure.

