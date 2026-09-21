import {
  documentRevisionSnapshots,
  type DocumentRevisionSnapshotCache,
  type SnapshotLifecycle
} from './documentRevisionSnapshot'

export type RuntimeDisposable = () => void

export interface DocumentEditorRuntimeOptions {
  snapshots?: DocumentRevisionSnapshotCache
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
  private readonly disposables = new Set<RuntimeDisposable>()
  private disposed = false

  constructor(options: DocumentEditorRuntimeOptions = {}) {
    this.snapshots = options.snapshots ?? documentRevisionSnapshots
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

  private assertActive(): void {
    if (this.disposed) throw new Error('DocumentEditorRuntime is disposed')
  }
}
