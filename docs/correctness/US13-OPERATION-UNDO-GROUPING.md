# US13 — Operation-based Undo Grouping

## Goal

Close v0.5.0 US-13 / AC-55..58 and AC-79 so Undo follows user operations rather than renderer/state events.

The acceptance contract requires continuous character input at the same insertion direction to coalesce while adjacent keystrokes are at most 750 ms apart. A gap greater than 750 ms, explicit caret/selection movement, Enter, paste, formatting, structural conversion, and tab switching close the current group. IME commit, formatting, paste, table row/column changes, and automatic structural conversion are standalone operations. Derived/background work must not create Undo entries.

## Stage 0 — baseline and diagnosis

Status: **complete**.

Baseline:

- Branch: `feat/v0.5-us13`.
- Base: `origin/develop@9bf8bdb5` after US12 closeout.
- Managed-worktree bootstrap remains unavailable; the documented Git-native `.worktrees/v0.5-us13` fallback is in use.
- Node `24.21.0`, pnpm `10.33.4`.
- The fresh worktree had no dependency graph. A root-only Junction to the matching, known-good `v0.5-us12/node_modules` donor was created after lockfile/root/Muya manifest equality checks. This is ignored local environment state, not repository content.
- Existing focused `undoGrouping.spec.ts` discovered and passed **8/8**, proving the current-worktree Vitest path is executable.

Observed implementation gaps before production changes:

1. History uses a 1000 ms coalescing window, while US13 requires 750 ms inclusive.
2. `_lastRecorded` advances only when a new group starts, so long continuous typing is grouped from the first mutation instead of by adjacent input gaps.
3. Whitespace currently forces a new group although US13 defines continuous character input, not word-based grouping.
4. Paste is classified like ordinary insertion, so it can merge with typing before and after it.
5. Serialized/restored history preserves the live coalescing timestamp, so a quick Tab round-trip can merge a later edit into the pre-switch group.
6. Table mutations already use explicit pre/post cutoffs, but formatting, image insertion, automatic structure conversion, IME commit, caret navigation, and other structural commands need a common operation-boundary audit rather than independent patches.
7. Source-mode replacement is already a standalone rebuild boundary when content actually changes; a no-op view switch does not need a history item. That behavior should be preserved.
8. Desktop snapshot/history orchestration remains behind `DocumentEditorRuntime`; US13 must not bypass that architecture boundary.

No production code has been changed in this stage.

## Stage 1 — Red contract

Status: **complete**.

Focused Red: `us13OperationGrouping.spec.ts` executed **5 tests / 5 failed** on the unmodified production implementation:

- long continuous typing produced 2 groups instead of 1;
- a 751 ms gap remained in 1 group instead of starting group 2;
- whitespace produced 2 groups instead of remaining in group 1;
- typing → paste → typing produced 1 group instead of 3;
- history restore followed by immediate typing stayed at depth 1 instead of depth 2.

The first run also exposed the documented Muya/Prism physical-path issue and therefore was not accepted as clean Red. After adding only the prescribed local `packages/muya/node_modules/prismjs` compatibility Junction, the exact same five assertions failed again with no unhandled errors. This second run is the authoritative Red evidence.

## Stage 2 — core grouping kernel

Status: **complete**.

Implemented the 750 ms adjacent-input kernel, whitespace continuity, standalone native-input classification, and restored-history boundary. The implementation now advances its coalescing timestamp for every recorded input so a long typing run is governed by adjacent-key gaps rather than elapsed time from the first key.

Focused Green after the implementation syntax fix:

- `us13OperationGrouping.spec.ts`: **5/5**;
- existing `undoGrouping.spec.ts`: **8/8**;
- existing `historySerialization.spec.ts`: **4/4**;
- total: **17/17 passed**, with no unhandled test errors.

A review before the next mutation identified one risk that must be resolved with behavior evidence: several tree APIs distinguish `user` from `api` sources, so a blanket `History.userOnly = true` must not be accepted merely because the kernel tests are green. Real formatting/structure/image actions and derived work must be proven separately.

## Stage 3 — real user-operation boundaries

Status: **complete**.

