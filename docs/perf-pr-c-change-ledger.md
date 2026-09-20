# PR-C / PERF-NEXT-03 Change Ledger

> Baseline: `234ebd6481a96ea1ea4e3ea4ecc40ebfe4a0b4d7` (`234ebd6`, `perf(editor): stabilize virtual scroll hot path`)
>
> Branch: `perf/pr-c-segment-virtualization`
>
> Scope freeze: Segment Virtualization correctness + performance gate only. Do not add unrelated fixes while closing PR-C.

## 1. Current state

Tracked diff against the baseline currently contains 39 modified files, approximately `+2550/-381`.
The largest implementation/test changes are concentrated in:

- `packages/muya/src/block/scrollPage/index.ts` — Segment Virtualization core and viewport/selection/resize coordination.
- `packages/muya/src/block/scrollPage/__tests__/virtualizationProduction.spec.ts` — virtualization production contracts.

Current rebuilt Electron correctness result:

- Core combined suite: **30/31 PASS**.
- Editing operations: **4/4 PASS**.
- Outline/scroll synchronization: **3/3 PASS**.
- Current blocker: width reflow / sidebar resize viewport-anchor preservation.
  - Repeated 3 times independently: **3/3 reproduce exactly 3-block drift**.
  - Required contract remains **<= 2 blocks**.
  - Do not weaken the assertion.
  - This is the same class of issue previously addressed by commit `0264e1f fix(editor): stabilize virtualized editing and navigation`: the authoritative resize anchor must represent the pre-reflow viewport.
  - Current Segment/hot-path changes split approximate vs exact anchors and can capture exact DOM geometry too late, after width reflow.

Important validation rule discovered during this work:

- Electron E2E launches the prebuilt `packages/desktop/out` bundle.
- Playwright config does **not** rebuild it automatically.
- Any Muya/renderer source change must therefore be followed by a desktop build before Electron E2E evidence is considered current.
- Several earlier Enter failures were stale-bundle evidence and were invalidated after rebuilding. With the rebuilt bundle the distant Enter -> caret -> immediate typing scenario passes.

## 2. Scope categories

### A. Segment Virtualization core — KEEP

These files implement the primary PR-C architecture and must remain in the same complete change chain.

| File | Role | Status |
| --- | --- | --- |
| `packages/muya/src/block/scrollPage/index.ts` | Segment windowing, block/segment geometry, viewport hydration, selection pinning, navigation, resize/anchor coordination, structural mutation handling | KEEP; current blocker lives here |
| `packages/muya/src/block/scrollPage/__tests__/virtualizationProduction.spec.ts` | Core virtualization contracts and regression coverage | KEEP |
| `packages/muya/src/block/base/parent.ts` | Parent/child structural hooks required by virtualized top-level mutations | KEEP |
| `packages/muya/src/block/base/treeNode.ts` | Tree mutation support used by virtualized structure updates | KEEP |
| `packages/muya/src/assets/styles/blockSyntax.css` | Virtual segment/render surface styling | KEEP |
| `packages/muya/src/inlineRenderer/index.ts` | Inline hot-path adjustment associated with large-document rendering | KEEP, verify final diff |
| `packages/muya/src/inlineRenderer/__tests__/plainTextFastPath.spec.ts` | Inline fast-path regression coverage | KEEP if implementation diff remains |

### B. Editor integration and compatibility — KEEP if directly required by Segment behavior

| File | Role | Status |
| --- | --- | --- |
| `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue` | Desktop integration, navigation/restore/layout hooks, virtual surface lifecycle | KEEP; review final diff for unrelated residue |
| `packages/desktop/src/renderer/src/components/editorWithTabs/editorHotPath.ts` | Editor hot-path support | KEEP if directly exercised by PR-C |
| `packages/desktop/src/renderer/src/util/editorLayout.ts` | Layout reconciliation needed by virtual scroll/restore behavior | KEEP |
| `packages/desktop/src/renderer/src/util/tocNavigation.ts` | TOC navigation compatibility with virtual blocks | KEEP |
| `packages/desktop/test/e2e/virtualization-core.spec.ts` | Main Electron correctness contract | KEEP |
| `packages/desktop/test/e2e/virtualization-outline-scroll.spec.ts` | Segment-aware outline/viewport contract | KEEP |
| `packages/desktop/test/unit/specs/editor-hot-path.spec.ts` | Integration regression | KEEP if implementation remains |
| `packages/desktop/test/unit/specs/editor-layout.spec.ts` | Layout/restore regression | KEEP |

