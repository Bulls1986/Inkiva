import type { PerformanceSampleCollector } from './runner.js'

export interface PerformanceReportMetricEvent {
  name?: unknown
  metadata?: unknown
}

export interface PerformanceReportTrace {
  events?: unknown
}

export interface PerformanceReportInput {
  traces?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isUnit = (value: unknown): value is 'ms' | 'count' | 'bytes' | 'ratio' =>
  value === 'ms' || value === 'count' || value === 'bytes' || value === 'ratio'

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Convert the local desktop/renderer trace into the raw metric series used by
 * the release gate. Unknown event kinds are ignored, but a malformed
 * metric_sample is rejected so unsupported capture cannot silently pass.
 */
export const collectPerformanceReportSamples = (
  report: unknown,
  collector: PerformanceSampleCollector
): void => {
  if (!isRecord(report) || !Array.isArray(report.traces)) {
    throw new Error('performance report traces must be an array')
  }

  for (const trace of report.traces) {
    if (!isRecord(trace) || !Array.isArray(trace.events)) {
      throw new Error('performance trace events must be an array')
    }

    for (const event of trace.events) {
      if (!isRecord(event) || event.name !== 'metric_sample') continue
      if (!isRecord(event.metadata)) {
        throw new Error('metric_sample metadata must be an object')
      }

      const metric = event.metadata.metric
      const unit = event.metadata.unit
      const value = event.metadata.value
      if (typeof metric !== 'string' || metric.trim() === '') {
        throw new Error('metric_sample metric must be a non-empty string')
      }
      if (!isUnit(unit)) {
        throw new Error('metric_sample unit is invalid')
      }
      if (!isFiniteNonNegative(value)) {
        throw new Error('metric_sample value must be finite and non-negative')
      }
      collector.add(metric, unit, value)
    }
  }
}
