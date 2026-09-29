# TABLE-INTERACTION-SIMPLIFICATION

Status: **Local implementation/acceptance complete; final diff review and PR/CI closeout in progress**
Branch: `feat/table-interaction-simplification`
Base: `origin/develop@dc5cf07610e82e6e95183e203e2c20e00e969abc` (`fix(editor): preserve table hard-break caret (#216)`)
Scope: P1 / Table Interaction Simplification & Typora Alignment

## 1. Goal

Make Inkiva tables feel like a Markdown editor with strong table support, not a spreadsheet embedded in Markdown.

Principles:

- **Powerful Internals, Simple Surface.**
- **One Action, One Obvious Primary Entry.**
- **Selection describes what is selected. It must not silently redefine the meaning of an action.**
- Standard GFM Markdown remains the document fact; no private table syntax.
- P0 hard-break caret correctness is a protected contract, not a table-local workaround target.

Execution order:

> Audit → Diagnose → Decide → Red → Implement → Verify → Simplify → Document

## 2. Pre-mutation gate

Read before any production-code mutation:

- `AGENTS.md`
- `docs/agent/TESTING.md`
- `docs/agent/ARCHITECTURE_RELEASE.md`
- `docs/agent/WORKFLOW.md`
- `docs/agent/ENVIRONMENT.md`
- `docs/product/README.md`
- `docs/product/DESKTOP_EDITOR_INTERACTION_CONTRACT.md`
- `docs/correctness/US12-TABLE-EDITING-FIDELITY.md`
- `docs/correctness/DESKTOP-EDITOR-INTERACTION-AUDIT.md`
- `docs/correctness/TABLE-HARD-BREAK-CARET-CORRECTNESS.md`
- `docs/architecture/README.md`
- `docs/architecture/SELECTION-MAPPING-CONTRACT.md`
- `docs/architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md`

Affected architecture boundary:

- Muya remains authoritative for table/document semantics and history.
- Desktop may supply presentation callbacks such as destructive confirmation, but must not create a parallel table model.
- Selection mapping remains the generic source↔DOM contract established by P0. No delayed focus, forced cursor-to-tail, retry, or table-specific selection hack may be introduced.
- Structural changes must flow through the existing Muya mutation/history path and remain one logical user operation.

Environment note:

- The original registered checkout was dirty on a prior closeout branch.
- Managed worktree bootstrap was unavailable on this Runner; per `ENVIRONMENT.md`, a clean Git-native `.worktrees/table-interaction-simplification` slot was created from current `origin/develop`.
- The P1 worktree is clean and isolated.

## 3. Current Typora acceptance reference

Current Typora public documentation was checked during Stage 1 rather than inferred from historical issues.

Observed public interaction baseline:

- row/column insertion and deletion are primarily available from table context menus;
- `Ctrl/Cmd+Enter` inserts a row below the current row;
- final-cell `Tab` can append a row;
- an existing table exposes resize and alignment from a compact table tooltip;
- row/column reordering is direct manipulation from the table border;
- Typora documents `Alt+↑/↓` as a row-move keyboard path.

This is an interaction baseline only. Inkiva rectangular selection, TSV paste, rich clipboard and stronger atomic operations remain **Inkiva Extensions**.

## 4. Current Inventory

Facts below come from current `develop` code / executable contracts, not older requirements.

