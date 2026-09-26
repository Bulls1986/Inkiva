# US12 — Table Editing Fidelity

[Back to Correctness index](README.md) · [Testing contract](../agent/TESTING.md)

Status: implementation and local validation complete; delivery pending  
Branch: `feat/v0.5-us12`  
Base: `origin/develop@43efce6be6dcd3da3a94c7b66dc3305c7466f642`

## Scope

US12 closes the v0.5.0 P0 GFM table-editing contract (AC-51 through AC-54).
The supplied prototype is interaction reference only; existing Inkiva editor
layout and visual language remain authoritative.

Required behavior:

- Tab / Shift+Tab navigate cells; Tab from the final cell appends one row.
- Enter inside a cell creates a visible in-cell line break serialized as GFM-safe
  `<br>`, rather than inserting a raw Markdown newline.
- row/column insert, remove, move and column alignment preserve the nearest
  meaningful focus and form one Undo/Redo boundary per user operation.
- rectangular TSV paste starts at the current cell, expands the table only as
  required, leaves cells outside the target rectangle untouched, and asks before
  replacing any non-empty destination cells.
- cancelling an overwrite must be a true no-op (Markdown and undo history).
- malformed/non-rectangular TSV falls back to literal text in the current cell,
  with line breaks and pipe characters serialized safely.
- WYSIWYG / Source / save / reopen round trips preserve escaped pipes,
  alignment and non-ASCII cell content.
- a wide table owns its horizontal overflow; it must not force the whole
  document viewport sideways.

## Stage 0 — baseline / architecture gate

Status: **complete**

Contracts read before production mutation:

- `AGENTS.md`
- `docs/agent/TESTING.md`
- `docs/agent/ARCHITECTURE_RELEASE.md`
- `docs/agent/WORKFLOW.md`
- `docs/agent/ENVIRONMENT.md`
- `docs/architecture/README.md`
- `docs/architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md`

Architecture boundary:

- Muya remains the authoritative owner of table semantics and Markdown state.
- desktop may supply product UI for confirmation through a typed Muya option;
  it must not maintain a second table model.
- multi-cell / structural operations should be committed as one authoritative
  table-state mutation, rather than a sequence of UI-owned patches.

Observed baseline:

- `TableCellContent.tabHandler` already implements forward/backward Tab and
  appends a row from the final cell.
- plain Enter currently navigates to another row or out of the table; only
  Shift+Enter writes `<br/>`.
- table-cell paste currently treats all multiline/tabular text as one literal
  cell and folds newlines to `<br/>`; there is no rectangular TSV contract or
  overwrite confirmation.
- row/column insert/remove and column alignment already exist; drag-bar row/
  column reordering exists but is not exposed as a reusable table mutation.
- serializer already escapes literal `|` in cell state on Markdown output.
- current table CSS draws grid/selection borders, but no explicit
  table-scoped horizontal overflow contract is present.

No production source has been changed in this stage.

## Stage 1 — RED

Status: **complete**

Focused tests are added before implementation for:

1. plain Enter becoming an in-cell `<br>`;
2. rectangular TSV paste + expansion + overwrite confirmation;
3. cancel being Markdown/history neutral;
4. malformed TSV literal fallback;
5. one-step undo of a confirmed rectangular paste.

The tests must execute their intended bodies and fail on the current product
behavior before production code may change.

Executable evidence:

- initial launch failed before discovery because the fresh worktree had no local
  Vitest launcher. This was classified as environment evidence, not Red.
- the documented recovery path was used once:
  `pnpm install --offline --frozen-lockfile --ignore-scripts`; it completed
  from the local store with the frozen lockfile unchanged.
- Red command:
  `pnpm -C packages/muya exec vitest run src/block/content/tableCell/__tests__/us12Enter.spec.ts src/clipboard/__tests__/us12TableTsvPaste.spec.ts`
- Vitest discovered both intended files and executed **4/4 target cases**.
- all four failed on product assertions:
  1. plain Enter left `alpha` unchanged instead of `alpha<br>`;
  2. rectangular TSV paste never called overwrite confirmation;
  3. cancellation could not be observed because no confirmation boundary
     existed;
  4. malformed TSV fallback produced `<br/>` rather than the US12 canonical
     `<br>`.

This is valid product Red evidence. Production implementation may now proceed.

Before production mutation, AC-52 received a second focused Red probe for the
history/structure boundary:

