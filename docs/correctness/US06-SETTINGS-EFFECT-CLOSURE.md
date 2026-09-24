# US06 — Settings effect closure

## Status

Implementation complete on `feat/v0.5-us06`, rebased onto `develop` at `c54a03e`, with post-rebase local build and Electron functional validation passing. Normal PR/CI remains required before merge.

## Product contract

US06 exists to remove the Settings split-brain failure mode where the visible control, renderer state, persisted electron-store value, and actual application effect can disagree.

The prototype supplied with the v0.5 design package was used only to confirm the intended information hierarchy. Inkiva's current standalone Settings window, category navigation, controls, design tokens and spacing remain authoritative.

Acceptance mapping:

- **AC-28** — immediate font/font-size/theme changes keep UI, live editor/application effect, Settings reopen and restart values aligned; second interaction remains supported by the existing functional gate.
- **AC-29** — controls expose effect timing; `titleBarStyle` and startup/layout restore choices are explicitly restart-scoped instead of being described as immediate. After a successful restart-scoped mutation, the affected common control exposes an `退出 Inkiva` / `Quit Inkiva` action that reuses the existing protected quit path rather than adding an unsafe relaunch shortcut.
- **AC-30** — Settings uses an acknowledged renderer-to-main mutation. Main rejects invalid values or electron-store failures, renderer restores the previous value, and common controls surface `未保存设置 · 重试` / `Not saved · Retry`.
- **AC-31** — `autoSaveDelay` is constrained to `1000..10000 ms` at the schema and authoritative write path. Autosave remains per-document; a replacement schedule clears only that document's previous timer.
- **AC-32** — successful main-process writes reuse the existing `broadcast-preferences-changed` path, which fans changes out to every live Inkiva window through `mt::user-preference`. No second preference synchronization mechanism was introduced.

## Implementation decisions

### 1. Acknowledge the existing preference path instead of adding another store

The old Settings action optimistically mutated Pinia and sent `mt::set-user-preference` fire-and-forget. That transport could not distinguish persistence success from failure.

US06 adds typed `mt::preferences::set` invoke/return semantics, backed by the same `Preference` class and the same electron-store instance. The legacy send listener still delegates to the same `setItemsAcknowledged` implementation for existing non-Settings callers.

This keeps one facts source and one broadcast path:

`Settings control -> Pinia optimistic preview -> acknowledged main Preference write -> electron-store -> broadcast-preferences-changed -> all renderer windows`

On failure the path terminates before broadcast and the originating Pinia value is restored.

### 2. Keep effect feedback inside existing controls

The existing Bool/Range/Select/Text/Font controls gained a compact effect-status line and local retry state. Restart-scoped controls only expose the quit action after an acknowledged successful change. Invalid text that fails the control-local format guard is restored to the last valid value on blur instead of leaving the field visually split from the authoritative setting. No prototype-specific settings cards or alternate page shell were introduced. Disabled/under-development controls do not claim an effect timing.

Theme cards and Custom CSS are custom controls rather than common leaf controls, so they use the same mutation helper and effect status without changing the theme-grid layout.

### 3. Search targets the setting instead of its value

The Settings sidebar search still uses the existing translated schema index. After routing, it finds the rendered description matching the selected result, focuses the owning section, scrolls it into view, and applies a short focus-ring highlight. The search model is cleared immediately, so the selected query cannot leak into a setting input.

### 4. Autosave correctness stays in AutosaveQueue

US06 does not invent a new autosave timer. `AutosaveQueue.schedule` already owns per-document debounce by document id and clears only the prior timer for the same entry. The new regression covers the product requirement directly: changing the scheduled delay for doc-1 must not alter doc-2, and doc-1 must fire at the latest requested delay/revision.

## Test-first evidence

Focused tests were added before production changes for:

- typed acknowledged Settings mutation contract;
- renderer rollback after a failed acknowledged mutation;
- autosave delay replacement and document isolation.

The first local unit-test command did not reach Vitest discovery because the reused worktree had no package-local Vitest launcher. A donor Vitest probe later failed before discovery because its `tinyexec` payload was incomplete. Both signatures are explicitly classified by `docs/agent/ENVIRONMENT_RECIPES.md` as environment/bootstrap evidence, not product red tests, so no further Vitest retry variants were launched.

## Validation evidence

Local evidence before base synchronization:

- current-worktree Electron build: **PASS** (`electron-vite build`);
- focused restart-scoped settings flow: **1/1 PASS**;
- Settings + writing-area Electron functional gate: **6/6 PASS** using one worker and current-worktree build output;
- the first full Electron rerun had one existing font/restart case exceed the global 30 s Playwright timeout; the identical focused case then passed in 16.0 s, and the final full gate passed all 6 cases, so this was treated as runner timing variance rather than a product regression;
- focused Vitest contracts: **not executed locally** because package-local Vitest is absent and the documented donor probe is unhealthy (`tinyexec/index.js` missing before discovery);
- desktop `vue-tsc`: the worktree package-local launcher is absent. A donor `vue-tsc` probe reached current-worktree source but is not comparable with latest `develop`, whose donor topology expands into Muya source and produces known boundary/type errors. Per the environment contract this is not used as US06 product evidence.

Post-rebase evidence on `develop` `c54a03e`:

- rebase conflict scope: one typed IPC contract overlap; Recovery Center invoke channels from `develop` and US06 `mt::preferences::set` were both preserved;
- current-worktree Electron build: **PASS** (`electron-vite build`, 44.14 s);
- Settings + writing-area Electron functional gate: **6/6 PASS** using one worker and the post-rebase current-worktree build output (42.9 s);
- `git diff --check`: **PASS** before synchronization; final hygiene is rechecked after this record update.

## Architecture review

- No new persistent preference store.
- No duplicate cross-window event bus.
- Main/preload/renderer boundary remains typed through `src/shared/types/ipc.ts`.
- Existing Settings page/navigation and current visual baseline remain in place.
- Existing `mt::set-user-preference` compatibility listener delegates to the same authoritative writer rather than creating a separate implementation.
- The v0.5 prototype does not overwrite current UI.

## Learning review

1. A persisted setting needs an acknowledgement contract if failure recovery is part of UX. Fire-and-forget is insufficient even when the happy path appears correct.
2. Cross-window correctness should reuse the already authoritative main-process fan-out instead of synchronizing renderer stores peer-to-peer.
3. Effect timing belongs to the control contract, not ad-hoc notes. Default-live controls can share a primitive; restart/reopen controls must opt into a non-live classification explicitly.
4. Search navigation correctness is independent from search result correctness: finding the right item is not enough unless the UI lands on and focuses that actual control.
5. Existing autosave ownership was already correct; AC-31 needed a regression test and authoritative range validation, not a queue rewrite.
6. The environment recipe already covers missing package-local Vitest, incomplete donor `tinyexec`, and donor typecheck topology leakage. US06 reused those rules instead of adding duplicate environment guidance.
7. Restart-scoped preferences must not be asserted against a live editor store when the architecture intentionally withholds them from the live broadcast. The correct observable contract is acknowledged persistence in Settings plus explicit delayed-effect feedback.
8. Local format rejection and persistence failure are different UX states: local invalid text should restore the last valid value; only an attempted acknowledged mutation that fails persistence/authoritative validation should expose retry.
