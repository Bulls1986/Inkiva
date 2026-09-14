# Performance soak reports

The soak workflow turns the existing desktop and Muya `@perf` lanes into
reporting jobs. `schema.json` is the stable input contract; `thresholds.json`
contains the only comparison policy used by CI.

A metric is a regression warning when its current value is strictly greater
than `baseline * 1.10`. The comparison never exits non-zero for a regression,
and `absoluteGates` is deliberately empty. Missing baselines and metrics are
reported as unavailable rather than treated as failures.

The workflow keeps the latest complete, non-empty report per suite in the
GitHub Actions cache. A new branch can therefore start with no baseline, while
later runs on the same cache scope compare like-for-like runner and suite
reports. Failed or incomplete samples never replace the previous baseline. The
raw reports remain attached separately so a warning can be audited against the
original lane output.

Run the policy tests locally with:

```sh
pnpm test:perf:soak
```
