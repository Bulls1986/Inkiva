import { ipcMain } from 'electron'
import {
  PERFORMANCE_EVENT_CHANNEL,
  PERFORMANCE_FRAME_SAMPLE_CHANNEL
} from '@shared/types/performance'
import { mainPerformance } from '../performance/runtime'

/**
 * Renderer diagnostics are untrusted IPC input. The coordinator performs the
 * schema, trace ownership, and bounded-event checks; this handler must remain
 * a non-throwing boundary so malformed diagnostics cannot crash the app.
 */
export const registerPerformanceHandlers = (): void => {
  ipcMain.on(PERFORMANCE_EVENT_CHANNEL, (_event, payload: unknown) => {
    try {
      mainPerformance.recordRendererEvents(payload)
    } catch {
      // Performance diagnostics are best-effort and must never affect editing.
    }
  })
  ipcMain.on(PERFORMANCE_FRAME_SAMPLE_CHANNEL, (_event, payload: unknown) => {
    try {
      mainPerformance.recordRendererFrameSamples(payload)
    } catch {
      // Performance diagnostics are best-effort and must never affect editing.
    }
  })
}
