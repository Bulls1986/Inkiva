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
  writeFile(filePath: string, content: string | Buffer): Promise<void>
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

export class LocalHistoryRollbackUnavailableError extends Error {
  constructor(filePath: string) {
    super(`Local History restore refused because no retained rollback snapshot is available: ${filePath}`)
    this.name = 'LocalHistoryRollbackUnavailableError'
  }
}

const normalizeLineEndings = (
  content: string,
  lineEnding: LocalHistorySnapshot['lineEnding']
): string => {
  if (lineEnding === 'crlf') return content.replace(/\r?\n/g, '\r\n')
  if (lineEnding === 'lf') return content.replace(/\r\n/g, '\n')
  return content
}

const encodeSnapshotForRestore = (snapshot: LocalHistorySnapshot): Buffer => {
  const normalized = normalizeLineEndings(snapshot.content, snapshot.lineEnding)
  const body = Buffer.from(normalized, 'utf8')
  if (snapshot.encoding === 'utf8' && snapshot.isBom) {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body])
  }
  return body
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
      const rollback = await this.store.save({
        filePath: request.filePath,
        content: current,
        reason: 'before-restore'
      })
      const retainedRollback = await this.store.read(request.filePath, rollback.id)
      if (!retainedRollback) {
        throw new LocalHistoryRollbackUnavailableError(request.filePath)
      }
    }

    await this.files.writeFile(request.filePath, encodeSnapshotForRestore(snapshot))
    return snapshot
  }
}