### C. Diagram compatibility — KEEP only because virtual scrolling must not trigger heavy/render rollback behavior

| File | Role | Status |
| --- | --- | --- |
| `packages/muya/src/block/extra/diagram/diagramPreview.ts` | Event/paint-driven diagram stabilization during virtual scrolling; preserves existing 200ms render debounce | KEEP |
| `packages/muya/src/block/extra/diagram/__tests__/diagramPreview.spec.ts` | Diagram scheduling/recovery regressions | KEEP |

Focused validation already observed: **25/25 PASS**.

### D. Workspace search / ripgrep work — REVIEW SCOPE

This is performance-related and was touched while removing newly-added speculative timing behavior, but it is not the Segment core. Keep only changes that are required by the same PR-C performance gate or were already part of this branch before scope freeze.

| File | Role | Status |
| --- | --- | --- |
| `packages/desktop/src/renderer/src/components/sideBar/search.vue` | Workspace search result lifecycle / disposal | REVIEW |
| `packages/desktop/src/renderer/src/components/sideBar/searchTiming.ts` | Existing 50ms debounce exposure plus idle-deferred disposal; no newly-added 500ms correctness deadline | REVIEW |
| `packages/desktop/src/main/ipc/ripgrep.ts` | Search IPC path | REVIEW |
| `packages/desktop/test/unit/specs/workspace-search.spec.ts` | Search regression/performance contracts | REVIEW |
| `packages/desktop/test/unit/specs/ripgrep-ipc-protocol.spec.ts` | IPC regression | REVIEW |

Focused validation previously observed: **8/8 PASS** for the focused workspace-search suite.

Do not change existing/config-linked search timing merely because it contains a millisecond value.

### E. Performance instrumentation / gate transport — REVIEW, likely KEEP as measurement integrity work

| File | Role | Status |
| --- | --- | --- |
| `packages/desktop/src/main/ipc/performance.ts` | Performance IPC batching/transport | REVIEW |
| `packages/desktop/src/main/performance/index.ts` | Main-process performance capture | REVIEW |
| `packages/desktop/src/renderer/src/services/performance/gateBridge.ts` | Gate bridge | REVIEW |
| `packages/desktop/src/renderer/src/services/performance/runtime.ts` | Renderer performance event transport | REVIEW |
| `packages/desktop/src/renderer/src/services/performance/runtimeMonitor.ts` | Runtime monitor sampling | REVIEW |
| `packages/desktop/src/shared/types/ipc.ts` | Performance IPC protocol types | REVIEW |
| `packages/desktop/src/shared/types/performance.ts` | Performance event types | REVIEW |
| `packages/desktop/src/renderer/src/services/performance/batchedSink.ts` | **UNTRACKED, INTENDED** generic bounded batched sink so instrumentation does not perturb measured frame hot path | REVIEW |
| `packages/desktop/test/unit/specs/performance-batch-sink.spec.ts` | **UNTRACKED, INTENDED** batch transport tests | REVIEW |
| `packages/desktop/test/unit/specs/performance-gate-bridge.spec.ts` | Gate bridge tests | REVIEW |
| `packages/desktop/test/unit/specs/runtime-performance-monitor.spec.ts` | Runtime monitor tests | REVIEW |
| `packages/desktop/test/unit/specs/performance-coordinator.spec.ts` | Performance coordinator tests | REVIEW |

Known correction already made: renderer frame transport must honor the existing configured sample interval. A custom idle scheduler that bypassed the configured interval was removed.

Focused batch-sink validation previously observed: **3/3 PASS**.

### F. Startup/background-work measurement — REVIEW SCOPE

