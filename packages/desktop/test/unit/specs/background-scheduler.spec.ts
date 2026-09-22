import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_PRIORITY,
  BackgroundTaskScheduler
} from '@/util/backgroundScheduler'

describe('background priority scheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs lower-numbered priorities before background indexing', async() => {
    vi.useFakeTimers()
    const order: string[] = []
    const scheduler = new BackgroundTaskScheduler()

    scheduler.enqueue({
      id: 'index',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { order.push('index') }
    })
    scheduler.enqueue({
      id: 'input',
      priority: BACKGROUND_PRIORITY.keyboard,
      run: () => { order.push('input') }
    })
    scheduler.enqueue({
      id: 'tab',
      priority: BACKGROUND_PRIORITY.tabNavigation,
      run: () => { order.push('tab') }
    })

    await vi.runAllTimersAsync()

    expect(order).toEqual(['input', 'tab', 'index'])
  })

  it('does not start P6-P8 while interaction is pending', async() => {
    vi.useFakeTimers()
    const order: string[] = []
    const scheduler = new BackgroundTaskScheduler()
    scheduler.setInteractivePending(true)

    scheduler.enqueue({
      id: 'index',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { order.push('index') }
    })
    scheduler.enqueue({
      id: 'maintenance',
      priority: BACKGROUND_PRIORITY.maintenanceCleanup,
      run: () => { order.push('maintenance') }
    })

    await vi.runAllTimersAsync()
    expect(order).toEqual([])
    expect(scheduler.pendingCount).toBe(2)

    scheduler.setInteractivePending(false)
    await vi.runAllTimersAsync()
    expect(order).toEqual(['index', 'maintenance'])
  })

  it('coalesces tasks by id and supports cancellation', async() => {
    vi.useFakeTimers()
    const order: string[] = []
    const scheduler = new BackgroundTaskScheduler()

    scheduler.enqueue({
      id: 'index',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { order.push('old') }
    })
    scheduler.enqueue({
      id: 'index',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { order.push('new') }
    })
    const cancel = scheduler.enqueue({
      id: 'maintenance',
      priority: BACKGROUND_PRIORITY.maintenanceCleanup,
      run: () => { order.push('cancelled') }
    })
    cancel()

    await vi.runAllTimersAsync()
    expect(order).toEqual(['new'])
    expect(scheduler.pendingCount).toBe(0)
  })

  it('does not serialize newer slices behind awaited background I/O', async() => {
    vi.useFakeTimers()
    const order: string[] = []
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const scheduler = new BackgroundTaskScheduler()

    scheduler.enqueue({
      id: 'old-io',
      priority: BACKGROUND_PRIORITY.backlinkMetadataStatistics,
      run: async() => {
        order.push('old-start')
        await pending
        order.push('old-end')
      }
    })
    scheduler.enqueue({
      id: 'new-work',
      priority: BACKGROUND_PRIORITY.backlinkMetadataStatistics,
      run: () => { order.push('new') }
    })

    // Each scheduler slice is a macrotask so the browser gets a paint
    // opportunity between background invocations.
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(order).toEqual(['old-start', 'new'])

    release()
    await vi.runAllTimersAsync()
    expect(order).toEqual(['old-start', 'new', 'old-end'])
  })

  it('settles superseded wait handles instead of leaking promises', async() => {
    vi.useFakeTimers()
    const scheduler = new BackgroundTaskScheduler()

    const first = scheduler.enqueueAndWait({
      id: 'same-key',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => {}
    })
    const second = scheduler.enqueueAndWait({
      id: 'same-key',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => {}
    })

    await expect(first.promise).rejects.toThrow(/superseded/)
    await vi.runAllTimersAsync()
    await expect(second.promise).resolves.toBeUndefined()
    expect(scheduler.pendingCount).toBe(0)
  })

  it('serializes same-key async work and runs only the latest successor', async() => {
    vi.useFakeTimers()
    const order: string[] = []
    let release!: () => void
    const blocker = new Promise<void>((resolve) => { release = resolve })
    const scheduler = new BackgroundTaskScheduler()

    scheduler.enqueue({
      id: 'document-index:doc-1',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: async() => {
        order.push('old-start')
        await blocker
        order.push('old-end')
      }
    })
    await vi.advanceTimersByTimeAsync(1)

    scheduler.enqueue({
      id: 'document-index:doc-1',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { order.push('middle') }
    })
    scheduler.enqueue({
      id: 'document-index:doc-1',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { order.push('latest') }
    })

    await vi.advanceTimersByTimeAsync(5)
    expect(order).toEqual(['old-start'])

    release()
    await vi.runAllTimersAsync()
    expect(order).toEqual(['old-start', 'old-end', 'latest'])
    expect(scheduler.pendingCount).toBe(0)
  })

  it('close settles queued wait handles and clears scheduled work', async() => {
    vi.useFakeTimers()
    const scheduler = new BackgroundTaskScheduler()
    const handle = scheduler.enqueueAndWait({
      id: 'maintenance',
      priority: BACKGROUND_PRIORITY.maintenanceCleanup,
      run: () => {}
    })

    scheduler.close()

    await expect(handle.promise).rejects.toThrow(/closed/)
    await vi.runAllTimersAsync()
    expect(scheduler.pendingCount).toBe(0)
    expect(scheduler.isRunning).toBe(false)
  })

  it('releases scheduler-owned references when closed during in-flight work', async() => {
    vi.useFakeTimers()
    let release!: () => void
    const blocker = new Promise<void>((resolve) => { release = resolve })
    const scheduler = new BackgroundTaskScheduler()
    const handle = scheduler.enqueueAndWait({
      id: 'slow-index',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: async() => {
        await blocker
      }
    })

    await vi.advanceTimersByTimeAsync(1)
    expect(scheduler.activeCount).toBe(1)

    scheduler.close()

    await expect(handle.promise).rejects.toThrow(/closed/)
    expect(scheduler.activeCount).toBe(0)
    expect(scheduler.pendingCount).toBe(0)

    release()
    await vi.runAllTimersAsync()
    expect(scheduler.activeCount).toBe(0)
  })

  it('isolates task failures and continues unrelated queued work', async() => {
    vi.useFakeTimers()
    const order: string[] = []
    const errors: string[] = []
    const scheduler = new BackgroundTaskScheduler({
      onError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    })

    scheduler.enqueue({
      id: 'broken',
      priority: BACKGROUND_PRIORITY.backlinkMetadataStatistics,
      run: async() => {
        order.push('broken')
        throw new Error('background failure')
      }
    })
    scheduler.enqueue({
      id: 'healthy',
      priority: BACKGROUND_PRIORITY.backlinkMetadataStatistics,
      run: () => { order.push('healthy') }
    })

    await vi.runAllTimersAsync()
    await Promise.resolve()

    expect(order).toEqual(['broken', 'healthy'])
    expect(errors).toEqual(['background failure'])
    expect(scheduler.pendingCount).toBe(0)
  })

  it('measures every task as a real main-thread slice', async() => {
    vi.useFakeTimers()
    let now = 100
    const slices: Array<{ id: string; durationMs: number }> = []
    const scheduler = new BackgroundTaskScheduler({
      now: () => now,
      onSlice: (task, durationMs) => {
        slices.push({ id: task.id, durationMs })
      }
    })

    scheduler.enqueue({
      id: 'index',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => { now += 4.5 }
    })

    await vi.runAllTimersAsync()

    expect(slices).toEqual([{ id: 'index', durationMs: 4.5 }])
  })
})
