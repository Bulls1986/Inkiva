# Inkiva Windows local development runtime contract

[Back to AGENTS.md](../../AGENTS.md)

Local automation is primary. CI independently re-validates; it does not replace a broken local worktree. This guide is the canonical record for Windows local setup, dependency installation, native compilation, worktree reuse, local build/run, Vitest, and Electron E2E bootstrap.

## Validated Windows baseline

Validated on 2026-09-22:

- Node.js `24.21.0` works when the native C++ toolchain is complete. Do not downgrade Node merely because `node-gyp` requests Visual Studio.
- pnpm `10.33.4`, enabled through Corepack/NVM shims.
- Python `3.12.x` is sufficient for `node-gyp`.
- Visual Studio 2022 Build Tools with MSVC v143 x64/x86, a Windows SDK, and the matching Spectre-mitigated libraries required by Electron/native rebuilds.

Repository/CI versions can change. Before changing the baseline, inspect `package.json`, `.nvmrc`/`.node-version` when present, and CI setup. Treat the versions above as a known-good local baseline, not a permanent compatibility ceiling.

### Canonical shell bootstrap

From a normal terminal:

```cmd
cd /d E:\workspace\opensource\Inkiva
nvm use 24.21.0
corepack enable pnpm
nvm reshim
node --version
pnpm --version
where node
where pnpm
```

When a command may compile native modules, load the VS toolchain in the **same terminal** before running it:

```cmd
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
where cl
set VCINSTALLDIR
set VSINSTALLDIR
```

Expected evidence includes `cl.exe`, `VCINSTALLDIR=...\Visual Studio\2022\BuildTools\VC\`, and `VSINSTALLDIR=...\Visual Studio\2022\BuildTools\`.

## Canonical worktree model

Prefer reusable, pre-warmed Git-native worktree slots under:

`E:\workspace\opensource\Inkiva\.worktrees\`

For a new task:

1. inspect worktrees and active Jobs;
2. pick one clean idle slot;
3. update the intended base, normally `develop`;
4. create/switch the task branch in that slot;
5. compare dependency fingerprint: `pnpm-lock.yaml`, package-manager version, relevant manifests;
6. if unchanged, reuse the existing dependencies without reinstalling;
7. if changed/broken, perform one deliberate recovery;
8. pass the readiness gate before product tests.

Do not delete healthy `node_modules` during routine branch cleanup.

## Managed-worktree failure

If bootstrap returns `managed_worktree_root_unavailable`:

- do not retry managed bootstrap;
- do not probe random managed roots;
- use the registered checkout and Git-native `.worktrees` slots;
- reuse a suitable existing slot before creating another one.

## Package-manager entrypoint

Canonical Windows setup:

```powershell
corepack enable pnpm
nvm reshim
where pnpm
pnpm --version
```

Expected result: `where pnpm` resolves the NVM shim and `pnpm --version` succeeds. NVM may initially block the delegated `pnpm.cmd` with event `NVM4306`; `nvm reshim` is the canonical fix after a trusted Corepack enable.

After setup, use:

```bash
pnpm <args>
```

Do not globally install pnpm. Do not invoke package-local `.cmd` binaries directly through `run_process`; use `pnpm exec`.

## Main-checkout dependency install and native compilation

Use pnpm from the repository root:

```cmd
cd /d E:\workspace\opensource\Inkiva
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
pnpm install
```

The install may legitimately pass through several distinct phases: package resolution/linking, `ced` `node-gyp rebuild`, optional `native-keymap` install, repository `postinstall.ts`, patch application, and `electron-rebuild`. Diagnose the failing phase; do not treat every `pnpm install` failure as the same problem.

Known environment signatures:

- `EUNSUPPORTEDPROTOCOL workspace:*` after a nested `npm install`: package-manager mismatch in a script; do not fix by changing the workspace dependency protocol.
- `Unexpected token '<'` / `<!DOCTYPE` from a registry request: wrong/unhealthy registry endpoint or intermediary response. `https://registry.npmmirror.com/` is an npm-compatible registry endpoint; `https://npmmirror.com/` is not the canonical registry URL.
- `Could not find any Visual Studio installation to use` or `VCINSTALLDIR not set`: native compilation is running outside a configured VS developer environment or the C++ workload is incomplete.
- `MSB8040` requesting Spectre libraries: install the matching MSVC v143 x64/x86 Spectre-mitigated libraries; this is not a Node/pnpm failure.
- `native-keymap` initial install failure marked `(skipped as optional)`: may be expected; Inkiva postinstall patches/rebuilds Electron native modules later. Judge the final postinstall/electron-rebuild result.

