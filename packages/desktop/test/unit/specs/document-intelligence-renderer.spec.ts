import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalHistoryEntry,
  LocalHistorySnapshot,
  MarkdownBacklink
} from '@shared/types/documentIntelligence'
import { BackgroundTaskScheduler, BACKGROUND_PRIORITY } from '@/util/backgroundScheduler'
import {
  DocumentIntelligenceCoordinator,
  type DocumentIntelligenceApi,
  type DocumentIntelligenceDocument,
  type DocumentIntelligenceState
} from '@/services/documentIntelligence'

const document = (
  markdown: string,
  overrides: Partial<DocumentIntelligenceDocument> = {}
): DocumentIntelligenceDocument => ({
  id: 'doc-1',
  pathname: '/docs/note.md',
  markdown,
  isSaved: false,
  encoding: 'utf8',
  lineEnding: 'lf',
  ...overrides
})

const historyEntry = (filePath = '/docs/note.md'): LocalHistoryEntry => ({
  id: 'snapshot-1',
  filePath,
  createdAt: 1,
  reason: 'autosave',
  size: 4
})

const snapshot = (filePath = '/docs/note.md'): LocalHistorySnapshot => ({
  ...historyEntry(filePath),
  content: 'old'
})

const createApi = (): DocumentIntelligenceApi => ({
  indexDocument: vi.fn(async() => undefined),
  removeDocument: vi.fn(async() => undefined),
  getBacklinks: vi.fn(async() => []),
  createSnapshot: vi.fn(async(request) => ({
    ...historyEntry(request.filePath),
    size: request.content.length,
    reason: request.reason ?? 'unknown'
  })),
  listSnapshots: vi.fn(async() => []),
  restoreSnapshot: vi.fn(async(request) => snapshot(request.filePath))
})

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let settle!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, resolve: settle }
}

const flushScheduler = async(): Promise<void> => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await vi.advanceTimersByTimeAsync(0)
  }
}

