# ARCH-07 — Background Scheduler / Background Services Architecture

## Recovery ledger

- Branch: `arch/07-background-scheduler`
- Base: `develop@7f1e1e949b749108ea92552cb9fe996915730e3a`
- Principle: **Editor First / Async Everything Else**
- Classification: architecture/correctness with performance non-regression validation. No performance improvement is claimed without Before/After evidence.

## Stage 1 — Baseline / audit

Status: complete.

Completed:
- Read root `AGENTS.md`, workflow/environment/testing/performance/architecture guidance, architecture audit, and ARCH-01/02/03/04/05 records.
- Confirmed ARCH-07 must extend the existing `BackgroundTaskScheduler`; autosave remains an independent durability queue.
- Audited renderer background entry points. Existing scheduler coverage includes Document Intelligence and Quick Open indexing; many timers are UI/runtime-specific and are not candidates for mechanical migration.
- Identified a concrete scheduler correctness gap: replacing a queued `enqueueAndWait()` task by the same id drops the old task without settling its Promise.
- Identified a same-key async ordering gap: the scheduler intentionally releases global scheduling after async invocation, but therefore multiple async tasks with the same logical key can overlap. For side-effecting index work this permits an older request to finish after a newer request.
- Added focused contract tests requiring superseded handles to settle, same-key async work to be single-flight with only the latest successor retained, `close()` to settle queued handles without timer leakage, and background task failures to remain isolated.
- Local Vitest execution on this fresh worktree could not enter test discovery under the already-documented donor dependency topology and timed out. This is environment evidence, not accepted red/green product evidence; no duplicate install/test job was started.

Current commit: `7f1e1e94`.

Risks:
- Do not globally serialize unrelated async background work; only same logical key should be single-flight.
- Do not move Autosave into the generic scheduler.
- Do not introduce Muya private-state access or new editor ownership from background services.
- Cancellation cannot magically stop an already-issued API unless that API supports AbortSignal; stale side effects must therefore be prevented by same-key ordering/generation and caller revision checks.

Next:
1. validate the implemented scheduler contract through runnable local checks and standard CI topology;
2. map existing E2E/Fast Gate coverage to ARCH-07 interaction/performance requirements;
3. close integration and delivery.

## Stage 2 — Architecture design

Status: complete.

Design:
- Preserve the existing priority model and global non-blocking behavior: unrelated async keys may still overlap.
- Add **same-logical-key single-flight** only where stale side effects matter. While one key is in flight, retain at most one successor and make it latest-wins.
- Treat task id as a semantic coalescing/ordering key, not a unique tracing id. Observability remains available through the same id/priority slice metrics.
- Discarded queued wait handles must settle explicitly as `superseded`, `cancelled`, or `closed`; silent Promise abandonment is forbidden.
- Already-issued async work is not falsely advertised as abortable. If an underlying API has no AbortSignal contract, cancellation prevents queued/deferred work and stale writeback is handled by ordering plus caller generation/revision checks.
- Document Intelligence uses stable domain keys. Index and remove for the same pathname share `document-sync:<pathname>`, making close/removal ordered after any in-flight index and ensuring removal is the final side effect.
- Backlinks/history reads use pathname-scoped keys so refreshes for one document serialize without blocking a different Tab; `selectionVersion` remains the writeback stale-result guard.
- Autosave stays outside the scheduler because it is a durability queue with ordering/ack semantics.

Boundary review:
- No Muya private API, `any` shim, `@ts-ignore`, legacy alias, or DOM business-state query is introduced.
- ARCH-01 runtime ownership, ARCH-02 IPC, ARCH-03/04 render/geometry ownership, ARCH-05 event contracts, and ARCH-06 Muya public boundary are unchanged.

Current commit: `7f1e1e94`.

Risks:
- Same-key single-flight delays the newest same-key side effect until the old in-flight operation settles; this is intentional correctness ordering and does not serialize unrelated work.
- True in-flight cancellation requires future API-specific AbortSignal support; generic scheduler cancellation alone cannot cancel arbitrary external IO.

Next:
1. complete implementation cleanup;
2. harden unit/integration coverage;
3. run type/runtime/architecture validation.

## Stage 3 — Implementation

Status: complete.

Implemented:
- `BackgroundTaskScheduler` now tracks queued, running, and one deferred latest successor per logical key.
- Queued replacement settles `enqueueAndWait()` with `superseded` instead of leaking a Promise.
- Same-key async work is single-flight; intermediate successors are discarded and only the latest is promoted when the running task settles.
- `close()` settles queued/deferred/running wait handles, clears queued/deferred/running scheduler references immediately, and leaves no timer-owned work even when underlying IO never settles.
- Different task keys retain the prior non-blocking async behavior.
- Document Intelligence now uses stable logical keys for document sync/snapshots/restore and pathname-scoped keys for backlinks/history.
- Document close/remove and document index share the pathname key, closing the index-after-remove stale side-effect race.
- Removed the obsolete monotonically increasing background task id generator.

