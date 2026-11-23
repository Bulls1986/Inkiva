# Inkiva SEO-01 / Targeted Comparison and Installation Page Optimization

- Date: 2026-11-17
- Base: `develop` at `2d0496c2669b2cc3b3a09b2d6beca01c4d27a740` (v0.6.1)
- Branch: `seo/typora-installation-conversion`
- Scope: website metadata, comparison copy, installation documentation, SEO output regression checks
- Status: implementation and focused local validation complete; full CI, merge and production deployment remain pending
- Related records: GEO-01 through GEO-06; GEO-03 owns the original bilingual comparison-page design and factual boundaries

## 1. Evidence and baseline

The following values were read from the user's Google Search Console screenshots during the 2026-11-13 to 2026-11-17 review. They are historical baseline evidence, not a live query in this implementation session.

### Three-month Web Search report (latest visible date: 2026-11-13)

| Scope | Impressions | Clicks | CTR | Average position |
|---|---:|---:|---:|---:|
| Site | 137 | 3 | 2.2% | 7.6 |
| `/compare/typora/` | 14 | 0 | — | 10.1 |
| `/docs/installation/` | 30 | 0 | — | 5.3 |

### Query report

| Query | Impressions | Clicks | Average position |
|---|---:|---:|---:|
| `typora vs marktext` | 5 | 0 | 9.8 |
| `marktext vs typora` | 4 | 0 | 16.5 |

The query report and page report were inspected as separate views. These query impressions are **not attributed to `/compare/typora/`** unless GSC is filtered by the page and query together.

A separate recent-28-day screenshot captured on 2026-11-17 showed 57 impressions and 1 click. The screenshot did not provide a stable query-to-page intersection, so it is retained as a site-level trend checkpoint only.

## 2. Search-intent findings

### Typora comparison page

- Observed non-brand queries explicitly compare Typora and MarkText in both word orders.
- The previous title led with Inkiva (`Inkiva vs Typora vs MarkText`), while the observed queries lead with the two compared products.
- The existing comparison content is factual and already covers editing model, price/license, desktop platforms, local files, navigation, recovery, diagrams and export. No unsupported superiority claim or feature claim is needed.
- Existing canonical, reciprocal language alternates and TechArticle JSON-LD are retained.

### Installation page

- The page had 30 impressions and no clicks at an average position of 5.3 in the captured three-month report.
- Its generated title was only `Installation | Inkiva`; its description came from the short palette hint `Download & install on Windows or macOS`.
- The page itself contains useful platform-specific instructions and package choices, but its search metadata did not expose the product category, architecture variants or installer formats.

## 3. Changes implemented

### English Typora comparison page

- SEO title: `Typora vs MarkText: Inkiva Markdown Editor Comparison`.
- Meta description: `Compare Typora and MarkText with Inkiva: desktop editing, price, licenses, platform support, local Markdown files, navigation, recovery and export.`
- Visible H1 now leads with the observed comparison intent: `Typora vs MarkText: How Inkiva Compares`.
- Lead copy explains that Inkiva is the third product in the comparison.
- The fact-check date is updated to 2026-11-17 after rechecking Typora's official price/trial/platform information and MarkText's official repository/license/platform information.
- The existing Chinese page and the comparison facts/table were not broadened or rewritten.

### Installation page

- Added page-specific `seoTitle` and `seoDescription` fields to the documentation registry. These override search metadata only; the sidebar, breadcrumb, palette label and visible H1 remain unchanged.
- Search title: `Download Inkiva Markdown Editor for Windows and macOS`.
- Search description: `Download the free Inkiva WYSIWYG Markdown editor for Windows 10/11 x64 and macOS Intel/Apple silicon. Choose an installer, portable ZIP or DMG.`
- Clarified the first paragraph as a free, open-source WYSIWYG Markdown desktop editor.
- Added a contextual link back to the Typora/MarkText comparison page. The comparison page already links to Installation, so the two pages now provide reciprocal navigation.

### Regression protection

- Added contract tests for the comparison metadata and installation-specific metadata overrides.
- Extended the static SEO output verifier to check the exact title/description of both pages and the reciprocal internal links.
- Canonical URLs, hreflang, sitemap route inventory and structured-data boundaries remain unchanged.

## 4. Validation evidence

### Test-first evidence

- Before production source changes, the focused SEO contract suite ran with **3 passing / 2 failing**. Both failures were the intended assertions: the comparison metadata constants and installation-specific metadata did not yet exist.
- After implementation, the same focused suite passed **5/5**.
- Documentation link tests passed **9/9**.
- Documentation reference validation passed: **52 registered pages**, local links, assets and heading anchors.
- `git diff --check` passed.

### Pending CI gates

The fresh worktree has no local dependency graph. The focused pure-Node/TSX contract test used the known-good website TSX runner from the main checkout; this was limited to the test import graph and is not represented as a full build. Full website build, static SEO output verification, lint and type-check remain delegated to the PR's clean CI environment. A local bootstrap limitation is not a product failure.

