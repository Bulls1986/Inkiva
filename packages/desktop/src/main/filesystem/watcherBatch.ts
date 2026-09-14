export const WATCHER_EVENT_DEBOUNCE_MS = 16

export type WatcherBatchChannel = 'mt::update-object-tree' | 'mt::update-file'
export type WatcherBatchSender = (channel: WatcherBatchChannel, payload: unknown) => void

export interface WatcherEventBatcherOptions {
  send: WatcherBatchSender
  debounceMs?: number
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void
  onSendError?: (error: unknown) => void
}

interface PendingWatcherEvent {
  channel: WatcherBatchChannel
  payload: unknown
}

export class WatcherEventBatcher {
  private readonly send: WatcherBatchSender

  private readonly debounceMs: number

  private readonly setTimer: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>

  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void

  private readonly onSendError: (error: unknown) => void

  private readonly pending = new Map<string, PendingWatcherEvent>()

  private timer: ReturnType<typeof setTimeout> | null = null

  private closed = false

  constructor(options: WatcherEventBatcherOptions) {
    this.send = options.send
    this.debounceMs = Math.max(0, options.debounceMs ?? WATCHER_EVENT_DEBOUNCE_MS)
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer))
    this.onSendError = options.onSendError ?? (() => {})
  }

  enqueue(channel: WatcherBatchChannel, payload: unknown, key: string): void {
    if (this.closed) return
    this.pending.set(channel + '\u0000' + key, { channel, payload })
    this.schedule()
  }

  flushNow(): number {
    if (this.closed) return 0
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }

    const entries = Array.from(this.pending.values())
    this.pending.clear()
    for (const entry of entries) {
      try {
        this.send(entry.channel, entry.payload)
      } catch (error) {
        this.onSendError(error)
      }
    }
    return entries.length
  }

  get pendingCount(): number {
    return this.pending.size
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.pending.clear()
  }

  private schedule(): void {
    if (this.timer !== null) return
    this.timer = this.setTimer(() => {
      this.timer = null
      this.flushNow()
    }, this.debounceMs)
  }
}
