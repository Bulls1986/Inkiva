# DESKTOP-INTERACTION-AUDIT — Desktop Editor Interaction Contract Closure

Status: **Merged into `develop`; Windows native acceptance complete; macOS titlebar/chrome native acceptance not claimed**
Original audit base: `develop@66738573c2c2cbaf494b13f3d860035f1fab8c5f`
Original audit branch: `audit/desktop-editor-interaction-contract` (retired after PR #215)
Contract: [Desktop Editor Interaction Contract](../product/DESKTOP_EDITOR_INTERACTION_CONTRACT.md)

## Goal

Audit the normative desktop interaction contract against the current implementation and executable tests, record every mismatch as a TODO, and close each clear v0.5.0 release violation test-first without weakening existing gates.

## Architecture / testing gate

- Read `AGENTS.md`, `docs/agent/TESTING.md`, `docs/agent/ARCHITECTURE_RELEASE.md`, `docs/product/README.md`, and the interaction contract before production mutation.
- Production fixes require executable Red evidence first.
- Renderer interaction stays behind existing Vue/Muya/typed IPC boundaries; no new raw IPC escape path is permitted.
- Real Electron coverage is required where native keyboard, focus, pointer, double-click, or window chrome semantics are the failure mode.

## Initial audit matrix

| Contract area | Current evidence | Classification | TODO |
| --- | --- | --- | --- |
| §4 Pointer / editor I-beam | Muya editable blocks and table cells explicitly use `cursor: text`; Source CodeMirror lines also use `cursor: text`. | Implemented; regression coverage still to verify | TODO-08 |
| §5 Focus | Existing correctness records/tests cover parts of focus restoration; full contract cross-check pending. | Audit pending | TODO-09 |
| §6 Command authority / Ctrl-K | Typora preset maps hyperlink to Ctrl/Cmd+K, but the persistent titlebar launcher hard-codes a Ctrl/Cmd+K hint. MarkText base maps hyperlink to Ctrl/Cmd+L and TOC to Ctrl/Cmd+K. | Contract violation / authority drift | TODO-03 |
| §7 Title bar | Persistent `command-launcher` search-like control remains in custom title bar and responsive tests explicitly require it. | Contract violation | TODO-02 / TODO-04 |
| §8 Sidebar/global search | Left-sidebar search audit pending; top titlebar surface currently violates single-surface rule. | Partial / audit pending | TODO-02 |
| §9 Recent Documents | Current row has an Open button whose single click immediately opens. No row-level selection/double-click contract is implemented by the inspected component; E2E only covers pin/remove/clear. | Contract violation + missing coverage | TODO-01 |
| §10 WYSIWYG / Source | General round-trip coverage exists; table hard-break abstraction needs targeted contract audit. | Audit pending | TODO-06 |
| §11 IME | Existing US08 coverage exists; table-cell IME acceptance still to verify. | Under audit | TODO-09 |
| §12 Undo/redo | Existing US13 coverage exists; table structural undo acceptance still to verify. | Under audit | TODO-07 |
| §13 Context menus | General context menu infrastructure exists; table-cell structural menu availability not yet proven. | Audit pending | TODO-07 |
| §14 Table editing | Plain Enter currently calls the same hard-break path as Shift+Enter and inserts `<br>`; Tab navigation and Ctrl/Cmd+Enter row insertion already have unit coverage. | Direct contract violation | TODO-05 / TODO-06 / TODO-07 |
| §15 Links | Typora preset is correct, but command authority is inconsistent across presets/UI hint. | Contract violation | TODO-03 |
| §16 Tabs/switching | Covered by v0.5 restore/correctness work; cross-check pending. | Audit pending | TODO-09 |
| §19 Responsive interaction | Current titlebar test protects launcher geometry instead of the new no-top-search contract. | Test encodes obsolete behavior | TODO-04 |
| §20 Accessibility | Primary audit pending; recent-row selection/context menu changes must preserve keyboard/focus semantics. | Audit pending | TODO-09 |
| §22 Immediate v0.5 closure | 1/2/3/4/5 are confirmed not fully compliant from static inspection; 6/7 need executable verification; 8 appears implemented. | Active closure | TODO-01..08 |

## TODO queue

### TODO-01 — Recent Documents native list semantics
- Single click selects; it must not open.
- Double-click opens the selected item.
- Enter on the keyboard-selected item opens it.
- Add real Electron regression coverage for the reported double-click failure.
- Audit missing/inaccessible file handling and Recent context-menu behavior; close small defects or record bounded follow-up debt.

### TODO-02 — Remove persistent titlebar search/launcher surface
- Remove the top/titlebar `command-launcher` surface.
- Keep command palette functionality reachable through its registered command/menu path.
- Confirm global/document-library search remains in the left sidebar only.
- Replace obsolete tests that require the titlebar launcher with tests that require its absence.

### TODO-03 — Restore one authoritative Ctrl/Cmd+K semantic
- Preserve Ctrl/Cmd+K for `format.hyperlink`.
- Ensure no active default command (including TOC/global search) claims the chord in any supported preset.
- Eliminate hard-coded shortcut hints outside the command/keybinding authority.
- Add explicit conflict regression coverage.

### TODO-04 — Rebaseline responsive titlebar contract
- Update the real Electron width matrix for the launcher-free layout.
- Assert no overlap, clipping, accidental horizontal scroll, or unreachable essential controls at supported widths.
- Keep macOS native titlebar behavior as a separate/manual platform gate when the current runner cannot prove it.

### TODO-05 — Table plain Enter navigation
- Replace the old US12 behavior where plain Enter inserts `<br>`.
- Plain Enter moves to the cell directly below in the same column when one exists.
- Define/test safe last-row behavior without inventing malformed Markdown.

### TODO-06 — Table hard-break WYSIWYG abstraction / round-trip
- Shift+Enter remains the explicit in-cell hard break.
- Literal serialization syntax must not leak as visible editable WYSIWYG text.
- Verify Source Mode sees the serialized source and save/reopen/mode-switch round-trip does not duplicate/escape the break.

### TODO-07 — Table structural context menu and undo
- Verify/add Insert Row Above/Below, Insert Column Left/Right, Delete Row, Delete Column, Delete Table.
- Verify safe last-row/column behavior.
- Verify Delete Table and structural changes are atomic/undoable and leave meaningful focus.

### TODO-08 — Editable pointer semantics
- Confirm existing I-beam implementation is protected by focused regression tests and does not override links, task controls, table handles, or drag affordances.

### TODO-09 — Broader contract residual audit
Cross-check focus restoration, visible focus, IME protection, selection preservation, undo grouping, tab switching, feedback, responsive interaction, and accessibility. Fix bounded defects in scope; record platform/manual or larger follow-up gates explicitly rather than claiming unexecuted proof.

## Stage 1 — Static discovery (2026-09-28)

Completed:
- Confirmed latest base includes US17 closure.
- Confirmed the contract is normative and contains eight immediate v0.5.0 closure items.
- Confirmed four concrete implementation/test drifts before mutation:
  1. Recent item single-click currently opens instead of selecting.
  2. Persistent titlebar command/search launcher still exists and advertises Ctrl/Cmd+K.
  3. Shortcut authority differs between base maps, Typora overrides, and hard-coded titlebar UI.
  4. Table plain Enter still inserts the same `<br>` token as Shift+Enter.
- Confirmed pointer I-beam styling already exists for WYSIWYG editable regions, table cells, headings, and Source CodeMirror lines.
- Confirmed current titlebar/command-palette tests encode the obsolete top launcher as required behavior.

Next:
1. Add/adjust focused tests to express the new contract.
2. Execute Red evidence.
3. Fix TODO-01 through TODO-08 in bounded increments.
4. Run broader regression and complete TODO-09 audit.

## Stage 2 — TODO-05 Table plain Enter closure (2026-09-28)

Status: **implementation closed; canonical Vitest rerun blocked by known dependency damage**

Pre-mutation gates:
- Read the Windows environment contract, prior US12 table fidelity record, and ARCH-06 Muya public-boundary record.
- The new desktop interaction contract supersedes US12 only for plain Enter semantics; Shift+Enter hard break and Ctrl/Cmd+Enter row insertion remain intact.

Test-first evidence:
- Updated `enterHandler.spec.ts` before production mutation so plain Enter expects same-column downward navigation and no Markdown mutation; last-row Enter expects a safe no-op.
- The canonical Vitest command could not reach test discovery because the available donor graph is incomplete: first `vitest` was absent, then direct launcher startup failed on the repository-known `tinyexec/index.js` missing-payload symptom. Frozen offline/online repair attempts were bounded and either stalled or timed out. These are environment observations, not product Red.
- To avoid weakening the gate, an executable Node + repository `tsx` probe imported and invoked the real `TableCellContent._normalEnter` method. Red failed exactly on the product assertion:
  `plain Enter must not route through hard-break insertion` (`actual true !== expected false`).

Implementation:
- `TableCellContent._normalEnter` now owns/prevents the Enter event.
- When a next row exists, it resolves the current column index and moves the caret to the corresponding cell below.
- In the last row, plain Enter performs no document mutation and does not insert a hard-break token.
- Shift+Enter and Ctrl/Cmd+Enter branches were not changed.

Green evidence:
- The identical real-method Node probe is Green after the fix, including the last-row no-mutation case.
- The updated Vitest regression remains the canonical suite coverage and must be rerun once the dependency graph is healthy; no pass is claimed for that unavailable gate.

Result:
- **TODO-05 implementation closed.**
- Environment debt remains separate from product correctness and does not authorize skipping final CI/healthy-runner validation.

## Stage 3 — TODO-06 Table hard-break WYSIWYG closure (2026-09-28)

Status: **core renderer closed; full Electron save/reopen round-trip remains a healthy-runner gate**

Test-first evidence:
- Repurposed the obsolete US12 plain-Enter test to protect the new `Shift+Enter` hard-break contract.
- Added a focused renderer contract test before production mutation: the serialized `<br>` marker must be hidden/output-only while the rendered WYSIWYG surface contains a real `br` vnode.
- Because canonical Vitest remains blocked before discovery by the known incomplete dependency graph, a direct Node + repository `tsx` probe imported and executed the real `htmlTag('br')` renderer.
- Red failed on the product contract: `expected hidden marker plus rendered br`. The prior renderer returned one vnode containing both the visible source marker and the real break.

Implementation:
- Preserved `<br>` as the Markdown serialization/internal token.
- Changed the `br` renderer to emit a dedicated `MU_HIDE + MU_HTML_TAG + MU_OUTPUT_REMOVE` marker vnode plus a separate real `br` vnode.
- This keeps Source/serialization semantics intact while preventing literal `<br>` syntax from being presented as normal WYSIWYG content.

Green evidence:
- The identical real-renderer probe passes after the change: hidden/output-remove marker is present and the second vnode is the real `br`.
- Canonical Vitest and full Electron Source Mode/save/reopen/mode-switch round-trip are still required on a healthy dependency graph; no unexecuted pass is claimed.

Result:
- **TODO-06 core WYSIWYG implementation closed.**
- Remaining acceptance gate: real Electron round-trip proving Source Mode literal representation and no duplicate/escaped hard break after mode switch/save/reopen.

## Stage 4 — TODO-02 / TODO-03 / TODO-04 Titlebar + Ctrl/Cmd+K closure (2026-09-28)

Status: **implementation closed; real Electron responsive matrix remains a healthy-runner gate**

Changes:
- Removed the persistent titlebar command/search launcher entirely; command palette remains available through the registered command/menu path instead of a permanent search-like titlebar surface.
- Rebased the custom Windows/Linux titlebar grid from `brand menu search status controls` to `brand menu status controls` and removed launcher-specific responsive CSS.
- Windows/Linux/macOS base keymaps now reserve `Ctrl/Cmd+K` for `format.hyperlink`; base `view.toggle-toc` is unbound. Typora style may assign TOC a different non-conflicting chord.
- Removed the hard-coded `Ctrl K` / `⌘ K` titlebar hint so shortcut display cannot drift from command/keybinding authority.
- Updated command-palette, visual-shell, reference-layout, keybinding, and responsive Electron tests to require the launcher-free contract and no horizontal overflow/collision.

Executable Green evidence:
- `titlebar-launcher-contract`: direct source contract probe confirms there is no `command-launcher`, no hard-coded K hint, and the launcher-free grid is present.
- `ctrl-k-authority-contract`: imports the real Windows/Linux/macOS keymaps plus `applyShortcutStyle`; for both MarkText and Typora styles, the only owner of `Ctrl/Cmd+K` is `format.hyperlink`.

Remaining gate:
- The current worktree Electron build previously failed in the damaged local dependency graph before E2E could become valid product evidence. The updated `titlebar-responsive.spec.ts` remains the canonical real-window width/collision gate and must run on a healthy dependency graph before final merge.

Result:
- **TODO-02 implementation closed.**
- **TODO-03 implementation closed.**
- **TODO-04 implementation closed; Electron acceptance pending healthy runner.**

## Stage 5 — TODO-01 Recent Documents activation closure (2026-09-28)

Status: **implementation closed; healthy-runner Electron/type gates pending**

Test-first evidence:
- Updated the existing document-workflow Electron suite before production mutation so a single click must select the Recent row and keep the welcome list visible.
- Added dedicated real-Electron acceptance cases for Enter activation and double-click activation.
- Added a focused static UI contract requiring select-first wiring, double-click/Enter activation, row context-menu wiring, and explicit selected state.
- Executable Red probe against the pre-fix component failed exactly on the product contract: `missing Recent contract marker: @click="selectRecent(item)"`.

Implementation:
- Recent rows now use an explicit `selectedRecentPath`; focus/single-click select without opening.
- Double-click and Enter activate the selected item.
- Opening preflights the stored path with the existing preload file APIs. Missing/inaccessible entries stay visible and produce a recoverable warning/confirm path that can remove the stale Recent entry instead of silently failing.
- Added a Recent context menu using the existing renderer `popupContextMenu` infrastructure: Open, Show in Folder, Pin/Unpin, Remove. No new IPC channel was introduced.
- Clear/remove operations also clear stale selection state.

Green evidence:
- The identical `recent-activation-contract` probe is Green after the fix, including stale-path preflight/recovery wiring.
- A direct desktop `vue-tsc` launch was attempted through the exact installed package. It failed before project type analysis on the unhealthy donor dependency graph (`ERR_PACKAGE_PATH_NOT_EXPORTED` from `estree-walker`), so this is environment evidence rather than a TypeScript regression.

Remaining gate:
- Run the updated `document-workflow.spec.ts` Recent single-click/Enter/double-click cases and desktop typecheck on a healthy dependency graph/current-worktree Electron build.

Result:
- **TODO-01 implementation closed; native Electron acceptance pending healthy runner.**

## Stage 6 — TODO-07 Table cell context menu / Delete Table closure (2026-09-28)

Status: **core implementation closed; canonical Vitest + real Electron acceptance pending healthy runner**

Test-first evidence:
- Static/executable Red probe was established before production mutation and failed on the actual missing interaction boundary: `editor does not dispatch contextmenu`.
- Added canonical Muya tests before implementation for the required cell-context actions and for whole-table delete as one undoable structure operation.

Implementation:
- Added a default no-op `Content.contextMenuHandler` hook and routed editor-root `contextmenu` through the nearest stamped Muya content block without altering click/selection dispatch.
- `TableCellContent` now consumes cell right-click and opens the existing `TableRowColumMenu` through the existing `muya-table-bar` event; no Desktop-owned table model or parallel mutation path was introduced.
- Cell menu exposes the contract-exact actions Insert Row Above/Below, Insert Column Left/Right, Delete Row, Delete Column, and Delete Table. Existing row/column drag-toolbar labels remain unchanged while all actions continue to use the same menu/mutation implementation.
- Added `Table.removeTable()` behind the existing `_runAtomicMutation` history boundary. It returns a surviving outside content target when available; if the table is the only document block it atomically replaces it with an empty paragraph, so focus never targets a detached subtree.
- Added localized cell-menu keys for Insert Column Left/Right, Delete Row, Delete Column, and Delete Table to all Muya locales while retaining legacy toolbar locale keys.

Green evidence:
- `table-context-menu-contract`: confirms editor contextmenu dispatch, cell handler, seven required actions, and explicit `removeTable` mutation.
- `table-remove-contract`: imports the real `Table` implementation and proves Delete Table uses one atomic mutation, removes exactly one table, and returns the meaningful outside focus target.
- `table-context-menu-i18n`: imports the real menu config and all Muya locales; required action list and every `Delete Table` translation are present.

Remaining gate:
- Run the new canonical Muya Vitest cases and a real Electron right-click → structural action → Undo acceptance case on a healthy dependency graph.

Result:
- **TODO-07 core implementation closed; native/canonical acceptance pending healthy runner.**

## Stage 7 — TODO-08 Editable pointer semantics closure (2026-09-28)

Status: **closed; no production CSS change required**

Audit result:
- Existing WYSIWYG cursor rules are correctly scoped to caret-placeable document surfaces rather than `.mu-container` or the whole editor.
- Source Mode scopes `cursor: text` to CodeMirror editing lines rather than the whole source shell.
- Actionable descendants already override the editing cursor: links and task checkboxes use `pointer`, table drag controls use `pointer`, and image resize handles use `ew-resize`.
- Existing real Electron US09 coverage already proves paragraph hover exposes the I-beam without stealing focus and that clicking yields a live caret.

Regression strengthening:
- Extended `us09-selection-caret-contract.spec.ts` to explicitly protect link, task-checkbox, table-drag, and image-resize cursor exceptions in addition to the existing no-blanket-selector assertions.
- `pointer-semantics-contract` direct source probe is Green across WYSIWYG, Source Mode, links, task controls, table drag controls, and image resize handles.

Result:
- **TODO-08 closed.**

## Stage 8 — TODO-09 Residual interaction audit (2026-09-28)

Status: **implementation audit closed; platform/native acceptance gates remain**

### Focus / IME / selection / undo / tab switching

Existing v0.5 correctness work remains aligned with the desktop contract:
- US08 protects composition from Markdown transforms and covers empty-cell ZWSP cleanup plus browser CJK composition inside a table cell.
- US13 keeps adjacent typing grouped by intent/time and isolates history per tab.
- US15 protects Focus/Typewriter mode state, selection visibility, async geometry ownership, and return-to-document continuity.
- Existing Electron tab-switch coverage restores caret/viewport state, keeps command ownership on the active tab, and proves one tab's Undo cannot mutate another tab.

No new production defect was found in these areas during this audit.

### Table context-menu keyboard accessibility

A new defect was found after the cell context menu became reachable: the existing `TableRowColumMenu` rendered mouse-only `<li>` items and had no menu semantics, roving focus, keyboard activation, Escape return path, or visible keyboard focus.

Test-first evidence:
- `table-context-keyboard-contract` Red failed on the first missing invariant: `role: 'menu'`.

Implementation:
- Reused the same existing `TableRowColumMenu`; no second menu implementation was created.
- Added `role=menu` / `role=menuitem`, roving `tabindex`, active item state, ArrowUp/ArrowDown and Tab/Shift+Tab traversal, Enter/Space activation, and Escape dismissal.
- Opening a cell context menu moves focus to its first item; Escape restores focus to the originating table-cell content when still mounted.
- Added a visible focus ring using the existing interaction token.
- Follow-up Muya `tsc --noEmit` found the restored content DOM can be nullable; the implementation now guards that boundary.

Green evidence:
- `table-context-keyboard-contract` is Green.
- Muya `tsc --noEmit` is Green after the nullability fix.

### Sidebar Search continuity and background ownership

A second real defect was found: Search used `v-else-if`, so switching to another sidebar panel destroyed the Search component and lost query/results. Panel switching also lacked a dedicated focus-restoration path.

Test-first evidence:
- Added unit/Electron acceptance before production mutation for query/result preservation and focus restoration.
- `sidebar-search-continuity-contract` Red failed because Search was still unmounted on panel change.

Implementation:
- Search now stays mounted behind `v-show`, preserving its session query and result context.
- Returning to Search focuses the input without overwriting the preserved query from unrelated editor selection.
- Search input now has an explicit accessible name.
- Because persistent mounting could otherwise create hidden background work, root/project-tree changes now refresh immediately only while Search is active; while hidden they mark the query stale and defer the work until Search becomes active again.

Green evidence:
- `sidebar-search-continuity-contract` is Green.
- `sidebar-search-background-contract` is Green.
- Existing `searchResultItem.vue` already exposes `role=button`, keyboard focus, Enter/Space activation, and a visible focus style, so no second result-navigation implementation was needed.

### Drag/drop contract backfill

No production drag mutation defect was found:
- table reorder exposes visible drag/drop transform state before commit;
- commit delegates to the existing atomic `Table.moveColumn/moveRow` operations;
- the no-target path returns without a document mutation.

The real Muya Playwright table-drag spec was strengthened so a successful pointer reorder is followed by Undo restoring the original table and a release that does not cross a reorder target leaves Markdown byte-for-byte unchanged. These remain healthy-runner Playwright gates.

### Feedback / recoverable error contract

The new Recent missing-path flow was tightened to meet §18.3:
- the existing missing-file copy states what failed;
- a new localized `recent.missingAction` in all ten desktop locales states that the Recent entry remains unchanged/safe and offers the next action (remove it);
- cancellation therefore leaves the Recent state untouched.

`recent-error-feedback-locales` was valid Red before the locale key existed and is Green after all locales plus the component wiring were updated.

### Platform/native acceptance gates at Stage 8 — superseded by Stage 10

At this stage, before repairing the runner, the following had not yet been claimed as passed:
- Recent single-click / double-click / Enter activation in real Electron;
- titlebar responsive width/collision matrix and macOS native chrome acceptance;
- table right-click → keyboard menu → structural action → Undo in real Electron;
- Shift+Enter WYSIWYG ↔ Source ↔ save/reopen hard-break round-trip;
- sidebar Search panel-switch query/result/focus continuity in real Electron;
- table-drag no-op/Undo Playwright additions;
- full desktop `vue-tsc`, canonical Vitest, and broad Electron regression.

These were Stage 8 environment blockers, not accepted exclusions. Stage 10 records the repaired dependency graph and successful canonical reruns.

Result:
- **TODO-09 implementation audit closed.**
- No known contract violation remains unimplemented in the audited scope; final acceptance is blocked only by the explicitly listed healthy-runner/platform gates.

## Stage 9 — Final diff / architecture review (2026-09-28)

Status: **complete for implementation review**

Late review findings and fixes:
- Search panel exit initially marked every non-empty completed query stale. That would preserve the query but needlessly rerun a completed search on return. The final implementation now calls `markSearchRefreshIfPending()` and marks stale only when a search is actually running or a debounce timer is pending. `search-exit-refresh-contract` is Green.
- The table context-menu keyboard handler was initially attached to the whole Muya editor and therefore could have intercepted keys while legacy row/column drag menus were active. The final handler is scoped to `barType === 'cell'` and attached only to the focused float box. `table-context-keyboard-scope` is Green.
- A focused `removeRow/removeColumn` test still asserted the superseded raw whole-table detach path. It now asserts delegation to the single `removeTable()` safety path, preventing a false failure once canonical Vitest is restored.
- Recent inline Remove now goes through the same `removeRecent()` path as the context menu, so selected-state cleanup is consistent across both entry points.
- Removing the final required table row/column initially retained a legacy raw-detach branch. It now delegates to the same atomic `removeTable()` safety path, so an only-block table becomes an empty paragraph with a meaningful focus target. `table-terminal-delete-safety` is Green.
- The cell context menu initially reused legacy label keys (`Remove Row/Column`, lowercase column direction). A focused Red proved the mismatch; the final cell surface uses the contract-exact Delete/Left/Right labels and all ten Muya locales contain the corresponding keys. `table-cell-menu-label-contract` and `table-cell-menu-locales` are Green.

Final local validation after the last code change:
- `node .../typescript/bin/tsc --noEmit -p packages/muya/tsconfig.json` — **Green**.
- all ten desktop locale JSON files parse and provide `recent.missingAction` — **Green**.
- focused interaction probes covering Recent activation, no titlebar launcher, Ctrl/Cmd+K authority, sidebar Search continuity/background ownership, table Enter, cell-menu keyboard scope, terminal delete safety, exact cell-menu labels, and locale completeness — **Green**.
- `interaction-architecture-invariants` covering new Recent context-menu IPC discipline, preload reuse, Search document-state ownership, titlebar launcher removal, and authoritative Muya table mutations — **Green**.
- `git -c core.whitespace=cr-at-eol diff --check` — **Green**.
- repository worktree has no conflicts and no active background jobs.

Architecture review:
- No raw Renderer → Main IPC escape was introduced. Recent uses existing preload `fileUtils`, Electron shell, and existing typed/registered app-open channels.
- Muya remains the authoritative owner of table/document semantics. Desktop does not maintain a parallel table model.
- All row/column/table structural edits converge on the existing Muya mutation/history path; last-row/last-column removal delegates to `removeTable()` instead of keeping a separate detach branch.
- WYSIWYG `<br>` handling changes presentation only; Markdown serialization remains the document fact.
- Persistent sidebar Search state remains renderer presentation/session state, while hidden-state background work is explicitly gated/deferred.
- No quality gate, timeout, assertion, workload, platform requirement, or correctness threshold was weakened.

Intentional untracked additions to include in the eventual commit:
- `docs/correctness/DESKTOP-EDITOR-INTERACTION-AUDIT.md` — stage/audit record.
- `packages/desktop/src/renderer/src/contextMenu/recent/index.ts` — Recent context menu using existing popup infrastructure.
- `packages/muya/src/inlineRenderer/renderer/__tests__/htmlTagBr.spec.ts` — WYSIWYG hard-break renderer contract.
- `packages/desktop/test/e2e/table-hard-break-roundtrip.spec.ts` — real Electron WYSIWYG → Source → save → reopen hard-break acceptance.
- `packages/muya/src/block/content/tableCell/__tests__/contextMenuHandler.spec.ts` — first-use deferred table-menu initialization contract.
- `packages/muya/src/ui/tableRowColumMenu/__tests__/tableCellContextMenu.spec.ts` — table-cell context-menu structure/keyboard-scope contract.

Historical blocked gates at Stage 9 — resolved in Stage 10:
- canonical Vitest currently fails before discovery because the local dependency graph lacks a healthy `tinyexec` payload;
- desktop ESLint currently fails during config loading because the donor dependency graph cannot resolve `@eslint/js`;
- desktop `vue-tsc`/SFC validation cannot reach project analysis in the same unhealthy donor dependency graph;
- Electron/Playwright acceptance listed in Stage 8 therefore still requires a healthy worktree/CI environment, including macOS-native titlebar acceptance where applicable.

Learning review:
- No new global rule is required beyond existing AGENTS/testing/architecture guidance. The reusable lesson is an application of existing rules: preserving hidden UI state with `v-show` must be paired with explicit background-work ownership so hidden panels do not continue expensive work, and new interaction surfaces must scope keyboard capture to the owning surface rather than the editor root.

Closeout conclusion:
- All implementation defects discovered by this contract audit are fixed in the isolated branch.
- No known architecture-boundary regression remains after final diff review.
- Native acceptance remained mandatory at this point; Stage 10 supersedes this temporary hold.

## Stage 10 — Windows environment repair + native acceptance (2026-09-28)

Status: **Windows accepted; macOS platform-specific acceptance pending**

### Runner repair

The earlier dependency failures were repaired instead of bypassed:

- Rebuilt the worktree-local dependency graph from the locked pnpm graph.
- Installed the Electron 42.1.0 runtime payload after the dependency repair had intentionally skipped package scripts.
- Applied the repository-owned `native-keymap@3.3.9` patch before rebuilding Electron native modules.
- Rebuilt `ced`, `keytar`, and `native-keymap` against the current Electron ABI successfully.
- Diagnosed a remaining corrupted `@babel/compat-data@7.29.7` payload down to missing `package.json` and `data/plugins.json`; restored the exact registry package and verified it through real Node resolution.
- Cleared stale ESLint cache entries created while the Babel payload was broken.
- Corrected root ESLint generated-artifact ignores from root-only `test-results/**` / `playwright-report/**` to recursive `**/test-results/**` / `**/playwright-report/**`. Playwright output no longer enters source lint.

### Real acceptance findings

Running the repaired Windows/Electron path exposed three real defects that static probes could not prove:

1. **Recent activation used a main-internal channel from Renderer.**
   - `app-open-file-by-id` / `app-open-directory-by-id` are main-internal channels, not Renderer IPC.
   - Recent now uses the typed preload command boundary. Files reuse `openFileByWindowId`; folders use the symmetric `openFolderByWindowId` → `mt::open-folder-by-window-id` bridge and then the existing main internal directory-open path.
   - Real Electron `document-workflow.spec.ts` is **5/5 Green**, including select-only single click, Enter open, and double-click open.

2. **First table-cell right-click could race deferred UI-plugin initialization.**
   - Desktop intentionally initializes non-critical Muya UI plugins in the background to protect activation performance.
   - A first right-click could emit `muya-table-bar` before `TableRowColumMenu` subscribed, losing that first interaction.
   - `TableCellContent.contextMenuHandler` now lazily calls `initUiPlugin('tableBarTools')` immediately before emitting. This preserves deferred startup ownership while guaranteeing first-use correctness.

3. **The table context menu focused a stale Snabbdom mount node.**
   - First render replaces the initial table-menu container; querying the detached node left the first `menuitem` unfocused.
   - Roving-focus lookup now anchors at the stable `floatBox` root.
   - Real Electron right-click → first-item focus → Enter structural action → atomic Undo is Green.

### Windows/native Green evidence

- `pnpm check` — **Green**:
  - repository ESLint: **0 errors**; existing warnings remain non-blocking;
  - Muya public type-boundary test: Green;
  - recovery/history boundary test: Green;
  - Muya declaration build: Green;
  - Desktop `vue-tsc --noEmit`: Green.
- Muya interaction-targeted ESLint — **0 errors**; four pre-existing complexity warnings remain non-blocking.
- Muya table-menu stylelint — **Green**.
- Current-worktree Desktop Electron build — **Green** after the final production mutations.
- Muya focused canonical Vitest:
  - earlier interaction set: **6 files / 25 tests Green**;
  - final table/hard-break set: **4 files / 5 tests Green**.
- Desktop focused unit contract: **5 files / 32 tests Green**.
- Electron readiness / command palette: **5/5 Green**.
- Recent/document workflow: **5/5 Green**.
- Final primary Windows/Electron regression covering Recent, titlebar responsive geometry, visual shell, and workspace Search: **15/15 Green**.
- Table/hard-break Windows/Electron acceptance: **4/4 Green**, covering cell right-click, keyboard structural action, atomic Undo, Shift+Enter visual hard break, Source literal `<br>`, real save, close/reopen, and exactly one non-escaped hard break after reopen.
- Muya real Chromium pointer drag acceptance: **3/3 Green**, covering visible drag affordance, committed reorder + Undo restoration, and a no-target release with no Markdown mutation.
- All historical validation failures in the work session are resolved.
- The temporary diagnostic E2E used to isolate the table-menu race was deleted before closeout.

### Platform conclusion

- Windows runtime acceptance for the audited desktop interaction contract is complete.
- Platform-neutral command/keybinding/table/search logic is covered by canonical unit/type/static tests.
- **macOS native titlebar/chrome behavior remains the only explicit platform-specific acceptance item.**
- No Linux runtime acceptance is claimed from this Windows run.

### Final conclusion

- **TODO-01 through TODO-09 are closed for the Windows acceptance scope.**
- No known desktop interaction-contract defect remains unimplemented in this branch.
- No known architecture-boundary regression remains.
- The branch is ready for commit/PR preparation subject to the separate macOS platform gate required by release policy.

## Stage 11 — PR #215 CI feedback closure (2026-09-29)

Status: **final executable head accepted by CI; merge-ready**

PR #215 ran the complete repository unit surface and exposed two gaps that the focused pre-push suite had not covered:

1. **Hyperlink shortcut authority still drifted inside Muya.**
   - Desktop keybindings had correctly moved hyperlink ownership to Ctrl/Cmd+K, but Muya inline-format toolbar metadata and its direct shortcut map still used Ctrl/Cmd+L.
   - This was a real product consistency defect, not a stale assertion.
   - Muya toolbar metadata now advertises Ctrl/Cmd+K and the inline toolbar key map now binds `k -> link`.
   - A Muya config regression test pins Ctrl/Cmd+K and explicitly rejects Ctrl/Cmd+L.

2. **UI-10 titlebar unit contract still encoded the removed persistent search zone.**
   - Production correctly uses `'brand menu status controls'`; the test still required `'brand menu search status controls'`.
   - The unit contract now asserts the no-titlebar-search layout and explicitly rejects a `grid-area: search` zone.

Local validation after the CI fixes:
- Desktop focused regression: **2 files / 32 tests Green**.
- Muya inline-format toolbar config: **1 file / 12 tests Green**.
- Muya targeted ESLint for the changed toolbar files: **0 errors**.
- `pnpm check`: **Green**.
- Full Desktop unit suite: **164 files / 1298 tests Green, 1 skipped**.
- A duplicate full-unit job created by a tool-call timeout was explicitly stopped; only the first authoritative run is used as validation evidence.

Final executable head `58d6e0d3cf3c3922013bb1c0e52b293f407418c2` CI:
- **11/11 workflows Green**: Lint, Test, E2E Test, Performance Fast Gate, Muya Lint, Muya Test, Muya E2E, Muya Build, Muya Circular Dep Check, Muya Spec, and PR Build.
- PR Build completed successfully for Windows x64, macOS ARM64, and macOS Intel.
- Package smoke completed successfully for Windows x64, macOS ARM64, and macOS Intel.
- Updater artifact smoke completed successfully.
- The macOS CI result proves build/package correctness on both supported Mac architectures; it does **not** replace a manual/native interaction assertion for macOS titlebar/chrome behavior.
- No final-head CI failure remains open. PR #215 is ready for squash merge after the docs-only closeout commit.

Reusable lesson:
- A shortcut authority change is not closed by updating the application keybinding map alone. Every user-visible shortcut projection and local keyboard dispatch surface (menu accelerator, toolbar hint, toolbar key handler, command palette/help surface) must either derive from the same source or be covered by an authority-consistency test.

## Stage 12 — Post-merge repository closure (2026-09-29)

Status: **merged and cleaned up**

- PR #215 was squash-merged into `develop`.
- Canonical interaction-contract merge commit: `1b3b0fb490015fd9a9898c6ddaf14f119805f891` (`fix(editor): close desktop interaction contract (#215)`).
- Post-merge fetch verified `origin/develop` points exactly to that squash commit before this documentation-only follow-up.
- The main working tree was clean and was fast-forwarded to the canonical merge commit.
- The merged remote branch `audit/desktop-editor-interaction-contract` no longer exists.
- The local `audit/desktop-editor-interaction-contract` branch was deleted.
- The isolated `.worktrees/desktop-editor-interaction-audit` worktree was deregistered and its residual dependency/build directory was removed; `git worktree prune` completed.
- The executable head `58d6e0d3cf3c3922013bb1c0e52b293f407418c2` remains the authoritative tested code head: 11/11 GitHub workflows Green, including Desktop E2E, performance, Muya gates, Windows x64/macOS ARM64/macOS Intel build + package smoke, and updater artifact smoke.
- The later `d929a11e5217032a75c5d9c26fe074d8afbba470` commit was documentation-only and intentionally used `[skip ci]`; its only delta from the fully tested executable head was this audit document.
- macOS build/package correctness is proven by CI on ARM64 and Intel. A manual/native macOS titlebar/chrome interaction assertion is still not claimed.
- No Linux runtime acceptance is claimed.

Final repository conclusion:
- The desktop interaction contract audit is closed.
- TODO-01 through TODO-09 are resolved in the merged implementation.
- No known architecture-boundary regression or open product correctness defect remains from this audit.
- Future work should start from current `develop` and use this document as the handoff record rather than reopening the retired audit branch/worktree.
