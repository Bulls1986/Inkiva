import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')

const read = (relativePath: string): string => readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-10 title bar responsive contract', () => {
  it('uses separate layout zones for menu, document, statistics, and controls', () => {
    const titleBar = read('components/titleBar/index.vue')

    expect(titleBar).toContain('data-testid="titlebar-document"')
    expect(titleBar).toContain('data-testid="titlebar-menu"')
    expect(titleBar).toContain('data-testid="titlebar-stats"')
    expect(titleBar).toContain('data-testid="titlebar-controls"')
    expect(titleBar).toContain("grid-template-areas: 'menu document stats controls';")
    expect(titleBar).toContain('grid-area: menu;')
    expect(titleBar).toContain('grid-area: document;')
    expect(titleBar).toContain('grid-area: stats;')
    expect(titleBar).toContain('grid-area: controls;')
    expect(titleBar).not.toContain('left: 500px')
    expect(titleBar).not.toContain('right: 160px')
  })

  it('defines explicit compact priorities for document, statistics, and menu content', () => {
    const titleBar = read('components/titleBar/index.vue')

    expect(titleBar).toContain('@media (max-width: 1000px)')
    expect(titleBar).toContain('@media (max-width: 820px)')
    expect(titleBar).toContain('@media (max-width: 600px)')
    expect(titleBar).toContain("grid-template-areas: 'menu document controls';")
    expect(titleBar).toContain("grid-template-areas: 'menu controls';")
    expect(titleBar).toContain('minmax(0, 1fr) 138px')
  })
})
