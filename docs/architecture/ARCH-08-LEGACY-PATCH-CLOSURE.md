# ARCH-08 — Legacy Patch Debt / Boundary Closure

## Task identity

- Branch: `arch/08-legacy-patch-closure`
- Initial base: `develop@7f1e1e949b749108ea92552cb9fe996915730e3a`
- Principle: **audit first; prove the replacement contract before deleting historical patches**
- Target architecture: UI → `DocumentEditorRuntime` → `IDocumentSurface` → Editor Adapter / Muya, with Geometry, Embedded Block, Persistence, Background Services and Release / Platform Services as explicit side boundaries.
- Final cleanup/merge rule: rebase onto the latest `develop` after ARCH-06 and ARCH-07 land, then repeat the boundary audit and regression gates.
- Scope note: the September architecture audit originally used the label “ARCH-08” for website/release boundary work. This task intentionally redefines ARCH-08 as the final Legacy Patch Debt / Boundary Closure item; the closure report must preserve that distinction.

## Stage 1 — Audit

Status: **complete for the initial develop baseline; must be repeated after ARCH-06/07 merge**.

Current commit: `7f1e1e94`.

Completed:

- Read root `AGENTS.md` and the canonical workflow, environment, testing and architecture guidance.
- Read the architecture audit plus ARCH-01, ARCH-02, ARCH-03 and ARCH-05 records from `develop`.
- Inspected the active ARCH-06 worktree and its draft `ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md`; its public type boundary is not yet merged.
- Inspected the active ARCH-07 worktree and its draft `ARCH-07-BACKGROUND-SCHEDULER.md`; its scheduler lifecycle/latest-wins contract is not yet merged.
- Verified remote `develop` through GitHub API at `7f1e1e94`, equal to the local `develop` HEAD. Git Smart HTTP fetch timed out, so the stale `origin/develop` tracking ref is environment evidence only.
- Scanned patch-debt indicators across renderer/main: TODO/FIXME/HACK/WORKAROUND, timeout/interval/rAF/nextTick/debounce/retry, guards, casts/suppression, DOM measurement and duplicated lifecycle/state synchronization.

Initial conclusions:

- Existing formal mechanisms must not be “cleaned up” mechanically. In particular, source snapshot debounce, autosave single-flight/revision acknowledgement, scroll-position persistence debounce, render-performance debounce, pending scroll restore rAF/ResizeObserver reconciliation, and scheduler zero-delay dispatch all have explicit responsibilities.
- Electron compatibility workarounds in main process are upstream/platform workarounds and are retained unless an upstream version check proves them obsolete.
- The strongest initial timing-debt candidate is the spellchecker command registration in `editor.vue`, which currently uses an arbitrary `setTimeout(..., 100)` even though command registration already has an explicit renderer event contract.
- The source-mode scroll restore sequence (`restoreScroll(); nextTick(restoreScroll); requestAnimationFrame(restoreScroll)`) is correctness-sensitive and stays category D until a deterministic surface/readiness replacement is proven.
- ARCH-06-owned legacy Muya declaration/alias debt and ARCH-07-owned scheduler/background lifecycle debt are dependency items, not early-delete candidates.

Risks:

- Do not delete guards that protect stale source-mode callbacks, tab identity or async completion without a replacement lifecycle/revision signal.
- Do not migrate autosave into the generic background scheduler.
- Do not introduce UI → Muya private API access, background → DOM access, or duplicate geometry ownership.
- Do not claim performance improvement without a Before/After measurement.

Next:

1. materialize the inventory/classification below into fail-closed architecture tests;
2. capture baseline red evidence for the first cleanup slice;
3. implement only cleanup independent of ARCH-06/07;
4. re-audit and rebase after ARCH-06/07 merge before final closure.

## Stage 2 — Patch Debt Inventory

Status: **initial inventory complete; living inventory until final rebase**.

