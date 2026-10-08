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

## Stage 1 — Focused Electron evidence

Pending: run the new focused case on the Linux Electron runner and classify
the result. If it passes, issue #224 was a test-oracle false positive;
retain the new strict interaction test to guard real regressions. If it fails,
diagnose event routing and float lifecycle before changing product code.

## Stage 2 — Closeout

Pending: CI gates, PR squash merge to `develop`, and verify issue closure.
