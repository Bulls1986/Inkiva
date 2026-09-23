# AGENTS.md

Repository entrypoint for coding agents working on Inkiva.

Inkiva is a document-first Markdown desktop editor. User documents must remain standard Markdown, and editor responsiveness/correctness outrank background work.

## Mandatory rules

1. Start non-trivial work from the latest intended base, normally `develop`, in one isolated task branch/worktree.
2. Reproduce the problem with a focused failing test before changing production code.
3. Never weaken assertions, thresholds, workloads, sample counts, or scenarios to make tests/CI pass.
4. Never treat environment/bootstrap failure as product-code evidence.
5. For long-running work, allow **one active Job per logical operation**. Silence/timeout is not proof of failure; observe the existing Job first.
6. On the Windows Runner, enable pnpm through Corepack and NVM shims (`corepack enable pnpm`, then `nvm reshim`). After that, use bare `pnpm`; do not globally install pnpm.
7. Follow the Windows local-build/worktree runtime contract in `docs/agent/ENVIRONMENT.md`: reuse a known-good root dependency graph, keep source/build artifacts worktree-local, add only minimal package-local compatibility paths when legacy code/helpers require physical paths, and classify bootstrap/build/launch failures as environment evidence rather than product regressions.
8. A genuinely new environment problem may be explored once. Once solved, record the reusable diagnosis in `docs/agent/ENVIRONMENT_RECIPES.md` and stop re-exploring it; change the quick environment contract only when the high-frequency rule itself changes.
9. Record meaningful stages for architecture/performance/stability/high-risk editor work so a new session can resume without rediscovery.
10. PR created != merged; green CI job != every required correctness/performance/release gate passed.
11. At task closeout, summarize lessons learned and review existing guidance for overlap; merge/refine prior experience instead of adding duplicate rules. See `docs/agent/WORKFLOW.md`.

## Guides

Read only what the task needs.

| Topic | Guide |
|---|---|
| Task lifecycle, branch/PR discipline, stage records | [Workflow](docs/agent/WORKFLOW.md) |
| Windows Runner normal startup / readiness | [Environment quick contract](docs/agent/ENVIRONMENT.md) |
| Windows troubleshooting — open only for a matching symptom | [Environment recipes](docs/agent/ENVIRONMENT_RECIPES.md) |
| Unit/integration/Electron E2E, red/green evidence | [Testing](docs/agent/TESTING.md) |
| Benchmarks, Fast Gate, Before/After, thresholds | [Performance](docs/agent/PERFORMANCE.md) |
| Repository boundaries, code conventions, release rules | [Architecture & release](docs/agent/ARCHITECTURE_RELEASE.md) |
| Architecture governance/contracts — open only for architecture work | [Architecture index](docs/architecture/README.md) |
| Performance baselines/stages/history | [Performance index](docs/performance/README.md) |
| Benchmark inventory/trustworthiness | [Benchmark index](docs/benchmark/README.md) |
| Correctness/readiness/functional gates | [Correctness index](docs/correctness/README.md) |

For comments, follow [.github/COMMENTING-GUIDELINES.md](.github/COMMENTING-GUIDELINES.md).

## Startup checklist

1. Identify task, base, branch, affected subsystem.
2. Inspect existing worktrees and active Jobs before creating/running anything.
3. Read only the relevant quick guide(s) above. Do not preload troubleshooting/history documents unless a matching symptom or task requires them.
4. Confirm the selected worktree is clean of unrelated work and environment-ready.
5. Reproduce the issue with a focused failing test.
6. Create/update the stage record when the task is multi-stage or high-risk.

If a canonical environment path already exists, follow it directly. Do not repeat earlier experiments unless new evidence proves the documented path invalid.

