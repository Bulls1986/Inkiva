import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `theme.ts` reads the preload path surface while its configuration module is
// evaluated. Keep the contract test independent from Electron's preload.
vi.hoisted(() => {
  const scope = globalThis as unknown as {
    window?: { path?: { sep: string } }
  }
  scope.window ??= {}
  scope.window.path ??= { sep: '/' }
})

import {
  APPLICATION_APPEARANCE_ATTRIBUTE,
  APPLICATION_STYLE_ID,
  COMMON_STYLE_ID,
  CUSTOM_STYLE_ID,
  EDITOR_WIDTH_STYLE_ID,
  THEME_STYLE_ID
} from '@/config'
import { themes } from '@/prefComponents/theme/config'
import {
  addApplicationStyle,
  addCommonStyle,
  addCustomStyle,
  addThemeStyle,
  setEditorWidth
} from '@/util/theme'
import { getApplicationAppearance } from 'common/theme'

const designTokenPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../src/renderer/src/assets/styles/design-tokens.css'
)

const readDesignTokens = (): string => {
  if (!existsSync(designTokenPath)) return ''
  return readFileSync(designTokenPath, 'utf8')
}

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const ruleBody = (css: string, selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? ''
}

const styleIds = (): string[] =>
  Array.from(document.head.querySelectorAll('style[id]')).map((style) => style.id)

describe('Inkiva application design-system contract', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.className = ''
    document.documentElement.removeAttribute(APPLICATION_APPEARANCE_ATTRIBUTE)
  })

  it('publishes semantic application tokens without engine namespaces', () => {
    const css = withoutComments(readDesignTokens())
    const tokens = [
      '--color-accent',
      '--color-accent-hover',
      '--color-accent-active',
      '--color-accent-soft',
      '--color-accent-selected',
      '--color-accent-focus',
      '--color-success',
      '--color-info',
      '--color-warning',
      '--color-danger',
      '--text-primary',
      '--text-secondary',
      '--text-tertiary',
      '--text-disabled',
      '--surface-editor',
      '--surface-chrome',
      '--surface-hover',
      '--surface-selected',
      '--surface-elevated',
      '--border-subtle',
      '--border-default',
      '--border-focus',
      '--icon-primary',
      '--icon-secondary',
      '--icon-disabled',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--motion-fast',
      '--motion-normal',
      '--motion-slow'
    ]

    expect(existsSync(designTokenPath)).toBe(true)
    for (const token of tokens) {
      expect(css).toMatch(new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`))
    }
    expect(css).not.toMatch(/--(?:mu|editor|theme)-[a-z0-9-]+\s*:/)
  })

  it('defines the Light foundation with the approved Inkiva blue', () => {
    const light = ruleBody(withoutComments(readDesignTokens()), ':root')

    expect(light).toContain('--color-accent: #0B63E5;')
    expect(light).toContain('--color-accent-hover: #0959D0;')
    expect(light).toContain('--color-accent-active: #084DB5;')
    expect(light).toContain('--surface-editor: #FFFFFF;')
    expect(light).toContain('--surface-chrome: #F7F8FA;')
    expect(light).toContain('--surface-hover: #F0F2F5;')
    expect(light).toContain('--border-subtle: #E7E9ED;')
    expect(light).toContain('--border-default: #DADDE3;')
  })

  it('defines Dark and Paper foundations', () => {
    const css = withoutComments(readDesignTokens())
    const dark = ruleBody(css, ":root[data-inkiva-appearance='dark']")
    const paper = ruleBody(css, ":root[data-inkiva-appearance='paper']")

    expect(dark).toContain('--surface-editor: #1B1D21;')
    expect(dark).toContain('--surface-chrome: #181A1E;')
    expect(dark).toContain('--surface-hover: #24272D;')
    expect(dark).toContain('--border-subtle: #2B2F36;')
    expect(dark).toContain('--border-default: #363A42;')
    expect(dark).toContain('--color-accent: #0B63E5;')

    expect(paper).toContain('--surface-editor: #FFFDF8;')
    expect(paper).toContain('--surface-chrome: #F7F4EC;')
    expect(paper).toContain('--surface-hover: #F0ECE3;')
    expect(paper).toContain('--text-primary: #2E2B27;')
  })

  it('defines the shared motion scale and reduced-motion fallback', () => {
    const css = withoutComments(readDesignTokens())

    expect(css).toContain('--motion-fast: 120ms;')
    expect(css).toContain('--motion-normal: 180ms;')
    expect(css).toContain('--motion-slow: 240ms;')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toContain('--motion-fast: 0ms;')
    expect(css).toContain('--motion-normal: 0ms;')
    expect(css).toContain('--motion-slow: 0ms;')
  })

  it('classifies the three canonical application appearances', () => {
    expect(getApplicationAppearance('light')).toBe('light')
    expect(getApplicationAppearance('dark')).toBe('dark')
    expect(getApplicationAppearance('paper')).toBe('paper')
    expect(getApplicationAppearance('unknown-theme')).toBe('light')
  })

  it('exposes only the three canonical theme choices', () => {
    expect(themes.map(({ name }) => name)).toEqual(['light', 'dark', 'paper'])
  })

  it('sets application appearance using the canonical theme sheet', () => {
    addThemeStyle('dark')

    expect(document.documentElement.getAttribute(APPLICATION_APPEARANCE_ATTRIBUTE)).toBe('dark')
    expect(document.querySelector(`#${THEME_STYLE_ID}`)).not.toBeNull()
    expect(document.querySelector(`#${APPLICATION_STYLE_ID}`)).not.toBeNull()
    expect(document.body.classList.contains('dark')).toBe(true)

    addThemeStyle('light')

    expect(document.documentElement.getAttribute(APPLICATION_APPEARANCE_ATTRIBUTE)).toBe('light')
    expect(document.body.classList.contains('dark')).toBe(false)

    addThemeStyle('paper')
    expect(document.documentElement.getAttribute(APPLICATION_APPEARANCE_ATTRIBUTE)).toBe('paper')
    expect(document.body.classList.contains('dark')).toBe(false)
  })

  it('keeps dynamic style sheets in canonical cascade order', () => {
    addCustomStyle({ customCss: ':root { --color-accent: #ff00ff; }' })
    setEditorWidth('60%')
    addCommonStyle({ codeFontFamily: 'Courier New', codeFontSize: 14 })
    addThemeStyle('light')
    addApplicationStyle()

    expect(styleIds()).toEqual([
      THEME_STYLE_ID,
      APPLICATION_STYLE_ID,
      COMMON_STYLE_ID,
      EDITOR_WIDTH_STYLE_ID,
      CUSTOM_STYLE_ID
    ])
    expect(document.head.lastElementChild?.id).toBe(CUSTOM_STYLE_ID)
  })

  it('clears stale custom CSS without leaving it in an earlier layer', () => {
    addCustomStyle({ customCss: '.test { color: red; }' })
    addCustomStyle({ customCss: '' })

    expect(document.querySelector(`#${CUSTOM_STYLE_ID}`)?.textContent).toBe('')
  })
})
