# US08 — Input / IME Continuity

## Scope

Inkiva v0.5.0 US08 makes ordinary keyboard input, Markdown trigger conversion, auto-pair behavior, and CJK IME composition behave as one continuous editing path without introducing new editor chrome.

The supplied prototype is an interaction reference only. Existing Inkiva UI, components, layout, and visual language remain authoritative.

Authoritative acceptance scope:

- AC-37: continuous mixed-language typing with Enter/Backspace does not lose, duplicate, reorder, or cross-contaminate text and does not jump the logical caret;
- AC-38: heading, quote, unordered/ordered list, and code-fence triggers convert without swallowing the immediately following character; Undo/Redo preserves understandable operation boundaries;
- AC-39: CJK composition remains inert with respect to Markdown conversion/formatting until commit, and commit inserts only confirmed text;
- AC-40: auto-pair preferences, selection wrapping, and typing over generated closers remain live and predictable.

## 2026-09-24 — Stage 1: diagnosis and red-contract definition

Read `AGENTS.md` plus the relevant workflow, testing, environment, and architecture contracts before mutation. During closeout, all documents directly linked from `AGENTS.md` were read in full as explicitly requested. Work is isolated on `feat/v0.5-us08` from `develop@e7e41b0`.

Diagnosis:

- Muya already guards composition in `Content` / `Format`: input formatting is short-circuited while `isComposed` is true and composition end commits through the normal input path.
- Existing auto-pair code already owns option-controlled insertion, selection wrapping, deleting paired characters, and typing over an existing generated closer.
- `Format.checkInlineUpdate()` already converts `# `, `> `, unordered and ordered list triggers during normal input.
- Fenced code is the concrete gap: `ParagraphContent` recognizes language-qualified fences only through the Enter conversion path, so an exact three-backtick trigger remains a paragraph until Enter. US08 requires the trigger itself to convert in place.
- No US08 requirement needs a new toolbar, overlay, or replacement visual design.

A focused AC-38 regression test was added before production-code changes to require exact triple-backtick conversion during input. Production code remains unchanged at this stage.

Environment evidence:

- the first root dependency reuse attempt reached a donor Vitest launcher but stalled before test discovery;
- direct donor Vitest then failed because the donor dependency graph lacks the physical `tinyexec` package, matching the repository's documented invalid-donor signature;
- this is environment evidence, not a product red result;
- the donor Junction was removed and one current-worktree `pnpm install --frozen-lockfile` recovery was started. The focused regression must be observed failing after readiness before production changes begin.

## 2026-09-24 — Stage 2: implementation and root-cause closure

Focused red evidence was established after the worktree dependency graph became ready:

- AC-38 exact triple-backtick input failed with the top-level block still reported as `paragraph` instead of `code-block`.
- After adding input-time fence conversion, a separate AC-39 composition regression failed because the subclass continued into the new conversion path after `Format.inputHandler()` returned during composition. The fix therefore explicitly gates the exact-fence conversion on `!isComposed`.

Implementation:

- `ParagraphContent.inputHandler()` recognizes only the exact three-backtick fence as an input-time code conversion. Language-qualified fences keep the established Enter conversion contract.
- The existing Enter conversion body was extracted into `_convertBlock()` so input-time and Enter-time conversions share one semantic implementation rather than duplicating block construction.
- Code-block replacement now seats the caret in the new code content with the normal forced selection update, matching other structural conversions.
- Existing heading, quote, list, auto-pair, selection wrapping and IME mechanisms remain authoritative; no parallel editor state or UI branch was introduced.

A browser-level follow-up initially looked like the next character after the exact three-backtick trigger was intermittently swallowed. Diagnostics disproved that hypothesis: immediately after typing `x`, the live `.mu-codeblock-content` already contained `x` and the native caret was at offset 1. The failing assertion was reading Muya's coalesced state before its asynchronous input flush. The E2E contract therefore asserts both layers without sleeps: the visible code DOM must contain `x` immediately, then `expect.poll` requires authoritative Muya state to converge to the same `code-block / x` state. A temporary DOM-focus patch was rejected and removed because it did not address the observed cause.

## 2026-09-24 — Stage 3: validation and closeout

Validation on the final source state:

- focused Vitest `us08InputContinuity.spec.ts`: **2/2 passed**;
- US08 Chromium acceptance set covering code fence, Undo/Redo, CJK IME, auto-pair, list conversion, headings, block quote and mixed CJK/Latin typing: **39/39 passed**;
- the acceptance set was accidentally duplicated by a tool timeout/handoff; both terminal Jobs completed **39/39 passed**. This duplication is tooling/process evidence only and must not become the normal workflow;
- focused Muya ESLint for changed production/unit-test files: **passed**;
- Muya TypeScript `tsc --noEmit`: **passed**.

Acceptance mapping:

- AC-37: mixed CJK/Latin typing plus Enter/Backspace is covered by real browser interaction and exact text assertions.
- AC-38: exact triple-backtick conversion, following-character preservation, list trigger preservation and code-fence Undo/Redo are covered by E2E; focused unit coverage protects the exact conversion contract.
- AC-39: focused unit coverage proves an exact fence stays inert during active composition; existing CJK browser E2E covers paragraph/list/table commit paths.
- AC-40: existing option matrix plus the added generated-closer case cover option-controlled auto-pair, selection wrapping and typing over generated closers.

## Learning review

- Structural conversion during an `input` handler must re-check composition state in the subclass; a base-class early return does not stop subclass code that follows `super.inputHandler()`.
- Real editor E2E should distinguish immediate user-visible DOM correctness from asynchronously coalesced model-state convergence. This is already covered by the testing guide's rule to prefer observable state and bounded polling over fixed sleeps, so no duplicate generic agent rule is needed.
- Reusing one `_convertBlock()` path avoided a second code-fence construction implementation and preserved Muya as the single document-semantic owner.
- The supplied prototype required no visual replacement. Existing Inkiva UI and interaction conventions remain unchanged.

## Current state / next action

US08 implementation, local validation, diff review, debug-residue check and `git diff --check` are complete on `feat/v0.5-us08`. A local task commit may be created during closeout; push/PR/merge remain authorization-gated remote actions.
