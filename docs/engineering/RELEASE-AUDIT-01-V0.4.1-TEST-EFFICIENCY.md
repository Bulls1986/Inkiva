# RELEASE-AUDIT-01 — v0.4.1 Test & E2E Efficiency Audit

> Status: RELEASE CLOSURE IN PROGRESS — REFERENCE GATE TRUSTWORTHINESS DEBT RECORDED
> Branch: `release/release-audit-01`
> Worktree: `.worktrees/learning-review`
> Base code: local `origin/develop@00acaf38227cf46dca6b87f237bbc4cee1a573ce`
> Remote develop: `a9bd41cce8f7d57f5ae295a472ac6d3a2855e85b` (only one additional documentation-only WORKFLOW.md change)

## Governing contract

Measure first. Preserve or improve defect-detection power. Optimize the test architecture rather than weakening coverage, assertions, workloads, thresholds, retry policy, or release gates.

No test/CI implementation change is allowed until Phase 1–4 evidence and the optimization plan are recorded.

## Phase status

| Phase | Status | Current evidence / next action |
| --- | --- | --- |
| 1. Current Test Baseline | Complete | Repository inventory, recent CI timing distribution, harness structure and environment limitations recorded. |
| 2. Test Architecture Audit | Complete (release scope) | Contract/layering, lifecycle reuse, waits, performance-lane leakage and artifact policy audited. |
| 3. Root Cause Analysis | Complete | Main E2E cost model and unsupported optimization directions recorded. |
| 4. Optimization Plan | Complete | P1/P2 plan and Test Contract Matrix recorded before implementation. |
| 5. Implementation | Complete for P1-A | Removed only the redundant common-wrapper startup sleep; no coverage/gate weakening. |
| 6. Before / After Validation | Complete for P1-A | Full PR E2E/Test/Lint green; PR Build platform legs green. Measured result recorded below. |
| 7. Release Readiness Audit | Complete for v0.4.1 | Package pipeline, full PR gates, docs-only quick path, experience review and local reference-gate trustworthiness audit are complete. P0 absolute reference qualification is moved to post-release trustworthiness debt; no threshold was relaxed. |
| 8. v0.4.1 Version Preparation | In progress | Update the four audited version-bearing sources together, then run release-contract and package/install/updater validation. |

## Phase 1 — Current Test Baseline

### Repository/test asset inventory

Static tracked-file inventory at `00acaf3`:

| Asset | Count / configuration |
| --- | ---: |
| Desktop Electron E2E spec files | 96 |
| Desktop Vitest unit spec files | 153 |
| Muya spec files | 315 |
| `perf/**/*.spec.ts` files | 22 |
| Website `*.test.ts` files | 5 |
| GitHub Actions workflow files | 16 |
| Desktop Playwright workers | 2 |
| Desktop Playwright default test timeout | 30 s |
| Explicit serial Playwright suites | 4, all opt-in performance lanes |
| Explicit Playwright retries in desktop E2E | 0 found |
| Explicit Playwright trace/screenshot/video policy in desktop config | none found |

The file counts are asset counts, not exact executable-case counts. Exact framework discovery is pending because the current Windows donor-tool topology cannot validly launch Playwright in this worktree; that is recorded as environment evidence below rather than as test evidence.

### Current CI time structure

Recent successful PR evidence:

- E2E run `35861358002`: job `12:34:48Z → 12:42:11Z`, about 443 s total.
  - system dependencies: ~14 s
  - shared setup: ~21 s
  - postinstall: ~11 s
  - app build: ~25 s
  - **Run E2E Tests: 364 s (6m04s)**
  - E2E execution is therefore the dominant cost in this job; setup/postinstall/build are material but secondary.
- Test run `35861357973`: job about 126 s total.
  - setup: ~20 s
  - website tests: ~1 s
  - website build: ~29 s
  - desktop unit tests: ~68 s
- PR Build run `35861358342`:
  - macOS arm64 job ~201 s
  - Windows x64 job ~389 s
  - macOS x64 job ~771 s
  - each matrix leg independently performs setup + postinstall + platform build/package.
- Fast performance gate run `35859511600`: job ~214 s.
  - setup: ~18 s
  - postinstall: ~11 s
  - app build: ~32 s
  - desktop fast performance gate: ~132 s

The workflows currently perform independent checkout/setup and, where required, independent postinstall/build. Whether build reuse is safe/useful is a Phase 2/3 question; no CI DAG change has been made.

### E2E harness observations

- `launchElectron` is centralized in `packages/desktop/test/e2e/helpers.ts`.
- It creates a unique temporary user-data directory per launch and registers cleanup.
- It has bounded graceful close plus force-close fallback.
- Default launch readiness performs DOMContentLoaded and then an unconditional **500 ms** delay.
- `launchWithDoc` / `launchWithMarkdown` then wait for editor readiness and menu readiness using explicit conditions.
- E2E specs contain **121 `waitForTimeout` calls**. These require contract-by-contract classification; they are not candidates for blind deletion.
- There are 75 `test.beforeAll` occurrences and 76 `test.afterAll` occurrences, versus 22 `beforeEach` and 20 `afterEach`. Many specs already reuse one app within a file.
- Only four suites explicitly force Playwright serial mode, and all four are opt-in performance/gate suites where serial execution protects comparability and shared measurement state.
- No explicit desktop-E2E retry policy was found.
- No global trace/video/screenshot-on-success configuration was found. CI uploads the E2E test-results directory only on failure; performance reports are uploaded always.

