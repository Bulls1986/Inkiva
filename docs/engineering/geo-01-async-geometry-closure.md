# GEO-01 — Async Geometry Closure

## Task

Goal: close Inkiva's async geometry propagation contract so post-render block size changes converge across Muya logical geometry, Virtual Surface, Outline, scroll anchoring and viewport materialization without incidental user scroll/reflow.

Branch: `fix/geo-01-async-geometry-closure`
Base: latest `origin/develop` at task start.

## Phase 0 — Current-state audit

Status: completed.

### Existing architecture

Authoritative logical geometry while virtualized is owned by Muya `ScrollPage`:

- `_virtualOffsetIndex` is the block-prefix source used for block offsets, index-at-offset lookup, virtual ranges and total estimated document height.
- `_virtualMeasuredHeights` refines individual top-level block advances.
- `_virtualSegmentOffsetIndex` derives segment-level lookup geometry.
- `_virtualGeometryRevision` invalidates an already-applied virtual window when measured geometry changes.
- `updateVirtualWindowForViewport()` recomputes visible/overscan ranges from those indexes and reapplies spacers/materialization when geometry revision changes.

Desktop does not own a second logical geometry store:

- `DocumentGeometryProjection` delegates `revealBlock/getBlockOffset/isWindowed` to the surface and resolves scroll ownership.
- `EditorLayoutReconciler` owns only mounted-DOM projection used for non-windowed anchoring, TOC-local reconciliation and pending restore.
- `createTocScrollSync()` uses live surface offsets when available; mounted DOM headings are only a local settled correction.

### Existing async resize path

```text
Top-level block ResizeObserver
  -> ScrollPage._measureVirtualBlockHeights(entries)
  -> exact measured block advance
  -> _virtualMeasuredHeights
  -> _virtualOffsetIndex point update (O(log N))
  -> segment offset update
  -> _virtualGeometryRevision++
  -> anchor correction
  -> updateVirtualWindowForViewport()
  -> spacers/materialized ranges converge
  -> Desktop mounted-DOM observer / TOC projection converge
```

Historical cross-segment measurement and stale mounted-heading defects are already covered by the prior async-geometry closure and ARCH-04 ownership work.

### Mutation-source audit

Already converges through top-level block ResizeObserver when a mounted block's box changes:

- Mermaid/diagram async render
- local image intrinsic load/failure fallback
- table/code/math/HTML renderer reflow
- collapse/expand
- user edit/paste/undo/redo/paragraph split/merge
- lazy/progressive mount content that changes its top-level block box

Layout-wide mutations use the root/content ResizeObserver:

- editor/container width change
- sidebar/responsive layout that changes content width
- window resize
- zoom/layout changes that alter observed width

Potential contract gaps still being tested:

1. block invalidation is implicit: ResizeObserver calls measurement directly, with no explicit reason/lifecycle token;
2. queued callbacks are guarded mostly by current object/index/DOM checks rather than a formal geometry generation;
3. typography/font-metric changes that alter estimates without a width delta need explicit evidence;
4. race cases (unmount/remount, stale observer callback, document/source/tab switch, out-of-order completion) are not all named as geometry contract tests;
5. geometry invariants exist implicitly in data structures but are not exposed as one reusable verification helper.

### Correctness policy

No component-specific Mermaid/Image/Table height event will be introduced. No scroll-trigger refresh, polling, timeout, virtualization disable, oversized overscan, or full-document rerender will be used.

The audit found one concrete correctness gap before implementation: the final logical block has no next block, so the existing top-to-top measurement admission rule drops its ResizeObserver update.

### Test-first evidence

Focused test: `propagates async height growth for the final virtual block into total document height`.

Valid pre-fix execution: Vitest discovered the intended suite and ran exactly 1 target test; it failed because `_virtualMeasuredHeights.get(lastIndex)` was `undefined` instead of the expected measured advance. The earlier pnpm/tinyexec failures were environment evidence only and are not counted as red product evidence.

## Phase 1 — Geometry ownership / contract

Status: completed.

The contract remains intentionally single-owner:

1. Muya `ScrollPage` owns logical block advances, prefix offsets, segment offsets, total virtual height, virtual range selection and geometry-driven scroll correction.
2. A mounted top-level block resize invalidates exactly that block advance. Exact measurement uses the next logical geometry boundary.
3. For blocks 0..N-2, the boundary is the next logical block top, including the already-supported cross-segment case.
4. For block N-1, the boundary is the trailing virtual spacer top, which is the document-end boundary when the final segment is mounted.
5. A measured advance performs an O(log N) point update in `_virtualOffsetIndex`, updates only its containing segment aggregate, increments geometry revision, then refreshes anchor/range/spacers.
6. Desktop consumes this geometry through `DocumentGeometryProjection`; mounted DOM geometry remains a local projection and never becomes a competing logical source of truth.
7. Structural or width/typography invalidation may rebuild estimates; ordinary async block resize must not trigger a full O(N) scan.