| File | Role | Status |
| --- | --- | --- |
| `packages/desktop/src/renderer/src/main.ts` | Startup background work changes | REVIEW |
| `packages/desktop/src/renderer/src/components/editorWithTabs/editorPerformanceMilestones.ts` | Startup/editor performance milestones | REVIEW |
| `packages/desktop/test/unit/specs/editor-performance-milestones.spec.ts` | Milestone contract | REVIEW |
| `packages/desktop/test/unit/specs/editor-startup-background-work.spec.ts` | **UNTRACKED, INTENDED** ensures editor renderer does not preload Preferences modules | REVIEW |

This group should remain only if it is required by the PR-C measured performance path. Otherwise move it to a follow-up PR rather than silently retaining it.

### G. Fast Gate / thresholds / runner — KEEP only as gate infrastructure required to validate PR-C

| File | Role | Status |
| --- | --- | --- |
| `packages/desktop/test/e2e/performance-fast-gate.spec.ts` | Fast Gate workload/collection | KEEP if required by current PR-C metrics |
| `perf/soak/fast-runner.spec.ts` | Fast performance runner | KEEP if required |
| `perf/soak/thresholds-fast.json` | Fast Gate thresholds | KEEP, audit threshold diff before commit |
| `perf/gate/thresholds.json` | General performance thresholds | REVIEW; no unrelated threshold weakening |
| `packages/desktop/test/unit/specs/editor-performance-milestones.spec.ts` | Supporting gate contract | see startup group |

Temporary machine policy currently used by Fast Gate:

- `document.50k.scrollFps >= 55` is a machine-specific temporary fast-gate floor previously approved during this PR-C investigation.
- The product/normal target remains **60 FPS**.
- This relaxation must be called out explicitly in PR evidence; it must not be presented as the final product target.

No other threshold may be weakened to make PR-C pass.

### H. Temporary / diagnostic — DELETE BEFORE COMMIT

| Path | Status | Reason |
| --- | --- | --- |
| `packages/desktop/test/e2e/segment-scroll-poc.spec.ts` | TEMP/DELETE | Current resize-anchor diagnostic only; uses logging and explicit wall-clock waits |
| `perf-results/` | NEVER COMMIT | Raw/local generated performance output |

## 3. Timing audit outcome

Only **new/uncommitted** time restrictions were in scope for the timing audit. Existing configuration-linked or baseline timing remains untouched unless the dirty branch broke its semantics.

Removed/reworked newly-added timing behavior:

- resize correction 320ms expiry -> state/transaction-driven correction.
- search result disposal 500ms -> paint boundary + idle disposal.
- virtual viewport anchor 80ms -> hydration lifecycle exact capture.
- virtual block measurement 80ms -> defer/resume lifecycle.
- scroll restore 250/1000/3000ms -> event/layout-driven restore with no polling timeout.
- diagram new 300ms scroll-stable / interaction-quiet windows -> interaction revision + stable paint boundaries.
- virtual scroll hydration 80ms -> `scrollend` on current Chromium, double-rAF fallback otherwise.
- dirty snapshot persistence override 5000ms -> removed; baseline scheduler behavior restored.

Explicitly preserved baseline/config-linked timing:

- folder-search 50ms debounce.
- search-cancel 500ms UX anti-flicker behavior.
- snapshot scheduler 80/500/200ms semantics.
- TOC refresh debounce 75ms.
- diagram render debounce 200ms.
- configured performance sample interval.

Final production numeric-timer scan after the audit left only the search idle fallback `setTimeout(run, 0)`, used when `requestIdleCallback` is unavailable; it is asynchronous fallback scheduling, not a correctness deadline.

## 4. Current correctness evidence

Evidence that remains valid:

