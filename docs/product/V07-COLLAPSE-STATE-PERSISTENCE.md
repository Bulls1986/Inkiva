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

## Architecture diagnosis follow-up (head 7bec7a8e → fixed here)

The diagnosis found that the earlier fixes addressed symptoms:

| Issue | Root cause confirmed by the diagnosis | Fix |
|---|---|---|
| D1 restored collapses lost on the next launch | the pre-restore programmatic clear fired `heading-collapse-change`, which persisted the fully expanded state before the record was read | programmatic changes (restore, clear, tree replacement) now never persist; only a user collapse does |
| D2 a document without a record inherited the previous document's collapse | Muya re-uses heading keys when it replaces the tree, and that event was filed under the already-switched new document, so the session cache and the next write carried the old document's state | the tree-replacement event is ignored (it is not a user action), and a document without a session record is reset to expanded programmatically |
| D3 an inserted identical heading collapsed the wrong section | uniqueness was only counted on the current side | identity (text + level + ancestor texts) must be unique on BOTH sides; an ambiguous record is not pruned, it is kept for a later unambiguous document |
| late read overwrote newer intent | only document id/path were checked | each restore carries a document activation generation and is discarded when the user collapsed something meanwhile or another document was activated (covers A→B, A→B→A and same-document settlement) |

## Evidence

Red first, production path, real quit/relaunch (`collapse-regressions.spec.ts`):

| Case | Before | After |
|---|---|---|
| D1 pruning a stale key keeps the restored collapses (3 launches) | failed | passes |
| D2 a document without a record stays expanded (switch and switch back) | failed (test precondition also fixed) | passes |
| D3 inserted identical heading stays expanded | passes (insert); the 2→1 delete case failed | passes |

Full set: `collapse-regressions` + `collapse-persistence` + `collapse-multiwindow`
= 11 cases, all green on Windows x64 with a clean process table:

- restart after collapse + immediate quit; same-path replacement; identical copy; app atomic save then restart; same-volume move; corrupt store
- second window in the same process on the same file: whole-record last write wins, store stays valid JSON, relaunch shows the later window's state
- untitled document: first save binds the snapshot, relaunch restores it

Unit: 33 assertions across five collapse specs (store, write-failure recovery,
text identity, both-sides ambiguity, rekey race). `vue-tsc` 0 errors; full-repo
eslint 0 errors.

## Remaining boundaries

- A window where the application's own save replaces the file between the last
  identity check and the write cannot be distinguished from an external one.
- Two windows writing simultaneously: the last completed write wins for the whole
  document; there is no field-level merge (verified for sequential writes).
- Network/cloud drives and macOS APFS are untested; macOS real devices are out of
  scope by decision.
- Very large documents: recovery is verified with the sample documents used here,
  not a 200+ heading document.

## Acceptance follow-up: D4, D5, D6 (head `301b9829` + this change)

The independent acceptance pass found two blockers after D1–D3 were fixed. The
root causes below were established by recording the real event sequence in the
running renderer (temporary `console` traces through a Playwright listener, all
removed before this commit), not by reading the code alone.

**D4 — an untitled document inherited the previous document's collapse.**
Trace: the tree replacement emitted `heading-collapse-change` with
`documentContentSwitching` true (correctly ignored), and
`maybeRestoreCollapseFromDisk` was reached for the new document with an empty
path. That branch returned immediately, so nothing ever cleared the engine state
Muya had carried over from the previous tree. Fix: the pathless branch now
resets the engine to expanded programmatically and marks the document settled.

**D5 — a late restore overwrote a newer user collapse.** The trace showed two
separate faults, and the second one is why the first fix attempt failed:
1. The revision token was sampled after `await load`, so a toggle made while the
   read was open was invisible. Sampling alone was not enough.
2. Comparing documents' snapshots cannot distinguish "the user changed this" from
   "this is the document's initial state", so a toggle made *before* the read
   started was still overwritten. Fix: real user events record which heading keys
   the user actually toggled (`userTouchedByDocument`), and the restore preserves
   those keys while applying the record to the rest. The whole-result discard on
   revision is gone; identity and activation generation still discard.
