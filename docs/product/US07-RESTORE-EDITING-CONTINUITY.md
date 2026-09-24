# US07 — Restore Editing Continuity

> Status: implementation complete locally; branch `feat/v0.5-us07`
> Scope: Inkiva v0.5.0 US-07 / AC-33–36

## Goal

Preserve the user's current editing/reading context while persistence, history, session restore, layout restore and asynchronous geometry work occur. The prototype is treated as interaction reference only; no prototype-specific toolbar/banner UI is introduced.

## Stage 1 — Contract and existing-capability audit

US07 was mapped to the existing document-owned restore/durability architecture before production changes.

- AC-33 already uses document revisions and `DocumentEditorRuntime` snapshots; buffered-state persistence serializes state without rebuilding the editor, and cursor changes are persisted independently of content/history mutation.
- AC-34 already has geometry propagation through `editorLayoutReconciler`, including block-growth compensation above the viewport and explicit scroll ownership between desktop, document surface and pending pixel restore.
- AC-35 is largely owned by US05: source/WYSIWYG mode, semantic viewport anchor, cursor and scroll state are document/tab-owned; switching a tab applies the target mode without mutating the new-document preference.
- AC-36 already has ordered recovery-buffer writes plus durable atomic replacement (`write-file-atomic`); existing tests cover coalesced writes and complete JSON replacement.

One concrete AC-34 gap remained: semantic viewport restore waits for progressive rendering and then calls `scrollToHeader`. Unlike the pixel-offset restore path, that queued semantic callback had no user-interaction freshness fence. A user action made while the callback was pending could therefore be followed by a stale restore decision.

## Stage 2 — Focused regression definition

Added `restore-interaction-fence.spec.ts` to define the missing contract: wheel, touch, mouse/pointer and keyboard interaction invalidate a previously captured restore token; destroying the fence removes its listeners.

Local Vitest execution could not provide product-red evidence in this worktree:

- the normal worktree command timed out before test discovery;
- direct invocation of the donor Vitest failed before discovery because the donor dependency graph is missing `tinyexec`.

Per `AGENTS.md` / `TESTING.md`, both are environment evidence, not a product test result. No assertions or scenarios were weakened.

## Stage 3 — Implementation

Added `createRestoreInteractionFence` as a small renderer utility and integrated it only at the semantic viewport-restore scheduling boundary.

- The editor captures an interaction generation when semantic restore is queued.
- Any explicit wheel/touch/mouse/pointer/keyboard action increments the generation.
- The render-complete callback checks the captured generation before applying the stored heading/offset.
- A stale callback only reveals the editor and marks command context ready; it does not scroll to the old location.
- The fence is disposed with the editor lifecycle.
- Existing UI, tab state ownership, geometry propagation and pixel restore behavior are unchanged.

This keeps the fix at the orchestration boundary where the race occurs instead of adding timers, debounce guesses, component-specific image/Mermaid patches, or another restore state store.

## Stage 4 — Integrate latest develop / converge with US09

Before PR closure, `develop` advanced with US02 and US09. The only merge conflict was in `editor.vue`.

US09 had independently generalized the same freshness requirement behind `editorInteractionRevision` and `runWhenEditorRenderCompleteUnlessUserMoved`, and applied it consistently to delayed caret, Source handoff and semantic viewport restoration. Keeping the US07-specific `createRestoreInteractionFence` beside that mechanism would create two interaction-revision authorities and duplicate listeners.

The conflict was therefore resolved by architectural convergence rather than choosing one side wholesale:

- keep US09's single editor interaction revision and render-complete freshness boundary;
- use that boundary for US07 semantic viewport restoration;
- remove the redundant US07-only fence utility and its unit test;
- retain US07's acceptance/engineering record and validate the combined contract against restore, durability, runtime, geometry and US09 selection/caret coverage.

No US07 behavior was dropped: active user wheel/touch/mouse/pointer/keyboard intent still invalidates stale delayed restoration, but now through the shared editor-level contract.

## Acceptance mapping

| AC | Evidence / result |
| --- | --- |
| AC-33 | Existing document revision snapshot + buffered persistence path does not rebuild editor state; cursor persistence is separate from content/history. No production change was required. |
| AC-34 | Existing geometry compensates async block growth; this change closes the stale queued semantic-restore race by making active user interaction authoritative. |
| AC-35 | Existing US05 per-tab mode/cursor/scroll/semantic-anchor ownership remains intact; no global-mode fallback or new save/history trigger was introduced. |
| AC-36 | Existing per-buffer ordered queue plus atomic durable replacement remains authoritative; existing `buffer-store-restore` and `buffer-store-durable` tests cover coalescing/complete replacement. |

## Validation

Pre-integration evidence established the original US07 gap and implementation: restore/durability **19/19 PASS**, runtime/geometry **18/18 PASS**, changed-files ESLint PASS and CRLF-aware diff check PASS.

Final closure validation after integrating latest `develop` is authoritative:

- integrated unit regression: **7 files / 42 tests PASS**, covering US09 interaction freshness, workspace restore isolation, recovery buffer merge/durability, `DocumentEditorRuntime`, geometry reconciliation and Recovery Center;
- current-worktree Electron build: PASS;
- recovery Electron E2E: **4/4 PASS** after the current-worktree build, covering deduplicated recovery restore, dirty recovery decision flow, corrupt recovery tolerance and duplicate-open suppression;
- the first E2E attempt before building this worktree failed only at `electron.launch`; per the documented E2E evidence ladder that was environment/build evidence, not a product failure;
- Desktop `vue-tsc --noEmit` remains a known baseline failure: the identical Muya ambient/type-declaration errors reproduce on clean `develop`, so they are not attributable to US07.

## Learning review

1. Restore correctness needs a freshness rule, not only a target location. A semantically better target is still wrong after the user has expressed newer navigation intent.
2. Interaction freshness belongs at the delayed orchestration boundary. Geometry propagation should continue to own layout deltas; it should not be overloaded with session-restore policy.
3. Reuse existing document-owned state. US07 did not require another session store or any new visual surface.
4. Local test infrastructure that fails before discovery must stay classified as environment evidence. Do not repair it by weakening tests or borrowing source/build artifacts across worktrees.
5. Parallel stories may converge on the same contract. When a newer story introduces the more general boundary, remove the narrower duplicate rather than preserving both for story ownership; acceptance belongs to behavior, not to duplicate implementation.