Local validation:
- Desktop `vue-tsc --noEmit`: passed on current source.
- Direct runtime contract smoke against current TypeScript source: `ARCH07_SCHEDULER_RUNTIME_OK`; validated superseded settlement, same-key latest-wins ordering, close settlement, and zero pending work.
- Local Vitest remains unavailable in this fresh worktree topology before discovery; standard CI will provide canonical Vitest evidence.

Current commit: `7f1e1e94` (changes not committed yet).

Next:
1. complete test-hardening coverage inventory;
2. run diff/whitespace/architecture review;
3. commit and proceed to integration/CI.

## Stage 4 — Test hardening

Status: complete locally; canonical Vitest/E2E execution pending CI.

Added/extended contract coverage:
- scheduler priority ordering and P6–P8 interaction hold remain protected;
- queued coalescing/cancellation remains protected;
- unrelated awaited IO remains non-blocking;
- superseded `enqueueAndWait()` handles must settle rather than leak;
- same-key async work must be single-flight and latest-wins;
- scheduler close must settle queued and in-flight handles and release all scheduler-owned references;
- background task failure must be isolated so unrelated queued work still runs;
- Document Intelligence rapid edits must index only the latest queued content after an in-flight older revision;
- document close removal must run after an in-flight index for the same pathname;
- existing multi-document selection tests continue to require stale metadata responses not to overwrite the current Tab;
- existing stale restore guards remain unchanged.

Existing integration/performance gates reused instead of duplicating scripts:
- `virtualization-core.spec.ts` covers composition/IME and editor interaction under virtualization;
- `virtualization-diagram-recovery.spec.ts` covers Mermaid async rendering/recovery and scrolling across diagram regions;
- `performance-fast-gate.spec.ts` records real `core.input.latency`, `save.50k`, and `document.50k.scrollFps`;
- the full performance gate records cold/hot startup and regular-document input;
- existing editor-switch / virtualization E2E remains the Tab/render regression layer.

Local evidence:
- Desktop `vue-tsc --noEmit`: passed after final scheduler lifecycle changes.
- `ARCH07_SCHEDULER_RUNTIME_OK`: passed after final lifecycle changes, including `activeCount === 0` immediately after close during in-flight IO.
- `git -c core.whitespace=cr-at-eol diff --check`: passed.
- Electron build attempt through the donor dependency topology timed out after 120 seconds without build output; like the local Vitest discovery timeout, this is environment/bootstrap evidence and not a product regression.

Coverage rationale:
- high-frequency typing/IME/save/scroll/diagram behavior is exercised by existing E2E/performance gates, while ARCH-07-specific scheduling semantics stay in focused unit contracts;
- no new isolated test runner or weakened threshold was introduced;
- idle leakage is protected by explicit scheduler reference/timer cleanup plus `activeCount` assertions; performance CI remains responsible for end-to-end CPU/event-loop non-regression.

Current commit: `7f1e1e94` (changes not committed yet).

Remaining:
1. final diff review and local type/runtime hygiene;
2. commit;
3. refresh/rebase latest `develop`, push PR, and obtain canonical CI unit/E2E/Fast Gate evidence.

## Stage 5 — Integration / delivery

Status: complete.

Integration evidence:
- Implementation commit: `2ac1c4c207b0ce82f8d33177519a9cb611d77650` locally.
- Normal HTTPS `git push` timed out without Git output on the known Windows transport path; no duplicate push was started.
- Delivery used the documented GitHub Git Data API fallback.
- The first API export read working-tree bytes and produced a remote tree mismatch because Windows line-ending conversion changed blob bytes. That remote ref was not accepted as valid delivery evidence.
- The fallback was corrected to export **committed Git blobs from the object database**, not working-tree files. Final remote commit `93962b5bf26f7dc8c4a3f6169e70477a40365036` has tree `40ceb060f13b33752ff927f982576935a8dabb50`, exactly matching local `HEAD^{tree}`.
- Pull request: **#169** — `https://github.com/Bulls1986/Inkiva/pull/169`.
- Remote `develop` remained `7f1e1e949b749108ea92552cb9fe996915730e3a` before PR delivery, so no rebase conflict existed.

Current implementation commit:
- local: `2ac1c4c2`
- remote PR head: `93962b5b`
- trees: identical.

## Stage 6 — CI closure

Status: complete for the implementation head.

