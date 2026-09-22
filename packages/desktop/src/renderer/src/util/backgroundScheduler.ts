export const BACKGROUND_PRIORITY = {
  keyboard: 0,
  activeEditorViewport: 1,
  tabNavigation: 2,
  visibleOutlineAndTree: 3,
  visibleDiagram: 4,
  requestedSearch: 5,
  backgroundIndexing: 6,
  backlinkMetadataStatistics: 7,
  maintenanceCleanup: 8
} as const

export type BackgroundPriority =
  (typeof BACKGROUND_PRIORITY)[keyof typeof BACKGROUND_PRIORITY]

export interface BackgroundTask {
  id: string
  priority: BackgroundPriority
  run: () => void | Promise<void>
}

export interface BackgroundTaskSchedulerOptions {
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void
  onError?: (error: unknown, task: BackgroundTask) => void
  /**
   * Monotonic clock used to measure the synchronous portion of every task.
   * Tasks must yield and enqueue another task before this budget is exceeded.
   */
  now?: () => number
  onSlice?: (task: BackgroundTask, durationMs: number) => void
}

export interface BackgroundTaskHandle {
  promise: Promise<void>
  cancel: () => void
}

type BackgroundTaskDiscardReason = 'cancelled' | 'superseded' | 'closed'

interface ScheduledBackgroundTask {
  task: BackgroundTask
  cancelled: boolean
  discarded: boolean
  onDiscard?: (reason: BackgroundTaskDiscardReason) => void
}

const discardMessage = (reason: BackgroundTaskDiscardReason): string =>
  reason === 'superseded'
    ? 'background task superseded'
    : reason === 'closed'
      ? 'background scheduler closed'
      : 'background task cancelled'

const DEFAULT_SLICE_CLOCK = (): number => {
  const candidate = globalThis.performance?.now
  return typeof candidate === 'function' ? candidate.call(globalThis.performance) : Date.now()
}

export class BackgroundTaskScheduler {
  private readonly setTimer: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>

  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void

  private readonly onError: (error: unknown, task: BackgroundTask) => void

  private readonly now: () => number

  private readonly onSlice: (task: BackgroundTask, durationMs: number) => void

  private readonly tasks = new Map<string, ScheduledBackgroundTask>()

  private readonly runningTasks = new Map<string, ScheduledBackgroundTask>()

  private readonly deferredTasks = new Map<string, ScheduledBackgroundTask>()

  private timer: ReturnType<typeof setTimeout> | null = null

  private running = false

  private interactivePending = false

  private closed = false

