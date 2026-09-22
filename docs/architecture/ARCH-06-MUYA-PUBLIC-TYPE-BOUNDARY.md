# ARCH-06 — Muya Public Type Boundary & Legacy Cleanup

## Goal

Make desktop consume the real public TypeScript surface of `@muyajs/core` instead of permissive desktop-owned declarations, and remove the unused legacy `@marktext/muyajs` dependency/aliases.

## Baseline

- Branch: `arch/06-muya-public-types`
- Base: remote `develop` at `7f1e1e949b749108ea92552cb9fe996915730e3a`
- Audit source: `docs/architecture/ARCHITECTURE_AUDIT_2026-09.md`

## Stage 1 — audit and red contract

Observed before production changes:

- `packages/muya/package.json` declared `types: ./lib/types/index.d.ts`, and the Vite build already emitted declarations into `lib/types`.
- The development `exports["."]` still pointed directly at `./src/index.ts`.
- Desktop redirected `@muyajs/core` to `src/types/muya-core.d.ts`, whose `Muya` class had a permissive `[key: string]: any` surface and whose UI plugins were all `any`.
- Desktop still declared an unused legacy `muya/* -> ../muyajs/*` path, Vite/Vitest aliases, `@marktext/muyajs` dependency, and `src/types/muya.d.ts`, despite no production/test imports remaining under `packages/desktop`.
- The normal desktop CI typecheck did not build Muya declarations first, while the Muya-only CI path did not typecheck desktop as a consumer.

Focused red gate:

`node --test scripts/muya-public-type-boundary.test.mjs`

The test failed on the development package export because `exports["."]` was still `"./src/index.ts"`.

## Stage 2 — implementation

- Development package export now separates runtime and type resolution:
  - `types -> ./lib/types/index.d.ts`
  - `import/default -> ./src/index.ts`
- Desktop-owned `@muyajs/core` shim and its tsconfig path override are removed.
- Unused legacy `@marktext/muyajs` dependency, `muya/*` TypeScript alias, Vite/Vitest aliases, exclusion, and permissive declaration bridge are removed.
- Root `typecheck` now runs the architecture contract, builds `@muyajs/core` declarations via `build:types`, then typechecks desktop.
- Muya build CI now additionally runs the boundary contract and desktop typecheck against the freshly built declarations.

## Stage 2.1 — declaration build baseline repair

The first real Muya `tsc` validation exposed a pre-existing build-contract drift on both the ARCH-06 worktree and the develop donor checkout: source/tests use `Array.prototype.at`, while `packages/muya/tsconfig.json` still declared `target/lib = ES2020`. The same six `TS2550` errors reproduce against the develop checkout, so this was not caused by removing the desktop shim.

A focused architecture-contract assertion was added first and confirmed red on `ES2020`; Muya's compiler target/lib are now `ES2022`, matching the APIs already used by the codebase and the desktop Electron runtime.

The full local Vite+dts build is not a suitable prerequisite for desktop type checking: on the Windows donor dependency graph it can fail or stall in the declaration plugin before reaching Muya source. ARCH-06 therefore adds a deterministic `build:types` script using TypeScript declaration-only emit. Root `typecheck` uses this minimal type artifact contract; the existing full Muya Vite build remains an independent CI gate.

## Stage 2.2 — hidden contract drift exposed by real declarations

Once desktop consumed the generated declarations, the former permissive shim exposed three real contract defects:

- `Muya.use()` erased plugin option types to `Record<string, unknown>` and assumed every plugin had a static `pluginName`. The registration contract is now generic and stores a typed instantiation closure; `ParagraphFrontButton` now has a stable `pluginName`.
- `ImageEditTool` required callers to provide BaseFloat placement/arrow options even though the constructor supplies defaults. Public registration options are now partial; the instance retains a fully resolved internal options type.
- `mt::ask-for-image-path` actually returns one `string` from the main process, but the shared IPC contract and editor store declared `string[]`. The shared typed IPC boundary and store now match the real handler, preserving ARCH-02 rather than adding a UI workaround.

Declaration emit also found two portability leaks: DOMPurify's inferred overload exposed `TrustedHTML` through a pnpm-internal path, and Prism's exported `loadLanguage` referenced a private status interface. Both now have explicit, nameable public types.

## Validation

Local evidence completed:

1. `node --test scripts/muya-public-type-boundary.test.mjs` — green (`1/1`).
2. Muya source `tsc --noEmit` — green after the pre-existing ES2020→ES2022 baseline correction.
3. declaration-only emit — green and produces `packages/muya/lib/types/index.d.ts` from the current worktree.
4. desktop `vue-tsc --noEmit` — green while `@muyajs/core` is resolved to the current worktree package and its generated declarations; no desktop shim is present.
5. repository search — no remaining desktop `@marktext/muyajs`, `../muyajs`, `muya/*`, or `declare module '@muyajs/core'` references.

Local Vitest runtime suites could not start because the donor dependency graph is incomplete: Vitest resolves a `tinyexec` pnpm link whose package payload lacks `index.js`/package contents. Both Muya and desktop Vitest fail before test discovery, so this is environment evidence under `docs/agent/ENVIRONMENT.md`, not a product failure. Clean CI must provide the runtime-test/full-build evidence before merge.

## Resume point

Implementation and local type-boundary validation are complete. Next steps are diff review, commit/push, PR CI, then final closeout. Do not recreate a permissive desktop declaration to fix downstream compile errors; fix the Muya public API type surface or the consumer code instead.
