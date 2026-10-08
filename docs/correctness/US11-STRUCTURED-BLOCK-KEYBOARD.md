# US11 — Structured Block Keyboard Editing

[Back to Correctness index](README.md) · [Testing contract](../agent/TESTING.md)

Status: **US11 acceptance complete on reviewed PR #220; final merge/ref verification recorded separately**
Original implementation: `feat/us11-structured-block-keyboard@7512c4c`
Integration branch: `feat/v0.5-us11-integration`
Integration base: `develop@4e4ae4a7`

## Scope

Inkiva v0.5.0 US11 closes keyboard-only editing semantics for structured Markdown blocks while keeping Muya as the authoritative document-semantics owner and standard Markdown/GFM as the persisted source format.

Acceptance focus:

- **AC-48** — unordered/ordered/nested/task list Enter/Tab/Shift+Tab/Backspace semantics, continuous numbering, task checked-state rules, caret correctness, Undo/Redo, and standard Markdown/GFM serialization;
- **AC-49** — heading and block-quote Enter/Backspace/indent semantics without text loss, duplicated blocks, neighboring-block corruption, or invalid caret landing;
- **AC-50** — fenced-code Enter/Tab/two-stage Select All/ArrowDown exit/source fidelity, with Enter, Tab, and exit forming independent Undo boundaries;
- **AC-77** — every covered action preserves expected structure, selection/caret, and Source round-trip semantics.

The supplied prototype/spec is a behavioral reference only. Existing Inkiva UI, editor architecture, and visual language remain authoritative.

## 2026-09-25 — Stage 1: diagnosis and RED contract

Before production mutation, the work read root `AGENTS.md` and the required workflow, testing, environment, architecture, and correctness guidance. Managed worktree bootstrap returned the documented `managed_worktree_root_unavailable` condition; per the repository recovery recipe, the failure was not retried. A clean, idle Git-native pre-warmed worktree was reused and reset to `develop@f9bf06f4` on `feat/us11-structured-block-keyboard`.

Diagnosis found that most US11 primitives already exist and should be protected rather than rewritten:

- list Enter splitting already moves trailing text to a new sibling; task splits explicitly create the new task as `checked: false`;
- root-list exit plus reusable list indent/unindent primitives, ordered-list metadata, task checkbox control handling, heading split/exit behavior, and heading-start Backspace already have established Muya paths; nested Enter/Backspace semantics still required executable verification;
- code Enter/Tab, two-stage code Select All, and generic ArrowDown cross-block navigation already exist;
- block-quote Enter/empty-exit and quote-start Backspace already exist.

Two concrete product gaps were reproduced before production-code changes:

1. **AC-49 block-quote depth**
   - Added focused Tab/Shift+Tab regression coverage in `paragraphContent/__tests__/insertTabAndIndent.spec.ts`.
   - RED: **2 failed / 8 passed**.
   - Tab at a quoted paragraph start left the node as a paragraph and inserted ordinary spaces instead of nesting only that paragraph one quote level.
   - Shift+Tab on a nested quoted paragraph left the nested `block-quote` unchanged instead of promoting only the current paragraph.
   - Adjacent normal-block preservation is part of both assertions.

2. **AC-50 code keyboard Undo boundaries**
   - Added a focused Enter → Tab → ArrowDown-exit history contract in `codeBlockContent/__tests__/enterBackspaceHandler.spec.ts`.
   - The first attempt failed because the test retained a pre-flush code-content instance; after reacquiring the live block after each RAF flush, this harness failure was discarded and is **not** product-red evidence.
   - Valid RED: **1 failed / 8 passed**.
   - Enter produced one undo entry; after immediate Tab the history stack still contained only one entry, proving the two keyboard actions coalesced inside the 1-second history window instead of remaining independent.

Production code is intentionally unchanged at the end of Stage 1.

## 2026-09-25 — Stage 2: quote/code closure and focused GREEN

The smallest semantic changes were made at existing Muya ownership boundaries:

- `ParagraphContent` now treats quote-start Tab/Shift+Tab as a structural quote-depth command. Tab wraps only the current quoted paragraph one level deeper. Shift+Tab promotes only the current nested paragraph and splits the nested quote when required so trailing quoted siblings remain at their original depth. Root quote Shift+Tab is consumed as a no-op.
- `CodeBlockContent.enterHandler` and `CodeBlockContent.tabHandler` now cut the history merge window before their edits.
- generic cross-block ArrowDown cuts history only when it must synthesize the trailing paragraph used to leave a final block such as fenced code.

Focused RED contracts became GREEN: **19/19 tests passed**. Package type checking initially exposed only a TypeScript null-narrowing issue in the new quote helper; making the paragraph null guard explicit fixed it without changing runtime behavior, and `pnpm --filter @muyajs/core lint:types` passed.

A wider related bundle initially reported nine failures in two legacy white-box tests that invoke class prototypes with incomplete fake `this` objects. Real-Muya tests were already green. The fakes were updated to include the newly legitimate helper/history dependencies rather than weakening production contracts. Rerunning the same bundle produced **9 files / 65 tests passed**.

