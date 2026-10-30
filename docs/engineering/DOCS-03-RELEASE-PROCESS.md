# D03 — Release and process documentation

- Date: 2026-10-30
- Status: **D03 implementation merged via PR #270; all 11/11 PR checks and post-merge website deployment passed. This record reconciliation is submitted in PR #271.**
- Repository: https://github.com/Bulls1986/Inkiva
- Base: remote develop at **3b125f4cd8bcf40719fa93a18fb22aa331d7681d**
- Branch: docs/d03-release-process
- PR: [#270 — docs: close v0.6.0 release process documentation](https://github.com/Bulls1986/Inkiva/pull/270)
- PR head: **7445a60969c2732c882c770bf99dc7bbab317add**
- Merge commit: **d18a2f5122ab7bb50240dc80382fa3c27654b9c2** (merged 2026-10-30 08:47:29 UTC)
- Follow-up record reconciliation: [PR #271](https://github.com/Bulls1986/Inkiva/pull/271)
- Scope: verify v0.6.0 publication, reconcile release audit and delivery status, update public release/changelog instructions, and add an engineering-record index
- Non-goals: no runtime/product code, CI workflow, package version, Git tag, GitHub Release or release artifact changes

## 1. Authoritative v0.6.0 publication evidence

- PR #258 was squash-merged on 2026-10-28 at **a01799457582a30a84a3a23d4dcdf84de29c53cb**.
- Final PR checks: **13/13 pass** — desktop PR fast hard gate, Test, Lint, E2E, Validate Licenses, three platform builds, three package-smoke jobs, updater artifact smoke and artifact-link publication.
- Annotated stable tag **v0.6.0** points to that exact merge commit.
- GitHub Release [v0.6.0](https://github.com/Bulls1986/Inkiva/releases/tag/v0.6.0) was published on 2026-10-29; it is neither draft nor prerelease.
- Tag workflow [40801116636](https://github.com/Bulls1986/Inkiva/actions/runs/40801116636): **8/8 jobs passed**, including three builds, three package-smoke jobs and final publication.
- All 14 expected assets exist. Downloaded SHA256SUMS.txt contains 13 entries; every entry matches the corresponding GitHub release asset SHA-256 digest.
- Website deployment triggered by release publication passed: [40801117010](https://github.com/Bulls1986/Inkiva/actions/runs/40801117010).
- Root, desktop and website package manifests are all version **0.6.0**.

## 2. Qualification boundaries and status discrepancy

The six 2026-10-28 risk acceptances remain risk acceptances, not test passes:

- #230 native watcher-storm qualification was not evidenced. GitHub currently marks the issue CLOSED via PR #258, while PR #258's explicit risk-acceptance note says acceptance does not close #230. This is a status-reconciliation discrepancy; no issue-state change is made by D03.
- #232 first-frame lower-level trigger remains OPEN.
- #234 isolated memory diagnostic remains OPEN and is not proof of a sustained product leak.
- Native macOS manual acceptance was not executed.
- Reference-machine absolute P0/P1/P2 performance was not executed.
- Real v0.5.0 → v0.6.0 installed-app upgrade and document preservation were not evidenced.

The release-readiness audit and delivery plan now state the published outcome while preserving these distinctions.

## 3. Files updated

- docs/engineering/DOCS-02-DEVELOPER-DOCS.md — corrected D02 PR/merge/CI/deployment status.
- docs/engineering/V0.6-RELEASE-READINESS-AUDIT.md — replaced stale pre-tag disposition with verified publication evidence and retained risk boundaries.
- docs/product/V0.6-DELIVERY-PLAN.md — marked V06-15 publication complete and recorded final tag/workflow/checksum evidence.
- docs/product/README.md — updated the V06-15 audit description.
- docs/README.md and docs/engineering/README.md — added the engineering domain index.
- packages/website/content/docs/CHANGELOG.md — added the v0.6.0 user-visible feature summary and filled the missing v0.4.0, v0.4.1 and v0.5.0 release history from the corresponding published GitHub release notes.
- packages/website/content/docs/dev/RELEASE.md — aligned future release instructions with the current tag workflow, three manifests, 14 assets, updater/checksum verification and website deployment.
- packages/website/content/docs/dev/RELEASE_HOTFIX.md — clarified hotfix branch base, version alignment, tag publication and forward-port requirements.

## 4. Validation

- PR #258 checks: **13/13 passed**.
- v0.6.0 tag release workflow: **8/8 jobs passed**.
- Release asset/checksum verification: **14 assets present; 13/13 checksum entries match GitHub asset digests**.
- D02 PR #269 passed **11/11 checks**; its website deployment passed.
- D03 PR #270 passed **11/11 checks**: PR Build **8/8 jobs** (three platform builds, artifact-link publication, three package-smoke jobs and updater artifact smoke), E2E, Test and Lint. The remaining jobs completed successfully after the PR had been merged; future merges should still wait for required checks to finish.
- Website deployment triggered by the PR #270 merge passed: [workflow 41028832870](https://github.com/Bulls1986/Inkiva/actions/runs/41028832870). The v0.6.0 release-triggered website deployment also passed.
- Documentation registry: **32/32** pages exist. Link validation checked **78 relative links and 17 image references**; zero broken relative targets, zero missing assets, zero broken internal-document links and no relative heading anchors were present in the checked link set.
- CRLF-aware `git diff --check` passed with no new whitespace errors. Pre-existing Markdown hard-break whitespace on untouched planning metadata lines was preserved.
- Website build/test is not claimed locally because root and website node_modules are absent. No dependencies are installed for this documentation-only stage.

## 5. Workflow/environment note

A newly requested managed worktree bootstrap returned `git_unavailable` / `rules_unavailable` and materialized only a `.git` entry; `git status` consequently showed tracked paths as deleted. No file edits or commits were made in that worktree. D03 continued in the existing project from the verified remote `develop` commit **3b125f4cd8bcf40719fa93a18fb22aa331d7681d**. The empty worktree was treated as bootstrap/environment failure, not repository deletion.

The local HTTPS `git push` timed out after 120 seconds; a follow-up `git ls-remote` also timed out. No stale `git.exe` process remained, and no duplicate push or force update was attempted. GitHub independently confirms PR #270's authoritative head **7445a60969c2732c882c770bf99dc7bbab317add** and merge commit **d18a2f5122ab7bb50240dc80382fa3c27654b9c2**. The local runner commit `ead8e8dcdb075834e79cbbf7ca86c9b44a44c461` is not the remote PR head; do not retry or force-push that stale local branch. A later D01 integration advanced `develop` to **8337000e4c741813b7dd90fd2c1fef7991fab987**; PR #271 is based on that latest ref.

## 6. Learning review

- Keep release publication and product qualification as separate evidence categories. A green tag workflow, package smoke or checksum manifest does not prove unexecuted manual, reference-machine or installed-upgrade acceptance.
- Treat the checked-in release workflow as the operational authority. The public release guide should describe its real trigger, supported target matrix, smoke/assembly/publish stages and website deployment rather than repeat an obsolete manual release recipe.
- Verify the downloaded checksum manifest against the published asset digests, not merely by counting files or trusting a workflow summary.
- The documentation navigation/link/asset checks provide useful validation without dependencies; they do not replace a website build. No new agent rule was needed because the existing AGENTS/workflow guidance already covers evidence boundaries, docs-only PRs and merge discipline.
- A failed managed worktree bootstrap is environment evidence, not a source-tree deletion. Continue only from a separately verified clean worktree/base and preserve the failure classification.
- PR #270 was merged while PR Build and E2E were still running; the full **11/11** checks subsequently passed. Record the timing accurately, and wait for required checks before future merges even when the PR is documentation-only.

## 7. Handoff

D03's implementation is merged in PR #270 and its 11/11 CI checks plus website deployment are verified. PR #271 carries only this post-merge stage-record reconciliation; do not merge it without explicit authorization. D04 should refresh end-user feature procedures, screenshots and the remaining stale package-level website README. D05 should establish Chinese documentation parity. D06 should add automated documentation link/anchor/asset checks without broadening product CI path filters.
