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

  private readonly tasks = new Map<string, BackgroundTask>()

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
    if (this.closed) return () => {}
    if (!task.id) throw new Error('background task id is required')
    if (!Number.isInteger(task.priority) || task.priority < 0 || task.priority > 8) {
      throw new Error('background task priority must be between 0 and 8')
    }

    this.tasks.set(task.id, task)
    this.schedule()
    return () => {
      if (this.tasks.get(task.id) === task) this.tasks.delete(task.id)
    }
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

    const cancelQueuedTask = this.enqueue({
      ...task,
      run: () => {
        let result: void | Promise<void>
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
    })

    return {
      promise,
      cancel: () => {
        cancelQueuedTask()
        reject(new Error('background task cancelled'))
      }
    }
  }

  setInteractivePending(pending: boolean): void {
    this.interactivePending = pending
    if (!pending) this.schedule()
  }

  get pendingCount(): number {
    return this.tasks.size
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
    this.tasks.clear()
  }

  private schedule(): void {
    if (this.closed || this.running || this.timer !== null) return
    this.timer = this.setTimer(() => {
      this.timer = null
      void this.runNext()
    }, 0)
  }

  private async runNext(): Promise<void> {
    if (this.closed || this.running) return
    const task = this.pickNextTask()
    if (!task) return

    this.tasks.delete(task.id)
    this.running = true
    const startedAt = this.readNow()
    let result: void | Promise<void>
    let failed = false
    try {
      // Measure only the synchronous invocation. Awaited I/O is not renderer
      // main-thread work; a task that needs more work must enqueue another
      // bounded slice after it yields.
      result = task.run()
    } catch (error) {
      failed = true
      this.onError(error, task)
    }
    this.reportSlice(task, startedAt)

    try {
      if (!failed && result && typeof result.then === 'function') {
        await result
      }
    } catch (error) {
      this.onError(error, task)
    } finally {
      this.running = false
      if (this.tasks.size > 0) this.schedule()
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

  private pickNextTask(): BackgroundTask | undefined {
    let selected: BackgroundTask | undefined
    for (const task of this.tasks.values()) {
      if (this.interactivePending && task.priority >= BACKGROUND_PRIORITY.backgroundIndexing) {
        continue
      }
      if (!selected || task.priority < selected.priority) selected = task
    }
    return selected
  }
}
