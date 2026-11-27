import { promises as fs, renameSync, statSync } from 'node:fs'

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
  /**
   * Synchronous counterparts, used only for the quit flush. A window that is
   * unloading cannot await anything, so the last pending write has to complete
   * in the same turn that the renderer is torn down.
   */
  sync?: {
    readFile(path: string): string
    writeFile(path: string, text: string): void
    identity(path: string): string | null
  }
}

interface StoreFile {
  version: number
  documents: Record<string, { headings: CollapseHeadingRecord[], updatedAt: number }>
}

const STORE_VERSION = 1

const emptyStore = (): StoreFile => ({ version: STORE_VERSION, documents: {} })

/** Stable heading identity used when two snapshots have to be merged. */
export const headingIdentityKey = (heading: {
  level: number
  text?: string
  ancestors: string[]
}): string => [heading.level, heading.text ?? '', ...heading.ancestors].join('\u0000')

const normalizeHeadings = (headings: CollapseHeadingRecord[]): CollapseHeadingRecord[] =>
  headings.filter(isHeadingRecord).map((heading) => ({
    key: heading.key,
    level: heading.level,
    collapsed: heading.collapsed === true,
    text: heading.text ?? '',
    ancestors: [...heading.ancestors]
  }))

/** Parses a store file; anything damaged becomes an empty store. */
const parseStoreFile = (raw: string): StoreFile => {
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

    const headings = normalizeHeadings(state.headings)

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

  /**
   * Write one record synchronously, for the quit flush only.
   *
   * It does not consult the in-memory queue: the window is going away and the
   * snapshot it carries is the newest user intent. A failure is swallowed on
   * purpose — quitting must never be blocked by the state file.
   */
  /**
   * Merge headings into the stored record synchronously.
   *
   * Used by the quit flush: the window could not wait for the record read, so its
   * snapshot holds only what the user just changed. Writing that snapshot as-is
   * would erase every heading the record still had; merging by heading identity
   * keeps them and applies the user's newer intent.
   */
  mergeSync(pathname: string, touched: CollapseHeadingRecord[]): boolean {
    const sync = this.deps.sync
    if (!sync) return false
    try {
      const identity = sync.identity(pathname)
      if (!identity) return false
      const store = parseStoreFile(sync.readFile(this.deps.filePath))
      const existing = store.documents[identity]?.headings ?? []
      const merged = new Map(existing.map((heading) => [headingIdentityKey(heading), heading]))
      for (const heading of normalizeHeadings(touched)) {
        merged.set(headingIdentityKey(heading), heading)
      }
      store.documents[identity] = {
        headings: [...merged.values()],
        updatedAt: (this.deps.now ?? Date.now)()
      }
      sync.writeFile(this.deps.filePath, JSON.stringify(store))
      return true
    } catch {
      return false
    }
  }

  saveSync(pathname: string, state: { headings: CollapseHeadingRecord[] }): boolean {
    const sync = this.deps.sync
    if (!sync) return false
    try {
      const identity = sync.identity(pathname)
      if (!identity) return false
      const store = parseStoreFile(sync.readFile(this.deps.filePath))
      store.documents[identity] = {
        headings: normalizeHeadings(state.headings),
        updatedAt: (this.deps.now ?? Date.now)()
      }
      sync.writeFile(this.deps.filePath, JSON.stringify(store))
      return true
    } catch {
      return false
    }
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
    return parseStoreFile(raw)
  }

  private async writeStore(store: StoreFile): Promise<void> {
    await this.deps.writeFile(this.deps.filePath, JSON.stringify(store))
  }
}

/**
 * Identity key for a file, or null when the identity cannot be confirmed.
 *
 * `dev:ino` alone is not enough: on ext4 (and in principle on NTFS/APFS) the
 * allocator reuses the inode number of a file that was deleted and recreated at
 * the same path, so a replacement would inherit the old record. The birth time
 * separates the two generations.
 *
 * It is not proof on its own, and two limits remain: a filesystem with a coarse
 * timestamp can still collide, and the inode can be reused for a file created in
 * the same instant. What it does decide is whether an identity is confirmed at
 * all — some filesystems report no birth time (drvfs, NFS, older kernels report
 * 0), and there a reused inode is indistinguishable from the original. Following
 * the approved contract, an unconfirmed identity returns null so the document
 * opens expanded instead of falling back to a weaker `dev:ino` key that a
 * replacement can match.
 */
export const identityKey = (stat: {
  dev: bigint
  ino: bigint
  birthtimeNs: bigint
}): string | null => {
  if (stat.birthtimeNs <= 0n) return null
  return String(stat.dev) + ':' + String(stat.ino) + ':' + String(stat.birthtimeNs)
}

/** Synchronous identity, for the quit flush while the window is unloading. */
export const fileIdentitySync = (pathname: string): string | null => {
  try {
    const stat = statSync(pathname, { bigint: true })
    if (!stat.isFile()) return null
    return identityKey({ dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs })
  } catch {
    return null
  }
}

/** Identity helper used by the main process wiring; exported for unit tests. */
export const fileIdentity = async(pathname: string): Promise<string | null> => {
  try {
    const stat = await fs.stat(pathname, { bigint: true })
    if (!stat.isFile()) return null
    return identityKey({ dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs })
  } catch {
    return null
  }
}

export { renameSync }
