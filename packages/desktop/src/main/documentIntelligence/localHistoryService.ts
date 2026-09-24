import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'

import type {
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryPruneResult,
  LocalHistorySnapshot
} from '@shared/types/documentIntelligence'
import { LocalHistoryStore, type LocalHistoryStoreOptions } from './localHistoryStore'

export interface LocalHistoryFileAdapter {
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
}

export interface LocalHistoryServiceOptions extends LocalHistoryStoreOptions {
  files?: LocalHistoryFileAdapter
}

export class LocalHistorySnapshotNotFoundError extends Error {
  constructor(filePath: string, id: string) {
    super(`Local History snapshot not found: ${filePath} (${id})`)
    this.name = 'LocalHistorySnapshotNotFoundError'
  }
}

export class StaleLocalHistoryRestoreError extends Error {
  constructor(filePath: string) {
    super(
      `The Markdown file changed while Local History restore was awaiting confirmation: ${filePath}`
    )
    this.name = 'StaleLocalHistoryRestoreError'
  }
}

const defaultFiles: LocalHistoryFileAdapter = {
  readFile: (filePath) => readFile(filePath, 'utf8'),
  writeFile: async(filePath, content) => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFileAtomic(filePath, content, { encoding: 'utf8' })
  }
}

/**
 * Application-facing Local History service. Snapshot retention belongs to the
 * store; restore is guarded by an optional expected-current-content check so a
 * stale preview cannot overwrite a newer edit silently.
 */
export class LocalHistoryService {
  readonly store: LocalHistoryStore
  private readonly files: LocalHistoryFileAdapter

  constructor(options: LocalHistoryServiceOptions) {
    this.store = new LocalHistoryStore(options)
    this.files = options.files ?? defaultFiles
  }

  createSnapshot(request: LocalHistoryCreateRequest): Promise<LocalHistoryEntry> {
    return this.store.save(request)
  }

  listSnapshots(filePath: string): Promise<LocalHistoryEntry[]> {
    return this.store.list(filePath)
  }

  getSnapshot(filePath: string, id: string): Promise<LocalHistorySnapshot | null> {
    return this.store.read(filePath, id)
  }

  deleteSnapshot(filePath: string, id: string): Promise<boolean> {
    return this.store.delete(filePath, id)
  }

  prune(): Promise<LocalHistoryPruneResult> {
    return this.store.prune()
  }

  async restoreSnapshot(request: {
    filePath: string
    id: string
    expectedCurrentContent?: string
  }): Promise<LocalHistorySnapshot> {
    const snapshot = await this.store.read(request.filePath, request.id)
    if (!snapshot) throw new LocalHistorySnapshotNotFoundError(request.filePath, request.id)

    const current = await this.files.readFile(request.filePath)
    if (
      request.expectedCurrentContent !== undefined &&
      current !== request.expectedCurrentContent
    ) {
      throw new StaleLocalHistoryRestoreError(request.filePath)
    }

    if (current !== snapshot.content) {
      await this.store.save({
        filePath: request.filePath,
        content: current,
        reason: 'before-restore'
      })
    }

    await this.files.writeFile(request.filePath, snapshot.content)
    return snapshot
  }
}
