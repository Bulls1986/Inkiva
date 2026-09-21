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

### Content-visibility A/B and diagnostic mutual-exclusion update

The recovery step above has now been exercised far enough to reject one tempting render-side shortcut.

First, the diagnostic infrastructure itself had a correctness flaw: each temporary runner used its own lock file, so `.pr-c-fast-trace.cjs`, `.pr-c-paired-layer.cjs`, `.pr-c-full-gpu-raster-off.cjs`, and the formal runner could still overlap. This contaminated GPU/DWM samples even though each script was individually single-instance. The known temporary runners were changed to share `.pr-c-perf-exclusive.lock`. These are diagnostic-only files and remain untracked; the change exists to protect local evidence, not as product code.

The `INKIVA_DIAG_CONTENT_VISIBILITY_AUTO` selector was verified before interpretation:

- target selector: `.mu-container [data-virtual-block-index]`;
- the diagnostic surface snapshot reports the same 50K geometry and virtualization state for baseline and A/B runs;
- observed snapshot: `virtualBlocks=40`, `mountedBlocks=40`, `totalBlocks=909`, one mounted segment, editor scroll height ~53.8k px.

A mutex-protected paired run then produced:

- baseline pair 0: **57 FPS**;
- block `content-visibility:auto` pair 0: **26 FPS**;
- baseline pair 1: **56 FPS**.

The outer diagnostic process terminated before completing all three requested pairs, so this is **not** a full statistical A/B result. However, it is already sufficient to show that simply applying `content-visibility:auto` to the currently mounted virtual blocks is not an immediate stabilization fix; in the observed paired sample it materially regressed scroll FPS while mounted-block count and geometry remained unchanged.

Do not promote block-level `content-visibility:auto` to production from the earlier hidden-content result. The next diagnosis should continue bottom-up from the remaining intermittent GPU raster / DXGI-DComp Present stall. Preserve the shared diagnostic lock so future samples are not invalidated by concurrent Electron/performance jobs.

### GPU-raster path isolation update

Further same-workload A/B narrows the remaining intermittent stall to Chromium's GPU raster path rather than virtual-window state.

Runtime surface snapshots from fresh-app formal index=1 repeats show that a **26 FPS** sample and a **57 FPS** sample can have the same observable editor state:

- `scrollHeight=53807`, viewport `904x702`;
- `totalBlocks=909`, `mountedBlocks=40`, `materializedBlocks=40`;
- one mounted segment, virtual window `0..40`;
- `descendantCount=282`, three top-level children and three placeholders;
- the same `translateZ(0)` compositor transform.

Additional diagnostics:

- keeping the normal scroll container/geometry/compositor layer but hiding `.mu-container` with `visibility:hidden` produced **57 / 57 / 57 / 57 FPS**;
- removing the editor compositor layer is consistently worse in paired evidence: baseline `57 / 57 / 29` versus transform-off `23 / 21 / 24`;
- replacing the transform with `will-change: scroll-position` produced **25 / 22 / 15 / 33 FPS**;
- making editor text transparent did not remove the stall (`41 / 31 FPS` before the diagnostic runner was interrupted);
- block-level `content-visibility:auto` is already rejected above.

Most importantly, the same formal index=1 path with only Chromium `--disable-gpu-rasterization` changed produced **57 / 57 / 56 FPS** in three completed no-trace repeats before the outer runner interrupted the fourth repeat. The runtime surface snapshot remained the same as the normal GPU-raster path. This aligns with the persisted 19 FPS trace where the first exceptional gap sits in `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` for ~247 ms.

Current interpretation:

- the recurring FPS bimodality is not explained by main-thread JS/Layout/Paint saturation;
- it is not explained by different Segment/window/mounted-DOM state;
- visible editor content must participate for the stall to reproduce;
- disabling Chromium GPU rasterization removes the observed low-FPS mode in the completed repeats while preserving GPU compositing;
- this is **diagnostic evidence, not yet a production fix**. CPU raster may carry startup/CPU/memory/diagram costs that have not yet passed the complete formal Fast Gate.

A full GPU-raster-off Fast Gate was attempted, but WebCodex/Runner long-job recovery produced delayed serial invocations that repeatedly reset the report directory. Those attempts are invalid performance evidence and were cleaned up. Do not infer a full-gate pass from the 57/57/56 targeted samples.

There is also an uncommitted `VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS: 2 -> 1` experiment in the worktree. It has no validated Before/After evidence yet and must not be committed or described as an optimization until rebuilt and measured under the same workload.

### Updated next validation

1. Keep the search-disposal fix from `7ecad05`; its BODY-raster causal chain is independently closed.
2. Preserve one shared `.pr-c-perf-exclusive.lock` for every temporary performance runner.
3. Validate CPU-raster + GPU-compositor mode across the Fast Gate metric families without changing sample count, workload, threshold, or statistics. Because long monolithic Runner jobs have been unreliable, persist each metric-family raw output before moving to the next family and merge/evaluate only after all required samples exist.
4. If CPU raster stabilizes scroll but regresses CPU, startup, diagram, memory, or stability, reject it as the product solution and continue with narrower Chromium/Skia/Windows raster policy investigation.
5. If all hard metrics remain within policy, only then consider a Windows-scoped Electron rendering-policy change, followed by packaged Windows integration and correctness regression coverage.

### Overscan 2 -> 1 raster-pressure experiment — 2026-09-21

A narrower product-side experiment is now under validation before considering any global Chromium raster-policy change.

Temporary source change:

