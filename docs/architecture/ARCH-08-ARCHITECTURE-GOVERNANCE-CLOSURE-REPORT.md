# ARCH-08 — Architecture Governance Closure Report

## Executive conclusion

ARCH-01 through ARCH-08 now form a coherent architecture baseline for Inkiva. The final boundary is:

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

ARCH-08 closes proven legacy timing debt and validates that the previous governance work remains intact. It deliberately does **not** delete every timer, guard or compatibility workaround. Items are removed only when a formal replacement contract and regression evidence exist.

Final base reviewed: `develop@d9067f85fa203af0e4cabf2d84575cea958508d6` plus rebased ARCH-08 changes.

## 1. Do ARCH-01 through ARCH-08 boundaries still hold?

**Yes, within their defined scopes.**

- **ARCH-01 — DocumentEditorRuntime:** editor lifecycle, mutation/revision coordination and ordered teardown remain runtime-owned. ARCH-08 introduces no competing lifecycle owner.
- **ARCH-02 — IPC contract:** ARCH-06 corrected the image-path IPC type mismatch at the shared boundary instead of adding a renderer workaround; ARCH-08 adds no new high-frequency IPC shortcut.
- **ARCH-03 — IDocumentSurface:** virtualization/render access remains behind the surface contract.
- **ARCH-04 — Geometry ownership:** async block resize/geometry propagation remains centralized; ARCH-08 retains the rAF/ResizeObserver reconciliation that belongs to that contract.
- **ARCH-05 — Typed event bus:** command startup cleanup uses the typed `cmd::register-command` contract rather than direct component coupling.
- **ARCH-06 — Muya public boundary:** desktop now consumes Muya's real public declarations; permissive desktop declarations, `@marktext/muyajs`, legacy `muya/*` aliases and the compatibility bridge are removed.
- **ARCH-07 — Background scheduler:** queued settlement, same-key latest-wins single-flight and close semantics are explicit; unrelated async work remains non-blocking and autosave remains outside the generic scheduler.
- **ARCH-08 — Legacy patch closure:** command startup no longer depends on 400/100/100 ms arbitrary timing. Remaining timers are classified by ownership rather than mechanically deleted.

## 2. Are there still obvious cross-layer dependencies?

No new high-risk shortcut was found in the final rebased audit.

The review specifically found no reintroduced:

- UI → Muya private API shortcut;
- background service → DOM/editor-private state shortcut;
- service → `editor.vue` internal-state ownership;
- random component taking over document geometry ownership;
- second scheduler path competing with ARCH-07;
- desktop-owned fake Muya type surface.

Some components still legitimately perform local DOM work for focus, layout presentation or navigation. Those are not document-geometry ownership by themselves and remain bounded to UI concerns.

## 3. Is there still high-risk private API leakage?

The prior highest-risk type leakage is closed by ARCH-06.

Repository checks after the final rebase show no desktop `declare module '@muyajs/core'`, no `@marktext/muyajs` dependency use and no legacy `muya/*` alias use.

Muya itself still contains internal DOM/block implementation details such as `__MUYA_BLOCK__`; these are inside the editor package implementation and are not desktop public-boundary leakage. Future Muya refactoring can improve those internals independently without reopening the desktop boundary.

## 4. Does correctness still depend on arbitrary timeout?

One important unresolved path remains:

`commands/index.ts::focusEditorAndExecute` uses a 10 ms delayed editor focus and a 150 ms delayed action for undo/redo, paragraph, formatting and several view commands.

ARCH-08 does **not** claim this is resolved. Audit evidence shows the command palette closes immediately before executing a command, while Element Plus focus-trap behavior and editor selection restoration interact with that close lifecycle. There is not yet a deterministic `dialog closed → editor focus ready → command execute` contract.

This is therefore a known follow-up, not hidden architecture debt. It should be replaced only with:

1. explicit dialog-closed lifecycle;
2. editor focus/selection readiness acknowledgement;
3. command execution after that acknowledgement;
4. regression coverage for selection, IME, undo/redo and command-palette invocation.

Other surviving timers are primarily UX debounce, cooperative yielding, performance sampling, persistence coalescing, platform compatibility or formally owned geometry scheduling.

## 5. Is there still double ownership?

No systemic double ownership was found in the final governed areas.

The intended owners are:

| Concern | Owner |
| --- | --- |
| editor lifecycle / teardown / revision | `DocumentEditorRuntime` |
| render access / virtualization surface | `IDocumentSurface` |
| geometry propagation | geometry/surface contract |
| Muya implementation | editor adapter / Muya public boundary |
| save durability | persistence/autosave pipeline |
| generic background work | ARCH-07 scheduler |
| command registry | command-center + typed bus |
| platform/release compatibility | platform/release services |

ARCH-08 Batch 1 specifically removed duplicated startup timing ownership between editor bootstrap and command-center readiness.

## 6. What must enter the next governance stage?

No immediate “ARCH-09” architecture rescue is required from the evidence in this audit.

The most important follow-up correctness item is the command-palette focus/readiness path described above. It is narrow enough to be treated as an interaction-correctness task rather than reopening broad editor architecture governance.

Other deferred items should be handled only if product evidence justifies them:

- source-mode scroll restoration's immediate + nextTick + rAF sequence;
- fresh-editor focus rAF;
- PicGo detection/retry state machine;
- preference/i18n fallback polling;
- legacy Electron workarounds when upstream version evidence proves them obsolete.

## 7. What now belongs to product/performance roadmap rather than architecture governance?

The following are no longer reasons to keep the architecture-governance program open:

- PicGo detection/retry UX and reliability;
- preference/debug/i18n fallback behavior;
- UX loading-message/reveal debounces;
- search debounce and cooperative workspace-search yielding;
- performance sampling and telemetry timers;
- further FPS/startup/save optimization under existing contracts;
- internal Muya implementation cleanup that does not leak through the public boundary.

These should be prioritized through product correctness, reliability or performance roadmaps with their own measurable success criteria.

## ARCH-08 concrete cleanup

ARCH-08 replaces command startup timing guesses with an explicit readiness sequence:

```text
install command-center listeners
        ↓
register early editor/runtime commands
        ↓
await translated/static command catalogue
        ↓
request/apply user keybindings
```

Removed correctness delays:

- 400 ms editor runtime-command registration delay;
- nested 100 ms keybinding/sort delay;
- 100 ms spellchecker command registration delay.

Regression evidence:

- pre-fix source contract: 3/3 assertions failed as intended;
- post-fix source contract: 4/4 passed;
- repeated source contract: 20/20 complete runs passed;
- post-ARCH-06/07 rebase combined architecture source contracts: 5/5 passed.

## Validation and CI boundary

Local validation accepted:

- ARCH-06 public-boundary Node contract;
- ARCH-08 timing/readiness Node contract;
- repeated race/timing contract;
- current-worktree Muya declaration-only build.

A donor `vue-tsc` run after ARCH-06 is **not accepted** as product evidence because the donor workspace symlink resolves `@muyajs/core` back into the donor checkout. This violates the repository's source-ownership rule and is now explicitly documented in `docs/agent/ENVIRONMENT.md`.

PR #171 supplied the canonical validation boundary:

- lint passed;
- desktop/unit test workflow passed, including `legacy-patch-closure.spec.ts` 4/4 and the full desktop Vitest result of 151 files / 1223 tests passed;
- Electron E2E passed;
- Windows x64, macOS arm64 and macOS x64 build checks passed;
- Desktop PR fast hard gate passed with its original hard thresholds.

The first Fast Gate attempt observed `save.50k p95=108.5ms` against the unchanged `<100ms` limit. ARCH-08 does not touch the save pipeline, and the two immediately preceding architecture PRs showed the same metric at approximately 41.48ms and 91.75ms. After diagnosis, exactly one rerun of the failed workflow was performed with **no code, threshold, workload, sample-count or assertion change**; the second attempt passed. The failed first sample remains recorded as CI tail-latency evidence rather than being hidden or used to justify threshold weakening.

## Governance status

PR #171 was squash-merged into `develop` at `2026-09-22T18:28:14Z` as commit `9df067102864b247dd488687dda49c4f78c43edb`. The post-merge `develop` tree `18a1c9a155e8436f6c29be5697b970057d9133f0` exactly matches the final reviewed ARCH-08 PR tree. The architecture-governance program is therefore **closed as the repository baseline**.

Future work should preserve these contracts rather than create another parallel ownership layer. New architectural work is justified only when product evidence demonstrates that an existing boundary cannot support a required capability.
