# Agent workflow

[Back to AGENTS.md](../../AGENTS.md)

## Standard lifecycle

> inspect → plan → define tests → implement → validate → review diff → commit → push → create/update PR → follow CI → record stage result

- Base is normally `develop`.
- One logical objective per task branch/worktree and PR.
- Keep implementation, regression tests, and required guards in one coherent change chain.
- Do not mix unrelated cleanup into the task.
- Do not auto-merge unless explicitly requested.

## Stage records

For architecture, performance, stability, migration, or high-risk editor work, maintain a resumable record under `docs/`.

Record completed work, unfinished work, blockers/root cause, validation evidence, current branch/PR when relevant, and next action.

Never invent historical measurements. If a prior change was not independently measured, say so.

Examples:

- [Architecture audit](../architecture/ARCHITECTURE_AUDIT_2026-09.md)
- [ARCH-01 progress](../architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md)
- [ARCH-05 event-bus contract](../architecture/ARCH-05-EVENT-BUS-CONTRACT.md)
- [PR-C change ledger](../perf-pr-c-change-ledger.md)

## Truthfulness

- PR created != merged.
- `mergeable=true` != required tests passed.
- one green CI job != all gates passed.
- test/monitoring infrastructure != product/performance improvement.
- local microbenchmark gain != full Electron UX gain.
