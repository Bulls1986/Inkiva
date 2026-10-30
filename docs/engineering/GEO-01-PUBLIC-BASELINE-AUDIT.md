# Inkiva GEO-01 / Public Visibility Baseline Audit

- Date: 2026-10-30
- Scope: Public website, public GitHub repository, indexed third-party references, and search-engine discoverability
- Repository: https://github.com/Bulls1986/Inkiva
- Website: https://www.inkiva.net
- Baseline source: `develop` at `a01799457582a30a84a3a23d4dcdf84de29c53cb` (Inkiva v0.6.0 preparation)
- Status: Public-surface audit completed; direct multi-model answer sampling remains pending
- Change policy: This stage is documentation/research only. No product code, website content, or release metadata changed.

## 1. Executive summary

Inkiva already has a stronger technical SEO foundation than a typical early-stage open-source desktop project:

- The public website is indexed and discoverable.
- The website source defines canonical URLs, language alternates, Open Graph/Twitter metadata, Organization/WebSite/SoftwareApplication JSON-LD, per-document TechArticle/BreadcrumbList JSON-LD, a sitemap, and a permissive robots policy.
- The English and Chinese GitHub READMEs clearly identify Inkiva as a free, open-source, document-first Markdown editor.
- Public documentation provides installation, usage, FAQ, feature and developer information.

The primary GEO gap is therefore **not the absence of basic SEO plumbing**. It is the lack of a sufficiently broad, independently corroborated public knowledge footprint around the product's category, differentiation, and decision use cases.

Search results for broad "best Markdown editor" and "Typora alternatives" intents currently surface Typora, MarkText, Obsidian, Zettlr and others, while Inkiva is not present in the observed shortlist results. A third-party repository profile does identify Inkiva, but the available snapshot describes a very small public project footprint. This is a discoverability and authority gap, not evidence of a product-quality deficit.

No direct ChatGPT, Gemini, Claude or Perplexity answer was sampled as part of this audit. Search-result visibility is only a proxy and must not be reported as AI answer mention rate or GEO rank.

## 2. Current product identity to preserve

The authoritative positioning should remain:

> Inkiva is a free, open-source, document-first Markdown desktop editor. It keeps the rendered document visible while writing, works with ordinary CommonMark/GFM files, and adds lightweight navigation and recovery without turning folders into a proprietary workspace.

Supported factual differentiators visible in current public materials:

- Realtime in-place WYSIWYG Markdown editing, with a raw source mode available.
- CommonMark and GitHub Flavored Markdown support.
- Ordinary local Markdown files and folders; no account, cloud service, or proprietary workspace database required.
- Tabs, split editor, outline, Quick Open, folder search and standard relative links/backlinks.
- Autosave, local history and crash recovery.
- Math and diagrams (KaTeX, Mermaid, PlantUML, Flowchart and Vega-Lite).
- Light, Dark and Paper appearances.
- Windows x64 and macOS Intel/Apple Silicon desktop packages.
- Free and open source under GPL-3.0.

Do not position Inkiva as an Obsidian-like knowledge base, cloud collaboration suite, AI writing assistant, Linux editor, or general-purpose workspace. Do not claim unsupported features or invent benchmark advantages. Product documents must remain standard Markdown; GEO work must not add private Markdown syntax or hidden markers.

## 3. Public technical SEO / crawlability audit

### 3.1 Positive findings

| Area | Evidence in current `develop` | Assessment |
|---|---|---|
| Canonical URL | `packages/website/src/lib/seo.ts` | Uses `https://www.inkiva.net` and normalized trailing-slash routes |
| Language alternates | `LANGUAGE_ALTERNATES` | Defines x-default, en-US and zh-CN home routes |
| Page metadata | `layout.tsx`, docs route metadata | Title, description, canonical, Open Graph and Twitter metadata |
| Structured data | `createSiteJsonLd` | Organization, WebSite and SoftwareApplication graph |
| Documentation schema | `createDocumentationJsonLd` | TechArticle and BreadcrumbList for each docs page |
| Robots policy | `src/app/robots.ts` | Wildcard user-agent allow-all rule and sitemap reference |
| Sitemap | `src/app/sitemap.ts` | Home, Chinese home, docs index and every registered docs route |
| Static rendering | Next.js static export and generated docs params | Crawlable static page architecture |
| SEO regression tests | `test/seo-contract.test.ts` | Tests canonical URL shape, unique sitemap URLs and route coverage |

The website's SEO contract is therefore materially implemented, not merely planned.

### 3.2 Gaps and verification items