| Action / area | Current entry | Current behavior | Typora-like target / Inkiva Extension | Desired behavior | Decision |
| --- | --- | --- | --- | --- | --- |
| Enter | keyboard | moves to same column in next row; last row is no-op | Core | same; last row remains no-op, no implicit structure | Keep |
| Shift+Enter | keyboard | inserts literal `<br>`, restores logical/native caret after token | Core + protected P0 | same exact P0 contract | Keep |
| Ctrl/Cmd+Enter | keyboard | inserts row below current row, focuses first cell | Core | same, atomic | Keep |
| Tab | keyboard | next cell; final table cell inserts row then enters first cell | Core | same | Keep |
| Shift+Tab | keyboard | previous cell; first cell stays put | Core | same; no structure | Keep |
| ArrowUp | keyboard | same-column previous row, then content before table | Core navigation | natural navigation; no structure | Keep with regression |
| ArrowDown | keyboard | same-column next row; after last row moves after table; if table is final block it creates a paragraph | Core navigation | navigation only; when no existing destination, no-op instead of creating structure | **Change** |
| Alt+↑/↓ | no table command today | no dedicated table-row move binding found | Accessibility/Core baseline | move current row up/down only when caret is in table; boundary no-op | **Add fallback** |
| Cell context menu | right-click cell | Insert Row Above/Below, Insert Column Left/Right, Delete Row/Column/Table; keyboard navigable | Core | primary structural-command entry | Keep / primary |
| Right row-edge menu | short click on row drag bar | Insert Row Above/Below, Move Up/Down, Remove Row | duplicate surface | edge is direct manipulation / selection only | **Remove menu behavior** |
| Bottom column edge | drag handle | direct reorder; no symmetric short-click popup from drag bar | direct manipulation | direct manipulation / selection | Keep direct only |
| Column hover toolbar | hover above column | Left/Center/Right, Insert Left/Right, Remove Column | duplicate spreadsheet-like command bar | compact table properties only: size + alignment including Default | **Repurpose** |
| Drag row/column | border drag bar, 300 ms hold | visual transform then atomic `moveRow/moveColumn`; existing E2E covers Undo/no-target release | Core | primary move entry; invalid/cancel zero mutation | Keep / simplify trigger surface |
| Existing-table resize | none | no Rows×Columns property entry found | Core | table property toolbar exposes Rows×Columns | **Add** |
| Alignment state | column hover toolbar / bottom edge menu | `none/left/center/right`; clicking current explicit alignment toggles to `none` | Core | preserve four document states; explicit Default restore | **Change UI, preserve model** |
| Rect selection | pointer drag across cells | freezes native range, highlights rectangular cells, active content becomes null | Inkiva Extension | keep; selection is target only | Keep |
| Rect Delete/Backspace | keyboard | first press clears non-empty cells; already-empty whole row/column/table escalates to structural deletion | Inkiva Extension with surprise | always clear content; repeated Delete = zero mutation; never structural | **Change** |
| Rect Cut | clipboard cut | whole table can be removed even with content; empty whole rows/columns can be structurally removed | Inkiva Extension with surprise | Copy + clear cell content only; structure never changes | **Change** |
| Single-cell copy | clipboard | plain cell text | Core | plain text, no surprising table structure | Keep |
| Multi-cell copy | clipboard | builds GFM + HTML internally, but NORMAL copy writes Markdown to `text/plain` and blanks `text/html` | Inkiva Extension | interoperable table payload: TSV plain text + HTML table; explicit Copy-as-Markdown remains Markdown path | **Change** |
| Single cell + scalar paste | clipboard | literal insertion/replacement depending native/frozen selection | Core | deterministic normal paste | Keep / cover |
| Single cell + rectangular TSV | clipboard | matrix from anchor; can expand; confirmation before overwriting non-empty target | Inkiva Extension | same; no truncation; atomic | Keep |
| Multi-cell + scalar paste | clipboard | **silent no-op** | Inkiva Extension | fill every selected cell with scalar value, atomic | **Change** |
| Multi-cell + matching matrix | clipboard | matrix path uses active anchor block, not selection range contract; selection semantics unclear | Inkiva Extension | selection anchor + deterministic matrix mapping | **Change / pin** |
| Multi-cell + smaller matrix | clipboard | not formally defined | Inkiva Extension | write only matrix footprint from selection anchor; do not repeat/fill remainder | **Define** |
| Matrix larger than selection | clipboard | current matrix helper expands from cell anchor as needed | Inkiva Extension | expand from selection anchor as needed, subject to destructive overwrite confirmation | **Define / keep engine ability** |
| Malformed TSV | clipboard | warning callback + literal fallback in one cell; multi-cell frozen selection then hits silent no-op | Inkiva Extension | warning + literal scalar fallback; with rect selection fill selected target deterministically | **Change** |
| Overwrite confirmation | desktop callback | request identifies target range/non-empty count; Cancel zero mutation; missing callback silently refuses | safety | desktop path must always provide feedback; engine must not mutate without required confirmation | Keep, add explicit fallback contract |
| Undo/Redo | Muya history | structural mutations use `runUserOperation`; some rect clear paths mutate leaves directly | correctness | every explicit table user action one logical history unit | **Change rect mutation path** |
| Source/WYSIWYG | Muya Markdown state | standard GFM, `<br>` P0 mapping, alignment metadata serialize to delimiters | correctness | stable round-trip, no unsolicited normalization/private syntax | Keep |
| IME | table cell compose handler | Safari/CJK zero-width workaround plus broader Source/WYSIWYG coverage | correctness | composition never triggers table commands prematurely | Keep / regress |
| Large table | normal Table model | no separate spreadsheet model | correctness | preserve correctness; no new O(N²) hover work on hot path | Keep / regress |
| Horizontal scroll | existing table surface | existing behavior outside P1 model changes | correctness | no regression | Keep / regress |
| Accessibility | cell menu keyboard support; hover property toolbar controls are focusable once shown; drag needs non-pointer fallback | mixed | Core | keep the visible surface Typora-like; row move has `Alt+↑/↓`; do not pollute the context menu with accessibility-only duplicate commands | **Improve without duplicate UI** |

