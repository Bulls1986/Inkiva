# D04 — Public end-user documentation modernization

- Date: 2026-10-30
- Status: **merged in [PR #272](https://github.com/Bulls1986/Inkiva/pull/272), merge commit `7218105235c304d4b231cbe6783b5d5ff30a9bae`. Screenshot freshness remains unverified.**
- Repository: https://github.com/Bulls1986/Inkiva
- Base: `develop@8337000e4c741813b7dd90fd2c1fef7991fab987` (D01 / PR #268 merged)
- Branch: `docs/d04-user-guides`
- Scope: update existing public user guides and website-package README without changing website/runtime code or route registry.

## Sources of truth

- [V06-01 link/navigation interaction contract](../product/V0.6-LINK-NAVIGATION-CONTRACT.md), with its final implementation records V06-02 through V06-08 in [product index](../product/README.md).
- [V06-09 Outline correctness](../product/V0.6-OUTLINE-CORRECTNESS-PROGRESS.md) and [V06-12 table correctness](../product/V0.6-TABLE-CORRECTNESS-PROGRESS.md).
- [V06-10 image insertion/path](../product/V0.6-IMAGE-PLACEMENT-PROGRESS.md) and [V06-11 image recovery/resize](../product/V0.6-IMAGE-EDIT-PROGRESS.md).
- Desktop editor interaction contract and existing public user manuals.
- Current `packages/website/package.json`, `packages/website/next.config.ts`, `src/lib/docs-nav.ts` and `.github/workflows/website-deploy.yml`.

## Changed content

- `end-user/BASICS.md`: saved-workspace link completion, deliberate cross-file navigation, backlinks, broken-link diagnosis/explicit repair, outline keyboard access, Local History and crash-recovery boundaries.
- `end-user/EDITING.md`: editing-safe link invocation and gesture, optional move/rename repair choices, table correctness and image handling/Undo behavior.
- `end-user/IMAGES.md`: placement policy, local relative directories, unsaved-document limitations, collision-safe file copying, alt/title-only edits, relink and missing-asset recovery. Clarifies that the broken-document-link report is not an image asset scanner.
- `end-user/FAQ.md`: user answers for relative links, missing files, missing images and local backup/recovery.
- `packages/website/README.md`: replaces obsolete Vite/React standalone instructions with the actual Next.js static export, root pnpm workspace scripts, source tree and GitHub Pages workflow.
- `docs/engineering/README.md`: adds the D04 handoff entry.

## Validation and scope limits

- The changes are **documentation-only**. No test fixtures, production source, scripts, lockfiles, package versions, docs route registry or CI workflow are edited.
- The website contains 32 registered Markdown docs. The new sections reuse existing pages and valid relative targets rather than adding new routes.
- The existing screenshot files were **not regenerated or visually re-captured** in D04. Do not claim screenshots reflect every new v0.6 interaction. A browser/Electron screenshot pass covering missing-link states, image recovery and 300+ Outline rows is a distinct follow-up if new proof is required.
- The changed public guide links were checked, with no missing target. Official PR #272 completed **11/11** checks successfully (including Test, Lint, E2E, three platforms, package and updater smoke). The post-merge [website deployment 41032245513](https://github.com/Bulls1986/Inkiva/actions/runs/41032245513) succeeded.
- The initial documentation-only worktree lacked an installed dependency graph, so no local website build/Electron test is claimed. The official CI results above are separate evidence.
- No implicit knowledge-management workspace, database, cloud backup/sync, bulk asset deletion, wiki-link syntax or automatic global link rewriting is promised.

## Lessons and handoff

Document the exact released interaction rather than extrapolating from feature names. In particular, ordinary link click is an edit gesture, rename/move and optional repair are separate operations, image relink is guarded and the v0.6 broken-link scanner has an intentionally narrow .md/.markdown scope. These contracts reinforce existing agent guidance and do not require another global rule.

D05 owns Chinese documentation parity and translation maintenance. D06's registry/link/asset/anchor gate has now been merged in [PR #273](https://github.com/Bulls1986/Inkiva/pull/273) and deployed. Screenshot recapture/visual acceptance still needs separate evidence; do not silently close it because text or CI passed.
