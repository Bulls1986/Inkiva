import {
  PERFORMANCE_EVENT_CHANNEL,
  PERFORMANCE_FRAME_SAMPLE_CHANNEL,
  type PerformanceFrameSampleTuple
} from '@shared/types/performance'
import { createRendererPerformanceRecorder } from './renderer'
import { RuntimePerformanceMonitor } from './runtimeMonitor'
import { createPerformanceGateBridge } from './gateBridge'
import { createBatchedPerformanceEventSink, createBatchedSink } from './batchedSink'

const electronApi = (
  globalThis as typeof globalThis & {
    electron?: ElectronAPI
  }
).electron

const configuredSampleInterval = Number(
  electronApi?.process?.env.INKIVA_PERF_SAMPLE_INTERVAL_MS ?? ''
)
const sampleIntervalMs =
  Number.isFinite(configuredSampleInterval) && configuredSampleInterval > 0
    ? Math.max(250, Math.floor(configuredSampleInterval))
    : 1_000

const rendererPerformanceTransport = createBatchedPerformanceEventSink({
  flushIntervalMs: sampleIntervalMs,
  maxBatchSize: 256,
  send: (events) => {
    electronApi?.ipcRenderer?.send(PERFORMANCE_EVENT_CHANNEL, events)
  }
})

/**
 * Renderer-side singleton for the current BrowserWindow. The preload boot
 * context supplies the main-process trace id; all output remains best-effort
 * and is sent through the existing typed IPC wrapper only when capture is on.
 */
export const rendererPerformance = createRendererPerformanceRecorder({
  enabled: electronApi?.performance?.enabled === true,
  traceId: electronApi?.performance?.traceId,
  sink: (event) => rendererPerformanceTransport.push(event),
  longTaskContext: () => ({
    phase: 'editor'
  })
})

const rendererFrameTransport = createBatchedSink<PerformanceFrameSampleTuple>({
  flushIntervalMs: sampleIntervalMs,
  maxBatchSize: 4096,
  send: (samples) => {
    electronApi?.ipcRenderer?.send(PERFORMANCE_FRAME_SAMPLE_CHANNEL, {
      traceId: rendererPerformance.traceId,
      samples
    })
  }
})

const canUseCompactFrameTransport =
  rendererPerformance.enabled &&
  rendererPerformance.timeOriginEpochMs !== undefined &&
  rendererPerformance.startedAtEpochMs !== undefined

export const rendererPerformanceMonitor = new RuntimePerformanceMonitor({
  recorder: rendererPerformance,
  memorySampleIntervalMs: sampleIntervalMs,
  frameSampleSink: canUseCompactFrameTransport
    ? ({ timestamp, duration, forcedReflows, longTaskObserverAvailable }) => {
        const timestampEpochMs = rendererPerformance.timeOriginEpochMs! + timestamp
        rendererFrameTransport.push([
          timestampEpochMs,
          Math.max(0, timestampEpochMs - rendererPerformance.startedAtEpochMs!),
          duration,
          forcedReflows,
          longTaskObserverAvailable ? 1 : 0
        ])
      }
    : undefined
})

rendererPerformanceMonitor.start()

/**
 * E2E performance scenarios record timings measured around real user actions
 * through this same renderer recorder. It is exposed only for opt-in capture;
 * production runs have no global harness surface.
 */
const flushPerformanceCapture = (): void => {
  rendererFrameTransport.flush()
  rendererPerformanceTransport.flush()
}

export const rendererPerformanceGate = createPerformanceGateBridge(
  rendererPerformance,
  () => rendererPerformanceTransport.flush()
)
if (rendererPerformance.enabled && typeof window !== 'undefined') {
  window.__inkivaPerformanceGate = rendererPerformanceGate
  window.addEventListener('pagehide', flushPerformanceCapture)
  window.addEventListener('beforeunload', flushPerformanceCapture)
}