1. No `llms.txt` file was found in the repository's current website public assets or application routes. This is a low-priority optional discovery aid, not a ranking prerequisite and not a substitute for crawlable pages.
2. Organization `sameAs` currently contains the GitHub repository only. Do not add social profiles unless they are real, controlled and maintained.
3. SoftwareApplication `featureList` is currently a short three-item list. It could be expanded with verified product capabilities, but should stay factual and avoid keyword stuffing.
4. The default metadata title and description identify the category, but do not clearly express the most distinctive decision criteria: in-place WYSIWYG, ordinary local files, portability, and lightweight document-first scope.
5. Chinese homepage metadata is concise and accurate, but the public documentation routes observed are English-first. Chinese search intent has less directly indexable, in-depth explanatory content.
6. The website's visual homepage uses a restrained editorial tone. Its indexed extract contains evocative copy ("A calmer space for deeper writing") but less explicit comparison/selection language than a searcher asking for a Typora alternative would need.
7. Live access to `robots.txt` and `sitemap.xml` was not independently verified in this audit because the web inspection endpoint could not render those resources. The source implementation and SEO contract tests were inspected instead.

## 4. Current public content and brand footprint

### First-party sources

- Website homepage: https://www.inkiva.net/
- User documentation: https://www.inkiva.net/docs/introduction/
- Installation: https://www.inkiva.net/docs/installation/
- Basics: https://www.inkiva.net/docs/basics/
- FAQ: https://www.inkiva.net/docs/faq/
- English README: https://github.com/Bulls1986/Inkiva/blob/develop/README.md
- Chinese README: https://github.com/Bulls1986/Inkiva/blob/develop/README.zh-CN.md
- Releases: https://github.com/Bulls1986/Inkiva/releases

The public website currently exposes installation, basics, editing, Markdown syntax, preferences, key bindings, export, appearances and FAQ documentation. The FAQ answers platform, licensing, knowledge-management positioning, documentation, portable mode and issue reporting. It does not yet answer common product-selection questions such as "Inkiva vs Typora", "best free open-source WYSIWYG Markdown editor", or "which Markdown editor keeps ordinary files local". The current GitHub repository description says "free, open-source WYSIWYG Markdown editor" while the README and website lead with "document-first Markdown editor"; the repository currently has no GitHub topics. Aligning the short description and adding a small set of accurate repository topics is a low-effort entity-consistency opportunity.

### Third-party references observed

- RepoRank profile: https://reporank.net/en/repo/bulls1986-inkiva.html
- Enlisted Typora alternatives list: https://enlisted.directory/alternatives/typora
- Enlisted MarkText profile: https://enlisted.directory/tools/marktext

The RepoRank snapshot identifies the repository and product category but is stale: it records 5 stars and 1 fork as of 2026-09-26, while the GitHub repository API reported 98 stars and 8 forks on 2026-10-30. This discrepancy is a useful reminder to timestamp third-party metrics and prefer the canonical repository for current facts. Enlisted's observed Typora-alternatives page names MarkText as its leading open-source alternative and does not include Inkiva in the visible shortlist. These sources are useful signals, not authoritative product reviews or proof of AI model behavior.

## 5. Search-intent baseline

The following are the target intents to measure consistently. They are not all literal keyword targets; prompt phrasing should vary naturally.

| Intent cluster | Example query | Baseline observation |
|---|---|---|
| Brand discovery | What is Inkiva Markdown editor? | First-party website, docs and GitHub are discoverable |
| Category | Best open-source WYSIWYG Markdown editor | Existing category lists observed surface MarkText and other established projects; Inkiva absent in sampled shortlist |
| Competitor alternative | Open-source alternatives to Typora | MarkText is prominent; Inkiva absent in sampled shortlist |
| Workflow | Markdown editor that edits rendered text without a split preview pane | Product capability is described on first-party sources but lacks independent corroboration |
| File ownership | Markdown editor that keeps ordinary local .md files | README and FAQ explain this well; independent coverage is limited |
| Platform | Free Markdown editor for Windows and macOS | First-party installation page is indexed; third-party selection coverage is limited |
| Reliability | Markdown editor with autosave, local history and crash recovery | Capabilities exist in README/docs; dedicated comparison evidence is limited |

## 6. Priority gaps

### P0 — Make the product entity and decision facts unambiguous

- Establish one canonical product description and reuse it consistently across website, English/Chinese README, documentation, release notes and structured data.
- Explicitly describe the product category and editing model in the first visible paragraph, not only in poetic hero copy.
- Expand the SoftwareApplication feature list with only verified capabilities.
- Review Chinese/English naming consistency: "Inkiva", "Inkiva · 墨映", and "墨映" should resolve to the same product entity.

### P1 — Create answer-oriented first-party knowledge

Build a small number of genuinely useful, evidence-backed pages rather than mass-producing thin keyword pages:

- Inkiva vs Typora: differences, similarities, supported platforms, pricing/licensing, file model and honest trade-offs.
- Inkiva vs MarkText: upstream relationship, current product direction and verified differences; do not imply MarkText is abandoned or inferior.
- What is a document-first Markdown editor?
- WYSIWYG vs split-pane Markdown editing.
- Local Markdown files, portability, backup and recovery.
- A practical feature/compatibility matrix.

Each comparison must be reviewed against the current released version, cite primary sources, disclose uncertainty and explain who should choose the competitor instead.

### P1 — Improve Chinese-language search coverage