Do not repeatedly switch Node versions, delete lockfiles, clear caches, or reinstall dependency trees once the failure is proven to be an MSVC/SDK/Spectre issue.

## Dependency recovery

Preferred order:

1. healthy pre-warmed slot with matching dependency fingerprint;
2. one deliberate repair of a slot;
3. CI only after local validation, unless the task is explicitly CI-only.

When lockfile matches and the pnpm store is populated:

```bash
corepack pnpm install --offline --frozen-lockfile --ignore-scripts
```

If that Job is silent/slow, observe the same Job. Do not start offline + online + npm variants in parallel.

## Worktree dependency reuse and physical-path exceptions

The governing rule is:

> **Source and build artifacts stay worktree-local; dependencies may be shared when the dependency fingerprint matches.**

On Windows, a worktree may reuse the main checkout's complete root `node_modules` through one root-level Junction. Do not Junction whole `packages/*/node_modules` trees: that creates cross-worktree realpath leakage and can make Vite/Vitest resolve through another checkout.

Root reuse is valid only when:

- the donor dependency tree is complete and known-good;
- `pnpm-lock.yaml`, package-manager version, and relevant manifests match;
- the Junction is the worktree root `node_modules` only;
- tests/builds run with `cwd`, config, and source paths from the current worktree;
- readiness smoke proves tooling resolves correctly.

### Minimal package-local compatibility paths

Some legacy code/helpers do not use normal Node package resolution; they hard-code physical relative paths under `packages/*/node_modules`. In that case, add only the minimum physical package/shim required by that path. Do **not** restore or Junction the whole package-level dependency tree.

Verified examples:

- Muya/PrismJS: if source requires a physical path such as `packages/muya/node_modules/prismjs/...`, provide only `packages/muya/node_modules/prismjs`. The acceptance signal is the intended tests passing with **zero unhandled errors** (the observed recovery was `30/30` passing, `0` unhandled errors).
- Desktop/Electron helper: if the Windows E2E helper is hard-coded to `packages/desktop/node_modules/.bin/electron.cmd`, provide only the Electron launcher path(s) it requires, e.g. `.bin/electron.cmd` plus `node_modules/electron` pointing at the known-good dependency graph. Do not Junction all of `packages/desktop/node_modules`.
- Desktop/Vitest: a root `node_modules` Junction alone does **not** guarantee `pnpm -C packages/desktop exec vitest` can see a package-local CLI. Do **not** manufacture a worktree-local `packages/desktop/node_modules` tree just for the launcher. A donor checkout's existing Vitest launcher may be used only as a probe while the test `cwd`, config and source remain in the current worktree; `--version` is insufficient. If the first focused spec is not actually discovered/executed, reject that route as environment evidence and do not keep retrying it.
- Donor tool fallback: when the worktree source/config is healthy but a package-local CLI shim is absent, it is valid to invoke a matching known-good donor checkout's tool executable while passing the **current worktree's config/source paths** explicitly. This was validated with donor `vue-tsc.cmd --noEmit -p <worktree>/packages/desktop/tsconfig.json`. Tool binaries may come from the donor; source/config/build artifacts may not. If the tool resolves source through the donor checkout or stalls before discovery, reject that topology instead of treating it as product evidence.

If Vite/Vitest reports `Denied ID ...other-worktree...` or equivalent realpath leakage, the topology is invalid. Remove the offending link; do not patch Vite allowlists to hide the problem.

Pre-warmed slot-local dependencies remain preferred when they are already complete and healthy.

### Git staging fallback on Windows worktrees

If a bounded `git add <explicit paths...>` stalls on the Windows Runner and may have partially staged files, do not repeat the same batch blindly. After the Job is terminal, verify there is no `index.lock` or residual Git process, inspect `git status --short`, unstage any partial results with exact-path `git reset HEAD -- <paths>`, then prefer WebCodex `git_commit_paths` with an exact `expected_head` and explicit path list. Its isolated temporary index avoids partial staging and cannot pull unrelated files into the commit.

### GitHub transport fallback

If HTTPS `git push` or `git ls-remote` repeatedly stalls with no Git output while `gh api` succeeds through the configured local proxy, classify the issue as Git transport/path-specific rather than a repository or authentication failure. Prefer `HTTP_PROXY` / `HTTPS_PROXY` for `gh`, verify the remote base branch SHA before any fallback, and do not keep retrying the same hung Git transport path.

