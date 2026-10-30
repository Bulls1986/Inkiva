# Inkiva GEO-06 / Live Website and Search Console Baseline

- Audit date: 2026-10-30
- Scope: GitHub entity metadata, live production HTTP responses, static SEO metadata, sitemap/robots/llms, and the available Google Search Console overview
- Repository: https://github.com/Bulls1986/Inkiva
- Authoritative source branch: `develop` at `544a9d76894bf49da53d8fa2499bc983f72c8186`
- Related follow-up: https://github.com/Bulls1986/Inkiva/issues/265
- Status: **Repository metadata and production endpoint checks complete; Search Console drill-down and direct AI-answer benchmark remain pending.**
- Method: GitHub REST API re-read, live HTTP requests from the project Runner, and read-only inspection of the already authenticated Search Console browser tab. No production website or editor files were changed.

## 1. GitHub repository identity — verified complete

GitHub REST API read at `2026-10-30T01:42:00Z` confirmed:

- Description: `Inkiva (墨映) — A free, open-source, document-first WYSIWYG Markdown editor for Windows and macOS.`
- Homepage: `https://www.inkiva.net`
- Topics (11): `commonmark`, `desktop-app`, `electron`, `gfm`, `macos`, `markdown`, `markdown-editor`, `open-source`, `typora-alternative`, `windows`, `wysiwyg`.

The metadata now matches the product's real positioning and supported platforms. No further repository metadata changes are recommended in this stage.

## 2. Live production HTTP checks — passed

The following endpoints were requested with redirects followed. All returned HTTP 200 and the final URL matched the canonical host/path.

| Endpoint | HTTP | Content type | Response bytes | Additional check |
|---|---:|---|---:|---|
| `https://www.inkiva.net/` | 200 | `text/html; charset=utf-8` | 41,795 | Canonical homepage |
| `https://www.inkiva.net/robots.txt` | 200 | `text/plain; charset=utf-8` | 68 | Allows all crawlers and points to Sitemap |
| `https://www.inkiva.net/sitemap.xml` | 200 | `application/xml` | 6,237 | 37 unique URLs |
| `https://www.inkiva.net/llms.txt` | 200 | `text/plain; charset=utf-8` | 3,903 | Product identity and boundary facts present |
| `https://www.inkiva.net/compare/typora/` | 200 | `text/html; charset=utf-8` | 40,973 | Canonical and language alternates present |
| `https://www.inkiva.net/zh-CN/compare/typora/` | 200 | `text/html; charset=utf-8` | 41,552 | Canonical and language alternates present |

### Redirect normalization

| Requested URL | Final URL |
|---|---|
| `http://inkiva.net/` | `https://www.inkiva.net/` |
| `https://inkiva.net/` | `https://www.inkiva.net/` |
| `http://www.inkiva.net/` | `https://www.inkiva.net/` |
| `https://www.inkiva.net/compare/typora` | `https://www.inkiva.net/compare/typora/` |
| `https://www.inkiva.net/zh-CN/compare/typora` | `https://www.inkiva.net/zh-CN/compare/typora/` |

This verifies the production HTTP layer, not search-engine indexing or ranking.

## 3. SEO metadata and structured data

### Homepage

- Static root `html lang`: `en`.
- Canonical: `https://www.inkiva.net/`.
- `hreflang`: `x-default`, `en-US`, and `zh-CN` are present.
- Description identifies Inkiva (墨映), its WYSIWYG Markdown editor category, Windows/macOS support and ordinary CommonMark/GFM files.
- JSON-LD graph includes `Organization`, `WebSite` and `SoftwareApplication`.

### English comparison page

- Static root `html lang`: `en`.
- Canonical: `https://www.inkiva.net/compare/typora/`.
- Reciprocal `en-US` / `zh-CN` alternates are present.
- JSON-LD `TechArticle.inLanguage`: `en-US`.
- No explicit robots meta tag; default indexing behavior applies.

### Chinese comparison page

- Canonical: `https://www.inkiva.net/zh-CN/compare/typora/`.
- Reciprocal `en-US` / `zh-CN` alternates are present.
- JSON-LD `TechArticle.inLanguage`: `zh-CN`.
- **Confirmed issue:** the statically served root element still has `<html lang="en">`. The existing client bootstrap changes it to `zh-CN` after JavaScript executes, but crawlers, non-JS consumers and assistive technology can observe the incorrect initial document language.

The source root layout sets `lang="en"` and then changes it through a pathname-based inline script. The issue is therefore reproducible from source and production output. Treat this as a **P2 accessibility/HTML semantics defect**, not an established ranking penalty. Do not apply an untested post-build string rewrite. A future fix must be designed around the static-export architecture and include generated-HTML assertions for both locales.

