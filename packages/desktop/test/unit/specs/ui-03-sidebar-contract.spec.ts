import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sidebar = resolve(here, '../../../src/renderer/src/components/sideBar')

const read = (relativePath: string): string =>
  readFileSync(resolve(sidebar, relativePath), 'utf8')

describe('Inkiva UI-03 sidebar contract', () => {
  it('keeps the icon rail quiet and gives it a usable 45px hit area', () => {
    const css = read('index.vue')

    expect(css).toContain('width: 45px;')
    expect(css).toContain('height: 45px;')
    expect(css).toContain('color: var(--icon-secondary);')
    expect(css).toContain('color: var(--color-accent);')
    expect(css).not.toContain('background: var(--surface-selected);')
    expect(css).not.toContain('transition: all')
  })

  it('uses a subtle current-file surface instead of a blue rail and blue label', () => {
    const css = read('treeFile.vue')

    expect(css).toContain('background: var(--color-accent-soft);')
    expect(css).toContain('color: var(--text-primary);')
    expect(css).toContain('margin-inline: 6px;')
    expect(css).not.toContain('side-bar-file.current::before')
    expect(css).not.toContain('width: 2px;')
    expect(css).not.toContain('transition: all')
  })

  it('uses a five-pixel drag hit area with a one-pixel visual affordance', () => {
    const css = read('index.vue')

    expect(css).toContain('width: 5px;')
    expect(css).toContain('border-right: 1px solid transparent;')
    expect(css).toContain('border-right-color: var(--color-accent);')
  })

  it('preserves the narrow and overlay breakpoints', () => {
    const source = read('index.vue')

    expect(source).toContain('NARROW_WINDOW_BREAKPOINT = 1000')
    expect(source).toContain('NARROW_SIDE_BAR_WIDTH = 240')
    expect(source).toContain('OVERLAY_WINDOW_BREAKPOINT = 590')
    expect(source).toContain("'side-bar--overlay'")
  })
})