| Area / signal | Location | Class | Decision / replacement evidence |
| --- | --- | --- | --- |
| arbitrary 100 ms command registration | `editorWithTabs/editor.vue` spellchecker command | A candidate | Replace with deterministic registration once a regression test proves mount ordering does not require time delay. |
| scroll position 120 ms debounce | `editorWithTabs/editor.vue` | C | Keep: UI persistence debounce, not correctness timing. Runtime-owned teardown already clears it. |
| scroll performance end 120 ms timer | `editorWithTabs/editor.vue` | C | Keep: telemetry/performance window, not correctness. |
| snapshot scheduler timers | `editorHotPath.ts` | C | Keep: explicit coalescing/max-wait/persistence contract with tests. |
| source word-count/snapshot 120 ms timer | `sourceCode.vue` | C | Keep: documented O(document-size) debounce; stale tab/destroy guards are required. |
| source scroll restore: immediate + nextTick + rAF | `sourceCode.vue` | D | Do not delete until explicit source-surface readiness can replace it and E2E proves tab/source restoration. |
| pending scroll restore rAF | `editor.vue` | C | Keep: ARCH-03/04 geometry reconciliation, user-interaction cancellation and surface ownership. |
| editor focus rAF | `editor.vue` | D | Local focus/caret readiness; requires targeted regression before any change. |
| manual anchor rect for local scroll target | `editor.vue` | C | Local UI navigation measurement; not document geometry ownership by itself. |
| performance prewarm rect reads | `editor.vue` | C | Intentional performance instrumentation/prewarm; not correctness. |
| module singleton buffered-state scheduler | `store/bufferedState.ts` | B/D | Architecture audit observation. Needs lifecycle test before deciding whether to wrap in a runtime/service contract. |
| background scheduler zero-delay timer | `util/backgroundScheduler.ts` | C | Formal scheduler dispatch mechanism; ARCH-07 owns lifecycle/latest-wins changes. |
| Muya desktop permissive shim / legacy alias | desktop types/config | B | ARCH-06 owns replacement via real `@muyajs/core` public declarations; do not duplicate cleanup. |
| Electron zoom workaround | `main/windows/utils.ts` | C | Keep: documented Electron upstream issue until version evidence proves obsolete. |
| Windows Alt+F4 workaround | `main/menu/index.ts` | C | Keep: documented Electron upstream issue; removal could duplicate close events. |
| Electron spellcheck startup workaround | `main/config.ts` | C | Keep: documented Electron upstream issue. |
| context-menu spellcheck detection workaround | `main/contextMenu/editor/index.ts` | C | Keep pending upstream verification. |
| keybinding IME FIXME | `key-input-dialog.vue` | D | Product correctness issue; requires dedicated reproduction/test, not opportunistic deletion. |
| command-palette focus/execute 10 ms + 150 ms delays | `commands/index.ts` `focusEditorAndExecute` | D | High-impact correctness timing used by undo/redo, paragraph, format and view commands. Command palette closes immediately before execute; do not remove until a deterministic palette-closed/editor-focus-ready contract and selection regression coverage exist. |
| command-specific `delay(50/150)` | `commands/index.ts` print/find | D | Likely modal/focus sequencing debt; test from command palette, menu and shortcut paths before replacement. |
| command-palette 500 ms loading-message timer | `commandPalette/index.vue` | C | UX-only delayed busy indicator, not correctness. |
| loading component reveal timer | `components/loading/index.vue` | C | UX anti-flicker delay. |
| workspace search `setTimeout(..., 0)` chunking | `node/workspaceSearch.ts` | C | Cooperative yielding/performance slicing; cancellation contract is explicit. |
| folder-search debounce/cancel affordance timers | `sideBar/search.vue` | C | Search debounce and delayed UX affordance; generation guards protect stale results. |
| PicGo detection/retry UI timers | `prefComponents/image/components/uploader/index.vue` | D / product | Contains several “extra safety”/delayed detection paths. Product-specific state-machine debt, not a core editor architecture shortcut; move to product reliability roadmap unless final audit proves cross-layer ownership. |
| i18n polling fallback / simulated delayed loading | `prefComponents/sideBar/config.ts` | D / product | Legacy preference/debug-style fallback; outside editor governance unless it leaks lifecycle ownership. |
| stale TODO comments | several main/renderer files | D | Review individually; comments tied to unresolved product/refactor work are not dead code by default. |

Classification meanings:

- **A** — replaced by current architecture and safe to remove after regression proof.
- **B** — still needed but should migrate behind a formal contract.
- **C** — real UX/performance/platform workaround with explicit responsibility; retain and document.
- **D** — insufficient evidence; add coverage or defer.

## Stage 3 — Classification

Status: **complete for initial baseline**.

Cleanup Batch 1 will target only deterministic, ARCH-06/07-independent timing/ownership debt with a focused regression gate. Batch 2 is reserved for items whose safety depends on the merged ARCH-06/07 contracts.

No production patch has been removed yet.

## Stage 4 — Cleanup Batch 1

Status: **implemented and locally validated**.

Current commit: `47e16a6b` (`ARCH-08: close command startup timing debt`).

Targeted debt:

