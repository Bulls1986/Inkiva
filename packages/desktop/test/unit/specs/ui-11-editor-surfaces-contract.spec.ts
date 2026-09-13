import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const muya = resolve(here, '../../../../muya/src')
const read = (relativePath: string): string => readFileSync(resolve(muya, relativePath), 'utf8')

describe('Inkiva UI-11 editor interaction-surface contract', () => {
  it('defines one semantic token bridge for editor interaction surfaces', () => {
    const tokens = read('assets/styles/index.css')
    expect(tokens).toContain('--interaction-surface: var(--surface-elevated')
    expect(tokens).toContain('--interaction-surface-hover: var(--surface-hover')
    expect(tokens).toContain('--interaction-border: var(--border-subtle')
    expect(tokens).toContain('--interaction-radius: var(--radius-md')
    expect(tokens).toContain('--interaction-shadow: var(--elevation-floating')
    expect(tokens).toContain('--interaction-focus-ring: var(--focus-ring')
    expect(tokens).toContain('--interaction-selection: var(--color-accent-soft')
    expect(tokens).toContain('--interaction-danger: var(--color-danger')
  })

  it('gives current and other search matches distinct semantic states', () => {
    const styles = read('assets/styles/index.css')
    expect(styles).toContain('--search-match-background: var(--color-accent-soft')
    expect(styles).toContain('--search-current-match-background: var(--color-accent-focus')
    expect(styles).toContain('background: var(--search-current-match-background)')
    expect(styles).toContain('background: var(--search-match-background)')
  })

  it('makes the shared float root an elevated, bordered surface', () => {
    const baseFloat = read('ui/baseFloat/index.css')
    expect(baseFloat).toContain('background-color: var(--interaction-surface)')
    expect(baseFloat).toContain('border: 1px solid var(--interaction-border)')
    expect(baseFloat).toContain('border-radius: var(--interaction-radius)')
    expect(baseFloat).toContain('box-shadow: var(--interaction-shadow)')
  })

  it('keeps high-frequency editor controls on the shared radius and icon scale', () => {
    const styles = [
      read('ui/previewToolBar/index.css'),
      read('ui/inlineFormatToolbar/index.css'),
      read('ui/tableColumnToolbar/index.css'),
      read('ui/imageToolbar/index.css'),
      read('ui/linkTools/index.css'),
    ].join('\n')
    expect(styles).toContain('border-radius: var(--interaction-radius)')
    expect(styles).toContain('width: var(--interaction-icon-size)')
    expect(styles).toContain('height: var(--interaction-icon-size)')
    expect(styles).toContain('background: var(--interaction-surface-hover)')
  })

  it('uses accent-soft selection and danger-on-neutral error states', () => {
    const blockStyles = read('assets/styles/blockSyntax.css')
    const inlineStyles = read('assets/styles/inlineSyntax.css')
    expect(blockStyles).toContain('background: var(--interaction-selection)')
    expect(blockStyles).toContain('color: var(--interaction-danger)')
    expect(blockStyles).toContain('background: var(--interaction-surface)')
    expect(inlineStyles).toContain('border: 1px solid var(--interaction-border)')
    expect(inlineStyles).toContain('border-radius: var(--interaction-radius)')
  })
})