## 5. Diagnosed interaction problems

### 5.1 Duplicate structural surfaces

Current Desktop registers all three table affordance plugins:

- `TableColumnToolbar`
- `TableDragBar`
- `TableRowColumMenu`

The current surfaces overlap:

- Cell context menu owns row/column insert/delete.
- Row edge short-click menu repeats insert/remove and adds move.
- Column hover toolbar repeats insert/remove and alignment.
- Border drag already provides row/column move directly.

This violates “one action, one obvious primary entry”.

### 5.2 Selection semantic escalation

`TableRectSelection.emptySelectedCells()` explicitly documents the old two-stage delete model. `removeEmptyTableStructure()` then interprets selected geometry as permission to delete rows, columns, or the table.

That violates the P1 invariant:

> Selection describes the target; it does not change Delete from content deletion into structure deletion.

### 5.3 Cut changes structure

Frozen table Cut can remove a whole table or empty whole rows/columns. This makes Cut dependent on hidden geometric state instead of being the normal “copy then remove selected content” operation.

### 5.4 Paste has a real silent no-op

For a frozen multi-cell selection, `applyLiteralPaste` returns immediately when the selection contains more than one cell. There is no visible state change and no feedback.

### 5.5 Existing-table size is not a property

Creation has `TableChessboard`, but an existing table has no unified Rows×Columns property surface. Users must use repeated structural edits instead of one explicit resize command.

### 5.6 Alignment model is sound but the UI is not explicit

The model already preserves `none`, `left`, `center`, `right`. The current hover toolbar exposes only three explicit icons and relies on clicking the active alignment again to return to `none`.

The document semantics must remain four-state; the simplified property UI will expose an explicit Default state.

## 6. Final product decisions before Red

### 6.1 Keyboard contract