- `editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()` used a 400 ms timeout before registering runtime commands, then another 100 ms timeout before requesting keybindings and sorting commands.
- `editor.vue` used another 100 ms timeout before registering the spellchecker language command.
- The root cause was startup ordering: `app.vue` registered editor bootstrap before awaiting command-center initialization, while command-center runtime listeners themselves are installed synchronously before their first async catalogue refresh.

Replacement contract:

1. `app.vue` starts `LISTEN_COMMAND_CENTER_BUS()` first and retains the returned readiness Promise.
2. That call synchronously installs typed `cmd::register-command`, `cmd::sort-commands`, command execution and keybinding-response listeners.
3. Editor bootstrap listeners are then registered and runtime commands are emitted immediately through the already-ready typed bus.
4. `app.vue` awaits command-centre catalogue readiness only after early bootstrap/project IPC listeners are installed.
5. `commandCenter.ts` requests user keybindings after `refreshCommands()` completes, so shortcuts are applied after the translated/static catalogue and early runtime commands have been merged.
6. Spellchecker registration emits immediately through the same already-ready command bus.

Removed arbitrary correctness delays:

- 400 ms runtime-command bootstrap delay;
- nested 100 ms keybinding/sort delay;
- 100 ms spellchecker command registration delay.

No UX debounce, performance throttle, geometry rAF or persistence coalescing timer was removed.

Risks reviewed:

- Main-process bootstrap/close/project IPC listeners still install before awaiting the async command catalogue, preserving the cold-start race protection already documented in `app.vue`.
- Keybindings are no longer requested before the catalogue refresh, avoiding replacement of shortcut-bearing command objects after the response.
- No ARCH-06 Muya type boundary or ARCH-07 scheduler code was touched.

Next:

- Batch 1 is committed as an independently reviewable stage;
- preserve the explicit A/B/C/D inventory while ARCH-06/07 continue;
- after ARCH-06/07 merge, rebase and perform Batch 2/final boundary audit before any PR merge.

## Stage 5 — Regression Tests

Status: **Batch 1 green; full integration still pending final rebase/CI**.

Test-first evidence:

- Added fail-closed Node source-contract gate `scripts/arch08-legacy-patch-closure.test.mjs`.
- Baseline run: **0/3 passed, 3/3 failed exactly as intended**:
  1. command-center start occurred after editor bootstrap registration;
  2. editor bootstrap contained the 400 ms + 100 ms timeout chain;
  3. spellchecker registration contained a 100 ms timeout.
- After refining ownership, the gate also requires the keybinding request to live after command-catalogue refresh under command-center ownership.

Green evidence:

- `node --test scripts/arch08-legacy-patch-closure.test.mjs`: **4/4 passed**.
- Repeated race/timing gate: **20/20 complete runs passed**.
- Desktop typecheck using the canonical donor-tool fallback with the current worktree's `packages/desktop/tsconfig.json`: **passed**.

Environment evidence, not product evidence:

- `pnpm install --offline --frozen-lockfile --ignore-scripts` was observed as one Job for its full 600-second limit; it timed out with zero output and never created `node_modules`.
- Main-checkout donor root dependencies are incomplete; the donor Vitest launcher failed before test discovery because its own `tinyexec` package is missing. Per `docs/agent/ENVIRONMENT.md`, this is bootstrap evidence and is not counted as a red product test.
- Before ARCH-06 merged, donor `vue-tsc` successfully validated the current worktree. After ARCH-06 removed the desktop Muya shim, the same donor topology is no longer valid because its workspace symlink resolves `@muyajs/core` into the donor checkout's `packages/muya/src`. That post-rebase failure is environment topology evidence, not a product regression; final typecheck evidence must come from a worktree-local dependency graph or canonical CI.

Pending integration gates:

- worktree-local/final CI Vitest version of `legacy-patch-closure.spec.ts`;
- related command-center/editor startup unit suites;
- required renderer/Electron startup and race scenarios after final rebase;
- full required PR CI without threshold/assertion weakening.

## Stage 6 — Cleanup Batch 2 Preparation

Status: **blocked from destructive cleanup by active ARCH-06/07 dependencies; audit preparation complete**.

Current commit: `47e16a6b`.

Additional timing audit after Batch 1:

