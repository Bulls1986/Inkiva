import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-04 controls and floating surfaces contract', () => {
  it('removes elevation from regular controls and uses semantic states', () => {
    const css = read('assets/styles/index.css')

    expect(css).toContain('color: var(--text-secondary);')
    expect(css).toContain('background: var(--surface-editor);')
    expect(css).toContain('border: 1px solid var(--border-default);')
    expect(css).toContain('box-shadow: none;')
    expect(css).toContain('background: var(--color-accent);')
    expect(css).toContain('transition: color var(--motion-fast)')
    expect(css).not.toContain('transition: all')
    expect(css).not.toContain('linear-gradient(#ffffff')
  })

  it('keeps elevation for dialogs and menus only', () => {
    const css = read('assets/styles/index.css')
    const palette = read('components/commandPalette/index.vue')

    expect(css).toContain('box-shadow: var(--elevation-floating);')
    expect(css).toContain('background-color: var(--surface-elevated);')
    expect(css).toContain('border: 1px solid var(--border-subtle);')
    expect(palette).toContain('box-shadow: var(--elevation-floating);')
    expect(palette).not.toContain('transition: all')
  })

  it('uses a quiet feedback surface with semantic status markers', () => {
    const toast = read('services/notification/index.css')
    const inline = read('components/editorWithTabs/notifications.vue')

    expect(toast).toContain('background: var(--surface-elevated);')
    expect(toast).toContain('box-shadow: var(--elevation-floating);')
    expect(toast).toContain('border-left: 2px solid var(--color-accent);')
    expect(toast).toContain('border-left-color: var(--color-danger);')
    expect(toast).not.toContain('transition: all')
    expect(inline).toContain('background: var(--surface-elevated);')
    expect(inline).toContain('border-left: 2px solid var(--color-accent);')
  })

  it('keeps scrollbar chrome narrow and visually quiet', () => {
    const css = read('assets/styles/index.css')

    expect(css).toContain('::-webkit-scrollbar:vertical {\n  width: 8px;\n}')
    expect(css).toContain('background: transparent;')
    expect(css).toContain('background: var(--border-default);')
  })
})
