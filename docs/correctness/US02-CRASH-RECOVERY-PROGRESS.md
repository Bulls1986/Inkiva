# US02 / Crash Recovery Progress

## Scope

Implement v0.5.0 US-02 (AC-07 through AC-12): a crash-recovery decision flow that preserves the disk version until the user chooses what to do with a protected recovery revision.

The product-design prototype is reference material only. Existing Inkiva UI, interaction patterns, visual tokens, startup performance contracts, and current workspace behavior remain authoritative when they conflict with the prototype.

## Stage 1 — diagnosis and red contract

- Base: `develop@cd00adac96da54f8336751c4d731345f3725d9d8`
- Branch: `feat/us02-crash-recovery`
- Existing recovery infrastructure already provides atomic buffer writes, per-source corruption isolation, deterministic merge/deduplication, first-shell-before-recovery I/O, and a three-failure safe-restore guard.
- Gap: startup currently applies merged dirty recovery tabs directly via `applyRestorePlan`; skipped/corrupt sources are only logged; safe restore has no recovery-center affordance; there is no user-controlled disk-vs-recovery comparison/replacement boundary.
- Implementation direction: retain the complete merged state as the durable recovery source, derive an `automaticState` containing only safe/saved tabs for normal workspace restore, and expose dirty tabs plus damaged sources as pending recovery decisions.
- First focused regression contract is in `restore-plan.spec.ts`: dirty tabs must be present in `pendingTabs` while excluded from `automaticState`.

## Stage 2 — implementation

- `RestorePlan` now keeps the full durable recovery state while deriving `automaticState` for tabs that are safe to restore automatically and `pendingTabs` for unsaved crash revisions.
- When pending revisions exist, the new editor session deliberately keeps a fresh buffer identity. The previous recovery source remains owned by Recovery Center so ordinary renderer persistence cannot overwrite the protected revision before the user acts.
- Added a main-process `RecoveryCenterSession` plus typed IPC contract for listing recovery revisions, opening a recovery copy, guarded replacement, retrying damaged sources, per-item discard, and safe-mode workspace-state discard.
- Replacement is optimistic-concurrency guarded: Recovery Center hashes the disk version shown during comparison, rereads the file at commit time, aborts if the revision changed, snapshots the current disk version into Local History, then performs an atomic write.
- Corrupt recovery sources remain isolated and visible with retry / show location / explicit discard actions.

## Stage 3 — product flow and safe mode

- Added an existing-style recovery banner and Element Plus dialog without replacing Inkiva's current editor, tab, or visual system.
- Recovery comparison exposes file name/path, recovery time, current disk content, and recovery content. Opening as a new document leaves the disk file untouched and labels the new tab as a recovery copy that has not been saved as a file yet.
- Recovery is also reachable from the existing File menu after the startup banner is dismissed.
- After the existing three-failure SafeRestoreGuard enters safe mode, Inkiva starts with a blank layout and Recovery Center exposes explicit choices to inspect recovery content, continue using the blank layout, or discard the previous workspace recovery state with a second confirmation.

## Acceptance mapping

- **AC-07:** dirty V2 is never written over disk V1 during startup; user action is required.
- **AC-08:** Recovery Center shows filename/path, recovery timestamp, disk V1 and recovery V2 previews, plus damaged-source diagnostics.
- **AC-09:** opening V2 as a new document does not consume recovery state or modify V1; the editor shows `从 xxx.md 的恢复稿打开 · 尚未另存为`.
- **AC-10:** replacement requires confirmation, rereads/hash-checks disk state, blocks external V3, snapshots V1 to Local History, then atomically writes V2.
- **AC-11:** damaged sources are isolated; retry/show-location/discard are available and discard is explicitly confirmed by the UI.
- **AC-12:** the existing three-consecutive-failure guard continues to trigger safe startup; Recovery Center now supplies explicit blank-layout / recovery inspection / discard-workspace actions.

## Validation evidence

- Focused restore-plan red contract was observed before implementation: the new `automaticState` assertion failed while the pre-existing restore tests remained green.
- Final focused recovery correctness suite: **8/8** passed (`restore-plan.spec.ts` + `recovery-center.spec.ts`).
- Final recovery/safe-restore regression group: **28/28** passed across six unit specs.
- Final current-worktree Electron build passed. A known Vite reporter warning remains for the pre-existing mixed dynamic/static keyboard import.
- Final real Electron `restore-buffer-store.spec.ts`: **4/4** passed, including the V1/V2 protected-recovery decision flow. One earlier run overlapped a duplicate build Job and transiently failed to find `out/renderer/index.html`; after the build completed, the same E2E suite passed without product changes.
- Locale JSON parse check passed for all locale files; `git diff --check` passed.
- Full desktop typecheck is not a valid green gate in the current baseline because of pre-existing Muya declaration/type debt. A changed-path diagnostic filter produced no US02-file diagnostics; this limitation must not be reported as a repository-wide typecheck pass.

## Final closeout

- Product implementation and AC-07 through AC-12 validation are complete locally.
- Stage record and separate engineering-lessons document are complete.
- Remaining repository actions: commit the reviewed file set, publish the task branch, open the PR, then follow required CI/merge policy.
