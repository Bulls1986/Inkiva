# ARCH-FIX / Render Geometry Invalidation Closure

## Goal

Close the geometry propagation contract for asynchronous top-level block size changes.

Acceptance contract:

> After any mounted top-level block changes height because of diagram, image, table, or other asynchronous content, Outline, Virtual Surface, scroll anchor, and viewport materialization must converge within one stable geometry cycle. Cumulative drift, blank viewport regions, and stale active-heading state are correctness failures.

## Phase log

### 2026-09-22 — Baseline and reproduction

- Base: `develop@e110499d` (`ARCH-03: introduce virtual surface contract (#161)`).
- Branch: `fix/render-geometry-invalidation-closure`.
- The Desktop/Muya ownership boundary from ARCH-03 remains authoritative:
  - Muya owns logical geometry while windowed.
  - Desktop layout reconciliation is a mounted-DOM projection and must not write competing virtual scroll state.
  - Diagram/Image/Table must not introduce component-specific page-layout events.
- Existing block size changes enter Muya through the top-level block `ResizeObserver` and `_measureVirtualBlockHeights()`.

### Reproduction condition

The current measurement pipeline only accepts top-to-top measurements when the resized block and its logical next block:

1. are both mounted;
2. have the same `.mu-virtual-segment` parent;
3. are direct DOM siblings.

That rejects an otherwise exact measurement when two logically adjacent mounted blocks straddle a virtual segment boundary. A resized block at the last index of a segment therefore leaves its measured advance, prefix offsets, segment offset index, spacers, and downstream surface offsets stale.

This is a generic geometry invalidation defect. Diagram rendering makes it visible because diagram heights often grow asynchronously, but the defect is not diagram-specific.

### Failure test

Added a Muya virtualization regression that mounts adjacent blocks across a segment boundary, simulates asynchronous height growth by changing their top-to-top distance, and requires the logical offset of the following block to update immediately.

Expected pre-fix result: the test fails because `_measureVirtualBlockHeights()` discards the cross-segment measurement.

The first local attempts were invalid environment evidence: the worktree had an incomplete dependency topology and Vitest either failed before discovery or timed out with zero test output. After restoring the main checkout's complete dependency graph as the donor and using a root-only `node_modules` Junction, the focused Muya suite discovered and executed normally. Muya also has an existing hard-coded relative PrismJS import, so the worktree keeps only a local ignored PrismJS copy required by that runtime path; it does not use a package-wide `node_modules` Junction.

Valid local focused result after the production fix: `virtualizationProduction.spec.ts` **30/30 passed**. The added regression repeats the resize using an ordinary paragraph block, so the contract is generic rather than Mermaid-specific.

## Planned implementation contract

One resize transaction must converge:

`measured advance -> prefix/offset index -> segment offset index -> geometry revision -> anchor correction -> virtual window/materialization -> Desktop projection`

Constraints:

- no diagram-specific height-change protocol;
- no second authoritative virtual geometry store in Desktop;
- no synchronous layout read added to the raw scroll hot path;
- mounted headings may use settled DOM geometry;
- offscreen headings consume Muya logical offsets;
- viewport coverage must remain valid after repeated resize events.

### 2026-09-22 — Implementation

The authoritative geometry pipeline is kept intact. The fix changes only the
measurement admission rule:

- same-segment logical neighbors keep the existing direct-sibling guard;
- a block at the end of one mounted virtual segment may now measure top-to-top
  against the first logical block of the immediately following mounted segment;
- both segment wrappers must be direct children of this ScrollPage, and the
  measured nodes must be the tail/head nodes of their respective segments.

This is safe because virtual segment wrappers use `display: contents` and do
not represent document geometry. Rejecting the cross-segment pair was therefore
discarding an exact logical block advance solely because of the virtualization
mutation boundary.

No Diagram/Image-specific event or Desktop geometry owner was added.

The regression now also performs a second height change on an ordinary
non-diagram top-level block and checks that the logical mounted window continues
to cover `scrollTop .. scrollTop + clientHeight` after both geometry
transactions. This specifically guards against cumulative stale-prefix drift
and half-empty viewports.

### 2026-09-22 — Outline convergence closure

The Electron regression exposed a second independent geometry-consumer defect after viewport materialization was fixed:

- the viewport had converged to `Async Geometry Section 2`;
- the Outline stayed on the document root heading for the full 8-second convergence window;
- a focused Desktop unit reproduction showed the same failure: a far-away but still-mounted root heading overrode the live Muya prefix geometry, returning `uid-root` when the correct logical heading was `uid-middle`.

