# V06-14 — Integrated correctness and platform acceptance

**Status:** accepted by **12/12 official checks on the latest executable Head**; squash merge / remote `develop` verification is the remaining closeout action.
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

**PR [#256](https://github.com/Bulls1986/Inkiva/pull/256)** opened with initial source/test Head `3a4a9de93c3fe8729150d3768f706ce8ff66f904`. Initial PR Lint, Test, E2E and PR Build were scheduled; do not treat their queued/in-progress results as accepted.

**Release gate discoverability and executed Red:** the existing Performance Fast Gate workflow runs only for source/performance files listed under `pull_request.paths`; integration tests and stage documents alone do not schedule it. An initial attempt to add `workflow_dispatch` created a **valid CI contract Red** on head `93c8ed6f`: run [39611388769](https://github.com/Bulls1986/Inkiva/actions/runs/39611388769) failed at `Validate fast performance contracts` (13/14 passed) because the explicitly protected PR-only invariant rejected `workflow_dispatch`. As a consequence collector, evaluator and artifacts were absent; those dependent failures are not product/performance evidence. **Reverted that incompatible workflow change completely**; no test assertion was relaxed. Instead, added one positive `perf/soak/fast-policy.spec.ts` acceptance test on the already-supported PR path, asserting PR-only admission, correct fast contract → collector → evaluator → artifact order, `if: always()` evaluation/upload and fail-closed missing artifacts. This meaningful test change naturally schedules the existing Fast Gate without altering the workflow or thresholds.

**Latest executable Head:** `ebc468f31e4c587acdb5bd5bb26d12c9075ed5fc` (performance contract acceptance test; original Fast Gate workflow exactly restored). All observations below refer to this same Head, not to a canceled or historically green SHA.

| Official workflow | Run | Verified latest-Head jobs |
| --- | --- | --- |
| Lint (ESLint + TypeScript) | [39612271811](https://github.com/Bulls1986/Inkiva/actions/runs/39612271811) | **Pass** |
| Test | [39612271807](https://github.com/Bulls1986/Inkiva/actions/runs/39612271807) | **Pass** |
| E2E Test (real Electron) | [39612271841](https://github.com/Bulls1986/Inkiva/actions/runs/39612271841) | **Pass** |
| Performance Fast Hard Gate | [39612271862](https://github.com/Bulls1986/Inkiva/actions/runs/39612271862) | **Pass**: PR-only contracts, app build, Electron raw collector, hard-threshold evaluator and artifact upload. Verified resulting `desktop-performance-fast-gate` artifact (470,116 bytes, not expired) via GitHub Actions API. |
| PR Build / artifacts | [39612271870](https://github.com/Bulls1986/Inkiva/actions/runs/39612271870) | **Pass**: Windows x64, macOS x64 and ARM64 builds; all three platform **package smoke** jobs; PR artifact-link comment; **Updater artifact smoke**. |

**Gate decision:** `gh pr checks 256 --json name,state,bucket,link,workflow` confirmed **12/12 pass**, zero pending/failed checks, for executable Head `ebc468f3`. All required platform, E2E, collector/evaluator and artifact checks were directly executed; no performance thresholds or production code were changed. The PR-only workflow contract also remains intact.

**Remaining closeout operation:** commit this **docs-only evidence update** with `[skip ci]` per `docs/agent/WORKFLOW.md` (after checking the exact-only-docs delta), squash-merge [PR #256](https://github.com/Bulls1986/Inkiva/pull/256), and inspect the merged PR state plus remote `develop` ref. Documentation-only follow-up is not a substitute for, or a rerun of, the 12 checked executable-Head gates.

**Correction validation:** `pnpm test:perf:fast` on the restored PR-only workflow and added acceptance test passed **15/15 contracts**, exit 0. The original protected PR-only contract remains unchanged, no performance production path changed, and no runtime threshold was adjusted. The local test-harness assertion was also made CRLF-safe for Windows rather than reducing what it checks.

## Stage 4 — Acceptance decision, deferrals, lessons

- A true unresolved P0 regression or failed required latest-head gate blocks V06-14.
- Native macOS **manual** interactive acceptance, official reference-machine absolute performance qualification, and #230 native watcher-storm workload are separate evidence populations. Never report them as passed merely because Linux Electron snapshots, macOS CI packages or standard PR Fast Gate passed. Record any unexecuted items explicitly in V06-15 release readiness.
- At closeout, capture commit/PR/squash merge SHA and verify actual `develop` target ref, local worktree hygiene, and learning review; leave V06-15 version/release alone.
- **Learning so far:** the actual bulk-repair service entry point guarantees a durable Local History preimage; a direct helper call without that recovery owner is not an acceptable integration harness. Correct the test's entry point, not the production safety guard. Also reject donor node_modules realpath leakage rather than enlarging Vite permissions; a lockfile-identical offline, worktree-local dependency install restored valid test discovery.
- **Qualification trigger lesson:** release acceptance must deliberately run Fast Hard Gate even when only contract/test files change. Its PR-only invariant is enforceable, not an optional convenience. Use an accepted performance contract test under the existing `perf/soak/**` PR filter; never bypass that policy with an unapproved dispatch trigger or relax its regression assertions.
- **Closure decision:** no newly discovered or unresolved V06-14 product P0; no source, architectural boundary, rendering/editor behavior, version or release packaging policy changed. Dedicated #230 native watcher-storm, manual macOS interactive checks and reference-machine absolute performance remain **separately unqualified** and must be evaluated at V06-15 release readiness rather than described as passing.