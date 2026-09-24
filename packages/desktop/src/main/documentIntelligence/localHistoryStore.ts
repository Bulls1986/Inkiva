import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'

import type {
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryPruneResult,
  LocalHistoryReason,
  LocalHistorySnapshot
} from '@shared/types/documentIntelligence'

export const LOCAL_HISTORY_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_HISTORY_MAX_SNAPSHOTS_PER_FILE = 50
export const DEFAULT_LOCAL_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000
export const DEFAULT_LOCAL_HISTORY_MAX_TOTAL_BYTES = 50 * 1024 * 1024

const LOCAL_HISTORY_REASONS: readonly LocalHistoryReason[] = [
  'manual',
  'before-save',
  'before-restore',
  'before-external-change',
  'autosave',
  'close',
  'import',
  'unknown'
]
const LOCAL_HISTORY_REASON_SET = new Set<string>(LOCAL_HISTORY_REASONS)
const SNAPSHOT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

interface StoredLocalHistorySnapshot extends LocalHistorySnapshot {
  schemaVersion: typeof LOCAL_HISTORY_SCHEMA_VERSION
}

export interface LocalHistoryStoreOptions {
  rootPath: string
  maxSnapshotsPerFile?: number
  maxAgeMs?: number
  maxTotalBytes?: number
  now?: () => number
  createId?: () => string
}

const canonicalFilePath = (filePath: string): string => {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved
}

const pathKey = (filePath: string): string => {
  return createHash('sha256').update(filePath).digest('hex')
}

const snapshotIdFromPath = (filePath: string): string => path.basename(filePath, '.json')

const isNotFound = (error: unknown): boolean =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'

const normalizeReason = (reason: LocalHistoryReason | undefined): LocalHistoryReason =>
  reason && LOCAL_HISTORY_REASON_SET.has(reason) ? reason : 'unknown'

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0

const toPublicSnapshot = (snapshot: StoredLocalHistorySnapshot): LocalHistorySnapshot => {
  const { schemaVersion: _schemaVersion, ...publicSnapshot } = snapshot
  return publicSnapshot
}

const toEntry = (snapshot: LocalHistorySnapshot): LocalHistoryEntry => {
  const { content: _content, ...entry } = snapshot
  return entry
}

const compareNewestFirst = (left: LocalHistorySnapshot, right: LocalHistorySnapshot): number =>
  right.createdAt - left.createdAt || right.id.localeCompare(left.id)

/**
 * File-backed Local History storage. The document path is represented by a
 * stable hash directory, so snapshots never appear beside or inside the
 * user's Markdown file. The JSON payload is deliberately plain data: the
 * original Markdown remains the only document format.
 */
export class LocalHistoryStore {
  private readonly rootPath: string
  private readonly maxSnapshotsPerFile: number
  private readonly maxAgeMs: number
  private readonly maxTotalBytes: number
  private readonly now: () => number
  private readonly createId: () => string
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(options: LocalHistoryStoreOptions) {
    if (!options.rootPath) throw new Error('Local History requires a root path')

    this.rootPath = path.resolve(options.rootPath)
    this.maxSnapshotsPerFile =
      options.maxSnapshotsPerFile ?? DEFAULT_LOCAL_HISTORY_MAX_SNAPSHOTS_PER_FILE
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_LOCAL_HISTORY_MAX_AGE_MS
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_LOCAL_HISTORY_MAX_TOTAL_BYTES
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID

    if (!isPositiveInteger(this.maxSnapshotsPerFile)) {
      throw new Error('maxSnapshotsPerFile must be a positive integer')
    }
    if (!Number.isFinite(this.maxAgeMs) || this.maxAgeMs < 0) {
      throw new Error('maxAgeMs must be a non-negative number')
    }
    if (!Number.isFinite(this.maxTotalBytes) || this.maxTotalBytes < 0) {
      throw new Error('maxTotalBytes must be a non-negative number')
    }
  }

