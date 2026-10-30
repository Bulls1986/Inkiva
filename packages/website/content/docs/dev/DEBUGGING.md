# Debugging

## VS Code

Use the repository's **Debug Inkiva** launch configuration. Set breakpoints in the package source under **packages/desktop/src/**; do not look for a repository-root src/main or src/renderer directory.

The main process owns Electron windows, native dialogs, filesystem access and updater integration. Renderer breakpoints belong under **packages/desktop/src/renderer/**. Preload bridge code is under **packages/desktop/src/preload/**.

## Chrome Developer Tools

In development mode, use **View → Toggle Developer Tools** or attach Chrome DevTools to the inspector ports:

- Main process: **5858**
- Renderer process: **8315**

Start the application from the repository root:

~~~bash
pnpm run dev
~~~

The renderer is sandboxed. Do not enable Node integration or import Electron directly from renderer code to make debugging easier; use the preload bridge and its typed APIs.

## Debug a built application

Use Electron's standard inspector arguments when launching a packaged/development executable:

~~~bash
inkiva --inspect=5858 --remote-debugging-port=8315
~~~

Attach to the main process on port 5858 and the renderer on port 8315.

## Diagnose slow startup

For a main-process startup profile, use the repository scripts:

~~~bash
pnpm perf:inspect-brk
pnpm perf:inspect
~~~

The first command pauses at startup for attachment; the second starts without the initial breakpoint. For renderer typing, scrolling and large-document measurements, use the formal procedures and fixtures in [Performance testing](PERFORMANCE.md) and the canonical [performance contract](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/PERFORMANCE.md).
