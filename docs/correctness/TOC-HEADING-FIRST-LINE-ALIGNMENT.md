# TOC heading first-line alignment

Status: **Merged into `develop`; PR #283 closed; all five CI suites green**

- PR: https://github.com/Bulls1986/Inkiva/pull/283
- Task branch: `fix/toc-heading-first-line-alignment`
- PR head: `e1bd370b4ec41ceeffdf22215ba655b956042135`
- Squash merge: `9ceac4bef169568044b86ea2a5cbba6915287bfe`
- Verified `develop` ref: `9ceac4bef169568044b86ea2a5cbba6915287bfe`

## User-observable contract

Clicking an outline entry must place its corresponding heading on the first visible content line: 8px below the editor scroll container's top edge (±4px rendering tolerance). The target must remain the active outline entry after navigation settles. This applies to ordinary and virtualized WYSIWYG documents, including headings near the document end; visibility somewhere in the viewport is not sufficient.

## Root cause

1. `sideBar/toc.vue` `handleClick` immediately sets `activeTocSlug` to the clicked slug, then emits `scroll-to-header`.
2. `editorWithTabs/editor.vue` `scrollToHeader` first tries `documentGeometry.revealBlock(..., { viewportOffset: 8 })`; this is the virtualized/windowed path.
3. For an ordinary document, `scrollToHeader` fell back to `scrollElementIntoView`, which positioned the element at fixed `STANDAR_Y = 320` rather than relative to the editor scroll container.
4. `createTocScrollSync` uses `activationOffset = 40`. Leaving the clicked heading around y=320 means the next scroll-spy update can select the preceding heading and overwrite the clicked slug. This matches the reported behavior: the body stays around “已知要补的缺口”, while the outline returns to “MVP 顺序”.
5. The editor's `.mu-container` already has `padding-bottom: 100vh`, so final-heading alignment is achievable and must not be weakened at document boundaries.

## Implementation

- Extended the shared `scrollElementIntoView` helper with an optional container-relative `viewportOffset`.
- Kept `STANDAR_Y` as the default, preserving existing search-highlight and custom-anchor positioning.
- Changed only the ordinary WYSIWYG TOC fallback to use an 8px container-relative offset. The virtualized path continues to use `documentGeometry.revealBlock(..., { viewportOffset: 8 })`.
- Kept the TOC active-heading synchronization logic unchanged; the destination now lands above the 40px activation threshold, so the existing scroll spy settles on the clicked heading.
- Added first-line alignment assertions to ordinary long-document navigation, repeated clicks, final-heading boundary navigation, and virtualized navigation. The short-document regression also verifies the active TOC item.

## Local verification

| Gate | Result |
|---|---|
| `pnpm --filter inkiva build` | Passed; compiled renderer bundle contains the 8px TOC positioning path. |
| Red/Green short-document regression | Red reproduced before the production change; Green after the change (1/1). |
| Ordinary WYSIWYG TOC E2E (`toc-scroll.spec.ts`) | 4/4 passed, including final-heading first-line alignment and active-item state. |
| Virtualized TOC stability E2E | 1/1 passed, including the 8px first-line alignment assertion. |
| Source Code TOC E2E | 2/2 passed; separate Source Code navigation path unchanged. |
| TOC outline unit tests | 16/16 passed. |
| ESLint baseline comparison | 0 errors on current and HEAD for touched files; editor warnings unchanged at 7; no new diagnostics. |
| Prettier | Documentation files passed; existing Vue/E2E files were already non-clean on HEAD, so no broad reformat was applied. |
| EOL-aware whitespace check | `git -c core.whitespace=cr-at-eol diff --check` passed for the repository's existing CRLF source files. |

## GitHub CI evidence (2026-11-04)

The first CI round on source commit `9a7c2eb86a621b525dda28ea4accb6894697c819` passed Lint, Test, E2E Test and PR Build, but Performance Fast Gate failed only `document.50k.firstScreen` p95 = 202.79ms against the strict `<200ms` threshold. The downloaded artifact showed one cold first-sample outlier (2703.0ms); the remaining 19 first-screen samples ranged from 25.9ms to 71.2ms. The same-sample probe showed a 2586.1ms request-to-first-rAF-callback delay while the parallel zero-delay timer callback arrived 71.4ms after request.

This matched the pre-existing first-scenario Chromium rAF scheduling stall tracked by [Issue #232](https://github.com/Bulls1986/Inkiva/issues/232), not a TOC navigation regression. The evidence was added to Issue #232. No threshold, cold sample, sample count, workload, statistic, or retry policy was changed. Issue #232 remains open; a passing run does not claim that underlying performance issue is fixed.

The full required CI suite subsequently passed on latest PR HEAD `e1bd370b4ec41ceeffdf22215ba655b956042135`:

| Workflow | Run | Result |
|---|---:|---|
| Lint | [41767483960](https://github.com/Bulls1986/Inkiva/actions/runs/41767483960) | Passed |
| Test | [41767483957](https://github.com/Bulls1986/Inkiva/actions/runs/41767483957) | Passed |
| E2E Test | [41767483922](https://github.com/Bulls1986/Inkiva/actions/runs/41767483922) | Passed |
| Performance Fast Gate | [41767483925](https://github.com/Bulls1986/Inkiva/actions/runs/41767483925) | Passed |
| PR Build | [41767483913](https://github.com/Bulls1986/Inkiva/actions/runs/41767483913) | Passed |

PR Build additionally passed Windows x64, macOS x64 and macOS ARM64 build jobs, all three package-smoke jobs, and updater artifact smoke.

## Merge closeout

- PR #283 was squash-merged on 2026-11-04.
- Merge commit: `9ceac4bef169568044b86ea2a5cbba6915287bfe`.
- GitHub reports PR #283 closed and merged; the remote `develop` branch ref was independently verified to point to the same merge commit.
- No unresolved PR review threads remained at merge time.
- CI monitoring automation for PR #283 was disabled after merge.
- No release tag or public release was created as part of this correctness fix.

## Lessons and remaining boundary

- The navigation contract is about first-line alignment, not merely visibility within the viewport. E2E assertions now encode that distinction.
- Keep the generic anchor/search default offset unchanged; apply the first-line offset only to TOC navigation.
- Keep the virtualized geometry path and ordinary-document fallback aligned to the same viewport contract.
- Keep Issue #232 separate: its intermittent first-rAF scheduling delay remains an open performance investigation and must not be conflated with this merged TOC correctness fix.