- `Enter`: next row, same column. Last row = no-op. Never inserts `<br>`, never adds a row.
- `Shift+Enter`: one hard break `<br>` at the caret, P0 selection mapping unchanged.
- `Ctrl/Cmd+Enter`: insert one row below; focus the new row.
- `Tab`: next cell; final cell adds exactly one row and focuses its first cell.
- `Shift+Tab`: previous cell; first cell = no-op.
- Arrow keys: navigation only. They must not create rows/paragraphs, delete structure, resize, or switch into a hidden table mode.
- `Alt+↑/↓`: keyboard-accessible current-row move, only inside a table. Boundary = no-op.
- Do not add a broad family of new table shortcuts.

### 6.2 Rectangular selection contract

- Rect selection remains an Inkiva Extension.
- Delete/Backspace clears cell content only.
- Repeated Delete on an already-empty selection performs zero document mutation and keeps structure.
- Cut = Copy + clear selected content only.
- Selecting all cells in a row/column/table never grants implicit structural-delete authority.
- Explicit context-menu/command actions remain the only row/column/table deletion path.
- Multi-cell clear/cut is one atomic history transaction.

### 6.3 Paste contract

Selection anchor is the target origin.

- Scalar + multi-cell range: fill all selected cells with the scalar.
- Matching matrix: overwrite the selected footprint deterministically.
- Smaller matrix: overwrite only the matrix footprint from anchor; leave the remaining selected cells unchanged.
- Larger matrix: continue from anchor and expand the table when needed. Never silently truncate.
- Existing non-empty target cells remain protected by the current destructive overwrite confirmation.
- Malformed tabular text falls back to literal scalar content (newlines become the normal table hard-break representation) and reports the existing warning; for a rectangular target it fills that selected target rather than doing nothing.
- One paste = one history transaction.
- Cancelled destructive confirmation = zero document/history mutation.

### 6.4 Clipboard contract

- Single selected cell: `text/plain` is the cell text.
- Multi-cell rectangular selection:
  - normal copy: `text/plain` is TSV for spreadsheet/plain-text interoperability;
  - `text/html` is a semantic HTML table for rich/spreadsheet targets;
  - explicit Copy as Markdown retains the GFM table representation.
- No proprietary persisted Markdown syntax or hidden document metadata is introduced.

### 6.5 Resize contract

Add an atomic table-model resize operation and expose it from the compact table property toolbar as **Rows × Columns**.

- Expand: preserve existing content/alignment; new cells empty.
- Shrink empty outside area: direct atomic resize.
- Shrink with non-empty discarded cells: explicit confirmation before mutation.
- Cancel: zero mutation/history.
- Confirm: one mutation/history item.
- Undo restores full former dimensions/content/alignment.
- Minimum valid table remains compatible with the existing GFM model.

### 6.6 Alignment contract

- `none` = Default and remains distinct from explicit Left.
- Property UI exposes Default, Left, Center, Right.
- Setting Default explicitly writes `none`.
- No user alignment action means no delimiter normalization.
- Alignment remains a column property and one atomic operation.

### 6.7 Entry-point architecture

- **Keyboard:** high-frequency continuous editing only.
- **Cell context menu:** primary explicit structural commands.
- **Table property toolbar:** Rows×Columns + Default/Left/Center/Right only; no insert/delete/move duplication.
- **Border/handle:** selection + drag reorder direct manipulation only.
- **Move accessibility:** row uses `Alt+↑/↓`. Column move remains direct border manipulation in P1; do not add duplicate Move Left/Right context-menu commands merely as a fallback.
- **Property accessibility:** `Alt+Enter` / Option+Enter from a table cell opens and focuses the compact property toolbar; this provides keyboard access without adding a duplicate `Table Properties` context-menu item.

## 7. Removed duplicate entry points — intended Before / After

| Before | After |
| --- | --- |
| row edge short-click command menu | no structural popup; edge remains direct-manipulation affordance |
| column hover toolbar with insert/remove | compact property toolbar only |
| edge-menu Move commands + drag | drag primary; `Alt+↑/↓` remains the row keyboard fallback only |
| alignment in edge menu + hover toolbar | one property toolbar |
| insert/delete in cell menu + edge/hover UI | cell context menu primary |

