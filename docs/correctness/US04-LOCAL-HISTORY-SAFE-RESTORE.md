# US04 — Local History Safe Restore

[Back to Correctness index](README.md) · [Testing contract](../agent/TESTING.md)

## Goal

Deliver the v0.5.0 US04 local-history flow without replacing Inkiva's current UI baseline with the reference prototype:

1. choose a local-history entry;
2. inspect it in a read-only preview without changing the current file;
3. optionally open that snapshot as a new untitled document;
4. require an explicit second confirmation before restoring in place;
5. create a rollback snapshot of the current on-disk content before replacement;
6. preserve the existing dirty-document and stale-content restore guards.

The supplied prototype is interaction/reference material only. Existing Inkiva layout, design tokens, side-bar information architecture and standard controls remain authoritative.

## Implementation

- The existing Document Info / Local History section remains the entry point.
- History rows now open a read-only preview instead of writing to disk immediately.
- The preview uses the existing local-history `history-get` IPC contract.
- “Open as New Document” uses Inkiva's existing `mt::new-untitled-tab` flow and never mutates the source file.
- “Restore as Current Version…” exposes an in-preview confirmation step before invoking the existing restore path.
- `LocalHistoryService.restoreSnapshot` now snapshots the current disk contents with reason `before-restore` after stale-content validation and before the atomic replacement write.
- `before-restore` is recognized end-to-end by shared types, IPC validation, persistence normalization, and locale display.
- Snapshot previews are selection-version guarded so a response from a document that is no longer current is discarded.

## Validation evidence

Focused red/green evidence:

- Renderer local-history coordinator: the new preview test initially failed because `getSnapshot` did not exist; after implementation, `document-intelligence-renderer.spec.ts` passes **8/8**.
- Restore rollback: the new assertion initially failed because no rollback snapshot existed. After implementation, the focused restore test passes and verifies the rollback content.
- A second red test exposed that the persistence-layer reason whitelist normalized `before-restore` to `unknown`; the whitelist and IPC validator were updated rather than weakening the assertion.
- Desktop production build: `pnpm -C packages/desktop run build` completed successfully.

Typecheck note:

- The first desktop `vue-tsc` run found one US04-local error (missing `bus` import), which was fixed.
- The same run also reported existing Muya declaration errors whose paths resolve through the donor checkout (`E:/workspace/opensource/Inkiva/packages/muya/...`) while this task source is under `.worktrees/us04-history`. Per `ENVIRONMENT_RECIPES.md`, that is dependency-topology leakage and not product evidence. The current-worktree Electron build is green.

Known unrelated baseline evidence:

- Running the entire `document-intelligence-history.spec.ts` on this Windows environment also exposes a pre-existing path-case assertion mismatch in `LocalHistoryStore`; US04 does not alter or relax that assertion.

## Stage status

Implementation and focused validation are complete on branch `feat/us04-local-history`, based on `origin/develop@cd00ada`.

No merge has been performed.

## Learning review

- A new history reason must be propagated through all four layers: shared type, IPC input validation, persistence whitelist/normalization, and locale presentation. Updating only the TypeScript union silently degrades persisted metadata to `unknown`.
- A preview operation needs the same document-selection race discipline as metadata loading/restoration; “read-only” does not mean race-free.
- The existing environment guide already covers the Windows NVM path-with-spaces wrapper failure and donor dependency realpath leakage encountered here, so no duplicate environment rule was added.
