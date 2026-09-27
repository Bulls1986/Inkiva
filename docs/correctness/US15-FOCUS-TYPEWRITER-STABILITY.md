# US15 — Focus / Typewriter Writing View Stability

> Scope: Inkiva v0.5.0 US-15 / AC-62, AC-63, AC-64 and cross-flow AC-81
> Branch: `feat/v0.5-us15-main`
> Base: `origin/develop@0141b483`
> Status: PR #210 open; local closeout complete; final CI pass 11/11 green

## Goal

Make Focus and Typewriter modes stable writing aids rather than selection-driven scroll effects.

The product-design prototype is interaction reference only. Existing Inkiva view controls, menu structure, settings UI, editor layout and visual language remain authoritative.

Required behavior:

- Focus mode dims only non-current blocks while the active block, selection, search highlight and useful editor hints remain legible; clicking another block must still activate it.
- Typewriter mode keeps the actively typed caret line near 40% of the visible editor height, with roughly one line of tolerance and no synthetic blank space at document boundaries.
- Manual scroll, body click and Outline navigation suspend Typewriter follow. Follow resumes only after the next actual text input at the new insertion point.
- Hover, save/recovery acknowledgements and asynchronous image/diagram/table geometry changes do not resume or trigger Typewriter follow.
- Focus/Typewriter must coexist with IME, selection, search, Outline navigation and async geometry without cursor jumps, selection loss or scroll loops.
- With window-layout restore enabled, both mode state and menu/visual state restore consistently after a normal restart; disabling layout restore leaves both modes off.

## Architecture gate

Read before implementation:

- `docs/agent/TESTING.md`
- `docs/agent/ARCHITECTURE_RELEASE.md`
- `docs/architecture/ARCH-01_EDITOR_RUNTIME_PROGRESS.md`
- `docs/architecture/ARCH-03-VIRTUAL-SURFACE-CONTRACT.md`
- `docs/architecture/ARCH-04-BLOCK-GEOMETRY-UNIFICATION.md`

Affected boundaries:

1. **Editor interaction / runtime adapter** — Vue may coordinate interaction intent, but document semantics and revision ownership remain in Muya/runtime.
2. **Virtual Surface** — Desktop may use the public document-surface navigation contract only; no private virtualization state or resize-correction escape path.
3. **Block Geometry** — async image/diagram/table growth continues through the authoritative geometry chain and must never directly trigger Typewriter follow.
4. **Scroll ownership** — Typewriter navigation must respect document-surface ownership and pending restore; no second geometry store and no raw-scroll O(N) layout work.

## Stage 0 — baseline diagnosis

Completed:

- fetched the current remote and discovered US14 had already merged as `#208`, with merge-closeout `#209`;
- selected latest `origin/develop@0141b483` as the real US15 base;
- reused a clean pre-warmed Git-native worktree because managed-worktree bootstrap is unavailable by documented environment contract;
- confirmed package-manager/dependency readiness in the reusable slot (`pnpm 10.33.4`, root and desktop dependency graphs present);
- mapped current Focus/Typewriter paths.

Baseline findings:

1. `editor.vue` uses a fixed `STANDAR_Y = 320`, not a viewport-relative 40% reference line.
2. While Typewriter is enabled, every Muya `selection-change` with cursor coordinates recenters the editor. The path does not distinguish typing from click, arrow movement, Outline navigation or other selection changes.
3. Existing editor interaction revision already observes trusted pointer/keyboard/wheel intent for delayed restore protection, but Typewriter does not consume an equivalent suspension contract.
4. Async geometry reconciliation currently updates pending tab restore and TOC state; it does not need or justify a new Typewriter geometry event.
5. Focus mode currently relies on `mu-focus-mode` opacity rules. Existing tests cover class toggling/basic active-block opacity, not selection/search-highlight/hint legibility.
6. View state currently has per-window Typewriter/Focus switches; AC-64 needs the existing window-layout restore path audited before adding any persistence owner.

Root-cause hypothesis for AC-62/81: Typewriter follow is modeled as a side effect of **selection state** rather than **actual text-input intent**, so user navigation cannot establish durable suspension.

## Stage 1 — Red plan

No production code may change until executable Red evidence is recorded.

Focused contracts to add and run:

1. Typewriter follow policy/state-machine unit coverage:
   - trusted manual navigation suspends follow;
   - selection/geometry/save activity while suspended cannot resume it;
   - actual text input resumes follow;
   - target is viewport-relative 40% and clamped to the real scroll range.
2. Focus presentation coverage for active/selected/highlighted content.
3. Targeted Electron interaction coverage for manual navigation → no steal → next input resumes, including one async-geometry scenario.
4. Layout-restore coverage for Focus/Typewriter state/menu consistency.

Red evidence must include the exact executed command, discovered test and the product assertion that fails on this baseline.

## Stage 1 — executable Red evidence

### AC-62 / AC-81 manual-navigation suspension

Added a focused real Electron interaction case to `packages/desktop/test/e2e/view-modes.spec.ts`.

Environment note:

- canonical `corepack enable pnpm -> nvm reshim -> pnpm --version` readiness passed (`pnpm 10.33.4`);
- `pnpm exec playwright` then hit the already-documented Windows NVM path-with-spaces launcher failure before test discovery, so it was rejected as environment evidence;
- per `ENVIRONMENT_RECIPES.md`, the trusted current Node executable was used directly with the current worktree Playwright JS CLI.

Executed from `packages/desktop`:

```text
node ../../node_modules/playwright/cli.js test test/e2e/view-modes.spec.ts --grep "US15 AC-62"
```

Valid Red result:

- Playwright started normally;
- exactly `1` intended test was discovered and entered;
- `1 failed` at the product assertion after a real manual body click;
- expected clicked caret block `relativeTop < 240`;
- baseline received `relativeTop = 336.15625`;
- failure proves current `selection-change -> STANDAR_Y` behavior steals the viewport after newer user navigation.

This satisfies the production-code pre-mutation Red gate for the Typewriter interaction root cause.

## Stage 2 — Typewriter interaction implementation and Green

Implementation stays inside the renderer interaction adapter and a pure policy helper:

- added `util/typewriterFollow.ts` with a small enabled/suspended state machine;
- Typewriter follow is suspended by newer trusted pointer/keyboard/wheel navigation intent;
- `beforeinput` resumes follow only for actual insert/delete editing operations;
- selection changes, save acknowledgements and async geometry do not own or resume follow;
- target line is derived from the live editor viewport at `40%`, rather than fixed `STANDAR_Y = 320`;
- Typewriter navigation still calls the public DocumentSurface `prepareForNavigation()` contract and introduces no second geometry/virtualization owner;
- IME composition keeps Typewriter scrolling suppressed while composition is active.

Pure policy validation from `packages/desktop`:

```text
node ../../node_modules/vitest/vitest.mjs run test/unit/specs/typewriter-follow.spec.ts
```

Result: `1` file passed, `3/3` tests passed.

The first post-change Electron rerun still observed the old behavior. Diagnosis proved the E2E helper launches `packages/desktop/out/main/index.js`, while that worktree's `out/renderer` predated the source change by one day. Per the documented Windows environment route, the current worktree was rebuilt directly through the trusted Node executable and Electron Vite JS entry:

```text
node ../../node_modules/electron-vite/bin/electron-vite.js build
```

Result: build passed (`main + preload + renderer`; renderer build completed in 35.59s).

The Electron test was then tightened so the target is explicitly positioned near `160px` before the click and the click is issued through a real mouse coordinate rather than `locator.click()`, preventing Playwright actionability scrolling from becoming a second scroll owner.

Re-run:

```text
node ../../node_modules/playwright/cli.js test test/e2e/view-modes.spec.ts --grep "US15 AC-62"
```

Result: `1/1 passed` on the freshly built current-worktree output.

This closes the core AC-62 contract: manual body navigation is not immediately reclaimed, and the next actual text input resumes follow at the viewport-relative reference line.

## Stage 3 — AC-64 window-level restore contract

The product decision is explicit: Focus/Typewriter are **window-level view state**, not global preferences and not per-tab document state.

Red was added to the existing US05 workspace-restore unit suite:

```text
node ../../node_modules/vitest/vitest.mjs run test/unit/specs/workspace-restore-state.spec.ts -t "US15 AC-64"
```

Valid Red:

