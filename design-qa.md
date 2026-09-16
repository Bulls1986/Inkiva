# Inkiva Design QA

Reference: `/workspace/scratch/cf38a48c9d4b/upload/01-1000029484.png`

Scope: reference-aligned desktop shell, editor typography and Markdown rendering, command palette, Light/Dark/Paper previews, responsive title bar/sidebar behavior, motion and accessibility safeguards.

## Retained baseline notes

- The existing New1 writing-surface baseline remains the application baseline across Light, Dark, and Paper.
- Documents, Search, Outline, More (document intelligence), and Settings remain available without a permanent icon rail or boxed utility cards.
- The website writing-surface preview remains document-first: no source pane, line numbers, bottom developer status frame, or code-editor chrome.
- Paper remains a neutral warm-gray writing surface rather than a yellow paper effect; Settings remains an unboxed lower-left sidebar action.
- Earlier website checks and the managed-browser limitation remain documented in the preceding QA history from this branch; this file's current gate below applies to the desktop implementation in this change.

## Static and contract verification

- The title bar now has the reference hierarchy: Inkiva mark, functional menu, centered command search, document/save/word status, and native window controls.
- Sidebar navigation and the document tab strip share one 50px workspace header band; the tab strip no longer becomes a second full-width application toolbar.
- The editor defaults to an editorial serif stack while preserving Markdown source mode and existing explicit user font preferences.
- Blockquotes use the reference-like quiet surface, left accent rule, and restrained italic treatment.
- Root command search combines files, headings, and commands; empty states no longer appear while results exist; clearing the query keeps Quick Open discoverable.
- Theme previews have explicit Light/Dark/Paper labels and local contrast tokens instead of inheriting the active application theme.
- Copy-code and task-list controls have button/checkbox semantics, localized accessible names, keyboard paths, and synchronized checked state.
- Responsive CSS contracts cover the 550px minimum-window intent, 600/820/1000/1100px title-bar reductions, and the single-sidebar model.

## Automated evidence

- Desktop unit suite: 139 files, 1112 tests passed.
- Targeted reference/title-bar/command-palette tests: passed.
- Desktop and Muya TypeScript checks: passed.
- Desktop Electron-Vite build: passed.
- Muya Vite build: passed with existing declaration-generation diagnostics in `dompurify.ts` and `utils/prism/index.ts`; direct typecheck passes.
- Changed-file lint: passed with the existing `vue/no-v-html` warning in the theme preview, which is intentionally sanitized/controlled by the existing preview pipeline.
- Locale contract validation and `git diff --check`: passed.

## Runtime visual gate

Real Electron launch was attempted after building. The container cannot complete the gate because the native `ced` binding is unavailable after dependency scripts were skipped/failed, and the environment has no X server/`$DISPLAY`. Chromium/Xvfb is also unavailable. Therefore post-change runtime screenshots were not captured here, and this is not a visual-pass claim.

Required follow-up in a real desktop environment: capture Light, Dark, Paper, source mode, command palette with file/heading results, focused controls, and widths around 550/768/1000/1536px; verify native menus, window controls, overlay sidebar, tab alignment, caret/scroll behavior, and reduced-motion behavior.

final result: blocked
