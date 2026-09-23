# RELEASE-AUDIT-01 — v0.4.1 Test & E2E Efficiency Audit

> Status: IN PROGRESS — Phase 1 baseline collection
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
| 1. Current Test Baseline | In progress | Static inventory, CI timings, harness configuration and environment limitations captured below. Complete case-level inventory / CI log analysis and identify slow suites/setups. |
| 2. Test Architecture Audit | Not started | Audit duplicate contracts, wrong-layer coverage, oversized flows, fixtures, waits, lifecycle, flakiness and shared state. |
| 3. Root Cause Analysis | Not started | Synthesize evidence before proposing changes. |
| 4. Optimization Plan | Not started | Write P0/P1/P2 plan and Test Contract Matrix before implementation. |
| 5. Implementation | Blocked by Phase 4 | No test/CI optimization has been applied yet. |
| 6. Before / After Validation | Not started | Must use equivalent workloads and preserve all gates. |
| 7. Release Readiness Audit | Not started | Version change remains forbidden until this passes. |
| 8. v0.4.1 Version Preparation | Not started | Current authoritative package versions remain 0.4.0. |

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
