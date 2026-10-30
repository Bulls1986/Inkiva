# Performance Testing

This page covers manual profiling and the entry points for local performance investigation. The normative thresholds, fixtures, Fast Gate policy and release qualification rules live in the [performance contract](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/PERFORMANCE.md) and [performance index](https://github.com/Bulls1986/Inkiva/blob/develop/docs/performance/README.md). Read those before changing a performance gate.

## Current gate commands

Run from the repository root:

~~~bash
pnpm test:perf:fast
pnpm test:e2e:perf:fast
pnpm test:perf:gate
pnpm test:e2e:gate
pnpm test:e2e:gate:large
~~~

- **test:perf:fast** runs the fast policy/evaluator unit checks.
- **test:e2e:perf:fast** runs the Electron performance smoke gate.
- **test:perf:gate** runs the formal threshold evaluator suite.
- **test:e2e:gate** runs the standard formal Electron gate.
- **test:e2e:gate:large** runs the large-document qualification gate.

A Fast Gate is a bounded PR signal, not a substitute for the formal release qualification matrix. Preserve fixture identity, environment details, raw measurements and the gate verdict when recording evidence.

## Inspect the main process

Electron has separate main, preload and renderer processes. Use the main-process profiler when investigating startup, filesystem orchestration or main-thread blocking.

~~~bash
pnpm perf:inspect-brk
~~~

This pauses at startup so Chrome DevTools can attach to the main process inspector on port 5858.

For the same profile without the initial breakpoint:

~~~bash
pnpm perf:inspect
~~~

## Inspect the renderer

Launch the development application with **pnpm run dev**, open **View → Toggle Developer Tools**, select the Performance panel and record the interaction under investigation.

For a production-like preview, build first and then run:

~~~bash
pnpm run build:unpack
pnpm run start
~~~

The start command previews the most recent unpacked build with performance-testing behavior enabled; it does not rebuild changed sources. Re-run the build command after source changes.

## Measurement discipline

- Use the same fixture, build mode and interaction sequence when comparing commits.
- Record OS, CPU, memory, display scale, Node/Electron versions and whether the run is cold or warm.
- Separate main-process, renderer and filesystem costs; do not infer one from another.
- Report p50/p95/p99 and sample count where the gate defines them; retain raw output.
- Do not relax a threshold or substitute a smoke run for a formal gate without the required architecture/release approval.

See the [performance contract](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/PERFORMANCE.md) for current limits and the [benchmark index](https://github.com/Bulls1986/Inkiva/blob/develop/docs/benchmark/README.md) for measurement provenance.
