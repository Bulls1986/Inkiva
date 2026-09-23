import type { BrowserWindow } from 'electron'
import type { UnsavedFile } from '@shared/types/files'

const PREFLIGHT_TIMEOUT = 15_000

interface PendingRequest {
  resolve: (files: UnsavedFile[]) => void
  reject: (error: Error) => void
  dispose: () => void
}

export class RendererUpdatePreflight {
  private _sequence = 0
  private readonly _pending = new Map<string, PendingRequest>()

  request(win: BrowserWindow): Promise<UnsavedFile[]> {
    const windowId = win.id
    const sender = win.webContents
    const requestId = `${windowId}-${Date.now()}-${this._sequence++}`
    return new Promise<UnsavedFile[]>((resolve, reject) => {
      const rejectPending = (error: Error): void => {
        const pending = this._pending.get(requestId)
        if (!pending) return
        this._pending.delete(requestId)
        pending.dispose()
        pending.reject(error)
      }
      const onDestroyed = (): void => {
        rejectPending(new Error(`Renderer update preflight owner destroyed for window ${windowId}`))
      }
      const timer = setTimeout(() => {
        rejectPending(new Error(`Renderer update preflight timed out for window ${windowId}`))
      }, PREFLIGHT_TIMEOUT)
      const dispose = (): void => {
        clearTimeout(timer)
        sender.removeListener('destroyed', onDestroyed)
      }

      sender.once('destroyed', onDestroyed)
      this._pending.set(requestId, { resolve, reject, dispose })
      try {
        sender.send('mt::update-preflight-request', requestId)
      } catch (error) {
        rejectPending(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  resolve(requestId: string, files: UnsavedFile[]): boolean {
    const pending = this._pending.get(requestId)
    if (!pending) return false

    this._pending.delete(requestId)
    pending.dispose()
    pending.resolve(files)
    return true
  }
}