## 2026-09-25 — Stage 3: expanded AC-48/49/50 contract

Executable acceptance coverage then exposed two additional AC-48 product gaps:

- first attempt to represent a trailing empty nested list item through Markdown was rejected as test-fixture evidence because the parser legitimately did not materialize that isolated empty item;
- after constructing the equivalent document state explicitly, **empty nested-item Enter** was a valid RED: the nested item flattened into the parent item instead of decreasing one list level;
- **nested item-start Backspace** was independently a valid RED with the same structural defect;
- in that same RED run, checked-task split + Undo/Redo and ordered-list continuous numbering already passed.

Both nested-list actions now reuse the existing `_getUnindentType()` + `_unindentListItem()` structural command used by Shift+Tab. No parallel list-surgery implementation was introduced. The focused AC-48 suite is now **4/4 passed**.

Additional characterization proved the remaining behavior rather than rewriting it:

- headings: end Enter, middle Enter, and start Backspace — **3/3 passed** with level, text, paragraph placement, and caret assertions;
- block quotes: non-empty split, empty root exit, and empty nested one-level exit — **3/3 passed**;
- fenced code: exact Tab indentation is identical in visible text and serialized Markdown; Enter → Tab → ArrowDown-exit are three independent Undo steps;
- two-stage Select All for fenced code remains protected by the existing selection suite;
- task Enter keeps the original checked state, creates an unchecked sibling, emits standard GFM, and round-trips through Undo/Redo;
- ordered lists preserve continuous numbering after a mid-item split.

The consolidated US11 acceptance-focused run is currently **5 files / 30 tests passed**.

## 2026-09-25 — Stage 4: validation, architecture review, and closeout

Final focused acceptance command covered lists/tasks, headings, quotes, fenced code, Select All, ArrowDown exit, source fidelity, and caret/history behavior across eight Muya specs: **8 files / 61 tests passed**.

Static gates:

- `pnpm --filter @muyajs/core lint` — passed with **0 errors**; 16 warnings remain in the package, all warning-only and not introduced as a US11 correctness failure.
- `pnpm --filter @muyajs/core lint:types` — passed.
- package-wide `pnpm --filter @muyajs/core test` was attempted once. The Runner terminated it at its 120-second execution ceiling after a long stream of passing specs and no observed assertion failure. This is recorded as incomplete package-wide evidence, not as a green gate and not as a product failure.

Relevant Electron evidence was kept intentionally narrow per `docs/agent/TESTING.md`:

- the reused worktree initially lacked the physical Electron launcher result and then the `ced@2.0.0` native binding; both were classified as environment/bootstrap failures before the test body and repaired using the documented minimal dependency-reuse path;
- `list-indent.spec.ts`: all **3/3 test bodies passed** for real Tab/Shift+Tab list editing. The worker later hit the existing 30-second teardown timeout after the tests had completed, so the process exit is recorded separately from the passing product assertions;
- `editor-input.spec.ts -g Toggling.*source.*preserves.*content`: **1/1 passed cleanly**, proving live Source ↔ WYSIWYG preservation through the desktop integration path;
- `all-blocks-roundtrip.spec.ts` entered the test body. Its semantic render sanity passed, while four byte-stability assertions differed only by Windows `LF` versus `CRLF` line endings. No block/content semantic mismatch was shown. This unrelated line-ending evidence was not “fixed” by changing product behavior or weakening assertions.

Final architecture/diff review:

- ownership remains inside existing Muya editing/history boundaries; no desktop/editor-store patch or private Markdown syntax was added;
- nested-list Enter and item-start Backspace reuse the existing list unindent primitive instead of adding parallel tree surgery;
- quote depth remains local to `ParagraphContent`, preserving adjacent sibling structure and caret placement;
- code Enter/Tab and structural trailing-paragraph creation use the existing History cutoff mechanism; no new history subsystem or timer-based grouping rule was introduced;
- existing checked-task split, ordered numbering, heading, Select All, GFM serialization, and Source round-trip behavior were protected with tests rather than rewritten;
- no public API/type boundary changed.

## Learning review

Three implementation lessons are retained in this stage record:

1. For structured Markdown editing, diagnose at the semantic owner first. A keyboard symptom is not necessarily an event-routing bug; the durable fix belongs where the block tree mutation is owned.
2. When two keyboard actions must be independently undoable, use the existing history cutoff/boundary mechanism immediately before the structural/text mutation rather than introducing delays or custom snapshots.
3. When Enter/Backspace/Tab share the same structural intent (nested-list promotion), reuse one structural primitive and test each trigger independently. This avoids behavior drift between keyboard paths.

No new repository-wide agent rule was added: the reusable parts of the worktree, Red/Green, Electron evidence-ladder, minimal dependency-reuse, and CRLF disciplines are already documented in `docs/agent/*`.

## Closeout

