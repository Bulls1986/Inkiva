# BASELINE-02 — Benchmark Trustworthiness Progress

> Status: IN PROGRESS  
> Branch: `perf/baseline-02-benchmark-trustworthiness`  
> Base: `develop@677f96e168e3043b42464bbaaca55948a68c44dc`  
> Task: audit and harden benchmark repeatability, measurement validity, comparability, and traceability without optimizing product behavior.

## Stage record

| Stage | Status | Evidence / next action |
| --- | --- | --- |
| Repository instructions | Complete | Read root `AGENTS.md` plus workflow/environment/performance guides. Existing environment paths are authoritative; no environment re-exploration. |
| Remote base verification | Complete | Normal `git fetch origin develop` timed out with no output. Per existing GitHub transport fallback, GitHub API resolved remote `develop` to `677f96e1`; commit is available locally and is the exact worktree base. |
| Isolation | Complete | Created `.worktrees/baseline-02` and branch `perf/baseline-02-benchmark-trustworthiness`. Main checkout's untracked `perf-results/` was not touched. |
| BASELINE-01 review | Complete for kickoff | Reviewed final report and retained findings: 50K long-tail failures, 500K default-backend extreme stalls, default/OpenGL divergence, and the P2 image-wrapper probe defect. These are inputs to trustworthiness audit, not assumed product regressions. |
| Benchmark inventory | First pass complete | Full first-pass matrix landed in `docs/benchmark/BASELINE-02-BENCHMARK-INVENTORY.md`, including cold startup, document open, input, save, FPS/frame timing, GC, heap, stability, fixtures and gate levels. |
| Measurement-boundary audit | First pass complete; fixes pending E2E remeasure | FPS is explicitly a ~1s rAF-window average. 50K fast-open samples were normalized to renderer-owned `openStartAt → milestone`. P0 `document.regular.*` is documented as cold-launch-coupled and not comparable with open-only metrics. |
| Metadata/provenance audit | Core implementation complete; PR merge identity fix pending CI | Fast runner reads product version from `package.json`. Reports carry checkout commit, source commit, Git tree, branch, Node, installed Electron, graphics backend, run mode, warm state, run id and optional fixture hashes. Fast Gate artifact proved PR runs execute a temporary merge commit, so pooling now keys code identity by Git tree rather than checkout commit. |
| Statistics schema | Complete | `calculateStatistics` exposes min/p50/p95/p99/max/count plus mean, population stddev and CV; zero-mean CV is defined as 0. |
| Harness validation | Core Node suites green | Donor `tsx@4.22.4` payload executes current-worktree sources correctly. `perf/gate/*.spec.ts`: 72/72 pass. `perf/soak` fast suites: 14/14 pass. Metadata CLI provenance path also passes. |
| Desktop type/E2E validation | CI path proven | Local donor `vue-tsc` remains invalid environment topology, but PR #177 standard CI built the app and completed the real Electron Fast Gate successfully. This is the authoritative Desktop path for BASELINE-02. |
| Variance/reproducibility | Fast Gate round available; reference rounds pending | PR Fast Gate completed successfully on standard CI. Two independent reference-runner rounds remain pending; the first queued reference run was cancelled before execution after provenance identity semantics were tightened. |
| Default GPU vs OpenGL | Pending real Electron runs | Must remain separate baselines; data must never be pooled. |
| Controlled slowdown | Complete at evaluator layer | Synthetic unchanged control passes and uniform known slowdown fails the declared p95 gate. Real Electron slowdown injection is not required for the evaluator correctness proof and no production slowdown code was added. |
| Trustworthiness matrix | Draft complete | First-pass TRUSTED / CONDITIONALLY TRUSTED classifications and comparison restrictions are in the benchmark inventory; final labels await reproducibility runs. |
| Pooling comparability | Complete | Added programmatic pooling contract: same product/suite/level, environment, Git tree, Node/Electron, graphics backend, run mode, warm state and fixture hashes are required. Checkout commit/source commit/branch/run id may differ when the executed code tree is identical. Missing tree/provenance is non-poolable. |
| Repeatability analysis | Complete, awaiting real reports | Added analyzer for two or more comparable runs. It reports per-run p50/p95/p99 and cross-run min/max/mean/population stddev/CV, and fails closed on backend/fixture/environment drift. |

## Initial trustworthiness findings

### BT-001 — Fast gate metadata is not sufficiently authoritative

`perf/soak/fast-runner.ts` currently emits a hard-coded product version (`0.3.0`) and generic environment labels such as `CI virtual display`. This means a retained result cannot yet answer the full provenance question required by BASELINE-02: exact commit/branch, real Electron/Node/GPU/ANGLE/display/fixture identity, benchmark version, run count, and warm/cold state.

Classification: **Benchmark infrastructure / traceability**, not product performance.

### BT-002 — FPS metric semantics are weaker than the name can imply