  constructor(options: BackgroundTaskSchedulerOptions = {}) {
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer))
    this.onError = options.onError ?? (() => {})
    this.now = options.now ?? DEFAULT_SLICE_CLOCK
    this.onSlice = options.onSlice ?? (() => {})
  }

  enqueue(task: BackgroundTask): () => void {
    return this.enqueueEntry(task)
  }

  enqueueAndWait(task: BackgroundTask): BackgroundTaskHandle {
    let settled = false
    let resolvePromise: (() => void) | undefined
    let rejectPromise: ((reason?: unknown) => void) | undefined
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })

    const resolve = (): void => {
      if (settled) return
      settled = true
      resolvePromise?.()
    }
    const reject = (error: unknown): void => {
      if (settled) return
      settled = true
      rejectPromise?.(error)
    }

    const cancelTask = this.enqueueEntry(
      {
        ...task,
        run: () => {
          let result: void | Promise<void> | undefined
          try {
            result = task.run()
          } catch (error) {
            reject(error)
            throw error
          }

          if (result && typeof result.then === 'function') {
            return result.then(resolve, (error) => {
              reject(error)
              throw error
            })
          }

          resolve()
          return result
        }
      },
      (reason) => reject(new Error(discardMessage(reason)))
    )

    return {
      promise,
      cancel: cancelTask
    }
  }

  setInteractivePending(pending: boolean): void {
    this.interactivePending = pending
    if (!pending) this.schedule()
  }

  get pendingCount(): number {
    return this.tasks.size + this.deferredTasks.size
  }

  get activeCount(): number {
    return this.tasks.size + this.deferredTasks.size + this.runningTasks.size
  }

  get isRunning(): boolean {
    return this.running
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    for (const entry of this.tasks.values()) this.discardEntry(entry, 'closed')
    for (const entry of this.deferredTasks.values()) this.discardEntry(entry, 'closed')
    for (const entry of this.runningTasks.values()) this.discardEntry(entry, 'closed')
    this.tasks.clear()
    this.deferredTasks.clear()
    this.runningTasks.clear()
  }

  private enqueueEntry(
    task: BackgroundTask,
    onDiscard?: (reason: BackgroundTaskDiscardReason) => void
  ): () => void {
    if (!task.id) throw new Error('background task id is required')
    if (!Number.isInteger(task.priority) || task.priority < 0 || task.priority > 8) {
      throw new Error('background task priority must be between 0 and 8')
    }

    const entry: ScheduledBackgroundTask = {
      task,
      cancelled: false,
      discarded: false,
      ...(onDiscard ? { onDiscard } : {})
    }

    if (this.closed) {
      this.discardEntry(entry, 'closed')
      return () => {}
    }

    if (this.runningTasks.has(task.id)) {
      const previous = this.deferredTasks.get(task.id)
      if (previous) this.discardEntry(previous, 'superseded')
      this.deferredTasks.set(task.id, entry)
    } else {
      const previous = this.tasks.get(task.id)
      if (previous) this.discardEntry(previous, 'superseded')
      this.tasks.set(task.id, entry)
    }

    this.schedule()
    return () => this.cancelEntry(entry)
  }

  private cancelEntry(entry: ScheduledBackgroundTask): void {
    if (entry.cancelled || entry.discarded) return
    entry.cancelled = true
    const id = entry.task.id
    if (this.tasks.get(id) === entry) this.tasks.delete(id)
    if (this.deferredTasks.get(id) === entry) this.deferredTasks.delete(id)
    this.discardEntry(entry, 'cancelled')
  }

  private discardEntry(
    entry: ScheduledBackgroundTask,
    reason: BackgroundTaskDiscardReason
  ): void {
    if (entry.discarded) return
    entry.discarded = true
    try {
      entry.onDiscard?.(reason)
    } catch {
      // Cancellation diagnostics must never affect scheduling.
    }
  }

  private schedule(): void {
    if (this.closed || this.running || this.timer !== null) return
    this.timer = this.setTimer(() => {
      this.timer = null
      void this.runNext()
    }, 0)
  }

  private runNext(): void {
    if (this.closed || this.running) return
    const entry = this.pickNextTask()
    if (!entry) return

    const { task } = entry
    this.tasks.delete(task.id)
    if (entry.cancelled) {
      if (this.tasks.size > 0) this.schedule()
      return
    }

    this.running = true
    this.runningTasks.set(task.id, entry)
    const startedAt = this.readNow()
    // Measure only the synchronous invocation. Awaited I/O is not renderer
    // main-thread work; unrelated keys continue immediately. The same logical
    // key stays single-flight and retains only its latest successor.
    let result: void | Promise<void> | undefined
    try {
      result = task.run()
    } catch (error) {
      this.onError(error, task)
    }
    this.reportSlice(task, startedAt)
    this.running = false

    if (result && typeof result.then === 'function') {
      void result
        .catch((error) => {
          try {
            this.onError(error, task)
          } catch {
            // Diagnostics must never affect scheduling.
          }
        })
        .finally(() => this.completeEntry(entry))
    } else {
      this.completeEntry(entry)
    }

    if (this.tasks.size > 0) this.schedule()
  }

  private completeEntry(entry: ScheduledBackgroundTask): void {
    const id = entry.task.id
    if (this.runningTasks.get(id) === entry) this.runningTasks.delete(id)
    if (this.closed) return

    const deferred = this.deferredTasks.get(id)
    if (!deferred) return
    this.deferredTasks.delete(id)
    if (!deferred.cancelled) this.tasks.set(id, deferred)
    if (this.tasks.size > 0) this.schedule()
  }

  private readNow(): number | undefined {
    try {
      const value = this.now()
      return Number.isFinite(value) ? value : undefined
    } catch {
      return undefined
    }
  }

  private reportSlice(task: BackgroundTask, startedAt: number | undefined): void {
    if (startedAt === undefined) return
    const endedAt = this.readNow()
    if (endedAt === undefined) return
    try {
      this.onSlice(task, Math.max(0, endedAt - startedAt))
    } catch {
      // Diagnostics must never affect task scheduling.
    }
  }

  private pickNextTask(): ScheduledBackgroundTask | undefined {
    let selected: ScheduledBackgroundTask | undefined
    for (const entry of this.tasks.values()) {
      const { task } = entry
      if (this.interactivePending && task.priority >= BACKGROUND_PRIORITY.backgroundIndexing) {
        continue
      }
      if (!selected || task.priority < selected.task.priority) selected = entry
    }
    return selected
  }
}