- exactly one US15 test executed;
- expected the buffered layout snapshot to contain `focus: true` and `typewriter: true`;
- the baseline snapshot contained only sidebar/tabbar/split-layout fields.

Implementation:

- extended the existing buffered-layout snapshot with `focus` and `typewriter`;
- restore applies those values only through the existing `restoreLayoutState` branch;
- blank-layout startup leaves both modes off even if the previous buffered layout had them enabled;
- view-mode changes schedule the existing per-window buffered-state write from the editor view lifecycle;
- no new global preference persistence owner was introduced.

Architecture review caught and removed an intermediate direct `preferences -> bufferedState` dependency. The final trigger lives in the editor view watchers so AC-64 does not add a new store-cycle edge.

Unit regression:

```text
node ../../node_modules/vitest/vitest.mjs run test/unit/specs/workspace-restore-state.spec.ts
```

Result: `12/12 passed`.

A dedicated real-Electron restart test then covers the complete observable contract:

```text
node ../../node_modules/playwright/cli.js test test/e2e/us15-view-mode-restore.spec.ts
```

Result: `1/1 passed`.

The test proves:

1. Focus + Typewriter are written into the per-window buffered layout;
2. normal restart with layout restore enabled restores wrapper classes, Muya Focus visual state and native menu checks;
3. changing `restoreLayoutState` to false persists successfully;
4. the next restart keeps both modes and both menu checks off.

## Stage 4 — AC-63 Focus/search/selection coexistence

Two independent Focus contrast defects were closed with product-level evidence.

### Search highlight

The final isolated baseline proved that a non-current search match inherited the top-level Focus opacity and settled at effective opacity `0.25`, while AC-63 requires search feedback to remain normally legible.

The fix stays presentation-only:

- top-level blocks containing `.mu-highlight` or `.mu-selection` are restored to full opacity while Focus is active;
- unrelated non-current blocks remain at `0.25`;
- the Search state machine, logical match ownership and navigation behavior are unchanged.

### Native cross-block selection

Valid Red:

- a real mouse drag created a native selection spanning two paragraphs;
- both selected top-level blocks were dimmed to effective opacity `0.25`;
- this violated AC-63's requirement that the user's selection remain normally legible.

Implementation in Muya:

- added the presentation-only `mu-focus-selection` class;
- `TextSelection` maps the existing logical native selection range onto mounted top-level blocks only for Focus presentation;
- collapsed selection clears the presentation class;
- logical selection ownership remains in the existing Selection subsystem; no parallel selection model was introduced.

An initial implementation updated `mu-focus-selection` synchronously inside the selection-change call stack. Real mouse regression then showed Chromium's final native Range could collapse on mouseup. The presentation sync was therefore changed to one coalesced `requestAnimationFrame`: native selection commits first, then Focus styling follows on the next frame. This is a one-shot presentation update, not a new lifecycle timer or selection owner.

Final Focus validation:

```text
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../../node_modules/playwright/cli.js test test/e2e/us15-focus-contrast.spec.ts --workers=1
```

Results: Muya typecheck passed; search contrast + native cross-block selection `2/2 passed`.

## Stage 5 — AC-81 async geometry + Typewriter suspension

The test reuses the existing virtualization async-geometry fixture and its real ResizeObserver propagation path. No synthetic Typewriter-specific geometry event was added.

Test sequence:

1. materialize a deterministic async-growth block at a virtual-segment boundary;
2. position it just above the viewport while keeping it mounted in overscan;
3. place the caret near the Typewriter reference and enable Typewriter;
4. issue a trusted wheel gesture, moving the caret away from 40% and suspending follow;
5. asynchronously grow the block above by `320px`, exercising ResizeObserver / Block Geometry / Virtual Surface;
6. prove there is no second Typewriter scroll loop after geometry settlement, regardless of where the geometry change itself places the caret;
7. click a new insertion point — still no automatic resume;
8. move it away with another trusted wheel gesture;
9. type a real character and prove Typewriter then converges to the 40% reference band.

Focused validation:

```text
node ../../node_modules/playwright/cli.js test test/e2e/virtualization-async-geometry.spec.ts --grep "US15 AC-81"
```

The first broad closeout run exposed a test-precondition weakness rather than a geometry regression: one trusted `wheel(120)` moved the caret only `15.79px` away from the 40% reference, so the test had not actually established its required `>20px` suspended state before async growth.