The large-gate helper `measureElementScrollFps` counts `requestAnimationFrame` callbacks for about one second and returns `frameCount / elapsedTime`. A set of those values can support a minimum **window-average FPS sample**, but it does not expose the absolute worst frame or long-frame distribution inside each window.

BASELINE-02 therefore must keep existing FPS evidence separate from:
- frame-time p50/p95/p99;
- long frames >16.7ms / >33.3ms / >50ms;
- any metric called “minimum FPS” unless its exact sampling-window meaning is explicit.

Classification: **Measurement semantics / naming risk**.

### BT-003 — BASELINE-01 already proved benchmark probes can be wrong

The diagram/image P2 collector initially treated absence of an offscreen `<img>` as failure even though correct virtualization could leave only the wrapper mounted. Aligning the collector with the established wrapper-based probe fixed the benchmark without changing product behavior.

Implication: BASELINE-02 must test benchmark harness correctness itself (parser/calculation/fixture/metadata/missing-sample validation), not merely rerun product scenarios.

### BT-004 — 50K open samples used inconsistent start boundaries

The first 50K sample reads the editor's own milestones and therefore measures `openStartAt → firstScreen/editable`. Subsequent samples previously captured a renderer timestamp before sending `mt::open-file` and measured from that earlier point to the editor milestone. This mixed IPC dispatch/activation overhead into 19 samples while excluding it from the first sample.

Harness correction applied: the external timestamp is retained only as a lower bound to identify the newly opened editor; the reported duration now always uses `measureEditorMilestones(milestones.timestamps)`.

Classification: **Benchmark correctness / measurement boundary**.

### BT-005 — Fast-gate statistics could not quantify variance

The authoritative statistics helper exposed percentiles and extrema but not mean, standard deviation, or coefficient of variation. BASELINE-02 therefore could not express its own repeatability criteria through the shared benchmark calculation path.

Harness correction applied: statistics now include population `mean`, `stddev`, and `cv = stddev / mean` (with zero CV for an all-zero series). This does not change existing gate thresholds or percentile semantics.

Classification: **Benchmark infrastructure / variance analysis**.

### BT-006 — Save metric semantics needed explicit naming

The fast gate's `save.50k` path calls the editor store's manual `FILE_SAVE()`, waits for the matching `mt::tab-saved` event, then waits two animation frames before ending the duration. It was tagged with phase `autosave`, although the measured action is manual save.

Harness correction applied across fast/reference/large gate collectors: manual save metrics now use phase `save`; the `autosave` phase remains available for actual autosave measurements. No save implementation, threshold, workload, or duration boundary changed.

Classification: **Metadata / semantic labeling**, not product performance.

### BT-007 — Fixtures were deterministic but lacked content identity

Repository Markdown, heading-storm, and workspace fixtures are generated deterministically and already have repeat-generation tests. However, retained benchmark evidence could identify a fixture only by logical id/size, not prove that the content was byte-for-byte identical across runs or commits.

Harness correction applied: fixture objects now include deterministic SHA-256 `contentHash` values; fixture tests assert hash shape and repeated-generation equality. This creates the basis for result metadata to carry `fixture id + hash` rather than relying on names alone.

Classification: **Fixture traceability**.

### Environment validation status

The BASELINE-02 worktree has Node 24.21.0 and pnpm 10.33.4. The main checkout has a matching lockfile but an incomplete root dependency graph and no `.bin/tsx.cmd`. Exactly one canonical worktree-local offline install was attempted; it timed out after 120 seconds with no output and produced no `node_modules`.

Further diagnosis found that the donor pnpm virtual store still contains a complete `tsx@4.22.4` package payload. Per the documented donor-tool fallback, invoking that package's real CLI while keeping cwd/test paths in BASELINE-02 is valid and has now executed the current-worktree benchmark suites successfully:

- `perf/gate/*.spec.ts`: **72/72 pass**;
- `perf/soak/fast-policy.spec.ts + fast-runner.spec.ts`: **14/14 pass**;
- reference metadata CLI: emitted `productVersion=0.4.0`, current commit/branch, Node 24.21.0, injected Electron 42.1.0 and `graphicsBackend=opengl`.

The donor `vue-tsc` route was separately tested and rejected because it fails inside the donor dependency graph before current-worktree type discovery. Therefore core Node harness changes are locally validated, while Desktop type/E2E evidence remains blocked by environment topology.

### BT-008 — P0 regular-document metrics are cold-launch coupled

The P0 scenario records `document.regular.firstScreen` and `document.regular.editable` from a host monotonic timestamp captured before Electron launch. These metrics are valid end-to-end cold-start evidence, but their names can be misread as document-only open latency.

Decision: retain them for compatibility, classify them as **CONDITIONALLY TRUSTED**, and prohibit direct comparison with `document.50k.firstScreen/editable`, which use renderer-owned document-open milestones.

