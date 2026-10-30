# D05 — Chinese public user documentation and legacy translation disposition

- Date: 2026-10-30
- Status: **CLOSED / MERGED / DEPLOYED — PR #275, official 11/11 CI SUCCESS, post-merge website deployment SUCCESS**
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

Final integration evidence is recorded in Stage 4 below. Keep English developer references and unverified screenshots as explicit qualifications rather than falsely claiming full word-for-word bilingual or visual parity.

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


## Stage 4 — Official latest-head CI, squash merge, website publication (2026-10-30)

- Final executable PR: [#275 — Chinese user-manual routes and archive notices](https://github.com/Bulls1986/Inkiva/pull/275), latest source head `fe1f52c3129d32b7170d22bffe0749361e53c36f`. Earlier heads with two diagnosed TypeScript failures are preserved in Stages 2 and 3; they are **not** counted as passing.
- **Official final-head CI: all 11/11 checks SUCCESS**: Test (including 16/16 website test assertions and Next.js static build/typecheck), Lint, real Electron E2E, Windows x64 build, macOS Intel x64 build, macOS Apple Silicon arm64 build, three corresponding package/install smoke checks, Updater artifact smoke, and artifact-link comment. No test/CI quality gate was disabled or relaxed.
- Separate D06 checker validation against the final candidate's Chinese source set returned **52 registered pages, 20 Chinese, zero missing source files, zero broken checked relative links/images/anchors**. Existing English 20-user/12-developer pages and routes are preserved. Do not misrepresent condensed Chinese advanced-reference summaries as exhaustive translations.
- GitHub confirmed **squash merge**: PR #275 state `closed`, `merged=true`, merge commit `ba0a728fef09d1fe5a834fbe8ff75867566d9217`. The authoritative remote `develop` ref was independently verified at exactly that SHA.
- Post-merge [Deploy Inkiva website — run 41039427808](https://github.com/Bulls1986/Inkiva/actions/runs/41039427808): **completed / success**, deploying the new docs routes with the same public docs integrity gate. No unsupported platform or outdated license claims were reactivated.
- **Outstanding visual qualification:** public user-guide screenshot assets were last refreshed 2026-09-17 in PR #134, before v0.6.0. Current desktop capture/visual matching was **not executed**. The complete real-Electron screenshots, UI labels, missing-link/image states, 300+ Outline keyboard and table verification checklist is tracked in [Issue #276](https://github.com/Bulls1986/Inkiva/issues/276). Source asset existence and automated CI do not close this issue.

### Lessons / future handoff

Adding a third public docs tab touches both the search-index tab type and the exhaustive tab-icon map. Preserve strict shared types and focused CI failures to find missing client-contract owners; do not weaken exhaustive maps. Translated route discoverability, sitemap/SEO metadata and search indexing must derive from one canonical docs navigation registry. Retain old upstream translations for attribution only with explicit archival notices. Next work is visual screenshot qualification #276 (requires actual v0.6.0 desktop Electron capture); no D05 page-routing or merge work remains open.
