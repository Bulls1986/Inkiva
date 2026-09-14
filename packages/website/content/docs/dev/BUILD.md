# Build Instructions

Inkiva's supported release targets are Windows x64 and macOS Intel/Apple Silicon. The CI workflows build each target on its native runner; local development can use either supported desktop OS.

## Prerequisites

- Node.js `>=20.19.0` and pnpm `>=10`
- Python `>=3.12` for native modules
- A C++ compiler and the platform development tools
- On Windows, Visual Studio 2022 Build Tools with the spectre-mitigated MSVC libraries
- On macOS, Xcode Command Line Tools

## Clone and install

```sh
git clone https://github.com/Bulls1986/Inkiva.git
cd Inkiva
pnpm install
```

## Development build

```sh
pnpm run dev
```

The main and preload processes need a reload after their source changes. The renderer is hot-loaded, but a full reload is useful after changing editor state or services.

## Production packages

Run the target-specific command for the OS and architecture you want to validate:

```sh
pnpm run build:win:x64
pnpm run build:mac:x64
pnpm run build:mac:arm64
```

Artifacts are written to `dist/`. Release builds also validate updater metadata and SHA-512 hashes; see [Release process](RELEASE.md).

## Quality checks

```sh
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:e2e
```

See [Performance testing](PERFORMANCE.md) for startup, typing, autosave, recovery, and soak measurements.
