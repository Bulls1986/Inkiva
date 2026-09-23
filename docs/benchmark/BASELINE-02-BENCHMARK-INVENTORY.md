# BASELINE-02 — Benchmark Inventory and Measurement Contract

> Status: CLOSED CONTRACT — reference repeatability evidence remains pending runner availability
> Implementation merge: `develop@41c0992b019fb0ae07419cddbb0c808630e849a7`
> Purpose: make every benchmark result answer “what exactly was measured, by which clock, under which fixture/environment, and what may it be compared with?”

## Trust labels

- **TRUSTED** — measurement boundary, clock, fixture, sample policy, and semantics are explicit enough for its declared comparison scope.
- **CONDITIONALLY TRUSTED** — valid evidence only under stated conditions; commonly the metric name is broader than its actual boundary or the environment/provenance is incomplete.
- **UNTRUSTED** — harness/probe defect can materially change the reported result; do not use until corrected and revalidated.

## Inventory

| Area | Metric / suite | Start → end boundary | Clock / source | Samples | Current trust | Comparison contract |
| --- | --- | --- | --- | ---: | --- | --- |
| Cold startup | `startup.cold.window` | host before Electron launch → window returned | Node `performance.now()` | 20 | CONDITIONALLY TRUSTED | Same host / same launch topology only |
| Cold startup | `startup.cold.shell` | host before Electron launch → `.editor-container` visible | Node `performance.now()` | 20 | CONDITIONALLY TRUSTED | Includes process + renderer bootstrap; not document-open-only |
| Cold startup | `startup.cold.actionable` | host before Electron launch → menu ready | Node `performance.now()` | 20 | CONDITIONALLY TRUSTED | Same host / same shell state only |
| Cold startup | `startup.cold.editable` | host before Electron launch → editor ready | Node `performance.now()` | 20 | CONDITIONALLY TRUSTED | Cold-launch end-to-end metric |
| Regular document | `document.regular.firstScreen` | host before Electron launch → first visible editor | Node `performance.now()` | 20 | CONDITIONALLY TRUSTED | Despite name, includes cold app startup. **Do not compare with 50K open-only metrics.** |
| Regular document | `document.regular.editable` | host before Electron launch → editor ready | Node `performance.now()` | 20 | CONDITIONALLY TRUSTED | Same restriction as above |
| Fast 50K open | `document.50k.firstScreen` | editor `openStartAt` → `firstScreenAt` | Renderer `performance.now()` milestones | 20 | CONDITIONALLY TRUSTED pending revalidation | Harness boundary normalized in BASELINE-02; all samples now use renderer-owned milestones |
| Fast 50K open | `document.50k.editable` | editor `openStartAt` → `editableAt` | Renderer `performance.now()` milestones | 20 | CONDITIONALLY TRUSTED pending revalidation | Same as above |
| Input | `core.input.latency` | browser event start → `processingStart`, fallback event duration where applicable | Chromium Event Timing | >=20 | CONDITIONALLY TRUSTED | Event Timing support/entry semantics must match; product commit confirmation is separate synchronization |
| Save | `save.50k`, `document.*.save` | manual `FILE_SAVE()` trigger → matching saved event + 2 rAF settle | Renderer `performance.now()` | 20 | CONDITIONALLY TRUSTED | Manual save only; BASELINE-02 relabels phase from `autosave` to `save` |
| Scroll | `document.50k.scrollFps`, tree/heading FPS helpers | begin scripted scroll → ~1s rAF window end | rAF timestamps | 20 | CONDITIONALLY TRUSTED | Value is **window-average FPS**, not instantaneous minimum FPS |
| Frame timing | `core.frame.duration` | previous rAF timestamp → current rAF timestamp | rAF timestamps | continuous | TRUSTED for frame interval distribution | Use p50/p95/p99/max and long-frame ratios; do not substitute window-average FPS |
| Long frames | `core.frame.over16_7`, `core.frame.over33` | derived per frame | rAF frame duration | continuous | TRUSTED for captured runtime | Ratios are per-frame indicator series |
| Main-thread lag | `core.main.block` | scheduled timer expected time → observed callback time | renderer monotonic clock | continuous | CONDITIONALLY TRUSTED | Event-loop lag proxy, not a direct task-duration profiler |
| GC | `core.gc.stall`, `core.gc.over50` | PerformanceObserver GC entry | Chromium PerformanceObserver | runtime dependent | CONDITIONALLY TRUSTED | Requires observer support; unsupported collection must fail closed where gated |
| Heap leak | `memory.heapGrowth50`, `memory.heapLinearGrowth*` | post-GC heap samples across controlled open/edit/switch/close cycles | CDP `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage` | windowed | TRUSTED for renderer V8 heap trend | Renderer heap only; not total process RSS/GPU memory |
| Fixture determinism | Markdown / heading storm / workspace | deterministic generator output | repository generator | deterministic | TRUSTED after code review; pending test run | BASELINE-02 adds SHA-256 `contentHash` |
| Diagram/image | placeholder/offscreen probes | DOM/probe state transitions | renderer DOM + instrumentation | 20 | CONDITIONALLY TRUSTED | BASELINE-01 proved wrapper-vs-`img` probe semantics matter; use established wrapper-based contract |
| Stability | crash / rendererCrash / OOM / hang / runaway | observed incident state | Electron process/errors + lag probes | repeated | CONDITIONALLY TRUSTED | Zero-event metrics prove only the observation window and detector contract |
| Fast PR gate | `perf/soak` P0 | mixed real actions over bounded run | mixed renderer/runtime collectors | min 20 | CONDITIONALLY TRUSTED | Fast smoke, not release/reference baseline |
| Reference P0/P1/P2 | `perf/gate` | sharded real scenarios + official evaluator | reference runner | min 20 | CONDITIONALLY TRUSTED | Official only when reference environment validation passes |
| P3 | extreme gate | explicit workflow dispatch | reference runner | min 20 | CONDITIONALLY TRUSTED | Manual/extreme evidence; not routine PR signal |