## 5. 2026-11-23 measurement plan

On 2026-11-23, capture GSC's latest complete data date and compare **the latest 28 days with the preceding 28 days**, using the same domain property, Web search type and filters.

1. Record site-level impressions, clicks, CTR and average position.
2. Filter Page = `https://www.inkiva.net/compare/typora/`; record the same metrics, then inspect its Queries tab for `typora vs marktext`, `marktext vs typora` and other non-brand queries.
3. Repeat for Page = `https://www.inkiva.net/docs/installation/`.
4. Record the query report separately. Only claim a query belongs to a page when both page and query filters are applied together.
5. If the Generative AI Search report is available, record it separately; do not add AI impressions to Web Search totals or treat impressions as recommendations/clicks.
6. Record Page indexing and sitemap status separately from search performance.
7. Because the sample is small, treat movement as directional evidence. Do not declare success or failure from one or two impressions or a small average-position shift.

### Comparison baseline to carry forward

- Site, three months to 2026-11-13: 137 impressions / 3 clicks / 2.2% CTR / average position 7.6.
- Typora comparison page: 14 impressions / 0 clicks / average position 10.1.
- Installation page: 30 impressions / 0 clicks / average position 5.3.
- Query report (not page-attributed): `typora vs marktext` 5 impressions / average position 9.8; `marktext vs typora` 4 impressions / average position 16.5.
- Site-level recent-28-day screenshot on 2026-11-17: 57 impressions / 1 click.

## 6. Sources checked for factual comparison

- Typora official site/pricing: https://typora.io/
- Typora purchase FAQ: https://support.typora.io/purchase/
- MarkText official repository and MIT license: https://github.com/marktext/marktext
- Inkiva installation guide: https://www.inkiva.net/docs/installation/
- Original comparison implementation and factual boundaries: GEO-03.

## 7. Acceptance and closeout boundary

This stage improves the match between existing content and observed search intent. It does not guarantee ranking, CTR or traffic gains; Google may rewrite titles/snippets and needs time to recrawl. Final implementation acceptance requires PR CI, merge, website deployment and live HTML verification. The first outcome review is the 2026-11-23 GSC comparison above.


## 8. First outcome review attempt — 2026-11-23

**Measurement status: blocked by Google Search Console access, not by website/repository access.** The connected browser refused tab access with: `Browser access requires the originating browser context. Open ChatGPT in the browser with the connected extension and try again.` No authenticated GSC performance report or screenshot was available for this review. Consequently, **no new performance numbers, latest complete data date, indexing count, sitemap status, or AI Search numbers are asserted**.

### Comparison ledger (Web Search)

| Scope | Historical reference | Latest 28 days | Previous 28 days | Valid before/after conclusion |
|---|---|---|---|---|
| Site | 3 months to Nov 13: 137 impressions, 3 clicks, 2.2% CTR, position 7.6; Nov 17 recent 28d: 57 impressions, 1 click | Not retrieved | Not retrieved | Not measurable; the 3-month and 28-day windows are not directly comparable |
| `/compare/typora/` | 3 months: 14 impressions, 0 clicks, 0% CTR, position 10.1 | Not retrieved | Not retrieved | Not measurable |
| `/docs/installation/` | 3 months: 30 impressions, 0 clicks, 0% CTR, position 5.3 | Not retrieved | Not retrieved | Not measurable |

The query-only historical rows were `typora vs marktext` (5 impressions, 0 clicks, position 9.8) and `marktext vs typora` (4 impressions, 0 clicks, position 16.5). **Neither is attributed to a landing page**: combined Page + Query filters have not been observed.

- Latest complete GSC data date: **unavailable**.
- Page indexing (indexed/non-indexed counts): **unavailable**.
- Sitemap status and last read: **unavailable**.
- Generative AI Search report: **availability and metrics unverified**; not included in Web Search.
- Website changes were merged into `develop` via PR #286 on 2026-11-17 (squash commit `7ec5c2c20279f8c07247bee55e2060f1ed99305e`). This establishes repository integration, **not** production deployment or recrawl.

### Required follow-up evidence

Open the Inkiva property in [Google Search Console](https://search.google.com/search-console) from the originating connected browser and capture: (1) Web Search, Compare: last 28 days vs previous 28 days, all four metrics and the latest complete data date; (2) the same comparison for exact page filters `https://www.inkiva.net/compare/typora/` and `https://www.inkiva.net/docs/installation/`; (3) each of the two target queries with Page and Query filters **simultaneously**; (4) separate Generative AI Search if present; (5) Page indexing and Sitemaps overview. Reconcile URL variants/canonical paths before drawing conclusions.

**Interpretation rule:** SEO-01 was merged only six days before this attempted review; a 28-day period is mostly pre-change and should not be treated as an isolated post-launch effect. Once measurements are accessible, report absolute and percentage changes where denominators are nonzero, and repeat after a full post-deployment 28-day interval. No source code was changed by this review.