The product threshold was not relaxed. Setup now performs at most four real wheel gestures, measuring the resulting caret/reference distance after each gesture and stopping as soon as the existing `>20px` precondition is satisfied.

Stability validation:

```text
node ../../node_modules/playwright/cli.js test test/e2e/virtualization-async-geometry.spec.ts --grep "US15 AC-81" --workers=1 --repeat-each=3
```

Result: `3/3 passed`.

During test construction, the pre-existing `moveGrowthTargetAboveViewport` helper also failed when run through the existing `GEO-E2E-04` case because its coarse `0.35 * viewportHeight` jump can evict the segment-tail target before the assertion. US15 does not change that helper and does not use that failure as evidence; the US15 case uses a bounded just-above-viewport placement while retaining the same ResizeObserver/geometry pipeline.

The second PR CI run exposed another assumption in this assertion: async growth can legitimately move the caret onto the Typewriter reference line by coincidence. Therefore AC-81 no longer asserts that post-growth distance from 40% must remain `>20px`. It instead asserts the actual ownership contract: after the geometry event settles, there is no second scroll/convergence loop. The existing post-settlement click/wheel/input sequence still proves that only a subsequent real edit resumes Typewriter follow.

## Stage 6 — Final regression / architecture / experience closure

Latest current-source validation:

- Typewriter policy + workspace restore units: `2` files, `15/15 passed`;
- Focus contrast Electron suite: `2/2 passed`;
- AC-62 + AC-64 + AC-81 + existing Focus/CJK aggregate: `4/4 passed`;
- AC-81 repeat stability: `3/3 passed`;
- current-worktree Electron build: main + preload + renderer passed;
- Desktop typecheck: passed;
- Muya typecheck: passed;
- Desktop changed-source ESLint: `0 errors`; remaining warnings are pre-existing non-null assertions outside the US15 hunk;
- Muya changed-source ESLint: passed;
- Windows CRLF-aware whitespace gate: `git -c core.whitespace=cr-at-eol diff --check` passed.

Full-file Muya stylelint still reports the pre-existing `blockSyntax.css` specificity/order debt. The reported errors identify the existing paragraph/task-list vs Focus wildcard rules, not the US15 `:has(.mu-highlight/.mu-selection)` additions. Two attempts to automate a HEAD-vs-current full-file stylelint comparison stalled in the local stylelint process and timed out without modifying files; they are recorded as tooling evidence, not product failures.

Architecture review:

1. Typewriter still uses the public DocumentSurface `prepareForNavigation()` contract; no virtualization-private mutation or second geometry owner was added.
2. The Typewriter controller owns only enabled/suspended intent booleans; Block Geometry remains authoritative for async height changes.
3. Async geometry does not emit or invoke a Typewriter-specific resume path.
4. Focus selection styling reuses the existing logical Selection state and adds only mounted-DOM presentation classes.
5. Focus/Typewriter persistence extends the existing per-window buffered-layout snapshot. No global persistence owner was introduced.
6. `layout -> preferences` was already an established store dependency before US15, and `preferences` does not reverse-import `layout`; US15 adds no store cycle.
7. The deferred Focus presentation sync is a single coalesced animation-frame callback, not a persistent listener/timer lifecycle.

Experience merge review:

- current-worktree Electron build freshness, Windows NVM launcher recovery and CRLF diagnostics were already canonical in `docs/agent/ENVIRONMENT_RECIPES.md`, so they were not duplicated;
- two genuinely reusable interaction-test lessons were merged into `docs/agent/TESTING.md`: avoid Playwright actionability auto-scroll when testing scroll ownership, and establish gesture-driven geometry preconditions from measured state rather than assumed wheel deltas.

## Stage 7 — PR #210 CI feedback closure

PR `#210` was opened from `feat/v0.5-us15-main`.

### CI pass 1 — Desktop Test contract failure

Head `e3c0c22c` produced one Desktop Test failure while the product-focused local suites were green.

Root cause:

- `us09-selection-caret-contract.spec.ts` asserted the exact source string `if (event.isTrusted) editorInteractionRevision += 1`;
- US15 preserved the same semantic contract with an early return followed by `editorInteractionRevision += 1`;
- the failure was therefore a brittle static implementation assertion, not a product regression.