- Create Chinese equivalents for high-value selection and usage pages, not just translated landing-page slogans.
- Ensure Chinese metadata, canonical/hreflang and sitemap coverage are correct.
- Use natural Chinese search intents such as "Typora 开源替代品", "免费所见即所得 Markdown 编辑器", "本地 Markdown 编辑器" and "Windows Markdown 编辑器".

### P2 — Earn independent corroboration

- Keep existing third-party listings factually accurate when encountered; do not run an active directory-submission or outreach campaign in this phase.
- Accept genuine independent reviews or practical tutorials if they arise organically and have real editorial value.
- Preserve the existing project preference: no sponsorship, community operations, Product Hunt launch, or broad growth-marketing campaign unless separately requested.
- Encourage authentic user feedback; do not fabricate testimonials, reviews, stars, downloads, community activity or third-party endorsements.
- No paid link schemes, fake accounts, automated forum posting, keyword spam or undisclosed promotional content.

## 7. GEO measurement protocol

### 7.1 Separate three measurement layers

1. **Search discoverability:** whether first-party and third-party pages are indexed for target search intents.
2. **AI answer visibility:** whether a model mentions Inkiva, recommends it, cites a source, and describes it accurately.
3. **Business outcome:** visits from AI/search referrals, downloads, and downstream conversion where measurable.

Never substitute one layer for another.

### 7.2 Prompt benchmark

Use a fixed prompt set covering:

- Brand: "What is Inkiva?"
- Category: "Recommend free open-source WYSIWYG Markdown editors for Windows and macOS."
- Competitor: "What are good open-source alternatives to Typora?"
- Workflow: "I want to edit rendered Markdown directly while keeping normal .md files. What should I use?"
- Privacy/file ownership: "Which Markdown editor works locally without requiring an account or proprietary workspace?"
- Reliability: "Which Markdown editors offer autosave and local recovery?"
- Chinese: "有哪些免费开源、所见即所得的 Markdown 编辑器？"
- Chinese competitor: "Typora 有哪些开源替代品？"

For each prompt, query the same model/product with the same locale and settings. Repeat samples to account for answer variance. Store date, platform/model, exact prompt, full answer, cited URLs, mention status, recommendation status, position, factual accuracy and competitor mentions.

### 7.3 Metrics

- Mention rate = prompts with a correct Inkiva mention / valid prompts sampled.
- Recommendation rate = prompts where Inkiva is presented as a suitable recommendation / valid prompts sampled.
- Citation rate = answers citing a first-party Inkiva source / answers with an Inkiva mention.
- Brand accuracy = verified product facts correctly represented / sampled product facts.
- Share of voice = Inkiva's recommendation/mention share relative to the fixed competitor set.
- Referral and download outcomes should be measured separately using analytics that respect user privacy.

No numerical GEO score is assigned in this report because direct multi-model sampling has not yet been performed.

## 8. Recommended execution sequence

| Stage | Scope | Exit criteria |
|---|---|---|
| GEO-01 | Public-surface baseline (this report) | Repository, website, metadata, structured data, docs, indexed visibility and known gaps recorded |
| GEO-02 | Direct AI answer benchmark | Fixed prompt corpus sampled on selected AI search products; reproducible baseline captured |
| GEO-03 | First-party entity/content improvements | Canonical positioning, metadata/schema improvements and high-value answer pages reviewed and published |
| GEO-04 | Chinese content coverage | High-value Chinese pages published with correct technical metadata |
| GEO-05 | Independent corroboration | Accurate listings/reviews/tutorials from legitimate third-party sources; no fabricated signals |
| GEO-06 | Re-measurement | Same prompt corpus repeated; changes reported against GEO-02 baseline |

## 9. Constraints and non-goals

- Preserve Inkiva's document-first positioning and standard Markdown portability.
- Do not add product features solely to claim GEO keywords.
- Do not create thin doorway pages or duplicate pages targeting near-identical keywords.
- Do not make unsupported performance, security, privacy, compatibility or competitor claims.
- Do not equate a generated AI answer with a stable ranking.
- Do not fabricate external citations, reviews, usage statistics or model visibility measurements.
- Keep execution focused on owned website, documentation and README assets; no sponsorship, Product Hunt, community-operation or broad outreach campaign without separate approval.
- GEO content changes must remain consistent with the actual shipped release, not merely unreleased `develop` capabilities.

## 10. Stage handoff

Completed:
- Read repository `AGENTS.md` and `docs/agent/WORKFLOW.md`.
- Inspected current `develop` branch identity and v0.6.0 preparation commit.
- Audited first-party README, website metadata/JSON-LD, robots policy, sitemap generation, docs routes and SEO contract test.
- Reviewed public website search results and representative third-party category/alternative listings.
- Recorded the distinction between search visibility and direct AI-answer visibility.

Pending:
- Direct multi-model prompt benchmark (ChatGPT, Gemini, Perplexity, Claude where accessible).
- Live verification of robots and sitemap endpoints.
- Verify actual published website HTML metadata/JSON-LD against source build.
- Implement GEO-02/03 only after baseline and content claims are approved against released product facts.

Next action:
- Run GEO-02 with a fixed prompt corpus and record exact model/platform outputs before changing public content.
