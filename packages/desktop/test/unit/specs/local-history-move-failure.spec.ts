import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unlink } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'

import { LocalHistoryStore } from 'main_renderer/documentIntelligence/localHistoryStore'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'inkiva-history-move-failure-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('LocalHistoryStore move cleanup failure', () => {
  it('keeps the complete new identity history when old snapshot cleanup partially fails', async() => {
    const root = createTemporaryDirectory()
    const historyRoot = path.join(root, 'history')
    const oldPath = path.join(root, 'notes', 'draft.md')
    const newPath = path.join(root, 'archive', 'draft.md')
    const ids = ['first', 'second']
    let moveUnlinkCalls = 0
    let injectedCleanupFailure = false
    const store = new LocalHistoryStore({
      rootPath: historyRoot,
      createId: () => ids.shift() ?? 'extra',
      now: () => 100,
      removeMovedSnapshot: async(snapshotPath) => {
        moveUnlinkCalls += 1
        if (moveUnlinkCalls === 2) {
          injectedCleanupFailure = true
          const error = new Error('cleanup blocked') as NodeJS.ErrnoException
          error.code = 'EACCES'
          throw error
        }
        await unlink(snapshotPath)
      }
    })

    await store.save({ filePath: oldPath, content: 'first version', createdAt: 90 })
    await store.save({ filePath: oldPath, content: 'second version', createdAt: 95 })

    await expect(store.movePath(oldPath, newPath)).resolves.toBe(2)
    expect(injectedCleanupFailure).toBe(true)
    expect((await store.list(newPath)).map((entry) => entry.id)).toEqual([
      'second',
      'first'
    ])
    await expect(store.read(newPath, 'first')).resolves.toMatchObject({
      content: 'first version'
    })
    await expect(store.read(newPath, 'second')).resolves.toMatchObject({
      content: 'second version'
    })
  })
})