## 8. Red plan

Production code stays untouched until executable Red evidence is obtained for target behavior.

Focused Red cases:

1. Rect Delete/Backspace over full row/column/table never changes dimensions, including repeated Delete.
2. Rect Cut over full row/column/table clears content only and one Undo restores it.
3. Multi-cell scalar paste fills the range instead of silent no-op.
4. Matching/smaller/larger matrix selection behavior is deterministic and atomic.
5. Malformed TSV over a rectangular target gives fallback behavior rather than silent no-op.
6. ArrowDown at the final table cell does not create a paragraph.
7. UI contract proves edge menus no longer expose structural duplicates and the property toolbar contains only size/alignment.
8. Resize model: expand, shrink-empty, shrink-non-empty confirmation boundary, Cancel/Confirm/Undo.
9. Explicit Default alignment round-trip.
10. `Alt+↑/↓` row movement and boundaries.

Each Red command/result will be appended below before the corresponding production mutation.

## 9. Red evidence

Environment readiness:

- Node `v24.21.0`
- pnpm `10.33.4`
- `pnpm install --offline --frozen-lockfile --ignore-scripts` completed successfully in the isolated worktree.
- Existing keyboard smoke entered the intended test body and passed: `enterHandler.spec.ts` = **6/6 green**.
- The isolated install intentionally skipped lifecycle scripts, so native Electron acceptance initially could not start (`electron/path.txt` was absent). Running Electron's install script restored the runtime. A full `rebuild-native` then exposed an unrelated Electron 42 / MSVC `native-keymap` compile failure (`__builtin_frame_address`); targeted `electron-rebuild -f -o ced` rebuilt the startup-critical missing module without changing product code. This is environment evidence, not a table failure.

Engine/product Red command:

```
pnpm --filter @muyajs/core exec vitest run src/clipboard/__tests__/p1TableInteractionSimplification.spec.ts
```

Observed current behavior before production mutation:

- **6 target assertions failed, 1 already passed**.
- repeated Delete over the whole-table rectangle removed the table, so the expected table no longer existed;
- Cut over a whole-table rectangle removed the table;
- scalar paste over a multi-cell rectangle left the original cells unchanged (silent no-op);
- matching 2×2 TSV matrix paste from the selected anchor was already green;
- ArrowDown in the final table row changed document block count from 1 to 2 by appending a paragraph;
- Alt+Down did not reorder the row;
- existing-table `resize` API was absent.

Visual-surface Red command:

```
pnpm --filter @muyajs/core exec vitest run src/ui/tableColumnToolbar/__tests__/p1TableSurfaceContract.spec.ts
```

Observed current behavior:

- **3/3 target assertions failed**;
- right/bottom edge menu configuration still exposes structural/move/alignment commands;
- column hover toolbar still exposes alignment + insert/remove instead of size + four-state alignment properties;
- drag-bar short-click source still emits `muya-table-bar`, opening a duplicate row command popup.

These failures execute the intended product assertions and are not environment/bootstrap failures. Production mutation is allowed after this point.

## 10. Implementation / Green evidence

Stage 3 semantic/UI implementation is complete enough to enter native Electron acceptance. This is **not** final task completion.

### 10.1 Semantic changes

Implemented in Muya rather than Desktop shadow state:

- rectangular Delete/Backspace is content-only; selection geometry never escalates into row/column/table deletion;
- rectangular Cut is copy + clear only;
- multi-cell clear/cut runs inside one history user operation;
- scalar paste fills the selected rectangle;
- matrix paste now uses the frozen rectangular-selection anchor even when the native/text caret is elsewhere;
- smaller matrix writes only its own footprint;
- larger matrix expands from the selection anchor instead of truncating;
- malformed TSV reports fallback and applies literal content to the selected target;
- cancelled destructive matrix overwrite is zero document/history mutation;
- normal rectangular Copy publishes TSV `text/plain` + semantic HTML; explicit Copy as Markdown preserves GFM;
- final-row ArrowDown no longer creates an unrelated paragraph when no navigation destination exists;
- `Alt+↑/↓` is the row keyboard move fallback;
- existing-table resize is an atomic Table mutation with a pure preflight impact report;
- exact four-state column alignment setter preserves Default/Left/Center/Right without breaking the pre-existing toggle API.

