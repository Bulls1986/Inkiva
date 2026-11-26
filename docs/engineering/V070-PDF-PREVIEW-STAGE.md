# v0.7.0 PDF preview and same-artifact save — implementation stage record

[Back to engineering index](README.md)

Scope: design review P1–P4 and P7 only. Page numbers (P5), missing-image
placeholders (P6), cross-session collapse state and copy changes are separate
PRs and must not be mixed into this change.

## Boundaries touched

| Boundary | Change |
|---|---|
| Typed IPC contract (`src/shared/types/ipc.ts`, `src/shared/types/pdfPreview.ts`) | New `mt::pdf-preview::{generate,read,save,cancel,release}` channels; results are typed unions so failures cross the bridge as data, not as thrown Electron errors. |
| Preload domain API | `window.pdfPreview` exposed next to the other domain APIs. No raw channel strings in the renderer. |
| Main process ownership | `src/main/pdfPreview/pdfPreviewService.ts` owns the artifact, the generation queue and the save validation; `src/main/ipc/pdfPreview.ts` owns the isolated print page and the native dialog. |
| Renderer | `services/pdfPreviewSession.ts` owns preview state and staleness; the export dialog hosts the settings and the PDF.js panel. |
| Renderer→main export | `mt::response-export` no longer carries PDF: styled HTML keeps that path, print keeps its own entry. |

## Invariants

1. **One artifact, one save.** The bytes main generated are the bytes read for
   the preview and the bytes written on save; saving never re-renders.
2. **One print page, one job.** Generations are serialized per window, a new
   request supersedes the previous result, and the next print page is created
   only after the previous one reported destruction. This follows the Windows
   spike, where two `printToPDF` submissions on one `webContents` took the
   Electron process down.
3. **Stale results never win.** Superseded, canceled or timed-out generations are
   released, never adopted; the session refuses to save anything that is not its
   current ready artifact.
4. **Revalidate after the native dialog.** The artifact is checked again after
   `showSaveDialog` returns; a document/settings/resource change while the OS
   dialog was open blocks the write.
5. **Failure keeps the preview.** A failed write leaves the artifact and the
   warning in place so the user can retry the same page.
6. **Lifecycle edges are bounded and stale-proof.** Print-page teardown is
   bounded so a page that never reports destruction cannot stall the queue, and
   an awaited teardown that finishes late never resets a newer generation
   (the renderer session re-checks its sequence before resetting).
7. **Referenced images are part of the artifact identity.** The preview
   records `mtimeMs`/`size` for every local `file://` image it embeds and re-reads
   them before saving; a changed or vanished file marks the preview stale and
   blocks the write (P2/P7). Images the renderer never embeds (remote, `data:`)
   are out of scope by construction.
8. **A save result never repaints a replaced session.** The native dialog can
   outlive the export dialog that opened it; the session re-checks its sequence
   before applying the outcome.
9. **Paper units are inches.** `printToPDF` reads custom `pageSize` in inches;
   the dialog collects millimetres, so the conversion happens in
   `main/pdfPreview/pageOptions.ts`.

## Races found while building the E2E evidence

Two lifecycle races were reproducible from the Electron E2E and are fixed here:

1. A dialog close that had to await PDF.js teardown could finish after the user
   started a new export, resetting the fresh session to `idle` — the preview
   silently never appeared. The session now switches state synchronously and
   tears the old document down in the background.
2. A save response that arrived after the dialog was reopened for a new export
   closed that newer dialog. The dialog now only closes for the session that
   started the save.

A third, smaller one: the dialog used to request a preview through a fire-and-forget
bus event, so a click before the editor attached its listener was lost silently.
The editor now registers itself as the preview content provider and the E2E waits
for that readiness state.

The intermittent E2E failure that survived those fixes was in the test helper,
not the product: it treated "not generating" as completion, which the panel's
pre-click `idle` state satisfies in the same tick, so it asserted on a preview
that was still starting (the DOM status trail showed `idle>generating>ready`).
The helper now waits for `ready`/`failed`/`stale`, and the panel exposes the
status trail in test mode so a future stall is diagnosable from the failure
message alone.

## Evidence

| Gate | Command | Result |
|---|---|---|
| Red (main artifact service) | `vitest run test/unit/specs/pdf-preview-service.spec.ts test/unit/specs/pdf-preview-page-options.spec.ts` | 16 of 17 assertions failed against the interface stub (missing artifact reuse, serialization, stale/timeout handling, mm→inch conversion). |
| Red (renderer session) | `vitest run test/unit/specs/pdf-preview-session.spec.ts` | 11 of 11 assertions failed against the interface stub. |
| Green | the PDF preview specs | 35 passed (31 + 4 resource-identity assertions). |
| Regression | `vitest run test/unit` (desktop) | 177 files passed; 1388 passed, 1 skipped. |
| Type check | `vue-tsc --noEmit -p tsconfig.json` | No errors in the changed files. |
| Electron E2E | `playwright test test/e2e/export-pdf.spec.ts test/e2e/export-pdf-resources.spec.ts` | 5/5 passed on repeated runs on Windows x64: SHA-256 equality between the preview artifact and the saved file, `/Outlines` + `/StructTreeRoot` in the written PDF, and an edited image on disk blocking the save of the old preview. |
| Lint | `eslint` on the changed files | 0 errors. |

## Not covered here

- macOS Intel/Apple Silicon real-device runs (user decision for this release
  cycle); only Windows x64 behaviour is exercised.
- Packaged installers: PDF.js worker loading and CJK font rendering are verified
  from a development build only.
- External image content changes that the renderer cannot observe keep the
  confirmed artifact, as the design allows; only added/removed references and
  theme/CSS changes are detected.
- Page-number and missing-image placeholder behaviour belong to their own PRs.
