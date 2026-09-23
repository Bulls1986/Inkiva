# BASELINE-02 — Benchmark Trustworthiness Final Report

> Status: IMPLEMENTATION CLOSED / REFERENCE REPRODUCIBILITY DEFERRED  
> Implementation merge: PR #177, squash commit `41c0992b019fb0ae07419cddbb0c808630e849a7`  
> Final validated measurement tree: `a0d43677673791054f0c27fbcffc862aa351697d`  
> Scope: benchmark harness, instrumentation, metadata, statistics, fixtures, comparability, workflow controls and trust documentation. No product-performance optimization was performed.

## 1. Executive conclusion

BASELINE-02 completed the benchmark-trustworthiness engineering work required to make Inkiva performance evidence more repeatable, interpretable, comparable and traceable.

The benchmark system now has:
- explicit measurement-boundary rules;
- deterministic fixture identity where exact fixture reconstruction is possible;
- authoritative execution provenance including Git tree and graphics backend;
- mean / standard deviation / coefficient of variation support;
- fail-closed pooling comparability rules;
- automated repeatability analysis;
- explicit Default GPU / OpenGL workflow selection;
- controlled-slowdown evaluator verification;
- hardened Fast Gate and Reference Gate metadata paths.

The implementation has been merged into `develop`.

The only incomplete part is **real reference-runner reproducibility collection**: two serial Default GPU rounds and two serial OpenGL rounds could not be executed because the repository currently exposes zero eligible self-hosted `reference-low-end` Windows runners. No performance conclusion is fabricated from that missing evidence.

## 2. Benchmark inventory

The authoritative inventory is maintained in:

- `docs/benchmark/BASELINE-02-BENCHMARK-INVENTORY.md`

It covers:
- cold startup;
- regular document startup-coupled metrics;
- 50K / 100K / 500K / 1M document scenarios;
- input latency;
- save latency;
- scroll/window-average FPS;
- per-frame duration / long-frame evidence;
- main-thread lag;
- GC;
- renderer heap growth;
- diagram/image probes;
- stability counters;
- Fast PR Gate;
- Reference P0/P1/P2;
- opt-in P3.

## 3. Measurement-boundary corrections

Three material semantics issues were closed:

1. **50K open timing**
   - Before BASELINE-02, the first sample and later samples did not share the same start boundary.
   - All samples now use renderer-owned `openStartAt → firstScreen/editable` milestones.

2. **Regular-document metrics**
   - `document.regular.firstScreen/editable` include cold Electron startup.
   - They are explicitly classified as cold-launch-coupled and must not be compared with open-only 50K metrics.

3. **Save phase**
   - Manual `FILE_SAVE()` measurements were previously tagged as `autosave`.
   - Manual save measurements now use phase `save`; actual autosave remains distinct.

## 4. Clock and timing contract

The authoritative timing contract is:

- renderer action duration: one renderer `performance.now()` timeline;
- renderer milestone duration: subtract milestones from the same renderer monotonic clock;
- host cold startup: Node `performance.now()`;
- epoch timestamps: correlation only, never cross-process duration subtraction;
- `Date.now()`: not authoritative for benchmark duration gates.

This prevents mixed-clock subtraction and hidden IPC/process-boundary drift.

## 5. FPS and frame-time semantics

BASELINE-02 confirmed that the existing scripted FPS helper reports approximately one-second **window-average FPS**.

Therefore:
- a gate statistic of `min` means the lowest sampled window-average FPS;
- it does **not** mean the worst instantaneous frame;
- it must not substitute for frame-time distribution.

Frame-jank evidence remains separate:
- `core.frame.duration` p50 / p95 / p99 / max;
- `core.frame.over16_7`;
- `core.frame.over33`;
- future >50ms long-frame evidence where required.

## 6. Statistical trustworthiness

The shared statistics path now reports:

- min;
- p50;
- p95;
- p99;
- max;
- count;
- mean;
- population standard deviation;
- coefficient of variation.

For an all-zero series, CV is defined as zero.

BASELINE-02 does not treat a single run as repeatability evidence. Within-run dispersion and across-run repeatability are separate concepts.

## 7. Fixture determinism and identity

Deterministic fixtures now expose SHA-256 content identity.

Canonical metadata carries hashes only when exact fixture reconstruction is authoritative:
- regular Markdown;
- 50K / 100K / 500K / 1M Markdown;
- deterministic heading-storm fixtures;
- deterministic tab-document content.

Workspace, diagram/image and combination fixture ids are deliberately not assigned synthetic hashes until their complete generated content has an authoritative deterministic identity.

This is fail-closed by design: absence of a hash is preferable to a misleading hash.

## 8. Provenance and code identity

Canonical benchmark reports can now record:

- checkout commit;
- source commit;
- Git tree;
- branch;
- Node version;
- Electron version;
- graphics backend;
- run mode;
- warm state;
- run id;
- fixture hashes.

A key GitHub Actions finding was that PR workflows execute a temporary merge commit. Two different checkout commits may therefore execute the exact same code tree.

For repeatability pooling, **Git tree is the stable code identity**. Checkout/source commit and branch may differ while the tree is identical.

Historical reports without authoritative tree/provenance remain readable but are not valid pooling inputs.

## 9. Pooling and repeatability contract

`compareBenchmarkReportsForPooling` rejects aggregation when any authoritative identity differs, including:

- product version;
- suite / gate level;
- reference environment;
- Git tree;
- Node / Electron runtime;
- graphics backend;
- run mode;
- warm state;
- fixture hashes.

It intentionally permits different run ids, branch labels and checkout/source commit ids when the executed Git tree is identical.

