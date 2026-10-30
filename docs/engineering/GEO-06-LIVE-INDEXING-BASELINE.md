# Inkiva GEO-06 / Live Website and Search Console Baseline

- Audit date: 2026-10-30
- Scope: GitHub entity metadata, live production HTTP responses, static SEO metadata, sitemap/robots/llms, and the available Google Search Console overview
- Repository: https://github.com/Bulls1986/Inkiva
- Authoritative source branch: `develop` at `544a9d76894bf49da53d8fa2499bc983f72c8186`
- Related follow-up: https://github.com/Bulls1986/Inkiva/issues/265
- Status: **Repository metadata and production endpoint checks complete; Search Console generative-AI report now has a measured baseline (12 impressions); Page indexing/Sitemap drill-down and direct AI-answer benchmark remain pending.**
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
3. **Completed:** the Generative AI Search performance report was opened on 2026-10-30. The selected three-month range was 2026-09-06 through 2026-10-27 and showed 12 total impressions. Page-level counts are recorded in Section 9; the report does not establish a direct AI model recommendation rate.
4. Recheck the Links report after its data has refreshed; zero reported external links is a visibility gap, but the report may lag and should not be interpreted as proof that no page on the web links to Inkiva.

Direct report URLs:

- Page indexing: https://search.google.com/search-console/index?resource_id=sc-domain%3Ainkiva.net
- Sitemaps: https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Ainkiva.net
- Generative AI Search: https://search.google.com/search-console/performance/search-analytics/ai?resource_id=sc-domain%3Ainkiva.net
- Links: https://search.google.com/search-console/links?resource_id=sc-domain%3Ainkiva.net

## 6. Direct AI-answer benchmark — not completed

This stage does not claim a direct AI answer benchmark. Public web search, this conversation, and Search Console inclusion controls are not substitutes for fresh product sessions in ChatGPT Search, Gemini, Claude and Perplexity.

Use the fixed eight prompts already documented in `docs/engineering/GEO-02-AI-DISCOVERY-BASELINE.md`. For every run, preserve the exact prompt, product/model/version, Search mode, locale, timestamp, full answer and citations. Use fresh sessions with no Inkiva conversation history. At least two samples per prompt/provider are preferred. Report brand mention, appropriate recommendation, first-party citation, factual accuracy and unsupported claims separately.

The Ahrefs integration is installed and the authenticated Ahrefs dashboard contains an Inkiva project (project ID `10617729`), but the account is on the Free plan. Ahrefs API calls for project listing, Brand Radar reports/prompts, public domain rating and Site Explorer metrics returned `Insufficient plan`. No Ahrefs DR, backlink, referring-domain, keyword or AI-visibility metrics are claimed. See Section 11.

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


## 9. Google Generative AI Search — measured baseline

The authenticated Search Console report was read directly on 2026-10-30.

- Report: **Generative AI features** (Beta).
- Selected period: **2026-09-06 through 2026-10-27** (three months).
- Last report update shown at read time: approximately 4.5 hours earlier.
- Site-level total: **12 impressions**.
- The report defines an impression as a link to the site being shown to a user in a Google Search generative-AI feature.
- Top pages shown by the report:

| Page | Impressions |
|---|---:|
| `/` | 10 |
| `/docs/installation/` | 2 |
| `/docs/` | 1 |
| `/docs/changelog/` | 1 |
| `/docs/export-themes` | 1 |
| `/docs/key-bindings/` | 1 |

The six page-level rows sum to 16 while the site-level total is 12. Preserve the report's aggregate and page rows separately; do not add page rows to derive site-level unique impressions. The report page did not expose a direct model answer or recommendation-rate metric.

**Important discovery:** neither `/compare/typora/` nor `/zh-CN/compare/typora/` appeared in the six-page table. These pages are present in the published sitemap and have valid HTTP/SEO metadata, but there is no evidence in this report snapshot that they are being surfaced in Google generative-AI features. Improving discovery of these comparison pages is a more useful next content task than adding more generic homepage copy.

This is evidence of a small amount of Google generative-AI feature visibility, not evidence that ChatGPT, Gemini, Claude or Perplexity recommend Inkiva.

## 10. Public search visibility and independent directory audit

### Search-result observations

Public web searches run on 2026-10-30 for:

- `"Inkiva" Markdown editor`
- `"Inkiva" "Typora alternative"`
- `Inkiva vs Typora open source WYSIWYG Markdown editor`
- `Inkiva best free open source WYSIWYG Markdown editor Windows macOS`

returned Inkiva's own homepage and documentation pages, but no clear independent editorial/review result for Inkiva in the visible result set. This is a bounded search observation, not proof that no third-party mention exists anywhere.

### Directory audit

