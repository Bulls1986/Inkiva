export const SOAK_DURATION_MS = 8 * 60 * 60 * 1000
export const SOAK_PR_SMOKE_DURATION_MS = 10 * 60 * 1000
export const SOAK_WORKFLOW_TIMEOUT_MINUTES = 510
export const SOAK_HEARTBEAT_INTERVAL_MS = 1000

export interface SoakDurationEnvironment {
  INKIVA_PERF_SOAK_MODE?: string
  [key: string]: string | undefined
}

export const resolveSoakDurationMs = (
  environment: SoakDurationEnvironment = process.env
): number => environment.INKIVA_PERF_SOAK_MODE === 'pr-smoke'
  ? SOAK_PR_SMOKE_DURATION_MS
  : SOAK_DURATION_MS
