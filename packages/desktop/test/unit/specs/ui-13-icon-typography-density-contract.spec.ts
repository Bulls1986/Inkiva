import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const muya = resolve(here, '../../../../muya/src')

const readRenderer = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

const readMuya = (relativePath: string): string =>
  readFileSync(resolve(muya, relativePath), 'utf8')

describe('Inkiva UI-13 icon, typography, and density contract', () => {
  it('publishes the approved UI type, icon, and hit-target scales', () => {
    const tokens = readRenderer('assets/styles/design-tokens.css')

    for (const token of [
      '--font-family-ui',
      '--font-size-metadata',
      '--font-size-shortcut',
      '--font-size-secondary',
      '--font-size-ui',
      '--font-size-section',
      '--font-size-title',
      '--font-weight-normal',
      '--font-weight-medium',
      '--font-weight-emphasis',
      '--icon-size-xs',
      '--icon-size-sm',
      '--icon-size-md',
      '--icon-size-lg',
      '--icon-size-xl',
      '--hit-target-sm',
      '--hit-target-md',
      '--hit-target-lg',
      '--hit-target-sidebar',
      '--control-height-sm',
      '--control-height-md',
      '--control-height-lg'
    ]) {
      expect(tokens).toContain(token + ':')
    }

    expect(tokens).toContain('--font-family-ui: system-ui')
    expect(tokens).toContain('--font-size-metadata: 11px;')
    expect(tokens).toContain('--font-size-shortcut: 12px;')
    expect(tokens).toContain('--font-size-secondary: 13px;')
    expect(tokens).toContain('--font-size-ui: 14px;')
    expect(tokens).toContain('--font-size-section: 16px;')
    expect(tokens).toContain('--font-size-title: 20px;')
    expect(tokens).toContain('--icon-size-xs: 12px;')
    expect(tokens).toContain('--icon-size-sm: 14px;')
    expect(tokens).toContain('--icon-size-md: 16px;')
    expect(tokens).toContain('--icon-size-lg: 18px;')
    expect(tokens).toContain('--icon-size-xl: 20px;')
    expect(tokens).toContain('--hit-target-sm: 28px;')
    expect(tokens).toContain('--hit-target-md: 32px;')
    expect(tokens).toContain('--hit-target-lg: 36px;')
    expect(tokens).toContain('--hit-target-sidebar: 45px;')
  })

  it('makes the application chrome use the UI stack and shared icon scale', () => {
    const styles = readRenderer('assets/styles/index.css')

    expect(styles).toContain('font-family: var(--font-family-ui);')
    expect(styles).toContain('font-size: var(--font-size-ui);')
    expect(styles).toContain('font-weight: var(--font-weight-normal);')
    expect(styles).toContain('width: var(--icon-size-md);')
    expect(styles).toContain('height: var(--icon-size-md);')
    expect(styles).not.toContain("font-family: 'Open Sans'")
  })

  it('keeps high-frequency chrome on shared density and icon tokens', () => {
    const sidebar = readRenderer('components/sideBar/index.vue')
    const titleBar = readRenderer('components/titleBar/index.vue')
    const preferences = readRenderer('prefComponents/sideBar/index.vue')
    const palette = readRenderer('components/commandPalette/index.vue')

    expect(sidebar).toContain('min-height: var(--hit-target-md);')
    expect(sidebar).toContain('width: var(--hit-target-md);')
    expect(sidebar).toContain('width: var(--icon-size-lg);')
    expect(sidebar).toContain('height: var(--icon-size-lg);')
    expect(sidebar).not.toContain('width: var(--hit-target-sidebar);')
    expect(sidebar).not.toContain('height: var(--hit-target-sidebar);')
    expect(titleBar).toContain('font-size: var(--font-size-secondary);')
    expect(titleBar).toContain('min-height: var(--hit-target-sm);')
    expect(preferences).toContain('font-size: var(--font-size-ui);')
    expect(preferences).toContain('width: var(--icon-size-md);')
    expect(preferences).toContain('height: var(--icon-size-md);')
    expect(palette).toContain('font-size: var(--font-size-ui);')
    expect(palette).toContain('font-size: var(--font-size-shortcut);')
  })

  it('bridges Muya interaction controls to the application scale', () => {
    const styles = readMuya('assets/styles/index.css')
    const baseFloat = readMuya('ui/baseFloat/index.css')
    const codePicker = readMuya('ui/codeBlockLanguageSelector/index.css')
    const frontMenu = readMuya('ui/paragraphFrontMenu/index.css')

    expect(styles).toContain('--interaction-icon-size: var(--icon-size-md')
    expect(styles).toContain('--interaction-hit-size: var(--hit-target-sm')
    expect(baseFloat).toContain('font-size: var(--font-size-shortcut')
    expect(codePicker).toContain('font-size: var(--font-size-ui')
    expect(codePicker).toContain('height: var(--hit-target-sm')
    expect(frontMenu).toContain('font-size: var(--font-size-ui')
    expect(frontMenu).toContain('font-weight: var(--font-weight-medium')
  })

  it('uses the system UI stack for the document fallback without removing user font options', () => {
    const styles = readMuya('assets/styles/index.css')
    const blockStyles = readMuya('assets/styles/blockSyntax.css')

    expect(styles).toMatch(/font-family:\s*var\(\s*--font-family-ui/)
    expect(blockStyles).toMatch(
      /font-family:\s*var\(\s*--mu-font-family,\s*var\(\s*--font-family-ui/
    )
    expect(blockStyles).toContain('--mu-font-family')
  })
})
