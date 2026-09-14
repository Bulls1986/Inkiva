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
  it('keeps the document tabs in a standalone shell row above the workspace', () => {
    const app = readRenderer('pages/app.vue')
    const editorWithTabs = readRenderer('components/editorWithTabs/index.vue')

    expect(app).toMatch(
      /<title-bar[\s\S]*?\/>[\s\S]*?class="document-tabs-row"[\s\S]*?<tabs\s*\/>[\s\S]*?class="editor-workspace"/
    )
    expect(app).not.toContain('<tabs v-show="showTabBar"')
    expect(editorWithTabs).not.toContain('<tabs')
  })

  it('uses the preview reading column and neutral paper foundation', () => {
    const tokens = readRenderer('assets/styles/design-tokens.css')
    const preferences = readRenderer('store/preferences.ts')
    const staticPreferences = readFileSync(resolve(desktop, 'static/preference.json'), 'utf8')
    const schema = readFileSync(resolve(desktop, 'src/main/preferences/schema.json'), 'utf8')

    expect(tokens).toContain('--markdown-content-width: 880px;')
    expect(tokens).toContain('--editorContentTopPadding: 40px;')
    expect(tokens).toContain('--surface-editor: #F8F8F6;')
    expect(tokens).toContain('--surface-chrome: #F1F2F0;')
    expect(tokens).not.toContain('--surface-editor: #FFFDF8;')
    expect(readRenderer('../index.html')).toContain('background: #f8f8f6;')
    expect(preferences).toContain("editorFontFamily: 'system-ui'")
    expect(preferences).toContain("editorLineWidth: '780px'")
    expect(staticPreferences).toContain('"editorFontFamily": "system-ui"')
    expect(staticPreferences).toContain('"editorLineWidth": "780px"')
    expect(schema).toContain('"default": "780px"')
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
