# Inkiva GEO-05 / Independent Discovery and Reference Coverage

- Audit date: 2026-10-30
- Scope: Read-only inspection of public editor directories, competitor-selection articles and repository metadata
- Source repository: https://github.com/Bulls1986/Inkiva
- Related milestones: GEO-01/02 search baseline; GEO-03 first-party comparison content; GEO-04 published `llms.txt`
- Status: **Evidence review complete; external publication/outreach not attempted**.
- Intent: Improve real entity discoverability without link spam, paid placements, fabricated reviews or broad community operations.

## 1. Observed gap

Inkiva can be found by its own name but is not included in the following four sampled editorial/category lists as of this audit. MarkText and other established alternatives are present in their visible results.

| Independent source | URL | Observed evidence | Current Inkiva presence |
|---|---|---|---|
| Enlisted: 2026 open-source Typora alternatives | https://enlisted.directory/alternatives/typora | A ranked list of 11 open-source alternatives, headed by MarkText, with recent GitHub activity and license data | Not listed in sampled rendered page |
| markdown.org/apps: desktop Markdown editor directory | https://markdown.org/apps/ | Category directory lists Typora, MarkText, Zettlr, VS Code and other desktop tools | Not listed in sampled rendered page |
| Open Source Tools: Markdown editor category | https://opensourcetools.org/category/markdown-editor/ | Eight listed open-source Markdown editors, headed by MarkText | Not listed in sampled rendered page |
| Markdific: 2026 Typora alternatives | https://markdific.com/blog/typora-alternatives/ | Vendor-authored comparison listing 14 alternatives including MarkText and others | Not listed in sampled rendered page |

The last source is authored by a commercial competitor, not an independent neutral directory. It is useful competitor-content evidence but should be weighted below verified neutral editorial references. Absence from these four sampled pages is not proof of universal absence from the web or of any AI model's response.

## 2. What the comparison indicates

- **Brand search is a separate success criterion from category visibility.** First-party search visibility does not imply recommendation among Typora alternatives.
- **Project listing metadata is actionable.** The canonical GitHub repository currently has no Topics (checked 2026-10-30); this reduces GitHub's topic-based discovery compared with many listed projects. The current description already mentions free/open-source WYSIWYG Markdown editing but should align fully with the document-first Windows/macOS positioning.
- **The publicly surfaced category includes heterogeneous products.** Some lists mix Markdown editors with note-taking/PKM tools or cloud collaboration systems. Do not recast Inkiva as a PKM product just to gain entry.
- **Do not exaggerate the authority of `llms.txt`.** Google Search does not use this file for ranking; crawled HTML, canonical product facts, real editorial references, and reliable product information remain higher-value.
- **No artificial metric.** The observable sample is four distinct pages with no visible Inkiva entry, not a quantified GEO Share of Voice or a multi-model recommendation rate.

## 3. Prioritized improvement opportunities

### P0: Owned repository entity metadata

- Add accurate GitHub Topics, initially limited to `markdown-editor`, `wysiwyg`, `desktop-app`, `electron`, `commonmark`, `gfm`, `windows`, `macos`, `open-source` where GitHub's Topic nomenclature accepts them.
- Avoid `linux`, `ai`, `collaboration`, `knowledge-base`, `pkm`, or any feature/category claim beyond released product behavior.
- Keep repository description succinct and compatible with the website: `Inkiva (墨映) — a free, open-source, document-first WYSIWYG Markdown editor for Windows and macOS.`
- Keep homepage URL as an absolute canonical HTTPS address rather than an ambiguous scheme-less domain, if repository settings permit.

These changes touch repository settings, not source files. They are **not applied by this document-only audit**, and need an authorized repository-metadata edit workflow; available repository-content tools did not provide a Topics mutation action.

### P1: Evidence-backed comparison content quality

- Maintain the bilingual Inkiva/Typora/MarkText comparison added in GEO-03.
- Review comparison facts against published releases after each significant Inkiva version or competitor change.
- Extend Chinese content only when it provides new explanatory value: ordinary Markdown file ownership; in-place editing vs split preview; autosave/recovery behavior; how to decide between paid Typora and open-source editors.
- Do not mass-generate near-identical landing pages for superficial keyword coverage.

### P2: Organic independent references

- Check whether relevant maintained tool indexes have a transparent correction/submission process.
- Prepare a small factual product profile with name, URLs, license, supported OS, release link, upstream relationship and explicit non-goals; reuse the canonical website language.
- Seek genuine independent tutorials or comparisons only where editors/users have a reason to publish them.
- Do not submit without checking site rules or represent a paid listing as independent editorial validation.
- **Outreach and directory submission are outside this GEO phase** unless authorized separately.

## 4. Evidence-quality rules

For every third-party reference later included in the GEO measurement:

1. Record the precise URL, observation timestamp and exact version/date represented.
2. Distinguish editorial content, user review, vendor marketing, scraped directory and automated GitHub ranking.
3. Verify that the reference actually discusses Inkiva rather than an unrelated brand with the same name.
4. Mark source claims that are stale or unsupported, including features, release versions, download totals and supported OS.
5. Record citation/reference visibility separately from recommendation (being cited does not prove the AI prefers the product).

No outreach, sponsored content, artificial endorsements, purchased backlinks, mass listing submissions, fake GitHub stars, fake Q&A or manipulated model-answer tests.

## 5. Remaining GEO measurement gap

Direct AI-answer visibility is unmeasured. For the eight fixed prompts in GEO-02, capture *actual* fresh-session outputs in ChatGPT Search, Gemini, Claude and Perplexity (if available), including raw answers, citations, product/mode, locale and repeated samples. Do not reuse this conversation's responses as independent ChatGPT-search measurements; this conversation contains detailed Inkiva context.

Report each metric independently:
- Brand mention rate.
- Appropriate recommendation rate.
- First-party citation rate.
- Correct fact attribution and unsupported claims.
- Competitor set/relative order.
- Search-to-download referral only when trustworthy analytics exist.

## 6. Handoff

**Completed in this stage:** four-source public category audit, independent/vendor source classification, repo metadata check and prioritized non-spam follow-up plan.

**Unfinished:** Topics and repository description settings, external editorial submissions or references, direct AI-answer benchmark, and independent production-domain HTTP/indexability confirmation.

**Next best action:** update repository Topics and canonical description via an explicitly authorized repository-settings interface; separately validate it. Continue Chinese content coverage and independent prompt sampling. Do not interpret third-party shortlist absence as the product being rejected by AI.

## 7. Learning review

The GEO-03 comparison pages and GEO-04 machine-readable reference improve owned-source clarity but do not automatically place Inkiva in generic public rankings. Distinguish the mechanisms: owned-source comprehensibility, repository-category indexing, organic third-party recognition and model-answer visibility. Keep a dated, reproducible audit for each rather than one opaque GEO score.