- `VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS: 2 -> 1`;
- `VIRTUAL_RENDERER_SEGMENT_BLOCKS` remains `64`;
- no threshold, sample count, workload, or statistics change.

Observed 50K formal-index focused snapshots after rebuilding the desktop bundle:

- overscan=2 baseline typically materialized/mounted **40 blocks**;
- overscan=1 materializes/mounts **26 blocks** with the same `909` total blocks and one mounted segment;
- editor scroll height remains approximately 53.8k px, so this is a smaller visible-content raster window rather than a collapsed logical document.

Focused scroll samples with overscan=1 completed at **57 / 57 FPS**, matching the local ~56-57 FPS ceiling. A third attempted sample was cancelled by the Runner before producing a performance value and is not counted.

Correctness evidence with overscan=1:

- Muya `virtualizationProduction.spec.ts`: **28/28 PASS**;
- Electron width-reflow focused rerun: PASS;
- width-reflow repeat stability: **3/3 PASS**;
- Electron virtualization-core full run reached **12/15 PASS with zero assertion failures** before an external Runner stop;
- the three remaining cases were rerun directly and **3/3 PASS** (scroll-position persistence, content-height-only resize, and Find + top-bottom-top bounded/no-blank behavior).

One earlier full virtualization-core run produced a single width-reflow ratio failure (`1.0235` vs required `>1.35`), but the same unchanged assertion subsequently passed once and then **3/3** in serial repeat. The test threshold was not weakened. Treat this as a timing/stability observation that remains covered by the unchanged test, not as permission to ignore future recurrence.

Interpretation so far:

- reducing overscan materially reduces mounted visible Markdown content (`40 -> 26` blocks), which directly targets the GPU-raster trigger identified by hidden-content A/B;
- focused performance and correctness are promising, but the optimization is **not complete** until the unchanged 20-sample Fast Gate finishes and the final threshold evaluator passes;
- a full 20-sample overscan=1 Gate was started with no diagnostic rendering switches, but WebCodex/Runner issued `stop_requested` immediately after Playwright began and no valid sample set was produced. This is infrastructure cancellation, not a gate pass/failure.

Do not commit the overscan constant change as a completed optimization yet. Next validation must obtain same-workload repeated GPU-raster evidence and a valid full Fast Gate before finalizing the production change.

### Clean overscan=2 formal baseline after diagnostic isolation

The performance runner itself is now isolated enough to establish a trustworthy full baseline:

- duplicate WebCodex workflow sessions that were concurrently dispatching PR-C diagnostics were identified and closed;
- an orphan overscan Vitest process was terminated;
- `performance-fast-gate.spec.ts`, `scrollPage/index.ts`, and the virtualization production test were restored to committed state;
- `VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS` was confirmed at the committed value `2` and remained stable before build;
- the Electron bundle was rebuilt from that clean state;
- the Fast Gate was launched through a supervisor-owned detached process with a unique idempotency key, no tracing, no `INKIVA_DIAG_*` flags, one Playwright worker, and the original 20-sample workload;
- wrapper self-recording completed with child status `0`; Playwright reported `1 passed (4.0m)` and produced a ~19.7 MB raw capture;
- final judgement used the unchanged `perf/soak/thresholds-fast.json` evaluator, not the green Playwright process.

Durable local snapshot:

- directory: `perf-results/diagnostic-snapshots/2026-09-21-clean-overscan2/`
- raw SHA256: `5DE254B3402A3EE401ABD0CD1E7812AC8622DEE5EE82ABEA5403AC0512C456D7`
- evaluation SHA256: `C28A0D894A4C5DB2F279D18556F7FBDBB1907625F4C3BDC2C7569D2D59ABAB30`
- report SHA256: `85F8713A866CD1235EDE6615537A0E8160E570A020A00BEE581CAEA81036156C`

The clean overscan=2 evaluator **FAILS** five hard metrics:

- `document.50k.firstScreen`: p95 **231.245 ms**, target `<200 ms`;
- `document.50k.editable`: p95 **536.965 ms**, target `<250 ms`;
- `document.50k.scrollFps`: min **22 FPS**, target `>=55 FPS` on this runner;
- `diagram.placeholder`: p95 **50.300 ms**, target `<50 ms`;
- `search.folder.firstBatch`: p95 **510.870 ms**, target `<300 ms`.

Passing evidence in the same run includes:

- `save.50k`: p95 about **75.21 ms**, max **77.30 ms**, comfortably below `<100 ms`;
- input latency: p95 about **0.80 ms**, p99 about **1.51 ms**, max **2.10 ms**;
- memory linear growth and crash/renderer-crash/OOM/CPU-runaway/renderer-hang metrics remain zero.

The failure distribution is strongly intermittent rather than uniformly slow. Scroll samples are:

`38, 57, 57, 24, 45, 46, 57, 57, 28, 22, 43, 31, 57, 24, 45, 23, 57, 57, 56, 22`

Eight samples reach `56-57 FPS`, while the low mode falls as far as 22 FPS. First-screen/editable/search show the same outlier character: most search samples are around 155-176 ms but two rise to ~509/543 ms; editable includes 98-231 ms normal samples plus ~384/511/1025 ms spikes. This remains consistent with intermittent raster/presentation stalls rather than sustained renderer-main saturation.

The search-disposal fix from `7ecad05` remains valid despite the full-gate failure: its specific trace chain (`search-result` DOM removal -> BODY invalidation -> raster_id 37 -> ~247 ms GPU flush) was eliminated, and later traces show `searchInvalidations=0` during scroll. The remaining bimodality is a separate problem.

