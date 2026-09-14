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