### 10.2 Surface simplification

Actual duplicate-entry removal:

- right row-edge command popup removed;
- bottom edge command list removed;
- short-click border handles now select the corresponding row/column instead of opening structure menus;
- column hover toolbar no longer contains insert/remove commands;
- compact property toolbar is exactly `Rows × Columns` + Default/Left/Center/Right;
- border drag remains the primary visual reorder entry;
- cell context menu remains the primary row/column/table structural entry.

Accessibility paths are deliberately secondary rather than permanent UI:

- row move: `Alt+↑/↓`;
- column move is not duplicated into the context menu; border drag remains the visible P1 path;
- the cell context menu is again exactly seven structural commands, matching the simplified product model;
- the property toolbar remains exactly Rows×Columns + Default/Left/Center/Right; its controls expose toolbar/button roles, accessible names, visible focus targetability, and Enter/Space activation once visible;
- `Alt+Enter` / Option+Enter from a table cell reveals the same property toolbar and focuses its first control; no menu duplication is required.

### 10.3a Surface correction after visual review

Real-app visual review exposed that the initial accessibility fallback implementation had made the cell context menu visibly heavier than the intended Typora-like surface. It also exposed untranslated `Move Column Left/Right` labels under zh-CN because those fallback labels had no locale entries.

Correction applied before continuing acceptance:

- removed `Move Column Left` / `Move Column Right` from the cell context menu;
- removed `Table Properties` from the cell context menu;
- removed the dedicated `muya-table-properties` menu→toolbar bridge;
- restored the context menu to exactly seven structural entries: insert row above/below, insert column left/right, delete row/column/table;
- retained the compact property toolbar as the only size/alignment surface;
- updated Electron acceptance to reveal the property toolbar through its real hover/top-edge path rather than a test-only or duplicate command gateway.

This is a product-surface correction, not a relaxation of correctness. Keyboard access was closed later with a cell-local `Alt+Enter` / Option+Enter gateway to the existing property toolbar rather than by reintroducing visible duplication.

### 10.3 Resize confirmation boundary

- Muya reports resize impact (`rowsRemoved`, `columnsRemoved`, `nonEmptyCount`) without mutation.
- The toolbar orchestration asks the embedder only when discarded cells contain content.
- Desktop supplies `confirmTableResize` and an explicit Cancel / Resize dialog.
- Cancel, Escape, or dialog close resolves false before any mutation.
- Confirm performs one atomic Muya resize; one Undo restores dimensions, content, and alignment.
- Non-destructive expansion/shrink bypasses the confirmation dialog.

### 10.4 Focused executable evidence

Current focused P1 tests include:

- whole-table repeated Delete + history no-op;
- whole-row Delete;
- whole-column Backspace;
- whole-table / row / column Cut structure preservation;
- scalar, matching matrix, smaller matrix, larger matrix, malformed TSV, overwrite Cancel;
- selection-anchor-vs-caret placement;
- real rectangular paste with the ordinary text/native selection intentionally absent;
- TSV/HTML/GFM clipboard representations;
- ArrowDown boundary;
- Alt+Down row movement;
- resize expand/shrink/impact/Cancel/Confirm/Undo;
- exact alignment states;
- duplicate-entry surface contract;
- simplified seven-command context-menu contract;
- locale completeness.

Latest focused results before the final freeze:

```
p1TableInteractionSimplification.spec.ts: 14/14
resizeConfirmation.spec.ts:             3/3
p1TableSurfaceContract.spec.ts:          4/4
tableCellContextMenu.spec.ts:            2/2
```

