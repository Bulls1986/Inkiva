import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const markdownStyles = resolve(here, '../../../../muya/src/assets/styles')

const read = (root: string, relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8')

describe('Inkiva UI-06 Markdown typography contract', () => {
  it('publishes a separate Markdown token layer for readable light, dark, and paper writing surfaces', () => {
    const tokens = read(renderer, 'assets/styles/design-tokens.css')

    for (const token of [
      '--markdown-text-primary',
      '--markdown-text-secondary',
      '--markdown-surface-code',
      '--markdown-border-subtle',
      '--markdown-accent-soft',
      '--markdown-accent-muted',
      '--markdown-selection'
    ]) {
      expect(tokens).toMatch(new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`))
    }
  })

  it('uses calm document rhythm and a shared heading hierarchy', () => {
    const css = read(markdownStyles, 'blockSyntax.css')

    expect(css).toContain('line-height: var(--mu-line-height, var(--line-height-body, 1.7));')
    expect(css).toContain('margin-block: var(--mu-paragraph-spacing, 0.75em);')
    expect(css).toContain('color: var(--markdown-text-primary, var(--editor-color-80));')
    expect(css).toContain('color: var(--markdown-text-secondary, var(--editor-color-50));')
    expect(css).toContain('font-weight: 600;')
    expect(css).toMatch(
      /transition:\s*opacity var\(--motion-fast, 120ms\) ease,\s*color var\(--motion-fast, 120ms\) ease/
    )
  })

  it('keeps quotes, code, tables, and task states quiet but legible', () => {
    const block = read(markdownStyles, 'blockSyntax.css')
    const inline = read(markdownStyles, 'inlineSyntax.css')

    expect(block).toContain('background: var(--markdown-accent-soft')
    expect(block).toContain('background: var(--markdown-accent-muted')
    expect(block).toContain('background: var(--markdown-surface-code')
    expect(block).toContain('border: 1px solid var(--markdown-border-subtle')
    expect(block).toContain('border-radius: var(--radius-md, 6px);')
    expect(block).toContain('background: var(--markdown-selection')
    expect(inline).toContain('background-color: var(--markdown-surface-code')
    expect(inline).toContain('border-radius: var(--radius-sm, 4px);')

    expect(block).not.toContain('transition: all')
    expect(inline).not.toContain('transition: all')
  })
})
