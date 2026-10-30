# Inkiva GEO-03 / Entity and Comparison Content Implementation

- Date: 2026-10-30
- Repository: https://github.com/Bulls1986/Inkiva
- Base: `develop` at `a01799457582a30a84a3a23d4dcdf84de29c53cb`
- Implementation branch: `feat/geo-03-entity-and-comparison-content`
- Pull request: https://github.com/Bulls1986/Inkiva/pull/261
- Scope: Website, documentation, SEO metadata and README only. No editor runtime changes.

## 1. Objective

Address the GEO-02 brand-to-category discovery gap with owned, crawlable, factual first-party content. Make the Inkiva product entity, category, platform support and product fit unambiguous in English and Chinese.

## 2. Changes made

### 2.1 Product entity and metadata

- Canonical title now identifies "Inkiva Markdown Editor" and the Chinese brand alias "墨映".
- Default description explicitly identifies Inkiva as a free, open-source WYSIWYG Markdown desktop editor for Windows and macOS.
- Open Graph site name remains the concise brand "Inkiva · 墨映".
- Organization/WebSite/SoftwareApplication JSON-LD now includes consistent alternate names: Inkiva, Inkiva · 墨映, Inkiva Markdown Editor and 墨映 Markdown 编辑器.
- SoftwareApplication feature list now contains verified product capabilities: in-place WYSIWYG, CommonMark/GFM, ordinary local files/folders, tabs/navigation/search, local history/autosave/crash recovery, KaTeX/diagrams and HTML/PDF export.
- Structured platform support explicitly remains Windows 10/11 x64 and macOS Intel/Apple silicon. Linux is not claimed.

### 2.2 Homepage and README clarity

- English and Chinese hero copy now states the product category, WYSIWYG model, ordinary Markdown file model and actual desktop platform support.
- Fixed the previous English hero-note omission of macOS.
- English and Chinese README short descriptions now use consistent category language.
- Added a homepage footer link to the editor comparison page.

### 2.3 Bilingual comparison content

Added:
- `/compare/typora/`
- `/zh-CN/compare/typora/`

The comparison covers editing model, price/license, desktop platforms, local Markdown files, navigation, recovery, math/diagrams and export.

It deliberately:
- States Typora's one-time commercial license and Linux availability based on its official site/store.
- States MarkText's MIT license and Linux availability based on its official repository/docs.
- Discloses that MarkText is the upstream project on which Inkiva is based; Inkiva is a separately branded, actively developed derivative with a GPL-3.0 project license.
- Avoids claiming Inkiva is universally better.
- Does not make unsupported competitor claims about recovery; those cells are explicitly marked as not assessed in this comparison.
- States that Linux, mobile, cloud sync and team collaboration are not current Inkiva release targets.

### 2.4 Crawl and regression coverage

- Added both comparison routes to the generated sitemap.
- Added both routes to the static SEO output verifier.
- Updated sitemap route-count expectations.
- Added a contract test for canonical Inkiva entity metadata, aliases, verified features and platform support.
- Added an internal comparison link to the FAQ.

## 3. Primary sources used

- Inkiva repository: https://github.com/Bulls1986/Inkiva
- Inkiva installation guide: https://www.inkiva.net/docs/installation/
- Typora official product/pricing: https://typora.io/
- Typora store and FAQ: https://store.typora.io/
- MarkText official repository: https://github.com/marktext/marktext
- MarkText installation docs: https://marktext.me/docs/installation/

## 4. Validation

The first CI attempt found one incorrect assertion in the newly added metadata test: the test expected the old platform wording rather than the explicit Windows 10/11 wording. The product metadata itself was correct. The assertion was corrected to match the actual declared platform list.

The corrected PR head was validated by all four GitHub Actions workflows on 2026-10-30:

| Workflow | Result | Evidence |
|---|---|---|
| Test | Passed | https://github.com/Bulls1986/Inkiva/actions/runs/40981258721 |
| Lint | Passed | https://github.com/Bulls1986/Inkiva/actions/runs/40981258445 |
| E2E Test | Passed | https://github.com/Bulls1986/Inkiva/actions/runs/40981258460 |
| PR Build | Passed | https://github.com/Bulls1986/Inkiva/actions/runs/40981258497 |

The Test workflow completed website unit tests, website static build, SEO output verification and repository unit tests. The Lint workflow passed. The E2E workflow passed. The PR Build workflow completed Windows x64, macOS Intel x64 and macOS Apple Silicon arm64 build/artifact jobs. Build artifacts were uploaded by the workflow.

PR #261 is mergeable and all observed CI workflows on the validated code head passed. It remains open and has not been merged or deployed. This is not a claim of post-deployment production verification.

## 5. Acceptance criteria

1. Homepage metadata and visible copy clearly identify Inkiva as a WYSIWYG Markdown editor.
2. English and Chinese pages consistently identify the Inkiva / 墨映 entity.
3. All platform claims match current release targets; no Linux claim is introduced.
4. Both comparison pages are static-rendered, canonicalized, discoverable through the sitemap and have correct language alternates.
5. Comparison statements are supported by primary product sources and transparently disclose Inkiva's MarkText provenance.
6. Existing canonical URL normalization remains unchanged.
7. Required CI checks pass before merge.

## 6. Handoff and next steps

- GEO-01 and GEO-02 research reports remain in their respective documentation PRs.
- GEO-03 implementation is isolated in PR #261; all observed Test, Lint, E2E and PR Build workflows passed on the validated implementation head. PR #261 remains open and awaits explicit merge authorization.
- After explicit merge authorization and website deployment, verify live HTML metadata, JSON-LD, robots.txt, sitemap.xml and the two comparison routes.
- Submit updated sitemap through authorized search webmaster consoles if configured.
- Repeat the GEO-02 fixed prompt corpus; direct interactive sampling of ChatGPT Search, Gemini, Claude and Perplexity remains a separate manual benchmark and must not be inferred from public web search rankings.
