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

For TOC/navigation assertions, test the contract at the correct layer. The TOC model is authoritative for full logical ordering, while virtualized DOM contains only a mounted window. Normalize rendered heading text when comparing it with clean TOC labels because ATX heading DOM may include Markdown syntax markers. After navigation, assert the requested target is actually revealed/scroll-reachable; do not require the settled viewport-active TOC slug to equal the clicked item at document boundaries where scroll clamping can select an earlier active heading.

## E2E efficiency and ownership

- Put a contract at the lowest-cost layer that can still observe the real failure mode. Keep Electron E2E for lifecycle/native-window/IPC/filesystem and real editor interaction contracts such as keyboard/focus/selection/IME/source-mode integration; do not use Electron merely to verify pure state or transformation logic.
- Before adding a regression E2E, name the contract it protects and check whether an existing unit/integration/E2E already protects the same failure mode. A new historical bug does not automatically require a new full Electron flow.
- Treat fixed sleeps as debt, not as a default readiness mechanism. Prefer observable application state, DOM conditions, IPC/events, or bounded polling. Do not delete a sleep until the replacement condition proves the same contract, especially for debounce/history/negative-condition timing windows.
- Reuse Electron lifetime only where isolation is explicit. File-level `beforeAll` reuse is acceptable when each case restores deterministic state; do not introduce cross-file process reuse merely to reduce launch count.
- Do not tune Playwright worker count or remove `serial` based on elapsed time alone. First prove tests do not share process/profile/filesystem/measurement state and that the runner has spare CPU/memory capacity.
- Keep performance sampling/diagnostic workloads out of the default correctness lane once an equivalent canonical performance lane owns them. Moving such a case is valid only when the diagnostic coverage still runs somewhere authoritative.
- Compare CI timing as a distribution, not one run. Use several same-workload successful runs (median plus range/outliers) before claiming a speedup or regression; shared runners can vary enough to invert a single before/after sample.
- Optimize setup/build duplication only after measuring the test body itself. If the test body dominates wall time, CI cache/artifact reuse is secondary and should not distract from test architecture.
