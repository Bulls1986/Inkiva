import { defineStore } from 'pinia'

export type RecentDocumentKind = 'file' | 'folder'

export interface RecentDocument {
  pathname: string
  kind: RecentDocumentKind
  pinned: boolean
  lastOpenedAt: number
}

export const RECENT_DOCUMENTS_STORAGE_KEY = 'inkiva.recent-documents'
export const REMOVED_RECENT_DOCUMENTS_STORAGE_KEY = 'inkiva.removed-recent-documents'
export const MAX_RECENT_DOCUMENTS = 12

const MAIN_RECENT_DOCUMENTS_FILE_NAME = 'recently-used-documents.json'
let hydrationPromise: Promise<void> | null = null

interface PersistedRecentDocument {
  pathname?: unknown
  kind?: unknown
  pinned?: unknown
  lastOpenedAt?: unknown
}

const pathKey = (pathname: string): string => {
  const normalized = pathname.trim().replaceAll('\\', '/').replace(/\/+/g, '/')
  if (normalized.length > 1) return normalized.replace(/\/$/, '')
  return normalized
}

const samePath = (a: string, b: string): boolean => {
  try {
    const matcher = window.fileUtils?.isSamePathSync
    if (typeof matcher === 'function') return matcher(a, b)
  } catch {
    // The renderer bridge may not exist in unit tests or during first paint.
  }
  return pathKey(a).toLowerCase() === pathKey(b).toLowerCase()
}

const normalizeEntry = (
  value: unknown,
  fallbackTimestamp: number
): RecentDocument | null => {
  if (typeof value === 'string') {
    const pathname = value.trim()
    return pathname
      ? { pathname, kind: 'file', pinned: false, lastOpenedAt: fallbackTimestamp }
      : null
  }

  if (!value || typeof value !== 'object') return null
  const raw = value as PersistedRecentDocument
  const pathname = typeof raw.pathname === 'string' ? raw.pathname.trim() : ''
  if (!pathname) return null

  return {
    pathname,
    kind: raw.kind === 'folder' ? 'folder' : 'file',
    pinned: raw.pinned === true,
    lastOpenedAt:
      typeof raw.lastOpenedAt === 'number' && Number.isFinite(raw.lastOpenedAt)
        ? raw.lastOpenedAt
        : fallbackTimestamp,
  }
}

export const sortRecentDocuments = (entries: readonly RecentDocument[]): RecentDocument[] =>
  [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.lastOpenedAt !== b.lastOpenedAt) return b.lastOpenedAt - a.lastOpenedAt
    return a.pathname.localeCompare(b.pathname)
  })

export const normalizeRecentDocuments = (value: unknown): RecentDocument[] => {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : []
  const now = Date.now()
  const entries: RecentDocument[] = []

  source.forEach((item, index) => {
    const entry = normalizeEntry(item, now - index)
    if (!entry) return
    const duplicate = entries.findIndex((candidate) => samePath(candidate.pathname, entry.pathname))
    if (duplicate === -1) {
      entries.push(entry)
      return
    }

    const current = entries[duplicate]
    if (!current) return
    current.pinned = current.pinned || entry.pinned
    current.lastOpenedAt = Math.max(current.lastOpenedAt, entry.lastOpenedAt)
    if (current.kind === 'file' && entry.kind === 'folder') current.kind = 'folder'
  })

  return entries
}

export const mergeRecentDocuments = (
  ...lists: ReadonlyArray<RecentDocument>[]
): RecentDocument[] => {
  const entries: RecentDocument[] = []
  for (const list of lists) {
    for (const entry of list) {
      const duplicate = entries.findIndex((candidate) => samePath(candidate.pathname, entry.pathname))
      if (duplicate === -1) {
        entries.push({ ...entry })
        continue
      }

      const current = entries[duplicate]
      if (!current) continue
      current.pinned = current.pinned || entry.pinned
      current.lastOpenedAt = Math.max(current.lastOpenedAt, entry.lastOpenedAt)
      if (current.kind === 'file' && entry.kind === 'folder') current.kind = 'folder'
    }
  }
  return sortRecentDocuments(entries)
}

export const limitRecentDocuments = (entries: readonly RecentDocument[]): RecentDocument[] => {
  const sorted = sortRecentDocuments(entries)
  const pinned = sorted.filter((entry) => entry.pinned)
  const unpinned = sorted.filter((entry) => !entry.pinned)
  if (pinned.length >= MAX_RECENT_DOCUMENTS) return pinned
  return pinned.concat(unpinned.slice(0, MAX_RECENT_DOCUMENTS - pinned.length))
}

