# Product interaction and user-story documents

This directory contains durable product contracts and resumable implementation records for Inkiva user-facing behavior.

## Durable contracts

- [Desktop Editor Interaction Contract](DESKTOP_EDITOR_INTERACTION_CONTRACT.md) — normative keyboard, mouse, focus, window, search, WYSIWYG, table, context-menu and responsive behavior for Windows/macOS.

## v0.5.0 implementation records

- [v0.5.0 visual baseline adoption record](V0.5-VISUAL-BASELINE.md) — current screenshot inventory, added states, review gates, evidence ledger and outstanding approval.

- [US03 — Untitled Recovery Progress](US03_UNTITLED_RECOVERY_PROGRESS.md)
- [US05 — Workspace / Session Restore](US05-WORKSPACE-RESTORE.md)
- [US07 — Restore Editing Continuity](US07-RESTORE-EDITING-CONTINUITY.md)

## v0.6.0 planning

- [v0.6.0 delivery plan, work breakdown, dependencies and acceptance gates](V0.6-DELIVERY-PLAN.md) — planned scope, static capability inventory, task IDs V06-00–V06-15, estimates, staged calendar, test/architecture guardrails and resumable planning ledger.

- [V06-00 capability audit](V0.6-CAPABILITY-AUDIT.md) — examined code, focused probe evidence, scope decisions and next-stage handoff.

## v0.6.0 interaction contracts

- [V06-01 — Link, Path and Navigation Contract](V0.6-LINK-NAVIGATION-CONTRACT.md) — standard relative Markdown links, explicit navigation, workspace backlinks, broken-link diagnostics and safe rename/move behavior.

## v0.6.0 implementation records

- [V06-02 — Workspace Link Index / Backlinks](V0.6-WORKSPACE-INDEX-PROGRESS.md) — test-first implementation, index and lifecycle hardening, canonical CI, squash-merge record and deferred V06-13/14 issues.
- [V06-03 — Link Insertion / Workspace Document Completion](V0.6-LINK-COMPLETION-PROGRESS.md) — accepted stages, Red/Green evidence, typed IPC, UI focus and async-boundary review, and official CI handoff.
- [V06-04 — Link navigation and target positioning](V0.6-LINK-NAVIGATION-PROGRESS.md) — accepted Red/Green stages, cross-file virtualized heading navigation, stale-intent protections, all latest-head CI gates, and verified PR #235 squash merge.
- [V06-05 — Backlinks completeness and UI](V0.6-BACKLINKS-PROGRESS.md) — executed Red/Green, exact source-occurrence positioning, sidebar state correctness, Electron regression and CI/merge handoff (PR #236).
- [V06-06 — Broken local Markdown link diagnostics](V0.6-BROKEN-LINK-DIAGNOSTICS-PROGRESS.md) — missing/unverified link classification, parser/FS regression, stale-result lifecycle, typed API and closure evidence.
- [V06-07 — Broken link locate and explicit repair](V0.6-BROKEN-LINK-REPAIR-PROGRESS.md) — scoped sidebar diagnostics, exact-source navigation, existing-link completion, cancel/one-Undo and end-to-end closeout.
- [V06-08 — Rename/move repair consistency](V0.6-RENAME-REPAIR-PROGRESS.md) — explicit review, source-revision guard, Local History recovery, multi-file partial-failure diagnostics and verification.
- [V06-09 — Outline UX and correctness](V0.6-OUTLINE-CORRECTNESS-PROGRESS.md) — virtualized keyboard accessibility and outline-only row reveal, existing TOC regressions and verified phase evidence.
- [V06-10 — Image insertion, paste and path policy](V0.6-IMAGE-PLACEMENT-PROGRESS.md) — isolated image ingestion, non-overwriting file persistence, unsaved-document path safety, failure rollback, Red/Green evidence and release gates.
- [V06-11 — Image editing, resize and missing-resource recovery](V0.6-IMAGE-EDIT-PROGRESS.md) — test-first relink safety, existing image-tool UX, virtual-remount and Source mode evidence, CI and merge closeout.
- [V06-12 — Table correctness carry-over](V0.6-TABLE-CORRECTNESS-PROGRESS.md) — v0.5 table acceptance matrix, Issue #224 real Electron focus diagnosis, regression evidence and CI/merge closeout.
- [V06-13 — Performance and lifecycle qualification](../performance/V06-13-PERFORMANCE-LIFECYCLE.md) — representative workspace stress, stale-scan lifecycle Red/Green and acceptance ledger.
- [V06-14 — Integrated correctness and platform acceptance](../correctness/V06-14-INTEGRATED-ACCEPTANCE.md) — traceable cross-feature correctness matrix, regression evidence, latest-head platform/installer/updater CI and explicit manual/performance qualification boundaries.
- [V06-15 — Release readiness audit](../engineering/V0.6-RELEASE-READINESS-AUDIT.md) — version candidate, release gate evidence, known qualification gaps, release-notes draft and stable-release Go/No-Go.

## Loading rule

Open the interaction contract when work changes user-observable desktop editing behavior. Open individual US records only when implementing, auditing, or resuming that story.
