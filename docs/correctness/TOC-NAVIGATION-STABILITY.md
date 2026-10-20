# Long-document TOC navigation flicker — investigation record

Status: **CLOSED — squash-merged into `develop`; official PR CI fully green**  
Date: 2026-10-20  
Original task branch: `fix/toc-navigation-jitter`  
Merged `develop` SHA: `afab3ce0ef652a743419e194b221cec6b9fc40fe`  
Base: GitHub-verified `develop@5117e1c08c4cfbdbfd1d7e1371f3c5c86a6a46d7`

Public tracking: [Inkiva issue #245](https://github.com/Bulls1986/Inkiva/issues/245). The issue holds a sanitized symptom and recovery description; uploaded private artifacts remain local-only.

## Stage 1: evidence and code trace

- Reported symptom: clicking a later heading in the outline from an earlier heading in a large Markdown report produces continuous back-and-forth jumping and flicker.
- An attached 263286-byte Markdown file with 179 ATX headings was imported into the isolated local worktree at `artifacts/imports/TEST_STATUS_REPORT.md`. This file and the screenshot contain private material and MUST NOT be committed.
- `sideBar/toc.vue` explicitly emits `scroll-to-header`; `editorWithTabs/editor.vue` calls `documentGeometry.revealBlock`; `muya/src/block/scrollPage/index.ts` handles navigation targets, virtual window hydration and block-height corrections; `tocOutline.ts` derives active-heading state from scrolling.
- Competing viewport writers / non-convergent virtual geometry are investigation hypotheses, NOT a demonstrated root cause.
- Existing `packages/desktop/test/e2e/toc-scroll.spec.ts` uses 20 headings and only asserts reaching the target. It has no post-arrival oscillation assertion on a large virtualized document.
- Relevant contracts read: root `AGENTS.md`, testing, architecture/release, environment, ARCH-03, ARCH-04 and desktop editor interaction contract.

## Stage 2: execution readiness — blocked by environment (not Red)

- Windows runner, isolated managed worktree, Node 24.21.0 and pnpm 10.33.4.
- Latest GitHub `develop` was verified with the GitHub branch API; the local `origin/develop` matches, and the worktree task branch was switched to this commit. A separate `git fetch` timed out.
- The shared `node_modules` graph was incomplete: `electron-vite` could not resolve `cac/index.js`, so the Electron build stopped BEFORE any product test.
- Removed only the worktree root Junction (donor intact) and attempted one isolated `pnpm install --offline --frozen-lockfile --ignore-scripts`. The command progressed to 1181/1851 packages without downloads but timed out at 120 seconds. Inspect the partial state; do not blindly duplicate the Job.
- **No executed product Red; no production-code edits; no Green or CI proof.**

## Historical investigation checklist (completed; retained for audit)

1. Inspect previous Job/worktree state and complete environment readiness using the existing `docs/agent/ENVIRONMENT_RECIPES.md` contract, rather than interpreting bootstrap failures as product failure.
2. Build from this worktree; run a focused Electron reproduction using the locally imported private fixture. Record the scrollTop trajectory, geometry revision, target heading rect and all scroll writers for several seconds after a click. The fixture must remain untracked.
3. Reduce to a PUBLIC-SAFE synthetic long document (headings + large table), write a test that **executes and fails for the target behavior** on unmodified `develop` before any production edit.
4. Fix only the proven root cause behind the Muya document-surface ownership boundary. Avoid blind debounce, fixed delays and secondary viewport writers.
5. Confirm stable target reveal across repeated long jumps; verify newer wheel/keyboard navigation supersedes stale corrections, active-heading synchronization, caret/selection, no document mutation, and related virtualization/TOC regression gates.
6. Update this record with exact Red/Green commands/results; review architecture/hygiene; only then commit, PR and CI closeout. Do not claim completion early.

## Stage 3: executed Red and confirmed root cause (2026-10-20)

The offline 1851-package installation finished successfully (pnpm 10.33.4, about 4m19s) after resuming with a long-lived Runner Job. The isolated Electron build passed (55.35s); matching Electron 42.1.0 native binaries and ced.node were provided only inside ignored worktree node_modules.

**Actual source-backed Red:** `packages/desktop/test/e2e/toc-navigation-private-diagnostic.spec.ts` (local-only, must be removed before PR) launched Electron with the unmodified private report and clicked the exact two headings supplied by the user. ScrollTop trace on baseline: `15795.9525 -> 5970.84375 -> 15795.9525 -> 5970.84375 -> 11767.534375 -> 5970.84375 -> ...`. In five seconds, there were 24 script writes and 22 scroll events, continuing to alternate ~5971 vs ~11768. The test entered its body and failed its stability assertion (46 trace entries, required <40). The write stacks show `ScrollPage.revealBlock()` first, then repeated `ScrollPage._hydrateVirtualWindowAtCurrentViewport()`. This proves an active virtual-navigation target alternating between real mounted DOM position and its stale logical offset, not repeated sidebar clicks.

**Root cause:** `_virtualNavigationTarget` was absent from Muya's `_virtualPinnedRanges()`. After the first DOM-based correction moved scrollTop outside the estimated window, the virtual window unmounted the target, and the next hydration had to fall back to its original estimated prefix position. The resulting mount/unmount loop never reached a stable target.

**Focused executable Red:** in `packages/muya/src/block/scrollPage/__tests__/virtualizationProduction.spec.ts`, the new test `keeps a pending outline navigation target mounted when estimated and actual offsets disagree` was executed on unchanged product source via `node node_modules/vitest/vitest.mjs run src/block/scrollPage/__tests__/virtualizationProduction.spec.ts -t 'keeps a pending outline navigation target mounted'` from `packages/muya`: **1 failed / 38 skipped**, at `expect(target.domNode?.isConnected).toBe(true)` after a simulated offset correction.

## Stage 4: minimal fix and Green (partially complete)

- Muya change: include the active `_virtualNavigationTarget.index` in `_virtualPinnedRanges()` only while navigation is pending. This is within the ARCH-03/04 Muya-owned virtual surface; Desktop does not manipulate internal virtual-window state.
- Same focused Muya test: **1 passed / 38 skipped**. After rebuilding the current Electron code (43.17s), reran the private diagnostic: **1 passed**, 2 initial scroll writes and 1 scroll event in the same five-second observation window; no oscillation.
- The diagnostic also exposed a separate aspect of the same navigation interaction: the target heading was visible at the top, but active TOC highlighting still referred to the earlier section. The live heading mounted after the last `syncTocHeadingAnchors` stamping pass; scroll sync skipped its missing DOM slug and used stale estimated-prefix ordering.
- Focused desktop Red: `test/unit/specs/toc-outline.spec.ts`, test `recognizes a heading mounted after the last TOC anchor refresh by its virtual block index`: **1 failed / 15 skipped**, last active `uid-previous` instead of `uid-target`.
- Desktop fix: maintain an O(1) `blockIndex -> slug` map from the current TOC, use it to resolve newly mounted headings during the already-deferred settled active-heading pass, and keep normal nonvirtual DOM-anchor fallback.
- Desktop `node node_modules/vitest/vitest.mjs run test/unit/specs/toc-outline.spec.ts`: **16/16 passed**.

**Historical stage-4 checklist:** the required focused verification, privacy cleanup and PR/CI follow-up were subsequently completed in stages 5–6. The standalone local `vue-tsc` diagnostic remains unproven against an identical-base run and is not claimed to have passed.

## Stage 5: local verification and privacy closeout (2026-10-20)

- Rebuilt desktop Electron after the TOC active-heading fix: **passed**, ~45.94s.
- Original private report, stricter Electron diagnostic: **1/1 passed**; only 2 initial script writes / 1 scroll event over five seconds, heading displayed at top, current active outline label exactly matched the clicked heading.
- Added committed-safe synthetic `packages/desktop/test/e2e/toc-virtualized-navigation-stability.spec.ts`. It creates a large multi-table Markdown report with 220 appendix sections, verifies virtualization, checks settled scroll trajectory (not simply instant visibility), destination materialization and active-highlight correctness. **1/1 passed**.
- Focused navigation E2E group: `toc-scroll.spec.ts`, `anchor-link-scroll.spec.ts`, and the new synthetic test: **7/7 passed**, ~23.2s.
- Desktop outline unit suite: **16/16 passed**. Muya production virtualization suite: **39/39 passed**; expanded pending-navigation regression also checks that the target pin is released when the navigation target clears (suite re-executed 39/39).
- Desktop changed-file ESLint: **passed** after formatting fixes. Muya scoped ESLint: **exit 0**, 5 existing complexity/length warnings in other functions (0 errors).
- Isolated `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **failed with existing-looking Muya declaration/type diagnostics** in unchanged source locations (e.g., `__MUYA_BLOCK__` DOM augmentation, `FileIcons`, prism declarations, `loadLanguage`). No new diagnostics were reported against the modified TOC code or added tests. This was not yet verified against a clean identical-base typecheck; **do not claim that the entire typecheck gate passed or that baseline parity is proven**. Do not broaden this focused bug fix to unrelated Muya typing cleanup.
- Removed the local-only private Electron diagnostic spec and the copied original Markdown report from the worktree after successful validation. Only sanitized stage evidence and a synthetic test remain for the PR.

## Historical release / merge checklist (completed in stage 6)

The scoped diff, privacy review, push, PR validation, platform package/update/performance checks, and explicitly authorized squash merge were completed. This section is retained as an audit checklist, not an outstanding task.

## Stage 6: official CI, authorized squash merge and final verification (2026-10-20)

- Original implementation commit: `92a693b3f4d51ddb601835770cf2d8744cac29ed` on `fix/toc-navigation-jitter`. [PR #246](https://github.com/Bulls1986/Inkiva/pull/246) was **squash-merged** after explicit user authorization and is now closed.
- Final squash commit in `develop`: **`afab3ce0ef652a743419e194b221cec6b9fc40fe`**, independently verified against GitHub's authoritative remote `develop` branch ref (not just the local tracking branch).
- [Issue #245](https://github.com/Bulls1986/Inkiva/issues/245) was automatically **closed** by the merge, independently verified via GitHub.
- Official GitHub Actions for the implementation Head: **11/11 workflows completed successfully**, with zero failures or pending checks. All Desktop/Muya E2E, tests, lint, CommonMark/GFM, circular-dependency, Muya Build, Performance Fast Gate and PR Build jobs passed.
- The Fast Gate's threshold-evaluation step was **successful**, not merely the benchmark command. Platform PR Build produced Windows x64, macOS Intel x64 and macOS arm64 artifacts; package/install smoke passed on all three, and updater artifact-assembly/contract smoke passed. The [official run](https://github.com/Bulls1986/Inkiva/actions/runs/39357864774) supplies the build evidence.
- PR was `CLEAN` / `MERGEABLE` before squash; no unresolved review threads were present. The PR's [official CI closeout comment](https://github.com/Bulls1986/Inkiva/pull/246#issuecomment-6282154810) records the pre-merge evidence.
- **Validation caveat, not an unresolved issue-245 blocker:** an extra local standalone `vue-tsc --noEmit` run produced Muya typing/declaration errors at unchanged locations; baseline parity was not established. No claim is made that this *separate* local check passed. All official required PR checks did pass. Investigate independently only if that gate becomes required or a relevant regression is reported.
- The supplied private Markdown fixture and the temporary diagnostic E2E were excluded from the PR, and the public synthetic regression remains in the repository. No changes to the root README were needed.
- **Lesson review:** a virtual-scroll navigation target must remain materialized until exact-geometry settlement, but only for the lifetime of that navigation transaction; newly mounted headings need current logical block-index lookup rather than stale DOM stamping. This is application-specific evidence of the existing [ARCH-03 virtual-surface ownership contract](../architecture/ARCH-03-VIRTUAL-SURFACE-CONTRACT.md), not a new parallel policy. Prior [workflow](../agent/WORKFLOW.md) and [environment recipes](../agent/ENVIRONMENT_RECIPES.md) already govern squash-only merge, CI closeout and isolated Windows dependency recovery, so no duplicate top-level guidance was created.
- **Task state:** functional fix, tests, official CI, squash merge, remote-ref verification and issue closure completed. No further action is required for Issue #245.

