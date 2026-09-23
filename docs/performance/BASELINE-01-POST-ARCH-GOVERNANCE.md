# BASELINE-01 — Post-Architecture-Governance Performance / Stability Baseline

> Status: AUTOMATED BASELINE COMPLETE — FOLLOW-UP PERFORMANCE WORK REQUIRED  
> Branch: `perf/baseline-01-post-arch-governance`  
> Baseline commit: `b48dadf18abc6047abc6eba81c47966b80ae6ab6` (`develop`)  
> Scope note: Tier 3 30/60 minute soak is **not executed in this task run**; it remains Manual / Reference Runner only.

## 1. Task Summary

BASELINE-01 establishes the authoritative post-ARCH-01～ARCH-08 performance, stability, lifecycle, and resource baseline without changing product behavior to improve numbers.

Governing principle:

> Measure First / Change Nothing Without Evidence

No performance threshold, workload, sample count, or correctness assertion may be weakened during this task.

### Stage record

| Stage | Status | Evidence / next action |
| --- | --- | --- |
| Base / architecture closure | Complete | Remote `develop` resolved to `b48dadf1`; local develop fast-forwarded exactly to it. ARCH-08 closure report states ARCH-01～08 governance is closed. |
| Isolated worktree | Complete | `.worktrees/baseline-01`, branch `perf/baseline-01-post-arch-governance`. |
| Environment readiness | Complete | Node 24.21.0; pnpm 10.33.4; offline local dependency graph restored; current-worktree Electron/Vite build passes. |
| Fast-gate contract | Complete | `pnpm test:perf:fast`: 14/14 pass; `minimumSamples=20`; repository thresholds unchanged. |
| 50K real Electron Fast Gate | Complete — FAIL | Retained 20-sample raw capture and formal evaluator output. First Screen/Input/8-tab/memory/stability pass; Editable/Scroll/Folder Search/Save fail current hard thresholds. |
| Embedded async geometry | Complete for automated baseline | GEO-ASYNC-001 passed; real Mermaid/local-image regression suite 7/7 passed; P2 diagram/image 20-sample capture completed after fixing a wrapper-vs-`<img>` test-probe bug. |
| 500K / 1M extended baseline | Complete for core large-doc | Default and OpenGL P1 doc-large both completed with 20 samples/tier; raw/statistics retained. |
| 8 Tab / lifecycle | Complete for requested mixed baseline | Existing 50K Fast Gate retained; mixed 2×50K + 3×500K + 1×1M + diagram-heavy + image-heavy workload completed 100 switches with raw data retained. |
| Source / save / background / DI | Complete for automated baseline | Source Mode 23/23 pass; Revision Snapshot 7/7 pass; DI 1K/5K/10K probe complete; scheduler/DI/runtime contracts 35/35 pass; integrated background traces retained. |
| CPU / resource classification | Complete for trace baseline | Main-thread/frame/background scheduling traces classified. Standalone DevTools/V8 `.cpuprofile` remains an optional manual follow-up. |
| Tier 3 soak | Not executed by request | Definition retained only; no 30/60min soak in Required CI. |
| PR / CI / closure | Complete | PR #174 passed Fast hard gate, E2E, lint, test, Windows/macOS matrix and was squash-merged into `develop` as `a6cd9160`. |

## 2. Environment

### Observed fact

- OS: Windows runner.
- Node.js: `v24.21.0`.
- pnpm: `10.33.4`.
- Product version: `0.4.0`.
- Baseline branch started from remote `develop@b48dadf18abc6047abc6eba81c47966b80ae6ab6`.
- Current worktree build is produced from this worktree; no foreign branch build output is reused.
- The normal Git HTTPS transport stalled and an explicit local proxy attempt failed with `Proxy CONNECT aborted`. Remote SHA was verified through GitHub API, and the exact commit object already existed locally, allowing a safe `--ff-only` update.
- Initial root `node_modules` donor was rejected after proving incomplete (missing `.bin`). The invalid Junction was removed. A worktree-local `corepack pnpm install --offline --frozen-lockfile --ignore-scripts` completed using the local pnpm store with zero downloads.
- First current-worktree build attempt failed before product execution because the package-local `electron-vite` CLI was unavailable. After the canonical offline dependency recovery, rerunning the same build passed. This is classified as **Environment**, not Product Stability/Performance.

### Interpretation

The worktree now satisfies the repository readiness contract for Electron E2E/performance evidence: dependency graph is local to the baseline worktree and build artifacts originate from the current commit.

### Recommendation

Use this exact worktree/environment for the remaining BASELINE-01 automated measurements. Do not reinstall or switch Node/pnpm unless new evidence invalidates the current readiness state.