When Git transport remains unusable but GitHub API is healthy, GitHub Git Data API may be used as a controlled fallback: export the exact committed file set from the current HEAD, create blobs/tree/commit with the verified remote base as parent, create or fast-forward only the intended task ref, then let normal PR CI validate the resulting branch. Never force-update an existing remote branch without first verifying its current ref and parent relationship.

## Local build, run, Vitest, and Electron E2E

### Vitest

Run tests from the current worktree so `cwd`, source, configuration, and snapshots belong to that branch; shared dependencies must not change source ownership.

```cmd
cd /d <current-worktree>
pnpm exec vitest <focused args>
```

A process that exits because tooling is missing, discovers `0 tests` because of dependency/bootstrap damage, or reports cross-worktree realpaths is environment evidence, not a product red test.

### Electron build artifacts are never shared across branches

Dependencies may be reused. Electron build output may not. Before current-worktree E2E, build the current worktree so artifacts such as `out/main/index.js` come from the code under test:

```cmd
cd /d <current-worktree>
pnpm exec electron-vite build
```

Use the repository's canonical build script instead when one wraps additional required steps.

Never combine current-worktree tests with another checkout's `out/main/index.js` or renderer output; that E2E result is invalid.

### Electron E2E evidence ladder

Classify failures in this order:

1. dependency/bootstrap failure;
2. Electron launcher/shim failure;
3. current-worktree build artifact missing/failing;
4. Electron launch/debug-port failure;
5. test-body/selector failure;
6. product assertion failure.

Only failures after a successful **current-worktree build + Electron launch + entry into the test body** count as product-code evidence. For example, missing `electron.cmd` or missing `out/main/index.js` is environment evidence; a materialization assertion such as `visibleBlocks = 0` after the test body starts is a valid product/test red signal.

## Readiness gate

A local product test is valid evidence only after:

1. intended branch/base and no unrelated changes;
2. no duplicate install/test Job;
3. `pnpm --version` succeeds;
4. dependency graph is complete for the chosen reuse model;
5. worktree-local pnpm, when used, points `.modules.yaml` to this slot's isolated virtual store;
6. required tools resolve through `pnpm exec`;
7. representative dependencies do not resolve through invalid cross-worktree realpaths;
8. one focused smoke starts and discovers the intended test.

Runner startup failure or “0 tests” caused by missing dependencies is environment evidence, not a red product test.

## One logical operation, one Job

For install/test/E2E/build/performance/release validation:

- inspect active Jobs before starting;
- at most one active Job per logical operation;
- silence, timeout, disconnect, or unknown response does not prove termination;
- observe the existing Job first;
- retry only after terminal state and a understood retry reason;
- stop redundant duplicates if accidentally created.

## Canonical decision table

| Condition | Canonical action | Do not repeat |
|---|---|---|
| `managed_worktree_root_unavailable` | Existing/pre-warmed Git-native slot | managed bootstrap retries |
| bare `pnpm` missing or NVM emits `NVM4306` | `corepack enable pnpm` → `nvm reshim` → verify `pnpm --version` | global pnpm install / manual PATH hacks |
| new worktree lacks dependencies | use healthy pre-warmed slot; otherwise one deliberate repair | ad-hoc package Junctions |
| offline install silent | observe same Job | launch duplicate installs |
| Vitest 0 tests from missing tooling/`tinyexec` | environment incomplete; repair/replace slot | call it product regression |
| Vite/Vitest resolves another worktree | topology invalid | Vite allowlist hacks |
| relative Windows `.cmd` fails | `pnpm exec` | direct `vitest.cmd` calls |
| main checkout dependencies incomplete | do not use as donor | copy/Junction incomplete tree |
| `node-gyp` cannot find VS / `VCINSTALLDIR` missing | load VS2022 `VsDevCmd.bat` in the same terminal; verify `where cl` | Node/pnpm churn |
| `MSB8040` Spectre library error | install matching v143 x64/x86 Spectre-mitigated libs | reinstall Node/pnpm |
| package-local hard-coded dependency path missing | add only the exact package/shim required by that physical path | Junction entire `packages/*/node_modules` |
| Electron helper cannot find package-local launcher | add minimal Electron launcher compatibility paths | restore all Desktop dependencies |
| current worktree lacks `out/main/index.js` | build current worktree before E2E | reuse main-branch build output |
| E2E fails before current build+launch+test body | classify as environment/bootstrap evidence | report product regression |

## Learn once

A genuinely new environment problem may be explored once. Once a repeatable solution is verified, update this file immediately with root cause, canonical action, and invalid alternatives. Future sessions follow that path directly.

Only change a canonical path when new evidence proves it invalid; document the evidence first.
