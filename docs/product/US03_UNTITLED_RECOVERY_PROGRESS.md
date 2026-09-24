# US03 / Untitled Draft Crash Recovery — Progress

## Scope

Inkiva v0.5.0 US03 protects the **untitled / write-before-naming** workflow after an abnormal exit.

- Keep each recoverable untitled draft as an independent item, even when default titles are identical.
- Preserve recovery ordering from the buffered tab order.
- Do not silently open pending untitled drafts as ordinary tabs during startup.
- The primary recovery action is **restore into a new tab**; normal Save As remains the existing follow-up workflow.
- A restored draft must move out of the pending-recovery set so a later successful buffer write cannot persist both the pending candidate and the restored tab.
- Prototype visuals are reference only. Existing Inkiva layout, controls, and design tokens remain authoritative.

## Stage 1 — Baseline / RED

Branch: `feat/v0.5-us03`

Base: `develop@edbe2792291253702bf018d2f89aaf2e2e03c778`

Focused regression test: `packages/desktop/test/unit/specs/untitled-recovery.spec.ts`

Observed product failures after the test runner entered the test body:

1. Two untitled recovery tabs were restored directly into the visible tab list (`['', '/docs/saved.md', '']`) instead of remaining separate pending recovery candidates.
2. `RESTORE_UNTITLED_RECOVERY` did not exist, so there was no explicit “restore to new tab” transition.

Environment note: the reused worktree initially lacked a local dependency graph. Donor Vitest attempts were rejected because Vite detected cross-worktree realpaths. The canonical offline worktree-local install (`pnpm install --offline --frozen-lockfile --ignore-scripts`) completed successfully before collecting the RED evidence. This is already covered by `docs/agent/ENVIRONMENT.md`; no new environment rule is needed.

## Next

Implement the smallest recovery-state transition that separates pending untitled drafts from normal restored tabs, preserves their order, and atomically removes a candidate from pending state when restoring it into a new unsaved tab. Then make the focused test green before adding UI.

## Stage 2 — Core recovery transition / GREEN

Implemented in `packages/desktop/src/renderer/src/store/editor.ts`:

- abnormal-exit untitled buffers (`pathname === '' && isSaved === false`) are partitioned from normal startup tabs;
- each pending draft preserves its own id/content and original buffered-tab index;
- `CREATE_BUFFERED_STATE` reinserts unresolved pending drafts into the persisted snapshot, so dismissing the recovery UI cannot silently discard them;
- each serialized buffer tab records `protectedAt`, which represents the snapshot timestamp that can actually be observed after a successful prior write;
- `RESTORE_UNTITLED_RECOVERY` creates a new uniquely named untitled tab, removes exactly one candidate from pending state, emits the normal file-loaded path, then awaits a buffer write so the same content is not persisted both as pending recovery and as an active recovered tab.

Focused validation: `untitled-recovery.spec.ts` — **2/2 passed** after the implementation.

## Next

Add the user-facing recovery center as an additive overlay using existing Inkiva design tokens and interaction conventions. The prototype remains informational; existing tabs/editor/sidebar layout is not replaced or restyled.

## Stage 3 — Recovery center / validation

Added `components/recovery/untitledRecoveryCenter.vue` and mounted it at the existing application root without changing the established editor/sidebar/tab composition.

The recovery center provides:

- one row per recoverable untitled draft, including drafts with identical default names;
- confirmed protected-version time, word count, byte size, and a bounded content preview;
- an explicit **Restore to New Tab** primary action;
- a **Later** action that only dismisses the overlay for the current session and does not remove the recovery candidate;
- guidance to use Inkiva's existing **Save As** command after recovery rather than introducing a parallel save workflow;
- English and Simplified Chinese strings, with existing i18n fallback behavior for other locales;
- existing Inkiva design tokens (`surface`, `border`, `accent`, radius/elevation/font tokens) rather than prototype-specific styling.

Validation evidence:

- focused US03 regression + UI contract: **2 files / 3 tests passed**;
- changed-file ESLint including locale JSON: **0 errors**; two pre-existing `editor.ts` non-null-assertion warnings remain outside the US03 hunks;
- `pnpm -C packages/desktop build`: **passed**;
- `pnpm -C packages/desktop typecheck`: blocked by existing Muya baseline errors (`__MUYA_BLOCK__` HTMLElement typing, `MUYA_VERSION`, FileIcons declarations, sequence/prism declarations, and readonly Promise typing). No US03 path appeared in the typecheck error set.

## Lessons / closeout

1. Crash-buffer persistence was already sufficient for untitled content; the missing product layer was a recoverable **pending state** distinct from ordinary open tabs. Reusing the buffer contract avoided another persistence subsystem.
2. A recovery action must be modeled as a state transition (`pending recovery -> normal unsaved tab`) and persisted immediately. Treating it as merely “open a copy” risks duplicate recovery entries on the next startup.
3. The time shown to users must be the timestamp of a persisted recovery snapshot, not an inferred “latest keystroke” timestamp. This keeps AC-14 honest when the final write was never confirmed.
4. Prototype recovery visuals are not a new visual baseline. The implementation follows the current Inkiva shell and design-token vocabulary.
5. The worktree dependency issue encountered here is already covered by `docs/agent/ENVIRONMENT.md`; no duplicate environment lesson was added.

US03 is implementation-complete and ready for final workspace review/commit. Full project typecheck remains a pre-existing baseline blocker, not a US03 regression.
