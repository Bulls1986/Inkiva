# US16 / File Identity & Operation Continuity

## Scope

US16 closes rename/move continuity for a document that is already open. The operation must preserve the same tab and dirty draft, keep current-document relative references pointing at the same targets, retain Local History and recent-document association, and surface partial/external failures without guessing identity.

Acceptance focus: AC-65, AC-66, AC-67, AC-82.

## Stage 0 — diagnosis

Base: `develop@b92f2370`
Branch: `feat/v0.5-us16`

Mandatory agent/testing/architecture contracts were read before production mutation.

Existing capabilities to reuse:

- `DocumentIntelligenceService` already owns Markdown link repair and Local History.
- `MarkdownLinkIndex` already canonicalizes document paths and computes relative Markdown paths.
- editor tabs already keep stable `id`, cursor/history/scroll state independently of pathname.
- file watchers already distinguish external `unlink` / `change` events and preserve dirty tab content.

Observed gaps:

1. current rename/move handlers perform `fs.rename` directly and only log filesystem errors;
2. `mt::set-pathname` currently marks the tab saved, which can destroy dirty-state semantics on rename/move;
3. sidebar rename only updates exact pathname matches, so a renamed parent directory does not migrate descendant open tabs;
4. rename repair parses only relative Markdown-file links, excluding relative images/resources;
5. rename repair treats `fromPath` as one file, not a moved directory prefix;
6. recent-document and Local History path identity are not migrated as one operation;
7. existing inbound-link intelligence is not connected to a preflight/manual-check flow.

## Red plan

First executable Red pins the lowest-level continuity contract without UI coupling:

- moving one open Markdown document repairs both relative Markdown links and relative images;
- renaming/moving a parent directory remaps the source document path and recalculates references that leave that directory.

After Red is proven, production work will extend the existing document-intelligence primitives rather than create a parallel parser/history subsystem.

## Stage 1 — executable Red

Focused command:

`pnpm --dir packages/desktop exec vitest run test/unit/specs/document-intelligence-repair.spec.ts`

The test file was discovered and executed: 6 tests total, 4 passed and 2 failed for the intended missing behavior.

- relative image/resource continuity: expected 2 repaired references, current implementation reported 1;
- parent-directory continuity: expected 1 repair, current implementation reported 0.

This is executable behavioral Red rather than an environment/bootstrap failure. Earlier dependency/Junction failures were explicitly excluded from Red evidence.

Implementation direction: keep the Markdown backlink index strict, add a rename/move-only local-resource parser, and make directory-prefix remapping explicit through `pathKind`.

## Stage 2 — identity primitives

Three additional Red contracts were established before implementation:

- a parent-directory move must update descendant open tabs in place while preserving dirty draft, cursor, scroll and history;
- Recent Documents must migrate file/directory identities without losing pin or recency metadata;
- Local History snapshots must migrate from the old path key to the new path key.

The first combined Red executed 11 behavior tests: the existing 9 passed while Recent and Local History failed because migration APIs did not exist. The Tab test initially failed during test bootstrap and was not counted; after the fixture was corrected it executed 1/1 and failed on the expected stale pathname.

Implementation:

- `editor.RENAME_IF_NEEDED` now supports explicit `file | directory` path kinds and remaps descendant tabs without replacing tab objects or touching save/durability state;
- Recent Documents has a `MOVE_PATH` identity migration that preserves pin/last-opened metadata and persisted removed-path state;
- `LocalHistoryStore.movePath` remaps file or directory identities, preflights destination snapshot collisions, and migrates retained snapshots without changing document content.

Focused Green:

`vitest run recent-documents.spec.ts document-intelligence-history.spec.ts file-identity-continuity.spec.ts`

Result: 3 files passed, 12/12 tests passed.

## Stage 3 — operation wiring and failure semantics

The identity primitives are wired into the existing file-operation entry paths rather than creating a third file manager:

- main-menu Rename / Move To keeps the existing filesystem operation and watcher update, but successful operations now mark `mt::set-pathname` as an `identityMove`; filesystem failures are surfaced to the renderer instead of being log-only;
- an `identityMove` changes pathname/filename without treating the operation as a Save acknowledgement, so a dirty tab remains dirty and its durability watermark is untouched;
- sidebar Rename records whether the source is a file or directory, and only after filesystem success migrates open tabs, Recent Documents, Local History and moved-document references;
- sidebar Cut -> Paste carries the same `pathKind` through the clipboard entry and performs identity migration only after the cut/move succeeds;
- moved open documents opt into local-resource repair through `includeResources: true`; the generic Document Intelligence repair API remains Markdown-link-only by default, preserving its pre-US16 contract;
- reference repair is applied through the ordinary content-change/revision path. If the document changes while the repair plan is in flight, the stale plan is skipped instead of overwriting newer edits;
- known backlinks from documents that were not moved produce a manual-review warning. Inkiva does not batch rewrite those other documents;
- external `unlink` followed by a same-name `add` elsewhere remains two unrelated watcher events: the old tab stays bound to its old pathname and Inkiva does not infer identity from basename.

