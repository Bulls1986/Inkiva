# V07 — cross-session heading collapse state (F5/F6) — stage record

[Back to product index](README.md)

Scope: v0.7.0 F5–F6 only. No PDF, page numbers, missing-image placeholders or copy
changes are touched here.

## Implemented

| Piece | Behaviour |
|---|---|
| `main/documentState/collapseStateStore.ts` | Records keyed by platform file identity (`dev`+`ino`), versioned JSON in `userData`, serialized read-modify-write, atomic replace, corrupt file treated as empty. No identity → nothing read or written. A failed write rejects without damaging the previous record. |
| `main/documentState/collapseStateService.ts` | Application-wide store; synchronous write inside the IPC handler so a collapse followed by an immediate quit is already durable. `rekeyIfSameDocument` migrates a record after an app save only when the identity captured before the write still holds at the moment of writing. |
| `main/filesystem/index.ts` | Captures the identity before the atomic write, re-reads it immediately before, and delegates the migrate/skip decision to `rekeyIfSameDocument`. |
| `renderer/src/services/collapseRestore.ts` | Ancestor key chain derived from document order with the engine's own key; a heading restores only on a unique key+level+ancestor match, everything else stays expanded and is reported stale. |
| `editor.vue` | Restores once per document when the outline exists, persists on every collapse change, discards an async restore whose document id/path changed meanwhile, and attaches session-only state when a first save gives an untitled document a path. |

## Evidence (Windows x64, development build, production IPC, no stubs)

`collapse-persistence.spec.ts` — real quit + relaunch with a shared `--user-data-dir`:

| Case | Expectation |
|---|---|
| Collapse, quit immediately, relaunch | still collapsed, sibling expanded |
| Same path replaced by a different file | expanded |
| Copy with identical content | expanded |
| App atomic save, then relaunch | still collapsed |
| Moved/renamed within the same volume | still collapsed |
| Corrupt store | opens expanded, document usable |


Unit: store (11, including write-failure recovery), matching (8), ancestors (4),
rekey race (5).

## Conflict and lifecycle strategy

- **Multiple windows**: each window writes the whole record for its document, so
  the last completed write wins; there is no field-level merge. This is the
  intended strategy, but it is **not yet verified end to end**: an attempt to run
  two Electron processes against one `--user-data-dir` fails at launch (the
  second instance cannot use that profile), so the case has to be driven through a
  second BrowserWindow inside one process, which is not written yet.
- **Quit while a change is in flight**: the main process writes synchronously
  while handling the IPC message, so the record is durable before the window can
  close.
- **Write failure** (read-only profile, disk full): the store rejects, the
  renderer swallows it, the session keeps working and the previous record stays
  readable.

## Guards with tests but no failing-first proof

`rekeyIfSameDocument` now has direct unit tests (unchanged identity migrates;
external replacement, missing identity, unchanged inode and vanished file do
not). The late-restore guard in the editor is **not** covered by a controlled
race test yet: its predicate is inline, and no deterministic failing test was
produced for it. It is not claimed as verified behaviour.

## Not done

- Untitled document first-save association: implemented via a path watcher, but no
  Electron test yet (the native save dialog has to be stubbed).
- Multi-window concurrency: strategy defined, no valid test yet (see above).
- Late-restore race: no controlled test (see above).
- Local E2E runs must start from a clean process table: leaked Electron processes
  from an interrupted run pushed the same suite into timeouts twice.
- A replacement between the last identity check and the write itself cannot be
  distinguished from the app's own write.
- macOS APFS and real devices are not tested (user decision); network/cloud drives
  are unknown.

## Independent pre-verification (PR #291, head 0068cdcf) — status at this commit

Three defects were reproduced through the production path in
`collapse-regressions.spec.ts` (real quit + relaunch, no stubs).

| Defect | State |
|---|---|
| D3: an inserted identical heading collapsed the new heading and expanded the original | **fixed** — identity is now the heading text + level + ancestor texts, matched only when unique; the regression passes |
| D1: pruning one stale key wiped every restored collapse | **not fixed** — reproduction still fails after changing the prune save to persist the post-restore state |
| D2: a document without a record inherited the previous document's collapse | **not fixed** — reproduction still fails after clearing the engine collapse state before a restore attempt |

The two attempted fixes are in this commit but unproven; the failures mean the
cause is elsewhere (likely the restore attempt guard and the point at which the
engine state is read back). Do not merge until both regressions pass.