The original US11 branch completed its original focused scope, but commit `7512c4c` was not merged into `develop`; the original closeout statement refers only to the historical branch. The current-develop integration below supersedes that PR readiness claim, and separately records new full-suite/CI evidence.

## Current-develop integration — 2026-10-08

- Started from clean authoritative `develop@4e4ae4a7` in the dedicated `feat/v0.5-us11-integration` worktree, retaining the original US11 branch unmodified.
- Restored the original focused regression tests **before** changing production code, and executed five suites against unchanged current production. Valid product RED: **25 passed / 5 failed**. The five failed assertions independently identified nested-list Enter/Backspace, block-quote Tab/Shift+Tab, and three separate code-keyboard Undo steps; test discovery and bodies completed successfully.
- Applied only the three original Muya semantic implementation files, after verifying the current-develop patch applied without conflict: nested lists reuse `_unindentListItem`, quote depth stays within `ParagraphContent`, and code Enter/Tab/final-block ArrowDown use the existing History cutoff boundary. No parallel editor semantics, new public type, or desktop-specific workaround was introduced.
- Post-fix focused GREEN: **7 files / 39 tests passed**, preserving the original assertions. Muya `lint:types` passed; Muya `lint` passed with **0 errors / 18 warnings** (warnings remain tracked separately; no threshold relaxed).
- Full current-worktree Muya suite: **257/257 files, 1731/1731 tests passed** (`pnpm -C packages/muya test`, 189.39 s). No US11 regression was excluded and the complete run exited 0.
- Full Electron-Vite `pnpm -C packages/desktop build:app` passed from this branch's source and build output. Added real Electron keyboard coverage for nested-list Backspace and block-quote Tab/Shift+Tab: **2/2 passed (10.2 s)** with a one-worker run, exact Markdown and native DOM structure assertions; changed E2E-file ESLint passed.
- The first Electron attempt stopped **before entering any test body** because the isolated offline/ignore-scripts dependency graph lacked Electron `path.txt`. Following the existing Windows environment recipe, the matching Electron 42.1.0 executable and native ced binding were materialized in ignored package-local dependency paths; no tracked code, test expectation or build output was borrowed from the donor checkout. The same current-worktree Electron spec then executed and passed.
- Initial PR #220 CI: Muya build, lint, unit, CommonMark/GFM spec, Chromium E2E, circular-dependency and PR Fast Performance Gate **7/7 passed**. Desktop test/E2E/build are initially excluded by the repository's Muya-only PR path filters, so the new `packages/desktop/test/e2e/us11-structured-block-keyboard.spec.ts` deliberately supplies an appropriate desktop-level regression and schedules the actual desktop workflows rather than claiming they ran.
- Compatibility review targets the already-merged US13 operation-oriented Undo grouping, US08 IME composition, US14 Source/WYSIWYG round-trip, US12/table P1 and the newer caret/selection contracts. The focused Red/Green proves the missing US11 semantics, while the complete integration gates remain necessary before final closeout.
- Architecture ownership review: document block tree semantics and user-initiated Undo boundaries remain inside Muya; editor runtime, IPC, virtual surface, renderer projection, and shared API boundaries are unchanged. Follow the established `docs/architecture/SELECTION-MAPPING-CONTRACT.md` for any later caret regressions rather than adding ad hoc DOM mapping.

### Final PR acceptance — 2026-10-08

- PR [#220](https://github.com/Bulls1986/Inkiva/pull/220), executable head `0bcb28571535e72ceeb1ca64a1c051ea862080f7`. Full Desktop E2E **passed (12m30s)**, Desktop unit tests and lint **passed**.
- Muya unit, lint, build, CommonMark/GFM spec, Chromium E2E and circular dependency checks all **passed** on the same executable head.
- Desktop PR Fast Performance Gate **passed with original thresholds and workload**; it is the required PR smoke gate, not a replacement for the separate v0.5 reference release gate.
- PR Build Windows x64, macOS x64 and macOS ARM64 **all passed**, followed by **three passing package smoke jobs**, updater artifact smoke and artifact-link output.
- Initial PR Build failure was a registry.npmjs.org dependency download `ERR_SOCKET_TIMEOUT` on macOS Intel during setup, before compilation. GitHub consequently cancelled Windows build because of the matrix fail-fast strategy. One explicitly controlled whole-workflow rerun (same commit, no changes to source or CI policy) passed all three builds and all downstream artifact gates. This is **CI infrastructure/transient network** evidence, not a product-red signal; failed history remains visible in run [37713634038](https://github.com/Bulls1986/Inkiva/actions/runs/37713634038).
- Local green integration remains: 7 focused test files / 39 passing tests, 257 package-wide Muya test files / 1731 passing tests, 2/2 new real Electron keyboard cases, 16/16 adjacent Electron tests, root typecheck and desktop build. No acceptance assertions were weakened.

Only the repository merge/remote-ref verification remains. This documentation-only CI evidence update changes no executable or workflow file; its follow-up commit uses the repository-approved `[skip ci]` convention without claiming checks ran on new executable content.
