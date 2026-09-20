import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_FUZZY_SEARCH_CHUNK_SIZE,
  fuzzySearchPaths,
  SearchPathIndex
} from '@/node/workspaceSearch'
import {
  createIdleDeferredTask,
  FOLDER_SEARCH_DEBOUNCE_MS
} from '@/components/sideBar/searchTiming'

describe('workspace search primitives', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('uses a large enough default chunk to bound timer scheduling overhead', () => {
    expect(DEFAULT_FUZZY_SEARCH_CHUNK_SIZE).toBe(2048)
  })

  it('keeps folder-search debounce within the responsive fast-path budget', () => {
    expect(FOLDER_SEARCH_DEBOUNCE_MS).toBe(50)
  })

  it('releases hidden search results after the next paint reaches browser idle time', () => {
    const dispose = vi.fn()
    const pending = {
      frame: null as FrameRequestCallback | null,
      idle: null as ((deadline: IdleDeadline) => void) | null
    }
    const target = {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        pending.frame = callback
        return 1
      }),
      cancelAnimationFrame: vi.fn(),
      requestIdleCallback: vi.fn((callback: (deadline: IdleDeadline) => void) => {
        pending.idle = callback
        return 2
      }),
      cancelIdleCallback: vi.fn()
    } as unknown as Window
    const task = createIdleDeferredTask(dispose, target)

    task.schedule()
    expect(dispose).not.toHaveBeenCalled()
    pending.frame?.(0)
    expect(dispose).not.toHaveBeenCalled()
    pending.idle?.({ didTimeout: false, timeRemaining: () => 8 } as IdleDeadline)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('cancels stale deferred disposal when a new search generation takes ownership', () => {
    const dispose = vi.fn()
    const cancelIdleCallback = vi.fn()
    const pending = {
      frame: null as FrameRequestCallback | null,
      idle: null as ((deadline: IdleDeadline) => void) | null
    }
    const target = {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        pending.frame = callback
        return 1
      }),
      cancelAnimationFrame: vi.fn(),
      requestIdleCallback: vi.fn((callback: (deadline: IdleDeadline) => void) => {
        pending.idle = callback
        return 2
      }),
      cancelIdleCallback
    } as unknown as Window
    const task = createIdleDeferredTask(dispose, target)

    task.schedule()
    pending.frame?.(0)
    task.cancel()
    pending.idle?.({ didTimeout: false, timeRemaining: () => 8 } as IdleDeadline)

    expect(cancelIdleCallback).toHaveBeenCalledWith(2)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('fuzzy-matches path segments and ranks the direct match before a longer path', async() => {
    const direct = '/workspace/nested-guide.md'
    const nested = '/workspace/notes/nested-guide.md'
    const result = await fuzzySearchPaths(
      ['/workspace/unrelated.md', nested, direct, '/workspace/guide.md'],
      'ntgd',
      { rootPath: '/workspace', chunkSize: 1 }
    )

    expect(result).toEqual([direct, nested])
  })

  it('keeps the cached path index unique and supports incremental changes', () => {
    const index = new SearchPathIndex()
    index.replace(['/workspace/a.md', '/workspace/b.md', '/workspace/a.md'])
    index.add(['/workspace/c.md', '/workspace/b.md'])

    expect(index.values()).toEqual(['/workspace/a.md', '/workspace/b.md', '/workspace/c.md'])

    index.remove(['/workspace/b.md'])
    expect(index.values()).toEqual(['/workspace/a.md', '/workspace/c.md'])

    index.clear()
    expect(index.values()).toEqual([])
  })

  it('searches in asynchronous chunks and cancels stale work', async() => {
    const pending = fuzzySearchPaths(
      Array.from({ length: 2000 }, (_, index) => '/workspace/file-' + index + '.md'),
      'file',
      { chunkSize: 1 }
    )

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        pending.cancel()
        resolve()
      }, 1)
    })

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('applies a deterministic result limit without reading file contents', async() => {
    const result = await fuzzySearchPaths(
      ['/workspace/alpha.md', '/workspace/alpha-guide.md', '/workspace/alpha-notes.md'],
      'alpha',
      { limit: 2, chunkSize: 2 }
    )

    expect(result).toHaveLength(2)
    expect(result).toEqual(['/workspace/alpha.md', '/workspace/alpha-guide.md'])
  })
})
