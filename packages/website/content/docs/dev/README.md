# Developer Documentation

Inkiva is a pnpm monorepo. Run workspace commands from the repository root unless a command explicitly names a package directory.

## Workspace map

- **packages/desktop/** — Electron desktop application: main process, sandboxed preload, Vue 3 renderer, shared process contracts and desktop tests.
- **packages/muya/** — active TypeScript Markdown/editor engine published inside the workspace as **@muyajs/core**.
- **packages/muyajs/** — legacy MarkText-era JavaScript package retained for compatibility/reference; it is not the desktop application's active editor-engine dependency.
- **packages/website/** — Next.js product website and the source for the public user/developer documentation.

The active desktop editor uses the TypeScript Muya package. Do not use the old single-package src/main, src/renderer or src/muya layout as a description of the repository root.

## Prerequisites

- Node.js **20.19.0 or later**.
- pnpm **10.x**. The root package manifest pins **10.33.4** through its packageManager field.
- Python **3.12 or later** for native modules.
- Windows: Visual Studio 2022 Build Tools with the required MSVC C++ components.
- macOS: Xcode Command Line Tools.

The known-good local Windows baseline recorded by the repository is Node.js 24.21.0, pnpm 10.33.4 and Python 3.12.x. CI pins its own versions: the default setup action uses Node 22.21.1, while the release workflow currently overrides it to Node 24.14.1. Check the workflow files before changing these pins.

## Clone and install

~~~bash
git clone https://github.com/Bulls1986/Inkiva.git
cd Inkiva
corepack enable pnpm
pnpm install
~~~

On Windows, install the Visual Studio 2022 C++ build tools before installing dependencies. See the repository [environment guide](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/ENVIRONMENT.md) for the exact native-toolchain checklist.

## Development

~~~bash
pnpm run dev
~~~

Run the desktop application from the workspace root. The desktop package owns the Electron main/preload/renderer build; the website and Muya engine are separate workspace packages.

When locale sources change, regenerate the minified locale bundles with the repository's minify-locales script from the workspace root.

## Build desktop packages

~~~bash
pnpm run build:win:x64
pnpm run build:mac:x64
pnpm run build:mac:arm64
~~~

The supported release targets are Windows x64 and macOS Intel/Apple Silicon. Linux is not a supported release platform.

For prerequisites, artifact layout, checksums and updater behavior, see [Build instructions](BUILD.md) and the [release process](RELEASE.md).

## Quality checks

~~~bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
~~~

Use the focused test required by the change before the broader gate. The repository's normative test-first, worktree, CI and architecture rules are in [AGENTS.md](https://github.com/Bulls1986/Inkiva/blob/develop/AGENTS.md), [Testing](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/TESTING.md) and [Architecture & release governance](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/ARCHITECTURE_RELEASE.md).

## Architecture and implementation references

- [Architecture](ARCHITECTURE.md) — current monorepo and Electron process boundaries.
- [TypeScript](TYPESCRIPT.md) — package type ownership and checking.
- [IPC](IPC.md) — renderer/main contract and preload bridge.
- [Interface](INTERFACE.md) — current desktop shell.
- [Performance testing](PERFORMANCE.md) — profiling and formal gate entry points.
