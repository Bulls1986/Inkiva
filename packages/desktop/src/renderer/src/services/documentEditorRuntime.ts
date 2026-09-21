import {
  documentRevisionSnapshots,
  type DocumentRevisionSnapshotCache,
  type SnapshotLifecycle
} from './documentRevisionSnapshot'

export type RuntimeDisposable = () => void

export type RuntimeSnapshotMode = 'full' | 'switch' | 'persistence'

export interface RuntimeSnapshotScheduler {
  request: (
    documentId: string,
    capture: (mode?: RuntimeSnapshotMode) => void,
    immediate?: boolean
  ) => void
  flush: (documentId: string, mode?: RuntimeSnapshotMode) => void
  dispose: () => void
}

export interface DocumentEditorRuntimeOptions {
  snapshots?: DocumentRevisionSnapshotCache
  snapshotScheduler?: RuntimeSnapshotScheduler
}

/**
 * High-level owner for one renderer editor runtime.
 *
 * Muya remains authoritative for document semantics. This runtime coordinates
 * renderer lifecycle around revision-scoped derived state and owns teardown of
 * resources registered by the Vue integration layer. ARCH-01 moves concrete
 * editor concerns behind this boundary incrementally so behavior stays stable.
 */
export class DocumentEditorRuntime {
  private readonly snapshots: DocumentRevisionSnapshotCache
  private snapshotScheduler: RuntimeSnapshotScheduler | null = null
  private readonly disposables = new Set<RuntimeDisposable>()
  private disposed = false

  constructor(options: DocumentEditorRuntimeOptions = {}) {
    this.snapshots = options.snapshots ?? documentRevisionSnapshots
    if (options.snapshotScheduler) this.attachSnapshotScheduler(options.snapshotScheduler)
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  registerDisposable(dispose: RuntimeDisposable): () => void {
    this.assertActive()
    this.disposables.add(dispose)
    return () => {
      this.disposables.delete(dispose)
    }
  }

  subscribe<T>(
    subscribe: (handler: T) => void,
    unsubscribe: (handler: T) => void,
    handler: T
  ): void {
    this.assertActive()
    subscribe(handler)
    this.registerDisposable(() => unsubscribe(handler))
  }

  attachSnapshotScheduler(snapshotScheduler: RuntimeSnapshotScheduler): void {
    this.assertActive()
    if (this.snapshotScheduler) throw new Error('DocumentEditorRuntime already owns a snapshot scheduler')
    this.snapshotScheduler = snapshotScheduler
    this.registerDisposable(() => snapshotScheduler.dispose())
  }

  recordMutation(
    documentId: string,
    markDirty: (documentId: string) => number,
    capture: (documentId: string, revision: number, mode?: RuntimeSnapshotMode) => void,
    immediate = false
  ): number {
    this.assertActive()
    const scheduler = this.requireSnapshotScheduler()
    const revision = markDirty(documentId)
    scheduler.request(
      documentId,
      (mode) => capture(documentId, revision, mode),
      immediate
    )
    return revision
  }

  flushSnapshot(documentId: string, mode: RuntimeSnapshotMode = 'full'): void {
    this.assertActive()
    this.requireSnapshotScheduler().flush(documentId, mode)
  }

  activateDocument(documentId: string, revision = this.snapshots.currentRevision(documentId)): number {
    this.assertActive()
    return this.snapshots.seed(documentId, revision, 'active')
  }

  setDocumentLifecycle(documentId: string, lifecycle: SnapshotLifecycle): void {
    this.assertActive()
    this.snapshots.setLifecycle(documentId, lifecycle)
  }

  currentRevision(documentId: string): number {
    return this.snapshots.currentRevision(documentId)
  }

  advanceContentRevision(documentId: string): number {
    this.assertActive()
    return this.snapshots.advanceContentRevision(documentId)
  }

  touchPresentation(documentId: string): void {
    this.assertActive()
    this.snapshots.touchPresentation(documentId)
  }

  getMarkdown(
    documentId: string,
    revision: number,
    compute: () => string
  ): string {
    this.assertActive()
    return this.snapshots.getMarkdown(documentId, revision, compute)
  }

  restoreCurrentHistory<T>(documentId: string, apply: (history: T) => void): boolean {
    this.assertActive()
    const history = this.snapshots.readHistoryMeta<T>(documentId, this.currentRevision(documentId))
    if (history === undefined) return false
    apply(history)
    return true
  }

  getHistoryMeta<T>(documentId: string, revision: number, compute: () => T): T {
    this.assertActive()
    return this.snapshots.getHistoryMeta(documentId, revision, compute)
  }

  getWordCount<T>(documentId: string, revision: number, compute: () => T): T {
    this.assertActive()
    return this.snapshots.getWordCount(documentId, revision, compute)
  }

  getBlocks<T>(
    documentId: string,
    revision: number,
    compute: () => T,
    estimatedCost?: number
  ): T {
    this.assertActive()
    return this.snapshots.getBlocks(documentId, revision, compute, estimatedCost)
  }

  readMarkdown(documentId: string, revision = this.currentRevision(documentId)): string | undefined {
    return this.snapshots.readMarkdown(documentId, revision)
  }

  readHistoryMeta<T>(documentId: string, revision = this.currentRevision(documentId)): T | undefined {
    return this.snapshots.readHistoryMeta<T>(documentId, revision)
  }

  seedMarkdown(documentId: string, revision: number, markdown: string): void {
    this.assertActive()
    this.snapshots.seedMarkdown(documentId, revision, markdown)
  }

  prune(liveDocumentIds: ReadonlySet<string>): void {
    this.assertActive()
    this.snapshots.prune(liveDocumentIds)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    const failures: unknown[] = []
    for (const dispose of [...this.disposables].reverse()) {
      try {
        dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    this.disposables.clear()

    if (failures.length > 0) {
      throw new AggregateError(failures, 'DocumentEditorRuntime disposal failed')
    }
  }

  private requireSnapshotScheduler(): RuntimeSnapshotScheduler {
    if (!this.snapshotScheduler) throw new Error('DocumentEditorRuntime has no snapshot scheduler')
    return this.snapshotScheduler
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('DocumentEditorRuntime is disposed')
  }
}
