# V07 — 正文标题折叠与定位进度

## Task identity

- Worktree: `E:\\workspace\\opensource\\Inkiva\\.worktrees\\v070-heading-collapse`
- Branch: `feat/v070-heading-collapse`
- Base: `origin/develop` @ `6d986e67`
- Scope: v0.7.0 F1–F4, body heading collapse and explicit navigation.
- Out of scope: cross-session persistence (F5–F6), PDF preview/page numbers/missing images, copy-only remediation, outline-tree expansion semantics.

## Architecture boundary

- Muya owns the rendered block projection, hidden-section geometry, virtual offset index, collapse controls and caret/selection eviction.
- Desktop owns navigation intent (outline/link/find), active-outline filtering, and the in-session document→state map.
- Collapse state is not document state: Markdown, state serialization, history, copy, source mode and exports remain complete.
- The stable key is GitHub heading slug plus duplicate occurrence. This is the interface the later cross-session persistence work stores; the current map is only session-scoped.

Public Muya surface added:

```ts
getHeadingCollapseState(): IHeadingCollapseState[]
setHeadingCollapseState(state: readonly IHeadingCollapseState[]): void
setHeadingCollapsed(slug: string, collapsed: boolean): boolean
revealHeadingTarget(slug: string): boolean
revealBlockTarget(index: number): boolean
revealElementTarget(element: Element): boolean
isTocItemVisible(slug: string): boolean
```

`heading-collapse-change` carries the current state for the Desktop session map and outline refresh.

## Implementation

- Headings H1–H6 get an attachment button with pointer and Enter/Space activation; empty/terminal headings keep the control unavailable.
- A section runs to the next heading of the same or higher level. Collapsing hides only that rendered range; the heading remains visible.
- Collapsed parents retain child collapse state; expanding the parent re-applies the child key state.
- Virtual mode gives hidden blocks zero advance, skips mounting them, and rebuilds the offset/segment indexes when collapse changes.
- A caret or selection that would be hidden moves to the collapsed heading's content end. An unrelated visible caret is untouched.
- During IME composition the toggle is ignored; after composition the user can retry.
- Outline/link/find navigation expands only blocking ancestors. A heading target keeps its own collapsed state; a body target expands its containing section.
- Source mode captures state before the overlay and reapplies it after `replaceContent` reaches render-complete. Tab switches use a per-document session map.
- Source edits and tab rebuilds use stable heading keys, so block-object replacement does not lose collapse state.

## Evidence

- Red before production code: `vitest run src/__tests__/headingCollapse.spec.ts` entered all 7 initial cases and failed on the missing control/API.
- Focused Muya suite: 11/11 passed (control availability, parent/child state, TOC ancestor reveal, caret eviction/retention, IME, virtualized long document, keyed rebuild, Setext headings, duplicate-heading keys).
- Electron E2E: `test/e2e/heading-collapse.spec.ts` 2/2 passed (pointer + keyboard collapse, nested restore, TOC explicit reveal, source-mode round trip, unchanged source file, tab switch).
- Existing TOC/anchor navigation E2E: 10/10 passed (`toc-scroll`, `toc-outline-enhancement`, `anchor-link-scroll`).
- Desktop focused TOC/geometry/virtualization/editor suites: 68/68 passed across 11 files.
- Desktop full unit suite: 173 files / 1351 passed / 1 skipped.
- Muya `lint:types` and root `pnpm typecheck`: passed.
- Muya full test: 260 files, 1752 passed, 1 failed. The single failure is `src/ui/tableChessboard/__tests__/tableChessboard.spec.ts` timing out on a 5 s dynamic package-index import. The identical test fails on the unrelated PR #288 worktree at the same 5 s timeout, so it is a local baseline timeout, not this feature. The other 5 tableChessboard tests pass.
- ESLint on changed Muya and Desktop files: 0 errors; existing/new complexity warnings only.

## Remaining work / handoff

- F5–F6 cross-session persistence: store the keyed state per document identity in the application data directory, with replacement/ambiguity rules. Reuse `getHeadingCollapseState`/`setHeadingCollapseState`; do not add a second collapse model.
- Packaged Windows/macOS validation and real Chinese IME/manual device testing remain candidate-build work.
- Find-result reveal is wired through the existing find action; a dedicated multi-result E2E and TOC active-state edge matrix remain to be added.
- Heading rename keeps the live block collapse but the persisted key is only refreshed on the next state read/toggle; the cross-session work must define rename matching before relying on stored keys.
