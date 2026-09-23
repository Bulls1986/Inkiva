# Testing contract

[Back to AGENTS.md](../../AGENTS.md)

Testing is part of implementation.

## Red/green discipline

1. Write or adjust the focused regression test first.
2. Confirm the runner starts, discovers the intended test, and the assertion fails for the product behavior.
3. Only then change production code.
4. Make the focused test green.
5. Run broader regression/E2E gates required by the affected subsystem.

Environment/bootstrap failure, missing dependencies, “0 tests”, or runner startup failure is not red product evidence. See [ENVIRONMENT.md](ENVIRONMENT.md).

Never weaken assertions, remove scenarios, lower thresholds, or alter workloads to make a change pass.

## Lifecycle and memory evidence

For lifecycle/memory work, prove owner closure before interpreting process-memory numbers:

1. Prefer deterministic resource assertions such as listener/timer/task/instance/registry counts and stale-callback rejection.
2. Reproduce a product red test only after the intended test body is discovered and running; bootstrap/native-addon/runner failures are environment evidence.
3. Warm up JIT, lazy initialization and bounded product caches before measuring memory cycles.
4. When test-only GC is explicitly available, compare a multi-cycle post-GC series and growth trend; do not diagnose a leak from one before/after heap or RSS delta.
5. Distinguish reachable JS retention from expected cache, V8/Chromium allocator retention, native memory and environment noise.
6. If a broad gate fails outside the changed area, run the identical gate on the clean base before classifying it as a regression.

## Test layers

Use what the task requires:

- unit;
- integration;
- Electron E2E;
- packaged integration;
- release artifact contract;
- performance gate;
- stability/memory.

Typical commands:

```bash
corepack pnpm run test
corepack pnpm run test:unit
corepack pnpm run test:e2e
corepack pnpm run lint
corepack pnpm run typecheck
```

Focused Vitest:

```bash
corepack pnpm -C packages/muya exec vitest run <spec>
# or desktop package when applicable
corepack pnpm -C packages/desktop exec vitest run <spec>
```

Focused Playwright:

```bash
corepack pnpm -C packages/desktop exec playwright test <spec>
```

For editor correctness, explicitly cover selection/caret, IME, undo/redo, scrolling, outline/TOC, source mode, view modes, images/diagrams, and responsive behavior when affected.