3. A toggle made before the restore settled also wrote a snapshot that lacked the
   stored headings, erasing them on disk (verified: the store ended up with
   `installation: expanded`). Fix: no write is issued until the document's restore
   decision is final; a pending write is flushed once, merged with the restored
   state.

**D6 — untitled first save then relaunch.** Reproduced as passing once D4 was
fixed, which confirms the acceptance failure was a consequence of D4's inherited
state rather than a separate first-save binding defect. The case is now part of
the suite so it cannot silently regress.

### Evidence

Production path, real launch/quit, no stubs except the native save dialog in D6.
The only test seam is `INKIVA_COLLAPSE_LOAD_DELAY_MS`, which holds the store read
open so a late response can be exercised; it is off unless set and has no
production effect.

Red before the fixes (commit `301b9829`): D4 and D5 failed, D6 passed.
Green after (`collapse-acceptance-d4d5.spec.ts` + the earlier suites): 14/14,
covering D4/D5/D6, D1/D2/D3, the six persistence scenarios and both multi-window
cases. Unit: 33 passed. `vue-tsc`: 0 errors. ESLint: 0 errors.

## Re-verification follow-up: D8 identity and D7 quit flush

The independent re-verification of `fad4abf1` found one blocker and one narrow
window. Both were reproduced before the fix.

**D8 — a same-path replacement inherited the old record.** The identity key was
`device:inode`, and ext4 reuses the inode number when a file is deleted and
recreated at the same path. Measured on this machine with a 20-iteration probe
(`rm` + write at the same path):

| filesystem | inode reused | birth time differs | old key still equal |
|---|---|---|---|
| Windows NTFS | 0/20 | — (new inode) | 0/20 |
| WSL ext4 | **20/20** | **20/20** | 20/20 before the fix, **0/20 after** |

The key is now `device:inode:birthtime`. It is an additional component, never a
claim of proof: when the filesystem reports no birth time (`0n`) the key keeps
the older `device:inode` shape, so a record written where it is reported can
never match a file read where it is not — the document opens expanded. Same-volume
move keeps device, inode and birth time, so it still restores; an application
atomic save still migrates through `rekeyIfSameDocument`; a copy still has its own
inode. Records written by the previous format simply never match, which is the
approved "expanded" fallback for an unmerged feature.

macOS/APFS is untested (real devices out of scope by decision); APFS reports a
birth time, so the same key shape applies, but the inode-reuse behaviour there is
not measured.

**D7 — a collapse made while the record was loading was lost by quitting
immediately.** Holding the read open and quitting right after a toggle lost that
toggle, because the write had been deferred until the restore settled. A window
that is unloading cannot await anything, and writing its whole snapshot would have
erased the headings the record still held. Now the renderer hands main only the
headings the user actually toggled (`mt::collapse-state::stage`), and main merges
them into the stored record on `before-quit`. Verified on the real path: after an
immediate quit the record holds both `Installation` (from the stored record) and
`Configuration` (the user's newer toggle), and the relaunch shows both.

### Evidence

- Red: `collapse-d7-exit-flush.spec.ts` failed on the parent commit (store still
  held the seed record); `collapse-identity.spec.ts` failed because two files with
  the same device and inode but different birth times produced the same key.
- Green: 15/15 collapse E2E (D7, D4/D5/D6, D1/D2/D3, six persistence scenarios,
  two multi-window cases), 37 unit assertions in six specs, `vue-tsc` 0 errors.
- `editor.vue` line endings were normalised to the repository's CRLF: the diff
  against the merge base drops from 8251 changed lines to 332, so the review now
  sees only the semantic change.
- 200+ heading documents remain unverified: the virtualised last section's
  collapse control cannot be mounted from the test side (four approaches tried by
  QA, three here); 40 headings are covered.