## 4. Robots, sitemap and AI discovery file

- Robots response is:
  `User-Agent: *`
  `Allow: /`
  `Sitemap: https://www.inkiva.net/sitemap.xml`
- Sitemap contains 37 unique URLs and includes both English and Chinese Typora comparison routes.
- `llms.txt` is publicly available and states the authoritative product facts: Inkiva is a free/open-source document-first WYSIWYG Markdown editor for Windows/macOS; it uses ordinary CommonMark/GFM files; it is not a hosted writing service, PKM platform, collaboration suite or AI writing assistant; Linux is not a current release target.
- These files are available and crawlable at the HTTP layer. Their existence does not guarantee indexing, ranking, AI citations or recommendations.

## 5. Google Search Console — initial account-backed observation

The existing Search Console domain property `sc-domain:inkiva.net` is present and the account is shown as a verified owner in the settings/overview surface. This audit only read the already open overview page; no settings or property data were changed.

Observed values on the 2026-10-30 page snapshot:

- The main overview summary showed **34 indexed pages and 7 not indexed pages**.
- Another lower summary element on the same extracted page showed **35 indexed and 3 not indexed**. These values conflict, so they must not be treated as a single authoritative count until the dedicated Page indexing report is opened.
- The performance card showed **2 web-search clicks** for the displayed recent date range.
- Crawl statistics showed **795 crawl requests in the past 90 days**.
- The robots.txt status was reported as all files valid.
- The generative-AI search control was shown as **included**.
- Manual actions and security issues showed no detected problems.
- The Links report showed **0 external links** and **7 internal links** in the current overview snapshot.

### Still required inside Search Console

1. Open the Page indexing report and capture the exact seven (or current) exclusion reasons and affected URLs.
2. Open the Sitemaps report and verify that `https://www.inkiva.net/sitemap.xml` is submitted, processed successfully, and has the expected discovered URL count.
3. Open the Generative AI Search performance report and determine whether it has any measurable impressions/clicks or is currently empty/unavailable. The "included" control alone is not a performance metric.
4. Recheck the Links report after its data has refreshed; zero reported external links is a visibility gap, but the report may lag and should not be interpreted as proof that no page on the web links to Inkiva.

Direct report URLs:

- Page indexing: https://search.google.com/search-console/index?resource_id=sc-domain%3Ainkiva.net
- Sitemaps: https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Ainkiva.net
- Generative AI Search: https://search.google.com/search-console/performance/search-analytics/ai?resource_id=sc-domain%3Ainkiva.net
- Links: https://search.google.com/search-console/links?resource_id=sc-domain%3Ainkiva.net

## 6. Direct AI-answer benchmark — not completed

This stage does not claim a direct AI answer benchmark. Public web search, this conversation, and Search Console inclusion controls are not substitutes for fresh product sessions in ChatGPT Search, Gemini, Claude and Perplexity.

Use the fixed eight prompts already documented in `docs/engineering/GEO-02-AI-DISCOVERY-BASELINE.md`. For every run, preserve the exact prompt, product/model/version, Search mode, locale, timestamp, full answer and citations. Use fresh sessions with no Inkiva conversation history. At least two samples per prompt/provider are preferred. Report brand mention, appropriate recommendation, first-party citation, factual accuracy and unsupported claims separately.

An optional Ahrefs connection has been suggested for AI visibility and backlink research; it is not connected or used in this audit. Do not report its metrics until the account is connected and data is returned.

## 7. Handoff and next actions

### Completed

- GitHub Description, Website and 11 Topics independently re-read from GitHub API.
- Six production endpoints verified HTTP 200.
- Five redirect variants normalized to the canonical HTTPS/www/trailing-slash URLs.
- Sitemap, robots and `llms.txt` inspected at the live host.
- English/Chinese comparison-page canonical, hreflang and structured-data metadata inspected.
- Search Console overview and property verification observed.

### Open

- Search Console Page indexing exclusion reasons.
- Search Console Sitemap processing status.
- Generative AI Search report data.
- Direct fresh-session AI answer benchmark across providers.
- Genuine third-party editorial references and category listings.
- P2 static Chinese `html lang` correction.

### Execution environment note

The local WebCodex checkout was not current with the authoritative GitHub `develop` branch. A remote fetch attempt timed out, so no local source-code changes were made. This audit used the GitHub API for the authoritative branch state and direct HTTP requests for production verification. Any subsequent implementation must first bootstrap from the latest `develop` and follow the repository's Red/green gate.

## 8. Learning review

The GEO work has now separated four different evidence layers: GitHub entity metadata, live production crawlability, search-engine indexing, and direct AI-answer visibility. Passing the first two does not prove the latter two. Keep the metrics separate and use dated evidence rather than one combined GEO score.
