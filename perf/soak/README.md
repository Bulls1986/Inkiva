# Performance soak reports

The soak workflow is a blocking release gate for the desktop and Muya
performance suites. `schema.json` is the report contract. The threshold
files are policy contracts validated by `compare.ts`.

The full release lane runs for exactly eight hours. Pull requests use the
explicit `pr-smoke` mode for ten minutes so feedback stays bounded; that mode
has its own duration threshold and is never treated as the full release soak.
Scheduled and manual runs use the full threshold.

Every configured absolute gate is blocking. A missing metric, unit mismatch,
or failed operator check fails the comparison. The current policy blocks on
duration, crash, renderer crash, OOM, linear heap growth, CPU runaway, and
renderer hang. Count metrics are aggregated by maximum so a single incident
cannot disappear inside a median.

Relative comparison is also blocking: a current value strictly greater than
`baseline * 1.10` fails. Missing baselines and incomplete metric coverage fail
closed. Only an explicit manual bootstrap may create a baseline; failed or
incomplete samples never replace the previous baseline. Raw reports remain
attached so every failure can be audited.

Run the policy tests locally with:

```sh
pnpm test:perf:soak
```
