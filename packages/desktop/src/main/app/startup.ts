export const StartupPhase = {
  BOOTING: 'booting',
  SHELL_VISIBLE: 'shell-visible',
  RESTORING: 'restoring',
  READY: 'ready'
} as const

export type StartupPhaseValue = (typeof StartupPhase)[keyof typeof StartupPhase]

type StartupCallback = () => void

export interface StartupPhaseCoordinatorOptions {
  documentEditableTimeoutMs?: number
  onDocumentEditableTimeout?: () => void
}

/**
 * Coordinates startup work around the user-visible milestones:
 * native shell visible, renderer handshake complete, and first document
 * editable. Background work is released only at the last milestone.
 */
export class StartupPhaseCoordinator {
  private _phase: StartupPhaseValue = StartupPhase.BOOTING
  private _rendererReady = false
  private _documentEditable = false
  private _disposed = false
  private _documentEditableTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly _interactiveCallbacks = new Set<StartupCallback>()
  private readonly _onDocumentEditableTimeout: (() => void) | undefined

  constructor(options: StartupPhaseCoordinatorOptions = {}) {
    this._onDocumentEditableTimeout = options.onDocumentEditableTimeout
    const timeoutMs = options.documentEditableTimeoutMs
    if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      this._documentEditableTimeout = setTimeout(() => {
        this._documentEditableTimeout = null
        if (this._disposed || this._documentEditable) return
        try {
          this._onDocumentEditableTimeout?.()
        } catch (error) {
          console.error('Startup timeout callback failed:', error)
        }
      }, timeoutMs)
    }
  }

  get phase(): StartupPhaseValue {
    return this._phase
  }

  get rendererReady(): boolean {
    return this._rendererReady
  }

  get documentEditable(): boolean {
    return this._documentEditable
  }

  markShellVisible(): void {
    if (this._disposed || this._documentEditable) return
    if (this._phase === StartupPhase.BOOTING) {
      this._phase = StartupPhase.SHELL_VISIBLE
    }
  }

  markRendererReady(): void {
    if (this._disposed || this._documentEditable) return
    this._rendererReady = true
  }

  beginRestoring(): void {
    if (this._disposed || this._documentEditable) return
    if (this._phase !== StartupPhase.READY) {
      this._phase = StartupPhase.RESTORING
    }
  }

  markDocumentEditable(): void {
    if (this._disposed || this._documentEditable || !this._rendererReady) return

    this._documentEditable = true
    this._phase = StartupPhase.READY
    if (this._documentEditableTimeout !== null) {
      clearTimeout(this._documentEditableTimeout)
      this._documentEditableTimeout = null
    }

    const callbacks = [...this._interactiveCallbacks]
    this._interactiveCallbacks.clear()

    for (const callback of callbacks) {
      try {
        callback()
      } catch (error) {
        // A deferred task must never turn an otherwise usable editor startup
        // into a failed launch. Its own subsystem remains responsible for
        // logging and recovering from the error.
        console.error('Deferred startup task failed:', error)
      }
    }
  }

  /**
   * Compatibility alias for callers that use the old event name. The
   * coordinator still refuses to become READY until rendererReady is true.
   */
  markEditorInteractive(): void {
    this.markDocumentEditable()
  }

  onEditorInteractive(callback: StartupCallback): () => void {
    if (this._disposed) return () => {}

    if (this._documentEditable) {
      try {
        callback()
      } catch (error) {
        console.error('Deferred startup task failed:', error)
      }
      return () => {}
    }

    this._interactiveCallbacks.add(callback)
    return () => {
      this._interactiveCallbacks.delete(callback)
    }
  }

  dispose(): void {
    this._disposed = true
    if (this._documentEditableTimeout !== null) {
      clearTimeout(this._documentEditableTimeout)
      this._documentEditableTimeout = null
    }
    this._interactiveCallbacks.clear()
  }
}