`analyzeBenchmarkRepeatability` then computes:
- each run's p50 / p95 / p99;
- cross-run min / max / mean;
- cross-run population standard deviation;
- cross-run CV.

Default GPU and OpenGL reports are programmatically non-poolable.

## 10. Harness correctness verification

BASELINE-02 added or strengthened tests around:

- statistics calculations;
- provenance validation;
- fixture hashes;
- metadata round-trip;
- pooling comparability;
- repeatability analysis;
- large-scenario manifest coverage;
- workflow backend selection;
- controlled slowdown;
- missing/malformed metric fail-closed behavior;
- media probe semantics.

Important historical evidence from BASELINE-01 was retained: the old diagram/image probe once misclassified correct virtualization because it looked for an offscreen `<img>` instead of the established wrapper contract. This directly motivated testing benchmark code as first-class correctness code.

A non-canonical combined Node `--test` invocation can retain an open handle after all assertions pass. Canonical focused test groups are therefore the valid local evidence path; the lifecycle anomaly is not treated as product failure.

## 11. Controlled regression detection

The evaluator has an explicit controlled-slowdown test:

- unchanged control sample: passes;
- known uniformly slowed sample: fails the configured p95 threshold.

This proves the evaluator can distinguish a deliberate regression from an unchanged control without changing product implementation or weakening thresholds.

## 12. CI and workflow evidence

The final measurement tree is:

`a0d43677673791054f0c27fbcffc862aa351697d`

On that tree, PR #177 completed:

- Lint: SUCCESS;
- Test: SUCCESS;
- Windows build: SUCCESS;
- macOS x64 build: SUCCESS;
- macOS ARM64 build: SUCCESS;
- E2E Test: SUCCESS;
- Performance Fast Gate: SUCCESS.

Final Fast Gate run: `35815774859`.

The retained artifact was downloaded and inspected directly:

- evaluation passed: true;
- failures: 0;
- product version: 0.4.0;
- source commit: `b2d6ac818200dffe05bcebe7985de863f0dca85b`;
- executed tree: `a0d43677673791054f0c27fbcffc862aa351697d`;
- graphics backend: `default`;
- deterministic 50K and regular Markdown fixture hashes: present.

The implementation was squash-merged as:

`41c0992b019fb0ae07419cddbb0c808630e849a7`

## 13. Trustworthiness matrix

| Benchmark family | Final BASELINE-02 classification | Conditions |
| --- | --- | --- |
| Frame duration / long-frame ratios | TRUSTED | Valid for captured renderer frame intervals |
| Renderer heap trend | TRUSTED | Renderer V8 heap only; not total RSS/GPU memory |
| Deterministic fixture identity | TRUSTED | Only fixtures with authoritative SHA-256 content identity |
| Fast PR Gate infrastructure | TRUSTED for PR smoke purpose | Not a substitute for reference release baseline |
| 50K document-open metrics | CONDITIONALLY TRUSTED | Boundary corrected and CI-revalidated; reference repeatability still pending |
| Cold startup / regular-document metrics | CONDITIONALLY TRUSTED | Same host/startup topology; includes process startup |
| Input latency | CONDITIONALLY TRUSTED | Event Timing support and same runtime semantics required |
| Save latency | CONDITIONALLY TRUSTED | Manual-save contract only |
| Window-average scroll FPS | CONDITIONALLY TRUSTED | Must be interpreted as ~1s window-average FPS |
| Main-thread lag | CONDITIONALLY TRUSTED | Event-loop lag proxy, not direct task-duration profiling |
| GC metrics | CONDITIONALLY TRUSTED | Observer support required |
| Diagram/image probes | CONDITIONALLY TRUSTED | Must follow established wrapper/virtualization contract |
| Stability zero-event counters | CONDITIONALLY TRUSTED | Only for the observed test window |
| Reference P0/P1/P2 repeatability | CONDITIONALLY TRUSTED / evidence pending | Harness is hardened, but two independent reference rounds have not run |
| Default GPU vs OpenGL comparative baseline | CONDITIONALLY TRUSTED / evidence pending | Workflow isolation exists; real reference rounds have not run |
| Historical pre-BASELINE-02 reports without authoritative provenance/tree | UNTRUSTED for pooling | May remain useful as diagnostic historical evidence |

No currently active canonical benchmark is classified UNTRUSTED after the harness corrections; however, several remain conditional until reference repeatability evidence exists.

## 14. Remaining work and closure decision

At closure time, the repository Actions API reports zero eligible self-hosted runners for the required reference profile:

`[self-hosted, Windows, X64, reference-low-end]`

Therefore the following evidence was **not executed**:

1. Default GPU reference Round 1;
2. Default GPU reference Round 2;
3. Default across-run CV analysis;
4. OpenGL reference Round 1;
5. OpenGL reference Round 2;
6. OpenGL across-run CV analysis.

The previously queued pre-final-tree reference run was cancelled before measurements executed, so it contributes no performance evidence.

When a reference runner is restored, the follow-up procedure is fixed:

1. run Default Round 1;
2. verify report tree/environment/backend/fixture provenance;
3. run Default Round 2 serially;
4. run repeatability analysis;
5. run OpenGL Round 1 and Round 2 serially with `graphics_backend=opengl`;
6. run repeatability analysis separately;
7. never pool Default and OpenGL data.

### Closure

BASELINE-02 is closed as a **benchmark trustworthiness engineering task** and merged into `develop`.

Reference repeatability collection remains an infrastructure-dependent validation follow-up, not an unimplemented benchmark-harness requirement and not a product-performance failure.
