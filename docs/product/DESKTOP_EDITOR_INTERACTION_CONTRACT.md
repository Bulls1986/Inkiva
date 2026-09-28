# Desktop Editor Interaction Contract

Status: **Normative for v0.5.0 and later**
Scope: Windows and macOS desktop application
Owner: Product / Editor UX
Last updated: 2026-09-28

## 1. Purpose

This document defines the user-observable interaction contract for Inkiva as a desktop, document-first Markdown editor.

It is a release-level product contract, not a visual mockup. Implementation details may change, but behavior covered here must remain stable unless this contract is explicitly revised.

The contract exists to prevent individually reasonable features from producing an editor that is functionally complete but inconsistent, surprising, or unlike a native desktop writing tool.

## 2. Non-negotiable principles

1. **Document first.** Editing the current document has priority over navigation, search, derived views, analytics, background work, and decorative UI.
2. **Standard Markdown remains the persisted source of truth.** Inkiva must not invent proprietary document syntax to make an interaction easier.
3. **WYSIWYG must hide implementation leakage.** Serialization artifacts created by Inkiva, such as a table-cell `<br />`, must not appear as literal text in the WYSIWYG surface.
4. **Source Mode is literal.** Source Mode may expose Markdown/HTML syntax exactly because that is its purpose.
5. **Desktop conventions are authoritative.** Keyboard, pointer, focus, double-click, context-menu, drag, and window behavior must feel native on Windows and macOS.
6. **One command, one semantic meaning.** A shortcut must never be advertised for two active commands in the same context.
7. **One command registry is authoritative.** Menus, shortcut hints, tooltips, command execution, and tests must use the same command definition. UI must not hard-code shortcut labels independently.
8. **No silent interaction failure.** A valid user action either succeeds, produces a visible/accessible state change, or gives a recoverable explanation.
9. **Responsive behavior must degrade, never collide.** Smaller windows may hide or collapse lower-priority controls, but controls must not overlap, clip each other, or become unreachable.
10. **IME composition is protected.** Chinese/Japanese/Korean input composition must not be interrupted by shortcuts, autosave, rerender, tab switching side effects, or derived-state refreshes.

## 3. Interaction priority

When contracts compete, resolve them in this order:

1. prevent document loss or unintended mutation;
2. preserve current editing focus and caret/selection;
3. preserve standard Markdown round-trip;
4. preserve platform keyboard/menu conventions;
5. preserve editor responsiveness;
6. preserve navigation and secondary UI;
7. preserve decorative layout.

A secondary feature must never win by breaking a higher-priority rule.

## 4. Pointer and hover contract

### 4.1 Cursor semantics

- Editable text surfaces use an **I-beam/text cursor** when the pointer is over an editable text region.
- Standard controls use the platform-default pointer behavior.
- Resize handles use the corresponding resize cursor.
- Drag handles use an appropriate grab/drag affordance.
- Disabled controls must not imply clickability.
- A visual cursor must reflect what will happen if the user clicks.

### 4.2 Hover

Interactive controls must expose hover feedback without causing layout shift.

Hover state must not:

- move adjacent content;
- change element dimensions;
- hide the current caret or selection;
- trigger destructive behavior;
- steal keyboard focus.

### 4.3 Click, double-click, and selection

Unless a specialized control overrides it:

- single click places focus/selects;
- double-click on editable text selects a word using platform/native text semantics;
- drag extends selection;
- right-click opens a context menu without destroying the logical target/selection needed by that menu.

## 5. Focus contract

Focus is part of the product state.

### 5.1 General rules

- Opening a document places editing focus in the document unless the user explicitly opened a secondary panel for immediate input.
- Closing a transient popover returns focus to the control or editor location that opened it.
- Switching tabs restores the target document's latest meaningful editing focus/caret when possible.
- Background work must never steal focus.
- Saving/autosaving must never steal focus.
- Search result refreshes must not steal focus from the active search field or editor.
- A keyboard command acts on the currently focused context, not merely the visually active component.

### 5.2 Visible focus

Keyboard-focusable controls must have a visible focus state in both light and dark themes.

Focus indication must not rely solely on hover.

## 6. Keyboard and command contract

### 6.1 Command authority

Every keyboard-accessible action must map to a stable command identifier.

The command definition is the only authoritative source for:

- Windows shortcut;
- macOS shortcut;
- menu label;
- shortcut hint;
- enable/disable state;
- execution routing;
- automated shortcut-conflict tests.

A component must not display a shortcut that is not currently registered and executable.

