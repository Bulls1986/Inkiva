# TOC heading first-line alignment

Status: **Implemented; PR #283 open; required Performance Fast Gate blocked by pre-existing Issue #232**
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

## GitHub CI follow-up (2026-11-04)

PR #283: https://github.com/Bulls1986/Inkiva/pull/283
Initial CI source commit: `9a7c2eb86a621b525dda28ea4accb6894697c819` (later documentation-only branch head: `cf520a70cd2708a8c88db4ee7ad0fb798178d3bf`).

| Workflow / job           | Result                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------ | --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint (`41765803376`)     | Passed                                                                                           |
| Test (`41765803642`)     | Passed                                                                                           |
| E2E Test (`41765803253`) | Passed                                                                                           |
| PR Build (`41765803348`) | Windows, macOS ARM64, macOS x64 build, all package-smoke jobs and updater artifact smoke passed. |     | Performance Fast Gate (`41765803272`) | Failed only `document.50k.firstScreen` p95 = 202.79ms against `<200ms`; `document.50k.editable` p95 = 227.635ms against `<250ms`; other fast metrics passed |

### Failure evidence and attribution

- Downloaded and inspected the exact `desktop-performance-fast-gate` artifact (`13292054394`). The first cold 50K sample measured first-screen 2703.0ms and editable 2747.7ms; the remaining 19 first-screen samples ranged from 25.9ms to 71.2ms.
- Same-sample frame probe: rAF requested at 660.7ms, parallel zero-delay timer callback at 732.1ms, first rAF callback at 3246.8ms. Request-to-rAF callback delay = 2586.1ms; document was visible and focused.
- This matches the known first-scenario Chromium rAF scheduling stall tracked by [Issue #232](https://github.com/Bulls1986/Inkiva/issues/232), not a regression in the TOC navigation code. The TOC change does not modify performance collection, document-open scheduling, frame scheduling, or the benchmark workload.
- New evidence was added to Issue #232 and the PR #283 conversation. No thresholds, cold samples, sample count, workload, statistic, or retry policy were changed.
- Historical Issue #232 evidence includes the same class of cold first-sample outlier (including a clean overscan=2 Fast Gate run with first-screen p95 231.245ms). The issue remains open; this CI failure is not treated as resolved or waived.

### Current disposition

- The performance gate remains red and is a required CI blocker. Do not merge PR #283 while it is red unless the user explicitly approves a separate disposition.
- Do not attempt a TOC-specific performance workaround for this unrelated first-rAF stall. Continue the existing Issue #232 investigation; compare the same workload against a clean base before attributing any regression.
- The current branch head `cf520a70...` is a documentation-only commit carrying `[skip ci]`, so GitHub has no check runs attached to that SHA. This CI follow-up will be pushed without `[skip ci]` to trigger fresh workflows on the PR's full changed-file set, including the TOC source change.

## Closeout boundary

- Production behavior and focused regression coverage are implemented and green locally.
- Initial CI round: Lint, Test, E2E Test and PR Build all passed; Performance Fast Gate failed on the known Issue #232 first-rAF stall.
- The PR is not merged. Do not claim CI/release closure until all required workflow runs finish and the merge is explicitly authorized.
