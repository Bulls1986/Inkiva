import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainProcessPerformanceMonitor } from 'main_renderer/performance/processMonitor'

const createRecorder = (enabled = true) => ({
  enabled,
  recordSample: vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MainProcessPerformanceMonitor', () => {
  it('does not poll Electron metrics when capture is disabled', () => {
    const setInterval = vi.fn()
    const monitor = new MainProcessPerformanceMonitor({
      recorder: createRecorder(false),
      source: {
        getAppMetrics: () => [],
        getProcessMemoryInfo: async() => ({})
      },
      setInterval
    })

    monitor.start()

    expect(setInterval).not.toHaveBeenCalled()
  })

  it('converts renderer CPU and process memory into bounded gate samples', async() => {
    const intervalCallbacks: Array<() => void> = []
    const setInterval = vi.fn((callback: () => void) => {
      intervalCallbacks.push(callback)
      return intervalCallbacks.length as unknown as ReturnType<typeof globalThis.setInterval>
    })
    const recorder = createRecorder()
    const monitor = new MainProcessPerformanceMonitor({
      recorder,
      source: {
        getAppMetrics: () => [
          { type: 'Browser', cpu: { percentCPUUsage: 90 } },
          { type: 'Renderer', cpu: { percentCPUUsage: 1.5 } },
          { type: 'Tab', cpu: { percentCPUUsage: 0.4 } }
        ],
        getProcessMemoryInfo: async() => ({
          privateBytes: 10,
          workingSetSize: 12
        })
      },
      setInterval
    })

    monitor.start()
    intervalCallbacks[0]?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(recorder.recordSample).toHaveBeenCalledWith(
      'background.rendererIdleCpu',
      'ratio',
      0.019,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'background.tabCpu',
      'ratio',
      0.015,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'memory.main.privateBytes',
      'bytes',
      10_240,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'memory.main.workingSetBytes',
      'bytes',
      12_288,
      expect.objectContaining({ phase: 'memory' })
    )
  })
  it('emits stability heartbeats and flags sustained renderer CPU runaway', async() => {
    const intervalCallbacks: Array<() => void> = []
    const setInterval = vi.fn((callback: () => void) => {
      intervalCallbacks.push(callback)
      return intervalCallbacks.length as unknown as ReturnType<typeof globalThis.setInterval>
    })
    const recorder = createRecorder()
    const monitor = new MainProcessPerformanceMonitor({
      recorder,
      source: {
        getAppMetrics: () => [{ type: 'Renderer', cpu: { percentCPUUsage: 90 } }],
        getProcessMemoryInfo: async() => ({})
      },
      setInterval,
      cpuRunawaySamples: 2
    })

    monitor.start()
    intervalCallbacks[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    intervalCallbacks[0]?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(recorder.recordSample).toHaveBeenCalledWith(
      'stability.crash',
      'count',
      0,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'stability.cpuRunaway',
      'count',
      1,
      expect.objectContaining({ phase: 'memory' })
    )
    monitor.dispose()
  })

  it('records renderer crash, OOM, and hang signals as hard-gate samples', () => {
    const recorder = createRecorder()
    const monitor = new MainProcessPerformanceMonitor({
      recorder,
      source: {
        getAppMetrics: () => [],
        getProcessMemoryInfo: async() => ({})
      }
    })

    monitor.recordRendererCrash(false)
    monitor.recordRendererCrash(true)
    monitor.recordRendererHang()

    expect(recorder.recordSample).toHaveBeenCalledWith(
      'stability.rendererCrash',
      'count',
      1,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'stability.oom',
      'count',
      1,
      expect.objectContaining({ phase: 'memory' })
    )
    expect(recorder.recordSample).toHaveBeenCalledWith(
      'stability.rendererHang',
      'count',
      1,
      expect.objectContaining({ phase: 'memory' })
    )
  })


})