### 6.2 Conflict rule

A key chord may not activate two different commands in the same active context.

If a conflict is discovered:

1. preserve the established editing command;
2. remove the conflicting secondary shortcut/hint;
3. select a new shortcut only after a command-registry conflict check.

### 6.3 Typora-compatible baseline

Inkiva keeps its established Typora-compatible editing behavior unless a separate product decision overrides it.

At minimum:

- `Ctrl+K` / `Cmd+K` = insert/edit hyperlink;
- `Ctrl+F` / `Cmd+F` = find in current document;
- `Ctrl+S` / `Cmd+S` = save;
- `Ctrl+Z` / `Cmd+Z` = undo;
- `Ctrl+Shift+Z` or platform-native equivalent = redo.

Global/sidebar search must **not** claim `Ctrl+K` / `Cmd+K`.

A shortcut hint for global search must remain absent until a non-conflicting default is explicitly registered and tested.

## 7. Window and title-bar contract

### 7.1 macOS title bar

The macOS window must reserve the native traffic-light/title-bar interaction region.

Application controls must not collide with:

- traffic-light buttons;
- draggable title-bar regions;
- native window chrome;
- document title/unsaved state affordances.

The top area is not a generic application toolbar.

### 7.2 Top search removal

Inkiva must not display a global search field in the top/title-bar area.

Global search belongs to the left sidebar Search surface.

This removes the previous top search shortcut hint and eliminates the narrow-window collision between the search field and adjacent title-bar content.

### 7.3 Narrow-window degradation

From normal width down to the minimum supported window width:

- no controls overlap;
- no text or control becomes unintentionally clipped;
- no primary action becomes unreachable;
- no accidental horizontal page scrollbar appears;
- title-bar drag regions remain usable;
- editor content remains the highest-priority width consumer after essential window/navigation controls.

Lower-priority labels may collapse before primary controls.

## 8. Sidebar and global search contract

### 8.1 Single global-search surface

Global/document-library search has one primary UI location: **the left sidebar Search panel**.

There must not be a second persistent top-bar search field.

### 8.2 Opening Search

When the Search command is invoked:

- if the sidebar is closed, it opens;
- Search becomes the active sidebar panel;
- the search input receives focus;
- existing query/result state is preserved when returning to Search within the same session unless the user clears it.

### 8.3 Search focus

- `Esc` first dismisses transient search UI/selection where applicable; it must not unexpectedly close the document.
- moving between results must not destroy the search query;
- opening a result moves focus to the document and the matched location;
- returning to the Search panel restores the prior query/result context.

## 9. Home / Recent Documents contract

Recent Documents is an actionable desktop list, not static metadata.

### 9.1 Opening

For a valid recent document:

- single click selects the item;
- double-click opens the document;
- `Enter` on a keyboard-selected item opens the document;
- opening gives clear pressed/loading/activation feedback if completion is not immediate.

### 9.2 Context menu

A recent-document context menu should provide, when applicable:

- Open;
- Reveal in Finder / Show in Explorer;
- Remove from Recent.

Removing from Recent must not delete the file.

### 9.3 Missing/inaccessible files

If the path no longer exists or cannot be accessed:

- do not fail silently;
- preserve enough information for the user to recognize the item;
- offer removal from Recent;
- never substitute a different same-name file.

## 10. Editor surface contract

### 10.1 WYSIWYG

WYSIWYG shows rendered editing semantics first.

Inkiva-generated serialization details must not leak into normal editing.

Examples:

- a table hard break may serialize as `<br />`, but appears as a line break;
- internal markers/caches/IDs never appear in document text;
- a syntax transformation must not leave duplicated source tokens visible.

### 10.2 Source Mode

Source Mode exposes the actual Markdown source.

Switching WYSIWYG ↔ Source Mode must preserve:

- document content;
- current document identity;
- unsaved state;
- a meaningful caret/viewport location where representable;
- undo/correctness boundaries required by the editor architecture.

### 10.3 Editing selection

Standard text selection conventions apply:

- click places caret;
- drag selects a range;
- double-click selects a word;
- Shift+navigation extends selection;
- copy/cut/paste operate on the visible logical selection.

Editor rerenders must not arbitrarily collapse a valid selection.

## 11. IME and composition contract

During active IME composition:

- do not run Markdown shortcuts against partial composition text;
- do not auto-transform partial composition into Markdown structures;
- do not commit an incomplete composition because of rerender;
- do not steal focus;
- do not split one composition into multiple undo steps unnecessarily.

