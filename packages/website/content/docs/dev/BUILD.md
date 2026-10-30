# Build Instructions

Inkiva is a pnpm workspace. Run install, development and desktop build commands from the repository root.

## Supported release targets

- Windows x64
- macOS Intel x64
- macOS Apple Silicon arm64

Linux is not a supported release or acceptance target.

## Prerequisites

- Node.js **20.19.0 or later**.
- pnpm **10.x**; the root packageManager pin is **10.33.4**.
- Python **3.12 or later** for native modules.
- Windows: Visual Studio 2022 Build Tools with the required MSVC C++ Spectre-mitigated libraries and Windows SDK.
- macOS: Xcode Command Line Tools.

The known-good local Windows baseline is Node.js 24.21.0, pnpm 10.33.4 and Python 3.12.x. CI may pin different Node versions for test/build and release jobs; the workflow files are authoritative for CI.

## Workspace packages

- **packages/desktop/** — Electron shell and renderer.
- **packages/muya/** — active TypeScript editor engine, consumed as the workspace package **@muyajs/core**.
- **packages/muyajs/** — legacy MarkText-era JavaScript package; not the active desktop editor-engine dependency.
- **packages/website/** — Next.js website and documentation.

## Install

~~~bash
corepack enable pnpm
pnpm install
~~~

On Windows, install the native build tools before running pnpm install.

## Development build

~~~bash
pnpm run dev
~~~

## Production desktop packages

Run the target-specific command from the repository root:

~~~bash
pnpm run build:win:x64
pnpm run build:mac:x64
pnpm run build:mac:arm64
~~~

Artifacts are written under the desktop package's dist output. Release builds also validate updater metadata and checksums; see [Release process](RELEASE.md).

## Quality checks

~~~bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
~~~

For architecture and release qualification, follow the [testing contract](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/TESTING.md) and [architecture/release governance](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/ARCHITECTURE_RELEASE.md). A successful local build alone is not release acceptance.

See [Performance testing](PERFORMANCE.md) for the distinction between manual profiling and formal performance gates.
