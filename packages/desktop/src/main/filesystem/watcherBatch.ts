export const WATCHER_EVENT_DEBOUNCE_MS = 16
export const WATCHER_BATCH_MAX_EVENTS = 50
export const WATCHER_BATCH_SLICE_BUDGET_MS = 5

export type WatcherBatchChannel = 'mt::update-object-tree' | 'mt::update-file'
export type WatcherBatchSender = (channel: WatcherBatchChannel, payload: unknown) => void

/**
 * Do not let a structural event disappear behind a same-path mtime event.
 * Chokidar can report add/change or unlink/add in one debounce window; only
 * repeat events of the same kind are safe to coalesce.
 */
export const getWatcherEventCoalescingKey = (
  channel: WatcherBatchChannel,
  payload: unknown,
  key: string
): string => {
  if (
    channel !== 'mt::update-object-tree' ||
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return key
  }

  const type = (payload as { type?: unknown }).type
  return typeof type === 'string' && type !== 'change'
    ? key + '\u0000' + type
    : key
}

export interface WatcherEventBatcherOptions {
  send: WatcherBatchSender
  debounceMs?: number
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void
  onSendError?: (error: unknown) => void
  maxEventsPerFlush?: number
  sliceBudgetMs?: number
  now?: () => number
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

  private readonly maxEventsPerFlush: number
  private readonly sliceBudgetMs: number
  private readonly now: () => number

  private readonly pending = new Map<string, PendingWatcherEvent>()

  private timer: ReturnType<typeof setTimeout> | null = null

  private closed = false

  constructor(options: WatcherEventBatcherOptions) {
    this.send = options.send
    this.debounceMs = Math.max(0, options.debounceMs ?? WATCHER_EVENT_DEBOUNCE_MS)
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer))
    this.onSendError = options.onSendError ?? (() => {})
    this.maxEventsPerFlush = Math.max(
      1,
      Math.floor(options.maxEventsPerFlush ?? WATCHER_BATCH_MAX_EVENTS)
    )
    this.sliceBudgetMs = Math.max(
      0,
      options.sliceBudgetMs ?? WATCHER_BATCH_SLICE_BUDGET_MS
    )
    this.now = options.now ?? (() => Date.now())
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

    const startedAt = this.readNow()
    let sent = 0
    for (const [key, entry] of this.pending) {
      this.pending.delete(key)
      try {
        this.send(entry.channel, entry.payload)
      } catch (error) {
        this.onSendError(error)
      }
      sent += 1
      if (
        sent >= this.maxEventsPerFlush ||
        (startedAt !== undefined && this.elapsedSince(startedAt) >= this.sliceBudgetMs)
      ) {
        break
      }
    }

    if (this.pending.size > 0) this.schedule(0)
    return sent
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

  private readNow(): number | undefined {
    try {
      const value = this.now()
      return Number.isFinite(value) ? value : undefined
    } catch {
      return undefined
    }
  }

  private elapsedSince(startedAt: number): number {
    const current = this.readNow()
    return current === undefined ? 0 : Math.max(0, current - startedAt)
  }

  private schedule(delayMs = this.debounceMs): void {
    if (this.timer !== null) return
    this.timer = this.setTimer(() => {
      this.timer = null
      this.flushNow()
    }, delayMs)
  }
}
