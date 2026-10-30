# Inkiva GEO-04 / AI Discovery File — Release Verification and Handoff

- Audit date: 2026-10-30
- Scope: GEO-04 auxiliary AI discovery content (`llms.txt`), CI, static export and GitHub Pages deployment
- Source repository: https://github.com/Bulls1986/Inkiva
- Publishing repository: https://github.com/Bulls1986/Bulls1986.github.io
- Implementation PR: https://github.com/Bulls1986/Inkiva/pull/262
- Source merge commit: `996d3908a98a2a69b6788b88b818bc374b2bb78b`
- Status: **Implementation, CI, and GitHub Pages publishing verified**. A separate successful external HTTP response from `www.inkiva.net` was *not* established in this session.

## 1. Delivered scope

- Added `packages/website/public/llms.txt`.
- Included concise authoritative product facts, official website/docs/release links, English and Chinese comparison links, MarkText provenance, current Windows/macOS scope and explicit Linux non-support.
- Added assertions in `packages/website/scripts/verify-seo-output.ts` to ensure the generated static export contains `llms.txt` with its essential entity and boundary facts.
- Did not modify desktop runtime or user Markdown semantics.

`llms.txt` is strictly an optional machine-readable reference, **not a validated GEO ranking lever**. Google states that Google Search does not use this file for ranking or AI Overviews; maintain substantive HTML and authoritative public documentation as the main discovery assets.

## 2. CI evidence

The following PR-head workflows completed successfully on commit `c10308f13f065a85ca9c9624f1763f492f981de7`.

| Check | Result | Workflow |
|---|---|---|
| Website unit tests, website build, SEO output verification and repository unit tests | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984429158 |
| ESLint and TypeScript typecheck | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984428973 |
| E2E tests | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984428980 |
| Windows x64 package build and smoke | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984428966 |
| macOS Intel x64 package build and smoke | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984428966 |
| macOS Apple Silicon arm64 package build and smoke | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984428966 |
| Updater artifact smoke | PASS | https://github.com/Bulls1986/Inkiva/actions/runs/40984428966 |

The GitHub Actions jobs were observed to have `conclusion=success`. In particular, the SEO static-output verification step succeeded.

## 3. Production publication evidence

- Deploy workflow: https://github.com/Bulls1986/Inkiva/actions/runs/40985329568 — completed successfully.
- Source commit deployed: `996d3908a98a2a69b6788b88b818bc374b2bb78b`.
- GitHub Pages publishing repository `Bulls1986/Bulls1986.github.io` branch `master` advanced to `d1d70aff23218f19e23d742e4b04e1acb7d59829`.
- Publishing commit date: `2026-10-30T01:21:58Z`.
- Publishing commit message explicitly states it deployed from source commit `996d3908`.

The published `master` tree was inspected through the repository API. These files are present:

- `llms.txt`
- `index.html` and `zh-CN/index.html`
- `compare/typora/index.html`
- `zh-CN/compare/typora/index.html`
- `robots.txt`
- `sitemap.xml`

The published `llms.txt` contains links to both comparison pages, source/release/docs URLs and factual statements concerning the MarkText relationship and current Linux scope.

The published Sitemap contains 37 URLs and includes both comparison routes. Robots allows `User-Agent: *` to access `/` and points to `https://www.inkiva.net/sitemap.xml`. Both comparison pages have canonical URLs, reciprocal `en-US`/`zh-CN` language alternates, page descriptions and JSON-LD. The Chinese comparison page has `TechArticle.inLanguage = zh-CN`.

**Verification limit:** direct HTTPS reads of `https://www.inkiva.net/` failed in the available web/browser environment, and a direct container HTTP check could not resolve the host. Therefore the audit confirms successful GitHub Pages publication and published files, **not** independent current-domain HTTP 200 checks or search-engine indexing.

## 4. Open issue — Chinese document root language

The current published Chinese homepage and comparison page statically contain `<html lang="en">`. Root-layout client-side bootstrap changes `document.documentElement.lang` to `zh-CN` on `/zh-CN/` paths, and page content uses an explicit `lang="zh-CN"` wrapper. Chinese metadata, canonical and `hreflang` are correct.

- Classification: **P2 language semantics/accessibility consistency** (not an established SEO ranking regression).
- Google Search Central notes that Google primarily detects language from visible content, and does not use the HTML `lang` attribute to determine a page's language.
- Do not apply a fragile post-build rewrite or intrusive route migration solely to address this.
- Consider a separately designed locale-aware root layout only if the expected accessibility/architecture value exceeds its risk. Regression tests must compare static exported HTML for both languages and ensure unchanged canonical/hreflang/structured data.

## 5. Additional work not completed by GEO-04

The original broader GEO program defined Chinese content coverage as a separate priority. Adding `llms.txt` **does not satisfy** the full Chinese educational/documentation content backlog. Items still open:

- Rich Chinese answers for editor-selection workflows and Markdown file ownership/recovery.
- Real, multi-provider AI-answer sampling: ChatGPT Search, Gemini, Claude and Perplexity must be tested in fresh sessions with raw answers, exact prompts, model/mode, date and citations.
- Index coverage in search webmaster tools and a verified HTTP response from the official domain.
- GitHub repository topics (the public repo currently has no topics).
- Legitimate third-party coverage (no fake listings, fabricated testimonials or spam).

## 6. Lessons and handoff

1. Do not infer website publishing from a merged PR or green unit tests. Check the deploy workflow and independent published repository commit.
2. Do not infer a live public-domain HTTP response from GitHub Pages repository contents. Record the two verification levels separately.
3. Machine-readable AI discovery content has low leverage unless the rest of the site is independently findable and credible; avoid ranking promises or keyword stuffing.
4. Chinese `hreflang`, localized content and accurate product facts are higher-priority GEO signals than `llms.txt` alone.
5. Published static HTML showed a root `lang` inconsistency; track it as a separate accessibility/semantics concern rather than broadening this low-risk GEO change.

Next: begin **GEO-05 external discoverability/source coverage audit** (research only) and complete a direct AI-answer baseline when authenticated product sessions are available. Preserve the distinction between web-search result samples and actual model citations or recommendations.