## Measurement-boundary findings

### MB-01 — 50K fast-open start boundary inconsistency

Before BASELINE-02:
- first sample: editor milestone `openStartAt → firstScreen/editable`;
- later samples: timestamp taken before `mt::open-file` IPC → editor milestone.

This mixed dispatch/activation overhead into later samples. The harness has been changed so the pre-IPC timestamp is only a selector lower bound; reported duration always uses editor milestone deltas.

### MB-02 — “minimum FPS” means minimum sampled window-average FPS

The scripted scroll helper counts rAF callbacks for approximately one second and returns `frames / elapsed`. A gate using statistic `min` therefore means the lowest **one-second average sample**, not the worst frame.

Authoritative jank evidence must instead use:
- `core.frame.duration` p50/p95/p99/max;
- `core.frame.over16_7`;
- `core.frame.over33`;
- explicit >50ms long-frame count if added.

### MB-03 — P0 regular-document open names include cold startup

`document.regular.firstScreen` and `document.regular.editable` are emitted by the cold-start scenario from the host timestamp taken before Electron launch. They are valid end-to-end cold-start measurements, but their names can be mistaken for document-only open metrics.

Decision: retain the current metrics for compatibility, classify them as cold-launch-coupled, and prohibit comparison against `document.50k.*` open-only measurements.

## Clock contract

1. Renderer action duration: use one renderer `performance.now()` timeline from start to end.
2. Renderer milestone duration: subtract timestamps generated from the same renderer monotonic timeline.
3. Host cold-start duration: Node `performance.now()` only; do not subtract renderer timestamps from host timestamps.
4. Epoch timestamps are for trace correlation, not duration subtraction across processes.
5. `Date.now()` is not an authoritative duration clock for benchmark gates.

## Fixture contract

- Fixture generation must be deterministic.
- Fixture identity is logical `id` plus SHA-256 `contentHash`.
- Same nominal size with a different hash is a different workload and must not be pooled.
- Default GPU and OpenGL runs are distinct environments even when fixture hashes match.

## Statistical contract

Authoritative summary for repeated samples:
- `min`, `p50`, `p95`, `p99`, `max`, `count`;
- `mean`, population `stddev`, and `CV = stddev / mean`;
- all-zero series uses CV = 0.

No result becomes authoritative from a single run. Run-to-run repeatability is evaluated separately from within-run sample dispersion.

## Remaining evidence before promoting conditional reference metrics

The contract/harness work, CI execution, controlled slowdown check, provenance wiring, fixture hashes and Fast Gate revalidation are complete.

Still pending because no eligible `reference-low-end` Windows self-hosted runner is currently available:

1. two independent Default GPU reference rounds;
2. Default across-run repeatability / CV analysis;
3. two independent `--use-angle=gl` reference rounds;
4. OpenGL across-run repeatability / CV analysis.

Default and OpenGL evidence must remain separate and must never be pooled.
