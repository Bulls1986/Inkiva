# Settings functional gate

## Goal

The Settings window is a product contract, not a collection of best-effort controls. A visible, enabled setting is considered correct only when all applicable stages succeed:

1. the control accepts the interaction;
2. the selected value remains visible after the control closes;
3. the renderer preference store receives the same semantic value;
4. the affected editor/application behavior changes when the setting is documented as live;
5. closing and reopening Settings preserves the value;
6. restarting Inkiva preserves the value through electron-store;
7. a second interaction still works;
8. invalid values are rejected without corrupting the last valid value.

The PR gate must fail closed when one of these assertions fails.

## Regression that triggered this gate

The editor-font picker exposed a split-brain preference path:

- the picker writes `editorFontFamily = "Open Sans"`;
- preference hydration rewrote exactly `"Open Sans"` to `"system-ui"`;
- the UI therefore snapped back after selection and the editor did not retain the requested font.

The gate contains a real Settings-window flow for this path and verifies UI state, live computed style, Settings reopen and application restart.

## Coverage model

| Domain | Visible settings / actions | Required coverage |
| --- | --- | --- |
| General | autosave + delay, title bar, scrollbar, new-window behavior, zoom, ToC wrapping, opened files, exclusions, file sort, startup/layout, default folder, language | persistence contract for representative values; UI interaction tests are required when behavior is changed |
| Editor typography | font size, line height, paragraph spacing, editor font, maximum width | live editor effect + persistence; editor font additionally requires second-open/restart regression coverage |
| Code blocks | code font size/family, line numbers, empty-line trimming, wrapping | preference round-trip; behavior-specific tests for rendering/editing changes |
| Writing behavior | bracket/Markdown/quote pairing | existing editor behavior tests + preference round-trip |
| File representation | tab width, EOL, encoding, auto detect/normalize, final newline | preference round-trip plus existing save/encoding integration coverage |
| Editor misc | direction, quick-insert hint, link popup, auto-check | preference round-trip and behavior-specific tests where a DOM effect is observable |
| Markdown lists | loose items, bullet marker, ordered delimiter, indentation | preference round-trip plus editor serialization tests |
| Markdown extensions | frontmatter, super/subscript, footnotes, HTML, GitLab compatibility | preference round-trip plus parser/render tests |
| Diagrams | sequence theme, PlantUML server | preference round-trip; diagram tests own rendering/network-independent behavior |
| Images | insert action, relative path settings, local folder/uploader configuration | preference round-trip; image E2E remains local-only |
| Themes | Light/Dark/Paper, follow-system, custom CSS | preference round-trip plus visual/theme regression tests |
| Spellchecker | enabled, underline marks, language, custom dictionary | preference round-trip plus platform-appropriate spellchecker tests |
| Keybindings | style/preset and customized bindings | dedicated shortcut/keybinding tests; Settings changes must remain persisted |
| Settings navigation | sidebar categories and search | navigation/search E2E; enabled controls must not silently be inert |

## Gate layers

### Unit contract

`preferences-hydration.spec.ts` protects semantic round-trip behavior in the renderer store. Hydration may perform explicit migrations, but it must not silently replace a currently supported user choice with a different value.

### Electron E2E

`preferences-functional-gate.spec.ts` runs against the real Settings window and real electron-store profile. It currently enforces:

- Open Sans selection from the font autocomplete;
- selected value remains visible;
- main editor computed font family changes;
- the font picker can be opened again after selection;
- closing/reopening Settings preserves the value;
- restarting Inkiva preserves and reapplies the font;
- representative settings from General, Editor, Markdown, Images, Themes and Spellchecker survive an application restart.

This spec lives under `packages/desktop/test/e2e`, so the existing required `E2E Test` workflow executes it on every pull request.

## Expansion rule

Whenever a Settings bug is found, its fix is incomplete until the failing scenario is added to one of the gate layers above. Do not weaken assertions, skip the case, replace a real effect assertion with a store-only assertion, or convert a failure to a warning merely to make CI green.

For controls whose setting has a directly observable effect, prefer this assertion chain:

`Settings UI -> renderer store -> actual editor/application effect -> Settings reopen -> application restart`.

Store-only assertions are acceptable only for settings whose effect is exercised by a separate dedicated integration/E2E suite.
