import type { PerformanceEvent } from '@shared/types/performance'

export interface BatchedSinkOptions<T> {
  send: (items: T[]) => void
  flushIntervalMs?: number
  maxBatchSize?: number
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void
  scheduleFlush?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancelScheduledFlush?: (timer: ReturnType<typeof setTimeout>) => void
}

export interface BatchedSink<T> {
  push(item: T): void
  flush(): void
  dispose(): void
}

export type BatchedPerformanceEventSinkOptions = BatchedSinkOptions<PerformanceEvent>
export type BatchedPerformanceEventSink = BatchedSink<PerformanceEvent>

/**
 * Performance capture must not perturb the editor hot path it is measuring.
 * Keep per-frame events in renderer memory and cross the IPC boundary in
 * bounded batches. Event timestamps and sample frequency remain unchanged.
 */
export const createBatchedSink = <T>(options: BatchedSinkOptions<T>): BatchedSink<T> => {
  const flushIntervalMs = Math.max(1, Math.floor(options.flushIntervalMs ?? 250))
  const maxBatchSize = Math.max(1, Math.floor(options.maxBatchSize ?? 256))
  const schedule =
    options.scheduleFlush ??
    options.setTimeout ??
    ((callback, delayMs) => setTimeout(callback, delayMs))
  const cancel =
    options.cancelScheduledFlush ?? options.clearTimeout ?? ((timer) => clearTimeout(timer))
  let pending: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clearTimer = (): void => {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  const flush = (): void => {
    clearTimer()
    if (pending.length === 0) return
    const events = pending
    pending = []
    options.send(events)
  }

  const scheduleFlush = (): void => {
    if (timer !== null || disposed) return
    timer = schedule(() => {
      timer = null
      flush()
    }, flushIntervalMs)
  }

  return {
    push(item): void {
      if (disposed) return
      pending.push(item)
      if (pending.length >= maxBatchSize) {
        flush()
        return
      }
      scheduleFlush()
    },
    flush,
    dispose(): void {
      if (disposed) return
      disposed = true
      flush()
    }
  }
}

export const createBatchedPerformanceEventSink = (
  options: BatchedPerformanceEventSinkOptions
): BatchedPerformanceEventSink => createBatchedSink(options)
