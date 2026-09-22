# Windows Runner and dependency environment

[Back to AGENTS.md](../../AGENTS.md)

Local automation is primary. CI independently re-validates; it does not replace a broken local worktree.

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

Use:

```bash
corepack pnpm <args>
```

Do not globally install pnpm because bare `pnpm` is absent. Do not invoke package `.cmd` binaries directly through `run_process`; use `corepack pnpm ... exec`.

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

## Junction rules

### Forbidden: package-level Junctions

Do not Junction only `packages/muya/node_modules` or another package-local subtree.

pnpm workspace execution depends on the wider root graph: `.pnpm`, `.bin`, workspace links, and transitive runtime tooling such as `tinyexec`. Partial reuse can yield “0 tests”, missing tools, or inconsistent Vite/Vitest behavior.

### Conditional fallback: whole-root node_modules reuse

Whole-root `node_modules` reuse is allowed only when all are true:

- source checkout dependency tree is complete and known-good;
- dependency fingerprint matches;
- the Junction covers root `node_modules`, not a package subset;
- readiness smoke passes;
- Vite/Vitest do not leak forbidden cross-worktree realpaths.

If Vite/Vitest reports `Denied ID ...other-worktree...` or equivalent realpath leakage, remove the Junction and use a worktree-local isolated graph or another healthy slot. Do not patch Vite allowlists to hide topology problems.

Pre-warmed slot-local dependencies remain the preferred model.

## Readiness gate

A local product test is valid evidence only after:

1. intended branch/base and no unrelated changes;
2. no duplicate install/test Job;
3. `corepack pnpm --version` succeeds;
4. dependency graph is complete for the chosen reuse model;
5. worktree-local pnpm, when used, points `.modules.yaml` to this slot's isolated virtual store;
6. required tools resolve through `corepack pnpm ... exec`;
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
| bare `pnpm` missing | `corepack pnpm` | global pnpm install |
| new worktree lacks dependencies | use healthy pre-warmed slot; otherwise one deliberate repair | ad-hoc package Junctions |
| offline install silent | observe same Job | launch duplicate installs |
| Vitest 0 tests from missing tooling/`tinyexec` | environment incomplete; repair/replace slot | call it product regression |
| Vite/Vitest resolves another worktree | topology invalid | Vite allowlist hacks |
| relative Windows `.cmd` fails | `corepack pnpm ... exec` | direct `vitest.cmd` calls |
| main checkout dependencies incomplete | do not use as donor | copy/Junction incomplete tree |

## Learn once

A genuinely new environment problem may be explored once. Once a repeatable solution is verified, update this file immediately with root cause, canonical action, and invalid alternatives. Future sessions follow that path directly.

Only change a canonical path when new evidence proves it invalid; document the evidence first.