`createTocScrollSync()` already defers active-heading calculation by two paint boundaries, so the raw scroll handler remains layout-free. The fix keeps mounted DOM geometry authoritative only as a **local correction**: a mounted heading must be within one current viewport height above the editor (with a small activation-offset floor) before it may override Muya's live logical prefix. A retained heading far outside the active virtual window can no longer mask the correct offscreen logical heading.

Test-first evidence:

- added `does not let a distant retained mounted heading override the live virtual prefix`;
- pre-fix: **1/14 failed**, receiving `uid-root` instead of `uid-middle`;
- post-fix: `toc-outline.spec.ts` **14/14 passed**;
- the existing test proving mounted DOM geometry can correct a stale prefix remains green.

### Electron E2E design

`virtualization-async-geometry.spec.ts` builds a document whose Mermaid blocks
land exactly on logical block indexes 63, 127, 191, and subsequent segment
tails. The test scrolls through the middle/later document while Mermaid may
replace source/placeholder geometry, then repeatedly asserts:

- mounted DOM covers both the top and bottom of the editor viewport without a
  half-screen materialization hole;
- no large internal blank gap opens inside the viewport;
- the active Outline heading matches the first visible logical section;
- after a settle interval and another scroll, content does not progressively
  "fill in" from an earlier stale virtual window.

The viewport assertion uses a bounded `expect.poll` without issuing a second scroll. This intentionally permits the normal asynchronous virtual-window scheduling cycle while still failing if content only appears after another user scroll.

### Local validation completed

- Muya focused virtualization suite: **30/30 passed**.
- Desktop TOC unit suite: **14/14 passed**.
- `GEO-ASYNC-001` focused Electron E2E: **1/1 passed** after the Outline fix.
- complete `@virtualization-core` Electron gate: **44/44 passed** in 3.2 minutes, including IME, selection, Undo/Redo, TOC navigation, tab restore, Source/WYSIWYG round-trip, responsive reflow, local images, shortcuts, zoom/sidebar layout, and the new async-geometry regression.
- Desktop typecheck: **passed**.
- Desktop changed-file ESLint: **0 errors**.
- Muya changed-file ESLint: **0 errors / 5 pre-existing complexity or max-lines warnings** in `scrollPage/index.ts`.
- Muya package `tsc --noEmit`: still reports six pre-existing `Array.prototype.at`/target-lib errors in existing files, including existing `scrollPage/index.ts` lines unrelated to this change. No tsconfig or unrelated source was modified to hide that baseline debt.
- current Desktop build: **passed** with only the existing Vite dynamic/static import warning for `src/main/keyboard/index.ts`.
- Performance Fast Gate: **1/1 passed**; the final post-fix rerun completed in **3.3 minutes** with the unchanged PR-smoke gate collecting **20 real samples for every fast hard metric**. No threshold, sample count, workload, or retry rule was relaxed.
- ARCH-03 structural contract + TOC focused rerun after removing a concurrent `getMaterializedWindow` experiment: **16/16 passed** (`virtual-surface-contract` 2/2, `toc-outline` 14/14). Repository search confirms `getMaterializedWindow` has zero remaining references, so Desktop does not consume Muya materialization internals.

### 2026-09-22 — CI stability follow-up

- The first full Linux E2E run reached the new `GEO-ASYNC-001` assertions but failed only on the final requirement that a Mermaid `<svg>` still be attached after all scrolling completed.
- That assertion was not part of the geometry contract: virtualization may legitimately unmount a previously visited diagram after the viewport moves on, especially under the full 368-test concurrent workload.
- The final assertion now checks `data-diagram-render-attempts > 0` on a visited diagram preview. This proves the asynchronous diagram-render path actually ran while keeping the real correctness gates on viewport coverage and Outline convergence.
- No geometry assertion, scroll step, timeout, retry count, or production behavior was relaxed.
- Local stability rerun with `--repeat-each=5`: **5/5 passed**.
- The same CI run also had one unrelated `copy-anchor-link.spec.ts` clipboard/keyboard failure; it is outside this change and was not modified in this PR.

## Validation still required

- final diff/hygiene review and branch synchronization with the latest `develop`;
- PR/CI validation after push.

## Remaining boundaries

The fix deliberately does not introduce a Desktop-owned geometry revision/store or component-specific resize protocol. Muya remains the sole owner of virtual prefix geometry and materialization. Desktop consumes live logical offsets and settled mounted DOM geometry only at the deferred Outline update boundary.

Ignored local test-environment shims/copies used by this worktree are not product changes and must not be committed.
