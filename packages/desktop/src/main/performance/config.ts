export interface PerformanceCaptureConfig {
  enabled: boolean
  reportDirectory: string | null
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

  return { enabled, reportDirectory }
}