A wider focused regression batch immediately before the extra edge cases was **73/73 green** across clipboard, resize/alignment, legacy alignment-toggle compatibility, surface contract, and locale completeness.

The post-Electron integration fix also strengthened `p1TableInteractionSimplification.spec.ts`: rectangular scalar paste explicitly sets ordinary `TextSelection.getSelection()` to `null`, proving the table range itself owns paste targeting.

Final diff review found one additional contract mismatch before commit: TSV matrix overwrite used the destructive confirmation callback, but scalar/malformed rectangular fallback could overwrite non-empty selected cells without it. A new focused Red reproduced the gap exactly: `p1TableInteractionSimplification.spec.ts` ran **14 tests with 1 failed / 13 passed**, and the failed assertion observed `confirmTableOverwrite` was called **0 times** for a non-empty scalar rectangular target. Production code now routes matrix and scalar/malformed rectangular overwrite through one shared range preflight. The same spec is now **14/14 green**, and Cancel returns before document/history mutation.

Final frozen focused gate after the accessibility gateway, paste integration repair, visual-surface correction and line-ending cleanup:

```
enterHandler.spec.ts + p1ResizeAlignment.spec.ts +
p1TableInteractionSimplification.spec.ts + resizeConfirmation.spec.ts +
p1TableSurfaceContract.spec.ts + tableCellContextMenu.spec.ts
=> 35/35 passed
```

Muya type validation:

```
pnpm --filter @muyajs/core exec tsc --noEmit
```

Result: **green** after the P1 changes.

Desktop `vue-tsc` remains blocked by the repository's existing imported-Muya declaration baseline (global `__MUYA_BLOCK__`, `MUYA_VERSION`, FileIcons typings, sequence/prism declarations and related existing errors). The run did **not** report a new P1 `ITableResizeRequest` or resize-dialog error. This is recorded as a baseline validation blocker; unrelated production code will not be changed to mask it.

### 10.5 Still required before Done

Completed after Stage 3:

- relevant broader Muya/desktop regression suites;
- real Electron A–K acceptance;
- Source/WYSIWYG round-trip acceptance after combined operations;
- synthetic Electron composition-lifecycle acceptance plus existing Source/IME regressions;
- drag invalid/Undo acceptance;
- large/wide-table horizontal-scroll regression evidence;
- durable product and selection-architecture contract updates.

Still pending final closeout only:

- final diff/status/hygiene review;
- PR/CI review and merge workflow.


## 11. Electron acceptance

Windows Electron acceptance is complete for the P1 interaction contract. macOS-native IME/candidate-window behavior remains a platform acceptance item and is not claimed by synthetic Electron composition tests.

Dedicated command:

```
pnpm -C packages/desktop exec playwright test test/e2e/table-interaction-p1.spec.ts --config=test/e2e/playwright.config.ts --workers=1
```

Final frozen result after the keyboard-accessibility gateway, selection-owned paste repair, unified overwrite confirmation, surface cleanup and geometry-stable drag harness: **8/8 passed (34.3s)**.

Covered flows:

- **A/B:** continuous keyboard editing, `Shift+Enter` hard break, final-cell `Tab` growth, focus continuity, Undo;
- **C:** each primary context-menu row/column structural action plus atomic Undo;
- **D/E:** `Alt+Enter` keyboard reveal/focus plus normal hover reveal of the same compact property toolbar, 3×3→5×4 resize, destructive 5×4→2×2 Cancel/Confirm/Undo, exact Default/Left/Center/Right alignment and Source/WYSIWYG round-trip;
- **F:** real 300ms-hold border-handle row reorder, column reorder, Undo, and sub-threshold invalid drag with zero Markdown change;
- **G/H:** rectangular Delete/repeated Delete/Cut over row/column/table targets with structure preserved and Undo restoration;
- **I:** scalar fill, matrix overwrite, malformed fallback, larger-than-selection expansion, and destructive confirmation for every non-empty rectangular overwrite path;
- **J:** hard-break WYSIWYG→Source→WYSIWYG stability;
- **K:** CJK composition lifecycle followed by Tab, hard break and paste without structural mutation.

