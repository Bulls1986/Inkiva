import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getApplicationAppearance,
  getThemeBackgroundColor,
  isDarkThemeId
} from 'common/theme'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const themeDir = resolve(renderer, 'assets/themes')
const prismDir = resolve(themeDir, 'prismjs')
const localeDir = resolve(here, '../../../static/locales')
const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-07 application theme scope contract', () => {
  it('accepts only the three canonical application appearances', () => {
    expect(getApplicationAppearance('light')).toBe('light')
    expect(getApplicationAppearance('dark')).toBe('dark')
    expect(getApplicationAppearance('paper')).toBe('paper')
    expect(getApplicationAppearance('inkiva-dark')).toBe('light')
    expect(getApplicationAppearance('inkiva-paper')).toBe('light')
    expect(isDarkThemeId('inkiva-dark')).toBe(false)
    expect(getThemeBackgroundColor('inkiva-dark')).toBe('#ffffff')
  })

  it('ships only the canonical application and Prism appearance assets', () => {
    expect(readdirSync(themeDir).filter((file) => file.endsWith('.theme.css'))).toEqual([
      'dark.theme.css'
    ])
    expect(readdirSync(prismDir).filter((file) => file.endsWith('.theme.css'))).toEqual([
      'dark.theme.css'
    ])
    expect(existsSync(resolve(themeDir, 'codemirror/one-dark.css'))).toBe(false)
  })

  it('does not load a retired editor theme or let old theme names leak into loaders', () => {
    expect(read('components/editorWithTabs/editor.vue')).not.toContain('one-dark')
    expect(read('codeMirror/index.css')).not.toContain('one-dark')

    const themeColor = read('util/themeColor.ts')
    expect(themeColor).toContain('dark.theme.css')
    expect(themeColor).not.toMatch(
      /ayu|catppuccin|cyberdream|dracula|everforest|graphite|gruvbox|horizon|kanagawa|material-dark|monokai|nightfox|nord|one-dark|oxocarbon|palenight|rose-pine|solarized|synthwave|tokyo-night|ulysses/
    )
  })

  it('removes retired appearance labels from every locale', () => {
    const expectedKeys = ['theme', 'dark', 'followThemDisabled']

    for (const file of readdirSync(localeDir).filter((entry) => entry.endsWith('.json'))) {
      const locale = JSON.parse(readFileSync(resolve(localeDir, file), 'utf8')) as {
        menu?: { theme?: Record<string, string> }
      }
      expect(Object.keys(locale.menu?.theme ?? {}), file).toEqual(expectedKeys)
    }
  })

  it('keeps Markdown tokens and appearance previews semantic', () => {
    const tokens = read('assets/styles/design-tokens.css')
    const preview = read('prefComponents/theme/index.vue')

    for (const token of [
      '--markdown-content-width',
      '--markdown-text-primary',
      '--markdown-surface-code',
      '--markdown-selection'
    ]) {
      expect(tokens).toContain(token)
    }
    expect(tokens).toContain(":root[data-inkiva-appearance='dark']")
    expect(tokens).toContain(":root[data-inkiva-appearance='paper']")
    expect(preview).toContain('official-themes')
    expect(preview).toContain('transition:')
    const themePreviewStyles = preview.slice(
      preview.indexOf('<style>'),
      preview.indexOf('.custom-css {')
    )
    expect(themePreviewStyles).not.toContain('box-shadow:')
    expect(preview).not.toMatch(
      /graphite|material-dark|one-dark|ulysses|ayu-|catppuccin|dracula|everforest|gruvbox|horizon|kanagawa|monokai|nightfox|nord|oxocarbon|palenight|rose-pine|solarized|synthwave|tokyo-night|cyberdream/
    )
  })
})