- Muya TypeScript: PASS.
- Desktop vue-tsc: PASS.
- Virtualization production unit suite: previously **23/23 PASS** after hydration refactor; rerun after final anchor fix.
- Diagram Preview: **25/25 PASS**.
- Performance batched sink: **3/3 PASS**.
- Workspace Search focused suite: **8/8 PASS**.
- Distant Enter -> immediate typing on rebuilt Electron bundle: PASS.
- Full virtualization editing operations on rebuilt Electron bundle: **4/4 PASS**.
- Outline/scroll synchronization on rebuilt Electron bundle: **3/3 PASS**.
- Combined rebuilt core Electron suite: **31/31 PASS**.
- Muya virtualization production contracts: **28/28 PASS** after the Chromium `scrollend` stable-paint regression was added.
- The earlier width-reflow viewport-anchor blocker is resolved; the <=2-block assertion was not weakened.

## 5. Required validation sequence from now on

After **any** Muya or renderer source modification:

1. Run focused unit/contract tests for the changed path.
2. Run `packages/desktop` build so `out` reflects current source.
3. Run the focused Electron E2E scenario.
4. When the anchor blocker is green, rerun the 31-case core Electron group.
5. Only after **31/31 PASS**, run Fast Gate.
6. Judge Fast Gate by final threshold evaluation/report, not by a green test process alone.
7. Review raw performance output, Before/After evidence, stability and remaining limitations.
8. Remove temporary diagnostics and `perf-results/`.
9. Review the full diff and untracked files again.
10. Only then create clean commits, push, and update the PR.

## 6. Proposed commit chain inside PR-C

Do not commit until the anchor blocker and core regression suite are green.

1. **C1 — Render Surface 2.0 core**
   - ScrollPage segment virtualization.
   - Parent/tree structural support.
   - segment styling / inline hot-path pieces.
   - virtualization production unit contracts.

2. **C2 — Editor correctness and integration**
   - selection/editing/navigation/scroll restore/layout integration.
   - TOC/outline compatibility.
   - Electron correctness tests.

3. **C3 — Async peripheral compatibility**
   - diagram virtual-scroll scheduling.
   - search/ripgrep changes only if final scope review confirms they are required.

4. **C4 — Measurement integrity and Fast Gate**
   - performance batching/transport.
   - gate bridge/runtime monitor.
   - fast-gate workload and threshold files.
   - startup/background work only if final scope review confirms direct PR-C dependency.

5. **C5 — Final evidence / documentation**
   - this ledger updated to final status.
   - PR description updated with actual Before/After data, final threshold evaluation, limitations, and CI links.

## 7. Definition of done

PR-C is not complete merely because Segment Virtualization works locally.

It is complete only when:

- all core editing/selection/navigation/IME/undo/redo/TOC/diagram/search scenarios required by the PR are green;
- rebuilt Electron core suite is fully green;
- Fast Gate final threshold evaluation passes under the declared policy;
- performance Before/After is measured with the same environment/workload/statistics;
- no timer/test/threshold is weakened to hide a failure;
- no temporary diagnostic or raw perf output is committed;
- all final files can be mapped to a documented PR-C responsibility;
- remaining limitations are explicitly recorded.

## 8. Render Trace Recovery Checkpoint — 2026-09-21

This section is deliberately written as a session-recovery handoff. If the active chat/session is lost, resume from this section instead of repeating broad profiling.

### Repository checkpoint

- Branch: `perf/pr-c-segment-virtualization`
- Stable code checkpoint: `058e793` — `perf(editor): stabilize segmented render surface`
- The checkpoint contains the validated Segment Virtualization/renderer/performance changes and regression tests.
- Temporary diagnostic E2E files and raw `perf-results/` are intentionally **not** part of that commit.

### Current correctness evidence

- Rebuilt Electron core suite: **31/31 PASS**.
- Muya virtualization production contracts: **28/28 PASS**.
- Chromium `scrollend` no longer hydrates synchronously. It uses the generation-aware two-paint stable boundary, so continuous programmatic scrolling does not execute `_hydrateVirtualWindowAtCurrentViewport()` / `_applyVirtualWindow()` every frame.

### Current formal Fast Gate result

The latest valid run was protected by the single-instance lock and completed as one Playwright workload (`1 passed`, approximately 3.9 minutes). The Playwright process completing is only sample collection; final threshold evaluation still **FAILS**.

Hard failures from `perf-results/formal-fast-evaluation.json`:

