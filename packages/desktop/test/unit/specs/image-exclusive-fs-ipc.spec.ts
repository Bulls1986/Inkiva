import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import os from 'node:os'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())

vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (...args: unknown[]) => unknown) => {
      handlers.set(name, callback)
    }
  }
}))

import { registerFsHandlers } from '../../../src/main/ipc/fs'

const tempDirectories: string[] = []
const invoke = async(name: string, ...args: unknown[]): Promise<unknown> => {
  const handler = handlers.get(name)
  if (!handler) throw new Error(`Missing IPC handler ${name}`)
  return handler(undefined, ...args)
}

afterEach(async() => {
  for (const dir of tempDirectories.splice(0)) await fs.remove(dir)
})

describe('exclusive image persistence across the typed filesystem IPC boundary', () => {
  it('keeps the original image bytes when a copy destination already exists', async() => {
    registerFsHandlers()
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-image-exclusive-'))
    tempDirectories.push(dir)
    const original = path.join(dir, 'source.png')
    const imported = path.join(dir, 'existing.png')
    await fs.writeFile(original, Uint8Array.from([1, 2, 3]))
    await fs.writeFile(imported, Uint8Array.from([9, 8, 7]))

    await expect(invoke('mt::fs::copy-new', original, imported)).rejects.toThrow()
    expect(Array.from(await fs.readFile(imported))).toEqual([9, 8, 7])
    expect(Array.from(await fs.readFile(original))).toEqual([1, 2, 3])

    const fresh = path.join(dir, 'fresh.png')
    await invoke('mt::fs::copy-new', original, fresh)
    expect(Array.from(await fs.readFile(fresh))).toEqual([1, 2, 3])
  })

  it('refuses overwriting a file during an exclusive binary write', async() => {
    registerFsHandlers()
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-image-exclusive-'))
    tempDirectories.push(dir)
    const imported = path.join(dir, 'pasted.png')
    await invoke('mt::fs::write-file-new', imported, Uint8Array.from([5, 6]))
    await expect(invoke('mt::fs::write-file-new', imported, Uint8Array.from([0]))).rejects.toThrow()
    expect(Array.from(await fs.readFile(imported))).toEqual([5, 6])
  })
})
