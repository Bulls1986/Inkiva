# ARCH-02 — IPC Contract Closure

## Recovery ledger

- Branch: `arch/02-ipc-contract`
- Base: `origin/develop` at `42ea8f57f63ddc1a5ce7753e3fad0b5e705f1fc2` (`refactor(renderer): close event bus contracts (#158)`)
- Scope: architecture debt rank #3 from `ARCHITECTURE_AUDIT_2026-09.md`
- Goal: close high-frequency renderer↔main IPC payload contracts, prevent new raw renderer channel strings, and remove legacy/HACK renderer IPC only after usage evidence proves it has no production caller.
- Non-goal: this is an architecture/correctness PR, not a performance PR.

## Stage 1 — Baseline and audit

Status: completed.

Evidence:

- `packages/desktop/src/shared/types/ipc.ts` is already the single channel registry, but its header explicitly says payloads remain intentionally permissive during migration.
- High-frequency gaps still include:
  - `mt::rg::start` request as `unknown`;
  - `mt::set-user-preference` and `set-user-preference` as `unknown`;
  - open-file/open-markdown options as `unknown`;
  - `update-buffer-state` payload as `unknown`;
  - ripgrep main→renderer events as `unknown`;
  - preload ripgrep/uploader domain APIs still expose `unknown` request/payload shapes.
- `mt::window-add-file-path` exists in the public renderer send contract and has a main-process HACK handler in `WindowManager._listenForIpcMain()`.
- Repository-wide usage search found no renderer/preload production caller for `mt::window-add-file-path`; the non-prefixed `window-add-file-path` is a separate internal main-process event and remains in use from file save flows.
- Therefore the prefixed HACK channel is a valid removal candidate, but deletion must occur only after contract/usage tests are in place.

Environment:

- Fresh worktree dependencies must remain local to this worktree.
- Do not Junction `node_modules` from another checkout.
- If required, use `pnpm install --offline --frozen-lockfile --ignore-scripts` so Vite/Vitest resolve inside this worktree.

## Stage 2 — Test design

Status: completed.

Added `packages/desktop/test/unit/specs/ipc-contract-closure.spec.ts` before implementation.

The contract test is intentionally fail-closed and requires:

1. `mt::rg::start` to reject an invalid search mode at compile time;
2. preference update channels to reject primitive payloads;
3. open-file channels to reject non-object options;
4. `update-buffer-state` to reject non-object snapshots;
5. the legacy `mt::window-add-file-path` channel to disappear from the public renderer send contract.

Baseline red evidence captured with `corepack.exe pnpm -C packages/desktop run typecheck`: `vue-tsc` failed with exactly five `TS2578: Unused '@ts-expect-error' directive` errors at lines 18, 38, 50, 62 and 72 of `ipc-contract-closure.spec.ts`. This proves all five invalid shapes/channels were accepted by the pre-fix type surface.

Dependency recovery evidence: this worktree initially had no local `node_modules`; `corepack.exe pnpm install --offline --frozen-lockfile --ignore-scripts` completed successfully with exit code 0 in the Runner-owned job. No cross-worktree Junction was used.

## Stage 3 — Implementation

Status: completed.

Implemented:

- shared `RipgrepRequest` / `RipgrepSearchOptions` / start-result contracts now drive main and preload;
- preference update payloads are object-shaped `PreferencePatch` rather than arbitrary `unknown`;
- open-file payloads use the existing shared `TabOptions` type;
- `update-buffer-state` uses the existing shared `BufferedState` type;
- `mt::save-tabs` and `mt::save-and-close-tabs` use the existing shared `UnsavedFile[]` payload rather than permissive arrays;
- renderer command implementations no longer call `window.electron.ipcRenderer.*` directly; command IPC is routed through the preload `commands` domain API;
- the proven-dead prefixed `mt::window-add-file-path` renderer channel and main HACK handler were removed;
- the separate non-prefixed internal `window-add-file-path` event used by save flows was intentionally retained;
- tightening the ripgrep contract exposed two real caller mismatches (`unknown` option bag and `null` max-file-size); callers were corrected rather than weakening the new contract.

The remaining `unknown` entries in `shared/types/ipc.ts` are outside this PR's high-frequency closure slice (for example uploader, selection/layout, spelling and other legacy domains). ARCH-02 does not claim the entire IPC registry is fully migrated; it closes the audited search/open/save/session/window/preferences paths and establishes a fail-closed renderer-command boundary.

## Stage 4 — Validation

Status: completed locally; PR CI pending.

Green evidence:

- `corepack.exe pnpm -C packages/desktop run typecheck` — passed;
- focused ARCH-02 tests — 2 files / 7 tests passed;
- related regression suite covering ripgrep, preferences, buffer/session, open/quick-open, tab lifecycle, close/save-adjacent IPC and existing IPC contracts — 12 files / 51 tests passed;
- repository search confirms zero `window.electron.ipcRenderer.` usage under `src/renderer/src/commands`;
- repository search confirms zero remaining production occurrences of prefixed `mt::window-add-file-path` under `packages/desktop/src`.

Full desktop unit-suite observation:

- `pnpm -C packages/desktop run test:unit` executed 148 files / 1204 tests;
- result: 141 files passed, 7 files failed; 1185 tests passed, 18 failed, 1 skipped;
- visible failures include `document-intelligence-repair.spec.ts`, `ui-04-controls-contract.spec.ts` and `ui-02-chrome-contract.spec.ts`, which are outside the IPC files changed by ARCH-02;
- all ARCH-02-specific and directly related regression specs passed in the same full-suite run;
- these unrelated full-suite failures are not masked or weakened here; Required Tests in PR CI remain the final integration gate.

## Completed

- confirmed ARCH-02 is architecture-debt rank #3;
- created isolated worktree and branch from latest `origin/develop`;
- audited typed IPC registry, preload bridge, search, preferences, buffered state, open/save and legacy window channels;
- proved by repository usage search that the prefixed legacy HACK channel has no renderer/preload production caller;
- added fail-closed compile-time contract tests before implementation and captured the expected red state;
- added a renderer-command boundary test and captured its expected red state before migration;
- added save payload contract coverage and captured its expected red state before tightening `save-tabs` payloads;
- restored worktree-local dependencies offline with no cross-worktree Junction;
- implemented typed closure for search/preferences/open/save/buffered-state plus renderer command-domain IPC;
- removed the proven-dead prefixed window HACK IPC without touching the still-used internal save event;
- passed typecheck, 7 focused contract tests and 51 directly related regression tests.

## Not completed

- commit and push the validated branch;
- create/update the PR;
- run and close all required PR CI checks;
- update this ledger with PR number, final commit SHA and CI result.

## Current blocker

No ARCH-02 code blocker. The repository-wide desktop unit suite currently contains unrelated failures outside this change set; they are recorded above and will be distinguished from PR-specific CI failures rather than worked around by weakening tests.

## Next step

Review the final diff, run `git diff --check`, commit/push, create the ARCH-02 PR, then use Required Tests/CI as the final integration gate.
