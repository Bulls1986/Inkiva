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

## Architecture governance documents

Start here for architecture work:

- [Architecture audit / governance sequence](../architecture/ARCHITECTURE_AUDIT_2026-09.md)
- [ARCH-01 — Editor runtime ownership/lifecycle](../architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md)
- [ARCH-02 — IPC contract](../architecture/ARCH-02-IPC-CONTRACT.md)
- [ARCH-03 — Virtual surface contract](../architecture/ARCH-03-VIRTUAL-SURFACE-CONTRACT.md)
- [ARCH-05 — Renderer event-bus contract](../architecture/ARCH-05-EVENT-BUS-CONTRACT.md)
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
