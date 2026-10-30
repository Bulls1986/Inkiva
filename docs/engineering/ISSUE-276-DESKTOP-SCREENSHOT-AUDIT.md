# Issue #276 — v0.6.0 real-desktop screenshot and interaction audit

- Audit date: 2026-10-30
- Issue: [#276](https://github.com/Bulls1986/Inkiva/issues/276)
- Status: **first real-desktop screenshot remediation MERGED and website DEPLOYED; Issue #276 stays OPEN for incomplete visual/manual gates**
- Target source branch: `develop@d84828bd760b9672c1b85afc39f0887c66456ef7`
- Reviewed desktop platform: Windows x64, English UI (isolated `preferences.json` language `en-US`), real installed Inkiva **v0.6.0** executable.
- Installed binary SHA-256: `178e7a4f45f0779c1594c03b12cd3a3905c5b7586c1b2b8406670bbba17386fb`
- Installed `resources/app.asar` SHA-256: `8e3a2d6f46854e364b28f8c71bae3f7bd0129aaa67650a4313581f1d1d56aaef`.
- Official v0.6.0 Git tag commit: `a01799457582a30a84a3a23d4dcdf84de29c53cb` (repository reference, **not** claimed as embedded provenance of the installed executable).
- Capture: **Playwright `_electron.launch` against the actual installed `inkiva.exe`**, not browser imitation. Temporary per-test profile and Markdown fixture files under the Windows user's OS temporary directory, separate from the user's real application profile.
- Captures: WebContents screenshots, **1200×800** for the editing window and **950×650** for Preferences. Selected guide assets `inkiva-interface.png` and `inkiva-document-info.png` are cropped vertically to 680 px to exclude unrelated test-fixture content; no interface elements, states or text were synthesized or retouched.

## Historical comparison and actual captures

The original `inkiva-interface.png` and `inkiva-document-info.png` screenshots were created before the v0.6 editing/navigation work. Both show an obsolete top titlebar search field. The original Document Info image also lacks the current **Broken Markdown Links** subsection. These changes were verified by comparing the old repository screenshots with real v0.6.0 captures.

Updated/replaced only the verified screenshots:

| Path under `packages/website/public/docs/assets/` | Real source frame | Result |
| --- | --- | --- |
| `inkiva-interface.png` | isolated v0.6.0 English editor / Outline | updated (old titlebar no longer matches) |
| `inkiva-files.png` | folder opened and `main.md` selected | updated (folder tree/tab are now current) |
| `inkiva-document-info.png` | indexed workspace, `Backlinks`, `Broken Markdown Links` and `Local History` | updated (missing subsection in old image) |
| `inkiva-settings.png` | real Preferences / General window | updated from actual current window |
| `inkiva-broken-link-repair.png` | user clicked visible Repair; genuine `Insert link` dialog | added |
| `inkiva-table-context.png` | actual right-click on Markdown table cell | added |
| `inkiva-table-hardbreak.png` | actual in-editor result after Shift+Enter, **not a disk-save claim** | added |

Guide wording in English and Simplified Chinese was adjusted to reflect observable UI: the clickable broken-link row has the accessible action **Locate source occurrence** and no separate visible **Locate** label; a visible **Repair** button launches the **Insert link** dialog with explicit Cancel/OK.

## Executed interaction evidence

1. **Packaged app launch:** actual installed Windows `inkiva.exe` reports `package.json.version=0.6.0`; started from separate temporary profile. Opened arbitrary Markdown files via CLI without editing the user's own documents; Playwright `firstWindow` returned the real `file://.../app.asar/out/renderer` Electron window.
2. **Files / Outline / Search / Settings:** clicked actual sidebar buttons and captured the resulting WebContents. Settings opened a separate Inkiva Preferences window; captured actual General/Auto Save UI. Search was visited, but a meaningful search-result state has **not** been claimed.
3. **Indexed Backlinks and broken links:** opening a folder (not merely a single document) and then its Markdown file produced a real backlink from `other.md` and a missing link `./nonexistent.md · Missing file`. This demonstrates that the workspace context matters; a single-file run showed the explicit **partial/unverified** state instead of a false complete scan. Clicked the row's **Locate source occurrence** action then the **Repair** button, which opened **Insert link / Destination / Cancel / OK**. No repair was confirmed; no unreviewed file mutation was made.
4. **Table context and hard break:** actual right-click displayed **Insert Row Above**, **Insert Row Below**, **Insert Column Left**, **Insert Column right**, **Delete Row**, **Delete Column**, **Delete Table**. `Shift+Enter` rendered `A<br>` followed by a second line. Playwright DOM selection still had a connected text anchor, and its caret rectangle was `x=498.58, y=261.39, width=0, height=21` in that capture. This is **editor-state evidence**, not full save/reopen/round-trip correctness proof.
5. **Save-state limitation:** after the table edit, the application displayed **Protected in Inkiva only**, and an immediately inspected disk fixture still had its previous content. Therefore **do not claim the hard-break edit persisted on disk**. A later package E2E may qualify persistence separately.
6. **Missing-image state:** an image pointing to a nonexistent file displayed **Load Image Failed** in the real editor. The Choose Image failure/relink/retry workflow was **not exercised to completion**, so failure feedback and no-placeholder correctness remain unverified here.
7. **Command palette / export:** attempted the published `Ctrl+Shift+P` shortcut with focus in Document Info and, separately, after clicking editor content; neither capture displayed a new command launcher. This does **not** by itself prove product failure (shortcut preset/command availability may differ). The previous top-titlebar launcher in the old screenshot is visually absent from the inspected Windows v0.6.0 build. Removed unverified clickable-titlebar and shortcut promises from the two English introductory guides; retain `inkiva-command-palette.png` as an unreferenced historical asset until correctly verified. The Export dialog was not opened in this stage.
8. **Virtualized Outline >300 headings:** a genuine installed Windows v0.6.0 run opened a **340-heading fixture**. The observed `.toc-virtualized-tree` scroller had `scrollHeight=11594` and `clientHeight=556`, while the main editor scroller had `scrollHeight=37092`, `clientHeight=702`; at the start, the first section was mounted and Section 340 was not. After scrolling the outline to its end, mounted tree rows included **Section 333 through Section 340**, while editor scroll remained `0`. This is direct proof of a mounted virtualized tail but **not** proof of keyboard navigation or focus ownership: one attempt did not obtain row focus and a follow-up focused-keyboard execution was blocked. The issue's keyboard and no-jump acceptance remains open.
9. **macOS differences:** no macOS machine was used, so command-modifier and native menu differences remain to be reviewed. The Issue accepts Windows and/or macOS capture for primary screenshots, not fabricated macOS evidence.

## Remaining acceptance / handoff

Issue #276 **must remain open** until the following are substantiated with real application results:

- Revalidate the actual command launcher and Export UI and replace their screenshots only if proven stale.
- Inspect the Settings/Export and other surviving website assets not yet compared against a current UI.
- Complete a genuinely executed >300-heading virtual Outline keyboard focus/navigation/scroll ownership check.
- Complete missing-image relink/failure/retry and show no stranded loading placeholder.
- Verify table Shift+Enter **saved and reopened** with caret behavior, distinguish disk save from recovery-only status.
- Verify the target platform modifier labels (Windows here; macOS when available), and reconcile Chinese/English guide captions.
- Run final **52-page documentation gate**, website test/build, full applicable PR CI and post-merge website deployment. Record exact head/merge/deploy results before calling this PR merged.

## Audit and learning notes

Don't infer fidelity from the presence of PNG files or a green build. The old screenshots preserved a now-removed top search field and omitted broken-document-link diagnostics. Always test link/backlink panels with a genuinely opened folder, otherwise partial results can be mistaken for a product defect. The document save-status indicator has independent semantics: **Protected in Inkiva only** is not a disk write. Keep source Markdown, capture conditions, screenshots and exact observed UI labels tied to the installed binary hash. Do not make a mockup or an AI-generated screenshot and call it an Electron capture.


## PR and website deployment closeout — 2026-10-30

- **Implementation PR:** [#278](https://github.com/Bulls1986/Inkiva/pull/278), squash merged into `develop` at `807c275279cdc0f90f0440b8b257290d5fcd461a`; both GitHub PR and authoritative branch ref independently verified.
- **Full PR validation:** original content/capture head `0f45a764e4ed5db0788155b1a7e06892fbf700a5` completed **11/11 CI checks successfully**, including Test, Lint, E2E, Windows x64/macOS x64/macOS ARM64, three package smokes, updater smoke and artifact link check. Subsequent doc-only head `e2b2439b3d2b6bd40f8472074e83a11f064e2099` only removed unsupported titlebar launcher language and added real 340-heading observations; it used the documented docs-only `[skip ci]` policy, not weaker assertions or omitted product tests.
- **Actual static-site publication:** [Deploy Inkiva website run #41044956993](https://github.com/Bulls1986/Inkiva/actions/runs/41044956993), **workflow_dispatch against exact merge SHA `807c275279cdc0f90f0440b8b257290d5fcd461a`**, completed **SUCCESS**. The job independently passed documentation reference validation, static website build, and GitHub Pages publication.
- **Workflow lesson:** the squash merge message itself inadvertently repeated the literal `[skip ci]` phrase while describing the follow-up, suppressing the intended push-triggered website deploy. The existing official website workflow was manually dispatched on `develop`, with its full checks intact; do not put CI-skip tokens in the final squash message when public site changes must be deployed.
- **Open issue confirmation:** [#276](https://github.com/Bulls1986/Inkiva/issues/276) remains **open**, with progress comments recording evidence and remaining gaps. This PR's release does **not** imply full issue acceptance, full macOS visual qualification, confirmed saved/reopened table, completed missing-image recovery, or proven keyboard focus/no-jump in the virtualized outline.
- **Resume:** complete the still-open real-Electron/visual items in the preceding section; replace additional website PNGs only after directly verifying staleness, and repeat the applicable docs/build/PR gates for any future changes.
