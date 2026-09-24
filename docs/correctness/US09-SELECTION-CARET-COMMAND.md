# US09 / Selection, Caret & Command Predictability

## Scope

Inkiva v0.5.0 US09 closes selection/caret predictability without redesigning the existing editor UI. The product design/prototype is reference material; current Inkiva interaction and visual conventions remain authoritative.

Release criteria covered: AC-41, AC-42, AC-43, AC-44, AC-71, AC-72.

## Baseline

Branch: `feat/v0.5-us09`  
Base: `develop@e7e41b0866eed6f1984e93020f324b215d396dda`

Existing correctness already present before this task:

- command mutations pass through editor-readiness and remain bound to the requesting document;
- command-palette execution is deferred until the dialog has fully closed;
- inline format toolbar restores the live Muya selection before applying a format;
- per-tab cursor/history state and Source/WYSIWYG cursor mapping already exist;
- plain link clicks are prevented from navigating while Ctrl/Cmd-click emits the link jump;
- pending scroll restoration already cancels on explicit user interaction.

## Diagnosis

Two concrete gaps remained.

### 1. Editable pointer semantics were incomplete

Headings already exposed `cursor: text`, but ordinary paragraphs, empty paragraph landing space, table cells and the Source editing canvas had no explicit product contract. Applying `cursor: text` to the whole editor would be incorrect because links, task checkboxes, table controls and drag affordances must retain actionable cursors.

### 2. Delayed caret/viewport restoration could become stale

`runWhenEditorRenderComplete()` rejected callbacks for a different editor instance/document, but a slow progressive render could still complete after the user had already clicked, typed or scrolled somewhere else in the *same* document. A delayed `applyCursor`, Source-mode cursor restore or semantic viewport restore could therefore overwrite newer user intent.

## Changes

- Added scoped native text cursor rules for WYSIWYG paragraph/empty-line/list/quote/code/table editable surfaces.
- Added a scoped Source Mode I-beam on `.source-code .CodeMirror-lines`.
- Kept editor/container roots free of blanket text-cursor rules.
- Added explicit pointer cursor for rendered inline links so the surrounding editable block cannot leak the text cursor into link affordances.
- Added an editor interaction revision incremented only by trusted pointer/touch/keyboard/wheel intent.
- Delayed caret and semantic viewport restores now capture that revision and abort when newer trusted user interaction occurs.
- Added deterministic listener cleanup on editor unmount.
- Added a focused US09 contract unit spec covering pointer scoping, link click semantics, toolbar selection restore, command-palette close ordering, readiness routing and stale-restore protection.

## Acceptance mapping

- **AC-41**: existing command readiness + inline toolbar selection restoration; guarded by the US09 contract spec and existing CORRECTNESS-01 tests.
- **AC-42**: command palette executes pending mutations only after `closed`; link plain-click/Ctrl-Cmd behavior remains explicit.
- **AC-43**: async/render-complete caret and semantic viewport restores are invalidated by newer trusted interaction.
- **AC-44**: existing per-tab/Source cursor restore remains document-bound; delayed restore is now additionally user-intent-bound.
- **AC-71**: scoped WYSIWYG/Source I-beam rules; no blanket editor cursor; links and existing controls retain actionable cursors.
- **AC-72**: plain link click remains caret-placement behavior while Ctrl/Cmd-click jumps; native browser text selection/caret behavior is preserved because no custom pointer or click-positioning layer is introduced.

## Validation

Focused red signal before implementation:

- WYSIWYG editable landing surfaces lacked an explicit text-cursor contract.
- Source Mode editable surface lacked an explicit text-cursor contract.

Post-change validation: **PASS**.

- Desktop focused correctness: `correctness-01-command-focus-readiness.spec.ts` + `us09-selection-caret-contract.spec.ts` → **14/14 passed**.
- Muya selection/toolbar regression: `formatToggle.spec.ts` + `uiHandleContentKeydown.spec.ts` → **33/33 passed**, **0 unhandled errors** after applying the repository's documented minimal `packages/muya/node_modules/prismjs` compatibility path.
- Targeted ESLint for the modified Vue editor and US09 contract spec → **PASS**.

Initial validation attempts exposed only environment/bootstrap evidence: the worktree had no root dependency graph, and Muya's legacy Prism loader requires a physical package-local path. Both were resolved strictly through the documented dependency-reuse and minimal compatibility-path recipes; no product assertions or implementation were weakened.

## Learning review

Reusable lesson: document identity is necessary but not sufficient for delayed UI restoration. Any async restore that can write caret, selection or viewport state must also be invalidated by newer explicit user intent. This follows the same ownership rule already used by pending scroll restore and should be preferred over timers/debounce-based “settling” fixes.

No new global AGENTS rule was added because the principle is specific to editor restoration and is documented here rather than duplicating existing async/lifecycle guidance.