After `compositionend`, normal Markdown recognition may run on the committed text.

This behavior is release-critical for Chinese input.

## 12. Undo/redo contract

Every user-visible document mutation must have predictable undo behavior.

### 12.1 Atomic operations

The following are each one logical undoable operation unless the user performs further edits:

- formatting selection;
- inserting/removing a link;
- inserting a table row or column;
- deleting a table row or column;
- moving a table row or column;
- deleting a table;
- drag/drop structural move;
- paste transformation.

Undo must restore both content and a meaningful selection/caret.

### 12.2 Non-document UI

Opening/closing sidebars, changing search query, or resizing panels must not pollute document undo history.

## 13. Context-menu contract

A context menu is context-specific and selection-preserving.

- Right-clicking editable text offers text/editor actions appropriate to that location.
- Right-clicking a table cell offers table structural actions.
- Disabled actions must be visibly disabled rather than silently doing nothing.
- Destructive-but-undoable document structure actions do not require modal confirmation by default.
- Filesystem-destructive actions require stronger safeguards than document-undoable actions.

Menus must be keyboard navigable.

## 14. Table editing contract

Tables require dedicated grid-editing semantics. Treating a table cell as an ordinary paragraph editor is not sufficient.

### 14.1 Core navigation

Inside a table cell:

- `Tab` moves to the next cell.
- `Shift+Tab` moves to the previous cell.
- `Tab` from the final cell may append a new body row and move into it.
- `Enter` moves to the cell directly below in the same column when such a cell exists.
- `Enter` must **not** expose or insert a visible literal `<br>` token in WYSIWYG.
- `Ctrl+Enter` / `Cmd+Enter` inserts a body row below the current row.
- `Shift+Enter` inserts an explicit hard line break inside the current cell.

### 14.2 Hard-line-break representation

GFM tables do not provide a portable multi-paragraph cell syntax.

Therefore Inkiva may serialize a table-cell hard break using standard-compatible HTML such as:

`<br />`

But:

- WYSIWYG renders it as a visual line break;
- the literal tag must not appear as editable visible text merely because the cell has focus;
- Source Mode shows the real serialized source;
- save → reopen → mode switch must round-trip without duplicating, escaping, or exposing the tag.

This is a core WYSIWYG abstraction boundary.

### 14.3 Table context menu

Right-clicking a table cell must expose at least:

- Insert Row Above;
- Insert Row Below;
- Insert Column Left;
- Insert Column Right;
- Delete Row;
- Delete Column;
- Delete Table.

Column alignment may be included when supported:

- Align Left;
- Align Center;
- Align Right.

### 14.4 Structural safety

- Row/column insertion preserves current content.
- Delete Row deletes exactly the targeted row.
- Delete Column deletes exactly the targeted column.
- Delete Table deletes the table as one undoable operation.
- If deleting the last required row/column would make the table invalid, Inkiva must use a defined safe behavior (disable that command or route the user to Delete Table); it must not silently emit malformed Markdown.
- Structural actions must preserve a meaningful focus target after the operation.

### 14.5 Table mouse behavior

When row/column drag affordances are present:

- the affordance is visible on hover/focus;
- dragging must have clear insertion feedback;
- dropping produces one atomic undoable operation;
- dragging must not select arbitrary document text.

### 14.6 Table acceptance matrix

A release gate for tables must cover at least:

1. `Enter` moves downward and never displays literal `<br>`.
2. `Shift+Enter` creates a visible line break and round-trips through save/reopen.
3. Source Mode shows the actual serialized hard-break syntax.
4. `Tab` and `Shift+Tab` navigate cells.
5. final-cell `Tab` row creation behaves deterministically.
6. `Ctrl/Cmd+Enter` inserts a row below.
7. context-menu insert/delete row and column actions work.
8. Delete Table is undoable.
9. undo/redo restores structural changes and focus sensibly.
10. CJK IME input works inside cells without premature transformations.

## 15. Links contract

- `Ctrl+K` / `Cmd+K` remains the hyperlink command.
- Search or navigation features must not steal this chord.
- Opening a link must require an intentional action distinct from ordinary caret placement.
- Editing link text must not unexpectedly navigate away.
- Internal document links must keep the current document context unless the link targets another file.

## 16. Tabs and document switching

- Clicking a tab activates it once.
- Closing a tab closes only that document.
- A dirty tab must have an unsaved-state affordance.
- Closing a dirty document must follow the recovery/save contract; no silent data loss.
- Switching tabs restores the document-owned mode/viewport/focus state defined by the workspace restore contract.
- Background reconciliation for inactive tabs must not overwrite newer unsaved edits.

