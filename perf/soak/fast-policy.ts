export const FAST_GATE_MODE = 'pr-smoke' as const
export const FAST_GATE_DURATION_MS = 10 * 60 * 1000
export const FAST_GATE_WORKFLOW_TIMEOUT_MINUTES = 15
export const FAST_GATE_HEARTBEAT_INTERVAL_MS = 1000

/**
 * These are the minimum metric families that the PR fast gate must observe.
 * The evaluator treats every one as a hard gate and fails closed when a
 * series is missing, malformed, or has fewer than twenty samples.
 */
export const FAST_GATE_REQUIRED_METRICS = [
  'document.50k.firstScreen',
  'document.50k.editable',
  'core.input.latency',
  'document.50k.scrollFps',
  'diagram.placeholder',
  'diagram.firstScreenSyncRender',
  'image.offscreenRequest',
  'image.offscreenDecode',
  'search.folder.firstBatch',
  'save.50k',
  'tabs.8.warmSwitch',
  'tabs.8.coldSwitch',
  'tabs.8.switch',
  'tabs.8.freeze',
  'memory.heapGrowth50',
  'memory.heapLinearGrowth',
  'stability.crash',
  'stability.rendererCrash',
  'stability.oom',
  'stability.cpuRunaway',
  'stability.rendererHang'
] as const

export type FastGateMode = typeof FAST_GATE_MODE
export type FastGateEnvironment = NodeJS.ProcessEnv & {
  INKIVA_PERF_MODE?: string
  INKIVA_PERF_RUNNER_LABEL?: string
}

export const resolveFastGateMode = (
  environment: FastGateEnvironment = process.env as FastGateEnvironment
): FastGateMode => {
  if (environment.INKIVA_PERF_MODE !== FAST_GATE_MODE) {
    throw new Error('only pr-smoke performance mode is supported')
  }
  return FAST_GATE_MODE
}

export const resolveFastGateDurationMs = (
  environment: FastGateEnvironment = process.env as FastGateEnvironment
): number => {
  resolveFastGateMode(environment)
  return FAST_GATE_DURATION_MS
}