The first behavior Red executed 9 tests: **2 passed / 7 failed**. Ordinary Enter was already isolated and a forced view-only rerender did not create history. Target failures were Shift+Enter, formatting, image insertion, list indentation, automatic fence conversion, and arrow-caret movement. The initial IME assertion also failed, but diagnosis showed the happy-dom harness re-rendered the old model text while trying to position the post-composition caret; that was a test-driving defect, not accepted product evidence. The IME test now routes bubbling composition events through the editor dispatcher and updates the live DOM before compositionend.

The implementation uses one nested user-operation transaction in History rather than scattered cutoffs. The outer operation flushes and closes the preceding typing group, all mutations inside it merge into one undo entry regardless of duration, and the final flush closes the operation on the trailing side. IME uses begin/end across its event lifetime; synchronous commands use the transaction wrapper. Click/arrow caret movement closes the current typing group without creating a history item. Non-user JSON changes are transformed against user history but do not create a new Undo entry.

Final focused contract evidence:

- `us13OperationGrouping.spec.ts`: **6/6**;
- `us13OperationBoundaries.spec.ts`: **16/16**;
- existing `undoGrouping.spec.ts`: **8/8**;
- existing `historySerialization.spec.ts`: **4/4**;
- total focused history contract: **34/34 passed**.

The acceptance suite additionally proves a transaction stays atomic even when internal mutations are more than 750 ms apart, `typing -> format -> typing` undoes and redoes one user operation at a time, click/arrow movement closes the typing group, and `api`/derived changes do not increase the user Undo depth.

### Clipboard boundary audit

The closeout diff audit found one P0 path that the native `beforeinput/inputType=insertFromPaste` contract did not cover: Inkiva's custom Clipboard pipeline mutates Muya blocks directly after async clipboard/HTML/image preprocessing. A real Clipboard Red proved the gap: `typing -> custom paste` produced Undo depth **1** instead of **2**, so paste was being absorbed into preceding typing.

The production fix wraps only the synchronous mutation section of a paste in the common History user-operation transaction. Async preprocessing and confirmation remain outside the transaction, so waiting for clipboard/image work cannot accidentally absorb later user edits. Table TSV already reaches the same transaction through `applyCellMatrix -> _runAtomicMutation`.

Async image paste required a stronger contract. An initial attempt treated placeholder-to-final-src replacement as a generic non-user `api` change. Although it avoided an extra Undo entry, OT transformation changed the stored inverse and Undo produced corrupted Markdown (`abassesf`). That approach was rejected.

The final design gives in-memory History entries stable ids and supports a bounded async **user-operation continuation**. The placeholder is recorded as the user's image-paste operation; after `imageAction` resolves, the final-src replacement is merged back into that exact entry. If newer user edits happened while the image was resolving, their Undo entries are transformed around the continuation so their ordering remains intact. No global transaction is held across `await`. If the original entry no longer exists (for example after undo/history restore), the continuation safely falls back to a standalone operation rather than modifying an unrelated entry. History ids remain internal and are regenerated on serialized-history restore.

The controlled concurrency contracts prove both ordering cases: paste placeholder -> later typed `X` -> image resolution keeps three user operations, where Undo #1 removes only `X` and Undo #2 removes the complete final image; and paste placeholder -> Undo -> Redo -> image resolution preserves the same logical operation identity, so the final image still occupies one Undo entry. Neither path leaves placeholder/final-src corruption.

## Stage 4 — regression and integration validation

Status: **complete; final diff/PR closeout pending**.

Regression evidence:

- final combined Muya regression run: **41 files / 269 tests passed**, combining the full Clipboard/History set with list indentation, automatic conversion, cross-block formatting, table/image APIs, spelling replacement, options rerender, Undo/Redo list round-trip, and `replaceContent` coverage;
- `replaceContent.spec.ts` remains **28/28 passed**, including unchanged-content no-op, one-step source replacement, serialization round-trip, and non-coalescing with later edits;
- repository `pnpm lint`: Green after removing Playwright's generated `packages/desktop/test-results/.last-run.json`; the temporary file had been the only lint error and is not repository content;
- Muya's own `pnpm -C packages/muya lint`: **0 errors / 17 warnings**. The warnings are existing complexity/regex debt; no US13 lint error remains;
- repository `pnpm typecheck`: Green, including both architecture contract tests, Muya declaration build, and desktop `vue-tsc`;
- repository `pnpm build`: Green after the final History/Clipboard implementation; current-worktree Electron main/preload/renderer output built successfully.

