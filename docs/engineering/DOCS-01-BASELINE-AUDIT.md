# Inkiva documentation modernization — D01 baseline audit

- Date: 2026-10-30
- Status: **D01 complete and integrated; D02 and D03 merged; D04–D06 pending**
- Repository: https://github.com/Bulls1986/Inkiva
- Base: remote develop at **d334e029463a35cdac73f5b5f0120c6b19fcb9f0**
- Branch: docs/d01-documentation-baseline
- Scope: documentation inventory, source-of-truth mapping, stale/incomplete content audit, index repair and staged remediation plan
- Non-goals: no desktop runtime, website behavior, release or deployment changes

## 1. Executive summary

The documentation is not uniformly obsolete. Internal architecture, product-contract and engineering-stage records contain substantial current work, but the public developer and end-user manuals have not kept pace with the v0.5/v0.6 implementation. Several engineering records also retain pre-publication status after the v0.6.0 release was actually published.

The primary risks are:

1. **Incorrect developer guidance:** public architecture and TypeScript manuals still describe the pre-monorepo source layout and a future JavaScript-to-TypeScript Muya migration that has already materially changed.
2. **Missing user workflows:** the end-user manual does not explain several major v0.6 capabilities, especially link completion/navigation/repair and image editing/relink recovery.
3. **Stale release state:** the v0.6 delivery plan and release-readiness audit still describe a candidate awaiting publication even though the stable tag, GitHub Release, 14 assets and website deployment are complete.
4. **Missing navigation:** engineering and stability records were not included in the main documentation map; the correctness index omitted multiple existing records, including US14 and V06-14.
5. **No automated documentation link gate:** the website has a page registry, search-index builder, SEO verifier and website tests, but no dedicated check for local Markdown links, image targets and heading anchors.

D01 repairs the unambiguous index gaps and records the remaining work as D02–D06. Historical evidence is preserved; historical documents are not rewritten to pretend they were authored against the current code.

## 2. Audit method and authoritative sources

The audit used the latest fetched remote develop, not an old local checkout. The exact base is recorded above.

Source-of-truth hierarchy for the next stages:

1. **AGENTS.md** and **docs/agent/** define repository workflow, testing and engineering governance.
2. **docs/architecture/** defines durable architecture boundaries and closure evidence.
3. **docs/product/DESKTOP_EDITOR_INTERACTION_CONTRACT.md** defines normative user-observable desktop/editor interaction.
4. **docs/product/**, **docs/correctness/**, **docs/performance/** and **docs/stability/** hold stage-specific implementation and acceptance evidence.
5. **packages/website/src/lib/docs-nav.ts** is the public documentation route registry.
6. **packages/website/content/docs/** is the source for the website's English user and developer manuals.
7. Root README files describe the product at a high level; they are not substitutes for detailed user or developer manuals.

A historical report may remain valid evidence for its observation date while no longer describing the current state.

## 3. Repository documentation inventory

At the audited develop baseline, before the D01 index and audit additions, there were **191 tracked Markdown files**:

| Location | Files | Interpretation |
|---|---:|---|
| Repository root | 5 | Agent entrypoint, English/Chinese README, notices and design QA |
| docs/ | 98 | Engineering contracts, stage records, translations and assets guidance |
| Website documentation source | 32 | Public end-user and developer pages |
| Other repository locations | 56 | Package docs, contribution guides, test plans and Markdown fixtures |

Domain counts inside docs/ include 14 architecture files, 24 correctness files, 12 engineering files and one stability record. The other docs domains include agent, benchmark, performance, product, i18n and assets.

The website registry contains **32 pages: 20 user pages and 12 developer pages**. All 32 registered Markdown source files exist. The current registry has English user/developer tabs only; there is no Chinese documentation tab or localized user-manual route.

A renderer-aware source scan covered the 32 website pages. It checked 78 relative links, including 17 image references, against the current documentation registry and public documentation asset layout. It found **zero unresolved relative targets and zero missing image assets**. This is a one-time audit result, not an automated CI guarantee.

The 11 files under docs/i18n/ are translated README documents, not a translated version of the current website manual. Sampled translations still contain links to the former MarkText-style docs/end-user, docs/dev and docs/CHANGELOG paths; those paths do not exist in the current repository layout. D05 must decide which translations remain maintained and update or clearly retire stale links.

## 4. Findings and remediation priority

| ID | Priority | Finding | Evidence / affected documents | Planned stage |
|---|---|---|---|---|
| DOC-01 | P0 | Public changelog stops at v0.3.0; it omits v0.4.1, v0.5.0 and v0.6.0. | packages/website/content/docs/CHANGELOG.md | D03 |
| DOC-02 | P0 | v0.6 release records still say the tag/publication has not started and candidate CI is pending. | docs/product/V0.6-DELIVERY-PLAN.md; docs/engineering/V0.6-RELEASE-READINESS-AUDIT.md | D03 |
| DOC-03 | P0 | Developer architecture and TypeScript manuals describe the old source layout and an unfinished Muya TypeScript migration. | packages/website/content/docs/dev/ARCHITECTURE.md; TYPESCRIPT.md | D02 |
| DOC-04 | P0 | End-user manuals do not document the main v0.6 link and asset workflows. | packages/website/content/docs/end-user/BASICS.md, EDITING.md and IMAGES.md | D04 |
| DOC-05 | P1 | Public developer documentation contains platform claims that conflict with current supported release targets. | dev/INTERFACE.md mentions Linux titlebar behavior; end-user/KEYBINDINGS.md labels shortcuts Windows/Linux although Linux is not a release target | D02 |
| DOC-06 | P1 | IPC documentation needs a source-backed path and contract review; its examples use package-relative src paths without clearly declaring the package root. | packages/website/content/docs/dev/IPC.md; docs/architecture/ARCH-02-IPC-CONTRACT.md | D02 |
| DOC-07 | P1 | Performance documentation focuses on an older manual profiler workflow and does not direct contributors to the current Fast Gate, measurement contracts and performance evidence indexes. | packages/website/content/docs/dev/PERFORMANCE.md; docs/agent/PERFORMANCE.md; docs/performance/README.md | D02 |
| DOC-08 | P1 | Official website user documentation is English-only; translated README files are not a substitute and contain old relative links. | packages/website/src/lib/docs-nav.ts; docs/i18n/ | D05 |
| DOC-09 | P1 | Documentation domain indexes were incomplete. Engineering and stability were absent from docs/README.md; engineering had no index; correctness omitted US14, V06-14 and several historical records. | docs/README.md; docs/engineering/; docs/stability/; docs/correctness/README.md | D01 index repair; D06 validation |
| DOC-10 | P1 | No dedicated automated local-link/image/anchor validator was found in the website scripts or tests. | Website scripts currently provide docs-index generation and SEO-output verification; website tests cover platform, release and SEO contracts | D06 |
| DOC-11 | P1 | A v0.5 architecture follow-up is still described as a TODO that must close inside the v0.5 release line, although its implementation is recorded complete and only canonical CI validation remains pending. | docs/architecture/README.md; docs/architecture/V0.5-ARCHITECTURE-TODO.md | D01 index clarification; later evidence review |
| DOC-12 | P1 | Earlier GEO reports say the GitHub repository has no Topics, but the later GEO-06 audit verifies 11 Topics. The older reports are valid historical snapshots, not current metadata. | docs/engineering/GEO-04-RELEASE-VERIFICATION.md; GEO-05-EXTERNAL-DISCOVERY-BASELINE.md; GEO-06-LIVE-INDEXING-BASELINE.md | D01 index clarification |
| DOC-13 | P2 | Screenshot freshness and exact menu/shortcut wording have not been comprehensively revalidated against the current desktop UI. | Website user-guide assets and BASICS/EDITING/EXPORT/PREFERENCES pages | D04 |
| DOC-14 | P2 | Several long-lived historical records have status language that should be read in the context of their original branch/date, not as current develop status. | Older US, table, architecture and release stage records | D01 index clarification; D06 conventions |

### 4.1 Developer documentation: confirmed stale content

- ARCHITECTURE.md describes a single source tree with src/main, src/renderer and src/muya, and says Muya is still JavaScript.
- TYPESCRIPT.md says the legacy src/muya JavaScript tree will be replaced by upstream TypeScript Muya. The current workspace has a packages/desktop source tree and a separate packages/muya package; packages/muya/src contains 481 TypeScript/TSX files and one JavaScript file.
- INTERFACE.md describes Linux titlebar behavior even though Linux is not a supported release target.
- KEYBINDINGS.md labels the default shortcut table Windows/Linux, while the supported product platforms are Windows and macOS.
- RELEASE.md says the root package.json is the only file that needs a version change. The v0.6.0 preparation changed root, desktop and website package manifests plus version-bound release fixtures. The guide must be reconciled with the actual workflow.
- IPC.md retains useful typed-channel concepts, but its paths and examples must be checked against the current package boundary and ARCH-02 before rewriting.
- PERFORMANCE.md may remain useful as a low-level profiling reference, but it must distinguish manual profiling from the canonical performance gates and link the current contracts.

### 4.2 End-user documentation: confirmed coverage gaps

The current manual explains the general document-first workflow, tabs, sidebar, backlinks/local history entry points, basic Markdown editing, tables, basic image insertion and export. It does not yet provide usable step-by-step guidance for:

- workspace link candidate completion and deliberate cross-document/heading navigation;
- backlinks occurrence navigation and workspace indexing boundaries;
- broken local-link diagnostics, locating the source occurrence and explicit repair/cancel behavior;
- guarded rename/move reference repair and failure/recovery behavior;
- image insertion/path policy, image editing/resizing, relinking and missing-resource recovery;
- the current virtualized Outline keyboard/focus behavior and its interaction boundaries;
- the v0.6 table correctness and interaction model.

These gaps must be documented from the shipped UI and accepted product contracts, not inferred from task titles alone.

## 5. Verified release and public-discovery facts

The release-readiness documents were checked against GitHub's current repository records rather than trusting their old handoff text.

- PR #258 is merged into develop.
- The v0.6.0 tag points to release commit **a01799457582a30a84a3a23d4dcdf84de29c53cb**.
- GitHub Release v0.6.0 is published (not draft and not prerelease), with publication time **2026-10-29 01:33:17 UTC**.
- The release contains **14 assets**: four macOS ARM64 files, four macOS x64 files, three Windows x64 files, two updater metadata files and SHA256SUMS.txt.
- Tag-triggered Release Inkiva workflow run **#23** completed successfully; website deployment run **#98** also completed successfully.
- The published release body includes SHA-256 verification instructions and the unsigned/unnotarized macOS Gatekeeper warning.
- The six v0.6.0 qualification gaps remain explicitly risk-accepted, not passed. Later GitHub records show #230 closed via PR #258 despite its native watcher-storm qualification remaining unevidenced; #232 and #234 remain open. Preserve the issue-state/evidence discrepancy.

The later GEO-06 record verifies 11 GitHub Topics and production HTTP checks. Therefore the earlier GEO-04/GEO-05 statements that Topics were absent must be treated as dated historical observations. GEO-06 still records Page indexing/Sitemap drill-down and direct multi-provider AI-answer sampling as pending; do not claim these were completed by the website release.

## 6. Staged remediation plan

| Stage | Scope | Required outcome |
|---|---|---|
| D02 — Developer documentation | Architecture, TypeScript, IPC, interface, build/debug, performance and release-development guidance | All paths, package boundaries, toolchains and engineering workflows match current code and authoritative contracts |
| D03 — Release and version documentation | v0.6 post-publication audit, delivery-plan status, public CHANGELOG, release process and performance/release evidence links | Published v0.6.0 state is accurate; release risks remain correctly classified; release guide matches actual manifests/workflow/assets |
| D04 — End-user documentation | Link/backlink/repair workflows, image workflows, Outline, tables, recovery and current UI screenshots | Every significant released workflow has a user-oriented procedure with accurate labels, actions, outcomes and recovery behavior |
| D05 — Chinese and product-facing documentation | Chinese user manual, root README parity, translated README disposition and bilingual terminology | Chinese and English product facts/features/platform claims remain consistent; stale inherited links are removed or explicitly retired |
| D06 — Documentation quality gate | Registry source checks, relative Markdown links, image assets, anchors, platform/version claims and update ownership | CI fails on broken public docs references and missing nav sources; contributors have a short docs update checklist |

D02–D05 are primarily documentation/content work. D05 may change website route/navigation code to add localized pages; D06 will add scripts/tests/CI. Before either stage changes production code or workflows, the normal AGENTS.md pre-mutation gate applies: read TESTING.md and ARCHITECTURE_RELEASE.md, identify the boundary, and retain executable Red evidence.

## 7. D01 changes

- Added an engineering-domain index covering the GEO, release and cross-domain engineering records.
- Added a stability-domain index for the completed STAB-01 lifecycle/memory record.
- Added engineering and stability to the main docs map, root AGENTS.md navigation and the workflow domain index.
- Completed the correctness index with US14, V06-14 and the omitted historical implementation/learning records.
- Reclassified the v0.5 architecture TODO in its index as a historical follow-up with implementation recorded complete and CI evidence still pending.
- Added this D01 audit and the D02–D06 handoff plan.

No historical stage report was rewritten as if it had been created on the current develop head.

## 8. Validation and limitations

- Inventory: **191** tracked Markdown files; **32/32** public documentation registry sources exist.
- Website relative-link scan: **78** local relative links, including **17** image references; **0** unresolved relative links and **0** missing image assets.
- The link scan used the actual website Markdown rewrite rules and public docs asset root; it excluded fenced code examples.
- GitHub release/tag/workflow records were independently re-read for the v0.6.0 publication facts above.
- No desktop source, website runtime code, website route registry or CI workflow was changed in D01.
- This managed worktree has no installed node_modules, so website test/build execution is not claimed. The docs-only changes will still receive Git diff whitespace checks and deterministic source/link/index validation. Per the repository workflow, docs-only changes do not justify running the heavyweight desktop build/E2E/performance matrix.
- This audit did not independently repeat live-domain HTTP, Search Console or Ahrefs measurements; GEO-06 remains the dated source for those observations.

## 9. Handoff

D01 is complete. Next: D02, beginning with the developer manuals and reconciling each statement against the current package tree, source code, workflow files and ARCH contracts. Keep D02 separate from the v0.6 release-record correction in D03 so each stage has a reviewable scope and evidence trail.


## 10. Integration addendum — 2026-10-30

The inventory, findings, version figures and stale-status examples above describe the original D01 baseline at `d334e029`; they are historical evidence, not a declaration that every issue remains unaddressed today.

- D02: [PR #269](https://github.com/Bulls1986/Inkiva/pull/269) merged as `3b125f4cd8bcf40719fa93a18fb22aa331d7681d`, updating developer guides. See [D02 stage record](DOCS-02-DEVELOPER-DOCS.md).
- D03: [PR #270](https://github.com/Bulls1986/Inkiva/pull/270) merged as `d18a2f5122ab7bb50240dc80382fa3c27654b9c2`, updating release documentation and public changelog. See [D03 stage record](DOCS-03-RELEASE-PROCESS.md).
- D01: this index and audit PR #268 was rebased onto the then-current `develop` after #270 landed. Its original engineering-index replacement was discarded in favor of preserving the newer D03 index and inserting only the missing D01 entry. The same applies to the docs map, which preserves the D03 engineering row while adding stability and completing its placement rule.
- Follow-ups: D04 (end-user workflows/screenshots), D05 (Chinese/product-facing parity), D06 (docs validation gate) remain future scoped work.

**Integration safeguard:** no D02/D03 release audit, changelog, package, website guide or previously merged documentation was reverted. D01 modifies only agent/domain indexes and creates its dated baseline audit/stability index. The PR is merged with squash only after checks and the authoritative develop ref are reverified.