## Phase 2 — Root cause

Status: completed.

Three independent gaps were proven with focused red evidence:

1. **Final-block boundary gap.** The previous async-geometry fix correctly closed cross-segment adjacency, but the measurement model still encoded an implicit assumption that every measurable block has a logical successor. The final block violates that assumption. ResizeObserver fired, but `_measureVirtualBlockHeights()` observed `nextNode === null` and skipped the transaction, leaving the last measured advance and `_virtualOffsetIndex.total()` stale.
2. **Deferred-invalidation loss.** While scrolling, block measurement is temporarily deferred until the virtual window reaches the stable hydration boundary. `_invalidateVirtualGeometry()` previously returned immediately in that state and `_resumeVirtualBlockMeasurement()` only reattached observation; a ResizeObserver delivery that arrived in the deferred interval could therefore be lost permanently. The focused regression ran in the valid 36-test Muya suite and failed with block 1 still at its old 39.2px offset after resume.
3. **Wrong observed geometry box.** Top-level block observation used the default ResizeObserver content box. The Electron anchor regression changes a mounted block's padding by 320px: its border-box/document advance changes while its content box does not. Runtime diagnostics proved `_virtualGeometryRevision` stayed at 5, the reading anchor moved exactly 320px, a default content-box observer received no mutation callback, and a border-box observer did. Directly invoking the existing measurement transaction then changed geometry revision 5→6, scrollTop 4498→4818, and restored the anchor to its original screen position. This isolated the defect to observer semantics rather than measurement or anchor-correction logic.

## Phase 3 — Implementation

Status: completed.

The implementation stays within the existing single-owner geometry pipeline:

- one geometry-boundary resolver preserves top-to-top measurement for ordinary/cross-segment blocks and uses the trailing spacer only for the mounted final block;
- deferred ResizeObserver deliveries are coalesced by mounted DOM node and replayed once measurement resumes; stale/unmounted nodes are still rejected by the existing measurement admission checks, and teardown clears pending nodes;
- every top-level virtual block is observed with `{ box: 'border-box' }`, including re-observation after hydration, so any change to the document-space block box can invalidate logical geometry;
- no component-specific Mermaid/Image/Table event, timeout, polling, scroll-trigger repair, overscan increase, second geometry store, or O(N) scan was introduced.

## Phase 4 — Automated regression

Status: completed.

Current local evidence on the task worktree:

- Muya `virtualizationProduction.spec.ts`: **35/35 passed**.
- The suite includes explicit coverage for final-block propagation, cross-segment propagation, stale generation rejection, unmounted-node rejection, out-of-order resize results, deferred resize replay, viewport-anchor preservation, width-reflow races, and the border-box observer contract.
- Current-worktree Electron build: **passed**.
- GEO-01 Electron E2E: **6/6 passed**:
  - segment-boundary async growth keeps viewport/Outline consistent;
  - scrolling while geometry resolves keeps materialization valid;
  - Outline navigation converges;
  - growth above the viewport preserves the reading anchor;
  - queued resize cannot pollute another tab;
  - WYSIWYG → Source → WYSIWYG drops stale geometry and rebuilds cleanly.

All temporary runtime diagnostics used to isolate the root cause were removed before the green run.

Type validation evidence:

- Muya `pnpm -C packages/muya run lint:types`: **passed**.
- Desktop `pnpm -C packages/desktop run typecheck`: fails on the existing Muya ambient/type declaration baseline (`__MUYA_BLOCK__`, `MUYA_VERSION`, FileIcons, prism/sequence declarations, etc.). The same command on clean current `develop` produces the same error set, so this is recorded as a pre-existing baseline issue and is not attributed to GEO-01.

## Phase 5 — Large-document validation

Status: completed.

The complete desktop `@virtualization-core` gate passed **49/49** on the task worktree. This exercises the async-geometry scenarios together with the broader large-document interaction surface: table/code editing, Mermaid recovery, local images, Outline navigation, selection/history, Source/Focus/CJK, Find, save, shortcuts, width/layout changes and bounded materialization. The result confirms the geometry fixes do not rely on the narrow GEO-01 fixture and do not regress the existing virtual-surface correctness contract.

## Phase 6 — CI / closure

Status: in progress.
