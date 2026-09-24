import {
  BACKGROUND_PRIORITY,
  BackgroundTaskScheduler,
  type BackgroundPriority
} from '@/util/backgroundScheduler'
import type {
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryRestoreRequest,
  LocalHistorySnapshot,
  MarkdownBacklink
} from '@shared/types/documentIntelligence'

export interface DocumentIntelligenceDocument {
  id: string
  pathname: string
  markdown: string
  isSaved: boolean
  encoding?: string
  lineEnding?: 'lf' | 'crlf'
}

export type DocumentIntelligenceError =
  | 'load'
  | 'sync'
  | 'restore'
  | 'restore-unsaved'
  | 'restore-stale'

export interface DocumentIntelligenceState {
  currentDocumentId: string | null
  currentPath: string | null
  backlinks: MarkdownBacklink[]
  history: LocalHistoryEntry[]
  loading: boolean
  restoringSnapshotId: string | null
  error: DocumentIntelligenceError | null
}

export interface DocumentIntelligenceApi {
  indexDocument(pathname: string, markdown: string): Promise<void>
  removeDocument(pathname: string): Promise<void>
  getBacklinks(targetPath: string): Promise<MarkdownBacklink[]>
  createSnapshot(request: LocalHistoryCreateRequest): Promise<LocalHistoryEntry>
  listSnapshots(filePath: string): Promise<LocalHistoryEntry[]>
  getSnapshot(filePath: string, id: string): Promise<LocalHistorySnapshot | null>
  restoreSnapshot(request: LocalHistoryRestoreRequest): Promise<LocalHistorySnapshot>
}

interface SnapshotCandidate {
  document: DocumentIntelligenceDocument
  reason: LocalHistoryCreateRequest['reason']
}

interface DocumentIntelligenceCoordinatorOptions {
  api: DocumentIntelligenceApi
  onStateChange?: (state: DocumentIntelligenceState) => void
  indexDelayMs?: number
  snapshotDelayMs?: number
  scheduler?: BackgroundTaskScheduler
}

const DEFAULT_INDEX_DELAY_MS = 350
const DEFAULT_SNAPSHOT_DELAY_MS = 2_000

const initialState = (): DocumentIntelligenceState => ({
  currentDocumentId: null,
  currentPath: null,
  backlinks: [],
  history: [],
  loading: false,
  restoringSnapshotId: null,
  error: null
})

const isStaleRestoreError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'StaleLocalHistoryRestoreError' ||
    error.message.includes('changed while Local History restore')
  )
}

/**
 * Coalesces renderer document lifecycle changes before crossing the preload
 * boundary. The coordinator is framework-agnostic so timer and stale-response
 * behavior can be covered without mounting the application shell.
 */
export class DocumentIntelligenceCoordinator {
  private readonly api: DocumentIntelligenceApi
  private readonly scheduler: BackgroundTaskScheduler
  private readonly pendingBackgroundCancels = new Set<() => void>()
  private readonly onStateChange?: (state: DocumentIntelligenceState) => void
  private readonly indexDelayMs: number
  private readonly snapshotDelayMs: number
  private readonly documents = new Map<string, DocumentIntelligenceDocument>()
  private readonly pendingIndexes = new Map<string, DocumentIntelligenceDocument>()
  private readonly pendingRemovals = new Set<string>()
  private readonly pendingSnapshots = new Map<string, SnapshotCandidate>()
  private readonly lastSnapshotContent = new Map<string, string>()
  private indexTimer: ReturnType<typeof setTimeout> | null = null
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null
  private selectionVersion = 0
  private disposed = false
  private state = initialState()

  constructor(options: DocumentIntelligenceCoordinatorOptions) {
    this.api = options.api
    this.scheduler = options.scheduler ?? new BackgroundTaskScheduler()
    this.onStateChange = options.onStateChange
    this.indexDelayMs = options.indexDelayMs ?? DEFAULT_INDEX_DELAY_MS
    this.snapshotDelayMs = options.snapshotDelayMs ?? DEFAULT_SNAPSHOT_DELAY_MS
  }

  getState(): DocumentIntelligenceState {
    return {
      ...this.state,
      backlinks: [...this.state.backlinks],
      history: [...this.state.history]
    }
  }

  setInteractivePending(pending: boolean): void {
    this.scheduler.setInteractivePending(pending)
  }