- a cell edit followed immediately by row insertion must undo only the row
  insertion, not absorb the preceding edit;
- row and column movement must exist as explicit table operations and each
  reverse in one Undo.

This probe is intentionally separate from the TSV tests so history-boundary
regressions remain diagnosable as table-structure failures rather than paste
failures.

## Stage 2 — implementation

Status: **complete**

Table semantics remain inside Muya:

- plain Enter and Shift+Enter now insert the canonical GFM-safe `<br>` inside
  a cell; Ctrl/Cmd+Enter keeps the existing explicit row-insert behavior.
- table structural mutations use one shared atomic boundary: pending text is
  flushed first, the structural change is isolated, and its composed JSON
  operation is flushed immediately. Insert/remove row/column, alignment,
  row/column movement and matrix paste therefore do not absorb adjacent typing.
- row/column movement is now a table API used by the existing drag surface and
  by the row/column menu instead of maintaining a second reorder algorithm.
- rectangular TSV paste is parsed before mutation. The target rectangle is
  measured against the current table, non-empty destinations are counted, and
  expansion/replacement happens only after confirmation. Expansion adds only
  the required rows/columns and preserves cells outside the target rectangle.
- malformed TSV remains in the current cell, with newline serialized as
  `<br>`; ordinary Markdown serialization continues to escape literal pipes.
- wide-table horizontal overflow is owned by the table container, and the
  focused cell receives a visible focus boundary.

Desktop owns only product UI:

- `ITableOverwriteRequest` and two narrow Muya options form the public
  boundary: overwrite confirmation and malformed-TSV notification.
- the overwrite dialog shows target range plus non-empty-cell count; Cancel,
  Escape and dialog close all resolve false before any table mutation.
- the malformed path uses the existing notification service and localized
  English/Chinese product copy.

The legacy `<br/>` table tests were updated to the US12 canonical `<br>`
contract. No proprietary Markdown syntax was introduced.

## Stage 3 — focused Green / regression evidence

Status: **complete**

Focused contract:

- initial US12 core Green: **6/6** across Enter, TSV confirmation/cancel and
  structural atomicity.
- after Source round-trip coverage was added: **11/11** across four focused
  files.
- final structural audit added a third AC-52 case for deleting the last column,
  which deletes the whole table. The new test was valid Red: one Undo also
  reverted the immediately preceding cell edit. Root cause was a legacy
  one-column branch bypassing the atomic mutation boundary. After moving that
  branch behind the same boundary, the focused structure suite is **3/3 Green**.
- final post-audit focused acceptance on the complete source state is
  **4 files / 12 tests Green**.

Existing-table regression matrix:

- `enterHandler.spec.ts`
- `tabHandler.spec.ts`
- `pasteCellLiteral.spec.ts`
- `pasteHandlerParity.spec.ts`
- `keydownTableGuard.spec.ts`
- `alignColumn.spec.ts`
- `blockSerialization.spec.ts`
- `tableEscapedPipe.spec.ts`

Final result: **8 files / 65 tests Green**.

Static / architecture gates:

- Muya `tsc --noEmit`: Green.
- full repository `pnpm typecheck`: Green, including Muya public-type boundary,
  Recovery/History boundary, current Muya declaration build and Desktop
  `vue-tsc`.
- repository ESLint: **0 errors**; the existing repository warning baseline
  remains 273 warnings and was not broadened into an unrelated cleanup.
- Muya ESLint: **0 errors**; 17 existing complexity/regex warnings remain.
- plain Windows `git diff --check` reported CRLF on newly added
  `editor.vue` lines as trailing whitespace. Byte inspection proved both HEAD
  and worktree are consistently CRLF with zero lone-LF lines. The repository's
  established Windows check
  `git -c core.whitespace=cr-at-eol diff --check` is Green; no line-ending
  rewrite was performed.
- Stylelint still reports pre-existing baseline errors in unchanged CSS. The
  only US12-specific complaint (redundant overflow longhands) was fixed by using
  the equivalent `overflow: auto hidden` shorthand. Unrelated CSS debt was not
  modified to make this feature look cleaner.

## Stage 4 — real Electron acceptance

Status: **complete**

Current-worktree Electron build completed successfully before product E2E and
was rerun after the final AC-52 terminal-branch fix. No other branch's `out/`
artifacts were used.

