export const DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS = 1_000
export const MIN_PERFORMANCE_SAMPLE_INTERVAL_MS = 250
export const DEFAULT_MAX_RENDERER_EVENTS = 10_000
export const MAX_MAX_RENDERER_EVENTS = 100_000

export interface PerformanceCaptureConfig {
  enabled: boolean
  reportDirectory: string | null
  sampleIntervalMs: number
  maxRendererEvents: number
}

const parseSampleInterval = (value: string | undefined): number => {
  if (value === undefined || value.trim() === '') return DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS
  return Math.max(MIN_PERFORMANCE_SAMPLE_INTERVAL_MS, Math.floor(parsed))
}

const parseMaxRendererEvents = (value: string | undefined): number => {
  if (value === undefined || value.trim() === '') return DEFAULT_MAX_RENDERER_EVENTS
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_RENDERER_EVENTS
  return Math.min(MAX_MAX_RENDERER_EVENTS, Math.max(1, Math.floor(parsed)))
}

/**
 * Resolve local performance capture without ever enabling a network sink.
 *
 * Development and explicitly enabled performance runs collect in memory so
 * the normal editor path remains free of diagnostic work. A report directory
 * is only used when the caller explicitly provides INKIVA_PERF_REPORT_DIR.
 */
export const resolvePerformanceCaptureConfig = (
  env: Record<string, string | undefined>
): PerformanceCaptureConfig => {
  const explicitlyDisabled = env.INKIVA_PERF_CAPTURE === 'false'
  const enabled =
    !explicitlyDisabled &&
    (env.INKIVA_PERF_CAPTURE === 'true' || env.NODE_ENV === 'development')
  const reportDirectory =
    enabled && env.INKIVA_PERF_REPORT_DIR?.trim() ? env.INKIVA_PERF_REPORT_DIR.trim() : null

  return {
    enabled,
    reportDirectory,
    sampleIntervalMs: parseSampleInterval(env.INKIVA_PERF_SAMPLE_INTERVAL_MS),
    maxRendererEvents: parseMaxRendererEvents(env.INKIVA_PERF_MAX_RENDERER_EVENTS)
  }
}