- `document.50k.scrollFps`: **min 19 FPS**, required `>=55 FPS` on this machine. Twenty samples: `20, 29, 23, 48, 45, 31, 19, 28, 22, 30, 19, 31, 26, 22, 46, 29, 23, 45, 23, 45`.
- `diagram.placeholder`: **p95 53.675 ms**, required `<50 ms`.
- `search.folder.firstBatch`: **p95 325.665 ms**, required `<300 ms`.

The first-screen/editable/input/save/stability metrics did not appear in the final violation set in this run. Do not call the Fast Gate passed until the evaluator returns success.

### Hardware / DOM ceiling evidence

Repeated A/B diagnostics established the local Chromium/rAF ceiling at roughly **56–57 FPS**:

- idle rAF: ~56 FPS;
- blank scroller: ~56 FPS;
- 50K document DOM with all business scroll listeners blocked: ~56 FPS;
- 50K document with virtualization handlers retained but active-TOC store writes suppressed: ~56 FPS in the diagnostic workload.

Therefore the persistent 19–48 FPS in the formal Fast Gate is **not explained by the machine refresh ceiling or by the mere existence of the 50K DOM**. The remaining problem is additional work/state in the formal Fast Gate scenario.

### Bottom-up Chromium/Electron trace evidence

Tracing method: Electron `contentTracing`, following the frame backward from presentation/compositor into `CrRendererMain`, Blink lifecycle, invalidation tracking, and finally DOM/JS causes. This replaces broad source-level hotspot guessing.

First captured slow frame:

- `RunTask`: **42.62 ms**
- `ProxyMain::BeginMainFrame`: **42.39 ms**
- `Document::UpdateStyleAndLayout` / Forced Style & Layout: **~33.81 ms**
- `Layout`: **31.84 ms**
- `InlineNode::ShapeTextIncludingFirstLine`: **28.77 ms**
- the frame was a full layout: **1027 layout objects**, 19 dirty objects.

With invalidation tracking enabled, that cold slow frame traced to:

- `SPAN id='mu-4' class='mu-inline-image mu-image-fail'`
- reasons included `Style changed`, `Removed from layout`, and `Added to layout`;
- its success/fail/close icon descendants also entered/left layout in the same frame.

The 50K fixture includes `![A placeholder image](fixture-image.png)`, whose source does not exist. Its first visible load transitions `loading -> fail`, causing that full Blink layout/text-shaping event.

### Important exclusion: failed image is not the persistent scroll root cause

A dedicated virtual-remount diagnostic scrolled top -> bottom -> top three times. The failed image remained the same wrapper `mu-4` and its `data-image-load-start` timestamp never changed. It did **not** retry on Segment remount.

Therefore the failed-image trace explains a real cold long frame but **does not explain the formal Fast Gate's 20 continuously low scroll samples**. Do not optimize failed-image retry merely to chase the FPS gate without new evidence.

### Why the simplified trace is insufficient

A simplified 50K trace later reached **55 FPS**, close to the machine ceiling, while the formal Fast Gate still produced all 20 scroll samples between 19 and 48 FPS. This proves a meaningful state/workload difference exists between the standalone POC and the real gate.

### Raw/local evidence locations (never commit raw outputs)

- Latest Chromium trace: `packages/desktop/test-results/perf-trace/segment-scroll-trace.json`
- Latest formal Fast Gate raw capture: `perf-results/formal-fast-capture/fast.raw.json`
- Latest formal evaluation: `perf-results/formal-fast-evaluation.json`
- Latest formal report: `perf-results/formal-fast-report.json`
- Durable local snapshot directory: `perf-results/diagnostic-snapshots/2026-09-21-render-trace/`.
- Snapshot SHA256 manifest: `perf-results/diagnostic-snapshots/2026-09-21-render-trace/SHA256SUMS.txt`; it currently covers the Chromium trace, formal Fast Gate raw capture, evaluator output, and report.
- Temporary tracing POC: `packages/desktop/test/e2e/segment-render-trace-poc.spec.ts`
- Other temporary attribution POCs: `packages/desktop/test/e2e/segment-scroll-poc.spec.ts`, `segment-scroll-attribution-poc.spec.ts`, `segment-toc-reactivity-poc.spec.ts`, `segment-image-remount-poc.spec.ts`.