The dedicated `table-editing-us12.spec.ts` real-Electron gate is **2/2 Green**
on the final rebuilt source state:

1. 2×3 TSV into a non-empty 2×2 table shows the overwrite dialog with
   `R1C1–R2C3` and count `4`; Cancel leaves Markdown bytes unchanged;
   Replace expands/applies the matrix; one application Undo restores the
   original 2×2 cell semantics.
2. an ultra-wide 16-column table has table-local horizontal overflow while the
   editor/document surface itself does not gain horizontal overflow.

The E2E assertions are intentionally contract-shaped:

- cancellation remains byte-strict because AC-53 explicitly requires Markdown
  bytes unchanged;
- Undo checks restored table structure/content rather than serializer padding,
  because AC-53 says restore the table and AC-54 defines round-trip success as
  GFM/content semantic equivalence.

## Environment evidence

The fresh worktree was intentionally recovered with
`pnpm install --offline --frozen-lockfile --ignore-scripts`, so later Electron
bootstrap exposed two environment gaps that were kept separate from product
evidence:

- the package-local Electron 42.1.0 payload lacked `path.txt`. The documented
  minimal compatibility path was used: only
  `packages/desktop/node_modules/electron` was pointed at the main checkout's
  matching Electron 42.1.0 package. Source, config and build artifacts remained
  current-worktree-owned.
- the first Electron launch then exposed missing native bindings. The canonical
  native rebuild produced `ced.node` and `keytar.node` before failing while
  compiling `native-keymap` on the Windows/MSVC
  `__builtin_frame_address` incompatibility. With the required bindings now
  present, the current app launched and the intended US12 E2E bodies executed
  normally. The native-keymap compile failure is environment evidence, not a
  relaxed or skipped product assertion.

Early E2E failures before the test body (missing Electron runtime / missing
`ced.node`) were not counted as product failures. Once the body executed, a
locale-dependent English button locator was also corrected to a stable dialog
button-position selector after the Chinese UI snapshot showed the product
behavior itself was correct.

## Lessons retained

1. Table structure is an intent-level history boundary. Flushing only after a
   structural mutation is too late: pending text must be flushed before the
   mutation or one Undo can eat both actions.
2. Special terminal branches need the same transaction contract as ordinary
   branches. The final-column audit caught the whole-table-delete path precisely
   because it bypassed the otherwise-correct shared boundary.
3. Async confirmation must happen before expansion or state replacement.
   Cancel is safest when the document/history have not been touched at all.
4. Product confirmation belongs to Desktop, while table data semantics belong
   to Muya. A narrow typed callback preserves ARCH-06 instead of leaking a
   second table model into the application shell.
5. Canonical Markdown syntax changes require migrating old parity assertions;
   preserving an obsolete `<br/>` test would have contradicted the approved
   US12 `<br>` contract.
6. E2E selectors must not assume a product language. Semantic assertions should
   match the AC: byte equality where the contract says bytes, structural/content
   equality where the contract says equivalent semantics.
7. A worktree restored with `--ignore-scripts` can typecheck/build while still
   lacking Electron runtime/native-addon artifacts. Use the Electron evidence
   ladder and minimal same-version dependency recovery rather than misclassify
   bootstrap failures as product regressions.

## Stage 5 — final local closure

Status: **complete**

Final post-audit gates on the source state intended for commit:

- US12 focused acceptance: **12/12 Green**.
- existing table regression matrix: **65/65 Green**.
- repository `pnpm typecheck`: Green.
- repository `pnpm lint`: **0 errors** / 273 pre-existing warnings.
- current-worktree Electron build: Green.
- focused real-Electron US12 acceptance: **2/2 Green**.
- Windows-aware committed-content whitespace check:
  `git -c core.whitespace=cr-at-eol diff --check`: Green.

One apparent final lint failure was diagnosed before any source edit:
Playwright had generated `packages/desktop/test-results/.last-run.json`
without a trailing newline, and the repository-wide ESLint scan included that
temporary output. The ignored test-results directory was removed and the
unchanged full lint command then passed with zero errors. This is retained as
test-harness hygiene evidence, not product evidence.

## Remaining delivery

1. refresh `origin/develop` and rebase only if it advanced;
2. commit the reviewed file set, push the feature branch, open the PR and follow
   canonical CI;
3. merge only after required CI gates are Green, then verify the authoritative
   remote `develop` contains the squash result and update this record to
   closed.