## 17. Drag and drop

Drag/drop must differentiate:

- moving UI structure;
- inserting/importing content;
- opening files.

The drop target must be visible before mutation.

A rejected drop must not mutate the document.

Document-structure drag operations must be undoable.

## 18. Feedback contract

### 18.1 Immediate feedback

Actions that complete synchronously should produce immediate state change without success toast noise.

Examples:

- selection;
- formatting;
- table row insertion;
- sidebar switch.

### 18.2 Delayed actions

If an action cannot complete immediately, show non-blocking progress/status only when delay is perceptible.

Do not freeze the editor to prove that work is happening.

### 18.3 Errors

An error message must state:

- what failed;
- what remains safe;
- what the user can do next.

Do not use a generic failure toast when a local recoverable state can be explained inline.

## 19. Responsive interaction acceptance

At every supported window size:

- editor remains editable;
- current document is identifiable;
- window controls remain usable;
- sidebar can be opened/closed;
- no top global-search control exists;
- no two controls overlap;
- no interaction target is hidden behind another target;
- contextual menus remain within the visible work area or reposition appropriately.

This must be verified on both Windows and macOS window chrome.

## 20. Accessibility interaction baseline

At minimum:

- all primary actions are keyboard reachable;
- focus order follows visual/task order;
- focus is visible;
- context menus can be operated by keyboard;
- disabled state is programmatically distinguishable;
- icon-only controls expose an accessible name;
- hover-only information has a keyboard/focus equivalent;
- editor and search state changes do not create unexpected focus jumps.

This document does not claim complete accessibility conformance; automated and assistive-technology testing remain separate gates.

## 21. Testability requirements

Every normative interaction added or changed by implementation must be testable at the lowest reliable layer and at the real Electron layer when native focus, keyboard, window chrome, or pointer behavior matters.

Do not close an interaction defect solely with:

- CSS snapshot evidence;
- a unit test that bypasses real focus/keyboard routing;
- a mocked shortcut handler;
- a component-only click when the reported defect is double-click/native Electron behavior.

High-risk interaction fixes require executable Red evidence before production mutation under the repository testing contract.

## 22. v0.5.0 immediate closure items

The following known items are explicitly covered by this contract and are v0.5.0 closure work:

1. **Recent Documents:** double-click must open the selected document.
2. **Global search:** remove the top/title-bar search field; keep global search in the left sidebar.
3. **Shortcut conflict:** remove the top search `Ctrl+K` / `Cmd+K` claim; preserve hyperlink semantics.
4. **Small windows:** removal of top search must eliminate the observed title-bar overlap; the remaining title bar must satisfy the responsive contract.
5. **Table Enter behavior:** `Enter` must no longer expose `<br>`; it follows table navigation semantics.
6. **Table hard break:** `Shift+Enter` may serialize a hard break, but WYSIWYG renders the break instead of its HTML syntax.
7. **Table context menu:** row/column insertion and deletion plus Delete Table must be available.
8. **Editor pointer:** editable editor regions must present text/I-beam cursor semantics.

These are not optional polish items. They are contract violations against the v0.5.0 goal of a safe, complete desktop editing experience.

## 23. Reference baseline

The behavioral baseline was cross-checked against current Typora documentation and known Typora table behavior:

- Typora Shortcut Keys: https://support.typora.io/Shortcut-Keys/
- Typora File Management / sidebar global search: https://support.typora.io/File-Management/
- Typora Table Editing: https://support.typora.io/Table-Editing/
- Typora Line Breaks: https://support.typora.io/Line-Break/

Inkiva uses those references for desktop familiarity, not as a requirement to clone every Typora implementation detail.

## 24. Change control

A change that intentionally contradicts this contract must:

1. identify the affected section;
2. state the user-facing reason;
3. update this document in the same change set;
4. update or add behavioral tests;
5. verify Windows/macOS impact where platform behavior differs.

Do not silently redefine an interaction in implementation.

## Stage record

### 2026-09-28 — Initial contract established

The initial contract was created after v0.5.0 review exposed four interaction gaps: Recent Documents did not open on double-click, top search advertised a conflicting `Ctrl+K`, title-bar search collided with adjacent content at narrow widths, and table editing exposed `<br>` while lacking structural context-menu actions.

The resulting decision is to treat these as one class of problem: Inkiva previously lacked one durable desktop-editor interaction contract. This document establishes that baseline before fixing the individual defects.
