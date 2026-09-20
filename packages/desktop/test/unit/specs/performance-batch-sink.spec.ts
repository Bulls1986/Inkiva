import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBatchedPerformanceEventSink } from '@/services/performance/batchedSink'
import { PERFORMANCE_TRACE_SCHEMA_VERSION, type PerformanceEvent } from '@shared/types/performance'

const event = (index: number): PerformanceEvent => ({
  schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
  name: 'metric_sample',
  process: 'renderer',
  phase: 'editor',
  traceId: 'trace-batch',
  timestampEpochMs: 1_700_000_000_000 + index,
  metadata: { metric: 'core.frame.duration', unit: 'ms', value: index }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('batched performance event sink', () => {
  it('keeps high-frequency events in memory and sends one batch after the flush interval', async() => {
    vi.useFakeTimers()
    const send = vi.fn<(events: PerformanceEvent[]) => void>()
    const batch = createBatchedPerformanceEventSink({ send, flushIntervalMs: 100, maxBatchSize: 32 })

    for (let index = 0; index < 10; index += 1) batch.push(event(index))
    expect(send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(99)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, index) => event(index)))
  })

  it('can defer high-frequency transport to an injected idle scheduler', () => {
    const send = vi.fn<(events: PerformanceEvent[]) => void>()
    const callbacks = new Map<number, () => void>()
    let nextId = 1
    const scheduleFlush = vi.fn((callback: () => void) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id as unknown as ReturnType<typeof setTimeout>
    })
    const cancelScheduledFlush = vi.fn((timer: ReturnType<typeof setTimeout>) => {
      callbacks.delete(timer as unknown as number)
    })
    const batch = createBatchedPerformanceEventSink({
      send,
      flushIntervalMs: 100,
      maxBatchSize: 32,
      scheduleFlush,
      cancelScheduledFlush
    })

    for (let index = 0; index < 10; index += 1) batch.push(event(index))

    expect(scheduleFlush).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    callbacks.get(1)?.()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, index) => event(index)))
  })

  it('flushes immediately at the bounded batch size and flushes the tail on dispose', () => {
    vi.useFakeTimers()
    const send = vi.fn<(events: PerformanceEvent[]) => void>()
    const batch = createBatchedPerformanceEventSink({ send, flushIntervalMs: 100, maxBatchSize: 4 })

    for (let index = 0; index < 5; index += 1) batch.push(event(index))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toHaveLength(4)

    batch.dispose()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]?.[0]).toEqual([event(4)])
  })
})
