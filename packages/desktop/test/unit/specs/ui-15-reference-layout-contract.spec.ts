import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const desktop = resolve(here, '../../../')

const readRenderer = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva reference visual layout contract', () => {
  it('keeps the document tabs in the editor column beside the single sidebar', () => {
    const app = readRenderer('pages/app.vue')

    expect(app).toMatch(
      /class="editor-middle"[\s\S]*?class="document-tabs-row"[\s\S]*?<tabs\s*\/>/
    )
    expect(app.indexOf('class="document-tabs-row"')).toBeGreaterThan(
      app.indexOf('class="editor-middle"')
    )
    expect(app).toContain('v-show="showTabBar"')
    expect(app).not.toMatch(/class="document-tabs-row"[\s\S]*?class="editor-workspace"/)
  })

  it('uses the preview reading column and neutral paper foundation', () => {
    const tokens = readRenderer('assets/styles/design-tokens.css')
    const preferences = readRenderer('store/preferences.ts')
    const staticPreferences = readFileSync(resolve(desktop, 'static/preference.json'), 'utf8')
    const schema = readFileSync(resolve(desktop, 'src/main/preferences/schema.json'), 'utf8')

    expect(tokens).toContain('--markdown-content-width: 924px;')
    expect(tokens).toContain('--font-body: 18px;')
    expect(tokens).toContain('--editorContentTopPadding: 40px;')
    expect(tokens).toContain('--markdown-font-family: Georgia')
    expect(tokens).toContain('--workspace-header-height: 50px;')
    expect(tokens).toContain('--surface-editor: #F8F8F6;')
    expect(tokens).toContain('--surface-chrome: #F1F2F0;')
    expect(tokens).not.toContain('--surface-editor: #FFFDF8;')
    expect(readRenderer('../index.html')).toContain('background: #f8f8f6;')
    expect(preferences).toContain("editorFontFamily: 'Georgia'")
    expect(preferences).toContain('fontSize: 18')
    expect(preferences).toContain("editorLineWidth: '80%'")
    expect(staticPreferences).toContain('"editorFontFamily": "Georgia"')
    expect(staticPreferences).toContain('"fontSize": 18')
    expect(staticPreferences).toContain('"editorLineWidth": "80%"')
    expect(schema).toContain('"default": 18')
    expect(schema).toContain('"default": "Georgia"')
    expect(schema).toContain('"default": "80%"')
  })

  it('exposes editor width as a percentage-only preference control', () => {
    const editor = readRenderer('prefComponents/editor/index.vue')

    expect(editor).toContain(':regex-validator="/^(?:[1-9][0-9]?|100)%$/"')
    expect(editor).not.toContain('780px')
  })

  it('keeps the shell geometry and document type scale aligned with the preview', () => {
    const tabs = readRenderer('components/editorWithTabs/tabs.vue')
    const layout = readRenderer('store/layout.ts')
    const sidebar = readRenderer('components/sideBar/index.vue')
    const markdown = readFileSync(resolve(here, '../../../../muya/src/assets/styles/blockSyntax.css'), 'utf8')

    expect(tabs).toContain('padding: 0 0 0 16px;')
    expect(layout).toContain('DEFAULT_SIDE_BAR_WIDTH = 288')
    expect(sidebar).toContain('DEFAULT_SIDE_BAR_WIDTH = 288')
    expect(markdown).toContain(
      'font-weight: var(--markdown-heading-weight, var(--font-weight-normal, 400));'
    )
    expect(markdown).toContain('padding: 0 var(--markdown-content-side-padding, 50px) 100px;')
    expect(markdown).toContain('font-size: 2em;')
  })

  it('exposes the command palette as a writing-oriented titlebar search surface', () => {
    const titleBar = readRenderer('components/titleBar/index.vue')

    expect(titleBar).toContain('data-testid="command-launcher"')
    expect(titleBar).toContain('data-testid="titlebar-brand"')
    expect(titleBar).toContain('data-testid="titlebar-document-status"')
    expect(titleBar).toContain("bus.emit('show-command-palette')")
    expect(titleBar).toContain("t('commandPalette.placeholder')")
  })

  it('keeps application controls on one border and one focus-ring contract', () => {
    const styles = readRenderer('assets/styles/index.css')

    expect(styles).toContain(':where(input, select, textarea):focus-visible')
    expect(styles).toContain('box-shadow: 0 0 0 1px var(--border-focus) inset;')
    expect(styles).toContain('border: 0;')
    expect(styles).not.toContain(
      'input.el-input__inner {\n  background: var(--surface-editor);\n  border: 1px solid var(--border-default);'
    )
  })

  it('shows one theme selector instead of nested light and dark theme selectors', () => {
    const theme = readRenderer('prefComponents/theme/index.vue')

    expect(theme).toContain('storeToRefs(preferenceStore)')
    expect(theme).not.toContain('lightModeTheme')
    expect(theme).not.toContain('darkModeTheme')
    expect(theme).toContain('id="custom-css-input"')
    expect(theme).toContain('spellcheck="false"')
    expect(theme).toContain('preferences.theme.customCssNotes')
  })

  it('makes PicGo App the first uploader and the first-run default', () => {
    const services = readRenderer('prefComponents/image/components/uploader/services.ts')
    const preferences = readRenderer('store/preferences.ts')
    const dataCenter = readFileSync(resolve(desktop, 'src/main/dataCenter/index.ts'), 'utf8')

    expect(services).toMatch(/getServices[\s\S]*?picgoApp[\s\S]*?picgo:/)
    expect(preferences).toContain("currentUploader: 'picgoApp'")
    expect(dataCenter).toContain("currentUploader: 'picgoApp'")
  })
})