- The remaining editor-core timers are not mechanically removable. Snapshot coalescing, scroll persistence, geometry rAF reconciliation and performance sampling have explicit owners/contracts.
- `commands/index.ts::focusEditorAndExecute` is the most important unresolved arbitrary-timing path: a 10 ms delayed `editor-focus` followed by a 150 ms delayed edit action is used by undo/redo, paragraph, formatting and view commands.
- Evidence is insufficient to delete that helper safely because the command palette sets `showCommandPalette = false` immediately before invoking the command; focus/selection restoration may currently depend on dialog close timing. This remains class D until a deterministic `palette closed / editor focus ready` contract plus selection/IME/undo regression coverage is available.
- Product-specific PicGo detection timers and preference/i18n fallback polling were identified but are not promoted into architecture cleanup without cross-layer evidence. They belong in the post-governance product reliability roadmap unless the final audit changes that classification.

Dependency state at this stage:

- ARCH-06: active dirty worktree on `develop@7f1e1e94`, public Muya type-boundary changes not yet committed/merged.
- ARCH-07: active dirty worktree on `develop@7f1e1e94`, with another WebCodex session actively running validation Jobs.
- ARCH-08 does not modify either worktree and will not duplicate their cleanup.

Final Batch 2 entry condition:

1. ARCH-06 and ARCH-07 land on `develop`;
2. verify remote `develop` SHA;
3. rebase `arch/08-legacy-patch-closure`;
4. resolve only semantic conflicts, preserving ARCH-06 public boundary and ARCH-07 scheduler lifecycle/latest-wins contract;
5. repeat inventory and boundary gates before deleting any dependency-tagged item.

## Stage 7 — Architecture Review Preparation

Status: **preliminary review complete on pre-ARCH-06/07 baseline; final answers intentionally deferred until post-merge rebase**.

Current commit before this documentation update: `1699f0a9`.

| Closure question | Current evidence | Final gate after rebase |
| --- | --- | --- |
| ARCH-01 runtime ownership | `DocumentEditorRuntime` structural coverage exists in `document-editor-runtime.spec.ts` and `editor-switch-protection.spec.ts`; Batch 1 added no teardown/revision owner. | Re-run runtime/switch protection suites and inspect `editor.vue` lifecycle ownership. |
| ARCH-02 IPC boundary | Batch 1 changed renderer command startup only; it added no high-frequency IPC bridge. | Re-run IPC contract gates and inspect legacy high-frequency sync channels. |
| ARCH-03/04 surface/geometry ownership | Batch 1 added no geometry reads or virtualization-private calls; formal rAF/ResizeObserver reconciliation remains intact. | Re-run surface/geometry gates and inspect post-merge code for random geometry owners. |
| ARCH-05 typed event bus | Batch 1 uses the existing typed `cmd::register-command` contract instead of bypassing it. | Re-run event-bus/command-center type gates. |
| ARCH-06 public Muya boundary | Not answerable yet: ARCH-06 is not merged. | Run the ARCH-06 public-type boundary gate and reject restored permissive shims/private aliases. |
| ARCH-07 scheduler boundary | Not answerable yet: ARCH-07 is not merged. | Run lifecycle/latest-wins/settlement tests and reject background → DOM/editor-private ownership. |
| ARCH-08 timing/double ownership | Startup 400/100/100 ms correctness delays are removed; repeated gate passed 20/20. `focusEditorAndExecute` remains explicitly D. | Repeat full timing/ownership inventory and require replacement-contract evidence for any deletion. |

Preliminary boundary remains:

```text
UI
 ↓
DocumentEditorRuntime
 ↓
IDocumentSurface
 ↓
Editor Adapter / Muya

Geometry / Embedded Block / Persistence / Background Services / Release & Platform Services
```

Batch 1 introduced no UI → Muya private API, background → DOM, service → `editor.vue` internal-state shortcut, or random geometry owner.

Likely post-governance product/performance roadmap items unless final rebase changes the evidence:

- PicGo detection/retry state-machine timing;
- preference/i18n fallback polling/debug behavior;
- command-palette focus/selection readiness if closing it safely requires broader UI lifecycle work;
- performance/UX coalescing intervals with an explicit owner and measurable purpose.

The final Architecture Governance Closure Report must replace this preliminary matrix with evidence from the rebased tree and answer all seven requested closure questions explicitly.

## Stage 8 — Cleanup Batch 2 / Final Rebase

Status: **complete**.

Rebase evidence:

- Remote `develop` verified at `d9067f85fa203af0e4cabf2d84575cea958508d6`.
- PR #169 (ARCH-07) and PR #170 (ARCH-06) are merged.
- Local `develop` fast-forwarded from `7f1e1e94` to `d9067f85`.
- ARCH-08 rebased cleanly with no conflicts; current rebased head before final documentation changes: `d5a17b16`.

