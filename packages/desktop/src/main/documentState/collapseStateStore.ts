import { promises as fs, renameSync } from 'node:fs'

/**
 * Per-document collapse state store (v0.7.0 F5/F6).
 *
 * Records are keyed by a platform file identity (device + inode), never by path
 * alone: the same path can be a different file after an external replacement,
 * and the same file can move. When an identity cannot be established, nothing is
 * stored or restored — the document simply opens fully expanded, which is the
 * approved fallback.
 */

export interface CollapseHeadingRecord {
  key: string
  level: number
  /** Optional on input; a record without it is treated as expanded. */
  collapsed?: boolean
  /** Heading text: the cross-session identity. Records without it never match. */
  text?: string
  /** Ancestor heading texts, outermost first. */
  ancestors: string[]
}

export interface CollapseStateRecord {
  version: number
  identity: string
  headings: CollapseHeadingRecord[]
  updatedAt: number
}

export interface CollapseStateStoreDeps {
  filePath: string
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  identity(path: string): Promise<string | null>
  now?: () => number
}

interface StoreFile {
  version: number
  documents: Record<string, { headings: CollapseHeadingRecord[], updatedAt: number }>
}

const STORE_VERSION = 1

const emptyStore = (): StoreFile => ({ version: STORE_VERSION, documents: {} })

const isHeadingRecord = (value: unknown): value is CollapseHeadingRecord => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.level === 'number' &&
    (candidate.collapsed === undefined || typeof candidate.collapsed === 'boolean') &&
    (candidate.text === undefined || typeof candidate.text === 'string') &&
    Array.isArray(candidate.ancestors) &&
    candidate.ancestors.every((item) => typeof item === 'string')
  )
}

export class CollapseStateStore {
  private readonly deps: CollapseStateStoreDeps
  private queue: Promise<unknown> = Promise.resolve()

  constructor(deps: CollapseStateStoreDeps) {
    this.deps = deps
  }

  async load(pathname: string): Promise<CollapseStateRecord | null> {
    const identity = await this.deps.identity(pathname)
    if (!identity) return null

    const store = await this.readStore()
    const entry = store.documents[identity]
    if (!entry) return null

    return {
      version: STORE_VERSION,
      identity,
      headings: entry.headings,
      updatedAt: entry.updatedAt
    }
  }

  async save(pathname: string, state: { headings: CollapseHeadingRecord[] }): Promise<void> {
    const identity = await this.deps.identity(pathname)
    // Without a verifiable identity nothing is persisted: a later path match
    // alone must never revive state for a file that may have been replaced.
    if (!identity) return

    const headings = state.headings.filter(isHeadingRecord).map((heading) => ({
      key: heading.key,
      level: heading.level,
      collapsed: heading.collapsed === true,
      text: heading.text ?? '',
      ancestors: [...heading.ancestors]
    }))

    await this.mutate((store) => {
      store.documents[identity] = {
        headings,
        updatedAt: (this.deps.now ?? Date.now)()
      }
    })
  }

  /**
   * Move a record to a new identity after the application itself replaced the
   * file (atomic save). Only the file the app just wrote is re-keyed; nothing is
   * inferred about other files, and a missing source record stays missing.
   */
  async rekey(previousIdentity: string, nextIdentity: string): Promise<void> {
    if (!previousIdentity || !nextIdentity || previousIdentity === nextIdentity) return
    await this.mutate((store) => {
      const entry = store.documents[previousIdentity]
      if (!entry) return
      store.documents[nextIdentity] = entry
      delete store.documents[previousIdentity]
    })
  }

  async clear(pathname: string): Promise<void> {
    const identity = await this.deps.identity(pathname)
    if (!identity) return
    await this.mutate((store) => {
      delete store.documents[identity]
    })
  }

  /** Serialized read-modify-write so parallel windows cannot interleave. */
  private mutate(change: (store: StoreFile) => void): Promise<void> {
    const run = this.queue.then(async() => {
      const store = await this.readStore()
      change(store)
      await this.writeStore(store)
    })
    this.queue = run.catch(() => {})
    return run
  }

  private async readStore(): Promise<StoreFile> {
    let raw: string
    try {
      raw = await this.deps.readFile(this.deps.filePath)
    } catch {
      return emptyStore()
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoreFile>
      if (!parsed || parsed.version !== STORE_VERSION || typeof parsed.documents !== 'object') {
        return emptyStore()
      }
      const documents: StoreFile['documents'] = {}
      for (const [identity, entry] of Object.entries(parsed.documents ?? {})) {
        if (!entry || !Array.isArray(entry.headings)) continue
        documents[identity] = {
          headings: entry.headings.filter(isHeadingRecord),
          updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0
        }
      }
      return { version: STORE_VERSION, documents }
    } catch {
      // A damaged store must never break opening a document.
      return emptyStore()
    }
  }

  private async writeStore(store: StoreFile): Promise<void> {
    await this.deps.writeFile(this.deps.filePath, JSON.stringify(store))
  }
}

/** Identity helper used by the main process wiring; exported for unit tests. */
export const fileIdentity = async(pathname: string): Promise<string | null> => {
  try {
    const stat = await fs.stat(pathname, { bigint: true })
    if (!stat.isFile()) return null
    return String(stat.dev) + ':' + String(stat.ino)
  } catch {
    return null
  }
}

export { renameSync }
