# Project Architecture

Inkiva is a pnpm monorepo. The desktop product is an Electron application whose editor engine is a separate TypeScript workspace package. The website and the retained legacy editor package are separate from the active desktop runtime.

## Workspace layout

~~~text
Inkiva/
├── packages/
│   ├── desktop/
│   │   ├── src/common/       # shared non-Electron helpers
│   │   ├── src/main/         # Electron main process and OS integration
│   │   ├── src/preload/      # sandboxed contextBridge APIs
│   │   ├── src/renderer/     # Vue 3 desktop UI and editor integration
│   │   └── src/shared/       # cross-process contracts and shared types
│   ├── muya/                 # active TypeScript editor engine (@muyajs/core)
│   ├── muyajs/               # legacy MarkText-era JavaScript package
│   └── website/              # Next.js website and documentation
├── docs/                     # engineering, architecture and product contracts
└── package.json              # pnpm workspace scripts and toolchain pins
~~~

The active desktop package depends on **@muyajs/core** from packages/muya. The packages/muyajs directory is retained legacy code; it is not the desktop application's active editor-engine dependency. New desktop editor work belongs in the active packages/muya package or the desktop integration layer, according to the ownership boundary.

## Electron process model

### Main process

The main process lives under **packages/desktop/src/main/**. It owns Electron application lifecycle, BrowserWindow creation, native menus/dialogs, filesystem operations, updater integration and main-side IPC handlers. Keep long-running CPU or synchronous work off the main event loop.

### Preload

The preload entrypoint is **packages/desktop/src/preload/index.ts**. It runs across the renderer boundary and exposes narrow APIs through contextBridge. It is the supported route from renderer UI to privileged Electron/Node capabilities.

### Renderer

The renderer lives under **packages/desktop/src/renderer/** and uses Vue 3 and Pinia for the desktop UI. It owns tabs, sidebar panels, settings and view state. It integrates the formatted WYSIWYG surface with the raw Markdown source editor (CodeMirror).

The renderer is sandboxed: context isolation and sandboxing are enabled, and Node integration is disabled. Renderer modules must not import Electron main-process APIs directly.

## Editor engine and document ownership

The active editor engine is **packages/muya/**, exposed as the workspace package **@muyajs/core**. Its TypeScript source owns Markdown parsing/serialization, block/document representation, WYSIWYG editing operations and editor-level behavior.

The desktop integration owns window/tab lifecycle, file identity, persistence and coordination between the WYSIWYG and Source surfaces. The editor engine remains the authority for Markdown representation semantics; desktop code must not create a second parser or competing document model.

The Source editor is a separate editing surface over the same document revision, not a second document authority. Mode transitions, caret/viewport continuity and lifecycle ownership are governed by the product and architecture contracts.

## Website

**packages/website/** is the Next.js website. Its Markdown documentation source is in **packages/website/content/docs/** and the route/sidebar registry is in **packages/website/src/lib/docs-nav.ts**. Website content is not part of the desktop runtime package.

## Architecture references

The durable package and process boundaries are governed by:

- [Architecture index](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/README.md)
- [Editor runtime boundary](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md)
- [IPC contract](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/ARCH-02-IPC-CONTRACT.md)
- [Muya public type boundary](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md)
- [Architecture and release governance](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/ARCHITECTURE_RELEASE.md)