Additional executable Red/Green evidence was established for each of these boundaries: dirty-state preservation on `set-pathname`, moved-document own-reference repair, inbound-link warning, sidebar rename success/failure, sidebar cut/move, and external same-name non-rebinding.

### Review fixes

Architecture/diff review found two correctness edges before closeout:

1. directory-descendant checks originally rejected every relative path beginning with `..`, which incorrectly classified a legal child named `..drafts` as parent traversal. Red tests reproduced the failure in both rename repair and Local History migration. The guard now rejects only `..` itself, `..{path separator}`, or an absolute path;
2. Local History migration initially placed target writes and old-copy deletion in one rollback block. If cleanup failed after some old snapshots had already been deleted, rolling back the new copies could lose the only durable history. A dedicated injected-failure Red reproduced this. Migration is now two-phase: all target snapshots must become durable before cleanup starts; target writes are rolled back only while every source is still authoritative; after commit, old-copy cleanup is best-effort and can leave duplicates but can never remove the complete new identity history.

## Stage 4 — validation and local closure

Final current-worktree evidence after all review fixes:

- focused US16 matrix: **11 test files, 37/37 passed**;
- compatibility check for the default Markdown-only repair contract and US16 opt-in resource repair: Green;
- Local History cleanup-failure regression plus normal Local History coverage: **9/9 passed**;
- root `pnpm typecheck`: **passed**, including the Muya public-type boundary and recovery-history architecture gates;
- root `pnpm lint`: **0 errors**; the existing repository warning backlog remains **273 warnings** and no rule was weakened;
- full desktop unit suite: **164/164 files passed; 1294 passed, 1 skipped, 0 failed**;
- `packages/desktop/test/e2e` was searched for an existing file Rename / Move / sidebar-paste workflow and none exists. No unrelated high-cost E2E was added merely to satisfy a checkbox; this story is covered by real-filesystem Local History tests plus IPC, renderer-store, watcher and sidebar-operation contract tests.

Environment/bootstrap failures encountered while constructing the worktree test environment, and test-fixture import failures before Vitest entered the intended test body, were explicitly excluded from Red evidence.

## Stage 5 — PR CI closeout incident

PR #212 was opened from a remote tree that was byte-for-byte identical to the locally validated US16 commit tree. Lint, Test, Performance Fast Gate and all three PR Build platform jobs passed.

The E2E workflow failed twice on the same pre-existing US15 acceptance test:

`US15 AC-81: Typewriter does not reclaim a newer user position when geometry above grows`

Both Linux CI attempts reached the real assertion body, passed 394 tests with 15 skipped, and failed because `triggerAsyncGrowthForSection(page, section)` returned `false`. The failure was not in US16 rename/move code. Diagnosis showed that the fixture first positioned the async-growth block immediately above the viewport, then allowed up to four `wheel(120)` gestures. On CI this could evict that same block from the adjacent virtual segment before the intended ResizeObserver mutation was triggered.

The fixture was tightened without weakening the product assertion:

- keep the user-navigation input as a real wheel gesture, but reduce each step from 120 to 32 CSS pixels;
- explicitly require the async-growth target to remain mounted while establishing the >20 px caret/reference-line offset;
- keep the final Typewriter/geometry assertions unchanged;
- do not add retries, skips, larger timeouts, or product-side special cases.

A local exact Playwright rerun was attempted but could not enter the test body because the Windows worktree lacks the native `ced.node` binding. That environment failure is not counted as Green evidence. The repaired test must therefore be validated by a fresh Linux PR E2E run before merge.

## Guardrails

- no batch rewrite of inbound links in other documents;
- no silent replacement by a same-name file after external move/delete;
- no timeout/retry/skip relaxation;
- no new workspace/file-manager abstraction;
- failures must preserve real filesystem state and a reachable rollback/repair path.

## Lessons retained

1. **Path is mutable metadata, not document identity.** Rename/move must preserve the tab/document id and its draft, history, cursor, scroll and durability state; changing pathname must never masquerade as a Save acknowledgement.
2. **Extend narrow contracts explicitly.** Generic rename repair remains Markdown-link-only. Move-specific image/resource continuity is an explicit `includeResources` capability so a new product requirement does not silently broaden existing callers.
3. **Filesystem success is the commit point for identity metadata.** Renderer identity, Recent Documents and Local History may migrate only after the real rename/move succeeds. A failed filesystem operation must leave those identities untouched.
4. **History migration is a two-phase durability transaction.** First make every target snapshot durable; only then clean old copies. Pre-commit write failure may roll back targets, while post-commit cleanup failure may leave duplicates but must never sacrifice the complete new copy.
5. **Inbound links are dependencies, not owned content.** Known incoming references from other documents justify a warning and manual review, not silent background mutation of those documents.
6. **Watcher events do not prove identity.** An external removal followed by a same-name file elsewhere cannot be interpreted as a move without stronger evidence.
7. **Path containment is component-aware.** String predicates such as `startsWith('..')` are not valid traversal checks because legal child names can begin with two dots.