Electron integration evidence from the current worktree build:

- per-tab WYSIWYG Undo isolation: **1/1 passed** (`tab-switch-cursor.spec.ts` focused case);
- Source Mode PG14 Undo/Redo and block-type bulk replacement: **3/3 passed**.

PR #207 first CI pass exposed one stale pre-US13 E2E contract: `undo-redo.spec.ts` still asserted that typing `hello world` continuously must split at whitespace. That directly contradicts AC-55/US13, which defines whitespace as ordinary continuous character input and uses only an adjacent-input gap greater than 750 ms as the timing boundary. The stale assertion failed deterministically across all three CI attempts because the current PR correctly undid the entire continuous run to an empty paragraph; the other 258 Muya E2E cases passed, with three unrelated cases recovering on retry. The stale case was replaced with two stricter US13 Chromium contracts: continuous words undo as one operation, while an explicit >750 ms pause creates a separate Undo step.

A local attempt to execute those Chromium contracts was explicitly rejected as product evidence after diagnostics showed Vite resolving Muya source from the dependency donor worktree (`.worktrees/v0.5-us12/packages/muya/src/...`) instead of the current US13 worktree. The captured current-browser input interval from `o` to the following space was only about 46 ms, but the donor source still invoked its historical whitespace cutoff. This exactly matches `docs/agent/ENVIRONMENT.md` readiness rule 5: reused dependencies must not redirect source/config into another worktree. No product change was made from that invalid local run; clean PR CI is the authoritative E2E evidence for the updated contracts.

The first Playwright launch attempt failed before test discovery with the already-documented Windows `.cmd`/NVM path-splitting signature (`'C:\\...\\Author' is not recognized`). Per `ENVIRONMENT_RECIPES.md`, this was classified as bootstrap evidence, not a product failure. The real Electron binary (`v42.1.0`) was verified, the minimal package-local Electron path required by the helper was supplied, and the same current-worktree tests were then executed via the trusted real `node.exe` plus the current-worktree Playwright JS CLI. No new environment rule was added because this recovery path was already documented.

## Lessons retained

1. Undo grouping needs two explicit layers: adjacent-input coalescing for ordinary typing and an intent-level transaction for semantic user operations. A single timestamp heuristic cannot model both correctly.
2. Operation boundaries must close on both sides. Flushing only after Enter, formatting, paste, table mutation, or conversion can still absorb the preceding typing batch.
3. IME is a lifetime, not a single input event. The operation must begin at `compositionstart`, allow all intermediate mutations to coalesce regardless of elapsed time, and close only after `compositionend` has flushed the committed text.
4. Cursor movement is a boundary without being an edit. Click/arrow navigation should flush and close the current typing group while adding no Undo item of its own.
5. Background/derived mutations and user history are separate concerns. Non-user operations may need OT transformation against existing history, but they must not be recorded as new user Undo entries.
6. A generic remote/API transform is not sufficient when an async mutation is causally part of an earlier user action. The continuation must amend the original logical Undo item; otherwise overlapping placeholder replacement can corrupt the stored inverse.
7. Never hold a global editor transaction across `await`. Capture a stable logical-operation token, then merge the synchronous continuation when the async dependency resolves; transform any newer user operations around it.
8. Real product entry paths matter more than browser event names. Inkiva's custom Clipboard pipeline bypassed native `insertFromPaste`, and only a behavior-level paste test exposed that missing boundary.
9. Low-level unit fixtures may intentionally omit full Editor infrastructure. Transaction helpers can preserve those narrow seams with a no-History fallback while the real Muya path remains strictly transaction-backed.
10. Tab/source isolation should be validated at both layers: serialized History unit contracts prove snapshot boundaries, while focused Electron tests prove the desktop runtime restores the correct document history and preserves Source Mode one-step replacement semantics.

## Resume point

Implementation, local behavior validation, static gates, final build, and focused Electron integration validation are complete. Remaining closeout is mechanical: clean generated Playwright output, review the complete diff/CRLF/workspace hygiene, commit/push, open the PR, wait for required CI, and squash-merge to `develop` if all gates remain Green.