## 3. Document Dataset

The deterministic repository fixture generator was used without reducing workload.

| Tier | File size | Characters | Blocks | Headings | Paragraph-like blocks |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50K | 50,000 B | 50,000 | 609 | 301 | 603 |
| 500K | 500,000 B | 500,000 | 4,009 | 2,001 | 4,003 |
| 1M | 1,000,000 B | 1,000,000 | 10,009 | 5,001 | 10,003 |

Paragraph-like count is a documented measurement heuristic over blank-delimited blocks, excluding heading, fenced-code, list, blockquote, and table-leading blocks. Raw metadata is retained in `perf-results/baseline-01/dataset.json`.

No workload was reduced after collection started.

## 4. 50K

### Existing hard-gate contract — observed fact

Repository `perf/soak/thresholds-fast.json` currently requires at least 20 samples and includes:

- `document.50k.firstScreen p95 < 200ms`;
- `document.50k.editable p95 < 250ms`;
- `core.input.latency p95 < 8ms`;
- `core.input.latency p99 < 16ms`;
- `core.input.latency max < 32ms`;
- `document.50k.scrollFps min >= 55`;
- `save.50k p95 < 100ms`;
- existing diagram/image/search/8-tab/memory/stability hard gates.

The repository's currently configured 55 FPS minimum is preserved exactly. The normal product target documented in `docs/agent/PERFORMANCE.md` remains 60 FPS. BASELINE-01 changes neither value.

`pnpm test:perf:fast` passed 14/14 policy/runner tests, including explicit proof that 55 FPS passes and 54 FPS fails.

### Real Electron measurements — observed fact

The retained workload completed successfully as one Playwright collection run (`1 passed`, about 3.0 minutes). The formal Fast Gate evaluator then **failed** four hard gates. A green Playwright collection result is therefore not treated as a green performance gate.

Raw artifacts are retained under `perf-results/baseline-01/fast/`:

- `fast.raw.json`;
- `fast.report.json`;
- `fast.evaluation.json`;
- `fast.statistics.json`;
- source category captures.

| Metric | Samples | p50 | p95 | p99 | Min / Max | Hard Gate |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| First Screen | 20 | 92.20 ms | 132.38 ms | 261.20 ms | 48.50 / 293.40 ms | PASS (`p95 < 200`) |
| Editable | 20 | 124.80 ms | **619.23 ms** | 646.97 ms | 72.90 / 653.90 ms | **FAIL** (`p95 < 250`) |
| Input latency | 298 | 0.20 ms | 0.70 ms | 1.30 ms | 0 / 1.70 ms | PASS |
| Scroll FPS | 20 | 42.5 FPS | 57 FPS | 57 FPS | **28 / 57 FPS** | **FAIL** (`min >= 55`) |
| Save | 20 | 56.70 ms | **210.25 ms** | 210.93 ms | 46.50 / 211.10 ms | **FAIL** (`p95 < 100`) |
| Folder search first batch | 20 | 148.25 ms | **363.83 ms** | 453.97 ms | 132.80 / 476.50 ms | **FAIL** (`p95 < 300`) |
| 8-tab warm switch | 20 | 32.20 ms | 46.45 ms | 47.29 ms | 29.30 / 47.50 ms | PASS |
| 8-tab cold switch | 20 | 35.20 ms | 43.30 ms | 46.42 ms | 29.00 / 47.20 ms | PASS |
| 8-tab general switch | 20 | 31.65 ms | 39.39 ms | 45.32 ms | 20.80 / 46.80 ms | PASS |
| Heap growth | 233 | 0 | 0.0115 | 0.0138 | 0 / 0.01475 | PASS (`max < 0.15`) |

Additional hard-gate observations:

- diagram placeholder p95: 32.625 ms — PASS;
- diagram first-screen synchronous renders: 0 — PASS;
- offscreen image request/decode: 0 / 0 — PASS;
- 8-tab freeze: 0 — PASS;
- heap linear-growth flag: 0 — PASS;
- crash / renderer crash / OOM / CPU runaway / renderer hang: all 0 — PASS.

### Interpretation

This machine/run does **not** currently satisfy the complete 50K Required Hard Gate. The distribution matters: First Screen, input, tab switching, memory, media deferral, and stability are healthy in this run, while editable readiness contains two ~617–654 ms tail samples, scroll has repeated samples between 28–50 FPS, search has several high-tail samples, and save has multiple ~162–211 ms tail samples.

These observations are retained as baseline evidence. No threshold, sample, or workload change is permitted in response.

### Recommendation

