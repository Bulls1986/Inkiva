import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const commandsDir = resolve(here, '../../../src/renderer/src/commands')

const read = (file: string): string => readFileSync(resolve(commandsDir, file), 'utf8')

describe('renderer IPC boundary', () => {
  it('keeps command implementations behind preload domain APIs', () => {
    const sources = [read('index.ts'), read('quickOpen.ts')]

    for (const source of sources) {
      expect(source).not.toContain('window.electron.ipcRenderer.')
    }
  })
})
