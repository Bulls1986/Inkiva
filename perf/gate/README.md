# Inkiva Performance Gate Contract

This directory is the executable v0.3.0 performance contract. A report is valid only when it contains raw samples, the reference environment, and every hard gate for its release level.

Contract rules:

- Every metric is evaluated from raw samples; pre-aggregated medians are not accepted.
- Every metric requires at least 20 samples unless a stricter per-gate minimum is declared.
- P50, P95, P99, Max, Min, and Count use deterministic calculations from the sorted raw series.
- Missing metrics, invalid units, insufficient samples, missing baselines, and incomplete reports fail closed.
- The P2 and P3 degradation contract compares core interaction metrics against a P0 baseline and permits at most 25% relative increase.
- The reference runner is Windows 11 64-bit, 4-core low-voltage x86, 8 GB RAM, SATA SSD or entry NVMe, integrated graphics, 1920x1080 at 60Hz, Balanced power, and offline networking.
- Vue 3 commit time is represented by the equivalent renderer commit metric; the renderer must continue to expose it through the runtime trace when that probe is available.

The contract is now wired to opt-in real Electron collectors: P0 uses the regular mixed Markdown scenario, while P1/P2 use the large-document, heading-storm, workspace, multi-tab, diagram/image, and combination collectors. The official workflow requires raw traces, validates the reference environment, evaluates P1/P2, and blocks release on any missing sample or failed gate. A developer-machine result is never release qualification.

Phase 01 fixtures and runner rules:

- Markdown fixtures use exact character counts of 30,000, 50,000, 100,000, 500,000, and 1,000,000 characters.
- The 50K fixture includes headings, lists, tables, code, quotes, links, images, a diagram, and inline formatting.
- Heading Storm covers exactly 500, 2,000, 5,000, and 10,000 headings.
- Workspace fixtures cover exactly 1,000, 10,000, 50,000, and 100,000 nodes.
- Tree and Outline fixture helpers expose a hard viewport multiplier and cap of 300 rendered rows; the application gate asserts bounded virtual DOM rows. Search results are also capped at 300 rendered file rows.
- The sample collector retains raw samples, rejects invalid/unit-changing data, requires 20 samples per metric, and writes reports through the Phase 00 contract.

Phase 02 startup and restore rules:

- `mt::window-initialized` is only the renderer-ready handshake; it is not an editor-interactive signal.
- The first document becomes interactive only after the Muya editor is mounted and the renderer has crossed two animation-frame paint boundaries, then emits `mt::document-editable`.
- Deferred startup work and safe-restore startup readiness are released only after `document-editable`.
- A 10-second missing-milestone timeout is observable and fails the startup gate; it never releases deferred work early.

Phase 03 tab lifecycle rules:

- The renderer resource policy exposes one `active` tab, at most two `warm` tabs, and marks all remaining tabs `cold`.
- Active is the only tab allowed to own the full Muya editor surface.
- Warm tabs may retain lightweight navigation/preview state; cold tabs retain document model state only.
- The lifecycle policy is deterministic, bounded, and exported as `data-tab-lifecycle` for E2E gate assertions.

Phase 04 background isolation rules:

- Filesystem watcher updates are debounced and coalesced by channel and path before renderer IPC.
- Watcher disposal cancels pending batched work and sender failures cannot cascade into the editor.
- Background work uses the P0-P8 priority catalog; P6-P8 tasks pause while interaction is pending and never outrank P0-P2.
- Search/index/backlink/maintenance work must remain cancellable and yield between slices.


Phase 06 runtime observability rules:

- Capture is opt-in and has zero setup/timer/observer overhead when disabled.
- Renderer capture records Event Timing input latency, frame intervals, GC stalls, and heap samples; a GC stall over 50 ms produces a hard failure sample.
- Main-process capture records renderer/tab CPU ratios and Electron process memory in bytes.
- The trace-to-gate adapter accepts only validated `metric_sample` events and preserves raw values; malformed samples fail closed.
- Forced reflow, memory growth, crash, OOM, renderer hang, CPU runaway, and linear-growth gates are explicit zero-tolerance metrics.
