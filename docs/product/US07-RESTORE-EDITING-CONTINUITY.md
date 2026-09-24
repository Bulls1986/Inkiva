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

## Acceptance mapping

| AC | Evidence / result |
| --- | --- |
| AC-33 | Existing document revision snapshot + buffered persistence path does not rebuild editor state; cursor persistence is separate from content/history. No production change was required. |
| AC-34 | Existing geometry compensates async block growth; this change closes the stale queued semantic-restore race by making active user interaction authoritative. |
| AC-35 | Existing US05 per-tab mode/cursor/scroll/semantic-anchor ownership remains intact; no global-mode fallback or new save/history trigger was introduced. |
| AC-36 | Existing per-buffer ordered queue plus atomic durable replacement remains authoritative; existing `buffer-store-restore` and `buffer-store-durable` tests cover coalescing/complete replacement. |

## Validation

- Isolated TypeScript check for `restoreInteractionFence.ts`: PASS on the final source (`typescript@6.0.3`, `--noEmit --target ES2022 --lib ES2022,DOM --skipLibCheck`).
- Focused Vitest: not runnable locally due dependency/bootstrap failures before discovery (`tinyexec` missing in donor graph); not classified as a product failure.
- Focused ESLint launcher is likewise unavailable in this slot (`pnpm exec eslint` cannot resolve the CLI), so no lint result is claimed.
- Desktop `vue-tsc` via donor dependencies reached compilation but is not a valid green gate: it resolves Muya from the main checkout and reports the known cross-worktree ambient/type failures (`__MUYA_BLOCK__`, `MUYA_VERSION`, file-icons, prism declarations). No reported error points at the US07 utility or changed editor lines.
- `git diff --check` reports the repository's documented Windows CRLF normalization signature on new `editor.vue` lines; a direct byte/text audit of all reported added lines found no literal trailing spaces or tabs. No line-ending rewrite was performed.
- Independent final diff review remained limited to the US07 editor integration, focused fence utility/test and this stage record; no prototype-specific UI was added.

## Learning review

1. Restore correctness needs a freshness rule, not only a target location. A semantically better target is still wrong after the user has expressed newer navigation intent.
2. Interaction freshness belongs at the delayed orchestration boundary. Geometry propagation should continue to own layout deltas; it should not be overloaded with session-restore policy.
3. Reuse existing document-owned state. US07 did not require another session store or any new visual surface.
4. Local test infrastructure that fails before discovery must stay classified as environment evidence. Do not repair it by weakening tests or borrowing source/build artifacts across worktrees.
