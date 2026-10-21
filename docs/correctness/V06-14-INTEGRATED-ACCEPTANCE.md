# V06-14 — Integrated correctness and platform acceptance

**Status:** in progress; do not claim closure without latest-head official checks.  
**Started:** 2026-10-21  
**Base:** `origin/develop` `ac5ae594c4d8eb8f38adbb226b3963c0b35e38e0` (V06-13 merged)  
**Branch:** `test/v06-14-integrated-acceptance`  
**Scope:** release-level verification of already-delivered v0.6 features. No new feature surface and no version change: V06-15 owns version/release.

## Stage 1 — Authority, matrix and startup

- Reviewed `AGENTS.md`, `docs/agent/{TESTING,ARCHITECTURE_RELEASE,WORKFLOW,ENVIRONMENT,PERFORMANCE}.md`, `docs/product/V0.6-DELIVERY-PLAN.md`, and both desktop/link interaction contracts. The isolated worktree starts from the latest remote develop; Node 24.21.0 and pnpm 10.33.4 confirmed.
- Initial Windows Vitest bootstrap failed **before discovery**: the main checkout donor's `tinyexec@1.2.4` package was empty. After switching to the fingerprint-matched V06-13 donor, 23 focused tests passed, but TOC suite failed **before discovery** with Vite `Denied ID` due to cross-worktree realpath leakage. Neither issue is valid product failure. Per the existing environment recipe, a worktree-local `pnpm install --frozen-lockfile --offline --ignore-scripts` completed successfully (1,851 packages, zero downloads), without any source or Vite allowlist change. The same TOC suite then executed successfully (11 assertions).
- V06-13 [PR #254](https://github.com/Bulls1986/Inkiva/pull/254) and its successful latest-head checks are historical qualification only. They do not replace V06-14 head checks.
- [Issue #230](https://github.com/Bulls1986/Inkiva/issues/230) remains an independent native watcher-storm/256–257 boundary qualification debt; a standard Fast Gate does not silently close that scenario.

## Traceable scenario matrix

| Area | Correctness acceptance | Contract owner / focused tests | Electron scenario |
| --- | --- | --- | --- |
| Link completion | standard Markdown; spaces/CJK/`#`/`%` paths; IME Enter; cancel 0 writes; one Undo; caret | `document-intelligence-links`, `link-completion-session` | `link-completion.spec.ts` |
| Navigation and dirty tabs | same/cross-file anchor; virtual reveal; stale scroll cancellation; focus; unsaved state | `toc-navigation`, `document-intelligence-links` | `cross-file-link-navigation.spec.ts`, `anchor-link-scroll.spec.ts` |
| Backlinks/index | unopened workspace files; live dirty precedence; exact source offset; generation/stale cancellation | `document-intelligence-backlinks-v06-05`, `document-intelligence-workspace-index` | `v06-backlink-navigation.spec.ts` |
| Broken links and repair | no false positives in code/image/external; explicit repair; cancel no mutation; stale revision | `document-intelligence-broken-links`, `document-intelligence-repair`, `document-intelligence-v06-07` | `v06-broken-link-repair.spec.ts` |
| Rename/move | source/target moved together; byte-preserving keep/cancel; case/Unicode; partial FS failure; Local History | `document-intelligence-rename-recovery-v06-08` | `v06-rename-repair.spec.ts` |
| Image | non-overwrite; unsaved paths; missing-asset relink; source round-trip; undo; failed writes | `image-data`, `image-path-autocomplete`, `image-exclusive-fs-ipc` | `image-relative-path.spec.ts`, `image-edit-tool.spec.ts` |
| Outline | keyboard/focus; 300+ virtual headings; correct reveal; async intent ordering | `toc-navigation`, `v06-09-virtual-toc-accessibility` | `v06-outline-keyboard.spec.ts`, virtualized navigation |
| Table & writing | cell hard break caret, TSV, structural Undo/Redo, Source/WYSIWYG, IME, bytes | existing Muya/table regressions | `table-hard-break-roundtrip.spec.ts`, `table-editing-us12.spec.ts`, `strong-cjk.spec.ts` |
| Cross-cutting | reopen and dirty-tab durability, Markdown round-trip, command focus, filesystem errors | full desktop/Muya unit + round-trip/conformance suites | full Electron E2E and platform build/package/updater artifact smoke |

**Test-layer policy:** semantic behavior is verified at the lowest adequate layer; only real Electron window, IPC, IME, keyboard, caret, focus and filesystem integration belong in Electron E2E. Existing assertions, performance sample sizes and thresholds must not be weakened.

## Stage 2 — Executed local correctness

Pending final unit, typing, build, native-scenario and test discovery results. Bootstrap errors are separate from product failures. The initial 23/23 valid focused test assertions cover link parser/index, rename failure safety and image path suggestions only; the combined command was **not a passing suite** because TOC discovery failed.

- After independent dependency restoration, five focused files discovered 35 tests: 34 passed and the new combined scenario failed **inside the test body** because the initial harness bypassed the durable Local History recovery owner required for 2+ file repair. No product code was changed; the scenario now uses the existing `DocumentIntelligenceService.applyRenameRepair` entry point and verifies both durable preimages.
- `pnpm -C packages/desktop exec vitest run test/unit/specs/v06-14-integrated-document-maintenance.spec.ts` — **1/1 passed**, exit 0. This fixture combines unopened workspace indexing, backlinks, on-disk move, explicit two-document guarded repair, byte-exact preservation of Markdown/image/code/external links, verified Local History preimages, reindex and absence of false broken-link findings.
- `pnpm -C packages/desktop test:unit` — **173/173 test files passed; 1,351 tests passed, 1 pre-existing skipped**, exit 0. New test included. The skipped test was not changed.
- `pnpm exec eslint packages/desktop/test/unit/specs/v06-14-integrated-document-maintenance.spec.ts` — final source **exit 0, zero ESLint findings**; only the pre-existing Node `MODULE_TYPELESS_PACKAGE_JSON` config warning. Removed the initial non-null assertion rather than suppressing the lint rule.
- Final-source focused integration rerun — **1/1 passed** (exit 0). No production code was modified by V06-14.
- `git -c core.whitespace=cr-at-eol diff --check` — exit 0 (checked before commit).

## Stage 3 — Official PR-head CI & artifact verification

Pending PR, exact head SHA, workflow run links and checks: Lint; Test; full Electron E2E; Fast Hard Gate collector **and evaluator**; Win x64 / macOS x64 / macOS ARM64 builds and package smoke; Updater artifact smoke; artifact-link comment. PR green on historical SHA is insufficient.

## Stage 4 — Acceptance decision, deferrals, lessons

- A true unresolved P0 regression or failed required latest-head gate blocks V06-14.
- Native macOS **manual** interactive acceptance, official reference-machine absolute performance qualification, and #230 native watcher-storm workload are separate evidence populations. Never report them as passed merely because Linux Electron snapshots, macOS CI packages or standard PR Fast Gate passed. Record any unexecuted items explicitly in V06-15 release readiness.
- At closeout, capture commit/PR/squash merge SHA and verify actual `develop` target ref, local worktree hygiene, and learning review; leave V06-15 version/release alone.
- **Learning so far:** the actual bulk-repair service entry point guarantees a durable Local History preimage; a direct helper call without that recovery owner is not an acceptable integration harness. Correct the test's entry point, not the production safety guard. Also reject donor node_modules realpath leakage rather than enlarging Vite permissions; a lockfile-identical offline, worktree-local dependency install restored valid test discovery.