  updateDocuments(
    documents: readonly DocumentIntelligenceDocument[],
    currentId: string | null
  ): void {
    if (this.disposed) return

    const nextDocuments = new Map(documents.map((document) => [document.id, document]))

    for (const [id, previous] of this.documents) {
      const next = nextDocuments.get(id)
      if (!next) {
        this.pendingIndexes.delete(id)
        if (previous.pathname) {
          this.pendingRemovals.add(previous.pathname)
          if (!previous.isSaved) this.scheduleSnapshot(previous, 'close')
        }
        continue
      }

      if (previous.pathname && previous.pathname !== next.pathname) {
        this.pendingRemovals.add(previous.pathname)
      }
    }

    for (const document of documents) {
      const previous = this.documents.get(document.id)
      if (
        document.pathname &&
        (!previous ||
          previous.pathname !== document.pathname ||
          previous.markdown !== document.markdown)
      ) {
        this.pendingIndexes.set(document.id, document)
      }

      if (
        previous?.pathname === document.pathname &&
        previous.markdown !== document.markdown &&
        document.pathname
      ) {
        this.scheduleSnapshot(document, 'autosave')
      }

      if (
        previous?.pathname === document.pathname &&
        !previous.isSaved &&
        document.isSaved &&
        document.pathname
      ) {
        this.scheduleSnapshot(document, 'before-save')
        void this.flushSnapshots()
      }
    }

    this.documents.clear()
    for (const [id, document] of nextDocuments) this.documents.set(id, document)

    if (this.pendingIndexes.size || this.pendingRemovals.size) this.scheduleIndexFlush()

    const current = currentId ? this.documents.get(currentId) : undefined
    const currentPath = current?.pathname || null
    const selectionChanged =
      this.state.currentDocumentId !== (current?.id ?? null) ||
      this.state.currentPath !== currentPath

    if (selectionChanged) {
      this.selectionVersion += 1
      this.patchState({
        currentDocumentId: current?.id ?? null,
        currentPath,
        backlinks: [],
        history: [],
        loading: !!currentPath,
        restoringSnapshotId: null,
        error: null
      })
      if (currentPath) void this.loadCurrent(this.selectionVersion, currentPath)
    }
  }

  async refresh(): Promise<void> {
    if (!this.state.currentPath || this.disposed) return
    const version = this.selectionVersion
    this.patchState({ loading: true, error: null })
    await this.loadCurrent(version, this.state.currentPath)
  }

  async getSnapshot(id: string): Promise<LocalHistorySnapshot | null> {
    const current = this.state.currentDocumentId
      ? this.documents.get(this.state.currentDocumentId)
      : undefined
    if (!current?.pathname || this.disposed) return null
    const version = this.selectionVersion
    const pathname = current.pathname

    try {
      const snapshot = await this.runBackground(
        'snapshot-preview:' + pathname,
        BACKGROUND_PRIORITY.tabNavigation,
        () => this.api.getSnapshot(pathname, id)
      )
      if (version !== this.selectionVersion || this.disposed) return null
      return snapshot
    } catch {
      return null
    }
  }

  async restoreSnapshot(id: string): Promise<LocalHistorySnapshot | null> {
    const current = this.state.currentDocumentId
      ? this.documents.get(this.state.currentDocumentId)
      : undefined
    if (!current?.pathname || this.disposed) return null
    if (!current.isSaved) {
      this.patchState({ error: 'restore-unsaved' })
      return null
    }

    // A restore supersedes any in-flight metadata load for the same selection.
    // Without a new version, that older response can clear restore-stale/restore-unsaved
    // diagnostics after this operation has already reported them.
    this.selectionVersion += 1
    const version = this.selectionVersion
    const expectedContent = current.markdown
    this.patchState({ restoringSnapshotId: id, error: null })
    try {
      const snapshot = await this.runBackground(
        'snapshot-restore:' + current.pathname,
        BACKGROUND_PRIORITY.tabNavigation,
        () =>
          this.api.restoreSnapshot({
            filePath: current.pathname,
            id,
            expectedCurrentContent: expectedContent
          })
      )
      if (version !== this.selectionVersion || this.disposed) return null
      this.lastSnapshotContent.set(current.pathname, snapshot.content)
      this.patchState({ restoringSnapshotId: null })
      await this.refresh()
      return snapshot
    } catch (error) {
      if (version === this.selectionVersion && !this.disposed) {
        this.patchState({
          restoringSnapshotId: null,
          error: isStaleRestoreError(error) ? 'restore-stale' : 'restore'
        })
      }
      return null
    }
  }

  dispose(): void {
    this.disposed = true
    this.selectionVersion += 1
    if (this.indexTimer) clearTimeout(this.indexTimer)
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.indexTimer = null
    this.snapshotTimer = null
    this.pendingIndexes.clear()
    this.pendingRemovals.clear()
    this.pendingSnapshots.clear()
    for (const cancel of this.pendingBackgroundCancels) cancel()
    this.pendingBackgroundCancels.clear()
    this.scheduler.close()
  }

  private patchState(patch: Partial<DocumentIntelligenceState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.onStateChange?.(this.getState())
  }

