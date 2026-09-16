import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-12 focus and accessibility contract', () => {
  it('uses focus-visible instead of a blanket focus reset', () => {
    const css = read('assets/styles/index.css')

    expect(css).not.toMatch(/(^|\n):focus\s*\{\s*outline:\s*none;\s*\}/)
    expect(css).toContain(':focus-visible')
    expect(css).toContain(':focus:not(:focus-visible)')
    expect(css).toContain('var(--color-accent-focus)')
  })

  it('gives custom navigation surfaces native keyboard semantics', () => {
    const sidebar = read('components/sideBar/index.vue')
    const tabs = read('components/editorWithTabs/tabs.vue')
    const preferenceSidebar = read('prefComponents/sideBar/index.vue')
    const theme = read('prefComponents/theme/index.vue')

    expect(sidebar).toContain('sidebar-icon-button')
    expect(sidebar).toContain('type="button"')
    expect(sidebar).toContain(':aria-pressed=')
    expect(tabs).toContain('role="tablist"')
    expect(tabs).toContain('role="tab"')
    expect(tabs).toContain('@keydown="handleTabKeydown')
    expect(preferenceSidebar).toContain('class="item"')
    expect(preferenceSidebar).toContain('type="button"')
    expect(preferenceSidebar).toContain(':aria-current=')
    expect(theme).toContain('role="button"')
    expect(theme).toContain('tabindex="0"')
    expect(theme).toContain('@keydown="handleThemeKeydown')
  })

  it('uses the shared focus ring on custom controls and preference surfaces', () => {
    const sources = [
      read('components/sideBar/index.vue'),
      read('components/sideBar/search.vue'),
      read('components/sideBar/tree.vue'),
      read('components/sideBar/treeFile.vue'),
      read('components/sideBar/treeFolder.vue'),
      read('components/sideBar/treeOpenedTab.vue'),
      read('components/editorWithTabs/tabs.vue'),
      read('prefComponents/sideBar/index.vue'),
      read('prefComponents/common/titlebar.vue'),
      read('prefComponents/theme/index.vue')
    ].join('\n')

    expect(sources).toContain('var(--focus-ring)')
    expect(sources).not.toMatch(/:focus\s*\{\s*outline:\s*none;\s*\}/)
  })
})