Earlier GPU-raster-off notes must not be interpreted as a proposed fix. A later mutex-protected paired experiment, performed under the same then-current source state, produced baseline `56 / 56 / 56 FPS` versus `--disable-gpu-rasterization` `37 / 34 / 57 FPS`. That controlled comparison rejects CPU raster as a general stabilization solution. It is diagnostic-only and is not comparable as the formal overscan=2 baseline because the source state at that time still contained the temporary overscan=1 experiment.

### Next validation from the clean baseline

The narrowest evidence-backed product experiment remains overscan `2 -> 1`: it reduces mounted/materialized Markdown blocks from roughly `40 -> 26` without changing total logical blocks, segment size, document height, workload, threshold, sample count, or statistics. Focused overscan=1 runs already reached the local ceiling and correctness evidence is promising, but no valid full Gate exists yet.

Next step is therefore one clean full 20-sample Fast Gate with only `VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS=1` changed, using the same detached/self-recording execution path and the unchanged evaluator. The experiment is accepted only if it improves the formal distribution without correctness regressions; otherwise restore overscan=2 and continue deeper render-surface work.

### Clean overscan=1 formal gate

The planned isolated experiment was executed from the clean overscan=2 baseline with only `VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS` changed from `2` to `1`. Segment size stayed at `64`; the Fast Gate workload, twenty-sample count, one-worker execution, offline mode, capture settings, thresholds, and statistics were unchanged. No `INKIVA_DIAG_*` or trace-only flags were present, and no competing WebCodex job or performance lock existed before launch.

Correctness/build evidence before the formal Gate:

- `packages/muya/src/block/scrollPage/__tests__/virtualizationProduction.spec.ts`: `29/29` passed, including the new one-viewport-overscan production contract.
- Electron desktop bundle rebuilt successfully with `electron-vite build` (`38.98 s`).
- Two earlier `run_shell` attempts timed out before Vitest/build emitted any output; rerunning the same work through Runner-native `run_process` completed successfully. Treat those shell timeouts as execution-channel failures, not product regressions.

Formal collection:

- wrapper status: `0`
- Playwright: `1 passed (4.0m)`
- twenty real samples per declared Fast Gate metric
- final judgement: unchanged `perf/soak/thresholds-fast.json` evaluator
- durable snapshot: `perf-results/diagnostic-snapshots/2026-09-21-clean-overscan1/`
- raw SHA256: `84D8CFD11DFD8FACE833E0E44B3C427CBCAD15613102DB5AF38BF53573478705`
- evaluation SHA256: `0EA8007FB6E88D67387700468904ED9B8E46A9244B652F450D187692348FAE1A`
- report SHA256: `533727F09DD6DE1245549C20A98DF9DA93C093FAD2633EDF249001C38B0A658A`

The evaluator still FAILS, but the failure set narrows from five hard metrics to four:

| Metric | clean overscan=2 | clean overscan=1 | Threshold | Result |
| --- | ---: | ---: | ---: | --- |
| `document.50k.firstScreen` p95 | 231.245 ms | 229.255 ms | < 200 ms | FAIL |
| `document.50k.editable` p95 | 536.965 ms | 289.645 ms | < 250 ms | FAIL |
| `document.50k.scrollFps` min | 22 FPS | 25 FPS | >= 55 FPS | FAIL |
| `diagram.placeholder` p95 | 50.300 ms | 55.910 ms | < 50 ms | FAIL |
| `search.folder.firstBatch` p95 | 510.870 ms | 282.430 ms | < 300 ms | PASS |
| `save.50k` p95 | ~75.21 ms | 74.235 ms | < 100 ms | PASS |

The overscan=1 scroll samples are:

`37, 57, 57, 41, 45, 45, 56, 29, 30, 56, 28, 57, 44, 26, 56, 25, 45, 45, 57, 31`

The low-mode stall remains: p95 is still `57 FPS`, but minimum is only `25 FPS`. Overscan reduction therefore does not solve the compositor/raster bimodality by itself.

Other passing evidence in the same run:

- input latency: p95 `1.115 ms`, p99 `1.700 ms`, max `2.300 ms`
- save: p95 `74.235 ms`, max `78.700 ms`
- search: p95 `282.430 ms`, max `296.300 ms`
- memory linear growth count: `0`
- crash / renderer crash / OOM / CPU runaway / renderer hang: all `0`
- first-screen synchronous diagram renders: `0`
- offscreen image request/decode: `0 / 0`

Interpretation: overscan=1 is not sufficient to pass the formal Gate, but it materially improves the editable and folder-search distributions and slightly raises the scroll floor while preserving the local unit contract. It also regresses the diagram-placeholder p95 in this sample. Because the formal distribution improves on two previously failing metrics but the core scroll bimodality remains, do not claim PR-C complete. Before deciding to keep the product change, complete the serial Electron virtualization correctness suite with no competing performance work. If correctness is clean, overscan=1 can remain as a bounded raster-pressure reduction while deeper render-surface work targets the remaining intermittent stalls; if correctness regresses, restore overscan=2.

### Overscan=1 Electron correctness follow-up

The full serial `@virtualization-core` Electron suite was run with one worker and no competing performance/Electron job:

- `43` tests total
- `42` passed
- `1` failed
- total runtime: `4.0m`

The only failure was `VIEW-KEY-007: configured Zoom shortcuts preserve the virtualized surface`: `pressCommand('window.zoomIn')` returned true, but `BrowserWindow.webContents.getZoomFactor()` remained `1` for the unchanged 5-second poll. The same case was then rerun alone with `--repeat-each=3`; all `3/3` repeats reproduced the identical failure.

