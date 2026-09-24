import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src/components')

const read = (relativePath: string): string => readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-02 chrome contract', () => {
  it('keeps the title bar compact and uses semantic menu states', () => {
    const css = read('titleBar/index.vue')

    expect(css).toContain('height: var(--titleBarHeight);')
    expect(css).toMatch(/transition:\s*background-color var\(--motion-fast\)/)
    expect(css).toContain('background: var(--surface-hover);')
    expect(css).not.toContain('background: rgba(11, 99, 229, 0.12);')
    expect(css).not.toContain('transition: all')
  })

  it('keeps active tabs blended with a short bottom accent tail', () => {
    const css = read('editorWithTabs/tabs.vue')

    expect(css).toContain('height: var(--documentTabsHeight);')
    expect(css).toContain('transition: background-color var(--motion-fast)')
    expect(css).toContain('color: var(--text-secondary);')
    expect(css).toMatch(/& > li\.active\s*\{\s*background: transparent;/)
    expect(css).toContain('height: 7px;')
    expect(css).toContain('background: linear-gradient(')
    expect(css).toContain('var(--color-accent) 0 1px')
    expect(css).toContain('var(--color-accent-focus) 1px 2px')
    expect(css).toContain('pointer-events: none;')
    expect(css).not.toContain('background: var(--surface-selected);')
    expect(css).not.toContain('box-shadow: 0px 0px 9px 2px')
    expect(css).not.toContain('height: 2px;')
    expect(css).not.toContain('transition: all')
  })
})
