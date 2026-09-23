# Inkiva Windows environment quick contract

[Back to AGENTS.md](../../AGENTS.md) · [Troubleshooting recipes](ENVIRONMENT_RECIPES.md)

This is the **first-load environment contract**. Read this file for normal task startup. Open the troubleshooting recipes only when the corresponding symptom occurs; do not preload the full historical environment knowledge base.

## Core rules

1. Source and build artifacts stay in the current worktree. Dependencies may be reused only when the dependency fingerprint matches.
2. Prefer clean, pre-warmed Git-native slots under `E:\\workspace\\opensource\\Inkiva\\.worktrees\\`.
3. On Windows, enable pnpm through Corepack/NVM shims: `corepack enable pnpm` → `nvm reshim` → verify `pnpm --version`. Do not globally install pnpm.
4. Keep at most **one active Job per logical operation**. Silence/timeout/disconnect does not prove failure; observe the existing Job first.
5. Environment/bootstrap/build/launcher failures are environment evidence, not product regressions.
6. Reuse only a complete known-good root dependency graph with matching `pnpm-lock.yaml`, package-manager version, and relevant manifests. Never Junction whole `packages/*/node_modules` trees.
7. If legacy code requires a physical package-local path, provide only the minimum package/shim needed by that path.
8. Electron E2E must use the current worktree's source, config, and build output. Dependencies may be reused; `out/` artifacts may not.
9. A new environment problem may be explored once. After the verified path is known, update the troubleshooting recipes and stop re-exploring it.

## Known-good Windows baseline

Validated baseline: Node.js `24.21.0`, pnpm `10.33.4`, Python `3.12.x`, Visual Studio 2022 Build Tools with MSVC v143 x64/x86, Windows SDK, and matching Spectre-mitigated libraries. Repository/CI configuration remains authoritative if versions change.

Normal shell bootstrap:

```cmd
cd /d E:\workspace\opensource\Inkiva
nvm use 24.21.0
corepack enable pnpm
nvm reshim
node --version
pnpm --version
```

For native compilation, load `VsDevCmd.bat` in the **same terminal** and verify `where cl`, `VCINSTALLDIR`, and `VSINSTALLDIR` before running install/rebuild commands. See [native compilation recipes](ENVIRONMENT_RECIPES.md#main-checkout-dependency-install-and-native-compilation) for failure signatures.

## Worktree startup

For a new task:

1. inspect existing worktrees and active Jobs;
2. choose one clean idle slot;
3. update the intended base, normally `develop`;
4. create/switch the task branch;
5. compare dependency fingerprint;
6. reuse healthy dependencies when compatible, otherwise perform one deliberate recovery;
7. pass the readiness gate below before product tests.

Do not delete healthy `node_modules` during routine cleanup. If managed bootstrap fails, follow the [managed-worktree recipe](ENVIRONMENT_RECIPES.md#managed-worktree-failure) rather than probing random roots.

## Readiness gate

A local product test is valid evidence only after all of the following are true:

1. intended branch/base and no unrelated changes;
2. no duplicate install/test Job;
3. `pnpm --version` succeeds;
4. dependency graph is complete for the chosen reuse model;
5. reused dependencies do not redirect source/config into another worktree;
6. required tools resolve through the intended package-manager path;
7. current-worktree build artifacts exist when E2E requires them;
8. one focused smoke actually starts and discovers the intended test.

A runner startup failure, missing tool, `0 tests`, cross-worktree realpath, missing Electron launcher, or missing current-worktree build artifact is not a red product test.

## Fast decision table

| Symptom | Canonical action | Detail |
|---|---|---|
| managed worktree bootstrap unavailable | use/reuse a Git-native `.worktrees` slot | [recipe](ENVIRONMENT_RECIPES.md#managed-worktree-failure) |
| bare pnpm missing / NVM shim issue | `corepack enable pnpm` → `nvm reshim` | [recipe](ENVIRONMENT_RECIPES.md#package-manager-entrypoint) |
| install/native rebuild failure | identify the exact install phase before changing Node/deps | [recipe](ENVIRONMENT_RECIPES.md#main-checkout-dependency-install-and-native-compilation) |
| worktree dependency missing/leaking | reuse only matching root graph; minimal package-local exception only | [recipe](ENVIRONMENT_RECIPES.md#worktree-dependency-reuse-and-physical-path-exceptions) |
| Vitest does not discover tests | classify launcher/dependency topology first; diagnose serially | [recipe](ENVIRONMENT_RECIPES.md#vitest) |
| Electron E2E fails before test body | walk dependency → launcher → build → launch ladder | [recipe](ENVIRONMENT_RECIPES.md#electron-e2e-evidence-ladder) |
| `git diff --check` reports whitespace on Windows | distinguish literal whitespace from CRLF normalization before editing | [recipe](ENVIRONMENT_RECIPES.md#crlf--trailing-whitespace-diagnostics-on-windows) |
| staging/push becomes silent | observe same process/ref first; do not duplicate the operation | [staging](ENVIRONMENT_RECIPES.md#git-staging-fallback-on-windows-worktrees) / [push](ENVIRONMENT_RECIPES.md#github-transport-fallback) |
| long-running Job is silent | keep one Job, observe it, retry only after terminal state + understood cause | [recipe](ENVIRONMENT_RECIPES.md#one-logical-operation-one-job) |

## Loading discipline

Do **not** read `ENVIRONMENT_RECIPES.md` end-to-end during normal startup. Open only the section matching the observed symptom. The recipes are the durable troubleshooting memory; this quick contract is the normal first-load surface.
