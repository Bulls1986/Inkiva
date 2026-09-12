import { filter, score } from 'fuzzaldrin'

export interface CancellableSearchPromise<T> extends Promise<T> {
  cancel: () => void
}

export interface FuzzySearchOptions {
  rootPath?: string
  limit?: number
  chunkSize?: number
  getSearchText?: (pathname: string, rootPath?: string) => string
}

interface RankedPath {
  pathname: string
  searchText: string
  score: number
  order: number
}

const DEFAULT_LIMIT = 100
const DEFAULT_CHUNK_SIZE = 128

export class SearchAbortError extends Error {
  constructor() {
    super('Search was cancelled')
    this.name = 'AbortError'
  }
}

const getPathKey = (pathname: string): string => {
  const normalized = pathname.replace(/\\/g, '/')
  // Windows paths are case-insensitive. Keep POSIX paths case-sensitive so
  // two valid Unix files whose names differ only by case remain distinct.
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
}

export class SearchPathIndex {
  private readonly entries = new Map<string, string>()

  replace(pathnames: readonly string[]): void {
    this.entries.clear()
    this.add(pathnames)
  }

  add(pathnames: readonly string[]): void {
    for (const pathname of pathnames) {
      if (!pathname) continue
      const key = getPathKey(pathname)
      if (!this.entries.has(key)) this.entries.set(key, pathname)
    }
  }

  remove(pathnames: readonly string[]): void {
    for (const pathname of pathnames) {
      this.entries.delete(getPathKey(pathname))
    }
  }

  values(): string[] {
    return Array.from(this.entries.values())
  }

  clear(): void {
    this.entries.clear()
  }
}

const defaultSearchText = (pathname: string, rootPath?: string): string => {
  if (!rootPath) return pathname
  const root = rootPath.replace(/[\\/]+$/, '')
  const normalizedPath = pathname.replace(/\\/g, '/')
  const normalizedRoot = root.replace(/\\/g, '/')
  if (normalizedPath === normalizedRoot) return ''
  const prefix = normalizedRoot + '/'
  return normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : pathname
}

/**
 * Fuzzy-filter an already indexed path list without reading file contents.
 * Each chunk is scheduled on a timer so renderer input, editor scrolling, and
 * chart painting can run between chunks. The returned promise is cancellable
 * and rejects with AbortError when a newer query supersedes it.
 */
export const fuzzySearchPaths = (
  pathnames: readonly string[],
  query: string,
  options: FuzzySearchOptions = {}
): CancellableSearchPromise<string[]> => {
  const rootPath = options.rootPath
  const limit = Math.max(0, options.limit ?? DEFAULT_LIMIT)
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK_SIZE)
  const getSearchText = options.getSearchText ?? defaultSearchText
  const trimmedQuery = query.trim()

  let cancelled = false
  let rejectPending: ((reason?: unknown) => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const promise = new Promise<string[]>((resolve, reject) => {
    rejectPending = reject
    if (!trimmedQuery || limit === 0 || pathnames.length === 0) {
      resolve(trimmedQuery ? [] : pathnames.slice(0, limit))
      return
    }

    const ranked: RankedPath[] = []
    let offset = 0

    const processChunk = (): void => {
      timer = null
      if (cancelled) return

      const chunk = pathnames.slice(offset, offset + chunkSize).map((pathname, index) => ({
        pathname,
        searchText: getSearchText(pathname, rootPath),
        order: offset + index
      }))
      offset += chunk.length

      const matching = filter(chunk, trimmedQuery, { key: 'searchText' })
      const matchingSet = new Set(matching)
      for (const candidate of chunk) {
        if (!matchingSet.has(candidate)) continue
        ranked.push({
          ...candidate,
          score: score(candidate.searchText, trimmedQuery)
        })
      }

      if (offset < pathnames.length) {
        timer = setTimeout(processChunk, 0)
        return
      }

      ranked.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        if (left.searchText.length !== right.searchText.length) {
          return left.searchText.length - right.searchText.length
        }
        return left.order - right.order
      })
      resolve(ranked.slice(0, limit).map((entry) => entry.pathname))
    }

    timer = setTimeout(processChunk, 0)
  }) as CancellableSearchPromise<string[]>

  promise.cancel = (): void => {
    if (cancelled) return
    cancelled = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (rejectPending) {
      const reject = rejectPending
      rejectPending = null
      reject(new SearchAbortError())
    }
  }

  return promise
}