  async save(request: LocalHistoryCreateRequest): Promise<LocalHistoryEntry> {
    return this.withMutation(async() => {
      const filePath = this.normalizeFilePath(request.filePath)
      const createdAt = request.createdAt ?? this.now()
      if (!Number.isFinite(createdAt)) throw new Error('createdAt must be a finite number')

      const id = await this.nextSnapshotId(filePath)
      const snapshot: StoredLocalHistorySnapshot = {
        schemaVersion: LOCAL_HISTORY_SCHEMA_VERSION,
        id,
        filePath,
        createdAt,
        reason: normalizeReason(request.reason),
        size: Buffer.byteLength(request.content, 'utf8'),
        content: request.content,
        ...(request.encoding ? { encoding: request.encoding } : {}),
        ...(request.lineEnding ? { lineEnding: request.lineEnding } : {})
      }
      const snapshotPath = this.getSnapshotPath(filePath, id)

      await mkdir(path.dirname(snapshotPath), { recursive: true })
      await writeFileAtomic(snapshotPath, JSON.stringify(snapshot), { encoding: 'utf8' })
      await this.pruneInternal()
      return toEntry(toPublicSnapshot(snapshot))
    })
  }

  async list(filePath: string): Promise<LocalHistoryEntry[]> {
    const normalizedPath = this.normalizeFilePath(filePath)
    const directory = this.getHistoryDirectory(normalizedPath)
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }

    const snapshots = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => this.readStoredSnapshot(path.join(directory, entry.name)))
    )

    return snapshots
      .filter(
        (snapshot): snapshot is StoredLocalHistorySnapshot =>
          snapshot !== null && snapshot.filePath === normalizedPath
      )
      .sort(compareNewestFirst)
      .map((snapshot) => toEntry(toPublicSnapshot(snapshot)))
  }

  async read(filePath: string, id: string): Promise<LocalHistorySnapshot | null> {
    const normalizedPath = this.normalizeFilePath(filePath)
    const snapshotPath = this.getSnapshotPath(normalizedPath, id)
    try {
      const snapshot = await this.readStoredSnapshot(snapshotPath)
      if (!snapshot || snapshot.filePath !== normalizedPath) return null
      return toPublicSnapshot(snapshot)
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async delete(filePath: string, id: string): Promise<boolean> {
    return this.withMutation(async() => {
      const snapshotPath = this.getSnapshotPath(this.normalizeFilePath(filePath), id)
      try {
        await unlink(snapshotPath)
        return true
      } catch (error) {
        if (isNotFound(error)) return false
        throw error
      }
    })
  }

  async prune(): Promise<LocalHistoryPruneResult> {
    return this.withMutation(() => this.pruneInternal())
  }

  private normalizeFilePath(filePath: string): string {
    if (!filePath) throw new Error('Local History requires a document path')
    return canonicalFilePath(filePath)
  }

  private getHistoryDirectory(filePath: string): string {
    return path.join(this.rootPath, pathKey(filePath))
  }

  private getSnapshotPath(filePath: string, id: string): string {
    if (!SNAPSHOT_ID_RE.test(id)) throw new Error('Invalid Local History snapshot id')
    return path.join(this.getHistoryDirectory(filePath), `${id}.json`)
  }

  private async nextSnapshotId(filePath: string): Promise<string> {
    const requested = this.createId()
    if (!SNAPSHOT_ID_RE.test(requested)) throw new Error('Invalid Local History snapshot id')

    try {
      await readFile(this.getSnapshotPath(filePath, requested), 'utf8')
      return `${requested}-${randomUUID()}`
    } catch (error) {
      if (isNotFound(error)) return requested
      throw error
    }
  }

  private async readStoredSnapshot(
    snapshotPath: string
  ): Promise<StoredLocalHistorySnapshot | null> {
    let raw: string
    try {
      raw = await readFile(snapshotPath, 'utf8')
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredLocalHistorySnapshot>
      const id = typeof parsed.id === 'string' ? parsed.id : ''
      const filePath = typeof parsed.filePath === 'string' ? parsed.filePath : ''
      const content = typeof parsed.content === 'string' ? parsed.content : null
      const createdAt = parsed.createdAt
      const size = parsed.size
      const reason = parsed.reason
      if (
        parsed.schemaVersion !== LOCAL_HISTORY_SCHEMA_VERSION ||
        !SNAPSHOT_ID_RE.test(id) ||
        id !== snapshotIdFromPath(snapshotPath) ||
        !filePath ||
        content === null ||
        !Number.isFinite(createdAt) ||
        typeof size !== 'number' ||
        size !== Buffer.byteLength(content, 'utf8') ||
        typeof reason !== 'string' ||
        !LOCAL_HISTORY_REASON_SET.has(reason)
      ) { return null }

      return {
        schemaVersion: LOCAL_HISTORY_SCHEMA_VERSION,
        id,
        filePath: canonicalFilePath(filePath),
        createdAt: createdAt as number,
        reason: reason as LocalHistoryReason,
        size,
        content,
        ...(typeof parsed.encoding === 'string' ? { encoding: parsed.encoding } : {}),
        ...(parsed.lineEnding === 'lf' || parsed.lineEnding === 'crlf'
          ? { lineEnding: parsed.lineEnding }
          : {})
      }
    } catch {
      return null
    }
  }

  private async listAllSnapshots(): Promise<
    Array<{ path: string; snapshot: StoredLocalHistorySnapshot }>
  > {
    let directories
    try {
      directories = await readdir(this.rootPath, { withFileTypes: true })
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }

    const snapshots: Array<{ path: string; snapshot: StoredLocalHistorySnapshot }> = []
    for (const directory of directories) {
      if (!directory.isDirectory()) continue
      const directoryPath = path.join(this.rootPath, directory.name)
      const files = await readdir(directoryPath, { withFileTypes: true })
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue
        const snapshotPath = path.join(directoryPath, file.name)
        const snapshot = await this.readStoredSnapshot(snapshotPath)
        if (snapshot) snapshots.push({ path: snapshotPath, snapshot })
      }
    }
    return snapshots
  }

  private async pruneInternal(): Promise<LocalHistoryPruneResult> {
    const all = await this.listAllSnapshots()
    const deleted = new Set<string>()
    const now = this.now()

    for (const item of all) {
      if (now - item.snapshot.createdAt > this.maxAgeMs) deleted.add(item.path)
    }

    const byFile = new Map<string, Array<{ path: string; snapshot: StoredLocalHistorySnapshot }>>()
    for (const item of all) {
      if (deleted.has(item.path)) continue
      const fileSnapshots = byFile.get(item.snapshot.filePath) ?? []
      fileSnapshots.push(item)
      byFile.set(item.snapshot.filePath, fileSnapshots)
    }
    for (const fileSnapshots of byFile.values()) {
      fileSnapshots.sort((left, right) => compareNewestFirst(left.snapshot, right.snapshot))
      for (const item of fileSnapshots.slice(this.maxSnapshotsPerFile)) deleted.add(item.path)
    }

    const retained = all
      .filter((item) => !deleted.has(item.path))
      .sort((left, right) => compareNewestFirst(left.snapshot, right.snapshot))
    let totalBytes = 0
    for (const item of retained) {
      if (totalBytes + item.snapshot.size > this.maxTotalBytes) {
        deleted.add(item.path)
      } else {
        totalBytes += item.snapshot.size
      }
    }

    let deletedCount = 0
    let reclaimedBytes = 0
    for (const item of all) {
      if (!deleted.has(item.path)) continue
      try {
        await unlink(item.path)
        deletedCount += 1
        reclaimedBytes += item.snapshot.size
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    }

    return { deleted: deletedCount, reclaimedBytes }
  }

  private withMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationTail.then(operation, operation)
    this.mutationTail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}