This is not new evidence against overscan=1. `packages/desktop/test/e2e/VIRTUALIZATION_REGRESSION_COVERAGE.md` already records this exact fail-closed Windows/Typora defect: `window.zoomIn = Ctrl+Shift+Plus` is configured, native input succeeds for the other commands, but Zoom In does not trigger the Window Zoom command in Electron E2E. The overscan experiment does not touch keybinding, Window Zoom, preload webFrame, or command-dispatch code, and the failure occurs before the test reaches any virtualization assertion.

All other `42` virtualization-core cases passed, including selection, IME/composition, Undo/Redo, source-mode round-trip, width reflow, sidebar/max-width anchor preservation, Find, outline navigation, diagrams, editing operations, local images, history, Save, Source/Focus/Sidebar shortcuts, and CJK cases.

Decision: retain overscan=1 as a bounded raster-pressure reduction; do not weaken or suppress the known Zoom guard and do not fold an unrelated keybinding fix into this performance change. This does **not** make PR-C complete: the formal Fast Gate still fails first-screen, editable, scroll-FPS minimum, and diagram-placeholder thresholds, with scroll bimodality the dominant unresolved renderer-surface issue.

### Formal-context compositor attribution and DirectComposition A/B

The clean overscan=1 Fast Gate raw capture was first correlated against its own one-second scroll samples. Across all twenty samples, the scroll measurement window contained **zero Long Tasks**, and `core.main.block` did not correlate with low FPS. Examples include a `25 FPS` sample with only ~`21.6 ms` maximum main-block time and a `29 FPS` sample with only ~`3.9 ms`, while a `57 FPS` sample reached ~`67.6 ms`. This rules out Renderer Main / JS / TOC / Pinia saturation as the dominant cause of the remaining low mode.

A disposable formal-context Chromium trace POC then reproduced the real per-sample ordering:

`activate 50K -> input -> completed save -> folder-search hit -> clear search -> canonical 1 s rAF scroll`

Trace begin/end marks bounded the exact scroll measurement window. The baseline ten-sample result was:

| Sample | FPS | max DXGI Present in scroll window |
| ---: | ---: | ---: |
| 0 | 41 | 292.33 ms |
| 1 | 42 | 278.17 ms |
| 2 | 56 | 0.47 ms |
| 3 | 56 | 0.39 ms |
| 4 | 33 | 458.69 ms |
| 5 | 31 | 488.08 ms |
| 6 | 56 | 0.50 ms |
| 7 | 56 | 0.43 ms |
| 8 | 36 | 401.26 ms |
| 9 | 56 | 0.46 ms |

The low group maps one-for-one to `DXGISwapChainImageBacking::Present` stalls of roughly `278–488 ms`; the `56 FPS` group stays below `1 ms` Present time. Renderer style/layout/paint work in the same low samples remained only a few milliseconds. Large `DoEndRasterCHROMIUM::Flush` spans can also appear in high-FPS samples, so raster duration alone is not the discriminant; the Windows DXGI/DirectComposition presentation stall is.

The ten baseline trace files are preserved locally at:

`perf-results/diagnostic-snapshots/2026-09-21-formal-scroll-trace-baseline/`

A diagnostic-only launch with Chromium `--disable-direct-composition` confirmed the attribution. The switch was verified active at runtime and DXGI/DComp Present events disappeared from the marked scroll window. The first run produced `53, 49, 59, 60, 59 FPS` before an unrelated temporary-file save `EPERM rename` stopped the workload prior to sample 5. An unchanged second run completed all ten samples:

`58, 60, 57, 49, 60, 60, 54, 60, 60, 56 FPS`

This removes the catastrophic `31–42 FPS` DComp low mode but still reaches only `49 FPS` minimum, below the unchanged local requirement of `>=55 FPS`. Therefore **global DirectComposition disable is rejected as a product solution** and will not be promoted to the formal Fast Gate.

Current diagnosis: the remaining bimodality is rooted in the Windows Chromium GPU -> DXGI/DirectComposition presentation path, not editor-main-thread work. The next app-controlled experiment should reduce compositor damage/presentation pressure at the virtual render-surface boundary (segment-level paint/compositing containment) rather than disable a global graphics backend.

### Post-attribution containment and mutation exclusions

The precise baseline traces also show that the pathological Present calls **start after scrolling begins**, rather than being old search-clear work that merely overlaps the measurement window. Representative long Present start offsets from `INKIVA_SCROLL_BEGIN` are:

- sample 0: `+33.021 ms`, duration `292.334 ms`
- sample 1: `+244.368 ms`, duration `278.174 ms`
- sample 4: `+267.039 ms`, duration `458.694 ms`
- sample 5: `+228.364 ms`, duration `488.076 ms`
- sample 8: `+249.933 ms`, duration `401.263 ms`

This excludes a search-disposal tail as the remaining trigger.

Three further runtime-only A/Bs were then executed without changing product code:

