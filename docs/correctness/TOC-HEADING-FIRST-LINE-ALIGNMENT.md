# TOC heading first-line alignment

Status: **Implemented; PR #283 open; GitHub CI in progress**

Base: `develop@d4d9a8a3c2c0667199d086619cb3e0a40ee5eaea`
Task branch: `fix/toc-heading-first-line-alignment`
Pull request: https://github.com/Bulls1986/Inkiva/pull/283

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

## Verification evidence

| Gate                                            | Result                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter inkiva build`                    | Passed; the compiled renderer bundle contains the 8px TOC positioning path.                                          |
| Red/Green short-document regression             | Red reproduced before the production change; Green after the change (1/1).                                           |
| Ordinary WYSIWYG TOC E2E (`toc-scroll.spec.ts`) | 4/4 passed, including final-heading first-line alignment and active-item state.                                      |
| Virtualized TOC stability E2E                   | 1/1 passed, including the 8px first-line alignment assertion.                                                        |
| Source Code TOC E2E                             | 2/2 passed; this task does not change the separate Source Code navigation path.                                      |
| TOC outline unit tests                          | 16/16 passed.                                                                                                        |
| ESLint baseline comparison                      | 0 errors on current and HEAD for touched files; editor warnings unchanged at 7; no new diagnostics.                  |
| Prettier                                        | Documentation files passed; existing Vue/E2E files were already non-clean on HEAD, so no broad reformat was applied. |
| EOL-aware whitespace check                      | `git -c core.whitespace=cr-at-eol diff --check` passed for the repository's existing CRLF source files.              |

## Closeout boundary

- Production behavior and focused regression coverage are implemented and green locally.
- PR #283 is open against `develop`. At the latest check, Lint, Test, E2E Test, and Performance Fast Gate were in progress; PR Build was queued.
- The PR is not merged. Do not claim CI/release closure until all required workflow runs finish and the merge is explicitly authorized.