Electron acceptance discovered one real integration defect that the initial unit test had masked: rectangular selection deliberately removes the browser text range, but `applyPaste()` previously returned when `TextSelection.getSelection()` was absent before consulting the table selection. The fix now derives paste context directly from `TableRectSelection.getRange()`; no focus/caret retry or synthetic table caret was introduced.

Adjacent Electron regressions:

```
table-editing-us12.spec.ts + table-hard-break-roundtrip.spec.ts + us14-source-wysiwyg.spec.ts
=> 10/10 passed (1.1m)

restore-buffer-store.spec.ts + virtualization-complex-blocks.spec.ts
=> 6/6 passed (36.0s)
```

These runs cover the existing US12 context-menu and TSV contracts, ultra-wide horizontal scrolling, `<br>` save/reopen and typed-token caret continuity, Source/IME mode-transition safety, recovery/buffer-store behavior, and distant virtualized table edit→Undo.

Final local quality gates:

- `pnpm lint` — **0 errors** (repository baseline warnings remain);
- `pnpm test:arch:muya-types` — **1/1 passed**;
- `pnpm --filter @muyajs/core exec tsc --noEmit` — **green**;
- EOL-aware `git diff --check` — **green** after restoring `editor.vue` to its tracked CRLF convention and `tableCell/index.ts` to its tracked LF convention, eliminating whole-file line-ending noise.

Desktop full `vue-tsc` remains the same pre-existing imported-Muya declaration baseline blocker already recorded above; no unrelated declaration workaround was introduced for P1.

PR closeout note: PR #217's first CI pass exposed two `antfu/curly` errors in the newly added shared overwrite-preflight guards in `clipboard/paste.ts`. This was a Muya-package lint rule not surfaced by the root lint command. The failure was diagnosed from the exact `Muya Lint` job log and corrected by adding braces only; no behavior changed. The Muya-package lint command is part of the final pre-push revalidation for the follow-up commit.

## 12. Lessons

Reusable lessons from P1:

1. **A structured selection can be the authoritative selection even when the browser has no Range.** Table rectangle selection intentionally clears native selection. Clipboard/delete code must consult the structured selection before requiring text-selection state. This invariant is now recorded in `docs/architecture/SELECTION-MAPPING-CONTRACT.md`.
2. **Do not let a test-only caret hide a selection-ownership bug.** The first table-paste unit test stubbed an ordinary caret and therefore could not reproduce Electron behavior. At least one regression for a non-text selection must explicitly prove the normal text/native selection is absent.
3. **Accessibility fallback must not silently duplicate the product surface.** Adding `Move Column Left/Right` and `Table Properties` to the context menu made the UI heavier than the Typora-aligned model and exposed untranslated fallback labels. Keep primary surfaces simple; solve keyboard reachability as its own interaction problem rather than turning one menu into an all-purpose command catalog.
   The resulting pattern is `Alt+Enter` / Option+Enter → focus the existing compact property toolbar; the structural context menu remains unchanged.
4. **Float-tool E2E must reproduce its real geometry owner.** Column reorder is exposed on the table bottom border, not every internal row boundary; property tools are revealed from the table top edge. Tests should drive the actual border/hover geometry instead of invoking model methods or inventing alternate gateways.
5. **Native-module bootstrap failures are not product regressions.** `--ignore-scripts` correctly isolated install side effects but required an explicit Electron/native bootstrap for E2E. The unrelated `native-keymap` Electron-42/MSVC build failure was kept outside the P1 product diff rather than “fixed” to make a table gate green.
