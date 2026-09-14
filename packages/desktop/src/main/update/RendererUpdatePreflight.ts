import type { BrowserWindow } from 'electron'
import type { UnsavedFile } from '@shared/types/files'

const PREFLIGHT_TIMEOUT = 15_000

interface PendingRequest {
  resolve: (files: UnsavedFile[]) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class RendererUpdatePreflight {
  private _sequence = 0
  private readonly _pending = new Map<string, PendingRequest>()

  request(win: BrowserWindow): Promise<UnsavedFile[]> {
    const requestId = `${win.id}-${Date.now()}-${this._sequence++}`
    return new Promise<UnsavedFile[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(requestId)
        reject(new Error(`Renderer update preflight timed out for window ${win.id}`))
      }, PREFLIGHT_TIMEOUT)

      this._pending.set(requestId, { resolve, reject, timer })
      win.webContents.send('mt::update-preflight-request', requestId)
    })
  }

  resolve(requestId: string, files: UnsavedFile[]): boolean {
    const pending = this._pending.get(requestId)
    if (!pending) return false

    clearTimeout(pending.timer)
    this._pending.delete(requestId)
    pending.resolve(files)
    return true
  }
}
