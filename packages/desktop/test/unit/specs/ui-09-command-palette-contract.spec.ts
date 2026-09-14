import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-09 command launcher contract', () => {
  it('uses a responsive launcher surface with explicit keyboard semantics', () => {
    const palette = read('components/commandPalette/index.vue')

    expect(palette).toContain('width="min(640px, calc(100vw - 48px))"')
    expect(palette).toContain('top="12vh"')
    expect(palette).not.toContain('width="500px"')
    expect(palette).not.toContain('position: absolute')
    expect(palette).toContain('role="listbox"')
    expect(palette).toContain('role="option"')
    expect(palette).toContain(':aria-selected=')
    expect(palette).toContain('data-testid="command-palette-option"')
    expect(palette).toContain('data-testid="command-palette-empty"')
    expect(palette).toContain('data-testid="command-palette-section"')
    expect(palette).toContain('focus-visible')
    expect(palette).toContain('--focus-ring')
    expect(palette).toContain('<loading')
  })

  it('keeps runtime commands when descriptions are refreshed', () => {
    const commandCenter = read('store/commandCenter.ts')

    expect(commandCenter).toContain('getCommandsWithDescriptions')
    expect(commandCenter).toContain('runtimeCommands')
    expect(commandCenter).toContain('file.quick-open')
    expect(commandCenter).toContain('REGISTER_COMMAND')
  })

  it('does not regress the existing fuzzy quick-open engine', () => {
    const quickOpen = read('commands/quickOpen.ts')

    expect(quickOpen).toContain('fuzzySearchPaths')
    expect(quickOpen).toContain('SearchAbortError')
    expect(quickOpen).toContain('QUICK_OPEN_RESULT_LIMIT')
    expect(quickOpen).toContain('SEARCH_DEBOUNCE_MS')
  })
})