These files are diagnostic artifacts only. Do not stage/commit them unless one is intentionally converted into a clean permanent regression test.

### Formal Fast Gate bottom-up trace — recurring failure captured

The formal Fast Gate path itself is now traced. Sample index `1` reproduced at **19 FPS** with runtime monitoring and the normal pre-scroll workload still enabled. Raw trace snapshot:

- `perf-results/diagnostic-snapshots/2026-09-21-render-trace/formal-fast-index-1-19fps-trace.json`
- SHA256: `BF884F16D9A75B2C682F1A60BA684C36805C51DA574677FE1C02ACBA8BCAC1A4`

The 1.202 s scroll window did **not** show sustained Renderer-main saturation. Blink work was small overall: Layout total ~1.78 ms and Paint total ~8.38 ms. Instead, `BeginMainThreadFrame` contained two exceptional gaps while normal intervals outside them were ~17-18 ms:

1. **242.108 ms gap**
   - GPU main task ~247.6 ms.
   - `RendererRasterWorker` ~247.57 ms.
   - `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` ~247.44 ms.
   - CPU-side RasterTask submissions were individually tiny (~0.05-0.18 ms); the stall is waiting in the GPU flush, not JS/Layout/Paint CPU work.

2. **480.168 ms gap**
   - `SkiaOutputSurfaceImplOnGpu::SwapBuffers` ~478.51 ms.
   - `DXGISwapChainImageBacking::Present` ~478.16 ms for dirty rect `288,98 912x702`.
   - Viz records `Swap throttled` with `max_pending_swaps=1`, `pending_swaps=1` while the Present is blocked.
   - `DCompPresenter::Present` returns at the end of the gap and the pipeline immediately resumes normal ~17-18 ms cadence.

The stall is visible consistently across the pipeline: Renderer BeginMainFrame, Compositor send/commit, Viz DrawAndSwap, GPU SwapBuffers/Present all show the same ~480 ms hole. This rules out Vue/Muya main-thread CPU as the direct cause of that gap.

Comparison with the standalone ~54 FPS trace is important:

- standalone POC `DXGISwapChainImageBacking::Present` max was only ~0.57 ms, including comparable large dirty rects;
- standalone GPU raster max was ~13.26 ms;
- formal trace GPU raster max was ~247.57 ms;
- formal trace per-task GPU `used_bytes` peak was ~30.16 MB versus ~18.81 MB in the POC, but the POC submitted **more total raster bytes** during its window (~1.42 GB vs ~0.75 GB). Total GPU work alone therefore does not explain the stall.

Immediately before the first raster stall, Blink paints the editor surface with a clip extending roughly from y=720 to y=9422. Raster activity includes layer IDs `5`, `9`, `10`, and `65`. This is evidence for a large raster batch, but the exact layer-to-DOM/render-surface mapping is **not yet proven**.

### Exact next diagnostic action

Do **not** return to broad source-level guessing. Continue from the GPU evidence:

1. Map raster layer IDs `5/9/10/65` and source frame `163` back to compositor layer bounds / paint sources / editor segment DOM.
2. Determine whether the ~30 MB raster batch is caused by Segment geometry/paint containment or by unrelated Fast Gate UI state.
3. Separately classify the 478 ms DXGI/DComp Present stall: determine whether it is reproducibly triggered by the same render-surface state or is runner/DWM/driver backpressure independent of Inkiva code.
4. Only after the causal layer/source is identified, add a minimal regression test, implement the code fix, rebuild, rerun the formal same-workload Fast Gate, and judge by threshold evaluation.

Do not claim the FPS root cause is resolved merely because the pipeline stall is localized to GPU raster/presentation; the remaining work is to identify the Inkiva-controlled trigger, if one exists.

### Search-disposal GPU stall — causal chain closed and fixed

Layer mapping and source-frame correlation closed the first ~247 ms GPU stall:

