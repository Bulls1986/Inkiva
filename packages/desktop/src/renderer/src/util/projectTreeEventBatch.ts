export const PROJECT_TREE_EVENT_DEBOUNCE_MS = 16
export const PROJECT_TREE_EVENT_BATCH_MAX_EVENTS = 25
export const PROJECT_TREE_EVENT_BATCH_SLICE_BUDGET_MS = 5

type TimerHandle = ReturnType<typeof setTimeout>
type SetTimer = (callback: () => void, delayMs: number) => TimerHandle
type ClearTimer = (timer: TimerHandle) => void

export interface ProjectTreeEventBatcherOptions<T> {
  process: (event: T) => void
  onError?: (error: unknown, event: T) => void
  debounceMs?: number
  maxEventsPerFlush?: number
  sliceBudgetMs?: number
  setTimeout?: SetTimer
  clearTimeout?: ClearTimer
  now?: () => number
}

/**
 * Keeps filesystem notifications out of the synchronous IPC callback.
 * The batch is deliberately bounded by both event count and wall-clock time:
 * a burst can update the tree, but it cannot monopolize the renderer.
 */
export class ProjectTreeEventBatcher<T> {
  private readonly process: (event: T) => void
  private readonly onError: (error: unknown, event: T) => void
  private readonly debounceMs: number
  private readonly maxEventsPerFlush: number
  private readonly sliceBudgetMs: number
  private readonly setTimer: SetTimer
  private readonly clearTimer: ClearTimer
  private readonly now: () => number
  private pending: T[] = []
  private pendingHead = 0
  private timer: TimerHandle | null = null
  private closed = false

  constructor(options: ProjectTreeEventBatcherOptions<T>) {
    this.process = options.process
    this.onError = options.onError ?? (() => {})
    this.debounceMs = Math.max(0, options.debounceMs ?? PROJECT_TREE_EVENT_DEBOUNCE_MS)
    this.maxEventsPerFlush = Math.max(
      1,
      Math.floor(options.maxEventsPerFlush ?? PROJECT_TREE_EVENT_BATCH_MAX_EVENTS)
    )
    this.sliceBudgetMs = Math.max(
      0,
      options.sliceBudgetMs ?? PROJECT_TREE_EVENT_BATCH_SLICE_BUDGET_MS
    )
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer))
    this.now = options.now ?? (() => {
      const candidate = globalThis.performance?.now
      return typeof candidate === 'function'
        ? candidate.call(globalThis.performance)
        : Date.now()
    })
  }

  enqueue(event: T): void {
    if (this.closed) return
    this.pending.push(event)
    this.schedule()
  }

  flushNow(): number {
    if (this.closed) return 0
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }

    const startedAt = this.readNow()
    let processed = 0
    while (this.pendingHead < this.pending.length) {
      const event = this.pending[this.pendingHead]
      this.pendingHead += 1
      if (event === undefined) continue

      try {
        this.process(event)
      } catch (error) {
        try {
          this.onError(error, event)
        } catch {
          // Diagnostics must never affect filesystem event delivery.
        }
      }
      processed += 1

      if (
        processed >= this.maxEventsPerFlush ||
        (startedAt !== undefined && this.elapsedSince(startedAt) >= this.sliceBudgetMs)
      ) {
        break
      }
    }

    this.compactQueue()
    if (this.pendingCount > 0) this.schedule(0)
    return processed
  }

  get pendingCount(): number {
    return this.pending.length - this.pendingHead
  }

  clear(): void {
    if (this.closed) return
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.pending = []
    this.pendingHead = 0
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.pending = []
    this.pendingHead = 0
  }

  private compactQueue(): void {
    if (this.pendingHead === 0) return
    if (this.pendingHead >= this.pending.length) {
      this.pending = []
      this.pendingHead = 0
      return
    }
    if (this.pendingHead >= 128 && this.pendingHead * 2 >= this.pending.length) {
      this.pending = this.pending.slice(this.pendingHead)
      this.pendingHead = 0
    }
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
    if (this.closed || this.timer !== null || this.pendingCount === 0) return
    this.timer = this.setTimer(() => {
      this.timer = null
      this.flushNow()
    }, delayMs)
  }
}
