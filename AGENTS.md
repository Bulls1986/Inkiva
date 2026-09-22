# AGENTS.md

Repository entrypoint for coding agents working on Inkiva.

Inkiva is a document-first Markdown desktop editor. User documents must remain standard Markdown, and editor responsiveness/correctness outrank background work.

## Mandatory rules

1. Start non-trivial work from the latest intended base, normally `develop`, in one isolated task branch/worktree.
2. Reproduce the problem with a focused failing test before changing production code.
3. Never weaken assertions, thresholds, workloads, sample counts, or scenarios to make tests/CI pass.
4. Never treat environment/bootstrap failure as product-code evidence.
5. For long-running work, allow **one active Job per logical operation**. Silence/timeout is not proof of failure; observe the existing Job first.
6. On the Windows Runner use `corepack pnpm`; do not globally install pnpm because bare `pnpm` is missing.
7. Prefer reusable pre-warmed Git-native worktree slots; do not rebuild dependencies for every branch.
8. A genuinely new environment problem may be explored once. Once solved, immediately update the canonical environment guide and stop re-exploring it.
9. Record meaningful stages for architecture/performance/stability/high-risk editor work so a new session can resume without rediscovery.
10. PR created != merged; green CI job != every required correctness/performance/release gate passed.

## Guides

Read only what the task needs.

| Topic | Guide |
|---|---|
| Task lifecycle, branch/PR discipline, stage records | [Workflow](docs/agent/WORKFLOW.md) |
| Windows Runner, worktrees, pnpm, node_modules, Junctions, Job recovery | [Environment](docs/agent/ENVIRONMENT.md) |
| Unit/integration/Electron E2E, red/green evidence | [Testing](docs/agent/TESTING.md) |
| Benchmarks, Fast Gate, Before/After, thresholds | [Performance](docs/agent/PERFORMANCE.md) |
| Repository boundaries, code conventions, release rules | [Architecture & release](docs/agent/ARCHITECTURE_RELEASE.md) |
| Current architecture audit and governance tasks | [Architecture audit](docs/architecture/ARCHITECTURE_AUDIT_2026-09.md) |
| Editor runtime ownership/lifecycle governance | [ARCH-01](docs/architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md) |
| IPC contract governance | [ARCH-02](docs/architecture/ARCH-02-IPC-CONTRACT.md) |
| Virtual surface/render geometry contract | [ARCH-03](docs/architecture/ARCH-03-VIRTUAL-SURFACE-CONTRACT.md) |
| Renderer event-bus contract | [ARCH-05](docs/architecture/ARCH-05-EVENT-BUS-CONTRACT.md) |
| Long-running PR-C performance history | [PR-C ledger](docs/perf-pr-c-change-ledger.md) |

For comments, follow [.github/COMMENTING-GUIDELINES.md](.github/COMMENTING-GUIDELINES.md).

## Startup checklist

1. Identify task, base, branch, affected subsystem.
2. Inspect existing worktrees and active Jobs before creating/running anything.
3. Read the relevant guide(s) above.
4. Confirm the selected worktree is clean of unrelated work and environment-ready.
5. Reproduce the issue with a focused failing test.
6. Create/update the stage record when the task is multi-stage or high-risk.

If a canonical environment path already exists, follow it directly. Do not repeat earlier experiments unless new evidence proves the documented path invalid.