1. **Segment paint containment** — forcing `.mu-virtual-segment { display:block; contain:paint }` changed editor geometry from `54627` to `54470 px` scroll height and still produced low samples around `42/41/43 FPS` with `~263–289 ms` DXGI Present stalls. Rejected: no performance fix and document geometry changes.
2. **Root segment-mutation correlation** — a direct `.mu-container` child-list observer marked segment attach/detach events during the exact one-second scroll window. All ten samples reported **zero segment mutations**, including `23/32/34/36/38 FPS` low samples with `~345–476 ms` Present stalls. Therefore continuous-scroll low mode is not caused by virtual-segment hydration/removal.
3. **Editor viewport paint containment** — forcing `.editor-component { contain:paint }` also changed scroll height from `54627` to `54470 px` and yielded `43,56,57,56,56,44,56,41,57,42 FPS`; the `44/41/42 FPS` samples still carried `~260/298/286 ms` Present stalls. Rejected for both geometry change and failure to remove low mode.

The remaining stall therefore exists on an already-composited scrolling surface even when there is no Renderer Long Task and no virtual-root DOM mutation. The next diagnostic target is the Chromium compositor layer/tree itself: verify whether the current `.editor-component { transform: translateZ(0) }` promotes the full ~54k-pixel document PictureLayer/backing and whether a viewport-sized promotion boundary can preserve accelerated scrolling without the giant presentation surface.

### Chromium layer-tree structure and viewport-promotion A/B

A `disabled-by-default-cc.debug` trace captured the active Chromium compositor tree for the virtualized 50K document. The important editor layers are:

| Layer | Role | Bounds | Key reason |
| --- | --- | --- | --- |
| 7 | editor viewport drawing layer | `912 x 702` | `Has a trivial 3d transform.` |
| 8 | accelerated editor overflow scroll layer | `904 x 702` | `Is a scrollable overflow element using accelerated scrolling.` |
| 10 | editor content PictureLayer | `904 x 54627` | `Overlaps other composited content.` |

Layer 10's visible/tile-priority rect stays viewport-sized (for example `904 x 702`) while its logical bounds span the full document. Chromium does **not** allocate one monolithic 54k texture: it uses sparse vertical tiles of roughly `904 x 254` / raster tiles of `960 x 256`, with nearby tiles classified `NOW` and farther tiles `SOON/EVENTUALLY`. Nevertheless the compositor still owns one full-document logical PictureLayer and advances its tile/presentation state as the scroll offset moves.

A runtime-only structural A/B moved the trivial 3D promotion from the scroll element to the fixed-size `.editor-wrapper`:

`.editor-wrapper { transform: translateZ(0) } .editor-component { transform:none }`

The formal-context ten-sample trace produced:

`41, 56, 57, 56, 40, 37, 56, 56, 56, 57 FPS`

The `41/40/37 FPS` samples still contained `~323/363/371 ms` `DXGISwapChainImageBacking::Present` stalls. Renderer style/layout/paint remained only a few milliseconds. Therefore simply moving the promotion boundary one DOM level outward is rejected.

The virtual DOM implementation explains why DOM virtualization alone does not shorten the compositor coordinate space. `_buildVirtualDomSequence()` keeps total document extent in normal flow through before/gap/after placeholder heights while mounted segments remain in that same flow. That design successfully bounds DOM/materialized blocks, but the scroll content layer still spans the full logical document height.

Next architectural POC: separate **scroll extent** from **paint islands**. Preserve one non-interactive height carrier for the authoritative total scroll range, while positioning only currently materialized segment/block islands at their virtual offsets outside normal flow. The POC must first prove unchanged scroll geometry and selection/edit semantics; only then should it be judged by compositor layer bounds and the same formal-context FPS/Present trace.

### Scroll-extent / paint-island POC result

A disposable runtime-only POC converted the existing `.mu-virtual-segment` wrapper from `display: contents` into a real positioned paint island while keeping the authoritative document extent on the root virtual surface. The first attempt exposed an important structural constraint: because the production segment wrapper is `display: contents`, applying absolute positioning without first creating a box collapsed the segment to zero height and corrupted scroll geometry. The corrected POC explicitly creates a block box, preserves the pre-experiment live surface height as the authoritative scroll extent, removes outer spacers from normal flow, and positions each mounted segment from `getVirtualBlockOffset()`.

The corrected geometry is stable:

- baseline editor scroll height: `54448 px`
- separated editor scroll height: `54448 px`
- separated surface height: `54448.375 px`
- after one-second canonical scroll: editor scroll height still `54448 px`
- mounted DOM remains bounded; the diagnostic run observed one to two segment islands rather than the full document.

The compositor structure also changes in the intended direction. The accelerated editor scroll layer remains viewport-sized, and the full-height layer still represents the logical scroll coordinate space at roughly `904 x 54448`, but it now has `draws_content=0`. Actual Markdown painting moves into a local segment PictureLayer (one captured island was roughly `823 x 3506`, `draws_content=1`). This proves that scroll extent and painted content can be separated without changing live scroll geometry.

However, the same formal-context ten-sample trace rejects this as the current performance fix:

`56, 36, 34, 38, 56, 39, 40, 43, 56, 56 FPS`

The low samples still map directly to large `DXGISwapChainImageBacking::Present` stalls:

- sample 1: `36 FPS`, Present `410.19 ms`, raster max only `5.63 ms`
- sample 2: `34 FPS`, Present `413.48 ms`
- sample 3: `38 FPS`, Present `379.16 ms`
- sample 5: `39 FPS`, Present `357.26 ms`, raster max only `2.54 ms`
- sample 6: `40 FPS`, Present `304.11 ms`, raster max only `2.12 ms`
- sample 7: `43 FPS`, Present `273.23 ms`

High samples stay at `56 FPS` with Present around `0.4–0.5 ms`. Some high samples also contain `~260 ms` raster flushes, so raster duration is again not the discriminator.