describe('renderer document intelligence coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces indexing and coalesces history snapshots to the newest content', async() => {
    const api = createApi()
    const coordinator = new DocumentIntelligenceCoordinator({
      api,
      indexDelayMs: 100,
      snapshotDelayMs: 200
    })

    coordinator.updateDocuments([document('one')], null)
    coordinator.updateDocuments([document('two')], null)
    coordinator.updateDocuments([document('three')], null)

    await vi.advanceTimersByTimeAsync(99)
    expect(api.indexDocument).not.toHaveBeenCalled()
    expect(api.createSnapshot).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await flushScheduler()
    expect(api.indexDocument).toHaveBeenCalledTimes(1)
    expect(api.indexDocument).toHaveBeenCalledWith('/docs/note.md', 'three')

    await vi.advanceTimersByTimeAsync(100)
    await flushScheduler()
    expect(api.createSnapshot).toHaveBeenCalledTimes(1)
    expect(api.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/docs/note.md',
        content: 'three',
        reason: 'autosave'
      })
    )

    coordinator.updateDocuments(
      [document('three', { pathname: '/docs/renamed.md' })],
      null
    )
    await vi.advanceTimersByTimeAsync(100)
    await flushScheduler()
    expect(api.removeDocument).toHaveBeenCalledWith('/docs/note.md')
    expect(api.indexDocument).toHaveBeenLastCalledWith('/docs/renamed.md', 'three')

    coordinator.dispose()
  })

  it('routes indexing and metadata through the priority scheduler', async() => {
    const api = createApi()
    const slices: Array<{ id: string; priority: number }> = []
    const scheduler = new BackgroundTaskScheduler({
      onSlice: (task) => slices.push({ id: task.id, priority: task.priority })
    })
    const coordinator = new DocumentIntelligenceCoordinator({
      api,
      scheduler,
      indexDelayMs: 10
    })

    coordinator.updateDocuments([document('one')], 'doc-1')
    await vi.advanceTimersByTimeAsync(10)
    await flushScheduler()

    expect(api.indexDocument).toHaveBeenCalledWith('/docs/note.md', 'one')
    expect(api.getBacklinks).toHaveBeenCalledWith('/docs/note.md')
    expect(api.listSnapshots).toHaveBeenCalledWith('/docs/note.md')
    expect(slices.map(({ priority }) => priority)).toEqual(
      expect.arrayContaining([
        BACKGROUND_PRIORITY.backgroundIndexing,
        BACKGROUND_PRIORITY.backlinkMetadataStatistics
      ])
    )

    coordinator.dispose()
  })

  it('holds P6 work while the editor interaction window is pending', async() => {
    const api = createApi()
    const scheduler = new BackgroundTaskScheduler()
    const coordinator = new DocumentIntelligenceCoordinator({
      api,
      scheduler,
      indexDelayMs: 10
    })

    coordinator.setInteractivePending(true)
    coordinator.updateDocuments([document('one')], null)
    await vi.advanceTimersByTimeAsync(10)
    expect(api.indexDocument).not.toHaveBeenCalled()

    coordinator.setInteractivePending(false)
    await flushScheduler()
    expect(api.indexDocument).toHaveBeenCalledWith('/docs/note.md', 'one')

    coordinator.dispose()
  })

  it('keeps the latest current-document state when an older load resolves last', async() => {
    const api = createApi()
    const firstBacklinks = deferred<MarkdownBacklink[]>()
    const firstHistory = deferred<LocalHistoryEntry[]>()
    const states: DocumentIntelligenceState[] = []
    vi.mocked(api.getBacklinks).mockImplementation((pathname) =>
      pathname === '/docs/first.md' ? firstBacklinks.promise : Promise.resolve([])
    )
    vi.mocked(api.listSnapshots).mockImplementation((pathname) =>
      pathname === '/docs/first.md'
        ? firstHistory.promise
        : Promise.resolve([historyEntry(pathname)])
    )
    const coordinator = new DocumentIntelligenceCoordinator({
      api,
      onStateChange: (state) => states.push(state)
    })

    const first = document('first', { id: 'first', pathname: '/docs/first.md' })
    const second = document('second', { id: 'second', pathname: '/docs/second.md' })
    coordinator.updateDocuments([first, second], first.id)
    await flushScheduler()
    coordinator.updateDocuments([first, second], second.id)
    await flushScheduler()

    expect(coordinator.getState()).toMatchObject({
      currentDocumentId: second.id,
      currentPath: second.pathname,
      loading: false,
      backlinks: [],
      history: [historyEntry(second.pathname)]
    })

    firstBacklinks.resolve([
      {
        sourcePath: '/docs/source.md',
        label: 'first',
        destination: 'first.md',
        fragment: '',
        line: 1,
        start: 0,
        end: 5
      }
    ])
    firstHistory.resolve([historyEntry(first.pathname)])
    await flushScheduler()

    expect(coordinator.getState().currentDocumentId).toBe(second.id)
    expect(coordinator.getState().history).toEqual([historyEntry(second.pathname)])
    expect(states.at(-1)?.loading).toBe(false)

    coordinator.dispose()
  })

  it('blocks dirty restores and reports a stale-content rejection', async() => {
    const api = createApi()
    const coordinator = new DocumentIntelligenceCoordinator({ api })
    coordinator.updateDocuments([document('current')], 'doc-1')
    await vi.advanceTimersByTimeAsync(0)

    await expect(coordinator.restoreSnapshot('snapshot-1')).resolves.toBeNull()
    expect(api.restoreSnapshot).not.toHaveBeenCalled()
    expect(coordinator.getState().error).toBe('restore-unsaved')

    coordinator.updateDocuments([document('current', { isSaved: true })], 'doc-1')
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(api.restoreSnapshot).mockRejectedValueOnce(
      new Error('The Markdown file changed while Local History restore was awaiting confirmation')
    )

    const staleRestore = coordinator.restoreSnapshot('snapshot-1')
    await flushScheduler()
    await expect(staleRestore).resolves.toBeNull()
    expect(api.restoreSnapshot).toHaveBeenCalledWith({
      filePath: '/docs/note.md',
      id: 'snapshot-1',
      expectedCurrentContent: 'current'
    })
    expect(coordinator.getState()).toMatchObject({
      restoringSnapshotId: null,
      error: 'restore-stale'
    })

    coordinator.dispose()
  })
})
