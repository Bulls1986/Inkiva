# P0 — Table Hard Break Caret Correctness

## Scope

Close the table-cell editing correctness defect where a hard break serializes as standard-compatible `<br>` but the WYSIWYG native caret becomes hidden or non-obvious immediately after the token is rendered.

Acceptance covers both user paths:

- `Shift+Enter` inserts the canonical `<br>` and leaves the caret at the visual position after the rendered break.
- Manually typing the final `>` of `<br>` may reclassify plain text into an `html_tag`, but the same logical caret must survive the rerender and remain immediately usable.

No proprietary Markdown syntax, focus retry, delayed refocus, or forced end-of-cell workaround is allowed.

## Stage 0 — baseline and pre-mutation gate

Status: **complete**

Base and isolation:

- remote `origin/develop` fetched before task start;
- exact base: `1b3b0fb490015fd9a9898c6ddaf14f119805f891`;
- isolated worktree: `.worktrees/table-hard-break-caret`;
- branch: `fix/table-hard-break-caret`;
- the source checkout had an unrelated dirty correctness document, so no task work is being performed there.

Contracts read before production mutation:

- `AGENTS.md`;
- `docs/agent/TESTING.md`;
- `docs/agent/ARCHITECTURE_RELEASE.md`;
- `docs/agent/WORKFLOW.md`;
- `docs/agent/ENVIRONMENT.md`;
- `docs/product/DESKTOP_EDITOR_INTERACTION_CONTRACT.md`;
- `docs/correctness/US12-TABLE-EDITING-FIDELITY.md`;
- `docs/correctness/DESKTOP-EDITOR-INTERACTION-AUDIT.md`;
- `docs/correctness/US08-INPUT-IME-CONTINUITY.md`;
- `docs/architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md`.

Affected boundary:

- Muya remains the authoritative owner of document semantics and logical selection.
- The change is expected to stay inside the Muya renderer/selection mapping boundary; desktop must not create a second caret model.
- The public Muya type boundary must remain intact.

Initial code trace, before any production change:

1. `TableCellContent._shiftEnter()` replaces the selected source range with `<br>`, computes the source offset after all four characters, and calls `setCursor(..., true)`.
2. The `htmlTag` renderer intentionally renders `<br>` as a zero-size hidden source marker plus a real `<br>` visual node.
3. `TextSelection._updateSelection()` maps the logical source offset with `getNodeAndOffset()`.
4. `getNodeAndOffset()` currently measures the hidden marker through `getTextContent()` and can recurse into that marker as though it were an ordinary caret-bearing text node.
5. Manual typing reaches the same boundary through `Format.inputHandler()`: after the final `>` changes the inline token type, rerender occurs and the same logical offset is restored through the selection mapper.

This is a diagnosis target, not yet a proven root cause. Production code remains unchanged.

## Stage 1 — executable Red

Status: **complete**

Focused command:

`pnpm -C packages/muya exec vitest run src/block/content/tableCell/__tests__/hardBreakCaret.spec.ts`

The first launch attempt could not find the Vitest CLI and was classified as environment evidence. The documented matching-fingerprint root dependency reuse path was then applied from the healthy `v0.5-us16` slot.

The intended test file was discovered and both cases executed. Result: **2/2 failed on the product assertion** that the native caret must not live inside hidden source syntax.

Both failures reported the native selection endpoint inside:

`<span class="mu-hide mu-html-tag mu-output-remove">&lt;br&gt;</span>`

This proves the two user paths converge on the same defect:

1. `Shift+Enter` creates the correct model string `alpha<br>`, rerenders it, then maps source offset 9 into the hidden marker text node.
2. Manual typing behaves identically after the final `>` changes the inline token from plain text into `html_tag`.

The Red also proves the existing round-trip/render tests were insufficient: the document string and visual `<br>` can both be correct while the editing caret contract is broken.

Production mutation is now authorized by the repository test-first gate.

## Stage 2 — root cause and repair design

Status: **complete**

Root cause confirmed by executable Red plus code trace:

- the hidden `<br>` source marker contributes four characters to Muya's source projection;
- `getNodeAndOffset()` treats those four characters as an ordinary caret-bearing DOM text range, so source offset 9 resolves *inside* the zero-size hidden marker;
- the inverse path in `TextSelection.getSelection()` also assumes a native DOM offset is always a character offset. That is false when a valid caret is represented on an Element child boundary such as the position after a rendered `<br>`.

The repair therefore changes the selection mapping contract, not table focus behavior:

- hidden `<br>` source syntax remains part of source-length accounting but is treated as an atomic visual hard-break boundary for source → DOM mapping;
- source positions at the token boundary map before/after the rendered hard break, never into the hidden marker;
- native Element child-boundary offsets are converted back to source offsets by summing the source projection of preceding children rather than adding the child index as if it were text length.

No `focus()`, timer, table-tail forcing, private Markdown syntax, or `_shiftEnter()` retry is introduced.


## Stage 3 — regression discovery and atomic-token closure

Status: **complete**

The first broader Muya run exposed two failures in `backspaceImage.spec.ts`. Because this task changes the generic selection mapper, those failures were treated as possible regressions rather than dismissed.

A detached worktree at the exact task baseline `1b3b0fb4` was created and the same `backspaceImage.spec.ts` was executed with the same dependency fingerprint. Baseline result: **4/4 Green**. The task branch before the follow-up fix was **2/4**, proving the regression was introduced by the new inverse mapper.

