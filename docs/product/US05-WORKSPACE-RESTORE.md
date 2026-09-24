# US05 — Workspace / Session Restore

Status: implementation complete; local validation complete
Branch: `feat/v0.5-us05`
Base: `develop@cd00ada`

## Scope

US05 closes the restart / workspace recovery contract without redesigning existing Inkiva UI. The supplied prototype is interaction reference only; existing Inkiva components, layout and visual baseline remain authoritative.

Acceptance focus:

- preserve tab order and the last active tab;
- restore each document's own WYSIWYG / Source mode;
- restore a semantic reading anchor instead of depending only on an old pixel offset;
- restore sidebar selection/width, tab-bar state and Outline expansion state;
- keep inaccessible files explicit and recoverable without silently substituting same-name files;
- make the active document interactive before inactive-tab disk validation / derived work;
- keep existing window-position visibility safeguards and startup-target behavior intact.

## Stage 1 — Diagnosis

Existing coverage already provides:

- deterministic tab order and path de-duplication in buffer-store merge;
- independent untitled drafts;
- current tab identity;
- sidebar visibility/width, selected side panel (`rightColumn`) and tab-bar persistence;
- window position normalization through the existing window-state path;
- corrupt recovery-file fallback.

Confirmed gaps:

1. Source/WYSIWYG mode is currently window-scoped (`preferencesStore.sourceCode`), so different tabs cannot restore different modes.
2. Outline collapsed keys live only in local component state and are lost on restart/tab reconstruction.
3. Per-tab state persists raw `scrollTop` but no semantic heading anchor.
4. main-process restore waits for every on-disk tab read before publishing `mt::load-state`, delaying the active document behind inactive tabs.
5. missing/unreadable files remain in the buffer but currently surface mainly as a global error notification rather than a tab-scoped restore condition.

## Implementation principles

- Extend the existing buffered-state contract; do not introduce a second session store.
- Keep legacy recovery files readable.
- Make document-specific state owned by the document/tab, not by global preferences.
- Use stable TOC keys/slugs and ignore anchors that no longer exist.
- Active document first; inactive disk reconciliation must not overwrite unsaved recovery content.
- No prototype-driven visual replacement of existing editor/sidebar/tab UI.

## Validation ledger

- [x] focused red tests for per-tab mode + semantic/Outline persistence
- [x] focused green tests
- [x] restore-buffer unit tests
- [x] targeted Electron restore E2E
- [x] typecheck
- [x] final workspace/diff/hygiene review

## Stage log

### 2026-09-24 — Stage 1 complete

Read AGENTS.md and canonical environment/workflow/testing guidance, recovered a clean worktree using the documented Windows fallback, mapped US05 to the existing recovery architecture, and recorded the five structural gaps above. No production code changed before establishing focused regression tests.

The first candidate worktree exposed the documented `Denied ID ...other-worktree...` Vitest topology problem and its offline install exceeded the Runner shell limit. Per ENVIRONMENT.md that run was classified as environment evidence only. The task was migrated to a clean pre-warmed worktree with its own isolated dependency graph before retrying the focused red test.

### 2026-09-24 — Stage 2 complete: document-owned restore state

Implemented the missing document-owned state on the existing tab/buffer contract rather than introducing another session store:

- per-tab `sourceCodeMode`, with legacy snapshots falling back to the configured new-document default;
- per-tab semantic `viewportAnchorSlug`, while retaining `scrollTop` only as a fallback;
- per-tab stable Outline collapsed keys;
- current-tab mode is captured again at the persistence boundary so closing immediately after a mode switch cannot serialize stale state;
- tab activation applies the target document mode without changing `sourceCodeModeEnabled`, which remains the default for newly created tabs.

The WYSIWYG restore path now resolves the stored heading against the freshly rendered TOC. Missing/renamed headings clear the invalid anchor and fall back to the prior pixel/caret position; they never jump to an unrelated heading.

Focused TDD evidence:

- initial focused run: 2 tests executed / 2 failed for the intended missing contracts;
- implementation run: focused tests green;
- final focused + existing buffer-store regression: 10/10 tests green.

### 2026-09-24 — Stage 3 complete: active-document-first recovery

The main-process recovery path no longer waits for every saved tab to be read from disk before publishing `mt::load-state`.