Continue BASELINE-01 to determine whether these four failures correlate with reproducible product hot paths, cross-scenario interference, or machine/measurement conditions. Any optimization or correctness change must be split into evidence-backed follow-up work; BASELINE-01 itself does not tune the product to force a pass.

### Graphics-backend scroll comparison

At user request, scroll FPS is measured separately for the default graphics backend and Electron/Chromium `--use-angle=gl`. The workload and 20-sample count are unchanged. Default remains the authoritative Hard Gate path; OpenGL is a comparison baseline.

| Backend | Samples | Min FPS | Average FPS | p50 FPS | p95 FPS | Max FPS | Hard Gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Default | 20 | **28** | **44.50** | 42.5 | 57.0 | 57 | **FAIL** |
| OpenGL (`--use-angle=gl`) | 20 | **31** | **54.35** | **61.0** | 63.05 | 64 | **FAIL** |

Observed fact: OpenGL materially improves average and median FPS on this machine, but the minimum remains far below the existing >=55 FPS hard gate. The result therefore does not support treating the default-backend failure as purely a driver-selection issue.

For 500K and 1M, FPS will continue to be reported as two separate backend series rather than pooled into one number.

## 5. 500K

### Large-document baseline — observed fact

The P1 `doc-large` workload was executed with 20 samples on both graphics backends. It includes open/readiness, virtualization diagnostics, Outline navigation, heading jump, scroll, input, current-document search, save, undo/redo, and selection/range correctness.

| Metric | Default | OpenGL request (`--use-angle=gl`) |
| --- | ---: | ---: |
| First Screen p50 / p95 / max | 130.15 / 175.16 / 622.80 ms | 137.40 / 214.84 / 607.00 ms |
| Editable p50 / p95 / max | 151.70 / 221.50 / 932.10 ms | 159.60 / 239.77 / 645.90 ms |
| Input p50 / p95 / max | 40 / **778,216** / **926,720 ms** | 40 / 48 / 48 ms |
| Scroll min / avg / p50 / p95 / max | **36.45 / 55.56 / 56.87 / 60.00 / 60.00 FPS** | **59.99 / 60.00 / 60.00 / 60.00 / 60.01 FPS** |
| Save p50 / p95 / max | 170.20 / 185.07 / 190.10 ms | 172.70 / 187.65 / 188.50 ms |
| Current search p50 / p95 / max | 344.05 / **111,190.15** / **118,762.70 ms** | 345.65 / 379.56 / 380.80 ms |
| Mounted ratio p50 / p95 | 0.003994 / 0.003994 | 0.003994 / 0.004002 |
| Materialized ratio p50 / p95 | 0.003994 / 0.003994 | 0.003994 / 0.004002 |
| Detached DOM blocks | 0 | 0 |
| Selection/Range exceptions | 0 | 0 |

Default-backend Input samples reveal two discrete stalls rather than uniformly slow input:

`48, 32, 40, 770400, 40, 32, 40, 40, 32, 48, 24, 40, 24, 32, 926720, 40, 40, 24, 24, 24 ms`.

The same default-backend iterations also contain current-search stalls around 110.8 s and 118.8 s. The OpenGL comparison has no corresponding Input stall; all 20 OpenGL Input samples are within 24–48 ms and search stays within about 327–381 ms.

### Interpretation

500K remains virtualized: only about 0.4% of logical blocks are mounted/materialized, with zero retained detached DOM blocks and zero selection/range exceptions in both runs.

The default-backend run contains two severe user-visible stalls that dominate the 49.2-minute workload duration. The otherwise-normal samples plus the clean OpenGL comparison make a simple “500K is intrinsically too large” explanation inconsistent with the evidence. The correlation with the graphics backend is strong, but BASELINE-01 does **not** yet assign root cause to ANGLE/GPU alone because input/search scheduling and renderer event processing share the same renderer lifetime.

No new 500K Hard Gate is created by BASELINE-01. The stall evidence should be isolated in a follow-up performance task rather than hidden by changing thresholds or dropping samples.

### Raw evidence

- `perf-results/baseline-01/large-default/P1.raw.json`
- `perf-results/baseline-01/large-default/P1.statistics.json`
- `perf-results/baseline-01/large-opengl/P1.raw.json`
- `perf-results/baseline-01/large-opengl/P1.statistics.json`


## 6. 1M

### Extreme baseline — observed fact

The same 20-sample P1 large-document workload completed for 1M on both backends.

