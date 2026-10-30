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