- layer `5` = `BODY` (1200x800);
- layer `9` = custom scrollbar (8x702);
- layer `10` = editor `DIV.editor-component` PictureLayer, roughly 904x53.8k with a 904x702 visible viewport;
- layer `65` = `SPAN.tab-filename` (261x50).

For source frame `163`, `raster_chromium_id=37` maps to a **BODY layer 5 tile**. GPU `raster_id=37` is the exact task whose `DoEndRasterCHROMIUM::Flush` blocks for ~247 ms.

The formal Fast Gate order is `folder search -> clear search input -> immediate editor scroll`. In the failing 19 FPS trace, ~223-226 ms after scrolling starts Vue removes the previous search-result DOM (`search-result`, `highlight`, `matches`, `filename`, `match-count`, `file-info`, etc.). That cleanup invalidates BODY and is followed by source-frame 163 BODY raster, then the ~247 ms GPU flush.

This is therefore a real Editor-First violation: browser-idle cleanup from the search sidebar can run while the user is actively scrolling the editor.

Fix implemented without adding a millisecond timeout:

- new `services/editorInteraction.ts` keeps a monotonic editor-scroll revision;
- the editor scroll handler increments the revision at the beginning of every scroll event;
- `createIdleDeferredTask` accepts an optional priority-revision getter;
- search-result disposal requires two consecutive stable paint boundaries, then rechecks the revision at idle time;
- if editor scrolling changes the revision, disposal is requeued instead of mutating sidebar DOM during the scroll;
- callers that do not supply a revision getter retain the previous one-rAF-then-idle behavior.

Test-first evidence:

- new unit contract initially failed because the old implementation entered idle despite a revision change;
- after the fix, `workspace-search.spec.ts`: **9/9 PASS**;
- desktop rebuild: **PASS**.

Formal index=1 trace after the fix confirms the causal effect:

- `searchInvalidations=0` inside the scroll window;
- the previous ~247 ms BODY raster stall disappears; observed GPU raster max in the persisted follow-up trace is ~3.19 ms;
- one run reaches **56 FPS**, equal to the local ~56-57 FPS ceiling.

A second run still reaches only **39 FPS**, but its only exceptional gap is a ~359.6 ms `DXGISwapChainImageBacking::Present`; search invalidation remains zero and raster remains low. Therefore the search-disposal fix removes one independent product-controlled stall, while a separate intermittent DXGI/DComp presentation stall remains.

### Presentation-stall isolation status

Removing the editor's `translateZ(0)` compositor hint is **not** a sufficient fix. One transform-off sample reaches 57 FPS with no stall, but another reaches 25 FPS and still shows ~295 ms GPU raster stalls plus ~151 ms Present stall. Do not remove the transform based on the favorable sample.

The stronger content-isolation diagnostic keeps the normal ~53.8k editor scroll geometry but sets `.mu-container` to `visibility:hidden`. The first two completed repeats reach **56 FPS** and **55 FPS**; the compositor layer tree still contains the huge editor scroll layer, but its content picture layer no longer draws Markdown content. A third repeat did not leave independently recoverable output because the diagnostic runner lost the outer job handle; do not treat two samples as final statistical proof.

Current implication: large scroll geometry alone is not sufficient to reproduce the stall; visible editor content raster is a likely necessary condition. This still requires a visible-content containment A/B before changing production rendering architecture.

### Updated exact next diagnostic action

1. Run the existing `INKIVA_DIAG_CONTENT_VISIBILITY_AUTO` A/B with normal visible editor content and the same formal Fast Gate index=1 path, using sequential repeats only.
2. Verify the selector actually targets the virtualized rendered blocks/segments before interpreting the result.
3. If browser paint containment/content-visibility stabilizes the samples near the local 55-57 FPS ceiling, convert the finding into the narrowest segment-level production strategy and add a regression contract before implementation.
4. If it does not, continue bottom-up from the remaining DXGI/DComp stall; do not change the Fast Gate workload or threshold.
5. After the render-side diagnosis is complete, restore all temporary Fast Gate tracing/A-B code, rerun the 31-case Electron correctness group, then run one clean single-instance formal Fast Gate and evaluate the threshold report.
