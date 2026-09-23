# Performance contract

[Back to AGENTS.md](../../AGENTS.md)

Every performance PR must include a real optimized code path. Tests, telemetry, reports, or gate configuration alone are not a performance optimization.

## Required evidence

Report:

- optimized path;
- identical environment/workload/statistics Before vs After;
- raw values;
- reduction and/or speedup;
- final threshold evaluation;
- stability/memory/regression result;
- limits and remaining issues.

Keep microbenchmarks separate from full Electron UX measurements.

Never pass a gate by raising thresholds, lowering workload, reducing sample count, changing statistics, deleting failing metrics, or turning failures into warnings.

## Current fast-gate targets

Repository/configured gate is authoritative if these change.

- 50K first paint p95 < 200 ms
- 50K editable p95 < 250 ms
- input p95 < 8 ms
- input p99 < 16 ms
- input max < 32 ms
- 50K scroll minimum >= 60 FPS unless an explicitly approved temporary task threshold applies
- folder search first result p95 < 300 ms
- 50K save p95 < 100 ms
- diagram placeholder p95 < 50 ms
- synchronous above-fold diagram rendering = 0
- offscreen image request/decode = 0
- linear memory growth = 0
- crash / renderer crash / OOM / CPU runaway / renderer hang = 0

A green CI job is not equivalent to passing the final threshold report.

## Baseline collection rules

For architecture-wide baselines, keep collection and evaluation separate: a Playwright collector can pass while the formal threshold evaluator still fails. Retain raw/statistics/evaluation artifacts, report the evaluator result, and never substitute a historical green run for current measurements.

When a collector has already merged category captures into a retained `*.raw.json`, evaluate that explicit raw file. Do not point the evaluator at its parent directory if directory discovery intentionally excludes merged raw files; otherwise a valid capture can be misreported as missing metrics.

When comparing graphics backends, run identical workloads and sample counts serially and report each backend independently. Do not pool default and `--use-angle=gl` samples. Baseline-only focused scenarios may be opt-in via environment variables and must stay disabled in normal Required CI.

Backend A/B evidence localizes a graphics-path problem; it does not by itself authorize a global backend switch. Keep the product default unchanged until compatibility and performance evidence covers the intended Windows hardware/driver population.

For long Electron measurements, the Runner timeout must exceed the Playwright scenario timeout. If an outer Runner timeout kills an otherwise-running Electron test, classify it as **Test Infrastructure**, not Product Stability.

Performance stages and historical investigations are indexed in [docs/performance](../performance/README.md).
