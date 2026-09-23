# Architecture and release

[Back to AGENTS.md](../../AGENTS.md)

## Repository map

- `packages/desktop/`: Electron + Vue 3 application.
- `packages/muya/`: current TypeScript editor engine.
- `packages/muyajs/`: legacy engine being retired.
- `packages/website/`: website.
- `docs/`: architecture/performance/release/progress records.

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

Start here for architecture work. The audit document preserves the original planning context; when its historical roadmap conflicts with completed implementation, the ARCH-01～ARCH-08 durable documents and final closure report are authoritative.

- [Architecture audit / governance sequence](../architecture/ARCHITECTURE_AUDIT_2026-09.md)
- [ARCH-01 — Editor runtime ownership/lifecycle](../architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md)
- [ARCH-02 — IPC contract](../architecture/ARCH-02-IPC-CONTRACT.md)
- [ARCH-03 — Virtual surface contract](../architecture/ARCH-03-VIRTUAL-SURFACE-CONTRACT.md)
- [ARCH-04 — Block geometry unification](../architecture/ARCH-04-BLOCK-GEOMETRY-UNIFICATION.md)
- [ARCH-05 — Renderer event-bus contract](../architecture/ARCH-05-EVENT-BUS-CONTRACT.md)
- [ARCH-06 — Muya public type boundary / legacy cleanup](../architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md)
- [ARCH-07 — Background scheduler / services governance](../architecture/ARCH-07-BACKGROUND-SCHEDULER.md)
- [ARCH-08 — Legacy patch debt / boundary closure](../architecture/ARCH-08-LEGACY-PATCH-CLOSURE.md)
- [ARCH-01～08 final closure report](../architecture/ARCH-08-ARCHITECTURE-GOVERNANCE-CLOSURE-REPORT.md)
- [PR-C performance/virtualization change ledger](../perf-pr-c-change-ledger.md)

When a new architecture-governance task is completed, link its durable document here and from root `AGENTS.md` if it is a primary entrypoint.

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