- The active tab is reconciled first and is the only disk read allowed to gate first interaction.
- The renderer receives tab order/current/layout and buffered content immediately afterward.
- Inactive saved tabs reconcile from disk asynchronously through typed IPC.
- A late inactive disk read may only update a tab that is still clean (`isSaved === true`), preventing delayed I/O from overwriting recovered/user edits.
- Missing/deleted/permission-denied paths keep their buffered draft and original pathname, become unsaved, and receive an existing Inkiva tab-scoped warning. The message points users to the existing Save As / tab-close recovery workflows; no prototype-specific notification UI was introduced.

Validation:

- desktop `vue-tsc --noEmit`: PASS;
- `workspace-restore-state.spec.ts` + `buffer-store-restore.spec.ts`: 10/10 PASS;
- real Electron `restore-buffer-store.spec.ts`: 3/3 PASS, including multi-window recovery merge/dedupe and corrupt-state fallback.

## Lessons retained

1. Session restoration state must be owned at the same granularity as the user expectation: document mode/viewport/Outline belong to the tab, while the preference only defines the new-tab default.
2. A semantic viewport anchor is authoritative only while the exact heading still exists; stale anchors must degrade to positional fallback, never fuzzy-match.
3. Startup recovery needs two phases: **active document first**, then background reconciliation. A single `Promise.all` over every restored file turns unrelated inactive I/O into user-visible startup latency.
4. Background reconciliation needs a freshness guard. In Inkiva, `isSaved` is the safe boundary: once a recovered tab is dirty, delayed disk I/O must not replace its Markdown.
5. Existing UI should remain authoritative for recovery feedback. Extend the state/protocol first; avoid recreating prototype-era panels when the current tab notification, Save As, and close workflows already provide the interaction surface.

### 2026-09-24 — Stage 4 complete: validation and closure

- Final Git status contained only the seven intentional production files plus this stage document and the focused US05 test.
- Workspace hygiene reported no secret/cache/large-file blockers; the new test was correctly identified as an intentional untracked test prior to commit.
- `show_changes` itself returned a WebCodex `git status unavailable` transport/tool error twice, so review fell back to direct Git status/stat plus targeted file inspection rather than treating the tool failure as product evidence.
- `git diff --check` initially reported every newly added line in `editor.vue` as trailing whitespace. `git ls-files --eol` proved the file is intentionally tracked and checked out as CRLF (`i/crlf w/crlf`). Re-running the check with `core.whitespace=cr-at-eol` passed; no line-ending rewrite was performed.
- Final real-Electron restore E2E remained 3/3 green and focused/unit recovery coverage remained 10/10 green.

### 2026-09-24 — Stage 5: PR CI diagnosis and semantic-restore scoping fix

PR #190 exposed 10 Linux full-suite E2E failures where WYSIWYG/diagram content existed in the DOM but remained hidden. This was diagnosed as a US05 integration bug rather than retried as flakiness.

Root cause:

- `handleFileChange` used `currentFile.viewportAnchorSlug` as a fallback whenever the event itself did not carry a semantic anchor.
- That accidentally applied session/tab semantic-viewport restoration to unrelated `file-changed` paths such as Source → WYSIWYG handoff and disk reload.
- Those paths could therefore hide the WYSIWYG surface while waiting for a semantic restore callback they never intended to schedule, creating a timing-sensitive hidden-editor state that was amplified by Linux full-suite CI.

Fix:

- `viewportAnchorSlug` is now an explicit optional field in the typed `file-changed` bus contract.
- Only actual tab activation sends the semantic anchor.
- Source handoff, external reload and other ordinary `file-changed` producers keep their prior behavior and cannot inherit the current tab's anchor implicitly.
- Initial session restore still restores the active document's semantic anchor directly from the restored tab state.

Post-fix evidence:

- focused restore/buffer unit suite: 10/10 PASS;
- desktop typecheck: PASS;
- targeted set covering Source roundtrip, 8-tab Source isolation, table command suppression, virtualized code blocks and Mermaid recovery: all US05-relevant hidden-surface cases PASS;
- the only local failure in that targeted run was the pre-existing/independent Source Find search-bar readiness case, which reproduces without the hidden-editor symptom and was intentionally not modified as part of US05.
