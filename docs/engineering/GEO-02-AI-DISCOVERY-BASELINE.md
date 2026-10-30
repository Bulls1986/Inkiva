# Inkiva GEO-02 / AI Discovery Baseline

- Date: 2026-10-30
- Repository: https://github.com/Bulls1986/Inkiva
- Website: https://www.inkiva.net
- Baseline branch: `develop` at `a01799457582a30a84a3a23d4dcdf84de29c53cb`
- Related stage: GEO-01, `docs/engineering/GEO-01-PUBLIC-BASELINE-AUDIT.md`
- Status: Search-discovery proxy completed; direct multi-provider AI answer sampling is not available in this execution environment and remains explicitly pending.
- Scope: Public discovery only. No product code or public website content changed.

## 1. Executive result

Inkiva is discoverable when a searcher already knows the brand name. It is not yet consistently discoverable for generic category and competitor-selection intents.

The current observed pattern:

- Brand query: first-party homepage and installation documentation appear.
- Feature query: first-party docs expose supported platforms, installation artifacts, Markdown compatibility and product workflow.
- Generic category query: established products such as MarkText and newer products such as SoloMD appear in curated/editorial results; Inkiva does not appear in the sampled shortlists.
- Typora-alternative query: Enlisted's current open-source alternatives list names MarkText as its top recommendation and does not list Inkiva in the visible shortlist.
- Chinese-language recommendation query: observed free Markdown editor lists mention MarkText, SoloMD, Zettlr, Obsidian, Joplin and others, but not Inkiva.

This is evidence of a **brand-to-category discovery gap**, not proof that a specific AI model never recommends Inkiva.

## 2. Method and limitations

### Search-discovery proxy

On 2026-10-30, a fixed set of five category/brand queries and four exact-brand queries was submitted to public web search. A second, slower search pass was used for selected competitor and Chinese-language intents.

The sampled intents:

1. Best open-source WYSIWYG Markdown editor for Windows and macOS.
2. Open-source alternatives to Typora.
3. Inkiva Markdown editor features, local files, autosave and recovery.
4. Free/open-source WYSIWYG Markdown editor (Chinese).
5. Inkiva / 墨映 Markdown editor official website and GitHub.
6. Exact-domain searches for Inkiva's official site and GitHub.
7. Inkiva + Typora co-occurrence.
8. Chinese Inkiva / 墨映 review and recommendation searches.

### Important limitation

This execution environment provides public web search and source inspection, but does not provide authenticated interactive sessions to ChatGPT Search, Gemini, Claude and Perplexity as separate products. Their actual generated answers, citations and recommendation order therefore were **not sampled**.

Search snippets, web rankings and this report must not be represented as direct AI-answer benchmark results. GEO-02 is consequently a partial baseline: search discovery is recorded; multi-provider AI answer visibility remains pending.

To complete the direct model benchmark, the exact prompt corpus in section 7 must be submitted manually or through authorized product sessions, preserving raw answers and citations.

## 3. Query observations

| Query intent | Observed public results | Inkiva visibility |
|---|---|---|
| Exact brand: Inkiva Markdown editor | Official homepage and installation docs appear | First-party discoverability confirmed |
| Exact brand + Typora | No strong independent Inkiva/Typora comparison result surfaced in the sampled results | Weak |
| Best open-source WYSIWYG Markdown editor | MarkText and SoloMD product/editorial pages surfaced; Inkiva absent from sampled results | Weak |
| Open-source Typora alternatives | Enlisted list identifies MarkText as best open-source alternative; Inkiva absent from visible shortlist | Weak |
| Chinese free Markdown editor recommendations | To Be Free list includes MarkText, SoloMD, Zettlr, Obsidian, Joplin and others; Inkiva absent | Weak |
| Inkiva product features | Official homepage and installation page surfaced with product facts | Strong for navigational/brand intent |
| Chinese Inkiva / 墨映 reviews | No substantial independent review or comparison surfaced in sampled results | Weak |

These observations are a point-in-time sample, not exhaustive rankings. Search systems personalize and reorder results; the same query can change over time.

## 4. Evidence and source notes

### First-party

- Homepage: https://www.inkiva.net/
- Installation documentation: https://www.inkiva.net/docs/installation/
- GitHub repository: https://github.com/Bulls1986/Inkiva
- Releases: https://github.com/Bulls1986/Inkiva/releases

