import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PROJECT_TREE_EVENT_BATCH_MAX_EVENTS,
  PROJECT_TREE_EVENT_BATCH_SLICE_BUDGET_MS,
  PROJECT_TREE_EVENT_DEBOUNCE_MS,
  ProjectTreeEventBatcher
} from '@/util/projectTreeEventBatch'

describe('renderer project-tree event batcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces incoming events and processes them after the paint opportunity', () => {
    vi.useFakeTimers()
    const processed: number[] = []
    const batcher = new ProjectTreeEventBatcher<number>({
      process: (event) => processed.push(event)
    })

    batcher.enqueue(1)
    batcher.enqueue(2)

    expect(processed).toEqual([])
    expect(batcher.pendingCount).toBe(2)

    vi.advanceTimersByTime(PROJECT_TREE_EVENT_DEBOUNCE_MS)

    expect(processed).toEqual([1, 2])
    expect(batcher.pendingCount).toBe(0)
  })

  it('bounds a flush and yields the remaining tree work', () => {
    vi.useFakeTimers()
    const processed: number[] = []
    const batcher = new ProjectTreeEventBatcher<number>({
      process: (event) => processed.push(event),
      maxEventsPerFlush: 2,
      debounceMs: 1000
    })

    batcher.enqueue(1)
    batcher.enqueue(2)
    batcher.enqueue(3)

    expect(batcher.flushNow()).toBe(2)
    expect(processed).toEqual([1, 2])
    expect(batcher.pendingCount).toBe(1)

    vi.runAllTimers()

    expect(processed).toEqual([1, 2, 3])
    expect(batcher.pendingCount).toBe(0)
  })

  it('stops a flush at the five millisecond renderer slice budget', () => {
    let now = 100
    const processed: number[] = []
    const batcher = new ProjectTreeEventBatcher<number>({
      process: (event) => {
        processed.push(event)
        now += 3
      },
      now: () => now,
      maxEventsPerFlush: PROJECT_TREE_EVENT_BATCH_MAX_EVENTS,
      sliceBudgetMs: PROJECT_TREE_EVENT_BATCH_SLICE_BUDGET_MS,
      debounceMs: 1000
    })

    batcher.enqueue(1)
    batcher.enqueue(2)
    batcher.enqueue(3)

    expect(batcher.flushNow()).toBe(2)
    expect(processed).toEqual([1, 2])
    expect(batcher.pendingCount).toBe(1)
  })

  it('isolates a malformed event handler failure and continues the batch', () => {
    const processed: number[] = []
    const errors: unknown[] = []
    const batcher = new ProjectTreeEventBatcher<number>({
      process: (event) => {
        if (event === 1) throw new Error('invalid tree event')
        processed.push(event)
      },
      onError: (error) => errors.push(error),
      debounceMs: 1000
    })

    batcher.enqueue(1)
    batcher.enqueue(2)

    expect(batcher.flushNow()).toBe(2)
    expect(processed).toEqual([2])
    expect(errors).toHaveLength(1)
  })

  it('closes without processing queued events', () => {
    vi.useFakeTimers()
    const processed: number[] = []
    const batcher = new ProjectTreeEventBatcher<number>({
      process: (event) => processed.push(event)
    })

    batcher.enqueue(1)
    batcher.close()
    vi.runAllTimers()

    expect(processed).toEqual([])
    expect(batcher.pendingCount).toBe(0)
  })
})
