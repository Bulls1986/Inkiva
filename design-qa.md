# Design QA — Writing surface refresh

Date: 2026-09-16

## Scope

- New1 layout retained as the application baseline.
- Light, Dark, and Paper appearances use the same document-first writing shell.
- Documents, Search, Outline, More (document intelligence), and Settings remain available without a permanent icon rail or boxed utility cards.
- The main surface is an article-reading and writing canvas; code blocks remain supported by the editor but are not the visual language of the shell or website preview.
- The website hero preview mirrors the approved writing surface and contains no source pane, line numbers, or bottom developer status frame.

## Verification

| Area | Check | Result |
| --- | --- | --- |
| Desktop renderer | `pnpm --filter inkiva typecheck` | Pass |
| Desktop renderer | `pnpm --filter inkiva build` | Pass |
| Desktop UI contracts | 8 focused Vitest files, 50 tests | Pass |
| Website | `pnpm --filter inkiva-website type-check` | Pass |
| Website | `pnpm --filter inkiva-website lint` | Pass |
| Website | `pnpm --filter inkiva-website exec next build` | Pass |
| Website tests | `pnpm --filter inkiva-website test` | Blocked before test discovery by the same managed `tsx` IPC `EPERM` restriction |
| Website preview content | English and Chinese static exports contain `data-preview="writing-surface"` and article content | Pass |
| Browser visual capture | `http://terminal.local:4173/` | Blocked by managed browser with `ERR_BLOCKED_BY_CLIENT`; static export and production build were verified instead |
| Electron E2E | Playwright launch | Blocked by managed Linux environment: missing native `ced` binding and X server/display |

## Acceptance notes

- No `.status-bar`, line/column indicator, source-code pane, or code block is rendered in the main website preview.
- Paper remains a neutral warm-gray writing surface rather than a yellow paper effect.
- Settings is still present at the lower-left of the sidebar as an unboxed action.
- The sidebar width is kept compact, with labels attached to the actual navigation functions so Outline remains discoverable.
