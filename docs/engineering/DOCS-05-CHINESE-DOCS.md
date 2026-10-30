# D05 — Chinese public user documentation and legacy translation disposition

- Date: 2026-10-30
- Status: **implementation delivered to PR for official CI; merge/deployment evidence to be appended**
- Base: `develop@5013d536bc3aadcd6adef43dc8c3977830094d3f`, after D04/D06 closeout PR #274
- Branch: `docs/d05-chinese-user-manual`
- Scope: 20/20 English user-documentation route counterparts, Chinese content, navigation/language discovery, metadata, sitemap/search-index inclusion, legacy-translation archive labelling
- Out of scope: full translations of 12 developer pages, pixel-by-pixel screenshot refresh, desktop runtime changes, cloud synchronization, Linux packaging, new Markdown syntax

## Stage 0 — Source audit and mandatory gates

Read root `AGENTS.md`, `docs/agent/TESTING.md`, `docs/agent/ARCHITECTURE_RELEASE.md`, `docs/agent/WORKFLOW.md` and D01/D04/D06 handoff records before mutating website sources.

Current `packages/website/src/lib/docs-nav.ts` registered 32 English pages: 20 user documents and 12 developer documents. The website `/zh-CN/` home was already localized, but `/docs/` had no Chinese tab/page registry. `docs/i18n/README-*.md` were eleven historical upstream MarkText translations, in some cases presenting obsolete Linux support, MarkText packaging and MIT licensing as though they were current Inkiva information. These historical files are explicitly archived, not deleted or misrepresented as a current translation.

The focused pre-change Node assertion against `docs-nav.ts` **executed and failed** because `id: 'zh'` and `file: 'zh-CN/...'` were absent. This is missing-product-website-navigation Red, not runner/bootstrap failure. Architectural boundary: website documentation routing and static export only, with no desktop editor/IPC/geometry/Markdown authority change.

## Stage 1 — Implementation

1. Add a Chinese user-documentation navigation tab with **20 corresponding routes** under `/docs/zh-CN/<slug>/` matching the English user page slugs. Existing English routes and all 12 developer pages remain untouched.
2. Add 20 Chinese Markdown user documents under `packages/website/content/docs/zh-CN/`. Installation, basics, editing, images, FAQ and syntax have expanded practical instructions; long reference tables link to the maintained English originals.
3. Localize public docs sidebar language switch and user-facing eyebrow/footer/edit-link text for Chinese pages; preserve an obvious English fallback.
4. Add `zh-CN`/English reciprocal `hreflang` metadata to user routes, Chinese `TechArticle.inLanguage`, Chinese article language tags and the existing locale bootstrap check. The existing sitemap/search-index already enumerate `ALL_PAGES`, so they include all new registered Chinese pages.
5. Link the new Chinese manual from current English and Chinese root READMEs and public docs landing page; preserve original English destinations.
6. Mark all 11 inherited `docs/i18n/README-*.md` as **historical MarkText translations**, with explicit pointers to maintained Inkiva documentation; add `docs/i18n/README.md` archive/migration policy.

## Scope truthfulness

This release provides **20 discoverable Chinese user-guide pages and Chinese coverage of essential workflows**, **not** a promise of sentence-for-sentence translation parity with all the longer English references. Advanced configuration tables, legacy shortcut matrices, exhaustive Markdown syntax examples and developer documentation remain authoritative in their English versions; the Chinese pages link to those details. Do not equate 20/20 page coverage with equal translation depth.

The supported desktop package matrix remains Windows x64 and macOS Intel/Apple Silicon. Neither the historical Linux statement nor the upstream MIT project license carries over to Inkiva; Inkiva project work uses GPL-3.0-or-later.

## Validation and closeout requirements

- Targeted `docs-localization.test.ts` proves 20/20 one-to-one route parity, source file presence, non-placeholder Chinese text, 12 unaffected developer pages, sitemap uniqueness and accurate article languages.
- D06 `verify:docs` must cover **52 registered pages** with no invalid relative links, assets or anchors; the existing nine focused validator tests remain unchanged.
- Run official website build/deploy CI and current repository PR gates; include real Windows/macOS package checks only when they actually run. Do not claim validation ahead of GitHub results.
- Document screenshot audit remains an outstanding **visual/manual acceptance**: D04 screenshots are reused, not re-captured. Verify real menus/labels and missing-link, image-recovery and >300-node Outline states against the running Electron app before marking screenshot freshness complete. Source-asset existence alone is not visual evidence.

## Lessons and next steps

A translated root marketing page is not translated user documentation. Localized page sources must be registered explicitly so the existing website search index, sitemap, page renderer and D06 link gate see the same page set. Legacy upstream translated documents must be clearly marked as archives instead of silently retaining unsupported platform and license claims.

After official CI, record exact PR, squash merge SHA, website deployment and updated documentation registry count. Keep English developer reference and screenshots as explicit qualifications rather than falsely claiming full bilingual/visual parity.

## Stage 2 — First official CI and the search-index type boundary

- PR [#275](https://github.com/Bulls1986/Inkiva/pull/275) initial head `99b7e33fe46ee7acb85698802c4f1a7dc5c1d79f` ran 16/16 website tests **PASS**, including four new Chinese navigation, source, sitemap and article language tests.
- The same head's Test workflow **failed** at the subsequent Next.js static build TypeScript check. The exact diagnostic was `scripts/build-docs-index.ts:76` — `DocTabId` including `zh` was not assignable to `IndexedPage.tab` declared as the older union `'user' | 'dev'`. This is an owned static type contract mismatch, not missing dependencies or a product runtime regression.
- Reviewed the website source for other stale `'user' | 'dev'` unions: only `src/lib/docs-search.ts` needed a coordinated type update. Changed `IndexedPage.tab` to import the same `DocTabId` type from the canonical docs navigation module (type-only import). No runtime code, index records, performance settings or tests were weakened.
- Fresh-head CI is mandatory; the initial 16 passing tests cannot be used as a final successful build verdict.

## Stage 3 — Second official CI: docs tab exhaustiveness

- PR #275 updated head `a4115e7c3aec6c1318eeb2473501624d204feb38` continued to pass all **16/16** website tests, but the TypeScript/static-build gate identified a second exhaustive type-map gap at `src/components/docs/DocsTabs.tsx:9`: `TAB_ICONS: Record<DocTabId, ReactNode>` still defined only `user` and `dev`.
- Added an explicit Chinese documentation tab icon. The existing two icons and layout semantics remain unchanged; do **not** widen the map to `Partial` or replace it with a fallback that hides missing locales. The exact three-key `Record<DocTabId,...>` contract remains strict.
- A focused repository scan found the existing `DocsChrome.tsx` dynamic activeTab lookup already derives the active tab from the canonical docs registry. This did not require another route/state owner.
- Fresh final-head website build/Test, E2E, Lint and platform package checks must pass before merging.