  private runBackground<T>(
    id: string,
    priority: BackgroundPriority,
    task: () => Promise<T>
  ): Promise<T> {
    let value!: T
    const handle = this.scheduler.enqueueAndWait({
      id,
      priority,
      run: async() => {
        value = await task()
      }
    })
    const cancel = handle.cancel
    this.pendingBackgroundCancels.add(cancel)
    return handle.promise.finally(() => {
      this.pendingBackgroundCancels.delete(cancel)
    }).then(() => value)
  }

  private scheduleIndexFlush(): void {
    if (this.indexTimer) clearTimeout(this.indexTimer)
    this.indexTimer = setTimeout(() => {
      this.indexTimer = null
      void this.flushIndexes(true)
    }, this.indexDelayMs)
  }

  private scheduleSnapshot(
    document: DocumentIntelligenceDocument,
    reason: LocalHistoryCreateRequest['reason']
  ): void {
    if (
      !document.pathname ||
      this.lastSnapshotContent.get(document.pathname) === document.markdown
    ) {
      return
    }
    this.pendingSnapshots.set(document.pathname, { document, reason })
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null
      void this.flushSnapshots()
    }, this.snapshotDelayMs)
  }

  private async flushIndexes(refreshBacklinks: boolean): Promise<void> {
    if (this.disposed) return
    const removals = [...this.pendingRemovals]
    const indexes = [...this.pendingIndexes.values()]
    this.pendingRemovals.clear()
    this.pendingIndexes.clear()

    try {
      await Promise.all(
        removals.map((pathname) =>
          this.runBackground(
            'document-sync:' + pathname,
            BACKGROUND_PRIORITY.backgroundIndexing,
            () => this.api.removeDocument(pathname)
          )
        )
      )
      await Promise.all(
        indexes.map((document) =>
          this.runBackground(
            'document-sync:' + document.pathname,
            BACKGROUND_PRIORITY.backgroundIndexing,
            () => this.api.indexDocument(document.pathname, document.markdown)
          )
        )
      )
      if (refreshBacklinks) await this.refreshBacklinks()
    } catch {
      this.patchState({ loading: false, error: 'sync' })
    }
  }

  private async flushSnapshots(): Promise<void> {
    if (this.disposed || this.pendingSnapshots.size === 0) return
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = null
    const snapshots = [...this.pendingSnapshots.values()]
    this.pendingSnapshots.clear()

    try {
      await Promise.all(
        snapshots.map(async({ document, reason }) => {
          await this.runBackground(
            'snapshot-create:' + document.pathname,
            BACKGROUND_PRIORITY.backlinkMetadataStatistics,
            () =>
              this.api.createSnapshot({
                filePath: document.pathname,
                content: document.markdown,
                reason,
                ...(document.encoding ? { encoding: document.encoding } : {}),
                ...(document.lineEnding ? { lineEnding: document.lineEnding } : {})
              })
          )
          this.lastSnapshotContent.set(document.pathname, document.markdown)
        })
      )
      await this.refreshHistory()
    } catch {
      this.patchState({ error: 'sync' })
    }
  }

  private async loadCurrent(version: number, pathname: string): Promise<void> {
    await this.flushIndexes(false)
    if (version !== this.selectionVersion || this.disposed) return

    try {
      const [backlinks, history] = await Promise.all([
        this.runBackground(
          'backlinks:' + pathname,
          BACKGROUND_PRIORITY.backlinkMetadataStatistics,
          () => this.api.getBacklinks(pathname)
        ),
        this.runBackground(
          'history:' + pathname,
          BACKGROUND_PRIORITY.backlinkMetadataStatistics,
          () => this.api.listSnapshots(pathname)
        )
      ])
      if (version !== this.selectionVersion || this.disposed) return
      this.patchState({ backlinks, history, loading: false, error: null })
    } catch {
      if (version === this.selectionVersion) {
        this.patchState({ loading: false, error: 'load' })
      }
    }
  }

  private async refreshBacklinks(): Promise<void> {
    const pathname = this.state.currentPath
    const version = this.selectionVersion
    if (!pathname || this.disposed) return
    try {
      const backlinks = await this.runBackground(
        'backlinks:' + pathname,
        BACKGROUND_PRIORITY.backlinkMetadataStatistics,
        () => this.api.getBacklinks(pathname)
      )
      if (version === this.selectionVersion && !this.disposed) this.patchState({ backlinks })
    } catch {
      if (version === this.selectionVersion) this.patchState({ error: 'sync' })
    }
  }

  private async refreshHistory(): Promise<void> {
    const pathname = this.state.currentPath
    const version = this.selectionVersion
    if (!pathname || this.disposed) return
    try {
      const history = await this.runBackground(
        'history:' + pathname,
        BACKGROUND_PRIORITY.backlinkMetadataStatistics,
        () => this.api.listSnapshots(pathname)
      )
      if (version === this.selectionVersion && !this.disposed) this.patchState({ history })
    } catch {
      if (version === this.selectionVersion) this.patchState({ error: 'sync' })
    }
  }
}
