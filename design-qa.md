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

Real Electron launch was attempted locally after building. The managed container cannot complete that gate because the native `ced` binding/display dependencies are unavailable, and its browser blocks local URLs. Runtime evidence was therefore collected from the PR's Ubuntu Electron runner instead of treating local build output as a visual pass.

The remote acceptance run executed the desktop suite with 288 tests passing and 11 skipped; the only failure was the Light screenshot comparison against the pre-redesign sans-serif snapshot. The captured Light, Dark, Paper, 550px, 768px, command-palette, sidebar, preferences, dialog, toast, and Markdown candidates were reviewed against the supplied reference. The editorial serif document layer, quiet quote surface, shared workspace header, compact title-bar behavior, and application chrome hierarchy match the intended direction; the old PNGs were stale baselines rather than a product regression.

Required final gate: commit the reviewed candidates, rerun the remote desktop E2E suite, and retain the screenshot evidence with the PR.

## Acceptance run — 2026-09-17

- Fixed the custom title-bar word counter so the existing W/P/C/A modes remain visible, keyboard-accessible, and covered by the desktop E2E selectors.
- Fixed public undo/redo to flush a pending contenteditable input before changing history; added a regression test for undo/redo immediately after a queued edit.
- Stabilized Muya E2E caret initialization and whitespace caret placement after the editorial serif font change.
- Rebased the desktop visual-regression PNGs from the reviewed remote Electron run so Light, Dark, Paper, compact widths, overlays, and editor surfaces exercise the current reference-aligned UI.
- Local evidence: desktop typecheck passed; Muya typecheck passed; focused desktop contracts passed (23 tests); focused Muya core tests passed (59 tests); Muya flush/history regression tests passed (15 tests); desktop and Muya builds completed successfully.
- Runtime acceptance is pending the fresh remote E2E result after committing the reviewed visual baselines; the managed-container launch limitation remains documented above.

final result: pending final remote CI confirmation