Dependency-driven cleanup result:

- ARCH-06 already removed the permissive desktop `@muyajs/core` declaration, `@marktext/muyajs` dependency, legacy `muya/*` aliases and compatibility bridge. Post-rebase repository search confirms no remaining desktop references.
- ARCH-07 already replaced background scheduler promise leakage / same-key overlap debt with explicit settlement, latest-wins single-flight and close lifecycle semantics. ARCH-08 does not reintroduce a second scheduler or background→DOM/editor shortcut.
- No additional dependency-tagged legacy patch can be safely deleted merely because 06/07 landed; existing UI/performance timers retain explicit ownership or remain class D pending a dedicated readiness contract.
- `commands/index.ts::focusEditorAndExecute` remains the highest-value unresolved arbitrary timing path. Evidence shows it protects command-palette focus-trap/selection restoration; removing it without an explicit dialog-closed/editor-focus-ready contract would violate the ARCH-08 rule “prove replacement before delete.” It is therefore moved to the post-governance interaction-correctness roadmap rather than force-cleaned here.

Post-rebase validation:

- `node --test scripts/muya-public-type-boundary.test.mjs scripts/arch08-legacy-patch-closure.test.mjs`: **5/5 passed**.
- ARCH-06 repository search: no desktop permissive Muya shim/legacy alias references.
- ARCH-07 canonical PR CI already passed unit, E2E, Desktop Fast hard gate, Windows/macOS builds without threshold/workload relaxation.
- Muya declaration-only build using the current worktree source/config and donor TypeScript binary: **passed**.
- Donor desktop `vue-tsc` is rejected as final evidence because donor workspace symlinks resolve Muya source through the donor checkout; this is explicitly classified as invalid topology in `docs/agent/ENVIRONMENT.md`. Canonical CI is required for final typecheck.

## Stage 9 — Architecture Review

Status: **complete; see `ARCH-08-ARCHITECTURE-GOVERNANCE-CLOSURE-REPORT.md`**.

Final review conclusion:

- ARCH-01 runtime/lifecycle ownership remains intact.
- ARCH-02 typed IPC remains intact.
- ARCH-03/04 surface/geometry ownership remains intact.
- ARCH-05 typed event bus remains intact; Batch 1 uses it as the replacement contract.
- ARCH-06 public Muya type boundary is present and legacy desktop shims are absent.
- ARCH-07 scheduler lifecycle/latest-wins contract is present and no generic scheduler was used to absorb autosave durability semantics.
- ARCH-08 removes proven startup correctness timers, preserves timers with explicit UX/performance/platform ownership, and records unresolved timing debt instead of deleting it without evidence.

## Stage 10 — CI Closure

Status: **complete on PR #171**.

Canonical CI evidence:

- `lint`: passed in 1m06s.
- `test`: passed in 2m27s; desktop Vitest reported **151/151 files and 1223/1223 tests passed**, including `legacy-patch-closure.spec.ts` **4/4 passed**.
- `e2e`: passed in 7m13s.
- Windows x64 build: passed in 6m10s.
- macOS arm64 build: passed in 4m04s.
- macOS x64 build: passed in 7m23s.
- artifact link publication: passed.
- Desktop PR fast hard gate: final attempt passed in 3m38s with all original hard thresholds intact.

Fast-gate incident record:

1. First attempt failed only at the final threshold evaluation: `save.50k p95=108.5ms` against the unchanged `<100ms` hard limit.
2. No save-pipeline code, threshold, workload, sample count or assertion was changed.
3. The immediately preceding ARCH-06 / ARCH-07 PRs had the same metric at approximately `41.48ms` and `91.75ms`, showing material CI tail-latency variance while both passed the unchanged gate.
4. One evidence-based rerun of only the failed workflow was allowed after diagnosis.
5. The rerun passed the desktop performance scenario and the unchanged hard-threshold evaluation.

No threshold, workload, sample-count or assertion relaxation was used.

## Stage 11 — Final Report / Experience Closure

Status: **documentation and CI closure complete; PR merge pending**.

- Final report: `docs/architecture/ARCH-08-ARCHITECTURE-GOVERNANCE-CLOSURE-REPORT.md`.
- Existing environment guidance was reviewed instead of duplicating rules.
- New concrete donor-symlink evidence was merged into `docs/agent/ENVIRONMENT.md`; `AGENTS.md` remains rules/index only.
- Product/performance follow-ups are separated from architecture governance in the closure report.

