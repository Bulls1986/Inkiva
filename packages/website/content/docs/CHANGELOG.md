## v0.6.0 — Document navigation and asset experience

Published 2026-10-29.

**Features**

- Workspace-aware relative Markdown link indexing and backlinks, including navigation to the source occurrence.
- Link candidate completion and deliberate cross-document or heading navigation.
- Broken local-link diagnostics with explicit, guarded repair rather than silent source rewrites.
- Safer rename/move reference repair with conflict handling and recovery.
- Image insertion and paste improvements, safer relative paths, relinking and missing-resource recovery.
- Outline keyboard/focus correctness, table regression fixes and workspace lifecycle hardening.

**Compatibility and release**

- Markdown files remain the source of truth. No proprietary wiki syntax or separate document database is introduced.
- Official desktop packages are published for Windows x64 and macOS Intel/Apple Silicon.
- macOS packages are unsigned and not notarized. Gatekeeper may require an explicit first-launch approval; follow the instructions on the [v0.6.0 release page](https://github.com/Bulls1986/Inkiva/releases/tag/v0.6.0).

## v0.5.0 — Reliability and workspace experience

Published 2026-10-08.

- Added crash recovery for untitled drafts and safer Local History restore.
- Improved workspace/session restore, file identity across rename/move, and recovery of unsaved work.
- Improved input/IME continuity, selection and caret predictability, inline syntax fidelity, and Source/WYSIWYG continuity.
- Strengthened operation-based Undo grouping, structured-block keyboard editing, and table editing correctness.
- Added Focus and Typewriter writing-view stability.

See the [v0.5.0 release](https://github.com/Bulls1986/Inkiva/releases/tag/v0.5.0).

## v0.4.1 — Architecture, stability and performance

Published 2026-09-24.

- Improved large-document activation and renderer/editor performance.
- Strengthened editor runtime boundaries, typed IPC contracts, event-bus ownership, virtual-surface behavior and background scheduler lifecycle.
- Improved command focus readiness, async geometry stability, benchmark trustworthiness and lifecycle/memory ownership.
- Added architecture and correctness governance to make future changes more predictable.

See the [v0.4.1 release](https://github.com/Bulls1986/Inkiva/releases/tag/v0.4.1).

## v0.4.0 — Desktop UX and rendering improvements

Published 2026-09-21.

- Refined the desktop titlebar, editor layout and document status presentation.
- Improved manual-save/autosave ordering and unsaved-close protection.
- Added top-level block virtualization and improved virtualized scrolling with asynchronous diagrams.
- Improved settings persistence and website metadata/canonical URLs.

See the [v0.4.0 release](https://github.com/Bulls1986/Inkiva/releases/tag/v0.4.0).

## v0.3.0

Inkiva's document-first release. The editor keeps standard Markdown files and folders at the center of the workflow.

**Features**

- Recent documents and folders on the welcome surface, with pin, remove, clear, and reveal actions.
- Quick Open, document tabs, optional two-pane comparison, outline navigation, and folder-wide Markdown search.
- Standard Markdown links, backlinks, image paths, tables, diagrams, and code blocks remain portable.
- Local history, autosave/recovery protection, updater validation, and release artifact checks are part of the quality gate.
- Official desktop packages are published for Windows x64 and macOS Intel/Apple Silicon.

**Compatibility**

- Existing CommonMark/GFM documents remain plain Markdown; Inkiva does not add Wiki Links, hidden markers, or a workspace database.
- macOS packages are currently unsigned/not notarized; Gatekeeper may require an explicit first launch approval.

## v0.2.0

- Established the Inkiva brand, three application appearances, and a neutral Paper surface.
- Added reliable session restore, autosave queueing, updater state handling, performance checks, and the initial Windows/macOS packaging contract.

## v0.1.0

- Initial Inkiva desktop release with WYSIWYG Markdown editing, source mode, folder browsing, export, themes, and standard Markdown compatibility.