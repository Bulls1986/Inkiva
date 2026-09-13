import { createMainPerformanceCoordinator } from './index'
import { resolvePerformanceCaptureConfig } from './config'

const captureConfig = resolvePerformanceCaptureConfig(process.env)

/**
 * One coordinator for the lifetime of the main process. The renderer receives
 * its trace id and the main clock's epoch origin through boot-info, while all
 * report writes remain opt-in via INKIVA_PERF_REPORT_DIR.
 */
export const mainPerformance = createMainPerformanceCoordinator({
  enabled: captureConfig.enabled,
  reportDirectory: captureConfig.reportDirectory
})

mainPerformance.mark('process_entry', {
  phase: 'startup',
  metadata: {
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch
  }
})

export { captureConfig }