| Metric | Default | OpenGL request (`--use-angle=gl`) |
| --- | ---: | ---: |
| First Screen p50 / p95 / max | 253.70 / 478.49 / 2028.70 ms | 255.80 / 411.30 / 2075.60 ms |
| Editable p50 / p95 / max | 279.15 / 527.18 / 2531.40 ms | 277.25 / 444.15 / 2134.20 ms |
| Input p50 / p95 / max | 56 / 64.4 / 72 ms | 56 / 72.8 / 88 ms |
| Scroll min / avg / p50 / p95 / max | **56.07 / 58.83 / 59.02 / 60.01 / 60.01 FPS** | **52.99 / 58.90 / 59.99 / 60.00 / 60.01 FPS** |
| Save p50 / p95 / max | 187.60 / 203.10 / 203.10 ms | 185.70 / 200.96 / 232.40 ms |
| Current search p50 / p95 / max | 418.80 / 452.98 / 498.30 ms | 431.00 / 461.30 / 476.60 ms |
| Mounted ratio p50 / p95 | 0.001532 / 0.001599 | 0.001532 / 0.001532 |
| Materialized ratio p50 / p95 | 0.001532 / 0.001599 | 0.001532 / 0.001532 |
| Detached DOM blocks | 0 | 0 |
| Selection/Range exceptions | 0 | 0 |

### Interpretation

1M is operationally usable in this workload: editor readiness is sub-second at p95, input remains tens of milliseconds rather than seconds, search/save complete, and virtualization remains strongly bounded at roughly 0.15% mounted/materialized blocks.

The principal limitation observed here is latency growth rather than loss of virtualization. First-screen/editable have multi-second max tail samples, and input/save/search are materially slower than the 50K experience.

The 50K hard thresholds are **not** applied to 1M. FPS is also not converted into a new hard threshold: default min is 56.07 FPS while the OpenGL-request run has one 52.99 FPS low-tail sample despite a ~60 FPS median. These are baseline observations, not a gate definition.


## 7. Embedded Geometry

### Correctness — observed fact

`GEO-ASYNC-001` passed in the current baseline worktree. It asynchronously grows segment-tail content through the ResizeObserver geometry path, repeatedly scrolls across virtual segments, and verifies both viewport materialization and Outline alignment after each height change.

A second real-content suite also passed **7/7**:

- hidden Mermaid source does not enlarge document scroll range;
- tab scroll position restores after asynchronous diagram layout settles;
- crossing multiple Mermaid regions does not roll the viewport backwards;
- offscreen Chinese/space-path local image stays virtualized and mounts when visited;
- temporarily invalid Mermaid source remains isolated and becomes renderable after repair;
- equivalent ASCII local-image control loads after its region is mounted;
- Source round-trip preserves local-image syntax and returns to bounded WYSIWYG.

No covered automated scenario reproduced:

- half-screen blank;
- blank viewport that fills only after another scroll;
- Outline/TOC drift;
- stale virtual height;
- unexpected scroll rollback/jump caused by asynchronous embedded-content height changes.

### Diagram / image 20-sample baseline

The existing P2 diagram/image collector initially failed as **Test Infrastructure** because it searched only for an offscreen `<img>`. Correct virtualization can intentionally leave only the `.mu-inline-image` wrapper mounted while the image itself is absent. The collector was aligned with the already-established Fast Gate wrapper-based probe; product code was not changed.

After that measurement-only fix, the 20-sample P2 collector passed:

| Metric | Result |
| --- | ---: |
| Diagram placeholder p50 | 553.45 ms |
| Diagram placeholder p95 | **626.61 ms** |
| Diagram placeholder max | 643.90 ms |
| First-screen diagram render started before editable | observed in some samples; max flag = 1 |
| Offscreen image request | 0 / 20 |
| Offscreen image decode | 0 / 20 |
| Diagram error retry | 0 / 20 |

### Interpretation

The current Geometry → Virtual Surface → Scroll / TOC contract is correct in the covered synthetic and real Mermaid/image scenarios. Embedded rendering still has measurable scheduling cost: the extended diagram-heavy workload has a much slower placeholder tail than the small 50K Fast Gate fixture, and some diagram work begins before the editor's editable milestone. This is a performance/scheduling observation, not evidence of geometry corruption.

Correctness failures such as blank viewport, TOC drift, virtual-height mismatch, or unexpected scroll jump remain blocking Product Correctness defects if reproduced in future workloads.

## 8. Multi-Tab

### Observed fact

The existing 50K Fast Gate remains healthy for its declared 8-tab workload: warm-switch p95 46.45 ms, cold-switch p95 43.30 ms, general-switch p95 39.39 ms, and freeze count 0.

BASELINE-01 also executed the requested mixed-size lifecycle workload using 8 real tabs: 2×50K, 3×500K, 1×1M, one diagram-heavy document, and one image-heavy document. After all tabs were opened, the test completed **100 sequential tab switches** on the default graphics backend with zero renderer errors.