Conclusion: a full-document painted PictureLayer is **not required** for the catastrophic low mode. Even after the tall logical layer stops drawing content and Markdown is isolated into local composited islands, the Windows DXGI/DirectComposition Present stall remains. Do not promote the paint-island architecture as a performance fix from this evidence alone.

The next diagnostic should reduce content complexity further while preserving the same accelerated scrolling and visible moving composited island: replace Markdown painting with a simple flat painted island. If the Present low mode remains, the trigger is below Inkiva content/layout complexity and is closer to the Windows Chromium/DComp presentation path itself; if the low mode disappears, inspect which Markdown paint primitives or layer properties are necessary to trigger it.

### Flat painted-island A/B

The same paint-island formal-context POC was reused with only the exact one-second scroll window changed: mounted Markdown descendants were made `visibility:hidden` and the segment island itself was given a simple flat gray background. Document activation, input, completed save, folder search, search clear, accelerated scroll geometry, sample duration, trace categories, and one-worker execution were otherwise unchanged.

Two independent ten-sample runs produced:

- run 1: `56, 56, 37, 56, 56, 57, 57, 56, 56, 56 FPS`
- run 2: `56, 56, 56, 56, 56, 56, 56, 39, 57, 44 FPS`

Across twenty samples only three fall below the `55 FPS` local requirement (`37 / 39 / 44`), compared with six low samples in ten with the real Markdown paint-island surface. GPU raster is consistently small in the flat runs, generally only `~1–5 ms`.

The remaining low samples still carry long DirectComposition presentation stalls:

- run 1 sample 2: `37 FPS`, Present `398.33 ms`
- run 2 sample 7: `39 FPS`, Present `336.14 ms`
- run 2 sample 9: `44 FPS`, Present `239.44 ms`

Long Present calls can also occur in a nominally high measured sample (for example `346.56 ms` with `56 FPS` in run 1 sample 3 and `258.60 ms` with `57 FPS` in run 2 sample 8), so the exact overlap/timing within the one-second rAF window can affect the rounded FPS result. Do not treat every long Present as a guaranteed low FPS sample.

Interpretation: Markdown paint complexity materially **amplifies the frequency** of the DComp/Present problem, but is not a necessary condition; a simple flat moving composited island can still hit the same Windows presentation backpressure. This supports a narrower next experiment: reduce the size of each painted segment island while restoring real Markdown content. The current `64`-block segment produces a local painted layer of roughly `3.5k px`, several viewport heights. Temporarily test a smaller segment size under the same formal-context workload before considering any product architecture change.

### Segment-size 16 experiment rejected before performance measurement

A test-first temporary source experiment changed only `VIRTUAL_RENDERER_SEGMENT_BLOCKS` from `64` to `16`, with overscan remaining `1`. The existing production contract was intentionally left unchanged and run before any Electron performance measurement.

Result: `29` tests total, `25` passed, `4` failed.

Only one failure is the expected explicit contract mismatch (`segmentSize 16` vs `64`). The other three demonstrate real structural regressions from smaller segments:

- a collapsed active block pin now spans `3` mounted segments instead of the bounded `2`;
- a local window shift crosses a segment boundary, so the segment root is no longer retained as the same root;
- an exiting range produces `5` root child-list removal records instead of the single batched segment removal.

These failures mean smaller segments trade paint-island size for higher segment-boundary churn and root DOM mutation amplification, directly violating existing Render Surface correctness/performance contracts. The experiment was therefore stopped before desktop build/FPS measurement; no threshold or test assertion was changed.

The source constant was restored to `64`, and the same production suite returned to `29/29 PASS`.

Decision: do not pursue smaller production segments as the next fix. Continue isolating which painted Markdown primitives materially increase DirectComposition/Present stall frequency while preserving the validated 64-block batching model.

### Glyph-paint A/B discarded because the style transition polluted the scroll window

A diagnostic-only experiment attempted to isolate text-glyph painting by keeping the same 64-block paint-island geometry and making all mounted text transparent only for the exact one-second scroll measurement. The intent was to preserve layout while removing glyph paint.

The experiment is **not valid attribution evidence**. Applying the transparent-text style itself caused a large asynchronous reraster that overlapped the measured scroll window. The ten FPS samples were:

`57, 45, 45, 41, 41, 37, 38, 44, 41, 37 FPS`

Low samples were dominated by GPU raster flushes of roughly `240–305 ms`, while DXGI Present was mostly sub-millisecond (a few samples reached about `27 / 90 / 132 / 149 ms`). This differs materially from the clean real-Markdown paint-island baseline, where low mode was dominated by `~273–413 ms` DirectComposition Present stalls.

Decision: discard this A/B for product attribution. It shows only that changing text paint state immediately before measurement forces expensive reraster; it does **not** show whether steady-state glyph complexity is causal.

### Paint islands without forced promotion shift the bottleneck from Present to raster

A cleaner structural A/B then kept the same 64-block paint-island surface, real Markdown, document geometry, activation/input/save/search ordering, trace categories, and canonical one-second rAF scroll, but removed the segment-level forced 3D promotion. No content was hidden and no runtime style transition was added immediately before scrolling.

The ten samples were:

`59, 41, 48, 46, 46, 60, 45, 47, 60, 49 FPS`

Only three samples met the local `>=55 FPS` requirement. The critical change was in the GPU attribution:

