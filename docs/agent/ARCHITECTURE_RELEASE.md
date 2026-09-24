# Architecture and release

[Back to AGENTS.md](../../AGENTS.md)

## Repository map

- `packages/desktop/`: Electron + Vue 3 application.
- `packages/muya/`: current TypeScript editor engine.
- `packages/muyajs/`: legacy engine being retired.
- `packages/website/`: website.
- `docs/`: architecture/performance/release/progress records.

## Pre-mutation architecture gate

For every task that can change production code, read this file before the first production mutation and identify which boundary/principle below is affected. This is a required execution gate, not optional background reading.

If the change touches an ARCH-governed subsystem, open [docs/architecture](../architecture/README.md) and read the specific durable contract before implementation. At minimum this applies to editor runtime/lifecycle, IPC/preload, virtual surface, block geometry, renderer event bus, Muya public boundary, background scheduler/services, and legacy-boundary cleanup.

At closeout, verify the diff against the identified architecture principles. If the required architecture material was not read before implementation, or the diff cannot be shown to preserve the relevant boundary, do not claim architecture-compliant closure; record the process gap and correct it before merge when possible.

## Architecture boundaries

- Main: Node/Electron APIs, filesystem, native windows, updater.
- Preload: controlled bridge.
- Renderer: Vue 3 + Pinia and editor interaction.
- Cross-process contracts/types: `packages/desktop/src/shared/types/`.
- Keep renderer access behind approved IPC/preload boundaries.
- Do not add blocking background work to editor hot paths.
- Prefer coherent architecture fixes over additional patch layers.

Use current source as authority when an older document conflicts with implementation.

## Architecture principles after ARCH-01～ARCH-08

These are the durable architecture constraints after governance closure:

1. Vue owns presentation and bindings; `DocumentEditorRuntime` owns the high-level editor lifecycle.
2. Muya owns authoritative document semantics; renderer projections must not become a second source of truth.
3. Document revision advances only through the runtime; derived services stay revision-aware and one-way.
4. `DocumentSurface` is the stable renderer boundary for virtualization; desktop code must not depend on private virtual-window state.
5. Logical block geometry has one authoritative propagation chain; diagram/image/table reflow must flow through top-level block geometry.
6. Renderer-to-main communication goes through preload domain APIs and typed IPC contracts; do not add raw channel-string escape paths.
7. Critical renderer events use explicit typed contracts; generic event-bus use is limited to low-risk UI signaling.
8. Background work must be prioritized, cancellable where appropriate, observable, and kept off editor hot paths.
9. Durability work such as autosave keeps independent per-document ordering, single-flight, and revision acknowledgement semantics.
10. Legacy guards/workarounds may be removed only with evidence and regression coverage, and must never bypass established architecture boundaries.
11. User documents remain standard Markdown; Inkiva-specific indexes/projections must not redefine document ownership.
12. Correctness and stability outrank benchmark cosmetics; performance changes require evidence and unchanged validation rigor.

## Architecture governance documents

Architecture history and durable ARCH contracts are indexed in [docs/architecture](../architecture/README.md). Open that index only for architecture/governance work, then load the specific contract or audit needed by the affected subsystem.

Performance/virtualization history is kept separately in [docs/performance](../performance/README.md); do not mix performance history into the architecture first-load contract.

## Code conventions

- TypeScript strict mode.
- 2-space indentation.
- no semicolons.
- single quotes.
- comments follow [.github/COMMENTING-GUIDELINES.md](../../.github/COMMENTING-GUIDELINES.md) and explain rationale/invariants rather than restating code.

## Release / PR discipline

- PR base is normally `develop`.
- one PR = one clear objective.
- validate dependent PR chains in order.
- do not claim completion before required final gates pass.
- do not claim merge before GitHub reports merged.
- release work verifies required tests, packaging, updater/artifact contracts, version/docs consistency, and current platform targets.
