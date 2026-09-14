import { PERFORMANCE_EVENT_CHANNEL } from '@shared/types/performance'
import { createRendererPerformanceRecorder } from './renderer'
import { RuntimePerformanceMonitor } from './runtimeMonitor'
import { createPerformanceGateBridge } from './gateBridge'

const electronApi = (
  globalThis as typeof globalThis & {
    electron?: ElectronAPI
  }
).electron

/**
 * Renderer-side singleton for the current BrowserWindow. The preload boot
 * context supplies the main-process trace id; all output remains best-effort
 * and is sent through the existing typed IPC wrapper only when capture is on.
 */
export const rendererPerformance = createRendererPerformanceRecorder({
  enabled: electronApi?.performance?.enabled === true,
  traceId: electronApi?.performance?.traceId,
  sink: (event) => {
    electronApi?.ipcRenderer.send(PERFORMANCE_EVENT_CHANNEL, event)
  },
  longTaskContext: () => ({
    phase: 'editor'
  })
})

export const rendererPerformanceMonitor = new RuntimePerformanceMonitor({
  recorder: rendererPerformance
})

rendererPerformanceMonitor.start()

/**
 * E2E performance scenarios record timings measured around real user actions
 * through this same renderer recorder. It is exposed only for opt-in capture;
 * production runs have no global harness surface.
 */
export const rendererPerformanceGate = createPerformanceGateBridge(rendererPerformance)
if (rendererPerformance.enabled && typeof window !== 'undefined') {
  window.__inkivaPerformanceGate = rendererPerformanceGate
}