The observed homepage search extract describes Inkiva as a document-first Markdown editor, emphasizes in-place rendering and ordinary Markdown files, and mentions local history, autosave and crash recovery. The installation documentation states free/open-source status and Windows x64, macOS Intel and Apple silicon support.

The homepage result was crawled several weeks before this test and still displayed v0.5.0 in its extract. Treat this as a stale-index observation, not proof that the live website currently serves stale version metadata. After the v0.6.0 website deployment, verify the live rendered HTML and request/observe recrawling.

### Independent/category sources

- Enlisted Typora alternatives, updated 2026-10-28: https://enlisted.directory/alternatives/typora
- To Be Free free Markdown editor collection: https://tobefree.app/zh/collections/free-markdown-editors/
- Ichi Windows Markdown editor comparison: https://www.withichi.com/guides/best-markdown-editors-windows/
- Tencent Cloud Typora alternatives article: https://cloud.tencent.com/developer/article/2646512
- RepoRank Inkiva comparison snapshot: https://reporank.net/en/compare.html?repos=sadsnake1-word-smith%2Cbulls1986-inkiva

These sources differ in freshness, editorial quality and selection criteria. Curated lists should be treated as evidence of the current content ecosystem, not objective product rankings.

## 5. Competitor landscape relevant to the sampled intents

The goal is not to claim Inkiva is universally better. The goal is to make the product's actual fit legible to a searcher and to AI systems.

| Product | Publicly emphasized positioning | Relevance to Inkiva |
|---|---|---|
| Typora | Paid, polished in-place Markdown writing experience | Primary commercial reference for the WYSIWYG workflow |
| MarkText | Open-source, in-place rendering, cross-platform | Closest well-known open-source comparison point; Inkiva's MarkText provenance must be described accurately |
| SoloMD | Free/open-source, local-first, broad platforms and extra AI/knowledge features | Competes for free editor and Typora replacement search intent |
| Zettlr | Research and long-form writing, citations/references | Adjacent but broader research workflow |
| Obsidian | Local Markdown vault, knowledge management and plugins | Different category; do not position Inkiva as an Obsidian replacement for knowledge graphs/plugins |
| HorseMD | Recent WYSIWYG Markdown editor emphasizing tabs and file-tree workflow | Emerging direct alternative; verify release maturity and supported features before detailed comparison |
| Markflow | Lightweight bilingual local-first Markdown editor | Emerging Windows/macOS alternative; verify current release status before detailed comparison |

Competitor pages make many claims about speed, memory, installer size, privacy and feature superiority. Inkiva should not repeat such claims without controlled, reproducible evidence.

## 6. Main GEO issues revealed

### P0 — Entity consistency and disambiguation

1. The name "Inkiva" is not globally unique. Search results also surface unrelated Inkiva skincare and Inkiva Technologies/company references. The product entity should consistently be expressed as "Inkiva Markdown editor" or "Inkiva · 墨映 Markdown 编辑器" in high-value page titles, descriptions and first paragraphs.
2. Current GitHub repository description says "free, open-source WYSIWYG Markdown editor", while the website and README lead with "document-first Markdown editor". Both are compatible, but the short canonical description should combine category and differentiator consistently.
3. GitHub repository currently has no Topics. Add a restrained, accurate set after confirming desired public discoverability; candidates include `markdown-editor`, `wysiwyg`, `electron`, `desktop-app`, `commonmark`, `gfm`, `windows`, `macos`. Do not add topics that imply Linux support, note-taking/PKM or AI capabilities.

### P1 — Answer the actual selection question

Create one substantive comparison page, not a set of thin keyword landing pages:

- "Inkiva vs Typora vs MarkText: choosing a document-first Markdown editor"
- Explain similarities first: rendered in-place Markdown editing and ordinary Markdown files.
- Explain differences factually: licensing/pricing, supported OS, file/folder workflow, navigation, recovery, diagrams, export, theming and release maturity.
- Explicitly state who should choose Typora or MarkText instead.
- Link every claim to official product docs or repository evidence and state the version/date checked.

### P1 — Strengthen Chinese product discovery

