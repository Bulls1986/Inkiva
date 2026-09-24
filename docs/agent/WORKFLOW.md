# Agent workflow

[Back to AGENTS.md](../../AGENTS.md)

## Standard lifecycle

> inspect → plan → define tests → implement → validate → review diff → commit → push → create/update PR → follow CI → record stage result → consolidate lessons

- Base is normally `develop`.
- One logical objective per task branch/worktree and PR.
- Keep implementation, regression tests, and required guards in one coherent change chain.
- Do not mix unrelated cleanup into the task.
- Do not auto-merge unless explicitly requested.
- Inkiva currently allows **squash merge only**. When an authorized PR is ready to merge, use `gh pr merge <PR> --squash`; do not first try `--merge` or `--rebase`. A rejected merge strategy is repository-policy evidence, not a PR/CI failure. After a successful squash merge, verify both the PR state and the target branch ref before recording the task as merged.
- If WebCodex `show_changes` cannot obtain Git status, do not keep retrying the same inspection path. Fall back once to `git_status` / `git_diff_summary`, or bounded `git status --short` + `git diff --stat` + targeted `git diff -- <paths>`; continue review from that evidence and retry `show_changes` only after repository state changes or the underlying status path is known healthy.
- A PR whose entire diff is documentation-only under `docs/**`, root `*.md`, or package `README*.md` / `CHANGELOG*.md` is skipped by the heavyweight desktop Build, Test, Lint and E2E workflow path filters. Do not broaden this to arbitrary `**/*.md`: Markdown files may be test fixtures and must still trigger product gates. Changes under `.github/**`, source, tests, scripts, manifests, lockfiles or version-bearing files are never docs-only.
- In a mixed PR that already contains code/workflow changes, GitHub evaluates `pull_request.paths-ignore` against the **whole PR diff**, so a later docs-only synchronize event can still retrigger heavy CI. For an agent-created docs-only follow-up commit in such a PR, append `[skip ci]` to the commit message after confirming the delta contains only the documented docs-only paths. Never use `[skip ci]` for executable/workflow/test/manifest/version changes.
- This skip rule is valid because `develop` currently has no enabled required-status-check branch protection. If required checks/rulesets are enabled later, re-audit this design before relying on `[skip ci]` or path-skipped workflows; use an always-reporting aggregate gate if skipped required checks would otherwise remain pending.

## Stage records

For architecture, performance, stability, migration, or high-risk editor work, maintain a resumable record under `docs/`.

Record completed work, unfinished work, blockers/root cause, validation evidence, current branch/PR when relevant, and next action.

Never invent historical measurements. If a prior change was not independently measured, say so.

Stage records are grouped by domain; use the domain index instead of preloading individual histories:

- [Architecture](../architecture/README.md)
- [Performance](../performance/README.md)
- [Benchmark](../benchmark/README.md)
- [Correctness](../correctness/README.md)

## End-of-task learning review

Every task must end with a brief learning review, even when the implementation itself was straightforward.

1. Summarize what was learned: root cause, successful approach, failed/invalid approaches, important validation evidence, and any reusable constraint.
2. Review the existing agent guides and relevant architecture/performance/progress records before adding new guidance.
3. If the new lesson overlaps an existing rule, **merge or refine the existing rule** instead of appending a duplicate entry.
4. Remove or rewrite stale/conflicting guidance when new evidence supersedes it; do not keep contradictory old/new paths side by side.
5. Add a new standalone rule/document only when the lesson is materially distinct and likely to recur.
6. Keep root `AGENTS.md` concise. Detailed lessons belong in the relevant linked guide or durable task/architecture record.
7. If the task discovered a new environment issue, apply the “learn once” rule in [ENVIRONMENT_RECIPES.md](ENVIRONMENT_RECIPES.md): after the verified path is known, record the reusable diagnosis there and stop re-exploring it. Update [ENVIRONMENT.md](ENVIRONMENT.md) only if the normal first-load contract itself changed.
8. Use progressive disclosure for durable knowledge: first-load guides contain only high-frequency contracts, readiness gates, and navigation. Low-frequency diagnostics, historical failure signatures, and tool-specific recovery paths belong in linked recipe/reference documents and are loaded only when triggered by a matching symptom.

The goal is a curated knowledge base that becomes smaller and clearer over time, not an ever-growing log of one-off observations.

## Truthfulness

- PR created != merged.
- `mergeable=true` != required tests passed.
- one green CI job != all gates passed.
- test/monitoring infrastructure != product/performance improvement.
- local microbenchmark gain != full Electron UX gain.