const readStorageEntries = (): RecentDocument[] => {
  try {
    const raw = localStorage.getItem(RECENT_DOCUMENTS_STORAGE_KEY)
    return raw ? normalizeRecentDocuments(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

const readRemovedPaths = (): string[] => {
  try {
    const raw = localStorage.getItem(REMOVED_RECENT_DOCUMENTS_STORAGE_KEY)
    const paths = raw ? JSON.parse(raw) : []
    return Array.isArray(paths) ? paths.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

const persistEntries = (entries: readonly RecentDocument[]): void => {
  try {
    localStorage.setItem(RECENT_DOCUMENTS_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Recent documents are a convenience; a full or unavailable storage area
    // must not block opening a document.
  }
}

const persistRemovedPaths = (paths: readonly string[]): void => {
  try {
    localStorage.setItem(REMOVED_RECENT_DOCUMENTS_STORAGE_KEY, JSON.stringify(paths))
  } catch {
    // See persistEntries: persistence failure is non-fatal.
  }
}

const notifyMainOfRecentPath = (pathname: string): void => {
  try {
    window.electron?.ipcRenderer?.send('mt::add-recently-used-document', pathname)
  } catch {
    // The main menu already records normal opens; this is only a best-effort
    // bridge for renderer-originated folder/file actions.
  }
}

const readMainRecentDocuments = async(): Promise<RecentDocument[]> => {
  try {
    const userDataPath = window.electron?.paths?.userData
    const fileUtils = window.fileUtils
    if (!userDataPath || !fileUtils?.readFile) return []

    const recentPath = window.path.join(userDataPath, MAIN_RECENT_DOCUMENTS_FILE_NAME)
    const raw = await fileUtils.readFile(recentPath, 'utf8')
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
    const paths = JSON.parse(text)
    if (!Array.isArray(paths)) return []

    const entries: RecentDocument[] = []
    for (const [index, value] of paths.entries()) {
      if (typeof value !== 'string' || !value.trim()) continue
      let kind: RecentDocumentKind = 'file'
      try {
        if (await fileUtils.isDirectory(value)) kind = 'folder'
      } catch {
        // A missing path remains visible as a file so the user can remove it.
      }
      entries.push({
        pathname: value.trim(),
        kind,
        pinned: false,
        lastOpenedAt: Date.now() - index
      })
    }
    return entries
  } catch {
    return []
  }
}

export const useRecentDocumentsStore = defineStore('recentDocuments', {
  state: () => ({
    items: limitRecentDocuments(readStorageEntries()),
    removedPaths: readRemovedPaths(),
    hydrated: false
  }),

  actions: {
    async HYDRATE(): Promise<void> {
      if (this.hydrated) return
      if (hydrationPromise) return hydrationPromise

      hydrationPromise = (async() => {
        const mainEntries = await readMainRecentDocuments()
        const filteredMainEntries = mainEntries.filter(
          (entry) => !this.removedPaths.some((pathname) => samePath(pathname, entry.pathname))
        )
        this.items = limitRecentDocuments(mergeRecentDocuments(this.items, filteredMainEntries))
        persistEntries(this.items)
        this.hydrated = true
      })()

      try {
        await hydrationPromise
      } finally {
        hydrationPromise = null
      }
    },

    RECORD(pathname: string, kind: RecentDocumentKind): void {
      const trimmedPath = pathname.trim()
      if (!trimmedPath) return

      this.removedPaths = this.removedPaths.filter((value) => !samePath(value, trimmedPath))
      const now = Date.now()
      const existingIndex = this.items.findIndex((entry) => samePath(entry.pathname, trimmedPath))
      const existing = existingIndex === -1 ? undefined : this.items[existingIndex]
      const nextEntry: RecentDocument = {
        pathname: trimmedPath,
        kind,
        pinned: existing?.pinned ?? false,
        lastOpenedAt: now
      }

      const nextItems = this.items.filter((_, index) => index !== existingIndex)
      nextItems.push(nextEntry)
      this.items = limitRecentDocuments(nextItems)
      persistEntries(this.items)
      persistRemovedPaths(this.removedPaths)
      notifyMainOfRecentPath(trimmedPath)
    },

    RECORD_FILE(pathname: string): void {
      this.RECORD(pathname, 'file')
    },

    RECORD_FOLDER(pathname: string): void {
      this.RECORD(pathname, 'folder')
    },

    TOGGLE_PIN(pathname: string): void {
      const entry = this.items.find((candidate) => samePath(candidate.pathname, pathname))
      if (!entry) return
      entry.pinned = !entry.pinned
      this.items = limitRecentDocuments(this.items)
      persistEntries(this.items)
    },

    REMOVE(pathname: string): void {
      this.items = this.items.filter((entry) => !samePath(entry.pathname, pathname))
      if (!this.removedPaths.some((value) => samePath(value, pathname))) {
        this.removedPaths.push(pathname)
      }
      persistEntries(this.items)
      persistRemovedPaths(this.removedPaths)
    },

    CLEAR(): void {
      this.items = []
      this.removedPaths = []
      persistEntries(this.items)
      persistRemovedPaths(this.removedPaths)
      try {
        window.electron?.ipcRenderer?.send('menu-clear-recently-used')
      } catch {
        // The renderer list is already cleared when the menu is unavailable.
      }
    }
  }
})