| Directory | Current listing | Submission path / assessment |
|---|---|---|
| [MarkdownList](https://markdownlist.com/) | No Inkiva match | **Best first target.** Free product listing and website backlink; explicit Google/AI discovery positioning; listing submissions are independently verified. Paid homepage slots are labelled Sponsored and do not buy editorial rank. Submit: https://markdownlist.com/submit |
| [The Markdown Guide tools](https://www.markdownguide.org/tools/) | No Inkiva match | Good editorial target. Maintainer welcomes developer submissions and pull requests. New tool page is a manual contribution; requires an icon, screenshot optional, concise neutral description and syntax/feature verification. Contribution notes: https://github.com/mattcone/markdown-guide/wiki/Markdown-tool-directory |
| [Markdown.org apps](https://markdown.org/apps/) | No Inkiva match | Relevant curated directory of desktop Markdown apps. No direct submission workflow was visible on the directory page; contact/contribution path needs confirmation. |
| [Markdown Tools directory](https://www.markdowntools.com/directory) | No Inkiva match | Relevant directory with 21 editor listings, but no public submission path was visible on the inspected page. Do not assume an undocumented submission endpoint. |

### Verified submission copy — MarkdownList draft

- **Name:** Inkiva (墨映)
- **Website:** https://www.inkiva.net/
- **Category:** Editor
- **Surface:** Desktop app
- **Platforms:** Windows, macOS (Intel and Apple silicon)
- **Price:** Free
- **License:** GPL-3.0
- **Short description:** A free, open-source, document-first WYSIWYG Markdown editor for Windows and macOS. Edit ordinary CommonMark/GFM files in place, with source mode, tabs, outline navigation, local history and recovery.
- **Product boundaries:** A local document editor, not a hosted writing service, PKM database, collaboration suite or AI writing assistant.

The draft uses product facts already stated in the official website and documentation. Do not claim Linux support, cloud sync, collaboration, AI writing, plugin marketplace or unsupported Markdown extensions.

**No third-party directory submission has been made in this audit.** The listing is prepared, but publishing it is an external public action and should be explicitly approved by the project owner.

## 11. Ahrefs account and Site Explorer UI baseline

The authenticated Ahrefs Site Explorer page for project `10617729` was read directly on 2026-10-30. This corrects the earlier API-only conclusion: the API endpoints return `Insufficient plan` on the Free plan, but the logged-in web UI still exposes useful overview metrics.

### UI snapshot

| Metric | Current snapshot | All-time |
|---|---:|---:|
| Domain Rating (DR) | 0 | — |
| URL Rating (UR) | 0 | — |
| Ahrefs Rank (AR) | 242,180,065 | — |
| Backlinks | 679 | 719 |
| Referring domains | 513 | 546 |
| Organic keywords | 0 | — |
| Estimated organic traffic | 0 | — |
| Paid keywords / traffic | 0 | — |

### Link attribute distribution

| Type | Count | Share |
|---|---:|---:|
| Follow referring domains | 4 | 0.8% |
| Nofollow referring domains | 509 | 99.2% |
| Follow backlinks | 5 | 0.7% |
| Nofollow backlinks | 674 | 99.3% |

The large referring-domain count is not equivalent to authority: almost all links in this snapshot are nofollow, while DR and UR are both 0. The source domains and anchors still need manual quality review before classifying them as spam, legitimate mentions or scraper-generated links. Do not attempt to manufacture followed links.

### Ahrefs crawler and AI visibility

- Crawled pages: **69**.
- HTTP 200: **35 (50.7%)**.
- HTTP 3XX: **34 (49.3%)**.
- HTTP 404 / other 4XX / 5XX: **0**.
- Brand Radar overview: **0 AI responses and 0 cited pages** across the displayed AI platform filters.

The 3XX count is a crawler snapshot and needs URL-level inspection before treating it as a defect; redirects may be valid canonical normalization or legacy paths. The absence of Ahrefs organic keywords/traffic does not override Google Search Console's separate observed clicks. Likewise, Ahrefs Brand Radar zero is an index observation, not a direct fresh-session model benchmark.

### API limitation — retained accurately

The installed Ahrefs API integration still returned `Insufficient plan` for project listing, Brand Radar reports/prompts, public Domain Rating and Site Explorer API endpoints. No API metrics are claimed. The web UI overview is available under the current account and supplies the metrics above; upgrading is not required for this basic snapshot.

Direct project URL:

https://app.ahrefs.com/site-explorer/overview?mode=subdomains&projectId=10617729&target=inkiva.net%2F&volume_type=monthly

## 12. Release freshness check

GitHub Releases API confirms that **v0.6.0** was published on **2026-10-29 01:33 UTC**. A fresh production HTTP fetch on 2026-10-30 confirms the live homepage returns HTTP 200 and its HTML contains `v0.6.0` (not `v0.5.0`).

Some public search results still display the old `v0.5.0` snippet and have crawl timestamps from approximately three weeks earlier. This is a stale search-index snapshot, not a live homepage defect. After the Page indexing/Sitemap reports are checked, use Search Console URL Inspection to request a recrawl of the homepage and changelog if they have not yet been refreshed.

## 13. Updated handoff

### Completed

- GitHub Description, Website and 11 Topics verified.
- Six production endpoints and five redirect variants verified.
- Canonical, hreflang, JSON-LD, robots, sitemap and `llms.txt` inspected.
- Google Generative AI Search report read: 12 impressions across the selected three-month period; page-level distribution recorded.
- Latest GitHub release and live homepage verified as v0.6.0.
- Four independent Markdown directories checked.
- Ahrefs Site Explorer UI metrics read: DR 0, UR 0, 679 backlinks, 513 referring domains, zero Ahrefs organic keywords/traffic, and zero Brand Radar responses; link attribute distribution and crawl response breakdown recorded.
- Markdown Guide tool-directory entry submitted as [PR #316](https://github.com/mattcone/markdown-guide/pull/316); Netlify preview deployed successfully and the rendered page/icon were verified.
- Awesome Markdown curated-list entry submitted as [PR #165](https://github.com/BubuAnabelas/awesome-markdown/pull/165); one alphabetically placed Editors entry, with the official website and Windows/macOS badges.
- MarkdownList submission content prepared; public form inspected, but automated metadata lookup was rejected by its request-verification gate. No listing was created and no verification challenge was bypassed.

### Still open

- Search Console Page indexing reasons and affected URLs.
- Search Console Sitemap processing status and discovered URL count.
- Fresh-session AI answer benchmark across ChatGPT Search, Gemini, Claude and Perplexity.
- Markdown Guide PR #316 maintainer review/merge.
- Complete the MarkdownList submission through its browser-verified form; owner authorization has been granted, but the site-side verification step remains.
- P2 static Chinese `html lang` correction.
- URL-level quality review of Ahrefs referring domains/backlinks and redirect rows.

## 14. Markdown Guide external submission

A public fork and submission branch were created:

- Fork: https://github.com/Bulls1986/markdown-guide
- Branch: `inkiva/add-markdown-editor-entry`
- Pull request: https://github.com/mattcone/markdown-guide/pull/316
- Added `_tools/inkiva.md` and `assets/images/tool-icons/inkiva.svg`.

The PR follows the maintainer's contribution instructions: a concise neutral tool page, required icon, and a Markdown syntax support matrix. The matrix uses Inkiva's published syntax documentation and current implementation evidence; unsupported or undocumented extensions are not presented as supported.

Netlify preview verification on 2026-10-30:

- Preview URL: https://deploy-preview-316--markdown-guide.netlify.app/tools/inkiva/
- Tool page: HTTP 200.
- Icon URL: HTTP 200, served as `image/svg+xml`.
- Rendered page title: `Inkiva Markdown Reference | Markdown Guide`.
- Syntax table rendered, including Yes/Partial/No states.
- Netlify deploy status: SUCCESS; header rules: SUCCESS; pages-changed and redirect-rules checks: NEUTRAL (not failures).

The PR is open and mergeable but has not been merged by the upstream maintainer. Do not claim Inkiva is listed in the live directory until PR #316 is merged.

## 15. MarkdownList submission gate

The public submission page https://markdownlist.com/submit advertises a free listing and direct website backlink. Its form supports metadata autofill from the product homepage or manual entry.

A read-only inspection confirmed the form flow. A direct metadata request from the project Runner to `POST /api/tool-metadata` returned HTTP 403 with `This request could not be verified.` This is a site-side request-verification gate. No submission payload was sent to the listing endpoint and no listing was created.

Owner authorization to publish has been given. The remaining step is to complete the site's own browser verification through the public form. Do not bypass or emulate that verification. Once the owner completes the form, verify the resulting public product page and record its canonical URL.


## 16. Awesome Markdown curated-list submission

A second relevant third-party contribution was prepared after verifying that the repository is active, accepts pull requests, has a current Editors category, and explicitly requests one project per PR with concise descriptions and alphabetical placement.

- Fork: https://github.com/Bulls1986/awesome-markdown
- Branch: `inkiva/add-to-editors`
- Pull request: https://github.com/BubuAnabelas/awesome-markdown/pull/165
- Change: one line added under Editors, alphabetically after iA Writer.
- Description: "A free, open-source, document-first WYSIWYG Markdown editor for Windows and macOS."
- Platform badges: existing Markdown Guide-style macOS and Windows badges.
- PR state at submission: open, mergeable; no CI checks were configured or reported.

This is a curated-list PR, not a live listing. Do not claim publication until the maintainer merges it.


## 17. Ahrefs referring-domain quality review — page 1 (100-row view)

Authenticated Ahrefs Site Explorer snapshot inspected on **2026-10-30**. The user changed the page-size selector from 50 to 100 while remaining on page 1; this capture uses `limit=100` and `offset=0`. The earlier 50-row record was only the first half of this same page and is superseded by this complete page-1 capture.

- Report: https://app.ahrefs.com/site-explorer/refdomains?anchorRules=&bestFilter=all&domainNameRules=&followType=all&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=0&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Dr&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Scope: `inkiva.net/`, Subdomains, all link attributes, sorted by DR descending, 100 results per page.
- Ahrefs reports **513 referring domains** in total. This capture covers **page 1 only (rows 1–100)**; **413 domains remain on pages 2–6**.
- **100/100 rows carry Ahrefs' explicit `SPAM` label.**
- DR range: **48–70**.
- The 100 domains contain **128 links to Inkiva**; every row has 1–2 links to target.
- **0 dofollow links to Inkiva** among these 100 domains.
- All 100 rows show zero domain traffic and zero organic keywords in this report snapshot.
- First-seen dates range from **2026-09-08 to 2026-09-24**; **53/100** were first seen on 2026-09-09.
- TLD distribution: **63 .store**, **22 .shop**, **11 .site**, **3 .agency**, **1 .website**.
- Repeated naming patterns include `seoexpress`, `link-baron`, `rank`, `outrank-hq`, `itxoft` and `fiverr`, consistent with templated SEO/link-building domain names.

### Interpretation and safety boundary

The first 100 rows show a highly anomalous, strongly templated low-quality backlink cluster in Ahrefs' dataset. This is a third-party tool's risk classification, not proof that Google has applied a manual action or algorithmic penalty. DR values are not a quality endorsement. The 100 domains have zero dofollow links to target in this snapshot, which reduces the basis for treating these specific links as an active followed-link scheme, but does not by itself establish Google's treatment.

**Do not submit a Disavow file based solely on the Ahrefs SPAM label or this first page.** Continue by reviewing the remaining 413 referring domains (pages 2–6), then inspect representative source URLs and anchors for the suspicious cluster. Compare findings with Google Search Console's Manual actions and Security issues reports. Consider disavow only if the full evidence indicates substantial manipulative links and a justified need to disavow them.

### Page 1 inventory (100 rows)

The following table records the full visible first page, not a sample. “Dofollow links” is the Ahrefs table's count of followed links from that referring domain to Inkiva.

| # | Referring domain | DR | Links to target | Dofollow links | First seen |
|---:|---|---:|---:|---:|---|
| 1 | `itxoft-professional-seo-services.site` | 70 | 1 | 0 | 9 Sep 2026 |
| 2 | `rankgrowth.agency` | 62 | 1 | 0 | 11 Sep 2026 |
| 3 | `itxoft-seo-for-higher-rankings.site` | 61 | 1 | 0 | 9 Sep 2026 |
| 4 | `itxoft-cost-effective-seo-services.site` | 61 | 1 | 0 | 9 Sep 2026 |
| 5 | `fiverr-seo-for-small-businesses.site` | 60 | 1 | 0 | 8 Sep 2026 |
| 6 | `fiverr-quality-seo-at-affordable-rates.site` | 60 | 1 | 0 | 9 Sep 2026 |
| 7 | `rank-optimizer.website` | 57 | 1 | 0 | 16 Sep 2026 |
| 8 | `itxoft-organic-seo-growth.site` | 57 | 1 | 0 | 11 Sep 2026 |
| 9 | `seonix.agency` | 57 | 1 | 0 | 9 Sep 2026 |
| 10 | `itxoft-reliable-seo-services.site` | 55 | 1 | 0 | 9 Sep 2026 |
| 11 | `fiverr-affordable-seo-services.site` | 55 | 1 | 0 | 12 Sep 2026 |
| 12 | `linkrankpro.shop` | 54 | 1 | 0 | 17 Sep 2026 |
| 13 | `ranklinkerpro.shop` | 54 | 1 | 0 | 17 Sep 2026 |
| 14 | `seorankflow.shop` | 54 | 1 | 0 | 17 Sep 2026 |
| 15 | `buyseobacklinks.shop` | 53 | 1 | 0 | 17 Sep 2026 |
| 16 | `rankshiftseo.shop` | 53 | 2 | 0 | 17 Sep 2026 |
| 17 | `rankcoreseo.shop` | 53 | 1 | 0 | 17 Sep 2026 |
| 18 | `rankboostly.shop` | 53 | 1 | 0 | 20 Sep 2026 |
| 19 | `authoritybacklinks.shop` | 53 | 1 | 0 | 17 Sep 2026 |
| 20 | `linkseopro.shop` | 52 | 1 | 0 | 17 Sep 2026 |
| 21 | `seolinkpro.shop` | 52 | 1 | 0 | 16 Sep 2026 |
| 22 | `itxoft-affordable-seo-solutions.site` | 52 | 1 | 0 | 9 Sep 2026 |
| 23 | `ranklinkpro.shop` | 52 | 1 | 0 | 17 Sep 2026 |
| 24 | `linkrankseo.shop` | 52 | 1 | 0 | 17 Sep 2026 |
| 25 | `toplinkranker.shop` | 52 | 1 | 0 | 17 Sep 2026 |
| 26 | `thetoprankingseo.shop` | 49 | 1 | 0 | 22 Sep 2026 |
| 27 | `link-baron-optimal-organic-collective.store` | 49 | 2 | 0 | 8 Sep 2026 |
| 28 | `seoexpress.site` | 49 | 1 | 0 | 9 Sep 2026 |
| 29 | `seohighranking.shop` | 49 | 1 | 0 | 23 Sep 2026 |
| 30 | `theseorankinghigh.shop` | 49 | 2 | 0 | 9 Sep 2026 |
| 31 | `rankingseohigh.shop` | 49 | 2 | 0 | 10 Sep 2026 |
| 32 | `theseomasterhigh.shop` | 49 | 1 | 0 | 23 Sep 2026 |
| 33 | `highseoranking.shop` | 49 | 1 | 0 | 23 Sep 2026 |
| 34 | `mysky-shop.shop` | 49 | 1 | 0 | 9 Sep 2026 |
| 35 | `modern-studio-outrank-hq-blogger.store` | 49 | 2 | 0 | 10 Sep 2026 |
| 36 | `agile-footer-link-system-link-baron.store` | 49 | 2 | 0 | 9 Sep 2026 |
| 37 | `seoexpress-authority-portal.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 38 | `link-baron-agile-on-page-directory.store` | 49 | 2 | 0 | 9 Sep 2026 |
| 39 | `certified-link-building-seoexpress.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 40 | `link-baron-syndicate-equity.store` | 49 | 2 | 0 | 9 Sep 2026 |
| 41 | `ekenkoshop.shop` | 49 | 1 | 0 | 9 Sep 2026 |
| 42 | `forum-provider-link-baron.store` | 49 | 2 | 0 | 11 Sep 2026 |
| 43 | `link-baron-pro-off-page.store` | 49 | 2 | 0 | 9 Sep 2026 |
| 44 | `link-baron-wiki-leading-system.store` | 49 | 2 | 0 | 9 Sep 2026 |
| 45 | `dynamic-cooperative-link-baron-saas-seo.store` | 49 | 1 | 0 | 24 Sep 2026 |
| 46 | `rankinghighseo.shop` | 49 | 1 | 0 | 13 Sep 2026 |
| 47 | `seoexpress-digital-system.store` | 49 | 1 | 0 | 8 Sep 2026 |
| 48 | `exclusive-backlink-seoexpress-firm.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 49 | `professional-seoexpress-marketing-studio.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 50 | `official-on-page-link-baron-division.store` | 49 | 2 | 0 | 10 Sep 2026 |
| 51 | `high-outrank-hq-dofollow-platform.store` | 49 | 2 | 0 | 8 Sep 2026 |
| 52 | `authority-do-follow-and-do-follow-network.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 53 | `master-rank-forge-pbn-league.store` | 49 | 2 | 0 | 8 Sep 2026 |
| 54 | `master-link-juice-and-editorial-link-agency.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 55 | `linkspro.agency` | 49 | 1 | 0 | 9 Sep 2026 |
| 56 | `trusted-organic-seoexpress-house.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 57 | `digital-pr-and-domain-rating-premium-experts.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 58 | `seoexpress-best-outreach-experts.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 59 | `dr-90-rank-forge-department.store` | 49 | 2 | 0 | 8 Sep 2026 |
| 60 | `paramount-collective-outrank-hq-dr-90.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 61 | `advanced-saas-seo-directory-outrank-hq.store` | 49 | 2 | 0 | 9 Sep 2026 |
| 62 | `ultimate-seoexpress-niche-edit-experts.store` | 49 | 1 | 0 | 9 Sep 2026 |
| 63 | `ultimate-ranking-signal-and-link-velocity-bureau.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 64 | `exclusive-webpage-center-seoexpress.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 65 | `tier-one-and-domain-rating-trusted-exchange.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 66 | `high-da-and-crawl-budget-strategic-exchange.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 67 | `smart-marketing-seoexpress.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 68 | `supreme-dofollow-seoexpress-hub.store` | 48 | 1 | 0 | 8 Sep 2026 |
| 69 | `seoexpress-leading-dofollow-pros.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 70 | `authority-services-for-link-juice-and-contextual-link.store` | 48 | 1 | 0 | 15 Sep 2026 |
| 71 | `official-center-outrank-hq-search.store` | 48 | 2 | 0 | 9 Sep 2026 |
| 72 | `trusted-off-page-pros-seoexpress.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 73 | `global-seo-group-seoexpress.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 74 | `outrank-hq-anchor-text-center.store` | 48 | 2 | 0 | 8 Sep 2026 |
| 75 | `official-saas-seo-outrank-hq-collective.store` | 48 | 1 | 0 | 11 Sep 2026 |
| 76 | `outrank-hq-prime-blogger.store` | 48 | 1 | 0 | 22 Sep 2026 |
| 77 | `professional-seoexpress-high-da-partners.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 78 | `outrank-hq-ultimate-ranking.store` | 48 | 2 | 0 | 11 Sep 2026 |
| 79 | `high-crew-link-baron-intent.store` | 48 | 2 | 0 | 9 Sep 2026 |
| 80 | `link-baron-grand-cluster-works.store` | 48 | 2 | 0 | 10 Sep 2026 |
| 81 | `golden-link-building-rank-forge.store` | 48 | 2 | 0 | 8 Sep 2026 |
| 82 | `organic-traffic-and-outreach-pro-authority-services.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 83 | `cluster-rank-forge-academy.store` | 48 | 2 | 0 | 9 Sep 2026 |
| 84 | `leading-partners-for-domain-rating-and-do-follow.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 85 | `ultimate-depot-for-search-rank-and-content-marketing.store` | 48 | 1 | 0 | 8 Sep 2026 |
| 86 | `dynamic-systems-for-serp-boost-and-contextual-link.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 87 | `official-anchor-text-seoexpress-system.store` | 48 | 1 | 0 | 12 Sep 2026 |
| 88 | `grand-link-baron-league.store` | 48 | 2 | 0 | 9 Sep 2026 |
| 89 | `contextual-link-baron-services.store` | 48 | 2 | 0 | 9 Sep 2026 |
| 90 | `expert-organic-seoexpress.store` | 48 | 1 | 0 | 10 Sep 2026 |
| 91 | `anchor-text-and-index-rate-trusted-syndicate.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 92 | `advanced-traffic-surge-and-keyword-rank-bureau.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 93 | `header-link-portal-link-baron.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 94 | `grand-rank-forge-topical-desk.store` | 48 | 2 | 0 | 11 Sep 2026 |
| 95 | `keyword-rank-and-domain-rating-leading-hub.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 96 | `link-juice-traffic-surge-and-traffic-surge-collective.store` | 48 | 1 | 0 | 9 Sep 2026 |
| 97 | `seoexpress-off-page-solutions.store` | 48 | 1 | 0 | 10 Sep 2026 |
| 98 | `epic-syndicate-link-baron-keyword.store` | 48 | 2 | 0 | 10 Sep 2026 |
| 99 | `link-baron-link-juice-optimal-marketplace.store` | 48 | 2 | 0 | 9 Sep 2026 |
| 100 | `fiverr-cost-effective-seo.site` | 48 | 1 | 0 | 9 Sep 2026 |


### Continuation checkpoint — Ahrefs referring-domain review completed (2026-10-30)

- Ahrefs API v3 `site-explorer-referring-domains` returned **`Insufficient plan`** for bulk export. No API data was returned and no plan change was made.
- Authenticated Ahrefs UI pages 1–6 have now all been captured at `limit=100`, with offsets `0,100,200,300,400,500`. All **513/513 referring domains** are recorded in sections 17–22.
- Full inventory reconciliation: **513 referring domains**, **512 Ahrefs-SPAM-labelled domains**, **1 unlabelled domain** (`upstar.dev`, row 435), **679 links to target**, **5 dofollow links**. This reconciles with the Ahrefs overview snapshot of 679 backlinks (5 followed / 674 nofollow).
- The five dofollow backlinks are from four referring domains: `daxsupport.com` (1), `kaila.biz` (1), `link-pen.com` (2), and `trip-planner.shop` (1). Their source URLs and anchor text still need page-level verification.
- One domain shows non-zero traffic/keywords in the report: `digitalboost.site` (traffic 2, keywords 1); it is still labelled SPAM by Ahrefs.
- **Do not submit a Disavow file yet.** Ahrefs' SPAM label is not a Google manual-action verdict. The next evidence step is to inspect the five followed backlinks, the unlabelled `upstar.dev` link and `digitalboost.site`, then check Google Search Console Manual actions and Security issues.

## 18. Ahrefs referring-domain quality review — page 2 (rows 101–200)

Authenticated Ahrefs Site Explorer snapshot inspected on **2026-10-30**. Confirmed report URL includes `limit=100&offset=100`, so this is page 2, not a repeat of page 1.

- Report: https://app.ahrefs.com/site-explorer/refdomains?anchorRules=&bestFilter=all&domainNameRules=&followType=all&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=100&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Dr&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Scope: `inkiva.net/`, Subdomains, all link attributes, sorted by DR descending, 100 results per page.
- Ahrefs reports **513 referring domains** in total. This capture covers **page 2 only (rows 101–200)**.
- **100/100 rows carry Ahrefs' explicit `SPAM` label.**
- DR range: **37–48**.
- The 100 domains contain **118 links to Inkiva**; **0 dofollow links**.
- All 100 rows show zero domain traffic and zero organic keywords in this report snapshot.
- TLD distribution: **87 .xyz**, **9 .store**, **3 .shop**, **1 .agency**.
- **87 of the 87 `.xyz` domains are numeric-only hostnames** (e.g. `37486xxx.xyz` and `11763xxx.xyz` patterns); these are highly templated rather than recognizable editorial or product sites.
- First-seen dates range from **8 Sep 2026 to 29 Sep 2026**.
- The numeric `.xyz` rows also show very high counts of dofollow referring domains and linked domains (often around 2,000 and 1,017 respectively), despite zero organic traffic/keywords and only 1–2 links to Inkiva. This is a strong anomaly signal, not proof of a shared owner/IP/network; IP/ASN and source-page evidence have not yet been inspected.

### Interpretation and safety boundary

Page 2 strengthens the hypothesis that the profile contains a large low-quality, automatically generated link cluster: the first page was dominated by keyword-stuffed `.store` / `.shop` / `.site` names, while this page is dominated by numeric `.xyz` domains. However, Ahrefs' `SPAM` flag is a third-party classification, not a Google verdict. Do not infer a manual action or algorithmic penalty from this report, and do not submit a Disavow file based solely on these two pages.

Next steps: inspect pages 3–6; then review representative backlink source URLs, anchors, source IPs/ASNs and repeated page templates. Compare against Google Search Console Manual actions and Security issues before deciding whether any disavow action is justified.

### Page 2 inventory (100 rows)

| # | Referring domain | DR | Dofollow ref. domains | Dofollow linked domains | Traffic | Keywords | Links to target | Dofollow links | First seen |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 101 | `master-bureau-for-index-rate-and-backlink-pro.store` | 48 | 979 | 716 | 0 | 0 | 1 | 0 | 8 Sep 2026 |
| 102 | `outrank-hq-dr-90-paramount-system.store` | 48 | 1054 | 1018 | 0 | 0 | 2 | 0 | 9 Sep 2026 |
| 103 | `seoexpress-verified-high-da-consultants.store` | 48 | 1077 | 716 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 104 | `advanced-search-rank-and-niche-edit-depot.store` | 48 | 980 | 637 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 105 | `seoexpress-backlink-hub.store` | 48 | 1066 | 337 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 106 | `proven-network-for-ranking-signal-and-keyword-rank.store` | 48 | 981 | 716 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 107 | `traffic-surge-and-keyword-rank-premium-alliance.store` | 48 | 972 | 716 | 0 | 0 | 1 | 0 | 16 Sep 2026 |
| 108 | `link-velocity-tier-one-and-editorial-link-consortium.store` | 48 | 977 | 716 | 0 | 0 | 1 | 0 | 8 Sep 2026 |
| 109 | `flagship-niche-edit-and-link-building-services.store` | 48 | 977 | 327 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 110 | `37486439.xyz` | 46 | 2146 | 1016 | 0 | 0 | 1 | 0 | 16 Sep 2026 |
| 111 | `37486137.xyz` | 46 | 2145 | 1016 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 112 | `37486315.xyz` | 46 | 2139 | 1017 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 113 | `37486433.xyz` | 46 | 2125 | 1018 | 0 | 0 | 1 | 0 | 12 Sep 2026 |
| 114 | `37486319.xyz` | 46 | 2153 | 1017 | 0 | 0 | 2 | 0 | 13 Sep 2026 |
| 115 | `37486224.xyz` | 46 | 2128 | 1018 | 0 | 0 | 1 | 0 | 25 Sep 2026 |
| 116 | `37486193.xyz` | 46 | 2154 | 1019 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 117 | `37486422.xyz` | 46 | 2046 | 1018 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 118 | `37486129.xyz` | 46 | 2138 | 1017 | 0 | 0 | 2 | 0 | 16 Sep 2026 |
| 119 | `37486419.xyz` | 46 | 2047 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 120 | `37486173.xyz` | 46 | 2145 | 1017 | 0 | 0 | 2 | 0 | 14 Sep 2026 |
| 121 | `37486668.xyz` | 46 | 2143 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 122 | `37486435.xyz` | 46 | 2107 | 1018 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 123 | `54232754.xyz` | 46 | 2095 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 124 | `37486429.xyz` | 46 | 2046 | 1018 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 125 | `37486312.xyz` | 46 | 2146 | 1017 | 0 | 0 | 2 | 0 | 14 Sep 2026 |
| 126 | `37486488.xyz` | 46 | 2150 | 1018 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 127 | `37486297.xyz` | 46 | 2150 | 1018 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 128 | `37486318.xyz` | 46 | 2153 | 1017 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 129 | `37486131.xyz` | 46 | 2146 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 130 | `37486109.xyz` | 46 | 2144 | 1017 | 0 | 0 | 2 | 0 | 14 Sep 2026 |
| 131 | `37486118.xyz` | 46 | 2059 | 1016 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 132 | `37486619.xyz` | 46 | 2156 | 1018 | 0 | 0 | 1 | 0 | 26 Sep 2026 |
| 133 | `37486197.xyz` | 46 | 2155 | 1017 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 134 | `37486580.xyz` | 46 | 2154 | 1017 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 135 | `37486306.xyz` | 46 | 2151 | 1017 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 136 | `37486183.xyz` | 46 | 2148 | 1016 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 137 | `37486459.xyz` | 46 | 2136 | 1019 | 0 | 0 | 2 | 0 | 16 Sep 2026 |
| 138 | `37486161.xyz` | 46 | 2139 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 139 | `37486125.xyz` | 46 | 2119 | 1017 | 0 | 0 | 2 | 0 | 18 Sep 2026 |
| 140 | `37486344.xyz` | 46 | 2053 | 1016 | 0 | 0 | 1 | 0 | 16 Sep 2026 |
| 141 | `37486115.xyz` | 46 | 2095 | 1017 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 142 | `37486321.xyz` | 46 | 2150 | 1018 | 0 | 0 | 2 | 0 | 19 Sep 2026 |
| 143 | `37486309.xyz` | 46 | 2144 | 717 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 144 | `37486179.xyz` | 46 | 2146 | 1017 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 145 | `37486195.xyz` | 46 | 2153 | 1017 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 146 | `37486143.xyz` | 46 | 2141 | 1017 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 147 | `37486369.xyz` | 46 | 2068 | 1018 | 0 | 0 | 2 | 0 | 17 Sep 2026 |
| 148 | `37486635.xyz` | 46 | 2146 | 1017 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 149 | `37486177.xyz` | 46 | 2136 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 150 | `37486277.xyz` | 46 | 2125 | 1017 | 0 | 0 | 1 | 0 | 19 Sep 2026 |
| 151 | `37486272.xyz` | 46 | 2112 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 152 | `37486462.xyz` | 46 | 2132 | 1018 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 153 | `37486366.xyz` | 46 | 2070 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 154 | `37486170.xyz` | 46 | 2119 | 1017 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 155 | `37486339.xyz` | 46 | 2053 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 156 | `37486420.xyz` | 46 | 2044 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 157 | `37486303.xyz` | 46 | 2141 | 1016 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 158 | `37486279.xyz` | 46 | 2132 | 1018 | 0 | 0 | 2 | 0 | 19 Sep 2026 |
| 159 | `37486205.xyz` | 46 | 2140 | 1018 | 0 | 0 | 1 | 0 | 19 Sep 2026 |
| 160 | `37486266.xyz` | 46 | 2122 | 1018 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 161 | `37486172.xyz` | 46 | 2117 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 162 | `37486190.xyz` | 46 | 2143 | 1018 | 0 | 0 | 1 | 0 | 19 Sep 2026 |
| 163 | `37486267.xyz` | 46 | 2121 | 1017 | 0 | 0 | 1 | 0 | 16 Sep 2026 |
| 164 | `37486428.xyz` | 46 | 2057 | 1018 | 0 | 0 | 1 | 0 | 29 Sep 2026 |
| 165 | `54232760.xyz` | 46 | 2114 | 1018 | 0 | 0 | 1 | 0 | 19 Sep 2026 |
| 166 | `37486222.xyz` | 46 | 2122 | 1017 | 0 | 0 | 1 | 0 | 16 Sep 2026 |
| 167 | `37486379.xyz` | 46 | 2048 | 1017 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 168 | `37486413.xyz` | 46 | 1911 | 1018 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 169 | `37486290.xyz` | 46 | 2136 | 1018 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 170 | `37486261.xyz` | 46 | 2123 | 1017 | 0 | 0 | 2 | 0 | 17 Sep 2026 |
| 171 | `37486386.xyz` | 46 | 1909 | 1018 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 172 | `rankio.agency` | 46 | 144 | 3 | 0 | 0 | 2 | 0 | 10 Sep 2026 |
| 173 | `37486401.xyz` | 46 | 1206 | 1018 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 174 | `37486403.xyz` | 46 | 1202 | 1017 | 0 | 0 | 2 | 0 | 17 Sep 2026 |
| 175 | `37486396.xyz` | 45 | 1204 | 1018 | 0 | 0 | 1 | 0 | 16 Sep 2026 |
| 176 | `37486405.xyz` | 45 | 1203 | 1018 | 0 | 0 | 2 | 0 | 17 Sep 2026 |
| 177 | `37486394.xyz` | 45 | 1200 | 1017 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 178 | `11763731.xyz` | 44 | 2050 | 1018 | 0 | 0 | 1 | 0 | 27 Sep 2026 |
| 179 | `11763732.xyz` | 44 | 2037 | 1017 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 180 | `11763736.xyz` | 44 | 2036 | 1017 | 0 | 0 | 1 | 0 | 28 Sep 2026 |
| 181 | `11763952.xyz` | 44 | 2033 | 1017 | 0 | 0 | 1 | 0 | 27 Sep 2026 |
| 182 | `11763961.xyz` | 44 | 2027 | 1017 | 0 | 0 | 1 | 0 | 26 Sep 2026 |
| 183 | `11763964.xyz` | 44 | 2025 | 1017 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 184 | `11763925.xyz` | 44 | 2020 | 1018 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 185 | `11764016.xyz` | 44 | 2018 | 1017 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 186 | `11763988.xyz` | 44 | 2021 | 1017 | 0 | 0 | 2 | 0 | 20 Sep 2026 |
| 187 | `11763896.xyz` | 44 | 1993 | 1017 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 188 | `11763830.xyz` | 44 | 1965 | 1019 | 0 | 0 | 1 | 0 | 25 Sep 2026 |
| 189 | `11763872.xyz` | 44 | 1972 | 1018 | 0 | 0 | 1 | 0 | 27 Sep 2026 |
| 190 | `11763797.xyz` | 44 | 2003 | 1017 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 191 | `11763841.xyz` | 44 | 1945 | 1017 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 192 | `11763787.xyz` | 44 | 1999 | 1017 | 0 | 0 | 1 | 0 | 27 Sep 2026 |
| 193 | `11763994.xyz` | 44 | 2021 | 1017 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 194 | `11764008.xyz` | 44 | 2021 | 1017 | 0 | 0 | 2 | 0 | 22 Sep 2026 |
| 195 | `11764023.xyz` | 44 | 2012 | 1017 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 196 | `11764017.xyz` | 44 | 2005 | 1018 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 197 | `11763843.xyz` | 44 | 1943 | 1019 | 0 | 0 | 1 | 0 | 24 Sep 2026 |
| 198 | `searchrankgroup.shop` | 38 | 58 | 1 | 0 | 0 | 1 | 0 | 11 Sep 2026 |
| 199 | `backlinkbuilders.shop` | 37 | 55 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 200 | `rankseocollective.shop` | 37 | 200 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |


## 19. Ahrefs referring-domain quality review — page 3 (rows 201–300)

Authenticated Ahrefs Site Explorer snapshot inspected on **2026-10-30**. Confirmed URL parameters: `limit=100&offset=200`; this is page 3 and contains 100 rows.

- Report: https://app.ahrefs.com/site-explorer/refdomains?anchorRules=&bestFilter=all&domainNameRules=&followType=all&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=200&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Dr&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Scope: `inkiva.net/`, Subdomains, all link attributes, DR descending.
- Rows: **201–300 (100)**.
- Ahrefs SPAM labels: **100/100**.
- DR range: **2.1–37**.
- Links to Inkiva: **122**; dofollow links: **4**.
- Zero traffic: **100/100**; zero keywords: **100/100**.
- TLD distribution: `shop`: 92, `site`: 3, `com`: 2, `biz`: 1, `website`: 1, `agency`: 1.


### Page 3 inventory (100 rows)

| # | Referring domain | DR | Dofollow ref. domains | Dofollow linked domains | Traffic | Keywords | Links to target | Dofollow links | First seen |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 201 | `webrankinsights.shop` | 37 | 106 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 202 | `domainrankresults.shop` | 37 | 109 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 203 | `domainrankacademy.shop` | 37 | 119 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 204 | `linkgrowthstudio.shop` | 37 | 57 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 205 | `linkseocollective.shop` | 37 | 61 | 1 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 206 | `siterankbuilders.shop` | 37 | 109 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 207 | `backlinkmasters.shop` | 37 | 55 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 208 | `pageseopartners.shop` | 37 | 55 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 209 | `seolinkcentral.shop` | 37 | 62 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 210 | `seogrowthpipeline.shop` | 37 | 55 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 211 | `linkgrowthsource.shop` | 37 | 66 | 1 | 0 | 0 | 2 | 0 | 17 Sep 2026 |
| 212 | `organicrankdirect.shop` | 37 | 61 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 213 | `organicranksystems.shop` | 37 | 66 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 214 | `linkcollective.shop` | 37 | 63 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 215 | `rankgrowthgroup.shop` | 37 | 55 | 1 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 216 | `toprankcompany.shop` | 37 | 59 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 217 | `siteranksolutions.shop` | 37 | 57 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 218 | `domainrankpartners.shop` | 37 | 60 | 1 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 219 | `rankseojunction.shop` | 37 | 59 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 220 | `webrankresults.shop` | 37 | 64 | 1 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 221 | `pageseoexpress.shop` | 37 | 65 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 222 | `pageseonetwork.shop` | 37 | 62 | 1 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 223 | `seolinkfactory.shop` | 37 | 63 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 224 | `seoboostsystems.shop` | 37 | 64 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 225 | `seogrowthresults.shop` | 37 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 226 | `searchrankbuilders.shop` | 37 | 55 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 227 | `seoboostagency.shop` | 37 | 65 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 228 | `rankgrowthpartners.shop` | 37 | 63 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 229 | `siterankacademy.shop` | 37 | 66 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 230 | `toprankacademy.shop` | 37 | 55 | 1 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 231 | `toprankservice.shop` | 37 | 54 | 1 | 0 | 0 | 2 | 0 | 22 Sep 2026 |
| 232 | `seolinkcompany.shop` | 37 | 62 | 1 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 233 | `pageseoresults.shop` | 37 | 63 | 1 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 234 | `rankgrowthmarket.shop` | 37 | 56 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 235 | `serpcollective.shop` | 37 | 54 | 1 | 0 | 0 | 2 | 0 | 22 Sep 2026 |
| 236 | `pageseosystems.shop` | 37 | 61 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 237 | `rankseomasters.shop` | 37 | 65 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 238 | `domainrankexpress.shop` | 37 | 64 | 1 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 239 | `backlinkinsights.shop` | 37 | 51 | 1 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 240 | `siterankservice.shop` | 37 | 45 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 241 | `seopxl-ranking-boost-lab.shop` | 32 | 17 | 0 | 0 | 0 | 1 | 0 | 11 Sep 2026 |
| 242 | `seopxl-organic-boost-lab.shop` | 32 | 39 | 4 | 0 | 0 | 2 | 0 | 18 Sep 2026 |
| 243 | `seopxl-traffic-growth-lab.shop` | 32 | 35 | 4 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 244 | `seo-growth-authority-boost-hub.shop` | 32 | 25 | 2 | 0 | 0 | 1 | 0 | 10 Sep 2026 |
| 245 | `seopxl-performance-authority-engine.shop` | 32 | 29 | 4 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 246 | `swiftranklab.shop` | 31 | 37 | 0 | 0 | 0 | 2 | 0 | 20 Sep 2026 |
| 247 | `grandranklab.shop` | 31 | 37 | 0 | 0 | 0 | 2 | 0 | 27 Sep 2026 |
| 248 | `brightseohub.shop` | 30 | 36 | 0 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 249 | `freshranklab.shop` | 30 | 34 | 0 | 0 | 0 | 2 | 0 | 27 Sep 2026 |
| 250 | `brightboosthub.shop` | 30 | 35 | 0 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 251 | `brightseolink.shop` | 30 | 35 | 0 | 0 | 0 | 2 | 0 | 20 Sep 2026 |
| 252 | `grandlinkpro.shop` | 30 | 34 | 0 | 0 | 0 | 2 | 0 | 27 Sep 2026 |
| 253 | `swiftseohub.shop` | 30 | 34 | 0 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 254 | `swiftlinkpro.shop` | 30 | 34 | 0 | 0 | 0 | 2 | 0 | 20 Sep 2026 |
| 255 | `brightlinkpro.shop` | 30 | 35 | 0 | 0 | 0 | 2 | 0 | 20 Sep 2026 |
| 256 | `freshseohub.shop` | 30 | 35 | 0 | 0 | 0 | 2 | 0 | 27 Sep 2026 |
| 257 | `authoritypeak.shop` | 30 | 34 | 0 | 0 | 0 | 2 | 0 | 27 Sep 2026 |
| 258 | `quality-manual-link-building.shop` | 26 | 7 | 0 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 259 | `high-authority-contextual-backlink.shop` | 26 | 8 | 0 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 260 | `authority-manual-seo-backlinks.shop` | 26 | 7 | 0 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 261 | `seo-backlinks-contextual-dofollow.site` | 26 | 8 | 0 | 0 | 0 | 2 | 0 | 18 Sep 2026 |
| 262 | `daxsupport.com` | 25 | 49 | 12022806 | 0 | 0 | 1 | 1 | 9 Sep 2026 |
| 263 | `white-hat-high-authority-seo.shop` | 22 | 8 | 0 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 264 | `skyrocket-ranking-with-high-quality-backlinks.site` | 22 | 8 | 0 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 265 | `kaila.biz` | 14 | 1023 | 14923738 | 0 | 0 | 1 | 1 | 12 Sep 2026 |
| 266 | `trafficspike.shop` | 12 | 76 | 1 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 267 | `rankyour.website` | 10 | 213 | 998 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 268 | `webranky.shop` | 7 | 19 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 269 | `link-pen.com` | 6 | 459 | 12855279 | 0 | 0 | 2 | 2 | 17 Sep 2026 |
| 270 | `linkly.agency` | 3.6 | 129 | 3 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 271 | `siteranker.shop` | 3.1 | 70 | 0 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 272 | `seorankoworld.shop` | 2.9 | 45 | 0 | 0 | 0 | 2 | 0 | 10 Sep 2026 |
| 273 | `seotrove.shop` | 2.8 | 79 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 274 | `backlinks-agency.shop` | 2.8 | 49 | 0 | 0 | 0 | 1 | 0 | 13 Sep 2026 |
| 275 | `highqualitybacklink.shop` | 2.8 | 45 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 276 | `backlinksagency.shop` | 2.8 | 47 | 0 | 0 | 0 | 1 | 0 | 13 Sep 2026 |
| 277 | `sitebooster.shop` | 2.8 | 47 | 0 | 0 | 0 | 1 | 0 | 13 Sep 2026 |
| 278 | `websitebooster.shop` | 2.8 | 49 | 0 | 0 | 0 | 1 | 0 | 13 Sep 2026 |
| 279 | `seolinksagency.shop` | 2.8 | 46 | 0 | 0 | 0 | 1 | 0 | 13 Sep 2026 |
| 280 | `rankbundle.shop` | 2.7 | 64 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 281 | `seorankoworld.site` | 2.3 | 28 | 0 | 0 | 0 | 2 | 0 | 9 Sep 2026 |
| 282 | `seo-growth.shop` | 2.1 | 48 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 283 | `ranking-suite.shop` | 2.1 | 48 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 284 | `seo-rank-pro.shop` | 2.1 | 48 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 285 | `rank-forge.shop` | 2.1 | 48 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 286 | `rank-engine.shop` | 2.1 | 44 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 287 | `seo-boosting.shop` | 2.1 | 47 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 288 | `fastseogrowth.shop` | 2.1 | 47 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 289 | `highauthorityseo.shop` | 2.1 | 45 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 290 | `fastseoranking.shop` | 2.1 | 44 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 291 | `rank-optimizer.shop` | 2.1 | 47 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 292 | `seorankingpro.shop` | 2.1 | 46 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 293 | `rankingexpert.shop` | 2.1 | 45 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 294 | `seo-boost-hub.shop` | 2.1 | 47 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 295 | `highseogrowth.shop` | 2.1 | 45 | 0 | 0 | 0 | 2 | 0 | 14 Sep 2026 |
| 296 | `seo-ranking.shop` | 2.1 | 46 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 297 | `site-optimizer.shop` | 2.1 | 44 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 298 | `qualitybacklinks.shop` | 2.1 | 46 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 299 | `seobacklinkly.shop` | 2.1 | 46 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |
| 300 | `ranking-spot.shop` | 2.1 | 44 | 0 | 0 | 0 | 1 | 0 | 15 Sep 2026 |


## 20. Ahrefs referring-domain quality review — page 4 (rows 301–400)

Authenticated Ahrefs Site Explorer snapshot inspected on **2026-10-30**. Confirmed URL parameters: `limit=100&offset=300`; this is page 4 and contains 100 rows.

- Report: https://app.ahrefs.com/site-explorer/refdomains?anchorRules=&bestFilter=all&domainNameRules=&followType=all&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=300&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Dr&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Scope: `inkiva.net/`, Subdomains, all link attributes, DR descending.
- Rows: **301–400 (100)**.
- Ahrefs SPAM labels: **100/100**.
- DR range: **0.1–2.1**.
- Links to Inkiva: **110**; dofollow links: **0**.
- Zero traffic: **99/100**; zero keywords: **99/100**.
- TLD distribution: `shop`: 92, `site`: 7, `agency`: 1.
- Non-zero traffic/keyword rows: `digitalboost.site` (traffic 2, keywords 1).

### Page 4 inventory (100 rows)

| # | Referring domain | DR | Dofollow ref. domains | Dofollow linked domains | Traffic | Keywords | Links to target | Dofollow links | First seen |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 301 | `seogrowing.shop` | 2.1 | 46 | 0 | 0 | 0 | 1 | 0 | 14 Sep 2026 |
| 302 | `digitalboost.site` | 1.7 | 19 | 0 | 2 | 1 | 1 | 0 | 9 Sep 2026 |
| 303 | `nexusnext.agency` | 1.6 | 110 | 998 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 304 | `rankqira.shop` | 1.6 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 305 | `easylinkpro.shop` | 1.6 | 1 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 306 | `linkwares.shop` | 1.3 | 132 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 307 | `rankstash.shop` | 1.3 | 60 | 1 | 0 | 0 | 2 | 0 | 17 Sep 2026 |
| 308 | `rankoutlet.shop` | 1.3 | 113 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 309 | `seostock.shop` | 1.3 | 108 | 1 | 0 | 0 | 2 | 0 | 19 Sep 2026 |
| 310 | `linkcrate.shop` | 1.3 | 77 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 311 | `linkforgepro.shop` | 1.3 | 72 | 997 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 312 | `seolinkkart.shop` | 1.3 | 77 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 313 | `backlinkorbit.shop` | 1.3 | 79 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 314 | `rankbasket.shop` | 1.3 | 75 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 315 | `backlinkshop.shop` | 1.3 | 74 | 998 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 316 | `linkbundle.shop` | 1.3 | 74 | 1 | 0 | 0 | 2 | 0 | 19 Sep 2026 |
| 317 | `backlinkvault.shop` | 1.3 | 74 | 997 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 318 | `primebacklinks.shop` | 1.3 | 75 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 319 | `seowagon.shop` | 1.3 | 75 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 320 | `seomart.shop` | 1.3 | 74 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 321 | `linkstock.shop` | 1.3 | 61 | 998 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 322 | `nexabacklinks.shop` | 1.3 | 63 | 1 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 323 | `rankchest.shop` | 1.2 | 75 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 324 | `rankloot.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 325 | `linkpicks.shop` | 1.2 | 62 | 997 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 326 | `seogear.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 327 | `seofinds.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 328 | `seobundle.shop` | 1.2 | 63 | 1 | 0 | 0 | 1 | 0 | 10 Sep 2026 |
| 329 | `rankseohub.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 330 | `seooutlet.shop` | 1.2 | 57 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 331 | `seocartly.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 332 | `seowarez.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 333 | `linkstockly.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 334 | `seoloot.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 335 | `seoprime.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 336 | `rankwares.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 337 | `rankcart.shop` | 1.2 | 63 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 338 | `rankkit.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 339 | `seowares.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 340 | `rankgoods.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 341 | `rankdepot.shop` | 1.2 | 63 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 342 | `seodepot.shop` | 1.2 | 64 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 343 | `linkdepot.shop` | 1.2 | 60 | 997 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 344 | `ranktrove.shop` | 1.2 | 58 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 345 | `rankstock.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 346 | `seoedge.shop` | 1.2 | 64 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 347 | `linkstash.shop` | 1.2 | 59 | 998 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 348 | `rankmall.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 349 | `rankfinds.shop` | 1.2 | 64 | 1 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 350 | `seosupply.shop` | 1.2 | 61 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 351 | `linkbarn.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 352 | `seocrate.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 353 | `rankgear.shop` | 1.2 | 62 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 354 | `seostash.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 355 | `seobits.shop` | 1.2 | 74 | 1 | 0 | 0 | 1 | 0 | 18 Sep 2026 |
| 356 | `linkchest.shop` | 1.2 | 63 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 357 | `linkwagon.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 358 | `guestpostlinks.shop` | 1.2 | 58 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 359 | `linkloot.shop` | 1.2 | 75 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 360 | `rankpicks.shop` | 1.2 | 75 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 361 | `seobox.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 20 Sep 2026 |
| 362 | `seokart.shop` | 1.2 | 60 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 363 | `rankbazaar.shop` | 1.2 | 59 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 364 | `rankbox.shop` | 1.2 | 63 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 365 | `linksnexa.shop` | 1.2 | 56 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 366 | `linkrank.shop` | 1.2 | 58 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 367 | `fastranking.shop` | 0.6 | 15 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 368 | `winningseo.site` | 0.6 | 13 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 369 | `growwithseo.shop` | 0.6 | 19 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 370 | `trafficexperts.site` | 0.6 | 17 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 371 | `topranking.shop` | 0.6 | 10 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 372 | `rankfirst.shop` | 0.6 | 18 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 373 | `eliteseo.site` | 0.6 | 17 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 374 | `organictraffic.site` | 0.6 | 16 | 0 | 0 | 0 | 1 | 0 | 10 Sep 2026 |
| 375 | `localranking.site` | 0.6 | 13 | 0 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 376 | `getranked.site` | 0.6 | 12 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 377 | `searchwins.shop` | 0.6 | 14 | 0 | 0 | 0 | 1 | 0 | 9 Sep 2026 |
| 378 | `backlink-ranking-agency.shop` | 0.5 | 7 | 0 | 0 | 0 | 1 | 0 | 12 Sep 2026 |
| 379 | `domainrankexperts.shop` | 0.3 | 25 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 380 | `seomiro.shop` | 0.2 | 160 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 381 | `searchrankexperts.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 24 Sep 2026 |
| 382 | `rankgrowthinsights.shop` | 0.1 | 19 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 383 | `indexrixa.shop` | 0.1 | 157 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 384 | `googleseoauthority.shop` | 0.1 | 16 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 385 | `toprankalliance.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 386 | `googleseopoint.shop` | 0.1 | 15 | 1 | 0 | 0 | 1 | 0 | 22 Sep 2026 |
| 387 | `organicranknetwork.shop` | 0.1 | 25 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 388 | `strongseohub.shop` | 0.1 | 137 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 389 | `rankgrowthsolutions.shop` | 0.1 | 22 | 1 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 390 | `linkgrowthauthority.shop` | 0.1 | 15 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 391 | `searchrankcentral.shop` | 0.1 | 23 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 392 | `siterankprovider.shop` | 0.1 | 16 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 393 | `pageseoservice.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 394 | `linkseoauthority.shop` | 0.1 | 25 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 395 | `seogrowthalliance.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 396 | `seolinkexpress.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 397 | `webranksystems.shop` | 0.1 | 13 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 398 | `seogrowthstudio.shop` | 0.1 | 13 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 399 | `seoboostalliance.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 400 | `linkseoprovider.shop` | 0.1 | 24 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |


## 21. Ahrefs referring-domain quality review — page 5 (rows 401–500)

Authenticated Ahrefs Site Explorer snapshot inspected on **2026-10-30**. Confirmed URL parameters: `limit=100&offset=400`; this is page 5 and contains 100 rows.

- Report: https://app.ahrefs.com/site-explorer/refdomains?anchorRules=&bestFilter=all&domainNameRules=&followType=all&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=400&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Dr&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Scope: `inkiva.net/`, Subdomains, all link attributes, DR descending.
- Rows: **401–500 (100)**.
- Ahrefs SPAM labels: **99/100**.
- DR range: **0–0.1**.
- Links to Inkiva: **175**; dofollow links: **1**.
- Zero traffic: **100/100**; zero keywords: **100/100**.
- TLD distribution: `shop`: 99, `dev`: 1.


### Page 5 inventory (100 rows)

| # | Referring domain | DR | Dofollow ref. domains | Dofollow linked domains | Traffic | Keywords | Links to target | Dofollow links | First seen |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 401 | `googleseoexperts.shop` | 0.1 | 13 | 1 | 0 | 0 | 1 | 0 | 21 Sep 2026 |
| 402 | `pageseocollective.shop` | 0.1 | 13 | 1 | 0 | 0 | 2 | 0 | 18 Sep 2026 |
| 403 | `linkseoinsights.shop` | 0.1 | 16 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 404 | `domainrankboost.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 405 | `googleseocompany.shop` | 0.1 | 13 | 1 | 0 | 0 | 2 | 0 | 21 Sep 2026 |
| 406 | `toprankmasters.shop` | 0.1 | 20 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 407 | `toprankprovider.shop` | 0.1 | 12 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 408 | `seoboostexchange.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 409 | `rankgrowthservice.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 410 | `webrankprovider.shop` | 0.1 | 13 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 411 | `pageseomasters.shop` | 0.1 | 13 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 412 | `toprankpartners.shop` | 0.1 | 12 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 413 | `searchrankpipeline.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 414 | `rankgrowthboost.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 415 | `backlinkpartners.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 416 | `seoboostcompany.shop` | 0.1 | 23 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 417 | `rankseotoolkit.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 8 Sep 2026 |
| 418 | `domainrankagency.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 419 | `seogrowthengine.shop` | 0.1 | 13 | 1 | 0 | 0 | 2 | 0 | 19 Sep 2026 |
| 420 | `rankcollective.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 421 | `rankseoalliance.shop` | 0.1 | 22 | 4 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 422 | `organicrankservice.shop` | 0.1 | 14 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 423 | `rankseopartners.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 424 | `searchranksolutions.shop` | 0.1 | 13 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 425 | `rankgrowthagency.shop` | 0.1 | 21 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 426 | `toprankauthority.shop` | 0.1 | 22 | 1 | 0 | 0 | 1 | 0 | 17 Sep 2026 |
| 427 | `rapidboosthub.shop` | 0.1 | 148 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 428 | `nextseolink.shop` | 0.1 | 131 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 429 | `easyseolink.shop` | 0.1 | 139 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 430 | `steadyranklab.shop` | 0.1 | 139 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 431 | `growthanchor.shop` | 0.1 | 135 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 432 | `indextera.shop` | 0.1 | 137 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 433 | `trueboosthub.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 434 | `boostlinker.shop` | 0 | 7 | 1 | 0 | 0 | 1 | 0 | 23 Sep 2026 |
| 435 | `upstar.dev` | 0 | 4 | 6 | 0 | 0 | 2 | 0 | 23 Oct 2026 |
| 436 | `rankqano.shop` | 0 | 14 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 437 | `cleanlinkpro.shop` | 0 | 16 | 1 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 438 | `crawltexa.shop` | 0 | 16 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 439 | `indexqira.shop` | 0 | 10 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 440 | `cleanranklab.shop` | 0 | 6 | 1 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 441 | `sharpranklab.shop` | 0 | 4 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 442 | `sharpseolink.shop` | 0 | 3 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 443 | `serpqaro.shop` | 0 | 3 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 444 | `seotexa.shop` | 0 | 4 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 445 | `steadyboosthub.shop` | 0 | 3 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 446 | `visibilitycraft.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 447 | `rankzira.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 448 | `organicledgerpro.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 449 | `solidranklab.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 450 | `serpxaro.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 451 | `smartseolink.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 452 | `rankingroot.shop` | 0 | 3 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 453 | `crawlvora.shop` | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 454 | `trip-planner.shop` | 0 | 22 | 386596 | 0 | 0 | 1 | 1 | 16 Sep 2026 |
| 455 | `indexvora.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 456 | `contentreach.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 457 | `crispseohub.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 458 | `seozaro.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 459 | `seoqaro.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 460 | `indexlivo.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 461 | `solidlinkpro.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 462 | `linkzaro.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 463 | `boldboosthub.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 464 | `fastseolink.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 465 | `smartseohub.shop` | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 466 | `indexrivo.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 467 | `linkxaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 468 | `easyranklab.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 469 | `rapidranklab.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 470 | `cleanseolink.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 471 | `serplivo.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 472 | `pureranklab.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 473 | `pureseohub.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 474 | `nextboosthub.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 475 | `cleanseohub.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 476 | `serpqira.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 477 | `seoqano.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 478 | `indexmexa.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 479 | `crawlviro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 480 | `linkvilo.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 481 | `rapidseolink.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 482 | `crawlvexa.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 483 | `indexzira.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 484 | `linktexa.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 485 | `seorivo.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 486 | `boldseohub.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 487 | `rankvora.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 488 | `linkviro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 489 | `crawllivo.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 490 | `crispseolink.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 491 | `solidboosthub.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 492 | `rankqaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 493 | `organicreach.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 494 | `fastranklab.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 495 | `serptera.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 496 | `rankmiro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 497 | `indexnexa.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 498 | `indexnaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 499 | `indexvexa.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 500 | `crawllora.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |


## 22. Ahrefs referring-domain quality review — page 6 (rows 501–513)

Authenticated Ahrefs Site Explorer snapshot inspected on **2026-10-30**. Confirmed URL parameters: `limit=100&offset=500`; this is page 6 and contains 13 rows.

- Report: https://app.ahrefs.com/site-explorer/refdomains?anchorRules=&bestFilter=all&domainNameRules=&followType=all&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=500&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Dr&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Scope: `inkiva.net/`, Subdomains, all link attributes, DR descending.
- Rows: **501–513 (13)**.
- Ahrefs SPAM labels: **13/13**.
- DR range: **0–0**.
- Links to Inkiva: **26**; dofollow links: **0**.
- Zero traffic: **13/13**; zero keywords: **13/13**.
- TLD distribution: `shop`: 13.


### Page 6 inventory (13 rows)

| # | Referring domain | DR | Dofollow ref. domains | Dofollow linked domains | Traffic | Keywords | Links to target | Dofollow links | First seen |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 501 | `seozira.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 502 | `indexxaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 503 | `ranknaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 504 | `primeseolink.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 505 | `rankvilo.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 506 | `vividlinkpro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 507 | `crawlzaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 29 Sep 2026 |
| 508 | `quicklinkpro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 509 | `serpzira.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 510 | `strongranklab.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 511 | `rankzaro.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 512 | `quickboosthub.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |
| 513 | `seomexa.shop` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 28 Sep 2026 |


## 23. Full referring-domain reconciliation and backlink-level follow-up

### Full inventory reconciliation — 2026-10-30

All six Ahrefs Referring Domains pages were read from the authenticated UI with 100 rows per page (final page 13 rows), DR descending, `inkiva.net/`, Subdomains scope, all link attributes.

| Metric | Verified result |
|---|---:|
| Referring domains | 513 |
| Ahrefs-labelled SPAM | 512 |
| Not labelled SPAM | 1 (`upstar.dev`, row 435) |
| Backlinks / links to target in the referring-domain rows | 679 |
| Dofollow backlinks | 5 |
| Nofollow backlinks | 674 |
| Domains with dofollow backlinks | 4 |
| Domains with zero estimated traffic | 512 |
| Domains with zero organic keywords | 512 |

The 679 total links and 5 followed links reconcile with the Ahrefs Site Explorer overview snapshot (679 backlinks; 5 followed / 674 nofollow). Referring-domain labels are Ahrefs classifications only; they do not establish a Google manual action or penalty.

### Exceptions requiring page-level inspection

| Referring domain | Dofollow links | Ahrefs DR | Reason to inspect |
|---|---:|---:|---|
| `daxsupport.com` | 1 | 25 | Followed backlink; domain reports 12,022,806 dofollow linked domains |
| `kaila.biz` | 1 | 14 | Followed backlink; domain reports 14,923,738 dofollow linked domains |
| `link-pen.com` | 2 | 6 | Two followed backlinks; domain reports 12,855,279 dofollow linked domains |
| `trip-planner.shop` | 1 | 0 | Followed backlink; domain reports 386,596 dofollow linked domains |
| `upstar.dev` | 0 | 0 | Only referring domain without Ahrefs SPAM label; first seen 2026-10-23 |
| `digitalboost.site` | 0 | 1.6 | Only domain with non-zero estimated organic traffic/keywords in the 513-row inventory (traffic 2, keywords 1); still Ahrefs-labelled SPAM |

The very large linked-domain figures are anomalous but are not proof of a common owner, shared IP, or link network. Source URLs, anchor text, page context, link status, IP/ASN and whether links are still live must be checked before classifying or acting on these domains.

### API access limitation

The Ahrefs API v3 `site-explorer-referring-domains` export and the `site-explorer-all-backlinks` request filtered to `is_dofollow=true` both returned **`Insufficient plan`**. No API data was returned and no plan change was made. The UI remains the available evidence source.

### Next verification step

Open Ahrefs Site Explorer → Backlinks for `inkiva.net/`, select the **Dofollow** filter, and capture all five followed backlink rows. Record for each: source URL, target URL, anchor, source-page title/snippet, first/last seen, HTTP status, IP/ASN where available, and whether the link is contextual/editorial, directory-generated, sitewide, redirect-based, or otherwise suspicious. Then separately inspect the `upstar.dev` and `digitalboost.site` rows. Do not create or submit a Disavow file until this corroborating evidence and Google Search Console Manual actions/Security issues have been reviewed.


## 24. Dofollow backlink source-page inspection — 2026-10-30

### Ahrefs filtered report

Authenticated Ahrefs Backlinks report was opened with `followType=dofollow`, `filterLiveOnly=0`, `grouping=group-similar`, `limit=100`, and `offset=0`.

- Report URL: https://app.ahrefs.com/site-explorer/backlinks?anchorRules=&bestFilter=all&domainNameRules=&filterLiveOnly=0&followType=dofollow&grouping=group-similar&hiddenColumns=&highlightChanges=none&history=all&historyDateRange=24h&ipRules=&limit=100&mode=subdomains&offset=0&projectId=10617729&refPageAuthorRules=&refPageTitleRules=&refPageUrlRules=&sort=Traffic&sortDirection=desc&surroundingRules=&target=inkiva.net%2F&targetUrlRules=
- Ahrefs shows **4 grouped source rows**, reconciling with **5 followed backlinks** in the referring-domain report. The `link-pen.com` group shows `Similar=1`, consistent with its 2 followed links.
- Important: `filterLiveOnly=0` means this is **not a live-only report**. The records may be historical/lost; first-seen and last-seen dates are identical for all four groups. Do not call these five links currently active until the Live-only view is checked.

### Four source groups

| Source domain / URL | DR / UR | Source-page traffic / keywords | Ahrefs anchor / target | First seen = last seen | Ahrefs status |
|---|---:|---:|---|---|---|
| `daxsupport.com` — https://daxsupport.com/list/2026-09-08-247 | 25 / 0 | 0 / 0 | `inkiva.net` and `https://inkiva.net/` (image/listing-style entry) | 2026-09-09 | SPAM |
| `trip-planner.shop` — https://trip-planner.shop/da-dr-momentum-shifted-after-steady-sustainable-seo-support-landed-seo-meal-pack-15206/ | 0 / 0 | 0 / 0 | SEO-service promotional prose containing a contextual `inkiva.net` link and raw URL | 2026-09-16 | SPAM |
| `link-pen.com` — https://link-pen.com/list/2026-09-08-247 | 6 / 0 | 0 / 0 | `inkiva.net` and `https://inkiva.net/` (image/listing-style entry); Similar=1 | 2026-09-17 | SPAM |
| `kaila.biz` — https://kaila.biz/list/2026-09-08-247 | 14 / 0 | 0 / 0 | `inkiva.net` and `https://inkiva.net/` (image/listing-style entry) | 2026-09-12 | SPAM |

### Independent source-page fetch checks

A non-authenticated HTTP fetch was performed on 2026-10-30 using a normal browser user-agent. This is a current accessibility/content check, not a substitute for Google's crawl state or Ahrefs' historical index.

| Source | Current fetch result | Observation | Interpretation |
|---|---|---|---|
| `daxsupport.com` | HTTP 403 | Cloudflare challenge page (`Just a moment...`) with `noindex,nofollow`; source HTML could not be inspected | Inconclusive; challenge blocks this fetch |
| `trip-planner.shop` | HTTP 404 | Current page title is `Page not found – Compass Journey SEO`; no Inkiva link found in returned HTML | The Ahrefs-observed source URL is currently not found in this fetch; likely stale/lost, but confirm with Live-only Ahrefs |
| `link-pen.com` | HTTP 200 | Current page title describes a bulk list of domains registered on 2026-09-08; no `inkiva` occurrence or Inkiva link found in returned HTML | The Ahrefs-observed link was not present in the current HTML snapshot; likely stale/lost, but confirm with Live-only Ahrefs |
| `kaila.biz` | HTTP 403 | Cloudflare challenge page (`Just a moment...`) with `noindex,nofollow`; source HTML could not be inspected | Inconclusive; challenge blocks this fetch |

### Risk assessment

- All four referring domains are explicitly labelled `SPAM` by Ahrefs and have zero reported source-page organic traffic/keywords in the filtered report.
- Two source pages are bulk domain-list pages, one is SEO-service promotional content, and one is another bulk domain-list page. This is not a credible editorial recommendation pattern for a Markdown editor.
- The trip-planner URL currently returns 404, and the link-pen page currently contains no Inkiva mention in the fetched HTML. Daxsupport and kaila could not be inspected because of Cloudflare challenges.
- The current evidence strongly supports classifying these followed links as **low-quality / likely manipulative SEO artifacts**, not valuable editorial citations. However, it does not prove Google has counted them, penalized Inkiva, or that all five are currently live.

### Live-only filter attempt — 2026-10-30

A direct URL attempt changed `filterLiveOnly=0` to `filterLiveOnly=1` while retaining the Dofollow filter. The authenticated Ahrefs page then displayed **“Something went wrong. Please reload the page to continue.”** and returned no backlink rows. Therefore this attempt does **not** verify or establish that Live-only filtering works. Do not rely on the modified URL as a valid filter state.

The current report state must be recovered by clicking Ahrefs' own **Reload page** control. After the report loads, use an explicitly visible Ahrefs UI control for link status/live state if available; verify the resulting report URL and rows before recording a live-only count. If no such control is visible, capture the report's filter panel rather than guessing parameter names or values.

### Required next check

Open the same Ahrefs Backlinks report with the **Live only** filter enabled (the current query parameter is `filterLiveOnly=0`; use the UI's Live-only option and verify the resulting URL/state). Reconcile whether any of the five followed links remain live. Then inspect the single non-SPAM referring domain `upstar.dev` and the low-traffic `digitalboost.site`. Review Google Search Console Manual actions and Security issues. Do not create or submit a Disavow file until live status and Google-side evidence have been checked.