Create Chinese equivalents for:
- Inkiva 是什么：文档优先的 Markdown 编辑器
- Inkiva、Typora、MarkText 如何选择
- 免费开源的所见即所得 Markdown 编辑器
- 普通 Markdown 文件、本地文件夹、自动保存与恢复说明

The Chinese copy should use natural user vocabulary and explain actual workflows, not mechanically translate English marketing slogans.

### P2 — Improve fresh crawl signals

After the next website release:
- Verify the rendered homepage's title, description, canonical, hreflang, JSON-LD and visible release version.
- Verify `/robots.txt` and `/sitemap.xml` on the live host.
- Ensure the sitemap contains the current indexable English and Chinese routes.
- Use Search Console/Bing Webmaster tools if configured and authorized; submit updated sitemap and inspect indexing state.
- Do not claim that a sitemap submission guarantees indexing.

### P2 — Earn independent corroboration carefully

- Prefer authentic user tutorials, independent comparisons and maintained software directories.
- Do not create fake reviews, fake community accounts, paid links, automated forum posts or mass-generated listicles.
- No sponsorship, Product Hunt launch or community-operations campaign is included in this scope unless separately approved.

## 7. Direct AI answer benchmark corpus

Use these exact prompts for each product: ChatGPT Search, Gemini, Claude and Perplexity, where access is available. Run in a fresh session with no Inkiva conversation context. Record exact model/version, product mode, locale, date/time, raw answer, cited URLs and screenshots/export where available.

### English

1. "Recommend free and open-source desktop Markdown editors for Windows and macOS. I prefer true in-place WYSIWYG editing rather than a split preview pane, and I want to keep ordinary local .md files."
2. "What are the best open-source alternatives to Typora in 2026? Compare editing experience, file model, platforms, license and project activity."
3. "I need a document-first Markdown editor for technical documentation, with tables, math, diagrams, autosave and local recovery. What should I evaluate?"
4. "Compare Inkiva, Typora and MarkText. What are the meaningful differences, and who should choose each one?"
5. "What is Inkiva, the Markdown editor? Summarize its verified features, platforms, license and limitations using primary sources."

### Chinese

6. "推荐几款免费开源的桌面 Markdown 编辑器，要求 Windows/macOS、所见即所得、直接编辑渲染后的文档，不要左右分栏预览，并且保留普通本地 md 文件。"
7. "Typora 有哪些开源替代品？请比较 Inkiva、MarkText 等产品的编辑体验、文件模型、平台、许可证和项目活跃度。"
8. "Inkiva（墨映）Markdown 编辑器是什么？请根据官网和 GitHub 介绍其功能、平台、许可证和限制。"

### Scoring rubric

Score each valid response independently:

- Brand mention: 0/1
- Correct category identification: 0/1
- Recommendation fit: 0/1 (only if it recommends Inkiva for a matching requirement)
- First-party citation: 0/1
- Factual accuracy: 0–5
- Unsupported claims: count and severity
- Competitor set and ordering: record verbatim

Do not combine these into one opaque score. Report mention rate, recommendation rate, citation rate and factual accuracy separately. Run at least two samples per prompt/product where possible to account for answer variance.

## 8. Stage outcome

Completed:
- Fixed search-intent corpus sampled on 2026-10-30.
- Brand/navigational discovery and generic category discovery observations recorded.
- Relevant English and Chinese competitor/list ecosystem reviewed.
- Brand collision, inconsistent category description, missing repository topics and stale search-cache observation identified.
- Distinction between search-discovery proxy and actual AI-generated answer benchmark preserved.

Not completed:
- Direct interactive answer sampling from ChatGPT Search, Gemini, Claude and Perplexity.
- Live website endpoint verification and search-console inspection.
- Quantitative AI mention/recommendation/citation rate.

## 9. Recommended next stage

GEO-03 should start with a narrowly scoped owned-content package:

1. Align the GitHub short description, topics, homepage metadata and canonical product description.
2. Add one English and one Chinese comparison/selection page based on the same factual matrix.
3. Add explicit product entity disambiguation ("Inkiva Markdown editor / Inkiva · 墨映") to relevant page metadata and first paragraphs.
4. Add tests for metadata and structured-data consistency where the current website test architecture supports them.
5. Validate generated static HTML and run existing website tests before merging.

No product-code changes are justified by GEO-02 alone.
