# TypeScript

Inkiva is a pnpm monorepo. The active desktop application, Muya editor engine and website use TypeScript; the retained packages/muyajs directory is legacy JavaScript and is not the active desktop editor-engine dependency.

## Toolchain

- Node.js 20.19.0 or later.
- pnpm 10.x; the root packageManager pin is 10.33.4.
- TypeScript 6.x in the workspace.
- Vue 3 single-file components are checked with vue-tsc, not plain tsc alone.

The known-good local Windows baseline is Node.js 24.21.0, pnpm 10.33.4 and Python 3.12.x. See the repository environment guide for native build prerequisites.

## Package boundaries

| Package | Language and responsibility |
|---|---|
| packages/desktop | TypeScript and Vue 3; Electron main, preload, renderer, shared contracts and desktop UI |
| packages/muya | TypeScript; active Markdown/editor engine exported as @muyajs/core |
| packages/muyajs | Legacy MarkText-era JavaScript package; not the active desktop runtime dependency |
| packages/website | TypeScript/React and Next.js website, including documentation rendering |

Keep types with the package and domain that owns the behavior. Do not move desktop-specific Electron types into the Muya engine.

## Type ownership

- **packages/muya/src/** owns the editor engine's public and internal types for Markdown parsing, document/block representation, editor operations and rendering.
- **packages/desktop/src/shared/types/** owns cross-process IPC contracts and types shared by main, preload and renderer.
- **packages/desktop/src/** feature modules own their local domain types; keep a type close to its only consumer unless it is genuinely shared.
- Vue component and renderer state types belong with their renderer feature; main-process filesystem/updater types remain in the main package.

The editor engine is the authority for Markdown representation semantics. Desktop must not create a parallel parser, duplicate Muya's block model or introduce an ambient declaration that bypasses the public package boundary.

## Muya public type boundary

The active package is **@muyajs/core** in **packages/muya/**. Its package exports define the public entrypoint and declaration output. The desktop build resolves the package through the workspace and the Electron/Vite configuration; the renderer must consume the public package surface rather than reaching into arbitrary implementation files.

The architecture contract is documented in [ARCH-06 — Muya public type boundary](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/ARCH-06-MUYA-PUBLIC-TYPE-BOUNDARY.md). That contract replaces the old src/muya ambient-declaration bridge. Do not recreate the former src/types/muya.d.ts shim or point desktop imports at the retained packages/muyajs legacy package.

## IPC types

The IPC channel registry is **packages/desktop/src/shared/types/ipc.ts**. It owns channel names, directions and declared argument/return/event types. Some not-yet-migrated payloads intentionally remain unknown or broad; narrow them incrementally with focused contract tests rather than claiming every existing channel is deeply typed. See [IPC](IPC.md) and [ARCH-02](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/ARCH-02-IPC-CONTRACT.md).

## Type checking

Run the root typecheck from the repository root:

~~~bash
pnpm typecheck
~~~

The root script validates architecture/type-boundary contracts, builds Muya declaration types and runs the desktop Vue/TypeScript check. Use the package-local type command only when changing Muya in isolation:

~~~bash
pnpm --filter @muyajs/core lint:types
~~~

For the complete quality gate, use:

~~~bash
pnpm check
~~~

## Practical rules

- Use **unknown** at untrusted or not-yet-migrated boundaries, then narrow it at the owning layer.
- Avoid adding **any** to bypass a missing contract; fix the contract or add a narrow adapter.
- Use vue-tsc for Vue single-file component checks.
- Keep shared IPC types in the shared contract package; do not import main-process implementation types into renderer code.
- Do not edit generated declaration output by hand.
- When changing a public package export, update the consumer and add a focused boundary test in the same change.