| Metric | Samples | p50 | p95 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mixed 8-tab switch | 100 | **339.65 ms** | **1685.72 ms** | **1756.06 ms** | **1841.40 ms** |
| 50K-a | 12 | 356.55 ms | 394.29 ms | 395.66 ms | 396.00 ms |
| 50K-b | 13 | 137.40 ms | 340.56 ms | 399.31 ms | 414.00 ms |
| 500K-a | 13 | 465.30 ms | 575.72 ms | 645.94 ms | 663.50 ms |
| 500K-b | 13 | 203.20 ms | 339.22 ms | 341.28 ms | 341.80 ms |
| 500K-c | 13 | 203.60 ms | 349.12 ms | 355.26 ms | 356.80 ms |
| 1M | 12 | **1684.75 ms** | **1793.99 ms** | **1831.92 ms** | **1841.40 ms** |
| Diagram-heavy | 12 | 421.05 ms | 463.92 ms | 465.02 ms | 465.30 ms |
| Image-heavy | 12 | 217.35 ms | 312.10 ms | 384.74 ms | 402.90 ms |

The baseline-specific `>100ms` observation flag fired on all 100 mixed switches. This is not an existing repository Hard Gate, so BASELINE-01 reports it as user-visible latency evidence rather than inventing a new pass/fail threshold.

Renderer heap after the 100 switches was +13,324,232 bytes (~12.7 MiB) relative to the already-loaded 8-tab baseline. One before/after delta is insufficient to establish a leak or linear-growth trend.

Raw evidence: `perf-results/baseline-01/mixed-tabs/P1.raw.json` and `P1.statistics.json`.

### Interpretation

The architecture remains functionally stable under mixed tab pressure (100/100 transitions complete, no renderer error), but the lifecycle cost of reactivating large cold documents is material. The 1M tab is the dominant tail at ~1.7–1.8 seconds. This is **Product Performance** follow-up evidence, not a correctness failure and not proof of a memory leak.

## 9. Source Mode

### Observed fact

Focused real Electron coverage passed **23/23** across `editor-input`, `parity-cursor-lang`, `parity-source-undo-saved`, and `external-reload-undo`.

Covered behaviors include:

- WYSIWYG ↔ Source content round-trip;
- WYSIWYG caret → CodeMirror line/column synchronization;
- Source → WYSIWYG caret restoration after bulk source edits;
- source-mode scroll position preserved across same-tab reload;
- Chinese / zh-CN editing paths;
- one-step undo/redo around source-mode bulk edits;
- saved/dirty indicator transitions and save → edit → undo-to-saved semantics.

No source-mode correctness regression or renderer crash was reproduced. The existing `immediate → nextTick → rAF` restoration behavior therefore remains unchanged.

### Interpretation

Source Mode correctness is closed for the current automated baseline. Large-document Source Mode latency is still a performance observation opportunity, but current evidence does not justify changing the restoration sequence or editor handoff contract.

## 10. Save / Snapshot

### Observed fact

Focused `editor-switch-performance.spec.ts` coverage passed **7/7**. It verifies snapshot reuse on tab return, preservation of edits racing the deferred snapshot, one serialization per saved revision, sharing of one revision snapshot across autosave/tab switch/save/export/close, and bounded warm large-document virtualization without stale DOM retention.

The measured 50K Fast Gate still records Save p95 **210.25 ms** against the existing `<100 ms` Hard Gate. Larger tiers record Save p95 ~185–203 ms, but BASELINE-01 creates no new 500K/1M save threshold.

### Interpretation

Current evidence does **not** support duplicate same-revision O(N) serialization. Revision Snapshot Architecture is functioning at the persistence coordination boundary. Remaining save latency is a Product Performance problem to profile downstream, not justification for a second cache layer.

## 11. Background Services

### Contract evidence

Focused ARCH-07 / runtime validation passed **35/35 tests** across:

- background priority scheduler;
- Document Intelligence renderer coordinator;
- `DocumentEditorRuntime`;
- editor hot-path / snapshot scheduler.

The passing contracts cover priority ordering, holding background indexing while an interactive window is pending, latest/same-key behavior, cancellation/close semantics, scheduler-owned reference release, Document Intelligence routing and stale-response rejection, snapshot coalescing, and runtime disposal.

### Integrated workload evidence

