# ARCH-01 Editor Runtime Extraction — Progress Ledger

> Purpose: durable recovery log for ARCH-01. Update this file after every completed stage so work can resume after network/session loss without relying on chat history.

## Task identity

- Branch: `arch/01-editor-runtime`
- Base: `origin/develop` @ `96e18c9415194e380d664d5ea351883cdcd64c6d`
- Source audit: `docs/architecture/ARCHITECTURE_AUDIT_2026-09.md` §7 `ARCH-01`
- Goal: move editor lifecycle/revision/snapshot/persistence orchestration behind `DocumentEditorRuntime` without changing user-visible Markdown behavior.
- Hard rule: `DocumentEditorRuntime.dispose()` becomes the only high-level editor-runtime teardown entry used by Vue.
- Test rule: tests are written/strengthened before each implementation slice; assertions/workloads are not weakened to obtain green CI.

## Ownership contract

Authoritative document semantics remain in Muya. `DocumentRevisionSnapshotCache` owns revision-scoped derived values. `DocumentEditorRuntime` is the renderer runtime owner/coordinator; Vue remains UI binding only.

The runtime may coordinate:

- Muya instance lifecycle and high-level teardown;
- monotonic document revision transitions;
- snapshot scheduling/capture handoff;
- history snapshot/restore coordination;
- persistence handoff for save/autosave;
- selection/scroll presentation-state restore hooks;
- runtime-owned subscriptions/observers/disposables.

The runtime must not invent Inkiva-specific Markdown state or duplicate Muya document semantics.

## Evidence from base

`packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue` still directly coordinates:

- revision-aware Markdown/history/block snapshot capture (`captureEditorSnapshot`);
- `EditorSnapshotScheduler.dispose()`;
- large renderer-bus unsubscribe list;
- input probe/listener cleanup;
- scroll timer/listener cleanup;
- TOC/layout runtime destruction;
- pending scroll restore cleanup;
- image viewer destruction;
- final Muya `destroy()`.

This confirms the audit finding that Vue is still the runtime resource owner.

## Validation matrix

| Area | Required protection | Layer |
| --- | --- | --- |
| Runtime lifecycle | dispose is idempotent; all registered resources disposed once; registration after dispose fails closed | Unit |
| Revision | content mutation advances monotonically; presentation changes do not advance revision | Unit + existing snapshot tests |
| Snapshot scheduling | deferred/immediate/persistence capture survives extraction | Unit + integration |
| Tab switch | outgoing tab snapshot/cursor state preserved; incoming lifecycle becomes active | Integration/Electron E2E |
| History restore | restored history belongs to matching document/revision | Integration/Electron E2E |
| Selection/scroll | presentation restore is revision-neutral and survives tab switch | Integration/Electron E2E |
| Save/autosave | same revision snapshot is reused; stale async results cannot overwrite newer revision | Unit + integration/Electron E2E |
| Mount/unmount | no listener/timer/runtime resource remains after unmount | Unit + Electron E2E |
| Source mode | WYSIWYG/source handoff remains lossless | Electron E2E |

## Stage log

### Stage 0 — baseline / test design

Status: **complete**

Completed:

- refreshed `origin/develop` and created dedicated worktree/branch;
- confirmed base SHA `96e18c94` (architecture audit merge);
- re-read ARCH-01 success criteria and current `editor.vue` teardown/snapshot paths;
- defined the runtime ownership contract and validation matrix above.

Validation evidence:

- Focused test command: `packages\\desktop\\node_modules\\.bin\\vitest.cmd run test/unit/specs/document-editor-runtime.spec.ts` from `packages/desktop`.
- Expected red result observed: Vitest failed because `@/services/documentEditorRuntime` did not exist. This is the intended test-first failure proving the new contract was not already implemented.
- Two earlier attempts through `corepack pnpm ...` timed out before Vitest output because the fresh worktree had no local dependency links; these are environment failures and are not counted as red-test evidence.
- Local-only dependency junctions now point this worktree at the already-installed main checkout dependencies; they are Git-ignored and must not be committed.

Blockers: none.

### Stage 1 — runtime lifecycle/revision kernel

Status: **complete**

Implemented after the red test:

- added `services/documentEditorRuntime.ts`;
- runtime owns an idempotent disposable registry with fail-closed post-dispose registration;
- runtime delegates active/warm/cold lifecycle and monotonic content revision operations to `DocumentRevisionSnapshotCache`;
- runtime exposes revision-scoped Markdown retrieval so persistence consumers can reuse one derived snapshot per revision.

Validation evidence:

- `vitest run test/unit/specs/document-editor-runtime.spec.ts`: **4/4 passed**.
- Runtime + existing revision snapshot regression suite: **20/20 passed** across 2 files.
- `vue-tsc --noEmit -p packages/desktop/tsconfig.json`: **passed**.
- focused ESLint on the runtime and its unit spec: **passed**. The command emitted only the repository's existing `MODULE_TYPELESS_PACKAGE_JSON` warning; no lint error occurred.

Stage result:

- runtime lifecycle/revision kernel is now test protected;
- no Vue integration has been claimed yet;
- no user-visible behavior or Markdown semantics changed.

Next stage:

1. add tests around runtime-owned teardown/subscription cleanup before changing `editor.vue`;
2. migrate the first coherent resource group (snapshot scheduler + high-level runtime disposables) behind `DocumentEditorRuntime`;
3. keep save/tab-switch/source-mode behavior unchanged and rerun focused integration/E2E coverage;
4. update this ledger after the migration slice before expanding ownership further.
