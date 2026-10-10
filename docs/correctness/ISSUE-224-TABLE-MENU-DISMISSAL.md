# Issue #224 — Table context menu dismissal investigation

Date: 2026-10-08

Branch: `fix/224-table-menu-dismiss`

Base: `develop@bf01c620`
Issue: https://github.com/Bulls1986/Inkiva/issues/224

## Stage 0 — Evidence and contract

The v0.5 visual baseline audit observed that `toBeHidden()` never became
true after three separate real Electron gestures: Escape, focused Escape,
and clicking outside the table menu. This did **not** demonstrate that the
menu was still presented on-screen.

`BaseFloat.hide()` sets `opacity: 0`, `top: -9999px`, and
`left: -9999px`, and changes `status` to false. Playwright's
`toBeHidden()` checks CSS `visibility`/`display`/zero-size, not
opacity or coordinates. A non-zero-sized but fully transparent off-screen
floating menu can remain `toBeVisible() === true` in Playwright.

The existing `table-editing-us12.spec.ts` already tests that selecting a
menu item hides the float using computed style and position. The missing
coverage is dismissal by keyboard and outside click. A focused **real
Electron** test has been added to require:

- seven visible primary cell-menu actions and menu-item keyboard focus;
- Escape leaves the wrapper transparent and off-screen, and restores cell focus;
- a real click outside the wrapper leaves it transparent and off-screen;
- neither dismissal changes document Markdown, and no renderer errors occur.

This test intentionally does not use `toBeHidden()`; replacing that false
oracle with a weaker or merely eventual screenshot check is not acceptable.
No production-code mutation is authorized unless the executable test proves
a real violation of the visible/keyboard contract.

## Stage 1 — Executed Red evidence (2026-10-08)

Full Linux Electron run
[37750586836](https://github.com/Bulls1986/Inkiva/actions/runs/37750586836)
executed 431 cases, reported 415 passed, 15 skipped and **one real
product-facing Red** in the new targeted case. Escape was delivered and
the transparent/off-screen assertions **passed**, but the subsequent
`expect(cell).toBeFocused()` failed for five seconds: the original
`span[contenteditable=true].mu-table-cell-content` was inactive.

Thus the original visual-only symptom was a **false-positive visibility
oracle**, but a separate keyboard-focus restoration defect is confirmed.
Do not close the issue solely as a Playwright misassertion.

Source analysis: `TableRowColumMenu` dispatches `hide()` then calls
`_restoreCellFocus()`, which invokes `content.domNode.focus()` without
verifying that its reference is still connected or that editor focus
and caret state were actually restored. Before mutating production code,
instrument the focused case to report `document.activeElement`,
the original cell's attachment state, and focused-cell count.
A temporary, branch-scoped pre-full-E2E command runs only this
  diagnostic case; it **must be removed before merging**. All other E2E
  cases stay in the canonical full gate.

### Focus target diagnosis

Focused Linux Electron run
[37752596787](https://github.com/Bulls1986/Inkiva/actions/runs/37752596787)
confirmed that after Escape the visible menu was dismissed but the browser's
`document.activeElement` was still the connected `LI.item.active`
labelled “上面插入行”; the original cell was connected but not active, and
no contenteditable table cell had focus. This excludes a stale-cell DOM
**removal** as the only explanation but does not yet prove whether
`_restoreCellFocus()` ran. Temporary diagnostic logs inside that method
will distinguish a missing invocation from a no-op focus call. Remove all
instrumentation before the final non-debug validation.

Focused run
[37753663806](https://github.com/Bulls1986/Inkiva/actions/runs/37753663806)
proved the model target was the same attached, editable, visible
`span.mu-table-cell-content` as the DOM target. Both the production
`content.domNode.focus()` and a separate immediate test call to
`cell.focus()` failed to move focus away from the hidden menu `li`.
This is a nested-contenteditable focus ownership problem, not stale state,
missing focus-event routing, or an offscreen visibility failure.

## Stage 2 — Minimal correction and Green gate

The Muya editor owns focus on its outer `.mu-editor[contenteditable]`
container, not individual nested cell spans. Escape now focuses that
authoritative editor container and restores the original table-cell
selection through `TableCellContent.setCursor`, reusing the surviving
anchor/focus offsets where they refer to that cell. Detached content
is ignored rather than being targeted. This corrects focus without changing
any Markdown, structural menu action, or UI interaction model.

The E2E asserts the actual editor focus owner, a collapsed native caret
inside the original table cell, the offscreen/opacity dismissal state,
outside click dismissal and unchanged document Markdown. The diagnostic
`console.info` statements and temporary focused CI step have been
removed. No timeout, test count, or pixel acceptance threshold was reduced.

Pending: full Linux Electron CI / Muya tests, build, documentation evidence,
then squash merge and verified #224 closure.

## Stage 3 — Closeout

Pending: CI gates, PR squash merge to `develop`, and verify issue closure.