The second root cause was the same class of contract error:

- an inline image is also an atomic visual token;
- the browser may represent “after image” as DOM child boundary `imageContainer, offset 1`;
- the child is an `<img>` with no text content, so blind child-text summation maps that caret back to the image source start.

An executable Red was added to `selection/__tests__/offsetClamp.spec.ts`: image-container offset 0 must map to source start, offset 1 to the full `data-raw` source end. It failed `expected 33, received 0` before production repair.

The inverse mapper now explicitly preserves atomic inline-image before/after semantics while the existing source → DOM image mapping remains unchanged.

Focused atomic-token regression after the repair:

- selection offset mapping: Green;
- inline image backspace selection: Green;
- table hard-break caret: Green;
- combined result: **15/15 Green**.

This is deliberately a bounded mapping change, not a new selection subsystem.

## Stage 4 — real Electron acceptance

Status: **complete**

The current task worktree was rebuilt after the final production mapping change. Native `ced` was rebuilt for Electron 42.1.0 under the repository's Visual Studio 2022 toolchain; no other branch's `out/` artifacts were reused.

Final hard-break Electron E2E:

`pnpm -C packages/desktop exec playwright test test/e2e/table-hard-break-roundtrip.spec.ts --config=test/e2e/playwright.config.ts --workers=1`

Result: **2/2 Green**.

Covered behavior:

1. `Shift+Enter`:
   - `alpha` → `alpha<br>`;
   - native caret remains collapsed and outside hidden/output-remove syntax;
   - no click/refocus occurs;
   - immediate `beta` input produces `alpha<br>beta`;
   - Undo then Redo restores content and a usable caret;
   - Source shows exactly one literal `<br>`;
   - WYSIWYG renders one real hard break;
   - Save writes `alpha<br>beta`;
   - Close/Reopen preserves one hard break and correct source representation.

2. Direct typing `<br>`:
   - completing `>` rerenders to `html_tag`;
   - native/logical selection remains valid;
   - immediate `beta` input without a second click produces `alpha<br>beta`;
   - Source round-trip keeps one literal `<br>`, never `&lt;br&gt;`.

IME / Source-WYSIWYG Electron regression:

`us14-source-wysiwyg.spec.ts` — **5/5 Green**.

This covers active WYSIWYG composition, active Source composition, queued mode intents, tab switching during composition, and unsafe Markdown intermediate state.

## Stage 5 — validation matrix

Status: **complete with one baseline-reproducible unrelated canonical timeout recorded below**

| Gate | Result |
| --- | --- |
| hard-break Muya Red → Green | 2/2 Green after repair |
| atomic mapping + image + hard break | 15/15 Green |
| table-cell composition / IME unit coverage | Green |
| GFM 0.29 conformance | **672/672 Green** |
| Desktop unit suite | **164 files / 1298 passed / 1 existing skip** |
| Electron hard-break flows | **2/2 Green** |
| Electron Source/WYSIWYG IME | **5/5 Green** |
| current-worktree Electron build | Green |
| lint | Green: 0 errors; existing warnings remain |
| typecheck / architecture type boundaries | Green |

The full Muya canonical run after the final mapper repair produced **1688/1689 passing**. The sole failure is `tableChessboard — is exported from the package entrypoint`, whose dynamic import exceeds the existing 5000 ms per-test timeout by only milliseconds on this runner. A detached baseline worktree at the untouched task base reproduces the same failure (`5011 ms`); the task branch observed `5019 ms`. No timeout, retry, skip, or gate was changed. The previously task-caused inline-image failures are fully closed.

A separate `markdownToStateParentStackPerformance` timeout seen during an earlier loaded full-suite run was rerun unchanged and passed in `2123 ms`.

## Dependency / environment record

The first test bootstrap temporarily used a fingerprint-matching warm `v0.5-us16` dependency tree. This was corrected after review: main-checkout compatibility paths are preferred, and the task worktree now owns its root dependency graph through:

`pnpm install --offline --frozen-lockfile --ignore-scripts`

Main and task `pnpm-lock.yaml`, root manifest, Muya manifest, and Desktop manifest were verified identical. The final validation topology uses:

- worktree-local root dependencies;
- main checkout's installed Desktop Electron as the minimal package-local Electron compatibility path;
- current-worktree build artifacts only;
- current-worktree native `ced` rebuilt against Electron 42.1.0.

## Reusable lesson

**Source offset is not a blind DOM text offset.**

For WYSIWYG tokens whose source representation and visual representation have different topology, selection mapping must define explicit source ↔ visual caret boundaries. Hidden syntax may contribute source length without being a valid native caret target. Rendered atomic content may contribute no DOM text while still spanning a non-zero source range.

The invariant is:

> An atomic rendered token exposes stable caret-before / caret-after semantics; its hidden or non-text implementation details are not editable caret positions.

The first protected cases are hard breaks and inline images. The same rule should be applied when evolving math, ruby, hidden Markdown syntax, and other atomic inline renderers.

## Closeout conclusion

The P0 correctness defect is closed at the selection/rendering contract:

- manually typed `<br>` does not lose the caret;
- `Shift+Enter` does not lose the caret;
- the next character can be typed immediately without mouse intervention;
- Undo/Redo, Source/WYSIWYG, save/reopen, and IME continuity remain valid;
- standard GFM Markdown and literal `<br>` round-trip behavior are unchanged;
- no focus hack, timer retry, forced cell-tail cursor, private syntax, or browser-specific workaround was introduced.
