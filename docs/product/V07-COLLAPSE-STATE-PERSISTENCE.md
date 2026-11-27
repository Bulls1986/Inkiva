# V07 — cross-session heading collapse state (F5/F6) — stage record

[Back to product index](README.md)

Scope: v0.7.0 F5–F6 only. No PDF, page numbers, missing-image placeholders or copy
changes are touched here.

## Implemented

| Piece | Behaviour |
|---|---|
| `main/documentState/collapseStateStore.ts` | Records keyed by platform file identity (`dev`+`ino`), versioned JSON in `userData`, serialized read-modify-write, atomic replace, corrupt file treated as empty. No identity → nothing read or written. `rekey()` migrates one record. |
| `main/documentState/collapseStateService.ts` | Application-wide store. Writes are **synchronous inside the IPC handler** so collapsing and quitting immediately cannot lose the change. `rekeyAfterAppSave` migrates the record after an atomic app save. |
| `main/filesystem/index.ts` | Captures identity before the atomic write, re-checks it immediately before writing, and migrates the record only when both identities exist and match the captured one. |
| `renderer/src/services/collapseRestore.ts` | `buildHeadingRecords` derives the ancestor key chain from document order using the engine's own key; `resolveCollapseRestore` restores only a unique key+level+ancestor match and reports the rest as stale. |
| `editor.vue` | Restores once per document when the outline exists (a still-mounting engine would otherwise prune a valid record), writes on every collapse change, re-checks document id/path after the async load, and attaches session-only state when a first save gives the document a path. |

## Evidence (Windows x64, development build)

`collapse-persistence.spec.ts` drives the production IPC + store, no stubs, real
app quit and relaunch, shared `--user-data-dir`:

| Case | Expectation |
|---|---|
| Collapse, quit immediately, relaunch | still collapsed; sibling expanded |
| Same path replaced by a different file | expanded |
| Copy with identical content | expanded |
| Application save (atomic replace) then relaunch | still collapsed |
| Moved/renamed within the same volume | still collapsed |
| Corrupt store file | opens expanded, document usable |

Unit: 22 assertions (8 store + 8 matching + 4 ancestor + 2 rekey). Typecheck and
full-repo eslint clean.

## Guards added without a failing test first

These are defensive; no deterministic failing test was produced for them, so they
are **not** claimed as verified behaviour:

- stale async load after a document switch is discarded (id + path re-check),
- an external replacement between identity capture and the atomic write skips the
  re-key instead of attaching the record to the new file.

## Not done / not verifiable here

- Multi-window: two windows on the same file are not exercised end to end; the
  store serializes writes, but last-writer-wins between windows is untested.
- Untitled document: the first-save association is implemented but not covered by
  an Electron test (the save dialog has to be stubbed).
- macOS APFS and real devices are not tested (user decision); network/cloud drives
  are unknown.
- A file replaced between the pre-write identity check and the write itself cannot
  be distinguished from the app's own write.
