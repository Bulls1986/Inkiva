import { app } from 'electron'
import { createMainPerformanceCoordinator } from './index'
import { MainProcessPerformanceMonitor } from './processMonitor'
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

export const mainProcessPerformanceMonitor = new MainProcessPerformanceMonitor({
  recorder: mainPerformance,
  source: {
    getAppMetrics: () => app.getAppMetrics(),
    getProcessMemoryInfo: () => {
      const electronProcess = process as typeof process & {
        getProcessMemoryInfo?: () => Promise<{ privateBytes?: number; workingSetSize?: number }>
      }
      return electronProcess.getProcessMemoryInfo
        ? electronProcess.getProcessMemoryInfo()
        : Promise.resolve({})
    }
  }
})

mainProcessPerformanceMonitor.start()