- DXGI Present stayed approximately `0.25–0.54 ms` in all ten samples; the previous `~300–500 ms` DirectComposition Present low mode disappeared.
- The low samples instead carried `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` / raster-worker spans of approximately `218–340 ms`.
- Representative low samples: `41 FPS / 339.81 ms raster / 0.37 ms Present`, `48 FPS / 237.54 ms raster / 0.41 ms Present`, `45 FPS / 280.79 ms raster / 0.36 ms Present`.
- The `59/60 FPS` samples kept raster work to only a few milliseconds.
- Scroll geometry remained `54627 px` and Renderer style/layout/paint work stayed small.

This establishes a stronger compositor trade-off:

1. promoted paint islands keep raster cheap in many samples but can hit long Windows DXGI/DirectComposition Present stalls;
2. unpromoted paint islands remove the Present catastrophe but make expensive GPU reraster frequent enough to fail the FPS requirement even more consistently.

Decision: do **not** remove promotion as a product fix. The next useful direction is not another broad CSS toggle; it is to find a stable composition strategy that preserves retained rasterized content without creating multiple moving DirectComposition-backed islands whose presentation can block. Any candidate must keep the validated 64-block batching/DOM-mutation model and be verified against both raster and Present traces.


### Materialized paint-window POC narrows the compositor trade-off

A disposable runtime-only POC kept the validated `64`-block structural segment and authoritative root scroll extent, but moved compositor promotion down from the entire segment to a child wrapper containing only currently materialized blocks.

The geometry/layer precheck passed:

- editor scroll height stayed exactly unchanged (`54470 -> 54470 px` in one run; another run used the stable `54627 px` geometry);
- the structural 64-block segment remained roughly `3.5k px` tall;
- the promoted child paint window was only roughly `1.5-1.6k px` tall with `23-24` materialized blocks;
- compositor tracing showed the full-height ~54.6k logical editor layer at `draws_content=0`;
- the actual Markdown content layer became `.mu-virtual-materialized-paint-window`, about `823 x 1497 px`, `draws_content=1`.

This proves structural segment batching and compositor paint-window size can be decoupled without collapsing the logical document height.

To avoid the invalid glyph-style transition pattern, the steady-state formal-context run establishes the materialized wrapper immediately after document activation, then performs the normal input -> completed save -> folder search sequence before tracing/search-clear/scroll. Therefore initial wrapper creation/raster is not intentionally inserted into the measured one-second scroll window.

The completed ten samples were:

`50, 50, 51, 49, 48, 60, 60, 53, 60, 60 FPS`

Results:

- `DXGISwapChainImageBacking::Present` stayed approximately `0.24-0.66 ms` in all ten samples. The previous `~300-500 ms` DirectComposition Present catastrophe did not reproduce.
- Low samples instead carried GPU raster spans around `188-224 ms`; the `53 FPS` sample carried a ~`328 ms` raster flush.
- Four samples reached `60 FPS`; the minimum improved materially versus the real whole-segment promoted paint-island baseline, but six of ten samples still miss the local `>=55 FPS` requirement.
- Some `60 FPS` samples still contain long `~250-349 ms` raster flush events whose timing does not overlap enough of the rAF count window to lower the rounded FPS, so raster duration alone must still be correlated by source/layer before another product change.
- Renderer style/layout/paint work remains small in most samples; one `53 FPS` sample also contains unusually long rAF/FunctionCall spans and should not be generalized without source attribution.

Interpretation: shrinking the promoted content layer from an entire 64-block segment to the materialized block window successfully removes the DirectComposition Present low mode and improves the floor, while retaining 64-block structural batching. It is still not a product-ready solution because recurrent GPU raster stalls keep the formal-context distribution below the hard FPS requirement.

Next diagnostic: map the long raster tasks from a low materialized-window sample back to their compositor layer/tile/source-frame identity, and compare with a 60 FPS sample. Do not add another broad CSS A/B until the raster source is proven.

### ANGLE backend A/B closes the remaining performance attribution

A final diagnostic changed only Chromium's Windows ANGLE backend for the same Fast Gate workload. No product source, workload, sample count, threshold, or metric definition was changed.

With the normal Windows backend, recent clean runs still fail the product path. Representative threshold evaluations include:

- default/overscan-2 run: first-screen p95 `231.245 ms`, editable p95 `536.965 ms`, scroll minimum `22 FPS`, diagram placeholder p95 `50.30 ms`, folder-search first-batch p95 `510.87 ms`; save p95 still passes at `75.21 ms`;
- default/overscan-1 run: first-screen p95 `229.255 ms`, editable p95 `289.645 ms`, scroll minimum `25 FPS`, diagram placeholder p95 `55.91 ms`; folder search and save pass at `282.43 ms` and `74.235 ms` respectively.

Running the same Fast Gate with `--use-angle=gl` produced a complete P0 pass. All twenty `document.50k.scrollFps` samples were exactly `60 FPS`. The evaluated hard metrics were:

- first-screen p95: `154.19 ms`;
- editable p95: `184.725 ms`;
- input latency p95 / p99 / max: `1.10 / 2.303 / 3.0 ms`;
- scroll minimum: `60 FPS`;
- diagram placeholder p95: `46.095 ms`, first-screen synchronous diagram renders `0`;
- offscreen image requests / decodes: `0 / 0`;
- folder-search first-batch p95: `194.625 ms`;
- 50K save p95: `72.88 ms`;
- eight-tab warm / cold / combined switch p95: `71.615 / 80.145 / 78.725 ms`, p99 `86.705 ms`, freezes `0`;
- heap linear-growth count `0`; crash, renderer-crash, OOM, CPU-runaway, and renderer-hang counts all `0`.

