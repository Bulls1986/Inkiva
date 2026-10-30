# D02 — Developer documentation refresh

- Date: 2026-10-30
- Status: **merged**
- Repository: https://github.com/Bulls1986/Inkiva
- Base: develop at **d334e029463a35cdac73f5b5f0120c6b19fcb9f0**
- Branch: docs/d02-developer-docs
- PR: [#269 — refresh current developer documentation](https://github.com/Bulls1986/Inkiva/pull/269)
- Merge commit: **3b125f4cd8bcf40719fa93a18fb22aa331d7681d**
- Scope: public developer manuals and one supported-platform correction in the user keybinding reference
- Non-goals: no runtime, build configuration, CI workflow or release process changes

## 1. Source-backed corrections

The old developer pages described the former single-package MarkText layout. The current workspace is a pnpm monorepo:

- packages/desktop contains Electron main, sandboxed preload, Vue 3 renderer and shared process contracts.
- packages/muya is the active TypeScript editor engine consumed as @muyajs/core.
- packages/muyajs is retained legacy MarkText-era JavaScript; it is not the desktop application's active editor-engine dependency.
- packages/website contains the Next.js website and public documentation source.

The desktop BrowserWindow enables context isolation and sandboxing and disables Node integration. The preload entrypoint is packages/desktop/src/preload/index.ts; cross-process channel contracts live in packages/desktop/src/shared/types/ipc.ts. The IPC documentation distinguishes typed channel signatures from legacy payloads that remain unknown or broad, consistent with ARCH-02.

The package root requires Node.js 20.19.0 or later and pnpm 10.x, with pnpm 10.33.4 pinned. The repository's known-good local Windows baseline is Node.js 24.21.0, pnpm 10.33.4 and Python 3.12.x. CI-specific Node pins remain workflow-owned values.

Linux is not a supported release target. The interface and keybinding manuals no longer describe Linux behavior as a supported platform.

## 2. Pages updated

- dev/README.md — workspace map, toolchain baseline, package ownership and links to current governance.
- dev/BUILD.md — supported platforms, monorepo packages, prerequisites and root build commands.
- dev/DEBUGGING.md — current package paths, sandbox boundary and inspector/profiling commands.
- dev/ARCHITECTURE.md — current monorepo, Electron process model, Muya ownership and website boundaries.
- dev/INTERFACE.md — current shell and Windows/macOS titlebar behavior; removes Linux support implication.
- dev/IPC.md — current contract owners, preload bridge, channel categories and partial-typing caveat.
- dev/TYPESCRIPT.md — current TypeScript packages, public Muya type boundary and typecheck commands.
- dev/PERFORMANCE.md — current Fast Gate/formal gate commands separated from manual profiling.
- end-user/KEYBINDINGS.md — Windows/macOS-only platform labels.

The release procedure page was intentionally assigned to D03 and is now covered by the follow-up release/process documentation stage.

## 3. Validation

- Re-read AGENTS.md, docs/agent/WORKFLOW.md, architecture/release governance, testing, environment and performance contracts before editing.
- Source-checked package manifests, TypeScript configs, Electron/Vite aliases, BrowserWindow security settings, preload exports and the IPC type registry.
- Public docs navigation: **32/32 registered source pages exist**.
- Renderer-aware link validation checked **77 relative links and 17 image references** across the 32 public pages; zero unresolved relative targets and zero missing assets.
- CRLF-aware Git whitespace validation passed; no trailing spaces or extra blank lines at EOF.
- Local website build/test and desktop test suites were not run because the D02 worktree had no node_modules.
- Official PR #269 CI: **11/11 checks passed** — Windows x64, macOS x64 and macOS arm64 build jobs; three platform package-smoke jobs; updater artifact smoke; E2E; Lint; Test; and artifact-link publication.
- Website deployment after merge also passed: [workflow run 41021786054](https://github.com/Bulls1986/Inkiva/actions/runs/41021786054).

## 4. Merge and handoff

GitHub reports PR #269 merged. The authoritative remote develop ref was fetched and verified at the merge commit **3b125f4cd8bcf40719fa93a18fb22aa331d7681d**.

D02 updates public developer guidance only. D03 closes the v0.6.0 release/process audit and release instructions. D04 owns detailed end-user feature procedures, screenshot freshness and remaining stale package-level README content. D05 owns Chinese documentation parity. D06 owns automated documentation link/anchor/asset validation.