PR #169 required checks:
- `lint`: **SUCCESS**
- `test`: **SUCCESS**
- `e2e`: **SUCCESS**
- `Desktop PR fast hard gate`: **SUCCESS**
- Windows x64 PR build: **SUCCESS**
- macOS x64 PR build: **SUCCESS**
- macOS arm64 PR build: **SUCCESS**
- `Comment artifact links on PR`: **SUCCESS**

Performance conclusion:
- The existing hard performance gate passed without threshold/workload relaxation.
- Therefore ARCH-07 did not trigger the repository's protected typing/input, 50K save, scroll-FPS, startup/stability/memory regressions represented by that gate.
- This remains a non-regression statement, not a performance-improvement claim.

Canonical unit/E2E conclusion:
- CI `test` supplies the canonical Vitest evidence that the focused scheduler/Document Intelligence contract tests compile and pass in the repository dependency topology.
- CI `e2e` supplies the existing interaction regression layer for editor/tab/IME/scroll/async diagram behavior.
- Local donor-topology Vitest/build timeouts remain environment evidence only and were not used to weaken or bypass CI.

## Stage 7 — Final review

Status: complete.

Architecture review:
- Scheduler remains a lower-priority service; no editor/Muya authoritative state moved into it.
- Same-key single-flight applies only to semantic task keys; unrelated background IO stays concurrent.
- Document Intelligence stale UI writeback remains guarded by `selectionVersion`; scheduler ordering closes stale side-effect races that generation checks alone cannot undo.
- Document index/remove share `document-sync:<pathname>`, so a close/remove cannot be followed by a late older index for the same file.
- Backlink/history tasks are pathname-scoped, preserving multi-document isolation.
- `close()` clears scheduler-owned queued/deferred/running references and settles waiting handles; it does not claim to abort external IO that lacks an AbortSignal contract.
- Autosave remains the separate durability queue.
- No Muya private API, `any` shim, `@ts-ignore`, legacy alias, raw DOM business-state lookup, or new renderer→main raw IPC dependency was introduced.
- Workspace hygiene after implementation review: **clean**.

Actual benefit:
1. fixes leaked/unsettled superseded wait handles;
2. prevents same-document stale async side effects from reordering across rapid edits/close;
3. makes task id a real semantic coalescing/ordering contract;
4. preserves global background concurrency and editor-first priority pausing;
5. gives lifecycle cleanup a testable `activeCount === 0` contract.

Remaining limits:
- Generic scheduling cannot cancel already-issued non-abortable external IO; future APIs may add AbortSignal where materially useful.
- Not every timer/debounce belongs in `BackgroundTaskScheduler`; UI animation, performance sampling, autosave durability, and component-local timing remain intentionally separate.
- No worker/UtilityProcess migration was added because the audit found no measured CPU-bound hotspot that justified the complexity in this task.

Experience review:
- Existing environment guidance already covered GitHub Git Data API fallback, so the lesson is merged there rather than duplicated.
- The durable refinement is: API fallback must upload bytes from committed Git blobs/object database and verify remote tree SHA equals local `HEAD^{tree}`; reading Windows working-tree bytes can silently change CRLF-normalized blobs.

Final integration closure:
- While PR #169 was awaiting merge, parallel ARCH-06 landed on `develop` as `ae31d8277ac6b1697fa99601c775b6f1ff1a9df2`.
- ARCH-07 was therefore rebased semantically onto that exact latest `develop` parent using the documented Git Data API fallback because Smart HTTP remained unavailable.
- The only overlapping file was `docs/agent/ENVIRONMENT.md`; the rebase preserved ARCH-06's latest content and reapplied the ARCH-07 committed-blob/CRLF fallback refinement.
- Rebased PR head: `0a2b0445a0db377b76cd05babc9a235915c5533d`.
- Rebased CI reran from scratch and passed all required checks: `lint`, `test`, `e2e`, Desktop PR fast hard gate, Windows x64, macOS x64, macOS arm64, and artifact-link comment.
- Final rebase performance result: the hard Fast Gate passed without any threshold, workload, sample-count, or statistic relaxation.
- Final merge review found no ARCH-01–ARCH-06 boundary regression and no production changes after the green rebased head; this ledger update is documentation-only.

Merge closure:
- PR #169 was squash-merged at 2026-09-22 13:33:09 UTC.
- Merge commit / resulting `develop` head: `6d1a95b88ac56acddfd0d136a8c41fd2b6f99c1b`.
- Repository policy disallows merge commits; the first `--merge` attempt was rejected by policy and the allowed squash strategy was used instead.
- No production code changed after the fully green rebased head.

Final assessment:
**ARCH-07 meets its architecture/correctness scope and performance non-regression gate.**

