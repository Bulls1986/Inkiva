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

Historical performance work: [PR-C ledger](../perf-pr-c-change-ledger.md).
