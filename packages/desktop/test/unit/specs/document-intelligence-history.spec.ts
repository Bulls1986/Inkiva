import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LocalHistoryService,
  LocalHistorySnapshotNotFoundError,
  StaleLocalHistoryRestoreError
} from 'main_renderer/documentIntelligence/localHistoryService'
import { LocalHistoryStore } from 'main_renderer/documentIntelligence/localHistoryStore'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'inkiva-document-history-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('LocalHistoryStore', () => {
  it('stores complete Markdown snapshots outside the document directory', async() => {
    const root = createTemporaryDirectory()
    const filePath = path.join(root, 'notes', 'draft.md')
    const historyRootPath = path.join(root, 'history')
    const createId = vi.fn().mockReturnValueOnce('snapshot-one').mockReturnValueOnce('snapshot-two')
    const store = new LocalHistoryStore({
      rootPath: historyRootPath,
      createId,
      now: () => 2_000
    })

    const first = await store.save({
      filePath,
      content: '---\ntitle: Draft\n---\n\nBody\n',
      createdAt: 1_000,
      reason: 'before-save',
      encoding: 'utf-8',
      lineEnding: 'lf'
    })
    await store.save({ filePath, content: 'new body', createdAt: 1_100, reason: 'manual' })

    expect(first).toMatchObject({
      id: 'snapshot-one',
      filePath: path.resolve(filePath),
      reason: 'before-save',
      size: Buffer.byteLength('---\ntitle: Draft\n---\n\nBody\n', 'utf8'),
      encoding: 'utf-8',
      lineEnding: 'lf'
    })
    expect(
      (await store.list(filePath)).map((entry) => ({
        id: entry.id,
        size: entry.size,
        reason: entry.reason
      }))
    ).toEqual([
      { id: 'snapshot-two', size: Buffer.byteLength('new body'), reason: 'manual' },
      {
        id: 'snapshot-one',
        size: Buffer.byteLength('---\ntitle: Draft\n---\n\nBody\n'),
        reason: 'before-save'
      }
    ])
    await expect(store.read(filePath, 'snapshot-one')).resolves.toMatchObject({
      content: '---\ntitle: Draft\n---\n\nBody\n',
      encoding: 'utf-8',
      lineEnding: 'lf'
    })
    await expect(store.read(filePath, 'missing')).resolves.toBeNull()
    await expect(store.read(filePath, '../not-a-snapshot')).rejects.toThrow(
      'Invalid Local History snapshot id'
    )
  })

  it('applies per-file and age retention without touching the source file', async() => {
    const root = createTemporaryDirectory()
    const filePath = path.join(root, 'draft.md')
    let now = 1_000
    let nextId = 0
    const store = new LocalHistoryStore({
      rootPath: path.join(root, 'history'),
      maxSnapshotsPerFile: 3,
      maxAgeMs: 100,
      maxTotalBytes: 1_000,
      now: () => now,
      createId: () => `snapshot-${++nextId}`
    })

    await store.save({ filePath, content: 'one', createdAt: 950 })
    await store.save({ filePath, content: 'two', createdAt: 990 })
    await store.save({ filePath, content: 'three', createdAt: 995 })
    expect((await store.list(filePath)).map((entry) => entry.id)).toEqual([
      'snapshot-3',
      'snapshot-2',
      'snapshot-1'
    ])

    now = 1_080
    await expect(store.prune()).resolves.toMatchObject({ deleted: 1, reclaimedBytes: 3 })
    expect((await store.list(filePath)).map((entry) => entry.id)).toEqual([
      'snapshot-3',
      'snapshot-2'
    ])

    await store.save({ filePath, content: 'four', createdAt: 1_070 })
    await store.save({ filePath, content: 'five', createdAt: 1_075 })
    expect((await store.list(filePath)).map((entry) => entry.id)).toEqual([
      'snapshot-5',
      'snapshot-4',
      'snapshot-3'
    ])
    expect(await store.delete(filePath, 'snapshot-3')).toBe(true)
    expect(await store.delete(filePath, 'snapshot-3')).toBe(false)
  })
})

describe('LocalHistoryService', () => {
  it('restores through an injected file adapter and rejects stale previews', async() => {
    const root = createTemporaryDirectory()
    const filePath = path.join(root, 'draft.md')
    let current = 'current'
    const writeFile = vi.fn(async(_filePath: string, content: string) => {
      current = content
    })
    const service = new LocalHistoryService({
      rootPath: path.join(root, 'history'),
      createId: () => 'snapshot-restore',
      files: {
        readFile: async() => current,
        writeFile
      }
    })
    const entry = await service.createSnapshot({ filePath, content: 'old' })

    await expect(
      service.restoreSnapshot({
        filePath,
        id: entry.id,
        expectedCurrentContent: 'current'
      })
    ).resolves.toMatchObject({ content: 'old' })
    expect(current).toBe('old')
    expect(writeFile).toHaveBeenCalledTimes(1)

    current = 'newer'
    await expect(
      service.restoreSnapshot({
        filePath,
        id: entry.id,
        expectedCurrentContent: 'current'
      })
    ).rejects.toBeInstanceOf(StaleLocalHistoryRestoreError)
    expect(writeFile).toHaveBeenCalledTimes(1)
    await expect(service.restoreSnapshot({ filePath, id: 'missing' })).rejects.toBeInstanceOf(
      LocalHistorySnapshotNotFoundError
    )
  })
})
