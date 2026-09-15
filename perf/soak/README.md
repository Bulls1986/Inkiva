# Performance fast gate

The pull-request performance workflow runs one bounded `pr-smoke` lane. It
collects real desktop actions and evaluates hard thresholds for 50k documents,
editing, scrolling, folder search, saving, diagrams, deferred images, memory,
and stability.

The lane requires twenty samples for every declared metric and fails closed
when a metric, sample, or threshold is missing. It has no scheduled run,
manual long-run mode, or warning-only comparison path.

Run the fast policy and evaluator tests locally with:

```sh
pnpm test:perf:fast
```

The workflow stores the raw trace capture and the evaluated report as build
artifacts. The canonical fast thresholds are in `thresholds-fast.json`.
