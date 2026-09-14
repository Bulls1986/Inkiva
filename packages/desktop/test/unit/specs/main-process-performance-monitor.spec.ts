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
        getProcessMemoryInfo: async () => ({})
      },
      setInterval
    })

    monitor.start()

    expect(setInterval).not.toHaveBeenCalled()
  })

  it('converts renderer CPU and process memory into bounded gate samples', async () => {
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
        getProcessMemoryInfo: async () => ({
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
})
