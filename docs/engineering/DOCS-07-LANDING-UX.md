# D07 — Documentation landing page and mobile navigation

Date: 2026-10-30
Base: `develop` @ `08dde4fb9ac288dfc99f297556997a00bb473f95`
Scope: public `/docs/` landing only; no desktop editor or document format changes.

## Stage 1 — User evidence and diagnosis

- The user supplied an Android browser screenshot of `inkiva.net/docs/`: a minimal left-aligned heading and two paragraphs under an already dense header, followed by nearly an entire screen of unused background.
- Source confirmed `packages/website/src/app/docs/page.tsx` had only a heading, introductory copy and one User Guide link; there was no direct Chinese/Developer entry, no thematic entry points, and no homepage-specific mobile layout.
- Root viewport metadata was already `device-width`; do **not** misdiagnose a missing viewport tag. The preexisting header collapsed search only at 760px; use smaller header spacing and keep accessible actions under that breakpoint.
- UX contract: discover user/Chinese/developer docs without hunting in the sidebar, reach common guides directly, tap targets at least 44px, no horizontal overflow at narrow widths, light/dark theme legibility, visible keyboard focus. Keep all canonical docs routes and link veracity.
- Architecture boundary: website-only server component and scoped documentation CSS. No Electron/IPC/Muya/editor runtime changes.

## Stage 2 — Test-first and implementation

- **Executable Red:** `node --experimental-strip-types --test packages/website/test/docs-home.test.ts` ran two targeted test bodies and exited 1 because `docs-home` landmark/card paths and responsive/focus CSS were absent. This was an intended product-contract failure, not missing dependencies.
- Implemented content-first landing with a focused intro, user/Chinese/developer guide cards linking to `firstPageOfTab()`, and six topic links resolved through `findPageBySlug()`. Decorative preview reuses the real v0.6.0 `inkiva-interface.png` screenshot and is not presented as mock product UI.
- Added scoped grid, light/dark token styling, keyboard focus, motion preference, tablet/mobile stacking, header compression, and mobile topic touch targets. Existing docs article layout/URLs untouched.
- **Executable Green:** the same native Node test passed 2/2, and `git diff --check` passed.

## Stage 3 — Release / QA

Local website package install was attempted from the lockfile-matching offline pnpm store with `--filter inkiva-website --offline --frozen-lockfile --ignore-scripts`, but Windows link-materialization timed out after 890/891 packages without exposing the website toolchain. This is an environment/bootstrap issue, not an executed website-build failure. Native Node targeted tests and `git diff --check` passed. Standalone `node packages/website/scripts/verify-docs-links.mjs` passed all 52 registered pages, anchors, assets and relative links. Repeated focused native Node tests passed 2/2 after the final CSS change. Pending: authoritative PR CI website tests/static build, documentation link checker, responsive visual review when runnable, diff/hygiene review and PR. Do not mark public deployment complete without proof from official website workflow and the live URL.

## Lessons

The prior /docs/ route was a placeholder rather than a navigation hub; a new documentation corpus does not improve discoverability when the index has no clear paths. Use existing navigation metadata as source of truth for homepage links, and keep mobile rules locally scoped to avoid changing article correctness or desktop chrome.