Classification: **Measurement semantics / comparability**.

### BT-009 — Provenance was absent from canonical reports

Historical report schema identified product version, suite, level and a coarse environment, but not the exact Git identity/runtime/backend needed to prove two runs are comparable.

Harness correction applied: canonical reports now accept a validated optional provenance object containing commit, branch, Node version, Electron version, graphics backend, run mode, warm state, run id and optional fixture SHA-256 hashes. New metadata generation paths populate this information while old schema-v1 reports remain readable.

Classification: **Traceability / comparability**.

### BT-010 — Combined Node test invocation retains an open handle

The canonical benchmark contract suites are healthy when run in their repository-defined groups:

- `perf/gate/*.spec.ts`: 72/72 pass and the process exits normally;
- `perf/soak/fast-policy.spec.ts + fast-runner.spec.ts`: 14/14 pass and the process exits normally.

As an additional non-canonical stress check, both groups were passed to one Node `--test` invocation. All **86/86 assertions passed**, but the process retained an open handle and did not exit before the 120-second command timeout. The subsequent `git diff --check` chained to that command therefore did not execute.

A separate `git diff --check` was run afterward and passed. This combined-run lifecycle behavior is recorded as harness/runner evidence; it is not treated as an assertion failure and no product code, thresholds, workload, or sample counts were changed to suppress it.

Classification: **Test-runner lifecycle / non-canonical invocation**.

### BT-011 — Repeatability pooling now has an executable contract

Before this stage, “same environment / same fixture” was a documentation rule but not enforced when aggregating repeated benchmark reports.

Harness addition:
- `compareBenchmarkReportsForPooling` rejects pooling when product/suite/level, environment, Git tree, Node/Electron, graphics backend, run mode, warm state, or fixture hash differs;
- checkout commit, source commit, branch and run id are deliberately ignored for pooling identity when the executed Git tree is identical;
- missing provenance prevents authoritative pooling;
- this API is explicitly for **repeatability pooling**, not cross-commit before/after regression comparison.

`analyzeBenchmarkRepeatability` then computes each run's p50/p95/p99 and cross-run min/max/mean/stddev/CV only after the pooling contract passes.

Focused tests: **9/9 pass**, including explicit rejection of Default GPU + OpenGL pooling and changed fixture hashes.

Classification: **Comparability / reproducibility infrastructure**.

### BT-012 — PR merge commit is not a stable pooling identity

The first PR #177 Fast Gate completed successfully and produced a passing threshold report, but its provenance exposed a GitHub Actions nuance: `GITHUB_SHA` was the temporary PR merge commit `dfcd2eac…`, while the branch head was `cedf4ef0…`. GitHub's Git Data API confirmed both commits had the exact same tree `5f7b6f8e…` and the merge commit parents were `develop@677f96e1` plus the task branch head.

Decision:
- keep `commit` as the exact checkout/execution commit;
- add `sourceCommit` for the PR/source revision;
- add `tree` as stable executed-code identity;
- use `tree`, not checkout commit, for repeatability pooling;
- old reports without tree remain readable but are not authoritative pooling inputs.

The Fast Gate workflow now injects the PR head SHA into provenance. Focused provenance/comparability/repeatability tests after this correction: **28/28 pass**; `git diff --check` passes.

Classification: **Traceability / CI checkout semantics**.

### CI evidence — PR #177 first Fast Gate

Run `35814000281` completed **successfully** on the standard PR CI path. The formal fast evaluation passed with no failures. Representative observed values were: first-screen p95 `75.525 ms`, editable p95 `108.13 ms`, input p95 `0.37 ms`, input p99 `1.107 ms`, input max `2 ms`, minimum sampled scroll window `60 FPS`, save p95 `49.75 ms`, and all crash/OOM/runaway/hang counters `0`.

This run proved the standard CI build/Electron/evaluator/artifact pipeline is operational. Its artifact also directly led to BT-012, so it is retained as diagnostic trustworthiness evidence rather than the final reproducibility baseline.

## Guardrails retained

- No product optimization to improve numbers.
- No threshold/workload/sample-count weakening.
- No single-run conclusions.
- No pooling of different environments or graphics backends.
- Tier 3 long soak remains manual/reference-runner if that is the existing policy.
- Environment/bootstrap failures remain environment evidence, never product regression evidence.

## Next actions

1. Complete benchmark inventory across startup/open, large-doc, save, render/scroll, resource, stability, DI/background, and CI gates.
2. Map each metric to its exact start/end boundary and clock source.
3. Audit result/statistics schema and percentile/CV calculations.
4. Add provenance metadata and deterministic fixture identity where missing.
5. Add FPS frame-time/long-frame companion evidence without changing current product workload.
6. Run two independent reproducibility rounds for core benchmarks, separately for default GPU and `--use-angle=gl`.