GPU information confirms this is a graphics-path change rather than an editor-workload change:

- default Windows path reports `glImplementationParts=(gl=egl-angle,angle=d3d11)`, an ANGLE D3D11 renderer, and `directComposition=true`;
- `--use-angle=gl` reports `glImplementationParts=(gl=egl-angle,angle=opengl)`, an ANGLE OpenGL renderer, and `directComposition=false`.

This lines up with the earlier trace evidence: the catastrophic low mode was dominated by long `DXGISwapChainImageBacking::Present` / DirectComposition stalls, while the OpenGL backend removes that DirectComposition path and the formal Fast Gate becomes stable at 60 FPS.

The OpenGL backend is **not** acceptable as a PR-C product fix. The full `@virtualization-core` suite under GL completed `40/43 PASS`; the three failures were Source-mode caret restoration, Zoom, and Chinese Find/Outline navigation. A focused three-test rerun reproduced all three failures under GL. The same focused run on the default backend showed:

- Source-mode offscreen caret round-trip: **PASS** on default, **FAIL** on GL — therefore a GL-specific correctness regression;
- Zoom: **FAIL** on both backends;
- Chinese Find/Outline landing: **FAIL** on both backends.

The latter two are current branch correctness blockers but are not caused by the GL experiment. The Source-mode failure is sufficient by itself to reject changing the product ANGLE backend in this PR.

The saved materialized-paint-window trace directory was also regenerated after the earlier console-attribution run. The current files no longer reproduce the previously recorded `188-328 ms` raster maxima inside the exact scroll markers, so those historical raster values must not be used as fresh layer/tile attribution evidence. This does not invalidate the stronger backend A/B: the default D3D11/DirectComposition path remains the distinguishing variable, and switching away from it removes the Fast Gate low mode.

Final PR-C performance conclusion:

1. the validated 64-block Segment Virtualization architecture should remain unchanged; smaller structural segments and broad paint/compositor CSS toggles were rejected by correctness or performance evidence;
2. the remaining machine-specific scroll failure is no longer supported as an O(N) DOM/layout/virtualization hot-path problem; it is strongly isolated to the Windows Chromium ANGLE D3D11 / DirectComposition presentation path on this test machine;
3. forcing ANGLE OpenGL proves the attribution and makes the entire Fast Gate pass, but introduces an editor correctness regression and therefore is diagnostic evidence only;
4. PR-C must **not** be described as having passed the default product performance gate. The product path remains blocked on this machine, and any graphics-backend mitigation belongs in a separately validated follow-up with full editor-correctness coverage;
5. no threshold was relaxed and no failing correctness assertion was weakened to obtain this conclusion.





### Correctness closeout: Outline active state now prefers mounted geometry

After the performance attribution was closed, the remaining default-backend correctness run reproduced two related failures without changing thresholds:

- OUT-003/OUT-005: clicking `Virtual Heading 42` left the active outline on `Virtual Heading 41`;
- CN-FIND-006/CN-OUT-003: clicking `中文标题 37` left the active outline on `中文标题 40`.

The navigation path already mounts the requested block and corrects the document scroll position from live DOM geometry. The mismatch came from the desktop TOC active-state path: once virtualization was enabled, it derived the active heading from document-level virtual prefix offsets. Those offsets intentionally contain estimates for unmeasured preceding blocks, so a correct mounted navigation target could still be classified as a neighbouring heading.

The fix keeps the scroll event hot path unchanged. At the existing two-paint settled commit boundary, virtualized TOC synchronization now prefers the real geometry of currently mounted headings and falls back to the prefix-index binary search only when no mounted heading can classify the activation line. A unit regression deliberately supplies stale virtual offsets while placing the mounted target at the real activation line.

Validation status for this stage: implementation and regression test committed; CI/Electron verification is pending and must remain fail-closed. No segment size, workload, threshold, or performance-gate semantics were changed.


### Correctness closeout: Zoom E2E now sends the physical Plus key

The default-backend VIEW-KEY-007 failure reported a configured Typora Zoom In shortcut but no change in `BrowserWindow.webContents.getZoomFactor()`. Source tracing confirmed the product command path is intact: the registered `window.zoomIn` command calls the main-process zoom action, emits `mt::window-zoom`, and the renderer applies the factor through `webFrame.setZoomFactor()`.

The failure was in the Electron E2E accelerator adapter. Electron accelerator strings must spell the plus key as the token `Plus` because `+` separates accelerator components, while `webContents.sendInputEvent()` expects the actual key value. The test helper was sending the literal string `Plus` as `keyCode`, so it did not reproduce the physical `Ctrl+Shift++` keystroke.

The E2E adapter now translates only accelerator token `Plus` to the physical `+` key before sending input. Product shortcut definitions and command handling are unchanged; the test still requires the real registered shortcut to change BrowserWindow zoom and then preserve bounded virtualization.

Validation status for this stage: test harness correction committed; CI verification pending. No assertion, timeout, shortcut binding, or product behavior was relaxed.


### Validation trigger checkpoint

Correctness closeout implementation HEAD before this checkpoint: `8c6ab2ffc9a4e7ffadd18fedec6cf6a717700c1e`.

The Git-data ref updates used for the two preceding commits updated PR #152 successfully, but GitHub Actions had not created a new pull-request workflow run for that HEAD at the time of this checkpoint. This commit is written through the repository contents path specifically to produce a normal branch commit event and re-establish CI validation on the current correctness changes. Until a workflow run reports against the resulting HEAD, the Outline and Zoom fixes remain **implemented but not validated**.
