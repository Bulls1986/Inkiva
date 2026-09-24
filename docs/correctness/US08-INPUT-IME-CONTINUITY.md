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

## 2026-09-24 — Stage 4: develop sync and CI compatibility closure

After PR #201 was opened, GitHub reported a merge conflict with newer `develop`. The branch was synced with `origin/develop`; the only textual conflict was `docs/correctness/README.md`, resolved by retaining both the US08 and US10 index entries. No US08 production/test file conflicted.

The first post-sync CI run had six green gates (`build`, `circular`, `lint`, `spec`, `unit`, and `Desktop PR fast hard gate`) and one failing Chromium E2E gate. The E2E log provided valid product Red evidence: seven stable failures all exercised the existing ` ```lang` paragraph flow (five diagram fences plus two language-picker cases). Synchronous conversion on the third backtick had made ` ``` ` consume the prefix before `mermaid`, `python`, etc. could be typed. One unrelated search/replace case was flaky and passed its retry.

Compatibility fix:

- exact three-backtick input now enters a short 250 ms disambiguation window instead of converting synchronously in the same input handler;
- if input remains exactly three backticks when the window expires, the existing shared `_convertBlock()` path creates the code block;
- any subsequent input cancels the pending conversion, so ` ```lang` continues through the existing paragraph language-selector and diagram-fence semantics;
- pending conversion is owned by `ParagraphContent` and deterministically cleared during disposal;
- history undo/redo and active IME composition do not schedule the conversion;
- focused unit coverage now locks both sides of the ambiguity: stopping at the exact fence converts, while continuing with a language token preserves the paragraph path.

Local post-sync rerun could not enter Vitest because the worktree dependency graph lost the documented `tinyexec` payload; one canonical `pnpm install --frozen-lockfile` repair then failed in dependency linking on a missing ESLint payload. Both failures occurred before test discovery and are classified as environment evidence. Per the environment contract, no further local dependency experiments were performed; clean GitHub CI is the authoritative post-fix validation path.

## 2026-09-24 — Stage 5: CI green and merge closure

Fresh CI on `f085fd5` passed all seven gates: `build`, `circular`, `lint`, `spec`, `unit`, Chromium `e2e`, and `Desktop PR fast hard gate`. The previously failing diagram-fence and language-picker scenarios passed in the clean CI environment, confirming the disambiguation fix preserved legacy language-qualified fence behavior while satisfying US08 exact-fence conversion.

PR #201 was squash-merged into `develop` as `d2c6a17ceaaade08a0536ef8bcad5bb846ee7a08` (`feat: complete US08 input continuity (#201)`). GitHub reported the PR state as `MERGED`, and `git ls-remote origin refs/heads/develop` independently confirmed the remote `develop` ref at the same commit. The remote `feat/v0.5-us08` branch was deleted by the merge command.

## Learning review

- Structural conversion during an `input` handler must re-check composition state in the subclass; a base-class early return does not stop subclass code that follows `super.inputHandler()`.
- Real editor E2E should distinguish immediate user-visible DOM correctness from asynchronously coalesced model-state convergence. This is already covered by the testing guide's rule to prefer observable state and bounded polling over fixed sleeps, so no duplicate generic agent rule is needed.
- Reusing one `_convertBlock()` path avoided a second code-fence construction implementation and preserved Muya as the single document-semantic owner.
- A Markdown prefix can be both a complete trigger and the prefix of a longer valid construct. In that case, synchronous structural conversion is incorrect even when the shorter trigger is valid; the editor needs an explicit disambiguation contract that preserves both paths.
- The supplied prototype required no visual replacement. Existing Inkiva UI and interaction conventions remain unchanged.

## Current state / next action

US08 is fully merged into `develop` via PR #201 at `d2c6a17ceaaade08a0536ef8bcad5bb846ee7a08`. All required CI gates passed before merge. No product or architecture follow-up remains for US08; only local worktree/branch cleanup remains as repository hygiene.
