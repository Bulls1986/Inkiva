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

## Stage 4 — Official CI gates and pre-merge review (2026-10-30)

- PR: [#281](https://github.com/Bulls1986/Inkiva/pull/281), product-code head `b04a2c0d3388af705dcc014983e9e15a729043c9`. All official workflows on this exact product-code head completed **successfully**:
  - [Test](https://github.com/Bulls1986/Inkiva/actions/runs/41056575144): website unit tests, Next.js static build, SEO output verification and unit tests.
  - [Lint](https://github.com/Bulls1986/Inkiva/actions/runs/41056575360): ESLint and TypeScript type checks.
  - [E2E](https://github.com/Bulls1986/Inkiva/actions/runs/41056575159): green.
  - [PR Build](https://github.com/Bulls1986/Inkiva/actions/runs/41056575242): Windows x64 and macOS x64/arm64 builds, all three package smoke tests, updater artifact smoke and artifact-link check green.
- Website docs local contract checks: 2/2 new tests passed using native Node; the existing documentation references gate verified 52/52 registered pages, anchors, links and assets; `git diff --check` passed.
- Mobile layout source review: the site already declares a device-width viewport, and the new /docs/ index has separate <=940px and <=760px breakpoints, single-column route cards/topic list, mobile header spacing and visible focus states. The hero's optional screenshot is hidden below 940px to prioritize content. This confirms responsive *implementation intent*, not an actual rendered mobile screenshot.
- Windows-local `pnpm install --filter inkiva-website --offline --frozen-lockfile --ignore-scripts` was retried for visual preview; both attempts timed out in the package materialization/linking phase near 890/891, preventing local browser rendering. Do not classify this as a website build failure: GitHub's clean build was successful.
- Scope review: only `packages/website/src/app/docs/page.tsx`, `packages/website/src/app/docs/docs.css`, `packages/website/test/docs-home.test.ts` and D07 docs/index were changed; existing Markdown source and editor boundaries remain unchanged. Visual browser inspection and public deployment need post-merge verification; they must not be claimed as complete before evidence.

## Stage 5 — Publication verification

Pending: squash merge to develop; verify the official website deployment workflow on exact merge SHA, mobile-viewport page behavior and public page paths; record result in PR comments (and amend this document in a separate documentation-only follow-up only if materially new reusable guidance is found).

## Lessons

The prior /docs/ route was a placeholder rather than a navigation hub; a new documentation corpus does not improve discoverability when the index has no clear paths. Use existing navigation metadata as source of truth for homepage links, and keep mobile rules locally scoped to avoid changing article correctness or desktop chrome.
