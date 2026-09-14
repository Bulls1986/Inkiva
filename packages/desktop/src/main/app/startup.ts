export const StartupPhase = {
  BOOTING: 'booting',
  SHELL_VISIBLE: 'shell-visible',
  RESTORING: 'restoring',
  READY: 'ready'
} as const

export type StartupPhaseValue = (typeof StartupPhase)[keyof typeof StartupPhase]

type StartupCallback = () => void

/**
 * Coordinates work that is allowed to start only after the first editor is
 * interactive. The coordinator deliberately contains no Electron or timer
 * dependency so the startup ordering can be tested without launching a window.
 */
export class StartupPhaseCoordinator {
  private _phase: StartupPhaseValue = StartupPhase.BOOTING
  private _editorInteractive = false
  private _disposed = false
  private readonly _interactiveCallbacks = new Set<StartupCallback>()

  get phase(): StartupPhaseValue {
    return this._phase
  }

  markShellVisible(): void {
    if (this._disposed || this._editorInteractive) return
    if (this._phase === StartupPhase.BOOTING) {
      this._phase = StartupPhase.SHELL_VISIBLE
    }
  }

  beginRestoring(): void {
    if (this._disposed || this._editorInteractive) return
    if (this._phase !== StartupPhase.READY) {
      this._phase = StartupPhase.RESTORING
    }
  }

  markEditorInteractive(): void {
    if (this._disposed || this._editorInteractive) return

    this._editorInteractive = true
    this._phase = StartupPhase.READY
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

  onEditorInteractive(callback: StartupCallback): () => void {
    if (this._disposed) return () => {}

    if (this._editorInteractive) {
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
    this._interactiveCallbacks.clear()
  }
}