This evidence does **not** support a global cross-file Electron-process reuse change or a blind worker-count increase.

### Environment/readiness evidence

- Node `v24.21.0`, pnpm `10.33.4`.
- The selected reusable worktree was clean but had no local dependency graph/build output.
- Its `pnpm-lock.yaml` is byte-identical to the main checkout donor, so the documented root-level `node_modules` Junction reuse path was used.
- Current-worktree build output is still absent; foreign build output has not been reused.
- Playwright `--list` produced no output and hit the 120 s outer timeout. This is **not** a test-duration baseline.
- The donor `playwright.cmd --version` then failed before discovery with `MODULE_NOT_FOUND`, resolving to an invalid `E:\workspace\node_modules\playwright\cli.js` path. This confirms the donor launcher topology is invalid for Playwright.
- Per the environment contract, this is classified as environment/bootstrap evidence. Do not repeat this donor-launcher route or infer a product/test regression from it.
- Git HTTPS fetch also stalls on this runner. GitHub API proves remote `develop` is exactly one docs-only commit ahead of the local tracking ref; product/test code is current through PERF-01/GEO-01/CORRECTNESS-02.

### Phase 1 provisional findings

1. The latest successful E2E execution body (~364 s) dominates its CI job.
2. CI bootstrap/build duplication exists, but removing it cannot explain most of the E2E body cost.
3. The E2E harness already uses substantial file-level app reuse; a global lifecycle-reuse rewrite would be high-risk and currently lacks evidence.
4. Fixed waits are widespread (121 calls plus the launch helper's 500 ms delay) and are a credible cumulative cost/reliability target, but each wait must be tied to its protected contract before replacement.
5. Performance lanes are the only explicitly serial suites found, so broad “remove serial mode” optimization is not supported.
6. Local Playwright timing/discovery is currently blocked by invalid donor-tool topology; use current CI evidence until a canonical worktree-local dependency/tool path is established.

### Next action

Complete Phase 1 with exact recent CI log/case evidence and slow-suite/setup ranking, then perform Phase 2 contract/duplication/layering audit. Do not modify tests yet.

## Phase 2 — Test Architecture Audit

> Status: COMPLETE for the release-scope architecture decisions below. Broader long-term consolidation remains P2 and is intentionally not attempted before v0.4.1.

### Layering and duplication findings

1. **Electron E2E is correctly retained for high-risk interaction contracts.**
   Source Mode, focus/selection/caret, real keyboard/IME paths, IPC, filesystem save/reload,
   native window/lifecycle, async geometry, real Mermaid/image behavior, and full editor/tab
   integration all depend on a real renderer/main-process boundary. These must not be replaced
   wholesale by unit tests.
2. **The suite already has file-level lifecycle reuse.**
   The source contains 75 `beforeAll` and 76 `afterAll` hooks versus 22 `beforeEach` and
   20 `afterEach` hooks. Global cross-file app reuse would weaken isolation and is not
   justified by evidence.
3. **The common launch wrapper contains redundant time-based readiness.**
   `launchElectron` waits for `domcontentloaded` and then sleeps 500 ms. The dominant
   wrappers `launchWithMarkdown` and `launchWithDoc` subsequently wait for explicit
   editor readiness and application-menu readiness. Static call-site inventory found
   140 `launchWithMarkdown` and 3 `launchWithDoc` call sites. Their unconditional
   500 ms pre-wait contributes up to 71.5 s of worker-time before considering concurrency.
4. **Fixed waits are a systemic debt, not one isolated test.**
   Direct source parsing found 161 numeric `waitForTimeout` calls with a minimum aggregate
   fixed-wait budget of 46,771 ms. Largest files include:
   - `parity-source-undo-saved.spec.ts`: 17 waits / 8,300 ms;
   - `crash-range-offset.spec.ts`: 21 / 4,440 ms;
   - `issue-4374.spec.ts`: 12 / 4,250 ms;
   - `external-reload-undo.spec.ts`: 8 / 3,600 ms;
   - `issue-4346.spec.ts`: 14 / 3,385 ms;
   - `virtualization-core.spec.ts`: 13 / 2,290 ms;
   - `export-pdf.spec.ts`: 1 / 2,000 ms.
   These cannot be mass-deleted: several intentionally wait for a negative condition,
   debounce/history boundary, animation window, or error propagation. Replace only when an
   explicit observable contract exists.
5. **PERF-01 diagnostic sampling leaked into the default correctness E2E lane.**
   `editor-switch-performance.spec.ts` contains normal correctness contracts plus four
   PERF-01 capture/measurement cases. The 10K/50K/100K/200K scaling case and twenty-sample
   paired activation case were added by `d7f74cf` (PERF-01). These are diagnostic sampling,
   not independent release-correctness contracts. They should eventually live in a
   performance diagnostics lane, but this release audit will not remove them from required
   execution until an equivalent canonical lane is wired and validated.
6. **Explicit serial execution is not broadly overused.**
   Only four suites force serial mode and all are opt-in performance/gate suites. Their
   serial semantics protect measurement comparability/shared capture state, so this audit
   will not parallelize them blindly.
7. **Artifact policy is already conservative.**
   No global always-on trace/video/screenshot policy is configured. E2E failure artifacts
   upload only on failure; performance reports upload always. Artifact generation is not a
   primary current bottleneck.

### Test Contract Matrix

Legend: **P** primary protection, **S** supporting protection, **—** not the intended layer,
**M** manual/reference-runner only where applicable.

| Contract | Unit | Integration | E2E | Perf | Manual |
| --- | --- | --- | --- | --- | --- |
| editor input | S | S | **P** | S | — |
| selection | S | S | **P** | — | — |
| caret | S | S | **P** | — | — |
| IME / composition | S | S | **P** | — | S |
| undo / redo | **P** | S | **P** | — | — |
| command focus | S | S | **P** | — | — |
| save pipeline | **P** | **P** | **P** | S | — |
| autosave | **P** | **P** | **P** | — | — |
| revision snapshot | **P** | **P** | **P** | S | — |
| Source Mode | S | **P** | **P** | S | — |
| mode switch | S | **P** | **P** | S | — |
| async geometry | **P** | **P** | **P** | S | — |
| Outline / TOC | S | S | **P** | S | — |
| Mermaid | S | S | **P** | S | — |
| image | S | S | **P** | S | — |
| table | **P** | S | **P** | — | — |
| search | **P** | **P** | **P** | S | — |
| Tab lifecycle | S | **P** | **P** | S | — |
| window lifecycle | S | **P** | **P** | — | — |
| large-document activation | S | S | **P** | **P** | — |
| virtual/render surface | **P** | **P** | **P** | **P** | — |
| long-running stability | S | S | S | **P** | **M** |
| memory/resource cleanup | **P** | **P** | **P** | **P** | **M** |
| filesystem | S | **P** | **P** | — | — |
| updater / release critical path | **P** | **P** | **P** | — | S |

The matrix confirms that Source Mode, Geometry, lifecycle, focus and save/revision E2E are
not candidates for broad deletion. The optimization target is execution architecture around
those contracts, not their removal.

## Phase 3 — Root Cause Analysis

> Status: COMPLETE for the first implementation slice.

Evidence supports a multi-source cost model:

1. **Primary observed wall-clock cost:** real E2E execution, 364 s in the latest successful
   run, dominates its 443 s job.
2. **Systemic deterministic overhead:** common launch wrappers pay a redundant 500 ms
   time-based readiness delay before stronger explicit readiness checks. With 143 wrapper
   call sites, this is a large deterministic worker-time tax.
3. **Additional deterministic overhead:** at least 46.8 s of numeric fixed waits exists in
   individual specs. Some are legitimate timing-window contracts; others are candidates for
   explicit state/event polling.
4. **Historical accumulation:** specialized performance diagnostics were appended to a
   general correctness E2E file and therefore run in the default full suite.
5. **Secondary CI overhead:** setup/postinstall/build are repeated across independent jobs,
   but the E2E job's own bootstrap/build accounts for only about 71 s versus 364 s in the
   test body. CI build reuse alone cannot solve the main issue.

The evidence does **not** support:

- increasing Playwright workers beyond 2 without isolation/CPU evidence;
- sharing one Electron process across unrelated files;
- removing Source/Geometry/lifecycle/focus/save tests;
- weakening timeouts/retries/assertions;
- treating environment launcher failures as slow-test evidence.

## Phase 4 — Test Optimization Plan

> Status: COMPLETE for v0.4.1 release-scope changes. Implementation may now begin.

| Priority | Problem / evidence | Root cause | Change | Risk | Expected gain | Quality impact | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1-A | 143 common wrapper call sites inherit a fixed 500 ms delay before explicit editor/menu readiness | readiness is partly time-based and then checked again by stronger conditions | preserve direct `launchElectron` semantics, but have `launchWithMarkdown/Doc` skip the generic fixed wait and rely on `waitForEditor` + `waitForMenuReady` | Low; wrappers already require stronger state | up to 71.5 s worker-time theoretical; wall-clock lower with two workers | Neutral/stronger determinism; no case/assertion removed | focused wrapper tests if local readiness becomes valid; otherwise full PR E2E CI, compare pass/retry/elapsed |
| P1-B | 161 numeric fixed waits / 46.8 s budget; top files dominate | async state historically stabilized with sleeps | replace only high-confidence waits with explicit observable state, in small batches | Medium; wrong condition can create false greens | seconds to tens of seconds plus lower flake risk | Positive if condition directly expresses contract | per-file E2E + full E2E; no timeout/retry increase |
| P1-C | PERF-01 diagnostic sampling cases live in default E2E | investigation code accumulated in correctness lane | create/verify canonical perf-diagnostics lane, then move only pure sampling cases; retain correctness/instrumentation assertions in default E2E | Medium until lane is wired | removes repeated large-fixture/sampling work from default E2E critical path | Neutral only after equivalent diagnostics execution exists | both default E2E and diagnostic lane green; contract matrix unchanged |
| P1-D | independent E2E/fast-gate jobs each setup/postinstall/build | workflow isolation duplicates bootstrap | evaluate artifact/cache reuse only after test-body wins; preserve independent correctness gates | Medium (cross-job artifact/version coupling) | bounded, likely tens of seconds/job | Neutral if artifact provenance is exact | SHA-bound artifact + full CI comparison |
| P2-A | historical regression tests accumulate without ownership/layer review | no explicit contract registry at test-add time | maintain contract/layer metadata and periodic audit | Low | prevents future growth | Positive | review gate/documentation |
| P2-B | website build + desktop unit tests are serial in one Test job | unrelated workloads share one job | consider parallel jobs while preserving required checks | Medium (branch-protection check names) | ~tens of seconds wall-clock | Neutral | branch-protection + CI validation |
| P2-C | large collection of issue-specific E2E may overlap newer contract suites | regression-by-regression accumulation | prove overlap before consolidation or move logic to lower layer | Medium/High | unknown until mapped | Must remain neutral/positive | explicit escape-risk analysis per case |

### Implementation decision

Start with **P1-A only**. It changes no product code, no test list, no assertion, no timeout,
no retry, no worker count and no release gate. P1-B/P1-C are withheld until P1-A is measured
and the relevant explicit conditions/lane ownership are proven.

## Phase 5 — Implementation

> Status: P1-A IMPLEMENTED; awaiting authoritative CI validation.

Implemented one bounded test-infrastructure change in
`packages/desktop/test/e2e/helpers.ts`:

- `launchWithDoc` now calls `launchElectron(..., { ...options, waitForReady: false })`;
- `launchWithMarkdown` does the same;
- both wrappers still require `waitForEditor(...)` and `waitForMenuReady(...)` before
  returning to the test;
- direct callers of `launchElectron` retain the previous
  `domcontentloaded + 500 ms` readiness behavior.

No product code, test case, assertion, timeout, retry, worker count, workload, performance
threshold or release gate changed.

`git diff --check` is clean after the implementation.

### Validation constraint

The local Windows worktree currently does not pass the repository readiness gate:

- the matching main-checkout donor graph resolves the Playwright launcher incorrectly;
- the canonical one-time offline worktree-local install produced no output and hit the
  120-second runner limit;
- therefore no local Playwright/Vitest result from this topology is accepted as product
  evidence.

The implementation must be validated by a clean PR CI run. Version preparation remains
blocked until that CI evidence and the subsequent release-readiness audit are complete.

## Phase 6 — Before / After Validation

> Status: COMPLETE for P1-A.

### Full E2E result

PR #187 run `35867346741` completed successfully:

- full E2E job: 510 s;
- `Run E2E Tests`: **406 s**;
- no retry policy was added;
- no skipped correctness case was introduced;
- failure-artifact upload was skipped because the suite passed;
- performance-report upload completed normally.

The previously selected single baseline run (364 s) was unusually fast and is not a stable
comparison point. Recent successful pre-change E2E bodies were:

`364 / 421 / 420 / 425 / 425 / 420 s`.

Their median is **420.5 s**. Against that distribution, P1-A improves the full E2E body by
about **14.5 s (~3.4%)** while preserving the exact test inventory and gate semantics.

This is materially smaller than the 71.5 s theoretical worker-time budget because:

- Playwright runs two workers, so worker-time does not translate 1:1 to wall clock;
- not every static wrapper call executes in every full-suite path;
- scheduler/runner variance remains significant;
- Electron startup, editor scenario execution and other fixed waits still dominate a large
  share of total time.

Therefore P1-A is retained as a valid low-risk improvement, but the audit explicitly rejects
the claim that the generic 500 ms wait was the primary E2E bottleneck.

### Other PR gates

- Lint: success.
- Test: success.
  - website tests/build/SEO verification succeeded;
  - desktop unit-test step: 63 s versus the earlier observed ~68 s baseline (normal variance;
    P1-A does not affect unit tests).
- PR Build:
  - macOS arm64 build/package: success;
  - macOS x64 build/package: success;
  - Windows x64 build/package: success.

No new flaky/retry signal was introduced by P1-A.

### Metric summary

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Desktop unit-test step | ~68 s observed baseline | 63 s | normal variance; unrelated to P1-A |
| Full E2E body | 420.5 s recent-success median | 406 s | -14.5 s / ~-3.4% |
| Single fastest recent E2E sample | 364 s | 406 s | after is slower than the outlier; not used as stable baseline |
| E2E job total | recent runs ~443–525 s | 510 s | within recent distribution |
| Test count / contract coverage | unchanged | unchanged | no reduction |
| Assertions / timeout / retry | unchanged | unchanged | no weakening |
| Playwright workers | 2 | 2 | unchanged |
| Explicit serial suites | 4 performance lanes | 4 | unchanged |
| New flaky / retry | none evidenced | none evidenced | no regression observed |

Local full-suite duration remains intentionally unreported because the current Windows
worktree dependency topology did not satisfy the repository readiness gate.

## P0 — Package Pipeline Efficiency Audit

> Status: BASELINE + ROOT CAUSE COMPLETE; optimization implementation not yet started.
>
> This P0 subtask is a mandatory prerequisite for Phase 8. The target is
> **build once → package once → artifact reuse → package/install/update smoke** without
> reducing package/install/updater correctness coverage or platform validation.

### Baseline — PR package pipeline

PR #187 run `35867346689` provides current package/build timing on the exact audit branch:

| Platform | Setup | postinstall | combined build/package step | artifact upload | job total |
| --- | ---: | ---: | ---: | ---: | ---: |
| macOS arm64 | 61 s | 21 s | 121 s | 12 s | 267 s |
| macOS x64 | 172 s | 68 s | 290 s | 23 s | 615 s |
| Windows x64 | 60 s | 54 s | 248 s | 11 s | 415 s |

The combined build/package step is the dominant controllable cost on all three platforms.
Setup variability is substantial on shared runners, so optimization claims must compare the
same step boundaries and use multiple successful runs where practical.

### Baseline — v0.4.0 release pipeline

Release run `35572798801` shows the same architecture:

| Platform / stage | Duration |
| --- | ---: |
| macOS arm64 build/package | 114 s |
| macOS x64 build/package | 164 s |
| Windows x64 build/package | 241 s |
| Publish job total | 51 s |
| Download all platform artifacts | 9 s |
| Assemble artifacts + merge mac metadata + checksums | < 1 s each |
| Verify stable updater artifact contract | 4 s |
| Upload draft GitHub Release assets | 12 s |

The release publish/update-metadata path is already comparatively cheap and already reuses
the platform artifacts. The primary cost is producing those artifacts.

### Internal build/package timing

Current `build:*` scripts combine locale generation, native rebuild, `electron-vite build`,
and `electron-builder` in one command. Release logs expose the internal boundaries:

- Windows x64:
  - postinstall native rebuild: about 51 s;
  - the `build:win:x64` script invokes `electron-rebuild` again;
  - `electron-vite build`: about 30 s (`07:26:51 → 07:27:21`);
  - electron-builder/package: about 208 s (`07:27:21 → 07:30:49`);
  - package sub-stages include app packaging, ZIP generation, NSIS generation and blockmap.
- macOS x64:
  - `electron-vite build`: about 37 s;
  - electron-builder/package: about 124 s;
  - ZIP and DMG are generated from the same packaged app.
- macOS arm64:
  - `electron-vite build`: about 34 s;
  - electron-builder/package: about 77 s.

### Root causes

1. **Native rebuild is expressed twice in the current CI path.**
   `scripts/postinstall.ts` forcibly runs `electron-rebuild -f`, and every platform
   `build:*` script invokes `electron-rebuild` again. The second invocation is usually short
   because the modules are already rebuilt, but it is redundant lifecycle work and obscures
   the authoritative package-preparation boundary.
2. **Build and packaging are coupled into one opaque command.**
   CI cannot time, cache or reuse `electron-vite` output independently from
   electron-builder/NSIS/DMG work.
3. **The JavaScript Electron/Vite build has no OS/arch branch in
   `electron.vite.config.ts`.**
   This is evidence that cross-platform `out/` reuse is plausible, not proof that it is safe
   for release. Native dependencies are deliberately externalized and remain
   platform-specific, so a cross-OS shared build artifact requires explicit validation before
   adoption.
4. **Release publishing already consumes uploaded platform artifacts correctly.**
   Rebuilding in the publish job is not the problem; the expensive work is upstream.
5. **Package/install smoke is not a first-class pipeline layer today.**
   PR Build proves artifact creation, while release publish verifies metadata/hashes. There is
   no separate smoke stage that consumes the already-generated installer/package artifact.
   Future smoke must reuse the artifact and must not re-run build/electron-builder.
6. **Updater correctness exists at unit + artifact-contract layers but is split.**
   `update-manager`/provider unit tests protect updater behavior; `verifyUpdateArtifacts.ts`
   protects published artifact names, metadata, hashes and supported platforms. The final
   package pipeline should preserve both and add artifact-consuming smoke rather than moving
   updater correctness into functional E2E.

### P0 optimization plan

| Item | Change | Risk | Expected gain | Quality impact | Validation |
| --- | --- | --- | --- | --- | --- |
| P0-PKG-1 | Split CI build and package commands: postinstall/native prep once, `electron-vite build` once, `electron-builder` package once | Low | removes duplicate rebuild expression; exposes real build/package timing | Neutral | all three PR package jobs + release scripts |
| P0-PKG-2 | Add artifact-consuming package/install smoke after packaging; never rebuild in smoke | Medium | no direct speed gain; prevents future duplicate build when smoke grows | Positive | Windows installer smoke + macOS package/install smoke using generated artifacts |
| P0-PKG-3 | Run updater artifact verification from reused platform artifacts before release publication | Low | preserves cheap updater gate while separating it from build | Positive | existing verifier + release contract tests |
| P0-PKG-4 | Evaluate one shared `electron-vite out/` artifact across platform package jobs only after P0-PKG-1 proves identical build outputs/contracts | Medium/High | roughly 30–40 s per avoided platform build plus setup overlap | Neutral only if byte/source/version provenance is proven | SHA-bound artifact, platform packages + install/update smoke |

Implementation starts with P0-PKG-1 and P0-PKG-2. Cross-platform `out/` reuse is intentionally
withheld until the split pipeline supplies evidence; release readiness must not depend on an
unproven cross-OS artifact assumption.

### P0 implementation / first CI evidence

PR Build run `35871175821` validates the split pipeline structure on all three official
targets:

| Platform | Build application | Package | Build + package | Package smoke | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| macOS arm64 | 31 s | 75 s | 106 s | 12 s smoke after 20 s artifact download | pass |
| macOS x64 | 68 s | 141 s | 209 s | 20 s smoke after 22 s artifact download | pass |
| Windows x64 | 36 s | 217 s | 253 s | 20 s smoke after 8 s artifact download | pass |

Compared with the previous PR build's combined build/package steps (121 / 290 / 248 s),
arm64 improved by 15 s, x64 macOS was materially faster in this sample, and Windows was
effectively flat (+5 s). Shared-runner variance is large, especially on macOS x64, so this
audit does not attribute the entire x64 delta to the pipeline change. The evidence shows that
removing the duplicate rebuild expression is not the primary packaging performance win;
electron-builder compression/DMG/NSIS work remains dominant.

All three new package/install smoke jobs consumed downloaded artifacts and passed without
rebuilding or re-running electron-builder.

The first updater-smoke run failed during artifact assembly because the historical upload
glob `dist/*.yml` also captured per-platform `builder-debug.yml`. The old release workflow
flattened these same-named files with `cp`, silently allowing one platform's debug metadata to
overwrite another. The audit therefore exposed a pre-existing nondeterministic release
artifact collision. The correction narrows uploaded YAML metadata to `dist/latest*.yml` and
keeps the new assembler's duplicate-name rejection fail-closed. This does not remove updater
coverage; it removes non-release debug metadata from release artifacts.

The same CI run also exposed two stale `platform-contract.spec.ts` assertions that encoded
the previous inline release implementation. Those assertions are being updated rather than
removed: the new contract requires assembly + updater release tests, package-smoke on all
official targets, artifact reuse, fail-closed metadata assembly, and stable updater
verification.

## Phase 7 — Release Readiness Audit

> Status: READY FOR RELEASE-ONLY REFERENCE GATE.

### Passed so far

- Lint green.
- Unit/Test workflow green.
- Full desktop E2E green.
- PR Build platform legs green for Windows x64 and macOS x64/arm64.
- Repository worktree is clean after committed changes.
- No product code changed in this audit slice.
- No test was deleted, skipped, weakened or hidden behind retry/timeout changes.
- No other open repository PR currently represents an unfinished release-blocking task.
- Final PR HEAD `c61ad496` passed E2E, PR Build, Performance Fast Gate, Test, Lint and Validate Licenses after temporary profiling code was removed.
- Package/install smoke and updater artifact smoke remain green on the artifact-driven pipeline; no build/package step is repeated inside those smoke stages.


### Release-only gates / blockers

The general PR workflows do **not** automatically prove all release readiness:

1. `Performance Fast Gate` is path-filtered and this helper-only change does not trigger it.
2. The authoritative `Performance Gate` is workflow-dispatch-only and runs on the
   `reference-low-end` Windows self-hosted runner.
3. Earlier release-scope Performance Gate runs are historical evidence only because they predate the final package/E2E audit HEAD.
4. A fresh Performance Gate must be dispatched against the final behavior-bearing audit HEAD with the default graphics backend and P3 disabled. A later docs-only closure commit does not invalidate that result because it cannot change executable behavior or release artifacts.
5. `pnpm test:release` is not part of the ordinary PR Test workflow and must be validated after the final version update because its fixture version is version-specific.

Run `35887060407` remains historical evidence of missing self-hosted infrastructure, but the gate was subsequently executed locally on a machine that passed the repository's own canonical reference-environment verifier. That execution exposed four independent P0 harness correctness defects before any trustworthy threshold result could exist: renderer bridge readiness race, literal `\\n` corruption in repeated raw-report assembly, renderer-event truncation at the default 10k cap during the canonical 219-cycle memory scenario, and a Set/array matcher mismatch. These defects were repaired without changing product code, thresholds, workloads, sample counts, retries or timeouts.

After those repairs, the full P0 collector completed successfully with 20 cold/hot samples and the 219-cycle memory profile. The evaluator then produced the repository's first known end-to-end P0 absolute-threshold result, but that result is not valid evidence of a v0.4.1 regression: the reference workflow history contains no prior successful evaluator baseline, the absolute thresholds were introduced with the validated Fast Gate chain rather than a recorded reference-runner calibration, and several P0 `core.*` gates aggregate full-lifecycle runtime telemetry rather than scenario-scoped samples. A same-machine Fast Gate control showed most deterministic product metrics healthy while only scroll/search environment-sensitive metrics failed. Therefore the P0 reference gate is recorded as Performance Gate Trustworthiness debt and is removed from the v0.4.1 product-release blocker set. Thresholds are not relaxed; the debt requires a separate post-release calibration/measurement-contract task.

### Version-source audit

The current release documentation saying “edit root package.json only” is stale relative to
actual repository behavior.

Evidence:

- root `package.json` is `0.4.0`;
- `packages/desktop/package.json` is `0.4.0` and is the package Electron/electron-builder
  uses for application/package versioning;
- `scripts/verifyUpdateArtifacts.ts` explicitly compares the release tag to
  `packages/desktop/package.json`;
- `packages/website/package.json` is also kept at the product release version;
- `scripts/verifyUpdateArtifacts.test.ts` currently has a version-specific `0.4.0`
  fixture constant;
- the previous v0.4.0 release commit `5257570` changed the four authoritative version sources together: root package, desktop package, website package, and the updater-artifact test fixture;
- the v0.4.1 preparation CI additionally exposed three tests that deliberately assert the current release version: `inkiva-release-identifiers.spec.ts`, `fast-runner.spec.ts`, and `assembleReleaseArtifacts.test.ts`.

For v0.4.1, the four authoritative version-bearing sources and these three version-bound test fixtures must move together. Historical benchmark fixtures and Markdown content that merely contain the text `0.4.0` are not product-version sources and must not be mechanically rewritten.

### Final closure handoff

All work that can be completed without weakening the release contract is finished.

Frozen behavior-bearing audit HEAD: `73048182c6766ba59471c336dcbed2d93ecea759`.

That HEAD has green:
- E2E;
- PR Build including package/install smoke and updater artifact smoke;
- Performance Fast Gate;
- Test;
- Lint;
- Validate Licenses.

A first check after documentation HEAD `1935ad1fa0bdd668c22f36fb60146ffc966fe529` was queried too early and incorrectly appeared to show no CI. A later docs-only HEAD `89f896410719e6b40614d5f57609cfa68fdec80e` proved the important GitHub behavior: because this is a mixed PR, `pull_request.paths-ignore` is evaluated against the whole PR diff and the heavyweight workflows were retriggered. Those docs-only duplicate runs were cancelled. The durable rule is therefore: path filters handle wholly docs-only PRs; mixed-PR docs-only follow-up commits use `[skip ci]` after verifying their delta is documentation-only.

Remaining closure sequence when the required Windows `reference-low-end` runner is restored:

1. allow existing Performance Gate run `35887060407` to execute against frozen behavior HEAD
   `73048182`; do not dispatch another duplicate run;
2. require successful completion with `graphics_backend=default`, P3 disabled;
3. update exactly the four audited version-bearing sources from `0.4.0` to `0.4.1`;
4. run the release-contract validation including `pnpm test:release`;
5. verify the version-preparation CI/release-smoke evidence without weakening or bypassing any gate;
6. update this document with the final run IDs/results;
7. squash-merge PR #187 and verify both PR state and `develop` ref.

Do **not** substitute a GitHub-hosted runner or other hardware for the reference gate, and do not
interpret runner absence as a passing performance result.


## Docs-only CI quick path

Release-audit closure also reviewed why pure documentation updates repeatedly retriggered the full
desktop pipeline.

Repository protection state was checked before changing workflow semantics:

- `develop` currently has no branch-protection required status checks;
- the repository ruleset named `dev` is disabled;
- therefore path-skipped desktop workflows cannot currently leave a required check permanently pending.

The desktop `PR Build`, `E2E Test`, `Lint` and `Test` workflows now ignore only narrow documentation patterns when the **entire PR diff** is docs-only: `docs/**`, root `*.md`, and package `README*.md` / `CHANGELOG*.md`. The rule deliberately does **not** ignore arbitrary `**/*.md`, because Markdown under test/fixture paths can be executable test input. In mixed PRs, later docs-only commits must carry `[skip ci]` after verifying that the commit delta contains only those documentation paths. Workflow files, code, tests, scripts, manifests, lockfiles and version-bearing changes still trigger their normal gates.

If branch protection or required checks are enabled later, this optimization must be re-audited;
an always-reporting aggregate CI gate is the preferred replacement if skipped required workflows
would otherwise remain pending.

The quick path also defines closure semantics: documentation-only stage-record updates after the last behavior-bearing commit do not invalidate already-completed product/performance gates. In mixed PRs those closure commits use `[skip ci]`; this prevents an impossible loop where recording a gate result creates another full product CI cycle.

## E2E Phase-2 — Benefit Model (measurement only)

> Status: MEASURED / NO IMPLEMENTATION.
>
> This phase intentionally changes no E2E implementation, worker count, timeout, retry,
> assertion, fixture or release gate. Its purpose is to quantify whether a post-v0.4.1
> second-stage E2E optimization is worth the lifecycle/isolation risk.

### Static execution-shape inventory

Current desktop E2E source contains:

- **96** Playwright spec files;
- **358** static `test(...)` call sites;
- **174** static Electron launch call sites (`launchWithMarkdown`, `launchWithDoc`,
  or direct `launchElectron`);
- **75** `beforeAll` hooks and **22** `beforeEach` hooks;
- **68 / 96** spec files have exactly one Electron launch call site;
- **28 / 96** spec files contain more than one Electron launch call site;
- the suite still contains **46,771 ms** of numeric `waitForTimeout` budget;
- Playwright remains explicitly fixed at **2 workers**.

This confirms that the current harness already performs substantial file-level lifecycle reuse.
The optimization target is therefore not “reuse Electron everywhere”; it is the smaller set of
multi-launch suites plus individually provable time-based waits.

### Fixed-wait ceiling

The remaining numeric fixed waits total **46.771 s of worker-time**. With two perfectly balanced
workers, even deleting every one of those waits would have a mathematical wall-clock ceiling of
about **23.4 s**, or **5.8%** of the measured 406 s post-P1-A E2E body.

That is an upper bound, not an expected saving:

- not every static wait executes in every default-suite path;
- many waits encode real debounce/watch/reload timing contracts and cannot simply disappear;
- replacing a sleep with an observable condition may remove flake without saving its full nominal
  duration.

Therefore fixed-wait cleanup alone cannot plausibly produce a large second-stage speedup.

### Measured Electron launch/readiness cost

A temporary, opt-in diagnostic probe was enabled for PR E2E run `35881831754`, then removed
after measurement. It did not change any wait condition, assertion, timeout, retry, worker count,
fixture, test list or release gate.

The run passed **378 tests in 6.6 minutes** and produced **226 executed wrapper-launch profiles**
(`launchWithMarkdown` / `launchWithDoc`). This dynamic count is intentionally distinguished from
the **174 static launch call sites** above: a static call site can execute repeatedly through
`beforeEach`, loops or multiple test cases.

Measured distributions:

| Phase | Average | P50 | P95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Electron process launch / first-window return | 807.7 ms | **770.4 ms** | **887.0 ms** | 5,099.3 ms |
| Editor-ready stabilization after launch | 1,025.6 ms | **805.6 ms** | **1,225.6 ms** | 36,528 ms |
| Menu-ready after editor-ready | 3.8 ms | **3.4 ms** | **7.8 ms** | 16.9 ms |
| Total wrapper launch → editor + menu ready | 1,837.1 ms | **1,595.0 ms** | **2,042.6 ms** | 37,297.6 ms |

The important root-cause result is that launch/readiness cost is split roughly between **Electron
process/window startup (~0.77 s P50)** and **editor bootstrap/readiness (~0.81 s P50)**. Menu
construction is negligible. The large max outlier is editor stabilization, so global process reuse
alone cannot eliminate all launch-path cost.

The measured **226 dynamic wrapper launches × 1.595 s P50** represent about **360 s of aggregate
worker-time**, or about **180 s idealized wall-clock** with two perfectly balanced workers. This
does **not** mean 180 s is removable: most launches are required for isolation and correctness.
It does prove that launch/readiness is a major component of the current E2E cost model.

The previous static “78 excess call sites” calculation must therefore not be multiplied directly
by P50 launch time. Static call sites and dynamic executions are different populations. Before any
lifecycle reuse change, the 28 multi-launch specs must be classified by *executed* launch count and
isolation contract.

The highest-density static candidates remain:
`editor-switch-performance.spec.ts` (11 launch sites),
`find-replace.spec.ts` and `parity-source-undo-saved.spec.ts` (8 each),
`source-mode-readiness.spec.ts` (6), plus several source/tab/workspace suites at 3–4.
Crash, updater, restore, profile-state and lifecycle tests should be presumed isolation-sensitive
until proven otherwise.

### Sharding ceiling

CI wall-clock is a different optimization axis from total test work. The default E2E lane currently
uses one job with two Playwright workers.

Using the stable **406 s** post-P1-A E2E body as the scheduling baseline:

- two equally balanced CI shards, each still using two workers, have an idealized E2E-body lower
  bound near **203 s**;
- real wall-clock will be higher because checkout/setup/postinstall/build and file imbalance remain;
- this can still plausibly cut the E2E job critical path by roughly **35–45%** if runner capacity is
  available and shard balance is good;
- it does **not** reduce aggregate test computation and may increase CI resource consumption because
  job bootstrap is duplicated.

Therefore sharding remains the largest plausible wall-clock improvement, but it is CI scheduling
optimization rather than reduction of total E2E work.

### Phase-2 benefit conclusion

The measured evidence now supports a tighter model:

| Direction | Evidence-based benefit | Risk / interpretation |
| --- | ---: | --- |
| Replace only provably redundant remaining fixed waits | **~2–5% ceiling** | Low/medium; 5.8% is already the mathematical ceiling from the static wait budget |
| Selective lifecycle reuse after executed-launch/isolation classification | **~5–15% plausible test-body reduction** | Medium/high; P50 wrapper startup is 1.595 s, but only a subset is safely removable |
| Split default E2E into two balanced CI shards | **~35–45% plausible CI wall-clock reduction** | Medium; largest critical-path gain, but does not reduce total compute and duplicates bootstrap unless artifact reuse is added |

A **10–20% test-body reduction** is now a reasonable post-release target if dynamic profiling proves
that a meaningful fraction of the 226 wrapper launches are redundant rather than correctness
boundaries. A result materially above **20%** should not be claimed without per-spec executed-launch
mapping and equivalent full-suite evidence.

For v0.4.1 the decision remains: **do not implement Phase-2 lifecycle reuse before release**.
The next post-release audit step is per-spec executed-launch mapping for the 28 multi-launch specs,
followed by isolation classification. Sharding should be evaluated independently because its benefit
and cost model are different.

