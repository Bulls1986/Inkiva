import type { SaveOptions } from '@shared/types/files'

export interface AutosaveRequest {
  id: string
  revision: number
  filename: string
  pathname: string
  markdown: string
  options: SaveOptions
  defaultPath?: string
}

export interface AutosaveAck {
  request: AutosaveRequest
  success: boolean
  isLatest: boolean
  error?: unknown
}

type TimerHandle = ReturnType<typeof setTimeout>
type SetTimer = (handler: () => void, timeout: number) => TimerHandle
type ClearTimer = (timer: TimerHandle) => void

interface QueueEntry {
  latestRevision: number
  pending: AutosaveRequest | null
  inFlight: AutosaveRequest | null
  timer: TimerHandle | null
}

export interface AutosaveQueueOptions {
  send: (request: AutosaveRequest) => void
  setTimeout?: SetTimer
  clearTimeout?: ClearTimer
}

/**
 * Per-document debounce + single-flight autosave queue. New dirty revisions
 * replace pending work, but never start while an older write is in flight.
 */
export class AutosaveQueue {
  private readonly send: (request: AutosaveRequest) => void
  private readonly setTimer: SetTimer
  private readonly clearTimer: ClearTimer
  private readonly entries = new Map<string, QueueEntry>()

  constructor(options: AutosaveQueueOptions) {
    this.send = options.send
    this.setTimer = options.setTimeout ?? ((handler, timeout) => setTimeout(handler, timeout))
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer))
  }

  schedule(request: AutosaveRequest, delayMs: number): void {
    if (!request.id || !request.pathname) return
    let entry = this.entries.get(request.id)
    if (!entry) {
      entry = {
        latestRevision: request.revision,
        pending: null,
        inFlight: null,
        timer: null
      }
      this.entries.set(request.id, entry)
    }

    entry.latestRevision = Math.max(entry.latestRevision, request.revision)
    entry.pending = request
    if (entry.timer !== null) this.clearTimer(entry.timer)
    entry.timer = this.setTimer(() => {
      entry!.timer = null
      this.drain(request.id)
    }, delayMs)
  }

  flush(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.timer !== null) {
      this.clearTimer(entry.timer)
      entry.timer = null
    }
    this.drain(id)
  }

  hasWork(id: string): boolean {
    return this.entries.has(id)
  }

  acknowledge(id: string, revision?: number, error?: unknown): AutosaveAck | null {
    const entry = this.entries.get(id)
    if (!entry?.inFlight) return null
    if (revision !== undefined && entry.inFlight.revision !== revision) return null

    const request = entry.inFlight
    entry.inFlight = null
    const result: AutosaveAck = {
      request,
      success: error == null,
      isLatest: request.revision === entry.latestRevision && entry.pending === null,
      ...(error == null ? {} : { error })
    }

    if (entry.pending === null && entry.timer === null) {
      this.entries.delete(id)
    } else if (entry.timer === null) {
      this.drain(id)
    }
    return result
  }

  cancel(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.timer !== null) this.clearTimer(entry.timer)
    entry.timer = null
    entry.pending = null
    if (entry.inFlight === null) this.entries.delete(id)
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) this.clearTimer(entry.timer)
    }
    this.entries.clear()
  }

  private drain(id: string): void {
    const entry = this.entries.get(id)
    if (!entry || entry.inFlight || entry.pending === null) return

    const request = entry.pending
    entry.pending = null
    entry.inFlight = request
    try {
      this.send(request)
    } catch (error) {
      // IPC send is normally asynchronous and non-throwing. If the renderer
      // is already tearing down, settle the queue locally so it cannot remain
      // permanently blocked behind a failed dispatch.
      this.acknowledge(id, request.revision, error)
    }
  }
}
