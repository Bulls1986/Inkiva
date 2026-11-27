# V07 — cross-session heading collapse state (F5/F6) — stage record

[Back to product index](README.md)

Scope: v0.7.0 F5–F6 only. No PDF, page numbers, missing-image placeholders or copy
changes are touched here.

## Status: core contracts implemented, renderer wiring NOT complete

This PR lands the persistence core and its typed bridge. The editor does **not**
apply or save cross-session state yet, so there is no user-visible behaviour
change in this commit; the remaining wiring is listed below. It must not be
merged or described as a working F5/F6 implementation until that is done and
verified by an app restart.

## What is implemented

| Piece | Location | Contract |
|---|---|---|
| Store | `main/documentState/collapseStateStore.ts` | Records keyed by platform file identity (device + inode from `fs.stat({ bigint: true })`), versioned single JSON file in `userData`, serialized read-modify-write, atomic replace, corrupt file treated as empty. |
| Identity fallback policy | same file | When identity cannot be established nothing is stored or read; a path alone never revives a record. |
| Matching | `renderer/src/services/collapseRestore.ts` | A recorded heading restores only on a unique match of key + level + ancestor chain. Duplicates, level changes, different parents and removed headings stay expanded and are reported as stale for pruning. |
| Bridge | `main/ipc/collapseState.ts`, `shared/types/collapseState.ts`, preload `window.collapseState` | Typed `load/save/clear`; main owns the store so several windows share one serialized writer. |

## Evidence

```
Red:   collapse-state-store.spec.ts 8/8 and collapse-restore.spec.ts 8/8 failed
       against the interface stubs ("not implemented") before implementation.
Green: 16/16 passed.
vue-tsc --noEmit        0 errors
eslint .                0 errors
```

## Not done (blockers for calling F5/F6 complete)

1. **Renderer wiring.** The editor still keeps collapse state only in the
   in-session map. Loading on open, saving on toggle and pruning stale entries
   are not connected.
2. **Stable key derivation.** The stored key must be the same key
   `getHeadingCollapseState()` reports (GitHub slug + duplicate occurrence);
   deriving ancestors from `getTOC()` for the record needs to be written and
   tested before persistence can be correct.
3. **Save-path identity continuity.** The repository's atomic save replaces the
   inode, so the record must be re-keyed after an app-initiated save; otherwise
   state is lost on the first save. Not implemented.
4. **Rename/move continuity.** App-initiated rename/move keeps the same inode on
   NTFS, so identity should survive; this is unverified.
5. **Unnamed documents.** Session-only until the first save, then associated with
   the new file. Not implemented.
6. **Multi-window and lifecycle.** The store serializes writes, but simultaneous
   windows editing the same file and window teardown are untested.
7. **Platform coverage.** Identity behaviour is verified on Windows NTFS only;
   macOS APFS is not tested (user decision) and network/cloud drives are unknown.