Fix:

- the US09 test now isolates `markExplicitEditorInteraction` and asserts the invariant: revision increments only behind a trusted-event guard;
- focused validation: `7/7 passed`;
- no production code changed for this CI failure.

### CI pass 2 — Desktop E2E failures

Head `e3f40f33` reached `10/11` green workflows. The only failed workflow was Desktop E2E, with AC-62 and AC-81.

AC-81 was the post-growth geometry assumption described above and was corrected at the test-contract level without relaxing the ownership requirement. Repeat validation is `3/3 passed`.

AC-62 exposed a real product defect:

1. the test was hardened to select a target from the currently visible DOM after viewport movement and to prove the native selection actually landed in that target;
2. repeated Red remained deterministic: `5/5` runs clicked the intended paragraph, then the caret was moved back to roughly the 40% Typewriter reference;
3. the trusted mousedown probe confirmed `event.isTrusted === true`, and no `beforeinput` occurred during the click, ruling out a false resume path;
4. root cause was an already-running `animatedScrollTo`: `suspend()` prevented new Typewriter follow requests but could not stop an animation frame loop that had already started;
5. the stale animation continued writing `scrollTop` after newer user navigation, reclaiming scroll ownership.

Production fix:

- `animatedScrollTo` now returns a cancellation handle while remaining backward-compatible for existing callers;
- Typewriter owns only its own active cancel handle;
- starting a newer Typewriter animation cancels the previous one;
- trusted pointer/keyboard/wheel intent, search/Outline/anchor navigation, mode toggle and component teardown cancel the active Typewriter animation before suspending/resetting follow;
- no second scroll implementation or geometry owner was added.

Executable protection:

- Typewriter unit coverage now proves a cancelled animation frame cannot overwrite a newer user `scrollTop`;
- cancellation unit: `4/4 passed`;
- AC-62 after production fix: `5/5 passed`;
- AC-81 after production fix: `3/3 passed`;
- current-worktree Electron build, Desktop typecheck and changed-source ESLint remain green (`0` lint errors).

The final AC-62 E2E contract was also tightened around the actual ownership invariant rather than a fixed pixel band:

- wait until the enable-time Typewriter animation has visibly settled;
- move the viewport without changing selection;
- choose a currently mounted editable paragraph whose caret position is more than `160px` away from the live 40% reference;
- use a real mouse click and prove the native selection lands in that paragraph;
- after the negative-condition window, require the caret to remain more than `80px` away from the Typewriter reference;
- only the next real text input may converge it back to the reference band.

This allows the existing generic “keep caret visible” behavior to make a small legitimate scroll without confusing that behavior with Typewriter reclaiming ownership.

Final local closeout matrix after all CI-feedback fixes:

- US09 + Typewriter + workspace-restore units: `3` files, `23/23 passed`;
- Focus search/selection Electron suite: `2/2 passed`;
- AC-62 repeat stability: `5/5 passed`;
- AC-81 repeat stability: `3/3 passed`;
- AC-62 + AC-64 + AC-81 + existing Focus/CJK aggregate: `4/4 passed`;
- current-worktree Electron build: passed;
- Desktop typecheck: passed;
- changed-source ESLint: `0` errors; only pre-existing non-null assertion warnings remain in the legacy portion of `view-modes.spec.ts`.

Experience review:

- the reusable lesson overlaps the existing architecture rule that automated/background work must be cancellable;
- `docs/agent/ARCHITECTURE_RELEASE.md` was refined instead of adding a duplicate rule: newer user intent must cancel the already-running UI writer, not merely block future scheduling.

### CI pass 3 — final green

Head `a7a54576` completed the full PR workflow set with `11/11` successful workflows:

- Desktop: Lint, Test, E2E Test, PR Build and Performance Fast Gate;
- Muya: Build, Lint, Test, E2E, CommonMark/GFM Spec and Circular Dependency Check.

GitHub reports PR `#210` as open, mergeable and conflict-free against `develop@0141b483`.

## Current blockers

None. US15 implementation, local regression, architecture review, experience merge review, PR feedback closure and final CI are complete. PR `#210` is ready for merge consideration; this workflow does not auto-merge it.
