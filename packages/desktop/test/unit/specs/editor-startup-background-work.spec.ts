import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const read = (relativePath: string): string => readFileSync(resolve(renderer, relativePath), 'utf8')

describe('editor startup background-work contract', () => {
  it('does not preload Preferences modules from the editor renderer', () => {
    const main = read('main.ts')

    expect(main).not.toContain('preloadSettingsWhenIdle')
    expect(main).not.toContain("import('./pages/preference.vue')")
    expect(main).not.toContain("import('./prefComponents/markdown/index.vue')")
  })
})