A 50K-workspace integrated run captured real `document-sync`, `backlinks`, and `history` scheduler slices while the editor remained live. Observed scheduler task slices were ~**0.3 ms** each. Renderer `core.main.block` p95 was ~**1.7 ms**, with one spike at **376.2 ms**. Frame duration p95 was ~**16.8 ms**, with isolated long-frame spikes up to ~583 ms. Retained stability counters were crash=0, rendererCrash=0, OOM=0, rendererHang=0, and cpuRunaway=0.

Renderer idle/background CPU ratio in the retained memory trace had p50 ~**1.46%**, p95 ~**15.1%**, max ~**18.6%** during sampled windows.

### Interpretation

The architectural scheduling contract still enforces **Editor First / Async Everything Else** and real scheduler slices are small. The isolated 376 ms main-thread spike shows that not every long task is attributable to scheduler slice size; it remains CPU-profile follow-up evidence.

## 12. Document Intelligence

A measurement-only `MarkdownLinkIndex` scaling probe was executed for 1K, 5K, and 10K documents with one warmup and 10 measured samples per scale. Each fixture contains relative links sufficient to exercise parsing/indexing and backlink traversal.

| Scale | Initial index p50 / p95 | 1% incremental p50 / p95 | Backlink refresh p50 / p95 | Heap retained after clear+GC p50 |
| --- | ---: | ---: | ---: | ---: |
| 1K | 27.71 / 31.53 ms | 0.25 / 0.62 ms | 10.43 / 13.65 ms | ~0.27 MB |
| 5K | 105.33 / 152.66 ms | 0.97 / 2.10 ms | 47.96 / 81.21 ms | ~1.37 MB |
| 10K | 204.18 / 208.07 ms | 1.87 / 3.35 ms | 87.79 / 95.08 ms | ~2.72 MB |

At 10K the live index accounts for about 60 MB heap growth in this synthetic worst-link-density probe, but after `clear()+GC` the retained heap median is ~2.72 MB rather than remaining proportional to the live index.

### Interpretation

The pure computation scales approximately linearly over the measured range. A hypothetical monolithic 10K initial-index batch would be a ~200 ms main-process CPU event, and a worst-density 10K backlink traversal is ~88–95 ms. However, Inkiva's renderer coordinator routes document sync work through the ARCH-07 background scheduler and the actual link index lives behind the main-process API boundary. The probe therefore does **not** demonstrate renderer main-thread blocking.

No renderer long-task, user-visible input regression, or scheduler starvation attributable to Document Intelligence has been established by current evidence.

> **No Worker Isolation Required From Current Evidence.**

Worker / UtilityProcess isolation should be reconsidered only if an integrated workload later proves renderer blocking, CPU contention, or editor latency regression that the current scheduler/process boundary cannot contain.

Raw data: `perf-results/baseline-01/document-intelligence/raw.json` and `summary.json`.

## 13. Memory / Lifecycle

### Observed fact

The retained lifecycle run exercised repeated virtualized open/edit/close cycles and normal memory-leak cycles:

- 500K virtualized heap samples ~40.1–41.4 MB; 10-cycle growth ratio ~0.24%; no linear-growth flag;
- 1M virtualized heap samples ~64.3–66.4 MB; 10-cycle growth ratio ~0.10%; no linear-growth flag;
- generic lifecycle heap linear-growth flags = 0;
- crash / rendererCrash / OOM / rendererHang / cpuRunaway = 0;
- mixed 8-tab ended ~12.7 MiB above the already-loaded baseline after 100 switches, but that single delta is not treated as a leak because repeated lifecycle probes do not show sustained linear growth.

### Interpretation

Current evidence supports **bounded retention, not a progressive leak**. Large-document live heap rises with document size, but repeated close/dispose cycles do not show monotonic retained growth.

## 14. CPU / Hot-Path Classification

Automated traces provide scheduler, main-thread block, frame-duration, parsing, input, and background CPU evidence. The repository does not automatically emit a standalone V8/DevTools `.cpuprofile`; the documented `node-profiler` path remains manual diagnostic tooling.

| Path | Evidence | Classification |
| --- | --- | --- |
| Virtual surface | 500K ~0.4%, 1M ~0.15% mounted/materialized | Viewport/segment bounded; sublinear vs full document during steady scroll |
| Document open / parse | latency rises with 50K→500K→1M | Expected O(N) |
| Save serialization | same-revision duplication not reproduced | O(N) per new serialized revision |
| DI initial index | 1K→5K→10K ~28→105→204 ms p50 | Approximately O(N) |
| Backlink refresh | ~10→48→88 ms p50 | Approximately O(N) in synthetic high-link density |
| Background scheduler slice | ~0.3 ms observed | O(1)-bounded scheduling slice; underlying work is incremental |
| Mixed 1M cold-tab reactivation | ~1.7–1.8 s tail | Suspicious high O(N) reactivation cost; PERF follow-up |
| 500K default-backend stall | two isolated extreme stalls | Anomalous; complexity not classifiable without dedicated profile |

