import type {
  PerformancePhase,
  PerformanceSampleUnit
} from '@shared/types/performance'
import type {
  RendererPerformanceContext,
  RendererPerformanceRecorder
} from './renderer'

export type PerformanceGateRecorder = Pick<
  RendererPerformanceRecorder,
  'enabled' | 'recordSample'
>

export interface PerformanceGateSampleOptions {
  phase?: PerformancePhase
  metadata?: Record<string, unknown>
}

export interface PerformanceGateBridge {
  recordSample(
    metric: string,
    unit: PerformanceSampleUnit,
    value: number,
    options?: PerformanceGateSampleOptions
  ): void
}

/**
 * Keep test-harness measurements on the same recorder and IPC path as the
 * runtime probes. A disabled capture has no recorder call and therefore no
 * hot-path work.
 */
export const createPerformanceGateBridge = (
  recorder: PerformanceGateRecorder
): PerformanceGateBridge => ({
  recordSample(metric, unit, value, options = {}): void {
    if (!recorder.enabled) return
    const context: RendererPerformanceContext = {
      phase: options.phase ?? 'editor',
      ...(options.metadata === undefined ? {} : { metadata: options.metadata })
    }
    recorder.recordSample(metric, unit, value, context)
  }
})
