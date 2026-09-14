# Inkiva Performance Gate Contract

This directory is the executable v0.3.0 performance contract. A report is valid only when it contains raw samples, the reference environment, and every hard gate for its release level.

Contract rules:

- Every metric is evaluated from raw samples; pre-aggregated medians are not accepted.
- Every metric requires at least 20 samples unless a stricter per-gate minimum is declared.
- P50, P95, P99, Max, Min, and Count use deterministic calculations from the sorted raw series.
- Missing metrics, invalid units, insufficient samples, missing baselines, and incomplete reports fail closed.
- The P2 and P3 degradation contract compares core interaction metrics against a P0 baseline and permits at most 25% relative increase.
- The reference runner is Windows 11 64-bit, 4-core low-voltage x86, 8 GB RAM, SATA SSD or entry NVMe, integrated graphics, 1920x1080 at 60Hz, Balanced power, and offline networking.
- Vue 3 commit time is represented by the equivalent renderer commit metric; the runner must provide it once the renderer harness is wired.

This first phase establishes the hard contract and contract tests. Later phases must add real application runners and reports. Until those runners are enforcing the same contract, v0.3.0 is not Performance Gate PASS and must not be presented as release-qualified.