No current evidence proves an O(N²) hot path.

## 15. Manual Soak

### Task-run status

**Not executed by user request.**

Tier 3 remains Manual / Reference Runner only:

- 30 minute standard soak;
- 60 minute extended soak;
- 500 / 1000 tab switches;
- long-session memory/listener/observer trends;
- 10K workspace endurance when explicitly run as reference evidence.

These scenarios must not enter normal PR Required CI.

## 16. Existing Fast Gate Comparison

Current retained BASELINE-01 Fast Gate evaluation: **FAIL (4 hard gates)** — Editable p95, Scroll min FPS, Folder Search p95, and Save p95. All other declared fast hard metrics passed in the retained run.

Historical ARCH-08 closure noted that the original hard gate passed without threshold/workload/sample/assertion changes. The difference is recorded as current baseline evidence; historical values are not substituted for the current measurement and the current threshold is not weakened.

## 17. Findings

### Environment findings

1. Git transport/proxy failure is environment evidence; remote SHA verification and existing local commit object enabled an exact safe fast-forward.
2. A `node_modules` directory existing is insufficient donor proof. The main-checkout dependency graph was incomplete and therefore rejected.
3. Worktree-local offline install completed successfully with the existing pnpm store.
4. Current-worktree build is green after environment recovery.

### Product findings

1. **Product Performance / pending attribution:** 50K Editable p95 = 619.23 ms vs <250 ms.
2. **Product Performance / pending attribution:** 50K default-backend Scroll min = 28 FPS vs >=55 FPS; OpenGL comparison min = 31 FPS. OpenGL improves average 44.50→54.35 FPS and median 42.5→61.0 FPS, but does not remove low-tail frame drops.
3. **Product Performance / pending attribution:** Folder Search first-batch p95 = 363.83 ms vs <300 ms.
4. **Product Performance / pending attribution:** Save p95 = 210.25 ms vs <100 ms.
5. No Fast Gate crash/hang/OOM/CPU-runaway signal and no heap linear-growth signal was observed.
6. **Product Performance / follow-up evidence:** default-backend 500K produced two discrete Input stalls of ~770.4 s and ~926.7 s, paired with ~110.8 s / ~118.8 s search stalls. OpenGL eliminated these stalls in the comparison run. Root cause is not yet assigned.
7. **Positive architecture evidence:** 500K and 1M virtualization remained bounded (~0.4% and ~0.15% mounted/materialized respectively), with zero detached DOM blocks and zero selection/range exceptions.
8. **1M usability evidence:** the P1 large-document workload completed on both backends; p95 first-screen/editable were 478/527 ms default and 411/444 ms OpenGL, while input remained 64–73 ms p95.
9. **Embedded geometry correctness:** synthetic async ResizeObserver growth and real Mermaid/local-image regression coverage pass; no current automated evidence of TOC drift, blank viewport, stale virtual height, or diagram-induced scroll rollback.
10. **Document Intelligence scaling:** 10K pure initial indexing is ~204 ms p50 and backlink refresh ~88 ms p50 in the synthetic high-link-density probe, but no renderer-blocking evidence exists and ARCH-07 scheduler/DI/runtime contracts pass 35/35.
11. **Mixed 8-tab performance:** 100/100 mixed-size switches complete with zero renderer errors, but overall p95 is 1685.72 ms and 1M p95 is 1793.99 ms; this is Product Performance follow-up evidence.
12. **Source Mode correctness:** focused Electron coverage passes 23/23 for round-trip, caret/scroll restoration, Chinese input, undo/redo, and saved-state behavior.
13. **Save/Snapshot correctness:** 7/7 focused tests pass; no duplicate same-revision serialization reproduced across autosave/switch/save/export/close.
14. **Memory lifecycle:** repeated 500K/1M virtualized cycles show no linear heap-growth flag; evidence supports bounded retention rather than a progressive leak.
15. **Background scheduling:** real document-sync/backlink/history slices are ~0.3 ms, while an isolated 376 ms main-thread spike remains profile-worthy.
16. **Architecture conclusion:** ARCH-01～08 boundaries remain functionally intact; observed deficits are concentrated Product Performance issues, not evidence that the governance direction failed.

## 18. Follow-up Tasks

Recommended independent follow-ups:

