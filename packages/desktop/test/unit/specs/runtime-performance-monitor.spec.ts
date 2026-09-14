import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RuntimePerformanceMonitor,
  type RuntimePerformanceRecorder
} from '@/services/performance/runtimeMonitor'
import type { RendererPerformanceObserverCallback } from '@/services/performance/renderer'

class TestPerformanceObserver {
  static instances: TestPerformanceObserver[] = []
  readonly observe = vi.fn()
  readonly disconnect = vi.fn()
  private readonly callback: RendererPerformanceObserverCallback

  constructor(callback: RendererPerformanceObserverCallback) {
    this.callback = callback
    TestPerformanceObserver.instances.push(this)
  }

  emit(...entries: PerformanceEntry[]): void {
    this.callback({ getEntries: () => entries })
  }
}

const createRecorder = (enabled = true) => ({
  enabled,
  recordSample: vi.fn()
}) as unknown as RuntimePerformanceRecorder & {
  recordSample: ReturnType<typeof vi.fn>
}

const createSchedulers = () => {
  const frameCallbacks: Array<(timestamp: number) => void> = []
  const intervalCallbacks: Array<() => void> = []
  const timeoutCallbacks: Array<() => void> = []
  const requestAnimationFrame = vi.fn((callback: (timestamp: number) => void) => {
    frameCallbacks.push(callback)
    return frameCallbacks.length
  })
  const cancelAnimationFrame = vi.fn()
  const setInterval = vi.fn((callback: () => void, _delay: number) => {
    intervalCallbacks.push(callback)
    return intervalCallbacks.length as unknown as ReturnType<typeof globalThis.setInterval>
  })
  const clearInterval = vi.fn()
  const setTimeout = vi.fn((callback: () => void, _delay: number) => {
    timeoutCallbacks.push(callback)
    return timeoutCallbacks.length as unknown as ReturnType<typeof globalThis.setTimeout>
  })
  const clearTimeout = vi.fn()

  return {
    frameCallbacks,
    intervalCallbacks,
    timeoutCallbacks,
    requestAnimationFrame,
    cancelAnimationFrame,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout
  }
}

afterEach(() => {
  TestPerformanceObserver.instances = []
  vi.restoreAllMocks()
})

describe('RuntimePerformanceMonitor', () => {
  it('does not install observers or timers when capture is disabled', () => {
    const recorder = createRecorder(false)
    const schedulers = createSchedulers()
    const monitor = new RuntimePerformanceMonitor({
      recorder,
      performanceObserver: TestPerformanceObserver,
      ...schedulers
    })

    monitor.start()

    expect(TestPerformanceObserver.instances).toHaveLength(0)
    expect(schedulers.requestAnimationFrame).not.toHaveBeenCalled()
    expect(schedulers.setInterval).not.toHaveBeenCalled()
  })

  it('maps Event Timing input and GC entries to hard-gate samples', () => {
    const recorder = createRecorder()
    const monitor = new RuntimePerformanceMonitor({
      recorder,
      performanceObserver: TestPerformanceObserver,
      ...createSchedulers()
    })

    monitor.start()

    expect(TestPerformanceObserver.instances).toHaveLength(2)
    TestPerformanceObserver.instances[0]?.emit({
      entryType: 'event',
      name: 'keydown',
      startTime: 10,
      duration: 7
    } as PerformanceEntry)
    TestPerformanceObserver.instances[1]?.emit({
      entryType: 'gc',
      name: 'major',
      startTime: 20,
      duration: 75
    } as PerformanceEntry)

    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.input.latency',
      'ms',
      7,
      expect.objectContaining({ phase: 'editor' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.gc.stall',
      'ms',
      75,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.gc.over50',
      'count',
      1,
      expect.objectContaining({ phase: 'memory' })
    )
    monitor.dispose()
  })

  it('samples frame timing and renderer heap without creating work while disabled', () => {
    const recorder = createRecorder()
    const schedulers = createSchedulers()
    const performance = {
      now: vi.fn(() => 100),
      timeOrigin: 1_700_000_000_000,
      memory: {
        usedJSHeapSize: 12_000,
        totalJSHeapSize: 20_000
      }
    }
    const monitor = new RuntimePerformanceMonitor({
      recorder,
      performance,
      performanceObserver: null,
      ...schedulers
    })

    monitor.start()
    schedulers.frameCallbacks[0]?.(0)
    schedulers.frameCallbacks[1]?.(16.5)
    schedulers.frameCallbacks[2]?.(50)
    schedulers.intervalCallbacks[0]?.()

    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.frame.duration',
      'ms',
      16.5,
      expect.objectContaining({ phase: 'editor' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.frame.over16_7',
      'ratio',
      0,
      expect.objectContaining({ phase: 'editor' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.frame.over33',
      'ratio',
      1,
      expect.objectContaining({ phase: 'editor' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'memory.renderer.usedHeap',
      'bytes',
      12_000,
      expect.objectContaining({ phase: 'memory' })
    )

    monitor.dispose()
    expect(schedulers.cancelAnimationFrame).toHaveBeenCalled()
    expect(schedulers.clearInterval).toHaveBeenCalled()
    expect(TestPerformanceObserver.instances).toHaveLength(0)
  })
  it('records event-loop lag, rolling heap growth, and forced reflow signals', () => {
    const recorder = createRecorder()
    const schedulers = createSchedulers()
    let now = 0
    let usedHeap = 100
    const performance = {
      now: vi.fn(() => now),
      timeOrigin: 1_700_000_000_000,
      memory: {
        get usedJSHeapSize() {
          return usedHeap
        },
        totalJSHeapSize: 200
      }
    }
    const monitor = new RuntimePerformanceMonitor({
      recorder,
      performance,
      performanceObserver: null,
      ...schedulers,
      eventLoopSampleIntervalMs: 10,
      memorySampleIntervalMs: 250
    })

    monitor.start()
    now = 100
    schedulers.timeoutCallbacks[0]?.()
    now = 135
    schedulers.timeoutCallbacks[1]?.()
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.main.block',
      'ms',
      25,
      expect.objectContaining({ phase: 'editor' })
    )

    monitor.markDomWrite()
    monitor.markLayoutRead()
    schedulers.frameCallbacks[0]?.(0)
    schedulers.frameCallbacks[1]?.(16)
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'core.forcedReflow',
      'count',
      1,
      expect.objectContaining({ phase: 'editor' })
    )

    for (let index = 0; index < 50; index += 1) {
      usedHeap = 100 + index
      schedulers.intervalCallbacks[0]?.()
    }

    expect(recorder.recordSample).toHaveBeenCalledWith(
      'memory.heapGrowth50',
      'ratio',
      0.49,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'memory.heapLinearGrowth',
      'count',
      1,
      expect.objectContaining({ phase: 'memory' })
    )
    monitor.dispose()
  })
})
