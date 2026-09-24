# US-01 / Content Safety — Implementation Record

Date: 2026-09-24  
Branch: `feat/us01-content-safety`  
Base: `origin/develop@cd00ada`

## Product rule

The v0.5.0 prototype is reference material only. Existing Inkiva UI and interaction behavior remain authoritative where the prototype conflicts with already shipped functionality.

US-01 therefore evolves the existing title-bar save indicator, General > Auto Save controls, and native close dialogs. It does not add the prototype editor toolbar or introduce a parallel visual language.

## Durability contract

Inkiva now models the latest document revision with three confirmation states:

- D1 / `unprotected`: the latest edit exists in memory but neither recovery storage nor the Markdown file has confirmed that exact revision.
- D2 / `protected`: Inkiva recovery storage has confirmed the exact latest revision, but the target Markdown file has not.
- D0 / `saved`: the target Markdown file has confirmed the exact latest revision.

A completion for an older revision can never advance a newer revision to D2 or D0.

The existing per-document `AutosaveQueue` remains the file-write authority. Explicit save of an existing path also goes through that queue so Ctrl+S cannot race an older in-flight autosave. Autosave/recovery durability is not moved into the generic cancellable background scheduler.

## Implementation

- Added a small per-document durability state machine in `documentDurability.ts`.
- Recovery protection is acknowledged only after `update-buffer-state` resolves `true`. The shared IPC contract was corrected from `void` to `boolean` to match the main-process implementation.
- File save success/failure IPC now carries the document revision end-to-end.
- Auto Save off continues to leave the Markdown file untouched while recovery persistence can independently reach D2.
- Existing title-bar save status now renders “已保存到文件 / 仅在 Inkiva 中已保护 / 尚未保护” without introducing new toolbar UI.
- General > Auto Save keeps the existing switch and 1–10 second delay control and adds explanatory copy.
- Recovery/file write failure never produces a false D2/D0. Recovery failure uses the existing per-tab critical notification surface.
- Unsaved close now distinguishes Save / Keep for Recovery / Discard Changes / Cancel.
- “Keep for Recovery” persists an explicit retained draft and closes the tab only after recovery storage confirms the snapshot. A failure keeps the tab open and editable.
- Whole-window “Keep for Recovery” forces the latest editor snapshot into recovery storage and only then closes the window.
- “Discard Changes” requires a second confirmation and bypasses the reopen-closed stack, so an explicitly discarded draft is not resurrected by Reopen Closed Tab.
- Window close after a save failure no longer offers a force-close path. The failed document stays open.
- All save-all / close payloads carry revision numbers so two dirty documents remain independently correlated.

## Acceptance evidence

- AC-01: per-document queue + revision-correlated file acknowledgements; stale acknowledgements covered by focused tests.
- AC-02: recovery confirmation is independent from Auto Save and file persistence; D2 can be reached without writing the Markdown file.
- AC-03: recovery/file failures retain D1/D2 as appropriate, surface an error, and do not mutate editor content.
- AC-04: durability state is keyed by tab id; focused tests cover out-of-order A/B acknowledgements.
- AC-05: durability acknowledgements update store metadata only. They do not call Muya content, selection, scroll, IME, or history mutation APIs and therefore do not create Undo entries.
- AC-06: retain-close waits for recovery confirmation; explicit discard is secondary-confirmed and bypasses reopen retention.
- AC-73 boundary: save failures propagate instead of being swallowed; whole-window close stays open when any latest-revision save fails or Save As is canceled.

## Validation

Focused red/green TDD:
- Initial durability test failed because the durability module did not exist.
- `document-durability.spec.ts`: 5/5 passed.
- `autosave-queue.spec.ts`: 5/5 passed.
- `ipc-contract-closure.spec.ts`: 6/6 passed.
- Combined focused suite: 16/16 passed.

Formatting:
- Project Prettier applied to all changed source/localization files.

Type validation:
- `pnpm -C packages/desktop exec vue-tsc --noEmit` still exits 2 only on the repository's pre-existing Muya type baseline (for example `__MUYA_BLOCK__`, `MUYA_VERSION`, FileIcons, sequence/prism declarations). No US-01 changed-file error remains after the IPC return type fix.

Environment note:
- Store tests that import the full renderer graph can hit Vite `Denied ID ...other-worktree...` because this reused worktree currently resolves dependencies through another checkout. Per `docs/agent/ENVIRONMENT_RECIPES.md`, that topology is invalid evidence and must not be “fixed” by widening Vite allowlists.

## Lessons

1. “Saved” is a revision acknowledgement, not a boolean side effect of requesting a write.
2. Recovery durability and file durability are separate contracts and need separate revision watermarks.
3. Explicit Save must join the same per-document write serialization boundary as Auto Save; otherwise Ctrl+S can race an older autosave and regress disk contents.
4. A close decision is also a durability transaction. Retain must confirm persistence before close; discard must be explicit and must delete/bypass every resurrection path.
5. Existing UI should carry new correctness semantics whenever it already has the appropriate affordance. For US-01, the title-bar status and native close dialog were sufficient; prototype-only editor chrome was unnecessary.
