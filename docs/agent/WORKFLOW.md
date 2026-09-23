# Agent workflow

[Back to AGENTS.md](../../AGENTS.md)

## Standard lifecycle

> inspect → plan → define tests → implement → validate → review diff → commit → push → create/update PR → follow CI → record stage result → consolidate lessons

- Base is normally `develop`.
- One logical objective per task branch/worktree and PR.
- Keep implementation, regression tests, and required guards in one coherent change chain.
- Do not mix unrelated cleanup into the task.
- Do not auto-merge unless explicitly requested.
- If WebCodex `show_changes` cannot obtain Git status, do not keep retrying the same inspection path. Fall back once to `git_status` / `git_diff_summary`, or bounded `git status --short` + `git diff --stat` + targeted `git diff -- <paths>`; continue review from that evidence and retry `show_changes` only after repository state changes or the underlying status path is known healthy.

## Stage records

For architecture, performance, stability, migration, or high-risk editor work, maintain a resumable record under `docs/`.

Record completed work, unfinished work, blockers/root cause, validation evidence, current branch/PR when relevant, and next action.

Never invent historical measurements. If a prior change was not independently measured, say so.

Examples:

- [Architecture audit](../architecture/ARCHITECTURE_AUDIT_2026-09.md)
- [ARCH-01 progress](../architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md)
- [ARCH-05 event-bus contract](../architecture/ARCH-05-EVENT-BUS-CONTRACT.md)
- [PR-C change ledger](../perf-pr-c-change-ledger.md)

## End-of-task learning review

Every task must end with a brief learning review, even when the implementation itself was straightforward.

1. Summarize what was learned: root cause, successful approach, failed/invalid approaches, important validation evidence, and any reusable constraint.
2. Review the existing agent guides and relevant architecture/performance/progress records before adding new guidance.
3. If the new lesson overlaps an existing rule, **merge or refine the existing rule** instead of appending a duplicate entry.
4. Remove or rewrite stale/conflicting guidance when new evidence supersedes it; do not keep contradictory old/new paths side by side.
5. Add a new standalone rule/document only when the lesson is materially distinct and likely to recur.
6. Keep root `AGENTS.md` concise. Detailed lessons belong in the relevant linked guide or durable task/architecture record.
7. If the task discovered a new environment issue, also apply the “learn once” rule in [ENVIRONMENT.md](ENVIRONMENT.md): after the verified path is known, make it canonical and stop re-exploring it.

The goal is a curated knowledge base that becomes smaller and clearer over time, not an ever-growing log of one-off observations.

## Truthfulness

- PR created != merged.
- `mergeable=true` != required tests passed.
- one green CI job != all gates passed.
- test/monitoring infrastructure != product/performance improvement.
- local microbenchmark gain != full Electron UX gain.
