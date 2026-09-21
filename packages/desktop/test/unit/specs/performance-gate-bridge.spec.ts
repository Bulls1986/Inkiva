import { expect, it, vi } from 'vitest'
import { createPerformanceGateBridge } from '@/services/performance/gateBridge'

it('forwards real samples with an explicit phase and metadata', () => {
  const calls: Array<{
    metric: string
    unit: 'ms' | 'count' | 'bytes' | 'ratio'
    value: number
    phase: string
    metadata?: Record<string, unknown>
  }> = []
  const bridge = createPerformanceGateBridge({
    enabled: true,
    recordSample(metric, unit, value, context) {
      calls.push({ metric, unit, value, phase: context.phase, metadata: context.metadata })
    }
  })

  bridge.recordSample('core.ui.action', 'ms', 12.5, {
    phase: 'editor',
    metadata: { action: 'open-outline' }
  })

  expect(calls).toEqual([{
    metric: 'core.ui.action',
    unit: 'ms',
    value: 12.5,
    phase: 'editor',
    metadata: { action: 'open-outline' }
  }])
})

it('flushes only the explicit gate-event transport after each gate sample', () => {
  const flush = vi.fn()
  const bridge = createPerformanceGateBridge({
    enabled: true,
    recordSample: vi.fn()
  }, flush)

  bridge.recordSample('document.50k.scrollFps', 'count', 57)

  expect(flush).toHaveBeenCalledOnce()
})

it('does not call a disabled recorder', () => {
  let calls = 0
  const bridge = createPerformanceGateBridge({
    enabled: false,
    recordSample() {
      calls += 1
    }
  })

  bridge.recordSample('core.ui.action', 'ms', 1)
  expect(calls).toBe(0)
})

it('uses editor as the default phase for custom UI samples', () => {
  let phase = ''
  const bridge = createPerformanceGateBridge({
    enabled: true,
    recordSample(_metric, _unit, _value, context) {
      phase = context.phase
    }
  })

  bridge.recordSample('core.ui.action', 'ms', 1)
  expect(phase).toBe('editor')
})