1. **PERF-FOLLOWUP-01 — Default Graphics / Scroll Low-Tail:** isolate default-backend low-FPS behavior versus OpenGL and ANGLE/GPU scheduling.
2. **PERF-FOLLOWUP-02 — 1M Cold Tab Reactivation:** profile the ~1.7–1.8 s reactivation path and separate parse, snapshot restore, render materialization, and embedded-content work.
3. **PERF-FOLLOWUP-03 — 500K Extreme Stall:** reproduce the two default-backend input/search stalls with dedicated tracing.
4. **PERF-FOLLOWUP-04 — Save / Search Tail:** profile 50K save p95 >200 ms and folder-search p95 >300 ms without changing thresholds or snapshot architecture.
5. **PERF-FOLLOWUP-05 — Main-Thread Spike Attribution:** capture a dedicated V8/DevTools CPU profile around the observed ~376 ms integrated-background spike.

Any later finding must be classified as one of:

- Product Correctness
- Product Performance
- Product Stability
- Test Infrastructure
- Environment
- Measurement Noise

Large product/design changes are out of scope for BASELINE-01 and must become independent `CORRECTNESS-xx`, `PERF-xx`, or `STABILITY-xx` tasks.

## 19. Final Conclusion

BASELINE-01 automated scope is complete. The post-ARCH-01～08 architecture is **functionally stable under the covered automated workloads**: virtualization remains bounded at 500K/1M, geometry/TOC correctness holds under asynchronous Mermaid/image growth, Source Mode and Revision Snapshot contracts pass, scheduler/runtime contracts remain intact, no progressive memory-growth signal is reproduced, and no crash/OOM/renderer-hang signal appears in the retained baseline.

The baseline is **not performance-clean**. The current 50K Fast Gate fails four existing hard metrics (Editable, Scroll minimum FPS, Folder Search, Save), the default graphics backend exhibits severe low-tail/anomalous stalls in some runs, and mixed 1M tab reactivation has ~1.8 s p95 latency. These are concrete Product Performance follow-ups and must not be masked by changing thresholds, workload, sample count, or statistics.

Current evidence does not justify reopening the architecture-governance program. The next work should be narrowly targeted performance investigations using the architecture now in place.

### Merge closure

BASELINE-01 was delivered by PR #174 and squash-merged into `develop` as `a6cd9160488103ee7ed875786fc71a4e5968b24b` after all required CI checks passed. This closes the baseline task itself; the PERF follow-ups above remain separate future work.

### Required final summary table

| Metric | 50K | 500K | 1M | Status |
| --- | --- | --- | --- | --- |
| First Screen p95 | 132.38 ms | 175.16 default / 214.84 OpenGL ms | 478.49 default / 411.30 OpenGL ms | 50K gate passes first screen |
| Editable p95 | **619.23 ms** | 221.50 default / 239.77 OpenGL ms | 527.18 default / 444.15 OpenGL ms | **50K Hard Gate fails** |
| Input p95 | 0.70 ms | **778,216 default / 48 OpenGL ms** | 64.4 default / 72.8 OpenGL ms | 500K default has discrete stalls |
| Input p99 | 1.30 ms | **897,019 default / 48 OpenGL ms** | 70.48 default / 84.96 OpenGL ms | 500K default has discrete stalls |
| Scroll min FPS | **28 default / 31 OpenGL** | **36.45 default / 59.99 OpenGL** | **56.07 default / 52.99 OpenGL** | **50K Hard Gate fails; larger tiers are baseline-only** |
| Save p95 | **210.25 ms** | 185.07 default / 187.65 OpenGL ms | 203.10 default / 200.96 OpenGL ms | **50K Hard Gate fails** |
| Tab switch p95 | 39.39 ms (50K Fast Gate) | ~340–576 ms across mixed 500K tabs | **1793.99 ms** mixed 1M tab | 50K healthy; 1M reactivation is PERF follow-up |
| Memory after open / lifecycle | Fast Gate no linear growth | ~40–41 MB virtualized heap samples | ~64–66 MB virtualized heap samples | No linear-growth signal |
| DOM / materialization | bounded | ~0.4% mounted/materialized | ~0.15% mounted/materialized | PASS architecture invariant |
| Crash / OOM / hang | 0 | 0 | 0 | PASS |
| Blank viewport | not reproduced | not reproduced | not reproduced | PASS covered correctness |
| Geometry error | 0 reproduced | 0 reproduced | 0 reproduced | PASS covered correctness |

Additional evidence: mixed 8-tab 100 switches completed with zero renderer errors; diagram/image correctness suite 7/7; Source Mode 23/23; Revision Snapshot 7/7; DI scaling measured at 1K/5K/10K; 30/60 minute soak explicitly **not executed** by request and remains Manual / Reference Runner only.
