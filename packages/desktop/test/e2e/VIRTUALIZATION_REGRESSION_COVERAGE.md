# Virtualization / Render Surface regression coverage

This matrix maps the high-risk virtualization and Render Surface scenarios to deterministic automated coverage. It intentionally separates browser/Electron automation from platform-only acceptance so CI does not claim coverage it cannot prove.

## PR smoke / targeted virtualization

| Domain | Scenario IDs / regression | Automated spec |
| --- | --- | --- |
| Core virtual model | Ctrl/Cmd+A, full-document Delete/Undo, cross-window selection, Home/End, Find distant target, Tab restore, Source round-trip, resize geometry | `virtualization-core.spec.ts` |
| Selection / history | SEL-012, COMBO-001, HIST-001/003/004, COMBO-002; browser-native pointer selection then click-away, cross-window logical selection, edit->scroll->native Undo, repeated Undo/Redo after window changes | `virtualization-selection-history.spec.ts` + `virtualization-core.spec.ts` |
| Outline / scroll | OUT-003/005/006/007/015/020; distant outline jumps, scrolling updates active heading, repeated top/middle/bottom sync | `virtualization-outline-scroll.spec.ts` |
| Mermaid / height changes | SCR-012/013, DIA-006/008/009, SOURCE-INVALID-003; multiple diagram regions never roll back, invalid intermediate Mermaid is isolated and recoverable | `virtualization-diagram-recovery.spec.ts` |
| Async geometry invalidation | GEO-ASYNC-001; Mermaid blocks intentionally placed at virtual segment tails, repeated async height changes keep viewport materialized and Outline aligned | `virtualization-async-geometry.spec.ts` |
| Source / Focus / CJK | SOURCE-LIFE-006, SOURCE-SYNC-013, CN-FIND-006, CN-OUT-003, FOCUS-008/034, CN-FOCUS-001; full logical source, distant Chinese Find/Outline, Focus editing + Undo | `virtualization-source-view-cjk.spec.ts` |
| Daily editing / save | EDIT-004/005/008/010/011, PASTE-004/005/008, SAVE-001/004; Enter split, Backspace/Delete merge, large multi-paragraph paste, latest-revision save with an unmounted document tail | `virtualization-editing-operations.spec.ts` |
| Complex blocks | TABL-004/012, CODE-003/004/006; distant virtualized table edit/Undo and fenced-code edit → scroll-away → remount → Undo | `virtualization-complex-blocks.spec.ts` |
| Shortcut profiles | physical/native Save, Select All/Delete/Undo, Find, Source, Focus, Sidebar and Zoom using the current command registry; runtime switch to MarkText profile and its actual Source binding | `virtualization-shortcuts.spec.ts` + `keybinding-style.spec.ts` |
| Local images | IMG-VIRT-009, IMG-CN-002, IMG-SRC-001/007; offscreen local image stays unmounted, remount/lazy-load, Chinese/space path, ASCII control, Source round-trip | `virtualization-local-image.spec.ts` |
| Existing diagram scroll range | hidden Mermaid source must not enlarge the document scroll range | `diagram-scroll-range.spec.ts` |
| Existing TOC content | heading rename/addition and tree hierarchy refresh | `toc-panel-content.spec.ts` |

Run the targeted gate with `pnpm test:e2e:virtualization`. Each virtualization domain is a separate spec file so Playwright can schedule independent files across workers. Mutable Markdown fixtures and Electron user-data directories are created per launch/test; the local-image suite creates a private temp directory per test.

## Current PR #150 baseline: intentionally failing regression guards

The targeted suite is fail-closed. These failures are retained because they reproduce product behavior on the current PR #150 branch; assertions must not be weakened merely to make CI green:

Latest Windows Electron run on 2026-09-19: **38 tests, 32 passed, 6 failed, 2.8 min with 2 Playwright workers**. The six failures are the known guards listed below; all other targeted virtualization cases passed in the same run.

- **Outline follows the wrong section after document scrolling.** Direct virtualized scroll jumps can leave the active outline entry inconsistent with the section actually visible in the editor.
- **Outline click can highlight one entry while the document lands in another section.** One captured case clicked `Virtual Heading 46` while the visible document remained in section 45.
- **Repeated top/middle/bottom navigation can accumulate an Outline/document mismatch.**
- **Chinese Outline navigation can select the wrong heading.** Repeated captures targeting `中文标题 37` have activated later headings instead (for example 39/40), confirming the mismatch is not tied to one exact offset.
- **Offscreen local images do not re-enter the image loading/rendering state after their virtual region is mounted.** The mounted block shows the image placeholder but no `<img>`. This reproduces with both the Chinese/space relative path and an equivalent ASCII `assets/tall.png` control, so it is not a filename-encoding-only failure.
- **Typora-profile Zoom In shortcut is configured but does not trigger the Window Zoom command in the Electron E2E path.** The same BrowserWindow native input path successfully triggers Save, Find, Source and Sidebar bindings, while `window.zoomIn = Ctrl+Shift+Plus` leaves the zoom factor unchanged. Keep this fail-closed until the binding/accelerator is corrected or a platform-level test proves an alternate physical mapping.

Other added virtualization regression cases currently pass, including Mermaid multi-region scrolling and invalid-source recovery, Source full-document round-trip, Focus+CJK edit/Undo, selection click-away safety, edit→scroll→native Undo, repeated Undo/Redo, Enter split, Backspace/Delete merge, large paste, distant table/code editing, native Save/Find/Source/Focus/Sidebar shortcut paths, MarkText-profile Source switching, and saving the latest revision while the document tail remains unmounted.

## Explicit non-automated / platform acceptance gaps

- Native Windows Microsoft Pinyin candidate-window behavior and native macOS Pinyin candidate-window behavior are not proven by synthetic CompositionEvent tests. CI covers the editor composition lifecycle only; real IME remains packaged/platform acceptance.
- Press-drag-release text selection across multiple contenteditable blocks remains a headed/platform acceptance case until the Playwright/Electron harness can produce that DOM selection deterministically. The automated gate still covers browser-native pointer selection + click-away safety and logical cross-virtual-boundary selection/cut; it does not claim that a synthetic range is equivalent to a real OS pointer drag.
- Explorer/Finder drag-and-drop and OS file-picker interaction remain packaged integration tests. PR CI uses deterministic local Markdown/image resources instead of automating native dialogs.
- PicGo and network image upload are intentionally excluded from PR hard gates because DNS/TLS/proxy/remote-service state is nondeterministic.
- Long-running 30-minute stability, packaged Windows/macOS Intel/macOS Apple Silicon, and performance measurements remain separate jobs; they must not run concurrently with latency/FPS measurement workloads on the same runner.

## Test architecture rules

- No test depends on another test's execution order.
- Correctness specs are split for parallel scheduling; performance measurements remain isolated.
- Renderer-error assertions use the explicit error counter instead of suppressing failures.
- New regression tests wait for observable editor/outline/image/scroll conditions. They do not use retries or `force: true` to hide interactability failures.
- Existing thresholds, performance sample counts, workloads, and historical regression tests are unchanged.
